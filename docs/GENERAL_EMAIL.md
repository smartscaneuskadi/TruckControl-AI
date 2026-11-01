# Correo y facturas — proveedores generales

TruckControl mantiene Gmail OAuth y añade una entrada de documentos independiente de Google. Este módulo sirve para recibir facturas; no es un cliente universal para leer o enviar todo el correo.

| Entrada | Implementación | Requisito para uso real |
| --- | --- | --- |
| Correo guardado como EML | Previsualización y lectura de adjuntos PDF/imágenes | Cuenta y empresa verificadas, conexión a Supabase y módulo de facturas permitido |
| PDF, JPG, PNG y WebP | Importación directa a la misma bandeja | Los mismos permisos; no necesita cuenta Google |
| Reenvío desde cualquier buzón | Receptor HTTP firmado, dirección por empresa, exclusión y reintentos | Conectar un receptor/relay autorizado y su dominio; apagado por defecto |
| Gmail/Google Workspace directo | OAuth y lector anteriores conservados | Cliente Google y secretos válidos, consentimiento y prueba real pendientes |
| Outlook/Microsoft 365 directo | No se presenta como conectado | Requiere su aplicación y consentimiento Microsoft OAuth; usar EML o reenvío mientras tanto |
| IMAP/SMTP directo | No implementado como conexión de buzón | Requiere servicio backend TLS y autenticación admitida por cada proveedor. SMTP sirve para enviar; no permite leer el buzón |

La importación de EML y adjuntos funciona con archivos exportados por cualquier proveedor que admita esos formatos. Un reenvío solo entrega los mensajes elegidos por el cliente; no da acceso al resto del buzón. Gmail, Outlook o un dominio propio no se consideran conectados por seleccionar una opción en la interfaz.

## Uso en la aplicación

1. Abrir **Correo y facturas**. En la demo, pulsar **Probar correo ficticio**.
2. Revisar el nombre y tamaño de los adjuntos detectados. El texto, HTML y enlaces del mensaje no se renderizan ni se guardan.
3. Importar los documentos a la bandeja de la empresa activa.
4. Completar fecha, camión, concepto e importes. La confirmación existente registra el gasto una sola vez. Ningún correo, firma o resultado IA registra gastos por sí mismo.

En empresas autorizadas, el selector admite archivos reales EML/PDF/imágenes. La candidata publicada mantiene datos ficticios y no incorpora conexión a datos empresariales: ofrece el correo de ejemplo, sin seleccionar ni cargar correos reales. Sus adjuntos de prueba permanecen en memoria hasta salir de la pantalla; los gastos ficticios confirmados siguen guardados y no se duplican al importar el mismo ejemplo después de recargar.

La lectura de importes por IA permanece apagada en esta vía. No se extraen importes del asunto o del nombre del archivo ni se llama a un modelo por disponer de una clave.

## Límites y tratamiento de archivos

- Máximo 10 MB de archivo y cinco documentos compatibles por correo; el total de adjuntos también está limitado a 10 MB.
- Parser `postal-mime` fijado a **4.2.0**, sin dependencias de ejecución adicionales. Su carga en el navegador es diferida.
- Límites de cabeceras, partes MIME y profundidad; no se acepta un mensaje cuya estructura supere los límites.
- Se omiten imágenes insertadas, formatos no admitidos y contenido repetido. Las firmas binarias determinan el tipo del documento.
- Las rutas y controles de texto del nombre original se neutralizan. El almacenamiento usa empresa/UUID/extensión validada y nunca una ruta aportada por el remitente.
- El cuerpo se lee con un límite real de bytes, incluso sin `Content-Length`; las entregas firmadas incluyen un margen acotado para base64.
- Deduplicación por contenido y empresa, compartida con Gmail. El mismo documento puede existir en dos empresas sin comunicar a una que la otra lo tiene.
- Si se pierde la respuesta del registro, se conserva el archivo privado hasta confirmar el resultado. Solo un rechazo de base de datos confirmado permite limpiar automáticamente la subida nueva.

Los documentos originales no se ejecutan ni se muestran como HTML del correo. La validación de tipo no equivale a un análisis antivirus del contenido de un PDF; antes de una apertura comercial se debe acordar el tratamiento de archivos y el análisis aplicable.

## Backend y permisos

Función nueva `company-mail`, con autenticación propia:

- POST normal JSON: `status`, `enable_inbox` y `disable_inbox`, con sesión verificada mediante `auth.getUser()`.
- POST multipart: `organization_id` y un único archivo `file`. Verifica empresa, rol de escritura y módulo antes del tratamiento y antes de guardar cada documento.
- POST `/company-mail/inbound`: exclusivamente un receptor de servidor autorizado, con HMAC y sin origen de navegador.

Se conserva el identificador de permiso `gmail` por compatibilidad con los planes y controles existentes; la interfaz lo denomina **Correo y facturas**. No se concede acceso adicional al archivo documental ni se relajan licencias, roles o RLS. La aprobación financiera existente permanece intacta.

