# Plan de ejecución comercial

## Estado vigente · 8 de noviembre de 2026

Este checkpoint prevalece sobre todas las notas y listas históricas inferiores. PR75 está integrado en main `71c72bed48e64e8f4d25b778c8aa2cef06260d47`, tras CI completo del head `7d411fcccc4bf8ba1a1b017becc22c6a349422cd`. **La web pública sigue en Sites32 / app0.5.20-rc.1**, https://truckcontrolai.com; v31 y demo6 se conservan. Integrar código no equivale a publicar el frontend.

**Supabase:63 migraciones aplicadas.** Local `20261108100352_manual_subscription_payment_and_documents.sql` → remota `20261108123230_manual_subscription_payment_and_documents`. Gitblob `36786ff4a510b3e0df0cde32ddd71a630fc0214b`; SHA256 `cbfe47861f20129c4fbc51ebf35b2e37b46784489aee406f49291896fa81e069`. Fuente nativa idéntica, un statement registrado y OID/ACL18083,18118,19429 preservados. **La63 es inmutable: no editarla, reaplicarla ni revertir las61/62 anteriores. FIXPilot permanece separado.**

**Contrato nativo aprobado y completado:** `session-fiscal-pipeline-cleanup-v1`, script Gitblob `ace04d8b048d412a60b8e2ccad5fee5c09b977e5`. Diez contadores de fixtures a0 tras rollback (usuarios,sesiones,administradores,pedidos,tareas,eventos,acciones,canales,recibos y avisos); baseline de18tablas/flags intacta. Las8tablas nuevas tienen RLS. No se han hecho pagos, emisiones fiscales, correos ni llamadas IA para esta aceptación.

**Siete Edge existentes actualizados y verificados:** Auth5, Billing13, Subscriptions13, Gmail14, Mail13, Copilot3 y Assistant11;55fuentes runtime exactas. Deno/configuración no se confunde con archivos runtime. Inbound Resend3 intacto. Seis GET HTTPS devuelven405 y Gmail retorna su callback controlado `gmail_error=invalid_state`: no es prueba de conexión de un buzón. Cobros, PDF y avisos permanecen OFF. Los workers nuevos fiscal/PDF/avisos todavía no están desplegados ni programados en este corte.

**Evidencia:** CI42479482785/42479488860 SUCCESS,1.526controles por ejecución; originales64/11hashes conservados. PR77/head4ea39a tiene69checks PostgreSQL17 y recuperación lógica aislada correctos en42480734805/42480739225; no acredita recuperación gestionada de Supabase/Auth/Storage/secretos ni dispositivos físicos. No sumar reejecuciones.

**Límites vigentes:** no se repite la tarea37 ni sus8llamadas reales. IA10USD/mes y100llamadas/empresa sin cambios. Nuevas compras0 y nuevas llamadas IA de prueba0; presupuesto agregado200EUR, gasto/saldo globales sin conciliar. Cobros y lanzamiento comercial completo siguen pendientes de aceptación Stripe/fiscal, Google público, recuperación gestionada y revisión externa.

### Plan vigente por dependencias

- [x] Integrar PR75 con el CI del head exacto y conservar el historial.
- [x] Aplicar63 una vez, verificar fuente/ACL y completar contrato nativo con rollback.
- [x] Actualizar los7Edge existentes y verificar todas sus fuentes runtime.
- [ ] Consolidar recibos nativo/Edge e inventario63 en GitHub.
- [ ] Desplegar y verificar los workers nuevos manteniendo todos sus flags OFF; después aceptar su funcionamiento autorizado.
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
