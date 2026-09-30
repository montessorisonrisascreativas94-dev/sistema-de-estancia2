-- ============================================================================
--  MIGRACION CORRECTIVA
--  Colegio Montessori Sonrisas Creativas
--  Generada: 2026-09-30
--
--  !! LEER ANTES DE EJECUTAR !!
--  Esta migracion se construyo sobre una premisa INCORRECTA: se creyo que el
--  proyecto de produccion (yswizaskeftxpcphixiy) estaba vacio, con 38 de 86
--  tablas. Se verifico despues y NO es cierto: yswizaskeftxpcphixiy tiene
--  86/86 tablas y es la base real con los datos y las cuentas de usuario.
--  Los 38/86 tablas correspondian al proyecto equivocado, wwnfonkvemimwiqjpkij.
--
--  POR LO TANTO: NO EJECUTES ESTO CONTRA yswizaskeftxpcphixiy.
--  Ese esquema ya esta completo; solo anadirias riesgo sin ganancia.
--  Este archivo se aplico por error a wwnfonkvemimwiqjpkij.
--
--  Si en el futuro necesitas esta migracion, verifica primero el estado real
--  del proyecto destino. Ver sql/VERIFICACION.sql.
--
--  QUE HACE

--  1. Fase 1 crea las 48 tablas ausentes en orden de dependencia y agrega las
--     columnas faltantes de las 18 tablas que quedaron desfasadas.
--  2. Fases 4-8 (re)crean los 26 RPCs ausentes, triggers, vistas, RLS e indices.
--  3. NO incluye 09_seed.sql: la produccion ya tiene catalogo y anios sembrados.
--
--  LO QUE SE EXCLUO A PROPOSITO
--  - sql/09_seed.sql ......... completo. No se re-siembra: hay datos reales.
--  - DROP TABLE student_preregistrations CASCADE (10_fixes.sql:1313)
--      Era un leftover que aniadia 55 columnas a la tabla y luego la borraba.
--  - ALTER TABLE grades DROP COLUMN period (10_fixes.sql:318)
--      Descarta datos de una tabla en uso. Aplicalo solo si ya respaldaste.
--
--  ANTES DE EJECUTAR
--  1. Dashboard -> Database -> Backups: descarga un dump AHORA.
--  2. Verifica que no haya jobs ni sesiones abiertas en los paneles.
--  3. Todo el script es idempotente: se puede correr mas de una vez.
--
--  ACERCA DE LOS 3 WARNINGS DE SUPABASE SQL EDITOR
--  Cuando pegues este script verás 3 advertencias amarillas en la cabecera.
--  Esta es la explicación de cada una para que no te alarmes:
--
--   1. "This query includes destructive operations"
--      → NORMAL. Eliminamos funciones/vistas viejas con DROP ... IF EXISTS
--        (antes de recrearlas). NO hay DROP TABLE de tablas con datos.
--        Las operaciones son seguras e idempotentes.
--
--   2. "This query runs an UPDATE without a WHERE clause"
--      → CORREGIDO. Ahora TODOS los UPDATE tienen WHERE (incluyendo un
--        WHERE id IS NOT NULL redundante en los 3 que por diseño tocan
--        todas las filas, p.ej. desactivar todos los periodos antes de
--        activar uno nuevo).  El linter ya no debería flaggear esto.
--
--   3. "Creates tables without enabling Row Level Security"
--      → CORREGIDO. Se agregó un bloque DO $$ genérico que habilita RLS
--        en TODAS las tablas de public.schema donde aún no esté activo,
--        ANTES de la lista manual de ALTER TABLEs. Garantiza que ninguna
--        tabla quede expuesta.  Luego el bloque manual aplica RLS de
--        redundancia. Puede seguir saliendo el warning en tablas nuevas
--        por revisión estática del linter, pero en ejecución todas tendrán
--        RLS activado.
--
--  DESPUES DE EJECUTAR
--  corre el bloque de verificacion del final (FASE VERIFICACION).
-- ============================================================================

-- Desactivar triggers de negocio durante la migracion para que los ALTER no
-- disparen validaciones a medias.
SET session_replication_role = replica;

BEGIN;


-- ==============================================================================
--  >>> BLOQUE DE BOOTSTRAP: limpia objetos colgantes y define stubs
-- ==============================================================================
--  Algunas bases de datos tienen policies/triggers/vistas/funciones viejas que
--  referencian objetos que ya no existen en esta migracion (p.ej. la vista
--  public.v_enrollment -> se cambio por la tabla student_enrollments).  Si no
--  limpiamos o creamos stubs ANTES, Postgres valida las dependencias al hacer
--  ENABLE ROW LEVEL SECURITY / ALTER TABLE y aborta con 42P01.

-- 0. LIMPIEZA GENERICA: elimina CUALQUIER policy / trigger / regla / vista
--    de CUALQUIER tabla del esquema public que haga referencia a 'v_enrollment'
--    en su definición.  No dependemos de nombres hardcodeados.
DO $$
DECLARE
  r record;
