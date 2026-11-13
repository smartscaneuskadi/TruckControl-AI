# Correo personal dentro de TruckControl AI

Sites37 sustituye los iframes de Sites35 por un cliente de correo real. El único apartado Correo permite añadir varias cuentas sin máximo configurado y trabajar con carpetas, búsqueda, lectura, adjuntos y redacción. Los buzones abiertos permanecen al cambiar de sección. Cerrar sesión, cambiar de empresa/usuario, salir de la página o caducar la conexión elimina las credenciales temporales.

| Proveedor | Conexión |
| --- | --- |
| Gmail | OAuth de Google existente o contraseña de aplicación si la cuenta lo admite |
| Yahoo | Contraseña de aplicación; IMAP993 / SMTP465 |
| Porkbun | Credenciales del buzón; IMAP993 / SMTP465 |
| Otros | Servidores públicos IMAP993 / SMTP465 compatibles, indicados por el usuario |
| Outlook / Microsoft365 | Integración OAuth específica pendiente; no prometer acceso universal |

Una URL de webmail no proporciona por sí sola acceso al buzón. Las restricciones de páginas externas y autenticación del proveedor deben respetarse. No se eliminan CSP/X-Frame-Options ni se captura el formulario del proveedor.

El usuario debe iniciar sesión en TruckControl, introducir la cuenta y sus servidores, y consentir su uso. La contraseña sólo permanece temporalmente en memoria y se transmite por HTTPS al transporte; no se guarda en base de datos, WebStorage, copias offline ni logs. El backend verifica sesión y empresa antes del acceso, limita tamaños y destinos, y exige certificados TLS válidos. No hay envío automático: cada correo requiere revisión y confirmación. Un resultado incierto no se reintenta automáticamente; se pide revisar Enviados.

La candidata de privacidad del 13/11/2026 publica una ampliación informativa específica para este recorrido, versión `2026-11-13`, también visible junto al formulario. Cuenta, contraseña, servidores y contenido solicitado pasan por el backend de TruckControl en Supabase; la contraseña permanece en RAM del navegador hasta una hora y en memoria temporal del servidor por petición. Cada nueva configuración exige casilla explícita, sin persistencia: cambiar correo, usuario, contraseña o servidor la retira; cambiar proveedor, usuario/empresa, salir o recargar también limpia el estado. El backend exige la versión actual antes de usar las credenciales o el transporte. Los clientes antiguos en caché deben actualizar y aceptar esta información; no se cambia el registro/licencia ni su versión contractual `2026-11-02`. [Detalle y despliegue](MAIL_CONNECTOR_PRIVACY.md).

El botón de comprobación verifica los servicios cifrados Yahoo/Porkbun sin credenciales. No certifica acceso a la cuenta. Las pruebas nativas confirmaron ambos servicios y rechazo de sesión inválida; no se autenticó un buzón del titular ni se enviaron mensajes reales. La demo usa sólo mensajes ficticios. Evidencia: `docs/verification/personal-mail-connectors-published-20261108.json`.
