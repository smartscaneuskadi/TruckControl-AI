# Registro de neumáticos

Preparado en 0.5.11-rc.1, continuando desde v17. Consulta [entrega vigente](CURRENT_DELIVERY.md) para el estado de publicación comprobado.

## Uso

En **Neumáticos** se crean fichas con código o número de serie, marca, modelo y medida. Una cubierta puede estar montada, en almacén o retirada. Al montarla se seleccionan camión y posición; la misma posición no puede tener dos cubiertas montadas. Los códigos son únicos dentro de la empresa. Pasar a almacén o retirado libera la posición y conserva la ficha y todas sus revisiones. No se borran ni se contabilizan gastos automáticamente.

El último montaje puede incluir fecha y cuentakilómetros, si se conocen. Dibujo y presión se introducen manualmente con su fecha de medición. Los valores desconocidos se conservan vacíos; un cero introducido expresamente sigue siendo cero. No hay sensores TPMS ni lecturas en tiempo real.

La empresa configura opcionalmente el umbral de dibujo, la presión mínima/máxima y la próxima revisión. Los avisos comparan únicamente las mediciones registradas y los umbrales propios; **no certifican seguridad ni sustituyen las indicaciones del fabricante o una inspección profesional**. Una medición fuera del intervalo se distingue de un vencimiento. Los avisos aparecen en el centro de Alertas y la campana cuando también está permitido ese módulo. Reconocer un aviso no cambia la medición; una revisión nueva puede producir un aviso nuevo.

El listado permite buscar, filtrar por estado/camión y exportar el filtro a CSV. **Ver historial** muestra las revisiones anteriores y permite exportarlas. Una edición concurrente no reemplaza silenciosamente el trabajo de otro dispositivo. El formulario conserva el borrador si el servidor no confirma el guardado.

## Acceso y datos

Se utiliza el permiso existente de **Mantenimiento**, sin modificar precios, planes ni concesiones anteriores. Cada empresa y usuario conserva sus permisos: consulta permite leer/exportar, operador autorizado puede escribir y desactivar Mantenimiento retira el acceso al apartado. Los usuarios no pueden modificar ni borrar el historial del servidor. El identificador interno del autor no se devuelve en las páginas del historial.

La empresa necesita conexión para leer o escribir este registro. No se guarda en WebStorage ni se incorpora a la cola offline empresarial. La demo utiliza únicamente su archivo local ficticio; las fichas y operaciones existentes se conservan en una única escritura al guardar neumáticos.

## Copias y límites

- Copia cifrada de empresa: registros **versión 3**, con neumáticos e historial completos dentro de los permisos verificados. Las versiones 1 y 2 siguen admitidas. Se comprueban empresa, relaciones, todas las revisiones y la coincidencia con el último estado; se vuelve a leer para detectar cambios durante la preparación. Límite existente de 20 MB; no se genera una copia parcial. La herramienta de recuperación sigue sin reemplazar datos en producción.
- Copia de demo: **versión 2** cuando incluye neumáticos; versión 1 y formato histórico siguen admitidos. Restaurar crea un punto de recuperación y cambia flota, operaciones y neumáticos mediante una única escritura. Una copia anterior conserva los neumáticos actuales si sus camiones siguen disponibles; si no puede conservarlos coherentemente se detiene antes de reemplazar la demo. Los originales documentales se mantienen aparte.
- Máximo inicial de 5.000 fichas por empresa, incluidas retiradas, ampliable mediante una migración posterior. Listado e historial se leen en páginas de 200. La interfaz limita el historial a 50.000 revisiones y 20 MB; un exceso o error no se presenta como listado completo. Los datos originales del servidor se conservan.

## Arquitectura y operación

Migración local `20261102181517_tyre_management.sql`, remota `20261102184040`, aplicada una vez (57 totales). Añade dos tablas privadas con RLS, claves de empresa/camión e índices de códigos, posiciones y páginas. Las RPC públicas son invoker y requieren sesión, empresa activa y Mantenimiento. El único trigger definer privado comprueba explícitamente el usuario y sus permisos para añadir una revisión inmutable y controlar la capacidad bajo bloqueo por empresa; el cliente no tiene EXECUTE sobre él. No se exponen esquemas privados ni se cambian las funciones económicas, Gmail o IA.

Antes de aplicar hay una copia recuperable del código en `/workspace/artifacts/truckcontrol-tyres-20261102/before-tyres.bundle`. El [ensayo nativo](verification/tyres-rollback.sql) usa dos empresas ficticias y revierte sus usuarios, camiones, cubiertas e historial. Las pruebas locales comprueban aislamiento, permisos, duplicados, referencias, páginas, repetición idempotente, historial, copias y borradores ante conflictos.

Esta función no contrata servicios, no activa cobros y no amplía presupuestos. Los límites externos de Gmail, Migadu, SMS, pagos, dispositivos físicos y recuperación integral siguen descritos en la entrega vigente.

El [ensayo nativo con rollback](verification/tyres-native-20261102.json) deja cero identidades, camiones, cubiertas o revisiones ficticias. Las huellas de los datos anteriores, ajustes, planes, presupuesto y funciones de permisos permanecen iguales.

El restablecimiento explícito de la demo limpia sus neumáticos y permite recuperar un archivo dañado. La candidata alojada 18 detectó una regresión en ese flujo durante CI y nunca se publicó; se conserva como evidencia. Los dos recorridos originales de recuperación vuelven a pasar sin modificar las pruebas retenidas.
