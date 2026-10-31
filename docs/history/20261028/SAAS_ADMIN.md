# Registro, prueba, planes y administración

## Destino solicitado actualmente

El destino solicitado es un proyecto nuevo **truckcontrol-ai** en **fixpilot-dev**, completamente separado de FIXPilot. Todavía no se ha creado: la cuenta tiene sus dos proyectos gratuitos activos. Además, la revisión automática de una aplicación de índices al prototipo no pudo completarse por límite de uso de ChatGPT; esa operación no se ejecutó.

El trabajo de configuración anterior realizado, con autorización, en **merymery_16** se conserva como prototipo. No se han borrado sus tablas, funciones ni datos. La configuración pública de ese prototipo se ha separado de la compilación `release`; no se reutilizan sus credenciales para el futuro proyecto nuevo. Los pasos y comprobaciones sobre merymery_16 descritos debajo corresponden a ese prototipo, no a un proyecto nuevo ya creado.

El código y las migraciones están preparados para instalarse desde cero en el destino nuevo. Una posible forma de liberar una plaza gratuita es pausar únicamente el prototipo merymery_16, conservando sus datos; esa pausa no se ha ejecutado. FIXPilot no debe pausarse ni modificarse.

## Entrega y servicios

El prototipo utiliza, por autorización anterior del propietario, el proyecto Supabase **merymery_16** (`crcdrxbioyberfibrzuw`) de la organización `fixpilot-dev`. No comparte base de datos, Auth, Storage ni claves con FIXPilot. Se conservaron las cinco tablas iniciales y sus tres filas de planes; las tablas nuevas de TruckControl y sus políticas se añadieron mediante migraciones.

El nombre interno de la aplicación es **TruckControl AI**. El prototipo mantiene el nombre visible merymery_16. La conexión disponible no ofrece renombrar proyectos y la API de gestión directa devolvió 401; no se ha presentado un cambio de nombre como si estuviera ejecutado. La solicitud actual se atenderá creando un destino nuevo cuando haya una plaza y pueda completarse la revisión automática.

La compilación comercial utiliza `.env.release.local` (ignorado por Git), que requiere URL y clave publicable del destino confirmado y `VITE_COMMERCIAL_MODE=true`. Actualmente sus credenciales están vacías, pendientes del proyecto nuevo. Esa compilación permite revisar los planes y navegar a la demo; el envío del registro está deshabilitado y explica que el acceso está pendiente. Una compilación sin esa opción mantiene la entrada anterior y sus pruebas sin servicios reales.

## Entrada y solicitud de cuenta

La entrada muestra los planes antes del registro: **Limitado 300 €/mes** y **Full 900 €/mes** como ejemplos editables. Limitado incluye la gestión esencial y un límite inicial editable de 50 camiones; Full incluye documentos, Gmail y copiloto, con lectura IA opcional. Los importes se conservan en céntimos y no se redondean si tienen decimales. Los precios siguen marcados como ejemplos y no pueden generar cobros.

La solicitud recoge nombre de contacto, empresa, NIF/CIF, dirección fiscal, correo, teléfono con prefijo y plan de interés. Se crea una cuenta Auth con confirmación de correo obligatoria. Los datos de contacto se guardan como datos de registro; `user_metadata` nunca concede permisos, plan pagado, rol administrador ni fechas de prueba.

Después de confirmar el correo se verifica el teléfono con un SMS. La aplicación solicita un código de cambio de teléfono a Supabase Auth y lo valida mediante `verifyOtp(type='phone_change')`. Se evita repetir el envío automático en StrictMode y se conservan los límites de Auth. Las pruebas interceptan esas solicitudes; no se han enviado mensajes reales.

**SMS está desactivado en el proyecto real.** `tc_settings.sms_ready=false` impide solicitar mensajes desde la app y muestra que la activación está pendiente. No se omite la verificación ni se inicia la prueba mientras falta ese servicio. Antes de habilitarlo se necesita proveedor, credenciales, autorización de costes y límites de envío. No hay números de prueba aceptados como si estuvieran verificados.

## Creación automática y diez días

El trigger de `auth.users` crea el cliente y su empresa al confirmar correo y teléfono, siempre que el teléfono confirmado coincida con el solicitado y los datos sean válidos. También existe un RPC idempotente de finalización para recargar el estado desde la app.

La prueba dura exactamente diez días desde la activación, según el reloj del servidor, y ofrece el plan Full. Actualizar metadatos, repetir una solicitud o crear otra empresa no reinicia la prueba. Suspender y reanudar una cuenta tampoco modifica sus fechas. Al expirar, la cuenta puede consultar y solicitar su plan, pero pierde acceso a los datos de flota y las escrituras; los datos se conservan.

Las políticas RLS comprueban el acceso en cada solicitud. Los módulos de gestión también se comprueban al escribir, y los permisos de Gmail/IA se comprueban en la función de servidor. La interfaz consulta el estado al cambiar de foco y periódicamente, sin utilizar el reloj del dispositivo para autorizar.

## Cuenta administradora

La cuenta raíz está reservada a **pedidos@smartscaneuskadi.com**. Solo se asigna el rol tras confirmar ese correo en Auth. No se ha creado una contraseña ni enviado una invitación real. No se concede administración al primer usuario ni a un campo de metadatos. La cuenta raíz entra tras confirmar el correo para poder administrar la plataforma antes de que exista un proveedor SMS para clientes.

