-- ============================================================
-- FIX RLS — Safe to run multiple times (all DROP IF EXISTS first)
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================================

-- ── get_my_role() function ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- ── students ─────────────────────────────────────────────────
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "students_staff_all"    ON public.students;
DROP POLICY IF EXISTS "students_padre_select" ON public.students;
DROP POLICY IF EXISTS "students_select"       ON public.students;
DROP POLICY IF EXISTS "students_insert"       ON public.students;
DROP POLICY IF EXISTS "students_update"       ON public.students;
DROP POLICY IF EXISTS "students_delete"       ON public.students;

CREATE POLICY "students_staff_all" ON public.students FOR ALL
  USING      (COALESCE(get_my_role(),'') IN ('directora','asistente','admin','maestra'))
  WITH CHECK (COALESCE(get_my_role(),'') IN ('directora','asistente','admin','maestra'));

CREATE POLICY "students_padre_select" ON public.students FOR SELECT
  USING (COALESCE(get_my_role(),'') = 'padre' AND parent_id = auth.uid());

-- ── classrooms ────────────────────────────────────────────────
ALTER TABLE public.classrooms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "classrooms_read"          ON public.classrooms;
DROP POLICY IF EXISTS "classrooms_staff_manage"  ON public.classrooms;
DROP POLICY IF EXISTS "classrooms_select"        ON public.classrooms;
DROP POLICY IF EXISTS "classrooms_all"           ON public.classrooms;

CREATE POLICY "classrooms_read" ON public.classrooms
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "classrooms_staff_manage" ON public.classrooms FOR ALL
  USING      (COALESCE(get_my_role(),'') IN ('directora','asistente','admin'))
  WITH CHECK (COALESCE(get_my_role(),'') IN ('directora','asistente','admin'));

-- ── profiles ─────────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_self"               ON public.profiles;
DROP POLICY IF EXISTS "profiles_staff_select"       ON public.profiles;
DROP POLICY IF EXISTS "profiles_staff_manage"       ON public.profiles;
DROP POLICY IF EXISTS "profiles_authenticated_read" ON public.profiles;
DROP POLICY IF EXISTS "profiles_staff_read"         ON public.profiles;
DROP POLICY IF EXISTS "profiles_staff_upsert"       ON public.profiles;
DROP POLICY IF EXISTS "profiles_staff_update"       ON public.profiles;
DROP POLICY IF EXISTS "profiles_all"                ON public.profiles;
DROP POLICY IF EXISTS "profiles_public_read"        ON public.profiles;
DROP POLICY IF EXISTS "profiles_padre_read"         ON public.profiles;

-- All authenticated users can read profiles (needed for chat, muro, etc.)
CREATE POLICY "profiles_authenticated_read" ON public.profiles
  FOR SELECT USING (auth.role() = 'authenticated');

-- Self: every user manages their own profile
CREATE POLICY "profiles_self" ON public.profiles FOR ALL
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Staff can upsert other profiles (e.g. creating padre on admit)
CREATE POLICY "profiles_staff_manage" ON public.profiles FOR ALL
  USING      (COALESCE(get_my_role(),'') IN ('directora','asistente','admin'))
  WITH CHECK (COALESCE(get_my_role(),'') IN ('directora','asistente','admin'));

-- ── payments ─────────────────────────────────────────────────
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payments_staff_all"    ON public.payments;
DROP POLICY IF EXISTS "payments_padre_select" ON public.payments;
DROP POLICY IF EXISTS "payments_select"       ON public.payments;
DROP POLICY IF EXISTS "payments_insert"       ON public.payments;
DROP POLICY IF EXISTS "payments_update"       ON public.payments;

CREATE POLICY "payments_staff_all" ON public.payments FOR ALL
  USING      (COALESCE(get_my_role(),'') IN ('directora','asistente','admin'))
  WITH CHECK (COALESCE(get_my_role(),'') IN ('directora','asistente','admin'));

CREATE POLICY "payments_padre_select" ON public.payments FOR SELECT
  USING (COALESCE(get_my_role(),'') = 'padre'
    AND student_id IN (SELECT id FROM public.students WHERE parent_id = auth.uid()));

-- Padres can INSERT their own payment proofs
DROP POLICY IF EXISTS "payments_padre_insert" ON public.payments;
CREATE POLICY "payments_padre_insert" ON public.payments FOR INSERT
  WITH CHECK (COALESCE(get_my_role(),'') = 'padre'
    AND student_id IN (SELECT id FROM public.students WHERE parent_id = auth.uid()));

-- ── payment_plans ─────────────────────────────────────────────
ALTER TABLE public.payment_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payment_plans_staff_all" ON public.payment_plans;

CREATE POLICY "payment_plans_staff_all" ON public.payment_plans FOR ALL
  USING      (COALESCE(get_my_role(),'') IN ('directora','asistente','admin'))
  WITH CHECK (COALESCE(get_my_role(),'') IN ('directora','asistente','admin'));

-- ── student_preregistrations ──────────────────────────────────
ALTER TABLE public.student_preregistrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "prereg_public_insert" ON public.student_preregistrations;
DROP POLICY IF EXISTS "prereg_staff_all"     ON public.student_preregistrations;
DROP POLICY IF EXISTS "prereg_select"        ON public.student_preregistrations;
DROP POLICY IF EXISTS "prereg_insert"        ON public.student_preregistrations;
DROP POLICY IF EXISTS "prereg_update"        ON public.student_preregistrations;
DROP POLICY IF EXISTS "prereg_all"           ON public.student_preregistrations;

CREATE POLICY "prereg_public_insert" ON public.student_preregistrations
  FOR INSERT WITH CHECK (true);

