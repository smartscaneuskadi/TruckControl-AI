# Administración de incidencias de pagos

Candidata de interfaz para el contrato \`subscription-financial-incidents-v1\`. No acredita que la migración 64 ni la conciliación de reembolsos/disputas estén desplegadas. Producción v32, demo6 y los controles comerciales existentes se conservan.

El administrador global abre **Incidencias de pagos**, consulta el caso y su historial y puede declarar una revisión o una referencia rectificativa emitida externamente en GDTaller. **Ver solicitud fiscal** abre únicamente la tarea original; **Volver a todas las facturas** restablece el listado. El UUID seleccionado permanece en RAM.

La interfaz no ejecuta devoluciones, no cambia licencias y no crea, certifica ni envía facturas rectificativas. Una observación pending/failed no acredita dinero entregado. El importe acumulado del cargo se muestra separado de los eventos refund y nunca se suma a ellos. El estado fiscal pending exige valoración humana; no afirma una obligación fiscal determinada.

## Contrato y seguridad

Se utiliza exclusivamente \`public.tc_admin_subscription_incidents\` con las acciones y DTO confirmados por el backend. La firma tipada se añade al cliente existente, sin modificar SQL63/64 ni los handlers de Stripe.

Las capacidades se consultan primero. Si la API falta, el contrato no coincide o el servidor deniega el acceso, no se listan casos ni se permiten declaraciones. Los poderes de reembolso, licencia y emisión fiscal deben seguir explícitamente en false.

El cliente captura una sola sesión en memoria y comprueba Auth y la identidad/token actuales antes y después de cada petición. Fija Authorization por consulta y no altera los headers globales. Cambiar de JWT, cerrar sesión, cambiar de usuario o conectividad aborta y limpia el contexto; las respuestas anteriores se descartan. No se guardan casos, notas, referencias ni historial en WebStorage, IndexedDB o caché offline.

Las declaraciones incluyen versión CAS y UUID estable. La confirmación contrasta la identidad del caso/pago/empresa/tarea y el registro operation (actor, acción, versión, nota y referencia). Un replay puede traer un caso posterior si se han registrado observaciones nuevas; la confirmación sigue correspondiendo a la operación original. Una respuesta de transporte incierta exige reintento explícito del mismo intento. Un conflicto exige actualizar y revisar, sin repetir escrituras automáticamente.

Las fechas, identidades de renovación, límites de importes, orden y cursores de páginas e historial se validan en el adaptador. Los diagnósticos internos del proveedor no se muestran. Las comprobaciones reales de permisos y sesiones corresponden al RPC del servidor; no se confía en user_metadata.

## Pruebas y límites

Se preparan pruebas de dominio/cliente y recorridos Playwright en Windows/Android emulados, con Fleet Light/Fleet Cockpit y Axe. Comprueban permisos, CAS, UUID de reintento, cambio de JWT, logout con respuestas tardías, ausencia de API, enlace fiscal, limpieza offline y ausencia de datos de casos en el almacenamiento del navegador.

Los fixtures son ficticios y no contactan con Stripe, GDTaller, correo o IA. La aceptación SQL/nativa, los pagos reales, las rectificaciones fiscales válidas, su entrega y dispositivos físicos se verifican aparte. El resultado CI verificable se registra en el PR de esta rama; no se presenta una ejecución pendiente como satisfactoria.
