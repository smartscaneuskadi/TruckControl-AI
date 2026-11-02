import { describe, expect, it } from "vitest";
import {
  googleClientSchema,
  googleSecretSchema,
  parseGoogleClientFile,
  providerStatusSchema,
} from "./provider-setup";
const id = "468881730124-synthetic.apps.googleusercontent.com",
  secret = "GOCSPX-synthetic-for-tests-only-000000";
describe("configuración privada de Google", () => {
  it("extrae únicamente el cliente web del proyecto y su secreto", () => {
    expect(
      parseGoogleClientFile(
        JSON.stringify({
          web: {
            client_id: id,
            client_secret: secret,
            project_id: "truckcontrolai",
            redirect_uris: ["https://truckcontrolai.com/gmail-callback"],
            auth_uri: "https://accounts.google.com/o/oauth2/auth",
          },
        }),
      ),
    ).toEqual({ client_id: id, client_secret: secret });
  });
  it("rechaza JSON ajeno, aplicaciones instaladas y retornos incorrectos", () => {
    for (const input of [
      { installed: { client_id: id, client_secret: secret } },
      { web: { client_id: id, client_secret: secret, project_id: "fixpilot" } },
      {
        web: {
          client_id: id,
          client_secret: secret,
          redirect_uris: ["https://example.com/callback"],
        },
      },
      {
        web: {
          client_id: "123-synthetic.apps.googleusercontent.com",
          client_secret: secret,
        },
      },
    ])
      expect(() => parseGoogleClientFile(JSON.stringify(input))).toThrow();
  });
  it("no admite secretos enmascarados ni devuelve contenido del archivo en errores", () => {
    const marker = "private-test-marker-should-not-appear";
    expect(googleSecretSchema.safeParse("GOCSPX-********").success).toBe(false);
    try {
      parseGoogleClientFile(JSON.stringify({ web: { client_secret: marker } }));
      throw Error("Expected rejection");
    } catch (e) {
      expect((e as Error).message).not.toContain(marker);
    }
  });
  it("limita el archivo antes de analizarlo", () => {
    expect(() => parseGoogleClientFile(" ".repeat(16385))).toThrow(/16 KB/);
  });
  it("el ID público debe estar vinculado al proyecto TruckControl", () => {
    expect(googleClientSchema.safeParse(id).success).toBe(true);
    expect(
      googleClientSchema.safeParse(
        "468881730125-other.apps.googleusercontent.com",
      ).success,
    ).toBe(false);
  });
  it("el contrato de estado elimina campos secretos inesperados", () => {
    const value = providerStatusSchema.parse({
      google: {
        client_id: id,
        id_valid: true,
        secret_valid: true,
        configured: true,
        vault_available: true,
        connections: 0,
        client_secret: secret,
      },
      auth_mail: { enabled: true, legal_ready: true },
      ai: { enabled: true, monthly_budget_cents: 1000 },
      receiving: { enabled: true, domain: "facturas.truckcontrolai.com" },
      payments_enabled: false,
      sms_enabled: false,
    });
    expect(JSON.stringify(value)).not.toContain(secret);
  });
});
