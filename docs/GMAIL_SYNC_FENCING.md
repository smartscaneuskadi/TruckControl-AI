# Sincronización de Gmail y recuperación de Checkout

Estado: candidata 0.5.26-rc.1. Producción Sites43 y la demo6 se conservan hasta completar la aceptación. Esta entrega no abre cobros ni acredita la verificación pública de Google.

## Errores corregidos

- Un mensaje con seis o más adjuntos perdía definitivamente los posteriores al quinto. Se recorren todos sus adjuntos y se conserva el límite de diez documentos nuevos por pasada, cincuenta mensajes y dos minutos. Una página incompleta se retoma con deduplicación. El ensayo de veintitrés PDF finaliza en tres pasadas: diez, diez y tres, sin descargar ni guardar dos veces un original.
- Una importación antigua podía marcar como necesitado de autorización un buzón recién reconectado, guardar su cursor o liberar la sincronización nueva. Cada ejecución nativa utiliza un UUID aleatorio asociado a empresa y actor. La autorización nueva borra el permiso de ejecución anterior, incluso cuando se conecta el mismo buzón.
- Reabrir una suscripción después de cruzar el umbral de cuarenta y ocho horas de prueba podía cambiar los parámetros de creación conservando la misma clave de idempotencia. Una sesión Checkout guardada se recupera mediante GET y se comprueban propietario, solicitud, condiciones, modo, precio mensual, importes, vencimiento y URL antes de devolverla.

## Permisos, costes e integridad

Se reutiliza el RPC existente `gmail_server`, exclusivo de `service_role`; no se añade un endpoint público ni se permiten llamadas desde `anon` o `authenticated`. La función privada exige un permiso temporal válido, identidad de empresa/actor y acceso de escritura vigente. Comprueba correo confirmado, baja, bloqueo y disponibilidad del módulo Gmail. Los nuevos campos de ejecución no se conceden al navegador; la consulta de estado conserva sus columnas y sus políticas RLS.

La conexión de empresa se bloquea durante la comprobación y escritura SQL del documento. Una reconexión ganadora impide la escritura tardía; el objeto subido se elimina si su inserción ha sido rechazada. No se mantienen bloqueos SQL durante solicitudes a Google, almacenamiento o IA.

Se valida la ejecución antes de continuar después de renovar el token, recorrer una página, usar la IA o subir un archivo. Si la conexión cambia, se actualiza el estado y se muestra una indicación en español, rumano, inglés o francés. No se fuerza otro consentimiento por un resultado antiguo. Las cuotas y el consentimiento IA existentes se conservan, incluidos 10 USD/mes de plataforma y 100 llamadas por empresa.

Los consumidores internos heredados conservan su contrato. La adquisición y finalización heredadas se serializan con la misma fila; una adquisición nueva borra el UUID vencido y una finalización heredada no altera una ejecución nativa. La API del navegador no acepta ni elige estos permisos internos.

Una lectura fallida o incoherente de Checkout no inicia otro pago ni libera una reserva de resultado desconocido. El vencimiento local por sí solo sigue siendo insuficiente para liberar una reserva. El caso de una creación fallida sin identificador guardado necesita conciliación con el proveedor; esta entrega no inventa una confirmación de inexistencia.

## Pruebas y despliegue

Las pruebas SQL utilizan empresas, actores, archivos y transportes ficticios. Cubren reconexión del mismo y distinto buzón, fin tardío, caducidad, sustitución por otra ejecución, aislamiento, permisos retirados, limpieza de objetos y compatibilidad heredada. Los recorridos de navegador utilizan el SDK real con HTTP privado simulado; no equivalen a una aceptación real de Google ni a pruebas en dispositivos físicos.

El flujo `isolated-postgres.yml` conserva los contratos y restauraciones anteriores y añade siete carreras en conexiones PostgreSQL independientes. Su ejecutor exige el contenedor y socket locales ya verificados, imagen inmutable, base desechable fija, recibos anteriores correctos del mismo commit y ausencia de credenciales externas. No admite objetivos de producción.

Secuencia de publicación:

1. Conservar las fuentes de `company-gmail`18, `truckcontrol-subscriptions`20 y Sites43; comprobar las 71 migraciones existentes.
2. Completar la regresión y el ensayo SQL aislado de la candidata. Revisar únicamente la ampliación nueva `gmail_sync_lease_fencing`; no volver a aplicar68–71.
3. Aplicar una vez mediante el conector oficial y reconciliar el nombre local con la versión remota, conservando los bytes SQL ensayados.
4. Actualizar únicamente las dos funciones existentes, conservando su autenticación manual, CORS y configuración `verify_jwt` anterior. Verificar las fuentes desplegadas y las barreras HTTP; no probar proveedores con cuentas inventadas.
5. Construir/publicar desde un checkout de producción independiente, verificar HTTPS/PWA/archivos y mantener Sites43 como recuperación. El manifiesto de main pertenece a la demo y no debe desplegarse encima de ella.

Si se necesita recuperar, restaurar las fuentes anteriores y Sites43, sin eliminar documentos ni credenciales ni volver a aplicar migraciones. Los dos campos adicionales pueden permanecer: el RPC anterior de estado sigue funcionando y las ejecuciones heredadas esperan el vencimiento del permiso activo. No es necesario un rollback destructivo de esquema. Registrar y comprobar la recuperación antes de reabrir importaciones.

## Pendientes externos conservados

La validación del cliente Google no acredita la conexión de un buzón ni su revisión pública. La reutilización de Checkout no acredita pagos reales, entrega de webhook, activación de licencia ni emisión y entrega de una factura TicketBAI válida. Continúan las aceptaciones reales de Stripe/fiscalidad, Google, recuperación gestionada de Auth/Storage/Vault, firma/Play/dispositivos y revisión jurídica. Cobros comerciales apagados hasta cumplir los criterios aprobados.
