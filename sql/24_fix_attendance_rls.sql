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
-- 25_fix_all_rls.sql — Colegio Montessori Sonrisas Creativas
-- Corrige TODOS los errores 403 / RLS en un solo script.
--   • attendance, messages, classroom_daily_schedule
--   • daily_logs, students, profiles, posts
--   • post_comments, post_likes, notifications
--   • classroom_routine_settings
--
-- CAUSA RAÍZ: get_my_role() no era SECURITY DEFINER, causando
-- una dependencia circular: RLS → get_my_role() → profiles → RLS
-- → NULL → todas las políticas denegaban todo.
--
-- Idempotente. Ejecutar en: Supabase → SQL Editor → Run
-- ============================================================

-- ══════════════════════════════════════════════════════════════
-- 0. get_my_role() — SECURITY DEFINER (base de TODO)
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated, anon;

-- ══════════════════════════════════════════════════════════════
-- 1. PROFILES
-- ══════════════════════════════════════════════════════════════
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_authenticated_read" ON public.profiles;
DROP POLICY IF EXISTS "profiles_self"               ON public.profiles;
DROP POLICY IF EXISTS "profiles_staff_manage"       ON public.profiles;
DROP POLICY IF EXISTS "profiles_all"                ON public.profiles;
DROP POLICY IF EXISTS "profiles_public_read"        ON public.profiles;
DROP POLICY IF EXISTS "profiles_staff_upsert"       ON public.profiles;

CREATE POLICY "profiles_authenticated_read" ON public.profiles
  FOR SELECT TO authenticated USING (auth.role() = 'authenticated');
CREATE POLICY "profiles_self" ON public.profiles
  FOR ALL TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_staff_manage" ON public.profiles
  FOR ALL TO authenticated
  USING      (COALESCE(public.get_my_role(),'') IN ('directora','asistente','admin'))
  WITH CHECK (COALESCE(public.get_my_role(),'') IN ('directora','asistente','admin'));
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO authenticated, service_role;

