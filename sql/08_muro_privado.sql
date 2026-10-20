-- ============================================================================
-- 08 - MURO ESCOLAR PRIVADO
-- ----------------------------------------------------------------------------
-- Agrega a public.posts las columnas necesarias para publicar:
--   * student_id       -> publicacion visible solo para un estudiante (privada)
--   * allow_download   -> permite/bloquea descargar las fotos
--   * protect_capture  -> activa la proteccion anti-captura en el panel padre
--
-- Ejecuta este archivo completo en Supabase > SQL Editor.
-- Es idempotente: se puede correr varias veces sin romper nada.
-- ============================================================================

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS student_id      bigint REFERENCES public.students(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS allow_download  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS protect_capture boolean NOT NULL DEFAULT false;

-- Indice para el filtro "solo un estudiante" del panel padre.
CREATE INDEX IF NOT EXISTS idx_posts_student_id ON public.posts (student_id);

-- Compatibilidad: instalaciones antiguas que todavia tengan `is_light`.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'posts' AND column_name = 'is_light'
  ) THEN
    EXECUTE 'ALTER TABLE public.posts ALTER COLUMN is_light SET DEFAULT true';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
-- Reemplaza la policy de lectura del padre para que:
--   * las publicaciones publicas (student_id IS NULL) sigan llegando a toda
--     el aula;
--   * las privadas (student_id NOT NULL) solo las vea la familia de ese alumno.
-- Los roles de staff no usan esta policy (tienen `posts_staff_all`).
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "posts_parent_read" ON public.posts;
CREATE POLICY "posts_parent_read" ON public.posts
  FOR SELECT TO authenticated
  USING (
    COALESCE(public.get_my_role(), '') = 'padre'
    AND (
      student_id IS NULL
      OR student_id IN (
        SELECT id FROM public.students
        WHERE parent_id = auth.uid()
      )
    )
    AND (
      classroom_id IS NULL
      OR classroom_id IN (
        SELECT classroom_id FROM public.students
        WHERE parent_id = auth.uid() AND classroom_id IS NOT NULL
      )
    )
  );

-- Insert/update/delete para el staff ya existen (`posts_staff_all`), pero nos
-- aseguramos de que el GRANT a las columnas nuevas este presente.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.posts TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Verificacion rapida (ejecuta suelta para comprobar)
-- ----------------------------------------------------------------------------
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='posts'
--   AND column_name IN ('student_id','allow_download','protect_capture');
