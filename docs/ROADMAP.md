# Estado y continuación — 06/11/2026

Continuación del 06/11: [retorno fiable de Gmail](GMAIL_CONNECTION_RELIABILITY.md). Publicada v28 / 0.5.16-rc.1, corrige pérdida de avisos, retorno a ventana abierta y contexto de cuenta global/demo. El expediente de Google y los cuatro alcances declarados se conservan; no se ha completado su revisión pública. No se modifican permisos, credenciales, contabilidad ni presupuesto.

La entrega publicada es **v28 / 0.5.16-rc.1** en https://truckcontrolai.com, con 883 controles de código/fuente y 75 hashes HTTPS verificados. [Estado y evidencia](CURRENT_DELIVERY.md). Demo6 y producciones anteriores siguen recuperables. Cero vínculos/estados de Gmail empresariales en servidor el 06/11 a las 05:27:39 UTC. La aceptación empresarial real y el vídeo/declaración de Google permanecen pendientes.

## Implementado y comprobado

React/TypeScript y PWA para Android y Windows, Fleet Light y Fleet Cockpit, panel, camiones, conductores, remolques, clientes, viajes, combustible, mantenimiento, ingresos, gastos y rentabilidad. Límite inicial de 50 camiones por empresa, roles, módulos y RLS. Las pruebas de aislamiento usan datos ficticios y rollback; FIXPilot permanece separado. Hay 57 migraciones aplicadas y registradas; el registro de neumáticos está publicado sin cambiar permisos, planes ni contabilidad.

Registro abierto con aceptación legal inmutable y confirmación por correo; cuenta propietaria verificada. Confirmación y recuperación funcionan mediante Resend y enlaces nativos Supabase, sin depender de SMTP Migadu. Las nuevas altas obtienen **10 días de Básico**, sin elevar permisos por solicitar Full. Precios aprobados: **Básico 300 €/mes + IVA 21 %; Full 700 €/mes + IVA 21 %**. Los períodos históricos se conservan y los cobros automáticos siguen desactivados.

Documentos privados clasificados, archivables y con vencimiento, avisos dentro de la app, filtros y CSV. Informes por camión y kilómetro con datos registrados; consumo solo entre repostajes completos del período, sin inventar mediciones. Copias cifradas incluyen los metadatos y mantienen lectura del formato anterior. [Guía](DOCUMENT_REGISTER.md).

Offline: copia empresarial cifrada opcional y cola de operaciones, límites temporales, bloqueo por inactividad, conflictos conservados y revalidación antes de sincronizar. Los documentos privados y apuntes contables no se editan offline. Instalar la PWA no activa esa copia.

Receptor de facturas por reenvío desde distintos proveedores, webhooks firmados, originales privados, duplicados e aislamiento comprobados. IA opcional en backend con consentimiento, cuotas y presupuesto global aprobado de 10 USD/mes antes de impuestos, sin recarga automática. Las propuestas requieren revisión humana antes de contabilizar. [Correo general](GENERAL_EMAIL.md).

La bandeja permite búsqueda, filtros, CSV y páginas de doce tarjetas; carga más de 200 registros con una RPC nueva, valida empresa/cursor y no mantiene una lista parcial ante errores. Usuarios de consulta sin aprobación de gastos; importes sin medir y monedas separados. Importación y asistente admiten también las PWA del hostname técnico. [Guía y límites](INVOICE_INBOX.md).

Mi correo personal está implementado para Gmail con acceso directo desde el navegador y sin aprobación de TruckControl, también en Básico. El ID está configurado y el titular confirmó una prueba y envío reales; la verificación pública de Google sigue pendiente. No comparte tokens/mensajes con el backend o IA. [Alcance](PERSONAL_MAIL.md).

## Pendientes concretos

- **Gmail empresarial de facturas:** servidor v13 y período de recepción obligatorio: 30 días por defecto, máximo últimos 12 meses. La configuración Google ya devuelve configured=true; falta la aceptación real de esta conexión empresarial y la revisión pública de Google. Mi correo personal fue probado por el titular. No volver a pedir ID ni secretos para el acceso personal. [Período e IA](INVOICE_MAIL_PERIOD.md).
- **Migadu:** los tres CNAME siguen publicados. El 06/11 Google devuelve SERVFAIL/DNSSEC al buscar TXT; Cloudflare devuelve NOERROR y, en la comprobación detallada de key1, el TXT «migadu», que no es una clave DKIM utilizable. No se considera verificado el envío. No se cambia DNSSEC, DNS o plan; el soporte previo sigue separado del correo de acceso Resend. [Evidencia](verification/migadu-dns-20261106.json).
- **SMS y pagos:** proveedores, renovaciones y cobros reales pendientes de autorización y aceptación; permanecen apagados.
- **Aceptación operativa:** dispositivos físicos Android/Windows, restauración integral del servicio gestionado, SLA de copias y revisión jurídica externa. Las emulaciones y las copias cifradas comprobadas no sustituyen esas verificaciones.

## Operación continua

GitHub permite escritura, ramas, commits, PR, CI y merge. La administración de Pages y protección de ramas necesita permisos administrativos distintos; no se eluden. Sites aloja la PWA por HTTPS y conserva versiones para recuperación. No hay instaladores nativos ni publicación en tiendas.

El CI conserva las 64 pruebas iniciales y verifica código, permisos, copias, temas y navegadores. [PR #27](https://github.com/smartscaneuskadi/TruckControl-AI/pull/27/checks) registra la aceptación posterior de v23, con seis perfiles de correo ficticio/neumáticos offline y configuración pública de Google; no acredita un buzón real. Las alertas actuales son internas; correo/SMS/push automáticos requieren su propia implementación y aceptación.

El filtro de Gmail está publicado en v25: metadatos antes de contenido/IA, confirmación de rango/empresa, cursor unido al período, siete fuentes nativas y 16 HTTP verificados. Sin migraciones, permisos nuevos, cambios de presupuesto o contabilidad; las 64 originales conservan once hashes. Primera implementación: 854 controles. Revisión final de ayuda/versión: 26 recorridos. [Aceptación pública posterior en PR #29](https://github.com/smartscaneuskadi/TruckControl-AI/pull/29/checks).
