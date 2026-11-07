# Ocho perfiles del copiloto — tarea37

Estado inicial del07/11/2026: desarrollo en `feat/ai-specialists-20261107`, base `8ba50d4`. Producción31, fuente2055e99 y demo6 conservadas. La aceptación real del07/11 ya verifica8/8 perfiles con datos ficticios; la promoción de interfaz está en preparación.

| Perfil        | Datos y herramientas previstos                                         | Confirmaciones y límites                                                                        |
| ------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| General       | Módulos autorizados de la empresa y fuentes del turno                  | Propuestas, sin ejecución por el modelo                                                         |
| Documental    | PDF/imágenes elegidos explícitamente, fichas y vencimientos permitidos | Originales privados; citas verificadas; pregunta cuando falta evidencia                         |
| Financiero    | Apuntes EUR, agregados completos del período y kilómetros registrados  | Base sin IVA; sin cobros, pagos ni asientos fiscales automáticos                                |
| Combustible   | Repostajes, odómetros y depósitos completos                            | Consumo solo con intervalo válido; sin GPS/TPMS inventados                                      |
| Mantenimiento | Revisiones, averías y vencimientos autorizados                         | Tareas inmutables que confirma el usuario                                                       |
| Conductores   | Fichas, permisos y asignaciones registradas                            | No acredita conducción/descanso sin datos de tacógrafo                                          |
| Viajes        | Clientes, remolques, asignaciones y viajes permitidos                  | Presupuesto del viaje distinto de ingreso contabilizado; costes sin vínculo quedan desconocidos |
| Dirección     | Indicadores y prioridades de módulos disponibles                       | No eleva permisos ni mezcla empresas                                                            |

Los perfiles reutilizan company-copilot, la credencial backend existente, consentimiento y cuota compartida100/empresa/mes. Se conserva el límite global10USD/mes. El nuevo techo agregado200EUR no es una orden de gastar ni activa compras o renovaciones. Las pruebas reales utilizarán datos ficticios y un registro de uso; las estimaciones internas por tokens se distinguirán de la factura del proveedor.

Se mantiene la interfaz y contrato v31. El protocolo de especialistas se añade mediante un subendpoint y RPC privados separados, con comprobación de usuario/empresa, catálogo cerrado de referencias y permisos actuales. Las propuestas reutilizan la ejecución, versión e idempotencia existentes; no hay pagos, correo externo, permisos o facturas fiscales automáticos.

Los avisos periódicos serán opt-in y estarán sujetos a licencia, módulos y consentimiento vigentes, límites y reintentos. Sus revisiones programadas serán reglas de servidor sin llamadas de pago al modelo; el análisis IA se solicitará expresamente desde la aplicación. No se procesarán empresas reales durante la aceptación.

Los ocho perfiles cuentan con aceptación real y atestación privada individual. Son ocho perfiles del mismo orquestador, no ocho servicios autónomos independientes. Las ocho llamadas están settled:19.465 microUSD estimados (0,019465USD), sin factura del proveedor disponible ni conversión EUR declarada. No hay servicios nuevos o ampliación del presupuesto. [Evidencia real](verification/ai-specialists-live-20261107.json).

## Avance local

Se han implementado los ocho perfiles y el contrato aditivo de especialistas, sin cambiar el contrato v31. Los cálculos de beneficio, euros por kilómetro e intervalos full-to-full se ejecutan en SQL. Las fuentes se congelan por turno y las citas se resuelven contra su catálogo; los perfiles no amplían roles o módulos. El documental selecciona hasta tres originales privados,2MB en conjunto, y verifica autorización y contenido antes de enviarlos al mismo proveedor.

La interfaz incorpora selector, ejemplos, fuentes y limitaciones, selección documental y preferencias de avisos. Cambiar perfil limpia la conversación; cambiar cuenta, empresa o permisos aborta y descarta respuestas. Los avisos son reglas del servidor con límite50 por lote, una revisión por día/usuario/perfil, reintentos acotados a3 y permisos revalidados. No llaman al modelo ni modifican fichas.

785 pruebas locales en80 archivos, más4 comprobaciones de indicadores de avisos, pasan, además de TypeScript y compilación PWA; las64 originales conservan sus11 hashes. Incluyen58 pruebas nuevas de perfiles, aislamiento, permisos, cálculos, fuentes, presupuesto compartido, recuperación y trabajos. La migración local20261107063555 se corresponde con la remota20261107090047,60 totales, aplicada una vez. El contrato nativo con rollback pasa y deja cero fixtures; datos/planes/ajustes anteriores intactos. El cron SQL registra ejecuciones correctas. Las dos tablas administrativas sin acceso de clientes mantienen RLS denegando todo por defecto; el asesor informa de ello a nivel INFO, sin advertencias nuevas. La repetición SaaS pasa132/132 y el backend company-copilot v2 tiene sus9 fuentes exactas; los otros7 servicios siguen intactos. La revisión automática autorizó el despliegue al completar esas comprobaciones. Staging privado1 está publicado y su paquete exacto pasa14 pruebas, con conexión a datos de clientes bloqueada por el guard de candidata existente. La interfaz pública sigue en v31 hasta promocionar la fuente final con CI verde.

## Uso, permisos y mantenimiento

En Copiloto, el administrador de empresa habilita IA y acepta el consentimiento; el selector permite cambiar entre los perfiles autorizados. Documental exige elegir expresamente los originales. Las respuestas muestran fuentes y datos desconocidos; cada propuesta de cambio se confirma por separado. Para consultar cifras faltantes se habilita el módulo correspondiente, sin convertir la falta de permisos en cero. No se lee Mi correo automáticamente.

Los avisos personales se activan en «Avisos periódicos opcionales». La interfaz exige un heartbeat reciente del cron, muestra indicadores numéricos del informe y permite retirar la preferencia. Los trabajos son reglas SQL y no consultas IA. Se limitan a50 por lote,3 intentos y una revisión diaria por usuario/perfil; al perder permisos se cancelan y no se muestran resultados con un snapshot de módulos anterior. El consentimiento retirado protege también turnos guardados.

Se conservan en el backend privado el contexto, las fuentes y el resultado del turno para recuperar respuestas y auditar propuestas; no entran en la copia offline. La conversación visible se descarta al cambiar de usuario, empresa, perfil o consentimiento. Solo el backend accede a claves y originales; el navegador no puede certificar perfiles, ampliar cuotas o acceder al catálogo de staging.

Para recuperar producción se conserva la versión31 y sus fuentes congeladas, sin revertir ni repetir la migración aditiva. La demo6 es otro proyecto. Los contratos v31 siguen disponibles. La atestación demuestra la conexión probada en una fecha, no garantiza disponibilidad perpetua de terceros: los fallos de proveedor se presentan sin reintento automático facturable.

Pendientes de esta entrega: CI de la fuente final, promoción pública, prueba nativa de interfaz con cuentas ficticias, cierre de esas cuentas y recibo final. Dispositivos físicos y micrófono real no están disponibles; Android/Windows y voz se prueban por emulación. Los bloqueos históricos de Gmail público, fiscalidad y cobros se conservan y no se declaran resueltos por esta tarea.
