# Bandeja de correo y facturas

La versión 17 añade [lectura IA de originales guardados](INVOICE_AI.md), con confirmación y sin necesitar Gmail. El estado de publicación actual se consulta en [entrega vigente](CURRENT_DELIVERY.md); los datos de v16 que siguen son la evidencia de esta fase original.

**Publicada 0.5.9-rc.1 / versión 16 en https://truckcontrolai.com.** Conserva producción v15 y demo v6. La publicación y sus comprobaciones se registran en [entrega vigente](CURRENT_DELIVERY.md), el [inventario de alojamiento](deployment/candidate-hosting.json), el checkpoint `/workspace/artifacts/truckcontrol-invoice-inbox-20261102/checkpoint.json` y los [checks de PR #24](https://github.com/smartscaneuskadi/TruckControl-AI/pull/24/checks).

## Consultar y exportar

En **Correo y facturas → Facturas y revisión**:

- Buscar por proveedor o número, sin distinguir mayúsculas ni acentos.
- Combinar estado, origen y fechas. El período utiliza la fecha de la factura; los documentos sin fecha quedan fuera cuando se elige un período.
- Consultar doce tarjetas por página. **Actualizar facturas** vuelve a comprobar permisos y datos en el servidor.
- **Exportar facturas** descarga todas las filas del filtro, con moneda, base, IVA, total y referencia del gasto cuando existe. Los campos desconocidos quedan vacíos y los textos se protegen contra fórmulas de hoja de cálculo. No se exportan claves, rutas privadas ni cuerpos de correo.
- La base conocida solo suma importes en EUR. Incluye documentos revisados y por revisar; no representa gastos contabilizados. Las otras monedas se conservan sin conversión y no se muestran como euros.

La lectura usa páginas de hasta 200 registros y ya no oculta las facturas anteriores al antiguo límite de 200. La capacidad de esta interfaz está limitada explícitamente a 10.000: si se supera o falla una página, se informa y no se muestra una lista parcial como completa. Una factura nueva recibida durante la consulta puede necesitar **Actualizar facturas**.

Los usuarios de consulta pueden leer y exportar su bandeja autorizada; no pueden registrar gastos. La confirmación sigue siendo humana, registra la base sin IVA una sola vez y deja el gasto pendiente de pago. Importar, buscar o exportar no contabiliza nada. El archivo original se conserva.

## Correo e IA desde las instalaciones anteriores

`company-mail` v11 y `company-assistant` v10 admiten los tres orígenes exactos de producción, incluido el hostname técnico de las PWA anteriores. Se conserva el origen heredado que ya admitían; no se añaden comodines ni subdominios ajenos. Sus manejadores de autenticación, empresas, permisos, cuotas, firma del receptor y presupuesto IA permanecen iguales.

La lectura IA conserva permiso, consentimiento, revisión y presupuesto global aprobado de 10 USD/mes antes de impuestos, sin recarga automática. Esta entrega no hace llamadas a Google/OpenAI, no envía correo, no cambia claves ni activa nuevos cargos.

Gmail directo sigue necesitando la pareja Google reconocida y el consentimiento del buzón. El reenvío desde distintos proveedores funciona por separado. Guardar credenciales Google se realiza exclusivamente desde **Administración → Servicios**. [Correo general](GENERAL_EMAIL.md), [Servicios](PROVIDER_ADMIN.md).

## Base de datos y recuperación

Migración local `20261102131804_invoice_inbox_pagination.sql`, remota `20261102132728`; **55 migraciones** aplicadas. Añade únicamente un índice por empresa/ID y una RPC de lectura `tc_invoice_page`, invoker con `search_path` vacío, permisos explícitos y RLS existente. Cada página revalida empresa, usuario, módulo y licencia. La RPC anterior se conserva para las aplicaciones previas; no se modifica ningún original, apunte ni política comercial.

La interfaz valida los campos, empresa y avance del cursor y cancela la carga al salir. Una revocación o respuesta inválida retira el listado visible. Cambiar de empresa reconstruye la sesión de la interfaz y no comparte sus filtros ni documentos.

La producción v15 y la demo v6 se conservan. Una recuperación de interfaz no requiere borrar esta migración. Antes de desplegar funciones, guardar sus fuentes anteriores y pasar `import_map_path` relativo explícito: el proveedor puede conservar una ruta absoluta de la versión anterior si se omite. No reutilizar esa ruta temporal.

## Evidencia

Pasan 514 pruebas unitarias/SQL, las 64 iniciales conservan once hashes y 48 recorridos SaaS emulados Android/Windows pasan. El caso nuevo incluye 205 facturas, filtros, CSV, modo consulta, revocación, ambos temas y cero infracciones Axe AA. El código y la fuente exacta pasan 720 controles previos al despliegue; los checks de PR #24 registran la aceptación pública posterior de v16. Los 72 hashes HTTPS coinciden con el paquete, y la demo permanece intacta.

El [ensayo nativo](verification/invoice-inbox-rollback.sql) comprueba paginación, aislamiento, consulta, membresía revocada, módulo desactivado, RPC antigua y acceso anónimo. Revierte todas sus identidades y registros; las huellas de facturas, documentos, clientes, planes, ajustes y contabilidad permanecen iguales. [Resultado](verification/invoice-inbox-native-20261102.json). Los controles HTTP posteriores conservan la exigencia de autenticación y rechazan dominios ajenos, sin consumo IA.

Gmail OAuth real, buzones Migadu/DKIM, SMS, cobros recurrentes, aceptación en dispositivos físicos, recuperación integral del servicio gestionado y revisión jurídica externa continúan pendientes según la entrega vigente.

La revisión visual del paquete exacto corrigió el espaciado de los filtros antes de publicar y distingue expresamente «Sin importes disponibles» de un cero conocido. [Cuatro perfiles/temas](verification/invoice-inbox-visual-20261102.json), [HTTPS](verification/invoice-inbox-production-https-20261102.json).
