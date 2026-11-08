# Puente Stripe → facturación manual: candidato sin activar

Esta rama prepara un endpoint de proveedor y una única operación transaccional de backend. No se ha desplegado ni habilitado; no inicia cargos, no emite TicketBAI y no envía correos.

## Contrato

El adaptador verifica HMAC del cuerpo original antes de acceder a Stripe, recupera cuenta/evento/objetos canónicos y pasa una prueba mínima a `tc_manual_subscription_apply_payment(p_kind,p_account,p_data)`. Esa única RPC valida rol servidor, canal autorizado y modo, propietario/pedido/Checkout o suscripción, céntimos y período. Dentro de la misma transacción registra el pago mediante las funciones de billing existentes, crea la solicitud fiscal privada y añade un recibo anexable. Si cualquiera falla se revierte todo; se responde 2xx solo después de persistir. Un reenvío del mismo PI no vuelve a extender la licencia.

Primera mensualidad y renovaciones usan siempre invoice_id; el flujo one-off no admite pedidos con reserva/suscripción mensual. La empresa se deriva del propietario nativo único, nunca se inventa desde el navegador. La correlación original de factura se contrasta con su snapshot Stripe, y la revisión fiscal de comprador del PR60 permanece separada.

## Activación cerrada

La Edge Function nueva necesita dos switches explícitos, `TRUCKCONTROL_MANUAL_STRIPE_PIPELINE_ENABLED` y `TRUCKCONTROL_MANUAL_STRIPE_SCHEMA_ACCEPTED`; ambos quedan apagados por defecto. Mantiene las credenciales solo en backend, sin exponer claves ni aceptar JWT del cliente como autoridad de webhook. No hay GRANT RPC a anon/authenticated.

La propuesta SQL está en `docs/verification/manual-stripe-bridge.proposal.sql`: **no es una migración y no se aplica remotamente**. Después de revisión y pruebas aisladas debe incorporarse con CLI a una migración nueva; no copiarla a producción ni editar migraciones aplicadas. El canal privado parte ausente/desactivado y no se puede habilitar con service_role. Solo una base aislada puede habilitar test expresamente. Live requiere aceptación comercial/fiscal registrada; ningún switch equivale a esa aceptación. No se modifica el guard nativo fiscal ni payments_enabled.

## Pruebas y límites

Pruebas del adaptador y PGlite aislado: autorización, modo, firma, correlación, reserva, transacción única, fallo tras billing, deduplicación, períodos independientes y recibos inmutables. Simulaciones no equivalen a Stripe real. No hay consumo IA ni llamadas reales al proveedor.

Reembolsos, disputas y rectificativas posteriores requieren un flujo separado de identidad proveedor, conciliación y revisión humana; nunca se falsifica un actor administrativo, una factura rectificativa o una entrega. El helper rechaza ingestas cuyos cobros ya estén devueltos/disputados. Cambios de precio, prorrateos, pagos repartidos y discrepancias históricas requieren revisión.

Antes de publicar el endpoint: probar la migración final del PR60 y esta propuesta juntas, verificar permisos reales, RLS y aislamiento, conectar Stripe oficial en sandbox, demostrar pago→solicitud→emisión GDTaller→entrega con el operador autorizado y obtener aceptación fiscal/comercial. Conservar producción32/v31/demo6 y los límites existentes.

La futura publicación oficial deberá declarar verify_jwt=false exclusivamente para este webhook de proveedor; su seguridad depende de HMAC y conciliación, no de una sesión de navegador. No hay despliegue automático de esta carpeta en esta entrega.
