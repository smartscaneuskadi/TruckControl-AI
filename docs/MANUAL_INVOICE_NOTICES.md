# Avisos administrativos de facturación manual

Candidato sin desplegar. El envío parte **apagado** en la nueva tabla privada de configuración. No se modifica la migración62 ni se activan pagos, proveedores, cron o consumo IA.

## Estado verificado · 8 de noviembre de 2026

- **Producción:** este worker todavía no está desplegado; la migración63 es candidata. El envío permanece apagado por defecto. Producciónv32, recuperaciónv31 y demo6 se conservan.
- **Automatización:** no se ha creado ningún scheduler para estos avisos. `retry_wait` no ejecuta envíos por sí mismo.
- **Actividad real de este frente:** 0 correos enviados y 0 llamadas IA. Esto no describe la actividad histórica de Auth ni el consumo global de Resend.
- **Pruebas aisladas:** 33 casos HTTP y 13 SQL correctos en PR71/headb48b11b, CI42473189193 y42473193064 SUCCESS. Son pruebas con proveedores simulados; no acreditan recepción real.
- **Integración63:** el caso de pago/licencia/tarea/recibo/outbox pasó contra las migraciones reales, con rollback y sin red. El CI global de esa composición sigue pendiente de resolver sus demás incidencias; ese caso individual no certifica el lanzamiento.
- **Aceptación externa pendiente:** recepción en el buzón operativo, monitorización y procedimiento humano para estados inciertos. `accepted` nunca significa `delivered`.

## Interpretación de métricas

`attempts` cuenta leases reservados antes de llamar al proveedor; puede incluir una caída anterior al envío y no es un contador de correos recibidos. `accepted` requiere una respuesta válida del proveedor y registra su identificador. Un ACK perdido puede dejar `uncertain` aunque el proveedor haya aceptado el mensaje; nunca se infiere una entrega ni se reenvía automáticamente.

El límite propio de20 intentos diarios y500 mensuales se comparte entre trabajadores del módulo. No amplía las cuotas Free de100 mensajes diarios y3000 mensuales compartidas con los demás flujos. Se conserva el máximo de3 intentos, lease60s y ventana propia23h, sin upgrade ni compra.

## Integración transaccional

La candidata63 integra la propuesta SQL después de las tablas del bridge Stripe; su aplicación remota y aceptación se registran por separado. La RPC de pago llama a `private.tc_manual_invoice_notice_enqueue(task_id)` **después de insertar el recibo conciliado del bridge y antes de devolver el resultado**. También lo hace en un replay verificado. El aviso es único por tarea: un fallo de cola revierte la transacción del pago completo. La función privada verifica el rol SQL real `service_role`; no tiene endpoint público y no concede acceso directo a las tablas.

El outbox guarda tarea, modo, destinatario fijo, versión de plantilla y estados técnicos. Nunca copia razón social del comprador, NIF, dirección, correo del cliente, importes, PDF, mensaje original ni secretos. El destinatario autorizado es exclusivamente **pedidos@smartscaneuskadi.com**. El mensaje contiene el UUID interno y el enlace real https://truckcontrolai.com, con indicación «Administración → Facturas del servicio». El panel candidato debe publicarse antes de activar avisos.

## Worker y seguridad

`truckcontrol-manual-invoice-notices` acepta únicamente POST servidor a servidor con la credencial de servicio existente y cuerpo `{}`. Rechaza Origin, credenciales de cliente, destinatarios o contenido aportados por el solicitante. Cada invocación procesa como máximo un aviso. Reutiliza la configuración backend de Resend usada por Auth, su clave guardada en Vault y el remitente aprobado `no-reply@facturas.truckcontrolai.com`. Las claves nunca aparecen en respuestas, logs o interfaz.

Tres tablas privadas con RLS y denegación directa para clientes; también se revoca DML directo al worker. Las funciones privadas de servidor usan `search_path` vacío y verifican el rol SQL. Las funciones públicas son invocadoras, solo ejecutables por service_role. La metadata del aviso es inmutable, cada transición incrementa versión y añade auditoría append-only sin cuerpos ni errores crudos.

El modo de prueba queda encolado, pero el worker **solo reclama modo live**. Ninguna prueba de Stripe puede provocar por sí misma un correo real.

## Entrega, reintentos y límites

`pending → leased → accepted/retry_wait/uncertain/failed`. Resend accepted significa exclusivamente aceptación del proveedor; **no entrega al destinatario**, emisión fiscal o envío del PDF. Este worker no genera facturas ni remite PDFs fiscales a clientes.

Lease60s, CAS de versión/token y máximo3 intentos. Solo429 `rate_limit_exceeded` o409 `concurrent_idempotent_requests` generan reintento acotado, con la misma plantilla y clave de idempotencia. El backoff incluye jitter. Timeout, caída de red,5xx, respuesta incierta o lease caducada terminan en `uncertain`, sin reenvío automático. Una aceptación cuyo ACK de base se pierde mantiene el lease y requiere conciliación; no se vuelve a enviar a ciegas.

Resend conserva claves de idempotencia24h. La aplicación usa una ventana más corta de23h desde el primer intento; después cierra el reintento. Techo propio20 intentos/día y500/mes, contando reclamaciones antes de llamar al proveedor. El plan Free mantiene3000 mensajes/mes y100/día compartidos con Auth y los demás flujos; el techo propio de avisos no amplía esos límites. No hay upgrade/pay-as-you-go ni compra. Configuración apagada impide reclamar o consumir proveedor.

## Aceptación pendiente

Las pruebas SQL se ejecutan en PGlite aislado con clock de prueba sustituido únicamente allí; el clock de producción usa exclusivamente clock_timestamp(). Las pruebas HTTP inyectan Resend simulado y nunca envían mensajes ni llaman modelos.

Antes de desplegar: revisión, CI completo, integración atómica en63, aprobación oficial del conector, permisos y ensayo con rollback. Antes de activar: comprobar estado de proveedor y presupuesto, autorización de la prueba real dirigida al buzón operativo, aceptación de recepción, monitorización y procedimiento humano de conciliación de uncertain. No se acredita conexión o recepción real mediante mocks.

Referencia oficial consultada08/11/2026: https://resend.com/docs/dashboard/emails/idempotency-keys.
