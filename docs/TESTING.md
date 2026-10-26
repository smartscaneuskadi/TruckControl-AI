# Verificación de Fase 1

## Pruebas automatizadas

`npm run check` ejecuta TypeScript, Vitest y la compilación de producción, incluido el service worker.

Vitest cubre cálculos con céntimos, entradas decimales, pérdida y margen sin ingresos, límites mensuales y anuales, conciliación de los 50 camiones, asignaciones, matrículas duplicadas, protección del historial y exportación CSV. También comprueba persistencia entre instancias, rechazo de datos corruptos sin sobrescritura y errores de cuota.

Las pruebas SQL ejecutan las migraciones en PGlite (PostgreSQL WASM) y prueban RLS entre dos organizaciones, permisos anónimos, restricciones de claves externas, importes, borrados y asignaciones. La función `auth.uid()` es un stub de prueba; no se ha conectado ni modificado una base remota.

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

## Límites de verificación

Los perfiles de escritorio y Android son emulaciones de navegador en Linux, no pruebas en dispositivos físicos Windows/Android. No se ha validado una instalación nativa .exe/.apk, una conexión a Supabase real, acceso multiusuario o sincronización. Axe detecta una parte de los problemas de accesibilidad y no sustituye pruebas manuales con lectores de pantalla.

## Recorrido sin terminal

Abre la demo privada indicada en el README. Selecciona un vehículo y un mes; anota su beneficio. Registra 500,25 € de ingreso y 100,10 € de gasto para ese mismo vehículo y periodo. Su beneficio debe subir 400,15 €. Recarga para comprobar persistencia. Descarga el informe desde Rentabilidad y prueba la búsqueda por matrícula. Restablece la demo desde Configuración cuando termines.
