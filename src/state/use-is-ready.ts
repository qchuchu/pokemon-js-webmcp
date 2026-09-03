import { useSyncExternalStore } from "react";
import { isReady, subscribeSession } from "./session";

/** Whether the shared world has arrived, so the game is safe to show. */
const useIsReady = () =>
  useSyncExternalStore(subscribeSession, isReady, isReady);

export default useIsReady;
