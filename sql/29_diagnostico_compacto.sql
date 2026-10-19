-- ============================================================
-- 29_diagnostico_compacto.sql — SOLO LECTURA
-- Devuelve UNA sola tabla de texto para copiar/pegar fácil.
-- Ejecuta todo y pega todas las líneas del resultado.
-- ============================================================

SELECT line FROM (
  SELECT 1 AS ord,
         'ROL del perfil clave (14754254...): ' ||
         COALESCE((SELECT role FROM public.profiles
                    WHERE id='14754254-afd3-48fe-8ada-acaa7cc537e8'::uuid), '(el perfil NO existe)') AS line

  UNION ALL
  SELECT 2, 'AULAS de ese perfil: ' ||
         COALESCE((SELECT string_agg(c.id || '=' || c.name, ' | ' ORDER BY c.id)
                     FROM public.classrooms c
                    WHERE c.teacher_id='14754254-afd3-48fe-8ada-acaa7cc537e8'::uuid
                      AND c.deleted_at IS NULL), '(ninguna)')

  UNION ALL
  SELECT 3, 'TODAS las maestras: ' ||
         COALESCE((SELECT string_agg(p.id || '=' || COALESCE(p.name,'?') || '(activo=' || COALESCE(p.is_active::text,'?') || ')', ' | ')
                     FROM public.profiles p WHERE p.role='maestra'), '(ninguna)')

  UNION ALL
  SELECT 4, 'AULAS activas (id=nombre -> maestra): ' ||
         COALESCE((SELECT string_agg(c.id || '=' || c.name || ' -> ' || COALESCE(p.name,'SIN MAESTRA'), ' | ' ORDER BY c.id)
                     FROM public.classrooms c
                     LEFT JOIN public.profiles p ON p.id = c.teacher_id
                    WHERE c.deleted_at IS NULL), '(ninguna)')

  UNION ALL
  SELECT 5, 'TAREAS por aula (aula->cantidad): ' ||
         COALESCE((SELECT string_agg(z.classroom_id || ' -> ' || z.n, ' | ' ORDER BY z.classroom_id)
                     FROM (SELECT classroom_id, count(*) AS n FROM public.tasks GROUP BY classroom_id) z), '(SIN TAREAS)')

  UNION ALL
  SELECT 6, 'TAREAS en aula 7 (Párvulos III): ' ||
         (SELECT count(*)::text FROM public.tasks WHERE classroom_id = 7)

  UNION ALL
  SELECT 7, 'TAREAS en aula 1: ' ||
         (SELECT count(*)::text FROM public.tasks WHERE classroom_id = 1)

  UNION ALL
  SELECT 8, 'DETALLE de cada tarea: ' ||
         COALESCE((SELECT string_agg('[' || t.id || ' aula=' || COALESCE(t.classroom_id::text,'null') ||
                    ' prof=' || COALESCE(t.teacher_id::text,'null') || '] ' || COALESCE(t.title,'?'), '  ||  ' ORDER BY t.id)
                     FROM public.tasks t), '(SIN TAREAS)')

  UNION ALL
  SELECT 9, 'AULAS borradas que aún tienen tareas: ' ||
         COALESCE((SELECT string_agg(DISTINCT c.id || '=' || c.name, ' | ')
                     FROM public.tasks t
                     JOIN public.classrooms c ON c.id = t.classroom_id
                    WHERE c.deleted_at IS NOT NULL), '(ninguna)')

  UNION ALL
  SELECT 10, 'BOLETIN conteos: evaluaciones=' ||
         (SELECT count(*)::text FROM public.eval_evaluations WHERE deleted_at IS NULL) ||
         ' | areas=' || (SELECT count(*)::text FROM public.eval_areas WHERE deleted_at IS NULL) ||
         ' | periodos=' || (SELECT count(*)::text FROM public.eval_periods WHERE deleted_at IS NULL) ||
         ' | modulos=' || (SELECT count(*)::text FROM public.eval_modules WHERE deleted_at IS NULL) ||
         ' | actividades=' || (SELECT count(*)::text FROM public.eval_activities WHERE deleted_at IS NULL)

  UNION ALL
  SELECT 11, 'BOLETIN evaluaciones: ' ||
         COALESCE((SELECT string_agg(e.id || '=' || e.name || '(year=' || COALESCE(e.school_year_id::text,'null') ||
                                   ',status=' || COALESCE(e.status,'?') || ')', ' | ' ORDER BY e.id)
                     FROM public.eval_evaluations e WHERE e.deleted_at IS NULL), '(SIN EVALUACIONES)')

  UNION ALL
  SELECT 12, 'POLITICAS eval_evaluations/eval_areas: ' ||
         COALESCE((SELECT string_agg(tablename || '.' || policyname || '[' || cmd || ']', ' | ')
                     FROM pg_policies
                    WHERE schemaname='public' AND tablename IN ('eval_evaluations','eval_areas')), '(ninguna)')
) q
ORDER BY ord;
