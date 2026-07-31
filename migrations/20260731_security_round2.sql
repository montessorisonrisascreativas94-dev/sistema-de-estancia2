-- ============================================================
-- 20260731_security_round2.sql
-- Ronda 2 de endurecimiento de seguridad
--
-- Contenido:
--   1. Límite de token en secuencias (MAXVALUE + validación) —
--      genera_receipt_number y secuencias IDENTITY no pueden
--      desbordar ni producir tokens fuera de rango.
--   2. convert_preregistration: solo staff (era ejecutable por
--      cualquier authenticated y creaba estudiantes a voluntad).
--   3. get_posts_for_parent: los parents/anon solo ven posts
--      globales o de SU aula (era la peor fuga: cualquier
--      authenticated/anon pedía cualquier classroom_id).
--   4. mark_messages_read + get_direct_messages: exigir ser
--      participante de la conversación (evita marcar leído y
--      leer mensajes ajenos vía SECURITY DEFINER).
--   5. meetings_all: restringida a staff / host / participante.
--   6. CHECK constraints de longitud (anti payloads gigantes).
--   7. Función de rate-limit server-side por IP/email.
--   8. Índices de apoyo a rate-limit + purge automático.
--   9. REVOKE de EXECUTE anon en funciones sensibles.
--   10. Página de errores: fuga de detalles SQL al cliente.
--
-- Idempotente: seguro de re-ejecutar.
-- ============================================================

-- ============================================================
-- 1. LÍMITE DE TOKEN EN SECUENCIAS
-- ------------------------------------------------------------
-- Las secuencias IDENTITY (bigint, 2^63-1) son "ilimitadas" en
-- la práctica y pueden desbordar (error 2200H) o permitir tokens
-- absurdos. Se fija un tope conservador y NO CYCLE para que la
-- BD falle de forma controlada antes que reusar IDs.
-- ============================================================

-- Helper: aplica límite a todas las secuencias de la BD
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT s.oid, s.relname AS seq_name, n.nspname AS sch, u.attrelid, u.attname
    FROM pg_class s
    JOIN pg_namespace n ON n.oid = s.relnamespace
    JOIN pg_depend d ON d.objid = s.oid AND d.refclassid = 'pg_class'::regclass
    JOIN pg_attribute u ON u.attrelid = d.refobjid AND u.attnum = d.refobjsubid
    WHERE s.relkind = 'S' AND n.nspname = 'public'
  LOOP
    -- 9223372036854775807 es el tope bigint; usamos 9,000,000,000,000,000,000
    EXECUTE format('ALTER SEQUENCE %I.%I MAXVALUE 9000000000000000000 NO CYCLE', r.sch, r.seq_name);
  END LOOP;
END $$;

-- generate_receipt_number: validar contador contra un tope explícito
-- y proteger contra actualizaciones corruptas del counter.
CREATE OR REPLACE FUNCTION public.generate_receipt_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_prefix text; v_year text; v_counter bigint; v_receipt_number text;
  v_max_counter CONSTANT bigint := 9999999; -- REC-YYYY-9999999 como tope lógico
BEGIN
  v_prefix := 'REC'; v_year := TO_CHAR(NOW(), 'YYYY');
  SELECT invoice_counter INTO v_counter FROM public.school_settings WHERE id = 1;
  IF NOT FOUND THEN v_counter := 1; END IF;
  v_counter := COALESCE(v_counter, 1);
  IF v_counter < 1 OR v_counter > v_max_counter THEN
    RAISE EXCEPTION 'Contador de recibos fuera de rango (%, permitido 1..%)', v_counter, v_max_counter;
  END IF;
  v_receipt_number := v_prefix || '-' || v_year || '-' || LPAD(v_counter::TEXT, 6, '0');
  UPDATE public.school_settings SET invoice_counter = invoice_counter + 1, updated_at = NOW() WHERE id = 1;
  RETURN v_receipt_number;
END;
$$;
GRANT EXECUTE ON FUNCTION public.generate_receipt_number() TO authenticated;

