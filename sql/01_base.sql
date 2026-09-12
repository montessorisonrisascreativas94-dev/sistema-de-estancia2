-- ============================================================
-- 01_base.sql — Colegio Montessori Sonrisas Creativas
-- Contenido: sección 1 (LIMPIEZA DE FUNCIONES ANTIGUAS (para evitar conflictos)) + sección 2 (EXTENSIONES REQUERIDAS) + sección 3 (TIPOS PERSONALIZADOS (ENUMs)) + sección 4 (TABLAS (orden por dependencia))
-- ============================================================
-- ============================================================
-- 1. LIMPIEZA DE FUNCIONES ANTIGUAS (para evitar conflictos)
-- ============================================================
DO $$
DECLARE fn record;
BEGIN
  FOR fn IN
    SELECT p.oid, p.proname, n.nspname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
    AND p.proname IN (
      'financial_summary_month','generate_report_card','close_period',
      'mark_conversation_read','user_is_participant','generate_monthly_charges',
      'get_current_period','get_tasks_for_period','get_posts_for_period',
      'activate_period','get_student_history','is_period_open','get_active_period',
      'get_student_total_debt','is_teacher_of_classroom','is_parent_of_student',
      'is_parent_of_classroom','is_teacher_of_student','get_my_classroom_ids',
      'run_payment_cycle','get_unread_counts','get_dashboard_kpis',
      'get_monthly_financial_report_by_classroom','attendance_last_7_days',
      'find_or_create_private_conversation','get_direct_messages',
      'send_notification','get_my_role','can_access_app','handle_new_user',
      'handle_new_post_teacher_info','update_post_comments_count',
      'update_post_likes_count','handle_student_chat_creation',
      'notify_parent_on_new_charge','create_students_snapshot',
      'create_payments_snapshot','cleanup_old_login_attempts',
      'assign_student_to_classroom','assign_students_bulk','set_updated_at',
      'upload_payment_proof','generate_monthly_charges','calculate_mora',
      'preview_payment_cycle','check_payment_cycle_health',
      'process_door_punch','process_student_punch','approve_payment',
      'delete_payment','waive_payment_mora','reset_payment_to_pending',
      'calc_mora','is_email_under_attack','activate_period',
      'get_posts_for_parent','get_posts_for_period','mark_messages_read',
      'search_students','update_staff_permits_timestamp',
      'update_updated_at_column','convert_preregistration',
      'set_event_time','calculate_nap_duration',
      'generate_invoice_hash','mark_invoice_email_sent',
      'generate_receipt_number','generate_ascii_receipt',
      'trigger_update_ascii_receipt','create_school_year_with_periods',
      'generate_invoice_number','generate_invoice',
      'get_invoice','get_invoices_by_payment','get_invoices_by_student',
      'cancel_invoice','update_product_stock','calculate_order_item_subtotal'
    )
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %I.%I(%s) CASCADE',
      fn.nspname, fn.proname,
      pg_get_function_identity_arguments(fn.oid));
  END LOOP;
END $$;


