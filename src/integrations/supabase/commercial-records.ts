import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./database.types";
import {
  supplierFieldsSchema,
  supplierPageSchema,
  supplierResponseSchema,
  tripFinanceSchema,
  tripCandidatesSchema,
} from "../../domain/commercial-records";
import type { SupplierFields, Supplier } from "../../domain/commercial-records";

function failure(error: { code?: string } | null) {
  return Error(
    error?.code === "40001"
      ? "Los datos han cambiado en otro dispositivo. Actualiza y revisa antes de guardar."
      : error?.code === "42501"
        ? "La sesión, la empresa o tus permisos ya no permiten esta operación."
        : error?.code === "23505"
          ? "La ficha o el movimiento ya está vinculado. Actualiza y revisa los datos."
          : error?.code === "23503"
            ? "Existen vínculos que deben revisarse antes de modificar este registro."
            : error?.code === "23514"
              ? "Revisa los campos, el camión y el estado del viaje."
              : "No se ha podido confirmar la operación. Actualiza el estado antes de volver a guardar.",
  );
}
async function request(
  client: SupabaseClient<Database>,
  fn: "tc_company_suppliers" | "tc_trip_finance",
  org: string,
  action: string,
  data: Json,
  signal?: AbortSignal,
) {
  z.uuid().parse(org);
  const pending = client.rpc(fn, {
    p_org: org,
    p_action: action,
    p_data: data,
  });
  const { data: result, error } = await (signal
    ? pending.abortSignal(signal)
    : pending);
  if (error || !result) throw failure(error);
  return result;
}
export async function loadSuppliers(
  client: SupabaseClient<Database>,
  org: string,
  signal?: AbortSignal,
): Promise<Supplier[]> {
  const rows: Supplier[] = [];
  let after: string | null = null;
  for (let page = 0; page <= 50; page++) {
    const result = supplierPageSchema.parse(
      await request(
        client,
        "tc_company_suppliers",
        org,
        "list",
        after ? { after } : {},
        signal,
      ),
    );
    if (
      result.organization_id !== org ||
      result.rows.some(
        (r, i) =>
          r.organization_id !== org ||
          r.id <= (i ? result.rows[i - 1].id : (after ?? "")),
      )
    )
      throw Error("El listado no corresponde a la empresa o no está completo.");
    rows.push(...result.rows);
    if (rows.length > 10000)
      throw Error("El listado supera el límite de proveedores.");
    if (result.rows.length < 200) return rows;
    after = result.rows.at(-1)!.id;
  }
  throw Error("No se puede confirmar el listado completo de proveedores.");
}
export async function saveSupplier(
  client: SupabaseClient<Database>,
  org: string,
  id: string,
  fields: SupplierFields,
  expected: number | null,
): Promise<Supplier> {
  z.uuid().parse(id);
  if (expected !== null)
    z.number().int().positive().max(Number.MAX_SAFE_INTEGER).parse(expected);
  const clean = supplierFieldsSchema.parse(fields);
  const result = supplierResponseSchema.parse(
    await request(client, "tc_company_suppliers", org, "save", {
      id,
      expected_version: expected,
      fields: clean,
    }),
  );
  if (
    result.organization_id !== org ||
    result.row.organization_id !== org ||
    result.row.id !== id ||
    Object.entries(clean).some(
      ([k, v]) => result.row[k as keyof SupplierFields] !== v,
    )
  )
    throw Error(
      "El servidor no ha confirmado la ficha de esta empresa. Actualiza antes de repetir.",
    );
  return result.row;
}
export async function tripFinance(
  client: SupabaseClient<Database>,
  org: string,
  trip: string,
  action: "summary" | "link" | "unlink" | "review" = "summary",
  data: Json = {},
  signal?: AbortSignal,
) {
  z.uuid().parse(trip);
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    "trip_id" in data
  )
    throw Error("Parámetros del viaje no válidos.");
  const result = tripFinanceSchema.parse(
    await request(
      client,
      "tc_trip_finance",
      org,
      action,
      { ...data, trip_id: trip },
      signal,
    ),
  );
  if (result.organization_id !== org || result.trip_id !== trip)
    throw Error("La respuesta no corresponde al viaje de la empresa activa.");
  return result;
}
export async function tripCandidates(
  client: SupabaseClient<Database>,
  org: string,
  trip: string,
  after: string | null,
  signal?: AbortSignal,
) {
  z.uuid().parse(trip);
  if (after) z.uuid().parse(after);
  const result = tripCandidatesSchema.parse(
    await request(
      client,
      "tc_trip_finance",
      org,
      "candidates",
      { trip_id: trip, ...(after ? { after } : {}) },
      signal,
    ),
  );
  if (
    result.organization_id !== org ||
    result.trip_id !== trip ||
    result.rows.some(
      (r, i) =>
        r.auto_booked || r.id <= (i ? result.rows[i - 1].id : (after ?? "")),
    )
  )
    throw Error(
      "La página de movimientos no corresponde al viaje o está incompleta.",
    );
  return result.rows;
}
