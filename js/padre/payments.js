/**
 * 💳 Panel Padre — Módulo de Pagos (limpio, sin columnas inexistentes)
 */
import { supabase } from '../shared/supabase.js';
import { AppState, TABLES } from './appState.js';
import { Helpers, escapeHtml } from '../shared/helpers.js';
import { calcMora, getMoraBreakdown, normalizeStatus, daysUntilDue } from '../shared/payment-service.js';
import { emitEvent } from '../shared/supabase.js';
import { SCHOOL_SETTINGS_ID } from '../shared/constants.js';
import { Security } from '../shared/security.js';
import { InvoiceModule } from '../shared/invoice.js';


export const PaymentsModule = {
  _studentId: null,
  _payments:  [],

  async init(studentId) {
    if (!studentId) return;
    this._studentId = studentId;
    const form = document.getElementById('paymentForm');
    if (form) form.onsubmit = (e) => this.submitPaymentProof(e);
    this._initMoraCalculator();
    await this.loadPayments();
  },

  /**
   * 🧮 Mora auto-calculator — sugiere el total con recargo si ya pasó el día 5
   */
  _initMoraCalculator() {
    const amountInput = document.getElementById('paymentAmount');
    const monthSelect = document.getElementById('paymentMonth');
    if (!amountInput || !monthSelect) return;

    const update = () => {
      const hint    = document.getElementById('moraCalculatorHint');
      const baseEl  = document.getElementById('moraBase');
      const moraEl  = document.getElementById('moraAmount');
      const totalEl = document.getElementById('moraTotal');
      const labelEl = document.getElementById('moraLabel');
      if (!hint) return;

      const base     = parseFloat(amountInput.value) || 0;
      const monthVal = monthSelect.value; // YYYY-MM
      if (!base || !monthVal) { hint.classList.add('hidden'); return; }

      // Build due_date: day 5 of the selected month
      const [yr, mo] = monthVal.split('-').map(Number);
      const dueDate  = `${yr}-${String(mo).padStart(2,'0')}-05`;
      const mora     = calcMora(dueDate);
      const breakdown = getMoraBreakdown(dueDate);

      if (mora <= 0) { hint.classList.add('hidden'); return; }

      const fmt = (n) => Number(n).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      if (baseEl)  baseEl.textContent  = fmt(base);
      if (moraEl)  moraEl.textContent  = '+' + fmt(mora);
      if (totalEl) totalEl.textContent = fmt(base + mora);
      if (labelEl && breakdown) labelEl.textContent = `Mora (${breakdown.formattedText}):`;
      hint.classList.remove('hidden');

      // "Aplicar total" button
      const btn = document.getElementById('btnApplyMora');
      if (btn) {
        btn.onclick = () => {
          amountInput.value = (base + mora).toFixed(2);
          hint.classList.add('hidden');
        };
      }
    };

    amountInput.addEventListener('input', update);
    monthSelect.addEventListener('change', update);
    // Run once in case month is pre-selected
    update();
  },

  async loadPayments() {
    const container = document.getElementById('paymentsHistory');
    if (!container) return;

    const today = new Date();
    const isDay25OrLater = today.getDate() >= 25;

    container.innerHTML = Helpers.skeleton(3, 'h-24');
    try {
      const { data, error } = await supabase
        .from(TABLES.PAYMENTS)
        .select('id,student_id,amount,concept,status,due_date,created_at,paid_date,method,month_paid,evidence_url,notes')
        .eq('student_id', this._studentId)
        .order('due_date', { ascending: false });
      if (error) throw error;

      // Deduplicar: por mes — normalizar month_paid a YYYY-MM para comparar
      // Handles both '2026-04' and 'Abril' formats
      const MONTH_MAP = {
        'enero':'01','febrero':'02','marzo':'03','abril':'04','mayo':'05','junio':'06',
        'julio':'07','agosto':'08','septiembre':'09','octubre':'10','noviembre':'11','diciembre':'12'
      };
      const normalizeMonth = (mp) => {
        if (!mp) return '';
        const s = mp.toLowerCase().trim();
        // Already YYYY-MM
        if (/^\d{4}-\d{2}$/.test(s)) return s;
        // Spanish month name — use current year
        const num = MONTH_MAP[s];
        if (num) return `${new Date().getFullYear()}-${num}`;
        return s;
      };

      const statusPriority = { paid: 4, review: 3, overdue: 2, pending: 1 };
      const monthMap = new Map();
      for (const p of data || []) {
        const key = normalizeMonth(p.month_paid);
        const ex  = monthMap.get(key);
        if (!ex) { monthMap.set(key, p); continue; }
        const pPri  = statusPriority[(p.status||'').toLowerCase()] || 0;
        const exPri = statusPriority[(ex.status||'').toLowerCase()] || 0;
        if (pPri > exPri) { monthMap.set(key, p); continue; }
        if (pPri === exPri) {
          if (p.evidence_url && !ex.evidence_url) { monthMap.set(key, p); continue; }
          if (new Date(p.created_at) > new Date(ex.created_at)) monthMap.set(key, p);
        }
      }
      
      // Filter: always show paid, only show pending/overdue if day >= 25
      let allPayments = Array.from(monthMap.values());
      let filteredPayments = allPayments.filter(p => {
        const isPaid = ['paid'].includes((p.status||'').toLowerCase());
        return isPaid || isDay25OrLater;
      });
      
      this._payments = filteredPayments
        .sort((a, b) => {
          // Sort: pending/overdue first (by due_date asc), then paid (by paid_date desc)
          const aIsPaid = ['paid'].includes((a.status||'').toLowerCase());
          const bIsPaid = ['paid'].includes((b.status||'').toLowerCase());
          if (!aIsPaid && !bIsPaid) return new Date(a.due_date||0) - new Date(b.due_date||0);
          if (!aIsPaid) return -1;
          if (!bIsPaid) return 1;
          return new Date(b.paid_date||b.created_at) - new Date(a.paid_date||a.created_at);
        });

      if (!this._payments.length) {
        if (isDay25OrLater) {
          container.innerHTML = Helpers.emptyState('No hay registros de pagos', 'credit-card');
        } else {
          // If no paid payments and not day25+
          container.innerHTML = Helpers.emptyState('No hay pagos registrados aún. Los pagos pendientes se mostrarán a partir del día 25 del mes.', 'lock');
        }
        return;
      }
      this._renderAlertBanner(allPayments);
      container.innerHTML = this._payments.map(p => this._renderCard(p)).join('');

      // Update header stats (always calculate from all payments)
      const paidTotal = allPayments
        .filter(p => ['paid'].includes((p.status||'').toLowerCase()))
        .reduce((s, p) => s + Number(p.amount || 0), 0);
      const el = document.getElementById('paymentsBalance');
      if (el) el.textContent = Helpers.formatCurrency(paidTotal);

      // ── Update Summary Cards ─────────────────────────────────
      this._updateSummaryCards(allPayments);

      // ── Color month grid with payment status ─────────────────
      this._colorMonthGrid(allPayments);

      // ── Expose all payments for wizard filter ─────────────────
      this._allPayments = allPayments;
      this._renderFilteredCards();

      if (window.lucide) lucide.createIcons();
    } catch (err) {
      container.innerHTML = Helpers.emptyState('Error al cargar pagos', 'alert-triangle');
    }
  },

  _renderAlertBanner(payments) {
    const banner = document.getElementById('paymentAlertBanner');
    if (!banner) return;

    const today = new Date();
    const isDay25OrLater = today.getDate() >= 25;
    
    const pending = payments.filter(p => !['paid'].includes((p.status||'').toLowerCase()));
    const totalDebt = pending.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    
    const urgent = pending
      .map(p => ({ ...p, days: daysUntilDue(p.due_date) }))
      .filter(p => p.days !== null)
      .sort((a, b) => a.days - b.days)[0];

    if ((!urgent || !isDay25OrLater) && totalDebt <= 0) {
      // ✅ Mostrar estado al día si no hay pendientes (even before day 25)
      banner.classList.remove('hidden');
      banner.innerHTML = `
        <div class="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-3xl p-5 shadow-lg">
          <div class="flex items-center gap-4">
            <div class="text-2xl shrink-0">✨</div>
            <div class="flex-1 min-w-0">
              <p class="font-black text-white text-base leading-tight">¡Estás al día!</p>
              <p class="text-white/80 text-sm font-medium mt-1 leading-relaxed">No tienes pagos pendientes registrados. ¡Gracias!</p>
            </div>
            <div class="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <i data-lucide="check" class="w-5 h-5 text-white"></i>
            </div>
          </div>
        </div>`;
      if (window.lucide) lucide.createIcons();
      return;
    }
    
    // If before day25, hide the alert for pending payments
    if (!isDay25OrLater) {
      banner.classList.add('hidden');
      return;
    }

    const days   = urgent?.days ?? 0;
    const amount = Helpers.formatCurrency(totalDebt);
    const month  = urgent?.month_paid || 'tus mensualidades';
    let cfg;

    if (days < 0) {
      const mora = calcMora(urgent.due_date);
      cfg = {
        bg: 'bg-gradient-to-r from-rose-500 to-red-600',
        icon: '🚨',
        title: `Pagos pendientes — ${amount}`,
        msg: `Tienes ${pending.length} pago(s) pendiente(s). ${month} venció hace ${Math.abs(days)} días.`,
        btn: 'Pagar ahora', btnCls: 'bg-white text-rose-600'
      };
    } else if (days === 0) {
      cfg = {
        bg: 'bg-gradient-to-r from-orange-500 to-amber-500',
        icon: '⏰',
        title: `Hoy vence un pago — ${amount}`,
        msg: `Último día para pagar ${month} sin recargos.`,
        btn: 'Enviar comprobante', btnCls: 'bg-white text-orange-600'
      };
    } else if (days <= 3) {
      cfg = {
        bg: 'bg-gradient-to-r from-amber-400 to-yellow-500',
        icon: '📅',
        title: `Próximo vencimiento — ${amount}`,
        msg: `${month} vence en ${days} días. Evita recargos pagando a tiempo.`,
        btn: 'Pagar a tiempo', btnCls: 'bg-white text-amber-700'
      };
    } else if (days <= 7 || totalDebt > 0) {
      cfg = {
        bg: 'bg-gradient-to-r from-blue-500 to-indigo-500',
        icon: '💡',
        title: `Saldo pendiente — ${amount}`,
        msg: `Recuerda realizar tu pago de ${month} antes de su vencimiento.`,
        btn: 'Ver detalles', btnCls: 'bg-white text-blue-700'
      };
    } else {
      banner.classList.add('hidden');
      return;
    }

    banner.classList.remove('hidden');
    banner.innerHTML = `
      <div class="${cfg.bg} rounded-2xl p-4 shadow-lg overflow-hidden">
        <div class="flex items-start gap-3">
          <div class="text-xl shrink-0 mt-0.5">${cfg.icon}</div>
          <div class="flex-1 min-w-0 overflow-hidden">
            <p class="font-black text-white text-sm leading-tight truncate">${cfg.title}</p>
            <p class="text-white/80 text-xs font-medium mt-1 leading-relaxed break-words">${cfg.msg}</p>
            <button onclick="document.getElementById('paymentForm')?.scrollIntoView({behavior:'smooth'})"
              class="${cfg.btnCls} font-black text-xs px-4 py-2 rounded-xl mt-3 inline-block active:scale-95 transition-transform whitespace-nowrap">
              ${cfg.btn}
            </button>
          </div>
        </div>
      </div>`;
  },

  _renderCard(p) {
    const status   = normalizeStatus(p);
    const isPaid   = status === 'paid';
    const amount   = Number(p.amount || 0);
    const mora     = isPaid ? 0 : calcMora(p.due_date);
    const moraInfo = isPaid ? null : getMoraBreakdown(p.due_date);
    const total    = amount + mora;
    const days     = daysUntilDue(p.due_date);

    const SC = {
      paid:      { label: 'Aprobado',    cls: 'bg-emerald-100 text-emerald-700', icon: 'check-circle',   border: '' },
      review:    { label: 'En Revisión', cls: 'bg-blue-100 text-blue-700',       icon: 'clock',          border: '' },
      overdue:   { label: 'Vencido',     cls: 'bg-rose-100 text-rose-700',       icon: 'alert-triangle', border: 'border-l-4 border-l-rose-500' },
      rechazado: { label: 'Rechazado',   cls: 'bg-rose-100 text-rose-700',       icon: 'x-circle',       border: 'border-l-4 border-l-rose-400' },
      pending:   { label: 'Pendiente',   cls: 'bg-amber-100 text-amber-700',     icon: 'alert-circle',   border: '' }
    };
    const sc = SC[status] || SC.pending;

    let urgencyBadge = '';
    if (!isPaid && days !== null) {
      if (days < 0)        urgencyBadge = `<span class="text-[9px] font-black text-rose-600 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded-full">${Math.abs(days)}d vencido</span>`;
      else if (days === 0) urgencyBadge = `<span class="text-[9px] font-black text-orange-600 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded-full">vence hoy</span>`;
      else if (days <= 3)  urgencyBadge = `<span class="text-[9px] font-black text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">vence en ${days}d</span>`;
    }

    // Map concept to readable label
    const conceptLabels = {
      mensualidad: 'Mensualidad',
      uniforme: 'Uniforme',
      libros: 'Libros',
      materiales: 'Materiales',
      inscripcion: 'Inscripción',
      reinscripcion: 'Reinscripción',
      otro: 'Otro'
    };
    const conceptLabel = conceptLabels[p.concept] || p.concept || 'Mensualidad';

    return `
      <div class="bg-white rounded-3xl border border-slate-100 overflow-hidden ${sc.border} mb-3 ${isPaid ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all active:scale-[0.99]' : ''}"
        ${isPaid ? `onclick="PaymentsModule.openReceipt('${p.id}')"` : ''}>
        <div class="p-5">
          <div class="flex justify-between items-start gap-3">
            <div class="flex items-center gap-3 min-w-0">
              <div class="w-11 h-11 rounded-2xl ${mora > 0 ? 'bg-rose-50 text-rose-500' : (isPaid ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600')} flex items-center justify-center text-xl shrink-0">
                ${mora > 0 ? '⚠️' : (isPaid ? '✅' : (p.method === 'transferencia' ? '🏦' : '💵'))}
              </div>
              <div class="min-w-0">
                <p class="font-black text-slate-800 text-sm truncate">${escapeHtml(p.month_paid || 'Colegiatura')} · ${escapeHtml(conceptLabel)}</p>
                <div class="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span class="text-[9px] font-bold text-slate-400 uppercase">${Helpers.formatDate(p.created_at)}</span>
                  ${p.bank ? `<span class="text-[9px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full">🏦 ${escapeHtml(p.bank)}</span>` : ''}
                  ${urgencyBadge}
                </div>
                ${p.due_date && !isPaid ? `<p class="text-[9px] font-black uppercase mt-0.5 ${mora > 0 ? 'text-rose-500' : 'text-slate-400'}">Vence: ${new Date(p.due_date + 'T00:00:00').toLocaleDateString('es-DO')}</p>` : ''}
              </div>
            </div>
            <div class="text-right shrink-0">
              <p class="font-black text-slate-900 text-lg leading-none">${Helpers.formatCurrency(isPaid ? amount : total)}</p>
              <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase mt-1 ${sc.cls}">
                <i data-lucide="${sc.icon}" class="w-4 h-4"></i>${sc.label}
              </span>
              ${isPaid ? `<p class="text-[9px] text-emerald-600 font-bold mt-1 flex items-center justify-end gap-0.5"><i data-lucide="download" class="w-4 h-4"></i> Ver recibo</p>` : ''}
            </div>
          </div>
          
          ${p.proof_url ? `
          <div class="mt-3 pt-3 border-t border-slate-50 flex items-center justify-between">
            <p class="text-[10px] font-bold text-slate-400 italic">Comprobante fiscal adjunto</p>
            <a href="${Security.safeUrl(p.proof_url)}" target="_blank" rel="noopener noreferrer" class="text-[10px] font-black text-indigo-600 hover:underline flex items-center gap-1">Ver <i data-lucide="external-link" class="w-4 h-4"></i></a>
          </div>` : ''}

          ${moraInfo ? `
          <div class="mt-3 p-3 bg-rose-50 rounded-2xl border border-rose-100">
            <div class="flex justify-between items-center">
              <span class="text-[10px] font-black text-rose-700 uppercase">Recargo por mora (${moraInfo.formattedText})</span>
              <span class="text-xs font-black text-rose-700">+${Helpers.formatCurrency(mora)}</span>
            </div>
            <div class="flex justify-between items-center mt-1 pt-1 border-t border-rose-200/50">
              <span class="text-[10px] font-black text-slate-500 uppercase">Monto base</span>
              <span class="text-xs font-bold text-slate-500">${Helpers.formatCurrency(amount)}</span>
            </div>
          </div>` : ''}

          ${p.evidence_url && !isPaid ? `
          <div class="mt-3 pt-3 border-t border-slate-50 flex justify-between items-center">
            <p class="text-[10px] font-bold text-slate-400 italic">Comprobante enviado. Esperando validación.</p>
            <a href="${Security.safeUrl(p.evidence_url)}" target="_blank" rel="noopener noreferrer" class="text-[10px] font-black text-blue-600 hover:underline flex items-center gap-1">Ver <i data-lucide="external-link" class="w-4 h-4"></i></a>
          </div>` : ''}
        </div>
      </div>`;
  },

  /**
   * 🧾 openReceipt — Modal de recibo PDF para pagos aprobados
   * Usa el InvoiceModule compartido para un diseño uniforme
   */
  async openReceipt(paymentId) {
    // Buscar en cache local primero
    const cached = this._payments?.find(x => String(x.id) === String(paymentId));
    let p = cached || { id: paymentId };

    // Obtener datos frescos del pago con info del estudiante y quien aprobó
    let payment = p;
    try {
      const { data } = await supabase
        .from('payments')
        .select(`
          id, amount, concept, status, month_paid, due_date, paid_date,
          method, bank, reference, notes,
          validated_by,
          students:student_id (
            name, p1_name, p1_email, p2_name, photo_url,
            classrooms:classroom_id ( name )
          )
        `)
        .eq('id', p.id)
        .maybeSingle();
      if (data) payment = data;
    } catch (_) {}

    // Obtener nombre de quien aprobó y datos del colegio
    let approvedBy = 'Administración';
    let schoolSettings = {};
    if (payment.validated_by) {
      try {
        const { data: approver } = await supabase
          .from('profiles')
          .select('name, role')
          .eq('id', payment.validated_by)
          .maybeSingle();
        if (approver?.name) approvedBy = approver.name;
      } catch (_) {}
    }
    try {
      const { data: settings } = await supabase
        .from('school_settings')
        .select('*')
        .eq('id', SCHOOL_SETTINGS_ID)
        .maybeSingle();
      if (settings) schoolSettings = settings;
    } catch (_) {}

    const student = payment.students || {};
    
    // Build data object for InvoiceModule
    const invoiceData = {
      invoice: {
        id: payment.id,
        invoice_number: `KK-${String(payment.id).slice(-6).toUpperCase().padStart(6,'0')}`,
        amount: Number(payment.amount || 0),
        concept: payment.concept || payment.month_paid || 'Mensualidad',
        status: payment.status || 'paid',
        payment_date: payment.paid_date,
        period: payment.month_paid || '',
        attended_by: approvedBy
      },
      student: {
        name: student.name || 'Estudiante',
        p1_name: student.p1_name || 'Padre/Tutor',
        p1_email: student.p1_email || '',
        classroom: student.classrooms?.name || 'Sin aula',
        photo_url: student.photo_url || ''
      },
      payment: {
        method: payment.method || 'efectivo',
        bank: payment.bank || '',
        reference: payment.reference || '',
        paid_date: payment.paid_date
      },
      school: schoolSettings
    };

    // Make InvoiceModule available globally if not already (for modal actions)
    if (!window.InvoiceModule) {
      window.InvoiceModule = InvoiceModule;
    }

    // Open the professional invoice modal
    InvoiceModule.openInvoiceModal(invoiceData);
  },

  /**
   * 📄 Genera y descarga el recibo como PDF usando jsPDF
   */
  async _downloadReceiptPDF(data) {
    const btn = document.getElementById('btnDownloadPDF');
    if (btn) { btn.textContent = '⏳ Generando...'; btn.disabled = true; }

    try {
      // Cargar jsPDF si no está disponible
      if (!window.jspdf) {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'js/shared/jspdf.min.js';
          s.onload = resolve; s.onerror = reject;
          document.head.appendChild(s);
        });
      }

      const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' });
        const W = doc.internal.pageSize.getWidth();

        // ── Header azul Colegio Montessori ──────────────────────────────────────────
        doc.setFillColor(11, 99, 199);
        doc.roundedRect(0, 0, W, 44, 0, 0, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.text('Colegio Montessori Sonrisas Creativas', W / 2, 16, { align: 'center' });
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text('RECIBO DE PAGO OFICIAL', W / 2, 23, { align: 'center' });
        doc.setFontSize(10);
        doc.setFont('courier', 'bold');
        doc.text(data.receiptNo, W / 2, 34, { align: 'center' });

        // ── Sello aprobado azul ────────────────────────────────────────
        doc.setFillColor(239, 246, 255);
        doc.rect(0, 44, W, 18, 'F');
        doc.setTextColor(30, 64, 175);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text('Pago Confirmado y Aprobado', 14, 54);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text(`Aprobado por: ${data.approvedBy}`, 14, 60);

        // ── Datos del estudiante ──────────────────────────────────
        let y = 72;
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(10, y - 5, W - 20, 38, 3, 3, 'F');
        doc.setTextColor(148, 163, 184);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.text('DATOS DEL ESTUDIANTE', 14, y);
        y += 6;

        const col2 = W / 2 + 2;
        const infoRows = [
          ['Estudiante', data.studentName, 'Aula', data.classroom],
          ['Padre/Tutor', data.parentName, 'Fecha de Pago', data.paidDate]
        ];
        doc.setFontSize(8);
        for (const [l1, v1, l2, v2] of infoRows) {
          doc.setTextColor(100, 116, 139); doc.setFont('helvetica', 'normal');
          doc.text(l1, 14, y); doc.text(l2, col2, y);
          doc.setTextColor(30, 41, 59); doc.setFont('helvetica', 'bold');
          doc.text(String(v1), 14, y + 4); doc.text(String(v2), col2, y + 4);
          y += 11;
        }

        // ── Detalle del pago ──────────────────────────────────────
        y += 2;
        doc.setTextColor(148, 163, 184);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.text('DETALLE DEL PAGO', 14, y);
        y += 6;

        const detailRows = [
          ['Concepto', data.monthPaid],
          ['Método de Pago', data.method],
          ...(data.bank ? [['Banco', data.bank]] : []),
          ...(data.reference ? [['Referencia', data.reference]] : []),
          ...(data.fiscal_receipt ? [['Comprobante Fiscal', data.fiscal_receipt]] : [])
        ];

        doc.setFontSize(9);
        for (const [label, value] of detailRows) {
          doc.setTextColor(100, 116, 139); doc.setFont('helvetica', 'normal');
          doc.text(label, 14, y);
          doc.setTextColor(30, 41, 59); doc.setFont('helvetica', 'bold');
          doc.text(String(value), W - 14, y, { align: 'right' });
          doc.setDrawColor(241, 245, 249);
          doc.line(14, y + 2, W - 14, y + 2);
          y += 9;
        }

        // Total row azul
        doc.setFillColor(239, 246, 255);
        doc.roundedRect(10, y - 4, W - 20, 12, 2, 2, 'F');
        doc.setTextColor(11, 99, 199);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('TOTAL PAGADO', 14, y + 4);
        doc.text(data.amountFmt, W - 14, y + 4, { align: 'right' });
        y += 18;

        // ── Comprobante Fiscal ──────────────────────────────────────
        doc.setFillColor(255, 251, 235);
        const fiscalHeight = data.rnc ? 22 : 14;
        doc.roundedRect(10, y, W - 20, fiscalHeight, 3, 3, 'F');
        doc.setTextColor(161, 98, 7);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.text('COMPROBANTE FISCAL', W / 2, y + 5, { align: 'center' });
        if (data.rnc) {
          doc.setFontSize(9);
          doc.text(`RNC: ${data.rnc}`, W / 2, y + 12, { align: 'center' });
          doc.setFontSize(7);
          doc.setFont('helvetica', 'normal');
          doc.text('Este documento es válido para declaraciones tributarias', W / 2, y + 17, { align: 'center' });
        } else {
          doc.setFont('helvetica', 'normal');
          doc.text('Este documento es válido para declaraciones tributarias', W / 2, y + 10, { align: 'center' });
        }
        y += fiscalHeight + 4;

        // ── Footer ────────────────────────────────────────────────
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(10, y, W - 20, 22, 3, 3, 'F');
        doc.setTextColor(148, 163, 184);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.text('San Cristóbal, República Dominicana', W / 2, y + 7, { align: 'center' });
        doc.text('Este recibo es un comprobante oficial de pago de Colegio Montessori Sonrisas Creativas.', W / 2, y + 12, { align: 'center' });
        doc.setFont('courier', 'normal');
        doc.text(`ID: ${data.receiptNo} · ${new Date().toLocaleDateString('es-DO')}`, W / 2, y + 17, { align: 'center' });

      doc.save(`Recibo-${data.receiptNo}.pdf`);
      Helpers.toast('Recibo descargado', 'success');
    } catch (err) {
      // PDF generation failed
      Helpers.toast('Error al generar PDF', 'error');
    } finally {
      if (btn) { btn.textContent = '📥 Descargar PDF'; btn.disabled = false; }
    }
  },

  async submitPaymentProof(e) {
    if (e && e.preventDefault) e.preventDefault();
    
    const student = AppState.get('currentStudent');
    if (!student) return;

    // Rate limit: máx 3 comprobantes por hora
    const { checkRateLimit, paymentProofLimiter } = await import('../shared/rate-limiter.js');
    if (!checkRateLimit(paymentProofLimiter, 'enviar comprobantes')) return;

    const fileInput = document.getElementById('paymentFileInput');
    const file   = fileInput?.files[0];
    const fiscalInput = document.getElementById('paymentFiscalInput');
    const fiscalFile = fiscalInput?.files[0];
    const amount = parseFloat(document.getElementById('paymentAmount')?.value || '0');
    const selectedMonths = Array.from(document.getElementById('paymentMonth')?.selectedOptions || []).map(opt => opt.value);
    const concept = document.getElementById('paymentConcept')?.value || 'mensualidad';
    const method = document.getElementById('paymentMethod')?.value || 'transferencia';
    const bank   = document.getElementById('paymentBank')?.value?.trim() || null;

    if (!file)   { Helpers.toast('Adjunta el comprobante de transferencia', 'warning'); return; }
    if (!amount || amount <= 0 || amount > 99999) { Helpers.toast('Ingresa un monto válido (mayor a 0)', 'warning'); return; }
    if (!selectedMonths.length) { Helpers.toast('Selecciona al menos un mes', 'warning'); return; }
    if (!bank)   { Helpers.toast('Selecciona el banco de origen', 'warning'); return; }
    
    if (file.size > 5 * 1024 * 1024) { Helpers.toast('Archivo muy grande (max 5MB)', 'error'); return; }
    if (!['image/jpeg','image/png','image/webp','application/pdf'].includes(file.type)) {
      Helpers.toast('Formato no permitido para comprobante (JPG, PNG, PDF)', 'error'); return;
    }
    if (fiscalFile && fiscalFile.size > 5 * 1024 * 1024) {
      Helpers.toast('Comprobante fiscal muy grande (max 5MB)', 'error'); return;
    }

    const btn = document.getElementById('btnSubmitPayment');
    if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }

    // Barra de progreso visual
    const progressWrap = document.createElement('div');
    progressWrap.id = 'payment-upload-progress';
    progressWrap.className = 'mt-3 w-full bg-slate-100 rounded-full h-2 overflow-hidden';
    progressWrap.innerHTML = '<div id="payment-progress-fill" class="h-full bg-green-500 rounded-full transition-all duration-300" style="width:5%"></div>';
    btn?.parentElement?.insertBefore(progressWrap, btn.nextSibling);
    const setP = (p) => { const f = document.getElementById('payment-progress-fill'); if(f) f.style.width = p + '%'; };

    try {
      Helpers.toast('Subiendo comprobantes...', 'info');
      const ext  = file.name.split('.').pop().toLowerCase();
      const path = `payments/${student.id}_${Date.now()}.${ext}`;
      let uploadFile = file;
      
      // Comprimir imagen si es necesario
      if (file.type.startsWith('image/')) {
        try {
          const { ImageLoader } = await import('../shared/image-loader.js');
          uploadFile = await ImageLoader.compress(file, { maxWidth: 1000, maxHeight: 1000, quality: 0.8, maxSizeKB: 400 });
        } catch (err) {
            // Compression failed — upload original
        }
      }

      setP(20);
      const { error: upErr } = await supabase.storage.from('classroom_media').upload(path, uploadFile, {
        onUploadProgress: (progress) => {
          const percent = Math.round((progress.loaded / progress.total) * 100);
          setP(percent);
        }
      });
      if (upErr) throw upErr;
      
      setP(60);
      const { data: { publicUrl } } = supabase.storage.from('classroom_media').getPublicUrl(path);
      
      // Upload fiscal receipt if provided
      let fiscalUrl = null;
      if (fiscalFile) {
        const fiscalExt  = fiscalFile.name.split('.').pop().toLowerCase();
        const fiscalPath = `payments/fiscal_${student.id}_${Date.now()}.${fiscalExt}`;
        
        let uploadFiscal = fiscalFile;
        if (fiscalFile.type.startsWith('image/')) {
          try {
            const { ImageLoader } = await import('../shared/image-loader.js');
            uploadFiscal = await ImageLoader.compress(fiscalFile, { maxWidth: 1000, maxHeight: 1000, quality: 0.8, maxSizeKB: 400 });
          } catch (err) {
            // Fiscal compression failed — upload original
          }
        }
        
        const { error: fiscalUpErr } = await supabase.storage.from('classroom_media').upload(fiscalPath, uploadFiscal);
        if (fiscalUpErr) {
          // Fiscal receipt upload failed — non-critical
        } else {
          const { data: { publicUrl: puFiscal } } = supabase.storage.from('classroom_media').getPublicUrl(fiscalPath);
          fiscalUrl = puFiscal;
        }
      }

      setP(85);

      // Insert a payment record for each selected month
      for (const month of selectedMonths) {
        const { error: insertErr } = await supabase.from(TABLES.PAYMENTS).insert({
          student_id: student.id, 
          amount, 
          month_paid: month,
          concept,
          method, 
          bank, 
          evidence_url: publicUrl, 
          proof_url: fiscalUrl,
          status: 'review',
          created_at: new Date().toISOString()
        });
        if (insertErr) throw insertErr;
      }
      
      this._showSuccessConfirmation(amount, selectedMonths.join(', '), bank);
      setP(100);

      // ✅ ÉXITO: Confetti
      if (window.confetti) {
        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#10b981', '#3b82f6', '#f59e0b']
        });
      }
      
      setTimeout(() => {
        document.getElementById('payment-upload-progress')?.remove();
      }, 1500);
      
      const form = document.getElementById('paymentForm');
      if (form) form.reset();
      
      // Forzar recarga de datos en AppState y UI
      await this.loadPayments();
      
      // Notificar al staff en tiempo real
      emitEvent('payment.receipt_uploaded', {
        student_id:   student.id,
        student_name: student.name,
        amount:       amount.toFixed(2),
        months:       selectedMonths,
        concept
      }).catch(() => {});

    } catch (err) {
      // Payment proof submit failed
      document.getElementById('payment-upload-progress')?.remove();
      Helpers.toast('Error al enviar: ' + (err.message || 'Error desconocido'), 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Enviar Comprobante'; }
    }
  },

  _showSuccessConfirmation(amount, month, bank = '') {
    const container = document.getElementById('paymentsHistory');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-4 mb-4 flex items-center gap-3';
    el.innerHTML = `<div class="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-white text-xl shrink-0">✅</div>
      <div>
        <p class="font-black text-emerald-800 text-sm">Comprobante enviado correctamente</p>
        <p class="text-[10px] font-bold text-emerald-600 uppercase">${Helpers.formatCurrency(amount)} · ${month}${bank ? ' · ' + bank : ''} · En revisión</p>
      </div>`;
    container.insertBefore(el, container.firstChild);
    setTimeout(() => { el.style.opacity='0'; el.style.transition='opacity 0.4s'; setTimeout(()=>el.remove(),400); }, 8000);
  },

  _compressImage(file, maxWidth=800, quality=0.8) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          blob => blob ? resolve(new File([blob], file.name, {type:'image/jpeg'})) : reject(new Error('Compresión fallida')),
          'image/jpeg', quality
        );
      };
      img.onerror = reject;
      img.src = url;
    });
  },

  // ── Summary Cards Update ───────────────────────────────────
  _updateSummaryCards(allPayments) {
    const paid = allPayments.filter(p => ['paid'].includes((p.status||'').toLowerCase()));
    const review = allPayments.filter(p => ['review'].includes((p.status||'').toLowerCase()));
    const pending = allPayments.filter(p => !['paid','review'].includes((p.status||'').toLowerCase()));

    const paidTotal = paid.reduce((s, p) => s + Number(p.amount || 0), 0);
    const reviewTotal = review.reduce((s, p) => s + Number(p.amount || 0), 0);

    const paidEl = document.getElementById('paymentSummaryPaid');
    const reviewEl = document.getElementById('paymentSummaryReview');
    const pendingEl = document.getElementById('paymentSummaryPending');
    const nextEl = document.getElementById('paymentSummaryNext');

    if (paidEl) paidEl.textContent = Helpers.formatCurrency(paidTotal);
    if (reviewEl) reviewEl.textContent = Helpers.formatCurrency(reviewTotal);
    if (pendingEl) pendingEl.textContent = pending.length;

    // Find next upcoming payment
    if (nextEl) {
      const upcoming = pending
        .filter(p => p.due_date)
        .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))[0];
      if (upcoming) {
        const d = new Date(upcoming.due_date + 'T00:00:00');
        nextEl.textContent = d.toLocaleDateString('es-DO', { day: 'numeric', month: 'short' });
      } else {
        nextEl.textContent = '—';
      }
    }
  },

  // ── Color Month Grid by Payment Status ─────────────────────
  _colorMonthGrid(allPayments) {
    const grid = document.getElementById('monthButtonGrid');
    if (!grid) return;

    const statusMap = {};
    for (const p of allPayments) {
      const mp = p.month_paid;
      if (!mp) continue;
      const key = mp.length === 7 ? mp : mp;
      const status = (p.status || '').toLowerCase();
      const existing = statusMap[key];
      const priority = { paid: 3, review: 2, overdue: 1, pending: 0 };
      if (!existing || (priority[status] || 0) > (priority[existing] || 0)) {
        statusMap[key] = status;
      }
    }

    grid.querySelectorAll('.month-btn').forEach(btn => {
      const val = btn.dataset.val;
      const status = statusMap[val];
      if (status === 'paid') {
        btn.className = 'month-btn py-2 text-[11px] font-black rounded-xl border-2 border-[#28B54D] bg-[#E8FFF0] text-[#28B54D] transition-all active:scale-95';
      } else if (status === 'review') {
        btn.className = 'month-btn py-2 text-[11px] font-black rounded-xl border-2 border-[#FF7A00] bg-[#FFF0E0] text-[#FF7A00] transition-all active:scale-95';
      } else if (status === 'overdue') {
        btn.className = 'month-btn py-2 text-[11px] font-black rounded-xl border-2 border-[#EF4444] bg-[#FFE8E8] text-[#EF4444] transition-all active:scale-95';
      }
    });
  },

  // ── Render filtered payment cards ──────────────────────────
  _renderFilteredCards() {
    const container = document.getElementById('paymentsHistory');
    if (!container || !this._allPayments) return;

    const showPendingOnly = window.WizardPayment?._filterPending;
    let filtered = this._allPayments;

    if (showPendingOnly) {
      filtered = this._allPayments.filter(p => !['paid'].includes((p.status||'').toLowerCase()));
    }

    if (!filtered.length) {
      container.innerHTML = Helpers.emptyState(
        showPendingOnly ? 'No tienes pagos pendientes' : 'No hay registros de pagos',
        showPendingOnly ? 'check-circle' : 'credit-card'
      );
      return;
    }

    // Render with timeline for recent ones
    const now = Date.now();
    container.innerHTML = filtered.map(p => this._renderCard(p)).join('');
    if (window.lucide) lucide.createIcons();
  }
};

window.PaymentsModule = PaymentsModule;
