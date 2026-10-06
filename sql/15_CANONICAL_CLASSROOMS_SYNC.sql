-- ================================================================
-- 15_CANONICAL_CLASSROOMS_SYNC.sql
-- Sincronización IDEMPOTENTE del catálogo OFICIAL de aulas + especiales
--
-- REGLA: name = level (iguales, SIN "Línea [Color]").
--        El color y la "línea" son metadata VISUAL en constants.js,
--        NO parte del nombre del aula (el usuario lo reportó como bug).
--
-- Coincide con: js/shared/constants.js → CANONICAL_CLASSROOMS + SPECIAL_CLASSROOMS_META
-- ================================================================
BEGIN;

-- 1. Asegurarse que classrooms tenga level/is_special (por si acaso)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='classrooms' AND column_name='level'
  ) THEN
    ALTER TABLE public.classrooms ADD COLUMN level text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='classrooms' AND column_name='is_special'
  ) THEN
    ALTER TABLE public.classrooms ADD COLUMN is_special boolean DEFAULT false;
  END IF;
END $$;

-- 2. Asegurar students tenga level_requested / suggested_level (para sincronizar)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='students' AND column_name='level_requested'
  ) THEN
    ALTER TABLE public.students ADD COLUMN level_requested text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='students' AND column_name='suggested_level'
  ) THEN
    ALTER TABLE public.students ADD COLUMN suggested_level text;
  END IF;
END $$;

-- ================================================================
-- 3. BLOQUE DE LIMPIEZA: marcar como soft-deleted aulas mal escritas
--    (duplicados manuales que el usuario creó sin usar el catálogo)
-- ================================================================
-- 3.1 Deduplicación por nombre exacto
DO $$
DECLARE
  dup RECORD;
BEGIN
  FOR dup IN
    SELECT name, MIN(id) AS keep_id, ARRAY_AGG(id ORDER BY id) AS ids
    FROM public.classrooms
    WHERE deleted_at IS NULL
    GROUP BY name
    HAVING COUNT(*) > 1
  LOOP
    UPDATE public.classrooms
    SET deleted_at = now(),
        name = name || ' (duplicado #' || id || ' — ' || to_char(now(), 'YYYYMMDD') || ')'
    WHERE id = ANY(dup.ids)
      AND id <> dup.keep_id
      AND deleted_at IS NULL;
  END LOOP;
END $$;

