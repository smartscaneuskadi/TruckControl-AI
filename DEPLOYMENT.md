# Despliegue y recuperación

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
