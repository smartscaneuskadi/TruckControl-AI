## Cuenta y Gmail publicados · Sites39 · 08/11/2026 UTC

Este checkpoint prevalece sobre los estados históricos inferiores. https://truckcontrolai.com está en Sites39/app0.5.21-rc.1, fuente `f861e42ece8ba7c83b42f493be611814113058c3`, despliegue `appgdep_6af1039c6574819182741d8ae52e14a5` SUCCEEDED. PR98 fusionado en `89ef16115c2a52492c270922370c9f43eb09d592`; Sites38 y demo6 conservados. Main mantiene el manifiesto DEMO: no publicarlo como producción.

Completado: Cuenta visible en barra; salida accesible; tarjeta de cuenta antes de Apariencia; retorno de demo a administración con sesión verificada; validación Google antes de guardar/iniciar OAuth; comprobación de configuración efectiva incluso cuando es inválida.

Gmail personal conserva la aceptación del titular. Gmail empresarial NO está conectado: Google rechaza la credencial guardada con401/`invalid_client`. No pedir repetir el consentimiento ni recrear proyecto/cliente. Hace falta un secreto válido del mismo cliente existente mediante el formulario privado. La validación de credenciales no acredita permiso de buzón ni verificación pública de Google. Issue97 sigue abierto.

Pendiente: consentimiento empresarial real tras una credencial válida, revisión pública de Google, dispositivos físicos y gates comerciales existentes. No activar cobros ni repetir consumo IA.

Recibo durable: [docs/verification/gmail-account-repair-published-20261108.json](docs/verification/gmail-account-repair-published-20261108.json).

# Plan de ejecución comercial

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

- [x] Recuperar ejecutor y conservar refs/código existentes.
- [x] Integrar85 y transmitir/publicar891 en Sites33.
- [x] Comprobar HTTPS, CargoTrack, salida, offline y rutas privadas en el bundle público.
- [ ] Hardware físico Android/Windows cuando exista acceso autorizado.
- [ ] Aceptaciones comerciales independientes: Stripe/fiscal, Google público, recuperación gestionada y revisión jurídica.

## Checkpoints anteriores — históricos, no sustituyen el bloque superior

## Prioridad CargoTrack/logout · 08/11/2026

- [x] Reutilizar issue84, rama y PR85, conservando3057a37.
- [x] Acceso oficial HTTPS en otra pestaña, sin credenciales ni API CargoTrack.
- [x] Cierre SDK, antidoble, mensaje de fallo remoto y regreso al acceso.
- [x] Bloqueo de estados privados, BFCache, operaciones tardías y copia abierta en otra pestaña; conservar cifrado/cola.
- [x] Ambos CI de fuente821ba13:1.558 controles;64 originales/11hashes.
- [x] Paquete conectado de producción89100d9 y recibo SHA256, sin publicar.
- [ ] Integrar PR85 al head cuyos checks estén correctos.
- [ ] Recuperar ejecutor operativo: la reconexión comunicada no resolvió No usable execution environment.
- [ ] Enviar fuente exacta al Git de Sites y publicar el mismo archivo en el proyecto de producción.
- [ ] Verificar HTTPS/CargoTrack/logout/PWA en la web nueva; conservar32/31/demo6.
- [ ] Pruebas físicas Android/Windows cuando existan dispositivos autorizados.

No abrir cobros ni promover los PR82/83/87/88 dentro de esta entrega. [Procedimiento](docs/CARGOTRACK.md).


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

### Plan vigente por dependencias

- [x] Integrar PR75 con el CI del head exacto y conservar el historial.
- [x] Aplicar63 una vez, verificar fuente/ACL y completar contrato nativo con rollback.
- [x] Actualizar los7Edge existentes y verificar todas sus fuentes runtime.
- [x] Guardar los4recibos nativo/Edge e inventario63 en PR80.
- [ ] Integrar los recibos y este checkpoint solo tras CI verde del head exacto.
- [x] Desplegar y verificar los3workers nuevos manteniendo sus flags OFF.
- [ ] Proveer credenciales por vías oficiales y aceptar su funcionamiento real autorizado antes de habilitar negocio.
- [ ] Publicar candidato web aislado, contrastar artefactos/HTTPS/PWA y promover solo una versión estable.
- [ ] Completar Stripe de prueba y aceptación fiscal/manual/entrega real antes de habilitar cobros.
- [ ] Completar Google público y consentimiento empresarial real, sin bloquear el uso básico.
- [ ] Aceptar recuperación gestionada, dispositivos físicos, firma/Play y revisión jurídica.
- [ ] Conciliar gastos y saldo reales sin superar el techo agregado200EUR.

Las tareas históricas ya superadas no deben reabrirse por sus estados anteriores.

## Histórico conservado — no sustituye el estado vigente

## Estado nativo verificado · 8 de noviembre de 2026

Esta actualización prevalece sobre el histórico inferior. PR42 y PR60 están integrados; main4d6b09ee806ca92a90da620fb9d47123b6398bc5 conserva el candidato0.5.21-rc.1. **La web pública sigue v32/0.5.20-rc.1**, con v31 y demo6 recuperables; no confundir main con publicación.

**Supabase tiene62 migraciones.** La local20261108013000 corresponde a la remota20261108101437_manual_subscription_invoice_intake, Gitblob7504aca678710771ce550430cab5ab2b5f76068a y SHA2567323ded662cf8ec4560662a86c9224d21eb3d45ad4689caa919cf2638672da7b. Está APLICADA, su fuente coincide byte a byte y no debe editarse ni repetirse. La61 de proveedores/viajes20261108081848 permanece intacta. El contrato fiscal exacto pasó en Supabase y dejó cero usuarios, sesiones, operadores, pedidos, tareas, eventos, acciones, suscripciones y facturas sintéticos tras rollback; no hubo llamadas a proveedores ni correo. Se verifican permisos frescos, snapshot validado por operador, CAS/auditoría inmutable y mensualidades independientes. Es CAS de escritor obsoleto, sin prueba de carga concurrente nativa.

