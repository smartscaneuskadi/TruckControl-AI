# Android · candidato de compilación

Proyecto TWA que reutiliza la web HTTPS existente, sus temas y permisos. Identidad preparada: com.truckcontrolai.app; debug añade .debug. Todavía no hay publicación Play, firma comercial ni aceptación en dispositivo real.

El lanzador admite únicamente el origen https://truckcontrolai.com, sin puertos alternativos, credenciales o contenido local. Descarta los extras externos. No utiliza un WebView propio ni un puente JavaScript; no incorpora claves API, datos de empresa o publicidad. Reutiliza el icono existente. OAuth continúa en el navegador oficial. La sincronización y copia offline siguen los controles de la web, sin crear otro almacén empresarial nativo. La exclusión de backup corresponde al paquete, no al perfil de Chrome.

Compilación: AGP9.5.1, Gradle9.8.2 preinstalado en la imagen oficial Ubuntu24.04 de GitHub, con versión exacta comprobada, Browser Helper2.7.4, SDK/target36 y Java17. El workflow utiliza el SDK y Java21 preinstalados en GitHub; no ejecuta aceptación automática de licencias ni compra servicios. Si faltan los componentes instalados, falla. Las dependencias se descargan de Google/Maven Central por HTTPS.

Artefactos de prueba: APK debug con firma efímera de CI, AAB release sin firmar, resultados JUnit/lint y hashes. La verificación exige cinco pruebas JVM sin omisiones y comprueba permisos, niveles API, red y backup en el manifiesto del APK debug compilado. El AAB de release tiene una comprobación independiente descrita abajo. No se publica una clave comercial. El AAB no puede publicarse así. El certificado debug tampoco se añade al dominio. Sin Digital Asset Links válidos para la firma comprobada, el navegador conserva su barra como Custom Tab; no se desactiva esa validación.

CI8/9 del head1866f8d SUCCESS:5JVM sin fallos/omisiones,lint y manifiesto compilado verificados. [Recibo y hashes](../docs/verification/android-candidate-20261108.json). APK de prueba y AAB unsigned guardados como artefacto13612255717,retención3días; una futura compilación tendrá otros hashes/certificado efímero y requiere su propia verificación.

Antes de tienda: confirmar cuenta/identidad Play, nombre de paquete, términos y verificación del titular; custodiar clave de carga recuperable fuera de GitHub; obtener certificado Play y publicar assetlinks.json correcto; revisar política de pagos y Data Safety/privacidad; probar acceso, OAuth, documentos, descargas, copias y desconexión en emulador y dispositivos físicos; enviar a revisión. Compilar no equivale a publicar.

## Manifiesto del AAB de release · 13/11/2026

`scripts/verify_android_release.py` usa **bundletool oficial de Google 1.18.3**, fijado en `bundletool.lock.json`. Antes de ejecutar Java exige tamaño, SHA-256 y versión exactos. El SHA-256 `a099cfa1543f55593bc2ed16a70a7c67fe54b1747bb7301f37fdfd6d91028e29` corresponde al digest publicado del [artefacto oficial](https://github.com/google/bundletool/releases/tag/1.18.3); no se actualizan AGP, Gradle, Browser Helper o SDK por esta comprobación.

El workflow interpreta el **AAB generado por `:app:bundleRelease`**, con un solo módulo base y sin firma. Comprueba paquete release, API24/36, permisos, componentes exportados, backup/red y ausencia de flags debug/test. Exige el lanzador TWA, enlace verificado y URL HTTPS exactos, y resuelve los recursos compilados de `asset_statements` y reglas de extracción. Solo admite el origen existente; esta lectura no publica ni modifica Digital Asset Links. Se reconocen de forma explícita la actividad de atajos de Browser Helper2.7.4 y el receptor de Profile Installer protegido por `android.permission.DUMP`; otros componentes exportados fallan.

El informe distingue `debug_compiled_manifest_verified` y `release_aab_manifest_verified`. Un fallo conserva el segundo como falso. El resultado positivo se vincula al SHA-256 del AAB ya registrado y conserva siempre `commercial_signed=false`, `play_published=false` y `physical_device_verified=false`. El artefacto de CI incluye el XML interpretado y los dos informes de recursos.

Pruebas locales enfocadas: `python3 -m unittest discover -s tests/python -p 'test_android_release_manifest.py'`. Verifican el contrato de fuentes, casos rechazados y la frontera del inspector con fixtures; **no son evidencia de un AAB compilado**. Esta ampliación requiere el workflow Android correcto del head exacto antes de acreditar el nuevo manifiesto release. El recibo histórico anterior solo verificó el manifiesto debug y se conserva sin reescribirlo.

Referencias oficiales:
- https://developer.android.com/build/releases/agp-9-5-0-release-notes
- https://developer.chrome.com/docs/android/trusted-web-activity/quick-start
- https://support.google.com/googleplay/android-developer/answer/11926878?hl=es
- https://developer.android.com/studio/terms
- Licencia de la dependencia: https://github.com/GoogleChrome/android-browser-helper/blob/main/LICENSE
