# Documentos, vencimientos e informes operativos

**Publicada 0.5.8-rc.1 / versión 15 en https://truckcontrolai.com.** La mejora continúa la aplicación existente. La versión 14 y la demo estable 6 se conservan para recuperación. Publicación y aceptación de esta mejora se registran en el inventario de despliegue y en el checkpoint `/workspace/artifacts/truckcontrol-documents-20261102/checkpoint.json`.

## Uso

- En **Documentos**, subir un PDF/JPG/PNG/WebP y elegir tipo, fecha opcional de vencimiento y antelación de 0 a 365 días. Las vinculaciones con camión y conductor siguen perteneciendo a la empresa.
- Buscar por nombre y filtrar por tipo, camión o estado; exportar el listado autorizado a CSV. El archivo se carga mediante páginas, sin el antiguo límite visual de 500 documentos. Se informa si supera 10.000, sin presentar un archivo incompleto como completo.
- **Ficha y vencimiento** permite corregir la fecha o archivar. Archivar conserva el original y retira sus avisos; los archivados siguen localizables y descargables. Los cambios concurrentes se rechazan antes de sobrescribir una edición más reciente.
- **Alertas** y la campana incluyen documentos vencidos o dentro de su antelación. Una fecha nueva genera un aviso nuevo aunque se hubiera revisado el vencimiento anterior. Son avisos dentro de la app; no se habilitan envíos ni SMS.
- **Informes** añade indicadores y CSV por camión, gastos por categoría y estado documental. Los viajes finalizados se asignan a su fecha de finalización. Los viajes sin contabilizar no se suman a ingresos. Los litros son repostados y el consumo solo se calcula entre depósitos completos dentro del periodo. No se inventa velocidad, ubicación ni mediciones ausentes.

En la demo los archivos y metadatos ficticios se guardan en IndexedDB del navegador, sin subirlos al servidor ni a IA. En empresa, originales y metadatos siguen bajo permisos y licencia del servidor. La biblioteca empresarial requiere conexión; instalar la PWA no descarga estos documentos para uso offline.

## Seguridad y compatibilidad

Los metadatos se almacenan en una tabla privada separada con RLS, claves compuestas por empresa/documento y sin borrado para clientes. El original y sus relaciones no se modifican. Las RPC nuevas son invoker, sin elevar privilegios; verifican el módulo documental, empresa, rol, versión y campos admitidos. Los permisos de operador y consulta se conservan. Desactivar el módulo retira también sus metadatos y avisos de la interfaz.

Las RPC anteriores y los documentos existentes no cambian; la versión 14 puede seguir utilizándolos mientras se publica la nueva. No se editan migraciones anteriores ni se cambian precios, pruebas, planes, pagos, claves o límites IA. El nuevo inventario identifica la migración adicional; no ejecutar db push a ciegas.

## Copias

Las copias con metadatos documentales usan el formato de registros **2**, con el mismo cifrado autenticado. El lector nuevo sigue aceptando las copias de registros **1**. Los originales y metadatos se verifican juntos; permanecen los límites explícitos de 20 MiB y 2.000 documentos. La copia se detiene si faltan permisos, originales o estabilidad del origen. Las versiones anteriores a esta mejora necesitan actualizarse para abrir una copia 2. La recuperación en la app continúa siendo validación local y descarga de originales, sin restaurar encima de la base de datos.

Se corrige además el validador de facturas aprobadas: el gasto debe coincidir con la base sin IVA, como hace `approve_company_invoice`. Se rechaza usar el total con IVA como coste operativo. No se alteran los apuntes existentes ni la lógica de contabilización.

## Verificación

Pruebas SQL cubren aislamiento, lectura y escritura por rol, permisos retirados, edición obsoleta, campos no admitidos, paginación y alta atómica. Las pruebas de dominio cubren fechas, antelación, archivo, revisión, renovación, categorías, viajes e importes. El recorrido de navegador comprueba el original después de archivar y la exportación del informe en Android/Windows emulados. Las 64 pruebas iniciales se conservan mediante once hashes. La aceptación remota usa exclusivamente fixtures sintéticos con rollback; no se envían correos ni llamadas IA para probar esta mejora.

La migración documental local 20261102080257 corresponde a la remota 20261102082309. La migración adicional local 20261102085143 / remota 20261102085701 prepara el retorno Gmail desde el hostname de producción ya publicado. Hay 54 migraciones aplicadas una vez. `company-gmail` v11 incorpora una salud pública sin secretos, que devuelve únicamente un booleano; los 14 controles HTTP y el ensayo de estados con rollback pasan. El diagnóstico sigue sin configuración Google válida, por lo que no se afirma una conexión de Gmail. El reenvío general se conserva.

La interfaz y su fuente exacta pasan 680 controles anteriores a la publicación; el código final pasa 487 unitarias/SQL y 32 Python. Los checks de PR #23 contienen la aceptación pública posterior de v15. El paquete publicado supera las cuatro combinaciones de tema y dispositivo emulado con cero infracciones Axe AA. Se conservan producción v14, demo v6 y copias Git recuperables. El asesor mantiene el aviso previo de [protección de contraseñas filtradas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection); no se ha contratado un plan superior.
