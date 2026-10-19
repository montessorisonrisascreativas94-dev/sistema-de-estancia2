-- #################################################################
-- MIGRACION 26 - BACKFILL: vincular datos existentes con el anio escolar
-- #################################################################
-- Por que existe este archivo:
--   * `student_preregistrations.school_year_id` se agrego despues y el
--     formulario publico solo guardaba `school_year_requested` (texto), asi
--     que el anio escolar activo "no recibia" las preinscripciones.
--   * `payments.school_year_id` se agrego por migracion, pero los cobros y
--     las admisiones nunca lo escribian: `get_school_year_dashboard` filtraba
--     por ese id y devolvia siempre 0 ingresos / 0 pendientes.
--
-- Es IDEMPOTENTE: solo toca filas donde el id es NULL.
-- Aplicacion: SQL Editor de Supabase o `node scripts/init-db.js`.
-- #################################################################

-- 1) Preinscripciones: cruzar por nombre de anio escolar
UPDATE public.student_preregistrations pr
   SET school_year_id = sy.id
  FROM public.school_years sy
 WHERE pr.school_year_id IS NULL
   AND nullif(btrim(pr.school_year_requested), '') IS NOT NULL
   AND btrim(pr.school_year_requested) = btrim(sy.name);

-- 2) Pagos: asignar al anio escolar cuyo rango contiene la fecha del cobro
--    (se usa due_date, y en su defecto paid_date o created_at)
UPDATE public.payments p
   SET school_year_id = sy.id
  FROM public.school_years sy
 WHERE p.school_year_id IS NULL
   AND p.deleted_at IS NULL
   AND COALESCE(p.due_date, p.paid_date::date, p.created_at::date)
         BETWEEN sy.start_date AND sy.end_date;

-- 3) Pagos sin fecha utilizable que corresponden al anio vigente
UPDATE public.payments p
   SET school_year_id = sy.id
  FROM public.school_years sy
 WHERE p.school_year_id IS NULL
   AND sy.is_current = true
   AND COALESCE(p.due_date, p.paid_date::date, p.created_at::date) IS NULL;

-- #################################################################
-- COMPROBACIONES
-- #################################################################
-- Debe devolver 0 filas:
SELECT count(*) AS preregs_sin_anio
  FROM public.student_preregistrations
 WHERE status = 'pending'
   AND school_year_id IS NULL
   AND COALESCE(btrim(school_year_requested), '') <> ''
   AND btrim(school_year_requested) IN (SELECT btrim(name) FROM public.school_years);

-- Resumen por anio escolar:
SELECT sy.name,
       count(DISTINCT pr.id) AS preinscripciones,
       count(DISTINCT p.id)  AS pagos
  FROM public.school_years sy
  LEFT JOIN public.student_preregistrations pr ON pr.school_year_id = sy.id
  LEFT JOIN public.payments p ON p.school_year_id = sy.id AND p.deleted_at IS NULL
 GROUP BY sy.name
 ORDER BY sy.start_date DESC;
