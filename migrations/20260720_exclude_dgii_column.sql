-- Agregar columna exclude_dgii a la tabla payments
-- Para la funcionalidad de excluir facturas del envío a DGII
ALTER TABLE payments ADD COLUMN IF NOT EXISTS exclude_dgii BOOLEAN DEFAULT false;

-- Crear índice para búsquedas rápidas de facturas DGII
CREATE INDEX IF NOT EXISTS idx_payments_exclude_dgii ON payments(exclude_dgii) WHERE exclude_dgii = true;

-- Comentario de columna
COMMENT ON COLUMN payments.exclude_dgii IS 'Si es true, esta factura NO se envía a la DGII (factura interna)';

-- Tabla de sesión de caja (si no existe)
CREATE TABLE IF NOT EXISTS caja_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  opening_balance NUMERIC DEFAULT 0,
  closing_balance NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opened_by UUID REFERENCES profiles(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabla de asiento contable (libro diario automático)
CREATE TABLE IF NOT EXISTS accounting_journal (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fecha DATE NOT NULL,
  ref TEXT,
  descripcion TEXT,
  cuenta_debe TEXT,
  monto_debe NUMERIC DEFAULT 0,
  cuenta_haber TEXT,
  monto_haber NUMERIC DEFAULT 0,
  tipo TEXT CHECK (tipo IN ('ingreso', 'gasto', 'ajuste')),
  payment_id BIGINT REFERENCES payments(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para journal
CREATE INDEX IF NOT EXISTS idx_journal_fecha ON accounting_journal(fecha);
CREATE INDEX IF NOT EXISTS idx_journal_tipo ON accounting_journal(tipo);

-- Tabla de nómina (si no existe)
CREATE TABLE IF NOT EXISTS payroll_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES profiles(id),
  period TEXT NOT NULL,
  gross_salary NUMERIC DEFAULT 0,
  afp NUMERIC DEFAULT 0,
  ars NUMERIC DEFAULT 0,
  isr NUMERIC DEFAULT 0,
  net_salary NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'pagado', 'cancelado')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para nómina
CREATE INDEX IF NOT EXISTS idx_payroll_period ON payroll_records(period);
CREATE INDEX IF NOT EXISTS idx_payroll_employee ON payroll_records(employee_id);

-- Agregar columna salary a profiles si no existe
DO $$ BEGIN
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS salary NUMERIC DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- RLS para caja_sessions
ALTER TABLE caja_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Directores pueden gestionar caja" ON caja_sessions FOR ALL USING (true);

-- RLS para accounting_journal
ALTER TABLE accounting_journal ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Contabilidad accesible" ON accounting_journal FOR ALL USING (true);

-- RLS para payroll_records
ALTER TABLE payroll_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Nómina accesible por directores" ON payroll_records FOR ALL USING (true);
