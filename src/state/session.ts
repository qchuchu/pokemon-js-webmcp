import { createClient, RealtimeChannel } from "@supabase/supabase-js";
import { AnyAction, Middleware } from "@reduxjs/toolkit";
import { GameState } from "./state-types";
import { BattleState } from "./battleSlice";

const url = process.env.REACT_APP_SUPABASE_URL;
const anonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

export const ROOM =
  new URLSearchParams(window.location.search).get("room") ||
  process.env.REACT_APP_ROOM ||
  "kanto";

export const AGENT_ID = `agent-${Math.random().toString(36).slice(2, 8)}`;

export interface Peer {
  agentId: string;
  label: string;
  joinedAt: string;
}

export interface LogEntry {
  agentId: string;
  text: string;
  at: string;
}

/**
 * One shared world, one shared avatar: every tab reduces the same stream of
 * game actions, so whoever is connected is driving the same trainer.
 *
 * The `game` and `battle` slices travel. Both are plain serialisable data
 * (position, map, party, bag, flags, and the battle state machine). The `ui`
 * slice holds live callbacks and per-view cursor state, so each agent keeps its
 * own menus and its own place in a dialogue.
 */
const SHARED_PREFIXES = ["game/", "battle/"];

// Set while applying a remote action, so we never echo it back to the room.
let applyingRemote = false;

let channel: RealtimeChannel | null = null;
let peers: Peer[] = [];
let log: LogEntry[] = [];
let label = AGENT_ID;
let hydrated = false;
// send() silently falls back to REST until the socket has joined, which would
// turn every walk step into an HTTP request. Nothing goes out before this.
let joined = false;

export const isShared = () => !!url && !!anonKey;

// Plain subscription rather than Redux: presence is per-tab knowledge about
// the room, not part of the world every agent shares.
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((listener) => listener());

export const subscribePeers = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

// Stable reference between presence syncs, which useSyncExternalStore requires.
export const listPeers = (): Peer[] => peers;

/**
 * Exactly one tab drives the world's emergent logic: encounter rolls, battle
 * choreography, map transitions. Everyone shares one avatar, so if every tab
 * ran those timers each would roll its own wild Pokemon and each would
 * broadcast its own map change.
 *
 * The oldest peer wins, tie-broken on id, so every tab derives the same answer
 * from the same presence state without any negotiation. When the driver leaves,
 * presence syncs and the next one takes over on its own.
 */
export const pickDriver = (candidates: Peer[]): string | null => {
  if (candidates.length === 0) return null;
  const [first] = [...candidates].sort((a, b) =>
    a.joinedAt === b.joinedAt
      ? a.agentId.localeCompare(b.agentId)
      : a.joinedAt.localeCompare(b.joinedAt)
  );
  return first.agentId;
};

export const isDriver = (): boolean => {
  // Nobody to coordinate with, so drive everything.
  if (!isShared()) return true;
  return pickDriver(peers) === AGENT_ID;
};

export const readLog = (limit = 20): LogEntry[] => log.slice(-limit);

const appendLog = (entry: LogEntry) => {
  log = [...log, entry].slice(-200);
};

export const setAgentLabel = (next: string) => {
  label = next;
  if (joined) {
    channel?.track({
      agentId: AGENT_ID,
      label,
      joinedAt: new Date().toISOString(),
    });
  }
};

export const say = (text: string) => {
  const entry: LogEntry = { agentId: label, text, at: new Date().toISOString() };
  appendLog(entry);
  if (joined) channel?.send({ type: "broadcast", event: "note", payload: entry });
};

export const sharedActionMiddleware: Middleware = () => (next) => (action) => {
  const result = next(action);
  const typed = action as AnyAction;
  if (
    channel &&
    joined &&
    !applyingRemote &&
    typeof typed.type === "string" &&
    SHARED_PREFIXES.some((prefix) => typed.type.startsWith(prefix))
  ) {
    channel.send({
      type: "broadcast",
      event: "action",
      payload: { from: AGENT_ID, action: typed },
    });
  }
  return result;
};

export interface SharedState {
  game: GameState;
  battle: BattleState;
}

export const connectSession = (
  dispatch: (action: AnyAction) => void,
  getSharedState: () => SharedState
) => {
  if (!isShared()) return () => {};

  // No auth is used, and persisting a session would make every tab in this
  // browser share one storage key.
  const client = createClient(url as string, anonKey as string, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      storageKey: `pokemon-${AGENT_ID}`,
    },
  });
  channel = client.channel(`pokemon:${ROOM}`, {
    config: { broadcast: { self: false }, presence: { key: AGENT_ID } },
  });

  channel.on("broadcast", { event: "action" }, ({ payload }) => {
    if (!payload || payload.from === AGENT_ID) return;
    applyingRemote = true;
    try {
      dispatch(payload.action);
    } finally {
      applyingRemote = false;
    }
  });

  channel.on("broadcast", { event: "note" }, ({ payload }) => {
    if (payload) appendLog(payload as LogEntry);
  });

  // A late joiner has an empty Pallet Town; whoever is already playing answers
  // with the live world. First answer wins, extras are ignored.
  channel.on("broadcast", { event: "request-state" }, ({ payload }) => {
    if (!payload || payload.from === AGENT_ID) return;
    channel?.send({
      type: "broadcast",
      event: "state",
      payload: { from: AGENT_ID, to: payload.from, state: getSharedState() },
    });
  });

  channel.on("broadcast", { event: "state" }, ({ payload }) => {
    if (!payload || payload.to !== AGENT_ID || hydrated) return;
    hydrated = true;
    applyingRemote = true;
    try {
      dispatch({ type: "game/hydrate", payload: payload.state.game });
      dispatch({ type: "battle/hydrateBattle", payload: payload.state.battle });
    } finally {
      applyingRemote = false;
    }
  });

  // `state` fires whenever anyone joins or leaves, so one handler is enough.
  channel.on("presence", { event: "sync" }, () => {
    const presence = channel?.presenceState() ?? {};
    peers = Object.values(presence).flat() as unknown as Peer[];
    notify();
  });

  channel.subscribe((status) => {
    if (status !== "SUBSCRIBED") return;
    joined = true;
    channel?.track({
      agentId: AGENT_ID,
      label,
      joinedAt: new Date().toISOString(),
    });
    channel?.send({
      type: "broadcast",
      event: "request-state",
      payload: { from: AGENT_ID },
    });
  });

  return () => {
    channel?.unsubscribe();
    channel = null;
    hydrated = false;
    joined = false;
    peers = [];
    notify();
  };
};
