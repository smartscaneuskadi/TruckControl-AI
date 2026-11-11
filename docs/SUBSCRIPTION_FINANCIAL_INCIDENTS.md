# Incidencias financieras de suscripciones

Candidato64 sin aplicar ni activar. Subsana la ausencia de observaciones durables de devoluciones y disputas posteriores a un pago ya registrado. No ejecuta reembolsos, movimientos de dinero, suspensión de licencias ni emisión fiscal. No altera migraciones62/63, precios, trial o datos de clientes. La aceptación real de Stripe, credenciales y entorno aislado sigue pendiente.

## Fuente y alcance

Nombre generado por CLI oficial: supabase/migrations/20261108134217_subscription_payment_incidents.sql, run42486198366; recibo en verification/subscription-incidents-cli-template-20261108.json. Se rellena exclusivamente esa candidata, sin aplicar DDL remoto.

Nuevo endpoint truckcontrol-stripe-incidents, provider-only, HMAC del cuerpo original antes de I/O. Reutiliza verifyStripeSignature y el lector de cuerpo del webhook fiscal. GET fijos a Stripe, respuestas limitadas, redirects rechazados y cuenta/modo contrastados con Account/Event canónicos. Eventos: charge.refunded, refund.created, refund.updated, refund.failed, charge.dispute.created, charge.dispute.updated, charge.dispute.closed.

Charge/PaymentIntent se contrastan con Refund/Dispute. La relación histórica mensual usa InvoicePayment filtrado por el PaymentIntent exacto, una sola relación completa, factura y suscripción canónicas; nunca subscription.latest_invoice, precio vigente ni metadata mutable. La RPC deriva el comprador/empresa/tarea de los recibos y tareas privados existentes. Un vínculo ausente o ambiguo devuelve error reintentable sin asignar tenant ni conceder acceso; no se inventan datos para pagos históricos sin evidencia.

## Registro y revisión

Un caso por tarea de pago; las observaciones y acciones son filas anexadas. Un evento repetido conserva la primera observación, aunque el estado actual de Stripe haya cambiado. Otro evento del mismo pago añade historial al mismo caso. No sumar charge.refunded y refund.created: el primero comunica acumulado, el segundo un objeto de devolución. Un refund pending/failed describe un importe solicitado/observado, no dinero entregado.

Revisión y rectificación sólo añaden declaraciones de un operador global con sesión viva, sin suplantar actores. CAS y UUID estable protegen concurrencia/replay. Un evento nuevo puede dejar pendiente otra valoración; nunca cambia paid_until, estado del cliente o facturas originales. Rectification pending significa valoración fiscal pendiente, no obligación legal determinada. Reported es una referencia humana de GDTaller, sin validar PDF, certificar TicketBAI ni afirmar entrega. Pueden declararse referencias externas distintas con nuevas operaciones; las anteriores permanecen inmutables.

## API administrativa v1

RPC public.tc_admin_subscription_incidents(p_action text,p_case_id uuid DEFAULT NULL,p_expected bigint DEFAULT NULL,p_operation_id uuid DEFAULT NULL,p_data jsonb DEFAULT '{}',p_after uuid DEFAULT NULL). Sólo administrador global fresco; RLS deny-all y ninguna lectura directa para clientes o service_role.

Todos los sobres llevan contract='subscription-financial-incidents-v1'.

- capabilities: available=true, refunds_available=false, license_changes_available=false, rectification_emission_available=false.
- list/detail: items CaseDTO[], next_cursor UUID|null. Listado de50 por id asc/p_after; detail usa p_case_id.
- history: p_case_id, p_data={before_version?:entero positivo}; items EntryDTO[], case_id, next_before_version entero|null. Últimas50 filas desc; cursor de la última fila si hay50.
- review: p_data={note}, nota recortada de3–1000 caracteres, sin caracteres de control.
- report_rectification: p_data={reference,note}, referencia recortada de1–200 caracteres, sin controles, única tras normalizar mayúsculas/espacios.
- Mutaciones: case_id+expected=row_version+operation_id UUID estable. Devuelven case, replayed y operation. El replay exacto compara actor, acción, datos y expected; no repite efectos. operation={id,action,expected_version,applied_version,actor_id,reported_at,note,reference:null|string}. applied_version=expected+1; case.row_version puede ser posterior en replay.

CaseDTO: id,task_id,buyer_company_id,buyer_company_name,provider_payment_id,provider_invoice_id nullable,period_start/end ISO nullable ambos,amount_cents,currency='EUR',paid_at ISO,row_version,review_state pending|reviewed,rectification_state pending|reported,latest_provider,last_review nullable,rectification nullable,created_at ISO. task_id enlaza la tarea original mediante tc_admin_manual_subscription_invoices detail.

ProviderDTO: event_id,event_type,object_id,object_type refund|dispute|charge,status_at_event,current_status,event_amount_cents,current_amount_cents,charge_amount_refunded_cents,extent none|partial|full|mismatch,event_created ISO,observed_at ISO,payment_intent_id,charge_id. Importes siempre enteros0–100000000; PI/charge no nulos. Los estados ASCII acotados se muestran como observaciones, sin inferir una conclusión fiscal.

OperatorDTO: note,actor_id,reported_at ISO,row_version. RectificationDTO añade reference. EntryDTO: id UUID,row_version,kind provider|review|rectification_report,actor_id nullable,created_at ISO,provider nullable,note nullable,reference nullable. Provider tiene actor null; review/rectification tienen actor real. No se almacena evidencia de tarjetas, secretos, cuerpos Stripe completos o datos personales de Dispute.evidence.

SQLSTATE:42501 acceso/no encontrado,22023 inválido,40001 versión obsoleta,23514 replay/referencia/vínculo contradictorio. PGRST202/42883 implica backend ausente: mostrar no disponible, no simular éxito.

## Replay de pago posterior a una devolución

Capability64 opcional, apagada por defecto. Tras HMAC y Account/Event canónicos, tc_manual_subscription_known_payment_event recompone el proof_sha256 original de63 usando recibo/tarea/pedido nativos. Sólo una igualdad exacta permite ACK de un evento ya aceptado sin volver a funded(), escribir licencias o crear otro aviso. Un evento nuevo sigue conciliación completa. Datos faltantes, recurso/cuenta/modo/digest contradictorios fallan cerrados. No se cambia el algoritmo ni los triggers originales.

## Configuración cerrada y límites de aceptación

TRUCKCONTROL_STRIPE_INCIDENTS_ENABLED=false y TRUCKCONTROL_STRIPE_INCIDENTS_SCHEMA_ACCEPTED=false por defecto. Claves backend STRIPE_SECRET_KEY y STRIPE_FINANCIAL_INCIDENTS_WEBHOOK_SECRET en Edge Function Secrets, nunca frontend/logs/GitHub. La misma cerca manualStripeRuntimeAllowed exige otro proyecto autorizado para test; no admite test contra producción ni localhost. El lookup de replay del endpoint fiscal se cablea únicamente cuando schema64 está aceptado.

No hay despliegue automático, servicio nuevo, correo, IA o StripeTax. Las pruebas usan proveedores simulados y PostgreSQL sintético; no equivalen a devolución real, aceptación de GDTaller, factura rectificativa certificada, hardware físico o credenciales de producción. La compatibilidad de InvoicePayment reverse lookup con la versión Basil fijada debe verificarse con la conexión sandbox autorizada antes de activación.
