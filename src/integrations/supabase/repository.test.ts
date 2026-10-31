import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { SupabaseFleetRepository } from "./repository";

const organization = {
  id: "20000000-0000-4000-8000-000000000041",
  name: "Empresa ficticia",
};
const truckId = "30000000-0000-4000-8000-000000000041";
function fixture(entryCount = 0) {
  const requests: {
    url: URL;
    method: string;
    body: Record<string, unknown> | null;
  }[] = [];
  let version = 1,
    conflict = false;
  const fetcher: typeof fetch = async (input, options) => {
    const url = new URL(String(input)),
      method = options?.method ?? "GET";
    const body = options?.body ? JSON.parse(String(options.body)) : null;
    requests.push({ url, method, body });
    const table = url.pathname.split("/").at(-1);
    if (method !== "POST")
      expect(url.searchParams.get("organization_id")).toBe(
        `eq.${organization.id}`,
      );
    if (method === "PATCH") {
      expect(url.searchParams.get("row_version")).toBe(`eq.${version}`);
      if (conflict) return Response.json([]);
      version++;
      return Response.json([{ id: truckId }]);
    }
    if (method === "POST") {
      expect(body.organization_id).toBe(organization.id);
      return new Response(null, { status: 201 });
    }
    if (table === "trucks")
      return Response.json([
        {
          id: truckId,
          organization_id: organization.id,
          plate: "1111 TST",
          brand: "Demo",
          model: "Demo",
          year: 2026,
          odometer_km: 1000,
          status: "available",
          driver_id: null,
          inspection_due_on: "2028-01-01",
          route: "",
          created_at: "2026-10-01",
          row_version: version,
        },
      ]);
    if (table === "drivers") return Response.json([]);
    if (table === "finance_entries") {
      const offset = Number(url.searchParams.get("offset") ?? 0),
        limit = Number(url.searchParams.get("limit") ?? 1000);
      return Response.json(
        Array.from(
          { length: Math.min(limit, Math.max(0, entryCount - offset)) },
          (_, i) => ({
            id: `40000000-0000-4000-8000-${String(offset + i).padStart(12, "0")}`,
            organization_id: organization.id,
            truck_id: truckId,
            kind: "income",
            concept: "Servicio ficticio",
            date: "2026-10-01",
            amount_cents: 10000,
            category: "transport",
            payment_status: "paid",
            distance_km: 100,
            created_at: "2026-10-01",
            row_version: 1,
          }),
        ),
      );
    }
    throw new Error("Unexpected fixture request");
  };
  const client = createClient<Database>(
    "http://127.0.0.1:9999",
    "sb_publishable_synthetic_test",
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: fetcher },
    },
  );
  return {
    repository: new SupabaseFleetRepository(client, organization),
    requests,
    conflict: () => {
      conflict = true;
    },
  };
}
describe("repositorio remoto por empresa", () => {
  it("carga más de mil movimientos sin truncar ni mezclar empresas", async () => {
    const f = fixture(2101),
      snapshot = await f.repository.load();
    expect(snapshot.entries).toHaveLength(2101);
    expect(new Set(snapshot.entries.map((e) => e.id)).size).toBe(2101);
    expect(
      f.requests.filter((r) => r.url.pathname.endsWith("finance_entries")),
    ).toHaveLength(3);
  });
  it("usa la versión leída para editar y rechaza una modificación concurrente", async () => {
    const f = fixture(),
      snapshot = await f.repository.load();
    await f.repository.execute({
      type: "save-truck",
      value: { ...snapshot.trucks[0], route: "Ruta ficticia" },
    });
    expect(f.requests.filter((r) => r.method === "PATCH")).toHaveLength(1);
    f.conflict();
    await expect(
      f.repository.execute({
        type: "save-truck",
        value: { ...snapshot.trucks[0], route: "Segunda ruta" },
      }),
    ).rejects.toThrow("Otro dispositivo");
  });
  it("inserta una entidad nueva sin upsert ni sustitución global y bloquea reset", async () => {
    const f = fixture(),
      snapshot = await f.repository.load();
    await f.repository.execute({
      type: "save-truck",
      value: {
        ...snapshot.trucks[0],
        id: "30000000-0000-4000-8000-000000000049",
        plate: "9999 TST",
      },
    });
    const writes = f.requests.filter((r) => r.method !== "GET");
    expect(writes).toHaveLength(1);
    expect(writes[0].method).toBe("POST");
    expect(writes[0].url.searchParams.has("on_conflict")).toBe(false);
    await expect(f.repository.reset()).rejects.toThrow(
      "no pueden restablecerse",
    );
    await expect(f.repository.save()).rejects.toThrow("por separado");
  });
});
