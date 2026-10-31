# Verificación — TruckControl AI 0.3.0

**Resultado consolidado: 216 pruebas aprobadas**, incluidas las 64 originales. La guardia `verify:retained` comprueba por SHA-256 once archivos de pruebas anteriores; no se modifican para hacerlos pasar.

| Batería | Casos | Alcance |
| --- | ---: | --- |
| Vitest / PostgreSQL PGlite | 150 | Dominio, dinero, persistencia, roles, RLS, documentos, Gmail, IA simulada, cifrado offline, alertas y recuperación. |
| Demo Playwright | 42 | Escritorio y Pixel 7; flota, cálculos, navegación, documentación, alertas, compatibilidad y copias. |
| Empresas Playwright | 8 | Cuentas y empresas con transporte simulado, en ambos perfiles. |
| SaaS Playwright | 16 | Planes, registro, administración y sincronización cifrada, en ambos perfiles. |

[CI de la rama](https://github.com/smartscaneuskadi/TruckControl-AI/actions/runs/41225009144) y [CI del PR](https://github.com/smartscaneuskadi/TruckControl-AI/actions/runs/41225014197), ambos correctos. Los logs del job confirman 20 archivos Vitest/150 casos y baterías de navegador de 42, 8 y 16. TypeScript, guardia de hashes y build PWA correctos. `npm audit --omit=dev` no detectó vulnerabilidades de ejecución. El escaneo de patrones del código preparado no encontró claves de proveedores ni claves privadas.

## Recuperación y compatibilidad

Once casos de dominio cubren formato y alcance, referencias, contabilización huérfana, copias antiguas, tamaño máximo, vista previa sin escrituras, restauración conjunta, punto anterior, falta de espacio, vista previa obsoleta, edición posterior y restablecimiento de operaciones. La actualización del formato heredado conserva sus ediciones y deja la clave antigua intacta.

Los recorridos reales de navegador comprueban exportación, cancelación, confirmación, recarga, recuperación del estado anterior, persistencia de PDF de prueba, rechazo de JSON inválido y datos ajenos, cambios hechos en otra pestaña y compatibilidad con las ediciones de la demo anterior. Las importaciones y datos usados son ficticios y no se transmiten fuera del navegador.

Las pruebas de cuota simulan un fallo de escritura y comprueban que no aparece un espacio restaurado a medias. El conjunto de fichas/operaciones se confirma en una sola escritura local. Las copias no contienen binarios de documentos, no están cifradas y no son un backup de Supabase.

## Avisos de flota

Se comprueban claves de mantenimiento estables entre días, reaparición al cambiar un umbral, uso de repostajes realizados sin anticipar fechas futuras, prioridad manual urgente y revisión sin duplicados. Los recorridos verifican la campana y el centro de Alertas, filtros, accesibilidad y reconocimiento después de cambiar de día.

## Seguridad y aislamiento conservados

Las migraciones completas se prueban con roles `anon`, `authenticated` y `service_role`. Se comprueban separación entre empresas, claves externas compuestas, invitaciones y revocación, límite de 50 camiones, permisos de consulta, versiones concurrentes y contabilización idempotente. No se puede elevar el rol mediante metadatos ni asignar el origen financiero desde el navegador.

Las políticas documentales separan los adjuntos Gmail del archivo general, excluyen objetos huérfanos y de otras empresas y revocan descargas al suspender. El asistente y Gmail se prueban con fetch simulado; no se consume ningún modelo real. Las pruebas offline cubren AES-GCM, PBKDF2, manipulación, ámbitos, expiración, conflictos, reintentos sin duplicados y bloqueo tras suspensión.

La actualización 0.3.0 no ha cambiado ni migrado Supabase. Las verificaciones remotas de la entrega anterior, con datos sintéticos y rollback, y su asesor de seguridad sin incidencias se conservan en la documentación histórica y los scripts SQL de `verification/`. FIXPilot no se modifica.

## Paquete y publicación

Se comprobó el paquete comercial sin claves en escritorio/Android: portal → demo → exportación/restauración con recarga → punto de recuperación → recarga fría offline → alertas. No hubo llamadas a Supabase, Google ni modelos. El paquete limpio contiene solo el bundle de entrada vigente; el precaché ocupa aproximadamente 947 KiB.

En la versión pública se verificaron TLS, HTTP 200, manifiesto/iconos y coincidencia del índice, CSS, JavaScript y service worker con el artefacto. La CA de interceptación del entorno impide repetir el recorrido con Chromium remoto; no se ignoraron errores de certificados. Las pruebas de navegador corresponden al paquete local y a CI.

## Límites reales

Android/Windows son perfiles de emulación de Chromium en Linux, no dispositivos físicos. La apertura comercial y los proveedores externos están aplazados por el propietario: faltan entrega de correo y redirecciones Auth reales, Google OAuth público, activación opcional de SMS/IA/pagos y ensayo de recuperación de servidor en destino autorizado. Las pruebas con proveedores simulados no sustituyen esa aceptación.

Axe comprueba una parte de WCAG A/AA. Offline requiere una carga previa correcta; una copia cifrada ya autorizada no puede conocer una revocación nueva sin red antes de su caducidad. Las garantías y límites están en [ARCHITECTURE.md](ARCHITECTURE.md). No se han validado APK/EXE porque se distribuye una PWA.

## Repetición

`npm run check` ejecuta guardia de hashes, TypeScript, Vitest y build. `npm run test:e2e`, `npm run test:e2e:companies` y `npm run test:e2e:saas` ejecutan los navegadores. Las dos últimas construyen copias aisladas con credenciales ficticias interceptadas. CI utiliza permisos de solo lectura y acciones fijadas por SHA.
