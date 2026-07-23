-- ============================================================
-- MIGRATION: School Year Engine v1.0
-- Date: 2026-07-23
-- Purpose: Transform the system into a professional school year
--          driven architecture. Every module depends on
--          school_year_id and/or period_id.
-- ============================================================

-- ============================================================
-- 1. ENHANCE school_years TABLE
-- ============================================================
ALTER TABLE public.school_years ADD COLUMN IF NOT EXISTS institution_type text DEFAULT 'estancia';
ALTER TABLE public.school_years ADD COLUMN IF NOT EXISTS period_model text DEFAULT 'trimestres' CHECK (period_model IN ('trimestres','semestres','mensual','custom'));
ALTER TABLE public.school_years ADD COLUMN IF NOT EXISTS num_periods int DEFAULT 3;
ALTER TABLE public.school_years ADD COLUMN IF NOT EXISTS min_age integer;
ALTER TABLE public.school_years ADD COLUMN IF NOT EXISTS max_age integer;
ALTER TABLE public.school_years ADD COLUMN IF NOT EXISTS schedule text DEFAULT '8:00-15:00';
ALTER TABLE public.school_years ADD COLUMN IF NOT EXISTS enrollment_open boolean DEFAULT false;
ALTER TABLE public.school_years ADD COLUMN IF NOT EXISTS reenrollment_open boolean DEFAULT false;
ALTER TABLE public.school_years ADD COLUMN IF NOT EXISTS enrollment_cost numeric(10,2) DEFAULT 0;
ALTER TABLE public.school_years ADD COLUMN IF NOT EXISTS matricula_cost numeric(10,2) DEFAULT 0;
ALTER TABLE public.school_years ADD COLUMN IF NOT EXISTS sibling_discount numeric(5,2) DEFAULT 0;
ALTER TABLE public.school_years ADD COLUMN IF NOT EXISTS closed_at timestamp with time zone;
ALTER TABLE public.school_years ADD COLUMN IF NOT EXISTS closed_by uuid REFERENCES public.profiles(id);
ALTER TABLE public.school_years ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.school_years ADD COLUMN IF NOT EXISTS config jsonb DEFAULT '{}'::jsonb;

-- ============================================================
-- 2. ENHANCE periods TABLE
-- ============================================================
ALTER TABLE public.periods ADD COLUMN IF NOT EXISTS sort_order int DEFAULT 1;
ALTER TABLE public.periods ADD COLUMN IF NOT EXISTS closed_at timestamp with time zone;
ALTER TABLE public.periods ADD COLUMN IF NOT EXISTS closed_by uuid REFERENCES public.profiles(id);
ALTER TABLE public.periods ADD COLUMN IF NOT EXISTS is_blocked boolean DEFAULT false;

