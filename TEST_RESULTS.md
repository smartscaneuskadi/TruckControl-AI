# Evidencias de pruebas

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
