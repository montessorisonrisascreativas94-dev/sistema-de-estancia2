-- ============================================================
-- FIX: RLS para students, profiles, payments, payment_plans
-- Usa get_my_role() igual que el resto del proyecto
-- EJECUTAR EN: Supabase Dashboard → SQL Editor
-- ============================================================

-- ── VERIFICAR que get_my_role() existe ──────────────────────
-- Si da error, ejecuta primero este bloque:
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- ── students ─────────────────────────────────────────────────
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "students_staff_all"   ON public.students;
DROP POLICY IF EXISTS "students_select"       ON public.students;
DROP POLICY IF EXISTS "students_insert"       ON public.students;
DROP POLICY IF EXISTS "students_update"       ON public.students;
DROP POLICY IF EXISTS "students_delete"       ON public.students;
DROP POLICY IF EXISTS "Enable all for staff"  ON public.students;

-- Política unificada: directora, asistente, admin, maestra pueden todo
CREATE POLICY "students_staff_all" ON public.students
  FOR ALL
  USING      (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra'))
  WITH CHECK (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra'));

-- Padres pueden leer solo sus propios hijos
DROP POLICY IF EXISTS "students_padre_select" ON public.students;
CREATE POLICY "students_padre_select" ON public.students
  FOR SELECT
  USING (
    COALESCE(get_my_role(), '') = 'padre'
    AND parent_id = auth.uid()
  );

-- ── profiles ─────────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_self"          ON public.profiles;
DROP POLICY IF EXISTS "profiles_staff_read"    ON public.profiles;
DROP POLICY IF EXISTS "profiles_staff_upsert"  ON public.profiles;
DROP POLICY IF EXISTS "profiles_staff_update"  ON public.profiles;
DROP POLICY IF EXISTS "profiles_all"           ON public.profiles;

-- Cada usuario gestiona su propio perfil
CREATE POLICY "profiles_self" ON public.profiles
  FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Staff lee todos los perfiles
CREATE POLICY "profiles_staff_select" ON public.profiles
  FOR SELECT USING (
    COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra')
  );

-- Staff puede insertar/actualizar perfiles de padres (para admisiones)
CREATE POLICY "profiles_staff_manage" ON public.profiles
  FOR ALL
  USING      (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'))
  WITH CHECK (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'));

-- ── payment_plans ─────────────────────────────────────────────
ALTER TABLE public.payment_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_plans_staff_all" ON public.payment_plans;
CREATE POLICY "payment_plans_staff_all" ON public.payment_plans
  FOR ALL
  USING      (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'))
  WITH CHECK (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'));

-- ── payments ─────────────────────────────────────────────────
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payments_staff_all"   ON public.payments;
DROP POLICY IF EXISTS "payments_select"      ON public.payments;
DROP POLICY IF EXISTS "payments_insert"      ON public.payments;
DROP POLICY IF EXISTS "payments_update"      ON public.payments;

CREATE POLICY "payments_staff_all" ON public.payments
  FOR ALL
  USING      (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'))
  WITH CHECK (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'));

DROP POLICY IF EXISTS "payments_padre_select" ON public.payments;
CREATE POLICY "payments_padre_select" ON public.payments
  FOR SELECT
  USING (
    COALESCE(get_my_role(), '') = 'padre'
    AND student_id IN (
      SELECT id FROM public.students WHERE parent_id = auth.uid()
    )
  );

-- ── student_preregistrations ──────────────────────────────────
ALTER TABLE public.student_preregistrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prereg_select"  ON public.student_preregistrations;
DROP POLICY IF EXISTS "prereg_insert"  ON public.student_preregistrations;
DROP POLICY IF EXISTS "prereg_update"  ON public.student_preregistrations;
DROP POLICY IF EXISTS "prereg_all"     ON public.student_preregistrations;

-- Padres y público pueden insertar (formulario de pre-inscripción público)
CREATE POLICY "prereg_public_insert" ON public.student_preregistrations
  FOR INSERT WITH CHECK (true);

-- Staff lee y actualiza
CREATE POLICY "prereg_staff_all" ON public.student_preregistrations
  FOR ALL
  USING      (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'))
  WITH CHECK (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'));

-- ── payment_concepts ─────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE public.payment_concepts ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN others THEN NULL; END $$;

DROP POLICY IF EXISTS "payment_concepts_read"  ON public.payment_concepts;
DROP POLICY IF EXISTS "payment_concepts_write" ON public.payment_concepts;

CREATE POLICY "payment_concepts_read" ON public.payment_concepts
  FOR SELECT USING (true);

CREATE POLICY "payment_concepts_write" ON public.payment_concepts
  FOR ALL
  USING      (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'))
  WITH CHECK (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'));

-- ── VERIFICACIÓN FINAL ────────────────────────────────────────
SELECT
  schemaname,
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE tablename IN ('students','profiles','payments','payment_plans','student_preregistrations','payment_concepts')
ORDER BY tablename, policyname;

SELECT 'RLS fix completado exitosamente!' AS resultado;
