-- ============================================================
-- 11_fix_estudiantes.sql — Estudiantes invisibles para staff
-- ------------------------------------------------------------
-- Síntoma:  panel_directora / panel_asistente muestran
--   Total Alumnos = 0 · Activos = 0 · "No hay estudiantes"
--   aunque existan registros en public.students.
-- Causa:     RLS. Las políticas de staff sobre students fueron
--   borradas (07_politicas.sql), quedando solo "students_padre_select"
--   (padres). Con RLS activado, PostgREST oculta las filas en
--   silencio (0 datos, sin error).
-- Uso:       Pegar TODO en el SQL Editor de Supabase y ejecutar.
--   Es idempotente: puede ejecutarse varias veces.
-- ============================================================

-- ── 1) Diagnóstico ────────────────────────────────────────────
-- Si total_registros > 0 pero visibles_para_paneles = 0,
-- los estudiantes están "soft-deleted" (deleted_at = not null):
-- ejecuta la UPDATE de la sección 3b para restaurarlos.
-- Si total_registros = 0, los registros NO están en `students`
-- (revisa student_preregistrations y conviértelos desde la app).
SELECT
  COUNT(*)                                              AS total_registros,
  COUNT(*) FILTER (WHERE deleted_at IS NULL)           AS visibles_para_paneles,
  COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)       AS soft_deleted
FROM public.students;

-- Si quieres confirmar que los "3 estudiantes" están en la tabla correcta:
-- SELECT COUNT(*) AS pre_inscripciones FROM public.student_preregistrations;

-- ── 2) Políticas RLS actuales sobre students ─────────────────
SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'students'
ORDER BY policyname;

-- ── 3a) FIX: restaurar acceso total de staff a students ──────
DO $$
BEGIN
  DROP POLICY IF EXISTS "students_staff_all" ON public.students;
  CREATE POLICY "students_staff_all" ON public.students FOR ALL
    TO authenticated
    USING (COALESCE(get_my_role(),'') IN ('directora','asistente','admin','maestra','encargada'))
    WITH CHECK (COALESCE(get_my_role(),'') IN ('directora','asistente','admin','maestra','encargada'));
END $$;

-- ── 3b) (Solo si el diagnóstico 1 mostró soft_deleted > 0) ────
-- Restaura estudiantes que fueron borrados lógicamente por error.
-- UPDATE public.students SET deleted_at = NULL WHERE deleted_at IS NOT NULL;

-- ── 4) Verificación final ─────────────────────────────────────
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'students'
ORDER BY policyname;