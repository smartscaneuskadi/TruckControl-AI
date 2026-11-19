# Gmail: acceso desde el dominio oficial

Publicada y verificada el 19/11/2026 UTC en **Sites52 / 0.5.32-rc.2**. [Abrir Correo](https://truckcontrolai.com/#/mailbox). [Recibo verificable](verification/google-origin-published52-20261119.json). PR159 integrado; fuente `0f3e311b4aaf3eaea632b3a7f0ad76e69cee740a`.

## Error reproducido

Google devuelve «Acceso bloqueado: error de autorización», `400/origin_mismatch`, cuando la autorización empieza en www o en el hostname técnico. Desde `https://truckcontrolai.com` abre su inicio de sesión. Se ha comprobado con Google real en escritorio y Pixel7 emulado, sin identificar cuentas ni aceptar permisos. El origen usado por el titular todavía no está confirmado.

Google admite orígenes JavaScript exactos. Compartir aplicación y HTTPS no autoriza todos sus alias. Este error es distinto del antiguo `invalid_client` empresarial: el Correo unificado utiliza el cliente público y los permisos temporales del buzón elegido, sin necesitar ese secreto heredado.

## Comportamiento publicado

Las dos vistas del Correo evitan iniciar la autorización desde direcciones públicas distintas de la canónica. Ofrecen un enlace fijo al Correo oficial en otra ventana con `noopener`, `noreferrer` y sin referencia. No lleva correo, empresa, sesión, códigos o tokens. El formulario y el trabajo anteriores permanecen abiertos; la nueva ventana usa el acceso normal de TruckControl. No se comparten credenciales entre orígenes ni se hacen redirecciones automáticas. Los previews locales aislados siguen disponibles.

No cambia el acceso al buzón propio, otros proveedores, aislamiento de empresa o consentimiento separado para importar facturas por IA. No se recrea el cliente ni se amplían los permisos de Google.

## Pruebas y alcance

Las tres CI de rama, PR y fuente exacta son SUCCESS: 2.302 unitarias/SQL, 154 Python, 94 demo, 62 empresa, 274 SaaS, 98 MFA, 44 FULL, 68 documentos, 172 correo, 12 orígenes, 20 candidata, 20 producción y seis perfiles públicos previos por ejecución. Los 64 originales y 11 hashes se conservan.

Después de publicar pasan 105 hashes en tres orígenes, seis perfiles PWA, cinco controles de salud y 172 recorridos sobre el bundle servido, sin fallos, omisiones o flaky. Los 12 casos nuevos previos cubren tres orígenes, formulario conservado, ausencia de solicitudes rechazadas, enlace sin información privada, separación de sesiones, cuatro idiomas, ambos temas y vista heredada. Son emulación y HTTP privado ficticio con la aplicación y SDK reales, no una nueva aceptación de buzón, IA o hardware.

El primer arnés intentó usar un backend local ficticio desde un origen público y el producto lo rechazó correctamente. Se conserva ese fallo. El arnés corregido usa una clave ficticia y la URL exclusiva, intercepta todo el HTTP privado y deniega solicitudes desconocidas y WebSockets. No rebaja el guard del producto. El primer Android del PR falló al resolver dependencias Maven; el reintento oficial pasó sin cambiar versiones o controles.

## Recuperación y límites

Sites51/c592, su archivo nativo y demo6 se conservan. Las 76 migraciones, backend, credenciales, datos, RLS, IA10USD/mes y 100 llamadas por empresa no cambian. Stripe y cobros siguen apagados; ventas, FULL y facturas son manuales. Cero compras, modelos, mensajes o navegación de pago nuevos; histórico agregado200EUR sin conciliar.

La aprobación pública de Google y el consentimiento efectivo de una cuenta siguen sin acreditar. Un inicio de sesión visible no demuestra esos estados. Ante otro rechazo después de elegir cuenta en el dominio canónico se debe identificar su texto real y el expediente existente, sin repetir marca, proyecto, cliente, claves o consentimientos a ciegas. [Expediente existente](GOOGLE_PUBLIC_VERIFICATION.md).
