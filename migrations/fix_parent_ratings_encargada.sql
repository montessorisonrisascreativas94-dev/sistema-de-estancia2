-- ============================================================
-- Migración: parent_ratings — permisos de lectura para 'encargada'
-- ------------------------------------------------------------
-- Problema: el panel de la ENCARGADA (sección "Reporte de Opinión de
-- Padres") siempre mostraba el estado vacío "Las opiniones de los padres
-- aparecerán aquí cuando las envíen".
--
-- Causa raíz: la política RLS "parent_ratings_staff_read" (reconstruida en
-- la consolidación de sql/) sólo autorizaba a los roles
-- ('directora','asistente','admin','maestra'). El rol 'encargada' quedaba
-- fuera, así que PostgREST devolvía un array VACÍO (sin error) y el panel
-- lo interpretaba como "no hay opiniones".
--
-- Esta migración es idempotente: se puede aplicar varias veces.
-- Ejecutar en el SQL Editor de Supabase (o vía psql).
-- ============================================================

-- 0) La tabla debe existir (idempotente).
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

-- 0.1) Columna del año escolar (la usan los reportes por periodo).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'parent_ratings' AND column_name = 'school_year_id'
  ) THEN
    ALTER TABLE public.parent_ratings
      ADD COLUMN IF NOT EXISTS school_year_id bigint REFERENCES public.school_years(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 1) RLS activo (una política sin RLS activo no filtra nada).
ALTER TABLE public.parent_ratings ENABLE ROW LEVEL SECURITY;

-- 2) El padre/encargada lectura de lo propio + TODO el personal del centro
--    (incluida la 'encargada') sobre las valoraciones.
DROP POLICY IF EXISTS "parent_ratings_own" ON public.parent_ratings;
DROP POLICY IF EXISTS "parent_ratings_all"  ON public.parent_ratings;
DROP POLICY IF EXISTS "parent_ratings_staff_read" ON public.parent_ratings;

CREATE POLICY "parent_ratings_own" ON public.parent_ratings FOR ALL
  USING (auth.uid() = parent_id)
  WITH CHECK (auth.uid() = parent_id);

CREATE POLICY "parent_ratings_staff_read" ON public.parent_ratings FOR SELECT
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra','encargada'));

-- 3) Índices que usa el reporte (mes + año escolar + docente).
CREATE INDEX IF NOT EXISTS idx_parent_ratings_parent ON public.parent_ratings(parent_id);
CREATE INDEX IF NOT EXISTS idx_parent_ratings_teacher ON public.parent_ratings(teacher_id);
CREATE INDEX IF NOT EXISTS idx_parent_ratings_month ON public.parent_ratings(month);
CREATE INDEX IF NOT EXISTS idx_parent_ratings_created_at ON public.parent_ratings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_parent_ratings_school_year ON public.parent_ratings(school_year_id);

-- 4) Verificación: debe listar 'encargada'.
DO $$
DECLARE
  pol text;
BEGIN
  SELECT array_to_string(array_agg(policy_name), ', ') INTO pol
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'parent_ratings';
  RAISE NOTICE 'Políticas activas en public.parent_ratings: %', COALESCE(pol, '(ninguna)');
END $$;
