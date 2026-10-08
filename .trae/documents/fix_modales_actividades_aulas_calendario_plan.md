# Plan de Corrección: Modales, Actividades, Sincronización de Aulas y Calendario Académico

## Repository Research

### Conclusiones confirmadas por inspección directa del código

**1. Bug CRÍTICO de classesGrid (solo 1 aula en home grid)**
- Archivo afectado: [main.js](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/maestra/main.js#L898-L1004) `initDashboard()`
- Causa: El grid `#classesGrid` itera **solo** con `AppState.get('classroom')` (singular, una sola aula, la activa) en lugar de `AppState.get('classrooms')` (array completo de todas las aulas asignadas a la maestra).
- Síntoma que describe el usuario: en la barra sticky `#teacherClassroomBar` sí salen las 2 pastillas (Párvulos I + Párvulos III), porque `_initClassroomSwitcher` usa bien `classrooms[]`; pero en `#classesGrid` (panel home "Mis Clases") solo sale 1 tarjeta.
- Fix requerido: Cargar en paralelo estudiantes + asistencia PARA CADA aula asignada y renderizar 1 card/aula con sus stats propios. El widget KPI "Total Alumnos" debe sumar estudiantes de TODAS las aulas (no solo la activa).

**2. Sincronización aulas ("no está sincronizada")**
- Los contadores globales (`#statsStudents`, `#statsPresentes`, etc.) y los widgets `_updateNextActivityWidget`, `_updatePunchAlertWidget`, `_updateTasksToGradeWidget` toman datos SOLO de la aula activa (singular). Pero el KPI "Mis Clases: 2" sí cuenta todas las aulas del profesor.
- Esta disparidad es la "desincronización" que percibe el usuario: 2 clases, 0 alumnos totales (solo cuenta la 1ª, que está vacía).
- Fix requerido: `initDashboard` debe agregar métricas agregadas (total de alumnos en TODAS las aulas, total presentes, total incidentes hoy en todas las aulas).

**3. Modal CSS + botón Guardar**
- Reglas en [maestra-design-system.css](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/css/maestra-design-system.css#L830-L849) usan selectores demasiado restrictivos: `[id$="-inner"] button[id^="btnSave"]`. Esto **no** cubre botones como `btnSaveProfile` (fuera de un `-inner`) ni `btn-maestra` dentro de un contenedor que no sea `modal-footer-pink`.
- En [theme.css](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/css/theme.css#L567-L571) hay reglas globales `.btn-primary` con `background: #ea580c;` (naranja brillante no concordante con la paleta naranja correcta `#FF8A00`).
- El `modal-header-pink`, `modal-body-scroll`, `modal-footer-pink` tienen padding compacto pero los inputs (`theme.css` L567) usan `0.75rem / 0.5rem` de border-radius que colisionan con la estética `rounded-2xl` del sistema.
- Fix: Normalizar el selector del botón guardar para que alcance A TODAS las variantes (`btn-maestra`, `.btn-primary`, `button.btn-save`, `[data-action="save"]`, `id*=Save`, `id*=Guardar`), unificar tamaño, color (verde = acción principal sin riesgo; naranja = CTA/urgente según guía 70-20-10), padding y radio consistentes.

**4. Sección Actividades (t-actividades) mal diseñada**
- Módulo: [school-activities.module.js](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/shared/school-activities.module.js#L1072-L1087)
- Los estilos se INYECTAN por JS con la constante `SA_CSS` (L1072). Contiene reglas muy crudas:
  - `.sa-label` usa `font-size:10px` (demasiado pequeño, ilegible) y color `#94A3B8`.
  - `.sa-btn-primary` usa color `#0D9488` (teal/verde agua) que **NO coincide** con la paleta verde oficial `#28B54D` del colegio.
  - `.sa-btn-publish` usa `#8B5CF6` (morado) — rol no asignado en el sistema; "publicar" debiera ser verde.
  - Faltan estilos para el contenedor principal `#actividadesContent`, cards de actividades (`_renderGridHTML` / `_renderListHTML`), tipografía consistente (títulos en font-black 900, tamaños 18/24px no 10px), bordes y espaciado.
- Fix necesario: Expandir el `SA_CSS` inyectado para: normalizar tipografía (labels mínimo 11px font-bold, no 10px font-900 uppercase), alinear botones a paleta Sonrisas Creativas (verde #28B54D principal, naranja #FF8A00 publicar, rojo #EF4444 borrar, gris #64748B cancelar), agregar cards con sombra suave, borde 1px gris, rounded-2xl, hover elevación. Fondo general en `#F8FAFC`.

**5. Calendario académico roto (panel directora)**
- Dos rutas relacionadas:
  - `ciclo-escolar-config` → `SchoolYearModule.init()` (año escolar / calendario)
  - `ciclo-academico` → [AcademicCycleModule.init()](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/directora/academic-cycle.module.js#L27-L34) (pre-inscripciones, inscripciones, pagos, planes)
- El `headerCycleSelector` del `panel_directora.html` tiene `onchange="App.academic?.switchYear?.(this.value)"`. En `AcademicCycleModule.switchYear` (L121) **no actualiza el `headerCycleSelector`**, solo el selector interno del módulo: el header y el contenido se desincronizan al cambiar desde el header o desde el interior.
- El `section` `ciclo-escolar` L1319 del HTML está **VACÍO** con solo `<div class="p-2 md:p-4"></div>`; es el "hub" y llama `_renderCicloEscolar()` (L913) que genera 4 tarjetas. Pero si el usuario viaja directo a `ciclo-escolar-config` desde el menú sin pasar por el hub, el CSS del shell (`school-center.css` / `directora-containers.css`) no aplica bien y el tab se rompe.
- El `AcademicCycleModule.showTab` usa clases `acad-tab` con `border-2` y colores inline; NO hay regla en ningún `.css` directora para estos tabs, confían en Tailwind.
- Fix requerido: (a) `switchYear` debe actualizar `#headerCycleSelector.selectedIndex`; (b) si `_renderShell` encuentra que existe `#headerCycleSelector` pero no su opción correspondiente, agregarla; (c) agregar reglas CSS para `.acad-tab` y content en `school-center.css` como fallback si Tailwind falla; (d) garantizar padding mínimo de `1rem` en sections `#ciclo-escolar` y `#ciclo-academico`.

---

## Files and Modules (archivos a cambiar)

### Maestra panel
- [main.js](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/maestra/main.js#L898-L1004) — `initDashboard()`: reemplazar render 1-aula por loop sobre `AppState.get('classrooms')[]` y cargar estudiantes+asistencia en paralelo por aula; agregar métricas TOTALES (sumando todas las aulas) para los KPI grandes.
- [maestra-design-system.css](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/css/maestra-design-system.css#L830-L849) — Botones guardar modal: unificar selectores y estilos; arreglar regla `.modal-footer-pink .btn-maestra` que no llega a botones sueltos.

### Actividades (ambos paneles, directora y maestra)
- [school-activities.module.js](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/shared/school-activities.module.js#L1072-L1087) — Incrementar/normalizar `SA_CSS` (tipografía, paleta, cards, spacing).

### Directora panel (ciclo académico)
- [academic-cycle.module.js](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/directora/academic-cycle.module.js#L82-L121) — `_renderShell` + `switchYear`: sincronizar `#headerCycleSelector`, fallback CSS.
- [school-center.css](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/css/school-center.css#L1136-L1152) — Agregar reglas fallback para tabs `acad-tab` y contenido del ciclo; ajustar modales directora `ksc-modal-footer`.

### Theme global (modal inputs)
- [theme.css](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/css/theme.css#L567-L571) — Cambiar `.modal-body input` border-radius `0.5rem` → `rounded-xl 0.75rem`; corregir `.btn-primary` background `#ea580c` → `#FF8A00` y hover `#E07900`.

---

## Implementation Steps (orden de dependencias)

1. **[theme.css]** Normalizar `.modal-body input/textarea` y `.btn-primary` a paleta y radio correctos (10 min).
2. **[maestra-design-system.css]** Ampliar selectores de botón guardar: `body.panel-maestra-body button.btn-primary, body.panel-maestra-body .btn-save, body.panel-maestra-body [data-action="save"], body.panel-maestra-body [id*="Save"], body.panel-maestra-body [id*="Guardar"]`; consolidar todos a verde principal `#28B54D` con hover `#239943`, sombra, padding 12px 22px, border-radius 14px, font-weight 900 (20 min).
3. **[maestra/main.js initDashboard]** — Bloque de refactor más grande:
   a. Leer `AppState.get('classrooms')` array.
   b. `Promise.allSettled` por cada aula: `MaestraApi.getStudentsByClassroom(id)` + `MaestraApi.getAttendance(id, today)` + `count_incidents` hoy por aula.
   c. Calcular totals: alumnosTotal = suma por aula; presentesTotal = suma por aula; incidentesTotal = suma.
   d. Render `UI.updateDashboardStats` con los totals.
   e. Render `classesGrid.innerHTML = classroomsArray.map(...).join('')` — 1 card por aula con color canónico `classroomColorFor(c.name, c.level)` para la banda superior, nombre/nivel, 2 KPI (Alumnos / Presentes hoy), y CTA `Entrar al Aula`.
   f. Widgets `PunchAlert` y `TasksToGrade` se calculan con los totales (sumando todas las aulas o por cada aula un widget? — decisión: mantener 1 widget PunchAlert global que diga "X niños sin marcar en todas sus aulas"). (90 min).
4. **[school-activities.module.js SA_CSS]** — Reemplazar SA_CSS por versión completa:
   - `#actividadesContent` con `color-scheme: light; max-width: 1400px;` y fuente Nunito/Segoe UI.
   - `.sa-banner`, `.sa-card`, `.sa-month-header`, `.sa-calendar-grid > div` con rounded-2xl, borde 1px `#E2E8F0`, sombra `0 4px 20px rgba(15,23,42,.04)`.
   - Títulos `h1.sa-title = 1.5rem font-black #0F172A;`, `h2.sa-subtitle = 1.1rem font-bold #1E293B;`, labels `.sa-label {font-size:11px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; color:#64748B; margin-bottom:6px;}`.
   - Botones: `sa-btn-primary {background:#28B54D; hover:#239943;}`, `sa-btn-publish {background:#FF8A00; hover:#E07900;}`, `sa-btn-danger {background:#EF4444; color:#fff; border-color:#FECACA; hover:#DC2626;}`, `sa-btn-ghost {background:#F1F5F9; color:#475569; hover:#E2E8F0;}`.
   - Inputs `sa-input` con padding 12px 14px, font-weight 600, rounded-2xl, `transition: all .18s`, focus border `#28B54D` y shadow suave verde. (60 min).
5. **[directora/academic-cycle.module.js]** — Sincronizar header select:
   a. En `_renderShell`: después de render `#yearSelector` interior, sincronizar `#headerCycleSelector` (existe en header panel) con el mismo array de years + mismo valor seleccionado.
   b. En `switchYear`: después de actualizar `_currentYear`, actualizar AMBOS selects (`#yearSelector` y `#headerCycleSelector`) para que sus valores coincidan.
   c. En `showTab`: aplicar un fallback en el loop `querySelectorAll('.acad-tab')` si no encuentra nodos (que espere 1 rAF antes de renderear tabs). (45 min).
6. **[school-center.css]** — Agregar al final bloques fallback para `.acad-tab`, `.acad-tab.active`, `.acad-tab:hover`; padding mínimo `#ciclo-escolar section > div, #ciclo-academico section > div`; tipografía consistente h1/h2. (30 min).

---

## Dependencies and Considerations
- `AppState.classrooms` es el array sanitizado por `dedupeClassrooms()` y solo se rellena si la maestra pasa el login. Si `initDashboard()` recibe `classrooms = []` (maestra sin aulas), mostrar empty state (card única con mensaje "Sin aulas asignadas").
- `MaestraApi.getStudentsByClassroom(id)` puede devolver `[]` (aula vacía); hay que manejar `students || []` en el `.map()` para que no falle el render.
- El `SectionCache` debe seguir funcionando: al entrar a `t-home` después de `switchClassroom`, el dashboard nuevo (con todas las aulas) debe regenerarse sin cachear la versión 1-aula. Importante: en `initDashboard`, al finalizar, hacer `SectionCache.markLoaded('t-home')` o bien invalidar el cache antiguo para evitar que se muestre HTML antiguo con 1 sola aula.
- SA_CSS inyectado: el script ya usa `if (!document.getElementById('saActivitiesCss'))` para no duplicar; la nueva versión reemplaza el contenido del style, así que no se acumulan reglas.
- Navegadores objetivo: Chrome >= 100, Edge >= 100, Safari >= 15. `:has()` no se usa en estos fixes; todo con selectores clásicos.
- Paleta obligatoria: Verde Sonrisas `#28B54D / #239943`, Naranja CTA `#FF8A00 / #E07900`, Rojo errores `#EF4444`, Gris border `#E2E8F0`, Texto oscuro `#0F172A / #1E293B`.

---

## Validation
- `GetDiagnostics` para `main.js (maestra)`, `academic-cycle.module.js`, `school-activities.module.js`, `theme.css`, `maestra-design-system.css`, `school-center.css`.
- Prueba visual (si hubiera servidor): login maestra con 2 aulas → home debe mostrar 2 tarjetas (Párvulos I y Párvulos III) en Mis Clases. KPI "Total Alumnos" = suma. Botón "🚪 Entrar al Aula" de cada card abre su `showClassroomDetail(...)`.
- Modales: abrir modal de edición de perfil → botón "Guardar Cambios" con fondo verde, bordes redondeados 14px, no colisiona con `.btn-primary` naranja de theme antiguo.
- Actividades: entrar a "Actividades" → cards borde 1px gris, labels ≥ 11px, botones en paleta verde/naranja/rojo correcta; no texto 10px ilegible.
- Directora Ciclo Académico: cambiar año desde el header y desde el selector interno; ambos selects deben reflejar el mismo año. Pre-inscripciones/Inscripciones cargan sin layout roto.

---

## Risks
1. **Riesgo**: Refactor de `initDashboard` que trae fetch por aula → 5 aulas = 10 fetchs simultáneos + counts.  
   **Mitigación**: Usar `Promise.allSettled` para que el fallo de un aula no rompa el resto; limitar a 5 aulas máx (realidad del colegio: no más de 6 niveles canónicos posibles).
2. **Riesgo**: Eliminar la regla naranja `modal-footer-pink .btn-maestra` y reemplazarla por verde genera confusión con CTA naranja de otras tarjetas.  
   **Mitigación**: Dejar el naranja SÓLO para los CTAs de tarjetas de aula (el botón "Entrar al Aula" y contadores "Presentes hoy") y las acciones urgentes de modales (e.g., "Eliminar" es rojo, "Guardar" es verde principal).
3. **Riesgo**: `SectionCache` de `t-home` se marcó como loaded antes del refactor, por lo que al recargar podría mostrar el grid antiguo con 1 aula.  
   **Mitigación**: Al final del nuevo `initDashboard`, marcar `SectionCache.markLoaded` con un TTL corto (30s) o invalidar `SectionCache.invalidate('t-home')` antes del render en cada `switchClassroom` (ya hecho).
4. **Riesgo**: SA_CSS inyectado es muy largo y podría superar el style inline sin concatenar.  
   **Mitigación**: Mantener la misma estructura (un solo `<style>`), con reglas ordenadas y cortas (max 600 chars cada propiedad).
