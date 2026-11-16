# Facturación y documentos por ficha

Publicada y verificada: **Sites49 / `0.5.30-rc.1`**, https://truckcontrolai.com. Si la PWA ofrece «Actualizar», aplica el aviso para cargar las nuevas fichas. Cada persona entra con su cuenta de empresa autorizada.

## Uso

**Facturación** reúne **Ingresos** y **Gastos**. Las rutas anteriores siguen funcionando. Al crear un movimiento se elige **Factura**, **Ticket** o **Albarán**; el listado permite filtrar y exportar esa clasificación. Los movimientos históricos sin clasificación siguen como **Sin clasificar** hasta que una persona elija su clasificación. La clasificación no modifica importes, IVA, kilómetros, cobros o rentabilidad.

Para adjuntar archivos a un movimiento, primero guárdalo y abre su acción de documentos. Cada original tiene su propio tipo, descripción opcional, vencimiento y aviso. El movimiento permanece guardado si una subida falla.

En **Camiones**, abre la ficha y baja a **Documentación del camión**. Puedes añadir una **Ficha técnica**, un seguro, ITV u otro documento, escribir su descripción y adjuntar varios archivos. En **Conductores**, pulsa **Documentos del conductor** para acceder al expediente: identidad, permiso de conducir u otro tipo con descripción libre. La edición de datos del conductor conserva su botón existente.

Se admiten PDF, JPEG, PNG y WebP válidos, hasta 10 MB por original. Puedes seleccionar hasta 50 archivos por tanda y repetir tandas. Dos subidas con el mismo nombre generan originales independientes; retirar un archivo de la cola no borra los ya guardados. Una descripción escrita por el usuario se muestra literalmente, sin traducción ni interpretación HTML.

Cada archivo tiene un resultado independiente. Se pueden reintentar rechazos confirmados. Si el resultado es incierto, la app impide repetirlo a ciegas: actualiza el registro y contacta con soporte si no se aclara. El archivado conserva el original. En modo empresa, las descargas son autenticadas desde almacenamiento privado; la demo descarga sus originales ficticios locales.

## Permisos y conexión

La documentación utiliza los permisos existentes de la empresa. Un usuario de consulta puede leer y descargar; no puede subir ni editar. Un adjunto vinculado a un ingreso o gasto exige además el permiso económico correspondiente. RLS, Storage y los contextos del copiloto conservan ese mismo límite. Una empresa no puede utilizar identificadores de documentos o movimientos de otra.

El cambio de cuenta, empresa, ficha, sesión o nivel MFA detiene las fases pendientes de una operación. Cada solicitud utiliza el token capturado para esa operación, sin reutilizar el de otra cuenta. FULL desactivado o vencido sigue bloqueando el acceso en interfaz y servidor. Los documentos ya descargados en un dispositivo no pueden retirarse retroactivamente.

Los originales requieren conexión; no se añaden a la cola offline ni se incluyen en la copia cifrada desconectada. La clasificación financiera sí conserva el flujo de sincronización existente. La biblioteca de demostración es local y admite únicamente archivos ficticios, con consentimiento explícito y su límite de 50 MB. No se deben subir documentos de identidad reales a la demo.

## Compatibilidad y recuperación

La ampliación SQL76, aplicada oficialmente como `20261116085827_billing_document_attachments`, es aditiva: no reclasifica registros anteriores ni elimina archivos. `document_type` es nullable. Los clientes que omiten esa propiedad al editar conservan la clasificación existente. La descripción y el vínculo financiero viven en metadatos separados; no se cambia el nombre ni la ruta del original.

Los RPC enriquecidos son `tc_document_page_v2`, `tc_update_document_metadata_v2`, `tc_register_document_v2` y `tc_backup_page_v3`. Los RPC previos conservan su proyección original para Sites47 y la recuperación48; las categorías nuevas se proyectan como «Otro» y una edición antigua no las sustituye accidentalmente. Los campos omitidos se conservan.

Las copias de registros de empresa que contienen nuevas clasificaciones, descripciones o vínculos utilizan versión6; se mantienen lectores1–5. Las copias de demo con clasificaciones utilizan versión4 y conservan lectores anteriores. El validador comprueba organización e identidad de los padres. Los formatos antiguos no pueden declarar campos nuevos que sus lectores perderían silenciosamente. Estos archivos son copias de registros, no una sustitución de la recuperación gestionada de Auth, Storage y Vault.

Si se elimina un movimiento con los permisos requeridos, sus originales se conservan en la biblioteca y se retira únicamente el vínculo. Volver a la interfaz anterior debe hacerse con las compilaciones MFA compatibles Sites47/48 manteniendo SQL76 instalado. El script `verification/billing-document-attachments-rollback.sql` rechaza retirar columnas y datos; cualquier cambio posterior requiere una migración forward revisada. Nunca repetir las migraciones75/74/anteriores.

## Verificación

La entrega añade pruebas de clasificación y céntimos, conservación de datos históricos, copias, SDK documental fijado a sesión y recorridos de navegador en Fleet Light/Fleet Cockpit con perfiles Windows/Android emulados. Los contratos SQL comprueban aislamiento, RLS, roles, concurrencia y compatibilidad de clientes. La CI conserva las 64 pruebas iniciales, los 11 hashes retenidos y los controles anteriores. La fuente final supera2035pruebas unitarias/SQL y154Python, la regresiónSaaS274/274 y68recorridos de adjuntos/idiomas, además de las suites anteriores. PostgreSQL real:524comprobaciones,45contenciones y2restauraciones aisladas. Después de desplegar se verificaron68recorridos,105hashes HTTPS,6perfilesPWA y5controles de salud. El recibo de publicación delimita la emulación y el transporte privado ficticio; no son pruebas de dispositivos físicos o proveedores.

Ejecutar `npm run test:e2e:billing-attachments` prepara una compilación y resultados en un directorio temporal aislado. No usa buzones, pagos, modelos IA ni datos empresariales reales. Los límites IA y los cobros automáticos no cambian. Las pruebas de navegador no se presentan como dispositivos físicos.
