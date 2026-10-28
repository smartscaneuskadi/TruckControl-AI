# TruckControl AI

Aplicación de gestión inteligente de flotas. **Fase 1: React + TypeScript, 50 camiones de demostración y arquitectura ampliable con Supabase.**

## Probar la aplicación

La demostración se publica de forma privada en [TruckControl AI](https://truckcontrol-ai-fase-1.earlymug513.chatgpt.site). Abre el enlace con la cuenta propietaria de Sites; no necesitas terminal, instalación de dependencias ni una cuenta de Supabase.

1. Explora **Resumen general** y cambia el periodo o pulsa una columna del gráfico.
2. En **Camiones**, abre una matrícula para consultar su ficha, conductor, ITV y resultado económico.
3. Crea un **ingreso de 500,25 €** y un **gasto de 100,10 €** para el mismo vehículo y mes.
4. En **Rentabilidad**, busca esa matrícula: su beneficio aumenta **400,15 €**.
5. Recarga: los cambios se conservan en ese navegador. **Configuración → Restablecer demostración** recupera los datos iniciales.

La opción **Guía de la demo** dentro de la aplicación recuerda estos pasos.

## Funciones incluidas

- Panel financiero, evolución de seis meses y disponibilidad actual de la flota.
- Diseño en verde oscuro, azul marino y negro, con reloj de Madrid, indicador de disponibilidad y cuentakilómetros acumulado según los vehículos seleccionados.
- 50 camiones, 46 conductores y 2.100 movimientos ficticios iniciales. Se pueden añadir más vehículos; 50 no es un límite artificial.
- Alta, edición y eliminación de fichas, con protección del historial económico y de las asignaciones.
- Ingresos y gastos por vehículo, categoría, fecha y estado de cobro o pago.
- Beneficio, margen y coste por kilómetro, por vehículo y periodo.
- Búsqueda global, filtros, paginación, avisos de ITV y permisos, exportaciones CSV y copia JSON.
- PWA adaptable a Windows y Android; uso sin conexión después de la primera carga.
- Contratos de repositorio y análisis para incorporar Supabase y futuros bots.
- Migración SQL con RLS y pruebas de aislamiento entre organizaciones.

## Windows y Android

En **Configuración → Instalar aplicación** se muestra el diálogo del navegador cuando está disponible, o las instrucciones de instalación. En Windows usa Edge o Chrome; en Android usa Chrome y su opción «Añadir a pantalla de inicio / Instalar».

Esta entrega es una **PWA**, no un instalador `.exe` o `.apk`. El almacenamiento es local: **no hay sincronización entre dispositivos**. Las políticas del navegador y del alojamiento privado pueden afectar a la disponibilidad del botón de instalación.

## Criterio económico

Todos los importes se guardan en **céntimos enteros de EUR** y se introducen **sin IVA**. Beneficio = ingresos − gastos. Margen = beneficio / ingresos × 100. Coste por km = gastos / km registrados en los servicios de ingreso.

Los movimientos cuentan por **fecha de devengo**, incluidos los pendientes de pago o cobro. Sin ingresos o kilómetros se muestra «—». No se calculan amortizaciones automáticas ni impuestos; registra los costes que quieras incluir. El cuentakilómetros de la ficha es informativo y no sustituye a los km de servicio.

## Datos y alcance

Solo se usan datos ficticios. Los correos iniciales pertenecen a `example.com`. No hay envío de datos a modelos IA ni solicitudes a Supabase durante la demo. El copiloto utiliza reglas locales explicables, no un LLM.

La migración de Supabase es una base validada, **no se ha aplicado a ningún proyecto remoto**. Añadir variables al entorno no activa la sincronización: todavía faltan el adaptador remoto, la autenticación y los roles de equipo.

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
```

El CI realiza la preparación y todas estas comprobaciones automáticamente. La aplicación no necesita `.env` para ejecutarse. `.env.example` reserva únicamente la URL y la clave publicable de la futura integración Supabase; nunca se usan claves secretas en el cliente.

Documentación: [arquitectura](docs/ARCHITECTURE.md), [verificación](docs/TESTING.md) y [próximas fases](docs/ROADMAP.md).
