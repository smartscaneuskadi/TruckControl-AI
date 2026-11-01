# TruckControl AI 0.5.0-rc.1 — dos temas profesionales

**En preparación: 0.5.1-rc.1, conexión del correo por empresa.** La rama `feat/company-mail-onboarding` incorpora retorno Google en el dominio propio, conservación de la empresa activa, revocación real del permiso, lectura segura de Vault y guía en Facturas. Google Cloud «TruckControlAI», número `468881730124`, ya existe. El cliente OAuth y dos migraciones nuevas siguen pendientes; no se declara Gmail real conectado. La revisión automática bloqueó una prueba remota antes de ejecutarla y se prepara un PR con el cambio concreto, sin desactivar controles de acceso. [Estado y configuración](MAIL_SETUP.md). La publicación descrita debajo se conserva hasta verificar la actualización.

La nueva versión permite elegir **Fleet Light**, **Fleet Cockpit** o seguir el dispositivo desde **Configuración → Apariencia**. También se abre desde el botón de sol/luna de la cabecera y de los formularios. Incluye vistas previas, reducción de movimiento, fotografías locales, indicadores financieros reales, objetivos personales y un mapa de referencia sin posiciones GPS inventadas. [Guía de apariencia](THEMES.md).

**Publicada y accesible:** https://truckcontrolai.com, https://www.truckcontrolai.com y https://truckcontrol-ai-candidata.earlymug513.chatgpt.site. Candidata **4**, fuente `304b63ffb3742eaeacd662995c7483837eb5e11f`, desplegada el 01/11/2026 a las 12:16 UTC después de aprobar el CI de esa fuente exacta. Las tres direcciones sirven los veinte archivos del paquete verificado: sesenta coincidencias SHA-256 por HTTPS. Sigue utilizando datos ficticios, con cuentas comerciales y cobros cerrados. [Identidad y versión](deployment/candidate-hosting.json).

La demo estable anterior se conserva sin cambios: https://truckcontrol-ai-fase-1.earlymug513.chatgpt.site, versión 6. Las versiones guardadas de la candidata permiten volver atrás. La entrega anterior se conserva en [el historial](history/20261101/CURRENT_DELIVERY-before-themes.md).

## Código y verificación

Repositorio: https://github.com/smartscaneuskadi/TruckControl-AI. Revisión en [PR #8](https://github.com/smartscaneuskadi/TruckControl-AI/pull/8), rama `feat/pricing-ten-day-trial`. El checkout de despliegue conserva la identidad separada de la candidata en `deploy/pricing-candidate-20261101`. La rama principal mantiene el manifiesto reservado de la demo estable.

**327 comprobaciones del código aprobadas en el CI de la fuente publicada:** 198 unitarias/SQL, 23 Python y 106 recorridos de navegador (58 demo, 10 empresas, 30 SaaS y 8 candidata). Las 64 pruebas iniciales permanecen intactas, mediante once archivos con hashes verificados. [CI de la fuente publicada](https://github.com/smartscaneuskadi/TruckControl-AI/actions/runs/41305222529).

Ese CI también aprobó seis perfiles de la candidata anterior por HTTPS. El CI del inventario de publicación comprueba ambos temas de la versión 4 en los tres orígenes; su resultado se consulta en los checks de PR #8 y en el artefacto `public-test-results/verification.json`. El paquete nuevo ya pasó ocho revisiones locales de tema/perfil —Windows, Android, tablet y 320 px—, sin incidencias Axe AA ni desbordamientos.

Las pruebas de navegador usan perfiles Chromium Android/Windows. No equivalen a pruebas físicas ni a verificación de proveedores reales. La sincronización del tema con el perfil está implementada y ensayada con Auth simulado; en la candidata anónima se guarda solo en ese navegador.

## Supabase y oferta vigente

Proyecto independiente `truckcontrol-ai`, referencia `kkkemaycedexymrpaqtp`, organización `fixpilot-dev`. Hay **40 migraciones remotas**; la oferta nueva se aplicó una sola vez y se verificó mediante transacciones sintéticas revertidas. La apariencia utiliza metadatos propios de Auth y no necesita una migración nueva ni cambios de RLS. FIXPilot no se modifica.

Prueba Full gratuita de **10 días**. **Básico 300 €/mes + IVA 21 % = 363 €**. **Full 700 €/mes + IVA 21 % = 847 €**. Los períodos y presupuestos anteriores se conservan. Las altas reales y los cobros siguen cerrados. La candidata se compila sin URL ni credencial Supabase.

## Probar e instalar

Abre https://truckcontrolai.com y pulsa **Abrir demostración**. En Configuración elige Apariencia y aplica el tema. Si hay una actualización PWA pendiente, guarda antes el formulario y pulsa Actualizar. [Instalación Android y Windows](INSTALLATION.md).

## Límites para el lanzamiento comercial

Faltan entrega SMTP/Migadu comprobada, confirmación y recuperación reales, alta verificada del administrador, aceptación con dos empresas reales autorizadas, recuperación comercial, información legal y aceptación en dispositivos físicos disponibles. El titular ya abrió el ticket Migadu sobre DKIM/DNSSEC; no se repite la solicitud.

Gmail OAuth, modelos IA y pagos requieren sus propias conexiones, pruebas y autorizaciones. Permanecen desactivados. El mapa es cartografía de referencia cargada voluntariamente y avisa de que no hay fuente GPS. No se activan gastos, se exponen credenciales ni se usan datos empresariales reales por publicar esta candidata.
