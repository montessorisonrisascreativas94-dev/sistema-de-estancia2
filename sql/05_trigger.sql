-- NOTA: este archivo contiene ademas bloques CONSOLIDADOS de los antiguos sql/11-30 (buscar "BLOQUE CONSOLIDADO" al final).
-- ============================================================
-- 05_trigger.sql — Colegio Montessori Sonrisas Creativas
-- Contenido: sección 8 (TRIGGERS)
-- ============================================================
-- ============================================================
-- 8. TRIGGERS
-- ============================================================

-- Trigger para poblar datos de maestra en posts
CREATE OR REPLACE FUNCTION public.handle_new_post_teacher_info()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.teacher_id IS NOT NULL THEN
    NEW.teacher_name := (SELECT name FROM public.profiles WHERE id = NEW.teacher_id LIMIT 1);
    NEW.teacher_avatar := (SELECT avatar_url FROM public.profiles WHERE id = NEW.teacher_id LIMIT 1);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_new_post_populate_teacher ON public.posts;
CREATE TRIGGER on_new_post_populate_teacher BEFORE INSERT ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_post_teacher_info();

-- Trigger de auditoria para pagos (status change)
CREATE OR REPLACE FUNCTION public.payment_audit_trigger_fn()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.payment_audit_log (payment_id, action, old_status, new_status, changed_by, details)
    VALUES (NEW.id, 'status_change', OLD.status, NEW.status, auth.uid(), jsonb_build_object('amount', NEW.amount, 'month_paid', NEW.month_paid, 'student_id', NEW.student_id));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.payment_audit_log (payment_id, action, old_status, changed_by, details)
    VALUES (OLD.id, 'deleted', OLD.status, auth.uid(), jsonb_build_object('amount', OLD.amount, 'month_paid', OLD.month_paid));
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS payment_audit_trigger ON public.payments;
CREATE TRIGGER payment_audit_trigger AFTER UPDATE OR DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.payment_audit_trigger_fn();

-- Trigger de auditoria general para pagos
CREATE OR REPLACE FUNCTION public.fn_audit_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_action text; v_payload jsonb; v_user_id uuid;
BEGIN
  BEGIN v_user_id := auth.uid(); EXCEPTION WHEN OTHERS THEN v_user_id := NULL; END;
  IF TG_OP = 'INSERT' THEN
    v_action := 'payment.created';
    v_payload := jsonb_build_object('payment_id', NEW.id, 'student_id', NEW.student_id, 'amount', NEW.amount, 'month', NEW.month_paid, 'status', NEW.status, 'method', NEW.method, 'concept', NEW.concept, 'due_date', NEW.due_date);
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status OR OLD.amount IS DISTINCT FROM NEW.amount OR OLD.due_date IS DISTINCT FROM NEW.due_date THEN
      v_action := CASE WHEN NEW.status = 'paid' AND OLD.status != 'paid' THEN 'payment.approved' WHEN NEW.status = 'overdue' AND OLD.status != 'overdue' THEN 'payment.overdue' WHEN NEW.status = 'rejected' THEN 'payment.rejected' WHEN OLD.due_date IS DISTINCT FROM NEW.due_date THEN 'payment.mora_waived' ELSE 'payment.updated' END;
      v_payload := jsonb_build_object('payment_id', NEW.id, 'student_id', NEW.student_id, 'amount', NEW.amount, 'month', NEW.month_paid, 'old_status', OLD.status, 'new_status', NEW.status, 'old_due_date', OLD.due_date, 'new_due_date', NEW.due_date, 'validated_by', NEW.validated_by, 'notes', NEW.notes);
    ELSE RETURN NEW; END IF;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'payment.deleted';
    v_payload := jsonb_build_object('payment_id', OLD.id, 'student_id', OLD.student_id, 'amount', OLD.amount, 'month', OLD.month_paid, 'status', OLD.status);
  END IF;
  INSERT INTO public.audit_logs (user_id, action, payload, created_at) VALUES (v_user_id, v_action, v_payload, now());
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS trg_audit_payment ON public.payments;
CREATE TRIGGER trg_audit_payment AFTER INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_payment();

