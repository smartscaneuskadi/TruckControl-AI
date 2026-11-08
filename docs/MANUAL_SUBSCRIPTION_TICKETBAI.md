# Release 1.0 — Facturación manual asistida de suscripciones (decisión 07/11/2026)

**Emisor:** ELEVADANCOR S.L., B02993426, Polígono Arzabalza n.º 50, 20400 Tolosa. **Buzón operativo:** pedidos@smartscaneuskadi.com.

## Decisión y límites

El titular confirma que ELEVADANCOR ya dispone de **GDTaller con TicketBAI** para emitir facturas. Durante la apertura inicial, **un administrador humano emitirá y enviará manualmente las facturas fiscales desde GDTaller**. No exigir integración API de GDTaller para la primera versión. El PDF de una solicitud o un justificante de Stripe **no es una factura fiscal**. El objetivo interno de 24–48 h para enviar el PDF no reemplaza los plazos legales; asesoría debe confirmar devengo, pagos anticipados y fechas de emisión antes de cobrar.

**Estado:** decisión funcional documentada, **NO implementación ni aceptación de pagos**. Mantener cerrados los dos entrypoints de cobro y no cambiar `BILLING_INVOICING_VERIFIED` ni los bloqueos nativos solo porque exista un flujo manual. No habilitar cobros hasta tener un control operacional real y prueba nativa del proceso autorizada.

## Contrato de implementación propuesto

1. Webhook firmado del procesador confirma un cobro; identificar por `provider_event_id` y `provider_payment_id`, deduplicar y rechazar eventos de otra cuenta. Nunca crear deuda ni factura a partir del retorno del navegador.
2. Crear **una única solicitud de facturación** por cobro confirmado con identificador estable, empresa cliente, datos fiscales autorizados, importe y desglose de impuestos conforme a la asesoría, moneda, fecha, referencia del pago y estado `pending_manual_issue`.
3. Notificar al buzón operativo solo mediante canal de correo verificado; el aviso debe evitar datos sensibles innecesarios. Si falla el aviso, mantener cola visible y reintentos limitados, sin perder la solicitud.
4. Administración entra en GDTaller y **emite la factura TicketBAI**. El registro interno exige número/serie, fecha, referencia fiscal verificable, PDF fiscal y usuario responsable. Nunca generar un PDF fiscal paralelo ni simular el QR.
5. Administración envía el PDF al cliente desde un canal aprobado y marca el envío únicamente tras confirmación. Guardar referencia, fecha, destinatario y estado, con acceso administrativo y almacenamiento privado.
6. Conciliación `pago → solicitud → factura → entrega`. Reintentos de webhooks, aviso o entrega no generan facturas nuevas. Rectificaciones, anulaciones y reembolsos se escalan a administración y requieren trazabilidad; no reescribir facturas fiscales.

## Estados del contrato actual y fases futuras

El **único reductor del PR #47** es `src/domain/manual-subscription-invoicing.ts`. Sus estados actuales son `awaiting_issue → awaiting_send → sent_reported`, con `needs_review` como estado cerrado ante incidencias. `sent_reported` significa exclusivamente que un operador declaró haber enviado el PDF fiscal; **NO equivale a entrega confirmada por proveedor de correo** ni prueba que el cliente lo recibió. El prototipo alternativo que modelaba `delivered` sin esa distinción se retiró para evitar dos contratos contradictorios.

La futura persistencia y el panel deberán exigir actor autorizado, auditoría, bloqueo transaccional, RLS y prueba de documentos privados. La confirmación de entrega real, la gestión de fallos de correo y la eventual reapertura de `needs_review` requieren un contrato adicional verificado; **no se implementan con este reductor**. Nunca habilitar acceso al servicio por adjuntar un PDF o por registrar un envío manual.

## Aceptación obligatoria antes de cobrar

- [ ] Asesoría valida legalmente el flujo manual, plazos, anticipos, TicketBAI y tratamiento de facturas rectificativas.
- [ ] Administrador verifica que GDTaller emite un documento TicketBAI válido y lo entrega por correo autorizado; registrar evidencia sin publicar datos reales.
- [ ] Webhook de pago firmado, duplicado, tardío y fuera de orden: pruebas negativas y de idempotencia.
- [ ] Aislamiento entre empresas (RLS) y autorización administrativa sobre solicitudes y PDFs; prohibir acceso entre tenants.
- [ ] Pruebas de caída de correo, PDF faltante, duplicidad de factura, envío fallido y recuperación del trabajo pendiente.
- [ ] Alertas por solicitudes sin emitir y entregas pendientes; plazo interno configurable sin presentarlo como plazo legal.
- [ ] Evidencia de una aceptación nativa de extremo a extremo en entorno seguro, sin cobro no autorizado.
- [ ] Revisión y autorización explícita de lanzamiento de pagos, separada de esta decisión de producto.

**Preservación:** producción v32, respaldo v31, demo v6, 60 migraciones remotas, datos y RLS. No tocar FIXPilot; no repetir llamadas IA. Coste directo de esta documentación: 0 EUR; no se verifican aquí facturas de terceros.

