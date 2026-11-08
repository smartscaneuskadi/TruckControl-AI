# TruckControl AI — avance comercial

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
