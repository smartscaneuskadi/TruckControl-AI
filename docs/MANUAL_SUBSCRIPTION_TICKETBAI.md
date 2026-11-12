## Confirmación del titular · 12 de noviembre de 2026

ELEVADANCOR S.L. confirma que ha comprobado el circuito manual de suscripciones consultado: Administración emite en GDTaller con TicketBAI y el cliente recibe la factura en PDF en 24–48 horas tras el pago. La confirmación procede del titular. La API de GDTaller no es necesaria para esta operativa.

La cuenta Stripe de producción de ELEVADANCOR admite cargos y transferencias. En la consulta del 12 de noviembre no había receptores de webhook ni destinos de eventos registrados en esa cuenta. En el proyecto Supabase de TruckControl el registro está abierto y hay cero canales de pago activos. Quedan por conectar la notificación de Stripe con la licencia y la tarea de facturación y por verificar el recorrido completo desde el pago de un cliente.

# Release 1.0 — Facturación manual asistida de suscripciones (decisión 07/11/2026)

## Estado nativo verificado · 8 de noviembre de 2026

Esta actualización prevalece sobre el histórico inferior. PR42 y PR60 están integrados; main4d6b09ee806ca92a90da620fb9d47123b6398bc5 conserva el candidato0.5.21-rc.1. **La web pública sigue v32/0.5.20-rc.1**, con v31 y demo6 recuperables; no confundir main con publicación.

**Supabase tiene62 migraciones.** La local20261108013000 corresponde a la remota20261108101437_manual_subscription_invoice_intake, Gitblob7504aca678710771ce550430cab5ab2b5f76068a y SHA2567323ded662cf8ec4560662a86c9224d21eb3d45ad4689caa919cf2638672da7b. Está APLICADA, su fuente coincide byte a byte y no debe editarse ni repetirse. La61 de proveedores/viajes20261108081848 permanece intacta. El contrato fiscal exacto pasó en Supabase y dejó cero usuarios, sesiones, operadores, pedidos, tareas, eventos, acciones, suscripciones y facturas sintéticos tras rollback; no hubo llamadas a proveedores ni correo. Se verifican permisos frescos, snapshot validado por operador, CAS/auditoría inmutable y mensualidades independientes. Es CAS de escritor obsoleto, sin prueba de carga concurrente nativa.

Head033b94f pasa ambos CI42469487926/42469491382: **1.292 controles** por ejecución (941unitarias/SQL en94archivos,45Python,72demo,50empresa,144SaaS,14candidata,20producción,6públicas), originales64/11hashes. Asesor sin hallazgos nuevos; permanecen dos INFO administrativos deny-all y el WARN previo de contraseñas filtradas que requiere plan de pago.

**Cobros y guard fiscal continúan apagados.** Los ocho perfiles IA de v32 conservan su aceptación; no repetir sus llamadas. La decisión GDTaller/TicketBAI es manual. El panel fiscal y conciliador están en código; PDF privado, bridge transaccional y avisos se preparan en PR66/67 y ramas independientes, con flags cerrados y sin declarar conexiones activas. Falta aceptación real Stripe/fiscal, Google público/Gmail empresarial, restore gestionado, hardware físico y revisión jurídica.

El ejecutor local sigue fallando; se trabaja por GitHub/CI/MCP. CLI oficial3.0.0 verificado por SRI ejecutó migration new en Actions42469793645 y generó la plantilla local20261108100352_manual_subscription_payment_and_documents.sql. **No es una63 aplicada**; integrar propuestas y probar antes de cualquier DDL. No crear proyectos duplicados, no tocar FIXPilot ni trasladar secretos a GitHub.

Presupuesto agregado200EUR, sin nuevas compras o llamadasIA; gasto histórico y saldo real no conciliados. LímiteIA10USD/mes y cuota100/empresa preservados. Existe una automatización horaria actualizada; no duplicarla ni afirmar ejecución continua. Recibo: docs/verification/manual-fiscal-native-20261108.json; inventario62: docs/deployment/remote-migrations-20261108-manual-fiscal.json. Evidencia durable en issue3 comentario6720303851 e issue41 comentario6720304629.

## Candidato fiscal integrado · 08/11/2026

Esta sección prevalece sobre los avances históricos inferiores. La migración de PR60 sigue SIN APLICAR. El proyecto remoto tiene61 migraciones; la ampliación de proveedores/viajes de PR42 está aplicada y no debe repetirse.

