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

