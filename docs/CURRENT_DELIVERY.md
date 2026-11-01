# TruckControl AI 0.5.2-rc.1 — correo y facturas de cualquier proveedor

**Candidata 8 publicada:** https://truckcontrolai.com, https://www.truckcontrolai.com y https://truckcontrol-ai-candidata.earlymug513.chatgpt.site. Despliegue `appgdep_6ae77f9666388191a9fa987bed562089`, 01/11/2026 18:06:28 UTC. Los 24 archivos coinciden por SHA-256 en los tres orígenes: **72 verificaciones HTTPS**; la demo estable v6 mantiene su hash. [Inventario](deployment/candidate-hosting.json) e [informe HTTPS](verification/general-mail-https-20261101.json).

Fuente publicada: `ba7a226f976a0eb52b8e28f2407d78384edced53`, rama `deploy/pricing-candidate-20261101`. [PR #13](https://github.com/smartscaneuskadi/TruckControl-AI/pull/13), `feat/general-company-mail`. La demo estable permanece separada y la candidata anterior puede restaurarse.

## Probar

Abrir https://truckcontrolai.com → Explorar la demo → Correo y facturas → Probar correo ficticio. Revisar el adjunto, importarlo y completar los datos antes de confirmar el gasto. La candidata no acepta correos empresariales reales. Los adjuntos ficticios se vacían al salir; los gastos confirmados permanecen y el mismo documento no se contabiliza dos veces. La prueba también funciona sin red una vez instalada la PWA. [Instalación](INSTALLATION.md).

## Alcance del correo

Se importan EML, PDF, JPG, PNG y WebP; no hace falta Google para esta vía. Hasta 10 MB y cinco adjuntos, con validación de tipo, nombres neutralizados y duplicados por empresa. No se guardan ni ejecutan HTML, cuerpo o enlaces del correo. La extracción de importes mediante IA permanece apagada; no se inventan resultados ni se registra un gasto al recibir un documento.

La conexión directa Gmail anterior se conserva. El reenvío desde Outlook, Microsoft 365, Gmail, Yahoo o un dominio propio tiene backend firmado y dirección independiente por empresa, pero sigue apagado hasta conectar y probar un receptor autorizado. IMAP/SMTP y Microsoft OAuth no están conectados; la importación no concede acceso al resto del buzón. [Guía y contrato](GENERAL_EMAIL.md).

## Base de datos y seguridad

Único proyecto: truckcontrol-ai, kkkemaycedexymrpaqtp. Migración aditiva CLI 20261101172906 aplicada como versión remota 20261101175756, 43 en total. company-mail ACTIVE v1, sus cinco archivos coinciden con el código revisado. Las otras cuatro funciones y AES permanecen intactas. Siete comprobaciones HTTP pasan; asesor de seguridad sin incidencias.

El módulo remoto de correo sigue cerrado por la administración. La prueba positiva remota se detuvo por ese permiso y revirtió; no se modifica el control para hacerla pasar. La prueba del módulo cerrado pasa en PostgreSQL remoto, con cero usuarios/empresas sintéticos después del rollback. La prueba positiva completa está ensayada en PostgreSQL local; debe repetirse remotamente al habilitar el módulo para aceptación. [Evidencia](verification/company-mail-backend-20261101.json).

## Validación y límites

256 unitarias/SQL, 23 Python, 64 demo, 22 empresas, 30 SaaS y 14 candidata pasan localmente; Deno, TypeScript y compilación PWA aprobados. Las 64 originales conservan los once hashes. Auditoría de dependencias de producción: cero vulnerabilidades. El [CI de la fuente exacta](https://github.com/smartscaneuskadi/TruckControl-AI/actions/runs/41334469182) aprobó esos 409 casos y seis recorridos de la publicación anterior: 415 comprobaciones. La revisión funcional de **esta v8** se exige de nuevo en los [checks del PR #13](https://github.com/smartscaneuskadi/TruckControl-AI/pull/13/checks), con `expected_universal_mail=true`: tres orígenes, Android/Windows, ambos temas, callback y correo ficticio sin red. Su resultado definitivo y capturas están en `public-test-results/verification.json` del CI; la coincidencia de archivos no sustituye ese control.

El CI de la primera fuente de despliegue detectó un contraste transitorio al cambiar de tema. La versión guardada 7 no se publicó. El CI antiguo de la rama de funcionalidad terminó después del cambio público y rechazó correctamente el inventario de v6 que todavía llevaba; se actualiza el inventario antes de repetir la comprobación de v8. La ejecución local del navegador contra HTTPS está limitada por su almacén de certificados; se utiliza el CI con TLS normal y no se desactiva la validación. La corrección elimina las interpolaciones de colores en controles y tarjetas, conservando animaciones de gráficos y preferencias de movimiento.

Fleet Light, Fleet Cockpit y modo del dispositivo permanecen en Configuración → Apariencia. La oferta sigue en diez días Full gratis, Básico 300 €/mes + IVA 21 % (363 €), Full 700 €/mes + IVA 21 % (847 €). Registro público, pagos e IA remota apagados.

Esta es una candidata con datos ficticios. Para clientes reales faltan correo SMTP/recuperación verificados, administrador verificado, aceptación remota del módulo y dos empresas autorizadas, proveedor de recepción o OAuth real, requisitos legales, recuperación comercial y aceptación en dispositivos físicos cuando estén disponibles. No acredita lanzamiento comercial 1.0.
