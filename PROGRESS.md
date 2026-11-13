## Candidata en preparación · 13/11/2026 UTC

Producción comprobada: **Sites41/app0.5.23-rc.1**, fuente a33ed6f073392984a5de4de9f073734097db3a8d; demo6 conservada. Main dfe56b7 incluye PR110; Native billing19/subscriptions18/fiscal8/incidents5, Supabase66 migraciones. Los estados v32/PR60/CI434 del encargo son históricos: PR60 ya está integrado. No repetirlo ni repetir #37.

Se trabaja en `feat/commercial-acceptance-20261113`: prefijo real Stripe dp_, ordenación CAS de suscripciones, integridad de copias persistidas antes de restaurar, consentimiento específico IMAP/SMTP, periodos Gmail confirmados y clasificación de errores del servidor, diagnósticos Stripe privados compatibles y comprobación del AAB real de Android. [Plan y límites actuales](docs/COMMERCIAL_ACCEPTANCE_20261113.md). Son cambios candidatos, **no publicados ni migrados todavía**.

Cobros OFF. La clave Stripe del backend falla por formato; el destino existente está deshabilitado y su URL/entrega no están acreditadas. Se requiere aceptación nativa de pagos/licencias/facturación antes de abrir ventas. IA10USD/mes y100llamadas/empresa intactas; nuevas llamadas IA, compras y compromisos0. Histórico del techo200EUR sin conciliar; saldo desconocido. No declarar lanzamiento comercial completo.

## Vigente: Servicios privados de Stripe publicados · Sites41 · 12/11/2026 UTC

https://truckcontrolai.com está en **Sites41/app0.5.23-rc.1**, fuente a33ed6f073392984a5de4de9f073734097db3a8d, despliegue appgdep_6af643bcca608191829fc7007605ab13 SUCCEEDED. PR108 integrado en2131e9c0cd42fead994dbfeb8ac57dabe994facd; PR103–107 conservados. Se mantienen40/39 y demo6. [Recibo final](docs/verification/admin-stripe-readiness-published-20261112.json).

Administración → Servicios → **Comprobar Stripe**; enlace https://truckcontrolai.com/#/admin?section=providers. Reutiliza billing existente, sesión humana vigente y rol SQL real de superadministrador. Solo GET; contrato estricto, caché RAM60s con permisos reevaluados, sin secretos al navegador ni cambios de cobros/licencias. La verificación positiva debe ejecutarla el propietario desde su sesión; NO se infiere que la cuenta/receptor estén conectados por pasar fixtures. La presencia del secreto no verifica su firma/entrega. El prototipo público separado fue rechazado y NO se desplegó; se sustituyó por esta autorización existente. [Guía](docs/STRIPE_ADMIN_READINESS.md).

**CI1949 controles por ejecución**, no sumados entre reejecuciones:1477unit/SQL,54Python,94demo,50empresa,228SaaS,20candidata,20producción y6públicos previos. PR43321910161, rama43321901562 y fuente exacta43321984533 SUCCESS; PostgreSQL aislado43321132543 SUCCESS, Deno2.9.6 correcto. Los64 originales/11hashes intactos. Tras publicar: **75/75 hashes HTTPS,38/38 recorridos de cuenta/Gmail/CargoTrack/Stripe y6/6 perfiles PWA**, cero omisiones/flaky. SDK real con transporte privado ficticio y llamadas privadas no interceptadas bloqueadas. Android/Windows emulados; sin hardware físico ni nuevas cuentas reales.

Native **billing18 ACTIVE,11/11 fuentes iguales,6/6 barreras HTTP**; otras12funciones intactas. Supabase66 migraciones existentes, ninguna aplicada aquí; conservar66/local20261112221027 ↔ remota20261112223150 de PR106. Asesor:0WARN/ERROR,1INFO de RLS sin política; protección de contraseñas filtradas ya confirmada. No repetir migraciones aplicadas ni las llamadas IA de #37. GDTaller/manual confirmado por el propietario; cobrosOFF hasta completar las aceptaciones Stripe/fiscal. Gmail empresarial/verificación Google, recuperación gestionada Auth/Storage/Vault, firma/Play, hardware físico y revisión jurídica externa siguen pendientes.67/67 recuperación autohospedada y17/17 renovación sandbox previas se conservan, sin repetir consumos.

