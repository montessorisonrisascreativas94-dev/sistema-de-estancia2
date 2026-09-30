/**
 * 📧 send-email — Edge Function
 * Envía correos via Resend.
 * SEGURIDAD: CORS estricto + requiere staff autenticado (o service role interno).
 */
import { Resend } from "https://esm.sh/resend@2.1.0";
import { handleOptions, checkCors, json } from "../_shared/cors.ts";
import { requireStaff } from "../_shared/auth.ts";

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const FROM_ADDRESS   = Deno.env.get('FROM_EMAIL') ?? 'Colegio Montessori Sonrisas Creativas <avisos@montessorisonrisascreativas.com>';

Deno.serve(async (req) => {
  const optionsResp = handleOptions(req);
  if (optionsResp) return optionsResp;
  const { origin, denied } = checkCors(req);
  if (denied) return json({ error: 'Forbidden' }, 403, origin);

  const auth = await requireStaff(req);
  if (!auth.allowed) return json({ error: auth.error ?? 'Forbidden' }, auth.status, origin);

  try {
    const body = await req.json();
    const { to, subject, html, text, attachments } = body;

    // Validación de schema
    if (!to || !subject || (!html && !text)) {
      return json({ error: 'Missing required fields: to, subject, html or text' }, 400, origin);
    }
    // Validar formato de email
    const toList = Array.isArray(to) ? to : [to];
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!toList.every(e => typeof e === 'string' && emailRegex.test(e))) {
      return json({ error: 'Invalid email address in "to" field' }, 400, origin);
    }
    if (typeof subject !== 'string' || subject.length > 500) {
      return json({ error: 'Invalid subject' }, 400, origin);
    }
    // Limitar tamaño del body para evitar abuso
    const bodySize = JSON.stringify(body).length;
    if (bodySize > 500_000) { // 500KB max
      return json({ error: 'Request body too large' }, 413, origin);
    }

    if (!RESEND_API_KEY) {
      console.error('[send-email] RESEND_API_KEY not configured');
      return json({ error: 'Email service not configured' }, 500, origin);
    }

    const resend = new Resend(RESEND_API_KEY);

    const payload: Record<string, unknown> = {
      from:    FROM_ADDRESS,
      to:      Array.isArray(to) ? to : [to],
      subject,
      html:    html ?? text,
      text:    text ?? (html as string).replace(/<[^>]*>/gm, ''),
    };

    if (Array.isArray(attachments) && attachments.length > 0) {
      payload.attachments = attachments.map((a: { filename: string; content: string }) => ({
        filename: a.filename,
        content:  a.content,
      }));
    }

    const { data, error } = await resend.emails.send(payload as unknown as Parameters<typeof resend.emails.send>[0]);

    if (error) {
      console.error('[send-email] Resend error:', error);
      return json({ error: 'Email service error' }, 400, origin);
    }

    console.log('[send-email] ✅ Sent:', data?.id, '→', Array.isArray(to) ? `${to.length} recipient(s)` : '1 recipient');
    return json({ success: true, id: data?.id }, 200, origin);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[send-email] Unexpected error:', msg);
    return json({ error: 'Unexpected error' }, 500, origin);
  }
});