## Primer avance técnico (PR #47, sin despliegue)

- `src/domain/manual-subscription-invoicing.ts`: reductor puro para un pago confirmado por servidor → tarea pendiente → factura fiscal registrada por operador → envío **declarado por operador**. No confundir `sent_reported` con entrega confirmada por el servidor de correo.
- Validaciones de referencia de evento y pago, unicidad lógica por referencia de pago, vinculación a empresa/solicitud, céntimos EUR, tiempo UTC, factura/ID TicketBAI y ruta de PDF privada bajo la empresa compradora. Repeticiones idénticas son idempotentes; contradicciones requieren revisión.
- Una incidencia produce `needs_review` sin reenvíos automáticos ni borrados; recordatorios puros de 24–48 horas son solo criterio de UI, **no plazo fiscal legal** ni notificaciones reales.
- `tests/manual-subscription-invoicing.test.ts`: casos sintéticos de pagos duplicados, eventos contradictorios, rutas ajenas/públicas, estados inválidos, timestamps, facturas distintas y registros de envío repetidos. La prueba existente del guard nativo sigue exigiendo cierre de checkout.
- El texto público de facturación aclara la opción manual futura en GDTaller. **Ningún envío ni factura real ha ocurrido por este PR.**

**Faltan para un módulo operativo:** tablas privadas y restricciones únicas durables, transacciones CAS, validación de webhooks y pago con Stripe real autorizado, permisos/RLS, panel de administración, carga protegida de PDF, aviso a `pedidos@smartscaneuskadi.com` por canal confirmado, reintentos y auditoría. Estas funciones NO están implementadas por el reductor puro; no activar `BILLING_INVOICING_VERIFIED` ni modificar `nativeSubscriptionFiscalIssuerAvailable()`.


## Candidato de persistencia privada (08/11/2026, no desplegado)

El PR de ingesta durable añade `supabase/migrations/20261108013000_manual_subscription_invoice_intake.sql` (migración **nueva**, nunca aplicada; las **60 remotas existentes no cambian**) y pruebas locales `tests/manual-subscription-intake-security.test.ts`. Define tablas privadas para solicitudes pendientes y eventos del proveedor con unicidad por ID de pago, pedido de compra y evento (una solicitud fiscal por compra, sin duplicados), RLS restrictivo deny-all, revocación de permisos para `anon` y `authenticated` y una función **privada** de ingesta con bloqueo transaccional del pedido. Rechaza empresas ajenas o ambiguas, pagos no marcados como confirmados, diferencias de céntimos y reintentos contradictorios.

**Contrato de confianza:** el dato `status='paid'` de la tabla interna no verifica por sí mismo que Stripe haya cobrado. El código nuevo **no se conecta a ningún webhook, no verifica firmas ni acepta llamadas HTTP**; el futuro adaptador deberá autenticar el evento, consultar y reconciliar el pago/importe/cuenta contra Stripe y solo entonces invocar la función. No hay endpoint público, GRANT a clientes ni automatismos de aviso. El nuevo SQL no permite cambiar estado más allá de `awaiting_issue`; para registrar factura real, CAS/versionado y auditoría harán falta otra revisión y pruebas.

**No aplicar en remoto, integrar en backend ni publicar una vista** antes de confirmar compatibilidad del esquema y aceptar el flujo fiscal. Aunque las pruebas SQL locales pasen, eso no demuestra servicio comercial, envío o TicketBAI real. Se mantienen los cobros apagados y el guard nativo `false`.


### Revisión de seguridad — compra única frente a renovación (08/11)

La restricción `tc_manual_subscription_request_unique` impide que dos referencias Stripe diferentes creen dos tareas fiscales para el **mismo** pedido inicial `tc_payment_requests.id`; el test sintético verifica que la transacción no deja evento parcial. **Limitación intencionada:** una suscripción recurrente puede generar varias facturas `tc_subscription_invoices.invoice_id` asociadas a un único pedido original. La función de ingesta candidata NO sirve para esas renovaciones: **prohibido conectarla a eventos de renovación** hasta diseñar y probar una ingesta separada, vinculada de modo único a `invoice_id`, `period_start/end`, cuenta, importe y usuario en webhook firmado y conciliación nativa. No relajar la unicidad del pedido ni habilitar pagos para sortear este bloqueo. Todo permanece en PR, sin DDL remoto ni activación.


### Integridad adicional del registro privado de eventos (08/11)

La cola candidata ahora obliga a que **cada evento de proveedor pertenezca a la misma cuenta Stripe que su tarea** mediante clave foránea compuesta `(task_id, provider_account_id) → (id, provider_account_id)`. Esto impide vincular eventos de una cuenta a tareas de otra incluso si un proceso privilegiado intentase insertar directamente en la tabla, y no depende únicamente del control de la función de ingesta. Se añadió prueba sintética de rechazo y ausencia de fila parcial en `tests/manual-subscription-intake-security.test.ts`. **No** autentica Stripe, no autoriza cobros y no concede acceso cliente. Todo sigue como migración local pendiente de verificación CI y auditoría, sin despliegue remoto.
