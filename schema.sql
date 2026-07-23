-- ============================================================
-- Colegio Montessori Sonrisas Creativas - Schema Unificado v4.0
-- ============================================================
-- Este archivo contiene TODO el esquema de la base de datos en un solo lugar.
-- Generado a partir de schema.sql v3.0 + 19 migraciones.
-- Idempotente: se puede ejecutar multiples veces sin errores.
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

-- ============================================================
-- 5. INDICES DE RENDIMIENTO
-- ============================================================

-- school_years
CREATE INDEX IF NOT EXISTS idx_school_years_status ON public.school_years(status);
CREATE INDEX IF NOT EXISTS idx_school_years_is_current ON public.school_years(is_current) WHERE is_current = true;

-- payment_plans
CREATE INDEX IF NOT EXISTS idx_payment_plans_school_year ON public.payment_plans(school_year_id);
CREATE INDEX IF NOT EXISTS idx_payment_plans_level ON public.payment_plans(level);
CREATE INDEX IF NOT EXISTS idx_payment_plans_schedule ON public.payment_plans(schedule);
CREATE INDEX IF NOT EXISTS idx_payment_plans_active ON public.payment_plans(is_active) WHERE is_active = true AND deleted_at IS NULL;

-- plan_installments
CREATE INDEX IF NOT EXISTS idx_plan_installments_plan ON public.plan_installments(payment_plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_installments_type ON public.plan_installments(type);

-- student_enrollments
CREATE INDEX IF NOT EXISTS idx_enrollments_student ON public.student_enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_school_year ON public.student_enrollments(school_year_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_classroom ON public.student_enrollments(classroom_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_status ON public.student_enrollments(status);
CREATE INDEX IF NOT EXISTS idx_enrollments_student_year ON public.student_enrollments(student_id, school_year_id);

-- student_charges
CREATE INDEX IF NOT EXISTS idx_charges_enrollment ON public.student_charges(student_enrollment_id);
CREATE INDEX IF NOT EXISTS idx_charges_installment ON public.student_charges(plan_installment_id);
CREATE INDEX IF NOT EXISTS idx_charges_status ON public.student_charges(status);
CREATE INDEX IF NOT EXISTS idx_charges_due_date ON public.student_charges(due_date) WHERE status IN ('pending','overdue');
CREATE INDEX IF NOT EXISTS idx_charges_type ON public.student_charges(type);

-- payments
CREATE INDEX IF NOT EXISTS idx_payments_charge ON public.payments(student_charge_id);
CREATE INDEX IF NOT EXISTS idx_payments_month_paid ON public.payments(month_paid);
CREATE INDEX IF NOT EXISTS idx_payments_student_month ON public.payments(student_id, month_paid);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_month_status ON public.payments(month_paid, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payments_overdue_reminder ON public.payments(status, due_date, last_reminder_sent) WHERE status = 'overdue';
CREATE INDEX IF NOT EXISTS idx_payments_student_id ON public.payments(student_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON public.payments(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payments_due_date ON public.payments(due_date) WHERE deleted_at IS NULL AND status IN ('pending','overdue');
CREATE INDEX IF NOT EXISTS idx_payments_exclude_dgii ON public.payments(exclude_dgii) WHERE exclude_dgii = true;

-- students
CREATE INDEX IF NOT EXISTS idx_students_search_vector ON public.students USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_students_name_lower ON public.students(lower(name));
CREATE INDEX IF NOT EXISTS idx_students_parent ON public.students(parent_id);
CREATE INDEX IF NOT EXISTS idx_students_classroom ON public.students(classroom_id);
CREATE INDEX IF NOT EXISTS idx_students_active_fee ON public.students(is_active, monthly_fee) WHERE is_active = true AND monthly_fee > 0;

-- profiles
CREATE INDEX IF NOT EXISTS idx_profiles_search_vector ON public.profiles USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_name_lower ON public.profiles(lower(name));

-- notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, is_read) WHERE is_read = false;

-- messages
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages(conversation_id, created_at DESC);

-- attendance
CREATE INDEX IF NOT EXISTS idx_attendance_classroom_date ON public.attendance(classroom_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_student_date ON public.attendance(student_id, date);

-- posts
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON public.posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_classroom_id ON public.posts(classroom_id) WHERE classroom_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posts_period ON public.posts(period_id, classroom_id);

-- door_punches
CREATE INDEX IF NOT EXISTS idx_door_punches_date ON public.door_punches(date);
CREATE INDEX IF NOT EXISTS idx_door_punches_student ON public.door_punches(student_id, date);
CREATE INDEX IF NOT EXISTS idx_door_punches_staff ON public.door_punches(staff_id, date);

-- tasks
CREATE INDEX IF NOT EXISTS idx_tasks_period ON public.tasks(period_id, classroom_id);

-- grades
CREATE INDEX IF NOT EXISTS idx_grades_period ON public.grades(period_id, student_id);
CREATE INDEX IF NOT EXISTS idx_grades_school_year ON public.grades(school_year_id);

-- report_cards
CREATE INDEX IF NOT EXISTS idx_report_cards_school_year ON public.report_cards(school_year_id);

-- login_attempts
CREATE INDEX IF NOT EXISTS idx_login_attempts_email_time ON public.login_attempts(email, created_at DESC, success);

-- audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_payload ON public.audit_logs USING GIN (payload jsonb_path_ops) WHERE payload IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_payment_id ON public.audit_logs((payload->>'payment_id'), created_at DESC) WHERE action LIKE 'payment.%';

-- system_errors
CREATE INDEX IF NOT EXISTS idx_system_errors_created_at ON public.system_errors(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_errors_user_id ON public.system_errors(user_id);

-- system_events
CREATE INDEX IF NOT EXISTS idx_system_events_payload ON public.system_events USING GIN (payload jsonb_path_ops) WHERE payload IS NOT NULL;

-- products
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category);
CREATE INDEX IF NOT EXISTS idx_products_active ON public.products(is_active) WHERE is_active = true AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_products_code ON public.products(code);

-- orders
CREATE INDEX IF NOT EXISTS idx_orders_parent ON public.orders(parent_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC) WHERE deleted_at IS NULL;

-- order_items
CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON public.order_items(product_id);

-- inventory_movements
CREATE INDEX IF NOT EXISTS idx_inventory_movements_product ON public.inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_created_at ON public.inventory_movements(created_at DESC);

-- invoices
CREATE INDEX IF NOT EXISTS idx_invoices_ncf ON public.invoices(ncf) WHERE ncf IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_uuid_folio ON public.invoices(uuid_folio);
CREATE INDEX IF NOT EXISTS idx_invoices_sha256 ON public.invoices(sha256_hash);
CREATE INDEX IF NOT EXISTS idx_invoices_pdf_url ON public.invoices(pdf_url) WHERE pdf_url IS NOT NULL;

-- parent_ratings
CREATE INDEX IF NOT EXISTS idx_parent_ratings_parent ON public.parent_ratings(parent_id);
CREATE INDEX IF NOT EXISTS idx_parent_ratings_teacher ON public.parent_ratings(teacher_id);
CREATE INDEX IF NOT EXISTS idx_parent_ratings_month ON public.parent_ratings(month);

-- student_preregistrations
CREATE INDEX IF NOT EXISTS idx_preregistrations_status ON public.student_preregistrations(status);
CREATE INDEX IF NOT EXISTS idx_preregistrations_created ON public.student_preregistrations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_preregistrations_student_name ON public.student_preregistrations(lower(student_name));
CREATE INDEX IF NOT EXISTS idx_preregistrations_level ON public.student_preregistrations(level_requested);

-- classroom_events
CREATE INDEX IF NOT EXISTS idx_classroom_events_classroom ON public.classroom_events(classroom_id);
CREATE INDEX IF NOT EXISTS idx_classroom_events_date ON public.classroom_events(event_date);
CREATE INDEX IF NOT EXISTS idx_classroom_events_type ON public.classroom_events(event_type);

-- event_participants
CREATE INDEX IF NOT EXISTS idx_event_participants_event ON public.event_participants(event_id);
CREATE INDEX IF NOT EXISTS idx_event_participants_student ON public.event_participants(student_id);

-- nap_sessions
CREATE INDEX IF NOT EXISTS idx_nap_sessions_student ON public.nap_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_nap_sessions_open ON public.nap_sessions(nap_end) WHERE nap_end IS NULL;

-- teacher_schedules
CREATE INDEX IF NOT EXISTS idx_teacher_schedules_classroom ON public.teacher_schedules(classroom_id);

-- schedule_event_logs
CREATE INDEX IF NOT EXISTS idx_schedule_event_logs_classroom_date ON public.schedule_event_logs(classroom_id, activated_at);
CREATE INDEX IF NOT EXISTS idx_schedule_event_logs_event_key ON public.schedule_event_logs(event_key);

-- accounting_journal
CREATE INDEX IF NOT EXISTS idx_journal_fecha ON public.accounting_journal(fecha);
CREATE INDEX IF NOT EXISTS idx_journal_tipo ON public.accounting_journal(tipo);

-- payroll_records
CREATE INDEX IF NOT EXISTS idx_payroll_period ON public.payroll_records(period);
CREATE INDEX IF NOT EXISTS idx_payroll_employee ON public.payroll_records(employee_id);

-- payment_concepts
CREATE INDEX IF NOT EXISTS idx_payment_concepts_active ON public.payment_concepts(is_active) WHERE is_active = true;

-- ============================================================
-- 6. HABILITAR ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE public.profiles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classrooms              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_requests     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_evidences          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.likes                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_audit_log       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_logs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classroom_gallery       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classroom_chat          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grades                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.periods                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_cards            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inquiries               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_settings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_events           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_errors           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.terms_acceptance        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetings                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_snapshots          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_attempts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.door_punches            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_permits           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_ratings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_preregistrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classroom_events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_participants      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classroom_routines      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nap_sessions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_schedules       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_event_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_concepts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caja_sessions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_journal      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_records         ENABLE ROW LEVEL SECURITY;

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

-- ============================================================
-- 9. POLITICAS RLS
-- ============================================================

-- profiles
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT
  USING (auth.uid() = id OR COALESCE(get_my_role(), '') IN ('directora','asistente','admin','encargada'));

DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT
  WITH CHECK (COALESCE(get_my_role(), '') IN ('directora','admin'));

DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE
  USING (auth.uid() = id OR COALESCE(get_my_role(), '') IN ('directora','admin'))
  WITH CHECK (auth.uid() = id OR COALESCE(get_my_role(), '') IN ('directora','admin'));

-- classrooms
DROP POLICY IF EXISTS "classrooms_all" ON public.classrooms;
CREATE POLICY "classrooms_all" ON public.classrooms FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra','encargada'));

-- students
DROP POLICY IF EXISTS "students_staff_all" ON public.students;
CREATE POLICY "students_staff_all" ON public.students FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra','encargada'));

DROP POLICY IF EXISTS "students_parent_select" ON public.students;
CREATE POLICY "students_parent_select" ON public.students FOR SELECT
  USING (parent_id = auth.uid());

-- attendance
DROP POLICY IF EXISTS "attendance_staff_all" ON public.attendance;
CREATE POLICY "attendance_staff_all" ON public.attendance FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra','encargada'));

DROP POLICY IF EXISTS "attendance_parent_select" ON public.attendance;
CREATE POLICY "attendance_parent_select" ON public.attendance FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.students s WHERE s.id = attendance.student_id AND s.parent_id = auth.uid()));

-- attendance_requests
DROP POLICY IF EXISTS "attendance_requests_all" ON public.attendance_requests;
CREATE POLICY "attendance_requests_all" ON public.attendance_requests FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra','encargada') OR
         EXISTS (SELECT 1 FROM public.students s WHERE s.id = attendance_requests.student_id AND s.parent_id = auth.uid()));

-- periods
DROP POLICY IF EXISTS "periods_all" ON public.periods;
CREATE POLICY "periods_all" ON public.periods FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','encargada'));

-- tasks
DROP POLICY IF EXISTS "tasks_staff_all" ON public.tasks;
CREATE POLICY "tasks_staff_all" ON public.tasks FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra','encargada'));

-- task_evidences
DROP POLICY IF EXISTS "task_evidences_all" ON public.task_evidences;
CREATE POLICY "task_evidences_all" ON public.task_evidences FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra','encargada') OR parent_id = auth.uid());

-- posts
DROP POLICY IF EXISTS "posts_select" ON public.posts;
CREATE POLICY "posts_select" ON public.posts FOR SELECT USING (
  auth.uid() IS NOT NULL AND (
    COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra','encargada') OR
    classroom_id IS NULL OR
    is_teacher_of_classroom(classroom_id) OR
    is_parent_of_classroom(classroom_id)
  )
);

DROP POLICY IF EXISTS "posts_insert" ON public.posts;
CREATE POLICY "posts_insert" ON public.posts FOR INSERT
  WITH CHECK (auth.uid() = teacher_id AND COALESCE(get_my_role(), '') IN ('directora','asistente','maestra','admin','encargada'));

DROP POLICY IF EXISTS "posts_update" ON public.posts;
CREATE POLICY "posts_update" ON public.posts FOR UPDATE
  USING (auth.uid() = teacher_id AND COALESCE(get_my_role(), '') IN ('directora','asistente','maestra','admin','encargada'));

DROP POLICY IF EXISTS "posts_delete" ON public.posts;
CREATE POLICY "posts_delete" ON public.posts FOR DELETE
  USING (auth.uid() = teacher_id AND COALESCE(get_my_role(), '') IN ('directora','asistente','maestra','admin','encargada'));

-- comments
DROP POLICY IF EXISTS "comments_select" ON public.comments;
CREATE POLICY "comments_select" ON public.comments FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.posts p WHERE p.id = comments.post_id AND (
    auth.uid() IS NOT NULL AND (
      COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra','encargada') OR
      p.classroom_id IS NULL OR
      is_teacher_of_classroom(p.classroom_id) OR
      is_parent_of_classroom(p.classroom_id)
    )
  ))
);

DROP POLICY IF EXISTS "comments_insert" ON public.comments;
CREATE POLICY "comments_insert" ON public.comments FOR INSERT
  WITH CHECK (auth.uid() = user_id AND EXISTS (
    SELECT 1 FROM public.posts p WHERE p.id = comments.post_id AND (
      COALESCE(get_my_role(), '') IN ('directora','asistente','maestra','admin','encargada') OR
      p.classroom_id IS NULL OR
      is_parent_of_classroom(p.classroom_id)
    )
  ));

-- likes
DROP POLICY IF EXISTS "likes_select" ON public.likes;
CREATE POLICY "likes_select" ON public.likes FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.posts p WHERE p.id = likes.post_id AND (
    auth.uid() IS NOT NULL AND (
      COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra','encargada') OR
      p.classroom_id IS NULL OR
      is_teacher_of_classroom(p.classroom_id) OR
      is_parent_of_classroom(p.classroom_id)
    )
  ))
);

