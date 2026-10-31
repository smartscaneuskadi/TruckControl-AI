# Administración de TruckControl AI

## Destino y condiciones

Proyecto independiente `truckcontrol-ai` (`kkkemaycedexymrpaqtp`), organización `fixpilot-dev`. Datos, usuarios, archivos y credenciales separados de FIXPilot. No se ha contratado ningún plan de pago. El prototipo merymery_16 permanece pausado con su contenido conservado.

Condiciones vigentes: prueba Full de **30 días** y plan **Inicial a 10 €/mes como ejemplo editable**, hasta 50 camiones. El plan Full se conserva internamente pero no se anuncia como una segunda oferta vigente. Las fechas se calculan en PostgreSQL; editar metadatos, crear otra empresa o reanudar la cuenta no reinicia la prueba. Al expirar o suspender, se conservan los datos y se deniega su uso hasta resolver la licencia.

## Cuentas y roles

La cuenta de superadministrador está reservada a **pedidos@smartscaneuskadi.com**, una vez confirmado el correo por Auth. No se ha creado una identidad ni una contraseña en nombre del propietario. Ningún metadato de registro permite obtener administración global.

| Rol | Alcance |
| --- | --- |
| Superadministrador | Clientes, suspensión/reactivación, planes, precios, módulos, autorización IA y auditoría administrativa. |
| Propietario de empresa | Datos propios, equipo, conexión Gmail y operaciones permitidas por su plan. |
| Administrador de empresa | Gestión de la empresa y equipo según permisos efectivos. |
| Operador | Operaciones y escrituras autorizadas, sin gestionar conexión OAuth o permisos de equipo. |
| Consulta | Lectura autorizada; no escribe ni contabiliza. |

Los usuarios invitados necesitan una cuenta confirmada y aceptar la invitación. El servidor comprueba la pertenencia, rol y restricciones del miembro en cada operación. El superadministrador no recibe acceso indiscriminado a documentos empresariales desde el navegador.

## Registro

El portal muestra los precios antes de pedir acceso. El cliente aporta contacto, empresa, identificación fiscal, dirección, correo y teléfono. La confirmación del correo permite aprovisionar empresa y prueba automáticamente. Si `sms_ready=true`, también se exige que Auth confirme exactamente el teléfono aportado. Si el proveedor SMS no está configurado, no se finge una comprobación ni se envían mensajes: el registro puede funcionar con correo confirmado y SMS opcional.

Actualmente **`registration_open=false`**. Falta configurar y probar SMTP, URL del sitio y redirecciones de Auth en el servicio alojado. `supabase/config.toml` documenta la configuración deseada pero no modifica automáticamente esos ajustes. La demo publicada no lleva credenciales de acceso comercial; no puede enviar altas reales.

## Controles de servicio

Estado remoto comprobado: `enforce_access=true`, `registration_open=false`, `sms_ready=false`, `payments_enabled=false`, `prices_are_examples=true`. Gmail, lectura IA de facturas y consulta documental IA están desactivados globalmente.

El panel permite cambiar precios y límites, publicar planes, suspender clientes y activar/desactivar módulos. Las funciones IA exigen a la vez módulo global, licencia, autorización individual del superadministrador y aceptación del usuario. Las claves de proveedores solo se configuran en el servidor. Activar un módulo sin proveedor no simula una conexión funcional.

No activar pagos ni consumo de proveedores sin la autorización comercial correspondiente. Los precios de ejemplo no generan checkout real. La preparación de pagos aún requiere credenciales, prueba de webhook, catálogo definitivo y decisión sobre renovación recurrente.

## Antes de abrir clientes reales

El responsable del despliegue debe comprobar el envío de confirmación y recuperación, redirecciones HTTPS, verificación del correo del administrador, aislamiento por empresa y restauración. Gmail requiere cliente OAuth oficial y, para el uso público de su alcance restringido, la revisión que Google exija. IA y SMS son opcionales y permanecen apagados mientras falten credenciales o autorización de coste.

No hay alta empresarial real, envío SMS, cobro o consumo IA activado por esta entrega. Los requisitos de proveedores externos son límites reales de producción, no tareas que se hayan sustituido por simulaciones.
