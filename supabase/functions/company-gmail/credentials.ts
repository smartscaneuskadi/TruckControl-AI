import type { GmailOAuthConfig } from "./config.ts";

export type GoogleCredentialResult = "accepted" | "rejected" | "unavailable";
type Credentials = Pick<GmailOAuthConfig, "clientId" | "clientSecret">;

/** Only this closed vocabulary may leave the provider boundary. */
export async function oauthFailureCode(response: Response) {
  try {
    const raw = await response.text();
    if (raw.length > 4096) return "unknown";
    const value = JSON.parse(raw)?.error;
    return ["invalid_client", "unauthorized_client", "invalid_grant"].includes(
      value,
    )
      ? (value as "invalid_client" | "unauthorized_client" | "invalid_grant")
      : "unknown";
  } catch {
    return "unknown";
  }
}

export function validGoogleCredentials(value: {
  clientId?: unknown;
  clientSecret?: unknown;
}): value is Credentials {
  return (
    typeof value.clientId === "string" &&
    /^468881730124-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(
      value.clientId,
    ) &&
    typeof value.clientSecret === "string" &&
    /^GOCSPX[-_][A-Za-z0-9_-]{16,240}$/.test(value.clientSecret)
  );
}

/**
 * Check client authentication with an intentionally invalid, non-user grant.
 * No mailbox, consent, real authorization code, token or message is used.
 * invalid_grant only establishes client authentication, never a linked mailbox.
 */
export function createGoogleCredentialValidator(
  callbackUrl: string,
  fetcher: typeof fetch = fetch,
  now: () => number = Date.now,
) {
  const cached = new Map<
    string,
    { result: GoogleCredentialResult; expires: number }
  >();
  const pending = new Map<string, Promise<GoogleCredentialResult>>();
  return async (credentials: Credentials): Promise<GoogleCredentialResult> => {
    const bytes = new TextEncoder().encode(
      JSON.stringify([
        credentials.clientId,
        credentials.clientSecret,
        callbackUrl,
      ]),
    );
    const fingerprint = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    )
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("");
    const previous = cached.get(fingerprint);
    if (previous && previous.expires > now()) return previous.result;
    const inFlight = pending.get(fingerprint);
    if (inFlight) return inFlight;
    if (pending.size >= 4) return "unavailable";
    const check = (async (): Promise<GoogleCredentialResult> => {
      try {
        const response = await fetcher("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: credentials.clientId,
            client_secret: credentials.clientSecret,
            grant_type: "authorization_code",
            redirect_uri: callbackUrl,
            code: "truckcontrol-configuration-check-not-a-user-authorization-code",
            code_verifier: "d".repeat(43),
          }),
          redirect: "error",
          credentials: "omit",
          referrerPolicy: "no-referrer",
          cache: "no-store",
          signal: AbortSignal.timeout(10000),
        });
        if (![400, 401].includes(response.status)) return "unavailable";
        const code = await oauthFailureCode(response);
        if (code === "invalid_client" || code === "unauthorized_client")
          return "rejected";
        return code === "invalid_grant" && response.status === 400
          ? "accepted"
          : "unavailable";
      } catch {
        return "unavailable";
      }
    })();
    pending.set(fingerprint, check);
    try {
      const result = await check;
      if (result !== "unavailable") {
        if (cached.size >= 4) cached.clear();
        cached.set(fingerprint, { result, expires: now() + 60000 });
      }
      return result;
    } finally {
      pending.delete(fingerprint);
    }
  };
}
