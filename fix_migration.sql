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
