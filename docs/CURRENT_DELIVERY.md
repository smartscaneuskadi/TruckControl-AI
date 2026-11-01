# TruckControl AI 0.5.1-rc.2 — Gmail por empresa preparado

**Candidata 6 publicada:** https://truckcontrolai.com, https://www.truckcontrolai.com y https://truckcontrol-ai-candidata.earlymug513.chatgpt.site. Fuente `c80add77165d6953cd4a9cc43066c435874e7f4f`, desplegada el 01/11/2026 a las 13:55:11 UTC después de aprobar su CI. Los 23 archivos coinciden por SHA-256 en los tres orígenes: **69 verificaciones HTTPS**. [Inventario](deployment/candidate-hosting.json).

Facturas explica cómo conectar Gmail por empresa, importar documentos y revisarlos. El retorno Google utiliza **https://truckcontrolai.com/gmail-callback**, elimina el código de la URL y mantiene estado/ticket de un uso ligados a usuario, rol y empresa. La selección de empresa se restaura solo entre las autorizadas. Desconectar revoca primero el permiso Google y conserva el estado si el proveedor falla.

**Google preparado por el titular:** proyecto TruckControlAI `468881730124`, Gmail API habilitada, consentimiento Externo/Pruebas y cliente web creados. No se han recibido secretos en el chat. **Pendientes:** respuesta a la solicitud específica de aprobación de las dos migraciones/backend, introducir los valores directamente en el almacén seguro y probar OAuth real. [Configuración y aceptación](MAIL_SETUP.md).

La candidata usa datos ficticios y no incorpora credenciales Supabase ni conexión a datos de clientes. Registro, IA remota y cobros permanecen cerrados. Conectar Gmail no activa IA ni crea gastos automáticamente. Gmail real aún no está verificado.

## Recuperación y corrección comprobada

La prueba pública de la candidata 5 detectó que Sites redirige .html a una ruta sin extensión y Workbox la confundía con una navegación de la SPA. Se restauró la candidata 4 antes de continuar. La versión 6 excluye ambas rutas y añade una prueba de esa redirección 308 con PWA instalada, en Android y Windows. Se conserva el [registro del fallo y recuperación](history/20261101/CURRENT_DELIVERY-mail-rc1-rollback.md); los hashes correctos de v5 no se presentaron como éxito funcional del callback.

La demo estable anterior sigue en https://truckcontrol-ai-fase-1.earlymug513.chatgpt.site, **versión 6 de su proyecto separado**, con el mismo hash del índice. Las candidatas 4 y 5 y sus fuentes se conservan. La rama principal mantiene el manifiesto de la demo estable y `deploy/pricing-candidate-20261101` el de la candidata.

## Código y pruebas

Repositorio: https://github.com/smartscaneuskadi/TruckControl-AI. [PR #9](https://github.com/smartscaneuskadi/TruckControl-AI/pull/9), rama `feat/company-mail-onboarding`.

**374 comprobaciones del código aprobadas:** 229 unitarias/SQL, 23 Python y 122 recorridos: 58 demo, 22 empresas, 30 SaaS y 12 candidata. Las 64 originales mantienen sus once hashes. El [CI de la fuente exacta](https://github.com/smartscaneuskadi/TruckControl-AI/actions/runs/41313197695) aprobó además seis recorridos HTTPS de la v4 restaurada: **380 en total**. Deno 2.9.6 compila el backend localmente.

La revisión pública del inventario nuevo vuelve a exigir el callback canónico con PWA activa, ambos temas, cierre de altas y procedencia, en Android/Windows y los tres orígenes. Resultado vigente en los [checks del PR #9](https://github.com/smartscaneuskadi/TruckControl-AI/pull/9/checks) y `public-test-results/verification.json`; no se infiere del CI que revisó v4. [Informe rc.2](verification/release-0.5.1-rc.2.json).

Google/Auth se simulan en las pruebas locales de conexión. Los navegadores emulan dispositivos; no equivalen a OAuth, SMTP ni Android/Windows físicos. La inspección remota de esta fase fue de solo lectura. La revisión automática rechazó una prueba remota anterior antes de ejecutarla; se sustituyó por revisión y solicitud concreta de aprobación, sin desactivar controles.

## Supabase, planes y diseño

Proyecto único `truckcontrol-ai`, referencia `kkkemaycedexymrpaqtp`, organización `fixpilot-dev`. **40 migraciones**, cero usuarios/clientes/tokens Gmail en la inspección, controles de acceso activos y asesores de seguridad vacíos. Gmail remoto sigue en versión 1. Las dos migraciones nuevas y el backend revisado **no se han aplicado**. FIXPilot queda separado.

Prueba Full de **10 días**, Básico **300 €/mes + IVA 21 % = 363 €**, Full **700 €/mes + IVA 21 % = 847 €**. Se conservan períodos y contratos históricos. No se activan cobros ni servicios de pago.

Fleet Light, Fleet Cockpit, modo del dispositivo y movimiento reducido permanecen disponibles en **Configuración → Apariencia**. Conservan los datos y formularios abiertos. [Guía de temas](THEMES.md).

## Probar e instalar

Abre https://truckcontrolai.com, pulsa **Explorar la demo** y visita Facturas para revisar el ejemplo ficticio. Si la PWA ofrece actualizar, guarda el formulario antes de pulsar Actualizar. [Instalación Android y Windows](INSTALLATION.md).

Para clientes reales faltan las credenciales y aprobación del backend, OAuth y aislamiento con dos empresas autorizadas, verificación Google de alcances restringidos, SMTP/recuperación reales, administrador verificado, recuperación comercial, información legal y aceptación física disponible. IA y pagos requieren sus conexiones y autorizaciones independientes. Esta candidata no acredita lanzamiento comercial 1.0.
