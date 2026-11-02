import type { SupabaseClient } from "@supabase/supabase-js";
import type { CompanyInvoice, Database } from "./database.types";
import { backupInvoiceSchema } from "../../data/company-backup";

/** Complete authorized inbox; never silently return the old 200-row subset. */
export async function loadCompanyInvoices(
  client: SupabaseClient<Database>,
  organizationId: string,
  signal?: AbortSignal,
) {
  const rows: CompanyInvoice[] = [];
  let after: string | null = null;
  for (let page = 0; page < 51; page++) {
    signal?.throwIfAborted();
    const request = client.rpc("tc_invoice_page", {
      p_org: organizationId,
      p_after: after,
    });
    const { data, error } = await (signal
      ? request.abortSignal(signal)
      : request);
    signal?.throwIfAborted();
    if (error || !Array.isArray(data))
      throw Error(
        "No se ha podido cargar la bandeja autorizada. Comprueba tu acceso y vuelve a intentarlo.",
      );
    if (data.length > 200 || rows.length + data.length > 10000)
      throw Error(
        "La bandeja supera 10.000 facturas. Consulta con soporte para ampliar la capacidad; no se mostrará un listado incompleto.",
      );
    for (const raw of data) {
      const result = backupInvoiceSchema.safeParse(raw);
      if (
        !result.success ||
        result.data.organization_id !== organizationId ||
        (after !== null && result.data.id <= after)
      )
        throw Error(
          "La respuesta de facturas no corresponde a esta empresa o no es válida.",
        );
      rows.push(result.data);
      after = result.data.id;
    }
    if (data.length < 200) return rows;
  }
  throw Error("No se ha podido cargar la bandeja completa.");
}
