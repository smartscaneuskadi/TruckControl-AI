# Fuente de producción de reparación Gmail/cuenta

Checkout independiente preparado desde la fuente publicada38 `ee43c0267bee67f45002b9a13736eaeb7cdb94f6` e incorporando el commit revisable del PR98 `a65bcb451a9a382b9a9c365a1e5889b460e5e577`. El manifiesto conserva exclusivamente el proyecto de producción existente. Main y la demo conservan su propia identidad.

El empaquetado exige la38 como baseline y reutiliza únicamente su configuración pública del navegador, validando proyecto, canal, fuente limpia, PWA y cobrosOFF. Comprueba que el bundle contiene el acceso a cuenta y el protocolo de comprobación Google, conservando CargoTrack y salida SDK. No recibe secretos de conectores o credenciales OAuth.

Este documento no acredita publicación. Antes de desplegar: CI completo verde de implementación y de esta fuente exacta, PR98 revisado e integrado, backend Gmail actualizado/verificado con las9fuentes runtime y pruebas de permisos. Enviar el commit exacto por la credencial oficial de Sites, guardar y desplegar el artefacto correspondiente; comprobar HTTPS, hashes y recorridos de cuenta/Gmail sobre el bundle publicado. Conservar38 para recuperación y no activar cobros ni inventar aceptación de un buzón.