-- Trigger para actualizar stock
CREATE OR REPLACE FUNCTION public.update_product_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.movement_type = 'in' THEN UPDATE public.products SET stock = stock + NEW.quantity WHERE id = NEW.product_id;
    ELSIF NEW.movement_type = 'out' THEN UPDATE public.products SET stock = stock - NEW.quantity WHERE id = NEW.product_id; END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trigger_update_stock ON public.inventory_movements;
CREATE TRIGGER trigger_update_stock AFTER INSERT ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.update_product_stock();

-- Trigger para calcular subtotal de item
CREATE OR REPLACE FUNCTION public.calculate_order_item_subtotal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NEW.subtotal := NEW.product_price * NEW.quantity; RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trigger_calculate_subtotal ON public.order_items;
CREATE TRIGGER trigger_calculate_subtotal BEFORE INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.calculate_order_item_subtotal();

-- Trigger para actualizar updated_at en preregistrations
DROP TRIGGER IF EXISTS update_student_preregistrations_updated_at ON public.student_preregistrations;
CREATE TRIGGER update_student_preregistrations_updated_at BEFORE UPDATE ON public.student_preregistrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger para event_time en classroom_events
DROP TRIGGER IF EXISTS trigger_set_event_time ON public.classroom_events;
CREATE TRIGGER trigger_set_event_time BEFORE INSERT ON public.classroom_events
  FOR EACH ROW EXECUTE FUNCTION public.set_event_time();

-- Trigger para duracion de siesta
DROP TRIGGER IF EXISTS trigger_calculate_nap_duration ON public.nap_sessions;
CREATE TRIGGER trigger_calculate_nap_duration BEFORE UPDATE OF nap_end ON public.nap_sessions
  FOR EACH ROW EXECUTE FUNCTION public.calculate_nap_duration();

