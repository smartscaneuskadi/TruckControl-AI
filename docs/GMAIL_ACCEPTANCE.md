# Gmail empresarial: preparación y prueba de facturas

Continuación del 05/11/2026, versión de código **0.5.15-rc.1**. Publicada como versión alojada **27** en https://truckcontrolai.com, conservando v26 y demo6 para recuperación. Código y fuente exacta superan 863 controles; 75 hashes HTTPS coinciden. Los seis perfiles públicos previos comprobaron v26; la aceptación posterior de v27 queda en los checks del [PR #31](https://github.com/smartscaneuskadi/TruckControl-AI/pull/31/checks). [Recibo](verification/gmail-acceptance-publication-20261105.json). [Expediente Google](GOOGLE_PUBLIC_VERIFICATION.md).

## Configuración real observada

Tras guardar el titular su sesión privada, la automatización autorizada abrió el proyecto existente **TruckControlAI / 468881730124** y guardó los cuatro alcances que usa la aplicación: `openid`, `userinfo.email`, `gmail.readonly` y `gmail.modify`. No se crearon proyectos o clientes, ni se cambiaron marca, público, secretos o facturación. La marca publicada sigue siendo una confirmación del titular; la aplicación continúa en **Pruebas** y no se envió una solicitud de verificación.

La automatización comunica como requisitos pendientes el vídeo real de demostración, una declaración del titular y completar el envío de la solicitud. Ese resumen no acredita haber revisado o firmado una declaración concreta. La evaluación anual de seguridad aplicable a datos restringidos procesados en servidor sigue sin presupuesto ni contratación; cualquier excepción debe confirmarla Google.

Supabase, consulta agregada del **05/11/2026 a las 22:22:15 UTC**: cero vínculos Gmail empresariales, cero estados OAuth activos, dos empresas activas con el módulo habilitado y 57 migraciones. `company-gmail` continúa ACTIVE v13; no hay cambios de esquema o backend en esta entrega. La configuración guardada y la prueba previa de Mi correo no acreditan una conexión empresarial.

## Cambios de interfaz

Administración → Servicios distingue **Credenciales de Gmail empresarial / Configuración guardada** de **Vinculación de buzones de empresa**. El contador representa vínculos registrados, incluidos los que puedan requerir una nueva autorización; el estado individual se consulta en Correo y facturas. No se consulta ni expone ningún secreto adicional.

La ayuda incluye pasos de prueba y [factura ficticia descargable](../public/examples/factura-demostracion.pdf). El PDF no contiene datos empresariales reales y lleva **SIN VALIDEZ FISCAL**. Ejemplo: base 100,01 €, IVA 21,00 €, total 121,01 €. La fecha del documento no altera el filtro por fecha de recepción del correo. La ayuda utiliza el color del tema y se comprueba contraste mínimo 4,5:1 en Fleet Light y Fleet Cockpit.

## Prueba automatizada con proveedores simulados

`tests/gmail-invoice-acceptance.test.ts` combina el handler Gmail, PKCE y cifrado, el resolvedor IA, todas las migraciones SQL en PGlite, RLS, reservas de presupuesto y aprobación contable. Google/OpenAI y almacenamiento se simulan, y cualquier `fetch` global real falla. No usa sesiones, documentos ni credenciales de clientes.

El recorrido prueba:

- Consentimiento iniciado/finalizado por el mismo usuario y empresa, token cifrado y rechazo de repetir el estado OAuth.
- Treinta días por defecto; ampliación a los últimos doce meses; rechazo anterior al contenido/adjuntos/IA de mensajes fuera de período, enviados o futuros.
- El PDF de ejemplo llega al proveedor simulado y queda para revisión. Otra empresa no puede leerlo ni aprobarlo.
- La aprobación revisada dos veces crea **un solo gasto pendiente de 100,01 € de base**, respetando la contabilidad existente. Reimportar no duplica originales, gastos o consumo.
- Una respuesta IA incierta conserva la reserva y el original para revisión, sin reintentar consumo. Falta de consentimiento o presupuesto permite revisión manual, sin otra llamada al modelo.
- Suspensión de cuenta, empresa ajena y período superior a doce meses se rechazan antes de consultar Google.

Esta prueba hace dos llamadas a un **modelo simulado**, guarda cuatro documentos locales y un gasto local. **Cero llamadas a Gmail/OpenAI reales y cero datos nativos de prueba**. No equivale a aceptación de OAuth en producción, evaluación CASA o vídeo real de Google.

Dos recorridos nuevos de navegador, Android/Windows emulados, comprueban configuración frente a vínculo, descarga PDF, ambos temas, contraste, Axe y ausencia de desbordamiento. Las 64 pruebas iniciales conservan sus once hashes. El CI completo y la publicación se registran en el PR y en el informe de entrega; no confundir los perfiles públicos anteriores al despliegue con aceptación de la versión nueva.

## Aceptación real pendiente

Un administrador de una empresa autorizada debe vincular un buzón de prueba desde **Correo y facturas**, comprobar la misma empresa al retornar y usar una factura ficticia recibida. La IA requiere permiso y consentimiento; la revisión precede al gasto. No se transfiere la sesión de Mi correo, se concede Full a cuentas reales ni se sustituyen contraseñas para probar.

El expediente contiene un guion para el vídeo real, con pantalla de consentimiento en inglés y sin contraseñas, MFA, códigos o documentos personales. No se ha grabado, subido ni enviado. La sesión privada guardada permite configurar Google, pero no sustituye el consentimiento de un buzón empresarial.

## Costes y continuidad

Presupuesto TinyFish acumulado: **113 pasos / 1268 segundos**, estimación 1,8502666667 USD con las tarifas observadas; hasta 1,8802666667 USD incluyendo conservadoramente 900 segundos de preparación privada. Se mantiene el límite total de 2 USD, sin recarga. La última ejecución registró 15 pasos pese a solicitar un máximo de 12; no iniciar más automatizaciones basándose en ese máximo como garantía de coste.

IA mantiene el límite aprobado de 10 USD/mes antes de impuestos, sin ampliación ni llamadas nuevas al proveedor por estas comprobaciones. Resend Free, planes, precios, permisos comerciales, demo v6 y versiones de recuperación se conservan. No se toca FIXPilot.