La migración local **20261101172906_company_mail_ingestion.sql**, creada con CLI, es aditiva. Añade procedencia a las facturas, buzones y recibos internos, y un RPC `company_mail_server` exclusivo de `service_role`. La entrada pública es `SECURITY INVOKER`; las tablas nuevas tienen RLS y no permiten lectura ni escritura directa a `anon` o `authenticated`. El servidor comprueba nuevamente pertenencia, módulo, licencia y rol dentro de la operación SQL. No modifica tokens Gmail, AES, alta pública, cobros ni FIXPilot.

## Contrato para el receptor de reenvíos

No se ha contratado ni activado un proveedor de recepción. El backend permanece cerrado hasta configurar simultáneamente:

- `COMPANY_MAIL_INGRESS_ENABLED=true`, después de verificar y autorizar el receptor.
- `COMPANY_MAIL_INGRESS_DOMAIN`, dominio de recepción propio validado por el proveedor.
- `COMPANY_MAIL_INGRESS_SIGNING_KEY`, valor independiente de al menos 32 caracteres, solo en el backend y en el relay autorizado. No reutilizar AES, credenciales Google ni claves de cliente.

El receptor autorizado transforma el mensaje recibido en este objeto, conservando idéntico cuerpo en cada reintento de la misma entrega:

```json
{
  "recipient": "token-generado-por-el-servidor@dominio-de-recepcion-validado",
  "delivery_id": "identificador-estable-del-receptor",
  "message_base64": "correo-RFC822-en-base64"
}
```

Los ejemplos no son direcciones activas ni firmas de acceso. El administrador de cada empresa solo puede generar su dirección cuando el receptor esté disponible. La empresa nunca se elige a partir de `organization_id` enviado por el remitente: se resuelve desde el destinatario interno previamente emitido.

Cabeceras de la entrega:

```text
x-truckcontrol-timestamp: segundos Unix en decimal
x-truckcontrol-signature: HMAC-SHA256 hexadecimal
```

La firma cubre los bytes exactos de:

```text
truckcontrol-mail-v1:<timestamp>.<cuerpo JSON original>
```

Se verifica con Web Crypto, sin comparación manual de secretos, y una ventana de cinco minutos. Cambiar destinatario, bytes, asunto o adjuntos invalida la firma. Un proveedor con otro contrato nativo debe utilizar un adaptador: no basta con enviar su webhook sin esta firma.

Cada entrega tiene identidad, hash de cuerpo y una reserva temporal por empresa. Las repeticiones completadas no procesan el mensaje; una entrega en curso no se ejecuta en paralelo. Se rechaza reutilizar la identidad con otro cuerpo. Caducar la reserva no permite finalizar con la anterior. Se revalidan la empresa y el buzón antes de registrar cada documento; desactivar el buzón bloquea también la reserva previa. Hay límites diarios de 200 entregas y 200 documentos en esta entrada y diez intentos por entrega. El servidor serializa por empresa las comprobaciones de cuota e identidad.

Un correo entrante no es evidencia de que el proveedor o remitente de la factura sea legítimo. La revisión humana permanece obligatoria. La configuración del dominio, la entrega de mensajes y el adaptador real necesitan pruebas con un proveedor autorizado; las pruebas sintéticas no los acreditan.

## Validación y continuación

Las pruebas cubren MIME, límites, archivos falsos, no ejecución de HTML, firma manipulada/caducada, pertenencia, roles, suspensión, RLS, repetición, reservas caducadas, cancelación, integridad de originales y deduplicación financiera. Los recorridos de navegador prueban Android/Windows emulados y ambos temas. No equivalen a pruebas físicas ni a recepción real de correo.

La migración se aplicó una vez como versión remota **20261101175756** (43 migraciones) y `company-mail` está ACTIVE v1; sus cinco archivos coinciden con la revisión. Las siete comprobaciones HTTP pasan y el asesor de seguridad no informa incidencias. El módulo histórico `gmail` permanece desactivado en el entorno remoto. La prueba de importación completa se detuvo por ese control, sin dejar registros. La [prueba del módulo cerrado](verification/company-mail-disabled-rollback.sql) sí pasa en PostgreSQL remoto con rollback; la [prueba positiva](verification/company-mail-rollback.sql) pasa localmente y debe repetirse remotamente al habilitar el módulo para una aceptación autorizada. No se cambian controles para obtener un resultado positivo.

Para terminar la activación real: conectar el receptor elegido sin contratar costes no aprobados, validar su dominio, configurar el relay y sus secretos por canales privados, probar dos empresas autorizadas y mensajes ficticios y verificar recuperación. IMAP y Microsoft OAuth pueden añadirse como adaptadores a la misma bandeja sin cambiar el registro de gastos. Gmail y el proveedor SMTP de confirmación/recuperación siguen siendo integraciones independientes.
