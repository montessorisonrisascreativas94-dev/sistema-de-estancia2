-- =============================================================
-- Migration: Grades & Report Cards Schema Upgrade
-- Date: 2026-07-21
-- Changes:
--   1. Widen report_cards numeric columns from numeric(4,2) to numeric(5,2)
--   2. Add school_year_id to grades and report_cards
--   3. Remove redundant grades.period text column
--   4. Backfill school_year_id from periods
--   5. Update close_period RPC to use 0-100 scale + set school_year_id
--   6. Update get_student_history to include school_year info
--   7. Fix get_student_history access for parents
-- =============================================================

-- 1. Widen report_cards columns (numeric(4,2) maxes at 99.99, need 100.00+)
ALTER TABLE public.report_cards
  ALTER COLUMN task_avg TYPE numeric(5,2),
  ALTER COLUMN formal_avg TYPE numeric(5,2),
  ALTER COLUMN final_score TYPE numeric(5,2);

-- 2. Add school_year_id to grades
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'grades' AND column_name = 'school_year_id'
  ) THEN
    ALTER TABLE public.grades ADD COLUMN school_year_id bigint REFERENCES public.school_years(id);
  END IF;
END $$;

-- 3. Add school_year_id to report_cards
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'report_cards' AND column_name = 'school_year_id'
  ) THEN
    ALTER TABLE public.report_cards ADD COLUMN school_year_id bigint REFERENCES public.school_years(id);
  END IF;
END $$;

-- 4. Remove redundant grades.period text column
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'grades' AND column_name = 'period'
  ) THEN
    ALTER TABLE public.grades DROP COLUMN period;
  END IF;
END $$;

-- 5. Backfill school_year_id on grades from periods
UPDATE public.grades g
SET school_year_id = p.school_year_id
FROM public.periods p
WHERE g.period_id = p.id AND g.school_year_id IS NULL AND p.school_year_id IS NOT NULL;

-- 6. Backfill school_year_id on report_cards from periods
UPDATE public.report_cards rc
SET school_year_id = p.school_year_id
FROM public.periods p
WHERE rc.period_id = p.id AND rc.school_year_id IS NULL AND p.school_year_id IS NOT NULL;

-- 7. Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_grades_school_year ON public.grades(school_year_id);
CREATE INDEX IF NOT EXISTS idx_report_cards_school_year ON public.report_cards(school_year_id);

