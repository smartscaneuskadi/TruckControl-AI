# Mi correo — acceso personal sin aprobación de TruckControl

Publicado en 0.5.12-rc.1, versión alojada 23. El ID Google está configurado y la entrada a la autorización oficial comprobada; el titular confirmó el 03/11 que lo ha probado y enviado correo real. Es una aceptación comunicada por el titular; la verificación pública de Google sigue pendiente. Consultar [entrega vigente](CURRENT_DELIVERY.md) para la publicación comprobada; no confundir pruebas con fixtures y autorización real de Google.

## Cómo funciona

**Mi correo** es independiente del módulo **Correo y facturas**. Cada usuario con cuenta de empresa activa, también Básico y consulta, elige su propio Gmail/Google Workspace y da permiso directamente a Google. No solicita aprobación al superadministrador ni al administrador de la empresa. No cambia los permisos sobre datos empresariales: una cuenta suspendida o sin licencia no obtiene acceso a la aplicación por esta vía.

La conexión personal incluye Recibidos, Enviados, Destacados, Borradores, Todos y Papelera; búsqueda paginada, lectura, respuesta, redacción de texto, descarga de adjuntos hasta 10 MB, marcar leído/no leído, destacar, archivar y papelera reversible. No busca solo facturas de los últimos 30 días. Abrir un mensaje no cambia automáticamente su estado. Los cuerpos HTML se convierten a texto y no se cargan imágenes remotas, scripts o contenido activo.

Un envío requiere revisar destinatarios y confirmarlo. Si Google no confirma el resultado, se bloquea ese envío y se indica revisar Enviados; nunca se reintenta automáticamente. Gmail no ofrece una garantía de idempotencia por nuestro identificador MIME, por lo que no se promete entrega exactamente una vez en toda circunstancia. No hay envíos reales en las pruebas.

El primer uso carga la biblioteca oficial de Google al pulsar **Preparar conexión con Google**; **Entrar con Google** abre el selector oficial mediante un gesto del usuario. Google puede pedir de nuevo el permiso cuando expire o limitarlo por sus políticas y las de la organización del cliente. No se solicitan contraseñas en TruckControl. Si un navegador bloquea la ventana, se ofrece reabrirla desde el mismo botón.

## Datos y seguridad

Se utiliza [Google Identity Services, token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model). El permiso `gmail.modify` permite leer, enviar y gestionar mensajes sin borrado definitivo; no se solicita `https://mail.google.com/`. La sesión OAuth vive únicamente en memoria del navegador y llama directamente a `gmail.googleapis.com/gmail/v1/users/me/`. No se remiten cuerpos, adjuntos o permisos de este buzón al backend de TruckControl, a la IA o al administrador.

La sesión se elimina al cerrar sesión en TruckControl, cambiar usuario/empresa, recargar o caducar. Cambiar de pantalla dentro de la misma sesión conserva solo el acceso en memoria. Los mensajes y borradores de esta interfaz no se escriben en WebStorage, IndexedDB, la cola offline ni las copias de empresa. Las respuestas de Gmail usan `no-store`, sin cookies, sin redirecciones y con límites de bytes reales. Se validan IDs, cursores, destinatarios y cabeceras MIME. Las respuestas tardías de otra sesión se descartan.

