## Actualización49 publicada y verificada · 16/11/2026 UTC

Vigente **https://truckcontrolai.com · Sites49 / 0.5.30-rc.1**, fuente `5f44a164700ea4cc803bb7cf480b664cce68af43`, despliegue `appgdep_6aface4569a48191ab5bd6c0008d40d2` SUCCEEDED. PR153 integrado en `3c1fe69486fe5eee5d15059de79f2f10ed87c5bb`. **Facturación → Ingresos/Gastos** permite Factura/Ticket/Albarán. Camiones y conductores incorporan originales múltiples, tipo/descripcion libre y vencimiento; fichas técnicas, identidad y permisos tienen categorías propias. Se conservan archivos con nombre repetido como originales distintos. Los movimientos históricos, importes, IVA y rentabilidad permanecen intactos.

Todas las CI finales de head4e08dfe y fuente5f44 SUCCESS. Por ejecución: **2035 unitarias/SQL,154Python,94demo,62empresa,274SaaS,98MFA,44FULL,68adjuntos/idiomas,20candidata,20producción y6perfiles del público previo**. Los64 originales/11 hashes intactos. PostgreSQL524controles/45contenciones/2restoreslógicos, incluyendo42controles y2carreras nuevos. Después de publicar: **68/68recorridos,105/105hashes HTTPS,6/6PWA,5/5salud y2/2denegaciones RPC anónimas**, sin fallos/omisiones/flaky. Aplicación/SDK publicados con HTTP privado ficticio bloqueado; emulación, sin nuevos modelos, buzones, cuentas gestionadas o hardware. Se conservan diagnósticos y sus correcciones, incluidas las etiquetas accesibles de la biblioteca original.

Supabase **76**, `20261116085827_billing_document_attachments`, SHA `1e93388efd2a890d73a1ca0839a27ff4fe39008c10f019d23e40d10c34bebfd3`, aplicada oficialmente una sola vez; bytes yMD5 iguales al historial. **No repetir76/75/74/anteriores/#37 ni editar SQL aplicado.** RLS por empresa y módulo financiero, bucket privado, sesión/SID/MFA y cache de permisos revisados. OID/ACL/verificador nativo y datos conservados; registroON/enforceON/cobrosOFF;0WARN/ERROR+3INFO deny-all. Los RPC anteriores siguen compatibles, y las copias6/4 leen formatos previos. Recuperar con frontend47/48 manteniendo76; no retirar columnas/datos.

Se conservan47 y **48 solo guardada como recuperación**, además de demo6 independiente. Main conserva manifiestoDEMO: no desplegar su build genérico como producción. No se activan cobros. Sin compras, compromisos o llamadas nuevas a IA; límites10USD/mes–100/empresa intactos y techo200EUR histórico sin conciliar. El propietario asume legal, ventas/facturación manual y pruebas físicas; Stripe LIVE no bloquea este modelo manual. WrapperAndroid9 compila, sin firma comercial/Play. Esta entrega acredita las funciones publicadas; no inventa aceptaciones externas de Google, recuperación gestionada o dispositivos.

[Guía de uso](docs/FINANCE_AND_ENTITY_DOCUMENTS.md). [Recibo completo](docs/verification/billing-attachments-published49-20261116.json). Las entradas siguientes conservan el historial de candidatas y publicaciones anteriores.

### Diagnóstico CI de la candidata722 y correcciones

La suite completa unitaria/SQL pasó **2035/2035** y Python154 en43831399946. El navegador genérico pasó92/94: los dos fallos revelaron la pérdida del aria-label explícito del selector de camión en la biblioteca; se restauran sus etiquetas accesibles sin cambiar el recorrido ni el test. La prueba original repetida sin modificación pasa2/2 (Windows/Android), con persistencia, PDF válido, bytes, Axe y cero envíos externos. PG43831399729 rechazó el nuevo seed por colisión de teléfono con otra fixture: se cambia únicamente el rango ficticio reservado de la nueva fixture, conservando la restricción de unicidad y los datos históricos. La carga junto a la fixture previa acepta4/4 y conserva la negativa del rango anterior. La migración SQL76 mantieneSHA1e93388e…bebfd3. Estos fallos se conservan; **la CI del nuevo commit aún no ha terminado**.

## Facturación y documentos por ficha · Supabase76 aplicada · 16/11/2026 UTC

Nueva prioridad del propietario implementada en `feat/billing-attachments-20261116`, candidata **0.5.30-rc.1 / Android9**. Facturación agrupa Ingresos y Gastos con Factura/Ticket/Albarán; archivos independientes por movimiento guardado, camión y conductor con tipo, descripción libre, vencimiento y subidas repetibles. Sin cambios de importes, IVA o rentabilidad; históricos sin clasificación conservados. Se reutilizan documentos, permisos y sincronización existentes.