-- 3.2 Soft-delete de VARIANTES mal escritas de aulas canónicas.
--     Se conserva la fila que MÁS se parezca a la canónica.
--     NOTA: evitamos VALUES(..) AS t(..) directo en el FOR loop porque
--     algunas versiones/modos de PostgreSQL lo rechazan con error 42601.
--     Usamos una tabla temporal + INSERTs en su lugar.
DO $$
DECLARE
  c RECORD;
  v RECORD;
  keep_id int;
  norm_name text;
  norm_level text;
  existing_id int;   -- fila que YA usa c.canon_disp (si existe)
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _canon_lookup (
    canon_norm   text PRIMARY KEY,
    canon_disp   text NOT NULL,      -- nombre OFICIAL para hacer UPDATE al ganador
    bad_patterns text[] NOT NULL DEFAULT '{}'
  ) ON COMMIT DROP;
  TRUNCATE _canon_lookup;

  INSERT INTO _canon_lookup (canon_norm, canon_disp, bad_patterns) VALUES
    ('parvulos i',   'Párvulos I',   ARRAY['parvalo i','parvalo 1','parvulo i','maternal i','maternal 1','manternal']::text[]),
    ('parvulos ii',  'Párvulos II',  ARRAY['parvalo ii','parvalo 2','parvulo ii','maternal ii','maternal 2']::text[]),
    ('parvulos iii', 'Párvulos III', ARRAY['parvalo iii','parvalo 3','parvulo iii','maternal iii','maternal 3','parvalo']::text[]),
    ('pre-kinder',   'Pre-Kínder',   ARRAY['pre kinder','prekinder','pre-kinder blanca','prekinder blanca','pre kinder blanca']::text[]),
    ('kinder',       'Kínder',       ARRAY['kinder gris','kinder 1','kinder general']::text[]),
    ('pre-primario', 'Pre-Primario', ARRAY['pre primario','preprimario','pre-primario negra','preprimario negra','pre-primaria','pre primaria']::text[]),
    ('1 primero',    '1° Primero',   ARRAY['1ro – linea roja','1ro linea roja','1ro – primero','1ro primero','1ro roja','1 – roja','1ro','1 primaria','1 primer año','primero','1° primero','1° roja','1 grado','1º primero','1º primario']::text[]),
    ('2 segundo',    '2° Segundo',   ARRAY['2do – linea amarilla','2do linea amarilla','2do – segundo','2do segundo','2do amarilla','2 – amarilla','2do','2 primaria','segundo','2° segundo','2° amarilla','2 grado','2º segundo','2º primario']::text[]),
    ('3 tercero',    '3° Tercero',   ARRAY['3ro – linea azul','3ro linea azul','3ro – tercero','3ro tercero','3ro azul','3 – azul','3ro','3 primaria','tercero','3° tercero','3° azul','3 grado','3º tercero','3º primario']::text[]),
    ('4 cuarto',     '4° Cuarto',    ARRAY['4to – linea verde','4to linea verde','4to – cuarto','4to cuarto','4to verde','4 – verde','4to','4 primaria','cuarto','4° cuarto','4° verde','4 grado','4º cuarto','4º primario']::text[]),
    ('5 quinto',     '5° Quinto',    ARRAY['5to – linea naranja','5to linea naranja','5to – quinto','5to quinto','5to naranja','5 – naranja','5to','5 primaria','quinto','5° quinto','5° naranja','5 grado','5º quinto','5º primario']::text[]),
    ('6 sexto',      '6° Sexto',     ARRAY['6to – linea morado','6to linea morado','6to – sexto','6to sexto','6to morado','6 – morado','6to','6 primaria','sexto','6° sexto','6° morado','6 grado','6º sexto','6º primario','6to purpura','6to morada']::text[]);

  CREATE TEMP TABLE IF NOT EXISTS _candidate_rows (
    id int, score int, teacher_id uuid, norm text
  ) ON COMMIT DROP;

  FOR c IN SELECT cl.canon_norm, cl.canon_disp, cl.bad_patterns FROM _canon_lookup cl LOOP
    TRUNCATE _candidate_rows;

    FOR v IN SELECT id, name, level, teacher_id, deleted_at FROM public.classrooms LOOP
      CONTINUE WHEN v.deleted_at IS NOT NULL;

      -- Normalizar: tildes, ñ, guiones, Y AÑADIMOS ° º ª que faltaban (el bug #1).
      norm_name  := translate(lower(COALESCE(v.name,  '')),
                   'áéíóúñäëïöüàèìòùâêîôûãõ–—−-°ºª',
                   'aeiounaeiouaeiouaeiouao         ');
      norm_level := translate(lower(COALESCE(v.level, '')),
                   'áéíóúñäëïöüàèìòùâêîôûãõ–—−-°ºª',
                   'aeiounaeiouaeiouaeiouao         ');

      IF norm_name = c.canon_norm OR norm_level = c.canon_norm
         OR EXISTS (
             SELECT 1 FROM unnest(c.bad_patterns) pat
             WHERE norm_name  LIKE '%' || translate(lower(pat),
                     'áéíóúñäëïöüàèìòùâêîôûãõ–—−-°ºª',
                     'aeiounaeiouaeiouaeiouao         ') || '%'
                OR norm_level LIKE '%' || translate(lower(pat),
                     'áéíóúñäëïöüàèìòùâêîôûãõ–—−-°ºª',
                     'aeiounaeiouaeiouaeiouao         ') || '%'
         )
      THEN
        INSERT INTO _candidate_rows (id, score, teacher_id, norm)
        VALUES (
          v.id,
          CASE
            WHEN norm_name  = c.canon_norm THEN 100
            WHEN norm_level = c.canon_norm THEN 95
            ELSE 10
          END
          + CASE WHEN v.teacher_id IS NOT NULL THEN 5 ELSE 0 END,
          v.teacher_id,
          COALESCE(norm_name, norm_level)
        );
      END IF;
    END LOOP;

    -- Elegir la fila ganadora (mayor score, menor id en empate)
    IF EXISTS (SELECT 1 FROM _candidate_rows) THEN
      SELECT id INTO keep_id
        FROM _candidate_rows
       ORDER BY score DESC, id ASC
       LIMIT 1;

      -- ✅ FIX 23505: No renombrar a c.canon_disp si YA EXISTE otra fila
      --    activa con ese nombre (evita choque ux_classrooms_name_active).
      --    Si la fila con el nombre correcto ya existe, fusionar a ELLA.
      existing_id := NULL;
      SELECT id INTO existing_id
        FROM public.classrooms
       WHERE name = c.canon_disp
         AND deleted_at IS NULL
       LIMIT 1;

      IF existing_id IS NOT NULL AND existing_id <> keep_id THEN
        -- Fila con nombre OFICIAL ya existe y NO es la ganadora.
        -- Transferir teacher_id si el existente no tiene, y borrar el resto.
        UPDATE public.classrooms
           SET teacher_id = (SELECT cr.teacher_id
                               FROM public.classrooms cr
                              WHERE cr.id = keep_id
                                AND cr.teacher_id IS NOT NULL)
         WHERE id = existing_id
           AND teacher_id IS NULL
           AND EXISTS (SELECT 1 FROM public.classrooms cc
                        WHERE cc.id = keep_id AND cc.teacher_id IS NOT NULL);

        -- ✅ REASIGNAR ESTUDIANTES: moverlos de las variantes → existing_id (canónica oficial)
        UPDATE public.students
           SET classroom_id = existing_id
         WHERE classroom_id IN (SELECT id FROM _candidate_rows WHERE id <> existing_id)
           AND classroom_id IS NOT NULL;

        UPDATE public.classrooms
           SET deleted_at = now(),
               name = name || ' (variante — canon ' || c.canon_norm || ')'
         WHERE id IN (SELECT id FROM _candidate_rows WHERE id <> existing_id)
           AND deleted_at IS NULL;

      ELSE
        -- Sin conflicto: renombrar ganador a canon_disp y borrar variantes.
        UPDATE public.classrooms
           SET name  = c.canon_disp,
               level = c.canon_disp
         WHERE id = keep_id
           AND deleted_at IS NULL
           AND (name IS DISTINCT FROM c.canon_disp OR level IS DISTINCT FROM c.canon_disp);

        -- ✅ REASIGNAR ESTUDIANTES: moverlos de las variantes → keep_id (ganadora / canónica)
        UPDATE public.students
           SET classroom_id = keep_id
         WHERE classroom_id IN (SELECT id FROM _candidate_rows WHERE id <> keep_id)
           AND classroom_id IS NOT NULL;

        UPDATE public.classrooms
           SET deleted_at = now(),
               name = name || ' (variante — canon ' || c.canon_norm || ')'
         WHERE id IN (SELECT id FROM _candidate_rows WHERE id <> keep_id)
           AND deleted_at IS NULL;
      END IF;
    END IF;
  END LOOP;

  DROP TABLE IF EXISTS _candidate_rows;
  DROP TABLE IF EXISTS _canon_lookup;
END $$;

-- ================================================================
-- 3.3 LIMPIEZA FINAL: cualquier estudiante que apunte a un aula
--     SOFT-DELETED (deleted_at IS NOT NULL) se reasigna a la fila
--     ACTIVA con el mismo nombre canónico / nivel o se pone NULL.
-- ================================================================
DO $$
DECLARE
  r RECORD;
  new_id int;
BEGIN
  FOR r IN
    SELECT DISTINCT s.classroom_id AS old_id, c.name AS old_name, c.level AS old_level
    FROM public.students s
    JOIN public.classrooms c ON c.id = s.classroom_id
    WHERE c.deleted_at IS NOT NULL
      AND s.classroom_id IS NOT NULL
  LOOP
    -- Buscar aula activa que corresponda al mismo nivel canónico (por name o level)
    new_id := NULL;
    SELECT cl.id INTO new_id
      FROM public.classrooms cl
     WHERE cl.deleted_at IS NULL
       AND (
         cl.name  = REGEXP_REPLACE(r.old_name, '\s*\(variante.*$', '', 'i')
         OR cl.level = REGEXP_REPLACE(COALESCE(r.old_level, r.old_name), '\s*\(variante.*$', '', 'i')
       )
     ORDER BY cl.id ASC
     LIMIT 1;

    IF new_id IS NULL THEN
      -- Si no hay match exacto, buscar por nombre normalizado
      SELECT cl.id INTO new_id
        FROM public.classrooms cl
       WHERE cl.deleted_at IS NULL
       ORDER BY
         CASE WHEN TRANSLATE(LOWER(COALESCE(cl.name,'')), 'áéíóúñ','aeioun')
                   LIKE '%' || TRANSLATE(LOWER(REGEXP_REPLACE(COALESCE(r.old_name,''), '\s*\(.*$', '')), 'áéíóúñ','aeioun') || '%'
              THEN 0 ELSE 1 END,
         cl.id ASC
       LIMIT 1;
    END IF;

    IF new_id IS NOT NULL AND new_id <> r.old_id THEN
      UPDATE public.students SET classroom_id = new_id WHERE classroom_id = r.old_id;
    END IF;
  END LOOP;
END $$;

-- ================================================================
-- 3.4 LIMPIEZA DE DUPLICADOS NAME-level exactos (por si acaso)
--     Conserva la de MENOR id y mueve estudiantes a ella.
-- ================================================================
DO $$
DECLARE
  grp RECORD;
  keep int;
BEGIN
  FOR grp IN
    SELECT name, level, MIN(id) AS keep_me, ARRAY_AGG(id ORDER BY id) AS ids
    FROM public.classrooms
    WHERE deleted_at IS NULL AND name IS NOT NULL AND level IS NOT NULL
    GROUP BY name, level
    HAVING COUNT(*) > 1
  LOOP
    keep := grp.keep_me;
    UPDATE public.students
       SET classroom_id = keep
     WHERE classroom_id = ANY(grp.ids) AND classroom_id <> keep;
    UPDATE public.classrooms
       SET deleted_at = now(),
           name = name || ' (duplicado #' || id || ')'
     WHERE id = ANY(grp.ids) AND id <> keep AND deleted_at IS NULL;
  END LOOP;
END $$;

-- ================================================================
-- 4. Restricción única parcial requerida por ON CONFLICT ... WHERE deleted_at IS NULL
-- ================================================================
CREATE UNIQUE INDEX IF NOT EXISTS ux_classrooms_name_active
  ON public.classrooms(name)
  WHERE deleted_at IS NULL;

-- ================================================================
-- 5. UPSERT de las 12 AULAS REGULARES OFICIALES (name = level SIN línea)
-- ================================================================
INSERT INTO public.classrooms (name, level, capacity, is_special, created_at) VALUES
  ('Párvulos I',    'Párvulos I',    15, false, now()),
  ('Párvulos II',   'Párvulos II',   15, false, now()),
  ('Párvulos III',  'Párvulos III',  15, false, now()),
  ('Pre-Kínder',    'Pre-Kínder',    18, false, now()),
  ('Kínder',        'Kínder',        20, false, now()),
  ('Pre-Primario',  'Pre-Primario',  22, false, now()),
  ('1° Primero',    '1° Primero',    25, false, now()),
  ('2° Segundo',    '2° Segundo',    25, false, now()),
  ('3° Tercero',    '3° Tercero',    25, false, now()),
  ('4° Cuarto',     '4° Cuarto',     25, false, now()),
  ('5° Quinto',     '5° Quinto',     25, false, now()),
  ('6° Sexto',      '6° Sexto',      25, false, now())
ON CONFLICT (name) WHERE deleted_at IS NULL DO UPDATE
  SET level      = EXCLUDED.level,
      capacity   = EXCLUDED.capacity,
      is_special = COALESCE(classrooms.is_special, EXCLUDED.is_special)
  WHERE classrooms.level IS DISTINCT FROM EXCLUDED.level
     OR classrooms.capacity IS DISTINCT FROM EXCLUDED.capacity
     OR COALESCE(classrooms.is_special,false) IS DISTINCT FROM COALESCE(EXCLUDED.is_special,false);

-- ================================================================
-- 6. UPSERT de las 6 CLASES ESPECIALES (también en tabla classrooms
--    para que aparezcan en el panel Aulas — como el usuario solicitó).
-- ================================================================
INSERT INTO public.classrooms (name, level, capacity, is_special, created_at) VALUES
  ('Campamento de Verano', 'Verano',             20, true, now()),
  ('Inglés Afterschool',   'Inglés Afterschool', 25, true, now()),
  ('Ballet y Danza',       'Ballet / Danza',     20, true, now()),
  ('Taekwondo',            'Taekwondo',          20, true, now()),
  ('Sala de Tarea',        'Sala de Tarea',      25, true, now()),
  ('Cuido Infantil',       'Cuido',              20, true, now())
ON CONFLICT (name) WHERE deleted_at IS NULL DO UPDATE
  SET level      = EXCLUDED.level,
      capacity   = EXCLUDED.capacity,
      is_special = true
  WHERE classrooms.level IS DISTINCT FROM EXCLUDED.level
     OR classrooms.capacity IS DISTINCT FROM EXCLUDED.capacity
     OR COALESCE(classrooms.is_special,false) = false;

-- 7. Actualizar level = name para registros antiguos con level vacío
UPDATE public.classrooms
SET level = name
WHERE (level IS NULL OR level = '') AND deleted_at IS NULL;

-- 8. Índices
CREATE INDEX IF NOT EXISTS idx_classrooms_level
  ON public.classrooms(level) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_classrooms_is_special
  ON public.classrooms(is_special) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_students_level_requested
  ON public.students(level_requested) WHERE is_active = true;

COMMIT;

-- ================================================================
--  Verificación (ejecutar después del COMMIT):
-- ================================================================
--
--  1) Contar aulas activas (deben ser 18 = 12 regulares + 6 especiales):
--     SELECT COUNT(*) FROM public.classrooms WHERE deleted_at IS NULL;
--
--  2) Listarlas:
--     SELECT id, name, level, capacity, is_special, teacher_id
--     FROM public.classrooms
--     WHERE deleted_at IS NULL
--     ORDER BY is_special ASC, id ASC;
--
--  3) Ver las que se marcaron como variantes/duplicadas:
--     SELECT id, name, deleted_at FROM public.classrooms
--     WHERE deleted_at IS NOT NULL
--     ORDER BY deleted_at DESC;
--
--  4) Ver políticas / índices:
--     SELECT policyname, cmd, roles FROM pg_policies WHERE tablename='classrooms';
--
-- ================================================================
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

