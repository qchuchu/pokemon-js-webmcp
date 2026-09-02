import mitt from "mitt";

export enum Event {
  Up = "up",
  StartUp = "start-up",
  StopUp = "stop-up",
  Down = "down",
  StartDown = "start-down",
  StopDown = "stop-down",
  Left = "left",
  StartLeft = "start-left",
  StopLeft = "stop-left",
  Right = "right",
  StartRight = "start-right",
  StopRight = "stop-right",
  A = "a",
  B = "b",
  Start = "start",
  Select = "select",
  StopMoving = "stop-moving",
  EnterDoor = "enter-door",
  HealPokemon = "heal-pokemon",
  SetMenuCursor = "set-menu-cursor",
}

export interface SetMenuCursorPayload {
  key: string;
  index: number;
}

const emitter = mitt();

export default emitter;
