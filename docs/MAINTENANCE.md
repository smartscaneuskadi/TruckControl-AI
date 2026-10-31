# Mantenimiento, publicación y recuperación

## Recursos autorizados

GitHub oficial: `smartscaneuskadi/TruckControl-AI`. Supabase único: `kkkemaycedexymrpaqtp`. Sites: `appgprj_6adfbdfa388481919121d43f0fd9c242`, con dominio público indicado en README. No sustituir estos identificadores por los de FIXPilot o el prototipo pausado.

Mantener el historial Git, la rama de trabajo y copias recuperables antes de publicar. El archivo Git bundle permite recuperar commits y ramas; un ZIP de fuentes permite inspección sin servicios. No incluir `.env`, `node_modules`, credenciales, directorios de sesión ni archivos empresariales en esos archivos. Las versiones Sites permiten volver a una versión estable sin borrar el código nuevo.

## Procedimiento de entrega

1. Comprobar estado del checkout y HEAD remoto, conservar cambios de terceros y crear un commit claro.
2. Pasar `npm run check`, las pruebas de navegador afectadas, escaneo de secretos y revisión de permisos. El CI completo debe quedar correcto antes de integrar en principal.
3. Construir desde el commit exacto, con claves comerciales vacías para la demo y sin proveedores activos. El portal se activa con `VITE_COMMERCIAL_MODE=true`; el botón de demo abre datos ficticios. `VITE_BASE_PATH=/` para Sites.
4. Subir el mismo commit al repositorio GitHub y al origen de Sites. Empaquetar `.openai/hosting.json` y `dist/` en TAR sin claves ni fuentes privadas. Guardar una versión con ese SHA y ese artefacto.
5. Publicar la versión guardada conservando su audiencia pública. Verificar estado final, HTTPS, carga, manifiesto, recursos, navegación móvil, service worker y recarga offline. Conservar la versión estable anterior hasta comprobarlo.

La configuración automática de GitHub Pages y protección de ramas está bloqueada por permisos administrativos de la integración. No forzar referencias ni eludir esa restricción. Actions puede ejecutar el CI existente; configurar despliegue automático requiere un mecanismo autorizado con credenciales de alojamiento limitadas y almacenadas como secretos, nunca en YAML.

## Base de datos

El manifiesto `deployment/remote-migrations-20261031.json` contiene versiones realmente aplicadas; `recovered-migrations.json` registra SQL recuperado y hashes. Los lotes históricos remotos difieren de los archivos iniciales. **No ejecutar db push, reparar historial o repetir migraciones sin conciliación previa.** Una base nueva se prueba aplicando los archivos fuente en orden; una base existente solo recibe migraciones nuevas inspeccionadas y probadas.

Crear archivos nuevos con `supabase migration new`. Aplicar cambios de esquema mediante migraciones transaccionales en el proyecto confirmado, sin borrar datos. Tras aplicar, registrar la versión remota real, verificar RLS, permisos y asesores. Para pruebas remotas usar datos sintéticos y rollback; no llamar a proveedores ni dejar usuarios de prueba.

Las copias Git/Sites protegen código, no sustituyen una copia de PostgreSQL y Storage. No se ha contratado PITR ni copias de pago. Antes de abrir clientes reales debe acordarse retención, exportación cifrada de base y archivos a un destino autorizado, y probar restauración en una instancia aislada. No extraer secretos ni trasladar datos a otro proyecto sin autorización. La demo no contiene datos reales; actualmente no hay datos empresariales que restaurar.

## Incidentes

Si falla una entrega web, volver a la última versión Sites verificada y conservar el commit y los logs de la versión fallida. Si falla una migración, detener el despliegue dependiente y corregir mediante una migración adicional revisada; no resetear la base ni borrar el historial. Si se revoca una cuenta, bloquearla en el servidor y revisar sesiones; las copias offline previamente autorizadas pueden seguir siendo legibles hasta su caducidad sin conexión.

No registrar tokens, cuerpos de documentos ni datos personales en logs. Los errores de usuario deben ser genéricos. Las credenciales expuestas se rotan por el mecanismo oficial del proveedor. Conservar `docs/PROGRESS.md` actualizado con commit, recursos, pruebas y bloqueos para reanudar sin rehacer trabajo.
