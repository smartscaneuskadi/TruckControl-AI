## Cuenta y Gmail publicados · Sites39 · 08/11/2026 UTC

Los **6/6 perfiles PWA públicos de Sites39** también han pasado después de publicar: tres orígenes, dos dispositivos emulados, ambos temas y demo offline. No se envió correo ni se autenticó un buzón real.

Este checkpoint prevalece sobre los estados históricos inferiores. https://truckcontrolai.com está en Sites39/app0.5.21-rc.1, fuente `f861e42ece8ba7c83b42f493be611814113058c3`, despliegue `appgdep_6af1039c6574819182741d8ae52e14a5` SUCCEEDED. PR98 fusionado en `89ef16115c2a52492c270922370c9f43eb09d592`; Sites38 y demo6 conservados. Main mantiene el manifiesto DEMO: no publicarlo como producción.

CI de PR42533025198, rama42533020536 y fuente exacta42533027609 SUCCESS: **1.664 comprobaciones por ejecución**, sin sumar reejecuciones. Se conservan las64 originales/11hashes. Después de publicar: **75/75 hashes HTTPS y 42/42 recorridos de navegador**, sin fallos, omisiones ni flaky. SDK real con transporte ficticio y accesos privados no interceptados bloqueados. Android/Windows emulados; sin hardware físico ni nueva autenticación de un cliente real.

Backend `company-gmail`15 ACTIVE:9/9 fuentes y7/7 controles HTTP verificados; las otras11 funciones intactas. Sin DDL, compras, nuevas llamadas IA ni lectura/envío de correo. Native63, cuotas10USD/mes y100llamadas/empresa, precios, RLS y cobrosOFF conservados. No repetir #37 ni las migraciones aplicadas.

Gmail personal conserva la aceptación del titular. Gmail empresarial NO está conectado: Google rechaza la credencial guardada con401/`invalid_client`. No pedir repetir el consentimiento ni recrear proyecto/cliente. Hace falta un secreto válido del mismo cliente existente mediante el formulario privado. La validación de credenciales no acredita permiso de buzón ni verificación pública de Google. Issue97 sigue abierto.

«Cuenta» permanece en la barra superior en ambos temas y los cuatro idiomas. El cierre usa access.signOut(), bloquea los estados privados y las claves offline, conserva los datos y evita pulsaciones duplicadas. En demo se puede volver al acceso empresarial sin cerrar la sesión verificada.

La configuración tiene comprobación previa y posterior; un guardado cuyo runtime sigue rechazado no aparece como éxito. El diagnóstico exige administración global, no devuelve tokens, no crea vínculos y no consume IA. Comprueba autenticación del cliente mediante un código sintético inválido, nunca el consentimiento del buzón.

Recibo: [verificación](verification/gmail-account-repair-published-20261108.json). Los checkpoints candidatos inferiores se conservan como historia; sus pendientes ya completados no prevalecen.

# Reparación de cuenta y configuración Gmail

Continuación de la incidencia #97. La versión publicada al comenzar es Sites38, fuente `ee43c0267bee67f45002b9a13736eaeb7cdb94f6`. No se modifica la demo ni se repiten migraciones.

## Problemas comprobados

- El titular confirma que su Gmail personal conecta. La vinculación empresarial sigue sin completarse; los contadores agregados muestran cero vínculos y cero refresh tokens guardados.
- La validación real de la pareja OAuth de Vault, mantenida íntegramente en servidor y usando un código ficticio sin usuario, devuelve HTTP401/`invalid_client`. La credencial no había cambiado desde ese diagnóstico al comenzar esta reparación. No se han leído mensajes, usado códigos personales ni mostrado secretos.
- La configuración anterior solo comprobaba el formato de las credenciales. El retorno agrupaba fallos del cliente Google bajo un mensaje genérico y podía pedir otra autorización inútil.
- La salida estaba al final del menú y detrás de Apariencia en Configuración. La prueba nueva de anchuras encontró además el control de cuenta fuera de pantalla con la barra lateral y768px; se corrige la distribución, sin relajar la aserción.

## Cambios

