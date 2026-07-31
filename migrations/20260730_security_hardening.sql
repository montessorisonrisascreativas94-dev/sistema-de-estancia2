-- ============================================================
-- 20260730_security_hardening.sql
-- Endurecimiento de seguridad en producción
--
-- Contenido:
--   1. Trigger anti-escalación de rol en profiles
--   2. Fix find_or_create_private_conversation (participante obligatorio)
--   3. Fix student_preregistrations (SELECT/UPDATE restringidos)
--   4. Checks de acceso en funciones SECURITY DEFINER (posts/tasks/kpis)
--   5. statement_timeout para anon/authenticated (anti DoS)
--   6. REVOKE defensivo de anon en tablas sensibles
--   7. Índices de rendimiento faltantes
--
-- Idempotente: seguro de re-ejecutar.
-- ============================================================

-- ============================================================
-- 1. ANTI-ESCALACIÓN DE ROL EN PROFILES
-- ------------------------------------------------------------
-- El policy "profiles_update" permite que un usuario edite su
-- propia fila (auth.uid() = id), incluyendo la columna `role`.
-- Un padre podría escalar a 'directora'. Este trigger lo bloquea.
-- ============================================================
CREATE OR REPLACE FUNCTION public.prevent_profile_role_escalation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller_role text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role THEN
    SELECT COALESCE(role, '') INTO v_caller_role
    FROM public.profiles WHERE id = auth.uid();
    IF v_caller_role NOT IN ('directora', 'admin') THEN
      RAISE EXCEPTION 'No autorizado: solo directora/admin pueden cambiar roles';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_prevent_role_escalation ON public.profiles;
CREATE TRIGGER trg_profiles_prevent_role_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_role_escalation();

-- ============================================================
-- 2. FIND_OR_CREATE_PRIVATE_CONVERSATION — PARTICIPANTE OBLIGATORIO
-- ------------------------------------------------------------
-- Antes: cualquier usuario autenticado podía crear una conversación
-- entre DOS IDs ARBITRARIOS y luego leer sus mensajes directos.
-- Ahora: p_user1 o p_user2 DEBE ser el usuario que llama (o staff).
-- ============================================================
CREATE OR REPLACE FUNCTION public.find_or_create_private_conversation(p_user1 uuid, p_user2 uuid)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_conv_id bigint; v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF v_caller <> p_user1 AND v_caller <> p_user2 THEN
    IF COALESCE(get_my_role(), '') NOT IN ('directora','admin') THEN
      RAISE EXCEPTION 'No autorizado: debes ser participante de la conversación';
    END IF;
  END IF;
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

-- ============================================================
-- 3. STUDENT_PREREGISTRATIONS — ACCESO RESTRINGIDO
-- ------------------------------------------------------------
-- Antes: cualquier usuario autenticado podía LEER y MODIFICAR TODAS
-- las preinscripciones (datos personales de menores y familias).
-- Ahora: solo staff, o filas cuyo email de contacto coincide con
-- el email del usuario autenticado (seguimiento propio).
-- ============================================================
DROP POLICY IF EXISTS "preregistrations_select_auth" ON public.student_preregistrations;
CREATE POLICY "preregistrations_select_auth" ON public.student_preregistrations FOR SELECT
  TO authenticated USING (
    COALESCE(get_my_role(), '') IN ('directora','asistente','admin','encargada')
    OR p1_email = auth.email()
    OR p2_email = auth.email()
  );

DROP POLICY IF EXISTS "preregistrations_update_auth" ON public.student_preregistrations;
CREATE POLICY "preregistrations_update_auth" ON public.student_preregistrations FOR UPDATE
  TO authenticated USING (
    COALESCE(get_my_role(), '') IN ('directora','asistente','admin','encargada')
    OR p1_email = auth.email()
    OR p2_email = auth.email()
  ) WITH CHECK (
    COALESCE(get_my_role(), '') IN ('directora','asistente','admin','encargada')
    OR p1_email = auth.email()
    OR p2_email = auth.email()
  );

-- ============================================================
-- 4. CHECKS DE ACCESO EN FUNCIONES SECURITY DEFINER
-- ------------------------------------------------------------
-- Estas funciones omiten RLS por diseño. Sin verificación interna,
-- cualquier autenticado (o anon en get_posts_for_parent) podía leer
-- tareas/posts de CUALQUIER aula. Se agrega verificación de rol/aula.
-- ============================================================

