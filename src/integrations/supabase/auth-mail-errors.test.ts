import { describe, expect, it } from "vitest";
import { FunctionsHttpError, FunctionsFetchError } from "@supabase/supabase-js";
import { authRequestError } from "./auth-mail";

describe("errores seguros y accionables del acceso por correo", () => {
  it.each([
    ["auth_mail_unavailable", 503, "servicio de confirmación"],
    ["registration_invalid", 400, "aceptación de las condiciones"],
    ["registration_closed", 403, "temporalmente cerrado"],
    ["origin_denied", 403, "https://truckcontrolai.com"],
    ["invalid_email", 400, "dirección de correo"],
  ])(
    "interpreta %s sin exponer el cuerpo del proveedor",
    async (code, status, expected) => {
      const response = Response.json(
        { error: code, private_detail: "fictitious-private-detail" },
        { status },
      );
      const message = await authRequestError(new FunctionsHttpError(response));
      expect(message).toContain(expected);
      expect(message).not.toContain("fictitious-private-detail");
      // Reading the error does not consume the response available to its caller.
      expect((await response.json()).error).toBe(code);
    },
  );
  it("conserva los mensajes de verificación y credenciales nativas", async () => {
    expect(await authRequestError({ code: "email_not_confirmed" })).toContain(
      "Confirma el correo",
    );
    expect(await authRequestError({ code: "invalid_credentials" })).toContain(
      "no son correctos",
    );
    expect(await authRequestError({ issues: [] })).toContain(
      "prefijo internacional",
    );
  });
  it.each([
    new FunctionsFetchError(Error("fictitious-private-detail")),
    new FunctionsHttpError(
      new Response("fictitious-private-detail", { status: 502 }),
    ),
    new FunctionsHttpError(
      Response.json({ error: "fictitious-private-detail" }, { status: 500 }),
    ),
  ])(
    "usa una explicación neutra si no hay un código público conocido",
    async (error) => {
      const message = await authRequestError(error);
      expect(message).toContain("Tus datos siguen en el formulario");
      expect(message).not.toContain("fictitious-private-detail");
      expect(message).not.toContain("habilitado por el administrador");
    },
  );
});
