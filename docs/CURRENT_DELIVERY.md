# Entrega actual — 31/10/2026

Versión fuente: **0.2.0**. Demostración: https://truckcontrol-ai-fase-1.earlymug513.chatgpt.site. La actualización se publicará después de superar las comprobaciones finales; la versión 4 anterior permanece disponible para recuperación.

Repositorio oficial: https://github.com/smartscaneuskadi/TruckControl-AI. Rama de trabajo `feat/dedicated-supabase-project`. Código recuperado del respaldo persistente, con todo el historial y las 64 pruebas originales conservados. GitHub permite lectura y escritura; Actions ya ha terminado una ejecución correcta. Las APIs administrativas de Pages y protección de rama devuelven 403 y no se eluden.

Supabase: proyecto independiente **truckcontrol-ai** (`kkkemaycedexymrpaqtp`) en `fixpilot-dev`, eu-west-2, sin plan de pago nuevo. **37 migraciones aplicadas** y tres funciones Edge desplegadas. RLS y aislamiento comprobados con datos ficticios y transacciones revertidas. El asesor de seguridad no señala incidencias. FIXPilot intacto; merymery_16 permanece pausado sin borrar contenido.

Incluye camiones, conductores, remolques, clientes, viajes, gastos, ingresos, rentabilidad, mantenimiento, combustible, vencimientos, alertas, biblioteca documental, informes, paneles SaaS y PWA. Se ha corregido un desbordamiento de Android que desplazaba los controles del menú. El archivo documental respeta permisos independientes para biblioteca y adjuntos Gmail.

**Producción comercial todavía cerrada.** El alta real espera configuración y comprobación de SMTP y redirecciones Auth. Gmail espera credenciales OAuth y validación Google. SMS, proveedores IA y cobros permanecen apagados. El copiloto local, los ejemplos de facturas y los servicios simulados de pruebas no equivalen a esas integraciones reales.

No se han registrado empresas reales ni enviado correos/SMS, documentos a modelos o pagos. Los datos de demo son locales y ficticios. Android y Windows se verifican con emulación Chromium; faltan pruebas físicas y aceptación final de proveedores.

La matriz de pruebas está en [TESTING.md](TESTING.md); el registro para reanudar está en [PROGRESS.md](PROGRESS.md). Administración y recuperación: [SAAS_ADMIN.md](SAAS_ADMIN.md), [MAINTENANCE.md](MAINTENANCE.md). La documentación histórica se conserva en `history/20261028/`.
