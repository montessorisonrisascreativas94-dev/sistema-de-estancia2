-- ================================================================
-- 20_AULAS_LIMPIEZA_FINAL.sql
-- Limpieza FINAL e idempotente de la tabla `classrooms`
--
-- Ejecutar en: Supabase → SQL Editor → New query → Run
-- Se puede re-ejecutar varias veces sin provocar daños.
--
-- ⚠️ NO re-ejecutar 15_CANONICAL_CLASSROOMS_SYNC.sql (es un grab-bag
--    con migraciones 16/17, FKs y RLS; su bloque de limpieza tenía
--    patrones LIKE '%parvalo%' que pueden reasignar estudiantes al
--    aula equivocada). Usar SOLO este archivo.
--
-- ORDEN (importante, corregido respecto al 15):
--   0a) Columnas de seguridad
--   0b) Helper _repoint_classroom: mueve classroom_id en TODAS las
--       tablas con FK a classrooms (descubiertas en runtime)
--   0c) Dedupe de nombres EXACTOS activos
--   0d) Índice único parcial
--   1) Diagnóstico inicial (NOTICE)
--   2) Upsert de las 18 aulas oficiales PRIMERO
--      (para que exista la fila oficial a la que fusionar)
--   3) Funciones helper: _aula_strip_suffix / _aula_norm /
--      _aula_catalog (match ESTRICTO: igualdad exacta tras
--      normalizar, NUNCA LIKE '%patron%')
--   4) Fusión/renombre de filas activas sucias → oficial
--      (mueve estudiantes, maestra y TODAS las tablas relacionadas
--       a la oficial; nunca al revés)
--   5) Re-apunta estudiantes (y todo lo relacionado) que siguen en
--      aulas borradas
--   6) Restaura maestra de aulas borradas a la oficial vacía
--   7) TOMBSTONE: renombra TODAS las borradas al nombre canónico oficial
--      (el índice único es parcial WHERE deleted_at IS NULL → no choca)
--   8) level = name en activas regulares (especiales conservan su level)
--   COMMIT + verificación final (SELECTs)
-- ================================================================

BEGIN;

-- ================================================================
-- 0) COLUMNAS DE SEGURIDAD → DEDUPE EXACTO → ÍNDICE ÚNICO
-- ================================================================
-- 0a) Columnas (idempotente). Se hacen PRIMERO porque el resto del
--     script (dedupe, índice, upserts) depende de que existan.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='classrooms' AND column_name='level'
  ) THEN
    ALTER TABLE public.classrooms ADD COLUMN level text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='classrooms' AND column_name='is_special'
  ) THEN
    ALTER TABLE public.classrooms ADD COLUMN is_special boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='classrooms' AND column_name='deleted_at'
  ) THEN
    ALTER TABLE public.classrooms ADD COLUMN deleted_at timestamptz;
  END IF;
END $$;

-- 0b) Helper _repoint_classroom(p_old, p_new): mueve TODAS las filas
--     que referencian el aula vieja hacia la nueva. Descubre en
--     runtime todas las columnas con FK a classrooms(id) (students,
--     student_enrollments, attendance, tasks, periods, posts, grades,
--     report_cards, …) → nada queda huérfano al fusionar. Si una tabla
--     tiene clave única que chocaría (p.ej. teacher_schedules
--     UNIQUE(classroom_id, event_key)), esa fila se omite y se avisa.
CREATE OR REPLACE FUNCTION public._repoint_classroom(p_old bigint, p_new bigint)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  fk  RECORD;
  r   RECORD;
  cur REFCURSOR;
  n   int := 0;
BEGIN
  IF p_old IS NULL OR p_new IS NULL OR p_old = p_new THEN
    RETURN;
  END IF;
  FOR fk IN
    SELECT a.attrelid::regclass::text AS tbl, a.attname AS col
      FROM pg_constraint c
      JOIN pg_attribute a
        ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
     WHERE c.contype = 'f'
       AND c.confrelid = 'public.classrooms'::regclass
     ORDER BY a.attrelid::regclass::text, a.attname
  LOOP
    OPEN cur FOR EXECUTE
      format('SELECT ctid FROM %s WHERE %I = $1 FOR UPDATE', fk.tbl, fk.col)
      USING p_old;
    LOOP
      FETCH cur INTO r;
      EXIT WHEN NOT FOUND;
      BEGIN
        EXECUTE format('UPDATE %s SET %I = $1 WHERE ctid = $2', fk.tbl, fk.col)
          USING p_new, r.ctid;
        n := n + 1;
      EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE '  %: fila con clave única duplicada en destino → NO movida', fk.tbl;
      END;
    END LOOP;
    CLOSE cur;
  END LOOP;
  IF n > 0 THEN
    RAISE NOTICE '  % fila(s) re-apuntadas de aula id=% → id=% (todas las tablas con FK)', n, p_old, p_new;
  END IF;
