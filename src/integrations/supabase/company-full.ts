import type { Session } from "@supabase/supabase-js";
import type { getSupabaseClient } from "./client";
import type { Json } from "./database.types";
import {
  fullCapabilitiesSchema,
  fullPageSchema,
  fullReceiptSchema,
  fullHistorySchema,
} from "../../domain/company-full";
import type { CompanyFullCommand } from "../../domain/company-full";
type Client = NonNullable<ReturnType<typeof getSupabaseClient>>;
type Failure =
  | "unavailable"
  | "capability"
  | "denied"
  | "conflict"
  | "invalid"
  | "changed"
  | "uncertain";
export class CompanyFullError extends Error {
  constructor(readonly reason: Failure) {
    super(reason);
    this.name = "CompanyFullError";
  }
}
export function companyFullErrorMessage(error: unknown) {
  const reason =
    error instanceof CompanyFullError ? error.reason : "unavailable";
  switch (reason) {
    case "capability":
      return "El control de Pack Full por empresa todavía no está disponible. No se ha cambiado ninguna licencia.";
    case "denied":
      return "Tu cuenta no tiene permiso para gestionar estas licencias. Actualiza tu sesión.";
    case "conflict":
      return "Otra persona ha cambiado esta licencia. Revisa su estado actualizado antes de confirmar otro cambio.";
    case "invalid":
      return "No se puede guardar esa solicitud. Revisa el vencimiento y vuelve a comprobar el estado de la empresa.";
    case "changed":
      return "La sesión ha cambiado. Vuelve a abrir la gestión de empresas.";
    case "uncertain":
      return "No hemos podido confirmar el resultado. Reintenta la misma solicitud para comprobarla sin duplicar el cambio.";
    default:
      return "No se puede comprobar el acceso de esta empresa. Comprueba la conexión y reinténtalo.";
  }
}
/** Scope hint only: each RPC is still authorized by the server for its exact JWT. */
export function companyFullSessionKey(session: Session | null) {
  if (!session) return null;
  try {
    const payload = JSON.parse(
      atob(
        session.access_token
          .split(".")[1]
          .replace(/-/g, "+")
          .replace(/_/g, "/"),
      ),
    ) as { session_id?: unknown };
    return (
      session.user.id +
      ":" +
      (typeof payload.session_id === "string"
        ? payload.session_id
        : session.access_token)
    );
  } catch {
    return session.user.id + ":" + session.access_token;
  }
}
async function actor(client: Client, userId: string, current: () => boolean) {
  if (!current()) throw new CompanyFullError("changed");
  const session = await client.auth.getSession();
  if (session.error || session.data.session?.user.id !== userId)
    throw new CompanyFullError("changed");
  const native = session.data.session;
  const identity = await client.auth.getUser(native.access_token);
  if (!current() || identity.error || identity.data.user?.id !== userId)
    throw new CompanyFullError("changed");
  return { token: native.access_token, key: companyFullSessionKey(native) };
}
function failure(error: unknown, mutation: boolean): CompanyFullError {
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "";
  return new CompanyFullError(
    code === "42501"
      ? "denied"
      : code === "40001"
        ? "conflict"
        : code === "22023"
          ? "invalid"
          : mutation
            ? "uncertain"
            : "unavailable",
  );
}
async function rpc(
  client: Client,
  userId: string,
  current: () => boolean,
  args: {
    p_action: string;
    p_org?: string;
    p_expected?: number;
    p_operation?: string;
    p_data?: Json;
    p_after?: string;
  },
  mutation = false,
): Promise<unknown> {
  const scope = await actor(client, userId, current);
  let result;
  try {
    result = await client
      .rpc("tc_admin_company_full", args)
      .setHeader("Authorization", "Bearer " + scope.token);
  } catch (error) {
    throw failure(error, mutation);
  }
  const after = await client.auth.getSession();
  if (
    !current() ||
    after.error ||
    companyFullSessionKey(after.data.session) !== scope.key
  )
    throw new CompanyFullError("changed");
  if (result.error) throw failure(result.error, mutation);
  return result.data;
}
export async function requireCompanyFull(
  client: Client,
  userId: string,
  current: () => boolean,
) {
  let value: unknown;
  try {
    value = await rpc(client, userId, current, { p_action: "capabilities" });
  } catch (error) {
    if (
      error instanceof CompanyFullError &&
      ["denied", "changed"].includes(error.reason)
    )
      throw error;
    throw new CompanyFullError("capability");
  }
  if (!fullCapabilitiesSchema.safeParse(value).success)
    throw new CompanyFullError("capability");
}
export async function listCompanyFull(
  client: Client,
  userId: string,
  current: () => boolean,
  query: string,
  after?: string,
) {
  await requireCompanyFull(client, userId, current);
  const parsed = fullPageSchema.safeParse(
    await rpc(client, userId, current, {
      p_action: "list",
      p_data: { limit: 50, query },
      ...(after ? { p_after: after } : {}),
    }),
  );
  if (!parsed.success) throw new CompanyFullError("unavailable");
  if (
    new Set(parsed.data.items.map((item) => item.organization_id)).size !==
      parsed.data.items.length ||
    (after && parsed.data.next_after === after)
  )
    throw new CompanyFullError("unavailable");
  return parsed.data;
}
export async function setCompanyFull(
  client: Client,
  userId: string,
  current: () => boolean,
  command: CompanyFullCommand,
) {
  await requireCompanyFull(client, userId, current);
  const parsed = fullReceiptSchema.safeParse(
    await rpc(
      client,
      userId,
      current,
      {
        p_action: "set",
        p_org: command.organizationId,
        p_expected: command.expected,
        p_operation: command.operationId,
        p_data: { enabled: command.enabled, expires_at: command.expiresAt },
      },
      true,
    ),
  );
  if (
    !parsed.success ||
    parsed.data.operation_id !== command.operationId ||
    parsed.data.item.organization_id !== command.organizationId ||
    parsed.data.applied_revision !== command.expected + 1 ||
    parsed.data.item.manual_full.revision < parsed.data.applied_revision
  )
    throw new CompanyFullError("uncertain");
  return parsed.data;
}
export async function companyFullHistory(
  client: Client,
  userId: string,
  current: () => boolean,
  organizationId: string,
  before?: number,
) {
  await requireCompanyFull(client, userId, current);
  const parsed = fullHistorySchema.safeParse(
    await rpc(client, userId, current, {
      p_action: "history",
      p_org: organizationId,
      p_data: {
        limit: 50,
        ...(before !== undefined ? { before_revision: before } : {}),
      },
    }),
  );
  if (
    !parsed.success ||
    parsed.data.items.some((item) => item.organization_id !== organizationId) ||
    (before !== undefined &&
      parsed.data.next_before_revision !== null &&
      parsed.data.next_before_revision >= before)
  )
    throw new CompanyFullError("unavailable");
  return parsed.data;
}
