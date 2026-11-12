# Recuperación de servicios locales aislados

Estado inicial: código y nueve barreras unitarias comprobados; ejecución real en curso. No se certifica una restauración gestionada, RPO/RTO, un pago ni una factura fiscal.

El workflow `Isolated Auth and Storage recovery` arranca dos instalaciones Supabase CLI3.1.0/Postgres17 independientes en un runner estándar del repositorio público. No usa secretos de producción, datos empresariales, credenciales alojadas o conexiones a los proyectos de Supabase. Solo publica un recibo saneado; el token efímero del propio job se limita a descargar paquetes oficiales. No tiene programación periódica ni crea servicios de pago.

La fuente local usa los42 archivos SQL consolidados del commit. Esto es distinto de las65 entradas del historial remoto, que no se modifican. Se comprueban la lista Git completa y los hashes inmutables de las cuatro migraciones fiscales/sesión/equipo recientes.

El primer arranque encontró un límite de descargas anónimas del registro. La configuración usa ahora el registro oficial GHCR mediante `SUPABASE_INTERNAL_IMAGE_REGISTRY=ghcr.io`, admitido por el [resolver oficial de CLI3.1.0](https://github.com/supabase/cli/blob/v3.1.0/apps/cli/src/command-internal/docker-registry.ts). El token efímero del job solo tiene lectura de contenido/paquetes y se entrega a `docker login` por stdin; no se reutiliza ninguna credencial del conector, ni se solicita cuenta nueva. El login se retira al terminar. Las etiquetas del proveedor se mantienen y no se desactiva TLS.

Una reproducción mínima confirmó que Docker28 no publica puertos de una red `--internal`, aunque PostgreSQL esté listo. El laboratorio conserva esa red sin salida y añade tres relés en `127.0.0.1` para DB, gateway y SMTP local. Antes de cada conexión comprueba nombre, etiqueta, red, subred privada y puerto fijo del contenedor propio. No permite DNS, destino externo, otro proyecto ni puerto arbitrario. No cambia políticas de producción ni sustituye las comprobaciones de salud de los servicios.

La copia usa la ruta real `/mnt` del backend de archivos de CLI3, validada contra el volumen con nombre del proyecto. Los valores literales `pending` que crean las migraciones no se consideran credenciales configuradas; su contenido nunca sale de PostgreSQL, solo se consulta un contador. También se comprueba que IA, receptor y cobros locales sigan apagados.

## Barreras de aislamiento

- Proyectos y redes desechables con nombres propios e identificador aleatorio; se rechazan proyectos enlazados.
- Redes Docker internas, puertos exclusivamente loopback, contenedores sin privilegios ni socket Docker montado. Se comprueban etiquetas y redes antes de operar.
- Claves ES256 diferentes para origen/destino, fuera del repositorio. Solo usuarios `example.invalid` y SMTP Mailpit dentro de la red local.
- Registro y exigencia de acceso reproducidos únicamente dentro del laboratorio. Pagos, avisos y lectura IA siguen apagados; cron local desprogramado. El proyecto nativo y su cron permanecen intactos.
- Nunca se imprimen contraseñas, tokens, claves, enlaces personales, dumps o mensajes SMTP. No se suben archivos privados como artefactos.
- La limpieza selecciona únicamente los dos proyectos que creó la ejecución; no usa `--all`.

## Recorridos que debe acreditar el recibo

Alta y confirmación mediante el correo SMTP local, enlace de un uso, contraseña y sesión real de GoTrue; provisión Básico; autorización REST/RLS de dos empresas; subida/descarga de bytes PDF privados y rechazo de otro inquilino/URL pública; recuperación de contraseña; congelación de servicios, copia PostgreSQL y objetos, restauración en el segundo stack y coincidencia de tablas; nueva autenticación en el destino, rechazo del token del origen y cierre global con pérdida inmediata del acceso privado.

El PDF lleva explícitamente `SYNTHETIC RECOVERY TEST - NOT A FISCAL INVOICE`. La empresa sintética obtiene Full solo dentro del fixture después de comprobar el alta Básico para probar documentos. Esa modificación no afecta planes o usuarios reales.

## Límites

Son servicios reales autohospedados de prueba, no una restauración de una copia de producción sobre la plataforma administrada. No comprueba recuperación del gestor secreto de producción, proveedores OAuth externos, correo Resend/Migadu, funciones Edge alojadas o dispositivos físicos. La aceptación comercial y la revisión fiscal/jurídica siguen pendientes por separado. No reemplazar estas dependencias por un recibo local verde.