END;
$$;

-- 0c) Si dos activas tienen EXACTAMENTE el mismo nombre (solo posible
--     si el índice único no existía aún), conservar la de menor id.
DO $$
DECLARE
  dup RECORD;
  keep bigint;
  d bigint;
BEGIN
  FOR dup IN
    SELECT name, MIN(id) AS keep_id, ARRAY_AGG(id ORDER BY id) AS ids
    FROM public.classrooms
    WHERE deleted_at IS NULL AND name IS NOT NULL
    GROUP BY name
    HAVING COUNT(*) > 1
  LOOP
    keep := dup.keep_id;
    FOREACH d IN ARRAY dup.ids LOOP
      IF d <> keep THEN
        PERFORM public._repoint_classroom(d, keep);
      END IF;
    END LOOP;
    UPDATE public.classrooms
       SET deleted_at = now()
     WHERE id = ANY(dup.ids) AND id <> keep AND deleted_at IS NULL;
    RAISE NOTICE 'DEDUPE EXACTO: % activas llamadas "%" → se conserva la id %',
      array_length(dup.ids, 1), dup.name, keep;
  END LOOP;
END $$;

-- 0d) Índice único parcial (requerido por los ON CONFLICT de los upserts)
CREATE UNIQUE INDEX IF NOT EXISTS ux_classrooms_name_active
  ON public.classrooms(name)
  WHERE deleted_at IS NULL;

-- ================================================================
-- 1) DIAGNÓSTICO INICIAL
-- ================================================================
DO $$
DECLARE
  n int;
  r RECORD;
BEGIN
  RAISE NOTICE '================ DIAGNÓSTICO INICIAL ================';

  SELECT COUNT(*) INTO n FROM public.classrooms WHERE deleted_at IS NULL;
  RAISE NOTICE 'Aulas activas: %', n;

  RAISE NOTICE '-- Activas SUCIAS (sufijo variante/duplicado o "parvalo"):';
  FOR r IN
    SELECT id, name, level, teacher_id
    FROM public.classrooms
    WHERE deleted_at IS NULL
      AND (
        name ~* '\((variante|duplicado|duplicada|copia|fusion|fusión)'
        OR name ~* 'parvalo'
        OR COALESCE(level,'') ~* '\((variante|duplicado|duplicada|copia|fusion|fusión)'
        OR COALESCE(level,'') ~* 'parvalo'
      )
    ORDER BY id
  LOOP
    RAISE NOTICE '  id=% name=% level=% teacher=%', r.id, r.name, COALESCE(r.level,'<null>'), COALESCE(r.teacher_id::text,'<sin>');
  END LOOP;

  RAISE NOTICE '-- Activas con name <> level (regulares mal sincronizadas):';
  FOR r IN
    SELECT id, name, level FROM public.classrooms
    WHERE deleted_at IS NULL
      AND COALESCE(is_special, false) = false
      AND COALESCE(level,'') <> name
    ORDER BY id
  LOOP
    RAISE NOTICE '  id=% name=% level=%', r.id, r.name, COALESCE(r.level,'<null>');
  END LOOP;

  SELECT COUNT(*) INTO n
  FROM public.students s JOIN public.classrooms c ON c.id = s.classroom_id
  WHERE c.deleted_at IS NOT NULL;
  RAISE NOTICE 'Estudiantes apuntando a aulas BORRADAS: %', n;

  SELECT COUNT(*) INTO n
  FROM public.classrooms WHERE deleted_at IS NOT NULL AND teacher_id IS NOT NULL;
  RAISE NOTICE 'Aulas borradas que AÚN tienen maestra: %', n;

  SELECT COUNT(*) INTO n FROM public.classrooms WHERE deleted_at IS NOT NULL;
  RAISE NOTICE 'Aulas borradas (histórico): %', n;
  RAISE NOTICE '======================================================';
END $$;

-- ================================================================
-- 2) UPSERT de las 18 AULAS OFICIALES (PRIMERO, para poder fusionar)
--    12 regulares: name = level (sin "Línea [Color]"; eso es metadata
--    visual de constants.js, no parte del nombre).
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
  ('6° Sexto',      '6° Sexto',      25, false, now()),
  ('Campamento de Verano', 'Verano',             20, true, now()),
  ('Inglés Afterschool',   'Inglés Afterschool', 25, true, now()),
  ('Ballet y Danza',       'Ballet / Danza',     20, true, now()),
  ('Taekwondo',            'Taekwondo',          20, true, now()),
  ('Sala de Tarea',        'Sala de Tarea',      25, true, now()),
  ('Cuido Infantil',       'Cuido',              20, true, now())
