# Dominio y buzones de TruckControl AI

## Estado al 1 de noviembre de 2026

Destino único: **truckcontrolai.com**. El propietario confirma completados la compra y el registro de cuenta Migadu. RDAP devuelve 200 y confirma registro el **01/11/2026 a las 00:15:48 UTC**, con vencimiento el **01/11/2027**. Los servidores de nombres pertenecen a Porkbun. Evidencia actual: [registered-domain-20261101.json](deployment/registered-domain-20261101.json). Se conserva la [consulta anterior a la compra](deployment/domain-mail-preflight-20261101.json) como historial; sus resultados AVAILABLE/NXDOMAIN ya no describen el estado actual.

El propietario **ha aprobado expresamente Migadu Micro por 19 USD/año** para los tres buzones. No volver a pedir esta autorización dentro de ese importe y alcance. Si el checkout añade impuestos o cambia el importe, mostrar el total antes de pagar. La aprobación no significa cuenta creada, dominio comprado ni pago ejecutado.

El agente no ha ejecutado compras ni nuevos cargos. La cuenta Migadu consta creada según el titular; todavía no se ha podido comprobar su plan/pago, el dominio de correo ni los buzones mediante acceso autorizado. No se han enviado mensajes ni modificado registros DNS desde este entorno.

Se han añadido `truckcontrolai.com` y `www.truckcontrolai.com` al alojamiento existente de la candidata. Ambos están **pendientes de validación DNS**, con certificado inicializándose; no afirmar que HTTPS ya está activo. Identidades y registros exactos: [custom-domains-20261101.json](deployment/custom-domains-20261101.json). La demo estable y la candidata conservan sus direcciones anteriores y no se abren altas comerciales.

Se han preparado [siete registros web](deployment/truckcontrolai.com.web-records.zone) y una [solicitud lista para soporte de Porkbun](deployment/porkbun-domain-connection.txt). El archivo contiene exclusivamente registros web: no es una exportación completa de la zona ni debe usarse para sustituirla. Los MX/SPF actuales todavía corresponden a Porkbun; conservarlos hasta disponer de los valores reales de Migadu y preparar su cambio controlado.

## Proveedores y presupuesto

