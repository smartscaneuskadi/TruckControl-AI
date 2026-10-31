# Copias y recuperación de la demostración

Estas funciones son locales y se utilizan únicamente con datos ficticios. No restauran Supabase, no abren el registro comercial y no llaman a servicios externos.

## Guardar y restaurar

En **Configuración → Copias y recuperación de la demo**, pulsa **Descargar copia de registros**. El JSON incluye camiones, conductores, movimientos económicos, remolques, clientes, viajes, mantenimiento, combustible, vencimientos y avisos. No está cifrado. Los PDF e imágenes de la biblioteca no están incluidos: descárgalos por separado desde Documentos.

Para recuperar una copia, selecciónala y pulsa **Revisar copia**. El programa comprueba formato, versión, tamaño (máximo 10 MB), referencias y pertenencia al espacio de demostración. La vista previa muestra los recuentos sin cambiar datos. Cancelar conserva el estado actual.

La confirmación requiere aceptar que se usarán solo datos ficticios y que se sustituirán los registros de esta demo. Antes del cambio se guarda automáticamente un punto con el estado actual. **Recuperar estado anterior** permite revisarlo y restaurarlo de la misma forma. Se conserva el punto anterior a la última restauración; descarga copias propias si necesitas más historial.

Si otra pestaña ha cambiado los registros desde la vista previa, el programa bloquea la restauración y pide revisar otra vez. Si no hay espacio para el punto de recuperación o para guardar el resultado, se conserva la demostración anterior. Los archivos de la biblioteca del navegador no se borran; si sus fichas asociadas no aparecen en la copia restaurada, se muestran sin esa asignación.

Las copias antiguas de fichas siguen siendo legibles, con aviso previo: no incluyen las operaciones que no estuvieran dentro del archivo. Una copia de empresa no debe importarse en la demo. El formato comercial y la restauración de servidor quedan fuera de esta función.

## Formato y conservación

El contenedor `truckcontrol-demo-records`, versión 1, incluye fecha de exportación, `fleet`, `operations` y `attachmentsIncluded=false`. La validación exige referencias de la propia flota y que los registros contabilizados tengan su movimiento económico. No se ejecuta contenido del archivo ni se transmite a IA.

La flota y las operaciones de la demo se guardan juntas en la clave existente `truckcontrol.demo.v1`, con el campo adicional `demoOperationsV1`. La escritura individual de localStorage permite confirmar ambos conjuntos a la vez, sin un estado con solo la mitad restaurada. El repositorio de fichas conserva ese campo al editar un camión, conductor o movimiento.

La actualización lee las operaciones anteriores de `truckcontrol.demo.operations.v1` si aún no están integradas, las valida y las incorpora. La clave heredada se conserva sin borrar ni modificar. Los clientes comerciales continúan utilizando Supabase y las copias offline cifradas existentes; no pasan a este almacenamiento de demo.

El restablecimiento explícito de la demo también reinicia las operaciones ficticias. La biblioteca de archivos se conserva. Estas copias locales no sustituyen una política de backups de base de datos ni el ensayo de recuperación comercial.