ON CONFLICT (name) WHERE deleted_at IS NULL DO UPDATE
  SET level      = EXCLUDED.level,
      is_special = EXCLUDED.is_special
  WHERE public.classrooms.level      IS DISTINCT FROM EXCLUDED.level
     OR COALESCE(public.classrooms.is_special,false) IS DISTINCT FROM COALESCE(EXCLUDED.is_special,false);
-- Nota: capacity NO se toca en filas existentes (el docente pudo
-- ajustarlo a mano); solo se usa el default al INSERTAR una nueva.

-- ================================================================
-- 3) HELPERS: normalización ESTRICTA
--    (el error del 15 era LIKE '%pat%' → "parvalo" borraba/movía
--     estudiantes al aula equivocada; aquí SOLO hay igualdad exacta)
-- ================================================================

-- 3a) _aula_strip_suffix(texto): quita el sufijo sucio
--     "(variante…)" / "(duplicado #…)" / "(dup…)" conservando la
--     caja y tildes ORIGINALES. Devuelve NULL si no queda nada.
CREATE OR REPLACE FUNCTION public._aula_strip_suffix(t text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT NULLIF(btrim(regexp_replace(COALESCE(t, ''),
    '\s*[\(\[]?\s*(variante|duplicado|duplicada|dup|copia|fusion|fusión)\b[^\)\]]*\)?\s*$',
    '', 'i')), '');
$$;

-- 3b) _aula_norm(texto): minúsculas → quita sufijo sucio → quita
--     tildes/ñ/grados/guiones y "/" (→ espacio) → colapsa espacios.
--     (el colapso va DESPUÉS del translate: si no, "1° Primero"
--      quedaría como "1  primero" con doble espacio). NULL si vacío.
CREATE OR REPLACE FUNCTION public._aula_norm(t text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT NULLIF(btrim(
    regexp_replace(
      translate(
        public._aula_strip_suffix(lower(COALESCE(t, ''))),
        'áéíóúñäëïöüàèìòùâêîôûãõ–—−-°ºª/',
        'aeiounaeiouaeiouaeiouao        '),
      '\s+', ' ', 'g')
  ), '');
$$;

-- 3c) _aula_catalog(texto): devuelve (nombre_oficial, nivel_oficial,
--     es_especial) si — y SOLO SI — el texto normalizado es IGUAL a una
--     entrada del catálogo. Si no, no devuelve filas.
CREATE OR REPLACE FUNCTION public._aula_catalog(p text)
RETURNS TABLE (official_name text, official_level text, is_special_aula boolean)
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  WITH n AS (SELECT public._aula_norm(p) AS v),
  cat(norm, oname, olevel, sp) AS (
    VALUES
      -- ===== 12 regulares (norm = nombre oficial normalizado) =====
      ('parvulos i',     'Párvulos I',    'Párvulos I',    false),
      ('parvulos ii',    'Párvulos II',   'Párvulos II',   false),
      ('parvulos iii',   'Párvulos III',  'Párvulos III',  false),
      ('pre kinder',     'Pre-Kínder',    'Pre-Kínder',    false),
      ('kinder',         'Kínder',        'Kínder',        false),
      ('pre primario',   'Pre-Primario',  'Pre-Primario',  false),
      ('1 primero',      '1° Primero',    '1° Primero',    false),
      ('2 segundo',      '2° Segundo',    '2° Segundo',    false),
      ('3 tercero',      '3° Tercero',    '3° Tercero',    false),
      ('4 cuarto',       '4° Cuarto',     '4° Cuarto',     false),
      ('5 quinto',       '5° Quinto',     '5° Quinto',     false),
      ('6 sexto',        '6° Sexto',      '6° Sexto',      false),

      -- ===== 6 especiales (level = CLAVE corta, como las usa la
      --      admisión y validateAgeForClassroom: 'Verano', 'Cuido'…) =====
      ('campamento de verano', 'Campamento de Verano', 'Verano',             true),
      ('campamento',           'Campamento de Verano', 'Verano',             true),
      ('verano',               'Campamento de Verano', 'Verano',             true),
      ('ingles afterschool',   'Inglés Afterschool',   'Inglés Afterschool', true),
      ('ingles',               'Inglés Afterschool',   'Inglés Afterschool', true),
      ('ballet y danza',       'Ballet y Danza',       'Ballet / Danza',     true),
      ('ballet danza',         'Ballet y Danza',       'Ballet / Danza',     true),
      ('ballet',               'Ballet y Danza',       'Ballet / Danza',     true),
      ('taekwondo',            'Taekwondo',            'Taekwondo',          true),
      ('sala de tarea',        'Sala de Tarea',        'Sala de Tarea',      true),
      ('tarea',                'Sala de Tarea',        'Sala de Tarea',      true),
      ('cuido infantil',       'Cuido Infantil',       'Cuido',              true),
      ('cuido',                'Cuido Infantil',       'Cuido',              true),

      -- ===== Alias EXACTOS de errores comunes =====
      -- Párvulos (NUNCA incluimos el suelto "parvalo": es ambiguo
      -- entre I/II/III y el 15 lo mandaba a III por LIKE '%…%')
      ('parvalo i',    'Párvulos I',    'Párvulos I',    false),
      ('parvalo 1',    'Párvulos I',    'Párvulos I',    false),
      ('parvulo i',    'Párvulos I',    'Párvulos I',    false),
      ('parvulo 1',    'Párvulos I',    'Párvulos I',    false),
      ('maternal i',   'Párvulos I',    'Párvulos I',    false),
      ('maternal 1',   'Párvulos I',    'Párvulos I',    false),
      ('manternal',    'Párvulos I',    'Párvulos I',    false),
      ('parvalo ii',   'Párvulos II',   'Párvulos II',   false),
      ('parvalo 2',    'Párvulos II',   'Párvulos II',   false),
      ('parvulo ii',   'Párvulos II',   'Párvulos II',   false),
      ('parvulo 2',    'Párvulos II',   'Párvulos II',   false),
      ('maternal ii',  'Párvulos II',   'Párvulos II',   false),
      ('maternal 2',   'Párvulos II',   'Párvulos II',   false),
      ('parvalo iii',  'Párvulos III',  'Párvulos III',  false),
      ('parvalo 3',    'Párvulos III',  'Párvulos III',  false),
      ('parvulo iii',  'Párvulos III',  'Párvulos III',  false),
      ('parvulo 3',    'Párvulos III',  'Párvulos III',  false),
      ('maternal iii', 'Párvulos III',  'Párvulos III',  false),
      ('maternal 3',   'Párvulos III',  'Párvulos III',  false),
      -- Errores de tipeo frecuentes
      ('parrulos i',   'Párvulos I',    'Párvulos I',    false),
      ('parrulos ii',  'Párvulos II',   'Párvulos II',   false),
      ('parrulos iii', 'Párvulos III',  'Párvulos III',  false),
      ('parvullos i',  'Párvulos I',    'Párvulos I',    false),
      ('parvullos ii', 'Párvulos II',   'Párvulos II',   false),
      ('parvullos iii','Párvulos III',  'Párvulos III',  false),

      -- Pre-Kínder / Kínder / Pre-Primario
      ('prekinder',          'Pre-Kínder',   'Pre-Kínder',   false),
      ('pre kinder blanca',  'Pre-Kínder',   'Pre-Kínder',   false),
      ('prekinder blanca',   'Pre-Kínder',   'Pre-Kínder',   false),
      ('kinder gris',        'Kínder',       'Kínder',       false),
      ('kinder 1',           'Kínder',       'Kínder',       false),
      ('kinder general',     'Kínder',       'Kínder',       false),
      ('pre primario',       'Pre-Primario', 'Pre-Primario', false),
      ('preprimario',        'Pre-Primario', 'Pre-Primario', false),
      ('pre primario negra', 'Pre-Primario', 'Pre-Primario', false),
      ('preprimario negra',  'Pre-Primario', 'Pre-Primario', false),
      ('pre primaria',       'Pre-Primario', 'Pre-Primario', false),
      ('preprimaria',        'Pre-Primario', 'Pre-Primario', false),

      -- 1°..6°
      ('1ro',            '1° Primero', '1° Primero', false),
      ('1ro linea roja', '1° Primero', '1° Primero', false),
      ('1ro primero',    '1° Primero', '1° Primero', false),
      ('1ro roja',       '1° Primero', '1° Primero', false),
      ('1 roja',         '1° Primero', '1° Primero', false),
      ('1 primaria',     '1° Primero', '1° Primero', false),
      ('1 primer ano',   '1° Primero', '1° Primero', false),
      ('primero',        '1° Primero', '1° Primero', false),
      ('1 grado',        '1° Primero', '1° Primero', false),
      ('1 primario',     '1° Primero', '1° Primero', false),

      ('2do',             '2° Segundo', '2° Segundo', false),
      ('2do linea amarilla', '2° Segundo', '2° Segundo', false),
      ('2do segundo',     '2° Segundo', '2° Segundo', false),
      ('2do amarilla',    '2° Segundo', '2° Segundo', false),
      ('2 amarilla',      '2° Segundo', '2° Segundo', false),
      ('2 primaria',      '2° Segundo', '2° Segundo', false),
      ('segundo',         '2° Segundo', '2° Segundo', false),
      ('2 grado',         '2° Segundo', '2° Segundo', false),
      ('2 primario',      '2° Segundo', '2° Segundo', false),

      ('3ro',             '3° Tercero', '3° Tercero', false),
      ('3ro linea azul',  '3° Tercero', '3° Tercero', false),
      ('3ro tercero',     '3° Tercero', '3° Tercero', false),
      ('3ro azul',        '3° Tercero', '3° Tercero', false),
      ('3 azul',          '3° Tercero', '3° Tercero', false),
      ('3 primaria',      '3° Tercero', '3° Tercero', false),
      ('tercero',         '3° Tercero', '3° Tercero', false),
      ('3 grado',         '3° Tercero', '3° Tercero', false),
      ('3 primario',      '3° Tercero', '3° Tercero', false),

      ('4to',             '4° Cuarto',  '4° Cuarto',  false),
      ('4to linea verde', '4° Cuarto',  '4° Cuarto',  false),
      ('4to cuarto',      '4° Cuarto',  '4° Cuarto',  false),
      ('4to verde',       '4° Cuarto',  '4° Cuarto',  false),
      ('4 verde',         '4° Cuarto',  '4° Cuarto',  false),
      ('4 primaria',      '4° Cuarto',  '4° Cuarto',  false),
      ('cuarto',          '4° Cuarto',  '4° Cuarto',  false),
      ('4 grado',         '4° Cuarto',  '4° Cuarto',  false),
      ('4 primario',      '4° Cuarto',  '4° Cuarto',  false),

      ('5to',             '5° Quinto',  '5° Quinto',  false),
      ('5to linea naranja','5° Quinto', '5° Quinto',  false),
      ('5to quinto',      '5° Quinto',  '5° Quinto',  false),
      ('5to naranja',     '5° Quinto',  '5° Quinto',  false),
      ('5 naranja',       '5° Quinto',  '5° Quinto',  false),
      ('5 primaria',      '5° Quinto',  '5° Quinto',  false),
      ('quinto',          '5° Quinto',  '5° Quinto',  false),
      ('5 grado',         '5° Quinto',  '5° Quinto',  false),
      ('5 primario',      '5° Quinto',  '5° Quinto',  false),

      ('6to',             '6° Sexto',   '6° Sexto',   false),
      ('6to linea morado','6° Sexto',   '6° Sexto',   false),
      ('6to sexto',       '6° Sexto',   '6° Sexto',   false),
      ('6to morado',      '6° Sexto',   '6° Sexto',   false),
      ('6 morado',        '6° Sexto',   '6° Sexto',   false),
      ('6 primaria',      '6° Sexto',   '6° Sexto',   false),
      ('sexto',           '6° Sexto',   '6° Sexto',   false),
      ('6 grado',         '6° Sexto',   '6° Sexto',   false),
      ('6 primario',      '6° Sexto',   '6° Sexto',   false),
      ('6to purpura',     '6° Sexto',   '6° Sexto',   false),
      ('6to morada',      '6° Sexto',   '6° Sexto',   false)
  )
  SELECT cat.oname, cat.olevel, cat.sp
  FROM n, cat
  WHERE n.v IS NOT NULL
    AND cat.norm = n.v
  LIMIT 1;
