# Revisión privada de incidencias anteriores a la tarea de pago

SQL aplicado una vez por el canal oficial Supabase el13/11/2026 UTC,
versión `20261113233311`, sin cambios de bytes respecto al candidato
`20261113233311_subscription_unlinked_incident_review.sql` (CLI Supabase3.0.0).
No activa cobros, canales, avisos ni llamadas a proveedores ni acredita Stripe LIVE. Las migraciones y recibos históricos no se editan.

## Problema y alcance

Una devolución o disputa puede llegar antes de que termine la transacción del
pago. Si el cobro ya aparece devuelto/disputado, la conciliación de pago conserva
su rechazo; sin tarea y recibo, el registro financiero anterior no podía enlazar
la incidencia. La candidata retiene un trabajo de revisión visible sin conceder
licencia, inventar un pago registrado, una tarea fiscal, una factura o una entrega.

La cola solo admite una compra propia que ya tenga un pedido y Checkout nativos
guardados. Firma del cuerpo, cuenta esperada, modo, Event, Refund/Dispute,
Charge, PaymentIntent y relación histórica InvoicePayment se contrastan mediante
GET canónicos. Solo el error exacto `subscription_incident_mapping_review` del
registro anterior permite intentar la nueva vía. Cualquier otra contradicción
conserva su error sin crear una fila de revisión.

## Prueba de pertenencia

Después de solicitarla el backend, el worker consulta una única página de
`GET /v1/checkout/sessions`, filtrada por el PaymentIntent exacto o por la
suscripción canónica y con `limit=2`. Exige `object=list`, `has_more=false` y un
único Checkout completo. No recorre otras páginas ni elige entre compras
ambiguas. Mantiene TLS, GET, origen fijo, rechazo de redirecciones, máximo512KiB
por respuesta y un plazo compartido de25segundos para las lecturas del handler.

El Checkout debe concordar en modo, cliente Stripe, moneda e identidad de pago
o suscripción; sus metadatos de usuario/pedido solo son una pista hasta que SQL
comprueba el pedido nativo guardado, Checkout exacto, propietario único de la
empresa y cotización EUR. Para mensualidades se contrasta también el snapshot
de metadatos de la factura histórica y la reserva/suscripción nativa. No se usa
`latest_invoice`, el precio actual ni un tenant aportado por el navegador.
Compras desconocidas, ajenas, sin identidad propia o ambiguas quedan sin ACK y
sin filas. Un cambio posterior de metadatos no reescribe la evidencia aceptada.

