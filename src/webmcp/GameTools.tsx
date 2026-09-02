import { useEffect } from "react";
import { z } from "zod";
import { useMcpTool } from "webmcp-react";
import emitter, { Event } from "../app/emitter";
import { MOVE_SPEED } from "../app/constants";
import { store } from "../state/store";
import {
  moveDown,
  moveLeft,
  moveRight,
  moveUp,
  setMoving,
  swapPokemonPositions,
} from "../state/gameSlice";
import { selectActiveMenu, selectFrozen } from "../state/uiSlice";
import { Direction, PosType } from "../state/state-types";
import findPath, { adjacentTiles } from "./pathfinding";
import {
  battlePhase,
  buildSnapshot,
  describeTile,
  facingOffset,
  MAP_LEGEND,
} from "./snapshot";
import {
  AGENT_ID,
  connectSession,
  isShared,
  listPeers,
  readLog,
  ROOM,
  say,
  saveNow,
  setAgentLabel,
} from "../state/session";

const ok = (payload: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
});

const fail = (message: string, payload?: unknown) => ({
  content: [
    {
      type: "text" as const,
      text: JSON.stringify({ error: message, ...(payload ?? {}) }, null, 2),
    },
  ],
  isError: true,
});

/**
 * Yield long enough for React to flush the dispatch and run the effects that
 * hang off it (encounter rolls, map transitions). Without this an agent firing
 * ten moves in one tick would have them batched into a single render and walk
 * straight through a patch of tall grass without rolling once.
 */
const settle = (ms = MOVE_SPEED) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const press = async (event: Event, ms?: number) => {
  emitter.emit(event);
  await settle(ms ?? 60);
};

/**
 * Battle choreography runs on its own timers and ignores A while it plays, so
 * a burst of presses on a fixed interval mostly lands on deaf frames. Wait for
 * a phase that actually wants input before spending the press.
 */
const awaitInput = async (budget = 4000) => {
  for (let waited = 0; waited < budget; waited += 60) {
    const state = store.getState();
    if (!state.game.pokemonEncounter) return;
    if (battlePhase(state.battle.stage) !== "animating") return;
    await settle(60);
  }
};

const summary = () => {
  const snapshot = buildSnapshot(store.getState());
  return {
    pos: snapshot.player.pos,
    map: snapshot.player.map,
    facing: snapshot.player.facing,
    screen: snapshot.screen,
    battle: snapshot.battle,
  };
};

const MOVES: Record<Direction, () => { type: string }> = {
  [Direction.Up]: moveUp,
  [Direction.Down]: moveDown,
  [Direction.Left]: moveLeft,
  [Direction.Right]: moveRight,
};

/** Anything that wants input before the avatar may walk again. */
const interruption = (): string | null => {
  const state = store.getState();
  if (state.ui.gameboyMenu) return "boot-screen";
  if (state.ui.titleMenu) return "title-screen";
  if (state.game.pokemonEncounter) return "wild-encounter";
  if (state.game.trainerEncounter) return "trainer-encounter";
  if (state.ui.text) return "dialogue";
  if (selectFrozen(state)) return "menu-open";
  return null;
};

const walkPath = async (path: Direction[]) => {
  const walked: Direction[] = [];
  store.dispatch(setMoving(true));
  try {
    for (const direction of path) {
      const blocked = interruption();
      if (blocked) {
        return { walked, stoppedBy: blocked, arrived: false };
      }

      const before = store.getState().game.pos;
      const mapBefore = store.getState().game.map;
      store.dispatch(MOVES[direction]());
      await settle();
      const after = store.getState().game.pos;

      if (store.getState().game.map !== mapBefore) {
        walked.push(direction);
        return { walked, stoppedBy: "changed-map", arrived: false };
      }
      if (after.x === before.x && after.y === before.y) {
        return { walked, stoppedBy: "blocked", arrived: false };
      }
      walked.push(direction);
    }
  } finally {
    store.dispatch(setMoving(false));
  }
  return { walked, stoppedBy: null, arrived: true };
};

