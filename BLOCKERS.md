## Bloqueos vigentes · 14/11/2026 UTC

GitHub y ejecutor operativos; no repetir las antiguas solicitudes403. Migraciones68/69 ya aplicadas: no son bloqueo. Las nuevas candidatas requieren pruebas aisladas/CI antes del canal oficial. Sigue sin aceptación comercial completa Stripe/fiscal real, Google público/Gmail empresarial, recuperación gestionada Auth/Storage/Vault, firma/Play/dispositivos físicos y revisión jurídica. Histórico200EUR sin conciliar; no nuevos cargos. La producción segura42/demo6 permanece disponible.

## Migraciones #68 y #69 aplicadas oficialmente · 13/11/2026 23:33 UTC

Supabase TruckControl `kkkemaycedexymrpaqtp` confirma **69 migraciones**. Las dos nuevas son `20261113233252_subscription_snapshot_ordering` y `20261113233311_subscription_unlinked_incident_review`, aplicadas una sola vez con `apply_migration` oficial. SQL idéntico a las candidatas ensayadas; archivos renombrados para coincidir con el historial. Comprobadas las columnas `snapshot_revision` y `reconciliation_required`, dos tablas privadas, funciones y 0 avisos WARN/ERROR de seguridad (2 INFO deny-all anteriores). Flags intactos: `payments_enabled=false`, `prices_are_examples=true`, `registration_open=true`, `enforce_access=true`. **No existe aceptación Stripe LIVE, emisión fiscal real ni despliegue nuevo**. Sites42/demo6/rollback41 se conservan. No volver a ejecutar estas migraciones. [Recibo](docs/verification/supabase-migrations-68-69-20261113.json).

## Publicación segura42 comprobada · 13/11/2026 UTC

https://truckcontrolai.com está en **Sites42/app0.5.24-rc.1**, fuente94c719a72f2548b0ec3c0889cea49ae8156952b7, despliegue appgdep_6af77bdd7b0c819191c1a367230964e8 SUCCEEDED. Se conservan41 y demo6. [Recibo](docs/verification/commercial-safe-update42-20261113.json).

CI de la fuente exacta43487806846 SUCCESS:1630unitarias/SQL,103Python,94demo,54empresa,240SaaS,20candidata y20producción;64originales/11hashes intactos. PostgreSQL aislado93+96 controles, nueve carreras reales y restore de archivos guardados. Android compila5JVM y AAB real inspeccionado; sin firma comercial/Play ni hardware físico. Después de publicar:75hashes HTTPS,42recorridos de navegador sin omisiones/flaky,6perfilesPWA y6denegaciones HTTP correctos. SDK real con transporte privado ficticio y llamadas no interceptadas bloqueadas; no es una aceptación nueva de proveedores.

Native billing21/company-gmail18/personal-mail4 ACTIVE y fuentes runtime verificadas; subscriptions18/incidents5/fiscal8 conservados. **Supabase67**: #67 aplicada una vez y ruta/bytes reconciliados. **68/69 no aplicadas**: las tarjetas oficiales caducaron; no ejecutar por otra vía. Las identidades pendientes20261113185620/20261113185634 mantienen los bytes SQL ensayados y orden posterior a#67. La cola y el CAS nuevos están preparados; no se declaran activos. Registro abierto, cobrosOFF,0WARN/ERROR de seguridad. No repetir#37 ni sus llamadasIA.

El modelo manual GDTaller/TicketBAI ya está confirmado por el titular. Siguen pendientes aceptación Native Stripe→licencia/tarea/factura/entrega, Google público/Gmail empresarial, restore gestionado, firma/Play/hardware y revisión externa. La actualización pública segura **no equivale a lanzamiento comercial completo**. IA10USD/mes–100llamadas/empresa intacta. Compras/compromisos/llamadasIA nuevos0; histórico del techo200EUR sin conciliar, saldo desconocido. Main conserva manifiestoDEMO: publicación solo desde checkout de producción.

## Candidata en preparación · 13/11/2026 UTC

Producción comprobada: **Sites41/app0.5.23-rc.1**, fuente a33ed6f073392984a5de4de9f073734097db3a8d; demo6 conservada. Main dfe56b7 incluye PR110; Native billing19/subscriptions18/fiscal8/incidents5, Supabase66 migraciones. Los estados v32/PR60/CI434 del encargo son históricos: PR60 ya está integrado. No repetirlo ni repetir #37.

