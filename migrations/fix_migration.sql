-- ============================================================
-- Script de migración para corregir el error "column 'code' does not exist"
-- ============================================================

-- 1. Asegurar que los tipos personalizados existan
DO $$ BEGIN
  CREATE TYPE payment_plan_type AS ENUM ('monthly', 'semestral', 'anual', 'two_installments');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE product_category AS ENUM ('uniforme', 'libro', 'material', 'otro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE order_status AS ENUM ('pending', 'paid', 'approved', 'ready', 'delivered', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Asegurar que la columna 'code' exista en la tabla products
DO $$
BEGIN
  -- Verificar si la columna ya existe
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'code'
  ) THEN
    -- Si no existe, la agregamos
    ALTER TABLE public.products
    ADD COLUMN code VARCHAR(50) UNIQUE;
  END IF;
END $$;

-- 3. Asegurar que todas las demás columnas de products existan
DO $$
BEGIN
  -- Verificar y agregar 'itbis_rate'
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'itbis_rate'
  ) THEN
    ALTER TABLE public.products
    ADD COLUMN itbis_rate numeric(5,2) DEFAULT 18;
  END IF;

  -- Verificar y agregar 'is_itbis_exempt'
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'is_itbis_exempt'
  ) THEN
    ALTER TABLE public.products
    ADD COLUMN is_itbis_exempt boolean DEFAULT false;
  END IF;

  -- Verificar y agregar 'unit'
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'unit'
  ) THEN
    ALTER TABLE public.products
    ADD COLUMN unit VARCHAR(50) DEFAULT 'unidad';
  END IF;

  -- Verificar y agregar 'stock'
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'stock'
  ) THEN
    ALTER TABLE public.products
    ADD COLUMN stock integer DEFAULT 0;
  END IF;

  -- Verificar y agregar 'image_url'
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'image_url'
  ) THEN
    ALTER TABLE public.products
    ADD COLUMN image_url text;
  END IF;

  -- Verificar y agregar 'is_active'
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE public.products
    ADD COLUMN is_active boolean DEFAULT true;
  END IF;

  -- Verificar y agregar 'created_by'
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'created_by'
  ) THEN
    ALTER TABLE public.products
    ADD COLUMN created_by uuid REFERENCES public.profiles(id);
  END IF;

  -- Verificar y agregar 'updated_by'
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'updated_by'
  ) THEN
    ALTER TABLE public.products
    ADD COLUMN updated_by uuid REFERENCES public.profiles(id);
  END IF;

  -- Verificar y agregar 'deleted_at'
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE public.products
    ADD COLUMN deleted_at timestamp with time zone;
  END IF;

  -- Verificar y agregar 'updated_at'
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.products
    ADD COLUMN updated_at timestamp with time zone DEFAULT now();
  END IF;
END $$;

-- 4. Asegurar que existan los índices para products
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category);
CREATE INDEX IF NOT EXISTS idx_products_active ON public.products(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_products_deleted_at ON public.products(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_products_code ON public.products(code);

-- ============================================================
-- Mensaje de finalización
-- ============================================================
SELECT 'Migración completada exitosamente!' AS mensaje;

-- ============================================================
-- CATÁLOGO DE CONCEPTOS DE COBRO — payment_concepts
-- ============================================================

-- Crear tabla si no existe
CREATE TABLE IF NOT EXISTS public.payment_concepts (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        text         NOT NULL,
  category    text         NOT NULL DEFAULT 'otros',
  amount      numeric(10,2) NOT NULL DEFAULT 0,
  description text,
  active      boolean      NOT NULL DEFAULT true,
  created_at  timestamptz  NOT NULL DEFAULT now(),
  updated_at  timestamptz  NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_payment_concepts_category ON public.payment_concepts(category);
CREATE INDEX IF NOT EXISTS idx_payment_concepts_active   ON public.payment_concepts(active) WHERE active = true;

-- RLS: solo directora y asistente pueden gestionar
ALTER TABLE public.payment_concepts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_concepts_read"   ON public.payment_concepts;
DROP POLICY IF EXISTS "payment_concepts_write"  ON public.payment_concepts;

CREATE POLICY "payment_concepts_read" ON public.payment_concepts
  FOR SELECT USING (true);

CREATE POLICY "payment_concepts_write" ON public.payment_concepts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('directora', 'asistente', 'admin')
    )
  );

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_payment_concepts_updated_at ON public.payment_concepts;
CREATE TRIGGER trg_payment_concepts_updated_at
  BEFORE UPDATE ON public.payment_concepts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed: conceptos por defecto (solo si la tabla está vacía)
INSERT INTO public.payment_concepts (name, category, amount, description, active)
SELECT name, category, amount, description, active FROM (VALUES
  ('Colegiatura Mensual',   'colegiatura',   3000.00, 'Mensualidad estándar del período escolar',     true),
  ('Inscripción',           'inscripcion',   5000.00, 'Pago único de inscripción al inicio del ciclo',true),
  ('Reinscripción',         'reinscripcion', 3500.00, 'Renovación de matrícula para el próximo ciclo',true),
  ('Uniforme Escolar',      'uniforme',      3200.00, 'Uniforme completo (camisa, pantalón/falda)',    true),
  ('Libros y Útiles',       'libros',        2500.00, 'Kit de libros y materiales del nivel',          true),
  ('Materiales Didácticos', 'materiales',     800.00, 'Materiales de uso mensual en clase',            true),
  ('Actividades Extra',     'actividades',   1200.00, 'Actividades extracurriculares opcionales',      true),
  ('Excursión',             'excursiones',   3500.00, 'Salida pedagógica programada',                  true),
  ('Comedor',               'comedor',       2000.00, 'Servicio de alimentación mensual',              true),
  ('Tutorías',              'tutorias',      1800.00, 'Apoyo académico individual',                    true),
  ('Certificados',          'certificados',   500.00, 'Emisión de certificados y constancias',         true),
  ('Transporte',            'transporte',    1500.00, 'Servicio de ruta escolar',                      true),
  ('Otro',                  'otros',            0.00, 'Concepto personalizado (monto variable)',        true)
) AS v(name, category, amount, description, active)
WHERE NOT EXISTS (SELECT 1 FROM public.payment_concepts LIMIT 1);

SELECT 'payment_concepts creada y sembrada correctamente!' AS mensaje;

-- ============================================================
-- FIX: Row-Level Security para students, profiles, payment_plans, payments
-- Permite que directora y asistente inserten/actualicen registros
-- ============================================================

-- ── students ────────────────────────────────────────────────

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

-- Lectura: todos los roles autenticados pueden leer
DROP POLICY IF EXISTS "students_select" ON public.students;
CREATE POLICY "students_select" ON public.students
  FOR SELECT USING (auth.role() = 'authenticated');

-- Insertar: directora, asistente, admin
DROP POLICY IF EXISTS "students_insert" ON public.students;
CREATE POLICY "students_insert" ON public.students
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('directora', 'asistente', 'admin')
    )
  );

