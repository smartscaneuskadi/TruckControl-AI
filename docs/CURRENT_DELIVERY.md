# TruckControl AI 0.5.2-rc.1 — correo y facturas de cualquier proveedor

**Candidata 8 publicada:** https://truckcontrolai.com, https://www.truckcontrolai.com y https://truckcontrol-ai-candidata.earlymug513.chatgpt.site. Despliegue `appgdep_6ae77f9666388191a9fa987bed562089`, 01/11/2026 18:06:28 UTC. Los 24 archivos coinciden por SHA-256 en los tres orígenes: **72 verificaciones HTTPS**; la demo estable v6 mantiene su hash. [Inventario](deployment/candidate-hosting.json) e [informe HTTPS](verification/general-mail-https-20261101.json).

Fuente publicada: `ba7a226f976a0eb52b8e28f2407d78384edced53`, rama `deploy/pricing-candidate-20261101`. [PR #13](https://github.com/smartscaneuskadi/TruckControl-AI/pull/13), `feat/general-company-mail`. La demo estable permanece separada y la candidata anterior puede restaurarse.

## Probar

Abrir https://truckcontrolai.com → Explorar la demo → Correo y facturas → Probar correo ficticio. Revisar el adjunto, importarlo y completar los datos antes de confirmar el gasto. La candidata no acepta correos empresariales reales. Los adjuntos ficticios se vacían al salir; los gastos confirmados permanecen y el mismo documento no se contabiliza dos veces. La prueba también funciona sin red una vez instalada la PWA. [Instalación](INSTALLATION.md).

## Alcance del correo

Se importan EML, PDF, JPG, PNG y WebP; no hace falta Google para esta vía. Hasta 10 MB y cinco adjuntos, con validación de tipo, nombres neutralizados y duplicados por empresa. No se guardan ni ejecutan HTML, cuerpo o enlaces del correo. La candidata ficticia no llama a modelos; el backend independiente ya dispone de lectura IA probada y con presupuesto aprobado. No se inventan resultados ni se registra un gasto al recibir un documento.

La conexión directa Gmail anterior se conserva. El reenvío desde Outlook, Microsoft 365, Gmail, Yahoo o un dominio propio tiene backend firmado y dirección independiente por empresa, pero sigue apagado hasta conectar y probar un receptor autorizado. IMAP/SMTP y Microsoft OAuth no están conectados; la importación no concede acceso al resto del buzón. [Guía y contrato](GENERAL_EMAIL.md).

## Base de datos y seguridad

Único proyecto: truckcontrol-ai, kkkemaycedexymrpaqtp. El backend incorpora ya la migración aditiva de proveedor `20261101191806`, aplicada una sola vez como `20261101194201`: **44 migraciones**. Funciones ACTIVE: company-assistant v9, company-gmail v10, company-mail v9 y company-mail-resend v1. Los 26 archivos de sus paquetes coinciden con la fuente revisada; AES de Gmail permanece intacto. Pasan 22 comprobaciones HTTP con TLS y el asesor de seguridad no devuelve incidencias. [Evidencia vigente](verification/ai-provider-backend-20261101.json).

El titular aprueba activar el servicio y un presupuesto concreto de IA. Se habilitan correo y lectura IA mediante la configuración normal, conservando roles, consentimiento y RLS. La prueba remota positiva de correo pasa completa con dos empresas ficticias y rollback. La prueba anterior del módulo cerrado se conserva como historial; no se desactivan controles para repetirla. [Aceptación vigente](verification/ai-provider-live-acceptance-20261101.json).

## IA y recepción preparada, 0.5.3-rc.1

La clave existente de OpenAI **ya funciona en el backend**, sin mostrarla ni crear otra. Salud: `configured=true`, `enabled=true`; presupuesto global aprobado de **10 USD/mes antes de impuestos del proveedor**, sin recargas. El asistente documental, Gmail y la importación de facturas comparten límite y cuotas por empresa. Una lectura propone campos pendientes de revisión y no contabiliza gastos. El adaptador Resend usa firma oficial y direcciones independientes por empresa; falta completar la conexión privada de la cuenta receptora.

El [CI del código backend](https://github.com/smartscaneuskadi/TruckControl-AI/actions/runs/41343043038) y [su evidencia documentada](https://github.com/smartscaneuskadi/TruckControl-AI/actions/runs/41343843595) superan 450 comprobaciones cada uno, conservando las 64 iniciales y verificando la candidata v8 publicada. Después pasan 19 comprobaciones autenticadas reales: el modelo extrae correctamente 200 € netos, 42 € de IVA y 242 € totales de una factura ficticia, y el asistente responde citándola. Se rechaza acceso entre empresas a correo, documentos y originales privados; no se crean gastos. Las dos llamadas quedan liquidadas, sin reservas desconocidas.

Al finalizar se suspenden y bloquean las dos cuentas ficticias, se cierran sus sesiones y se eliminan las credenciales temporales; sus registros y uso se conservan para auditoría. No prueban recepción de correo ni verificación real del administrador. Esta actualización backend **no sustituye el paquete web v8 ni la demo estable**. Resend Free (0 USD) y un máximo acumulado de 2 USD de automatización sin recargas están aprobados; falta iniciar sesión en el acceso privado ya facilitado y comprobar entrega. Guía: [AI_RECEIVER_ACTIVATION.md](AI_RECEIVER_ACTIVATION.md).

## Validación y límites

256 unitarias/SQL, 23 Python, 64 demo, 22 empresas, 30 SaaS y 14 candidata pasan localmente; Deno, TypeScript y compilación PWA aprobados. Las 64 originales conservan los once hashes. Auditoría de dependencias de producción: cero vulnerabilidades. El [CI de la fuente exacta](https://github.com/smartscaneuskadi/TruckControl-AI/actions/runs/41334469182) aprobó esos 409 casos y seis recorridos de la publicación anterior: 415 comprobaciones. La revisión funcional de **esta v8** se exige de nuevo en los [checks del PR #13](https://github.com/smartscaneuskadi/TruckControl-AI/pull/13/checks), con `expected_universal_mail=true`: tres orígenes, Android/Windows, ambos temas, callback y correo ficticio sin red. Su resultado definitivo y capturas están en `public-test-results/verification.json` del CI; la coincidencia de archivos no sustituye ese control.

El CI de la primera fuente de despliegue detectó un contraste transitorio al cambiar de tema. La versión guardada 7 no se publicó. El CI antiguo de la rama de funcionalidad terminó después del cambio público y rechazó correctamente el inventario de v6 que todavía llevaba; se actualiza el inventario antes de repetir la comprobación de v8. La ejecución local del navegador contra HTTPS está limitada por su almacén de certificados; se utiliza el CI con TLS normal y no se desactiva la validación. La corrección elimina las interpolaciones de colores en controles y tarjetas, conservando animaciones de gráficos y preferencias de movimiento.

Fleet Light, Fleet Cockpit y modo del dispositivo permanecen en Configuración → Apariencia. La oferta sigue en diez días Full gratis, Básico 300 €/mes + IVA 21 % (363 €), Full 700 €/mes + IVA 21 % (847 €). Registro público y pagos apagados. IA backend con presupuesto aprobado y autorización individual; la candidata ficticia no la utiliza.

Esta es una candidata con datos ficticios. Para clientes reales faltan correo SMTP/recuperación verificados, administrador y cuentas reales verificadas, proveedor de recepción u OAuth real, requisitos legales, recuperación comercial y aceptación en dispositivos físicos cuando estén disponibles. Los ensayos sintéticos no sustituyen esos controles ni acreditan lanzamiento comercial 1.0.
