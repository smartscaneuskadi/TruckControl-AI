import { ingressReady } from "../company-mail/handler.ts";
export interface ResendConfig {
  enabled: boolean;
  apiKey: string;
  webhookSecret: string;
  domain: string;
  signingKey: string;
}
export function resendReady(config: ResendConfig) {
  return (
    config.enabled &&
    /^re_[A-Za-z0-9_-]{20,}$/.test(config.apiKey) &&
    /^whsec_[A-Za-z0-9+/=]{40,}$/.test(config.webhookSecret) &&
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
