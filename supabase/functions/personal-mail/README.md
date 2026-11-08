# Buzón personal IMAP/SMTP

Conexión real del usuario por IMAP993 y SMTP465, con TLS1.2+ y validación de certificado. Gmail conserva OAuth oficial en /mailbox/gmail; Yahoo/Porkbun tienen presets oficiales. Otros servidores se introducen expresamente por el usuario. No es un navegador de webmail ni una promesa de compatibilidad con proveedores que exigen OAuth particular, como Microsoft365/Outlook.

Antes de abrir una conexión, se valida Auth, sesión exacta vigente y membresía empresarial activa con los RPC existentes. Sin nuevas tablas ni migraciones. Contraseñas solo en RAM y en el cuerpo POST HTTPS de cada operación; nunca en logs, WebStorage, base de datos, copias o IA. Salir/cambiar identidad/cerrar vista/una hora/pagehide borra la sesión local. No se mantiene después de recargar. Los secretos del servidor existentes no cambian.

DNS IPv4 resuelto, filtrado de rangos especiales y dirección fijada al socket; SNI/certificado se validan contra el hostname original. Sin IP/URL/puertos arbitrarios, sin proxies ni rebajas TLS. Límites de cuerpo/mensaje, cursores por UIDVALIDITY, lectura acotada y rate limit por sesión en cada worker. Este rate limit no se presenta como cuota global distribuida.

Cada envío requiere la confirmación del editor. No se reintenta un resultado incierto. El proveedor sigue decidiendo autenticación, remitentes permitidos y entrega; SMTP verify no envía un mensaje ni acredita entrega. Sin cuenta autenticada del titular no declarar lectura/envío reales aceptados.

GET health devuelve capacidades. GET transport-check?provider=porkbun|yahoo solo comprueba TLS contra dos hosts fijos del preset, sin credenciales ni comandos de autenticación. No acredita un buzón. Diagnostics cache60s por worker, certificados exigidos.