El candidato añade validación y corrección fiscal explícita por administrador global con referencia de evidencia. El snapshot original de perfil permanece inmutable; no se presenta como consentimiento fiscal del checkout. No se permite registrar emisión sin validación del comprador y evidencia de PDF verificada por servidor.

Las transiciones son filas anexadas con bloqueo de tarea, versión esperada, UUID de operación, actor actual y auditoría inmutable. La autorización toma bloqueos compartidos de usuario/rol/sesión y se revalida tras esperar la tarea. Un replay exacto no duplica efectos; cambiar actor, datos, versión o tarea lo rechaza. Una incidencia posterior al envío puede pasar a needs_review conservando factura y declaración anteriores; no implica anular o rectificar el documento fiscal.

Cada factura de suscripción, incluida la primera mensualidad, tiene identidad canónica in_ y período propio. La unicidad por pedido se limita al pago único; no se mezclan identidades de pago único y suscripción. La tabla nativa de facturas, pedido, usuario, empresa, plan, importe, moneda y períodos deben concordar. Dos mensualidades del mismo pedido son tareas independientes; reenvíos de la misma factura no lo son.

El panel Facturas del servicio permite consultar, validar/corregir comprador y registrar incidencias. Las subidas y emisión permanecen bloqueadas con document_upload_ready=false: el candidato aún no trae worker de documentos ni envío de correo. sent_reported es declaración humana, no entrega confirmada.

Se incorpora el conciliador Stripe de solo lectura, firmado y contrastado con objetos canónicos, cuenta, modo, metadatos e identidad mensual; sus34 pruebas específicas pasan en su rama. Todavía no está conectado al webhook/DB/outbox de producción. Se conserva el guard fiscal false, cobros apagados y aceptación real pendiente.

El contrato docs/verification/manual-fiscal-rollback.sql se ensaya exactamente desde PGlite con todas las migraciones antes de cualquier aplicación nativa. Los checks del head compuesto del PR60 son la fuente de su resultado; no reutilizar el verde de una revisión anterior. Ni ese ensayo ni una compilación equivalen a Stripe real, TicketBAI emitido, recuperación gestionada o hardware físico. Sin nuevos consumos IA, correos reales, compras ni cambios a FIXPilot.

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


### Cierre adicional frente a mutaciones privilegiadas — candidato 08/11

Las tablas privadas de **tareas y eventos de ingesta** son ahora deliberadamente **solo anexables** durante esta etapa: triggers PostgreSQL rechazan `UPDATE`, `DELETE` y `TRUNCATE`, incluso si quien escribe es propietario de tabla o usa una cuenta con acceso privilegiado. El RLS y los `REVOKE` de clientes, por sí solos, **no impiden** que un adaptador servidor con permisos elevados altere un evento después de ingerirlo. Prueba PGlite sobre ambas tablas comprueba que la evidencia previa no cambia tras esos tres intentos.

**Limitación:** esto congela también las transiciones futuras del estado `awaiting_issue`, intencionadamente, hasta revisar una nueva migración de CAS con operadores autorizados y auditoría inmutable. La futura operación manual de TicketBAI, alertas, PDF privado y confirmación de envío **no existe aún**. No desactivar los triggers para hacer funcionar una pantalla, ni ejecutar `TRUNCATE` para corregir incidencias de factura; exigir una implementación transaccional revisada y pruebas de retención/rectificación. El acceso de administrador de base de datos al DDL sigue siendo una capacidad separada: este control no equivale a un registro criptográficamente inviolable.

### Defensa de eventos globales — candidato 08/11

Además del vínculo compuesto entre evento y cuenta Stripe, la migración candidata exige unicidad **global** de `provider_event_id`. Por política **fail-closed** de esta cola, un identificador `evt_...` registrado en una cuenta no puede volver a ingresarse en otra, ni por una función SQL privilegiada; cualquier posible colisión o intento legítimo debe revisarse manualmente, sin presumir aquí garantías de unicidad global del proveedor. La prueba local `tests/manual-subscription-intake-security.test.ts` cubre dos compras válidas en cuentas diferentes, el rechazo de reutilización entre cuentas y la conservación del evento original; esto **no demuestra** que exista un webhook firmado, conciliación con Stripe o pago real. Cualquier conflicto debe investigarse sin generar una segunda factura fiscal. La migración permanece únicamente en GitHub, sin aplicar a las 60 migraciones remotas.


