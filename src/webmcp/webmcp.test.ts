// Import order matters here: pathfinding pulls in the map layer, which used to
// enter a gameSlice <-> use-item-data cycle and leave ItemType undefined.
import findPath, { adjacentTiles } from "./pathfinding";
import { MapId } from "../maps/map-types";
import { canWalk } from "../app/map-helper";
import gameReducer, {
  completeQuest,
  encounterPokemon,
  encounterTrainer,
  endEncounter,
  faintToTrainer,
  hydrate,
  moveUp,
  payForQuest,
} from "../state/gameSlice";
import {
  hidePokemonCenterMenu,
  setScreenText,
  showPokemonCenterMenu,
} from "../state/uiSlice";
import mapData from "../maps/map-data";
import { store } from "../state/store";
import {
  battlePhase,
  buildMapOverview,
  buildSnapshot,
  waitingFor,
} from "./snapshot";
import { acceptsInput, CHOOSE_ACTION_STAGE } from "../state/battleSlice";
import { GameState } from "../state/state-types";
import { ItemType } from "../app/item-types";
import { pickDriver } from "../state/session";

describe("module graph", () => {
  it("resolves ItemType when the map layer is loaded first", () => {
    // Regression: the enum used to live in the useItemData hook, which imports
    // the slices that the map data imports back.
    expect(ItemType.MaxPotion).toBe("max-potion");
    expect(gameReducer(undefined, { type: "@@init" }).inventory[0].item).toBe(
      ItemType.MaxPotion
    );
  });
});

describe("pathfinding", () => {
  const map = MapId.PalletTown;
  const start = { x: 8, y: 13 };

  it("only ever routes through tiles the reducers accept", () => {
    const path = findPath(start, { x: 12, y: 11 }, map, []);
    expect(path).not.toBeNull();

    const cursor = { ...start };
    for (const direction of path as string[]) {
      if (direction === "up") cursor.y -= 1;
      if (direction === "down") cursor.y += 1;
      if (direction === "left") cursor.x -= 1;
      if (direction === "right") cursor.x += 1;
      expect(canWalk(cursor.x, cursor.y, map, [])).toBe(true);
    }
    expect(cursor).toEqual({ x: 12, y: 11 });
  });

  it("returns an empty path when already there, and null off-map", () => {
    expect(findPath(start, start, map, [])).toEqual([]);
    expect(findPath(start, { x: 999, y: 999 }, map, [])).toBeNull();
  });

  it("offers walkable neighbours to approach a tile that cannot be stood on", () => {
    const tiles = adjacentTiles({ x: 12, y: 11 }, map, []);
    expect(tiles.length).toBeGreaterThan(0);
    tiles.forEach((tile) => expect(canWalk(tile.x, tile.y, map, [])).toBe(true));
  });
});

describe("quests under a shared avatar", () => {
  const museum = { id: "pewter-museum-1f-paid", cost: 50 };

  it("charges once however many agents confirm the same prompt", () => {
    // Both agents stand on the tile and each gets its own copy of the prompt,
    // so both can confirm. The second must be a no-op, not a second $50.
    let state = gameReducer(undefined, { type: "@@init" });
    const before = state.money;

    state = gameReducer(state, payForQuest(museum));
    state = gameReducer(state, payForQuest(museum));

    expect(state.money).toBe(before - museum.cost);
    expect(state.completedQuests.filter((q) => q === museum.id)).toHaveLength(1);
  });

  it("does not record a quest twice", () => {
    let state = gameReducer(undefined, { type: "@@init" });
    state = gameReducer(state, completeQuest("some-quest"));
    state = gameReducer(state, completeQuest("some-quest"));
    expect(state.completedQuests).toEqual(["some-quest"]);
  });
});