**Supabase76 aplicada oficialmente una sola vez:** `20261116085827_billing_document_attachments`, SHA256 `1e93388efd2a890d73a1ca0839a27ff4fe39008c10f019d23e40d10c34bebfd3`; MD5 y25.144bytes remotos idénticos al SQL probado. Solo se reconcilia su nombre local; **no repetir76/75/74/anteriores ni editar el SQL aplicado**. Producción todavía sigue Sites47 /0.5.29-rc.1; recuperación48 solo guardada y demo6 intacta. La interfaz0.5.30 continúa candidata hasta completar CI y publicación. La candidata mantiene clientes47/48 mediante RPC versionados, originales privados, RLS por empresa y módulo financiero, y copias empresa6/demo4 con lectores anteriores. El cambio de tipo financiero requiere permiso anterior y nuevo; la revocación de Ingresos/Gastos invalida el registro documental y sus operaciones en vuelo.

Comprobado:108/108 pruebas focales finales (incluyen34 SQL nuevos y restauración aislada),154 Python,64/64 recorridos de navegador más4/4 casos finales de revocación de módulos;11 hashes retenidos intactos. La revisión independiente detectó y verificó el cierre de la reclasificación indebida:10/10 casos en el checkpoint anterior. La regresión SaaS completó273/274; el único caso de correo que alcanzó30s durante ejecución paralela supera2/2 repeticiones aisladas (Windows/Android), sin cambiar su código ni aserciones. Se conservan los fallos iniciales de Axe/traducción/fixtures y el timeout de restauración ya resuelto en la repetición aislada. CI general y PostgreSQL real siguen pendientes. No declarar SQL aplicada o publicación antes de su evidencia final.

PostgreSQL43833876155 SUCCESS:524 comprobaciones,45 contenciones reales y2 restauraciones lógicas; incluye42 comprobaciones de facturación, sin sumarlas de nuevo. Checkout ejecutadoe681e91 (mergePR153), árbol idéntico al head9af5fc9; ocho entradas canónicas coinciden con producción d3000ec. Validación nativa: RLS restrictiva y bucket privado, RPC nuevo denegado a anónimos y helper de actor inaccesible a clientes; OID/ACL y verificador de sesión conservados. RegistroON/enforceON/cobrosOFF,0WARN/ERROR+3INFO anteriores. No se reclasifican registros históricos.

Sin compras, cargos contratados ni llamadas nuevas a modelos. Límites IA10USD/mes–100/empresa intactos; Stripe/cobrosOFF. El propietario asume legal, ventas/facturación manual y pruebas físicas: no son barreras técnicas de esta entrega ni se presentan como realizadas. [Guía de uso y recuperación](docs/FINANCE_AND_ENTITY_DOCUMENTS.md). Continuidad en issue3 y `/workspace/artifacts/truckcontrol-billing-attachments-20261116/CHECKPOINT.json`.

## Actualización47 publicada y verificada · 16/11/2026 UTC

Vigente **https://truckcontrolai.com · Sites47 / 0.5.29-rc.1**, fuente `8884595c7436d0702b97a79f653a08e8d8f4ff4b`, despliegue `appgdep_6afa4acb4aa0819188f07f6196c6ec78` SUCCEEDED. PR149 integrado en `b64e7004ab7fbb6ec28d9e2a0d7192abde56bea1`. Configuración y Administración → **Seguridad de la cuenta** ofrecen TOTP nativo opcional. No se enrola ni cambia ninguna cuenta automáticamente. Los desafíos, sesiones, roles y FULL manual se comprueban conjuntamente; FULL desactivado/vencido sigue bloqueado aunque haya AAL2, y ningún administrador de empresa puede autoactivarlo.

**Las 7 CI finales SUCCESS**,1.941 unitarias/SQL,154 Python,98 MFA / 44 FULL / 274 SaaS y los64 originales/11 hashes intactos. Después de publicar: **222/222 recorridos** (94 MFA +44 FULL +76 regresión +8 Gmail),105/105 hashes HTTPS,6/6 PWA,5/5 salud y6/6 denegaciones Edge. Sin fallos/omisiones/flaky. Bundle/SDK reales y HTTP privado ficticio interceptado; no confundir estos recorridos con proveedor, cuenta gestionada o hardware reales. Backend canónico aislado192 TOTP +200 FULL +67 Recovery /481 PostgreSQL,43 contenciones y2 restauraciones se conserva mediante igualdad de 14 objetos/SQL. No repetir llamadasIA#37 ni ensayos de proveedores.

