# Asistente de empresa por voz y texto

El Copiloto añade conversación con IA al análisis local y al asistente documental que ya existían. Se utiliza en **Copiloto → Tu asistente por voz y texto** dentro de la empresa activa. Cada mensaje obtiene contexto nuevo del servidor y solo de los módulos autorizados; el usuario puede consultar y preparar tareas con su rol actual. La cuenta global de administración no suplanta a los usuarios de empresa.

## Tareas conectadas

Se preparan altas y actualizaciones de camiones, conductores, ingresos, gastos, remolques, clientes, viajes, mantenimiento, combustible, vencimientos y alertas. Los importes son céntimos EUR y bases sin IVA, como en los registros existentes. El asistente pregunta los datos obligatorios que faltan: no completa con kilómetros, permisos o fechas inventados. Actualizar requiere un registro y versión de la empresa; los campos no solicitados se conservan.

El modelo **no ejecuta cambios**. Su respuesta genera como máximo tres propuestas por consulta. Cada tarjeta muestra los datos y, en una edición, sus valores anteriores. El usuario pulsa **Confirmar y guardar** o **Cancelar propuesta**. Las propuestas caducan a los treinta minutos. Un reintento de la misma tarea es idempotente, y una versión antigua nunca sobrescribe cambios de otro dispositivo. El resultado solo se presenta como guardado tras comprobar el estado del servidor.

El chat no borra datos, concede permisos, modifica precios/licencias, efectúa pagos, envía correo ni emite/firma/remite facturas fiscales. La configuración TicketBAI/AEAT y el emisor ELEVADANCOR de la suscripción siguen separados. Los registros contables ligados a una operación o factura revisada se gestionan desde su fuente y no se reescriben desde el chat. Guardar un viaje, mantenimiento o repostaje no duplica automáticamente su apunte contable: se conserva el flujo de contabilización existente.

## Activación y coste

Reutiliza **Copiloto** (`assistant`) y **Asistente IA: documentos y tareas** (`document_ai`), las habilitaciones `ai_allowed` y `ai_opt_in`, la licencia activa y los permisos de cada módulo. La administración mantiene su control por usuario y empresa; una cuenta de consulta puede preguntar, pero no guardar cambios. El consentimiento se puede activar o retirar dentro del asistente. No se elevan planes ni se habilitan usuarios reales mediante esta entrega.

Se utiliza la credencial backend existente, el modelo autorizado y el presupuesto global previo de **10 USD/mes antes de impuestos**, sin crear claves o contratar audio/Realtimes adicionales. Chat y consulta documental comparten la cuota existente de **100 llamadas mensuales por empresa**. Cada llamada reserva el máximo conservador antes de acceder al proveedor y liquida el uso conocido; un resultado incierto no libera saldo ni se reintenta automáticamente. Las consultas iniciadas tienen un identificador privado para recuperar su resultado sin facturar otra llamada. Se limita además el inicio a diez consultas por minuto y usuario.

El presupuesto interno controla las llamadas de TruckControl, no usos externos de la clave ni impuestos del proveedor. El modelo y su política de coste no se cambian. Los límites y la configuración global se comprueban también en servidor.

## Voz

**Dictar mensaje** utiliza Web Speech del navegador tras marcar su consentimiento y pulsar el control. El texto queda editable y se revisa antes de **Enviar al asistente**; no se envía al modelo automáticamente. **Escuchar respuesta** utiliza la síntesis del navegador. Su proveedor puede procesar audio o texto, tal como se informa en la interfaz y en Privacidad.

No se graba ni sube audio a OpenAI en este flujo. El micrófono y la lectura se cancelan al cambiar de usuario/empresa, perder permiso o conexión, ocultar la página o salir de la vista. Los callbacks tardíos se descartan. La disponibilidad depende del navegador y de su permiso de micrófono. Si no hay dictado compatible, siguen disponibles el texto y el micrófono del teclado del dispositivo. No es una llamada de audio continua ni una integración Realtime de pago. Las pruebas de interfaces de voz usan un navegador simulado; la aceptación de micrófono/altavoz físicos sigue pendiente.

## Datos, contexto y seguridad

El historial visible y el dictado se mantienen en memoria, fuera de WebStorage, copias offline y colas de sincronización. Al enviar se utilizan hasta veinte mensajes recientes y un máximo de 24 KB para el historial. El contexto nuevo se obtiene desde el backend: hasta cincuenta camiones, cien conductores y veinte registros por tipo adicional, priorizando coincidencias de la consulta entre los mil registros recientes. Se indican conteos y muestras parciales. Los totales mensuales EUR de los últimos doce meses se calculan en SQL sobre todos los apuntes autorizados de cada período, con base de devengo. No se simulan GPS ni velocidad.

Las respuestas y propuestas se conservan en tablas privadas para recuperación e historial de tareas, con autor, empresa, permiso inicial, versiones y plazo. No se promete una eliminación automática que no esté configurada. Su conservación/retirada se gestiona con la política y el procedimiento de datos de la plataforma; los registros de negocio y la auditoría existentes no se borran.

