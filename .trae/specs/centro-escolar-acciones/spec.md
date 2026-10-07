# Especificación — Centro Escolar con Acciones Directas (Asistente, Directora, Encargada)

## 1. Problema

Actualmente, la sección **Centro Escolar** (módulo `SchoolCenterModule`) existe **solo en el Panel de la Directora** y opera en **modo solo lectura**: muestra KPIs, alertas, estados de aulas y un drill-down por aula, pero **no permite ejecutar acciones operativas dentro de la misma pantalla**. El personal (Asistente, Directora y Encargada de Dirección) debe abandonar el Centro Escolar y navegar a secciones independientes (`chat`, `muro`, `rutina/eventos`) cada vez que necesita:

1. Responder un mensaje pendiente de un padre de familia.
2. Publicar una actividad, anuncio o foto en el muro de un aula.
3. Registrar o agendar un evento escolar (cualquier tipo, para cualquier aula).

El **Panel Asistente** y el **Panel Control (Encargada de Dirección)** ni siquiera incluyen la sección "Centro Escolar", por lo que estos roles no disponen de la vista unificada en absoluto.

Resultado: flujo fragmentado, pérdida de contexto, y demoras operativas en roles de gestión que concentran decisiones rápidas durante la jornada escolar.

---

## 2. Usuarios y Objetivos

| Usuario | Rol | Objetivo dentro del Centro Escolar |
|---|---|---|
| **Directora** | Gestión general | Visión global + responder mensajes urgentes, publicar anuncios escolares, registrar eventos en cualquier aula **sin cambiar de pantalla**. |
| **Asistente de Dirección** | Operaciones / apoyo | Monitoreo del día, contestar mensajes de padres, publicar en el muro, crear eventos de aula. |
| **Encargada de Dirección (Control Center)** | Coordinación académica | Supervisar aulas, intervenir en comunicaciones, publicar actividades y programar eventos sin salir de la vista central. |

**Meta de producto:** Convertir el Centro Escolar en un **centro de mando operativo SPA** (no solo de monitoreo) para los 3 roles de gestión, donde el 80% de las acciones de comunicación y rutina diaria se resuelven dentro de la misma vista, sin navegación.

---

## 3. Alcance Funcional

### 3.1 Requisitos Funcionales (RF)

#### RF-1 — Centro Escolar disponible en los 3 paneles
- El módulo **SchoolCenterModule** (o su versión compartida) debe renderizarse en:
  - `panel_directora.html` (ya existe, se amplía)
  - `panel_asistente.html` (nueva sección `#centro-escolar` con `#kscRoot`)
  - `panel_control.html` (nueva sección `#centro-escolar` con `#kscRoot`)
- Cada panel debe integrar el módulo en su navegación (sidebar) con un botón/ítem "Centro Escolar", marcado con badge de alertas pendientes.
- El módulo debe detectar automáticamente el rol y adaptar colores temáticos:
  - Directora / Control → azul corporativo (`#0B63C7`)
  - Asistente → verde/teal (`#0d9488`)
  - Encargada → púrpura (`#8B5CF6`)

#### RF-2 — Ficha de Aula: Acciones Directas (Quick Actions Bar)
En la vista de **drill-down de aula** (tab `aula`), agregar una barra fija de **Acciones Rápidas** debajo del encabezado del aula con 3 botones:

| Botón | Icono | Acción |
|---|---|---|
| **Responder Mensajes** | `message-square-reply` | Abre modal inline con la lista de mensajes pendientes del aula + input de respuesta directa (sin navegar a `chat`). |
| **Publicar en Muro** | `megaphone` | Abre modal inline del composer (igual que `WallModule.openNewPostModal`) pero **pre-seteado con el aula actual** (no editable, solo confirmable). |
| **Agendar / Crear Evento** | `calendar-plus` | Abre modal inline para registrar un evento (de cualquier tipo del `EVENT_META`) en ESTA aula, con selector de fecha/hora y checkbox "aplicar a todos los estudiantes". |

