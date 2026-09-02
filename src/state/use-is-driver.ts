import { useSyncExternalStore } from "react";
import { isDriver, subscribePeers } from "./session";

/** Re-renders when presence changes hand the driver role to another tab. */
const useIsDriver = () => useSyncExternalStore(subscribePeers, isDriver, isDriver);

export default useIsDriver;