Filtros confirmados con la documentación oficial actual mediante Stripe
CLI1.55.8 el13/11/2026: [List all Checkout Sessions](https://docs.stripe.com/api/checkout/sessions/list).
`payment_intent` y `subscription` son filtros string; `limit` admite1–100. Solo
se consultó documentación pública, sin claves, datos de cuenta o pagos reales.
El runtime conserva la versión Stripe Basil existente. Fixtures no acreditan
aceptación del proveedor para esa versión.

## Persistencia y ACK

`tc_subscription_incident_ingest` es exclusivamente `service_role`. Primero
intenta el registro financiero existente. Si necesita pertenencia, devuelve
`recorded=false,ownership_required=true`; esto nunca produce un2xx HTTP. Tras
verificar el Checkout, una segunda llamada bloquea cliente→pedido y vuelve a
comprobar la tarea: si se acaba de confirmar, registra únicamente su incidencia;
si falta, crea caso y observación privada en una sola transacción.

Dos tablas privadas con RLS restrictivo deny-all, sin DML directo para clientes
o `service_role`, guardan IDs nativos/proveedor, importe EUR, razón fija
`payment_task_missing` y una proyección acotada del evento. No guardan cuerpos
Stripe, evidencia de tarjeta, nombres, NIF, domicilios, correo, datos del cliente
Stripe ni metadatos completos. Casos y entradas rechazan UPDATE/DELETE/TRUNCATE.
IDs de evento y operación son únicos; el digest de repetición usa hechos
inmutables del evento, no el estado actual obtenido en un GET posterior.
Solo `recorded=true` después de persistir permite el ACK. Un fallo revierte caso,
recibo y auditoría juntos y devuelve503 sin mensajes privados.

El INSERT de un recibo real, desde `service_role`, también intenta anexar el
vínculo mediante un trigger privado, aunque el ACK de cuarentena ya haya detenido
los reintentos del incidente. Solo enlaza un caso único que concuerde con la
cuenta/modo, pedido, comprador/empresa, Checkout, importe EUR e identidad y período
de la tarea real. La entrada refiere tarea, recibo y evento canónico encolado.
Si hay ambigüedad o discrepancia no enlaza ni bloquea el recibo real: conserva la
revisión pendiente. Inserciones SQL privilegiadas de fixtures históricos no
confieren autoridad de enlace; el helper no es ejecutable directamente.

Los recibos63 guardan invoice_id para mensualidades y PI para pago único; no se
inventan columnas PI/charge ausentes del recibo. Su relación histórica verificada
con InvoicePayment procede de la evidencia canónica congelada en la cuarentena.
El enlace es administrativo, no una nueva prueba de liquidación ni decisión de
licencia. También puede reconciliarlo un incidente canónico posterior.

El enlace añade una entrada `linked` y reabre la revisión mediante una nueva
versión. No llama al bridge de pagos ni crea tareas. Las observaciones y
declaraciones anteriores permanecen intactas.

## Administración y significado de estados

Contrato separado `subscription-unlinked-incidents-v1` mediante
`tc_admin_subscription_unlinked`: capabilities/list/detail/history/review/dismiss.
Todas las acciones, incluidas lecturas y replay, comprueban administrador global
real, usuario/correo verificados y SID vigente, de nuevo tras esperar un bloqueo.
Los clientes de ambas empresas quedan denegados aunque falsifiquen metadatos.
Listado e historial usan páginas de50 y cursores propios.

`review_state=pending|reviewed|dismissed` describe declaraciones administrativas.
`link_state=unlinked|linked_to_existing_payment` describe un vínculo nativo
comprobado y se mantiene independiente. Revisar o descartar requiere motivo,
referencia de evidencia, confirmación explícita, UUID estable, actor real y CAS;
no resuelve el pago, la licencia, una devolución ni obligaciones fiscales.
Un evento o vínculo posterior puede dejar pendiente otra revisión. Las acciones
son filas anexadas, nunca borran observaciones ni anotaciones previas.

Administración→Incidencias de pagos incluye la nueva cola. El cliente/UI usa el
JWT verificado y fijado, conserva operaciones inciertas solo en RAM, reintenta
expresamente el mismo UUID, descarta resultados tras revocación/cambio de sesión
y limpia datos al salir o desconectar. Backend ausente/denegado no se presenta
como cola vacía. No se guarda el registro para uso offline.

## Configuración y validación

`TRUCKCONTROL_STRIPE_UNLINKED_REVIEW_SCHEMA_ACCEPTED` parte ausente/false. Sin
aceptación separada se conserva íntegra la vía anterior. También se mantienen
los switches de incidencias y la cerca nativa de cuenta/proyecto/modo existentes.
No hay soporte de early-fraud-warning en esta candidata.

Pruebas nuevas: SQL migrado en PGlite con pedidos propios aún sin pagar,
devolución/disputa antes del commit, replays/conflictos, pertenencia ajena o
ambigua, fallo atómico, vínculo posterior real, CAS, denegación tenant y
revocación de rol/SID; runtime firmado con transporte ficticio; cliente que
descarta respuestas tardías y contrasta el ACK; navegador Windows/Android
emulados para declaración, ACK perdido y revocación. No equivalen a Stripe real,
emisión TicketBAI, entrega, aceptación nativa remota ni hardware físico.

Los casos PGlite de esta cola prueban replay/CAS secuenciales. El arnés aislado
PostgreSQL17 incorpora `tests/postgres/unlinked_contracts.py` antes de la
recuperación lógica: doble ingesta de la misma incidencia, replay de una misma
operación Root, proveedor contra CAS de revisión y pago contra cuarentena en
ambos órdenes, con dos conexiones y contención real. Cuarentena primero exige
un único enlace al recibo auténtico sin otra ingesta; pago primero utiliza el
ledger financiero y no crea una fila artificial de cuarentena. Las incidencias,
declaraciones y replays deben conservar el acceso y trabajo fiscal autorizados.
El ensayo de estas nuevas carreras queda pendiente del CI del head integrado;
una validación PGlite secuencial no lo sustituye.
