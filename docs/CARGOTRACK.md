# CargoTrack y cierre de sesión

Entrega vinculada a [issue84](https://github.com/smartscaneuskadi/TruckControl-AI/issues/84) y [PR85](https://github.com/smartscaneuskadi/TruckControl-AI/pull/85), en la rama existente `feature/cargotrack-access-84`. Conservar el commit de corrección3057a37 y todos los cambios posteriores.

## Acceso al proveedor

CargoTrack está en la navegación principal con iconos de camión y GPS. Su pantalla utiliza los dos temas existentes, tamaño adaptable y enlace HTML seguro. «Entrar en CargoTrack» abre exactamente https://on7.cargotrack.ro/signin en otra pestaña con `target="_blank"`, `rel="noopener noreferrer"` y `referrerPolicy="no-referrer"`. No hay formulario de contraseña, iframe, API, exportación ni sincronización con el proveedor. El resumen de TruckControl permanece accesible en su pestaña.

El inicio de sesión CargoTrack es independiente. Cerrar TruckControl no cierra CargoTrack ni transmite una contraseña o token de TruckControl al proveedor. La lectura automatizada pública de CargoTrack recibió `bot_blocked`; no se elude ese control y los recorridos automatizados interceptan únicamente el destino externo, sin iniciar sesión allí. Una prueba del enlace no certifica las funciones contratadas ni las credenciales de una cuenta CargoTrack.

## Salida de una cuenta de empresa

El menú de empresa autenticada muestra «Cerrar sesión» debajo de Configuración. Invoca `access.signOut()`, que usa el SDK oficial `client.auth.signOut()`; una única promesa compartida evita solicitudes duplicadas desde varios controles. Mientras responde, el botón se desactiva y anuncia el cierre. Un rechazo muestra un aviso comprensible y persistente. La versión fijada auth-js2.118 elimina la sesión local también cuando el servidor rechaza el cierre; se indica que el dispositivo está cerrado y que falta confirmar el servidor, sin anunciar una revocación remota inexistente. Para reintentar esa revocación debe iniciarse sesión de nuevo: una llamada sin token no sería una prueba de cierre remoto.

Tras la confirmación se eliminan del estado el usuario, empresas seleccionables, empresa activa y recuperación; se vuelve al formulario de acceso. La raíz protege también las rutas históricas: Atrás, recargar o escribir una ruta privada no monta la flota sin identidad. La restauración de una página en BFCache elimina su vista privada antes de guardarse y vuelve a verificar `getUser()` al regresar; no revoca la sesión del servidor por cambiar de pestaña ni por abrir CargoTrack.

Los proveedores privados y claves offline se invalidan al salir. Las promesas de desbloqueo, descifrado, preparación o sincronización que terminan después del bloqueo no deben reinstalar contenido privado ni iniciar nuevas escrituras. Una escritura ya enviada conserva su carácter incierto y la idempotencia al reconciliarse; no se borra una cola para fingir que nunca ocurrió.

La copia cifrada local es un acceso distinto de la sesión en línea. En ella se utiliza «Bloquear» (o «Bloquear copia» desde Configuración); el nuevo botón del menú sólo se muestra para una cuenta autenticada en línea. Las copias cifradas y cambios pendientes se conservan al bloquear o salir. No se borran documentos ni datos de empresa. El wrapper offline también comprueba la respuesta del SDK antes de afirmar que ha cerrado una sesión.

## Verificación

Los comandos exigidos se ejecutan en GitHub Actions: instalación bloqueada `npm ci --ignore-scripts --no-audit --no-fund`; `npm run check` ejecuta verificación de los64 casos iniciales/11hashes, typecheck, test y build; después se ejecutan Python, navegadores demo/empresa/SaaS/candidata/producción y comprobaciones HTTPS públicas. No se desactivan pruebas ni Axe para aprobar esta entrega.

Los nuevos recorridos comprueban navegación, aislamiento de nueva pestaña, ausencia de Referer/Authorization/cuerpo, temas/contraste/ancho móvil, posición del botón, SDK logout, doble pulsación, rechazo/reintento, rutas privadas/Atrás/recarga, BFCache y preservación del cifrado. Los casos de Vault/sync cubren operaciones tardías y colas. Los resultados y el head exacto se registran en los checks/comentarios de PR85. Los fixtures utilizan exclusivamente cuentas y datos ficticios: no equivalen a una sesión de un cliente de producción ni a dispositivos físicos.

Android Pixel7 y Windows/Chrome son perfiles emulados de Playwright. No hay dispositivos físicos disponibles en esta tarea. No hay nuevas dependencias, migraciones, claves, gastos, llamadas IA ni cambios de permisos económicos por CargoTrack.

## Producción y recuperación

La inspección del08/11/2026 identifica la producción en Sites, proyecto `appgprj_6ae655e56db481918fe18adfe9df8b66`, versión32/0.5.20-rc.1, https://truckcontrolai.com. La conexión Netlify no contiene un sitio TruckControl ni el dominio: no crear otro sitio, tocar otros proyectos ni cambiar DNS para forzar una entrega. El manifiesto de main sigue apuntando a demo6 y se conserva: NO usarlo para publicar producción.

El envío de la nueva fuente está bloqueado por el ejecutor de Codex: `No usable execution environment` incluso al ejecutar `pwd`. El titular comunicó reconexión; la comprobación posterior sigue fallando en el mismo entorno, que declara `capabilities: []`. No hay diagnóstico retenido. GitHub Actions es utilizable para compilar y probar, pero no se trasladan credenciales del conector Sites a Actions.

Al recuperar el ejecutor, abrir el checkout existente, obtener la credencial efímera por el conector oficial y seguir el helper de Sites. Preparar la fuente exacta de producción con su identidad correcta, conservar la demo, compilar con `npm run build:production` y únicamente la conexión pública del proyecto TruckControl. Verificar canal/commit/estado limpio/PWA, enviar el mismo commit al Git autorizado del sitio y empaquetarlo sin secretos. Guardar y desplegar sólo ese archivo y ese commit; no usar el archivo candidato desconectado como si fuera producción. Confirmar versión/estado final, HTTPS y recorridos públicos antes de afirmar que CargoTrack está publicado. Conservar v32/v31 y demo6 para recuperación.

No hay versión nueva publicada por integrar el PR ni por disponer de un archivo de CI. La recepción de credenciales de Git es válida únicamente para su sitio y no habilita su exportación, logs o almacenamiento en GitHub.
