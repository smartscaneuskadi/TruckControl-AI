import { describe, expect, it, vi } from "vitest";
import {
  createGmailBrowserConfigResolver,
  gmailBrowserClientId,
} from "../../../supabase/functions/company-gmail/config";
import { withGmailHealth } from "../../../supabase/functions/company-gmail/health";
const id = "468881730124-synthetic.apps.googleusercontent.com",
  secret = "GOCSPX-SYNTHETIC-DO-NOT-EXPOSE";
describe("configuración pública del correo personal", () => {
  it("extrae solo el identificador público de un cliente web del proyecto", () => {
    expect(
      gmailBrowserClientId(
        JSON.stringify({ web: { client_id: id, client_secret: secret } }),
      ),
    ).toBe(id);
    for (const value of [
      "pending",
      secret,
      "123-other.apps.googleusercontent.com",
      JSON.stringify({ installed: { client_id: id } }),
      JSON.stringify({
        web: { client_id: "123-other.apps.googleusercontent.com" },
      }),
    ])
      expect(gmailBrowserClientId(value)).toBeUndefined();
  });
  it("funciona sin un secreto de cliente y cachea solo el identificador", async () => {
    const read = vi.fn(async () => ({
      client_id: id,
      client_secret: secret,
      encryption_key: "private-key",
    }));
    const resolve = createGmailBrowserConfigResolver(undefined, read);
    expect(await resolve()).toBe(id);
    expect(await resolve()).toBe(id);
    expect(read).toHaveBeenCalledTimes(1);
  });
  it("no devuelve valores ni errores de Vault si la configuración falla", async () => {
    const resolve = createGmailBrowserConfigResolver(undefined, async () => {
      throw new Error(secret);
    });
    const handler = withGmailHealth(
      async () => new Response("unused"),
      async () => false,
      resolve,
    );
    const response = await handler(
      new Request("https://example.invalid/browser-config", {
        headers: { origin: "https://truckcontrolai.com" },
      }),
    );
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({
      configured: false,
      client_id: null,
      provider: "google",
      mode: "personal_browser",
    });
    expect(text).not.toContain(secret);
  });
  it("mantiene health anterior y sirve el identificador a los tres orígenes exactos", async () => {
    const handler = withGmailHealth(
      async () => new Response("unused"),
      async () => false,
      async () => id,
    );
    expect(
      await (
        await handler(new Request("https://example.invalid/health"))
      ).json(),
    ).toEqual({ configured: false });
    for (const origin of [
      "https://truckcontrolai.com",
      "https://www.truckcontrolai.com",
      "https://truckcontrol-ai-candidata.earlymug513.chatgpt.site",
    ]) {
      const response = await handler(
        new Request("https://example.invalid/browser-config", {
          headers: { origin },
        }),
      );
      expect(response.headers.get("access-control-allow-origin")).toBe(origin);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toMatchObject({
        client_id: id,
        configured: true,
      });
    }
  });
  it("rechaza orígenes ajenos y un resolver que intente devolver secretos", async () => {
    const resolve = vi.fn(async () => secret);
    const handler = withGmailHealth(
      async () => new Response("unused"),
      async () => false,
      resolve,
    );
    expect(
      (
        await handler(
          new Request("https://example.invalid/browser-config", {
            headers: { origin: "https://truckcontrolai.com.attacker.invalid" },
          }),
        )
      ).status,
    ).toBe(403);
    expect(resolve).not.toHaveBeenCalled();
    const response = await handler(
      new Request("https://example.invalid/browser-config"),
    );
    expect(await response.json()).toMatchObject({
      configured: false,
      client_id: null,
    });
  });
});