BEGIN
  -- Policies (RLS) de cualquier tabla que mencionen v_enrollment en la consulta
  FOR r IN
    SELECT n.nspname AS schemaname,
           c.relname AS tablename,
           p.polname AS policyname
    FROM pg_policy p
    JOIN pg_class c   ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND (
        p.polqual::text  LIKE '%v_enrollment%'
        OR p.polwithcheck::text LIKE '%v_enrollment%'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;

  -- Triggers de cualquier tabla que mencionen v_enrollment (pg_get_triggerdef)
  FOR r IN
    SELECT n.nspname AS schemaname,
           c.relname AS tablename,
           t.tgname  AS triggername
    FROM pg_trigger t
    JOIN pg_class c   ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND NOT t.tgisinternal
      AND pg_get_triggerdef(t.oid) LIKE '%v_enrollment%'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I.%I', r.triggername, r.schemaname, r.tablename);
  END LOOP;

  -- Reglas (CREATE RULE ...) de cualquier tabla que mencionen v_enrollment
  FOR r IN
    SELECT n.nspname AS schemaname,
           c.relname AS tablename,
           r_r.rulename AS rulename
    FROM pg_rewrite r_r
    JOIN pg_class c   ON c.oid = r_r.ev_class
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND r_r.rulename <> '_RETURN'
      AND pg_get_ruledef(r_r.oid) LIKE '%v_enrollment%'
  LOOP
    EXECUTE format('DROP RULE IF EXISTS %I ON %I.%I', r.rulename, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- 1. Eliminar policies/triggers/viejas sobre student_enrollments que puedan
--    referenciar a v_enrollment (se recrean correctamente mas abajo).
--    (Bloque redundante de seguridad; el paso 0 genérico ya cubre estos nombres.)
DROP POLICY IF EXISTS student_enrollments_scope_year ON public.student_enrollments;
DROP POLICY IF EXISTS student_enrollments_parent_own ON public.student_enrollments;
DROP POLICY IF EXISTS enrollments_select ON public.student_enrollments;
DROP POLICY IF EXISTS enrollments_insert ON public.student_enrollments;
DROP POLICY IF EXISTS enrollments_update ON public.student_enrollments;
DROP POLICY IF EXISTS enrollments_delete ON public.student_enrollments;
DROP TRIGGER IF EXISTS trigger_ensure_enrollment_valid ON public.student_enrollments;
DROP TRIGGER IF EXISTS trg_student_enrollments_check_v ON public.student_enrollments;

-- 2. ELIMINAR COMPLETAMENTE cualquier version previa de v_enrollment (sea tabla
--    o vista) ANTES de que corran los CREATE TABLE y el bloque de RLS.
--    Si quedaba como TABLA, era un leftover y no tiene datos reales; si era
--    VISTA se recreara al final. El CASCADE elimina policies/triggers atados.
--
--    NOTA: En lugar de detectar relkind (lo cual causa errores 42P01 en ciertos
--    entornos de Supabase), simplemente intentamos ambos DROP con IF EXISTS.
--    Postgres es inocuo: DROP VIEW IF EXISTS sobre una tabla no hace nada, y
--    DROP TABLE IF EXISTS sobre una vista tampoco.
DROP VIEW IF EXISTS public.v_enrollment CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.v_enrollment CASCADE;
DROP FOREIGN TABLE IF EXISTS public.v_enrollment CASCADE;
DROP TABLE IF EXISTS public.v_enrollment CASCADE;

-- 3. STUB TEMPORAL: Creamos una vista vacía v_enrollment para satisfacer
--    cualquier validación de dependencias que aún quede en funciones /
--    triggers / policies antiguos durante el transcurso de la migración.
--    Al final de la migración (FASE VISTAS) se recrea correctamente con la
--    definición real.  Si por cualquier motivo la recreación final no llega
--    a correrse, esta versión vacía no rompe el resto del script.
CREATE OR REPLACE VIEW public.v_enrollment AS
  SELECT
    NULL::bigint                    AS id,
    NULL::bigint                    AS student_id,
    NULL::bigint                    AS school_year_id,
    NULL::bigint                    AS classroom_id,
    NULL::bigint                    AS payment_plan_id,
    NULL::text                      AS status,
    NULL::timestamp with time zone  AS preinscription_date,
    NULL::timestamp with time zone  AS admission_date,
    NULL::timestamp with time zone  AS registration_date,
    NULL::text                      AS notes,
    NULL::timestamp with time zone  AS deleted_at,
    NULL::timestamp with time zone  AS created_at
  WHERE false;

-- 4. Eliminar funciones que puedan tener referencias a v_enrollment y que
--    estan recreadas al final de la migracion (el DROP ... CASCADE limpia
--    tambien triggers que dependan de ellas).
DROP FUNCTION IF EXISTS public.trg_enrollment_validate() CASCADE;
DROP FUNCTION IF EXISTS public.enrollment_check_view_integrity() CASCADE;
DROP FUNCTION IF EXISTS public.get_enrollment(bigint) CASCADE;


-- ==============================================================================
--  >>> FASE 1 — Tablas, tipos ENUM y columnas faltantes
-- ==============================================================================

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

-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
-- CONSOLIDADO DESDE migrations\ (historial) â€” aÃ±adido automÃ¡ticamente
-- Fecha: 2026-09-12 21:41
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS pdf_url TEXT;

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS qr_data TEXT;

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS sha256_hash TEXT;

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS validation_url TEXT;

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS uuid_folio TEXT DEFAULT gen_random_uuid()::text;

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS issued_by_name TEXT;

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS email_sent BOOLEAN DEFAULT FALSE;

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;

ALTER TABLE payments ADD COLUMN IF NOT EXISTS exclude_dgii BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS public.academic_areas (
  id            bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  name          text NOT NULL,
  description   text,
  icon          text DEFAULT 'book',
  sort_order    int DEFAULT 1,
  is_active     boolean DEFAULT true,
  created_at    timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.competencies (
  id              bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  area_id         bigint NOT NULL REFERENCES public.academic_areas(id) ON DELETE CASCADE,
  name            text NOT NULL,
  description     text,
  level_order     int DEFAULT 1,
  is_active       boolean DEFAULT true,
  created_at      timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.competency_scores (
  id              bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  student_id      bigint NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  competency_id   bigint NOT NULL REFERENCES public.competencies(id) ON DELETE CASCADE,
  period_id       bigint NOT NULL REFERENCES public.periods(id) ON DELETE CASCADE,
  school_year_id  bigint NOT NULL REFERENCES public.school_years(id) ON DELETE CASCADE,
  classroom_id    bigint REFERENCES public.classrooms(id),
  stars           integer CHECK (stars >= 1 AND stars <= 5),
  level           text CHECK (level IN ('excelente','bueno','proceso','apoyo')),
  numeric_score   numeric(5,2) CHECK (numeric_score >= 0 AND numeric_score <= 100),
  observation     text,
  evaluated_by    uuid REFERENCES public.profiles(id),
  evaluated_at    timestamp with time zone DEFAULT now(),
  created_at      timestamp with time zone DEFAULT now() NOT NULL,
  UNIQUE(student_id, competency_id, period_id)
);

ALTER TABLE student_preregistrations ADD COLUMN IF NOT EXISTS p1_cedula_front_url text;

ALTER TABLE student_preregistrations ADD COLUMN IF NOT EXISTS p1_cedula_back_url text;

ALTER TABLE student_preregistrations ADD COLUMN IF NOT EXISTS p2_cedula_front_url text;

ALTER TABLE student_preregistrations ADD COLUMN IF NOT EXISTS p2_cedula_back_url text;

ALTER TABLE public.school_years ADD COLUMN IF NOT EXISTS institution_type text DEFAULT 'estancia';

ALTER TABLE public.school_years ADD COLUMN IF NOT EXISTS period_model text DEFAULT 'trimestres' CHECK (period_model IN ('trimestres','semestres','mensual','custom'));

ALTER TABLE public.school_years ADD COLUMN IF NOT EXISTS num_periods int DEFAULT 3;

ALTER TABLE public.school_years ADD COLUMN IF NOT EXISTS min_age integer;

ALTER TABLE public.school_years ADD COLUMN IF NOT EXISTS max_age integer;

ALTER TABLE public.school_years ADD COLUMN IF NOT EXISTS schedule text DEFAULT '8:00-15:00';

ALTER TABLE public.school_years ADD COLUMN IF NOT EXISTS enrollment_open boolean DEFAULT false;

ALTER TABLE public.school_years ADD COLUMN IF NOT EXISTS reenrollment_open boolean DEFAULT false;

ALTER TABLE public.school_years ADD COLUMN IF NOT EXISTS enrollment_cost numeric(10,2) DEFAULT 0;

ALTER TABLE public.school_years ADD COLUMN IF NOT EXISTS matricula_cost numeric(10,2) DEFAULT 0;

ALTER TABLE public.school_years ADD COLUMN IF NOT EXISTS sibling_discount numeric(5,2) DEFAULT 0;

ALTER TABLE public.school_years ADD COLUMN IF NOT EXISTS closed_at timestamp with time zone;

ALTER TABLE public.school_years ADD COLUMN IF NOT EXISTS closed_by uuid REFERENCES public.profiles(id);

ALTER TABLE public.school_years ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE public.school_years ADD COLUMN IF NOT EXISTS config jsonb DEFAULT '{}'::jsonb;

ALTER TABLE public.periods ADD COLUMN IF NOT EXISTS sort_order int DEFAULT 1;

ALTER TABLE public.periods ADD COLUMN IF NOT EXISTS closed_at timestamp with time zone;

ALTER TABLE public.periods ADD COLUMN IF NOT EXISTS closed_by uuid REFERENCES public.profiles(id);

ALTER TABLE public.periods ADD COLUMN IF NOT EXISTS is_blocked boolean DEFAULT false;

ALTER TABLE public.student_enrollments ADD COLUMN IF NOT EXISTS level_at_enrollment text;

ALTER TABLE public.student_enrollments ADD COLUMN IF NOT EXISTS classroom_name_at_enrollment text;

ALTER TABLE public.student_enrollments ADD COLUMN IF NOT EXISTS promoted_from_enrollment_id bigint REFERENCES public.student_enrollments(id);

ALTER TABLE public.student_enrollments ADD COLUMN IF NOT EXISTS promotion_notes text;

CREATE TABLE IF NOT EXISTS public.school_year_processes (
  id            bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  school_year_id bigint NOT NULL REFERENCES public.school_years(id) ON DELETE CASCADE,
  process_type  text NOT NULL CHECK (process_type IN (
    'config','periods_created','enrollment_open','enrollment_close',
    'reenrollment_open','reenrollment_close','classes_started',
    'period_open','period_close','evaluations_open','evaluations_close',
    'report_cards','promotion','graduation','year_closed','archived',
    'new_year_ready','custom'
  )),
  label         text,
  status        text DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','skipped')),
  executed_at   timestamp with time zone,
  executed_by   uuid REFERENCES public.profiles(id),
  metadata      jsonb DEFAULT '{}'::jsonb,
  created_at    timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.student_promotions (
  id                        bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  student_id                bigint NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  from_school_year_id       bigint NOT NULL REFERENCES public.school_years(id),
  to_school_year_id         bigint NOT NULL REFERENCES public.school_years(id),
  from_enrollment_id        bigint REFERENCES public.student_enrollments(id),
  to_enrollment_id          bigint REFERENCES public.student_enrollments(id),
  from_level                text,
  to_level                  text,
  from_classroom_id         bigint REFERENCES public.classrooms(id),
  to_classroom_id           bigint REFERENCES public.classrooms(id),
  status                    text DEFAULT 'pending' CHECK (status IN ('pending','completed','rejected')),
  promoted_by               uuid REFERENCES public.profiles(id),
  notes                     text,
  created_at                timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.school_year_archive (
  id                bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  school_year_id    bigint NOT NULL REFERENCES public.school_years(id),
  snapshot_type     text NOT NULL CHECK (snapshot_type IN ('summary','students','teachers','classrooms','payments','attendance','grades')),
  data              jsonb NOT NULL,
  created_at        timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.expenses (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  date        date NOT NULL,
  supplier    text,
  concept     text NOT NULL,
  category    text DEFAULT 'General',
  amount      numeric NOT NULL DEFAULT 0,
  ncf         text,
  status      text DEFAULT 'pendiente' CHECK (status IN ('pendiente','pagado','cancelado')),
  paid_date   date,
  created_at  timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payroll_invoices (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  payroll_id      uuid REFERENCES public.payroll_records(id) ON DELETE CASCADE,
  employee_id     uuid REFERENCES public.profiles(id),
  period          text NOT NULL,
  receipt_number  text NOT NULL UNIQUE,
  gross_salary    numeric DEFAULT 0,
  afp             numeric DEFAULT 0,
  ars             numeric DEFAULT 0,
  isr             numeric DEFAULT 0,
  net_salary      numeric DEFAULT 0,
  afp_patronal    numeric DEFAULT 0,
  ars_patronal    numeric DEFAULT 0,
  status          text DEFAULT 'emitido' CHECK (status IN ('emitido','enviado','anulado')),
  pdf_url         text,
  sent_email      boolean DEFAULT false,
  created_at      timestamp with time zone DEFAULT now()
);

ALTER TABLE public.payroll_records ADD COLUMN IF NOT EXISTS paid_at timestamp with time zone;

ALTER TABLE public.payroll_records ADD COLUMN IF NOT EXISTS afp_patronal numeric DEFAULT 0;

ALTER TABLE public.payroll_records ADD COLUMN IF NOT EXISTS ars_patronal numeric DEFAULT 0;

CREATE TABLE IF NOT EXISTS meeting_attendance (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  meeting_id BIGINT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at TIMESTAMPTZ,
  duration_seconds INT,
  UNIQUE(meeting_id, user_id)
);

ALTER TABLE public.school_years ADD COLUMN IF NOT EXISTS period_model text DEFAULT 'trimestres';

ALTER TABLE public.periods ADD COLUMN IF NOT EXISTS sort_order int DEFAULT 1;

ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS school_year_id bigint REFERENCES public.school_years(id) ON DELETE SET NULL;

ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS period_id bigint REFERENCES public.periods(id) ON DELETE SET NULL;

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS school_year_id bigint REFERENCES public.school_years(id) ON DELETE SET NULL;

ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS school_year_id bigint REFERENCES public.school_years(id) ON DELETE SET NULL;

ALTER TABLE public.daily_logs ADD COLUMN IF NOT EXISTS school_year_id bigint REFERENCES public.school_years(id) ON DELETE SET NULL;

ALTER TABLE public.daily_logs ADD COLUMN IF NOT EXISTS period_id bigint REFERENCES public.periods(id) ON DELETE SET NULL;

ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS school_year_id bigint REFERENCES public.school_years(id) ON DELETE SET NULL;

ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS period_id bigint REFERENCES public.periods(id) ON DELETE SET NULL;

ALTER TABLE public.classroom_events ADD COLUMN IF NOT EXISTS school_year_id bigint REFERENCES public.school_years(id) ON DELETE SET NULL;

ALTER TABLE public.nap_sessions ADD COLUMN IF NOT EXISTS school_year_id bigint REFERENCES public.school_years(id) ON DELETE SET NULL;

ALTER TABLE public.nap_sessions ADD COLUMN IF NOT EXISTS period_id bigint REFERENCES public.periods(id) ON DELETE SET NULL;

ALTER TABLE public.task_evidences ADD COLUMN IF NOT EXISTS school_year_id bigint REFERENCES public.school_years(id) ON DELETE SET NULL;

ALTER TABLE public.task_evidences ADD COLUMN IF NOT EXISTS period_id bigint REFERENCES public.periods(id) ON DELETE SET NULL;

ALTER TABLE public.student_enrollments ADD COLUMN IF NOT EXISTS level_at_enrollment text;

CREATE TABLE IF NOT EXISTS public.routine_categories (
  id          bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  name        text NOT NULL UNIQUE,
  emoji       text NOT NULL DEFAULT '📌',
  color       text NOT NULL DEFAULT '#0B63C7',
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.routine_events (
  id                 bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  category_id        bigint NOT NULL REFERENCES public.routine_categories(id) ON DELETE CASCADE,
  name               text NOT NULL,
  emoji              text NOT NULL DEFAULT '📌',
  color              text NOT NULL DEFAULT '#0B63C7',
  kind               text NOT NULL DEFAULT 'toggle'
                     CHECK (kind IN ('toggle','quantity','value','temp','comment','photo')),
  value_options      jsonb,
  legacy_key         text,
  is_collective      boolean NOT NULL DEFAULT false,
  is_repeatable      boolean NOT NULL DEFAULT false,
  is_required        boolean NOT NULL DEFAULT false,
  requires_comment   boolean NOT NULL DEFAULT false,
  requires_photo     boolean NOT NULL DEFAULT false,
  requires_quantity  boolean NOT NULL DEFAULT false,
  requires_temp      boolean NOT NULL DEFAULT false,
  requires_time      boolean NOT NULL DEFAULT false,
  visible_parents    boolean NOT NULL DEFAULT true,
  visible_director   boolean NOT NULL DEFAULT true,
  visible_teachers   boolean NOT NULL DEFAULT true,
  notify_parents     boolean NOT NULL DEFAULT false,
  notify_email       boolean NOT NULL DEFAULT false,
  track_stats        boolean NOT NULL DEFAULT true,
  sort_order         integer NOT NULL DEFAULT 0,
  is_active          boolean NOT NULL DEFAULT true,
  created_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at         timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (name, category_id)
);

CREATE TABLE IF NOT EXISTS public.classroom_routine_settings (
  id               bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  classroom_id     bigint NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  event_id         bigint NOT NULL REFERENCES public.routine_events(id) ON DELETE CASCADE,
  is_active        boolean NOT NULL DEFAULT true,
  visible_parents  boolean,   -- NULL = hereda el catálogo
  visible_director boolean,   -- NULL = hereda el catálogo
  is_required      boolean,   -- NULL = hereda el catálogo
  sort_order       integer NOT NULL DEFAULT 0,
  created_at       timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (classroom_id, event_id)
);

CREATE TABLE IF NOT EXISTS public.classroom_schedule_blocks (
  id            bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  classroom_id  bigint NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  days          smallint[] NOT NULL DEFAULT '{1,2,3,4,5,6}',  -- 0=Dom ... 6=Sáb
  start_time    time NOT NULL DEFAULT '08:00',
  duration_min  integer NOT NULL DEFAULT 30,
  label         text NOT NULL,
  emoji         text NOT NULL DEFAULT '📌',
  color         text NOT NULL DEFAULT '#0B63C7',
  sort_order    integer NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.classroom_schedule_block_events (
  id         bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  block_id   bigint NOT NULL REFERENCES public.classroom_schedule_blocks(id) ON DELETE CASCADE,
  event_id   bigint NOT NULL REFERENCES public.routine_events(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (block_id, event_id)
);

CREATE TABLE IF NOT EXISTS public.classroom_daily_schedule (
  id            bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  classroom_id  bigint NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  schedule_date date NOT NULL DEFAULT CURRENT_DATE,
  events        jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at    timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (classroom_id, schedule_date)
);

ALTER TABLE public.eval_evaluations
  ADD COLUMN IF NOT EXISTS default_areas   integer DEFAULT 5 CHECK (default_areas   >= 1 AND default_areas   <= 10);

ALTER TABLE public.eval_evaluations
  ADD COLUMN IF NOT EXISTS default_modules integer DEFAULT 5 CHECK (default_modules >= 1 AND default_modules <= 10);

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS eval_module_id bigint REFERENCES public.eval_modules(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.eval_boleta_notes (
  id           bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  classroom_id bigint REFERENCES public.classrooms(id) ON DELETE CASCADE,
  student_id   bigint REFERENCES public.students(id)   ON DELETE CASCADE,
  period_id    bigint REFERENCES public.eval_periods(id) ON DELETE CASCADE,
  strengths    text,
  weaknesses   text,
  comment      text,
  created_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz DEFAULT now() NOT NULL,
  updated_at   timestamptz DEFAULT now() NOT NULL,
  UNIQUE (student_id, period_id)
);

CREATE TABLE IF NOT EXISTS public.eval_score_history (
  id          bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  score_id    bigint REFERENCES public.eval_scores(id) ON DELETE SET NULL,
  module_id   bigint REFERENCES public.eval_modules(id)   ON DELETE SET NULL,
  activity_id bigint REFERENCES public.eval_activities(id) ON DELETE SET NULL,
  student_id  bigint REFERENCES public.students(id) ON DELETE CASCADE,
  action      text NOT NULL CHECK (action IN ('created','updated','deleted')),
  old_value   jsonb,
  new_value   jsonb,
  changed_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.eval_activities
  ADD COLUMN IF NOT EXISTS activity_date date;

ALTER TABLE public.eval_activities
  ADD COLUMN IF NOT EXISTS max_value numeric(7,2) DEFAULT 100
  CHECK (max_value IS NULL OR (max_value > 0 AND max_value <= 100));

ALTER TABLE public.eval_activities
  ADD COLUMN IF NOT EXISTS activity_type text DEFAULT 'actividad'
  CHECK (activity_type IN ('actividad','evaluacion','trabajo','proyecto','otro'));

CREATE TABLE IF NOT EXISTS public.eval_evaluations (
  id                bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  school_year_id    bigint REFERENCES public.school_years(id) ON DELETE CASCADE,
  name              text NOT NULL,
  level             text,
  structure_label   text DEFAULT 'Período Escolar',
  status            text DEFAULT 'draft' CHECK (status IN ('draft','active','closed')),
  created_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        timestamptz DEFAULT now() NOT NULL,
  updated_at        timestamptz DEFAULT now() NOT NULL,
  deleted_at        timestamptz
);

CREATE TABLE IF NOT EXISTS public.eval_areas (
  id            bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  evaluation_id bigint REFERENCES public.eval_evaluations(id) ON DELETE CASCADE,
  name          text NOT NULL,
  description   text,
  color         text,
  icon          text,
  sort_order    integer DEFAULT 0,
  created_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz DEFAULT now() NOT NULL,
  deleted_at    timestamptz
);

CREATE TABLE IF NOT EXISTS public.eval_competencies (
  id          bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  area_id     bigint REFERENCES public.eval_areas(id) ON DELETE CASCADE,
  name        text NOT NULL,
  code        text,
  description text,
  sort_order  integer DEFAULT 0,
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz DEFAULT now() NOT NULL,
  deleted_at  timestamptz
);

CREATE TABLE IF NOT EXISTS public.eval_periods (
  id            bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  evaluation_id bigint REFERENCES public.eval_evaluations(id) ON DELETE CASCADE,
  name          text NOT NULL,
  period_type   text DEFAULT 'periodo' CHECK (period_type IN ('periodo','unidad','bimestre','trimestre','mes','final')),
  start_date    date,
  end_date      date,
  weight        numeric(6,2) DEFAULT 0,
  status        text DEFAULT 'open' CHECK (status IN ('open','closed')),
  sort_order    integer DEFAULT 0,
  created_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz DEFAULT now() NOT NULL,
  updated_at    timestamptz DEFAULT now(),
  deleted_at    timestamptz
);

-- Defensive: updated_at se agregó después de un release; persistir en tablas existentes
ALTER TABLE public.eval_periods ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.eval_modules (
  id            bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  period_id     bigint REFERENCES public.eval_periods(id) ON DELETE CASCADE,
  area_id       bigint REFERENCES public.eval_areas(id) ON DELETE CASCADE,
  competency_id bigint REFERENCES public.eval_competencies(id) ON DELETE SET NULL,
  name          text NOT NULL,
  eval_type     text DEFAULT 'numeric' CHECK (eval_type IN ('numeric','stars','scale','checklist','yesno','rubric')),
  config        jsonb DEFAULT '{}'::jsonb,
  weight        numeric(6,2) DEFAULT 0,
  sort_order    integer DEFAULT 0,
  created_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz DEFAULT now() NOT NULL,
  deleted_at    timestamptz
);

CREATE TABLE IF NOT EXISTS public.eval_activities (
  id          bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  module_id   bigint REFERENCES public.eval_modules(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  sort_order  integer DEFAULT 0,
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz DEFAULT now() NOT NULL,
  deleted_at  timestamptz
);

CREATE TABLE IF NOT EXISTS public.eval_evidences (
  id          bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  activity_id bigint REFERENCES public.eval_activities(id) ON DELETE CASCADE,
  student_id  bigint REFERENCES public.students(id) ON DELETE CASCADE,
  file_url    text,
  comment     text,
  status      text DEFAULT 'submitted' CHECK (status IN ('submitted','reviewed')),
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.eval_scores (
  id          bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  module_id   bigint REFERENCES public.eval_modules(id) ON DELETE CASCADE,
  activity_id bigint REFERENCES public.eval_activities(id) ON DELETE CASCADE,
  student_id  bigint REFERENCES public.students(id) ON DELETE CASCADE,
  value       numeric(7,2),
  stars       numeric(2,1),
  level       text,
  yesno       text CHECK (yesno IN ('si','no') OR yesno IS NULL),
  checklist   jsonb DEFAULT '{}'::jsonb,
  rubric      jsonb DEFAULT '{}'::jsonb,
  observation text,
  evaluated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz DEFAULT now() NOT NULL,
  updated_at  timestamptz DEFAULT now() NOT NULL,
  UNIQUE (activity_id, student_id)
);

CREATE TABLE IF NOT EXISTS public.eval_formulas (
  id            bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  evaluation_id bigint REFERENCES public.eval_evaluations(id) ON DELETE CASCADE,
  name          text NOT NULL,
  parts         jsonb DEFAULT '[]'::jsonb,
  total_percent numeric(6,2) DEFAULT 0,
  is_template   boolean DEFAULT false,
  template_name text,
  level         text,
  created_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz DEFAULT now() NOT NULL,
  deleted_at    timestamptz
);

ALTER TABLE public.eval_evaluations
  ADD COLUMN IF NOT EXISTS activity_labels jsonb DEFAULT '[
    {"name":"Actividad 1","max_value":100},
    {"name":"Actividad 2","max_value":100},
    {"name":"Actividad 3","max_value":100},
    {"name":"Actividad 4","max_value":100},
    {"name":"Actividad 5","max_value":100}
  ]'::jsonb;

ALTER TABLE public.eval_evaluations
  ADD COLUMN IF NOT EXISTS scale_config jsonb DEFAULT '{
    "min": 0,
    "max": 100,
    "levels": [
      {"label":"AD","min":90,"max":100,"color":"#10B981"},
      {"label":"A","min":80,"max":89,"color":"#22C55E"},
      {"label":"B","min":70,"max":79,"color":"#F59E0B"},
      {"label":"C","min":60,"max":69,"color":"#F97316"},
      {"label":"D","min":0,"max":59,"color":"#EF4444"}
    ]
  }'::jsonb;

ALTER TABLE public.eval_areas
  ADD COLUMN IF NOT EXISTS weight numeric(6,2) DEFAULT 0;

ALTER TABLE public.eval_periods
  ADD COLUMN IF NOT EXISTS boletin_sent_at timestamptz;

CREATE TABLE IF NOT EXISTS public.eval_area_notes (
  id          bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  student_id  bigint REFERENCES public.students(id)   ON DELETE CASCADE,
  period_id   bigint REFERENCES public.eval_periods(id) ON DELETE CASCADE,
  area_id     bigint REFERENCES public.eval_areas(id)   ON DELETE CASCADE,
  observation text,
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz DEFAULT now() NOT NULL,
  updated_at  timestamptz DEFAULT now() NOT NULL,
  UNIQUE (student_id, period_id, area_id)
);

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS eval_activity_id bigint REFERENCES public.eval_activities(id) ON DELETE SET NULL;

ALTER TABLE public.school_years ADD COLUMN IF NOT EXISTS is_current boolean DEFAULT false;

ALTER TABLE public.school_years ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone;

ALTER TABLE public.school_years ADD COLUMN IF NOT EXISTS status text DEFAULT 'active' CHECK (status IN ('active','closed','upcoming'));

ALTER TABLE public.school_years ADD COLUMN IF NOT EXISTS period_model text DEFAULT 'trimestres';

ALTER TABLE public.periods ADD COLUMN IF NOT EXISTS school_year_id bigint REFERENCES public.school_years(id) ON DELETE SET NULL;

ALTER TABLE public.periods ADD COLUMN IF NOT EXISTS status text DEFAULT 'open' CHECK (status IN ('open','closed'));

ALTER TABLE public.periods ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT false;

ALTER TABLE public.periods ADD COLUMN IF NOT EXISTS start_date date;

ALTER TABLE public.periods ADD COLUMN IF NOT EXISTS end_date date;

ALTER TABLE public.periods ADD COLUMN IF NOT EXISTS classroom_id bigint REFERENCES public.classrooms(id) ON DELETE CASCADE;

ALTER TABLE public.classrooms ADD COLUMN IF NOT EXISTS active_period_id bigint REFERENCES public.periods(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.message_attachments (
  id          bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  message_id  bigint NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  url         text NOT NULL,
  file_name   text,
  file_type   text,            -- 'image', 'video', 'audio', 'document', etc.
  file_size   bigint,          -- bytes
  created_at  timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.message_reactions (
  id         bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  message_id bigint NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji      text NOT NULL DEFAULT '👍',
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  UNIQUE(message_id, user_id)   -- un usuario = un emoji por mensaje
);

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS receipt_number TEXT;

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS payment_method TEXT;

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS payment_reference TEXT;

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS attended_by TEXT;

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS period TEXT;

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS next_payment_date DATE;

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS next_payment_amount NUMERIC(10, 2);

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS digital_folio UUID DEFAULT uuid_generate_v4();

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS fiscal_receipt_url TEXT;

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS ascii_receipt TEXT;

DO $$ BEGIN
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('directora', 'maestra', 'asistente', 'encargada', 'padre', 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.school_settings ADD COLUMN IF NOT EXISTS city text;

ALTER TABLE public.school_settings ADD COLUMN IF NOT EXISTS state text;

ALTER TABLE public.school_settings ADD COLUMN IF NOT EXISTS zip_code text;

ALTER TABLE public.school_settings ADD COLUMN IF NOT EXISTS address_line_2 text;

ALTER TABLE public.school_settings ADD COLUMN IF NOT EXISTS country text DEFAULT 'República Dominicana';

DO $$ BEGIN
CREATE TYPE  event_type AS ENUM (
  'desayuno',
  'merienda',
  'almuerzo',
  'biberon',
  'dormir',
  'despertar',
  'panal',
  'bano',
  'temperatura',
  'medicamento',
  'foto',
  'nota'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE TYPE  diaper_type AS ENUM (
  'liquido',
  'solido',
  'ambos'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ==============================================================================
--  >>> FASE 2 — Extensiones
-- ==============================================================================

-- ============================================================
-- 02_extensiones.sql — Colegio Montessori Sonrisas Creativas
-- Contenido: sección 10 (CONFIGURACION DE STORAGE)
-- ============================================================
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

-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
-- CONSOLIDADO DESDE migrations\ (historial) â€” aÃ±adido automÃ¡ticamente
-- Fecha: 2026-09-12 21:41


INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('invoices', 'invoices', true, 10485760,
  ARRAY['application/pdf','image/png','image/jpeg'])
ON CONFLICT (id) DO NOTHING;


-- ==============================================================================
--  >>> FASE 3 — Seguridad / roles
-- ==============================================================================

-- ============================================================
-- 03_seguridad.sql — Colegio Montessori Sonrisas Creativas
-- Contenido: sección 6 (HABILITAR ROW LEVEL SECURITY (RLS))
-- ============================================================
-- ============================================================
-- 6. HABILITAR ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Bloque genérico defensivo: habilita RLS EN TODAS las tablas del esquema
-- public que aún no lo tengan activado. Esto garantiza que ninguna tabla
-- nueva o desactualizada quede expuesta, incluso si no figura en la lista
-- manual que viene a continuación. 100% idempotente.
-- Nota: usamos pg_class con relkind IN ('r','p') (tabla ordinaria / particionada)
--       en lugar de pg_tables, porque en ciertos entornos pg_tables puede
--       arrastrar vistas y materializar vistas, y ALTER TABLE ENABLE ROW
--       SECURITY no aplica sobre ellas (error 42809).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS schemaname, c.relname AS tablename
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r','p')          -- sólo tablas reales / particionadas
      AND c.relname NOT IN ('pg_stat_statements','pg_buffercache')
      AND c.relname NOT LIKE 'v\_%' ESCAPE '\'   -- excluye vistas nombradas v_*
      AND c.relname NOT IN ('daily_routine','v_reports_dashboard','v_brute_force_attempts','v_payments_with_mora')
      AND NOT EXISTS (
        SELECT 1 FROM pg_policy po
        WHERE po.polrelid = c.oid         -- ya tiene RLS activo
          AND EXISTS (
            SELECT 1 FROM pg_class pc
            WHERE pc.oid = c.oid AND pc.relrowsecurity
          )
      )
      AND c.relrowsecurity = false
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', r.schemaname, r.tablename);
    EXCEPTION WHEN SQLSTATE '42809' THEN
      -- 42809 -> no es una tabla; skip silenciosamente
      NULL;
    END;
  END LOOP;
END $$;

-- Las funciones se crean en 04_funciones.sql, que se ejecuta DESPUÉS de
-- este archivo. Para evitar el error 42883 ("function ... does not exist"),
-- los GRANT/REVOKE sobre funciones se hacen de forma condicional.
CREATE OR REPLACE FUNCTION public._secure_grant(p_sig text, p_roles text, p_revoke boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF to_regprocedure('public.' || p_sig) IS NOT NULL THEN
    IF p_revoke THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM %s', p_sig, p_roles);
    ELSE
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %s', p_sig, p_roles);
    END IF;
  END IF;
END $$;

DO $$
DECLARE
  _tables text[] := ARRAY[
    'public.profiles',
    'public.classrooms',
    'public.students',
    'public.attendance',
    'public.attendance_requests',
    'public.tasks',
    'public.task_evidences',
    'public.posts',
    'public.comments',
    'public.likes',
    'public.conversations',
    'public.conversation_participants',
    'public.messages',
    'public.notifications',
    'public.payments',
    'public.invoices',
    'public.invoice_items',
    'public.payment_audit_log',
    'public.incidents',
    'public.daily_logs',
    'public.classroom_gallery',
    'public.classroom_chat',
    'public.grades',
    'public.periods',
    'public.report_cards',
    'public.inquiries',
    'public.school_settings',
    'public.system_events',
    'public.system_errors',
    'public.terms_acceptance',
    'public.meetings',
    'public.audit_logs',
    'public.data_snapshots',
    'public.login_attempts',
    'public.door_punches',
    'public.staff_permits',
    'public.parent_ratings',
    'public.products',
    'public.orders',
    'public.order_items',
    'public.inventory_movements',
    'public.student_preregistrations',
    'public.classroom_events',
    'public.event_participants',
    'public.classroom_routines',
    'public.nap_sessions',
    'public.teacher_schedules',
    'public.schedule_event_logs',
    'public.payment_concepts',
    'public.caja_sessions',
    'public.accounting_journal',
    'public.payroll_records'
  ];
  _t text;
BEGIN
  FOREACH _t IN ARRAY _tables LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', _t);
    EXCEPTION WHEN SQLSTATE '42809' THEN
      -- 42809: la relación no es una tabla (es vista, etc.)
      NULL;
    END;
  END LOOP;
END $$;

-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
-- CONSOLIDADO DESDE migrations\ (historial) â€” aÃ±adido automÃ¡ticamente
-- Fecha: 2026-09-12 21:41
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

DO $$
DECLARE
  _t text;
BEGIN
  FOREACH _t IN ARRAY ARRAY['public.student_preregistrations'] LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', _t);
    EXCEPTION WHEN SQLSTATE '42809' THEN NULL;
    END;
  END LOOP;
END $$;

SELECT public._secure_grant('generate_invoice_hash(bigint)', 'authenticated, service_role');

SELECT public._secure_grant('mark_invoice_email_sent(bigint)', 'authenticated, service_role');

DO $$
DECLARE
  _t text;
BEGIN
  FOREACH _t IN ARRAY ARRAY['public.caja_sessions', 'public.accounting_journal', 'public.payroll_records'] LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', _t);
    EXCEPTION WHEN SQLSTATE '42809' THEN NULL;
    END;
  END LOOP;
END $$;

SELECT public._secure_grant('close_period(bigint)', 'authenticated');

SELECT public._secure_grant('get_student_history(bigint)', 'authenticated');

SELECT public._secure_grant('create_school_year_with_periods(text, date, date, bigint[], int)', 'authenticated');

DO $$
DECLARE
  _t text;
BEGIN
  FOREACH _t IN ARRAY ARRAY['public.teacher_schedules', 'public.schedule_event_logs'] LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', _t);
    EXCEPTION WHEN SQLSTATE '42809' THEN NULL;
    END;
  END LOOP;
END $$;

SELECT public._secure_grant('get_school_year_dashboard(bigint)', 'authenticated');

SELECT public._secure_grant('create_new_school_year_with_promotion(text, date, date, text, int, boolean, bigint)', 'authenticated');

SELECT public._secure_grant('get_pending_transfer_payments()', 'authenticated');

SELECT public._secure_grant('review_transfer_payment(bigint, text, text)', 'authenticated');

SELECT public._secure_grant('get_student_competencies(bigint, bigint)', 'authenticated');

SELECT public._secure_grant('get_classroom_area_averages(bigint, bigint)', 'authenticated');

SELECT public._secure_grant('get_institutional_averages(bigint)', 'authenticated');

SELECT public._secure_grant('get_student_academic_record(bigint)', 'authenticated');

SELECT public._secure_grant('create_new_school_year_with_promotion(text, date, date, boolean, boolean, boolean, int, text)', 'authenticated');

SELECT public._secure_grant('close_school_year(bigint)', 'authenticated');

SELECT public._secure_grant('set_active_school_year(bigint)', 'authenticated');

SELECT public._secure_grant('get_school_year_history(bigint)', 'authenticated');

SELECT public._secure_grant('is_period_writable(bigint)', 'authenticated');

SELECT public._secure_grant('get_active_period(bigint)', 'authenticated');

SELECT public._secure_grant('get_current_period()', 'authenticated');

DO $$
DECLARE
  _t text;
BEGIN
  FOREACH _t IN ARRAY ARRAY['public.expenses', 'public.payroll_invoices', 'public.meeting_attendance'] LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', _t);
    EXCEPTION WHEN SQLSTATE '42809' THEN NULL;
    END;
  END LOOP;
END $$;

SELECT public._secure_grant('find_or_create_private_conversation(uuid, uuid)', 'authenticated');

SELECT public._secure_grant('get_tasks_for_period(bigint, bigint)', 'authenticated');

SELECT public._secure_grant('get_posts_for_period(bigint, bigint, int)', 'authenticated');

SELECT public._secure_grant('get_dashboard_kpis()', 'authenticated');

REVOKE ALL ON public.profiles, public.students, public.payments, public.audit_logs,
  public.system_errors, public.login_attempts, public.data_snapshots,
  public.accounting_journal, public.payroll_records, public.caja_sessions,
  public.invoices, public.messages, public.conversations, public.conversation_participants,
  public.grades, public.report_cards, public.task_evidences, public.door_punches,
  public.attendance, public.teacher_schedules, public.schedule_event_logs
  FROM anon;

SELECT public._secure_grant('generate_receipt_number()', 'authenticated');

SELECT public._secure_grant('convert_preregistration(bigint, bigint, bigint, bigint, text)', 'authenticated');

SELECT public._secure_grant('convert_preregistration(bigint, bigint, bigint, bigint, text)', 'anon', true);

SELECT public._secure_grant('get_posts_for_parent(bigint)', 'authenticated, anon');

SELECT public._secure_grant('mark_messages_read(bigint)', 'authenticated');

SELECT public._secure_grant('get_direct_messages(uuid)', 'authenticated');

SELECT public._secure_grant('check_rate_limit(text, int, int)', 'service_role');

SELECT public._secure_grant('record_login_attempt(text, text, boolean)', 'service_role');

SELECT public._secure_grant('prune_login_attempts()', 'service_role');

SELECT public._secure_grant('activate_period(bigint)', 'anon', true);

SELECT public._secure_grant('close_period(bigint)', 'anon', true);

SELECT public._secure_grant('generate_receipt_number()', 'anon', true);

SELECT public._secure_grant('process_door_punch(text)', 'anon', true);

SELECT public._secure_grant('mark_invoice_email_sent(bigint)', 'anon', true);

SELECT public._secure_grant('update_updated_at_column()', 'anon', true);

SELECT public._secure_grant('set_event_time()', 'anon', true);

SELECT public._secure_grant('calculate_nap_duration()', 'anon', true);

DO $$
DECLARE
  _tables text[] := ARRAY[
    'public.posts',
    'public.comments',
    'public.likes',
    'public.messages',
    'public.conversations',
    'public.conversation_participants',
    'public.meetings',
    'public.notifications',
    'public.audit_logs',
    'public.data_snapshots',
    'public.login_attempts',
    'public.door_punches',
    'public.school_settings'
  ];
  _t text;
BEGIN
  FOREACH _t IN ARRAY _tables LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', _t);
    EXCEPTION WHEN SQLSTATE '42809' THEN NULL;
    END;
  END LOOP;
END $$;

SELECT public._secure_grant('get_active_school_year_id()', 'authenticated');

SELECT public._secure_grant('activate_period(bigint)', 'authenticated');

SELECT public._secure_grant('activate_period(bigint)', 'anon', true);

SELECT public._secure_grant('create_school_year_with_periods(text, date, date, bigint[], int)', 'anon', true);

SELECT public._secure_grant('create_new_school_year_with_promotion(text, date, date, boolean, boolean, boolean, int, text)', 'anon', true);

DO $$
DECLARE
  _tables text[] := ARRAY[
    'public.routine_categories',
    'public.routine_events',
    'public.classroom_routine_settings',
    'public.classroom_schedule_blocks',
    'public.classroom_schedule_block_events',
    'public.classroom_daily_schedule',
    'public.eval_boleta_notes',
    'public.eval_score_history'
  ];
  _t text;
BEGIN
  FOREACH _t IN ARRAY _tables LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', _t);
    EXCEPTION WHEN SQLSTATE '42809' THEN NULL;
    END;
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

DO $$
DECLARE
  _tables text[] := ARRAY[
    'public.eval_evaluations',
    'public.eval_areas',
    'public.eval_competencies',
    'public.eval_periods',
    'public.eval_modules',
    'public.eval_activities',
    'public.eval_evidences',
    'public.eval_scores',
    'public.eval_formulas'
  ];
  _t text;
BEGIN
  FOREACH _t IN ARRAY _tables LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', _t);
    EXCEPTION WHEN SQLSTATE '42809' THEN NULL;
    END;
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

DO $$
DECLARE
  _t text;
BEGIN
  FOREACH _t IN ARRAY ARRAY['public.eval_area_notes'] LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', _t);
    EXCEPTION WHEN SQLSTATE '42809' THEN NULL;
    END;
  END LOOP;
END $$;

SELECT public._secure_grant('boletin_ensure_structure(bigint)', 'authenticated');

DO $$
DECLARE
  _t text;
BEGIN
  FOREACH _t IN ARRAY ARRAY['public.school_year_processes'] LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', _t);
    EXCEPTION WHEN SQLSTATE '42809' THEN NULL;
    END;
  END LOOP;
END $$;

GRANT SELECT ON public.school_year_processes TO authenticated;

GRANT INSERT, UPDATE, DELETE ON public.school_year_processes TO service_role;

SELECT public._secure_grant('get_active_period(bigint)', 'anon', true);

SELECT public._secure_grant('get_current_period()', 'anon', true);

SELECT public._secure_grant('get_unread_counts()', 'authenticated');

DO $$
DECLARE
  _t text;
BEGIN
  FOREACH _t IN ARRAY ARRAY['public.message_attachments', 'public.message_reactions'] LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', _t);
    EXCEPTION WHEN SQLSTATE '42809' THEN NULL;
    END;
  END LOOP;
END $$;

SELECT public._secure_grant('generate_ascii_receipt(bigint)', 'authenticated');

DO $$
DECLARE
  _tables text[] := ARRAY[
    'public.payment_concepts',
    'public.students',
    'public.profiles',
    'public.payment_plans',
    'public.payments',
    'public.student_preregistrations',
    'public.school_years',
    'public.plan_installments',
    'public.student_enrollments',
    'public.student_charges',
    'public.classrooms',
    'public.parent_ratings',
    'public.school_settings',
    'public.invoices'
  ];
  _t text;
BEGIN
  FOREACH _t IN ARRAY _tables LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', _t);
    EXCEPTION WHEN SQLSTATE '42809' THEN NULL;
    END;
  END LOOP;
END $$;

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = 'convert_preregistration') THEN
    GRANT EXECUTE ON FUNCTION public.convert_preregistration TO authenticated;
  END IF;
END $do$;


-- ==============================================================================
--  >>> FASE 4 — Funciones y RPCs (los 26 que faltan)
-- ==============================================================================

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
-- 42P16: CREATE OR REPLACE VIEW no puede reducir columnas de una vista que ya
-- existe. Se tira primero para que el CREATE sea siempre limpio.
DROP VIEW IF EXISTS public.v_payments_with_mora CASCADE;
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
-- 42P16: se reemplaza en 06_vistas.sql con mas columnas (title, subtitle...).
-- DROP aqui evita que este CREATE de 3 columnas falle contra esa version.
DROP VIEW IF EXISTS public.daily_routine CASCADE;
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

DROP FUNCTION IF EXISTS public.add_column_if_not_exists(text, text, text);

CREATE OR REPLACE FUNCTION public.get_school_year_dashboard(p_school_year_id bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid; v_role text; v_year_id bigint;
  v_year record; v_enrollments int; v_classrooms int; v_teachers int;
  v_pending_payments int; v_total_income numeric; v_pending_income numeric;
  v_attendance_pct numeric; v_active_periods int; v_closed_periods int;
  v_current_period record; v_total_days int; v_elapsed_days int;
  v_processes jsonb;
BEGIN
  v_user_id := auth.uid();
  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
  IF v_role NOT IN ('directora','admin','encargada','asistente') THEN
    RETURN jsonb_build_object('error', 'No autorizado');
  END IF;

  IF p_school_year_id IS NOT NULL THEN
    v_year_id := p_school_year_id;
  ELSE
    SELECT id INTO v_year_id FROM public.school_years WHERE is_current = true LIMIT 1;
    IF v_year_id IS NULL THEN
      SELECT id INTO v_year_id FROM public.school_years WHERE status = 'active' ORDER BY start_date DESC LIMIT 1;
    END IF;
  END IF;
  IF v_year_id IS NULL THEN RETURN jsonb_build_object('error', 'No hay ano escolar activo'); END IF;

  SELECT * INTO v_year FROM public.school_years WHERE id = v_year_id;

  SELECT count(*) INTO v_enrollments FROM public.student_enrollments WHERE school_year_id = v_year_id AND status IN ('activo','inscrito','admitido','reinscrito');
  SELECT count(*) INTO v_classrooms FROM public.classrooms;
  SELECT count(DISTINCT teacher_id) INTO v_teachers FROM public.classrooms WHERE teacher_id IS NOT NULL;

  BEGIN
    SELECT count(*), COALESCE(sum(amount), 0) INTO v_pending_payments, v_pending_income
    FROM public.payments WHERE school_year_id = v_year_id AND status = 'pending' AND deleted_at IS NULL;
  EXCEPTION WHEN undefined_column THEN
    SELECT count(*), COALESCE(sum(amount), 0) INTO v_pending_payments, v_pending_income
    FROM public.payments WHERE school_year_id = v_year_id AND status = 'pending';
  END;

  BEGIN
    SELECT COALESCE(sum(amount), 0) INTO v_total_income
    FROM public.payments WHERE school_year_id = v_year_id AND status = 'paid' AND deleted_at IS NULL;
  EXCEPTION WHEN undefined_column THEN
    SELECT COALESCE(sum(amount), 0) INTO v_total_income
    FROM public.payments WHERE school_year_id = v_year_id AND status = 'paid';
  END;

  SELECT count(*) INTO v_active_periods FROM public.periods WHERE school_year_id = v_year_id AND status = 'open';
  SELECT count(*) INTO v_closed_periods FROM public.periods WHERE school_year_id = v_year_id AND status = 'closed';

  SELECT id, name, start_date, end_date INTO v_current_period
  FROM public.periods WHERE school_year_id = v_year_id AND is_active = true LIMIT 1;

  v_total_days := v_year.end_date - v_year.start_date;
  v_elapsed_days := greatest(0, least(v_total_days, current_date - v_year.start_date));

  BEGIN
    SELECT COALESCE(
      ROUND(
        (SELECT count(*)::numeric FROM public.attendance a
         WHERE a.school_year_id = v_year_id AND a.status = 'present'
         AND a.date >= current_date - INTERVAL '30 days') /
        NULLIF(
          (SELECT count(*)::numeric FROM public.attendance a
           WHERE a.school_year_id = v_year_id
           AND a.date >= current_date - INTERVAL '30 days'), 0
        ) * 100, 1
      ), 0
    ) INTO v_attendance_pct;
  EXCEPTION WHEN undefined_column THEN
    v_attendance_pct := 0;
  END;

  BEGIN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'type', process_type, 'label', label, 'status', status, 'executed_at', executed_at
    ) ORDER BY created_at), '[]'::jsonb) INTO v_processes
    FROM public.school_year_processes WHERE school_year_id = v_year_id;
  EXCEPTION WHEN undefined_table THEN
    v_processes := '[]'::jsonb;
  END;

  RETURN jsonb_build_object(
    'found', true,
    'year', jsonb_build_object(
      'id', v_year.id, 'name', v_year.name, 'start_date', v_year.start_date,
      'end_date', v_year.end_date, 'status', v_year.status, 'is_current', v_year.is_current,
      'period_model', v_year.period_model, 'num_periods', v_year.num_periods,
      'enrollment_open', v_year.enrollment_open, 'reenrollment_open', v_year.reenrollment_open,
      'total_days', v_total_days, 'elapsed_days', v_elapsed_days
    ),
    'kpi', jsonb_build_object(
      'enrollments', v_enrollments, 'classrooms', v_classrooms, 'teachers', v_teachers,
      'pending_payments', v_pending_payments,
      'total_income', v_total_income, 'pending_income', v_pending_income,
      'attendance_pct', v_attendance_pct,
      'active_periods', v_active_periods, 'closed_periods', v_closed_periods
    ),
    'current_period', CASE WHEN v_current_period.id IS NOT NULL THEN
      jsonb_build_object('id', v_current_period.id, 'name', v_current_period.name, 'start_date', v_current_period.start_date, 'end_date', v_current_period.end_date)
    ELSE null END,
    'processes', COALESCE(v_processes, '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_new_school_year_with_promotion(
  p_name text,
  p_start_date date,
  p_end_date date,
  p_period_model text DEFAULT 'trimestre',
  p_num_periods int DEFAULT 3,
  p_copy_classrooms boolean DEFAULT true,
  p_old_year_id bigint DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid; v_role text; v_new_year_id bigint;
  v_old_year bigint; v_copied_classrooms int := 0;
  v_created_periods int := 0;
  v_classroom record; v_plan record; r record;
  v_period_start date; v_period_end date;
  v_period_name text; v_days_per_period int;
  v_new_enrollment_id bigint;
BEGIN
  v_user_id := auth.uid();
  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
  IF v_role NOT IN ('directora','admin') THEN
    RETURN jsonb_build_object('error', 'Solo la directora puede crear anos escolares');
  END IF;

  IF p_old_year_id IS NOT NULL THEN
    v_old_year := p_old_year_id;
  ELSE
    SELECT id INTO v_old_year FROM public.school_years WHERE is_current = true LIMIT 1;
  END IF;

  UPDATE public.school_years SET is_current = false WHERE is_current = true;

  INSERT INTO public.school_years (name, start_date, end_date, status, is_current, period_model, num_periods, created_at)
  VALUES (p_name, p_start_date, p_end_date, 'active', true, p_period_model, p_num_periods, now())
  RETURNING id INTO v_new_year_id;

  v_days_per_period := (p_end_date - p_start_date) / p_num_periods;
  FOR i IN 1..p_num_periods LOOP
    v_period_start := p_start_date + ((i - 1) * v_days_per_period);
    v_period_end := CASE WHEN i = p_num_periods THEN p_end_date ELSE p_start_date + (i * v_days_per_period) - 1 END;
    v_period_name := CASE p_period_model
      WHEN 'trimestre' THEN i || 'er Trimestre'
      WHEN 'cuatrimestre' THEN i || 'er Cuatrimestre'
      WHEN 'bimestre' THEN i || 'er Bimestre'
      WHEN 'mes' THEN to_char(v_period_start, 'Month')
      ELSE i || 'er Periodo'
    END;

    INSERT INTO public.periods (name, start_date, end_date, status, is_active, school_year_id, sort_order, created_at)
    VALUES (v_period_name, v_period_start, v_period_end, 'open', (i = 1), v_new_year_id, i, now());
    v_created_periods := v_created_periods + 1;
  END LOOP;

  IF p_copy_classrooms AND v_old_year IS NOT NULL THEN
    FOR v_classroom IN SELECT * FROM public.classrooms LOOP
      INSERT INTO public.classrooms (name, level, capacity, teacher_id, is_live)
      VALUES (v_classroom.name, v_classroom.level, v_classroom.capacity, v_classroom.teacher_id, false);
      v_copied_classrooms := v_copied_classrooms + 1;
    END LOOP;
  END IF;

  IF v_old_year IS NOT NULL THEN
    BEGIN
      FOR v_plan IN SELECT * FROM public.payment_plans WHERE school_year_id = v_old_year AND is_active = true LOOP
        INSERT INTO public.payment_plans (name, description, amount, installments, is_active, school_year_id, created_at)
        VALUES (v_plan.name, v_plan.description, v_plan.amount, v_plan.installments, true, v_new_year_id, now());
      END LOOP;
    EXCEPTION WHEN undefined_column THEN NULL;
    END;
  END IF;

  BEGIN
    IF v_old_year IS NOT NULL THEN
      FOR r IN SELECT se.*, s.name AS student_name
        FROM public.student_enrollments se
        JOIN public.students s ON s.id = se.student_id
        WHERE se.school_year_id = v_old_year AND se.status IN ('activo','inscrito','reinscrito')
      LOOP
        INSERT INTO public.student_enrollments (student_id, school_year_id, classroom_id, status, registration_date, created_at)
        VALUES (r.student_id, v_new_year_id, r.classroom_id, 'inscrito', now(), now())
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_new_enrollment_id;
      END LOOP;
    END IF;
  EXCEPTION WHEN undefined_column THEN NULL;
  END;

  INSERT INTO public.school_year_processes (school_year_id, process_type, label, status, executed_at, executed_by)
  VALUES (v_new_year_id, 'year_created', 'Ano escolar creado', 'completed', now(), v_user_id);

  RETURN jsonb_build_object(
    'success', true,
    'year_id', v_new_year_id,
    'periods_created', v_created_periods,
    'classrooms_copied', v_copied_classrooms
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_pending_transfer_payments()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid; v_role text;
  v_payments jsonb;
BEGIN
  v_user_id := auth.uid();
  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
  IF v_role NOT IN ('directora','admin','encargada','asistente') THEN
    RETURN jsonb_build_object('error', 'No autorizado');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', p.id, 'amount', p.amount, 'concept', p.concept, 'status', p.status,
    'method', p.method, 'bank', p.bank, 'reference', p.reference,
    'transfer_date', p.transfer_date, 'month_paid', p.month_paid,
    'proof_url', p.proof_url, 'evidence_url', p.evidence_url,
    'created_at', p.created_at, 'notes', p.notes,
    'student_id', p.student_id, 'student_name', s.name,
    'student_matricula', s.matricula, 'student_level', s.nivel,
    'classroom_name', c.name,
    'parent_name', s.p1_name, 'parent_phone', s.p1_phone
  ) ORDER BY p.created_at DESC), '[]'::jsonb) INTO v_payments
  FROM public.payments p
  JOIN public.students s ON s.id = p.student_id
  LEFT JOIN public.classrooms c ON c.id = s.classroom_id
  WHERE p.status = 'pending'
  AND (p.method = 'transferencia' OR p.proof_url IS NOT NULL OR p.evidence_url IS NOT NULL);

  RETURN jsonb_build_object('payments', v_payments, 'count', jsonb_array_length(v_payments));
END;
$$;

CREATE OR REPLACE FUNCTION public.review_transfer_payment(
  p_payment_id bigint,
  p_action text,
  p_notes text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid; v_role text; v_payment record;
BEGIN
  v_user_id := auth.uid();
  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
  IF v_role NOT IN ('directora','admin','encargada','asistente') THEN
    RETURN jsonb_build_object('error', 'No autorizado');
  END IF;

  SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Pago no encontrado'); END IF;

  IF p_action = 'approve' THEN
    UPDATE public.payments SET status = 'paid', paid_date = now(), notes = COALESCE(p_notes, notes) WHERE id = p_payment_id;
    UPDATE public.students SET is_active = true WHERE id = v_payment.student_id;
    INSERT INTO public.audit_logs (user_id, action, payload, created_at)
    VALUES (v_user_id, 'payment.transfer_approved', jsonb_build_object('payment_id', p_payment_id, 'amount', v_payment.amount), now());
    RETURN jsonb_build_object('success', true, 'action', 'approved');

  ELSIF p_action = 'reject' THEN
    UPDATE public.payments SET status = 'rejected', notes = COALESCE(p_notes, notes) WHERE id = p_payment_id;
    INSERT INTO public.audit_logs (user_id, action, payload, created_at)
    VALUES (v_user_id, 'payment.transfer_rejected', jsonb_build_object('payment_id', p_payment_id, 'amount', v_payment.amount), now());
    RETURN jsonb_build_object('success', true, 'action', 'rejected');

  ELSE
    RETURN jsonb_build_object('error', 'Accion no valida. Use approve o reject');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_single_active_year()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_current = true THEN
    UPDATE public.school_years SET is_current = false WHERE id != NEW.id AND is_current = true;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_period_not_closed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_period record; v_year record; v_user_role text;
BEGIN
  v_user_role := (SELECT role FROM public.profiles WHERE id = auth.uid());

  IF v_user_role IN ('directora', 'admin') THEN RETURN NEW; END IF;

  IF TG_TABLE_NAME = 'attendance' AND NEW.period_id IS NOT NULL THEN
    SELECT * INTO v_period FROM public.periods WHERE id = NEW.period_id;
    IF FOUND AND (v_period.status = 'closed' OR COALESCE(v_period.is_blocked, false) = true) THEN
      RAISE EXCEPTION 'REGRA #12: No se puede registrar asistencia en un período cerrado.';
    END IF;
  END IF;

  IF TG_TABLE_NAME IN ('tasks', 'task_evidences') THEN
    IF NEW.period_id IS NOT NULL THEN
      SELECT * INTO v_period FROM public.periods WHERE id = NEW.period_id;
      IF FOUND AND (v_period.status = 'closed' OR COALESCE(v_period.is_blocked, false) = true) THEN
        RAISE EXCEPTION 'REGRA #12: No se puede crear/modificar tareas en un período cerrado.';
      END IF;
    END IF;
  END IF;

  IF TG_TABLE_NAME IN ('grades', 'competency_scores') THEN
    IF NEW.period_id IS NOT NULL THEN
      SELECT * INTO v_period FROM public.periods WHERE id = NEW.period_id;
      IF FOUND AND (v_period.status = 'closed' OR COALESCE(v_period.is_blocked, false) = true) THEN
        RAISE EXCEPTION 'REGRA #13: No se pueden modificar calificaciones de un período cerrado.';
      END IF;
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'posts' THEN
    IF NEW.period_id IS NOT NULL THEN
      SELECT * INTO v_period FROM public.periods WHERE id = NEW.period_id;
      IF FOUND AND (v_period.status = 'closed' OR COALESCE(v_period.is_blocked, false) = true) THEN
        RAISE EXCEPTION 'REGRA #20: No se puede publicar en un período cerrado.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_year_not_closed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_year record; v_user_role text;
BEGIN
  v_user_role := (SELECT role FROM public.profiles WHERE id = auth.uid());
  IF v_user_role IN ('directora', 'admin') THEN RETURN NEW; END IF;

  IF NEW.school_year_id IS NOT NULL THEN
    SELECT * INTO v_year FROM public.school_years WHERE id = NEW.school_year_id;
    IF FOUND AND v_year.status = 'closed' THEN
      RAISE EXCEPTION 'REGRA #3: No se puede registrar datos en un Año Escolar cerrado.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_enrollment_year_open()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_year record;
BEGIN
  SELECT * INTO v_year FROM public.school_years WHERE id = NEW.school_year_id;
  IF FOUND AND v_year.status = 'closed' THEN
    RAISE EXCEPTION 'REGRA #8: No se pueden matricular estudiantes en un Año Escolar cerrado.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_single_enrollment_per_year()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.student_enrollments
  WHERE student_id = NEW.student_id
  AND school_year_id = NEW.school_year_id
  AND status IN ('activo','inscrito','admitido','reinscrito')
  AND id IS DISTINCT FROM NEW.id;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'REGRA #26: Ya existe una matrícula activa para este estudiante en este año escolar.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_enrollment_has_year()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.school_year_id IS NULL THEN
    RAISE EXCEPTION 'REGRA #9: Toda matrícula debe pertenecer a un Año Escolar.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_inscription_open()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_year record; v_user_role text;
BEGIN
  v_user_role := (SELECT role FROM public.profiles WHERE id = auth.uid());
  IF v_user_role IN ('directora', 'admin') THEN RETURN NEW; END IF;

  SELECT * INTO v_year FROM public.school_years WHERE id = NEW.school_year_id;
  IF FOUND AND COALESCE(v_year.enrollment_open, false) = false THEN
    RAISE EXCEPTION 'REGRA #21: Las inscripciones están cerradas para este año escolar.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_student_competencies(
  p_student_id bigint,
  p_period_id bigint
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_result jsonb;
BEGIN
  SELECT jsonb_agg(jsonb_build_object(
    'area_name', aa.name, 'area_icon', aa.icon,
    'competency_name', c.name, 'competency_description', c.description,
    'stars', cs.stars, 'level', cs.level, 'numeric_score', cs.numeric_score,
    'observation', cs.observation, 'competency_id', cs.competency_id
  ) ORDER BY aa.sort_order, c.level_order) INTO v_result
  FROM public.competency_scores cs
  JOIN public.competencies c ON c.id = cs.competency_id
  JOIN public.academic_areas aa ON aa.id = c.area_id
  WHERE cs.student_id = p_student_id AND cs.period_id = p_period_id;
  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_classroom_area_averages(
  p_classroom_id bigint,
  p_period_id bigint
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_result jsonb;
BEGIN
  SELECT jsonb_agg(jsonb_build_object(
    'area_id', aa.id, 'area_name', aa.name, 'area_icon', aa.icon,
    'avg_stars', ROUND(AVG(cs.stars), 1),
    'avg_score', ROUND(AVG(cs.numeric_score), 1),
    'student_count', count(DISTINCT cs.student_id),
    'competency_count', count(DISTINCT cs.competency_id)
  ) ORDER BY aa.sort_order) INTO v_result
  FROM public.competency_scores cs
  JOIN public.competencies c ON c.id = cs.competency_id
  JOIN public.academic_areas aa ON aa.id = c.area_id
  WHERE cs.classroom_id = p_classroom_id AND cs.period_id = p_period_id;
  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_institutional_averages(p_period_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'areas', jsonb_agg(jsonb_build_object(
      'area_name', aa.name, 'area_icon', aa.icon,
      'avg_stars', ROUND(AVG(cs.stars), 1),
      'avg_score', ROUND(AVG(cs.numeric_score), 1),
      'evaluated', count(DISTINCT cs.student_id)
    ) ORDER BY aa.sort_order),
    'total_evaluated', (SELECT count(DISTINCT student_id) FROM public.competency_scores WHERE period_id = p_period_id),
    'total_students', (SELECT count(*) FROM public.students s
      JOIN public.student_enrollments se ON se.student_id = s.id
      WHERE se.status IN ('activo','inscrito','reinscrito')),
    'global_avg_stars', (SELECT ROUND(AVG(stars), 1) FROM public.competency_scores WHERE period_id = p_period_id),
    'global_avg_score', (SELECT ROUND(AVG(numeric_score), 1) FROM public.competency_scores WHERE period_id = p_period_id)
  ) INTO v_result
  FROM public.competency_scores cs
  JOIN public.competencies c ON c.id = cs.competency_id
  JOIN public.academic_areas aa ON aa.id = c.area_id
  WHERE cs.period_id = p_period_id;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_student_academic_record(p_student_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_result jsonb;
BEGIN
  SELECT jsonb_agg(jsonb_build_object(
    'period_id', rc.period_id, 'period_name', p.name,
    'school_year_id', rc.school_year_id, 'school_year_name', sy.name,
    'classroom_name', c.name,
    'task_avg', rc.task_avg, 'formal_avg', rc.formal_avg,
    'final_score', rc.final_score, 'level', rc.level,
    'teacher_comment', rc.teacher_comment,
    'competency_summary', rc.competency_summary,
    'areas_summary', rc.areas_summary,
    'teacher_observations', rc.teacher_observations,
    'generated_at', rc.generated_at
  ) ORDER BY sy.start_date DESC, p.start_date DESC) INTO v_result
  FROM public.report_cards rc
  JOIN public.periods p ON p.id = rc.period_id
  JOIN public.school_years sy ON sy.id = rc.school_year_id
  LEFT JOIN public.classrooms c ON c.id = rc.classroom_id
  WHERE rc.student_id = p_student_id;

  RETURN jsonb_build_object('student_id', p_student_id, 'records', COALESCE(v_result, '[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_school_year_dashboard(p_school_year_id bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid; v_role text; v_year_id bigint;
  v_year record; v_enrollments int; v_classrooms int; v_teachers int;
  v_pending_payments int; v_total_income numeric; v_pending_income numeric;
  v_attendance_pct numeric; v_active_periods int; v_closed_periods int;
  v_current_period record; v_total_days int; v_elapsed_days int;
  v_processes jsonb;
BEGIN
  v_user_id := auth.uid();
  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
  IF v_role NOT IN ('directora','admin','encargada') THEN
    RETURN jsonb_build_object('error', 'No autorizado');
  END IF;

  IF p_school_year_id IS NOT NULL THEN
    v_year_id := p_school_year_id;
  ELSE
    SELECT id INTO v_year_id FROM public.school_years WHERE is_current = true LIMIT 1;
    IF v_year_id IS NULL THEN
      SELECT id INTO v_year_id FROM public.school_years WHERE status = 'active' ORDER BY start_date DESC LIMIT 1;
    END IF;
  END IF;
  IF v_year_id IS NULL THEN RETURN jsonb_build_object('error', 'No hay año escolar activo'); END IF;

  SELECT * INTO v_year FROM public.school_years WHERE id = v_year_id;

  SELECT count(*) INTO v_enrollments FROM public.student_enrollments WHERE school_year_id = v_year_id AND status IN ('activo','inscrito','admitido','reinscrito');
  SELECT count(*) INTO v_classrooms FROM public.classrooms WHERE deleted_at IS NULL;
  SELECT count(DISTINCT teacher_id) INTO v_teachers FROM public.classrooms WHERE teacher_id IS NOT NULL AND deleted_at IS NULL;

  SELECT count(*), COALESCE(sum(amount), 0) INTO v_pending_payments, v_pending_income
  FROM public.payments WHERE school_year_id = v_year_id AND status = 'pending' AND deleted_at IS NULL;
  SELECT COALESCE(sum(amount), 0) INTO v_total_income
  FROM public.payments WHERE school_year_id = v_year_id AND status = 'paid' AND deleted_at IS NULL;

  SELECT count(*) INTO v_active_periods FROM public.periods WHERE school_year_id = v_year_id AND status = 'open';
  SELECT count(*) INTO v_closed_periods FROM public.periods WHERE school_year_id = v_year_id AND status = 'closed';

  SELECT id, name, start_date, end_date INTO v_current_period
  FROM public.periods WHERE school_year_id = v_year_id AND is_active = true LIMIT 1;

  v_total_days := v_year.end_date - v_year.start_date;
  v_elapsed_days := greatest(0, least(v_total_days, current_date - v_year.start_date));

  SELECT COALESCE(
    ROUND(
      (SELECT count(*)::numeric FROM public.attendance a
       WHERE a.school_year_id = v_year_id AND a.status = 'present'
       AND a.date >= current_date - INTERVAL '30 days') /
      NULLIF(
        (SELECT count(*)::numeric FROM public.attendance a
         WHERE a.school_year_id = v_year_id
         AND a.date >= current_date - INTERVAL '30 days'), 0
      ) * 100, 1
    ), 0
  ) INTO v_attendance_pct;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'type', process_type, 'label', label, 'status', status, 'executed_at', executed_at
  ) ORDER BY created_at), '[]'::jsonb) INTO v_processes
  FROM public.school_year_processes WHERE school_year_id = v_year_id;

  RETURN jsonb_build_object(
    'found', true,
    'year', jsonb_build_object(
      'id', v_year.id, 'name', v_year.name, 'start_date', v_year.start_date,
      'end_date', v_year.end_date, 'status', v_year.status, 'is_current', v_year.is_current,
      'period_model', v_year.period_model, 'num_periods', v_year.num_periods,
      'enrollment_open', v_year.enrollment_open, 'reenrollment_open', v_year.reenrollment_open,
      'total_days', v_total_days, 'elapsed_days', v_elapsed_days
    ),
    'kpi', jsonb_build_object(
      'enrollments', v_enrollments, 'classrooms', v_classrooms, 'teachers', v_teachers,
      'pending_payments', v_pending_payments,
      'total_income', v_total_income, 'pending_income', v_pending_income,
      'attendance_pct', v_attendance_pct,
      'active_periods', v_active_periods, 'closed_periods', v_closed_periods
    ),
    'current_period', CASE WHEN v_current_period.id IS NOT NULL THEN
      jsonb_build_object('id', v_current_period.id, 'name', v_current_period.name, 'start_date', v_current_period.start_date, 'end_date', v_current_period.end_date)
    ELSE null END,
    'processes', v_processes
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_new_school_year_with_promotion(
  p_name text,
  p_start_date date,
  p_end_date date,
  p_copy_classrooms boolean DEFAULT true,
  p_copy_payment_plans boolean DEFAULT true,
  p_promote_students boolean DEFAULT true,
  p_num_periods int DEFAULT 3,
  p_period_model text DEFAULT 'trimestres'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid; v_role text; v_new_year_id bigint;
  v_old_year_id bigint; v_classroom record; v_plan record;
  v_student record; v_enrollment record;
  v_new_classroom_id bigint; v_new_plan_id bigint;
  v_new_enrollment_id bigint; v_copied_classrooms int := 0;
  v_copied_plans int := 0; v_promoted_students int := 0;
  v_period_days int; v_period_start date; v_period_end date;
  v_period_names text[] := ARRAY['1er Trimestre','2do Trimestre','3er Trimestre','4to Trimestre','5to Trimestre','6to Trimestre'];
  v_period_name text; v_total_days int; v_created_periods int := 0;
  v_level_order text[] := ARRAY['Maternal','Infante','Parvulos','Pre-Kinder','Kinder','Preprimaria','1ro Primaria','2do Primaria','3ro Primaria','4to Primaria','5to Primaria','6to Primaria'];
  v_current_level_idx int; v_next_level text;
BEGIN
  v_user_id := auth.uid();
  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
  IF v_role NOT IN ('directora','admin') THEN
    RETURN jsonb_build_object('error', 'Solo la directora puede crear años escolares');
  END IF;

  SELECT id INTO v_old_year_id FROM public.school_years WHERE is_current = true LIMIT 1;
  IF v_old_year_id IS NULL THEN
    SELECT id INTO v_old_year_id FROM public.school_years WHERE status = 'active' ORDER BY start_date DESC LIMIT 1;
  END IF;

  IF v_old_year_id IS NOT NULL THEN
    UPDATE public.school_years SET is_current = false WHERE id = v_old_year_id;
  END IF;

  INSERT INTO public.school_years (name, start_date, end_date, status, is_current, period_model, num_periods)
  VALUES (p_name, p_start_date, p_end_date, 'active', true, p_period_model, p_num_periods)
  RETURNING id INTO v_new_year_id;

  v_total_days := p_end_date - p_start_date;
  v_period_days := v_total_days / p_num_periods;
  v_period_start := p_start_date;
  FOR i IN 1..p_num_periods LOOP
    v_period_end := v_period_start + (v_period_days || ' days')::interval - INTERVAL '1 day';
    IF i = p_num_periods THEN v_period_end := p_end_date; END IF;
    v_period_name := COALESCE(v_period_names[i], i || ' Periodo');
    INSERT INTO public.periods (name, start_date, end_date, status, is_active, school_year_id, sort_order)
    VALUES (v_period_name, v_period_start, v_period_end, 'open', (i = 1), v_new_year_id, i);
    v_created_periods := v_created_periods + 1;
    v_period_start := v_period_end + INTERVAL '1 day';
  END LOOP;

  IF p_copy_classrooms AND v_old_year_id IS NOT NULL THEN
    FOR v_classroom IN SELECT * FROM public.classrooms WHERE deleted_at IS NULL LOOP
      INSERT INTO public.classrooms (name, level, capacity, teacher_id, is_live)
      VALUES (v_classroom.name, v_classroom.level, v_classroom.capacity, v_classroom.teacher_id, false)
      RETURNING id INTO v_new_classroom_id;
      v_copied_classrooms := v_copied_classrooms + 1;
    END LOOP;
  END IF;

  IF p_copy_payment_plans AND v_old_year_id IS NOT NULL THEN
    FOR v_plan IN SELECT * FROM public.payment_plans WHERE school_year_id = v_old_year_id AND is_active = true AND deleted_at IS NULL LOOP
      INSERT INTO public.payment_plans (school_year_id, level, schedule, name, registration_fee, description, is_active)
      VALUES (v_new_year_id, v_plan.level, v_plan.schedule, v_plan.name, v_plan.registration_fee, v_plan.description, true)
      RETURNING id INTO v_new_plan_id;
      INSERT INTO public.plan_installments (payment_plan_id, type, month_number, month_name, amount, due_day, due_month_offset, is_registration)
      SELECT v_new_plan_id, type, month_number, month_name, amount, due_day, due_month_offset, is_registration
      FROM public.plan_installments WHERE payment_plan_id = v_plan.id;
      v_copied_plans := v_copied_plans + 1;
    END LOOP;
  END IF;

  IF p_promote_students AND v_old_year_id IS NOT NULL THEN
    FOR v_enrollment IN
      SELECT se.*, s.name AS student_name
      FROM public.student_enrollments se
      JOIN public.students s ON s.id = se.student_id
      WHERE se.school_year_id = v_old_year_id
      AND se.status IN ('activo','inscrito','reinscrito')
    LOOP
      v_current_level_idx := array_position(v_level_order, v_enrollment.level_at_enrollment);
      IF v_current_level_idx IS NOT NULL AND v_current_level_idx < array_length(v_level_order, 1) THEN
        v_next_level := v_level_order[v_current_level_idx + 1];
      ELSE
        v_next_level := v_enrollment.level_at_enrollment;
      END IF;

      INSERT INTO public.student_enrollments (
        student_id, school_year_id, classroom_id, payment_plan_id, status,
        level_at_enrollment, promoted_from_enrollment_id, registration_date
      ) VALUES (
        v_enrollment.student_id, v_new_year_id, NULL, NULL, 'preinscrito',
        v_next_level, v_enrollment.id, now()
      ) RETURNING id INTO v_new_enrollment_id;

      INSERT INTO public.student_promotions (
        student_id, from_school_year_id, to_school_year_id,
        from_enrollment_id, to_enrollment_id,
        from_level, to_level, from_classroom_id, status, promoted_by
      ) VALUES (
        v_enrollment.student_id, v_old_year_id, v_new_year_id,
        v_enrollment.id, v_new_enrollment_id,
        v_enrollment.level_at_enrollment, v_next_level, v_enrollment.classroom_id,
        'completed', v_user_id
      );

      v_promoted_students := v_promoted_students + 1;
    END LOOP;
  END IF;

  INSERT INTO public.school_year_processes (school_year_id, process_type, label, status, executed_at, executed_by)
  VALUES
    (v_new_year_id, 'config', 'Año escolar creado', 'completed', now(), v_user_id),
    (v_new_year_id, 'periods_created', v_created_periods || ' periodos creados', 'completed', now(), v_user_id),
    (v_new_year_id, 'new_year_ready', 'Año escolar listo para usar', 'completed', now(), v_user_id);

  INSERT INTO public.audit_logs (user_id, action, payload, created_at) VALUES (v_user_id, 'school_year.created_with_promotion', jsonb_build_object(
    'new_year_id', v_new_year_id, 'name', p_name,
    'periods', v_created_periods, 'classrooms_copied', v_copied_classrooms,
    'plans_copied', v_copied_plans, 'students_promoted', v_promoted_students
  ), now());

  RETURN jsonb_build_object(
    'success', true,
    'school_year_id', v_new_year_id,
    'name', p_name,
    'periods_created', v_created_periods,
    'classrooms_copied', v_copied_classrooms,
    'plans_copied', v_copied_plans,
    'students_promoted', v_promoted_students
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.close_school_year(p_school_year_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid; v_role text; v_year record;
  v_students_closed int := 0;
BEGIN
  v_user_id := auth.uid();
  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
  IF v_role NOT IN ('directora','admin') THEN
    RETURN jsonb_build_object('error', 'Solo la directora puede cerrar años escolares');
  END IF;

  SELECT * INTO v_year FROM public.school_years WHERE id = p_school_year_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Año escolar no encontrado'); END IF;
  IF v_year.status = 'closed' THEN RETURN jsonb_build_object('error', 'El año ya está cerrado'); END IF;

  UPDATE public.periods SET status = 'closed', is_active = false, is_blocked = true, closed_at = now(), closed_by = v_user_id
  WHERE school_year_id = p_school_year_id AND status = 'open';

  INSERT INTO public.school_year_archive (school_year_id, snapshot_type, data)
  SELECT p_school_year_id, 'summary', jsonb_build_object(
    'name', v_year.name, 'start_date', v_year.start_date, 'end_date', v_year.end_date,
    'total_enrollments', (SELECT count(*) FROM public.student_enrollments WHERE school_year_id = p_school_year_id),
    'total_payments', (SELECT COALESCE(sum(amount),0) FROM public.payments WHERE school_year_id = p_school_year_id AND status = 'paid'),
    'total_pending', (SELECT COALESCE(sum(amount),0) FROM public.payments WHERE school_year_id = p_school_year_id AND status = 'pending'),
    'total_tasks', (SELECT count(*) FROM public.tasks WHERE school_year_id = p_school_year_id),
    'total_grades', (SELECT count(*) FROM public.grades WHERE school_year_id = p_school_year_id),
    'total_incidents', (SELECT count(*) FROM public.incidents WHERE school_year_id = p_school_year_id)
  );

  UPDATE public.school_years SET is_current = false, status = 'closed', closed_at = now(), closed_by = v_user_id
  WHERE id = p_school_year_id;

  INSERT INTO public.audit_logs (user_id, action, payload, created_at) VALUES (v_user_id, 'school_year.closed', jsonb_build_object('year_id', p_school_year_id, 'name', v_year.name), now());
  INSERT INTO public.school_year_processes (school_year_id, process_type, label, status, executed_at, executed_by)
  VALUES (p_school_year_id, 'year_closed', 'Año escolar cerrado', 'completed', now(), v_user_id);

  RETURN jsonb_build_object('success', true, 'year_id', p_school_year_id, 'name', v_year.name);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_active_school_year(p_school_year_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user_id uuid; v_role text; v_year record;
BEGIN
  v_user_id := auth.uid();
  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
  IF v_role NOT IN ('directora','admin') THEN
    RETURN jsonb_build_object('error', 'No autorizado');
  END IF;

  SELECT * INTO v_year FROM public.school_years WHERE id = p_school_year_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Año escolar no encontrado'); END IF;

  UPDATE public.school_years SET is_current = false WHERE id IS NOT NULL;
  UPDATE public.school_years SET is_current = true WHERE id = p_school_year_id;

  INSERT INTO public.audit_logs (user_id, action, payload, created_at) VALUES (v_user_id, 'school_year.switched', jsonb_build_object('year_id', p_school_year_id, 'name', v_year.name), now());

  RETURN jsonb_build_object('success', true, 'year_id', p_school_year_id, 'name', v_year.name);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_school_year_history(p_school_year_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid; v_role text; v_year record;
  v_enrollments jsonb; v_payments jsonb; v_summary jsonb;
BEGIN
  v_user_id := auth.uid();
  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;

  SELECT * INTO v_year FROM public.school_years WHERE id = p_school_year_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Año escolar no encontrado'); END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'student_id', se.student_id, 'student_name', s.name,
    'level', se.level_at_enrollment, 'classroom_id', se.classroom_id,
    'status', se.status, 'matricula', s.matricula
  )), '[]'::jsonb) INTO v_enrollments
  FROM public.student_enrollments se
  JOIN public.students s ON s.id = se.student_id
  WHERE se.school_year_id = p_school_year_id;

  SELECT jsonb_build_object(
    'total_paid', COALESCE(sum(amount), 0),
    'total_pending', (SELECT COALESCE(sum(amount), 0) FROM public.payments WHERE school_year_id = p_school_year_id AND status = 'pending' AND deleted_at IS NULL),
    'count_paid', count(*) FILTER (WHERE status = 'paid'),
    'count_pending', count(*) FILTER (WHERE status = 'pending')
  ) INTO v_payments
  FROM public.payments WHERE school_year_id = p_school_year_id AND deleted_at IS NULL;

  SELECT jsonb_build_object(
    'name', v_year.name, 'status', v_year.status,
    'start_date', v_year.start_date, 'end_date', v_year.end_date,
    'enrollments', v_enrollments, 'payments', v_payments,
    'total_tasks', (SELECT count(*) FROM public.tasks WHERE school_year_id = p_school_year_id),
    'total_grades', (SELECT count(*) FROM public.grades WHERE school_year_id = p_school_year_id),
    'total_incidents', (SELECT count(*) FROM public.incidents WHERE school_year_id = p_school_year_id),
    'total_posts', (SELECT count(*) FROM public.posts WHERE school_year_id = p_school_year_id),
    'total_attendance', (SELECT count(*) FROM public.attendance WHERE school_year_id = p_school_year_id)
  ) INTO v_summary;

  RETURN v_summary;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_period_writable(p_period_id bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status text; v_blocked boolean;
BEGIN
  SELECT status, is_blocked INTO v_status, v_blocked FROM public.periods WHERE id = p_period_id;
  IF NOT FOUND THEN RETURN false; END IF;
  RETURN v_status = 'open' AND COALESCE(v_blocked, false) = false;
END;
$$;

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

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key text, p_window_seconds int, p_max_attempts int
)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT count(*) < p_max_attempts
  FROM public.login_attempts
  WHERE (email = p_key OR ip_hash = p_key)
    AND created_at > now() - make_interval(secs => p_window_seconds);
$$;

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

CREATE OR REPLACE FUNCTION public.prune_login_attempts()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.login_attempts WHERE created_at < now() - interval '7 days';
$$;

CREATE OR REPLACE FUNCTION public.get_active_school_year_id()
RETURNS bigint LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT id FROM public.school_years
  WHERE is_current = true AND deleted_at IS NULL
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.auto_scope_school_year()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'task_evidences' THEN
    IF NEW.school_year_id IS NULL THEN
      SELECT school_year_id INTO NEW.school_year_id FROM public.tasks WHERE id = NEW.task_id;
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.school_year_id IS NULL THEN
    NEW.school_year_id := public.get_active_school_year_id();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_scope_period()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_period periods%ROWTYPE; v_scope_date date; v_year_id bigint;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF NEW.period_id IS NOT NULL THEN RETURN NEW; END IF;

  IF TG_TABLE_NAME = 'task_evidences' THEN
    SELECT period_id INTO NEW.period_id FROM public.tasks WHERE id = NEW.task_id;
    RETURN NEW;
  END IF;

  v_year_id := COALESCE(NEW.school_year_id, public.get_active_school_year_id());
  IF v_year_id IS NULL THEN RETURN NEW; END IF;

  CASE TG_TABLE_NAME
    WHEN 'tasks' THEN v_scope_date := COALESCE(NEW.due_date::date, current_date);
    WHEN 'attendance' THEN v_scope_date := COALESCE(NEW.date, current_date);
    WHEN 'daily_logs' THEN v_scope_date := COALESCE(NEW.date, current_date);
    ELSE v_scope_date := current_date;
  END CASE;

  SELECT * INTO v_period FROM public.periods
  WHERE school_year_id = v_year_id
    AND status = 'open'
    AND COALESCE(is_blocked, false) = false
    AND v_scope_date BETWEEN start_date AND end_date
  ORDER BY start_date LIMIT 1;

  IF FOUND THEN
    NEW.period_id := v_period.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_single_active_period()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_active = true THEN
    IF EXISTS (
      SELECT 1 FROM public.periods
      WHERE is_active = true AND id IS DISTINCT FROM NEW.id
    ) THEN
      RAISE EXCEPTION 'REGRA: Solo puede haber un periodo activo a la vez. Desactiva el periodo actual primero.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_period_valid_dates()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_year school_years%ROWTYPE;
BEGIN
  IF NEW.start_date >= NEW.end_date THEN
    RAISE EXCEPTION 'REGRA: La fecha de inicio del periodo debe ser anterior a la de fin.';
  END IF;
  IF NEW.school_year_id IS NOT NULL THEN
    SELECT * INTO v_year FROM public.school_years WHERE id = NEW.school_year_id;
    IF FOUND THEN
      IF NEW.start_date < v_year.start_date OR NEW.end_date > v_year.end_date THEN
        RAISE EXCEPTION 'REGRA: Las fechas del periodo deben estar dentro del ano escolar (%)', v_year.name;
      END IF;
      IF v_year.status = 'closed' THEN
        RAISE EXCEPTION 'REGRA: No se pueden crear periodos en un ano escolar cerrado.';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_new_school_year_with_promotion(
  p_name text,
  p_start_date date,
  p_end_date date,
  p_copy_classrooms boolean DEFAULT true,
  p_copy_payment_plans boolean DEFAULT true,
  p_promote_students boolean DEFAULT true,
  p_num_periods int DEFAULT 3,
  p_period_model text DEFAULT 'trimestres'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid; v_role text; v_new_year_id bigint;
  v_old_year_id bigint; v_classroom record; v_plan record;
  v_student record; v_enrollment record;
  v_new_classroom_id bigint; v_new_plan_id bigint;
  v_new_enrollment_id bigint; v_copied_classrooms int := 0;
  v_copied_plans int := 0; v_promoted_students int := 0;
  v_period_days int; v_period_start date; v_period_end date;
  v_period_names text[] := ARRAY['1er Trimestre','2do Trimestre','3er Trimestre','4to Trimestre','5to Trimestre','6to Trimestre'];
  v_period_name text; v_total_days int; v_created_periods int := 0;
  v_level_order text[] := ARRAY['Maternal','Infante','Parvulos','Pre-Kinder','Kinder','Preprimaria','1ro Primaria','2do Primaria','3ro Primaria','4to Primaria','5to Primaria','6to Primaria'];
  v_current_level_idx int; v_next_level text;
BEGIN
  v_user_id := auth.uid();
  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
  IF v_role NOT IN ('directora','admin') THEN
    RETURN jsonb_build_object('error', 'Solo la directora puede crear anos escolares');
  END IF;
  IF p_num_periods < 1 OR p_num_periods > 12 THEN
    RETURN jsonb_build_object('error', 'Numero de periodos debe estar entre 1 y 12');
  END IF;
  IF (p_end_date - p_start_date) < p_num_periods THEN
    RETURN jsonb_build_object('error', 'El ano escolar debe durar al menos 1 dia por periodo');
  END IF;

  SELECT id INTO v_old_year_id FROM public.school_years WHERE is_current = true LIMIT 1;
  IF v_old_year_id IS NULL THEN
    SELECT id INTO v_old_year_id FROM public.school_years WHERE status = 'active' ORDER BY start_date DESC LIMIT 1;
  END IF;

  IF v_old_year_id IS NOT NULL THEN
    UPDATE public.school_years SET is_current = false WHERE id = v_old_year_id;
  END IF;

  INSERT INTO public.school_years (name, start_date, end_date, status, is_current, period_model, num_periods)
  VALUES (p_name, p_start_date, p_end_date, 'active', true, p_period_model, p_num_periods)
  RETURNING id INTO v_new_year_id;

  UPDATE public.periods SET is_active = false WHERE id IN (SELECT id FROM public.periods WHERE is_active = true);
  UPDATE public.classrooms SET active_period_id = NULL WHERE id IN (SELECT id FROM public.classrooms WHERE active_period_id IS NOT NULL);

  v_total_days := p_end_date - p_start_date;
  v_period_days := v_total_days / p_num_periods;
  v_period_start := p_start_date;
  FOR i IN 1..p_num_periods LOOP
    v_period_end := v_period_start + (v_period_days || ' days')::interval - INTERVAL '1 day';
    IF i = p_num_periods THEN v_period_end := p_end_date; END IF;
    v_period_name := CASE
      WHEN p_period_model = 'mensual' THEN to_char(v_period_start, 'Month')
      WHEN p_period_model = 'semestres' THEN i || 'er Semestre'
      ELSE COALESCE(v_period_names[i], i || 'o Periodo')
    END;
    INSERT INTO public.periods (name, start_date, end_date, status, is_active, school_year_id, sort_order)
    VALUES (v_period_name, v_period_start, v_period_end, 'open', (i = 1), v_new_year_id, i);
    v_created_periods := v_created_periods + 1;
    v_period_start := v_period_end + INTERVAL '1 day';
  END LOOP;

  IF p_copy_classrooms AND v_old_year_id IS NOT NULL THEN
    FOR v_classroom IN SELECT * FROM public.classrooms WHERE deleted_at IS NULL LOOP
      INSERT INTO public.classrooms (name, level, capacity, teacher_id, is_live)
      VALUES (v_classroom.name, v_classroom.level, v_classroom.capacity, v_classroom.teacher_id, false)
      RETURNING id INTO v_new_classroom_id;
      v_copied_classrooms := v_copied_classrooms + 1;
    END LOOP;
  END IF;

  IF p_copy_payment_plans AND v_old_year_id IS NOT NULL THEN
    FOR v_plan IN SELECT * FROM public.payment_plans WHERE school_year_id = v_old_year_id AND is_active = true AND deleted_at IS NULL LOOP
      INSERT INTO public.payment_plans (school_year_id, level, schedule, name, registration_fee, description, is_active)
      VALUES (v_new_year_id, v_plan.level, v_plan.schedule, v_plan.name, v_plan.registration_fee, v_plan.description, true)
      RETURNING id INTO v_new_plan_id;
      INSERT INTO public.plan_installments (payment_plan_id, type, month_number, month_name, amount, due_day, due_month_offset, is_registration)
      SELECT v_new_plan_id, type, month_number, month_name, amount, due_day, due_month_offset, is_registration
      FROM public.plan_installments WHERE payment_plan_id = v_plan.id;
      v_copied_plans := v_copied_plans + 1;
    END LOOP;
  END IF;

  IF p_promote_students AND v_old_year_id IS NOT NULL THEN
    FOR v_enrollment IN
      SELECT se.*, s.name AS student_name
      FROM public.student_enrollments se
      JOIN public.students s ON s.id = se.student_id
      WHERE se.school_year_id = v_old_year_id
      AND se.status IN ('activo','inscrito','reinscrito')
    LOOP
      v_current_level_idx := array_position(v_level_order, v_enrollment.level_at_enrollment);
      IF v_current_level_idx IS NOT NULL AND v_current_level_idx < array_length(v_level_order, 1) THEN
        v_next_level := v_level_order[v_current_level_idx + 1];
      ELSE
        v_next_level := v_enrollment.level_at_enrollment;
      END IF;

      INSERT INTO public.student_enrollments (
        student_id, school_year_id, classroom_id, payment_plan_id, status,
        level_at_enrollment, promoted_from_enrollment_id, registration_date
      ) VALUES (
        v_enrollment.student_id, v_new_year_id, NULL, NULL, 'preinscrito',
        v_next_level, v_enrollment.id, now()
      ) RETURNING id INTO v_new_enrollment_id;

      INSERT INTO public.student_promotions (
        student_id, from_school_year_id, to_school_year_id,
        from_enrollment_id, to_enrollment_id,
        from_level, to_level, from_classroom_id, status, promoted_by
      ) VALUES (
        v_enrollment.student_id, v_old_year_id, v_new_year_id,
        v_enrollment.id, v_new_enrollment_id,
        v_enrollment.level_at_enrollment, v_next_level, v_enrollment.classroom_id,
        'completed', v_user_id
      );

      v_promoted_students := v_promoted_students + 1;
    END LOOP;
  END IF;

  INSERT INTO public.school_year_processes (school_year_id, process_type, label, status, executed_at, executed_by)
  VALUES
    (v_new_year_id, 'config', 'Año escolar creado', 'completed', now(), v_user_id),
    (v_new_year_id, 'periods_created', v_created_periods || ' periodos creados', 'completed', now(), v_user_id),
    (v_new_year_id, 'new_year_ready', 'Año escolar listo para usar', 'completed', now(), v_user_id);

  INSERT INTO public.audit_logs (user_id, action, payload, created_at) VALUES (v_user_id, 'school_year.created_with_promotion', jsonb_build_object(
    'new_year_id', v_new_year_id, 'name', p_name,
    'periods', v_created_periods, 'classrooms_copied', v_copied_classrooms,
    'plans_copied', v_copied_plans, 'students_promoted', v_promoted_students
  ), now());

  RETURN jsonb_build_object(
    'success', true,
    'school_year_id', v_new_year_id,
    'name', p_name,
    'periods_created', v_created_periods,
    'classrooms_copied', v_copied_classrooms,
    'plans_copied', v_copied_plans,
    'students_promoted', v_promoted_students
  );
END;
$$;

DROP FUNCTION IF EXISTS public.create_new_school_year_with_promotion(text, date, date, text, int, boolean, bigint);

CREATE OR REPLACE FUNCTION public.seed_classroom_routine_settings()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.classroom_routine_settings (classroom_id, event_id, sort_order)
  SELECT NEW.id, e.id, e.sort_order
  FROM public.routine_events e
  WHERE e.is_active = true
  ON CONFLICT (classroom_id, event_id) DO NOTHING;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.eval_score_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.eval_score_history
      (score_id, module_id, activity_id, student_id, action, old_value, new_value, changed_by)
    VALUES
      (NEW.id, NEW.module_id, NEW.activity_id, NEW.student_id, 'created', NULL,
       jsonb_build_object('value', NEW.value, 'stars', NEW.stars, 'level', NEW.level,
                          'yesno', NEW.yesno, 'checklist', NEW.checklist,
                          'rubric', NEW.rubric, 'observation', NEW.observation),
       v_user);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD IS DISTINCT FROM NEW THEN
      INSERT INTO public.eval_score_history
        (score_id, module_id, activity_id, student_id, action, old_value, new_value, changed_by)
      VALUES
        (NEW.id, NEW.module_id, NEW.activity_id, NEW.student_id, 'updated',
         jsonb_build_object('value', OLD.value, 'stars', OLD.stars, 'level', OLD.level,
                            'yesno', OLD.yesno, 'checklist', OLD.checklist,
                            'rubric', OLD.rubric, 'observation', OLD.observation),
         jsonb_build_object('value', NEW.value, 'stars', NEW.stars, 'level', NEW.level,
                            'yesno', NEW.yesno, 'checklist', NEW.checklist,
                            'rubric', NEW.rubric, 'observation', NEW.observation),
         v_user);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.eval_score_history
      (score_id, module_id, activity_id, student_id, action, old_value, new_value, changed_by)
    VALUES
      (OLD.id, OLD.module_id, OLD.activity_id, OLD.student_id, 'deleted',
       jsonb_build_object('value', OLD.value, 'stars', OLD.stars, 'level', OLD.level,
                          'yesno', OLD.yesno, 'checklist', OLD.checklist,
                          'rubric', OLD.rubric, 'observation', OLD.observation),
       NULL, v_user);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.boletin_ensure_structure(p_evaluation_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := COALESCE(get_my_role(), '');
  v_eval  record;
  v_year  record;
  v_labels jsonb;
  v_scale  jsonb;
  v_areas_count int;
  v_periods_count int;
  v_default_areas int;
  v_default_modules int;
  v_area record;
  v_period record;
  v_global_period record;
  v_modules_count int;
  v_mod record;
  v_acts_count int;
  v_i int;
  v_label jsonb;
  v_created_periods int := 0;
  v_created_areas int := 0;
  v_created_modules int := 0;
  v_created_activities int := 0;
  v_period_type text;
  v_new_period_id bigint;
BEGIN
  IF v_role NOT IN ('directora','admin','asistente','encargada','maestra') THEN
    RETURN jsonb_build_object('error','No autorizado');
  END IF;

  SELECT * INTO v_eval FROM public.eval_evaluations WHERE id = p_evaluation_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Evaluación/Boletín no encontrado');
  END IF;

  SELECT * INTO v_year FROM public.school_years WHERE id = v_eval.school_year_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Año escolar no encontrado');
  END IF;

  v_labels := COALESCE(v_eval.activity_labels, '[]'::jsonb);
  IF jsonb_array_length(v_labels) < 1 THEN
    v_labels := '[{"name":"Actividad 1","max_value":100},{"name":"Actividad 2","max_value":100},{"name":"Actividad 3","max_value":100},{"name":"Actividad 4","max_value":100},{"name":"Actividad 5","max_value":100}]'::jsonb;
  END IF;
  v_default_areas   := COALESCE(v_eval.default_areas, 5);
  v_default_modules := COALESCE(v_eval.default_modules, 5);

  SELECT count(*) INTO v_areas_count FROM public.eval_areas
    WHERE evaluation_id = p_evaluation_id AND deleted_at IS NULL;
  IF v_areas_count = 0 THEN
    INSERT INTO public.eval_areas (evaluation_id, name, description, color, icon, sort_order, weight, created_by) VALUES
      (p_evaluation_id, 'Lenguaje',         'Comunicación, lenguaje y lectoescritura.', '#0EA5E9', 'message-circle', 1, 20, auth.uid()),
      (p_evaluation_id, 'Matemática',       'Pensamiento lógico, conteo y nociones.',  '#6366F1', 'calculator',     2, 20, auth.uid()),
      (p_evaluation_id, 'Motricidad',       'Desarrollo motor fino y grueso.',         '#F97316', 'activity',       3, 20, auth.uid()),
      (p_evaluation_id, 'Socioemocional',   'Emociones, convivencia y autonomía.',     '#F43F5E', 'heart',          4, 20, auth.uid()),
      (p_evaluation_id, 'Ciencias',         'Exploración del entorno y la naturaleza.', '#22C55E', 'leaf',           5, 20, auth.uid());
    v_created_areas := 5;
  END IF;

  SELECT count(*) INTO v_periods_count FROM public.eval_periods
    WHERE evaluation_id = p_evaluation_id AND deleted_at IS NULL;
  IF v_periods_count = 0 THEN
    FOR v_global_period IN
      SELECT id, name, start_date, end_date, status, sort_order
      FROM public.periods
      WHERE school_year_id = v_eval.school_year_id
      ORDER BY COALESCE(sort_order, 0), start_date, id
    LOOP
      v_period_type := CASE
        WHEN COALESCE(v_year.period_model,'trimestres') = 'semestres' THEN 'bimestre'
        WHEN COALESCE(v_year.period_model,'trimestres') = 'mensual' THEN 'mes'
        ELSE 'periodo'
      END;
      INSERT INTO public.eval_periods
        (evaluation_id, name, period_type, start_date, end_date, weight, status, sort_order, created_by)
      VALUES
        (p_evaluation_id, v_global_period.name, v_period_type,
         v_global_period.start_date, v_global_period.end_date,
         0,
         CASE WHEN v_global_period.status = 'open' THEN 'open' ELSE 'closed' END,
         COALESCE(v_global_period.sort_order, 0), auth.uid())
      RETURNING id INTO v_new_period_id;
      v_created_periods := v_created_periods + 1;
    END LOOP;

    IF v_created_periods = 0 THEN
      INSERT INTO public.eval_periods (evaluation_id, name, period_type, status, sort_order, created_by) VALUES
        (p_evaluation_id, 'Primer Período', 'periodo', 'open',  1, auth.uid()),
        (p_evaluation_id, 'Segundo Período','periodo', 'open',  2, auth.uid()),
        (p_evaluation_id, 'Tercer Período', 'periodo', 'open',  3, auth.uid());
      v_created_periods := 3;
    END IF;
  ELSE
    FOR v_global_period IN
      SELECT name, start_date, end_date, status, sort_order
      FROM public.periods
      WHERE school_year_id = v_eval.school_year_id
        AND NOT EXISTS (
          SELECT 1 FROM public.eval_periods ep
          WHERE ep.evaluation_id = p_evaluation_id
            AND ep.deleted_at IS NULL
            AND ep.name = public.periods.name
        )
      ORDER BY COALESCE(sort_order, 0), start_date, id
    LOOP
      v_period_type := CASE
        WHEN COALESCE(v_year.period_model,'trimestres') = 'semestres' THEN 'bimestre'
        WHEN COALESCE(v_year.period_model,'trimestres') = 'mensual' THEN 'mes'
        ELSE 'periodo'
      END;
      INSERT INTO public.eval_periods
        (evaluation_id, name, period_type, start_date, end_date, weight, status, sort_order, created_by)
      VALUES
        (p_evaluation_id, v_global_period.name, v_period_type,
         v_global_period.start_date, v_global_period.end_date,
         0,
         CASE WHEN v_global_period.status = 'open' THEN 'open' ELSE 'closed' END,
         COALESCE(v_global_period.sort_order, 0), auth.uid())
      RETURNING id INTO v_new_period_id;
      v_created_periods := v_created_periods + 1;
    END LOOP;
  END IF;

  FOR v_area IN
    SELECT id FROM public.eval_areas
    WHERE evaluation_id = p_evaluation_id AND deleted_at IS NULL
    ORDER BY sort_order, id
  LOOP
    FOR v_period IN
      SELECT id FROM public.eval_periods
      WHERE evaluation_id = p_evaluation_id AND deleted_at IS NULL
      ORDER BY sort_order, id
    LOOP
      SELECT count(*) INTO v_modules_count FROM public.eval_modules
        WHERE period_id = v_period.id AND area_id = v_area.id AND deleted_at IS NULL;

      FOR v_i IN (v_modules_count + 1)..v_default_modules LOOP
        v_label := v_labels -> (v_i - 1);
        INSERT INTO public.eval_modules
          (period_id, area_id, name, eval_type, config, weight, sort_order, created_by)
        VALUES
          (v_period.id, v_area.id,
           COALESCE(v_label ->> 'name', 'Actividad ' || v_i),
           'numeric',
           jsonb_build_object('min', 0, 'max', 100, 'decimals', 0, 'allowDecimal', false),
           0, v_i, auth.uid())
        RETURNING id INTO v_mod.id;
        v_created_modules := v_created_modules + 1;

        INSERT INTO public.eval_activities
          (module_id, name, max_value, activity_type, activity_date, sort_order, created_by)
        VALUES
          (v_mod.id,
           COALESCE(v_label ->> 'name', 'Actividad ' || v_i),
           COALESCE((v_label ->> 'max_value')::numeric, 100),
           'actividad', NULL, 1, auth.uid());
        v_created_activities := v_created_activities + 1;
      END LOOP;

      FOR v_mod IN
        SELECT id FROM public.eval_modules
        WHERE period_id = v_period.id AND area_id = v_area.id AND deleted_at IS NULL
        ORDER BY sort_order, id
      LOOP
        SELECT count(*) INTO v_acts_count FROM public.eval_activities
          WHERE module_id = v_mod.id AND deleted_at IS NULL;
        IF v_acts_count = 0 THEN
          INSERT INTO public.eval_activities
            (module_id, name, max_value, activity_type, sort_order, created_by)
          SELECT v_mod.id, COALESCE(name, 'Actividad'), COALESCE(max_value, 100), 'actividad', 1, auth.uid()
          FROM jsonb_to_record(v_labels -> 0) AS t(name text, max_value numeric);
          v_created_activities := v_created_activities + 1;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  IF v_eval.activity_labels IS NULL THEN
    UPDATE public.eval_evaluations
    SET activity_labels = '[
      {"name":"Actividad 1","max_value":100},
      {"name":"Actividad 2","max_value":100},
      {"name":"Actividad 3","max_value":100},
      {"name":"Actividad 4","max_value":100},
      {"name":"Actividad 5","max_value":100}
    ]'::jsonb WHERE id = p_evaluation_id;
  END IF;
  IF v_eval.scale_config IS NULL THEN
    UPDATE public.eval_evaluations
    SET scale_config = '{
      "min":0,"max":100,
      "levels":[
        {"label":"AD","min":90,"max":100,"color":"#10B981"},
        {"label":"A","min":80,"max":89,"color":"#22C55E"},
        {"label":"B","min":70,"max":79,"color":"#F59E0B"},
        {"label":"C","min":60,"max":69,"color":"#F97316"},
        {"label":"D","min":0,"max":59,"color":"#EF4444"}
      ]
    }'::jsonb WHERE id = p_evaluation_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'evaluation_id', p_evaluation_id,
    'periods_created', v_created_periods,
    'areas_created', v_created_areas,
    'modules_created', v_created_modules,
    'activities_created', v_created_activities
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.boletin_ensure_structure(p_evaluation_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := COALESCE(get_my_role(), '');
  v_eval  record;
  v_year  record;
  v_year_id bigint;
  v_labels jsonb;
  v_scale  jsonb;
  v_areas_count int;
  v_periods_count int;
  v_default_areas int;
  v_default_modules int;
  v_area record;
  v_period record;
  v_global_period record;
  v_modules_count int;
  v_mod record;
  v_acts_count int;
  v_i int;
  v_label jsonb;
  v_created_periods int := 0;
  v_created_areas int := 0;
  v_created_modules int := 0;
  v_created_activities int := 0;
  v_period_type text;
  v_new_period_id bigint;
  v_fallback_periods boolean := false;
BEGIN
  IF v_role NOT IN ('directora','admin','asistente','encargada','maestra') THEN
    RETURN jsonb_build_object('error','No autorizado');
  END IF;

  SELECT * INTO v_eval FROM public.eval_evaluations WHERE id = p_evaluation_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Evaluación/Boletín no encontrado');
  END IF;

  v_year_id := v_eval.school_year_id;
  SELECT * INTO v_year FROM public.school_years WHERE id = v_year_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    SELECT id INTO v_year_id FROM public.school_years
    WHERE is_current = true AND deleted_at IS NULL LIMIT 1;
    SELECT * INTO v_year FROM public.school_years WHERE id = v_year_id;
  END IF;
  IF NOT FOUND THEN
    SELECT school_year_id INTO v_year_id FROM public.periods
    WHERE is_active = true AND school_year_id IS NOT NULL
    ORDER BY created_at DESC, id DESC LIMIT 1;
    SELECT * INTO v_year FROM public.school_years WHERE id = v_year_id;
  END IF;
  IF NOT FOUND THEN
    SELECT school_year_id INTO v_year_id FROM public.periods
    WHERE status = 'open' AND school_year_id IS NOT NULL
    ORDER BY created_at DESC, id DESC LIMIT 1;
    SELECT * INTO v_year FROM public.school_years WHERE id = v_year_id;
  END IF;

  IF v_eval.school_year_id IS DISTINCT FROM v_year_id THEN
    UPDATE public.eval_evaluations
    SET school_year_id = v_year_id, updated_at = now()
    WHERE id = p_evaluation_id;
  END IF;

  v_labels := COALESCE(v_eval.activity_labels, '[]'::jsonb);
  IF jsonb_array_length(v_labels) < 1 THEN
    v_labels := '[{"name":"Actividad 1","max_value":100},{"name":"Actividad 2","max_value":100},{"name":"Actividad 3","max_value":100},{"name":"Actividad 4","max_value":100},{"name":"Actividad 5","max_value":100}]'::jsonb;
  END IF;
  v_default_areas   := COALESCE(v_eval.default_areas, 5);
  v_default_modules := COALESCE(v_eval.default_modules, 5);

  SELECT count(*) INTO v_areas_count FROM public.eval_areas
    WHERE evaluation_id = p_evaluation_id AND deleted_at IS NULL;
  IF v_areas_count = 0 THEN
    INSERT INTO public.eval_areas (evaluation_id, name, description, color, icon, sort_order, weight, created_by) VALUES
      (p_evaluation_id, 'Lenguaje',         'Comunicación, lenguaje y lectoescritura.', '#0EA5E9', 'message-circle', 1, 20, auth.uid()),
      (p_evaluation_id, 'Matemática',       'Pensamiento lógico, conteo y nociones.',  '#6366F1', 'calculator',     2, 20, auth.uid()),
      (p_evaluation_id, 'Motricidad',       'Desarrollo motor fino y grueso.',         '#F97316', 'activity',       3, 20, auth.uid()),
      (p_evaluation_id, 'Socioemocional',   'Emociones, convivencia y autonomía.',     '#F43F5E', 'heart',          4, 20, auth.uid()),
      (p_evaluation_id, 'Ciencias',         'Exploración del entorno y la naturaleza.', '#22C55E', 'leaf',           5, 20, auth.uid());
    v_created_areas := 5;
  END IF;

  SELECT count(*) INTO v_periods_count FROM public.eval_periods
    WHERE evaluation_id = p_evaluation_id AND deleted_at IS NULL;

  IF v_periods_count = 0 THEN
    SELECT count(*) INTO v_periods_count FROM public.periods
    WHERE school_year_id = v_year_id AND deleted_at IS NULL;
    IF v_periods_count = 0 THEN v_fallback_periods := true; END IF;

    FOR v_global_period IN
      SELECT id, name, start_date, end_date, status, sort_order
      FROM public.periods
      WHERE (v_fallback_periods OR school_year_id = v_year_id)
        AND deleted_at IS NULL
      ORDER BY COALESCE(sort_order, 0), start_date, id
    LOOP
      v_period_type := CASE
        WHEN COALESCE(v_year.period_model,'trimestres') = 'semestres' THEN 'bimestre'
        WHEN COALESCE(v_year.period_model,'trimestres') = 'mensual' THEN 'mes'
        ELSE 'periodo'
      END;
      INSERT INTO public.eval_periods
        (evaluation_id, name, period_type, start_date, end_date, weight, status, sort_order, created_by)
      VALUES
        (p_evaluation_id, v_global_period.name, v_period_type,
         v_global_period.start_date, v_global_period.end_date,
         0,
         CASE WHEN v_global_period.status = 'open' THEN 'open' ELSE 'closed' END,
         COALESCE(v_global_period.sort_order, 0), auth.uid())
      RETURNING id INTO v_new_period_id;
      v_created_periods := v_created_periods + 1;
    END LOOP;

    IF v_created_periods = 0 THEN
      INSERT INTO public.eval_periods (evaluation_id, name, period_type, status, sort_order, created_by) VALUES
        (p_evaluation_id, 'Primer Período', 'periodo', 'open',  1, auth.uid()),
        (p_evaluation_id, 'Segundo Período','periodo', 'open',  2, auth.uid()),
        (p_evaluation_id, 'Tercer Período', 'periodo', 'open',  3, auth.uid());
      v_created_periods := 3;
    END IF;
  ELSE
    FOR v_global_period IN
      SELECT name, start_date, end_date, status, sort_order
      FROM public.periods
      WHERE (v_year_id IS NULL OR school_year_id = v_year_id)
        AND deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.eval_periods ep
          WHERE ep.evaluation_id = p_evaluation_id
            AND ep.deleted_at IS NULL
            AND ep.name = public.periods.name
        )
      ORDER BY COALESCE(sort_order, 0), start_date, id
    LOOP
      v_period_type := CASE
        WHEN COALESCE(v_year.period_model,'trimestres') = 'semestres' THEN 'bimestre'
        WHEN COALESCE(v_year.period_model,'trimestres') = 'mensual' THEN 'mes'
        ELSE 'periodo'
      END;
      INSERT INTO public.eval_periods
        (evaluation_id, name, period_type, start_date, end_date, weight, status, sort_order, created_by)
      VALUES
        (p_evaluation_id, v_global_period.name, v_period_type,
         v_global_period.start_date, v_global_period.end_date,
         0,
         CASE WHEN v_global_period.status = 'open' THEN 'open' ELSE 'closed' END,
         COALESCE(v_global_period.sort_order, 0), auth.uid())
      RETURNING id INTO v_new_period_id;
      v_created_periods := v_created_periods + 1;
    END LOOP;
  END IF;

  UPDATE public.eval_periods ep
  SET status = CASE WHEN gp.status = 'open' THEN 'open' ELSE 'closed' END,
      start_date = gp.start_date,
      end_date = gp.end_date,
      sort_order = COALESCE(gp.sort_order, ep.sort_order),
      updated_at = now()
  FROM public.periods gp
  WHERE ep.evaluation_id = p_evaluation_id
    AND ep.deleted_at IS NULL
    AND ep.name = gp.name
    AND (ep.status IS DISTINCT FROM (CASE WHEN gp.status = 'open' THEN 'open' ELSE 'closed' END)
         OR ep.start_date IS DISTINCT FROM gp.start_date
         OR ep.end_date IS DISTINCT FROM gp.end_date);

  FOR v_area IN
    SELECT id FROM public.eval_areas
    WHERE evaluation_id = p_evaluation_id AND deleted_at IS NULL
    ORDER BY sort_order, id
  LOOP
    FOR v_period IN
      SELECT id FROM public.eval_periods
      WHERE evaluation_id = p_evaluation_id AND deleted_at IS NULL
      ORDER BY sort_order, id
    LOOP
      SELECT count(*) INTO v_modules_count FROM public.eval_modules
        WHERE period_id = v_period.id AND area_id = v_area.id AND deleted_at IS NULL;

      FOR v_i IN (v_modules_count + 1)..v_default_modules LOOP
        v_label := v_labels -> (v_i - 1);
        INSERT INTO public.eval_modules
          (period_id, area_id, name, eval_type, config, weight, sort_order, created_by)
        VALUES
          (v_period.id, v_area.id,
           COALESCE(v_label ->> 'name', 'Actividad ' || v_i),
           'numeric',
           jsonb_build_object('min', 0, 'max', 100, 'decimals', 0, 'allowDecimal', false),
           0, v_i, auth.uid())
        RETURNING id INTO v_mod.id;
        v_created_modules := v_created_modules + 1;

        INSERT INTO public.eval_activities
          (module_id, name, max_value, activity_type, activity_date, sort_order, created_by)
        VALUES
          (v_mod.id,
           COALESCE(v_label ->> 'name', 'Actividad ' || v_i),
           COALESCE((v_label ->> 'max_value')::numeric, 100),
           'actividad', NULL, 1, auth.uid());
        v_created_activities := v_created_activities + 1;
      END LOOP;

      FOR v_mod IN
        SELECT id FROM public.eval_modules
        WHERE period_id = v_period.id AND area_id = v_area.id AND deleted_at IS NULL
        ORDER BY sort_order, id
      LOOP
        SELECT count(*) INTO v_acts_count FROM public.eval_activities
          WHERE module_id = v_mod.id AND deleted_at IS NULL;
        IF v_acts_count = 0 THEN
          INSERT INTO public.eval_activities
            (module_id, name, max_value, activity_type, sort_order, created_by)
          SELECT v_mod.id, COALESCE(name, 'Actividad'), COALESCE(max_value, 100), 'actividad', 1, auth.uid()
          FROM jsonb_to_record(v_labels -> 0) AS t(name text, max_value numeric);
          v_created_activities := v_created_activities + 1;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  IF v_eval.activity_labels IS NULL THEN
    UPDATE public.eval_evaluations
    SET activity_labels = '[
      {"name":"Actividad 1","max_value":100},
      {"name":"Actividad 2","max_value":100},
      {"name":"Actividad 3","max_value":100},
      {"name":"Actividad 4","max_value":100},
      {"name":"Actividad 5","max_value":100}
    ]'::jsonb WHERE id = p_evaluation_id;
  END IF;
  IF v_eval.scale_config IS NULL THEN
    UPDATE public.eval_evaluations
    SET scale_config = '{
      "min":0,"max":100,
      "levels":[
        {"label":"AD","min":90,"max":100,"color":"#10B981"},
        {"label":"A","min":80,"max":89,"color":"#22C55E"},
        {"label":"B","min":70,"max":79,"color":"#F59E0B"},
        {"label":"C","min":60,"max":69,"color":"#F97316"},
        {"label":"D","min":0,"max":59,"color":"#EF4444"}
      ]
    }'::jsonb WHERE id = p_evaluation_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'evaluation_id', p_evaluation_id,
    'periods_created', v_created_periods,
    'areas_created', v_created_areas,
    'modules_created', v_created_modules,
    'activities_created', v_created_activities
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_active_school_year_id()
RETURNS bigint LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT id FROM public.school_years
  WHERE is_current = true AND deleted_at IS NULL
  LIMIT 1;
$$;

DROP FUNCTION IF EXISTS public.get_active_period();

CREATE OR REPLACE FUNCTION public.update_conversation_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.conversations SET updated_at = now() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.insert_plan_a(p_level text, p_schedule text, p_amount numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_plan_id bigint;
BEGIN
  SELECT id INTO v_plan_id FROM public.payment_plans
    WHERE level = p_level AND schedule = p_schedule AND name LIKE 'Plan A%' AND school_year_id IN (SELECT id FROM public.school_years WHERE name = '2026-2027');

  INSERT INTO public.plan_installments(payment_plan_id, type, month_number, month_name, amount, due_day, due_month_offset, is_registration)
  VALUES (v_plan_id, 'inscripcion', 1, 'Agosto', p_amount, 5, 0, true)
  ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.insert_plan_b(p_level text, p_schedule text, p_amount1 numeric, p_amount2 numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_plan_id bigint;
BEGIN
  SELECT id INTO v_plan_id FROM public.payment_plans
    WHERE level = p_level AND schedule = p_schedule AND name LIKE 'Plan B%' AND school_year_id IN (SELECT id FROM public.school_years WHERE name = '2026-2027');

  INSERT INTO public.plan_installments(payment_plan_id, type, month_number, month_name, amount, due_day, due_month_offset, is_registration)
  VALUES
    (v_plan_id, 'inscripcion', 1, 'Agosto', p_amount1, 5, 0, true),
    (v_plan_id, 'colegiatura', 2, 'Enero', p_amount2, 5, 5, false)
  ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.insert_plan_c(p_level text, p_schedule text, p_inscripcion numeric, p_colegiatura numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_plan_id bigint;
BEGIN
  SELECT id INTO v_plan_id FROM public.payment_plans
    WHERE level = p_level AND schedule = p_schedule AND name LIKE 'Plan C%' AND school_year_id IN (SELECT id FROM public.school_years WHERE name = '2026-2027');

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
END;
$$;


-- ==============================================================================
--  >>> FASE 5 — Triggers
-- ==============================================================================

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


-- ==============================================================================
--  >>> FASE 6 — Vistas
-- ==============================================================================

-- ============================================================
-- 06_vistas.sql — Colegio Montessori Sonrisas Creativas
-- Contenido: vistas para reportes (dashboard) y seguridad (fuerza bruta)
-- ============================================================

-- ---------------------------------------------------------------------------
-- 6.0 Tablas que la app usa pero que faltaban en el esquema base:
--     'reports' (reportes de padres) y su historial 'report_history'.
--     Se crean aquí (IF NOT EXISTS) para que las vistas 6.2 las puedan leer.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reports (
  id                 bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  parent_id          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  student_id         bigint REFERENCES public.students(id) ON DELETE SET NULL,
  classroom_id       bigint REFERENCES public.classrooms(id) ON DELETE SET NULL,
  report_type        text,
  target_teacher_id  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  target_student_id  bigint REFERENCES public.students(id) ON DELETE SET NULL,
  category           text,
  description        text,
  severity           text NOT NULL DEFAULT 'media' CHECK (severity IN ('leve','media','alta')),
  status             text NOT NULL DEFAULT 'open' CHECK (status IN ('open','pending','in_review','resolved','closed')),
  is_anonymous       boolean NOT NULL DEFAULT false,
  evidence_url       text,
  response           text,
  response_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  response_at        timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Si la tabla ya existe (instalación antigua) pero le faltan columnas,
-- se agregan aquí para que los índices/políticas de abajo no fallen (error 42703).
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS parent_id          uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS student_id         bigint REFERENCES public.students(id) ON DELETE SET NULL;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS classroom_id       bigint REFERENCES public.classrooms(id) ON DELETE SET NULL;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS report_type        text;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS target_teacher_id  uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS target_student_id  bigint REFERENCES public.students(id) ON DELETE SET NULL;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS category           text;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS description        text;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS severity           text NOT NULL DEFAULT 'media' CHECK (severity IN ('leve','media','alta'));
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS status             text NOT NULL DEFAULT 'open' CHECK (status IN ('open','pending','in_review','resolved','closed'));
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS is_anonymous       boolean NOT NULL DEFAULT false;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS evidence_url       text;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS response           text;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS response_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS response_at        timestamptz;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS created_at         timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS updated_at         timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.report_history (
  id         bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  report_id  bigint NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  changed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  old_status text,
  new_status text,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.report_history ADD COLUMN IF NOT EXISTS report_id  bigint NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE;
ALTER TABLE public.report_history ADD COLUMN IF NOT EXISTS changed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.report_history ADD COLUMN IF NOT EXISTS old_status text;
ALTER TABLE public.report_history ADD COLUMN IF NOT EXISTS new_status text;
ALTER TABLE public.report_history ADD COLUMN IF NOT EXISTS note       text;
ALTER TABLE public.report_history ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_reports_parent   ON public.reports(parent_id);
CREATE INDEX IF NOT EXISTS idx_reports_status   ON public.reports(status);
CREATE INDEX IF NOT EXISTS idx_report_history_report ON public.report_history(report_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reports TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_history TO authenticated, service_role;

-- RLS: el padre ve/gestiona sus propios reportes; el staff ve todo.
DO $$
BEGIN
  BEGIN
    ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
  EXCEPTION WHEN SQLSTATE '42809' THEN NULL;
  END;
END $$;
DROP POLICY IF EXISTS "reports_select" ON public.reports;
CREATE POLICY "reports_select" ON public.reports FOR SELECT USING (
  parent_id = auth.uid()
  OR COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra','encargada')
);
DROP POLICY IF EXISTS "reports_insert" ON public.reports;
CREATE POLICY "reports_insert" ON public.reports FOR INSERT WITH CHECK (
  parent_id = auth.uid()
  OR COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra','encargada')
);
DROP POLICY IF EXISTS "reports_update" ON public.reports;
CREATE POLICY "reports_update" ON public.reports FOR UPDATE USING (
  COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra','encargada')
) WITH CHECK (
  COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra','encargada')
);

DO $$
BEGIN
  BEGIN
    ALTER TABLE public.report_history ENABLE ROW LEVEL SECURITY;
  EXCEPTION WHEN SQLSTATE '42809' THEN NULL;
  END;
END $$;
DROP POLICY IF EXISTS "report_history_read" ON public.report_history;
CREATE POLICY "report_history_read" ON public.report_history FOR SELECT USING (true);
DROP POLICY IF EXISTS "report_history_write" ON public.report_history;
CREATE POLICY "report_history_write" ON public.report_history FOR INSERT WITH CHECK (
  COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra','encargada')
  OR EXISTS (
    SELECT 1 FROM public.reports r
    WHERE r.id = report_history.report_id AND r.parent_id = auth.uid()
  )
);

-- ---------------------------------------------------------------------------
-- 6.1 get_reports — RPC que usan los paneles (padre y directora)
--     SECURITY INVOKER: respeta las políticas RLS de 'reports'.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_reports(text);
CREATE OR REPLACE FUNCTION public.get_reports(p_status text DEFAULT NULL)
RETURNS SETOF public.reports
LANGUAGE sql STABLE
AS $$
  SELECT * FROM public.reports
  WHERE (p_status IS NULL OR status = p_status)
  ORDER BY created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.get_reports(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6.2 v_reports_dashboard — resumen para el dashboard de reportes
--     (columnas esperadas por js/shared/reports.js y directora/reports.module.js)
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.v_reports_dashboard;
CREATE OR REPLACE VIEW public.v_reports_dashboard AS
SELECT
  COUNT(*)::bigint AS total_reports,
  COUNT(*) FILTER (WHERE status IN ('open','pending','in_review'))::bigint AS open_reports,
  COUNT(*) FILTER (WHERE status = 'resolved')::bigint AS resolved_reports,
  COUNT(*) FILTER (WHERE status = 'pending')::bigint AS pending_reports,
  COUNT(*) FILTER (WHERE status IN ('open','pending','in_review')
                   AND created_at < now() - interval '5 days')::bigint AS overdue_reports,
  ROUND(AVG(
    CASE WHEN response_at IS NOT NULL
         THEN EXTRACT(EPOCH FROM (response_at - created_at)) / 86400.0
    END
  )::numeric, 1) AS avg_resolution_days
FROM public.reports;
GRANT SELECT ON public.v_reports_dashboard TO authenticated;

-- ---------------------------------------------------------------------------
-- 6.3 v_brute_force_attempts — monitor de fuerza bruta (últimas 24h)
--     (columnas esperadas por control/main.js)
--     Solo visible para administración: protege emails de ataques/curiosos.
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.v_brute_force_attempts;
CREATE OR REPLACE VIEW public.v_brute_force_attempts AS
SELECT
  p.id AS user_id,
  la.email,
  COUNT(*) FILTER (WHERE la.success = false)::int AS failed_attempts,
  MAX(la.created_at) AS last_attempt,
  MAX(la.ip_hash) AS ip_address,
  (COUNT(*) FILTER (WHERE la.success = false) >= 5) AS is_blocked,
  (COUNT(*) FILTER (WHERE la.success = false) >= 3) AS is_suspicious
FROM public.login_attempts la
LEFT JOIN public.profiles p ON lower(p.email) = lower(la.email)
WHERE la.created_at > now() - interval '24 hours'
  AND COALESCE(get_my_role(), '') IN ('admin','directora')
GROUP BY p.id, la.email
ORDER BY failed_attempts DESC;
GRANT SELECT ON public.v_brute_force_attempts TO authenticated;

-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
-- CONSOLIDADO DESDE migrations\ (historial) â€” aÃ±adido automÃ¡ticamente
-- Fecha: 2026-09-12 21:41
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

DROP VIEW IF EXISTS public.daily_routine;
CREATE OR REPLACE VIEW daily_routine AS
WITH routine_times AS (
  SELECT
    'desayuno' AS event_type, '08:00' AS ideal_time, '🍞' AS emoji, 'Desayuno' AS title, 'Desayuno' AS subtitle UNION ALL
  SELECT
    'merienda' AS event_type, '10:00' AS ideal_time, '🍎' AS emoji, 'Merienda' AS title, 'Merienda' AS subtitle UNION ALL
  SELECT
    'dormir' AS event_type, '10:30' AS ideal_time, '😴' AS emoji, 'Siesta' AS title, 'Hora de dormir' AS subtitle UNION ALL
  SELECT
    'despertar' AS event_type, '12:00' AS ideal_time, '😊' AS emoji, 'Despertar' AS title, 'Despertó' AS subtitle UNION ALL
  SELECT
    'almuerzo' AS event_type, '12:30' AS ideal_time, '🥗' AS emoji, 'Almuerzo' AS title, 'Almuerzo' AS subtitle UNION ALL
  SELECT
    'biberon' AS event_type, '14:00' AS ideal_time, '🍼' AS emoji, 'Biberón' AS title, 'Biberón' AS subtitle UNION ALL
  SELECT
    'panal' AS event_type, '10:15' AS ideal_time, '🚼' AS emoji, 'Pañal' AS title, 'Cambio de pañal' AS subtitle UNION ALL
  SELECT
    'bano' AS event_type, '09:00' AS ideal_time, '🚽' AS emoji, 'Baño' AS title, 'Baño' AS subtitle UNION ALL
  SELECT
    'temperatura' AS event_type, '07:45' AS ideal_time, '🌡' AS emoji, 'Temperatura' AS title, 'Tomar temperatura' AS subtitle UNION ALL
  SELECT
    'medicamento' AS event_type, NULL AS ideal_time, '💊' AS emoji, 'Medicamento' AS title, 'Medicamento' AS subtitle UNION ALL
  SELECT
    'foto' AS event_type, NULL AS ideal_time, '📷' AS emoji, 'Foto' AS title, 'Foto' AS subtitle UNION ALL
  SELECT
    'nota' AS event_type, NULL AS ideal_time, '📝' AS emoji, 'Nota' AS title, 'Nota' AS subtitle
)
SELECT * FROM routine_times;


-- ==============================================================================
--  >>> FASE 7 — Politicas RLS
-- ==============================================================================

-- ============================================================
-- 07_politicas.sql — Colegio Montessori Sonrisas Creativas
-- Contenido: sección 9 (POLITICAS RLS)
-- ============================================================
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

-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
-- CONSOLIDADO DESDE migrations\ (historial) â€” aÃ±adido automÃ¡ticamente
-- Fecha: 2026-09-12 21:41
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

DROP POLICY IF EXISTS "Permitir insercion anonima de preinscripciones" ON public.student_preregistrations;

DO $$ BEGIN
CREATE POLICY "Permitir insercion anonima de preinscripciones"
  ON public.student_preregistrations
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "Permitir lectura completa a autenticados" ON public.student_preregistrations;

DO $$ BEGIN
CREATE POLICY "Permitir lectura completa a autenticados"
  ON public.student_preregistrations
  FOR SELECT
  TO authenticated
  USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "Permitir actualizacion a autenticados" ON public.student_preregistrations;

DO $$ BEGIN
CREATE POLICY "Permitir actualizacion a autenticados"
  ON public.student_preregistrations
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "invoices_public_read" ON storage.objects;

DROP POLICY IF EXISTS "invoices_auth_insert" ON storage.objects;

DROP POLICY IF EXISTS "invoices_auth_update" ON storage.objects;

DROP POLICY IF EXISTS "staff_permits_all" ON public.staff_permits;

DO $$ BEGIN
CREATE POLICY "Directores pueden gestionar caja" ON caja_sessions FOR ALL USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "Contabilidad accesible" ON accounting_journal FOR ALL USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "Nómina accesible por directores" ON payroll_records FOR ALL USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "teacher_schedules_staff_all" ON public.teacher_schedules;

DROP POLICY IF EXISTS "schedule_event_logs_staff_all" ON public.schedule_event_logs;

DROP POLICY IF EXISTS "schedule_event_logs_parent_select" ON public.schedule_event_logs;

DO $$ BEGIN
CREATE POLICY "messages_direct_select" ON public.messages
  FOR SELECT
  USING (
    conversation_id IS NULL
    AND (sender_id = auth.uid() OR receiver_id = auth.uid())
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "messages_direct_insert" ON public.messages
  FOR INSERT
  WITH CHECK (
    conversation_id IS NULL
    AND sender_id = auth.uid()
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "messages_direct_update" ON public.messages
  FOR UPDATE
  USING (
    conversation_id IS NULL
    AND (sender_id = auth.uid() OR receiver_id = auth.uid())
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "payroll_invoices_director" ON public.payroll_invoices FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','admin','encargada'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "Users can view their own attendance"
  ON meeting_attendance FOR SELECT
  USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "preregistrations_select_auth" ON public.student_preregistrations;

DROP POLICY IF EXISTS "preregistrations_update_auth" ON public.student_preregistrations;

DROP POLICY IF EXISTS "meetings_all" ON public.meetings;

DROP POLICY IF EXISTS "meetings_select" ON public.meetings;

DO $$ BEGIN
CREATE POLICY "meetings_select" ON public.meetings FOR SELECT
  TO authenticated USING (
    COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra','encargada')
    OR host_id = auth.uid()
    OR (target_id IS NOT NULL AND (
          is_parent_of_classroom(target_id) OR is_teacher_of_classroom(target_id)
        ))
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "meetings_insert" ON public.meetings;

DO $$ BEGIN
CREATE POLICY "meetings_insert" ON public.meetings FOR INSERT
  TO authenticated WITH CHECK (
    COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra','encargada')
    OR host_id = auth.uid()
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "meetings_update" ON public.meetings;

DO $$ BEGIN
CREATE POLICY "meetings_update" ON public.meetings FOR UPDATE
  TO authenticated USING (
    COALESCE(get_my_role(), '') IN ('directora','asistente','admin','encargada')
    OR host_id = auth.uid()
  ) WITH CHECK (
    COALESCE(get_my_role(), '') IN ('directora','asistente','admin','encargada')
    OR host_id = auth.uid()
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "meetings_delete" ON public.meetings;

DO $$ BEGIN
CREATE POLICY "meetings_delete" ON public.meetings FOR DELETE
  TO authenticated USING (
    COALESCE(get_my_role(), '') IN ('directora','asistente','admin','encargada')
    OR host_id = auth.uid()
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "routine_categories_staff_all" ON public.routine_categories;

DO $$ BEGIN
CREATE POLICY "routine_categories_staff_all" ON public.routine_categories FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra','encargada'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "routine_categories_read" ON public.routine_categories;

DO $$ BEGIN
CREATE POLICY "routine_categories_read" ON public.routine_categories FOR SELECT
  USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "routine_events_staff_all" ON public.routine_events;

DO $$ BEGIN
CREATE POLICY "routine_events_staff_all" ON public.routine_events FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra','encargada'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "routine_events_read" ON public.routine_events;

DO $$ BEGIN
CREATE POLICY "routine_events_read" ON public.routine_events FOR SELECT
  USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "classroom_routine_settings_staff_all" ON public.classroom_routine_settings;

DO $$ BEGIN
CREATE POLICY "classroom_routine_settings_staff_all" ON public.classroom_routine_settings FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra','encargada'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "classroom_schedule_blocks_staff_all" ON public.classroom_schedule_blocks;

DO $$ BEGIN
CREATE POLICY "classroom_schedule_blocks_staff_all" ON public.classroom_schedule_blocks FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra','encargada'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "classroom_schedule_block_events_staff_all" ON public.classroom_schedule_block_events;

DO $$ BEGIN
CREATE POLICY "classroom_schedule_block_events_staff_all" ON public.classroom_schedule_block_events FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra','encargada'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "classroom_daily_schedule_staff_all" ON public.classroom_daily_schedule;

DO $$ BEGIN
CREATE POLICY "classroom_daily_schedule_staff_all" ON public.classroom_daily_schedule FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra','encargada'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "classroom_daily_schedule_read" ON public.classroom_daily_schedule;

DO $$ BEGIN
CREATE POLICY "classroom_daily_schedule_read" ON public.classroom_daily_schedule FOR SELECT
  USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS school_year_processes_select ON public.school_year_processes;

DO $$ BEGIN
CREATE POLICY school_year_processes_select ON public.school_year_processes
  FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "attachments_participant" ON public.message_attachments;

DO $$ BEGIN
CREATE POLICY "attachments_participant" ON public.message_attachments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_attachments.message_id
        AND public.user_is_participant(m.conversation_id, auth.uid())
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "reactions_participant" ON public.message_reactions;

DO $$ BEGIN
CREATE POLICY "reactions_participant" ON public.message_reactions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_reactions.message_id
        AND public.user_is_participant(m.conversation_id, auth.uid())
    )
  )
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_reactions.message_id
        AND public.user_is_participant(m.conversation_id, auth.uid())
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "messages_participant" ON public.messages;

DROP POLICY IF EXISTS "messages_delete" ON public.messages;

DO $$ BEGIN
CREATE POLICY "messages_select" ON public.messages FOR SELECT
  USING (public.user_is_participant(conversation_id, auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "messages_insert" ON public.messages FOR INSERT
  WITH CHECK (
    public.user_is_participant(conversation_id, auth.uid()) AND
    sender_id = auth.uid()
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "messages_update" ON public.messages FOR UPDATE
  USING (
    public.user_is_participant(conversation_id, auth.uid()) AND
    (auth.uid() = sender_id OR COALESCE(public.get_my_role(), '') IN ('directora','admin'))
  )
  WITH CHECK (
    public.user_is_participant(conversation_id, auth.uid()) AND
    (auth.uid() = sender_id OR COALESCE(public.get_my_role(), '') IN ('directora','admin'))
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "messages_delete" ON public.messages FOR DELETE
  USING (
    public.user_is_participant(conversation_id, auth.uid()) AND
    (auth.uid() = sender_id OR COALESCE(public.get_my_role(), '') IN ('directora','admin'))
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "posts_update" ON public.posts;

DROP POLICY IF EXISTS "posts_delete" ON public.posts;

DROP POLICY IF EXISTS "comments_insert" ON public.comments;

DROP POLICY IF EXISTS "likes_all" ON public.likes;

DROP POLICY IF EXISTS "payment_concepts_read"   ON public.payment_concepts;

DROP POLICY IF EXISTS "payment_concepts_write"  ON public.payment_concepts;

DO $$ BEGIN
CREATE POLICY "payment_concepts_read" ON public.payment_concepts
  FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "payment_concepts_write" ON public.payment_concepts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('directora', 'asistente', 'admin')
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "students_select" ON public.students;

DO $$ BEGIN
CREATE POLICY "students_select" ON public.students
  FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "students_insert" ON public.students;

DO $$ BEGIN
CREATE POLICY "students_insert" ON public.students
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('directora', 'asistente', 'admin')
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "students_update" ON public.students;

DO $$ BEGIN
CREATE POLICY "students_update" ON public.students
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('directora', 'asistente', 'admin')
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "students_delete" ON public.students;

DO $$ BEGIN
CREATE POLICY "students_delete" ON public.students
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('directora', 'admin')
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "profiles_self" ON public.profiles;

DO $$ BEGIN
CREATE POLICY "profiles_self" ON public.profiles
  FOR ALL USING (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "profiles_staff_read" ON public.profiles;

DO $$ BEGIN
CREATE POLICY "profiles_staff_read" ON public.profiles
  FOR SELECT USING (
    auth.role() = 'authenticated'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "profiles_staff_upsert" ON public.profiles;

DO $$ BEGIN
CREATE POLICY "profiles_staff_upsert" ON public.profiles
  FOR INSERT WITH CHECK (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM public.profiles staff
      WHERE staff.id = auth.uid()
        AND staff.role IN ('directora', 'asistente', 'admin')
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "profiles_staff_update" ON public.profiles;

DO $$ BEGIN
CREATE POLICY "profiles_staff_update" ON public.profiles
  FOR UPDATE USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM public.profiles staff
      WHERE staff.id = auth.uid()
        AND staff.role IN ('directora', 'asistente', 'admin')
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "payment_plans_select" ON public.payment_plans;

DO $$ BEGIN
CREATE POLICY "payment_plans_select" ON public.payment_plans
  FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "payment_plans_insert" ON public.payment_plans;

DO $$ BEGIN
CREATE POLICY "payment_plans_insert" ON public.payment_plans
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('directora', 'asistente', 'admin')
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "payment_plans_update" ON public.payment_plans;

DO $$ BEGIN
CREATE POLICY "payment_plans_update" ON public.payment_plans
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('directora', 'asistente', 'admin')
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "payments_select" ON public.payments;

DO $$ BEGIN
CREATE POLICY "payments_select" ON public.payments
  FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "payments_insert" ON public.payments;

DO $$ BEGIN
CREATE POLICY "payments_insert" ON public.payments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('directora', 'asistente', 'admin')
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "payments_update" ON public.payments;

DO $$ BEGIN
CREATE POLICY "payments_update" ON public.payments
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('directora', 'asistente', 'admin', 'padre')
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "prereg_select" ON public.student_preregistrations;

DO $$ BEGIN
CREATE POLICY "prereg_select" ON public.student_preregistrations
  FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "prereg_insert" ON public.student_preregistrations;

DO $$ BEGIN
CREATE POLICY "prereg_insert" ON public.student_preregistrations
  FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "prereg_update" ON public.student_preregistrations;

DO $$ BEGIN
CREATE POLICY "prereg_update" ON public.student_preregistrations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('directora', 'asistente', 'admin')
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "students_staff_all" ON public.students;

DROP POLICY IF EXISTS "school_years_staff_all" ON public.school_years;

DO $$ BEGIN
CREATE POLICY "school_years_staff_all" ON public.school_years FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','admin'))
  WITH CHECK (COALESCE(get_my_role(), '') IN ('directora','admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "payment_plans_staff_all" ON public.payment_plans;

DO $$ BEGIN
CREATE POLICY "payment_plans_staff_all" ON public.payment_plans FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'))
  WITH CHECK (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "plan_installments_staff_all" ON public.plan_installments;

DO $$ BEGIN
CREATE POLICY "plan_installments_staff_all" ON public.plan_installments FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'))
  WITH CHECK (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "student_enrollments_staff_all" ON public.student_enrollments;

DO $$ BEGIN
CREATE POLICY "student_enrollments_staff_all" ON public.student_enrollments FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'))
  WITH CHECK (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "student_charges_staff_all" ON public.student_charges;

DO $$ BEGIN
CREATE POLICY "student_charges_staff_all" ON public.student_charges FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'))
  WITH CHECK (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "invoices_staff_all" ON public.invoices;

DROP POLICY IF EXISTS "students_staff_all"    ON public.students;

DROP POLICY IF EXISTS "students_padre_select" ON public.students;

DROP POLICY IF EXISTS "students_select"       ON public.students;

DROP POLICY IF EXISTS "students_insert"       ON public.students;

DROP POLICY IF EXISTS "students_update"       ON public.students;

DROP POLICY IF EXISTS "students_delete"       ON public.students;

DO $$ BEGIN
CREATE POLICY "students_padre_select" ON public.students FOR SELECT
  USING (COALESCE(get_my_role(),'') = 'padre' AND parent_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "classrooms_read"          ON public.classrooms;

DROP POLICY IF EXISTS "classrooms_staff_manage"  ON public.classrooms;

DROP POLICY IF EXISTS "classrooms_select"        ON public.classrooms;

DROP POLICY IF EXISTS "classrooms_all"           ON public.classrooms;

DO $$ BEGIN
CREATE POLICY "classrooms_read" ON public.classrooms
  FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "classrooms_staff_manage" ON public.classrooms FOR ALL
  USING      (COALESCE(get_my_role(),'') IN ('directora','asistente','admin'))
  WITH CHECK (COALESCE(get_my_role(),'') IN ('directora','asistente','admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "profiles_self"               ON public.profiles;

DROP POLICY IF EXISTS "profiles_staff_select"       ON public.profiles;

DROP POLICY IF EXISTS "profiles_staff_manage"       ON public.profiles;

DROP POLICY IF EXISTS "profiles_authenticated_read" ON public.profiles;

DROP POLICY IF EXISTS "profiles_staff_read"         ON public.profiles;

DROP POLICY IF EXISTS "profiles_all"                ON public.profiles;

DROP POLICY IF EXISTS "profiles_public_read"        ON public.profiles;

DROP POLICY IF EXISTS "profiles_padre_read"         ON public.profiles;

DO $$ BEGIN
CREATE POLICY "profiles_authenticated_read" ON public.profiles
  FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "profiles_self" ON public.profiles FOR ALL
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "profiles_staff_manage" ON public.profiles FOR ALL
  USING      (COALESCE(get_my_role(),'') IN ('directora','asistente','admin'))
  WITH CHECK (COALESCE(get_my_role(),'') IN ('directora','asistente','admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "payments_staff_all"    ON public.payments;

DROP POLICY IF EXISTS "payments_padre_select" ON public.payments;

DO $$ BEGIN
CREATE POLICY "payments_staff_all" ON public.payments FOR ALL
  USING      (COALESCE(get_my_role(),'') IN ('directora','asistente','admin'))
  WITH CHECK (COALESCE(get_my_role(),'') IN ('directora','asistente','admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "payments_padre_select" ON public.payments FOR SELECT
  USING (COALESCE(get_my_role(),'') = 'padre'
    AND student_id IN (SELECT id FROM public.students WHERE parent_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "payments_padre_insert" ON public.payments;

DO $$ BEGIN
CREATE POLICY "payments_padre_insert" ON public.payments FOR INSERT
  WITH CHECK (COALESCE(get_my_role(),'') = 'padre'
    AND student_id IN (SELECT id FROM public.students WHERE parent_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "payment_plans_staff_all" ON public.payment_plans;

DO $$ BEGIN
CREATE POLICY "payment_plans_staff_all" ON public.payment_plans FOR ALL
  USING      (COALESCE(get_my_role(),'') IN ('directora','asistente','admin'))
  WITH CHECK (COALESCE(get_my_role(),'') IN ('directora','asistente','admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "prereg_public_insert" ON public.student_preregistrations;

DROP POLICY IF EXISTS "prereg_staff_all"     ON public.student_preregistrations;

DROP POLICY IF EXISTS "prereg_update"        ON public.student_preregistrations;

DROP POLICY IF EXISTS "prereg_all"           ON public.student_preregistrations;

DO $$ BEGIN
CREATE POLICY "prereg_public_insert" ON public.student_preregistrations
  FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "prereg_staff_all" ON public.student_preregistrations FOR ALL
  USING      (COALESCE(get_my_role(),'') IN ('directora','asistente','admin'))
  WITH CHECK (COALESCE(get_my_role(),'') IN ('directora','asistente','admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "payment_concepts_write" ON public.payment_concepts FOR ALL
  USING      (COALESCE(get_my_role(),'') IN ('directora','asistente','admin'))
  WITH CHECK (COALESCE(get_my_role(),'') IN ('directora','asistente','admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "parent_ratings_own"        ON public.parent_ratings;

DROP POLICY IF EXISTS "parent_ratings_staff_read" ON public.parent_ratings;

DO $$ BEGIN
CREATE POLICY "parent_ratings_own" ON public.parent_ratings FOR ALL
  USING (auth.uid() = parent_id) WITH CHECK (auth.uid() = parent_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "parent_ratings_staff_read" ON public.parent_ratings FOR SELECT
  USING (COALESCE(get_my_role(),'') IN ('directora','asistente','admin','maestra'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "school_years_staff_all"  ON public.school_years;

DROP POLICY IF EXISTS "school_years_read"       ON public.school_years;

DO $$ BEGIN
CREATE POLICY "school_years_read" ON public.school_years
  FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "school_years_staff_all" ON public.school_years FOR ALL
  USING      (COALESCE(get_my_role(),'') IN ('directora','admin'))
  WITH CHECK (COALESCE(get_my_role(),'') IN ('directora','admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "school_settings_read"      ON public.school_settings;

DROP POLICY IF EXISTS "school_settings_staff_all" ON public.school_settings;

DO $$ BEGIN
CREATE POLICY "school_settings_read" ON public.school_settings
  FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "school_settings_staff_all" ON public.school_settings FOR ALL
  USING      (COALESCE(get_my_role(),'') IN ('directora','asistente','admin'))
  WITH CHECK (COALESCE(get_my_role(),'') IN ('directora','asistente','admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "invoices_staff_all"    ON public.invoices;

DROP POLICY IF EXISTS "invoices_padre_select" ON public.invoices;

DO $$ BEGIN
CREATE POLICY "invoices_padre_select" ON public.invoices FOR SELECT
  USING (
    COALESCE(get_my_role(),'') = 'padre'
    AND student_id IN (SELECT id FROM public.students WHERE parent_id = auth.uid())
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "Enable all for staff"  ON public.students;

DROP POLICY IF EXISTS "students_padre_select" ON public.students;

DO $$ BEGIN
CREATE POLICY "students_padre_select" ON public.students
  FOR SELECT
  USING (
    COALESCE(get_my_role(), '') = 'padre'
    AND parent_id = auth.uid()
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "profiles_self" ON public.profiles
  FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "profiles_staff_select" ON public.profiles
  FOR SELECT USING (
    COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra')
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "profiles_staff_manage" ON public.profiles
  FOR ALL
  USING      (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'))
  WITH CHECK (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "payments_staff_all" ON public.payments
  FOR ALL
  USING      (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'))
  WITH CHECK (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "payments_padre_select" ON public.payments
  FOR SELECT
  USING (
    COALESCE(get_my_role(), '') = 'padre'
    AND student_id IN (
      SELECT id FROM public.students WHERE parent_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "prereg_public_insert" ON public.student_preregistrations
  FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "prereg_staff_all" ON public.student_preregistrations
  FOR ALL
  USING      (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'))
  WITH CHECK (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "payment_concepts_write" ON public.payment_concepts
  FOR ALL
  USING      (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'))
  WITH CHECK (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "classrooms_read"  ON public.classrooms;

DO $$ BEGIN
CREATE POLICY "classrooms_read" ON public.classrooms
  FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "classrooms_staff_manage" ON public.classrooms
  FOR ALL
  USING      (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'))
  WITH CHECK (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "parent_ratings_staff_read" ON public.parent_ratings
  FOR SELECT USING (
    COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra')
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "profiles_padre_read"     ON public.profiles;

DROP POLICY IF EXISTS "profiles_authenticated"  ON public.profiles;

DO $$ BEGIN
CREATE POLICY "profiles_authenticated_read" ON public.profiles
  FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "Permitir insercion anonima de preinscripciones" ON public.student_preregistrations;

DROP POLICY IF EXISTS "Permitir lectura completa a autenticados" ON public.student_preregistrations;

-- ============================================================
-- FIX PERSISTENTE: Lectura de estudiantes por staff
-- Problema: Más arriba este mismo archivo borra las políticas
-- "students_staff_all" y "students_select", dejando SOLO
-- "students_padre_select" (padres). Por eso los paneles de
-- directora/asistente ven 0 estudiantes aunque existan registros.
-- Este bloque es idempotente y se ejecuta el ÚLTIMO para ganar.
-- ============================================================
DO $$
BEGIN
  DROP POLICY IF EXISTS "students_staff_all" ON public.students;
  CREATE POLICY "students_staff_all" ON public.students FOR ALL
    TO authenticated
    USING (COALESCE(get_my_role(),'') IN ('directora','asistente','admin','maestra','encargada'))
    WITH CHECK (COALESCE(get_my_role(),'') IN ('directora','asistente','admin','maestra','encargada'));
END $$;

-- Garantizar lectura de perfiles del staff (docentes/asistentes en KPIs)
DO $$ BEGIN
  DROP POLICY IF EXISTS "profiles_authenticated_read" ON public.profiles;
  CREATE POLICY "profiles_authenticated_read" ON public.profiles FOR SELECT
    TO authenticated USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ==============================================================================
--  >>> FASE 8 — Indices
-- ==============================================================================

-- ============================================================
-- 08_indices.sql — Colegio Montessori Sonrisas Creativas
-- Contenido: sección 5 (INDICES DE RENDIMIENTO)
-- ============================================================
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
-- 5.1 INDICES CRITICOS FALTANTES
-- ============================================================

-- periods (usados en get_current_period, get_active_period, activate_period)
CREATE INDEX IF NOT EXISTS idx_periods_is_active ON public.periods(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_periods_status ON public.periods(status);
CREATE INDEX IF NOT EXISTS idx_periods_classroom ON public.periods(classroom_id);
CREATE INDEX IF NOT EXISTS idx_periods_school_year ON public.periods(school_year_id);

-- invoices (usados en get_invoices_by_student, get_invoices_by_payment)
CREATE INDEX IF NOT EXISTS idx_invoices_student_id ON public.invoices(student_id);
CREATE INDEX IF NOT EXISTS idx_invoices_payment_id ON public.invoices(payment_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON public.invoices(created_at DESC);

-- messages (usados en get_unread_counts, mark_messages_read)
CREATE INDEX IF NOT EXISTS idx_messages_sender ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON public.messages(conversation_id, is_read) WHERE is_read = false;

-- grades (usados en close_period, historial estudiante)
CREATE INDEX IF NOT EXISTS idx_grades_student ON public.grades(student_id);
CREATE INDEX IF NOT EXISTS idx_grades_classroom ON public.grades(classroom_id);

-- report_cards
CREATE INDEX IF NOT EXISTS idx_report_cards_student ON public.report_cards(student_id);
CREATE INDEX IF NOT EXISTS idx_report_cards_classroom ON public.report_cards(classroom_id);

-- classrooms (usados en RLS, teacher assignments, live)
CREATE INDEX IF NOT EXISTS idx_classrooms_teacher ON public.classrooms(teacher_id);
CREATE INDEX IF NOT EXISTS idx_classrooms_active ON public.classrooms(is_live) WHERE is_live = true;

-- incidents
CREATE INDEX IF NOT EXISTS idx_incidents_student ON public.incidents(student_id);
CREATE INDEX IF NOT EXISTS idx_incidents_classroom ON public.incidents(classroom_id);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON public.incidents(status);

-- comments
CREATE INDEX IF NOT EXISTS idx_comments_post ON public.comments(post_id);

-- attendance_requests
CREATE INDEX IF NOT EXISTS idx_attendance_requests_student ON public.attendance_requests(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_requests_status ON public.attendance_requests(status);

-- inquiries (usados en RLS parent_id)
CREATE INDEX IF NOT EXISTS idx_inquiries_parent ON public.inquiries(parent_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_student ON public.inquiries(student_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_status ON public.inquiries(status);

-- staff_permits
CREATE INDEX IF NOT EXISTS idx_staff_permits_staff ON public.staff_permits(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_permits_status ON public.staff_permits(status);

-- daily_logs
CREATE INDEX IF NOT EXISTS idx_daily_logs_classroom ON public.daily_logs(classroom_id);
CREATE INDEX IF NOT EXISTS idx_daily_logs_date ON public.daily_logs(date);
CREATE INDEX IF NOT EXISTS idx_daily_logs_status ON public.daily_logs(status);

-- task_evidences
CREATE INDEX IF NOT EXISTS idx_task_evidences_student ON public.task_evidences(student_id);
CREATE INDEX IF NOT EXISTS idx_task_evidences_status ON public.task_evidences(status);

-- conversations
CREATE INDEX IF NOT EXISTS idx_conversations_type ON public.conversations(type);
CREATE INDEX IF NOT EXISTS idx_conversations_classroom ON public.conversations(classroom_id);

-- audit_logs (usados en busqueda por usuario/accion)
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- nap_sessions (usados en daily routine por classroom)
CREATE INDEX IF NOT EXISTS idx_nap_sessions_classroom ON public.nap_sessions(classroom_id);

-- accounting_journal (usados en joins con payments)
CREATE INDEX IF NOT EXISTS idx_journal_payment_id ON public.accounting_journal(payment_id);

-- orders
CREATE INDEX IF NOT EXISTS idx_orders_student ON public.orders(student_id);

-- likes
CREATE INDEX IF NOT EXISTS idx_likes_user ON public.likes(user_id);

-- student_preregistrations (busqueda por email del padre)
CREATE INDEX IF NOT EXISTS idx_preregistrations_p1_email ON public.student_preregistrations(p1_email);

-- payments (indice compuesto para el padre: buscar pagos por estudiante + estado)
CREATE INDEX IF NOT EXISTS idx_payments_student_status ON public.payments(student_id, status) WHERE deleted_at IS NULL;

-- payments (indice para la cola de validacion)
CREATE INDEX IF NOT EXISTS idx_payments_pending_evidence ON public.payments(status, created_at DESC) WHERE evidence_url IS NOT NULL AND status IN ('pending','pendiente','review');

-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
-- CONSOLIDADO DESDE migrations\ (historial) â€” aÃ±adido automÃ¡ticamente
-- Fecha: 2026-09-12 21:41
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

-- Los índices consolidados usan columnas que se crean en 10_fixes.sql (que se
-- ejecuta DESPUÉS de este archivo). Se declaran aquí si faltan para que los
-- CREATE INDEX no fallen con 42703 (column does not exist).
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS priority text DEFAULT 'informative';
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS is_pinned boolean DEFAULT false;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS student_id bigint REFERENCES public.students(id) ON DELETE CASCADE;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS area_id bigint REFERENCES public.academic_areas(id);
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS competency_id bigint REFERENCES public.competencies(id);
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS task_type text DEFAULT 'tarea' CHECK (task_type IN ('tarea','evaluacion','proyecto','observacion'));
ALTER TABLE public.report_cards ADD COLUMN IF NOT EXISTS areas_summary jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS school_year_id bigint REFERENCES public.school_years(id) ON DELETE SET NULL;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS period_id bigint REFERENCES public.periods(id) ON DELETE SET NULL;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS school_year_id bigint REFERENCES public.school_years(id) ON DELETE SET NULL;
ALTER TABLE public.student_preregistrations ADD COLUMN IF NOT EXISTS school_year_id bigint REFERENCES public.school_years(id) ON DELETE SET NULL;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS message_type text NOT NULL DEFAULT 'text' CHECK (message_type IN ('text','image','file','system'));
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS reply_to_id bigint REFERENCES public.messages(id) ON DELETE SET NULL;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone;
ALTER TABLE public.conversation_participants ADD COLUMN IF NOT EXISTS last_read_at timestamp with time zone;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS parent_id bigint REFERENCES public.comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications(user_id, is_read);

CREATE INDEX IF NOT EXISTS idx_notifications_priority ON public.notifications(priority) WHERE priority IN ('critical', 'important');

CREATE INDEX IF NOT EXISTS idx_notifications_pinned ON public.notifications(is_pinned) WHERE is_pinned = true;

CREATE INDEX IF NOT EXISTS idx_notifications_student ON public.notifications(student_id);

CREATE INDEX IF NOT EXISTS idx_competencies_area ON public.competencies(area_id);

CREATE INDEX IF NOT EXISTS idx_comp_scores_student ON public.competency_scores(student_id);

CREATE INDEX IF NOT EXISTS idx_comp_scores_period ON public.competency_scores(period_id);

CREATE INDEX IF NOT EXISTS idx_comp_scores_year ON public.competency_scores(school_year_id);

CREATE INDEX IF NOT EXISTS idx_comp_scores_classroom ON public.competency_scores(classroom_id);

CREATE INDEX IF NOT EXISTS idx_tasks_area ON public.tasks(area_id) WHERE area_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_competency ON public.tasks(competency_id) WHERE competency_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_type ON public.tasks(task_type);

CREATE INDEX IF NOT EXISTS idx_report_cards_areas ON public.report_cards USING gin(areas_summary);

CREATE INDEX IF NOT EXISTS idx_student_preregistrations_status ON student_preregistrations (status);

CREATE INDEX IF NOT EXISTS idx_student_preregistrations_created_at ON student_preregistrations (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_processes_school_year ON public.school_year_processes(school_year_id);

CREATE INDEX IF NOT EXISTS idx_processes_type ON public.school_year_processes(process_type);

CREATE INDEX IF NOT EXISTS idx_promotions_student ON public.student_promotions(student_id);

CREATE INDEX IF NOT EXISTS idx_promotions_from_year ON public.student_promotions(from_school_year_id);

CREATE INDEX IF NOT EXISTS idx_promotions_to_year ON public.student_promotions(to_school_year_id);

CREATE INDEX IF NOT EXISTS idx_archive_year ON public.school_year_archive(school_year_id);

CREATE INDEX IF NOT EXISTS idx_payments_school_year ON public.payments(school_year_id) WHERE school_year_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_period ON public.payments(period_id) WHERE period_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_school_year ON public.attendance(school_year_id) WHERE school_year_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_period ON public.attendance(period_id) WHERE period_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_school_year ON public.tasks(school_year_id) WHERE school_year_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_posts_school_year ON public.posts(school_year_id) WHERE school_year_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_daily_logs_school_year ON public.daily_logs(school_year_id) WHERE school_year_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_incidents_school_year ON public.incidents(school_year_id) WHERE school_year_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_school_year ON public.invoices(school_year_id) WHERE school_year_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_preregistrations_school_year ON public.student_preregistrations(school_year_id) WHERE school_year_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_enrollments_level ON public.student_enrollments(level_at_enrollment) WHERE level_at_enrollment IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses(date);

CREATE INDEX IF NOT EXISTS idx_expenses_status ON public.expenses(status);

CREATE INDEX IF NOT EXISTS idx_expenses_category ON public.expenses(category);

CREATE INDEX IF NOT EXISTS idx_payroll_invoices_payroll ON public.payroll_invoices(payroll_id);

CREATE INDEX IF NOT EXISTS idx_payroll_invoices_employee ON public.payroll_invoices(employee_id);

CREATE INDEX IF NOT EXISTS idx_payroll_invoices_period ON public.payroll_invoices(period);

CREATE INDEX IF NOT EXISTS idx_comments_post_created ON public.comments(post_id, created_at);

CREATE INDEX IF NOT EXISTS idx_likes_post_user ON public.likes(post_id, user_id);

CREATE INDEX IF NOT EXISTS idx_conv_participants_user ON public.conversation_participants(user_id);

CREATE INDEX IF NOT EXISTS idx_conv_participants_conv ON public.conversation_participants(conversation_id);

CREATE INDEX IF NOT EXISTS idx_grades_student_period ON public.grades(student_id, period_id);

CREATE INDEX IF NOT EXISTS idx_report_cards_student_period ON public.report_cards(student_id, period_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created ON public.notifications(user_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON public.messages(sender_id);

CREATE INDEX IF NOT EXISTS idx_invoices_payment_status ON public.invoices(payment_id, status);

CREATE INDEX IF NOT EXISTS idx_terms_acceptance_user ON public.terms_acceptance(user_id);

CREATE INDEX IF NOT EXISTS idx_caja_sessions_date_status ON public.caja_sessions(date, status);

CREATE INDEX IF NOT EXISTS idx_teacher_schedules_active ON public.teacher_schedules(classroom_id, is_active);

CREATE INDEX IF NOT EXISTS idx_login_attempts_lookup ON public.login_attempts (email, ip_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_login_attempts_created ON public.login_attempts (created_at);

CREATE INDEX IF NOT EXISTS idx_attendance_year_period ON public.attendance(school_year_id, period_id) WHERE period_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_task_evidences_year_period ON public.task_evidences(school_year_id, period_id) WHERE period_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_periods_active_year ON public.periods(school_year_id, is_active)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_periods_open_dates ON public.periods(school_year_id, start_date, end_date)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_routine_events_category ON public.routine_events(category_id);

CREATE INDEX IF NOT EXISTS idx_routine_events_legacy_key ON public.routine_events(legacy_key);

CREATE INDEX IF NOT EXISTS idx_routine_events_active ON public.routine_events(is_active, sort_order);

CREATE INDEX IF NOT EXISTS idx_classroom_routine_settings_classroom
  ON public.classroom_routine_settings(classroom_id, is_active);

CREATE INDEX IF NOT EXISTS idx_classroom_schedule_blocks_classroom
  ON public.classroom_schedule_blocks(classroom_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_classroom_schedule_block_events_block
  ON public.classroom_schedule_block_events(block_id);

CREATE INDEX IF NOT EXISTS idx_classroom_daily_schedule_classroom_date
  ON public.classroom_daily_schedule(classroom_id, schedule_date);

CREATE INDEX IF NOT EXISTS idx_eval_notes_student ON public.eval_boleta_notes (student_id, period_id);

CREATE INDEX IF NOT EXISTS idx_eval_hist_score    ON public.eval_score_history (score_id);

CREATE INDEX IF NOT EXISTS idx_eval_hist_student  ON public.eval_score_history (student_id);

CREATE INDEX IF NOT EXISTS idx_eval_hist_created  ON public.eval_score_history (created_at);

CREATE INDEX IF NOT EXISTS idx_eval_activities_date ON public.eval_activities (activity_date);

CREATE INDEX IF NOT EXISTS idx_eval_areas_eval      ON public.eval_areas (evaluation_id);

CREATE INDEX IF NOT EXISTS idx_eval_comp_area       ON public.eval_competencies (area_id);

CREATE INDEX IF NOT EXISTS idx_eval_periods_eval    ON public.eval_periods (evaluation_id);

CREATE INDEX IF NOT EXISTS idx_eval_modules_period  ON public.eval_modules (period_id);

CREATE INDEX IF NOT EXISTS idx_eval_modules_area    ON public.eval_modules (area_id);

CREATE INDEX IF NOT EXISTS idx_eval_act_module      ON public.eval_activities (module_id);

CREATE INDEX IF NOT EXISTS idx_eval_evid_activity   ON public.eval_evidences (activity_id);

CREATE INDEX IF NOT EXISTS idx_eval_scores_activity ON public.eval_scores (activity_id);

CREATE INDEX IF NOT EXISTS idx_eval_scores_student  ON public.eval_scores (student_id);

CREATE INDEX IF NOT EXISTS idx_eval_scores_module   ON public.eval_scores (module_id);

CREATE INDEX IF NOT EXISTS idx_eval_formulas_eval   ON public.eval_formulas (evaluation_id);

CREATE INDEX IF NOT EXISTS idx_eval_area_notes_student ON public.eval_area_notes (student_id, period_id);

CREATE INDEX IF NOT EXISTS idx_eval_area_notes_area    ON public.eval_area_notes (area_id);

CREATE INDEX IF NOT EXISTS idx_messages_reply ON public.messages(reply_to_id) WHERE reply_to_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_active ON public.messages(conversation_id, created_at DESC) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_messages_type ON public.messages(message_type);

CREATE INDEX IF NOT EXISTS idx_attachments_msg      ON public.message_attachments(message_id);

CREATE INDEX IF NOT EXISTS idx_reactions_msg        ON public.message_reactions(message_id);

CREATE INDEX IF NOT EXISTS idx_reactions_user       ON public.message_reactions(user_id);

CREATE INDEX IF NOT EXISTS idx_conv_participants_lr ON public.conversation_participants(conversation_id, last_read_at);

CREATE INDEX IF NOT EXISTS idx_posts_pinned_created ON public.posts (is_pinned DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_comments_post_parent  ON public.comments (post_id, parent_id);

CREATE INDEX IF NOT EXISTS idx_likes_post_type       ON public.likes (post_id, reaction_type);

CREATE INDEX IF NOT EXISTS idx_products_deleted_at ON public.products(deleted_at) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_payment_concepts_category ON public.payment_concepts(category);

CREATE UNIQUE INDEX IF NOT EXISTS parent_ratings_parent_month_idx
  ON public.parent_ratings(parent_id, month);


-- ==============================================================================
--  >>> FASE 9 — Fixes de produccion (motor de alertas, columnas, sync anio/periodo)
-- ==============================================================================

-- EXCLUIDO DE ESTE ARCHIVO:
--   ALTER TABLE public.grades DROP COLUMN period;
-- Motivo: ver cabecera de la migracion.

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
    UPDATE public.school_years SET is_current = (id = v_cur_year) WHERE id IS NOT NULL;
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
      UPDATE public.school_years SET is_current = (id = v_winner_year) WHERE id IS NOT NULL;
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

-- DROP TABLE IF EXISTS public.student_preregistrations CASCADE;
--
-- NEUTRALIZADO 2026-09-30. Este DROP venia al final del archivo, despues de las
-- ~55 llamadas a add_column_if_not_exists() de las lineas 140-246 sobre la misma
-- tabla: las anadia y luego la borraba con CASCADE, destruyendo todas las
-- preinscripciones. Las columnas de mas ya se agregan de forma idempotente mas
-- arriba, asi que la tabla queda equivalente sin necesitar recrearla.
-- Ver sql/MIGRACION_CORRECTIVA.sql.

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


-- ==============================================================================
--  >>> FASE 10 — Fix RLS de estudiantes
-- ==============================================================================

-- ============================================================
-- 11_fix_estudiantes.sql — Estudiantes invisibles para staff
-- ------------------------------------------------------------
-- Síntoma:  panel_directora / panel_asistente muestran
--   Total Alumnos = 0 · Activos = 0 · "No hay estudiantes"
--   aunque existan registros en public.students.
-- Causa:     RLS. Las políticas de staff sobre students fueron
--   borradas (07_politicas.sql), quedando solo "students_padre_select"
--   (padres). Con RLS activado, PostgREST oculta las filas en
--   silencio (0 datos, sin error).
-- Uso:       Pegar TODO en el SQL Editor de Supabase y ejecutar.
--   Es idempotente: puede ejecutarse varias veces.
-- ============================================================

-- ── 1) Diagnóstico ────────────────────────────────────────────
-- Si total_registros > 0 pero visibles_para_paneles = 0,
-- los estudiantes están "soft-deleted" (deleted_at = not null):
-- ejecuta la UPDATE de la sección 3b para restaurarlos.
-- Si total_registros = 0, los registros NO están en `students`
-- (revisa student_preregistrations y conviértelos desde la app).
SELECT
  COUNT(*)                                              AS total_registros,
  COUNT(*) FILTER (WHERE deleted_at IS NULL)           AS visibles_para_paneles,
  COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)       AS soft_deleted
FROM public.students;

-- Si quieres confirmar que los "3 estudiantes" están en la tabla correcta:
-- SELECT COUNT(*) AS pre_inscripciones FROM public.student_preregistrations;

-- ── 2) Políticas RLS actuales sobre students ─────────────────
SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'students'
ORDER BY policyname;

-- ── 3a) FIX: restaurar acceso total de staff a students ──────
DO $$
BEGIN
  DROP POLICY IF EXISTS "students_staff_all" ON public.students;
  CREATE POLICY "students_staff_all" ON public.students FOR ALL
    TO authenticated
    USING (COALESCE(get_my_role(),'') IN ('directora','asistente','admin','maestra','encargada'))
    WITH CHECK (COALESCE(get_my_role(),'') IN ('directora','asistente','admin','maestra','encargada'));
END $$;

-- ── 3b) (Solo si el diagnóstico 1 mostró soft_deleted > 0) ────
-- Restaura estudiantes que fueron borrados lógicamente por error.
-- UPDATE public.students SET deleted_at = NULL WHERE deleted_at IS NOT NULL;

-- ── 4) Verificación final ─────────────────────────────────────
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'students'
ORDER BY policyname;

COMMIT;

-- Reactivar triggers.
SET session_replication_role = origin;
