# TruckControl AI — entrega vigente, 0.5.3-rc.1

**Recepción de facturas e IA comprobadas el 01/11/2026.** La clave Resend guardada en Vault funciona contra su API real. Tres correos ficticios llegan por el webhook firmado a dos empresas independientes, con originales privados y sin crear gastos automáticamente. [Informe verificable](verification/resend-live-acceptance-20261101.json).

## Aplicación publicada

https://truckcontrolai.com, https://www.truckcontrolai.com y https://truckcontrol-ai-candidata.earlymug513.chatgpt.site mantienen la **candidata 8 ficticia**, fuente `ba7a226f976a0eb52b8e28f2407d78384edced53`, despliegue `appgdep_6ae77f9666388191a9fa987bed562089`. Esta actualización backend no reemplaza su paquete ni conecta sus formularios a datos reales. Los 72 hashes HTTPS y seis recorridos de publicación se conservan en el CI. Demo estable v6 separada: https://truckcontrol-ai-fase-1.earlymug513.chatgpt.site.

Para probar la interfaz: abrir la URL → Explorar la demo → Correo y facturas → Probar correo ficticio. En Configuración → Apariencia se eligen Fleet Light, Fleet Cockpit, sistema y movimiento reducido. La PWA se instala desde Chrome/Edge; [guía Android/Windows](INSTALLATION.md). La demo usa datos ficticios incluso sin red.

## Correo real e IA

Resend recibe en `facturas.truckcontrolai.com`, región eu-west-1. Cinco registros DNS están verificados; los 27 anteriores de web/Migadu se conservan (32 en total). No se han cambiado MX raíz, DNSSEC, buzones Migadu, planes ni pagos. El único webhook escucha `email.received`, con firma en Vault. Cada empresa autorizada genera una dirección privada propia; no se publica una dirección común ni se acepta una empresa elegida por el remitente.

La prueba real registra dos recibos en A y uno en B. A conserva una sola factura tras el duplicado: **200 € base + 42 € IVA = 242 €**, estado `needs_review`, una llamada IA. B, sin permiso/consentimiento de IA, conserva el original con campos por completar y cero llamadas. Cero movimientos financieros. Las 15 aserciones SQL de acceso propio/ajeno y Storage pasan; después de suspender las cuentas se deniegan sus datos y buzones.

OpenAI usa la clave existente de los secretos de funciones, modelo gpt-6-luna, con máximo global aprobado **10 USD/mes antes de impuestos**, cuotas por empresa y reservas antes de llamar. Tres llamadas reales totales liquidadas; estimación interna superior 925 micro USD, reservas desconocidas cero. No equivale a una factura del proveedor. Se mantiene la revisión humana antes de contabilizar.

Resend permanece en el alcance gratuito aprobado: 3.000 correos/mes y 100/día para toda la cuenta, sin upgrades ni recargas. La API no acredita el estado de facturación del panel. No se ha activado un plan de pago. Reenvío desde Gmail, Outlook/Microsoft 365 u otro proveedor es independiente de Google OAuth; el acceso directo a todo Gmail sigue pendiente de credenciales válidas.

## Base de datos y seguridad

Único proyecto: `truckcontrol-ai`, `kkkemaycedexymrpaqtp`. **46 migraciones**, revisadas y aplicadas una vez; no ejecutar `db push` a ciegas. [Inventario](deployment/remote-migrations-20261101-resend.json), [correspondencias y SHA](deployment/recovered-migrations.json). FIXPilot no se modifica.

Funciones ACTIVE comparadas con la fuente: company-assistant v9, company-gmail v10, company-mail v10 y company-mail-resend v3. Este último admite la clave Svix real de 24 bytes y el host exacto del original `cdn.resend.app`; mantiene firma, caducidad, límites y bloqueo de redirecciones. Un primer intento devolvió 502 por ese CDN; tras corregirlo el reintento del proveedor completó la recepción sin duplicar.

Las cuatro cuentas sintéticas quedan suspendidas/bloqueadas. Los dos buzones nuevos están deshabilitados y sus usuarios no tienen sesiones. Se conservan documentos, costes y auditoría. Las dos cuentas anteriores conservan filas de sesión antiguas, pero su estado bloqueado/suspendido deniega el acceso; no se afirma cero sesiones globales. No hay clientes reales.

Asesor vigente: **un WARN de protección contra contraseñas filtradas deshabilitada**, observado antes de las nuevas migraciones. [Remediación oficial](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Los ayudantes de configuración Resend son privados y sin permisos de cliente/service_role. Los esquemas private y extensions no están expuestos en Data API; se verificó el rechazo HTTP. La extensión HTTP administrada conserva sus permisos SQL PUBLIC bajo supabase_admin, que postgres no puede retirar: no exponer ese esquema ni afirmar una revocación no realizada.

## GitHub y validación

PR #14 integrado en main. La continuación está en [PR #15](https://github.com/smartscaneuskadi/TruckControl-AI/pull/15), rama `feat/resend-api-bootstrap`. Se conservan las 64 pruebas originales mediante los once hashes. El [CI exacto del backend](https://github.com/smartscaneuskadi/TruckControl-AI/actions/runs/41352158854), commit `b1d47e07a78c05437a194c441346ab685e750f17`, pasa **479 comprobaciones**: 311 unitarias/SQL, 32 Python, 64 demo, 22 empresas, 30 SaaS, 14 candidata y seis perfiles de publicación. Logs revisados, TypeScript y compilación PWA aprobados. El informe de aceptación documenta también las pruebas reales del receptor. La infraestructura y los secretos no se incluyen en los paquetes públicos.

## Pendiente para clientes reales

Registro público y cobros cerrados. Faltan SMTP real de Auth y pruebas de confirmación/recuperación, administrador propietario verificado, requisitos legales y tratamiento de documentos, aceptación de recuperación y dispositivos físicos. Google OAuth directo es opcional y sigue pendiente; el reenvío general ya está probado en backend. No presentar la candidata como lanzamiento comercial 1.0 ni pedir claves otra vez: Resend y OpenAI funcionan.

La oferta se conserva: diez días Full gratuitos, Básico 300 €/mes + IVA 21 % (363 €), Full 700 €/mes + IVA 21 % (847 €). No hay cobros activos.
