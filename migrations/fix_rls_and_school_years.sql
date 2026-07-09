
-- ============================================================
-- MIGRACIÓN: Fix RLS policies para students y tablas de año escolar
-- ============================================================

-- Primero, habilitar RLS para las tablas de año escolar (si no está habilitado)
ALTER TABLE public.school_years             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_plans            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_installments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_enrollments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_charges         ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Fix RLS para students (agregar WITH CHECK para INSERT/UPDATE)
-- ============================================================
DROP POLICY IF EXISTS "students_staff_all" ON public.students;
CREATE POLICY "students_staff_all" ON public.students FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra'))
  WITH CHECK (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra'));

-- ============================================================
-- RLS para school_years
-- ============================================================
DROP POLICY IF EXISTS "school_years_staff_all" ON public.school_years;
CREATE POLICY "school_years_staff_all" ON public.school_years FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','admin'))
  WITH CHECK (COALESCE(get_my_role(), '') IN ('directora','admin'));

-- ============================================================
-- RLS para payment_plans
-- ============================================================
DROP POLICY IF EXISTS "payment_plans_staff_all" ON public.payment_plans;
CREATE POLICY "payment_plans_staff_all" ON public.payment_plans FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'))
  WITH CHECK (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'));

-- ============================================================
-- RLS para plan_installments
-- ============================================================
DROP POLICY IF EXISTS "plan_installments_staff_all" ON public.plan_installments;
CREATE POLICY "plan_installments_staff_all" ON public.plan_installments FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'))
  WITH CHECK (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'));

-- ============================================================
-- RLS para student_enrollments
-- ============================================================
DROP POLICY IF EXISTS "student_enrollments_staff_all" ON public.student_enrollments;
CREATE POLICY "student_enrollments_staff_all" ON public.student_enrollments FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'))
  WITH CHECK (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'));

-- ============================================================
-- RLS para student_charges
-- ============================================================
DROP POLICY IF EXISTS "student_charges_staff_all" ON public.student_charges;
CREATE POLICY "student_charges_staff_all" ON public.student_charges FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'))
  WITH CHECK (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'));

-- ============================================================
-- RLS para invoices (si no existe)
-- ============================================================
DROP POLICY IF EXISTS "invoices_staff_all" ON public.invoices;
CREATE POLICY "invoices_staff_all" ON public.invoices FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'))
  WITH CHECK (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'));

-- ============================================================
-- Fin de migración
-- ============================================================
