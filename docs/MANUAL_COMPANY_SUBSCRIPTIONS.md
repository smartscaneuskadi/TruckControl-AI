# Suscripciones manuales por empresa

Publicada y verificada el 15/11/2026 en https://truckcontrolai.com, Sites46 / 0.5.28-rc.1. [Recibo de publicación](verification/company-manual-full-published46-20261115.json).

El superadministrador administra el Pack FULL de cada empresa desde **Superadministrador → Empresas**. Puede activarlo, desactivarlo y establecer un vencimiento opcional. Los estados son **Activo**, **Desactivado** y **Vencido**. Una empresa sin decisión manual conserva su plan o prueba anteriores; no recibe FULL automáticamente.

La decisión pertenece a la empresa, no a la cuenta de su propietario. Activar una empresa no activa las demás. Solo el superadministrador con una sesión verificada puede cambiarla. Cada modificación guarda operador, fecha, estado anterior y posterior en un historial inmutable. Las operaciones utilizan revisión e identidad únicas para controlar concurrencia y reintentos.

FULL habilita el plan comercial completo, conservando roles, permisos de usuario, bloqueos de seguridad, controles globales de servicios, consentimiento de correo e IA y sus límites de consumo. No conecta un proveedor ni autoriza consumo por sí mismo. La capacidad inicial sigue siendo de hasta 50 camiones por empresa, conforme al plan configurable existente.

Una desactivación o un vencimiento explícitos bloquean las operaciones comerciales de esa empresa en servidor e interfaz. Se conservan sus registros y archivos. El superadministrador mantiene la administración de la cuenta y puede reactivarla inmediatamente. Los clientes no pueden modificar su licencia ni aprovechar otra empresa del mismo propietario para eludirla.

Las copias offline conservan su cifrado y límites de autorización. Un equipo desconectado no puede recibir una revocación remota instantánea: debe respetar el vencimiento conocido y el plazo máximo de su copia. Al reconectar se revalida el acceso antes de sincronizar. Los archivos ya descargados y las URL firmadas emitidas con anterioridad no pueden retirarse retroactivamente; las solicitudes nuevas siguen los permisos vigentes.

## Operación comercial inicial

Stripe, Checkout y los cobros automáticos continúan desactivados. Su implementación se conserva para una aceptación futura. La licencia manual no representa un pago confirmado, no genera una factura fiscal y no modifica los importes de los planes. La aceptación de Stripe LIVE deja de ser una condición del lanzamiento inicial por suscripción manual, por instrucción expresa del titular.

La facturación de ELEVADANCOR S.L. conserva el procedimiento manual de GDTaller/TicketBAI acordado. No se inventan facturas, entregas ni aprobaciones legales. El lanzamiento comercial requiere comprobar las funciones que se ofrecen efectivamente y declarar las limitaciones de integraciones opcionales, dispositivos y recuperación.

## Despliegue y recuperación

La nueva migración debe probarse de forma aislada, revisarse y aplicarse una sola vez mediante la confirmación oficial de Supabase. No repetir las 73 migraciones previas. Mantener el frontend anterior y la demo independientes. No publicar el manifiesto de demo de main como producción.

La recuperación de funciones debe rechazar una retirada de los controles de licencia si ya existen decisiones manuales. Si todavía no existe ninguna decisión, el procedimiento deja una barrera persistente contra escrituras de licencia para impedir que una solicitud anterior, que estaba esperando un bloqueo, termine después de restaurar las funciones. Retirar esa barrera requiere otra migración revisada que restablezca antes los permisos; nunca repetir la migración original. Volver a un frontend anterior no autoriza a eliminar las licencias, su auditoría ni las barreras del servidor. Conservar todos los datos de empresa.

## Verificación aislada del servidor

El [recibo nativo](verification/company-manual-full-native-20261115.json) confirma 200/200 controles del Pack FULL y 67/67 controles de recuperación previos en la ejecución [43736219689](https://github.com/smartscaneuskadi/TruckControl-AI/actions/runs/43736219689), fuente `553c08b`. Auth oficial, PostgreSQL, PostgREST y almacenamiento reales, con usuarios y empresas ficticios. Incluye permisos, aislamiento de empresas del mismo propietario, vencimiento, reactivación, documentos privados, auditoría, idempotencia y cupo de 50 camiones. No se alteró producción ni se efectuaron llamadas a proveedores, Stripe o IA. Este recibo acredita el servidor ensayado; no acredita todavía la publicación de la nueva interfaz.

La [aceptación PostgreSQL](verification/company-manual-full-postgres-20261115.json), ejecución `43737864796` sobre la fuente exacta `a248e8f`, confirma 399 controles, con cuatro carreras nuevas entre procesos reales y dos restauraciones lógicas aisladas. El recorrido de rollback impide que una petición ya en ejecución cree una licencia después de restaurar las funciones. No es una restauración de la plataforma gestionada.

## Migración aplicada

La confirmación oficial de Supabase instaló una sola vez `20261115170051_company_manual_full_licenses`, migración 74, con SQL SHA256 `ca675f4e25ac913b0e31475d72328378334b2430144d2261476bb6c89b214a0c`, idéntico al candidato ensayado. [Correspondencia nativa y permisos](verification/supabase-migration-74-20261115.json). No repetirla. Los registros de licencia y auditoría estaban vacíos tras aplicar: no se ha concedido ni retirado FULL automáticamente a empresas existentes. Registro y RLS continúan activos; cobros automáticos apagados. La publicación del panel se registra por separado.

## Guía del superadministrador

1. Inicia sesión con tu cuenta de administración y abre **Empresas**. Busca por nombre o correo y comprueba la empresa concreta: un propietario puede tener varias.
2. Pulsa **Activar Pack Full**. Puedes indicar una fecha y hora en **UTC** o dejar el vencimiento vacío. Revisa la solicitud y pulsa **Confirmar cambio**. El estado mostrado después de confirmar procede del servidor.
3. Para interrumpir el acceso comercial, pulsa **Desactivar Pack Full** y confirma. La empresa conserva sus registros, archivos y cambios pendientes cifrados; no se cancela ni se borra la cuenta.
4. Para reactivar, confirma otra activación con un vencimiento futuro o vacío. Si conservas una fecha pasada, el estado seguirá siendo **Vencido**. Los datos y las asignaciones se mantienen.
5. **Ver historial** muestra el operador, la hora UTC y los estados anterior y posterior. Una modificación concurrente exige revisar el estado actualizado antes de confirmar otra operación.

Si aparece un resultado incierto, usa **Reintentar la misma solicitud**: conserva el identificador y evita duplicar el cambio. Tras recargar la página, revisa primero el estado y el historial; la solicitud pendiente no se conserva en almacenamiento del navegador.

Las cuentas cliente ven el nuevo estado al comprobar acceso, recuperar el foco o en el siguiente sondeo conectado. El servidor decide los permisos de cada solicitud. Un plan Básico anterior sigue identificado como Básico; su acceso vigente no equivale a FULL. Una empresa sin decisión manual conserva su plan anterior. Una desactivación manual explícita sí bloquea sus funciones comerciales aunque la prueba o el plan anterior sigan vigentes.

La licencia manual no registra un pago, no cobra una mensualidad y no emite una factura. La contratación, el cobro manual y la factura fiscal válida deben seguir el procedimiento comercial acordado con ELEVADANCOR. Los futuros cobros automáticos se activarán por separado, después de su aceptación.
