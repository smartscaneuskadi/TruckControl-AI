import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { checkGoogleConfiguration } from "./provider-setup";

const accepted = { credential_validation: 1, status: "accepted", scope: "client_authentication_only", mailbox_connected: false };
function client(data: unknown, error: unknown = null) {
  const invoke = vi.fn(async () => ({ data, error }));
  return { value: { functions: { invoke } } as unknown as SupabaseClient<Database>, invoke };
}
describe("contrato de comprobación de credenciales", () => {
  it("exige la aceptación explícita y distingue la configuración del buzón conectado", async () => {
    const f = client(accepted);
    await checkGoogleConfiguration(f.value);
    expect(f.invoke).toHaveBeenCalledWith("company-gmail", { body: { action: "check_configuration" } });
  });
  it.each([null, {}, { oauth_ready: true }, { ...accepted, credential_validation: 0 }, { ...accepted, mailbox_connected: true }, { ...accepted, scope: "gmail" }])("rechaza servidores antiguos o respuestas incompatibles %s", async (data) => {
    await expect(checkGoogleConfiguration(client(data).value)).rejects.toThrow("No se han guardado cambios");
  });
  it("presenta el rechazo seguro y nunca un detalle remoto que contenga secretos", async () => {
    const privateMarker = "synthetic-private-content-not-for-ui";
    const f = client(null, { context: Response.json({ error: "google_client_rejected", details: privateMarker }, { status: 422 }) });
    await expect(checkGoogleConfiguration(f.value)).rejects.toThrow("Google rechaza las credenciales");
    try { await checkGoogleConfiguration(f.value); } catch (error) { expect((error as Error).message).not.toContain(privateMarker); }
  });
});
