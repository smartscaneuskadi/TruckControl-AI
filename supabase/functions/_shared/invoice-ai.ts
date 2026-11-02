import { isUuid } from "./invoice.ts";

export interface InvoiceAiState {
  invoice_id: string;
  state: "available" | "attempted" | "approved" | "too_large";
  can_analyze: boolean;
}
export function validInvoiceAiStates(
  value: unknown,
  requested: string[],
): value is InvoiceAiState[] {
  return (
    Array.isArray(value) &&
    value.length <= requested.length &&
    new Set(value.map((i) => i?.invoice_id)).size === value.length &&
    value.every(
      (i) =>
        i &&
        isUuid(i.invoice_id) &&
        requested.includes(i.invoice_id) &&
        ["available", "attempted", "approved", "too_large"].includes(i.state) &&
        typeof i.can_analyze === "boolean" &&
        (!i.can_analyze || i.state === "available") &&
        Object.keys(i).every((k) =>
          ["invoice_id", "state", "can_analyze"].includes(k),
        ),
    )
  );
}
