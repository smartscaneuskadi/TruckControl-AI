# Ensayo PostgreSQL aislado

El workflow `isolated-postgres.yml` usa PostgreSQL oficial 17.6 en Ubuntu 24.04, con digest inmutable y sin puertos publicados ni credenciales de proveedores. Aplica las migraciones del repositorio sin modificarlas. El modelo Auth/Storage es sintético y la extensión de red/servicio gestionado no se instala.

Comprueba rollback transaccional de la candidata 63, RLS entre empresas, lecturas en transacciones de solo lectura, SID ausente/ajeno/revocado, permisos de actores de procesos internos, CAS fiscal con dos conexiones PostgreSQL que compiten realmente por un bloqueo, entregas concurrentes de una mensualidad, renovación independiente, replay y rollback integral ante fallo del aviso.

Genera un `pg_dump` lógico de las filas sintéticas, lo restaura con `pg_restore` en otra base del mismo clúster efímero y compara todas las filas, funciones, ACL y políticas RLS. Después verifica que se conservan el acceso del actor vigente y la revocación del actor dado de baja. La migración 62 conserva su hash inmutable; pagos reales, canales live, documentos y avisos siguen apagados.

El artefacto `isolated-postgres-report` contiene el informe y la copia **exclusivamente sintética** durante siete días. No prueba recuperación gestionada de Supabase, PITR, GoTrue completo, firma de JWT en HTTP, originales binarios de Storage, ni aceptación real de Stripe/TicketBAI. Los roles ya existen en el clúster de destino: no se afirma un ensayo de recuperación de roles entre clústeres.

Estado: implementación candidata. Sólo se considerará superado cuando el workflow del head exacto termine en SUCCESS; los resultados se registran en `report.json`.
