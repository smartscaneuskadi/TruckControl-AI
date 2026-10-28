# TruckControl AI

Aplicación de gestión inteligente de flotas. **Fase 1: React + TypeScript, 50 camiones de demostración y arquitectura ampliable con Supabase.**

La ampliación SaaS está preparada localmente: planes antes del registro, datos de empresa, verificación de correo/SMS, prueba Full de diez días y administración de clientes, módulos e IA por usuario. Se conservan las **140 pruebas aprobadas**, incluidas las 105 anteriores y las 64 originales.

**Estado actual:** el último destino solicitado es un proyecto nuevo `truckcontrol-ai` en `fixpilot-dev`. Todavía no está creado. La configuración autorizada anteriormente en `merymery_16` se conserva como prototipo separado de FIXPilot. Esta entrega permite revisar el portal comercial sin conectarlo al prototipo; el registro real sigue pendiente del proyecto independiente. La aplicación de una migración adicional de índices quedó bloqueada por el límite de uso de la revisión automática. Véase [administración y estado de activación](docs/SAAS_ADMIN.md).

## Probar la aplicación

La demostración se publica de forma privada en [TruckControl AI](https://truckcontrol-ai-fase-1.earlymug513.chatgpt.site). Abre el enlace con la cuenta propietaria de Sites; no necesitas terminal, instalación de dependencias ni una cuenta de Supabase.

1. Explora **Resumen general** y cambia el periodo o pulsa una columna del gráfico.
2. En **Camiones**, abre una matrícula para consultar su ficha, conductor, ITV y resultado económico.
3. Crea un **ingreso de 500,25 €** y un **gasto de 100,10 €** para el mismo vehículo y mes.
4. En **Rentabilidad**, busca esa matrícula: su beneficio aumenta **400,15 €**.
5. Recarga: los cambios se conservan en ese navegador. **Configuración → Restablecer demostración** recupera los datos iniciales.

La opción **Guía de la demo** dentro de la aplicación recuerda estos pasos.

También puedes abrir **Facturas Gmail → Revisar factura**, seleccionar un camión y confirmar el ejemplo ficticio. Añade un gasto local de 100 € sin IVA; no lee correo ni utiliza IA. Recargar no duplica ese gasto.

## Empresas y Gmail — estado actual

Se ha incorporado el código de autenticación, gestión de varias empresas por propietario, repositorio Supabase por entidad, documentos privados y conexión Gmail OAuth independiente por empresa. La demo sigue separada y conserva sus datos anteriores.

**La activación real está bloqueada:** Supabase rechazó crear el nuevo proyecto `truckcontrol-ai` en `fixpilot-dev` porque la cuenta ya tiene dos proyectos gratuitos activos. No se ha tocado FIXPilot, contratado un servicio ni activado consumo. El acceso de empresas publicado muestra este estado; no permite un inicio de sesión ficticio.

El nuevo código y sus permisos se prueban con PostgreSQL embebido y servicios simulados. Falta desplegar y validar Auth, Storage y OAuth en el proyecto independiente, además de configurar la autorización de Google. La lectura IA está desactivada por defecto y requiere autorización de costes para activarse. No hay importación programada activa. Consulta [empresas y Gmail](docs/COMPANIES_GMAIL.md).

## Funciones incluidas

- Panel financiero, evolución de seis meses y disponibilidad actual de la flota.
- Diseño en verde oscuro, azul marino y negro, con reloj de Madrid, indicador de disponibilidad y cuentakilómetros acumulado según los vehículos seleccionados.
- 50 camiones, 46 conductores y 2.100 movimientos ficticios iniciales. Se pueden añadir más vehículos; 50 no es un límite artificial.
- Alta, edición y eliminación de fichas, con protección del historial económico y de las asignaciones.
- Ingresos y gastos por vehículo, categoría, fecha y estado de cobro o pago.
- Beneficio, margen y coste por kilómetro, por vehículo y periodo.
- Búsqueda global, filtros, paginación, avisos de ITV y permisos, exportaciones CSV y copia JSON.
- PWA adaptable a Windows y Android; uso sin conexión después de la primera carga.
- Repositorio local de demo y adaptador remoto de Supabase con consultas paginadas y control de ediciones simultáneas.
- Migraciones SQL con RLS, aislamiento por empresa, documentos privados y aprobaciones de factura sin duplicados.
- Pantallas de documentos y facturas, con un ejemplo ficticio revisable.

## Windows y Android

En **Configuración → Instalar aplicación** se muestra el diálogo del navegador cuando está disponible, o las instrucciones de instalación. En Windows usa Edge o Chrome; en Android usa Chrome y su opción «Añadir a pantalla de inicio / Instalar».

Esta entrega es una **PWA**, no un instalador `.exe` o `.apk`. La demo publicada guarda sus datos localmente: **la sincronización de empresas espera al proyecto independiente**. Las políticas del navegador y del alojamiento privado pueden afectar a la disponibilidad del botón de instalación.

## Criterio económico

Todos los importes se guardan en **céntimos enteros de EUR** y se introducen **sin IVA**. Beneficio = ingresos − gastos. Margen = beneficio / ingresos × 100. Coste por km = gastos / km registrados en los servicios de ingreso.

Los movimientos cuentan por **fecha de devengo**, incluidos los pendientes de pago o cobro. Sin ingresos o kilómetros se muestra «—». No se calculan amortizaciones automáticas ni impuestos; registra los costes que quieras incluir. El cuentakilómetros de la ficha es informativo y no sustituye a los km de servicio.

## Datos y alcance

Solo se usan datos ficticios. Los correos iniciales pertenecen a `example.com`. No hay envío de datos a modelos IA ni solicitudes a Supabase durante la demo. El copiloto utiliza reglas locales explicables, no un LLM.

Las cuatro primeras migraciones están aplicadas al prototipo autorizado de merymery_16; una migración adicional de índices está validada localmente y pendiente de aplicación. El destino nuevo sigue pendiente. Antes de activar clientes reales se necesitan sus credenciales propias, ajustes de Auth y los proveedores autorizados de SMS, Google, pagos e IA. Los roles de empleados e invitaciones son trabajo posterior.

La copia JSON es descargable; su importación no forma parte de la Fase 1. No utilices el almacenamiento de demostración para datos empresariales reales. No incluye cifrado, auditoría contable ni copias automáticas de servidor.

## Desarrollo y comprobaciones

Para otros desarrolladores: Node.js 24 LTS recomendado; mínimo 22.12. Versiones exactas en `package.json` y `package-lock.json`.

```sh
npm ci
npm run dev
```

```sh
npm run check                   # TypeScript, pruebas de dominio/SQL y build PWA
npx playwright install chromium # Solo para preparar un entorno de pruebas nuevo
npm run test:e2e                # Escenarios de escritorio y móvil
npm run test:e2e:companies      # Cuentas/empresas con servicios simulados; build aislado
npm run test:e2e:saas           # Portal, registro, SMS simulado, planes y administración
```

El CI está configurado para ejecutar estas comprobaciones cuando el repositorio sea accesible. La demo no necesita `.env`. `.env.example` reserva únicamente URL y clave publicable del proyecto TruckControl; nunca claves secretas en el cliente. El modelo de servidores y los bloqueos de activación están en [empresas y Gmail](docs/COMPANIES_GMAIL.md).

Documentación: [arquitectura](docs/ARCHITECTURE.md), [verificación](docs/TESTING.md) y [próximas fases](docs/ROADMAP.md).