**Salir del correo** elimina el acceso local sin borrar mensajes ni revocar automáticamente otros usos del mismo cliente OAuth. El usuario puede retirar el permiso en [su cuenta Google](https://myaccount.google.com/permissions); Google puede entonces invalidar otras conexiones con TruckControl. No se conserva un refresh token personal en el servidor.

Conectar este buzón no activa IA, no copia mensajes a la contabilidad y no habilita a otro usuario para consultarlo. La integración empresarial existente mantiene su permiso de solo lectura, roles y almacenamiento cifrado anteriores. La importación de facturas y el receptor general siguen separados.

## Preparación del proveedor

Se reutiliza el cliente web existente del proyecto Google **468881730124**. El identificador público debe pertenecer a ese proyecto. El endpoint de solo configuración `company-gmail/browser-config` devuelve únicamente ese ID público validado o `null`, estado, proveedor y modo. Nunca devuelve secretos, refresh tokens o la clave AES. La salud anterior `/health` sigue comprobando la configuración del conector empresarial y no cambia de significado.

El acceso personal no necesita el secreto del cliente web. Se puede obtener su ID desde la configuración de Google existente o `truckcontrol_google_client_id` de Vault; se valida incluso si el titular guardó el JSON web completo. No se publican ni se leen en el navegador sus demás campos. No crear otro proyecto o cliente ni cambiar las credenciales de FIXPilot.

El 02/11/2026 a las 21:28 UTC se guardó el ID público del cliente existente aportado por el titular. Se modificó únicamente `truckcontrol_google_client_id`, conservando el secreto Google y la clave AES. A las 21:29 UTC, `browser-config` devuelve `configured=true` y el ID exacto en los tres orígenes de producción, con CORS y `no-store`; `/health` empresarial también devuelve `configured=true`. La solicitud oficial de autorización llega a la pantalla de inicio de sesión de Google sin errores conocidos de cliente. Esto no acredita consentimiento, acceso a un buzón, origen GIS autorizado o verificación pública. [Evidencia](verification/google-public-id-20261102.json). No ha sido necesario publicar otra versión ni realizar migraciones. Para probar desde el dominio principal: **Mi correo → Preparar conexión con Google → Entrar con Google**.

También deben estar habilitados Gmail API, los orígenes JavaScript que se usarán y el consentimiento externo con `gmail.modify`. El origen principal ya solicitado al titular es `https://truckcontrolai.com`; www y las instalaciones del hostname técnico necesitan sus propios orígenes autorizados. No se puede eludir la verificación de Google ni las restricciones de una organización Workspace. La disponibilidad pública para todos los clientes depende de ese proceso oficial. [Permisos](https://developers.google.com/workspace/gmail/api/auth/scopes), [verificación](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification). No se ha contratado una evaluación ni otro servicio de pago.

## Límites de esta entrega

Solo Gmail/Google Workspace tiene adaptador directo. Outlook/Microsoft 365, Yahoo y servidores IMAP/SMTP siguen pendientes de sus adaptadores y autorizaciones; seleccionar una marca no concede acceso. El reenvío de facturas desde distintos proveedores continúa disponible. No se presenta como acceso completo a esos buzones.

Se envía texto; todavía no se adjuntan archivos salientes ni se guardan/actualizan borradores en Google. Se pueden leer los borradores existentes. El texto que se está redactando se conserva solo en esa pantalla: no se debe cerrar, recargar o salir con trabajo sin guardar. La empresa y el correo necesitan conexión. No hay sincronización de correo offline ni lectura automática por IA en segundo plano.

Las pruebas usan buzones `.invalid`, OAuth y Gmail simulados: permisos de consulta con módulo empresarial Gmail apagado, dos temas, HTML inerte, envío confirmado/incierto, cierre de sesión durante consentimiento y recarga sin datos privados. Los perfiles Android/Windows son emulados; la prueba real comunicada por el titular el 03/11 se registra aparte de los ensayos automáticos. [Aceptación del titular](verification/personal-mail-owner-acceptance-20261103.json). En las pruebas automáticas no se ha leído ni enviado correo real, modificado planes o contratado servicios.

La retirada de permisos 401/403 limpia la sesión y el contenido cargado; está comprobada en ambos perfiles. La política pública de privacidad incorpora el alcance del correo personal y Limited Use. Pasan 816 controles de código/fuente y 72 hashes HTTPS; los checks de PR #27 verifican después los seis perfiles públicos de demo y configuración, sin conectar un Gmail real.
