import type { FleetSnapshot } from "../domain/models";
import { validateSnapshot } from "../domain/models";
import { createDemo } from "./demo";
import type { FleetCommand } from "../domain/commands";
import { STORAGE_KEY } from "./demo-keys";
import { readDemoOperations, writeDemoWorkspace } from "./demo-workspace";
import { demoOperations } from "./operations";

export { STORAGE_KEY } from "./demo-keys";

/** Boundary for future Supabase repositories; the UI never accesses storage directly. */
export interface FleetRepository {
  load(): Promise<FleetSnapshot>;
  save(snapshot: FleetSnapshot): Promise<void>;
  reset(): Promise<FleetSnapshot>;
  execute?(command: FleetCommand): Promise<FleetSnapshot>;
}

export class LocalFleetRepository implements FleetRepository {
  constructor(
    private readonly storage: Pick<Storage, "getItem" | "setItem">,
    private readonly seed = createDemo,
  ) {}

  async load() {
    const stored = this.storage.getItem(STORAGE_KEY);
    if (stored !== null) {
      try {
        return validateSnapshot(JSON.parse(stored));
      } catch {
        throw new Error(
          "No se pueden leer los datos guardados. No se han sobrescrito. Puedes restablecer la demostración desde esta pantalla.",
        );
      }
    }
    const snapshot = validateSnapshot(this.seed());
    await this.save(snapshot);
    return snapshot;
  }

  async save(snapshot: FleetSnapshot) {
    const valid = validateSnapshot(snapshot);
    const operations = readDemoOperations(this.storage, valid);
    try {
      writeDemoWorkspace(this.storage, valid, operations);
    } catch {
      throw new Error(
        "No se ha podido guardar. Comprueba el espacio y los permisos de almacenamiento del navegador.",
      );
    }
  }

  async reset() {
    const snapshot = validateSnapshot(this.seed());
    try {
      writeDemoWorkspace(this.storage, snapshot, demoOperations(snapshot));
    } catch {
      throw new Error(
        "No se ha podido restablecer. Los datos anteriores se conservan.",
      );
    }
    return snapshot;
  }
}
