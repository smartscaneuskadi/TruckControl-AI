# Suscripciones manuales por empresa

Prioridad del titular, 15/11/2026. Candidata en desarrollo; comprobar el recibo de publicación antes de considerar disponible el control en producción.

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

La recuperación de funciones debe rechazar una retirada de los controles de licencia si ya existen decisiones manuales. Volver a un frontend anterior no autoriza a eliminar las licencias, su auditoría ni las barreras del servidor. Conservar todos los datos de empresa.

## Verificación aislada del servidor

El [recibo nativo](verification/company-manual-full-native-20261115.json) confirma 200/200 controles del Pack FULL y 67/67 controles de recuperación previos en la ejecución [43736219689](https://github.com/smartscaneuskadi/TruckControl-AI/actions/runs/43736219689), fuente `553c08b`. Auth oficial, PostgreSQL, PostgREST y almacenamiento reales, con usuarios y empresas ficticios. Incluye permisos, aislamiento de empresas del mismo propietario, vencimiento, reactivación, documentos privados, auditoría, idempotencia y cupo de 50 camiones. No se alteró producción ni se efectuaron llamadas a proveedores, Stripe o IA. Este recibo acredita el servidor ensayado; no acredita todavía la publicación de la nueva interfaz.
