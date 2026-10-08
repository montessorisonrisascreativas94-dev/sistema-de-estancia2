# Plan: Corregir `sql/23_escolar_activities.sql` (error "column ... does not exist")

## Diagnóstico

- `sql/21_school_activities.sql` ya creó `public.school_activities` con esquema A:
  `activity_date`, `start_time`, `end_time`, `category`, `color_hex`, `content`,
  `school_year_id`, `assigned_teacher_id`, `teacher_notes`, `status` enum `activity_status`.
- `sql/23_escolar_activities.sql` asume esquema B (`scheduled_date`, `scheduled_time`,
  `code`, `priority`, `target_audience`, `created_by`, `assigned_to`, ...) y usa
  `CREATE TABLE IF NOT EXISTS` → la tabla **no se crea**, y el primer `CREATE INDEX`
  sobre `scheduled_date` (línea 57) falla: `column "scheduled_date" ... does not exist`.
- El frontend usa **ambos** esquemas sobre la misma tabla:
  - `js/shared/school-activities.module.js` → `activity_date`, `start_time`, `category`,
    `color_hex`, `content`, `school_year_id`, `teacher_notes`, `assigned_teacher_id`.
  - `js/directora/school-center.module.js:971-978,519-527` → `code`, `activity_type`,
    `priority`, `target_audience`, `scheduled_date`, `scheduled_time`, `duration_minutes`,
    `location`, `created_by`, `assigned_to`, `starts_at`, `ends_at`.
- Estrategia acordada: **una sola tabla con ambas columnas** (sin tocar el frontend).

## Cambios (solo `sql/23_escolar_activities.sql`; el archivo pasa a ser re-ejecutable)

1. **Tipos enum protegidos** — bloque `DO $$ ... EXCEPTION WHEN duplicate_object` que crea
   `activity_status` y `activity_category` si no existen (necesario en BD donde el 21 nunca corrió).
2. **`CREATE TABLE IF NOT EXISTS`** con el esquema del 23 (igual que hoy) + al final
   `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` en un bloque `DO` con TODAS las columnas
   del esquema del 21 que falten (`school_year_id`, `activity_date`, `start_time`,
   `end_time`, `category`, `color_hex`, `assigned_teacher_id`, `teacher_notes`, `content`)
   y las del 23 que falten (`code`, `activity_type`, `priority`, `target_audience`,
   `scheduled_date`, `scheduled_time`, `duration_minutes`, `location`, `starts_at`,
   `ends_at`, `attachments_jsonb`, `metadata_jsonb`), con `DEFAULT` donde la columna
   deba ser `NOT NULL` (`description DEFAULT ''`, `color_hex`, `category`).
3. **Backfill de sincronía** (una sola pasada):
   - `scheduled_date = COALESCE(scheduled_date, activity_date, CURRENT_DATE)` y viceversa;
   - `scheduled_time` ↔ `start_time`;
   - `target_audience = 'todo_el_centro'` cuando `classroom_id IS NULL` (para que los
     padres vean las actividades de todo el centro creadas por el módulo shared);
   - luego `SET NOT NULL` sobre `scheduled_date` y `activity_date`.
4. **Enum `status`**: si la columna es enum, `ALTER TYPE activity_status ADD VALUE
   IF NOT EXISTS 'archived'` (en bloque `DO`; el valor no se usa en la misma transacción).
   Si `status` es `TEXT` (tabla nueva), no se hace nada.
5. **Índices**: se quedan igual; ya no fallan porque las columnas están garantizadas.
6. **RLS correcta y re-ejecutable**:
   - `DROP POLICY IF EXISTS` de las 6 políticas del 23 antes de crearlas (hoy re-ejecutar da
     `policy ... already exists`);
   - `DROP POLICY IF EXISTS` de las 4 políticas heredadas del 21
     (`activities_parent_select/staff_select/admin_all/teacher_update`): son *permissive* y
     se OR-ejecutan con las del 23, anulando sus filtros por rol/aula;
   - crear las 6 políticas del 23 + **1 nueva política UPDATE para maestra**
     (`assigned_to = auth.uid()` o aula propia) — sin ella se rompen
     "Marcar como realizada" (`school-activities.module.js:601`) y "Guardar relato"
     (`school-activities.module.js:874`).
7. **Trigger espejo nuevo** `fn_school_activities_mirror` (`BEFORE INSERT OR UPDATE`):
   mantiene `activity_date ↔ scheduled_date` y `start_time/end_time ↔ scheduled_time`
   simétricamente (detecta cuál cambió en UPDATE), de modo que lo que guarde un módulo
   sea visible para el otro (si no, `gte('activity_date', ...)` oculta las filas creadas
   desde school-center y viceversa).
8. **Mantiene** los 3 triggers del 23 (updated_at, código `ACT-YYYY-MM-DD-NNN`, lifecycle)
   y los triggers heredados del 21 (`publish_guard`, `status_ts`).
9. **Objetos de apoyo idempotentes**: `CREATE TABLE IF NOT EXISTS` + políticas
   (`DROP POLICY IF EXISTS`) de `school_month_configs` y `school_activity_evidences`,
   tomadas del 21, para que el módulo shared funcione aunque el 21 nunca se haya ejecutado.
10. **Grants** sin cambios (tabla + secuencia a `authenticated`/`anon`).

## Riesgos / notas

- Al quitar las políticas del 21, el padre solo verá actividades de la aula de su hijo +
  las de todo el centro (era el propósito del 23; antes veía todo lo publicado).
- La maestra pasa a poder editar solo filas de su aula/asignadas (antes: solo asignadas).
- `ALTER TYPE ADD VALUE` exige no usar el valor en la misma transacción → el script no
  inserta filas con `'archived'`.
- No hay `psql`/`docker` en esta máquina: la verificación es revisión estática y luego
  re-ejecución del archivo en el SQL Editor de Supabase (es re-ejecutable).

## Verificación

1. Releer el archivo completo tras la edición (coherencia de columnas/disparadores).
2. El usuario re-ejecuta `sql/23_escolar_activities.sql` en Supabase SQL Editor sobre la
   BD existente (donde falló) → debe correr sin error y ser re-ejecutable 2 veces.
3. Comprobaciones funcionales en la app: calendario del módulo shared (activity_date) y
   "Nueva actividad" del Centro Escolar (scheduled_date) ambos guardan/leen; maestra puede
   guardar su relato; padre ve actividades publicadas de su aula.
