import { describe, expect, it } from "vitest";
import { createDemo } from "../data/demo";
import { applyCommand } from "./commands";
import { validateSnapshot } from "./models";
import { createDemoBackup, parseDemoBackupText } from "../data/demo-backup";
import { backupProject, collectCompanyBackup, validateCompanyBackup } from "../data/company-backup";
import { deriveVaultKey, newVaultSalt, offlinePayload, openVault, sealVault, validateVaultPayload, vaultScope } from "../data/offline-vault";
import type { SubscriptionAccess } from "./subscriptions";
import { demoFeatures } from "./subscriptions";

function crewFixture() {
  const fleet = createDemo();
  const second = fleet.trucks[1].driverId!;
  fleet.trucks[1].driverId = null;
  fleet.trucks[0].coDriverId = second;
  return validateSnapshot(fleet);
}
const user = "dd110000-0000-4000-8000-000000000001";
function access(): SubscriptionAccess {
  return {
    active: true, features: demoFeatures,
    profile: { user_id: user, status: "trial", trial_ends_at: new Date(Date.now()+86400000).toISOString() },
  } as SubscriptionAccess;
}

describe("segundo conductor opcional y compatibilidad", () => {
  it("normaliza registros anteriores sin alterar el primer conductor ni la economía", () => {
    const legacy = createDemo();
    for (const truck of legacy.trucks) delete truck.coDriverId;
    const original = structuredClone(legacy);
    const loaded = validateSnapshot(legacy);
    expect(loaded.trucks.every((truck) => truck.coDriverId === null)).toBe(true);
    expect(loaded.trucks.map((truck) => truck.driverId)).toEqual(original.trucks.map((truck) => truck.driverId));
    expect(loaded.entries).toEqual(original.entries);
    expect(legacy).toEqual(original);
  });
  it("permite añadir un segundo conductor manteniendo la asignación principal", () => {
    const fleet = crewFixture();
    expect(fleet.trucks[0].driverId).toBe(fleet.drivers[0].id);
    expect(fleet.trucks[0].coDriverId).toBe(fleet.drivers[1].id);
  });
  it("rechaza una misma persona en ambos puestos", () => {
    const fleet = crewFixture();
    fleet.trucks[0].coDriverId = fleet.trucks[0].driverId;
    expect(() => validateSnapshot(fleet)).toThrow("deben ser distintos");
  });
  it("rechaza un segundo conductor ajeno a los datos autorizados", () => {
    const fleet = crewFixture();
    fleet.trucks[0].coDriverId = "dd220000-0000-4000-8000-000000000001";
    expect(() => validateSnapshot(fleet)).toThrow("no existe en esta empresa");
  });
  it("mantiene la exclusividad existente al cruzar puesto principal y segundo", () => {
    const fleet = crewFixture();
    fleet.trucks[2].driverId = fleet.trucks[0].coDriverId!;
    expect(() => validateSnapshot(fleet)).toThrow("asignado a otro camión");
  });
  it("rechaza asignar un conductor de permiso", () => {
    const fleet = crewFixture();
    fleet.trucks[0].coDriverId = fleet.drivers[44].id;
    expect(() => validateSnapshot(fleet)).toThrow("ponerlo de permiso");
  });
  it("un comando antiguo omite el campo y conserva el segundo conductor", () => {
    const fleet = crewFixture();
    const legacy = { ...fleet.trucks[0], route: "Ruta ficticia actualizada" };
    delete legacy.coDriverId;
    const changed = applyCommand(fleet, { type: "save-truck", value: legacy });
    expect(changed.trucks[0].coDriverId).toBe(fleet.trucks[0].coDriverId);
    expect(changed.trucks[0].driverId).toBe(fleet.trucks[0].driverId);
    expect(changed.entries).toEqual(fleet.entries);
  });
  it("null explícito desasigna sólo al segundo conductor", () => {
    const fleet = crewFixture();
    const changed = applyCommand(fleet, { type: "save-truck", value: { ...fleet.trucks[0], coDriverId: null } });
    expect(changed.trucks[0].coDriverId).toBeNull();
    expect(changed.trucks[0].driverId).toBe(fleet.trucks[0].driverId);
  });
  it("impide borrar o poner de permiso al segundo conductor asignado", () => {
    const fleet = crewFixture(), second = fleet.drivers[1];
    expect(() => applyCommand(fleet, { type: "delete-driver", id: second.id })).toThrow("Desasigna");
    expect(() => applyCommand(fleet, { type: "save-driver", value: { ...second, status: "leave" } })).toThrow("Desasigna");
  });
  it("conserva las dos asignaciones en exportación/importación de demo", () => {
    const fleet = crewFixture();
    const backup = createDemoBackup(fleet, [], "2026-11-08T14:00:00.000Z");
    expect(backup.version).toBe(3);
    expect(() => parseDemoBackupText(JSON.stringify({ ...backup, version: 1 }))).toThrow("versión 3");
    expect(parseDemoBackupText(JSON.stringify(backup)).backup.fleet.trucks).toEqual(fleet.trucks);
    const legacy = structuredClone(backup);
    for (const truck of legacy.fleet.trucks) delete truck.coDriverId;
    expect(parseDemoBackupText(JSON.stringify(legacy)).backup.fleet.trucks.every((truck) => truck.coDriverId === null)).toBe(true);
  });
  it.each([1, 2, 3, 4] as const)("lee copias anteriores de empresa v%s y normaliza la ausencia a null", async (version) => {
    const fleet = crewFixture();
    for (const truck of fleet.trucks) delete truck.coDriverId;
    const backup = await validateCompanyBackup({
      format: "truckcontrol-company-records", version, project: backupProject,
      exportedAt: "2026-11-08T14:00:00.000Z", coverage: { documents: "none", invoices: false },
      fleet, operations: [], documents: [], invoices: [], files: [],
    }, fleet.organization.id);
    expect(backup.fleet.trucks.every((truck) => truck.coDriverId === null)).toBe(true);
  });
  it("exporta con versión 5 para que los clientes antiguos no pierdan el segundo conductor", async () => {
    const fleet = crewFixture();
    const backup = await collectCompanyBackup({
      authorize: async () => ({ active: true, canManage: true, organizationId: fleet.organization.id,
        coverage: { documents: "none" as const, invoices: false }, features: demoFeatures }),
      read: async () => ({ fleet, operations: [], documents: [], invoices: [] }),
      download: async () => { throw Error("No hay archivos"); },
    }, fleet.organization.id);
    expect(backup.version).toBe(5);
    expect(backup.fleet.trucks).toEqual(fleet.trucks);
    await expect(validateCompanyBackup({ ...backup, version: 4 }, fleet.organization.id)).rejects.toThrow("versión 5");
  });
  it("rechaza una copia de empresa que referencia un segundo conductor desconocido", async () => {
    const fleet = crewFixture();
    fleet.trucks[0].coDriverId = "dd220000-0000-4000-8000-000000000002";
    await expect(validateCompanyBackup({
      format: "truckcontrol-company-records", version: 5, project: backupProject,
      exportedAt: "2026-11-08T14:00:00.000Z", coverage: { documents: "none", invoices: false },
      fleet, operations: [], documents: [], invoices: [], files: [],
    }, fleet.organization.id)).rejects.toThrow("no existe en esta empresa");
  });
  it("retiene el equipo en la copia offline cifrada y respeta su ámbito", async () => {
    const fleet = crewFixture(), scope = vaultScope("https://kkkemaycedexymrpaqtp.supabase.co", user, fleet.organization.id);
    const payload = offlinePayload(fleet, [], access()), salt = newVaultSalt();
    const key = await deriveVaultKey("frase-ficticia-segundo-conductor", salt);
    const envelope = await sealVault(payload, scope, key, salt, 1);
    expect(JSON.stringify(envelope)).not.toContain(fleet.drivers[1].name);
    expect((await openVault(envelope, scope, key)).snapshot.trucks).toEqual(fleet.trucks);
    expect(() => validateVaultPayload(payload, scope.replace(user, "dd110000-0000-4000-8000-000000000002"))).toThrow("no pertenece");
    const tampered = { ...payload, outbox: [{ id: crypto.randomUUID(), createdAt: new Date().toISOString(),
      command: { type: "save-truck", value: fleet.trucks[0] } }] };
    expect(() => validateVaultPayload(tampered, scope)).toThrow();
  });
});
