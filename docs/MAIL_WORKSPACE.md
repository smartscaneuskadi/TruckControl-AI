# Correo unificado

El menú tiene una única entrada Correo (`/mailbox`). Reúne el buzón Gmail existente (`/mailbox/gmail`), las facturas (`/invoices`, con los mismos permisos y callbacks) y accesos a proveedores. Gmail, Yahoo Mail, Webmail Porkbun y Outlook intentan abrir su web en la misma vista interna, igual que cualquier URL escrita por el usuario. No se crea una pestaña nueva. El cliente Gmail anterior se conserva en su ruta por compatibilidad, sin acceso especial en la portada. Las rutas históricas de facturas se conservan. No se modifican conectores backend, permisos, credenciales, migraciones ni cuotas.

El webmail HTTPS de dominio propio se abre tras pulsación explícita en un iframe persistente, igual que CargoTrack. La vista se conserva al navegar y se retira al cambiar usuario, empresa o contexto offline, o salir. No se almacenan direcciones, mensajes ni contraseñas en esta vista; cada proveedor gestiona su sesión. Las ventanas nuevas quedan bloqueadas por el sandbox. No se confunde carga con autenticación.

Comprobación pública sin credenciales el 08/11/2026: Gmail redirige a Google con X-Frame-Options DENY y Yahoo devuelve SAMEORIGIN. No se pueden integrar sus páginas originales en la PWA. Los botones intentan cargar esas páginas en el iframe; no se afirma que sus restricciones hayan desaparecido. La alternativa voluntaria usa target=_self. Porkbun utiliza su dirección oficial https://webmail.porkbun.com/; su prueba HTTP devolvió403, por lo que su login integrado no está acreditado. Un dominio comprado en Porkbun puede usar otro proveedor: introducir su URL real de webmail.

La alternativa de todos los iframes es abrir el proveedor en la misma pestaña y volver con Atrás. No se eliminan cabeceras del proveedor ni se promete que todos los correos funcionen dentro de un iframe. La lectura/envío autenticados requieren la cuenta y el consentimiento del titular; no se realizan envíos reales para probar este cambio.

## Varios correos abiertos

Sin máximo configurado: cada apertura añade una vista con identidad propia, incluso para el mismo proveedor. Añadir, seleccionar y cerrar una vista no recarga las demás. Las vistas se mantienen al navegar por TruckControl, no tras recargar toda la aplicación. El navegador y el proveedor gestionan cookies, cuentas y caducidad; dos vistas del mismo proveedor no equivalen a sesiones aisladas. La memoria del dispositivo limita la capacidad práctica.

## Comprobación local de esta revisión

Tipos y compilación correctos. Suite de112archivos/1191casos correcta antes del cambio final de vistas múltiples; las reglas de URL no cambiaron después. Prueba visual real de la revisión final en preview: Gmail1 y Yahoo2 permanecen al ir a Resumen y volver, y Añadir otro correo conserva ambas vistas. Gmail mostró error401 del proveedor y Yahoo rechazó su conexión integrada; no se introdujeron credenciales. No equivale a lectura/envío autenticados ni aceptación Android física. La regresión SaaS de varias vistas se ha preparado, pendiente de ejecutar en CI. El cambio sigue local, sin subida ni publicación por el bloqueo de aprobación anterior.
