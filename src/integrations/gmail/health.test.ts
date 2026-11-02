import { describe, it, expect, vi } from "vitest";
import {
  productionGmailOrigins,
  withGmailHealth,
} from "../../../supabase/functions/company-gmail/health";
describe("salud Gmail sin credenciales, consentimiento ni llamadas externas", () => {
  it.each(productionGmailOrigins)(
    "devuelve solo un booleano desde %s",
    async (origin) => {
      const fallback = vi.fn(async () => new Response(null, { status: 401 })),
        resolve = vi.fn(async () => ({
          clientId: "synthetic-private-id",
          clientSecret: "synthetic-private-secret",
          encryptionKey: "synthetic-private-key",
        }));
      const r = await withGmailHealth(
        fallback,
        resolve,
      )(
        new Request("https://edge.invalid/company-gmail/health", {
          headers: { Origin: origin },
        }),
      );
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({ configured: true });
      expect(r.headers.get("Access-Control-Allow-Origin")).toBe(origin);
      expect(r.headers.get("Cache-Control")).toBe("no-store");
      expect(fallback).not.toHaveBeenCalled();
    },
  );
  it("acepta la consulta de diagnóstico sin origen", async () => {
    const r = await withGmailHealth(
      async () => new Response(null),
      async () => undefined,
    )(new Request("https://edge.invalid/company-gmail/health"));
    expect(await r.json()).toEqual({ configured: false });
    expect(r.headers.has("Access-Control-Allow-Origin")).toBe(false);
  });
  it("no publica errores de configuración", async () => {
    const r = await withGmailHealth(
      async () => new Response(null),
      async () => {
        throw Error("synthetic-private-error");
      },
    )(new Request("https://edge.invalid/company-gmail/health"));
    expect(await r.json()).toEqual({ configured: false });
  });
  it("un origen ajeno no activa el resolver", async () => {
    const resolve = vi.fn();
    const r = await withGmailHealth(
      async () => new Response(null),
      resolve,
    )(
      new Request("https://edge.invalid/company-gmail/health", {
        headers: { Origin: "https://evil.invalid" },
      }),
    );
    expect(r.status).toBe(403);
    expect(resolve).not.toHaveBeenCalled();
  });
  it("el preflight de salud no consulta secretos", async () => {
    const resolve = vi.fn();
    for (const origin of productionGmailOrigins) {
      const r = await withGmailHealth(
        async () => new Response(null),
        resolve,
      )(
        new Request("https://edge.invalid/company-gmail/health", {
          method: "OPTIONS",
          headers: { Origin: origin },
        }),
      );
      expect(r.status).toBe(204);
      expect(r.headers.get("Access-Control-Allow-Methods")).toContain("GET");
    }
    expect(resolve).not.toHaveBeenCalled();
  });
  it("las operaciones de buzón conservan su autenticación original", async () => {
    const delegate = vi.fn(async () => new Response(null, { status: 401 })),
      resolve = vi.fn(),
      handler = withGmailHealth(delegate, resolve);
    for (const path of ["company-gmail", "company-gmail/health"]) {
      expect(
        (
          await handler(
            new Request("https://edge.invalid/" + path, { method: "POST" }),
          )
        ).status,
      ).toBe(401);
    }
    expect(delegate).toHaveBeenCalledTimes(2);
    expect(resolve).not.toHaveBeenCalled();
  });
});
