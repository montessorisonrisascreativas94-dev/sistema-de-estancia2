-- ============================================================
-- 04_funciones.sql — Colegio Montessori Sonrisas Creativas
-- Contenido: sección 7 (FUNCIONES)
-- ============================================================
-- ============================================================
-- 7. FUNCIONES
-- ============================================================

-- Obtener el rol del usuario actual
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT COALESCE(role, '') FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated, anon;

-- Verificar si el usuario es maestra de un salon
CREATE OR REPLACE FUNCTION public.is_teacher_of_classroom(p_classroom_id bigint)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.classrooms WHERE id = p_classroom_id AND teacher_id = auth.uid());
$$;

-- Verificar si el usuario es padre de un estudiante
CREATE OR REPLACE FUNCTION public.is_parent_of_student(p_student_id bigint)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.students WHERE id = p_student_id AND parent_id = auth.uid());
$$;

-- Verificar si el usuario es padre de algun estudiante de un salon
CREATE OR REPLACE FUNCTION public.is_parent_of_classroom(p_classroom_id bigint)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.students WHERE classroom_id = p_classroom_id AND parent_id = auth.uid());
$$;

-- Verificar si el usuario es maestra de un estudiante
CREATE OR REPLACE FUNCTION public.is_teacher_of_student(p_student_id bigint)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.students s
    JOIN public.classrooms c ON c.id = s.classroom_id
    WHERE s.id = p_student_id AND c.teacher_id = auth.uid()
  );
$$;

-- Obtener IDs de salones del padre actual
CREATE OR REPLACE FUNCTION public.get_my_classroom_ids()
RETURNS TABLE(ret_id bigint) LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT s.classroom_id::bigint FROM public.students s
  WHERE s.parent_id = auth.uid() AND s.classroom_id IS NOT NULL AND s.deleted_at IS NULL;
$$;

-- Verificar si un usuario es participante de una conversacion
CREATE OR REPLACE FUNCTION public.user_is_participant(p_conversation_id bigint, p_user_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = p_conversation_id AND user_id = p_user_id
  );
$$;

-- Verificar si un periodo esta abierto
CREATE OR REPLACE FUNCTION public.is_period_open(p_period_id bigint)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.periods WHERE id = p_period_id AND status = 'open');
$$;

-- Asignar estudiante a salon
CREATE OR REPLACE FUNCTION public.assign_student_to_classroom(p_student_id bigint, p_classroom_id bigint)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.students SET classroom_id = p_classroom_id WHERE id = p_student_id;
$$;
GRANT EXECUTE ON FUNCTION public.assign_student_to_classroom(bigint, bigint) TO authenticated;

-- Asignar estudiantes en masa
CREATE OR REPLACE FUNCTION public.assign_students_bulk(p_student_ids bigint[], p_classroom_id bigint)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.students SET classroom_id = p_classroom_id WHERE id = ANY(p_student_ids);
$$;
GRANT EXECUTE ON FUNCTION public.assign_students_bulk(bigint[], bigint) TO authenticated;

-- Calcular mora: 5% despues del dia 6
CREATE OR REPLACE FUNCTION public.calc_mora(p_due_date date, p_amount numeric DEFAULT 0)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v_days_late int;
BEGIN
  v_days_late := (CURRENT_DATE - p_due_date)::int;
  IF v_days_late <= 6 THEN RETURN 0; END IF;
  RETURN ROUND(p_amount * 0.05, 2);
END;
$$;

-- Vista de pagos con mora calculada
CREATE OR REPLACE VIEW public.v_payments_with_mora AS
SELECT
  p.*,
  public.calc_mora(p.due_date, p.amount) AS mora_amount,
  p.amount + public.calc_mora(p.due_date, p.amount) AS total_due,
  (CURRENT_DATE - p.due_date)::int AS days_late,
  s.name AS student_name,
  s.p1_name AS parent_name,
  s.p1_email AS parent_email,
  c.name AS classroom_name,
  ap.name AS approved_by_name
FROM public.payments p
LEFT JOIN public.students  s  ON s.id = p.student_id
LEFT JOIN public.classrooms c ON c.id = s.classroom_id
LEFT JOIN public.profiles  ap ON ap.id = p.validated_by
WHERE p.deleted_at IS NULL;
GRANT SELECT ON public.v_payments_with_mora TO authenticated;

