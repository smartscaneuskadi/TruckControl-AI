# TruckControl AI — entrega vigente, 2 de noviembre de 2026

**Aplicación conectada publicada: https://truckcontrolai.com.** El propietario verificó su correo, eligió su contraseña y accedió con administración global; las tres condiciones están comprobadas en Supabase. El registro de clientes está abierto, con consentimiento legal y confirmación de correo. **Cobros automáticos y SMS desactivados.**

**Publicada 0.5.6-rc.1, versión alojada 13:** nuevas altas con **Básico después de confirmar el correo**, diez días de prueba y cuenta de empresa automática. Solicitar Full no lo desbloquea. Se conservan las condiciones de las cuentas anteriores, los dos temas, Servicios y las copias cifradas. **52 migraciones** aplicadas una vez. [Alta Básico](BASIC_ONBOARDING.md), [Servicios](PROVIDER_ADMIN.md), [copias](COMPANY_RECOVERY.md).

## Acceso y oferta

El cliente pulsa Pedir acceso Básico, completa su empresa y contacto, acepta privacidad y condiciones, confirma el correo y elige una contraseña. Cada empresa tiene usuarios, camiones, documentos y permisos propios. Capacidad inicial: **50 camiones por empresa**. El superadministrador reservado es pedidos@smartscaneuskadi.com.

Oferta aprobada: **10 días Básico gratuitos para nuevas altas; Básico 300 €/mes + IVA 21 % = 363 €; Full 700 €/mes + IVA 21 % = 847 €**. Los precios son editables desde administración. Los accesos Full y períodos ya concedidos se conservan. Vencer la prueba no crea un cargo automático. [Administración](SAAS_ADMIN.md), [instalación Android/Windows](INSTALLATION.md), [controles de apertura](CLIENT_LAUNCH.md).

## Publicación y recuperación

Versión alojada **13**, canal production, fuente `26ec8048293249d5ccde0b57eb58c1a1c2404a0f`, rama `deploy/basic-client-20261102`. Despliegue `appgdep_6ae832885420819189a54e68f521c723`, 02/11/2026 06:49 UTC. El código coincide con el CI `41401436616` salvo el manifiesto de alojamiento; la fuente exacta también pasa `41401528305`. Tres orígenes sirven los mismos 24 archivos: **72 hashes coincidentes con TLS validado**. El catálogo público confirma trial_plan=limited, diez días y cobros apagados. [Informe](verification/basic-onboarding-production-https-20261102.json), [inventario](deployment/candidate-hosting.json). La versión 12 y las anteriores siguen recuperables; 11 nunca se publicó.

También responden https://www.truckcontrolai.com y https://truckcontrol-ai-candidata.earlymug513.chatgpt.site. Este último hostname sirve la producción conectada, pese a su nombre histórico. La **candidata 8 queda guardada para recuperación**. La **demo estable v6** continúa intacta en https://truckcontrol-ai-fase-1.earlymug513.chatgpt.site. Producción ofrece «Explorar la demo» con datos ficticios separados.

## Datos, autenticación y seguridad

Único Supabase: `truckcontrol-ai / kkkemaycedexymrpaqtp`, organización fixpilot-dev. **52 migraciones**, inspeccionadas y aplicadas una vez. FIXPilot permanece separado. No ejecutar `db push` a ciegas ni editar migraciones aplicadas. [Inventario](deployment/remote-migrations-20261102-basic-access.json), [correspondencias](deployment/recovered-migrations.json).

Confirmación y recuperación usan enlaces nativos Supabase enviados por API Resend, sin depender de SMTP Migadu. La aceptación real probó verificación, enlace de un uso, contraseña, inicio de sesión, recuperación y cierre global. El consentimiento inmutable del servidor impide activar empresas mediante metadatos editables. La prueba remota de dos empresas pasa con rollback completo. [Evidencia](verification/client-auth-acceptance-20261101.json).

