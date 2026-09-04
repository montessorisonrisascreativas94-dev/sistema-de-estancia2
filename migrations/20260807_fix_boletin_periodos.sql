-- ============================================================
-- 20260807_fix_boletin_periodos.sql
-- Fix: "El boletín no tiene períodos creados" al abrir el
-- Centro de Calificaciones aunque el período esté "Activo" en
-- Períodos del Año Escolar.
--
-- Causas raíz que corrige:
--   1. eval_evaluations.school_year_id NULL o apuntando a un año
--      inexistente/soft-deleted → boletin_ensure_structure retornaba
--      "Año escolar no encontrado" ANTES de crear eval_periods, y el
--      frontend se tragaba el error (try/catch) → boletín sin períodos.
--   2. public.periods.status NULL en filas antiguas → el boletín se
--      importaba con status 'closed' (el período se ve "cerrado" en
--      Calificaciones aunque esté "Activo" en el año escolar).
--   3. Evaluaciones creadas ANTES de que existieran períodos en el
--      año escolar quedaron sin eval_periods para siempre.
--
-- Solución:
--   A. Backfill de public.periods.status (NULL → 'open').
--   B. Backfill de eval_evaluations.school_year_id desde el año
--      vigente / período activo.
--   C. boletin_ensure_structure RESILIENTE: resuelve el año escolar
--      con fallbacks, actualiza school_year_id, importa períodos
--      (con fallback a períodos activos/abiertos) y SINCRONIZA el
--      status open/closed con public.periods por nombre.
--   D. Backfill directo de eval_periods para evaluaciones existentes
--      sin períodos (idempotente).
--
-- Idempotente: seguro de re-ejecutar.
-- ============================================================

-- ============================================================
-- 0. DATOS: estado de períodos del año escolar
-- ============================================================
UPDATE public.periods SET status = 'open'
WHERE status IS NULL;
UPDATE public.periods SET status = 'open', is_blocked = false
WHERE is_active = true AND status = 'closed';

-- ============================================================
-- 1. DATOS: school_year_id en evaluaciones huérfanas
-- ============================================================
DO $$
DECLARE
  v_eval record;
  v_year_id bigint;
BEGIN
  FOR v_eval IN
    SELECT e.id, e.school_year_id, e.created_at
    FROM public.eval_evaluations e
    WHERE e.school_year_id IS NULL
       OR NOT EXISTS (
         SELECT 1 FROM public.school_years y
         WHERE y.id = e.school_year_id AND y.deleted_at IS NULL
       )
  LOOP
    v_year_id := NULL;
    -- 1) Año vigente
    SELECT id INTO v_year_id FROM public.school_years
    WHERE is_current = true AND deleted_at IS NULL LIMIT 1;
    -- 2) Año del período activo
    IF v_year_id IS NULL THEN
      SELECT school_year_id INTO v_year_id FROM public.periods
      WHERE is_active = true AND school_year_id IS NOT NULL
      ORDER BY created_at DESC, id DESC LIMIT 1;
    END IF;
    -- 3) Año del período abierto más reciente
    IF v_year_id IS NULL THEN
      SELECT school_year_id INTO v_year_id FROM public.periods
      WHERE status = 'open' AND school_year_id IS NOT NULL
      ORDER BY created_at DESC, id DESC LIMIT 1;
    END IF;
    -- 4) Último año no cerrado
    IF v_year_id IS NULL THEN
      SELECT id INTO v_year_id FROM public.school_years
      WHERE status <> 'closed' AND deleted_at IS NULL
      ORDER BY start_date DESC, id DESC LIMIT 1;
    END IF;
    IF v_year_id IS NOT NULL THEN
      UPDATE public.eval_evaluations
      SET school_year_id = v_year_id, updated_at = now()
      WHERE id = v_eval.id;
    END IF;
  END LOOP;
END;
$$;