Supabase **75**, migración `20261115221404_optional_totp_session_protection` aplicada oficialmente una vez, SHA `b830a21224d64acffeb3dedc1938b8676aa131db4e4347914c35ea01fd387be7`. **No repetir75/74/73/68–72 ni editar SQL aplicado.** Registro ON/enforce ON/cobros OFF,0 WARN/ERROR y3 INFO deny-all. Main conserva manifiesto DEMO: no desplegarlo como producción. Se preservan46/45/32/31 y demo6. Tras admitir autenticadores la recuperación mantiene una UI compatible y el enforcement SQL: no usar una UI anterior a MFA. Compilación de recuperación con altasOFF probada 6/6 locales; Sites deduplica porSHA, por lo que otra copia guardada exige una fuente distinta. El seguimiento de copias posteriores está en issue3; la versión guardada más reciente no equivale a versión pública.

FULL manual sigue disponible; **Stripe OFF no bloquea el modelo inicial manual**. Sin nuevas compras, compromisos o llamadasIA; techo200 EUR histórico sin conciliar, límites IA de10 USD/mes y100/empresa intactos. Pendientes externos: Google/Gmail empresarial real, recuperación gestionada, firma/Play/dispositivos y revisión jurídica/fiscal. DKIM Migadu sigue SERVFAIL en ambos resolutores con CNAME propio correcto; no cambiar DNSSEC. Esta actualización segura no certifica el lanzamiento comercial global completo.

[Recibo y límites](docs/verification/optional-totp-full-published47-20261116.json).

## Suscripciones FULL manuales publicadas · Sites46 · 15/11/2026 UTC

Vigente https://truckcontrolai.com: **Sites46 / 0.5.28-rc.1**, fuente `4cb1e430fa5530c5b27b17e9dbb2515146d779ab`, despliegue `appgdep_6af9f64bacf88191bffa90e87f0a9b57` SUCCEEDED. PR150 integrado en `3af0fe44cbca9d54c5aa318ea2525cdf1b26ab7c`. **Superadministrador → Empresas** permite activar/desactivar FULL por empresa, vencimiento opcionalUTC, estados y auditoría inmutable, CAS/reintento acotado; no otorga FULL global al propietario ni permite autoactivación a administradores de empresa. OFF/expiración bloquean UI/RLS/RPC/Storage/procesos, conservando datos y administración global. Se conserva la copia cifrada y su cola, con vencimiento y revalidación antes de sincronizar.

Supabase **74**, `20261115170051_company_manual_full_licenses`, SQL SHA `ca675f4e25ac913b0e31475d72328378334b2430144d2261476bb6c89b214a0c`, aplicada oficialmente una vez. **No repetir74/73/68–72/#37.** RegistroON/enforceON/cobrosOFF;0WARN/ERROR+3INFO deny-all. Sin licencias o datos de clientes cambiados automáticamente. **Stripe LIVE deja de ser condición del lanzamiento inicial manual**; su implementación sigue apagada para aceptación futura. La licencia no representa un pago ni emite una factura fiscal.

CI exacta43743688733 y PR43743536849/43743541583 SUCCESS:1897unit/SQL,140Python,94demo,62empresa,274SaaS,44Full,20candidata,20producción y6perfiles públicos previos, por ejecución.64originales/11hashes intactos. Backend inalterado tras la corrección de arranque:200Full+67Auth/Storage y399PostgreSQL,4carreras nuevas/2restauraciones aisladas. Tras publicar: **93/93hashes HTTPS,128/128recorridos sin fallos/omisiones/flaky,6/6PWA,6/6denegaciones Edge y5/5salud**. SDK real/transporte privado ficticio; sin proveedores, datos reales ni nuevas llamadasIA. Se conserva45/44/32/31 ydemo6. Main mantiene manifiestoDEMO: no publicarlo como producción.

Gastos/compras/compromisos nuevos0; saldo histórico del techo200EUR sin conciliar. IA10USD/mes–100/empresa intacta. Android7 compila APKdebug/AAB sin firma comercial; no Play/hardware. Pendientes independientes: Google empresarial/público,restore gestionado,firma/Play/dispositivos y revisión externa. MFA149 opcional sigue borrador, no aplicada. Esta entrega publica y verifica **la suscripción manual**; no afirma el lanzamiento comercial global completo. Las copias desconectadas yURL ya emitidas conservan su lease/TTL; no se promete retirada retroactiva.

[Recibo y límites](docs/verification/company-manual-full-published46-20261115.json). [Guía de administración](docs/MANUAL_COMPANY_SUBSCRIPTIONS.md).

## Supabase73 aplicada oficialmente · 15/11/2026 14:31 UTC

**73 migraciones verificadas.** La aprobación oficial del titular aplicó una sola vez `20261115143030_subscription_reserved_quote_recovery`; SQL SHA256 `66ee43f73b8b0f6c5c329874d4a56c66f5e4409d5a8791ca7b1f3a5dfee0664d`, idéntico al candidato probado. El archivo local se renombra al timestamp remoto sin cambiar bytes. **No repetir73,68–72 ni#37.** Los estados anteriores «SQL73 pendiente» quedan como historia.

