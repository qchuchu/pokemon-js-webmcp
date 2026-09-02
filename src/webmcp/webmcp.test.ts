// Import order matters here: pathfinding pulls in the map layer, which used to
// enter a gameSlice <-> use-item-data cycle and leave ItemType undefined.
import findPath, { adjacentTiles } from "./pathfinding";
import { MapId } from "../maps/map-types";
import { canWalk } from "../app/map-helper";
import gameReducer, { hydrate, moveUp } from "../state/gameSlice";
import { GameState } from "../state/state-types";
import { ItemType } from "../app/item-types";

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
