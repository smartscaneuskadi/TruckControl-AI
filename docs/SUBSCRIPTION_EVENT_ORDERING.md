# Orden de eventos del ciclo de suscripción

Propuesta local de 13/11/2026; no aplicada ni desplegada. La migración aditiva `20261113065440_subscription_snapshot_ordering.sql` fue creada con Supabase CLI oficial 3.0.0. Conserva las migraciones aplicadas y la identidad, permisos y modo invoker del RPC existente.

Stripe `event.created` tiene resolución de segundos. Dos eventos distintos del mismo segundo no prueban el orden de cancelación o reanudación; el ID del evento tampoco es una versión del estado.

Para eventos de ciclo no pagados, el servidor obtiene `snapshot_revision` mediante `observe` antes de leer la suscripción canónica. El RPC comprueba la revisión y la relación usuario/solicitud/cliente bajo los bloqueos existentes. Si otro escritor avanzó la revisión, no guarda el estado ni el recibo: el handler repite observación y GET, hasta tres intentos. Si no converge, responde 503 para permitir la repetición del webhook. Una lectura canónica vigente puede aceptar cancelación o reanudación en el mismo segundo; nunca reduce el máximo `event_created` registrado.

El bridge fiscal aplicado continúa confirmando cada mensualidad en su transacción. Si aporta un estado distinto con el mismo segundo y sin revisión, se conserva el estado guardado y se marca `reconciliation_required=true`; la factura pagada y su acceso independiente pueden confirmarse. El estado del RPC expone esta marca. Una lectura canónica posterior con revisión vigente la elimina. No se crea un scheduler ni se considera resuelta una marca pendiente por recibir un duplicado.

El ciclo de suscripción por sí solo no concede acceso ni crea factura fiscal. La cancelación sigue disponible con ventas desactivadas. No se alteran precios, licencias, cuotas, flags comerciales ni registros históricos.

La prueba local cubre actualización con datos existentes y conservación de OID/ACL, eventos anteriores/posteriores/del mismo segundo, cancelación y reanudación solapadas, duplicados y propiedad, mensualidad pagada ambigua, errores y límite de reintentos. Usa PostgreSQL PGlite y transportes ficticios; no acredita concurrencia de conexiones PostgreSQL independientes ni aceptación real de Stripe. Para una futura publicación, revisar y aplicar primero la migración autorizada, y después publicar el handler compatible.
