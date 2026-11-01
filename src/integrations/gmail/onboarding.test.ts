import { describe, expect, it, vi } from "vitest";
import { createGmailHandler } from "../../../supabase/functions/company-gmail/handler.ts";
import type { GmailGateway } from "../../../supabase/functions/company-gmail/handler.ts";
import { base64, seal } from "../../../supabase/functions/_shared/invoice.ts";

const org = "20000000-0000-4000-8000-000000000081";
const user = "10000000-0000-4000-8000-000000000081";
const canonical = "https://truckcontrolai.com";
const www = "https://www.truckcontrolai.com";
const callback = "https://project.example/functions/v1/company-gmail";
const oauth = {
  clientId: "synthetic-client",
  clientSecret: "synthetic-secret",
  encryptionKey: base64(new Uint8Array(32).fill(4)),
};
function fixture() {
  const states = new Map<string, Record<string, unknown>>();
  const server = vi.fn(
    async (action: string, data: Record<string, unknown>) => {
      if (action === "state_create") states.set(String(data.state_hash), data);
      if (action === "state_consume") {
        const state = states.get(String(data.state_hash)) ?? null;
        states.delete(String(data.state_hash));
        return state;
      }
      return null;
    },
  );
  const gateway: GmailGateway = {
    authenticate: async (token) =>
      token === "synthetic" ? { id: user } : null,
    owns: async (id, actor) => id === org && actor === user,
    server: server as GmailGateway["server"],
    upload: async () => {},
    remove: async () => {},
  };
  const fetcher = vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url === "https://oauth2.googleapis.com/token")
      return Response.json({
        access_token: "synthetic-google-access",
        refresh_token: "synthetic-google-refresh",
        scope: "openid email https://www.googleapis.com/auth/gmail.readonly",
      });
    if (url === "https://openidconnect.googleapis.com/v1/userinfo")
      return Response.json({
        sub: "synthetic-subject",
        email: "mail@example.com",
        email_verified: true,
      });
    if (url.endsWith("/profile"))
      return Response.json({ emailAddress: "mail@example.com" });
    throw Error("Unexpected provider request");
  });
  return { gateway, server, fetcher, states };
}
function post(
  origin = canonical,
  action = "start",
  token = "synthetic",
  organization = org,
) {
  return new Request(callback, {
    method: "POST",
    headers: {
      origin,
      authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, organization_id: organization }),
  });
}
describe("Google vuelve al mismo origen y conserva sus límites de acceso", () => {
  it("intercambia el código desde el dominio propio, exige estado de un uso y devuelve solo el ticket", async () => {
    const f = fixture();
    const brandedCallback = `${canonical}/gmail-callback`;
    const handler = createGmailHandler(
      f.gateway,
      { appOrigin: canonical, callbackUrl: brandedCallback, oauth },
      f.fetcher,
    );
    const { url } = await (await handler(post())).json();
    const state = new URL(url).searchParams.get("state")!;
    expect(new URL(url).searchParams.get("redirect_uri")).toBe(brandedCallback);
    const exchange = () =>
      new Request(`${callback}/oauth-callback`, {
        method: "POST",
        headers: { origin: canonical, "Content-Type": "application/json" },
        body: JSON.stringify({ state, code: "synthetic-code" }),
      });
    const result = await handler(exchange());
    expect(result.status).toBe(200);
    expect(result.headers.get("Cache-Control")).toBe("no-store");
    const text = await result.text();
    expect(JSON.parse(text).url).toMatch(
      /^https:\/\/truckcontrolai\.com\/#\/invoices\?gmail_ticket=[A-Za-z0-9_-]{43}$/,
    );
    expect(text).not.toContain("synthetic-google");
    expect(text).not.toContain("synthetic-secret");
    const tokenRequest = f.fetcher.mock.calls.find(
      (c) => String(c[0]) === "https://oauth2.googleapis.com/token",
    )!;
    expect(
      new URLSearchParams(String(tokenRequest[1]?.body)).get("redirect_uri"),
    ).toBe(brandedCallback);
    expect(
      f.server.mock.calls.find((c) => c[0] === "pending_create")?.[1],
    ).toMatchObject({ organization_id: org, user_id: user });
    const providerCalls = f.fetcher.mock.calls.length;
    expect(await (await handler(exchange())).json()).toEqual({
      url: `${canonical}/#/invoices?gmail_error=expired`,
    });
    expect(f.fetcher).toHaveBeenCalledTimes(providerCalls);
  });
  it("el intercambio público rechaza mensajes inválidos y orígenes ajenos antes de consultar secretos", async () => {
    const f = fixture();
    const resolveOAuth = vi.fn(async () => oauth);
    const handler = createGmailHandler(
      f.gateway,
      {
        appOrigin: canonical,
        callbackUrl: `${canonical}/gmail-callback`,
        resolveOAuth,
      },
      f.fetcher,
    );
    for (const body of [
      "{",
      JSON.stringify(null),
      JSON.stringify({ state: "wrong", code: "code" }),
      JSON.stringify({ state: "s".repeat(43), code: "c".repeat(4097) }),
    ]) {
      const response = await handler(
        new Request(`${callback}/oauth-callback`, {
          method: "POST",
          headers: { origin: canonical },
          body,
        }),
      );
      expect(response.status).toBe(400);
    }
    expect(
      (
        await handler(
          new Request(`${callback}/oauth-callback`, {
            method: "POST",
            headers: { origin: "https://evil.example" },
            body: JSON.stringify({ state: "s".repeat(43), code: "code" }),
          }),
        )
      ).status,
    ).toBe(403);
    expect(resolveOAuth).not.toHaveBeenCalled();
    expect(f.server).not.toHaveBeenCalled();
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it("la ruta pública de retorno no permite iniciar ni sincronizar sin sesión", async () => {
    const f = fixture();
    const handler = createGmailHandler(
      f.gateway,
      { appOrigin: canonical, callbackUrl: callback, oauth },
      f.fetcher,
    );
    for (const action of [
      "start",
      "status",
      "sync",
      "complete",
      "disconnect",
    ]) {
      const response = await handler(
        new Request(callback, {
          method: "POST",
          headers: { origin: canonical },
          body: JSON.stringify({ action, organization_id: org }),
        }),
      );
      expect(response.status).toBe(401);
    }
    expect(f.server).not.toHaveBeenCalled();
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it("revoca el permiso en Google antes de declarar desconectada la cuenta", async () => {
    const f = fixture();
    const encrypted = await seal(
      "synthetic-refresh",
      oauth.encryptionKey,
      `${org}:${user}:synthetic-subject`,
    );
    f.server.mockImplementation(async (action) =>
      action === "credentials"
        ? {
            user_id: user,
            google_subject: "synthetic-subject",
            refresh_token_cipher: encrypted,
          }
        : null,
    );
    f.fetcher.mockResolvedValue(new Response(null, { status: 200 }));
    const handler = createGmailHandler(
      f.gateway,
      { appOrigin: canonical, callbackUrl: callback, oauth },
      f.fetcher,
    );
    const result = await handler(post(canonical, "disconnect"));
    expect(await result.json()).toEqual({ disconnected: true });
    expect(f.fetcher).toHaveBeenCalledWith(
      "https://oauth2.googleapis.com/revoke",
      expect.objectContaining({ method: "POST" }),
    );
    expect(String(f.fetcher.mock.calls[0][1]?.body)).toBe(
      "token=synthetic-refresh",
    );
    expect(f.server.mock.calls.map((c) => c[0])).toEqual([
      "credentials",
      "disconnect",
    ]);
    expect(f.server.mock.invocationCallOrder[1]).toBeGreaterThan(
      f.fetcher.mock.invocationCallOrder[0],
    );
  });
  it("un fallo de Google no borra las credenciales ni afirma una revocación inexistente", async () => {
    const f = fixture();
    const encrypted = await seal(
      "synthetic-refresh",
      oauth.encryptionKey,
      `${org}:${user}:synthetic-subject`,
    );
    f.server.mockImplementation(async (action) =>
      action === "credentials"
        ? {
            user_id: user,
            google_subject: "synthetic-subject",
            refresh_token_cipher: encrypted,
          }
        : null,
    );
    f.fetcher.mockResolvedValue(new Response(null, { status: 503 }));
    const handler = createGmailHandler(
      f.gateway,
      { appOrigin: canonical, callbackUrl: callback, oauth },
      f.fetcher,
    );
    expect((await handler(post(canonical, "disconnect"))).status).toBe(502);
    expect(f.server.mock.calls.some((c) => c[0] === "disconnect")).toBe(false);
  });
  it("desconectar de nuevo una cuenta ya revocada sigue siendo seguro", async () => {
    const f = fixture();
    const encrypted = await seal(
      "synthetic-refresh",
      oauth.encryptionKey,
      `${org}:${user}:synthetic-subject`,
    );
    f.server.mockImplementation(async (action) =>
      action === "credentials"
        ? {
            user_id: user,
            google_subject: "synthetic-subject",
            refresh_token_cipher: encrypted,
          }
        : null,
    );
    f.fetcher.mockResolvedValue(
      Response.json({ error: "invalid_token" }, { status: 400 }),
    );
    const handler = createGmailHandler(
      f.gateway,
      { appOrigin: canonical, callbackUrl: callback, oauth },
      f.fetcher,
    );
    expect((await handler(post(canonical, "disconnect"))).status).toBe(200);
    expect(f.server.mock.calls.some((c) => c[0] === "disconnect")).toBe(true);
  });
  it("refleja solo orígenes autorizados y guarda el retorno fuera del navegador", async () => {
    const f = fixture();
    const handler = createGmailHandler(
      f.gateway,
      {
        appOrigin: canonical,
        additionalOrigins: [www],
        callbackUrl: callback,
        oauth,
      },
      f.fetcher,
    );
    const started = await handler(post(www));
    expect(started.headers.get("Access-Control-Allow-Origin")).toBe(www);
    const body = await started.json();
    const state = new URL(body.url).searchParams.get("state")!;
    expect(f.server.mock.calls[0][1]).toMatchObject({
      organization_id: org,
      user_id: user,
      return_origin: www,
    });
    const result = await handler(
      new Request(`${callback}?state=${state}&code=synthetic-code`),
    );
    const destination = new URL(result.headers.get("Location")!);
    expect(destination.origin).toBe(www);
    expect(destination.hash).toMatch(
      /^#\/invoices\?gmail_ticket=[A-Za-z0-9_-]{43}$/,
    );
    expect(destination.href).not.toContain("synthetic-google-refresh");
  });
  it("no refleja ni acepta un origen ajeno aunque imite el nombre del dominio", async () => {
    const f = fixture();
    const handler = createGmailHandler(
      f.gateway,
      {
        appOrigin: canonical,
        additionalOrigins: [www],
        callbackUrl: callback,
        oauth,
      },
      f.fetcher,
    );
    const r = await handler(post("https://truckcontrolai.com.evil.example"));
    expect(r.status).toBe(403);
    expect(r.headers.get("Access-Control-Allow-Origin")).toBe(canonical);
    expect(f.server).not.toHaveBeenCalled();
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it("ni un origen almacenado manipulado puede crear una redirección abierta", async () => {
    const f = fixture();
    const handler = createGmailHandler(
      f.gateway,
      { appOrigin: canonical, callbackUrl: callback, oauth },
      f.fetcher,
    );
    const { url } = await (await handler(post())).json();
    const state = new URL(url).searchParams.get("state")!;
    for (const row of f.states.values())
      row.return_origin = "https://evil.example";
    const r = await handler(
      new Request(`${callback}?state=${state}&error=access_denied`),
    );
    expect(new URL(r.headers.get("Location")!).origin).toBe(canonical);
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it("un fallo del proveedor regresa al origen validado sin revelar sus respuestas", async () => {
    const f = fixture();
    const handler = createGmailHandler(
      f.gateway,
      {
        appOrigin: canonical,
        additionalOrigins: [www],
        callbackUrl: callback,
        oauth,
      },
      f.fetcher,
    );
    const { url } = await (await handler(post(www))).json();
    const state = new URL(url).searchParams.get("state")!;
    f.fetcher.mockResolvedValueOnce(
      new Response("private provider response", { status: 503 }),
    );
    const r = await handler(
      new Request(`${callback}?state=${state}&code=synthetic-code`),
    );
    expect(r.headers.get("Location")).toBe(
      `${www}/#/invoices?gmail_error=authorization_failed`,
    );
    expect(await r.text()).not.toContain("private provider");
  });
  it("no consulta secretos hasta verificar identidad, empresa y permiso", async () => {
    const f = fixture();
    const resolveOAuth = vi.fn(async () => oauth);
    const handler = createGmailHandler(
      f.gateway,
      { appOrigin: canonical, callbackUrl: callback, resolveOAuth },
      f.fetcher,
    );
    expect((await handler(post(canonical, "status", "invalid"))).status).toBe(
      401,
    );
    expect(
      (
        await handler(
          post(
            canonical,
            "start",
            "synthetic",
            "20000000-0000-4000-8000-000000000082",
          ),
        )
      ).status,
    ).toBe(403);
    await handler(new Request(callback));
    expect(resolveOAuth).not.toHaveBeenCalled();
    f.gateway.actionAllowed = async () => false;
    expect((await handler(post())).status).toBe(403);
    expect(resolveOAuth).not.toHaveBeenCalled();
  });
  it("el estado de configuración no entrega secretos ni activa IA", async () => {
    const f = fixture();
    const handler = createGmailHandler(
      f.gateway,
      {
        appOrigin: canonical,
        callbackUrl: callback,
        resolveOAuth: async () => oauth,
      },
      f.fetcher,
    );
    const r = await handler(post(canonical, "status"));
    const raw = await r.text();
    expect(JSON.parse(raw)).toEqual({ oauth_ready: true, ai_enabled: false });
    expect(raw).not.toContain(oauth.clientSecret);
    expect(raw).not.toContain(oauth.encryptionKey);
    expect(f.fetcher).not.toHaveBeenCalled();
  });
});
