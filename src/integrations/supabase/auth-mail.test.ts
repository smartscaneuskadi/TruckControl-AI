import { describe, it, expect, vi } from "vitest";
import {
  createAuthMailHandler,
  authHmac,
  authEmailLink,
  validAuthEmail,
} from "../../../supabase/functions/company-auth/handler.ts";
import type {
  AuthMailRuntime,
  AuthMailGateway,
} from "../../../supabase/functions/company-auth/handler.ts";
import { readEmailAction } from "./auth-mail";
const token = "a".repeat(64),
  key = "fictitious-auth-signing-" + "x".repeat(40),
  requestId = "c4000000-0000-4000-8000-000000000001";
const profile = {
  contact_name: "Persona ficticia",
  company_name: "Empresa ficticia",
  tax_id: "DEMO-001",
  address: "Calle ficticia 1",
  phone: "+34600000001",
  requested_plan: "full",
};
function setup(overrides: Partial<AuthMailRuntime> = {}) {
  const runtime: AuthMailRuntime = {
    enabled: true,
    api_key: "re_" + "fictitious".repeat(4),
    signing_key: key,
    owner_email: "owner@company.invalid",
    registration_open: true,
    legal_version: "2026-11-01",
    acceptance_enabled: false,
    ...overrides,
  };
  const config = vi.fn(async () => runtime),
    reserve = vi.fn(
      async (
        _data: Parameters<AuthMailGateway["reserve"]>[0],
      ): Promise<string | null> => requestId,
    ),
    generate = vi.fn(
      async (
        _type: "invite" | "recovery",
        _email: string,
        _metadata?: Record<string, unknown>,
      ): Promise<{ token_hash: string; user_id: string } | null> => ({
        token_hash: token,
        user_id: requestId,
      }),
    ),
    transport = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({ id: requestId }),
    );
  const consent = vi.fn(
      async (_user: string, _request: string, _version: string) => true,
    ),
    completeProfile = vi.fn(
      async (
        _token: string,
        _profile: Record<string, string>,
        _version: string,
      ) => false,
    );
  const gateway: AuthMailGateway = {
    config,
    reserve,
    generate,
    consent,
    completeProfile,
  };
  return {
    handler: createAuthMailHandler(gateway, transport as typeof fetch),
    runtime,
    config,
    reserve,
    generate,
    transport,
    consent,
    completeProfile,
  };
}
function request(
  body: object,
  origin: string | null = "https://truckcontrolai.com",
  headers: Record<string, string> = {},
) {
  return new Request("https://edge.invalid/company-auth", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(origin ? { Origin: origin } : {}),
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
const signup = () => ({
  action: "signup",
  email: "Person@Company.invalid",
  registration: profile,
  terms_accepted: true,
  terms_version: "2026-11-01",
});
async function signed(body: object, age = 0, origin: string | null = null) {
  const raw = JSON.stringify(body),
    stamp = String(Math.floor(Date.now() / 1000) - age);
  return request(body, origin, {
    "x-truckcontrol-timestamp": stamp,
    "x-truckcontrol-signature": await authHmac(
      key,
      `truckcontrol-auth-ops-v1:${stamp}.${raw}`,
    ),
  });
}
describe("correo nativo de acceso, sin SMTP ni claves en clientes", () => {
  it("no entrega una invitación si no se guarda el recibo legal", async () => {
    const s = setup();
    s.consent.mockResolvedValueOnce(false);
    expect((await s.handler(request(signup()))).status).toBe(202);
    expect(s.consent).toHaveBeenCalledWith(requestId, requestId, "2026-11-01");
    expect(s.transport).not.toHaveBeenCalled();
  });
  it("completar un perfil exige sesión verificada y consentimiento", async () => {
    const s = setup();
    const body = {
      action: "complete_profile",
      registration: profile,
      terms_accepted: true,
      terms_version: "2026-11-01",
      user_id: "attacker-controlled",
    };
    expect((await s.handler(request(body))).status).toBe(401);
    expect(s.completeProfile).not.toHaveBeenCalled();
    s.completeProfile.mockResolvedValueOnce(true);
    expect(
      (
        await s.handler(
          request(body, "https://truckcontrolai.com", {
            Authorization: "Bearer verified-native-session",
          }),
        )
      ).status,
    ).toBe(200);
    expect(s.completeProfile).toHaveBeenCalledWith(
      "verified-native-session",
      profile,
      "2026-11-01",
    );
    expect(s.reserve).not.toHaveBeenCalled();
    expect(s.transport).not.toHaveBeenCalled();
  });
  it("solo muestra dos booleanos de salud", async () => {
    const s = setup();
    const r = await s.handler(
      new Request("https://edge.invalid/company-auth/health"),
    );
    expect(await r.json()).toEqual({ configured: true, enabled: true });
    expect(s.transport).not.toHaveBeenCalled();
  });
  it("cierra si falta la clave o la política", async () => {
    for (const config of [
      { enabled: false },
      { api_key: "pending" },
      { signing_key: "short" },
    ]) {
      const s = setup(config);
      expect((await s.handler(request(signup()))).status).toBe(503);
      expect(s.generate).not.toHaveBeenCalled();
    }
  });
  it("rechaza otros orígenes antes de leer configuración", async () => {
    const s = setup();
    expect(
      (await s.handler(request(signup(), "https://evil.invalid"))).status,
    ).toBe(403);
    expect(s.config).not.toHaveBeenCalled();
  });
  it("rechaza peticiones públicas sin origen", async () => {
    const s = setup();
    expect((await s.handler(request(signup(), null))).status).toBe(403);
    expect(s.reserve).not.toHaveBeenCalled();
  });
  it("mantiene cerrado el registro sin llamar a Auth o Resend", async () => {
    const s = setup({ registration_open: false });
    expect((await s.handler(request(signup()))).status).toBe(403);
    expect(s.generate).not.toHaveBeenCalled();
    expect(s.transport).not.toHaveBeenCalled();
  });
  it.each([
    { terms_accepted: false },
    { terms_version: "old" },
    { registration: { ...profile, phone: "600" } },
    { registration: { ...profile, company_name: "" } },
    { email: "a@b.invalid\r\nBCC:other@evil.invalid" },
  ])("valida consentimiento y datos: %j", async (change) => {
    const s = setup();
    expect((await s.handler(request({ ...signup(), ...change }))).status).toBe(
      400,
    );
    expect(s.generate).not.toHaveBeenCalled();
  });
  it("no acepta contraseña antes de verificar el correo", async () => {
    const s = setup();
    expect(
      (await s.handler(request({ ...signup(), password: "do-not-transmit" })))
        .status,
    ).toBe(400);
    expect(s.generate).not.toHaveBeenCalled();
  });
  it("genera la invitación sin privilegios aportados por el cliente", async () => {
    const s = setup();
    const r = await s.handler(
      request({
        ...signup(),
        role: "admin",
        email_confirmed: true,
        user_id: requestId,
      }),
    );
    expect(r.status).toBe(202);
    expect(await r.json()).toEqual({ accepted: true });
    const [type, email, metadata] = s.generate.mock.calls[0] as unknown as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(type).toBe("invite");
    expect(email).toBe("person@company.invalid");
    expect(metadata).toMatchObject({
      truckcontrol_registration: profile,
      truckcontrol_legal: { version: "2026-11-01" },
    });
    expect(metadata).not.toHaveProperty("role");
    expect(metadata).not.toHaveProperty("email_confirmed");
  });
  it("solo guarda hashes separados y la versión de consentimiento en el limitador", async () => {
    const s = setup();
    await s.handler(request(signup()));
    const data = s.reserve.mock.calls[0][0] as {
      email_hash: string;
      ip_hash: string;
    };
    expect(data.email_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(data.email_hash).not.toBe(data.ip_hash);
    expect(JSON.stringify(data)).not.toContain("person@");
  });
  it("envía solo al destinatario validado con origen y enlace fijos", async () => {
    const s = setup();
    await s.handler(
      request({ ...signup(), redirect_to: "https://evil.invalid" }),
    );
    const [url, init] = s.transport.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.redirect).toBe("error");
    const mail = JSON.parse(String(init.body));
    expect(mail.to).toEqual(["person@company.invalid"]);
    expect(mail.from).toBe(
      "TruckControl AI <no-reply@facturas.truckcontrolai.com>",
    );
    expect(mail.html).toContain(
      `https://truckcontrolai.com/#tc-auth=invite&token_hash=${token}`,
    );
    expect(mail.html).not.toContain("evil.invalid");
  });
  it("no devuelve el enlace ni credenciales", async () => {
    const s = setup();
    const text = await (await s.handler(request(signup()))).text();
    for (const secret of [token, key, s.runtime.api_key])
      expect(text).not.toContain(secret);
  });
  it("no llama a proveedores al agotar cuota", async () => {
    const s = setup();
    s.reserve.mockResolvedValueOnce(null);
    expect((await s.handler(request(signup()))).status).toBe(202);
    expect(s.generate).not.toHaveBeenCalled();
    expect(s.transport).not.toHaveBeenCalled();
  });
  it("la recuperación no revela si existe una cuenta", async () => {
    const known = setup(),
      unknown = setup();
    unknown.generate.mockResolvedValueOnce(null);
    const body = { action: "recovery", email: "person@company.invalid" };
    expect(await (await known.handler(request(body))).json()).toEqual(
      await (await unknown.handler(request(body))).json(),
    );
    expect(unknown.transport).not.toHaveBeenCalled();
    expect(known.generate.mock.calls[0][0]).toBe("recovery");
  });
  it("no reintenta un envío de resultado desconocido ni publica errores", async () => {
    const s = setup();
    s.transport.mockRejectedValueOnce(Error("sensitive provider error"));
    const r = await s.handler(request(signup()));
    expect(r.status).toBe(202);
    expect(s.transport).toHaveBeenCalledTimes(1);
    expect(await r.text()).not.toContain("sensitive");
  });
  it("rechaza cuerpos demasiado grandes incluso sin Content-Length", async () => {
    const s = setup();
    expect(
      (
        await s.handler(
          request({ action: "recovery", email: "a".repeat(9000) }),
        )
      ).status,
    ).toBe(400);
    expect(s.reserve).not.toHaveBeenCalled();
  });
  it("no admite operaciones internas con origen ni firma falsa o caducada", async () => {
    for (const age of [0, 400]) {
      const s = setup();
      const r = age
        ? await signed({ action: "owner_invite", request_id: requestId }, age)
        : request({ action: "owner_invite", request_id: requestId }, null);
      expect((await s.handler(r)).status).toBe(403);
      expect(s.generate).not.toHaveBeenCalled();
    }
    const s = setup();
    expect(
      (
        await s.handler(
          await signed(
            { action: "owner_invite", request_id: requestId },
            0,
            "https://truckcontrolai.com",
          ),
        )
      ).status,
    ).toBe(403);
  });
  it("la operación firmada solo invita al propietario reservado", async () => {
    const s = setup({ registration_open: false });
    expect(
      (
        await s.handler(
          await signed({
            action: "owner_invite",
            request_id: requestId,
            email: "attacker@evil.invalid",
          }),
        )
      ).status,
    ).toBe(202);
    expect(s.generate.mock.calls[0][1]).toBe("owner@company.invalid");
  });
  it("no permite fixtures salvo habilitación explícita y dominio propio", async () => {
    const s = setup({ acceptance_enabled: false });
    expect(
      (
        await s.handler(
          await signed({
            action: "acceptance",
            email: `acceptance-${requestId}@facturas.truckcontrolai.com`,
            request_id: requestId,
          }),
        )
      ).status,
    ).toBe(403);
    const t = setup({ acceptance_enabled: true });
    expect(
      (
        await t.handler(
          await signed({
            action: "acceptance",
            email: "person@other.invalid",
            request_id: requestId,
          }),
        )
      ).status,
    ).toBe(403);
  });
});
describe("enlaces personales de correo", () => {
  it("valida correo y fragmento de invitación/recuperación", () => {
    expect(validAuthEmail("test+label@company.invalid")).toBe(true);
    expect(readEmailAction(`#tc-auth=invite&token_hash=${token}`)).toEqual({
      type: "invite",
      token_hash: token,
    });
    expect(readEmailAction(`#tc-auth=recovery&token_hash=${token}`)?.type).toBe(
      "recovery",
    );
    expect(authEmailLink("invite", token)).toBe(
      `https://truckcontrolai.com/#tc-auth=invite&token_hash=${token}`,
    );
  });
  it.each([
    `#tc-auth=admin&token_hash=${token}`,
    `#tc-auth=invite&token_hash=short`,
    `#tc-auth=invite&token_hash=${token}&token_hash=${token}`,
    `#tc-auth=invite&token_hash=${token}&redirect=https://evil.invalid`,
    "#/dashboard",
  ])("rechaza parámetros ambiguos o inyectados: %s", (hash) =>
    expect(readEmailAction(hash)).toBeNull(),
  );
});
