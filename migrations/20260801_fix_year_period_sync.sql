-- ============================================================
-- 20260801_fix_year_period_sync.sql
-- Sincronizacion Ano Escolar <-> Periodo Escolar (calificaciones)
--
-- Problemas que corrige:
--   1. get_active_period / get_current_period devolvian periodos
--      de CUALQUIER ano (incluso anos cerrados o no vigentes).
--   2. activate_period podia activar periodos de anos cerrados,
--      sin validar pertenencia al ano vigente, y dejaba la columna
--      classrooms.active_period_id desincronizada.
--   3. close_period calculaba promedios solo por classroom_id
--      (rompia con el modelo de periodos globales por ano) y no
--      usaba period_id de la tarea (proxy por created_at).
--   4. tasks / attendance / posts / grades / incidents / logs
--      se creaban SIN school_year_id / period_id, por lo que los
--      triggers de regla (periodo cerrado / ano cerrado) se
--      omitian silenciosamente (IF ... IS NOT NULL).
--   5. create_school_year_with_periods creaba un periodo por AULA
--      (modelo viejo) y ademas consultaba classrooms.is_active
--      que NO existe en la tabla (rompia al ejecutarse).
--   6. No habia validacion de fechas de periodo contra su ano.
--   7. task_evidences no tenia school_year_id / period_id pero el
--      trigger trg_enforce_period_task_evidences ya usaba NEW.period_id
--      (error de runtime: "record has no field period_id" -> rompia
--      el proceso de calificacion de tareas).
--
-- Idempotente: seguro de re-ejecutar.
-- ============================================================

-- ============================================================
-- 0. COLUMNAS DEFENSIVAS (no-op si ya existen)
--    La mayoria ya fue agregada por 20260723_school_year_engine,
--    pero schema.sql v4.0 NO las incluye. Esta seccion garantiza
--    que la migracion corra tambien sobre una BD creada solo con
--    schema.sql. task_evidences es la unica que NUNCA tuvo estas
--    columnas (bug existente).
-- ============================================================
ALTER TABLE public.school_years ADD COLUMN IF NOT EXISTS period_model text DEFAULT 'trimestres';
ALTER TABLE public.school_years ADD COLUMN IF NOT EXISTS num_periods int DEFAULT 3;
ALTER TABLE public.school_years ADD COLUMN IF NOT EXISTS closed_at timestamp with time zone;
ALTER TABLE public.school_years ADD COLUMN IF NOT EXISTS closed_by uuid REFERENCES public.profiles(id);

ALTER TABLE public.periods ADD COLUMN IF NOT EXISTS sort_order int DEFAULT 1;
ALTER TABLE public.periods ADD COLUMN IF NOT EXISTS closed_at timestamp with time zone;
ALTER TABLE public.periods ADD COLUMN IF NOT EXISTS closed_by uuid REFERENCES public.profiles(id);
ALTER TABLE public.periods ADD COLUMN IF NOT EXISTS is_blocked boolean DEFAULT false;

ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS school_year_id bigint REFERENCES public.school_years(id) ON DELETE SET NULL;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS period_id bigint REFERENCES public.periods(id) ON DELETE SET NULL;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS school_year_id bigint REFERENCES public.school_years(id) ON DELETE SET NULL;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS school_year_id bigint REFERENCES public.school_years(id) ON DELETE SET NULL;
ALTER TABLE public.daily_logs ADD COLUMN IF NOT EXISTS school_year_id bigint REFERENCES public.school_years(id) ON DELETE SET NULL;
ALTER TABLE public.daily_logs ADD COLUMN IF NOT EXISTS period_id bigint REFERENCES public.periods(id) ON DELETE SET NULL;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS school_year_id bigint REFERENCES public.school_years(id) ON DELETE SET NULL;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS period_id bigint REFERENCES public.periods(id) ON DELETE SET NULL;
ALTER TABLE public.classroom_events ADD COLUMN IF NOT EXISTS school_year_id bigint REFERENCES public.school_years(id) ON DELETE SET NULL;
ALTER TABLE public.nap_sessions ADD COLUMN IF NOT EXISTS school_year_id bigint REFERENCES public.school_years(id) ON DELETE SET NULL;
ALTER TABLE public.nap_sessions ADD COLUMN IF NOT EXISTS period_id bigint REFERENCES public.periods(id) ON DELETE SET NULL;
ALTER TABLE public.task_evidences ADD COLUMN IF NOT EXISTS school_year_id bigint REFERENCES public.school_years(id) ON DELETE SET NULL;
ALTER TABLE public.task_evidences ADD COLUMN IF NOT EXISTS period_id bigint REFERENCES public.periods(id) ON DELETE SET NULL;
ALTER TABLE public.student_enrollments ADD COLUMN IF NOT EXISTS level_at_enrollment text;
ALTER TABLE public.student_enrollments ADD COLUMN IF NOT EXISTS promoted_from_enrollment_id bigint REFERENCES public.student_enrollments(id);

CREATE INDEX IF NOT EXISTS idx_attendance_year_period ON public.attendance(school_year_id, period_id) WHERE period_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_task_evidences_year_period ON public.task_evidences(school_year_id, period_id) WHERE period_id IS NOT NULL;

