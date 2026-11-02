import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { emptyTyreData } from "../../domain/tyres";
import { loadCompanyTyres, loadTyrePageSet, saveCompanyTyre } from "./tyres";
const org = "ec100000-0000-4000-8000-000000000001";
const row = (n: number) => ({
  id: `ec200000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  organizationId: org,
  data: { ...emptyTyreData, code: "FICTICIO-" + n },
  version: 1,
  updatedAt: "2026-01-01T00:00:00Z",
});
function client(fn: (name: string, args: Record<string, unknown>) => unknown) {
  return { rpc: vi.fn(fn) } as unknown as SupabaseClient<Database>;
}
describe("repositorio de neumáticos con sesión ordinaria", () => {
  it("lee más de 200 fichas con cursor y sin perder el final", async () => {
    const rows = Array.from({ length: 205 }, (_, i) => row(i + 1));
    const c = client((_n, a) =>
      Promise.resolve({
        data: a.p_after ? rows.slice(200) : rows.slice(0, 200),
        error: null,
      }),
    );
    expect(await loadCompanyTyres(c, org)).toHaveLength(205);
    expect(c.rpc).toHaveBeenLastCalledWith("tc_tyre_page", {
      p_org: org,
      p_kind: "tyres",
      p_after: rows[199].id,
      p_tyre: null,
    });
  });
  it("rechaza cursor repetido, empresa ajena, campos inesperados e historial de otra cubierta", async () => {
    for (const rows of [
      [row(2), row(1)],
      [{ ...row(1), organizationId: crypto.randomUUID() }],
      [{ ...row(1), object_path: "private/path" }],
    ])
      await expect(
        loadCompanyTyres(
          client(() => Promise.resolve({ data: rows, error: null })),
          org,
        ),
      ).rejects.toThrow();
    const h = {
      id: row(1).id,
      organizationId: org,
      tyreId: row(2).id,
      data: row(1).data,
      version: 1,
      changedAt: row(1).updatedAt,
    };
    await expect(
      loadTyrePageSet(
        client(() => Promise.resolve({ data: [h], error: null })),
        org,
        "history",
        row(1).id,
      ),
    ).rejects.toThrow();
  });
  it("no reintenta escrituras ni devuelve detalles internos; conserva UUID y versión", async () => {
    const c = client(() =>
      Promise.resolve({
        data: null,
        error: { code: "40001", message: "secret private path" },
      }),
    );
    await expect(
      saveCompanyTyre(c, org, row(1).id, row(1).data, 1),
    ).rejects.toThrow("Otro dispositivo");
    expect(c.rpc).toHaveBeenCalledTimes(1);
    expect(c.rpc).toHaveBeenCalledWith("tc_save_tyre", {
      p_org: org,
      p_id: row(1).id,
      p_data: row(1).data,
      p_expected: 1,
    });
  });
  it("rechaza una respuesta de guardado ajena y cancela antes de acceder si la señal está anulada", async () => {
    const c = client(() =>
      Promise.resolve({ data: { ...row(1), id: row(2).id }, error: null }),
    );
    await expect(
      saveCompanyTyre(c, org, row(1).id, row(1).data, null),
    ).rejects.toThrow();
    const controller = new AbortController();
    controller.abort();
    const unused = client(() => {
      throw Error("Should not run");
    });
    await expect(
      loadCompanyTyres(unused, org, undefined, controller.signal),
    ).rejects.toThrow();
    expect(unused.rpc).not.toHaveBeenCalled();
  });
});
