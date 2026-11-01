import { ingressReady } from "../company-mail/handler.ts";
export interface ResendConfig {
  enabled: boolean;
  apiKey: string;
  webhookSecret: string;
  domain: string;
  signingKey: string;
}
export function validResendWebhookSecret(value: unknown): value is string {
  if (typeof value !== "string" || !/^whsec_[A-Za-z0-9+/]+={0,2}$/.test(value))
    return false;
  try {
    const encoded = value.slice(6),
      decoded = atob(encoded);
    // Current Resend accounts issue both 24- and 32-byte Svix keys.
    return (
      decoded.length >= 24 &&
      decoded.length <= 64 &&
      btoa(decoded).replace(/=+$/, "") === encoded.replace(/=+$/, "")
    );
  } catch {
    return false;
  }
}
export function resendReady(config: ResendConfig) {
  return (
    config.enabled &&
    /^re_[A-Za-z0-9_-]{20,}$/.test(config.apiKey) &&
    validResendWebhookSecret(config.webhookSecret) &&
    ingressReady({
      origins: [],
      ingress: {
        enabled: true,
        domain: config.domain,
        signingKey: config.signingKey,
      },
    })
  );
}
export function resendConfig(
  policy: Record<string, unknown> | null,
): ResendConfig {
  return {
    enabled: policy?.enabled === true,
    apiKey: typeof policy?.api_key === "string" ? policy.api_key : "",
    webhookSecret:
      typeof policy?.webhook_secret === "string" ? policy.webhook_secret : "",
    domain: typeof policy?.domain === "string" ? policy.domain : "",
    signingKey:
      typeof policy?.signing_key === "string" ? policy.signing_key : "",
  };
}
