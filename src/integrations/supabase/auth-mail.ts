export const customAuthMail =
  import.meta.env.VITE_AUTH_MAIL_PROVIDER === "resend";

/** Only translate known codes. Provider bodies may contain private details. */
export async function authRequestError(error: unknown): Promise<string> {
  const fallback =
    "No se ha podido completar la solicitud. Tus datos siguen en el formulario; comprueba la conexión y vuelve a intentarlo.";
  if (!error || typeof error !== "object") return fallback;
  if ("issues" in error)
    return "Revisa los datos y escribe el teléfono con prefijo internacional, por ejemplo +34.";
  let code =
    "code" in error && typeof error.code === "string" ? error.code : "";
  if ("context" in error && error.context instanceof Response) {
    try {
      const body: unknown = await error.context.clone().json();
      if (
        body &&
        typeof body === "object" &&
        "error" in body &&
        typeof body.error === "string"
      )
        code = body.error;
    } catch {
      // A proxy can return HTML or an empty response; never expose that body.
    }
  }
  switch (code) {
    case "email_not_confirmed":
      return "Confirma el correo antes de entrar.";
    case "invalid_credentials":
      return "El correo o la contraseña no son correctos.";
    case "invalid_email":
      return "Revisa la dirección de correo electrónico.";
    case "registration_invalid":
      return "Revisa los datos de la empresa y la aceptación de las condiciones vigentes. Tus datos siguen en el formulario.";
    case "registration_closed":
      return "El registro de nuevas empresas está temporalmente cerrado. Si ya tienes cuenta, puedes entrar.";
    case "auth_mail_unavailable":
      return "El servicio de confirmación no está disponible en este momento. Tus datos siguen en el formulario; vuelve a intentarlo más tarde.";
    case "origin_denied":
      return "Abre https://truckcontrolai.com para solicitar el acceso desde la dirección oficial.";
    default:
      return fallback;
  }
}
export interface EmailAction {
  type: "invite" | "recovery";
  token_hash: string;
}
export function readEmailAction(hash: string): EmailAction | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const type = params.get("tc-auth"),
    token_hash = params.get("token_hash");
  if (
    (type !== "invite" && type !== "recovery") ||
    !token_hash ||
    !/^[A-Za-z0-9_-]{32,256}$/.test(token_hash) ||
    [...params.keys()].length !== 2 ||
    params.getAll("tc-auth").length !== 1 ||
    params.getAll("token_hash").length !== 1
  )
    return null;
  return { type, token_hash };
}
