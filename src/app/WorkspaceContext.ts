import { createContext, useContext } from "react";
import type { Driver, FinanceEntry, Period, Truck } from "../domain/models";

export type Editor =
  | { kind: "truck"; value?: Truck }
  | { kind: "driver"; value?: Driver }
  | { kind: "income" | "expense"; value?: FinanceEntry; truckId?: string };
export interface WorkspaceValue {
  period: Period;
  setPeriod(period: Period): void;
  edit(editor: Editor): void;
  viewTruck(truck: Truck): void;
}
export const WorkspaceContext = createContext<WorkspaceValue | null>(null);
export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("Workspace no disponible");
  return value;
}
