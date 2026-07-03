/**
 * Karpus Kids — Invoice Module
 * Genera facturas electrónicas individuales (PDF via ventana de impresión)
 * y exportaciones CSV/batch filtradas por estado.
 *
 * Uso:
 *   InvoiceModule.downloadSingle(payment)        → PDF de un pago
 *   InvoiceModule.exportBatch(payments, options) → CSV múltiple
 */

export const InvoiceModule = {

  // ─── CONFIG ────────────────────────────────────────────────────────────────
  SCHOOL_NAME:    'Colegio Montessori Sonrisas Creativas',
  SCHOOL_ADDRESS: 'República Dominicana',
  SCHOOL_EMAIL:   'sonrisascreativas@karpuskids.com',
  SCHOOL_PHONE:   '',
  CURRENCY:       'RD$',

  STATUS_LABELS: {
    paid:     'PAGADO',
    pending:  'PENDIENTE',
    review:   'EN REVISIÓN',
    overdue:  'VENCIDO',
    rejected: 'RECHAZADO',
    mora:     'CON MORA',
  },

  STATUS_COLORS: {
    paid:     '#16a34a',
    pending:  '#d97706',
    review:   '#2563eb',
    overdue:  '#dc2626',
    rejected: '#6b7280',
    mora:     '#b91c1c',
  },

  // ─── FACTURA INDIVIDUAL ────────────────────────────────────────────────────

  /**
   * Genera e imprime una factura individual como PDF.
   * @param {Object} payment  — fila del payments con students enriquecido
   */
  downloadSingle(payment) {
    const p      = payment;
    const st     = this._resolveStatus(p);
    const name   = p.students?.name || p.student_name || 'N/D';
    const aula   = p.students?.classrooms?.name || p.classroom_name || '-';
    const parent = p.students?.p1_name || p.parent_name || '-';
    const month  = this._formatMonth(p.month_paid);
    const amount = Number(p.amount || 0);
    const mora   = Number(p.mora_amount || this._calcMoraClient(p.due_date) || 0);
    const total  = amount + mora;
    const paidAt = p.paid_date ? new Date(p.paid_date).toLocaleDateString('es-ES', { year:'numeric', month:'long', day:'2-digit' }) : '-';
    const dueAt  = p.due_date  ? new Date(p.due_date  + 'T00:00:00').toLocaleDateString('es-ES', { year:'numeric', month:'long', day:'2-digit' }) : '-';
    const ref    = p.reference || p.id || '-';
    const method = (p.method || '-').toUpperCase();
    const bank   = p.bank ? ` / ${p.bank}` : '';
    const color  = this.STATUS_COLORS[st] || '#374151';
    const stLabel = this.STATUS_LABELS[st] || st.toUpperCase();
    const invoiceNum = `INV-${String(p.id).padStart(6,'0')}`;
    const today  = new Date().toLocaleDateString('es-ES', { year:'numeric', month:'long', day:'2-digit' });

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Factura ${invoiceNum}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; background:#f5f5f5; color:#1a2340; }
  .page { background:#fff; max-width:700px; margin:20px auto; border-radius:12px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,.1); }
  .header { background:linear-gradient(135deg,#28B54D,#239943); color:#fff; padding:32px 36px 24px; }
  .header h1 { font-size:22px; font-weight:900; letter-spacing:-.5px; }
  .header p  { font-size:12px; opacity:.85; margin-top:2px; }
  .header .inv { float:right; text-align:right; }
  .header .inv .num { font-size:26px; font-weight:900; letter-spacing:-1px; }
  .header .inv .dt  { font-size:11px; opacity:.8; margin-top:2px; }
  .clearfix::after { content:''; display:table; clear:both; }
  .body { padding:32px 36px; }
  .badge { display:inline-block; padding:6px 16px; border-radius:50px; color:#fff; font-size:11px; font-weight:900; letter-spacing:.8px; text-transform:uppercase; background:${color}; margin-bottom:24px; }
  .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:24px; margin-bottom:24px; }
  .card { background:#f8fafc; border-radius:10px; padding:16px 20px; border:1px solid #e9ecef; }
  .card h4 { font-size:9px; font-weight:900; color:#6b7280; text-transform:uppercase; letter-spacing:1px; margin-bottom:10px; }
  .card p  { font-size:13px; font-weight:700; color:#1a2340; margin-bottom:4px; }
  .card span { font-size:11px; color:#6b7280; }
  table { width:100%; border-collapse:collapse; margin-bottom:20px; }
  thead tr { background:#f1f5f9; }
  th { padding:10px 14px; font-size:9px; font-weight:900; text-transform:uppercase; letter-spacing:.8px; color:#6b7280; text-align:left; }
  td { padding:12px 14px; font-size:13px; border-bottom:1px solid #f1f5f9; }
  .total-row td { font-weight:900; font-size:14px; border-bottom:none; border-top:2px solid #e9ecef; padding-top:14px; }
  .total-row .total-amt { color:${color}; font-size:18px; }
  .mora-row td { color:#dc2626; font-size:12px; }
  .footer { background:#f8fafc; padding:20px 36px; border-top:1px solid #e9ecef; text-align:center; font-size:10px; color:#9ca3af; }
  .qr-placeholder { width:60px; height:60px; background:#e9ecef; border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:8px; color:#9ca3af; text-align:center; padding:4px; }
  @media print {
    body { background:#fff; }
    .page { box-shadow:none; margin:0; border-radius:0; max-width:100%; }
  }
</style>
</head>
<body>
<div class="page">
  <div class="header clearfix">
    <div>
      <h1>${this.SCHOOL_NAME}</h1>
      <p>${this.SCHOOL_ADDRESS}</p>
      ${this.SCHOOL_EMAIL ? `<p>${this.SCHOOL_EMAIL}</p>` : ''}
    </div>
    <div class="inv">
      <div class="num">${invoiceNum}</div>
      <div class="dt">Emitido: ${today}</div>
    </div>
  </div>
  <div class="body">
    <span class="badge">${stLabel}</span>
    <div class="grid2">
      <div class="card">
        <h4>Estudiante</h4>
        <p>${name}</p>
        <span>${aula}</span>
      </div>
      <div class="card">
        <h4>Padre / Tutor</h4>
        <p>${parent}</p>
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Concepto</th>
          <th>Período</th>
          <th>Método</th>
          <th>Fecha pago</th>
          <th style="text-align:right">Monto</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${p.concept || 'Mensualidad'}</td>
          <td>${month}</td>
          <td>${method}${bank}</td>
          <td>${paidAt}</td>
          <td style="text-align:right;font-weight:700">${this.CURRENCY} ${amount.toLocaleString('es-DO',{minimumFractionDigits:2})}</td>
        </tr>
        ${mora > 0 ? `
        <tr class="mora-row">
          <td colspan="4" style="color:#dc2626">⚠ Mora acumulada (vence: ${dueAt})</td>
          <td style="text-align:right;font-weight:700;color:#dc2626">${this.CURRENCY} ${mora.toLocaleString('es-DO',{minimumFractionDigits:2})}</td>
        </tr>` : ''}
      </tbody>
      <tfoot>
        <tr class="total-row">
          <td colspan="4">Total a pagar</td>
          <td class="total-amt" style="text-align:right">${this.CURRENCY} ${total.toLocaleString('es-DO',{minimumFractionDigits:2})}</td>
        </tr>
      </tfoot>
    </table>
    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:8px;">
      <div style="font-size:11px;color:#6b7280">
        <strong>Referencia:</strong> ${ref}<br>
        <strong>Fecha límite:</strong> ${dueAt}
      </div>
      <div class="qr-placeholder">QR<br>REF</div>
    </div>
  </div>
  <div class="footer">
    Este documento es una factura electrónica oficial · ${this.SCHOOL_NAME} · ${today}
  </div>
</div>
<script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`;

    const win = window.open('', '_blank', 'width=780,height=900');
    if (!win) { alert('Permite ventanas emergentes para descargar la factura.'); return; }
    win.document.write(html);
    win.document.close();
  },

  // ─── EXPORTACIÓN BATCH ─────────────────────────────────────────────────────

  /**
   * Exporta una lista de pagos como CSV.
   * @param {Array}  payments  — lista ya enriquecida con student info
   * @param {Object} opts      — { statusFilter, filename }
   */
  exportBatch(payments, opts = {}) {
    if (!payments?.length) {
      alert('No hay pagos para exportar con los filtros seleccionados.');
      return;
    }

    const statusFilter = opts.statusFilter || 'all';
    let list = payments;

    if (statusFilter !== 'all') {
      list = payments.filter(p => this._resolveStatus(p) === statusFilter);
    }

    if (!list.length) {
      alert(`No hay pagos con estado "${this.STATUS_LABELS[statusFilter] || statusFilter}" para exportar.`);
      return;
    }

    const headers = [
      'N° Factura','Estudiante','Aula','Padre/Tutor',
      'Concepto','Período','Estado','Monto','Mora','Total',
      'Método','Banco','Referencia','Fecha Pago','Fecha Límite',
      'Creado'
    ];

    const rows = list.map(p => {
      const mora = Number(p.mora_amount || this._calcMoraClient(p.due_date) || 0);
      return [
        `INV-${String(p.id).padStart(6,'0')}`,
        p.students?.name || p.student_name || '',
        p.students?.classrooms?.name || p.classroom_name || '',
        p.students?.p1_name || p.parent_name || '',
        p.concept || 'Mensualidad',
        this._formatMonth(p.month_paid),
        this.STATUS_LABELS[this._resolveStatus(p)] || p.status || '',
        Number(p.amount || 0).toFixed(2),
        mora.toFixed(2),
        (Number(p.amount || 0) + mora).toFixed(2),
        p.method || '',
        p.bank || '',
        p.reference || '',
        p.paid_date ? new Date(p.paid_date).toLocaleDateString('es-ES') : '',
        p.due_date  ? new Date(p.due_date + 'T00:00:00').toLocaleDateString('es-ES') : '',
        p.created_at ? new Date(p.created_at).toLocaleDateString('es-ES') : '',
      ];
    });

    const csv = [headers, ...rows]
      .map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const dateStr = new Date().toISOString().split('T')[0];
    const filename = opts.filename || `facturas_${statusFilter}_${dateStr}.csv`;

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return list.length;
  },

  // ─── HELPERS INTERNOS ──────────────────────────────────────────────────────

  _resolveStatus(p) {
    const s = (p.status || '').toLowerCase().trim();
    if (s === 'paid')     return 'paid';
    if (s === 'review')   return 'review';
    if (s === 'rejected') return 'rejected';
    if (s === 'overdue')  return 'overdue';
    // pending con mora activa
    if (p.due_date) {
      const due = new Date(p.due_date + 'T00:00:00');
      const now = new Date(); now.setHours(0,0,0,0);
      if (now > due) return 'overdue';
    }
    return 'pending';
  },

  _calcMoraClient(dueDate) {
    if (!dueDate) return 0;
    const due  = new Date(dueDate + 'T00:00:00');
    const now  = new Date(); now.setHours(0,0,0,0);
    const days = Math.floor((now - due) / 86400000);
    if (days <= 0) return 0;
    const blocks = Math.floor(days / 7);
    const rem    = days % 7;
    return (blocks * 500) + (rem * 50);
  },

  _formatMonth(monthPaid) {
    if (!monthPaid) return '-';
    const LABELS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const parts  = String(monthPaid).split('-');
    if (parts.length >= 2) {
      const m = parseInt(parts[1], 10) - 1;
      return `${LABELS[m] || monthPaid} ${parts[0]}`;
    }
    return monthPaid;
  },
};