-- ============================================================
-- 2. CONVERT_PREREGISTRATION — SOLO STAFF
-- ------------------------------------------------------------
-- Cualquier authenticated podía invocarla y crear estudiantes
-- con los datos de una preinscripción (secuestro de conversión,
-- creación masiva de registros). Solo staff escolar.
-- ============================================================
CREATE OR REPLACE FUNCTION public.convert_preregistration(
  p_preinsc_id bigint, p_school_year_id bigint, p_classroom_id bigint DEFAULT NULL,
  p_payment_plan_id bigint DEFAULT NULL, p_matricula text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_preinsc record; v_student_id bigint; v_enrollment_id bigint; v_role text;
BEGIN
  SELECT COALESCE(role, '') INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role NOT IN ('directora','asistente','admin','encargada') THEN
    RAISE EXCEPTION 'No autorizado: solo el personal escolar puede convertir preinscripciones';
  END IF;
  IF p_matricula IS NOT NULL AND length(trim(p_matricula)) > 50 THEN
    RAISE EXCEPTION 'Matricula demasiado larga';
  END IF;
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
REVOKE EXECUTE ON FUNCTION public.convert_preregistration(bigint, bigint, bigint, bigint, text) FROM anon;

-- ============================================================
-- 3. GET_POSTS_FOR_PARENT — SOLO POSTS GLOBALES O DEL PROPIO AULA
-- ------------------------------------------------------------
-- Antes: cualquier authenticated o anon pasaba un classroom_id
-- arbitrario y leía posts/comentarios de TODOS los salones.
-- Ahora: anon solo ve posts globales (classroom_id IS NULL);
-- authenticated solo su aula (o staff global).
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_posts_for_parent(p_classroom_id bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_result jsonb; v_role text; v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    -- anon: SOLO posts globales
    SELECT jsonb_agg(jsonb_build_object('id', p.id, 'content', p.content, 'media_url', p.media_url, 'media_type', p.media_type, 'image_url', p.image_url, 'created_at', p.created_at, 'classroom_id', p.classroom_id, 'teacher_id', p.teacher_id, 'teacher', jsonb_build_object('name', COALESCE(pr.name, p.teacher_name, 'Maestra'), 'avatar_url', COALESCE(pr.avatar_url, p.teacher_avatar), 'role', pr.role), 'likes', COALESCE((SELECT jsonb_agg(jsonb_build_object('user_id', l.user_id, 'id', l.id)) FROM public.likes l WHERE l.post_id = p.id), '[]'::jsonb), 'comments', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'content', c.content, 'user_name', c.user_name, 'user_id', c.user_id, 'created_at', c.created_at) ORDER BY c.created_at ASC) FROM public.comments c WHERE c.post_id = p.id), '[]'::jsonb)) ORDER BY p.created_at DESC) INTO v_result
    FROM public.posts p LEFT JOIN public.profiles pr ON pr.id = p.teacher_id
    WHERE p.classroom_id IS NULL;
    RETURN COALESCE(v_result, '[]'::jsonb);
  END IF;
  SELECT COALESCE(role, '') INTO v_role FROM public.profiles WHERE id = v_uid;
  IF p_classroom_id IS NOT NULL THEN
    IF v_role NOT IN ('directora','asistente','admin','encargada','maestra')
       AND NOT is_parent_of_classroom(p_classroom_id)
       AND NOT is_teacher_of_classroom(p_classroom_id) THEN
      RETURN '[]'::jsonb;
    END IF;
  END IF;
  SELECT jsonb_agg(jsonb_build_object('id', p.id, 'content', p.content, 'media_url', p.media_url, 'media_type', p.media_type, 'image_url', p.image_url, 'created_at', p.created_at, 'classroom_id', p.classroom_id, 'teacher_id', p.teacher_id, 'teacher', jsonb_build_object('name', COALESCE(pr.name, p.teacher_name, 'Maestra'), 'avatar_url', COALESCE(pr.avatar_url, p.teacher_avatar), 'role', pr.role), 'likes', COALESCE((SELECT jsonb_agg(jsonb_build_object('user_id', l.user_id, 'id', l.id)) FROM public.likes l WHERE l.post_id = p.id), '[]'::jsonb), 'comments', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'content', c.content, 'user_name', c.user_name, 'user_id', c.user_id, 'created_at', c.created_at) ORDER BY c.created_at ASC) FROM public.comments c WHERE c.post_id = p.id), '[]'::jsonb)) ORDER BY p.created_at DESC) INTO v_result
  FROM public.posts p LEFT JOIN public.profiles pr ON pr.id = p.teacher_id
  WHERE p.classroom_id IS NULL OR (p_classroom_id IS NOT NULL AND p.classroom_id = p_classroom_id);
  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_posts_for_parent(bigint) TO authenticated, anon;

