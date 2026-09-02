import { PayloadAction, createSlice } from "@reduxjs/toolkit";
import { RootState } from "./store";
import { ItemType } from "../app/item-types";
import { Direction } from "./state-types";

interface TextThenActionType {
  text: string[];
  action: () => void;
}

interface LearningMoveType {
  itemName: string;
  move: string;
  consume: boolean;
  item: ItemType;
}

interface ConfimationMenuType {
  preMessage: string;
  postMessage: string;
  confirm: () => void;
  cancel?: () => void;
}

interface EvolutionType {
  index: number;
  evolveToId: number;
}

export interface MenuSnapshot {
  key: string;
  items: string[];
  cursor: number;
  disabled: boolean;
}

interface UiState {
  text: string[] | null;
  startMenu: boolean;
  itemsMenu: boolean;
  playerMenu: boolean;
  titleMenu: boolean;
  loadMenu: boolean;
  gameboyMenu: boolean;
  pokemonCenterMenu: boolean;
  pcMenu: boolean;
  pokeMartMenu: boolean;
  actionOnPokemon: ((index: number) => void) | null;
  pokeballThrowing?: ItemType | null;
  spinning: Direction | null;
  textThenAction: TextThenActionType | null;
  learningMove: LearningMoveType | null;
  blackScreen: boolean;
  confirmationMenu: ConfimationMenuType | null;
  evolution: EvolutionType | null;
  menus: MenuSnapshot[];
}

const initialState: UiState = {
  text: null,
  startMenu: false,
  itemsMenu: false,
  playerMenu: false,
  // An agent joining a room wants to land in the running game, not sit on a
  // boot sequence built for someone holding a Game Boy. The screens still
  // exist and can be shown again by dispatching their show actions.
  titleMenu: false,
  loadMenu: false,
  gameboyMenu: false,
  actionOnPokemon: null,
  pokeballThrowing: null,
  pokemonCenterMenu: false,
  pcMenu: false,
  pokeMartMenu: false,
  spinning: null,
  textThenAction: null,
  learningMove: null,
  blackScreen: false,
  confirmationMenu: null,
  evolution: null,
  menus: [],
};

export const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    showStartMenu: (state) => {
      state.startMenu = true;
    },
    hideStartMenu: (state) => {
      state.startMenu = false;
    },
    showItemsMenu: (state) => {
      state.itemsMenu = true;
    },
    hideItemsMenu: (state) => {
      state.itemsMenu = false;
    },
    showPlayerMenu: (state) => {
      state.playerMenu = true;
    },
    hidePlayerMenu: (state) => {
      state.playerMenu = false;
    },
    hideTitleMenu: (state) => {
      state.titleMenu = false;
    },
    hideLoadMenu: (state) => {
      state.loadMenu = false;
    },
    hideGameboyMenu: (state) => {
      state.gameboyMenu = false;
    },
    showText: (state, action: PayloadAction<string[]>) => {
      state.text = action.payload;
    },
    hideText: (state) => {
      state.text = null;
    },
    showActionOnPokemon: (
      state,
      action: PayloadAction<(index: number) => void>
    ) => {
      state.actionOnPokemon = action.payload;
    },
    hideActionOnPokemon: (state) => {
      state.actionOnPokemon = null;
    },
    throwPokeball: (state, action: PayloadAction<ItemType>) => {
      state.pokeballThrowing = action.payload;
    },
    stopThrowingPokeball: (state) => {
      state.pokeballThrowing = null;
    },
    showPokemonCenterMenu: (state) => {
      state.pokemonCenterMenu = true;
    },
    hidePokemonCenterMenu: (state) => {
      state.pokemonCenterMenu = false;
    },
    showPcMenu: (state) => {
      state.pcMenu = true;
    },
    hidePcMenu: (state) => {
      state.pcMenu = false;
    },
    showPokeMartMenu: (state) => {
      state.pokeMartMenu = true;
    },
    hidePokeMartMenu: (state) => {
      state.pokeMartMenu = false;
    },
    startSpinning: (stage, action: PayloadAction<Direction>) => {
      stage.spinning = action.payload;
    },
    stopSpinning: (stage) => {
      stage.spinning = null;
    },
    showTextThenAction: (
      state,
      action: PayloadAction<TextThenActionType | null>
    ) => {
      state.textThenAction = action.payload;
    },
    hideTextThenAction: (state) => {
      state.textThenAction = null;
    },
    learnMove: (state, action: PayloadAction<LearningMoveType | null>) => {
      state.learningMove = action.payload;
    },
    stopLearningMove: (state) => {
      state.learningMove = null;
    },
    setBlackScreen: (state, action: PayloadAction<boolean>) => {
      state.blackScreen = action.payload;
    },
    showConfirmationMenu: (
      state,
      action: PayloadAction<ConfimationMenuType>
    ) => {
      state.confirmationMenu = action.payload;
    },
    hideConfirmationMenu: (state) => {
      state.confirmationMenu = null;
    },
    showEvolution: (state, action: PayloadAction<EvolutionType>) => {
      state.evolution = action.payload;
    },
    hideEvolution: (state) => {
      state.evolution = null;
    },
    registerMenu: (state, action: PayloadAction<MenuSnapshot>) => {
      const index = state.menus.findIndex((m) => m.key === action.payload.key);
      if (index === -1) state.menus.push(action.payload);
      else state.menus[index] = action.payload;
    },
    unregisterMenu: (state, action: PayloadAction<string>) => {
      state.menus = state.menus.filter((m) => m.key !== action.payload);
    },
  },
});