El panel permite:

- Consultar clientes activados y solicitudes pendientes de verificación.
- Suspender o reanudar cuentas, conservando las fechas y los datos.
- Desactivar módulos globalmente y establecer excepciones por usuario.
- Permitir o denegar lectura IA a cada usuario.
- Editar planes, precios, límites de nuevos camiones y módulos incluidos.
- Mantener los precios como ejemplos y los cobros desactivados.
- Registrar, cuando los precios sean definitivos, un pago previamente comprobado.
- Consultar la actividad administrativa.

El panel administra permisos y suscripciones; no da acceso general a las fichas o documentos privados de las empresas. Las consultas de negocio siguen limitadas al propietario de cada empresa. Los datos básicos pueden alimentar el panel y la rentabilidad aunque se desactive una pantalla de gestión; desactivar una pantalla bloquea su ruta y sus acciones de escritura.

## IA opcional

Para extraer una factura deben cumplirse todos estos requisitos: cuenta vigente, módulo global habilitado, permiso individual del administrador, consentimiento del usuario y proveedor configurado en el servidor. Una clave API existente por sí sola no activa la lectura. El módulo global está desactivado y `INVOICE_AI_ENABLED` permanece apagado por defecto.

La preferencia del cliente aparece en Facturas Gmail. El administrador puede revocar su permiso sin modificar otros usuarios. Se conservan los límites anteriores de cien intentos de extracción por empresa/mes y diez adjuntos por importación. Son límites de uso, no una garantía de importe máximo en euros; se necesita acordar presupuesto antes de activar el proveedor.

## Gmail dentro de TruckControl

La conexión se inicia y gestiona desde Facturas Gmail dentro de la empresa. Google muestra obligatoriamente su pantalla de consentimiento OAuth; no se solicitan contraseñas del buzón ni se usa la conexión Gmail de ChatGPT como buzón compartido. Cada empresa tiene su propia autorización y sus adjuntos privados.

La función está desplegada en el prototipo, pero faltan cliente OAuth de Google, secreto y clave de cifrado. La app indica que Gmail está pendiente de configuración. Para el proyecto nuevo se configurará su propia URL de callback después de conocer su referencia; no se debe copiar la URL del prototipo. No hay sincronización programada activa. Los documentos importados requieren revisión antes de crear un gasto.

## Planes y pagos

Un cliente puede solicitar un plan desde su cuenta, incluso tras expirar la prueba. La solicitud congela importe, moneda y revisión del plan; no activa acceso ni realiza un cargo. Solo el servidor puede confirmar un pago. Los precios de ejemplo impiden tanto iniciar un checkout real como registrar manualmente un cobro real.

El adaptador opcional de Stripe crea un pago por **un mes de acceso**, no una renovación automática de tarjeta. Solo usa el precio del pedido del servidor y una clave de idempotencia estable. El webhook verifica HMAC, fecha, estado pagado, EUR, usuario, pedido e importe. Un retorno del navegador nunca activa un plan. Los eventos repetidos y los pagos manuales repetidos no duplican la activación. Pagar durante la prueba conserva los días Full restantes.

Stripe todavía no está conectado, no se han creado productos externos y no hay claves ni webhook configurados. `payments_enabled=false` y `prices_are_examples=true`. La función de cobros está desplegada y devuelve que falta configuración si se intenta usarla sin proveedor. Se podrá habilitar después de confirmar precios, condiciones, proveedor y costes; no se han contratado servicios ni procesado pagos.

## Estado comprobado y pendientes

- Migraciones aplicadas únicamente a `crcdrxbioyberfibrzuw`; control comercial del servidor habilitado.
- Asesor de seguridad de Supabase sin incidencias tras el endurecimiento. Los auxiliares antiguos de talleres conservan su comportamiento mediante envoltorios sin privilegios.
- Aislamiento de dos empresas, suspensión y cuenta raíz comprobados en PostgreSQL real con usuarios ficticios dentro de una transacción revertida. Cero usuarios de prueba permanecen en Auth.
- Catálogo público comprobado por HTTP: devuelve diez días y precios de ejemplo. Administración, Gmail y cobros rechazan HTTP sin sesión.
- `company-gmail` y `truckcontrol-billing`, versión 1, desplegadas con autenticación propia; OAuth, cobros e IA reales no activados.
- Sigue pendiente comprobar entrega real de correo, URL de redirección permitida y configuración de autenticación del proyecto. Los archivos locales de configuración no cambian automáticamente los ajustes hospedados.
- SMS, Google OAuth, Stripe y OpenAI requieren sus accesos y autorización de costes cuando corresponda. No se han probado envíos, lectura de buzones ni pagos reales.
- Sites mantiene su audiencia privada anterior. Abrir el portal a clientes externos requiere decidir y autorizar esa publicación cuando los servicios estén preparados.
- Crear el destino nuevo requiere una plaza gratuita disponible. Los ajustes hospedados de Auth necesitan acceso de gestión que el conector actual no expone. No se solicitan tokens ni contraseñas por el chat.

La verificación física final de Windows/Android queda para cuando esas integraciones estén configuradas. El agente sigue ejecutando sus pruebas automatizadas sin pedir comandos al propietario.
