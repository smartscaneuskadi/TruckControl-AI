# Despliegue y recuperación

## Publicación CargoTrack y Cerrar sesión verificada · 08/11/2026

**Este bloque sustituye el estado de publicación y ejecutor de las notas históricas inferiores.** Producción **Sites33 / app0.5.21-rc.1**, https://truckcontrolai.com; source **89100d92c0b44d2b86c1495faffcab2944abacbb**, deploy **appgdep_6af0a4fe4ec881919f08b7ac80cda8d9 SUCCEEDED**. PR85 integrado en main1d3e88e; no volver a fusionarlo ni reconstruir CargoTrack/logout. Se conservan32/31 y demo6. Main mantiene el manifiesto de demo: no desplegarlo como producción.

Ejecutor recuperado: shell, Git, descarga y Chromium funcionan. La red del sandbox no alcanza el proxy; el mismo comando por la escalada oficial funciona con proxy/CA heredados y TLS activo. No pedir al titular otra reconexión ni exportar credenciales a Actions. Copia Git de todos los refs locales verificada antes del fetch; sin reset ni sobrescritura. Fuente exacta enviada por Git de Sites y leída de vuelta, después save/deploy del archivo de Actions42496353868, artifact13623149793.

**Pruebas:** CI completo de release42496353761 y PR42497386164/42497390339 SUCCESS,1.558 comprobaciones por ejecución; postmerge42498406754 SUCCESS;64 originales/11hashes conservados. Después de publicar: **75/75 hashes HTTPS**, **6/6 perfiles públicos** en3orígenes y **16/16 casos CargoTrack/logout** sobre el bundle publicado,0fallos/omisiones/flaky. Las16 pruebas usan SDK real y transporte HTTP ficticio; comprueban doble pulsación, rechazo remoto honesto, Atrás/recarga/BFCache, copia cifrada y logout entre pestañas. No certifican una sesión nativa de un cliente. Android/Windows emulados, sin hardware físico ni login CargoTrack real.

Sin DDL, cambios Edge, compras ni llamadas IA nuevas; Native63/#37, aislamiento y cuotas10USD/mes–100llamadas/empresa intactos. Cobros reales y lanzamiento comercial global siguen cerrados/pendientes. Presupuesto histórico y saldo200EUR sin conciliar. PR82/83/87/88 permanecen separados. La automatización existente se observó pausada; no prometer ejecución continua.

Evidencia durable: [recibo v33](docs/verification/cargotrack-v33-published-20261108.json); hashes y perfiles detallados enlazados dentro. Antes de una nueva entrega, volver a consultar main, PR y versión pública actuales; no promover891 ni32 si hay avances posteriores.

Recuperación: si una regresión nueva lo justifica, volver a desplegar la versión guardada32 `appgprj_6ae655e56db481918fe18adfe9df8b66~appgver_3b00f4822e408191b957e7b7189bddcc` mediante Sites y verificar HTTPS. No se ha ejecutado rollback por rutina.31 permanece de reserva. No cambiar Netlify/DNS. El tar original SHA25670275a8304501c81432dbfeae66e6c6ac5508772e424d97cdae9525e62cbb70c y el tar normalizado por Sites tienen hashes distintos documentados; la prueba75/75 acredita los bytes dist servidos.

## Checkpoints anteriores — históricos, no sustituyen el bloque superior

## CargoTrack y salida segura · paquete preparado, sin desplegar · 08/11/2026

Producción verificada en Sites32/0.5.20-rc.1, https://truckcontrolai.com; fuente30b39be58e5ec19e417f819e00f2e579ec2abe7d. Respaldo31 y demo6 conservados. No existe sitio TruckControl en la conexión Netlify.

Fuente funcional821ba13 del PR85 pasa ambos CI(1.558 por ejecución). Release `deploy/cargotrack-production-20261108` / `89100d92c0b44d2b86c1495faffcab2944abacbb` sólo añade preparación del paquete/manifiesto correcto/documentación. Conserva821 y32 como padres, sin duplicar funcionalidades ni sustituir el manifiesto de demo en main.

