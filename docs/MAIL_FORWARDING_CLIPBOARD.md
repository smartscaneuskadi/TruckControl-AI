# Dirección de reenvío en navegadores móviles

La recepción de facturas de cualquier proveedor ya utiliza la dirección de la
empresa, gestionada en `UniversalMailIntake`. No se crea otra integración ni se
cambia el permiso para activar la recepción.

El botón de copiar evaluaba `navigator.clipboard.writeText` antes de entrar en
su manejador de errores. Si el navegador no ofrecía la API o lanzaba una
excepción síncrona, no aparecía el aviso para seleccionar la dirección. Después
de un rechazo de permisos, un segundo intento correcto conservaba el error.

La copia se ejecuta ahora en `try/await/catch`, con los textos existentes y los
controles de componente vigente. Se limpian los avisos anteriores al comenzar
un intento. El destinatario se captura al pulsar; no se cambian cuenta,
dirección, almacenamiento, integraciones, economía ni permisos.

La reproducción usa el mismo componente de la versión pública44 y transporte
privado ficticio. Antes:12 fallos y4 controles positivos. Después:16/16
correctos, en Android/Windows emulados y ambos temas, incluyendo API ausente,
error síncrono, rechazo asíncrono/reintento y copia correcta. El portapapeles es
ficticio y se bloquea cualquier HTTP/WebSocket externo no interceptado.

Las pruebas completas y la fuente de producción exacta deben validarse antes
de publicar. No se presenta como prueba en dispositivos físicos, una entrega
real de correo ni una activación de la migración SQL pendiente.
