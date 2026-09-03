import mapData from "../maps/map-data";
import { MapId, MapType } from "../maps/map-types";
import { getMoveMetadata } from "../app/use-move-metadata";
import { getPokemonStats } from "../app/use-pokemon-stats";
import { getPokemonMetadata } from "../app/use-pokemon-metadata";
import {
  canWalk,
  isExit,
  isFence,
  isGrass,
  isItem,
  isTrainer,
  isWall,
} from "../app/map-helper";
import { RootState } from "../state/store";
import {
  selectActiveMenu,
  selectFrozen,
  selectMenus,
  selectScreenText,
} from "../state/uiSlice";
import { Direction, PokemonInstance, PosType } from "../state/state-types";

export const VIEW_RADIUS = 6;

// Item display names live inside the useItemData hook, which needs a dispatch.
// The slug is the identifier tools accept anyway, so just make it readable.
const prettify = (slug: string) =>
  slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export const facingOffset = (direction: Direction): PosType => {
  switch (direction) {
    case Direction.Up:
      return { x: 0, y: -1 };
    case Direction.Down:
      return { x: 0, y: 1 };
    case Direction.Left:
      return { x: -1, y: 0 };
    case Direction.Right:
      return { x: 1, y: 0 };
  }
};

const hasText = (map: MapType, x: number, y: number) =>
  !!(map.text[y] && map.text[y][x] && map.text[y][x].length > 0);

const isMapChange = (map: MapType, x: number, y: number) =>
  !!(map.maps[y] && map.maps[y][x]) ||
  isExit(map.exits, x, y) ||
  !!(map.teleports && map.teleports[y] && map.teleports[y][x]);

const uncollectedItem = (map: MapType, mapId: MapId, collected: string[]) =>
  (map.items || []).filter(
    (item) => !collected.includes(`${mapId}-${item.pos.x}-${item.pos.y}`)
  );

/**
 * A small ASCII view around the player. Far cheaper for an agent to reason
 * about than a coordinate dump, and it is the only way to see doors and walls.
 */
const renderLocalMap = (state: RootState): string[] => {
  const { pos, map: mapId, collectedItems, defeatedTrainers } = state.game;
  const map = mapData[mapId];
  const items = uncollectedItem(map, mapId, collectedItems);

  const rows: string[] = [];
  for (let y = pos.y - VIEW_RADIUS; y <= pos.y + VIEW_RADIUS; y++) {
    let row = "";
    for (let x = pos.x - VIEW_RADIUS; x <= pos.x + VIEW_RADIUS; x++) {
      if (x < 0 || y < 0 || x >= map.width || y >= map.height) {
        row += " ";
        continue;
      }
      if (x === pos.x && y === pos.y) {
        row += "@";
        continue;
      }
      if (items.some((item) => item.pos.x === x && item.pos.y === y)) {
        row += "I";
        continue;
      }
      if (isTrainer(map.trainers, x, y)) {
        const trainer = (map.trainers || []).find(
          (t) => t.pos.x === x && t.pos.y === y
        );
        const id = `${mapId}-${x}-${y}`;
        row += trainer && defeatedTrainers.includes(id) ? "t" : "T";
        continue;
      }
      if (isMapChange(map, x, y)) {
        row += "D";
        continue;
      }
      if (hasText(map, x, y)) {
        row += "S";
        continue;
      }
      if (isGrass(map.grass, x, y)) {
        row += "~";
        continue;
      }
      row += canWalk(x, y, mapId, collectedItems) ? "." : "#";
    }
    rows.push(row);
  }
  return rows;
};

/**
 * The battle choreography is a numbered stage machine. Agents should not have
 * to learn the numbers, so name the phases that matter for deciding what to do.
 */
export const battlePhase = (stage: number): string => {
  if (stage < 0) return "not-in-battle";
  if (stage <= 10 || (stage >= 34 && stage <= 41)) return "animating";
  if (stage === 11) return "choose-action";
  if (stage === 12) return "fled";
  if (stage === 13) return "choose-pokemon";
  if (stage === 14) return "choose-move";
  if (stage >= 15 && stage <= 19) return "attacking";
  if (stage === 20) return "opponent-fainted";
  if (stage === 21 || stage === 22) return "gaining-experience";
  if (stage === 24) return "your-pokemon-fainted";
  if (stage === 25) return "must-send-out-pokemon";
  if (stage >= 26 && stage <= 28) return "blacked-out";
  if (stage >= 29 && stage <= 33) return "learning-move";
  if (stage >= 42 && stage <= 45) return "throwing-pokeball";
  if (stage >= 46 && stage <= 49) return "opponent-sending-out";
  if (stage >= 50 && stage <= 52) return "victory";
  return "animating";
};

