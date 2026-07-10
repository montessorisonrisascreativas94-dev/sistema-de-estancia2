
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
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
  const issuedDate = new Date(invoice.issued_at);
  const paymentDate = new Date(payment.paid_date || payment.created_at);
  
  // Datos del colegio (usar school_settings si están disponibles)
  const schoolName = school?.school_name || 'COLEGIO MONTESSORI SONRISAS CREATIVAS';
  const schoolAddress = school?.address || 'Calle Principal #123, Col. Centro';
  const schoolCity = [school?.city, school?.state, school?.zip_code].filter(Boolean).join(', ') || 'Ciudad, Estado, C.P. 12345';
  const schoolPhone = school?.phone ? `Tel: ${school.phone}` : 'Tel: (123) 456-7890';
  const schoolEmail = school?.email ? `Email: ${school.email}` : 'Email: contacto@karpuskids.com';
  const schoolRfc = school?.rnc ? `RNC: ${school.rnc}` : 'RNC: KKI123456ABC';

  const lines: string[] = [];
  
  // Encabezado del colegio
  lines.push('╔══════════════════════════════════════════════════════════════════════════════╗');
  lines.push('║                                                                              ║');
  lines.push('║                         🏫 ' + padRight(schoolName.toUpperCase(), 48) + ' ║');
  lines.push('║                           ESTANCIA INFANTIL                                  ║');
  lines.push('║                                                                              ║');
  lines.push('║    ' + padRight(schoolAddress, 68) + ' ║');
  lines.push('║    ' + padRight(schoolCity, 68) + ' ║');
  lines.push('║    ' + padRight(schoolPhone, 68) + ' ║');
  lines.push('║    ' + padRight(schoolEmail, 68) + ' ║');
  lines.push('║    ' + padRight(schoolRfc, 68) + ' ║');
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
  lines.push('│  Fecha de Emisión:    ' + padRight(formatDate(issuedDate), 48) + ' │');
  lines.push('│  Hora:                ' + padRight(formatTime(issuedDate) + ' hrs', 48) + ' │');
  lines.push('│  Método de Pago:      ' + padRight(payment.method || 'Efectivo', 48) + ' │');
  lines.push('│  Referencia:          ' + padRight(invoice.payment_reference || 'N/A', 48) + ' │');
  lines.push('│  Atendió:             ' + padRight(invoice.attended_by || 'Sistema', 48) + ' │');
  lines.push('└──────────────────────────────────────────────────────────────────────────────┘');
  lines.push('');
  
  // Datos del cliente y estudiante
  lines.push('┌──────────────────────────────────────────────────────────────────────────────┐');
  lines.push('│  DATOS DEL CLIENTE                                                           │');
  lines.push('├──────────────────────────────────────────────────────────────────────────────┤');
  lines.push('│  Nombre:              ' + padRight(student.p1_name || 'N/A', 48) + ' │');
  lines.push('│  Email:               ' + padRight(student.p1_email || 'N/A', 48) + ' │');
  lines.push('│  Teléfono:            ' + padRight(student.p1_phone || 'N/A', 48) + ' │');
  lines.push('│                                                                              │');
  lines.push('│  ESTUDIANTE                                                                  │');
  lines.push('│  Nombre:              ' + padRight(student.name || 'N/A', 48) + ' │');
  lines.push('│  Matrícula:           ' + padRight(student.matricula || 'N/A', 48) + ' │');
  lines.push('│  Aula:                ' + padRight(classroom?.name || 'N/A', 48) + ' │');
  lines.push('└──────────────────────────────────────────────────────────────────────────────┘');
  lines.push('');
  
  // Detalle del pago
  lines.push('┌──────────────────────────────────────────────────────────────────────────────┐');
  lines.push('│  DETALLE DEL PAGO                                                            │');
  lines.push('├──────────────────────────────────────────────────────────────────────────────┤');
  lines.push('│                                                                              │');
  lines.push('│  Concepto                          Cantidad       Importe                    │');
  lines.push('│  ──────────────────────────────────────────────────────────────────────────  │');
  
  // Item del pago
  const concept = payment.concept || 'Pago';
  const quantity = 1;
  const unitPrice = payment.amount;
  const total = payment.amount;
  
  lines.push('│  ' + padRight(concept, 32) + '  ' + padLeft(String(quantity), 6) + '  ' + padLeft(formatCurrency(total), 16) + '  │');
  lines.push('│                                                                              │');
  lines.push('│  ──────────────────────────────────────────────────────────────────────────  │');
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
  lines.push('│  Período:             ' + padRight(periodText || 'N/A', 48) + ' │');
  lines.push('│  Estado:              ✅ PAGADO' + padRight('', 39) + ' │');
  lines.push('│  Fecha de Pago:       ' + padRight(formatDate(paymentDate), 48) + ' │');
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

