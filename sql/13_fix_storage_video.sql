-- ============================================================
-- 13_fix_storage_video.sql — Colegio Montessori Sonrisas Creativas
-- Corrige la subida de videos al muro (HTTP 400 en Storage).
--
-- Causa: el codigo subia los videos al bucket `karpus-uploads`, cuyo
-- allowed_mime_types solo acepta imagenes y PDF. Ahora los videos van a
-- `posts` (ver js/maestra/main.js y js/asistente/main.js), asi que aqui se
-- amplian los mimes y el limite de tamano de ese bucket, y se agregan las
-- politicas UPDATE (upsert) y DELETE que faltaban.
--
-- Ejecutar en el SQL Editor de Supabase. Es idempotente.
-- ============================================================

-- Ampliar mimes de video + limite a 25 MB en el bucket `posts`
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'posts',
  'posts',
  true,
  26214400,
  ARRAY[
    'image/jpeg','image/jpg','image/png','image/webp','image/gif',
    'video/mp4','video/webm','video/quicktime','video/ogg',
    'video/x-matroska','video/3gpp','video/x-msvideo'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public              = true,
      file_size_limit     = 26214400,
      allowed_mime_types  = EXCLUDED.allowed_mime_types;

-- `karpus-uploads` se mantiene como solo-imagenes/PDF a proposito: es el
-- bucket de avatares y documentos. Si ya tiene videos de intentos fallidos
-- previos, no hay que hacer nada: nunca llegaron a escribirse.

-- Politicas faltantes en `posts`
-- INSERT ya existe como "posts_auth_insert"; UPDATE hace falta para que
-- upload({ upsert: true }) no falle al reescribir un objeto.
DROP POLICY IF EXISTS "posts_auth_update" ON storage.objects;
CREATE POLICY "posts_auth_update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'posts' AND auth.role() = 'authenticated')
  WITH CHECK (bucket_id = 'posts' AND auth.role() = 'authenticated');

-- DELETE para poder limpiar videos que pesan 25 MB sin comerse la cuota.
DROP POLICY IF EXISTS "posts_auth_delete" ON storage.objects;
CREATE POLICY "posts_auth_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'posts' AND auth.role() = 'authenticated');

-- Verificacion: debe listar posts | 26214400 | video/mp4,video/webm,...
SELECT id, public, file_size_limit, allowed_mime_types
  FROM storage.buckets
 WHERE id = 'posts';

-- ==============================================================================
-- FIX_COMMENTS_400_403.sql — Parche mínimo para Panel Asistente (y todos)
-- ==============================================================================
--  ERROR 400: .select('..., parent_id, ...') y .insert({ parent_id: null })
--             FALLABAN porque la tabla comments NO TENIA la columna parent_id.
--  ERROR 403: policies de comments/likes usaban EXISTS(...) sin COALESCE,
--             por lo que si las funciones is_parent_of_classroom /
--             is_teacher_of_classroom devolvían NULL, se rechazaba al usuario.
-- ==============================================================================

-- 1. Añadir la columna parent_id si no existe (soporta respuestas a comentarios)
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS parent_id bigint
  REFERENCES public.comments(id) ON DELETE CASCADE;

-- 2. Índice para paginación rápida de respuestas
CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON public.comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_comments_post_id_parent_id
  ON public.comments(post_id, parent_id) INCLUDE (id, created_at);

-- ==============================================================================
-- REFACTOR DE POLICIES: usar COALESCE(..., false) para evitar 403 por NULL
-- ==============================================================================

DROP POLICY IF EXISTS "comments_select" ON public.comments;
CREATE POLICY "comments_select" ON public.comments FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.posts p
    WHERE p.id = comments.post_id
      AND auth.uid() IS NOT NULL
      AND (
        COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra','encargada') OR
        COALESCE(p.classroom_id IS NULL, true) OR
        COALESCE(is_teacher_of_classroom(p.classroom_id), false) OR
        COALESCE(is_parent_of_classroom(p.classroom_id), false)
      )
  )
);