-- ============================================================
-- 2. RPC: boletin_ensure_structure RESILIENTE
--    (versión 20260807: resuelve el año con fallbacks, actualiza
--     school_year_id y sincroniza status open/closed)
-- ============================================================
CREATE OR REPLACE FUNCTION public.boletin_ensure_structure(p_evaluation_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := COALESCE(get_my_role(), '');
  v_eval  record;
  v_year  record;
  v_year_id bigint;
  v_labels jsonb;
  v_scale  jsonb;
  v_areas_count int;
  v_periods_count int;
  v_default_areas int;
  v_default_modules int;
  v_area record;
  v_period record;
  v_global_period record;
  v_modules_count int;
  v_mod record;
  v_acts_count int;
  v_i int;
  v_label jsonb;
  v_created_periods int := 0;
  v_created_areas int := 0;
  v_created_modules int := 0;
  v_created_activities int := 0;
  v_period_type text;
  v_new_period_id bigint;
  v_fallback_periods boolean := false;
BEGIN
  IF v_role NOT IN ('directora','admin','asistente','encargada','maestra') THEN
    RETURN jsonb_build_object('error','No autorizado');
  END IF;

  SELECT * INTO v_eval FROM public.eval_evaluations WHERE id = p_evaluation_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Evaluación/Boletín no encontrado');
  END IF;

  -- ── RESOLVER AÑO ESCOLAR (fallbacks en cascada)
  v_year_id := v_eval.school_year_id;
  SELECT * INTO v_year FROM public.school_years WHERE id = v_year_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    SELECT id INTO v_year_id FROM public.school_years
    WHERE is_current = true AND deleted_at IS NULL LIMIT 1;
    SELECT * INTO v_year FROM public.school_years WHERE id = v_year_id;
  END IF;
  IF NOT FOUND THEN
    SELECT school_year_id INTO v_year_id FROM public.periods
    WHERE is_active = true AND school_year_id IS NOT NULL
    ORDER BY created_at DESC, id DESC LIMIT 1;
    SELECT * INTO v_year FROM public.school_years WHERE id = v_year_id;
  END IF;
  IF NOT FOUND THEN
    SELECT school_year_id INTO v_year_id FROM public.periods
    WHERE status = 'open' AND school_year_id IS NOT NULL
    ORDER BY created_at DESC, id DESC LIMIT 1;
    SELECT * INTO v_year FROM public.school_years WHERE id = v_year_id;
  END IF;

  -- Corregir el apuntador si estaba mal
  IF v_eval.school_year_id IS DISTINCT FROM v_year_id THEN
    UPDATE public.eval_evaluations
    SET school_year_id = v_year_id, updated_at = now()
    WHERE id = p_evaluation_id;
  END IF;

  v_labels := COALESCE(v_eval.activity_labels, '[]'::jsonb);
  IF jsonb_array_length(v_labels) < 1 THEN
    v_labels := '[{"name":"Actividad 1","max_value":100},{"name":"Actividad 2","max_value":100},{"name":"Actividad 3","max_value":100},{"name":"Actividad 4","max_value":100},{"name":"Actividad 5","max_value":100}]'::jsonb;
  END IF;
  v_default_areas   := COALESCE(v_eval.default_areas, 5);
  v_default_modules := COALESCE(v_eval.default_modules, 5);

  -- ── ÁREAS: crear solo si no hay ninguna (respeta personalización)
  SELECT count(*) INTO v_areas_count FROM public.eval_areas
    WHERE evaluation_id = p_evaluation_id AND deleted_at IS NULL;
  IF v_areas_count = 0 THEN
    INSERT INTO public.eval_areas (evaluation_id, name, description, color, icon, sort_order, weight, created_by) VALUES
      (p_evaluation_id, 'Lenguaje',         'Comunicación, lenguaje y lectoescritura.', '#0EA5E9', 'message-circle', 1, 20, auth.uid()),
      (p_evaluation_id, 'Matemática',       'Pensamiento lógico, conteo y nociones.',  '#6366F1', 'calculator',     2, 20, auth.uid()),
      (p_evaluation_id, 'Motricidad',       'Desarrollo motor fino y grueso.',         '#F97316', 'activity',       3, 20, auth.uid()),
      (p_evaluation_id, 'Socioemocional',   'Emociones, convivencia y autonomía.',     '#F43F5E', 'heart',          4, 20, auth.uid()),
      (p_evaluation_id, 'Ciencias',         'Exploración del entorno y la naturaleza.', '#22C55E', 'leaf',           5, 20, auth.uid());
    v_created_areas := 5;
  END IF;

  -- ── PERÍODOS: importar del año escolar si el boletín no tiene,
  --    y sincronizar (agregar) los períodos nuevos que cree la
  --    directora en public.periods después de la primera vez.
  SELECT count(*) INTO v_periods_count FROM public.eval_periods
    WHERE evaluation_id = p_evaluation_id AND deleted_at IS NULL;

  IF v_periods_count = 0 THEN
    -- Fallback: si el año no tiene períodos, usar activos/abiertos
    SELECT count(*) INTO v_periods_count FROM public.periods
    WHERE school_year_id = v_year_id AND deleted_at IS NULL;
    IF v_periods_count = 0 THEN v_fallback_periods := true; END IF;

    FOR v_global_period IN
      SELECT id, name, start_date, end_date, status, sort_order
      FROM public.periods
      WHERE (v_fallback_periods OR school_year_id = v_year_id)
        AND deleted_at IS NULL
      ORDER BY COALESCE(sort_order, 0), start_date, id
    LOOP
      v_period_type := CASE
        WHEN COALESCE(v_year.period_model,'trimestres') = 'semestres' THEN 'bimestre'
        WHEN COALESCE(v_year.period_model,'trimestres') = 'mensual' THEN 'mes'
        ELSE 'periodo'
      END;
      INSERT INTO public.eval_periods
        (evaluation_id, name, period_type, start_date, end_date, weight, status, sort_order, created_by)
      VALUES
        (p_evaluation_id, v_global_period.name, v_period_type,
         v_global_period.start_date, v_global_period.end_date,
         0,
         CASE WHEN v_global_period.status = 'open' THEN 'open' ELSE 'closed' END,
         COALESCE(v_global_period.sort_order, 0), auth.uid())
      RETURNING id INTO v_new_period_id;
      v_created_periods := v_created_periods + 1;
    END LOOP;

    -- Fallback: crear períodos por defecto si no hay ninguno
    IF v_created_periods = 0 THEN
      INSERT INTO public.eval_periods (evaluation_id, name, period_type, status, sort_order, created_by) VALUES
        (p_evaluation_id, 'Primer Período', 'periodo', 'open',  1, auth.uid()),
        (p_evaluation_id, 'Segundo Período','periodo', 'open',  2, auth.uid()),
        (p_evaluation_id, 'Tercer Período', 'periodo', 'open',  3, auth.uid());
      v_created_periods := 3;
    END IF;
  ELSE
    FOR v_global_period IN
      SELECT name, start_date, end_date, status, sort_order
      FROM public.periods
      WHERE (v_year_id IS NULL OR school_year_id = v_year_id)
        AND deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.eval_periods ep
          WHERE ep.evaluation_id = p_evaluation_id
            AND ep.deleted_at IS NULL
            AND ep.name = public.periods.name
        )
      ORDER BY COALESCE(sort_order, 0), start_date, id
    LOOP
      v_period_type := CASE
        WHEN COALESCE(v_year.period_model,'trimestres') = 'semestres' THEN 'bimestre'
        WHEN COALESCE(v_year.period_model,'trimestres') = 'mensual' THEN 'mes'
        ELSE 'periodo'
      END;
      INSERT INTO public.eval_periods
        (evaluation_id, name, period_type, start_date, end_date, weight, status, sort_order, created_by)
      VALUES
        (p_evaluation_id, v_global_period.name, v_period_type,
         v_global_period.start_date, v_global_period.end_date,
         0,
         CASE WHEN v_global_period.status = 'open' THEN 'open' ELSE 'closed' END,
         COALESCE(v_global_period.sort_order, 0), auth.uid())
      RETURNING id INTO v_new_period_id;
      v_created_periods := v_created_periods + 1;
    END LOOP;
  END IF;

  -- ── SINCRONIZAR status open/closed con el año escolar (por nombre)
  --    Si la directora activa/cierra un período en el año escolar,
  --    el boletín lo refleja en su próxima apertura.
  UPDATE public.eval_periods ep
  SET status = CASE WHEN gp.status = 'open' THEN 'open' ELSE 'closed' END,
      start_date = gp.start_date,
      end_date = gp.end_date,
      sort_order = COALESCE(gp.sort_order, ep.sort_order),
      updated_at = now()
  FROM public.periods gp
  WHERE ep.evaluation_id = p_evaluation_id
    AND ep.deleted_at IS NULL
    AND ep.name = gp.name
    AND (ep.status IS DISTINCT FROM (CASE WHEN gp.status = 'open' THEN 'open' ELSE 'closed' END)
         OR ep.start_date IS DISTINCT FROM gp.start_date
         OR ep.end_date IS DISTINCT FROM gp.end_date);

  -- ── MÓDULOS + ACTIVIDADES: por cada área × período, garantizar A1..A5
  FOR v_area IN
    SELECT id FROM public.eval_areas
    WHERE evaluation_id = p_evaluation_id AND deleted_at IS NULL
    ORDER BY sort_order, id
  LOOP
    FOR v_period IN
      SELECT id FROM public.eval_periods
      WHERE evaluation_id = p_evaluation_id AND deleted_at IS NULL
      ORDER BY sort_order, id
    LOOP
      SELECT count(*) INTO v_modules_count FROM public.eval_modules
        WHERE period_id = v_period.id AND area_id = v_area.id AND deleted_at IS NULL;

      FOR v_i IN (v_modules_count + 1)..v_default_modules LOOP
        v_label := v_labels -> (v_i - 1);
        INSERT INTO public.eval_modules
          (period_id, area_id, name, eval_type, config, weight, sort_order, created_by)
        VALUES
          (v_period.id, v_area.id,
           COALESCE(v_label ->> 'name', 'Actividad ' || v_i),
           'numeric',
           jsonb_build_object('min', 0, 'max', 100, 'decimals', 0, 'allowDecimal', false),
           0, v_i, auth.uid())
        RETURNING id INTO v_mod.id;
        v_created_modules := v_created_modules + 1;

        INSERT INTO public.eval_activities
          (module_id, name, max_value, activity_type, activity_date, sort_order, created_by)
        VALUES
          (v_mod.id,
           COALESCE(v_label ->> 'name', 'Actividad ' || v_i),
           COALESCE((v_label ->> 'max_value')::numeric, 100),
           'actividad', NULL, 1, auth.uid());
        v_created_activities := v_created_activities + 1;
      END LOOP;

      -- Garantizar al menos 1 actividad por módulo existente
      FOR v_mod IN
        SELECT id FROM public.eval_modules
        WHERE period_id = v_period.id AND area_id = v_area.id AND deleted_at IS NULL
        ORDER BY sort_order, id
      LOOP
        SELECT count(*) INTO v_acts_count FROM public.eval_activities
          WHERE module_id = v_mod.id AND deleted_at IS NULL;
        IF v_acts_count = 0 THEN
          INSERT INTO public.eval_activities
            (module_id, name, max_value, activity_type, sort_order, created_by)
          SELECT v_mod.id, COALESCE(name, 'Actividad'), COALESCE(max_value, 100), 'actividad', 1, auth.uid()
          FROM jsonb_to_record(v_labels -> 0) AS t(name text, max_value numeric);
          v_created_activities := v_created_activities + 1;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  -- ── Backfill: asegurar config por defecto en evaluaciones antiguas
  IF v_eval.activity_labels IS NULL THEN
    UPDATE public.eval_evaluations
    SET activity_labels = '[
      {"name":"Actividad 1","max_value":100},
      {"name":"Actividad 2","max_value":100},
      {"name":"Actividad 3","max_value":100},
      {"name":"Actividad 4","max_value":100},
      {"name":"Actividad 5","max_value":100}
    ]'::jsonb WHERE id = p_evaluation_id;
  END IF;
  IF v_eval.scale_config IS NULL THEN
    UPDATE public.eval_evaluations
    SET scale_config = '{
      "min":0,"max":100,
      "levels":[
        {"label":"AD","min":90,"max":100,"color":"#10B981"},
        {"label":"A","min":80,"max":89,"color":"#22C55E"},
        {"label":"B","min":70,"max":79,"color":"#F59E0B"},
        {"label":"C","min":60,"max":69,"color":"#F97316"},
        {"label":"D","min":0,"max":59,"color":"#EF4444"}
      ]
    }'::jsonb WHERE id = p_evaluation_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'evaluation_id', p_evaluation_id,
    'periods_created', v_created_periods,
    'areas_created', v_created_areas,
    'modules_created', v_created_modules,
    'activities_created', v_created_activities
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.boletin_ensure_structure(bigint) TO authenticated;

