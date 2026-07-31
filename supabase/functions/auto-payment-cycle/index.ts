/**
 * auto-payment-cycle — Edge Function
 * Genera cobros mensuales automáticamente para todos los estudiantes activos.
 * - Corre el día 1 de cada mes (genera cobros del mes actual)
 * - También rellena meses anteriores que no tienen cobros (backfill)
 * - Se puede forzar con header x-force-run: true
 *
 * Cron recomendado: día 1 de cada mes a las 6am RD (10:00 UTC)
 *   '0 10 1 * *'
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleOptions, checkCors, json } from "../_shared/cors.ts";
import { requireRole } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  const optionsResp = handleOptions(req);
  if (optionsResp) return optionsResp;
  const { origin, denied } = checkCors(req);
  if (denied) return json({ error: 'Forbidden' }, 403, origin);

  const auth = await requireRole(req, ['directora', 'asistente', 'admin', 'encargada', 'service_role']);
  if (!auth.allowed) return json({ error: auth.error ?? 'Forbidden' }, auth.status, origin);

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')              ?? '';
    const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: 'Missing env vars' }, 500, origin);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const body = await req.json().catch(() => ({}));
    const forceRun = req.headers.get('x-force-run') === 'true' || body?.force === true;

    // ── Configuración ────────────────────────────────────────────────────────
    const { data: settings } = await supabase
      .from('school_settings').select('generation_day, due_day').eq('id', 1).single();
    const dueDay = settings?.due_day ?? 5;

    const now = new Date();

    // ── Estudiantes activos con cuota ────────────────────────────────────────
    const { data: students, error: sErr } = await supabase
      .from('students')
      .select('id, name, student_enrollments!left(id,payment_plans!left(plan_installments(month_number,amount)))')
      .eq('is_active', true);
    if (sErr) return json({ error: 'Database error' }, 500, origin);
    const activeStudents = ((students || []) as any[]).filter((s: any) => {
      const fee = Number(s.student_enrollments?.[0]?.payment_plans?.plan_installments?.[0]?.amount ?? 0);
      return fee > 0;
    });
  if (!activeStudents.length) return json({ ok: true, generated: 0, message: 'No active students with fee plan' }, 200, origin);

    // ── Determinar qué meses necesitan cobros ────────────────────────────────
    // Genera cobros para el mes actual + los últimos 3 meses (backfill)
    const monthsToProcess: string[] = [];
    for (let offset = -2; offset <= 0; offset++) {
      const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      monthsToProcess.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    console.log('[auto-payment-cycle] Processing months:', monthsToProcess);

    let totalGenerated = 0;
    const results: Record<string, number> = {};

    for (const monthKey of monthsToProcess) {
      const [yr, mo] = monthKey.split('-').map(Number);

      // due_date = día 5 del mes siguiente
      const dueMonth = mo > 11 ? 1 : mo + 1;
      const dueYear  = mo > 11 ? yr + 1 : yr;
      const dueDate  = `${dueYear}-${String(dueMonth).padStart(2,'0')}-${String(dueDay).padStart(2,'0')}`;

      // Estudiantes que YA tienen cobro en este mes
      const { data: existing } = await supabase
        .from('payments')
        .select('student_id')
        .or(`month_paid.eq.${monthKey},month_paid.eq.${monthKey.replace('-0','-').replace(/^(\d{4})-(\d)$/,'$1-0$2')}`)
        .not('status', 'eq', 'deleted');

      const existingIds = new Set((existing || []).map((p: { student_id: string }) => String(p.student_id)));
      const missing = activeStudents.filter(s => !existingIds.has(String(s.id)));

      if (!missing.length) {
        console.log(`[auto-payment-cycle] ${monthKey}: all students covered`);
        results[monthKey] = 0;
        continue;
      }

      const inserts = missing.map(s => ({
        student_id: s.id,
        amount:     Number(s.student_enrollments?.[0]?.payment_plans?.plan_installments?.[0]?.amount ?? 0),
        status:     'pending',
        due_date:   dueDate,
        month_paid: monthKey,
        concept:    'Mensualidad',
        created_at: new Date().toISOString(),
      }));

      const { error: insErr } = await supabase.from('payments').insert(inserts);
      if (insErr) {
        console.error(`[auto-payment-cycle] Insert error for ${monthKey}:`, insErr.message);
        results[monthKey] = -1;
        continue;
      }

      console.log(`[auto-payment-cycle] ${monthKey}: generated ${missing.length} payments`);
      results[monthKey] = missing.length;
      totalGenerated += missing.length;
    }

    // ── Marcar vencidos ──────────────────────────────────────────────────────
    const todayStr = now.toISOString().split('T')[0];
    await supabase.from('payments')
      .update({ status: 'overdue' })
      .eq('status', 'pending')
      .lt('due_date', todayStr);

    console.log(`[auto-payment-cycle] ✅ Total generated: ${totalGenerated}`);

    return json({
      ok:        true,
      generated: totalGenerated,
      by_month:  results,
      ran_at:    now.toISOString(),
    }, 200, origin);

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[auto-payment-cycle] Fatal:', msg);
    return json({ error: 'Unexpected error' }, 500, origin);
  }
});
