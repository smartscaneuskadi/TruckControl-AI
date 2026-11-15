// Safety boundaries for the opt-in, synthetic Stripe QA executor only.
export const StripeQaAccount = "acct_1UWYX5ECykZtDl5d";

export function requireStripeQaIdentity(identity) {
  if (identity?.authorized !== true || identity.account_id !== StripeQaAccount || identity.mode !== "test")
    throw Error("Refuse unverified, foreign or live Stripe account");
}

export function requireStripeQaArguments(args) {
  if (!Array.isArray(args) || !["get", "post", "delete", "whoami"].includes(args[0]) ||
      args.some(x => typeof x !== "string" || /^--(?:live|api-key|stripe-account|api-base|api-port|profile|config)(?:=|$)/.test(x)))
    throw Error("Forbidden live, credential or routing argument");
  if (args[0] !== "whoami" && (!args[1]?.startsWith("/v1/") || args[1].includes("://") || args[1].includes("..")))
    throw Error("Noncanonical API path refused");
}

export function stripeQaEnvironment(parent) {
  const env = { ...parent };
  for (const name of Object.keys(env)) {
    // The official CLI must use its approved profile, never an ambient live key
    // or routing override. Keep the executor's proxy and trusted CA unchanged.
    if (name.startsWith("STRIPE_") || ["SUPABASE_ACCESS_TOKEN", "SUPABASE_SERVICE_ROLE_KEY",
      "OPENAI_API_KEY", "RESEND_API_KEY", "GOOGLE_CLIENT_SECRET"].includes(name)) delete env[name];
  }
  return env;
}

// The first synthetic sandbox script uses legacy CLI verbs rather than the
// canonical `get/post/delete /v1/...` form. Its scope is deliberately fixed:
// account reads and only the four already-reviewed synthetic write operations.
// The return value is true for a mutation, so callers must recheck identity.
export function requireStripeQaLegacyArguments(args) {
  if (!Array.isArray(args) || args.some(value => typeof value !== "string"))
    throw Error("Invalid Stripe QA command");
  if (args[0] === "get" || args[0] === "whoami") {
    requireStripeQaArguments(args);
    return false;
  }
  const verb = args[0] + ":" + args[1];
  if (![ "customers:create", "subscriptions:create", "subscriptions:cancel", "refunds:create" ].includes(verb))
    throw Error("Unreviewed Stripe QA mutation refused");
  // Reuse the canonical guard for every extra CLI flag, rejecting --live,
  // --api-key, --stripe-account, --profile, --config and routing overrides.
  requireStripeQaArguments(["get", "/v1/qa-command-check", ...args.slice(2)]);
  return true;
}