-- =============================================================
-- 8. REPLACE close_period RPC with 0-100 scale version
-- =============================================================
CREATE OR REPLACE FUNCTION public.close_period(p_period_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_period periods%ROWTYPE;
  v_user_id uuid;
  v_role text;
  v_student record;
  v_avg numeric(5,2);
  v_task_avg numeric(5,2);
  v_formal_avg numeric(5,2);
  v_level text;
  v_cards_created int := 0;
  v_cards_updated int := 0;
BEGIN
  v_user_id := auth.uid();
  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
  IF v_role NOT IN ('directora','admin') THEN
    RETURN jsonb_build_object('error', 'Solo la directora puede cerrar periodos');
  END IF;

  SELECT * INTO v_period FROM public.periods WHERE id = p_period_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Periodo no encontrado');
  END IF;
  IF v_period.status = 'closed' THEN
    RETURN jsonb_build_object('error', 'El periodo ya esta cerrado');
  END IF;

  FOR v_student IN
    SELECT s.id AS student_id, s.name AS student_name
    FROM public.students s
    WHERE s.classroom_id = v_period.classroom_id AND s.is_active = true
  LOOP
    -- Task average on 0-100 scale: prefer numeric_score, then stars*20, then letter map
    SELECT ROUND(AVG(
      CASE
        WHEN te.numeric_score IS NOT NULL AND te.numeric_score >= 0 THEN te.numeric_score
        WHEN te.stars IS NOT NULL AND te.stars > 0 THEN te.stars * 20
        WHEN te.grade_letter = 'A' THEN 95
        WHEN te.grade_letter = 'B' THEN 85
        WHEN te.grade_letter = 'C' THEN 75
        WHEN te.grade_letter = 'D' THEN 60
        WHEN te.grade_letter = 'E' THEN 40
        ELSE NULL
      END
    ), 2) INTO v_task_avg
    FROM public.task_evidences te
    JOIN public.tasks t ON t.id = te.task_id
    WHERE te.student_id = v_student.student_id
      AND t.classroom_id = v_period.classroom_id
      AND te.status = 'graded'
      AND t.created_at BETWEEN v_period.start_date AND v_period.end_date + INTERVAL '1 day';

    -- Formal average on 0-100 scale
    SELECT ROUND(AVG(
      CASE
        WHEN g.numeric_score IS NOT NULL AND g.numeric_score >= 0 THEN g.numeric_score
        WHEN g.score IS NOT NULL AND g.score > 0 THEN g.score * 20
        ELSE NULL
      END
    ), 2) INTO v_formal_avg
    FROM public.grades g
    WHERE g.student_id = v_student.student_id AND g.period_id = p_period_id;

    -- Weighted final: tasks 60% + formal 40%
    IF v_task_avg IS NOT NULL AND v_formal_avg IS NOT NULL THEN
      v_avg := ROUND((v_task_avg * 0.6) + (v_formal_avg * 0.4), 2);
    ELSIF v_task_avg IS NOT NULL THEN
      v_avg := v_task_avg;
    ELSIF v_formal_avg IS NOT NULL THEN
      v_avg := v_formal_avg;
    ELSE
      v_avg := NULL;
    END IF;

    -- Level on 0-100 scale
    v_level := CASE
      WHEN v_avg IS NULL THEN 'Sin calificar'
      WHEN v_avg >= 95 THEN 'Excelente'
      WHEN v_avg >= 85 THEN 'Muy Bueno'
      WHEN v_avg >= 75 THEN 'Bueno'
      WHEN v_avg >= 60 THEN 'Aceptable'
      WHEN v_avg >= 50 THEN 'Requiere Mejoras'
      ELSE 'Bajo Desempeño'
    END;

    INSERT INTO public.report_cards (
      student_id, classroom_id, period_id, school_year_id,
      task_avg, formal_avg, final_score, level, created_at
    ) VALUES (
      v_student.student_id, v_period.classroom_id, p_period_id, v_period.school_year_id,
      v_task_avg, v_formal_avg, v_avg, v_level, now()
    )
    ON CONFLICT (student_id, period_id) DO UPDATE SET
      task_avg = EXCLUDED.task_avg,
      formal_avg = EXCLUDED.formal_avg,
      final_score = EXCLUDED.final_score,
      level = EXCLUDED.level,
      school_year_id = EXCLUDED.school_year_id;

    GET DIAGNOSTICS v_cards_created = ROW_COUNT;
    v_cards_updated := v_cards_updated + 1;
  END LOOP;

  UPDATE public.periods SET status = 'closed', is_active = false WHERE id = p_period_id;

  INSERT INTO public.audit_logs (user_id, action, payload, created_at)
  VALUES (v_user_id, 'period.closed', jsonb_build_object(
    'period_id', p_period_id, 'period_name', v_period.name, 'cards_generated', v_cards_updated
  ), now());

  RETURN jsonb_build_object(
    'success', true, 'period_id', p_period_id, 'period_name', v_period.name, 'cards_generated', v_cards_updated
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.close_period(bigint) TO authenticated;

-- =============================================================
-- 9. REPLACE get_student_history to include school_year + allow parents
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_student_history(p_student_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_role text;
DECLARE v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;

  -- Allow staff OR parent who owns this student
  IF v_role NOT IN ('directora','asistente','admin','encargada') THEN
    -- Check if user is a parent of this student
    IF NOT EXISTS (
      SELECT 1 FROM public.students
      WHERE id = p_student_id AND parent_id = v_user_id
    ) THEN
      RETURN jsonb_build_object('error', 'No autorizado');
    END IF;
  END IF;

  RETURN (
    SELECT jsonb_agg(
      jsonb_build_object(
        'period_id', rc.period_id, 'period_name', p.name,
        'period_status', p.status, 'classroom_id', rc.classroom_id,
        'classroom_name', c.name, 'task_avg', rc.task_avg,
        'formal_avg', rc.formal_avg, 'final_score', rc.final_score,
        'level', rc.level, 'teacher_comment', rc.teacher_comment,
        'school_year_id', rc.school_year_id,
        'school_year_name', sy.name,
        'created_at', rc.created_at
      ) ORDER BY p.start_date DESC
    )
    FROM public.report_cards rc
    JOIN public.periods p ON p.id = rc.period_id
    LEFT JOIN public.classrooms c ON c.id = rc.classroom_id
    LEFT JOIN public.school_years sy ON sy.id = rc.school_year_id
    WHERE rc.student_id = p_student_id
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_student_history(bigint) TO authenticated;

-- =============================================================
-- 10. RPC: Create school year with auto-generated trimesters
-- =============================================================
CREATE OR REPLACE FUNCTION public.create_school_year_with_periods(
  p_name text,
  p_start_date date,
  p_end_date date,
  p_classroom_ids bigint[] DEFAULT NULL,
  p_num_periods int DEFAULT 3
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid;
  v_role text;
  v_year_id bigint;
  v_classroom_id bigint;
  v_total_days int;
  v_period_days int;
  v_period_start date;
  v_period_end date;
  v_period_name text;
  v_period_names text[] := ARRAY['1er Trimestre', '2do Trimestre', '3er Trimestre', '4to Trimestre'];
  v_created_periods int := 0;
BEGIN
  v_user_id := auth.uid();
  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
  IF v_role NOT IN ('directora','admin') THEN
    RETURN jsonb_build_object('error', 'Solo la directora puede crear años escolares');
  END IF;

  IF p_start_date >= p_end_date THEN
    RETURN jsonb_build_object('error', 'La fecha de inicio debe ser anterior a la fecha de fin');
  END IF;

  -- Create the school year
  INSERT INTO public.school_years (name, start_date, end_date, status)
  VALUES (p_name, p_start_date, p_end_date, 'upcoming')
  RETURNING id INTO v_year_id;

  -- Calculate period splitting
  v_total_days := p_end_date - p_start_date;
  v_period_days := v_total_days / p_num_periods;
  v_period_start := p_start_date;

  -- Get classrooms: use provided array or all active classrooms
  IF p_classroom_ids IS NULL OR array_length(p_classroom_ids, 1) IS NULL THEN
    SELECT array_agg(c.id) INTO p_classroom_ids
    FROM public.classrooms c WHERE c.is_active = true;
  END IF;

  -- Create periods for each classroom
  IF p_classroom_ids IS NOT NULL THEN
    FOREACH v_classroom_id IN ARRAY p_classroom_ids
    LOOP
      FOR i IN 1..p_num_periods
      LOOP
        v_period_end := v_period_start + (v_period_days || ' days')::interval - INTERVAL '1 day';
        -- Last period extends to the year end
        IF i = p_num_periods THEN
          v_period_end := p_end_date;
        END IF;

        v_period_name := COALESCE(v_period_names[i], i || '° Periodo');

        INSERT INTO public.periods (name, start_date, end_date, status, is_active, classroom_id, school_year_id)
        VALUES (
          v_period_name || ' ' || p_name,
          v_period_start,
          v_period_end,
          'open',
          (i = 1), -- First period is active by default
          v_classroom_id,
          v_year_id
        );
        v_created_periods := v_created_periods + 1;

        v_period_start := v_period_end + INTERVAL '1 day';
      END LOOP;

      -- Reset for next classroom
      v_period_start := p_start_date;
    END LOOP;
  END IF;

  INSERT INTO public.audit_logs (user_id, action, payload, created_at)
  VALUES (v_user_id, 'school_year.created', jsonb_build_object(
    'year_id', v_year_id, 'name', p_name, 'periods_created', v_created_periods
  ), now());

  RETURN jsonb_build_object(
    'success', true,
    'school_year_id', v_year_id,
    'name', p_name,
    'periods_created', v_created_periods
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_school_year_with_periods(text, date, date, bigint[], int) TO authenticated;
