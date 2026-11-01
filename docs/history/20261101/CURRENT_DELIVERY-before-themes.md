# TruckControl AI 0.4.0-rc.1 — candidata publicada

**Candidata pública en el dominio definitivo:** https://truckcontrolai.com. También responde https://www.truckcontrolai.com y se conserva https://truckcontrol-ai-candidata.earlymug513.chatgpt.site. Pulsa **Abrir demostración**. Su versión alojada sigue siendo la 1 y utiliza exclusivamente datos ficticios; las cuentas comerciales y los cobros están cerrados.

**Demo anterior conservada:** https://truckcontrol-ai-fase-1.earlymug513.chatgpt.site, versión 6, sin cambios en su índice ni en su alojamiento. Las direcciones tienen almacenamiento local independiente. La entrega anterior se conserva en `history/20261031/CURRENT_DELIVERY-0.3.0.md`.

## Código y publicación

Repositorio: https://github.com/smartscaneuskadi/TruckControl-AI. Trabajo de aplicación en [PR #5](https://github.com/smartscaneuskadi/TruckControl-AI/pull/5), rama `feat/commercial-release-candidate`. La fuente publicada está en `deploy/commercial-candidate`, commit `e7a43948bff9bf3b3c5c37c890324ce6dc94852c`; solo cambia la identidad de alojamiento respecto al código revisado.

La candidata está separada de la demo estable. El paquete publicado coincide con el commit limpio e incluye procedencia en `release.json`. Los ocho recursos comprobados en cada dominio nuevo (dieciséis en total) coinciden con el paquete: índice, JavaScript, CSS, service worker, manifiesto, metadatos e iconos. Para resolver el 404 inicial del enrutador se republicó la misma versión guardada 1, sin cambiar fuente ni audiencia; despliegue `appgdep_6ae7123d2f2c8191b0a9b4c047f60837`. Ambos hostnames y certificados están ACTIVE. La compilación candidata rechaza incluir conexión Supabase y sus formularios de credenciales permanecen cerrados.

## Verificación

**271 pruebas aprobadas en el CI del código publicado:** 180 unitarias/SQL, 7 de correo y 84 recorridos de navegador (42 demo, 8 empresas, 28 SaaS y 6 candidata). Se conservan las 64 originales y sus hashes. [CI de despliegue](https://github.com/smartscaneuskadi/TruckControl-AI/actions/runs/41242229327), [CI del PR](https://github.com/smartscaneuskadi/TruckControl-AI/actions/runs/41242180084).

Se probaron consentimiento ligado a versión, cancelación, impagos, duplicados, aislamiento, recuperación local y sincronización, accesibilidad y arranque sin red. Los perfiles Windows/Android son emulaciones Chromium, no dispositivos físicos. La URL pública también ha pasado los perfiles de Windows y Android en GitHub, con validación TLS activa, comprobando procedencia, registro cerrado, planes y entrada a la demo. [CI de la URL real](https://github.com/smartscaneuskadi/TruckControl-AI/actions/runs/41242941858).

Supabase independiente `truckcontrol-ai` (`kkkemaycedexymrpaqtp`, organización `fixpilot-dev`): **39 migraciones**, cuatro funciones Edge y almacenamiento privado. La nueva `truckcontrol-subscriptions` está ACTIVE v1. PostgreSQL real pasó el ensayo de facturación y el de capacidad: 50 camiones permitidos, rechazo del 51 y aislamiento de 2.100 apuntes entre dos empresas. Se revirtieron todos los registros sintéticos; no se afirma un SLA de rendimiento a partir de ese ensayo. La interfaz pública rechaza autenticación, origen, método y firma inválidos. El asesor de seguridad no informa incidencias. Registro y pagos siguen apagados. FIXPilot permanece intacto.

El mantenimiento de DNS añade dieciséis pruebas de PKCE, permisos, conservación y concurrencia: pasan las **23 pruebas Python** y la comprobación de los once archivos originales. El CI de [PR #7](https://github.com/smartscaneuskadi/TruckControl-AI/pull/7) comprueba los tres orígenes públicos en perfiles Windows/Android. [Operación y recuperación del dominio](DOMAIN_DNS_OPERATIONS.md).

## Apertura comercial pendiente

Esta publicación es una candidata de demostración; **todavía no es el lanzamiento 1.0 para empresas reales**. Faltan correo real y administrador verificado, autorización y configuración de proveedores, presupuesto de IA, condiciones/fiscalidad, recuperación comercial y aceptación física cuando haya dispositivos disponibles. El envío real de correo y la pasarela no se declaran verificados con pruebas simuladas. El agente no ha ejecutado nuevos cargos.

**Dominio y DNS/HTTPS configurados directamente mediante el acceso oficial de Porkbun.** El plan conjunto de veinte registros está aplicado y comprobado; se editaron cuatro, añadieron dieciséis y conservaron los otros siete, sin borrar ninguno. [Informe de activación](deployment/dns-activation-20261101.json). La cuenta concedió solo DNS/lectura; no se han hecho compras.

**Migadu Micro anual pagado y dominio activo según el titular.** Los CNAME publicados coinciden con el export original, pero sus tres destinos DKIM bajo migadu.com fallan validación DNSSEC en Google y Cloudflare. [Diagnóstico](deployment/migadu-dkim-dnssec-20261101.json) y [solicitud para soporte](deployment/migadu-dnssec-support.txt). Buzones, SMTP, envío y recepción reales no se han verificado. No repetir pago, alta, autorización de Porkbun ni petición de registros. Brevo gratuito sigue propuesto para correo automático. La selección de OpenAI continúa pendiente, sin clave ni consumo autorizado. Continuidad: [DOMAIN_AND_MAIL.md](DOMAIN_AND_MAIL.md).

[Instalación Android y Windows](INSTALLATION.md) · [Detalle de la candidata](RELEASE_0_4_RC.md) · [Lanzamiento comercial](COMMERCIAL_LAUNCH.md) · [Registro persistente](PROGRESS.md).