IA10USD/mes–100llamadas/empresa intacta; nuevas llamadas IA, compras y compromisos0. Presupuesto200EUR acumulado: histórico sin conciliar, saldo desconocido; no asumir200EUR disponibles. Producción y demo conservan sus identidades distintas: **main sigue con manifiesto DEMO**, no usarlo para desplegar producción. El monitor de esta actualización apunta a41; un CI antiguo que termine después de la promoción puede detectar la sustitución40→41 y no acredita un defecto funcional. No declarar lanzamiento comercial global completo.

## Comprobación privada Stripe y seguridad · candidata 12/11/2026 UTC

Supabase confirma la desaparición del aviso de contraseñas filtradas: cero WARN/ERROR de seguridad y un INFO de RLS sin política; no se alteran RLS ni las66 migraciones. [Recibo](docs/verification/auth-password-protection-20261112.json). Main d375f0c incorpora PR103/104/105/106; se conserva la confirmación del propietario sobre emisión/entrega manual GDTaller y el nuevo verificador de entrega Stripe. No repetir esa decisión ni las aceptaciones IA de #37.

Candidata0.5.23-rc.1: **Servicios → Comprobar Stripe**, dentro del endpoint de pagos existente y detrás de sesión humana vigente más superadministrador SQL real. Solo GET de cuenta/receptor, sin secretos al navegador ni cambios de cobros. No hay función pública nueva: el prototipo separado fue rechazado por revisión automática y NO se desplegó. [Diseño y límites](docs/STRIPE_ADMIN_READINESS.md).El head166ffd3 pasó npm run check:1473 unitarias/SQL y compilación; además54Python, Deno2.9.6 y8 nuevos recorridos Android/Windows emulados con ambos temas/accesibilidad. PR106 integrado sin conflictos y sin repetir su migración66; CI de la fuente compuesta, despliegue y comprobación privada real pendientes. Los64 originales/11hashes se conservan. Producción40/demo6 intactas.

CobrosOFF, IA10USD/mes–100llamadas/empresa sin nuevas llamadas; compras/compromisos nuevos0EUR. Presupuesto agregado200EUR: gasto histórico y saldo aún sin conciliar. No autorizar cargos sobre un saldo supuesto. Gmail empresarial y revisión Google, restore gestionado, firma/Play y hardware físico siguen pendientes; no declarar lanzamiento comercial completo.

## Renovación Stripe sandbox verificada · 12/11/2026 UTC

PR101 integrado en a73f0708c502d4b9542830be725375e558668904 tras ambos CI correctos del head0f4999f; recuperación67/67 repetida correctamente en main/Actions43139567891. Producción40/demo6 y Native65 conservados.

Nuevo ensayo Stripe real: **17/17 controles**, dos mensualidades con tareas independientes, replay sin duplicados/regresión y firma inválida rechazada. Adaptadores productivos, API/firmas auténticas mediante CLI oficial, persistencia PGlite local; reloj, cliente y suscripción propios eliminados. Seis barreras nuevas pasan; regresión completa de esta rama pendiente. [Recibo saneado](docs/verification/stripe-renewal-sandbox-20261112.json). No acredita Checkout comercial, clave/receptor productivo, factura TicketBAI ni entrega. CobrosOFF, IA0nueva, compras/compromisos0EUR; saldo histórico200EUR sin conciliar.

## Estado vigente confirmado · 12/11/2026 UTC

