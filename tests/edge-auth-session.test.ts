import { describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { createBillingHandler } from "../supabase/functions/truckcontrol-billing/handler.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSessionVerifiedUser } from "../supabase/functions/_shared/auth-session.ts";
import type { SessionVerificationClient } from "../supabase/functions/_shared/auth-session.ts";
import { createMailGateway } from "../supabase/functions/company-mail/gateway.ts";
import { createMailHandler } from "../supabase/functions/company-mail/handler.ts";
const uid = "fc660000-0000-4000-8000-000000000001";
const other = "fc660000-0000-4000-8000-000000000002";
const org = "fc660000-0000-4000-8000-000000000003";
const jwt = (sub = uid, extra: object = {}) => Buffer.from('{"alg":"RS256","typ":"JWT"}').toString("base64url") + "." +
  Buffer.from(JSON.stringify({ sub, session_id: "fc660000-0000-4000-8000-000000000004", ...extra })).toString("base64url") + ".syntheticSignature";
type TestUser = { id: string; email_confirmed_at: string; user_metadata: { is_admin: boolean } };
function fixture(data: unknown = true, error: unknown = null) {
  const user: TestUser = { id: uid, email_confirmed_at: "2026-11-08T08:00:00Z", user_metadata: { is_admin: false } };
  const getUser = vi.fn(async (_token: string) => ({ data: { user: user as TestUser | null }, error: null as unknown }));
  const setHeader = vi.fn(async (_name: string, _value: string) => ({ data, error }));
  const rpc = vi.fn((_name: string, _args: Record<string, never>) => ({ setHeader }));
  const client = { auth: { getUser }, rpc } as unknown as SessionVerificationClient<TestUser>;
  return { user, getUser, setHeader, rpc, client };
}
describe("compuerta Edge: Auth verificado y sesión nativa viva antes de negocio", () => {
  it("devuelve el usuario sólo después de verificar su sesión con el JWT exacto", async () => {
    const f = fixture(), token = jwt();
    expect(await getSessionVerifiedUser(f.client, token)).toBe(f.user);
    expect(f.getUser).toHaveBeenCalledWith(token);
    expect(f.rpc).toHaveBeenCalledWith("tc_verified_session", {});
    expect(f.setHeader).toHaveBeenCalledWith("Authorization", "Bearer " + token);
    expect(f.getUser.mock.invocationCallOrder[0]).toBeLessThan(f.rpc.mock.invocationCallOrder[0]);
    expect(f.rpc.mock.calls[0][1]).not.toHaveProperty("user_id");
  });
  it("getUser válido no autoriza un JWT cuya sesión fue revocada", async () => {
    const f = fixture(false);
    expect(await getSessionVerifiedUser(f.client, jwt())).toBeNull();
    expect(f.getUser).toHaveBeenCalledOnce();
    expect(f.rpc).toHaveBeenCalledOnce();
  });
  it("un fallo o ausencia del RPC mantiene cerrada la operación y no expone diagnósticos", async () => {
    for (const error of [{ code: "PGRST202", message: "private-key-synthetic" }, { code: "42501" }, Error("private-diagnostic")]) {
      const f = fixture(null, error);
      expect(await getSessionVerifiedUser(f.client, jwt())).toBeNull();
    }
  });
  it("no convierte valores truthy, filas o texto en aceptación de sesión", async () => {
    for (const value of ["true", 1, [], { verified: true }, [{ verified: true }], null, undefined]) {
      const f = fixture(); f.setHeader.mockResolvedValue({ data: value, error: null });
      expect(await getSessionVerifiedUser(f.client, jwt())).toBeNull();
    }
  });
  it("el error Auth impide incluso consultar sesión en SQL", async () => {
    const f = fixture(); f.getUser.mockResolvedValue({ data: { user: f.user }, error: Error("private-auth-error") });
    expect(await getSessionVerifiedUser(f.client, jwt())).toBeNull();
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("un usuario ausente o con ID inválido no alcanza RPC", async () => {
    for (const user of [null, { ...fixture().user, id: "not-a-uuid" }]) {
      const f = fixture(); f.getUser.mockResolvedValue({ data: { user }, error: null });
      expect(await getSessionVerifiedUser(f.client, jwt())).toBeNull();
      expect(f.rpc).not.toHaveBeenCalled();
    }
  });
  it("rechaza sub de otra identidad después de que Auth haya respondido", async () => {
    const f = fixture();
    expect(await getSessionVerifiedUser(f.client, jwt(other))).toBeNull();
    expect(f.getUser).toHaveBeenCalledOnce();
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("metadata de administrador y roles del JWT no sustituyen a una sesión viva", async () => {
    const f = fixture(false); f.user.user_metadata.is_admin = true;
    expect(await getSessionVerifiedUser(f.client, jwt(uid, { role: "service_role", user_metadata: { is_admin: true } }))).toBeNull();
    expect(f.rpc).toHaveBeenCalledWith("tc_verified_session", {});
  });
  it("rechaza tokens malformados, controles o tamaños excesivos sin consultar Auth", async () => {
    for (const token of ["", "not-a-jwt", "a.b.c\n", "a.b.c x", "a." + "x".repeat(17000) + ".c"]) {
      const f = fixture();
      expect(await getSessionVerifiedUser(f.client, token)).toBeNull();
      expect(f.getUser).not.toHaveBeenCalled();
      expect(f.rpc).not.toHaveBeenCalled();
    }
  });
  it("JSON/payload inválido también se cierra sin usar claims como autoridad", async () => {
    for (const payload of ["[]", "null", "{broken-json", JSON.stringify({ sub: other })]) {
      const token = "eyJhbGciOiJSUzI1NiJ9." + Buffer.from(payload).toString("base64url") + ".synthetic";
      const f = fixture();
      expect(await getSessionVerifiedUser(f.client, token)).toBeNull();
      expect(f.rpc).not.toHaveBeenCalled();
    }
  });
  it("fija Authorization por consulta sin alterar headers de un cliente privilegiado", async () => {
    const f = fixture(), globalHeaders = { Authorization: "Bearer privileged-server-synthetic" };
    Object.assign(f.client, { headers: globalHeaders });
    expect(await getSessionVerifiedUser(f.client, jwt())).toBe(f.user);
    expect(globalHeaders).toEqual({ Authorization: "Bearer privileged-server-synthetic" });
    expect(f.setHeader).toHaveBeenCalledWith("Authorization", "Bearer " + jwt());
  });
  it("excepciones de Auth o PostgREST no salen del límite de autenticación", async () => {
    const first = fixture(); first.getUser.mockRejectedValue(Error("private-secret-one"));
    expect(await getSessionVerifiedUser(first.client, jwt())).toBeNull();
    const second = fixture(); second.setHeader.mockRejectedValue(Error("private-secret-two"));
    expect(await getSessionVerifiedUser(second.client, jwt())).toBeNull();
  });
  it("mantiene el valor de usuario pero no lo trata como licencia o pertenencia empresarial", async () => {
    const f = fixture();
    const result = await getSessionVerifiedUser(f.client, jwt(uid, { app_metadata: { organization_id: other } }));
    expect(result).toBe(f.user);
    expect(f.rpc).toHaveBeenCalledWith("tc_verified_session", {});
    expect(f.rpc.mock.calls[0][1]).toEqual({});
  });
});

describe("fábrica real de correo: sesión obsoleta cierra antes de server/storage/model", () => {
  for (const [label, verification, error] of [
    ["revocada", false, null], ["RPC no disponible", null, { code: "PGRST202" }], ["sesión ajena", false, { code: "42501" }],
  ] as const) it(label, async () => {
    const f = fixture(verification, error);
    const business = vi.fn(), storage = vi.fn(), model = vi.fn();
    const rawRpc = f.rpc;
    const client = {
      auth: { getUser: f.getUser },
      rpc: vi.fn((name: string, input: Record<string, never>) => {
        if (name === "tc_verified_session") return rawRpc(name, input);
        business(name); return Promise.resolve({ data: null, error: null });
      }),
      storage: { from: storage },
    } as unknown as SupabaseClient;
    const gateway = createMailGateway(client);
    const handler = createMailHandler({ ...gateway, aiStatus: model }, { origins: ["https://truckcontrolai.com"] });
    const response = await handler(new Request("https://edge.invalid/company-mail", {
      method: "POST", headers: { Origin: "https://truckcontrolai.com", Authorization: "Bearer " + jwt(), "Content-Type": "application/json" },
      body: JSON.stringify({ action: "status", organization_id: org }),
    }));
    expect(response.status).toBe(401);
    expect(business).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
    expect(model).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain("PGRST202");
  });
});

describe("autorizaciones servidor independientes de sesiones humanas", () => {
  it("un webhook Stripe firmado conserva su autorización propia sin llamar a Auth", async () => {
    const authenticate = vi.fn(async () => null), server = vi.fn(), provider = vi.fn();
    const secret = "whsec_synthetic_no_provider_account";
    const body = JSON.stringify({ id: "evt_syntheticSessionRegression", type: "payment_intent.created", data: { object: {} } });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac("sha256", secret).update(timestamp + "." + body).digest("hex");
    const handler = createBillingHandler({ authenticate, server }, {
      appOrigin: "https://truckcontrolai.com", webhookSecret: secret, invoicingVerified: false,
    }, provider);
    const response = await handler(new Request("https://edge.invalid/truckcontrol-billing?webhook=stripe", {
      method: "POST", headers: { "Stripe-Signature": "t=" + timestamp + ",v1=" + signature }, body,
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(authenticate).not.toHaveBeenCalled();
    expect(server).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
  });
  for (const valid of [true, false]) it("correo servidor firmado conserva HMAC; firma " + (valid ? "válida" : "inválida"), async () => {
    const f = fixture(false);
    const business = vi.fn(async (_name: string, _input: Record<string, unknown>) => ({ data: { state: "complete", imported: 0 }, error: null }));
    const storage = vi.fn();
    const client = {
      auth: { getUser: f.getUser },
      rpc: vi.fn((name: string, input: Record<string, unknown>) =>
        name === "tc_verified_session" ? f.rpc(name, {}) : business(name, input)),
      storage: { from: storage },
    } as unknown as SupabaseClient;
    const secret = "synthetic-mail-signing-key-for-test-only-000000";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({
      recipient: "r".repeat(32) + "@facturas.example.test",
      delivery_id: "synthetic-delivery-session-regression", message_base64: "",
    });
    const correct = createHmac("sha256", secret).update("truckcontrol-mail-v1:" + timestamp + "." + body).digest("hex");
    const handler = createMailHandler(createMailGateway(client), {
      origins: ["https://truckcontrolai.com"],
      ingress: { enabled: true, domain: "facturas.example.test", signingKey: secret },
    });
    const response = await handler(new Request("https://edge.invalid/company-mail/inbound", {
      method: "POST", headers: { "x-truckcontrol-timestamp": timestamp, "x-truckcontrol-signature": valid ? correct : "0".repeat(64) }, body,
    }));
    expect(response.status).toBe(valid ? 200 : 401);
    expect(f.getUser).not.toHaveBeenCalled();
    expect(f.rpc).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
    if (valid) {
      expect(business).toHaveBeenCalledOnce();
      expect(business).toHaveBeenCalledWith("company_mail_server", {
        p_action: "delivery_begin", p_data: expect.objectContaining({ delivery_id: "synthetic-delivery-session-regression" }),
      });
      expect(await response.json()).toEqual({ duplicate: true, imported: 0, ai_used: false });
    } else expect(business).not.toHaveBeenCalled();
  });
});
