-- ============================================================
-- DATOS INICIALES: Año escolar 2026-2027 y TODOS los Planes de Pago
-- NOTA: Ejecutar DESPUÉS del schema.sql completo.
-- Si las tablas no existen aún, este script las crea mínimamente.
-- ============================================================

-- Asegurar que school_years existe antes de insertar
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'school_years'
  ) THEN
    RAISE EXCEPTION 'La tabla school_years no existe. Ejecuta schema.sql primero.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'payment_plans'
  ) THEN
    RAISE EXCEPTION 'La tabla payment_plans no existe. Ejecuta schema.sql primero.';
  END IF;
END $$;

-- Insertar año escolar 2026-2027
INSERT INTO public.school_years(name, start_date, end_date, status, is_current)
VALUES('2026-2027', '2026-08-01', '2027-06-30', 'active', true)
ON CONFLICT(name) DO NOTHING;

-- Helper: Obtener año escolar ID
WITH sy AS (SELECT id FROM public.school_years WHERE name = '2026-2027')

-- ============================================================
-- PLANES DE PAGO: NIVEL INICIAL - TODOS LOS HORARIOS
-- ============================================================
-- ------------------------------------------------------------
-- 🔵 HORARIO 8:00-12:00 (Inicial)
-- ------------------------------------------------------------
INSERT INTO public.payment_plans(school_year_id, level, schedule, name, registration_fee, description)
SELECT id, 'Inicial', '8:00-12:00', 'Plan A (Anual)', 118188.00, 'Pago anual completo'
FROM sy
ON CONFLICT DO NOTHING;

INSERT INTO public.payment_plans(school_year_id, level, schedule, name, registration_fee, description)
SELECT id, 'Inicial', '8:00-12:00', 'Plan B (Semestral)', 0, 'Dos pagos semestrales'
FROM sy
ON CONFLICT DO NOTHING;

INSERT INTO public.payment_plans(school_year_id, level, schedule, name, registration_fee, description)
SELECT id, 'Inicial', '8:00-12:00', 'Plan C (Mensual)', 24622.50, '11 pagos mensuales'
FROM sy
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 🟢 HORARIO 8:00-15:00 (Inicial)
-- ------------------------------------------------------------
INSERT INTO public.payment_plans(school_year_id, level, schedule, name, registration_fee, description)
SELECT id, 'Inicial', '8:00-15:00', 'Plan A (Anual)', 139356.00, 'Pago anual completo'
FROM sy
ON CONFLICT DO NOTHING;

INSERT INTO public.payment_plans(school_year_id, level, schedule, name, registration_fee, description)
SELECT id, 'Inicial', '8:00-15:00', 'Plan B (Semestral)', 0, 'Dos pagos semestrales'
FROM sy
ON CONFLICT DO NOTHING;

INSERT INTO public.payment_plans(school_year_id, level, schedule, name, registration_fee, description)
SELECT id, 'Inicial', '8:00-15:00', 'Plan C (Mensual)', 29032.50, '11 pagos mensuales'
FROM sy
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 🟠 HORARIO 8:00-17:00 (Inicial)
-- ------------------------------------------------------------
INSERT INTO public.payment_plans(school_year_id, level, schedule, name, registration_fee, description)
SELECT id, 'Inicial', '8:00-17:00', 'Plan A (Anual)', 169585.50, 'Pago anual completo'
FROM sy
ON CONFLICT DO NOTHING;

INSERT INTO public.payment_plans(school_year_id, level, schedule, name, registration_fee, description)
SELECT id, 'Inicial', '8:00-17:00', 'Plan B (Semestral)', 0, 'Dos pagos semestrales'
FROM sy
ON CONFLICT DO NOTHING;

INSERT INTO public.payment_plans(school_year_id, level, schedule, name, registration_fee, description)
SELECT id, 'Inicial', '8:00-17:00', 'Plan C (Mensual)', 26497.80, '11 pagos mensuales'
FROM sy
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 🔵 NIVEL PRIMARIA - TODOS LOS HORARIOS
-- ------------------------------------------------------------
INSERT INTO public.payment_plans(school_year_id, level, schedule, name, registration_fee, description)
SELECT id, 'Primaria', '8:00-13:30', 'Plan A (Anual)', 132294.75, 'Pago anual completo'
FROM sy
ON CONFLICT DO NOTHING;

INSERT INTO public.payment_plans(school_year_id, level, schedule, name, registration_fee, description)
SELECT id, 'Primaria', '8:00-13:30', 'Plan B (Semestral)', 0, 'Dos pagos semestrales'
FROM sy
ON CONFLICT DO NOTHING;

INSERT INTO public.payment_plans(school_year_id, level, schedule, name, registration_fee, description)
SELECT id, 'Primaria', '8:00-13:30', 'Plan C (Mensual)', 27561.45, '11 pagos mensuales'
FROM sy
ON CONFLICT DO NOTHING;

INSERT INTO public.payment_plans(school_year_id, level, schedule, name, registration_fee, description)
SELECT id, 'Primaria', '8:00-15:00', 'Plan A (Anual)', 139356.00, 'Pago anual completo'
FROM sy
ON CONFLICT DO NOTHING;

INSERT INTO public.payment_plans(school_year_id, level, schedule, name, registration_fee, description)
SELECT id, 'Primaria', '8:00-15:00', 'Plan B (Semestral)', 0, 'Dos pagos semestrales'
FROM sy
ON CONFLICT DO NOTHING;

INSERT INTO public.payment_plans(school_year_id, level, schedule, name, registration_fee, description)
SELECT id, 'Primaria', '8:00-15:00', 'Plan C (Mensual)', 30000.00, '11 pagos mensuales'
FROM sy
ON CONFLICT DO NOTHING;