Se trabaja en `feat/commercial-acceptance-20261113`: prefijo real Stripe dp_, ordenación CAS de suscripciones, integridad de copias persistidas antes de restaurar, consentimiento específico IMAP/SMTP, periodos Gmail confirmados y clasificación de errores del servidor, diagnósticos Stripe privados compatibles y comprobación del AAB real de Android. [Plan y límites actuales](docs/COMMERCIAL_ACCEPTANCE_20261113.md). Son cambios candidatos, **no publicados ni migrados todavía**.

Cobros OFF. La clave Stripe del backend falla por formato; el destino existente está deshabilitado: su URL canónica ya se verificó mediante GET oficial con include; falta entrega firmada. Se requiere aceptación nativa de pagos/licencias/facturación antes de abrir ventas. IA10USD/mes y100llamadas/empresa intactas; nuevas llamadas IA, compras y compromisos0. Histórico del techo200EUR sin conciliar; saldo desconocido. No declarar lanzamiento comercial completo.

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

## Bloqueos vigentes · 11/11/2026 UTC

La ampliación SQL64/65 ya está aplicada y pasa20/20 controles nativos; no volver a pedir ni repetir esas migraciones. El test se revirtió completamente. Stripe sigue sin credencial de ejecutante verificable; nueva autorización oficial solicitada, cobrosOFF. Gmail empresarial sigue con invalid_client; no hay administración Google conectada. Faltan aceptación fiscal real/revisión jurídica, restauración administrada y firma/Play/dispositivos físicos. No se declara lanzamiento comercial completo. Producción39 permanece hasta verificar la candidata.

## Cuenta y Gmail publicados · Sites39 · 08/11/2026 UTC

Este checkpoint prevalece sobre los estados históricos inferiores. https://truckcontrolai.com está en Sites39/app0.5.21-rc.1, fuente `f861e42ece8ba7c83b42f493be611814113058c3`, despliegue `appgdep_6af1039c6574819182741d8ae52e14a5` SUCCEEDED. PR98 fusionado en `89ef16115c2a52492c270922370c9f43eb09d592`; Sites38 y demo6 conservados. Main mantiene el manifiesto DEMO: no publicarlo como producción.

Gmail personal conserva la aceptación del titular. Gmail empresarial NO está conectado: Google rechaza la credencial guardada con401/`invalid_client`. No pedir repetir el consentimiento ni recrear proyecto/cliente. Hace falta un secreto válido del mismo cliente existente mediante el formulario privado. La validación de credenciales no acredita permiso de buzón ni verificación pública de Google. Issue97 sigue abierto.

No hay conector administrativo de Google ni secreto alternativo recuperable verificado. El coste nuevo de esta entrega es0EUR; el acumulado histórico sigue pendiente de conciliación. Las pruebas ficticias no resuelven el acceso privado del propietario a Google. Los demás gates comerciales no se declaran completados.

Recibo durable: [docs/verification/gmail-account-repair-published-20261108.json](docs/verification/gmail-account-repair-published-20261108.json).

# Dependencias comerciales pendientes

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

El bloqueo de ejecutor/publicación de84 está RESUELTO. Permanecen las limitaciones de hardware, login CargoTrack del titular y aceptación comercial global; no son permisos rutinarios pendientes de CargoTrack.

## Checkpoints anteriores — históricos, no sustituyen el bloque superior

## Bloqueo de publicación CargoTrack/PR85 · 08/11/2026

Código821ba13 y pruebas completos(1.558 por ejecución); paquete conectado89100d9 preparado/artifact13623149793. El bloqueo restante para enviar esta actualización es **infraestructura de ejecución de Codex**, no permisos de escritura GitHub ni una migración Supabase: incluso pwd devuelve `No usable execution environment`. El titular comunicó reconexión y el intento posterior devolvió el mismo error. El estado de entorno declara connected/capabilities[] y no hay capturas diagnósticas retenidas.

La web real sigue Sites32 en https://truckcontrolai.com. Netlify no contiene un sitio TruckControl; no cambiar proyectos ajenos, crear duplicados o mover DNS para forzarlo. El protocolo de Sites exige fuente exacta enviada por su Git autorizado antes de guardar/desplegar una versión. No trasladar su token a Actions ni usar un SHA/archive ajeno. Se ha preparado todo lo posible mediante GitHub/CI sin esa transmisión.

