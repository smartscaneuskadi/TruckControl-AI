import { verifyStripeSignature } from "../truckcontrol-billing/handler.ts";
import { StripeReconciliationError, type StripeReconciliationConfig } from "./subscription-stripe-reconciliation.ts";
import { stripeEventMatchesAccount } from "./stripe-event-scope.ts";

export type StripeObject = Record<string, unknown>;
export const stripeObject = (value: unknown): StripeObject =>
  value && typeof value === "object" && !Array.isArray(value) ? value as StripeObject : {};
export const stripeRef = (value: unknown): unknown => typeof value === "string" ? value : stripeObject(value).id;
export const stripeId = (value: unknown, prefix: string): value is string =>
  typeof value === "string" && new RegExp("^" + prefix + "_[A-Za-z0-9]{1,200}$").test(value);
export const stripeSeconds = (value: unknown, now: number): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= now / 1000 + 300;
export const stripeCents = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 100000000;
const fail = (code: ConstructorParameters<typeof StripeReconciliationError>[0]): never => {
  throw new StripeReconciliationError(code);
};
export class StripeProviderBodyLimit extends Error {}

/** Byte-identical body limits/UTF-8 decoding formerly local to the paid handler. */
export async function readStripeRawBody(request: Request): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    length += part.value.length;
    if (length > 65536) { await reader.cancel(); throw new StripeProviderBodyLimit(); }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const part of chunks) { bytes.set(part, offset); offset += part.length; }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
async function responseObject(response: Response): Promise<StripeObject> {
  const reader = response.body?.getReader();
  if (!reader) return fail("provider_unavailable");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.length;
    if (size > 524288) { await reader.cancel(); return fail("provider_response_limit"); }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of chunks) { bytes.set(part, offset); offset += part.length; }
  return stripeObject(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}
export type StripeEnvelope =
  | { kind: "ignored"; event_id: string }
  | { kind: "verified"; event: StripeObject; snapshot: StripeObject; now: number;
      get(path: string): Promise<StripeObject> };

/** Existing HMAC, before every I/O. Account+immutable Event are fetched on a fixed TLS origin. */
export async function canonicalStripeEnvelope(
  raw: string, signature: string | null, config: StripeReconciliationConfig,
  supported: ReadonlySet<string>, fetcher: typeof fetch = fetch,
): Promise<StripeEnvelope> {
  const now = config.now ?? Date.now();
  try {
    if (new TextEncoder().encode(raw).byteLength > 65536 || !Number.isFinite(now) ||
        !stripeId(config.expectedAccountId, "acct") || !["test", "live"].includes(config.mode) ||
        !/^(sk|rk)_(test|live)_[A-Za-z0-9]+$/.test(config.stripeKey) ||
        !(config.stripeKey.startsWith((config.mode === "live" ? "sk_live_" : "sk_test_")) ||
          config.stripeKey.startsWith((config.mode === "live" ? "rk_live_" : "rk_test_"))) ||
        !config.webhookSecret) return fail("configuration_unavailable");
    if (!await verifyStripeSignature(raw, signature, config.webhookSecret, now))
      return fail("invalid_signature");
    const input = stripeObject(JSON.parse(raw));
    if (!stripeId(input.id, "evt") || typeof input.type !== "string" ||
        typeof input.livemode !== "boolean" || !stripeSeconds(input.created, now))
      return fail("invalid_event");
    if (input.livemode !== (config.mode === "live") || !stripeEventMatchesAccount(input, config.expectedAccountId))
      return fail("provider_identity_mismatch");
    if (!supported.has(input.type)) return { kind: "ignored", event_id: input.id };
    const snapshot = stripeObject(stripeObject(input.data).object);
    if (typeof snapshot.id !== "string") return fail("invalid_event");
    const deadline = AbortSignal.timeout(25000);
    const get = async (path: string) => {
      if (!/^(account|(?:events|charges|refunds|disputes|payment_intents|invoices|subscriptions)\/[A-Za-z0-9_]{3,205}|invoice_payments\?payment%5Btype%5D=payment_intent&payment%5Bpayment_intent%5D=pi_[A-Za-z0-9]{1,200}&status=paid&limit=2)$/.test(path))
        return fail("invalid_event");
      const response = await fetcher("https://api.stripe.com/v1/" + path, {
        method: "GET", redirect: "error",
        headers: { Authorization: "Bearer " + config.stripeKey, "Stripe-Version": "2025-03-31.basil" },
        signal: AbortSignal.any([deadline, AbortSignal.timeout(10000)]),
      });
      if (!response.ok) return fail("provider_unavailable");
      return responseObject(response);
    };
    const account = await get("account");
    if (account.id !== config.expectedAccountId) return fail("provider_identity_mismatch");
    const event = await get("events/" + input.id);
    if (event.id !== input.id || event.type !== input.type || event.created !== input.created ||
        event.livemode !== input.livemode || !stripeEventMatchesAccount(event, config.expectedAccountId) ||
        stripeObject(stripeObject(event.data).object).id !== snapshot.id)
      return fail("provider_identity_mismatch");
    return { kind: "verified", event, snapshot: stripeObject(stripeObject(event.data).object), get, now };
  } catch (error) {
    if (error instanceof StripeReconciliationError) throw error;
    return fail("provider_unavailable");
  }
}
