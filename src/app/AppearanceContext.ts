import { createContext, useContext } from "react";
import type { Appearance } from "../domain/appearance";
export type AppearanceStatus = "local" | "saving" | "synced" | "pending";
export const AppearanceContext = createContext<{
  preference: Appearance;
  resolvedTheme: "light" | "cockpit";
  motion: "full" | "reduced" | "off";
  account: string | null;
  status: AppearanceStatus;
  apply(preference: Appearance): void;
  open(): void;
} | null>(null);
export function useAppearance() {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error("AppearanceProvider is required");
  return value;
}
