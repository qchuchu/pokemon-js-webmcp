import { useSyncExternalStore } from "react";
import { isDriver, subscribeSession } from "./session";

/** Re-renders when presence changes hand the driver role to another tab. */
const useIsDriver = () => useSyncExternalStore(subscribeSession, isDriver, isDriver);

export default useIsDriver;