Acción imprescindible de infraestructura: un entorno que admita realmente ejecutar Git y el helper oficial. No volver a pedir los permisos GitHub/Supabase ya concedidos ni claves que no se necesitan. La reconexión indicada ya se intentó y no debe tratarse como autorización pendiente del propietario.

Limitaciones de verificación: perfiles Android/Windows emulados, sin hardware físico; la navegación CargoTrack se intercepta en pruebas y su sondeo público devuelve bot_blocked. No se eluden controles ni se certifica un login de proveedor. No son nuevos requisitos de contratación. Ver [recibo](docs/verification/cargotrack-logout-20261108.json).


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

### Dependencias vigentes

| Frente | Estado actual | Siguiente paso |
| --- | --- | --- |
| Supabase63 | Aplicada, fuente/ACL verificadas y contrato nativo PASS | Conservarla inmutable; no repetir aprobación ni DDL |
| Backend |7Edge existentes y3workers cerrados desplegados;11funciones con inbound3 | Integrar recibos y aceptar por separado los proveedores/transportes |
| Workers nuevos | Stripe fiscal1/PDF1/avisos1 con fuentes verificadas; negocio OFF | Aceptación real, transporte PDF y scheduler pendientes; sin activar a ciegas |
| Frontend | Público32 conservado; candidato nuevo sin promoción | Empaquetado/preview y verificación HTTPS con un ejecutor utilizable |
| Stripe y fiscalidad | Conector disponible y sandbox ELEVADANCOR seleccionado; backend sin credenciales seguras verificadas y0canales habilitados | Usar vías oficiales; pruebas firmadas, emisión/entrega válidas y aceptación comercial |
| Gmail público | Health configurado,0buzones empresariales vinculados; revisión pública pendiente | Completar el expediente y consentimiento real; configured no significa conectado |
| Recuperación/hardware |69checks lógicos aislados PASS; sin restore gestionado ni dispositivos físicos acreditados | Rama propuesta0.01344/h sin aprobación/creación; aceptar coste y destino antes de pruebas nuevas |
| Presupuesto |0compras y0IA de prueba nuevas en esta fase; total histórico desconocido | Conciliar facturas, sin inventar saldo disponible |

Las dependencias externas no detienen las tareas independientes. No se comparten secretos por chat ni se piden comandos al titular.

## Histórico conservado — no sustituye el estado vigente

## Estado nativo verificado · 8 de noviembre de 2026

Esta actualización prevalece sobre el histórico inferior. PR42 y PR60 están integrados; main4d6b09ee806ca92a90da620fb9d47123b6398bc5 conserva el candidato0.5.21-rc.1. **La web pública sigue v32/0.5.20-rc.1**, con v31 y demo6 recuperables; no confundir main con publicación.

**Supabase tiene62 migraciones.** La local20261108013000 corresponde a la remota20261108101437_manual_subscription_invoice_intake, Gitblob7504aca678710771ce550430cab5ab2b5f76068a y SHA2567323ded662cf8ec4560662a86c9224d21eb3d45ad4689caa919cf2638672da7b. Está APLICADA, su fuente coincide byte a byte y no debe editarse ni repetirse. La61 de proveedores/viajes20261108081848 permanece intacta. El contrato fiscal exacto pasó en Supabase y dejó cero usuarios, sesiones, operadores, pedidos, tareas, eventos, acciones, suscripciones y facturas sintéticos tras rollback; no hubo llamadas a proveedores ni correo. Se verifican permisos frescos, snapshot validado por operador, CAS/auditoría inmutable y mensualidades independientes. Es CAS de escritor obsoleto, sin prueba de carga concurrente nativa.

Head033b94f pasa ambos CI42469487926/42469491382: **1.292 controles** por ejecución (941unitarias/SQL en94archivos,45Python,72demo,50empresa,144SaaS,14candidata,20producción,6públicas), originales64/11hashes. Asesor sin hallazgos nuevos; permanecen dos INFO administrativos deny-all y el WARN previo de contraseñas filtradas que requiere plan de pago.

