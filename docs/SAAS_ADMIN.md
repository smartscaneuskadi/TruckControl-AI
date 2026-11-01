# Administración de TruckControl AI

Aplicación: **https://truckcontrolai.com**. Único Supabase: **truckcontrol-ai / kkkemaycedexymrpaqtp**, organización fixpilot-dev. FIXPilot y merymery_16 siguen separados. [Entrega vigente](CURRENT_DELIVERY.md).

## Cuenta administradora y roles

**pedidos@smartscaneuskadi.com** tiene correo verificado, contraseña elegida por su titular y rol de superadministrador confirmado en servidor. Entra desde **Entrar en mi empresa**. El panel **Tu centro de administración** ofrece **Clientes**, **Módulos**, **Planes y cobros** y **Actividad**. No se ha generado ni almacenado su contraseña en nombre del propietario.

| Rol | Alcance |
| --- | --- |
| Superadministrador | Clientes, suspensión/reactivación, planes, precios, módulos y permisos IA. |
| Propietario de empresa | Empresa, equipo y operaciones autorizadas por licencia. |
| Administrador de empresa | Empresa y miembros según permisos efectivos. |
| Operador | Operaciones permitidas, sin administración global. |
| Consulta | Lectura autorizada, sin contabilizar ni modificar. |

RLS/servidor comprueban empresa, rol, licencia y módulos. La administración global no concede acceso indiscriminado a documentos de clientes. No suplantar sesiones ni utilizar metadatos editables para asignar roles.

## Altas y planes

Registro abierto después de verificar al propietario. El cliente completa empresa, identificación fiscal, dirección, contacto, correo y teléfono; acepta la versión legal vigente y confirma su correo. El servidor exige un recibo inmutable del consentimiento. El cliente elige contraseña tras verificar el correo. La nueva empresa recibe **10 días Full** y capacidad inicial de **50 camiones**.

| Plan | Base mensual | IVA 21 % | Total |
| --- | ---: | ---: | ---: |
| Básico | 300 € | 63 € | 363 € |
| Full | 700 € | 147 € | 847 € |

Edita precios en **Planes y cobros**. Conserva limited/full y contratos históricos. No reiniciar pruebas mediante metadatos ni acortar períodos concedidos. Vencimiento/suspensión conserva datos y deniega servicios según licencia. No hay cobro automático al vencer la prueba.

Estado comprobado: `registration_open=true`, `enforce_access=true`, `payments_enabled=false`, `sms_ready=false`, `prices_are_examples=false`. El correo de acceso usa enlaces nativos Supabase y Resend, sin SMTP Migadu. Cuotas conservadoras de 40 solicitudes/día y 1.000/mes para la plataforma, además de límites por correo/IP y proveedor. Revisar auditoría antes de repetir un envío; no contratar otro plan sin autorización.

## Servicios e IA

En **Módulos** se habilitan/deshabilitan servicios. En cada cliente se gestionan estado, plan y autorización IA. La IA exige licencia, módulo, autorización individual y consentimiento. Las claves solo están en backend/Vault/secretos de funciones: nunca en VITE, Git o mensajes.

OpenAI: **10 USD/mes antes de impuestos**, compartidos por toda la plataforma, sin recarga automática. Se reserva presupuesto antes de llamar; una respuesta desconocida conserva su reserva en vez de repetirse a ciegas. No ampliar límites sin aprobación.

Resend recibe facturas con dirección privada por empresa, firma e idempotencia. Mantener **revisión humana antes de contabilizar**. El reenvío funciona con distintos proveedores; Gmail OAuth directo sigue pendiente. Resend Free permanece sin upgrade/pay-as-you-go. SMS y cobros automáticos apagados.

## Mantenimiento y recuperación

Conservar las 48 migraciones y correspondencias, ramas GitHub y paquetes publicados. No ejecutar db push ni editar migraciones aplicadas a ciegas. Demo estable y candidata 8 son recuperables. Ante una incidencia, cerrar primero el registro/servicio afectado desde administración y conservar documentos/auditoría. No borrar clientes ni restaurar encima de datos actuales.

La recuperación de demo cubre solo datos locales, no toda Supabase/Storage. Antes de contratar un SLA, verificar copia/restauración aislada del servicio gestionado y definir retención. La recuperación de contraseñas sí tiene aceptación real. Una copia del código no equivale a una copia de documentos de clientes.

El asesor conserva un aviso previo de protección contra contraseñas filtradas; requiere Pro o superior y no se ha contratado. Falta aceptación física Android/Windows y revisión jurídica externa de los textos de ELEVADANCOR S.L. [Controles](CLIENT_LAUNCH.md), [guía anterior conservada](history/20261101-pre-client-production/SAAS_ADMIN.md).
