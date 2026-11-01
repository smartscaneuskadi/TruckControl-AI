import { describe, expect, it, vi } from "vitest";
import { createGmailConfigResolver } from "../../../supabase/functions/company-gmail/config.ts";

const config = {
  clientId: "1234567890-synthetic.apps.googleusercontent.com",
  clientSecret: "synthetic-client-secret-only-for-tests",
  encryptionKey: btoa("x".repeat(32)),
};
const stored = {
  client_id: config.clientId,
  client_secret: config.clientSecret,
  encryption_key: config.encryptionKey,
};
describe("configuración Gmail exclusivamente de servidor", () => {
  it("el despliegue puede fijar el proyecto Google propio sin aceptar clientes de otra aplicación", async () => {
    const own = {
      ...stored,
      client_id: "468881730124-synthetic.apps.googleusercontent.com",
    };
    expect(
      await createGmailConfigResolver(
        {},
        async () => own,
        Date.now,
        "468881730124",
      )(),
    ).toMatchObject({ clientId: own.client_id });
    expect(
      await createGmailConfigResolver(
        {},
        async () => stored,
        Date.now,
        "468881730124",
      )(),
    ).toBeUndefined();
  });
  it("mantiene una configuración de entorno completa sin consultar ni cambiar claves", async () => {
    const read = vi.fn();
    expect(await createGmailConfigResolver(config, read)()).toEqual(config);
    expect(read).not.toHaveBeenCalled();
  });
  it("permite usar Vault con un único acceso concurrente y caché de un minuto", async () => {
    let time = 1;
    const read = vi.fn().mockResolvedValue(stored);
    const resolve = createGmailConfigResolver({}, read, () => time);
    expect(await Promise.all([resolve(), resolve(), resolve()])).toEqual([
      config,
      config,
      config,
    ]);
    expect(read).toHaveBeenCalledTimes(1);
    await resolve();
    expect(read).toHaveBeenCalledTimes(1);
    time += 60001;
    await resolve();
    expect(read).toHaveBeenCalledTimes(2);
  });
  it("no mezcla un ID de entorno incompleto con el secreto de otro cliente", async () => {
    const read = vi.fn().mockResolvedValue(stored);
    expect(
      await createGmailConfigResolver({ clientId: config.clientId }, read)(),
    ).toBeUndefined();
    expect(read).not.toHaveBeenCalled();
  });
  it("usa la clave cifrada de Vault con el par OAuth existente sin regenerar nada", async () => {
    expect(
      await createGmailConfigResolver(
        { clientId: config.clientId, clientSecret: config.clientSecret },
        async () => stored,
      )(),
    ).toEqual(config);
  });
  it("no activa Gmail con un secreto, ID o clave AES inválidos", async () => {
    for (const invalid of [
      { ...stored, client_id: "unrelated-client" },
      { ...stored, client_secret: "short" },
      { ...stored, encryption_key: btoa("x".repeat(16)) },
      { ...stored, encryption_key: "unknown" },
    ]) {
      expect(
        await createGmailConfigResolver({}, async () => invalid)(),
      ).toBeUndefined();
    }
  });
  it("mantiene la conexión apagada ante ausencia o fallo del almacén sin revelar errores", async () => {
    expect(
      await createGmailConfigResolver({}, async () => null)(),
    ).toBeUndefined();
    expect(
      await createGmailConfigResolver({}, async () => {
        throw Error("private provider error and secret");
      })(),
    ).toBeUndefined();
  });
});
