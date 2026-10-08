-- ============================================================
-- 23 ACTIVIDADES ESCOLARES — Planificación Central Staff
-- ============================================================
-- Propósito:
--  ✅ Directora / Asistente / Encargada pueden CREAR, EDITAR, CERRAR actividades.
--  ✅ Maestra   → SOLO LECTURA de actividades asignadas a su aula
--                  + puede marcar "registro individual" de alumnos (adjuntar evidencia)
--                  + puede guardar su relato (teacher_notes) y marcar "realizada"
--  ✅ Padre     → SOLO LECTURA de actividades del aula de su hijo
--                  (NO puede crear, NO puede editar)
--
--  Ciclo de vida: draft → scheduled → published → in_progress → completed → archived
--
--  Tipos: academica | extracurricular | cierre_periodo |
--         evaluacion | reunion_padres | excursion | admin | otra
--
--  NOTA DE UNIFICACIÓN (corrección del error "column ... does not exist"):
--   Este script unifica en UNA SOLA tabla los dos esquemas que coexistían:
--     · Esquema 21 (js/shared/school-activities.module.js):
--         activity_date, start_time, end_time, category, color_hex, content,
--         school_year_id, assigned_teacher_id, teacher_notes
--     · Esquema 23 (js/directora/school-center.module.js):
--         code, activity_type, priority, target_audience, scheduled_date,
--         scheduled_time, duration_minutes, location, created_by, assigned_to,
--         starts_at, ends_at, attachments_jsonb, metadata_jsonb
--   Un trigger espejo mantiene activity_date ↔ scheduled_date,
--   start_time ↔ scheduled_time y assigned_teacher_id ↔ assigned_to.
--   El script es 100% RE-EJECUTABLE (DROP POLICY IF EXISTS / ADD COLUMN IF NOT EXISTS).
-- ============================================================

SET client_min_messages = WARNING;

