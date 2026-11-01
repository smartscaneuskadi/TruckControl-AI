# Activación de IA y recepción de facturas

Continuación de 0.5.2-rc.1, rama `feat/resend-api-bootstrap`, PR #15, preparación 0.5.3-rc.1. La candidata pública 8 y la demo estable se conservan. Preparar código o encontrar una clave no significa activar consumo ni abrir producción.

## Credencial de OpenAI

El titular informa de una clave llamada «my test key» y autoriza usar IA. El nombre no permite recuperar el valor de una clave creada manualmente. No se crea otra clave ni se modifica la anterior.

El backend desplegado del proyecto exclusivo `kkkemaycedexymrpaqtp` **ya detecta la clave en los secretos de funciones**: tras la aprobación del presupuesto, salud HTTPS `configured=true`, `enabled=true`. Vault conserva un campo pendiente, pero no es necesario volver a copiar ni crear la clave. Se admiten `OPENAI_API_KEY` y `truckcontrol_openai_api_key`, sin que un alias inválido oculte otro válido. Ninguna comprobación devuelve su valor. Tres respuestas reales verifican su uso; no se ha consultado el saldo del proveedor.

La migración nueva prepara los campos pendientes sin reemplazar secretos existentes. El lector público es `SECURITY INVOKER`, exclusivo de `service_role`, y llama a un lector privado limitado a nombres concretos. No otorga lectura general de Vault ni acceso de clientes al proveedor.

`GET /functions/v1/company-assistant/health` expone únicamente `configured` y `enabled`. Son disponibilidad de configuración y política, no una prueba de crédito, validez de la clave o respuesta del modelo. Las consultas documentales siguen autenticadas y limitadas por RLS, empresa, rol, servicios y consentimiento.

## Consumo controlado