| Servicio | Precio publicado | Alcance y estado |
| --- | --- | --- |
| Dominio en [Porkbun](https://porkbun.com/account/domainsSpeedy) | 11,08 USD/año de tarifa consultada; renovación actual igual | Comprado según el titular y registro confirmado por RDAP. Importe final de su factura no consultado; no volver a comprar. |
| [Migadu Micro](https://www.migadu.com/pricing/) | 19 USD/año por cuenta | Aprobado por el propietario. 5 GB, 200 entrantes/día y 20 salientes/día compartidos; no son cuotas por buzón. No incluye administración de la cuenta por varios administradores. |
| [Brevo Free](https://help.brevo.com/hc/en-us/articles/208589409-About-Brevo-s-pricing-plans) | 0 de cuota | Hasta 300 envíos/día para confirmación y recuperación. Cuenta, autenticación del remitente y entrega todavía pendientes. No activar SMS ni opciones de pago. |

El presupuesto de referencia con Porkbun y Migadu es **30,08 USD el primer año**, antes de posibles impuestos/conversión. Las renovaciones futuras pueden cambiar. El titular ya ha realizado el paso de compra del dominio; no repetirlo ni ejecutar otra compra. La cuenta de correo solo atiende las direcciones de la plataforma; no aloja automáticamente el correo de las empresas clientes.

Anteriormente se sugirió Wix para consultar compra dentro del chat, pero el dominio ya está registrado en Porkbun. No es necesario instalar Wix, transferir el dominio ni contratar otro alojamiento. No crear otro sitio ni rehacer la aplicación.

## Alta y acceso seguro pendientes

El titular comunica que ha completado el [registro de Migadu](https://admin.migadu.com/public/signup). No repetir el alta. La cuenta utiliza un correo externo para no depender de un buzón del dominio aún no operativo. La creación de cuenta no prueba que se hayan creado el dominio de correo, sus buzones o el plan de pago.

No existe actualmente un conector de provisión de Migadu/Brevo ni un almacén seguro de credenciales configurado para estas cuentas. Crear una cuenta no proporciona por sí mismo acceso al agente. La API oficial de Migadu permite gestionar dominio, buzones y registros, pero exige una clave propia de la cuenta: utilizarla únicamente si se conecta mediante un mecanismo seguro. No pedir contraseñas ni claves por chat, pasarlas como argumentos o guardarlas en Git. No reutilizar las credenciales ni datos de FIXPilot.

La conexión de Porkbun tampoco está disponible: el entorno no tiene secretos ni identidades de estos proveedores. Las búsquedas de conectores específicos no han encontrado uno que permita editar su DNS. No inventar un botón OAuth o un checkout nuevo. Si no hay un canal seguro de acceso, la alternativa concreta para la web es entregar la solicitud preparada al [soporte oficial de Porkbun](https://porkbun.com/contact) desde la cuenta del titular. Para correo hacen falta los registros de verificación y DNS generados por Migadu para este dominio; son información publicable, a diferencia de contraseñas, claves API o enlaces de acceso.

## Direcciones previstas

| Dirección | Uso |
| --- | --- |
| admin@truckcontrolai.com | Administración del servicio y recepción de avisos del dominio. |
| soporte@truckcontrolai.com | Atención a clientes y respuestas a comunicaciones de la aplicación. |
| no-reply@truckcontrolai.com | Remitente verificado de confirmación y recuperación, mediante el proveedor transaccional. |

Conservar `pedidos@smartscaneuskadi.com` como identidad reservada del superadministrador hasta verificar cualquier transición. Las contraseñas de los buzones deben ser diferentes y se entregarán mediante el proveedor, nunca mediante el chat. Mantener desactivado el catch-all. Configurar, cuando corresponda, las direcciones operativas postmaster/abuse sin añadir buzones de pago ni publicar credenciales.

## Secuencia de configuración

1. Completar el registro del dominio por un año en la cuenta del titular, con precio final aprobado. Verificar acceso autorizado al registrador; RDAP por sí solo no basta. Conservar una copia de la zona existente antes de modificarla.
2. Crear el dominio de correo en la cuenta autorizada de Migadu con DNS externo y obtener de su panel/API los registros exactos de verificación, MX y DKIM. Crear los tres buzones sin sobrescribir direcciones existentes.
3. Obtener de Sites los registros exactos de A/CNAME y validación para el destino elegido, preservando la demo estable y la candidata. Añadir el hostname solo después de confirmar propiedad. Esperar validación y certificado HTTPS activo; no sustituir un destino estable por uno no verificado.
4. Autenticar el remitente en Brevo Free. Copiar únicamente los registros que ese proveedor genere para esta cuenta. Conservar **un solo SPF por nombre**, sin añadir includes por suposición ni eliminar emisores legítimos. Los selectores DKIM de ambos proveedores deben poder coexistir. No cambiar servidores de nombres a ciegas.
5. Publicar DMARC inicialmente en monitorización, con informes a un buzón operativo y controlado. Comprobar todas las fuentes legítimas antes de endurecer a quarantine/reject. No publicar direcciones de informes que aún no reciban.
6. Guardar SMTP exclusivamente en el backend del proyecto Supabase `kkkemaycedexymrpaqtp`. Aplicar las plantillas y redirecciones exactas solo cuando el dominio y HTTPS estén verificados. Mantener cerrada el alta pública. La configuración preparada está descrita en [AUTH_MAIL_SETUP.md](AUTH_MAIL_SETUP.md).

## Comprobación antes de activar cuentas de clientes

- Resolver NS, A/AAAA o CNAME, MX, verificación, SPF, selectores DKIM entregados y DMARC. Confirmar propagación con las respuestas autoritativas y el proveedor.
- Verificar certificado HTTPS y redirección canónica sin errores ni bucles, sin alterar las URL conservadas de demostración.
- Probar recepción en admin/soporte y envío autorizado. Revisar en el mensaje recibido `Authentication-Results`: SPF, DKIM y DMARC, incluida alineación con el dominio visible. Los registros publicados no demuestran por sí solos entrega.
- Completar confirmación de cuenta y recuperación en el navegador que inicia PKCE, con un destinatario de prueba autorizado. Verificar enlaces de un solo uso, caducidad y límites sin crear empresas reales.
- Registrar fecha, destinatario autorizado, identificador de entrega y resultado sin guardar contenidos privados, tokens de enlace ni claves. Mantener pagos, SMS y consumo IA apagados.

Cuando se disponga de las conexiones, continuar automáticamente con los pasos autorizados. Si un proveedor exige pago, identidad o acceso que solo puede aportar el titular, presentar únicamente esa acción pendiente; la aprobación de Migadu ya consta.
