import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { loadCompanyInvoices } from "./invoices";
const org = "a1000000-0000-4000-8000-000000000001";
const invoice = (n: number) => ({
  id: `a2000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  organization_id: org,
  message_id: `synthetic-${n}`,
  attachment_id: String(n),
  content_hash: n.toString(16).padStart(64, "0"),
  document_id: "a3000000-0000-4000-8000-000000000001",
  supplier: "",
  invoice_number: "",
  invoice_date: null,
  net_cents: null,
  tax_cents: null,
  total_cents: null,
  currency: "EUR",
  status: "needs_review",
  review_note: "",
  finance_entry_id: null,
  created_at: "2026-10-03T00:00:00Z",
});
function client(pages: { data: unknown; error: unknown }[]) {
  const rpc = vi.fn(() => {
    const result = Promise.resolve(pages.shift() ?? { data: [], error: null });
    return Object.assign(result, { abortSignal: () => result });
  });
  return { rpc, client: { rpc } as unknown as SupabaseClient<Database> };
}
describe("carga completa y cancelable de la bandeja", () => {
  it("carga más de 200 sin duplicados y utiliza el último cursor autorizado", async () => {
    const rows = Array.from({ length: 205 }, (_, i) => invoice(i + 1));
    const f = client([
      { data: rows.slice(0, 200), error: null },
      { data: rows.slice(200), error: null },
    ]);
    expect(await loadCompanyInvoices(f.client, org)).toEqual(rows);
    expect(f.rpc.mock.calls).toEqual([
      ["tc_invoice_page", { p_org: org, p_after: null }],
      ["tc_invoice_page", { p_org: org, p_after: rows[199].id }],
    ]);
  });
  it("rechaza datos de otra empresa y campos no validados sin mostrarlos", async () => {
    for (const bad of [
      {
        ...invoice(1),
        organization_id: "a1000000-0000-4000-8000-000000000099",
      },
      { ...invoice(1), net_cents: -1 },
      { ...invoice(1), private_key: "synthetic-private" },
    ]) {
      const f = client([{ data: [bad], error: null }]);
      await expect(loadCompanyInvoices(f.client, org)).rejects.toThrow(
        "no corresponde",
      );
    }
  });
  it("un cursor repetido se rechaza y no repite páginas indefinidamente", async () => {
    const page = Array.from({ length: 200 }, (_, i) => invoice(i + 1)),
      f = client([
        { data: page, error: null },
        { data: page, error: null },
      ]);
    await expect(loadCompanyInvoices(f.client, org)).rejects.toThrow(
      "no corresponde",
    );
    expect(f.rpc).toHaveBeenCalledTimes(2);
  });
  it("un permiso retirado a mitad de carga no devuelve una lista parcial ni errores internos", async () => {
    const f = client([
      {
        data: Array.from({ length: 200 }, (_, i) => invoice(i + 1)),
        error: null,
      },
      { data: null, error: { message: "synthetic-private-details" } },
    ]);
    await expect(loadCompanyInvoices(f.client, org)).rejects.toThrow(
      "bandeja autorizada",
    );
  });
  it("cancela antes de pedir datos al salir o cambiar de empresa", async () => {
    const f = client([]),
      c = new AbortController();
    c.abort();
    await expect(
      loadCompanyInvoices(f.client, org, c.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("el límite de capacidad es explícito y no presenta 10.000 de 10.001 como el total", async () => {
    const rows = Array.from({ length: 10001 }, (_, i) => invoice(i + 1));
    const pages = Array.from({ length: 51 }, (_, i) => ({
      data: rows.slice(i * 200, (i + 1) * 200),
      error: null,
    }));
    await expect(
      loadCompanyInvoices(client(pages).client, org),
    ).rejects.toThrow("10.000");
  });
});