-- ============================================================
-- 📋 GENERAR CUOTAS PARA TODOS LOS PLANES
-- ============================================================

-- Helper: Insertar cuotas para plan A (Anual, un solo pago)
CREATE OR REPLACE FUNCTION public.insert_plan_a(p_level text, p_schedule text, p_amount numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_plan_id bigint;
BEGIN
  SELECT id INTO v_plan_id FROM public.payment_plans
    WHERE level = p_level AND schedule = p_schedule AND name LIKE 'Plan A%' AND school_year_id IN (SELECT id FROM public.school_years WHERE name = '2026-2027');

  INSERT INTO public.plan_installments(payment_plan_id, type, month_number, month_name, amount, due_day, due_month_offset, is_registration)
  VALUES (v_plan_id, 'inscripcion', 1, 'Agosto', p_amount, 5, 0, true)
  ON CONFLICT DO NOTHING;
END;
$$;

-- Helper: Insertar cuotas para plan B (Semestral, dos pagos)
CREATE OR REPLACE FUNCTION public.insert_plan_b(p_level text, p_schedule text, p_amount1 numeric, p_amount2 numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_plan_id bigint;
BEGIN
  SELECT id INTO v_plan_id FROM public.payment_plans
    WHERE level = p_level AND schedule = p_schedule AND name LIKE 'Plan B%' AND school_year_id IN (SELECT id FROM public.school_years WHERE name = '2026-2027');

  INSERT INTO public.plan_installments(payment_plan_id, type, month_number, month_name, amount, due_day, due_month_offset, is_registration)
  VALUES
    (v_plan_id, 'inscripcion', 1, 'Agosto', p_amount1, 5, 0, true),
    (v_plan_id, 'colegiatura', 2, 'Enero', p_amount2, 5, 5, false)
  ON CONFLICT DO NOTHING;
END;
$$;

-- Helper: Insertar cuotas para plan C (Mensual, 11 pagos)
CREATE OR REPLACE FUNCTION public.insert_plan_c(p_level text, p_schedule text, p_inscripcion numeric, p_colegiatura numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_plan_id bigint;
BEGIN
  SELECT id INTO v_plan_id FROM public.payment_plans
    WHERE level = p_level AND schedule = p_schedule AND name LIKE 'Plan C%' AND school_year_id IN (SELECT id FROM public.school_years WHERE name = '2026-2027');

  -- Inscripción Agosto
  INSERT INTO public.plan_installments(payment_plan_id, type, month_number, month_name, amount, due_day, due_month_offset, is_registration)
  VALUES (v_plan_id, 'inscripcion', 1, 'Agosto', p_inscripcion, 5, 0, true)
  ON CONFLICT DO NOTHING;

  -- Resto de colegiaturas
  INSERT INTO public.plan_installments(payment_plan_id, type, month_number, month_name, amount, due_day, due_month_offset, is_registration)
  SELECT v_plan_id, 'colegiatura', gs.mn, gs.mname, p_colegiatura, 5, gs.mo, false
  FROM (
    SELECT 2 as mn, 'Septiembre' as mname, 1 as mo
    UNION ALL SELECT 3, 'Octubre', 2
    UNION ALL SELECT 4, 'Noviembre', 3
    UNION ALL SELECT 5, 'Diciembre', 4
    UNION ALL SELECT 6, 'Enero', 5
    UNION ALL SELECT 7, 'Febrero', 6
    UNION ALL SELECT 8, 'Marzo', 7
    UNION ALL SELECT 9, 'Abril', 8
    UNION ALL SELECT 10, 'Mayo', 9
    UNION ALL SELECT 11, 'Junio', 10
  ) gs
  ON CONFLICT DO NOTHING;
END;
$$;

-- ============================================================
-- EJECUTAR PARA TODOS LOS NIVELES Y HORARIOS
-- ============================================================
-- 🔵 INICIAL 8:00-12:00
SELECT public.insert_plan_a('Inicial', '8:00-12:00', 118188.00);
SELECT public.insert_plan_b('Inicial', '8:00-12:00', 60016.95, 60016.95);
SELECT public.insert_plan_c('Inicial', '8:00-12:00', 24622.50, 9850.00);

-- 🟢 INICIAL 8:00-15:00
SELECT public.insert_plan_a('Inicial', '8:00-15:00', 139356.00);
SELECT public.insert_plan_b('Inicial', '8:00-15:00', 70766.85, 70766.85);
SELECT public.insert_plan_c('Inicial', '8:00-15:00', 29032.50, 11613.00);

-- 🟠 INICIAL 8:00-17:00
SELECT public.insert_plan_a('Inicial', '8:00-17:00', 169585.50);
SELECT public.insert_plan_b('Inicial', '8:00-17:00', 86117.85, 86117.85);
SELECT public.insert_plan_c('Inicial', '8:00-17:00', 26497.80, 15015.00);

-- 🔵 PRIMARIA 8:00-13:30
SELECT public.insert_plan_a('Primaria', '8:00-13:30', 132294.75);
SELECT public.insert_plan_b('Primaria', '8:00-13:30', 67181.10, 67181.10);
SELECT public.insert_plan_c('Primaria', '8:00-13:30', 27561.45, 11025.00);

-- 🟢 PRIMARIA 8:00-15:00
SELECT public.insert_plan_a('Primaria', '8:00-15:00', 139356.00);
SELECT public.insert_plan_b('Primaria', '8:00-15:00', 71566.85, 70766.85);
SELECT public.insert_plan_c('Primaria', '8:00-15:00', 30000.00, 11825.00);

-- Eliminar funciones temporales
DROP FUNCTION IF EXISTS public.insert_plan_a;
DROP FUNCTION IF EXISTS public.insert_plan_b;
DROP FUNCTION IF EXISTS public.insert_plan_c;
