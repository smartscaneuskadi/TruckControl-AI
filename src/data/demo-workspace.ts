import { validateSnapshot } from "../domain/models";
import type { FleetSnapshot } from "../domain/models";
import { validateOperations } from "../domain/operations";
import type { OperationRecord } from "../domain/operations";
import { STORAGE_KEY, demoOperationKey } from "./demo-keys";

export type DemoStorage = Pick<Storage, "getItem" | "setItem">;
export function readDemoOperations(storage: DemoStorage, fleet: FleetSnapshot) {
  const core = storage.getItem(STORAGE_KEY);
  if (core !== null) {
    const value = JSON.parse(core);
    if (Object.hasOwn(value, "demoOperationsV1"))
      return validateOperations(value.demoOperationsV1, fleet);
  }
  const legacy = storage.getItem(demoOperationKey);
  return legacy === null ? null : validateOperations(JSON.parse(legacy), fleet);
}
export function hasEmbeddedOperations(storage: DemoStorage) {
  const raw = storage.getItem(STORAGE_KEY);
  return raw !== null && Object.hasOwn(JSON.parse(raw), "demoOperationsV1");
}
export function writeDemoWorkspace(
  storage: DemoStorage,
  fleet: FleetSnapshot,
  operations: OperationRecord[] | null,
) {
  const valid = validateSnapshot(fleet);
  const value =
    operations === null
      ? valid
      : {
          ...valid,
          demoOperationsV1: validateOperations(operations, valid),
        };
  // Core records and operations share one atomic localStorage write. Legacy
  // operation data is retained, and is used until an embedded copy exists.
  storage.setItem(STORAGE_KEY, JSON.stringify(value));
}
export function writeDemoOperations(
  storage: DemoStorage,
  operations: OperationRecord[],
) {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) throw Error("No se encuentra la flota de demostración.");
  writeDemoWorkspace(storage, validateSnapshot(JSON.parse(raw)), operations);
}
