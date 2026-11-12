# Renovación mensual real en Stripe sandbox

**17/17 comprobaciones correctas**, con la CLI oficial autorizada en el sandbox existente de ELEVADANCOR. [Recibo saneado](verification/stripe-renewal-sandbox-20261112.json). La persistencia se ejecutó en PGlite desechable; no hubo dinero real, cambios en producción ni emisión fiscal. No se declara aceptación comercial completa.

## Qué se comprobó

- Cuenta canónica `acct_1UWYX5ECykZtDl5d`, modo test, precio de prueba existente363EUR sin modificarlo.
- Suscripción sintética activa y primer `invoice.paid` firmado auténticamente por el transporte oficial.
- Reloj de prueba iniciado40días atrás y avanzado hasta dos días atrás, con dos horas adicionales para finalizar/cobrar la renovación. No se desactiva ninguna comprobación de fecha, firma o periodo.
- Una solicitud fiscal pendiente distinta por cada invoice/periodo, continuidad mensual y conservación de la primera fila inmutable.
- Distinción canónica entre `subscription_create` y `subscription_cycle`.
- Replay de ambos eventos, incluido el primero después de renovar: misma identidad, dos únicas tareas y ninguna regresión o extensión adicional del acceso local.
- Firma inválida rechazada antes de consultar al proveedor; cada replay válido mantiene las dos lecturas canónicas de cuenta/evento exigidas por la política.
- Cancelación de esa suscripción en Stripe y eliminación del reloj y sus objetos sintéticos propios.

Los dos webhooks reales devolvieron200. Se reutilizan el handler y los adaptadores productivos `persistManualStripePayment` y `lookupKnownStripePayment`; la respuesta JSON de una RPC no se trata como un booleano. Los fixtures Auth de este ensayo son los existentes de PGlite: la prueba con GoTrue/SMTP/Storage reales es la [recuperación aislada67/67](LOCAL_SERVICE_RECOVERY.md), independiente.

## Barreras y ejecución

El ejecutor `scripts/verify-stripe-sandbox-renewal.mjs` requiere Linux, Node24 con transformación TypeScript, CLI oficial y opt-in explícito `TRUCKCONTROL_STRIPE_RENEWAL_ACCEPTANCE=synthetic-sandbox-only`. La ruta absoluta del binario se pasa mediante `TRUCKCONTROL_STRIPE_CLI`. Estos requisitos son del laboratorio de mantenimiento, no de los clientes Android/Windows.

Las seis pruebas de `tests/stripe-qa-guards.test.ts` comprueban cuenta/mode/autorización, rutas API y argumentos, rechazo de overrides live/perfil/credenciales y limpieza del entorno hijo. Las variables `STRIPE_*` y credenciales de otros proveedores no se transfieren a la CLI; se conservan proxy y CA aprobados. Se vuelve a consultar la identidad antes de cada mutación. No se lee ni exporta el token de OAuth de la CLI como clave de backend.

El listener solo recibe en127.0.0.1, ignora tráfico ajeno al cliente sintético y conserva firma/cuerpo únicamente en RAM. Su grupo de procesos es propio y se cierra al terminar. Solo se publican IDs técnicos sintéticos, estados, contadores y hashes; nunca firmas, enlaces de checkout, secretos o respuestas crudas. El cliente se crea sin email, sin envíos externos.

La limpieza comprueba ID, modo test y nombre único antes de eliminar el reloj propio. No toca suscripciones existentes, precios, canales de producción o datos de clientes. Los objetos Stripe de este ensayo ya no están activos y no deben recrearse para presentar esta evidencia como una compra real.

No existe un cron de este ensayo ni se ejecutan llamadas Stripe en CI: el CI automático prueba sus barreras locales. El consumo IA y las cuotas10USD/mes–100llamadas/empresa se conservan. Gasto y compromiso nuevos0EUR; saldo histórico del límite200EUR aún sin conciliar.

## Dependencias que siguen abiertas

Este ensayo no completa Checkout en navegador, una clave/receptor productivo, fallos de pago y suspensión comercial, ni una factura TicketBAI válida o su entrega. Las tareas del laboratorio permanecen `awaiting_issue`, sin inventar referencias fiscales. Mantener todos los controles comerciales cerrados hasta la aceptación independiente del circuito fiscal, pagos y revisión jurídica.

Producción40/app0.5.22-rc.1, demo6,65migraciones y frontend/backend existentes no cambian. Este código de mantenimiento no requiere publicar otro bundle web.

Referencias oficiales consultadas con `stripe docs`: [pruebas de Billing](https://docs.stripe.com/billing/testing) y [uso avanzado de relojes](https://docs.stripe.com/billing/testing/test-clocks/api-advanced-usage).
