# Comprobación privada de Stripe

La administración global dispone de **Servicios → Comprobar Stripe**. El enlace directo es https://truckcontrolai.com/#/admin?section=providers. La pantalla requiere entrar con la cuenta administradora habitual; nunca pide copiar claves o códigos.

## Alcance y seguridad

La acción `admin_readiness` reutiliza exclusivamente la función existente `truckcontrol-billing`. Primero comprueba la identidad y la sesión humana vigente con `getSessionVerifiedUser`; después ejecuta `tc_provider_control(status)` con el JWT original fijado por petición. El RPC existente exige la tabla real de administradores, correo confirmado y sesión vigente. Metadatos de usuario no conceden este permiso. Empresas, sesiones revocadas y adaptadores incompletos se rechazan antes de leer la configuración de Stripe.

Las únicas operaciones de proveedor son dos GET HTTPS: cuenta actual y receptor existente `we_1Ub5lBCWctKw8slHXmnq0PZd`. El segundo solo se realiza con la cuenta LIVE de ELEVADANCOR esperada. No crea clientes, productos, precios, facturas, pagos, licencias ni receptores. Las claves permanecen en el backend. Solo salen campos expresamente permitidos, sin errores crudos, huellas de secretos ni datos personales de la cuenta. Orígenes CORS existentes, respuestas `no-store`, redirecciones prohibidas, tamaño y tiempo limitados. Caché RAM de 60 segundos, con autorización reevaluada antes de cada lectura.

El contrato del navegador es estricto. No acepta propiedades añadidas ni una afirmación de firma/entrega comprobadas. La pantalla no consulta automáticamente al montarse, evita doble pulsación, conserva los borradores Google y descarta respuestas tardías tras desmontaje, cambio de sesión o pérdida de conexión. No persiste resultados en WebStorage.

## Interpretación

- Clave guardada: solo formato reconocido; no equivale a autenticación válida.
- Cuenta verificada: respuesta auténtica de Stripe para la cuenta LIVE exacta de ELEVADANCOR.
- Receptor correcto: identificador, URL comercial, versión de eventos y lista de eventos esperados. Un receptor temporal de verificación puede aparecer pendiente; no se modifica automáticamente.
- Secreto de firma guardado: solo formato válido. **No demuestra que corresponda al receptor ni una entrega firmada real.**
- Estado del receptor y capacidad de cargos de la cuenta son informativos. **No abren la contratación ni cambian los controles fiscales.**

El chequeo completo positivo requiere la sesión real del propietario. Las pruebas automatizadas del navegador emplean transporte ficticio y no se presentan como comprobación de credenciales reales. El PR105, preservado, prepara de forma independiente una entrega real de marcador firmada con los cobros cerrados; su resultado debe registrarse con evidencias del proveedor.

## Despliegue y recuperación

Validar unitarias, SQL aislado, Deno, permisos, interfaz y CI antes de actualizar únicamente `truckcontrol-billing`; conservar sus nueve fuentes anteriores (v17, PR106) y la configuración existente. Son dos dependencias internas adicionales a las nueve de v17, sin endpoint nuevo, DDL ni cambios de RLS. Publicar la interfaz desde checkout de producción separado: el manifiesto de main pertenece a la demo. Conservar Sites40 y demo6. Si falla, restaurar las fuentes previas del backend y la versión pública40; no borrar datos ni volver a aplicar migraciones.

El intento anterior de publicar un diagnóstico temporal separado fue rechazado por la revisión automática porque añadía una función pública con acceso a secretos. **No se desplegó y no se reintenta.** Esta implementación usa la autenticación humana y autorización de administración existentes; no introduce token alternativo ni función nueva.