DROP POLICY IF EXISTS "likes_all" ON public.likes;
CREATE POLICY "likes_all" ON public.likes FOR ALL USING (auth.uid() = user_id);

-- conversations
DROP POLICY IF EXISTS "conversations_participant" ON public.conversations;
CREATE POLICY "conversations_participant" ON public.conversations FOR ALL
  USING (user_is_participant(id, auth.uid()));

-- conversation_participants
DROP POLICY IF EXISTS "conversation_participants_all" ON public.conversation_participants;
CREATE POLICY "conversation_participants_all" ON public.conversation_participants FOR ALL
  USING (user_id = auth.uid() OR COALESCE(get_my_role(), '') IN ('directora','admin'));

-- messages
DROP POLICY IF EXISTS "messages_participant" ON public.messages;
CREATE POLICY "messages_participant" ON public.messages FOR ALL
  USING (user_is_participant(conversation_id, auth.uid()));

-- notifications
DROP POLICY IF EXISTS "notifications_own" ON public.notifications;
CREATE POLICY "notifications_own" ON public.notifications FOR ALL USING (user_id = auth.uid());

-- payments
DROP POLICY IF EXISTS "payments_staff_can_see_all" ON public.payments;
CREATE POLICY "payments_staff_can_see_all" ON public.payments FOR SELECT
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','encargada'));

