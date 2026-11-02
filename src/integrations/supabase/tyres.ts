import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./database.types";
import {
  validateTyreForSave,
  tyreRecordSchema,
  tyreHistorySchema,
  validateTyres,
} from "../../domain/tyres";
import type { TyreData, TyreRecord, TyreHistory } from "../../domain/tyres";
import type { FleetSnapshot } from "../../domain/models";

function failure(error: { code?: string } | null) {
  return Error(
    error?.code === "40001"
      ? "Otro dispositivo ha cambiado este neumático. Actualiza antes de guardar."
      : error?.code === "23505"
        ? "El código o la posición ya están ocupados en esta empresa."
        : error?.code === "42501"
          ? "No tienes acceso a los neumáticos de esta empresa."
          : error?.code === "23514"
            ? "Revisa fechas, mediciones y posición del neumático."
            : "No se ha podido completar la operación de neumáticos. Tus cambios no se han confirmado.",
  );
}
async function fetchPage(
  client: SupabaseClient<Database>,
  org: string,
  kind: string,
  after: string | null,
  tyre: string | null,
  signal?: AbortSignal,
): Promise<{ data: Json | null; error: { code?: string } | null }> {
  const request = client.rpc("tc_tyre_page", {
    p_org: org,
    p_kind: kind,
    p_after: after,
    p_tyre: tyre,
  });
  return await (signal ? request.abortSignal(signal) : request);
}
export async function loadTyrePageSet(
  client: SupabaseClient<Database>,
  org: string,
  kind: "tyres",
  tyre?: null,
  signal?: AbortSignal,
): Promise<TyreRecord[]>;
export async function loadTyrePageSet(
  client: SupabaseClient<Database>,
  org: string,
  kind: "history",
  tyre?: string | null,
  signal?: AbortSignal,
): Promise<TyreHistory[]>;
export async function loadTyrePageSet(
  client: SupabaseClient<Database>,
  org: string,
  kind: "tyres" | "history",
  tyre: string | null = null,
  signal?: AbortSignal,
): Promise<(TyreRecord | TyreHistory)[]> {
  const out: (TyreRecord | TyreHistory)[] = [],
    max = kind === "tyres" ? 5000 : 50_000;
  let after: string | null = null;
  let bytes = 0;
  for (let page = 0; page <= max / 200; page++) {
    signal?.throwIfAborted();
    const { data, error } = await fetchPage(
      client,
      org,
      kind,
      after,
      tyre,
      signal,
    );
    signal?.throwIfAborted();
    if (error) throw failure(error);
    bytes += new TextEncoder().encode(JSON.stringify(data)).byteLength;
    if (bytes > 20 * 1024 * 1024)
      throw Error(
        "El registro de neumáticos supera 20 MB; no se mostrará una lista parcial.",
      );
    if (
      !Array.isArray(data) ||
      data.length > 200 ||
      out.length + data.length > max
    )
      throw Error(
        "No se ha podido completar el registro de neumáticos sin truncarlo.",
      );
    for (const item of data) {
      const row =
        kind === "tyres"
          ? tyreRecordSchema.parse(item)
          : tyreHistorySchema.parse(item);
      if (
        row.organizationId !== org ||
        (after !== null && row.id <= after) ||
        (kind === "history" && tyre && (row as TyreHistory).tyreId !== tyre)
      )
        throw Error(
          "La respuesta de neumáticos no corresponde a esta empresa o página.",
        );
      after = row.id;
      out.push(row);
    }
    if (data.length < 200) return out;
  }
  throw Error("No se ha podido leer el registro completo de neumáticos.");
}
export async function loadCompanyTyres(
  client: SupabaseClient<Database>,
  org: string,
  fleet?: FleetSnapshot,
  signal?: AbortSignal,
) {
  return validateTyres(
    await loadTyrePageSet(client, org, "tyres", null, signal),
    org,
    fleet,
  );
}
export async function saveCompanyTyre(
  client: SupabaseClient<Database>,
  org: string,
  id: string,
  input: TyreData,
  expected: number | null,
) {
  const data = validateTyreForSave(input);
  const response = await client.rpc("tc_save_tyre", {
    p_org: org,
    p_id: id,
    p_data: data,
    p_expected: expected,
  });
  if (response.error) throw failure(response.error);
  const row = tyreRecordSchema.parse(response.data);
  if (
    row.organizationId !== org ||
    row.id !== id ||
    JSON.stringify(row.data) !== JSON.stringify(data)
  )
    throw Error("No se ha confirmado el neumático de esta empresa.");
  return row;
}