-- ============================================================
-- 2. EXTENSIONES REQUERIDAS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ============================================================
-- 3. TIPOS PERSONALIZADOS (ENUMs)
-- ============================================================
DO $$ BEGIN
  CREATE TYPE permit_status AS ENUM ('pending','approved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE permit_type AS ENUM ('permission','absence','medical','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE student_status AS ENUM ('preinscrito','admitido','inscrito','activo','retirado','graduado','egresado','reinscrito');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE charge_status AS ENUM ('pending','overdue','paid','cancelled','waived','partial_scholarship','full_scholarship');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE charge_type AS ENUM ('inscripcion','colegiatura','reinscripcion','materiales','uniformes','otro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_plan_type AS ENUM ('monthly', 'semestral', 'anual', 'two_installments');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE product_category AS ENUM ('uniforme', 'libro', 'material', 'otro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE order_status AS ENUM ('pending', 'paid', 'approved', 'ready', 'delivered', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE event_type AS ENUM (
    'desayuno', 'merienda', 'almuerzo', 'biberon', 'dormir', 'despertar',
    'panal', 'bano', 'temperatura', 'medicamento', 'foto', 'nota'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE diaper_type AS ENUM ('liquido', 'solido', 'ambos');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================
-- 4. TABLAS (orden por dependencia)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id                  uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email               text UNIQUE,
  name                text,
  matricula           text UNIQUE,
  role                text CHECK (role IN ('directora','maestra','padre','asistente','admin','education_coordinator','encargada')),
  avatar_url          text,
  phone               text,
  bio                 text,
  notes               text,
  access_code         text UNIQUE,
  onesignal_player_id text,
  qr_code             text,
  deleted_at          timestamp with time zone,
  accepted_terms      boolean DEFAULT false,
  accepted_terms_at   timestamp with time zone,
  last_sign_in_at     timestamp with time zone,
  is_active           boolean DEFAULT true,
  salary              numeric DEFAULT 0,
  fiscal_rnc          text,
  fiscal_company_name text,
  fiscal_address      text,
  search_vector       tsvector GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(email,'') || ' ' || coalesce(phone,''))
  ) STORED,
  created_at          timestamp with time zone DEFAULT now() NOT NULL
);

-- Defensive: add columns that may have been added by migrations to existing tables
DO $$ BEGIN
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS access_code text UNIQUE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onesignal_player_id text;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_sign_in_at timestamp with time zone;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS salary numeric DEFAULT 0;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS fiscal_rnc text;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS fiscal_company_name text;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS fiscal_address text;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.classrooms (
  id                bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  name              text NOT NULL,
  level             text,
  capacity          integer DEFAULT 20,
  teacher_id        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_live           boolean DEFAULT false,
  active_period_id  bigint,
  deleted_at        timestamp with time zone,
  created_at        timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.students (
  id                      bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  name                    text NOT NULL,
  classroom_id            bigint REFERENCES public.classrooms(id) ON DELETE SET NULL,
  parent_id               uuid REFERENCES public.profiles(id),
  is_active               boolean DEFAULT true,
  avatar_url              text,
  matricula               text,
  age                     integer,
  age_type                text DEFAULT 'anos' CHECK (age_type IN ('anos','meses')),
  schedule                text,
  start_date              date,
  blood_type              text,
  allergies               text,
  authorized_pickup       text,
  authorized_pickup_phone text,
  p1_name                 text, p1_phone text, p1_email text,
  p1_job                  text, p1_address text, p1_emergency_contact text,
  p2_name                 text, p2_phone text, p2_email text,
  p2_job                  text, p2_address text, p2_emergency_contact text,
  monthly_fee             numeric DEFAULT 0,
  prolongado_fee          numeric DEFAULT 0,
  due_day                 integer DEFAULT 5,
  payment_plan            payment_plan_type DEFAULT 'monthly',
  qr_code                 text,
  data_confirmed_at       timestamp with time zone,
  next_data_confirmation_due date,
  deleted_at              timestamp with time zone,
  search_vector           tsvector GENERATED ALWAYS AS (
    to_tsvector('simple',
      coalesce(name,'') || ' ' || coalesce(matricula,'') || ' ' ||
      coalesce(p1_name,'') || ' ' || coalesce(p1_phone,''))
  ) STORED,
  created_at              timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_students_matricula ON public.students(matricula) WHERE matricula IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.school_years (
  id            bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  name          text NOT NULL UNIQUE,
  start_date    date NOT NULL,
  end_date      date NOT NULL,
  status        text DEFAULT 'active' CHECK (status IN ('active','closed','upcoming')),
  is_current    boolean DEFAULT false,
  deleted_at    timestamp with time zone,
  created_at    timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.payment_plans (
  id                  bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  school_year_id      bigint NOT NULL REFERENCES public.school_years(id) ON DELETE CASCADE,
  level               text NOT NULL,
  schedule            text NOT NULL,
  name                text NOT NULL,
  registration_fee    numeric(10,2) NOT NULL DEFAULT 0,
  description         text,
  is_active           boolean DEFAULT true,
  deleted_at          timestamp with time zone,
  created_at          timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.plan_installments (
  id                  bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  payment_plan_id     bigint NOT NULL REFERENCES public.payment_plans(id) ON DELETE CASCADE,
  type                charge_type NOT NULL DEFAULT 'colegiatura',
  month_number        int NOT NULL,
  month_name          text NOT NULL,
  amount              numeric(10,2) NOT NULL,
  due_day             int NOT NULL DEFAULT 5,
  due_month_offset    int NOT NULL DEFAULT 0,
  is_registration     boolean DEFAULT false,
  UNIQUE(payment_plan_id, type, month_number)
);

CREATE TABLE IF NOT EXISTS public.student_enrollments (
  id                    bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  student_id            bigint NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  school_year_id        bigint NOT NULL REFERENCES public.school_years(id) ON DELETE CASCADE,
  classroom_id          bigint REFERENCES public.classrooms(id) ON DELETE SET NULL,
  payment_plan_id       bigint REFERENCES public.payment_plans(id) ON DELETE SET NULL,
  status                student_status NOT NULL DEFAULT 'preinscrito',
  preinscription_date   timestamp with time zone,
  admission_date        timestamp with time zone,
  registration_date     timestamp with time zone,
  notes                 text,
  deleted_at            timestamp with time zone,
  created_at            timestamp with time zone DEFAULT now() NOT NULL,
  UNIQUE(student_id, school_year_id)
);

CREATE TABLE IF NOT EXISTS public.student_charges (
  id                      bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  student_enrollment_id   bigint NOT NULL REFERENCES public.student_enrollments(id) ON DELETE CASCADE,
  plan_installment_id     bigint REFERENCES public.plan_installments(id) ON DELETE SET NULL,
  type                    charge_type NOT NULL,
  concept                 text,
  amount                  numeric(10,2) NOT NULL,
  status                  charge_status NOT NULL DEFAULT 'pending',
  due_date                date,
  paid_date               timestamp with time zone,
  notes                   text,
  scholarship_amount      numeric(10,2) DEFAULT 0,
  late_fee_amount         numeric(10,2) DEFAULT 0,
  generated_by            uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  deleted_at              timestamp with time zone,
  created_at              timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.periods (
  id              bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  name            text NOT NULL,
  start_date      date NOT NULL,
  end_date        date NOT NULL,
  status          text DEFAULT 'open' CHECK (status IN ('open','closed')),
  is_active       boolean DEFAULT false,
  classroom_id    bigint REFERENCES public.classrooms(id) ON DELETE CASCADE,
  school_year_id  bigint REFERENCES public.school_years(id) ON DELETE SET NULL,
  deleted_at      timestamp with time zone,
  created_at      timestamp with time zone DEFAULT now() NOT NULL
);

-- Defensive: add school_year_id to periods if missing (added by migration)
DO $$ BEGIN
  ALTER TABLE public.periods ADD COLUMN IF NOT EXISTS school_year_id bigint REFERENCES public.school_years(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_classrooms_active_period'
  ) THEN
    ALTER TABLE public.classrooms
      ADD CONSTRAINT fk_classrooms_active_period
      FOREIGN KEY (active_period_id) REFERENCES public.periods(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.attendance (
  id           bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  student_id   bigint REFERENCES public.students(id) ON DELETE CASCADE,
  classroom_id bigint REFERENCES public.classrooms(id),
  date         date DEFAULT current_date,
  status       text CHECK (status IN ('present','absent','late','retirado')),
  check_in     timestamp with time zone,
  check_out    timestamp with time zone,
  created_at   timestamp with time zone DEFAULT now() NOT NULL,
  UNIQUE(student_id, date)
);

CREATE TABLE IF NOT EXISTS public.attendance_requests (
  id         bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  student_id bigint REFERENCES public.students(id) ON DELETE CASCADE,
  date       date NOT NULL,
  reason     text NOT NULL,
  note       text,
  status     text DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.tasks (
  id              bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  classroom_id    bigint REFERENCES public.classrooms(id) ON DELETE CASCADE,
  teacher_id      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  period_id       bigint REFERENCES public.periods(id) ON DELETE SET NULL,
  title           text NOT NULL,
  description     text,
  due_date        timestamp with time zone,
  file_url        text,
  grading_system  text DEFAULT 'numeric',
  created_at      timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.task_evidences (
  id            bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  task_id       bigint REFERENCES public.tasks(id) ON DELETE CASCADE,
  student_id    bigint REFERENCES public.students(id) ON DELETE CASCADE,
  parent_id     uuid REFERENCES public.profiles(id),
  file_url      text,
  comment       text,
  status        text DEFAULT 'submitted',
  grade_letter  text CHECK (grade_letter IN ('A','B','C','D')),
  stars         integer CHECK (stars >= 1 AND stars <= 5),
  numeric_score numeric(5,2) CHECK (numeric_score >= 0 AND numeric_score <= 100),
  created_at    timestamp with time zone DEFAULT now() NOT NULL,
  UNIQUE(task_id, student_id)
);

-- Defensive: add numeric_score to task_evidences if missing (added by migration)
DO $$ BEGIN
  ALTER TABLE public.task_evidences ADD COLUMN IF NOT EXISTS numeric_score numeric(5,2) CHECK (numeric_score >= 0 AND numeric_score <= 100);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.posts (
  id             bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  classroom_id   bigint REFERENCES public.classrooms(id) ON DELETE CASCADE,
  teacher_id     uuid REFERENCES public.profiles(id),
  period_id      bigint REFERENCES public.periods(id) ON DELETE SET NULL,
  content        text,
  media_url      text,
  media_type     text,
  image_url      text,
  images         text[] DEFAULT '{}',
  title          text,
  teacher_name   text,
  teacher_avatar text,
  likes_count    integer DEFAULT 0,
  comments_count integer DEFAULT 0,
  updated_at     timestamp with time zone DEFAULT now(),
  created_at     timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.comments (
  id         bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  post_id    bigint REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_name  text,
  content    text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.likes (
  id            bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  post_id       bigint REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id       uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  reaction_type text DEFAULT 'like',
  created_at    timestamp with time zone DEFAULT now() NOT NULL,
  UNIQUE(post_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.conversations (
  id           bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  type         text DEFAULT 'direct_message'
               CHECK (type IN ('direct_message','private','classroom','group')),
  classroom_id bigint REFERENCES public.classrooms(id) ON DELETE SET NULL,
  updated_at   timestamp with time zone DEFAULT now(),
  created_at   timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.conversation_participants (
  conversation_id bigint REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at      timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY(conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.messages (
  id              bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  conversation_id bigint REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id       uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  receiver_id     uuid REFERENCES public.profiles(id),
  content         text NOT NULL,
  is_read         boolean DEFAULT false,
  read_at         timestamp with time zone,
  created_at      timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id         bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  user_id    uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title      text NOT NULL,
  message    text NOT NULL,
  type       text DEFAULT 'info',
  link       text,
  is_read    boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.payments (
  id                    bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  student_id            bigint REFERENCES public.students(id) ON DELETE CASCADE,
  amount                numeric(10,2) NOT NULL,
  concept               text DEFAULT 'Mensualidad',
  status                text DEFAULT 'pending',
  month_paid            text,
  due_date              date,
  paid_date             timestamp with time zone,
  method                text,
  bank                  text,
  reference             text,
  transfer_date         date,
  proof_url             text,
  evidence_url          text,
  notes                 text,
  validated_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  recorded_by           uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  last_reminder_sent    timestamp with time zone,
  student_charge_id     bigint REFERENCES public.student_charges(id) ON DELETE SET NULL,
  installment_number    integer,
  total_installments    integer,
  exclude_dgii          boolean DEFAULT false,
  deleted_at            timestamp with time zone,
  updated_at            timestamp with time zone DEFAULT now(),
  created_at            timestamp with time zone DEFAULT now() NOT NULL
);

-- Defensive: add columns to payments if missing (added by migrations)
DO $$ BEGIN
  ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS exclude_dgii boolean DEFAULT false;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS installment_number integer;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS total_installments integer;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS discount_amount numeric(10,2) DEFAULT 0;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS discount_percent numeric(5,2) DEFAULT 0;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_unique_student_month
  ON public.payments(student_id, month_paid) WHERE month_paid IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.invoices (
  id                          bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  invoice_number              text UNIQUE NOT NULL,
  payment_id                  bigint REFERENCES public.payments(id) ON DELETE SET NULL,
  student_id                  bigint REFERENCES public.students(id) ON DELETE CASCADE,
  student_name                text,
  student_matricula           text,
  classroom_name              text,
  parent_name                 text,
  parent_phone                text,
  concept                     text,
  amount                      numeric(10,2) NOT NULL,
  subtotal                    numeric(10,2) DEFAULT 0,
  tax_amount                  numeric(10,2) DEFAULT 0,
  total                       numeric(10,2) NOT NULL,
  tax_rate                    numeric(5,2) DEFAULT 0,
  currency                    text DEFAULT 'RD$',
  status                      text DEFAULT 'issued' CHECK (status IN ('issued','paid','cancelled','void')),
  payment_method              text,
  payment_date                timestamp with time zone,
  issued_date                 timestamp with time zone DEFAULT now(),
  due_date                    date,
  school_name                 text,
  school_rnc                  text,
  school_address              text,
  school_phone                text,
  school_email                text,
  school_website              text,
  school_logo_url             text,
  issued_by                   uuid REFERENCES public.profiles(id),
  issued_by_name              text,
  notes                       text,
  footer_note                 text,
  terms                       text,
  pdf_url                     text,
  qr_data                     text,
  sha256_hash                 text,
  validation_url              text,
  uuid_folio                  text DEFAULT gen_random_uuid()::text,
  email_sent                  boolean DEFAULT false,
  email_sent_at               timestamp with time zone,
  ncf                         text,
  fiscal_parent_rnc           text,
  fiscal_parent_company_name  text,
  fiscal_parent_address       text,
  ncf_assigned_by             uuid REFERENCES public.profiles(id),
  ncf_assigned_at             timestamp with time zone,
  receipt_number              text,
  payment_reference           text,
  attended_by                 text,
  period                      text,
  next_payment_date           date,
  next_payment_amount         numeric(10,2),
  digital_folio               uuid DEFAULT uuid_generate_v4(),
  fiscal_receipt_url          text,
  ascii_receipt               text,
  created_at                  timestamp with time zone DEFAULT now() NOT NULL,
  updated_at                  timestamp with time zone DEFAULT now()
);

-- Defensive: add columns to invoices if missing (added by migrations)
DO $$ BEGIN
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS pdf_url text;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS qr_data text;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS sha256_hash text;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS validation_url text;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS uuid_folio text DEFAULT gen_random_uuid()::text;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS issued_by_name text;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS email_sent boolean DEFAULT false;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS email_sent_at timestamp with time zone;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS receipt_number text;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS payment_reference text;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS attended_by text;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS period text;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS next_payment_date date;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS next_payment_amount numeric(10,2);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS digital_folio uuid DEFAULT uuid_generate_v4();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS fiscal_receipt_url text;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS ascii_receipt text;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS ncf text;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS fiscal_parent_rnc text;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS fiscal_parent_company_name text;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS fiscal_parent_address text;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS ncf_assigned_by uuid REFERENCES public.profiles(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS ncf_assigned_at timestamp with time zone;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS student_name text;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS student_matricula text;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS classroom_name text;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS parent_name text;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS parent_phone text;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS concept text;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS tax_amount numeric(10,2) DEFAULT 0;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS tax_rate numeric(5,2) DEFAULT 0;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS currency text DEFAULT 'RD$';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS status text DEFAULT 'issued' CHECK (status IN ('issued','paid','cancelled','void'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS payment_date timestamp with time zone;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS issued_date timestamp with time zone DEFAULT now();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS due_date date;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS school_name text;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS school_rnc text;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS school_address text;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS school_phone text;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS school_email text;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS school_website text;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS school_logo_url text;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS issued_by uuid REFERENCES public.profiles(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS notes text;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS footer_note text;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS terms text;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS subtotal numeric(10,2) DEFAULT 0;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.invoice_items (
  id          bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  invoice_id  bigint NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  concept     text NOT NULL,
  quantity    numeric(10,2) NOT NULL DEFAULT 1,
  unit_price  numeric(10,2) NOT NULL,
  total       numeric(10,2) NOT NULL,
  created_at  timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.payment_audit_log (
  id          bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  payment_id  bigint,
  action      text,
  old_status  text,
  new_status  text,
  changed_by  uuid REFERENCES public.profiles(id),
  changed_at  timestamp with time zone DEFAULT now() NOT NULL,
  details     jsonb DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS public.incidents (
  id           bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  student_id   bigint REFERENCES public.students(id) ON DELETE CASCADE,
  classroom_id bigint REFERENCES public.classrooms(id) ON DELETE CASCADE,
  teacher_id   uuid REFERENCES public.profiles(id),
  severity     text CHECK (severity IN ('leve','media','alta')),
  status       text DEFAULT 'received'
               CHECK (status IN ('received','review','resolved','archived')),
  description  text,
  reported_at  timestamp with time zone DEFAULT now() NOT NULL,
  created_at   timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.daily_logs (
  id           bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  student_id   bigint REFERENCES public.students(id) ON DELETE CASCADE,
  classroom_id bigint REFERENCES public.classrooms(id) ON DELETE CASCADE,
  date         date DEFAULT current_date,
  mood         text, food text, nap text, eating text, sleeping text,
  activities   text, notes text,
  infant_data  jsonb DEFAULT '[]'::jsonb,
  status       text DEFAULT 'published' CHECK (status IN ('draft','published')),
  created_at   timestamp with time zone DEFAULT now() NOT NULL,
  UNIQUE(student_id, date)
);

CREATE TABLE IF NOT EXISTS public.classroom_gallery (
  id           bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  classroom_id bigint REFERENCES public.classrooms(id) ON DELETE CASCADE,
  image_url    text NOT NULL,
  caption      text,
  date         date DEFAULT current_date,
  created_at   timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.classroom_chat (
  id           bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  classroom_id bigint REFERENCES public.classrooms(id) ON DELETE CASCADE,
  user_id      uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  message      text NOT NULL,
  created_at   timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.grades (
  id             bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  student_id     bigint REFERENCES public.students(id) ON DELETE CASCADE,
  classroom_id   bigint REFERENCES public.classrooms(id),
  period_id      bigint REFERENCES public.periods(id),
  school_year_id bigint REFERENCES public.school_years(id),
  subject        text,
  score          numeric(4,2),
  numeric_score  numeric(5,2) CHECK (numeric_score >= 0 AND numeric_score <= 100),
  teacher_id     uuid REFERENCES public.profiles(id),
  notes          text,
  created_at     timestamp with time zone DEFAULT now() NOT NULL
);

-- Defensive: add columns to grades if missing (added by migrations)
DO $$ BEGIN
  ALTER TABLE public.grades ADD COLUMN IF NOT EXISTS school_year_id bigint REFERENCES public.school_years(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.grades ADD COLUMN IF NOT EXISTS numeric_score numeric(5,2) CHECK (numeric_score >= 0 AND numeric_score <= 100);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.parent_ratings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id        uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  teacher_id       uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  month            text NOT NULL,
  rating           integer CHECK (rating >= 1 AND rating <= 5),
  comment          text,
  recommendations  text,
  observations     text,
  created_at       timestamp with time zone DEFAULT now(),
  UNIQUE(parent_id, month)
);

CREATE TABLE IF NOT EXISTS public.report_cards (
  id              bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  student_id      bigint REFERENCES public.students(id) ON DELETE CASCADE,
  classroom_id    bigint REFERENCES public.classrooms(id),
  period_id       bigint REFERENCES public.periods(id),
  school_year_id  bigint REFERENCES public.school_years(id),
  task_avg        numeric(5,2),
  formal_avg      numeric(5,2),
  final_score     numeric(5,2),
  level           text,
  teacher_comment text,
  generated_at    timestamp with time zone DEFAULT now(),
  created_at      timestamp with time zone DEFAULT now() NOT NULL,
  UNIQUE(student_id, period_id)
);

-- Defensive: add school_year_id to report_cards + widen numeric columns (added by migration)
DO $$ BEGIN
  ALTER TABLE public.report_cards ADD COLUMN IF NOT EXISTS school_year_id bigint REFERENCES public.school_years(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.report_cards ALTER COLUMN task_avg TYPE numeric(5,2);
EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.report_cards ALTER COLUMN formal_avg TYPE numeric(5,2);
EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.report_cards ALTER COLUMN final_score TYPE numeric(5,2);
EXCEPTION WHEN undefined_column THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.inquiries (
  id           bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  parent_id    uuid REFERENCES public.profiles(id) NOT NULL,
  student_id   bigint REFERENCES public.students(id),
  subject      text, message text NOT NULL, response text,
  status       text DEFAULT 'pending', priority text DEFAULT 'medium',
  folio        text, attachment_url text,
  updated_at   timestamp with time zone,
  responded_at timestamp with time zone,
  created_at   timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.school_settings (
  id                 int PRIMARY KEY DEFAULT 1,
  phone              text DEFAULT '(829) 803-8424',
  business_hours     text DEFAULT 'Lun-Vie: 7am - 6pm',
  generation_day     int DEFAULT 25,
  due_day            int DEFAULT 5,
  check_in_start     time DEFAULT '07:30:00',
  check_in_end       time DEFAULT '08:30:00',
  check_out_start    time DEFAULT '16:00:00',
  check_out_end      time DEFAULT '17:30:00',
  open_time          time DEFAULT '07:00:00',
  close_time         time DEFAULT '18:00:00',
  work_days          text DEFAULT '["Lun","Mar","Mie","Jue","Vie"]',
  rnc                text,
  school_name        text DEFAULT 'Colegio Montessori Sonrisas Creativas',
  address            text,
  address_line_2     text,
  city               text,
  state              text,
  zip_code           text,
  country            text DEFAULT 'Republica Dominicana',
  email              text,
  website            text,
  logo_url           text,
  tax_rate           numeric(5,2) DEFAULT 0.00,
  currency           text DEFAULT 'RD$',
  invoice_prefix     text DEFAULT 'FAC-',
  invoice_counter    bigint DEFAULT 1,
  footer_note        text DEFAULT 'Gracias por su preferencia',
  terms_conditions   text,
  reenrollment_month int DEFAULT 8,
  updated_at         timestamp with time zone DEFAULT now()
);

INSERT INTO public.school_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Defensive: add columns to school_settings if missing (added by migrations)
DO $$ BEGIN
  ALTER TABLE public.school_settings ADD COLUMN IF NOT EXISTS city text;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.school_settings ADD COLUMN IF NOT EXISTS state text;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.school_settings ADD COLUMN IF NOT EXISTS zip_code text;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.school_settings ADD COLUMN IF NOT EXISTS address_line_2 text;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.school_settings ADD COLUMN IF NOT EXISTS country text DEFAULT 'Republica Dominicana';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.school_settings ADD COLUMN IF NOT EXISTS reenrollment_month int DEFAULT 8;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.system_events (
  id           bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  type         text NOT NULL, payload jsonb,
  status       text DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
  processed_at timestamp with time zone,
  created_at   timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.system_errors (
  id          bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  panel       text,
  user_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  message     text,
  stack       text,
  url         text,
  user_agent  text,
  created_at  timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.terms_acceptance (
  id            bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  accepted_at   timestamp with time zone DEFAULT now() NOT NULL,
  terms_version text DEFAULT '1.0' NOT NULL,
  UNIQUE(user_id, terms_version)
);

CREATE TABLE IF NOT EXISTS public.meetings (
  id          bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  title       text NOT NULL, description text, room_name text NOT NULL,
  start_time  timestamp with time zone,
  type        text DEFAULT 'classroom', target_id bigint,
  host_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status      text DEFAULT 'scheduled' CHECK (status IN ('scheduled','live','ended','cancelled')),
  created_at  timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id         bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  user_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action     text NOT NULL,
  payload    jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.data_snapshots (
  id          bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  type        text NOT NULL,
  data        jsonb,
  created_at  timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.login_attempts (
  id         bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  email      text, ip_hash text, success boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.door_punches (
  id                      bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  student_id              bigint REFERENCES public.students(id) ON DELETE CASCADE,
  staff_id                uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  punch_type              text NOT NULL CHECK (punch_type IN ('check_in','check_out')),
  punched_at              timestamp with time zone DEFAULT now() NOT NULL,
  date                    date DEFAULT current_date NOT NULL,
  parent_notified         boolean DEFAULT false,
  pickup_person_name      text,
  pickup_person_relationship text,
  pickup_verified         boolean DEFAULT false,
  created_at              timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT door_punches_student_type_date UNIQUE (student_id, punch_type, date),
  CONSTRAINT door_punches_staff_type_date   UNIQUE (staff_id, punch_type, date),
  CONSTRAINT door_punches_one_subject CHECK (
    (student_id IS NOT NULL AND staff_id IS NULL) OR
    (student_id IS NULL AND staff_id IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.staff_permits (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  staff_id    uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  type        permit_type DEFAULT 'permission',
  reason      text NOT NULL,
  start_date  date NOT NULL,
  end_date    date NOT NULL,
  status      permit_status DEFAULT 'pending',
  approved_by uuid REFERENCES public.profiles(id),
  comments    text,
  evidence_url text,
  created_at  timestamp with time zone DEFAULT now(),
  updated_at  timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.products (
  id              bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  code            varchar(50) UNIQUE,
  name            text NOT NULL,
  description     text,
  category        product_category NOT NULL,
  price           numeric(10,2) NOT NULL,
  cost            numeric(10,2),
  itbis_rate      numeric(5,2) DEFAULT 18,
  is_itbis_exempt boolean DEFAULT false,
  unit            varchar(50) DEFAULT 'unidad',
  stock           integer DEFAULT 0,
  image_url       text,
  is_active       boolean DEFAULT true,
  created_by      uuid REFERENCES public.profiles(id),
  updated_by      uuid REFERENCES public.profiles(id),
  deleted_at      timestamp with time zone,
  created_at      timestamp with time zone DEFAULT now() NOT NULL,
  updated_at      timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.orders (
  id            bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  parent_id     uuid REFERENCES public.profiles(id) NOT NULL,
  student_id    bigint REFERENCES public.students(id),
  total_amount  numeric(10,2) NOT NULL,
  status        order_status DEFAULT 'pending',
  payment_id    bigint REFERENCES public.payments(id),
  notes         text,
  approved_by   uuid REFERENCES public.profiles(id),
  approved_at   timestamp with time zone,
  delivered_by  uuid REFERENCES public.profiles(id),
  delivered_at  timestamp with time zone,
  deleted_at    timestamp with time zone,
  created_at    timestamp with time zone DEFAULT now() NOT NULL,
  updated_at    timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_items (
  id             bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  order_id       bigint REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id     bigint REFERENCES public.products(id),
  product_name   text NOT NULL,
  product_price  numeric(10,2) NOT NULL,
  quantity       integer NOT NULL DEFAULT 1,
  subtotal       numeric(10,2) NOT NULL,
  created_at     timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id             bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  product_id     bigint REFERENCES public.products(id) NOT NULL,
  movement_type  text NOT NULL CHECK (movement_type IN ('in', 'out')),
  quantity       integer NOT NULL,
  reason         text,
  reference_id   bigint,
  reference_type text,
  created_by     uuid REFERENCES public.profiles(id),
  created_at     timestamp with time zone DEFAULT now() NOT NULL
);

-- === Tablas nuevas desde migraciones ===

CREATE TABLE IF NOT EXISTS public.student_preregistrations (
  id                      bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  student_name            text NOT NULL,
  student_last_name       text,
  birth_date              date,
  gender                  text,
  nationality             text,
  student_photo_url       text,
  school_year_requested   text,
  level_requested         text,
  schedule                text,
  estimated_entry_date    date,
  has_siblings            boolean DEFAULT false,
  sibling_name            text,
  p1_name                 text NOT NULL,
  p1_relationship         text,
  p1_cedula               text,
  p1_birth_date           date,
  p1_phone                text NOT NULL,
  p1_whatsapp             text,
  p1_email                text NOT NULL,
  p1_address              text,
  p1_occupation           text,
  p1_profession           text,
  p1_workplace            text,
  p2_name                 text,
  p2_relationship         text,
  p2_cedula               text,
  p2_birth_date           date,
  p2_phone                text,
  p2_whatsapp             text,
  p2_email                text,
  p2_address              text,
  p2_occupation           text,
  p2_profession           text,
  p2_workplace            text,
  emergency_name          text,
  emergency_relationship  text,
  emergency_cedula        text,
  emergency_phone         text,
  emergency_observations  text,
  authorized_persons      jsonb DEFAULT '[]'::jsonb,
  blood_type              text,
  allergies               text,
  medical_conditions      text,
  medications             text,
  food_restrictions       text,
  medical_notes           text,
  photo_url               text,
  birth_certificate_url   text,
  cedula_front_url        text,
  cedula_back_url         text,
  auth_data_treatment     boolean DEFAULT false,
  auth_correct_info       boolean DEFAULT false,
  auth_contact            boolean DEFAULT false,
  auth_regulations        boolean DEFAULT false,
  digital_signature       text,
  signature_date          timestamp with time zone,
  reference               text,
  comments                text,
  status                  text DEFAULT 'pending' CHECK (status IN ('pending','admitted','rejected','converted')),
  reviewed_at             timestamp with time zone,
  reviewed_by             uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at              timestamp with time zone DEFAULT now() NOT NULL,
  updated_at              timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.classroom_events (
  id            bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  classroom_id  bigint NOT NULL REFERENCES public.classrooms(id),
  teacher_id    uuid NOT NULL REFERENCES auth.users(id),
  event_type    event_type NOT NULL,
  event_date    date NOT NULL DEFAULT current_date,
  event_time    timestamp with time zone NOT NULL DEFAULT now(),
  created_at    timestamp with time zone DEFAULT now() NOT NULL,
  updated_at    timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.event_participants (
  id          bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  event_id    bigint NOT NULL REFERENCES public.classroom_events(id) ON DELETE CASCADE,
  student_id  bigint NOT NULL REFERENCES public.students(id),
  status      varchar(50) NOT NULL DEFAULT 'present',
  notes       text,
  extra_data  jsonb,
  created_at  timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.classroom_routines (
  id            bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  classroom_id  bigint NOT NULL REFERENCES public.classrooms(id),
  event_type    event_type NOT NULL,
  priority      int NOT NULL DEFAULT 1,
  is_favorite   boolean DEFAULT true,
  created_at    timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.nap_sessions (
  id               bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  student_id       bigint NOT NULL REFERENCES public.students(id),
  classroom_id     bigint NOT NULL REFERENCES public.classrooms(id),
  teacher_id       uuid NOT NULL REFERENCES auth.users(id),
  nap_start        timestamp with time zone DEFAULT now() NOT NULL,
  nap_end          timestamp with time zone,
  duration_minutes int,
  notes            text,
  created_at       timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.teacher_schedules (
  id                bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  classroom_id      bigint REFERENCES public.classrooms(id) ON DELETE CASCADE NOT NULL,
  event_key         text NOT NULL,
  emoji             text DEFAULT '📌',
  label             text NOT NULL,
  color             text DEFAULT '#94A3B8',
  start_time        time NOT NULL,
  duration          integer DEFAULT 30 CHECK (duration > 0 AND duration <= 480),
  event_type        text DEFAULT 'colectivo' CHECK (event_type IN ('individual','colectivo','automatico')),
  auto              boolean DEFAULT false,
  needs_confirm     boolean DEFAULT false,
  visible_parents   boolean DEFAULT true,
  visible_director  boolean DEFAULT true,
  active_days       integer[] DEFAULT '{1,2,3,4,5,6}',
  is_active         boolean DEFAULT true,
  created_at        timestamp with time zone DEFAULT now() NOT NULL,
  updated_at        timestamp with time zone DEFAULT now() NOT NULL,
  UNIQUE(classroom_id, event_key)
);

CREATE TABLE IF NOT EXISTS public.schedule_event_logs (
  id             bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  classroom_id   bigint REFERENCES public.classrooms(id) ON DELETE CASCADE NOT NULL,
  event_key      text NOT NULL,
  activated_at   timestamp with time zone DEFAULT now() NOT NULL,
  activated_by   uuid REFERENCES public.profiles(id),
  student_count  integer DEFAULT 0,
  metadata       jsonb DEFAULT '{}'::jsonb,
  created_at     timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.payment_concepts (
  id          bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  name        text NOT NULL,
  description text,
  amount      numeric(10,2) NOT NULL DEFAULT 0,
  is_active   boolean DEFAULT true,
  created_at  timestamp with time zone DEFAULT now(),
  updated_at  timestamp with time zone DEFAULT now(),
  deleted_at  timestamp with time zone
);

-- Defensive: rename 'active' → 'is_active' if table exists with old column name
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payment_concepts' AND column_name = 'active'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payment_concepts' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE public.payment_concepts RENAME COLUMN active TO is_active;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.caja_sessions (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  date             date NOT NULL UNIQUE,
  opening_balance  numeric DEFAULT 0,
  closing_balance  numeric DEFAULT 0,
  status           text DEFAULT 'open' CHECK (status IN ('open','closed')),
  opened_by        uuid REFERENCES public.profiles(id),
  notes            text,
  created_at       timestamp with time zone DEFAULT now(),
  updated_at       timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.accounting_journal (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  fecha         date NOT NULL,
  ref           text,
  descripcion   text,
  cuenta_debe   text,
  monto_debe    numeric DEFAULT 0,
  cuenta_haber  text,
  monto_haber   numeric DEFAULT 0,
  tipo          text CHECK (tipo IN ('ingreso','gasto','ajuste')),
  payment_id    bigint REFERENCES public.payments(id),
  created_at    timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payroll_records (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id  uuid REFERENCES public.profiles(id),
  period       text NOT NULL,
  gross_salary numeric DEFAULT 0,
  afp          numeric DEFAULT 0,
  ars          numeric DEFAULT 0,
  isr          numeric DEFAULT 0,
  net_salary   numeric DEFAULT 0,
  status       text DEFAULT 'pendiente' CHECK (status IN ('pendiente','pagado','cancelado')),
  notes        text,
  created_at   timestamp with time zone DEFAULT now()
);