DROP POLICY IF EXISTS "payments_staff_can_insert" ON public.payments;
CREATE POLICY "payments_staff_can_insert" ON public.payments FOR INSERT
  WITH CHECK (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','encargada'));

DROP POLICY IF EXISTS "payments_staff_can_update" ON public.payments;
CREATE POLICY "payments_staff_can_update" ON public.payments FOR UPDATE
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','encargada'))
  WITH CHECK (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','encargada'));

DROP POLICY IF EXISTS "payments_staff_can_delete" ON public.payments;
CREATE POLICY "payments_staff_can_delete" ON public.payments FOR DELETE
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','encargada'));

DROP POLICY IF EXISTS "payments_parent_see_own" ON public.payments;
CREATE POLICY "payments_parent_see_own" ON public.payments FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.students s WHERE s.id = payments.student_id AND s.parent_id = auth.uid() AND s.deleted_at IS NULL));

DROP POLICY IF EXISTS "payments_parent_can_submit" ON public.payments;
CREATE POLICY "payments_parent_can_submit" ON public.payments FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.students s WHERE s.id = payments.student_id AND s.parent_id = auth.uid() AND s.deleted_at IS NULL));

DROP POLICY IF EXISTS "payments_parent_can_update_own" ON public.payments;
CREATE POLICY "payments_parent_can_update_own" ON public.payments FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.students s WHERE s.id = payments.student_id AND s.parent_id = auth.uid() AND s.deleted_at IS NULL))
  WITH CHECK (EXISTS (SELECT 1 FROM public.students s WHERE s.id = payments.student_id AND s.parent_id = auth.uid() AND s.deleted_at IS NULL));

-- payment_audit_log
DROP POLICY IF EXISTS "audit_log_staff" ON public.payment_audit_log;
CREATE POLICY "audit_log_staff" ON public.payment_audit_log FOR SELECT
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','encargada'));

-- incidents
DROP POLICY IF EXISTS "incidents_staff_all" ON public.incidents;
CREATE POLICY "incidents_staff_all" ON public.incidents FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra','encargada'));

DROP POLICY IF EXISTS "incidents_parent_select" ON public.incidents;
CREATE POLICY "incidents_parent_select" ON public.incidents FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.students s WHERE s.id = incidents.student_id AND s.parent_id = auth.uid()));

-- daily_logs
DROP POLICY IF EXISTS "daily_logs_staff_all" ON public.daily_logs;
CREATE POLICY "daily_logs_staff_all" ON public.daily_logs FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra','encargada'));