**Cobros y guard fiscal continúan apagados.** Los ocho perfiles IA de v32 conservan su aceptación; no repetir sus llamadas. La decisión GDTaller/TicketBAI es manual. El panel fiscal y conciliador están en código; PDF privado, bridge transaccional y avisos se preparan en PR66/67 y ramas independientes, con flags cerrados y sin declarar conexiones activas. Falta aceptación real Stripe/fiscal, Google público/Gmail empresarial, restore gestionado, hardware físico y revisión jurídica.

El ejecutor local sigue fallando; se trabaja por GitHub/CI/MCP. CLI oficial3.0.0 verificado por SRI ejecutó migration new en Actions42469793645 y generó la plantilla local20261108100352_manual_subscription_payment_and_documents.sql. **No es una63 aplicada**; integrar propuestas y probar antes de cualquier DDL. No crear proyectos duplicados, no tocar FIXPilot ni trasladar secretos a GitHub.

Presupuesto agregado200EUR, sin nuevas compras o llamadasIA; gasto histórico y saldo real no conciliados. LímiteIA10USD/mes y cuota100/empresa preservados. Existe una automatización horaria actualizada; no duplicarla ni afirmar ejecución continua. Recibo: docs/verification/manual-fiscal-native-20261108.json; inventario62: docs/deployment/remote-migrations-20261108-manual-fiscal.json. Evidencia durable en issue3 comentario6720303851 e issue41 comentario6720304629.

| ID      | Estado comprobado                                                                                                                           | Desbloqueo mínimo                                                                                        | Coste y límites                                                                                                |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| PAY-01  | Stripe disponible, no conectado. Invitación previa reciente; el flujo exige petición expresa para repetirla.                                | Titular: aceptar conexión oficial y completar identidad/contrato en Stripe. Se prepara sandbox primero.  | Conexión0EUR. Pagos/Billing variables según https://stripe.com/es/pricing; sin activar ventas todavía.         |
| TAX-01  | Decisión confirmada:GDTaller+TicketBAI manual. Contrato puro, todavía sin cola/panel/aviso nativo.                                              | Implementar flujo manual y aceptación con asesoría antes de cobros; no exigir API GDTaller para MVP.      | GDTaller existente,sin contratación nueva. Cobros/guard nativo siguen apagados hasta aceptación real.                      |
| GGL-01  | Revisión pública Gmail/CASA no acreditada; existe proyecto468881730124 y cliente OAuth.                                                     | Comprobar sesión autorizada y expediente; titular completa solo identidad/acuerdos que no pueda delegar. | Preparación gratuita; evaluación externa de pago necesita presupuesto confirmado dentro del techo.             |
| PLAY-01 | PWA publicada; APK debug y AAB unsigned verificados en CI. No firma comercial ni ficha Play.                                                                          | Comprobar cuenta Play existente; si falta, titular acepta acuerdo,verificación y pago oficial.           | Google publica25USD de alta una vez, posibles impuestos según checkout. https://play.google.com/console/signup |
| REC-01  | Copia cifrada de empresa y restauración lógica aislada probadas; no backup integral alojado ni recuperación Auth/Storage/secretos completa. | Acceso seguro de mantenimiento y destino aislado con coste conocido; prueba de recuperación.             | No contratar otro proyecto ni prometer PITR/SLA sin verificar.                                                 |
| HW-01   | Android/Windows y voz probados por emulación; no dispositivos físicos conectados.                                                           | Dispositivo o laboratorio autorizado si está disponible.                                                 | No se compra hardware automáticamente.                                                                         |

No se envían secretos al chat ni se piden comandos al titular. Cada dependencia se reevalúa al recibir su autorización. El registro web ya está abierto, pero los cobros permanecen bloqueados hasta verificar la facturación real. Billing/subscriptionsv11 incorporan guard fiscal cerrado; sus verificaciones de fuentes y GET405 no acreditan un pago.

08/11:la aprobación Supabase se recibió,la migración20261108081848 se aplicó una vez y el contrato nativo pasó; ese paso ya no está bloqueado. Entorno local:no recupera ERS,se continúa por conectores/CI. Android:CI8/9 SUCCESS con5JVM,lint y manifiesto compilado; SDK24mínimo/36objetivo y Gradle9.8.2. Firma comercial,DAL,dispositivos físicos y Play pendientes. Las aprobaciones de Google/Stripe restantes no se repiten sin nueva respuesta del titular.
