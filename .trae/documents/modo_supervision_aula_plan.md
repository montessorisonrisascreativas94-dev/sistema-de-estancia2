# Modo Supervisión de Aula — Plan de Implementación

## Repository Research
- **Arquitectura actual**: El Centro Escolar Operativo (`js/directora/school-center.module.js`) ya muestra tarjetas de aula con KPIs (asistencia, rutinas, publicaciones, mensajes, incidencias) y una barra de acciones rápidas en cada ficha (`_renderQuickActionsBar` L1933-1950) con 3 botones: Responder mensajes, Publicar en muro, Crear evento.
- **Panel Maestra**: `panel-maestra.html` + `js/maestra/main.js` (entry point ES module) usa `AppState` (SafeAppState) y `MaestraApi` (wrapper queries Supabase resiliente con fallback columnas). La navegación de secciones usa `window.App.setActiveSection`.
- **Autenticación y roles**: `profiles.role ∈ {directora, asistente, encargada, maestra, padre}`. La directora ya puede intervenir via modales en school-center.module pero **no puede entrar al contexto UI del aula**.
- **Estrategia de migración DDL**: El repo usa la RPC `run_ddl_migration` + carpeta `sql/` + ejecución desde Supabase Functions `run-migration`.
- **RLS existente**: En `sql/07_politicas.sql` — políticas granulares. Las tablas nuevas necesitarán RLS propio.
- **Restricciones de memoria**:
  - UI Estandarizada: bordes 3px, radios ≥28px, sombras 0 14px 36px.
  - Colores por rol: Directora #0B63C7, Asistente #0d9488, Encargada #8B5CF6.
  - Barras fijas y avisos de estado: tipografía gruesa, jerarquía estricta.
  - SPA Updates obligatorios — sin recargas de página.

## Files and Modules
| Archivo | Cambio esperado |
|---|---|
| `sql/21_modo_supervision.sql` | **NUEVO** — Crear tablas `supervision_sessions`, `supervision_audit_log`, `interventions` (con metadata completa) + 3 RLS policies por tabla + trigger audit automático + función RPC `close_intervention`. Incluye comentarios SQL (COMMENT ON). |
| `js/shared/supervision.js` | **NUEVO** — Módulo singleton `SupervisionEngine`: estado `context = {active, classroomId, teacherId, teacherName, initiatedBy, role, moduleOrigin, subSection, startedAt}`. Exponer `enter({classroomId, teacherId, ...opts})`, `exit()`, `registerAudit(action, payload)`, `openInterventionModal(initialContext)`, `renderSupervisionBar()`. Barra sticky premium con paleta por rol. Fallback DOM si Helpers no está listo. |
| `js/shared/constants.js` | Añadir `TABLES.SUPERVISION_SESSIONS`, `TABLES.SUPERVISION_AUDIT`, `TABLES.INTERVENTIONS`, `INQUIRY_STATUS` nuevo para interventions (OPEN / IN_PROGRESS / RESOLVED / CLOSED). |
| `js/directora/school-center.module.js` | (1) `_renderQuickActionsBar`: añadir 4º botón `[👁️ Supervisar aula]` — paleta directora #0B63C7, badge `new` en chip. (2) Handler `data-ksc-action="superviseAula"`: `SupervisionEngine.enter()` con `classroomId`, `teacherId`, `teacherName` y `moduleOrigin='centro-escolar'`, luego `window.location.href = panel-maestra.html?supervision=true&classroomId=X&teacherId=Y&originModule=centro-escolar`. (3) En `_rePaintAlertsRow`: alerta `.onclick → superviseAula → originModule = alert.go` (para navegar directo al sub-módulo exacto del problema). |
| `js/maestra/main.js` | (1) Hook de inicialización: detectar `URLSearchParams.supervision === true` o `localStorage.supervision_context`. Parsear classroomId, teacherId, originModule. Llamar a `SupervisionEngine.enter()` para restaurar contexto. (2) En `setActiveSection`: si supervision active, notificar `SupervisionEngine.setSubSection(sectionId)` para actualizar metadata en barra y audit log. (3) Envolver `MaestraApi` con proxy de auditoría: si supervision.active y mutation (upsertAttendance / createTask / gradeTask / updateTask / deleteTask / upsertDailyLog / publishDailyLogs / registerIncident) → `SupervisionEngine.registerAudit()` automático. (4) Deshabilitar botones que correspondan a acciones 🔒 (eliminar registros, modificar histórico) cuando supervision.active. |
| `css/school-center.css` | Estilos premium para barra `.supervision-sticky-bar`: `position: fixed; top: 0; left: 0; right: 0; z-index: 1000; border-bottom: 3px solid [accent]; border-radius: 0 0 28px 28px; box-shadow: 0 14px 36px rgba(11,99,199,.22); padding: 14px 28px; display: flex; gap: 16px; align-items: center;` + pulsación de "👁️" + botones [Volver al Centro] [Registrar Intervención] [Salir] con bordes 3px radios 20px. |
| `panel-maestra.html` | (1) Añadir placeholder div `#supervisionBarHost` en la parte más alta del body (antes del layout shell). (2) Añadir `@import url('../css/school-center.css')` en el `<head>` si no lo está. |
| `panel_directora.html` + `panel_asistente.html` + `panel_encargada.html` | Incluir `import SupervisionEngine from '../shared/supervision.js'` y asignar a `window.SupervisionEngine = SupervisionEngine` en sus correspondientes `main.js`/`school-center.module.js` para disponibilidad global. |

