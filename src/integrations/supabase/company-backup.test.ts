import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { SupabaseCompanyBackup } from "./company-backup";
import {
  collectCompanyBackup,
  backupRequiredFeatures,
} from "../../data/company-backup";

const org = "20000000-0000-4000-8000-000000000121";
function fixture() {
  const original = new TextEncoder().encode("%PDF-1.7\nFicticio\n%%EOF"),
    docs = Array.from({ length: 201 }, (_, i) => {
      const id = `50000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`;
      return {
        id,
        organization_id: org,
        name: `Ficticio ${i}.pdf`,
        object_path: `${org}/${id}/document.pdf`,
        content_type: "application/pdf",
        size_bytes: original.length,
        truck_id: null,
        driver_id: null,
        created_at: "2026-11-01T00:00:00Z",
      };
    });
  const controls = {
    active: true,
    canManage: true,
    repeat: false,
    foreign: false,
  };
  const rpc = vi.fn(
    async (
      name: string,
      args: { p_kind?: string; p_after?: string | null },
    ) => {
      if (name === "tc_organization_access")
        return {
          data: {
            active: controls.active,
            can_manage: controls.canManage,
            organization_id: org,
            features: {
              ...Object.fromEntries(
                backupRequiredFeatures.map((f) => [f, true]),
              ),
              documents: true,
              gmail: true,
            },
          },
          error: null,
        };
      if (name === "tc_list_records") return { data: [], error: null };
      if (name === "tc_backup_page") {
        let rows =
          args.p_kind === "documents"
            ? docs
                .filter(
                  (d) =>
                    controls.repeat || !args.p_after || d.id > args.p_after,
                )
                .slice(0, 200)
            : [];
        if (controls.foreign)
          rows = rows.map((d) => ({
            ...d,
            organization_id: "20000000-0000-4000-8000-000000000122",
            object_path: `20000000-0000-4000-8000-000000000122/${d.id}/document.pdf`,
          }));
        return { data: rows, error: null };
      }
      throw Error("Unexpected fixture RPC");
    },
  );
  const from = () => ({
    select: () => ({
      eq: () => ({
        order: () => ({ range: async () => ({ data: [], error: null }) }),
      }),
    }),
  });
  const download = vi.fn(async () => ({
    data: new Blob([original], { type: "application/pdf" }),
    error: null,
  }));
  const client = {
    rpc,
    from,
    storage: { from: () => ({ download }) },
  } as unknown as SupabaseClient<Database>;
  return {
    gateway: new SupabaseCompanyBackup(client, {
      id: org,
      name: "Archivo ficticio",
    }),
    rpc,
    download,
    controls,
  };
}
describe("lectura autorizada para copias", () => {
  it("incluye la segunda página y todos los originales mediante solicitudes RLS", async () => {
    const f = fixture(),
      backup = await collectCompanyBackup(f.gateway, org);
    expect(backup.documents).toHaveLength(201);
    expect(backup.files).toHaveLength(201);
    expect(f.download).toHaveBeenCalledTimes(201);
    expect(
      f.rpc.mock.calls.some(
        ([name, args]) =>
          name === "tc_backup_page" &&
          args.p_after === "50000000-0000-4000-8000-000000000200",
      ),
    ).toBe(true);
  });
  it("una página repetida detiene la copia en vez de perder datos o entrar en bucle", async () => {
    const f = fixture();
    f.controls.repeat = true;
    await expect(collectCompanyBackup(f.gateway, org)).rejects.toThrow(
      /paginación/,
    );
    expect(f.download).not.toHaveBeenCalled();
  });
  it("rechaza filas de otra empresa antes de pedir sus archivos", async () => {
    const f = fixture();
    f.controls.foreign = true;
    await expect(collectCompanyBackup(f.gateway, org)).rejects.toThrow(
      /mezcla empresas/,
    );
    expect(f.download).not.toHaveBeenCalled();
  });
});