-- ============================================================
-- 3. LINK payments TO school_year + period
-- ============================================================
DO $$ BEGIN
  ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS school_year_id bigint REFERENCES public.school_years(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS period_id bigint REFERENCES public.periods(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 4. LINK attendance TO school_year + period
-- ============================================================
DO $$ BEGIN
  ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS school_year_id bigint REFERENCES public.school_years(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS period_id bigint REFERENCES public.periods(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 5. LINK tasks TO school_year (already has period_id)
-- ============================================================
DO $$ BEGIN
  ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS school_year_id bigint REFERENCES public.school_years(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 6. LINK posts TO school_year (already has period_id)
-- ============================================================
DO $$ BEGIN
  ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS school_year_id bigint REFERENCES public.school_years(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 7. LINK grades TO school_year (already has period_id)
-- ============================================================
DO $$ BEGIN
  ALTER TABLE public.grades ADD COLUMN IF NOT EXISTS school_year_id bigint REFERENCES public.school_years(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 8. LINK daily_logs TO school_year + period
-- ============================================================
DO $$ BEGIN
  ALTER TABLE public.daily_logs ADD COLUMN IF NOT EXISTS school_year_id bigint REFERENCES public.school_years(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.daily_logs ADD COLUMN IF NOT EXISTS period_id bigint REFERENCES public.periods(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 9. LINK incidents TO school_year + period
-- ============================================================
DO $$ BEGIN
  ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS school_year_id bigint REFERENCES public.school_years(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS period_id bigint REFERENCES public.periods(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 10. LINK student_preregistrations TO school_year
-- ============================================================
DO $$ BEGIN
  ALTER TABLE public.student_preregistrations ADD COLUMN IF NOT EXISTS school_year_id bigint REFERENCES public.school_years(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 11. LINK invoices TO school_year + period
-- ============================================================
DO $$ BEGIN
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS school_year_id bigint REFERENCES public.school_years(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS period_id bigint REFERENCES public.periods(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 12. LINK payroll_records TO school_year
-- ============================================================
DO $$ BEGIN
  ALTER TABLE public.payroll_records ADD COLUMN IF NOT EXISTS school_year_id bigint REFERENCES public.school_years(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 13. LINK accounting_journal TO school_year
-- ============================================================
DO $$ BEGIN
  ALTER TABLE public.accounting_journal ADD COLUMN IF NOT EXISTS school_year_id bigint REFERENCES public.school_years(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 14. LINK report_cards TO school_year (already exists)
-- ============================================================
-- report_cards already has school_year_id — no change needed

-- ============================================================
-- 15. LINK classroom_events TO school_year
-- ============================================================
DO $$ BEGIN
  ALTER TABLE public.classroom_events ADD COLUMN IF NOT EXISTS school_year_id bigint REFERENCES public.school_years(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 16. LINK nap_sessions TO school_year + period
-- ============================================================
DO $$ BEGIN
  ALTER TABLE public.nap_sessions ADD COLUMN IF NOT EXISTS school_year_id bigint REFERENCES public.school_years(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.nap_sessions ADD COLUMN IF NOT EXISTS period_id bigint REFERENCES public.periods(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 17. LINK parent_ratings TO school_year
-- ============================================================
DO $$ BEGIN
  ALTER TABLE public.parent_ratings ADD COLUMN IF NOT EXISTS school_year_id bigint REFERENCES public.school_years(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 18. LINK meetings TO school_year
-- ============================================================
DO $$ BEGIN
  ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS school_year_id bigint REFERENCES public.school_years(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 19. LINK student_enrollments additional fields
-- ============================================================
ALTER TABLE public.student_enrollments ADD COLUMN IF NOT EXISTS level_at_enrollment text;
ALTER TABLE public.student_enrollments ADD COLUMN IF NOT EXISTS classroom_name_at_enrollment text;
ALTER TABLE public.student_enrollments ADD COLUMN IF NOT EXISTS promoted_from_enrollment_id bigint REFERENCES public.student_enrollments(id);
ALTER TABLE public.student_enrollments ADD COLUMN IF NOT EXISTS promotion_notes text;

-- ============================================================
-- 20. NEW TABLE: school_year_processes (tracks institutional processes)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.school_year_processes (
  id            bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  school_year_id bigint NOT NULL REFERENCES public.school_years(id) ON DELETE CASCADE,
  process_type  text NOT NULL CHECK (process_type IN (
    'config','periods_created','enrollment_open','enrollment_close',
    'reenrollment_open','reenrollment_close','classes_started',
    'period_open','period_close','evaluations_open','evaluations_close',
    'report_cards','promotion','graduation','year_closed','archived',
    'new_year_ready','custom'
  )),
  label         text,
  status        text DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','skipped')),
  executed_at   timestamp with time zone,
  executed_by   uuid REFERENCES public.profiles(id),
  metadata      jsonb DEFAULT '{}'::jsonb,
  created_at    timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_processes_school_year ON public.school_year_processes(school_year_id);
CREATE INDEX IF NOT EXISTS idx_processes_type ON public.school_year_processes(process_type);

-- ============================================================
-- 21. NEW TABLE: student_promotions (tracks student level changes)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.student_promotions (
  id                        bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  student_id                bigint NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  from_school_year_id       bigint NOT NULL REFERENCES public.school_years(id),
  to_school_year_id         bigint NOT NULL REFERENCES public.school_years(id),
  from_enrollment_id        bigint REFERENCES public.student_enrollments(id),
  to_enrollment_id          bigint REFERENCES public.student_enrollments(id),
  from_level                text,
  to_level                  text,
  from_classroom_id         bigint REFERENCES public.classrooms(id),
  to_classroom_id           bigint REFERENCES public.classrooms(id),
  status                    text DEFAULT 'pending' CHECK (status IN ('pending','completed','rejected')),
  promoted_by               uuid REFERENCES public.profiles(id),
  notes                     text,
  created_at                timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_promotions_student ON public.student_promotions(student_id);
CREATE INDEX IF NOT EXISTS idx_promotions_from_year ON public.student_promotions(from_school_year_id);
CREATE INDEX IF NOT EXISTS idx_promotions_to_year ON public.student_promotions(to_school_year_id);

-- ============================================================
-- 22. NEW TABLE: school_year_archive (snapshots for history)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.school_year_archive (
  id                bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  school_year_id    bigint NOT NULL REFERENCES public.school_years(id),
  snapshot_type     text NOT NULL CHECK (snapshot_type IN ('summary','students','teachers','classrooms','payments','attendance','grades')),
  data              jsonb NOT NULL,
  created_at        timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_archive_year ON public.school_year_archive(school_year_id);

-- ============================================================
-- 23. INDEXES for new columns
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_payments_school_year ON public.payments(school_year_id) WHERE school_year_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_period ON public.payments(period_id) WHERE period_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attendance_school_year ON public.attendance(school_year_id) WHERE school_year_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attendance_period ON public.attendance(period_id) WHERE period_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_school_year ON public.tasks(school_year_id) WHERE school_year_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posts_school_year ON public.posts(school_year_id) WHERE school_year_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_grades_school_year ON public.grades(school_year_id) WHERE school_year_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_daily_logs_school_year ON public.daily_logs(school_year_id) WHERE school_year_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_incidents_school_year ON public.incidents(school_year_id) WHERE school_year_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_school_year ON public.invoices(school_year_id) WHERE school_year_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_preregistrations_school_year ON public.student_preregistrations(school_year_id) WHERE school_year_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_enrollments_level ON public.student_enrollments(level_at_enrollment) WHERE level_at_enrollment IS NOT NULL;

-- ============================================================
-- 24. RPC: get_school_year_dashboard
-- Returns executive summary data for the active school year
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_school_year_dashboard(p_school_year_id bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid; v_role text; v_year_id bigint;
  v_year record; v_enrollments int; v_classrooms int; v_teachers int;
  v_pending_payments int; v_total_income numeric; v_pending_income numeric;
  v_attendance_pct numeric; v_active_periods int; v_closed_periods int;
  v_current_period record; v_total_days int; v_elapsed_days int;
  v_processes jsonb;
BEGIN
  v_user_id := auth.uid();
  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
  IF v_role NOT IN ('directora','admin','encargada') THEN
    RETURN jsonb_build_object('error', 'No autorizado');
  END IF;

  -- Find active year if not specified
  IF p_school_year_id IS NOT NULL THEN
    v_year_id := p_school_year_id;
  ELSE
    SELECT id INTO v_year_id FROM public.school_years WHERE is_current = true LIMIT 1;
    IF v_year_id IS NULL THEN
      SELECT id INTO v_year_id FROM public.school_years WHERE status = 'active' ORDER BY start_date DESC LIMIT 1;
    END IF;
  END IF;
  IF v_year_id IS NULL THEN RETURN jsonb_build_object('error', 'No hay año escolar activo'); END IF;

  SELECT * INTO v_year FROM public.school_years WHERE id = v_year_id;

  -- Counts
  SELECT count(*) INTO v_enrollments FROM public.student_enrollments WHERE school_year_id = v_year_id AND status IN ('activo','inscrito','admitido','reinscrito');
  SELECT count(*) INTO v_classrooms FROM public.classrooms WHERE deleted_at IS NULL;
  SELECT count(DISTINCT teacher_id) INTO v_teachers FROM public.classrooms WHERE teacher_id IS NOT NULL AND deleted_at IS NULL;

  -- Payment stats
  SELECT count(*), COALESCE(sum(amount), 0) INTO v_pending_payments, v_pending_income
  FROM public.payments WHERE school_year_id = v_year_id AND status = 'pending' AND deleted_at IS NULL;
  SELECT COALESCE(sum(amount), 0) INTO v_total_income
  FROM public.payments WHERE school_year_id = v_year_id AND status = 'paid' AND deleted_at IS NULL;

  -- Period stats
  SELECT count(*) INTO v_active_periods FROM public.periods WHERE school_year_id = v_year_id AND status = 'open';
  SELECT count(*) INTO v_closed_periods FROM public.periods WHERE school_year_id = v_year_id AND status = 'closed';

  -- Current period
  SELECT id, name, start_date, end_date INTO v_current_period
  FROM public.periods WHERE school_year_id = v_year_id AND is_active = true LIMIT 1;

  -- Day calculation
  v_total_days := v_year.end_date - v_year.start_date;
  v_elapsed_days := greatest(0, least(v_total_days, current_date - v_year.start_date));

  -- Attendance percentage (last 30 days)
  SELECT COALESCE(
    ROUND(
      (SELECT count(*)::numeric FROM public.attendance a
       WHERE a.school_year_id = v_year_id AND a.status = 'present'
       AND a.date >= current_date - INTERVAL '30 days') /
      NULLIF(
        (SELECT count(*)::numeric FROM public.attendance a
         WHERE a.school_year_id = v_year_id
         AND a.date >= current_date - INTERVAL '30 days'), 0
      ) * 100, 1
    ), 0
  ) INTO v_attendance_pct;

  -- Processes
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'type', process_type, 'label', label, 'status', status, 'executed_at', executed_at
  ) ORDER BY created_at), '[]'::jsonb) INTO v_processes
  FROM public.school_year_processes WHERE school_year_id = v_year_id;

  RETURN jsonb_build_object(
    'found', true,
    'year', jsonb_build_object(
      'id', v_year.id, 'name', v_year.name, 'start_date', v_year.start_date,
      'end_date', v_year.end_date, 'status', v_year.status, 'is_current', v_year.is_current,
      'period_model', v_year.period_model, 'num_periods', v_year.num_periods,
      'enrollment_open', v_year.enrollment_open, 'reenrollment_open', v_year.reenrollment_open,
      'total_days', v_total_days, 'elapsed_days', v_elapsed_days
    ),
    'kpi', jsonb_build_object(
      'enrollments', v_enrollments, 'classrooms', v_classrooms, 'teachers', v_teachers,
      'pending_payments', v_pending_payments,
      'total_income', v_total_income, 'pending_income', v_pending_income,
      'attendance_pct', v_attendance_pct,
      'active_periods', v_active_periods, 'closed_periods', v_closed_periods
    ),
    'current_period', CASE WHEN v_current_period.id IS NOT NULL THEN
      jsonb_build_object('id', v_current_period.id, 'name', v_current_period.name, 'start_date', v_current_period.start_date, 'end_date', v_current_period.end_date)
    ELSE null END,
    'processes', v_processes
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_school_year_dashboard(bigint) TO authenticated;

-- ============================================================
-- 25. RPC: create_new_school_year_with_promotion
-- Full wizard: creates year, copies config, promotes students
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
    RETURN jsonb_build_object('error', 'Solo la directora puede crear años escolares');
  END IF;

  -- Get current active year
  SELECT id INTO v_old_year_id FROM public.school_years WHERE is_current = true LIMIT 1;
  IF v_old_year_id IS NULL THEN
    SELECT id INTO v_old_year_id FROM public.school_years WHERE status = 'active' ORDER BY start_date DESC LIMIT 1;
  END IF;

  -- Deactivate current year
  IF v_old_year_id IS NOT NULL THEN
    UPDATE public.school_years SET is_current = false WHERE id = v_old_year_id;
  END IF;

  -- Create new school year
  INSERT INTO public.school_years (name, start_date, end_date, status, is_current, period_model, num_periods)
  VALUES (p_name, p_start_date, p_end_date, 'active', true, p_period_model, p_num_periods)
  RETURNING id INTO v_new_year_id;

  -- Create periods
  v_total_days := p_end_date - p_start_date;
  v_period_days := v_total_days / p_num_periods;
  v_period_start := p_start_date;
  FOR i IN 1..p_num_periods LOOP
    v_period_end := v_period_start + (v_period_days || ' days')::interval - INTERVAL '1 day';
    IF i = p_num_periods THEN v_period_end := p_end_date; END IF;
    v_period_name := COALESCE(v_period_names[i], i || ' Periodo');
    INSERT INTO public.periods (name, start_date, end_date, status, is_active, school_year_id, sort_order)
    VALUES (v_period_name, v_period_start, v_period_end, 'open', (i = 1), v_new_year_id, i);
    v_created_periods := v_created_periods + 1;
    v_period_start := v_period_end + INTERVAL '1 day';
  END LOOP;

  -- Copy classrooms
  IF p_copy_classrooms AND v_old_year_id IS NOT NULL THEN
    FOR v_classroom IN SELECT * FROM public.classrooms WHERE deleted_at IS NULL LOOP
      INSERT INTO public.classrooms (name, level, capacity, teacher_id, is_live)
      VALUES (v_classroom.name, v_classroom.level, v_classroom.capacity, v_classroom.teacher_id, false)
      RETURNING id INTO v_new_classroom_id;
      v_copied_classrooms := v_copied_classrooms + 1;
    END LOOP;
  END IF;

  -- Copy payment plans
  IF p_copy_payment_plans AND v_old_year_id IS NOT NULL THEN
    FOR v_plan IN SELECT * FROM public.payment_plans WHERE school_year_id = v_old_year_id AND is_active = true AND deleted_at IS NULL LOOP
      INSERT INTO public.payment_plans (school_year_id, level, schedule, name, registration_fee, description, is_active)
      VALUES (v_new_year_id, v_plan.level, v_plan.schedule, v_plan.name, v_plan.registration_fee, v_plan.description, true)
      RETURNING id INTO v_new_plan_id;
      -- Copy installments
      INSERT INTO public.plan_installments (payment_plan_id, type, month_number, month_name, amount, due_day, due_month_offset, is_registration)
      SELECT v_new_plan_id, type, month_number, month_name, amount, due_day, due_month_offset, is_registration
      FROM public.plan_installments WHERE payment_plan_id = v_plan.id;
      v_copied_plans := v_copied_plans + 1;
    END LOOP;
  END IF;

  -- Promote students
  IF p_promote_students AND v_old_year_id IS NOT NULL THEN
    FOR v_enrollment IN
      SELECT se.*, s.name AS student_name
      FROM public.student_enrollments se
      JOIN public.students s ON s.id = se.student_id
      WHERE se.school_year_id = v_old_year_id
      AND se.status IN ('activo','inscrito','reinscrito')
    LOOP
      -- Find next level
      v_current_level_idx := array_position(v_level_order, v_enrollment.level_at_enrollment);
      IF v_current_level_idx IS NOT NULL AND v_current_level_idx < array_length(v_level_order, 1) THEN
        v_next_level := v_level_order[v_current_level_idx + 1];
      ELSE
        v_next_level := v_enrollment.level_at_enrollment;
      END IF;

      -- Create new enrollment for new year
      INSERT INTO public.student_enrollments (
        student_id, school_year_id, classroom_id, payment_plan_id, status,
        level_at_enrollment, promoted_from_enrollment_id, registration_date
      ) VALUES (
        v_enrollment.student_id, v_new_year_id, NULL, NULL, 'preinscrito',
        v_next_level, v_enrollment.id, now()
      ) RETURNING id INTO v_new_enrollment_id;

      -- Record promotion
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

  -- Log process steps
  INSERT INTO public.school_year_processes (school_year_id, process_type, label, status, executed_at, executed_by)
  VALUES
    (v_new_year_id, 'config', 'Año escolar creado', 'completed', now(), v_user_id),
    (v_new_year_id, 'periods_created', v_created_periods || ' periodos creados', 'completed', now(), v_user_id),
    (v_new_year_id, 'new_year_ready', 'Año escolar listo para usar', 'completed', now(), v_user_id);

  -- Audit log
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

-- ============================================================
-- 26. RPC: close_school_year
-- Archives data and prepares for new year
-- ============================================================
CREATE OR REPLACE FUNCTION public.close_school_year(p_school_year_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid; v_role text; v_year record;
  v_students_closed int := 0;
BEGIN
  v_user_id := auth.uid();
  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
  IF v_role NOT IN ('directora','admin') THEN
    RETURN jsonb_build_object('error', 'Solo la directora puede cerrar años escolares');
  END IF;

  SELECT * INTO v_year FROM public.school_years WHERE id = p_school_year_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Año escolar no encontrado'); END IF;
  IF v_year.status = 'closed' THEN RETURN jsonb_build_object('error', 'El año ya está cerrado'); END IF;

  -- Close all open periods
  UPDATE public.periods SET status = 'closed', is_active = false, is_blocked = true, closed_at = now(), closed_by = v_user_id
  WHERE school_year_id = p_school_year_id AND status = 'open';

  -- Archive summary
  INSERT INTO public.school_year_archive (school_year_id, snapshot_type, data)
  SELECT p_school_year_id, 'summary', jsonb_build_object(
    'name', v_year.name, 'start_date', v_year.start_date, 'end_date', v_year.end_date,
    'total_enrollments', (SELECT count(*) FROM public.student_enrollments WHERE school_year_id = p_school_year_id),
    'total_payments', (SELECT COALESCE(sum(amount),0) FROM public.payments WHERE school_year_id = p_school_year_id AND status = 'paid'),
    'total_pending', (SELECT COALESCE(sum(amount),0) FROM public.payments WHERE school_year_id = p_school_year_id AND status = 'pending'),
    'total_tasks', (SELECT count(*) FROM public.tasks WHERE school_year_id = p_school_year_id),
    'total_grades', (SELECT count(*) FROM public.grades WHERE school_year_id = p_school_year_id),
    'total_incidents', (SELECT count(*) FROM public.incidents WHERE school_year_id = p_school_year_id)
  );

  -- Deactivate current
  UPDATE public.school_years SET is_current = false, status = 'closed', closed_at = now(), closed_by = v_user_id
  WHERE id = p_school_year_id;

  -- Log
  INSERT INTO public.audit_logs (user_id, action, payload, created_at) VALUES (v_user_id, 'school_year.closed', jsonb_build_object('year_id', p_school_year_id, 'name', v_year.name), now());
  INSERT INTO public.school_year_processes (school_year_id, process_type, label, status, executed_at, executed_by)
  VALUES (p_school_year_id, 'year_closed', 'Año escolar cerrado', 'completed', now(), v_user_id);

  RETURN jsonb_build_object('success', true, 'year_id', p_school_year_id, 'name', v_year.name);
END;
$$;
GRANT EXECUTE ON FUNCTION public.close_school_year(bigint) TO authenticated;

-- ============================================================
-- 27. RPC: set_active_school_year
-- Switches the active school year (for historical viewing)
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_active_school_year(p_school_year_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user_id uuid; v_role text; v_year record;
BEGIN
  v_user_id := auth.uid();
  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
  IF v_role NOT IN ('directora','admin') THEN
    RETURN jsonb_build_object('error', 'No autorizado');
  END IF;

  SELECT * INTO v_year FROM public.school_years WHERE id = p_school_year_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Año escolar no encontrado'); END IF;

  UPDATE public.school_years SET is_current = false;
  UPDATE public.school_years SET is_current = true WHERE id = p_school_year_id;

  INSERT INTO public.audit_logs (user_id, action, payload, created_at) VALUES (v_user_id, 'school_year.switched', jsonb_build_object('year_id', p_school_year_id, 'name', v_year.name), now());

  RETURN jsonb_build_object('success', true, 'year_id', p_school_year_id, 'name', v_year.name);
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_active_school_year(bigint) TO authenticated;

-- ============================================================
-- 28. RPC: get_school_year_history
-- Returns historical data for a specific year
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_school_year_history(p_school_year_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid; v_role text; v_year record;
  v_enrollments jsonb; v_payments jsonb; v_summary jsonb;
BEGIN
  v_user_id := auth.uid();
  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;

  SELECT * INTO v_year FROM public.school_years WHERE id = p_school_year_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Año escolar no encontrado'); END IF;

  -- Enrollments
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'student_id', se.student_id, 'student_name', s.name,
    'level', se.level_at_enrollment, 'classroom_id', se.classroom_id,
    'status', se.status, 'matricula', s.matricula
  )), '[]'::jsonb) INTO v_enrollments
  FROM public.student_enrollments se
  JOIN public.students s ON s.id = se.student_id
  WHERE se.school_year_id = p_school_year_id;

  -- Payment summary
  SELECT jsonb_build_object(
    'total_paid', COALESCE(sum(amount), 0),
    'total_pending', (SELECT COALESCE(sum(amount), 0) FROM public.payments WHERE school_year_id = p_school_year_id AND status = 'pending' AND deleted_at IS NULL),
    'count_paid', count(*) FILTER (WHERE status = 'paid'),
    'count_pending', count(*) FILTER (WHERE status = 'pending')
  ) INTO v_payments
  FROM public.payments WHERE school_year_id = p_school_year_id AND deleted_at IS NULL;

  -- Summary
  SELECT jsonb_build_object(
    'name', v_year.name, 'status', v_year.status,
    'start_date', v_year.start_date, 'end_date', v_year.end_date,
    'enrollments', v_enrollments, 'payments', v_payments,
    'total_tasks', (SELECT count(*) FROM public.tasks WHERE school_year_id = p_school_year_id),
    'total_grades', (SELECT count(*) FROM public.grades WHERE school_year_id = p_school_year_id),
    'total_incidents', (SELECT count(*) FROM public.incidents WHERE school_year_id = p_school_year_id),
    'total_posts', (SELECT count(*) FROM public.posts WHERE school_year_id = p_school_year_id),
    'total_attendance', (SELECT count(*) FROM public.attendance WHERE school_year_id = p_school_year_id)
  ) INTO v_summary;

  RETURN v_summary;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_school_year_history(bigint) TO authenticated;

-- ============================================================
-- 29. RPC: is_period_writable
-- Check if a period is still open for writes
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_period_writable(p_period_id bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status text; v_blocked boolean;
BEGIN
  SELECT status, is_blocked INTO v_status, v_blocked FROM public.periods WHERE id = p_period_id;
  IF NOT FOUND THEN RETURN false; END IF;
  RETURN v_status = 'open' AND COALESCE(v_blocked, false) = false;
END;
$$;
GRANT EXECUTE ON FUNCTION public.is_period_writable(bigint) TO authenticated;

-- ============================================================
-- 30. Update get_active_period to include school_year_id
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_active_period(p_classroom_id bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_period periods%ROWTYPE;
BEGIN
  IF p_classroom_id IS NOT NULL THEN
    SELECT * INTO v_period FROM public.periods WHERE is_active = true AND classroom_id = p_classroom_id ORDER BY created_at DESC LIMIT 1;
  END IF;
  IF NOT FOUND THEN SELECT * INTO v_period FROM public.periods WHERE is_active = true ORDER BY created_at DESC LIMIT 1; END IF;
  IF NOT FOUND THEN SELECT * INTO v_period FROM public.periods WHERE status = 'open' ORDER BY created_at DESC LIMIT 1; END IF;
  IF NOT FOUND THEN RETURN jsonb_build_object('found', false, 'status', 'no_period'); END IF;
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
-- 31. Update get_current_period to include school_year_id
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_current_period()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_period periods%ROWTYPE;
BEGIN
  SELECT * INTO v_period FROM public.periods WHERE is_active = true ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN SELECT * INTO v_period FROM public.periods WHERE status = 'open' ORDER BY created_at DESC LIMIT 1; END IF;
  IF NOT FOUND THEN RETURN jsonb_build_object('found', false); END IF;
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
