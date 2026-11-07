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

## Máquina de estados sugerida

`payment_confirmed → pending_manual_issue → fiscal_issued → delivery_pending → delivered`. Estados de excepción: `needs_review`, `delivery_failed`, `refund_review`. Transiciones con actor, timestamp, referencia y control de concurrencia; no permitir `delivered` sin `fiscal_issued`. Nunca habilitar acceso por el simple hecho de adjuntar un PDF.

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
