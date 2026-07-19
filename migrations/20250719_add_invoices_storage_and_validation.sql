-- ============================================================
-- Facturación Profesional v2 — Storage + Validación + Hash
-- ============================================================

-- 1. Bucket de Storage para facturas PDF
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('invoices', 'invoices', true, 10485760,
  ARRAY['application/pdf','image/png','image/jpeg'])
ON CONFLICT (id) DO NOTHING;

-- Políticas RLS para bucket invoices
DROP POLICY IF EXISTS "invoices_public_read" ON storage.objects;
CREATE POLICY "invoices_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'invoices');

DROP POLICY IF EXISTS "invoices_auth_insert" ON storage.objects;
CREATE POLICY "invoices_auth_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'invoices' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "invoices_auth_update" ON storage.objects;
CREATE POLICY "invoices_auth_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'invoices' AND auth.role() = 'authenticated');

-- 2. Columnas adicionales para validación y PDF
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS pdf_url TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS qr_data TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS sha256_hash TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS validation_url TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS uuid_folio TEXT DEFAULT gen_random_uuid()::text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS issued_by_name TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS email_sent BOOLEAN DEFAULT FALSE;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;

-- 3. Función para generar hash SHA-256 de una factura
CREATE OR REPLACE FUNCTION public.generate_invoice_hash(p_invoice_id BIGINT)
RETURNS TEXT LANGUAGE SQL SECURITY DEFINER AS $$
  SELECT encode(
    sha256(
      ('INV-' || p_invoice_id || '-' || EXTRACT(EPOCH FROM NOW())::BIGINT || '-KPK')::BYTEA
    ),
    'hex'
  );
$$;
GRANT EXECUTE ON FUNCTION public.generate_invoice_hash(BIGINT) TO authenticated, service_role;

-- 4. Función para marcar email enviado
CREATE OR REPLACE FUNCTION public.mark_invoice_email_sent(p_invoice_id BIGINT)
RETURNS VOID LANGUAGE SQL SECURITY DEFINER AS $$
  UPDATE public.invoices
  SET email_sent = TRUE, email_sent_at = NOW()
  WHERE id = p_invoice_id;
$$;
GRANT EXECUTE ON FUNCTION public.mark_invoice_email_sent(BIGINT) TO authenticated, service_role;

-- 5. Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_invoices_uuid_folio ON public.invoices(uuid_folio);
CREATE INDEX IF NOT EXISTS idx_invoices_sha256 ON public.invoices(sha256_hash);
CREATE INDEX IF NOT EXISTS idx_invoices_pdf_url ON public.invoices(pdf_url) WHERE pdf_url IS NOT NULL;
