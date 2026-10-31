# Entrega actual — TruckControl AI 0.3.0

**Versión 6 publicada y verificada por HTTPS:** https://truckcontrol-ai-fase-1.earlymug513.chatgpt.site. La versión 5 anterior se conserva para recuperación. Se mantiene el mismo dominio y los datos ficticios existentes.

Repositorio oficial: https://github.com/smartscaneuskadi/TruckControl-AI. Código integrado en `main` mediante [PR #2](https://github.com/smartscaneuskadi/TruckControl-AI/pull/2), sin reescribir historial. Rama conservada: `feat/demo-recovery-alerts`. Fuente publicada `b335b28cb0070abe8a28cba3f0a041170d42218c`; merge `476f3a3e2ba92a4c73e5d279e3f3b2446d89d99f`.

## Qué cambia

El centro de Alertas permite buscar y filtrar urgentes y próximos vencimientos. La campana incorpora avisos operativos de los módulos autorizados. Las revisiones por kilómetros utilizan lecturas de repostajes ya realizados y una clave estable: al reconocer un aviso, no reaparece solo porque cambie el día. Los avisos manuales se revisan actualizando el registro existente. Reconocer un aviso no renueva permisos ni completa mantenimientos.

En **Configuración → Copias y recuperación de la demo** se exportan y restauran fichas y operaciones. La vista previa valida el archivo sin modificar datos; la confirmación conserva un punto anterior. Los cambios de otra pestaña y los fallos de cuota impiden sobrescribir el estado actual. Los PDF e imágenes se conservan aparte y no se incluyen en el JSON. Se siguen leyendo las copias antiguas y se conserva la clave de operaciones heredada. Guía: [DEMO_RECOVERY.md](DEMO_RECOVERY.md).

Las pruebas de actualización desde la versión anterior comprueban que se conservan rutas editadas, movimientos económicos y clientes/operaciones. Los archivos de la biblioteca permanecen disponibles tras restaurar y recuperar el estado anterior. La demo y sus copias son locales, sin cifrar y exclusivamente para datos ficticios.

## Verificación

**216 pruebas aprobadas:** 150 unitarias/SQL, 42 de demo en escritorio/Android, 8 de empresas y 16 SaaS. Las 64 originales permanecen intactas; once archivos retenidos se verifican mediante SHA-256. TypeScript, compilación PWA y análisis de dependencias de ejecución correctos; cero vulnerabilidades de ejecución detectadas.

[CI de la rama](https://github.com/smartscaneuskadi/TruckControl-AI/actions/runs/41225009144) y [CI del PR](https://github.com/smartscaneuskadi/TruckControl-AI/actions/runs/41225014197) completados correctamente. También se probó el paquete comercial sin credenciales: portal, demo, exportación/restauración con recarga, punto de recuperación, recarga fría offline y alertas, en ambos perfiles, sin solicitudes a proveedores.

El índice, JavaScript, CSS y service worker públicos coinciden con el paquete construido desde el commit publicado. El manifiesto e iconos PWA responden por HTTPS. Los perfiles de navegador son emulaciones Chromium, no dispositivos físicos. La CA de interceptación del entorno limita el recorrido de Chromium sobre el dominio remoto; no se desactivó la validación TLS. Se verificaron HTTPS y hashes por separado.

## Lo aplazado por el propietario

La apertura comercial y los servicios externos quedan para más adelante: SMTP/redirecciones alojadas de Auth, confirmación real de la cuenta administradora, Google OAuth y su revisión, SMS, modelos IA, pagos, aceptación física y ensayo de restauración comercial en un destino autorizado. No se han activado costes, registrado empresas reales ni enviado documentos a modelos.

Supabase continúa separado en **truckcontrol-ai** (`kkkemaycedexymrpaqtp`, organización `fixpilot-dev`), con 37 migraciones y tres funciones Edge existentes. Esta actualización no modifica la base de datos, Auth, Storage, credenciales ni proveedores. FIXPilot permanece intacto y merymery_16 pausado con su contenido conservado. La activación real sigue cerrada.

La escritura GitHub y el CI funcionan. Los permisos administrativos de Pages/protección de ramas siguen limitados; no se eluden. El alojamiento público continúa en Sites.

Se conservaron Git bundles verificables, ZIP de fuentes, TAR de despliegue, capturas y procedencia. La versión de recuperación web es la 5. Los artefactos y comprobaciones se registran en [release-0.3.0.json](verification/release-0.3.0.json). Documentación de la entrega anterior archivada en `history/20261031/`. Registro persistente: [PROGRESS.md](PROGRESS.md).
