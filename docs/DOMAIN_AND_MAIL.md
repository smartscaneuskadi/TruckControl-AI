# Dominio y buzones de TruckControl AI

## Estado al 1 de noviembre de 2026

Destino único: **truckcontrolai.com**. La consulta exacta de Porkbun del 31/10 a las 23:59 UTC devuelve `AVAILABLE`, sin precio premium, por 11,08 USD para un año y renovación publicada de 11,08 USD/año. La comprobación del 01/11 mantiene RDAP 404 y DNS NXDOMAIN. Estos resultados no reservan el nombre ni acreditan propiedad. Evidencia pública: [domain-mail-preflight-20261101.json](deployment/domain-mail-preflight-20261101.json).

El propietario **ha aprobado expresamente Migadu Micro por 19 USD/año** para los tres buzones. No volver a pedir esta autorización dentro de ese importe y alcance. Si el checkout añade impuestos o cambia el importe, mostrar el total antes de pagar. La aprobación no significa cuenta creada, dominio comprado ni pago ejecutado.

No se han contratado servicios, creado buzones, enviado mensajes o modificado registros DNS. La candidata no tiene dominios personalizados asociados. La demo estable y la candidata continúan en sus direcciones actuales, sin cambios.

## Proveedores y presupuesto

| Servicio | Precio publicado | Alcance y estado |
| --- | --- | --- |
| Dominio en [Porkbun](https://porkbun.com/checkout/search?q=truckcontrolai.com) | 11,08 USD/año; renovación actual igual | Consulta pública exacta; pago pendiente. Impuestos/conversión se comprueban en el checkout. |
| [Migadu Micro](https://www.migadu.com/pricing/) | 19 USD/año por cuenta | Aprobado por el propietario. 5 GB, 200 entrantes/día y 20 salientes/día compartidos; no son cuotas por buzón. No incluye administración de la cuenta por varios administradores. |
| [Brevo Free](https://help.brevo.com/hc/en-us/articles/208589409-About-Brevo-s-pricing-plans) | 0 de cuota | Hasta 300 envíos/día para confirmación y recuperación. Cuenta, autenticación del remitente y entrega todavía pendientes. No activar SMS ni opciones de pago. |

El presupuesto de referencia con Porkbun y Migadu es **30,08 USD el primer año**, antes de posibles impuestos/conversión. Las renovaciones futuras pueden cambiar. El coste del dominio todavía no se ha aprobado como un cargo ejecutable. La cuenta de correo solo atiende las direcciones de la plataforma; no aloja automáticamente el correo de las empresas clientes.

Se ha encontrado y sugerido la conexión oficial de **Wix**, anunciada para buscar y comprar dominios desde el chat. No está confirmada su conexión ni se ha obtenido su precio para este dominio. El importe de Porkbun **no** es un presupuesto de Wix. Consultar el total y la renovación de Wix cuando esté conectado, comprar únicamente el dominio y mantener el alojamiento existente. Wix documenta que permite comprar un dominio sin plan de sitio y dirigirlo a un alojamiento externo. No crear otro sitio, contratar hosting ni rehacer la aplicación para usar esta conexión.

## Alta y acceso seguro pendientes

El [registro oficial de Migadu](https://admin.migadu.com/public/signup) solicita nombre completo del titular, un correo existente y aceptación de condiciones; envía un enlace de confirmación. Se puede usar `pedidos@smartscaneuskadi.com` como correo de acceso externo, evitando depender de un buzón del dominio que aún no existe. La prueba no requiere tarjeta. El nombre del titular no debe inventarse. El propietario debe completar su identidad, confirmación y pago en el proveedor cuando no haya un flujo conectado que permita hacerlo con seguridad.

No existe actualmente un conector de provisión de Migadu/Brevo ni un almacén seguro de credenciales configurado para estas cuentas. Crear una cuenta no proporciona por sí mismo acceso al agente. La API oficial de Migadu permite gestionar dominio, buzones y registros, pero exige una clave propia de la cuenta: utilizarla únicamente si se conecta mediante un mecanismo seguro. No pedir contraseñas ni claves por chat, pasarlas como argumentos o guardarlas en Git. No reutilizar las credenciales ni datos de FIXPilot.

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
