-- ============================================================
-- 27_fix_maestra_visibility.sql — Colegio Montessori Sonrisas Creativas
-- Problema: en el Panel Maestra no se ven las áreas/actividades del
-- boletín (selects del modal "Nueva Tarea" y pestaña Actividades del
-- Centro de Calificaciones) ni las tareas del aula.
--
-- Causa: RLS habilitado en las tablas eval_* / tasks / task_evidences
-- sin políticas que incluyan al rol "maestra" (deny-all silencioso:
-- PostgREST devuelve 0 filas sin error).
--
-- Este script es más quirúrgico que 25_fix_all_rls.sql: sólo toca las
-- tablas involucradas en el boletín, las tareas y las actividades
-- escolares. Es 100% RE-EJECUTABLE.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- 0. get_my_role() SECURITY DEFINER (evita el RLS circular)
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT COALESCE(role, '') FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated, anon;

-- 1. Tablas de ESTRUCTURA del boletín: lectura abierta a cualquier
--    usuario autenticado (el padre necesita ver nombres de áreas y
--    actividades), escritura sólo para personal.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'eval_evaluations','eval_areas','eval_competencies','eval_periods',
    'eval_modules','eval_activities','eval_formulas'
  ] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS "eval_%s_staff_all" ON public.%I', t, t);
      EXECUTE format('DROP POLICY IF EXISTS "staff_all_%s"    ON public.%I', t, t);
      EXECUTE format('DROP POLICY IF EXISTS "eval_%s_read"     ON public.%I', t, t);
      EXECUTE format('DROP POLICY IF EXISTS "eval_%s_staff_write" ON public.%I', t, t);
      EXECUTE format($p$
        CREATE POLICY "eval_%s_read" ON public.%I
          FOR SELECT TO authenticated USING (true)
      $p$, t, t);
      EXECUTE format($p$
        CREATE POLICY "eval_%s_staff_write" ON public.%I
          FOR INSERT, UPDATE, DELETE TO authenticated
          USING (COALESCE(public.get_my_role(),'''') IN
            (''directora'',''asistente'',''maestra'',''encargada'',''admin''))
          WITH CHECK (COALESCE(public.get_my_role(),'''') IN
            (''directora'',''asistente'',''maestra'',''encargada'',''admin''))
      $p$, t, t);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated, service_role', t);
    END IF;
  END LOOP;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'eval estructura: %', SQLERRM; END $$;

-- 2. Tablas de NOTAS del boletín: lectura/escritura del personal
--    (la política "parent_read_*" de 10_fixes.sql se conserva).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'eval_scores','eval_evidences','eval_area_notes',
    'eval_score_history','eval_boleta_notes'
  ] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS "staff_all_%s" ON public.%I', t, t);
      EXECUTE format($p$
        CREATE POLICY "staff_all_%s" ON public.%I
          FOR ALL TO authenticated
          USING (COALESCE(public.get_my_role(),'''') IN
            (''directora'',''asistente'',''maestra'',''encargada'',''admin''))
          WITH CHECK (COALESCE(public.get_my_role(),'''') IN
            (''directora'',''asistente'',''maestra'',''encargada'',''admin''))
      $p$, t, t);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated, service_role', t);
    END IF;
  END LOOP;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'eval notas: %', SQLERRM; END $$;

-- 3. TASKS + TASK_EVIDENCES: el personal (incluye maestra) gestiona las
--    tareas; los padres leen las tareas del aula de sus hijos.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='tasks') THEN
    EXECUTE 'ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "tasks_staff_all"   ON public.tasks';
    EXECUTE 'DROP POLICY IF EXISTS "tasks_parent_read" ON public.tasks';
    EXECUTE $p$ CREATE POLICY "tasks_staff_all" ON public.tasks
      FOR ALL TO authenticated
      USING (COALESCE(public.get_my_role(),'''') IN (''directora'',''asistente'',''maestra'',''encargada'',''admin''))
      WITH CHECK (COALESCE(public.get_my_role(),'''') IN (''directora'',''asistente'',''maestra'',''encargada'',''admin'')) $p$;
    EXECUTE $p$ CREATE POLICY "tasks_parent_read" ON public.tasks
      FOR SELECT TO authenticated
      USING (COALESCE(public.get_my_role(),'''') = ''padre''
        AND classroom_id IN (SELECT classroom_id FROM public.students WHERE parent_id = auth.uid() AND classroom_id IS NOT NULL)) $p$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tasks TO authenticated, service_role';
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'tasks: %', SQLERRM; END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='task_evidences') THEN
    EXECUTE 'ALTER TABLE public.task_evidences ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "te_staff_all"  ON public.task_evidences';
    EXECUTE 'DROP POLICY IF EXISTS "te_parent_own" ON public.task_evidences';
    EXECUTE $p$ CREATE POLICY "te_staff_all" ON public.task_evidences
      FOR ALL TO authenticated
      USING (COALESCE(public.get_my_role(),'''') IN (''directora'',''asistente'',''maestra'',''encargada'',''admin''))
      WITH CHECK (COALESCE(public.get_my_role(),'''') IN (''directora'',''asistente'',''maestra'',''encargada'',''admin'')) $p$;
    EXECUTE $p$ CREATE POLICY "te_parent_own" ON public.task_evidences
      FOR ALL TO authenticated
      USING (student_id IN (SELECT id FROM public.students WHERE parent_id = auth.uid()))
      WITH CHECK (student_id IN (SELECT id FROM public.students WHERE parent_id = auth.uid())) $p$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.task_evidences TO authenticated, service_role';
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'task_evidences: %', SQLERRM; END $$;

-- 4. boletin_ensure_structure: la maestra debe poder ejecutarla para
--    que existan áreas/períodos/módulos por defecto.
DO $$ BEGIN
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.boletin_ensure_structure(bigint) TO authenticated';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 5. ACTIVIDADES ESCOLARES (sección "Actividades" del panel):
--    la maestra ve las suyas, las de su aula y las de todo el centro.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='school_activities') THEN
    EXECUTE 'ALTER TABLE public.school_activities ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS school_activities_select_maestra ON public.school_activities';
    EXECUTE $p$ CREATE POLICY school_activities_select_maestra
      ON public.school_activities FOR SELECT TO authenticated
      USING (
        COALESCE(public.get_my_role(),'''') IN (''directora'',''asistente'',''admin'',''encargada'')
        OR EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND p.role = ''maestra''
            AND (
                 school_activities.assigned_to = auth.uid()
              OR school_activities.assigned_teacher_id = auth.uid()
              OR school_activities.target_audience = ''todo_el_centro''
              OR school_activities.classroom_id IS NULL
              OR school_activities.classroom_id IN (
                   SELECT c.id FROM public.classrooms c WHERE c.teacher_id = auth.uid())
            )
        )
      ) $p$;
    EXECUTE 'DROP POLICY IF EXISTS school_activities_select_padre ON public.school_activities';
    EXECUTE $p$ CREATE POLICY school_activities_select_padre
      ON public.school_activities FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles p
          JOIN public.students s ON s.parent_id = p.id
          WHERE p.id = auth.uid()
            AND p.role = ''padre''
            AND (
                 s.classroom_id = school_activities.classroom_id
              OR school_activities.target_audience IN (''todo_el_centro'')
            )
        )
        AND school_activities.status IN (''published'',''in_progress'',''completed'')
      ) $p$;
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'school_activities: %', SQLERRM; END $$;

-- ══════════════════════════════════════════════════════════════
-- VERIFICACIÓN — revisar el resultado en el SQL Editor.
-- (auth.uid() es NULL aquí, por eso mi_rol sale vacío; lo importante
--  es que cada tabla tenga al menos 1 política y que eval_areas,
--  eval_activities y tasks tengan filas visibles.)
-- ══════════════════════════════════════════════════════════════
SELECT tablename, count(*) AS policies
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'eval_evaluations','eval_areas','eval_periods','eval_modules',
    'eval_activities','eval_scores','tasks','task_evidences',
    'school_activities'
  )
GROUP BY tablename ORDER BY tablename;

DO $$
DECLARE t text; n bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'eval_evaluations','eval_areas','eval_activities','tasks','school_activities'
  ] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
      RAISE NOTICE 'filas de %: %', t, n;
    ELSE
      RAISE NOTICE 'tabla % no existe', t;
    END IF;
  END LOOP;
END $$;

SELECT '✅ 27_fix_maestra_visibility.sql aplicado correctamente.' AS resultado;
