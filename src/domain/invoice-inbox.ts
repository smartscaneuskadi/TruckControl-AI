import type { CompanyInvoice } from "../integrations/supabase/database.types";

export const invoiceSourceLabels = {
  gmail: "Gmail",
  forwarded_email: "Correo reenviado",
  email_upload: "Archivo de correo",
  file_upload: "Archivo importado",
} as const;
export type InvoiceSource = keyof typeof invoiceSourceLabels;
export interface InvoiceFilters {
  query: string;
  status: "all" | CompanyInvoice["status"];
  source: "all" | InvoiceSource;
  from: string;
  until: string;
}
export const defaultInvoiceFilters: InvoiceFilters = {
  query: "",
  status: "all",
  source: "all",
  from: "",
  until: "",
};
const normalized = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
export const invoiceSource = (i: CompanyInvoice): InvoiceSource =>
  i.import_source ?? "gmail";
export function filterInvoices(
  rows: CompanyInvoice[],
  org: string,
  filter: InvoiceFilters,
) {
  const query = normalized(filter.query.trim());
  return rows
    .filter(
      (i) =>
        i.organization_id === org &&
        (filter.status === "all" || filter.status === i.status) &&
        (filter.source === "all" || filter.source === invoiceSource(i)) &&
        (!filter.from ||
          (i.invoice_date !== null && i.invoice_date >= filter.from)) &&
        (!filter.until ||
          (i.invoice_date !== null && i.invoice_date <= filter.until)) &&
        (!query ||
          normalized(`${i.supplier} ${i.invoice_number}`).includes(query)),
    )
    .sort(
      (a, b) =>
        (b.created_at || b.invoice_date || "").localeCompare(
          a.created_at || a.invoice_date || "",
        ) || b.id.localeCompare(a.id),
    );
}
export function summarizeInvoices(rows: CompanyInvoice[]) {
  return {
    count: rows.length,
    needsReview: rows.filter((i) => i.status === "needs_review").length,
    approved: rows.filter((i) => i.status === "approved").length,
    knownNetEurCents: rows.reduce(
      (sum, i) => sum + (i.currency === "EUR" ? (i.net_cents ?? 0) : 0),
      0,
    ),
    unknownNet: rows.filter((i) => i.net_cents === null).length,
    otherCurrency: rows.filter((i) => i.currency !== "EUR").length,
  };
}
/** Amounts without extraction remain empty; CSV escaping is applied by exportCsv. */
export function invoiceCsv(rows: CompanyInvoice[]): (string | number)[][] {
  const amount = (n: number | null) =>
    n === null ? "" : (n / 100).toFixed(2).replace(".", ",");
  return [
    [
      "Proveedor",
      "Número",
      "Fecha de factura",
      "Recepción",
      "Origen",
      "Estado",
      "Moneda",
      "Base sin IVA",
      "IVA",
      "Total",
      "ID del gasto",
    ],
    ...rows.map((i) => [
      i.supplier,
      i.invoice_number,
      i.invoice_date ?? "",
      i.created_at,
      invoiceSourceLabels[invoiceSource(i)],
      i.status === "approved" ? "Registrada" : "Revisar",
      i.currency,
      amount(i.net_cents),
      amount(i.tax_cents),
      amount(i.total_cents),
      i.finance_entry_id ?? "",
    ]),
  ];
}