No se incluyen claves, tokens Gmail, cuerpos de correo ni documentos automáticamente. Los PDF/imágenes siguen utilizando la consulta documental explícita. OpenAI recibe únicamente el texto enviado y el contexto autorizado; `store=false`, sin herramientas externas, navegación o código. Los nombres, notas y conversación no cambian la política de permisos. Las respuestas se tratan como propuestas sujetas a revisión.

La nueva función `company-copilot` autentica con `getUser`; su cliente ligado al JWT invoca el RPC de la empresa activa. Los envoltorios públicos son invoker, los controladores privilegiados quedan en `private` con búsqueda fija y autorización expresa en cada ruta. Dos tablas privadas tienen RLS y no conceden DML directo a clientes. Las lecturas y tareas se restringen a usuario/empresa; se verifica correo, bloqueo, licencia, módulos y sesión vigente cuando el JWT aporta `session_id`. Una retirada de capacidad invalida la recuperación de respuestas previas y detiene nuevas confirmaciones.

La creación/finalización del turno es exclusiva de la función backend con `service_role`, nunca una operación del navegador. Ninguna respuesta del modelo permite llamar al ejecutor. El usuario confirma únicamente el identificador de una propuesta inmutable del servidor; no puede cambiar su payload por el del modelo o el navegador. Las relaciones, importes y validadores existentes permanecen, incluido el límite de camiones y la contabilización sin duplicados.

## Publicación y verificación

Disponible en https://truckcontrolai.com, **v31 / 0.5.19-rc.1**, fuente `2055e993fc8170ccdec1783368bffbbe80a50e9b`, despliegue `appgdep_6aee2e42428481918c4df3994c8664ee`. Entra con una cuenta de empresa autorizada, abre **Copiloto → Tu asistente por voz y texto**, concede el consentimiento opcional y escribe o dicta; revisa cada propuesta antes de **Confirmar y guardar**. La administración global conserva su función y no suplanta cuentas de empresa.

Migración local20261106150440 → remota20261106161253 aplicada una vez al proyecto exclusivo truckcontrol-ai: **59 migraciones**. SHA256 **6c66e584ebb510abde83b6d89b277d58fd75b98856c9aef0657963b9d98c258a**,35 SQL anteriores intactos. No editar ni repetirla. company-copilot v1 ACTIVE y sus seis fuentes verificadas; las siete funciones anteriores no cambian.

Código, fuente exacta y recibo previo pasan **1.031 controles por ejecución**:727 unitarias/SQL,32 Python,64 demo,50 empresas,118 SaaS,14 candidata,20 buildproducción y6 públicas. Las64 originales conservan once hashes; Deno2.9.6 correcto. El contrato SQL nativo con rollback comprueba aislamiento, permisos, versiones, caducidad, idempotencia y límite50, dejando cero fixtures de ese ensayo y los datos/planes/ajustes anteriores intactos.

El [ensayo HTTP real](verification/company-copilot-live-20261106.json) del06/11 a16:32 UTC pasa **25 comprobaciones**, entre ellas anónimo/origen ajeno/sesión falsa, aislamiento entre dos empresas, imposibilidad de acceder a credenciales o forjar respuestas, propuesta sin escritura automática, confirmación, reintento sin duplicados y sesión cerrada sin reutilización de JWT. Una sola llamada real con datos ficticios a gpt-6-luna:1.691 tokens de entrada,119 de salida y estimación0,001494 USD, liquidada. Una ficha de cliente versión1 y una auditoría human_confirmed. Ambas cuentas ficticias quedan suspendidas sin reactivación automática, bloqueadas hasta2126, IA retirada y cero sesiones. Registros y auditoría se conservan; los archivos privados temporales de credenciales se han retirado. No se ha repetido la llamada al recuperar el entorno.

**75 hashes HTTPS** coinciden:25 archivos en dominio principal,www y hostname técnico. La demo6 conserva su hash anterior. Sites devuelve un tar con empaquetado/digest distintos del gzip de entrada; se conserva el digest original y se verifica el contenido real servido. La [aceptación pública posterior](https://github.com/smartscaneuskadi/TruckControl-AI/actions?query=branch%3Arelease%2Fcompany-copilot-v31) exige `companyCopilot=true`, fuente, emisor, legales y vista fiscal en seis perfiles Android/Windows. Esos perfiles son emulados; micrófono/altavoz y dispositivos físicos siguen pendientes. Las API de voz automatizadas usan fixtures del navegador.

El asesor no añade incidencias; conserva el [aviso previo de protección de contraseñas filtradas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No se ha contratado un plan superior ni cambiado presupuesto, precios, cobros o configuración de proveedores.

## Recuperación

Se conservan producción30, sus fuentes y versiones anteriores, además de la demo6 y copias Git. Para volver a la interfaz anterior se despliega su versión guardada; no se borran tablas, turnos, propuestas, auditoría o usuarios. La fuente de31 permanece congelada; los recibos posteriores solo cambian documentación/inventario. Consulta el [recibo completo](verification/company-copilot-20261106.json) y el [contrato SQL reproducible](../supabase/tests/company-copilot-acceptance.sql). No activar licencias o repetir llamadas de prueba para comprobar la web.

Referencias consultadas: [salidas estructuradas de OpenAI](https://developers.openai.com/api/docs/guides/structured-outputs), [SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition), [SpeechSynthesis](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis) y [seguridad de datos de Supabase](https://supabase.com/docs/guides/database/secure-data).