-- ── Por qué ya NO se usa public.add_column_if_missing(...) ─────
-- Esa función tiene dos sobrecargas:
--   14_admision_completa.sql -> (tbl text, col text, definition text)   [3 args]
--   esta migración            -> (p_table, p_column, p_type, p_default DEFAULT NULL)
-- Al llamarla con 3 argumentos Postgres no sabe cuál elegir:
--   ERROR 42725: function public.add_column_if_missing(unknown, unknown,
--                unknown) is not unique
-- Solución: ALTER TABLE directo. No depende del helper ni del orden de
-- ejecución de las migraciones.

-- ── Limpieza de la sobrecarga de 4 args ──────────────────────
-- Se elimina si existe. La versión buena es la de 3 args que define
-- 14_admision_completa.sql; la de 4 args solo la usaban migraciones
-- viejas y es la causa del 42725. Si 14 se reejecuta, la recrea (3 args).
DO $mig$
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
END $mig$;

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
-- Si lista menos, la columna faltante no se creó: revisa los NOTICE del bloque DO.
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


-- ================================================================
--  Verificación (ejecutar después del COMMIT):
-- ================================================================
--
--  1) Contar aulas activas (deben ser 18 = 12 regulares + 6 especiales):
--     SELECT COUNT(*) FROM public.classrooms WHERE deleted_at IS NULL;
--
--  2) Listarlas:
--     SELECT id, name, level, capacity, is_special, teacher_id
--     FROM public.classrooms
--     WHERE deleted_at IS NULL
--     ORDER BY is_special ASC, id ASC;
--
--  3) Ver las que se marcaron como variantes/duplicadas:
--     SELECT id, name, deleted_at FROM public.classrooms
--     WHERE deleted_at IS NOT NULL
--     ORDER BY deleted_at DESC;
--
--  4) Ver políticas / índices:
--     SELECT policyname, cmd, roles FROM pg_policies WHERE tablename='classrooms';
--
-- ================================================================


