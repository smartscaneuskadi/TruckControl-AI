import { mailPeriodBounds, resolveMailPeriod } from "./mail-period.ts";
import type { ReceivedPeriod } from "./mail-period.ts";

/** Optional foreground automation; no stored credential or unattended lease. */
export const openMailAutomationPolicy = {
  version: 1,
  consent_version: "2026-11-17",
  execution: "open_visible_session",
  max_session_ms: 60 * 60 * 1000,
  min_interval_ms: 5 * 60 * 1000,
  max_requests: 10,
  max_new_attachments: 1,
} as const;

export interface OpenSessionMailGrant {
  version: typeof openMailAutomationPolicy.consent_version;
  accepted: true;
  id: string;
  actor_id: string;
  organization_id: string;
  account_id: string;
  session_id: string;
  aal: "aal1" | "aal2";
  mailbox: string;
  provider: "gmail" | "imap";
  period: ReceivedPeriod;
  started_at: string;
  expires_at: string;
}
export class OpenSessionMailError extends Error {
  constructor(
    readonly code:
      | "automation_consent_required"
      | "automation_expired"
      | "automation_context_changed",
  ) {
    super(code);
  }
}
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const keys = [
  "version",
  "accepted",
  "id",
  "actor_id",
  "organization_id",
  "account_id",
  "session_id",
  "aal",
  "mailbox",
  "provider",
  "period",
  "started_at",
  "expires_at",
];
const record = (v: unknown): v is Record<string, unknown> =>
  Boolean(v && typeof v === "object" && !Array.isArray(v));
function iso(value: unknown) {
  if (typeof value !== "string")
    throw new OpenSessionMailError("automation_consent_required");
  const stamp = Date.parse(value);
  if (!Number.isFinite(stamp) || new Date(stamp).toISOString() !== value)
    throw new OpenSessionMailError("automation_consent_required");
  return stamp;
}

/** Dates may narrow after catch-up; an existing grant never expands at midnight. */
export function readOpenSessionMailGrant(
  value: unknown,
  requested: ReceivedPeriod,
  now = Date.now(),
): OpenSessionMailGrant {
  if (
    !record(value) ||
    Object.keys(value).length !== keys.length ||
    Object.keys(value).some((k) => !keys.includes(k)) ||
    value.version !== openMailAutomationPolicy.consent_version ||
    value.accepted !== true ||
    ![
      value.id,
      value.actor_id,
      value.organization_id,
      value.account_id,
      value.session_id,
    ].every((v) => typeof v === "string" && uuid.test(v)) ||
    !["aal1", "aal2"].includes(String(value.aal)) ||
    !["gmail", "imap"].includes(String(value.provider)) ||
    typeof value.mailbox !== "string" ||
    value.mailbox.length > 254 ||
    !/^[^\s<>@\x00-\x1f]+@[^\s<>@\x00-\x1f]+\.[A-Za-z]{2,63}$/.test(
      value.mailbox,
    ) ||
    !record(value.period) ||
    Object.keys(value.period).length !== 2 ||
    !Object.keys(value.period).every((k) => ["from", "to"].includes(k))
  )
    throw new OpenSessionMailError("automation_consent_required");
  const start = iso(value.started_at),
    expires = iso(value.expires_at);
  if (
    !Number.isFinite(now) ||
    start > now + 5000 ||
    expires <= start ||
    expires - start > openMailAutomationPolicy.max_session_ms ||
    now >= expires
  )
    throw new OpenSessionMailError("automation_expired");
  try {
    const authorized = resolveMailPeriod(value.period, now),
      window = resolveMailPeriod(requested, now);
    if (
      authorized.to !== mailPeriodBounds(now).today ||
      expires > authorized.end ||
      window.from < authorized.from ||
      window.to !== authorized.to
    )
      throw Error("fixed_period_changed");
  } catch {
    throw new OpenSessionMailError("automation_expired");
  }
  // Project a copy so mutable request data cannot change a running grant.
  return {
    version: openMailAutomationPolicy.consent_version,
    accepted: true,
    id: value.id as string,
    actor_id: value.actor_id as string,
    organization_id: value.organization_id as string,
    account_id: value.account_id as string,
    session_id: value.session_id as string,
    aal: value.aal as OpenSessionMailGrant["aal"],
    mailbox: value.mailbox,
    provider: value.provider as OpenSessionMailGrant["provider"],
    period: {
      from: value.period.from as string,
      to: value.period.to as string,
    },
    started_at: value.started_at as string,
    expires_at: value.expires_at as string,
  };
}

export function assertOpenSessionMailContext(
  grant: OpenSessionMailGrant,
  expected: {
    actorId: string;
    organizationId: string;
    email: string;
    provider: string;
    accountId?: string;
    sessionId: string;
    aal: string;
  },
  period: ReceivedPeriod,
  now = Date.now(),
) {
  readOpenSessionMailGrant(grant, period, now);
  if (
    grant.actor_id !== expected.actorId ||
    grant.organization_id !== expected.organizationId ||
    grant.mailbox.toLowerCase() !== expected.email.toLowerCase() ||
    grant.provider !== expected.provider ||
    (expected.accountId !== undefined &&
      grant.account_id !== expected.accountId) ||
    grant.session_id !== expected.sessionId ||
    grant.aal !== expected.aal
  )
    throw new OpenSessionMailError("automation_context_changed");
}

/** Call ONLY after Auth has verified this exact bearer and live SID/MFA. Not authentication. */
export function automationIdentityFromVerifiedBearer(
  token: string,
  verifiedUserId: string,
) {
  try {
    const encoded = token
      .split(".")[1]
      .replaceAll("-", "+")
      .replaceAll("_", "/");
    const binary = atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "="));
    const data = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        Uint8Array.from(binary, (c) => c.charCodeAt(0)),
      ),
    );
    if (
      !record(data) ||
      data.sub !== verifiedUserId ||
      typeof data.session_id !== "string" ||
      !uuid.test(data.session_id) ||
      !["aal1", "aal2"].includes(String(data.aal))
    )
      throw Error();
    return { sessionId: data.session_id, aal: data.aal as "aal1" | "aal2" };
  } catch {
    throw new OpenSessionMailError("automation_context_changed");
  }
}
