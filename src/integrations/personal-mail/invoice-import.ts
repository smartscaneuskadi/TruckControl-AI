import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";
import { getSupabaseClient } from "../supabase/client";
import { nativeSessionHint } from "../supabase/mfa";
import {
  mailPeriodPolicy,
  resolveMailPeriod,
} from "../../../supabase/functions/_shared/mail-period";
import type { ReceivedPeriod } from "../../../supabase/functions/_shared/mail-period";
import type { MailConnection } from "./imap";

export const connectedInvoiceConsentVersion = "2026-11-16";
export type ConnectedMailProvider = "gmail" | "imap";
export interface ConnectedInvoiceConsent {
  version: typeof connectedInvoiceConsentVersion;
  accepted: true;
  mailbox: string;
  provider: ConnectedMailProvider;
  period: ReceivedPeriod;
}
export interface ConnectedInvoiceImportRequest {
  organizationId: string;
  actorId: string;
  provider: ConnectedMailProvider;
  email: string;
  period: ReceivedPeriod;
  consent: ConnectedInvoiceConsent;
  cursor?: string | null;
}
export interface ConnectedInvoiceImportResult {
  authorization_scope: "selected_mailbox_period";
  consent_version: typeof connectedInvoiceConsentVersion;
  imported: number;
  skipped: number;
  failures: number;
  ai_used: number;
  examined: number;
  has_more: boolean;
  next_cursor: string | null;
  received_period: ReceivedPeriod & { time_zone: "Europe/Madrid" };
}
export interface ConnectedInvoiceReadiness {
  ready: boolean;
  aiEnabled: boolean;
}
export class ConnectedInvoiceImportError extends Error {
  constructor(
    readonly code:
      | "expired"
      | "denied"
      | "consent_required"
      | "invalid_period"
      | "identity_mismatch"
      | "backend_outdated"
      | "budget"
      | "unavailable"
      | "uncertain",
  ) {
    super(code);
  }
}
type ImportCredentials =
  | { gmail_access_token: string }
  | {
      connection: MailConnection;
      connector_consent: { version: "2026-11-13"; accepted: true };
    };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const address = /^[^\s<>@\x00-\x1f]{1,200}@[^\s<>@\x00-\x1f]{1,200}\.[A-Za-z]{2,63}$/;

export function validateConnectedInvoiceRequest(
  request: ConnectedInvoiceImportRequest,
  now = Date.now(),
) {
  if (
    !uuid.test(request.organizationId) ||
    !uuid.test(request.actorId) ||
    !["gmail", "imap"].includes(request.provider) ||
    !address.test(request.email) ||
    request.email.length > 254 ||
    (request.cursor != null &&
      (typeof request.cursor !== "string" ||
        !request.cursor.length ||
        request.cursor.length > 8192 ||
        /[\x00-\x20\x7f]/.test(request.cursor)))
  )
    throw new ConnectedInvoiceImportError("denied");
  let period: ReceivedPeriod;
  try {
    const checked = resolveMailPeriod(request.period, now);
    period = { from: checked.from, to: checked.to };
  } catch {
    throw new ConnectedInvoiceImportError("invalid_period");
  }
  const consent = request.consent;
  if (
    consent?.version !== connectedInvoiceConsentVersion ||
    consent.accepted !== true ||
    consent.provider !== request.provider ||
    consent.mailbox !== request.email ||
    consent.period?.from !== period.from ||
    consent.period?.to !== period.to
  )
    throw new ConnectedInvoiceImportError("consent_required");
  return period;
}

export function connectedInvoiceCapability(value: unknown): value is {
  ai_enabled: boolean;
  connected_mailbox_import: { providers: ConnectedMailProvider[] };
} {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  const capability = data.connected_mailbox_import as Record<string, unknown> | undefined;
  const policy = capability?.received_period_policy as Record<string, unknown> | undefined;
  return Boolean(
    typeof data.ai_enabled === "boolean" &&
      capability?.version === 1 &&
      capability.consent_version === connectedInvoiceConsentVersion &&
      capability.max_messages === 50 &&
      capability.max_attachments === 10 &&
      Array.isArray(capability.providers) &&
      capability.providers.length === 2 &&
      capability.providers.includes("gmail") &&
      capability.providers.includes("imap") &&
      policy?.version === mailPeriodPolicy.version &&
      policy.default_days === mailPeriodPolicy.default_days &&
      policy.max_months === mailPeriodPolicy.max_months &&
      policy.time_zone === mailPeriodPolicy.time_zone &&
      policy.action === mailPeriodPolicy.action,
  );
}

