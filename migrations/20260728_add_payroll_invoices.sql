CREATE TABLE IF NOT EXISTS public.payroll_invoices (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  payroll_id      uuid REFERENCES public.payroll_records(id) ON DELETE CASCADE,
  employee_id     uuid REFERENCES public.profiles(id),
  period          text NOT NULL,
  receipt_number  text NOT NULL UNIQUE,
  gross_salary    numeric DEFAULT 0,
  afp             numeric DEFAULT 0,
  ars             numeric DEFAULT 0,
  isr             numeric DEFAULT 0,
  net_salary      numeric DEFAULT 0,
  afp_patronal    numeric DEFAULT 0,
  ars_patronal    numeric DEFAULT 0,
  status          text DEFAULT 'emitido' CHECK (status IN ('emitido','enviado','anulado')),
  pdf_url         text,
  sent_email      boolean DEFAULT false,
  created_at      timestamp with time zone DEFAULT now()
);

ALTER TABLE public.payroll_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_invoices_director" ON public.payroll_invoices FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','admin','encargada'));

CREATE INDEX IF NOT EXISTS idx_payroll_invoices_payroll ON public.payroll_invoices(payroll_id);
CREATE INDEX IF NOT EXISTS idx_payroll_invoices_employee ON public.payroll_invoices(employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_invoices_period ON public.payroll_invoices(period);