-- Trigger function para ascii_receipt en invoices
CREATE OR REPLACE FUNCTION public.trigger_update_ascii_receipt()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    NEW.ascii_receipt := public.generate_ascii_receipt(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trigger_update_ascii_receipt ON public.invoices;
CREATE TRIGGER trigger_update_ascii_receipt BEFORE INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.trigger_update_ascii_receipt();

-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
-- CONSOLIDADO DESDE migrations\ (historial) â€” aÃ±adido automÃ¡ticamente
-- Fecha: 2026-09-12 21:41
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

DROP TRIGGER IF EXISTS update_student_preregistrations_updated_at ON public.student_preregistrations;

DROP TRIGGER IF EXISTS trg_single_active_year ON public.school_years;

DROP TRIGGER IF EXISTS trg_enforce_period_attendance ON public.attendance;

DROP TRIGGER IF EXISTS trg_enforce_period_tasks ON public.tasks;

DROP TRIGGER IF EXISTS trg_enforce_period_grades ON public.grades;

DROP TRIGGER IF EXISTS trg_enforce_period_posts ON public.posts;

DROP TRIGGER IF EXISTS trg_enforce_period_comp_scores ON public.competency_scores;

DROP TRIGGER IF EXISTS trg_enforce_period_task_evidences ON public.task_evidences;

DROP TRIGGER IF EXISTS trg_enforce_year_payments ON public.payments;

DROP TRIGGER IF EXISTS trg_enforce_year_tasks ON public.tasks;

DROP TRIGGER IF EXISTS trg_enforce_year_posts ON public.posts;

DROP TRIGGER IF EXISTS trg_enforce_year_grades ON public.grades;

DROP TRIGGER IF EXISTS trg_enforce_year_attendance ON public.attendance;

DROP TRIGGER IF EXISTS trg_enforce_year_incidents ON public.incidents;

DROP TRIGGER IF EXISTS trg_enforce_enrollment_year ON public.student_enrollments;

DROP TRIGGER IF EXISTS trg_enforce_single_enrollment ON public.student_enrollments;

DROP TRIGGER IF EXISTS trg_enforce_enrollment_year_not_null ON public.student_enrollments;

DROP TRIGGER IF EXISTS trg_enforce_inscription_open ON public.student_enrollments;

DROP TRIGGER IF EXISTS trg_profiles_prevent_role_escalation ON public.profiles;

DROP TRIGGER IF EXISTS aaa_trg_scope_year_tasks ON public.tasks;

DROP TRIGGER IF EXISTS aaa_trg_scope_year_attendance ON public.attendance;

DROP TRIGGER IF EXISTS aaa_trg_scope_year_posts ON public.posts;

DROP TRIGGER IF EXISTS aaa_trg_scope_year_grades ON public.grades;

DROP TRIGGER IF EXISTS aaa_trg_scope_year_daily_logs ON public.daily_logs;

DROP TRIGGER IF EXISTS aaa_trg_scope_year_incidents ON public.incidents;

DROP TRIGGER IF EXISTS aaa_trg_scope_year_events ON public.classroom_events;

DROP TRIGGER IF EXISTS aaa_trg_scope_year_naps ON public.nap_sessions;

DROP TRIGGER IF EXISTS aaa_trg_scope_year_task_evidences ON public.task_evidences;

DROP TRIGGER IF EXISTS aaa_trg_scope_period_tasks ON public.tasks;

DROP TRIGGER IF EXISTS aaa_trg_scope_period_attendance ON public.attendance;

DROP TRIGGER IF EXISTS aaa_trg_scope_period_posts ON public.posts;

DROP TRIGGER IF EXISTS aaa_trg_scope_period_grades ON public.grades;

DROP TRIGGER IF EXISTS aaa_trg_scope_period_daily_logs ON public.daily_logs;

DROP TRIGGER IF EXISTS aaa_trg_scope_period_incidents ON public.incidents;

DROP TRIGGER IF EXISTS aaa_trg_scope_period_naps ON public.nap_sessions;

DROP TRIGGER IF EXISTS aaa_trg_scope_period_task_evidences ON public.task_evidences;

DROP TRIGGER IF EXISTS trg_single_active_period ON public.periods;

DROP TRIGGER IF EXISTS trg_enforce_period_dates ON public.periods;

DROP TRIGGER IF EXISTS trg_seed_classroom_routine_settings ON public.classrooms;

DROP TRIGGER IF EXISTS trg_eval_scores_audit ON public.eval_scores;

DROP TRIGGER IF EXISTS trg_messages_updated_at ON public.messages;

DROP TRIGGER IF EXISTS trigger_update_ascii_receipt ON public.invoices;

DROP TRIGGER IF EXISTS trg_payment_concepts_updated_at ON public.payment_concepts;

DROP TRIGGER IF EXISTS trigger_set_event_time ON classroom_events;

DROP TRIGGER IF EXISTS trigger_calculate_nap_duration ON nap_sessions;


-- #################################################################
-- BLOQUE CONSOLIDADO DESDE los antiguos sql/11-30
-- (integrado el 2026-10-19; idempotente y re-ejecutable)
-- #################################################################
-- ----------------------------------------------------------------
-- 5i. Triggers
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_school_activities_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public
AS $act_upd_at$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$act_upd_at$;

DROP TRIGGER IF EXISTS trg_school_activities_updated_at ON public.school_activities;
CREATE TRIGGER trg_school_activities_updated_at
    BEFORE UPDATE ON public.school_activities
    FOR EACH ROW EXECUTE FUNCTION public.fn_school_activities_updated_at();

-- Generador de código ACT-YYYY-MM-DD-NNN
CREATE OR REPLACE FUNCTION public.fn_school_activities_code()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public
AS $act_code$
DECLARE
    v_day   TEXT;
    v_seq   BIGINT;
BEGIN
    v_day := to_char(COALESCE(NEW.scheduled_date::TIMESTAMPTZ,
                              NEW.activity_date::TIMESTAMPTZ,
                              now()), 'YYYYMMDD');
    IF NEW.code IS NOT NULL AND char_length(trim(NEW.code)) > 0 THEN RETURN NEW; END IF;
    SELECT COALESCE(COUNT(*), 0) + 1 INTO STRICT v_seq
        FROM public.school_activities a
        WHERE a.code LIKE 'ACT-' || v_day || '-%';
    NEW.code := 'ACT-' || v_day || '-' || lpad(v_seq::TEXT, 3, '0');
    RETURN NEW;
END;
$act_code$;

DROP TRIGGER IF EXISTS trg_school_activities_code ON public.school_activities;
CREATE TRIGGER trg_school_activities_code
    BEFORE INSERT ON public.school_activities
    FOR EACH ROW EXECUTE FUNCTION public.fn_school_activities_code();

-- Timestamps automáticos al cambiar de estado
CREATE OR REPLACE FUNCTION public.fn_school_activities_lifecycle()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public
AS $act_lc$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        IF NEW.status = 'published' AND NEW.published_at IS NULL THEN
            NEW.published_at = now();
        END IF;
        IF NEW.status = 'completed' AND NEW.completed_at IS NULL THEN
            NEW.completed_at = now();
        END IF;
        IF NEW.status IN ('in_progress','published','scheduled') AND NEW.starts_at IS NULL THEN
            IF COALESCE(NEW.scheduled_date, NEW.activity_date) IS NOT NULL
               AND COALESCE(NEW.scheduled_time, NEW.start_time) IS NOT NULL THEN
                NEW.starts_at = COALESCE(NEW.scheduled_date, NEW.activity_date)
                              + COALESCE(NEW.scheduled_time, NEW.start_time);
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$act_lc$;

DROP TRIGGER IF EXISTS trg_school_activities_lifecycle ON public.school_activities;
CREATE TRIGGER trg_school_activities_lifecycle
    BEFORE UPDATE ON public.school_activities
    FOR EACH ROW EXECUTE FUNCTION public.fn_school_activities_lifecycle();

-- Espejo entre los dos esquemas
CREATE OR REPLACE FUNCTION public.fn_school_activities_mirror()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public
AS $act_mirror$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.activity_date  := COALESCE(NEW.activity_date, NEW.scheduled_date, CURRENT_DATE);
        NEW.scheduled_date := COALESCE(NEW.scheduled_date, NEW.activity_date);

        NEW.start_time     := COALESCE(NEW.start_time, NEW.scheduled_time);
        NEW.scheduled_time := COALESCE(NEW.scheduled_time, NEW.start_time);

        NEW.assigned_to         := COALESCE(NEW.assigned_to, NEW.assigned_teacher_id);
        NEW.assigned_teacher_id := COALESCE(NEW.assigned_teacher_id, NEW.assigned_to);
    ELSE
        IF NEW.activity_date IS DISTINCT FROM OLD.activity_date THEN
            NEW.scheduled_date := NEW.activity_date;
        ELSIF NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date THEN
            NEW.activity_date := NEW.scheduled_date;
        ELSE
            NEW.activity_date  := COALESCE(NEW.activity_date, NEW.scheduled_date);
            NEW.scheduled_date := COALESCE(NEW.scheduled_date, NEW.activity_date);
        END IF;

        IF NEW.start_time IS DISTINCT FROM OLD.start_time THEN
            NEW.scheduled_time := NEW.start_time;
        ELSIF NEW.scheduled_time IS DISTINCT FROM OLD.scheduled_time THEN
            NEW.start_time := NEW.scheduled_time;
        ELSE
            NEW.start_time     := COALESCE(NEW.start_time, NEW.scheduled_time);
            NEW.scheduled_time := COALESCE(NEW.scheduled_time, NEW.start_time);
        END IF;

        IF NEW.assigned_teacher_id IS DISTINCT FROM OLD.assigned_teacher_id THEN
            NEW.assigned_to := NEW.assigned_teacher_id;
        ELSIF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
            NEW.assigned_teacher_id := NEW.assigned_to;
        ELSE
            NEW.assigned_to         := COALESCE(NEW.assigned_to, NEW.assigned_teacher_id);
            NEW.assigned_teacher_id := COALESCE(NEW.assigned_teacher_id, NEW.assigned_to);
        END IF;
    END IF;

    IF COALESCE(NEW.target_audience, 'aula') = 'aula' AND NEW.classroom_id IS NULL THEN
        NEW.target_audience := 'todo_el_centro';
    ELSIF NEW.target_audience = 'todo_el_centro' AND NEW.classroom_id IS NOT NULL THEN
        NEW.target_audience := 'aula';
    END IF;

    RETURN NEW;
END;
$act_mirror$;

DROP TRIGGER IF EXISTS trg_school_activities_mirror ON public.school_activities;
CREATE TRIGGER trg_school_activities_mirror
    BEFORE INSERT OR UPDATE ON public.school_activities
    FOR EACH ROW EXECUTE FUNCTION public.fn_school_activities_mirror();

-- ----------------------------------------------------------------
-- Trigger server-side: auditoría automática si el flag del cliente
-- current_setting('app.supervision_active') = 'true'
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_supervision_auto_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $auto_audit_body$
DECLARE
    v_user_id       UUID := auth.uid();
    v_role          TEXT;
    v_classroom_id  BIGINT;
    v_teacher_id    UUID;
    v_student_id    BIGINT;
    v_session_id    UUID;
    v_table         TEXT := TG_TABLE_NAME;
    v_action        TEXT;
    v_old_json      JSONB := NULL;
    v_new_json      JSONB := NULL;
    v_record_id     TEXT;
BEGIN
    IF v_user_id IS NULL THEN RETURN NULL; END IF;
    IF current_setting('app.supervision_active', true) IS DISTINCT FROM 'true' THEN
        RETURN NULL;
    END IF;

    SELECT p.role INTO v_role FROM public.profiles p WHERE p.id = v_user_id LIMIT 1;
    IF v_role IS NULL OR v_role NOT IN ('directora','asistente','encargada') THEN
        RETURN NULL;
    END IF;

    v_session_id := NULLIF(current_setting('app.supervision_session_id', true), '')::UUID;
    v_teacher_id := NULLIF(current_setting('app.supervision_teacher_id', true), '')::UUID;
    BEGIN
        v_classroom_id := current_setting('app.supervision_classroom_id', true)::BIGINT;
    EXCEPTION WHEN OTHERS THEN
        v_classroom_id := NULL;
    END;
    IF v_classroom_id IS NULL THEN RETURN NULL; END IF;

    CASE TG_OP
      WHEN 'INSERT' THEN v_action := 'INSERT ' || v_table; v_new_json := to_jsonb(NEW);
      WHEN 'UPDATE' THEN v_action := 'UPDATE ' || v_table; v_old_json := to_jsonb(OLD); v_new_json := to_jsonb(NEW);
      WHEN 'DELETE' THEN v_action := 'DELETE ' || v_table; v_old_json := to_jsonb(OLD);
      ELSE v_action := TG_OP || ' ' || v_table;
    END CASE;

    IF    v_table = 'attendance'     THEN v_student_id := COALESCE(NEW.student_id, OLD.student_id);
    ELSIF v_table = 'daily_logs'     THEN v_student_id := COALESCE(NEW.student_id, OLD.student_id);
    ELSIF v_table = 'task_evidences' THEN v_student_id := COALESCE(NEW.student_id, OLD.student_id);
    END IF;

    v_record_id := CASE v_table
      WHEN 'attendance'     THEN COALESCE(NEW.id::TEXT, OLD.id::TEXT)
      WHEN 'daily_logs'     THEN COALESCE(NEW.id::TEXT, OLD.id::TEXT)
      WHEN 'tasks'          THEN COALESCE(NEW.id::TEXT, OLD.id::TEXT)
      WHEN 'task_evidences' THEN COALESCE(NEW.id::TEXT, OLD.id::TEXT)
      ELSE NULL
    END;

    INSERT INTO public.supervision_audit_log (
        session_id, usuario_id, role, classroom_id, teacher_id,
        modulo_afectado, accion_realizada, student_id, table_name, record_id, metadata_jsonb
    ) VALUES (
        v_session_id, v_user_id, v_role, v_classroom_id, v_teacher_id,
        CASE v_table
            WHEN 'attendance'     THEN 'asistencia'
            WHEN 'daily_logs'     THEN 'rutinas'
            WHEN 'tasks'          THEN 'tareas'
            WHEN 'task_evidences' THEN 'calificaciones'
            ELSE v_table
        END,
        v_action,
        v_student_id,
        v_table,
        v_record_id,
        jsonb_build_object(
            'before', v_old_json,
            'after',  v_new_json,
            'trigger_op', TG_OP,
            'recorded_by', 'server_trigger'
        )
    );

    RETURN NULL;
END;
$auto_audit_body$;

DROP TRIGGER IF EXISTS trg_supervision_auto_audit_attendance ON public.attendance;
CREATE TRIGGER trg_supervision_auto_audit_attendance
AFTER INSERT OR UPDATE OR DELETE ON public.attendance
FOR EACH ROW EXECUTE FUNCTION public.fn_supervision_auto_audit();

DROP TRIGGER IF EXISTS trg_supervision_auto_audit_dailylogs ON public.daily_logs;
CREATE TRIGGER trg_supervision_auto_audit_dailylogs
AFTER INSERT OR UPDATE OR DELETE ON public.daily_logs
FOR EACH ROW EXECUTE FUNCTION public.fn_supervision_auto_audit();

DROP TRIGGER IF EXISTS trg_supervision_auto_audit_tasks ON public.tasks;
CREATE TRIGGER trg_supervision_auto_audit_tasks
AFTER INSERT OR UPDATE OR DELETE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.fn_supervision_auto_audit();

DROP TRIGGER IF EXISTS trg_supervision_auto_audit_tasksevidences ON public.task_evidences;
CREATE TRIGGER trg_supervision_auto_audit_tasksevidences
AFTER INSERT OR UPDATE OR DELETE ON public.task_evidences
FOR EACH ROW EXECUTE FUNCTION public.fn_supervision_auto_audit();

-- updated_at en interventions
CREATE OR REPLACE FUNCTION public.fn_interventions_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public
AS $interv_upd$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$interv_upd$;

DROP TRIGGER IF EXISTS trg_interventions_updated_at ON public.interventions;
CREATE TRIGGER trg_interventions_updated_at
BEFORE UPDATE ON public.interventions
FOR EACH ROW EXECUTE FUNCTION public.fn_interventions_updated_at();

-- Generador de código INT-YYYY-NNNN
CREATE OR REPLACE FUNCTION public.fn_interventions_code_gen()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public
AS $int_code$
DECLARE
  v_year  TEXT := to_char(now(), 'YYYY');
  v_n     BIGINT;
BEGIN
  IF NEW.code IS NOT NULL AND char_length(NEW.code) > 0 THEN RETURN NEW; END IF;
  SELECT COALESCE(COUNT(*), 0) + 1 INTO STRICT v_n
    FROM public.interventions i
    WHERE i.code LIKE 'INT-' || v_year || '-%';
  NEW.code := 'INT-' || v_year || '-' || lpad(v_n::TEXT, 4, '0');
  RETURN NEW;
END;
$int_code$;

DROP TRIGGER IF EXISTS trg_interventions_code_gen ON public.interventions;
CREATE TRIGGER trg_interventions_code_gen
BEFORE INSERT ON public.interventions
FOR EACH ROW EXECUTE FUNCTION public.fn_interventions_code_gen();
