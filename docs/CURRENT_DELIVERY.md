# TruckControl AI 0.5.0-rc.1 — dos temas profesionales

La nueva versión permite elegir **Fleet Light**, **Fleet Cockpit** o seguir el dispositivo desde **Configuración → Apariencia**. También se abre desde el botón de sol/luna de la cabecera y de los formularios. Incluye vistas previas, reducción de movimiento, fotografías locales, indicadores financieros reales, objetivos personales y un mapa de referencia sin posiciones GPS inventadas. [Guía de apariencia](THEMES.md).

**Publicación en curso:** https://truckcontrolai.com sirve la candidata ficticia. La última versión verificada antes de este cambio es la 3, fuente `736ef9e32d2dbc8dc2cf2e30d47305e45050b659`. La nueva fuente y versión se anotarán en [candidate-hosting.json](deployment/candidate-hosting.json) después de superar el CI y comprobar el despliegue. Esta página no declara publicado el trabajo local.

La demo estable anterior se conserva sin cambios: https://truckcontrol-ai-fase-1.earlymug513.chatgpt.site, versión 6. Las versiones guardadas de la candidata permiten volver atrás. La entrega anterior se conserva en [el historial](history/20261101/CURRENT_DELIVERY-before-themes.md).

## Código y verificación

Repositorio: https://github.com/smartscaneuskadi/TruckControl-AI. Revisión en [PR #8](https://github.com/smartscaneuskadi/TruckControl-AI/pull/8), rama `feat/pricing-ten-day-trial`. El checkout de despliegue conserva la identidad separada de la candidata en `deploy/pricing-candidate-20261101`. La rama principal mantiene el manifiesto reservado de la demo estable.

Las 64 pruebas iniciales permanecen intactas: once archivos con sus hashes verificados. Pasan 198 pruebas unitarias/SQL y 23 de configuración/DNS/correo. La demo completa ha pasado 56 recorridos de navegador. Se amplían los ensayos de apariencia a las 19 pantallas, formularios abiertos, preferencias por cuenta, recuperación sin red, otro dispositivo, portal y administración. Los informes definitivos y el CI se registrarán tras finalizar la candidata.

Las pruebas de navegador usan perfiles Chromium Android/Windows. No equivalen a pruebas físicas ni a verificación de proveedores reales. La sincronización del tema con el perfil está implementada y ensayada con Auth simulado; en la candidata anónima se guarda solo en ese navegador.

## Supabase y oferta vigente

Proyecto independiente `truckcontrol-ai`, referencia `kkkemaycedexymrpaqtp`, organización `fixpilot-dev`. Hay **40 migraciones remotas**; la oferta nueva se aplicó una sola vez y se verificó mediante transacciones sintéticas revertidas. La apariencia utiliza metadatos propios de Auth y no necesita una migración nueva ni cambios de RLS. FIXPilot no se modifica.

Prueba Full gratuita de **10 días**. **Básico 300 €/mes + IVA 21 % = 363 €**. **Full 700 €/mes + IVA 21 % = 847 €**. Los períodos y presupuestos anteriores se conservan. Las altas reales y los cobros siguen cerrados. La candidata se compila sin URL ni credencial Supabase.

## Probar e instalar

Abre https://truckcontrolai.com y pulsa **Abrir demostración**. En Configuración elige Apariencia y aplica el tema. Si hay una actualización PWA pendiente, guarda antes el formulario y pulsa Actualizar. [Instalación Android y Windows](INSTALLATION.md).

## Límites para el lanzamiento comercial

Faltan entrega SMTP/Migadu comprobada, confirmación y recuperación reales, alta verificada del administrador, aceptación con dos empresas reales autorizadas, recuperación comercial, información legal y aceptación en dispositivos físicos disponibles. El titular ya abrió el ticket Migadu sobre DKIM/DNSSEC; no se repite la solicitud.

Gmail OAuth, modelos IA y pagos requieren sus propias conexiones, pruebas y autorizaciones. Permanecen desactivados. El mapa es cartografía de referencia cargada voluntariamente y avisa de que no hay fuente GPS. No se activan gastos, se exponen credenciales ni se usan datos empresariales reales por publicar esta candidata.