/**
 * The same doors, people and items the ASCII grid shows, but with absolute
 * coordinates. Reading a glyph off the grid means counting rows and columns
 * from localMapOrigin, which is easy to get wrong; these can be passed
 * straight to walk_to or go_to_and_interact.
 */
const notableTiles = (state: RootState) => {
  const { pos, map: mapId, collectedItems, defeatedTrainers } = state.game;
  const map = mapData[mapId];
  const items = uncollectedItem(map, mapId, collectedItems);
  const found: { x: number; y: number; kind: string }[] = [];

  for (let y = pos.y - VIEW_RADIUS; y <= pos.y + VIEW_RADIUS; y++) {
    for (let x = pos.x - VIEW_RADIUS; x <= pos.x + VIEW_RADIUS; x++) {
      if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
      if (x === pos.x && y === pos.y) continue;
      if (items.some((item) => item.pos.x === x && item.pos.y === y)) {
        found.push({ x, y, kind: "item" });
      } else if (isTrainer(map.trainers, x, y)) {
        const id = `${mapId}-${x}-${y}`;
        found.push({
          x,
          y,
          kind: defeatedTrainers.includes(id) ? "trainer-beaten" : "trainer",
        });
      } else if (isMapChange(map, x, y)) {
        found.push({ x, y, kind: "door" });
      } else if (hasText(map, x, y)) {
        found.push({ x, y, kind: "sign-or-npc" });
      }
    }
  }
  return found;
};

/** Why a tile cannot be stood on, for pathfinding failures. */
export const describeTile = (
  x: number,
  y: number,
  mapId: MapId,
  collectedItems: string[]
): string => {
  const map = mapData[mapId];
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return "off-map";
  if (isTrainer(map.trainers, x, y)) return "trainer (stand next to it instead)";
  if (isItem(map.items, x, y, collectedItems, mapId)) return "item on the ground";
  if (hasText(map, x, y)) return "sign or NPC (stand next to it instead)";
  if (isWall(map.walls, x, y)) return "wall";
  if (isFence(map.fences, x, y)) return "fence";
  return "walkable, but no route reaches it from here";
};

/**
 * What wants input before the avatar may walk again, or null when nothing does.
 * Shared with the movement tools so a refusal and the snapshot always name the
 * same thing: an agent that reads "menu-open" knows to look at the menu rather
 * than retrying the walk.
 */
export const waitingFor = (state: RootState): string | null => {
  if (state.ui.gameboyMenu) return "boot-screen";
  if (state.ui.titleMenu) return "title-screen";
  if (state.game.pokemonEncounter) return "wild-encounter";
  if (state.game.trainerEncounter) return "trainer-encounter";
  if (state.ui.text) return "dialogue";
  if (state.ui.screenText) return "dialogue";
  if (selectFrozen(state)) return "menu-open";
  return null;
};

export const MAP_LEGEND =
  "@ you | . walkable | # blocked | ~ tall grass (wild encounters) | " +
  "D door/exit to another map | S readable sign or NPC to talk to | " +
  "T trainer (not yet beaten) | t trainer (beaten) | I item on the ground";

const describePokemon = (pokemon: PokemonInstance, index: number) => {
  const stats = getPokemonStats(pokemon.id, pokemon.level);
  const metadata = getPokemonMetadata(pokemon.id);
  return {
    slot: index,
    species: metadata.name,
    speciesId: pokemon.id,
    level: pokemon.level,
    hp: pokemon.hp,
    maxHp: stats.hp,
    fainted: pokemon.hp <= 0,
    types: metadata.types,
    moves: pokemon.moves.map((move) => {
      const metadata = getMoveMetadata(move.id);
      return {
        id: move.id,
        name: metadata.name,
        pp: move.pp,
        maxPp: metadata.pp,
        type: metadata.type,
        power: metadata.power,
        accuracy: metadata.accuracy,
        damageClass: metadata.damageClass,
      };
    }),
  };
};

