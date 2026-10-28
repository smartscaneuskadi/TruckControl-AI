# Verificación de TruckControl AI

Las 64 pruebas originales (48 Vitest y 16 Playwright) se conservan sin modificar. La ampliación añade pruebas de permisos, OAuth, documentos, concurrencia, paginación y pantallas de empresa. No usa credenciales empresariales ni efectúa llamadas a servicios IA reales.

Resultado de la ampliación SaaS, 28/10/2026: **140 pruebas aprobadas** — 98 Vitest, 22 Playwright de demo, 8 Playwright de empresas y 12 Playwright SaaS con servicios simulados. Las 105 pruebas de la entrega anterior se conservan; también siguen intactas las 64 originales. TypeScript, compilación PWA y `deno check` correctos.

En el prototipo autorizado de merymery_16 se comprobó además aislamiento entre dos empresas, suspensión y cuenta administradora en PostgreSQL real, dentro de una transacción revertida. No quedaron usuarios ficticios en Auth. El catálogo público respondió HTTP 200 y administración/Gmail/cobros rechazaron acceso sin sesión con HTTP 401. El asesor de seguridad no señaló incidencias. No se enviaron correos, SMS, facturas a IA ni pagos reales.

La migración adicional de índices pasa las pruebas locales, pero no se aplicó al prototipo: la revisión automática no pudo completarse por límite de uso. El destino nuevo `truckcontrol-ai` solicitado posteriormente todavía no existe. La compilación comercial de revisión muestra planes y demo con las credenciales vacías; no permite enviar un registro real.

## Pruebas automatizadas

`npm run check` ejecuta TypeScript, Vitest y la compilación de producción, incluido el service worker.

Vitest cubre cálculos con céntimos, entradas decimales, pérdida y margen sin ingresos, límites mensuales y anuales, conciliación de los 50 camiones, asignaciones, matrículas duplicadas, protección del historial y exportación CSV. También comprueba persistencia entre instancias, rechazo de datos corruptos sin sobrescritura y errores de cuota.

Las pruebas SQL ejecutan las migraciones en PGlite (PostgreSQL WASM) y prueban RLS entre dos organizaciones, permisos anónimos, restricciones de claves externas, importes, borrados y asignaciones. La función `auth.uid()` es un stub de prueba; esta batería se ejecuta sin conectarse a una base remota. Las comprobaciones remotas independientes se describen al principio de este documento.

`npm run test:e2e` usa Playwright con dos perfiles de Chromium: escritorio de 1440 px y emulación de Pixel 7. Cubre:

- Crear ingreso y gasto, conciliar el beneficio y recargar sin perder cambios.
- Crear conductor y camión, asignarlos y editar una ficha.
- Rechazar duplicados y proteger vehículos con historial.
- Filtrar pagos, descargar CSV y usar la búsqueda global.
- Navegar en móvil, paginar y abrir los detalles de avisos.
- Cargar y navegar sin conexión después de registrar el service worker.
- Recuperar almacenamiento dañado y confirmar el restablecimiento.
- Comprobaciones automáticas WCAG A/AA del panel con axe y ausencia de solicitudes a Supabase.

El informe HTML y las trazas de fallo se generan en carpetas ignoradas por Git. GitHub Actions instala Chromium y ejecuta todas las comprobaciones desde cero.

## Pruebas añadidas de empresas y facturas

- `tests/company-security.test.ts`: migraciones completas, roles `anon`, `authenticated` y `service_role`, tablas privadas, Storage privado, aislamiento de documentos, tokens inaccesibles al navegador, estado OAuth de un solo uso, límites IA y aprobación SQL idempotente con base sin IVA.
- `src/integrations/gmail/handler.test.ts`: servidor HTTP de OAuth, autenticación y pertenencia a empresa, PKCE, finalización con el mismo usuario, cifrado ligado a empresa/usuario, adjuntos duplicados, recuperación de paginación, validación de facturas y ausencia de consumo IA por defecto. Todas las llamadas externas están simuladas.
- `src/integrations/supabase/repository.test.ts`: SDK real con transporte HTTP simulado; carga de 2.101 movimientos, filtros de empresa, versiones concurrentes y escrituras por entidad sin upsert global.
- `tests/e2e/company-demo.spec.ts`: factura ficticia sin duplicados al recargar, conservación de la demo al visitar el acceso pendiente y axe en documentos, facturas y acceso.
- `npm run test:e2e:companies`: construye una copia aislada con URL y clave públicas ficticias, intercepta todo Supabase en Playwright y verifica acceso de dos propietarios, cambio de empresa, cierre de sesión, conservación de la demo, creación de otra empresa y confirmación de correo en escritorio/Android. No publica esa compilación ni envía correos.

La función Edge también se comprueba con `deno check` sin ejecutarla contra servicios externos.

## Límites de verificación

Los perfiles de escritorio y Android son emulaciones de navegador en Linux, no pruebas en dispositivos físicos Windows/Android. El flujo de cuentas/empresas se ha validado con servicios simulados; no se ha validado aún Supabase Auth real, PostgREST remoto, OAuth Google real ni sincronización entre dispositivos. Supabase ha bloqueado la creación del proyecto por cuota gratuita. No se han podido ejecutar asesores remotos ni regenerar tipos desde ese proyecto. Tampoco se ha validado un instalador nativo .exe/.apk. Axe detecta solo parte de los problemas de accesibilidad.

## Recorrido sin terminal

Abre la demo privada indicada en el README. Selecciona un vehículo y un mes; anota su beneficio. Registra 500,25 € de ingreso y 100,10 € de gasto para ese mismo vehículo y periodo. Su beneficio debe subir 400,15 €. Recarga para comprobar persistencia. Descarga el informe desde Rentabilidad y prueba la búsqueda por matrícula. Restablece la demo desde Configuración cuando termines.
