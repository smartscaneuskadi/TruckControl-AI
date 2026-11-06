import { describe, expect, it, vi } from "vitest";
import { createBillingHandler } from "../../../supabase/functions/truckcontrol-billing/handler.ts";
import { createRecurringHandler } from "../../../supabase/functions/truckcontrol-subscriptions/handler.ts";
import type { RecurringGateway } from "../../../supabase/functions/truckcontrol-subscriptions/handler.ts";
import {
  productionBillingOrigin,
  productionBillingOrigins,
} from "../../../supabase/functions/_shared/billing-origins.ts";

const canonical = "https://truckcontrolai.com";
const demo = "https://truckcontrol-ai-fase-1.earlymug513.chatgpt.site";
describe("orígenes comerciales separados de la demo conservada", () => {
  it("usa el dominio definitivo cuando falta configuración o conserva el antiguo destino de demo", () => {
    expect(productionBillingOrigin()).toBe(canonical);
    expect(productionBillingOrigin(demo)).toBe(canonical);
    expect(productionBillingOrigin("https://foreign.invalid")).toBe(canonical);
    expect(
      productionBillingOrigin("https://truckcontrolai.com@foreign.invalid"),
    ).toBe(canonical);
    expect(productionBillingOrigin("https://www.truckcontrolai.com")).toBe(
      "https://www.truckcontrolai.com",
    );
  });
  for (const [name, create] of [
    ["pago único", createBillingHandler],
    ["suscripción", createRecurringHandler],
  ] as const) {
    it(`${name}: acepta los tres hosts exactos sin compartir cabeceras, y rechaza demo/suplantación sin tocar datos o pagos`, async () => {
      const calls: string[] = [];
      const gateway: RecurringGateway = {
        authenticate: async () => {
          throw Error("Anonymous CORS tests must not authenticate");
        },
        async server<T>(action: string): Promise<T> {
          calls.push(action);
          return {} as T;
        },
      };
      const fetcher = vi.fn<typeof fetch>();
      const handle = create(
        gateway,
        {
          appOrigin: productionBillingOrigin(demo),
          allowedOrigins: productionBillingOrigins,
        },
        fetcher,
      );
      const results = await Promise.all(
        productionBillingOrigins.map(async (origin) => {
          const preflight = await handle(
            new Request(`${canonical}/billing`, {
              method: "OPTIONS",
              headers: { Origin: origin },
            }),
          );
          const anonymous = await handle(
            new Request(`${canonical}/billing`, {
              method: "POST",
              headers: { Origin: origin },
              body: JSON.stringify({
                action: "checkout",
                request_id: "b2000000-0000-4000-8000-000000000001",
              }),
            }),
          );
          return { origin, preflight, anonymous };
        }),
      );
      for (const { origin, preflight, anonymous } of results) {
        expect(preflight.status).toBe(204);
        expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe(
          origin,
        );
        expect(anonymous.status).toBe(401);
        expect(anonymous.headers.get("Access-Control-Allow-Origin")).toBe(
          origin,
        );
        expect(anonymous.headers.get("Cache-Control")).toBe("no-store");
        expect(anonymous.headers.get("Vary")).toContain("Origin");
      }
      for (const origin of [
        demo,
        "https://foreign.invalid",
        "https://truckcontrolai.com.foreign.invalid",
        "https://truckcontrolai.com@foreign.invalid",
        "http://truckcontrolai.com",
        "null",
      ]) {
        const denied = await handle(
          new Request(`${canonical}/billing`, {
            method: "OPTIONS",
            headers: { Origin: origin },
          }),
        );
        expect(denied.status).toBe(403);
        expect(denied.headers.get("Access-Control-Allow-Origin")).not.toBe(
          origin,
        );
      }
      expect(calls).toHaveLength(0);
      expect(fetcher).not.toHaveBeenCalled();
    });
  }
});