`tc_recurring_billing` conservaOID18420,SECURITYINVOKER yACL:anon/auth sinEXECUTE,service_role conEXECUTE. BodyMD5nuevo414a74828f8a133afc705ac84baea010. RegistroON/enforceON/cobrosOFF;0WARN/ERROR+2INFO deny-all. Fuente exacta previa43706778964 yPostgreSQL43706779034 SUCCESS; la reconciliación de nombre se verifica por separado, sin nueva llamada de pago/proveedor.

Sites45/0.5.27-rc.1 ydemo6 conservados; no nuevo desplieguefrontend. PR145 ya integrado en f1eee9f6825e0b89a178d0f264ebbbe2a66b4522 conCI43708812503/43708781307 SUCCESS; mejora independientePR146/c87a1bf preservada. El frenteMFA de#50 está en ramas candidatas con rolloutOFF, no activo. Persisten aceptaciones Stripe/fiscal,Google,restore gestionado,firma/hardware/jurídica. Sin cargos,contrataciones o llamadasIA nuevas; saldo200EUR histórico desconocido. No declarar lanzamiento comercial.

[Recibo y correspondencia nativa](docs/verification/supabase-migration-73-20261115.json).

## Actualización segura45 publicada y verificada · 15/11/2026 UTC

https://truckcontrolai.com: **Sites45 / 0.5.27-rc.1**, fuente `9dd41d99aadacda961eb772f60439297d6aaa4c5`, despliegue `appgdep_6af9940779a48191b144b16385a388f6` SUCCEEDED. PR144 integrado en `e9819a124e1621704970bea6d688ec9958a7de6a`; PR141/142 independientes conservados. Copiar la dirección privada de reenvío ya controla API ausente, error síncrono y reintento sin avisos antiguos. Misma dirección, permisos y economía.

CI exacta43706778964 y PR43706541846 SUCCESS: **1844 unitarias/SQL,132Python,94demo,62empresa,274SaaS,20candidata,20producción y6perfiles públicos previos**, por ejecución.64originales/11hashes intactos. PostgreSQL43706779034, recuperación Auth/Storage autohospedada67/67 y Android43706779003 SUCCESS. Android6/0.5.27 genera APK debug/AAB sin firma comercial; no Play ni hardware. Tras publicar: **75/75hashes HTTPS,84/84recorridos sin omisiones/flaky,6/6perfilesPWA,6/6denegaciones y5/5salud**. SDK real con transporte privado ficticio bloqueando tráfico no interceptado; no nueva aceptación de proveedores.

Supabase **72**, SQL73 **NO aplicada**: confirmación oficial caducada; historial/función8ba277d1.../OID18420/ACL intactos. No reaplicar68–72/#37 ni usar SQL/CLI para eludir la tarjeta. RegistroON, acceso exigido, cobrosOFF y0WARN/ERROR+2INFO deny-all. Gmail empresarial nativo:0conexiones; correo personal separado. Resend confirma dominio/receptor habilitados,5DNS verificados y firma igual a Vault, solo GET; sin mensajes o lectura de buzones. Destinos DKIM Migadu siguenSERVFAIL; no modificar DNSSEC.

Se conservan44/43/42/41/32/31 ydemo6. Main conserva manifiestoDEMO: **no publicarlo sobre producción**. Cargos/contrataciones/llamadasIA nuevos0; IA10USD/mes–100/empresa intacta. Saldo histórico del techo200EUR desconocido. Persisten puertas Stripe/facturaGDTaller válida/entrega,Google público/empresarial,restore gestionado,firma/Play/hardware y revisión externa. **Actualización segura pública; lanzamiento comercial completo pendiente**.

[Recibo y límites verificables](docs/verification/commercial-safe-update45-20261115.json).

## Continuación verificada · 14/11/2026 22:45 UTC

Main133 calidad43640320545 yPostgreSQL43640320581 SUCCESS; fuente compuesta5469313 también pasa. Por ejecución:1831unitarias/SQL en152archivos,131Python,94demo,62empresa,258SaaS,20candidata y20producción. SQL329=97+196+36;38contenciones reales y2restores lógicos. Auth/Storage aislados43637623308:67/67; compuesto43639165420 tambiénSUCCESS. Sin omitir64originales/11hashes; sin aceptación nueva de proveedores ni hardware físico. PR134 posterior se conserva sin atribuirle estos recuentos. [Recibo y límites](docs/verification/commercial-continuation-20261114.json).

## Actualización segura44 publicada y verificada · 14/11/2026 UTC

https://truckcontrolai.com: **Sites44 / 0.5.26-rc.1**, fuente `43f9b2215424eb58c7a980d25b516d7fd9f4051b`, despliegue `appgdep_6af8a1d3905c81919699fbc3108d44a8` SUCCEEDED. PR128 integrado en `dd2b5309f45cb4feb11d15a1d46f3796e6630bad`; PR127 independiente conservado en main y en esta entrega documental. Gmail importa adjuntos posteriores al quinto y protege reconexiones; Checkout guardado se recupera sin recrear otro pago.

