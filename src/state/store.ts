import { configureStore, ThunkAction, Action } from "@reduxjs/toolkit";
import gameReducer from "./gameSlice";
import uiReducer from "./uiSlice";
import battleReducer from "./battleSlice";
import { sharedActionMiddleware } from "./session";

export const store = configureStore({
  reducer: {
    game: gameReducer,
    ui: uiReducer,
    battle: battleReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }).concat(sharedActionMiddleware),
});

export type AppDispatch = typeof store.dispatch;
export type RootState = ReturnType<typeof store.getState>;
export type AppThunk<ReturnType = void> = ThunkAction<
  ReturnType,
  RootState,
  unknown,
  Action<string>
>;