Esta barra **no aparece** en la vista "Resumen" ni "Organización" general; solo cuando se entra a la ficha de un aula concreta.

#### RF-3 — Responder Mensajes desde la Ficha de Aula (dentro de Centro Escolar)
- **Trigger:** Botón "Responder Mensajes" de la barra de acciones o chip `N mensajes pendientes` del aula.
- **Modal / Panel lateral inline:**
  - Muestra la lista de mensajes **sin leer / pendientes** asociados al aula (padres de estudiantes del aula + mensajes dirigidos a la maestra del aula).
  - Cada entrada muestra: avatar, nombre del remitente, relación (padre de X estudiante), preview del mensaje, tiempo.
  - Clic en un mensaje → abre el hilo completo con historial y **textarea de respuesta** en la parte inferior.
  - Botón **"Responder"** envía el mensaje insertando en `messages` con sender = usuario actual y actualiza `is_read = true` inmediatamente.
  - Después de enviar: toast de confirmación + el mensaje desaparece de "pendientes" en vivo (SPA, sin recarga).
- **Compatibilidad:** Debe reutilizar la lógica de envío del `ChatModule` / `SharedChatModule` (misma tabla, mismo esquema, mismo sistema de push notifications).

#### RF-4 — Publicar en el Muro desde la Ficha de Aula
- **Trigger:** Botón "Publicar en Muro" de la barra de acciones.
- **Modal inline:**
  - `classroom_id` se **preselecciona y bloquea** al aula actual (visible como tag no editable).
  - Campos del composer: título (opcional), contenido (obligatorio), selector de imágenes/videos (mismo comportamiento que `WallModule`).
  - Checkbox "**Publicar también como anuncio general**" (solo visible para roles Directora/Encargada).
- Al **enviar:**
  - INSERT en tabla `posts` con `classroom_id = aula_actual`, `teacher_id = usuario_actual`.
  - Toast de éxito.
  - Actualización en tiempo real del feed de actividad del Centro Escolar (el post nuevo aparece inmediatamente en el feed de "Actividad de hoy" sin recargar toda la pantalla).
- Reutiliza `WallModule.createPost()` o su lógica de inserción.

#### RF-5 — Crear / Agendar Evento de Aula desde la Ficha
- **Trigger:** Botón "Agendar Evento" de la barra de acciones.
- **Modal inline con 2 tabs:**
  - **Tab 1 — Registrar Ahora:** Seleccionar tipo de evento del `EVENT_META` (desayuno, almuerzo, siesta, temperatura, medicamento, nota, foto, etc.). Aplica fecha y hora actuales automáticamente. Checkbox "Aplicar a todo el grupo" + checklist individual de estudiantes.
  - **Tab 2 — Agendar Futuro:** Mismo selector de tipo, más `input date` + `input time` personalizado. Permite programar el evento para otra fecha (se inserta con `event_date` futuro; el trigger de hora lo actualizará al llegar).
- Al **guardar:**
  - INSERT en `classroom_events` + `event_participants` (reutiliza lógica de `KarpusEvents.recordEvent()`).
  - Toast con opción "Deshacer" (mismo patrón de `KarpusEvents.showUndoButton`).
  - El evento aparece inmediatamente en "Eventos registrados hoy" del aula (si es hoy) o en el calendario del módulo (si es futuro).

#### RF-6 — Botones de Acción desde Alertas (Vista Resumen)
En la sección "Requiere atención" del tab Resumen:

- Cada **alerta de tipo "mensajes pendientes"** (`icon: message-square`) debe llevar un botón secundario **"Responder ahora"** que abre directamente el modal de responder mensajes **en el aula correspondiente** (incluso sin entrar a la ficha del aula antes).
- Cada **alerta de tipo "sin publicación hoy"** debe llevar un botón **"Publicar ahora"** que abre el composer directamente pre-cargado con ese aula.
- Cada **alerta de tipo "rutina incompleta"** debe llevar un botón **"Registrar evento"** que abre el modal de eventos de ese aula en el tab "Registrar Ahora".

