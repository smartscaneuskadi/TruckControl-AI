# Candidata de aceptación comercial — 13/11/2026

## Identidad y punto de recuperación

Repositorio exclusivo smartscaneuskadi/TruckControl-AI. Producción Sites41/0.5.23-rc.1/source a33ed6f; conservar40/39/32/31 y demo6. Main tiene manifiesto DEMO: nunca publicarlo como producción. Supabase kkkemaycedexymrpaqtp, organización wlvawqxuflbiabowjpkx, ACTIVE_HEALTHY y66 migraciones confirmadas. No tocar FIXPilot.

PR110 ya está integrado en dfe56b7; CI43377180022 SUCCESS. El inspector Native de billing19 y los workers subscriptions18/fiscal8/incidents5 comparten el validador de claves. PR111 nuevo corrige el uso de v1 para un Event Destination v2 real: revisar e integrar tras controles; no crear otro receptor.

## Orden de trabajo

1. Integrar y revisar los cambios independientes preservando las64 pruebas originales/11hashes y SQL históricos.
2. Terminar la cola privada de incidencias financieras aún no vinculadas, sin crear licencias ni facturas desde esos eventos.
3. Ejecutar un único check integrado con concurrencia acotada; pruebas SQL reales en PostgreSQL17 y recuperación de archivos persistidos. Confirmar rollback y aislamiento antes de DDL remoto.
4. Ejecutar CI de la fuente exacta, recorridos navegador/PWA y manifest del AAB real. Las pruebas emuladas no sustituyen hardware físico ni firma de publicación.
5. Aplicar cada migración nueva una vez por el canal oficial, únicamente tras aceptación aislada. Desplegar backend compatible antes del frontend, conservar fuentes anteriores.
6. Publicar la funcionalidad segura, comprobar HTTPS/hashes/recorridos y actualizar los recibos. Mantener cobrosOFF hasta las aceptaciones pendientes.

## Cambios candidatos y comprobaciones parciales

- Prefijo de disputa Stripe dp_ (antes se aceptaba du_):132 comprobaciones focalizadas.
- CAS del snapshot de suscripción y señal explícita de estado pendiente:70 pruebas de ordenación y9 de UI/DTO.
- Restauración desde los bytes leídos y verificados de archivos guardados:75 pruebas Python. No acredita por sí sola recuperación gestionada.
- Consentimiento separado para IMAP/SMTP:41 pruebas focalizadas. La versión legal global y los recibos previos no cambian; Gmail OAuth personal sigue separado.
- Periodos Gmail rodantes se recalculan al abrir la confirmación; errores invalid_client de refresh no solicitan nuevo consentimiento al usuario:68 comprobaciones focalizadas.
- Diagnóstico administrativo Stripe opt-in v2 sin valores, tamaños, huellas o claves; fallback explícito al v1 existente y errores fijos. Último ensayo integrado acotado:36/36 (23 diagnóstico,4 permisos SQL,9 UI).
- Android:20 pruebas de política/inspector; bundletool oficial1.18.3 fijado por SHA256. Falta compilar e inspeccionar el AAB verdadero en Actions.

Los recuentos focalizados pueden compartir pruebas: **no sumarlos como total único**. Dos ejecuciones completas locales concurrentes se interrumpieron y NO son PASS. Falló el setup SQL de10s; se permite30s únicamente para construir la base desechable con todas las migraciones, manteniendo los tiempos y aserciones funcionales. La repetición de sus cuatro casos pasa. El ensayo criptográfico aislado pasa2/2; se limita Vitest a dos workers para evitar presión de recursos. La regresión integrada final sigue pendiente.

## Bloqueos comerciales externos

- Stripe: último diagnóstico Native STRIPE_SECRET_KEY unexpected_format. El conector no administra/recupera claves. Receptor we_1Ub5lBCWctKw8slHXmnq0PZd existente v2/snapshot/@self deshabilitado; URL no acreditada, no hay entrega firmada. No usar tokens de CLI/MCP como clave de backend ni adivinar/normalizar credenciales. Pagos permanecen desactivados.
- Conectar un pago firmado real con licencia y tarea fiscal y probar conciliación/fallos. La aceptación sandbox anterior17/17 se conserva; no equivale a aceptación Native comercial.
- GDTaller/TicketBAI manual ya confirmado por el titular: no pedir API o reconfirmar el modelo. Falta evidencia operativa completa de un PDF fiscal auténtico y su entrega privada; no inventarlo.
- Gmail empresarial: credencial/verificación pública de Google y consentimiento real comprobable pendientes; la aceptación de correo personal del propietario se conserva.
- Recuperación gestionada de Auth/Storage/Vault, custodia y retención: pendientes. Recuperación real autohospedada67/67 y PostgreSQL aislado117 previos no son un restore gestionado.
- Android/Windows físicos no disponibles; no se dispone de custodia de firma comercial/Play. Revisión jurídica externa pendiente; textos son preparación técnica.

## Costes

Compras, llamadas IA y compromisos nuevos en esta ejecución:0. Presupuesto autorizado200EUR acumulado; gasto histórico sin conciliar y saldo desconocido. No se activa ningún pago, topup, evaluación CASA o servicio recurrente nuevo. Se conservan límite IA10USD/mes y100llamadas/empresa; no repetir aceptación #37.

## Reanudación

Worktree /workspace/worktrees/truckcontrol-launch-20261113, rama feat/commercial-acceptance-20261113. Copia persistente inicial before-fetch-all-refs.bundle verificada; checkpoint privado en /workspace/artifacts/truckcontrol-commercial-20261113/checkpoint.json. Antes de integrar o desplegar, releer main/PR abiertos y el recibo más reciente del issue3 para evitar colisiones con otros ejecutores.
