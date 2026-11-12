import { describe, expect, it } from "vitest";
import { requireStripeQaArguments, requireStripeQaIdentity, stripeQaEnvironment, StripeQaAccount } from "../scripts/lib/stripe-qa-guards.mjs";

describe("synthetic Stripe QA boundaries", () => {
  it("accepts only the existing authorized test account", () => {
    expect(() => requireStripeQaIdentity({ authorized: true, account_id: StripeQaAccount, mode: "test" })).not.toThrow();
  });
  it("rejects live, foreign, expired and malformed identities before a mutation", () => {
    for (const value of [null, {}, { authorized: true, account_id: StripeQaAccount, mode: "live" },
      { authorized: true, account_id: "acct_ForeignSynthetic", mode: "test" },
      { authorized: false, account_id: StripeQaAccount, mode: "test" },
      { authorized: "true", account_id: StripeQaAccount, mode: "test" }])
      expect(() => requireStripeQaIdentity(value)).toThrow();
  });
  it("permits canonical reads and owned-fixture write command shapes", () => {
    for (const args of [["whoami", "--format", "json"], ["get", "/v1/account"],
      ["post", "/v1/test_helpers/test_clocks", "-d", "name=Synthetic"],
      ["delete", "/v1/test_helpers/test_clocks/clock_Synthetic", "--confirm"]])
      expect(() => requireStripeQaArguments(args)).not.toThrow();
  });
  it("rejects credential and account overrides in either flag syntax", () => {
    for (const flag of ["--live", "--live=true", "--api-key", "--api-key=synthetic", "--stripe-account=acct_Foreign",
      "--profile=other", "--config=/tmp/other", "--api-base=https://example.invalid"])
      expect(() => requireStripeQaArguments(["post", "/v1/customers", flag])).toThrow();
  });
  it("rejects other commands, external destinations and path escapes", () => {
    for (const args of [["login"], ["post", "https://example.invalid"], ["get", "/v1/../v2/core/accounts"], ["get", "/v2/core/accounts"]])
      expect(() => requireStripeQaArguments(args)).toThrow();
  });
  it("removes ambient credentials without mutating the parent or weakening proxy/CA trust", () => {
    const parent = { STRIPE_API_KEY: "synthetic-live-key", STRIPE_API_BASE: "https://example.invalid",
      SUPABASE_ACCESS_TOKEN: "synthetic-management-key", OPENAI_API_KEY: "synthetic-ai-key",
      HTTP_PROXY: "http://approved-proxy.invalid", NODE_EXTRA_CA_CERTS: "/tmp/approved-ca.pem", HOME: "/tmp/qa-home" };
    const child = stripeQaEnvironment(parent);
    expect(Object.keys(child).sort()).toEqual(["HOME", "HTTP_PROXY", "NODE_EXTRA_CA_CERTS"]);
    expect(child.HTTP_PROXY).toBe(parent.HTTP_PROXY);
    expect(child.NODE_EXTRA_CA_CERTS).toBe(parent.NODE_EXTRA_CA_CERTS);
    expect(parent.STRIPE_API_KEY).toBe("synthetic-live-key");
  });
});