$$;

-- 3d) _aula_canon(texto): versión ESCALAR (segura para usar en WHERE).
--     Devuelve el nombre oficial o NULL si no hay match estricto.
CREATE OR REPLACE FUNCTION public._aula_canon(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT c.official_name
  FROM public._aula_catalog(p) c
  LIMIT 1;
$$;

-- ================================================================
-- 4) FUSIÓN / RENOMBRE de activas sucias → oficial
--     * Si YA existe una activa con el nombre oficial → fusionar
--       (estudiantes + maestra + tablas relacionadas van a la oficial;
--        la sucia se soft-deleta)
--     * Si NO existe → renombrar la sucia a la oficial
--     * Sin match estricto → NO se toca (se reporta en el paso final)
-- ================================================================
DO $$
DECLARE
  v RECORD;
  canon text;
  canon_lvl text;
  sp boolean;
  occupant bigint;
  stripped text;
BEGIN
  RAISE NOTICE '================ PASO 4: FUSIÓN/RENOMBRE ================';
  FOR v IN
    SELECT id, name, level, teacher_id, is_special
    FROM public.classrooms
    WHERE deleted_at IS NULL
    ORDER BY id
  LOOP
    SELECT c.official_name, c.official_level, c.is_special_aula
      INTO canon, canon_lvl, sp
      FROM public._aula_catalog(v.name) c;
    IF canon IS NULL THEN
      SELECT c.official_name, c.official_level, c.is_special_aula
        INTO canon, canon_lvl, sp
        FROM public._aula_catalog(v.level) c;
    END IF;

    -- Sin match estricto: es un aula "custom" (no del catálogo).
    -- Solo quitamos el sufijo sucio si lo trae (conservando caja y
    -- tildes originales); NO la renombramos a minúsculas ni adivinamos
    -- nivel.
    IF canon IS NULL THEN
      stripped := public._aula_strip_suffix(v.name);
      IF stripped IS NOT NULL AND stripped IS DISTINCT FROM v.name THEN
        SELECT id INTO occupant FROM public.classrooms
         WHERE name = stripped AND deleted_at IS NULL;
        IF occupant IS NULL THEN
          UPDATE public.classrooms
             SET name = stripped
           WHERE id = v.id;
          RAISE NOTICE '  id=% → nombre limpio "%"', v.id, stripped;
        END IF;
      END IF;
      CONTINUE;
    END IF;

    SELECT id INTO occupant FROM public.classrooms
     WHERE name = canon AND deleted_at IS NULL;

    IF occupant IS NULL THEN
      -- Nadie tiene el nombre oficial: renombrar esta fila a la oficial
      UPDATE public.classrooms
         SET name = canon,
             level = canon_lvl,
             is_special = sp
       WHERE id = v.id;
      RAISE NOTICE '  RENOMBRE: id=% "%" → "%" (nivel "%")', v.id, v.name, canon, canon_lvl;
    ELSIF occupant <> v.id THEN
      -- La oficial ya existe: fusionar v.id → occupant (los estudiantes
      -- y la maestra van A la oficial, nunca al revés)
      RAISE NOTICE '  FUSIÓN: id=% "%" → id=% "%"', v.id, v.name, occupant, canon;

      -- Mueve estudiantes, matrículas, asistencias, tareas, periodos,
      -- publicaciones… (TODA tabla con FK a classrooms)
      PERFORM public._repoint_classroom(v.id, occupant);

      IF v.teacher_id IS NOT NULL THEN
        UPDATE public.classrooms
           SET teacher_id = v.teacher_id
         WHERE id = occupant AND teacher_id IS NULL;
        IF NOT FOUND THEN
          RAISE NOTICE '  MAESTRA HUÉRFANA: % (aula borrada id=% no pudo ceder su maestra: la oficial id=% ya tiene una)',
            v.teacher_id, v.id, occupant;
        END IF;
      END IF;

      UPDATE public.classrooms
         SET deleted_at = now()
       WHERE id = v.id AND deleted_at IS NULL;
    ELSE
      -- Esta fila YA es la oficial: solo alinear level/is_special
      UPDATE public.classrooms
         SET level = canon_lvl,
             is_special = sp
       WHERE id = v.id
         AND (level IS DISTINCT FROM canon_lvl
              OR COALESCE(is_special,false) IS DISTINCT FROM COALESCE(sp,false));
    END IF;
  END LOOP;
