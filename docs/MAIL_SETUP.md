# Correo de cada empresa — configuración y comprobación

Esta fase conecta **Gmail y Google Workspace** desde Facturas de la empresa activa. No instala un cliente universal de correo. La identidad, los documentos y la conexión de cada empresa siguen aislados; conectar Gmail no activa la IA ni crea gastos automáticamente.

## Identidades existentes

- Google Cloud creado por el titular: **TruckControlAI**, número **468881730124**. La captura traduce el identificador; no se reutiliza ese texto ni se crea otro proyecto.
- Supabase único: `truckcontrol-ai`, referencia **kkkemaycedexymrpaqtp**, organización `fixpilot-dev`. FIXPilot no interviene.
- Dominio propio: **https://truckcontrolai.com**, candidata ficticia. La demo estable v6 se conserva en su dirección anterior.
- Propietario reservado: `pedidos@smartscaneuskadi.com`, solo después de verificar su identidad. Crear un cliente Google no crea una cuenta administradora de TruckControl.

## Paso que solo puede completar el propietario en Google

No existe un conector autorizado de administración Google Cloud en este entorno. El conector personal Gmail de ChatGPT no administra el proyecto ni autoriza el correo de los clientes. No se solicitan contraseñas, códigos ni secretos por chat.

1. [Habilitar Gmail API en el proyecto existente](https://console.cloud.google.com/apis/library/gmail.googleapis.com?project=468881730124). No vincular facturación ni contratar servicios.
2. En [Google Auth Platform](https://console.cloud.google.com/auth/overview?project=468881730124), configurar marca **TruckControl AI**, audiencia **Externa**, estado **Pruebas** y las cuentas Google de prueba que el titular autorice. Usar correo de soporte y contacto controlados por el titular. Autorizar el dominio `truckcontrolai.com`; verificar su propiedad si Google lo exige. No declarar una política legal inventada.
3. En [Clientes](https://console.cloud.google.com/auth/clients?project=468881730124), crear **Aplicación web**, nombre «TruckControl AI Gmail». Origen propio `https://truckcontrolai.com`; se puede añadir `https://www.truckcontrolai.com`. URI de redirección exacta: **`https://truckcontrolai.com/gmail-callback.html`**. El retorno debe estar publicado antes del ensayo. No es una aplicación Android nativa ni un secreto que deba incorporarse a la PWA.
4. En acceso a datos, solicitar exclusivamente `openid`, `email` y `https://www.googleapis.com/auth/gmail.readonly`. No pedir envío, modificación, eliminación ni acceso completo. Google permite lectura del buzón con ese alcance; TruckControl limita su consulta a facturas y adjuntos, pero no debe describir el permiso como acceso solo a adjuntos.
5. Guardar ID y secreto **directamente en el Vault de Supabase de TruckControl**, después de aprobar y aplicar las migraciones siguientes. [Abrir Vault del proyecto correcto](https://supabase.com/dashboard/project/kkkemaycedexymrpaqtp/integrations/vault/secrets). Editar los dos registros preparados, sustituyendo `pending`: `truckcontrol_google_client_id` y `truckcontrol_google_client_secret`. El ID debe empezar por `468881730124-` y terminar en `.apps.googleusercontent.com`. No enviar el secreto al chat, GitHub, capturas ni variables `VITE_`.

Preparar el proyecto/cliente no activa un servicio de pago ni la IA. No se garantiza un coste gratuito para todas las condiciones futuras del proveedor; cualquier contratación o evaluación de seguridad de pago requiere aprobación aparte.

## Cambio de backend preparado, todavía pendiente de aprobación

Dos migraciones nuevas, creadas con la CLI, conservan los estados, roles, licencias y datos anteriores:

- `20261101125037_gmail_oauth_return_origins.sql`: añade un origen de retorno limitado al dominio propio, www y demo estable; mantiene estado de un uso, diez minutos y validación de usuario/empresa.
- `20261101125406_gmail_provider_vault_config.sql`: genera dentro de PostgreSQL una clave AES-256 solo si no existe y no hay tokens anteriores; prepara dos secretos `pending` y una función de lectura restringida a `service_role`. No concede lectura general de Vault ni permisos a `anon`/`authenticated`. Permite revocar una conexión que necesite reautorización sin volver a habilitar su lectura.

La configuración del backend valida los tres valores, conserva un cliente completo existente y nunca combina dos parejas OAuth distintas ni rota automáticamente una clave con tokens. Solo mantiene una caché de servidor de sesenta segundos. Con valores incompletos sigue cerrado. La función Edge necesita desplegar también `config.ts`, `handler.ts` y `_shared/invoice.ts` junto a `index.ts`.

**La revisión automática rechazó una prueba remota anterior antes de ejecutarla:** incluía DDL, creación de secretos y una desactivación temporal de control de acceso. Ninguna operación de esa solicitud se ejecutó. Las migraciones propuestas no desactivan ese control, RLS, registro ni pagos. Se requiere revisión concreta y aprobación antes de aplicarlas por el mecanismo de migraciones; no se repite la prueba rechazada ni se sustituye por SQL indirecto. [Registro del bloqueo](deployment/gmail-onboarding-review.json).

El inventario remoto inspeccionado tiene **40 migraciones** y Gmail **versión 1**; el origen propio todavía devuelve 403 en esa versión anterior. No ejecutar `db push` de todo el historial: las versiones locales y remotas anteriores difieren. Comprobar primero inventario y correspondencias, aplicar cada migración nueva una sola vez y registrar sus versiones devueltas.

## Pruebas de aceptación después de la configuración

1. Mantener el alta pública cerrada. Usar dos cuentas verificadas y empresas de prueba autorizadas, con datos ficticios. Nunca deshabilitar globalmente las licencias o los controles para preparar usuarios.
2. Verificar por HTTPS el callback propio, la preflight desde apex/www y el rechazo de un origen ajeno. Las acciones start/status/sync/complete/disconnect siguen exigiendo sesión y empresa.
3. Conectar desde la segunda empresa de una cuenta, volver de Google y comprobar que conserva la empresa. Denegar/repetir/caducar un estado no conecta ni entrega secretos. Un ticket robado no finaliza con otro usuario o empresa.
4. Importar un correo ficticio con factura PDF; comprobar archivo privado, deduplicación y revisión manual. La IA debe indicar desactivada. Revalidar rol, licencia y empresa antes de importación/finalización.
5. Repetir con otra empresa: no debe ver conexión, archivos, facturas ni credenciales de la anterior. Consulta no puede conectar/desconectar; operador no administra la conexión.
6. Desconectar: revocar en Google antes de borrar el token local. Si Google falla, conservar la conexión y mostrar el error. Los documentos importados no se borran por desconectar; mantienen sus permisos y procedimientos de conservación.
7. Verificar recuperación, sincronización y acceso sin Gmail. Registrar asesores de seguridad, permisos SQL y resultados sin datos personales ni tokens. Confirmar que registro, IA y pagos siguen cerrados.

Los tests locales usan transportes Google simulados y PostgreSQL embebido; los recorridos Chromium emulan Android y Windows. No equivalen a OAuth real, entrega SMTP ni dispositivos físicos.

## Publicación para todos los clientes

`gmail.readonly` es un **alcance restringido** de Google. Una app externa que transmite o almacena esos datos en su servidor requiere verificación y, salvo excepción aplicable, una evaluación de seguridad por un evaluador aprobado. La PWA y el callback propio no eliminan esa obligación. Las credenciales de prueba suelen caducar a los siete días para una app externa en Pruebas con este alcance; no confundirlas con un servicio comercial permanente.

Antes de producción: propiedad del dominio, consentimiento verificado, política de privacidad y condiciones reales, declaración Google API Services User Data Policy / Limited Use, minimización y retención acordadas, acceso y borrado, contratos y obligaciones de protección de datos. El propietario debe confirmar los datos legales; no se publican datos fiscales ficticios ni se contrata una evaluación sin presupuesto y aprobación.

La confirmación/recuperación por correo de **Supabase Auth** es una integración independiente. Migadu activo y DNS publicados no acreditan aún entrega SMTP; su ticket DKIM/DNSSEC sigue abierto. Gmail no reemplaza al proveedor transaccional de Auth. La IA y los cobros requieren sus autorizaciones independientes y permanecen apagados.

## Recuperación

Se conserva la función Gmail v1, su fuente y los paquetes publicados. Si falla una versión nueva, restaurar primero la versión Edge anterior y conservar las columnas/secrets añadidos, sin eliminar documentos ni rotar AES. No hacer downgrade destructivo de la base de datos. La candidata pública usa datos ficticios, sin credenciales Supabase; una actualización visual no abre el registro ni conecta buzones reales.

Referencias oficiales: [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes), [política de datos de Google](https://developers.google.com/terms/api-services-user-data-policy), [OAuth web](https://developers.google.com/identity/protocols/oauth2/web-server), [verificación](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification), [Supabase Vault](https://supabase.com/docs/guides/database/vault).
