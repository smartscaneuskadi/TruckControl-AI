# Lanzamiento de TruckControl AI — estado vigente

**Producción conectada 9 publicada y registro de clientes abierto:** https://truckcontrolai.com. El correo, contraseña elegida y rol del propietario se verificaron en servidor antes de abrir. La demo estable sigue intacta y la candidata 8 es recuperable. [Entrega actual](CURRENT_DELIVERY.md), [controles](CLIENT_LAUNCH.md), [inventario](deployment/candidate-hosting.json).

Oferta: diez días Full gratuitos; Básico 300 €/mes + IVA 21 % (363 €); Full 700 €/mes + IVA 21 % (847 €). Hasta 50 camiones por empresa. **Cobros recurrentes y SMS apagados.** Abrir registro no activa contratación de proveedores ni cargos.

## Comprobado

- HTTPS y procedencia: 72 hashes de archivos coinciden en tres orígenes; fuente bcffa56f y versión 9.
- Auth nativo y Resend: confirmación, un solo uso, contraseña, login, recuperación y cierre global con datos ficticios; cuenta del propietario verificada por su titular.
- Consentimiento versionado inmutable, RLS y dos empresas aisladas; pruebas remotas con rollback, sin fixtures residuales del ensayo.
- 48 migraciones aplicadas una vez; ningún cambio en FIXPilot.
- Recepción real de tres correos ficticios, originales privados, idempotencia y lectura IA opcional sin gastos automáticos.
- CI del código desplegado: 548 comprobaciones; preservadas las 64 originales. Los seis recorridos públicos de ese CI eran de la candidata anterior; la aceptación v9 se guarda por separado.

## Operación y autorizaciones

OpenAI está limitado a 10 USD/mes antes de impuestos, sin recarga automática. Resend permanece en el alcance Free aprobado. Migadu Micro ya fue pagado por el propietario. No se han contratado upgrades. Los secretos se mantienen en backend; no reproducir descripciones administrativas con valores secretos.

El panel del propietario permite clientes, módulos, planes y actividad. Los precios se modifican conservando contratos históricos. El vencimiento de prueba suspende servicios según licencia, conserva datos y no genera un cargo. [Administración](SAAS_ADMIN.md), [instalación](INSTALLATION.md).

## Límites y tareas posteriores

Gmail OAuth directo y revisión Google; SMS; pasarela y aceptación de cobros reales; buzones Migadu/DKIM; restauración completa/SLA; aceptación en dispositivos físicos; revisión jurídica externa. El aviso previo de protección alojada contra contraseñas filtradas requiere un plan Pro o superior, no contratado. Ninguna copia del código acredita por sí sola una copia/restauración de los documentos empresariales.

Las fases previas y sus estados se conservan en [historial](history/20261101-pre-client-production/COMMERCIAL_LAUNCH.md). No reutilizarlos como motivo para repetir claves, pagos o permisos ya resueltos. No presentar integraciones pendientes como verificadas ni declarar certificación comercial completa.