END $$;

-- ================================================================
-- 5) RE-APUNTAR estudiantes (y todas las tablas con FK: asistencias,
--     tareas, periodos, …) que siguen en aulas borradas
--     Match ESTRICTO por catálogo; si no hay correspondencia se DEJAN
--     donde están y se reporta (el 15 los reasignaba al azar con
--     LIKE '%%' — eso ya no ocurre).
-- ================================================================
DO $$
DECLARE
  v RECORD;
  canon text;
  tgt bigint;
  moved int;
  pend int := 0;
BEGIN
  RAISE NOTICE '============= PASO 5: RE-APUNTE DE ESTUDIANTES =============';
  FOR v IN
    SELECT DISTINCT c.id AS cid, c.name AS cname, c.level AS clevel
    FROM public.students s
    JOIN public.classrooms c ON c.id = s.classroom_id
    WHERE c.deleted_at IS NOT NULL
  LOOP
    SELECT co.official_name INTO canon
      FROM public._aula_catalog(v.cname) co;
    IF canon IS NULL THEN
      SELECT co.official_name INTO canon
        FROM public._aula_catalog(v.clevel) co;
    END IF;

    tgt := NULL;
    IF canon IS NOT NULL THEN
      SELECT id INTO tgt FROM public.classrooms
       WHERE name = canon AND deleted_at IS NULL;
    END IF;

    IF tgt IS NULL THEN
      pend := pend + 1;
      RAISE NOTICE '  PENDIENTE: aula borrada id=% "%" → SIN correspondencia estricta; estudiantes NO se mueven',
        v.cid, v.cname;
      CONTINUE;
    END IF;

    SELECT COUNT(*) INTO moved
      FROM public.students WHERE classroom_id = v.cid;
    PERFORM public._repoint_classroom(v.cid, tgt);
    RAISE NOTICE '  id=% "%" → id=% "%": % estudiante(s) reasignados (y tablas relacionadas)',
      v.cid, v.cname, tgt, canon, moved;
  END LOOP;
  RAISE NOTICE 'Re-apunte: % aula(s) borrada(s) sin correspondencia (dejadas intactas)', pend;