-- ============================================================
-- MIGRACIÓN 16 — Flag de contraseña temporal + notification_email
-- Fecha: 2026-10-01
-- Propósito:
--   * Detectar cuando un padre/madre inicia sesión por primera vez
--     con la contraseña temporal (sonrisa123) para forzar el cambio
--     por una contraseña segura propia.
--   * Almacenar el correo personal de notificaciones separado del
--     correo institucional de login (@sonrisacreativas.com).
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_temporary_password boolean DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notification_email text;

-- Comentarios de documentación
COMMENT ON COLUMN public.profiles.is_temporary_password
  IS 'TRUE cuando el usuario aún usa la contraseña temporal "sonrisa123" y debe cambiarla en su próximo login.';

COMMENT ON COLUMN public.profiles.notification_email
  IS 'Correo personal de la familia donde llegan acuses, cuotas y avisos (distinto del login institucional @sonrisacreativas.com).';

-- ================================================================
-- 16_fix_classroom_delete.sql
-- Corrige: "update or delete on table classrooms violates foreign key
--           constraint attendance_classroom_id_fkey on table attendance"
--
-- ESTA MIGRACION ES LA RED DE SEGURIDAD, NO EL FIX PRINCIPAL.
-- El fix principal ya esta en el codigo: rooms.module.js hace SOFT DELETE
-- (classrooms.deleted_at = now()), que es el patron que ya usa el resto del
-- proyecto (chat, gradebook, dgii). Con soft delete las filas de attendance /
-- grades / report_cards nunca se rompen porque el aula no se borra.
--
-- Esta migracion deja la base preparada para que un DELETE fisico (limpieza
-- manual, scripts, restauraciones) tambien funcione, en vez de reventar.
--
-- Causa raiz: varias tablas referencian public.classrooms(id) SIN
-- clausula ON DELETE, por lo que PostgreSQL usa NO ACTION y BLOQUEA
-- el borrado del aula aunque las columnas sean nullable.
--
-- Politica aplicada:
--   * Columnas NULLABLE (historico que debe conservarse)
--       -> ON DELETE SET NULL   (el registro se queda, pierde el aula)
--   * Columnas NOT NULL (hijos que solo existen por el aula)
--       -> ON DELETE CASCADE    (se van con el aula)
--
-- Es IDEMPOTENTE: se puede ejecutar varias veces sin efectos extra.
-- ================================================================
BEGIN;

