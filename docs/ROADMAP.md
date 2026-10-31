# Estado y continuación

## Implementado y comprobado

Base React/TypeScript y PWA, diseño oscuro profesional, panel y fichas de 50 camiones ficticios, conductores, finanzas, rentabilidad, remolques, clientes, viajes, mantenimiento, combustible, documentación, vencimientos, alertas, exportaciones e informes. Contabilización de operaciones con confirmación humana y sin duplicados. Biblioteca de prueba funcional sin transmitir archivos.

Código SaaS: registro, prueba de 30 días, plan inicial de ejemplo de 10 €/mes, administrador global, roles y equipo por empresa, RLS, archivos privados, versiones concurrentes y restricciones de módulos. Supabase independiente operativo; no se toca FIXPilot. Las comprobaciones reales de aislamiento se ejecutan con datos sintéticos y rollback.

Offline: copia comercial cifrada opcional y cola de operaciones, límites temporales, bloqueo por inactividad, conflictos conservados y revalidación antes de sincronizar. Los documentos privados y apuntes contables no se editan offline.

## Apertura comercial pendiente de proveedores

Configurar SMTP, URL y redirecciones de Auth y comprobar correo real y cuenta administradora. Configurar y verificar Google OAuth por empresa, con revisión de Google cuando corresponda. Ejecutar aceptación con cuentas autorizadas en dos dispositivos físicos y recuperación de una copia en un destino de prueba autorizado. No abrir el registro real antes de estas comprobaciones.

SMS y modelos IA son opcionales: necesitan credenciales, política de datos, pruebas y autorización de costes. La facturación recurrente requiere terminar el contrato de renovación, pasarela y pruebas de cobro; los pagos siguen apagados.

## Operación continua

El CI comprueba código y navegadores en GitHub. La conexión permite escribir y gestionar PR; la administración de Pages y protección de ramas sigue denegada por permisos de integración. Se conserva Sites como alojamiento público y sus versiones para recuperación. No se habilita alojamiento de pago.

Las alertas son visibles dentro de la aplicación; el envío automático por correo/SMS/push requiere proveedor y programación autorizados. Los bots remotos amplían las reglas locales, no se anuncian como activos sin proveedor. No hay instaladores nativos ni publicación en tiendas; la distribución actual es PWA por HTTPS.
