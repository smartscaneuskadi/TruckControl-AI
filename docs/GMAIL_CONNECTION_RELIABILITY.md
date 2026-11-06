# Retorno fiable de Gmail y contexto de empresa

Continuación del **06/11/2026**, código **0.5.16-rc.1**. Publicada como **versión 28** en https://truckcontrolai.com, fuente `709a0607b5d94e9707bbef6af3c816c42dedd176`. Código y fuente exacta pasan **883 controles**; sus seis perfiles públicos comprobaron v27 antes de publicar. La aceptación posterior de v28 queda en los checks del [PR #32](https://github.com/smartscaneuskadi/TruckControl-AI/pull/32/checks). Coinciden **75 hashes HTTPS** y la demo6 permanece intacta; v27 y anteriores siguen recuperables. [Recibo](verification/gmail-reliability-publication-20261106.json). [Aceptación de facturas](GMAIL_ACCEPTANCE.md), [expediente Google](GOOGLE_PUBLIC_VERIFICATION.md).

## Problemas reproducidos

Tres regresiones de navegador fallan con el código anterior:

1. El mensaje de cancelación de Google se guardaba en el mismo estado que los errores de carga. Al cargar o comprobar la bandeja se borraba y el usuario perdía el motivo del fallo.
2. El resultado de Gmail se capturaba solo al montar la pantalla. Un retorno mediante cambio de fragmento a una ventana ya abierta de la PWA no finalizaba la vinculación ni retiraba el ticket de la URL.
3. Un enlace de Correo y facturas o retorno OAuth abierto con la cuenta de administración global seguía mostrando el panel sin explicar que esa sesión no era una cuenta de empresa. El retorno no se procesaba y podía conservarse en la URL.

Las pruebas son locales, con usuarios ficticios y proveedores simulados. Reproducir esos casos no demuestra cuál de ellos ocurrió en la sesión del titular.

## Comportamiento nuevo

- La pantalla de facturas escucha los retornos nuevos sin recargar. Retira ticket/error de la URL, valida el formato y finaliza cada intento una sola vez, también en StrictMode. Un consentimiento nuevo puede recuperarse después de un fallo; repetir el mismo retorno no vuelve a consumirlo.
- Los avisos de autorización tienen estado propio, persisten al consultar la bandeja y se cierran explícitamente. No se muestran valores arbitrarios recibidos en la URL. Un ticket malformado no se envía al servidor.
- Solo la respuesta explícita `connected: true` del servidor permite anunciar éxito. HTTP 403, respuestas incompletas y errores no se presentan como una conexión terminada.
- La demo explica que hay que regresar con la misma cuenta de empresa. La administración global explica ese contexto y retira el retorno sin consumirlo, cambiar roles, crear empresas o vincular buzones de clientes.
- Los indicadores distinguen comprobación en curso, vínculo guardado, renovación necesaria, ausencia de vínculo y estado sin comprobar. Un fallo de lectura no se presenta como una desconexión confirmada; un permiso por renovar no aparece en verde.

El estado mostrado procede de los registros de TruckControl. Consultarlo no equivale a leer correos o verificar en vivo cada token con Google. La importación sigue necesitando acceso autorizado, período, permiso y revisión. No hay importación nueva ni llamada al modelo por abrir o comprobar esta pantalla.

## Seguridad y compatibilidad

El servidor conserva la validación de sesión, usuario, empresa, rol, licencia, estado de un uso y PKCE. No se cambia el cliente Google, sus cuatro alcances, cifrado de tokens o credenciales. No se trasladan tokens de Mi correo al importador. Tampoco se modifican RLS, migraciones, lógica contable, planes, cuotas, consentimiento u offline.

El retorno no se escribe en WebStorage. La referencia al intento permanece solo en memoria de la pantalla y desaparece al salir del contexto. Cambiar usuario/empresa sigue desmontando el proveedor de flota; las respuestas tardías no actualizan la pantalla abandonada. Los avisos no incluyen tickets, códigos ni contenido del proveedor.

La consulta agregada de Supabase del **06/11/2026 a las 05:27:39 UTC** registra cero conexiones y autorizaciones empresariales activas y 57 migraciones. No se han cambiado datos nativos ni desplegado funciones; `company-gmail` continúa con el contrato v13 anterior. FIXPilot permanece separado.

## Pruebas

Se añaden casos para cancelación persistente, retorno sin recarga y duplicado, intento nuevo tras fallo, respuesta sin confirmación, cuenta/empresa distinta, ticket malformado/error desconocido, renovación, fallo de lectura, demo y administración global. Se prueban Android y Windows emulados; los avisos en ambos temas pasan Axe y no desbordan horizontalmente. Se conservan las 64 originales mediante once hashes.

Los resultados completos, fuente congelada, CI y publicación se registran en el PR y en el recibo de esta entrega. Los recorridos con proveedores simulados no sustituyen consentimiento real, vídeo de Google, evaluación de seguridad externa ni pruebas en dispositivos físicos.

## Pendientes externos

Los cuatro alcances fueron guardados en Google el 05/11. El último estado observado allí es Pruebas, sin solicitud de revisión enviada. Siguen pendientes buzón empresarial de prueba autorizado, vídeo real, declaración del titular y completar la revisión; la evaluación anual aplicable requiere presupuesto o excepción confirmada por Google.

TinyFish mantiene el límite acumulado autorizado de **2 USD**, con estimación conservadora previa de 1,8802666667 USD. Se ha solicitado ampliar el máximo en hasta 1 USD; mientras no haya respuesta expresa, no se inicia otra automatización pagada. La consulta gratuita de tarifas no autoriza consumo adicional. IA conserva 10 USD/mes antes de impuestos, sin nuevas llamadas al proveedor en estas pruebas.

## Fiabilidad del CI

La ejecución posterior por push 42171431103 supera los 883 controles y sus seis perfiles públicos coinciden con la fuente publicada de v28. El duplicado del PR alcanza el límite global de quince minutos: la descarga de paquetes desde azure.archive.ubuntu.com consume 630 segundos antes de empezar los navegadores. Se solicita un reintento normal y se corrige el origen de esa demora en el workflow: únicamente ese espejo Ubuntu pasa al archivo oficial archive.ubuntu.com por HTTPS. Se mantienen fuentes, componentes y verificación de firmas, así como todas las pruebas y el límite global de quince minutos. La instalación del navegador tiene un máximo de cinco minutos para fallar de forma visible si vuelve a bloquearse.

El ajuste afecta solo al runner efímero de GitHub Actions. No cambia el entorno alojado, la red del workspace, dependencias de la app, datos o credenciales. El código de la aplicación sigue coincidiendo con la fuente congelada 709a060. La revisión final de documentación y CI no se vuelve a presentar como una fuente desplegada nueva.

El primer ajuste del espejo no cubría /etc/apt/apt-mirrors*.txt, utilizado por la imagen de GitHub. El PR pasó pero la ejecución duplicada seguía usando Azure y alcanzó el nuevo límite de cinco minutos. Se añade esa lista al tratamiento y se comprueba que no queden referencias a Azure; los enlaces HTTP del archivo oficial también pasan a HTTPS. No se atribuye el éxito del primer PR a un cambio de espejo que había resultado ser un no-op. La validación final debe confirmar origen efectivo e instalación, además de los 883 controles.
