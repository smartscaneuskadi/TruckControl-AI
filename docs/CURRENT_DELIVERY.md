# Estado de entrega — continuación del 28/10/2026

## Recursos preservados

- Código existente: commit 3aaf1f5794448185a69336284248bd6a8a3c24b8, con el historial completo y las ramas anteriores.
- Demo estable HTTPS: https://truckcontrol-ai-fase-1.earlymug513.chatgpt.site, publicación privada de revisión. No sustituir por una compilación sin verificar.
- Copia del código: `/workspace/shared/truckcontrol-saas-41rkbrvr/TruckControl-AI-saas-source.zip`.
- Historial Git verificado: `/workspace/shared/truckcontrol-saas-41rkbrvr/truckcontrol-ai-saas.bundle`.
- Copia adicional anterior a esta continuación: `/workspace/shared/truckcontrol-dedicated-4az8o59a/before.bundle`.

## Supabase

Proyecto independiente creado: **truckcontrol-ai**, referencia **kkkemaycedexymrpaqtp**, organización **fixpilot-dev**, región eu-west-2. Cotización comprobada de 0 al mes. No se ha contratado un plan de pago.

El propietario autorizó pausar únicamente **merymery_16** (`crcdrxbioyberfibrzuw`). Está pausado conservando su contenido. **FIXPilot no se ha modificado.** No se copian datos, usuarios, archivos ni credenciales entre proyectos.

En el proyecto nuevo están aplicadas: phase1_fleet (20261028132655), company_documents_gmail_1_tables (20261028134500), company_documents_gmail_2_permissions (20261028134514), company_documents_gmail_3_documents (20261028134518). Estas tres últimas partes conservan las sentencias originales de la segunda migración. Aún faltan su función interna OAuth, permisos finales y almacenamiento, además de las migraciones posteriores.

Los intentos largos de aplicar SQL han fallado con `Invalid or expired requestState`. Se comprueba el historial antes de cada recuperación; no se repiten las partes ya aplicadas. El proyecto nuevo no tiene usuarios reales y aún no está conectado a la publicación estable.

## GitHub

La conexión identifica al usuario smartscaneuskadi, pero devuelve cero instalaciones y repositorios autorizados. La consulta de smartscaneuskadi/TruckControl-AI devuelve 404; el Git anterior devolvió 403. Se ha solicitado al propietario habilitar el repositorio en la conexión. No se recrea ni se sobrescribe el repositorio remoto.

## Últimas decisiones comerciales y alcance

La orden más reciente sustituye los valores anteriores: prueba de **30 días**, plan inicial de **10 euros al mes**, precios editables, cobros reales desactivados. SMS se exigirá cuando exista proveedor configurado.

Completar sin rehacer la base: roles por empresa, remolques, clientes, viajes, mantenimiento, combustible, vencimientos y avisos; biblioteca documental, bots IA con datos autorizados, informes y PWA Android/Windows con sincronización segura. Las credenciales de proveedores y la entrega real de mensajes siguen pendientes; no se presentan simulaciones como integraciones reales.

## Verificación

La última entrega estable superó 140 pruebas, incluidas las 64 originales, TypeScript y compilación PWA. Son resultados de esa entrega, no una afirmación de que las ampliaciones pendientes ya estén probadas. Las pruebas originales conservan sus hashes. La siguiente publicación requiere ejecutar las comprobaciones críticas sobre el código final y verificar RLS en el proyecto independiente.
