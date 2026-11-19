# Gmail: acceso desde el dominio oficial

Diagnóstico del 19/11/2026 UTC, incidencia #97. Producción al comenzar: Sites51 /0.5.32-rc.1, fuente `c592945b7da8e2ddbed8b5bc54b80651b313224e`. La corrección 0.5.32-rc.2 es candidata hasta terminar CI y publicación.

## Error reproducido con Google

Sin iniciar sesión ni aceptar permisos, se ha abierto Google Identity Services real con el cliente público existente del proyecto468881730124 y el alcance `gmail.modify` previsto por la aplicación:

| Entrada de TruckControl | Respuesta de Google |
| --- | --- |
| `https://truckcontrolai.com` | HTTP200, pantalla oficial de inicio de sesión. |
| `https://www.truckcontrolai.com` | «Acceso bloqueado: error de autorización»,400/`origin_mismatch`. |
| Hostname técnico de producción | El mismo400/`origin_mismatch`. |

Google admite orígenes JavaScript exactos. Que una dirección sirva la misma aplicación por HTTPS no la convierte en un origen admitido por el cliente OAuth. El dominio utilizado por el titular todavía no está confirmado; esta reproducción no acredita el consentimiento de su cuenta ni la revisión pública de alcances.

No se confunde este fallo con el antiguo `invalid_client` del importador empresarial. El Correo unificado utiliza el cliente público en navegador, con credenciales temporales en RAM. No necesita el secreto del antiguo recorrido para acceder al buzón elegido.

## Corrección y uso

La entrada oficial es **https://truckcontrolai.com/#/mailbox**.

El Correo único y su vista heredada evitan abrir la autorización desde un origen público distinto del canónico. Muestran un enlace fijo al correo oficial en otra ventana, sin incluir dirección del buzón, empresa, sesión, códigos ni tokens. `noopener`, `noreferrer` y la política de referencia protegen el salto. El trabajo y el formulario de la ventana anterior permanecen abiertos. La nueva ventana usa el acceso normal de TruckControl; no hereda sus credenciales. Los previews locales aislados siguen disponibles.

No se hacen redirecciones automáticas, no se comparten sesiones entre orígenes ni se amplía el cliente de Google a dominios ajenos. Los otros proveedores, las cuentas conectadas, los datos de empresa y el consentimiento separado de importación IA permanecen iguales.

## Verificaciones

- `npm run check`:2.302 pruebas unitarias/SQL en172archivos,tipos,compilación y11hashes originales intactos.
- `npm run test:e2e:google-origin`:12casos,Windows/Android emulados yambos temas. Comprueban los tres orígenes, ausencia de solicitudes desde aliases rechazados, enlace sin información privada, ausencia de `opener`, separación de sesiones, formulario conservado,los cuatro idiomas yla vista heredada.
- El primer arnés de prueba intentó utilizar una conexión local ficticia desde un origen HTTPS público; la aplicación la rechazó correctamente. Se conserva ese fallo. El nuevo arnés usa una clave ficticia yla URL del proyecto exclusivo, con todas las solicitudes privadas interceptadas ylas desconocidas/WebSockets denegadas. No se rebaja el guard del producto.
- CI completa, regresión de correo ypublicación:pendientes al guardar este cambio. El recibo final debe distinguir estos resultados de una autenticación real.

[Diagnóstico público verificable](verification/google-origin-diagnostic-20261119.json). Recibos, capturas sin sesión yfallos iniciales: `/workspace/artifacts/truckcontrol-google-block-20261119`.

## Seguridad, costes y límites

No se han introducido credenciales personales ni leído/enviado mensajes. Cero compras, llamadas IA oautomatizaciones de pago. TinyFish sin saldo disponible: no se recarga ni se ejecuta. El histórico agregado200EUR sigue sin conciliar. IA10USD/mes y100llamadas/empresa,StripeOFF,suscripciones manuales,76migraciones ydemo6 conservados; sin cambios en backend,claves oRLS.

Un inicio de sesión visible no demuestra la aprobación pública deGoogle. Si el dominio canónico muestra otro rechazo después de seleccionar cuenta, se debe identificar su texto real yel estado del expediente existente. No recrear proyecto/cliente,reenviar secretos,cancelar revisiones ni repetir consentimientos sin diagnóstico. [Expediente público existente](GOOGLE_PUBLIC_VERIFICATION.md).
