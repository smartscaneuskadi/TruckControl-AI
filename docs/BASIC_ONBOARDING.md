# Alta de clientes con Básico

Las nuevas altas solicitan acceso con contacto, empresa, NIF/CIF, dirección, teléfono y correo. Deben aceptar la privacidad y las condiciones vigentes. Al confirmar el correo y elegir su contraseña, el servidor crea automáticamente su cuenta y empresa con **Básico durante diez días**. SMS solo se exige si el proveedor está configurado.

La entrada pública muestra **Pedir acceso Básico**. Elegir Full como plan de interés no lo desbloquea ni inicia cobros. La cuenta muestra su plan y los días restantes; después de vencer la prueba conserva sus datos y puede solicitar continuación. Precios y límites comerciales se mantienen: Básico 300 €/mes + IVA 21 %, Full 700 €/mes + IVA 21 %, capacidad inicial de 50 camiones.

## Permisos

- La licencia efectiva se calcula en PostgreSQL tanto para el cliente como para cada empresa y sus miembros. El navegador no decide qué módulos se desbloquean.
- `trial_plan_id` conserva Full para los períodos concedidos antes del cambio; nuevas filas y altas verificadas reciben limited/Básico. No se modifican fechas, pagos, suspensiones ni ajustes anteriores.
- Los permisos de Básico siguen la configuración de ese plan y las excepciones autorizadas por la administración. Los metadatos editables del usuario no conceden Full, períodos de prueba nuevos, administración ni permisos IA.
- Pedir Full solo crea una solicitud; el cambio requiere una activación autorizada. La prueba Básico permite aplicar un plan activado posteriormente sin esperar a que termine.
- La verificación nativa del correo y el recibo legal inmutable son necesarios antes de crear la empresa. Los textos nuevos tienen versión 2026-11-02; las aceptaciones anteriores no se reescriben. Una solicitud antigua sin el consentimiento vigente debe completar ese paso.
- Los enlaces de confirmación también se reconocen al abrirse en una PWA ya abierta; se retiran del historial y solo se consumen después de pulsar **Confirmar y continuar**.

## Verificación y recuperación

Doce pruebas SQL nuevas comprueban la conservación de Full anterior, Básico tras confirmar correo, identidad y consentimiento, manipulación de perfil, solicitud Full, miembros, aislamiento, límite comercial, caducidad e idempotencia. El recorrido de navegador cubre petición → correo → contraseña → cuenta Básico → solicitud Full sin ampliación en Android/Windows emulados.

La migración se añade al historial sin editar las 51 anteriores. Antes de publicarla se guardan una copia Git y las huellas de los clientes existentes. Las comprobaciones remotas usan identidades ficticias y rollback. La demo estable queda separada.

Para recuperar una incidencia de interfaz se conserva la versión publicada anterior. No restablecer el aprovisionamiento antiguo de Full después del cambio de política: podría conceder acceso indebido a nuevas altas. Las nuevas licencias y recibos deben conservarse durante cualquier reparación.
