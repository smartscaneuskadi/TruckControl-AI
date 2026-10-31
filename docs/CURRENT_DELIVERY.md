# Entrega actual — 31/10/2026

Versión fuente: **0.2.0**. **Versión 5 publicada y comprobada por HTTPS** en https://truckcontrol-ai-fase-1.earlymug513.chatgpt.site. La versión 4 anterior se conserva para recuperación. El índice, CSS, JavaScript y service worker públicos coinciden con el paquete verificado.

Repositorio oficial: https://github.com/smartscaneuskadi/TruckControl-AI. Rama publicada de código `main`; rama de desarrollo conservada `feat/dedicated-supabase-project`. [PR #1](https://github.com/smartscaneuskadi/TruckControl-AI/pull/1) integrado mediante merge, sin reescribir historial. Fuente desplegada `7a68a555cfa76b394ecd93240aac0c2e55906411`; merge en principal `e59d8d4590012eac9243f3f0b50a2a74aff6d364`. Código recuperado del respaldo persistente, con todo el historial y las 64 pruebas originales conservados. GitHub permite lectura y escritura; Actions ya ha terminado una ejecución correcta. Las APIs administrativas de Pages y protección de rama devuelven 403 y no se eluden.

Supabase: proyecto independiente **truckcontrol-ai** (`kkkemaycedexymrpaqtp`) en `fixpilot-dev`, eu-west-2, sin plan de pago nuevo. **37 migraciones aplicadas** y tres funciones Edge desplegadas. RLS y aislamiento comprobados con datos ficticios y transacciones revertidas. El asesor de seguridad no señala incidencias. FIXPilot intacto; merymery_16 permanece pausado sin borrar contenido.

Incluye camiones, conductores, remolques, clientes, viajes, gastos, ingresos, rentabilidad, mantenimiento, combustible, vencimientos, alertas, biblioteca documental, informes, paneles SaaS y PWA. Se ha corregido un desbordamiento de Android que desplazaba los controles del menú. El archivo documental respeta permisos independientes para biblioteca y adjuntos Gmail.

**Producción comercial todavía cerrada.** El alta real espera configuración y comprobación de SMTP y redirecciones Auth. Gmail espera credenciales OAuth y validación Google. SMS, proveedores IA y cobros permanecen apagados. El copiloto local, los ejemplos de facturas y los servicios simulados de pruebas no equivalen a esas integraciones reales.

No se han registrado empresas reales ni enviado correos/SMS, documentos a modelos o pagos. Los datos de demo son locales y ficticios. Android y Windows se verifican con emulación Chromium; faltan pruebas físicas y aceptación final de proveedores.

La matriz de pruebas está en [TESTING.md](TESTING.md); el registro para reanudar está en [PROGRESS.md](PROGRESS.md). Administración y recuperación: [SAAS_ADMIN.md](SAAS_ADMIN.md), [MAINTENANCE.md](MAINTENANCE.md). La documentación histórica se conserva en `history/20261028/`.

**Resultado final: 188 pruebas aprobadas** (134 Vitest/SQL + 30 demo + 8 empresas + 16 SaaS), guardia SHA-256, TypeScript y build PWA. [CI del código](https://github.com/smartscaneuskadi/TruckControl-AI/actions/runs/41180430504) y [CI del PR](https://github.com/smartscaneuskadi/TruckControl-AI/actions/runs/41198404303) correctos. También pasó el recorrido del paquete comercial sin credenciales en escritorio/Android: portal, manifiesto/iconos, panel, informes, menú, recarga offline y ausencia de tráfico a proveedores.

La comprobación HTTP pública verificó TLS, respuestas 200 y coincidencia de archivos con el artefacto. El Chromium del entorno no confía en la CA de interceptación de red y no pudo repetir el recorrido en el dominio público; no se desactivó la validación de certificados. Las pruebas de navegador del paquete se hicieron en el servidor local y en CI. No se presenta esta limitación del entorno como una prueba física de Android/Windows.

Se crearon copias Git bundle verificadas y ZIP de fuentes, además del TAR de despliegue. Las sumas y la procedencia están en `verification/release-0.2.0.json`. El respaldo GitHub conserva código y documentación; la versión Sites anterior permite recuperación web. Las copias de base de datos comercial y su restauración remota siguen pendientes de un destino y política autorizados antes de admitir datos reales.