#### RF-7 — Flujo SPA y Actualización en Tiempo Real
- **Ninguna acción puede recargar la página.** Todas las operaciones cierran el modal y refrescan solo las secciones del DOM afectadas.
- Después de cada acción:
  1. Actualizar badges numéricos del aula en la tabla de estado (mensajes pendientes, publicaciones hoy, rutina %).
  2. Actualizar semáforo global del Centro Escolar.
  3. Actualizar KPI global correspondiente (ej: si se responde un mensaje, decrementar KPI "Mensajes pendientes").
  4. Agregar evento al feed "Actividad de hoy" sin rebuild completo.
- Mantener suscripción Realtime de Supabase existente; si la hay, debe reflejar los cambios también.

---

### 3.2 Requisitos No Funcionales (RNF)

#### RNF-1 — Consistencia Visual SaaS Premium
- Bordes de **3px** en tarjetas modales, tablas y KPIs.
- **Radio mínimo 28px** en contenedores principales (barra de acciones, modales, paneles).
- Sombras `0 14px 36px rgba(15,23,42,0.08)` en modales y tarjetas.
- Jerarquía de colores consistente con cada panel (azul/verde/púrpura según RNF-4).
- Animaciones `fadeUp` escalonadas en modales y barras de acciones.

#### RNF-2 — Responsive
- En móvil: la barra de Quick Actions se convierte en fila de iconos apilados (2 filas).
- Modales ocupan 95% del ancho en <768px con scroll interno.
- Tabla de estado de aulas permanece scrolleable horizontalmente.

#### RNF-3 — Seguridad y RLS
- Todas las INSERTS/UPDATES deben pasar por Supabase SDK respetando RLS.
- **Ningún endpoint público abierto.** Si falla el SDK (401/403/42501), usar el fallback de `fetch()` directo a PostgREST con `apikey` + `Authorization: Bearer <anon_key>` (mismo patrón de `preinscripcion.html`).
- Validar que el usuario tenga **rol permitido** (directora, asistente, encargada, admin) antes de habilitar botones.
- Sanitizar todo input de texto con `Helpers.escapeHTML()` antes de renderizar (evitar XSS).

#### RNF-4 — Adaptabilidad por Rol
| Rol | Barra de acciones disponible | Acciones permitidas |
|---|---|---|
| Directora | ✅ Todas | Responder / Publicar / Eventos + checkbox "anuncio general" |
| Asistente | ✅ Todas | Responder / Publicar / Eventos (sin anuncio general) |
| Encargada (Control) | ✅ Todas | Responder / Publicar / Eventos + checkbox "anuncio general" |
| Maestra | ❌ (sin Centro Escolar) | Solo su propio módulo rutina |

#### RNF-5 — Rendimiento
- Tiempo de apertura de modal < 200ms (carga lazy de componentes si es necesario).
- No recalcular `_compute()` completo después de cada acción; actualizar solo los contenedores con IDs o data-attributes específicos.
- Implementar debounce de 200ms en búsquedas y cierre de modales.

---

## 4. Restricciones y Dependencias

### 4.1 Dependencias Existentes
- `js/shared/supabase.js` (Supabase SDK + fallback PostgREST).
- `js/shared/helpers.js` (`Helpers.escapeHTML`, `Helpers.toast`, `Helpers.delegate`).
- `js/shared/wall.js` (`WallModule.createPost`, composer, uploads).
- `js/directora/chat.module.js` / `js/shared/chat.js` (`SharedChatModule.sendMessage`).
- `js/directora/karpus-events.js` (`KarpusEvents.recordEvent`, evento types `EVENT_META`).
- `js/directora/school-center.module.js` (base existente — se amplía).
- `js/shared/constants.js` (aulas canónicas, deduplicación).
- `js/shared/modal.js` (`openGlobalModal`, `closeGlobalModal`).
- Iconos: `lucide.createIcons()`.
- CSS: `css/school-center.css`, `css/messenger-chat.css`, `css/wall-social.css`.

