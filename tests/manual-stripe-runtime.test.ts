import { describe, expect, it } from "vitest";
import { manualStripeRuntimeAllowed } from "../supabase/functions/_shared/subscription-stripe-runtime.ts";
const production = "https://kkkemaycedexymrpaqtp.supabase.co";
const isolated = "abcdefghijklmnopqrst";
describe("manual Stripe runtime project fence", () => {
  it("never accepts sandbox mode against production even with a mistaken explicit ref", () => {
    expect(manualStripeRuntimeAllowed(production,"test")).toBe(false);
    expect(manualStripeRuntimeAllowed(production,"test","kkkemaycedexymrpaqtp")).toBe(false);
    expect(manualStripeRuntimeAllowed(production,"test",isolated)).toBe(false);
  });
  it("accepts test only for the exact explicitly approved separate project", () => {
    expect(manualStripeRuntimeAllowed("https://" + isolated + ".supabase.co","test",isolated)).toBe(true);
    expect(manualStripeRuntimeAllowed("https://" + isolated + ".supabase.co","live",isolated)).toBe(false);
    expect(manualStripeRuntimeAllowed(production,"live")).toBe(true);
  });
  it.each([
    "http://" + isolated + ".supabase.co",
    "https://attacker.example",
    "https://" + isolated + ".supabase.co.attacker.example",
    "https://user:secret@" + isolated + ".supabase.co",
    "https://" + isolated + ".supabase.co:444",
    "https://" + isolated + ".supabase.co/private",
    "https://" + isolated + ".supabase.co?key=bad",
    "not-a-url",
  ])("rejects noncanonical project origins (%s)", url => {
    expect(manualStripeRuntimeAllowed(url,"test",isolated)).toBe(false);
  });
});
