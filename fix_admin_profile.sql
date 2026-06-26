-- ============================================================
-- FIX: Crear perfil de administrador para impulsodigital@gmail.com
-- UUID: c1e72617-ab8f-44c0-b1eb-cdd92eda62e7
-- EJECUTAR EN: Supabase Dashboard → SQL Editor
-- ============================================================

-- Insertar o actualizar el perfil con rol admin
INSERT INTO public.profiles (id, email, name, role, accepted_terms, created_at)
VALUES (
  '5b6e8359-1a65-4d26-aba4-ca48b6b66409',
  'impulsodigital@gmail.com',
  'Administrador',
  'admin',
  true,
  now()
)
ON CONFLICT (id) DO UPDATE SET
  role           = 'admin',
  email          = 'impulsodigital@gmail.com',
  accepted_terms = true;

-- Verificar que quedó bien
SELECT id, email, name, role FROM public.profiles
WHERE id = '5b6e8359-1a65-4d26-aba4-ca48b6b66409';
