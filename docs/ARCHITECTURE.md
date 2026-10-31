# Arquitectura actual

## Aplicación y datos

React 19 y TypeScript, Vite, React Router con rutas hash y PWA con precaché de recursos estáticos. Fuentes y recursos se sirven localmente, sin CDN de terceros. Se conserva el diseño oscuro y la navegación adaptable. `VITE_BASE_PATH` admite despliegues bajo un prefijo; su valor predeterminado es `/`.

`FleetProvider` separa la demo del repositorio Supabase. El dominio valida fichas y cálculos; los importes son céntimos enteros de EUR sin IVA, el combustible se guarda en mililitros y los contadores usan enteros. Beneficio = ingresos − gastos; margen = beneficio / ingresos; coste por km = gastos / km de los ingresos. Sin denominador se muestra «—». Los movimientos pendientes se incluyen por su fecha de devengo. Las amortizaciones y los impuestos no se generan automáticamente.

Las tablas principales son `organizations`, `trucks`, `drivers` y `finance_entries`. `private.fleet_records` mantiene remolques, clientes, viajes, mantenimientos, combustible, vencimientos y alertas. Sus RPC validan datos, referencias dentro de empresa, roles, módulos y versiones de fila. Contabilizar un registro es una transacción bloqueada e idempotente; el navegador no puede asignar `source_record_id`.

Los repositorios remotos paginan las lecturas y escriben por entidad. `row_version` y versiones de operaciones impiden sobrescribir ediciones concurrentes. Las exportaciones CSV neutralizan fórmulas de hojas de cálculo.

## Identidad y aislamiento

El proyecto de producción reservado es `kkkemaycedexymrpaqtp`, completamente separado de FIXPilot. Auth almacena las identidades; los roles y suscripciones están en tablas privadas y no proceden de `user_metadata`. El correo confirmado del propietario configura al superadministrador; el perfil de registro del cliente nunca concede ese privilegio.

Cada empresa tiene un propietario y miembros con rol administrador, operador o consulta. Las invitaciones requieren aceptación y la revocación se comprueba en el servidor. Los planes y módulos limitan el acceso efectivo; la política del miembro puede restringirlo. La pertenencia a una empresa no da acceso a otras. El rol consulta no escribe. RLS se aplica a todas las tablas de aplicación, además de los controles de los RPC.

El bucket `truckcontrol-documents` es privado, admite PDF/JPEG/PNG/WebP hasta 10 MB y requiere sesión para descargar. Los objetos deben tener una ficha registrada que resulte visible mediante RLS. Gmail sin biblioteca solo permite los adjuntos vinculados a facturas autorizadas. Una clave externa compuesta impide asociar un archivo o viaje a fichas de otra empresa.

Las funciones Edge usan autenticación explícita y revalidan los permisos. Por eso su configuración `verify_jwt=false` no significa acceso anónimo a datos: los endpoints protegidos verifican la identidad internamente. Los tokens Gmail se cifran con AES-GCM y una clave solo del servidor; ninguna clave privilegiada se incluye en el frontend.

## Offline comercial

La copia offline se activa de forma expresa después de obtener datos autorizados. IndexedDB conserva un sobre AES-256-GCM con clave derivada de una frase de al menos 12 caracteres mediante PBKDF2-SHA256 (600.000 iteraciones), sal e IV nuevos. El contexto autenticado liga proyecto, usuario, empresa y revisión. La clave no extraíble permanece en memoria. Las fichas y la cola no se guardan en claro en IndexedDB.

La autorización local caduca al menor plazo entre siete días y el vencimiento de la licencia. El visor se bloquea tras 30 minutos de inactividad. Sin conexión no se puede conocer una revocación nueva: una copia ya autorizada puede leerse hasta su caducidad. Una persona que controle el navegador, su reloj y el dispositivo está fuera de las garantías de este caché; no sustituye controles del sistema operativo ni cifrado de disco.

Solo los módulos de operaciones admiten escrituras en cola (hasta 1.000). Antes de cada envío se comprueban identidad, empresa, licencia, rol y módulo en el servidor. Se conservan UUID y versión para evitar duplicados y sobrescrituras. Los conflictos conservan el cambio pendiente para su revisión. Una suspensión bloquea la sincronización. Cambiar de empresa no reutiliza la copia de otra.

La edición de fichas de camiones/conductores y contabilidad, las descargas privadas, Gmail y los modelos IA requieren conexión. No se contabilizan automáticamente cambios offline. El service worker guarda recursos de aplicación; no hay una regla que cachee respuestas de Auth, Storage o PostgREST.

La demo usa claves y base IndexedDB separadas, datos ficticios y almacenamiento local sin cifrar. No utiliza proveedores remotos. Su biblioteca admite 50 MB en total y no sobrescribe archivos anteriores.

Las fichas y las operaciones de demo se integran en una sola escritura local, conservando la clave heredada de operaciones. Las copias de registros se validan antes de mostrar una vista previa y requieren confirmación. Antes de restaurar se guarda un punto de recuperación; si falla una escritura o la vista previa está obsoleta, no se reemplazan los registros actuales. Los documentos binarios se conservan aparte y no se incluyen en el JSON. Véase [recuperación de demo](DEMO_RECOVERY.md).

Las alertas combinan ITV, permisos, remolques, vencimientos personalizados, mantenimiento y avisos del equipo. El recordatorio por kilometraje tiene una clave estable ligada al trabajo y al umbral, y utiliza el mayor kilometraje de ficha o repostajes ya realizados. Revisar un aviso no equivale a renovar un permiso o finalizar un mantenimiento. La campana filtra los módulos autorizados y prioriza urgentes; la fecha de trabajo se actualiza al volver a la pestaña y cada minuto.

## Integraciones

`company-gmail`: OAuth por empresa, PKCE, estado de un uso, finalización ligada al mismo usuario, cifrado de refresh token, lectura limitada, deduplicación y aprobación humana de facturas.

`company-assistant`: selección explícita de documentos, validación individual de permisos antes de descargar o llamar al modelo, cuota, consentimiento y habilitación global/individual. Respuestas estructuradas sin herramientas, con referencias limitadas a los documentos seleccionados y sin almacenamiento de la respuesta por el proveedor.

`truckcontrol-billing`: preparación de solicitudes y webhook verificado. Los pagos están desactivados. La implementación preparada corresponde a un mes individual; no declara una suscripción recurrente activa.

Las migraciones fuente construyen una base nueva en las pruebas. El inventario remoto refleja los lotes reales; deben conciliarse antes de utilizar herramientas de despliegue masivo. Consultar [mantenimiento](MAINTENANCE.md).
