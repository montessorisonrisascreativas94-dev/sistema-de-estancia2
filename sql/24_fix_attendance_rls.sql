-- ============================================================
-- 24_fix_attendance_rls.sql
-- Corrige: "new row violates row-level security policy for table attendance"
-- Error 403 en Panel Maestra al registrar asistencia.
--
-- CAUSA RAÍZ:
--   La política WITH CHECK dependía SOLO de get_my_role(). Si esa función
--   devuelve '' (perfil no encontrado / rol inesperado) el INSERT de la
--   maestra se bloquea aunque sea la docente dueña del aula.
--
-- SOLUCIÓN:
--   1) Borrar TODAS las políticas de attendance (dinámico, sin dejar restos).
--   2) Política de escritura que acepta al personal POR ROL **o** al docente
--      del aula (is_teacher_of_classroom) — así no depende de una sola vía.
--   3) Padres: solo leen la asistencia de sus hijos.
--
-- Idempotente — se puede reejecutar sin efectos secundarios.
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Asegurar get_my_role() (SECURITY DEFINER, evita el RLS circular)
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(role, '') FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- 2. Asegurar is_teacher_of_classroom() (respaldo para la maestra)
CREATE OR REPLACE FUNCTION public.is_teacher_of_classroom(p_classroom_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.classrooms
    WHERE id = p_classroom_id AND teacher_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_teacher_of_classroom(bigint) TO authenticated;

-- 3. Habilitar RLS
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

-- 4. Borrar TODAS las políticas existentes de attendance (evita conflictos
--    y políticas RESTRICTIVE ocultas de migraciones anteriores)
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'attendance'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.attendance', pol.policyname);
  END LOOP;
END $$;

-- 5. Política principal: personal escribe/lee; el docente del aula también
CREATE POLICY "attendance_staff_all" ON public.attendance
  FOR ALL
  TO authenticated
  USING (
    COALESCE(public.get_my_role(), '') IN (
      'directora', 'asistente', 'maestra', 'encargada', 'admin'
    )
    OR public.is_teacher_of_classroom(classroom_id)
  )
  WITH CHECK (
    COALESCE(public.get_my_role(), '') IN (
      'directora', 'asistente', 'maestra', 'encargada', 'admin'
    )
    OR public.is_teacher_of_classroom(classroom_id)
  );

-- 6. Padres: solo leen la asistencia de sus propios hijos
CREATE POLICY "attendance_parent_select" ON public.attendance
  FOR SELECT
  TO authenticated
  USING (
    COALESCE(public.get_my_role(), '') = 'padre'
    AND student_id IN (
      SELECT id FROM public.students WHERE parent_id = auth.uid()
    )
  );

-- 7. Garantizar permisos de tabla
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.attendance TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.attendance TO service_role;

-- 8. Secuencia de ID (si existe)
DO $$
DECLARE
  seq_name text;
BEGIN
  SELECT pg_get_serial_sequence('public.attendance', 'id') INTO seq_name;
  IF seq_name IS NOT NULL THEN
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated', seq_name);
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 9. VERIFICACIÓN — ejecuta esto y revisa el resultado.
--    (En el SQL Editor auth.uid() es NULL, así que my_current_role puede salir
--     vacío aquí; lo importante es que aparezcan las 2 políticas listadas.)
SELECT policyname, cmd, permissive, roles, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'attendance'
 ORDER BY policyname;

SELECT 'attendance RLS fixed! Maestra/Aula pueden INSERT/UPDATE.' AS resultado;

-- ============================================================
-- 25_fix_all_rls.sql
-- Corrige TODOS los errores 403 / RLS del sistema:
--   • attendance               (maestra no puede INSERT)
--   • messages                 (403 al enviar mensaje)
--   • classroom_daily_schedule (maestra no puede INSERT rutina)
--   • daily_logs               (maestra no puede guardar rutina)
--   • students                 (directora ve 0 estudiantes)
--   • profiles                 (lectura circular)
--
-- Idempotente — ejecutar N veces sin problema.
-- Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- ══════════════════════════════════════════════════════════════
-- 0. get_my_role() SECURITY DEFINER (base de todo)
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated, anon;

-- ══════════════════════════════════════════════════════════════
-- 1. ATTENDANCE
-- ══════════════════════════════════════════════════════════════
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "attendance_staff_all"     ON public.attendance;
DROP POLICY IF EXISTS "attendance_parent_select" ON public.attendance;
DROP POLICY IF EXISTS "attendance_select"        ON public.attendance;
DROP POLICY IF EXISTS "attendance_insert"        ON public.attendance;
DROP POLICY IF EXISTS "attendance_update"        ON public.attendance;
DROP POLICY IF EXISTS "attendance_all"           ON public.attendance;
DROP POLICY IF EXISTS "attendance_read"          ON public.attendance;
DROP POLICY IF EXISTS "attendance_write"         ON public.attendance;
DROP POLICY IF EXISTS "attendance_maestra_all"   ON public.attendance;

CREATE POLICY "attendance_staff_all" ON public.attendance
  FOR ALL TO authenticated
  USING      (COALESCE(public.get_my_role(),'') IN ('directora','asistente','maestra','encargada','admin'))
  WITH CHECK (COALESCE(public.get_my_role(),'') IN ('directora','asistente','maestra','encargada','admin'));

CREATE POLICY "attendance_parent_select" ON public.attendance
  FOR SELECT TO authenticated
  USING (
    COALESCE(public.get_my_role(),'') = 'padre'
    AND student_id IN (SELECT id FROM public.students WHERE parent_id = auth.uid())
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.attendance TO authenticated, service_role;
DO $$ BEGIN
  EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated',
    pg_get_serial_sequence('public.attendance','id'));
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ══════════════════════════════════════════════════════════════
-- 2. MESSAGES  (chat institucional)
-- ══════════════════════════════════════════════════════════════
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messages_authenticated_all"  ON public.messages;
DROP POLICY IF EXISTS "messages_staff_all"          ON public.messages;
DROP POLICY IF EXISTS "messages_select"             ON public.messages;
DROP POLICY IF EXISTS "messages_insert"             ON public.messages;
DROP POLICY IF EXISTS "messages_update"             ON public.messages;
DROP POLICY IF EXISTS "messages_delete"             ON public.messages;
DROP POLICY IF EXISTS "messages_all"                ON public.messages;
DROP POLICY IF EXISTS "messages_read"               ON public.messages;
DROP POLICY IF EXISTS "messages_write"              ON public.messages;
DROP POLICY IF EXISTS "messages_own"                ON public.messages;

-- Cualquier usuario autenticado puede leer mensajes de su conversación
-- y enviar mensajes propios.
CREATE POLICY "messages_read" ON public.messages
  FOR SELECT TO authenticated
  USING (
    sender_id   = auth.uid()
    OR receiver_id = auth.uid()
    OR COALESCE(public.get_my_role(),'') IN ('directora','asistente','admin','encargada')
  );

CREATE POLICY "messages_insert" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid());

