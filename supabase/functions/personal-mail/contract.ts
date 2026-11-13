export interface MailConnection {
  email: string;
  username: string;
  password: string;
  imapHost: string;
  smtpHost: string;
}
/** This optional connector has its own disclosure; registration terms keep their version. */
export const mailConnectorConsentVersion = "2026-11-13" as const;
export interface MailConnectorConsent {
  version: typeof mailConnectorConsentVersion;
  accepted: true;
}
export function connectionConsent(value: unknown): MailConnectorConsent {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ConnectionError("consent_required");
  const consent = value as Record<string, unknown>;
  if (
    consent.version !== mailConnectorConsentVersion ||
    consent.accepted !== true ||
    Object.keys(consent).some((key) => !["version", "accepted"].includes(key))
  )
    throw new ConnectionError("consent_required");
  return { version: mailConnectorConsentVersion, accepted: true };
}
export class ConnectionError extends Error {
  constructor(
    readonly code:
      | "invalid"
      | "denied"
      | "unavailable"
      | "too_large"
      | "send_uncertain"
      | "consent_required",
  ) {
    super(code);
  }
}
export function mailHost(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 253 &&
    /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(value) &&
    value.includes(".") &&
    !/^\d+(?:\.\d+)*$/.test(value) &&
    !/(?:^|\.)(?:localhost|local|internal|test|invalid|example|onion)$/i.test(
      value,
    ) &&
    value
      .split(".")
      .every(
        (part) =>
          part.length > 0 &&
          part.length <= 63 &&
          !part.startsWith("-") &&
          !part.endsWith("-"),
      )
  );
}
export function connectionConfig(value: unknown): MailConnection {
  if (!value || typeof value !== "object") throw new ConnectionError("invalid");
  const v = value as Record<string, unknown>;
  if (
    typeof v.email !== "string" ||
    v.email.length > 254 ||
    !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}$/.test(
      v.email,
    ) ||
    typeof v.username !== "string" ||
    !v.username ||
    v.username.length > 254 ||
    /[\x00-\x1f\x7f]/.test(v.username) ||
    typeof v.password !== "string" ||
    !v.password ||
    v.password.length > 2048 ||
    /[\r\n\x00]/.test(v.password) ||
    !mailHost(v.imapHost) ||
    !mailHost(v.smtpHost)
  )
    throw new ConnectionError("invalid");
  return {
    email: v.email,
    username: v.username,
    password: v.password,
    imapHost: v.imapHost.toLowerCase(),
    smtpHost: v.smtpHost.toLowerCase(),
  };
}
/** Reject special-use IPv4 ranges before pinning a resolved address to TLS. IPv6 is not used. */
export function publicMailIp(value: string): boolean {
  const parts = value.split(".");
  if (
    parts.length !== 4 ||
    parts.some((p) => !/^\d{1,3}$/.test(p) || Number(p) > 255)
  )
    return false;
  const [a, b, c] = parts.map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168 || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}
export function messageRef(
  path: string,
  validity: string,
  uid: number,
): string {
  const bytes = new TextEncoder().encode(JSON.stringify([path, validity, uid]));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}
export function parseMessageRef(value: unknown): {
  path: string;
  validity: string;
  uid: number;
} {
  if (
    typeof value !== "string" ||
    value.length > 2048 ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  )
    throw new ConnectionError("invalid");
  try {
    const s = value.replaceAll("-", "+").replaceAll("_", "/");
    const v = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob(s.padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) =>
          c.charCodeAt(0),
        ),
      ),
    );
    if (
      !Array.isArray(v) ||
      v.length !== 3 ||
      typeof v[0] !== "string" ||
      !v[0] ||
      v[0].length > 512 ||
      /[\x00-\x1f\x7f]/.test(v[0]) ||
      typeof v[1] !== "string" ||
      !/^\d{1,20}$/.test(v[1]) ||
      !Number.isSafeInteger(v[2]) ||
      v[2] < 1 ||
      v[2] > 4294967295
    )
      throw Error();
    return { path: v[0], validity: v[1], uid: v[2] };
  } catch {
    throw new ConnectionError("invalid");
  }
}
export type MailFolder =
  "inbox" | "sent" | "starred" | "drafts" | "all" | "trash";
export interface MailDraft {
  to: string;
  cc: string;
  subject: string;
  text: string;
  threadId?: string;
  inReplyTo?: string;
}
export interface MailSummary {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  labels: string[];
}
export interface MailMessage extends MailSummary {
  text: string;
  htmlConverted: boolean;
  messageId: string;
  attachments: {
    id: string;
    name: string;
    type: string;
    bytes: number;
    inlineData?: string;
  }[];
}
export function validateDraft(value: unknown): {
  draft: MailDraft;
  to: string[];
  cc: string[];
} {
  if (!value || typeof value !== "object") throw new ConnectionError("invalid");
  const draft = value as MailDraft;
  if (
    typeof draft.to !== "string" ||
    typeof draft.cc !== "string" ||
    typeof draft.subject !== "string" ||
    typeof draft.text !== "string" ||
    draft.to.length > 2000 ||
    draft.cc.length > 2000 ||
    !draft.subject.trim() ||
    draft.subject.length > 200 ||
    /[\r\n\x00]/.test(draft.subject) ||
    !draft.text.trim() ||
    new TextEncoder().encode(draft.text).length > 512 * 1024 ||
    (draft.inReplyTo &&
      (typeof draft.inReplyTo !== "string" ||
        !/^<[^\s<>\x00-\x1f]{1,250}>$/.test(draft.inReplyTo)))
  )
    throw new ConnectionError("invalid");
  const parse = (s: string) =>
    s
      .split(/[,;]/)
      .map((x) => x.trim())
      .filter(Boolean);
  const to = parse(draft.to),
    cc = parse(draft.cc);
  if (
    !to.length ||
    to.length + cc.length > 20 ||
    [...to, ...cc].some(
      (s) =>
        s.length > 254 ||
        !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}$/.test(
          s,
        ),
    )
  )
    throw new ConnectionError("invalid");
  return { draft, to: [...new Set(to)], cc: [...new Set(cc)] };
}
export function plainMail(value: string): string {
  return value
    .replace(/<(script|style|head|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(?:br|\/p|\/div|\/li|\/tr|\/h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(
      /&(amp|lt|gt|quot|apos|nbsp);/g,
      (_, k: string) =>
        ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " })[k] ??
        "",
    )
    .trim();
}