export const {
  showStartMenu,
  hideStartMenu,
  showItemsMenu,
  hideItemsMenu,
  showPlayerMenu,
  hidePlayerMenu,
  hideTitleMenu,
  hideLoadMenu,
  hideGameboyMenu,
  showText,
  hideText,
  showActionOnPokemon,
  hideActionOnPokemon,
  throwPokeball,
  stopThrowingPokeball,
  showPokemonCenterMenu,
  hidePokemonCenterMenu,
  showPcMenu,
  hidePcMenu,
  showPokeMartMenu,
  hidePokeMartMenu,
  startSpinning,
  stopSpinning,
  showTextThenAction,
  hideTextThenAction,
  learnMove,
  stopLearningMove,
  setBlackScreen,
  showConfirmationMenu,
  hideConfirmationMenu,
  showEvolution,
  hideEvolution,
  registerMenu,
  unregisterMenu,
} = uiSlice.actions;

export const selectText = (state: RootState) => state.ui.text;

export const selectStartMenu = (state: RootState) => state.ui.startMenu;

export const selectTextMenu = (state: RootState) => state.ui.text !== null;

export const selectItemsMenu = (state: RootState) => state.ui.itemsMenu;

export const selectPlayerMenu = (state: RootState) => state.ui.playerMenu;

export const selectTitleMenu = (state: RootState) => state.ui.titleMenu;

export const selectLoadMenu = (state: RootState) => state.ui.loadMenu;

export const selectGameboyMenu = (state: RootState) => state.ui.gameboyMenu;

export const selectPcMenu = (state: RootState) => state.ui.pcMenu;

export const selectPokemonCenterMenu = (state: RootState) =>
  state.ui.pokemonCenterMenu;

export const selectActionOnPokemon = (state: RootState) =>
  state.ui.actionOnPokemon;

export const selectPokeMartMenu = (state: RootState) => state.ui.pokeMartMenu;

export const selectMenuOpen = (state: RootState) =>
  state.ui.startMenu ||
  state.ui.text !== null ||
  state.ui.itemsMenu ||
  state.ui.playerMenu ||
  state.ui.titleMenu ||
  state.ui.loadMenu ||
  state.ui.gameboyMenu ||
  state.game.pokemonEncounter !== undefined ||
  state.ui.pokemonCenterMenu ||
  state.ui.pcMenu ||
  state.ui.pokeMartMenu ||
  state.ui.textThenAction !== null ||
  state.ui.learningMove !== null ||
  state.ui.confirmationMenu !== null ||
  state.ui.evolution !== null;

export const selectStartMenuSubOpen = (state: RootState) =>
  state.ui.itemsMenu || state.ui.playerMenu;

export const selectPokeballThrowing = (state: RootState) =>
  state.ui.pokeballThrowing;

export const selectSpinning = (state: RootState) => state.ui.spinning;

export const selectFrozen = (state: RootState) =>
  selectMenuOpen(state) || state.game.jumping || !!state.game.trainerEncounter;

export const selectTextThenAction = (state: RootState) =>
  state.ui.textThenAction;

export const selectLearningMove = (state: RootState) => state.ui.learningMove;

export const selectBlackScreen = (state: RootState) => state.ui.blackScreen;

export const selectConfirmationMenu = (state: RootState) =>
  state.ui.confirmationMenu;

export const selectEvolution = (state: RootState) => state.ui.evolution;

export const selectMenus = (state: RootState) => state.ui.menus;

// The menu an agent is actually able to drive: the most recently opened one
// that isn't disabled by a submenu sitting on top of it.
export const selectActiveMenu = (state: RootState): MenuSnapshot | null => {
  const enabled = state.ui.menus.filter((m) => !m.disabled);
  return enabled.length > 0 ? enabled[enabled.length - 1] : null;
};

export default uiSlice.reducer;
