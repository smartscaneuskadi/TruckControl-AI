# Correo y facturas de TruckControl

La producción de **https://truckcontrolai.com** permite importar documentos y recibir facturas reenviadas en empresas verificadas y autorizadas. Cada empresa obtiene una dirección privada; no se comparte con otras empresas. La demo estable sigue separada, con datos ficticios. [Estado vigente](CURRENT_DELIVERY.md).

| Entrada | Estado | Requisito |
| --- | --- | --- |
| EML exportado por un buzón | Disponible | Cuenta, empresa y módulo autorizados |
| PDF, JPG, PNG y WebP | Disponible | Los mismos permisos; no necesita Google |
| Reenvío desde Gmail, Outlook o dominio propio | Receptor Resend probado | Activar la dirección de la empresa y elegir qué mensajes reenviar |
| Gmail/Google Workspace directo | Preparado; falta completar credenciales y consentimiento | Cliente Google válido, autorización del buzón y pruebas reales; revisión de Google para ampliar el acceso |
| Outlook/Microsoft 365 directo | Pendiente | Aplicación y consentimiento Microsoft; usar reenvío o EML mientras tanto |
| IMAP/SMTP como conexión del buzón | No implementado | Adaptador backend TLS y autenticación del proveedor; SMTP solo sirve para enviar |

Seleccionar un proveedor en la pantalla no concede acceso a su buzón. El reenvío entrega los mensajes elegidos por el cliente, sin acceso al resto de su correo.

## Utilizar la bandeja

1. Abrir **Correo y facturas** en la empresa correcta. La cuenta debe tener permiso para facturas.
2. Activar su dirección privada de reenvío o importar un EML/PDF/imagen. No reenviar todo el buzón ni utilizar la dirección de otra empresa.
3. Revisar los documentos detectados. El cuerpo HTML y los enlaces del correo no se ejecutan ni se presentan como instrucciones.
4. Solicitar lectura IA si la cuenta tiene autorización y ha dado su consentimiento. También se pueden completar los datos manualmente.
5. Revisar proveedor, fecha, camión, concepto e importes antes de confirmar. La confirmación registra el gasto una sola vez. Un mensaje, una firma o un resultado IA no contabiliza automáticamente.

En la demo, **Probar correo ficticio** usa un ejemplo y no llama a proveedores. Los gastos ficticios confirmados permanecen en la demo y sus duplicados se reconocen después de recargar. Para datos reales se utiliza únicamente la cuenta conectada de empresa.

## Seguridad y límites

- Máximo 10 MB y cinco documentos compatibles por correo; total de adjuntos limitado a 10 MB. Parser `postal-mime` fijado a 4.2.0 y cargado de forma diferida.
- Límites de cabeceras, partes MIME, profundidad y bytes reales leídos, incluso sin Content-Length. Se omiten imágenes insertadas, formatos no admitidos y contenido repetido.
- El tipo se comprueba por firma binaria. Los nombres se neutralizan; el almacenamiento privado usa empresa/UUID/extensión validada.
- Deduplicación por contenido y empresa, compartida con Gmail. Un documento de una empresa no revela su existencia a otra.
- El webhook valida firma, antigüedad, identidad y hash. Las reservas por empresa impiden procesamiento paralelo y los reintentos se revalidan ante suspensión o revocación.
- Una respuesta perdida no autoriza borrar el original ni registrar el gasto de nuevo a ciegas. Las operaciones financieras mantienen idempotencia y vínculo con su documento.
- La IA funciona en backend con límite global aprobado de **10 USD/mes antes de impuestos**, sin recargas, además de licencia, permiso y consentimiento. Las reservas inciertas siguen contando contra el presupuesto.
- Resend conserva el alcance gratuito autorizado, sin upgrade ni pay-as-you-go. Aplicación y proveedor imponen sus propias cuotas compartidas; no ampliar ninguna sin aprobación.

Una factura entrante no demuestra la identidad o legitimidad de su remitente. La revisión humana sigue siendo obligatoria.

## Configuración y comprobaciones

El receptor `facturas.truckcontrolai.com`, su firma y los originales privados tienen [aceptación real con tres mensajes ficticios, dos empresas y duplicados](verification/resend-live-acceptance-20261101.json). No se crearon gastos automáticos. Las pruebas cubren MIME, formatos falsos, HTML, firmas manipuladas/caducadas, roles, RLS, suspensión, reservas y contabilidad. Los recorridos Android/Windows son emulados.

La configuración de Google se administra mediante [Servicios](PROVIDER_ADMIN.md). Ya existe un cliente web de TruckControl; no crear duplicados. Guardar sus credenciales no sustituye el consentimiento de cada empresa ni la revisión de Google. El secreto permanece oculto en Google y debe introducirse completo por el canal seguro cuando esté disponible.

Confirmación de cuentas y recuperación usan Supabase Auth y Resend. Son independientes de Gmail y de los buzones Migadu. Migadu mantiene un fallo DNSSEC en los destinos DKIM de su proveedor; no desactivar DNSSEC ni considerar su envío verificado por tener el dominio activo.

Las funciones de servidor y migraciones vigentes se consultan en [CURRENT_DELIVERY](CURRENT_DELIVERY.md) y en el [inventario](deployment/remote-migrations-20261102-provider-setup.json). No repetir migraciones para reproducir estados antiguos. El documento anterior y la primera activación se conservan en [historial](history/20261102-pre-provider-setup/GENERAL_EMAIL.md).
