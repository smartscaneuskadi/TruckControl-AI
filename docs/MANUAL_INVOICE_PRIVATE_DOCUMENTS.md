# PDF fiscal de suscripciones · candidato privado

Backend candidato: company-manual-invoices. No desplegado, sin nuevo almacén creado ni permisos o credenciales modificados. No forma parte de la aceptación comercial de PR60 todavía.

## Alcance

Recibe un PDF que administración ya ha emitido en GDTaller, valida tamaño y formato de transporte, calcula SHA256 en servidor, lo guarda sin sobrescritura y registra una evidencia privada tras leer y verificar el objeto. Esto no verifica la firma TicketBAI, el QR, la remisión a Hacienda ni la corrección fiscal. La emisión y su aceptación humana/legal siguen siendo independientes.

La UI mantiene bloqueado el registro y las cargas hasta la aceptación nativa del worker. La propuesta SQL conserva uploads_enabled=false y no cambia las capacidades públicas existentes ni los cobros.

## Autorización y almacenamiento

Auth getUser verifica el JWT; después se llama al RPC de administración con ese mismo JWT para comprobar rol global, correo, bloqueos y sesión vigentes. Se revalida tarea y versión antes de escribir y antes de confirmar o devolver bytes. El RPC servidor solo concede EXECUTE a service_role, mantiene la clave en Edge y comprueba nuevamente operador/sesión/versión.

Bucket exclusivo tc-subscription-fiscal, privado, PDF y máximo 10 MiB. Una política restrictiva niega este bucket a anon/authenticated incluso si hubiera una regla de flota más amplia. Los documentos de flota y otras empresas no cambian. La ruta reservada es subscription-invoices/{empresa}/{tarea}/{documentoUUID}.pdf, generada por la base de datos.

Reservas inmutables de 30 minutos ligadas a operación, actor, sesión, tarea, versión, SHA256 y tamaño. Límite propuesto: 20 reservas por operador/hora y 100 lecturas/hora. Upsert siempre false. Un reintento explícito usa la misma reserva y comprueba los bytes existentes; un resultado incierto conserva el objeto privado sin borrarlo ni afirmar confirmación.

## Contrato HTTP

POST multipart: action=upload, task_id, expected_version, operation_id y un único file application/pdf. Solo se aceptan los tres orígenes exactos de producción. El tamaño se limita leyendo el cuerpo real, sin confiar en Content-Length. La respuesta devuelve metadatos autorizados y fiscal_validity_verified=false, nunca nonce ni credenciales.

POST JSON: action=download, task_id, expected_version, operation_id, document_id. Devuelve el PDF como adjunto con no-store/private, nosniff y sin URL pública o enlace firmado. Administración debe estar autorizada de nuevo en el momento de devolverlo.

No hay envío de correo, emisión, cobro, activación de licencia ni frontend nuevo conectado por estos archivos.

## Evidencias necesarias antes de activar

1. Revisar docs/verification/manual-invoice-documents.proposal.sql; es una propuesta, no un archivo de migración ni SQL aplicado.
2. Ejecutar contrato SQL aislado, controles de roles/nonce/replay/CAS, políticas de almacenamiento y recuperación. Crear la migración con la CLI vigente, sin inventar versión ni editar migraciones ya aplicadas.
3. Aplicar únicamente por flujo oficial aprobado, después de contrastar inventario remoto. Desplegar el worker con sus fuentes y confirmar funciones privadas y configuración del bucket.
4. Prueba nativa con PDF ficticio: reservar, subir, verificar hash por lectura, registrar evidencia, repetir sin sobrescribir, denegar ajenos/sesión revocada y descargar sin caché. No utilizar facturas reales para esta prueba.
5. Solo tras aceptación, conectar la UI y modificar conscientemente la capacidad de carga. La integración con el registro de emisión manual, avisos y revisión fiscal se acepta por separado.

Las 16 pruebas del handler usan un gateway en memoria y no prueban un bucket nativo, una firma fiscal o la entrega de correo. CI y despliegue se registran separadamente. No hay nuevas llamadas IA, servicios contratados o cobros.
