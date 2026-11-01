# Dominio y buzones de TruckControl AI

## Estado al 1 de noviembre de 2026

Destino único: **truckcontrolai.com**. El propietario confirma completados la compra y el registro de cuenta Migadu. RDAP devuelve 200 y confirma registro el **01/11/2026 a las 00:15:48 UTC**, con vencimiento el **01/11/2027**. Los servidores de nombres pertenecen a Porkbun. Evidencia actual: [registered-domain-20261101.json](deployment/registered-domain-20261101.json). Se conserva la [consulta anterior a la compra](deployment/domain-mail-preflight-20261101.json) como historial; sus resultados AVAILABLE/NXDOMAIN ya no describen el estado actual.

El propietario **ha aprobado expresamente Migadu Micro por 19 USD/año y confirma que ya lo ha pagado**. Las capturas del panel muestran Micro/anual y el dominio creado con DNS externos. No repetir compra, alta ni autorización de ese plan. La factura no se ha consultado mediante una conexión de proveedor; esto no autoriza otros cargos.

El agente no ha ejecutado compras ni nuevos cargos. Ha aplicado directamente los DNS mediante la API oficial de Porkbun, tras la aprobación PKCE del titular y la activación de API Access del dominio. Las capturas y la última confirmación del titular muestran el dominio de Migadu activo; no demuestran buzones operativos ni entrega. No se han enviado mensajes.

`truckcontrolai.com` y `www.truckcontrolai.com` están **ACTIVE con SSL activo** y sirven la candidata por HTTPS. Para resolver el 404 inicial del enrutamiento se republicó la misma versión guardada 1, sin cambiar el código ni la audiencia. Los dieciséis recursos comprobados coinciden con el paquete publicado. [Estado nativo](deployment/custom-domains-20261101.json) y [verificación HTTPS](deployment/custom-domain-https-verification-20261101.json). La demo estable y la candidata conservan sus direcciones anteriores; las altas comerciales siguen cerradas.

Se han recibido los **13 registros de correo originales**, incluidos verificación propia de dominio, dos MX, SPF, tres CNAME DKIM, DMARC, autoconfig y cuatro SRV. La captura 303168.jpg muestra el export BIND sin traducir, con los destinos completos. Se conserva la [transcripción del proveedor](deployment/migadu-truckcontrolai.com.source.zone) y el hash de la captura en el plan, sin publicar la imagen de la cuenta.

La configuración conjunta de **20 registros: siete web y trece de correo, está aplicada y comprobada**. Se actualizaron cuatro registros, crearon dieciséis y conservaron los siete restantes, sin borrar ninguno. La zona tiene veintisiete registros expuestos por la API. [Informe de aplicación](deployment/dns-activation-20261101.json). Se conservan el [plan JSON](deployment/truckcontrolai.com.web-mail-plan.json), los [registros BIND](deployment/truckcontrolai.com.web-mail.records.zone), la [tabla CSV](deployment/truckcontrolai.com.web-mail.records.csv) y la solicitud histórica para Porkbun. Ninguno es una exportación completa de la zona; no sustituirla ni volver a aplicar una configuración sin revisar el estado actual.

Los valores conservan los del proveedor; el TTL propuesto pasa de 3000 a 600 segundos para la configuración inicial. Se prepara un solo SPF en `@`, los dos MX de Migadu sin mezclar con el reenvío anterior, y los tres nombres DKIM originales `key1/2/3._domainkey`, evitando las traducciones de la primera captura. DMARC conserva **`v=DMARC1; p=quarantine;`** del export; comprobar SPF, DKIM y alineación antes de habilitar envío. No se añade una dirección de informes que aún no esté operativa.

Se guardó el inventario autenticado previo y el diario de cambios en el almacén privado del agente. Porkbun conserva además puntos de restauración. La consulta DNS pública no sustituye ese inventario: puede devolver respuestas sintetizadas de ALIAS o comodines. La aplicación conservó NS, comodín y verificaciones ACME y comprobó la lectura después de cada operación. Recuperación y límites del cliente: [DOMAIN_DNS_OPERATIONS.md](DOMAIN_DNS_OPERATIONS.md).

**Comprobación pendiente del proveedor:** los tres CNAME DKIM de nuestro dominio resuelven al destino exacto de Migadu, pero los TXT de esos destinos bajo `migadu.com` devuelven `SERVFAIL` por validación DNSSEC tanto en Google como en Cloudflare. [Diagnóstico](deployment/migadu-dkim-dnssec-20261101.json) y [solicitud lista para soporte](deployment/migadu-dnssec-support.txt). No se han cambiado destinos ni desactivado DNSSEC. El estado activo del panel no sustituye esta verificación ni una prueba real de entrega.

## Proveedores y presupuesto

