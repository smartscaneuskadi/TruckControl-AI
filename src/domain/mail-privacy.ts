import { mailConnectorConsentVersion } from "../../supabase/functions/personal-mail/contract";

/** Supplemental technical disclosure; does not replace immutable registration consent. */
export const mailConnectorPrivacy = {
  version: mailConnectorConsentVersion,
  title: "Correo personal mediante IMAP/SMTP",
  summary:
    "Con IMAP/SMTP, la dirección, el usuario, la contraseña del buzón o de aplicación, los servidores y los mensajes que solicitas leer, gestionar o enviar pasan por el backend de TruckControl en Supabase. Se transmiten por HTTPS a TruckControl y mediante TLS al proveedor de correo que elijas.",
  retention:
    "La contraseña se mantiene en memoria del navegador durante la conexión, como máximo una hora, y en memoria temporal del servidor durante cada petición. El uso ordinario de este conector no guarda contraseñas ni contenido del correo en la base de datos, registros de aplicación, WebStorage o copias offline, ni lo envía a la IA. La opción de descargar facturas requiere una autorización independiente y explícita antes de guardar o analizar sus adjuntos.",
  withdrawal:
    "Puedes retirar esta autorización desconectando el buzón. Cerrar sesión, cambiar de usuario o empresa, recargar o salir de la página también elimina la conexión temporal. Esto no borra mensajes ni revoca una contraseña de aplicación en tu proveedor; puedes revocarla desde la seguridad de esa cuenta. Los mensajes enviados y sus copias permanecen en el proveedor de correo.",
  distinction:
    "Gmail con Google utiliza su autorización OAuth y llama a Google directamente desde el navegador para el uso ordinario del correo. Gmail con contraseña de aplicación utiliza el recorrido IMAP/SMTP descrito aquí. Dentro de una cuenta conectada puedes autorizar por separado una descarga de facturas por IA, limitada a ese buzón, empresa y período. Conectar una cuenta no inicia esa descarga.",
  consentLabel:
    "Autorizo a TruckControl a conectar este buzón mediante su backend para leer, gestionar y enviar mis mensajes, tras leer la información de privacidad de IMAP/SMTP.",
} as const;
