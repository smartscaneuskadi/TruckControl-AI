import { expect, it } from "vitest";
import { stripeServerKeyMode } from "../supabase/functions/_shared/stripe-server-key";

it("identifies restricted server keys without treating an opaque separator as an authentication failure", () => {
  expect(stripeServerKeyMode("rk_live_exampleRestricted_A-B.C~D")).toBe("live");
  expect(stripeServerKeyMode("rk_test_exampleRestricted_A-B.C~D")).toBe("test");
});

it("rejects copied display text, truncated values, public keys and webhook signing secrets", () => {
  for (const value of [undefined, "rk", "rk_live_", "pk_live_exampleRestricted_A", "whsec_exampleRestricted_A",
    "rk_live_example...Restricted", "rk_live_••••exampleRestricted", "rk_live_exampleRestricted\n",
    "Authorization: Bearer rk_live_exampleRestricted", 'rk_live_example"Restricted',
    "rk_live_example\r\nRestricted", "rk_live_" + "A".repeat(513)]) {
    expect(stripeServerKeyMode(value)).toBeNull();
  }
});
