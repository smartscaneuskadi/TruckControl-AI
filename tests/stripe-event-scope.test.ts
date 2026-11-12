import { describe, expect, it } from "vitest";
import { stripeEventMatchesAccount } from "../supabase/functions/_shared/stripe-event-scope.ts";
import { reconcileStripeFinancialIncident } from "../supabase/functions/_shared/subscription-financial-incidents.ts";
import {
  financialFixture,
  financialSignature,
  financialConfig,
} from "./helpers/stripe-financial-fixtures";

describe("Stripe context binds to the exact independently configured account", () => {
  it.each([undefined, null, "acct_ExactScope"])(
    "accepts legacy or exact context %s",
    (context) => {
      expect(stripeEventMatchesAccount({ context }, "acct_ExactScope")).toBe(
        true,
      );
    },
  );
  it.each([
    "acct_Other",
    "org_ExactScope",
    "",
    " acct_ExactScope",
    "acct_ExactScope ",
    "acct_exactscope",
    false,
    1,
    {},
    [],
    ["acct_ExactScope"],
  ])("rejects foreign or malformed context %j", (context) => {
    expect(stripeEventMatchesAccount({ context }, "acct_ExactScope")).toBe(
      false,
    );
  });
  it.each(["acct_Other", "acct_ExactScope", false, 1, {}, []])(
    "retains Connect/account routing denial %j",
    (account) => {
      expect(
        stripeEventMatchesAccount(
          { account, context: "acct_ExactScope" },
          "acct_ExactScope",
        ),
      ).toBe(false);
    },
  );
  it("does not treat an invalid configured identity as a valid context", () => {
    expect(stripeEventMatchesAccount({ context: "" }, "")).toBe(false);
  });
  it("accepts the provider's exact account context on canonical Event when the CLI-forwarded snapshot omits it", async () => {
    const f = financialFixture();
    const raw = f.raw();
    f.records["events/" + String(f.event.id)] = {
      ...f.event,
      context: financialConfig.expectedAccountId,
    };
    expect(
      (
        await reconcileStripeFinancialIncident(
          raw,
          financialSignature(raw),
          financialConfig,
          f.fetcher,
        )
      ).kind,
    ).toBe("incident");
  });
  it("accepts an exact account context on both authenticated envelopes", async () => {
    const f = financialFixture();
    f.event.context = financialConfig.expectedAccountId;
    const raw = f.raw();
    expect(
      (
        await reconcileStripeFinancialIncident(
          raw,
          financialSignature(raw),
          financialConfig,
          f.fetcher,
        )
      ).kind,
    ).toBe("incident");
  });
  it("rejects a signed foreign input context before provider I/O", async () => {
    const f = financialFixture();
    f.event.context = "acct_Other";
    const raw = f.raw();
    await expect(
      reconcileStripeFinancialIncident(
        raw,
        financialSignature(raw),
        financialConfig,
        f.fetcher,
      ),
    ).rejects.toMatchObject({ code: "provider_identity_mismatch" });
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it("rejects a foreign canonical context even with a valid input signature and correct /account", async () => {
    const f = financialFixture();
    const raw = f.raw();
    f.records["events/" + String(f.event.id)] = {
      ...f.event,
      context: "acct_Other",
    };
    await expect(
      reconcileStripeFinancialIncident(
        raw,
        financialSignature(raw),
        financialConfig,
        f.fetcher,
      ),
    ).rejects.toMatchObject({ code: "provider_identity_mismatch" });
  });
});