-- ---------------------------------------------------------------
-- Helper: reconstruye la FK de una columna hacia classrooms con la
-- regla indicada. Descubre el nombre real del constraint en vez de
-- asumir el nombre por defecto de Postgres.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._tmp_repair_classroom_fk(
  p_table  text,
  p_column text,
  p_rule   text   -- 'SET NULL' | 'CASCADE'
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_constraint text;
BEGIN
  -- 1) Localizar constraint(s) FK sobre esa columna que apunten a classrooms
  FOR v_constraint IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = con.conkey[1]
    JOIN pg_class ref ON ref.oid = con.confrelid
    WHERE rel.relname = p_table
      AND att.attname = p_column
      AND con.contype = 'f'
      AND ref.relname = 'classrooms'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I DROP CONSTRAINT %I', p_table, v_constraint
    );
  END LOOP;

  -- 2) Recrear con la regla de borrado deseada
  EXECUTE format(
    'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I)
       REFERENCES public.classrooms(id) ON DELETE %s',
    p_table,
    p_table || '_' || p_column || '_fkey',
    p_column,
    p_rule
  );
END $$;

-- ---------------------------------------------------------------
-- 1) Columnas NULLABLE -> SET NULL (preserva el historial)
-- ---------------------------------------------------------------
SELECT public._tmp_repair_classroom_fk('attendance',          'classroom_id',         'SET NULL');
SELECT public._tmp_repair_classroom_fk('grades',              'classroom_id',         'SET NULL');
SELECT public._tmp_repair_classroom_fk('report_cards',        'classroom_id',         'SET NULL');
SELECT public._tmp_repair_classroom_fk('competency_scores',   'classroom_id',         'SET NULL');
SELECT public._tmp_repair_classroom_fk('student_promotions',  'from_classroom_id',    'SET NULL');
SELECT public._tmp_repair_classroom_fk('student_promotions',  'to_classroom_id',      'SET NULL');

