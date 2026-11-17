# Correo único y descarga autorizada de facturas

Actualización publicada **Sites 50 / `0.5.31-rc.1`**, Android 10, 16/11/2026, en https://truckcontrolai.com. Backend `company-mail` 16 verificado; producción 49 y demo 6 conservadas. [Recibo y alcance de las pruebas](verification/unified-mailbox-published50-20261116.json).

## Uso

1. Entra en **Correo** y pulsa **Añadir correo**. Escribe la dirección y elige Google/Gmail o un proveedor IMAP/SMTP compatible.
2. En Gmail, autoriza tu cuenta en la pantalla oficial de Google. En IMAP, introduce los datos directamente en la aplicación y acepta la información de privacidad del conector. Las opciones de servidores se agrupan en configuración avanzada.
3. Puedes conectar varias cuentas y seleccionar cuál consultar. Cada cuenta conserva su borrador temporal. Cerrar una cuenta o su caducidad no desconecta las demás. Salir de TruckControl o cambiar de usuario, empresa o sesión retira las conexiones privadas.
4. Dentro de la cuenta conectada, pulsa **Descargar facturas del correo por IA**. Esta opción requiere una empresa activa, permiso de escritura y los módulos de importación/IA habilitados.
5. Revisa el buzón y la empresa de destino, elige el período y confirma la autorización. Se ofrecen treinta días por defecto y hasta doce meses naturales, sin días futuros, en horario de Madrid.
6. Revisa el resultado y, si quedan documentos, pulsa **Continuar descarga autorizada**. Para fechas o cuentas diferentes debes confirmar otra autorización. Puedes solicitar nuevas descargas explícitas para incluir los correos que vayan entrando.
7. Abre **Ver facturas de la empresa**, coteja cada original y confirma el gasto únicamente después de revisarlo. Descargar o analizar una factura no la contabiliza automáticamente.

La pantalla normal es única. El marcador anterior `/mailbox/gmail` vuelve a Correo conservando la cuenta seleccionada; `/invoices` en una cuenta empresarial muestra la revisión documental. Los retornos OAuth anteriores y las rutas explícitas `?legacy=company-gmail` / `?legacy=personal` conservan compatibilidad con integraciones y pruebas históricas. La demostración ficticia anterior conserva su recorrido de factura; no se modifica el sitio demo6.

## Alcance de la autorización

Conectar una cuenta permite usar su correo; no inicia una importación ni una llamada IA. La autorización complementaria `2026-11-16` limita la descarga a **usuario, empresa, proveedor, buzón y fechas**. Se mantiene en RAM para la ejecución y los lotes que el usuario solicite expresamente. No es un consentimiento contractual persistente ni activa un cron o trabajo desatendido.

En el uso ordinario, Gmail continúa comunicándose directamente desde el navegador. Para la descarga expresamente autorizada, el permiso OAuth temporal de esa cuenta, o la conexión IMAP correspondiente, se transmite por HTTPS al backend existente. Se usa durante esa petición; no se guarda como credencial de importación ni aparece en respuestas, logs de aplicación o almacenamiento offline. Se actualiza la información complementaria de privacidad, manteniendo la versión contractual anterior.

El servidor comprueba la recepción real antes del contenido y de los adjuntos: Gmail `internalDate` o IMAP `INTERNALDATE`. Excluye enviados/borradores y vuelve a validar las fechas después de obtener el mensaje completo. La autorización del perfil Gmail debe coincidir con el buzón seleccionado.

Desconectar, cambiar de contexto o detener una descarga retira las siguientes solicitudes y descarta resultados tardíos en pantalla. Un lote que el servidor ya haya recibido puede completarse; los originales ya guardados permanecen en la empresa. Ante una respuesta incierta, revisa la bandeja antes de iniciar otra ejecución. La interfaz no reintenta automáticamente una lectura IA.

## Límites y seguridad

- Hasta cincuenta mensajes examinados y diez adjuntos nuevos por lote; continuación firmada y acotada a la misma identidad, empresa, buzón y período.
- Originales de hasta10MB en la vía Gmail; para IMAP el mensaje MIME completo debe caber en10MB, incluida su codificación. La lectura IA conserva el límite existente de6MB por original. Un documento que excede un límite necesita revisión, sin éxito ficticio.
- Originales privados y deduplicación por las identidades y hashes existentes; no se reemplazan archivos ni se eliminan datos de clientes.
- Revalidación de la misma sesión/SID/MFA y permisos antes del proveedor, almacenamiento, registro y cada efecto IA. Los permisos SQL y RLS existentes siguen decidiendo el acceso.
- La ingesta utiliza `company-mail` y los RPC, reservas y registros existentes. Se conserva la trazabilidad del documento/actor; no se inventa un recibo duradero de consentimiento por buzón/periodo.
- Límite global IA10USD/mes y cien llamadas por empresa sin cambios. «Facturas analizadas» cuenta resultados aplicados, no consumo facturado tras una respuesta incierta.
- Sin cambios de SQL: se conservan las76 migraciones remotas y los53 archivos locales consolidados, incluida la76; no repetirlas ni editar sus bytes.

## Compatibilidad y límites externos

La nueva descarga utiliza la cuenta ya conectada y no exige otra vinculación Gmail empresarial ni el secreto OAuth empresarial que Google rechazaba. Esa integración anterior se conserva para compatibilidad; su diagnóstico y la verificación pública de Google siguen siendo cuestiones independientes.

Una compilación nueva exige la capacidad `connected_mailbox_import` versión1 y el consentimiento `2026-11-16`. Si falta, la importación queda deshabilitada y el uso básico del correo sigue disponible. Los clientes anteriores conservan los contratos de subida, reenvío y análisis existentes.

Las pruebas automatizadas usan el SDK publicado y servicios de correo/modelos ficticios bloqueando tráfico privado no previsto. La integración SQL utiliza PostgreSQL aislado en PGlite. No acreditan un buzón real, entrega de mensajes, evaluación pública Google, hardware ni una nueva aceptación de OpenAI. Se conserva la aceptación personal previa del titular y no se repite el consumo de la tarea37.

## Publicación y recuperación

Verificar la revisión, Deno, tipos, pruebas, compilación y CI antes de publicar. Guardar la fuente nativa previa de `company-mail`; desplegar primero el backend compatible y después la fuente de producción derivada de49, con su identidad real y un paquete verificado. Registrar los IDs devueltos por cada proveedor.

No desplegar el manifiesto DEMO de main como producción. Conservar Sites49,47,48 solo guardada y demo6. Si hace falta recuperar la interfaz, volver a49 manteniendo las76 migraciones; no eliminar columnas, documentos, factores MFA o datos. El servidor nuevo conserva compatibilidad con el cliente anterior. Si también necesita recuperación, restaurar la función previa guardada y comprobar sus barreras de autenticación. Una recuperación no borra originales importados correctamente.