-- ============================================================
-- 3. BACKFILL: períodos faltantes en evaluaciones existentes
--    (misma lógica de importación, ejecutada directamente para
--     no depender de auth.uid())
-- ============================================================
DO $$
DECLARE
  v_eval record;
  v_year_id bigint;
  v_period_type text;
  v_period record;
  v_created int := 0;
  v_fallback boolean := false;
BEGIN
  FOR v_eval IN
    SELECT e.id, e.school_year_id, e.default_areas, e.default_modules
    FROM public.eval_evaluations e
    WHERE NOT EXISTS (
      SELECT 1 FROM public.eval_periods ep
      WHERE ep.evaluation_id = e.id AND ep.deleted_at IS NULL
    )
  LOOP
    v_year_id := v_eval.school_year_id;
    IF NOT EXISTS (SELECT 1 FROM public.school_years y WHERE y.id = v_year_id AND y.deleted_at IS NULL) THEN
      SELECT id INTO v_year_id FROM public.school_years
      WHERE is_current = true AND deleted_at IS NULL LIMIT 1;
    END IF;
    IF v_year_id IS NULL THEN
      SELECT school_year_id INTO v_year_id FROM public.periods
      WHERE is_active = true AND school_year_id IS NOT NULL
      ORDER BY created_at DESC, id DESC LIMIT 1;
    END IF;
    IF v_year_id IS NULL THEN
      SELECT school_year_id INTO v_year_id FROM public.periods
      WHERE status = 'open' AND school_year_id IS NOT NULL
      ORDER BY created_at DESC, id DESC LIMIT 1;
    END IF;

    v_period_type := 'periodo';
    IF v_year_id IS NOT NULL THEN
      SELECT COALESCE(period_model,'trimestres') INTO v_period_type
      FROM public.school_years WHERE id = v_year_id;
      v_period_type := CASE
        WHEN v_period_type = 'semestres' THEN 'bimestre'
        WHEN v_period_type = 'mensual' THEN 'mes'
        ELSE 'periodo'
      END;
    END IF;

    v_fallback := false;
    IF v_year_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.periods p
      WHERE p.school_year_id = v_year_id AND p.deleted_at IS NULL
    ) THEN
      v_fallback := true;
    END IF;

    FOR v_period IN
      SELECT name, start_date, end_date, status, sort_order
      FROM public.periods
      WHERE (v_fallback OR school_year_id = v_year_id)
        AND deleted_at IS NULL
      ORDER BY COALESCE(sort_order, 0), start_date, id
    LOOP
      INSERT INTO public.eval_periods
        (evaluation_id, name, period_type, start_date, end_date, weight, status, sort_order, created_by)
      VALUES
        (v_eval.id, v_period.name, v_period_type,
         v_period.start_date, v_period.end_date,
         0,
         CASE WHEN v_period.status = 'open' THEN 'open' ELSE 'closed' END,
         COALESCE(v_period.sort_order, 0), NULL);
      v_created := v_created + 1;
    END LOOP;

    IF NOT EXISTS (
      SELECT 1 FROM public.eval_periods ep
      WHERE ep.evaluation_id = v_eval.id AND ep.deleted_at IS NULL
    ) THEN
      INSERT INTO public.eval_periods (evaluation_id, name, period_type, status, sort_order, created_by) VALUES
        (v_eval.id, 'Primer Período', 'periodo', 'open',  1, NULL),
        (v_eval.id, 'Segundo Período','periodo', 'open',  2, NULL),
        (v_eval.id, 'Tercer Período', 'periodo', 'open',  3, NULL);
      v_created := v_created + 3;
    END IF;
  END LOOP;

  RAISE NOTICE 'eval_periods backfill: % períodos creados', v_created;
