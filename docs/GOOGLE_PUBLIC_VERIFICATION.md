# Gmail público — expediente y aceptación empresarial

Preparación a **03/11/2026**. Producción v25 en https://truckcontrolai.com, backend `company-gmail` v13, 57 migraciones. Siete fuentes nativas coinciden y pasan 109 pruebas específicas. La consulta actual encuentra **cero Gmail empresariales vinculados** y cero autorizaciones pendientes. El titular ha probado **Mi correo**; esa aceptación no acredita el importador empresarial. [Entrega vigente](CURRENT_DELIVERY.md).

El titular confirma **Marca publicada**. No se ha observado independientemente el estado del dominio, público o aprobación de alcances, ni una evaluación externa. También comunica Gmail empresarial conectado, pero la consulta del servidor a las 23:34:12 UTC sigue mostrando cero conexiones; se ha pedido aclarar la pantalla antes de repetir autorizaciones. No declarar Gmail aprobado para todos los clientes.

## Datos preparados para Google

| Campo                          | Valor                                                                                   |
| ------------------------------ | --------------------------------------------------------------------------------------- |
| Proyecto existente             | TruckControlAI / truckcontrolai / **468881730124**                                      |
| Cliente web existente          | TruckControl AI Gmail                                                                   |
| ID público                     | `468881730124-ss24lmbcjdronuogra584saigfj8sb0t.apps.googleusercontent.com`              |
| Nombre visible                 | TruckControl AI                                                                         |
| Responsable y contacto público | ELEVADANCOR S.L. · pedidos@smartscaneuskadi.com                                         |
| Inicio                         | https://truckcontrolai.com                                                              |
| Privacidad                     | https://truckcontrolai.com/?legal=privacy                                               |
| Condiciones                    | https://truckcontrolai.com/?legal=terms                                                 |
| Dominio autorizado             | `truckcontrolai.com`                                                                    |
| Orígenes JavaScript            | `https://truckcontrolai.com`; `https://www.truckcontrolai.com` si se utiliza ese acceso |
| Retorno empresarial exacto     | `https://truckcontrolai.com/gmail-callback`                                             |

El correo de soporte seleccionado debe estar controlado por una cuenta o grupo admisible en Google. Mantener el contacto público indicado; no inventar acceso a buzones. Usar el dominio propio para Gmail: no añadir `chatgpt.site` como dominio que supuestamente poseemos. No duplicar proyecto/cliente ni sustituir el secreto o la clave AES.

## Pasos oficiales y límites

No hay identidad GCP administrativa ni conector de administración OAuth en esta sesión. Se ha comprobado la disponibilidad de conexiones. El conector personal Gmail de ChatGPT no administra esta app. No repetir navegadores fallidos ni ampliar el presupuesto de automatización. Contraseñas, MFA, códigos y secretos se introducen exclusivamente en las pantallas oficiales.

