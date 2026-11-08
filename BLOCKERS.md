# Dependencias comerciales pendientes

## Revisión CargoTrack integrado · 08/11/2026

La nueva petición del titular sustituye el acceso en pestaña por una vista dentro de TruckControl. Implementación en feature/cargotrack-embedded-session, sin publicar todavía: iframe oficial por acción explícita, conservado fuera de Routes; reinicio al salir/cambiar empresa y sin capturar contraseñas. La sesión/caducidad pertenecen al proveedor; no se afirma autenticación por cargar la vista.

Preview real Android/Windows: formulario oficial visible y mismo documento al volver desde Resumen, sin introducir credenciales. La prueba restablece únicamente el almacenamiento particionado de Chrome que Playwright desactiva. Ver docs/CARGOTRACK_EMBEDDED.md y docs/verification/cargotrack-embedded-preview-20261108.json. Producción continúa33 hasta CI/promoción/aceptación HTTPS. Conservar33/32/31 y demo6; no migrar ni repetirNative63/#37; gastos/IA nuevos0, cobrosOFF. Las notas inferiores de «sólo enlace externo» describen la versión anterior, no esta nueva petición.


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
