# Próximas fases

## Fase 1 · Base funcional

React + TypeScript, PWA, flota inicial de 50 camiones ficticios, conductores, control económico, rentabilidad, almacenamiento local y reglas de análisis. Migración de Supabase y contratos listos para ampliar. Sin información empresarial real.

## Fase 2 · Datos compartidos

Implementados en código: Supabase Auth, empresas propias, repositorio remoto por entidad, documentos privados, control de versiones y Gmail OAuth por empresa. La activación espera al proyecto independiente `truckcontrol-ai`: la cuota gratuita ha bloqueado su creación. FIXPilot permanece intacto.

Pendiente: validar Auth, Storage, asesores y RLS en el nuevo proyecto real; configurar Google OAuth y su consentimiento; miembros y roles de equipo, auditoría y copias de seguridad. Los trabajos programados y la IA de pago requieren autorización antes de activarse. Véase [empresas y Gmail](COMPANIES_GMAIL.md).

## Fase 3 · Operaciones

Viajes y órdenes de transporte, documentos y vencimientos, mantenimiento planificado, importación revisable, presupuestos, indicadores de consumo y costes por ruta. Tratamiento explícito de impuestos, amortizaciones y asignación de costes generales.

## Fase 4 · IA asistida

Bots de análisis financiero, detección de anomalías y recomendaciones de mantenimiento mediante proveedores independientes y Edge Functions. Evaluación de calidad, observabilidad y aprobación de escrituras. No usar credenciales privilegiadas en aplicaciones cliente.

## Distribución nativa, si se requiere

Mantener la PWA para Windows y Android. Añadir Tauri para Windows y Capacitor para Android si hacen falta instaladores, tiendas o funciones del dispositivo; incluir firma, permisos, actualización y pruebas en equipos físicos.
