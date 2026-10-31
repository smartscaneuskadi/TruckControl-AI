# Correo de confirmación y recuperación

## Estado

El propietario ha confirmado que el primer correo real será el de **confirmación de cuentas y recuperación de contraseñas**. Gmail para importar facturas es una conexión distinta y no se activa en esta fase.

Proyecto autorizado: `truckcontrol-ai`, referencia `kkkemaycedexymrpaqtp`, organización `fixpilot-dev`. FIXPilot no debe consultarse para obtener claves, reutilizarse ni modificarse. La demo publicada continúa disponible y no se sustituye por una configuración de correo no verificada.

Se han preparado plantillas españolas con el nombre TruckControl AI y enlaces de un solo uso generados por Auth. No incluyen datos empresariales, imágenes remotas, seguimiento ni contraseñas. La recuperación usa el flujo PKCE de la aplicación: debe iniciarse y completarse en el mismo navegador. La configuración local añade la URL HTTPS exacta de la aplicación a las redirecciones.

**Esto no significa que SMTP esté activado.** La conexión Supabase disponible permite consultar el proyecto y gestionar base de datos y funciones, pero no expone la configuración de Auth alojado. La CLI tampoco tenía una sesión de administración. Se inició el flujo oficial de autorización de la CLI con nombre `truckcontrol-ai-mail-setup`; se espera la autorización del propietario. No pedir contraseñas ni tokens API por chat. El código temporal de vinculación solo se utiliza para ese flujo oficial.

El dominio `smartscaneuskadi.com` publica MX de Google y SPF de Google Workspace. Esto identifica su proveedor, pero no proporciona acceso SMTP ni prueba que una dirección nueva exista o tenga permiso de envío. La dirección de remitente está pendiente de confirmación del propietario. No se han modificado DNS ni credenciales de Google.

## Aplicación controlada de ajustes

`scripts/configure_auth_mail.py` utiliza únicamente la API oficial de administración. Su modo predeterminado es un plan local sin llamadas remotas. El proyecto y la organización están fijados: rechaza otro destino y verifica su identidad antes de escribir.

El modo de comprobación solo devuelve metadatos de configuración; no imprime contraseña SMTP, usuario SMTP, token de administración ni respuestas de error que puedan contener secretos. El selector de almacén privado se utiliza dentro del proceso, sin copiar credenciales a código, argumentos de terminal, navegador o documentación. No sigue redirecciones HTTP con la autorización.

La aplicación de ajustes es parcial: URL del sitio, redirección HTTPS, confirmación obligatoria y, cuando ya existe SMTP propio, asuntos y contenido de las dos plantillas. Conserva SMTP, sus secretos y los demás servicios. No abre el registro de empresas, no envía mensajes y no activa pagos, SMS o IA. Conserva una política de contraseña existente más exigente que doce caracteres. Las redirecciones ambiguas o de otra aplicación se rechazan para revisión, sin sobrescribirlas.

Desde junio de 2026 los proyectos Free nuevos que usan el SMTP predeterminado no pueden personalizar las plantillas. Por eso el script prepara las plantillas, pero no intenta aplicarlas mientras falte SMTP propio. El correo predeterminado de Supabase solo entrega a miembros del equipo y no sirve para las altas de clientes en producción.

Tras aplicar se vuelve a leer la configuración y se comprueba cada campo. Un éxito de configuración no prueba entrega de correo: debe verificarse el proveedor y completar un envío autorizado al propietario, la confirmación y la recuperación antes de abrir clientes reales.

## Intervención que todavía puede ser necesaria

Solo el titular puede autorizar su cuenta y dar acceso al proveedor de envío. Si las credenciales SMTP aún no están configuradas, deben introducirse mediante el panel seguro del proveedor o de Supabase; no mediante el chat ni el repositorio. No se contratan servicios ni se aceptan costes sin autorización.

Enlace oficial del proyecto para el remitente SMTP: https://supabase.com/dashboard/project/kkkemaycedexymrpaqtp/auth/smtp

Quedan pendientes la lectura de la configuración alojada con la nueva autorización, el remitente elegido, la conexión de envío y la prueba real de entrega. No registrar compañías reales para realizar la prueba.

## Referencias verificadas

- [SMTP propio y límites del servicio predeterminado](https://supabase.com/docs/guides/auth/auth-smtp).
- [Plantillas y API oficial de configuración](https://supabase.com/docs/guides/auth/auth-email-templates).
- [Redirecciones de Auth](https://supabase.com/docs/guides/auth/redirect-urls).
- [Cambio de plantillas en el plan gratuito](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier).

Siete pruebas de configuración comprueban destino, lectura sin secretos, restricción del SMTP gratuito, conservación de credenciales, rechazo de otras redirecciones, errores remotos sin datos sensibles y comprobación tras una escritura. No utilizan cuentas ni envíos reales.
