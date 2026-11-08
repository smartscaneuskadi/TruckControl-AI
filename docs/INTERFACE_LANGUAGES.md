# Idiomas de la interfaz

TruckControl AI ofrece Español, Română, English y Français en el selector del portal público y de la barra superior. Español sigue siendo el idioma inicial. La elección se conserva en este navegador, se comparte entre pestañas y funciona también sin conexión cuando la aplicación está instalada.

El cambio vuelve a dibujar la interfaz sin recargar la aplicación ni desmontar sus proveedores: conserva sección, formularios y conexiones de correo abiertas. Las fechas y los importes usan el formato del idioma; la divisa sigue siendo EUR. Las claves, estados de negocio y valores almacenados no cambian.

Los diccionarios son locales. No se envían textos a un servicio de traducción. Los mensajes y adjuntos del correo, nombres de personas/empresas, documentos aportados y otros datos escritos por el usuario mantienen su contenido. CargoTrack, páginas de proveedores, mapas y autorizaciones externas conservan el idioma que ofrezca cada proveedor. Los correos y documentos generados por servicios de servidor conservan su plantilla original; esta entrega traduce la interfaz de la aplicación.

`src/i18n/source-messages.json` documenta las cadenas de interfaz y sus contextos. Los diccionarios `ro`, `en` y `fr` deben cubrir todas las claves y conservar los marcadores `{0}`, `{1}`, etc. La transformación de compilación sólo envuelve los textos y etiquetas de interfaz, nunca los valores de campos, identificadores, nombres de adjuntos ni cuerpos de correo. Añadir nuevas pantallas requiere mantener el catálogo y los diccionarios; las cadenas ausentes permanecen en español.

Pruebas: cobertura de diccionarios, marcadores, fechas/importes, protección del contenido original, menú y formularios de cuatro idiomas, persistencia al recargar, accesibilidad y conservación de borrador de correo al cambiar idioma desde otra pestaña.
