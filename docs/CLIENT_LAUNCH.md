# Apertura a clientes — acceso y correo real

Titular facilitado por el propietario: **ELEVADANCOR S.L., CIF B02993426**, Polígono Arzabalza, n.º 50, Tolosa; pedidos@smartscaneuskadi.com. Aviso legal, privacidad y condiciones con encargo de tratamiento están en `/?legal=notice`, `/?legal=privacy` y `/?legal=terms`. Se utiliza la dirección facilitada sin publicar el código postal incompleto. Estos textos describen la operación técnica y no acreditan una revisión jurídica externa.

## Acceso mediante correo nativo

Supabase genera la invitación o recuperación con su API oficial `auth.admin.generateLink`; Resend entrega el mensaje desde no-reply@facturas.truckcontrolai.com. No se ha alterado SMTP alojado ni se depende de Migadu para estos mensajes. El enlace contiene un hash de un solo uso en el fragmento, que se retira del historial al abrirlo. Se consume solo al pulsar confirmar y el titular elige su contraseña después de verificar el correo. No se recibe contraseña durante el alta ni se devuelve el enlace desde la API pública.

Cada solicitud de alta exige la versión vigente de las condiciones y un recibo inmutable del servidor asociado al usuario y a su correo. Los metadatos editables no activan empresas por sí solos. La finalización de perfiles existentes valida la sesión y el correo con Auth antes de aceptar condiciones. No cambia precios, diez días de prueba, datos existentes ni roles. El propietario reservado obtiene administración solo al verificar pedidos@smartscaneuskadi.com.

Hay límites conservadores de 40 solicitudes de correo al día, 1.000 al mes, dos por destinatario en quince minutos, cinco por día y ocho por IP/hora. Son comunes a la plataforma y adicionales al alcance Resend Free aprobado (100/día y 3.000/mes para la cuenta). Se guardan hashes separados del correo/IP, no contraseñas ni enlaces. No se reintenta a ciegas un envío de resultado desconocido. El acuse genérico evita revelar si existe una cuenta.

## Evidencia actual

[Informe](verification/client-auth-acceptance-20261101.json). La cuenta sintética recibió confirmación y recuperación reales: verificación nativa, selección de contraseña, inicio de sesión, rechazo del enlace repetido y cierre global pasaron. No se devolvieron ni guardaron tokens o contraseñas. El fixture queda bloqueado y sin sesiones; no tiene perfil comercial ni rol de administrador.

Pasan 364 unitarias/SQL, 32 Python, compilación PWA, TypeScript y Deno. Los 16 recorridos de la versión conectada prueban Android/Windows emulados, alta con consentimiento, recuperación, enlaces ambiguos, condiciones públicas y contraste en Fleet Light/Fleet Cockpit. Se conservan las 64 originales mediante once hashes. Además pasan seis comprobaciones HTTP reales y una prueba remota de activación/aislamiento con rollback completo y cero fixtures restantes. No equivale a pruebas en dispositivos físicos.

Supabase tiene 48 migraciones, aplicadas una vez. Local `20261101214649` → remota `20261101215459`; local `20261101220448` → remota `20261101221144`. No repetir DDL ni editar su contenido aplicado, incluido su SHA. La nueva función `company-auth` v3 coincide en los dos archivos de código servidos; se entregó también deno.json, que el proveedor omite al recuperar este paquete sin mapa de importaciones.

## Publicación controlada

La versión conectada 9 está publicada en https://truckcontrolai.com, www y el hostname técnico de la candidata. Fuente bcffa56f0b3a3f851af4e9f433223b49bad7ed9c, canal production, clave moderna publicable y correo Resend; ninguna clave de servicio está en el cliente. Los 72 recursos HTTPS coinciden con el paquete probado. La candidata 8 queda guardada para recuperación y la demo estable v6 sigue intacta en su URL propia.

El aviso legal está publicado y la invitación nativa se entregó al propietario. Este confirmó su acceso; la base verifica correo confirmado, contraseña elegida y rol global. Después de esas comprobaciones se abrió el registro, manteniendo enforcement activo, pruebas internas deshabilitadas y pagos apagados. El catálogo anónimo real devuelve HTTP 200, registro abierto y prueba Full de diez días; Básico 300 €/mes + IVA 21 % (363 €), Full 700 €/mes + IVA 21 % (847 €). El vencimiento no crea cargos ni deuda automática.

Se mantiene el presupuesto IA aprobado de 10 USD/mes antes de impuestos, con cuotas y aceptación individual. Una descripción administrativa contenía una clave de OpenAI; el titular confirmó que ya estaba revocada. Se restableció el runtime existente sin pedir otra clave ni ampliar presupuesto. No volver a suspenderlo por ese valor obsoleto ni reproducir valores de descripciones de claves.

## Límites que siguen vigentes

La conexión Gmail OAuth directa continúa pendiente; el reenvío de facturas seleccionadas y la importación funcionan de forma independiente. SMS y cobros automáticos siguen apagados. Los buzones Migadu y su incidencia DKIM son independientes de los mensajes de acceso enviados por Resend. La protección alojada contra contraseñas filtradas mantiene un aviso previo y requiere Pro o superior según la documentación; no se activa un plan de pago para retirarlo. La existencia de copias del código y exportaciones de datos no acredita una restauración completa del servicio gestionado ni un SLA de disponibilidad. Las copias y aceptación física deben planificarse conforme al uso y límites del proveedor.