### 4.2 Restricciones Duras (de `project_memory`)
- **No usar `static` en objetos literales** (solo válido en clases ES6).
- Las `<img>` nunca deben tener `src` vacío; usar GIF transparente 1x1 Base64 si hace falta placeholder.
- Botones internos de retroceso usan `navigateTo('home')` / `go()` del módulo, nunca `window.history.back()`.
- SPA obligatorio: **ningún `window.location.reload()`** en el flujo normal.
- La contraseña temporal inicial sigue siendo `sonrisa123` (no hay cambios en auth).
- Tablas: usar RLS granular; políticas `FOR ALL` se evitan si se mezclan permisos INSERT/SELECT distintos.

---

## 5. Criterios de Aceptación (AC)

### Tipo `rule` (binario, observable)

| ID | Enunciado | Evidencia |
|---|---|---|
| **AC-01** | El ítem "Centro Escolar" aparece en el sidebar de `panel_asistente.html` y `panel_control.html`. | Captura de pantalla de cada sidebar con el ítem visible. |
| **AC-02** | Al hacer clic en "Centro Escolar" de Asistente/Control, se renderiza el shell `#kscRoot` con los 5 tabs (Resumen, Organización, Calendario, Monitoreo, Reportes). | Captura del módulo cargado sin errores de consola. |
| **AC-03** | En la ficha de un aula (cualquier panel), existe una barra de Quick Actions con los 3 botones: Responder, Publicar, Evento. | Inspección DOM: `.ksc-quick-actions` con 3 `button[data-ksc-action]`. |
| **AC-04** | Botón "Responder Mensajes" abre un modal que lista los mensajes pendientes asociados al aula, permite escribir y enviar. El INSERT en `messages` se realiza correctamente (ver fila en Supabase). | Log de consola + fila en BD + toast de éxito. |
| **AC-05** | Botón "Publicar en Muro" abre composer con `classroom_id` bloqueado al aula. Al enviar, INSERT en `posts` es correcto y el post aparece inmediatamente en el feed "Actividad de hoy". | Fila en `posts` + feed actualizado sin F5. |
| **AC-06** | Botón "Agendar Evento" abre modal con 2 tabs. "Registrar Ahora" inserta en `classroom_events` y `event_participants` correctamente. | Filas en ambas tablas + toast "registrado" + botón Deshacer visible. |
| **AC-07** | Alertas del Resumen llevan botones de acción ("Responder ahora", "Publicar ahora", "Registrar evento") que abren el modal correcto pre-cargado con el aula de la alerta. | Clic en botón de alerta → modal se abre con el aula correcta precargada. |
| **AC-08** | Después de cualquier acción (responder / publicar / evento), **no hay recarga de página**, los badges del aula y KPIs globales se actualizan en el DOM. | Network tab: 0 navegaciones; observación de actualización visual. |
| **AC-09** | Cada acción aplica el fallback PostgREST si Supabase SDK responde con 401, 403 o 42501. | Mock del error 401 → reintento exitoso vía `fetch()` sin recarga. |
| **AC-10** | En rol Asistente, el checkbox "Publicar como anuncio general" **NO** aparece en el composer. En Directora/Encargada SÍ aparece. | Captura del composer en los 3 roles. |
| **AC-11** | Ningún input de usuario se renderiza sin pasar por `Helpers.escapeHTML()`. | Búsqueda `grep -E "innerHTML.*(content|title|message|input)"` sin resultados sin escapar. |
| **AC-12** | Modales tienen borde 3px, radio ≥28px, sombra `0 14px 36px` y apertura con animación `fadeUp`. | Inspección CSS computed. |

