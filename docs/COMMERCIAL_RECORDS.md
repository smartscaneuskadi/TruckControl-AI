# Proveedores y rentabilidad por viaje

Versión preparada:0.5.21-rc.1, issue41/PR42. La aceptación nativa y la promoción se registran por separado; una compilación no acredita despliegue.

## Proveedores

El menú Proveedores utiliza el permiso Gastos existente. Cada ficha pertenece a una empresa y admite nombre, identificador fiscal internacional, contacto, dirección, notas y archivado. Guardar una ficha no crea apuntes ni facturas. El servidor normaliza el identificador, impide duplicarlo dentro de la misma empresa y controla versiones e idempotencia. Archivar conserva los datos; no se ofrece borrado.

Los datos de empresa se consultan online por RPC autenticado. No se almacenan en Web Storage ni se añaden a la cola offline. Cambiar usuario, empresa o permisos descarta la vista anterior; una respuesta tardía no se muestra en el contexto nuevo. La demo permite edición ficticia en memoria y exportación CSV, con aviso de su duración limitada.

## Viajes

El botón Rentabilidad del viaje requiere Viajes y Rentabilidad. Solo devuelve las categorías económicas autorizadas; un importe sin permiso es nulo, nunca cero inventado. El presupuesto comercial se muestra separado de los apuntes registrados.

Un movimiento existente puede vincularse explícitamente a un único viaje del mismo camión y empresa. El ingreso contabilizado desde el viaje conserva su procedencia automática. No se crean, duplican, prorratean o trasladan apuntes al vincular o desvincular; ambas operaciones requieren confirmación. Las APIs antiguas tampoco pueden cambiar el camión de una asociación existente.

El margen de movimientos suma ingresos menos gastos vinculados por devengo, estén pagados o pendientes. No equivale a beneficio neto: excluye costes generales, impuestos y gastos sin asignar. Un viaje cerrado puede marcarse como revisado por el equipo, con confirmación. La huella de viaje/apuntes invalida esa revisión al cambiar los registros. No es una certificación contable o fiscal.

Los candidatos se paginan por UUID,200 por página, y excluyen otros camiones y movimientos ya asignados. El resumen puede incluir más de2.000 vínculos en sus totales, pero identifica el listado parcial de la tabla y CSV. Los importes se validan como enteros seguros en céntimos.

## Seguridad y copias

Tres tablas privadas con RLS, sin DML directo de clientes, y tres RPC públicos invocadores. Las funciones de permisos verifican identidad, correo confirmado, bloqueos, pertenencia y sesión revocada cuando el JWT incluye session_id. Roles y módulos se consultan en cada petición; el administrador global no suplanta una empresa. Las escrituras guardan auditoría sin nombres, identificadores fiscales, contactos ni secretos.

Las copias cifradas de empresa v4 incluyen proveedores y, con permisos completos, vínculos y revisiones. Se comprueban ámbito, duplicados, relaciones y cobertura; si falta la API nueva se detiene la copia antes de descargar originales. Se siguen leyendo v1/v2/v3 y conservando neumáticos y documentos. No existe restauración automática encima de producción; la revisión histórica exportada tampoco acredita una revisión vigente tras una futura restauración.

Migración creada con CLI:20261107145959_company_suppliers_and_trip_allocations.sql,aplicada una vez como remota20261108081848;61migraciones totales. SHA256 nativo e78473c5cd859d17e70d5903c1314ceea663db74969ea78d60e75363e8daa784. Inmutable:NO editar/reaplicar. Contrato nativo commercial-records-rollback-v1 PASS:205 proveedores,dos empresas,rollback completo,0fixtures nuevos y huellas anteriores intactas. El frontend nuevo aún no se ha promovido.

## Evidencias

-20 pruebas SQL de permisos, empresa, versiones, candidatos, vínculos, revisión, compatibilidad de API y exportación.
-6 pruebas de dominio/copias, incluyendo cifrado v4 y rechazo de pérdida de relaciones.
-1 contrato de aceptación completo con205 proveedores, dos empresas y rollback, ensayado primero en PGlite.
-8 recorridos de pantalla en Android/Windows emulados, dos temas y accesibilidad Axe, sin modificar contabilidad.
-CI447/448 del head1866f8d SUCCESS:853unitarias/SQL,45Python y recorridos completos=1.194controles por ejecución; las64 iniciales conservan sus11hashes. Véase [recibo](verification/commercial-completion-20261108.json).

No implica facturación fiscal conectada, cobros activos, firma Android o publicación Play. Las ocho aceptaciones reales de IA de v32 se conservan y no se repiten para estas funciones sin necesidad.
