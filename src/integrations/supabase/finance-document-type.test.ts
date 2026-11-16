import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createDemo } from "../../data/demo";
import { SupabaseFleetRepository } from "./repository";
import type { Database } from "./database.types";

function fixture(
  documentType: string | null | undefined = undefined,
  stale = false,
) {
  const fleet = createDemo(),
    truck = fleet.trucks[0],
    row = fleet.entries[0];
  const entry: Record<string, unknown> = {
    id: row.id,
    organization_id: fleet.organization.id,
    truck_id: truck.id,
    kind: row.kind,
    concept: row.concept,
    date: row.date,
    amount_cents: row.amountCents,
    category: row.category,
    payment_status: row.paymentStatus,
    distance_km: row.distanceKm,
    row_version: 1,
    ...(documentType !== undefined ? { document_type: documentType } : {}),
  };
  const writes: Record<string, unknown>[] = [];
  const client = createClient<Database>(
    "http://127.0.0.1:9999",
    "sb_publishable_fixture_only",
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async (input, options) => {
          const url = new URL(String(input)),
            table = url.pathname.split("/").at(-1),
            method = options?.method ?? "GET";
          if (method !== "GET") {
            expect(table).toBe("finance_entries");
            const payload = JSON.parse(String(options?.body));
            writes.push(payload);
            expect(payload.organization_id).toBe(fleet.organization.id);
            if (method === "PATCH") {
              expect(url.searchParams.get("organization_id")).toBe(
                `eq.${fleet.organization.id}`,
              );
              expect(url.searchParams.get("row_version")).toBe(
                `eq.${entry.row_version}`,
              );
              if (stale) return Response.json([]);
              Object.assign(entry, payload);
              entry.row_version = Number(entry.row_version) + 1;
              return Response.json([{ id: row.id }]);
            }
            expect(method).toBe("POST");
            Object.assign(entry, payload);
            return new Response(null, { status: 201 });
          }
          expect(url.searchParams.get("organization_id")).toBe(
            `eq.${fleet.organization.id}`,
          );
          if (table === "finance_entries") return Response.json([entry]);
          if (table === "drivers") return Response.json([]);
          if (table === "trucks")
            return Response.json([
              {
                id: truck.id,
                plate: truck.plate,
                brand: truck.brand,
                model: truck.model,
                year: truck.year,
                odometer_km: truck.odometerKm,
                status: "available",
                driver_id: null,
                co_driver_id: null,
                inspection_due_on: truck.inspectionDueOn,
                route: truck.route,
                row_version: 1,
              },
            ]);
          throw Error("Unexpected private fixture request");
        },
      },
    },
  );
  return {
    repository: new SupabaseFleetRepository(client, fleet.organization),
    writes,
    entry,
  };
}
describe("clasificación financiera mediante SDK existente y CAS", () => {
  it.each([undefined, null, "ticket"] as const)(
    "carga %s sin inventar una clase",
    async (classification) => {
      const f = fixture(classification),
        snapshot = await f.repository.load();
      if (classification === undefined)
        expect(snapshot.entries[0]).not.toHaveProperty("documentType");
      else expect(snapshot.entries[0].documentType).toBe(classification);
    },
  );
  it("omisión legacy conserva el valor remoto y null lo borra explícitamente", async () => {
    const f = fixture("delivery_note"),
      snapshot = await f.repository.load();
    const legacy = { ...snapshot.entries[0] };
    delete legacy.documentType;
    const unchanged = await f.repository.execute({
      type: "save-entry",
      value: legacy,
    });
    expect(f.writes[0]).not.toHaveProperty("document_type");
    expect(unchanged.entries[0].documentType).toBe("delivery_note");
    const cleared = await f.repository.execute({
      type: "save-entry",
      value: { ...unchanged.entries[0], documentType: null },
    });
    expect(f.writes[1].document_type).toBeNull();
    expect(cleared.entries[0].documentType).toBeNull();
    expect(cleared.entries[0].amountCents).toBe(
      snapshot.entries[0].amountCents,
    );
  });
  it("nueva escritura guarda el tipo en la misma petición del movimiento", async () => {
    const f = fixture(),
      snapshot = await f.repository.load(),
      entry = {
        ...snapshot.entries[0],
        id: crypto.randomUUID(),
        documentType: "invoice" as const,
      };
    await f.repository.execute({ type: "save-entry", value: entry });
    expect(f.writes).toHaveLength(1);
    expect(f.writes[0]).toMatchObject({
      id: entry.id,
      document_type: "invoice",
      amount_cents: entry.amountCents,
    });
  });
  it("conflicto CAS no reintenta ni cambia la clasificación", async () => {
    const f = fixture("ticket", true),
      snapshot = await f.repository.load();
    await expect(
      f.repository.execute({
        type: "save-entry",
        value: { ...snapshot.entries[0], documentType: "invoice" },
      }),
    ).rejects.toThrow(/Otro dispositivo/);
    expect(f.writes).toHaveLength(1);
    expect(f.entry.document_type).toBe("ticket");
  });
});