CI exacta43622942100 y PR43622918927 SUCCESS:1799 unitarias/SQL,124Python,94demo,62empresa,258SaaS,20candidata y20producción;64originales/11hashes intactos. PostgreSQL:287controles,35contenciones reales y2restauraciones lógicas; no restore gestionado. Publicación:75/75hashes HTTPS,68/68recorridos sin omisiones/flaky,6/6perfilesPWA,6/6denegacionesbackend y5/5salud. SDK real con HTTP privado ficticio bloqueando tráfico no interceptado; no aceptación nueva de proveedores ni hardware físico.

Supabase **72 migraciones**;72=`20261114173557_gmail_sync_lease_fencing`, SHA idéntico al SQL probado y nombre local reconciliado. **No repetir68–72 ni#37**. Gmail19/subscriptions21 ACTIVE,20/20fuentes runtime iguales,respaldos18/20;0WARN/ERROR+2INFO deny-all. Registro abierto,accesoRLS conservado,cobrosOFF. Se conservan43/42/41/32/31 ydemo6. Android5/0.5.26 compila APK debug y AAB sin firma comercial; no Play/hardware.

Esta es una actualización pública segura; **no un lanzamiento comercial completo**. Pendientes aceptación NativeStripe/facturaGDTaller real/entrega,Google público/buzón empresarial,restore gestionado,firma/Play/dispositivos y revisión externa. Cargos/compromisos/llamadasIA nuevos0; techo200EUR acumulado sin saldo conciliado. IA10USD/mes–100llamadas/empresa intacta. Main conserva manifiestoDEMO: producción solo desde su checkout separado.

[Recibo y límites verificables](docs/verification/commercial-safe-update44-20261114.json).

## Actualización segura43 publicada y comprobada · 14/11/2026 UTC

https://truckcontrolai.com está en **Sites43 / app 0.5.25-rc.1**, fuente `bb161141c33e8692aab8c4efdaf8c4e359903a3d`, despliegue `appgdep_6af827b8dc48819182d18b8efefeafd4` SUCCEEDED. PR #121 integrado en `c233a3c7320a0e94150264b93545ad55365a11f6`; se conservan42, 41, anteriores y demo 6. [Recibo](docs/verification/commercial-safe-update43-20261114.json).

CI de rama43577388157, PR43577393538 y fuente exacta43578958439 SUCCESS: **1.729 unitarias/SQL,107 Python,94 demo,54 empresa,258 SaaS,20 candidata,20 producción y6 perfiles públicos previos por ejecución**;64 originales/11 hashes intactos. PostgreSQL43578958497 SUCCESS:250 controles(95+155),28 contenciones reales y2 restauraciones lógicas. Android43578958406 compila 5 JVM, APK debug y AAB sin firma comercial; no Play ni hardware. Después de publicar: **75/75 hashes HTTPS,60/60 recorridos públicos sin omisiones/flaky,6/6 perfiles PWA,6/6 denegaciones backend y5/5 salud**. SDK real con transporte privado ficticio y solicitudes nativas no interceptadas bloqueadas; no es una nueva aceptación de proveedores.

Supabase **71 migraciones**;70=`20261114083944` y71=`20261114084109` aplicadas una sola vez, SHA idénticos a CLI. **No repetir68–71 ni#37**. Subs20/incidents7 ACTIVE, runtime11/11 y15/15 igual al código, respaldos19/6; billing21/Gmail18/personal4 conservados.0 WARN/ERROR y1 INFO de RLS deny-all. Refresco canónico con sesión/CAS/auditoría/cupo 3 por 60 s, y revisión EFW Root informativa publicados; receptor EFW OFF. Registro abierto, enforce_access=true, cobros OFF/precios de ejemplo. El modelo manual GDTaller sigue confirmado, pero faltan aceptación Stripe→licencia→factura/entrega real, Google empresarial/público, recuperación gestionada, firma/Play/hardware y revisión externa. No declarar lanzamiento comercial completo.

No se iniciaron pagos, compras, compromisos recurrentes ni llamadas IA nuevas. Límite IA 10 USD/mes y100 llamadas/empresa intactos; histórico del techo de 200 EUR sin conciliar, saldo desconocido. Main conserva manifiesto DEMO: publicación solo desde checkout de producción. Continuidad en issue #3 y supervisión existente; no confundir supervisión con ejecución de desarrollo activa.

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

## Evidencia nueva · 11/11/2026 UTC

