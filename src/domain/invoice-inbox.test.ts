import { describe, expect, it } from "vitest";
import {
  defaultInvoiceFilters as defaults,
  filterInvoices,
  invoiceCsv,
  summarizeInvoices,
} from "./invoice-inbox";
import type { CompanyInvoice } from "../integrations/supabase/database.types";
import { makeCsv } from "../lib/export";
const org = "a1000000-0000-4000-8000-000000000001";
function invoice(
  n: number,
  changes: Partial<CompanyInvoice> = {},
): CompanyInvoice {
  return {
    id: `a2000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    organization_id: org,
    message_id: "synthetic",
    attachment_id: String(n),
    content_hash: "a".repeat(64),
    document_id: "a3000000-0000-4000-8000-000000000001",
    supplier: "Tálleres de prueba",
    invoice_number: `F-${n}`,
    invoice_date: "2026-10-02",
    net_cents: 10000,
    tax_cents: 2100,
    total_cents: 12100,
    currency: "EUR",
    status: "needs_review",
    review_note: "",
    finance_entry_id: null,
    created_at: "2026-10-03T00:00:00Z",
    ...changes,
  };
}
describe("bandeja de facturas con datos autorizados", () => {
  it("excluye otra empresa incluso al buscar su número", () => {
    const rows = [
      invoice(1),
      invoice(2, { organization_id: "other", invoice_number: "PRIVADO" }),
    ];
    expect(
      filterInvoices(rows, org, { ...defaults, query: "privado" }),
    ).toEqual([]);
    expect(filterInvoices(rows, org, defaults).map((i) => i.id)).toEqual([
      rows[0].id,
    ]);
  });
  it("busca proveedor sin distinguir acentos y combina estado y origen", () => {
    const rows = [
      invoice(1),
      invoice(2, {
        import_source: "forwarded_email",
        status: "approved",
        finance_entry_id: "a4000000-0000-4000-8000-000000000001",
      }),
    ];
    expect(
      filterInvoices(rows, org, {
        ...defaults,
        query: "  TALLERES  ",
        status: "approved",
        source: "forwarded_email",
      }),
    ).toEqual([rows[1]]);
    expect(
      filterInvoices(rows, org, { ...defaults, query: "F-1", source: "gmail" }),
    ).toEqual([rows[0]]);
  });
  it("el período incluye extremos, excluye las fechas desconocidas y no utiliza recepción como fecha de factura", () => {
    const rows = [
      invoice(1),
      invoice(2, { invoice_date: null }),
      invoice(3, { invoice_date: "2026-10-03" }),
    ];
    expect(
      filterInvoices(rows, org, {
        ...defaults,
        from: "2026-10-02",
        until: "2026-10-02",
      }),
    ).toEqual([rows[0]]);
    expect(
      filterInvoices(rows, org, {
        ...defaults,
        from: "2026-10-04",
        until: "2026-10-01",
      }),
    ).toEqual([]);
  });
  it("ordena recepción reciente y resuelve empates sin modificar la lista", () => {
    const rows = [
      invoice(1),
      invoice(2),
      invoice(3, { created_at: "2026-10-01T00:00:00Z" }),
    ];
    expect(filterInvoices(rows, org, defaults).map((i) => i.id)).toEqual([
      rows[1].id,
      rows[0].id,
      rows[2].id,
    ]);
    expect(rows[0].invoice_number).toBe("F-1");
  });
  it("separa moneda y base desconocida y no presenta facturas como gastos confirmados", () => {
    const summary = summarizeInvoices([
      invoice(1),
      invoice(2, { currency: "USD", net_cents: 99999 }),
      invoice(3, { net_cents: null }),
      invoice(4, { status: "approved" }),
    ]);
    expect(summary).toEqual({
      count: 4,
      needsReview: 3,
      approved: 1,
      knownNetEurCents: 20000,
      unknownNet: 1,
      otherCurrency: 1,
    });
  });
  it("exporta importes originales y vacíos sin fórmulas de hoja de cálculo", () => {
    const csv = makeCsv(
      invoiceCsv([
        invoice(1, {
          supplier: '=HYPERLINK("fictitious")',
          net_cents: null,
          tax_cents: null,
          total_cents: null,
        }),
        invoice(2, { currency: "USD", tax_cents: 0 }),
      ]),
    );
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain('"USD";"100,00";"0,00";"121,00"');
    expect(csv).not.toContain("null");
    expect(csv).not.toContain("content_hash");
    expect(csv.split("\r\n")[1]).toContain(';"EUR";"";"";"";');
  });
});
