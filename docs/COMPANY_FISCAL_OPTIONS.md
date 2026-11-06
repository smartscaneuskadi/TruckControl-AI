# Opciones fiscales por empresa

La configuración corresponde a las facturas que emita cada empresa de transporte. La facturación de la suscripción de TruckControl por ELEVADANCOR S.L. mantiene su configuración y control de lanzamiento independientes; no utiliza la elección TicketBAI de los clientes.

## Opciones preparadas

| Sistema                         | Preparación disponible                                                                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TicketBAI                       | Elección expresa de Álava/Araba, Bizkaia o Gipuzkoa. Requiere el software garante y la conexión autorizada de la empresa para emitir realmente.                           |
| VERI*FACTU · AEAT               | Preferencia para una futura conexión compatible cuando esta modalidad sea aplicable.                                                                                      |
| SIF NO VERI*FACTU · AEAT        | Preferencia independiente, sujeta a un programa compatible y sus requisitos de registros, firma y conservación.                                                           |
| Programa externo / otro régimen | Preparación para el programa habitual o supuestos que requieren otra integración, incluidos Navarra o SII. No se asigna automáticamente una modalidad AEAT a estos casos. |
| Facturae                        | Formato adicional, separado del sistema fiscal. La firma y entrega a FACe necesitan un proveedor compatible.                                                              |

El formato previsto puede ser PDF del programa de facturación o Facturae, si está permitido. Seleccionar un formato no crea una factura ni acredita cumplimiento. No se decide el régimen por la dirección, CIF, provincia o plan comercial: debe confirmarlo la empresa con su asesoría.

**Esta entrega prepara y guarda las opciones. No emite facturas fiscales, asigna series o números, genera firmas/QR fiscales, remite datos a Hacienda ni entrega facturas reales.** El servidor devuelve `phase=preparation` y `emission_available=false`. La administración puede autorizar la configuración; activar una casilla no conecta ni certifica un sistema de emisión. No se contratan servicios, activan cobros, envían correos o consumen IA.

## Uso en la aplicación

1. Administración global → **Facturación de empresas** → **Permisos fiscales de [empresa]**.
2. Marcar **Habilitar configuración fiscal para esta empresa** y los sistemas que se permiten. Facturae tiene su permiso adicional. Para habilitar debe permitirse al menos un sistema.
3. Guardar. Los permisos solo corresponden a esa empresa, incluso cuando un mismo propietario gestiona varias.
4. El propietario o administrador de la empresa entra en **Configuración → Facturación de tu empresa**, elige un sistema permitido, el territorio si utiliza TicketBAI y el formato previsto, y guarda.

Se puede deshabilitar la configuración completa o retirar una opción. El perfil y la auditoría se conservan; el servidor deniega nuevas escrituras para la opción retirada. Se puede elegir otra opción permitida. Rehabilitar conserva los datos y continúa sin activar emisión o remisión fiscal.

La consulta está limitada a administradores de empresa con cuenta activa y módulo Ingresos. Operadores y usuarios de consulta no acceden al formulario ni al perfil. La administración global verificada puede revisar empresas y autorizar opciones; esa capacidad no permite suplantar al administrador de empresa para elegir su perfil.

La demo ofrece una vista previa informativa con datos ficticios y ninguna operación fiscal. Las preferencias de empresa se guardan solo en servidor, requieren conexión y no se incluyen en WebStorage, la copia offline ni las restauraciones de archivos del cliente. Un error de consulta se muestra como **Estado sin comprobar** y nunca se interpreta como una conexión operativa.

## Base de datos y permisos

Migración local creada mediante `supabase migration new`: **20261106100523_company_fiscal_options.sql**. Aplicada una vez en `truckcontrol-ai / kkkemaycedexymrpaqtp` como **20261106103606_company_fiscal_options**, con **58 entradas remotas**. El repositorio tenía 34 archivos SQL locales consolidados antes del cambio; se conservan sus hashes y las correspondencias de versiones existentes. No equiparar ese número a la cantidad de entradas remotas ni volver a aplicar el historial.

Dos tablas privadas, `tc_fiscal_policies` y `tc_fiscal_profiles`, con RLS y clave primaria/FK por organización. No se conceden INSERT, UPDATE o DELETE a clientes. La lectura directa autorizada también pasa por RLS. El RPC público `tc_company_fiscal_control` es invoker y solo ejecutable por `authenticated`; delega en un controlador privado definer necesario para enumeración global y escritura sin conceder DML. Cada rama comprueba el actor y su autorización antes de acceder a datos.

El administrador global procede de `private.tc_admins`; el administrador de empresa de propiedad o membresía activa. Ambos deben estar verificados y no bloqueados ni eliminados. El acceso no procede de metadatos editables del usuario. Para empresa se comprueban además licencia activa, permiso de gestión e Ingresos; el módulo no eleva Básico a Full ni altera precios, IVA, licencias o límites de camiones.

