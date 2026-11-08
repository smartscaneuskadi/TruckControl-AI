# PDF fiscal de suscripciones · candidato privado

Backend candidato: company-manual-invoices. No desplegado, sin nuevo almacén creado ni permisos o credenciales modificados. No forma parte de la aceptación comercial de PR60 todavía.

## Alcance

Recibe un PDF que administración ya ha emitido en GDTaller, valida tamaño y formato de transporte, calcula SHA256 en servidor, lo guarda sin sobrescritura y registra una evidencia privada tras leer y verificar el objeto. Esto no verifica la firma TicketBAI, el QR, la remisión a Hacienda ni la corrección fiscal. La emisión y su aceptación humana/legal siguen siendo independientes.

La integración candidata de UI consulta el estado del worker nuevo por JWT y conserva el registro/cargas bloqueados hasta aceptación nativa. La propuesta SQL deja uploads_enabled=false y downloads_enabled=false. No cambia la capacidad histórica del RPC62 ni el guard fiscal o los cobros. El estado nuevo exige ambos permisos y un bucket privado compatible.

## Autorización y almacenamiento

Auth getUser verifica el JWT; después se llama al RPC de administración con ese mismo JWT para comprobar rol global, correo, bloqueos y sesión vigentes. Se revalida tarea y versión antes de escribir y antes de confirmar o devolver bytes. El RPC servidor solo concede EXECUTE a service_role, mantiene la clave en Edge y comprueba nuevamente operador/sesión/versión.

Bucket exclusivo tc-subscription-fiscal, privado, PDF y máximo 10 MiB. Una política restrictiva niega este bucket a anon/authenticated incluso si hubiera una regla de flota más amplia. Los documentos de flota y otras empresas no cambian. La ruta reservada es subscription-invoices/{empresa}/{tarea}/{documentoUUID}.pdf, generada por la base de datos.

Reservas inmutables de 30 minutos ligadas a operación, actor, sesión, tarea, versión, SHA256 y tamaño. Límite propuesto: 20 reservas por operador/hora y 100 lecturas/hora. Upsert siempre false. Un reintento explícito usa la misma reserva y comprueba los bytes existentes; un resultado incierto conserva el objeto privado sin borrarlo ni afirmar confirmación.

## Contrato HTTP

POST /capabilities: verifica Auth y administrador antes de leer el cuerpo, devuelve únicamente disponibilidad y los dos controles documentales. No confirma estado fiscal ni cobro.

POST multipart: action=upload, task_id, expected_version, operation_id y un único file application/pdf. Solo se aceptan los tres orígenes exactos de producción. El tamaño se limita leyendo el cuerpo real, sin confiar en Content-Length. La respuesta devuelve metadatos autorizados y fiscal_validity_verified=false, nunca nonce ni credenciales.

POST JSON: action=download, task_id, expected_version, operation_id, document_id. Devuelve el PDF como adjunto con no-store/private, nosniff y sin URL pública o enlace firmado. Administración debe estar autorizada de nuevo en el momento de devolverlo.

La UI candidata guarda File/ACK/operaciones solamente en RAM. La petición fija el JWT del usuario verificado, descarta resultados de otro contexto y conserva el formulario ante resultado incierto. Un reintento es explícito y conserva la reserva; el registro fiscal requiere ACK comprobado y nueva confirmación de referencias manuales. Descargas comprueban MIME/tamaño/hash/no-store, generan una URL temporal y la revocan; desconectar, cambiar usuario o salir aborta y limpia el contexto. No hay envío de correo, emisión fiscal automática, cobro o activación de licencia.

## Evidencias necesarias antes de activar

1. Revisar docs/verification/manual-invoice-documents.proposal.sql; es una propuesta, no un archivo de migración ni SQL aplicado.
2. Ejecutar contrato SQL aislado, controles de roles/nonce/replay/CAS, políticas de almacenamiento y recuperación. Crear la migración con la CLI vigente, sin inventar versión ni editar migraciones ya aplicadas.
3. Aplicar únicamente por flujo oficial aprobado, después de contrastar inventario remoto. Desplegar el worker con sus fuentes y confirmar funciones privadas y configuración del bucket.
4. Prueba nativa con PDF ficticio: reservar, subir, verificar hash por lectura, registrar evidencia, repetir sin sobrescribir, denegar ajenos/sesión revocada y descargar sin caché. No utilizar facturas reales para esta prueba.
5. Solo tras aceptación, conectar la UI y modificar conscientemente la capacidad de carga. La integración con el registro de emisión manual, avisos y revisión fiscal se acepta por separado.

Pruebas preparadas: 18 del handler, 11 SQL aisladas, 15 del cliente y 6 escenarios nuevos de navegador ejecutados en Android/Windows emulados (12 casos), además de los 5 anteriores. No equivalen a bucket/worker nativos, firma fiscal, dispositivo físico ni entrega de correo. CI del head exacto y despliegue se registran por separado; los resultados pendientes nunca se presentan como aprobados. No hay nuevas llamadas IA, servicios contratados o cobros.