export function connectedInvoiceResult(
  value: unknown,
  expected: ReceivedPeriod,
): ConnectedInvoiceImportResult {
  const data = value as ConnectedInvoiceImportResult | null;
  if (
    !data ||
    data.authorization_scope !== "selected_mailbox_period" ||
    data.consent_version !== connectedInvoiceConsentVersion ||
    ![data.imported, data.skipped, data.failures, data.ai_used, data.examined].every(
      (count) => Number.isSafeInteger(count) && count >= 0 && count <= 1000,
    ) ||
    data.imported > 10 ||
    data.ai_used > 10 ||
    data.ai_used > data.imported ||
    data.examined > 50 ||
    typeof data.has_more !== "boolean" ||
    (data.has_more
      ? typeof data.next_cursor !== "string" ||
        !data.next_cursor.length ||
        data.next_cursor.length > 8192 ||
        /[\x00-\x20\x7f]/.test(data.next_cursor)
      : data.next_cursor !== null) ||
    data.received_period?.from !== expected.from ||
    data.received_period?.to !== expected.to ||
    data.received_period?.time_zone !== "Europe/Madrid"
  )
    throw new ConnectedInvoiceImportError("uncertain");
  // Project only the contract: arbitrary server fields never reach UI state.
  return {
    authorization_scope: "selected_mailbox_period",
    consent_version: connectedInvoiceConsentVersion,
    imported: data.imported,
    skipped: data.skipped,
    failures: data.failures,
    ai_used: data.ai_used,
    examined: data.examined,
    has_more: data.has_more,
    next_cursor: data.next_cursor,
    received_period: { from: expected.from, to: expected.to, time_zone: "Europe/Madrid" },
  };
}

function safeImportError(code: unknown): ConnectedInvoiceImportError["code"] {
  if (["authentication_required", "expired", "session_changed", "mailbox_authorization_required"].includes(String(code))) return "expired";
  if (["consent_required", "connected_mailbox_consent_required", "mailbox_import_consent_required"].includes(String(code))) return "consent_required";
  if (["identity_mismatch", "mailbox_identity_mismatch"].includes(String(code))) return "identity_mismatch";
  if (["invalid_period", "invalid_received_period"].includes(String(code))) return "invalid_period";
  if (["budget_exceeded", "budget_unavailable", "ai_budget_exceeded", "ai_budget_unavailable", "quota_exceeded"].includes(String(code))) return "budget";
  if (["forbidden", "permission_denied", "access_denied", "ai_disabled", "denied", "company_access_denied"].includes(String(code))) return "denied";
  if (["unsupported_action", "connected_mailbox_import_unavailable"].includes(String(code))) return "backend_outdated";
  return "unavailable";
}

