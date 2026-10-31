# Registro de reanudación — 31 de octubre de 2026

Repositorio: https://github.com/smartscaneuskadi/TruckControl-AI

Rama de trabajo: `feat/dedicated-supabase-project`.

Se recuperaron 125 archivos y el historial completo del commit `451597eac31792478b26309dfb1b188babbc9dd0` desde el respaldo de Sites y se subieron a GitHub. La copia publicada anterior se conserva en https://truckcontrol-ai-fase-1.earlymug513.chatgpt.site.

El entorno volvió a funcionar. Se instaló exactamente `package-lock.json`, conservando versiones e integridades; la caché de npm se ubicó en `/tmp` porque el directorio personal no permite escritura. Las 117 pruebas del respaldo, la compilación TypeScript y la compilación PWA pasaron antes de las modificaciones de esta sesión.

Se recuperaron del proyecto independiente `kkkemaycedexymrpaqtp` las migraciones ya aplicadas de consulta documental IA y protección del origen de los apuntes. Sus versiones, nombres y sumas SHA-256 están en `deployment/recovered-migrations.json`. **No volver a ejecutar esas migraciones en ese proyecto** ni aplicar ciegamente `supabase db push`: las migraciones iniciales se desplegaron en lotes y el historial remoto difiere del historial fuente. Revisar y conciliar antes de nuevos despliegues. FIXPilot no se ha modificado.

Se recuperó el código servidor de `company-assistant` desde la función desplegada. La consulta IA y su cuota están sujetas a autenticación, empresa, permisos, autorización individual y configuración del proveedor. No se han activado proveedores, cobros ni consumo IA.

Se corrigió el fallo de Android: las etiquetas accesibles ocultas de las tablas ampliaban el viewport de 412 a 504 píxeles. El anclaje de `.sr-only` evita ese desbordamiento sin quitar las etiquetas accesibles. Ahora el viewport mantiene 412 píxeles y se puede pulsar Configuración.

Se restauraron informes, pruebas del asistente documental y del cifrado offline. Se añadieron controles de precisión monetaria, mililitros y kilometraje. Las 131 pruebas unitarias/SQL y las 16 pruebas SaaS de escritorio/Android pasaron. Estas últimas comprueban recarga sin red, almacenamiento cifrado, conservación ante conflictos, reintentos sin duplicados y bloqueo tras suspensión de la cuenta.

La batería de flota pasó 27 de 28 casos y detectó una región desplazable de informes sin acceso por teclado en Android. Se añadió foco y nombre accesible y los seis casos de módulos, navegación y contabilización pasaron en escritorio/Android. Los otros 22 casos de flota ya habían pasado. Las ocho pruebas de empresas también pasaron. Las 64 pruebas originales y las ampliaciones anteriores siguen intactas: once archivos verificados por SHA-256. El análisis de dependencias de ejecución no encontró vulnerabilidades.

GitHub admite lectura, ramas y escritura de código. Los endpoints administrativos de Pages, permisos Actions y protección de ramas devuelven «Resource not accessible by integration» (403); son permisos distintos de contenido. La publicación continuará en Sites sin contratar servicios. Se verificó que la versión pública anterior sigue activa (versión 4). Pendiente antes de la siguiente publicación: CI, documentación de entrega y empaquetado. La biblioteca de demostración se revisa a continuación.

El alta real sigue cerrada en Supabase. Faltan configuración de correo/redirects de Auth y credenciales Google OAuth para el uso comercial. SMS, modelos IA y pagos permanecen opcionales y desactivados. Ninguna empresa real se ha registrado durante las comprobaciones.

Se aplicó y comprobó en Supabase la migración `20261031071642_truckcontrol_document_module_boundaries`, creada primero con CLI. Ahora Gmail sin biblioteca solo permite adjuntos vinculados a facturas; los archivos huérfanos no se descargan desde el navegador. La prueba SQL remota con usuarios/archivos ficticios y rollback pasó y dejó cero usuarios sintéticos. Hay 37 migraciones reales; el inventario se actualizó. Asesor de seguridad: cero incidencias.

La biblioteca de demo permite subir PDF/imágenes ficticias, asociar fichas, persistir en IndexedDB y descargar. Se advierte que es local sin cifrar y se exige confirmar el carácter ficticio. Límite 10 MB por archivo/50 MB en total. Sus dos casos Playwright pasaron junto a los seis anteriores de documentos/facturas; se corrigió el contraste de errores. La compilación y las 134 pruebas Vitest/SQL pasaron. Las pruebas de empresas (8) y SaaS (16) anteriores se conservan.

La ejecución GitHub Actions 41179883499 del commit 4b30a4917576239cf18022b7450763dd27480741 terminó correctamente: check, navegador de flota, empresas y SaaS. Se fijaron las acciones oficiales por SHA y se añadió ejecución manual/cancelación de CI obsoleto. La documentación anterior está archivada en `docs/history/20261028/`; los documentos actuales reflejan el proyecto real y las condiciones de treinta días/10 euros.