-- ============================================================
-- 0. TIPOS ENUM (creados sólo si el script 21 nunca corrió)
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.activity_status AS ENUM (
    'draft', 'scheduled', 'in_progress', 'completed', 'published'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.activity_category AS ENUM (
    'ciencias', 'educativa', 'arte', 'celebracion',
    'familia', 'recreativa', 'importante', 'general'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- TABLA PRINCIPAL: school_activities
-- ============================================================
CREATE TABLE IF NOT EXISTS public.school_activities (
    id                  BIGSERIAL PRIMARY KEY,
    code                TEXT NOT NULL UNIQUE,
    title               TEXT NOT NULL,
    description         TEXT NOT NULL DEFAULT '',
    activity_type       TEXT NOT NULL DEFAULT 'academica'
        CHECK (activity_type IN (
            'academica','extracurricular','cierre_periodo',
            'evaluacion','reunion_padres','excursion','admin','otra'
        )),
    priority            TEXT NOT NULL DEFAULT 'media'
        CHECK (priority IN ('baja','media','alta','critica')),
    status              TEXT NOT NULL DEFAULT 'scheduled'
        CHECK (status IN ('draft','scheduled','published','in_progress','completed','archived')),
    classroom_id        BIGINT REFERENCES public.classrooms(id) ON DELETE SET NULL,
    target_audience     TEXT NOT NULL DEFAULT 'aula'
        CHECK (target_audience IN ('aula','nivel','todo_el_centro','estudiante','staff')),
    scheduled_date      DATE NOT NULL,
    scheduled_time      TIME,
    duration_minutes    INTEGER CHECK (duration_minutes IS NULL OR duration_minutes > 0),
    location            TEXT,
    created_by          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    assigned_to         UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- usu. maestra responsable
    published_at        TIMESTAMPTZ,
    starts_at           TIMESTAMPTZ,
    ends_at             TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    attachments_jsonb   JSONB NOT NULL DEFAULT '[]'::jsonb,
    metadata_jsonb      JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
--  1. RECONCILIACIÓN DE COLUMNAS
--  Si la tabla ya fue creada por el script 21 (esquema activity_date),
--  se añaden TODAS las columnas del esquema 23 y viceversa.
-- ============================================================
DO $$
BEGIN
    -- ---- Esquema 21 (módulo compartido: calendario de actividades) ----
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'public' AND c.relname = 'school_years' AND c.relkind = 'r') THEN
        ALTER TABLE public.school_activities
            ADD COLUMN IF NOT EXISTS school_year_id bigint REFERENCES public.school_years(id) ON DELETE CASCADE;
    ELSE
        ALTER TABLE public.school_activities
            ADD COLUMN IF NOT EXISTS school_year_id bigint;
    END IF;
    ALTER TABLE public.school_activities
        ADD COLUMN IF NOT EXISTS activity_date date;
    ALTER TABLE public.school_activities
        ADD COLUMN IF NOT EXISTS start_time time;
    ALTER TABLE public.school_activities
        ADD COLUMN IF NOT EXISTS end_time time;
    ALTER TABLE public.school_activities
        ADD COLUMN IF NOT EXISTS category public.activity_category NOT NULL DEFAULT 'general';
    ALTER TABLE public.school_activities
        ADD COLUMN IF NOT EXISTS color_hex text NOT NULL DEFAULT '#22C55E';
    ALTER TABLE public.school_activities
        ADD COLUMN IF NOT EXISTS content jsonb NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE public.school_activities
        ADD COLUMN IF NOT EXISTS assigned_teacher_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
    ALTER TABLE public.school_activities
        ADD COLUMN IF NOT EXISTS teacher_notes text;

    -- ---- Esquema 23 (Centro Escolar / planificación central) ----
    ALTER TABLE public.school_activities
        ADD COLUMN IF NOT EXISTS code text;
    ALTER TABLE public.school_activities
        ADD COLUMN IF NOT EXISTS activity_type text NOT NULL DEFAULT 'academica';
    ALTER TABLE public.school_activities
        ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'media';
    ALTER TABLE public.school_activities
        ADD COLUMN IF NOT EXISTS target_audience text NOT NULL DEFAULT 'aula';
    ALTER TABLE public.school_activities
        ADD COLUMN IF NOT EXISTS scheduled_date date;
    ALTER TABLE public.school_activities
        ADD COLUMN IF NOT EXISTS scheduled_time time;
    ALTER TABLE public.school_activities
        ADD COLUMN IF NOT EXISTS duration_minutes integer;
    ALTER TABLE public.school_activities
        ADD COLUMN IF NOT EXISTS location text;
    ALTER TABLE public.school_activities
        ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
    ALTER TABLE public.school_activities
        ADD COLUMN IF NOT EXISTS starts_at timestamptz;
    ALTER TABLE public.school_activities
        ADD COLUMN IF NOT EXISTS ends_at timestamptz;
    ALTER TABLE public.school_activities
        ADD COLUMN IF NOT EXISTS attachments_jsonb jsonb NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE public.school_activities
        ADD COLUMN IF NOT EXISTS metadata_jsonb jsonb NOT NULL DEFAULT '{}'::jsonb;

    -- ---- Defaults que el esquema 21 no tenía ----
    ALTER TABLE public.school_activities ALTER COLUMN description SET DEFAULT '';
END $$;

-- Checks del esquema 23 (si la tabla viene del 21 no los tiene)
DO $$ BEGIN
    ALTER TABLE public.school_activities ADD CONSTRAINT school_activities_activity_type_check
        CHECK (activity_type IN (
            'academica','extracurricular','cierre_periodo',
            'evaluacion','reunion_padres','excursion','admin','otra'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE public.school_activities ADD CONSTRAINT school_activities_priority_check
        CHECK (priority IN ('baja','media','alta','critica'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE public.school_activities ADD CONSTRAINT school_activities_target_audience_check
        CHECK (target_audience IN ('aula','nivel','todo_el_centro','estudiante','staff'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- code: único (nombre idéntico al índice tras la restricción UNIQUE del CREATE TABLE)
CREATE UNIQUE INDEX IF NOT EXISTS school_activities_code_key
    ON public.school_activities(code);

-- ============================================================
--  2. BACKFILL de sincronía entre ambos esquemas
-- ============================================================
-- Fechas: activity_date ↔ scheduled_date (nunca deben quedar NULL)
UPDATE public.school_activities
   SET scheduled_date = COALESCE(scheduled_date, activity_date, CURRENT_DATE),
       activity_date  = COALESCE(activity_date, scheduled_date)
 WHERE scheduled_date IS NULL OR activity_date IS NULL;

UPDATE public.school_activities
   SET activity_date = scheduled_date
 WHERE activity_date IS NULL;

UPDATE public.school_activities
   SET scheduled_date = activity_date
 WHERE scheduled_date IS NULL;

-- Horas: start_time ↔ scheduled_time
UPDATE public.school_activities
   SET start_time     = COALESCE(start_time, scheduled_time),
       scheduled_time = COALESCE(scheduled_time, start_time)
 WHERE start_time IS NULL OR scheduled_time IS NULL;

-- Responsable: assigned_teacher_id ↔ assigned_to (mismo uuid)
UPDATE public.school_activities
   SET assigned_to          = COALESCE(assigned_to, assigned_teacher_id),
       assigned_teacher_id  = COALESCE(assigned_teacher_id, assigned_to)
 WHERE assigned_to IS NULL OR assigned_teacher_id IS NULL;

-- Actividades de todo el centro creadas desde el módulo compartido
UPDATE public.school_activities
   SET target_audience = 'todo_el_centro'
 WHERE classroom_id IS NULL AND target_audience = 'aula';

-- Ahora sí: fechas obligatorias
ALTER TABLE public.school_activities ALTER COLUMN scheduled_date SET NOT NULL;
ALTER TABLE public.school_activities ALTER COLUMN activity_date  SET NOT NULL;

-- ============================================================
--  3. ENUM status: añadir 'archived' si la columna es enum (esquema 21)
-- ============================================================
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'school_activities'
           AND column_name = 'status' AND udt_name = 'activity_status'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_enum e
          JOIN pg_type t ON t.oid = e.enumtypid
         WHERE t.typname = 'activity_status' AND e.enumlabel = 'archived'
    ) THEN
        ALTER TYPE public.activity_status ADD VALUE IF NOT EXISTS 'archived';
    END IF;
END $$;

-- ============================================================
--  ÍNDICES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_activities_class_date
    ON public.school_activities(classroom_id, scheduled_date DESC)
    WHERE classroom_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_activities_status_date
    ON public.school_activities(status, scheduled_date DESC);

CREATE INDEX IF NOT EXISTS idx_activities_created
    ON public.school_activities(created_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activities_assigned
    ON public.school_activities(assigned_to)
    WHERE assigned_to IS NOT NULL AND status IN ('scheduled','published','in_progress');

CREATE INDEX IF NOT EXISTS idx_activities_range
    ON public.school_activities(scheduled_date, status)
    WHERE status IN ('published','scheduled','in_progress','completed');

-- Compatibilidad con el módulo compartido (script 21)
CREATE INDEX IF NOT EXISTS idx_school_activities_date
    ON public.school_activities(activity_date);
CREATE INDEX IF NOT EXISTS idx_school_activities_status_date
    ON public.school_activities(status, activity_date);
CREATE INDEX IF NOT EXISTS idx_school_activities_year
    ON public.school_activities(school_year_id);
CREATE INDEX IF NOT EXISTS idx_school_activities_classroom
    ON public.school_activities(classroom_id);
CREATE INDEX IF NOT EXISTS idx_school_activities_teacher
    ON public.school_activities(assigned_teacher_id);

-- ============================================================
--  TABLAS DE APOYO (idempotentes — sólo si el script 21 no corrió)
-- ============================================================
DO $$
BEGIN
    -- school_years puede no existir en una base muy reciente: sin FK si falta
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'public' AND c.relname = 'school_years' AND c.relkind = 'r') THEN
        CREATE TABLE IF NOT EXISTS public.school_month_configs (
          id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          school_year_id bigint REFERENCES public.school_years(id) ON DELETE CASCADE,
          year_number integer NOT NULL CHECK (year_number >= 2024),
          month_number integer NOT NULL CHECK (month_number BETWEEN 1 AND 12),
          special_title text NOT NULL,
          slogan text,
          banner_url text,
          primary_color text DEFAULT '#22C55E',
          family_message text,
          created_by uuid REFERENCES auth.users(id),
          created_at timestamp with time zone DEFAULT now(),
          updated_at timestamp with time zone DEFAULT now(),
          UNIQUE (school_year_id, year_number, month_number)
        );
    ELSE
        CREATE TABLE IF NOT EXISTS public.school_month_configs (
          id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          school_year_id bigint,
          year_number integer NOT NULL CHECK (year_number >= 2024),
          month_number integer NOT NULL CHECK (month_number BETWEEN 1 AND 12),
          special_title text NOT NULL,
          slogan text,
          banner_url text,
          primary_color text DEFAULT '#22C55E',
          family_message text,
          created_by uuid REFERENCES auth.users(id),
          created_at timestamp with time zone DEFAULT now(),
          updated_at timestamp with time zone DEFAULT now(),
          UNIQUE (school_year_id, year_number, month_number)
        );
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.school_activity_evidences (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  activity_id bigint NOT NULL REFERENCES public.school_activities(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  file_type text DEFAULT 'image' CHECK (file_type IN ('image', 'video')),
  caption text,
  uploaded_by uuid REFERENCES auth.users(id) NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_school_activity_evidences_activity
    ON public.school_activity_evidences(activity_id);
CREATE INDEX IF NOT EXISTS idx_school_month_configs_ym
    ON public.school_month_configs(year_number, month_number);

-- ============================================================
--  🔐 RLS (una política por comando para evitar AND accidental)
-- ============================================================
ALTER TABLE public.school_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_month_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_activity_evidences ENABLE ROW LEVEL SECURITY;

-- Limpieza de políticas heredadas del script 21 (son PERMISSIVE y se
-- combinan con OR anulando los filtros por rol/aula de este script)
DROP POLICY IF EXISTS "activities_parent_select"  ON public.school_activities;
DROP POLICY IF EXISTS "activities_staff_select"   ON public.school_activities;
DROP POLICY IF EXISTS "activities_admin_all"      ON public.school_activities;
DROP POLICY IF EXISTS "activities_teacher_update" ON public.school_activities;

-- Limpieza de políticas propias (re-ejecución)
DROP POLICY IF EXISTS school_activities_select_staff   ON public.school_activities;
DROP POLICY IF EXISTS school_activities_select_maestra ON public.school_activities;
DROP POLICY IF EXISTS school_activities_select_padre   ON public.school_activities;
DROP POLICY IF EXISTS school_activities_insert_staff   ON public.school_activities;
DROP POLICY IF EXISTS school_activities_update_staff   ON public.school_activities;
DROP POLICY IF EXISTS school_activities_update_maestra ON public.school_activities;
DROP POLICY IF EXISTS school_activities_delete_staff   ON public.school_activities;

/* 1. SELECT — roles staff / maestra / padre con filtros granulares */
CREATE POLICY school_activities_select_staff
    ON public.school_activities FOR SELECT
    USING (
        EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
                 AND p.role IN ('directora','asistente','encargada','admin'))
    );

-- Maestra → SOLO las actividades de su aula o asignadas a ella
CREATE POLICY school_activities_select_maestra
    ON public.school_activities FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'maestra'
            AND (
                 assigned_to = auth.uid()
              OR classroom_id IN (SELECT c.id FROM public.classrooms c WHERE c.teacher_id = auth.uid())
            )
        )
        AND status IN ('scheduled','published','in_progress','completed')
    );

-- Padre → SOLO las actividades publicadas del aula de su hijo
CREATE POLICY school_activities_select_padre
    ON public.school_activities FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.profiles p
            JOIN public.students s ON s.parent_id = p.id
            WHERE p.id = auth.uid()
              AND p.role = 'padre'
              AND (
                   s.classroom_id = school_activities.classroom_id
                OR school_activities.target_audience IN ('todo_el_centro')
              )
        )
        AND status IN ('published','in_progress','completed')
    );

/* 2. INSERT — solo directora / asistente / encargada / admin */
CREATE POLICY school_activities_insert_staff
    ON public.school_activities FOR INSERT
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
                 AND p.role IN ('directora','asistente','encargada','admin'))
        AND created_by = auth.uid()
    );

/* 3. UPDATE — cualquier rol staff (directora / asistente / encargada / admin)
       (equivale a la política heredada activities_admin_all del script 21) */
CREATE POLICY school_activities_update_staff
    ON public.school_activities FOR UPDATE
    USING (
        EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
                 AND p.role IN ('directora','asistente','encargada','admin'))
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
                 AND p.role IN ('directora','asistente','encargada','admin'))
    );