DROP POLICY IF EXISTS "daily_logs_parent_select" ON public.daily_logs;
CREATE POLICY "daily_logs_parent_select" ON public.daily_logs FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.students s WHERE s.id = daily_logs.student_id AND s.parent_id = auth.uid()));

-- classroom_gallery
DROP POLICY IF EXISTS "classroom_gallery_all" ON public.classroom_gallery;
CREATE POLICY "classroom_gallery_all" ON public.classroom_gallery FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra','encargada') OR is_parent_of_classroom(classroom_id));

-- classroom_chat
DROP POLICY IF EXISTS "classroom_chat_all" ON public.classroom_chat;
CREATE POLICY "classroom_chat_all" ON public.classroom_chat FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra','encargada') OR is_parent_of_classroom(classroom_id));

-- grades
DROP POLICY IF EXISTS "grades_staff" ON public.grades;
CREATE POLICY "grades_staff" ON public.grades FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','maestra','admin','encargada'))
  WITH CHECK (
    COALESCE(get_my_role(), '') IN ('directora','asistente','maestra','admin','encargada') AND (
      period_id IS NULL OR is_period_open(period_id) OR COALESCE(get_my_role(), '') IN ('directora','admin')
    )
  );

-- report_cards
DROP POLICY IF EXISTS "report_cards_staff" ON public.report_cards;
CREATE POLICY "report_cards_staff" ON public.report_cards FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','encargada'));

DROP POLICY IF EXISTS "report_cards_parent" ON public.report_cards;
CREATE POLICY "report_cards_parent" ON public.report_cards FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.students s WHERE s.id = report_cards.student_id AND s.parent_id = auth.uid()));

-- inquiries
DROP POLICY IF EXISTS "inquiries_staff_all" ON public.inquiries;
CREATE POLICY "inquiries_staff_all" ON public.inquiries FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','encargada'));

DROP POLICY IF EXISTS "inquiries_parent_own" ON public.inquiries;
CREATE POLICY "inquiries_parent_own" ON public.inquiries FOR ALL USING (parent_id = auth.uid());

-- school_settings
DROP POLICY IF EXISTS "school_settings_all" ON public.school_settings;
CREATE POLICY "school_settings_all" ON public.school_settings FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','admin'))
  WITH CHECK (COALESCE(get_my_role(), '') IN ('directora','admin'));

-- system_events
DROP POLICY IF EXISTS "system_events_staff" ON public.system_events;
CREATE POLICY "system_events_staff" ON public.system_events FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','admin'));

-- system_errors
DROP POLICY IF EXISTS "system_errors_select_staff" ON public.system_errors;
CREATE POLICY "system_errors_select_staff" ON public.system_errors FOR SELECT
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','encargada'));

DROP POLICY IF EXISTS "system_errors_insert_authenticated" ON public.system_errors;
CREATE POLICY "system_errors_insert_authenticated" ON public.system_errors FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- terms_acceptance
DROP POLICY IF EXISTS "terms_acceptance_own" ON public.terms_acceptance;
CREATE POLICY "terms_acceptance_own" ON public.terms_acceptance FOR ALL USING (user_id = auth.uid());

-- meetings
DROP POLICY IF EXISTS "meetings_all" ON public.meetings;
CREATE POLICY "meetings_all" ON public.meetings FOR ALL USING (auth.uid() IS NOT NULL);

-- audit_logs
DROP POLICY IF EXISTS "audit_logs_staff" ON public.audit_logs;
CREATE POLICY "audit_logs_staff" ON public.audit_logs FOR SELECT
  USING (COALESCE(get_my_role(), '') IN ('directora','admin'));

-- data_snapshots
DROP POLICY IF EXISTS "data_snapshots_staff" ON public.data_snapshots;
CREATE POLICY "data_snapshots_staff" ON public.data_snapshots FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','admin'));

-- login_attempts
DROP POLICY IF EXISTS "login_attempts_staff" ON public.login_attempts;
CREATE POLICY "login_attempts_staff" ON public.login_attempts FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','admin'));

-- door_punches
DROP POLICY IF EXISTS "punches_staff_all" ON public.door_punches;
CREATE POLICY "punches_staff_all" ON public.door_punches FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','maestra','admin','encargada'));

DROP POLICY IF EXISTS "punches_parent_select" ON public.door_punches;
CREATE POLICY "punches_parent_select" ON public.door_punches FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.students s WHERE s.id = door_punches.student_id AND s.parent_id = auth.uid()));

-- staff_permits (con encargada)
DROP POLICY IF EXISTS "staff_permits_all" ON public.staff_permits;
CREATE POLICY "staff_permits_all" ON public.staff_permits FOR ALL
  USING (staff_id = auth.uid() OR COALESCE(get_my_role(), '') IN ('directora','admin','encargada'));

-- parent_ratings (con encargada)
DROP POLICY IF EXISTS "parent_ratings_all" ON public.parent_ratings;
CREATE POLICY "parent_ratings_all" ON public.parent_ratings FOR ALL
  USING (parent_id = auth.uid() OR COALESCE(get_my_role(), '') IN ('directora','admin','encargada'));

-- student_preregistrations
DROP POLICY IF EXISTS "preregistrations_insert_anon" ON public.student_preregistrations;
CREATE POLICY "preregistrations_insert_anon" ON public.student_preregistrations FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "preregistrations_select_auth" ON public.student_preregistrations;
CREATE POLICY "preregistrations_select_auth" ON public.student_preregistrations FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "preregistrations_update_auth" ON public.student_preregistrations;
CREATE POLICY "preregistrations_update_auth" ON public.student_preregistrations FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

-- teacher_schedules
DROP POLICY IF EXISTS "teacher_schedules_staff_all" ON public.teacher_schedules;
CREATE POLICY "teacher_schedules_staff_all" ON public.teacher_schedules FOR ALL
  USING (EXISTS (SELECT 1 FROM public.classrooms c WHERE c.id = teacher_schedules.classroom_id AND c.teacher_id = auth.uid()));

-- schedule_event_logs
DROP POLICY IF EXISTS "schedule_event_logs_staff_all" ON public.schedule_event_logs;
CREATE POLICY "schedule_event_logs_staff_all" ON public.schedule_event_logs FOR ALL
  USING (EXISTS (SELECT 1 FROM public.classrooms c WHERE c.id = schedule_event_logs.classroom_id AND c.teacher_id = auth.uid()));

