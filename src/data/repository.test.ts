import { describe, expect, it } from "vitest";
import { LocalFleetRepository, STORAGE_KEY } from "./repository";
import { createDemo } from "./demo";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}
describe("persistencia de demostración", () => {
  it("guarda cambios y los recupera desde una nueva instancia", async () => {
    const storage = memoryStorage(),
      repository = new LocalFleetRepository(storage);
    const data = await repository.load();
    data.trucks[0].route = "Ruta editada de prueba";
    await repository.save(data);
    expect(
      (await new LocalFleetRepository(storage).load()).trucks[0].route,
    ).toBe("Ruta editada de prueba");
  });
  it("no sobrescribe datos dañados al cargar", async () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, "{datos rotos");
    await expect(new LocalFleetRepository(storage).load()).rejects.toThrow(
      "No se han sobrescrito",
    );
    expect(storage.getItem(STORAGE_KEY)).toBe("{datos rotos");
  });
  it("detecta versiones de esquema desconocidas sin perderlas", async () => {
    const storage = memoryStorage(),
      raw = JSON.stringify({ ...createDemo(), schemaVersion: 9 });
    storage.setItem(STORAGE_KEY, raw);
    await expect(new LocalFleetRepository(storage).load()).rejects.toThrow();
    expect(storage.getItem(STORAGE_KEY)).toBe(raw);
  });
  it("informa del fallo de almacenamiento sin aparentar un guardado correcto", async () => {
    const storage = memoryStorage();
    await new LocalFleetRepository(storage).load();
    storage.setItem = () => {
      throw new Error("QuotaExceeded");
    };
    await expect(
      new LocalFleetRepository(storage).save(createDemo()),
    ).rejects.toThrow("No se ha podido guardar");
  });
});
