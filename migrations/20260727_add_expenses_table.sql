-- ============================================================
-- Migración: Crear tabla expenses (Gastos/Compras)
-- Fecha: 2026-07-27
-- ============================================================

CREATE TABLE IF NOT EXISTS public.expenses (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  date        date NOT NULL,
  supplier    text,
  concept     text NOT NULL,
  category    text DEFAULT 'General',
  amount      numeric NOT NULL DEFAULT 0,
  ncf         text,
  status      text DEFAULT 'pendiente' CHECK (status IN ('pendiente','pagado','cancelado')),
  paid_date   date,
  created_at  timestamp with time zone DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON public.expenses(status);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON public.expenses(category);

-- RLS
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Expenses: admin and directora full access"
    ON public.expenses FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin','directora')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Expenses: asistente can read"
    ON public.expenses FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'asistente'
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