### Snapshot fiscal previo a emisión — candidato 08/11 (sin despliegue)

La tarea de ingesta pendiente conserva **en columnas privadas e inmutables** los datos de comprador (empresa, NIF, dirección y email), el plan y su revisión, la base imponible, el tipo y la cuota de IVA **del pedido concreto**, además del total y evento de pago. El total debe coincidir con base+IVA y con la cotización registrada; **nunca** recalcular impuestos a partir del precio vigente en el catálogo. Los pedidos antiguos que conservan `net_cents/vat_rate_bps/vat_cents = NULL` se rechazan con `manual_invoice_tax_quote_missing`: revisión fiscal humana, sin crear una tarea inventada.

El snapshot se obtiene **en el instante de ingesta técnica**, no necesariamente en el instante de compra. El operador debe comprobar que la identidad fiscal, el país/régimen, las fechas y el destinatario eran correctos en el momento exigido por la norma, especialmente en webhooks retrasados. Cambios posteriores del perfil no reescriben la solicitud ni alteran un reintento idempotente; discrepancias de cuota/revisión sí se bloquean. La prueba PGlite verifica congelación y rechazo de cuotas fiscales desconocidas. No se ha enviado a GDTaller ni generado un documento válido.

### Procedencia fiscal explícita — candidato sin desplegar (08/11/2026)

La ingesta guarda en la fila fiscal privada `buyer_snapshot_origin='profile_at_intake'`, la fecha del pedido, la última fecha de modificación del perfil y un indicador `buyer_profile_changed_after_request`. El indicador se calcula con marcas temporales del servidor, se congela con el resto del registro y avisa al futuro operador cuando el perfil se actualizó después de crear el pedido. **Un indicador falso no acredita que los datos se aceptaran en el checkout**, ni el nombre, NIF, domicilio, régimen de IVA o destinatario correcto; el operador debe comprobar el soporte fiscal original antes de emitir en GDTaller. Un indicador verdadero requiere investigación adicional, sin reconstruir silenciosamente la factura desde el perfil actual. Esta mejora es trazabilidad, no autorización ni servicio fiscal funcional.

Prueba PGlite sintética en `tests/manual-subscription-intake-security.test.ts`: compra antigua seguida de cambio de empresa/NIF antes de la ingesta, procedencia marcada, estado todavía `awaiting_issue` y rechazo de cambio privilegiado del indicador. Sin webhook firmado, CAS de operador, PDF, Gmail real ni migración remota; conservar el guard de cobros cerrado.


### Integridad adicional en INSERT privilegiado (08/11/2026; solo candidato)

El trigger `tc_manual_subscription_guard_task_insert` valida también las escrituras
directas en la tabla de tareas (por ejemplo, si un futuro adaptador usa service role
sin la función de ingesta): pedido, usuario comprador, titular de la organización,
estado interno `paid`, plan/revisión, importe, desglose IVA y procedencia de los
datos fiscales deben coincidir en las fuentes privadas actuales. Rechaza una
tarea que vincule pedido/empresa ajena o cifras fiscalmente coherentes pero
**diferentes del presupuesto original**. Los tests PGlite cubren ambas variantes
y verifican que los eventos originales quedan conservados.

Es defensa de integridad interna: el estado `paid` **NO** equivale a un pago
conciliado con Stripe, ni valida los datos aceptados al checkout. No implica
autorización fiscal, recepción de correo, emisión TicketBAI ni despliegue.

**Desviación de inventario remoto verificada en lectura de Supabase:**
el 08/11/2026 el proyecto `truckcontrol-ai/kkkemaycedexymrpaqtp` reporta
**61 migraciones**, última `20261108081848_company_suppliers_and_trip_allocations`
(frente al checkpoint anterior de 60); la tabla candidata
`private.tc_manual_subscription_invoice_tasks` continúa ausente,
`payments_enabled=false` y no existen solicitudes `paid`. La fuente
de esta nueva migración podría estar relacionada con trabajo paralelo en PR #42,
pero no debe darse por integrada al repositorio principal: reconciliar el
inventario y dependencias antes de preparar cualquier migración o despliegue.
No ejecutar `supabase db push` ni revertir la migración nueva a ciegas.
