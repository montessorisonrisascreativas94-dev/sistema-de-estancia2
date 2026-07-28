/**
 * generate-payroll-invoice — Edge Function
 * Genera recibo de nómina por empleado, lo almacena en payroll_invoices.
 *
 * Body params:
 *   - payroll_id: ID del registro de nómina (obligatorio)
 *   - send_email: boolean — opcional, envía recibo por email
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
    const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const SITE_URL     = Deno.env.get('SITE_URL') ?? 'https://montessorisonrisascreativas.com';

    if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: 'Missing env vars' }, 500);
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const body = await req.json();
    const { payroll_id, send_email } = body;
    if (!payroll_id) return json({ error: 'Missing payroll_id' }, 400);

    const { data: payroll, error: errPR } = await supabase
      .from('payroll_records')
      .select(`
        id, employee_id, period, gross_salary, afp, ars, isr, net_salary,
        afp_patronal, ars_patronal, status, created_at,
        profiles:employee_id ( name, role, email, phone )
      `)
      .eq('id', payroll_id)
      .single();

    if (errPR || !payroll) return json({ error: 'Payroll record not found' }, 404);

    const employee = (payroll as any).profiles ?? {};

    const { data: school } = await supabase
      .from('school_settings')
      .select('*')
      .eq('id', 1)
      .single();

    let receiptNo: string;
    const { data: rpcResult } = await supabase.rpc('generate_receipt_number');
    if (rpcResult) {
      receiptNo = rpcResult;
    } else {
      const ts = Date.now().toString(36).toUpperCase();
      receiptNo = `NOM-${payroll.period?.replace('-','')}-${ts}`;
    }

    const hashInput = `PAYROLL-${payroll_id}-${Date.now()}`;
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(hashInput));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const sha256Hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    const { data: invoice, error: errInv } = await supabase
      .from('payroll_invoices')
      .insert({
        payroll_id: payroll.id,
        employee_id: payroll.employee_id,
        period: payroll.period,
        receipt_number: receiptNo,
        gross_salary: payroll.gross_salary,
        afp: payroll.afp,
        ars: payroll.ars,
        isr: payroll.isr,
        net_salary: payroll.net_salary,
        afp_patronal: payroll.afp_patronal || 0,
        ars_patronal: payroll.ars_patronal || 0,
        status: 'emitido',
        created_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (errInv) return json({ error: 'Failed to create invoice: ' + errInv.message }, 500);

    return json({
      success: true,
      invoice,
      receipt_number: receiptNo,
      employee: {
        name: employee.name,
        role: employee.role,
        email: employee.email,
        phone: employee.phone,
      },
      school: {
        school_name: school?.school_name || 'Colegio Montessori Sonrisas Creativas',
        address: school?.address,
        phone: school?.phone,
        email: school?.email,
        rnc: school?.rnc,
        logo_url: school?.logo_url || `${SITE_URL}/img/monte.jpg`,
      },
      payroll: {
        period: payroll.period,
        gross_salary: payroll.gross_salary,
        afp: payroll.afp,
        ars: payroll.ars,
        isr: payroll.isr,
        net_salary: payroll.net_salary,
        afp_patronal: payroll.afp_patronal,
        ars_patronal: payroll.ars_patronal,
      },
      hash: sha256Hash,
    });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[generate-payroll-invoice] fatal:', msg);
    return json({ error: msg }, 500);
  }
});
