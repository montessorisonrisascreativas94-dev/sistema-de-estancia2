ALTER TABLE public.payroll_records ADD COLUMN IF NOT EXISTS paid_at timestamp with time zone;
ALTER TABLE public.payroll_records ADD COLUMN IF NOT EXISTS afp_patronal numeric DEFAULT 0;
ALTER TABLE public.payroll_records ADD COLUMN IF NOT EXISTS ars_patronal numeric DEFAULT 0;
