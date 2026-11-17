# Revisión opcional de facturas desde Correo

Esta ampliación está publicada y verificada en **Sites51 /0.5.32-rc.1**, en https://truckcontrolai.com. Se conservan las76 migraciones, los datos, planes y límites de IA. [Recibo de pruebas y publicación](verification/mail-automation-published51-20261117.json).

## Uso

1. Entrar en una empresa con permisos y conectar el buzón en **Correo** mediante el acceso oficial de Google o el formulario IMAP/SMTP con TLS.
2. Elegir esa cuenta y pulsar **Descargar facturas del correo por IA**. Conectar correo por sí solo no autoriza a la IA.
3. Revisar empresa y fechas: últimos 30 días por defecto y, como máximo, los últimos 12 meses. Para la revisión periódica el período debe terminar hoy.
4. Marcar **Revisar facturas automáticamente mientras uso TruckControl**, leer la autorización específica y aceptarla. La casilla empieza desmarcada. Pulsar **Activar revisión automática**.
5. Consultar el estado y los originales privados guardados. **Detener revisión automática** afecta a esa cuenta; **Detener todas las revisiones** detiene el conjunto. Este último control también aparece al navegar a otros módulos.
6. Revisar las facturas antes de registrar gastos. La importación no valida fiscalmente un documento ni contabiliza automáticamente un gasto.

El modo manual anterior sigue disponible, sin marcar la revisión automática. Cuando hay una revisión automática activa hay que detenerla antes de iniciar una descarga manual; una petición anterior debe terminar o confirmar su cancelación antes de abrir otra.

## Alcance y costes

La frecuencia y simultaneidad se coordinan por instancia abierta de la app, no entre distintas pestañas, dispositivos o llamadas directas. Las cuotas y reservas del servidor continúan aplicándose a todas las peticiones.

La autorización solo vive en la memoria de la sesión. Permite revisar el período elegido y después únicamente el día final ya autorizado, cada cinco minutos como mínimo. El coordinador aplica un máximo de diez peticiones por autorización, una petición global en vuelo y un original nuevo por petición automática. No se buscan fechas futuras ni se reinicia el período al llegar la medianoche.

La sesión automática dura como máximo una hora, y puede caducar antes por el vencimiento del permiso del buzón, de la sesión de TruckControl o del día autorizado. Desconectar una cuenta, cambiar empresa/sesión/MFA/permisos, cerrar sesión, ocultar o cerrar la app, o perder internet detiene el trabajo. Volver a abrir la app o recuperar conexión no lo reactiva: hay que autorizarlo otra vez.

El coordinador se detiene ante un resultado incierto, una incidencia de lectura o análisis, un cursor repetido o un límite de IA. No hay reintentos automáticos de operaciones que podrían haber guardado un documento o reservado consumo. Detener no borra originales ya guardados. Un análisis ya aceptado por el proveedor puede terminar aunque se cierre la vista.

Los límites globales existentes del backend siguen en **10 USD/mes** y **100 llamadas por empresa**. La frecuencia y el máximo de lotes son límites adicionales del coordinador; no sustituyen la reserva y contabilización del servidor. No se amplía el presupuesto, no se activa un proveedor nuevo ni se habilitan pagos de suscripciones.

## Seguridad y compatibilidad

- El backend exige el usuario y la sesión nativa vigente, permisos de empresa, servicio habilitado y presupuesto antes de los efectos. Comprueba de nuevo la caducidad tras los controles asíncronos.
- El consentimiento fija usuario, empresa, cuenta, SID, AAL, proveedor, buzón, rango original y vencimiento. Los cursores firmados incluyen ese contexto y no pueden pasar a otra cuenta o período.
- Gmail verifica el perfil y la fecha de recepción antes de descargar contenido. IMAP reutiliza el transporte TLS protegido existente. Un PDF demasiado grande o con tamaño inválido se informa como incidencia; no se descarga para averiguarlo.
- Tokens y contraseñas del correo permanecen en memoria. La autorización periódica no se guarda en WebStorage, copias offline ni perfiles. Los originales usan almacenamiento privado y deduplicación existentes.
- Un backend anterior sin la capacidad específica no ofrece la revisión automática; el correo ordinario y la descarga manual siguen disponibles.
- No se añade una migración ni se modifica RLS, los cálculos económicos, la edición de planes o los permisos de administración.

## Comprobación y recuperación

Las pruebas nuevas cubren el contrato de autorización, contexto y caducidad, cursor firmado, coordinación entre cuentas, límites, cancelación, errores y escáneres. Los recorridos de navegador usan el SDK y la aplicación reales con transporte privado ficticio cerrado. La entrega debe registrar por separado los resultados finales de CI, backend y HTTPS; no equivalen a un buzón real ni a dispositivos físicos.

Se conserva Sites50 y la fuente recuperable `16f4923cb55ca1203c68bf58a4e8a66e499edcd8`. La ampliación de capacidad del backend es compatible con ese cliente. Para retirar la interfaz nueva se puede recuperar esa fuente, conservando las76 migraciones. Restaurar company-mail16 exige su snapshot oficial verificado y el mismo control nativo de sesión: nunca retirar autorización para resolver un fallo.

## Límites externos

Esto **no ejecuta lecturas con la app cerrada**. Esa función necesitaría credenciales OAuth duraderas autorizadas, revocación y trabajos de servidor independientes; no se implementa almacenando contraseñas temporales. Google público, Microsoft OAuth, aceptación de un nuevo buzón real y firma comercial/Play dependen de sus accesos y revisiones. La confirmación histórica del propietario sobre lectura y envío de Gmail se conserva; no se inventa una nueva operación de correo.