1. [Marca](https://console.cloud.google.com/auth/branding?project=468881730124): contrastar los campos anteriores y seguir **Verificar marca**. Si ya hay una revisión en curso, conservarla y atender sus observaciones. No cancelarla para rehacer la configuración.
2. Propiedad de `truckcontrolai.com` mediante [Search Console](https://search.google.com/search-console/welcome), con una cuenta propietaria/editora del proyecto. Si pide un TXT de verificación, ese valor es público y puede proporcionarse para aplicarlo mediante el DNS autorizado. Un TXT existente no acredita qué cuenta tiene la propiedad verificada.
3. Cuando Google lo permita, **Publicar marca**. La documentación actual exige marca publicada antes de pedir la revisión de acceso a datos. Publicar la marca, cambiar el público y obtener aprobación de alcances son estados distintos.
4. [Acceso a datos](https://console.cloud.google.com/auth/scopes?project=468881730124): declarar todos los alcances de ambos recorridos, descritos abajo.
5. [Público](https://console.cloud.google.com/auth/audience?project=468881730124): confirmar Externo y el estado real. El último estado comunicado era Pruebas. Pasar a producción no equivale a obtener verificación ni elimina por sí solo advertencias o límites. Mientras siga en pruebas, solo usuarios de prueba autorizados; los refresh tokens pueden expirar a los siete días.
6. [Centro de verificación](https://console.cloud.google.com/auth/verification?project=468881730124): justificaciones, vídeo real y observaciones de Google. Conservar el justificante sin secretos.

Preparar y solicitar revisión no activa facturación. Como el importador procesa datos de un alcance restringido en servidor, **debe planificarse una evaluación anual CASA por un evaluador aprobado, salvo excepción confirmada por Google**. No se ha obtenido un presupuesto, solicitado una excepción ni contratado una evaluación. La app comercial multiempresa no se debe declarar personal o interna para eludir la revisión. Cualquier gasto o ampliación del presupuesto requiere autorización expresa.

## Justificación de alcances

El mismo cliente sirve ambos recorridos. La solicitud empresarial permanece de solo lectura; `gmail.modify` corresponde a Mi correo. No ocultar una de esas funciones en la declaración ni añadir borrado definitivo, Drive, contactos o calendario.

| Alcance                                                                     | Necesidad                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openid`                                                                    | Identidad Google estable para vincular el consentimiento empresarial al mismo usuario y empresa que lo inició.                                                                                                                   |
| `https://www.googleapis.com/auth/userinfo.email` (alias solicitado `email`) | Verificar el correo y su coincidencia con el perfil Gmail antes de guardar la conexión empresarial.                                                                                                                              |
| `https://www.googleapis.com/auth/gmail.readonly` — restringido              | Buscar facturas recibidas en un período y descargar sus adjuntos. `gmail.metadata` no permite descargar documentos y un complemento limitado al mensaje abierto no cubre la búsqueda por período. No envía ni modifica mensajes. |
| `https://www.googleapis.com/auth/gmail.modify` — restringido                | Mi correo: leer, buscar, enviar/responder y gestionar mensajes mediante acciones reversibles, sin borrado definitivo. Solo lectura o solo envío no cubren esas funciones.                                                        |

Texto preparado en inglés:

> TruckControl AI is a fleet-management application for transport companies. The optional personal mailbox lets a signed-in user read, search, send and manage their own Gmail messages directly in their browser. Separately, a company administrator may authorize a read-only Gmail connection to import candidate invoice attachments received during a chosen period: 30 days by default and within the most recent 12 months. Users review imported documents before recording any expense. Optional invoice extraction requires account permissions and explicit consent. Google data is not sold, used for advertising or used to train general-purpose AI models.

## Flujo de datos que debe declararse

- **Mi correo:** Google Identity Services y llamadas directas a Gmail; token temporal y contenido solo en RAM. Sin envío al backend/IA o copias offline. Cerrar, recargar, caducar o cambiar usuario/empresa limpia esa sesión. Revocar en Google puede afectar otras autorizaciones del mismo cliente.
- **Facturas:** sesión TruckControl, rol/licencia/módulo, estado de un uso y PKCE; mismo usuario/empresa al finalizar. Refresh token cifrado AES-256-GCM fuera del esquema público. Originales importados en almacenamiento privado con permisos por empresa.
- **Minimización:** fecha `internalDate` antes de contenido/adjuntos, Europe/Madrid, 30 días por defecto y máximo últimos 12 meses. Hasta 50 mensajes por página y diez documentos nuevos por ejecución; deduplicación. No hay importación programada activa ni lectura de todo el buzón por IA.
- **IA opcional:** solo documento autorizado al proveedor existente OpenAI, con consentimiento, cuotas y presupuesto global de 10 USD/mes antes de impuestos. No se transmiten tokens Gmail al modelo. Contenido no fiable, sin herramientas para ejecutar acciones; revisión humana antes del gasto. No habilitar programas de compartición de estos datos para entrenar modelos generales.
- **Retirada y conservación:** desconectar solicita revocación en Google y elimina el token local tras completarla. No presenta un fallo como desconexión terminada ni borra silenciosamente documentos contables. Exportación y solicitudes verificadas de supresión/devolución según los textos publicados y obligaciones aplicables, incluidas copias. No prometer plazos numéricos o borrado instantáneo que no estén implementados.

Declarar el envío de documentos autorizados a Supabase/OpenAI. No afirmar que todas las funciones son exclusivamente locales. Revisar contratos y opciones de uso de datos de los proveedores antes de firmar declaraciones. Los tests no sustituyen revisión jurídica o evaluación externa.

## Aceptación empresarial y vídeo real

El consentimiento lo da el titular del buzón. Su sesión personal no puede copiarse al importador. En [Correo y facturas](https://truckcontrolai.com/#/invoices), un administrador con módulo habilitado pulsa **Conectar Gmail de esta empresa** y autoriza el buzón de prueba. Confirmar el estado conectado antes de importar. Los clientes Básico conservan sus permisos comerciales; esta preparación no desbloquea Full.

Utilizar una factura ficticia recibida en un buzón controlado y autorizado. Revisar empresa/período, importar y comprobar el original privado; repetir para verificar deduplicación y aprobar solo tras revisión. El ensayo con otra empresa debe usar cuentas ficticias verificadas/autorizadas, sin deshabilitar controles globales ni acceder a clientes reales.

Guion para grabar, con el consentimiento Google **en inglés**:

1. Portada, privacidad y condiciones públicas; nombre TruckControl AI.
2. Acceso a TruckControl y selección de empresa.
3. Conexión empresarial y consentimiento de solo lectura; nombre de app e ID público visibles. Ocultar contraseñas, MFA, códigos, tickets, tokens y datos personales.
4. Retorno a la misma empresa; 30 días por defecto y selector hasta 12 meses.
5. Importar factura ficticia y revisar original. IA solo con permiso, consentimiento y confirmación de consumo; sin gasto automático.
6. Repetir para mostrar deduplicación; después confirmar el gasto revisado.
7. Mi correo por separado: consentimiento `gmail.modify`, lectura, envío ficticio a destinatario controlado y acción reversible.
8. Retirada de acceso sin revelar secretos. Subir el vídeo como no listado en una cuenta del titular y aportar su enlace a Google.

El vídeo aún no está grabado ni enviado. Fixtures, screenshots y tests no lo sustituyen ni prueban consentimiento real. El verificador público ahora comprueba los enlaces y contenido legal sin entrar en una cuenta, en seis perfiles HTTPS emulados; su resultado se registra en el PR de esta preparación. La corrección 0.5.14-rc.1 añade al retorno del navegador el hostname técnico de producción que el servidor ya admitía; conserva los rechazos de destinos ajenos. Su publicación depende de las pruebas. No cambia backend, credenciales, permisos comerciales, precios o presupuesto.

Referencias oficiales consultadas el 03/11/2026: [marca](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification), [alcances restringidos/CASA anual](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification), [alcances Gmail](https://developers.google.com/workspace/gmail/api/auth/scopes), [Workspace/Limited Use](https://developers.google.com/workspace/workspace-api-user-data-developer-policy), [producción](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance).
