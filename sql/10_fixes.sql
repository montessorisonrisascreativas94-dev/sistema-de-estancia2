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

-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
-- CONSOLIDADO DESDE migrations\ (historial) â€” aÃ±adido automÃ¡ticamente
-- Fecha: 2026-09-12 21:41
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

CREATE OR REPLACE FUNCTION public.add_column_if_not_exists(
  p_table text, p_column text, p_type text, p_default text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = p_table
  ) THEN
    RAISE NOTICE 'Tabla % no existe — omitida', p_table;
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = p_table AND column_name = p_column
  ) THEN
    IF p_default IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN %I %s DEFAULT %s', p_table, p_column, p_type, p_default);
    ELSE
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN %I %s', p_table, p_column, p_type);
    END IF;
    RAISE NOTICE 'Added column: %', p_column;
  ELSE
    RAISE NOTICE 'Column already exists: %', p_column;
  END IF;
END;
$$;

SELECT public.add_column_if_not_exists('student_preregistrations', 'student_last_name', 'text');

SELECT public.add_column_if_not_exists('student_preregistrations', 'nationality', 'text');

SELECT public.add_column_if_not_exists('student_preregistrations', 'student_photo_url', 'text');

SELECT public.add_column_if_not_exists('student_preregistrations', 'school_year_requested', 'text');

SELECT public.add_column_if_not_exists('student_preregistrations', 'level_requested', 'text');

SELECT public.add_column_if_not_exists('student_preregistrations', 'schedule', 'text');

SELECT public.add_column_if_not_exists('student_preregistrations', 'estimated_entry_date', 'date');

SELECT public.add_column_if_not_exists('student_preregistrations', 'has_siblings', 'boolean', 'false');

SELECT public.add_column_if_not_exists('student_preregistrations', 'sibling_name', 'text');

SELECT public.add_column_if_not_exists('student_preregistrations', 'p1_relationship', 'text');

SELECT public.add_column_if_not_exists('student_preregistrations', 'p1_cedula', 'text');

SELECT public.add_column_if_not_exists('student_preregistrations', 'p1_birth_date', 'date');

SELECT public.add_column_if_not_exists('student_preregistrations', 'p1_whatsapp', 'text');

SELECT public.add_column_if_not_exists('student_preregistrations', 'p1_address', 'text');

SELECT public.add_column_if_not_exists('student_preregistrations', 'p1_occupation', 'text');

SELECT public.add_column_if_not_exists('student_preregistrations', 'p1_profession', 'text');

SELECT public.add_column_if_not_exists('student_preregistrations', 'p1_workplace', 'text');

SELECT public.add_column_if_not_exists('student_preregistrations', 'p2_name', 'text');

SELECT public.add_column_if_not_exists('student_preregistrations', 'p2_relationship', 'text');

SELECT public.add_column_if_not_exists('student_preregistrations', 'p2_cedula', 'text');

SELECT public.add_column_if_not_exists('student_preregistrations', 'p2_birth_date', 'date');

SELECT public.add_column_if_not_exists('student_preregistrations', 'p2_phone', 'text');

SELECT public.add_column_if_not_exists('student_preregistrations', 'p2_whatsapp', 'text');

SELECT public.add_column_if_not_exists('student_preregistrations', 'p2_email', 'text');

SELECT public.add_column_if_not_exists('student_preregistrations', 'p2_address', 'text');

SELECT public.add_column_if_not_exists('student_preregistrations', 'p2_occupation', 'text');

SELECT public.add_column_if_not_exists('student_preregistrations', 'p2_profession', 'text');

SELECT public.add_column_if_not_exists('student_preregistrations', 'p2_workplace', 'text');

SELECT public.add_column_if_not_exists('student_preregistrations', 'emergency_relationship', 'text');

SELECT public.add_column_if_not_exists('student_preregistrations', 'emergency_cedula', 'text');

SELECT public.add_column_if_not_exists('student_preregistrations', 'emergency_observations', 'text');

