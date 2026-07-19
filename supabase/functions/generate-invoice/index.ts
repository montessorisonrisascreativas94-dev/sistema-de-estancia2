/**
 * 📄 generate-invoice — Edge Function
 * Genera facturas/recibos y envía por email.
 * Body params:
 *   - payment_id: ID del pago (obligatorio)
 *   - send_email: boolean (si enviar el email)
 *   - format: 'ascii' | 'html' | 'pdf' (formato del recibo)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.1.0";

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-application-name',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

function formatCurrency(n: number): string {
  return '$' + n.toLocaleString('es-DO', { minimumFractionDigits: 2 });
}

function formatDate(dateStr: string | Date): string {
  const d = typeof dateStr === 'string' ? new Date(dateStr + 'T00:00:00') : dateStr;
  return d.toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatTime(dateStr: string | Date): string {
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  return d.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });
}

function padRight(str: string, length: number): string {
  return (str + ' '.repeat(length)).slice(0, length);
}

function padLeft(str: string, length: number): string {
  return (' '.repeat(length) + str).slice(-length);
}

function generateProfessionalReceipt(
  school: any,
  receiptNumber: string,
  payment: any,
  student: any,
  classroom: any,
  invoice: any
): string {
  const issuedDate = new Date(invoice.issued_date);
  const paymentDate = new Date(payment.paid_date || payment.created_at);
  
  // Datos del colegio (usar school_settings si están disponibles)
  const schoolName = school?.school_name || 'COLEGIO MONTESSORI SONRISAS CREATIVAS';
  const schoolAddress = school?.address || 'Calle Principal #123, Col. Centro';
  const schoolCity = [school?.city, school?.state, school?.zip_code].filter(Boolean).join(', ') || 'Ciudad, Estado, C.P. 12345';
  const schoolPhone = school?.phone ? `Tel: ${school.phone}` : 'Tel: (123) 456-7890';
  const schoolEmail = school?.email ? `Email: ${school.email}` : 'Email: contacto@montessorisonrisascreativas.com';
  const schoolRFC = school?.rnc ? `RNC: ${school.rnc}` : 'RNC: KKI123456ABC';

  // Parse RNC/Empresa from notes
  let clientRNC = '';
  let clientEmpresa = '';
  if (payment.notes) {
    const rncMatch = payment.notes.match(/RNC:([^|]+)/);
    if (rncMatch) clientRNC = rncMatch[1].trim();
    const empresaMatch = payment.notes.match(/Empresa:([^|]+)/);
    if (empresaMatch) clientEmpresa = empresaMatch[1].trim();
  }

  const lines: string[] = [];
  
  // Encabezado del colegio
  lines.push('╔══════════════════════════════════════════════════════════════════════════════╗');
  lines.push('║                                                                              ║');
  lines.push('║                     🏫 ' + padRight(schoolName.toUpperCase(), 48) + ' ║');
  lines.push('║                     ESTANCIA INFANTIL                                                      ║');
  lines.push('║                                                                              ║');
  lines.push('║    ' + padRight(schoolAddress, 68) + ' ║');
  lines.push('║    ' + padRight(schoolCity, 68) + ' ║');
  lines.push('║    ' + padRight(schoolPhone, 68) + ' ║');
  lines.push('║    ' + padRight(schoolEmail, 68) + ' ║');
  lines.push('║    ' + padRight(schoolRFC, 68) + ' ║');
  lines.push('║                                                                              ║');
  lines.push('╚══════════════════════════════════════════════════════════════════════════════╝');
  lines.push('');
  
  // Título del recibo
  lines.push('┌──────────────────────────────────────────────────────────────────────────────┐');
  lines.push('│                          RECIBO DE PAGO                                      │');
  lines.push('│                      No. ' + padRight(receiptNumber, 50) + ' │');
  lines.push('└──────────────────────────────────────────────────────────────────────────────┘');
  lines.push('');
  
  // Información del recibo
  lines.push('┌──────────────────────────────────────────────────────────────────────────────┐');
  lines.push('│  INFORMACIÓN DEL RECIBO                                                      │');
  lines.push('├──────────────────────────────────────────────────────────────────────────────┤');
  lines.push('│  Fecha de Emisión:     ' + padRight(formatDate(issuedDate), 48) + ' │');
  lines.push('│  Hora:                 ' + padRight(formatTime(issuedDate) + ' hrs', 48) + ' │');
  lines.push('│  Método de Pago:       ' + padRight(payment.method || 'Efectivo', 48) + ' │');
  lines.push('│  Referencia:           ' + padRight(invoice.payment_reference || 'N/A', 48) + ' │');
  lines.push('│  Atendió:              ' + padRight(invoice.attended_by || 'Sistema', 48) + ' │');
  lines.push('└──────────────────────────────────────────────────────────────────────────────┘');
  lines.push('');
  
  // Datos del cliente y estudiante
  lines.push('┌──────────────────────────────────────────────────────────────────────────────┐');
  lines.push('│  DATOS DEL CLIENTE                                                           │');
  lines.push('├──────────────────────────────────────────────────────────────────────────────┤');
  lines.push('│  Nombre:               ' + padRight(student.p1_name || 'N/A', 48) + ' │');
  lines.push('│  Email:                ' + padRight(student.p1_email || 'N/A', 48) + ' │');
  lines.push('│  Teléfono:             ' + padRight(student.p1_phone || 'N/A', 48) + ' │');
  if (clientEmpresa) lines.push('│  Empresa:              ' + padRight(clientEmpresa, 48) + ' │');
  if (clientRNC) lines.push('│  RNC:                  ' + padRight(clientRNC, 48) + ' │');
  lines.push('│                                                                              │');
  lines.push('│  ESTUDIANTE                                                                  │');
  lines.push('│  Nombre:               ' + padRight(student.name || 'N/A', 48) + ' │');
  lines.push('│  Matrícula:            ' + padRight(student.matricula || 'N/A', 48) + ' │');
  lines.push('│  Aula:                 ' + padRight(classroom?.name || 'N/A', 48) + ' │');
  lines.push('└──────────────────────────────────────────────────────────────────────────────┘');
  lines.push('');
  
  // Detalle del pago
  lines.push('┌──────────────────────────────────────────────────────────────────────────────┐');
  lines.push('│  DETALLE DEL PAGO                                                            │');
  lines.push('├──────────────────────────────────────────────────────────────────────────────┤');
  lines.push('│                                                                              │');
  lines.push('│  Concepto                     Cantidad       Importe                          │');
  lines.push('│  ─────────────────────────────────────────────────────────────────────────  │');
  
  // Item del pago
  const concept = payment.concept || 'Pago';
  const quantity = 1;
  const unitPrice = payment.amount;
  const total = payment.amount;
  
  lines.push('│  ' + padRight(concept, 32) + '  ' + padLeft(String(quantity), 6) + '  ' + padLeft(formatCurrency(total), 16) + '  │');
  lines.push('│                                                                              │');
  lines.push('│  ─────────────────────────────────────────────────────────────────────────  │');
  lines.push('│                                                                              │');
  lines.push('│                                      Subtotal:     ' + padLeft(formatCurrency(invoice.subtotal || payment.amount), 16) + '  │');
  lines.push('│                                      IVA (0%):         ' + padLeft(formatCurrency(invoice.tax_amount || 0), 16) + '  │');
  lines.push('│                                      ────────────────────────────────────    │');
  lines.push('│                                      TOTAL:        ' + padLeft(formatCurrency(invoice.total || payment.amount), 16) + '  │');
  lines.push('│                                                                              │');
  lines.push('└──────────────────────────────────────────────────────────────────────────────┘');
  lines.push('');
  
  // Información adicional
  const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const period = invoice.period || payment.month_paid || '';
  let periodText = '';
  if (period) {
    const [year, month] = period.split('-');
    if (year && month) {
      periodText = `${monthNames[parseInt(month) - 1]} ${year}`;
    }
  }
  
  lines.push('┌──────────────────────────────────────────────────────────────────────────────┐');
  lines.push('│  INFORMACIÓN ADICIONAL                                                       │');
  lines.push('├──────────────────────────────────────────────────────────────────────────────┤');
  lines.push('│  Período:              ' + padRight(periodText || 'N/A', 48) + ' │');
  lines.push('│  Estado:               ✓ PAGADO' + padRight('', 39) + ' │');
  lines.push('│  Fecha de Pago:        ' + padRight(formatDate(paymentDate), 48) + ' │');
  lines.push('└──────────────────────────────────────────────────────────────────────────────┘');
  lines.push('');
  
  // Notas
  lines.push('┌──────────────────────────────────────────────────────────────────────────────┐');
  lines.push('│  NOTAS                                                                       │');
  lines.push('├──────────────────────────────────────────────────────────────────────────────┤');
  lines.push('│  • Este recibo es válido como comprobante de pago                            │');
  lines.push('│  • Conserve este documento para cualquier aclaración                         │');
  lines.push('│  • Para dudas contacte a administración                                      │');
  lines.push('└──────────────────────────────────────────────────────────────────────────────┘');
  lines.push('');
  
  // Pie de página
  lines.push('────────────────────────────────────────────────────────────────────────────────');
  lines.push('');
  lines.push('                     ¡Gracias por su confianza!                     ');
  lines.push('');
  lines.push('────────────────────────────────────────────────────────────────────────────────');
  lines.push('');
  lines.push('  Firma: _____________________    Sello: [SELLO ESCUELA]');
  lines.push('');
  lines.push('────────────────────────────────────────────────────────────────────────────────');
  lines.push('  Documento generado electrónicamente');
  lines.push('  Folio Digital: ' + invoice.id);
  lines.push('  Fecha de Generación: ' + issuedDate.toLocaleString('es-DO'));
  lines.push('────────────────────────────────────────────────────────────────────────────────');
  
  return lines.join('\n');
}

Deno.serve(async (req) => {
  console.log('[generate-invoice] Received request:', req.method, req.url);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const RESEND_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
    const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'Colegio Montessori Sonrisas Creativas <avisos@montessorisonrisascreativas.com>';
    const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://montessorisonrisascreativas.com';

    if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: 'Missing env vars' }, 500);
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const resend = RESEND_KEY ? new Resend(RESEND_KEY) : null;

    const body = await req.json();
    console.log('[generate-invoice] Request body:', body);
    const { payment_id, send_email = true } = body;
    if (!payment_id) return json({ error: 'Missing payment_id' }, 400);

    // 1. Obtener datos del pago
    const { data: payment, error: errPayment } = await supabase
      .from('payments')
      .select(`
        id, student_id, amount, concept, method, bank, evidence_url, 
        month_paid, notes, created_at, paid_date,
        students!student_id (
          id, name, matricula, classroom_id, p1_name, p1_email, p1_phone,
          classrooms!classroom_id ( name )
        )
      `)
      .eq('id', payment_id)
      .single();

    console.log('[generate-invoice] Payment fetch result:', { data: !!payment, error: errPayment });
    if (errPayment || !payment) {
      console.error('[generate-invoice] Payment not found or error:', errPayment);
      return json({ error: 'Payment not found: ' + (errPayment?.message || 'Unknown') }, 404);
    }

    const student = (payment as any).students ?? {};
    const classroom = student?.classrooms ?? {};

    // 2. Obtener configuración del colegio
    const { data: school, error: errSchool } = await supabase
      .from('school_settings')
      .select('*')
      .eq('id', 1)
      .single();

    if (errSchool) {
      console.warn('Could not load school settings', errSchool);
    }

    // 3. Generar número de recibo
    const receiptNo = `REC-${new Date().getFullYear()}-${String(payment_id).slice(-6).toUpperCase().padStart(6,'0')}`;

    // 4. Crear factura en BD
    const invoiceData = {
      invoice_number: receiptNo,
      receipt_number: receiptNo,
      payment_id,
      student_id: student.id,
      student_name: student.name,
      student_matricula: student.matricula,
      classroom_name: classroom?.name,
      parent_name: student.p1_name,
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
      issued_date: new Date().toISOString()
    };
    
    const { data: invoice, error: errInvoice } = await supabase
      .from('invoices')
      .insert(invoiceData)
      .select('*')
      .single();

    if (errInvoice) {
      return json({ error: 'Failed to create invoice: ' + errInvoice.message }, 500);
    }

    // 4.1 Generar recibo ASCII profesional y actualizar la factura
    const professionalReceipt = generateProfessionalReceipt(school, receiptNo, payment, student, classroom, invoice);
    
    await supabase
      .from('invoices')
      .update({ ascii_receipt: professionalReceipt })
      .eq('id', invoice.id);

    // 5. Agregar items de factura
    await supabase.from('invoice_items').insert({
      invoice_id: invoice.id,
      concept: payment.concept,
      quantity: 1,
      unit_price: payment.amount,
      total: payment.amount
    });

    // 6. Usar la factura con nuestro recibo ASCII profesional
    const finalInvoice = { ...invoice, ascii_receipt: professionalReceipt };

    // 7. Enviar email si solicitado
    const recipientEmails = [student.p1_email, student.p2_email].filter(Boolean) as string[];
    if (send_email && resend && recipientEmails.length) {
      // Datos del colegio para el email
      const schoolName = school?.school_name || 'COLEGIO MONTESSORI SONRISAS CREATIVAS';
      const schoolEmailAddress = school?.email || 'contacto@montessorisonrisascreativas.com';
      const schoolPhoneNumber = school?.phone || '(123) 456-7890';
      const logoUrl = `${SITE_URL}/img/monte.jpg`;

      const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
      let periodText = payment.month_paid || '';
      if (periodText && periodText.includes('-')) {
        const [yr, mo] = periodText.split('-');
        periodText = `${monthNames[parseInt(mo)-1] || mo} ${yr}`;
      }

      // Parse RNC/empresa from notes if present
      let clientRNC = '';
      let clientCompany = '';
      const notes = payment.notes || '';
      if (notes.includes('RNC:')) {
        const rncMatch = notes.match(/RNC:([^|]+)/);
        if (rncMatch) clientRNC = rncMatch[1].trim();
      }
      if (notes.includes('Empresa:')) {
        const empMatch = notes.match(/Empresa:([^|]+)/);
        if (empMatch) clientCompany = empMatch[1].trim();
      }

      const issuedDate = new Date();
      const paymentDate = payment.paid_date ? new Date(payment.paid_date) : issuedDate;

      // Construir HTML del email profesional
      const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Recibo ${receiptNo} - ${student.name}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Arial,sans-serif;background:#f0f4f8;padding:20px}
  .wrap{max-width:700px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.12)}
  /* Header */
  .hdr{background:linear-gradient(135deg,#0B63C7,#0850A0);padding:32px 28px 24px;text-align:center;position:relative}
  .hdr-logo{width:72px;height:72px;border-radius:16px;overflow:hidden;margin:0 auto 12px;border:3px solid rgba(255,255,255,.4);background:white}
  .hdr-logo img{width:100%;height:100%;object-fit:cover}
  .hdr h1{color:white;font-size:22px;font-weight:900;letter-spacing:-.5px;margin-bottom:4px}
  .hdr p{color:rgba(255,255,255,.85);font-size:13px;font-weight:600}
  .hdr .rec-badge{margin-top:16px;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.3);border-radius:10px;padding:8px 20px;display:inline-block}
  .hdr .rec-badge span{color:white;font-family:monospace;font-size:15px;font-weight:900;letter-spacing:2px}
  /* Status bar */
  .status-bar{background:#e6f4ea;border-bottom:2px solid #bbf7d0;padding:14px 28px;display:flex;align-items:center;gap:12px}
  .status-dot{width:40px;height:40px;background:linear-gradient(135deg,#28B54D,#1A8035);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0}
  .status-text h3{color:#166534;font-size:15px;font-weight:900;margin-bottom:3px}
  .status-text p{color:#15803d;font-size:12px;font-weight:600}
  /* Content */
  .content{padding:28px}
  /* Section cards */
  .section-card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:18px;margin-bottom:16px}
  .section-card h4{font-size:11px;font-weight:900;color:#0B63C7;text-transform:uppercase;letter-spacing:.8px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #e2e8f0}
  .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .info-item label{display:block;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px}
  .info-item span{display:block;font-size:13px;font-weight:700;color:#1e293b}
  /* Items table */
  .items-table{width:100%;border-collapse:collapse;margin-top:8px}
  .items-table thead tr{background:#0B63C7}
  .items-table thead th{color:white;font-size:11px;font-weight:800;text-transform:uppercase;padding:10px 12px;text-align:left}
  .items-table tbody tr:nth-child(even){background:#f8fafc}
  .items-table tbody td{padding:10px 12px;font-size:13px;color:#374151;border-bottom:1px solid #f1f5f9}
  .items-table tfoot tr{background:#e8f2ff}
  .items-table tfoot td{padding:12px;font-weight:900;font-size:15px;color:#0B63C7}
  /* Footer */
  .footer{background:#1e293b;padding:18px 28px;text-align:center}
  .footer p{color:rgba(255,255,255,.6);font-size:11px;margin-bottom:4px}
  .footer .watermark{color:rgba(255,255,255,.3);font-size:10px;letter-spacing:1px;text-transform:uppercase;margin-top:6px}
  /* CTA button */
  .cta{text-align:center;margin:20px 0}
  .cta a{display:inline-block;background:linear-gradient(135deg,#0B63C7,#0850A0);color:white;padding:14px 32px;border-radius:10px;font-weight:800;font-size:14px;text-decoration:none}
  @media(max-width:500px){.info-grid{grid-template-columns:1fr}}
</style></head>
<body>
<div class="wrap">
  <!-- Header -->
  <div class="hdr">
    <div class="hdr-logo"><img src="${logoUrl}" alt="${schoolName}" onerror="this.style.display='none'"></div>
    <h1>${schoolName}</h1>
    <p>Centro Educativo Montessori · ${school?.address || schoolPhoneNumber}</p>
    ${school?.rnc ? `<p style="color:rgba(255,255,255,.7);font-size:11px;margin-top:4px">RNC: ${school.rnc}</p>` : ''}
    <div class="rec-badge"><span>${receiptNo}</span></div>
  </div>

  <!-- Status -->
  <div class="status-bar">
    <div class="status-dot">✓</div>
    <div class="status-text">
      <h3>Pago Confirmado y Aprobado</h3>
      <p>Fecha: ${paymentDate.toLocaleDateString('es-DO',{day:'numeric',month:'long',year:'numeric'})} · ${paymentDate.toLocaleTimeString('es-DO',{hour:'2-digit',minute:'2-digit'})}</p>
    </div>
  </div>

  <div class="content">
    <!-- Datos del colegio -->
    <div class="section-card">
      <h4>Datos del Emisor</h4>
      <div class="info-grid">
        <div class="info-item"><label>Nombre</label><span>${schoolName}</span></div>
        <div class="info-item"><label>Direccion</label><span>${school?.address || '—'}</span></div>
        <div class="info-item"><label>Telefono</label><span>${schoolPhoneNumber}</span></div>
        <div class="info-item"><label>Email</label><span>${schoolEmailAddress}</span></div>
        ${school?.rnc ? `<div class="info-item"><label>RNC</label><span>${school.rnc}</span></div>` : ''}
      </div>
    </div>

    <!-- Datos del cliente -->
    <div class="section-card">
      <h4>Datos del Cliente / Beneficiario</h4>
      <div class="info-grid">
        <div class="info-item"><label>Estudiante</label><span>${student.name || '—'}</span></div>
        <div class="info-item"><label>Matricula</label><span>${(student.matricula||'').startsWith('MSC-') ? student.matricula : 'MSC-'+(student.matricula||'—')}</span></div>
        <div class="info-item"><label>Aula</label><span>${classroom?.name || '—'}</span></div>
        <div class="info-item"><label>Padre / Tutor</label><span>${student.p1_name || '—'}</span></div>
        <div class="info-item"><label>Telefono</label><span>${student.p1_phone || '—'}</span></div>
        ${clientRNC ? `<div class="info-item"><label>RNC Empresa</label><span>${clientRNC}</span></div>` : ''}
        ${clientCompany ? `<div class="info-item"><label>Empresa</label><span>${clientCompany}</span></div>` : ''}
      </div>
    </div>

    <!-- Detalles del pago -->
    <div class="section-card">
      <h4>Detalle del Pago</h4>
      <table class="items-table">
        <thead><tr>
          <th>Descripcion</th>
          <th>Periodo</th>
          <th style="text-align:right">Importe</th>
        </tr></thead>
        <tbody>
          <tr>
            <td>${payment.concept || 'Mensualidad'}</td>
            <td>${periodText || '—'}</td>
            <td style="text-align:right;font-weight:800">${formatCurrency(payment.amount)}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td colspan="2" style="text-align:right;font-size:13px">TOTAL PAGADO:</td>
            <td style="text-align:right">${formatCurrency(payment.amount)}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- Informacion del pago -->
    <div class="section-card">
      <h4>Informacion del Pago</h4>
      <div class="info-grid">
        <div class="info-item"><label>Metodo</label><span style="text-transform:capitalize">${payment.method || '—'}</span></div>
        <div class="info-item"><label>Banco</label><span>${payment.bank || '—'}</span></div>
        ${payment.reference ? `<div class="info-item"><label>Referencia</label><span>${payment.reference}</span></div>` : ''}
        <div class="info-item"><label>Estado</label><span style="color:#16a34a;font-weight:900">PAGADO ✓</span></div>
        <div class="info-item"><label>No. Recibo</label><span style="font-family:monospace">${receiptNo}</span></div>
        <div class="info-item"><label>Fecha Emision</label><span>${issuedDate.toLocaleDateString('es-DO',{day:'numeric',month:'long',year:'numeric'})}</span></div>
      </div>
    </div>

    <!-- CTA -->
    <div class="cta">
      <a href="${SITE_URL}/panel_padres.html">Ver mi Portal Familiar →</a>
    </div>

    <!-- Nota legal -->
    <p style="font-size:11px;color:#94a3b8;text-align:center;margin-top:8px;line-height:1.6">
      Este recibo es valido como comprobante oficial de pago.<br>
      Conserve este documento para sus registros. Para consultas: ${schoolPhoneNumber} | ${schoolEmailAddress}
    </p>
  </div>

  <!-- Footer -->
  <div class="footer">
    <p>Este correo fue generado automaticamente. Por favor no respondas a esta direccion.</p>
    <p>Para soporte: ${schoolEmailAddress} · ${schoolPhoneNumber}</p>
    <p class="watermark">${schoolName} · ${receiptNo} · ${issuedDate.getFullYear()}</p>
  </div>
</div>
</body></html>`;

      try {
        await resend.emails.send({
          from: FROM_EMAIL,
          to: recipientEmails,
          subject: `Recibo de Pago ${receiptNo} - ${student.name} · ${periodText || payment.concept}`,
          html
        });
        console.log('[generate-invoice] Email sent to', recipientEmails.join(','));
      } catch (emailErr) {
        console.warn('[generate-invoice] Email failed:', emailErr);
      }
    }

    return json({
      success: true,
      invoice: finalInvoice,
      receipt_number: receiptNo,
      ascii_receipt: finalInvoice?.ascii_receipt
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[generate-invoice] fatal:', msg);
    return json({ error: msg }, 500);
  }
});
