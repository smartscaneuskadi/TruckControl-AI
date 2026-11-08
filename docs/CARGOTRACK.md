# CargoTrack y cierre de sesión

## Publicación CargoTrack y Cerrar sesión verificada · 08/11/2026

**Este bloque sustituye el estado de publicación y ejecutor de las notas históricas inferiores.** Producción **Sites33 / app0.5.21-rc.1**, https://truckcontrolai.com; source **89100d92c0b44d2b86c1495faffcab2944abacbb**, deploy **appgdep_6af0a4fe4ec881919f08b7ac80cda8d9 SUCCEEDED**. PR85 integrado en main1d3e88e; no volver a fusionarlo ni reconstruir CargoTrack/logout. Se conservan32/31 y demo6. Main mantiene el manifiesto de demo: no desplegarlo como producción.

Ejecutor recuperado: shell, Git, descarga y Chromium funcionan. La red del sandbox no alcanza el proxy; el mismo comando por la escalada oficial funciona con proxy/CA heredados y TLS activo. No pedir al titular otra reconexión ni exportar credenciales a Actions. Copia Git de todos los refs locales verificada antes del fetch; sin reset ni sobrescritura. Fuente exacta enviada por Git de Sites y leída de vuelta, después save/deploy del archivo de Actions42496353868, artifact13623149793.

**Pruebas:** CI completo de release42496353761 y PR42497386164/42497390339 SUCCESS,1.558 comprobaciones por ejecución; postmerge42498406754 SUCCESS;64 originales/11hashes conservados. Después de publicar: **75/75 hashes HTTPS**, **6/6 perfiles públicos** en3orígenes y **16/16 casos CargoTrack/logout** sobre el bundle publicado,0fallos/omisiones/flaky. Las16 pruebas usan SDK real y transporte HTTP ficticio; comprueban doble pulsación, rechazo remoto honesto, Atrás/recarga/BFCache, copia cifrada y logout entre pestañas. No certifican una sesión nativa de un cliente. Android/Windows emulados, sin hardware físico ni login CargoTrack real.

Sin DDL, cambios Edge, compras ni llamadas IA nuevas; Native63/#37, aislamiento y cuotas10USD/mes–100llamadas/empresa intactos. Cobros reales y lanzamiento comercial global siguen cerrados/pendientes. Presupuesto histórico y saldo200EUR sin conciliar. PR82/83/87/88 permanecen separados. La automatización existente se observó pausada; no prometer ejecución continua.

Evidencia durable: [recibo v33](verification/cargotrack-v33-published-20261108.json); hashes y perfiles detallados enlazados dentro. Antes de una nueva entrega, volver a consultar main, PR y versión pública actuales; no promover891 ni32 si hay avances posteriores.

Verificación reproducible (la ejecuta Codex, no requiere comandos del cliente): `npm run verify:published` comprueba seis perfiles públicos; `node scripts/verify-published-cargotrack.mjs` reutiliza las ocho regresiones originales para dos perfiles sobre HTTPS. Sólo cambia las URLs/CORS de fixtures; no elimina aserciones, no llama a proveedores de pago y limpia únicamente su carpeta temporal exclusiva. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` puede indicar el navegador de sistema. Los resultados se guardan en `TRUCKCONTROL_PUBLIC_CARGOTRACK_ARTIFACTS` o `public-cargotrack-results`.

Para probar: abre https://truckcontrolai.com, aplica el aviso «Actualizar» si tienes una PWA anterior y entra. CargoTrack aparece en el menú; «Entrar en CargoTrack» abre el proveedor en una pestaña independiente. En una cuenta de empresa en línea, «Cerrar sesión» está debajo de Configuración y vuelve al acceso. La demo no muestra ese botón. La sesión CargoTrack permanece independiente.

## Descripción técnica y checkpoints anteriores

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
