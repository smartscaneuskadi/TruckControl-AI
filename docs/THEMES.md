# Fleet Light y Fleet Cockpit

En **Configuración → Apariencia** se elige Fleet Light, Fleet Cockpit o seguir la configuración del dispositivo. La tarjeta permite ver el estilo antes de pulsar **Aplicar apariencia**. El botón de sol/luna de la cabecera y de los formularios abre el mismo selector. Aplicar no navega, recarga ni reinicia el formulario abierto.

Fleet Light combina superficies blancas y azul claro con verde y dorado. Fleet Cockpit utiliza azul marino, verde bosque y paneles luminosos. Ambos comparten los mismos componentes, registros, cálculos y permisos. Los tokens están en `src/styles/themes.css`; `theme-entry.css` ordena las capas de las hojas existentes y evita duplicar pantallas.

## Preferencia por usuario

La demo guarda únicamente la preferencia en el navegador. No identifica al visitante ni sincroniza su apariencia con otros dispositivos.

Con Supabase configurado y una sesión autenticada, `AppearanceProvider` guarda exclusivamente `truckcontrol_appearance: {theme, motion}` mediante `auth.updateUser`. Verifica el usuario con `auth.getUser` antes de escribir. No envía identificadores de otra cuenta ni modifica correo, contraseña, roles, planes, contabilidad o registros de empresa. Los metadatos cosméticos no conceden permisos.

La caché utiliza una clave por usuario, separada de la demo. Una elección sin red queda pendiente para esa misma cuenta y se revalida al reconectar. Cambiar de cuenta descarta los guardados en cola que hayan quedado obsoletos. Una sesión nueva lee la preferencia del perfil; volver a enfocar la aplicación o recuperar conexión refresca el perfil. No se promete sincronización instantánea en segundo plano de un dispositivo dormido.

Los ensayos de dos cuentas, dos contextos de navegador y guardado sin red usan respuestas de Auth simuladas y comprueban el contenido de las peticiones. La candidata no incluye credenciales Supabase ni abre registro real. La aceptación con cuentas reales de dos empresas sigue sujeta a los controles de lanzamiento.

## Movimiento y accesibilidad

Se puede seguir el dispositivo, reducir animaciones o desactivarlas. La preferencia de movimiento reducido del sistema siempre tiene prioridad. El cambio de color es inmediato; las transiciones de paneles y gráficos se desactivan cuando corresponde. Los diálogos tienen identificadores propios para conservar correctamente el formulario al abrir el selector encima de él.

Las pruebas de interfaz recorren las 19 pantallas en ambos temas, en perfiles Android y Windows, con Axe WCAG AA y control de desbordamiento. Las emulaciones no equivalen a pruebas en dispositivos físicos.

## Indicadores y privacidad del mapa

Los indicadores económicos, odómetros, estados, repostajes y recorridos leen los registros ya autorizados de la aplicación. La demo mantiene su etiqueta de datos ficticios. El reloj muestra la hora actual de Madrid. No se inventan velocidades ni niveles de depósito.

El objetivo mensual empieza sin una cifra inventada. Cada usuario puede definir una referencia personal para su empresa y mes; se compara con el beneficio registrado y no crea asientos. Este objetivo se conserva en ese dispositivo, con clave por cuenta, empresa y período; es independiente de la preferencia de tema sincronizada.

El mapa interactivo de OpenStreetMap se carga solo al pulsar su botón. Antes no se contacta con ese proveedor. El iframe recibe únicamente el área pública de España: no recibe matrículas, usuarios, direcciones de clientes ni viajes. No hay marcadores de flota ni geolocalización del usuario. La pantalla advierte que no existe una fuente GPS conectada y que la cartografía necesita red. La atribución forma parte del mapa del proveedor.

La PWA incluye localmente temas, fotografías y logotipos. El cambio de apariencia sigue disponible sin red. La cartografía externa no se presenta como disponible offline. El funcionamiento de las colas de datos empresariales y sus revalidaciones existentes no cambia.

## Recuperación

Los cambios se publican únicamente en la candidata de `candidate-hosting.json`. La demo estable v6 y las versiones anteriores de la candidata se conservan. Para volver atrás se despliega la versión guardada anterior del mismo proyecto; no se cambia audiencia, DNS ni base de datos. Un despliegue nuevo no borra la demo local ni aplica automáticamente una actualización con trabajo pendiente.
