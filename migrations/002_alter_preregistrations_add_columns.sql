-- ============================================================
-- Migracion 002: Agregar columnas faltantes a student_preregistrations
-- SEGURA: No elimina datos existentes, solo agrega columnas
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- Funcion auxiliar para agregar columna si no existe
CREATE OR REPLACE FUNCTION public.add_column_if_not_exists(
  p_table text, p_column text, p_type text, p_default text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = p_table AND column_name = p_column
  ) THEN
    IF p_default IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN %I %s DEFAULT %s', p_table, p_column, p_type, p_default);
    ELSE
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN %I %s', p_table, p_column, p_type);
    END IF;
    RAISE NOTICE 'Added column: %', p_column;
  ELSE
    RAISE NOTICE 'Column already exists: %', p_column;
  END IF;
END;
$$;

-- PASO 1: Datos del Estudiante
SELECT public.add_column_if_not_exists('student_preregistrations', 'student_last_name', 'text');
SELECT public.add_column_if_not_exists('student_preregistrations', 'nationality', 'text');
SELECT public.add_column_if_not_exists('student_preregistrations', 'student_photo_url', 'text');
SELECT public.add_column_if_not_exists('student_preregistrations', 'school_year_requested', 'text');
SELECT public.add_column_if_not_exists('student_preregistrations', 'level_requested', 'text');
SELECT public.add_column_if_not_exists('student_preregistrations', 'schedule', 'text');
SELECT public.add_column_if_not_exists('student_preregistrations', 'estimated_entry_date', 'date');
SELECT public.add_column_if_not_exists('student_preregistrations', 'has_siblings', 'boolean', 'false');
SELECT public.add_column_if_not_exists('student_preregistrations', 'sibling_name', 'text');

-- PASO 2: Padres
SELECT public.add_column_if_not_exists('student_preregistrations', 'p1_relationship', 'text');
SELECT public.add_column_if_not_exists('student_preregistrations', 'p1_cedula', 'text');
SELECT public.add_column_if_not_exists('student_preregistrations', 'p1_birth_date', 'date');
SELECT public.add_column_if_not_exists('student_preregistrations', 'p1_whatsapp', 'text');
SELECT public.add_column_if_not_exists('student_preregistrations', 'p1_address', 'text');
SELECT public.add_column_if_not_exists('student_preregistrations', 'p1_occupation', 'text');
SELECT public.add_column_if_not_exists('student_preregistrations', 'p1_profession', 'text');
SELECT public.add_column_if_not_exists('student_preregistrations', 'p1_workplace', 'text');

SELECT public.add_column_if_not_exists('student_preregistrations', 'p2_name', 'text');
SELECT public.add_column_if_not_exists('student_preregistrations', 'p2_relationship', 'text');
SELECT public.add_column_if_not_exists('student_preregistrations', 'p2_cedula', 'text');
SELECT public.add_column_if_not_exists('student_preregistrations', 'p2_birth_date', 'date');
SELECT public.add_column_if_not_exists('student_preregistrations', 'p2_phone', 'text');
SELECT public.add_column_if_not_exists('student_preregistrations', 'p2_whatsapp', 'text');
SELECT public.add_column_if_not_exists('student_preregistrations', 'p2_email', 'text');
SELECT public.add_column_if_not_exists('student_preregistrations', 'p2_address', 'text');
SELECT public.add_column_if_not_exists('student_preregistrations', 'p2_occupation', 'text');
SELECT public.add_column_if_not_exists('student_preregistrations', 'p2_profession', 'text');
SELECT public.add_column_if_not_exists('student_preregistrations', 'p2_workplace', 'text');

