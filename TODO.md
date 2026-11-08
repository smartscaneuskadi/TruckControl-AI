# Plan de ejecución comercial

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