DROP POLICY IF EXISTS "comments_insert" ON public.comments;
CREATE POLICY "comments_insert" ON public.comments FOR INSERT WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.posts p
    WHERE p.id = comments.post_id
      AND (
        COALESCE(get_my_role(), '') IN ('directora','asistente','maestra','admin','encargada') OR
        COALESCE(p.classroom_id IS NULL, true) OR
        COALESCE(is_parent_of_classroom(p.classroom_id), false)
      )
  )
);

-- Refresco también likes, usa el mismo patrón (por si acaso da 403 ahí)
DROP POLICY IF EXISTS "likes_select" ON public.likes;
CREATE POLICY "likes_select" ON public.likes FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.posts p
    WHERE p.id = likes.post_id
      AND auth.uid() IS NOT NULL
      AND (
        COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra','encargada') OR
        COALESCE(p.classroom_id IS NULL, true) OR
        COALESCE(is_teacher_of_classroom(p.classroom_id), false) OR
        COALESCE(is_parent_of_classroom(p.classroom_id), false)
      )
  )
);

DROP POLICY IF EXISTS "likes_all" ON public.likes;
CREATE POLICY "likes_all" ON public.likes FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- 14_fix_realtime_no_leidos.sql — Colegio Montessori Sonrisas Creativas
-- Habilita el badge rojo de mensajes en tiempo real en todos los paneles.
--
-- Problema: la tabla `messages` NO estaba en la publicacion
-- `supabase_realtime`, asi que los canales en vivo nunca emitian eventos de
-- mensajes. El badge de la campana solo se actualizaba al abrir el panel, y el
-- usuario pedia "recarga la pagina" para ver los mensajes nuevos.
--
-- Este script NO cambia la firma de get_unread_counts(): sigue devolviendo
-- jsonb con la forma actual { "<sender_id>": <n>, "total": <n> }, que es la que
-- espera js/shared/unread-messages.js. No hace falta recrear la funcion.
--
-- Ejecutar en el SQL Editor de Supabase. Es idempotente: se puede correr
-- varias veces sin romper nada.
-- ============================================================


-- ---------------------------------------------------------------------------
-- 1. Publicar `messages` en tiempo real
-- ---------------------------------------------------------------------------
-- `ALTER PUBLICATION ... ADD TABLE` lanza duplicate_object (42710) si la tabla
-- ya estaba, asi que se envuelve en un bloque para que el script sea re-ejecutable.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END
$$;


-- ---------------------------------------------------------------------------
-- 2. REPLICA IDENTITY FULL
-- ---------------------------------------------------------------------------
-- Necesario para que el evento de UPDATE que marca `is_read = true` llegue con
-- la fila anterior, de modo que el cliente pueda restar el mensaje del contador
-- sin tener que releer la tabla.
ALTER TABLE public.messages REPLICA IDENTITY FULL;


-- ---------------------------------------------------------------------------
-- 3. Indice de no leidos que tambien cubre `is_read IS NULL`
-- ---------------------------------------------------------------------------
-- El indice de 08_indices.sql es `WHERE is_read = false`, pero tanto
-- get_unread_counts() como el cliente consideran no leido un mensaje con
-- `is_read IS NULL` (la columna tiene DEFAULT false, pero los INSERT antiguos
-- pueden traer NULL explicito). Ese indice no cubre esas filas.
CREATE INDEX IF NOT EXISTS idx_messages_unread_cover
  ON public.messages(conversation_id, sender_id, created_at DESC)
  WHERE is_read IS DISTINCT FROM true;


-- ---------------------------------------------------------------------------
-- Verificacion
-- ---------------------------------------------------------------------------
-- Debe devolver una fila: messages | public | FULL
SELECT c.relname AS tabla,
       c.relreplident AS replica_identity,
       CASE c.relreplident
         WHEN 'f' THEN 'FULL'
         WHEN 'd' THEN 'DEFAULT'
         WHEN 'i' THEN 'INDEX'
         WHEN 'n' THEN 'NOTHING'
         ELSE c.relreplident::text
       END AS replica_identity_legible
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relname = 'messages';

-- Debe incluir 'messages' en la lista.
SELECT pubname, schemaname, tablename
  FROM pg_publication_tables
 WHERE pubname = 'supabase_realtime'
   AND schemaname = 'public'
 ORDER BY tablename;