# Debug Session: students-zero-no-error
- **Status**: [OPEN]
- **Created**: 2026-10-08
- **Symptom**: Todos los KPIs de estudiantes = 0 en panel_directora.html ("Estudiantes y Personal" y "Gestión de estudiantes"). Ningún error en la consola de DevTools.
- **Expected**: Deben aparecer estudiantes reales (Total Alumnos > 0, Activos > 0, tabla con registros).
- **Nota**: "Por aulas = 19" carga correctamente → conexión Supabase y RLS para `classrooms` OK; problema exclusivo de `students`.

---

## Hipótesis (falsables)

| # | Hipótesis | Cómo se confirma/refuta |
|---|-----------|--------------------------|
| H1 | **Query en `dashboard-v2.js` (estudiantes/activos) usa aún `.is('deleted_at', null)` y el error queda silenciado en Promise.allSettled** — countRowsSafe no se usa para KPIs principales. | Instrumentar `_loadAcademicStats` y función que calcula "Total Alumnos/Activos" en dashboard-v2.js: registrar parámetros, count retornado, status del promise allSettled. |
| H2 | **`StudentsModule`/`DirectorApi.getStudents` retorna `[]` sin error**: el `build()` default now `useDeleted=false` pero `countRowsSafe` en dashboard-v2 NO se usa → consulta directa `select('id',{count:'exact'})` retorna count=0 (no throw). RLS (`is_active=true`? u otro filtro) está excluyendo TODOS los registros. | Instrumentar `api.getStudents` y `students.module.js _loadStudents`/load: registrar params filters, data.length, count retornado, URL final + SQL. |
| H3 | **Valor de `TABLES.STUDENTS` incorrecto** (apunta a view/table distinta "students_view" y no a "students") | Instrumentar `TABLES` valor en api.js en el momento de la consulta. |
| H4 | **Supabase responde 200 OK pero count=0 debido a que el filtro `eq('is_active',true)` excluye todos los estudiantes si ninguno es `is_active=true` en BD** | Instrumentar consulta SIN `is_active` filter vs CON él; mostrar cantidad total sin filtro. |
| H5 | **RLS (Row Level Security) en la tabla `students` permite 0 rows al rol de la sesión** (usuario authenticado no tiene policy de SELECT sobre students, pero sí sobre classrooms). Esto retorna 0 rows sin error → HTTP 200 + data=[]. | Comparar queries en DB directamente vs runtime; revisar tabla `auth.users` current role en la sesión vs RLS. Instrumentar con `supabase.rpc('current_user')` o similar. |

---

## Evidence Logs (pending instrumentation)

<mcp-link name="debug-server" />

| Timestamp | Event | Detail | Hypothesis tested |
|-----------|-------|--------|-------------------|
| (tbd)     |       |        |                   |

---

## Pasos
1. ✅ Crear debug-session file
2. ⬜ Iniciar Debug Server (recibir logs HTTP)
3. ⬜ Instrumentar dashboard-v2.js (_loadAcademicStats, render de KPIs Total Alumnos/Activos)
4. ⬜ Instrumentar students.module.js (_loadStudents, DirectorApi.getStudents call)
5. ⬜ Instrumentar directora/api.js (getStudents entry, TABLES.STUDENTS valor, build q final SQL-like)
6. ⬜ Pedir al usuario: abrir panel_directora.html + navegar Dashboard + navegar Gestión estudiantes
7. ⬜ Recolectar logs, refutar/confirmar hipótesis
8. ⬜ Fix mínimo
9. ⬜ Post-fix re-run + comparar
10. ⬜ Pedir confirmación usuario
11. ⬜ Limpiar instrumentación
