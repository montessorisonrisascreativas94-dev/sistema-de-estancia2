-- ============================================================
-- MIGRATION: Fix RPC + Payment Voucher Flow
-- Date: 2026-07-23
-- Purpose: Fix get_school_year_dashboard deleted_at error,
--          add missing columns, and improve payment review flow.
-- ============================================================

-- 1. Add deleted_at to classrooms if missing
DO $$ BEGIN
  ALTER TABLE public.classrooms ADD COLUMN deleted_at timestamp with time zone;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- 2. Add deleted_at to attendance if missing (needed by dashboard RPC)
DO $$ BEGIN
  ALTER TABLE public.attendance ADD COLUMN deleted_at timestamp with time zone;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- 3. Add bank/referencia columns to payments if missing (needed for pre-fill)
DO $$ BEGIN
  ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS transfer_date date;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- 4. Fix get_school_year_dashboard RPC (replace deleted_at IS NULL with safe queries)
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
  IF v_role NOT IN ('directora','admin','encargada','asistente') THEN
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
  IF v_year_id IS NULL THEN RETURN jsonb_build_object('error', 'No hay ano escolar activo'); END IF;

  SELECT * INTO v_year FROM public.school_years WHERE id = v_year_id;

  -- Counts (safe — no deleted_at dependency)
  SELECT count(*) INTO v_enrollments FROM public.student_enrollments WHERE school_year_id = v_year_id AND status IN ('activo','inscrito','admitido','reinscrito');
  SELECT count(*) INTO v_classrooms FROM public.classrooms;
  SELECT count(DISTINCT teacher_id) INTO v_teachers FROM public.classrooms WHERE teacher_id IS NOT NULL;

  -- Payment stats (safe — deleted_at may not exist on payments)
  BEGIN
    SELECT count(*), COALESCE(sum(amount), 0) INTO v_pending_payments, v_pending_income
    FROM public.payments WHERE school_year_id = v_year_id AND status = 'pending' AND deleted_at IS NULL;
  EXCEPTION WHEN undefined_column THEN
    SELECT count(*), COALESCE(sum(amount), 0) INTO v_pending_payments, v_pending_income
    FROM public.payments WHERE school_year_id = v_year_id AND status = 'pending';
  END;

  BEGIN
    SELECT COALESCE(sum(amount), 0) INTO v_total_income
    FROM public.payments WHERE school_year_id = v_year_id AND status = 'paid' AND deleted_at IS NULL;
  EXCEPTION WHEN undefined_column THEN
    SELECT COALESCE(sum(amount), 0) INTO v_total_income
    FROM public.payments WHERE school_year_id = v_year_id AND status = 'paid';
  END;

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
  BEGIN
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
  EXCEPTION WHEN undefined_column THEN
    v_attendance_pct := 0;
  END;

  -- Processes
  BEGIN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'type', process_type, 'label', label, 'status', status, 'executed_at', executed_at
    ) ORDER BY created_at), '[]'::jsonb) INTO v_processes
    FROM public.school_year_processes WHERE school_year_id = v_year_id;
  EXCEPTION WHEN undefined_table THEN
    v_processes := '[]'::jsonb;
  END;

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
    'processes', COALESCE(v_processes, '[]'::jsonb)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_school_year_dashboard(bigint) TO authenticated;