El servidor valida estrictamente los campos y tipos, limita el tamaño y rechaza claves, certificados, campos de emisión o parámetros desconocidos. Este formulario no contiene almacén de credenciales. Las futuras integraciones usarán sus propios mecanismos seguros y secretos por empresa, fuera del navegador.

Guardado con versión esperada, exclusión mutua por empresa para permisos/perfil e idempotencia: una repetición confirmada no duplica versión o auditoría. Los cambios obsoletos fallan sin sobrescribir. La lista global utiliza páginas de 50, cursor y orden estable; la interfaz indica empresas por página. Los resultados se validan por empresa y se descartan al cambiar de sesión, empresa, conectividad o desmontar la vista; las mutaciones solo muestran confirmación cuando el servidor devuelve los valores solicitados.

Los cambios quedan registrados en la auditoría privada de la plataforma, sin secretos. Deshabilitar no elimina los perfiles. Para volver a una interfaz anterior se conserva la versión web estable; no se deben borrar tablas, perfiles o auditoría como procedimiento de recuperación.

## Verificación de esta fase

659 pruebas unitarias/SQL y 96 recorridos SaaS pasan localmente, con las 64 pruebas iniciales intactas en sus once hashes. El ensayo nativo con empresas ficticias comprueba autorización global, elección por empresa, administrador delegado, denegación a operadores, aislamiento RPC/RLS, ausencia de DML directo, rechazo de campos de emisión, idempotencia, conflictos y retirada de permisos. Termina con rollback: cero usuarios/empresas de prueba y cero perfiles/políticas activados en clientes reales. Los planes y ajustes se comprueban intactos dentro del ensayo. Tres comprobaciones HTTPS rechazan llamadas anónimas y sesiones falsas a la API nueva.

Las capturas y Axe comprueban ambos temas en Android/Windows emulados. Una primera pasada completa detectó una incompatibilidad con esquemas Auth reducidos de pruebas antiguas: se corrige la lectura de los campos opcionales dentro de la migración nueva antes de aplicarla. Las pruebas originales no se modifican. Asesor de seguridad: no hay hallazgos nuevos; conserva el aviso previo de protección contra contraseñas filtradas, que requiere un plan superior no contratado.

La migración se generó con CLI 3.0.0, usando su directorio documentado `SUPABASE_HOME` dentro del espacio de trabajo para resolver un directorio de usuario de solo lectura. No se modifica HOME, el proyecto enlazado, el config existente ni credenciales; no se utiliza `db push` o una operación CLI sobre un proyecto alojado. Las operaciones nativas seleccionan exclusivamente el proyecto de TruckControl. [Evidencia](verification/company-fiscal-options-20261106.json).

## Publicación y recuperación

Disponible en https://truckcontrolai.com, versión alojada 30 / 0.5.18-rc.1, fuente `6a1e8f4dab2db4fc2b24e79b1141c6473d95169b`. Código y fuente exacta pasan 941 controles por ejecución, con 75 hashes HTTPS coincidentes y demo6 conservada. Las pruebas previas comprobaron la publicación29; la aceptación pública de esta entrega se registra en los [checks de PR34](https://github.com/smartscaneuskadi/TruckControl-AI/pull/34/checks), que exigen la vista previa fiscal en seis perfiles Android/Windows y temas. Version29 y su fuente permanecen disponibles para recuperación, sin borrar la migración, perfiles o auditoría.

## Para habilitar emisión real en una fase posterior

Conectar un proveedor compatible y autorizado para el régimen elegido, comprobar identidad/representación, certificados o declaraciones aplicables y sus requisitos territoriales. Verificar en su entorno de prueba firma, numeración, registro, entrega, rectificaciones, errores/reintentos y aislamiento entre empresas antes de abrir producción. No activar un proveedor de coste variable sin presupuesto aprobado. La empresa debe autorizar su propia conexión; las credenciales nunca se piden en el chat ni en estos campos de preferencias.

La futura habilitación de emisión exige un flujo de backend adicional verificado. No sustituir `emission_available=false` por un checkbox de interfaz ni reutilizar el flag de facturación de suscripciones para emitir documentos de clientes.

Fuentes oficiales consultadas el 06/11/2026: [certificados y software garante TicketBAI](https://www.euskadi.eus/certificados-ticketbai/web01-sede/es/), [AEAT: ámbito de aplicación y regímenes forales/SII](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/preguntas-frecuentes/cuestiones-generales-ambitos-aplicacion.html), [AEAT: modalidades y declaración responsable](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/preguntas-frecuentes/certificacion-sistemas-informaticos-declaracion-responsable.html) y [formato Facturae](https://www.facturae.gob.es/formato).