DROP POLICY IF EXISTS "schedule_event_logs_parent_select" ON public.schedule_event_logs;
CREATE POLICY "schedule_event_logs_parent_select" ON public.schedule_event_logs FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.students s WHERE s.classroom_id = schedule_event_logs.classroom_id AND s.parent_id = auth.uid()));

-- caja_sessions
DROP POLICY IF EXISTS "caja_sessions_director" ON public.caja_sessions;
CREATE POLICY "caja_sessions_director" ON public.caja_sessions FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','admin','encargada'));

-- accounting_journal
DROP POLICY IF EXISTS "accounting_journal_director" ON public.accounting_journal;
CREATE POLICY "accounting_journal_director" ON public.accounting_journal FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','admin','encargada'));

-- payroll_records
DROP POLICY IF EXISTS "payroll_records_director" ON public.payroll_records;
CREATE POLICY "payroll_records_director" ON public.payroll_records FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','admin','encargada'));

-- products
DROP POLICY IF EXISTS "products_staff_all" ON public.products;
CREATE POLICY "products_staff_all" ON public.products FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','encargada'));

DROP POLICY IF EXISTS "products_parent_select" ON public.products;
CREATE POLICY "products_parent_select" ON public.products FOR SELECT
  USING (is_active = true AND deleted_at IS NULL);

-- orders
DROP POLICY IF EXISTS "orders_parent_own" ON public.orders;
CREATE POLICY "orders_parent_own" ON public.orders FOR ALL
  USING (parent_id = auth.uid());

DROP POLICY IF EXISTS "orders_staff_all" ON public.orders;
CREATE POLICY "orders_staff_all" ON public.orders FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','encargada'));

-- order_items
DROP POLICY IF EXISTS "order_items_parent_own" ON public.order_items;
CREATE POLICY "order_items_parent_own" ON public.order_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND o.parent_id = auth.uid()));

DROP POLICY IF EXISTS "order_items_staff_all" ON public.order_items;
CREATE POLICY "order_items_staff_all" ON public.order_items FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','encargada'));

-- inventory_movements
DROP POLICY IF EXISTS "inventory_movements_staff" ON public.inventory_movements;
CREATE POLICY "inventory_movements_staff" ON public.inventory_movements FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','encargada'));

-- invoices
DROP POLICY IF EXISTS "invoices_staff_all" ON public.invoices;
CREATE POLICY "invoices_staff_all" ON public.invoices FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','encargada'));

-- invoice_items
DROP POLICY IF EXISTS "invoice_items_staff_all" ON public.invoice_items;
CREATE POLICY "invoice_items_staff_all" ON public.invoice_items FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','encargada'));

-- payment_concepts
DROP POLICY IF EXISTS "payment_concepts_staff" ON public.payment_concepts;
CREATE POLICY "payment_concepts_staff" ON public.payment_concepts FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','admin','encargada'));

