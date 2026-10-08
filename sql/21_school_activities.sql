-- ================================================================
-- 21_school_activities.sql — Calendario Pedagógico y Centro de
-- Experiencias Educativas (ver calendario.md §16)
--
-- Ejecutar en: Supabase → SQL Editor → New query → Run
-- Idempotente: se puede re-ejecutar sin provocar daños.
--
-- Contenido:
--   1) Tipos enumerados (activity_status / activity_category)
--   2) school_month_configs  — configuración temática del mes
--   3) school_activities     — actividades pedagógicas
--   4) school_activity_evidences — fotos/videos del aula
--   5) Índices de rendimiento
--   6) RLS (políticas por rol)
--   7) Triggers (updated_at + automático de completed_at/published_at)
--   8) RPC publish_school_activity()
-- ================================================================

-- ----------------------------------------------------------------
-- 1. TIPOS ENUMERADOS
-- ----------------------------------------------------------------
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

-- ----------------------------------------------------------------
-- 2. CONFIGURACIÓN TEMÁTICA DEL MES
-- ----------------------------------------------------------------
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

-- ----------------------------------------------------------------
-- 3. ACTIVIDADES PEDAGÓGICAS
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.school_activities (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  school_year_id bigint REFERENCES public.school_years(id) ON DELETE CASCADE,
  classroom_id bigint REFERENCES public.classrooms(id) ON DELETE SET NULL, -- NULL = todo el colegio
  title text NOT NULL,
  description text NOT NULL,
  content jsonb DEFAULT '{}'::jsonb, -- {que_trabajaremos, objetivos, materiales, desarrollo}
  activity_date date NOT NULL,
  start_time time,
  end_time time,
  category public.activity_category NOT NULL DEFAULT 'general',
  color_hex text NOT NULL DEFAULT '#22C55E',
  status public.activity_status NOT NULL DEFAULT 'draft',
  assigned_teacher_id uuid REFERENCES auth.users(id),
  created_by uuid REFERENCES auth.users(id) NOT NULL,
  teacher_notes text,
  completed_at timestamp with time zone,
  published_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- ----------------------------------------------------------------
-- 4. EVIDENCIAS FOTOGRÁFICAS / VIDEOS
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.school_activity_evidences (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  activity_id bigint NOT NULL REFERENCES public.school_activities(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  file_type text DEFAULT 'image' CHECK (file_type IN ('image', 'video')),
  caption text,
  uploaded_by uuid REFERENCES auth.users(id) NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

-- ----------------------------------------------------------------
-- 5. ÍNDICES
-- ----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_school_activities_date ON public.school_activities(activity_date);
CREATE INDEX IF NOT EXISTS idx_school_activities_status_date ON public.school_activities(status, activity_date);
CREATE INDEX IF NOT EXISTS idx_school_activities_year ON public.school_activities(school_year_id);
CREATE INDEX IF NOT EXISTS idx_school_activities_classroom ON public.school_activities(classroom_id);
CREATE INDEX IF NOT EXISTS idx_school_activities_teacher ON public.school_activities(assigned_teacher_id);
CREATE INDEX IF NOT EXISTS idx_school_activity_evidences_activity ON public.school_activity_evidences(activity_id);
CREATE INDEX IF NOT EXISTS idx_school_month_configs_ym ON public.school_month_configs(year_number, month_number);

-- ----------------------------------------------------------------
-- 6. ROW LEVEL SECURITY
-- ----------------------------------------------------------------
ALTER TABLE public.school_month_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_activity_evidences ENABLE ROW LEVEL SECURITY;

-- Las funciones helper del proyecto exponen get_my_role()
DROP POLICY IF EXISTS "activities_parent_select" ON public.school_activities;
CREATE POLICY "activities_parent_select" ON public.school_activities
  FOR SELECT TO authenticated
  USING (status = 'published');

DROP POLICY IF EXISTS "activities_staff_select" ON public.school_activities;
CREATE POLICY "activities_staff_select" ON public.school_activities
  FOR SELECT TO authenticated
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','encargada','maestra','admin'));

DROP POLICY IF EXISTS "activities_admin_all" ON public.school_activities;
CREATE POLICY "activities_admin_all" ON public.school_activities
  FOR ALL TO authenticated
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','encargada','admin'))
  WITH CHECK (COALESCE(get_my_role(), '') IN ('directora','asistente','encargada','admin'));

DROP POLICY IF EXISTS "activities_teacher_update" ON public.school_activities;
CREATE POLICY "activities_teacher_update" ON public.school_activities
  FOR UPDATE TO authenticated
  USING (assigned_teacher_id = auth.uid())
  WITH CHECK (assigned_teacher_id = auth.uid());

-- month configs: todos los autenticados leen; sólo personal admin escribe
DROP POLICY IF EXISTS "month_configs_select" ON public.school_month_configs;
CREATE POLICY "month_configs_select" ON public.school_month_configs
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "month_configs_admin_all" ON public.school_month_configs;
CREATE POLICY "month_configs_admin_all" ON public.school_month_configs
  FOR ALL TO authenticated
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','encargada','admin'))
  WITH CHECK (COALESCE(get_my_role(), '') IN ('directora','asistente','encargada','admin'));

-- evidencias: se ven si la actividad está publicada, o si eres staff, o si las subiste
DROP POLICY IF EXISTS "evidences_select" ON public.school_activity_evidences;
CREATE POLICY "evidences_select" ON public.school_activity_evidences
  FOR SELECT TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR COALESCE(get_my_role(), '') IN ('directora','asistente','encargada','maestra','admin')
    OR EXISTS (
      SELECT 1 FROM public.school_activities a
      WHERE a.id = activity_id AND a.status = 'published'
    )
  );

DROP POLICY IF EXISTS "evidences_insert" ON public.school_activity_evidences;
CREATE POLICY "evidences_insert" ON public.school_activity_evidences
  FOR INSERT TO authenticated
  WITH CHECK (
    COALESCE(get_my_role(), '') IN ('directora','asistente','encargada','admin')
    OR EXISTS (
      SELECT 1 FROM public.school_activities a
      WHERE a.id = activity_id AND a.assigned_teacher_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "evidences_delete" ON public.school_activity_evidences;
CREATE POLICY "evidences_delete" ON public.school_activity_evidences
  FOR DELETE TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR COALESCE(get_my_role(), '') IN ('directora','asistente','encargada','admin')
  );

-- ----------------------------------------------------------------
-- 7. TRIGGERS
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sa_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_school_activities_touch ON public.school_activities;
CREATE TRIGGER trg_school_activities_touch
  BEFORE UPDATE ON public.school_activities
  FOR EACH ROW EXECUTE FUNCTION public.sa_touch_updated_at();

DROP TRIGGER IF EXISTS trg_school_month_configs_touch ON public.school_month_configs;
CREATE TRIGGER trg_school_month_configs_touch
  BEFORE UPDATE ON public.school_month_configs
  FOR EACH ROW EXECUTE FUNCTION public.sa_touch_updated_at();

-- Marca completed_at / published_at automáticamente al cambiar de estado
CREATE OR REPLACE FUNCTION public.sa_status_timestamps()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'completed' AND NEW.completed_at IS NULL THEN
    NEW.completed_at = now();
  ELSIF NEW.status = 'published' THEN
    IF NEW.published_at IS NULL THEN NEW.published_at = now(); END IF;
    IF NEW.completed_at IS NULL THEN NEW.completed_at = now(); END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_school_activities_status_ts ON public.school_activities;
CREATE TRIGGER trg_school_activities_status_ts
  BEFORE UPDATE OF status ON public.school_activities
  FOR EACH ROW EXECUTE FUNCTION public.sa_status_timestamps();

-- Sólo el personal administrativo puede publicar a las familias (§14)
CREATE OR REPLACE FUNCTION public.sa_publish_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'published'
     AND OLD.status IS DISTINCT FROM 'published'
     AND COALESCE(get_my_role(), '') NOT IN ('directora','asistente','encargada','admin') THEN
    RAISE EXCEPTION 'Sólo la dirección puede publicar actividades a las familias.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_school_activities_publish_guard ON public.school_activities;
CREATE TRIGGER trg_school_activities_publish_guard
  BEFORE UPDATE OF status ON public.school_activities
  FOR EACH ROW EXECUTE FUNCTION public.sa_publish_guard();

-- ----------------------------------------------------------------
-- 8. RPC — Publicación de una actividad
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.publish_school_activity(p_activity_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
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
