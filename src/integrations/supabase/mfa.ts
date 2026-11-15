import type { Session, User } from "@supabase/supabase-js";
import type { getSupabaseClient } from "./client";

type Client = NonNullable<ReturnType<typeof getSupabaseClient>>;
export type TotpFactor = { id: string; friendly_name?: string };
export type NativeMfaState = {
  user: User;
  token: string;
  currentLevel: "aal1" | "aal2" | null;
  factors: TotpFactor[];
  needsChallenge: boolean;
};
export type PendingTotp = { id: string; secret: string; qrCode: string };
type Failure =
  | "unavailable"
  | "changed"
  | "code"
  | "capability"
  | "disabled"
  | "verification"
  | "aal2"
  | "factor";
export class MfaError extends Error {
  constructor(readonly reason: Failure) {
    super(reason);
    this.name = "MfaError";
  }
}
export const mfaEnrollmentEnabled =
  import.meta.env.VITE_MFA_ENROLLMENT_ENABLED === "true";
export const mfaStateEvent = "truckcontrol:native-mfa-state";
export function notifyMfaChanged(
  reason: "refresh" | "factor-removed" | "signout",
) {
  window.dispatchEvent(new CustomEvent(mfaStateEvent, { detail: reason }));
}
export function mfaErrorMessage(error: unknown) {
  const reason = error instanceof MfaError ? error.reason : "unavailable";
  switch (reason) {
    case "changed":
      return "La sesión ha cambiado. Vuelve a abrir la seguridad de tu cuenta.";
    case "code":
      return "El código no es válido o ha caducado. Prueba el código actual de tu aplicación.";
    case "capability":
      return "La protección del servidor todavía no está disponible. No se ha activado ningún autenticador nuevo.";
    case "disabled":
      return "La activación de nuevos autenticadores todavía no está disponible.";
    case "verification":
      return "No se ha podido confirmar el autenticador. Comprueba su estado antes de reintentar.";
    case "aal2":
      return "Confirma un código de tu autenticador antes de quitarlo.";
    case "factor":
      return "Ese autenticador ya no está disponible. Actualiza la lista.";
    default:
      return "No se puede comprobar la seguridad de la sesión. Comprueba la conexión y reinténtalo.";
  }
}
const current = (isCurrent: () => boolean) => {
  if (!isCurrent()) throw new MfaError("changed");
};

