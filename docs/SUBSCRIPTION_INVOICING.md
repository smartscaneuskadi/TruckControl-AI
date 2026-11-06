# Facturación de las suscripciones de TruckControl AI

## Emisor aprobado por el titular

- ELEVADANCOR S.L.
- CIF B02993426.
- Polígono Arzabalza, n.º 50, **20400 Tolosa**.
- Contacto público: pedidos@smartscaneuskadi.com.

Estos datos identifican al proveedor que vende TruckControl AI. No sustituyen los datos de las empresas clientes que gestionan sus propias facturas y gastos dentro de la plataforma. La fuente central sigue siendo `src/domain/legal.ts`; se corrige el código postal sin reescribir los recibos históricos de aceptación ni cambiar la versión de contrato.

La página pública y la cuenta de planes muestran la identidad fiscal completa. La cuenta autenticada muestra además los datos del comprador disponibles en su perfil. Esa información permanece en su sesión y no se añade al catálogo público, las copias offline o los mensajes a otros clientes.

## Estado y límite de esta entrega

**La emisión y el envío automático de facturas fiscales de suscripción todavía no están conectados.** El flujo anterior guardaba una solicitud de plan y avisaba al administrador; no emitía ni entregaba una factura al comprador. No se presenta ese aviso como automatización ni se sustituye una factura fiscal por una proforma o un justificante de pago.

Antes del cambio, Supabase confirmó 57 migraciones, `payments_enabled=false` y `prices_are_examples=true`. Se conservan la prueba gratuita de diez días, Básico 300 € + 63 € de IVA = 363 €/mes y Full 700 € + 147 € de IVA = 847 €/mes. No se habilitan cobros, envíos reales, servicios de pago, certificados ni consumos de IA. No se crea deuda o factura por solicitar la prueba o expresar interés en un plan mientras los cobros están apagados.

## Condición para habilitar nuevas compras

La verificación HTTP también detectó que ambos servicios respondían con el origen de la demo anterior y rechazaban `https://truckcontrolai.com`. Se corrige el destino predeterminado y se permite exclusivamente principal, www y hostname técnico de producción. Las cabeceras CORS se calculan por petición, sin mutación compartida. Demo, imitaciones del dominio, HTTP y terceros quedan rechazados; la autenticación y los permisos siguen siendo obligatorios. No se modifica la demo alojada.

Los dos handlers de pago exigen ahora una comprobación explícita de facturación: `BILLING_INVOICING_VERIFIED=true`. El valor predeterminado es cerrado. **Esta variable es un control de lanzamiento, no un motor de facturas ni una prueba de integración por sí misma. No activarla para saltar la tarea pendiente.**

Solo debe habilitarse tras conectar y verificar la emisión fiscal y entrega automática, además de la autorización independiente de cobros ya existente. La clave de Stripe, una marca enviada por el navegador o una respuesta antigua sin ese campo no bastan. El estado recurrente publica `invoice_delivery_ready`; el cliente antiguo que no lo recibe conserva el bloqueo de nuevas compras en la interfaz actual. Cancelar renovaciones y procesar eventos de pago firmados anteriores siguen disponibles; emitir o enviar una factura nunca debe activar acceso por sí solo.

## Próximo paso imprescindible

Se ha preguntado al titular qué programa de facturación utiliza ELEVADANCOR S.L. y si está conectado a TicketBAI. El domicilio de Tolosa requiere comprobar el régimen fiscal aplicable y, en su caso, un software garante, firma y remisión válidos; no se da por confirmado el régimen solo por el domicilio. No se ha contratado un proveedor, inventado números fiscales, emitido facturas reales ni firmado declaraciones por el propietario.

Para completar el flujo solicitado:

