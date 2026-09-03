import { createClient, RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
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
  /** Display name, chosen by whoever posted. Not an identity. */
  agentId: string;
  /** The posting tab, so a tab never gets handed back its own note. */
  sender?: string;
  text: string;
  at: string;
}

/**
 * Who is allowed to drive right now. Coordination, not world state, so it lives
 * here rather than in the store: a tab that misses it is briefly out of date,
 * which is cheaper than making it part of the shared save file.
 */
export interface Lease {
  agentId: string;
  label: string;
  reason: string;
  /** ISO time the claim lapses on its own. */
  until: string;
  /** A person's claim outranks an agent's and is taken, not requested. */
  human: boolean;
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
// How much of the log this tab has already been handed by a tool response.
let delivered = 0;
let lease: Lease | null = null;
let label = AGENT_ID;
let hydrated = false;
let client: SupabaseClient | null = null;
// Nothing is written back until the room has been restored (or confirmed
// empty). Otherwise the first tab to join would save its fresh Pallet Town
// over the world everyone left behind.
let restored = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let readSharedState: (() => SharedState) | null = null;
// send() silently falls back to REST until the socket has joined, which would
// turn every walk step into an HTTP request. Nothing goes out before this.
let joined = false;
// Whether this tab knows what the world looks like. Until it does the store
// still holds a fresh Pallet Town, which is not the world anyone is playing.
let ready = false;

export const isShared = () => !!url && !!anonKey;

// Plain subscription rather than Redux: presence is per-tab knowledge about
// the room, not part of the world every agent shares.
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((listener) => listener());

export const subscribeSession = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

// Stable reference between presence syncs, which useSyncExternalStore requires.
export const listPeers = (): Peer[] => peers;

/**
 * True once this tab knows the world: it was handed the live state, loaded the
 * save, or established there is nothing to load. Rendering before this shows
 * the initial Pallet Town and then snaps to the real world a moment later.
 */
export const isReady = () => !isShared() || ready;

const markReady = () => {
  if (ready) return;
  ready = true;
  notify();
};

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
  const dropped = Math.max(0, log.length + 1 - 200);
  log = [...log, entry].slice(-200);
  delivered = Math.max(0, delivered - dropped);
  notify();
};

/**
 * A stable reference, which useSyncExternalStore requires: readLog() slices, so
 * it returns a fresh array every call and would re-render for ever.
 */
export const getLog = (): LogEntry[] => log;

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
  const entry: LogEntry = {
    agentId: label,
    sender: AGENT_ID,
    text,
    at: new Date().toISOString(),
  };
  appendLog(entry);
  // Nothing this tab said needs handing back to it as news.
  delivered = log.length;
  if (joined) channel?.send({ type: "broadcast", event: "note", payload: entry });
};

/**
 * Notes posted since this tab was last handed any, and never its own.
 *
 * Tools return these alongside every result, because a note board nobody reads
 * is not a channel: an agent part-way through a plan does not stop to check its
 * messages, so the messages have to arrive where it is already looking.
 */
export const takeMessages = (): LogEntry[] => {
  const fresh = log.slice(delivered).filter((entry) => entry.sender !== AGENT_ID);
  delivered = log.length;
  return fresh;
};

const leaseHolder = (): Lease | null => {
  if (!lease) return null;
  if (Date.parse(lease.until) <= Date.now()) {
    lease = null;
    notify();
  }
  return lease;
};

export const readLease = (): Lease | null => leaseHolder();

/** Why a write is refused right now, or null when this tab may act. */
export const leaseBlocking = (): string | null => {
  const held = leaseHolder();
  if (!held || held.agentId === AGENT_ID) return null;
  const who = held.human ? `${held.label} (a person)` : held.label;
  const seconds = Math.max(0, Math.round((Date.parse(held.until) - Date.now()) / 1000));
  return `${who} is driving for the next ${seconds}s: ${held.reason}`;
};

const broadcastLease = () => {
  if (joined) {
    channel?.send({ type: "broadcast", event: "lease", payload: lease });
  }
  notify();
};

/**
 * Claim the avatar. A person's claim always lands; an agent's is refused while
 * someone else holds one, so taking a turn is asked for rather than assumed.
 */
export const takeControl = (
  reason: string,
  seconds: number,
  human = false
): { ok: boolean; message: string } => {
  const held = leaseHolder();
  if (held && held.agentId !== AGENT_ID && !human) {
    return { ok: false, message: leaseBlocking() as string };
  }
  lease = {
    agentId: AGENT_ID,
    label,
    reason,
    until: new Date(Date.now() + seconds * 1000).toISOString(),
    human,
  };
  broadcastLease();
  return {
    ok: true,
    message: `You are driving for ${seconds}s: ${reason}`,
  };
};

export const releaseControl = (force = false): string => {
  const held = leaseHolder();
  if (!held) return "Nobody was driving.";
  if (held.agentId !== AGENT_ID && !force) {
    return `Not yours to release - ${leaseBlocking()}`;
  }
  lease = null;
  broadcastLease();
  return "Released. Anyone may drive.";
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
    if (readSharedState) scheduleSave(readSharedState);
  }
  return result;
};

export interface SharedState {
  game: GameState;
  battle: BattleState;
}

const SAVE_DEBOUNCE = 2000;

// How long to let live peers answer before falling back to the database.
const HANDSHAKE_GRACE = 900;

// Upper bound on the loading screen when the socket or the query never answers.
const READY_TIMEOUT = 8000;

