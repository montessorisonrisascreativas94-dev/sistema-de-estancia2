-- ============================================================
-- 10_fixes.sql — Colegio Montessori Sonrisas Creativas
-- Contenido: fixes idempotentes + motor de alertas automáticas
-- ============================================================

-- ============================================================
-- A. MOTOR DE ALERTAS AUTOMÁTICAS (sistema autónomo)
--    Inserta notificaciones solas ante eventos clave:
--      - comentario nuevo → autor del post (maestra/directora)
--      - ausencia registrada → padres del estudiante
--      - pago pendiente → directora/admin (para validarlo)
-- ============================================================

-- ---------------------------------------------------------------------------
-- A.1 Comentario nuevo → notificar al autor del post (si no es el mismo usuario)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_comment_post_author()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_post_author uuid;
BEGIN
  SELECT teacher_id INTO v_post_author FROM posts WHERE id = NEW.post_id;
  IF v_post_author IS NULL OR v_post_author = NEW.user_id THEN
    RETURN NEW;
  END IF;

  INSERT INTO notifications (user_id, title, message, type, link)
  VALUES (
    v_post_author,
    'Nuevo comentario en tu publicación',
    COALESCE(NEW.user_name, 'Alguien') || ' comentó: ' || left(NEW.content, 80),
    'comment',
    '/panel_maestra.html?section=t-class'
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_comment_post_author ON public.comments;
CREATE TRIGGER trg_notify_comment_post_author
AFTER INSERT ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.notify_comment_post_author();

-- ---------------------------------------------------------------------------
-- A.2 Ausencia registrada → notificar a los padres del estudiante
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_attendance_absent()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_parent  uuid;
  v_student text;
BEGIN
  IF NEW.status NOT IN ('absent', 'ausente')
     OR (TG_OP = 'UPDATE' AND OLD.status = NEW.status) THEN
    RETURN NEW;
  END IF;

  SELECT name, parent_id INTO v_student, v_parent FROM students WHERE id = NEW.student_id;
  IF v_parent IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO notifications (user_id, title, message, type, link)
  VALUES (
    v_parent,
    'Ausencia registrada',
    COALESCE(v_student, 'Su hijo(a)') || ' fue registrado(a) ausente el ' || to_char(NEW.date, 'DD/MM/YYYY'),
    'attendance',
    '/panel_padres.html?section=class'
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_attendance_absent ON public.attendance;
CREATE TRIGGER trg_notify_attendance_absent
AFTER INSERT OR UPDATE OF status ON public.attendance
FOR EACH ROW EXECUTE FUNCTION public.notify_attendance_absent();

-- ---------------------------------------------------------------------------
-- A.3 Pago pendiente registrado → notificar a directora/admin para validarlo
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_pending_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
BEGIN
  IF NEW.status <> 'pending' THEN
    RETURN NEW;
  END IF;

  FOR r IN SELECT id FROM profiles WHERE role IN ('directora', 'admin') LOOP
    INSERT INTO notifications (user_id, title, message, type, link)
    VALUES (
      r.id,
      'Pago por validar',
      'Nuevo pago pendiente por ' || COALESCE(NEW.concept, 'mensualidad') || ' — ' || NEW.amount::text || ' RD$',
      'payment',
      '/panel_directora.html?section=pagos'
    );
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_pending_payment ON public.payments;
CREATE TRIGGER trg_notify_pending_payment
AFTER INSERT ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.notify_pending_payment();