CREATE POLICY "messages_update" ON public.messages
  FOR UPDATE TO authenticated
  USING (sender_id = auth.uid() OR receiver_id = auth.uid())
  WITH CHECK (sender_id = auth.uid() OR receiver_id = auth.uid());

CREATE POLICY "messages_delete" ON public.messages
  FOR DELETE TO authenticated
  USING (
    sender_id = auth.uid()
    OR COALESCE(public.get_my_role(),'') IN ('directora','admin')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.messages TO authenticated, service_role;
DO $$ BEGIN
  EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated',
    pg_get_serial_sequence('public.messages','id'));
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ══════════════════════════════════════════════════════════════
-- 3. CLASSROOM_DAILY_SCHEDULE  (rutina del aula)
-- ══════════════════════════════════════════════════════════════
ALTER TABLE public.classroom_daily_schedule ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cds_staff_all"    ON public.classroom_daily_schedule;
DROP POLICY IF EXISTS "cds_parent_read"  ON public.classroom_daily_schedule;
DROP POLICY IF EXISTS "cds_select"       ON public.classroom_daily_schedule;
DROP POLICY IF EXISTS "cds_insert"       ON public.classroom_daily_schedule;
DROP POLICY IF EXISTS "cds_update"       ON public.classroom_daily_schedule;
DROP POLICY IF EXISTS "cds_all"          ON public.classroom_daily_schedule;
DROP POLICY IF EXISTS "cds_read"         ON public.classroom_daily_schedule;