export const buildSnapshot = (state: RootState) => {
  const { game, ui } = state;
  const map = mapData[game.map];
  const facing = facingOffset(game.direction);
  const front = { x: game.pos.x + facing.x, y: game.pos.y + facing.y };
  const activeMenu = selectActiveMenu(state);

  const encounter = game.pokemonEncounter;
  const active = game.pokemon[game.activePokemonIndex];

  return {
    player: {
      name: game.name,
      money: game.money,
      pos: game.pos,
      facing: game.direction,
      map: game.map,
      mapName: map.name,
      mapSize: { width: map.width, height: map.height },
    },
    party: game.pokemon.map(describePokemon),
    pcBox: game.pc.map(describePokemon),
    inventory: game.inventory
      .filter((entry) => entry.amount > 0)
      .map((entry) => ({
        id: entry.item,
        name: prettify(entry.item),
        amount: entry.amount,
      })),
    screen: {
      // While frozen, movement tools are rejected: something on screen wants
      // input first (a menu, a text box, a battle).
      frozen: selectFrozen(state),
      // Names what is holding input, so a frozen screen is never a dead end.
      waitingFor: waitingFor(state),
      transitioning: ui.blackScreen,
      titleScreen: ui.titleMenu,
      bootScreen: ui.gameboyMenu,
      // Screens that draw their own text box publish through screenText.
      dialogue: ui.text ?? selectScreenText(state),
      activeMenu: activeMenu && {
        items: activeMenu.items,
        cursor: activeMenu.cursor,
        selected: activeMenu.items[activeMenu.cursor] ?? null,
      },
      openMenuCount: selectMenus(state).length,
      confirmation: ui.confirmationMenu && {
        message: ui.confirmationMenu.preMessage,
      },
      learningMove: ui.learningMove && {
        move: getMoveMetadata(ui.learningMove.move)?.name,
        from: ui.learningMove.itemName,
      },
      evolution: ui.evolution && {
        slot: ui.evolution.index,
        into: getPokemonMetadata(ui.evolution.evolveToId).name,
      },
    },
    battle: encounter
      ? {
          kind: game.trainerEncounter ? "trainer" : "wild",
          // Advance with interact(); when the phase asks for a choice, the menu
          // is in screen.activeMenu and select_menu_item drives it.
          phase: battlePhase(state.battle.stage),
          stage: state.battle.stage,
          message: state.battle.clickableNotice ?? state.battle.alertText,
          trainerIntro:
            state.battle.trainerIntroIndex >= 0
              ? game.trainerEncounter?.intro[state.battle.trainerIntroIndex]
              : null,
          // Never the whole npc: it carries a portrait and twelve walk sprites
          // as inlined base64, which would ship on every read of the battle.
          trainer: game.trainerEncounter && {
            name: game.trainerEncounter.npc.name,
            canBattle: game.trainerEncounter.npc.canBattle,
          },
          opponent: {
            species: getPokemonMetadata(encounter.id).name,
            level: encounter.level,
            hp: encounter.hp,
            maxHp: getPokemonStats(encounter.id, encounter.level).hp,
          },
          yours: active ? describePokemon(active, game.activePokemonIndex) : null,
        }
      : null,
    surroundings: {
      facingTile: {
        pos: front,
        walkable: canWalk(front.x, front.y, game.map, game.collectedItems),
        readable: hasText(map, front.x, front.y),
        door: isMapChange(map, front.x, front.y),
      },
      onGrass: isGrass(map.grass, game.pos.x, game.pos.y),
      pokemonCenter: map.pokemonCenter,
      pokeMart: map.store,
      pc: map.pc,
      localMap: renderLocalMap(state),
      localMapLegend: MAP_LEGEND,
      notable: notableTiles(state),
      localMapOrigin: {
        x: game.pos.x - VIEW_RADIUS,
        y: game.pos.y - VIEW_RADIUS,
      },
    },
    progress: {
      defeatedTrainers: game.defeatedTrainers.length,
      collectedItems: game.collectedItems.length,
      completedQuests: game.completedQuests,
    },
  };
};
