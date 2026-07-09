
-- =============================================
-- Migration: Add Payment Concepts and Reenrollment Month
-- =============================================

-- Create payment_concepts table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.payment_concepts (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- Add reenrollment_month to school_settings if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'school_settings' AND column_name = 'reenrollment_month'
  ) THEN
    ALTER TABLE public.school_settings ADD COLUMN reenrollment_month INT DEFAULT 8; -- August = 8
  END IF;
END $$;

-- Insert default payment concepts
INSERT INTO public.payment_concepts (name, description, amount) VALUES
  ('Inscripción', 'Pago de inscripción', 500.00),
  ('Uniforme', 'Uniforme escolar completo', 300.00),
  ('Libros', 'Material didáctico y libros', 250.00),
  ('Materiales', 'Materiales escolares', 150.00),
  ('Actividades Extra', 'Actividades extra curriculares', 100.00)
ON CONFLICT DO NOTHING;