-- ============================================================
-- 1. HELPER: ano escolar vigente (unica fuente de verdad)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_active_school_year_id()
RETURNS bigint LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT id FROM public.school_years
  WHERE is_current = true AND deleted_at IS NULL
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_active_school_year_id() TO authenticated;

-- ============================================================
-- 2. get_active_period ESTRICTO (solo periodo del ano vigente)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_active_period(p_classroom_id bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_year_id bigint;
  v_period periods%ROWTYPE;
BEGIN
  v_year_id := public.get_active_school_year_id();
  IF v_year_id IS NULL THEN
    RETURN jsonb_build_object('found', false, 'status', 'no_school_year');
  END IF;

  IF p_classroom_id IS NOT NULL THEN
    SELECT * INTO v_period FROM public.periods
    WHERE is_active = true AND school_year_id = v_year_id
      AND (classroom_id = p_classroom_id OR classroom_id IS NULL)
    ORDER BY (classroom_id IS NULL) ASC, created_at DESC
    LIMIT 1;
  END IF;
  IF NOT FOUND THEN
    SELECT * INTO v_period FROM public.periods
    WHERE is_active = true AND school_year_id = v_year_id
    ORDER BY created_at DESC LIMIT 1;
  END IF;
  IF NOT FOUND THEN
    SELECT * INTO v_period FROM public.periods
    WHERE status = 'open' AND school_year_id = v_year_id
    ORDER BY created_at DESC LIMIT 1;
  END IF;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false, 'status', 'no_period', 'school_year_id', v_year_id);
  END IF;

  RETURN jsonb_build_object(
    'found', true, 'id', v_period.id, 'name', v_period.name,
    'status', v_period.status, 'is_active', v_period.is_active,
    'start_date', v_period.start_date, 'end_date', v_period.end_date,
    'classroom_id', v_period.classroom_id, 'school_year_id', v_period.school_year_id,
    'is_blocked', COALESCE(v_period.is_blocked, false)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_active_period(bigint) TO authenticated;

-- ============================================================
-- 3. get_current_period ESTRICTO
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_current_period()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_year_id bigint;
  v_period periods%ROWTYPE;
BEGIN
  v_year_id := public.get_active_school_year_id();
  IF v_year_id IS NULL THEN
    RETURN jsonb_build_object('found', false, 'status', 'no_school_year');
  END IF;

  SELECT * INTO v_period FROM public.periods
  WHERE is_active = true AND school_year_id = v_year_id
  ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN
    SELECT * INTO v_period FROM public.periods
    WHERE status = 'open' AND school_year_id = v_year_id
    ORDER BY created_at DESC LIMIT 1;
  END IF;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false, 'status', 'no_period', 'school_year_id', v_year_id);
  END IF;

  RETURN jsonb_build_object(
    'found', true, 'id', v_period.id, 'name', v_period.name,
    'status', v_period.status, 'is_active', v_period.is_active,
    'start_date', v_period.start_date, 'end_date', v_period.end_date,
    'classroom_id', v_period.classroom_id, 'school_year_id', v_period.school_year_id,
    'is_blocked', COALESCE(v_period.is_blocked, false)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_current_period() TO authenticated;

-- ============================================================
-- 4. activate_period CON REGLAS
-- Permite:   directora/admin, periodo del ano vigente, ano no cerrado.
-- Prohibe:   activar periodo cerrado, periodo de ano no vigente o cerrado,
--            o activar si no existe ano escolar vigente.
-- ============================================================
CREATE OR REPLACE FUNCTION public.activate_period(p_period_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid; v_role text; v_period periods%ROWTYPE;
  v_old_id bigint; v_year_id bigint; v_year school_years%ROWTYPE;
BEGIN
  v_user_id := auth.uid();
  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
  IF v_role NOT IN ('directora','admin') THEN
    RETURN jsonb_build_object('error', 'Solo la directora puede activar periodos');
  END IF;

  SELECT * INTO v_period FROM public.periods WHERE id = p_period_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Periodo no encontrado'); END IF;
  IF v_period.status = 'closed' OR COALESCE(v_period.is_blocked, false) = true THEN
    RETURN jsonb_build_object('error', 'No se puede activar un periodo cerrado');
  END IF;

  v_year_id := public.get_active_school_year_id();
  IF v_year_id IS NULL THEN
    RETURN jsonb_build_object('error', 'No hay ano escolar vigente. Activa el ano escolar primero.');
  END IF;

  IF v_period.school_year_id IS NULL THEN
    IF v_period.start_date <= (SELECT end_date FROM public.school_years WHERE id = v_year_id)
       AND v_period.end_date >= (SELECT start_date FROM public.school_years WHERE id = v_year_id) THEN
      UPDATE public.periods SET school_year_id = v_year_id WHERE id = p_period_id;
      v_period.school_year_id := v_year_id;
    ELSE
      RETURN jsonb_build_object('error', 'El periodo no pertenece al ano escolar vigente.');
    END IF;
  END IF;

  IF v_period.school_year_id <> v_year_id THEN
    RETURN jsonb_build_object('error',
      'El periodo pertenece a otro ano escolar. Solo se puede activar un periodo del ano vigente.');
  END IF;

  SELECT * INTO v_year FROM public.school_years WHERE id = v_year_id;
  IF v_year.status = 'closed' THEN
    RETURN jsonb_build_object('error', 'No se puede activar un periodo de un ano escolar cerrado');
  END IF;

  SELECT id INTO v_old_id FROM public.periods WHERE is_active = true LIMIT 1;
  UPDATE public.periods SET is_active = false WHERE is_active = true;
  UPDATE public.periods SET is_active = true, status = 'open', is_blocked = false WHERE id = p_period_id;

  UPDATE public.classrooms SET active_period_id = NULL;
  IF v_period.classroom_id IS NOT NULL THEN
    UPDATE public.classrooms SET active_period_id = p_period_id WHERE id = v_period.classroom_id;
  END IF;

  DELETE FROM public.school_year_processes
  WHERE school_year_id = v_year_id AND process_type = 'period_open';
  INSERT INTO public.school_year_processes (school_year_id, process_type, label, status, executed_at, executed_by)
  VALUES (v_year_id, 'period_open', 'Periodo activado: ' || v_period.name, 'completed', now(), v_user_id);

  INSERT INTO public.audit_logs (user_id, action, payload, created_at)
  VALUES (v_user_id, 'period.activated', jsonb_build_object(
    'period_id', p_period_id, 'period_name', v_period.name,
    'old_period_id', v_old_id, 'school_year_id', v_year_id), now());

  RETURN jsonb_build_object('success', true, 'period_id', p_period_id,
    'period_name', v_period.name, 'old_period_id', v_old_id, 'school_year_id', v_year_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', 'No se pudo activar el periodo');
END;
$$;
GRANT EXECUTE ON FUNCTION public.activate_period(bigint) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.activate_period(bigint) FROM anon;

-- ============================================================
-- 5. close_period CORREGIDO
--    - Soporta periodos globales (por ano) y legados (por aula).
--    - Promedios de tareas usan period_id de la tarea (y como
--      fallback el created_at para tareas legadas sin periodo).
--    - Bloquea cerrar periodos de un ano escolar ya cerrado.
-- ============================================================
CREATE OR REPLACE FUNCTION public.close_period(p_period_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_period periods%ROWTYPE; v_user_id uuid; v_role text; v_student record;
  v_avg numeric(5,2); v_task_avg numeric(5,2); v_formal_avg numeric(5,2); v_level text;
  v_cards_updated int := 0; v_comp_summary jsonb; v_areas_summary jsonb;
  v_year school_years%ROWTYPE;
BEGIN
  v_user_id := auth.uid();
  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
  IF v_role NOT IN ('directora','admin') THEN RETURN jsonb_build_object('error', 'Solo la directora puede cerrar periodos'); END IF;

  SELECT * INTO v_period FROM public.periods WHERE id = p_period_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Periodo no encontrado'); END IF;
  IF v_period.status = 'closed' THEN RETURN jsonb_build_object('error', 'El periodo ya esta cerrado'); END IF;

  IF v_period.school_year_id IS NOT NULL THEN
    SELECT * INTO v_year FROM public.school_years WHERE id = v_period.school_year_id;
    IF FOUND AND v_year.status = 'closed' THEN
      RETURN jsonb_build_object('error', 'No se puede cerrar un periodo de un ano escolar cerrado');
    END IF;
  END IF;

  FOR v_student IN
    SELECT DISTINCT se.student_id AS student_id, se.classroom_id
    FROM public.student_enrollments se
    JOIN public.students s ON s.id = se.student_id
    WHERE s.is_active = true
      AND se.status IN ('activo','inscrito','reinscrito','admitido')
      AND (v_period.school_year_id IS NULL OR se.school_year_id = v_period.school_year_id)
      AND (v_period.classroom_id IS NULL OR se.classroom_id = v_period.classroom_id)
  LOOP
    SELECT ROUND(AVG(CASE
        WHEN te.numeric_score IS NOT NULL AND te.numeric_score >= 0 THEN te.numeric_score
        WHEN te.stars IS NOT NULL AND te.stars > 0 THEN te.stars * 20
        WHEN te.grade_letter = 'A' THEN 95 WHEN te.grade_letter = 'B' THEN 85
        WHEN te.grade_letter = 'C' THEN 75 WHEN te.grade_letter = 'D' THEN 60
        WHEN te.grade_letter = 'E' THEN 40 ELSE NULL END), 2) INTO v_task_avg
    FROM public.task_evidences te
    JOIN public.tasks t ON t.id = te.task_id
    WHERE te.student_id = v_student.student_id
      AND te.status = 'graded'
      AND (
        te.period_id = p_period_id
        OR (te.period_id IS NULL AND t.period_id = p_period_id)
        OR (te.period_id IS NULL AND t.period_id IS NULL
            AND t.created_at BETWEEN v_period.start_date AND v_period.end_date + INTERVAL '1 day')
      )
      AND (v_period.classroom_id IS NULL OR t.classroom_id = v_period.classroom_id);

    SELECT ROUND(AVG(CASE
        WHEN g.numeric_score IS NOT NULL AND g.numeric_score >= 0 THEN g.numeric_score
        WHEN g.score IS NOT NULL AND g.score > 0 THEN g.score * 20 ELSE NULL END), 2) INTO v_formal_avg
    FROM public.grades g
    WHERE g.student_id = v_student.student_id
      AND (g.period_id = p_period_id OR (g.period_id IS NULL
           AND g.created_at BETWEEN v_period.start_date AND v_period.end_date + INTERVAL '1 day'));

    IF v_task_avg IS NOT NULL AND v_formal_avg IS NOT NULL THEN
      v_avg := ROUND((v_task_avg * 0.6) + (v_formal_avg * 0.4), 2);
    ELSIF v_task_avg IS NOT NULL THEN v_avg := v_task_avg;
    ELSIF v_formal_avg IS NOT NULL THEN v_avg := v_formal_avg;
    ELSE v_avg := NULL; END IF;

    v_level := CASE
      WHEN v_avg IS NULL THEN 'Sin calificar'
      WHEN v_avg >= 95 THEN 'Excelente'
      WHEN v_avg >= 85 THEN 'Muy Bueno'
      WHEN v_avg >= 75 THEN 'Bueno'
      WHEN v_avg >= 60 THEN 'Aceptable'
      WHEN v_avg >= 50 THEN 'Requiere Mejoras'
      ELSE 'Bajo Desempeno' END;

    SELECT COALESCE(jsonb_object_agg(aa.name, jsonb_build_object('avg_stars', area_avg, 'icon', aa.icon)), '{}'::jsonb)
      INTO v_areas_summary
    FROM (
      SELECT c2.area_id, ROUND(AVG(cs2.stars), 1) AS area_avg
      FROM public.competency_scores cs2
      JOIN public.competencies c2 ON c2.id = cs2.competency_id
      WHERE cs2.student_id = v_student.student_id AND cs2.period_id = p_period_id
      GROUP BY c2.area_id
    ) sub
    JOIN public.academic_areas aa ON aa.id = sub.area_id;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'competency', c3.name, 'area', aa2.name, 'stars', cs3.stars, 'level', cs3.level)), '[]'::jsonb)
      INTO v_comp_summary
    FROM public.competency_scores cs3
    JOIN public.competencies c3 ON c3.id = cs3.competency_id
    JOIN public.academic_areas aa2 ON aa2.id = c3.area_id
    WHERE cs3.student_id = v_student.student_id AND cs3.period_id = p_period_id;

    INSERT INTO public.report_cards (
      student_id, classroom_id, period_id, school_year_id,
      task_avg, formal_avg, final_score, level,
      competency_summary, areas_summary, created_at
    ) VALUES (
      v_student.student_id, v_student.classroom_id, p_period_id, v_period.school_year_id,
      v_task_avg, v_formal_avg, v_avg, v_level, v_comp_summary, v_areas_summary, now()
    )
    ON CONFLICT (student_id, period_id) DO UPDATE SET
      task_avg = EXCLUDED.task_avg, formal_avg = EXCLUDED.formal_avg,
      final_score = EXCLUDED.final_score, level = EXCLUDED.level,
      competency_summary = EXCLUDED.competency_summary, areas_summary = EXCLUDED.areas_summary,
      school_year_id = EXCLUDED.school_year_id;

    v_cards_updated := v_cards_updated + 1;
  END LOOP;

  UPDATE public.periods SET status = 'closed', is_active = false, is_blocked = true,
    closed_at = now(), closed_by = v_user_id WHERE id = p_period_id;
  UPDATE public.classrooms SET active_period_id = NULL WHERE active_period_id = p_period_id;

  IF v_period.school_year_id IS NOT NULL THEN
    DELETE FROM public.school_year_processes
    WHERE school_year_id = v_period.school_year_id AND process_type = 'period_close';
    INSERT INTO public.school_year_processes (school_year_id, process_type, label, status, executed_at, executed_by)
    VALUES (v_period.school_year_id, 'period_close', 'Periodo cerrado: ' || v_period.name, 'completed', now(), v_user_id);
  END IF;

  INSERT INTO public.audit_logs (user_id, action, payload, created_at)
  VALUES (v_user_id, 'period.closed', jsonb_build_object(
    'period_id', p_period_id, 'cards_generated', v_cards_updated), now());

  RETURN jsonb_build_object('success', true, 'period_id', p_period_id, 'cards_generated', v_cards_updated);
END;
$$;
GRANT EXECUTE ON FUNCTION public.close_period(bigint) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.close_period(bigint) FROM anon;

-- ============================================================
-- 6. AUTO-SCOPE: asignar school_year_id / period_id automaticamente
--    cuando la app no los envio. Corre ANTES de los triggers de
--    regla (nombre 'aaa_...' ordena primero) para que las reglas
--    (periodo cerrado / ano cerrado) SI se apliquen.
-- ============================================================

-- 6a. Ano escolar (tablas con school_year_id)
CREATE OR REPLACE FUNCTION public.auto_scope_school_year()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'task_evidences' THEN
    IF NEW.school_year_id IS NULL THEN
      SELECT school_year_id INTO NEW.school_year_id FROM public.tasks WHERE id = NEW.task_id;
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.school_year_id IS NULL THEN
    NEW.school_year_id := public.get_active_school_year_id();
  END IF;
  RETURN NEW;
END;
$$;

-- 6b. Periodo (tablas con period_id): asigna el periodo abierto del
--     ano vigente que cubre la fecha relevante (entrega/registro).
CREATE OR REPLACE FUNCTION public.auto_scope_period()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_period periods%ROWTYPE; v_scope_date date; v_year_id bigint;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF NEW.period_id IS NOT NULL THEN RETURN NEW; END IF;

  IF TG_TABLE_NAME = 'task_evidences' THEN
    SELECT period_id INTO NEW.period_id FROM public.tasks WHERE id = NEW.task_id;
    RETURN NEW;
  END IF;

  v_year_id := COALESCE(NEW.school_year_id, public.get_active_school_year_id());
  IF v_year_id IS NULL THEN RETURN NEW; END IF;

  CASE TG_TABLE_NAME
    WHEN 'tasks' THEN v_scope_date := COALESCE(NEW.due_date::date, current_date);
    WHEN 'attendance' THEN v_scope_date := COALESCE(NEW.date, current_date);
    WHEN 'daily_logs' THEN v_scope_date := COALESCE(NEW.date, current_date);
    ELSE v_scope_date := current_date;
  END CASE;

  SELECT * INTO v_period FROM public.periods
  WHERE school_year_id = v_year_id
    AND status = 'open'
    AND COALESCE(is_blocked, false) = false
    AND v_scope_date BETWEEN start_date AND end_date
  ORDER BY start_date LIMIT 1;

  IF FOUND THEN
    NEW.period_id := v_period.id;
  END IF;
  RETURN NEW;
END;
$$;

-- Triggers de ano escolar
DROP TRIGGER IF EXISTS aaa_trg_scope_year_tasks ON public.tasks;
CREATE TRIGGER aaa_trg_scope_year_tasks
  BEFORE INSERT OR UPDATE OF school_year_id ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.auto_scope_school_year();

DROP TRIGGER IF EXISTS aaa_trg_scope_year_attendance ON public.attendance;
CREATE TRIGGER aaa_trg_scope_year_attendance
  BEFORE INSERT OR UPDATE OF school_year_id ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.auto_scope_school_year();

DROP TRIGGER IF EXISTS aaa_trg_scope_year_posts ON public.posts;
CREATE TRIGGER aaa_trg_scope_year_posts
  BEFORE INSERT OR UPDATE OF school_year_id ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.auto_scope_school_year();

DROP TRIGGER IF EXISTS aaa_trg_scope_year_grades ON public.grades;
CREATE TRIGGER aaa_trg_scope_year_grades
  BEFORE INSERT OR UPDATE OF school_year_id ON public.grades
  FOR EACH ROW EXECUTE FUNCTION public.auto_scope_school_year();

DROP TRIGGER IF EXISTS aaa_trg_scope_year_daily_logs ON public.daily_logs;
CREATE TRIGGER aaa_trg_scope_year_daily_logs
  BEFORE INSERT OR UPDATE OF school_year_id ON public.daily_logs
  FOR EACH ROW EXECUTE FUNCTION public.auto_scope_school_year();

DROP TRIGGER IF EXISTS aaa_trg_scope_year_incidents ON public.incidents;
CREATE TRIGGER aaa_trg_scope_year_incidents
  BEFORE INSERT OR UPDATE OF school_year_id ON public.incidents
  FOR EACH ROW EXECUTE FUNCTION public.auto_scope_school_year();

DROP TRIGGER IF EXISTS aaa_trg_scope_year_events ON public.classroom_events;
CREATE TRIGGER aaa_trg_scope_year_events
  BEFORE INSERT OR UPDATE OF school_year_id ON public.classroom_events
  FOR EACH ROW EXECUTE FUNCTION public.auto_scope_school_year();

DROP TRIGGER IF EXISTS aaa_trg_scope_year_naps ON public.nap_sessions;
CREATE TRIGGER aaa_trg_scope_year_naps
  BEFORE INSERT OR UPDATE OF school_year_id ON public.nap_sessions
  FOR EACH ROW EXECUTE FUNCTION public.auto_scope_school_year();

DROP TRIGGER IF EXISTS aaa_trg_scope_year_task_evidences ON public.task_evidences;
CREATE TRIGGER aaa_trg_scope_year_task_evidences
  BEFORE INSERT OR UPDATE OF school_year_id ON public.task_evidences
  FOR EACH ROW EXECUTE FUNCTION public.auto_scope_school_year();

-- Triggers de periodo (solo tablas con period_id)
DROP TRIGGER IF EXISTS aaa_trg_scope_period_tasks ON public.tasks;
CREATE TRIGGER aaa_trg_scope_period_tasks
  BEFORE INSERT OR UPDATE OF period_id ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.auto_scope_period();

DROP TRIGGER IF EXISTS aaa_trg_scope_period_attendance ON public.attendance;
CREATE TRIGGER aaa_trg_scope_period_attendance
  BEFORE INSERT OR UPDATE OF period_id ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.auto_scope_period();

DROP TRIGGER IF EXISTS aaa_trg_scope_period_posts ON public.posts;
CREATE TRIGGER aaa_trg_scope_period_posts
  BEFORE INSERT OR UPDATE OF period_id ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.auto_scope_period();

DROP TRIGGER IF EXISTS aaa_trg_scope_period_grades ON public.grades;
CREATE TRIGGER aaa_trg_scope_period_grades
  BEFORE INSERT OR UPDATE OF period_id ON public.grades
  FOR EACH ROW EXECUTE FUNCTION public.auto_scope_period();

DROP TRIGGER IF EXISTS aaa_trg_scope_period_daily_logs ON public.daily_logs;
CREATE TRIGGER aaa_trg_scope_period_daily_logs
  BEFORE INSERT OR UPDATE OF period_id ON public.daily_logs
  FOR EACH ROW EXECUTE FUNCTION public.auto_scope_period();

DROP TRIGGER IF EXISTS aaa_trg_scope_period_incidents ON public.incidents;
CREATE TRIGGER aaa_trg_scope_period_incidents
  BEFORE INSERT OR UPDATE OF period_id ON public.incidents
  FOR EACH ROW EXECUTE FUNCTION public.auto_scope_period();

DROP TRIGGER IF EXISTS aaa_trg_scope_period_naps ON public.nap_sessions;
CREATE TRIGGER aaa_trg_scope_period_naps
  BEFORE INSERT OR UPDATE OF period_id ON public.nap_sessions
  FOR EACH ROW EXECUTE FUNCTION public.auto_scope_period();

DROP TRIGGER IF EXISTS aaa_trg_scope_period_task_evidences ON public.task_evidences;
CREATE TRIGGER aaa_trg_scope_period_task_evidences
  BEFORE INSERT OR UPDATE OF period_id ON public.task_evidences
  FOR EACH ROW EXECUTE FUNCTION public.auto_scope_period();

-- 6c. REGLA: solo un periodo activo a la vez (invariante global,
--     tambien para updates directos a la tabla periods)
CREATE OR REPLACE FUNCTION public.enforce_single_active_period()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_active = true THEN
    IF EXISTS (
      SELECT 1 FROM public.periods
      WHERE is_active = true AND id IS DISTINCT FROM NEW.id
    ) THEN
      RAISE EXCEPTION 'REGRA: Solo puede haber un periodo activo a la vez. Desactiva el periodo actual primero.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_single_active_period ON public.periods;
CREATE TRIGGER trg_single_active_period
  BEFORE INSERT OR UPDATE OF is_active ON public.periods
  FOR EACH ROW EXECUTE FUNCTION public.enforce_single_active_period();

-- ============================================================
-- 7. REGLA: validar fechas del periodo contra su ano escolar
--    Prohibe: start_date >= end_date, fechas fuera del ano,
--    o crear periodos en un ano cerrado.
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_period_valid_dates()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_year school_years%ROWTYPE;
BEGIN
  IF NEW.start_date >= NEW.end_date THEN
    RAISE EXCEPTION 'REGRA: La fecha de inicio del periodo debe ser anterior a la de fin.';
  END IF;
  IF NEW.school_year_id IS NOT NULL THEN
    SELECT * INTO v_year FROM public.school_years WHERE id = NEW.school_year_id;
    IF FOUND THEN
      IF NEW.start_date < v_year.start_date OR NEW.end_date > v_year.end_date THEN
        RAISE EXCEPTION 'REGRA: Las fechas del periodo deben estar dentro del ano escolar (%)', v_year.name;
      END IF;
      IF v_year.status = 'closed' THEN
        RAISE EXCEPTION 'REGRA: No se pueden crear periodos en un ano escolar cerrado.';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_period_dates ON public.periods;
CREATE TRIGGER trg_enforce_period_dates
  BEFORE INSERT OR UPDATE ON public.periods
  FOR EACH ROW EXECUTE FUNCTION public.enforce_period_valid_dates();

-- ============================================================
-- 8. create_school_year_with_periods CORREGIDO
--    Modelo GLOBAL (un periodo por trimestre, SIN classroom_id).
--    No consulta classrooms.is_active (columna inexistente).
--    No marca periodos como activos (se activa explicitamente).
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_school_year_with_periods(
  p_name text, p_start_date date, p_end_date date,
  p_classroom_ids bigint[] DEFAULT NULL, p_num_periods int DEFAULT 3
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid; v_role text; v_year_id bigint;
  v_total_days int; v_period_days int; v_period_start date; v_period_end date; v_period_name text;
  v_period_names text[] := ARRAY['1er Trimestre','2do Trimestre','3er Trimestre','4to Trimestre'];
  v_created_periods int := 0;
BEGIN
  v_user_id := auth.uid();
  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
  IF v_role NOT IN ('directora','admin') THEN
    RETURN jsonb_build_object('error', 'Solo la directora puede crear anos escolares');
  END IF;
  IF p_start_date >= p_end_date THEN
    RETURN jsonb_build_object('error', 'La fecha de inicio debe ser anterior a la fecha de fin');
  END IF;
  IF p_num_periods < 1 OR p_num_periods > 12 THEN
    RETURN jsonb_build_object('error', 'Numero de periodos debe estar entre 1 y 12');
  END IF;
  IF (p_end_date - p_start_date) < p_num_periods THEN
    RETURN jsonb_build_object('error', 'El ano escolar debe durar al menos 1 dia por periodo');
  END IF;

  INSERT INTO public.school_years (name, start_date, end_date, status)
  VALUES (p_name, p_start_date, p_end_date, 'upcoming')
  RETURNING id INTO v_year_id;

  v_total_days := p_end_date - p_start_date;
  v_period_days := v_total_days / p_num_periods;
  v_period_start := p_start_date;

  FOR i IN 1..p_num_periods LOOP
    v_period_end := v_period_start + (v_period_days || ' days')::interval - INTERVAL '1 day';
    IF i = p_num_periods THEN v_period_end := p_end_date; END IF;
    v_period_name := CASE
      WHEN p_num_periods = 12 THEN to_char(v_period_start, 'Month')
      WHEN p_num_periods = 2 THEN i || 'er Semestre'
      ELSE COALESCE(v_period_names[i], i || 'o Periodo')
    END;
    INSERT INTO public.periods (name, start_date, end_date, status, is_active, classroom_id, school_year_id, sort_order)
    VALUES (v_period_name || ' ' || p_name, v_period_start, v_period_end, 'open', false, NULL, v_year_id, i);
    v_created_periods := v_created_periods + 1;
    v_period_start := v_period_end + INTERVAL '1 day';
  END LOOP;

  INSERT INTO public.audit_logs (user_id, action, payload, created_at)
  VALUES (v_user_id, 'school_year.created', jsonb_build_object(
    'year_id', v_year_id, 'name', p_name, 'periods_created', v_created_periods), now());

  RETURN jsonb_build_object('success', true, 'school_year_id', v_year_id,
    'name', p_name, 'periods_created', v_created_periods);
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_school_year_with_periods(text, date, date, bigint[], int) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.create_school_year_with_periods(text, date, date, bigint[], int) FROM anon;

-- ============================================================
-- 9. create_new_school_year_with_promotion: desactivar periodos
--    activos previos antes de crear los del nuevo ano (evita dos
--    periodos activos simultaneos en tablas de datos).
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_new_school_year_with_promotion(
  p_name text,
  p_start_date date,
  p_end_date date,
  p_copy_classrooms boolean DEFAULT true,
  p_copy_payment_plans boolean DEFAULT true,
  p_promote_students boolean DEFAULT true,
  p_num_periods int DEFAULT 3,
  p_period_model text DEFAULT 'trimestres'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid; v_role text; v_new_year_id bigint;
  v_old_year_id bigint; v_classroom record; v_plan record;
  v_student record; v_enrollment record;
  v_new_classroom_id bigint; v_new_plan_id bigint;
  v_new_enrollment_id bigint; v_copied_classrooms int := 0;
  v_copied_plans int := 0; v_promoted_students int := 0;
  v_period_days int; v_period_start date; v_period_end date;
  v_period_names text[] := ARRAY['1er Trimestre','2do Trimestre','3er Trimestre','4to Trimestre','5to Trimestre','6to Trimestre'];
  v_period_name text; v_total_days int; v_created_periods int := 0;
  v_level_order text[] := ARRAY['Maternal','Infante','Parvulos','Pre-Kinder','Kinder','Preprimaria','1ro Primaria','2do Primaria','3ro Primaria','4to Primaria','5to Primaria','6to Primaria'];
  v_current_level_idx int; v_next_level text;
BEGIN
  v_user_id := auth.uid();
  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
  IF v_role NOT IN ('directora','admin') THEN
    RETURN jsonb_build_object('error', 'Solo la directora puede crear anos escolares');
  END IF;
  IF p_num_periods < 1 OR p_num_periods > 12 THEN
    RETURN jsonb_build_object('error', 'Numero de periodos debe estar entre 1 y 12');
  END IF;
  IF (p_end_date - p_start_date) < p_num_periods THEN
    RETURN jsonb_build_object('error', 'El ano escolar debe durar al menos 1 dia por periodo');
  END IF;

  SELECT id INTO v_old_year_id FROM public.school_years WHERE is_current = true LIMIT 1;
  IF v_old_year_id IS NULL THEN
    SELECT id INTO v_old_year_id FROM public.school_years WHERE status = 'active' ORDER BY start_date DESC LIMIT 1;
  END IF;

  IF v_old_year_id IS NOT NULL THEN
    UPDATE public.school_years SET is_current = false WHERE id = v_old_year_id;
  END IF;

  INSERT INTO public.school_years (name, start_date, end_date, status, is_current, period_model, num_periods)
  VALUES (p_name, p_start_date, p_end_date, 'active', true, p_period_model, p_num_periods)
  RETURNING id INTO v_new_year_id;

  UPDATE public.periods SET is_active = false WHERE is_active = true;
  UPDATE public.classrooms SET active_period_id = NULL;

  v_total_days := p_end_date - p_start_date;
  v_period_days := v_total_days / p_num_periods;
  v_period_start := p_start_date;
  FOR i IN 1..p_num_periods LOOP
    v_period_end := v_period_start + (v_period_days || ' days')::interval - INTERVAL '1 day';
    IF i = p_num_periods THEN v_period_end := p_end_date; END IF;
    v_period_name := CASE
      WHEN p_period_model = 'mensual' THEN to_char(v_period_start, 'Month')
      WHEN p_period_model = 'semestres' THEN i || 'er Semestre'
      ELSE COALESCE(v_period_names[i], i || 'o Periodo')
    END;
    INSERT INTO public.periods (name, start_date, end_date, status, is_active, school_year_id, sort_order)
    VALUES (v_period_name, v_period_start, v_period_end, 'open', (i = 1), v_new_year_id, i);
    v_created_periods := v_created_periods + 1;
    v_period_start := v_period_end + INTERVAL '1 day';
  END LOOP;

  IF p_copy_classrooms AND v_old_year_id IS NOT NULL THEN
    FOR v_classroom IN SELECT * FROM public.classrooms WHERE deleted_at IS NULL LOOP
      INSERT INTO public.classrooms (name, level, capacity, teacher_id, is_live)
      VALUES (v_classroom.name, v_classroom.level, v_classroom.capacity, v_classroom.teacher_id, false)
      RETURNING id INTO v_new_classroom_id;
      v_copied_classrooms := v_copied_classrooms + 1;
    END LOOP;
  END IF;

  IF p_copy_payment_plans AND v_old_year_id IS NOT NULL THEN
    FOR v_plan IN SELECT * FROM public.payment_plans WHERE school_year_id = v_old_year_id AND is_active = true AND deleted_at IS NULL LOOP
      INSERT INTO public.payment_plans (school_year_id, level, schedule, name, registration_fee, description, is_active)
      VALUES (v_new_year_id, v_plan.level, v_plan.schedule, v_plan.name, v_plan.registration_fee, v_plan.description, true)
      RETURNING id INTO v_new_plan_id;
      INSERT INTO public.plan_installments (payment_plan_id, type, month_number, month_name, amount, due_day, due_month_offset, is_registration)
      SELECT v_new_plan_id, type, month_number, month_name, amount, due_day, due_month_offset, is_registration
      FROM public.plan_installments WHERE payment_plan_id = v_plan.id;
      v_copied_plans := v_copied_plans + 1;
    END LOOP;
  END IF;

  IF p_promote_students AND v_old_year_id IS NOT NULL THEN
    FOR v_enrollment IN
      SELECT se.*, s.name AS student_name
      FROM public.student_enrollments se
      JOIN public.students s ON s.id = se.student_id
      WHERE se.school_year_id = v_old_year_id
      AND se.status IN ('activo','inscrito','reinscrito')
    LOOP
      v_current_level_idx := array_position(v_level_order, v_enrollment.level_at_enrollment);
      IF v_current_level_idx IS NOT NULL AND v_current_level_idx < array_length(v_level_order, 1) THEN
        v_next_level := v_level_order[v_current_level_idx + 1];
      ELSE
        v_next_level := v_enrollment.level_at_enrollment;
      END IF;

      INSERT INTO public.student_enrollments (
        student_id, school_year_id, classroom_id, payment_plan_id, status,
        level_at_enrollment, promoted_from_enrollment_id, registration_date
      ) VALUES (
        v_enrollment.student_id, v_new_year_id, NULL, NULL, 'preinscrito',
        v_next_level, v_enrollment.id, now()
      ) RETURNING id INTO v_new_enrollment_id;

      INSERT INTO public.student_promotions (
        student_id, from_school_year_id, to_school_year_id,
        from_enrollment_id, to_enrollment_id,
        from_level, to_level, from_classroom_id, status, promoted_by
      ) VALUES (
        v_enrollment.student_id, v_old_year_id, v_new_year_id,
        v_enrollment.id, v_new_enrollment_id,
        v_enrollment.level_at_enrollment, v_next_level, v_enrollment.classroom_id,
        'completed', v_user_id
      );

      v_promoted_students := v_promoted_students + 1;
    END LOOP;
  END IF;

  INSERT INTO public.school_year_processes (school_year_id, process_type, label, status, executed_at, executed_by)
  VALUES
    (v_new_year_id, 'config', 'Año escolar creado', 'completed', now(), v_user_id),
    (v_new_year_id, 'periods_created', v_created_periods || ' periodos creados', 'completed', now(), v_user_id),
    (v_new_year_id, 'new_year_ready', 'Año escolar listo para usar', 'completed', now(), v_user_id);

  INSERT INTO public.audit_logs (user_id, action, payload, created_at) VALUES (v_user_id, 'school_year.created_with_promotion', jsonb_build_object(
    'new_year_id', v_new_year_id, 'name', p_name,
    'periods', v_created_periods, 'classrooms_copied', v_copied_classrooms,
    'plans_copied', v_copied_plans, 'students_promoted', v_promoted_students
  ), now());

  RETURN jsonb_build_object(
    'success', true,
    'school_year_id', v_new_year_id,
    'name', p_name,
    'periods_created', v_created_periods,
    'classrooms_copied', v_copied_classrooms,
    'plans_copied', v_copied_plans,
    'students_promoted', v_promoted_students
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_new_school_year_with_promotion(text,date,date,boolean,boolean,boolean,int,text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.create_new_school_year_with_promotion(text,date,date,boolean,boolean,boolean,int,text) FROM anon;

-- Elimina el overload viejo/sin uso (firma de 20260723_fix_rpc_and_payments:
-- text,date,date,text,int,boolean,bigint). El frontend llama la firma nueva.
DROP FUNCTION IF EXISTS public.create_new_school_year_with_promotion(text, date, date, text, int, boolean, bigint);

-- ============================================================
-- 10. INDICES DE APOYO
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_periods_active_year ON public.periods(school_year_id, is_active)
  WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_periods_open_dates ON public.periods(school_year_id, start_date, end_date)
  WHERE status = 'open';
