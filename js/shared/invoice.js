/**
 * Karpus Kids — Invoice Module v2
 * Factura electrónica profesional Sonrisas Creativas
 * - downloadSingle(payment)  → PDF via ventana de impresión
 * - exportBatch(payments, opts) → CSV bien estructurado
 */

export const InvoiceModule = {

  SCHOOL:    'Colegio Montessori Sonrisas Creativas',
  CURRENCY:  'RD$',
  GREEN:     '#28B54D',
  ORANGE:    '#FF8A00',
  BLUE:      '#0B63C7',

  STATUS_LABEL: {
    paid:     'PAGADO',
    pending:  'PENDIENTE',
    review:   'EN REVISIÓN',
    overdue:  'VENCIDO',
    rejected: 'RECHAZADO',
  },
  STATUS_COLOR: {
    paid:     '#16a34a',
    pending:  '#d97706',
    review:   '#2563eb',
    overdue:  '#dc2626',
    rejected: '#6b7280',
  },

  // ─── FACTURA INDIVIDUAL (PDF via print) ────────────────────────────

  downloadSingle(payment) {
    const p    = payment;
    const st   = this._resolveStatus(p);
    const name = p.students?.name || p.student_name || 'N/D';
    const aula = p.students?.classrooms?.name || p.classroom_name || '-';
    const parent  = p.students?.p1_name || p.parent_name || '-';
    const month   = this._formatMonth(p.month_paid);
    const amount  = Number(p.amount   || 0);
    const mora    = Number(p.mora_amount || this._calcMoraClient(p.due_date) || 0);
    const total   = amount + mora;
    const paidAt  = p.paid_date ? new Date(p.paid_date).toLocaleDateString('es-ES',{year:'numeric',month:'long',day:'2-digit'}) : '-';
    const dueAt   = p.due_date  ? new Date(p.due_date+'T00:00:00').toLocaleDateString('es-ES',{year:'numeric',month:'long',day:'2-digit'}) : '-';
    const method  = (p.method || '-').toUpperCase();
    const bank    = p.bank ? ` · ${p.bank}` : '';
    const ref     = p.reference || String(p.id).padStart(6,'0');
    const invNum  = `INV-${String(p.id).padStart(6,'0')}`;
    const today   = new Date().toLocaleDateString('es-ES',{year:'numeric',month:'long',day:'2-digit'});
    const stColor = this.STATUS_COLOR[st] || '#374151';
    const stLabel = this.STATUS_LABEL[st] || st.toUpperCase();

    const html = `<!DOCTYPE html><html lang="es"><head>
<meta charset="utf-8">
<title>Factura ${invNum} — ${name}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap');
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Nunito',Arial,sans-serif;background:#f1f5f9;color:#1a2340;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .page{background:#fff;max-width:760px;margin:24px auto;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.12)}

  /* HEADER */
  .hd{background:linear-gradient(135deg,#28B54D 0%,#239943 100%);padding:28px 36px;display:flex;align-items:center;justify-content:space-between;gap:20px}
  .hd-left{flex:1}
  .hd-logo{font-size:22px;font-weight:900;color:#fff;letter-spacing:-.5px;line-height:1.1}
  .hd-sub{font-size:10px;color:rgba(255,255,255,.8);font-weight:700;text-transform:uppercase;letter-spacing:.1em;margin-top:3px}
  .hd-right{text-align:right;background:rgba(255,255,255,.15);padding:16px 22px;border-radius:12px;backdrop-filter:blur(8px)}
  .hd-inv{font-size:11px;color:rgba(255,255,255,.7);font-weight:700;text-transform:uppercase;letter-spacing:.1em}
  .hd-num{font-size:26px;font-weight:900;color:#fff;letter-spacing:-.5px;margin-top:2px}
  .hd-date{font-size:11px;color:rgba(255,255,255,.75);font-weight:600;margin-top:4px}

  /* BADGE */
  .badge{display:inline-flex;align-items:center;gap:6px;padding:6px 16px;border-radius:50px;font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#fff;background:${stColor};margin:20px 36px 0}

  /* INFO GRID */
  .info{display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:20px 36px 0}
  .card{background:#f8fafc;border-radius:12px;padding:16px 20px;border:1px solid #e9ecef}
  .card h4{font-size:9px;font-weight:900;color:#6b7280;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;display:flex;align-items:center;gap:6px}
  .card h4 .dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
  .card .val{font-size:14px;font-weight:800;color:#1a2340;margin-bottom:3px}
  .card .sub{font-size:11px;color:#6b7280;font-weight:600}

  /* TABLE */
  .tbl-wrap{padding:20px 36px 0}
  table{width:100%;border-collapse:collapse;border-radius:10px;overflow:hidden}
  thead tr{background:linear-gradient(135deg,${this.BLUE},#0850a0);color:#fff}
  th{padding:12px 16px;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;text-align:left}
  th:last-child{text-align:right}
  tbody tr{border-bottom:1px solid #f1f5f9}
  tbody tr:last-child{border:none}
  td{padding:14px 16px;font-size:13px;color:#1a2340;vertical-align:middle}
  td:last-child{text-align:right;font-weight:800}
  .mora-row td{color:#dc2626;font-size:12px;background:#fef2f2}

  /* TOTAL */
  .total-wrap{display:flex;justify-content:flex-end;padding:16px 36px 0}
  .total-box{background:#f8fafc;border-radius:12px;padding:18px 24px;min-width:260px;border:1px solid #e9ecef}
  .total-row{display:flex;justify-content:space-between;font-size:13px;margin-bottom:10px;color:#6b7280}
  .total-row span:last-child{color:#1a2340;font-weight:700}
  .total-final{display:flex;justify-content:space-between;border-top:2px solid ${this.GREEN};padding-top:12px;margin-top:4px}
  .total-final span:first-child{font-size:15px;font-weight:900;color:${this.GREEN};text-transform:uppercase}
  .total-final span:last-child{font-size:20px;font-weight:900;color:${this.GREEN}}

  /* PAYMENT STATUS */
  .paid-ok{margin:16px 36px 0;background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:12px;padding:14px 18px;display:flex;align-items:center;gap:12px}
  .paid-ok .icon{font-size:22px}
  .paid-ok .txt{font-size:12px;font-weight:700;color:#166534}

  /* META */
  .meta{display:flex;justify-content:space-between;padding:16px 36px 0;gap:16px;flex-wrap:wrap}
  .meta-item{font-size:11px;color:#6b7280;font-weight:600}
  .meta-item strong{color:#1a2340}

  /* FOOTER */
  .ft{margin-top:24px;padding:16px 36px;background:#f8fafc;border-top:1px solid #e9ecef;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px}
  .ft-logo{font-size:13px;font-weight:900;color:${this.GREEN}}
  .ft-txt{font-size:10px;color:#9ca3af;font-weight:600}

  @media print{
    body{background:#fff}
    .page{box-shadow:none;margin:0;border-radius:0;max-width:100%}
    .no-print{display:none!important}
    @page{margin:10mm}
  }
</style>
</head><body>
<div class="page">
  <div class="hd">
    <div class="hd-left">
      <div class="hd-logo">🏫 ${this.SCHOOL}</div>
      <div class="hd-sub">Factura Electrónica · República Dominicana</div>
    </div>
    <div class="hd-right">
      <div class="hd-inv">Número de Factura</div>
      <div class="hd-num">${invNum}</div>
      <div class="hd-date">Emitida: ${today}</div>
    </div>
  </div>

  <span class="badge">${stLabel}</span>

  <div class="info">
    <div class="card">
      <h4><span class="dot" style="background:${this.GREEN}"></span>Estudiante</h4>
      <div class="val">${name}</div>
      <div class="sub">Aula: ${aula}</div>
    </div>
    <div class="card">
      <h4><span class="dot" style="background:${this.ORANGE}"></span>Padre / Tutor</h4>
      <div class="val">${parent}</div>
      <div class="sub">Período: ${month}</div>
    </div>
  </div>

  <div class="tbl-wrap">
    <table>
      <thead>
        <tr>
          <th>Concepto</th>
          <th>Período</th>
          <th>Método de Pago</th>
          <th>Fecha de Pago</th>
          <th>Monto</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${p.concept || 'Mensualidad'}</td>
          <td>${month}</td>
          <td>${method}${bank}</td>
          <td>${paidAt}</td>
          <td>${this.CURRENCY} ${amount.toLocaleString('es-DO',{minimumFractionDigits:2})}</td>
        </tr>
        ${mora > 0 ? `<tr class="mora-row">
          <td colspan="4">⚠ Mora acumulada — vence: ${dueAt}</td>
          <td>${this.CURRENCY} ${mora.toLocaleString('es-DO',{minimumFractionDigits:2})}</td>
        </tr>` : ''}
      </tbody>
    </table>
  </div>

  <div class="total-wrap">
    <div class="total-box">
      <div class="total-row"><span>Subtotal</span><span>${this.CURRENCY} ${amount.toLocaleString('es-DO',{minimumFractionDigits:2})}</span></div>
      ${mora > 0 ? `<div class="total-row" style="color:#dc2626"><span>Mora</span><span>${this.CURRENCY} ${mora.toLocaleString('es-DO',{minimumFractionDigits:2})}</span></div>` : ''}
      <div class="total-final">
        <span>Total</span>
        <span>${this.CURRENCY} ${total.toLocaleString('es-DO',{minimumFractionDigits:2})}</span>
      </div>
    </div>
  </div>

  ${st === 'paid' ? `<div class="paid-ok"><span class="icon">✅</span><div class="txt">Pago recibido el ${paidAt} — ${method}${bank}</div></div>` : ''}

  <div class="meta">
    <div class="meta-item"><strong>Referencia:</strong> ${ref}</div>
    <div class="meta-item"><strong>Fecha límite:</strong> ${dueAt}</div>
    <div class="meta-item"><strong>Estado:</strong> ${stLabel}</div>
  </div>

  <div class="ft">
    <div class="ft-logo">Sonrisas Creativas</div>
    <div class="ft-txt">Documento generado el ${today} · Este comprobante es válido como factura electrónica</div>
  </div>
</div>
<script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script>
</body></html>`;

    const win = window.open('','_blank','width=820,height=1000');
    if (!win) { alert('Permite ventanas emergentes para descargar la factura.'); return; }
    win.document.write(html);
    win.document.close();
  },

  // ─── EXPORTACIÓN CSV ESTRUCTURADA ──────────────────────────────────

  exportBatch(payments, opts = {}) {
    if (!payments?.length) { alert('No hay registros para exportar.'); return 0; }

    const sf = opts.statusFilter || 'all';
    let list = sf === 'all' ? payments : payments.filter(p => this._resolveStatus(p) === sf);
    if (!list.length) { alert(`No hay registros con estado "${sf}" para exportar.`); return 0; }

    const SCHOOL = this.SCHOOL;
    const today  = new Date().toLocaleDateString('es-ES');
    const CURRENCY = this.CURRENCY;

    // Encabezado del reporte
    const reportHeader = [
      [`REPORTE DE FACTURAS — ${SCHOOL}`],
      [`Fecha de exportación: ${today}  |  Filtro: ${sf.toUpperCase()}  |  Total registros: ${list.length}`],
      [],
    ];

    const headers = [
      'N° Factura',
      'Estudiante',
      'Aula',
      'Padre / Tutor',
      'Concepto',
      'Período',
      'Estado',
      `Monto (${CURRENCY})`,
      `Mora (${CURRENCY})`,
      `Total (${CURRENCY})`,
      'Método de Pago',
      'Banco',
      'Referencia',
      'Fecha de Pago',
      'Fecha Límite',
      'Días de atraso',
      'Fecha Creación',
    ];

    const rows = list.map(p => {
      const mora = Number(p.mora_amount || this._calcMoraClient(p.due_date) || 0);
      const st   = this._resolveStatus(p);
      const daysLate = p.due_date ? Math.max(0, Math.floor((new Date() - new Date(p.due_date+'T00:00:00')) / 86400000)) : 0;
      return [
        `INV-${String(p.id).padStart(6,'0')}`,
        p.students?.name || p.student_name || '',
        p.students?.classrooms?.name || p.classroom_name || '',
        p.students?.p1_name || p.parent_name || '',
        p.concept || 'Mensualidad',
        this._formatMonth(p.month_paid),
        this.STATUS_LABEL[st] || st,
        Number(p.amount || 0).toFixed(2),
        mora.toFixed(2),
        (Number(p.amount || 0) + mora).toFixed(2),
        p.method || '',
        p.bank || '',
        p.reference || '',
        p.paid_date  ? new Date(p.paid_date).toLocaleDateString('es-ES')            : '',
        p.due_date   ? new Date(p.due_date+'T00:00:00').toLocaleDateString('es-ES')  : '',
        st === 'paid' ? '0' : String(daysLate),
        p.created_at ? new Date(p.created_at).toLocaleDateString('es-ES')           : '',
      ];
    });

    // Resumen al final
    const totalAmt  = list.reduce((s,p) => s + Number(p.amount||0), 0);
    const totalMora = list.reduce((s,p) => s + Number(p.mora_amount || this._calcMoraClient(p.due_date)||0), 0);
    const summary = [
      [],
      ['RESUMEN', '', '', '', '', '', '', '', '', ''],
      ['Total Monto', '', '', '', '', '', '', totalAmt.toFixed(2), totalMora.toFixed(2), (totalAmt+totalMora).toFixed(2)],
      ['Pagados',  list.filter(p=>this._resolveStatus(p)==='paid').length],
      ['Pendientes', list.filter(p=>this._resolveStatus(p)==='pending').length],
      ['Vencidos',  list.filter(p=>this._resolveStatus(p)==='overdue').length],
      ['En Revisión', list.filter(p=>this._resolveStatus(p)==='review').length],
    ];

    const toRow = r => r.map(v => `"${String(v??'').replace(/"/g,'""')}"`).join(',');
    const csv = [
      ...reportHeader.map(toRow),
      toRow(headers),
      ...rows.map(toRow),
      ...summary.map(toRow),
    ].join('\n');

    const dateStr = new Date().toISOString().split('T')[0];
    const fn = opts.filename || `facturas_${sf}_${dateStr}.csv`;
    const blob = new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8;'});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = fn;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return list.length;
  },

  // ─── HELPERS ───────────────────────────────────────────────────────

  _resolveStatus(p) {
    const s = (p.status||'').toLowerCase().trim();
    if (s==='paid')     return 'paid';
    if (s==='review')   return 'review';
    if (s==='rejected') return 'rejected';
    if (p.due_date) {
      const due = new Date(p.due_date+'T00:00:00');
      const now = new Date(); now.setHours(0,0,0,0);
      if (now > due) return 'overdue';
    }
    return 'pending';
  },

  _calcMoraClient(dueDate) {
    if (!dueDate) return 0;
    const due  = new Date(dueDate+'T00:00:00');
    const now  = new Date(); now.setHours(0,0,0,0);
    const days = Math.floor((now-due)/86400000);
    if (days<=0) return 0;
    return (Math.floor(days/7)*500) + ((days%7)*50);
  },

  _formatMonth(mp) {
    if (!mp) return '-';
    const LABELS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const parts  = String(mp).split('-');
    if (parts.length>=2) {
      const m = parseInt(parts[1],10)-1;
      return `${LABELS[m]||mp} ${parts[0]}`;
    }
    return mp;
  },
};
