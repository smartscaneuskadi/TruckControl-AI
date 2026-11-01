# Identidad visual y logotipos de fabricantes

La interfaz usa verde bosque y azul marino con superficies más luminosas, texto de alto contraste y relojes y cuentakilómetros. La identidad principal sigue siendo TruckControl AI.

Los logotipos se descargaron de los sitios oficiales indicados y se conservan como archivos locales. Identifican el fabricante de los vehículos y ejemplos de la demostración; no anuncian una colaboración, patrocinio ni integración telemática con esas marcas. No se ejecutan scripts de terceros ni se cargan sus servidores al usar la aplicación.

| Archivo | Fuente oficial | SHA-256 |
| --- | --- | --- |
| `public/brands/scania.svg` | [Fabricante](https://www.scania.com/etc.clientlibs/scania-clientlibs/clientlibs/clientlib-site/resources/logotype/1.0.0/scania_symbol/scania-symbol.svg) | `18e63fd299d9a80a1c001bc6466ede3842271a75af3c4ae5d5993f32d356e459` |
| `public/brands/mercedes-benz.svg` | [Fabricante](https://group.mercedes-benz.com/bilder/misc/markenlogos/mercedes-benz-star-logo-svg.svg) | `be9f132184cf11645bfb4f721761e72499578d474e3d4d8eb5f7d42d2799b7e5` |
| `public/brands/man.webp` | [Fabricante](https://media.man.eu/is/image/MAN/man_logo-1?wid=232&hei=132&fit=stretch&fmt=webp-alpha) | `99d4d0423c08856e76160291c01d21c28fbcbc6360baf44619c105cd64cf677a` |

Los originales conservan su contenido. Mercedes-Benz utiliza su estrella blanca sobre azul; Scania y MAN se muestran sobre fondos claros. Se respetan proporciones y se incluyen nombres visibles junto a los símbolos. Las marcas pertenecen a sus respectivos titulares.

Los archivos se precargan con la PWA y se comprueba su disponibilidad sin conexión. Los vehículos de otros fabricantes mantienen el icono genérico. El resumen de marcas utiliza los datos de la empresa seleccionada.

La compilación candidata usa `npm run build:candidate`, muestra el portal de planes, cierra las altas y excluye configuración Supabase. Las comprobaciones de accesibilidad y los perfiles Android/Windows no equivalen a dispositivos físicos.
