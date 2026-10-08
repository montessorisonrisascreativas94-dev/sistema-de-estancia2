# Corregir visualización de estudiantes (0 en todos los KPIs) Implementation Plan

## Repository Research

### Síntoma reportado
- **Panel Directora**: `Total Alumnos: 0`, `Activos: 0`, `% del total: 0%`, `No hay estudiantes para mostrar.`
- **Sección "Gestión de Estudiantes"**: mismos KPIs en 0 y tabla vacía.
- **Afecta a todos los paneles** (Directora, Maestra, Encargada, Asistente, Padre).

### Causa raíz confirmada (Project Memory)
> **Restricción Hard**: La tabla `students` no contiene la columna `deleted_at`. Se DEBE omitir este filtro en todas las consultas a `students`.

El problema es **sistemático y generalizado**: múltiples módulos en todos los paneles aplican `.is('deleted_at', null)` a la tabla `students` (a sabiendas de que la columna no existe). Aunque algunas funciones tienen un fallback (reintentar sin el filtro), este mecanismo falla en muchos casos porque:

1. El chequeo del fallback usa regex sobre `error.message` que NO captura todos los códigos/formatos de error (ej. `PGRST205`, `42703` solo con código numérico, o mensaje en inglés sin "deleted_at" literal).
2. Muchas consultas NO tienen ningún fallback — aplican `.is('deleted_at', null)` directamente y si fallan devuelven `data: []` silenciosamente dentro de `Promise.allSettled`.
3. El conteo de Dashboard KPIs usa `.limit(100)` con `select('id', { count: 'exact' })` que a veces retorna `count: 0` en error sin disparar el fallback.

### Archivos/Líneas diagnosticados con el problema (filtro `deleted_at` en tabla `students`)

