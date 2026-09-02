import { createClient, RealtimeChannel } from "@supabase/supabase-js";
import { AnyAction, Middleware } from "@reduxjs/toolkit";
import { GameState } from "./state-types";

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
 * Only the `game` slice travels. It is plain serialisable data (position, map,
 * party, bag, flags). The `ui` slice holds live callbacks and per-view cursor
 * state, so each agent keeps its own menus and its own place in a dialogue.
 */
const SHARED_PREFIX = "game/";

// Set while applying a remote action, so we never echo it back to the room.
let applyingRemote = false;

let channel: RealtimeChannel | null = null;
let peers: Peer[] = [];
let log: LogEntry[] = [];
let label = AGENT_ID;
let hydrated = false;

export const isShared = () => !!url && !!anonKey;

export const listPeers = (): Peer[] => peers;

export const readLog = (limit = 20): LogEntry[] => log.slice(-limit);

const appendLog = (entry: LogEntry) => {
  log = [...log, entry].slice(-200);
};

export const setAgentLabel = (next: string) => {
  label = next;
  channel?.track({ agentId: AGENT_ID, label, joinedAt: new Date().toISOString() });
};

export const say = (text: string) => {
  const entry: LogEntry = { agentId: label, text, at: new Date().toISOString() };
  appendLog(entry);
  channel?.send({ type: "broadcast", event: "note", payload: entry });
};

export const sharedActionMiddleware: Middleware = () => (next) => (action) => {
  const result = next(action);
  const typed = action as AnyAction;
  if (
    channel &&
    !applyingRemote &&
    typeof typed.type === "string" &&
    typed.type.startsWith(SHARED_PREFIX)
  ) {
    channel.send({
      type: "broadcast",
      event: "action",
      payload: { from: AGENT_ID, action: typed },
    });
  }
  return result;
};

export const connectSession = (
  dispatch: (action: AnyAction) => void,
  getGameState: () => GameState
) => {
  if (!isShared()) return () => {};

  const client = createClient(url as string, anonKey as string);
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
      payload: { from: AGENT_ID, to: payload.from, game: getGameState() },
    });
  });

  channel.on("broadcast", { event: "state" }, ({ payload }) => {
    if (!payload || payload.to !== AGENT_ID || hydrated) return;
    hydrated = true;
    applyingRemote = true;
    try {
      dispatch({ type: "game/hydrate", payload: payload.game });
    } finally {
      applyingRemote = false;
    }
  });

  // `state` fires whenever anyone joins or leaves, so one handler is enough.
  channel.on("presence", { event: "sync" }, () => {
    const presence = channel?.presenceState() ?? {};
    peers = Object.values(presence).flat() as unknown as Peer[];
  });

  channel.subscribe((status) => {
    if (status !== "SUBSCRIBED") return;
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
  };
};