END;
$$;

-- ============================================================
-- 4. SINCRONIZAR status de eval_periods existentes con el año
--    escolar (por nombre) en TODA la base
-- ============================================================
UPDATE public.eval_periods ep
SET status = CASE WHEN gp.status = 'open' THEN 'open' ELSE 'closed' END,
    start_date = gp.start_date,
    end_date = gp.end_date,
    sort_order = COALESCE(gp.sort_order, ep.sort_order),
    updated_at = now()
FROM public.periods gp
WHERE ep.deleted_at IS NULL
  AND ep.name = gp.name
  AND (ep.status IS DISTINCT FROM (CASE WHEN gp.status = 'open' THEN 'open' ELSE 'closed' END)
       OR ep.start_date IS DISTINCT FROM gp.start_date
       OR ep.end_date IS DISTINCT FROM gp.end_date);

-- ============================================================
-- 5. VERIFICACIÓN
-- ============================================================
SELECT
  (SELECT count(*) FROM public.eval_periods WHERE deleted_at IS NULL) AS total_eval_periods,
  (SELECT count(*) FROM public.eval_evaluations e
     WHERE NOT EXISTS (SELECT 1 FROM public.eval_periods ep
                       WHERE ep.evaluation_id = e.id AND ep.deleted_at IS NULL)) AS evaluaciones_sin_periodos,
  (SELECT count(*) FROM public.periods WHERE status IS NULL) AS periodos_estado_nulo;