END $$;

-- ================================================================
-- 6) RESTAURAR maestra: si una oficial quedó SIN maestra y sus
--     variantes borradas tenían una → devolvérsela (la más reciente).
-- ================================================================
DO $$
DECLARE
  a RECORD;
  tid uuid;
  cnt int;
  acanon text;
BEGIN
  RAISE NOTICE '=============== PASO 6: RESTAURAR MAESTRAS ===============';
  FOR a IN
    SELECT id, name, level FROM public.classrooms
    WHERE deleted_at IS NULL AND teacher_id IS NULL
  LOOP
    acanon := COALESCE(public._aula_canon(a.name), public._aula_canon(a.level));
    CONTINUE WHEN acanon IS NULL;

    SELECT COUNT(DISTINCT d.teacher_id) INTO cnt
      FROM public.classrooms d
     WHERE d.deleted_at IS NOT NULL
       AND d.teacher_id IS NOT NULL
       AND COALESCE(public._aula_canon(d.name), public._aula_canon(d.level)) = acanon;

    IF COALESCE(cnt, 0) > 0 THEN
      SELECT d.teacher_id INTO tid
        FROM public.classrooms d
       WHERE d.deleted_at IS NOT NULL
         AND d.teacher_id IS NOT NULL
         AND COALESCE(public._aula_canon(d.name), public._aula_canon(d.level)) = acanon
       ORDER BY d.deleted_at DESC, d.id DESC
       LIMIT 1;

      IF tid IS NOT NULL THEN
        UPDATE public.classrooms SET teacher_id = tid WHERE id = a.id AND teacher_id IS NULL;
        IF cnt > 1 THEN
          RAISE NOTICE '  VARIAS maestras candidatas para "%" (id=%): se tomó la más reciente (%)', a.name, a.id, tid;
        ELSE
          RAISE NOTICE '  Maestra % restaurada en aula "%" (id=%)', tid, a.name, a.id;
        END IF;
      END IF;
    END IF;
  END LOOP;