-- Tablas opcionales (solo si existen en la base instalada)
DO $$
DECLARE
  v_nullables text[] := ARRAY[
    'classrooms_enrollments',
    'classroom_attendance',
    'schedules',
    'classroom_schedule',
    'daily_logs'
  ];
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY v_nullables LOOP
    IF to_regclass('public.' || v_table) IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = v_table
           AND column_name = 'classroom_id' AND is_nullable = 'YES'
       )
    THEN
      PERFORM public._tmp_repair_classroom_fk(v_table, 'classroom_id', 'SET NULL');
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------
-- 2) Columnas NOT NULL -> CASCADE (los hijos mueren con el aula)
-- ---------------------------------------------------------------
DO $$
DECLARE
  v_cascade text[] := ARRAY[
    'classroom_events',
    'classroom_routines',
    'nap_sessions'
  ];
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY v_cascade LOOP
    IF to_regclass('public.' || v_table) IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = v_table
           AND column_name = 'classroom_id' AND is_nullable = 'NO'
       )
    THEN
      PERFORM public._tmp_repair_classroom_fk(v_table, 'classroom_id', 'CASCADE');
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------
-- 3) students.classroom_id debe quedar en NULL al borrar el aula.
--    Ya es ON DELETE SET NULL en el esquema, pero lo garantizamos
--    aqui por si en la base viva quedo como NO ACTION.
-- ---------------------------------------------------------------
SELECT public._tmp_repair_classroom_fk('students', 'classroom_id', 'SET NULL');