1. Identificar el sistema fiscal, el régimen, la serie y la numeración existentes; conectar su API por el almacén seguro o autorización oficial. No copiar claves ni certificados al chat o al repositorio. Una contratación o ampliación de costes necesita aprobación.
2. Al solicitar realmente el pago de la suscripción, tomar del servidor la identidad verificada del comprador, el emisor y la oferta aceptada. Emitir en ese momento mediante el sistema fiscal y entregar automáticamente al correo del cliente y a su cuenta, sin encargar un envío posterior al administrador. Una prueba gratuita no es una compra.
3. Hacer idempotentes emisión, entrega y reintentos: una solicitud/revisión/periodo, una factura y una serie legal. Conservar instantáneas inmutables y auditoría; un fallo de red no debe crear facturas duplicadas. Una factura pendiente de pago debe indicarlo y solo un pago confirmado puede cambiar su estado.
4. Guardar originales privados, con consulta y descarga limitada al comprador autorizado; no compartirlos con otras empresas ni incluirlos en cachés públicas/offline. Separar estas facturas de las facturas de proveedores importadas por Gmail.
5. Probar solicitud, entrega, descarga, IVA, impago, renovación, fallos y reintentos, duplicados, cancelación y aislamiento con datos ficticios en el entorno de pruebas del proveedor. Comprobar las obligaciones de facturación electrónica aplicables antes de producción.
6. Solo tras la aceptación anterior y la autorización de cobro, habilitar el control de facturación y, por separado, los cobros reales. No tratar la activación de un flag como validación fiscal.

## Verificación

Las nuevas pruebas ejercitan la denegación de compras aun con clave de pago y aceptación, la imposibilidad de autorizarse desde el navegador, la compatibilidad cerrada con un backend anterior y la cancelación sin nuevas ventas. Los recorridos de navegador comprueban los datos públicos, las páginas legales, los datos separados de vendedor/comprador y ambos temas en Android y Windows emulados. No se emiten facturas, se realizan cargos ni se envían mensajes a clientes reales durante estos controles.

Fuentes oficiales consultadas el 06/11/2026: [reglamento de facturación, BOE](https://www.boe.es/buscar/act.php?id=BOE-A-2012-14696), [TicketBAI: certificados y software garante](https://www.euskadi.eus/certificados-ticketbai/web01-ejeduki/es/) y [preguntas frecuentes de la Diputación de Gipuzkoa](https://www.gipuzkoa.eus/documents/2456431/13761128/1-FAQ-TEXTO%2BUNIFICADO%2B19-05-2021.pdf/029ebb00-0fb1-aefe-cfde-2bae0eef4dd6). Estas referencias no sustituyen la confirmación del régimen y del sistema concreto del titular.

## Publicación y recuperación

Publicada **v29 / 0.5.17-rc.1** el 06/11/2026 en https://truckcontrolai.com, fuente `8ab1df0336e99619c395ddc3769b272ccd9fd06a`, despliegue `appgdep_6aed847e2c6c81919886fe7833ea2f38`. La fuente exacta supera 899 controles: 633 unitarios/SQL, 32 Python, 64 demo, 50 empresas, 80 SaaS, 14 candidata, 20 producción y seis públicos de la versión anterior antes de desplegar. Las 64 pruebas originales conservan sus once hashes. Veinte controles HTTP comprueban ambos servicios nativos v10 y nueve fuentes coinciden; 75 archivos HTTPS coinciden con el artefacto. Se conservan producción28 y demo6. La aceptación pública posterior con emisor y domicilio completos queda vinculada en [PR #33](https://github.com/smartscaneuskadi/TruckControl-AI/pull/33/checks) y su artefacto `public-test-results/verification.json`. Los dos checks paralelos anteriores coincidieron con el despliegue y fallaron al cargar una página legal; la publicación nueva exige su inventario y aceptación posterior, sin ocultar esos fallos.

La publicación de los datos fiscales y los controles anteriores **no activa la emisión automática de facturas reales**. [Evidencia detallada](verification/subscription-invoicing-20261106.json). El directorio persistente `/workspace/artifacts/truckcontrol-billing-issuer-20261106` conserva el bundle previo de todas las referencias, las fuentes anteriores del backend, artefactos, hashes y checkpoint. No restaurar la demo sobre producción ni reactivar ventas sin completar la integración fiscal.
