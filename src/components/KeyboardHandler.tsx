import { useEffect } from "react";
import emitter, { Event } from "../app/emitter";

/**
 * Keyboard controls, so a person can play with their hands while an agent
 * plays through the WebMCP tools. Both ends emit the same events, which is what
 * lets them share one avatar.
 *
 * Directions emit two things: the discrete event, which is what menus listen
 * for, and Start/Stop, which is what MovementHandler uses to walk for as long
 * as the key is held.
 */
const DIRECTIONS: Record<string, [Event, Event, Event]> = {
  ArrowUp: [Event.Up, Event.StartUp, Event.StopUp],
  ArrowDown: [Event.Down, Event.StartDown, Event.StopDown],
  ArrowLeft: [Event.Left, Event.StartLeft, Event.StopLeft],
  ArrowRight: [Event.Right, Event.StartRight, Event.StopRight],
  w: [Event.Up, Event.StartUp, Event.StopUp],
  s: [Event.Down, Event.StartDown, Event.StopDown],
  a: [Event.Left, Event.StartLeft, Event.StopLeft],
  d: [Event.Right, Event.StartRight, Event.StopRight],
};

// Z and X are where an emulator puts A and B; Enter and Shift are what this
// game used before the keyboard handler was removed. Accept all of them.
const BUTTONS: Record<string, Event> = {
  Enter: Event.A,
  z: Event.A,
  Shift: Event.B,
  x: Event.B,
  Backspace: Event.B,
  " ": Event.Start,
  Escape: Event.Select,
};

const isTyping = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  if (!element) return false;
  const tag = element.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || element.isContentEditable;
};

const KeyboardHandler = () => {
  useEffect(() => {
    const key = (event: KeyboardEvent) =>
      event.key.length === 1 ? event.key.toLowerCase() : event.key;

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;

      const direction = DIRECTIONS[key(event)];
      if (direction) {
        // Arrows and space scroll the page otherwise.
        event.preventDefault();
        // Auto-repeat would restart the walk on every tick; the interval in
        // MovementHandler is already doing the repeating.
        if (event.repeat) return;
        emitter.emit(direction[0]);
        emitter.emit(direction[1]);
        return;
      }

      const button = BUTTONS[key(event)];
      if (!button) return;
      event.preventDefault();
      if (event.repeat) return;
      emitter.emit(button);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      const direction = DIRECTIONS[key(event)];
      if (direction) emitter.emit(direction[2]);
    };

    // A key held while the tab loses focus never gets its keyup, which would
    // leave the avatar walking into a wall for ever.
    const onBlur = () => emitter.emit(Event.StopMoving);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  return null;
};

export default KeyboardHandler;
