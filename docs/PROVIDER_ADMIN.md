# Servicios de TruckControl

**Continuación del 03/11/2026:** configuración Google `configured=true`, `company-gmail` v13, 57 migraciones y producción v25. No volver a guardar claves ya configuradas. La inspección actual cuenta cero conexiones empresariales; la aceptación personal del titular es independiente. [Expediente y próximos pasos oficiales](GOOGLE_PUBLIC_VERIFICATION.md). Las menciones posteriores a salud false y versiones v11 son comprobaciones históricas fechadas.

La pestaña **Administración → Servicios** muestra el estado del correo de acceso, receptor de facturas, IA, Gmail, cobros y SMS. Solo puede utilizarla una cuenta de administración global con correo verificado y sin bloqueo. No sustituye el consentimiento de cada empresa ni activa cargos.

## Configurar Google

1. Acceder como administrador global y abrir **Servicios**.
2. Abrir el cliente web **TruckControl AI Gmail** en el proyecto Google **TruckControlAI / truckcontrolai / 468881730124**. Ya existe un cliente; no crear duplicados. El retorno autorizado es `https://truckcontrolai.com/gmail-callback`.
3. Importar su JSON oficial o introducir el ID y el secreto completo directamente en el formulario de TruckControl. Confirmar y pulsar **Guardar Google de forma segura**. No enviar secretos al chat, capturas ni soporte.
4. Una pareja válida queda cifrada en Vault. El formulario borra el secreto al guardar y el servidor nunca lo devuelve. El estado confirma su formato; no prueba todavía el consentimiento ni la entrega de Gmail.
5. Cada administrador de empresa debe autorizar su propio buzón desde **Facturas → Gmail**. El enlace pasa por el consentimiento oficial de Google. El reenvío general sigue disponible independientemente.

Google oculta permanentemente el secreto del cliente creado durante la configuración. La comprobación oficial terminó sin recuperarlo ni cambiar ajustes. Si no se conservó su valor original, su titular debe obtener un secreto nuevo mediante el procedimiento oficial de Google y guardarlo directamente en este formulario. No es posible deducirlo del nombre o del ID público.

El consentimiento Google continúa en pruebas; usuarios de prueba y revisión de Google siguen siendo requisitos externos para ampliar el uso. Guardar credenciales no publica la aplicación en Google ni da acceso a buzones.

## Protección y sustitución

- RPC pública invoker, implementación definer privada, `search_path` vacío, comprobación de identidad/rol/correo/bloqueo antes de leer Vault; anónimos y clientes no pueden consultar ni modificar credenciales.
- Entradas limitadas al proyecto TruckControl, secreto completo, tamaño y campos admitidos. Mensajes de error sin valores privados.
- El navegador transmite el secreto por HTTPS al backend autenticado. No se guarda en Web Storage, preferencias, auditoría ni repositorio. El JSON importado permanece en el dispositivo del administrador hasta que este lo elimine.
- El guardado conserva las versiones anteriores cifradas para recuperación administrativa. No rota la clave AES que protege los tokens Gmail.
- Guardados concurrentes de esta herramienta se serializan; repetir la misma pareja no duplica archivos ni auditoría. Una pareja válida exige confirmación adicional para sustituirla.
- Buzones conectados, estados y autorizaciones pendientes bloquean la sustitución. Para una rotación futura con uso activo se requiere mantenimiento coordinado; no eliminar conexiones ni tokens para eludirlo.
- Vault se modifica mediante sus funciones oficiales, sin conceder UPDATE directo sobre sus tablas. La migración de compatibilidad conserva la primera migración y su historial.

## Verificación

21 pruebas nuevas de contrato y SQL, incluida una ejecución con rol sin UPDATE de Vault; 418 unitarias/SQL en total. La batería SaaS comprueba acceso exclusivo, importación, confirmación, ausencia de secretos en almacenamiento, revocación del administrador, accesibilidad y ambos temas en emulaciones Android/Windows.

El ensayo remoto [provider-admin-rollback.sql](verification/provider-admin-rollback.sql) usa dos identidades y credenciales ficticias dentro de una transacción revertida. Verifica escritura real en Vault, rechazo de clientes/anónimos/no verificados, auditoría sin valores y confirmación de sustitución. Termina con cero usuarios y auditorías de prueba y las claves previas intactas. No llama a Google ni vincula buzones.

El asesor mantiene el aviso previo de contraseñas filtradas, cuya función alojada requiere un plan superior. No se ha contratado. Las pruebas de navegador no equivalen a aceptación en dispositivos físicos.

## Diagnóstico del servidor Gmail

`company-gmail` v11 añade `GET /functions/v1/company-gmail/health`, sin caché y sin claves en su respuesta: solo `configured`. Esta comprobación incluye el entorno de la función y Vault mediante el resolver existente. No prueba consentimiento, revisión de Google ni entrega. A 02/11/2026 el resultado real es false y no hay conexiones Gmail. Debe completarse el guardado seguro del cliente Google; no volver a crear otro cliente ni mostrar secretos.

Los tres orígenes de producción ya son compatibles con el preflight y el retorno OAuth; se conserva también el retorno heredado para no invalidar estados existentes. El servidor mantiene autenticación, permisos por empresa, PKCE, estado de un uso y cifrado. El ensayo nativo comprueba esos enlaces/bindings y revierte sus fixtures; no llama a Google ni activa IA.

## Acceso desde instalaciones anteriores

`company-mail` v11 y `company-assistant` v10 aceptan los tres orígenes exactos de producción. Su autenticación, firma del receptor, módulos y presupuesto permanecen igual. Pasan 21 comprobaciones HTTP sin llamar a proveedores y las fuentes desplegadas coinciden con las verificadas. Este cambio es independiente de las credenciales Gmail pendientes. [Evidencia](verification/invoice-origins-http-20261102.json). Migadu sigue con SERVFAIL en sus tres destinos DKIM según Google y Cloudflare a 02/11/2026 13:44 UTC; no se cambian DNS ni se contrata otro plan.