Producción40/app0.5.22-rc.1 y demo6 conservadas. Main1a1be188ab9e0984702aaadf67803f6ad06c073d integró PR100 con ambos CI correctos;1426 unitarias/SQL y los64 originales/11hashes intactos. Supabase65; fiscal3/incidentes2 verificados, negocioOFF; no volver a desplegar esos cambios ni repetir migraciones o #37. El [checkpoint final](docs/verification/commercial-final-checkpoint-20261112.json) y [comentario6810872922](https://github.com/smartscaneuskadi/TruckControl-AI/issues/3#issuecomment-6810872922) sustituyen los estados CI/Edge pendientes de notas anteriores.

Recuperación real en servicios autohospedados aislados: **67/67 controles correctos** en [Actions43137304506](https://github.com/smartscaneuskadi/TruckControl-AI/actions/runs/43137304506), fuente70429f1. Dos empresas ficticias, SMTP local, alta Básico, contraseña, sesiones, RLS, originales privados y restauración DB/archivos con cierre efectivo; ambas instalaciones desechables se eliminaron.42 archivos SQL consolidados, claves de firma distintas,54Python/nueve barreras;64 originales/11hashes intactos. [Recibo saneado](docs/verification/local-service-recovery-20261112.json), PR101. CI completo del head documental aún pendiente. **No equivale a recuperación gestionada ni del Vault productivo**, emisión TicketBAI o aceptación comercial. Sin DDL remoto, IA nueva, compras o apertura de cobros.

## Actualización40 publicada · 12/11/2026 UTC

https://truckcontrolai.com está en Sites40/app0.5.22-rc.1, fuentede8ad2c7d3fee9f628e09566a2ed91d62a2d1fa4, deploymentappgdep_6af503dc2a988191b3cb864879d880ea SUCCEEDED.39 y demo6 conservadas. Segundo conductor y administración de incidencias publicados. CI exacto43123780131 SUCCESS:1401 unitarias/SQL,45Python,94demo,50empresa,220SaaS,20candidata,20producción,6perfiles públicos previos;64 originales/11hashes intactos. Después:75/75 hashes HTTPS,42/42 cuenta/Gmail/CargoTrack,40/40 segundo conductor/incidencias y6/6 perfiles PWA. Native65 y20/20 nuevas comprobaciones con rollback.

Stripe sandbox real:13 controles correctos, eventos firmados oficiales, API canónica por CLI y persistencia en PGlite aislado; no es aceptación de clave/receptor de producción ni Checkout en navegador ni emisión TicketBAI. El primer ensayo detectó context exacto de cuenta rechazado; corrección estricta y25 pruebas nuevas correctas, pendiente CI/despliegue Edge final. Receptores productivos y cobrosOFF. Gmail empresarial invalid_client, firma/Play, dispositivos físicos, restauración administrada y aceptación fiscal/jurídica pendientes. Sin compras ni compromisos nuevos; acumulado histórico200EUR sin conciliar. [Recibo de publicación](docs/verification/commercial-update-published-20261112.json).

## Avance verificado · 11/11/2026 UTC

PR87 (segundo conductor) y PR88 (incidencias de pago, interfaz83 y contratos82) integrados. Supabase exclusivo TruckControl tiene65 migraciones: nuevas64/65 aplicadas una vez con hashes nativos idénticos.20/20 controles nuevos nativos con rollback integral;117 comprobaciones PostgreSQL17 aisladas y restauración lógica. Producción39 y demo6 conservadas, nueva interfaz todavía NO publicada. Receptores Stripe desplegados con negocio apagado. [Recibo](docs/verification/new-additions-native-20261111.json).

## Cuenta y Gmail publicados · Sites39 · 08/11/2026 UTC

Este checkpoint prevalece sobre los estados históricos inferiores. https://truckcontrolai.com está en Sites39/app0.5.21-rc.1, fuente `f861e42ece8ba7c83b42f493be611814113058c3`, despliegue `appgdep_6af1039c6574819182741d8ae52e14a5` SUCCEEDED. PR98 fusionado en `89ef16115c2a52492c270922370c9f43eb09d592`; Sites38 y demo6 conservados. Main mantiene el manifiesto DEMO: no publicarlo como producción.

CI de PR42533025198, rama42533020536 y fuente exacta42533027609 SUCCESS: **1.664 comprobaciones por ejecución**, sin sumar reejecuciones. Se conservan las64 originales/11hashes. Después de publicar: **75/75 hashes HTTPS y 42/42 recorridos de navegador**, sin fallos, omisiones ni flaky. SDK real con transporte ficticio y accesos privados no interceptados bloqueados. Android/Windows emulados; sin hardware físico ni nueva autenticación de un cliente real.

Gmail personal conserva la aceptación del titular. Gmail empresarial NO está conectado: Google rechaza la credencial guardada con401/`invalid_client`. No pedir repetir el consentimiento ni recrear proyecto/cliente. Hace falta un secreto válido del mismo cliente existente mediante el formulario privado. La validación de credenciales no acredita permiso de buzón ni verificación pública de Google. Issue97 sigue abierto.

Recibo durable: [docs/verification/gmail-account-repair-published-20261108.json](docs/verification/gmail-account-repair-published-20261108.json).

# TruckControl AI — avance comercial

## CargoTrack integrado publicado · Sites34 · 08/11/2026

**Estado vigente: https://truckcontrolai.com, Sites34/app0.5.21-rc.1**, fuente72526b86a74f2539f073e888015e477e4dbee401. PR92 fusionado en7bd8de6c1bc9dbb67e8d2761f8620838114a0c76. Deploymentappgdep_6af0b9aa501c819195e5bb1a8898895d SUCCEEDED. Se conservan33/32/31 y demo6; no publicar main con su manifiesto de demo.

CargoTrack abre ahora dentro de TruckControl por acción explícita y conserva el mismo iframe/documento al cambiar de sección. Salir o cambiar empresa/usuario retira la vista. El proveedor mantiene sus propias credenciales/cookies/caducidad; no se captura contraseña, no se promete autenticación por cargar la página y no se cierra automáticamente su sesión. Sin API ni importación. La petición del titular sustituye el acceso principal en otra pestaña de33; los checkpoints anteriores son históricos.

CI42506902906/42506892118 y fuente exacta42507142648 SUCCESS:1564 controles por ejecución,64originales/11hashes. Después de publicar:75/75 hashes HTTPS,6/6 perfiles públicos,20/20 regresiones de CargoTrack/sesión y2/2 pruebas del formulario REAL público del proveedor, conservado al navegar con0pestañas nuevas. En estas últimas no se introdujeron credenciales ni se envió login: no se certifica sesión autenticada del titular. Android/Windows emulados, sin hardware físico. El probe restablece sólo la protección de almacenamiento particionado de Chrome desactivada por Playwright; sin rebajar TLS/SOP/cookies ni controles del proveedor. Hay alternativa voluntaria en la misma pestaña para navegadores restrictivos.

Recibo: docs/verification/cargotrack-embedded-published-20261108.json; detalles y procedimiento: docs/CARGOTRACK_EMBEDDED.md. Fuente enviada por Git oficial y archivo Actions42507142653/artifact13627389701, tarSHA25621577cfdab95e445c1146cd7432f21e286b3a5f0e3170194f60258b7132d4413. Sin DDL/Edge/compras/IA nuevas; Native63/#37 y cuotas intactos, cobrosOFF. Gates comerciales generales y PR82/83/87/88 siguen separados. Automatización existente pausada, no prometer ejecución continua.

## Publicación CargoTrack y Cerrar sesión verificada · 08/11/2026

**Este bloque sustituye el estado de publicación y ejecutor de las notas históricas inferiores.** Producción **Sites33 / app0.5.21-rc.1**, https://truckcontrolai.com; source **89100d92c0b44d2b86c1495faffcab2944abacbb**, deploy **appgdep_6af0a4fe4ec881919f08b7ac80cda8d9 SUCCEEDED**. PR85 integrado en main1d3e88e; no volver a fusionarlo ni reconstruir CargoTrack/logout. Se conservan32/31 y demo6. Main mantiene el manifiesto de demo: no desplegarlo como producción.

Ejecutor recuperado: shell, Git, descarga y Chromium funcionan. La red del sandbox no alcanza el proxy; el mismo comando por la escalada oficial funciona con proxy/CA heredados y TLS activo. No pedir al titular otra reconexión ni exportar credenciales a Actions. Copia Git de todos los refs locales verificada antes del fetch; sin reset ni sobrescritura. Fuente exacta enviada por Git de Sites y leída de vuelta, después save/deploy del archivo de Actions42496353868, artifact13623149793.

**Pruebas:** CI completo de release42496353761 y PR42497386164/42497390339 SUCCESS,1.558 comprobaciones por ejecución; postmerge42498406754 SUCCESS;64 originales/11hashes conservados. Después de publicar: **75/75 hashes HTTPS**, **6/6 perfiles públicos** en3orígenes y **16/16 casos CargoTrack/logout** sobre el bundle publicado,0fallos/omisiones/flaky. Las16 pruebas usan SDK real y transporte HTTP ficticio; comprueban doble pulsación, rechazo remoto honesto, Atrás/recarga/BFCache, copia cifrada y logout entre pestañas. No certifican una sesión nativa de un cliente. Android/Windows emulados, sin hardware físico ni login CargoTrack real.

Sin DDL, cambios Edge, compras ni llamadas IA nuevas; Native63/#37, aislamiento y cuotas10USD/mes–100llamadas/empresa intactos. Cobros reales y lanzamiento comercial global siguen cerrados/pendientes. Presupuesto histórico y saldo200EUR sin conciliar. PR82/83/87/88 permanecen separados. La automatización existente se observó pausada; no prometer ejecución continua.

Evidencia durable: [recibo v33](docs/verification/cargotrack-v33-published-20261108.json); hashes y perfiles detallados enlazados dentro. Antes de una nueva entrega, volver a consultar main, PR y versión pública actuales; no promover891 ni32 si hay avances posteriores.

## Checkpoints anteriores — históricos, no sustituyen el bloque superior

## CargoTrack y cerrar sesión · 08/11/2026

Implementación y correcciones de seguridad verificadas en `821ba13d2f2dcf68fc0fd1990c0e7190d304f7e2`, PR85 existente. Ambos CI completos pasan **1.558 controles**; incluye dos pestañas, BFCache, expiración/denegación, conservación de la cola cifrada, dos temas y Android/Windows emulados. Originales64/11hashes conservados.

Paquete de producción conectado `89100d9` generado en Actions42496353868/artifact13623149793, sin publicar ni activar cobros. Producción32, respaldo31 y demo6 conservados. El ejecutor sigue fallando tras la reconexión del titular; la transmisión de la fuente por Git de Sites queda pendiente. No se ha creado otro sitio Netlify.

[Entrega y procedimientos](docs/CARGOTRACK.md) · [recibo verificable](docs/verification/cargotrack-logout-20261108.json) · [PR85/checks](https://github.com/smartscaneuskadi/TruckControl-AI/pull/85/checks). Los commits posteriores de registro no modifican la aplicación de821ba13; comprobar sus propios checks antes de integrar.


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

### Resultado de esta fase

La63 une controles de sesión frescos, bridge transaccional de pago→licencia→tarea→recibo→aviso, documentos privados y outbox cerrado por defecto. El contrato nativo y el código aceptados no sustituyen la aceptación de Stripe/GDTaller/correo real. Se conserva la decisión de emisión manual con GDTaller/TicketBAI; no exigir su API para el primer lanzamiento.

El frontend nuevo y sus paneles siguen pendientes de empaquetado, preview aislada y promoción verificable; la compilación remota del candidato no implica despliegue. Antes de sustituir v32 se deben comprobar los recorridos publicados y conservar la recuperación.

## Histórico conservado — no sustituye el estado vigente

## Estado nativo verificado · 8 de noviembre de 2026

Esta actualización prevalece sobre el histórico inferior. PR42 y PR60 están integrados; main4d6b09ee806ca92a90da620fb9d47123b6398bc5 conserva el candidato0.5.21-rc.1. **La web pública sigue v32/0.5.20-rc.1**, con v31 y demo6 recuperables; no confundir main con publicación.

**Supabase tiene62 migraciones.** La local20261108013000 corresponde a la remota20261108101437_manual_subscription_invoice_intake, Gitblob7504aca678710771ce550430cab5ab2b5f76068a y SHA2567323ded662cf8ec4560662a86c9224d21eb3d45ad4689caa919cf2638672da7b. Está APLICADA, su fuente coincide byte a byte y no debe editarse ni repetirse. La61 de proveedores/viajes20261108081848 permanece intacta. El contrato fiscal exacto pasó en Supabase y dejó cero usuarios, sesiones, operadores, pedidos, tareas, eventos, acciones, suscripciones y facturas sintéticos tras rollback; no hubo llamadas a proveedores ni correo. Se verifican permisos frescos, snapshot validado por operador, CAS/auditoría inmutable y mensualidades independientes. Es CAS de escritor obsoleto, sin prueba de carga concurrente nativa.

Head033b94f pasa ambos CI42469487926/42469491382: **1.292 controles** por ejecución (941unitarias/SQL en94archivos,45Python,72demo,50empresa,144SaaS,14candidata,20producción,6públicas), originales64/11hashes. Asesor sin hallazgos nuevos; permanecen dos INFO administrativos deny-all y el WARN previo de contraseñas filtradas que requiere plan de pago.

**Cobros y guard fiscal continúan apagados.** Los ocho perfiles IA de v32 conservan su aceptación; no repetir sus llamadas. La decisión GDTaller/TicketBAI es manual. El panel fiscal y conciliador están en código; PDF privado, bridge transaccional y avisos se preparan en PR66/67 y ramas independientes, con flags cerrados y sin declarar conexiones activas. Falta aceptación real Stripe/fiscal, Google público/Gmail empresarial, restore gestionado, hardware físico y revisión jurídica.

El ejecutor local sigue fallando; se trabaja por GitHub/CI/MCP. CLI oficial3.0.0 verificado por SRI ejecutó migration new en Actions42469793645 y generó la plantilla local20261108100352_manual_subscription_payment_and_documents.sql. **No es una63 aplicada**; integrar propuestas y probar antes de cualquier DDL. No crear proyectos duplicados, no tocar FIXPilot ni trasladar secretos a GitHub.

Presupuesto agregado200EUR, sin nuevas compras o llamadasIA; gasto histórico y saldo real no conciliados. LímiteIA10USD/mes y cuota100/empresa preservados. Existe una automatización horaria actualizada; no duplicarla ni afirmar ejecución continua. Recibo: docs/verification/manual-fiscal-native-20261108.json; inventario62: docs/deployment/remote-migrations-20261108-manual-fiscal.json. Evidencia durable en issue3 comentario6720303851 e issue41 comentario6720304629.

## 8 de noviembre · continuidad desde GitHub

Migración aplicada con aprobación oficial:61 remotas,20261108081848. Proveedores y vínculos/revisión de viajes pasan aceptación nativa real con205 proveedores,dos empresas y rollback;0fixtures nuevos,datos/planes/ajustes idénticos antes/después,0 llamadas a modelos/proveedores y0 correos reales. RLS y permisos de las3 tablas verificados,sin nuevos avisos. Fuente/hash inmutables en el recibo comercial.

Head1866f8d: CI447/448 (42466436798/42466440658) SUCCESS,1.194 controles por ejecución; originales64/11hashes conservados. Main7d47ee9/PR39–48 incorporado sin perder sus controles. Decisión vigente:GDTaller+TicketBAI manual inicial; no volver a pedir proveedor ni bloquear MVP por su API. Faltan persistencia/panel/aviso/aceptación del flujo manual, no se habilitan cobros por disponer del reductor puro.

Android TWA compilado: CI8/9 (42466436890/42466440590) SUCCESS,5 pruebas JVM sin omisiones,lint,APK debug/AAB unsigned y salvaguardas del manifiesto compilado verificados. Gradle9.8.2 oficial preinstalado evita descargas fallidas504; minSdk24/API36 sin overrideLibrary ni saltar pruebas. Artefacto13612255717 con hashes en docs/verification/android-candidate-20261108.json. Firma comercial/Play/dispositivos físicos pendientes. El entorno local ha fallado al recuperar ERS; las tareas continúan por conectores y CI. Producción32 y demo6 intactas. Publicación del frontend0.5.21-rc.1 pendiente de empaquetado y promoción verificados.

Billing/subscriptions nativos actualizados a v11:guard fiscal compilado cerrado,5/6fuentes exactas y GET anónimo405. No se activa checkout,Stripe,IA ni envío. PR60 es candidato separado,no aplicado; debe resolver snapshot confirmado,CAS/auditoría y renovaciones antes de integrarse.

## Histórico · 7 de noviembre de 2026 · auditoría desde v32

Seguimiento: https://github.com/smartscaneuskadi/TruckControl-AI/issues/41.
Rama: `feat/commercial-completion-20261107`, base `3bbec3c`.

Producción32 sigue publicada en https://truckcontrolai.com. Se conservan v31 y demo6. El respaldo completo previo está verificado en `/workspace/artifacts/truckcontrol-commercial-completion-20261107/before-all-refs.bundle`. No se han modificado datos de clientes, funciones nativas ni migraciones en esta fase.

Comprobado ahora en servidor:60 migraciones, registro abierto, pagos apagados, IA habilitada con límite10USD/mes y8 perfiles con aceptación real previa. Las1.107 pruebas de v32 no sustituyen las pruebas de las nuevas funciones. No se repiten las8 llamadas IA anteriores sin necesidad.

La auditoría identifica documentación de portada obsoleta, proveedores sin maestro propio, ausencia de costes contables explícitamente vinculados a cada viaje, emisión fiscal sin proveedor conectado, publicación Play ausente y recuperación integral alojada pendiente. El asistente existente es real; no acredita por sí solo predicción de averías ni optimización viaria.

Se han consultado precios oficiales Stripe, registro Play y cambio de referencia BCE. No hay compras ni nuevas llamadas IA. Se solicita únicamente la reconexión oficial de Stripe y el programa/régimen fiscal del emisor; se continúa con tareas independientes.

Siguiente ciclo: consolidar auditoría/presupuesto, completar monitorización y operaciones, preparar Android y comprobar accesos oficiales Google. Véanse [TODO](TODO.md), [bloqueos](BLOCKERS.md), [pruebas](TEST_RESULTS.md) y [despliegue](DEPLOYMENT.md).

Monitor implementado:5 sondas públicas acotadas,sin consumo IA ni datos privados. Workflow real42384257704 y CI42384944532 correctos,commitf82bdf4,PR42; falta integración en main para horario permanente. La sesión Google caducó y se pide renovar por el acceso privado, sin reintentar ni introducir credenciales. Estimación del único run nuevo0,0483USD,no compra ni factura conciliada.

Operaciones preparadas:proveedores, asociación de apuntes a viajes, revisión de margen y copias cifradas v4.823 unitarias/SQL,TypeScript/build y8 nuevos recorridos Android/Windows pasan. El contrato nativo con205 proveedores/dos empresas pasa primero en PGlite; aplicación de la migración y aceptación Supabase todavía pendientes. Se incorporan sin sobrescribir los PR39/40 de recuperación,main13316cf. Véase [guía](docs/COMMERCIAL_RECORDS.md).
