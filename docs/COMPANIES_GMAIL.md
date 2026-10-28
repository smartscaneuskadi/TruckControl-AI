# Empresas, autenticación y Gmail

## Estado de activación — 28 de octubre de 2026

La cuenta autoriza crear **truckcontrol-ai**, un proyecto nuevo dentro de **fixpilot-dev**. La consulta de coste indicó 0, pero Supabase rechazó la creación porque la cuenta ya alcanza el máximo de dos proyectos gratuitos activos. **El proyecto no se ha creado.** No se ha modificado, pausado ni eliminado FIXPilot ni ningún otro proyecto. No se ha contratado un plan, habilitado facturación ni ejecutado SQL remoto.

El código de esta entrega implementa acceso por correo y contraseña, confirmación de cuenta, recuperación de acceso, empresas propias, repositorio remoto por entidad, documentos privados y OAuth Gmail por empresa. Está probado localmente con PostgreSQL embebido y con servicios simulados; todavía falta validar la integración en el nuevo proyecto real.

La demo publicada conserva el diseño oscuro y los datos ficticios. «Facturas Gmail» permite revisar una factura de ejemplo y registrar su base como gasto local. «Acceso de empresas» explica el bloqueo de activación. No lee ningún buzón ni consume IA.

## Separación respecto a FIXPilot

- Compartir la organización administrativa de Supabase **no** significa compartir proyecto. TruckControl tendrá su propia referencia, URL, Auth, base de datos, bucket, claves y funciones.
- No vincular la CLI al proyecto FIXPilot, no copiar sus claves ni aplicar allí estas migraciones. No usar proyectos existentes como alternativa al límite gratuito.
- Las variables públicas de TruckControl se mantendrán vacías hasta crear y verificar el proyecto cuyo nombre sea exactamente `truckcontrol-ai` y cuya organización sea `fixpilot-dev`.
- No hay proyecto remoto configurado en `supabase/.temp/project-ref`. El aprovisionamiento bloqueado no ha generado credenciales de producción.

## Modelo de empresas

Cada empresa tiene un UUID y un propietario autenticado. Un propietario puede gestionar varias empresas. Otro propietario no puede leerlas ni modificarlas. La primera versión no incluye invitaciones ni roles de empleados: una cuenta diferente tendrá sus propias empresas.

RLS verifica `organizations.owner_id = auth.uid()`, nunca `user_metadata`. Las referencias compuestas impiden vincular camiones, conductores, documentos y gastos de empresas distintas. Las consultas añaden el filtro de empresa como defensa adicional. Cambiar de empresa o cerrar sesión desmonta la flota anterior; los datos de empresa no se guardan en el snapshot local de la demo.

Las escrituras remotas usan entidad, ID, empresa y versión anterior; un trigger incrementa `row_version`. Una versión obsoleta muestra un conflicto en lugar de sobrescribir la edición. Las cargas paginan explícitamente para no perder movimientos al alcanzar los 1.000 registros de la API.

## Documentos

El bucket `truckcontrol-documents` es privado. Rutas: `<empresa>/<documento>/document.<extensión>`. Lecturas y subidas requieren ser propietario de esa empresa. No hay políticas de sustitución ni borrado para usuarios: se conservan los originales. Descarga autenticada, sin URL pública.

Se aceptan PDF, JPEG, PNG y WebP de hasta 10 MB. Se comprueban sus cabeceras de archivo y se guardan nombre, tamaño y vinculaciones en `private.company_documents`. El esquema `private` no debe añadirse a los esquemas expuestos por PostgREST.

## OAuth Gmail

`company-gmail` recibe el JWT de TruckControl, verifica el usuario en Auth y comprueba que es propietario de la empresa. Pide a Google `openid`, `email` y `gmail.readonly`; no tiene permisos para enviar correos o modificar mensajes.

1. El servidor crea un estado aleatorio, guarda solo su SHA-256 y lo vincula a usuario/empresa durante diez minutos. Se usa PKCE.
2. El callback consume ese estado una sola vez, intercambia el código con Google y verifica que la identidad coincide con el buzón.
3. Guarda temporalmente el refresh token cifrado y devuelve un ticket de cinco minutos en el fragmento del enlace de retorno.
4. Solo la misma cuenta y empresa autenticadas pueden consumir el ticket y activar la conexión. Esto evita vincular el Gmail de una persona que recibió un enlace de autorización iniciado por otra cuenta.