-- Actualizar: directora, asistente, admin
DROP POLICY IF EXISTS "students_update" ON public.students;
CREATE POLICY "students_update" ON public.students
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('directora', 'asistente', 'admin')
    )
  );

-- Eliminar: solo directora y admin
DROP POLICY IF EXISTS "students_delete" ON public.students;
CREATE POLICY "students_delete" ON public.students
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('directora', 'admin')
    )
  );

-- ── profiles ────────────────────────────────────────────────

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Cada usuario puede leer/actualizar su propio perfil
DROP POLICY IF EXISTS "profiles_self" ON public.profiles;
CREATE POLICY "profiles_self" ON public.profiles
  FOR ALL USING (auth.uid() = id);

-- Directora/asistente pueden leer y crear perfiles de padres
DROP POLICY IF EXISTS "profiles_staff_read" ON public.profiles;
CREATE POLICY "profiles_staff_read" ON public.profiles
  FOR SELECT USING (
    auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS "profiles_staff_upsert" ON public.profiles;
CREATE POLICY "profiles_staff_upsert" ON public.profiles
  FOR INSERT WITH CHECK (
    -- Self-insert (via signUp) o staff insertando un padre
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM public.profiles staff
      WHERE staff.id = auth.uid()
        AND staff.role IN ('directora', 'asistente', 'admin')
    )
  );

DROP POLICY IF EXISTS "profiles_staff_update" ON public.profiles;
CREATE POLICY "profiles_staff_update" ON public.profiles
  FOR UPDATE USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM public.profiles staff
      WHERE staff.id = auth.uid()
        AND staff.role IN ('directora', 'asistente', 'admin')
    )
  );

-- ── payment_plans ────────────────────────────────────────────

ALTER TABLE public.payment_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_plans_select" ON public.payment_plans;
CREATE POLICY "payment_plans_select" ON public.payment_plans
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "payment_plans_insert" ON public.payment_plans;
CREATE POLICY "payment_plans_insert" ON public.payment_plans
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('directora', 'asistente', 'admin')
    )
  );

DROP POLICY IF EXISTS "payment_plans_update" ON public.payment_plans;
CREATE POLICY "payment_plans_update" ON public.payment_plans
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('directora', 'asistente', 'admin')
    )
  );

-- ── payments ─────────────────────────────────────────────────

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payments_select" ON public.payments;
CREATE POLICY "payments_select" ON public.payments
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "payments_insert" ON public.payments;
CREATE POLICY "payments_insert" ON public.payments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('directora', 'asistente', 'admin')
    )
  );

DROP POLICY IF EXISTS "payments_update" ON public.payments;
CREATE POLICY "payments_update" ON public.payments
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('directora', 'asistente', 'admin', 'padre')
    )
  );

-- ── student_preregistrations ─────────────────────────────────

ALTER TABLE public.student_preregistrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prereg_select" ON public.student_preregistrations;
CREATE POLICY "prereg_select" ON public.student_preregistrations
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "prereg_insert" ON public.student_preregistrations;
CREATE POLICY "prereg_insert" ON public.student_preregistrations
  FOR INSERT WITH CHECK (true); -- Padres no autenticados pueden preinscribirse

DROP POLICY IF EXISTS "prereg_update" ON public.student_preregistrations;
CREATE POLICY "prereg_update" ON public.student_preregistrations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('directora', 'asistente', 'admin')
    )
  );

SELECT 'RLS policies actualizadas correctamente!' AS mensaje;
