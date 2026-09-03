import { useEffect, useRef } from "react";
import { useDispatch } from "react-redux";
import emitter, { Event, SetMenuCursorPayload } from "./emitter";
import { registerMenu, unregisterMenu } from "../state/uiSlice";

// Labels contain spaces ("Tail Whip"), so the list is flattened on a separator
// that cannot appear in one. This keeps the effect dep a primitive instead of a
// fresh array on every render.
const SEPARATOR = "\u0000";

/**
 * Mirrors an on-screen list into Redux so WebMCP tools can read the choices and
 * where the cursor sits, and lets select_menu_item jump straight to an entry
 * rather than replaying arrow presses.
 *
 * Every list an agent has to choose from needs this, not just Menu. A party
 * screen that keeps its cursor in component state is invisible to a tool, so an
 * agent picking a Pokemon is picking blind.
 */
const useMenuRegistration = (
  key: string,
  show: boolean,
  labels: string[],
  cursor: number,
  disabled: boolean,
  moveCursor: (index: number) => void
) => {
  const dispatch = useDispatch();
  const joined = labels.join(SEPARATOR);

  // Held in a ref so callers do not have to memoise the callback just to avoid
  // resubscribing on every render.
  const moveCursorRef = useRef(moveCursor);
  moveCursorRef.current = moveCursor;

  useEffect(() => {
    if (!show) return;
    dispatch(
      registerMenu({
        key,
        items: joined.split(SEPARATOR),
        cursor,
        disabled,
      })
    );
    return () => {
      dispatch(unregisterMenu(key));
    };
  }, [key, show, joined, cursor, disabled, dispatch]);

  useEffect(() => {
    const onSetCursor = (payload: unknown) => {
      const { key: target, index } = payload as SetMenuCursorPayload;
      if (target === key) moveCursorRef.current(index);
    };
    emitter.on(Event.SetMenuCursor, onSetCursor);
    return () => {
      emitter.off(Event.SetMenuCursor, onSetCursor);
    };
  }, [key]);
};

export default useMenuRegistration;
