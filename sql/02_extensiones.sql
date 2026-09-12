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

