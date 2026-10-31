# Lanzamiento comercial 1.0 — trabajo en curso

## Recursos y conservación

La orden del 31/10/2026 reactiva el lanzamiento comercial y sustituye el aplazamiento anterior de los proveedores. Dominio elegido: **truckcontrolai.com**. La demo estable continúa en https://truckcontrol-ai-fase-1.earlymug513.chatgpt.site, versión 6, sin altas reales. No es todavía la versión comercial 1.0.

GitHub permite leer, escribir, crear ramas, hacer PR y ejecutar CI. La preparación de correo del PR #4 se integró en `main` (`81152d9b3c63c26b0bf016005504a73e024df3dd`) después de aprobar sus comprobaciones. El nuevo trabajo está en `feat/commercial-release-candidate`. Los permisos administrativos de protección de ramas/Pages siguen siendo distintos del permiso de escritura y no se eluden.

Se verificó otra copia completa del historial: `/workspace/artifacts/truckcontrol-commercial-baseline-20261031.bundle`. Las versiones alojadas y las ramas anteriores se conservan. El destino único de Supabase sigue siendo `kkkemaycedexymrpaqtp`, `truckcontrol-ai`, organización `fixpilot-dev`. FIXPilot permanece separado.

## Dominio y correo

Porkbun confirmó `AVAILABLE`, no premium, el 31/10/2026. Registro por un año: **11,08 USD**. Renovación publicada: **11,08 USD/año**; no es una garantía de precio futuro. La tasa ICANN está incluida; impuestos y conversión, si proceden, se confirman al pagar. Fuente y evidencia: [domain-quote-20261031.json](deployment/domain-quote-20261031.json), [tarifa oficial](https://api.porkbun.com/api/json/v3/pricing/get).

La compra no se ha realizado ni autorizado como un cargo ejecutable por el agente. El propietario pidió el enlace de pago: https://porkbun.com/checkout/search?q=truckcontrolai.com. El pago final depende de la sesión y facturación del propietario en el registrador; no existe un checkout autenticado accesible desde este entorno. No se ha añadido el dominio a un alojamiento ni modificado DNS ajenos.

Propuesta económica, pendiente de elección y contratación: [Migadu Micro](https://migadu.com/pricing/), 19 USD/año por cuenta con varias direcciones/buzones, 5 GB, 200 mensajes entrantes y 20 salientes al día; para admin@truckcontrolai.com, soporte@truckcontrolai.com y la dirección no-reply. [Brevo Free](https://help.brevo.com/hc/en-us/articles/208589409-About-Brevo-s-pricing-plans), 0 de cuota y 300 envíos diarios para mensajes transaccionales. El envío transaccional no debe consumir el pequeño límite saliente del buzón. Se deben revisar condiciones, región y tratamiento de datos antes de contratar. No se ha creado ni activado ninguna cuenta de estos proveedores. Los límites gratuitos no equivalen a disponibilidad o capacidad comercial ilimitadas.

Después de la compra y conexión segura: obtener del alojamiento los destinos DNS exactos, del proveedor de buzón sus MX/SPF y del transaccional sus verificaciones DKIM. Conservar un único SPF por nombre y no inventar claves DKIM. Crear DMARC con informes a un buzón ya operativo; endurecerlo después de comprobar todas las fuentes legítimas. Verificar recepción, cabeceras SPF/DKIM/DMARC, confirmación y recuperación de cuenta antes de abrir empresas. No se reutilizan credenciales de FIXPilot.

## Suscripción mensual preparada, todavía apagada

Se incorpora una pasarela separada `truckcontrol-subscriptions` sin sustituir el pago de un mes existente. Usa Checkout en modo `subscription`, precio mensual y fechas calculados en servidor, consentimiento versionado y una reserva única por cuenta. Conserva la prueba gratuita de la aplicación y los periodos ya abonados. El usuario puede solicitar cancelar la renovación o reactivarla; cancelar sigue permitido aunque se apaguen las ventas nuevas.

Solo una factura pagada verificada con Stripe y vinculada a la suscripción, usuario, pedido, precio y periodo correctos amplía el acceso. Volver de Checkout, una factura gratuita, un impago o un evento de estado no lo amplían. Hay deduplicación por evento y por factura, control de eventos retrasados y preservación de las suspensiones administrativas. Los historiales no son accesibles por otra cuenta. Las tablas están en `private`, con RLS y sin permisos de cliente; la entrada de servidor es `SECURITY INVOKER`, limitada a `service_role`.

Se prepara una migración nueva mediante CLI: `20261031181317_recurring_subscriptions.sql`. **Todavía no está aplicada en Supabase y la nueva función no está desplegada.** No repetir ni empujar las migraciones antiguas: sus versiones remotas y locales se reconciliaron mediante inventario. Las 37 migraciones remotas existentes permanecen intactas en este punto.

Para habilitar en el futuro se requieren credenciales seguras del proveedor, firma de webhook propia, autorización expresa de costes, condiciones comerciales publicadas y versionadas, fiscalidad acordada, prueba completa en el entorno de pruebas del proveedor y los controles del lanzamiento. `BILLING_RECURRING_ENABLED` sigue en `false`; tampoco se activan `payments_enabled` ni precios reales. Los cambios de precio afectan a nuevas solicitudes: no modifican en silencio los contratos de Stripe existentes. Reembolsos, disputas y cambios de contrato requieren un procedimiento comercial antes de activar cobros.

## IA y autorizaciones

El propietario ha autorizado **abrir el selector seguro de OpenAI para crear una credencial exclusiva**, sin activar consumo. Aún no se ha creado ni guardado una clave; falta completar la selección oficial. No enviar claves por el chat. La selección de proyecto, el destino privado y la autorización de cualquier presupuesto de uso son pasos separados. No hacer llamadas de pago por el mero hecho de disponer de una clave.

La autorización de administración de Auth/SMTP sigue pendiente; el conector actual de Supabase no ofrece un ajuste de SMTP alojado. Las plantillas y la aplicación parcial controlada de configuración están preparadas en `scripts/configure_auth_mail.py`; su estado no prueba entrega real. El dominio nuevo aún no puede utilizarse como remitente ni redirección final.

## Verificación y siguiente punto de reanudación

Han pasado 179 pruebas unitarias/SQL, 7 de configuración de correo, TypeScript y compilación PWA. Se mantienen las 64 pruebas originales y la comprobación SHA-256 de sus once archivos. Las pruebas nuevas cubren destino Supabase independiente, separación de recibos, facturas duplicadas, firma, consentimiento, periodos, impagos y cancelación. Todas las llamadas Stripe de esas pruebas están simuladas; no son un ensayo de la pasarela real.

Antes de promover esta rama: completar el CI de navegadores sobre el commit final, añadir aceptación de la nueva interfaz de suscripciones, revisar y aplicar una sola vez la migración nueva con pruebas de rollback en el proyecto autorizado, desplegar la función con cobros desactivados y preparar el alojamiento candidato separado. La demo estable no se sustituye para probar estos cambios.

Siguen bloqueando el lanzamiento para clientes: dominio y DNS/HTTPS definitivos, proveedor SMTP y entrega real, alta verificada del administrador, validación de dos cuentas autorizadas de empresas, recuperación comercial, información legal del titular y condiciones, aceptación física Android/Windows cuando estén disponibles. Gmail y Google login requieren su cliente OAuth, consentimiento/revisión y secretos independientes; no bloquean los módulos básicos. Los servicios de IA y los pagos necesitan presupuesto aprobado y pruebas reales autorizadas antes de activarse.