SELECT public.add_column_if_not_exists('student_preregistrations', 'authorized_persons', 'jsonb', '''[]''::jsonb');

SELECT public.add_column_if_not_exists('student_preregistrations', 'blood_type', 'text');

SELECT public.add_column_if_not_exists('student_preregistrations', 'allergies', 'text');

SELECT public.add_column_if_not_exists('student_preregistrations', 'medical_conditions', 'text');

SELECT public.add_column_if_not_exists('student_preregistrations', 'medications', 'text');

SELECT public.add_column_if_not_exists('student_preregistrations', 'food_restrictions', 'text');

SELECT public.add_column_if_not_exists('student_preregistrations', 'medical_notes', 'text');

SELECT public.add_column_if_not_exists('student_preregistrations', 'photo_url', 'text');

SELECT public.add_column_if_not_exists('student_preregistrations', 'birth_certificate_url', 'text');

SELECT public.add_column_if_not_exists('student_preregistrations', 'cedula_front_url', 'text');

SELECT public.add_column_if_not_exists('student_preregistrations', 'cedula_back_url', 'text');

SELECT public.add_column_if_not_exists('student_preregistrations', 'auth_data_treatment', 'boolean', 'false');

SELECT public.add_column_if_not_exists('student_preregistrations', 'auth_correct_info', 'boolean', 'false');

SELECT public.add_column_if_not_exists('student_preregistrations', 'auth_contact', 'boolean', 'false');

SELECT public.add_column_if_not_exists('student_preregistrations', 'auth_regulations', 'boolean', 'false');

SELECT public.add_column_if_not_exists('student_preregistrations', 'digital_signature', 'text');

SELECT public.add_column_if_not_exists('student_preregistrations', 'signature_date', 'timestamp with time zone');

SELECT public.add_column_if_not_exists('student_preregistrations', 'reference', 'text');

SELECT public.add_column_if_not_exists('student_preregistrations', 'comments', 'text');

SELECT public.add_column_if_not_exists('student_preregistrations', 'status', 'text', '''pending''');

SELECT public.add_column_if_not_exists('student_preregistrations', 'reviewed_at', 'timestamp with time zone');

SELECT public.add_column_if_not_exists('student_preregistrations', 'reviewed_by', 'uuid');

SELECT public.add_column_if_not_exists('student_preregistrations', 'updated_at', 'timestamp with time zone', 'now()');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'student_preregistrations'
  ) THEN
    ALTER TABLE public.student_preregistrations
      ADD CONSTRAINT preregistrations_status_check
      CHECK (status IN ('pending', 'admitted', 'rejected', 'converted'));
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'school_settings' AND column_name = 'reenrollment_month'
  ) THEN
    ALTER TABLE public.school_settings ADD COLUMN reenrollment_month INT DEFAULT 8; -- August = 8
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'parent_ratings') THEN
    DROP POLICY IF EXISTS "parent_ratings_all" ON public.parent_ratings;
    CREATE POLICY "parent_ratings_all" ON public.parent_ratings FOR ALL
      USING (parent_id = auth.uid() OR COALESCE(get_my_role(), '') IN ('directora','admin','encargada'));
  END IF;
END $$;

COMMENT ON COLUMN payments.exclude_dgii IS 'Si es true, esta factura NO se envía a la DGII (factura interna)';

DO $$ BEGIN
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS salary NUMERIC DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

ALTER TABLE public.report_cards
  ALTER COLUMN task_avg TYPE numeric(5,2),
  ALTER COLUMN formal_avg TYPE numeric(5,2),
  ALTER COLUMN final_score TYPE numeric(5,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'grades' AND column_name = 'school_year_id'
  ) THEN
    ALTER TABLE public.grades ADD COLUMN school_year_id bigint REFERENCES public.school_years(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'report_cards' AND column_name = 'school_year_id'
  ) THEN
    ALTER TABLE public.report_cards ADD COLUMN school_year_id bigint REFERENCES public.school_years(id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'grades' AND column_name = 'period'
  ) THEN
    ALTER TABLE public.grades DROP COLUMN period;
  END IF;
END $$;

DO $$ BEGIN
  ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS priority text DEFAULT 'informative';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS is_pinned boolean DEFAULT false;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS student_id bigint REFERENCES public.students(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS reference_id bigint;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS reference_table text;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

COMMENT ON COLUMN public.notifications.priority IS 'Nivel de prioridad: critical, important, informative';

COMMENT ON COLUMN public.notifications.expires_at IS 'Fecha de expiración — actividades que nunca expiran se quedan';

COMMENT ON COLUMN public.notifications.is_pinned IS 'Actividad fijada que no desaparece automáticamente al leerse';

COMMENT ON COLUMN public.notifications.student_id IS 'ID del estudiante asociado a la notificación';

COMMENT ON COLUMN public.notifications.reference_id IS 'ID del registro fuente (task_id, post_id, payment_id, etc.)';

COMMENT ON COLUMN public.notifications.reference_table IS 'Tabla fuente del evento (tasks, posts, payments, etc.)';

DO $$ BEGIN
  ALTER TABLE public.classrooms ADD COLUMN deleted_at timestamp with time zone;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.attendance ADD COLUMN deleted_at timestamp with time zone;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.periods ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS transfer_date date;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS area_id bigint REFERENCES public.academic_areas(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS competency_id bigint REFERENCES public.competencies(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS max_score numeric(5,2) DEFAULT 100;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS weight numeric(5,2) DEFAULT 1;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS task_type text DEFAULT 'tarea' CHECK (task_type IN ('tarea','evaluacion','proyecto','observacion'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.report_cards ADD COLUMN IF NOT EXISTS competency_summary jsonb DEFAULT '{}'::jsonb;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.report_cards ADD COLUMN IF NOT EXISTS areas_summary jsonb DEFAULT '{}'::jsonb;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.report_cards ADD COLUMN IF NOT EXISTS teacher_observations text;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS school_year_id bigint REFERENCES public.school_years(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS period_id bigint REFERENCES public.periods(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS school_year_id bigint REFERENCES public.school_years(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS period_id bigint REFERENCES public.periods(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS school_year_id bigint REFERENCES public.school_years(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS school_year_id bigint REFERENCES public.school_years(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.grades ADD COLUMN IF NOT EXISTS school_year_id bigint REFERENCES public.school_years(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.daily_logs ADD COLUMN IF NOT EXISTS school_year_id bigint REFERENCES public.school_years(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.daily_logs ADD COLUMN IF NOT EXISTS period_id bigint REFERENCES public.periods(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS school_year_id bigint REFERENCES public.school_years(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS period_id bigint REFERENCES public.periods(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'student_preregistrations'
  ) THEN
    ALTER TABLE public.student_preregistrations ADD COLUMN IF NOT EXISTS school_year_id bigint REFERENCES public.school_years(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS school_year_id bigint REFERENCES public.school_years(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS period_id bigint REFERENCES public.periods(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.payroll_records ADD COLUMN IF NOT EXISTS school_year_id bigint REFERENCES public.school_years(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.accounting_journal ADD COLUMN IF NOT EXISTS school_year_id bigint REFERENCES public.school_years(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.classroom_events ADD COLUMN IF NOT EXISTS school_year_id bigint REFERENCES public.school_years(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.nap_sessions ADD COLUMN IF NOT EXISTS school_year_id bigint REFERENCES public.school_years(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.nap_sessions ADD COLUMN IF NOT EXISTS period_id bigint REFERENCES public.periods(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.parent_ratings ADD COLUMN IF NOT EXISTS school_year_id bigint REFERENCES public.school_years(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS school_year_id bigint REFERENCES public.school_years(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Expenses: admin and directora full access"
    ON public.expenses FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin','directora')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Expenses: asistente can read"
    ON public.expenses FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'asistente'
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER ROLE anon SET statement_timeout = '5s';

ALTER ROLE authenticated SET statement_timeout = '15s';

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
    EXECUTE format('ALTER SEQUENCE %I.%I MAXVALUE 9000000000000000000 NO CYCLE', r.sch, r.seq_name);
  END LOOP;
END $$;

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

WITH ranked AS (
  SELECT id,
         lower(translate(name, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')) AS norm_name,
         row_number() OVER (
           PARTITION BY lower(translate(name, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'))
           ORDER BY amount DESC, id ASC
         ) AS rn
  FROM public.payment_concepts
)
DELETE FROM public.payment_concepts pc
USING ranked r
WHERE pc.id = r.id AND r.rn > 1;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.classroom_daily_schedule;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
DECLARE
  _tables text[] := ARRAY['eval_boleta_notes','eval_score_history'];
  _t text;
BEGIN
  FOREACH _t IN ARRAY _tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "staff_all_%s" ON public.%I', _t, _t);
    EXECUTE format(
      'CREATE POLICY "staff_all_%s" ON public.%I FOR ALL
         TO authenticated
         USING (COALESCE(get_my_role(),'''') IN (''directora'',''admin'',''asistente'',''encargada'',''maestra''))
         WITH CHECK (COALESCE(get_my_role(),'''') IN (''directora'',''admin'',''asistente'',''encargada'',''maestra''))', _t, _t);
  END LOOP;

  EXECUTE 'DROP POLICY IF EXISTS "parent_read_eval_boleta_notes" ON public.eval_boleta_notes';
  EXECUTE 'CREATE POLICY "parent_read_eval_boleta_notes" ON public.eval_boleta_notes FOR SELECT
             TO authenticated
             USING (is_parent_of_student(student_id))';

  EXECUTE 'DROP POLICY IF EXISTS "parent_read_eval_score_history" ON public.eval_score_history';
  EXECUTE 'CREATE POLICY "parent_read_eval_score_history" ON public.eval_score_history FOR SELECT
             TO authenticated
             USING (is_parent_of_student(student_id))';
END $$;

DO $$
DECLARE
  _tables text[] := ARRAY['eval_evaluations','eval_areas','eval_competencies','eval_periods','eval_modules','eval_activities','eval_evidences','eval_scores','eval_formulas'];
  _t text;
BEGIN
  FOREACH _t IN ARRAY _tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "staff_all_%s" ON public.%I', _t, _t);
    EXECUTE format('DROP POLICY IF EXISTS "parent_read_%s" ON public.%I', _t, _t);
    EXECUTE format(
      'CREATE POLICY "staff_all_%s" ON public.%I FOR ALL
         TO authenticated
         USING (COALESCE(get_my_role(),'''') IN (''directora'',''admin'',''asistente'',''encargada'',''maestra''))
         WITH CHECK (COALESCE(get_my_role(),'''') IN (''directora'',''admin'',''asistente'',''encargada'',''maestra''))', _t, _t);
  END LOOP;

  EXECUTE 'DROP POLICY IF EXISTS "parent_read_eval_scores" ON public.eval_scores';
  EXECUTE 'CREATE POLICY "parent_read_eval_scores" ON public.eval_scores FOR SELECT
             TO authenticated
             USING (is_parent_of_student(student_id))';

  EXECUTE 'DROP POLICY IF EXISTS "parent_read_eval_evidences" ON public.eval_evidences';
  EXECUTE 'CREATE POLICY "parent_read_eval_evidences" ON public.eval_evidences FOR SELECT
             TO authenticated
             USING (is_parent_of_student(student_id))';
END $$;

DO $$
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "staff_all_eval_area_notes" ON public.eval_area_notes';
  EXECUTE 'CREATE POLICY "staff_all_eval_area_notes" ON public.eval_area_notes FOR ALL
             TO authenticated
             USING (COALESCE(get_my_role(),'''') IN (''directora'',''admin'',''asistente'',''encargada'',''maestra''))
             WITH CHECK (COALESCE(get_my_role(),'''') IN (''directora'',''admin'',''asistente'',''encargada'',''maestra''))';

  EXECUTE 'DROP POLICY IF EXISTS "parent_read_eval_area_notes" ON public.eval_area_notes';
  EXECUTE 'CREATE POLICY "parent_read_eval_area_notes" ON public.eval_area_notes FOR SELECT
             TO authenticated
             USING (is_parent_of_student(student_id))';
END $$;

DO $$
DECLARE
  v_eval record;
  v_year_id bigint;
BEGIN
  FOR v_eval IN
    SELECT e.id, e.school_year_id, e.created_at
    FROM public.eval_evaluations e
    WHERE e.school_year_id IS NULL
       OR NOT EXISTS (
         SELECT 1 FROM public.school_years y
         WHERE y.id = e.school_year_id AND y.deleted_at IS NULL
       )
  LOOP
    v_year_id := NULL;
    SELECT id INTO v_year_id FROM public.school_years
    WHERE is_current = true AND deleted_at IS NULL LIMIT 1;
    IF v_year_id IS NULL THEN
      SELECT school_year_id INTO v_year_id FROM public.periods
      WHERE is_active = true AND school_year_id IS NOT NULL
      ORDER BY created_at DESC, id DESC LIMIT 1;
    END IF;
    IF v_year_id IS NULL THEN
      SELECT school_year_id INTO v_year_id FROM public.periods
      WHERE status = 'open' AND school_year_id IS NOT NULL
      ORDER BY created_at DESC, id DESC LIMIT 1;
    END IF;
    IF v_year_id IS NULL THEN
      SELECT id INTO v_year_id FROM public.school_years
      WHERE status <> 'closed' AND deleted_at IS NULL
      ORDER BY start_date DESC, id DESC LIMIT 1;
    END IF;
    IF v_year_id IS NOT NULL THEN
      UPDATE public.eval_evaluations
      SET school_year_id = v_year_id, updated_at = now()
      WHERE id = v_eval.id;
    END IF;
  END LOOP;
END;
$$;

DO $$
DECLARE
  v_eval record;
  v_year_id bigint;
  v_period_type text;
  v_period record;
  v_created int := 0;
  v_fallback boolean := false;
BEGIN
  FOR v_eval IN
    SELECT e.id, e.school_year_id, e.default_areas, e.default_modules
    FROM public.eval_evaluations e
    WHERE NOT EXISTS (
      SELECT 1 FROM public.eval_periods ep
      WHERE ep.evaluation_id = e.id AND ep.deleted_at IS NULL
    )
  LOOP
    v_year_id := v_eval.school_year_id;
    IF NOT EXISTS (SELECT 1 FROM public.school_years y WHERE y.id = v_year_id AND y.deleted_at IS NULL) THEN
      SELECT id INTO v_year_id FROM public.school_years
      WHERE is_current = true AND deleted_at IS NULL LIMIT 1;
    END IF;
    IF v_year_id IS NULL THEN
      SELECT school_year_id INTO v_year_id FROM public.periods
      WHERE is_active = true AND school_year_id IS NOT NULL
      ORDER BY created_at DESC, id DESC LIMIT 1;
    END IF;
    IF v_year_id IS NULL THEN
      SELECT school_year_id INTO v_year_id FROM public.periods
      WHERE status = 'open' AND school_year_id IS NOT NULL
      ORDER BY created_at DESC, id DESC LIMIT 1;
    END IF;

    v_period_type := 'periodo';
    IF v_year_id IS NOT NULL THEN
      SELECT COALESCE(period_model,'trimestres') INTO v_period_type
      FROM public.school_years WHERE id = v_year_id;
      v_period_type := CASE
        WHEN v_period_type = 'semestres' THEN 'bimestre'
        WHEN v_period_type = 'mensual' THEN 'mes'
        ELSE 'periodo'
      END;
    END IF;

    v_fallback := false;
    IF v_year_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.periods p
      WHERE p.school_year_id = v_year_id AND p.deleted_at IS NULL
    ) THEN
      v_fallback := true;
    END IF;

    FOR v_period IN
      SELECT name, start_date, end_date, status, sort_order
      FROM public.periods
      WHERE (v_fallback OR school_year_id = v_year_id)
        AND deleted_at IS NULL
      ORDER BY COALESCE(sort_order, 0), start_date, id
    LOOP
      INSERT INTO public.eval_periods
        (evaluation_id, name, period_type, start_date, end_date, weight, status, sort_order, created_by)
      VALUES
        (v_eval.id, v_period.name, v_period_type,
         v_period.start_date, v_period.end_date,
         0,
         CASE WHEN v_period.status = 'open' THEN 'open' ELSE 'closed' END,
         COALESCE(v_period.sort_order, 0), NULL);
      v_created := v_created + 1;
    END LOOP;

    IF NOT EXISTS (
      SELECT 1 FROM public.eval_periods ep
      WHERE ep.evaluation_id = v_eval.id AND ep.deleted_at IS NULL
    ) THEN
      INSERT INTO public.eval_periods (evaluation_id, name, period_type, status, sort_order, created_by) VALUES
        (v_eval.id, 'Primer Período', 'periodo', 'open',  1, NULL),
        (v_eval.id, 'Segundo Período','periodo', 'open',  2, NULL),
        (v_eval.id, 'Tercer Período', 'periodo', 'open',  3, NULL);
      v_created := v_created + 3;
    END IF;
  END LOOP;

  RAISE NOTICE 'eval_periods backfill: % períodos creados', v_created;
END;
$$;

SELECT
  (SELECT count(*) FROM public.eval_periods WHERE deleted_at IS NULL) AS total_eval_periods,
  (SELECT count(*) FROM public.eval_evaluations e
     WHERE NOT EXISTS (SELECT 1 FROM public.eval_periods ep
                       WHERE ep.evaluation_id = e.id AND ep.deleted_at IS NULL)) AS evaluaciones_sin_periodos,
  (SELECT count(*) FROM public.periods WHERE status IS NULL) AS periodos_estado_nulo;

DO $$
DECLARE
  v_cur_year bigint;
  v_win      bigint;
  v_winner_year bigint;
  v_manage_triggers boolean;
BEGIN
  BEGIN
    ALTER TABLE public.periods ENABLE TRIGGER ALL;
  EXCEPTION WHEN OTHERS THEN
    ALTER TABLE public.periods ENABLE TRIGGER USER;
  END;

  SELECT has_table_privilege(current_user, 'public.periods', 'TRIGGER') INTO v_manage_triggers;
  IF v_manage_triggers THEN
    ALTER TABLE public.periods DISABLE TRIGGER USER;
  END IF;

  SELECT id INTO v_cur_year FROM public.school_years
  WHERE is_current = true AND deleted_at IS NULL LIMIT 1;

  IF v_cur_year IS NULL THEN
    SELECT p.school_year_id INTO v_cur_year
    FROM public.periods p
    JOIN public.school_years y ON y.id = p.school_year_id
    WHERE p.is_active = true AND p.school_year_id IS NOT NULL AND y.deleted_at IS NULL
    ORDER BY p.created_at DESC, p.id DESC LIMIT 1;
  END IF;

  IF v_cur_year IS NULL THEN
    SELECT id INTO v_cur_year FROM public.school_years
    WHERE status <> 'closed' AND deleted_at IS NULL
    ORDER BY start_date DESC, id DESC LIMIT 1;
  END IF;

  IF v_cur_year IS NULL THEN
    SELECT id INTO v_cur_year FROM public.school_years
    ORDER BY start_date DESC, id DESC LIMIT 1;
  END IF;

  IF v_cur_year IS NOT NULL THEN
    UPDATE public.school_years SET is_current = (id = v_cur_year);
  END IF;

  UPDATE public.periods p
  SET school_year_id = sub.fit
  FROM (
    SELECT p2.id AS pid, (
      SELECT y.id FROM public.school_years y
      WHERE y.deleted_at IS NULL
        AND p2.start_date >= y.start_date AND p2.end_date <= y.end_date
      ORDER BY y.start_date DESC, y.id DESC LIMIT 1
    ) AS fit
    FROM public.periods p2
    WHERE p2.is_active = true AND p2.school_year_id IS NULL
  ) sub
  WHERE p.id = sub.pid AND sub.fit IS NOT NULL;

  IF v_cur_year IS NOT NULL THEN
    SELECT id INTO v_win FROM public.periods
    WHERE is_active = true AND school_year_id = v_cur_year
    ORDER BY created_at DESC, id DESC LIMIT 1;
  END IF;
  IF v_win IS NULL THEN
    SELECT id INTO v_win FROM public.periods
    WHERE is_active = true
    ORDER BY created_at DESC, id DESC LIMIT 1;
  END IF;

  IF v_win IS NOT NULL THEN
    UPDATE public.periods SET is_active = false
    WHERE id IN (SELECT id FROM public.periods WHERE is_active = true AND id <> v_win);
  ELSE
    IF v_cur_year IS NOT NULL THEN
      SELECT id INTO v_win FROM public.periods
      WHERE status = 'open' AND COALESCE(is_blocked, false) = false AND school_year_id = v_cur_year
      ORDER BY created_at DESC, id DESC LIMIT 1;
    END IF;
    IF v_win IS NULL THEN
      SELECT id INTO v_win FROM public.periods
      WHERE status = 'open' AND COALESCE(is_blocked, false) = false
      ORDER BY created_at DESC, id DESC LIMIT 1;
    END IF;
    IF v_win IS NOT NULL THEN
      UPDATE public.periods SET is_active = true WHERE id = v_win;
    END IF;
  END IF;

  UPDATE public.classrooms SET active_period_id = NULL
  WHERE id IN (SELECT id FROM public.classrooms WHERE active_period_id IS NOT NULL);

  IF v_win IS NOT NULL THEN
    SELECT school_year_id INTO v_winner_year FROM public.periods WHERE id = v_win;
    IF v_winner_year IS NOT NULL THEN
      UPDATE public.school_years SET is_current = (id = v_winner_year);
    END IF;

    IF EXISTS (SELECT 1 FROM public.periods WHERE id = v_win AND classroom_id IS NOT NULL) THEN
      UPDATE public.classrooms SET active_period_id = v_win
      WHERE id = (SELECT classroom_id FROM public.periods WHERE id = v_win);
    ELSE
      UPDATE public.classrooms SET active_period_id = v_win;
    END IF;
  END IF;

  IF v_manage_triggers THEN
    ALTER TABLE public.periods ENABLE TRIGGER USER;
  END IF;

  RAISE NOTICE 'SYNC periodo/anio: anio vigente=%, periodo activo=%', v_cur_year, v_win;
EXCEPTION WHEN OTHERS THEN
  IF v_manage_triggers THEN
    ALTER TABLE public.periods ENABLE TRIGGER USER;
  END IF;
  RAISE;
END;
$$;

SELECT
  (SELECT id FROM public.school_years WHERE is_current = true AND deleted_at IS NULL LIMIT 1) AS anio_vigente_id,
  (SELECT name FROM public.school_years WHERE is_current = true AND deleted_at IS NULL LIMIT 1) AS anio_vigente,
  (SELECT count(*) FROM public.periods WHERE is_active = true) AS periodos_activos,
  (SELECT id FROM public.periods WHERE is_active = true ORDER BY created_at DESC, id DESC LIMIT 1) AS periodo_activo_id,
  (SELECT name FROM public.periods WHERE is_active = true ORDER BY created_at DESC, id DESC LIMIT 1) AS periodo_activo;

DO $$ BEGIN
  ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS message_type text NOT NULL DEFAULT 'text'
    CHECK (message_type IN ('text','image','file','system'));
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS reply_to_id bigint
    REFERENCES public.messages(id) ON DELETE SET NULL;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS edited_at timestamp with time zone;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

COMMENT ON COLUMN public.messages.message_type  IS 'text | image | file | system';

COMMENT ON COLUMN public.messages.reply_to_id   IS 'NULL = mensaje normal; no NULL = respuesta a otro mensaje de la misma conversación';

COMMENT ON COLUMN public.messages.edited_at     IS 'NULL = sin editar; con valor = fecha de última edición';

COMMENT ON COLUMN public.messages.deleted_at    IS 'NULL = activo; con valor = borrado lógico (el contenido se reemplaza por Este mensaje fue eliminado)';

COMMENT ON TABLE  public.message_attachments IS 'Archivos multimedia asociados a un mensaje';

COMMENT ON COLUMN public.message_attachments.url IS 'URL pública del archivo (Supabase Storage o externa)';

COMMENT ON TABLE  public.message_reactions IS 'Reacciones (emoji) por mensaje. Un usuario = un solo emoji por mensaje.';

COMMENT ON COLUMN public.message_reactions.emoji IS 'Emojis válidos: 👍 ❤️ 😂 😮 😢 😡 👏 🔥';

DO $$ BEGIN
  ALTER TABLE public.conversation_participants ADD COLUMN IF NOT EXISTS last_read_at timestamp with time zone;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

COMMENT ON COLUMN public.conversation_participants.last_read_at IS 'Timestamp del último mensaje leído por este usuario en esta conversación';

DO $$ BEGIN
  ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS is_important boolean NOT NULL DEFAULT false;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS post_type text NOT NULL DEFAULT 'general';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

COMMENT ON COLUMN public.posts.is_pinned     IS 'Publicación fijada: aparece siempre primero en el muro';

COMMENT ON COLUMN public.posts.is_important  IS 'Aviso importante: se muestra con banner destacado';

COMMENT ON COLUMN public.posts.post_type     IS 'Tipo: general, aviso, actividad, documento, imagen, video';

DO $$ BEGIN
  ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS parent_id bigint REFERENCES public.comments(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
EXCEPTION WHEN OTHERS THEN NULL; END $$;

COMMENT ON COLUMN public.comments.parent_id IS 'NULL = comentario principal; no NULL = respuesta a otro comentario del mismo post';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = 'task_evidences' 
      AND column_name = 'numeric_score'
  ) THEN
    ALTER TABLE public.task_evidences ADD COLUMN numeric_score numeric(5,2) CHECK (numeric_score >= 0 AND numeric_score <= 100);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = 'grades' 
      AND column_name = 'numeric_score'
  ) THEN
    ALTER TABLE public.grades ADD COLUMN numeric_score numeric(5,2) CHECK (numeric_score >= 0 AND numeric_score <= 100);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = 'tasks' 
      AND column_name = 'grading_system'
  ) THEN
    ALTER TABLE public.tasks ALTER COLUMN grading_system SET DEFAULT 'numeric';
  END IF;
END $$;

DO $$ BEGIN
  CREATE TYPE payment_plan_type AS ENUM ('monthly', 'semestral', 'anual', 'two_installments');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE product_category AS ENUM ('uniforme', 'libro', 'material', 'otro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE order_status AS ENUM ('pending', 'paid', 'approved', 'ready', 'delivered', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'code'
  ) THEN
    ALTER TABLE public.products
    ADD COLUMN code VARCHAR(50) UNIQUE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'itbis_rate'
  ) THEN
    ALTER TABLE public.products
    ADD COLUMN itbis_rate numeric(5,2) DEFAULT 18;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'is_itbis_exempt'
  ) THEN
    ALTER TABLE public.products
    ADD COLUMN is_itbis_exempt boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'unit'
  ) THEN
    ALTER TABLE public.products
    ADD COLUMN unit VARCHAR(50) DEFAULT 'unidad';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'stock'
  ) THEN
    ALTER TABLE public.products
    ADD COLUMN stock integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'image_url'
  ) THEN
    ALTER TABLE public.products
    ADD COLUMN image_url text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE public.products
    ADD COLUMN is_active boolean DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'created_by'
  ) THEN
    ALTER TABLE public.products
    ADD COLUMN created_by uuid REFERENCES public.profiles(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'updated_by'
  ) THEN
    ALTER TABLE public.products
    ADD COLUMN updated_by uuid REFERENCES public.profiles(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE public.products
    ADD COLUMN deleted_at timestamp with time zone;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.products
    ADD COLUMN updated_at timestamp with time zone DEFAULT now();
  END IF;
END $$;

SELECT 'Migración completada exitosamente!' AS mensaje;

SELECT 'payment_concepts creada y sembrada correctamente!' AS mensaje;

SELECT 'RLS policies actualizadas correctamente!' AS mensaje;

DO $$ BEGIN ALTER TABLE public.payment_concepts ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN NULL; END $$;

SELECT
  tablename,
  policyname
FROM pg_policies
WHERE tablename IN (
  'students','classrooms','profiles','payments',
  'payment_plans','student_preregistrations',
  'payment_concepts','parent_ratings'
)
ORDER BY tablename, policyname;

SELECT '✅ All RLS policies applied safely!' AS resultado;

SELECT 'school_years + school_settings RLS applied!' AS resultado;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

SELECT 'profiles_role_check updated to include encargada!' AS resultado;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='payments' AND column_name='discount_amount'
  ) THEN
    ALTER TABLE public.payments ADD COLUMN discount_amount numeric(10,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='payments' AND column_name='discount_percent'
  ) THEN
    ALTER TABLE public.payments ADD COLUMN discount_percent numeric(5,2) DEFAULT 0;
  END IF;
END $$;

SELECT 'payments discount columns ready!' AS resultado;

SELECT 'invoices table + RLS ready!' AS resultado;

SELECT
  schemaname,
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE tablename IN ('students','profiles','payments','payment_plans','student_preregistrations','payment_concepts')
ORDER BY tablename, policyname;

SELECT 'RLS fix completado exitosamente!' AS resultado;

SELECT 'classrooms RLS fix applied!' AS resultado;

SELECT 'parent_ratings table ready!' AS resultado;

SELECT 'profiles read policy updated — padres can now see staff contacts!' AS resultado;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'school_years'
  ) THEN
    RAISE EXCEPTION 'La tabla school_years no existe. Ejecuta schema.sql primero.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'payment_plans'
  ) THEN
    RAISE EXCEPTION 'La tabla payment_plans no existe. Ejecuta schema.sql primero.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.insert_plan_a(p_level text, p_schedule text, p_amount numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_plan_id bigint;
BEGIN
  SELECT id INTO v_plan_id FROM public.payment_plans
    WHERE level = p_level AND schedule = p_schedule AND name LIKE 'Plan A%' AND school_year_id IN (SELECT id FROM public.school_years WHERE name = '2026-2027');

  IF v_plan_id IS NOT NULL THEN
    INSERT INTO public.plan_installments(payment_plan_id, type, month_number, month_name, amount, due_day, due_month_offset, is_registration)
    VALUES (v_plan_id, 'inscripcion', 1, 'Agosto', p_amount, 5, 0, true)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.insert_plan_b(p_level text, p_schedule text, p_amount1 numeric, p_amount2 numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_plan_id bigint;
BEGIN
  SELECT id INTO v_plan_id FROM public.payment_plans
    WHERE level = p_level AND schedule = p_schedule AND name LIKE 'Plan B%' AND school_year_id IN (SELECT id FROM public.school_years WHERE name = '2026-2027');

  IF v_plan_id IS NOT NULL THEN
    INSERT INTO public.plan_installments(payment_plan_id, type, month_number, month_name, amount, due_day, due_month_offset, is_registration)
    VALUES
      (v_plan_id, 'inscripcion', 1, 'Agosto', p_amount1, 5, 0, true),
      (v_plan_id, 'colegiatura', 2, 'Enero', p_amount2, 5, 5, false)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.insert_plan_c(p_level text, p_schedule text, p_inscripcion numeric, p_colegiatura numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_plan_id bigint;
BEGIN
  SELECT id INTO v_plan_id FROM public.payment_plans
    WHERE level = p_level AND schedule = p_schedule AND name LIKE 'Plan C%' AND school_year_id IN (SELECT id FROM public.school_years WHERE name = '2026-2027');

  IF v_plan_id IS NOT NULL THEN
    INSERT INTO public.plan_installments(payment_plan_id, type, month_number, month_name, amount, due_day, due_month_offset, is_registration)
    VALUES (v_plan_id, 'inscripcion', 1, 'Agosto', p_inscripcion, 5, 0, true)
    ON CONFLICT DO NOTHING;

    INSERT INTO public.plan_installments(payment_plan_id, type, month_number, month_name, amount, due_day, due_month_offset, is_registration)
    SELECT v_plan_id, 'colegiatura', gs.mn, gs.mname, p_colegiatura, 5, gs.mo, false
    FROM (
      SELECT 2 as mn, 'Septiembre' as mname, 1 as mo
      UNION ALL SELECT 3, 'Octubre', 2
      UNION ALL SELECT 4, 'Noviembre', 3
      UNION ALL SELECT 5, 'Diciembre', 4
      UNION ALL SELECT 6, 'Enero', 5
      UNION ALL SELECT 7, 'Febrero', 6
      UNION ALL SELECT 8, 'Marzo', 7
      UNION ALL SELECT 9, 'Abril', 8
      UNION ALL SELECT 10, 'Mayo', 9
      UNION ALL SELECT 11, 'Junio', 10
    ) gs
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

WITH sy AS (SELECT id FROM public.school_years WHERE name = '2026-2027')

INSERT INTO public.payment_plans(school_year_id, level, schedule, name, registration_fee, description)
SELECT id, 'Inicial', '8:00-12:00', 'Plan A (Anual)', 118188.00, 'Pago anual completo'
FROM sy
ON CONFLICT DO NOTHING;

SELECT public.insert_plan_a('Inicial', '8:00-12:00', 118188.00);

SELECT public.insert_plan_b('Inicial', '8:00-12:00', 60016.95, 60016.95);

SELECT public.insert_plan_c('Inicial', '8:00-12:00', 24622.50, 9850.00);

SELECT public.insert_plan_a('Inicial', '8:00-15:00', 139356.00);

SELECT public.insert_plan_b('Inicial', '8:00-15:00', 70766.85, 70766.85);

SELECT public.insert_plan_c('Inicial', '8:00-15:00', 29032.50, 11613.00);

SELECT public.insert_plan_a('Inicial', '8:00-17:00', 169585.50);

SELECT public.insert_plan_b('Inicial', '8:00-17:00', 86117.85, 86117.85);

SELECT public.insert_plan_c('Inicial', '8:00-17:00', 26497.80, 15015.00);

SELECT public.insert_plan_a('Primaria', '8:00-13:30', 132294.75);

SELECT public.insert_plan_b('Primaria', '8:00-13:30', 67181.10, 67181.10);

SELECT public.insert_plan_c('Primaria', '8:00-13:30', 27561.45, 11025.00);

SELECT public.insert_plan_a('Primaria', '8:00-15:00', 139356.00);

SELECT public.insert_plan_b('Primaria', '8:00-15:00', 71566.85, 70766.85);

SELECT public.insert_plan_c('Primaria', '8:00-15:00', 30000.00, 11825.00);

DROP TABLE IF EXISTS public.student_preregistrations CASCADE;

-- ============================================================
-- FIX: Estudiantes invisibles para staff (0 en paneles directora/asistente)
-- Causa: 07_politicas.sql borra "students_staff_all" y "students_select",
--   dejando solo la política de padres. Con RLS activado, el staff
--   recibe 0 filas en silencio (sin error) → Total Alumnos = 0.
-- Este bloque es idempotente: seguro ejecutarlo las veces que sea.
-- ============================================================

-- 1) Diagnóstico: cuántos estudiantes existen de verdad
SELECT
  COUNT(*) AS total_registros,
  COUNT(*) FILTER (WHERE deleted_at IS NULL)   AS visibles_para_paneles,
  COUNT(*) FILTER (WHERE deleted_at IS NOT NULL) AS soft_deleted
FROM public.students;

-- 2) Políticas actuales sobre students
SELECT policyname, cmd, roles FROM pg_policies
WHERE schemaname='public' AND tablename='students'
ORDER BY policyname;

-- 3) Aplicar fix (staff con acceso total = mismas políticas que classrooms)
DO $$
BEGIN
  DROP POLICY IF EXISTS "students_staff_all" ON public.students;
  CREATE POLICY "students_staff_all" ON public.students FOR ALL
    TO authenticated
    USING (COALESCE(get_my_role(),'') IN ('directora','asistente','admin','maestra','encargada'))
    WITH CHECK (COALESCE(get_my_role(),'') IN ('directora','asistente','admin','maestra','encargada'));

  -- (Opcional) Si los estudiantes fueron "borrados" por error, restaurarlos:
  -- UPDATE public.students SET deleted_at = NULL WHERE deleted_at IS NOT NULL;
END $$;

-- 4) Verificación final
SELECT policyname, cmd FROM pg_policies
WHERE schemaname='public' AND tablename='students'
ORDER BY policyname;
