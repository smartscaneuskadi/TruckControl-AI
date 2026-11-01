# Gmail, documentos e inteligencia artificial

Las funciones se despliegan únicamente en el proyecto TruckControl `kkkemaycedexymrpaqtp`. FIXPilot y el prototipo pausado no aportan usuarios, archivos ni claves. La integración funciona dentro de las pantallas de TruckControl; la autorización a la cuenta se realiza en Google mediante OAuth oficial.

## Conexión por empresa

El propietario o administrador elige Conectar Gmail para la empresa seleccionada. El servidor valida identidad, rol, licencia y módulo antes de crear un estado de un solo uso, de diez minutos. Se utiliza PKCE y la finalización requiere al mismo usuario y empresa. Los códigos y tickets no se convierten en credenciales permanentes del navegador.

El retorno preparado para el nuevo cliente Google es **`https://truckcontrolai.com/gmail-callback`**. Debe coincidir exactamente con el cliente OAuth web y `company-gmail/index.ts`. Esa página elimina el código de la URL y lo entrega al backend propio de TruckControl; solo recibe un ticket de un uso. La finalización exige la sesión original, empresa y rol. Se conserva el origen autorizado de inicio y la empresa seleccionada, sin conceder permisos a partir de la caché del navegador. El callback GET anterior permanece en el backend para compatibilidad. [Configuración y estado del despliegue](MAIL_SETUP.md).

Una cuenta Gmail no se comparte silenciosamente entre empresas: `google_subject` es único. Para leer y sincronizar se usa `gmail.readonly`; no se envían correos ni se modifican mensajes. Conectar o desconectar exige propietario/administrador; un operador autorizado puede iniciar una lectura, y consulta solo lee estado.

El refresh token se cifra con AES-256-GCM, ligado a empresa y usuario, y se almacena fuera del esquema público. La clave AES y las credenciales OAuth existen únicamente como secretos del proyecto. No se incluyen en `VITE_`, en Git ni en los documentos exportados. Los estados, tokens y acciones internas no son accesibles a `anon` o `authenticated`.

## Lectura y revisión

La lectura manual consulta hasta 50 mensajes por página, una ventana de 30 días y hasta cinco adjuntos por mensaje; registra un máximo de diez documentos por ejecución. Los adjuntos PDF/JPEG/PNG/WebP se validan por firma y tamaño, hasta 10 MB. Se detectan duplicados por contenido y por mensaje/adjunto; la paginación se conserva. No hay importación programada activa.

La lectura IA de facturas está apagada por defecto. Si se autoriza, exige módulo global, licencia, autorización individual y consentimiento, con un límite de 100 intentos mensuales por empresa. El modelo no dispone de herramientas para escribir en la aplicación. La salida se valida como información no fiable: esquema, EUR, fechas, importes en céntimos, base e IVA. No se transforman abonos negativos en gastos positivos.

Cada factura requiere revisión humana. La aprobación SQL verifica empresa y camión, bloquea la fila y crea un único gasto por la base sin IVA. Repetir la aprobación devuelve el mismo apunte. Queda pendiente de pago hasta que una persona lo actualice. La autorización Gmail permite acceder a los adjuntos de facturas; no a permisos u otros documentos si la biblioteca está deshabilitada.

## Consulta de documentos

`company-assistant` permite preguntar por hasta tres documentos seleccionados, máximo 10 MB en total. Comprueba cada documento con la sesión del usuario antes de descargarlo o consumir cuota. Requiere `assistant`, `document_ai`, autorización y consentimiento. La cuota es de 100 consultas mensuales por empresa. Las respuestas no ejecutan acciones ni herramientas; las referencias solo pueden apuntar a los documentos elegidos. El resultado requiere revisión profesional.

El copiloto de demostración usa reglas locales para finanzas y mantenimiento, sin llamadas a un modelo. Los adjuntos de la biblioteca de prueba no se transmiten a IA.

## Configuración todavía necesaria

Las funciones `company-gmail` y `company-assistant` anteriores están desplegadas; la nueva configuración de Gmail se prepara en una rama independiente. **No se ha verificado OAuth Google real ni una llamada real a un modelo.** El titular ya creó Google Cloud «TruckControlAI», número `468881730124`; faltan confirmar Gmail API, cliente OAuth, secretos y revisión de Google. Las dos migraciones nuevas y el backend requieren el flujo de aprobación descrito en [MAIL_SETUP.md](MAIL_SETUP.md). No deben confundirse los ensayos SQL locales con una migración remota aplicada.

Los nombres de variables y valores desactivados están en `supabase/functions/.env.example`. Las claves de modelos y el modelo permitido requieren autorización antes de consumir servicios. El conector Gmail de ChatGPT no configura Gmail para los clientes de esta aplicación.