describe("driver election", () => {
  const peer = (agentId: string, joinedAt: string) => ({
    agentId,
    joinedAt,
    label: agentId,
  });

  it("every tab picks the same driver without negotiating", () => {
    const room = [
      peer("c", "2026-01-01T00:00:02Z"),
      peer("a", "2026-01-01T00:00:01Z"),
      peer("b", "2026-01-01T00:00:03Z"),
    ];
    // Same answer regardless of the order presence happens to report peers in.
    expect(pickDriver(room)).toBe("a");
    expect(pickDriver([...room].reverse())).toBe("a");
  });

  it("breaks a tie on id so simultaneous joins still agree", () => {
    const sameInstant = [
      peer("z", "2026-01-01T00:00:00Z"),
      peer("m", "2026-01-01T00:00:00Z"),
    ];
    expect(pickDriver(sameInstant)).toBe("m");
    expect(pickDriver([...sameInstant].reverse())).toBe("m");
  });

  it("hands over to the next oldest when the driver leaves", () => {
    const room = [
      peer("a", "2026-01-01T00:00:01Z"),
      peer("b", "2026-01-01T00:00:02Z"),
    ];
    expect(pickDriver(room)).toBe("a");
    expect(pickDriver(room.filter((p) => p.agentId !== "a"))).toBe("b");
  });

  it("has no driver before presence lands, so nothing runs twice", () => {
    expect(pickDriver([])).toBeNull();
  });
});

describe("shared world", () => {
  it("hydrate replaces the world so a late joiner catches up", () => {
    const initial = gameReducer(undefined, { type: "@@init" });
    const elsewhere: GameState = {
      ...initial,
      pos: { x: 3, y: 4 },
      map: MapId.Route1,
      money: 9999,
    };

    const next = gameReducer(initial, hydrate(elsewhere));
    expect(next.pos).toEqual({ x: 3, y: 4 });
    expect(next.map).toBe(MapId.Route1);
    expect(next.money).toBe(9999);
  });

  it("namespaces game actions so the sync middleware can pick them out", () => {
    // The middleware broadcasts on this prefix; ui actions must stay local
    // because that slice holds callbacks and per-agent cursor state.
    expect(moveUp().type.startsWith("game/")).toBe(true);
  });
});

describe("agent-facing payloads", () => {
  it("routes onto an item tile, which canWalk calls solid but stepping on picks up", () => {
    const forest = MapId.ViridianForrest;
    const pokeBall = { x: 1, y: 31 };
    expect(canWalk(pokeBall.x, pokeBall.y, forest, [])).toBe(false);

    const path = findPath({ x: 5, y: 31 }, pokeBall, forest, []);
    expect(path).toEqual(["left", "left", "left", "left"]);
  });

  it("keeps routing around an item that is not the destination", () => {
    const forest = MapId.ViridianForrest;
    const path = findPath({ x: 5, y: 31 }, { x: 5, y: 30 }, forest, []);
    expect(path).not.toContain(undefined);
    expect(path).not.toBeNull();
  });

  it("never ships sprite data in the battle snapshot", () => {
    const trainer = (mapData[MapId.ViridianForrest].trainers ?? [])[0];
    expect(trainer.npc.portrait).toMatch(/^data:image|\.(png|jpg)/);

    store.dispatch(encounterTrainer(trainer));
    store.dispatch(
      encounterPokemon({
        id: trainer.pokemon[0].id,
        level: trainer.pokemon[0].level,
        hp: 10,
        moves: [],
      })
    );
    const battle = buildSnapshot(store.getState()).battle;
    expect(battle?.kind).toBe("trainer");
    expect(JSON.stringify(battle)).not.toContain("data:image");
    expect(battle?.trainer).toEqual({
      name: trainer.npc.name,
      canBattle: trainer.npc.canBattle,
    });
  });
});