END $$;

-- ================================================================
-- 7) TOMBSTONE: TODA fila borrada pasa a llamarse con su nombre
--     canónico oficial (sufijos "(variante…)" / "(duplicado#)" fuera).
--     El índice único es parcial (WHERE deleted_at IS NULL) → no choca.
-- ================================================================
DO $$
DECLARE
  d RECORD;
  canon text;
  newname text;
BEGIN
  RAISE NOTICE '================== PASO 7: TOMBSTONES ==================';
  FOR d IN
    SELECT id, name, level FROM public.classrooms
    WHERE deleted_at IS NOT NULL
    ORDER BY id
  LOOP
    SELECT co.official_name INTO canon FROM public._aula_catalog(d.name) co;
    IF canon IS NULL THEN
      SELECT co.official_name INTO canon FROM public._aula_catalog(d.level) co;
    END IF;

    IF canon IS NOT NULL THEN
      newname := canon;
    ELSIF public._aula_strip_suffix(d.name) IS NOT NULL THEN
      -- Custom con sufijo sucio: se lo quitamos conservando la caja
      newname := public._aula_strip_suffix(d.name);
    ELSE
      newname := d.name;
    END IF;

    IF newname IS DISTINCT FROM d.name THEN
      RAISE NOTICE '  borrada id=%: "%" → "%"', d.id, d.name, newname;
      UPDATE public.classrooms SET name = newname WHERE id = d.id;
    END IF;
  END LOOP;
END $$;

-- ================================================================
-- 8) level = name en activas REGULARES (las especiales conservan su
--     clave corta de nivel: 'Verano', 'Ballet / Danza', 'Cuido'…,
--     que es como la usan la admisión y validateAgeForClassroom)
-- ================================================================
UPDATE public.classrooms
   SET level = name
 WHERE deleted_at IS NULL
   AND COALESCE(is_special, false) = false
   AND (level IS NULL OR level <> name);

