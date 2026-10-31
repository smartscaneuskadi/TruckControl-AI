# TruckControl AI

Gestión de flotas para empresas de transporte, con React, TypeScript, Supabase y PWA para Android y Windows. Versión 0.2.0 de demostración; continuación del código y del historial existentes.

**Demostración pública:** https://truckcontrol-ai-fase-1.earlymug513.chatgpt.site

La demo contiene datos ficticios y guarda los cambios en tu navegador. No introduzcas datos empresariales reales. La versión comercial permanece cerrada hasta configurar y comprobar los proveedores de autenticación y correo. Los pagos y el consumo IA están desactivados.

## Probar e instalar

Abre la URL y pulsa **Explorar la demo** si aparece el portal de planes. En **Camiones** encontrarás 50 vehículos ficticios y sus fichas. Crea un ingreso de 500,25 € y un gasto de 100,10 € para el mismo camión y mes: el beneficio aumenta 400,15 €. Recarga para comprobar que los cambios se conservan.

Explora **Remolques**, **Clientes**, **Viajes**, **Mantenimiento**, **Combustible**, **Vencimientos**, **Alertas** e **Informes**. Un viaje finalizado se puede contabilizar con confirmación humana, una sola vez. Los informes permiten exportar CSV. En **Facturas Gmail** se puede revisar y aprobar una factura ficticia sin abrir ningún correo real.

En **Documentos** puedes subir un PDF o una imagen ficticia, asociarlos a un vehículo o conductor y descargarlos. Esta biblioteca de prueba es local y no está cifrada. La biblioteca comercial utiliza almacenamiento privado de Supabase y permisos por empresa.

- **Android:** abre el enlace en Chrome → menú ⋮ → **Instalar aplicación** o **Añadir a pantalla de inicio**.
- **Windows:** abre el enlace en Edge o Chrome → icono de instalación en la barra de direcciones → **Instalar**.
- Es una PWA: no requiere APK, EXE ni tienda de aplicaciones. La opción también aparece en **Configuración → Instalar aplicación** cuando el navegador la admite.

## Funciones y límites

Incluye panel financiero con diseño verde oscuro, azul marino y negro; reloj de Madrid, disponibilidad y kilometraje; camiones, conductores y asignaciones; remolques, clientes, viajes, combustible, gastos, ingresos, rentabilidad, mantenimiento, vencimientos, alertas, informes, exportaciones y biblioteca documental.

El código comercial incorpora registro con confirmación de correo, SMS opcional si se configura proveedor, empresas aisladas, roles de propietario/administrador/operador/consulta, invitaciones, panel de superadministrador, control de módulos e IA por usuario y plan editable. Las condiciones actuales son **30 días de prueba Full** y **plan Inicial de ejemplo de 10 €/mes**, hasta 50 camiones por empresa. No hay cobros reales ni renovación automática activada.

Gmail OAuth y consulta documental IA tienen funciones servidor desplegadas y pruebas de permisos; **faltan credenciales y validación con los proveedores reales**. El copiloto de la demo produce recomendaciones mediante reglas locales. No se presentan sus resultados como llamadas a un modelo IA.

La PWA funciona sin red tras la primera carga. Las cuentas comerciales tienen una copia offline opcional cifrada y una cola de cambios de operaciones con revalidación de acceso y conflictos. Los documentos privados y la contabilidad requieren conexión. Véase [arquitectura y límites offline](docs/ARCHITECTURE.md).

## Infraestructura y conservación

Repositorio oficial: https://github.com/smartscaneuskadi/TruckControl-AI. Rama de trabajo: `feat/dedicated-supabase-project`. Se mantienen los commits anteriores y las 64 pruebas originales; once archivos de pruebas previas tienen verificación SHA-256.

Supabase independiente: **truckcontrol-ai**, referencia `kkkemaycedexymrpaqtp`, organización `fixpilot-dev`, región eu-west-2. FIXPilot no se ha modificado. El antiguo prototipo merymery_16 está pausado conservando sus datos, según la autorización del propietario.

Hay 37 migraciones remotas aplicadas. No ejecutar `supabase db push` sin conciliar el historial: los lotes iniciales remotos tienen versiones distintas de los archivos fuente. El inventario y las migraciones recuperadas están en [despliegue](docs/deployment/).

## Desarrollo

Node.js 24 recomendado; dependencias exactas en el lockfile. La demo no necesita credenciales.

```sh
npm ci --ignore-scripts
npm run dev
npm run check
npx playwright install chromium
npm run test:e2e
npm run test:e2e:companies
npm run test:e2e:saas
```

Estas instrucciones son para mantenimiento; el usuario de la demo solo necesita abrir el enlace. El CI ejecuta las comprobaciones con servicios simulados y datos ficticios. Nunca poner secretos en variables `VITE_`, commits ni artefactos públicos.

Documentación: [entrega](docs/CURRENT_DELIVERY.md), [administración](docs/SAAS_ADMIN.md), [Gmail e IA](docs/COMPANIES_GMAIL.md), [pruebas](docs/TESTING.md), [recuperación](docs/MAINTENANCE.md), [registro persistente](docs/PROGRESS.md). La documentación anterior se conserva en `docs/history/20261028/`.
