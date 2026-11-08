# Despliegue y recuperación

## Ampliación nativa verificada · 08/11

Supabase61 migraciones. Local20261107145959 → remota20261108081848,company_suppliers_and_trip_allocations; SHA256 nativo exacto e78473c5cd859d17e70d5903c1314ceea663db74969ea78d60e75363e8daa784. No editar/reaplicar. Ensayo nativo con rollback completado; datos existentes conservados.

Frontend público sigue32/0.5.20-rc.1; el código nuevo0.5.21-rc.1 aún no se ha promovido. Android candidato en android/ y workflow propio,con minSdk24; no hay Play ni firma comercial. Incorporar main7d47ee9 antes de congelar la fuente. El entorno ERS no está disponible; no inventar empaquetado,despliegue o pruebas locales. Reanudar desde los commits remotos y preservar el worktree.

## Producción que se conserva

- URL principal: https://truckcontrolai.com.
- Sites: `appgprj_6ae655e56db481918fe18adfe9df8b66`, versión32/app0.5.20-rc.1.
- Fuente congelada: `30b39be58e5ec19e417f819e00f2e579ec2abe7d`.
- Despliegue: `appgdep_6aeef12e3624819185ab700077042c21`.
- Supabase exclusivo: `kkkemaycedexymrpaqtp`, truckcontrol-ai,60 migraciones. FIXPilot separado.
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