/* 3b. UPDATE — maestra: guardar relato (teacher_notes) y marcar "realizada"
       SOLO en filas de su aula / asignadas a ella */
CREATE POLICY school_activities_update_maestra
    ON public.school_activities FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'maestra'
            AND (
                 assigned_to = auth.uid()
              OR classroom_id IN (SELECT c.id FROM public.classrooms c WHERE c.teacher_id = auth.uid())
            )
        )
        AND status IN ('scheduled','published','in_progress')
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'maestra')
        AND status IN ('scheduled','published','in_progress','completed')
    );

/* 4. DELETE — personal staff (directora / asistente / encargada / admin)
       (el módulo compartido ofrece "Eliminar" a estos mismos roles) */
CREATE POLICY school_activities_delete_staff
    ON public.school_activities FOR DELETE
    USING (
        EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
                 AND p.role IN ('directora','asistente','encargada','admin'))
    );

-- ------------------------------------------------------------
-- Políticas de las tablas de apoyo (idempotentes)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "month_configs_select"    ON public.school_month_configs;
DROP POLICY IF EXISTS "month_configs_admin_all" ON public.school_month_configs;

CREATE POLICY "month_configs_select"
  ON public.school_month_configs FOR SELECT TO authenticated USING (true);

CREATE POLICY "month_configs_admin_all"
  ON public.school_month_configs FOR ALL TO authenticated
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','encargada','admin'))
  WITH CHECK (COALESCE(get_my_role(), '') IN ('directora','asistente','encargada','admin'));

