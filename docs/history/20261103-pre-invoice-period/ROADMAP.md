# Estado y continuación — 02/11/2026

La entrega vigente es **v23 / 0.5.12-rc.1**, publicada en https://truckcontrolai.com. [Estado y evidencia](CURRENT_DELIVERY.md). La demo v6 sigue separada y la producción anterior v19 permanece recuperable. El registro de [neumáticos](TYRES.md) está publicado: mediciones manuales, avisos, historial, CSV y copias completas, con la migración 57 comprobada mediante rollback.

## Implementado y comprobado

React/TypeScript y PWA para Android y Windows, Fleet Light y Fleet Cockpit, panel, camiones, conductores, remolques, clientes, viajes, combustible, mantenimiento, ingresos, gastos y rentabilidad. Límite inicial de 50 camiones por empresa, roles, módulos y RLS. Las pruebas de aislamiento usan datos ficticios y rollback; FIXPilot permanece separado. Hay 57 migraciones aplicadas y registradas; el registro de neumáticos está publicado sin cambiar permisos, planes ni contabilidad.

Registro abierto con aceptación legal inmutable y confirmación por correo; cuenta propietaria verificada. Confirmación y recuperación funcionan mediante Resend y enlaces nativos Supabase, sin depender de SMTP Migadu. Las nuevas altas obtienen **10 días de Básico**, sin elevar permisos por solicitar Full. Precios aprobados: **Básico 300 €/mes + IVA 21 %; Full 700 €/mes + IVA 21 %**. Los períodos históricos se conservan y los cobros automáticos siguen desactivados.

Documentos privados clasificados, archivables y con vencimiento, avisos dentro de la app, filtros y CSV. Informes por camión y kilómetro con datos registrados; consumo solo entre repostajes completos del período, sin inventar mediciones. Copias cifradas incluyen los metadatos y mantienen lectura del formato anterior. [Guía](DOCUMENT_REGISTER.md).

Offline: copia empresarial cifrada opcional y cola de operaciones, límites temporales, bloqueo por inactividad, conflictos conservados y revalidación antes de sincronizar. Los documentos privados y apuntes contables no se editan offline. Instalar la PWA no activa esa copia.

Receptor de facturas por reenvío desde distintos proveedores, webhooks firmados, originales privados, duplicados e aislamiento comprobados. IA opcional en backend con consentimiento, cuotas y presupuesto global aprobado de 10 USD/mes antes de impuestos, sin recarga automática. Las propuestas requieren revisión humana antes de contabilizar. [Correo general](GENERAL_EMAIL.md).

La bandeja permite búsqueda, filtros, CSV y páginas de doce tarjetas; carga más de 200 registros con una RPC nueva, valida empresa/cursor y no mantiene una lista parcial ante errores. Usuarios de consulta sin aprobación de gastos; importes sin medir y monedas separados. Importación y asistente admiten también las PWA del hostname técnico. [Guía y límites](INVOICE_INBOX.md).

Mi correo personal está implementado para Gmail con acceso directo desde el navegador y sin aprobación de TruckControl, también en Básico. La autorización real sigue pendiente del identificador público válido y la verificación de Google. No comparte tokens/mensajes con el backend o IA. [Alcance](PERSONAL_MAIL.md).

## Pendientes concretos

- **Gmail directo:** backend v12 y cuatro retornos permitidos comprobados; el diagnóstico real sigue `configured=false`. El propietario debe completar el cliente Google en Administración → Servicios. Después se podrá verificar el consentimiento de un buzón autorizado y la revisión Google necesaria para clientes externos. El reenvío general funciona por separado.
- **Migadu:** dominio activo según titular, pero los tres destinos DKIM bajo migadu.com siguen devolviendo SERVFAIL/DNSSEC en la última comprobación del 02/11/2026, a las 15:10 UTC. Soporte ya informado; buzones y entrega pendientes de verificación. No cambiar DNSSEC ni contratar de nuevo.
- **SMS y pagos:** proveedores, renovaciones y cobros reales pendientes de autorización y aceptación; permanecen apagados.
- **Aceptación operativa:** dispositivos físicos Android/Windows, restauración integral del servicio gestionado, SLA de copias y revisión jurídica externa. Las emulaciones y las copias cifradas comprobadas no sustituyen esas verificaciones.

## Operación continua

GitHub permite escritura, ramas, commits, PR, CI y merge. La administración de Pages y protección de ramas necesita permisos administrativos distintos; no se eluden. Sites aloja la PWA por HTTPS y conserva versiones para recuperación. No hay instaladores nativos ni publicación en tiendas.

El CI conserva las 64 pruebas iniciales y verifica código, permisos, copias, temas y navegadores. [PR #27](https://github.com/smartscaneuskadi/TruckControl-AI/pull/27/checks) registra la aceptación posterior de v23, con seis perfiles de correo ficticio/neumáticos offline y configuración pública de Google; no acredita un buzón real. Las alertas actuales son internas; correo/SMS/push automáticos requieren su propia implementación y aceptación.