### Tipo `rubric` (evaluativo, escala)

| ID | Dimensión | Escala (0-2) | Umbral de aprobación | Evidencia |
|---|---|---|---|---|
| **AR-01** | **Fidelidad SPA** — ausencia de saltos de pantalla o recargas durante el flujo completo de 5 acciones seguidas. | 2 = 0 saltos / 0 recargas. 1 = solo 1 micro-parpadeo menor. 0 = ≥1 recarga o navegación. | ≥2 | Video/grabación del flujo. |
| **AR-02** | **Consistencia visual** entre los 3 paneles (mismo layout, misma ubicación de botones, mismo espaciado). | 2 = idéntica disposición, solo cambia color de acento. 1 = 90% igual, diferencias menores. 0 = layouts distintos entre paneles. | ≥2 | Comparación visual lado a lado. |
| **AR-03** | **Tiempo de respuesta** — apertura de cada modal en equipo promedio. | 2 = <200ms en los 3 tipos de modal. 1 = entre 200-350ms. 0 = >350ms. | ≥2 | Performance.now() medido en DevTools. |
| **AR-04** | **Experiencia móvil** — modales, quick actions y listas son usables en 375px sin overflow horizontal ni texto solapado. | 2 = todo usable sin zoom ni scroll horizontal extra. 1 = 1 detalle menor. 0 = overflow o solapamiento. | ≥1 | Capturas en viewport 375×812. |

---

## 6. Fuera de Alcance (Non-Goals)

- ❌ No se modifica la **tabla de calificaciones** ni el módulo `GradesModule`.
- ❌ No se crean **nuevas tablas de BD**; se reutilizan `posts`, `messages`, `classroom_events`, `event_participants` existentes.
- ❌ No se cambia la **autenticación** ni el sistema de roles/RLS más allá de los permisos mínimos necesarios (si RLS bloquea, se usa el fallback PostgREST con anon_key).
- ❌ No se implementa edición/eliminación masiva de publicaciones desde Centro Escolar (eso sigue en el módulo Muro).
- ❌ No se añade videollamada ni módulo de tareas dentro de la ficha de aula en esta iteración.
- ❌ Panel de Maestra queda fuera de esta mejora (sigue con su rutina individual).

---

## 7. Suposiciones y Preguntas Abiertas

### Suposiciones (válidas mientras no se indique lo contrario)
- S1: Las tablas `posts`, `messages`, `classroom_events` y `event_participants` ya cuentan con RLS que permite INSERT a roles `directora`, `asistente`, `encargada` y `admin`. Si no, se aplica fallback PostgREST.
- S2: El usuario Encargada de Dirección accede mediante `panel_control.html` (Control Center).
- S3: Los mensajes "asociados a un aula" se determinan por el mismo algoritmo actual de `SchoolCenterModule._compute()` (maestra del aula + estudiantes → padres).
- S4: El "anuncio general" en publicaciones se implementa estableciendo `classroom_id = NULL` (post público general) además de la copia al aula, o mediante una columna `is_global = true` (si existe; si no, `NULL` = global).

### Preguntas abiertas (no bloquean aprobación inicial; se resuelven en implementación)
- Q1: ¿Debe haber un límite diario de publicaciones por usuario desde el Centro Escolar? (Asumiremos: **sin límite**).
- Q2: ¿Los eventos agendados futuros deben disparar notificación push al aula al llegar la hora? (Asumiremos: **no por ahora**; se insertan pasivamente, la maestra lo ve en su rutina).
- Q3: ¿Responder un mensaje desde Centro Escolar marca también el badge del sidebar de Chat a cero de forma sincronizada? (Asumiremos: **sí**, se invoca a `BadgeSystem` / `UnreadMessages` después de responder).