DROP POLICY IF EXISTS "evidences_select" ON public.school_activity_evidences;
DROP POLICY IF EXISTS "evidences_insert" ON public.school_activity_evidences;
DROP POLICY IF EXISTS "evidences_delete" ON public.school_activity_evidences;

CREATE POLICY "evidences_select"
  ON public.school_activity_evidences FOR SELECT TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR COALESCE(get_my_role(), '') IN ('directora','asistente','encargada','maestra','admin')
    OR EXISTS (
      SELECT 1 FROM public.school_activities a
      WHERE a.id = activity_id AND a.status = 'published'
    )
  );

CREATE POLICY "evidences_insert"
  ON public.school_activity_evidences FOR INSERT TO authenticated
  WITH CHECK (
    COALESCE(get_my_role(), '') IN ('directora','asistente','encargada','admin')
    OR EXISTS (
      SELECT 1 FROM public.school_activities a
      WHERE a.id = activity_id AND (a.assigned_to = auth.uid() OR a.assigned_teacher_id = auth.uid())
    )
  );

CREATE POLICY "evidences_delete"
  ON public.school_activity_evidences FOR DELETE TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR COALESCE(get_my_role(), '') IN ('directora','asistente','encargada','admin')
  );

-- ============================================================
--  TRIGGER 1: updated_at automático
-- ============================================================
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

