
-- Función para generar pagos de un mes específico
CREATE OR REPLACE FUNCTION public.generate_monthly_charges(p_month integer, p_year integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_gen_day int; v_due_day int;
  v_tgt_m int := p_month;
  v_tgt_y int := p_year;
  v_due_m int; v_due_y int;
  v_gen_cnt int := 0;
  v_due_date date; v_month_key text;
  v_role text;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role NOT IN ('directora','asistente','admin') THEN
    RAISE EXCEPTION 'Acceso denegado';
  END IF;
  SELECT COALESCE(generation_day,25), COALESCE(due_day,5) INTO v_gen_day, v_due_day
  FROM public.school_settings WHERE id = 1;
  IF v_gen_day IS NULL THEN RETURN jsonb_build_object('error','school_settings no encontrado'); END IF;
  
  v_month_key := v_tgt_y || '-' || LPAD(v_tgt_m::text,2,'0');
  
  -- Calcular fecha de vencimiento (siguiente mes al que se cobra)
  v_due_m := v_tgt_m + 1;
  v_due_y := v_tgt_y;
  IF v_due_m > 12 THEN v_due_m := 1; v_due_y := v_due_y + 1; END IF;
  v_due_date := make_date(v_due_y, v_due_m, v_due_day);
  
  -- Insertar pagos
  INSERT INTO public.payments (student_id, amount, status, due_date, month_paid, concept)
  SELECT s.id, s.monthly_fee, 'pending', v_due_date, v_month_key, 'Mensualidad'
  FROM public.students s
  WHERE s.is_active = true AND s.monthly_fee > 0 AND s.deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.payments p
      WHERE p.student_id = s.id AND p.month_paid = v_month_key AND p.deleted_at IS NULL);
  
  GET DIAGNOSTICS v_gen_cnt = ROW_COUNT;
  RETURN jsonb_build_object('generated', v_gen_cnt, 'month', v_month_key);
END;
$$;
GRANT EXECUTE ON FUNCTION public.generate_monthly_charges(integer, integer) TO authenticated;