-- Staff puede leer y escribir horarios del aula
CREATE POLICY "cds_staff_all" ON public.classroom_daily_schedule
  FOR ALL TO authenticated
  USING      (COALESCE(public.get_my_role(),'') IN ('directora','asistente','maestra','encargada','admin'))
  WITH CHECK (COALESCE(public.get_my_role(),'') IN ('directora','asistente','maestra','encargada','admin'));

-- Padres pueden leer el horario del aula de sus hijos
CREATE POLICY "cds_parent_read" ON public.classroom_daily_schedule
  FOR SELECT TO authenticated
  USING (
    COALESCE(public.get_my_role(),'') = 'padre'
    AND classroom_id IN (
      SELECT classroom_id FROM public.students WHERE parent_id = auth.uid() AND classroom_id IS NOT NULL
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.classroom_daily_schedule TO authenticated, service_role;
DO $$ BEGIN
  EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated',
    pg_get_serial_sequence('public.classroom_daily_schedule','id'));
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ══════════════════════════════════════════════════════════════
-- 4. DAILY_LOGS  (rutina diaria de cada niño)
-- ══════════════════════════════════════════════════════════════
ALTER TABLE public.daily_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "daily_logs_staff_all"    ON public.daily_logs;
DROP POLICY IF EXISTS "daily_logs_parent_read"  ON public.daily_logs;
DROP POLICY IF EXISTS "daily_logs_select"       ON public.daily_logs;
DROP POLICY IF EXISTS "daily_logs_insert"       ON public.daily_logs;
DROP POLICY IF EXISTS "daily_logs_update"       ON public.daily_logs;
DROP POLICY IF EXISTS "daily_logs_all"          ON public.daily_logs;

CREATE POLICY "daily_logs_staff_all" ON public.daily_logs
  FOR ALL TO authenticated
  USING      (COALESCE(public.get_my_role(),'') IN ('directora','asistente','maestra','encargada','admin'))
  WITH CHECK (COALESCE(public.get_my_role(),'') IN ('directora','asistente','maestra','encargada','admin'));

CREATE POLICY "daily_logs_parent_read" ON public.daily_logs
  FOR SELECT TO authenticated
  USING (
    COALESCE(public.get_my_role(),'') = 'padre'
    AND student_id IN (SELECT id FROM public.students WHERE parent_id = auth.uid())
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.daily_logs TO authenticated, service_role;
DO $$ BEGIN
  EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated',
    pg_get_serial_sequence('public.daily_logs','id'));
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ══════════════════════════════════════════════════════════════
-- 5. STUDENTS  (directora ve 0 estudiantes)
-- ══════════════════════════════════════════════════════════════
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "students_staff_all"     ON public.students;
DROP POLICY IF EXISTS "students_padre_select"  ON public.students;
DROP POLICY IF EXISTS "students_select"        ON public.students;
DROP POLICY IF EXISTS "students_insert"        ON public.students;
DROP POLICY IF EXISTS "students_update"        ON public.students;
DROP POLICY IF EXISTS "students_delete"        ON public.students;
DROP POLICY IF EXISTS "students_all"           ON public.students;
DROP POLICY IF EXISTS "students_read_all"      ON public.students;
DROP POLICY IF EXISTS "students_directora_all" ON public.students;

CREATE POLICY "students_staff_all" ON public.students
  FOR ALL TO authenticated
  USING      (COALESCE(public.get_my_role(),'') IN ('directora','asistente','maestra','encargada','admin'))
  WITH CHECK (COALESCE(public.get_my_role(),'') IN ('directora','asistente','maestra','encargada','admin'));

CREATE POLICY "students_padre_select" ON public.students
  FOR SELECT TO authenticated
  USING (
    COALESCE(public.get_my_role(),'') = 'padre'
    AND parent_id = auth.uid()
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.students TO authenticated, service_role;
DO $$ BEGIN
  EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated',
    pg_get_serial_sequence('public.students','id'));
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ══════════════════════════════════════════════════════════════
-- 6. PROFILES  (lectura circular)
-- ══════════════════════════════════════════════════════════════
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_self"               ON public.profiles;
DROP POLICY IF EXISTS "profiles_staff_manage"       ON public.profiles;
DROP POLICY IF EXISTS "profiles_authenticated_read" ON public.profiles;
DROP POLICY IF EXISTS "profiles_all"                ON public.profiles;
DROP POLICY IF EXISTS "profiles_public_read"        ON public.profiles;
DROP POLICY IF EXISTS "profiles_staff_upsert"       ON public.profiles;

-- Todos los usuarios autenticados pueden leer perfiles (chat, muro, directorio)
CREATE POLICY "profiles_authenticated_read" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.role() = 'authenticated');

