import { mailPeriodPolicy, resolveMailPeriod } from "../_shared/mail-period.ts";
import type { MailReadWindow } from "../_shared/mail-period.ts";
import { base64url, fromBase64, hash, isUuid } from "../_shared/invoice.ts";
import {
  connectionConfig,
  connectionConsent,
} from "../personal-mail/contract.ts";
import type { MailConnection } from "../personal-mail/contract.ts";
import type { ParsedMail } from "../_shared/mail.ts";
import {
  openMailAutomationPolicy,
  readOpenSessionMailGrant,
  OpenSessionMailError,
} from "../_shared/mail-automation.ts";
import type { OpenSessionMailGrant } from "../_shared/mail-automation.ts";

export const connectedMailConsentVersion = "2026-11-16" as const;
export const connectedMailImportVersion = 1 as const;
export const connectedMailLimits = {
  messages: 50,
  attachments: 10,
  fileBytes: 10 * 1024 * 1024,
  batchBytes: 20 * 1024 * 1024,
  cursorLifetime: 60 * 60 * 1000,
} as const;
export class ConnectedMailError extends Error {
  constructor(
    readonly code: string,
    readonly status = 400,
  ) {
    super(code);
  }
}
export interface ConnectedMailRequest {
  organizationId: string;
  provider: "gmail" | "imap";
  email: string;
  period: MailReadWindow;
  cursor: string | null;
  gmailAccessToken?: string;
  connection?: MailConnection;
  automation?: OpenSessionMailGrant;
}
export interface ConnectedImportCounters {
  imported: number;
  skipped: number;
  failures: number;
  /** Completed applications, not a claim about provider billing after a timeout. */
  ai_used: number;
}
export interface ConnectedScanContext {
  userId: string;
  signal: AbortSignal;
  now(): number;
  assertCurrent(): Promise<void>;
  importParsed(mail: ParsedMail): Promise<ConnectedImportCounters>;
}
export interface ConnectedScanResult extends ConnectedImportCounters {
  examined: number;
  has_more: boolean;
  next_cursor: string | null;
}
export type ConnectedMailboxScanner = (
  request: ConnectedMailRequest,
  context: ConnectedScanContext,
) => Promise<ConnectedScanResult>;
export function connectedMailboxCapability(key: string | undefined) {
  return typeof key === "string" &&
    key.length >= 32 &&
    key.length <= 512 &&
    !/\s/.test(key)
    ? {
        version: connectedMailImportVersion,
        consent_version: connectedMailConsentVersion,
        providers: ["gmail", "imap"],
        max_messages: connectedMailLimits.messages,
        max_attachments: connectedMailLimits.attachments,
        received_period_policy: mailPeriodPolicy,
        automation: openMailAutomationPolicy,
      }
    : null;
}
/** A malformed optional environment value must not mask the existing valid Vault key. */
export function selectConnectedMailboxCursorKey(
  ...candidates: (string | undefined)[]
) {
  return (
    candidates.find((value) => connectedMailboxCapability(value) !== null) ?? ""
  );
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function email(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value.length > 254 ||
    !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}$/.test(
      value,
    )
  )
    return null;
  return value.toLowerCase();
}
function exactKeys(value: Record<string, unknown>, keys: string[]) {
  return Object.keys(value).every((key) => keys.includes(key));
}
function periodInput(value: unknown) {
  if (
    !object(value) ||
    !exactKeys(value, ["from", "to", "time_zone"]) ||
    (value.time_zone !== undefined &&
      value.time_zone !== mailPeriodPolicy.time_zone)
  )
    throw new ConnectedMailError("invalid_received_period");
  return value;
}
/** A request grants only this account and calendar range; it is never a background lease. */
export function connectedMailRequest(
  body: Record<string, unknown>,
  now: number,
): ConnectedMailRequest {
  const allowed = [
    "action",
    "organization_id",
    "provider",
    "email",
    "period",
    "analyze",
    "consent",
    "cursor",
    "gmail_access_token",
    "connection",
    "connector_consent",
    "automation",
  ];
  if (
    !exactKeys(body, allowed) ||
    body.action !== "import_connected_mailbox" ||
    !isUuid(body.organization_id) ||
    !["gmail", "imap"].includes(String(body.provider)) ||
    body.analyze !== true
  )
    throw new ConnectedMailError("invalid_request");
  const address = email(body.email);
  if (!address) throw new ConnectedMailError("invalid_request");
  let period: MailReadWindow;
  try {
    period = resolveMailPeriod(periodInput(body.period), now);
  } catch {
    throw new ConnectedMailError("invalid_received_period");
  }
  const consent = body.consent;
  if (
    !object(consent) ||
    !exactKeys(consent, [
      "version",
      "accepted",
      "mailbox",
      "provider",
      "period",
    ]) ||
    consent.version !== connectedMailConsentVersion ||
    consent.accepted !== true ||
    email(consent.mailbox) !== address ||
    consent.provider !== body.provider
  )
    throw new ConnectedMailError("mailbox_import_consent_required", 428);
  try {
    const authorized = periodInput(consent.period);
    if (authorized.from !== period.from || authorized.to !== period.to)
      throw Error();
  } catch {
    throw new ConnectedMailError("mailbox_import_consent_required", 428);
  }
  const cursor =
    body.cursor === undefined || body.cursor === null ? null : body.cursor;
  if (
    cursor !== null &&
    (typeof cursor !== "string" ||
      cursor.length > 8000 ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(cursor))
  )
    throw new ConnectedMailError("invalid_mailbox_cursor", 409);
  const result: ConnectedMailRequest = {
    organizationId: body.organization_id,
    provider: body.provider as "gmail" | "imap",
    email: address,
    period,
    cursor,
  };
  if (body.automation !== undefined) {
    try {
      result.automation = readOpenSessionMailGrant(
        body.automation,
        period,
        now,
      );
      if (
        result.automation.organization_id !== result.organizationId ||
        result.automation.provider !== result.provider ||
        result.automation.mailbox.toLowerCase() !== result.email
      )
        throw new OpenSessionMailError("automation_context_changed");
    } catch (error) {
      throw new ConnectedMailError(
        error instanceof OpenSessionMailError
          ? error.code
          : "automation_consent_required",
        428,
      );
    }
  }
  if (body.provider === "gmail") {
    if (
      body.connection !== undefined ||
      body.connector_consent !== undefined ||
      typeof body.gmail_access_token !== "string" ||
      body.gmail_access_token.length < 16 ||
      body.gmail_access_token.length > 8192 ||
      /[\x00-\x20\x7f]/.test(body.gmail_access_token)
    )
      throw new ConnectedMailError("invalid_mailbox_connection");
    result.gmailAccessToken = body.gmail_access_token;
  } else {
    if (body.gmail_access_token !== undefined)
      throw new ConnectedMailError("invalid_mailbox_connection");
    try {
      connectionConsent(body.connector_consent);
      result.connection = connectionConfig(body.connection);
      if (email(result.connection.email) !== address) throw Error();
    } catch {
      throw new ConnectedMailError("invalid_mailbox_connection");
    }
  }
  return result;
}
export async function connectedScope(
  request: ConnectedMailRequest,
  userId: string,
) {
  const identity = [
    "connected-mail-v1",
    request.organizationId,
    userId,
    request.provider,
    request.email,
    request.connection?.imapHost ?? "",
    request.connection?.username ?? "",
    request.period.key,
  ];
  if (request.automation)
    identity.push(
      "open-session-v1",
      request.automation.id,
      request.automation.account_id,
      request.automation.session_id,
      request.automation.aal,
      request.automation.started_at,
      request.automation.expires_at,
      request.automation.period.from,
      request.automation.period.to,
    );
  return hash(new TextEncoder().encode(JSON.stringify(identity)));
}
const purpose = "truckcontrol-connected-mail-cursor-v1:";
const encoder = new TextEncoder();
export interface ConnectedCursor<T> {
  state: T;
  expires: number;
}
/** Cursor MAC is domain-separated from mail delivery signatures; no mailbox credential is encoded. */
export async function encodeConnectedCursor<T>(
  key: string,
  scope: string,
  state: T,
  now: number,
) {
  if (!connectedMailboxCapability(key))
    throw new ConnectedMailError("connected_mailbox_unavailable", 503);
  const payload = base64url(
    encoder.encode(
      JSON.stringify({
        v: 1,
        scope,
        expires: now + connectedMailLimits.cursorLifetime,
        state,
      }),
    ),
  );
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    encoder.encode(purpose + payload),
  );
  const result = payload + "." + base64url(new Uint8Array(signature));
  if (result.length > 8000)
    throw new ConnectedMailError("invalid_mailbox_cursor", 409);
  return result;
}
export async function decodeConnectedCursor<T>(
  key: string,
  scope: string,
  cursor: string | null,
  now: number,
): Promise<T | null> {
  if (!cursor) return null;
  try {
    if (!connectedMailboxCapability(key) || cursor.length > 8000) throw Error();
    const [payload, signature, extra] = cursor.split(".");
    if (
      !payload ||
      !signature ||
      extra ||
      !/^[A-Za-z0-9_-]+$/.test(payload) ||
      !/^[A-Za-z0-9_-]{43}$/.test(signature)
    )
      throw Error();
    if (
      base64url(fromBase64(payload)) !== payload ||
      base64url(fromBase64(signature)) !== signature
    )
      throw Error();
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode(key),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    if (
      !(await crypto.subtle.verify(
        "HMAC",
        cryptoKey,
        new Uint8Array(fromBase64(signature)).buffer,
        encoder.encode(purpose + payload),
      ))
    )
      throw Error();
    const value = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(fromBase64(payload)),
    );
    if (
      !object(value) ||
      value.v !== 1 ||
      value.scope !== scope ||
      !Number.isSafeInteger(value.expires) ||
      Number(value.expires) <= now ||
      Number(value.expires) > now + connectedMailLimits.cursorLifetime ||
      !object(value.state)
    )
      throw Error();
    return value.state as T;
  } catch {
    throw new ConnectedMailError("invalid_mailbox_cursor", 409);
  }
}
export function emptyConnectedCounters(): ConnectedScanResult {
  return {
    imported: 0,
    skipped: 0,
    failures: 0,
    ai_used: 0,
    examined: 0,
    has_more: false,
    next_cursor: null,
  };
}
export function addConnectedCounters(
  target: ConnectedImportCounters,
  addition: ConnectedImportCounters,
) {
  target.imported += addition.imported;
  target.skipped += addition.skipped;
  target.failures += addition.failures;
  target.ai_used += addition.ai_used;
}
