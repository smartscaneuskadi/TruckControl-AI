# TruckControl AI — entrega vigente, 1 de noviembre de 2026

**Aplicación conectada publicada: https://truckcontrolai.com.** El propietario verificó su correo, eligió su contraseña y accedió con administración global; las tres condiciones están comprobadas en Supabase. El registro de clientes está abierto, con consentimiento legal y confirmación de correo. **Cobros automáticos y SMS desactivados.**

## Acceso y oferta

El cliente solicita la prueba Full, completa su empresa y contacto, acepta privacidad y condiciones, confirma el correo y elige una contraseña. Cada empresa tiene usuarios, camiones, documentos y permisos propios. Capacidad inicial: **50 camiones por empresa**. El superadministrador reservado es pedidos@smartscaneuskadi.com.

Oferta aprobada: **10 días Full gratuitos; Básico 300 €/mes + IVA 21 % = 363 €; Full 700 €/mes + IVA 21 % = 847 €**. Los precios son editables desde administración. Vencer la prueba no crea un cargo automático. [Administración](SAAS_ADMIN.md), [instalación Android/Windows](INSTALLATION.md), [controles de apertura](CLIENT_LAUNCH.md).

## Publicación y recuperación

Versión alojada **9**, canal production, fuente `bcffa56f0b3a3f851af4e9f433223b49bad7ed9c`, rama `deploy/client-launch-20261101`. Despliegue `appgdep_6ae7bdb248cc8191acb4a7c3ac33a03e`, 01/11/2026 22:31 UTC. El código coincide con el CI `41356880182`, salvo el manifiesto de alojamiento. Tres orígenes sirven los mismos 24 archivos: **72 hashes coincidentes con TLS validado**. [Informe](verification/client-production-https-20261101.json), [inventario](deployment/candidate-hosting.json).

También responden https://www.truckcontrolai.com y https://truckcontrol-ai-candidata.earlymug513.chatgpt.site. Este último hostname sirve la producción conectada, pese a su nombre histórico. La **candidata 8 queda guardada para recuperación**. La **demo estable v6** continúa intacta en https://truckcontrol-ai-fase-1.earlymug513.chatgpt.site. Producción ofrece «Explorar la demo» con datos ficticios separados.

## Datos, autenticación y seguridad

Único Supabase: `truckcontrol-ai / kkkemaycedexymrpaqtp`, organización fixpilot-dev. **48 migraciones**, inspeccionadas y aplicadas una vez. FIXPilot permanece separado. No ejecutar `db push` a ciegas ni editar migraciones aplicadas. [Inventario](deployment/remote-migrations-20261101-client-auth.json), [correspondencias](deployment/recovered-migrations.json).

Confirmación y recuperación usan enlaces nativos Supabase enviados por API Resend, sin depender de SMTP Migadu. La aceptación real probó verificación, enlace de un uso, contraseña, inicio de sesión, recuperación y cierre global. El consentimiento inmutable del servidor impide activar empresas mediante metadatos editables. La prueba remota de dos empresas pasa con rollback completo. [Evidencia](verification/client-auth-acceptance-20261101.json).

RLS y servidor comprueban empresa, rol, licencia y archivos privados. Cinco identidades sintéticas y cuatro empresas ficticias se conservan bloqueadas/suspendidas; no borrar originales ni auditoría. El propietario verificado es una cuenta independiente. No se inspecciona su contraseña ni su enlace personal.

El asesor conserva **un aviso previo: protección contra contraseñas filtradas deshabilitada**. La función alojada requiere Pro o superior; no se ha contratado. [Referencia](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). private/extensions no están expuestos en Data API. La extensión HTTP administrada conserva permisos SQL bajo supabase_admin; no afirmar que postgres los revocó.

## Correo e inteligencia artificial

Resend recibe en `facturas.truckcontrolai.com`: tres correos ficticios a dos empresas, webhook firmado, originales privados, aislamiento y duplicados probados; cero gastos automáticos. Cada empresa autorizada obtiene su dirección privada. El reenvío funciona desde distintos proveedores; **no equivale a acceso directo a todo Gmail**. [Aceptación](verification/resend-live-acceptance-20261101.json), [guía](GENERAL_EMAIL.md).

OpenAI funciona en backend con credencial existente, límite global **10 USD/mes antes de impuestos**, cuotas y consentimiento individual; sin recarga automática. Tres llamadas reales anteriores liquidadas, estimación interna 925 micro USD, distinta de la factura del proveedor. La IA propone y requiere revisión antes de contabilizar. Resend mantiene el alcance Free aprobado, sin upgrade ni pay-as-you-go; la API no acredita el panel de facturación.

## Pruebas y límites

El [CI del código desplegado](https://github.com/smartscaneuskadi/TruckControl-AI/actions/runs/41356880182) pasó **548 comprobaciones**: 364 unitarias/SQL, 32 Python, 64 demo, 22 empresas, 30 SaaS, 14 candidata, 16 producción y seis recorridos públicos de la candidata anterior. TypeScript, Deno y PWA pasan. **64 originales conservadas**, once hashes. La prueba pública adicional de v9 con el registro abierto se registra por separado; no atribuir a v9 las pruebas de la versión anterior.

Fleet Light/Cockpit, configuración del dispositivo y movimiento reducido están disponibles. Android/Windows son emulaciones, no dispositivos físicos. La copia offline empresarial es cifrada, necesita preparación y revalida permisos antes de sincronizar; instalar la PWA no la activa.

Pendientes: Gmail OAuth directo y revisión Google; SMS; pagos recurrentes reales; buzones Migadu/DKIM; restauración integral del servicio gestionado y SLA de copias; aceptación física y revisión jurídica externa. Los textos legales incorporan los datos de ELEVADANCOR S.L. facilitados por el titular. No declarar certificación integral ni integraciones sin evidencia. [Guías anteriores conservadas](history/20261101-pre-client-production/CURRENT_DELIVERY.md).
