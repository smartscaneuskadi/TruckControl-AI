# Recuperación del frontend con MFA y nuevas altas desactivadas

La versión pública comprobada es **Sites47 / 0.5.29-rc.1**, fuente
`8884595c7436d0702b97a79f653a08e8d8f4ff4b`, en
https://truckcontrolai.com. Su despliegue
`appgdep_6afa4acb4aa0819188f07f6196c6ec78` terminó correctamente el
16/11/2026 a las 00:14:18 UTC. Se conservan Sites46, las versiones anteriores y
la demo6. Las referencias públicas de `candidate-hosting.json` proceden del
recibo de la operación oficial y de la comprobación HTTPS de `release.json`.

## Por qué hace falta otra fuente

El ensayo local de recuperación de la fuente888 compiló un frontend compatible
con MFA con `VITE_MFA_ENROLLMENT_ENABLED=false` y superó sus seis casos de
navegador. Al intentar guardarlo, Sites devolvió la versión47 existente por
idempotencia del commit. La inspección posterior confirmó que el archivo
original de47, SHA256
`5c8341f764bab62c232b8b695a52016df5f013efc6eda052f24b5e04c0af61ef`, y
su despliegue seguían intactos. **Ese intento no creó una versión48 ni una copia
de recuperación independiente.**

Esta rama prepara un commit distinto para poder identificar y guardar después
un artefacto de recuperación separado. El delta se limita a esta guía, al
helper local, a la referencia de la publicación47 y a actualizar la barrera del
empaquetador al commit público888. Esa barrera sigue rechazando cualquier otra
fuente pública sin revisión. No cambia código de producto, permisos, SQL,
pagos, usuarios ni configuración gestionada.

## Protección que debe conservarse

La recuperación desactiva **solo nuevas altas de autenticadores en el frontend**.
Mantiene el desafío de factores existentes, su gestión y descarte de altas
pendientes. Una versión anterior a MFA no sirve para recuperar cuentas ya
enroladas.

Debe conservarse la migración75 ya aplicada una sola vez,
`20261115221404_optional_totp_session_protection.sql`, SHA256
`b830a21224d64acffeb3dedc1938b8676aa131db4e4347914c35ea01fd387be7`.
No se repite ni se retira. La guardia SQL de retirada rechaza siempre eliminar
su enforcement y exige una migración forward revisada si algún día cambia esa
protección. Se conservan FULL74, su aislamiento y sus bloqueos OFF/vencimiento;
los cobros automáticos continúan desactivados.

## Preparación local desde una fuente final verificada

`scripts/prepare-mfa-recovery.mjs` es una copia byteidéntica del helper usado en
el ensayo local. Funciona en el ejecutor gestionado de este proyecto con Node,
Python3, Git, tar, Chromium existente en `/usr/bin/chromium` y las dependencias
fijadas ya instaladas. Exige un worktree nuevo bajo `/workspace/worktrees/` y
salida nueva bajo `/workspace/artifacts/`; no instala dependencias. Las rutas de
entrada se pasan explícitamente. Su verificación local crea y retira una carpeta
temporal junto al helper; el ejecutor debe poder escribir en ese directorio.

Antes de ejecutarlo deben estar disponibles el nuevo commit final limpio, sus
CI terminadas correctamente y **el paquete oficial correspondiente a ese mismo
commit**, junto con su recibo y la comprobación de procedencia/digest del
artefacto GitHub. No reutilizar un paquete de888,784 u otra fuente como si
perteneciera al nuevo commit.

La preparación sigue esta secuencia:

1. Conservar sin cambios el checkout público888 usado para comprobar47.
2. Revisar el delta de esta rama y generar su commit final; comprobar la CI
   exacta, el paquete oficial, su origen y los hashes antes de compilar.
3. Ejecutar el helper en modo `--build`, indicando fuente y versión completas,
   paquete/recibo/verificación CI, rutas nuevas y el SHA256 de SQL75. El helper
   crea otro worktree separado del mismo commit.
4. Ejecutar `--verify-local` sobre ese worktree y salida con
   `--expected-cases 6`. Revisar el tar, inventario, prueba y alcance resultantes.
5. Someter el artefacto y la procedencia a revisión antes de cualquier operación
   oficial posterior de guardado o despliegue.

El helper obtiene la conexión pública exclusivamente del paquete CI validado
en memoria y la pasa al proceso hijo; no crea `.env`, claves independientes,
registros de credenciales ni cambios de fuente. La conexión publicable
necesaria sigue formando parte del bundle del navegador. Rechaza secretos con
formatos conocidos en los archivos generados. Compila con canal `production`,
modo comercial y proveedor Resend existentes, pero altasMFA desactivadas;
comprueba fuente limpia, versión exacta, identidad de producción, manifiesto
PWA, controles MFA e integridad de SQL/backend.

Genera un tar y `truckcontrol-mfa-recovery-package.json` con
`mode=recovery`, `enrollment_enabled=false`,
`server_enforcement_retained=true`, hashes e identificación de su paquete CI.
El recibo mantiene `source_pushed=false`, `version_saved=false` y
`published=false`: producir o probar el archivo **no lo guarda en Sites ni lo
publica**. Una operación oficial posterior debe tener su propio recibo; la
existencia de otro commit no prueba por sí sola que se haya creado otra versión.

## Alcance de las seis comprobaciones locales

Tres casos existentes se ejecutan en Desktop Chrome y Pixel7 emulados: acceso
ordinario con altas desactivadas, limpieza de un factor pendiente y desafío de
un TOTP ya verificado incluso si falla la capacidad de nuevas altas. Se prueba
el bundle compilado con SDK real y transporte privado ficticio, bloqueando
HTTP no interceptado y todo WSS. No se contactan cuentas reales, Gmail,
modelos, proveedores de pago ni el backend gestionado.

Estos casos no acreditan hardware físico, instalación PWA/offline,
restauración gestionada, nuevas pruebas de Auth/PostgreSQL ni un despliegue.
Se conserva su evidencia previa sin repetir servicios o consumo. Esta
preparación no obtiene credenciales de fuente Sites, no hace push, no guarda
versiones y no despliega; producción47 sigue sirviendo su artefacto original.
