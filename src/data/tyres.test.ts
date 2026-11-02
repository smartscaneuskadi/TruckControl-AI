import { afterEach, describe, expect, it, vi } from "vitest";
import { createDemo } from "./demo";
import { LocalFleetRepository } from "./repository";
import { STORAGE_KEY } from "./demo-keys";
import { emptyTyreData } from "../domain/tyres";
import { loadDemoTyres, saveDemoTyre } from "./tyres";
import { writeDemoWorkspace, readDemoTyreArchive } from "./demo-workspace";
import {
  createDemoBackup,
  parseDemoBackupText,
  prepareDemoRestore,
  restoreDemoBackup,
  readDemoRecovery,
} from "./demo-backup";
function fixture() {
  const fleet = createDemo(),
    values = new Map<string, string>([[STORAGE_KEY, JSON.stringify(fleet)]]);
  const storage = {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => {
      values.set(k, v);
    },
  };
  vi.stubGlobal("localStorage", storage);
  return {
    fleet,
    storage,
    values,
    org: fleet.organization.id,
    id: crypto.randomUUID(),
  };
}
afterEach(() => vi.unstubAllGlobals());
describe("persistencia y recuperación de neumáticos demo", () => {
  it("el restablecimiento explícito limpia los neumáticos y permite recuperar una demo dañada", async () => {
    const f = fixture();
    saveDemoTyre(
      f.org,
      f.fleet,
      f.id,
      { ...emptyTyreData, code: "DEMO-RESET" },
      null,
    );
    const repository = new LocalFleetRepository(f.storage);
    await repository.reset();
    expect(loadDemoTyres(f.org).rows).toEqual([]);
    expect(loadDemoTyres(f.org).history).toEqual([]);
    f.storage.setItem(STORAGE_KEY, "{corrupto");
    const reset = await repository.reset();
    expect(reset.trucks).toHaveLength(50);
    expect(loadDemoTyres(f.org).rows).toEqual([]);
  });
  it("una edición de flota conserva fichas y revisiones en una sola escritura", () => {
    const f = fixture();
    const first = saveDemoTyre(
      f.org,
      f.fleet,
      f.id,
      { ...emptyTyreData, code: "DEMO-1" },
      null,
    );
    writeDemoWorkspace(
      f.storage,
      {
        ...f.fleet,
        organization: { ...f.fleet.organization, name: "Demo editada" },
      },
      [],
    );
    expect(loadDemoTyres(f.org).rows).toEqual([first]);
    expect(loadDemoTyres(f.org).history).toHaveLength(1);
  });
  it("un fallo de cuota conserva el archivo previo y no confirma una ficha", () => {
    const f = fixture(),
      before = f.storage.getItem(STORAGE_KEY);
    f.storage.setItem = () => {
      throw Error("Quota");
    };
    expect(() =>
      saveDemoTyre(
        f.org,
        f.fleet,
        f.id,
        { ...emptyTyreData, code: "DEMO-1" },
        null,
      ),
    ).toThrow();
    expect(f.storage.getItem(STORAGE_KEY)).toBe(before);
  });
  it("conserva versiones concurrentes e idempotencia sin duplicar revisiones", () => {
    const f = fixture(),
      d = { ...emptyTyreData, code: "DEMO-1" };
    const a = saveDemoTyre(f.org, f.fleet, f.id, d, null);
    expect(saveDemoTyre(f.org, f.fleet, f.id, d, null)).toEqual(a);
    saveDemoTyre(f.org, f.fleet, f.id, { ...d, notes: "nuevo" }, 1);
    expect(() =>
      saveDemoTyre(f.org, f.fleet, f.id, { ...d, notes: "obsoleto" }, 1),
    ).toThrow();
    expect(loadDemoTyres(f.org).history).toHaveLength(2);
  });
  it("copia demo v2 y punto recuperable incluyen neumáticos; la versión antigua sigue admitida", () => {
    const f = fixture();
    saveDemoTyre(
      f.org,
      f.fleet,
      f.id,
      { ...emptyTyreData, code: "DEMO-1" },
      null,
    );
    const backup = createDemoBackup(
      f.fleet,
      [],
      undefined,
      readDemoTyreArchive(f.storage, f.fleet)!,
    );
    expect(backup.version).toBe(2);
    expect(
      parseDemoBackupText(JSON.stringify(backup)).backup.tyres?.rows,
    ).toHaveLength(1);
    saveDemoTyre(
      f.org,
      f.fleet,
      f.id,
      { ...emptyTyreData, code: "DEMO-1", notes: "revisión posterior" },
      1,
    );
    restoreDemoBackup(f.storage, prepareDemoRestore(f.storage, backup));
    expect(loadDemoTyres(f.org).rows[0].version).toBe(1);
    expect(readDemoRecovery(f.storage)?.tyres?.rows[0].version).toBe(2);
    const old = createDemoBackup(f.fleet, []);
    expect(parseDemoBackupText(JSON.stringify(old)).backup.version).toBe(1);
    restoreDemoBackup(f.storage, prepareDemoRestore(f.storage, old));
    expect(loadDemoTyres(f.org).rows).toHaveLength(1);
  });
  it("impide huérfanos al restaurar una flota o eliminar un camión con neumáticos montados", () => {
    const f = fixture();
    saveDemoTyre(
      f.org,
      f.fleet,
      f.id,
      {
        ...emptyTyreData,
        code: "DEMO-1",
        status: "mounted",
        truckId: f.fleet.trucks[0].id,
        position: "Eje 1 izquierda",
      },
      null,
    );
    const next = structuredClone(f.fleet);
    next.entries = next.entries.filter(
      (e) => e.truckId !== f.fleet.trucks[0].id,
    );
    next.trucks = next.trucks.slice(1);
    const before = f.storage.getItem(STORAGE_KEY);
    expect(() => writeDemoWorkspace(f.storage, next, [])).toThrow();
    expect(f.storage.getItem(STORAGE_KEY)).toBe(before);
  });
});