Cada empresa tiene una conexión propia. La misma identidad Google no puede conectarse simultáneamente a dos empresas por accidente. Los tokens se cifran con AES-256-GCM y datos asociados de empresa, usuario e identidad Google; se rechazan si se trasladan a otro contexto. La clave de cifrado está únicamente en los secretos de las funciones del proyecto TruckControl. No se devuelve ningún token al navegador.

La función permite el callback sin JWT de Supabase; por ello `verify_jwt=false` es deliberado. Todas las acciones POST autentican y autorizan dentro del código. El RPC `gmail_server` es exclusivamente `service_role`, usa `security invoker`, permisos explícitos y tablas privadas con RLS. La clave de servicio solo la proporciona el entorno de Supabase al servidor.

## Importación y revisión

La importación inicial se inicia desde la bandeja: hasta diez adjuntos nuevos por pasada, escaneando como máximo cincuenta mensajes de los últimos treinta días que contengan «factura» o «invoice». No se han activado trabajos programados ni notificaciones Pub/Sub. La lectura automática sin abrir la aplicación se incorporará después de validar OAuth en el proyecto real.

Se detectan duplicados por empresa/mensaje/adjunto y por SHA-256 del archivo. Un bloqueo temporal evita dos importaciones simultáneas en una misma empresa. Los adjuntos se conservan aunque la extracción no esté habilitada o requiera revisión manual.

La salida IA se trata como dato no fiable: JSON estructurado, sin herramientas, campos limitados, fechas válidas e importes enteros. Los abonos negativos y las monedas no admitidas no se convierten en gastos positivos. Todo documento queda pendiente de revisión; no hay contabilización automática sin confirmación.

La aprobación SQL bloquea la fila, comprueba empresa, camión, EUR y base + IVA = total, crea un gasto por la base sin IVA y vincula la factura en una transacción. Repetir la confirmación devuelve el mismo gasto. Se conserva el estado pendiente de pago.

## Costes y credenciales

`INVOICE_AI_ENABLED` es `false` por defecto. La mera presencia de `OPENAI_API_KEY` no habilita llamadas. No se ha creado ni cargado saldo en una cuenta IA durante esta entrega. Las pruebas usan respuestas y credenciales ficticias.

Si más adelante se autoriza el consumo, el servidor requiere clave y modelo compatibles y limita a cien intentos de lectura por empresa/mes, diez adjuntos por importación y 6 MB por documento enviado a IA. Es un límite de uso, **no una garantía de importe máximo en euros**: depende del modelo, páginas y número de empresas. Los límites de facturación se deben acordar antes de activarlo.

## Activación pendiente para el responsable del desarrollo

Estas operaciones las ejecutará el agente cuando estén disponibles los accesos; el usuario no necesita ejecutar comandos.

1. Resolver la cuota gratuita sin tocar FIXPilot, o recibir autorización explícita antes de contratar una opción de pago.
2. Crear y verificar el nuevo proyecto `truckcontrol-ai`; inspeccionar esquema vacío y aplicar las migraciones en orden. No cargar datos de empresas reales.
3. Configurar Auth con la URL publicada, confirmación de correo y contraseñas de al menos doce caracteres. Verificar la entrega de correos y sus límites antes de abrir registros a clientes.
4. Ejecutar asesores de seguridad y rendimiento, regenerar tipos y comprobar RLS con sesiones reales de dos propietarios, incluido Storage y los RPC.
5. Registrar un cliente OAuth web propio de TruckControl en Google y configurar el callback exacto `https://<referencia-nueva>.supabase.co/functions/v1/company-gmail`. Publicar la autorización de Google y obtener los consentimientos de prueba/producción que correspondan. La conexión Gmail de ChatGPT no sustituye al OAuth de los clientes dentro de TruckControl.
6. Guardar secretos únicamente en el nuevo proyecto, desplegar la función y verificar conexión, renovación, importación, revisión y desconexión de dos empresas de prueba.
7. Configurar únicamente URL y clave **publicable** en la compilación del cliente. Mantener la demo separada. La publicación de Sites sigue siendo privada; no se ha ampliado su audiencia.
8. Mantener IA y programación automática desactivadas hasta acordar sus costes y validar la integración. Después volver a publicar y verificar.