RLS y servidor comprueban empresa, rol, licencia y archivos privados. Cinco identidades sintéticas y cuatro empresas ficticias se conservan bloqueadas/suspendidas; no borrar originales ni auditoría. El propietario verificado es una cuenta independiente. No se inspecciona su contraseña ni su enlace personal.

El asesor conserva **un aviso previo: protección contra contraseñas filtradas deshabilitada**. La función alojada requiere Pro o superior; no se ha contratado. [Referencia](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). private/extensions no están expuestos en Data API. La extensión HTTP administrada conserva permisos SQL bajo supabase_admin; no afirmar que postgres los revocó.

## Correo e inteligencia artificial

Resend recibe en `facturas.truckcontrolai.com`: tres correos ficticios a dos empresas, webhook firmado, originales privados, aislamiento y duplicados probados; cero gastos automáticos. Cada empresa autorizada obtiene su dirección privada. El reenvío funciona desde distintos proveedores; **no equivale a acceso directo a todo Gmail**. [Aceptación](verification/resend-live-acceptance-20261101.json), [guía](GENERAL_EMAIL.md).

OpenAI funciona en backend con credencial existente, límite global **10 USD/mes antes de impuestos**, cuotas y consentimiento individual; sin recarga automática. Tres llamadas reales anteriores liquidadas, estimación interna 925 micro USD, distinta de la factura del proveedor. La IA propone y requiere revisión antes de contabilizar. Resend mantiene el alcance Free aprobado, sin upgrade ni pay-as-you-go; la API no acredita el panel de facturación.

## Pruebas y límites

Los [controles del código](https://github.com/smartscaneuskadi/TruckControl-AI/actions/runs/41401436616) y la [fuente exacta](https://github.com/smartscaneuskadi/TruckControl-AI/actions/runs/41401528305) pasan **628 comprobaciones**: 430 unitarias/SQL, 32 Python, 64 demo, 22 empresas, 42 SaaS, 14 candidata, 18 producción y seis recorridos públicos de v12 anteriores al despliegue. Las **64 originales se conservan**, con once hashes. La aceptación pública de v13 se comprueba en [checks de PR #21](https://github.com/smartscaneuskadi/TruckControl-AI/pull/21/checks). El ensayo HTTPS independiente de v13 confirma 72 hashes, demo intacta, catálogo Básico y rechazo del acceso anónimo a Servicios.

La [prueba remota de alta Básico](verification/basic-onboarding-20261102.json) confirma correo obligatorio, cuenta automática, ausencia de elevación por perfil/solicitud Full, aislamiento y límite real de 50 camiones. Termina con rollback y cero usuarios/camiones de prueba. Los datos de clientes, planes y ajustes anteriores permanecen idénticos. La versión legal nueva es 2026-11-02 y no se reescriben recibos anteriores. Los recorridos de correo usan una integración simulada; el transporte nativo de Resend tenía aceptación real previa y no se ha cambiado.

El [ensayo remoto de Servicios](verification/provider-admin-20261102.json) comprueba identidad, rol, correo, escritura real en Vault y auditoría sin secretos, con rollback completo y cero identidades de prueba restantes. Google tiene un único cliente web y mantiene oculto su secreto. La app permite guardarlo de forma segura, pero su formato no acredita todavía un consentimiento Gmail real.

Fleet Light/Cockpit, configuración del dispositivo y movimiento reducido están disponibles. Android/Windows son emulaciones, no dispositivos físicos. La copia offline empresarial es cifrada, necesita preparación y revalida permisos antes de sincronizar; instalar la PWA no la activa.

Pendientes: Gmail OAuth directo y revisión Google; SMS; pagos recurrentes reales; buzones Migadu/DKIM; restauración integral del servicio gestionado y SLA de copias; aceptación física y revisión jurídica externa. Los textos legales incorporan los datos de ELEVADANCOR S.L. facilitados por el titular. No declarar certificación integral ni integraciones sin evidencia. [Guías anteriores conservadas](history/20261101-pre-client-production/CURRENT_DELIVERY.md).
