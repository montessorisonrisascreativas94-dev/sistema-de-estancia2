-- ============================================================
-- 25_fix_all_rls.sql — Colegio Montessori Sonrisas Creativas
-- Corrige TODOS los errores 403 / RLS del sistema.
-- Idempotente. Ejecutar en: Supabase → SQL Editor → Run
-- ============================================================

-- 0. get_my_role() SECURITY DEFINER (base de todo)
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated, anon;

-- 1. PROFILES
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
  FOR ALL TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_staff_manage" ON public.profiles
  FOR ALL TO authenticated
  USING      (COALESCE(public.get_my_role(),'') IN ('directora','asistente','admin'))
  WITH CHECK (COALESCE(public.get_my_role(),'') IN ('directora','asistente','admin'));
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO authenticated, service_role;

-- 2. STUDENTS
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

-- 3. ATTENDANCE
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

-- 4. MESSAGES
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

-- 5. POSTS
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "posts_staff_all"     ON public.posts;
DROP POLICY IF EXISTS "posts_parent_read"   ON public.posts;
DROP POLICY IF EXISTS "posts_own"           ON public.posts;
DROP POLICY IF EXISTS "posts_select"        ON public.posts;
DROP POLICY IF EXISTS "posts_insert"        ON public.posts;
DROP POLICY IF EXISTS "posts_update"        ON public.posts;
DROP POLICY IF EXISTS "posts_delete"        ON public.posts;
DROP POLICY IF EXISTS "posts_all"           ON public.posts;
DROP POLICY IF EXISTS "posts_read"          ON public.posts;
DROP POLICY IF EXISTS "posts_authenticated" ON public.posts;
CREATE POLICY "posts_staff_all" ON public.posts
  FOR ALL TO authenticated
  USING      (COALESCE(public.get_my_role(),'') IN ('directora','asistente','maestra','encargada','admin'))
  WITH CHECK (COALESCE(public.get_my_role(),'') IN ('directora','asistente','maestra','encargada','admin'));
CREATE POLICY "posts_parent_read" ON public.posts
  FOR SELECT TO authenticated
  USING (
    COALESCE(public.get_my_role(),'') = 'padre'
    AND (classroom_id IS NULL
      OR classroom_id IN (SELECT classroom_id FROM public.students WHERE parent_id = auth.uid() AND classroom_id IS NOT NULL))
  );
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.posts TO authenticated, service_role;
DO $$ BEGIN EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated', pg_get_serial_sequence('public.posts','id')); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- comments / likes
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='comments') THEN
    EXECUTE 'ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "comments_auth" ON public.comments';
    EXECUTE $p$ CREATE POLICY "comments_auth" ON public.comments FOR ALL TO authenticated USING (true) WITH CHECK (auth.uid() IS NOT NULL) $p$;
    EXECUTE 'GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.comments TO authenticated,service_role';
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='likes') THEN
    EXECUTE 'ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "likes_auth" ON public.likes';
    EXECUTE $p$ CREATE POLICY "likes_auth" ON public.likes FOR ALL TO authenticated USING (true) WITH CHECK (auth.uid() IS NOT NULL) $p$;
    EXECUTE 'GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.likes TO authenticated,service_role';
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 6. DAILY_LOGS
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

-- 7. CLASSROOM_DAILY_SCHEDULE
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

-- 8. TASKS
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tasks_staff_all"   ON public.tasks;
DROP POLICY IF EXISTS "tasks_parent_read" ON public.tasks;
DROP POLICY IF EXISTS "tasks_select"      ON public.tasks;
DROP POLICY IF EXISTS "tasks_insert"      ON public.tasks;
DROP POLICY IF EXISTS "tasks_update"      ON public.tasks;
DROP POLICY IF EXISTS "tasks_delete"      ON public.tasks;
DROP POLICY IF EXISTS "tasks_all"         ON public.tasks;
DROP POLICY IF EXISTS "tasks_read"        ON public.tasks;
CREATE POLICY "tasks_staff_all" ON public.tasks
  FOR ALL TO authenticated
  USING      (COALESCE(public.get_my_role(),'') IN ('directora','asistente','maestra','encargada','admin'))
  WITH CHECK (COALESCE(public.get_my_role(),'') IN ('directora','asistente','maestra','encargada','admin'));
CREATE POLICY "tasks_parent_read" ON public.tasks
  FOR SELECT TO authenticated
  USING (COALESCE(public.get_my_role(),'') = 'padre'
    AND classroom_id IN (SELECT classroom_id FROM public.students WHERE parent_id = auth.uid() AND classroom_id IS NOT NULL));
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tasks TO authenticated, service_role;
DO $$ BEGIN EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated', pg_get_serial_sequence('public.tasks','id')); EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='task_evidences') THEN
    EXECUTE 'ALTER TABLE public.task_evidences ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "te_staff_all"  ON public.task_evidences';
    EXECUTE 'DROP POLICY IF EXISTS "te_parent_own" ON public.task_evidences';
    EXECUTE $p$ CREATE POLICY "te_staff_all" ON public.task_evidences FOR ALL TO authenticated
      USING      (COALESCE(public.get_my_role(),'') IN ('directora','asistente','maestra','encargada','admin'))
      WITH CHECK (COALESCE(public.get_my_role(),'') IN ('directora','asistente','maestra','encargada','admin')) $p$;
    EXECUTE $p$ CREATE POLICY "te_parent_own" ON public.task_evidences FOR ALL TO authenticated
      USING (student_id IN (SELECT id FROM public.students WHERE parent_id = auth.uid()))
      WITH CHECK (student_id IN (SELECT id FROM public.students WHERE parent_id = auth.uid())) $p$;
    EXECUTE 'GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.task_evidences TO authenticated,service_role';
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 9. EVAL TABLES
DO $$
DECLARE t text;
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
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'eval RLS: %', SQLERRM; END $$;