- Control «Cuenta» visible en la barra, con identidad, Configuración, salida oficial y bloqueo de copia offline. Conserva el método `access.signOut()`, su deduplicación, revocación y limpieza privada. Desde la demo, una sesión existente puede volver al acceso de empresas; el servidor decide si muestra administración o empresa.
- La tarjeta de cuenta precede a Apariencia. No se obliga al usuario a recorrer toda la configuración para cerrar sesión.
- Administración → Servicios permite comprobar la configuración actual. El ID público ya guardado se rellena automáticamente.
- La comprobación permanece disponible aunque la credencial guardada tenga formato inválido; ese es precisamente un caso que debe poder diagnosticarse. La prueba del panel usa ID válido y secreto inválido, conservando la configuración hasta aceptar una sustitución.
- Antes de sustituir las credenciales se comprueba la pareja candidata con Google. Un rechazo o respuesta incierta impide llamar al RPC de guardado. Tras guardar, se vuelve a comprobar la configuración real del runtime; una respuesta anterior de caché no sustituye a la nueva.
- Las comprobaciones requieren sesión humana verificada y el permiso de administración global existente `tc_provider_control(status)`. No hay RPC nuevo, DDL, privilegios ampliados ni secretos en respuestas o logs.
- El inicio empresarial valida las credenciales antes de crear un estado OAuth o redirigir a Google. El callback identifica `invalid_client`/`unauthorized_client` con un código seguro; no muestra texto arbitrario del proveedor.
- Los cuatro idiomas existentes conservan su catálogo; se añaden16mensajes locales sin llamar a servicios de traducción.

## Alcance de la validación

La sonda hace un POST al endpoint fijo `https://oauth2.googleapis.com/token` con un código deliberadamente inválido, sin usuario. No sigue redirecciones, tiene un máximo de10segundos, agrupa concurrencia y cachea aceptación/rechazo un minuto por pareja. Solo `invalid_grant` con HTTP400 se interpreta como reconocimiento del cliente; `invalid_client`/`unauthorized_client` se rechazan, y cualquier otra respuesta queda sin verificar. No se devuelve ningún token, detalle remoto ni material de cifrado.

Esta comprobación **no acredita consentimiento, scopes, identidad de un buzón, revisión pública Google ni permiso de lectura de documentos**. El resultado explícito indica `client_authentication_only` y `mailbox_connected=false`. La prueba empresarial posterior sigue exigiendo autorización del titular, vínculo confirmado por servidor y una factura ficticia recibida.30días por defecto y máximo12meses se conservan; IA10USD/mes y100llamadas/empresa intactos.

## Verificación y continuidad

- `npm ci`, comprobación de tipos, `npm run check`:1248unitarias/SQL correctas;64originales/11hashes conservados.
-45pruebas Python y comprobación de tipos Deno2.9.6 del backend Gmail correctas.
-24recorridos focalizados correctos en Android/Windows emulados, con SDK real y transporte de proveedores ficticio; incluyen320–1440px y los cuatro idiomas. El CI de a65bcb4 completó1249unitarias/SQL,82demo,50empresa y192SaaS, pero falló dos comprobaciones Android de la candidata porque ocultaban el distintivo de datos ficticios. Se conserva el distintivo y se distribuye la barra en filas: no se modifica ninguna aserción. La revalidación completa del nuevo head queda pendiente; un CI parcial no se presenta como verde.
- No se han contratado servicios ni activado cobros, IA o lecturas reales. Los dispositivos físicos y la revisión pública de Google siguen sin aceptación nueva.

Publicar backend antes de la interfaz, verificando sus fuentes y respuestas401/403 sin credenciales. Conservar company-gmailv14 como fuente de recuperación y Sites38 como versión anterior. Tras CI y revisión verdes, preparar un checkout de producción con la identidad existente; nunca desplegar el manifiesto de demo de main. Registrar los identificadores y la aceptación publicados al terminar.

Bloqueo externo restante: el secreto real rechazado necesita un valor válido del cliente existente; no hay conector administrativo Google ni otra copia válida encontrada. La reparación de interfaz no inventa ni sustituye esa credencial. Mantener issue97 abierta hasta la aceptación empresarial y pública.