-- PASO 3: Emergencia
SELECT public.add_column_if_not_exists('student_preregistrations', 'emergency_relationship', 'text');
SELECT public.add_column_if_not_exists('student_preregistrations', 'emergency_cedula', 'text');
SELECT public.add_column_if_not_exists('student_preregistrations', 'emergency_observations', 'text');
SELECT public.add_column_if_not_exists('student_preregistrations', 'authorized_persons', 'jsonb', '''[]''::jsonb');

-- PASO 4: Salud
SELECT public.add_column_if_not_exists('student_preregistrations', 'blood_type', 'text');
SELECT public.add_column_if_not_exists('student_preregistrations', 'allergies', 'text');
SELECT public.add_column_if_not_exists('student_preregistrations', 'medical_conditions', 'text');
SELECT public.add_column_if_not_exists('student_preregistrations', 'medications', 'text');
SELECT public.add_column_if_not_exists('student_preregistrations', 'food_restrictions', 'text');
SELECT public.add_column_if_not_exists('student_preregistrations', 'medical_notes', 'text');

-- PASO 5: Documentos
SELECT public.add_column_if_not_exists('student_preregistrations', 'photo_url', 'text');
SELECT public.add_column_if_not_exists('student_preregistrations', 'birth_certificate_url', 'text');
SELECT public.add_column_if_not_exists('student_preregistrations', 'cedula_front_url', 'text');
SELECT public.add_column_if_not_exists('student_preregistrations', 'cedula_back_url', 'text');

-- PASO 6: Autorizaciones y Firma
SELECT public.add_column_if_not_exists('student_preregistrations', 'auth_data_treatment', 'boolean', 'false');
SELECT public.add_column_if_not_exists('student_preregistrations', 'auth_correct_info', 'boolean', 'false');
SELECT public.add_column_if_not_exists('student_preregistrations', 'auth_contact', 'boolean', 'false');
SELECT public.add_column_if_not_exists('student_preregistrations', 'auth_regulations', 'boolean', 'false');
SELECT public.add_column_if_not_exists('student_preregistrations', 'digital_signature', 'text');
SELECT public.add_column_if_not_exists('student_preregistrations', 'signature_date', 'timestamp with time zone');

-- Metadata
SELECT public.add_column_if_not_exists('student_preregistrations', 'reference', 'text');
SELECT public.add_column_if_not_exists('student_preregistrations', 'comments', 'text');
SELECT public.add_column_if_not_exists('student_preregistrations', 'status', 'text', '''pending''');
SELECT public.add_column_if_not_exists('student_preregistrations', 'reviewed_at', 'timestamp with time zone');
SELECT public.add_column_if_not_exists('student_preregistrations', 'reviewed_by', 'uuid');
SELECT public.add_column_if_not_exists('student_preregistrations', 'updated_at', 'timestamp with time zone', 'now()');

-- Agregar CHECK constraint para status si no existe
DO $$ BEGIN
  ALTER TABLE public.student_preregistrations
    ADD CONSTRAINT preregistrations_status_check
    CHECK (status IN ('pending', 'admitted', 'rejected', 'converted'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Indices
CREATE INDEX IF NOT EXISTS idx_preregistrations_status ON public.student_preregistrations(status);
CREATE INDEX IF NOT EXISTS idx_preregistrations_created ON public.student_preregistrations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_preregistrations_student_name ON public.student_preregistrations(lower(student_name));

-- Habilitar RLS si no esta habilitado
ALTER TABLE public.student_preregistrations ENABLE ROW LEVEL SECURITY;

-- Politicas RLS
DROP POLICY IF EXISTS "Permitir insercion anonima de preinscripciones" ON public.student_preregistrations;
CREATE POLICY "Permitir insercion anonima de preinscripciones"
  ON public.student_preregistrations
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir lectura completa a autenticados" ON public.student_preregistrations;
CREATE POLICY "Permitir lectura completa a autenticados"
  ON public.student_preregistrations
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Permitir actualizacion a autenticados" ON public.student_preregistrations;
CREATE POLICY "Permitir actualizacion a autenticados"
  ON public.student_preregistrations
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Trigger de updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_student_preregistrations_updated_at ON public.student_preregistrations;
CREATE TRIGGER update_student_preregistrations_updated_at
  BEFORE UPDATE ON public.student_preregistrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Limpiar
DROP FUNCTION IF EXISTS public.add_column_if_not_exists(text, text, text, text);

-- ============================================================
-- Listo. Ejecutar este archivo en Supabase SQL Editor
-- ============================================================
