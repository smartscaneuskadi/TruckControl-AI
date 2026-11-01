# Copias cifradas y recuperación de empresa

En **Configuración → Copia cifrada de empresa**, el propietario o administrador de una empresa activa puede descargar un archivo `.truckcontrol` con una frase de al menos doce caracteres. La frase no se envía al servidor ni se guarda en la aplicación. Guárdala por separado: no se puede recuperar una copia sin ella.

La función utiliza AES-256-GCM con PBKDF2-SHA256, 600.000 iteraciones, sal aleatoria de 16 bytes e IV aleatorio de 12 bytes. El formato está versionado y autenticado; una frase incorrecta, archivo modificado, versión desconocida u otra empresa se rechazan. Los nombres y registros no aparecen en la envoltura cifrada. La preferencia de tema y los importes económicos no cambian.

## Contenido y alcance

Incluye fichas de camiones/conductores, movimientos, remolques, clientes, viajes, mantenimiento, combustible, vencimientos y alertas. Incluye los metadatos y originales registrados que el usuario puede leer, junto con las facturas autorizadas y sus vínculos contables. Si solo está permitido correo, el archivo incluye únicamente sus adjuntos; no concede acceso al resto de la biblioteca. El resumen de comprobación indica ese alcance.

No incluye usuarios de Auth, contraseñas, roles, licencias, ajustes del proveedor, secretos OAuth/API, todo el buzón, originales de correo sin registrar, ni objetos huérfanos. No es una copia integral de Supabase, Vault o Storage. La exportación básica JSON anterior sigue disponible y conserva su alcance reducido.

Límites de esta versión: 20 MiB de contenido, archivo cifrado de hasta 32 MiB, máximo 2.000 documentos y 2.000 facturas; cada original tiene un máximo de 10 MiB. Una copia demasiado grande o incompleta se rechaza entera. No se entrega una copia parcial como si estuviese completa. Deben estar habilitados los módulos de registros necesarios para conservar sus relaciones.

Las consultas paginan por identificador; no usan los listados recientes limitados a 500 documentos/200 facturas. Cada descarga mantiene RLS y utiliza la sesión del usuario, sin claves de servicio ni enlaces públicos. Se valida la pertenencia de cada fila/ruta, la coherencia de relaciones/importes y el SHA-256 de cada original. Datos y permisos se vuelven a comprobar antes de descargar; si cambian, se cancela la copia.

## Comprobar y recuperar originales

Selecciona la copia cifrada, introduce su frase y pulsa **Comprobar recuperación**. La app verifica el contenido localmente, muestra empresa, fecha, cantidades y alcance, y permite recuperar un original después de confirmar una ubicación privada. Vuelve a comprobar permisos antes de entregarlo. La comprobación no escribe en la empresa ni crea movimientos contables.

No hay restauración automática sobre una empresa en uso. La importación de registros en producción necesita un procedimiento de mantenimiento, revisión de la copia y un destino aislado; no se deben sobrescribir datos existentes para ensayar una recuperación.

## Ensayo ejecutado

El ensayo cifró, descifró e importó datos ficticios en un PostgreSQL/PGlite aislado con las migraciones de la aplicación: 50 camiones, 46 conductores, 2.102 movimientos, siete operaciones y una factura aprobada con PDF. Se verificaron sumas en céntimos, relación del viaje contabilizado, referencias de factura y huella del archivo recuperado en un directorio temporal. Otro usuario no puede consultar filas ni metadatos Storage de la empresa. [Resultado](verification/company-logical-restore-20261101.json).

La prueba de Supabase real comprueba paginación de 201 documentos, dos empresas, rechazo anónimo/operador, administrador autorizado, revocación, módulos y suspensión. Se revierte por completo: cero usuarios, empresas y documentos de ese ensayo quedan guardados. [SQL](verification/company-backup-rollback.sql).

Estas pruebas no restauran Auth, funciones, secretos ni archivos en el servicio S3 alojado. Tampoco acreditan dispositivos físicos, retención automática, PITR ni un SLA de copias.

## Recuperación del servicio alojado: pendiente

El operador debe conservar por separado base de datos, objetos Storage, código/configuración y credenciales en su almacén seguro. La documentación de Supabase confirma que un backup de base de datos no incluye los bytes de los objetos ni toda la configuración del servicio. [Guía oficial](https://supabase.com/docs/guides/platform/migrating-within-supabase/dashboard-restore).

Antes de prometer una recuperación comercial completa, preparar un destino aislado autorizado, restaurar base y objetos sin apuntar clientes al ensayo, reconfigurar secretos desde su almacén, comprobar acceso/aislamiento/archivos y medir el tiempo y punto de recuperación. No restaurar encima de producción, borrar datos ni contratar un proyecto de pago para ese ensayo sin autorización. El conector actual no proporciona descarga/gestión de backups alojados ni conexión PostgreSQL de mantenimiento; esta limitación sigue pendiente.
