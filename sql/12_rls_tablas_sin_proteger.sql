-- ============================================================
-- 12_rls_tablas_sin_proteger.sql — Colegio Montessori Sonrisas Creativas
-- Cierra un hueco de seguridad detectado por el linter de Supabase:
-- 5 tablas se crean en 01_base.sql pero nunca reciben
-- ENABLE ROW LEVEL SECURITY ni politica alguna.
--
-- Sin RLS, PostgREST las expone a CUALQUIER rol con grant, incluida
-- la anon key que viaja dentro del HTML del frontend.
-- Hoy devuelven 0 filas, asi que no hay exposicion activa: el riesgo
-- es latente y se activa en cuanto alguien inserte la primera fila.
--
-- SEGURIDAD: habilitar RLS sin politica es deny-all. Por eso aqui cada
-- ENABLE va acompanado de sus politicas, en la misma transaccion.
--
-- Idempotente: se puede reejecutar sin efectos acumulativos.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- academic_areas — catalogo curricular, sin datos de alumnos
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'academic_areas') THEN

    DROP POLICY IF EXISTS "academic_areas_select" ON public.academic_areas;
    CREATE POLICY "academic_areas_select" ON public.academic_areas FOR SELECT
      USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','encargada','maestra'));

    DROP POLICY IF EXISTS "academic_areas_write" ON public.academic_areas;
    CREATE POLICY "academic_areas_write" ON public.academic_areas FOR ALL
      USING (COALESCE(get_my_role(), '') IN ('directora','admin'))
      WITH CHECK (COALESCE(get_my_role(), '') IN ('directora','admin'));

    ALTER TABLE public.academic_areas ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- ------------------------------------------------------------
-- competencies — catalogo curricular, sin datos de alumnos
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'competencies') THEN

    DROP POLICY IF EXISTS "competencies_select" ON public.competencies;
    CREATE POLICY "competencies_select" ON public.competencies FOR SELECT
      USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','encargada','maestra'));

    DROP POLICY IF EXISTS "competencies_write" ON public.competencies;
    CREATE POLICY "competencies_write" ON public.competencies FOR ALL
      USING (COALESCE(get_my_role(), '') IN ('directora','admin'))
      WITH CHECK (COALESCE(get_my_role(), '') IN ('directora','admin'));

    ALTER TABLE public.competencies ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- ------------------------------------------------------------
-- competency_scores — CALIFICACIONES por competencia. Datos de alumnos.
-- Mismo tratamiento que public.grades: el personal escribe, el padre
-- solo lee las notas de su propio hijo.
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'competency_scores') THEN

    DROP POLICY IF EXISTS "competency_scores_staff" ON public.competency_scores;
    CREATE POLICY "competency_scores_staff" ON public.competency_scores FOR ALL
      USING (COALESCE(get_my_role(), '') IN ('directora','asistente','maestra','admin','encargada'))
      WITH CHECK (
        COALESCE(get_my_role(), '') IN ('directora','asistente','maestra','admin','encargada') AND (
          period_id IS NULL
          OR is_period_open(period_id)
          OR COALESCE(get_my_role(), '') IN ('directora','admin')
        )
      );

    DROP POLICY IF EXISTS "competency_scores_parent" ON public.competency_scores;
    CREATE POLICY "competency_scores_parent" ON public.competency_scores FOR SELECT
      USING (is_parent_of_student(student_id));

    ALTER TABLE public.competency_scores ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- ------------------------------------------------------------
-- student_promotions — historial de promociones. Datos de alumnos.
-- Mismos roles que public.student_enrollments.
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'student_promotions') THEN

    DROP POLICY IF EXISTS "student_promotions_staff_all" ON public.student_promotions;
    CREATE POLICY "student_promotions_staff_all" ON public.student_promotions FOR ALL
      USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'))
      WITH CHECK (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'));

    ALTER TABLE public.student_promotions ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- ------------------------------------------------------------
-- school_year_archive — snapshot JSONb de alumnos, pagos y notas.
-- La tabla mas sensible del grupo: soloership maxima.
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'school_year_archive') THEN

    DROP POLICY IF EXISTS "school_year_archive_staff_all" ON public.school_year_archive;
    CREATE POLICY "school_year_archive_staff_all" ON public.school_year_archive FOR ALL
      USING (COALESCE(get_my_role(), '') IN ('directora','admin'))
      WITH CHECK (COALESCE(get_my_role(), '') IN ('directora','admin'));

    ALTER TABLE public.school_year_archive ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

COMMIT;

-- ============================================================
-- VERIFICACION (ejecutar por separado, es de solo lectura)
--
-- Debe devolver 5 de 5 en relrowsecurity = true.
-- ============================================================
-- SELECT c.relname, c.relrowsecurity
--   FROM pg_class c
--   JOIN pg_namespace n ON n.oid = c.relnamespace
--  WHERE n.nspname = 'public'
--    AND c.relname IN ('academic_areas','competencies','competency_scores',
--                      'student_promotions','school_year_archive')
--  ORDER BY c.relname;
