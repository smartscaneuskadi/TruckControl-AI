# TruckControl AI — avance comercial

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
