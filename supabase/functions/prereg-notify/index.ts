/**
 * 📬 prereg-notify — Edge Function (PÚBLICA)
 *
 * Envía el acuse de recibo de una preinscripción al correo que la
 * familia ingressó en el formulario. Es la única función del proyecto que
 * se invoca SIN sesión de staff, así que aplica controles propios:
 *
 *   1. Exige `id` + `email` y valida ambos formatos.
 *   2. El correo DEBE coincidir (case-insensitive) con el `p1_email`
 *      guardado en esa fila. Sin esto, cualquiera podría usar la
 *      función como relay de spam a cualquier destinatario.
 *   3. Idempotencia vía `ack_sent_at`, reclamada con un UPDATE
 *      condicional ANTES de enviar (evita duplicados si llegan dos
 *      peticiones simultáneas). Si el envío falla, la marca se libera.
 *   4. `force: true` sólo se respeta si viene con un JWT de staff
 *      válido; desde el navegador público se ignora.
 *   5. Rate limit en memoria por IP (ventana de 10 minutos).
 *   6. El HTML se arma con el mismo template del cliente y se
 *      escapan todos los valores que vienen de la base de datos.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.1.0";
import { handleOptions, checkCors, json } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_ADDRESS = Deno.env.get("FROM_EMAIL")
  ?? "Colegio Montessori Sonrisas Creativas <avisos@montessorisonrisascreativas.com>";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Rate limit en memoria (por instancia de la función) ──────────
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 8;
const hits = new Map<string, number[]>();

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0] : "").trim() || "unknown";
}

function rateLimited(key: string): boolean {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) hits.clear();
  return list.length > RATE_MAX;
}

/** Escapa HTML para interpolar datos de la BD en el template. */
function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function buildText(d: Record<string, unknown>, email: string): string {
  const nombre = [d.student_name, d.student_last_name].filter(Boolean).join(" ") || "su hijo(a)";
  const nivel  = d.level_requested || d.suggested_level || "el nivel solicitado";
  return [
    "Gracias por su preinscripción",
    "",
    `Estimada familia ${esc(d.p1_name || "")},`,
    "",
    `Recibimos correctamente la preinscripción de ${esc(nombre)} en ${esc(nivel)}.`,
    "",
    "QUÉ PASA AHORA",
    "1. La Dirección Académica revisa la solicitud y los documentos.",
    "2. Si todo está en orden, se acepta el ingreso y se asigna el aula.",
    "3. Le enviamos un segundo correo con la matrícula y las credenciales",
    "   de acceso al Portal de Padres.",
    "",
    "HASTA ENTONCES",
    "El Portal de Padres todavía no está disponible para esta familia.",
    "El acceso se habilita únicamente después de la aceptación.",
    "",
    "Este es el correo donde le notificaremos cuando sea aceptada/o.",
    `Correo de contacto registrado: ${email}`,
    "",
    "Atentamente,",
    "Dirección Académica – Montessori Sonrisas Creativas",
    "Teléfono: +1 (809) 532-4903",
    "Instagram: @montessorisonrisascreativas",
  ].join("\n");
}