[Archivo de producción todavía NO PUBLICADO](https://github.com/smartscaneuskadi/TruckControl-AI/actions/runs/42496353868/artifacts/13623149793),25archivos dist,tar1.233.512bytes. SHA256 tar: `70275a8304501c81432dbfeae66e6c6ac5508772e424d97cdae9525e62cbb70c`; ZIP de Actions: `20e1bd0be9efaa0733a7b63269b784e007af4be81082a55a30a8acd316c3825f`. Retención hasta15/11/2026; si caduca, reconstruir desde la fuente verificada. El build es production/conectado/working tree limpio; usa exclusivamente configuración ya pública de32, mantiene cobrosOFF y no recibe secretos de conectores.

Falta transporte de fuente y publicación porque el ejecutor devuelve No usable execution environment, aun tras reconexión del titular. Cuando funcione, inspeccionar checkouts y estado Git sin resetear trabajo, utilizar el acceso efímero de Sites sólo mediante su helper/entrada privada, respetar cualquier fuente aún no publicada y enviar el commit exacto correspondiente al archivo. No forzar historia ni atribuir el archivo891 a otro SHA. Guardar y desplegar en appgprj_6ae655e56db481918fe18adfe9df8b66 sólo tras checks verdes/PR integrado; comprobar estado, HTTPS, headers/PWA y recorridos nuevos después. Mantener32/31 y demo6. El paquete aislado candidato no sirve para este paso.

[Procedimiento detallado](docs/CARGOTRACK.md) · [evidencia](docs/verification/cargotrack-logout-20261108.json). No se ha publicado una33 ni abierto cobros por crear el archivo.


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

### Backend existente desplegado en este corte

| Función | Versión ACTIVE | Fuentes runtime verificadas |
| --- | ---: | ---: |
| company-auth |5 |3 |
| truckcontrol-billing |13 |7 |
| truckcontrol-subscriptions |13 |8 |
| company-gmail |14 |8 |
| company-mail |13 |12 |
| company-copilot |3 |10 |
| company-assistant |11 |7 |

`company-mail-resend`v3 permanece intacta con autorización firmada propia. Los archivos Deno enviados como configuración no se cuentan como runtime cuando el servicio no los devuelve en el bundle. La verificación de inicio no es aceptación de un proveedor ni consentimiento OAuth.

El frontend sigue Sites32/app0.5.20-rc.1, fuente30b39be58e5ec19e417f819e00f2e579ec2abe7d. No hay nueva URL comercial ni versión33 publicada en este corte. Conservar v31/demo6 y el staging independiente. El candidato y la copia de producción usan identidades distintas del manifiesto de demo que sigue en main.

La63 quedó aplicada antes de actualizar los7Edge, después de CI y aprobación oficial. Su contrato nativo ya está completado: no reaplicar para desplegar funciones. Los3workers nuevos ya están desplegados y verificados, con negocio OFF y aceptación real pendiente. El scheduler de avisos no está creado.


### Workers desplegados con negocio OFF

| Función | Versión nativa | Fuentes runtime verificadas |
| --- | ---: | ---: |
| truckcontrol-stripe-fiscal |1 |7 |
| company-manual-invoices |1 |3 |
| truckcontrol-manual-invoice-notices |1 |2 |

Que el recurso nativo figure ACTIVE solo indica despliegue técnico: no acredita credenciales, consentimiento, cobro, emisión fiscal, bytes PDF o entrega de mensajes. El modo test nunca se reclama para envío y no hay scheduler de avisos. Se mantienen todas las barreras comerciales.

## Histórico conservado — no sustituye el estado vigente

## Estado nativo verificado · 8 de noviembre de 2026

Esta actualización prevalece sobre el histórico inferior. PR42 y PR60 están integrados; main4d6b09ee806ca92a90da620fb9d47123b6398bc5 conserva el candidato0.5.21-rc.1. **La web pública sigue v32/0.5.20-rc.1**, con v31 y demo6 recuperables; no confundir main con publicación.

**Supabase tiene62 migraciones.** La local20261108013000 corresponde a la remota20261108101437_manual_subscription_invoice_intake, Gitblob7504aca678710771ce550430cab5ab2b5f76068a y SHA2567323ded662cf8ec4560662a86c9224d21eb3d45ad4689caa919cf2638672da7b. Está APLICADA, su fuente coincide byte a byte y no debe editarse ni repetirse. La61 de proveedores/viajes20261108081848 permanece intacta. El contrato fiscal exacto pasó en Supabase y dejó cero usuarios, sesiones, operadores, pedidos, tareas, eventos, acciones, suscripciones y facturas sintéticos tras rollback; no hubo llamadas a proveedores ni correo. Se verifican permisos frescos, snapshot validado por operador, CAS/auditoría inmutable y mensualidades independientes. Es CAS de escritor obsoleto, sin prueba de carga concurrente nativa.

Head033b94f pasa ambos CI42469487926/42469491382: **1.292 controles** por ejecución (941unitarias/SQL en94archivos,45Python,72demo,50empresa,144SaaS,14candidata,20producción,6públicas), originales64/11hashes. Asesor sin hallazgos nuevos; permanecen dos INFO administrativos deny-all y el WARN previo de contraseñas filtradas que requiere plan de pago.

**Cobros y guard fiscal continúan apagados.** Los ocho perfiles IA de v32 conservan su aceptación; no repetir sus llamadas. La decisión GDTaller/TicketBAI es manual. El panel fiscal y conciliador están en código; PDF privado, bridge transaccional y avisos se preparan en PR66/67 y ramas independientes, con flags cerrados y sin declarar conexiones activas. Falta aceptación real Stripe/fiscal, Google público/Gmail empresarial, restore gestionado, hardware físico y revisión jurídica.

El ejecutor local sigue fallando; se trabaja por GitHub/CI/MCP. CLI oficial3.0.0 verificado por SRI ejecutó migration new en Actions42469793645 y generó la plantilla local20261108100352_manual_subscription_payment_and_documents.sql. **No es una63 aplicada**; integrar propuestas y probar antes de cualquier DDL. No crear proyectos duplicados, no tocar FIXPilot ni trasladar secretos a GitHub.

Presupuesto agregado200EUR, sin nuevas compras o llamadasIA; gasto histórico y saldo real no conciliados. LímiteIA10USD/mes y cuota100/empresa preservados. Existe una automatización horaria actualizada; no duplicarla ni afirmar ejecución continua. Recibo: docs/verification/manual-fiscal-native-20261108.json; inventario62: docs/deployment/remote-migrations-20261108-manual-fiscal.json. Evidencia durable en issue3 comentario6720303851 e issue41 comentario6720304629.

## Ampliación nativa verificada · 08/11

Supabase61 migraciones. Local20261107145959 → remota20261108081848,company_suppliers_and_trip_allocations; SHA256 nativo exacto e78473c5cd859d17e70d5903c1314ceea663db74969ea78d60e75363e8daa784. No editar/reaplicar. Ensayo nativo con rollback completado; datos existentes conservados.

Frontend público sigue32/0.5.20-rc.1; el código nuevo0.5.21-rc.1 aún no se ha promovido. Android candidato compilado y verificado en CI8/9,con minSdk24/API36 y Gradle9.8.2; no hay Play ni firma comercial. Main7d47ee9 incorporado en el head1866f8d,con CI447/448 SUCCESS. El entorno ERS no está disponible; no inventar empaquetado,despliegue o pruebas locales. Reanudar desde los commits remotos y preservar el worktree.

Billing/subscriptions nativos v11:guard fiscal cerrado compilado,5/6fuentes exactas y GET405 verificados. No cambia pagos apagados ni acredita checkout. Conservar el resto de servicios y las fuentes de recuperación v10; no volver a desplegar sin cambios.

## Producción que se conserva

- URL principal: https://truckcontrolai.com.
- Sites: `appgprj_6ae655e56db481918fe18adfe9df8b66`, versión32/app0.5.20-rc.1.
- Fuente congelada: `30b39be58e5ec19e417f819e00f2e579ec2abe7d`.
- Despliegue: `appgdep_6aeef12e3624819185ab700077042c21`.
- Supabase exclusivo: `kkkemaycedexymrpaqtp`, truckcontrol-ai,61 migraciones. FIXPilot separado.
- Demo6: https://truckcontrol-ai-fase-1.earlymug513.chatgpt.site; otro proyecto, no sobrescribir.
- Staging2 owner-private: [inventario](docs/deployment/ai-specialists-staging.json).

El manifiesto de main conserva la identidad de la demo. Solo el checkout de despliegue autorizado utiliza el proyecto de producción. El remote github es el repositorio oficial; no empujar producción al origin de demo.

## Siguiente promoción

1. Cambios aislados en feat/commercial-completion-20261107,commits y PR; no reescribir historial.
2. Migraciones aditivas creadas con CLI, contrastando nombre/version/hash remoto antes de cada aplicación. No db push a ciegas.
3. Comprobar contratos nativos,roles,aislamiento,costes,compilación y CI del head exacto.
4. Publicar candidato separado y probarlo. No presentar proveedores simulados como activos.
5. Guardar versión y fuente de recuperación antes de promocionar; conservar audiencias y credenciales.
6. Verificar HTTPS,sourceCommit,archivos por hash,registro y funciones reales autorizadas sobre la versión publicada.

Android/Play es una entrega independiente de la PWA. No declarar publicado por generar un AAB. La venta comercial requiere facturación y cobros verificados y revisión del titular cuando corresponda.

Recuperación web: conservar v31/v32 y fuentes; no revertir una migración aditiva ni borrar clientes para ensayar. El backup de registros no sustituye la recuperación integral del servicio: [alcance actual](docs/COMPANY_RECOVERY.md).
