# Fuente de producción de CargoTrack — todavía no publicada

Esta rama de entrega reutiliza el código de PR85, sin una implementación duplicada. El commit conserva como padres la fuente de desarrollo821ba13d2f2dcf68fc0fd1990c0e7190d304f7e2 y la versión pública32,30b39be58e5ec19e417f819e00f2e579ec2abe7d. Permite conservar ambos historiales al enviar la fuente por el Git autorizado de Sites.

Sólo aquí el manifiesto identifica producción appgprj_6ae655e56db481918fe18adfe9df8b66. Main/demo mantienen su identidad independiente. El workflow empaqueta y verifica el build conectado de producción, sin publicar, sin credenciales de backend ni de conectores: utiliza exclusivamente la configuración pública que ya sirve el bundle estable32 y la contrasta mediante el catálogo anónimo del proyecto TruckControl. No imprime ni guarda el valor de la clave publicable en fuente, recibo ni dotenv.

El recibo liga SHA real, working tree limpio, canal production, conexión de empresa, PWA, archivos/SHA256 y archivo tar. Se rechazan claves privadas con formato reconocido, symlinks y sitios ajenos. Se exige que los cobros sigan apagados. El archivo candidato desconectado NO se reutiliza.

Antes de publicar: PR85 integrado y todas sus pruebas correctas; revisión de seguridad; CI completo de esta fuente; paquete verificado; ejecutar el procedimiento oficial de Sites con entorno operativo, push exacto de este commit al Git del proyecto, save/deploy del mismo archivo y comprobación HTTPS/navegación posterior. No pasar tokens de Sites a Actions ni atribuir un SHA a una fuente que no se haya enviado.

El ejecutor de la tarea sigue fallando incluso después de la reconexión comunicada por el titular. Por ello no se da por publicada esta rama ni su archivo, y se conservan Sites32,31 y demo6. Consultar docs/CARGOTRACK.md y los checks/comentarios de PR85 para el estado más reciente. Sin nuevas compras, cargos, consumo IA o datos empresariales reales.