| Archivo | Línea(s) | Función / Contexto | Tiene Fallback? |
|---|---|---|---|
| [api.js](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/directora/api.js#L173) | 173 | `getDashboardKPIs` — count students activos | ❌ Ninguno |
| [api.js](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/directora/api.js#L394-L404) | 400, 431 | `getChatUsers` — active parent IDs | ❌ Ninguno |
| [api.js](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/directora/api.js#L468-L498) | 472, 476 | `getStudents` (build con useDeleted) | ⚠️ Parcial (regex solo en message) |
| [api.js](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/directora/api.js#L593-L594) | 594 | `getQuickCounts` — students | ❌ Ninguno |
| [students.module.js](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/directora/students.module.js#L279) | 279 | `_loadAvgGrade` — students limit 2000 | ❌ Ninguno |
| [dashboard-v2.js](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/directora/dashboard-v2.js#L258) | 258 | `_loadAcademicStats` | ❌ Ninguno (Promise.allSettled → empty) |
| [school-center.module.js](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/directora/school-center.module.js#L840-L889) | 843, 856, 872 | `_studentsQuery` N1, N2, N3 | ⚠️ N4 fallback PostgREST |
| [caja-cobro-v2.js](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/shared/caja-cobro-v2.js#L189) | 189 | load students list | ❌ Ninguno |
| [boleta.module.js](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/shared/boleta.module.js#L99) | 99 | `_load` — students por aula | ❌ Ninguno |
| [payments.js](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/asistente/payments.js#L394) | 394 | modal pago — students activos | ❌ Ninguno |
| [payments.js](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/asistente/payments.js#L453) | 453 | al marcar pago → update is_active ✅ (no es select) | N/A |
| [access.js](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/asistente/access.js#L172) | 172 | access module (revisar) | |
| [dashboard.js](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/asistente/modules/dashboard.js#L48) | 48 | count students head | ⚠️ Revisar |
| [main.js](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/encargada/main.js#L622) | 622, 758, 865 | encargada | Revisar si usan deleted_at |
| [rooms.module.js](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/directora/rooms.module.js) | ~381, 484, 604, 611, 891, 897 | rooms module | Varios selects a students |
| [inscripciones.module.js](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/directora/inscripciones.module.js) | ~931, 1354, 1361 | inscripciones | Varios selects |
| [payments.module.js](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/directora/payments.module.js#L157) | 157 | Cobros | |
| [payments_clean.js](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/directora/payments_clean.js#L616) | 616 | Payments clean | |
| [cobros-dashboard.module.js](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/directora/cobros-dashboard.module.js#L72) | 72 | Cobros dashboard | |
| [cuentas-cobrar.module.js](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/directora/cuentas-cobrar.module.js#L143) | 143 | Cuentas por cobrar | |
| [automation.js](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/directora/automation.js#L241) | 241, 244 | Automation counts | |
| [karpus-events.js](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/directora/karpus-events.js#L29) | 29 | karpus events | |
| [payments-new.module.js](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/directora/payments-new.module.js#L66) | 66 | new payments | |
| [registrar-cobro.module.js](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/directora/registrar-cobro.module.js#L63) | 63 | registrar cobro | |
| [grades-center.module.js](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/directora/grades-center.module.js#L186) | 186 | grades | |
| [invoicing.module.js](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/directora/invoicing.module.js#L239) | 239 | invoicing (single student by id — OK si no lleva deleted_at) | |
| [student-record-modal.js](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/shared/student-record-modal.js#L194) | ~194, 1529, 1605, 1633, 1720, 2270–2363 | Modal de estudiante | Varios selects |
| [badges.js](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/shared/badges.js#L137) | 137, 401 | badges | |
| [helpers.js](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/shared/helpers.js#L458) | 458 | helpers print carnets | |
| [reports.js](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/shared/reports.js#L201) | 201 | reports | |
| [chat.js](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/shared/chat.js#L178) | 178 | chat | |
| [boletin.module.js](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/shared/boletin.module.js#L103) | 103, 139 | boletin | |
| [wall.js](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/shared/wall.js#L1329) | 1329, 1444 | wall (muro) | |
| [videocall-ui.js](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/shared/videocall-ui.js#L459) | 459 | videocall | |
| [videocall.js](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/shared/videocall.js#L45) | 45 | videocall | |
| [profile.js](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/padre/profile.js#L152) | 152, 225 | perfil padre (hijos) | |
| [main.js](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/padre/main.js#L560) | 560, 1356 | panel padre | |
| [api.js](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/padre/api.js#L32) | 32, 46 | padre api | |
| [parent_rating.js](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/padre/parent_rating.js#L119) | 119 | rating | |
| [reports.js](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/padre/reports.js#L182) | 182 | reports padre | |
| [rooms.js](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/asistente/modules/rooms.js) | ~307, 380, 415, 501, 525 | asistente rooms | |
| [chat_app.js](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/asistente/chat_app.js#L157) | 157 | chat asistente | |
| [main.js](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/encargada/main.js#L152) | 152, 622, 758, 865 | panel encargada | |
| [grades.js](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/maestra/modules/grades.js#L464) | 464, 609 | maestra grades (sin deleted_at — ✅ probablemente OK) | |
| [enrollment-cycle.js](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/enrollment-cycle.js#L18) | 18, 51 | enrollment cycle | |
| [login.js](file:///c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/login.js#L322) | 322 | login | |

## Files and Modules

### Módulo compartido (prioridad máxima)
- `js/shared/db-utils.js`: Añadir helper `studentsQuery()` / `studentsCountSafe()` que **nunca** aplique `.is('deleted_at', null)` y reexportar `countRowsSafeStudents` (wrapper sin hideDeleted para students).

### Core de Directora (donde el usuario ve el síntoma)
- `js/directora/api.js`:
  - `getStudents()` — FIX: `useDeleted` default a `false` (nunca aplicar deleted_at a students); mejorar fallback regex para incluir códigos PGRST205/42703.
  - `getDashboardKPIs()` — QUITAR `.is('deleted_at', null)` de la consulta a students.
  - `getQuickCounts()` — Ídem.
  - `getChatUsers()` — Ídem en las 2 consultas a students (parent_ids lookup y studentsByParentIds).
  - `getStudentsByParentIds()` — Ídem.
- `js/directora/students.module.js`:
  - `_loadAvgGrade()` L279 — QUITAR `.is('deleted_at', null)` de students.
- `js/directora/dashboard.service.js`:
  - Ya usa `countRowsSafe` que tiene fallback. **Validar que pase hideDeleted: false para tabla students.**
- `js/directora/dashboard-v2.js` L258 — QUITAR `.is('deleted_at', null)` de students.
- `js/directora/school-center.module.js` L840-889 `_studentsQuery()` — En N1, N2, N3 QUITAR `.is('deleted_at', null)` (el N4 PostgREST ya lo omite).
- `js/directora/automation.js` L241-244 — Quitar deleted_at en count students.
- `js/directora/cobros-dashboard.module.js` L72 — Quitar.
- `js/directora/payments.module.js` L157 — Quitar.
- `js/directora/payments_clean.js` L616 — Quitar.
- `js/directora/cuentas-cobrar.module.js` L143 — Quitar.
- `js/directora/karpus-events.js` L29 — Quitar.
- `js/directora/payments-new.module.js` L66 — Quitar.
- `js/directora/registrar-cobro.module.js` L63 — Quitar.
- `js/directora/inscripciones.module.js` (3 ubicaciones) — Quitar.
- `js/directora/rooms.module.js` (6 ubicaciones ~L381/484/604/611/891/897) — Quitar en selects a students.

### Módulos compartidos
- `js/shared/caja-cobro-v2.js` L189 — Quitar `.is('deleted_at', null)` en students.
- `js/shared/boleta.module.js` L99 — Quitar.
- `js/shared/student-record-modal.js` (múltiples ubicaciones ~194/1633/2270–2285/2363) — Quitar solo en FROM students; mantener en profiles/classrooms (que sí tienen la columna).
- `js/shared/badges.js` L137/401 — Quitar.
- `js/shared/chat.js` L178 — Quitar.
- `js/shared/helpers.js` L458 — Quitar (print carnets).
- `js/shared/reports.js` L201 — Quitar.
- `js/shared/wall.js` L1329/1444 — Quitar.
- `js/shared/videocall.js` L45 y videocall-ui.js L459 — Quitar.
- `js/shared/boletin.module.js` L103/139 — Quitar (select a students).
- `js/shared/gradebook-grid.module.js` — Revisar si filtra students por deleted_at.

### Panel Asistente
- `js/asistente/payments.js` L394 — Quitar `.is('deleted_at', null)` en students.
- `js/asistente/access.js` L172 — Quitar.
- `js/asistente/modules/dashboard.js` L48 — Quitar (count head).
- `js/asistente/modules/rooms.js` (5 ubicaciones) — Quitar en selects a students.
- `js/asistente/modules/students.js` L379 ✅ (actualmente NO usa deleted_at — conservar).
- `js/asistente/chat_app.js` L157 — Quitar.

### Panel Encargada
- `js/encargada/main.js` L152/622/758/865 — Validar y quitar deleted_at en selects students.

### Panel Maestra
- `js/maestra/api.js` L39-66 — ✅ Actualmente NO usa deleted_at (solo classroom_id + is_active). No tocar.
- `js/maestra/modules/grades.js` L464/609 — ✅ No usa deleted_at. No tocar.
- `js/maestra/modules/students.js` L122 — ✅ No usa deleted_at (single student). No tocar.
- `js/maestra/main.js` — Revisar si hay alguna query con deleted_at en students.

### Panel Padre
- `js/padre/profile.js` L152/225 — Quitar.
- `js/padre/main.js` L560/1356 — Quitar.
- `js/padre/api.js` L32/46 — Quitar.
- `js/padre/parent_rating.js` L119 — Quitar.
- `js/padre/reports.js` L182 — Quitar.

### Otros
- `js/enrollment-cycle.js` L18/51 — Quitar.
- `js/login.js` L322 — Quitar.
- `js/asistente/modules/dashboard.js` — Quitar count student head.

## Implementation Steps

Orden de dependencia (de abajo hacia arriba, evitando que un cambio rompa dependientes):

### Paso 1. Utility hardening (db-utils.js) — PRIMERO
1. Crear en `db-utils.js`:
   - `countRowsSafeStudents(filters = {})` — wrapper que llama `countRowsSafe(table='students', filters, { hideDeleted: false })`. Garantiza que NUNCA se filtre por deleted_at en students.
   - Exportar también un objeto `STUDENTS_NO_DELETED = true` como flag semántico.
2. Verificar que `countRowsSafe` ya use `PGRST205` code check (sí lo hace L306 db-utils.js ✅).

### Paso 2. Directora/api.js (capa de acceso a datos — todos los módulos la usan)
1. `getStudents()`: Cambiar `build(useDeleted = true)` → `build(useDeleted = false)` por defecto; opcionalmente mantener la rama de retry pero con `useDeleted` invertido (por si alguna BD sí lo tiene).
2. `getDashboardKPIs()` L173: Quitar `.is('deleted_at', null)` de la consulta students.
3. `getQuickCounts()` L594: Idem.
4. `getChatUsers()` L400: Quitar `.is('deleted_at', null)` en supabase.from(TABLES.STUDENTS).
5. `getStudentsByParentIds()` L431: Idem.
6. Mejorar fallback regex en `getStudents` para incluir códigos:
   ```js
   const code = String(error?.code || error?.status || '');
   const msg  = String(error?.message || '').toLowerCase();
   const isMissingCol = code === 'PGRST205' || code === '42703' ||
     (/deleted_at/.test(msg) && /column|not exist|does not exist|no existe/i.test(msg));
   ```

### Paso 3. Directora/students.module.js (donde inicia el "Gestión de estudiantes")
1. `_loadAvgGrade()` L279: Quitar `.is('deleted_at', null)` del `.from('students')`.
2. Opcional: Añadir try/catch granular a la promesa students.

### Paso 4. Directora/dashboard.service.js
1. L47-48: Cambiar las llamadas `countRowsSafe('students')` y `countRowsSafe('students', { is_active: true })` para usar `hideDeleted: false` explícito:
   ```js
   countRowsSafe('students', {}, { hideDeleted: false }),
   countRowsSafe('students', { is_active: true }, { hideDeleted: false }),
   ```

### Paso 5. Resto de módulos de Directora (uno por uno)
Aplicar el patrón: **en todo `.from('students')` que contenga `.is('deleted_at', null)`, ELIMINAR esa cadena**.
1. `dashboard-v2.js` L258
2. `school-center.module.js` L843, L856, L872 (3 ocurrencias en N1/N2/N3)
3. `automation.js` L241, L244
4. `cobros-dashboard.module.js` L72
5. `payments.module.js` L157
6. `payments_clean.js` L616
7. `cuentas-cobrar.module.js` L143
8. `karpus-events.js` L29
9. `payments-new.module.js` L66
10. `registrar-cobro.module.js` L63
11. `inscripciones.module.js` (3 ocurrencias ~931, 1354, 1361)
12. `rooms.module.js` (6 ocurrencias — ~381, 484, 604, 611, 891, 897) — IMPORTANTE: solo quitar en FROM 'students', NO en 'classrooms' o 'profiles' (sí tienen deleted_at).

### Paso 6. Módulos compartidos (shared/)
1. `caja-cobro-v2.js` L189 — Quitar `.is('deleted_at', null)` solo en students; mantener si existe en otras tablas.
2. `boleta.module.js` L99 — Ídem.
3. `student-record-modal.js` — Buscar y quitar en FROM 'students'; mantener en 'profiles'/'classrooms'.
4. `badges.js` L137, L401 — Ídem.
5. `chat.js` L178 — Ídem.
6. `helpers.js` L458 — Ídem.
7. `reports.js` L201 — Ídem.
8. `wall.js` L1329, L1444 — Ídem.
9. `videocall.js` L45 y `videocall-ui.js` L459 — Ídem.
10. `boletin.module.js` L103, L139 — Ídem.
11. `gradebook-grid.module.js` — Revisar y quitar si existe.

### Paso 7. Panel Asistente, Encargada, Padre
Para cada uno, aplicar mismo patrón de eliminación solo en FROM 'students':
1. `asistente/payments.js` L394
2. `asistente/access.js` L172
3. `asistente/modules/dashboard.js` L48
4. `asistente/modules/rooms.js` (5 ubicaciones ~307, 380, 415, 501, 525)
5. `asistente/chat_app.js` L157
6. `encargada/main.js` L152, L622, L758, L865
7. `padre/profile.js` L152, L225
8. `padre/main.js` L560, L1356
9. `padre/api.js` L32, L46
10. `padre/parent_rating.js` L119
11. `padre/reports.js` L182

### Paso 8. Archivos misceláneos
1. `js/enrollment-cycle.js` L18, L51 — Quitar.
2. `js/login.js` L322 — Quitar.

### Paso 9. API Maestra
- Confirmar que `MaestraApi.getStudentsByClassroom()` NO usa deleted_at (actualmente L39-66 no lo usa ✅). No modificar.

## Dependencies and Considerations

- **`classrooms` y `profiles` SÍ tienen columna `deleted_at`**. No tocar esos filtros. La eliminación de `.is('deleted_at', null)` es **EXCLUSIVA para la tabla `students`**.
- Si una misma función consulta students PERO también classrooms/profiles, solo eliminar el filtro en el `.from('students')` correspondiente, jamás en los demás.
- Algunos módulos usan `Promise.allSettled([])` — al quitar el filtro erróneo, esas promesas dejarán de caer en "rejected" y pasarán a "fulfilled" con los datos reales.
- El `DashboardService` ya usa `countRowsSafe` que tiene mecanismo de fallback; el único ajuste es asegurar `hideDeleted: false` específicamente para students (aunque countRowsSafe también reintenta sin el filtro si detecta PGRST205, es más seguro/rápido pasarlo directo).
- `DirectorApi.getStudents` ya tiene una rama de retry sin deleted_at; pero al cambiar el default, evitamos un viaje HTTP de "prueba + error" por cada consulta (performance).
- **Hard constraint confirmada** (project memory): La tabla `students` no contiene la columna `deleted_at` — omitir este filtro en las consultas.

## Validation

1. **Panel Directora → Sección "Gestión de Estudiantes"**:
   - Abrir `panel_directora.html`, navegar a "Gestión de estudiantes".
   - Validar que:
     - `Total estudiantes` sea > 0 (debe mostrar el número real de la BD).
     - `Activos` refleje el count real de `is_active = true`.
     - `Por aulas` se mantenga (proviene de classrooms que sí funciona).
     - La tabla/tarjetas muestren la lista de estudiantes (no más "No hay estudiantes para mostrar").
     - Filtros "Todas las aulas / Todos los estados / Todos los niveles" funcionen correctamente.
2. **KPIs Dashboard principal** (panel_directora.html):
   - Los 4 KPIs principales (Total Alumnos / Activos / % / Por aulas) deben corresponder a datos reales.
3. **Cobros / Caja** (asistente y directora):
   - Lista de estudiantes para cobro debe poblarse.
4. **Panel Maestra**:
   - Al entrar a un aula, lista de estudiantes debe aparecer (> 0 si el aula tiene alumnos).
5. **Panel Padre**:
   - Perfil / Hijos debe mostrar los niños vinculados al padre.
6. **Consola navegador**:
   - Verificar que NO aparezcan errores `PGRST205`, `42703`, `column "deleted_at" does not exist` referentes a la tabla `students`.
   - Los errores que antes salían en rojo de "getStudents fallback" no deben aparecer (porque el filtro ya no se aplica).
7. **Prueba de regresión**:
   - `students.module.js` — botón "Nuevo Estudiante" → modal abre, se puede guardar sin error y la lista se actualiza correctamente.
   - `printAllCarnets()` → se genera PDF con los estudiantes (no vacío).
   - `exportToCSV` → exporta datos reales (no vacío).

## Risks

- **Risk 1 — Eliminación accidental en tablas que SÍ usan deleted_at (classrooms, profiles)**:
  - **Handling**: Búsqueda selectiva Grep solo `.from('students')`; commits separados por módulo; antes de cada edit confirmar que la línea corresponde a FROM students.
- **Risk 2 — Algunos módulos filtran `deleted_at IS NULL` por razones de auditoría en vistas**:
  - **Handling**: Según project memory, la columna NO existe en students. La restricción es hard. No hay riesgo de "ver registros borrados" porque la funcionalidad no existe en la tabla.
- **Risk 3 — student-record-modal compartido usa students + profiles mezclados**:
  - **Handling**: Editar quirúrgicamente solo las líneas `from('students')`; usar edit con contexto amplio para identificar correctamente el FROM.
- **Risk 4 — Maestra/Main.js carga students al cambiar de aula (issue anterior resuelto con force:true)**:
  - **Handling**: Confirmar que `MaestraApi.getStudentsByClassroom` NO usa deleted_at (validado ✅). No tocar esa capa. La recarga con force:true ya estaba resuelta en la sesión anterior; no modificar esa lógica.
- **Risk 5 — Cambios en archivos shared afectan múltiples paneles (asistente/padre/encargada/directora)**:
  - **Handling**: Validar 1 por 1 cada panel después de editar el archivo shared correspondiente; si falla, rollback inmediato y revisión manual del FROM.
