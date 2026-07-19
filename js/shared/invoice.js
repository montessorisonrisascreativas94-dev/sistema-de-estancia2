/**
 * InvoiceModule v3 — Sistema de Facturación Profesional ERP
 * Genera facturas PDF de nivel empresarial (Stripe/SAP/QuickBooks)
 *
 * Funciones principales:
 *   - renderInvoiceHTML(data)        → HTML profesional completo
 *   - generatePDF(data)              → Blob PDF via html2pdf.js
 *   - uploadPDF(pdfBlob, invoiceId)  → Sube a Storage, retorna URL
 *   - sendInvoiceEmail(data, pdf)    → Envía email con PDF adjunto
 *   - openInvoiceModal(data)         → Modal completo con acciones
 *   - openSuccessModal(data)         → Modal de éxito post-cobro
 *   - validateInvoice(uuid)          → Valida factura por UUID
 */

import { supabase } from './supabase.js';
import { Helpers } from './helpers.js';

export const InvoiceModule = {

  SCHOOL:   'Colegio Montessori Sonrisas Creativas',
  CURRENCY: 'RD$',
  BLUE:     '#0B63C7',
  GREEN:    '#28B54D',
  DARK:     '#1a2340',

  STATUS_LABEL: { paid:'PAGADO', pending:'PENDIENTE', review:'EN REVISIÓN', overdue:'VENCIDO', rejected:'RECHAZADO', cancelled:'ANULADA', issued:'EMITIDA' },
  STATUS_COLOR: { paid:'#28B54D', pending:'#F59E0B', review:'#3B82F6', overdue:'#EF4444', rejected:'#6B7280', cancelled:'#EF4444', issued:'#F59E0B' },

  // ════════════════════════════════════════════════════════════════
  // 1. RENDERIZAR HTML PROFESIONAL DE LA FACTURA
  // ════════════════════════════════════════════════════════════════

  renderInvoiceHTML(data) {
    const inv = data.invoice || data;
    const stu = data.student || {};
    const sch = data.school || {};
    const pay = data.payment || {};

    const receiptNo  = inv.invoice_number || inv.receipt_number || 'N/A';
    const status     = inv.status || 'paid';
    const stColor    = this.STATUS_COLOR[status] || '#28B54D';
    const stLabel    = this.STATUS_LABEL[status] || 'PAGADO';
    const amount     = Number(inv.amount || pay.amount || 0);
    const subtotal   = Number(inv.subtotal || amount);
    const taxAmount  = Number(inv.tax_amount || 0);
    const total      = Number(inv.total || amount);
    const discount   = Number(inv.discount_amount || 0);
    const issuedDate = inv.issued_date ? new Date(inv.issued_date) : new Date();
    const payDate    = inv.payment_date || pay.paid_date ? new Date(inv.payment_date || pay.paid_date) : issuedDate;
    const period     = inv.period || pay.month_paid || '';
    const uuidFolio  = inv.uuid_folio || inv.digital_folio || '';
    const hash       = inv.sha256_hash || '';
    const validationUrl = inv.validation_url || '';

    const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    let periodText = '';
    if (period && period.includes('-')) {
      const [y, m] = period.split('-');
      periodText = `${monthNames[parseInt(m)-1] || m} ${y}`;
    } else { periodText = period || '—'; }

    const fmtCurrency = (n) => `${this.CURRENCY} ${Number(n||0).toLocaleString('es-DO', {minimumFractionDigits:2, maximumFractionDigits:2})}`;
    const fmtDate = (d) => d ? d.toLocaleDateString('es-DO', {day:'numeric',month:'long',year:'numeric'}) : '—';
    const fmtTime = (d) => d ? d.toLocaleTimeString('es-DO', {hour:'2-digit',minute:'2-digit'}) : '';

    const logoUrl = sch.logo_url || `${sch.website || 'https://montessorisonrisascreativas.com'}/img/monte.jpg`;
    const studentPhoto = stu.photo_url || '';
    const age = stu.date_of_birth ? Math.floor((Date.now() - new Date(stu.date_of_birth).getTime()) / (365.25*24*60*60*1000)) : '';

    return `<!DOCTYPE html><html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Factura ${receiptNo}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;background:#f1f5f9;color:#1a2340;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{background:#fff;max-width:800px;margin:24px auto;border-radius:16px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,.1)}

/* HEADER */
.inv-hd{background:linear-gradient(135deg,#0B63C7 0%,#0850A0 50%,#063D7A 100%);padding:32px 36px 24px;display:flex;justify-content:space-between;align-items:flex-start;gap:20px;position:relative;overflow:hidden}
.inv-hd::before{content:'';position:absolute;top:-50%;right:-20%;width:300px;height:300px;background:radial-gradient(circle,rgba(255,255,255,.08) 0%,transparent 70%);border-radius:50%}
.inv-hd-left{flex:1;position:relative;z-index:1}
.inv-hd-logo{width:64px;height:64px;border-radius:14px;overflow:hidden;margin-bottom:12px;border:2px solid rgba(255,255,255,.3);background:white;box-shadow:0 4px 12px rgba(0,0,0,.15)}
.inv-hd-logo img{width:100%;height:100%;object-fit:cover}
.inv-hd-name{font-size:20px;font-weight:900;color:white;letter-spacing:-.3px;line-height:1.2}
.inv-hd-sub{font-size:11px;color:rgba(255,255,255,.75);font-weight:600;margin-top:2px}
.inv-hd-info{font-size:11px;color:rgba(255,255,255,.65);margin-top:8px;line-height:1.7}
.inv-hd-right{text-align:right;position:relative;z-index:1;flex-shrink:0}
.inv-hd-badge{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);border-radius:14px;padding:16px 22px;backdrop-filter:blur(8px)}
.inv-hd-label{font-size:10px;color:rgba(255,255,255,.7);font-weight:800;text-transform:uppercase;letter-spacing:.1em}
.inv-hd-number{font-size:24px;font-weight:900;color:white;margin-top:2px;font-variant-numeric:tabular-nums}
.inv-hd-date{font-size:11px;color:rgba(255,255,255,.7);margin-top:4px}

/* STATUS BAR */
.inv-status{display:flex;align-items:center;gap:10px;padding:14px 36px;background:${status==='paid'?'linear-gradient(90deg,#f0fdf4,#ecfdf5)':'#fffbeb'};border-bottom:2px solid ${status==='paid'?'#bbf7d0':'#fde68a'}"}
.inv-status-dot{width:36px;height:36px;border-radius:50%;background:${stColor};display:flex;align-items:center;justify-content:center;color:white;font-size:16px;flex-shrink:0;box-shadow:0 2px 8px ${stColor}44}
.inv-status-text h3{font-size:14px;font-weight:800;color:${stColor}}
.inv-status-text p{font-size:11px;color:#64748b;font-weight:600}

/* SECTIONS */
.inv-body{padding:28px 36px}
.inv-section{margin-bottom:24px}
.inv-section-title{font-size:10px;font-weight:900;color:#0B63C7;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;display:flex;align-items:center;gap:8px}
.inv-section-title::after{content:'';flex:1;height:1px;background:linear-gradient(90deg,#e2e8f0,transparent)}

/* INFO CARDS */
.inv-info-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.inv-card{background:#f8fafc;border:1px solid #e9ecef;border-radius:12px;padding:16px 20px}
.inv-card-header{display:flex;align-items:center;gap:10px;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid #e9ecef}
.inv-card-icon{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.inv-card-title{font-size:11px;font-weight:900;color:#64748b;text-transform:uppercase;letter-spacing:.5px}
.inv-card-row{display:flex;justify-content:space-between;padding:5px 0;font-size:12px;border-bottom:1px solid #f1f5f9}
.inv-card-row:last-child{border:none}
.inv-card-label{color:#94a3b8;font-weight:600}
.inv-card-value{color:#1a2340;font-weight:700;text-align:right}

/* TABLE */
.inv-table-wrap{border:1px solid #e9ecef;border-radius:12px;overflow:hidden}
.inv-table{width:100%;border-collapse:collapse}
.inv-table thead tr{background:linear-gradient(135deg,#0B63C7,#0850A0)}
.inv-table thead th{padding:14px 16px;font-size:10px;font-weight:900;color:white;text-transform:uppercase;letter-spacing:.08em;text-align:left}
.inv-table thead th:last-child,.inv-table thead th:nth-child(n+3){text-align:right}
.inv-table tbody tr{border-bottom:1px solid #f1f5f9;transition:background .15s}
.inv-table tbody tr:nth-child(even){background:#fafbfc}
.inv-table tbody td{padding:14px 16px;font-size:13px;color:#1a2340}
.inv-table tbody td:last-child,.inv-table tbody td:nth-child(n+3){text-align:right;font-weight:700}
.inv-table tbody td:first-child{font-weight:700}

/* TOTALS */
.inv-totals-wrap{display:flex;justify-content:flex-end;margin-top:4px}
.inv-totals{background:#f8fafc;border:1px solid #e9ecef;border-radius:12px;padding:20px 24px;min-width:300px}
.inv-total-row{display:flex;justify-content:space-between;padding:8px 0;font-size:13px}
.inv-total-row span:first-child{color:#64748b;font-weight:600}
.inv-total-row span:last-child{color:#1a2340;font-weight:700}
.inv-total-divider{border:none;border-top:1px solid #e2e8f0;margin:8px 0}
.inv-total-final{display:flex;justify-content:space-between;padding:12px 0;border-top:3px solid #28B54D;margin-top:8px}
.inv-total-final span:first-child{font-size:16px;font-weight:900;color:#28B54D;text-transform:uppercase;letter-spacing:.5px}
.inv-total-final span:last-child{font-size:28px;font-weight:900;color:#28B54D;font-variant-numeric:tabular-nums}

/* PAYMENT METHOD CARD */
.inv-payment-card{background:linear-gradient(135deg,#f8fafc,#f1f5f9);border:1px solid #e2e8f0;border-radius:14px;padding:20px 24px}
.inv-payment-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:12px}
.inv-payment-item{text-align:center;padding:10px;background:white;border-radius:10px;border:1px solid #f1f5f9}
.inv-payment-item-label{font-size:9px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}
.inv-payment-item-value{font-size:13px;font-weight:800;color:#1a2340}

/* ADDITIONAL INFO */
.inv-additional-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.inv-additional-item{padding:12px;background:#f8fafc;border-radius:10px;border:1px solid #e9ecef;text-align:center}
.inv-additional-item-label{font-size:9px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px}
.inv-additional-item-value{font-size:13px;font-weight:800;color:#1a2340;margin-top:4px}

/* FOOTER */
.inv-footer{background:linear-gradient(135deg,#1a2340,#0f172a);padding:28px 36px;color:white}
.inv-footer-top{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;margin-bottom:20px}
.inv-footer-message{font-size:13px;color:rgba(255,255,255,.85);font-weight:600;line-height:1.6}
.inv-footer-policies{font-size:10px;color:rgba(255,255,255,.5);line-height:1.7;margin-top:8px}
.inv-footer-badge{display:flex;align-items:center;gap:12px;padding:14px 18px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);border-radius:12px;flex-shrink:0}
.inv-footer-badge-text{font-size:10px;color:rgba(255,255,255,.7);font-weight:700;text-transform:uppercase;letter-spacing:.5px}
.inv-footer-badge-status{font-size:18px;font-weight:900;color:#28B54D;margin-top:2px}
.inv-footer-divider{border:none;border-top:1px solid rgba(255,255,255,.1);margin:16px 0}
.inv-footer-meta{display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px}
.inv-footer-meta-item{font-size:10px;color:rgba(255,255,255,.45);font-weight:600}
.inv-footer-meta-item strong{color:rgba(255,255,255,.65)}
.inv-footer-barcode{text-align:center;margin-top:16px;padding:12px;background:rgba(255,255,255,.05);border-radius:10px}
.inv-footer-barcode canvas,.inv-footer-barcode svg{max-width:200px}
.inv-footer-qr{display:flex;align-items:center;gap:16px;margin-top:12px;padding:12px;background:rgba(255,255,255,.06);border-radius:10px}
.inv-footer-qr canvas{border-radius:8px;background:white;padding:4px}
.inv-footer-qr-text{font-size:10px;color:rgba(255,255,255,.6);line-height:1.6}

/* STAMP */
.inv-stamp{text-align:center;margin-top:20px;padding-top:16px;border-top:1px dashed rgba(255,255,255,.15)}
.inv-stamp-text{font-size:9px;color:rgba(255,255,255,.35);text-transform:uppercase;letter-spacing:1px}

@media print{
  body{background:#fff}
  .page{box-shadow:none;margin:0;border-radius:0;max-width:100%}
  .no-print{display:none!important}
  @page{margin:8mm;size:letter}
}
@media(max-width:640px){
  .inv-info-grid{grid-template-columns:1fr}
  .inv-hd{flex-direction:column}
  .inv-hd-right{align-self:flex-start}
  .inv-body{padding:20px}
  .inv-footer{padding:20px}
  .inv-payment-grid{grid-template-columns:1fr 1fr}
  .inv-additional-grid{grid-template-columns:1fr 1fr}
}
</style></head><body>
<div class="page">

  <!-- HEADER -->
  <div class="inv-hd">
    <div class="inv-hd-left">
      <div class="inv-hd-logo"><img src="${logoUrl}" alt="${sch.school_name || this.SCHOOL}" onerror="this.parentElement.innerHTML='<div style=\\'width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:24px;background:#eff6ff\\'>🏫</div>'"></div>
      <div class="inv-hd-name">${sch.school_name || this.SCHOOL}</div>
      <div class="inv-hd-sub">Centro Educativo Montessori</div>
      <div class="inv-hd-info">
        ${sch.address ? `${sch.address}<br>` : ''}
        ${sch.phone ? `Tel: ${sch.phone}` : ''}${sch.phone && sch.email ? ' · ' : ''}${sch.email ? `Email: ${sch.email}` : ''}<br>
        ${sch.rnc ? `RNC: ${sch.rnc}` : ''}${sch.rnc && sch.website ? ' · ' : ''}${sch.website ? `${sch.website}` : ''}
      </div>
    </div>
    <div class="inv-hd-right">
      <div class="inv-hd-badge">
        <div class="inv-hd-label">Factura N°</div>
        <div class="inv-hd-number">${receiptNo}</div>
        <div class="inv-hd-date">Emitida: ${fmtDate(issuedDate)}</div>
      </div>
    </div>
  </div>

  <!-- STATUS -->
  <div class="inv-status">
    <div class="inv-status-dot">${status==='paid'?'✓':'!'}</div>
    <div class="inv-status-text">
      <h3>Pago Confirmado y Aprobado</h3>
      <p>${fmtDate(payDate)} ${fmtTime(payDate) ? '· ' + fmtTime(payDate) : ''}</p>
    </div>
  </div>

  <div class="inv-body">

    <!-- CLIENT & STUDENT INFO -->
    <div class="inv-section">
      <div class="inv-section-title">Información del Cliente</div>
      <div class="inv-info-grid">
        <div class="inv-card">
          <div class="inv-card-header">
            <div class="inv-card-icon" style="background:linear-gradient(135deg,#eff6ff,#dbeafe);color:#0B63C7">👤</div>
            <div class="inv-card-title">Padre / Tutor</div>
          </div>
          <div class="inv-card-row"><span class="inv-card-label">Nombre</span><span class="inv-card-value">${stu.p1_name || '—'}</span></div>
          <div class="inv-card-row"><span class="inv-card-label">Email</span><span class="inv-card-value">${stu.p1_email || '—'}</span></div>
          <div class="inv-card-row"><span class="inv-card-label">Teléfono</span><span class="inv-card-value">${stu.p1_phone || '—'}</span></div>
          ${inv.fiscal_parent_rnc ? `<div class="inv-card-row"><span class="inv-card-label">RNC</span><span class="inv-card-value">${inv.fiscal_parent_rnc}</span></div>` : ''}
          ${inv.fiscal_parent_company_name ? `<div class="inv-card-row"><span class="inv-card-label">Empresa</span><span class="inv-card-value">${inv.fiscal_parent_company_name}</span></div>` : ''}
        </div>
        <div class="inv-card">
          <div class="inv-card-header">
            <div class="inv-card-icon" style="background:linear-gradient(135deg,#f0fdf4,#dcfce7);color:#28B54D">🎓</div>
            <div class="inv-card-title">Estudiante</div>
          </div>
          ${studentPhoto ? `<div style="text-align:center;margin-bottom:10px"><img src="${studentPhoto}" style="width:48px;height:48px;border-radius:50%;object-fit:cover;border:2px solid #e2e8f0" onerror="this.style.display='none'"></div>` : ''}
          <div class="inv-card-row"><span class="inv-card-label">Nombre</span><span class="inv-card-value">${stu.name || '—'}</span></div>
          <div class="inv-card-row"><span class="inv-card-label">Matrícula</span><span class="inv-card-value">${stu.matricula || '—'}</span></div>
          <div class="inv-card-row"><span class="inv-card-label">Curso / Aula</span><span class="inv-card-value">${stu.classroom || '—'}</span></div>
          ${age ? `<div class="inv-card-row"><span class="inv-card-label">Edad</span><span class="inv-card-value">${age} años</span></div>` : ''}
        </div>
      </div>
    </div>

    <!-- ITEMS TABLE -->
    <div class="inv-section">
      <div class="inv-section-title">Detalle de Factura</div>
      <div class="inv-table-wrap">
        <table class="inv-table">
          <thead><tr>
            <th>Concepto</th><th>Descripción</th><th>Cant.</th><th>Precio Unit.</th><th>Descuento</th><th>Subtotal</th>
          </tr></thead>
          <tbody>
            <tr>
              <td>${inv.concept || 'Mensualidad'}</td>
              <td>${periodText}${pay.bank ? ` · ${pay.bank}` : ''}</td>
              <td>1</td>
              <td>${fmtCurrency(amount)}</td>
              <td>${discount > 0 ? '-' + fmtCurrency(discount) : '—'}</td>
              <td>${fmtCurrency(amount - discount)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- TOTALS -->
    <div class="inv-section">
      <div class="inv-totals-wrap">
        <div class="inv-totals">
          <div class="inv-total-row"><span>Subtotal</span><span>${fmtCurrency(subtotal)}</span></div>
          ${discount > 0 ? `<div class="inv-total-row" style="color:#28B54D"><span>Descuento</span><span>-${fmtCurrency(discount)}</span></div>` : ''}
          ${taxAmount > 0 ? `<div class="inv-total-row"><span>Impuestos</span><span>${fmtCurrency(taxAmount)}</span></div>` : ''}
          <hr class="inv-total-divider">
          <div class="inv-total-final"><span>Total</span><span>${fmtCurrency(total)}</span></div>
          <div class="inv-total-row" style="margin-top:4px;padding-top:8px;border-top:1px dashed #e2e8f0"><span style="color:#28B54D;font-weight:800">Estado</span><span style="color:${stColor};font-weight:900">${stLabel}</span></div>
        </div>
      </div>
    </div>

    <!-- PAYMENT METHOD -->
    <div class="inv-section">
      <div class="inv-section-title">Método de Pago</div>
      <div class="inv-payment-card">
        <div class="inv-payment-grid">
          <div class="inv-payment-item"><div class="inv-payment-item-label">Método</div><div class="inv-payment-item-value" style="text-transform:capitalize">${pay.method || 'Efectivo'}</div></div>
          <div class="inv-payment-item"><div class="inv-payment-item-label">Referencia</div><div class="inv-payment-item-value">${inv.payment_reference || '—'}</div></div>
          <div class="inv-payment-item"><div class="inv-payment-item-label">Fecha</div><div class="inv-payment-item-value">${fmtDate(payDate)}</div></div>
          <div class="inv-payment-item"><div class="inv-payment-item-label">Hora</div><div class="inv-payment-item-value">${fmtTime(payDate)}</div></div>
          <div class="inv-payment-item"><div class="inv-payment-item-label">Atendido por</div><div class="inv-payment-item-value">${inv.attended_by || 'Sistema'}</div></div>
          <div class="inv-payment-item"><div class="inv-payment-item-label">Caja</div><div class="inv-payment-item-value">Principal</div></div>
        </div>
      </div>
    </div>

    <!-- ADDITIONAL INFO -->
    <div class="inv-section">
      <div class="inv-section-title">Información Adicional</div>
      <div class="inv-additional-grid">
        <div class="inv-additional-item"><div class="inv-additional-item-label">Período</div><div class="inv-additional-item-value">${periodText}</div></div>
        <div class="inv-additional-item"><div class="inv-additional-item-label">Estado</div><div class="inv-additional-item-value" style="color:${stColor}">${stLabel}</div></div>
        <div class="inv-additional-item"><div class="inv-additional-item-label">Folio Digital</div><div class="inv-additional-item-value" style="font-size:9px;font-family:monospace;word-break:break-all">${uuidFolio || '—'}</div></div>
        <div class="inv-additional-item"><div class="inv-additional-item-label">Fecha Emisión</div><div class="inv-additional-item-value">${fmtDate(issuedDate)}</div></div>
      </div>
    </div>

  </div>

  <!-- FOOTER -->
  <div class="inv-footer">
    <div class="inv-footer-top">
      <div>
        <div class="inv-footer-message">
          ¡Gracias por su confianza en ${sch.school_name || this.SCHOOL}!<br>
          Valoramos su preferencia y esperamos seguir sirviendo a su familia.
        </div>
        <div class="inv-footer-policies">
          • Este documento es válido como comprobante oficial de pago.<br>
          • Conserve este recibo para cualquier consulta o aclaración.<br>
          • Para soporte contacte a administración: ${sch.email || '—'} · ${sch.phone || '—'}
        </div>
      </div>
      <div class="inv-footer-badge">
        <div>
          <div class="inv-footer-badge-text">Estado</div>
          <div class="inv-footer-badge-status">✓ ${stLabel}</div>
        </div>
      </div>
    </div>

    <hr class="inv-footer-divider">

    <!-- QR + BARCODE + HASH -->
    <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start">
      <div class="inv-footer-qr" style="flex:0 0 auto" id="invQR_${inv.id || 'gen'}"></div>
      <div style="flex:1;min-width:200px">
        <div class="inv-footer-barcode" id="invBarcode_${inv.id || 'gen'}"></div>
        <div style="margin-top:8px;text-align:center">
          <div style="font-size:9px;color:rgba(255,255,255,.4);font-weight:600">Hash SHA-256 de validación</div>
          <div style="font-size:8px;color:rgba(255,255,255,.3);font-family:monospace;word-break:break-all;margin-top:2px">${hash || '—'}</div>
        </div>
      </div>
    </div>

    <hr class="inv-footer-divider">

    <div class="inv-footer-meta">
      <div class="inv-footer-meta-item">Documento generado electrónicamente</div>
      <div class="inv-footer-meta-item"><strong>Folio:</strong> ${uuidFolio || '—'}</div>
      <div class="inv-footer-meta-item"><strong>Generado:</strong> ${fmtDate(issuedDate)} ${fmtTime(issuedDate)}</div>
      ${validationUrl ? `<div class="inv-footer-meta-item"><strong>Validar:</strong> ${validationUrl}</div>` : ''}
    </div>

    <div class="inv-stamp">
      <div class="inv-stamp-text">${sch.school_name || this.SCHOOL} — Documento con valor fiscal</div>
    </div>
  </div>

</div>
</body></html>`;
  },

  // ════════════════════════════════════════════════════════════════
  // 2. GENERAR PDF CON html2pdf.js
  // ════════════════════════════════════════════════════════════════

  async generatePDF(data) {
    const html = this.renderInvoiceHTML(data);
    const container = document.createElement('div');
    container.innerHTML = html;
    container.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;z-index:-1;background:white';
    document.body.appendChild(container);

    // Generar QR y barcode en el container
    await this._renderQRAndBarcode(container, data);

    // Esperar a que carguen las fuentes
    await new Promise(r => setTimeout(r, 300));

    let pdfBlob = null;
    if (window.html2pdf) {
      const opt = {
        margin: [8, 8, 8, 8],
        filename: `Factura_${data.invoice?.invoice_number || 'draft'}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true },
        jsPDF: { unit: 'mm', format: 'letter', orientation: 'portrait' },
      };
      pdfBlob = await html2pdf().set(opt).from(container).outputPdf('blob');
    } else if (window.jspdf?.jsPDF) {
      // Fallback: usar print window
      const win = window.open('', '_blank', 'width=820,height=1000');
      if (win) {
        win.document.write(html);
        win.document.close();
        await new Promise(r => setTimeout(r, 500));
        win.print();
      }
    }

    document.body.removeChild(container);
    return pdfBlob;
  },

  async _renderQRAndBarcode(container, data) {
    const inv = data.invoice || data;
    const receiptNo = inv.invoice_number || inv.receipt_number || '';
    const uuidFolio = inv.uuid_folio || '';
    const validationUrl = inv.validation_url || '';

    // QR
    const qrEl = container.querySelector(`[id^="invQR_"]`);
    if (qrEl && window.QRCode) {
      qrEl.innerHTML = '';
      new window.QRCode(qrEl, {
        text: validationUrl || `INV-${inv.id}`,
        width: 80, height: 80,
        colorDark: '#ffffff', colorLight: 'transparent',
        correctLevel: window.QRCode.CorrectLevel.M
      });
      qrEl.insertAdjacentHTML('beforeend',
        `<div class="inv-footer-qr-text"><strong style="color:rgba(255,255,255,.85)">Escanea para validar</strong><br>Código QR de verificación de esta factura</div>`);
    } else if (qrEl) {
      qrEl.innerHTML = `<div style="width:80px;height:80px;background:rgba(255,255,255,.1);border-radius:8px;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.4);font-size:10px">QR</div>
        <div class="inv-footer-qr-text"><strong style="color:rgba(255,255,255,.85)">Validación</strong><br>${validationUrl || '—'}</div>`;
    }

    // Barcode
    const bcEl = container.querySelector(`[id^="invBarcode_"]`);
    if (bcEl && window.JsBarcode) {
      bcEl.innerHTML = '';
      const canvas = document.createElement('canvas');
      bcEl.appendChild(canvas);
      try {
        JsBarcode(canvas, receiptNo.replace(/[^a-zA-Z0-9]/g, ''), {
          format: 'CODE128', width: 1.5, height: 30,
          displayValue: true, font: 'monospace', fontSize: 10,
          background: 'transparent', lineColor: 'rgba(255,255,255,0.5)',
          margin: 0
        });
      } catch (_) {
        bcEl.innerHTML = `<div style="font-size:11px;color:rgba(255,255,255,.5);font-family:monospace">${receiptNo}</div>`;
      }
    } else if (bcEl) {
      bcEl.innerHTML = `<div style="font-size:11px;color:rgba(255,255,255,.5);font-family:monospace;padding:8px">${receiptNo}</div>`;
    }
  },

  // ════════════════════════════════════════════════════════════════
  // 3. SUBIR PDF A SUPABASE STORAGE
  // ════════════════════════════════════════════════════════════════

  async uploadPDF(pdfBlob, invoiceId) {
    if (!pdfBlob) return null;
    const fileName = `invoices/factura_${invoiceId}_${Date.now()}.pdf`;
    const { error } = await supabase.storage
      .from('invoices')
      .upload(fileName, pdfBlob, { contentType: 'application/pdf', upsert: true });
    if (error) { console.warn('[InvoiceModule] PDF upload failed:', error); return null; }
    const { data } = supabase.storage.from('invoices').getPublicUrl(fileName);
    const pdfUrl = data?.publicUrl || null;
    if (pdfUrl && invoiceId) {
      await supabase.from('invoices').update({ pdf_url: pdfUrl }).eq('id', invoiceId);
    }
    return pdfUrl;
  },

  // ════════════════════════════════════════════════════════════════
  // 4. ENVIAR EMAIL CON PDF ADJUNTO
  // ════════════════════════════════════════════════════════════════

  async sendInvoiceEmail(data, pdfBlob) {
    const inv = data.invoice || data;
    const stu = data.student || {};
    const sch = data.school || {};
    const pay = data.payment || {};
    const receiptNo = inv.invoice_number || inv.receipt_number || 'N/A';

    const emails = [stu.p1_email, stu.p2_email].filter(Boolean);
    if (!emails.length) return { error: 'No hay emails de destinatarios' };

    // Construir HTML del email
    const logoUrl = sch.logo_url || `${sch.website || 'https://montessorisonrisascreativas.com'}/img/monte.jpg`;
    const payDate = inv.payment_date || pay.paid_date ? new Date(inv.payment_date || pay.paid_date) : new Date();
    const fmtDate = (d) => d.toLocaleDateString('es-DO', {day:'numeric',month:'long',year:'numeric'});
    const fmtCurrency = (n) => `${this.CURRENCY} ${Number(n||0).toLocaleString('es-DO', {minimumFractionDigits:2})}`;
    const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    let periodText = pay.month_paid || '';
    if (periodText.includes('-')) { const [y,m] = periodText.split('-'); periodText = `${monthNames[parseInt(m)-1]||m} ${y}`; }
    const SITE_URL = sch.website || 'https://montessorisonrisascreativas.com';

    const emailHTML = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Factura ${receiptNo}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f0f4f8;padding:20px}
.wrap{max-width:640px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.1)}
.hd{background:linear-gradient(135deg,#0B63C7,#0850A0);padding:32px 28px 24px;text-align:center}
.hd-logo{width:72px;height:72px;border-radius:16px;overflow:hidden;margin:0 auto 14px;border:3px solid rgba(255,255,255,.3);background:white;box-shadow:0 4px 12px rgba(0,0,0,.2)}
.hd-logo img{width:100%;height:100%;object-fit:cover}
.hd h1{color:white;font-size:20px;font-weight:900;margin-bottom:4px}
.hd p{color:rgba(255,255,255,.8);font-size:12px;font-weight:600}
.hd-badge{margin-top:16px;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.25);border-radius:12px;padding:10px 24px;display:inline-block}
.hd-badge span{color:white;font-family:monospace;font-size:14px;font-weight:900;letter-spacing:2px}
.status{background:#ecfdf5;border-bottom:2px solid #bbf7d0;padding:16px 28px;display:flex;align-items:center;gap:12px}
.status-dot{width:40px;height:40px;background:#28B54D;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-size:18px;flex-shrink:0}
.status h3{font-size:14px;font-weight:900;color:#166534}
.status p{font-size:11px;color:#15803d;font-weight:600}
.cta{padding:24px 28px}
.cta-title{font-size:13px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:14px;text-align:center}
.btn-blue{display:block;width:100%;padding:16px;background:linear-gradient(135deg,#0B63C7,#0850A0);color:white;text-align:center;text-decoration:none;border-radius:12px;font-size:15px;font-weight:900;margin-bottom:10px;transition:transform .15s}
.btn-blue:hover{transform:scale(1.02)}
.btn-row{display:flex;gap:10px;margin-bottom:10px}
.btn-outline{flex:1;padding:14px;border:2px solid #e2e8f0;background:white;color:#1a2340;text-align:center;text-decoration:none;border-radius:12px;font-size:13px;font-weight:800;transition:all .15s}
.btn-outline:hover{border-color:#0B63C7;color:#0B63C7}
.btn-gray{flex:1;padding:14px;border:2px solid #f1f5f9;background:#f8fafc;color:#64748b;text-align:center;text-decoration:none;border-radius:12px;font-size:13px;font-weight:800;transition:all .15s}
.btn-gray:hover{background:#f1f5f9}
.summary{padding:0 28px 24px}
.summary-card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:16px}
.summary-row{display:flex;justify-content:space-between;padding:6px 0;font-size:12px}
.summary-label{color:#94a3b8;font-weight:600}
.summary-value{color:#1a2340;font-weight:700}
.summary-total{border-top:2px solid #28B54D;padding-top:10px;margin-top:6px}
.summary-total .summary-label{color:#28B54D;font-weight:900;font-size:14px}
.summary-total .summary-value{color:#28B54D;font-weight:900;font-size:18px}
.footer{background:#1e293b;padding:20px 28px;text-align:center}
.footer p{color:rgba(255,255,255,.5);font-size:10px;line-height:1.6}
</style></head><body>
<div class="wrap">
  <div class="hd">
    <div class="hd-logo"><img src="${logoUrl}" alt="${sch.school_name}"></div>
    <h1>${sch.school_name || this.SCHOOL}</h1>
    <p>${sch.address || ''} ${sch.phone ? '· Tel: ' + sch.phone : ''}</p>
    <div class="hd-badge"><span>${receiptNo}</span></div>
  </div>
  <div class="status">
    <div class="status-dot">✓</div>
    <div><h3>Pago Confirmado y Aprobado</h3><p>${fmtDate(payDate)}</p></div>
  </div>
  <div class="cta">
    <div class="cta-title">Acciones disponibles</div>
    <a href="${SITE_URL}/validate-invoice.html?uuid=${inv.uuid_folio || ''}" class="btn-blue">📄 Descargar Factura PDF</a>
    <div class="btn-row">
      <a href="${SITE_URL}/validate-invoice.html?uuid=${inv.uuid_folio || ''}" class="btn-outline">🔗 Ver Factura Online</a>
      <a href="mailto:${sch.email || 'admin@montessorisonrisascreativas.com'}" class="btn-gray">✉️ Contactar</a>
    </div>
  </div>
  <div class="summary">
    <div class="summary-card">
      <div class="summary-row"><span class="summary-label">Estudiante</span><span class="summary-value">${stu.name || '—'}</span></div>
      <div class="summary-row"><span class="summary-label">Período</span><span class="summary-value">${periodText || '—'}</span></div>
      <div class="summary-row"><span class="summary-label">Concepto</span><span class="summary-value">${inv.concept || 'Mensualidad'}</span></div>
      <div class="summary-row"><span class="summary-label">Método</span><span class="summary-value" style="text-transform:capitalize">${pay.method || '—'}</span></div>
      <div class="summary-row"><span class="summary-label">Estado</span><span class="summary-value" style="color:#28B54D">PAGADO ✓</span></div>
      <div class="summary-row summary-total"><span class="summary-label">Total Pagado</span><span class="summary-value">${fmtCurrency(inv.total || inv.amount)}</span></div>
    </div>
  </div>
  <div class="footer">
    <p>Este correo fue generado automáticamente. Por favor no respondas a esta dirección.<br>
    Para soporte: ${sch.email || '—'} · ${sch.phone || '—'}<br>
    ${sch.school_name || this.SCHOOL} · ${receiptNo} · ${new Date().getFullYear()}</p>
  </div>
</div>
</body></html>`;

    // Preparar adjunto PDF
    const attachments = [];
    if (pdfBlob) {
      const arrayBuffer = await pdfBlob.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      attachments.push({ filename: `Factura_${receiptNo}.pdf`, content: base64 });
    }

    try {
      const { error } = await supabase.functions.invoke('send-email', {
        body: {
          to: emails,
          subject: `Factura ${receiptNo} — ${stu.name} · ${periodText || pay.concept}`,
          html: emailHTML,
          attachments: attachments.length ? attachments : undefined,
        }
      });
      if (error) throw error;
      // Marcar email enviado
      if (inv.id) {
        try { await supabase.rpc('mark_invoice_email_sent', { p_invoice_id: inv.id }); } catch (_) {}
      }
      return { success: true };
    } catch (e) {
      console.warn('[InvoiceModule] Email send failed:', e);
      return { error: e.message || 'Email failed' };
    }
  },

  // ════════════════════════════════════════════════════════════════
  // 5. MODAL DE FACTURA COMPLETO
  // ════════════════════════════════════════════════════════════════

  openInvoiceModal(data) {
    const inv = data.invoice || data;
    const receiptNo = inv.invoice_number || 'N/A';
    const validationUrl = inv.validation_url || '';
    const pdfUrl = inv.pdf_url || '';

    const existing = document.getElementById('invoiceModalOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'invoiceModalOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(8px);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px';
    overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };

    overlay.innerHTML = `
    <div style="background:white;border-radius:20px;width:100%;max-width:900px;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,.3)">
      <!-- Header del modal -->
      <div style="padding:16px 20px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:36px;height:36px;border-radius:10px;background:#eff6ff;display:flex;align-items:center;justify-content:center;font-size:18px">📄</div>
          <div>
            <div style="font-weight:900;color:#1a2340;font-size:1rem">Factura ${receiptNo}</div>
            <div style="font-size:.7rem;color:#94a3b8">Vista previa del documento</div>
          </div>
        </div>
        <button onclick="document.getElementById('invoiceModalOverlay').remove()" style="width:32px;height:32px;border-radius:50%;border:none;background:#f1f5f9;cursor:pointer;font-size:1rem;display:flex;align-items:center;justify-content:center">✕</button>
      </div>
      <!-- Content scrollable -->
      <div style="flex:1;overflow-y:auto;padding:0;background:#f1f5f9" id="invoiceModalContent">
        <div style="text-align:center;padding:40px;color:#94a3b8">Cargando factura...</div>
      </div>
      <!-- Footer con acciones -->
      <div style="padding:14px 20px;border-top:1px solid #f1f5f9;display:flex;gap:8px;flex-wrap:wrap;flex-shrink:0;background:white">
        ${pdfUrl ? `<a href="${pdfUrl}" target="_blank" style="padding:10px 18px;border-radius:10px;background:#0B63C7;color:white;text-decoration:none;font-size:.8rem;font-weight:800;display:flex;align-items:center;gap:6px">📥 Descargar PDF</a>` : ''}
        <button onclick="window.InvoicingModule?.openInvoiceModal && InvoiceModule._printInvoice()" style="padding:10px 18px;border-radius:10px;border:2px solid #0B63C7;background:#eff6ff;color:#0B63C7;font-size:.8rem;font-weight:800;cursor:pointer;display:flex;align-items:center;gap:6px">🖨️ Imprimir</button>
        <button onclick="InvoiceModule._resendEmail()" style="padding:10px 18px;border-radius:10px;border:2px solid #28B54D;background:#f0fdf4;color:#28B54D;font-size:.8rem;font-weight:800;cursor:pointer;display:flex;align-items:center;gap:6px">📧 Reenviar</button>
        ${validationUrl ? `<a href="${validationUrl}" target="_blank" style="padding:10px 18px;border-radius:10px;border:2px solid #e2e8f0;background:white;color:#64748b;text-decoration:none;font-size:.8rem;font-weight:800;display:flex;align-items:center;gap:6px">🔗 Ver Online</a>` : ''}
        <div style="flex:1"></div>
        <button onclick="document.getElementById('invoiceModalOverlay').remove()" style="padding:10px 18px;border-radius:10px;border:none;background:#f1f5f9;color:#64748b;font-size:.8rem;font-weight:800;cursor:pointer">Cerrar</button>
      </div>
    </div>`;

    document.body.appendChild(overlay);

    // Renderizar la factura HTML en el modal
    const content = document.getElementById('invoiceModalContent');
    const html = this.renderInvoiceHTML(data);
    content.innerHTML = `<div style="padding:16px">${html}</div>`;

    // Renderizar QR y barcode
    this._renderQRAndBarcode(content, data);

    // Guardar data para reenviar
    this._currentInvoiceData = data;
  },

  _printInvoice() {
    const content = document.getElementById('invoiceModalContent');
    if (!content) return;
    const page = content.querySelector('.page');
    if (!page) return;
    const printHTML = `<!DOCTYPE html><html><head><title>Imprimir Factura</title><style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');${document.querySelector('style')?.textContent || ''}</style></head><body style="margin:0;padding:0">${page.outerHTML}<script>window.onload=()=>setTimeout(()=>window.print(),400)<\/script></body></html>`;
    const win = window.open('', '_blank', 'width=820,height=1000');
    if (win) { win.document.write(printHTML); win.document.close(); }
  },

  async _resendEmail() {
    if (!this._currentInvoiceData) { Helpers.toast('No hay datos de factura', 'warning'); return; }
    Helpers.toast('Reenviando correo...', 'info');
    const result = await this.sendInvoiceEmail(this._currentInvoiceData);
    if (result?.error) Helpers.toast('Error: ' + result.error, 'error');
    else Helpers.toast('Correo reenviado exitosamente', 'success');
  },

  // ════════════════════════════════════════════════════════════════
  // 6. MODAL DE ÉXITO POST-COBRO
  // ════════════════════════════════════════════════════════════════

  openSuccessModal(total, invoiceResult, paymentId) {
    const receiptNo = invoiceResult?.receipt_number || invoiceResult?.invoice?.invoice_number || 'N/A';
    const hasInvoice = !!invoiceResult?.invoice?.id;
    const hasWarning = !!invoiceResult?.warning;
    const pdfUrl = invoiceResult?.invoice?.pdf_url || '';
    const validationUrl = invoiceResult?.invoice?.validation_url || '';
    const invData = invoiceResult;

    const existing = document.getElementById('cajaSuccessModal');
    if (existing) existing.remove();

    const fmt = (n) => `RD$ ${Number(n||0).toLocaleString('es-DO', {minimumFractionDigits:2})}`;
    const SITE_URL = invData?.school?.website || 'https://montessorisonrisascreativas.com';

    const overlay = document.createElement('div');
    overlay.id = 'cajaSuccessModal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);backdrop-filter:blur(6px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
    overlay.onclick = e => { if(e.target===overlay) el.remove(); };

    overlay.innerHTML = `
    <div style="background:white;border-radius:20px;padding:0;max-width:420px;width:100%;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <!-- Header animado -->
      <div style="background:linear-gradient(135deg,#0B63C7,#0850A0);padding:28px 24px;text-align:center;position:relative;overflow:hidden">
        <div style="position:absolute;top:-30px;right:-30px;width:100px;height:100px;background:rgba(255,255,255,.08);border-radius:50%"></div>
        <div style="width:64px;height:64px;background:rgba(255,255,255,.15);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;font-size:2rem;animation:popIn .4s ease-out">✅</div>
        <div style="font-size:1.2rem;font-weight:900;color:white;margin-bottom:4px">¡Factura Generada!</div>
        <div style="font-size:.75rem;color:rgba(255,255,255,.8);font-weight:600">Recibo: <span style="font-family:monospace;letter-spacing:1px">${receiptNo}</span></div>
        <div style="font-size:1.8rem;font-weight:900;color:white;margin-top:12px">${fmt(total)}</div>
      </div>

      <!-- Checklist -->
      <div style="padding:20px 24px">
        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px">
          <div style="display:flex;align-items:center;gap:10px;font-size:.8rem;font-weight:700">
            <span style="width:22px;height:22px;border-radius:50%;background:#28B54D;color:white;display:flex;align-items:center;justify-content:center;font-size:.7rem;flex-shrink:0">✓</span>
            <span style="color:#28B54D">Pago registrado en caja</span>
          </div>
          <div style="display:flex;align-items:center;gap:10px;font-size:.8rem;font-weight:700">
            <span style="width:22px;height:22px;border-radius:50%;background:${hasInvoice?'#28B54D':'#F59E0B'};color:white;display:flex;align-items:center;justify-content:center;font-size:.7rem;flex-shrink:0">${hasInvoice?'✓':'!'}</span>
            <span style="color:${hasInvoice?'#28B54D':'#F59E0B'}">${hasInvoice?'Factura generada y guardada':'Factura pendiente de sincronizar'}</span>
          </div>
          <div style="display:flex;align-items:center;gap:10px;font-size:.8rem;font-weight:700">
            <span style="width:22px;height:22px;border-radius:50%;background:${hasInvoice?'#28B54D':'#94a3b8'};color:white;display:flex;align-items:center;justify-content:center;font-size:.7rem;flex-shrink:0">${hasInvoice?'✓':'○'}</span>
            <span style="color:${hasInvoice?'#28B54D':'#94a3b8'}">${hasInvoice?'PDF generado y almacenado':'PDF se generará al sincronizar'}</span>
          </div>
          <div style="display:flex;align-items:center;gap:10px;font-size:.8rem;font-weight:700">
            <span style="width:22px;height:22px;border-radius:50%;background:${hasInvoice?'#28B54D':'#94a3b8'};color:white;display:flex;align-items:center;justify-content:center;font-size:.7rem;flex-shrink:0">${hasInvoice?'✓':'○'}</span>
            <span style="color:${hasInvoice?'#28B54D':'#94a3b8'}">${hasInvoice?'Correo enviado con PDF adjunto':'Correo se enviará al sincronizar'}</span>
          </div>
        </div>

        <!-- Acciones -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
          <button onclick="InvoiceModule._viewInvoice()" style="padding:12px;border-radius:12px;border:2px solid #0B63C7;background:#eff6ff;color:#0B63C7;font-size:.78rem;font-weight:900;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px">📄 Ver Factura</button>
          <button onclick="InvoiceModule._printInvoice()" style="padding:12px;border-radius:12px;border:2px solid #0B63C7;background:#eff6ff;color:#0B63C7;font-size:.78rem;font-weight:900;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px">🖨️ Imprimir</button>
          <button onclick="InvoiceModule._downloadPDF()" style="padding:12px;border-radius:12px;border:2px solid #28B54D;background:#f0fdf4;color:#28B54D;font-size:.78rem;font-weight:900;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px">📥 Descargar PDF</button>
          <button onclick="InvoiceModule._resendEmail()" style="padding:12px;border-radius:12px;border:2px solid #28B54D;background:#f0fdf4;color:#28B54D;font-size:.78rem;font-weight:900;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px">📧 Reenviar</button>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:16px">
          <button onclick="InvoiceModule._shareWhatsApp()" style="flex:1;padding:12px;border-radius:12px;border:none;background:#25D366;color:white;font-size:.78rem;font-weight:900;cursor:pointer">📱 WhatsApp</button>
          <button onclick="InvoiceModule._shareTelegram()" style="flex:1;padding:12px;border-radius:12px;border:none;background:#0088cc;color:white;font-size:.78rem;font-weight:900;cursor:pointer">✈️ Telegram</button>
          <button onclick="InvoiceModule._copyLink()" style="flex:1;padding:12px;border-radius:12px;border:none;background:#f1f5f9;color:#64748b;font-size:.78rem;font-weight:900;cursor:pointer">🔗 Copiar</button>
        </div>

        <button onclick="document.getElementById('cajaSuccessModal').remove()" style="width:100%;padding:14px;border-radius:14px;border:none;background:#0B63C7;color:white;font-size:.9rem;font-weight:900;cursor:pointer">Cerrar</button>
      </div>
    </div>
    <style>@keyframes popIn{0%{transform:scale(0);opacity:0}50%{transform:scale(1.2)}100%{transform:scale(1);opacity:1}}</style>`;

    document.body.appendChild(overlay);

    // Guardar data para acciones
    this._currentInvoiceData = invData;
    this._currentPaymentId = paymentId;
  },

  // ════════════════════════════════════════════════════════════════
  // 7. ACCIONES DEL MODAL
  // ════════════════════════════════════════════════════════════════

  _viewInvoice() {
    if (this._currentInvoiceData) this.openInvoiceModal(this._currentInvoiceData);
  },

  _downloadPDF() {
    const data = this._currentInvoiceData;
    if (!data) return;
    const inv = data.invoice || data;
    if (inv.pdf_url) {
      window.open(inv.pdf_url, '_blank');
    } else {
      Helpers.toast('Generando PDF...', 'info');
      this.generatePDF(data).then(blob => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = `Factura_${inv.invoice_number || 'draft'}.pdf`;
          a.click(); URL.revokeObjectURL(url);
        }
      });
    }
  },

  _shareWhatsApp() {
    const data = this._currentInvoiceData;
    if (!data) return;
    const inv = data.invoice || data;
    const stu = data.student || {};
    const sch = data.school || {};
    const url = inv.validation_url || '';
    const msg = `📄 Factura ${inv.invoice_number || ''}\n💰 Total: RD$ ${Number(inv.total||0).toLocaleString('es-DO')}\n👤 Estudiante: ${stu.name || ''}\n🔗 Ver: ${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  },

  _shareTelegram() {
    const data = this._currentInvoiceData;
    if (!data) return;
    const inv = data.invoice || data;
    const stu = data.student || {};
    const url = inv.validation_url || '';
    const msg = `📄 Factura ${inv.invoice_number || ''} — ${stu.name || ''} — ${inv.validation_url || ''}`;
    window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(msg)}`, '_blank');
  },

  _copyLink() {
    const data = this._currentInvoiceData;
    if (!data) return;
    const inv = data.invoice || data;
    const url = inv.validation_url || inv.pdf_url || '';
    if (url) {
      navigator.clipboard.writeText(url).then(
        () => Helpers.toast('Enlace copiado', 'success'),
        () => Helpers.toast('Error al copiar', 'error')
      );
    }
  },

  // ════════════════════════════════════════════════════════════════
  // 8. VALIDACIÓN DE FACTURA
  // ════════════════════════════════════════════════════════════════

  async validateInvoice(uuid) {
    const { data: invoice, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('uuid_folio', uuid)
      .single();
    if (error || !invoice) return { valid: false, error: 'Factura no encontrada' };
    return {
      valid: true,
      invoice_number: invoice.invoice_number,
      status: invoice.status,
      total: invoice.total,
      student_name: invoice.student_name,
      issued_date: invoice.issued_date,
      payment_date: invoice.payment_date,
      sha256_hash: invoice.sha256_hash,
    };
  },

  // ════════════════════════════════════════════════════════════════
  // 9. HELPERS
  // ════════════════════════════════════════════════════════════════

  _formatMonth(mp) {
    if (!mp) return '-';
    const LABELS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const parts = String(mp).split('-');
    if (parts.length >= 2) { const m = parseInt(parts[1],10)-1; return `${LABELS[m]||mp} ${parts[0]}`; }
    return mp;
  },

  _resolveStatus(p) {
    const s = (p.status||'').toLowerCase().trim();
    if (s === 'paid') return 'paid';
    if (s === 'review') return 'review';
    if (s === 'rejected') return 'rejected';
    if (s === 'cancelled') return 'cancelled';
    if (p.due_date) { const due = new Date(p.due_date+'T00:00:00'); const now = new Date(); now.setHours(0,0,0,0); if (now > due) return 'overdue'; }
    return 'pending';
  },
};
