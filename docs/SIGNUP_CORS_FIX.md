# Corrección del registro desde la PWA y enlaces publicados

## Incidencia del 2 de noviembre de 2026

El formulario mostraba un error genérico antes de crear la cuenta. Las peticiones OPTIONS reales del servicio `company-auth` devolvían 403 a las 07:09, 07:11 y 07:13 UTC. La comprobación independiente reprodujo `origin_denied` desde el hostname técnico que sirve producción, mientras el dominio principal y www respondían correctamente. No se registra aquí el correo ni ningún dato fiscal del cliente.

## Corrección

`company-auth` v4 autoriza exactamente los tres orígenes publicados: `https://truckcontrolai.com`, `https://www.truckcontrolai.com` y `https://truckcontrol-ai-candidata.earlymug513.chatgpt.site`. Este último es el origen de instalaciones anteriores de la PWA. Se mantienen bloqueados la demo separada, los dominios parecidos, HTTP y orígenes ajenos. No hay comodines.

El servidor conserva la verificación nativa del correo, el consentimiento inmutable, las cuotas de envío, las operaciones internas firmadas y el aprovisionamiento de Básico. No se han cambiado bases de datos, migraciones, precios, planes, credenciales ni límites de consumo. La corrección del servidor también funciona con la interfaz v13 instalada.

La interfaz 0.5.7-rc.1 interpreta únicamente códigos públicos conocidos, conserva los datos del formulario tras un fallo y permite reintentar. Nunca presenta errores privados del proveedor. La casilla de consentimiento mantiene un tamaño legible en Android y Windows.

## Validación y publicación

- Copia completa del historial: `/workspace/artifacts/truckcontrol-signup-fix-20261102/before-signup-fix.bundle`; versión anterior del servidor conservada en la misma carpeta.
- Ocho comprobaciones HTTP reales después de desplegar v4: OPTIONS y validación POST en los tres orígenes admitidos, más el rechazo de un origen ajeno. La validación usa un correo vacío y termina antes de reservar cuota, crear usuarios o enviar mensajes.
- Las pruebas del handler cubren cada origen publicado, preflight, invitación y bloqueo de la demo y de dominios parecidos.
- Las pruebas de interfaz cubren el tamaño de la casilla, la explicación de un 503 y un reintento conservando datos y consentimiento.
- El control público de CI incluye peticiones reales desde el navegador a Supabase en los seis perfiles/orígenes. Antes solo inspeccionaba el portal y la demo; las pruebas de registro interceptaban el backend y no detectaban este fallo de CORS.

Pendiente de completar en este informe: resultados de CI, versión de interfaz publicada y comprobación pública posterior. La entrega del correo al nuevo cliente solo se podrá confirmar después de una nueva solicitud válida. Las pruebas de esta corrección no envían mensajes a su dirección ni inventan sus datos de empresa.

## Recuperación

Se conserva la versión de interfaz 13 y la demo estable 6. No restaurar la política antigua de prueba Full ni reaplicar migraciones para reparar este incidente. Las 52 migraciones se mantienen intactas. La copia de `company-auth` v3 permite recuperación técnica, pero volver a ella reintroduciría el bloqueo del hostname técnico.