-- 5. Fix create_new_school_year_with_promotion (deleted_at safe)
CREATE OR REPLACE FUNCTION public.create_new_school_year_with_promotion(
  p_name text,
  p_start_date date,
  p_end_date date,
  p_period_model text DEFAULT 'trimestre',
  p_num_periods int DEFAULT 3,
  p_copy_classrooms boolean DEFAULT true,
  p_old_year_id bigint DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid; v_role text; v_new_year_id bigint;
  v_old_year bigint; v_copied_classrooms int := 0;
  v_created_periods int := 0;
  v_classroom record; v_plan record; r record;
  v_period_start date; v_period_end date;
  v_period_name text; v_days_per_period int;
  v_new_enrollment_id bigint;
BEGIN
  v_user_id := auth.uid();
  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
  IF v_role NOT IN ('directora','admin') THEN
    RETURN jsonb_build_object('error', 'Solo la directora puede crear anos escolares');
  END IF;

  -- Find old year
  IF p_old_year_id IS NOT NULL THEN
    v_old_year := p_old_year_id;
  ELSE
    SELECT id INTO v_old_year FROM public.school_years WHERE is_current = true LIMIT 1;
  END IF;

  -- Deactivate previous current
  UPDATE public.school_years SET is_current = false WHERE is_current = true;

  -- Create new year
  INSERT INTO public.school_years (name, start_date, end_date, status, is_current, period_model, num_periods, created_at)
  VALUES (p_name, p_start_date, p_end_date, 'active', true, p_period_model, p_num_periods, now())
  RETURNING id INTO v_new_year_id;

  -- Create periods
  v_days_per_period := (p_end_date - p_start_date) / p_num_periods;
  FOR i IN 1..p_num_periods LOOP
    v_period_start := p_start_date + ((i - 1) * v_days_per_period);
    v_period_end := CASE WHEN i = p_num_periods THEN p_end_date ELSE p_start_date + (i * v_days_per_period) - 1 END;
    v_period_name := CASE p_period_model
      WHEN 'trimestre' THEN i || 'er Trimestre'
      WHEN 'cuatrimestre' THEN i || 'er Cuatrimestre'
      WHEN 'bimestre' THEN i || 'er Bimestre'
      WHEN 'mes' THEN to_char(v_period_start, 'Month')
      ELSE i || 'er Periodo'
    END;

    INSERT INTO public.periods (name, start_date, end_date, status, is_active, school_year_id, sort_order, created_at)
    VALUES (v_period_name, v_period_start, v_period_end, 'open', (i = 1), v_new_year_id, i, now());
    v_created_periods := v_created_periods + 1;
  END LOOP;

  -- Copy classrooms
  IF p_copy_classrooms AND v_old_year IS NOT NULL THEN
    FOR v_classroom IN SELECT * FROM public.classrooms LOOP
      INSERT INTO public.classrooms (name, level, capacity, teacher_id, is_live)
      VALUES (v_classroom.name, v_classroom.level, v_classroom.capacity, v_classroom.teacher_id, false);
      v_copied_classrooms := v_copied_classrooms + 1;
    END LOOP;
  END IF;

  -- Copy payment plans
  IF v_old_year IS NOT NULL THEN
    BEGIN
      FOR v_plan IN SELECT * FROM public.payment_plans WHERE school_year_id = v_old_year AND is_active = true LOOP
        INSERT INTO public.payment_plans (name, description, amount, installments, is_active, school_year_id, created_at)
        VALUES (v_plan.name, v_plan.description, v_plan.amount, v_plan.installments, true, v_new_year_id, now());
      END LOOP;
    EXCEPTION WHEN undefined_column THEN NULL;
    END;
  END IF;

  -- Migrate active enrollments
  BEGIN
    IF v_old_year IS NOT NULL THEN
      FOR r IN SELECT se.*, s.name AS student_name
        FROM public.student_enrollments se
        JOIN public.students s ON s.id = se.student_id
        WHERE se.school_year_id = v_old_year AND se.status IN ('activo','inscrito','reinscrito')
      LOOP
        INSERT INTO public.student_enrollments (student_id, school_year_id, classroom_id, status, registration_date, created_at)
        VALUES (r.student_id, v_new_year_id, r.classroom_id, 'inscrito', now(), now())
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_new_enrollment_id;
      END LOOP;
    END IF;
  EXCEPTION WHEN undefined_column THEN NULL;
  END;

  INSERT INTO public.school_year_processes (school_year_id, process_type, label, status, executed_at, executed_by)
  VALUES (v_new_year_id, 'year_created', 'Ano escolar creado', 'completed', now(), v_user_id);

  RETURN jsonb_build_object(
    'success', true,
    'year_id', v_new_year_id,
    'periods_created', v_created_periods,
    'classrooms_copied', v_copied_classrooms
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_new_school_year_with_promotion(text,date,date,text,int,boolean,bigint) TO authenticated;

-- 6. RPC: Get pending transfer payments for review
CREATE OR REPLACE FUNCTION public.get_pending_transfer_payments()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid; v_role text;
  v_payments jsonb;
BEGIN
  v_user_id := auth.uid();
  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
  IF v_role NOT IN ('directora','admin','encargada','asistente') THEN
    RETURN jsonb_build_object('error', 'No autorizado');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', p.id, 'amount', p.amount, 'concept', p.concept, 'status', p.status,
    'method', p.method, 'bank', p.bank, 'reference', p.reference,
    'transfer_date', p.transfer_date, 'month_paid', p.month_paid,
    'proof_url', p.proof_url, 'evidence_url', p.evidence_url,
    'created_at', p.created_at, 'notes', p.notes,
    'student_id', p.student_id, 'student_name', s.name,
    'student_matricula', s.matricula, 'student_level', s.nivel,
    'classroom_name', c.name,
    'parent_name', s.p1_name, 'parent_phone', s.p1_phone
  ) ORDER BY p.created_at DESC), '[]'::jsonb) INTO v_payments
  FROM public.payments p
  JOIN public.students s ON s.id = p.student_id
  LEFT JOIN public.classrooms c ON c.id = s.classroom_id
  WHERE p.status = 'pending'
  AND (p.method = 'transferencia' OR p.proof_url IS NOT NULL OR p.evidence_url IS NOT NULL);

  RETURN jsonb_build_object('payments', v_payments, 'count', jsonb_array_length(v_payments));
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_pending_transfer_payments() TO authenticated;

-- 7. RPC: Review and approve/reject a transfer payment with full details
CREATE OR REPLACE FUNCTION public.review_transfer_payment(
  p_payment_id bigint,
  p_action text,
  p_notes text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid; v_role text; v_payment record;
BEGIN
  v_user_id := auth.uid();
  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
  IF v_role NOT IN ('directora','admin','encargada','asistente') THEN
    RETURN jsonb_build_object('error', 'No autorizado');
  END IF;

  SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Pago no encontrado'); END IF;

  IF p_action = 'approve' THEN
    UPDATE public.payments SET status = 'paid', paid_date = now(), notes = COALESCE(p_notes, notes) WHERE id = p_payment_id;
    UPDATE public.students SET is_active = true WHERE id = v_payment.student_id;
    INSERT INTO public.audit_logs (user_id, action, payload, created_at)
    VALUES (v_user_id, 'payment.transfer_approved', jsonb_build_object('payment_id', p_payment_id, 'amount', v_payment.amount), now());
    RETURN jsonb_build_object('success', true, 'action', 'approved');

  ELSIF p_action = 'reject' THEN
    UPDATE public.payments SET status = 'rejected', notes = COALESCE(p_notes, notes) WHERE id = p_payment_id;
    INSERT INTO public.audit_logs (user_id, action, payload, created_at)
    VALUES (v_user_id, 'payment.transfer_rejected', jsonb_build_object('payment_id', p_payment_id, 'amount', v_payment.amount), now());
    RETURN jsonb_build_object('success', true, 'action', 'rejected');

  ELSE
    RETURN jsonb_build_object('error', 'Accion no valida. Use approve o reject');
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.review_transfer_payment(bigint,text,text) TO authenticated;