/** A display/gating hint only. Native server validation below and SQL authorize access. */
export function nativeSessionHint(session: Session | null) {
  try {
    if (!session) return null;
    const part = session.access_token
      .split(".")[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    const payload: unknown = JSON.parse(atob(part));
    if (!payload || typeof payload !== "object") return null;
    const value = payload as Record<string, unknown>;
    return {
      aal: value.aal === "aal2" ? "aal2" : value.aal === "aal1" ? "aal1" : null,
      sessionId: typeof value.session_id === "string" ? value.session_id : null,
    };
  } catch {
    return null;
  }
}

/** Revalidate the exact native token and fresh Auth factors, never user metadata. */
export async function readNativeMfa(
  client: Client,
  userId: string,
): Promise<NativeMfaState> {
  const before = await client.auth.getSession();
  const session = before.data.session;
  if (before.error || !session || session.user.id !== userId)
    throw new MfaError("changed");
  const token = session.access_token;
  const identity = await client.auth.getUser(token);
  if (identity.error || !identity.data.user || identity.data.user.id !== userId)
    throw new MfaError("unavailable");
  const all = identity.data.user.factors ?? [];
  if (
    !Array.isArray(all) ||
    all.some(
      (f) =>
        !f ||
        typeof f.id !== "string" ||
        !["verified", "unverified"].includes(f.status),
    )
  )
    throw new MfaError("unavailable");
  const factors = all
    .filter((f) => f.factor_type === "totp" && f.status === "verified")
    .map((f) => ({ id: f.id, friendly_name: f.friendly_name }));
  // A fresh, server-validated factor list is sufficient for ordinary baseline
  // access. Do not claim an MFA assurance level when no verified TOTP exists.
  let level: "aal1" | "aal2" | null = null;
  let sessionBound = false;
  if (factors.length) {
    const assurance =
      await client.auth.mfa.getAuthenticatorAssuranceLevel(token);
    if (
      assurance.error ||
      !assurance.data ||
      ![null, "aal1", "aal2"].includes(assurance.data.currentLevel)
    )
      throw new MfaError("unavailable");
    level =
      assurance.data.currentLevel === "aal2"
        ? "aal2"
        : assurance.data.currentLevel === "aal1"
          ? "aal1"
          : null;
    if (level === "aal2") {
      const verified = await client
        .rpc("tc_verified_session", {})
        .setHeader("Authorization", "Bearer " + token);
      if (verified.error || typeof verified.data !== "boolean")
        throw new MfaError("unavailable");
      sessionBound = verified.data === true;
    }
  }
  const after = await client.auth.getSession();
  if (
    after.error ||
    after.data.session?.user.id !== userId ||
    after.data.session.access_token !== token
  )
    throw new MfaError("changed");
  const currentLevel =
    level === "aal2" ? "aal2" : level === "aal1" ? "aal1" : null;
  return {
    user: identity.data.user,
    token,
    currentLevel,
    factors,
    needsChallenge:
      factors.length > 0 && (currentLevel !== "aal2" || !sessionBound),
  };
}

export function validMfaProtection(value: unknown): boolean {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === 2 &&
    (value as Record<string, unknown>).schema_version === 1 &&
    (value as Record<string, unknown>).totp_enforcement === true,
  );
}
export async function requireMfaProtection(client: Client) {
  try {
    const { data, error } = await client.rpc("tc_mfa_protection_status", {});
    if (error || !validMfaProtection(data)) throw new MfaError("capability");
  } catch {
    throw new MfaError("capability");
  }
}
export async function beginTotp(
  client: Client,
  userId: string,
  isCurrent: () => boolean,
): Promise<PendingTotp> {
  if (!mfaEnrollmentEnabled) throw new MfaError("disabled");
  current(isCurrent);
  const state = await readNativeMfa(client, userId);
  current(isCurrent);
  if (state.needsChallenge) throw new MfaError("aal2");
  await requireMfaProtection(client);
  current(isCurrent);
  const { data, error } = await client.auth.mfa.enroll({
    factorType: "totp",
    issuer: "TruckControl AI",
  });
  current(isCurrent);
  if (
    error ||
    !data ||
    data.type !== "totp" ||
    typeof data.id !== "string" ||
    typeof data.totp?.secret !== "string" ||
    !data.totp.secret ||
    typeof data.totp.qr_code !== "string"
  )
    throw new MfaError("unavailable");
  return { id: data.id, secret: data.totp.secret, qrCode: data.totp.qr_code };
}
function verificationError(error: unknown): MfaError {
  const code =
    error && typeof error === "object" && "code" in error ? error.code : null;
  return new MfaError(
    [
      "mfa_verification_failed",
      "mfa_challenge_expired",
      "validation_failed",
    ].includes(String(code))
      ? "code"
      : "unavailable",
  );
}
export async function verifyTotp(
  client: Client,
  userId: string,
  factorId: string,
  code: string,
  isCurrent: () => boolean,
  enrollment = false,
): Promise<NativeMfaState> {
  if (!/^\d{6}$/.test(code)) throw new MfaError("code");
  current(isCurrent);
  const state = await readNativeMfa(client, userId);
  current(isCurrent);
  if (enrollment) {
    if (!mfaEnrollmentEnabled) throw new MfaError("disabled");
    if (state.needsChallenge) throw new MfaError("aal2");
    await requireMfaProtection(client);
  } else if (!state.factors.some((f) => f.id === factorId))
    throw new MfaError("factor");
  current(isCurrent);
  const challenge = await client.auth.mfa.challenge({ factorId });
  current(isCurrent);
  if (challenge.error || !challenge.data?.id)
    throw verificationError(challenge.error);
  const verified = await client.auth.mfa.verify({
    factorId,
    challengeId: challenge.data.id,
    code,
  });
  current(isCurrent);
  if (verified.error || !verified.data) throw verificationError(verified.error);
  const fresh = await readNativeMfa(client, userId);
  current(isCurrent);
  if (
    fresh.currentLevel !== "aal2" ||
    fresh.needsChallenge ||
    !fresh.factors.some((f) => f.id === factorId)
  )
    throw new MfaError("verification");
  return fresh;
}
export async function removeTotp(
  client: Client,
  userId: string,
  factorId: string,
  isCurrent: () => boolean,
) {
  current(isCurrent);
  const state = await readNativeMfa(client, userId);
  current(isCurrent);
  if (state.currentLevel !== "aal2" || state.needsChallenge)
    throw new MfaError("aal2");
  if (!state.factors.some((f) => f.id === factorId))
    throw new MfaError("factor");
  const { error } = await client.auth.mfa.unenroll({ factorId });
  current(isCurrent);
  if (error) throw new MfaError("unavailable");
  // Removing the session's bound factor can leave a stale aal2 JWT. Suspend
  // before refreshing; a remaining native factor must issue a new challenge.
  notifyMfaChanged("factor-removed");
  const refreshed = await client.auth.refreshSession();
  if (refreshed.error) throw new MfaError("unavailable");
  notifyMfaChanged("refresh");
}

/** SVG is a local image only, never HTML. Reject active/external SVG content. */
export function safeTotpQr(value: string): string | null {
  const prefix = "data:image/svg+xml;utf-8,";
  if (!value.startsWith(prefix) || value.length > 262144) return null;
  let svg = value.slice(prefix.length);
  try {
    if (!svg.trimStart().startsWith("<")) svg = decodeURIComponent(svg);
  } catch {
    return null;
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(svg)) return null;
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  if (
    doc.documentElement.localName !== "svg" ||
    doc.querySelector("parsererror")
  )
    return null;
  const tags = new Set(["svg", "g", "path", "rect"]);
  const attributes = new Set([
    "xmlns",
    "width",
    "height",
    "viewBox",
    "d",
    "fill",
    "x",
    "y",
    "stroke",
    "stroke-width",
    "shape-rendering",
  ]);
  for (const node of [
    doc.documentElement,
    ...doc.documentElement.querySelectorAll("*"),
  ]) {
    if (
      !tags.has(node.localName) ||
      node.namespaceURI !== "http://www.w3.org/2000/svg"
    )
      return null;
    for (const attribute of node.attributes) {
      if (
        !attributes.has(attribute.name) ||
        /url\s*\(|https?:|javascript:|data:|[<>]/i.test(attribute.value)
      ) {
        if (
          attribute.name !== "xmlns" ||
          attribute.value !== "http://www.w3.org/2000/svg"
        )
          return null;
      }
    }
  }
  return (
    "data:image/svg+xml;charset=utf-8," +
    encodeURIComponent(
      new XMLSerializer().serializeToString(doc.documentElement),
    )
  );
}