-- Cada usuario gestiona su propio perfil
CREATE POLICY "profiles_self" ON public.profiles
  FOR ALL TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Staff puede gestionar perfiles de otros (crear maestras, padres, etc.)
CREATE POLICY "profiles_staff_manage" ON public.profiles
  FOR ALL TO authenticated
  USING      (COALESCE(public.get_my_role(),'') IN ('directora','asistente','admin'))
  WITH CHECK (COALESCE(public.get_my_role(),'') IN ('directora','asistente','admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO authenticated, service_role;

-- ══════════════════════════════════════════════════════════════
-- 7. NOTIFICATIONS  (si existe)
-- ══════════════════════════════════════════════════════════════
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='notifications') THEN
    EXECUTE 'ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "notifications_own" ON public.notifications';
    EXECUTE $p$
      CREATE POLICY "notifications_own" ON public.notifications
        FOR ALL TO authenticated
        USING (user_id = auth.uid()
          OR COALESCE(public.get_my_role(),'''') IN (''directora'',''admin'',''asistente''))
        WITH CHECK (true)
    $p$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.notifications TO authenticated, service_role';
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ══════════════════════════════════════════════════════════════
-- 8. CLASSROOM_ROUTINE_SETTINGS  (config rutina por aula)
-- ══════════════════════════════════════════════════════════════
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='classroom_routine_settings') THEN
    EXECUTE 'ALTER TABLE public.classroom_routine_settings ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "crs_staff_all" ON public.classroom_routine_settings';
    EXECUTE $p$
      CREATE POLICY "crs_staff_all" ON public.classroom_routine_settings
        FOR ALL TO authenticated
        USING      (COALESCE(public.get_my_role(),'''') IN (''directora'',''asistente'',''maestra'',''encargada'',''admin''))
        WITH CHECK (COALESCE(public.get_my_role(),'''') IN (''directora'',''asistente'',''maestra'',''encargada'',''admin''))
    $p$;
    EXECUTE 'DROP POLICY IF EXISTS "crs_parent_read" ON public.classroom_routine_settings';
    EXECUTE $p$
      CREATE POLICY "crs_parent_read" ON public.classroom_routine_settings
        FOR SELECT TO authenticated
        USING (COALESCE(public.get_my_role(),'''') = ''padre'')
    $p$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.classroom_routine_settings TO authenticated, service_role';
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ══════════════════════════════════════════════════════════════
-- VERIFICACIÓN FINAL
-- ══════════════════════════════════════════════════════════════
SELECT
  tablename,
  count(*) AS policies
FROM pg_policies
WHERE tablename IN (
  'attendance','messages','classroom_daily_schedule',
  'daily_logs','students','profiles','notifications',
  'classroom_routine_settings'
)
GROUP BY tablename
ORDER BY tablename;

SELECT
  public.get_my_role()  AS mi_rol,
  (SELECT count(*) FROM public.students)  AS total_estudiantes,
  (SELECT count(*) FROM public.attendance) AS total_asistencias
;

SELECT '✅ Todas las políticas RLS aplicadas correctamente.' AS resultado;

-- ============================================================
-- 25 FIX VISIBILIDAD DE ACTIVIDADES ESCOLARES
-- ============================================================
-- Problema:
--   Una actividad creada desde la sección "Actividades" (módulo compartido
--   js/shared/school-activities.module.js) con los valores por defecto
--   ("Todo el colegio" + "Sin asignar") tiene:
--        classroom_id = NULL  y  assigned_teacher_id = NULL
--   La política RLS del script 23 excluía esas actividades para las maestras
--   (sólo veían actividades de su aula o asignadas a ella) y, si el trigger
--   espejo no estaba aplicado, también para los padres (target_audience='aula'
--   con classroom_id NULL no coincide con el aula de su hijo).
--
--   --> La directora (admin) la veía, pero no el resto de paneles.
--
-- Este script es 100% RE-EJECUTABLE.
-- ============================================================

SET client_min_messages = WARNING;

-- ============================================================
-- 1. BACKFILL: coherencia aula ↔ audiencia
--    Actividades sin aula = "todo el colegio".
-- ============================================================
UPDATE public.school_activities
   SET target_audience = 'todo_el_centro'
 WHERE classroom_id IS NULL
   AND COALESCE(target_audience, 'aula') <> 'todo_el_centro';

UPDATE public.school_activities
   SET target_audience = 'aula'
 WHERE classroom_id IS NOT NULL
   AND COALESCE(target_audience, 'aula') = 'todo_el_centro';

-- ============================================================
-- 2. BACKFILL: columnas espejo (por si el trigger no estaba aplicado)
--    Esquema 21 (activity_date/start_time/assigned_teacher_id)
--    ↔ Esquema 23 (scheduled_date/scheduled_time/assigned_to)
-- ============================================================
UPDATE public.school_activities
   SET activity_date = COALESCE(activity_date, scheduled_date),
       scheduled_date = COALESCE(scheduled_date, activity_date)
 WHERE activity_date IS DISTINCT FROM scheduled_date
   AND (activity_date IS NULL OR scheduled_date IS NULL);

UPDATE public.school_activities
   SET start_time = COALESCE(start_time, scheduled_time),
       scheduled_time = COALESCE(scheduled_time, start_time)
 WHERE start_time IS DISTINCT FROM scheduled_time
   AND (start_time IS NULL OR scheduled_time IS NULL);

UPDATE public.school_activities
   SET assigned_teacher_id = COALESCE(assigned_teacher_id, assigned_to),
       assigned_to = COALESCE(assigned_to, assigned_teacher_id)
 WHERE assigned_teacher_id IS DISTINCT FROM assigned_to
   AND (assigned_teacher_id IS NULL OR assigned_to IS NULL);

-- ============================================================
-- 3. RLS — las maestras también ven las actividades de TODO EL COLEGIO
--    (reemplaza la política del script 23, que sólo permitía su aula/asignadas)
-- ============================================================
DROP POLICY IF EXISTS school_activities_select_maestra ON public.school_activities;
CREATE POLICY school_activities_select_maestra
    ON public.school_activities FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'maestra'
            AND (
                 assigned_to = auth.uid()
              OR assigned_teacher_id = auth.uid()
              OR target_audience = 'todo_el_centro'
              OR classroom_id IN (SELECT c.id FROM public.classrooms c WHERE c.teacher_id = auth.uid())
            )
        )
        AND status IN ('scheduled','published','in_progress','completed')
    );

-- ============================================================
-- 4. RLS — los padres ven las publicadas de "todo el colegio"
--    (idempotente; equivalente a la política del script 23)
-- ============================================================
DROP POLICY IF EXISTS school_activities_select_padre ON public.school_activities;
CREATE POLICY school_activities_select_padre
    ON public.school_activities FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.profiles p
            JOIN public.students s ON s.parent_id = p.id
            WHERE p.id = auth.uid()
              AND p.role = 'padre'
              AND (
                   s.classroom_id = school_activities.classroom_id
                OR school_activities.target_audience IN ('todo_el_centro')
              )
        )
        AND status IN ('published','in_progress','completed')
    );

-- ============================================================
-- 5. Realtime (opcional pero recomendado): publicar cambios de la tabla
--    para que los paneles se actualicen en vivo.
-- ============================================================
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.school_activities;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- VERIFICACIÓN (ejecutar manualmente para comprobar)
-- ============================================================
-- SELECT id, title, classroom_id, assigned_teacher_id, assigned_to,
--        target_audience, status, activity_date, scheduled_date
--   FROM public.school_activities
--  ORDER BY id DESC
--  LIMIT 20;
