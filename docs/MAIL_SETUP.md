# Correo de cada empresa — configuración y comprobación

La entrada general en desarrollo permite importar EML/PDF/imágenes desde cualquier proveedor y prepara reenvíos verificados por empresa. Gmail directo conserva la configuración descrita abajo y su bloqueo no impide continuar con la importación general. Véase [GENERAL_EMAIL.md](GENERAL_EMAIL.md). El reenvío real sigue apagado hasta disponer de receptor y dominio autorizados.

Esta fase conecta **Gmail y Google Workspace** desde Facturas de la empresa activa. No instala un cliente universal de correo. La identidad, los documentos y la conexión de cada empresa siguen aislados; conectar Gmail no activa la IA ni crea gastos automáticamente.

## Identidades existentes

- Google Cloud creado por el titular: **TruckControlAI**, número **468881730124**. La captura traduce el identificador; no se reutiliza ese texto ni se crea otro proyecto.
- Supabase único: `truckcontrol-ai`, referencia **kkkemaycedexymrpaqtp**, organización `fixpilot-dev`. FIXPilot no interviene.
- Dominio propio: **https://truckcontrolai.com**, candidata ficticia. La demo estable v6 se conserva en su dirección anterior.
- Propietario reservado: `pedidos@smartscaneuskadi.com`, solo después de verificar su identidad. Crear un cliente Google no crea una cuenta administradora de TruckControl.

## Acceso privado y estado comprobado de Google

No existe un conector API de administración Google Cloud en este entorno. TinyFish ya está disponible y el titular autorizó hasta 1 USD del saldo existente para la configuración, sin recargas ni suscripciones. El navegador privado permite completar la configuración después de iniciar sesión; el titular introduce sus accesos y MFA únicamente en esa ventana. El conector personal Gmail de ChatGPT no administra el proyecto ni autoriza el correo de los clientes. No se solicitan contraseñas, códigos ni secretos por chat.

**Comprobación directa del 01/11/2026:** el navegador accede al proyecto correcto TruckControlAI `468881730124`, pero la lista muestra «No OAuth clients to display». Esto sustituye la confirmación anterior del titular de que había creado el cliente. La sesión de Supabase aún muestra el inicio de sesión con hCaptcha; se detuvo la tarea sin eludirlo. No se creó ningún cliente ni se cambiaron secretos. [Resultado y controles posteriores](verification/google-oauth-provider-inspection-20261101.json).

**Actualización posterior:** un perfil exclusivo también vuelve a la pantalla de acceso de Supabase después de que el titular indique haber guardado el proyecto visible. Se detienen estos reintentos; el fallo de conservación/restauración no está resuelto. La tarea independiente de Google informa de que completó el asistente de identidad, público externo y un usuario de prueba, pero se detuvo antes de crear el cliente web. Su descripción indica Pruebas, mientras su indicador final de verificación es falso: comprobar ese estado al retomar. No repetir el asistente si ya está completado ni presentar el cliente o Gmail como conectados. La automatización queda pausada cerca del límite autorizado; ampliar consumo requiere respuesta expresa. [Punto de continuación](verification/gmail-provider-setup-checkpoint-20261101.json).

