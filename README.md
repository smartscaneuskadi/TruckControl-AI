## Actualización49 publicada y verificada · 16/11/2026 UTC

Vigente **https://truckcontrolai.com · Sites49 / 0.5.30-rc.1**, fuente `5f44a164700ea4cc803bb7cf480b664cce68af43`, despliegue `appgdep_6aface4569a48191ab5bd6c0008d40d2` SUCCEEDED. PR153 integrado en `3c1fe69486fe5eee5d15059de79f2f10ed87c5bb`. **Facturación → Ingresos/Gastos** permite Factura/Ticket/Albarán. Camiones y conductores incorporan originales múltiples, tipo/descripcion libre y vencimiento; fichas técnicas, identidad y permisos tienen categorías propias. Se conservan archivos con nombre repetido como originales distintos. Los movimientos históricos, importes, IVA y rentabilidad permanecen intactos.

Todas las CI finales de head4e08dfe y fuente5f44 SUCCESS. Por ejecución: **2035 unitarias/SQL,154Python,94demo,62empresa,274SaaS,98MFA,44FULL,68adjuntos/idiomas,20candidata,20producción y6perfiles del público previo**. Los64 originales/11 hashes intactos. PostgreSQL524controles/45contenciones/2restoreslógicos, incluyendo42controles y2carreras nuevos. Después de publicar: **68/68recorridos,105/105hashes HTTPS,6/6PWA,5/5salud y2/2denegaciones RPC anónimas**, sin fallos/omisiones/flaky. Aplicación/SDK publicados con HTTP privado ficticio bloqueado; emulación, sin nuevos modelos, buzones, cuentas gestionadas o hardware. Se conservan diagnósticos y sus correcciones, incluidas las etiquetas accesibles de la biblioteca original.

Supabase **76**, `20261116085827_billing_document_attachments`, SHA `1e93388efd2a890d73a1ca0839a27ff4fe39008c10f019d23e40d10c34bebfd3`, aplicada oficialmente una sola vez; bytes yMD5 iguales al historial. **No repetir76/75/74/anteriores/#37 ni editar SQL aplicado.** RLS por empresa y módulo financiero, bucket privado, sesión/SID/MFA y cache de permisos revisados. OID/ACL/verificador nativo y datos conservados; registroON/enforceON/cobrosOFF;0WARN/ERROR+3INFO deny-all. Los RPC anteriores siguen compatibles, y las copias6/4 leen formatos previos. Recuperar con frontend47/48 manteniendo76; no retirar columnas/datos.

Se conservan47 y **48 solo guardada como recuperación**, además de demo6 independiente. Main conserva manifiestoDEMO: no desplegar su build genérico como producción. No se activan cobros. Sin compras, compromisos o llamadas nuevas a IA; límites10USD/mes–100/empresa intactos y techo200EUR histórico sin conciliar. El propietario asume legal, ventas/facturación manual y pruebas físicas; Stripe LIVE no bloquea este modelo manual. WrapperAndroid9 compila, sin firma comercial/Play. Esta entrega acredita las funciones publicadas; no inventa aceptaciones externas de Google, recuperación gestionada o dispositivos.

[Guía de uso](docs/FINANCE_AND_ENTITY_DOCUMENTS.md). [Recibo completo](docs/verification/billing-attachments-published49-20261116.json). Las entradas siguientes conservan el historial de candidatas y publicaciones anteriores.

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

PR75 está integrado en main71c72 tras **1.526 controles por ejecución**. Supabase tiene **63 migraciones**, con la última aplicada una vez, fuente/ACL verificadas y contrato nativo completo con rollback. Los7Edge existentes y3workers de pagos/PDF/avisos se han desplegado con fuentes verificadas; las funciones comerciales de los workers permanecen OFF y sin scheduler de avisos. La web pública continúa en **v32**, sin una nueva promoción del frontend. [Estado y pruebas](TEST_RESULTS.md), [despliegue](DEPLOYMENT.md) y [recibo nativo63](https://github.com/smartscaneuskadi/TruckControl-AI/blob/9a2c0227bf4c2b2a5fe836c9b812a723d37d475d/docs/verification/session-fiscal-pipeline-native-20261108.json).

El ensayo PostgreSQL17 de PR77, integrado mediante PR78, tiene69controles y recuperación lógica aislada correctos; no acredita recuperación gestionada de Supabase/Auth/Storage ni dispositivos físicos. Cobros, emisión/entrega fiscal, Google público y revisión comercial siguen pendientes.

Proveedores y margen por viaje con costes vinculados ya pasan aceptación nativa Supabase; sus pantallas y copias cifradas v4 están integradas, pendientes de promover al frontend público. El candidato Android pasa compilación, lint, cinco pruebas JVM y revisión de su manifiesto; aún no tiene firma comercial, aceptación física ni publicación Play. Faltan completar emisión/entrega fiscal manual, cobros, revisión pública Google y recuperación integral alojada. Gmail personal y recepción empresarial son flujos diferentes; un consentimiento individual no sustituye la aprobación pública de Google.

[Avance](PROGRESS.md) · [Plan](TODO.md) · [Dependencias](BLOCKERS.md) · [Pruebas](TEST_RESULTS.md) · [Despliegue](DEPLOYMENT.md).

El conector Stripe está disponible en sandbox ELEVADANCOR; las credenciales backend y la aceptación real siguen pendientes. Gmail está configurado, con0buzones empresariales vinculados en la última comprobación. La organización Supabase ya era Pro; no hubo upgrade. La protección de contraseñas filtradas sigue pendiente de configurar/verificar.

## Seguridad y mantenimiento

Supabase exclusivo: truckcontrol-ai / kkkemaycedexymrpaqtp, organización fixpilot-dev. FIXPilot separado. Hay 63 migraciones conciliadas; no ejecutar db push sin revisar versiones/nombres/hashes. Secretos solo en backend, originales privados y RLS. Ni chat ni Gmail personal se copian automáticamente offline.

Como referencia histórica, el head1866f8d de PR42 superó1.194 controles y5 JVM adicionales; [recibos](docs/verification/commercial-completion-20261108.json). Todavía no se ha desplegado ese frontend. V32 supera 1.107 controles, conserva las 64 pruebas originales mediante 11 hashes y acredita 8 conexiones IA y 75 hashes HTTPS. Las 8 llamadas se estiman en 0,019465 USD sin factura del proveedor; no es un saldo de caja. [Evidencia](docs/verification/ai-specialists-20261107.json).

El máximo 200 EUR es acumulado, no por servicio ni una orden de gasto. Se concilian costes previos y se verifican precio, impuestos y recurrencia antes de contratar. IA mantiene su límite global de 10 USD/mes y cuota compartida de 100 consultas por empresa.

Para mantenimiento: Node24 y dependencias fijadas. [Pruebas](docs/TESTING.md) y [operación](docs/MAINTENANCE.md). El cliente no ejecuta comandos. Nunca poner secretos en variables VITE_, commits o artefactos públicos.

[Portada anterior](docs/history/20261107-commercial-audit/README.md) · [Entrega](docs/CURRENT_DELIVERY.md) · [IA](docs/AI_SPECIALISTS.md) · [Administración](docs/SAAS_ADMIN.md) · [Recuperación](docs/COMPANY_RECOVERY.md).
