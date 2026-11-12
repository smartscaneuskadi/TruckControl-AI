# Aceptación aislada Stripe real · 12/11/2026

Cuenta exclusiva de pruebas existente: `acct_1UWYX5ECykZtDl5d`. La identidad se verifica antes de cualquier escritura; nunca se usa `--live`. El CLI oficial queda autorizado mediante el flujo privado del titular. No se extraen sus claves ni tokens.

La última ejecución pasa13 controles: suscripción de prueba financiada, evento real reenviado y firmado por Stripe CLI, lecturas canónicas autenticadas, escritura transaccional con las65 migraciones en PGlite nuevo, una solicitud fiscal, replay idempotente, firma falsa rechazada antes de llamadas al proveedor y devolución observada sin alterar la licencia. Los cuatro eventos reales recibidos obtienen200. El abono ficticio se cancela al terminar. Dinero real:0EUR.

[Recibo final](verification/stripe-sandbox-live-20261112.json). Se conservan dos fallos anteriores: el primero detectó que Stripe devuelve el contexto exacto de la cuenta en el Event canónico; el segundo era del adaptador de prueba del CLI, que omitía los filtros de query. Se corrigió este transporte sin alterar los datos ni las comprobaciones del programa. La limpieza del primer abono se verificó después de su recibo inicial; los otros dos se cancelaron en su propia ejecución.

La corrección del backend admite contexto ausente o exactamente igual a la cuenta configurada y verificada con `/v1/account`. Mantiene el rechazo de Connect/account, otra cuenta, otro contexto, tipos incorrectos y firmas o recursos no coincidentes.25 pruebas nuevas cubren estos límites. No se elimina ni transforma el contexto para hacer pasar la reconciliación.

El script `scripts/accept-stripe-sandbox-cli.mjs` es opt-in y no se ejecuta automáticamente en CI. Usa el CLI existente y una base local desechable. Requiere `TRUCKCONTROL_RUN_STRIPE_SANDBOX=yes`, `STRIPE_CLI_BIN` y un directorio nuevo opcional `TRUCKCONTROL_STRIPE_SANDBOX_ARTIFACTS`; Node requiere transformación TypeScript. Verifica primero cuenta y modo. No acepta claves por argumento ni reutiliza sesiones del conector MCP.

## Límites pendientes

Esta prueba NO acredita Checkout completado por navegador, una clave propia cargada en Edge, un webhook registrado y entregado a producción, suspensión/renovación/cancelación productivas, entrega de correo ni factura TicketBAI válida. El entorno local utiliza una orden previa ficticia explícita. No hay cambios en datos Supabase productivos, canales habilitados o cobros. Se mantiene la exigencia de probar esos recorridos antes de abrir las ventas.