-- ============================================================
--  TRIGGER 2: Generador de código ACT-YYYY-MM-DD-NNN
-- ============================================================
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

-- ============================================================
--  TRIGGER 3: Al pasar status → published/completed, timestamps automáticos
-- ============================================================
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

-- ============================================================
--  TRIGGER 4: Espejo entre los dos esquemas
--  activity_date ↔ scheduled_date, start_time ↔ scheduled_time,
--  assigned_teacher_id ↔ assigned_to, target_audience vs classroom_id
-- ============================================================
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
        -- Fechas: gana la que cambió en este UPDATE
        IF NEW.activity_date IS DISTINCT FROM OLD.activity_date THEN
            NEW.scheduled_date := NEW.activity_date;
        ELSIF NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date THEN
            NEW.activity_date := NEW.scheduled_date;
        ELSE
            NEW.activity_date  := COALESCE(NEW.activity_date, NEW.scheduled_date);
            NEW.scheduled_date := COALESCE(NEW.scheduled_date, NEW.activity_date);
        END IF;

        -- Horas: gana la que cambió en este UPDATE
        IF NEW.start_time IS DISTINCT FROM OLD.start_time THEN
            NEW.scheduled_time := NEW.start_time;
        ELSIF NEW.scheduled_time IS DISTINCT FROM OLD.scheduled_time THEN
            NEW.start_time := NEW.scheduled_time;
        ELSE
            NEW.start_time     := COALESCE(NEW.start_time, NEW.scheduled_time);
            NEW.scheduled_time := COALESCE(NEW.scheduled_time, NEW.start_time);
        END IF;

        -- Responsable: gana el que cambió en este UPDATE
        IF NEW.assigned_teacher_id IS DISTINCT FROM OLD.assigned_teacher_id THEN
            NEW.assigned_to := NEW.assigned_teacher_id;
        ELSIF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
            NEW.assigned_teacher_id := NEW.assigned_to;
        ELSE
            NEW.assigned_to         := COALESCE(NEW.assigned_to, NEW.assigned_teacher_id);
            NEW.assigned_teacher_id := COALESCE(NEW.assigned_teacher_id, NEW.assigned_to);
        END IF;
    END IF;

    -- Audiencia coherente con el aula elegida
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

-- ============================================================
--  RPC — Publicación de una actividad (idempotente)
-- ============================================================
CREATE OR REPLACE FUNCTION public.publish_school_activity(p_activity_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('directora','asistente','encargada','admin')
  ) THEN
    RAISE EXCEPTION 'No tiene permisos para publicar actividades.';
  END IF;

  UPDATE public.school_activities
  SET status = 'published',
      published_at = COALESCE(published_at, now()),
      updated_at = now()
  WHERE id = p_activity_id;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.publish_school_activity(bigint) TO authenticated;

-- ============================================================
-- GRANTS
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.school_activities TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.school_activities TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.school_activities_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.school_activities_id_seq TO anon;

GRANT SELECT ON TABLE public.school_month_configs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.school_month_configs TO authenticated;
GRANT SELECT ON TABLE public.school_activity_evidences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.school_activity_evidences TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.school_activity_evidences_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.school_month_configs_id_seq TO authenticated;

RESET client_min_messages;