const GameTools = () => {
  useEffect(
    () =>
      connectSession(
        (action) => store.dispatch(action),
        () => {
          const state = store.getState();
          return { game: state.game, battle: state.battle };
        }
      ),
    []
  );

  useMcpTool({
    name: "get_game_state",
    title: "Read the game",
    description:
      "Read everything currently true of the shared game: position, map, an " +
      "ASCII view of the surrounding tiles, the party and their moves, the " +
      "bag, and whatever is on screen (dialogue, menus, battle). Call this " +
      "before acting and after anything unexpected. While simply walking " +
      "around, prefer look, which returns the map without the party and bag. " +
      `Local map legend: ${MAP_LEGEND}`,
    input: z.object({}),
    annotations: { readOnlyHint: true },
    handler: async () => ok(buildSnapshot(store.getState())),
  });

  useMcpTool({
    name: "look",
    title: "Look around",
    description:
      "Just the surroundings: where you are, the ASCII view, and the doors, " +
      "people and items in it with absolute coordinates you can pass to " +
      "walk_to. Use this while navigating; get_game_state also returns the " +
      "party, the bag and the battle, which rarely change between steps. " +
      `Legend: ${MAP_LEGEND}`,
    input: z.object({}),
    annotations: { readOnlyHint: true },
    handler: async () => {
      const snapshot = buildSnapshot(store.getState());
      return ok({
        pos: snapshot.player.pos,
        map: snapshot.player.map,
        mapName: snapshot.player.mapName,
        mapSize: snapshot.player.mapSize,
        facing: snapshot.player.facing,
        ...snapshot.surroundings,
      });
    },
  });

  useMcpTool({
    name: "swap_party_slots",
    title: "Reorder the party",
    description:
      "Swap two party slots. Slot 0 leads, so this is how you choose who is " +
      "sent out first without burning a turn switching mid-battle.",
    input: z.object({
      a: z.number().int().min(0).max(5),
      b: z.number().int().min(0).max(5),
    }),
    handler: async ({ a, b }) => {
      const party = store.getState().game.pokemon;
      if (a >= party.length || b >= party.length) {
        return fail(`Party has ${party.length} Pokemon; slots are 0..${party.length - 1}.`);
      }
      if (a === b) return fail("Those are the same slot.");

      store.dispatch(swapPokemonPositions([a, b]));
      await settle(60);
      return ok({
        party: buildSnapshot(store.getState()).party.map((pokemon) => ({
          slot: pokemon.slot,
          species: pokemon.species,
          level: pokemon.level,
          hp: pokemon.hp,
          maxHp: pokemon.maxHp,
        })),
      });
    },
  });

  useMcpTool({
    name: "walk_to",
    title: "Walk to a tile",
    description:
      "Walk the avatar to an absolute tile on the current map, pathfinding " +
      "around walls. Stops early and tells you why if a wild Pokemon appears, " +
      "a trainer spots you, or you step through a door. Coordinates are the " +
      "ones in get_game_state; the ASCII map's top-left is localMapOrigin.",
    input: z.object({
      x: z.number().int().describe("Target tile x, absolute on the current map"),
      y: z.number().int().describe("Target tile y, absolute on the current map"),
    }),
    handler: async ({ x, y }) => {
      const blocked = interruption();
      if (blocked) {
        return fail(`Cannot walk while ${blocked} is on screen.`, summary());
      }

      const { pos, map, collectedItems } = store.getState().game;
      const path = findPath(pos, { x, y }, map, collectedItems);
      if (!path) {
        const surroundings = buildSnapshot(store.getState()).surroundings;
        return fail(`No walkable path from (${pos.x},${pos.y}) to (${x},${y}).`, {
          because: describeTile(x, y, map, collectedItems),
          localMap: surroundings.localMap,
          notable: surroundings.notable,
        });
      }

      const result = await walkPath(path);
      return ok({ ...result, steps: result.walked.length, ...summary() });
    },
  });

  useMcpTool({
    name: "walk",
    title: "Walk a few steps",
    description:
      "Walk a number of steps in one direction. Walking into something " +
      "impassable turns the avatar to face it without moving, which is how " +
      "you line up to talk to an NPC or read a sign.",
    input: z.object({
      direction: z.nativeEnum(Direction),
      steps: z.number().int().min(1).max(50).default(1),
    }),
    handler: async ({ direction, steps }) => {
      const blocked = interruption();
      if (blocked) {
        return fail(`Cannot walk while ${blocked} is on screen.`, summary());
      }
      const result = await walkPath(Array(steps).fill(direction));
      return ok({ ...result, steps: result.walked.length, ...summary() });
    },
  });

  useMcpTool({
    name: "interact",
    title: "Press A",
    description:
      "Press A. Talks to whoever the avatar faces, reads a sign, advances a " +
      "line of dialogue, confirms the highlighted menu entry, and dismisses " +
      "the title screen. Safe to call repeatedly to read a long conversation.",
    input: z.object({
      times: z.number().int().min(1).max(20).default(1),
    }),
    handler: async ({ times }) => {
      for (let i = 0; i < times; i++) {
        await awaitInput();
        await press(Event.A, 140);
      }
      return ok(summary());
    },
  });

  useMcpTool({
    name: "go_to_and_interact",
    title: "Walk up to something and talk to it",
    description:
      "Walk to a tile next to the given target, turn to face it, and press A. " +
      "Use this for NPCs, signs (S on the ASCII map) and trainers, whose own " +
      "tile cannot be stood on.",
    input: z.object({
      x: z.number().int().describe("Tile of the NPC, sign or object"),
      y: z.number().int().describe("Tile of the NPC, sign or object"),
    }),
    handler: async ({ x, y }) => {
      const blocked = interruption();
      if (blocked) {
        return fail(`Cannot walk while ${blocked} is on screen.`, summary());
      }

      const { pos, map, collectedItems } = store.getState().game;
      const target: PosType = { x, y };
      const options = adjacentTiles(target, map, collectedItems);
      if (options.length === 0) {
        return fail(`No walkable tile next to (${x},${y}).`);
      }

      const paths = options
        .map((tile) => ({
          tile,
          path: findPath(pos, tile, map, collectedItems),
        }))
        .filter((entry) => entry.path !== null)
        .sort((a, b) => (a.path as Direction[]).length - (b.path as Direction[]).length);

      if (paths.length === 0) {
        return fail(`Cannot reach anything next to (${x},${y}).`);
      }

      const result = await walkPath(paths[0].path as Direction[]);
      if (!result.arrived) {
        return ok({ ...result, reached: false, ...summary() });
      }

      // Turn towards the target. The step is refused because the tile is
      // occupied, but the reducer still updates the facing direction.
      const here = store.getState().game.pos;
      const facing = (Object.keys(MOVES) as Direction[]).find((direction) => {
        const offset = facingOffset(direction);
        return here.x + offset.x === x && here.y + offset.y === y;
      });
      if (facing) {
        store.dispatch(MOVES[facing]());
        await settle(80);
      }

      await press(Event.A, 140);
      return ok({ ...result, reached: true, ...summary() });
    },
  });

  useMcpTool({
    name: "select_menu_item",
    title: "Choose a menu entry",
    description:
      "Pick an entry by label from the menu currently accepting input, and " +
      "confirm it. Read screen.activeMenu in get_game_state for the choices. " +
      "This is how you fight, switch Pokemon, use and buy items, and save.",
    input: z.object({
      label: z
        .string()
        .describe("Entry to choose, matched case-insensitively against activeMenu.items"),
    }),
    handler: async ({ label }) => {
      const state = store.getState();
      const menu = selectActiveMenu(state);
      if (!menu) return fail("No menu is currently accepting input.", summary());

      const wanted = label.trim().toLowerCase();
      const index = menu.items.findIndex(
        (item) => item.trim().toLowerCase() === wanted
      );
      const fallback = menu.items.findIndex((item) =>
        item.trim().toLowerCase().startsWith(wanted)
      );
      const target = index === -1 ? fallback : index;
      if (target === -1) {
        return fail(`"${label}" is not in this menu.`, { options: menu.items });
      }

      emitter.emit(Event.SetMenuCursor, { key: menu.key, index: target });
      await settle(60);
      await press(Event.A, 160);
      return ok({ chose: menu.items[target], ...summary() });
    },
  });

  useMcpTool({
    name: "press_button",
    title: "Press a Game Boy button",
    description:
      "Raw button press, for anything the higher level tools do not cover: B " +
      "to back out of a menu, start to open the main menu, arrows to nudge a " +
      "cursor. Prefer walk_to and select_menu_item where they apply.",
    input: z.object({
      button: z.enum(["a", "b", "start", "select", "up", "down", "left", "right"]),
      times: z.number().int().min(1).max(20).default(1),
    }),
    handler: async ({ button, times }) => {
      const events: Record<string, Event> = {
        a: Event.A,
        b: Event.B,
        start: Event.Start,
        select: Event.Select,
        up: Event.Up,
        down: Event.Down,
        left: Event.Left,
        right: Event.Right,
      };
      for (let i = 0; i < times; i++) await press(events[button], 120);
      return ok(summary());
    },
  });

  useMcpTool({
    name: "wait",
    title: "Wait for animations",
    description:
      "Let the game run for a moment. Battle animations, evolutions and map " +
      "transitions play on timers; if the screen looks mid-change, wait then " +
      "read the state again.",
    input: z.object({
      seconds: z.number().min(0.1).max(10).default(1),
    }),
    handler: async ({ seconds }) => {
      await settle(seconds * 1000);
      return ok(summary());
    },
  });

  useMcpTool({
    name: "get_party_agents",
    title: "See who else is playing",
    description:
      "List the other agents connected to this shared world, plus the recent " +
      "notes they have left. Everyone here drives the same avatar, so check " +
      "this before starting something long like a battle or a shopping trip.",
    input: z.object({}),
    annotations: { readOnlyHint: true },
    handler: async () =>
      ok({
        room: ROOM,
        you: AGENT_ID,
        shared: isShared(),
        ...(isShared()
          ? {
              agents: listPeers(),
              recentNotes: readLog(),
              persistence:
                "The room autosaves; it is restored when everyone has left " +
                "and someone rejoins. Use save_room to flush immediately.",
            }
          : {
              note:
                "Running solo: REACT_APP_SUPABASE_URL / REACT_APP_SUPABASE_ANON_KEY " +
                "are unset, so this tab is not synced to a room.",
            }),
      }),
  });

  useMcpTool({
    name: "save_room",
    title: "Save the shared world now",
    description:
      "Force an immediate save of the room. The world autosaves a couple of " +
      "seconds after anything changes, so this is only needed before everyone " +
      "disconnects at once, or to confirm the save worked.",
    input: z.object({}),
    handler: async () => ok({ result: await saveNow() }),
  });

  useMcpTool({
    name: "tell_agents",
    title: "Leave a note for the other agents",
    description:
      "Broadcast a short note to every agent in the room. Use it to claim a " +
      "task before you start it, and to hand over when you are done.",
    input: z.object({
      text: z.string().max(280),
      as: z.string().max(40).optional().describe("Display name to post under"),
    }),
    handler: async ({ text, as }) => {
      if (as) setAgentLabel(as);
      say(text);
      return ok({ posted: text, recentNotes: readLog() });
    },
  });

  return null;
};

export default GameTools;
