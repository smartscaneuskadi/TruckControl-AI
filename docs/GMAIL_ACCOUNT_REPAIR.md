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
-18recorridos focalizados correctos en Android/Windows emulados, con SDK real y transporte de proveedores ficticio. La regresión completa y el arreglo de anchuras siguen en ejecución al crear este documento; no se presentan como verdes todavía.
- No se han contratado servicios ni activado cobros, IA o lecturas reales. Los dispositivos físicos y la revisión pública de Google siguen sin aceptación nueva.

Publicar backend antes de la interfaz, verificando sus fuentes y respuestas401/403 sin credenciales. Conservar company-gmailv14 como fuente de recuperación y Sites38 como versión anterior. Tras CI y revisión verdes, preparar un checkout de producción con la identidad existente; nunca desplegar el manifiesto de demo de main. Registrar los identificadores y la aceptación publicados al terminar.

Bloqueo externo restante: el secreto real rechazado necesita un valor válido del cliente existente; no hay conector administrativo Google ni otra copia válida encontrada. La reparación de interfaz no inventa ni sustituye esa credencial. Mantener issue97 abierta hasta la aceptación empresarial y pública.
