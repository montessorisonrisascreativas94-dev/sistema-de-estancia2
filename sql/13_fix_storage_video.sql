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
