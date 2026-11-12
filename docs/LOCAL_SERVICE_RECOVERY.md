# Recuperación de servicios locales aislados

Estado inicial: código y seis barreras unitarias comprobados; ejecución real en curso. No se certifica una restauración gestionada, RPO/RTO, un pago ni una factura fiscal.

El workflow `Isolated Auth and Storage recovery` arranca dos instalaciones Supabase CLI3.1.0/Postgres17 independientes en un runner estándar del repositorio público. No usa secretos de GitHub, datos empresariales, credenciales alojadas o conexiones a los proyectos de Supabase. Solo publica un recibo saneado. No tiene programación periódica ni crea servicios de pago.

La fuente local usa los42 archivos SQL consolidados del commit. Esto es distinto de las65 entradas del historial remoto, que no se modifican. Se comprueban la lista Git completa y los hashes inmutables de las cuatro migraciones fiscales/sesión/equipo recientes.

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
