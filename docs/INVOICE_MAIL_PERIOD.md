# Facturas de Gmail: período de recepción e IA

Publicado en **0.5.13-rc.2 / versión alojada 25** en https://truckcontrolai.com. El backend company-gmail v13 exige el filtro; sus siete fuentes coinciden con el código. Se conservan las versiones 24/23 y la demo 6. [Entrega y pruebas](verification/invoice-period-release-20261103.json).

## Uso en la empresa

1. Abrir **Correo y facturas**. La conexión de facturas de empresa utiliza el consentimiento Google de solo lectura existente. **Mi correo**, utilizado para leer y enviar mensajes personales, mantiene su conexión y sus permisos propios.
2. Conectar **Gmail de esta empresa**, si todavía no está vinculado. La gestión corresponde al administrador de la empresa; importar requiere escritura, licencia y módulo habilitados. La IA requiere además permiso de la cuenta y la aceptación **Usar lectura IA para mis facturas**.
3. Elegir **Últimos 30 días**, seleccionado por defecto, **Últimos 3 meses**, **Últimos 6 meses**, **Últimos 12 meses** o **Elegir fechas**. El intervalo siempre queda dentro de los últimos doce meses; no admite días futuros.
4. Pulsar **Importar facturas**, revisar empresa, fechas y estado de IA y confirmar. Cancelar no consulta Gmail ni inicia consumo. Se guardan como máximo diez adjuntos nuevos por pasada, con un máximo de cincuenta mensajes examinados. Si quedan mensajes, repetir la importación con el mismo período continúa la búsqueda.
5. Revisar cada propuesta y su original antes de registrar el gasto. La contabilización, los importes y las autorizaciones existentes no cambian.

Las fechas incluyen ambos días completos, según la hora de Madrid. Se respeta el cambio de hora y el año bisiesto. El máximo comprende doce meses naturales hasta el final del día actual; los mensajes con fecha futura se excluyen también por su instante exacto.

## Qué fecha controla la lectura

El filtro utiliza **la recepción real de Gmail (`internalDate`)**, no la fecha de emisión impresa en la factura ni la cabecera `Date` del mensaje. Por ejemplo, una factura emitida hace meses pero recibida hoy entra en el período actual. Los filtros de la bandeja de facturas siguen usando la fecha de la factura y tienen otra finalidad.

La búsqueda solicita adjuntos de mensajes candidatos que contienen «factura» o «invoice» y excluye enviados y borradores. Primero se solicita únicamente la fecha y las etiquetas del mensaje. Una recepción ausente, inválida, futura o fuera del período impide descargar el contenido completo y sus adjuntos. Se vuelve a comprobar la fecha del mensaje completo antes del archivo y de cualquier llamada IA. La búsqueda usa segundos Unix para evitar que Gmail interprete las fechas en horario del Pacífico.

El análisis recibe solo los originales candidatos autorizados y conserva la revisión humana. El filtro no certifica por sí solo que cada adjunto sea una factura; los campos inciertos quedan para completar. Los originales de hasta 10 MB se conservan; la IA mantiene su máximo anterior de 6 MB.

El período limita la exploración del buzón para importar facturas. No elimina originales ni gastos existentes. La revisión explícita de documentos guardados y las consultas documentales mantienen sus permisos anteriores.

## Seguridad, cuotas y compatibilidad

El servidor valida las fechas después de sesión, empresa, rol y módulo, y antes de credenciales, bloqueo de importación, descarga o IA. El navegador no puede ampliar el máximo ni desactivar el filtro. La entrada desplegada exige `enforceReceivedPeriod: true`, también para solicitudes antiguas `sync` sin selector: reciben treinta días por defecto. La configuración del constructor conserva el contrato del SDK anterior para sus consumidores existentes; esa configuración heredada no se utiliza en producción.

El estado autenticado anuncia `received_period_policy` y la operación `sync_period`. La interfaz exige esta capacidad y utiliza esa acción: ante un servidor antiguo se bloquea o se rechaza la petición, en lugar de aplicar silenciosamente otro período. No se amplían roles, RLS o licencias. La identidad de empresa acompaña a la confirmación y esta se descarta al cambiar de cuenta o empresa.

La página de continuación queda asociada a las fechas y zona del período en la columna privada existente. Cambiar de período, recibir un cursor heredado o encontrarse uno inválido reinicia de forma segura. El cursor no se devuelve al navegador. Los archivos ya guardados se reconocen con las identidades y hashes existentes antes de solicitar IA. No hay nuevas tablas ni migraciones.

Se conserva el proveedor IA y el presupuesto global aprobado de **10 USD/mes antes de impuestos**, sin recargas automáticas. Las cuotas y los permisos individuales se comprueban en el backend. No se han realizado llamadas nuevas al modelo, lecturas de buzones reales ni envíos de mensajes durante el desarrollo de este filtro.

## Verificación y recuperación

Pasan 624 pruebas unitarias/SQL, TypeScript, compilación y los once hashes de las 64 pruebas originales. Los 26 recorridos de empresas pasan en Android y Windows emulados, con fechas, cancelación, período máximo, cambio de tema sin perder selección y bloqueo ante un servidor anterior. Se revisan contraste y anchura de la nueva interfaz y de su confirmación en Fleet Light/Cockpit. No equivale a aceptación en dispositivos físicos.

El titular confirmó por separado que **Mi correo funciona y ha enviado un mensaje real**. Es una aceptación comunicada por él, no una inspección automatizada de su buzón ni una acreditación del conector empresarial de facturas. [Registro](verification/personal-mail-owner-acceptance-20261103.json). La verificación pública de Google para todos los clientes sigue pendiente.

Antes del despliegue se conserva `company-gmail` v12 y un bundle completo del código en `/workspace/artifacts/truckcontrol-invoice-period-20261103/`. La vuelta de la interfaz a v23 no requiere borrar datos o migraciones: conviene mantener el servidor con el filtro obligatorio. Una interfaz nueva contra un servidor anterior no inicia `sync_period`. Las versiones alojadas anteriores y la demo separada se conservan.