-- get_tasks_for_period: staff | maestra del aula | padre de alumno del aula
CREATE OR REPLACE FUNCTION public.get_tasks_for_period(p_classroom_id bigint, p_period_id bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_period_id bigint := p_period_id; v_result jsonb; v_role text;
BEGIN
  SELECT COALESCE(role, '') INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role NOT IN ('directora','asistente','admin','encargada','maestra') THEN
    IF NOT (is_teacher_of_classroom(p_classroom_id) OR is_parent_of_classroom(p_classroom_id)) THEN
      RETURN jsonb_build_object('tasks', '[]'::jsonb, 'period_id', v_period_id, 'error', 'No autorizado');
    END IF;
  END IF;
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

-- get_posts_for_period: staff | maestra del aula | padre de alumno del aula
CREATE OR REPLACE FUNCTION public.get_posts_for_period(p_classroom_id bigint DEFAULT NULL, p_period_id bigint DEFAULT NULL, p_limit int DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_period_id bigint := p_period_id; v_result jsonb; v_role text;
BEGIN
  SELECT COALESCE(role, '') INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role NOT IN ('directora','asistente','admin','encargada','maestra') THEN
    IF p_classroom_id IS NULL OR NOT (is_teacher_of_classroom(p_classroom_id) OR is_parent_of_classroom(p_classroom_id)) THEN
      RETURN jsonb_build_object('posts', '[]'::jsonb, 'period_id', v_period_id, 'error', 'No autorizado');
    END IF;
  END IF;
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

-- get_dashboard_kpis: solo staff (retornaba agregados globales a cualquier autenticado)
CREATE OR REPLACE FUNCTION public.get_dashboard_kpis()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_total_students int; v_active_students int; v_total_classrooms int; v_total_teachers int;
  v_total_payments int; v_paid_payments int; v_pending_payments int; v_overdue_payments int; v_role text;
BEGIN
  SELECT COALESCE(role, '') INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role NOT IN ('directora','asistente','admin','encargada') THEN
    RETURN jsonb_build_object('error', 'No autorizado');
  END IF;
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

-- ============================================================
-- 5. STATEMENT_TIMEOUT (anti consultas colgadas / DoS)
-- ============================================================
ALTER ROLE anon SET statement_timeout = '5s';
ALTER ROLE authenticated SET statement_timeout = '15s';

-- ============================================================
-- 6. REVOKE DEFENSIVO DE ANON EN TABLAS SENSIBLES
-- ------------------------------------------------------------
-- RLS ya bloquea a anon, pero revocar los grants evita que un
-- descuido futuro (p.ej. deshabilitar RLS) exponga datos.
-- NOTA: student_preregistrations conserva INSERT para el formulario
-- público; posts/get_posts_for_parent conservan anon para la web pública.
-- ============================================================
REVOKE ALL ON public.profiles, public.students, public.payments, public.audit_logs,
  public.system_errors, public.login_attempts, public.data_snapshots,
  public.accounting_journal, public.payroll_records, public.caja_sessions,
  public.invoices, public.messages, public.conversations, public.conversation_participants,
  public.grades, public.report_cards, public.task_evidences, public.door_punches,
  public.attendance, public.teacher_schedules, public.schedule_event_logs
  FROM anon;

-- ============================================================
-- 7. ÍNDICES DE RENDIMIENTO FALTANTES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_comments_post_created ON public.comments(post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_likes_post_user ON public.likes(post_id, user_id);
CREATE INDEX IF NOT EXISTS idx_conv_participants_user ON public.conversation_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_conv_participants_conv ON public.conversation_participants(conversation_id);
CREATE INDEX IF NOT EXISTS idx_grades_student_period ON public.grades(student_id, period_id);
CREATE INDEX IF NOT EXISTS idx_report_cards_student_period ON public.report_cards(student_id, period_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created ON public.notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_payments_student_status ON public.payments(student_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_payment_status ON public.invoices(payment_id, status);
CREATE INDEX IF NOT EXISTS idx_terms_acceptance_user ON public.terms_acceptance(user_id);
CREATE INDEX IF NOT EXISTS idx_caja_sessions_date_status ON public.caja_sessions(date, status);
CREATE INDEX IF NOT EXISTS idx_teacher_schedules_active ON public.teacher_schedules(classroom_id, is_active);
