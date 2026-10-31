import { describe, expect, it, vi } from "vitest";
import { createGmailHandler } from "../../../supabase/functions/company-gmail/handler.ts";
import type { GmailGateway } from "../../../supabase/functions/company-gmail/handler.ts";
const org = "20000000-0000-4000-8000-000000000071",
  user = "10000000-0000-4000-8000-000000000071";
function request(action: string) {
  return new Request("https://project.example/functions/v1/company-gmail", {
    method: "POST",
    headers: {
      authorization: "Bearer synthetic",
      origin: "https://truckcontrol.example",
    },
    body: JSON.stringify({ action, organization_id: org }),
  });
}
function fixture() {
  const actions: string[] = [];
  const gateway: GmailGateway = {
    authenticate: async () => ({ id: user }),
    owns: async () => true,
    server: async <T>(action: string) => {
      actions.push(action);
      return {} as T;
    },
    upload: async () => {},
    remove: async () => {},
  };
  return { gateway, actions };
}
const config = {
  appOrigin: "https://truckcontrol.example",
  callbackUrl: "https://project.example/functions/v1/company-gmail",
  enforceEntitlements: true,
  oauth: {
    clientId: "synthetic",
    clientSecret: "synthetic",
    encryptionKey: "unused",
  },
};
describe("permisos de servidor para Gmail e IA", () => {
  it("no permite iniciar OAuth ni importar si el administrador bloqueó el módulo", async () => {
    const f = fixture();
    f.gateway.featureAllowed = async () => false;
    const fetcher = vi.fn<typeof fetch>();
    const handler = createGmailHandler(f.gateway, config, fetcher);
    expect((await handler(request("start"))).status).toBe(403);
    expect((await handler(request("sync"))).status).toBe(403);
    expect(f.actions).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("falla de forma cerrada si el despliegue requiere permisos y falta la comprobación", async () => {
    const f = fixture();
    expect(
      (await createGmailHandler(f.gateway, config)(request("start"))).status,
    ).toBe(503);
  });
  it("una clave IA configurada no habilita el uso para un usuario sin permiso", async () => {
    const f = fixture();
    f.gateway.featureAllowed = async (_org, _user, feature) =>
      feature === "gmail";
    const response = await createGmailHandler(f.gateway, {
      ...config,
      ai: { key: "synthetic-key", model: "synthetic-model" },
    })(request("status"));
    expect(await response.json()).toMatchObject({
      oauth_ready: true,
      ai_enabled: false,
    });
  });
});
