# CargoTrack integrado y persistente

Revisión solicitada después de Sites33: el acceso principal se abre **dentro de TruckControl**, sin otra pestaña. La versión estable33 se conserva mientras se verifican y publican estos cambios.

El usuario pulsa «Entrar en CargoTrack» y completa el formulario del proveedor dentro de un iframe HTTPS de https://on7.cargotrack.ro/signin. TruckControl no contiene un formulario de contraseña de CargoTrack, no intercepta credenciales, no lee su almacenamiento y no añade API ni sincronización. La política del mismo origen separa los documentos.

Workspace conserva el componente fuera de Routes: ocultar la sección no desmonta el iframe. Cambiar de módulo y volver conserva el mismo documento y su estado. La clave del componente incluye modo, usuario, empresa seleccionada y contexto offline. Salir de TruckControl o cambiar de empresa retira el documento; una nueva sesión exige volver a abrir la vista. No se cierra automáticamente la sesión independiente del proveedor. Sus cookies y caducidad siguen gestionadas por CargoTrack: no se promete autenticación indefinida ni aislamiento de sus cuentas dentro del mismo perfil de navegador.

Sólo se muestra «Vista de CargoTrack abierta», sin afirmar que el usuario está autenticado. El evento load no acredita conexión. El sandbox permite formulario/scripts/almacenamiento del origen del proveedor/descargas y ventanas del proveedor, pero no navegación superior. Se omite Referer; no se transmiten Authorization ni datos de TruckControl. Las ventanas auxiliares del proveedor sólo corresponden a sus propias acciones; el botón principal nunca crea pestañas.

Para navegadores que bloqueen almacenamiento integrado, la ayuda ofrece abrir el proveedor voluntariamente en la **misma pestaña**, regresando con Atrás. No se desactivan controles de privacidad del usuario ni se usa un proxy para quitar cabeceras del proveedor. Sin conexión se informa de que sus datos pueden estar desactualizados; desde una copia offline no se abre una nueva vista.

## Comprobación reproducible

`npm run check` conserva las64 pruebas iniciales/11hashes y valida tipos/unitarias/SQL/build. La suite SaaS prueba navegación sin pestaña, documento y borrador conservados, separación de origen, temas/Axe/ancho móvil, salida y cambio de empresa. Las aserciones anteriores de apertura en otra pestaña se actualizan por esta petición explícita; las pruebas iniciales no cambian.

`node scripts/verify-cargotrack-embedding.mjs` comprueba el formulario **real, sin autenticar**, en perfiles Android/Windows. No rellena contraseñas ni envía login. Conserva flags de navegador/TLS/SOP: sólo retira el override de Playwright que desactiva ThirdPartyStoragePartitioning, restableciendo el almacenamiento particionado seguro que utiliza Chrome. Los perfiles siguen siendo emulación, no hardware físico. Un navegador que bloquee todo almacenamiento de terceros puede necesitar la alternativa de la misma pestaña.

Variables opcionales: PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, TRUCKCONTROL_CARGOTRACK_PROBE_URL (sólo orígenes oficiales o localhost4194), TRUCKCONTROL_CARGOTRACK_SOURCE_COMMIT (SHA exacto en producción), TRUCKCONTROL_CARGOTRACK_LIVE_ARTIFACTS (evidencias). Los perfiles temporales no se suben a GitHub. Ver verification/cargotrack-embedded-preview-20261108.json; el recibo final de publicación se registra por separado.

## Publicación

Pendiente de CI completo, integración y promoción de fuente/paquete exactos en Sites de producción. No desplegar el manifiesto de demo de main. Preservar Sites33/32/31 y demo6. Sin DDL ni Edge ni compras ni llamadas IA. Native63 y tarea37 no se repiten. Una sesión real y sus permisos los concede el titular directamente en CargoTrack; no enviar credenciales al chat.
