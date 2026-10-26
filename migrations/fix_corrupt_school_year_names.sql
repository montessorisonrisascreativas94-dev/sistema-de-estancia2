DO $$
DECLARE
  r record;
  base_name text;
  new_name text;
BEGIN
  FOR r IN
    SELECT id, start_date, end_date
    FROM public.school_years
    WHERE name IS NULL
       OR char_length(btrim(name)) = 0
       OR char_length(name) > 120
       OR name ~ E'[\r\n\t]'
       OR name ~* '(avatar|dashboard|centro escolar|panel directora)'
  LOOP
    base_name := CASE
      WHEN r.start_date IS NOT NULL THEN
        to_char(r.start_date, 'YYYY') ||
        CASE
          WHEN r.end_date IS NOT NULL
           AND to_char(r.end_date, 'YYYY') <> to_char(r.start_date, 'YYYY')
          THEN '-' || to_char(r.end_date, 'YYYY')
          ELSE ''
        END
      ELSE 'Año Escolar'
    END;

    new_name := base_name;

    BEGIN
      UPDATE public.school_years SET name = new_name WHERE id = r.id;
    EXCEPTION WHEN unique_violation THEN
      new_name := left(base_name, 100) || ' (' || r.id || ')';
      UPDATE public.school_years SET name = new_name WHERE id = r.id;
    END;
  END LOOP;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'school_years_name_length'
      AND conrelid = 'public.school_years'::regclass
  ) THEN
    ALTER TABLE public.school_years
      ADD CONSTRAINT school_years_name_length
      CHECK (char_length(btrim(name)) BETWEEN 1 AND 120) NOT VALID;
  END IF;
END $$;

SELECT id, name, start_date, end_date, is_current
FROM public.school_years
ORDER BY start_date DESC;
