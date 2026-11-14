# Recuperar el Checkout reservado después de 24 horas

Una solicitud creada en T0 podía abrir Checkout en T+23 h y reservarlo durante
23 horas más. Al volver en T+25 h, el proveedor aún conservaba una sesión válida
durante 21 horas, pero la antigüedad de la solicitud impedía recuperarla.

La migración aditiva `subscription_reserved_quote_recovery` mantiene la vigencia
de un día para crear cualquier Checkout nuevo. Solo admite la recuperación de
la reserva que ya existe, está guardada y no ha caducado: mismo usuario,
solicitud, condiciones e identificador `cs_` en ambas filas; solicitud en estado
`checkout`. Conserva los controles de cuenta, cobros, plan publicado y revisión.
El backend sigue recuperando y comprobando la sesión canónica de Stripe.

Una reserva sin resultado confirmado no permite crear otra suscripción. Una
reserva caducada conserva el bloqueo hasta la confirmación del proveedor. La
limpieza de una suscripción cerrada no puede reutilizar una copia antigua de
la fila para superar el control de antigüedad.

Se conservan el orden de bloqueos, el OID, propietario, ACL de servidor y
`SECURITY INVOKER` con `search_path` vacío. Las ramas de estado, gestión,
guardado, expiración y eventos/CAS permanecen idénticas. La migración rechaza
una revisión previa de la función distinta de la ya comprobada en producción.

La reproducción fallaba antes del cambio. Pasan 156 pruebas específicas de
siete archivos, incluidas 32 nuevas; el mismo contrato SQL de 27 comprobaciones
se ejecuta en PGlite y en PostgreSQL aislado. Se añaden tres contenciones reales:
recuperaciones simultáneas y las dos ordenaciones de recuperación/expiración.
Se conservan todos los controles y restauraciones anteriores.

La aplicación remota exige primero CI y PostgreSQL reales satisfactorios,
revisión del historial y la herramienta oficial de Supabase. El respaldo
contiene solo la definición anterior de la función; nunca se vuelve a ejecutar
la migración 68 ni sus `ALTER TABLE`. El rollback de DDL, filas y permisos se
comprueba en una transacción aislada.

No activa cobros, licencias, facturas ni servicios. No requiere otra publicación
del frontend Sites44, modificar la demo ni repetir aceptaciones de IA o Stripe.
