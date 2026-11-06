import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database, Json } from "./database.types";
import {
  copilotActionSchema,
  copilotStatusSchema,
  copilotTurnSchema,
  conversationInput,
} from "../../domain/copilot";
import type { ChatMessage, CopilotAction } from "../../domain/copilot";
function problem(code?: string) {
  return Error(
    code === "42501" ||
      ["permission_changed", "ai_permission_required"].includes(code ?? "")
      ? "Tus permisos de empresa o de IA han cambiado. Actualiza el estado antes de continuar."
      : code === "40001" || code === "record_changed"
        ? "El registro ha cambiado o la propuesta ha caducado. Actualiza y pide una propuesta nueva."
        : code === "23505"
          ? "Ya existe ese registro o una asignación incompatible. Revisa los datos antes de continuar."
          : code === "23514" || code === "proposal_invalid"
            ? "La propuesta necesita datos completos y válidos. Revisa la petición y añade los que falten."
            : code === "rate_limited"
              ? "Hay demasiadas consultas seguidas. Espera un momento antes de enviar otra."
              : "No se ha podido confirmar el resultado. Comprueba el estado de la consulta antes de volver a enviarla; una repetición puede consumir IA.",
  );
}
async function invoke(
  client: SupabaseClient<Database>,
  body: Record<string, unknown>,
  signal?: AbortSignal,
) {
  const { data, error } = await client.functions.invoke("company-copilot", {
    body,
    signal,
  });
  if (error) {
    let code: string | undefined;
    try {
      code = (await error.context?.json())?.error;
    } catch {
      /* No raw provider or credential errors in the interface. */
    }
    throw problem(code);
  }
  return data;
}
function organization<T extends { organization_id: string }>(
  data: T,
  org: string,
): T {
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
  const rpc = client.rpc("tc_company_copilot", {
    p_org: org,
    p_action: action,
    p_data: input,
  });
  const { data, error } = await (signal ? rpc.abortSignal(signal) : rpc);
  if (error) throw problem(error.code);
  return data;
}
export async function copilotStatus(
  client: SupabaseClient<Database>,
  org: string,
  signal?: AbortSignal,
) {
  return organization(
    copilotStatusSchema.parse(
      await invoke(
        client,
        { action: "status", organization_id: z.uuid().parse(org) },
        signal,
      ),
    ),
    org,
  );
}
export async function copilotPending(
  client: SupabaseClient<Database>,
  org: string,
  signal?: AbortSignal,
) {
  const page = z
    .strictObject({
      schema_version: z.literal(1),
      organization_id: z.uuid(),
      actions: z.array(copilotActionSchema).max(30),
    })
    .parse(await control(client, org, "list", {}, signal));
  organization(page, org);
  if (
    page.actions.some(
      (a) => a.organization_id !== org || a.state !== "pending",
    ) ||
    new Set(page.actions.map((a) => a.id)).size !== page.actions.length
  )
    throw Error(
      "No se pueden confirmar las tareas pendientes de esta empresa.",
    );
  return page.actions;
}
export async function copilotChat(
  client: SupabaseClient<Database>,
  org: string,
  requestId: string,
  messages: ChatMessage[],
  signal?: AbortSignal,
) {
  const parsed = copilotTurnSchema.parse(
    await invoke(
      client,
      {
        action: "chat",
        organization_id: z.uuid().parse(org),
        request_id: z.uuid().parse(requestId),
        messages: conversationInput(messages),
      },
      signal,
    ),
  );
  organization(parsed, org);
  if (parsed.request_id !== requestId)
    throw Error("El resultado no corresponde a esta consulta.");
  return parsed;
}
export async function copilotResult(
  client: SupabaseClient<Database>,
  org: string,
  requestId: string,
  signal?: AbortSignal,
) {
  const raw = await control(
    client,
    org,
    "result",
    { request_id: z.uuid().parse(requestId) },
    signal,
  );
  if (raw === null)
    throw Error(
      "No se encuentra esa consulta. No se ha iniciado otra llamada de IA.",
    );
  const data = organization(copilotTurnSchema.parse(raw), org);
  if (data.request_id !== requestId)
    throw Error("El resultado no corresponde a esta consulta.");
  return data;
}
export async function copilotTask(
  client: SupabaseClient<Database>,
  org: string,
  action: CopilotAction,
  decision: "execute" | "cancel",
) {
  organization(copilotActionSchema.parse(action), org);
  const next = organization(
    copilotActionSchema.parse(
      await control(client, org, decision, { id: action.id }),
    ),
    org,
  );
  if (
    next.id !== action.id ||
    next.record_id !== action.record_id ||
    next.entity !== action.entity ||
    next.mode !== action.mode ||
    next.state !== (decision === "execute" ? "applied" : "cancelled") ||
    Object.keys(next.fields).length !== Object.keys(action.fields).length ||
    Object.keys(action.fields).some(
      (k) =>
        JSON.stringify(next.fields[k]) !== JSON.stringify(action.fields[k]),
    )
  )
    throw Error(
      "No se puede confirmar el resultado de la tarea. Actualiza su estado antes de repetirla.",
    );
  return next;
}
export async function copilotTaskState(
  client: SupabaseClient<Database>,
  org: string,
  action: CopilotAction,
) {
  organization(copilotActionSchema.parse(action), org);
  const next = organization(
    copilotActionSchema.parse(
      await control(client, org, "task", { id: action.id }),
    ),
    org,
  );
  if (
    next.id !== action.id ||
    next.record_id !== action.record_id ||
    next.entity !== action.entity
  )
    throw Error("El estado no corresponde a esta tarea.");
  return next;
}
