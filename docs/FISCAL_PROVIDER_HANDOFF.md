# Release 1.0 — contrato previo de conciliación fiscal (no conectado)

**Estado 07/11/2026: preparación de código y pruebas sintéticas, NO emisión ni entrega real.**
El emisor comercial de suscripciones es ELEVADANCOR S.L. (según
`docs/SUBSCRIPTION_INVOICING.md`); no confundirlo con los clientes que
gestionan sus propias facturas. Falta confirmar con el titular y su asesoría
el programa fiscal real, territorio/régimen, serie, certificación y acceso
oficial al proveedor. No se ha contratado ninguno.

## Trabajo independiente ya posible

`src/domain/fiscal-issuer-reconciliation.ts` prepara, sin red ni base de
datos, transiciones puras para un **único intento por solicitud aprobada**:
`ready → submitted → issued → delivered`. Un timeout de envío lleva a
`unresolved`, desde donde **no se puede reemitir automáticamente**.
Requiere consulta al proveedor (conciliación) o revisión manual. Una
confirmación repetida debe coincidir con la referencia de la operación y
la numeración fiscal anterior; una segunda factura distinta se rechaza.
La entrega tiene una referencia de recepción separada. Nunca se infiere
entrega de un pago Stripe, redirección del navegador o estado de checkout.

El contrato no llama al proveedor ni almacena datos personales, certificados,
PDF, credenciales o números fiscales inventados. Los tests de
`tests/fiscal-issuer-reconciliation.test.ts` usan exclusivamente fixtures
locales: **no son aceptación del proveedor** ni se ejecuta emisión real.

## Antes de integrar el adaptador nativo

1. Confirmar por escrito sistema real de facturación del emisor, territorio
   y régimen, formato/serie, numeración, IVA, certificados y obligaciones de
   firma y remisión con asesoría competente; verificar API y condiciones
   oficiales en vez de suponer compatibilidad TicketBAI/VERI*FACTU.
2. Obtener acceso legítimo a entorno de pruebas del proveedor con cuenta
   autorizada. Nunca guardar certificados, secretos o datos de personas
   en GitHub, logs de CI ni archivos de prueba públicos.
3. Implementar la creación de factura a partir de pedido aprobado e
   importes exactos en céntimos, identificación del comprador, factura PDF
   privada, registro contable y auditoría por empresa. La numeración
   corresponde al emisor real, no al frontend.
4. Persistir el estado con restricción única por solicitud, transacción
   atómica y cambio condicional (**compare-and-swap**) *antes* de llamar al
   emisor. El contrato puro por sí solo NO resuelve concurrencia entre
   workers. Reconciliar IDs de proveedor tras timeout sin reintentar
   a ciegas, incluyendo reinicio del proceso y webhook duplicado.
5. Verificar aceptación real controlada: emisión y remisión si procede,
   firma y número fiscal, importes/IVA, entrega al comprador, acceso privado
   y revocación, idempotencia tras caída y repetición, manejo de rechazo,
   rectificativa, conciliación con pago y auditoría. Usar datos ficticios y
   conservar evidencia privada con autorización. La firma del titular o
   asesoría no puede ser sustituida por fixtures.
6. Pasar seguridad RLS de dos empresas, política de retención y revisión
   jurídica. Solo tras la aceptación fiscal nativa y el consentimiento
   comercial explícito considerar conectar un checkout; verificar la
   configuración de cobros y su presupuesto por separado.

**Control que NO se cambia:** `nativeSubscriptionFiscalIssuerAvailable()`
en `supabase/functions/_shared/subscription-fiscal-gate.ts` continúa
devolviendo `false`. Ninguna transición del contrato nuevo habilita
Stripe, suscripciones, productos, facturas, permisos o correo. Webhooks de
operaciones anteriores y cancelaciones conservan sus contratos actuales.

**Otros bloqueos de Release 1.0:** Google pública pendiente de revisión
y consentimiento real de buzón empresarial; restauración gestionada real
en entorno aislado; aceptación en Android/Windows **físicos**; revisión
legal externa. Las emulaciones y preflights offline no suplen esos pasos.

**Cambios deliberadamente excluidos:** despliegues; datos y RLS; producción
v32, respaldo v31, demo v6; las 60 migraciones remotas; cuotas IA;
llamadas a Google, IA o Stripe; compra de proveedores; FIXPilot.

**Coste directo de esta contribución: 0 EUR.** El coste real de terceros
no consultado no debe inferirse de esta cifra. Techo adicional 200 EUR,
sin nuevas suscripciones ni cambios de cuotas autorizados.
