import { describe, expect, it } from "vitest";
import { allowAutomaticStripeCheckout } from "../src/domain/stripe-checkout-policy";

describe("owner-only manual subscription policy", () => {
  it("never starts Stripe checkout even if legacy catalog advertises payments", () => {
    for (const payments_enabled of [true, false]) {
      for (const prices_are_examples of [true, false]) {
        expect(allowAutomaticStripeCheckout({ payments_enabled, prices_are_examples }))
          .toBe(false);
      }
    }
  });
});
