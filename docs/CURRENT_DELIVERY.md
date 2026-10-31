# TruckControl AI 0.4.0-rc.1 — candidata publicada

**Candidata pública:** https://truckcontrol-ai-candidata.earlymug513.chatgpt.site. Pulsa **Abrir demostración**. Su versión alojada es la 1 y utiliza exclusivamente datos ficticios; las cuentas comerciales y los cobros están cerrados.

**Demo anterior conservada:** https://truckcontrol-ai-fase-1.earlymug513.chatgpt.site, versión 6, sin cambios en su índice ni en su alojamiento. Ambas direcciones tienen almacenamiento local independiente. La entrega anterior se conserva en `history/20261031/CURRENT_DELIVERY-0.3.0.md`.

## Código y publicación

Repositorio: https://github.com/smartscaneuskadi/TruckControl-AI. Trabajo de aplicación en [PR #5](https://github.com/smartscaneuskadi/TruckControl-AI/pull/5), rama `feat/commercial-release-candidate`. La fuente publicada está en `deploy/commercial-candidate`, commit `e7a43948bff9bf3b3c5c37c890324ce6dc94852c`; solo cambia la identidad de alojamiento respecto al código revisado.

La candidata está separada de la demo estable. El paquete publicado coincide con el commit limpio, incluye procedencia en `release.json` y se ha comprobado que los ocho recursos HTTPS verificados coinciden con el paquete: índice, JavaScript, CSS, service worker, manifiesto, metadatos e iconos. La compilación candidata rechaza incluir conexión Supabase y sus formularios de credenciales permanecen cerrados.

## Verificación

**271 pruebas aprobadas en el CI del código publicado:** 180 unitarias/SQL, 7 de correo y 84 recorridos de navegador (42 demo, 8 empresas, 28 SaaS y 6 candidata). Se conservan las 64 originales y sus hashes. [CI de despliegue](https://github.com/smartscaneuskadi/TruckControl-AI/actions/runs/41242229327), [CI del PR](https://github.com/smartscaneuskadi/TruckControl-AI/actions/runs/41242180084).

Se probaron consentimiento ligado a versión, cancelación, impagos, duplicados, aislamiento, recuperación local y sincronización, accesibilidad y arranque sin red. Los perfiles Windows/Android son emulaciones Chromium, no dispositivos físicos. La comprobación adicional de la URL pública en navegadores se ejecuta desde GitHub después de registrar esta publicación; el estado se conservará en el informe de la entrega.

Supabase independiente `truckcontrol-ai` (`kkkemaycedexymrpaqtp`, organización `fixpilot-dev`): **39 migraciones**, cuatro funciones Edge y almacenamiento privado. La nueva `truckcontrol-subscriptions` está ACTIVE v1. PostgreSQL real pasó el ensayo de facturación con rollback; no quedan filas sintéticas. La interfaz pública rechaza autenticación, origen, método y firma inválidos. El asesor de seguridad no informa incidencias. Registro y pagos siguen apagados. FIXPilot permanece intacto.

## Apertura comercial pendiente

Esta publicación es una candidata de demostración; **todavía no es el lanzamiento 1.0 para empresas reales**. Faltan dominio comprado/DNS, correo real y administrador verificado, autorización y configuración de proveedores, presupuesto de IA, condiciones/fiscalidad, recuperación comercial y aceptación física cuando haya dispositivos disponibles. El envío real de correo y la pasarela no se declaran verificados con pruebas simuladas. No se han activado cargos.

El dominio sigue pendiente de compra. Se ha propuesto Migadu Micro (19 USD/año) y Brevo gratuito para correo, sin contratar nada. La selección del proyecto de OpenAI del formulario oficial sigue pendiente; todavía no hay clave ni consumo autorizado.

[Instalación Android y Windows](INSTALLATION.md) · [Detalle de la candidata](RELEASE_0_4_RC.md) · [Lanzamiento comercial](COMMERCIAL_LAUNCH.md) · [Registro persistente](PROGRESS.md).
