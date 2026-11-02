import { describe, expect, it, vi } from "vitest";
import {
  productionAppOrigins,
  legacyDemoOrigin,
} from "../../../supabase/functions/_shared/app-origins";
import { productionGmailOrigins } from "../../../supabase/functions/company-gmail/health";
import { createMailHandler } from "../../../supabase/functions/company-mail/handler";
import { createAssistantHandler } from "../../../supabase/functions/company-assistant/handler";
function handlers() {
  const authenticate = vi.fn(async () => null);
  return {
    authenticate,
    handlers: [
      createMailHandler(
        {
          authenticate,
          access: vi.fn(),
          server: vi.fn(),
          upload: vi.fn(),
          remove: vi.fn(),
        },
        { origins: [...productionAppOrigins, legacyDemoOrigin] },
      ),
      createAssistantHandler(
        { authenticate, consume: vi.fn() },
        {
          appOrigin: productionAppOrigins[0],
          additionalOrigins: [
            ...productionAppOrigins.slice(1),
            legacyDemoOrigin,
          ],
        },
      ),
    ],
  };
}
describe("importación y asistente desde las PWA oficiales", () => {
  it("comparte el conjunto exacto ya autorizado por Gmail", () =>
    expect(productionAppOrigins).toEqual(productionGmailOrigins));
  it.each([...productionAppOrigins, legacyDemoOrigin])(
    "acepta preflight pero sigue exigiendo autenticación en %s",
    async (origin) => {
      const f = handlers();
      for (const handler of f.handlers) {
        const options = await handler(
          new Request("https://edge.invalid/endpoint", {
            method: "OPTIONS",
            headers: { Origin: origin },
          }),
        );
        expect(options.status).toBe(204);
        expect(options.headers.get("Access-Control-Allow-Origin")).toBe(origin);
        expect(
          (
            await handler(
              new Request("https://edge.invalid/endpoint", {
                method: "POST",
                headers: { Origin: origin },
              }),
            )
          ).status,
        ).toBe(401);
      }
      expect(f.authenticate).not.toHaveBeenCalled();
    },
  );
  it.each([
    "https://truckcontrolai.com.evil.invalid",
    "http://truckcontrolai.com",
    "https://other.chatgpt.site",
  ])("rechaza %s antes de autorizar o llamar a proveedores", async (origin) => {
    const f = handlers();
    for (const handler of f.handlers)
      expect(
        (
          await handler(
            new Request("https://edge.invalid/endpoint", {
              method: "OPTIONS",
              headers: { Origin: origin },
            }),
          )
        ).status,
      ).toBe(403);
    expect(f.authenticate).not.toHaveBeenCalled();
  });
});
