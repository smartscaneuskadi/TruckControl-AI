# Verificación — versión 0.2.0

La revisión actual conserva las 64 pruebas originales. Once archivos anteriores se comprueban por SHA-256 con `npm run verify:retained`; el manifiesto indica el commit de referencia. No se modifican las pruebas retenidas para hacerlas pasar.

## Comprobaciones locales

- **134 pruebas Vitest/SQL** en 18 archivos: dominio, precisión monetaria/mililitros, kilometraje, repositorios, Gmail, SaaS, roles y operaciones, aislamiento documental, asistente y cifrado offline. TypeScript y compilación PWA correctos.
- **30 pruebas de demo**, perfiles Chromium escritorio 1440 px y Pixel 7, todas aprobadas en CI. Navegación, flota, cálculos, contabilización idempotente y accesibilidad; incluye biblioteca con validación de formato, asociación, persistencia, descarga exacta, borrado confirmado y ausencia de envíos externos. Se corrigieron desbordamiento del menú Android, foco del área de informes y contraste de mensajes de error.
- **8 pruebas de empresas**: cuentas, cambio de empresa, cierre de sesión, creación y confirmación con servicios simulados, en ambos perfiles.
- **16 pruebas SaaS**: planes, registro, SMS simulado, administración, preferencias IA, copia cifrada, recarga sin red, conflictos, reintentos sin duplicados y bloqueo tras suspensión, en ambos perfiles.

**Resultado consolidado de CI: 188 aprobadas (134 + 30 + 8 + 16).** [Ejecución del código publicado](https://github.com/smartscaneuskadi/TruckControl-AI/actions/runs/41180430504) y [ejecución del PR](https://github.com/smartscaneuskadi/TruckControl-AI/actions/runs/41198404303), ambas correctas. Se consultaron los logs del job: 18 archivos/134 pruebas Vitest, 30 demo, 8 empresas y 16 SaaS. Los artefactos Playwright incluyen trazas y capturas cuando hay fallos. Los reintentos no se cuentan como pruebas distintas.

## Seguridad comprobada

Las migraciones completas se ejecutan en PGlite con los roles `anon`, `authenticated` y `service_role`. Se verifican RLS entre empresas, claves externas compuestas, 50 camiones y rechazo del 51, roles de consulta, revocación, escrituras concurrentes, contabilización idempotente y bloqueo de `source_record_id` desde el navegador. Las cuentas de registro no pueden elevar privilegios mediante metadatos.

Los adjuntos de facturas se distinguen del archivo general: Gmail sin biblioteca no permite leer permisos de conductores ni otros documentos. Storage exige metadatos registrados visibles; los huérfanos y archivos de otra empresa quedan excluidos. La suspensión revoca también la descarga.

El asistente documental se prueba con fetch simulado: rechaza identidad/origen inválidos, configuración incompleta, documentos ajenos y cuota agotada antes de llamar al modelo; limita las referencias y no habilita herramientas ni almacenamiento del proveedor. No se transmite información a un servicio IA real.

Se prueba AES-GCM y PBKDF2, frase errónea, manipulación, ámbito de empresa/proyecto/usuario, caducidad y límites de cola. Los recorridos de navegador comprueban el almacenamiento cifrado real en IndexedDB y la revalidación antes de enviar cambios.

El análisis `npm audit --omit=dev` no señala vulnerabilidades de dependencias de ejecución a 31/10/2026. El escaneo de patrones no encontró secretos de proveedores ni claves privadas en el código preparado. Esto no sustituye una auditoría externa.

## Supabase remoto

En `kkkemaycedexymrpaqtp` se verificaron con SQL y rollback: aprovisionamiento de dos empresas ficticias con correo confirmado, prueba de 30 días, roles, invitaciones/aceptación, revocación, referencias cruzadas, cuota de 50 y aislamiento. No se enviaron correos ni SMS. Se comprobó que la columna de origen financiero no se puede escribir con el rol del navegador.

`verification/document-boundaries-rollback.sql` reproduce la comprobación documental con datos sintéticos. Se ejecutó correctamente y dejó cero usuarios sintéticos. No toca claves de proveedores. El asesor remoto de seguridad devuelve cero incidencias. El alta real sigue cerrada y no hay empresas, usuarios ni archivos reales.

## Alcance de las pruebas

Los perfiles Android/Windows son emulaciones de Chromium en Linux, no dispositivos físicos. Auth, Google, SMS, modelo IA y pagos usan simulaciones en los recorridos de navegador. Faltan entrega real de correo, redirecciones alojadas, OAuth Google público, llamadas a modelos autorizados, aceptación en dispositivos físicos y restauración remota en un destino aislado. No se ha validado APK/EXE porque la distribución es PWA.

Axe cubre parte de WCAG A/AA. La primera carga offline requiere una visita previa correcta. La revocación inmediata no puede conocerse sin red y una copia autorizada tiene una caducidad limitada: véase arquitectura.

## Repetición automatizada

`npm run check` ejecuta guardia de pruebas retenidas, TypeScript, Vitest y compilación. `npm run test:e2e`, `npm run test:e2e:companies` y `npm run test:e2e:saas` completan los recorridos de navegador. Las dos últimas construyen artefactos aislados y usan exclusivamente credenciales ficticias interceptadas. GitHub Actions ejecuta estas comprobaciones con permisos de solo lectura y acciones fijadas por SHA.

El paquete público se comprobó por HTTP con verificación TLS: índice, CSS, JavaScript y service worker idénticos a los archivos construidos desde el commit publicado; manifiesto e iconos correctos. El recorrido local del paquete de publicación pasó en ambos perfiles y confirmó recarga sin red. Se conservan capturas de panel y portal. Chromium remoto encontró una CA de interceptación no reconocida; no se ignoraron errores de certificados ni se afirmó haber completado un recorrido físico en el dominio público.