-- 10. NOTIFICATIONS (optional)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='notifications') THEN
    EXECUTE 'ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "notifications_own" ON public.notifications';
    EXECUTE $p$ CREATE POLICY "notifications_own" ON public.notifications FOR ALL TO authenticated
      USING (user_id = auth.uid() OR COALESCE(public.get_my_role(),'') IN ('directora','admin','asistente'))
      WITH CHECK (true) $p$;
    EXECUTE 'GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.notifications TO authenticated,service_role';
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 11. CLASSROOM_ROUTINE_SETTINGS (optional)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='classroom_routine_settings') THEN
    EXECUTE 'ALTER TABLE public.classroom_routine_settings ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "crs_staff_all"   ON public.classroom_routine_settings';
    EXECUTE 'DROP POLICY IF EXISTS "crs_parent_read" ON public.classroom_routine_settings';
    EXECUTE $p$ CREATE POLICY "crs_staff_all" ON public.classroom_routine_settings FOR ALL TO authenticated
      USING      (COALESCE(public.get_my_role(),'') IN ('directora','asistente','maestra','encargada','admin'))
      WITH CHECK (COALESCE(public.get_my_role(),'') IN ('directora','asistente','maestra','encargada','admin')) $p$;
    EXECUTE $p$ CREATE POLICY "crs_parent_read" ON public.classroom_routine_settings FOR SELECT TO authenticated
      USING (COALESCE(public.get_my_role(),'') = 'padre') $p$;
    EXECUTE 'GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.classroom_routine_settings TO authenticated,service_role';
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- VERIFICATION
SELECT tablename, count(*) AS policies
FROM pg_policies
WHERE tablename IN (
  'profiles','students','attendance','messages','posts',
  'daily_logs','classroom_daily_schedule','tasks',
  'notifications','classroom_routine_settings'
)
GROUP BY tablename ORDER BY tablename;

SELECT
  public.get_my_role()                          AS mi_rol,
  (SELECT count(*) FROM public.students)        AS total_estudiantes,
  (SELECT count(*) FROM public.posts)           AS total_posts,
  (SELECT count(*) FROM public.attendance)      AS total_asistencias,
  (SELECT count(*) FROM public.tasks)           AS total_tareas;

SELECT '✅ 25_fix_all_rls.sql aplicado correctamente.' AS resultado;

-- ══════════════════════════════════════════════════════════════
-- 12. STUDENT_PREREGISTRATIONS  (inscripciones no visibles)
-- ══════════════════════════════════════════════════════════════
ALTER TABLE public.student_preregistrations ENABLE ROW LEVEL SECURITY;

-- Drop EVERY known policy variant to start clean
DROP POLICY IF EXISTS "prereg_anon_insert_only"          ON public.student_preregistrations;
DROP POLICY IF EXISTS "prereg_authenticated_insert_only" ON public.student_preregistrations;
DROP POLICY IF EXISTS "prereg_staff_select"              ON public.student_preregistrations;
DROP POLICY IF EXISTS "prereg_staff_update"              ON public.student_preregistrations;
DROP POLICY IF EXISTS "prereg_staff_delete"              ON public.student_preregistrations;
DROP POLICY IF EXISTS "prereg_public_insert"             ON public.student_preregistrations;
DROP POLICY IF EXISTS "prereg_staff_all"                 ON public.student_preregistrations;
DROP POLICY IF EXISTS "preregistrations_insert_public"   ON public.student_preregistrations;
DROP POLICY IF EXISTS "preregistrations_select_staff"    ON public.student_preregistrations;
DROP POLICY IF EXISTS "preregistrations_update_staff"    ON public.student_preregistrations;
DROP POLICY IF EXISTS "Permitir insercion publica"       ON public.student_preregistrations;
DROP POLICY IF EXISTS "Permitir lectura staff"           ON public.student_preregistrations;

-- Anyone (anon or authenticated) can INSERT (public registration form)
CREATE POLICY "prereg_anon_insert_only" ON public.student_preregistrations
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "prereg_authenticated_insert_only" ON public.student_preregistrations
  FOR INSERT TO authenticated WITH CHECK (true);

-- Staff SELECT — uses SECURITY DEFINER get_my_role() so no circular RLS
CREATE POLICY "prereg_staff_select" ON public.student_preregistrations
  FOR SELECT TO authenticated
  USING (
    COALESCE(public.get_my_role(), '') IN ('directora','asistente','admin','encargada')
  );

-- Staff UPDATE
CREATE POLICY "prereg_staff_update" ON public.student_preregistrations
  FOR UPDATE TO authenticated
  USING      (COALESCE(public.get_my_role(), '') IN ('directora','asistente','admin','encargada'))
  WITH CHECK (COALESCE(public.get_my_role(), '') IN ('directora','asistente','admin','encargada'));

-- Staff DELETE
CREATE POLICY "prereg_staff_delete" ON public.student_preregistrations
  FOR DELETE TO authenticated
  USING (COALESCE(public.get_my_role(), '') IN ('directora','asistente','admin','encargada'));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.student_preregistrations TO authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.student_preregistrations TO anon;
DO $$ BEGIN
  EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated, anon',
    pg_get_serial_sequence('public.student_preregistrations','id'));
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Verify immediately
SELECT
  (SELECT count(*) FROM public.student_preregistrations)               AS total_preregistraciones,
  (SELECT count(*) FROM public.student_preregistrations WHERE status='pending') AS pendientes,
  public.get_my_role() AS mi_rol;

SELECT 'student_preregistrations RLS fixed!' AS resultado;
