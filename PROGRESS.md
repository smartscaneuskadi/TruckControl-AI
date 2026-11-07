# TruckControl AI — avance comercial

## 7 de noviembre de 2026 · auditoría desde v32

Seguimiento: https://github.com/smartscaneuskadi/TruckControl-AI/issues/41.
Rama: `feat/commercial-completion-20261107`, base `3bbec3c`.

Producción32 sigue publicada en https://truckcontrolai.com. Se conservan v31 y demo6. El respaldo completo previo está verificado en `/workspace/artifacts/truckcontrol-commercial-completion-20261107/before-all-refs.bundle`. No se han modificado datos de clientes, funciones nativas ni migraciones en esta fase.

Comprobado ahora en servidor:60 migraciones, registro abierto, pagos apagados, IA habilitada con límite10USD/mes y8 perfiles con aceptación real previa. Las1.107 pruebas de v32 no sustituyen las pruebas de las nuevas funciones. No se repiten las8 llamadas IA anteriores sin necesidad.

La auditoría identifica documentación de portada obsoleta, proveedores sin maestro propio, ausencia de costes contables explícitamente vinculados a cada viaje, emisión fiscal sin proveedor conectado, publicación Play ausente y recuperación integral alojada pendiente. El asistente existente es real; no acredita por sí solo predicción de averías ni optimización viaria.

Se han consultado precios oficiales Stripe, registro Play y cambio de referencia BCE. No hay compras ni nuevas llamadas IA. Se solicita únicamente la reconexión oficial de Stripe y el programa/régimen fiscal del emisor; se continúa con tareas independientes.

Siguiente ciclo: consolidar auditoría/presupuesto, completar monitorización y operaciones, preparar Android y comprobar accesos oficiales Google. Véanse [TODO](TODO.md), [bloqueos](BLOCKERS.md), [pruebas](TEST_RESULTS.md) y [despliegue](DEPLOYMENT.md).

Monitor implementado:5 sondas públicas acotadas,sin consumo IA ni datos privados. Workflow real42384257704 y CI42384944532 correctos,commitf82bdf4,PR42; falta integración en main para horario permanente. La sesión Google caducó y se pide renovar por el acceso privado, sin reintentar ni introducir credenciales. Estimación del único run nuevo0,0483USD,no compra ni factura conciliada.

Operaciones preparadas:proveedores, asociación de apuntes a viajes, revisión de margen y copias cifradas v4.823 unitarias/SQL,TypeScript/build y8 nuevos recorridos Android/Windows pasan. El contrato nativo con205 proveedores/dos empresas pasa primero en PGlite; aplicación de la migración y aceptación Supabase todavía pendientes. Se incorporan sin sobrescribir los PR39/40 de recuperación,main13316cf. Véase [guía](docs/COMMERCIAL_RECORDS.md).
