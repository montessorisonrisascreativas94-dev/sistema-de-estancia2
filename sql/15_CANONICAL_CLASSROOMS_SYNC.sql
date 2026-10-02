-- ================================================================
-- 15_CANONICAL_CLASSROOMS_SYNC.sql
-- Sincronización IDEMPOTENTE de las 12 aulas oficiales del colegio
-- (Catálogo fijo: estructura no cambia, solo capacidad / maestra)
--
-- Coincide con: js/shared/constants.js → CANONICAL_CLASSROOMS
-- ================================================================
BEGIN;

-- 1. Asegurarse que classrooms tenga la columna `level` (por si acaso)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='classrooms' AND column_name='level'
  ) THEN
    ALTER TABLE public.classrooms ADD COLUMN level text;
  END IF;
END $$;

-- 2. Asegurar students tenga level_requested (para sincronizar)
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

-- 3. DEDUPLICACIÓN PREVIA: eliminar aulas duplicadas por name (mismo nombre,
--    ninguna borrada) conservando la fila con id menor y marcando el resto
--    como soft-deleted para que no afecten referencias FK existentes.
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

-- 4. Restricción única parcial requerida por ON CONFLICT ... WHERE deleted_at IS NULL
--    (si ya existe no se vuelve a crear)
CREATE UNIQUE INDEX IF NOT EXISTS ux_classrooms_name_active
  ON public.classrooms(name)
  WHERE deleted_at IS NULL;

-- 5. Catálogo fijo de 12 aulas oficiales
--    Si el aula (name = level) ya existe → actualiza capacidad/level
--    Si no existe → INSERT
INSERT INTO public.classrooms (name, level, capacity, created_at) VALUES
  ('Párvulos I',                 'Párvulos I',                 15, now()),
  ('Párvulos II',                'Párvulos II',                15, now()),
  ('Párvulos III',               'Párvulos III',               15, now()),
  ('Pre-Kínder – Línea Blanca',  'Pre-Kínder – Línea Blanca',  18, now()),
  ('Kínder – Línea Gris',        'Kínder – Línea Gris',        20, now()),
  ('Pre-Primario – Línea Negra', 'Pre-Primario – Línea Negra', 22, now()),
  ('1ro – Línea Roja',           '1ro – Línea Roja',           25, now()),
  ('2do – Línea Amarilla',       '2do – Línea Amarilla',       25, now()),
  ('3ro – Línea Azul',           '3ro – Línea Azul',           25, now()),
  ('4to – Línea Verde',          '4to – Línea Verde',          25, now()),
  ('5to – Línea Naranja',        '5to – Línea Naranja',        25, now()),
  ('6to – Línea Morado',         '6to – Línea Morado',         25, now())
ON CONFLICT (name) WHERE deleted_at IS NULL DO UPDATE
  SET level    = EXCLUDED.level,
      capacity = EXCLUDED.capacity
  WHERE classrooms.level IS DISTINCT FROM EXCLUDED.level
     OR classrooms.capacity IS DISTINCT FROM EXCLUDED.capacity;

-- 4. Actualizar level = name para registros antiguos con level vacío
UPDATE public.classrooms
SET level = name
WHERE (level IS NULL OR level = '') AND deleted_at IS NULL;

-- 5. Índice para búsquedas por level
CREATE INDEX IF NOT EXISTS idx_classrooms_level
  ON public.classrooms(level) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_students_level_requested
  ON public.students(level_requested) WHERE is_active = true;

COMMIT;