## Implementation Steps
1. **Paso 1 — Base de Datos**: Escribir `sql/21_modo_supervision.sql` con:
   - Tabla `supervision_sessions` (id UUID PK, usuario_id FK profiles.id, role, classroom_id FK classrooms.id, teacher_id FK profiles.id, module_origin text, started_at timestamptz, ended_at timestamptz null, context_json jsonb)
   - Tabla `supervision_audit_log` (id BIGSERIAL PK, session_id UUID FK supervision_sessions.id NULLABLE, usuario_id FK profiles.id, role, classroom_id, teacher_id, modulo_afectado text, accion_realizada text, motivo_administrativo text null, metadata_jsonb jsonb, created_at timestamptz default now()) — con índice en (usuario_id, classroom_id, created_at)
   - Tabla `interventions` (id BIGSERIAL PK, code text unique generated always, created_by FK profiles.id, role text, classroom_id FK classrooms.id, teacher_id FK profiles.id null, student_id FK students.id null, modulo text, submodulo text null, situacion text, prioridad text check (prioridad in ('baja','media','alta','critica')), observacion text, status text default 'open' check (status in ('open','in_progress','resolved','closed')), assigned_to FK profiles.id null, resolved_by FK profiles.id null, resolved_at timestamptz null, closed_at timestamptz null, metadata_jsonb jsonb)
   - RLS policies por tabla (FOR SELECT solo usuario propio o directora; FOR INSERT solo roles staff; FOR UPDATE solo directora/resolver)
   - Trigger `trg_supervision_audit_auto`: AFTER INSERT OR UPDATE OR DELETE ON attendance/daily_logs/tasks/task_evidences WHEN current_setting('app.supervision_active') = 'true' → INSERT audit row automáticamente
   - Comentarios SQL en tablas/columnas
   - Aplicar migración vía RPC run_ddl_migration

2. **Paso 2 — Shared Module**: Crear `js/shared/supervision.js` implementando `SupervisionEngine` como objeto literal singleton con métodos: `enter / exit / isActive / getContext / setSubSection / registerAudit / openInterventionModal / renderSupervisionBar / _persist / _restore / _emit`. Eventos `supervision:enter`, `supervision:exit`, `supervision:intervention-created`. Interceptor fetch wrapper para injectar header `X-Supervision-Id` cuando esté activo (para trigger server-side).

3. **Paso 3 — Constants**: Añadir nuevas TABLES y STATUSES.

4. **Paso 4 — Centro Escolar**: Integrar botón Supervisar aula en quick actions y en alertas. Mapear `alert.go` (aula/muro/maestros/rutinas) → `originModule` + `jumpToSubSection` en la URL para que al abrir panel-maestra.html se haga setActiveSection automáticamente al módulo exacto del problema.

