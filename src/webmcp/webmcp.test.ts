// Import order matters here: pathfinding pulls in the map layer, which used to
// enter a gameSlice <-> use-item-data cycle and leave ItemType undefined.
import findPath, { adjacentTiles } from "./pathfinding";
import { MapId } from "../maps/map-types";
import { canWalk } from "../app/map-helper";
import gameReducer, { hydrate, moveUp } from "../state/gameSlice";
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