-- ---------------------------------------------------------------
-- 4) Limpiar el helper temporal
-- ---------------------------------------------------------------
DROP FUNCTION IF EXISTS public._tmp_repair_classroom_fk(text, text, text);

COMMIT;

-- ===============================================================
-- FIX CORRECTIVO: Política RLS para login_attempts
-- ===============================================================
-- Problema: La política login_attempts_staff solo permite acceso a
-- roles 'directora' y 'admin'. Los inserts desde js/login.js (usuario
-- anónimo/padre sin rol staff) reciben 401 y no registran intentos.
-- Solución: Añadir política INSERT pública para anon y authenticated.
-- ===============================================================
BEGIN;

-- Asegurar que RLS esté habilitado
ALTER TABLE IF EXISTS public.login_attempts ENABLE ROW LEVEL SECURITY;

-- Eliminar política si ya existe (idempotente)
DROP POLICY IF EXISTS login_attempts_self_insert ON public.login_attempts;

-- Permitir INSERT anónimo/autenticado sin restricción (para tasa de login)
CREATE POLICY login_attempts_self_insert ON public.login_attempts
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

-- Lectura: solo staff autorizado (mantener política existente)
-- La política login_attempts_staff cubre SELECT/UPDATE/DELETE para directora/admin.
-- Añadimos una política de lectura propia si no existe.
DROP POLICY IF EXISTS login_attempts_staff_read ON public.login_attempts;
CREATE POLICY login_attempts_staff_read ON public.login_attempts
    FOR SELECT
    TO authenticated
    USING (COALESCE(get_my_role(), '') IN ('directora','admin','asistente'));

COMMIT;

-- ---------------------------------------------------------------
-- Verificacion (ejecutar despues del COMMIT):
--   SELECT policyname, cmd, roles, qual, with_check
--   FROM pg_policies
--   WHERE tablename = 'login_attempts'
--   ORDER BY policyname;
--
-- Debería aparecer al menos:
--   login_attempts_staff        | ALL  | {directora,admin}  | ...
--   login_attempts_self_insert  | INSERT| {anon,authenticated}| <empty> | true
-- ---------------------------------------------------------------

-- ---------------------------------------------------------------
-- Verificacion (ejecutar despues del COMMIT, debe listar las FKs):
--   SELECT conrelid::regclass AS tabla, conname, confdeltype
--   FROM pg_constraint
--   WHERE contype = 'f' AND confrelid = 'public.classrooms'::regclass
--   ORDER BY 1;
-- ---------------------------------------------------------------
