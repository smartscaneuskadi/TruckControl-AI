# Ocho perfiles del copiloto — tarea37

Estado inicial del07/11/2026: desarrollo en `feat/ai-specialists-20261107`, base `8ba50d4`. Producción31, fuente2055e99 y demo6 conservadas. Este documento no acredita todavía nuevas conexiones reales.

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

La matriz pasará a «verificado» perfil por perfil únicamente tras aceptación nativa/HTTP con una llamada real y evidencia. No se describen como ocho servicios autónomos independientes. Costes iniciales de esta tarea:0; todavía no se han realizado llamadas nuevas al modelo.

## Avance local

Se han implementado los ocho perfiles y el contrato aditivo de especialistas, sin cambiar el contrato v31. Los cálculos de beneficio, euros por kilómetro e intervalos full-to-full se ejecutan en SQL. Las fuentes se congelan por turno y las citas se resuelven contra su catálogo; los perfiles no amplían roles o módulos. El documental selecciona hasta tres originales privados,2MB en conjunto, y verifica autorización y contenido antes de enviarlos al mismo proveedor.

La interfaz incorpora selector, ejemplos, fuentes y limitaciones, selección documental y preferencias de avisos. Cambiar perfil limpia la conversación; cambiar cuenta, empresa o permisos aborta y descarta respuestas. Los avisos son reglas del servidor con límite50 por lote, una revisión por día/usuario/perfil, reintentos acotados a3 y permisos revalidados. No llaman al modelo ni modifican fichas.

781 pruebas locales en79 archivos pasan, además de TypeScript y compilación PWA; las64 originales conservan sus11 hashes. Incluyen54 pruebas nuevas de perfiles, aislamiento, permisos, cálculos, fuentes, cuota/llamadas, recuperación y trabajos. La migración local20261107063555 todavía no se ha ejecutado en Supabase: remoto sigue en59 y company-copilot en v1. Los perfiles nuevos aún no tienen aceptación real ni despliegue.
