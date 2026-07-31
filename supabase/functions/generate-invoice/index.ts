/**
 * generate-invoice — Edge Function v2
 * Crea factura en BD, genera hash de validación, retorna datos completos.
 * El PDF y email se generan client-side para máximo control visual.
 *
 * Body params:
 *   - payment_id: ID del pago (obligatorio)
 *   - send_email: boolean (solo flag, el email se envía desde client)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleOptions, checkCors, json } from "../_shared/cors.ts";
import { requireStaff } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  const optionsResp = handleOptions(req);
  if (optionsResp) return optionsResp;
  const { origin, denied } = checkCors(req);
  if (denied) return json({ error: 'Forbidden' }, 403, origin);

  const auth = await requireStaff(req);
  if (!auth.allowed) return json({ error: auth.error ?? 'Forbidden' }, auth.status, origin);

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
    const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const SITE_URL    = Deno.env.get('SITE_URL') ?? 'https://montessorisonrisascreativas.com';

    if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: 'Missing env vars' }, 500, origin);
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const body = await req.json();
    const { payment_id } = body;
    if (!payment_id) return json({ error: 'Missing payment_id' }, 400, origin);

    // 1. Obtener datos del pago con joins completos
    const { data: payment, error: errPayment } = await supabase
      .from('payments')
      .select(`
        id, student_id, amount, concept, method, bank, evidence_url,
        month_paid, notes, created_at, paid_date, due_date, status,
        students!student_id (
          id, name, matricula, classroom_id, p1_name, p1_email, p1_phone, p2_email,
          photo_url, date_of_birth, monthly_fee,
          classrooms!classroom_id ( name, level )
        )
      `)
      .eq('id', payment_id)
      .single();

    if (errPayment || !payment) {
      return json({ error: 'Payment not found' }, 404, origin);
    }

    const student = (payment as any).students ?? {};
    const classroom = student?.classrooms ?? {};

    // 2. Obtener configuración del colegio
    const { data: school } = await supabase
      .from('school_settings')
      .select('*')
      .eq('id', 1)
      .single();

    // 3. Generar número de recibo usando la función de BD
    let receiptNo: string;
    const { data: rpcResult, error: rpcErr } = await supabase.rpc('generate_receipt_number');
    if (rpcErr || !rpcResult) {
      // Fallback: generar localmente
      receiptNo = `MSC-${(school?.school_code || 'MSC')}-${new Date().getFullYear()}${String(new Date().getMonth()+1).padStart(2,'0')}-${String(payment_id).padStart(4,'0').toUpperCase()}`;
    } else {
      receiptNo = rpcResult;
    }

    // 4. Crear hash SHA-256 para validación
    const hashInput = `INV-${payment_id}-${Date.now()}-MSC`;
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(hashInput));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const sha256Hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // UUID folio
    const uuidFolio = crypto.randomUUID();
    const validationUrl = `${SITE_URL}/validate-invoice.html?uuid=${uuidFolio}`;

    // 5. Parsear notas para RNC/Empresa
    let clientRNC = '';
    let clientCompany = '';
    const notes = payment.notes || '';
    const rncMatch = notes.match(/RNC:([^|]+)/);
    if (rncMatch) clientRNC = rncMatch[1].trim();
    const empMatch = notes.match(/Empresa:([^|]+)/);
    if (empMatch) clientCompany = empMatch[1].trim();

    // 6. Insertar factura
    const invoiceData = {
      invoice_number: receiptNo,
      receipt_number: receiptNo,
      payment_id,
      student_id: student.id,
      student_name: student.name,
      student_matricula: student.matricula,
      classroom_name: classroom?.name,
      parent_name: student.p1_name,
      parent_phone: student.p1_phone,
      concept: payment.concept,
      amount: payment.amount,
      subtotal: payment.amount,
      tax_amount: 0,
      total: payment.amount,
      status: 'paid',
      payment_method: payment.method,
      payment_reference: payment.bank ? `${payment.bank} - ${payment.method}` : payment.method,
      attended_by: 'Sistema',
      period: payment.month_paid,
      payment_date: payment.paid_date || payment.created_at,
      issued_date: new Date().toISOString(),
      notes: payment.notes,
      sha256_hash: sha256Hash,
      uuid_folio: uuidFolio,
      validation_url: validationUrl,
      qr_data: validationUrl,
      fiscal_parent_rnc: clientRNC || null,
      fiscal_parent_company_name: clientCompany || null,
    };

    let { data: invoice, error: errInvoice } = await supabase
      .from('invoices')
      .insert(invoiceData)
      .select('*')
      .single();

    // Retry sin trigger si falla
    if (errInvoice) {
      console.warn('[generate-invoice] Insert failed, retrying:', errInvoice.message);
      try { await supabase.rpc('exec_sql', { sql: "SET LOCAL app.skip_ascii_trigger = '1'" }); } catch (_) {}
      const retry = await supabase
        .from('invoices')
        .insert(invoiceData)
        .select('*')
        .single();
      invoice = retry.data;
      errInvoice = retry.error;
      if (errInvoice) {
        console.error('[generate-invoice] Invoice insert still failed:', errInvoice);
        return json({ error: 'Invoice insert failed' }, 500, origin);
      }
    }

    // 7. Insertar items de factura
    if (invoice?.id) {
      try {
        await supabase.from('invoice_items').insert({
          invoice_id: invoice.id,
          concept: payment.concept || 'Pago',
          quantity: 1,
          unit_price: payment.amount,
          total: payment.amount
        });
      } catch (e) {
        console.warn('[generate-invoice] invoice_items insert failed:', e);
      }

      // Generar el hash con el ID real
      const finalHashInput = `INV-${invoice.id}-${Date.now()}-KPK`;
      const finalHashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(finalHashInput));
      const finalHash = Array.from(new Uint8Array(finalHashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
      await supabase.from('invoices').update({ sha256_hash: finalHash }).eq('id', invoice.id);
      invoice.sha256_hash = finalHash;
    }

    // 8. Retornar datos completos para el client-side
    return json({
      success: true,
      invoice: {
        ...invoice,
        uuid_folio: uuidFolio,
        sha256_hash: sha256Hash,
        validation_url: validationUrl,
        qr_data: validationUrl,
      },
      receipt_number: receiptNo,
      student: {
        name: student.name,
        matricula: student.matricula,
        p1_name: student.p1_name,
        p1_email: student.p1_email,
        p1_phone: student.p1_phone,
        p2_email: student.p2_email,
        photo_url: student.photo_url,
        classroom: classroom?.name,
        level: classroom?.level,
      },
      school: {
        school_name: school?.school_name || 'Colegio Montessori Sonrisas Creativas',
        address: school?.address,
        city: school?.city,
        state: school?.state,
        phone: school?.phone,
        email: school?.email,
        rnc: school?.rnc,
        website: school?.website || SITE_URL,
        logo_url: school?.logo_url || `${SITE_URL}/img/monte.jpg`,
      },
      payment: {
        concept: payment.concept,
        amount: payment.amount,
        method: payment.method,
        bank: payment.bank,
        paid_date: payment.paid_date || payment.created_at,
        month_paid: payment.month_paid,
      },
    }, 200, origin);

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[generate-invoice] fatal:', msg);
    return json({ error: 'Unexpected error' }, 500, origin);
  }
});
