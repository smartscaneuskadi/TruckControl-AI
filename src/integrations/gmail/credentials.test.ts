import { describe, expect, it, vi } from "vitest";
import { createGoogleCredentialValidator } from "../../../supabase/functions/company-gmail/credentials.ts";
import { createGmailHandler } from "../../../supabase/functions/company-gmail/handler.ts";
import type { GmailGateway } from "../../../supabase/functions/company-gmail/handler.ts";
import { createGmailConfigResolver } from "../../../supabase/functions/company-gmail/config.ts";
import { gmailFailureCode, gmailFailureMessage } from "./errors";

const origin = "https://truckcontrol.example";
const callbackUrl = `${origin}/gmail-callback`;
const org = "20000000-0000-4000-8000-000000000021";
const user = "10000000-0000-4000-8000-000000000021";
const credentials = {
  clientId: "468881730124-synthetic.apps.googleusercontent.com",
  clientSecret: "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ts-only",
};
const oauth = { ...credentials, encryptionKey: btoa("x".repeat(32)) };
const request = (
  action: string,
  extra: Record<string, unknown> = {},
  token = "test-session",
) =>
  new Request(`${origin}/functions/v1/company-gmail`, {
    method: "POST",
    headers: {
      Origin: origin,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, ...extra }),
  });
function fixture({ admin = true, authenticated = true, owns = true } = {}) {
  const states = new Map<string, Record<string, unknown>>();
  const server = vi.fn(
    async <T>(action: string, data: Record<string, unknown>): Promise<T> => {
      if (action === "state_create") {
        states.set(String(data.state_hash), data);
        return {} as T;
      }
      if (action === "state_consume") {
        const v = states.get(String(data.state_hash));
        states.delete(String(data.state_hash));
        return (v ?? null) as T;
      }
      return {} as T;
    },
  );
  const gateway: GmailGateway = {
    authenticate: vi.fn(async () => (authenticated ? { id: user } : null)),
    canConfigureGoogle: vi.fn(async () => admin),
    owns: vi.fn(async () => owns),
    server: <T>(action: string, data: Record<string, unknown>) =>
      server(action, data) as Promise<T>,
    upload: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
  };
  return { gateway, server };
}
const provider = (error = "invalid_grant", status = 400) =>
  vi.fn<typeof fetch>(async () =>
    Response.json(
      { error, error_description: "private Google detail never shown" },
      { status },
    ),
  );

