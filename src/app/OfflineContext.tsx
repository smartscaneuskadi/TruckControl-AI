import { createContext, useContext } from "react";
import type { VaultSession } from "../data/offline-vault";
export interface OfflineContextValue {
  session: VaultSession | null;
  offline: boolean;
  openEntry(): void;
  attach(session: VaultSession): void;
  lock(): void;
}
export const OfflineContext = createContext<OfflineContextValue>({
  session: null,
  offline: false,
  openEntry() {},
  attach() {},
  lock() {},
});
export const useOffline = () => useContext(OfflineContext);
