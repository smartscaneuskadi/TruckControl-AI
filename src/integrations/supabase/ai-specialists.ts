import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database, Json } from "./database.types";
import { conversationInput, type ChatMessage } from "../../domain/copilot";
import {
  specialistStatusSchema,
  specialistTurnSchema,
  specialistDocumentsSchema,
  specialistJobsSchema,
  specialistIdSchema,
  type SpecialistId,
} from "../../domain/ai-specialists";
const problem = () =>
  Error(
    "No se puede confirmar el perfil o su resultado. Comprueba permisos y estado antes de repetir una consulta de IA.",
  );
function scope<T extends { organization_id: string }>(data: T, org: string) {
  if (data.organization_id !== org)
    throw Error("La respuesta no corresponde a la empresa activa.");
  return data;
}
async function control(
  client: SupabaseClient<Database>,
  org: string,
  action: string,
  input: Json = {},
  signal?: AbortSignal,
) {
  z.uuid().parse(org);
  const rpc = client.rpc("tc_company_specialists", {
    p_org: org,
    p_action: action,
    p_data: input,
  });
  const { data, error } = await (signal ? rpc.abortSignal(signal) : rpc);
  if (error) throw problem();
  return data;
}
export async function specialistStatus(
  client: SupabaseClient<Database>,
  org: string,
  signal?: AbortSignal,
) {
  return scope(
    specialistStatusSchema.parse(
      await control(client, org, "status", {}, signal),
    ),
    org,
  );
}
export async function specialistDocuments(
  client: SupabaseClient<Database>,
  org: string,
  signal?: AbortSignal,
) {
  return scope(
    specialistDocumentsSchema.parse(
      await control(client, org, "documents", {}, signal),
    ),
    org,
  );
}
export async function specialistChat(
  client: SupabaseClient<Database>,
  org: string,
  profile: SpecialistId,
  requestId: string,
  messages: ChatMessage[],
  documentIds: string[],
  signal?: AbortSignal,
) {
  specialistIdSchema.parse(profile);
  z.array(z.uuid()).max(3).parse(documentIds);
  if (
    new Set(documentIds).size !== documentIds.length ||
    (profile !== "documents" && documentIds.length)
  )
    throw Error("Selección documental no válida.");
  const { data, error } = await client.functions.invoke(
    "company-copilot/specialists",
    {
      body: {
        action: "chat",
        organization_id: z.uuid().parse(org),
        profile,
        request_id: z.uuid().parse(requestId),
        messages: conversationInput(messages),
        document_ids: documentIds,
      },
      signal,
    },
  );
  if (error) throw problem();
  const turn = scope(specialistTurnSchema.parse(data), org);
  if (turn.request_id !== requestId || turn.profile !== profile)
    throw Error("La respuesta no corresponde a este perfil o consulta.");
  return turn;
}
export async function specialistResult(
  client: SupabaseClient<Database>,
  org: string,
  profile: SpecialistId,
  id: string,
  signal?: AbortSignal,
) {
  const turn = scope(
    specialistTurnSchema.parse(
      await control(
        client,
        org,
        "result",
        { request_id: z.uuid().parse(id) },
        signal,
      ),
    ),
    org,
  );
  if (turn.request_id !== id || turn.profile !== profile)
    throw Error("El resultado no corresponde al perfil activo.");
  return turn;
}
export async function specialistJobs(
  client: SupabaseClient<Database>,
  org: string,
  profile: SpecialistId,
  action: "jobs_status" | "jobs_save" | "jobs_run" = "jobs_status",
  preference?: {
    enabled: boolean;
    cadence: "daily" | "weekly";
    expected_version: number;
  },
  signal?: AbortSignal,
) {
  specialistIdSchema.parse(profile);
  if (action === "jobs_save")
    z.strictObject({
      enabled: z.boolean(),
      cadence: z.enum(["daily", "weekly"]),
      expected_version: z.number().int().nonnegative(),
    }).parse(preference);
  const data = scope(
    specialistJobsSchema.parse(
      await control(
        client,
        org,
        action,
        { profile, ...(action === "jobs_save" ? preference : {}) },
        signal,
      ),
    ),
    org,
  );
  if (data.profile !== profile)
    throw Error("Los avisos no corresponden al perfil activo.");
  return data;
}