-- ============================================================
-- 4. MENSAJES — EXIGIR PARTICIPACIÓN
-- ------------------------------------------------------------
-- mark_messages_read marcaba leído cualquier conversación por ID
-- sin verificar que el llamante participe. get_direct_messages
-- tampoco exigía participación en la conversación objetivo.
-- ============================================================
CREATE OR REPLACE FUNCTION public.mark_messages_read(p_conversation_id bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR p_conversation_id IS NULL THEN RETURN; END IF;
  IF NOT user_is_participant(p_conversation_id, auth.uid())
     AND NOT EXISTS (SELECT 1 FROM public.messages m
                     WHERE m.conversation_id = p_conversation_id
                       AND (m.sender_id = auth.uid() OR m.receiver_id = auth.uid())) THEN
    RETURN;
  END IF;
  UPDATE public.messages SET is_read = true
  WHERE conversation_id = p_conversation_id AND sender_id <> auth.uid() AND (is_read IS NULL OR is_read = false);
END;
$$;
GRANT EXECUTE ON FUNCTION public.mark_messages_read(bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_direct_messages(p_other_user_id uuid)
RETURNS TABLE (
  id bigint, conversation_id bigint, sender_id uuid, receiver_id uuid,
  content text, is_read boolean, created_at timestamp with time zone,
  sender_name text, sender_avatar text
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_conv_id bigint; v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  SELECT c.id INTO v_conv_id
  FROM public.conversations c
  WHERE c.type IN ('direct_message','private')
    AND EXISTS (SELECT 1 FROM public.conversation_participants x WHERE x.conversation_id = c.id AND x.user_id = v_uid)
    AND EXISTS (SELECT 1 FROM public.conversation_participants y WHERE y.conversation_id = c.id AND y.user_id = p_other_user_id)
  LIMIT 1;
  IF v_conv_id IS NULL THEN
    -- compat con mensajes directos legados (sender/receiver sin conversación)
    SELECT m.conversation_id INTO v_conv_id FROM public.messages m
    WHERE (m.sender_id = v_uid AND m.receiver_id = p_other_user_id)
       OR (m.sender_id = p_other_user_id AND m.receiver_id = v_uid)
    ORDER BY m.created_at DESC LIMIT 1;
  END IF;
  IF v_conv_id IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT m.id, m.conversation_id, m.sender_id, m.receiver_id, m.content, m.is_read, m.created_at,
      p.name AS sender_name, p.avatar_url AS sender_avatar
    FROM public.messages m
    LEFT JOIN public.profiles p ON m.sender_id = p.id
    WHERE m.conversation_id = v_conv_id
       OR (m.conversation_id IS NULL
           AND ((m.sender_id = v_uid AND m.receiver_id = p_other_user_id)
             OR (m.sender_id = p_other_user_id AND m.receiver_id = v_uid)))
    ORDER BY m.created_at ASC LIMIT 50;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_direct_messages(uuid) TO authenticated;

-- ============================================================
-- 5. MEETINGS — RESTRINGIR ACCESO
-- ------------------------------------------------------------
-- meetings_all permitía a cualquier authenticated ver/crear/
-- modificar TODAS las reuniones. Solo staff, host o participante
-- (aula del padre/maestra).
-- ============================================================
DROP POLICY IF EXISTS "meetings_all" ON public.meetings;
DROP POLICY IF EXISTS "meetings_select" ON public.meetings;
CREATE POLICY "meetings_select" ON public.meetings FOR SELECT
  TO authenticated USING (
    COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra','encargada')
    OR host_id = auth.uid()
    OR (target_id IS NOT NULL AND (
          is_parent_of_classroom(target_id) OR is_teacher_of_classroom(target_id)
        ))
  );

DROP POLICY IF EXISTS "meetings_insert" ON public.meetings;
CREATE POLICY "meetings_insert" ON public.meetings FOR INSERT
  TO authenticated WITH CHECK (
    COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra','encargada')
    OR host_id = auth.uid()
  );

DROP POLICY IF EXISTS "meetings_update" ON public.meetings;
CREATE POLICY "meetings_update" ON public.meetings FOR UPDATE
  TO authenticated USING (
    COALESCE(get_my_role(), '') IN ('directora','asistente','admin','encargada')
    OR host_id = auth.uid()
  ) WITH CHECK (
    COALESCE(get_my_role(), '') IN ('directora','asistente','admin','encargada')
    OR host_id = auth.uid()
  );

DROP POLICY IF EXISTS "meetings_delete" ON public.meetings;
CREATE POLICY "meetings_delete" ON public.meetings FOR DELETE
  TO authenticated USING (
    COALESCE(get_my_role(), '') IN ('directora','asistente','admin','encargada')
    OR host_id = auth.uid()
  );

-- ============================================================
-- 6. CHECK CONSTRAINTS DE LONGITUD (anti payloads gigantes)
-- ------------------------------------------------------------
-- Sin estos límites un usuario podía escribir megabytes de texto
-- en content/title/name y saturar la BD o la UI de otros.
-- ============================================================
DO $$
BEGIN
  ALTER TABLE public.messages ADD CONSTRAINT messages_content_len CHECK (length(content) <= 5000);
EXCEPTION WHEN duplicate_object THEN NULL; END;
$$;
DO $$
BEGIN
  ALTER TABLE public.comments ADD CONSTRAINT comments_content_len CHECK (length(content) <= 2000);
EXCEPTION WHEN duplicate_object THEN NULL; END;
$$;
DO $$
BEGIN
  ALTER TABLE public.posts ADD CONSTRAINT posts_content_len CHECK (length(COALESCE(content, '')) <= 10000);
EXCEPTION WHEN duplicate_object THEN NULL; END;
$$;
DO $$
BEGIN
  ALTER TABLE public.notifications ADD CONSTRAINT notifications_title_len CHECK (length(title) <= 300);
  ALTER TABLE public.notifications ADD CONSTRAINT notifications_message_len CHECK (length(message) <= 2000);
EXCEPTION WHEN duplicate_object THEN NULL; END;
$$;
DO $$
BEGIN
  ALTER TABLE public.students ADD CONSTRAINT students_name_len CHECK (length(name) <= 200);
  ALTER TABLE public.students ADD CONSTRAINT students_matricula_len CHECK (length(COALESCE(matricula, '')) <= 50);
EXCEPTION WHEN duplicate_object THEN NULL; END;
$$;
DO $$
BEGIN
  ALTER TABLE public.profiles ADD CONSTRAINT profiles_name_len CHECK (length(COALESCE(name, '')) <= 200);
EXCEPTION WHEN duplicate_object THEN NULL; END;
$$;

-- ============================================================
-- 7. FUNCIÓN DE RATE-LIMIT SERVER-SIDE (por IP / email)
-- ------------------------------------------------------------
-- Límite de token sobre "secuencia": cada clave (ip/email/acción)
-- tiene un tope de intentos por ventana. La aplica el servidor
-- (api.cjs) antes de delegar a Supabase Auth.
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key text, p_window_seconds int, p_max_attempts int
)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT count(*) < p_max_attempts
  FROM public.login_attempts
  WHERE (email = p_key OR ip_hash = p_key)
    AND created_at > now() - make_interval(secs => p_window_seconds);
$$;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, int, int) TO service_role;

CREATE OR REPLACE FUNCTION public.record_login_attempt(
  p_email text, p_ip_hash text, p_success boolean
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.login_attempts (email, ip_hash, success, created_at)
  VALUES (
    CASE WHEN p_email IS NOT NULL AND trim(p_email) <> '' THEN LOWER(trim(p_email)) ELSE NULL END,
    p_ip_hash, p_success, now()
  );
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_login_attempt(text, text, boolean) TO service_role;

-- ============================================================
-- 8. ÍNDICES DE RATE-LIMIT + PURGE
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_login_attempts_lookup ON public.login_attempts (email, ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_created ON public.login_attempts (created_at);

-- Limpieza automática de intentos viejos (evita crecimiento infinito)
CREATE OR REPLACE FUNCTION public.prune_login_attempts()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.login_attempts WHERE created_at < now() - interval '7 days';
$$;
GRANT EXECUTE ON FUNCTION public.prune_login_attempts() TO service_role;

-- ============================================================
-- 9. REVOKE EXECUTE ANON EN FUNCIONES SENSIBLES
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.activate_period(bigint) FROM anon;
REVOKE EXECUTE ON FUNCTION public.close_period(bigint) FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_receipt_number() FROM anon;
REVOKE EXECUTE ON FUNCTION public.process_door_punch(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_invoice_email_sent(bigint) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_event_time() FROM anon;
REVOKE EXECUTE ON FUNCTION public.calculate_nap_duration() FROM anon;

-- ============================================================
-- 10. ANTI FUGA DE DETALLES EN EXCEPCIONES
-- ------------------------------------------------------------
-- SECURITY DEFINER: cualquier EXCEPTION sin mensaje sanitizado
-- puede filtrar estructura interna. Setear search_path ya cubre
-- la mayoría; protegemos funciones clave con manejadores.
-- ============================================================
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
  UPDATE public.periods SET is_active = false WHERE is_active = true;
  UPDATE public.periods SET is_active = true, status = 'open' WHERE id = p_period_id;
  RETURN jsonb_build_object('success', true, 'period_id', p_period_id, 'previous', v_old_id);
EXCEPTION
  WHEN OTHERS THEN RETURN jsonb_build_object('error', 'No se pudo activar el periodo');
END;
$$;

-- ============================================================
-- 11. RLS activo en tablas que podrían tenerlo apagado
-- ============================================================
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.door_punches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_settings ENABLE ROW LEVEL SECURITY;