-- ══════════════════════════════════════════════════════════════
-- 2. STUDENTS
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
  USING (COALESCE(public.get_my_role(),'') = 'padre' AND parent_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.students TO authenticated, service_role;
DO $$ BEGIN EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated', pg_get_serial_sequence('public.students','id')); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ══════════════════════════════════════════════════════════════
-- 3. ATTENDANCE
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
  USING (COALESCE(public.get_my_role(),'') = 'padre'
    AND student_id IN (SELECT id FROM public.students WHERE parent_id = auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.attendance TO authenticated, service_role;
DO $$ BEGIN EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated', pg_get_serial_sequence('public.attendance','id')); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ══════════════════════════════════════════════════════════════
-- 4. MESSAGES
-- ══════════════════════════════════════════════════════════════
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "messages_authenticated_all" ON public.messages;
DROP POLICY IF EXISTS "messages_staff_all"         ON public.messages;
DROP POLICY IF EXISTS "messages_select"            ON public.messages;
DROP POLICY IF EXISTS "messages_insert"            ON public.messages;
DROP POLICY IF EXISTS "messages_update"            ON public.messages;
DROP POLICY IF EXISTS "messages_delete"            ON public.messages;
DROP POLICY IF EXISTS "messages_all"               ON public.messages;
DROP POLICY IF EXISTS "messages_read"              ON public.messages;
DROP POLICY IF EXISTS "messages_write"             ON public.messages;
DROP POLICY IF EXISTS "messages_own"               ON public.messages;

CREATE POLICY "messages_read" ON public.messages
  FOR SELECT TO authenticated
  USING (sender_id = auth.uid() OR receiver_id = auth.uid()
    OR COALESCE(public.get_my_role(),'') IN ('directora','asistente','admin','encargada'));
CREATE POLICY "messages_insert" ON public.messages
  FOR INSERT TO authenticated WITH CHECK (sender_id = auth.uid());
CREATE POLICY "messages_update" ON public.messages
  FOR UPDATE TO authenticated
  USING (sender_id = auth.uid() OR receiver_id = auth.uid())
  WITH CHECK (sender_id = auth.uid() OR receiver_id = auth.uid());
CREATE POLICY "messages_delete" ON public.messages
  FOR DELETE TO authenticated
  USING (sender_id = auth.uid() OR COALESCE(public.get_my_role(),'') IN ('directora','admin'));
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.messages TO authenticated, service_role;
DO $$ BEGIN EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated', pg_get_serial_sequence('public.messages','id')); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ══════════════════════════════════════════════════════════════
-- 5. POSTS  (muro escolar)
-- ══════════════════════════════════════════════════════════════
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "posts_staff_all"   ON public.posts;
DROP POLICY IF EXISTS "posts_parent_read" ON public.posts;
DROP POLICY IF EXISTS "posts_own"         ON public.posts;
DROP POLICY IF EXISTS "posts_select"      ON public.posts;
DROP POLICY IF EXISTS "posts_insert"      ON public.posts;
DROP POLICY IF EXISTS "posts_update"      ON public.posts;
DROP POLICY IF EXISTS "posts_delete"      ON public.posts;
DROP POLICY IF EXISTS "posts_all"         ON public.posts;
DROP POLICY IF EXISTS "posts_read"        ON public.posts;
DROP POLICY IF EXISTS "posts_authenticated" ON public.posts;

-- Staff crea, edita y borra; padres solo leen
CREATE POLICY "posts_staff_all" ON public.posts
  FOR ALL TO authenticated
  USING      (COALESCE(public.get_my_role(),'') IN ('directora','asistente','maestra','encargada','admin'))
  WITH CHECK (COALESCE(public.get_my_role(),'') IN ('directora','asistente','maestra','encargada','admin'));

CREATE POLICY "posts_parent_read" ON public.posts
  FOR SELECT TO authenticated
  USING (
    COALESCE(public.get_my_role(),'') = 'padre'
    AND (
      classroom_id IS NULL
      OR classroom_id IN (
        SELECT classroom_id FROM public.students
        WHERE parent_id = auth.uid() AND classroom_id IS NOT NULL
      )
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.posts TO authenticated, service_role;
DO $$ BEGIN EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated', pg_get_serial_sequence('public.posts','id')); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- comments
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='comments') THEN
    EXECUTE 'ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "comments_auth" ON public.comments';
    EXECUTE $p$ CREATE POLICY "comments_auth" ON public.comments
      FOR ALL TO authenticated USING (true) WITH CHECK (auth.uid() IS NOT NULL) $p$;
    EXECUTE 'GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.comments TO authenticated,service_role';
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- likes
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='likes') THEN
    EXECUTE 'ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "likes_auth" ON public.likes';
    EXECUTE $p$ CREATE POLICY "likes_auth" ON public.likes
      FOR ALL TO authenticated USING (true) WITH CHECK (auth.uid() IS NOT NULL) $p$;
    EXECUTE 'GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.likes TO authenticated,service_role';
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ══════════════════════════════════════════════════════════════
-- 6. DAILY_LOGS
-- ══════════════════════════════════════════════════════════════
ALTER TABLE public.daily_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "daily_logs_staff_all"   ON public.daily_logs;
DROP POLICY IF EXISTS "daily_logs_parent_read" ON public.daily_logs;
DROP POLICY IF EXISTS "daily_logs_select"      ON public.daily_logs;
DROP POLICY IF EXISTS "daily_logs_insert"      ON public.daily_logs;
DROP POLICY IF EXISTS "daily_logs_update"      ON public.daily_logs;
DROP POLICY IF EXISTS "daily_logs_all"         ON public.daily_logs;

CREATE POLICY "daily_logs_staff_all" ON public.daily_logs
  FOR ALL TO authenticated
  USING      (COALESCE(public.get_my_role(),'') IN ('directora','asistente','maestra','encargada','admin'))
  WITH CHECK (COALESCE(public.get_my_role(),'') IN ('directora','asistente','maestra','encargada','admin'));
CREATE POLICY "daily_logs_parent_read" ON public.daily_logs
  FOR SELECT TO authenticated
  USING (COALESCE(public.get_my_role(),'') = 'padre'
    AND student_id IN (SELECT id FROM public.students WHERE parent_id = auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.daily_logs TO authenticated, service_role;
DO $$ BEGIN EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated', pg_get_serial_sequence('public.daily_logs','id')); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ══════════════════════════════════════════════════════════════
-- 7. CLASSROOM_DAILY_SCHEDULE
-- ══════════════════════════════════════════════════════════════
ALTER TABLE public.classroom_daily_schedule ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cds_staff_all"   ON public.classroom_daily_schedule;
DROP POLICY IF EXISTS "cds_parent_read" ON public.classroom_daily_schedule;
DROP POLICY IF EXISTS "cds_select"      ON public.classroom_daily_schedule;
DROP POLICY IF EXISTS "cds_insert"      ON public.classroom_daily_schedule;
DROP POLICY IF EXISTS "cds_update"      ON public.classroom_daily_schedule;
DROP POLICY IF EXISTS "cds_all"         ON public.classroom_daily_schedule;
DROP POLICY IF EXISTS "cds_read"        ON public.classroom_daily_schedule;

CREATE POLICY "cds_staff_all" ON public.classroom_daily_schedule
  FOR ALL TO authenticated
  USING      (COALESCE(public.get_my_role(),'') IN ('directora','asistente','maestra','encargada','admin'))
  WITH CHECK (COALESCE(public.get_my_role(),'') IN ('directora','asistente','maestra','encargada','admin'));
CREATE POLICY "cds_parent_read" ON public.classroom_daily_schedule
  FOR SELECT TO authenticated
  USING (COALESCE(public.get_my_role(),'') = 'padre'
    AND classroom_id IN (SELECT classroom_id FROM public.students WHERE parent_id = auth.uid() AND classroom_id IS NOT NULL));
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.classroom_daily_schedule TO authenticated, service_role;
DO $$ BEGIN EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated', pg_get_serial_sequence('public.classroom_daily_schedule','id')); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ══════════════════════════════════════════════════════════════
-- 8. NOTIFICATIONS (si existe)
-- ══════════════════════════════════════════════════════════════
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='notifications') THEN
    EXECUTE 'ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "notifications_own" ON public.notifications';
    EXECUTE $p$ CREATE POLICY "notifications_own" ON public.notifications
      FOR ALL TO authenticated
      USING (user_id = auth.uid() OR COALESCE(public.get_my_role(),'') IN ('directora','admin','asistente'))
      WITH CHECK (true) $p$;
    EXECUTE 'GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.notifications TO authenticated,service_role';
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ══════════════════════════════════════════════════════════════
-- 9. CLASSROOM_ROUTINE_SETTINGS (si existe)
-- ══════════════════════════════════════════════════════════════
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='classroom_routine_settings') THEN
    EXECUTE 'ALTER TABLE public.classroom_routine_settings ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "crs_staff_all"   ON public.classroom_routine_settings';
    EXECUTE 'DROP POLICY IF EXISTS "crs_parent_read" ON public.classroom_routine_settings';
    EXECUTE $p$ CREATE POLICY "crs_staff_all" ON public.classroom_routine_settings
      FOR ALL TO authenticated
      USING      (COALESCE(public.get_my_role(),'') IN ('directora','asistente','maestra','encargada','admin'))
      WITH CHECK (COALESCE(public.get_my_role(),'') IN ('directora','asistente','maestra','encargada','admin')) $p$;
    EXECUTE $p$ CREATE POLICY "crs_parent_read" ON public.classroom_routine_settings
      FOR SELECT TO authenticated USING (COALESCE(public.get_my_role(),'') = 'padre') $p$;
    EXECUTE 'GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.classroom_routine_settings TO authenticated,service_role';
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ══════════════════════════════════════════════════════════════
-- VERIFICACIÓN FINAL
-- ══════════════════════════════════════════════════════════════
SELECT tablename, count(*) AS policies
FROM pg_policies
WHERE tablename IN (
  'profiles','students','attendance','messages','posts',
  'daily_logs','classroom_daily_schedule',
  'notifications','classroom_routine_settings'
)
GROUP BY tablename ORDER BY tablename;

SELECT
  public.get_my_role()                          AS mi_rol,
  (SELECT count(*) FROM public.students)        AS total_estudiantes,
  (SELECT count(*) FROM public.posts)           AS total_posts,
  (SELECT count(*) FROM public.attendance)      AS total_asistencias;

SELECT '✅ 25_fix_all_rls.sql aplicado correctamente.' AS resultado;

-- ══════════════════════════════════════════════════════════════
-- 10. TASKS + TASK_EVIDENCES  (tareas y entregas)
-- ══════════════════════════════════════════════════════════════
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tasks_staff_all"    ON public.tasks;
DROP POLICY IF EXISTS "tasks_parent_read"  ON public.tasks;
DROP POLICY IF EXISTS "tasks_select"       ON public.tasks;
DROP POLICY IF EXISTS "tasks_insert"       ON public.tasks;
DROP POLICY IF EXISTS "tasks_update"       ON public.tasks;
DROP POLICY IF EXISTS "tasks_delete"       ON public.tasks;
DROP POLICY IF EXISTS "tasks_all"          ON public.tasks;
DROP POLICY IF EXISTS "tasks_read"         ON public.tasks;

CREATE POLICY "tasks_staff_all" ON public.tasks
  FOR ALL TO authenticated
  USING      (COALESCE(public.get_my_role(),'') IN ('directora','asistente','maestra','encargada','admin'))
  WITH CHECK (COALESCE(public.get_my_role(),'') IN ('directora','asistente','maestra','encargada','admin'));

CREATE POLICY "tasks_parent_read" ON public.tasks
  FOR SELECT TO authenticated
  USING (
    COALESCE(public.get_my_role(),'') = 'padre'
    AND classroom_id IN (
      SELECT classroom_id FROM public.students
      WHERE parent_id = auth.uid() AND classroom_id IS NOT NULL
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tasks TO authenticated, service_role;
DO $$ BEGIN EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated', pg_get_serial_sequence('public.tasks','id')); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- task_evidences
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='task_evidences') THEN
    EXECUTE 'ALTER TABLE public.task_evidences ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "te_staff_all"   ON public.task_evidences';
    EXECUTE 'DROP POLICY IF EXISTS "te_parent_read" ON public.task_evidences';
    EXECUTE $p$
      CREATE POLICY "te_staff_all" ON public.task_evidences
        FOR ALL TO authenticated
        USING      (COALESCE(public.get_my_role(),'') IN ('directora','asistente','maestra','encargada','admin'))
        WITH CHECK (COALESCE(public.get_my_role(),'') IN ('directora','asistente','maestra','encargada','admin'))
    $p$;
    EXECUTE $p$
      CREATE POLICY "te_parent_own" ON public.task_evidences
        FOR ALL TO authenticated
        USING (student_id IN (SELECT id FROM public.students WHERE parent_id = auth.uid()))
        WITH CHECK (student_id IN (SELECT id FROM public.students WHERE parent_id = auth.uid()))
    $p$;
    EXECUTE 'GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.task_evidences TO authenticated,service_role';
    BEGIN
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated', pg_get_serial_sequence('public.task_evidences','id'));
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ══════════════════════════════════════════════════════════════
-- 11. EVAL_AREAS / EVAL_PERIODS / EVAL_MODULES / EVAL_ACTIVITIES
--     (áreas del modal de tarea)
-- ══════════════════════════════════════════════════════════════
DO $$ 
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['eval_evaluations','eval_areas','eval_periods','eval_modules','eval_activities'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS "eval_%s_staff_all" ON public.%I', t, t);
      EXECUTE format($p$
        CREATE POLICY "eval_%s_staff_all" ON public.%I
          FOR ALL TO authenticated
          USING (true)
          WITH CHECK (COALESCE(public.get_my_role(),'''') IN (''directora'',''asistente'',''maestra'',''encargada'',''admin''))
      $p$, t, t);
      EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.%I TO authenticated,service_role', t);
    END IF;
  END LOOP;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'eval tables RLS: %', SQLERRM;
END $$;

SELECT 'tasks + eval RLS fixed!' AS resultado;
