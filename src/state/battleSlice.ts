import { PayloadAction, createSlice } from "@reduxjs/toolkit";
import { RootState } from "./store";

/**
 * The battle state machine, which used to live in PokemonEncounter's useState.
 * It is plain serialisable data, so moving it here is what lets every agent in
 * a room watch the same fight rather than each rendering its own.
 *
 * `stage` is the step of the battle choreography; the numbers are documented
 * against the switch in PokemonEncounter.
 */
export interface BattleState {
  stage: number;
  trainerPokemonIndex: number;
  outroIndex: number;
  involvedPokemon: number[];
  processingInvolvedPokemon: number;
  alertText: string | null;
  clickableNotice: string | null;
  trainerIntroIndex: number;
}

const initialState: BattleState = {
  stage: -1,
  trainerPokemonIndex: 0,
  outroIndex: 0,
  involvedPokemon: [0],
  processingInvolvedPokemon: 0,
  alertText: null,
  clickableNotice: null,
  trainerIntroIndex: -1,
};

/**
 * Stages that sit waiting for input, and so survive a reload: the action menu,
 * the party and move pickers, the forced switch, the move-learning prompt.
 *
 * Every other stage is one step of a setTimeout chain. Those timers do not
 * outlive the page, so a battle restored on one of them has nothing left to
 * advance it and hangs. Resuming a fight means snapping back to one of these.
 */
const INPUT_STAGES = [11, 13, 14, 25, 33];

export const CHOOSE_ACTION_STAGE = 11;
export const MUST_SEND_OUT_STAGE = 25;

export const acceptsInput = (stage: number) => INPUT_STAGES.includes(stage);

export const battleSlice = createSlice({
  name: "battle",
  initialState,
  reducers: {
    setStage: (state, action: PayloadAction<number>) => {
      state.stage = action.payload;
    },
    setTrainerPokemonIndex: (state, action: PayloadAction<number>) => {
      state.trainerPokemonIndex = action.payload;
    },
    setOutroIndex: (state, action: PayloadAction<number>) => {
      state.outroIndex = action.payload;
    },
    setInvolvedPokemon: (state, action: PayloadAction<number[]>) => {
      state.involvedPokemon = action.payload;
    },
    setProcessingInvolvedPokemon: (state, action: PayloadAction<number>) => {
      state.processingInvolvedPokemon = action.payload;
    },
    setAlertText: (state, action: PayloadAction<string | null>) => {
      state.alertText = action.payload;
    },
    setClickableNotice: (state, action: PayloadAction<string | null>) => {
      state.clickableNotice = action.payload;
    },
    setTrainerIntroIndex: (state, action: PayloadAction<number>) => {
      state.trainerIntroIndex = action.payload;
    },
    // Joining mid-fight has to bring the choreography across too, or the tab
    // renders an empty battle screen over a live encounter.
    hydrateBattle: (_state, action: PayloadAction<BattleState>) =>
      action.payload,
  },
});

export const {
  setStage,
  setTrainerPokemonIndex,
  setOutroIndex,
  setInvolvedPokemon,
  setProcessingInvolvedPokemon,
  setAlertText,
  setClickableNotice,
  setTrainerIntroIndex,
  hydrateBattle,
} = battleSlice.actions;

export const selectStage = (state: RootState) => state.battle.stage;

export const selectTrainerPokemonIndex = (state: RootState) =>
  state.battle.trainerPokemonIndex;

export const selectOutroIndex = (state: RootState) => state.battle.outroIndex;

export const selectInvolvedPokemon = (state: RootState) =>
  state.battle.involvedPokemon;

export const selectProcessingInvolvedPokemon = (state: RootState) =>
  state.battle.processingInvolvedPokemon;

export const selectAlertText = (state: RootState) => state.battle.alertText;

export const selectClickableNotice = (state: RootState) =>
  state.battle.clickableNotice;

export const selectTrainerIntroIndex = (state: RootState) =>
  state.battle.trainerIntroIndex;

export default battleSlice.reducer;
