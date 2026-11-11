# Segundo conductor opcional por camión

Candidato en revisión, actualizado con main7cfa25f el11/11/2026; no desplegado ni aplicado en Supabase. La web pública continúa en Sites39 y se conserva demo6. La plantilla SQL fue creada por el CLI oficial, no por un nombre inventado: [evidencia de generación](verification/truck-second-driver-cli-template-20261108.json).

En Camiones, abre la ficha y pulsa «Editar ficha». El campo «Conductor asignado» conserva el puesto principal. «Segundo conductor (opcional)» permite asignar otra persona disponible de la misma empresa o dejar «Sin segundo conductor». No es obligatorio usar dos conductores. Si eliges la misma persona en ambos puestos, el formulario muestra el error y conserva tus valores para corregirlos.

La lista, búsqueda, CSV y ficha de camiones muestran los dos puestos. En Conductores se identifica si cada persona es principal o segundo conductor y se conserva el enlace a su vehículo. No se cambian asignaciones de viajes, importes, precios, planes ni capacidad de flota.

## Contrato y compatibilidad

- Dominio: `coDriverId?: string | null`. Al cargar una ficha antigua se normaliza a `null`. Un comando antiguo que omite el campo conserva la asignación existente; `null` explícito la retira.
- Servidor: `public.trucks.co_driver_id`, nullable y con valor predeterminado NULL. La FK compuesta exige que el conductor pertenezca a la misma empresa. El CHECK impide repetir una persona en los dos puestos.
- Se amplía la exclusividad que ya existía por empresa para el conductor principal. Ambos puestos exigen personas activas. Los locks de drivers se adquieren por UUID antes de comprobar asignaciones cruzadas en las transacciones READ COMMITTED de la aplicación. El CAS de `row_version` y las políticas RLS/sesiones existentes continúan en vigor; no se añade un RPC privilegiado ni se amplían permisos.
- No se reescriben camiones ni asignaciones existentes. Las migraciones aplicadas, incluida la 63, permanecen byte a byte.
- Las copias con segundo conductor usan demo v3 o empresa v5 para que un lector antiguo rechace el formato y no pierda esa asignación. Sin segundo conductor se conserva la versión anterior que corresponda. El nuevo lector acepta las copias anteriores.
- El modo empresa offline conserva las fichas cifradas para lectura y recupera la asignación vigente al sincronizar. La edición de camiones/conductores sigue requiriendo conexión; no se añade esa operación a la cola offline.

## Verificación y publicación

Las36pruebas focalizadas de dominio, DTO y SQL embebido pasaron después de incorporar main. Se añaden12mensajes en inglés, rumano y francés y recorridos de formulario en los cuatro idiomas. El contrato PostgreSQL17 comprueba rollback de DDL, cuatro carreras reales entre conexiones independientes y conservación de los dos puestos tras pg_dump/pg_restore. Mantiene el guard de ejecución exclusiva en GitHub Actions, las comprobaciones históricas y las64pruebas originales/11hashes. Los resultados del nuevo CI y de los navegadores se registrarán en el PR; no se presentan como completados antes de terminar.

Root coordina el orden de aplicación con la candidata independiente de incidencias Stripe. No aplicar esta migración ni publicar el frontend antes de revisión, CI y aceptación nativa autorizada. No se han usado datos empresariales reales, proveedores o llamadas IA para esta implementación. Los dispositivos físicos siguen pendientes.
