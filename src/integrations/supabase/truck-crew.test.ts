import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { SupabaseFleetRepository } from "./repository";
const org = { id: "cd110000-0000-4000-8000-000000000001", name: "Empresa ficticia" };
const truckId = "cd220000-0000-4000-8000-000000000001";
const principal = "cd330000-0000-4000-8000-000000000001";
const second = "cd330000-0000-4000-8000-000000000002";

function fixture(initial: string | null | undefined) {
  const writes: { method: string; url: URL; body: Record<string, unknown> }[] = [];
  let co = initial, version = 1, conflict = false;
  const fetcher: typeof fetch = async (input, options) => {
    const url = new URL(String(input)), method = options?.method ?? "GET";
    const table = url.pathname.split("/").at(-1);
    if (method === "PATCH") {
      const body = JSON.parse(String(options?.body));
      writes.push({ method, url, body });
      expect(url.searchParams.get("organization_id")).toBe("eq."+org.id);
      expect(url.searchParams.get("id")).toBe("eq."+truckId);
      expect(url.searchParams.get("row_version")).toBe("eq."+version);
      if (conflict) return Response.json([]);
      if (Object.hasOwn(body, "co_driver_id")) co = body.co_driver_id;
      version++;
      return Response.json([{ id: truckId }]);
    }
    if (method !== "GET") throw Error("Unexpected fixture write");
    expect(url.searchParams.get("organization_id")).toBe("eq."+org.id);
    if (table === "trucks") return Response.json([{
      id: truckId, organization_id: org.id, plate: "1234 TEST", brand: "MAN", model: "Synthetic",
      year: 2025, odometer_km: 2000, status: "available", driver_id: principal,
      ...(co !== undefined ? { co_driver_id: co } : {}),
      inspection_due_on: "2028-01-01", route: "", created_at: "2026-11-08", row_version: version,
    }]);
    if (table === "drivers") return Response.json([principal, second].map((id, i) => ({
      id, organization_id: org.id, name: "Persona ficticia "+i, email: "", phone: "",
      license: "CE", license_expires_on: "2028-01-01", status: "active", created_at: "2026-11-08", row_version: 1,
    })));
    if (table === "finance_entries") return Response.json([]);
    throw Error("Unexpected fixture read");
  };
  const client = createClient<Database>("http://127.0.0.1:9999", "sb_publishable_synthetic_test", {
    auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: fetcher },
  });
  return { repository: new SupabaseFleetRepository(client, org), writes, conflict: () => { conflict=true; } };
}
describe("DTO multiempresa del segundo conductor", () => {
  it("lee snapshots legacy sin columna como null", async () => {
    const f = fixture(undefined);
    expect((await f.repository.load()).trucks[0]).toMatchObject({ driverId: principal, coDriverId: null });
  });
  it("lee las dos asignaciones de la empresa autorizada", async () => {
    const f = fixture(second);
    expect((await f.repository.load()).trucks[0]).toMatchObject({ driverId: principal, coDriverId: second });
  });
  it("omite el campo ausente de un comando antiguo y conserva la asignación remota", async () => {
    const f = fixture(second), fleet = await f.repository.load(), value = { ...fleet.trucks[0], route: "Ruta ficticia" };
    delete value.coDriverId;
    const result = await f.repository.execute({ type: "save-truck", value });
    expect(Object.hasOwn(f.writes[0].body, "co_driver_id")).toBe(false);
    expect(result.trucks[0]).toMatchObject({ driverId: principal, coDriverId: second });
  });
  it("envía null explícito para desasignar sólo el segundo puesto con CAS", async () => {
    const f = fixture(second), fleet = await f.repository.load();
    const result = await f.repository.execute({ type: "save-truck", value: { ...fleet.trucks[0], coDriverId: null } });
    expect(f.writes[0].body).toMatchObject({ driver_id: principal, co_driver_id: null });
    expect(result.trucks[0]).toMatchObject({ driverId: principal, coDriverId: null });
  });
  it("envía la nueva selección sin sustituir el conductor principal", async () => {
    const f = fixture(null), fleet = await f.repository.load();
    const result = await f.repository.execute({ type: "save-truck", value: { ...fleet.trucks[0], coDriverId: second } });
    expect(f.writes[0].body).toMatchObject({ driver_id: principal, co_driver_id: second });
    expect(result.trucks[0].coDriverId).toBe(second);
  });
  it("un conflicto no reintenta ni elimina la asignación", async () => {
    const f = fixture(second), fleet = await f.repository.load();
    f.conflict();
    await expect(f.repository.execute({ type: "save-truck", value: { ...fleet.trucks[0], coDriverId: null } })).rejects.toThrow("Otro dispositivo");
    expect(f.writes).toHaveLength(1);
    expect((await f.repository.load()).trucks[0].coDriverId).toBe(second);
  });
  it("rechaza una respuesta que referencia un conductor no autorizado", async () => {
    const f = fixture("cd330000-0000-4000-8000-000000000099");
    await expect(f.repository.load()).rejects.toThrow("no existe en esta empresa");
  });
});
