# Evidencias de pruebas

## Referencia preservada · v32

- 1.107 controles por ejecución CI:789 unitarias/SQL,32 Python,64 demo,50 empresas,132 SaaS,14 candidata,20 producción,6 públicas.
- 64 pruebas iniciales conservadas mediante11 hashes.
- 8 perfiles IA con8 llamadas reales; registro de uso liquidado,19.465microUSD estimados, sin factura de proveedor disponible.
- 75 hashes de archivos HTTPS en3 orígenes;8 perfiles y documentos privados sobre backend real en Android/Windows emulados y ambos temas.
- 60 migraciones,ensayo SQL con rollback,roles/RLS/aislamiento,idempotencia,cron opt-in sin consumo IA y limpieza de sesiones de aceptación.

Fuente: [recibo v32](docs/verification/ai-specialists-20261107.json), [aceptación pública](docs/verification/ai-specialists-public-20261107.json), [PR38](https://github.com/smartscaneuskadi/TruckControl-AI/pull/38).

## Nueva fase comercial

Auditoría nativa:60 migraciones,registro abierto,pagos apagados,IA habilitada/límite10USD,8 perfiles previamente verificados. Asesor:sin nuevos WARN/ERROR; continúa el aviso previo de contraseñas filtradas y dos INFO de tablas administrativas con RLS denegando acceso por defecto.

Todavía no hay pruebas nuevas ejecutadas que acrediten maestro de proveedores,beneficio por viaje,facturación fiscal,Stripe real,Android firmado,publicación Play o recuperación integral. Sus resultados se añadirán al completarlos. La compilación no se considera publicación y los mocks no se consideran conexiones reales.

### Monitorización preparada

Seis pruebas nuevas pasan: destinos/identidad,ausencia de credenciales,cuerpos no retenidos,errores sin secretos,IA deshabilitada sin falsa certificación y rechazo de configuración ajena. Cinco sondeos HTTP reales pasan en los tres orígenes,contrato del copiloto y gateway anónimo401,sin leer datos de clientes ni llamar al modelo. TypeScript correcto. Flujo GitHub horario preparado; no se considera activo hasta comprobar su ejecución e integración en main.
