# Registro de reanudación — 31 de octubre de 2026

Repositorio: https://github.com/smartscaneuskadi/TruckControl-AI

Rama de trabajo: `feat/dedicated-supabase-project`.

Se recuperaron 125 archivos y el historial completo del commit `451597eac31792478b26309dfb1b188babbc9dd0` desde el respaldo de Sites y se subieron a GitHub. La copia publicada anterior se conserva en https://truckcontrol-ai-fase-1.earlymug513.chatgpt.site.

El entorno volvió a funcionar. Se instaló exactamente `package-lock.json`, conservando versiones e integridades; la caché de npm se ubicó en `/tmp` porque el directorio personal no permite escritura. Las 117 pruebas del respaldo, la compilación TypeScript y la compilación PWA pasaron antes de las modificaciones de esta sesión.

Se recuperaron del proyecto independiente `kkkemaycedexymrpaqtp` las migraciones ya aplicadas de consulta documental IA y protección del origen de los apuntes. Sus versiones, nombres y sumas SHA-256 están en `deployment/recovered-migrations.json`. **No volver a ejecutar esas migraciones en ese proyecto** ni aplicar ciegamente `supabase db push`: las migraciones iniciales se desplegaron en lotes y el historial remoto difiere del historial fuente. Revisar y conciliar antes de nuevos despliegues. FIXPilot no se ha modificado.

Se recuperó el código servidor de `company-assistant` desde la función desplegada. La consulta IA y su cuota están sujetas a autenticación, empresa, permisos, autorización individual y configuración del proveedor. No se han activado proveedores, cobros ni consumo IA.

Se corrigió el fallo de Android: las etiquetas accesibles ocultas de las tablas ampliaban el viewport de 412 a 504 píxeles. El anclaje de `.sr-only` evita ese desbordamiento sin quitar las etiquetas accesibles. Ahora el viewport mantiene 412 píxeles y se puede pulsar Configuración.

Se restauraron informes, pruebas del asistente documental y del cifrado offline. Se añadieron controles de precisión monetaria, mililitros y kilometraje. Las 131 pruebas unitarias/SQL y las 16 pruebas SaaS de escritorio/Android pasaron. Estas últimas comprueban recarga sin red, almacenamiento cifrado, conservación ante conflictos, reintentos sin duplicados y bloqueo tras suspensión de la cuenta.

La batería de flota pasó 27 de 28 casos y detectó una región desplazable de informes sin acceso por teclado en Android. Se añadió foco y nombre accesible y los seis casos de módulos, navegación y contabilización pasaron en escritorio/Android. Los otros 22 casos de flota ya habían pasado. Las ocho pruebas de empresas también pasaron. Las 64 pruebas originales y las ampliaciones anteriores siguen intactas: once archivos verificados por SHA-256. El análisis de dependencias de ejecución no encontró vulnerabilidades.

GitHub admite lectura, ramas y escritura de código. Los endpoints administrativos de Pages, permisos Actions y protección de ramas devuelven «Resource not accessible by integration» (403); son permisos distintos de contenido. La publicación continuará en Sites sin contratar servicios. Se verificó que la versión pública anterior sigue activa (versión 4). Pendiente antes de la siguiente publicación: CI, documentación de entrega y empaquetado. La biblioteca de demostración se revisa a continuación.

El alta real sigue cerrada en Supabase. Faltan configuración de correo/redirects de Auth y credenciales Google OAuth para el uso comercial. SMS, modelos IA y pagos permanecen opcionales y desactivados. Ninguna empresa real se ha registrado durante las comprobaciones.
