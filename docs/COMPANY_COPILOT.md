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

## Verificación y recuperación

Migración local **20261106150440_universal_company_copilot.sql** → remota **20261106161253**, aplicada una sola vez al proyecto `truckcontrol-ai / kkkemaycedexymrpaqtp`; **59 migraciones remotas**. SHA256 **6c66e584ebb510abde83b6d89b277d58fd75b98856c9aef0657963b9d98c258a**. Los 35 SQL anteriores conservan sus hashes. No editar ni repetir la migración.

727 pruebas unitarias/SQL, 118 recorridos SaaS y la comprobación Deno 2.9.6 pasan localmente. Las 64 pruebas originales permanecen intactas en sus once hashes. El ensayo nativo del 06/11 a las 16:13:34 UTC comprueba aislamiento, propuestas sin escritura automática, idempotencia, versiones, caducidad, retirada de consentimiento/capacidades, rol de consulta, actor bloqueado, límite de cincuenta camiones, RLS y ausencia de cambios en datos/planes/ajustes anteriores. Termina con rollback: cero identidades/empresas/turnos/propuestas de la prueba. No hay avisos nuevos del asesor: conserva el aviso previo de protección de contraseñas filtradas.

[Contrato reproducible de aceptación](../supabase/tests/company-copilot-acceptance.sql) y [evidencia](verification/company-copilot-20261106.json). La aceptación con una llamada real sobre datos exclusivamente ficticios, la verificación de fuentes del backend y el recibo de publicación se registran por separado al completarse. Hasta entonces la producción30 y demo6 permanecen vigentes.

Para recuperación se conserva la versión web anterior y la copia de código. No eliminar tablas, propuestas, auditoría ni usuarios para volver a la interfaz anterior. Las sesiones sintéticas utilizadas en una futura aceptación HTTP deben cerrarse y las cuentas suspenderse, conservando la trazabilidad; no tocar las identidades sintéticas históricas.

Referencias consultadas: [salidas estructuradas de OpenAI](https://developers.openai.com/api/docs/guides/structured-outputs), [SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition), [SpeechSynthesis](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis) y [seguridad de datos de Supabase](https://supabase.com/docs/guides/database/secure-data).
