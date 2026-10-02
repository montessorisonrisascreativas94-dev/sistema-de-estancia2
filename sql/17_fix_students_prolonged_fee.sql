-- ============================================================
-- MIGRACIÓN 17 — students.prolonged_fee / school_year_requested
-- Fecha: 2026-10-02
-- Problema:
--   El formulario de admisión (js/shared/student-record-modal.js) tiene el
--   campo numérico "Cuota prolongada" (srm-prolongadofee) que se serializa
--   como `prolonged_fee`, y el año escolar como `school_year_requested`.
--   Ninguna de las dos columnas existía en la tabla `students`, así que
--   PostgREST rechazaba TODO el insert con:
--       POST /rest/v1/students?columns=...&select=id  -> 400 Bad Request
--       (PGRST204 Could not find the 'prolonged_fee' column of
--        'students' in the schema cache)
--   Eso rompía la admisión completa: no se creaba el estudiante, ni el
--   perfil del padre, ni el usuario en Supabase Auth.
--
-- Solución: agregar las columnas que faltan. Es idempotente: si ya
-- existen (porque se agregaron a mano desde el Dashboard), no hace nada.
--
-- Ejecutar en: Supabase → SQL Editor → New query → Run
-- ============================================================

BEGIN;

-- ── Por qué NO se usa public.add_column_if_missing(...) ───────
-- Ese helper tiene dos sobrecargas:
--   14_admision_completa.sql -> (tbl text, col text, definition text)   [3 args]
--   versiones anteriores      -> (p_table, p_column, p_type, p_default DEFAULT NULL)
-- Llamarlo con 3 argumentos era ambiguo:
--   ERROR 42725: function public.add_column_if_missing(unknown, unknown,
--                unknown) is not unique
-- Solución: ALTER TABLE directo, sin depender del helper ni del orden.

-- ── Limpieza de la sobrecarga de 4 args ──────────────────────
-- Se elimina si existe. La versión buena es la de 3 args que define
-- 14_admision_completa.sql; la de 4 args solo la usaban migraciones
-- viejas y es la causa del 42725. Si 14 se reejecuta, la recrea (3 args).
DO $$
DECLARE
  n4 integer;
BEGIN
  SELECT count(*) INTO n4
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'add_column_if_missing' AND p.pronargs = 4;

  IF n4 > 0 THEN
    EXECUTE 'DROP FUNCTION public.add_column_if_missing(text, text, text, text)';
    RAISE NOTICE 'Eliminada la sobrecarga de 4 args de add_column_if_missing (resuelve 42725)';
  END IF;
END $$;

-- ── Columnas faltantes ───────────────────────────────────────
-- Cuota prolongada (0 si no aplica). numeric pq se compara con monthly_fee.
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS prolonged_fee numeric(12,2) NOT NULL DEFAULT 0;

-- Año escolar solicitado (p. ej. 2026-2027).
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS school_year_requested text;

COMMIT;

-- ============================================================
-- VERIFICACIÓN
-- Debe listar 2 filas: prolonged_fee y school_year_requested.
-- ============================================================
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'students'
  AND column_name IN ('prolonged_fee', 'school_year_requested')
ORDER BY column_name;

-- Comprobación extra: si esto devuelve columnas, el INSERT del formulario
-- volverá a fallar con 400. Déjalo en 0 filas.
SELECT c.column_name AS columna_inexistente_en_la_db
FROM unnest(ARRAY[
  'name','student_last_name','birth_date','gender','nationality','birth_place',
  'address','province','municipality','sector','matricula','level_requested',
  'school_year_requested','classroom_id','schedule','start_date','observations',
  'p1_name','p1_relationship','p1_cedula','p1_phone','p1_whatsapp','p1_email',
  'p1_address','p1_profession','p1_workplace','p1_occupation','p1_emergency_contact',
  'p2_name','p2_relationship','p2_cedula','p2_phone','p2_whatsapp','p2_email',
  'p2_address','p2_profession','p2_workplace','emergency_name',
  'emergency_relationship','emergency_cedula','emergency_phone','blood_type',
  'allergies','medications','medical_conditions','disability','food_restrictions',
  'medical_notes','insurance','pediatrician','pediatrician_phone','payment_plan',
  'monthly_fee','prolonged_fee','registration_fee','discount','due_day','is_active',
  'vaccines_complete','authorized_persons','student_name','pre_registration_id','parent_id'
]) AS c(column_name)
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.columns x
  WHERE x.table_schema = 'public' AND x.table_name = 'students'
    AND x.column_name = c.column_name
);