Head033b94f pasa ambos CI42469487926/42469491382: **1.292 controles** por ejecución (941unitarias/SQL en94archivos,45Python,72demo,50empresa,144SaaS,14candidata,20producción,6públicas), originales64/11hashes. Asesor sin hallazgos nuevos; permanecen dos INFO administrativos deny-all y el WARN previo de contraseñas filtradas que requiere plan de pago.

**Cobros y guard fiscal continúan apagados.** Los ocho perfiles IA de v32 conservan su aceptación; no repetir sus llamadas. La decisión GDTaller/TicketBAI es manual. El panel fiscal y conciliador están en código; PDF privado, bridge transaccional y avisos se preparan en PR66/67 y ramas independientes, con flags cerrados y sin declarar conexiones activas. Falta aceptación real Stripe/fiscal, Google público/Gmail empresarial, restore gestionado, hardware físico y revisión jurídica.

El ejecutor local sigue fallando; se trabaja por GitHub/CI/MCP. CLI oficial3.0.0 verificado por SRI ejecutó migration new en Actions42469793645 y generó la plantilla local20261108100352_manual_subscription_payment_and_documents.sql. **No es una63 aplicada**; integrar propuestas y probar antes de cualquier DDL. No crear proyectos duplicados, no tocar FIXPilot ni trasladar secretos a GitHub.

Presupuesto agregado200EUR, sin nuevas compras o llamadasIA; gasto histórico y saldo real no conciliados. LímiteIA10USD/mes y cuota100/empresa preservados. Existe una automatización horaria actualizada; no duplicarla ni afirmar ejecución continua. Recibo: docs/verification/manual-fiscal-native-20261108.json; inventario62: docs/deployment/remote-migrations-20261108-manual-fiscal.json. Evidencia durable en issue3 comentario6720303851 e issue41 comentario6720304629.

La lista se cierra con evidencias; una interfaz o un flag no acredita una conexión.

## P0 · seguridad y contratación

- [x] Recuperar main3bbec3c, crear rama y bundle completo verificado.
- [x] Consultar estado nativo sin leer secretos ni datos de clientes.
- [ ] Conciliar costes históricos y proteger el máximo agregado200EUR.
- [x] Corregir documentación de portada y publicar matriz verificable de capacidades.
- [ ] Conectar Stripe por flujo oficial, comprobar sandbox/webhooks y cancelaciones.
- [x] Confirmar decisión del emisor:GDTaller+TicketBAI manual inicial,documentada en PR47/48.
- [ ] Implementar y aceptar cola transaccional,panel,PDF privado,aviso y conciliación de facturación manual antes de ventas.
- [ ] Resolver permisos y requisitos externos Google/Gmail/Play sin eludirlos.

## P1 · producto y explotación

- [x] Maestro de proveedores y relaciones autorizadas por empresa; aceptación nativa verificada,frontend pendiente de promoción.
- [x] Ingresos/gastos vinculados al viaje,margen revisable y copias v4 sin duplicar apuntes; aceptación nativa correcta.
- [ ] Revisar incidencias/asignaciones, viajes internacionales y exportaciones.
- [ ] Detección explicable de consumos anómalos; estimaciones preventivas con datos suficientes, sin fingir predicción de averías.
- [ ] Sugerencias de rutas con fuente y límites; no anunciar optimización GPS sin proveedor real.
- [ ] Monitorización automática con alertas de fallo y sin secretos/datos personales en logs.
- [ ] Recuperación integral: origen/copia/destino aislados y prueba de base, Auth, documentos y configuración.
- [ ] Android: identidad, clave protegida recuperable, APK/AAB firmado, asociación de dominio, pruebas y entrega Play autorizada.

## P2 · aceptación y lanzamiento

- [x] Pruebas nuevas de proveedores/viajes/copias: unitarias,SQL,integración,permisos y extremo a extremo; aceptación nativa con rollback.
- [x] CI del código head1866f8d:1.194 controles y5JVM Android adicionales, todos correctos.
- [ ] CI del checkpoint documental final, candidato aislado y archivos publicados contrastados.
- [ ] Registro/recuperación/correo mediante cuentas controladas autorizadas, sin clientes ficticios presentados como reales.
- [ ] Revisión legal/contratos/ficha Play del titular y revisión externa cuando corresponda.
- [ ] Producción comercial completa, versión Android publicada, gasto/saldo conciliados e informe final.

La frase de publicación comercial completada solo se utiliza tras verificar estos requisitos. Una dependencia externa no impide avanzar en las demás filas.

Proveedores y vínculos/revisiones de viaje,copias v4:aceptación nativa correcta y frontend pendiente de publicación. Monitor:workflow real verde,horario pendiente de integración en main. Android:APK debug/AAB unsigned construidos y verificados; firma comercial,DAL,dispositivos físicos y Play pendientes.

Actualización08/11:Supabase61,contrato nativo y rollback correctos; no repetir migración. Conservar main7d47ee9 y sus controles. Android minSdk24/API36 con Gradle9.8.2:compilación,lint,5JVM y manifiesto compilado correctos; publicación final pendiente. La pregunta anterior de proveedor fiscal queda resuelta por la decisión de GDTaller/TicketBAI. Ver recibo comercial para recuentos y límites.
