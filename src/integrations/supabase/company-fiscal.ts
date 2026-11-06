import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./database.types";
import { z } from "zod";
import {
  companyFiscalStateSchema,
  companyFiscalPageSchema,
  fiscalPolicyInputSchema,
  validateFiscalProfile,
} from "../../domain/company-fiscal";
import type {
  FiscalPolicyInput,
  FiscalProfileInput,
  CompanyFiscalState,
} from "../../domain/company-fiscal";

function failure(error: { code?: string } | null) {
  return Error(
    error?.code === "40001"
      ? "La configuración ha cambiado en otro dispositivo. Actualiza y revisa los permisos antes de guardar."
      : error?.code === "42501"
        ? "No tienes permiso para configurar la facturación de esta empresa."
        : error?.code === "23514"
          ? "Revisa las opciones, el territorio y el formato permitidos."
          : "No se ha podido confirmar la configuración fiscal. Actualiza el estado antes de volver a guardar.",
  );
}
async function request(
  client: SupabaseClient<Database>,
  org: string | null,
  action: string,
  data: Json = {},
  expected: number | null = null,
  after: string | null = null,
  signal?: AbortSignal,
) {
  const pending = client.rpc("tc_company_fiscal_control", {
    p_org: org,
    p_action: action,
    p_data: data,
    p_expected: expected,
    p_after: after,
  });
  const { data: result, error } = await (signal
    ? pending.abortSignal(signal)
    : pending);
  if (error || !result) throw failure(error);
  return result;
}
function scopedState(raw: unknown, org: string) {
  const state = companyFiscalStateSchema.parse(raw);
  if (state.organization_id !== org)
    throw Error("La respuesta fiscal no corresponde a la empresa activa.");
  return state;
}
export async function loadCompanyFiscal(
  client: SupabaseClient<Database>,
  org: string,
  signal?: AbortSignal,
) {
  z.uuid().parse(org);
  return scopedState(
    await request(client, org, "status", {}, null, null, signal),
    org,
  );
}
export async function saveCompanyFiscal(
  client: SupabaseClient<Database>,
  state: CompanyFiscalState,
  input: FiscalProfileInput,
) {
  const profile = validateFiscalProfile(input, state.policy);
  const next = scopedState(
    await request(
      client,
      state.organization_id,
      "save",
      profile,
      state.profile?.version ?? null,
    ),
    state.organization_id,
  );
  if (
    !next.configured_option_allowed ||
    !next.profile ||
    next.profile.regime !== profile.regime ||
    next.profile.territory !== profile.territory ||
    next.profile.document_format !== profile.document_format
  )
    throw Error(
      "El servidor no ha confirmado el perfil solicitado. Actualiza la configuración antes de volver a guardar.",
    );
  return next;
}
export async function loadFiscalAdminPage(
  client: SupabaseClient<Database>,
  after: string | null = null,
  signal?: AbortSignal,
) {
  if (after) z.uuid().parse(after);
  const result = companyFiscalPageSchema.parse(
    await request(client, null, "admin_list", {}, null, after, signal),
  );
  const ids = result.items.map((item) => item.organization_id);
  if (
    new Set(ids).size !== ids.length ||
    ids.some((id, i) =>
      i ? ids[i - 1] >= id : after !== null && id <= after,
    ) ||
    (result.next_cursor !== null && result.next_cursor !== ids.at(-1))
  )
    throw Error(
      "No se puede confirmar la página de empresas. Actualiza el listado.",
    );
  return result;
}
export async function saveFiscalPolicy(
  client: SupabaseClient<Database>,
  state: CompanyFiscalState,
  input: FiscalPolicyInput,
) {
  const policy = fiscalPolicyInputSchema.parse(input);
  const next = scopedState(
    await request(
      client,
      state.organization_id,
      "admin_set",
      policy,
      state.policy.version,
    ),
    state.organization_id,
  );
  if (
    next.policy.enabled !== policy.enabled ||
    Object.keys(policy.options).some(
      (key) =>
        next.policy.options[key as keyof typeof policy.options] !==
        policy.options[key as keyof typeof policy.options],
    )
  )
    throw Error(
      "El servidor no ha confirmado los permisos solicitados. Actualiza el listado antes de volver a guardar.",
    );
  return next;
}
