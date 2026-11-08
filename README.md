# TruckControl AI

Gestión de flotas con React, TypeScript, Supabase y PWA para Android y Windows.

**Aplicación publicada:** https://truckcontrolai.com · v32 / 0.5.20-rc.1. El registro exige confirmar el correo y cada empresa tiene datos y permisos propios. Los cobros siguen desactivados hasta verificar emisión y entrega fiscal efectivas.

**Demo histórica conservada:** https://truckcontrol-ai-fase-1.earlymug513.chatgpt.site, solo para datos ficticios.

## Capacidades verificadas

Hasta 50 camiones por empresa, conductores/asignaciones, remolques, clientes, viajes, ingresos/gastos, beneficio por camión, mantenimiento, repostajes, vencimientos, alertas, documentación privada, informes/CSV, roles y administración multiempresa. Temas Fleet Light/Cockpit y movimiento reducido. Copia empresarial cifrada y sincronización offline con alcance y límites explícitos.

Copiloto con ocho perfiles probados mediante conexiones reales: General, Documental, Financiero, Combustible, Mantenimiento, Conductores, Viajes y Dirección. Requiere módulos y consentimiento, muestra fuentes y prepara propuestas que el usuario confirma. Los avisos opcionales son reglas SQL sin consumo IA programado. No acredita predicción de averías, optimización GPS o emisión fiscal por mostrar una pantalla.

Oferta configurada y editable: 10 días Básico; Básico 300 EUR/mes + IVA21% = 363 EUR y Full 700 EUR/mes + IVA21% = 847 EUR. No hay cargos automáticos activados.

## Probar e instalar

Abre la aplicación. Explora con datos ficticios o solicita acceso y confirma tu correo. En una empresa con IA habilitada, entra en Copiloto y elige perfil; Documental exige seleccionar los archivos.

- Android: Chrome → menú → Instalar aplicación/Añadir a pantalla de inicio.
- Windows: Edge/Chrome → icono de instalación → Instalar.

La entrega actual es una PWA. Android firmado/Google Play aún no están acreditados. Android/Windows se han probado por emulación; no equivale a hardware físico.

## Lanzamiento comercial en curso

PR75 está integrado en main71c72 tras **1.526 controles por ejecución**. Supabase tiene **63 migraciones**, con la última aplicada una vez, fuente/ACL verificadas y contrato nativo completo con rollback. Los7Edge existentes se han actualizado; los nuevos workers de pagos/PDF/avisos siguen sin desplegar y con flags OFF. La web pública continúa en **v32**, sin una nueva promoción del frontend. [Estado y pruebas](TEST_RESULTS.md), [despliegue](DEPLOYMENT.md).

El ensayo PostgreSQL17 de PR77 tiene69controles y recuperación lógica aislada correctos; no acredita recuperación gestionada de Supabase/Auth/Storage ni dispositivos físicos. Cobros, emisión/entrega fiscal, Google público y revisión comercial siguen pendientes.

Proveedores y margen por viaje con costes vinculados ya pasan aceptación nativa Supabase; sus pantallas y copias cifradas v4 están integradas, pendientes de promover al frontend público. El candidato Android pasa compilación, lint, cinco pruebas JVM y revisión de su manifiesto; aún no tiene firma comercial, aceptación física ni publicación Play. Faltan completar emisión/entrega fiscal manual, cobros, revisión pública Google y recuperación integral alojada. Gmail personal y recepción empresarial son flujos diferentes; un consentimiento individual no sustituye la aprobación pública de Google.

[Avance](PROGRESS.md) · [Plan](TODO.md) · [Dependencias](BLOCKERS.md) · [Pruebas](TEST_RESULTS.md) · [Despliegue](DEPLOYMENT.md).

## Seguridad y mantenimiento

Supabase exclusivo: truckcontrol-ai / kkkemaycedexymrpaqtp, organización fixpilot-dev. FIXPilot separado. Hay 63 migraciones conciliadas; no ejecutar db push sin revisar versiones/nombres/hashes. Secretos solo en backend, originales privados y RLS. Ni chat ni Gmail personal se copian automáticamente offline.

Como referencia histórica, el head1866f8d de PR42 superó1.194 controles y5 JVM adicionales; [recibos](docs/verification/commercial-completion-20261108.json). Todavía no se ha desplegado ese frontend. V32 supera 1.107 controles, conserva las 64 pruebas originales mediante 11 hashes y acredita 8 conexiones IA y 75 hashes HTTPS. Las 8 llamadas se estiman en 0,019465 USD sin factura del proveedor; no es un saldo de caja. [Evidencia](docs/verification/ai-specialists-20261107.json).

El máximo 200 EUR es acumulado, no por servicio ni una orden de gasto. Se concilian costes previos y se verifican precio, impuestos y recurrencia antes de contratar. IA mantiene su límite global de 10 USD/mes y cuota compartida de 100 consultas por empresa.

Para mantenimiento: Node24 y dependencias fijadas. [Pruebas](docs/TESTING.md) y [operación](docs/MAINTENANCE.md). El cliente no ejecuta comandos. Nunca poner secretos en variables VITE_, commits o artefactos públicos.

[Portada anterior](docs/history/20261107-commercial-audit/README.md) · [Entrega](docs/CURRENT_DELIVERY.md) · [IA](docs/AI_SPECIALISTS.md) · [Administración](docs/SAAS_ADMIN.md) · [Recuperación](docs/COMPANY_RECOVERY.md).
