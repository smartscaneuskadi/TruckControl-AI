import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./database.types";
import {
  checkedIncidentMutation, incidentCapabilitiesSchema, incidentHistorySchema,
  incidentInput, incidentPageSchema, subscriptionIncidentSchema,
} from "../../domain/subscription-incidents";
import type { IncidentAction, SubscriptionIncident } from "../../domain/subscription-incidents";

export class SubscriptionIncidentError extends Error {
  constructor(readonly kind: "denied" | "unavailable" | "conflict" | "invalid" | "uncertain" | "cancelled") {
    super(kind === "denied" ? "La sesión ya no permite consultar estas incidencias. Comprueba el acceso de administración."
      : kind === "unavailable" ? "El registro de incidencias de pago todavía no está disponible."
        : kind === "conflict" ? "La incidencia ha cambiado en otro dispositivo. Actualiza y revisa el historial antes de continuar."
          : kind === "cancelled" ? "Se ha cerrado el contexto de esta consulta."
            : kind === "uncertain" ? "No se ha podido confirmar el resultado. Comprueba el historial o reintenta expresamente la misma declaración."
              : "No se ha podido contrastar la actuación. Revisa los datos y actualiza el registro.");
    this.name = "SubscriptionIncidentError";
  }
}
function problem(code: string | undefined, writing: boolean) {
  return new SubscriptionIncidentError(code === "42501" || code === "PGRST301" ? "denied"
    : code === "PGRST202" || code === "42883" ? "unavailable" : code === "40001" ? "conflict"
      : code === "22023" || code === "23514" ? "invalid" : writing ? "uncertain" : "unavailable");
}
/** A token-bound, RAM-only administrative scope. Never cache this object or its results. */
export async function createSubscriptionIncidentClient(client: SupabaseClient<Database>, userId: string, signal?: AbortSignal) {
  z.uuid().parse(userId);
  let closed = false, available = false;
  const first = await client.auth.getSession().catch(() => { throw new SubscriptionIncidentError("unavailable"); });
  const identity = first.data.session;
  if (first.error || !identity || identity.user.id !== userId || !identity.access_token) throw new SubscriptionIncidentError("denied");
  const token = identity.access_token;
  async function live(abort?: AbortSignal) {
    if (closed || signal?.aborted || abort?.aborted) throw new SubscriptionIncidentError("cancelled");
    try {
      const current = await client.auth.getSession();
      if (current.error || current.data.session?.user.id !== userId || current.data.session.access_token !== token) throw new SubscriptionIncidentError("denied");
      const verified = await client.auth.getUser(token);
      if (verified.error || verified.data.user?.id !== userId) throw new SubscriptionIncidentError("denied");
      const after = await client.auth.getSession();
      if (after.error || after.data.session?.user.id !== userId || after.data.session.access_token !== token) throw new SubscriptionIncidentError("denied");
      if (closed || signal?.aborted || abort?.aborted) throw new SubscriptionIncidentError("cancelled");
    } catch (error) {
      if (error instanceof SubscriptionIncidentError) throw error;
      throw new SubscriptionIncidentError("unavailable");
    }
  }
  await live(signal);
  async function request(action: string, caseId: string | null = null, expected: number | null = null,
    operationId: string | null = null, data: Json = {}, after: string | null = null, abort?: AbortSignal) {
    const writing = action === "review" || action === "report_rectification";
    if (action !== "capabilities" && !available) throw new SubscriptionIncidentError("unavailable");
    await live(abort);
    try {
      const query = client.rpc("tc_admin_subscription_incidents", {
        p_action: action, p_case_id: caseId, p_expected: expected,
        p_operation_id: operationId, p_data: data, p_after: after,
      }).setHeader("Authorization", "Bearer " + token);
      const response = await (abort ? query.abortSignal(abort) : signal ? query.abortSignal(signal) : query);
      if (response.error || response.data === null) throw problem(response.error?.code, writing);
      // An old response cannot cross logout, token refresh, user change or close().
      try { await live(abort); }
      catch (error) { if (writing && error instanceof SubscriptionIncidentError && error.kind === "unavailable") throw new SubscriptionIncidentError("uncertain"); throw error; }
      return response.data;
    } catch (error) {
      if (error instanceof SubscriptionIncidentError) throw error;
      if (closed || signal?.aborted || abort?.aborted) throw new SubscriptionIncidentError("cancelled");
      throw new SubscriptionIncidentError(writing ? "uncertain" : "unavailable");
    }
  }
  return {
    close() { closed = true; available = false; },
    async capabilities(abort?: AbortSignal) {
      const result = incidentCapabilitiesSchema.safeParse(await request("capabilities", null, null, null, {}, null, abort));
      if (!result.success) throw new SubscriptionIncidentError("unavailable");
      available = result.data.available;
      return result.data;
    },
    async list(after: string | null = null, abort?: AbortSignal) {
      if (after !== null) z.uuid().parse(after);
      const parsed = incidentPageSchema.safeParse(await request("list", null, null, null, {}, after, abort));
      if (!parsed.success) throw new SubscriptionIncidentError("invalid");
      const page = parsed.data, ids = page.items.map((entry) => entry.id);
      if (new Set(ids).size !== ids.length || ids.some((id, i) => i ? id <= ids[i - 1] : after !== null && id <= after) ||
          (page.next_cursor !== null && page.next_cursor !== ids.at(-1))) throw new SubscriptionIncidentError("invalid");
      return page;
    },
    async detail(caseId: string, abort?: AbortSignal) {
      z.uuid().parse(caseId);
      const parsed = incidentPageSchema.safeParse(await request("detail", caseId, null, null, {}, null, abort));
      if (!parsed.success || parsed.data.items.length !== 1 || parsed.data.items[0].id !== caseId || parsed.data.next_cursor !== null) throw new SubscriptionIncidentError("invalid");
      return parsed.data.items[0];
    },
    async history(caseId: string, beforeVersion: number | null = null, abort?: AbortSignal) {
      z.uuid().parse(caseId);
      if (beforeVersion !== null) z.number().int().positive().safe().parse(beforeVersion);
      const parsed = incidentHistorySchema.safeParse(await request("history", caseId, null, null,
        beforeVersion === null ? {} : { before_version: beforeVersion }, null, abort));
      if (!parsed.success || parsed.data.case_id !== caseId) throw new SubscriptionIncidentError("invalid");
      const result = parsed.data, versions = result.items.map((entry) => entry.row_version);
      const ids = result.items.map((entry) => entry.id);
      if (new Set(ids).size !== ids.length || versions.some((n, i) => i ? n >= versions[i - 1] : beforeVersion !== null && n >= beforeVersion) ||
          (result.next_before_version !== null && result.next_before_version !== versions.at(-1))) throw new SubscriptionIncidentError("invalid");
      return result;
    },
    async mutate(before: SubscriptionIncident, action: IncidentAction, value: unknown, operationId: string, abort?: AbortSignal) {
      const item = subscriptionIncidentSchema.parse(before);
      z.uuid().parse(operationId);
      const input = incidentInput(action, value);
      const raw = await request(action, item.id, item.row_version, operationId, input, null, abort);
      try { return checkedIncidentMutation(raw, item, action, input, operationId, userId); }
      catch { throw new SubscriptionIncidentError("invalid"); }
    },
  };
}
export type SubscriptionIncidentClient = Awaited<ReturnType<typeof createSubscriptionIncidentClient>>;