Head financiero2d9b1d6: CI43111232569/43111226706 SUCCESS,1400 unitarias/SQL,220/220 SaaS Android/Windows emulados,64 originales/11hashes conservados. Head conductor2c30c49:1285 unitarias/SQL y12/12 navegaciones. PostgreSQL17 job130827476749:117PASS con concurrencia y restauración lógica. Supabase nativo65:20/20 nuevas comprobaciones, fixtures anulados, auditoría/RLS/ACL/sesión revocada correctos. Edge incidentes1/fiscal2:19 fuentes ejecutables coinciden,GET405/POST503 apagado en ambos. El contrato de aceptación añadido pasa aislado; CI final de esa adición y Android nuevo PENDIENTES. No sumar reejecuciones ni confundir contratos offline de Stripe con webhooks reales. [Recibo](docs/verification/new-additions-native-20261111.json).

## Cuenta y Gmail publicados · Sites39 · 08/11/2026 UTC

Los **6/6 perfiles PWA públicos de Sites39** también han pasado después de publicar: tres orígenes, dos dispositivos emulados, ambos temas y demo offline. No se envió correo ni se autenticó un buzón real.

Este checkpoint prevalece sobre los estados históricos inferiores. https://truckcontrolai.com está en Sites39/app0.5.21-rc.1, fuente `f861e42ece8ba7c83b42f493be611814113058c3`, despliegue `appgdep_6af1039c6574819182741d8ae52e14a5` SUCCEEDED. PR98 fusionado en `89ef16115c2a52492c270922370c9f43eb09d592`; Sites38 y demo6 conservados. Main mantiene el manifiesto DEMO: no publicarlo como producción.

CI de PR42533025198, rama42533020536 y fuente exacta42533027609 SUCCESS: **1.664 comprobaciones por ejecución**, sin sumar reejecuciones. Se conservan las64 originales/11hashes. Después de publicar: **75/75 hashes HTTPS y 42/42 recorridos de navegador**, sin fallos, omisiones ni flaky. SDK real con transporte ficticio y accesos privados no interceptados bloqueados. Android/Windows emulados; sin hardware físico ni nueva autenticación de un cliente real.

Desglose CI:1.249unit/SQL,45Python,82demo,50empresa,192SaaS,20candidata,20producción y6perfiles públicos sobre Sites38 antes de desplegar.24pruebas focales locales finales y Deno correctos; no se suman al CI. Los42 recorridos pospublicación validan la fuente39 en cada caso; la lista de aceptación y los7 controles HTTP nativos están en el recibo.

Gmail personal conserva la aceptación del titular. Gmail empresarial NO está conectado: Google rechaza la credencial guardada con401/`invalid_client`. No pedir repetir el consentimiento ni recrear proyecto/cliente. Hace falta un secreto válido del mismo cliente existente mediante el formulario privado. La validación de credenciales no acredita permiso de buzón ni verificación pública de Google. Issue97 sigue abierto.

Recibo durable: [docs/verification/gmail-account-repair-published-20261108.json](docs/verification/gmail-account-repair-published-20261108.json).

# Evidencias de pruebas

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

## CargoTrack/logout · fuente821ba13 · 08/11/2026