1. **Gmail API ya está habilitada**, confirmado por el titular. [Proyecto existente](https://console.cloud.google.com/apis/library/gmail.googleapis.com?project=468881730124). No repetir el alta ni vincular facturación.
2. **El consentimiento Externo / Pruebas ya está preparado**, confirmado por el titular. [Google Auth Platform](https://console.cloud.google.com/auth/overview?project=468881730124). Mantener las cuentas de prueba autorizadas y los correos controlados por el titular. Verificar el dominio `truckcontrolai.com` si Google lo exige. No declarar una política legal inventada.
3. **Cliente web pendiente según la inspección del navegador.** Después de recuperar el acceso privado a Vault, volver a comprobar [Clientes](https://console.cloud.google.com/auth/clients?project=468881730124). Si la lista sigue vacía, crear una sola **Aplicación web**, nombre «TruckControl AI Gmail»; si ya aparece, reutilizarla. Origen propio `https://truckcontrolai.com`; se puede añadir `https://www.truckcontrolai.com`. URI de redirección exacta: **`https://truckcontrolai.com/gmail-callback`**. El retorno ya está publicado. No recrear el proyecto ni duplicar clientes.
4. En acceso a datos, solicitar exclusivamente `openid`, `email` y `https://www.googleapis.com/auth/gmail.readonly`. No pedir envío, modificación, eliminación ni acceso completo. Google permite lectura del buzón con ese alcance; TruckControl limita su consulta a facturas y adjuntos, pero no debe describir el permiso como acceso solo a adjuntos.
5. **Transferencia segura pendiente:** el propietario indicó que guardó valores, pero la comprobación SQL mediante booleanos encuentra ambos campos iguales y el ID no pertenece al formato Google esperado. Una vez iniciado el acceso privado, el navegador podrá transferir la pareja correcta directamente a [Vault del proyecto autorizado](https://supabase.com/dashboard/project/kkkemaycedexymrpaqtp/integrations/vault/secrets). Las migraciones y los registros ya existen: editar únicamente los valores de `truckcontrol_google_client_id` y `truckcontrol_google_client_secret`, sin duplicarlos. El ID debe empezar por `468881730124-` y terminar en `.apps.googleusercontent.com`. Dejar intacto `truckcontrol_gmail_token_encryption_key`, ya generado y verificado. No enviar valores al chat, GitHub, capturas, archivos ni variables `VITE_`. Verificar después solo formato, proyecto, campos distintos y permisos; esto no sustituye una prueba OAuth real.

Preparar el proyecto/cliente no activa un servicio de pago ni la IA. No se garantiza un coste gratuito para todas las condiciones futuras del proveedor; cualquier contratación o evaluación de seguridad de pago requiere aprobación aparte.

## Backend aplicado y comprobado

Las dos migraciones del PR #9, creadas con la CLI y revisadas, están aplicadas una sola vez tras la instrucción «Sigue» del titular. Conservan los estados, roles, licencias y datos anteriores:

- `20261101125037_gmail_oauth_return_origins.sql`: añade un origen de retorno limitado al dominio propio, www y demo estable; mantiene estado de un uso, diez minutos y validación de usuario/empresa.
- `20261101125406_gmail_provider_vault_config.sql`: genera dentro de PostgreSQL una clave AES-256 solo si no existe y no hay tokens anteriores; prepara dos secretos `pending` y una función de lectura restringida a `service_role`. No concede lectura general de Vault ni permisos a `anon`/`authenticated`. Permite revocar una conexión que necesite reautorización sin volver a habilitar su lectura.

La configuración del backend valida los tres valores, conserva un cliente completo existente y nunca combina dos parejas OAuth distintas ni rota automáticamente una clave con tokens. Solo mantiene una caché de servidor de sesenta segundos. Con valores incompletos sigue cerrado. Gmail **ACTIVE v2** incluye `config.ts`, `handler.ts` y `_shared/invoice.ts` junto a `index.ts` y su configuración Deno. Los cuatro archivos de código servidos coinciden exactamente con los revisados.

**Historial de revisión:** la revisión automática rechazó una prueba remota anterior antes de ejecutarla porque incluía DDL, secretos y una desactivación temporal del control de acceso. Ese borrador no se ejecutó. Después de revisar el PR y la instrucción del titular, se aplicaron solo las dos migraciones mediante `apply_migration`, sin desactivar controles, RLS, registro o pagos. No repetir el borrador rechazado, las migraciones ni la generación de AES. [Registro y resolución](deployment/gmail-onboarding-review.json).

El inventario remoto tiene **42 migraciones**. Versiones nuevas `20261101140631` y `20261101140639`; [inventario y correspondencias](deployment/remote-migrations-20261101-gmail.json). Apex/www devuelven 204 con CORS correcto; origen ajeno 403, acción anónima 401, estado inválido 400 y GET sin estado 303 al dominio propio. Las seis pruebas pasan. La clave AES está lista; `anon` y `authenticated` no pueden leer la configuración. El asesor de seguridad no devuelve incidencias.

La [prueba SQL remota](verification/gmail-onboarding-rollback.sql) comprueba usuario/empresa/origen, repetición, consulta y suspensión con dos empresas ficticias, manteniendo los controles activos. Rollback confirmado, sin usuarios ni empresas de prueba restantes. [Resultados](verification/gmail-backend-activation-20261101.json). No ejecutar `db push` de todo el historial: las versiones locales y remotas anteriores difieren. OAuth Google real aún no está verificado.

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
