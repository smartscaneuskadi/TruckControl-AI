import { personalMailScope } from "./gmail";
export interface GoogleToken {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  token_type?: string;
}
export interface GoogleMailOAuth {
  initTokenClient(options: {
    client_id: string;
    scope: string;
    include_granted_scopes: boolean;
    callback(response: GoogleToken): void;
    error_callback(error: { type?: string }): void;
  }): { requestAccessToken(options: { prompt: string }): void };
  revoke(token: string, callback: () => void): void;
}
declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleMailOAuth } };
  }
}
export const publicGoogleClientId = (value: unknown): value is string =>
  typeof value === "string" &&
  /^468881730124-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(value);
let pending: Promise<GoogleMailOAuth> | null = null;
export function loadGoogleMailOAuth(): Promise<GoogleMailOAuth> {
  if (window.google?.accounts?.oauth2)
    return Promise.resolve(window.google.accounts.oauth2);
  if (pending) return pending;
  pending = new Promise<GoogleMailOAuth>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.id = "truckcontrol-personal-mail-oauth";
    const fail = () => {
      clearTimeout(timeout);
      script.remove();
      pending = null;
      reject(new Error("google_script_unavailable"));
    };
    const timeout = window.setTimeout(fail, 20000);
    script.onload = () => {
      const oauth = window.google?.accounts?.oauth2;
      if (!oauth) {
        fail();
        return;
      }
      clearTimeout(timeout);
      resolve(oauth);
    };
    script.onerror = fail;
    document.head.append(script);
  });
  return pending;
}
export function grantedMailToken(value: GoogleToken, now = Date.now()) {
  if (
    value.error ||
    typeof value.access_token !== "string" ||
    !value.access_token ||
    value.access_token.length > 4096 ||
    /\s/.test(value.access_token) ||
    value.token_type?.toLowerCase() !== "bearer" ||
    !value.scope?.split(" ").includes(personalMailScope) ||
    !Number.isFinite(Number(value.expires_in)) ||
    Number(value.expires_in) < 30
  )
    throw new Error("permission_required");
  return {
    token: value.access_token,
    expiresAt: now + (Math.min(Number(value.expires_in), 3600) - 15) * 1000,
  };
}
