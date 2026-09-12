-- ============================================================
-- 20260912_muro_social_upgrade.sql
-- Muro Escolar estilo "modelo Facebook" (MUROESCOLAR.MD)
--
-- Contenido:
--   1. posts: is_pinned (fijadas), is_important (avisos), post_type
--   2. comments: parent_id (respuestas) + updated_at
--   3. likes: validación de reacción por usuario (ya tiene UNIQUE + reaction_type)
--   4. Índices de rendimiento
--   5. Políticas RLS: directora/admin administran posts; validación de respuestas
--
-- Idempotente: seguro de re-ejecutar.
-- Ejecutar en Supabase SQL Editor con rol postgres/supabase_admin.
-- ============================================================

-- ============================================================
-- 1. POSTS: FIJADAS Y AVISOS IMPORTANTES
-- ------------------------------------------------------------
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

-- ============================================================
-- 2. COMMENTS: RESPUESTAS (hilo de comentarios)
-- ------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS parent_id bigint REFERENCES public.comments(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
EXCEPTION WHEN OTHERS THEN NULL; END $$;

COMMENT ON COLUMN public.comments.parent_id IS 'NULL = comentario principal; no NULL = respuesta a otro comentario del mismo post';

-- ============================================================
-- 3. ÍNDICES DE RENDIMIENTO
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_posts_pinned_created ON public.posts (is_pinned DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_post_parent  ON public.comments (post_id, parent_id);
CREATE INDEX IF NOT EXISTS idx_likes_post_type       ON public.likes (post_id, reaction_type);

-- ============================================================
-- 4. RLS — ADMINISTRACIÓN DE POSTS (fijar / aviso / eliminar)
-- ------------------------------------------------------------
-- La directora/admin puede fijar publicación de cualquier autor.
-- La maestra/asistente/encargada sigue administrando solo sus propias publicaciones.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "posts_update" ON public.posts;
CREATE POLICY "posts_update" ON public.posts FOR UPDATE USING (
  COALESCE(get_my_role(), '') IN ('directora','admin') OR
  (auth.uid() = teacher_id AND COALESCE(get_my_role(), '') IN ('maestra','asistente','encargada'))
);

DROP POLICY IF EXISTS "posts_delete" ON public.posts;
CREATE POLICY "posts_delete" ON public.posts FOR DELETE USING (
  COALESCE(get_my_role(), '') IN ('directora','admin') OR
  (auth.uid() = teacher_id AND COALESCE(get_my_role(), '') IN ('maestra','asistente','encargada'))
);

-- ============================================================
-- 5. RLS — RESPUESTAS VÁLIDAS (parent_id debe apuntar al mismo post)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "comments_insert" ON public.comments;
CREATE POLICY "comments_insert" ON public.comments FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND
    (parent_id IS NULL OR post_id = (SELECT c2.post_id FROM public.comments c2 WHERE c2.id = parent_id)) AND
    EXISTS (
      SELECT 1 FROM public.posts p WHERE p.id = comments.post_id AND (
        COALESCE(get_my_role(), '') IN ('directora','asistente','maestra','admin','encargada') OR
        p.classroom_id IS NULL OR
        is_parent_of_classroom(p.classroom_id)
      )
    )
  );

-- ============================================================
-- 6. RLS — REACCIONES: un usuario solo modifica las suyas
--    (likes_all ya restringe con USING auth.uid() = user_id).
--    Se refuerza el WITH CHECK para que UPDATE también exija user_id propio.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "likes_all" ON public.likes;
CREATE POLICY "likes_all" ON public.likes FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);