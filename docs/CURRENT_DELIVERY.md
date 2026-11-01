# Estado actual — corrección del retorno Gmail

**Candidata 4 restaurada el 01/11/2026 a las 13:48 UTC.** La comprobación pública de la candidata 5 detectó que el alojamiento redirige `.html` a una ruta sin extensión, que su service worker confundía con la SPA. Se restaura la versión anterior antes de continuar; no se pierde código, documentos ni la demo estable v6. La corrección 0.5.1-rc.2 cubre ambas rutas y utiliza `https://truckcontrolai.com/gmail-callback` como URI Google. La nueva prueba reproduce la redirección real con la PWA activa.

El titular confirma **Gmail API habilitada** y consentimiento **Externo / Pruebas** en el proyecto `468881730124`. Pendientes: cliente OAuth web y valores seguros; aprobación de las dos migraciones/función Gmail solicitada por separado. Ninguna migración de esta fase se ha aplicado. IA, registro y pagos siguen cerrados.

El registro inferior describe la publicación 5 anterior, conservada como historial; el inventario de despliegue indica la versión 4 restaurada mientras se valida la corrección.

# TruckControl AI 0.5.1-rc.1 — correo por empresa preparado

**Candidata 5 publicada:** https://truckcontrolai.com, https://www.truckcontrolai.com y https://truckcontrol-ai-candidata.earlymug513.chatgpt.site. Fuente `ee3cb94e4e0089729d746522cecb1e03b4ad67b3`, desplegada el 01/11/2026 a las 13:33:51 UTC después de aprobar el CI de esa fuente exacta. Los 23 archivos coinciden por SHA-256 en las tres direcciones: **69 verificaciones HTTPS**. [Identidad de publicación](deployment/candidate-hosting.json).

Facturas incorpora una guía clara para conectar Gmail por empresa, importar documentos y revisarlos. El retorno Google preparado en el dominio propio elimina el código de la URL; el backend mantiene estado y ticket de un uso ligados al usuario, rol y empresa originales. La empresa seleccionada se conserva al volver de Google, validándola contra los permisos actuales. La desconexión preparada revoca primero el permiso en Google y conserva el estado si el proveedor falla.

**Gmail real todavía no está conectado.** El titular ya creó Google Cloud «TruckControlAI», número `468881730124`; faltan confirmar Gmail API, configurar el cliente OAuth web y guardar sus valores mediante el proveedor seguro. La preparación de Vault y la función nueva están revisables en GitHub; las dos migraciones siguen pendientes de la aprobación específica solicitada. [Configuración, límites de Google y aceptación](MAIL_SETUP.md).

La candidata utiliza datos ficticios, sin credenciales Supabase ni conexión a datos de clientes. Registro, IA remota y cobros siguen cerrados. El retorno público intercambia únicamente un código temporal con el backend y nunca recibe tokens de Google. Conectar Gmail no activa IA ni crea gastos automáticamente.

## Diseño y versiones conservadas

Fleet Light, Fleet Cockpit y el modo del dispositivo se eligen en **Configuración → Apariencia**, también desde la cabecera. Conservan vistas previas, reducción de movimiento, fotografías, datos económicos calculados, objetivos personales y mapa de referencia sin posiciones GPS inventadas. [Guía](THEMES.md).

La demo estable anterior permanece en https://truckcontrol-ai-fase-1.earlymug513.chatgpt.site, **versión 6**, con el mismo hash del índice. La candidata 4 y sus fuentes se conservan para recuperación. [Entrega anterior](history/20261101/CURRENT_DELIVERY-before-mail.md).

## Código y pruebas

Repositorio: https://github.com/smartscaneuskadi/TruckControl-AI. [PR #9](https://github.com/smartscaneuskadi/TruckControl-AI/pull/9), rama `feat/company-mail-onboarding`. El checkout `deploy/pricing-candidate-20261101` mantiene el manifiesto separado de la candidata; la rama principal conserva la identidad de la demo estable.

**372 comprobaciones del código aprobadas:** 229 unitarias/SQL, 23 Python y 120 recorridos de navegador: 58 demo, 22 empresas, 30 SaaS y 10 candidata. Las 64 originales siguen intactas mediante once hashes. El [CI de la fuente exacta](https://github.com/smartscaneuskadi/TruckControl-AI/actions/runs/41311260471) aprobó además seis recorridos HTTPS de la candidata anterior: **378 en total**.

La revisión pública del inventario nuevo comprueba ambos temas y el callback con la PWA activa, en Android/Windows y los tres orígenes; resultado en los [checks del PR #9](https://github.com/smartscaneuskadi/TruckControl-AI/pull/9/checks) y `public-test-results/verification.json`. La compilación local del backend con Deno 2.9.6 pasa. Los callbacks nuevos pasan contraste Axe AA en ambos temas. [Informe](verification/release-0.5.1-rc.1.json).

Las pruebas de navegador emulan dispositivos. Auth/Google se simulan en los ensayos de conexión; no equivalen a OAuth, SMTP ni dispositivos físicos reales. La inspección remota de esta fase fue de solo lectura. La revisión automática rechazó una prueba remota anterior antes de ejecutarla y se sustituyó por revisión y solicitud concreta de aprobación, sin desactivar controles.

## Supabase y oferta

Proyecto independiente `truckcontrol-ai`, referencia `kkkemaycedexymrpaqtp`, organización `fixpilot-dev`. Inspección: **40 migraciones**, cero usuarios, clientes o tokens Gmail; controles de acceso activos y asesores de seguridad vacíos. Gmail remoto permanece en versión 1. Las migraciones nuevas de retorno y Vault y el backend revisado **no se han aplicado**. FIXPilot no se modifica.

Prueba Full gratuita de **10 días**. **Básico 300 €/mes + IVA 21 % = 363 €**. **Full 700 €/mes + IVA 21 % = 847 €**. Se conservan períodos y presupuestos históricos. No se activan cobros ni servicios nuevos de pago.

## Probar e instalar

Abre https://truckcontrolai.com y pulsa **Abrir demostración** o **Explorar la demo**. En Facturas puedes probar la revisión ficticia y consultar la guía de conexión. En Configuración cambia Apariencia. Si aparece una actualización PWA, guarda el formulario antes de pulsar Actualizar. [Instalación Android y Windows](INSTALLATION.md).

## Pendiente para clientes reales

Cliente Google y verificación de sus alcances restringidos, autorización de las migraciones y despliegue del backend, OAuth con dos empresas autorizadas, SMTP/Migadu y recuperación reales, alta verificada del administrador, recuperación comercial, información legal y aceptación en dispositivos físicos disponibles. El ticket Migadu DKIM/DNSSEC sigue siendo la última evidencia disponible; no se repite su apertura. IA y pagos requieren conexiones, pruebas y autorizaciones independientes.

Esta candidata pública no acredita el lanzamiento comercial 1.0 ni autoriza enviar datos empresariales reales.