/**
 * The room is the save file. Only the driver writes, and only after the room
 * has been restored, so a late joiner can never clobber the shared world.
 * Debounced because a single walk across a map is dozens of actions.
 */
const scheduleSave = (getSharedState: () => SharedState) => {
  if (!client || !restored || !isDriver()) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    const { error } = await (client as SupabaseClient).from("rooms").upsert({
      id: ROOM,
      state: getSharedState(),
      updated_at: new Date().toISOString(),
    });
    if (error) console.warn("[pokemon] could not save room", error.message);
  }, SAVE_DEBOUNCE);
};

/** Load the room from the database when no one is already playing it. */
const restoreRoom = async (dispatch: (action: AnyAction) => void) => {
  if (!client || hydrated) return markReady();

  const { data, error } = await client
    .from("rooms")
    .select("state")
    .eq("id", ROOM)
    .maybeSingle();

  // A tab that answered the live handshake while this request was in flight
  // wins: its state is newer than anything on disk.
  if (hydrated) return markReady();

  if (error) {
    // Stay read-only rather than risk saving a fresh world over a real one.
    console.warn("[pokemon] could not load room", error.message);
    markReady();
    return;
  }

  if (data?.state) {
    const state = data.state as SharedState;
    applyingRemote = true;
    try {
      dispatch({ type: "game/hydrate", payload: state.game });
      dispatch({ type: "battle/hydrateBattle", payload: state.battle });
    } finally {
      applyingRemote = false;
    }
    hydrated = true;
  }

  // Either the room was loaded or it genuinely has no save yet.
  restored = true;
  markReady();
};

/** Flush the room now instead of waiting out the debounce. */
export const saveNow = async (): Promise<string> => {
  if (!isShared()) return "Running solo, so the room is not saved anywhere.";
  if (!client || !readSharedState) return "Not connected to the room yet.";
  if (!restored) return "Still catching up with the room, not saving yet.";

  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const { error } = await client.from("rooms").upsert({
    id: ROOM,
    state: readSharedState(),
    updated_at: new Date().toISOString(),
  });
  return error ? `Could not save: ${error.message}` : `Saved room "${ROOM}".`;
};

export const isRestored = () => restored;

// Whether this tab has already been counted as agent-driven.
let notedAgent = false;

/**
 * Records that this tab exists, and separately that something is driving it
 * through the tools. Two rows is all the usage data there is: no IP, no user
 * agent, nothing tied to a person - just enough to tell how many tabs joined
 * and how many of them brought an agent.
 *
 * Fire and forget on purpose. Stats are never worth failing a page load for,
 * and the table may not exist yet.
 */
const record = (kind: "connect" | "agent") => {
  if (!client) return;
  client
    .from("visits")
    .insert({ room: ROOM, agent_id: AGENT_ID, kind })
    .then(({ error }) => {
      if (error) console.warn("[pokemon] could not record a visit", error.message);
    });
};

/** Called by the tools, so a tab that is only ever watched is not counted. */
export const noteAgentActivity = () => {
  if (notedAgent || !client) return;
  notedAgent = true;
  record("agent");
};

export const connectSession = (
  dispatch: (action: AnyAction) => void,
  getSharedState: () => SharedState
) => {
  if (!isShared()) return () => {};

  readSharedState = getSharedState;

  // No auth is used, and persisting a session would make every tab in this
  // browser share one storage key.
  client = createClient(url as string, anonKey as string, {
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

  channel.on("broadcast", { event: "lease" }, ({ payload }) => {
    lease = (payload as Lease | null) ?? null;
    notify();
  });

  // A late joiner has an empty Pallet Town; whoever is already playing answers
  // with the live world. First answer wins, extras are ignored.
  channel.on("broadcast", { event: "request-state" }, ({ payload }) => {
    if (!payload || payload.from === AGENT_ID) return;
    channel?.send({
      type: "broadcast",
      event: "state",
      payload: {
        from: AGENT_ID,
        to: payload.from,
        state: getSharedState(),
        lease: leaseHolder(),
        log: log.slice(-30),
      },
    });
  });

  channel.on("broadcast", { event: "state" }, ({ payload }) => {
    if (!payload || payload.to !== AGENT_ID || hydrated) return;
    hydrated = true;
    // Catch up on the conversation and on whose turn it is, not just the world.
    if (payload.lease) lease = payload.lease as Lease;
    if (Array.isArray(payload.log)) {
      log = payload.log as LogEntry[];
      delivered = log.length;
    }
    applyingRemote = true;
    try {
      dispatch({ type: "game/hydrate", payload: payload.state.game });
      dispatch({ type: "battle/hydrateBattle", payload: payload.state.battle });
    } finally {
      applyingRemote = false;
    }
    // Someone live is further along than the database, so this tab is caught
    // up and may start saving.
    restored = true;
    markReady();
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
    record("connect");

    // Nobody answered, so the room is empty and the database holds the world.
    setTimeout(() => {
      restoreRoom(dispatch);
    }, HANDSHAKE_GRACE);
  });

  // A socket that never opens must not leave the loader up for ever: show the
  // world we have rather than nothing at all.
  const readyFallback = setTimeout(markReady, READY_TIMEOUT);

  return () => {
    clearTimeout(readyFallback);
    channel?.unsubscribe();
    channel = null;
    hydrated = false;
    joined = false;
    ready = false;
    restored = false;
    notedAgent = false;
    lease = null;
    delivered = 0;
    readSharedState = null;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    peers = [];
    notify();
  };
};
