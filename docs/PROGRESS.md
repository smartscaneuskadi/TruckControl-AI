# Registro de reanudación — 31 de octubre de 2026

## Estado vigente · 8 de noviembre de 2026

Este checkpoint prevalece sobre todas las notas y listas históricas inferiores. PR75 quedó integrado en71c72; PR78 incorporó también los ensayos PostgreSQL en main `1c4c44d32067fb0d2e885a0cec5020b25d361323`, tras los CI completos de los heads7d411 y f3205. **La web pública sigue en Sites32 / app0.5.20-rc.1**, https://truckcontrolai.com; v31 y demo6 se conservan. Integrar código no equivale a publicar el frontend.

**Supabase:63 migraciones aplicadas.** Local `20261108100352_manual_subscription_payment_and_documents.sql` → remota `20261108123230_manual_subscription_payment_and_documents`. Gitblob `36786ff4a510b3e0df0cde32ddd71a630fc0214b`; SHA256 `cbfe47861f20129c4fbc51ebf35b2e37b46784489aee406f49291896fa81e069`. Fuente nativa idéntica, un statement registrado y OID/ACL18083,18118,19429 preservados. **La63 es inmutable: no editarla, reaplicarla ni revertir las61/62 anteriores. FIXPilot permanece separado.**

**Contrato nativo aprobado y completado:** `session-fiscal-pipeline-cleanup-v1`, script Gitblob `ace04d8b048d412a60b8e2ccad5fee5c09b977e5`. Diez contadores de fixtures a0 tras rollback (usuarios,sesiones,administradores,pedidos,tareas,eventos,acciones,canales,recibos y avisos); baseline de18tablas/flags intacta. Las8tablas nuevas tienen RLS. No se han hecho pagos, emisiones fiscales, correos ni llamadas IA para esta aceptación.

**Siete Edge existentes actualizados y verificados:** Auth5, Billing13, Subscriptions13, Gmail14, Mail13, Copilot3 y Assistant11;55fuentes runtime exactas. Deno/configuración no se confunde con archivos runtime. Inbound Resend3 intacto. Seis GET HTTPS devuelven405 y Gmail retorna su callback controlado `gmail_error=invalid_state`: no es prueba de conexión de un buzón. Los3workers nuevos también están desplegados con fuentes verificadas: Stripe fiscal1(7), documentos privados1(3) y avisos1(2). Hay11funciones nativas contando inbound Resend3. **El negocio permanece OFF:** sin canales de pago habilitados, documentos y avisos apagados, sin scheduler de avisos ni aceptación externa de cobro/emisión/entrega.

**Evidencia:** CI42479482785/42479488860 SUCCESS,1.526controles por ejecución; originales64/11hashes conservados. PR77/head4ea39a tiene69checks PostgreSQL17 y recuperación lógica aislada correctos en42480734805/42480739225; se integró mediante PR78. No acredita recuperación gestionada de Supabase/Auth/Storage/secretos ni dispositivos físicos. No sumar reejecuciones.

**Límites vigentes:** no se repite la tarea37 ni sus8llamadas reales. IA10USD/mes y100llamadas/empresa sin cambios. Nuevas compras0 y nuevas llamadas IA de prueba0; presupuesto agregado200EUR, gasto/saldo globales sin conciliar. Cobros y lanzamiento comercial completo siguen pendientes de aceptación Stripe/fiscal, Google público, recuperación gestionada y revisión externa.

**Estado leído a13:02UTC:** registro abierto, acceso exigido y cobros OFF;0tareas fiscales,0avisos y0canales Stripe habilitados. Gmail health configured=true, pero0buzones empresariales vinculados (1estado OAuth caducado,0vigentes). Bucket fiscal privado `tc-subscription-fiscal`,PDF,10MB; no se han probado bytes nativos. Los GET de workers Stripe/avisos devuelven405 y el PDF403 sin Origin, coherentes con sus controles.

**Recursos y conexiones:** la organización Supabase fixpilot-dev ya tenía Pro; no hubo upgrade. La protección contra contraseñas filtradas seguía OFF en el último asesor: pendiente de configuración/validación, **no de contratar Pro**. El conector Stripe está disponible con ELEVADANCOR en sandbox, sin nuevas altas, claves o cargos en la inspección inicial. Las credenciales del backend siguen pendientes de una vía oficial segura; no reutilizar OAuth del conector fuera de sus herramientas.

No se ha creado ninguna rama de base de datos. La cotización de rama aislada0.01344/h no está aprobada ni incurrida; no se trata como gasto real ni saldo disponible.