Deno.serve(async (req) =&gt; {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')              ?? '';
    const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const RESEND_KEY   = Deno.env.get('RESEND_API_KEY')            ?? '';
    const FROM_EMAIL   = Deno.env.get('FROM_EMAIL')                ?? 'Karpus Kids &lt;avisos@karpuskids.com&gt;';

    if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: 'Missing env vars' }, 500);
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const resend = RESEND_KEY ? new Resend(RESEND_KEY) : null;

    const body = await req.json();
    const { payment_id, send_email = true } = body;

    if (!payment_id) return json({ error: 'Missing payment_id' }, 400);

    // 1. Obtener datos del pago
    const { data: payment, error: errPayment } = await supabase
      .from('payments')
      .select(`
        id, student_id, amount, concept, method, bank, evidence_url, 
        fiscal_receipt_url, month_paid, notes, created_at, paid_date,
        students!student_id (
          id, name, matricula, classroom_id, p1_name, p1_email, p1_phone,
          classrooms!classroom_id ( name )
        )
      `)
      .eq('id', payment_id)
      .single();

    if (errPayment || !payment) {
      return json({ error: 'Payment not found: ' + (errPayment?.message || 'Unknown') }, 404);
    }

    const student = payment.students as any;
    const classroom = student?.classrooms as any;

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
    const { data: receiptNumData, error: errReceipt } = await supabase
      .rpc('generate_receipt_number');
    const receiptNumber = receiptNumData || `REC-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;

    // 4. Crear factura en BD
    const invoiceData = {
      invoice_number: receiptNumber,
      receipt_number: receiptNumber,
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
      issued_at: new Date().toISOString(),
      fiscal_receipt_url: payment.fiscal_receipt_url
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
    const professionalReceipt = generateProfessionalReceipt(school, receiptNumber, payment, student, classroom, invoice);
    
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
    if (send_email &amp;&amp; resend &amp;&amp; student.p1_email) {
      // Datos del colegio para el email
      const schoolName = school?.school_name || 'COLEGIO MONTESSORI SONRISAS CREATIVAS';
      const schoolEmailAddress = school?.email || 'contacto@karpuskids.com';
      const schoolPhoneNumber = school?.phone || '(123) 456-7890';
      
      // Construir HTML del email profesional
      const html = `
        &lt;!DOCTYPE html&gt;
        &lt;html lang="es"&gt;
        &lt;head&gt;
          &lt;meta charset="UTF-8"&gt;
          &lt;meta name="viewport" content="width=device-width, initial-scale=1.0"&gt;
          &lt;title&gt;Recibo de Pago - ${student.name}&lt;/title&gt;
        &lt;/head&gt;
        &lt;body style="margin:0;padding:0;background:#f5f7fa;font-family:'Arial',sans-serif;"&gt;
          &lt;div style="max-width:800px;margin:0 auto;background:#ffffff;"&gt;
            
            &lt;!-- Encabezado del colegio --&gt;
            &lt;div style="background:linear-gradient(135deg,#16a34a 0%,#22c55e 100%);padding:40px 30px;text-align:center;"&gt;
              &lt;div style="font-size:48px;margin-bottom:10px;"&gt;🏫&lt;/div&gt;
              &lt;h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:800;letter-spacing:-0.5px;"&gt;${schoolName}&lt;/h1&gt;
              &lt;p style="margin:10px 0 0;color:rgba(255,255,255,0.95);font-size:16px;font-weight:500;"&gt;ESTANCIA INFANTIL&lt;/p&gt;
            &lt;/div&gt;

            &lt;div style="padding:40px 30px;"&gt;
              
              &lt;!-- Saludo inicial --&gt;
              &lt;div style="margin-bottom:30px;"&gt;
                &lt;p style="margin:0;color:#374151;font-size:18px;line-height:1.6;"&gt;
                  Estimado(a) &lt;strong&gt;${student.p1_name || 'Padre/Madre de Familia'}&lt;/strong&gt;,
                &lt;/p&gt;
                &lt;p style="margin:10px 0 0;color:#6b7280;font-size:16px;line-height:1.6;"&gt;
                  Agradecemos su pago! A continuación, encontrará su recibo oficial de pago por concepto de &lt;strong&gt;${payment.concept || 'Servicios Educativos'}&lt;/strong&gt;.
                &lt;/p&gt;
              &lt;/div&gt;

              &lt;!-- Resumen rápido --&gt;
              &lt;div style="background:#f0fdf4;border:2px solid #bbf7d0;border-radius:12px;padding:24px;margin-bottom:30px;"&gt;
                &lt;div style="display:flex;flex-wrap:wrap;gap:20px;"&gt;
                  &lt;div style="flex:1;min-width:200px;"&gt;
                    &lt;p style="margin:0;color:#166534;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;"&gt;Recibo&lt;/p&gt;
                    &lt;p style="margin:5px 0 0;color:#374151;font-size:20px;font-weight:800;"&gt;${receiptNumber}&lt;/p&gt;
                  &lt;/div&gt;
                  &lt;div style="flex:1;min-width:200px;"&gt;
                    &lt;p style="margin:0;color:#166534;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;"&gt;Estudiante&lt;/p&gt;
                    &lt;p style="margin:5px 0 0;color:#374151;font-size:18px;font-weight:700;"&gt;${student.name}&lt;/p&gt;
                  &lt;/div&gt;
                  &lt;div style="flex:1;min-width:150px;"&gt;
                    &lt;p style="margin:0;color:#166534;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;"&gt;Monto&lt;/p&gt;
                    &lt;p style="margin:5px 0 0;color:#16a34a;font-size:28px;font-weight:900;"&gt;${formatCurrency(payment.amount)}&lt;/p&gt;
                  &lt;/div&gt;
                &lt;/div&gt;
              &lt;/div&gt;

              &lt;!-- Recibo ASCII profesional --&gt;
              &lt;div style="background:#1f2937;border-radius:12px;padding:20px;margin-bottom:30px;overflow-x:auto;"&gt;
                &lt;p style="margin:0 0 15px;color:#9ca3af;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;"&gt;📄 Recibo Oficial&lt;/p&gt;
                &lt;pre style="margin:0;padding:0;color:#e5e7eb;font-size:11px;line-height:1.4;font-family:'Courier New',Courier,monospace;white-space:pre;"&gt;${professionalReceipt}&lt;/pre&gt;
              &lt;/div&gt;

              &lt;!-- Información adicional --&gt;
              &lt;div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:24px;margin-bottom:30px;"&gt;
                &lt;h3 style="margin:0 0 15px;color:#374151;font-size:16px;font-weight:800;"&gt;📋 Información Importante&lt;/h3&gt;
                &lt;ul style="margin:0;padding-left:20px;color:#6b7280;font-size:14px;line-height:1.8;"&gt;
                  &lt;li&gt;Este recibo es válido como comprobante oficial de pago&lt;/li&gt;
                  &lt;li&gt;Conserve este documento para sus registros contables&lt;/li&gt;
                  &lt;li&gt;Para cualquier aclaración, contáctenos en ${schoolEmailAddress} o ${schoolPhoneNumber}&lt;/li&gt;
                &lt;/ul&gt;
              &lt;/div&gt;

              &lt;!-- Pie de página --&gt;
              &lt;div style="text-align:center;padding-top:20px;border-top:1px solid #e5e7eb;"&gt;
                &lt;p style="margin:0;color:#9ca3af;font-size:13px;line-height:1.6;"&gt;
                  &lt;strong&gt;¡Gracias por su confianza en ${schoolName}!&lt;/strong&gt;&lt;br&gt;
                  Este correo fue generado automáticamente. Por favor no responda a esta dirección.
                &lt;/p&gt;
              &lt;/div&gt;

            &lt;/div&gt;

          &lt;/div&gt;
        &lt;/body&gt;
        &lt;/html&gt;
      `;

      try {
        await resend.emails.send({
          from: FROM_EMAIL,
          to: student.p1_email,
          subject: `📄 Recibo de Pago - ${student.name} · ${receiptNumber}`,
          html
        });
      } catch (emailErr) {
        console.warn('Failed to send email:', emailErr);
      }

      // 8. Enviar push notification al padre
      if (student.parent_id) {
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SERVICE_KEY}`,
              'apikey': SERVICE_KEY
            },
            body: JSON.stringify({
              user_id: student.parent_id,
              title: `✅ Pago Registrado - ${student.name}`,
              message: `Tu pago de ${formatCurrency(payment.amount)} ha sido registrado y el recibo fue enviado a tu email.`,
              type: 'payment',
              link: 'panel_padres.html'
            })
          });
        } catch (pushErr) {
          console.warn('Failed to send push:', pushErr);
        }
      }
    }

    return json({
      success: true,
      invoice: finalInvoice,
      receipt_number: receiptNumber,
      ascii_receipt: finalInvoice?.ascii_receipt
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[generate-invoice] fatal:', msg);
    return json({ error: msg }, 500);
  }
});
