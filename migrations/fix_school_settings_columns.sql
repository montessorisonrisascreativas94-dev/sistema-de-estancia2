-- ============================================================
-- FIX: Agregar columnas faltantes a school_settings
-- La tabla fue creada sin city, state, zip_code pero las
-- funciones SQL y edge functions las referencian.
-- Error: record "v_school" has no field "city" (42703)
-- ============================================================

-- Agregar columnas faltantes de forma segura (IF NOT EXISTS)
ALTER TABLE public.school_settings ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.school_settings ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE public.school_settings ADD COLUMN IF NOT EXISTS zip_code text;
ALTER TABLE public.school_settings ADD COLUMN IF NOT EXISTS address_line_2 text;
ALTER TABLE public.school_settings ADD COLUMN IF NOT EXISTS country text DEFAULT 'República Dominicana';

-- Valores por defecto para la escuela existente
UPDATE public.school_settings
SET city = COALESCE(city, 'San Cristóbal'),
    state = COALESCE(state, 'Rep. Dom.'),
    zip_code = COALESCE(zip_code, '91000'),
    country = COALESCE(country, 'República Dominicana')
WHERE id = 1;

-- Recrear la función generate_ascii_receipt para que sea resiliente
-- usando COALESCE en todos los campos que podrían ser NULL
CREATE OR REPLACE FUNCTION public.generate_ascii_receipt(p_invoice_id BIGINT)
RETURNS TEXT LANGUAGE PLPGSQL SECURITY DEFINER AS $$
DECLARE
    v_inv public.invoices%ROWTYPE;
    v_items RECORD;
    v_school RECORD;
    v_total NUMERIC(10,2) := 0;
    v_receipt TEXT := '';
    v_city_line TEXT;
