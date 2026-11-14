# Validación de la estructura del archivo de documentos

Una copia TAR podía declarar un archivo regular `tenant` y, a la vez,
`tenant/document.pdf`. Ningún sistema de archivos puede conservar ambos.
Según el extractor y el orden de las entradas, la restauración podía fallar o
perder una parte del árbol después de preparar el destino.

`validate_storage_archive()` comprueba ahora todos los nombres normalizados y
rechaza cualquier entrada que tenga un archivo regular como antecesor. La
comprobación no depende del orden del TAR. Conserva los directorios implícitos,
los explícitos que aparecen después de sus hijos y la raíz `.` de Docker.
No cambia la validación de hashes, tamaños, rutas, enlaces o terminación del TAR.

Las regresiones incluyen ambos órdenes, nombres normalizados, varios niveles,
directorios intermedios y archivos regulares de los dos tipos admitidos. La
prueba de restauración vuelve a guardar un manifiesto con un hash correcto del
TAR defectuoso: debe rechazarse antes de preparar, congelar o ejecutar órdenes
sobre el destino. Los datos son ficticios y no se extraen sobre producción.

Validación local: 130 pruebas Python correctas, incluidas 24 de copias y 9 de
barreras de servicios. CI y el ensayo real de Auth/Storage aislados deben
terminar antes de integrar. Esta mejora no acredita la custodia ni una
restauración del proyecto gestionado de Supabase.

No necesita migración, cambio de Edge Functions ni publicación web. Sites44,
la demo y los cobros desactivados se conservan.
