import mapData from "../maps/map-data";
import { MapId } from "../maps/map-types";
import { canWalk } from "../app/map-helper";
import { Direction, PosType } from "../state/state-types";

const STEPS: { direction: Direction; dx: number; dy: number }[] = [
  { direction: Direction.Up, dx: 0, dy: -1 },
  { direction: Direction.Down, dx: 0, dy: 1 },
  { direction: Direction.Left, dx: -1, dy: 0 },
  { direction: Direction.Right, dx: 1, dy: 0 },
];

const key = (x: number, y: number) => `${x},${y}`;

/**
 * Breadth-first search over the same walkability rules the reducers use, so a
 * path returned here is a path the game will actually accept. Returns the list
 * of directions to walk, or null when the target is unreachable.
 *
 * ponytail: BFS not A*. Maps here top out around 40x40, so the heuristic would
 * buy nothing measurable. Swap in A* if maps ever get big.
 */
const findPath = (
  from: PosType,
  to: PosType,
  mapId: MapId,
  collectedItems: string[]
): Direction[] | null => {
  const map = mapData[mapId];
  if (to.x < 0 || to.y < 0 || to.x >= map.width || to.y >= map.height) {
    return null;
  }
  if (from.x === to.x && from.y === to.y) return [];

  const queue: PosType[] = [from];
  const cameFrom = new Map<string, { pos: PosType; direction: Direction }>();
  const seen = new Set<string>([key(from.x, from.y)]);

  while (queue.length > 0) {
    const current = queue.shift() as PosType;

    for (const step of STEPS) {
      const next = { x: current.x + step.dx, y: current.y + step.dy };
      if (next.x < 0 || next.y < 0) continue;
      if (next.x >= map.width || next.y >= map.height) continue;
      if (seen.has(key(next.x, next.y))) continue;
      if (!canWalk(next.x, next.y, mapId, collectedItems)) continue;

      seen.add(key(next.x, next.y));
      cameFrom.set(key(next.x, next.y), {
        pos: current,
        direction: step.direction,
      });

      if (next.x === to.x && next.y === to.y) {
        const path: Direction[] = [];
        let cursor = next;
        while (cursor.x !== from.x || cursor.y !== from.y) {
          const previous = cameFrom.get(key(cursor.x, cursor.y));
          if (!previous) return null;
          path.unshift(previous.direction);
          cursor = previous.pos;
        }
        return path;
      }

      queue.push(next);
    }
  }

  return null;
};

/** Walkable tiles next to a target, closest first. Used to walk up to an NPC. */
export const adjacentTiles = (
  target: PosType,
  mapId: MapId,
  collectedItems: string[]
): PosType[] =>
  STEPS.map((step) => ({ x: target.x + step.dx, y: target.y + step.dy })).filter(
    (pos) => canWalk(pos.x, pos.y, mapId, collectedItems)
  );

export default findPath;
