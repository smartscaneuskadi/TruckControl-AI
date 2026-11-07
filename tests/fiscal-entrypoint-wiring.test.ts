import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Release 1.0: ambas funciones de pago requieren emisor fiscal real", () => {
  it.each([
    "truckcontrol-billing/index.ts",
    "truckcontrol-subscriptions/index.ts",
  ])("el entrypoint %s no puede abrir pagos solo por variable de entorno", (path) => {
    const source = readFileSync(`supabase/functions/${path}`, "utf8");
    expect(source).toContain(
      'from "../_shared/subscription-fiscal-gate.ts"',
    );
    expect(source).toContain(
      'subscriptionFiscalCheckoutAllowed(Deno.env.get("BILLING_INVOICING_VERIFIED"))',
    );
    expect(source).not.toContain(
      'Deno.env.get("BILLING_INVOICING_VERIFIED") === "true"',
    );
  });
});
