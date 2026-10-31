import { describe, expect, it } from "vitest";
import { createDemo } from "./demo";
import { demoOperations } from "./operations";
import { LocalFleetRepository } from "./repository";
import {
  createDemoBackup,
  parseDemoBackupText,
  prepareDemoRestore,
  readDemoRecovery,
  restoreDemoBackup,
  maxDemoBackupBytes,
} from "./demo-backup";
import { STORAGE_KEY, demoOperationKey, demoRecoveryKey } from "./demo-keys";
import { readDemoOperations } from "./demo-workspace";

function fixture() {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  const fleet = createDemo(),
    operations = demoOperations(fleet);
  storage.setItem(STORAGE_KEY, JSON.stringify(fleet));
  storage.setItem(demoOperationKey, JSON.stringify(operations));
  const next = structuredClone(fleet),
    nextOperations = structuredClone(operations);
  next.trucks[0].route = "Ruta recuperada ficticia";
  nextOperations.find((r) => r.kind === "customers")!.data.name =
    "Cliente recuperado ficticio";
  return {
    storage,
    fleet,
    operations,
    backup: createDemoBackup(next, nextOperations),
  };
}
describe("copias y recuperación del espacio de demostración", () => {
  it("exporta y valida fichas y operaciones sin presentar los archivos como incluidos", () => {
    const { backup } = fixture();
    expect(parseDemoBackupText(JSON.stringify(backup))).toEqual({
      backup,
      legacy: false,
    });
    expect(backup.attachmentsIncluded).toBe(false);
    expect(backup.operations).toHaveLength(7);
  });
  it("previsualiza sin modificar datos y restaura ambos conjuntos con un punto recuperable", async () => {
    const { storage, fleet, operations, backup } = fixture();
    const original = storage.getItem(STORAGE_KEY),
      oldOperations = storage.getItem(demoOperationKey);
    const preview = prepareDemoRestore(storage, backup);
    expect(storage.getItem(STORAGE_KEY)).toBe(original);
    expect(storage.getItem(demoRecoveryKey)).toBeNull();
    restoreDemoBackup(storage, preview);
    expect(
      (await new LocalFleetRepository(storage).load()).trucks[0].route,
    ).toBe("Ruta recuperada ficticia");
    expect(readDemoOperations(storage, backup.fleet)).toEqual(
      backup.operations,
    );
    expect(readDemoRecovery(storage)?.fleet).toEqual(fleet);
    expect(readDemoRecovery(storage)?.operations).toEqual(operations);
    expect(storage.getItem(demoOperationKey)).toBe(oldOperations);
  });
  it("permite recuperar el estado anterior y mantiene las operaciones al editar una ficha", async () => {
    const { storage, fleet, operations, backup } = fixture();
    restoreDemoBackup(storage, prepareDemoRestore(storage, backup));
    const repository = new LocalFleetRepository(storage),
      edited = await repository.load();
    edited.trucks[0].route = "Edición después de restaurar";
    await repository.save(edited);
    expect(readDemoOperations(storage, edited)).toEqual(backup.operations);
    restoreDemoBackup(
      storage,
      prepareDemoRestore(storage, readDemoRecovery(storage)!),
    );
    expect(await repository.load()).toEqual(fleet);
    expect(readDemoOperations(storage, fleet)).toEqual(operations);
  });
  it("rechaza una vista previa obsoleta sin sobrescribir la edición posterior", () => {
    const { storage, fleet, backup } = fixture();
    const preview = prepareDemoRestore(storage, backup);
    fleet.trucks[0].route = "Cambio de otra pestaña";
    const newer = JSON.stringify(fleet);
    storage.setItem(STORAGE_KEY, newer);
    expect(() => restoreDemoBackup(storage, preview)).toThrow("han cambiado");
    expect(storage.getItem(STORAGE_KEY)).toBe(newer);
    expect(storage.getItem(demoRecoveryKey)).toBeNull();
  });
  it("no cambia el espacio si no puede guardar el punto de recuperación", () => {
    const { storage, backup } = fixture(),
      preview = prepareDemoRestore(storage, backup),
      original = storage.getItem(STORAGE_KEY);
    const set = storage.setItem;
    storage.setItem = (key, value) => {
      if (key === demoRecoveryKey) throw Error("QuotaExceeded");
      set(key, value);
    };
    expect(() => restoreDemoBackup(storage, preview)).toThrow(
      "No se ha restaurado nada",
    );
    expect(storage.getItem(STORAGE_KEY)).toBe(original);
  });
  it("un fallo del guardado final deja fichas y operaciones originales disponibles", () => {
    const { storage, fleet, operations, backup } = fixture(),
      preview = prepareDemoRestore(storage, backup),
      original = storage.getItem(STORAGE_KEY);
    const set = storage.setItem;
    storage.setItem = (key, value) => {
      if (key === STORAGE_KEY) throw Error("QuotaExceeded");
      set(key, value);
    };
    expect(() => restoreDemoBackup(storage, preview)).toThrow(
      "anterior se conserva",
    );
    expect(storage.getItem(STORAGE_KEY)).toBe(original);
    expect(readDemoOperations(storage, fleet)).toEqual(operations);
    expect(readDemoRecovery(storage)?.fleet).toEqual(fleet);
  });
  it("admite copias antiguas de fichas indicando que no contienen operaciones", () => {
    const { fleet } = fixture(),
      result = parseDemoBackupText(JSON.stringify(fleet));
    expect(result.legacy).toBe(true);
    expect(result.backup.fleet).toEqual(fleet);
    expect(result.backup.operations).toEqual([]);
  });
  it("rechaza archivos corruptos, formatos futuros y copias de empresas", () => {
    const { backup, fleet } = fixture();
    expect(() => parseDemoBackupText("{corrupto")).toThrow("JSON válida");
    expect(() =>
      parseDemoBackupText(JSON.stringify({ ...backup, version: 7 })),
    ).toThrow("no son compatibles");
    expect(() =>
      parseDemoBackupText(
        JSON.stringify({
          ...fleet,
          organization: { ...fleet.organization, id: crypto.randomUUID() },
        }),
      ),
    ).toThrow("datos de empresas");
    expect(() =>
      parseDemoBackupText(
        JSON.stringify({ ...backup, attachmentsIncluded: true }),
      ),
    ).toThrow("no son compatibles");
  });
  it("rechaza referencias rotas, registros contabilizados huérfanos y archivos excesivos", () => {
    const { backup } = fixture(),
      broken = structuredClone(backup);
    broken.operations.find((r) => r.kind === "trips")!.data.truckId =
      crypto.randomUUID();
    expect(() => parseDemoBackupText(JSON.stringify(broken))).toThrow(
      "no pertenece",
    );
    const orphan = structuredClone(backup);
    orphan.operations[0].financeEntryId = crypto.randomUUID();
    expect(() => parseDemoBackupText(JSON.stringify(orphan))).toThrow(
      "movimiento económico",
    );
    expect(() =>
      parseDemoBackupText("x".repeat(maxDemoBackupBytes + 1)),
    ).toThrow("10 MB");
  });
  it("restablece también las operaciones sin eliminar el registro heredado", async () => {
    const { storage, backup } = fixture(),
      oldOperations = storage.getItem(demoOperationKey);
    restoreDemoBackup(storage, prepareDemoRestore(storage, backup));
    const repository = new LocalFleetRepository(storage),
      reset = await repository.reset();
    expect(readDemoOperations(storage, reset)).toEqual(demoOperations(reset));
    expect(storage.getItem(demoOperationKey)).toBe(oldOperations);
  });
});
