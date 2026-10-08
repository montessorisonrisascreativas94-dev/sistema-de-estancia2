-- ============================================================
-- FIX: SQLERRM syntax error en generate_receipt / generate_invoice
-- Error: 42601 syntax error at or near "-"
--   LINE 5618: RETURN 'Recibo no disponible - Error al generar: ' || SQLERRM;
--
-- CAUSA: SQLERRM solo está disponible dentro de un bloque EXCEPTION en PL/pgSQL.
-- Usarlo fuera de ese bloque o en LANGUAGE sql genera error de sintaxis.
--
-- SOLUCIÓN: Envolver el cuerpo de la función en BEGIN/EXCEPTION WHEN OTHERS THEN
-- ============================================================

-- Reemplazar generate_ascii_receipt con manejo correcto de errores
CREATE OR REPLACE FUNCTION public.generate_ascii_receipt(p_invoice_id bigint)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv    public.invoices%ROWTYPE;
  v_school public.school_settings%ROWTYPE;
  v_items  RECORD;
  v_receipt text := '';
BEGIN
  SELECT * INTO v_inv    FROM public.invoices       WHERE id = p_invoice_id;
  SELECT * INTO v_school FROM public.school_settings WHERE id = 1;

  v_receipt := v_receipt || repeat('=', 52) || E'\n';
  v_receipt := v_receipt || COALESCE(v_school.school_name, 'Colegio Montessori') || E'\n';
  v_receipt := v_receipt || COALESCE(v_school.rnc,     '') || E'\n';
  v_receipt := v_receipt || COALESCE(v_school.address, '') || E'\n';
  v_receipt := v_receipt || COALESCE(v_school.phone,   '') || E'\n';
  v_receipt := v_receipt || repeat('-', 52) || E'\n';
  v_receipt := v_receipt || 'FACTURA: ' || COALESCE(v_inv.invoice_number, '') || E'\n';
  v_receipt := v_receipt || 'Fecha:   ' || to_char(COALESCE(v_inv.issued_date, v_inv.created_at::date), 'DD/MM/YYYY') || E'\n';
  v_receipt := v_receipt || 'NCF:     ' || COALESCE(v_inv.ncf, 'N/A') || E'\n';
  v_receipt := v_receipt || repeat('-', 52) || E'\n';
  v_receipt := v_receipt || 'Cliente:   ' || COALESCE(v_inv.student_name,     '') || E'\n';
  v_receipt := v_receipt || 'Matricula: ' || COALESCE(v_inv.student_matricula, '') || E'\n';
  v_receipt := v_receipt || repeat('-', 52) || E'\n';

  FOR v_items IN
    SELECT concept, quantity, unit_price, total
    FROM public.invoice_items WHERE invoice_id = p_invoice_id
  LOOP
    v_receipt := v_receipt || v_items.concept || '  x' || v_items.quantity::text || E'\n';
    v_receipt := v_receipt || '        RD$ ' || to_char(v_items.total, 'FM999,990.00') || E'\n';
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM public.invoice_items WHERE invoice_id = p_invoice_id) THEN
    v_receipt := v_receipt || COALESCE(v_inv.concept, 'Pago') || E'\n';
    v_receipt := v_receipt || '        RD$ ' || to_char(v_inv.amount, 'FM999,990.00') || E'\n';
  END IF;

  v_receipt := v_receipt || repeat('-', 52) || E'\n';
  v_receipt := v_receipt || 'Subtotal:  RD$ ' || to_char(COALESCE(v_inv.subtotal,    0), 'FM999,990.00') || E'\n';
  v_receipt := v_receipt || 'Desc.:     RD$ ' || to_char(COALESCE(v_inv.discount_amount, 0), 'FM999,990.00') || E'\n';
  v_receipt := v_receipt || 'TOTAL:     RD$ ' || to_char(COALESCE(v_inv.total, v_inv.amount, 0), 'FM999,990.00') || E'\n';
  v_receipt := v_receipt || repeat('=', 52) || E'\n';
  v_receipt := v_receipt || COALESCE(v_school.footer_note, 'Gracias por su preferencia') || E'\n';

  RETURN v_receipt;

EXCEPTION WHEN OTHERS THEN
  -- SQLERRM solo disponible dentro del bloque EXCEPTION
  RETURN 'Recibo no disponible. Error al generar: ' || SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_ascii_receipt(bigint) TO authenticated, service_role;

SELECT 'generate_ascii_receipt fixed!' AS resultado;
