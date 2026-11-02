# Lectura IA de facturas guardadas

Preparada en 0.5.10-rc.1, sobre la bandeja existente. No depende de Gmail OAuth: sirve para originales recibidos por reenvío o importados como correo, PDF o imagen. La publicación comprobada se registra en [entrega vigente](CURRENT_DELIVERY.md).

## Uso

1. Entrar en la empresa y abrir **Correo y facturas → Facturas y revisión**.
2. El administrador debe tener habilitada la lectura IA para la cuenta; el usuario debe aceptar **Usar lectura IA para mis facturas**. Se necesita permiso de escritura y conexión a internet.
3. En una factura pendiente y aún no analizada, pulsar **Solicitar lectura IA**. Cancelar no inicia el análisis. Confirmar envía únicamente ese original al proveedor existente de IA.
4. Revisar los campos propuestos y el original. **Revisar factura** permite corregirlos y confirmar el gasto por separado. La IA nunca contabiliza ni paga una factura.

Solo se permite la primera solicitud con consumo de cada factura. Si una llamada queda sin respuesta, se conserva su reserva y no se repite automáticamente. La bandeja distingue una lectura solicitada de un resultado guardado. Se puede completar el documento manualmente. Los originales de más de 6 MB se conservan, pero requieren revisión manual.

## Permisos y coste

Cada solicitud valida sesión mediante `getUser`, empresa, licencia, rol de escritura, módulo y consentimiento. Los estados se consultan en un lote por página, sin consumo de modelo; no incluyen rutas privadas ni claves. Las llamadas de análisis requieren confirmación explícita y el backend obtiene la ruta del servidor, nunca del navegador.

Antes del envío se comprueban tamaño, tipo binario y SHA-256 del original privado; se revalidan acceso y estado después de descargarlo. Se reutilizan la reserva única por factura, las cuotas y el presupuesto global existente de **10 USD/mes antes de impuestos**, sin recarga automática. No se activa un proveedor ni un presupuesto nuevo. Una reserva sin respuesta puede reducir el disponible: no se libera sin evidencia del consumo.

Los campos extraídos se aplican solo si la factura sigue pendiente y el usuario conserva sus permisos. La función de aprobación y la lógica económica permanecen sin cambios. No se modifica el archivo original, no se guardan documentos privados en WebStorage y esta operación no se encola offline.

## Backend y recuperación

- Único proyecto: `truckcontrol-ai / kkkemaycedexymrpaqtp`.
- Migración local `20261102143339_invoice_ai_on_demand.sql`, remota `20261102145944`, total 56. Añade dos funciones de lectura invoker, `search_path` vacío y ejecución exclusiva del rol de servicio. No añade tablas, políticas, presupuesto ni cambios de datos.
- `company-mail` v12 conserva acciones anteriores, autenticación propia y los orígenes exactos de v11. Fuentes anteriores guardadas en `/workspace/artifacts/truckcontrol-invoice-ai-20261102/company-mail-v11`.
- Para recuperar la interfaz anterior se conserva v16. No es necesario borrar la migración; v16 sigue usando las acciones existentes. No restablecer reservas ni borrar auditoría para forzar un nuevo análisis.

## Verificación y límites

538 pruebas unitarias/SQL y las 64 iniciales conservadas por once hashes. Los 52 recorridos SaaS pasan en Android/Windows emulados; los nuevos casos verifican confirmación, cancelación, falta de Gmail, retirada del consentimiento, resultado incierto, ausencia de gasto automático, ambos temas y accesibilidad. El ajuste de botones evita desbordamiento en Android.

El [ensayo nativo con rollback](verification/invoice-ai-rollback.sql) comprueba actores, empresas, consulta, exceso de tamaño, consentimiento y reserva única. No quedan usuarios, documentos, facturas ni reservas ficticias; las huellas comerciales, documentos, contabilidad y las tres llamadas IA anteriores permanecen idénticas. [Resultado](verification/invoice-ai-native-20261102.json), [fuentes del backend](verification/invoice-ai-edge-20261102.json).

Esta entrega no realiza nuevas llamadas reales a OpenAI: usa la conexión existente y pruebas con proveedor simulado. La aceptación anterior del proveedor se conserva. Gmail OAuth directo, buzones Migadu/DKIM, SMS, cobros recurrentes, dispositivos físicos y recuperación integral del servicio gestionado siguen con los límites descritos en la entrega vigente.
