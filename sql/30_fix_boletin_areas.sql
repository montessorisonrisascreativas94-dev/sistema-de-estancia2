-- ============================================================
-- 30_fix_boletin_areas.sql
-- Arregla: el modal "Asignar Nueva Tarea" (maestra) muestra
-- "— Sin áreas configuradas —" y "— Sin actividad —".
--
-- Causa: js/maestra/modules/tasks.js:_loadEvalLink() lee la última
-- fila de eval_evaluations y sus eval_areas/eval_activities. Si no
-- hay evaluación (nadie la creó) o RLS la oculta -> vacío.
--
-- Este script, idempotente:
--   1) Reafirma lectura abierta de las tablas eval_* para authenticated.
--   2) Crea una evaluación de boletín si no existe ninguna.
--   3) Crea áreas + período + módulos + actividades por defecto si faltan.
-- No borra ni modifica datos existentes. Se puede correr varias veces.
-- ============================================================

-- 1) Lectura abierta (idempotente) para que la maestra vea áreas/actividades
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['eval_evaluations','eval_areas','eval_periods','eval_modules','eval_activities'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS "eval_%s_read" ON public.%I', t, t);
      EXECUTE format('CREATE POLICY "eval_%s_read" ON public.%I FOR SELECT TO authenticated USING (true)', t, t);
      EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', t);
    END IF;
  END LOOP;
END $$;

-- 2 y 3) Crear evaluación y estructura mínima si faltan
DO $$
DECLARE
  v_year_id   bigint;
  v_creator   uuid;
  v_eval_id   bigint;
  v_period_id bigint;
  v_module_id bigint;
  v_area      record;
  v_count     int;
  v_i         int;
BEGIN
  -- año escolar (actual si existe, si no el primero)
  SELECT id INTO v_year_id FROM public.school_years
   WHERE is_current = true AND deleted_at IS NULL ORDER BY id LIMIT 1;
  IF v_year_id IS NULL THEN
    SELECT id INTO v_year_id FROM public.school_years
     WHERE deleted_at IS NULL ORDER BY id LIMIT 1;
  END IF;

  -- creador preferente
  SELECT id INTO v_creator FROM public.profiles
   WHERE role IN ('directora','maestra','admin') AND is_active = true
   ORDER BY created_at LIMIT 1;

  -- evaluación existente
  SELECT id INTO v_eval_id FROM public.eval_evaluations
   WHERE deleted_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 1;

  IF v_eval_id IS NULL THEN
    INSERT INTO public.eval_evaluations (school_year_id, name, level, status, created_by)
    VALUES (v_year_id, 'Boletín General', NULL, 'active', v_creator)
    RETURNING id INTO v_eval_id;
    RAISE NOTICE 'Evaluación creada: id=%', v_eval_id;
  ELSE
    RAISE NOTICE 'Evaluación existente: id=%', v_eval_id;
  END IF;

  -- áreas por defecto
  SELECT count(*) INTO v_count FROM public.eval_areas
   WHERE evaluation_id = v_eval_id AND deleted_at IS NULL;
  IF v_count = 0 THEN
    INSERT INTO public.eval_areas (evaluation_id, name, description, color, icon, sort_order, created_by) VALUES
      (v_eval_id,'Lenguaje','Comunicación, lenguaje y lectoescritura.','#0EA5E9','message-circle',1,v_creator),
      (v_eval_id,'Matemática','Pensamiento lógico, conteo y nociones.','#6366F1','calculator',2,v_creator),
      (v_eval_id,'Motricidad','Desarrollo motor fino y grueso.','#F97316','activity',3,v_creator),
      (v_eval_id,'Socioemocional','Emociones, convivencia y autonomía.','#F43F5E','heart',4,v_creator),
      (v_eval_id,'Ciencias','Exploración del entorno y la naturaleza.','#22C55E','leaf',5,v_creator);
    RAISE NOTICE 'Áreas por defecto creadas.';
  END IF;

  -- período por defecto
  SELECT id INTO v_period_id FROM public.eval_periods
   WHERE evaluation_id = v_eval_id AND deleted_at IS NULL ORDER BY sort_order LIMIT 1;
  IF v_period_id IS NULL THEN
    INSERT INTO public.eval_periods (evaluation_id, name, period_type, weight, status, sort_order, created_by)
    VALUES (v_eval_id, 'Período 1', 'periodo', 100, 'open', 1, v_creator)
    RETURNING id INTO v_period_id;
  END IF;

  -- módulo por área + 5 actividades por módulo
  FOR v_area IN SELECT id FROM public.eval_areas WHERE evaluation_id = v_eval_id AND deleted_at IS NULL LOOP
    SELECT id INTO v_module_id FROM public.eval_modules
     WHERE area_id = v_area.id AND deleted_at IS NULL ORDER BY sort_order LIMIT 1;
    IF v_module_id IS NULL THEN
      INSERT INTO public.eval_modules (period_id, area_id, name, eval_type, weight, sort_order, created_by)
      VALUES (v_period_id, v_area.id, 'Módulo', 'numeric', 100, 1, v_creator)
      RETURNING id INTO v_module_id;
    END IF;

    SELECT count(*) INTO v_count FROM public.eval_activities
     WHERE module_id = v_module_id AND deleted_at IS NULL;
    IF v_count = 0 THEN
      FOR v_i IN 1..5 LOOP
        INSERT INTO public.eval_activities (module_id, name, sort_order, created_by)
        VALUES (v_module_id, 'Actividad ' || v_i, v_i, v_creator);
      END LOOP;
    END IF;
  END LOOP;

  RAISE NOTICE 'BOLETIN LISTO. evaluation_id=% areas=% periodos/modulos/actividades verificados.',
    v_eval_id,
    (SELECT count(*) FROM public.eval_areas WHERE evaluation_id = v_eval_id AND deleted_at IS NULL);
END $$;

-- Verificación (una tabla)
SELECT line FROM (
  SELECT 1 AS ord, 'evaluaciones=' || (SELECT count(*)::text FROM public.eval_evaluations WHERE deleted_at IS NULL) AS line
  UNION ALL SELECT 2, 'areas='        || (SELECT count(*)::text FROM public.eval_areas        WHERE deleted_at IS NULL)
  UNION ALL SELECT 3, 'periodos='     || (SELECT count(*)::text FROM public.eval_periods      WHERE deleted_at IS NULL)
  UNION ALL SELECT 4, 'modulos='      || (SELECT count(*)::text FROM public.eval_modules      WHERE deleted_at IS NULL)
  UNION ALL SELECT 5, 'actividades='  || (SELECT count(*)::text FROM public.eval_activities   WHERE deleted_at IS NULL)
) q
ORDER BY ord;