/** One captured TruckControl session per operation; neither mailbox credentials nor tokens are persisted. */
async function invokeScoped(
  organizationId: string,
  actorId: string,
  body: Record<string, unknown>,
  signal: AbortSignal,
  client: SupabaseClient<Database> | null = getSupabaseClient(),
) {
  signal.throwIfAborted();
  if (!client || !uuid.test(organizationId) || !uuid.test(actorId))
    throw new ConnectedInvoiceImportError("expired");
  const initial = await client.auth.getSession();
  signal.throwIfAborted();
  const session = initial.data.session;
  if (initial.error || !session || session.user.id !== actorId)
    throw new ConnectedInvoiceImportError("expired");
  const hint = nativeSessionHint(session);
  const token = session.access_token;
  const identityAbort = new AbortController();
  const activeSignal = AbortSignal.any([signal, identityAbort.signal]);
  let current = true;
  const matches = (next: typeof session | null) => Boolean(
    next && next.user.id === actorId &&
    (hint?.sessionId ? nativeSessionHint(next)?.sessionId === hint.sessionId : next.access_token === token) &&
    nativeSessionHint(next)?.aal === hint?.aal,
  );
  const { data: listener } = client.auth.onAuthStateChange((_event, next) => {
    if (!matches(next)) { current = false; identityAbort.abort(); }
  });
  const verify = async () => {
    activeSignal.throwIfAborted();
    const next = await client.auth.getSession();
    if (next.error || !matches(next.data.session)) current = false;
    if (!current) throw new ConnectedInvoiceImportError("expired");
    activeSignal.throwIfAborted();
  };
  try {
    await verify();
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
    if (!url || !key?.startsWith("sb_publishable_")) throw new ConnectedInvoiceImportError("unavailable");
    const endpoint = new URL(url);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname) &&
      (typeof window === "undefined" || ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname));
    if (
      endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== "/" ||
      (endpoint.origin !== "https://kkkemaycedexymrpaqtp.supabase.co" && !(loopback && endpoint.protocol === "http:"))
    ) throw new ConnectedInvoiceImportError("unavailable");
    const transport = globalThis.fetch.bind(globalThis);
    const scoped = createClient<Database>(url, key, {
      accessToken: async () => { await verify(); return token; },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: async (input, init) => {
        await verify();
        const destination = new URL(typeof input === "string" ? input : input instanceof Request ? input.url : input.href);
        if (destination.origin !== endpoint.origin || destination.pathname !== "/functions/v1/company-mail" ||
          destination.username || destination.password || destination.search || destination.hash)
          throw new ConnectedInvoiceImportError("denied");
        return transport(input, {
          ...init,
          redirect: "error", credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer",
          signal: AbortSignal.any([activeSignal, ...(init?.signal ? [init.signal] : [])]),
        });
      } },
    });
    const { data, error } = await scoped.functions.invoke("company-mail", {
      body: { ...body, organization_id: organizationId }, signal: activeSignal, timeout: body.action === "status" ? 20000 : 150000,
    });
    await verify();
    if (error) {
      if ("context" in error && error.context instanceof Response) {
        const response = await error.context.json().catch(() => null);
        throw new ConnectedInvoiceImportError(safeImportError(response?.error));
      }
      throw new ConnectedInvoiceImportError(body.action === "status" ? "unavailable" : "uncertain");
    }
    return data as unknown;
  } finally {
    current = false;
    identityAbort.abort();
    listener.subscription.unsubscribe();
  }
}

export async function connectedInvoiceReadiness(
  organizationId: string,
  actorId: string,
  signal: AbortSignal,
): Promise<ConnectedInvoiceReadiness> {
  const status = await invokeScoped(organizationId, actorId, { action: "status" }, signal);
  return connectedInvoiceCapability(status)
    ? { ready: true, aiEnabled: status.ai_enabled }
    : { ready: false, aiEnabled: false };
}

export async function importFromConnectedMailbox(
  request: ConnectedInvoiceImportRequest,
  credentials: ImportCredentials,
  signal: AbortSignal,
): Promise<ConnectedInvoiceImportResult> {
  const period = validateConnectedInvoiceRequest(request);
  const validCredentials = request.provider === "gmail"
    ? "gmail_access_token" in credentials && credentials.gmail_access_token.length > 0 && credentials.gmail_access_token.length <= 4096 && !/\s/.test(credentials.gmail_access_token)
    : "connection" in credentials && credentials.connection.email === request.email && credentials.connector_consent.version === "2026-11-13" && credentials.connector_consent.accepted === true;
  if (!validCredentials) throw new ConnectedInvoiceImportError("consent_required");
  signal.throwIfAborted();
  const data = await invokeScoped(request.organizationId, request.actorId, {
    action: "import_connected_mailbox", provider: request.provider, email: request.email,
    period, consent: { ...request.consent, period }, analyze: true,
    cursor: request.cursor ?? null, ...credentials,
  }, signal);
  signal.throwIfAborted();
  return connectedInvoiceResult(data, period);
}
