# Activación de IA y recepción de facturas

Continuación de 0.5.2-rc.1, rama `feat/ai-receiver-activation`, preparación 0.5.3-rc.1. La candidata pública 8 y la demo estable se conservan. Preparar código o encontrar una clave no significa activar consumo ni abrir producción.

## Credencial de OpenAI

El titular informa de una clave llamada «my test key» y autoriza usar IA. El nombre no permite recuperar el valor de una clave creada manualmente. No se crea otra clave ni se modifica la anterior.

Al verificar el proyecto exclusivo `kkkemaycedexymrpaqtp`, Vault aún contiene solo los tres secretos anteriores de Google/Gmail. La clave nueva no aparece bajo `truckcontrol_openai_api_key`. Se pide localizar proyecto y sección, sin solicitar valores ni capturas de claves. El backend nuevo admite también `OPENAI_API_KEY` o `truckcontrol_openai_api_key` de los secretos de funciones. Ninguna comprobación devuelve el valor.

La migración nueva prepara los campos pendientes sin reemplazar secretos existentes. El lector público es `SECURITY INVOKER`, exclusivo de `service_role`, y llama a un lector privado limitado a nombres concretos. No otorga lectura general de Vault ni acceso de clientes al proveedor.

`GET /functions/v1/company-assistant/health` expone únicamente `configured` y `enabled`. Son disponibilidad de configuración y política, no una prueba de crédito, validez de la clave o respuesta del modelo. Las consultas documentales siguen autenticadas y limitadas por RLS, empresa, rol, servicios y consentimiento.

## Consumo controlado

- Modelo preparado: `gpt-6-luna`, con tarifa estándar forzada, almacenamiento desactivado, sin herramientas y hasta 1.200 tokens de salida.
- Precio estándar publicado el 01/11/2026: 0,10 USD por millón de tokens de entrada y 1,00 USD por millón de salida. Hay suplementos de contexto largo, caché y región. Fuente: [modelo](https://developers.openai.com/api/docs/models/gpt-6-luna) y [tarifas](https://developers.openai.com/api/docs/pricing).
- **Estado inicial: deshabilitado y presupuesto cero.** La autorización genérica de contratar no fija un presupuesto ilimitado. Un importe concreto debe quedar aprobado antes de abrir el consumo.
- Se reserva un máximo conservador de 1,00 USD antes de cada petición. Se mantiene si hay un timeout o una respuesta perdida; no se reintenta automáticamente una llamada facturable.
- Con uso confirmado se calcula una estimación superior conservadora y se libera el resto de la reserva. La estimación interna no es la factura del proveedor. No se almacenan prompts ni cuerpos de documentos en el registro de uso.
- El presupuesto es global para la plataforma, compartido entre empresas; no puede gastarse de nuevo en cada empresa. Se conservan las cien lecturas/consultas mensuales por empresa y los permisos/consentimientos existentes.
- Cuota y dinero se reservan en una misma transacción. Los suplementos documentados caben en la reserva; los cambios de modelo/tarifa requieren revisar la política. El límite controla llamadas hechas por TruckControl, no usos ajenos de la clave o impuestos del proveedor.

La única llamada de modelo permitida es `https://api.openai.com/v1/responses`, sin redirecciones. El backend no puede usar este adaptador para navegar a un enlace de una factura ni activar herramientas con costes separados.

## Lectura de facturas

Después de guardar un documento de correo/archivo, se puede solicitar la lectura solo si el backend está habilitado y la cuenta tiene permiso y consentimiento. La reserva se liga a empresa, usuario y factura. Un fallo del proveedor no elimina el original, no provoca una segunda subida y permite completar los campos manualmente.

Los resultados se validan con el mismo lector de facturas existente. Se conserva `needs_review`, sin crear movimientos financieros. La aprobación humana anterior sigue siendo la única que registra el gasto. El resultado IA no puede sobrescribir una factura ya aprobada ni una factura de otra empresa. Gmail y asistente documental usan el mismo presupuesto, sin sustituir OAuth o el acceso RLS a documentos.

## Receptor Resend

Se prepara un adaptador del contrato oficial `email.received` a la entrada existente `company-mail`. No equivale a leer el buzón completo de un cliente. Cada empresa conserva su dirección emitida y solo recibe lo reenviado a esa dirección.

La [tarifa oficial](https://resend.com/pricing) ofrece un plan gratuito de **3.000 correos mensuales y 100 diarios**, compartidos por toda la cuenta, con un endpoint de webhook. Es una opción de piloto; no se da de alta un plan de pago, un extra o pay-as-you-go. Puede usarse el subdominio receptor `resend.app` de la cuenta sin cambiar los MX de Migadu, el DNS raíz ni DNSSEC.

El adaptador:

1. Rechaza peticiones de navegador y verifica firma Svix y antigüedad antes de procesar el evento. Usa `svix` 2.9.1 fijado; esa versión verifica y devuelve `void`, así que el JSON se lee después de verificar.
2. Resuelve un único destinatario emitido, con empresa/licencia/usuario habilitados, antes de consultar el proveedor. Ignora destinatarios no emitidos o ambiguos.
3. Recupera metadatos desde la API fija de Resend y comprueba ID y destinatario antes de descargar el original.
4. Solo admite originales HTTPS bajo la ruta de recepción del CDN del proveedor. No sigue redirecciones ni envía la clave API al CDN; limita bytes reales y tiempo.
5. Entrega el EML a la entrada firmada existente dentro del mismo proceso. Reutiliza reservas, deduplicación, cuotas, archivos privados y revisión de gastos.

Secretos previstos en Vault: `truckcontrol_resend_api_key`, `truckcontrol_resend_webhook_secret` y `truckcontrol_mail_ingress_signing_key`. El HMAC interno se genera en servidor solo si no existe; no reutiliza ni rota AES de Gmail. La firma del proveedor y la interna son independientes.

El receptor queda cerrado hasta configurar cuenta gratuita, credenciales, dominio, webhook, pruebas de entrega y el interruptor autorizado. Los webhooks genéricos anteriores configurados expresamente mediante variables de entorno mantienen su configuración.

No se encontró un conector administrativo Resend/Mailgun/Postmark disponible. El navegador privado no tiene una sesión Resend confirmada. La conexión requiere el flujo oficial del titular; no se usan Gmail/Outlook personales de ChatGPT como receptor multiempresa ni se repiten accesos Supabase fallidos.

## Migración, recuperación y validación

Migración CLI nueva: `20261101191806_ai_provider_and_receiver_runtime.sql`. En este punto es local; el inventario remoto anterior tiene 43 migraciones. Se debe verificar historial antes de aplicarla una sola vez. No usar `db push` sobre las versiones históricas distintas. No se modifica FIXPilot.

La reversión operativa consiste en deshabilitar IA/recepción y restaurar las versiones anteriores de funciones. Las tablas aditivas y registros de uso se conservan: no se borran para recuperar un despliegue. Una reserva de gasto desconocido tampoco se elimina para hacer pasar una prueba.

Validación local: 291 unitarias/SQL, incluidas 35 nuevas, TypeScript, compilación PWA, Deno en cuatro entradas y auditoría de producción sin vulnerabilidades. Se conservan las 64 originales mediante once hashes. Las pruebas cubren firmas reales de la biblioteca, límites, aislamiento, consentimiento, cuotas concurrentes, liquidaciones repetidas, respuesta perdida, importación sin contabilizar y preservación de una factura confirmada. Las pruebas usan datos y claves ficticios, no consumen IA ni acreditan entregas, créditos o dispositivos físicos reales. El CI completo y los informes remotos determinan el siguiente estado efectivo.