-- ================================================================
-- 8b) resumen pre-commit
-- ================================================================
DO $$
DECLARE n int; s int;
BEGIN
  SELECT COUNT(*) INTO n FROM public.classrooms WHERE deleted_at IS NULL;
  SELECT COUNT(*) INTO s FROM public.classrooms
   WHERE deleted_at IS NULL
     AND COALESCE(is_special, false) = false
     AND (level IS NULL OR level <> name);
  RAISE NOTICE '================ RESUMEN ================';
  RAISE NOTICE 'Aulas activas: % (esperado: 18 = 12 regulares + 6 especiales; si hay aulas personalizadas, 18 + esas)', n;
  RAISE NOTICE 'Regulares con level <> name: % (esperado: 0)', s;
END $$;

COMMIT;

-- ================================================================
--  VERIFICACIÓN FINAL (ejecutar ya con el COMMIT hecho)
-- ================================================================

-- 1) Debe devolver 18 (12 regulares + 6 especiales; + aulas
--    personalizadas si el plantel las tiene)
SELECT COUNT(*) AS aulas_activas_esperado_18
FROM public.classrooms
WHERE deleted_at IS NULL;

-- 2) Listado completo de activas con su docente y estudiantes
SELECT c.id, c.name, c.level, c.capacity, c.is_special,
       p.name AS maestra,
       (SELECT COUNT(*) FROM public.students s
         WHERE s.classroom_id = c.id) AS estudiantes
FROM public.classrooms c
LEFT JOIN public.profiles p ON p.id = c.teacher_id
WHERE c.deleted_at IS NULL
ORDER BY c.is_special, c.id;

-- 3) Debe devolver 0 filas: activas con nombre sucio
--    (sufijo variante/duplicado/fusión o "parvalo").
--    Si aparece un "parvalo" SUETO (sin I/II/III): es ambiguo entre
--    niveles, el script NO lo adivina → renombrarlo a mano en la UI.
SELECT id, name, level
FROM public.classrooms
WHERE deleted_at IS NULL
  AND (
    name ~* '\((variante|duplicado|duplicada|copia|fusion|fusión)'
    OR name ~* 'parvalo'
    OR COALESCE(level,'') ~* '\((variante|duplicado|duplicada|copia|fusion|fusión)'
    OR COALESCE(level,'') ~* 'parvalo'
  );

-- 4) Debe devolver 0 filas: activas con level <> name (regulares)
SELECT id, name, level
FROM public.classrooms
WHERE deleted_at IS NULL
  AND COALESCE(is_special, false) = false
  AND COALESCE(level, '') <> name;

-- 5) Estudiantes aún en aulas borradas (esperado: 0;
--    si >0 son los "PENDIENTES" de NOTICE sin correspondencia estricta)
SELECT s.id, s.name AS estudiante, c.id AS aula_borrada_id, c.name AS aula_borrada
FROM public.students s
JOIN public.classrooms c ON c.id = s.classroom_id
WHERE c.deleted_at IS NOT NULL
ORDER BY c.id, s.name;

-- 6) Maestras huérfanas: dan clase (o daban) pero no en aula activa
SELECT p.id, p.name AS maestra,
       (SELECT COUNT(*) FROM public.classrooms d
         WHERE d.teacher_id = p.id AND d.deleted_at IS NOT NULL) AS aulas_borradas
FROM public.profiles p
WHERE p.role = 'maestra'
  AND NOT EXISTS (
    SELECT 1 FROM public.classrooms a
     WHERE a.teacher_id = p.id AND a.deleted_at IS NULL
  )
ORDER BY p.name;

-- 7) Aulas activas todavía sin maestra (pendientes de asignar en UI)
SELECT id, name, level
FROM public.classrooms
WHERE deleted_at IS NULL AND teacher_id IS NULL
ORDER BY is_special, id;

-- ================================================================
-- NOTAS
--  * Si el paso 5 reporta "PENDIENTES", esos estudiantes quedaron en
--    su aula original (sin mover) y hay que reasignarlos a mano desde
--    el panel: nunca se reasignan al azar.
--  * Los NOTICE de arriba listan cada renombre/fusión realizada:
--    copiar esa salida y pegarla en el ticket como evidencia.
--  * Si un NOTICE dice "clave única duplicada en destino → NO movida",
--    esa fila (p.ej. un horario de la aula vieja) chocó con una ya
--    existente en la nueva: revisarla a mano.
--  * Este archivo es seguro de re-ejecutar: el segundo pase no
--    encontrará nada que cambiar y los NOTICE quedarán vacíos.
-- ================================================================