PUBLICADO: versión 5 en https://truckcontrol-ai-fase-1.earlymug513.chatgpt.site, despliegue `appgdep_6ae5d64603708191bf34f178553be47d`, fuente `7a68a555cfa76b394ecd93240aac0c2e55906411`. Versión guardada `appgprj_6adfbdfa388481919121d43f0fd9c242~appgver_bfa21de97e048191afaa215784c06434`. Se conservó la audiencia pública y la versión 4 para rollback. HTTPS y hashes del índice/assets/SW comprobados. La CA de interceptación del entorno impide Chromium remoto; no se ignoraron certificados. El recorrido del artefacto local pasó en Android/escritorio, incluido offline.

GitHub: PR #1 integrado en main (`e59d8d4590012eac9243f3f0b50a2a74aff6d364`) tras CI correcto en rama y PR. Hay 188 pruebas aprobadas, incluidas las 64 originales intactas. Fuentes y rama de desarrollo conservadas. Actions ejecuta las comprobaciones automáticamente. La configuración de Pages/protección sigue bloqueada por permisos administrativos de integración, no por escritura de código.

Backups locales: `/workspace/artifacts/truckcontrol-20261031/` contiene bundle completo verificado, ZIP de fuentes, TAR de despliegue, capturas y estado de despliegue sin secretos. La rama oficial contiene los avances; el origen Sites conserva el commit publicado. Supabase final: 37 migraciones, Auth/empresas/archivos 0, bucket privado, RLS y enforcement activos; alta/SMS/pagos/Gmail/IA desactivados. FIXPilot intacto.

PENDIENTE COMERCIAL REAL: configurar SMTP y redirecciones alojadas de Auth por un mecanismo autorizado, confirmar la cuenta del administrador y probar entrega real; configurar/verificar cliente Google OAuth y su revisión; activar opcionalmente SMS/IA/pagos solo con credenciales y autorización de costes; probar dispositivos físicos y restauración en un destino aislado autorizado. No presentar la demo publicada como producción comercial abierta. No volver a crear el proyecto ni repetir migraciones aplicadas.

## Continuación autorizada: proveedores para más adelante

El propietario pidió continuar las mejoras y dejar los servicios externos para después. Rama `feat/demo-recovery-alerts`, partiendo de `667ff920084304919d44699f651929a2c5219b38`. Se creó un Git bundle antes de editar. No se han modificado Supabase, FIXPilot, credenciales, proveedores ni costes en esta fase.

Actualización 0.3.0: alertas con prioridad manual, filtros y búsqueda; campana con avisos operativos según módulos; clave estable para mantenimiento por kilómetros, lecturas de combustible ya realizadas y reconocimiento manual sin duplicar el aviso. Las fechas se actualizan cada minuto y al volver a la pestaña.

Se añadieron copias de fichas y operaciones, importación JSON con vista previa, confirmación, rechazo de empresas ajenas, datos inválidos, archivos de más de 10 MB y vistas previas obsoletas. La restauración conserva un punto anterior y reemplaza ambos conjuntos en una única escritura. Un fallo de cuota conserva los datos previos. Los binarios no se incluyen ni se borran. Los formatos anteriores y sus claves se conservan.

Comprobado localmente: 149 pruebas unitarias/SQL, TypeScript, build PWA y guardia de once archivos retenidos. Los diez nuevos recorridos de navegador pasan en escritorio/Android: restaurar, cancelar, recuperar, conservar archivos, rechazar copias inválidas/ajenas y cambios de otra pestaña; prioridad de alertas, integración de campana y reconocimiento estable al cambiar de día. Un selector de cierre de diálogo del test se corrigió para usar la etiqueta existente «Cerrar ventana»; no se modificaron las pruebas anteriores.

Siguiente paso: CI completo con las pruebas anteriores, revisión de PR y publicación de la nueva versión sin sustituir la estable hasta pasar las comprobaciones. La versión 5 publicada sigue siendo la referencia estable mientras finaliza esta actualización.

El CI completo del primer commit de esta fase (`a3117e87b214a1e15fffa5c03f7e5f6b35d3351f`) pasó tanto en rama (41224695314) como en PR #2 (41224745162). Se añadieron después dos recorridos de compatibilidad de actualización y una prueba unitaria que verifican la conservación de ediciones de la demo anterior y de la clave heredada; ambos perfiles y la prueba unitaria pasan. La suma esperada de la revisión final es 150 unitarias/SQL, 42 demo, 8 empresas y 16 SaaS (216), pendiente de confirmación por CI sobre el último commit.

El paquete comercial sin credenciales también pasó la comprobación en escritorio/Android: portal → demo → exportación/restauración con recarga → punto de recuperación → recarga fría offline → alertas; no hubo solicitudes a proveedores. Capturas y artefactos preparados en `/workspace/artifacts/truckcontrol-0.3.0/`. Auditoría de dependencias de ejecución: cero vulnerabilidades. El PR #2 sigue abierto mientras se verifica la revisión final.