function buildHtml(d: Record<string, unknown>, email: string, host: string): string {
  const nombre = [d.student_name, d.student_last_name].filter(Boolean).join(" ") || "su hijo(a)";
  const nivel  = d.level_requested || d.suggested_level || "el nivel solicitado";
  const ref    = d.id;
  const year   = new Date().getFullYear();
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#334155">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f7fb"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:620px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 10px 30px rgba(11,99,199,0.08)">
  <tr><td style="background:linear-gradient(135deg,#0B63C7 0%,#2563eb 55%,#4f46e5 100%);padding:22px 28px">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td width="64"><img src="${host}/img/monte.jpg" alt="MSC" width="56" height="56" style="border-radius:14px;background:#fff;padding:4px;display:block" onerror="this.style.display='none'"></td>
      <td style="padding-left:12px;color:#fff">
        <div style="font-size:18px;font-weight:900;line-height:1.1">Montessori Sonrisas Creativas</div>
        <div style="font-size:11px;color:#dbeafe;margin-top:3px;letter-spacing:0.5px;text-transform:uppercase">Acuse de preinscripción · ${year}</div>
      </td>
    </tr></table>
  </td></tr>

  <tr><td style="padding:26px 28px">
    <h1 style="margin:0 0 6px;font-size:21px;font-weight:900;color:#0f172a">Gracias por su preinscripción</h1>
    <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#475569">
      Estimada familia ${esc(d.p1_name || "")}, recibimos correctamente la solicitud de
      <strong>${esc(nombre)}</strong> para ${esc(nivel)}.
    </p>

    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:14px 16px;margin-bottom:18px">
      <div style="font-size:12px;font-weight:900;color:#1d4ed8;letter-spacing:0.4px;text-transform:uppercase;margin-bottom:8px">N&uacute;mero de preinscripci&oacute;n</div>
      <div style="font-size:20px;font-weight:900;color:#0B63C7;font-family:Menlo,Consolas,monospace">#${esc(ref)}</div>
      <div style="font-size:12px;color:#475569;margin-top:6px">Guarde este n&uacute;mero para cualquier consulta.</div>
    </div>

    <div style="font-size:13px;font-weight:900;color:#0f172a;margin:0 0 8px">&iquest;Qu&eacute; pasa ahora?</div>
    <ol style="margin:0 0 18px;padding-left:20px;font-size:13px;line-height:1.9;color:#475569">
      <li>La Direcci&oacute;n Acad&eacute;mica revisa la solicitud y los documentos.</li>
      <li>Si todo est&aacute; en orden, se acepta el ingreso y se asigna el aula.</li>
      <li>Le enviamos un segundo correo con la matr&iacute;cula y las credenciales del Portal de Padres.</li>
    </ol>

    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:14px 16px;margin-bottom:18px">
      <div style="font-size:12px;font-weight:900;color:#9a3412;letter-spacing:0.4px;text-transform:uppercase;margin-bottom:6px">Portal de Padres</div>
      <div style="font-size:13px;line-height:1.6;color:#7c2d12">
        A&uacute;n no puede ingresar. El acceso se habilita <strong>solamente despu&eacute;s de que la
        Direcci&oacute;n acepte la preinscripci&oacute;n</strong>. No intente registrarse todav&iacute;a.
      </div>
    </div>

    <div style="font-size:12px;color:#64748b;line-height:1.7">
      Le avisaremos a este correo: <strong>${esc(email)}</strong><br>
      &iquest;Alguna duda? Escr&iacute;banos al +1 (809) 532-4903 o por Instagram
      <strong>@montessorisonrisascreativas</strong>.
    </div>
  </td></tr>

  <tr><td style="background:#f8fafc;padding:16px 28px;border-top:1px solid #e2e8f0">
    <div style="font-size:11px;color:#94a3b8;line-height:1.6">
      Este correo se env&iacute;o autom&aacute;ticamente al registrar la preinscripci&oacute;n.
      Por favor no responda a este mensaje.
    </div>
  </td></tr>
</table>
</td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  const optionsResp = handleOptions(req);
  if (optionsResp) return optionsResp;
  const { origin, denied } = checkCors(req);
  if (denied) return json({ error: "Forbidden" }, 403, origin);

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, origin);

  const ip = clientIp(req);
  if (rateLimited(ip)) {
    console.warn(`[prereg-notify] rate limit golpeado por ${ip}`);
    return json({ error: "Demasiados intentos. Intente en unos minutos." }, 429, origin);
  }

  try {
    const body = await req.json();
    const id    = Number(body?.id);
    const email = String(body?.email ?? "").trim().toLowerCase();
    const wantsForce = body?.force === true;

    if (!Number.isInteger(id) || id <= 0) {
      return json({ error: "Invalid preinscripción id" }, 400, origin);
    }
    if (!EMAIL_RE.test(email)) {
      return json({ error: "Invalid email address" }, 400, origin);
    }
    if (JSON.stringify(body).length > 20_000) {
      return json({ error: "Request body too large" }, 413, origin);
    }
    if (!RESEND_API_KEY) {
      console.error("[prereg-notify] RESEND_API_KEY not configured");
      return json({ error: "Email service not configured" }, 500, origin);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // ── `force` sólo para staff autenticado ──
    let isStaff = false;
    if (wantsForce) {
      const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
      if (token) {
        const { data: authData } = await supabase.auth.getUser(token);
        if (authData?.user) {
          const { data: prof } = await supabase
            .from("profiles").select("role").eq("id", authData.user.id).maybeSingle();
          const role = String(prof?.role ?? authData.user.user_metadata?.role ?? "").toLowerCase();
          isStaff = ["directora", "directora_academica", "admin", "administrador", "asistente", "secretaria"].includes(role);
        }
      }
      if (!isStaff) console.warn("[prereg-notify] force ignorado: sin sesión de staff");
    }

    // ── Anti-abuso: el correo debe ser el que esa fila registró ──
    const { data: row, error: readErr } = await supabase
      .from("student_preregistrations")
      .select("id, student_name, student_last_name, p1_name, p1_email, level_requested, suggested_level, status, created_at, ack_sent_at")
      .eq("id", id)
      .maybeSingle();

    if (readErr) { console.error("[prereg-notify] read error:", readErr); return json({ error: "Lookup failed" }, 500, origin); }
    if (!row) return json({ error: "Preinscripción no encontrada" }, 404, origin);

    const stored = String(row.p1_email ?? "").trim().toLowerCase();
    if (!stored || stored !== email) {
      // No revelamos cuál de los dos falló.
      console.warn(`[prereg-notify] email mismatch on prereg #${id}`);
      return json({ error: "Preinscripción no encontrada" }, 404, origin);
    }

    // ── Reclamo atómico de la fila antes de enviar ──
    // Dos peticiones simultáneas: sólo una gana el UPDATE.
    const stamp = new Date().toISOString();
    const { data: claimed, error: claimErr } = await supabase
      .from("student_preregistrations")
      .update({ ack_sent_at: stamp, ack_email_sent_to: email })
      .eq("id", id)
      .is("ack_sent_at", null)
      .select("id")
      .maybeSingle();

    if (claimErr) {
      console.error("[prereg-notify] no se pudo reclamar la fila:", claimErr.message);
      return json({ error: "Lookup failed" }, 500, origin);
    }

    const alreadySent = !claimed;
    if (alreadySent && !isStaff) {
      return json({ success: true, already_sent: true, id: row.id }, 200, origin);
    }

    // ── Envío ──
    const host = Deno.env.get("PUBLIC_SITE_URL") ?? "https://montessorisonrisascreativas.com";
    const resend = new Resend(RESEND_API_KEY);
    const { data: sent, error: sendErr } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: [email],
      subject: `Preinscripción recibida #${row.id} — ${[row.student_name, row.student_last_name].filter(Boolean).join(" ") || "Estudiante"}`,
      html: buildHtml(row as Record<string, unknown>, email, host),
      text: buildText(row as Record<string, unknown>, email),
    } as never);

    if (sendErr) {
      console.error("[prereg-notify] Resend error:", sendErr);
      // Se libera la marca para que un reintento pueda funcionar.
      if (claimed) {
        await supabase.from("student_preregistrations")
          .update({ ack_sent_at: null, ack_email_sent_to: null })
          .eq("id", id);
      }
      return json({ error: "Email service error" }, 502, origin);
    }

    console.log("[prereg-notify] ✅ acuse enviado:", sent?.id, "→ prereg #", id);
    return json({ success: true, id: row.id, email_id: sent?.id ?? null, resent: alreadySent }, 200, origin);

  } catch (err) {
    console.error("[prereg-notify] Unexpected error:", err instanceof Error ? err.message : err);
    return json({ error: "Unexpected error" }, 500, origin);
  }
});