**Recibos durables de PR80:** [aceptación nativa63](https://github.com/smartscaneuskadi/TruckControl-AI/blob/9a2c0227bf4c2b2a5fe836c9b812a723d37d475d/docs/verification/session-fiscal-pipeline-native-20261108.json), [inventario63](https://github.com/smartscaneuskadi/TruckControl-AI/blob/9a2c0227bf4c2b2a5fe836c9b812a723d37d475d/docs/deployment/remote-migrations-20261108-session-fiscal.json), [7Edge existentes](https://github.com/smartscaneuskadi/TruckControl-AI/blob/9a2c0227bf4c2b2a5fe836c9b812a723d37d475d/docs/verification/edge-session-native-rollout-20261108.json) y [3workers cerrados](https://github.com/smartscaneuskadi/TruckControl-AI/blob/9a2c0227bf4c2b2a5fe836c9b812a723d37d475d/docs/verification/manual-workers-native-20261108.json). Los enlaces fijan el commit del recibo; su integración en main se coordina por separado.

### Referencias de continuidad

El plan vigente está en [PROGRESS raíz](../PROGRESS.md), [TODO](../TODO.md), [BLOCKERS](../BLOCKERS.md), [TEST_RESULTS](../TEST_RESULTS.md) y [DEPLOYMENT](../DEPLOYMENT.md). Los apartados antiguos de este registro conservan evidencia cronológica, pero no autorizan repetir migraciones, consumos, compras o publicaciones.

## Histórico conservado — no sustituye el estado vigente

**Actualización07/11:** v32 publicada y issue37 cerrada; empieza la orden comercial integral en issue41. El estado y plan vigentes están en [PROGRESS raíz](../PROGRESS.md), [TODO](../TODO.md), [BLOCKERS](../BLOCKERS.md), [TEST_RESULTS](../TEST_RESULTS.md) y [DEPLOYMENT](../DEPLOYMENT.md). El resto de este archivo conserva su historial; no reactiva configuraciones antiguas.

**Estado vigente:** producción conectada 13 publicada en https://truckcontrolai.com; propietario verificado con contraseña y rol global. Registro de clientes abierto tras comprobar las tres condiciones; cobros automáticos y SMS apagados. Ver CURRENT_DELIVERY.md, CLIENT_LAUNCH.md y el inventario de despliegue. Los apartados siguientes conservan el historial cronológico y no sustituyen ese estado.

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

PUBLICADO 0.3.0: versión Sites 6, URL estable https://truckcontrol-ai-fase-1.earlymug513.chatgpt.site, despliegue `appgdep_6ae6271c9c688191a1d44512fee56e03`, versión `appgprj_6adfbdfa388481919121d43f0fd9c242~appgver_94acb8f4dd3c8191a2f63eba9cd5fea9`. Fuente `b335b28cb0070abe8a28cba3f0a041170d42218c`. Audiencia pública conservada; versión 5 disponible para recuperación. HTTP/TLS, índice, JS, CSS, SW, manifiesto e iconos verificados contra el artefacto limpio. No usar los paquetes preliminares de staging: el publicado es `truckcontrol-0.3.0-b335b28-demo.tar.gz`.

CI final confirmado: 150 unitarias/SQL + 42 demo + 8 empresas + 16 SaaS = 216. Ejecuciones 41225009144 y 41225014197 correctas; logs consultados. PR #2 integrado mediante merge `476f3a3e2ba92a4c73e5d279e3f3b2446d89d99f`. La rama de desarrollo se conserva. El preview local de esta fase se detuvo y los navegadores QA se cerraron.

El propietario dejó los proveedores y la apertura comercial para más adelante. Se mantienen los bloqueos/configuraciones de la entrega anterior, sin nuevos cambios en Supabase, FIXPilot, credenciales, servicios de pago ni datos reales. Para reanudar: leer CURRENT_DELIVERY, DEMO_RECOVERY y release-0.3.0.json; no recrear el proyecto, no repetir migraciones ni sobrescribir trabajos de terceros.

## Activación del correo real solicitada

El propietario pidió configurar el correo real y aclaró expresamente «Confirmación de cuentas y recuperación de contraseñas». Rama `feat/transactional-email-setup`, con un Git bundle previo. La demo Sites versión 6 permanece publicada.

Se comprobó que el proyecto independiente está ACTIVE_HEALTHY y que el dominio smartscaneuskadi.com utiliza Google Workspace (MX y SPF públicos). No se modificó DNS. No hay credenciales de administración/SMTP configuradas en el entorno. Las herramientas Supabase no incluyen configuración de Auth alojado. La CLI confirmó ausencia de autorización. Se inició el flujo oficial CLI, nombre `truckcontrol-ai-mail-setup`; la sesión está esperando el código temporal que el titular recibe al autorizar. Metadatos de esa sesión únicamente en `/workspace/artifacts/truckcontrol-mail-setup/`, nunca en Git. No iniciar otro flujo mientras este siga pendiente.

Pendientes respuestas del titular: remitente (pedidos@smartscaneuskadi.com o dirección propia) y código temporal de autorización CLI. No pedir contraseñas ni tokens API por chat. No se han enviado correos ni creado identidades, empresas o servicios de pago.

Preparado: plantillas de confirmación/recuperación en español, redirección local HTTPS y script de plan/comprobación/aplicación parcial de ajustes Auth. El script limita proyecto y organización, conserva SMTP/secretos, no abre registros y comprueba la lectura posterior. Siete pruebas Python pasan. Cambio Free de junio 2026 verificado: se omiten plantillas alojadas hasta que exista SMTP propio. Ver `AUTH_MAIL_SETUP.md`.

Siguiente paso: reanudar la autorización oficial pendiente, comprobar configuración de TruckControl y aplicar primero los ajustes seguros. Si SMTP sigue vacío, solicitar únicamente la conexión segura del proveedor elegida por el titular. No afirmar entrega real hasta probar un envío autorizado y los dos flujos. Mantener cerrados el alta empresarial, pagos, SMS y modelos IA; no tocar FIXPilot.

# 2026-10-31 — orden de lanzamiento comercial y dominio definitivo

- Se conserva la demo pública v6 y se verifica otra copia completa del historial Git en `/workspace/artifacts/truckcontrol-commercial-baseline-20261031.bundle`.
- GitHub: PR #4 de preparación de correo integrado en `main` (`81152d9`), CI previo correcto; nueva rama `feat/commercial-release-candidate`.
- Supabase: revisión del proyecto independiente, inventario de 37 migraciones y asesor de seguridad sin incidencias. Sin cambios en FIXPilot ni apertura de registro. Los índices sin uso informados en la base todavía vacía se conservan.
- Porkbun confirma `truckcontrolai.com` disponible/no premium por 11,08 USD para un año; renovación hoy 11,08 USD/año, impuestos por confirmar en checkout. Se conserva evidencia pública sin cookies ni datos de sesión. El propietario solicita enlace de pago; compra no realizada.
- Preparación aditiva de suscripción mensual con consentimiento versionado, precio del servidor, reserva única, renovación por factura verificada, cancelación, historial propio y deduplicación. Nueva migración creada por CLI; pendiente de aplicación y de despliegue. Cobros permanecen apagados.
- Cliente Supabase rechaza proyectos ajenos al destino autorizado y URL ambiguas, manteniendo las pruebas locales.
- 179 pruebas unitarias/SQL y 7 de correo aprobadas; hashes de las 64 pruebas originales verificados; TypeScript y compilación correctos. Falta aceptación de navegador de la nueva interfaz y CI final.
- El propietario autoriza abrir el selector seguro de OpenAI sin consumo. Se inicia el flujo oficial después de guardar este punto; aún no hay clave ni autorización de gasto variable.
- Reanudación y bloqueos: `docs/COMMERCIAL_LAUNCH.md`. No se declara una versión comercial terminada ni entrega SMTP verificada.

# 2026-10-31 — candidata 0.4, seguridad y publicación separada

- CI de `4ceb74a` aprobado en GitHub. Se conserva PR #5 y todo el historial, sin sustituir la demo v6.
- Aplicadas una sola vez dos migraciones aditivas de facturación: versiones remotas `20261031205146` y `20261031210121`. Inventario actualizado a 39; no ejecutar `db push` sobre la historia reconciliada.
- `truckcontrol-subscriptions` ACTIVE v1. Sus 4 comprobaciones HTTP reales rechazan anónimos, otro origen, método y firma falsos. Sin llamadas Stripe, altas ni cargos.
- PostgreSQL real: recibos por cuenta, duplicados, suspensiones y cancelación con rollback. Cero usuarios/empresas/documentos reales; registro y pagos apagados. Asesor de seguridad sin incidencias tras hacer explícitas las políticas restrictivas.
- Aceptación de 28 recorridos SaaS y 6 de candidata en perfiles Chromium de escritorio/Android. Corregidos contraste, aceptación de condiciones vinculada a versión y error visible dentro del diálogo. Se conservan las 64 pruebas iniciales.
- Nuevo paquete `0.4.0-rc.1`, canal candidato aislado, sin conexión de empresa ni formularios de credenciales. Procedencia en `release.json`; instalación PWA y arranque sin red probados.
- Alojamiento candidato creado una sola vez: identidad persistida en `docs/deployment/candidate-hosting.json`. Pendiente de publicar el commit final tras CI. La demo estable conserva su ID y su audiencia.
- OpenAI: todavía no ha llegado selección confirmada de proyecto del formulario; no hay clave ni autorización de consumo. Dominio todavía no registrado. Propuesta de correo enviada para decisión de coste (Migadu 19 USD/año + Brevo gratuito), sin contratación.
- Próximo paso: guardar, terminar CI, publicar candidata separada y comprobar su URL. Detalle y limitaciones comerciales: `COMMERCIAL_LAUNCH.md` y `RELEASE_0_4_RC.md`.

# 2026-10-31 — publicación verificada de la candidata

- URL pública: https://truckcontrol-ai-candidata.earlymug513.chatgpt.site. Versión 1, fuente `e7a43948bff9bf3b3c5c37c890324ce6dc94852c`.
- CI de esa fuente: 271 pruebas aprobadas (180 unitarias/SQL, 7 de correo y 84 de navegador). Las 64 originales permanecen conservadas.
- Ocho archivos HTTPS públicos coinciden con el paquete probado. Índice de la demo estable v6 sin cambios. Sin conexión de empresa en la candidata ni consumo de proveedores.
- Publicación y procedencia registradas en `docs/verification/release-0.4.0-rc.1.json`. Se activa la comprobación de la URL real desde CI; pendiente de su resultado.
- El scroll móvil permite ver relojes, cuentakilómetros y planes. Las capturas usan ventanas visibles para evitar el espacio vacío de la captura completa de un contenedor con scroll.

# 2026-10-31 — URL real y capacidad verificadas

- CI `41242941858` correcto: la URL pública pasa Chrome de escritorio y perfil Android, con TLS activo, fuente coincidente, planes/altas cerrados y entrada a la demo. No se desactiva la comprobación de certificados.
- PostgreSQL real permite 50 camiones, rechaza el 51 y aísla 2.100 apuntes de dos empresas. Todo se revierte y quedan cero filas sintéticas; no es una promesa de SLA. Fuente: `docs/verification/fleet-capacity-rollback.sql`.
- Informe `release-0.4.0-rc.1.json` y entrega actual actualizados. No hay servicios de pago activados ni datos reales en la candidata.

# 2026-11-01 — dominio, correo y presupuesto autorizado

- El propietario pide crear dominio/correo y aprueba expresamente Migadu Micro por **19 USD/año** para los tres buzones. Conservar esta autorización; no repetirla. No se ha contratado ni cobrado.
- Consulta exacta de Porkbun a las 23:59 UTC: dominio AVAILABLE, no premium, 11,08 USD por registro y renovación anual publicada. Nueva comprobación del 01/11: RDAP 404 y siete consultas DNS con NXDOMAIN. No acredita propiedad ni reserva el nombre. Evidencia: `docs/deployment/domain-mail-preflight-20261101.json`.
- Descubierta y sugerida la conexión oficial de Wix para consultar compra de dominio desde el chat. Sin conexión confirmada, sin presupuesto Wix y sin nuevo sitio. El precio de Porkbun no se aplica a Wix.
- Verificado el registro oficial de Migadu, que solicita identidad y confirmación por correo del titular; no requiere tarjeta para la prueba. No hay conector de provisión ni credenciales seguras disponibles para Migadu/Brevo. No pedir secretos por chat. No inventar nombre, dominio comprado, DKIM ni pago.
- Preparación de buzones, DNS, SPF/DKIM/DMARC, SMTP, verificación y límites en `docs/DOMAIN_AND_MAIL.md`. La candidata continúa sin dominio asociado y ambas demos conservan sus direcciones. No se modifica Supabase ni FIXPilot.
- Verificados de nuevo los hashes de once archivos de las 64 pruebas iniciales y las siete pruebas de correo. Solo cambian documentación y evidencia pública.

# 2026-11-01 — dominio registrado y conexión web preparada

- El propietario confirma completados los pasos 1 y 2: compra del dominio y registro de cuenta Migadu. No repetirlos. RDAP 200 confirma registro 01/11/2026 00:15:48 UTC y vencimiento 01/11/2027; servidores de nombres Porkbun. Evidencia en `registered-domain-20261101.json`.
- Se añaden una sola vez `truckcontrolai.com` (`appgdom_6ae685a1b4008191a3bcb1750255d88e`) y `www.truckcontrolai.com` (`appgdom_6ae685ab86088191822d8b2610ca0d12`) al proyecto candidato existente. Pendientes de validación DNS y certificado; no duplicarlos ni confundirlos con HTTPS ya operativo. La demo estable se conserva.
- Registros nativos en `docs/deployment/custom-domains-20261101.json`; siete registros web preparados y solicitud concreta para soporte de Porkbun. No son una zona completa ni eliminan registros de correo. DNS todavía apunta al aparcamiento y reenvío inicial de Porkbun.
- La cuenta Migadu está creada según el titular. Dominio de correo, buzones, plan/pago y entrega aún no comprobados; faltan acceso seguro y los registros exactos de cuenta. No solicitar claves por chat ni afirmar que crear la cuenta transfiere acceso al agente.
- El entorno confirma cero secretos/identidades configurados para estos proveedores. No hay conector de edición DNS Porkbun o provisión Migadu entre los disponibles; no se vuelve a proponer Wix después de la compra. Se continúa con la preparación independiente sin nuevos cargos.
- CI del commit anterior de PR #6 (`83d6e808`) completado correctamente: ejecución `41255058432`. El código publicado permanece intacto; esta continuación actualiza documentación y configuración DNS preparada.

# 2026-11-01 — Migadu configurado en su panel y registros originales recibidos

- El propietario confirma Micro anual pagado. Las capturas 303158/303160 muestran el plan y la selección de DNS externos; 303162 confirma creación del dominio. No repetir pago, alta ni creación del dominio.
- La captura 303168.jpg muestra los trece registros BIND originales completos. Se transcriben a `docs/deployment/migadu-truckcontrolai.com.source.zone`, con hash de procedencia en el plan conjunto. No se publica la imagen con datos de su cuenta.
- Preparados veinte registros: siete web y trece de Migadu. Un solo SPF, dos MX priorizados, tres CNAME DKIM originales, DMARC `p=quarantine` del proveedor, autoconfig y cuatro SRV. TTL inicial propuesto 600; fuente conservada con 3000. Archivos JSON/BIND/CSV y solicitud completa para Porkbun.
- Se corrige el riesgo de copiar nombres técnicos traducidos: `key1/2/3._domainkey` y `hosted-email-verify` proceden del export original. No se inventan claves ni se reutilizan credenciales.
- El plan está preparado, no aplicado. Faltan inventario autenticado de Porkbun, aplicación selectiva, validación de dominio/certificado, comprobación de buzones, SMTP y entrega. No sustituir toda la zona ni borrar registros ajenos; las respuestas DNS de un comodín no prueban registros explícitos.
- PR #6 quedó integrado en `main` (`934044e5604c6d6d412f7165b286ad12c17a683e`) tras CI completo correcto (`41256538221`). Este trabajo continúa en `feat/domain-mail-dns-records`, conservando las demos y el código de aplicación.

# 2026-11-01 — conexión directa de Porkbun, DNS y HTTPS operativos

- Se descubrió el flujo oficial PKCE de Porkbun, que no aparecía en el catálogo. El titular aprobó el enlace; el backend recibió las claves sin copiarlas al chat. Permisos comprobados `read,dns`, sin compras. El titular activó API Access de truckcontrolai.com tras el error inicial `API_ACCESS_DISABLED`.
- Herramientas de mantenimiento guardadas en `scripts/porkbun_authorize.py`, `porkbun_client.py` y `configure_domain_dns.py`. Están fijadas a este dominio, no admiten compras/borrados/NS y mantienen credenciales en un directorio privado fuera de Git. Guía: `DOMAIN_DNS_OPERATIONS.md`.
- Inventario previo: once registros. Aplicadas cuatro ediciones y dieciséis altas, cero borrados; veintisiete registros finales y siete originales conservados. Copias privadas del inventario y diario, más punto Porkbun 2647452. Lectura tras cada operación y veinte valores DNS públicos comprobados.
- Certificados activos, pero el enrutador devolvía 404 al incorporar el dominio. Se republicó la misma candidata 1, fuente e7a43948, despliegue `appgdep_6ae7123d2f2c8191b0a9b4c047f60837`, y se refrescaron los dos hostnames. Apex/www ACTIVE con SSL activo. Dieciséis recursos HTTPS coinciden con el paquete probado; demo estable con hash conservado.
- El titular comunica Migadu activo. Los CNAME coinciden con el export; los TXT de sus destinos bajo migadu.com devuelven SERVFAIL/DNSSEC en Google y Cloudflare (EDE 6, wildcard proof). Diagnóstico y solicitud de soporte preparados; no se desactiva DNSSEC ni se declara entrega real. Buzones y SMTP todavía pendientes.
- Dieciséis pruebas nuevas del mantenimiento DNS/PKCE pasan junto a las siete de correo (23 Python). Los hashes de los once archivos de las 64 pruebas iniciales siguen intactos. La comprobación de URL pública se amplía a los tres orígenes en Windows/Android, con TLS activo; pendiente del CI del commit final.
- No se han hecho compras, enviado mensajes, abierto registros ni modificado Supabase/FIXPilot. La URL definitiva sirve la candidata ficticia, no un lanzamiento comercial 1.0 abierto.

# 2026-11-01 — nueva oferta comercial aprobada

- El propietario fija diez días gratuitos Full, Básico 300 €/mes y Full 700 €/mes, más IVA del 21 %: 363 € y 847 € totales. Ambos planes visibles; se conservan identificadores internos y capacidad inicial de 50 camiones. Oferta detallada en COMMERCIAL_OFFER.md.
- Portal, registro, administración y solicitudes usan los importes nuevos y un desglose de IVA en céntimos. La migración nueva cambia solo las altas futuras; conserva pruebas históricas de treinta días y presupuestos anteriores sin inventar su tratamiento fiscal. Registro comercial y pagos siguen cerrados.
- Se conservan las 64 pruebas originales. Se añaden comprobaciones de redondeo de IVA, presupuestos idempotentes, rechazo de importes inconsistentes y conservación de contratos. Publicación pendiente de CI y validación.
- La captura 303201 confirma el ticket Migadu abierto por el titular; aún sin respuesta del proveedor en la captura. No volver a pedir que lo abra. El último diagnóstico público mantiene SERVFAIL/DNSSEC en los tres destinos DKIM; conexión de Migadu y SMTP siguen pendientes.

# 2026-11-01 — identidad verde y azul más luminosa

- El propietario solicita más verde oscuro, azul, luminosidad y los logotipos de Scania, Mercedes-Benz y MAN. Se añaden activos oficiales locales, un resumen de fabricantes y distintivos en tablas/fichas, sin cambiar datos ni permisos.
- Paleta forestal y marina, paneles más luminosos, mejores bordes/contraste y relojes/odómetros conservados. Vista previa real en escritorio y perfil Android: cero errores JavaScript, logos cargados, sin desbordamiento horizontal y cero incidencias Axe AA en portal y panel.
- Se detecta que el paquete anterior abría directamente la demo. Se conserva la candidata 1 mientras se verifica la corrección: build:candidate fija la entrada de planes y Vite impide crear candidatas sin ella. No se declara corregido un paquete inmutable solo por reenviarlo con el mismo commit. La publicación nueva utilizará una fuente distinta y comprobada.
- La oferta de diez días, 300 € / 700 € más IVA del 21 % ya está aplicada una sola vez en Supabase (40 migraciones), con desglose y ensayos reales transaccionales revertidos. Altas y cobros permanecen cerrados. La demo estable v6 y los paquetes anteriores se conservan.

# 2026-11-01 — dos temas profesionales y preferencia por usuario

- Fleet Light y Fleet Cockpit reutilizan los componentes existentes y una capa central de variables. Se añade modo del dispositivo, vistas previas y opción de reducir o desactivar movimiento. El selector puede abrirse sobre un formulario sin perder el borrador; los diálogos tienen identificadores únicos.
- Preferencias cosméticas validadas y separadas por cuenta, demo y dispositivo. Auth actualiza únicamente el campo propio `truckcontrol_appearance`, revalidando la identidad; las preferencias pendientes se sincronizan al reconectar. El perfil se refresca al enfocar la app. No se usan metadatos de usuario para conceder permisos.
- Cabecera alpina, fotografías optimizadas con procedencia, tarjetas con series económicas existentes, estadísticas operativas, objetivo personal con progreso calculado y repostajes reales. El mapa OpenStreetMap se carga voluntariamente, sin enviar datos de flota; se declara que no hay fuente GPS conectada.
- Pasan 198 unitarias/SQL, 23 Python, 56 recorridos de la demo, 10 de empresas y 8 de candidata; administración ampliada y revisión de las zonas inferiores en curso. Se conservan los once archivos de las 64 pruebas iniciales. Los fallos de contraste detectados en el tema claro y el desbordamiento móvil se corrigen antes de publicar.
- La candidata pública actual es la versión 3, fuente 736ef9e3, con CI 41302653156 aprobado y los nuevos precios. La versión de dos temas aún requiere CI de su fuente exacta y un paquete guardado nuevo. La demo estable v6 permanece reservada e intacta. Copia del trabajo en los artefactos de esta entrega.

# 2026-11-01 — candidata 4 publicada: Fleet Light y Fleet Cockpit

- Fuente exacta `304b63ffb3742eaeacd662995c7483837eb5e11f`, versión 0.5.0-rc.1, CI 41305222529 aprobado: 198 unitarias/SQL, 23 Python, 58 demo, 10 empresas, 30 SaaS y 8 candidata. El CI también valida seis perfiles de la candidata anterior; la revisión pública de ambos temas de la v4 se activa con su inventario nuevo.
- Las 19 pantallas, pestañas y formularios de administración, portal, perfiles entre Android/Windows, modo del sistema, movimiento reducido, conservación de borradores y funcionamiento offline pasan. Revisión del paquete en cuatro tamaños y dos temas: cero incidencias Axe AA y cero desbordamientos. Se corrigió el caso de 320 px antes de guardarlo como versión 4.
- Despliegue `appgdep_6ae72d93048c8191be302c43dbace95f` completado a las 12:16:35 UTC. Sesenta archivos HTTPS coinciden con el paquete entre los tres orígenes; índice de la demo estable v6 idéntico al anterior. Fuentes, ZIP, bundle, archivo publicado y capturas quedan conservados.
- El iframe de OpenStreetMap se consulta solo por decisión del usuario. Su HTML responde 200 con TLS verificado; la prueba interactiva local quedó limitada por el almacén de certificados de Chromium del entorno (ERR_CERT_AUTHORITY_INVALID). No se desactiva TLS ni se declara GPS activo. Los datos y las pruebas de la aplicación permanecen disponibles sin ese proveedor.
- No se modifican datos reales, permisos ni proyectos Supabase por el diseño. No se abre registro, SMTP, Gmail, IA remota ni cobros. La aprobación comercial 1.0 sigue dependiendo de los controles documentados.

# 2026-11-01 — preparación del correo de cada empresa

- El titular confirma creado Google Cloud «TruckControlAI», número 468881730124. Se usa ese número público, sin repetir la creación ni copiar un identificador traducido inválido. No hay conector de administración Google Cloud; Gmail API y cliente OAuth requieren completar el panel oficial.
- Se conserva la empresa activa por usuario al recargar/volver de Google, validándola contra las empresas autorizadas recién consultadas. La caché no concede permisos. Facturas explica conexión, importación y revisión, el alcance real de Gmail y la IA desactivada; los botones respetan rol de empresa.
- Retorno preparado en https://truckcontrolai.com/gmail-callback.html: elimina código/estado de la URL, no usa credenciales del navegador y solo admite un ticket o error del backend para orígenes propios. El intercambio exige estado de un uso y la finalización conserva usuario/empresa/rol originales. Se mantiene GET anterior compatible. El service worker no sustituye este retorno por la SPA.
- La nueva configuración backend admite Vault restringido a tres secretos propios, valida el cliente del proyecto 468881730124 y mantiene parejas/key anteriores completas. Migraciones CLI 20261101125037 y 20261101125406 todavía no aplicadas. La desconexión revoca el permiso Google antes de borrar el token; ante fallo no simula éxito.
- Revisión automática rechazó antes de ejecutar una prueba remota que incluía DDL, secretos y desactivación temporal del control de acceso. Ningún cambio remoto de esa solicitud ocurrió. Se documenta el rechazo, se elimina ese enfoque y se solicita revisión/aprobación de las migraciones concretas, que mantienen controles, RLS y servicios cerrados.
- Validación local: full check con 226 unitarias/SQL y build aprobado, más tres pruebas posteriores de provisión/retención de claves aprobadas; 23 Python y 22 recorridos de empresas Android/Windows aprobados. Los callbacks pasan contraste Axe AA en ambos temas, rechazo de destinos ajenos, limpieza de historial y errores de proveedor. Las 64 pruebas originales y sus once hashes se conservan. El CI completo y la publicación de candidata nueva están pendientes.
- No se ha comprobado un OAuth real, entrega SMTP, Google verificado ni dispositivos físicos. No se abren altas, IA, cobros o facturas automáticas; no se contratan servicios ni se modifica FIXPilot. Guía persistente: MAIL_SETUP.md.

# 2026-11-01 — candidata 5 publicada, correo preparado y backend pendiente

- CI de fuente `ee3cb94e4e0089729d746522cecb1e03b4ad67b3`, run 41311260471, aprobado: 229 unitarias/SQL, 23 Python, 58 demo, 22 empresas, 30 SaaS, 10 candidata y seis recorridos de la publicación anterior. Conserva las 64 iniciales. Compilación local del backend con Deno 2.9.6 aprobada sin desplegarlo.
- Versión guardada 5 publicada por el despliegue `appgdep_6ae73fb2463881918edb2afe28c768de` a las 13:33:51 UTC. Las tres direcciones sirven los 23 archivos del paquete: 69 coincidencias SHA-256 con TLS verificado. Un archivo de service worker inicialmente antiguo en un origen se actualizó durante la propagación; la comprobación final pasa sin nueva publicación ni desactivar TLS.
- Demo estable v6 con el mismo hash del índice y candidata v4 conservada para recuperación. Callback propio, guía de Facturas, temas y revisión manual preparados en la candidata. La verificación pública del inventario nuevo incluye retorno inválido, limpieza de URL y ausencia de códigos en la caché con la PWA activa, en Android/Windows y los tres orígenes.
- Supabase inspeccionado otra vez por consultas de solo lectura: 40 migraciones, cero usuarios, clientes o tokens, enforce_access=true, altas y pagos cerrados y asesores de seguridad vacíos. No se han aplicado migraciones ni desplegado Gmail v2. Aprobación específica del backend y confirmación Gmail API aún pendientes de respuesta del titular.

# 2026-11-01 — retorno canónico detectado y recuperación ejecutada

- El titular confirma Gmail API habilitada y consentimiento Externo/Pruebas preparado. No repetir esos pasos ni crear otro proyecto. Cliente OAuth y aprobación separada del backend todavía pendientes.
- El CI público 41312325569 falla al localizar el callback con PWA activa. Diagnóstico HTTPS: el alojamiento redirige gmail-callback.html a gmail-callback conservando parámetros; la página existe y sus hashes son correctos, pero el fallback de Workbox solo excluía .html. La prueba local anterior no reproducía esa normalización.
- Se restaura la candidata guardada 4 mediante appgdep_6ae7431bd3308191a62308c84320b52f a las 13:48:22 UTC, manteniendo todos los paquetes y Git. No se altera la demo estable v6 ni Supabase. No se declara correcta la candidata 5 por sus hashes si el recorrido funcional falla.
- Corrección rc.2: excluir ambas rutas, usar URI Google canónica sin extensión y añadir una prueba de la redirección 308 con el service worker activo. Nueva publicación pendiente de controles del código y del recorrido público.

# 2026-11-01 — candidata 6 corregida publicada

- El titular confirma también el cliente web Google creado. Proyecto 468881730124, Gmail API y consentimiento Externo/Pruebas completados; no repetirlos. Valores seguros y aprobación separada de las dos migraciones/backend todavía pendientes.
- CI de la fuente exacta c80add77165d6953cd4a9cc43066c435874e7f4f aprobado, run 41313197695: 229 unitarias/SQL, 23 Python, 58 demo, 22 empresas, 30 SaaS y 12 candidata, más seis recorridos de la v4 restaurada (380 comprobaciones). La prueba nueva reproduce el 308 de .html a la ruta canónica con PWA instalada.
- Candidata guardada 6, versión 0.5.1-rc.2, desplegada por appgdep_6ae744aeaf4c81918fcd5a1b0b52c9cb a las 13:55:11 UTC. 69/69 archivos HTTPS coinciden con TLS verificado y la demo estable v6 conserva su hash. La revisión pública de este inventario vuelve a exigir el callback canónico con PWA activa, sin saltarse la comprobación que detectó el fallo anterior.
- No hay OAuth real comprobado, secretos de Google recibidos en chat, cambios Supabase de esta fase, cobros o consumo IA activados. La recuperación y el fallo v5 se conservan en el historial e informes; no se declara v5 funcional por coincidir sus archivos.

# 2026-11-01 — backend Gmail v2 y Vault aplicados

- El propietario indica «Sigue» tras solicitar la autorización concreta de las dos migraciones y el backend revisado. Se comprueba de nuevo inventario, tablas y seguridad; se aplican únicamente esas migraciones por apply_migration. Versiones remotas 20261101140631 y 20261101140639, ahora 42 en total. No se repite el borrador rechazado ni se desactiva control alguno.
- AES de 32 bytes generado dentro de Vault, sin mostrarlo. Configuración accesible solo por service_role, función pública invoker y helper definer privado; anon/authenticated no pueden ejecutarlas. RLS activo en estados, pendientes, conexiones y tokens. Dos campos Google preparados con pending para entrada directa del titular.
- company-gmail ACTIVE v2, hash 66667a913adbf7661a81bcbc0cc3573d9812682993838ddaa7f1163b1395d6e8. Cuatro archivos desplegados coinciden exactamente con el código revisado. Preflight apex/www 204 con origen correcto, origen ajeno 403, acción anónima 401, callback inválido 400, GET sin estado 303 al dominio propio; todos con no-store.
- SQL real con dos empresas ficticias: anon/authenticated sin configuración, RPC interno solo servidor, estado ligado a usuario/empresa/origen, repetición y origen ajeno rechazados, propietario de otra empresa y consulta denegados, suspensión invalida el estado. Rollback confirmado: cero usuarios/empresas sintéticos, enforce_access=true y altas/cobros cerrados. Asesor de seguridad sin incidencias.
- No se reciben claves Google por chat ni se realizan llamadas Gmail/OpenAI reales. Falta que el titular complete únicamente los dos valores Google en Vault y la prueba OAuth real con cuentas verificadas. La candidata 6 y demo estable permanecen sin cambios; las 64 pruebas originales se conservan. IA, pagos y alta pública siguen cerrados.

# 2026-11-01 — inspección de Google y acceso privado a Vault

- TinyFish disponible. El titular autoriza hasta 1 USD del saldo existente para el navegador, sin recargas ni suscripciones, y confirma guardados los accesos privados de Google y Supabase.
- La inspección directa accede a TruckControlAI `468881730124`, pero encuentra «No OAuth clients to display». Sustituye la confirmación previa de cliente web creado. No se crea un duplicado: el siguiente paso será verificar de nuevo y crear un solo cliente web cuando Vault sea accesible.
- La segunda tarea se detiene en la pantalla de acceso de Supabase con hCaptcha. No se eluden controles, crean clientes ni actualizan secretos. Se ofrece reabrir el acceso privado para el titular, sin solicitar contraseñas o claves por chat.
- Comprobación SQL posterior: los dos valores Google siguen iguales y el ID es inválido; AES conserva su fecha, anon/authenticated no pueden leer configuración, service_role sí. Cuarenta y dos migraciones, cero usuarios Auth y cero conexiones Gmail; asesores de seguridad vacíos. [Informe](verification/google-oauth-provider-inspection-20261101.json).
- Dos tareas finalizadas, catorce pasos en total; no se acredita un OAuth real ni se cambia la publicación. IA, pagos y alta pública permanecen cerrados.

# 2026-11-01 — perfil exclusivo y asistente Google

- El titular confirma haber visto el proyecto y la lista de secretos antes de guardar. El perfil anterior sigue sin restaurar Supabase; se prueba un único perfil exclusivo, que también vuelve al acceso con hCaptcha. Se detienen los reintentos sin eludir el control ni pedir credenciales por chat.
- La tarea Google independiente informa de identidad de aplicación «TruckControl AI Gmail», público externo y usuario de prueba preparados, pero termina por límite antes de crear el cliente web. El indicador final de modo Pruebas no confirma su descripción narrativa; verificarlo al retomar. No se promueve a producción ni se declara el cliente creado.
- Cincuenta pasos acumulados, 445 segundos de tareas y 0,80 USD en pasos. Automatización pausada; solicitud de ampliar de 1 a 2 USD acumulados todavía pendiente. Sin recargas, suscripciones, IA ni cobros.
- SQL posterior confirma ID Google inválido y ambos campos iguales, AES intacto, configuración inaccesible a anon/authenticated, 42 migraciones, cero usuarios Auth y cero conexiones Gmail. La candidata, demo y FIXPilot no cambian. [Punto de continuación](verification/gmail-provider-setup-checkpoint-20261101.json).

# 2026-11-01 — correo de proveedores generales, 0.5.2-rc.1

- El titular pide seguir con tareas independientes y admitir correo general. Se añaden importación EML/PDF/imágenes y un receptor de reenvíos firmado, con dirección por empresa; Outlook, Gmail o un dominio propio pueden aportar documentos sin OAuth. No se presentan IMAP, Microsoft OAuth o recepción real como activados.
- La bandeja conserva Gmail, el permiso histórico y los cálculos financieros. Los importes de las importaciones nuevas quedan vacíos y pendientes de revisión. No se activa IA ni se contabiliza un correo por recibirlo. El ejemplo ficticio permite probar la importación en la candidata sin datos empresariales.
- Migración CLI local `20261101172906_company_mail_ingestion.sql`: procedencia, buzones, recibos, RLS, RPC exclusivo del servidor, permisos por rol/empresa, cuota, reserva y repetición. No se ha aplicado todavía en este punto; el remoto mantiene 42 migraciones. Función nueva `company-mail` pendiente de despliegue revisado, sin sustituir Gmail v2.
- Pasan 256 pruebas unitarias/SQL, incluidas 27 nuevas; las 64 originales conservan los hashes de once archivos. Pasan 23 pruebas Python, compilación Deno y auditoría de dependencias de producción con cero vulnerabilidades. Pasan además 64 recorridos demo, 22 de empresas, 30 SaaS y 14 de candidata en Android/Windows; los dos nuevos comprueban importación ficticia sin red y sin contactar proveedores. La publicación nueva sigue pendiente. Se corrige un desbordamiento de los botones de previsualización en Android antes de publicar.
- Se prepara la [prueba SQL remota con rollback](verification/company-mail-rollback.sql) sin desactivar licencias, RLS, registro o pagos y sin llamadas a correo/IA. [Contrato y guía](GENERAL_EMAIL.md). No se consumen más pasos de TinyFish ni se contratan servicios.

- Backend aplicado: migración remota 20261101175756, 43 en total, y company-mail ACTIVE v1. Cinco archivos idénticos, siete rechazos/preflights HTTP correctos, RLS activo y cero avisos de seguridad. No se sustituyen las otras cuatro funciones ni la clave AES.
- El módulo remoto gmail ya estaba apagado. La prueba positiva se detiene por ese permiso y revierte; la prueba específica del módulo cerrado pasa y confirma cero usuarios/empresas sintéticos. El recorrido positivo completo sigue verificado localmente, pendiente de aceptación remota al habilitar el módulo por el procedimiento normal.
- El CI de la fuente de despliegue 2c104916 detecta contraste transitorio al cambiar de tema (4,06:1 en un botón). Se conserva la candidata publicada 6; la versión guardada 7 no se despliega. Se eliminan las interpolaciones de colores en controles/tarjetas y se conservan las animaciones de gráficos y movimiento reducido. Se ejecuta nuevamente la accesibilidad antes de preparar otra versión.

- Corrección de contraste aprobada en seis recorridos locales y CI exacto 41334469182 (415 comprobaciones, seis sobre la publicación previa). Candidata 8 publicada a las 18:06:28 UTC desde ba7a226f; 72/72 recursos HTTPS coinciden y la demo estable conserva su hash. La versión 7 se conserva guardada sin publicarse. El CI antiguo de la rama encontró el inventario v6 después de publicar v8; se actualiza el inventario y se exige la prueba pública específica de importación sin red. Resultado final en los checks del PR #13 y sus artefactos.

# 2026-11-01 — activación de IA y receptor, preparación 0.5.3-rc.1

- El titular autoriza activar IA, receptor y contratar si hace falta. Informa de una clave «my test key» y de haberla guardado. La verificación del proyecto TruckControl sigue viendo solo los tres secretos anteriores; no se encuentra la nueva. Se pregunta proyecto/sección y se prepara lectura de Vault o secretos de funciones, sin pedir el valor por chat ni crear claves duplicadas.
- Se implementan presupuesto global con reservas previas, cuotas por empresa, liquidación conservadora y cierre ante respuestas perdidas; modelo gpt-6-luna estándar, sin herramientas ni almacenamiento. La configuración empieza deshabilitada y con presupuesto cero: no hay consumo de API hasta aprobar un importe concreto y verificar la credencial.
- El asistente documental, Gmail y las nuevas importaciones comparten el límite. La lectura propone campos sin crear gastos; conserva originales si falla el modelo y no sobrescribe una factura aprobada. Un endpoint de salud limitado a dos booleanos permite comprobar configuración sin mostrar claves.
- Resend Free ofrece recepción incluida, 3.000 correos/mes y 100/día compartidos. Se implementa su webhook oficial Svix, destinatario emitido, original acotado y entrega a la entrada anterior. No se contrata ni configura todavía la cuenta, no se cambian MX/DNS y no se inicia otra tarea de navegador de pago.
- Migración CLI local 20261101191806 pendiente de aplicación única; remoto comprobado con 43 migraciones y cero avisos de seguridad. Pasan 291 unitarias/SQL (35 nuevas), TypeScript, PWA, Deno de cuatro entradas y auditoría de producción con cero vulnerabilidades. Las 64 originales conservan sus once hashes. La candidata pública 8 y demo estable permanecen intactas. Guía: AI_RECEIVER_ACTIVATION.md.

# 2026-11-01 — clave detectada y backend IA/receptor desplegado

- Tras la confirmación del titular se comprueba la salud real: configured=true, enabled=false. La clave quedó en los secretos de funciones, aunque Vault todavía tenga un placeholder. No se repite el guardado ni se recupera/muestra el valor. Una presencia válida no acredita saldo ni respuesta facturable.
- Migración aplicada una sola vez como 20261101194201, inventario de 44 y correspondencia SHA guardados. Funciones company-assistant v9, company-gmail v10, company-mail v9 y company-mail-resend v1 ACTIVE; los 26 archivos de paquetes coinciden con ceff63d64e59da5aae3ffebb7663eade410a8f76. Se guardó el código anterior antes de sustituirlo; no se modifica FIXPilot ni se rota AES.
- CI 41343043038 aprobado: 291 unitarias/SQL, 23 Python, 64 demo, 22 empresas, 30 SaaS, 14 candidata y seis recorridos públicos; 450 comprobaciones. Se descargan sus capturas e informe persistente, ZIP SHA d50130ba1e96b33ec268157b198f4a1c63faebc58930163caeb694e9acd3b883. Se conservan las 64 iniciales mediante once hashes.
- Pasan 22 comprobaciones HTTP reales con TLS y permisos PostgreSQL con rollback, controles activos y ninguna llamada al modelo/proveedor. Configuración/registros privados para anon/authenticated, política de proveedor no editable por el runtime, reserva denegada con IA cerrada y destinatario no emitido rechazado. Cero usuarios, empresas, llamadas y reservas IA; asesor de seguridad sin incidencias.
- La candidata web 8 y demo estable se mantienen. Pendiente aceptar presupuesto concreto de 10 USD/mes de IA, máximo acumulado de automatización 2 USD sin recargas y conexión privada Resend Free. No se activa recepción real, IA, pagos ni registro público. Quedan por probar entrega, modelo con crédito y cuentas legítimas autorizadas; el CI no sustituye esa aceptación comercial.

# 2026-11-01 — presupuesto aprobado y dos respuestas IA reales

- El titular responde «correcto» a la solicitud: IA hasta 10 USD/mes antes de impuestos, Resend Free 0 USD y automatización hasta 2 USD acumulados incluyendo lo anterior, sin recargas. Se habilita el presupuesto global de 1.000 céntimos USD y los módulos de correo/lectura mediante la administración normal; se conservan permisos individuales, consentimiento, RLS y registro/pagos cerrados. Salud HTTPS configured=true, enabled=true.
- Pasa ahora la prueba PostgreSQL positiva completa de correo entre dos empresas ficticias con rollback y sin cambiar controles durante la prueba. El CI del commit documentado 45772ff también pasa: run 41343843595, mismo código verificado y 450 comprobaciones.
- Diecinueve comprobaciones autenticadas reales con dos fixtures: contraseña, acceso por empresa, módulos, secreto inaccesible, PDF privado, duplicado sin nueva lectura y denegaciones de otra empresa/público. OpenAI extrae 20.000 céntimos netos, 4.200 de IVA y 24.200 totales. El asistente contesta con cita del mismo documento. No se registra ningún gasto.
- Dos llamadas IA liquidadas; uso confirmado y reserva desconocida cero. Estimación superior interna total 628 micro USD, que no es factura ni saldo de OpenAI. Tras aceptar la prueba se suspenden/bloquean ambos fixtures, se cierran sesiones y se eliminan credenciales temporales. Los registros sintéticos, original privado y ledger se conservan para auditoría; no hay clientes reales. Se verifica el rechazo tras suspender.
- Se facilita el acceso privado Resend en el perfil existente. Falta iniciar sesión y Save profile antes de automatizarlo; no se contrata un plan ni se ejecuta otra tarea de navegador de pago. Recepción real, SMTP/confirmación/recuperación y lanzamiento comercial siguen pendientes; la candidata web 8 y demo estable no se sustituyen.

# 2026-11-01 — Resend conectado y recepción real con IA comprobada

- Clave Vault aceptada por API, sin exponer valores. Reutilización del dominio/webhook, cinco DNS verificados y 27 anteriores conservados; cero ediciones/borrados y sin tocar Migadu/web/DNSSEC. No se activa ningún plan de pago.
- Dos migraciones aditivas aplicadas una sola vez: 20261101204442 y 20261101205705, total 46. Mail v10 y receptor v3 ACTIVE con fuentes comparadas. Se corrigen clave Svix de 24 bytes y CDN exacto cdn.resend.app; el reintento del primer 502 completa sin duplicar.
- Tres correos ficticios, dos empresas, tres recibos completos, dos facturas privadas. A: 200 € + 42 € = 242 €, una llamada IA, duplicado sin nuevo documento. B sin consentimiento: original pendiente y cero llamadas. Ningún gasto registrado. 15 aserciones RLS/Storage/RPC pasan y la suspensión deniega el acceso.
- Nuevos dos fixtures suspendidos/bloqueados, buzones deshabilitados y sin sesiones; se conservan auditoría y originales. Los dos anteriores siguen bloqueados y conservan filas antiguas de sesión; un intento de borrarlas no se aplicó al expirar confirmación y no se repite. Cuatro fixtures, cero clientes reales.
- Tres llamadas IA totales liquidadas, 925 micro USD de estimación superior interna, cero reservas desconocidas; límite aprobado 10 USD/mes sin recargas. No equivale a saldo/factura del proveedor.
- Un WARN de contraseñas filtradas existía antes del DDL y sigue pendiente. Ayudantes privados sin permisos clientes/service_role; esquema HTTP administrado no expuesto en Data API, sin afirmar revocaciones que postgres no pudo realizar.
- Rama feat/resend-api-bootstrap, PR #15; conservar demo estable, candidata 8 y 64 pruebas. Informe docs/verification/resend-live-acceptance-20261101.json. Registro y pagos permanecen cerrados; no se declara lanzamiento comercial.

- CI exacto b1d47e07, ejecución 41352158854: 479 comprobaciones aprobadas y logs revisados (311 unitarias/SQL, 32 Python, 64 demo, 22 empresas, 30 SaaS, 14 candidata, seis públicas). TypeScript/build PWA correctos.

# 2026-11-01 — publicación conectada y verificación administradora pendiente

- PR #16 integrado como b39c1b778deb77034849365f32cb67cfef3f3df8 tras CI 41356880182: 548 comprobaciones (364 unitarias/SQL, 32 Python, 64 demo, 22 empresas, 30 SaaS, 14 candidata, 16 producción y seis públicas). Las 64 originales conservan once hashes.
- Versión 9 publicada desde bcffa56f0b3a3f851af4e9f433223b49bad7ed9c; despliegue appgdep_6ae7bdb248cc8191acb4a7c3ac33a03e. Canal production con clave moderna publicable, sin secretos en el paquete. Los 72 archivos HTTPS coinciden en tres orígenes; demo v6 idéntica y candidata v8 recuperable.
- Proveedor confirma entregada la invitación a pedidos@smartscaneuskadi.com. No se lee ni se comparte su enlace; debe verificarlo el titular y elegir su contraseña. legal_ready=true, registro y cobros todavía cerrados. No confundir publicado con registro ya abierto.
- Supabase 48 migraciones; company-auth v3. Confirmación y recuperación nativas con Resend comprobadas, fixture bloqueado/sin sesiones y prueba de consentimiento/RLS remota con rollback completo. IA restablecida con 10 USD/mes; el propietario confirmó que la clave de una descripción ya estaba revocada. No se piden nuevas claves ni se activan costes.

# 2026-11-01 — propietario verificado y registro abierto

- El propietario confirma acceso. La consulta remota devuelve un usuario reservado, correo confirmado, contraseña establecida y un rol global. Sin leer tokens, contraseña ni enlace personal.
- Se abre únicamente registration_open mediante transacción condicionada al propietario verificado, enforcement, correo/legal preparados y pruebas internas/pagos apagados. El catálogo anónimo HTTPS confirma 200, registro abierto, diez días y precios con IVA correctos; max_trucks=50.
- Producción v9 permanece sin cambios; la demo estable y candidata 8 se conservan. Inventario actualizado para probar el canal production y las altas abiertas en los tres orígenes.
- El primer navegador local rechaza la CA del proxy de este entorno; no se deshabilita TLS. Las solicitudes HTTPS de recursos/catálogo validan certificados. La prueba browser pública se ejecutará en GitHub, con TLS activo y evidencia separada del CI previo.
- Guías de entrega, instalación, administración y continuidad actualizadas. Versiones anteriores archivadas y conservadas también en Git.

# 2026-11-01 — copias cifradas de empresa y ensayo de recuperación

- Nueva rama feat/company-backup-recovery, 0.5.4-rc.1. Conserva la demo, producción v9 y todas las pruebas originales. Sin compras, nuevos proveedores ni cambios económicos.
- Cifra fichas, operaciones, facturas y originales autorizados con AES-GCM/PBKDF2; verifica pertenencia, relaciones, importes, huellas y estabilidad del origen. Rechaza pérdida de permisos, cambios concurrentes, datos incompletos y otra empresa. Límite explícito 20 MiB/2000 documentos, sin copia parcial silenciosa.
- Nueva paginación SQL invoker con RLS existente, sin acceso anónimo ni grants de tablas. Migración local 20261101230718 aplicada una vez como 20261101231713, 49 remotas. Índice de cursor verificado. La prueba remota con 201 documentos y dos empresas pasa y se revierte: cero filas de fixture restantes; registro/enforcement/cobros preservados.
- Ensayo aislado PGlite y PDF: 50 camiones, 46 conductores, 2102 movimientos, siete operaciones y una factura; importes/vínculos/huellas y RLS correctos. No es restauración del servicio alojado. Guía COMPANY_RECOVERY.md.
- Pasan 393 unitarias/SQL iniciales más tres de adaptador y una de archivo grande; 34 recorridos SaaS iniciales y dos corregidos tras ajustar el fixture a la ruta Storage real. El primer servidor local fallaba por EPERM del sandbox; se habilitó la capacidad de red del comando y funcionó, sin desactivar TLS. CI completo y publicación siguientes.
- Google: sesión válida del proyecto exclusivo, cero clientes OAuth web. Solo lectura, 4 pasos/34 segundos; acumulado65/544s, estimación1.05814 USD de máximo2 aprobado. Sin abrir secretos ni nuevas credenciales. Migadu sigue con tres destinos DKIM SERVFAIL; no cambiar DNSSEC ni repetir pagos.

# 2026-11-01 — producción 10 publicada

- CI 41361898380 del commit d3d2ff6: 587 comprobaciones aprobadas. CI 41362141114 de la fuente exacta e5ce8e6 también termina correctamente. Solo difiere el manifiesto de alojamiento.
- Guardada y publicada versión 10, paquete 0.5.4-rc.1, despliegue appgdep_6ae7cc64f8b88191b6856c51b08f0da0. Los 72 hashes HTTPS coinciden y la demo estable conserva su hash. v9 y candidata8 recuperables; backend49 aditivo sin cambiar datos ni servicios de pago.
- Se actualiza inventario para ejecutar la aceptación pública de v10. La verificación privada del nuevo flujo ya cubre Android/Windows emulados y ambos temas con 36 recorridos SaaS; no hay dispositivos físicos.
- Google: ya se creó un único cliente web en el proyecto468881730124 con origen/retorno canónicos. La respuesta mantiene el secreto enmascarado; no se han modificado los campos existentes de Vault. Transferencia segura pendiente de comprobar en su pantalla oficial. No publicar ni registrar valores secretos en evidencias.

# 2026-11-02 — administración de servicios y compatibilidad Vault

- PR #19 integrado en main (633e4087), v10 publicada y demo estable conservada. El CI final 41363640394 pasa 587 controles e incluye seis recorridos públicos reales de v10. Artefacto descargado y SHA-256 comprobado para conservar evidencia después de su caducidad en Actions.
- Se continúa en feat/provider-admin-setup, 0.5.5-rc.1. Nueva pestaña Servicios reservada a administración global verificada; estado de proveedores y entrada de credenciales Google mediante JSON oficial o formulario, sin valores en respuestas, Web Storage ni auditoría.
- Migraciones 50/51 aplicadas una vez y conservadas. La prueba remota detectó que FOR UPDATE sobre Vault requiere permisos que el rol de proyecto no posee. Se corrigió mediante una migración adicional que utiliza create_secret/update_secret oficiales, sin conceder UPDATE sobre las tablas gestionadas. Se añadió una prueba con rol restringido para reproducir esa condición.
- 418 unitarias/SQL pasan. El ensayo remoto con dos identidades ficticias y escritura real en Vault termina revertido, con cero usuarios/auditorías de prueba; las claves Google/AES y las condiciones de acceso siguen intactas. Asesor sin avisos nuevos, permanece el previo de contraseñas filtradas.
- Google: proyecto truckcontrolai, un único cliente TruckControl AI Gmail creado con origen y retorno canónicos. El procedimiento oficial terminó sin poder recuperar el secreto permanentemente enmascarado; no cambió ajustes ni credenciales. Automatización acumulada estimada 1,5586 USD (95 pasos/1158 segundos), inferior al máximo aprobado de 2 USD; sin recargas. No repetir ni duplicar el cliente.
- Publicación de la mejora pendiente de CI y verificación pública. No confundir formato de credenciales con consentimiento Gmail real. Reenvío general e IA existente continúan disponibles con sus permisos y límites.

# 2026-11-02 — Servicios publicados, versión 12

- CI de PR 41365321617 y fuente exacta 41365370169 pasan 614 comprobaciones. El primer intento encontró el límite predeterminado de cinco segundos en el round-trip criptográfico de 3 MB; se dio un plazo explícito de veinte segundos, sin reducir iteraciones ni aserciones.
- Publicada 0.5.5-rc.1, fuente 63258ac0a705300d2f589f84b8bad274aaa6f83c, versión alojada 12, despliegue appgdep_6ae7d5f1fc8081918189edc9b488a869. La 11 se guardó antes de completar CI y no se desplegó; 10/9 y demo v6 conservadas.
- Verificados 72 hashes por HTTPS en tres orígenes, índice de la demo sin cambios y rechazo anónimo 401/42501 de tc_provider_control. Cloudflare rechazaba Python urllib con código 1010, también en la demo anterior; curl ordinario funcionó con el mismo proxy y TLS, sin cambiar permisos ni seguridad del alojamiento.
- Actualizadas las guías de correo/administración, preservando el documento anterior en historial. Google sigue sin secreto completo y sin prueba OAuth de buzón; el receptor general y la IA conservan su funcionamiento y límites. Migadu continúa con SERVFAIL/DNSSEC en los tres destinos DKIM a las 00:05 UTC.
- La aceptación pública de v12 se ejecuta mediante los checks finales de PR #20. Mantener registro abierto, cobros y SMS apagados; no ampliar presupuestos.

# 2026-11-02 — altas automáticas con Básico

- Nuevas solicitudes con datos/correo y consentimiento v2026-11-02; al confirmar y elegir contraseña se crea empresa y prueba Básico de diez días. Full solicitado es interés comercial, no licencia. Titulares y miembros siguen el plan calculado por PostgreSQL.
- Migración local 20261102062634 / remota 20261102064908 aplicada una vez, 52 en total. Columna trial_plan_id conserva Full anterior y establece limited para nuevas filas. Huellas anteriores/posteriores confirman clientes, planes y ajustes intactos. Ensayo remoto: dos empresas, 50 camiones admitidos y el 51 rechazado, aislamiento y cero residuos tras rollback.
- Corregidos enlaces de correo recibidos en una PWA abierta y el reinicio del formulario de contraseña al cargar su empresa. Prueba completa con solicitud Full → correo → contraseña → Básico → solicitud Full sin elevación en Android/Windows emulados.
- CI 41401436616 y fuente exacta 41401528305 pasan 628 controles; los seis públicos aún eran v12. Publicada 0.5.6-rc.1, alojada 13, fuente 26ec8048293249d5ccde0b57eb58c1a1c2404a0f, despliegue appgdep_6ae832885420819189a54e68f521c723. V12 y demo v6 conservadas. TLS y 72 hashes coinciden; catálogo público limited/10 días y cobros apagados. Verificación pública final en checks de PR #21.
- No se han enviado correos de prueba reales en esta fase ni cambiado el transporte nativo existente, presupuestos IA, SMS o cobros. Asesor sin incidencias nuevas; permanece el aviso previo de contraseñas filtradas. Continuidad en /workspace/artifacts/truckcontrol-basic-access-20261102/checkpoint.json.

# 2026-11-02 — reparación del alta desde el hostname de producción de la PWA

- Incidencia reproducida: el hostname técnico devolvía 403 en el preflight de company-auth; principal y www funcionaban. No se copiaron datos personales del cliente al repositorio.
- Copia persistente del historial y del servidor anterior en `/workspace/artifacts/truckcontrol-signup-fix-20261102`. Nueva rama `fix/client-registration-origin`; 52 migraciones intactas.
- Desplegado company-auth v4 con los tres orígenes exactos de producción. Ocho comprobaciones HTTP reales confirman preflight, validación y rechazo de origen ajeno. No se generan usuarios ni correos en esos controles.
- Interfaz 0.5.7-rc.1 preparada con mensajes seguros, reintento conservando datos y tamaño corregido de la casilla de consentimiento. Las pruebas públicas de CI comprueban ahora el CORS real desde el navegador; antes el registro estaba cubierto por fixtures.
- Pasan 647 controles en GitHub tanto en código como en fuente exacta: 447 unitarias/SQL, 32 Python y 168 de navegador. Se conservan las 64 originales. Publicada v14 / 0.5.7-rc.1 a las 07:34 UTC, fuente 76c4306024d9a1cdea7074b0d219b1475bdd5471, con 72 hashes HTTPS y demo estable intacta. Los seis controles públicos anteriores cubrieron v13 con backend v4; el PR #22 registra la comprobación pública posterior de v14. Ver `SIGNUP_CORS_FIX.md` y el checkpoint persistente.

# 2026-11-02 — documentación, vencimientos y nuevos informes

- 0.5.8-rc.1, rama feat/document-expiry-reports, PR #23. Documentos clasificados, fechas, antelación, archivo conservando originales, búsquedas, filtros y CSV. Avisos integrados con campana/Alertas, sin activar mensajes externos.
- Metadatos privados separados, RLS por empresa, rol, licencia y versión. RPC anteriores intactas. Migración local 20261102080257 → remota 20261102082309 aplicada una vez; 53 totales. La aceptación nativa crea dos empresas ficticias y revierte todo; originales, clientes, planes y ajustes conservan sus huellas. Cero fixtures o metadatos nuevos restantes.
- Informes por camión con contabilidad registrada, viajes sin contabilizar, litros repostados y consumo solo cuando hay medición. Desglose por categoría y estado documental. Copias de registros v2 conservan metadatos, mantienen lectura de v1 y validan facturas aprobadas contra su base sin IVA, igual que el servidor.
- Pasan 476 unitarias/SQL, 32 Python y 46 recorridos SaaS, incluidos documentos e informes en Android/Windows emulados. Las 64 iniciales conservan sus once hashes. CI completo y publicación en curso; producción v14 y demo v6 intactas. No nuevos costes, envíos, solicitudes IA, claves ni cobros.
- Guía y evidencia: DOCUMENT_REGISTER.md, verification/document-tracking-20261102.json y checkpoint /workspace/artifacts/truckcontrol-documents-20261102/checkpoint.json. Gmail directo sigue sin credenciales de formato válido; no se modifica ni se simula conexión.

# 2026-11-02 — publicación de documentos e informes y preparación Gmail

- Publicada 0.5.8-rc.1, v15, fuente 9d079a01043efa183aaed379fe5448018069f7dd, a las 08:40 UTC. Código 41413577289 y fuente exacta 41413758873 pasan 680 comprobaciones; HTTPS confirma 72 hashes y demo v6 intacta. Cuatro revisiones del paquete exacto en ambos temas y perfiles Android/Windows: cero infracciones Axe y cero peticiones privadas desde demo.
- Corregido además el retorno Gmail del hostname de producción: migración 54 local 20261102085143 / remota 20261102085701, conserva todos los destinos anteriores. company-gmail v11 desplegado y readback idéntico; salud booleana sin secretos y 14 controles HTTP pasan. El ensayo de estados por empresa/usuario y de un uso termina en rollback con cero residuos.
- El runtime confirma configured=false y cero buzones Gmail. Credenciales y AES existentes se conservan. La solicitud pendiente del titular pide completar el guardado directamente en Servicios, sin valores en chat. No bloquea correo general, documentos ni informes.
- Pasan 487 unitarias/SQL, TypeScript/PWA y 32 Python, con las 64 originales conservadas. Los checks finales de PR #23 verifican v15 después de publicar y el backend actualizado. No pagos, nuevos costes, emails de prueba ni llamadas IA. Los tres destinos DKIM de Migadu siguen SERVFAIL en Google/Cloudflare a las 09:05 UTC; DNS sin cambios.

### 02/11/2026 — bandeja completa y acceso de correo desde PWA

- Copia Git previa persistente, rama feat/invoice-inbox-workflow, 0.5.9-rc.1. 514 unitarias/SQL y 48 SaaS pasan; 64 originales conservadas. La primera ejecución local de navegador no arrancó por ruta de Chromium ausente; se seleccionó el navegador existente y la batería completa pasó.
- Migración 55 local 20261102131804 / remota 20261102132728 aplicada una vez. 205 facturas ficticias y aislamiento probados en Supabase con rollback completo; huellas comerciales y contrato anterior sin cambios.
- company-mail v11 y company-assistant v10 activos con tres orígenes productivos exactos; 21 controles HTTP, sin llamadas a proveedores ni cambios de cuotas. Ruta de import_map relativa explícita corrige el intento inicial de despliegue que heredaba una ruta temporal anterior.
- Nueva búsqueda, filtros, paginación y CSV; importes desconocidos y monedas separados, consulta sin aprobación, cancelación de carga y ocultación del listado tras revocación. Pendiente finalizar CI, publicar preservando v15/demo y guardar evidencia pública.

### 02/11/2026 — publicación de la bandeja, v16

- Código 7998cb7 (CI 41455396125) y fuente exacta a4a4fc4 (CI 41455442975) pasan 720 controles: 514 unitarias/SQL, 32 Python, 64 demo, 22 empresas, 48 SaaS, 14 candidata, 20 producción y seis públicos de v15 antes del despliegue.
- Paquete exacto revisado en cuatro perfiles/temas, CSV y Axe AA; se corrigió el espaciado antes de guardar. Publicada v16 a las 13:53 UTC, despliegue appgdep_6ae895d56a3481919c1a384c1e133d17; 72 hashes HTTPS correctos, demo v6 intacta y v15 recuperable.
- Aceptación pública posterior de v16 y merge: checks de PR #24. Gmail directo continúa pendiente de Google y Migadu sigue SERVFAIL a las 13:44 UTC; no se cambian credenciales, cuotas ni gastos.

# 2026-11-02 — lectura IA de originales guardados

Continuación desde main 6aa0403, rama feat/invoice-ai-on-demand. Copia anterior persistente en `/workspace/artifacts/truckcontrol-invoice-ai-20261102/before-invoice-ai.bundle`. Nueva lectura a petición para PDF/imágenes recibidos por reenvío o importación; independiente de OAuth Gmail. Reutiliza proveedor, cuotas y presupuesto aprobados. Confirmación explícita, hash/tipo/tamaño verificados, nueva comprobación de acceso, única reserva por factura y revisión humana antes de registrar el gasto.

Migración 56 remota 20261102145944 aplicada una vez, local 20261102143339 conservada por SHA. Funciones invoker exclusivas del servicio; ninguna tabla/política comercial modificada. company-mail v12 ACTIVE y once fuentes verificadas; v11 respaldada. Ensayo nativo con dos empresas ficticias, rol consulta, consentimiento y reserva interna finaliza con rollback completo. Contabilidad, facturas, documentos, clientes, ajustes y presupuesto idénticos. Tres llamadas reales anteriores permanecen; cero inferencias nuevas para estas pruebas.

Pasan 538 pruebas unitarias/SQL y 52 recorridos SaaS Android/Windows emulados, incluidos estados inciertos, consentimiento retirado, cancelación, ausencia de Gmail, ambos temas y Axe AA. Ajuste de botones limitado a tarjetas de facturas para evitar desbordamiento Android. Las 64 iniciales conservan sus once hashes. Publicación v16 y demo v6 conservadas mientras continúa la comprobación de CI/fuente exacta. Gmail directo, Migadu/DKIM y demás límites externos no se presentan como resueltos. [Guía](INVOICE_AI.md).

Publicada v17 el 02/11/2026 a las 15:13 UTC, fuente 5b51dbdcbc08654489cc9cbf309d1a3e309eefec, despliegue appgdep_6ae8a89406e08191b84c1e2d245f7d5d. Código d09d6ed y fuente exacta pasan 748 controles en 41468200441/41468271123; esos recorridos públicos verificaron v16 antes de publicar. Los 72 hashes HTTPS coinciden y demo v6 sigue intacta. PR #25 registra la aceptación posterior de v17. Migadu mantiene SERVFAIL en seis consultas de Google/Cloudflare a las 15:10 UTC; no se modifica DNSSEC ni se contrata nada. Guía de IA e instalación actualizadas; historial de entrega v16 conservado.

# 2026-11-02 — neumáticos, inspecciones e historial

Continuación desde main 6a5c30a, rama feat/tyre-management, 0.5.11-rc.1. Copia previa recuperable antes de editar en /workspace/artifacts/truckcontrol-tyres-20261102/before-tyres.bundle. Nuevo módulo usa el permiso Mantenimiento existente; no se modifican precios, planes ni lógica económica. Códigos y posiciones controlados, montaje/almacén/retirada, mediciones manuales fechadas y umbrales propios. Historial de revisiones inmutable para clientes. No hay TPMS ni certificación legal; los datos desconocidos no se presentan como ceros.

Migración local 20261102181517 → remota 20261102184040 aplicada una vez (57 totales). Dos tablas privadas con RLS; RPC invoker, autor vinculado a auth.uid y trigger privado con comprobación explícita para auditoría/capacidad. Ensayo nativo con dos empresas y 205 cubiertas prueba aislamiento, visor, revocación, referencias, duplicados, historial, páginas e idempotencia. Rollback completo: cero fixtures, huellas anteriores iguales, ninguna llamada a proveedores.

Copias de empresa v3 y demo v2 incluyen fichas e historial; los formatos anteriores siguen admitidos. La demo mantiene todos los registros en una escritura y no elimina cubiertas al restaurar una copia antigua compatible. La empresa necesita conexión en este módulo y no lo envía a la cola offline. Pasan 566 unitarias/SQL y los ocho recorridos nuevos Android/Windows emulados tras corregir la etiqueta de notas y el flujo de vuelta a la demo. Se conservan las 64 pruebas iniciales. Cincuenta y dos recorridos SaaS anteriores pasaron en el primer ciclo; se prepara CI completo y fuente exacta antes de publicar. Producción v17 y demo v6 permanecen conservadas.

CI de código/fuente inicial detecta una regresión en el restablecimiento de una demo dañada: preservar automáticamente el archivo de neumáticos intentaba leer JSON corrupto incluso al restablecer de forma explícita. Se corrige con una opción explícita de limpieza y actualización del registro tras restablecer; se añade una prueba y se conservan intactos los recorridos originales. Ambos perfiles de esos recorridos pasan localmente. La candidata Sites 18 nunca se publicó; producción v17 sigue intacta. No se cambia la migración 57 ya aplicada. Se prepara otra fuente comprobada.

Publicada v19 / 0.5.11-rc.1, fuente 2212cb3956ab96f4463fdad45c9fd23f18e50ece, despliegue appgdep_6ae8de12c194819198a47736820b7449. Código/fuente exacta 41504867338/41504864364 pasan 785 controles cada uno, incluidos seis perfiles públicos de v17 previos al despliegue. Las 64 pruebas iniciales siguen intactas; pasan 567 unitarias/SQL y 60 SaaS. Los 72 hashes TLS coinciden, la demo v6 y la producción v17 se conservan. Candidata 18 nunca publicada; corregido reset de demo dañada sin cambiar SQL aplicada. Se activa en el inventario la comprobación pública de neumáticos ficticios offline para la aceptación posterior de PR #26. No hay nuevas llamadas a proveedores, cargos, credenciales ni cambios comerciales.

# 2026-11-02 — correo personal autoservicio

Petición del titular: cada cliente debe entrar en su propio buzón sin aprobación de TruckControl. Se añade Mi correo separado de las facturas, accesible a usuarios activos de Básico/consulta. Gmail directo con Google Identity Services, gmail.modify, sesión en memoria y llamadas directas users/me: lectura paginada, búsqueda, respuesta, envío confirmado, lectura/no lectura, destacados, archivo, papelera reversible y descarga acotada. No se guardan tokens/cuerpos offline ni se remiten a backend/IA; cambiar usuario/empresa, salir, recargar o caducar limpia el acceso. El envío incierto no se reintenta.

Pasan 589 unitarias/SQL y ocho recorridos nuevos de Android/Windows emulados; dos temas con cero infracciones Axe AA y sin desbordamiento. Se corrigió una carrera de configuración pública al recargar en StrictMode. El conector empresarial anterior mantiene sus permisos de solo lectura e importación. Se prepara un endpoint público que expone solo un ID de aplicación Google validado, sin necesitar el secreto para el buzón personal. No hay nuevas migraciones, llamadas al modelo, correos reales, cambios comerciales o costes. Google sigue sin ID público válido; se pidió únicamente ese identificador del cliente web existente, no secretos. Verificación Google y otros proveedores siguen pendientes. Fuente/CI/publicación por completar, manteniendo v19 estable y demo6.

Publicada v23 / 0.5.12-rc.1, fuente 620c8d51136662a694f6f58e32d6b6b184a3c0e9, despliegue appgdep_6ae8fa685030819185de7651e9dddadf. Código/fuente 41523414330/41523413112 pasan 816 controles: 590 unitarias/SQL, 32 Python, 64 demo, 22 empresas, 68 SaaS, 14 candidata, 20 producción y seis perfiles públicos previos de v19. Los 72 hashes TLS coinciden; v19 y demo6 se conservan. company-gmail v12 añade solo configuración pública; seis fuentes nativas y 17 HTTP verificados. Sin nuevas migraciones, llamadas IA o correo real. Candidatas 20, 21 y 22 nunca publicadas; versión final incluye privacidad pública y retirada de permisos que borra contenido. El ID Google sigue inválido y su aprobación pública permanece pendiente; no se presenta el fixture como conexión real. La aceptación pública posterior de PR #27 incluye correo ficticio offline, configuración/CORS y verificaciones anteriores.

# 2026-11-02 — ID Google configurado, sin acceso a buzones

El titular facilitó el ID público del cliente web existente del proyecto 468881730124. Guardado a las 21:28 UTC únicamente en truckcontrol_google_client_id de Vault de TruckControl; secreto Google y AES conservan sus metadatos. Sin migraciones ni nueva publicación: producción sigue v23 y demo6 mantiene el mismo SHA-256. A las 21:29 UTC los tres orígenes reciben el ID exacto con configured=true, CORS y no-store; la salud empresarial también pasa a true. Entrada oficial Google 200 hasta inicio de sesión, sin errores conocidos de cliente. Tres llamadas anónimas siguen 401 y un origen ajeno 403. [Evidencia](verification/google-public-id-20261102.json).

No se ha realizado consentimiento ni lectura/envío de correo, ni llamadas IA, cambios de planes, permisos o costes. El código conserva los 816 controles aprobados de la entrega v23. Falta comprobar un consentimiento real y la publicación/verificación de Google; la página de inicio de sesión por sí sola no certifica orígenes GIS ni acceso para todos los clientes. Outlook/IMAP/SMTP continúan pendientes. No volver a pedir el ID ni un secreto para el acceso personal.

# 2026-11-03 — recepción de facturas: treinta días y máximo doce meses

El titular comunica que Mi correo funciona y ha enviado un mensaje real. Se registra como aceptación del usuario, sin inspección de mensajes ni prueba independiente del conector empresarial de facturas. ID Google y secretos existentes conservados. Se prepara 0.5.13-rc.1 con selector de recepción: treinta días por defecto, tres/seis/doce meses y fechas propias dentro del máximo, en Madrid. La fecha internalDate se valida en metadatos antes del contenido y de cualquier adjunto/IA; se excluyen enviados, borradores, recepciones ausentes, futuras y fuera de rango. Cursor privado unido al período, sin DDL. La entrada de producción exige el filtro para clientes antiguos y nuevos; la interfaz nueva exige capacidad y acción versionada para rechazar un servidor anterior. Revisión económica, permisos y presupuesto permanecen iguales. [Guía](INVOICE_MAIL_PERIOD.md).

Pasan 624 unitarias/SQL, TypeScript, compilación y las 64 originales con once hashes intactos. Los 26 recorridos de empresas pasan en Android/Windows emulados. La comprobación adicional del selector y de su confirmación pasa en ambos temas con cero infracciones Axe AA, ocho capturas y sin desbordamiento. Pruebas con proveedores simulados y datos ficticios; cero llamadas nuevas al modelo, lecturas de correo real o envíos por el agente. Pendientes CI, backend y publicación de este filtro. Copia del código y backend v12 preservadas en /workspace/artifacts/truckcontrol-invoice-period-20261103/.

Publicada la versión final 25 / 0.5.13-rc.2, fuente 4bc2e841f5f67ba121385c4768911992bc5d666f, despliegue appgdep_6ae99c63d17481918575af737f2a0152. Las primeras ejecuciones de código, PR y fuente 41599428197 / 41599584009 / 41599692726 pasan 854 controles cada una. La revisión final cambia solo texto de ayuda e identificador de versión y pasa los 26 recorridos de empresas. Backend company-gmail v13, siete fuentes exactas y 16 HTTP correctos; 72 hashes TLS de v25 coinciden y demo6 conserva su SHA. Sin DDL: 57 migraciones, cuotas y economía intactas, cero llamadas nuevas al modelo o acceso real de correo por el agente. V24 fue una entrega intermedia ya comprobada; v24/v23/v19 y anteriores se conservan. PR #29 registra aceptación posterior de la versión final.

# 2026-11-05 — alcances Google y aceptación integral de facturas

Continuación desde main e42b6f4, rama feat/gmail-readiness-acceptance. Copia completa previa verificada en /workspace/artifacts/truckcontrol-gmail-acceptance-20261105/baseline-main-e42b6f4.bundle. Sesión privada de Google guardada por el titular y utilizada para declarar los cuatro alcances del cliente existente. Aplicación aún en Pruebas; no se ha enviado la revisión pública ni grabado el vídeo. No se tocan marca, cliente, secretos o facturación. [Estado y límites](GMAIL_ACCEPTANCE.md).

La nueva prueba combina PKCE/cifrado, handler Gmail, runtime IA y todas las migraciones SQL en PGlite. Recorrido con factura ficticia, filtro 30 días/máximo doce meses antes de contenido, RLS, consentimiento, reserva incierta, presupuesto, revisión y aprobación idempotente. Google/OpenAI/almacenamiento simulados, red global prohibida: cero llamadas reales ni cambios de datos nativos. Configuración de Servicios distingue credenciales y vínculos; guía descargable, ambos temas, contraste y Axe comprobados en Android/Windows emulados. No cambia contabilidad, permisos o cuotas.

Pasan localmente 625 unitarias/SQL, 70 recorridos SaaS y la repetición final de las dos nuevas pruebas tras corregir contraste en Fleet Light y comprobar la descarga PDF. Las 64 originales conservan sus once hashes. Fuente 0.5.15-rc.1 preparada para CI y publicación segura; v26 y demo6 conservadas entretanto. Inventario nativo a las 22:22:15 UTC: 57 migraciones y cero vínculos/estados OAuth empresariales.

Publicada v27 / 0.5.15-rc.1 el 05/11 a las 23:08:50 UTC, fuente a9621598f31cc05affc3c724dc8b7f90cbeb9137 y despliegue appgdep_6aed0c74fb308191a382dead1ba32083. CI de código y fuente exacta 42126083754/42126057584 pasan 863 controles por ejecución; sus seis perfiles públicos verificaron v26 antes de publicar. Los 75 hashes HTTPS coinciden en los tres orígenes, incluida la factura ficticia, y la demo6 conserva su hash. Las producciones anteriores se mantienen. El PR #31 registra la aceptación pública posterior de v27. Backend/migraciones/planes/contabilidad y presupuestos intactos, cero llamadas nuevas a Gmail o modelos reales.

# 2026-11-06 — retorno de Gmail y contexto de la cuenta

Rama fix/gmail-connection-reliability desde main 5cce612; copia íntegra previa verificada en /workspace/artifacts/truckcontrol-gmail-reliability-20261106/baseline-main-5cce612.bundle. Tres casos fallan antes de la corrección: aviso borrado, retorno en ventana abierta sin finalizar y cuenta global sin explicación. Se conserva el servidor y no se crea una empresa para el propietario ni se suplantan cuentas.

0.5.16-rc.1 captura cambios de fragmento y procesa cada intento una vez, acepta solo confirmación explícita del servidor, conserva errores y permite cerrar avisos. Renueva consentimiento nuevo sin recarga; no expone valores arbitrarios ni envía tickets malformados. Demo/global explican el contexto y no completan vínculos. Estados de renovación y consulta fallida se distinguen de conectado/desconectado. Pruebas con datos ficticios, ambos temas y dispositivos emulados; sin lecturas reales, llamadas al modelo, migraciones o nuevas contrataciones. [Guía](GMAIL_CONNECTION_RELIABILITY.md).

Consulta nativa agregada 06/11 05:27:39 UTC: cero conexiones/autorizaciones empresariales activas, 57 migraciones. Google último observado en Pruebas el 05/11. Se solicita ampliar TinyFish hasta 1 USD más, sin ejecutar automatización hasta autorización explícita; entretanto se completa y verifica la parte independiente.

Publicada v28 / 0.5.16-rc.1 el 06/11/2026, fuente 709a0607b5d94e9707bbef6af3c816c42dedd176, despliegue appgdep_6aed6bb5276c8191a27b7f5e6c380f29. Código/fuente 42170304399/42170308021 pasan 883 controles; sus seis perfiles públicos verificaron v27 antes de publicar. Coinciden 75 hashes HTTPS y demo6 permanece intacta. PR #32 registra la aceptación posterior de v28. La consulta nativa posterior de las 05:55:37 UTC conserva cero vínculos/estados y 57 migraciones. Sin lecturas reales, llamadas al modelo ni automatizaciones pagadas nuevas.

DNS Migadu comprobado sin cambios: CNAME correctos; Google devuelve SERVFAIL/DNSSEC al consultar TXT, mientras Cloudflare devuelve NOERROR y key1 contiene el TXT «migadu», sin clave DKIM utilizable. No se considera solucionado ni se desactiva DNSSEC. Diez consultas HTTPS públicas, sin contactar al soporte o contratar nada. [Evidencia](verification/migadu-dns-20261106.json).

CI posterior: push 42171431103 pasa 883 controles y el ZIP oficial 13481303373 coincide con SHA-256 0e5dbe4939b678807f1eb9e2f70c781fcf9a8edfc3e77dafe88d50a32b2d4ac1; los seis perfiles públicos prueban 709a060/v28. El duplicado del PR se cancela por el límite de quince minutos: la instalación de dependencias consume 630 segundos desde el espejo Azure de Ubuntu. Tras solicitar un reintento se aplica una corrección del workflow: usar el archivo oficial Ubuntu por HTTPS y acotar esa instalación a cinco minutos. No se omiten tests, verificaciones de firmas ni se amplía el límite global. Aplicación y fuente desplegada sin cambios; solo difieren los recibos, esta guía y el workflow.

Diagnóstico adicional de CI: el primer cambio configuró cero archivos porque el runner usa file:/etc/apt/apt-mirrors.txt. PR 42173992741 pasó 883, pero push 42173986731 seguía descargando por Azure y agotó cinco minutos. Se corrige la lista de archivos para incluir apt-mirrors*.txt, se normaliza el archivo oficial a HTTPS y se exige que no quede el espejo lento. App v28 y todos los tests permanecen intactos; se verificará en las ejecuciones del nuevo head.

## 06/11/2026 — emisor y condición de facturación de suscripción

El titular confirma CIF B02993426 y código postal 20400 para ELEVADANCOR S.L. Se actualiza la fuente legal central y se añade una ficha pública y de cuenta con vendedor/comprador separados. Emisión y entrega automática reales pendientes de identificar el programa fiscal del titular; no se reemplazan por un aviso manual ni se anuncian operativas. Nuevo control de lanzamiento bloquea compras sin verificación fiscal en ambos handlers y en la interfaz, sin impedir cancelar renovaciones. Sin DDL, cambios de oferta, cobros, correos ni consumos IA. Guía: [SUBSCRIPTION_INVOICING.md](SUBSCRIPTION_INVOICING.md). Publicada v29 / 0.5.17-rc.1 tras 899 controles de código y fuente exacta; 75 hashes HTTPS, veinte comprobaciones HTTP y nueve fuentes nativas coinciden. Ambos servicios de cobro v10 corrigen su origen heredado de la demo. V28 y demo6 conservadas; aceptación pública posterior en PR #33. Emisión/entrega fiscal siguen pendientes, sin activar costes.

## 06/11/2026 — opciones fiscales por empresa

Configuración individual de TicketBAI con territorio, VERI*FACTU, SIF NO VERI*FACTU y programa externo/otro régimen, con formato Facturae opcional. El administrador global permite las opciones; cada administrador de empresa elige las suyas. RLS, verificación y bloqueo de cuenta, permiso Ingresos, versiones, auditoría, idempotencia y conservación al revocar. Nuevo RPC no admite credenciales ni emisión; estado preparation/false. Migración local 20261106100523 → remota 20261106103606, 58 entradas nativas; historial anterior intacto. 659 unitarios/SQL y 96 SaaS correctos, ensayo nativo con rollback sin fixtures y tres rechazos HTTP. No nuevas cuotas, correos, IA, facturas, envíos fiscales o cobros. Publicación siguiente pendiente de CI de fuente exacta. [Guía](COMPANY_FISCAL_OPTIONS.md).

- Publicación fiscal por empresa 06/11: v30, fuente 6a1e8f4dab2db4fc2b24e79b1141c6473d95169b, despliegue appgdep_6aedb712f3fc819194d34ca774e6b912; código/fuente pasan 941 cada uno y 75 hashes HTTPS. V29 y demo6 conservadas. Aceptación pública nueva exigida en PR34. Emisión y remisión fiscal reales siguen desconectadas; sin cobros o contratos nuevos.

- 06/11, copiloto por texto/voz: rama feat/universal-company-copilot, 0.5.19-rc.1. Ledger privado de turnos/propuestas con confirmación y once entidades; consentimiento y presupuesto IA existentes. Migración59 aplicada una vez, native rollback correcto,727 unitarias/SQL y118 SaaS; backend y publicación en curso.


## Copiloto: aceptación real y bloqueo de publicación, 06/11/2026

Implementación2395426, PR35: GitHub push42251837123 y PR42252895244 pasan1.031 controles cada uno, incluyendo727 unitarias/SQL y118 SaaS, sin perder las64 originales. company-copilot v1 ACTIVE con seis fuentes comprobadas y siete servicios previos intactos. La aceptación de las16:32 UTC confirma en base una llamada real gpt-6-luna liquidada,1.691/119 tokens y1.494 microUSD estimados; un turno, una propuesta de cliente, una ficha versión1 y una auditoría human_confirmed. Solo datos ficticios. Dos cuentas nuevas cerradas, bloqueadas y suspendidas, IA retirada, cero sesiones; registros conservados. El informe HTTP local debe recuperarse sin repetir la llamada.

Fuente aislada congelada2055e993fc8170ccdec1783368bffbbe80a50e9b / deploy/company-copilot-20261106, único cambio respecto al código2395426: manifiesto de producción. CI42254621291 en curso al registrar. El entorno de ejecución aparece unavailable para exec_command, aunque el conector cloud informa running; los conectores GitHub/Supabase/Sites siguen operativos. No es un 403 de GitHub. Falta compilar/archivar, push efímero al repositorio Sites existente, guardar/desplegar y verificar HTTPS/recorridos públicos; producción30 y demo6 conservadas. No hay nuevo servicio ni presupuesto y no se declara el copiloto publicado. Estado recuperable en docs/verification/company-copilot-20261106.json.


## Publicación del copiloto,06/11/2026

Entorno recuperado; informe real recuperado con25 HTTP correctos, sin repetir IA. Código2395426 integrado por PR35; fuente exacta2055e993fc8170ccdec1783368bffbbe80a50e9b publicada en v31 /0.5.19-rc.1, despliegueappgdep_6aee2e42428481918c4df3994c8664ee. Código/fuente/recibo previo pasan1.031 cada uno;75 hashes HTTPS coinciden y demo6 intacta. Nueva aceptación pública en https://github.com/smartscaneuskadi/TruckControl-AI/actions?query=branch%3Arelease%2Fcompany-copilot-v31 exige companyCopilot=true en seis perfiles. Se conservan v30, migración59 inmutable y presupuesto10USD. Ambas cuentas ficticias cerradas/suspendidas, archivos privados temporales retirados y auditoría conservada. Voz/dispositivos físicos pendientes. Recibo documental en release/company-copilot-v31; no requiere recompilar ni volver a desplegar.
