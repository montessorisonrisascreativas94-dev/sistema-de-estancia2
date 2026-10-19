-- ============================================================
-- 28_diagnostico_maestra.sql — SOLO LECTURA (no modifica nada)
-- Objetivo: averiguar por qué el Panel Maestra no muestra las tareas
-- del aula aunque existan filas en public.tasks.
--
-- Ejecutar COMPLETO en: Supabase Dashboard -> SQL Editor -> Run
-- y compartir el resultado (especialmente los puntos 1, 4, 5 y 8).
-- ============================================================

-- ⚠️ NOTA: en el SQL Editor auth.uid() es NULL (corre como postgres),
-- por eso aquí se diagnostica con IDs concretos, no con auth.uid().

-- --------------------------------------------------------------------
-- 1) PERFILES: ¿cuál es el rol real de cada usuario? (role debe ser
--    exactamente 'maestra' para que la política RLS de tasks lo deje ver)
-- --------------------------------------------------------------------
SELECT '1. PERFILES' AS seccion, id, email, name, role, is_active
FROM public.profiles
ORDER BY role, name;

-- --------------------------------------------------------------------
-- 2) ¿Existe el perfil de la maestra conocida y con qué rol?
-- --------------------------------------------------------------------
SELECT '2. PERFIL MAESTRA' AS seccion, id, email, name, role
FROM public.profiles
WHERE id = '14754254-afd3-48fe-8ada-acaa7cc537e8'::uuid;

-- --------------------------------------------------------------------
-- 3) get_my_role() para un usuario concreto (lo que ve el RLS).
--    Reemplaza el uuid si hace falta.
-- --------------------------------------------------------------------
SELECT '3. ROLE DE MAESTRA' AS seccion, public.get_my_role() AS role_del_usuario_logueado_actual;

-- --------------------------------------------------------------------
-- 4) AULAS: id, nombre, teacher_id. Confirma a qué aula está asignada
--    la maestra y su id (el panel filtra por teacher_id = user.id).
-- --------------------------------------------------------------------
SELECT '4. AULAS' AS seccion, c.id AS classroom_id, c.name, c.level,
       c.teacher_id, p.name AS teacher_name, p.role AS teacher_role
FROM public.classrooms c
LEFT JOIN public.profiles p ON p.id = c.teacher_id
WHERE c.deleted_at IS NULL
ORDER BY c.name;

-- --------------------------------------------------------------------
-- 5) TAREAS: todas las filas y su aula/maestra. Compara classroom_id
--    con el id de aula de la maestra (punto 4).
-- --------------------------------------------------------------------
SELECT '5. TAREAS' AS seccion, t.id, t.classroom_id, c.name AS classroom_name,
       t.teacher_id, t.title, t.due_date, t.created_at, t.period_id
FROM public.tasks t
LEFT JOIN public.classrooms c ON c.id = t.classroom_id
ORDER BY t.created_at DESC;

-- --------------------------------------------------------------------
-- 6) ESTUDIANTES por aula (para comparar con visibilidad de tareas:
--    students_select es abierta; tasks_staff_all depende del rol).
-- --------------------------------------------------------------------
SELECT '6. ESTUDIANTES' AS seccion, s.classroom_id, c.name AS classroom_name,
       count(*) AS total
FROM public.students s
LEFT JOIN public.classrooms c ON c.id = s.classroom_id
GROUP BY s.classroom_id, c.name
ORDER BY c.name;

-- --------------------------------------------------------------------
-- 7) BOLETÍN: ¿hay evaluación / áreas / actividades? (si está vacío,
--    el modal "Nueva Tarea" mostrará "Sin áreas configuradas").
--    Se revisa dinámicamente para no fallar si alguna tabla no existe.
-- --------------------------------------------------------------------
DO $$
DECLARE t text; n bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY['eval_evaluations','eval_areas','eval_periods','eval_modules','eval_activities'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
      RAISE NOTICE '[7. BOLETIN] % = % filas', t, n;
    ELSE
      RAISE NOTICE '[7. BOLETIN] % NO EXISTE', t;
    END IF;
  END LOOP;
END $$;

-- --------------------------------------------------------------------
-- 8) POLÍTICAS RLS de tasks: nombre, comando y expresión USING/WITH CHECK.
--    Verifica que exista "tasks_staff_all" incluyendo 'maestra'.
-- --------------------------------------------------------------------
SELECT '8. POLITICAS tasks' AS seccion, policyname, cmd, roles, qual AS using_expr, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'tasks';

-- RLS activo en tasks y si es forzado
SELECT '8b. RLS tasks' AS seccion, relname, relrowsecurity AS rls_activo,
       relforcerowsecurity AS rls_forzado
FROM pg_class
WHERE relname IN ('tasks','task_evidences','eval_areas','eval_activities');

-- --------------------------------------------------------------------
-- 9) POLÍTICAS RLS del boletín (estructura)
-- --------------------------------------------------------------------
SELECT '9. POLITICAS eval_*' AS seccion, tablename, policyname, cmd, roles, qual AS using_expr
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('eval_evaluations','eval_areas','eval_periods','eval_modules','eval_activities')
ORDER BY tablename, policyname;

-- ====================================================================
-- 10) VEREDICTO AUTOMÁTICO: simula la política tasks_staff_all para
--     cada perfil y lista cuántas tareas vería del aula indicada.
--     Si tu fila sale con 0 y el punto 5 muestra tareas, el problema
--     es el rol del perfil (role <> 'maestra') o el classroom_id.
-- ====================================================================
SELECT '10. VEREDICTO' AS seccion,
       p.id AS profile_id, p.name, p.role,
       COALESCE(p.role,'') IN ('directora','asistente','maestra','encargada','admin') AS rol_autorizado_tasks,
       (SELECT count(*) FROM public.classrooms c WHERE c.teacher_id = p.id AND c.deleted_at IS NULL) AS aulas_asignadas,
       (SELECT count(*) FROM public.tasks t
          WHERE p.role IN ('directora','asistente','maestra','encargada','admin')
            AND t.classroom_id IN (SELECT c2.id FROM public.classrooms c2 WHERE c2.teacher_id = p.id)
       ) AS tareas_visibles_por_rls
FROM public.profiles p
WHERE p.role IS NOT NULL
ORDER BY p.role, p.name;

SELECT '28_diagnostico_maestra.sql ejecutado. Comparte el resultado de los puntos 1, 4, 5 y 8.' AS resultado;
