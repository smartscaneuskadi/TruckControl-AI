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
