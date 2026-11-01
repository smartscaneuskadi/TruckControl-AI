# Operación y recuperación del dominio

## Conexión autorizada

Porkbun se ha conectado por su flujo oficial **PKCE**, sin copiar claves por el chat. La documentación que permite este flujo está en [agent-setup](https://porkbun.com/llms/agent-setup). La cuenta ha concedido `read` y `dns`; no se solicitaron permisos de compras, fondos ni alojamiento. Después el titular activó **API Access** únicamente en `truckcontrolai.com`.

Los scripts `porkbun_authorize.py`, `porkbun_client.py` y `configure_domain_dns.py` son herramientas de mantenimiento del backend. No se sirven al navegador ni se incluyen en la aplicación. El cliente solo admite los endpoints DNS de `truckcontrolai.com`; no admite compras, otros dominios, eliminación de registros ni cambios de servidores de nombres.

El selector privado del entorno es `/workspace/.truckcontrol-private/porkbun/credentials.json`. El directorio es del usuario del proceso, con permisos 0700, y el archivo es regular, con permisos 0600. No abrirlo para mostrar su contenido, copiarlo al repositorio, a variables `VITE_`, a artefactos de CI o a mensajes. El cliente lee ese selector dentro del proceso y solo envía los secretos a la API HTTPS oficial, sin seguir redirecciones. Los errores se muestran como códigos sin cuerpo de petición ni credenciales. Los metadatos de `cloud_environment` no incluyen este almacén privado: una lista vacía de bindings no significa que haya que pedir otra autorización.

## Herramientas para el mantenedor

El propietario no necesita ejecutar comandos. El agente puede utilizar:

```text
python3 scripts/porkbun_authorize.py verify
python3 scripts/configure_domain_dns.py prepare
python3 scripts/configure_domain_dns.py apply
```

`verify` comprueba el acceso y rechaza permisos superiores a DNS/lectura. `prepare` lee el inventario completo, guarda la zona y genera el cambio. Una zona con rutas ajenas, varios SPF, colisiones CNAME o registros desconocidos en los nombres gestionados bloquea la propuesta antes de escribir. La configuración ya correcta genera cero operaciones.

`apply` utiliza el plan previamente revisado, exige que el contenido objetivo y la zona sigan iguales, aplica ediciones/altas con claves de idempotencia y comprueba la lectura tras cada operación. Las altas se validan antes con el `dryRun` documentado del proveedor. Las ediciones se revisan localmente: no se presupone soporte de `dryRun` en endpoints que no lo declaran en su esquema. Si hay un cambio concurrente, se detiene y conserva el diario; no debe ejecutarse otro `prepare` sin conservar el punto original y analizar lo sucedido.

No usar el archivo BIND parcial como sustitución de toda la zona. El objetivo actual contiene veinte registros; los siete registros ajenos al cambio permanecieron intactos. El TTL propuesto es 600, frente a 3000 del export original de Migadu.

## Cambio aplicado

La intervención inicial actualizó cuatro registros y creó dieciséis, sin borrar ninguno. La zona pasó de once registros expuestos por la API a veintisiete. Se conservaron los cuatro NS, el comodín y las dos verificaciones ACME preexistentes. El informe público es [dns-activation-20261101.json](deployment/dns-activation-20261101.json); no incluye claves de acceso ni la zona privada completa.

Antes del cambio se conservaron `dns-before-first-change.json` y `dns-first-reviewed-plan.json`; al terminar, `dns-first-applied-journal.json`, todos en el mismo directorio privado. El primer punto del proveedor registrado después de la intervención es **2647452**, `before-edit`, del 01/11/2026 10:15:38 UTC. Porkbun informa doce entradas en ese punto; el inventario previo de su API exponía once. Conservar ambos como evidencias independientes.

Para una recuperación, comparar la zona actual con el inventario/diario y con el punto de Porkbun. Preparar un cambio que revierta únicamente nuestras operaciones y preserve cambios posteriores de otros operadores. No restaurar toda la zona con `prune`, ni mezclar automáticamente MX/SPF antiguos y nuevos. Una restauración que elimine datos necesita una decisión explícita sobre el cambio concreto.

## Alojamiento y límites actuales

`truckcontrolai.com` y `www.truckcontrolai.com` están ACTIVE con SSL activo en el proyecto candidato existente. Para resolver el 404 inicial del enrutador se republicó **la misma versión guardada 1**, fuente `e7a43948bff9bf3b3c5c37c890324ce6dc94852c`, despliegue `appgdep_6ae7123d2f2c8191b0a9b4c047f60837`, y se refrescaron los dos hostnames. No se cambió el código publicado ni la audiencia.

Los dieciséis recursos HTTPS comprobados en ambos dominios coinciden con el paquete probado. La demo estable mantiene su dirección y su hash. Las pruebas públicas de CI comprueban el origen de Sites, el dominio principal y www en perfiles Windows/Android; son emulaciones y no dispositivos físicos. Registro real, pagos e IA de consumo siguen cerrados.

El titular comunica que Migadu muestra el dominio activo. **Eso no demuestra recepción ni envío.** Las consultas de las claves DKIM en los destinos de Migadu han devuelto `SERVFAIL` por validación DNSSEC en Google y Cloudflare. Se conserva un informe para su proveedor. No se ha desactivado DNSSEC, alterado los destinos originales ni declarado SMTP funcional. Quedan comprobar buzones, conectar SMTP propio a Supabase y completar los flujos reales de confirmación y recuperación.