describe("nothing on screen is a dead end", () => {
  // The store is shared across this file and an earlier test leaves a trainer
  // encounter behind, so start from a screen with nothing on it.
  beforeEach(() => {
    store.dispatch(setScreenText(null));
    store.dispatch(hidePokemonCenterMenu());
    store.dispatch(endEncounter());
    store.dispatch(faintToTrainer());
  });

  it("names what is holding input, so a frozen screen says why", () => {
    expect(waitingFor(store.getState())).toBeNull();

    // The Pokemon Center freezes the game and draws its own text box. Before
    // it published the line, this state was a snapshot with no dialogue, no
    // menu and no reason given, and an agent had nothing telling it to press A.
    store.dispatch(showPokemonCenterMenu());
    store.dispatch(setScreenText("Welcome to our POKéMON CENTER!"));

    const screen = buildSnapshot(store.getState()).screen;
    expect(screen.frozen).toBe(true);
    expect(screen.waitingFor).toBe("dialogue");
    expect(screen.dialogue).toBe("Welcome to our POKéMON CENTER!");
  });

  it("reports an encounter as what wants input, over any menu", () => {
    store.dispatch(
      encounterPokemon({ id: 10, level: 3, hp: 12, moves: [] })
    );
    expect(waitingFor(store.getState())).toBe("wild-encounter");
  });
});

describe("a battle survives the page that started it", () => {
  // The choreography runs on setTimeout chains. Only the stages that sit
  // waiting for input can be restored as they are; the rest need picking up at
  // one that can, or the fight hangs with no timer left to advance it.
  it("treats the input stages as resumable and the animated ones as not", () => {
    expect(acceptsInput(CHOOSE_ACTION_STAGE)).toBe(true);
    [11, 13, 14, 25, 33].forEach((stage) =>
      expect(acceptsInput(stage)).toBe(true)
    );

    // Mid-attack, mid-faint, mid-throw, sending out: all timer-driven.
    [0, 2, 15, 18, 20, 21, 24, 34, 42, 46, 48, 50].forEach((stage) =>
      expect(acceptsInput(stage)).toBe(false)
    );
  });

  it("resumes to a stage that actually wants input", () => {
    expect(battlePhase(CHOOSE_ACTION_STAGE)).toBe("choose-action");
    expect(acceptsInput(CHOOSE_ACTION_STAGE)).toBe(true);
  });
});

describe("finding your way around a town", () => {
  const inViridianCity = () => {
    const initial = gameReducer(undefined, { type: "@@init" });
    return {
      ...store.getState(),
      game: { ...initial, map: MapId.ViridianCity, pos: { x: 23, y: 26 } },
    };
  };

  it("labels every door with the map it leads to", () => {
    // The window around the player cannot answer "where is the Pokemon
    // Center": the building is off-screen, and only its own interior map ever
    // declares a healing counter. The doors have to name themselves.
    const overview = buildMapOverview(inViridianCity() as never);

    const doors = overview.notable.filter((tile) => tile.kind === "door");
    expect(doors.length).toBeGreaterThan(4);
    expect(doors.every((door) => !!door.to)).toBe(true);

    const center = doors.find(
      (door) => door.to === MapId.ViridianCityPokemonCenter
    );
    expect(center).toBeDefined();
    expect(overview.notable).toContainEqual(
      expect.objectContaining({ to: MapId.ViridianCityGym })
    );
  });

  it("renders the whole map, and stays small enough to read often", () => {
    const overview = buildMapOverview(inViridianCity() as never);

    expect(overview.fullMap).toHaveLength(overview.mapSize.height);
    overview.fullMap.forEach((row) =>
      expect(row).toHaveLength(overview.mapSize.width)
    );
    // Route 3 is the biggest map in the game at 73x36; keep the whole payload
    // in the hundreds of tokens, not the thousands.
    expect(JSON.stringify(overview).length).toBeLessThan(8000);
  });

  it("reports no healing counter while you are outdoors", () => {
    // A town does not declare one; that is exactly why doors need labels.
    expect(buildMapOverview(inViridianCity() as never).pokemonCenter).toBeNull();
  });
});
