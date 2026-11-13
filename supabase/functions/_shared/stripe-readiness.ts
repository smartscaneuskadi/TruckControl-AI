import { stripeServerKeyMode } from "./stripe-server-key.ts";
/** Internal read-only provider inspection. Called only after human session/admin authorization. */
export const readinessAccount = "acct_1UZSsJCWctKw8slH";
export const readinessEndpoint = "we_1Ub5lBCWctKw8slHXmnq0PZd";
export const readinessUrl =
  "https://kkkemaycedexymrpaqtp.supabase.co/functions/v1/truckcontrol-stripe-fiscal";
const events = [
  "checkout.session.async_payment_succeeded",
  "checkout.session.completed",
  "invoice.paid",
];
export interface StripeReadinessConfig {
  stripeKey?: string;
  fiscalSigningSecret?: string;
}
export interface StripeReadinessReport {
  contract: "truckcontrol-stripe-readiness-v1";
  checked_at: string;
  stripe_key_configured: boolean;
  key_mode: "live" | "test" | null;
  fiscal_signing_secret_format_valid: boolean;
  account_checked: boolean;
  account_status: number | null;
  account_id: string | null;
  expected_account: boolean;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  webhook_checked: boolean;
  webhook_status: number | null;
  webhook_id_matches: boolean;
  webhook_url_matches: boolean;
  webhook_events_match: boolean;
  webhook_api_version_matches: boolean;
  webhook_disabled: boolean | null;
  signature_delivery_verified: false;
  payment_or_customer_mutations: 0;
}
export type CredentialConfigurationState =
  "missing" | "invalid_format" | "valid_format";
export interface StripeReadinessDetails extends Omit<
  StripeReadinessReport,
  "contract"
> {
  contract: "truckcontrol-stripe-readiness-v2";
  credential_state: CredentialConfigurationState;
  signing_secret_state: CredentialConfigurationState;
}
/** Fixed categories only; no credential value, fragment, length or fingerprint leaves this function. */
export function describeStripeReadiness(
  report: StripeReadinessReport,
  config: StripeReadinessConfig,
): StripeReadinessDetails {
  const mode = stripeServerKeyMode(config.stripeKey);
  const credential_state: CredentialConfigurationState = !config.stripeKey
    ? "missing"
    : mode
      ? "valid_format"
      : "invalid_format";
  const signing_secret_state: CredentialConfigurationState =
    !config.fiscalSigningSecret
      ? "missing"
      : /^whsec_[A-Za-z0-9]{16,240}$/.test(config.fiscalSigningSecret)
        ? "valid_format"
        : "invalid_format";
  if (
    report.stripe_key_configured !== (credential_state === "valid_format") ||
    report.key_mode !== mode ||
    report.fiscal_signing_secret_format_valid !==
      (signing_secret_state === "valid_format")
  )
    throw Error("stripe_readiness_unavailable");
  return {
    ...report,
    contract: "truckcontrol-stripe-readiness-v2",
    credential_state,
    signing_secret_state,
  };
}
async function providerObject(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw Error("missing_body");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 32768) throw Error("body_limit");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  const value = JSON.parse(new TextDecoder().decode(bytes));
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("invalid_body");
  return value;
}
export async function inspectStripeReadiness(
  config: StripeReadinessConfig,
  fetcher: typeof fetch,
  clock: () => number = Date.now,
): Promise<StripeReadinessReport> {
  const mode = stripeServerKeyMode(config.stripeKey);
  const result: StripeReadinessReport = {
    contract: "truckcontrol-stripe-readiness-v1",
    checked_at: new Date(clock()).toISOString(),
    stripe_key_configured: mode !== null,
    key_mode: mode,
    fiscal_signing_secret_format_valid: /^whsec_[A-Za-z0-9]{16,240}$/.test(
      config.fiscalSigningSecret ?? "",
    ),
    account_checked: false,
    account_status: null,
    account_id: null,
    expected_account: false,
    charges_enabled: false,
    payouts_enabled: false,
    webhook_checked: false,
    webhook_status: null,
    webhook_id_matches: false,
    webhook_url_matches: false,
    webhook_events_match: false,
    webhook_api_version_matches: false,
    webhook_disabled: null,
    signature_delivery_verified: false,
    payment_or_customer_mutations: 0,
  };
  if (!mode) return result;
  const get = async (path: string) => {
    const response = await fetcher("https://api.stripe.com/" + path, {
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(8000),
      headers: {
        Authorization: "Bearer " + config.stripeKey,
        Accept: "application/json",
        "Stripe-Version": "2026-09-30.endive",
      },
    });
    if (response.status !== 200) {
      await response.body?.cancel();
      return { status: response.status, value: null };
    }
    return { status: 200, value: await providerObject(response) };
  };
  try {
    const account = await get("v1/account");
    result.account_checked = true;
    result.account_status = account.status;
    if (
      account.value?.object === "account" &&
      /^acct_[A-Za-z0-9]{1,100}$/.test(account.value.id)
    ) {
      result.account_id = account.value.id;
      result.expected_account =
        account.value.id === readinessAccount && mode === "live";
      result.charges_enabled = account.value.charges_enabled === true;
      result.payouts_enabled = account.value.payouts_enabled === true;
    }
    if (!result.expected_account) return result;
    // The configured `we_` receiver is a Stripe v2 Event Destination, not a v1 webhook endpoint.
    // Stripe normally redacts this URL unless the field is explicitly included.
    const hook = await get(
      "v2/core/event_destinations/" + readinessEndpoint +
        "?include%5B%5D=webhook_endpoint.url",
    );
    result.webhook_checked = true;
    result.webhook_status = hook.status;
    if (
      hook.value?.object === "v2.core.event_destination" &&
      hook.value.type === "webhook_endpoint" &&
      hook.value.livemode === true &&
      hook.value.event_payload === "snapshot" &&
      Array.isArray(hook.value.events_from) &&
      hook.value.events_from.length === 1 &&
      hook.value.events_from[0] === "@self"
    ) {
      result.webhook_id_matches = hook.value.id === readinessEndpoint;
      result.webhook_url_matches = hook.value.webhook_endpoint?.url === readinessUrl;
      result.webhook_disabled =
        hook.value.status === "disabled"
          ? true
          : hook.value.status === "enabled"
            ? false
            : null;
      result.webhook_api_version_matches =
        hook.value.snapshot_api_version === "2025-03-31.basil";
      result.webhook_events_match =
        Array.isArray(hook.value.enabled_events) &&
        JSON.stringify([...hook.value.enabled_events].sort()) ===
          JSON.stringify(events);
    }
    return result;
  } catch {
    // Provider exceptions can include credentials; never propagate their message.
    throw Error("stripe_readiness_unavailable");
  }
}

export function cachedStripeReadiness(
  inspect: () => Promise<StripeReadinessReport>,
  clock: () => number = Date.now,
) {
  let cached: { until: number; report: StripeReadinessReport } | null = null;
  let pending: Promise<StripeReadinessReport> | null = null;
  return async () => {
    if (cached && clock() < cached.until) return cached.report;
    if (pending) return pending;
    pending = inspect()
      .then((report) => {
        cached = { until: clock() + 60_000, report };
        return report;
      })
      .finally(() => {
        pending = null;
      });
    return pending;
  };
}