| Servicio | Precio publicado | Alcance y estado |
| --- | --- | --- |
| Dominio en [Porkbun](https://porkbun.com/account/domainsSpeedy) | 11,08 USD/año de tarifa consultada; renovación actual igual | Comprado según el titular y registro confirmado por RDAP. Importe final de su factura no consultado; no volver a comprar. |
| [Migadu Micro](https://www.migadu.com/pricing/) | 19 USD/año por cuenta | Pagado según el propietario; Micro/anual y dominio visibles en sus capturas. 5 GB, 200 entrantes/día y 20 salientes/día compartidos; no son cuotas por buzón. No incluye administración de la cuenta por varios administradores. |
| [Brevo Free](https://help.brevo.com/hc/en-us/articles/208589409-About-Brevo-s-pricing-plans) | 0 de cuota | Hasta 300 envíos/día para confirmación y recuperación. Cuenta, autenticación del remitente y entrega todavía pendientes. No activar SMS ni opciones de pago. |

El presupuesto de referencia con Porkbun y Migadu es **30,08 USD el primer año**, antes de posibles impuestos/conversión. Las renovaciones futuras pueden cambiar. El titular ya ha realizado el paso de compra del dominio; no repetirlo ni ejecutar otra compra. La cuenta de correo solo atiende las direcciones de la plataforma; no aloja automáticamente el correo de las empresas clientes.

Anteriormente se sugirió Wix para consultar compra dentro del chat, pero el dominio ya está registrado en Porkbun. No es necesario instalar Wix, transferir el dominio ni contratar otro alojamiento. No crear otro sitio ni rehacer la aplicación.

## Alta y acceso seguro pendientes

El titular ha completado el registro, confirma el pago y ha creado el dominio de correo con DNS externos. No repetir estos pasos. El formulario mantuvo las direcciones predeterminadas; comprobar qué buzones/alias existen antes de crear `admin`, `soporte` o `no-reply`, para no sobrescribirlos. Su existencia y sus contraseñas todavía no se han consultado.

No existe actualmente un conector de provisión de Migadu/Brevo ni un almacén seguro de credenciales configurado para estas cuentas. Crear una cuenta no proporciona por sí mismo acceso al agente. La API oficial de Migadu permite gestionar dominio, buzones y registros, pero exige una clave propia de la cuenta: utilizarla únicamente si se conecta mediante un mecanismo seguro. No pedir contraseñas ni claves por chat, pasarlas como argumentos o guardarlas en Git. No reutilizar las credenciales ni datos de FIXPilot.

La conexión de Porkbun está operativa mediante su [solicitud oficial PKCE](https://porkbun.com/llms/agent-setup), aunque no aparecía en el catálogo de conectores. Los permisos verificados son `read,dns`, sin compras. El titular aprobó el enlace y activó API Access del dominio. Las claves están en un selector privado fuera de Git y del navegador; se usan con los scripts de mantenimiento fijados a este dominio. No repetir autorización, solicitar claves por chat ni concluir que falta acceso por una lista vacía de bindings del entorno. La conexión no da acceso a la cuenta independiente de Migadu.

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
5. El export actual de Migadu propone `p=quarantine`; el plan conserva esa política. Completar MX/SPF/DKIM antes de activar envío y verificar todas las fuentes legítimas. No añadir `rua` a una dirección de informes aún no operativa. Si se incorpora Brevo, completar su autenticación/alineación antes de usarlo con esta política.
6. Guardar SMTP exclusivamente en el backend del proyecto Supabase `kkkemaycedexymrpaqtp`. Aplicar las plantillas y redirecciones exactas solo cuando el dominio y HTTPS estén verificados. Mantener cerrada el alta pública. La configuración preparada está descrita en [AUTH_MAIL_SETUP.md](AUTH_MAIL_SETUP.md).

## Comprobación antes de activar cuentas de clientes

- Resolver NS, A/AAAA o CNAME, MX, verificación, SPF, selectores DKIM entregados y DMARC. Confirmar propagación con las respuestas autoritativas y el proveedor.
- Verificar certificado HTTPS y redirección canónica sin errores ni bucles, sin alterar las URL conservadas de demostración.
- Probar recepción en admin/soporte y envío autorizado. Revisar en el mensaje recibido `Authentication-Results`: SPF, DKIM y DMARC, incluida alineación con el dominio visible. Los registros publicados no demuestran por sí solos entrega.
- Completar confirmación de cuenta y recuperación en el navegador que inicia PKCE, con un destinatario de prueba autorizado. Verificar enlaces de un solo uso, caducidad y límites sin crear empresas reales.
- Registrar fecha, destinatario autorizado, identificador de entrega y resultado sin guardar contenidos privados, tokens de enlace ni claves. Mantener pagos, SMS y consumo IA apagados.

Cuando se disponga de las conexiones, continuar automáticamente con los pasos autorizados. Si un proveedor exige pago, identidad o acceso que solo puede aportar el titular, presentar únicamente esa acción pendiente; la aprobación de Migadu ya consta.
