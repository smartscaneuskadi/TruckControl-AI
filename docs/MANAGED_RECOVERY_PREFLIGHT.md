# Release 1.0 — verificación previa de recuperación del servicio gestionado

**Estado: preparación offline, NO recuperación integral acreditada.** Este trabajo
no modifica Supabase, Sites, Google, pagos, empresas, migraciones o la producción
v32. Las copias cifradas de empresa y los tests PGlite existentes siguen siendo
una **recuperación lógica parcial**, no un backup de toda la infraestructura.

## Herramienta añadida

`scripts/managed_recovery_preflight.py` comprueba localmente un expediente de
**ensayo en proyecto aislado con datos sintéticos**:

- cuatro inventarios distintos: PostgreSQL, bytes de Storage, funciones
  Edge y configuración **sin secretos**;
- hashes SHA-256 de esos cuatro artefactos y de siete informes de prueba:
  acceso Auth, RLS entre empresas, Storage privado, funciones, ventas
  desactivadas, correo saliente desactivado y consistencia de datos;
- origen esperado `kkkemaycedexymrpaqtp`, destino diferente marcado como
  `isolated_test`, timestamps con zona horaria y duración observada;
- rechazo de rutas que salen del directorio, artefactos incompletos,
  alterados, enlaces simbólicos internos o externos (también en el manifiesto),
  enlaces físicos/hardlinks a un mismo inode o archivo ajeno al directorio,
  o reutilización de un mismo archivo como prueba de varios controles;
  también rechaza checks
  falsos, campos de credenciales y ensayos que declaran usar datos reales;
- claves JSON duplicadas (incluidas las anidadas), aunque los valores sean
  idénticos, y propiedades no declaradas en el esquema v1 del manifiesto,
  de cada artefacto o de cada comprobación. El lector de JSON habitual
  podría aceptar silenciosamente la última clave duplicada, creando
  ambigüedad para la revisión humana. La ampliación del esquema exige
  una versión nueva y pruebas, no campos arbitrarios en expedientes.

La herramienta verifica las evidencias solo por rutas e inodes locales; tampoco
certifica la ausencia de montajes especiales ni la autoría del informe. Debe
ejecutarse en un directorio privado de evidencias controlado por el operador,
no en un árbol modificable por terceros durante la comprobación.

La herramienta no interpreta el contenido de los informes, no consulta el
proveedor ni verifica firmas de una autoridad independiente. Un resultado
`preflight_passed=true` **no acredita** restauración, RPO, RTO, continuidad
de negocio, retención, ni cumplimiento contractual. La salida siempre declara
`certified_managed_restore=false`.

## Formato del manifiesto privado

Guardar únicamente en un directorio privado temporal, **fuera del repositorio
y de artefactos públicos**, un `manifest.json` con el esquema siguiente.
Sustituir los valores de ejemplo por hashes reales y evidencia revisada:

```json
{
  "schema_version": 1,
  "source_project_ref": "kkkemaycedexymrpaqtp",
  "destination_project_ref": "REF-DEL-DESTINO-AISLADO",
  "destination_kind": "isolated_test",
  "synthetic_data_only": true,
  "backup_captured_at": "2026-11-07T09:00:00Z",
  "restore_started_at": "2026-11-07T09:10:00Z",
  "restore_completed_at": "2026-11-07T09:30:00Z",
  "artifacts": [
    {"kind":"postgresql","path":"artifacts/database.dump","sha256":"<64-hex>"},
    {"kind":"storage_objects","path":"artifacts/storage.tar","sha256":"<64-hex>"},
    {"kind":"edge_functions","path":"artifacts/functions.tar","sha256":"<64-hex>"},
    {"kind":"service_config","path":"artifacts/config-redacted.json","sha256":"<64-hex>"}
  ],
  "checks": {
    "auth_login":{"passed":true,"evidence_path":"evidence/auth.json","sha256":"<64-hex>"},
    "cross_tenant_rls":{"passed":true,"evidence_path":"evidence/rls.json","sha256":"<64-hex>"},
    "private_storage":{"passed":true,"evidence_path":"evidence/storage.json","sha256":"<64-hex>"},
    "edge_functions":{"passed":true,"evidence_path":"evidence/functions.json","sha256":"<64-hex>"},
    "sales_disabled":{"passed":true,"evidence_path":"evidence/sales.json","sha256":"<64-hex>"},
    "outbound_email_disabled":{"passed":true,"evidence_path":"evidence/mail.json","sha256":"<64-hex>"},
    "data_consistency":{"passed":true,"evidence_path":"evidence/data.json","sha256":"<64-hex>"}
  }
}
```

Ejecución local en el operador autorizado, **después** de restaurar en
destino aislado con datos ficticios y generar pruebas reales:

```sh
python3 scripts/managed_recovery_preflight.py \
  /ruta/privada/ensayo/manifest.json \
  --expect-source kkkemaycedexymrpaqtp
python3 -m unittest discover -s tests/python -p 'test_*.py'
```

El proceso solo lee archivos locales. No copia backups ni certificados,
no reconfigura la base de datos ni cambia el estado de facturación. La
tarea de CI incluye las pruebas con archivos sintéticos.

## Bloqueos exactos de la aceptación gestionada

1. **Extracción y restauración real de PostgreSQL/Storage**: requiere
   medios oficiales de exportación, almacenamiento privado y un proyecto
   aislado autorizado; no confundir exportación lógica de una empresa
   con instantánea integral de Auth, Storage y funciones.
2. **Secretos y configuración**: recuperar desde el gestor seguro
   designado por el operador. No introducir secretos en manifiestos,
   GitHub, logs, capturas ni backups públicos.
3. **Pruebas nativas del destino**: acceso real de identidad ficticia,
   rechazo cross-tenant, objetos privados, funciones y retención,
   servicios de cobro y correo desactivados, consistencia contable,
   capacidad de rollback y recuperación real desde el proveedor.
4. **Objetivos comerciales**: definir formalmente RPO/RTO y medirlos
   contra una incidencia simulada; la simple duración de restauración
   no es RTO y la fecha de captura no prueba RPO. Revisión de
   privacidad y protección de datos antes de trasladar información.

No crear un segundo Supabase de pago ni mover datos reales por esta
prueba sin autorización técnica y jurídica. Mantener v32, respaldo v31,
demo v6, 60 migraciones aplicadas, cuotas IA y bloqueo de ventas.
El trabajo se sigue en [Release 1.0, issue #3](https://github.com/smartscaneuskadi/TruckControl-AI/issues/3).