5. **Paso 5 — Panel Maestra**: Hook de boot con search params + restore desde localStorage, render barra, wrappers de audit en mutations, lockdown de acciones 🔒. Asegurar que `WallModule.init` reciba `viewMode: 'supervision'` cuando corresponda.

6. **Paso 6 — CSS Estética Premium**: Añadir estilos barra sticky con paleta por rol, gradiente sutil, sombra 14/36, border-bottom 3px, icono "👁️" con animación de mirada (bip vertical), chips de metadata en la barra (aula · maestra · tiempo transcurrido).

## Dependencies and Considerations
- La `window.supabase` debe estar disponible antes que `SupervisionEngine` (orden `<script>` correcto).
- `localStorage.supervision_context` es sensible → almacenar solo classroomId, teacherId, moduleOrigin, startedAt; NO almacenar contraseñas ni tokens.
- Trigger PostgreSQL usa `set_config('app.supervision_active', 'true', true)` → antes de mutaciones desde el panel de maestra en modo supervisión hay que hacer SET LOCAL vía una transacción o `rpc.set_supervision_flag(classroomId)`. Si no se puede, fallback a audit interceptor desde JS (que ya tenemos y es obligatorio independiente del trigger server).
- Al salir de supervisión: `ended_at = now()` en la session y limpiar localStorage.
- No requiere refactor de módulos existentes de maestra (asistencia/rutinas/tareas/muro) — son consumidores del contexto; solo wrappeamos mutations con calls a `registerAudit`.
- Compatibilidad: Modo supervisión disponible para Directora, Asistente y Encargada (los 3 roles que usan school-center.module.js), per la barra cambia de accent según role.

## Validation
1. **Sintaxis**: `node --check` en todos los archivos JS modificados y `GetDiagnostics` = 0.
2. **Integración manual**:
   - Abrir panel_directora → Centro Escolar → botón `[👁️ Supervisar aula]` visible en quick actions.
   - Click → redirección panel-maestra.html?supervision=true → barra sticky 👁️ MODO SUPERVISIÓN con aula+maestra y timer.
   - Modificar asistencia de un alumno → entrada en `supervision_audit_log` visible.
   - Click `[Registrar Intervención]` → modal auto-rellenado (aula, maestra, sección actual) + submit → fila en `interventions` con código único.
   - Click `[Salir de supervisión]` → ended_at se actualiza, localStorage limpio, regreso al Centro Escolar de Directora.
3. **Alertas**: Clic en alerta tipo "3 mensajes sin responder" → saltar a Supervisar aula y posicionarse en tab de Comunicación/Familias automáticamente.
4. **Seguridad**: Intentar abrir panel-maestra.html?supervision=true sin ser maestra/directora/encargada → `SupervisionEngine.enter()` falla si profile.role no está permitido → barra no se renderiza, contexto no se activa, redirect a login.html.

## Risks
- **Riesgo #1: Conflicto con RLS en attendance/daily_logs/tasks cuando directora escribe en nombre de aula** → Mitigación: (a) Interceptor JS `registerAudit` captura el intento antes del fetch, (b) si el RLS devuelve 403, aplicar fallback PostgREST directo (ya implementado en supabase.js) con apikey + Authorization Bearer del director. Si falla igualmente, el sistema muestra el error y la intervención se registra igualmente.
- **Riesgo #2: localStorage sync entre pestañas** → Mitigación: `storage` event listener en SupervisionEngine para cerrar la barra si otra pestaña salió del modo. Para session_id usar UUID generado por `crypto.randomUUID()`.
- **Riesgo #3: Intervenciones con estudiante seleccionado desde lista** → Mitigación: En el students tab de panel-maestra, cada row tendrá un chip 🔴 "Intervenir sobre este alumno" que llama a `openInterventionModal({student_id: x})` en onClick handler. Se implementa opcionalmente en un follow-up si el usuario lo confirma después.
- **Riesgo #4: CSP bloqueando estilos inline en la barra** → Mitigación: Colocar todos los `.supervision-*` en `school-center.css` (archivo ya whitelistado) en lugar de style="" inline. Solo usar style="" inline paleta variable --accent como CSS custom property (ya CSP-safe por no ser script).