- Modelo preparado: `gpt-6-luna`, con tarifa estándar forzada, almacenamiento desactivado, sin herramientas y hasta 1.200 tokens de salida.
- Precio estándar publicado el 01/11/2026: 0,10 USD por millón de tokens de entrada y 0,50 USD por millón de salida. Hay suplementos de contexto largo, caché y región. Fuente: [modelo](https://developers.openai.com/api/docs/models/gpt-6-luna) y [tarifas](https://developers.openai.com/api/docs/pricing).
- **Estado inicial: deshabilitado y presupuesto cero.** La autorización genérica de contratar no fija un presupuesto ilimitado. Un importe concreto debe quedar aprobado antes de abrir el consumo.
- **Estado vigente aprobado por el titular: habilitado, 10 USD/mes antes de impuestos del proveedor**, sin recarga automática. El titular respondió «correcto» a la solicitud concreta; se habilitan los módulos de correo y lectura IA por la administración normal. Se mantienen autorización individual, consentimiento, roles, planes y RLS; no se abre el registro público.
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

**Estado vigente:** la API de Resend acepta la clave de Vault. Dominio `facturas.truckcontrolai.com` y sus cinco DNS verificados, webhook único activo y firma guardada. Se reciben tres correos ficticios en dos empresas; deduplicación, IA opcional y originales privados pasan. [Informe](verification/resend-live-acceptance-20261101.json). No volver a pedir login, clave ni guardado de perfil. Los conectores personales de ChatGPT no se usan como credenciales multiempresa.

## Migración, recuperación y validación

Migración CLI `20261101191806_ai_provider_and_receiver_runtime.sql` **ya aplicada una sola vez**, versión remota `20261101194201`: 44 migraciones. La correspondencia y SHA están en `deployment/recovered-migrations.json`; no repetirla ni usar `db push` sobre las versiones históricas distintas. No se modifica FIXPilot.

Funciones desplegadas y comparadas archivo por archivo con el commit `ceff63d64e59da5aae3ffebb7663eade410a8f76`: `company-assistant` v9, `company-gmail` v10, `company-mail` v9 y `company-mail-resend` v1. La autenticación JWT se valida dentro de las funciones; el receptor exige la firma del proveedor. Esas versiones corresponden a la aceptación anterior. Las vigentes son company-mail v10 y company-mail-resend v3, comparadas con sus ocho y nueve archivos. La recepción está habilitada y probada; la IA conserva el límite aprobado. [Evidencia anterior a la aprobación](verification/ai-provider-backend-20261101.json) y [aceptación real vigente](verification/ai-provider-live-acceptance-20261101.json).

La reversión operativa consiste en deshabilitar IA/recepción y restaurar las versiones anteriores de funciones. Las tablas aditivas y registros de uso se conservan: no se borran para recuperar un despliegue. Una reserva de gasto desconocido tampoco se elimina para hacer pasar una prueba.

El [CI del commit exacto](https://github.com/smartscaneuskadi/TruckControl-AI/actions/runs/41343043038) pasa **450 comprobaciones**: 291 unitarias/SQL, incluidas 35 nuevas; 23 Python; 64 demo; 22 empresas; 30 SaaS; 14 candidata y seis recorridos de la publicación v8. TypeScript, compilación PWA, Deno de cuatro entradas y auditoría de producción sin vulnerabilidades. Se conservan las 64 originales mediante once hashes.

Las pruebas cubren firmas reales de la biblioteca, límites, aislamiento, consentimiento, cuotas concurrentes, liquidaciones repetidas, respuesta perdida, importación sin contabilizar y preservación de una factura confirmada. Además pasan 22 comprobaciones HTTP reales con TLS y una prueba PostgreSQL remota de permisos con rollback: clientes sin acceso a configuración, registros o presupuesto; ningún usuario, empresa ni llamada IA creados; AES de Gmail intacto y asesor de seguridad sin incidencias. [Prueba SQL](verification/ai-provider-disabled-rollback.sql). Las pruebas usan datos y claves ficticios, no consumen IA ni acreditan entregas, créditos o dispositivos físicos reales.

Después de la aprobación pasan **19 comprobaciones autenticadas reales** con dos empresas ficticias: inicio de sesión por contraseña, disponibilidad de módulos, rechazo entre empresas, secreto inaccesible, original privado intacto, duplicado sin otra llamada, factura pendiente de revisión y asistente con cita del documento. El modelo extrae 20.000 céntimos netos, 4.200 de IVA y 24.200 totales; no se crea ningún movimiento financiero. Las dos llamadas quedan liquidadas, sin reservas de coste desconocido; estimación superior interna conjunta 628 micro USD (0,000628 USD), no una factura de OpenAI.

Las confirmaciones de Auth de estas cuentas se preparan como fixtures sintéticos: **no prueban entrega de correo ni verificación del administrador real**. Al terminar se suspenden y bloquean las dos cuentas, se procesó su cierre de sesión y se eliminaron las credenciales temporales. Una inspección posterior observó filas antiguas de sesión; las cuentas permanecen bloqueadas/suspendidas y no se afirma cero sesiones globales. Quedan los registros ficticios, original privado y uso de IA para conservar la auditoría y sus relaciones. Se comprueba de nuevo el rechazo tras la suspensión. También pasa la prueba remota positiva de correo con rollback, ahora que el titular ha autorizado habilitar el servicio; no se cambian controles solo para hacerla pasar.

El titular aprueba el máximo acumulado de 2 USD de automatización, incluyendo lo anterior y sin recargas, y Resend Free a 0 USD. La API funciona y no se requiere más navegador. No se contratan planes de pago ni se abre registro o cobros.

## Recepción real comprobada

Migraciones adicionales, aplicadas una vez: local `20261101203215` → remota `20261101204442`, local `20261101205354` → remota `20261101205705`. Total 46; los SHA y la correspondencia están guardados. La configuración privada reutiliza dominio/webhook existentes, guarda la firma sin devolverla y no puede ejecutarse desde clientes ni service_role. No activa servicios por sí sola.

La clave Svix real de Resend decodifica a 24 bytes: el validador admite base64 canónico de 24–64 bytes. El original llega en el host exacto `cdn.resend.app`, ruta `/receiving/raw/`, con caducidad, límite de tamaño, HTTPS y sin redirecciones. No se envía la API key al CDN ni se guarda el enlace firmado en informes. Un primer fallo 502 permitió detectar y corregir esa incompatibilidad; el proveedor completó el reintento.

Tres mensajes ficticios producen tres recibos completos y dos facturas en empresas distintas. La repetición A no duplica original/factura/IA; A extrae 20.000/4.200/24.200 céntimos y B sin IA mantiene campos vacíos. Ambas quedan para revisión, sin movimientos financieros. Pasan 15 aserciones RLS/Storage/RPC sobre los archivos recibidos. Después se suspenden/bloquean las dos nuevas identidades y se deshabilitan sus buzones; no tenían sesiones. No se borran documentos ni auditoría. Tres llamadas IA totales liquidadas, estimación superior 925 micro USD y reserva desconocida cero.

Los cinco registros DNS se añadieron conservando los 27 existentes; ningún MX raíz, DNSSEC ni buzón Migadu se cambió. La extensión HTTP administrada pertenece a supabase_admin: sus permisos SQL PUBLIC no pudieron retirarse, pero extensions/private no se exponen en Data API y los ayudantes propios no tienen permisos para clientes. Un WARN previo de protección contra contraseñas filtradas sigue pendiente; no activar un plan de pago para resolverlo sin aprobación. [Estado y límites completos](verification/resend-live-acceptance-20261101.json).

El CI exacto `b1d47e07a78c05437a194c441346ab685e750f17`, run [41352158854](https://github.com/smartscaneuskadi/TruckControl-AI/actions/runs/41352158854), pasa 479 comprobaciones (311 unitarias/SQL, 32 Python, 64 demo, 22 empresas, 30 SaaS, 14 candidata y seis públicas). Se revisaron los logs; las 64 originales conservan once hashes.