CI push[42495957998](https://github.com/smartscaneuskadi/TruckControl-AI/actions/runs/42495957998) y PR[42495963203](https://github.com/smartscaneuskadi/TruckControl-AI/actions/runs/42495963203): **SUCCESS**,1.558 controles por ejecución, sin sumar duplicados.

| Batería | Correctos |
| --- | ---: |
| Unitarias/SQL(111 archivos) |1179 |
| Python |45 |
| Demo navegador |72 |
| Empresas navegador |50 |
| SaaS navegador |172 |
| Candidata navegador |14 |
| Producción navegador aislado |20 |
| HTTPS/navegador público(version32 vigente) |6 |

Instalación bloqueada npm ci y npm run check(typecheck/test/build) correctos. Retenidos64 casos iniciales y11hashes; no se eliminan aserciones ni se relaja Axe. Vault11 y sync8 cubren descifrado/IDB tardíos, outbox, rechazo42501/401/403 y fallos transitorios. Los16 recorridos nuevos(8×2plataformas) comprueban CargoTrack, SDK/error local/remoto, antidoble, Atrás/recarga/BFCache, copia cifrada y logout entre dos pestañas. SDK real con transporte ficticio; sin credenciales ni operaciones CargoTrack reales.

Release89100d9: paquete[42496353868](https://github.com/smartscaneuskadi/TruckControl-AI/actions/runs/42496353868) SUCCESS; PostgreSQL aislado42496353729 SUCCESS(69), Android42496353748 SUCCESS(5JVM/0fallos/0omisiones,lint,APKdebug yAAB sin firma comercial). No se suman estos controles a la batería de1558 ni se presentan como dispositivos físicos, Play o restauración gestionada.

Revisión independiente[6723621040](https://github.com/smartscaneuskadi/TruckControl-AI/pull/85#issuecomment-6723621040). Paquete todavía NO publicado: los seis checks públicos siguen verificando la web32 existente. [Recibo](docs/verification/cargotrack-logout-20261108.json).


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

### Pruebas verificadas de PR75

| Tipo | Controles por ejecución |
| --- | ---: |
| Unitarias/SQL |1163 en109archivos |
| Python |45 |
| Navegación/demo |72 |
| Empresa |50 |
| SaaS |156 |
| Candidata |14 |
| Producción |20 |
| Verificaciones públicas de v32 |6 |
| Total |1526 |

CI de fuente7d411: [push42479482785](https://github.com/smartscaneuskadi/TruckControl-AI/actions/runs/42479482785) y [PR42479488860](https://github.com/smartscaneuskadi/TruckControl-AI/actions/runs/42479488860), ambos SUCCESS. Son ejecuciones repetidas de la misma batería; no sumarlas como pruebas distintas.

Contrato Supabase: `docs/verification/session-fiscal-pipeline-rollback-20261108.sql`, fuenteace04 exacta, baseline18tablas/flags y limpieza10/10a0. La prueba no emite facturas, cobra, envía mensajes ni consume modelos.

PostgreSQL real aislado:69PASS en cada ejecución42480734805/42480739225 del head4ea39a/PR77, con dos conexiones, rollback e importación lógica en otro destino desechable. PR77 se integró en la candidata mediantef3205; PR78 promovió esos ensayos a main1c4c44. No equivale a restore gestionado de todos los componentes de Supabase.

Asesor de seguridad sin hallazgos nuevos: continúan dos INFO deny-all y el WARN previo de contraseñas filtradas. Rendimiento conserva17INFO de FK,23INFO de índices sin uso,1WARN de índice duplicado antiguo de invoice_documents y la información de conexiones Auth. No se eliminaron índices ni se hizo un upgrade; la organización ya tenía Pro. El WARN de contraseñas sigue pendiente de configuración/validación.

## Histórico conservado — no sustituye el estado vigente

## Estado nativo verificado · 8 de noviembre de 2026

Esta actualización prevalece sobre el histórico inferior. PR42 y PR60 están integrados; main4d6b09ee806ca92a90da620fb9d47123b6398bc5 conserva el candidato0.5.21-rc.1. **La web pública sigue v32/0.5.20-rc.1**, con v31 y demo6 recuperables; no confundir main con publicación.

**Supabase tiene62 migraciones.** La local20261108013000 corresponde a la remota20261108101437_manual_subscription_invoice_intake, Gitblob7504aca678710771ce550430cab5ab2b5f76068a y SHA2567323ded662cf8ec4560662a86c9224d21eb3d45ad4689caa919cf2638672da7b. Está APLICADA, su fuente coincide byte a byte y no debe editarse ni repetirse. La61 de proveedores/viajes20261108081848 permanece intacta. El contrato fiscal exacto pasó en Supabase y dejó cero usuarios, sesiones, operadores, pedidos, tareas, eventos, acciones, suscripciones y facturas sintéticos tras rollback; no hubo llamadas a proveedores ni correo. Se verifican permisos frescos, snapshot validado por operador, CAS/auditoría inmutable y mensualidades independientes. Es CAS de escritor obsoleto, sin prueba de carga concurrente nativa.

Head033b94f pasa ambos CI42469487926/42469491382: **1.292 controles** por ejecución (941unitarias/SQL en94archivos,45Python,72demo,50empresa,144SaaS,14candidata,20producción,6públicas), originales64/11hashes. Asesor sin hallazgos nuevos; permanecen dos INFO administrativos deny-all y el WARN previo de contraseñas filtradas que requiere plan de pago.

**Cobros y guard fiscal continúan apagados.** Los ocho perfiles IA de v32 conservan su aceptación; no repetir sus llamadas. La decisión GDTaller/TicketBAI es manual. El panel fiscal y conciliador están en código; PDF privado, bridge transaccional y avisos se preparan en PR66/67 y ramas independientes, con flags cerrados y sin declarar conexiones activas. Falta aceptación real Stripe/fiscal, Google público/Gmail empresarial, restore gestionado, hardware físico y revisión jurídica.

El ejecutor local sigue fallando; se trabaja por GitHub/CI/MCP. CLI oficial3.0.0 verificado por SRI ejecutó migration new en Actions42469793645 y generó la plantilla local20261108100352_manual_subscription_payment_and_documents.sql. **No es una63 aplicada**; integrar propuestas y probar antes de cualquier DDL. No crear proyectos duplicados, no tocar FIXPilot ni trasladar secretos a GitHub.

Presupuesto agregado200EUR, sin nuevas compras o llamadasIA; gasto histórico y saldo real no conciliados. LímiteIA10USD/mes y cuota100/empresa preservados. Existe una automatización horaria actualizada; no duplicarla ni afirmar ejecución continua. Recibo: docs/verification/manual-fiscal-native-20261108.json; inventario62: docs/deployment/remote-migrations-20261108-manual-fiscal.json. Evidencia durable en issue3 comentario6720303851 e issue41 comentario6720304629.

## 8 de noviembre · pruebas nativas y CI

Aceptación real Supabase:commercial-records-rollback-v1 PASS,205 proveedores/dos empresas,aislamiento,versiones,idempotencia,vínculos sin duplicar importes,candidatos/revisión/copia. Rollback completo:0fixtures nuevos y0filas en3tablas nuevas; huellas comerciales/planes/ajustes sin cambios. RLS activa,sin DML directo ni ejecución anónima; asesor sin avisos nuevos.

Head1866f8d:CI447/448 (42466436798/42466440658) SUCCESS. Por ejecución,853 unitarias/SQL,45 Python,72 demo,50 empresa,134 SaaS,14 candidata,20 producción y6 públicas =1.194 controles. No sumar ejecuciones duplicadas. Local anterior:823/43 y8 recorridos nuevos,con64 originales y11 hashes conservados. La diferencia de recuento corresponde a avances de main incorporados, no a nuevas llamadas IA.

Android:CI8/9 (42466436890/42466440590) SUCCESS.5JVM sin fallos ni omisiones,lintRelease,APK debug firmado efímero y AAB unsigned correctos; el manifiesto compilado pasa permisos,API24/36,red HTTPS y exclusión de backup. Gradle9.8.2 preinstalado de Ubuntu24.04,versión exacta verificada. Total distinto1199 al incluir5JVM, sin sumar reejecuciones. No afirmar prueba de dispositivo, firma comercial,Play o promoción de frontend.

Billing/subscriptionsv11:5/6fuentes nativas exactas y GET anónimo405; guard fiscalfalse incluso con flag de entorno. No prueba checkout ni emite facturas/pagos/IA/correo. Recibos [comercial](docs/verification/commercial-completion-20261108.json) y [Android](docs/verification/android-candidate-20261108.json).

## Referencia preservada · v32

- 1.107 controles por ejecución CI:789 unitarias/SQL,32 Python,64 demo,50 empresas,132 SaaS,14 candidata,20 producción,6 públicas.
- 64 pruebas iniciales conservadas mediante11 hashes.
- 8 perfiles IA con8 llamadas reales; registro de uso liquidado,19.465microUSD estimados, sin factura de proveedor disponible.
- 75 hashes de archivos HTTPS en3 orígenes;8 perfiles y documentos privados sobre backend real en Android/Windows emulados y ambos temas.
- 60 migraciones,ensayo SQL con rollback,roles/RLS/aislamiento,idempotencia,cron opt-in sin consumo IA y limpieza de sesiones de aceptación.

Fuente: [recibo v32](docs/verification/ai-specialists-20261107.json), [aceptación pública](docs/verification/ai-specialists-public-20261107.json), [PR38](https://github.com/smartscaneuskadi/TruckControl-AI/pull/38).

## Histórico · inicio de la fase comercial

Auditoría nativa:60 migraciones,registro abierto,pagos apagados,IA habilitada/límite10USD,8 perfiles previamente verificados. Asesor:sin nuevos WARN/ERROR; continúa el aviso previo de contraseñas filtradas y dos INFO de tablas administrativas con RLS denegando acceso por defecto.

Proveedores y margen de movimientos por viaje pasan sus pruebas locales nuevas; la aceptación Supabase y la publicación de estas funciones aún se registrarán. Facturación fiscal,Stripe real,Android firmado,publicación Play y recuperación integral siguen sin aceptación. La compilación no se considera publicación y los mocks no se consideran conexiones reales.

### Monitorización preparada

Seis pruebas nuevas pasan: destinos/identidad,ausencia de credenciales,cuerpos no retenidos,errores sin secretos,IA deshabilitada sin falsa certificación y rechazo de configuración ajena. Cinco sondeos HTTP reales pasan en los tres orígenes,contrato del copiloto y gateway anónimo401,sin leer datos de clientes ni llamar al modelo. Workflow42384257704 y CI42384944532 correctos. No se considera horario permanente hasta integrarlo en main.

### Proveedores y viajes ·0.5.21-rc.1 preparada

823 unitarias/SQL en85 archivos,TypeScript/build correctos.20 pruebas SQL nuevas,6 de dominio/copias,1 contrato con rollback y8 recorridos nuevos Android/Windows emulados con ambos temas y Axe. El caso de copia previa se actualiza al endpoint/v4 y añade rechazo explícito si falta ese backend. Las64 pruebas originales mantienen sus11 hashes. Los PR39/40 de recuperación se conservan; sus11 pruebas Python se ejecutarán en el CI final. Sin llamadas nuevas a modelos ni correos reales. Ensayo nativo y CI del siguiente commit pendientes.