CREATE POLICY "prereg_staff_all" ON public.student_preregistrations FOR ALL
  USING      (COALESCE(get_my_role(),'') IN ('directora','asistente','admin'))
  WITH CHECK (COALESCE(get_my_role(),'') IN ('directora','asistente','admin'));

-- ── payment_concepts ─────────────────────────────────────────
DO $$ BEGIN ALTER TABLE public.payment_concepts ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN NULL; END $$;
DROP POLICY IF EXISTS "payment_concepts_read"  ON public.payment_concepts;
DROP POLICY IF EXISTS "payment_concepts_write" ON public.payment_concepts;

CREATE POLICY "payment_concepts_read" ON public.payment_concepts
  FOR SELECT USING (true);

CREATE POLICY "payment_concepts_write" ON public.payment_concepts FOR ALL
  USING      (COALESCE(get_my_role(),'') IN ('directora','asistente','admin'))
  WITH CHECK (COALESCE(get_my_role(),'') IN ('directora','asistente','admin'));

-- ── parent_ratings ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.parent_ratings (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  parent_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  teacher_id      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  month           text        NOT NULL,
  rating          int         NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment         text,
  recommendations text,
  observations    text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS parent_ratings_parent_month_idx
  ON public.parent_ratings(parent_id, month);
ALTER TABLE public.parent_ratings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "parent_ratings_own"        ON public.parent_ratings;
DROP POLICY IF EXISTS "parent_ratings_staff_read" ON public.parent_ratings;

CREATE POLICY "parent_ratings_own" ON public.parent_ratings FOR ALL
  USING (auth.uid() = parent_id) WITH CHECK (auth.uid() = parent_id);

CREATE POLICY "parent_ratings_staff_read" ON public.parent_ratings FOR SELECT
  USING (COALESCE(get_my_role(),'') IN ('directora','asistente','admin','maestra'));

-- ── payment_concepts seed ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_concepts (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        text         NOT NULL,
  category    text         NOT NULL DEFAULT 'otros',
  amount      numeric(10,2) NOT NULL DEFAULT 0,
  description text,
  active      boolean      NOT NULL DEFAULT true,
  created_at  timestamptz  NOT NULL DEFAULT now(),
  updated_at  timestamptz  NOT NULL DEFAULT now()
);

INSERT INTO public.payment_concepts (name, category, amount, description, active)
SELECT name, category, amount, description, active FROM (VALUES
  ('Colegiatura Mensual',   'colegiatura',   3000.00, 'Mensualidad estándar',              true),
  ('Inscripción',           'inscripcion',   5000.00, 'Pago único al inicio del ciclo',    true),
  ('Reinscripción',         'reinscripcion', 3500.00, 'Renovación para el próximo ciclo',  true),
  ('Uniforme Escolar',      'uniforme',      3200.00, 'Uniforme completo',                 true),
  ('Libros y Útiles',       'libros',        2500.00, 'Kit de libros y materiales',        true),
  ('Materiales Didácticos', 'materiales',     800.00, 'Materiales mensuales',              true),
  ('Actividades Extra',     'actividades',   1200.00, 'Actividades extracurriculares',     true),
  ('Excursión',             'excursiones',   3500.00, 'Salida pedagógica',                 true),
  ('Comedor',               'comedor',       2000.00, 'Servicio de alimentación mensual',  true),
  ('Transporte',            'transporte',    1500.00, 'Servicio de ruta escolar',          true),
  ('Otro',                  'otros',            0.00, 'Monto variable',                    true)
) AS v(name, category, amount, description, active)
WHERE NOT EXISTS (SELECT 1 FROM public.payment_concepts LIMIT 1);

-- ── DONE ─────────────────────────────────────────────────────
SELECT
  tablename,
  policyname
FROM pg_policies
WHERE tablename IN (
  'students','classrooms','profiles','payments',
  'payment_plans','student_preregistrations',
  'payment_concepts','parent_ratings'
)
ORDER BY tablename, policyname;

SELECT '✅ All RLS policies applied safely!' AS resultado;

-- ============================================================
-- FIX: school_years + school_settings RLS
-- school_years 403 → directora/asistente can manage
-- school_settings 400 → directora can update id=1
-- ============================================================

-- school_years
ALTER TABLE public.school_years ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "school_years_staff_all"  ON public.school_years;
DROP POLICY IF EXISTS "school_years_read"       ON public.school_years;

CREATE POLICY "school_years_read" ON public.school_years
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "school_years_staff_all" ON public.school_years FOR ALL
  USING      (COALESCE(get_my_role(),'') IN ('directora','admin'))
  WITH CHECK (COALESCE(get_my_role(),'') IN ('directora','admin'));

-- school_settings
ALTER TABLE public.school_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "school_settings_read"      ON public.school_settings;
DROP POLICY IF EXISTS "school_settings_staff_all" ON public.school_settings;

CREATE POLICY "school_settings_read" ON public.school_settings
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "school_settings_staff_all" ON public.school_settings FOR ALL
  USING      (COALESCE(get_my_role(),'') IN ('directora','asistente','admin'))
  WITH CHECK (COALESCE(get_my_role(),'') IN ('directora','asistente','admin'));

-- Seed default school_settings row if not exists
INSERT INTO public.school_settings (id, school_name, due_day, generation_day)
VALUES (1, 'Colegio Montessori Sonrisas Creativas', 5, 25)
ON CONFLICT (id) DO NOTHING;

SELECT 'school_years + school_settings RLS applied!' AS resultado;

-- ============================================================
-- FIX: profiles_role_check constraint — add 'encargada' role
-- ============================================================

-- Drop old constraint and recreate with encargada included
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('directora', 'maestra', 'asistente', 'encargada', 'padre', 'admin'));

SELECT 'profiles_role_check updated to include encargada!' AS resultado;