describe("validación privada de credenciales Google", () => {
  it("consulta solo el endpoint fijo, sin seguir redirecciones ni utilizar un código de usuario", async () => {
    const fetcher = provider();
    const check = createGoogleCredentialValidator(callbackUrl, fetcher);
    expect(await check(credentials)).toBe("accepted");
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    expect(options).toMatchObject({
      method: "POST",
      redirect: "error",
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
    });
    const body = options!.body as URLSearchParams;
    expect(body.get("code")).toBe(
      "truckcontrol-configuration-check-not-a-user-authorization-code",
    );
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("client_secret")).toBe(credentials.clientSecret);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([
    ["invalid_client", 401],
    ["unauthorized_client", 400],
  ] as const)(
    "identifica %s sin devolver detalles del proveedor",
    async (error, status) => {
      expect(
        await createGoogleCredentialValidator(
          callbackUrl,
          provider(error, status),
        )(credentials),
      ).toBe("rejected");
    },
  );
  it.each([
    ["unknown", 400],
    ["invalid_grant", 500],
    ["invalid_grant", 401],
    ["invalid_client", 429],
  ])("no acepta una respuesta incierta %s/%s", async (error, status) => {
    expect(
      await createGoogleCredentialValidator(
        callbackUrl,
        provider(error, status),
      )(credentials),
    ).toBe("unavailable");
  });
  it("no interpreta una respuesta 200 como permiso de acceso y no devuelve posibles tokens", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ access_token: "private-token" }),
    );
    expect(
      await createGoogleCredentialValidator(callbackUrl, fetcher)(credentials),
    ).toBe("unavailable");
  });
  it("agrupa concurrencia y limita la caché a un minuto por pareja, sin mezclar secretos nuevos", async () => {
    let now = 1;
    const fetcher = provider();
    const check = createGoogleCredentialValidator(
      callbackUrl,
      fetcher,
      () => now,
    );
    expect(
      await Promise.all([
        check(credentials),
        check(credentials),
        check(credentials),
      ]),
    ).toEqual(["accepted", "accepted", "accepted"]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await check({
      ...credentials,
      clientSecret: credentials.clientSecret + "new",
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    now += 60001;
    await check(credentials);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("no cachea errores de red ni expone sus mensajes", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => {
      throw Error(credentials.clientSecret);
    });
    const check = createGoogleCredentialValidator(callbackUrl, fetcher);
    expect(await check(credentials)).toBe("unavailable");
    expect(await check(credentials)).toBe("unavailable");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe("control administrativo y retorno OAuth", () => {
  for (const action of ["check_configuration", "validate_configuration"]) {
    it(`${action} exige sesión y administración global antes de consultar Google`, async () => {
      for (const access of [{ authenticated: false }, { admin: false }]) {
        const f = fixture(access),
          fetcher = provider();
        const handler = createGmailHandler(
          f.gateway,
          { appOrigin: origin, callbackUrl, oauth },
          fetcher,
        );
        const response = await handler(
          request(action, {
            client_id: credentials.clientId,
            client_secret: credentials.clientSecret,
          }),
        );
        expect(response.status).toBe(
          access.authenticated === false ? 401 : 403,
        );
        expect(fetcher).not.toHaveBeenCalled();
        expect(f.server).not.toHaveBeenCalled();
        expect(await response.text()).not.toContain(credentials.clientSecret);
      }
    });
  }
  it("rechaza otro proyecto, valores enmascarados y orígenes ajenos antes de Google", async () => {
    const f = fixture(),
      fetcher = provider();
    const handler = createGmailHandler(
      f.gateway,
      { appOrigin: origin, callbackUrl, oauth },
      fetcher,
    );
    for (const pair of [
      {
        client_id: "123-wrong.apps.googleusercontent.com",
        client_secret: credentials.clientSecret,
      },
      { client_id: credentials.clientId, client_secret: "***********" },
    ])
      expect(
        (await handler(request("validate_configuration", pair))).status,
      ).toBe(400);
    const foreign = request("check_configuration");
    foreign.headers.set("Origin", "https://other.example");
    expect((await handler(foreign)).status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("comprueba una pareja candidata sin guardarla, leer correos ni emitir tokens", async () => {
    const f = fixture(),
      fetcher = provider();
    const handler = createGmailHandler(
      f.gateway,
      { appOrigin: origin, callbackUrl, oauth },
      fetcher,
    );
    const response = await handler(
      request("validate_configuration", {
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
      }),
    );
    expect(await response.json()).toEqual({
      credential_validation: 1,
      status: "accepted",
      scope: "client_authentication_only",
      mailbox_connected: false,
    });
    expect(f.server).not.toHaveBeenCalled();
    expect(f.gateway.upload).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("las credenciales rechazadas detienen el inicio antes de crear estado o enviar al usuario a Google", async () => {
    const f = fixture(),
      fetcher = provider("invalid_client", 401);
    const handler = createGmailHandler(
      f.gateway,
      { appOrigin: origin, callbackUrl, oauth, validateOAuthCredentials: true },
      fetcher,
    );
    const response = await handler(request("start", { organization_id: org }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "google_client_rejected" });
    expect(f.server).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("verifica primero la empresa antes de la validación remota", async () => {
    const f = fixture({ owns: false }),
      fetcher = provider();
    const handler = createGmailHandler(
      f.gateway,
      { appOrigin: origin, callbackUrl, oauth, validateOAuthCredentials: true },
      fetcher,
    );
    expect(
      (await handler(request("start", { organization_id: org }))).status,
    ).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("la respuesta OAuth invalid_client vuelve como error concreto, sin secretos y con estado de un solo uso", async () => {
    const f = fixture(),
      fetcher = provider("invalid_client", 401);
    const handler = createGmailHandler(
      f.gateway,
      { appOrigin: origin, callbackUrl, oauth },
      fetcher,
    );
    const start = await (
      await handler(request("start", { organization_id: org }))
    ).json();
    const state = new URL(start.url).searchParams.get("state")!;
    const callback = () =>
      handler(
        new Request(`${callbackUrl}?state=${state}&code=synthetic-user-code`),
      );
    const result = await callback();
    expect(result.headers.get("Location")).toBe(
      `${origin}/#/invoices?gmail_error=client_configuration`,
    );
    expect(result.headers.get("Location")).not.toContain(
      credentials.clientSecret,
    );
    expect(
      f.server.mock.calls.some(([action]) => action === "pending_create"),
    ).toBe(false);
    expect((await callback()).headers.get("Location")).toContain(
      "gmail_error=expired",
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("la comprobación actual solicita configuración fresca del servidor", async () => {
    const f = fixture(),
      fetcher = provider();
    const resolveOAuth = vi.fn(async () => oauth);
    const handler = createGmailHandler(
      f.gateway,
      { appOrigin: origin, callbackUrl, resolveOAuth },
      fetcher,
    );
    expect((await handler(request("check_configuration"))).status).toBe(200);
    expect(resolveOAuth).toHaveBeenCalledWith(true);
  });
});

describe("recarga y errores de configuración", () => {
  it("una resolución anterior no vuelve a cachear la configuración sustituida", async () => {
    let finishOld!: (v: unknown) => void;
    const old = new Promise((resolve) => {
      finishOld = resolve;
    });
    const stored = {
      client_id: oauth.clientId,
      client_secret: oauth.clientSecret,
      encryption_key: oauth.encryptionKey,
    };
    const changed = { ...stored, client_secret: stored.client_secret + "new" };
    const read = vi
      .fn()
      .mockImplementationOnce(() => old)
      .mockResolvedValue(changed);
    const resolve = createGmailConfigResolver(
      {},
      read,
      () => 1,
      "468881730124",
    );
    const earlier = resolve();
    expect((await resolve(true))?.clientSecret).toBe(changed.client_secret);
    finishOld(stored);
    await earlier;
    expect((await resolve())?.clientSecret).toBe(changed.client_secret);
    expect(read).toHaveBeenCalledTimes(2);
  });
  it("el navegador solo interpreta códigos permitidos y nunca muestra cuerpos o detalles remotos", async () => {
    expect(
      await gmailFailureCode(null, {
        context: Response.json({
          error: "google_client_rejected",
          secret: credentials.clientSecret,
        }),
      }),
    ).toBe("google_client_rejected");
    expect(
      await gmailFailureCode(
        { error: credentials.clientSecret },
        Error(credentials.clientSecret),
      ),
    ).toBeUndefined();
    expect(gmailFailureMessage(undefined)).not.toContain(
      credentials.clientSecret,
    );
    expect(gmailFailureMessage("google_client_rejected")).toContain(
      "La administración debe corregir",
    );
  });
});