-- ============================================================
-- 10. CONFIGURACION DE STORAGE
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 5242880, allowed_mime_types = ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif'];

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('classroom_media', 'classroom_media', true, 10485760)
ON CONFLICT (id) DO UPDATE SET public = true;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('karpus-uploads', 'karpus-uploads', true, 5242880, ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif','application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 5242880;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('posts', 'posts', true, 10485760, ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif','video/mp4','video/webm'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 10485760;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('invoices', 'invoices', true, 10485760, ARRAY['application/pdf','image/png','image/jpeg'])
ON CONFLICT (id) DO NOTHING;

-- avatars
DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
DROP POLICY IF EXISTS "avatars_auth_insert" ON storage.objects;
CREATE POLICY "avatars_auth_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.role() = 'authenticated');
DROP POLICY IF EXISTS "avatars_auth_update" ON storage.objects;
CREATE POLICY "avatars_auth_update" ON storage.objects FOR UPDATE USING (bucket_id = 'avatars' AND auth.role() = 'authenticated');
DROP POLICY IF EXISTS "avatars_auth_delete" ON storage.objects;
CREATE POLICY "avatars_auth_delete" ON storage.objects FOR DELETE USING (bucket_id = 'avatars' AND auth.role() = 'authenticated');

-- classroom_media
DROP POLICY IF EXISTS "classroom_media_public_read" ON storage.objects;
CREATE POLICY "classroom_media_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'classroom_media');
DROP POLICY IF EXISTS "classroom_media_auth_insert" ON storage.objects;
CREATE POLICY "classroom_media_auth_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'classroom_media' AND auth.role() = 'authenticated');
DROP POLICY IF EXISTS "classroom_media_auth_update" ON storage.objects;
CREATE POLICY "classroom_media_auth_update" ON storage.objects FOR UPDATE USING (bucket_id = 'classroom_media' AND auth.role() = 'authenticated');

-- karpus-uploads
DROP POLICY IF EXISTS "karpus_uploads_public_read" ON storage.objects;
CREATE POLICY "karpus_uploads_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'karpus-uploads');
DROP POLICY IF EXISTS "karpus_uploads_auth_insert" ON storage.objects;
CREATE POLICY "karpus_uploads_auth_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'karpus-uploads' AND auth.role() = 'authenticated');
DROP POLICY IF EXISTS "karpus_uploads_auth_update" ON storage.objects;
CREATE POLICY "karpus_uploads_auth_update" ON storage.objects FOR UPDATE USING (bucket_id = 'karpus-uploads' AND auth.role() = 'authenticated');
DROP POLICY IF EXISTS "karpus_uploads_auth_delete" ON storage.objects;
CREATE POLICY "karpus_uploads_auth_delete" ON storage.objects FOR DELETE USING (bucket_id = 'karpus-uploads' AND auth.role() = 'authenticated');

-- posts
DROP POLICY IF EXISTS "posts_public_read" ON storage.objects;
CREATE POLICY "posts_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'posts');
DROP POLICY IF EXISTS "posts_auth_insert" ON storage.objects;
CREATE POLICY "posts_auth_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'posts' AND auth.role() = 'authenticated');
DROP POLICY IF EXISTS "posts_auth_update" ON storage.objects;
CREATE POLICY "posts_auth_update" ON storage.objects FOR UPDATE USING (bucket_id = 'posts' AND auth.role() = 'authenticated');
DROP POLICY IF EXISTS "posts_auth_delete" ON storage.objects;
CREATE POLICY "posts_auth_delete" ON storage.objects FOR DELETE USING (bucket_id = 'posts' AND auth.role() = 'authenticated');

-- invoices
DROP POLICY IF EXISTS "invoices_public_read" ON storage.objects;
CREATE POLICY "invoices_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'invoices');
DROP POLICY IF EXISTS "invoices_auth_insert" ON storage.objects;
CREATE POLICY "invoices_auth_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'invoices' AND auth.role() = 'authenticated');
DROP POLICY IF EXISTS "invoices_auth_update" ON storage.objects;
CREATE POLICY "invoices_auth_update" ON storage.objects FOR UPDATE USING (bucket_id = 'invoices' AND auth.role() = 'authenticated');

-- ============================================================
-- 11. CONFIGURACION INICIAL
-- ============================================================

-- Perfil admin
INSERT INTO public.profiles (id, email, name, role, accepted_terms, created_at)
VALUES ('5b6e8359-1a65-4d26-aba4-ca48b6b66409', 'impulsodigital@gmail.com', 'Administrador', 'admin', true, now())
ON CONFLICT (id) DO UPDATE SET role = 'admin', email = 'impulsodigital@gmail.com', accepted_terms = true;

-- Perfil directora
INSERT INTO public.profiles (id, email, name, role, accepted_terms, created_at)
VALUES ('3ce39f30-0447-4b3a-a639-20e9a34e5fb8', 'directora@sonrisacreativas.com', 'Directora', 'directora', true, now())
ON CONFLICT (id) DO UPDATE SET role = 'directora', email = 'directora@sonrisacreativas.com', accepted_terms = true;

-- ============================================================
-- 12. DATOS INICIALES - Ano Escolar 2026-2027
-- ============================================================

INSERT INTO public.school_years(name, start_date, end_date, status, is_current)
VALUES ('2026-2027', '2026-08-01', '2027-06-30', 'active', true)
ON CONFLICT (name) DO UPDATE SET is_current = true, status = 'active';

DO $$
DECLARE
  v_sy_id bigint; v_plan_id bigint;
BEGIN
  SELECT id INTO v_sy_id FROM public.school_years WHERE name = '2026-2027';
  IF v_sy_id IS NULL THEN RETURN; END IF;

  -- INICIAL 8:00-12:00
  INSERT INTO public.payment_plans(school_year_id,level,schedule,name,registration_fee,description) VALUES(v_sy_id,'Inicial','8:00-12:00','Plan A (Anual)',118188.00,'Pago anual') ON CONFLICT DO NOTHING;
  SELECT id INTO v_plan_id FROM public.payment_plans WHERE school_year_id=v_sy_id AND level='Inicial' AND schedule='8:00-12:00' AND name LIKE 'Plan A%';
  INSERT INTO public.plan_installments(payment_plan_id,type,month_number,month_name,amount,due_day,due_month_offset,is_registration) VALUES(v_plan_id,'inscripcion',1,'Agosto',118188.00,5,0,true) ON CONFLICT DO NOTHING;

  INSERT INTO public.payment_plans(school_year_id,level,schedule,name,registration_fee,description) VALUES(v_sy_id,'Inicial','8:00-12:00','Plan B (Semestral)',0,'Dos pagos') ON CONFLICT DO NOTHING;
  SELECT id INTO v_plan_id FROM public.payment_plans WHERE school_year_id=v_sy_id AND level='Inicial' AND schedule='8:00-12:00' AND name LIKE 'Plan B%';
  INSERT INTO public.plan_installments(payment_plan_id,type,month_number,month_name,amount,due_day,due_month_offset,is_registration) VALUES(v_plan_id,'inscripcion',1,'Agosto',60016.95,5,0,true),(v_plan_id,'colegiatura',2,'Enero',60016.95,5,5,false) ON CONFLICT DO NOTHING;

  INSERT INTO public.payment_plans(school_year_id,level,schedule,name,registration_fee,description) VALUES(v_sy_id,'Inicial','8:00-12:00','Plan C (Mensual)',24622.50,'11 cuotas') ON CONFLICT DO NOTHING;
  SELECT id INTO v_plan_id FROM public.payment_plans WHERE school_year_id=v_sy_id AND level='Inicial' AND schedule='8:00-12:00' AND name LIKE 'Plan C%';
  INSERT INTO public.plan_installments(payment_plan_id,type,month_number,month_name,amount,due_day,due_month_offset,is_registration) VALUES
    (v_plan_id,'inscripcion',1,'Agosto',24622.50,5,0,true),
    (v_plan_id,'colegiatura',2,'Septiembre',9850.00,5,1,false),(v_plan_id,'colegiatura',3,'Octubre',9850.00,5,2,false),
    (v_plan_id,'colegiatura',4,'Noviembre',9850.00,5,3,false),(v_plan_id,'colegiatura',5,'Diciembre',9850.00,5,4,false),
    (v_plan_id,'colegiatura',6,'Enero',9850.00,5,5,false),(v_plan_id,'colegiatura',7,'Febrero',9850.00,5,6,false),
    (v_plan_id,'colegiatura',8,'Marzo',9850.00,5,7,false),(v_plan_id,'colegiatura',9,'Abril',9850.00,5,8,false),
    (v_plan_id,'colegiatura',10,'Mayo',9850.00,5,9,false),(v_plan_id,'colegiatura',11,'Junio',9850.00,5,10,false)
  ON CONFLICT DO NOTHING;

  -- INICIAL 8:00-15:00
  INSERT INTO public.payment_plans(school_year_id,level,schedule,name,registration_fee,description) VALUES(v_sy_id,'Inicial','8:00-15:00','Plan A (Anual)',139356.00,'Pago anual') ON CONFLICT DO NOTHING;
  SELECT id INTO v_plan_id FROM public.payment_plans WHERE school_year_id=v_sy_id AND level='Inicial' AND schedule='8:00-15:00' AND name LIKE 'Plan A%';
  INSERT INTO public.plan_installments(payment_plan_id,type,month_number,month_name,amount,due_day,due_month_offset,is_registration) VALUES(v_plan_id,'inscripcion',1,'Agosto',139356.00,5,0,true) ON CONFLICT DO NOTHING;

  INSERT INTO public.payment_plans(school_year_id,level,schedule,name,registration_fee,description) VALUES(v_sy_id,'Inicial','8:00-15:00','Plan B (Semestral)',0,'Dos pagos') ON CONFLICT DO NOTHING;
  SELECT id INTO v_plan_id FROM public.payment_plans WHERE school_year_id=v_sy_id AND level='Inicial' AND schedule='8:00-15:00' AND name LIKE 'Plan B%';
  INSERT INTO public.plan_installments(payment_plan_id,type,month_number,month_name,amount,due_day,due_month_offset,is_registration) VALUES(v_plan_id,'inscripcion',1,'Agosto',70766.85,5,0,true),(v_plan_id,'colegiatura',2,'Enero',70766.85,5,5,false) ON CONFLICT DO NOTHING;

  INSERT INTO public.payment_plans(school_year_id,level,schedule,name,registration_fee,description) VALUES(v_sy_id,'Inicial','8:00-15:00','Plan C (Mensual)',29032.50,'11 cuotas') ON CONFLICT DO NOTHING;
  SELECT id INTO v_plan_id FROM public.payment_plans WHERE school_year_id=v_sy_id AND level='Inicial' AND schedule='8:00-15:00' AND name LIKE 'Plan C%';
  INSERT INTO public.plan_installments(payment_plan_id,type,month_number,month_name,amount,due_day,due_month_offset,is_registration) VALUES
    (v_plan_id,'inscripcion',1,'Agosto',29032.50,5,0,true),
    (v_plan_id,'colegiatura',2,'Septiembre',11613.00,5,1,false),(v_plan_id,'colegiatura',3,'Octubre',11613.00,5,2,false),
    (v_plan_id,'colegiatura',4,'Noviembre',11613.00,5,3,false),(v_plan_id,'colegiatura',5,'Diciembre',11613.00,5,4,false),
    (v_plan_id,'colegiatura',6,'Enero',11613.00,5,5,false),(v_plan_id,'colegiatura',7,'Febrero',11613.00,5,6,false),
    (v_plan_id,'colegiatura',8,'Marzo',11613.00,5,7,false),(v_plan_id,'colegiatura',9,'Abril',11613.00,5,8,false),
    (v_plan_id,'colegiatura',10,'Mayo',11613.00,5,9,false),(v_plan_id,'colegiatura',11,'Junio',11613.00,5,10,false)
  ON CONFLICT DO NOTHING;

  -- INICIAL 8:00-17:00
  INSERT INTO public.payment_plans(school_year_id,level,schedule,name,registration_fee,description) VALUES(v_sy_id,'Inicial','8:00-17:00','Plan A (Anual)',169585.50,'Pago anual') ON CONFLICT DO NOTHING;
  SELECT id INTO v_plan_id FROM public.payment_plans WHERE school_year_id=v_sy_id AND level='Inicial' AND schedule='8:00-17:00' AND name LIKE 'Plan A%';
  INSERT INTO public.plan_installments(payment_plan_id,type,month_number,month_name,amount,due_day,due_month_offset,is_registration) VALUES(v_plan_id,'inscripcion',1,'Agosto',169585.50,5,0,true) ON CONFLICT DO NOTHING;

  INSERT INTO public.payment_plans(school_year_id,level,schedule,name,registration_fee,description) VALUES(v_sy_id,'Inicial','8:00-17:00','Plan B (Semestral)',0,'Dos pagos') ON CONFLICT DO NOTHING;
  SELECT id INTO v_plan_id FROM public.payment_plans WHERE school_year_id=v_sy_id AND level='Inicial' AND schedule='8:00-17:00' AND name LIKE 'Plan B%';
  INSERT INTO public.plan_installments(payment_plan_id,type,month_number,month_name,amount,due_day,due_month_offset,is_registration) VALUES(v_plan_id,'inscripcion',1,'Agosto',86117.85,5,0,true),(v_plan_id,'colegiatura',2,'Enero',86117.85,5,5,false) ON CONFLICT DO NOTHING;

  INSERT INTO public.payment_plans(school_year_id,level,schedule,name,registration_fee,description) VALUES(v_sy_id,'Inicial','8:00-17:00','Plan C (Mensual)',26497.80,'11 cuotas') ON CONFLICT DO NOTHING;
  SELECT id INTO v_plan_id FROM public.payment_plans WHERE school_year_id=v_sy_id AND level='Inicial' AND schedule='8:00-17:00' AND name LIKE 'Plan C%';
  INSERT INTO public.plan_installments(payment_plan_id,type,month_number,month_name,amount,due_day,due_month_offset,is_registration) VALUES
    (v_plan_id,'inscripcion',1,'Agosto',26497.80,5,0,true),
    (v_plan_id,'colegiatura',2,'Septiembre',15015.00,5,1,false),(v_plan_id,'colegiatura',3,'Octubre',15015.00,5,2,false),
    (v_plan_id,'colegiatura',4,'Noviembre',15015.00,5,3,false),(v_plan_id,'colegiatura',5,'Diciembre',15015.00,5,4,false),
    (v_plan_id,'colegiatura',6,'Enero',15015.00,5,5,false),(v_plan_id,'colegiatura',7,'Febrero',15015.00,5,6,false),
    (v_plan_id,'colegiatura',8,'Marzo',15015.00,5,7,false),(v_plan_id,'colegiatura',9,'Abril',15015.00,5,8,false),
    (v_plan_id,'colegiatura',10,'Mayo',15015.00,5,9,false),(v_plan_id,'colegiatura',11,'Junio',15015.00,5,10,false)
  ON CONFLICT DO NOTHING;

  -- PRIMARIA 8:00-13:30
  INSERT INTO public.payment_plans(school_year_id,level,schedule,name,registration_fee,description) VALUES(v_sy_id,'Primaria','8:00-13:30','Plan A (Anual)',132294.75,'Pago anual') ON CONFLICT DO NOTHING;
  SELECT id INTO v_plan_id FROM public.payment_plans WHERE school_year_id=v_sy_id AND level='Primaria' AND schedule='8:00-13:30' AND name LIKE 'Plan A%';
  INSERT INTO public.plan_installments(payment_plan_id,type,month_number,month_name,amount,due_day,due_month_offset,is_registration) VALUES(v_plan_id,'inscripcion',1,'Agosto',132294.75,5,0,true) ON CONFLICT DO NOTHING;

  INSERT INTO public.payment_plans(school_year_id,level,schedule,name,registration_fee,description) VALUES(v_sy_id,'Primaria','8:00-13:30','Plan B (Semestral)',0,'Dos pagos') ON CONFLICT DO NOTHING;
  SELECT id INTO v_plan_id FROM public.payment_plans WHERE school_year_id=v_sy_id AND level='Primaria' AND schedule='8:00-13:30' AND name LIKE 'Plan B%';
  INSERT INTO public.plan_installments(payment_plan_id,type,month_number,month_name,amount,due_day,due_month_offset,is_registration) VALUES(v_plan_id,'inscripcion',1,'Agosto',67181.10,5,0,true),(v_plan_id,'colegiatura',2,'Enero',67181.10,5,5,false) ON CONFLICT DO NOTHING;

  INSERT INTO public.payment_plans(school_year_id,level,schedule,name,registration_fee,description) VALUES(v_sy_id,'Primaria','8:00-13:30','Plan C (Mensual)',27561.45,'11 cuotas') ON CONFLICT DO NOTHING;
  SELECT id INTO v_plan_id FROM public.payment_plans WHERE school_year_id=v_sy_id AND level='Primaria' AND schedule='8:00-13:30' AND name LIKE 'Plan C%';
  INSERT INTO public.plan_installments(payment_plan_id,type,month_number,month_name,amount,due_day,due_month_offset,is_registration) VALUES
    (v_plan_id,'inscripcion',1,'Agosto',27561.45,5,0,true),
    (v_plan_id,'colegiatura',2,'Septiembre',11025.00,5,1,false),(v_plan_id,'colegiatura',3,'Octubre',11025.00,5,2,false),
    (v_plan_id,'colegiatura',4,'Noviembre',11025.00,5,3,false),(v_plan_id,'colegiatura',5,'Diciembre',11025.00,5,4,false),
    (v_plan_id,'colegiatura',6,'Enero',11025.00,5,5,false),(v_plan_id,'colegiatura',7,'Febrero',11025.00,5,6,false),
    (v_plan_id,'colegiatura',8,'Marzo',11025.00,5,7,false),(v_plan_id,'colegiatura',9,'Abril',11025.00,5,8,false),
    (v_plan_id,'colegiatura',10,'Mayo',11025.00,5,9,false),(v_plan_id,'colegiatura',11,'Junio',11025.00,5,10,false)
  ON CONFLICT DO NOTHING;

  -- PRIMARIA 8:00-15:00
  INSERT INTO public.payment_plans(school_year_id,level,schedule,name,registration_fee,description) VALUES(v_sy_id,'Primaria','8:00-15:00','Plan A (Anual)',139356.00,'Pago anual') ON CONFLICT DO NOTHING;
  SELECT id INTO v_plan_id FROM public.payment_plans WHERE school_year_id=v_sy_id AND level='Primaria' AND schedule='8:00-15:00' AND name LIKE 'Plan A%';
  INSERT INTO public.plan_installments(payment_plan_id,type,month_number,month_name,amount,due_day,due_month_offset,is_registration) VALUES(v_plan_id,'inscripcion',1,'Agosto',139356.00,5,0,true) ON CONFLICT DO NOTHING;

  INSERT INTO public.payment_plans(school_year_id,level,schedule,name,registration_fee,description) VALUES(v_sy_id,'Primaria','8:00-15:00','Plan B (Semestral)',0,'Dos pagos') ON CONFLICT DO NOTHING;
  SELECT id INTO v_plan_id FROM public.payment_plans WHERE school_year_id=v_sy_id AND level='Primaria' AND schedule='8:00-15:00' AND name LIKE 'Plan B%';
  INSERT INTO public.plan_installments(payment_plan_id,type,month_number,month_name,amount,due_day,due_month_offset,is_registration) VALUES(v_plan_id,'inscripcion',1,'Agosto',71566.85,5,0,true),(v_plan_id,'colegiatura',2,'Enero',70766.85,5,5,false) ON CONFLICT DO NOTHING;

  INSERT INTO public.payment_plans(school_year_id,level,schedule,name,registration_fee,description) VALUES(v_sy_id,'Primaria','8:00-15:00','Plan C (Mensual)',30000.00,'11 cuotas') ON CONFLICT DO NOTHING;
  SELECT id INTO v_plan_id FROM public.payment_plans WHERE school_year_id=v_sy_id AND level='Primaria' AND schedule='8:00-15:00' AND name LIKE 'Plan C%';
  INSERT INTO public.plan_installments(payment_plan_id,type,month_number,month_name,amount,due_day,due_month_offset,is_registration) VALUES
    (v_plan_id,'inscripcion',1,'Agosto',30000.00,5,0,true),
    (v_plan_id,'colegiatura',2,'Septiembre',11825.00,5,1,false),(v_plan_id,'colegiatura',3,'Octubre',11825.00,5,2,false),
    (v_plan_id,'colegiatura',4,'Noviembre',11613.00,5,3,false),(v_plan_id,'colegiatura',5,'Diciembre',11825.00,5,4,false),
    (v_plan_id,'colegiatura',6,'Enero',11825.00,5,5,false),(v_plan_id,'colegiatura',7,'Febrero',11825.00,5,6,false),
    (v_plan_id,'colegiatura',8,'Marzo',11825.00,5,7,false),(v_plan_id,'colegiatura',9,'Abril',11825.00,5,8,false),
    (v_plan_id,'colegiatura',10,'Mayo',11825.00,5,9,false),(v_plan_id,'colegiatura',11,'Junio',11825.00,5,10,false)
  ON CONFLICT DO NOTHING;

END $$;

-- Conceptos de pago iniciales
INSERT INTO public.payment_concepts (name, description, amount) VALUES
  ('Inscripcion', 'Pago de inscripcion', 500.00),
  ('Uniforme', 'Uniforme escolar completo', 300.00),
  ('Libros', 'Material didactico y libros', 250.00),
  ('Materiales', 'Materiales escolares', 150.00),
  ('Actividades Extra', 'Actividades extra curriculares', 100.00)
ON CONFLICT DO NOTHING;

-- ============================================================
-- FIN DEL SCHEMA CONSOLIDADO v4.0
-- ============================================================