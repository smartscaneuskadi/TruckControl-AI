# TruckControl AI 0.4.0-rc.1

Esta es una candidata de demostración para revisar el lanzamiento 1.0. La demo estable v6 conserva su alojamiento y sus datos locales. La candidata tiene otra identidad y otro origen; no mezcla su almacenamiento con la demo anterior.

## Qué incorpora

- Contratación mensual preparada con condiciones versionadas, cuota obtenida del servidor, prueba gratuita conservada y reserva que evita procesos simultáneos. Cancelación de la renovación y recibos propios. La URL de retorno no activa acceso.
- Confirmación de pagos por factura y suscripción verificadas, deduplicación, protección ante eventos retrasados y suspensiones administrativas. Una reserva no se libera por el reloj local: espera confirmación de caducidad del proveedor.
- Cuatro tablas privadas de facturación con RLS, políticas restrictivas y permisos exclusivos de servidor. Se mantiene la API anterior de pago por un mes.
- Cliente limitado al proyecto Supabase autorizado, sin reutilizar FIXPilot. La candidata no conecta con cuentas reales: su compilación impide incluir conexión de empresa y su interfaz cierra las altas y los formularios de credenciales.
- Versionado de paquetes con `release.json`, instrucciones PWA y comprobación del sitio publicado desde GitHub. Todos los datos de la candidata son ficticios.

## Pruebas y límites

La batería conserva las 64 pruebas originales y suma 180 unitarias/SQL, 7 de configuración de correo, 42 de demo, 8 de empresas, 28 SaaS y 6 de candidata. El CI del commit publicado ha pasado las 271 pruebas; una comprobación omitida no se cuenta como aprobada. Los perfiles Android y Windows son emulaciones Chromium.

Además, el proyecto real de Supabase pasó verificaciones con rollback y el nuevo endpoint devuelve los rechazos de autenticación, origen, método y firma esperados. Registro, pagos, Gmail y modelos IA siguen desactivados; no se enviaron facturas o documentos a proveedores. No se han realizado cobros.

La publicación comercial necesita todavía dominio comprado/DNS, SMTP y entrega real, administrador verificado, proveedor OAuth y revisión cuando proceda, presupuesto de IA, condiciones y fiscalidad aprobadas, recuperación comercial y aceptación física cuando haya dispositivos disponibles. La contabilidad y los recibos de suscripción no equivalen a una implantación fiscal de emisión de facturas de venta; ese proceso se debe validar antes de anunciarlo como tal. Las restauraciones locales no sustituyen el ensayo de recuperación de servidor y de sus documentos.

Fuente y estado: [COMMERCIAL_LAUNCH.md](COMMERCIAL_LAUNCH.md). Uso e instalación: [INSTALLATION.md](INSTALLATION.md).