-- Motor de planes de pago: generar cargos automaticos
CREATE OR REPLACE FUNCTION public.generate_student_charges(p_enrollment_id bigint, p_user_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_enrollment       public.student_enrollments%ROWTYPE;
  v_school_year      public.school_years%ROWTYPE;
  v_installment      public.plan_installments%ROWTYPE;
  v_start_date       date;
  v_due_date         date;
  v_charges_count    int := 0;
BEGIN
  SELECT * INTO v_enrollment FROM public.student_enrollments WHERE id = p_enrollment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inscripcion no encontrada'; END IF;
  SELECT * INTO v_school_year FROM public.school_years WHERE id = v_enrollment.school_year_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ano escolar no encontrado'; END IF;
  IF v_enrollment.payment_plan_id IS NULL THEN
    RETURN jsonb_build_object('status', 'warning', 'message', 'Sin plan de pago asignado');
  END IF;
  DELETE FROM public.student_charges
    WHERE student_enrollment_id = p_enrollment_id AND status IN ('pending') AND deleted_at IS NULL;
  FOR v_installment IN
    SELECT * FROM public.plan_installments
    WHERE payment_plan_id = v_enrollment.payment_plan_id ORDER BY month_number ASC
  LOOP
    v_start_date := v_school_year.start_date;
    v_due_date := (date_trunc('month', v_start_date) + (v_installment.due_month_offset || ' months')::interval)::date;
    v_due_date := v_due_date + (v_installment.due_day - 1) * interval '1 day';
    INSERT INTO public.student_charges(
      student_enrollment_id, plan_installment_id, type,
      concept, amount, due_date, status, generated_by, created_at
    ) VALUES (
      p_enrollment_id, v_installment.id, v_installment.type,
      CASE WHEN v_installment.is_registration THEN 'Inscripcion ' || v_school_year.name
           ELSE 'Colegiatura ' || v_installment.month_name || ' ' || v_school_year.name END,
      v_installment.amount, v_due_date, 'pending', p_user_id, DEFAULT
    );
    v_charges_count := v_charges_count + 1;
  END LOOP;
  RETURN jsonb_build_object('status', 'success', 'charges_count', v_charges_count, 'message', 'Cargos generados correctamente');
END;
$$;
GRANT EXECUTE ON FUNCTION public.generate_student_charges(bigint, uuid) TO authenticated;

-- Trigger para generar cargos automaticamente al inscribir
CREATE OR REPLACE FUNCTION public.trigger_generate_charges_on_enroll()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.payment_plan_id IS NOT NULL
    AND OLD.payment_plan_id IS DISTINCT FROM NEW.payment_plan_id
    AND NEW.status IN ('inscrito', 'activo') THEN
    PERFORM public.generate_student_charges(NEW.id, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trigger_on_enrollment_change ON public.student_enrollments;
CREATE TRIGGER trigger_on_enrollment_change
AFTER INSERT OR UPDATE ON public.student_enrollments
FOR EACH ROW EXECUTE FUNCTION public.trigger_generate_charges_on_enroll();

-- Ciclo de pagos con regla de gracia
CREATE OR REPLACE FUNCTION public.run_payment_cycle()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_now           date := current_date;
  v_gen_day       int;
  v_due_day       int;
  v_target_month  text;
  v_due_date      date;
  v_generated     int := 0;
  v_expired       int := 0;
  v_student       record;
  v_start_day     int;
  v_first_billing text;
  v_first_m       int;
  v_first_y       int;
  v_role          text;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role NOT IN ('directora','asistente','admin','encargada') THEN RAISE EXCEPTION 'Acceso denegado'; END IF;
  SELECT COALESCE(generation_day, 25), COALESCE(due_day, 5) INTO v_gen_day, v_due_day
  FROM public.school_settings WHERE id = 1;
  v_target_month := to_char(v_now + interval '1 month', 'YYYY-MM');
  v_due_date := (date_trunc('month', v_now + interval '2 months') + (v_due_day - 1) * interval '1 day')::date;
  FOR v_student IN
    SELECT s.id, s.monthly_fee, s.start_date
    FROM public.students s
    WHERE s.is_active = true AND s.monthly_fee > 0 AND s.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.payments p WHERE p.student_id = s.id AND p.month_paid = v_target_month)
  LOOP
    IF v_student.start_date IS NOT NULL THEN
      v_start_day := EXTRACT(DAY FROM v_student.start_date)::int;
      IF v_start_day < v_gen_day THEN
        v_first_m := EXTRACT(MONTH FROM v_student.start_date)::int;
        v_first_y := EXTRACT(YEAR FROM v_student.start_date)::int;
        IF v_first_m = 12 THEN v_first_m := 1; v_first_y := v_first_y + 1; ELSE v_first_m := v_first_m + 1; END IF;
      ELSE
        v_first_m := EXTRACT(MONTH FROM v_student.start_date)::int + 2;
        v_first_y := EXTRACT(YEAR FROM v_student.start_date)::int;
        IF v_first_m > 12 THEN v_first_m := v_first_m - 12; v_first_y := v_first_y + 1; END IF;
      END IF;
      v_first_billing := v_first_y || '-' || LPAD(v_first_m::text, 2, '0');
      IF v_target_month < v_first_billing THEN CONTINUE; END IF;
    END IF;
    INSERT INTO public.payments (student_id, amount, status, due_date, month_paid, concept, created_at)
    VALUES (v_student.id, v_student.monthly_fee, 'pending', v_due_date, v_target_month, 'Mensualidad', now())
    ON CONFLICT DO NOTHING;
    v_generated := v_generated + 1;
  END LOOP;
  UPDATE public.payments SET status = 'overdue', updated_at = now()
  WHERE status = 'pending' AND due_date < v_now;
  GET DIAGNOSTICS v_expired = ROW_COUNT;
  RETURN jsonb_build_object('generated', v_generated, 'expired', v_expired, 'month', v_target_month, 'due_date', v_due_date::text, 'gen_day', v_gen_day);
END;
$$;
GRANT EXECUTE ON FUNCTION public.run_payment_cycle() TO authenticated;

-- Exonerar mora
CREATE OR REPLACE FUNCTION public.waive_payment_mora(p_payment_id bigint, p_reason text DEFAULT 'Mora exonerada')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_role text;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role NOT IN ('directora','asistente','admin','encargada') THEN RETURN jsonb_build_object('error', 'No autorizado'); END IF;
  UPDATE public.payments SET due_date = CURRENT_DATE, last_reminder_sent = NULL,
    notes = COALESCE(notes || ' | ', '') || p_reason || ' (' || to_char(now(), 'DD/MM/YYYY') || ')'
  WHERE id = p_payment_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Pago no encontrado'); END IF;
  RETURN jsonb_build_object('success', true, 'payment_id', p_payment_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.waive_payment_mora(bigint, text) TO authenticated;

-- Reiniciar pago a pendiente
CREATE OR REPLACE FUNCTION public.reset_payment_to_pending(p_payment_id bigint, p_reason text DEFAULT 'Reiniciado por administracion')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_role text;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role NOT IN ('directora','asistente','admin','encargada') THEN RETURN jsonb_build_object('error', 'No autorizado'); END IF;
  UPDATE public.payments SET status = 'pending', due_date = CURRENT_DATE + INTERVAL '7 days',
    last_reminder_sent = NULL,
    notes = COALESCE(notes || ' | ', '') || p_reason || ' (' || to_char(now(), 'DD/MM/YYYY HH24:MI') || ')'
  WHERE id = p_payment_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Pago no encontrado'); END IF;
  RETURN jsonb_build_object('success', true, 'payment_id', p_payment_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.reset_payment_to_pending(bigint, text) TO authenticated;

-- Aprobar pago
CREATE OR REPLACE FUNCTION public.approve_payment(p_payment_id bigint, p_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user_id uuid; v_role text; v_payment payments%ROWTYPE;
BEGIN
  v_user_id := auth.uid();
  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
  IF v_role NOT IN ('directora','asistente','admin','encargada') THEN RETURN jsonb_build_object('error', 'No autorizado'); END IF;
  SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Pago no encontrado'); END IF;
  UPDATE public.payments SET status = 'paid', paid_date = now(), validated_by = v_user_id, notes = COALESCE(p_notes, notes)
  WHERE id = p_payment_id;
  RETURN jsonb_build_object('success', true, 'payment_id', p_payment_id, 'approved_by', v_user_id, 'approved_at', now());
END;
$$;
GRANT EXECUTE ON FUNCTION public.approve_payment(bigint, text) TO authenticated;

-- Eliminar pago (soft delete)
CREATE OR REPLACE FUNCTION public.delete_payment(p_payment_id bigint, p_reason text DEFAULT 'Eliminado')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user_id uuid; v_role text;
BEGIN
  v_user_id := auth.uid();
  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
  IF v_role NOT IN ('directora','asistente','admin','encargada') THEN RETURN jsonb_build_object('error', 'No autorizado'); END IF;
  UPDATE public.payments SET deleted_at = now(),
    notes = COALESCE(notes || ' | ', '') || p_reason || ' (' || to_char(now(), 'DD/MM/YYYY HH24:MI') || ')'
  WHERE id = p_payment_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Pago no encontrado'); END IF;
  RETURN jsonb_build_object('success', true, 'payment_id', p_payment_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.delete_payment(bigint, text) TO authenticated;

-- Buscar o crear conversacion privada
CREATE OR REPLACE FUNCTION public.find_or_create_private_conversation(p_user1 uuid, p_user2 uuid)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_conv_id bigint;
BEGIN
  SELECT cp1.conversation_id INTO v_conv_id
  FROM public.conversation_participants cp1
  JOIN public.conversation_participants cp2 ON cp2.conversation_id = cp1.conversation_id AND cp2.user_id = p_user2
  JOIN public.conversations c ON c.id = cp1.conversation_id AND c.type = 'direct_message'
  WHERE cp1.user_id = p_user1 LIMIT 1;
  IF v_conv_id IS NOT NULL THEN RETURN v_conv_id; END IF;
  INSERT INTO public.conversations (type) VALUES ('direct_message') RETURNING id INTO v_conv_id;
  INSERT INTO public.conversation_participants (conversation_id, user_id) VALUES (v_conv_id, p_user1), (v_conv_id, p_user2) ON CONFLICT DO NOTHING;
  RETURN v_conv_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.find_or_create_private_conversation(uuid, uuid) TO authenticated;

-- Obtener mensajes directos
CREATE OR REPLACE FUNCTION public.get_direct_messages(p_other_user_id uuid)
RETURNS TABLE (
  id bigint, conversation_id bigint, sender_id uuid, receiver_id uuid,
  content text, is_read boolean, created_at timestamp with time zone,
  sender_name text, sender_avatar text
) LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT m.id, m.conversation_id, m.sender_id, m.receiver_id, m.content, m.is_read, m.created_at,
    p.name AS sender_name, p.avatar_url AS sender_avatar
  FROM public.messages m
  LEFT JOIN public.profiles p ON m.sender_id = p.id
  WHERE m.conversation_id = (
    SELECT c.id FROM public.conversations c
    WHERE c.type IN ('direct_message','private')
      AND EXISTS (SELECT 1 FROM public.conversation_participants x WHERE x.conversation_id = c.id AND x.user_id = auth.uid())
      AND EXISTS (SELECT 1 FROM public.conversation_participants y WHERE y.conversation_id = c.id AND y.user_id = p_other_user_id)
    LIMIT 1
  )
  ORDER BY m.created_at ASC LIMIT 50;
$$;
GRANT EXECUTE ON FUNCTION public.get_direct_messages(uuid) TO authenticated;

-- Marcar mensajes como leidos
CREATE OR REPLACE FUNCTION public.mark_messages_read(p_conversation_id bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR p_conversation_id IS NULL THEN RETURN; END IF;
  UPDATE public.messages SET is_read = true
  WHERE conversation_id = p_conversation_id AND sender_id <> auth.uid() AND (is_read IS NULL OR is_read = false);
END;
$$;
GRANT EXECUTE ON FUNCTION public.mark_messages_read(bigint) TO authenticated;

-- Obtener conteo de mensajes no leidos
CREATE OR REPLACE FUNCTION public.get_unread_counts()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user_id uuid := auth.uid(); v_result jsonb := '{}'::jsonb;
BEGIN
  IF v_user_id IS NULL THEN RETURN v_result; END IF;
  SELECT jsonb_object_agg(m.sender_id, m.count) INTO v_result
  FROM (
    SELECT m.sender_id, count(*) AS count
    FROM public.messages m
    JOIN public.conversation_participants cp ON cp.conversation_id = m.conversation_id AND cp.user_id = v_user_id
    WHERE m.sender_id <> v_user_id AND (m.is_read IS NULL OR m.is_read = false)
    GROUP BY m.sender_id
  ) m;
  v_result := jsonb_set(coalesce(v_result, '{}'::jsonb), '{total}', to_jsonb(
    coalesce((SELECT sum(count::bigint) FROM jsonb_each_text(coalesce(v_result, '{}'::jsonb)) as t(key, count)), 0)
  ));
  RETURN v_result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_unread_counts() TO authenticated;

-- Procesar ponche de puerta (asistencia QR)
CREATE OR REPLACE FUNCTION public.process_door_punch(p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_student  record; v_staff record; v_settings record;
  v_today    date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
  v_now      timestamp with time zone := now();
  v_local    time := (v_now AT TIME ZONE 'America/Santo_Domingo')::time;
  v_type     text; v_name text; v_role text; v_parent uuid;
  v_exist    record; v_att record; v_status text := 'present';
BEGIN
  IF p_code IS NULL OR length(trim(p_code)) < 3 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Codigo QR invalido');
  END IF;
  SELECT * INTO v_student FROM public.students WHERE matricula = trim(p_code) AND is_active = true LIMIT 1;
  IF FOUND THEN
    v_name := v_student.name; v_role := 'Estudiante'; v_parent := v_student.parent_id;
    SELECT * INTO v_settings FROM public.school_settings WHERE id = 1;
    SELECT * INTO v_exist FROM public.door_punches WHERE student_id = v_student.id AND date = v_today AND punch_type = 'check_in';
    IF NOT FOUND THEN
      v_type := 'check_in';
      IF v_settings.check_in_end IS NOT NULL AND v_local > v_settings.check_in_end THEN v_status := 'late'; END IF;
      SELECT * INTO v_att FROM public.attendance WHERE student_id = v_student.id AND date = v_today;
      IF v_att.id IS NULL THEN
        INSERT INTO public.attendance (student_id, classroom_id, date, status, check_in) VALUES (v_student.id, v_student.classroom_id, v_today, v_status, v_now);
      ELSE
        UPDATE public.attendance SET status = v_status, check_in = v_now WHERE id = v_att.id;
      END IF;
      INSERT INTO public.door_punches (student_id, punch_type, punched_at, date) VALUES (v_student.id, 'check_in', v_now, v_today) ON CONFLICT DO NOTHING;
    ELSE
      SELECT * INTO v_exist FROM public.door_punches WHERE student_id = v_student.id AND date = v_today AND punch_type = 'check_out';
      IF NOT FOUND THEN
        v_type := 'check_out'; v_status := 'retirado';
        SELECT * INTO v_att FROM public.attendance WHERE student_id = v_student.id AND date = v_today;
        IF v_att.id IS NOT NULL THEN UPDATE public.attendance SET check_out = v_now, status = 'retirado' WHERE id = v_att.id; END IF;
        INSERT INTO public.door_punches (student_id, punch_type, punched_at, date) VALUES (v_student.id, 'check_out', v_now, v_today) ON CONFLICT DO NOTHING;
      ELSE
        RETURN jsonb_build_object('success', false, 'message', v_name || ' ya registro entrada y salida hoy');
      END IF;
    END IF;
    RETURN jsonb_build_object('success', true, 'type', v_type, 'name', v_name, 'role', v_role, 'status', v_status, 'student_id', v_student.id, 'parent_id', v_parent, 'time', to_char(v_now AT TIME ZONE 'America/Santo_Domingo', 'HH12:MI AM'));
  END IF;
  SELECT * INTO v_staff FROM public.profiles WHERE (notes = p_code OR matricula = p_code OR access_code = p_code) AND role IN ('maestra','asistente','directora','admin','encargada') LIMIT 1;
  IF NOT FOUND THEN BEGIN SELECT * INTO v_staff FROM public.profiles WHERE id = p_code::uuid AND role IN ('maestra','asistente','directora','admin','encargada') LIMIT 1; EXCEPTION WHEN OTHERS THEN NULL; END; END IF;
  IF FOUND THEN
    v_name := v_staff.name; v_role := initcap(v_staff.role);
    SELECT * INTO v_exist FROM public.door_punches WHERE staff_id = v_staff.id AND date = v_today AND punch_type = 'check_in';
    IF NOT FOUND THEN
      v_type := 'check_in';
      INSERT INTO public.door_punches (staff_id, punch_type, punched_at, date) VALUES (v_staff.id, 'check_in', v_now, v_today) ON CONFLICT DO NOTHING;
    ELSE
      SELECT * INTO v_exist FROM public.door_punches WHERE staff_id = v_staff.id AND date = v_today AND punch_type = 'check_out';
      IF NOT FOUND THEN
        v_type := 'check_out';
        INSERT INTO public.door_punches (staff_id, punch_type, punched_at, date) VALUES (v_staff.id, 'check_out', v_now, v_today) ON CONFLICT DO NOTHING;
      ELSE
        RETURN jsonb_build_object('success', false, 'message', v_name || ' ya registro entrada y salida hoy');
      END IF;
    END IF;
    RETURN jsonb_build_object('success', true, 'type', v_type, 'name', v_name, 'role', v_role, 'status', 'present', 'student_id', null, 'parent_id', null, 'time', to_char(v_now AT TIME ZONE 'America/Santo_Domingo', 'HH12:MI AM'));
  END IF;
  RETURN jsonb_build_object('success', false, 'message', 'QR no registrado en el sistema');
END;
$$;
GRANT EXECUTE ON FUNCTION public.process_door_punch(text) TO authenticated, anon;

-- Obtener periodo activo global
CREATE OR REPLACE FUNCTION public.get_current_period()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_period periods%ROWTYPE;
BEGIN
  SELECT * INTO v_period FROM public.periods WHERE is_active = true ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN SELECT * INTO v_period FROM public.periods WHERE status = 'open' ORDER BY created_at DESC LIMIT 1; END IF;
  IF NOT FOUND THEN RETURN jsonb_build_object('found', false); END IF;
  RETURN jsonb_build_object('found', true, 'id', v_period.id, 'name', v_period.name, 'status', v_period.status, 'is_active', v_period.is_active, 'start_date', v_period.start_date, 'end_date', v_period.end_date, 'classroom_id', v_period.classroom_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_current_period() TO authenticated;

-- Obtener periodo activo para un salon
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
  RETURN jsonb_build_object('found', true, 'id', v_period.id, 'name', v_period.name, 'status', v_period.status, 'is_active', v_period.is_active, 'start_date', v_period.start_date, 'end_date', v_period.end_date, 'classroom_id', v_period.classroom_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_active_period(bigint) TO authenticated;

-- Obtener tareas por periodo
CREATE OR REPLACE FUNCTION public.get_tasks_for_period(p_classroom_id bigint, p_period_id bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_period_id bigint := p_period_id; v_result jsonb;
BEGIN
  IF v_period_id IS NULL THEN
    SELECT id INTO v_period_id FROM public.periods WHERE classroom_id = p_classroom_id AND is_active = true ORDER BY created_at DESC LIMIT 1;
    IF v_period_id IS NULL THEN SELECT id INTO v_period_id FROM public.periods WHERE classroom_id = p_classroom_id AND status = 'open' ORDER BY created_at DESC LIMIT 1; END IF;
  END IF;
  SELECT jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'description', t.description, 'due_date', t.due_date, 'file_url', t.file_url, 'grading_system', t.grading_system, 'classroom_id', t.classroom_id, 'period_id', t.period_id, 'created_at', t.created_at) ORDER BY t.due_date ASC) INTO v_result
  FROM public.tasks t WHERE t.classroom_id = p_classroom_id AND (v_period_id IS NULL OR t.period_id = v_period_id OR (t.period_id IS NULL AND v_period_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.periods p WHERE p.id = v_period_id AND t.created_at BETWEEN p.start_date AND p.end_date + INTERVAL '1 day')));
  RETURN jsonb_build_object('tasks', COALESCE(v_result, '[]'::jsonb), 'period_id', v_period_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_tasks_for_period(bigint, bigint) TO authenticated;

-- Obtener posts por periodo
CREATE OR REPLACE FUNCTION public.get_posts_for_period(p_classroom_id bigint DEFAULT NULL, p_period_id bigint DEFAULT NULL, p_limit int DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_period_id bigint := p_period_id; v_result jsonb;
BEGIN
  IF v_period_id IS NULL AND p_classroom_id IS NOT NULL THEN
    SELECT id INTO v_period_id FROM public.periods WHERE classroom_id = p_classroom_id AND is_active = true ORDER BY created_at DESC LIMIT 1;
    IF v_period_id IS NULL THEN SELECT id INTO v_period_id FROM public.periods WHERE classroom_id = p_classroom_id AND status = 'open' ORDER BY created_at DESC LIMIT 1; END IF;
  END IF;
  SELECT jsonb_agg(jsonb_build_object('id', p.id, 'content', p.content, 'media_url', p.media_url, 'media_type', p.media_type, 'image_url', p.image_url, 'created_at', p.created_at, 'classroom_id', p.classroom_id, 'period_id', p.period_id, 'teacher_id', p.teacher_id, 'teacher', jsonb_build_object('name', COALESCE(pr.name, p.teacher_name, 'Maestra'), 'avatar_url', COALESCE(pr.avatar_url, p.teacher_avatar), 'role', pr.role), 'likes', COALESCE((SELECT jsonb_agg(jsonb_build_object('user_id', l.user_id, 'id', l.id)) FROM public.likes l WHERE l.post_id = p.id), '[]'::jsonb), 'comments', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'content', c.content, 'user_name', c.user_name, 'user_id', c.user_id, 'created_at', c.created_at) ORDER BY c.created_at ASC) FROM public.comments c WHERE c.post_id = p.id), '[]'::jsonb)) ORDER BY p.created_at DESC) INTO v_result
  FROM public.posts p LEFT JOIN public.profiles pr ON pr.id = p.teacher_id
  WHERE (p.classroom_id = p_classroom_id OR p.classroom_id IS NULL) AND (v_period_id IS NULL OR p.period_id = v_period_id OR (p.period_id IS NULL AND v_period_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.periods per WHERE per.id = v_period_id AND p.created_at BETWEEN per.start_date AND per.end_date + INTERVAL '1 day')))
  LIMIT p_limit;
  RETURN jsonb_build_object('posts', COALESCE(v_result, '[]'::jsonb), 'period_id', v_period_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_posts_for_period(bigint, bigint, int) TO authenticated;

-- Obtener posts para padres
CREATE OR REPLACE FUNCTION public.get_posts_for_parent(p_classroom_id bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_result jsonb;
BEGIN
  SELECT jsonb_agg(jsonb_build_object('id', p.id, 'content', p.content, 'media_url', p.media_url, 'media_type', p.media_type, 'image_url', p.image_url, 'created_at', p.created_at, 'classroom_id', p.classroom_id, 'teacher_id', p.teacher_id, 'teacher', jsonb_build_object('name', COALESCE(pr.name, p.teacher_name, 'Maestra'), 'avatar_url', COALESCE(pr.avatar_url, p.teacher_avatar), 'role', pr.role), 'likes', COALESCE((SELECT jsonb_agg(jsonb_build_object('user_id', l.user_id, 'id', l.id)) FROM public.likes l WHERE l.post_id = p.id), '[]'::jsonb), 'comments', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'content', c.content, 'user_name', c.user_name, 'user_id', c.user_id, 'created_at', c.created_at) ORDER BY c.created_at ASC) FROM public.comments c WHERE c.post_id = p.id), '[]'::jsonb)) ORDER BY p.created_at DESC) INTO v_result
  FROM public.posts p LEFT JOIN public.profiles pr ON pr.id = p.teacher_id
  WHERE p.classroom_id IS NULL OR (p_classroom_id IS NOT NULL AND p.classroom_id = p_classroom_id);
  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_posts_for_parent(bigint) TO authenticated, anon;

-- Activar periodo
CREATE OR REPLACE FUNCTION public.activate_period(p_period_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user_id uuid; v_role text; v_period periods%ROWTYPE; v_old_id bigint;
BEGIN
  v_user_id := auth.uid();
  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
  IF v_role NOT IN ('directora','admin') THEN RETURN jsonb_build_object('error', 'Solo la directora puede activar periodos'); END IF;
  SELECT * INTO v_period FROM public.periods WHERE id = p_period_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Periodo no encontrado'); END IF;
  SELECT id INTO v_old_id FROM public.periods WHERE is_active = true LIMIT 1;
  UPDATE public.periods SET is_active = false WHERE classroom_id = v_period.classroom_id OR classroom_id IS NULL;
  UPDATE public.periods SET is_active = true, status = 'open' WHERE id = p_period_id;
  INSERT INTO public.audit_logs (user_id, action, payload, created_at) VALUES (v_user_id, 'period.activated', jsonb_build_object('new_period_id', p_period_id, 'new_period_name', v_period.name, 'old_period_id', v_old_id), now());
  RETURN jsonb_build_object('success', true, 'period_id', p_period_id, 'period_name', v_period.name, 'old_period_id', v_old_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.activate_period(bigint) TO authenticated;

-- Obtener historial de estudiante (con acceso parent + school_year)
CREATE OR REPLACE FUNCTION public.get_student_history(p_student_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_role text; v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
  IF v_role NOT IN ('directora','asistente','admin','encargada') THEN
    IF NOT EXISTS (SELECT 1 FROM public.students WHERE id = p_student_id AND parent_id = v_user_id) THEN
      RETURN jsonb_build_object('error', 'No autorizado');
    END IF;
  END IF;
  RETURN (
    SELECT jsonb_agg(jsonb_build_object(
      'period_id', rc.period_id, 'period_name', p.name, 'period_status', p.status,
      'classroom_id', rc.classroom_id, 'classroom_name', c.name,
      'task_avg', rc.task_avg, 'formal_avg', rc.formal_avg, 'final_score', rc.final_score,
      'level', rc.level, 'teacher_comment', rc.teacher_comment,
      'school_year_id', rc.school_year_id, 'school_year_name', sy.name, 'created_at', rc.created_at
    ) ORDER BY p.start_date DESC)
    FROM public.report_cards rc
    JOIN public.periods p ON p.id = rc.period_id
    LEFT JOIN public.classrooms c ON c.id = rc.classroom_id
    LEFT JOIN public.school_years sy ON sy.id = rc.school_year_id
    WHERE rc.student_id = p_student_id
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_student_history(bigint) TO authenticated;

-- Cerrar periodo y calcular promedios (con school_year_id)
CREATE OR REPLACE FUNCTION public.close_period(p_period_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_period periods%ROWTYPE; v_user_id uuid; v_role text; v_student record;
  v_avg numeric(5,2); v_task_avg numeric(5,2); v_formal_avg numeric(5,2); v_level text;
  v_cards_updated int := 0;
BEGIN
  v_user_id := auth.uid();
  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
  IF v_role NOT IN ('directora','admin') THEN RETURN jsonb_build_object('error', 'Solo la directora puede cerrar periodos'); END IF;
  SELECT * INTO v_period FROM public.periods WHERE id = p_period_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Periodo no encontrado'); END IF;
  IF v_period.status = 'closed' THEN RETURN jsonb_build_object('error', 'El periodo ya esta cerrado'); END IF;
  FOR v_student IN
    SELECT s.id AS student_id, s.name AS student_name FROM public.students s
    WHERE s.classroom_id = v_period.classroom_id AND s.is_active = true
  LOOP
    SELECT ROUND(AVG(CASE WHEN te.numeric_score IS NOT NULL AND te.numeric_score >= 0 THEN te.numeric_score WHEN te.stars IS NOT NULL AND te.stars > 0 THEN te.stars * 20 WHEN te.grade_letter = 'A' THEN 95 WHEN te.grade_letter = 'B' THEN 85 WHEN te.grade_letter = 'C' THEN 75 WHEN te.grade_letter = 'D' THEN 60 WHEN te.grade_letter = 'E' THEN 40 ELSE NULL END), 2) INTO v_task_avg
    FROM public.task_evidences te JOIN public.tasks t ON t.id = te.task_id
    WHERE te.student_id = v_student.student_id AND t.classroom_id = v_period.classroom_id AND te.status = 'graded' AND t.created_at BETWEEN v_period.start_date AND v_period.end_date + INTERVAL '1 day';
    SELECT ROUND(AVG(CASE WHEN g.numeric_score IS NOT NULL AND g.numeric_score >= 0 THEN g.numeric_score WHEN g.score IS NOT NULL AND g.score > 0 THEN g.score * 20 ELSE NULL END), 2) INTO v_formal_avg
    FROM public.grades g WHERE g.student_id = v_student.student_id AND g.period_id = p_period_id;
    IF v_task_avg IS NOT NULL AND v_formal_avg IS NOT NULL THEN v_avg := ROUND((v_task_avg * 0.6) + (v_formal_avg * 0.4), 2);
    ELSIF v_task_avg IS NOT NULL THEN v_avg := v_task_avg;
    ELSIF v_formal_avg IS NOT NULL THEN v_avg := v_formal_avg;
    ELSE v_avg := NULL; END IF;
    v_level := CASE WHEN v_avg IS NULL THEN 'Sin calificar' WHEN v_avg >= 95 THEN 'Excelente' WHEN v_avg >= 85 THEN 'Muy Bueno' WHEN v_avg >= 75 THEN 'Bueno' WHEN v_avg >= 60 THEN 'Aceptable' WHEN v_avg >= 50 THEN 'Requiere Mejoras' ELSE 'Bajo Desempeno' END;
    INSERT INTO public.report_cards (student_id, classroom_id, period_id, school_year_id, task_avg, formal_avg, final_score, level, created_at)
    VALUES (v_student.student_id, v_period.classroom_id, p_period_id, v_period.school_year_id, v_task_avg, v_formal_avg, v_avg, v_level, now())
    ON CONFLICT (student_id, period_id) DO UPDATE SET task_avg = EXCLUDED.task_avg, formal_avg = EXCLUDED.formal_avg, final_score = EXCLUDED.final_score, level = EXCLUDED.level, school_year_id = EXCLUDED.school_year_id;
    v_cards_updated := v_cards_updated + 1;
  END LOOP;
  UPDATE public.periods SET status = 'closed', is_active = false WHERE id = p_period_id;
  INSERT INTO public.audit_logs (user_id, action, payload, created_at) VALUES (v_user_id, 'period.closed', jsonb_build_object('period_id', p_period_id, 'period_name', v_period.name, 'cards_generated', v_cards_updated), now());
  RETURN jsonb_build_object('success', true, 'period_id', p_period_id, 'period_name', v_period.name, 'cards_generated', v_cards_updated);
END;
$$;
GRANT EXECUTE ON FUNCTION public.close_period(bigint) TO authenticated;

-- Crear ano escolar con periodos
CREATE OR REPLACE FUNCTION public.create_school_year_with_periods(
  p_name text, p_start_date date, p_end_date date, p_classroom_ids bigint[] DEFAULT NULL, p_num_periods int DEFAULT 3
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid; v_role text; v_year_id bigint; v_classroom_id bigint;
  v_total_days int; v_period_days int; v_period_start date; v_period_end date; v_period_name text;
  v_period_names text[] := ARRAY['1er Trimestre','2do Trimestre','3er Trimestre','4to Trimestre'];
  v_created_periods int := 0;
BEGIN
  v_user_id := auth.uid();
  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
  IF v_role NOT IN ('directora','admin') THEN RETURN jsonb_build_object('error', 'Solo la directora puede crear anos escolares'); END IF;
  IF p_start_date >= p_end_date THEN RETURN jsonb_build_object('error', 'La fecha de inicio debe ser anterior a la fecha de fin'); END IF;
  INSERT INTO public.school_years (name, start_date, end_date, status) VALUES (p_name, p_start_date, p_end_date, 'upcoming') RETURNING id INTO v_year_id;
  v_total_days := p_end_date - p_start_date;
  v_period_days := v_total_days / p_num_periods;
  v_period_start := p_start_date;
  IF p_classroom_ids IS NULL OR array_length(p_classroom_ids, 1) IS NULL THEN
    SELECT array_agg(c.id) INTO p_classroom_ids FROM public.classrooms c WHERE c.is_active = true;
  END IF;
  IF p_classroom_ids IS NOT NULL THEN
    FOREACH v_classroom_id IN ARRAY p_classroom_ids LOOP
      FOR i IN 1..p_num_periods LOOP
        v_period_end := v_period_start + (v_period_days || ' days')::interval - INTERVAL '1 day';
        IF i = p_num_periods THEN v_period_end := p_end_date; END IF;
        v_period_name := COALESCE(v_period_names[i], i || ' Periodo');
        INSERT INTO public.periods (name, start_date, end_date, status, is_active, classroom_id, school_year_id)
        VALUES (v_period_name || ' ' || p_name, v_period_start, v_period_end, 'open', (i = 1), v_classroom_id, v_year_id);
        v_created_periods := v_created_periods + 1;
        v_period_start := v_period_end + INTERVAL '1 day';
      END LOOP;
      v_period_start := p_start_date;
    END LOOP;
  END IF;
  INSERT INTO public.audit_logs (user_id, action, payload, created_at) VALUES (v_user_id, 'school_year.created', jsonb_build_object('year_id', v_year_id, 'name', p_name, 'periods_created', v_created_periods), now());
  RETURN jsonb_build_object('success', true, 'school_year_id', v_year_id, 'name', p_name, 'periods_created', v_created_periods);
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_school_year_with_periods(text, date, date, bigint[], int) TO authenticated;

-- Dashboard KPIs
CREATE OR REPLACE FUNCTION public.get_dashboard_kpis()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_total_students int; v_active_students int; v_total_classrooms int; v_total_teachers int;
  v_total_payments int; v_paid_payments int; v_pending_payments int; v_overdue_payments int;
BEGIN
  SELECT COUNT(*) INTO v_total_students FROM public.students WHERE deleted_at IS NULL;
  SELECT COUNT(*) INTO v_active_students FROM public.students WHERE is_active = true AND deleted_at IS NULL;
  SELECT COUNT(*) INTO v_total_classrooms FROM public.classrooms;
  SELECT COUNT(*) INTO v_total_teachers FROM public.profiles WHERE role = 'maestra' AND deleted_at IS NULL;
  SELECT COUNT(*) INTO v_total_payments FROM public.payments WHERE deleted_at IS NULL;
  SELECT COUNT(*) INTO v_paid_payments FROM public.payments WHERE status = 'paid' AND deleted_at IS NULL;
  SELECT COUNT(*) INTO v_pending_payments FROM public.payments WHERE status = 'pending' AND deleted_at IS NULL;
  SELECT COUNT(*) INTO v_overdue_payments FROM public.payments WHERE status = 'overdue' AND deleted_at IS NULL;
  RETURN jsonb_build_object('total_students', v_total_students, 'active_students', v_active_students, 'total_classrooms', v_total_classrooms, 'total_teachers', v_total_teachers, 'total_payments', v_total_payments, 'paid_payments', v_paid_payments, 'pending_payments', v_pending_payments, 'overdue_payments', v_overdue_payments);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_dashboard_kpis() TO authenticated;

-- Generar numero de factura
CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_prefix text; v_counter bigint; v_year text; v_month text; v_invoice_number text;
BEGIN
  SELECT invoice_prefix, invoice_counter INTO v_prefix, v_counter FROM public.school_settings WHERE id = 1;
  v_year := to_char(now(), 'YYYY'); v_month := to_char(now(), 'MM');
  v_invoice_number := v_prefix || v_year || '-' || v_month || '-' || lpad(v_counter::text, 5, '0');
  UPDATE public.school_settings SET invoice_counter = invoice_counter + 1, updated_at = now() WHERE id = 1;
  RETURN v_invoice_number;
END;
$$;

-- Generar factura desde un pago
CREATE OR REPLACE FUNCTION public.generate_invoice(p_payment_id bigint, p_issued_by uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_payment payments%ROWTYPE; v_student students%ROWTYPE; v_classroom classrooms%ROWTYPE;
  v_parent profiles%ROWTYPE; v_issued_by profiles%ROWTYPE; v_settings school_settings%ROWTYPE;
  v_invoice_number text; v_invoice_id bigint; v_tax_amount numeric(10,2); v_total numeric(10,2);
BEGIN
  SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Pago no encontrado'); END IF;
  SELECT * INTO v_student FROM public.students WHERE id = v_payment.student_id;
  IF v_student.classroom_id IS NOT NULL THEN SELECT * INTO v_classroom FROM public.classrooms WHERE id = v_student.classroom_id; END IF;
  IF v_student.parent_id IS NOT NULL THEN SELECT * INTO v_parent FROM public.profiles WHERE id = v_student.parent_id; END IF;
  IF p_issued_by IS NOT NULL THEN SELECT * INTO v_issued_by FROM public.profiles WHERE id = p_issued_by; END IF;
  SELECT * INTO v_settings FROM public.school_settings WHERE id = 1;
  v_invoice_number := public.generate_invoice_number();
  v_tax_amount := (v_payment.amount * v_settings.tax_rate) / 100;
  v_total := v_payment.amount + v_tax_amount;
  INSERT INTO public.invoices (
    invoice_number, payment_id, student_id, student_name, student_matricula, classroom_name,
    parent_name, parent_phone, concept, amount, subtotal, tax_amount, total, tax_rate, currency,
    status, payment_method, payment_date, due_date, school_name, school_rnc, school_address,
    school_phone, school_email, school_website, school_logo_url, issued_by, issued_by_name,
    notes, footer_note, terms
  ) VALUES (
    v_invoice_number, p_payment_id, v_payment.student_id, v_student.name, v_student.matricula,
    v_classroom.name, v_parent.name, v_parent.phone, v_payment.concept, v_payment.amount,
    v_payment.amount, v_tax_amount, v_total, v_settings.tax_rate, v_settings.currency,
    CASE WHEN v_payment.status = 'paid' THEN 'paid' ELSE 'issued' END,
    v_payment.method, v_payment.paid_date, v_payment.due_date, v_settings.school_name, v_settings.rnc,
    COALESCE(v_settings.address, '') || ' ' || COALESCE(v_settings.city, ''),
    v_settings.phone, v_settings.email, v_settings.website, v_settings.logo_url,
    p_issued_by, v_issued_by.name, v_payment.notes, v_settings.footer_note, v_settings.terms_conditions
  ) RETURNING id INTO v_invoice_id;
  RETURN jsonb_build_object('success', true, 'invoice_id', v_invoice_id, 'invoice_number', v_invoice_number);
END;
$$;
GRANT EXECUTE ON FUNCTION public.generate_invoice(bigint, uuid) TO authenticated, service_role;

-- Obtener factura por ID
CREATE OR REPLACE FUNCTION public.get_invoice(p_invoice_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_invoice invoices%ROWTYPE;
BEGIN
  SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Factura no encontrada'); END IF;
  RETURN row_to_json(v_invoice)::jsonb;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_invoice(bigint) TO authenticated, service_role;

-- Obtener facturas por pago
CREATE OR REPLACE FUNCTION public.get_invoices_by_payment(p_payment_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN jsonb_agg(row_to_json(i)) FROM public.invoices i WHERE i.payment_id = p_payment_id; END;
$$;
GRANT EXECUTE ON FUNCTION public.get_invoices_by_payment(bigint) TO authenticated, service_role;

-- Obtener facturas por estudiante
CREATE OR REPLACE FUNCTION public.get_invoices_by_student(p_student_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN jsonb_agg(row_to_json(i) ORDER BY i.created_at DESC) FROM public.invoices i WHERE i.student_id = p_student_id; END;
$$;
GRANT EXECUTE ON FUNCTION public.get_invoices_by_student(bigint) TO authenticated, service_role;

-- Cancelar factura
CREATE OR REPLACE FUNCTION public.cancel_invoice(p_invoice_id bigint, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_invoice invoices%ROWTYPE;
BEGIN
  SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Factura no encontrada'); END IF;
  IF v_invoice.status = 'paid' THEN RETURN jsonb_build_object('error', 'No se puede cancelar una factura pagada'); END IF;
  UPDATE public.invoices SET status = 'cancelled', notes = COALESCE(notes, '') || CASE WHEN notes IS NOT NULL THEN ' | ' ELSE '' END || 'Cancelada: ' || COALESCE(p_reason, 'Sin motivo'), updated_at = now() WHERE id = p_invoice_id;
  RETURN jsonb_build_object('success', true, 'message', 'Factura cancelada');
END;
$$;
GRANT EXECUTE ON FUNCTION public.cancel_invoice(bigint, text) TO authenticated, service_role;

-- Generar hash de factura
CREATE OR REPLACE FUNCTION public.generate_invoice_hash(p_invoice_id bigint)
RETURNS text LANGUAGE sql SECURITY DEFINER AS $$
  SELECT encode(sha256(('INV-' || p_invoice_id || '-' || EXTRACT(EPOCH FROM NOW())::BIGINT || '-KPK')::BYTEA), 'hex');
$$;
GRANT EXECUTE ON FUNCTION public.generate_invoice_hash(bigint) TO authenticated, service_role;

-- Marcar factura como enviada por email
CREATE OR REPLACE FUNCTION public.mark_invoice_email_sent(p_invoice_id bigint)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE public.invoices SET email_sent = TRUE, email_sent_at = NOW() WHERE id = p_invoice_id;
$$;
GRANT EXECUTE ON FUNCTION public.mark_invoice_email_sent(bigint) TO authenticated, service_role;

-- Generar numero de recibo
CREATE OR REPLACE FUNCTION public.generate_receipt_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_prefix text; v_year text; v_counter bigint; v_receipt_number text;
BEGIN
  v_prefix := 'REC'; v_year := TO_CHAR(NOW(), 'YYYY');
  SELECT invoice_counter INTO v_counter FROM public.school_settings WHERE id = 1;
  IF NOT FOUND THEN v_counter := 1; END IF;
  v_counter := COALESCE(v_counter, 1);
  v_receipt_number := v_prefix || '-' || v_year || '-' || LPAD(v_counter::TEXT, 6, '0');
  UPDATE public.school_settings SET invoice_counter = invoice_counter + 1, updated_at = NOW() WHERE id = 1;
  RETURN v_receipt_number;
END;
$$;
GRANT EXECUTE ON FUNCTION public.generate_receipt_number() TO authenticated;

-- Convertir preinscripcion a estudiante
CREATE OR REPLACE FUNCTION public.convert_preregistration(
  p_preinsc_id bigint, p_school_year_id bigint, p_classroom_id bigint DEFAULT NULL,
  p_payment_plan_id bigint DEFAULT NULL, p_matricula text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_preinsc record; v_student_id bigint; v_enrollment_id bigint;
BEGIN
  SELECT * INTO v_preinsc FROM student_preregistrations WHERE id = p_preinsc_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Preinscripcion no encontrada'; END IF;
  IF v_preinsc.status = 'converted' THEN RAISE EXCEPTION 'Esta preinscripcion ya ha sido convertida'; END IF;
  INSERT INTO students (name, classroom_id, allergies, matricula, p1_name, p1_phone, p1_email, p2_name, p2_phone, created_at)
  VALUES (v_preinsc.student_name || ' ' || COALESCE(v_preinsc.student_last_name, ''), p_classroom_id, v_preinsc.allergies, p_matricula, v_preinsc.p1_name, v_preinsc.p1_phone, v_preinsc.p1_email, v_preinsc.p2_name, v_preinsc.p2_phone, now())
  RETURNING id INTO v_student_id;
  INSERT INTO student_enrollments (student_id, school_year_id, classroom_id, payment_plan_id, status, preinscription_date, created_at)
  VALUES (v_student_id, p_school_year_id, p_classroom_id, p_payment_plan_id, 'admitted', v_preinsc.created_at, now())
  RETURNING id INTO v_enrollment_id;
  UPDATE student_preregistrations SET status = 'converted', reviewed_at = now() WHERE id = p_preinsc_id;
  RETURN jsonb_build_object('success', true, 'student_id', v_student_id, 'enrollment_id', v_enrollment_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.convert_preregistration(bigint, bigint, bigint, bigint, text) TO authenticated;

-- Actualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- Establecer event_time automaticamente
CREATE OR REPLACE FUNCTION public.set_event_time()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.event_time := NOW(); RETURN NEW; END;
$$;

-- Calcular duracion de siesta
CREATE OR REPLACE FUNCTION public.calculate_nap_duration()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.nap_end IS NOT NULL THEN NEW.duration_minutes := EXTRACT(EPOCH FROM (NEW.nap_end - NEW.nap_start)) / 60; END IF;
  RETURN NEW;
END;
$$;

-- Generar ASCII receipt
CREATE OR REPLACE FUNCTION public.generate_ascii_receipt(p_invoice_id bigint)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_inv public.invoices%ROWTYPE; v_items RECORD; v_school public.school_settings%ROWTYPE;
  v_line text; v_receipt text := '';
BEGIN
  SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id;
  SELECT * INTO v_school FROM public.school_settings WHERE id = 1;
  v_receipt := v_receipt || repeat('=', 52) || E'\n';
  v_receipt := v_receipt || COALESCE(v_school.school_name, 'Colegio Montessori') || E'\n';
  v_receipt := v_receipt || COALESCE(v_school.rnc, '') || E'\n';
  v_receipt := v_receipt || COALESCE(v_school.address, '') || E'\n';
  v_receipt := v_receipt || COALESCE(v_school.phone, '') || E'\n';
  v_receipt := v_receipt || repeat('-', 52) || E'\n';
  v_receipt := v_receipt || 'FACTURA: ' || COALESCE(v_inv.invoice_number, '') || E'\n';
  v_receipt := v_receipt || 'Fecha: ' || to_char(v_inv.issued_date, 'DD/MM/YYYY HH24:MI') || E'\n';
  v_receipt := v_receipt || 'NCF: ' || COALESCE(v_inv.ncf, 'N/A') || E'\n';
  v_receipt := v_receipt || repeat('-', 52) || E'\n';
  v_receipt := v_receipt || 'Cliente: ' || COALESCE(v_inv.student_name, '') || E'\n';
  v_receipt := v_receipt || 'Matricula: ' || COALESCE(v_inv.student_matricula, '') || E'\n';
  v_receipt := v_receipt || repeat('-', 52) || E'\n';
  FOR v_items IN SELECT concept, quantity, unit_price, total FROM public.invoice_items WHERE invoice_id = p_invoice_id LOOP
    v_line := v_items.concept || '  x' || v_items.quantity::text;
    v_receipt := v_receipt || v_line || E'\n';
    v_receipt := v_receipt || '        RD$ ' || to_char(v_items.total, 'FM999,990.00') || E'\n';
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM public.invoice_items WHERE invoice_id = p_invoice_id) THEN
    v_receipt := v_receipt || COALESCE(v_inv.concept, 'Pago') || E'\n';
    v_receipt := v_receipt || '        RD$ ' || to_char(v_inv.amount, 'FM999,990.00') || E'\n';
  END IF;
  v_receipt := v_receipt || repeat('-', 52) || E'\n';
  v_receipt := v_receipt || 'Subtotal:    RD$ ' || to_char(v_inv.subtotal, 'FM999,990.00') || E'\n';
  v_receipt := v_receipt || 'ITBS:        RD$ ' || to_char(v_inv.tax_amount, 'FM999,990.00') || E'\n';
  v_receipt := v_receipt || 'TOTAL:       RD$ ' || to_char(v_inv.total, 'FM999,990.00') || E'\n';
  v_receipt := v_receipt || repeat('=', 52) || E'\n';
  v_receipt := v_receipt || COALESCE(v_school.footer_note, 'Gracias por su preferencia') || E'\n';
  RETURN v_receipt;
END;
$$;
GRANT EXECUTE ON FUNCTION public.generate_ascii_receipt(bigint) TO authenticated;

-- Vista de rutina diaria
CREATE OR REPLACE VIEW public.daily_routine AS
SELECT * FROM (VALUES
  ('desayuno', '08:00', '🍳'),
  ('merienda', '10:00', '🍪'),
  ('almuerzo', '12:00', '🍽'),
  ('biberon', '14:00', '🍼'),
  ('dormir', '13:00', '😴'),
  ('despertar', '14:30', '⏰'),
  ('panal', '15:00', '🧒'),
  ('bano', '15:30', '🚿'),
  ('temperatura', '08:30', '🌡'),
  ('medicamento', '09:00', '💊'),
  ('foto', '11:00', '📸'),
  ('nota', '16:00', '📝')
) AS t(event_type, ideal_time, emoji);

-- Enviar notificacion
CREATE OR REPLACE FUNCTION public.send_notification(p_user_id uuid, p_type text, p_message text, p_link text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications (user_id, title, message, type, link, is_read, created_at)
  VALUES (p_user_id, p_type, p_message, p_type, p_link, false, now()) ON CONFLICT DO NOTHING;
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