BEGIN
    SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id;
    SELECT * INTO v_school FROM public.school_settings WHERE id = 1;

    -- Construir línea de ciudad de forma segura
    v_city_line := TRIM(BOTH ', ' FROM CONCAT(
        COALESCE(v_school.city, ''),
        CASE WHEN v_school.city IS NOT NULL AND (v_school.state IS NOT NULL OR v_school.zip_code IS NOT NULL) THEN ', ' ELSE '' END,
        COALESCE(v_school.state, ''),
        CASE WHEN v_school.state IS NOT NULL AND v_school.zip_code IS NOT NULL THEN ', C.P. ' WHEN v_school.zip_code IS NOT NULL THEN 'C.P. ' ELSE '' END,
        COALESCE(v_school.zip_code, '')
    ));
    IF v_city_line = '' THEN v_city_line := 'San Cristóbal, Rep. Dom.'; END IF;

    v_receipt := v_receipt || '┌─────────────────────────────────────────────────────────────┐' || E'\n';
    v_receipt := v_receipt || '│                                                             │' || E'\n';
    v_receipt := v_receipt || '│  ╔══════════════════════════════════════════════════════╗  │' || E'\n';
    v_receipt := v_receipt || '│  ║                                                      ║  │' || E'\n';
    v_receipt := v_receipt || '│  ║              🏫 ' || RPAD(COALESCE(v_school.school_name, 'COLEGIO'), 36) || '║  │' || E'\n';
    v_receipt := v_receipt || '│  ║         ESTANCIA INFANTIL                            ║  │' || E'\n';
    v_receipt := v_receipt || '│  ║                                                      ║  │' || E'\n';
    v_receipt := v_receipt || '│  ║    ' || RPAD(COALESCE(v_school.address, 'Calle Principal #123, Col. Centro'), 38) || '║  │' || E'\n';
    v_receipt := v_receipt || '│  ║    ' || RPAD(v_city_line, 38) || '║  │' || E'\n';
    v_receipt := v_receipt || '│  ║    Tel: ' || RPAD(COALESCE(v_school.phone, '(829) 803-8424'), 33) || '║  │' || E'\n';
    v_receipt := v_receipt || '│  ║    Email: ' || RPAD(COALESCE(v_school.email, 'contacto@montessorisonrisascreativas.com'), 30) || '║  │' || E'\n';
    v_receipt := v_receipt || '│  ║    RFC/RNC: ' || RPAD(COALESCE(v_school.rnc, 'KKI123456ABC'), 27) || '║  │' || E'\n';
    v_receipt := v_receipt || '│  ║                                                      ║  │' || E'\n';
    v_receipt := v_receipt || '│  ╚══════════════════════════════════════════════════════╝  │' || E'\n';
    v_receipt := v_receipt || '│                                                             │' || E'\n';
    v_receipt := v_receipt || '│  ┌────────────────────────────────────────────────────┐  │' || E'\n';
    v_receipt := v_receipt || '│  │                  RECIBO DE PAGO                    │  │' || E'\n';
    v_receipt := v_receipt || '│  │              ' || RPAD(COALESCE(v_inv.receipt_number, v_inv.invoice_number, 'SIN NUMERO'), 38) || '│  │' || E'\n';
    v_receipt := v_receipt || '│  └────────────────────────────────────────────────────┘  │' || E'\n';
    v_receipt := v_receipt || '│                                                             │' || E'\n';
    v_receipt := v_receipt || '│  ┌────────────────────────────────────────────────────┐  │' || E'\n';
    v_receipt := v_receipt || '│  │  INFORMACIÓN DEL RECIBO                            │  │' || E'\n';
    v_receipt := v_receipt || '│  ├────────────────────────────────────────────────────┤  │' || E'\n';
    v_receipt := v_receipt || '│  │  Fecha de Emisión:    ' || RPAD(TO_CHAR(v_inv.issued_date, 'DD "de" FMMonth "de" YYYY'), 30) || '│  │' || E'\n';
    v_receipt := v_receipt || '│  │  Hora:                ' || RPAD(TO_CHAR(v_inv.issued_date, 'HH24:MI "hrs"'), 30) || '│  │' || E'\n';
    v_receipt := v_receipt || '│  │  Método de Pago:      ' || RPAD(COALESCE(v_inv.payment_method, 'N/A'), 30) || '│  │' || E'\n';
    v_receipt := v_receipt || '│  │  Referencia:          ' || RPAD(COALESCE(v_inv.payment_reference, 'N/A'), 30) || '│  │' || E'\n';
    v_receipt := v_receipt || '│  │  Atendió:             ' || RPAD(COALESCE(v_inv.attended_by, 'Sistema'), 30) || '│  │' || E'\n';
    v_receipt := v_receipt || '│  └────────────────────────────────────────────────────┘  │' || E'\n';
    v_receipt := v_receipt || '│                                                             │' || E'\n';
    v_receipt := v_receipt || '│  ┌────────────────────────────────────────────────────┐  │' || E'\n';
    v_receipt := v_receipt || '│  │  DATOS DEL CLIENTE                                 │  │' || E'\n';
    v_receipt := v_receipt || '│  ├────────────────────────────────────────────────────┤  │' || E'\n';
    v_receipt := v_receipt || '│  │  Nombre:              ' || RPAD(COALESCE(v_inv.parent_name, 'N/A'), 30) || '│  │' || E'\n';
    v_receipt := v_receipt || '│  │                                                     │  │' || E'\n';
    v_receipt := v_receipt || '│  │  ESTUDIANTE                                         │  │' || E'\n';
    v_receipt := v_receipt || '│  │  Nombre:              ' || RPAD(COALESCE(v_inv.student_name, 'N/A'), 30) || '│  │' || E'\n';
    v_receipt := v_receipt || '│  │  Matrícula:           ' || RPAD(COALESCE(v_inv.student_matricula, 'N/A'), 30) || '│  │' || E'\n';
    v_receipt := v_receipt || '│  │  Aula:                ' || RPAD(COALESCE(v_inv.classroom_name, 'N/A'), 30) || '│  │' || E'\n';
    v_receipt := v_receipt || '│  └────────────────────────────────────────────────────┘  │' || E'\n';
    v_receipt := v_receipt || '│                                                             │' || E'\n';
    v_receipt := v_receipt || '│  ┌────────────────────────────────────────────────────┐  │' || E'\n';
    v_receipt := v_receipt || '│  │  DETALLE DEL PAGO                                  │  │' || E'\n';
    v_receipt := v_receipt || '│  ├────────────────────────────────────────────────────┤  │' || E'\n';
    v_receipt := v_receipt || '│  │                                                     │  │' || E'\n';
    v_receipt := v_receipt || '│  │  Concepto                    Cantidad    Importe   │  │' || E'\n';
    v_receipt := v_receipt || '│  │  ─────────────────────────────────────────────────│  │' || E'\n';

    v_total := 0;
    FOR v_items IN SELECT * FROM public.invoice_items WHERE invoice_id = p_invoice_id LOOP
        v_receipt := v_receipt || '│  │  ' || RPAD(SUBSTR(COALESCE(v_items.concept, ''), 1, 26), 26) ||
            ' ' || RPAD(TO_CHAR(v_items.quantity, 'FM999999999999'), 8) ||
            '  ' || RPAD('$' || TO_CHAR(v_items.total, 'FM9999999999.99'), 10) || '│  │' || E'\n';
        v_total := v_total + v_items.total;
    END LOOP;

    v_receipt := v_receipt || '│  │                                                     │  │' || E'\n';
    v_receipt := v_receipt || '│  │  ─────────────────────────────────────────────────│  │' || E'\n';
    v_receipt := v_receipt || '│  │                                                     │  │' || E'\n';
    v_receipt := v_receipt || '│  │                          Subtotal:     ' || RPAD('$' || TO_CHAR(v_total, 'FM9999999999.99'), 12) || '│  │' || E'\n';
    v_receipt := v_receipt || '│  │                          IVA (0%):         $0.00  │  │' || E'\n';
    v_receipt := v_receipt || '│  │                          ────────────────────────│  │' || E'\n';
    v_receipt := v_receipt || '│  │                          TOTAL:        ' || RPAD('$' || TO_CHAR(v_total, 'FM9999999999.99'), 12) || '│  │' || E'\n';
    v_receipt := v_receipt || '│  │                                                     │  │' || E'\n';
    v_receipt := v_receipt || '│  └────────────────────────────────────────────────────┘  │' || E'\n';
    v_receipt := v_receipt || '│                                                             │' || E'\n';
    v_receipt := v_receipt || '│  ┌────────────────────────────────────────────────────┐  │' || E'\n';
    v_receipt := v_receipt || '│  │  INFORMACIÓN ADICIONAL                             │  │' || E'\n';
    v_receipt := v_receipt || '│  ├────────────────────────────────────────────────────┤  │' || E'\n';
    v_receipt := v_receipt || '│  │  Período:             ' || RPAD(COALESCE(v_inv.period, 'N/A'), 30) || '│  │' || E'\n';
    v_receipt := v_receipt || '│  │  Estado:              ✅ PAGADO                     │  │' || E'\n';
    IF v_inv.next_payment_date IS NOT NULL THEN
        v_receipt := v_receipt || '│  │  Próximo Pago:        ' || RPAD(TO_CHAR(v_inv.next_payment_date, 'DD "de" FMMonth "de" YYYY'), 30) || '│  │' || E'\n';
    END IF;
    IF v_inv.next_payment_amount IS NOT NULL THEN
        v_receipt := v_receipt || '│  │  Monto Próximo:       ' || RPAD('$' || TO_CHAR(v_inv.next_payment_amount, 'FM9999999999.99'), 30) || '│  │' || E'\n';
    END IF;
    v_receipt := v_receipt || '│  └────────────────────────────────────────────────────┘  │' || E'\n';
    v_receipt := v_receipt || '│                                                             │' || E'\n';
    v_receipt := v_receipt || '│  ┌────────────────────────────────────────────────────┐  │' || E'\n';
    v_receipt := v_receipt || '│  │  NOTAS                                              │  │' || E'\n';
    v_receipt := v_receipt || '│  ├────────────────────────────────────────────────────┤  │' || E'\n';
    v_receipt := v_receipt || '│  │  • Este recibo es válido como comprobante de pago  │  │' || E'\n';
    v_receipt := v_receipt || '│  │  • Conserve este documento para cualquier          │  │' || E'\n';
    v_receipt := v_receipt || '│  │    aclaración                                      │  │' || E'\n';
    v_receipt := v_receipt || '│  │  • Para dudas contacte a administración            │  │' || E'\n';
    v_receipt := v_receipt || '│  └────────────────────────────────────────────────────┘  │' || E'\n';
    v_receipt := v_receipt || '│                                                             │' || E'\n';
    v_receipt := v_receipt || '│  ─────────────────────────────────────────────────────────  │' || E'\n';
    v_receipt := v_receipt || '│                                                             │' || E'\n';
    v_receipt := v_receipt || '│              ¡Gracias por su confianza!                     │' || E'\n';
    v_receipt := v_receipt || '│                                                             │' || E'\n';
    v_receipt := v_receipt || '│  ─────────────────────────────────────────────────────────  │' || E'\n';
    v_receipt := v_receipt || '│                                                             │' || E'\n';
    v_receipt := v_receipt || '│  Firma: _____________________    Sello: [SELLO ESCUELA]   │' || E'\n';
    v_receipt := v_receipt || '│                                                             │' || E'\n';
    v_receipt := v_receipt || '│  ─────────────────────────────────────────────────────────  │' || E'\n';
    v_receipt := v_receipt || '│  Documento generado electrónicamente                        │' || E'\n';
    v_receipt := v_receipt || '│  Folio Digital: ' || RPAD(COALESCE(v_inv.digital_folio::TEXT, 'N/A'), 38) || ' │' || E'\n';
    v_receipt := v_receipt || '│  Fecha de Generación: ' || RPAD(TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS'), 36) || ' │' || E'\n';
    v_receipt := v_receipt || '│  ─────────────────────────────────────────────────────────  │' || E'\n';
    v_receipt := v_receipt || '│                                                             │' || E'\n';
    v_receipt := v_receipt || '└─────────────────────────────────────────────────────────────┘' || E'\n';

    RETURN v_receipt;
EXCEPTION
    WHEN OTHERS THEN
        RETURN 'Recibo no disponible - Error al generar: ' || SQLERRM;
END;
$$;
