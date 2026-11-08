# Android · candidato de compilación

Proyecto TWA que reutiliza la web HTTPS existente, sus temas y permisos. Identidad preparada: com.truckcontrolai.app; debug añade .debug. Todavía no hay publicación Play, firma comercial ni aceptación en dispositivo real.

El lanzador admite únicamente el origen https://truckcontrolai.com, sin puertos alternativos, credenciales o contenido local. Descarta los extras externos. No utiliza un WebView propio ni un puente JavaScript; no incorpora claves API, datos de empresa o publicidad. Reutiliza el icono existente. OAuth continúa en el navegador oficial. La sincronización y copia offline siguen los controles de la web, sin crear otro almacén empresarial nativo. La exclusión de backup corresponde al paquete, no al perfil de Chrome.

Compilación: AGP9.5.1, Gradle9.8.2 preinstalado en la imagen oficial Ubuntu24.04 de GitHub, con versión exacta comprobada, Browser Helper2.7.4, SDK/target36 y Java17. El workflow utiliza el SDK y Java21 preinstalados en GitHub; no ejecuta aceptación automática de licencias ni compra servicios. Si faltan los componentes instalados, falla. Las dependencias se descargan de Google/Maven Central por HTTPS.

Artefactos de prueba: APK debug con firma efímera de CI, AAB release sin firmar, resultados JUnit/lint y hashes. La verificación exige cinco pruebas JVM sin omisiones y comprueba permisos, niveles API, red y backup en el manifiesto del APK compilado. No se publica una clave comercial. El AAB no puede publicarse así. El certificado debug tampoco se añade al dominio. Sin Digital Asset Links válidos para la firma comprobada, el navegador conserva su barra como Custom Tab; no se desactiva esa validación.

CI8/9 del head1866f8d SUCCESS:5JVM sin fallos/omisiones,lint y manifiesto compilado verificados. [Recibo y hashes](../docs/verification/android-candidate-20261108.json). APK de prueba y AAB unsigned guardados como artefacto13612255717,retención3días; una futura compilación tendrá otros hashes/certificado efímero y requiere su propia verificación.

Antes de tienda: confirmar cuenta/identidad Play, nombre de paquete, términos y verificación del titular; custodiar clave de carga recuperable fuera de GitHub; obtener certificado Play y publicar assetlinks.json correcto; revisar política de pagos y Data Safety/privacidad; probar acceso, OAuth, documentos, descargas, copias y desconexión en emulador y dispositivos físicos; enviar a revisión. Compilar no equivale a publicar.

Referencias oficiales:
- https://developer.android.com/build/releases/agp-9-5-0-release-notes
- https://developer.chrome.com/docs/android/trusted-web-activity/quick-start
- https://support.google.com/googleplay/android-developer/answer/11926878?hl=es
- https://developer.android.com/studio/terms
- Licencia de la dependencia: https://github.com/GoogleChrome/android-browser-helper/blob/main/LICENSE
