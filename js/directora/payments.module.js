import { DirectorApi } from './api.js';
import { Helpers } from '../shared/helpers.js';
import { Security } from '../shared/security.js';
import { UIHelpers } from './ui.module.js';
import { supabase } from '../shared/supabase.js';
import { auditLog } from '../shared/db-utils.js';
import { RealtimeManager } from '../shared/realtime-manager.js';
import { InvoicingModule } from './invoicing.module.js';
import { InvoiceModule } from '../shared/invoice.js';

const MES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const MES_LABEL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

export const PaymentsModule = {
  settings: { due_day: 5, generation_day: 25 },
  _chart: null,
  _ready: false,
  _realtimeSubscribed: false,

  async init() {
    this._initSelectors();
    await this._loadSettings();
    if (!this._ready) {
      this._ready = true;
      const on = (id, ev, fn) => document.getElementById(id)?.addEventListener(ev, fn);
      on('btnRefreshPayments',     'click',  () => this.loadPayments());
      on('filterPaymentMonth',     'change', () => this.loadPayments());
      on('filterPaymentYear',      'change', () => this.loadPayments());
      on('filterPaymentStatus',    'change', () => this.loadPayments());
      on('searchPaymentStudent',   'input',  () => this.loadPayments());
      on('btnNewPaymentAction',    'click',  () => this.openPaymentModal());
      on('btnNewPayment',          'click',  () => this.openPaymentModal());
      on('btnGenerateCharges',     'click',  () => this.runCycle());
      on('btnGeneratePaymentsNow', 'click', () => this.runCycle());
      on('btnGenerateSpecificMonth', 'click', () => this.openGenerateSpecificMonthModal());
      on('btnSavePaymentConfig',   'click',  () => this.savePaymentConfig());
      on('btnSendPaymentReminders','click',  () => this.sendReminders());
      on('btnExportInvoices',      'click',  () => this._openExportModal());
      on('btnExportMorosidad',     'click',  () => this.exportMorosidad());
      on('btnPendingTransfers',    'click',  () => this._filterPendingTransfers());
    }
    
    // ✅ Suscribirse a cambios en tiempo real
    if (!this._realtimeSubscribed) {
      this._subscribeRealtime();
    }
    
    await this.loadPayments();
  },

  _subscribeRealtime() {
    this._realtimeSubscribed = true;
    
    RealtimeManager.subscribe('directora-payments', (channel) => {
      channel
        .on('postgres_changes', 
          { event: '*', schema: 'public', table: 'payments' },
          () => {
            // Actualizar automáticamente cuando haya cambios en pagos
            this.loadPayments();
            this.loadStats();
          }
        );
    });
  },

  _initSelectors() {
    const now = new Date();
    const ms = document.getElementById('filterPaymentMonth');
    const ys = document.getElementById('filterPaymentYear');
    if (ms && !ms.querySelector('option[value="all"]')) {
      const o = document.createElement('option');
      o.value = 'all'; o.textContent = 'Todos los meses';
      ms.insertBefore(o, ms.firstChild);
    }
    if (ms) ms.value = String(now.getMonth() + 1).padStart(2, '0');
    if (ys) {
      const cy = now.getFullYear();
      ys.innerHTML = '';
      for (let y = cy + 1; y >= cy - 3; y--) {
        const o = document.createElement('option');
        o.value = String(y); o.textContent = String(y);
        if (y === cy) o.selected = true;
        ys.appendChild(o);
      }
    }
  },

  async _loadSettings() {
    try {
      const { data } = await DirectorApi.getSchoolSettings();
      if (!data) return;
      this.settings.generation_day = data.generation_day || 25;
      this.settings.due_day = data.due_day || 5;
      const g = document.getElementById('confGenDay');
      const d = document.getElementById('confDueDay');
      if (g) g.value = this.settings.generation_day;
      if (d) d.value = this.settings.due_day;
    } catch (_) {}
  },

  filterBy(status) {
    const sel = document.getElementById('filterPaymentStatus');
    if (sel) { sel.value = status; this.loadPayments(); }
  },

  async loadPayments() {
    const tbody = document.getElementById('paymentsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8" class="text-center py-10"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0B63C7] mx-auto mb-2"></div><p class="text-xs text-slate-400">Cargando pagos...</p></td></tr>';
    this.loadStats();
    this.loadIncomeChart();
    try {
      const mv = document.getElementById('filterPaymentMonth')?.value;
      const yv = document.getElementById('filterPaymentYear')?.value || String(new Date().getFullYear());
      const sf = document.getElementById('filterPaymentStatus')?.value;
      const sq = (document.getElementById('searchPaymentStudent')?.value || '').trim().toLowerCase();

      // Query simple sin joins complejos
      let q = supabase
        .from('payments')
        .select('id, student_id, amount, concept, status, due_date, created_at, paid_date, method, bank, reference, month_paid, evidence_url, proof_url')
        .order('created_at', { ascending: false })
        .limit(500);

      // Filter by year — solo aplica cuando NO hay mes específico seleccionado
      if (!mv || mv === 'all') {
        const yStart = yv + '-01-01';
        const yEnd   = yv + '-12-31';
        q = q.gte('created_at', yStart + 'T00:00:00')
             .lte('created_at', yEnd   + 'T23:59:59');
      }

      // Filter by month — usa month_paid directamente (formato YYYY-MM)
      if (mv && mv !== 'all') {
        const monthKey = yv + '-' + String(parseInt(mv, 10)).padStart(2, '0');
        q = q.eq('month_paid', monthKey);
      }
      
      // Filter by status
      if (sf && sf !== 'all') q = q.eq('status', sf);

      const { data: payments, error } = await q;
      if (error) throw error;

      let allData = payments || [];

      // Enriquecer con nombres de estudiantes en queries separadas
      if (allData.length > 0) {
        const sids = [...new Set(allData.map(p => p.student_id).filter(Boolean))];
        const { data: students } = await supabase.from('students').select('id, name, classroom_id').in('id', sids);
        const cids = [...new Set((students || []).map(s => s.classroom_id).filter(Boolean))];
        const roomMap = {};
        if (cids.length) {
          const { data: rooms } = await supabase.from('classrooms').select('id, name').in('id', cids);
          (rooms || []).forEach(r => { roomMap[r.id] = r.name; });
        }
        const stMap = {};
        (students || []).forEach(s => { stMap[s.id] = { name: s.name, aula: roomMap[s.classroom_id] || 'Sin aula' }; });
        allData = allData.map(p => ({
          ...p,
          students: stMap[p.student_id]
            ? { name: stMap[p.student_id].name, classrooms: { name: stMap[p.student_id].aula } }
            : { name: 'Desconocido', classrooms: { name: '-' } }
        }));
      }

      // Deduplicar por estudiante+mes
      const umap = new Map();
      allData.forEach(p => {
        let nm = p.month_paid || '';
        if (nm && !nm.includes('-')) {
          const idx = MES.indexOf(nm.toLowerCase());
          if (idx !== -1) nm = yv + '-' + String(idx + 1).padStart(2, '0');
        }
        const k = p.student_id + '-' + nm.toLowerCase();
        const ex = umap.get(k);
        if (!ex) { umap.set(k, p); return; }
        const pri = { paid: 4, review: 3, pending: 2, overdue: 1 };
        const ps = (pri[p.status] || 0) + ((p.evidence_url || p.proof_url) ? 10 : 0);
        const es = (pri[ex.status] || 0) + ((ex.evidence_url || ex.proof_url) ? 10 : 0);
        if (ps > es) umap.set(k, p);
      });

      let list = Array.from(umap.values());
      if (sq) list = list.filter(p => (p.students?.name || '').toLowerCase().includes(sq));

      if (!list.length) {
        const label = (!mv || mv === 'all') ? 'el año ' + yv : MES_LABEL[parseInt(mv, 10) - 1] + ' ' + yv;
        tbody.innerHTML = '<tr><td colspan="8" class="text-center py-16"><div class="flex flex-col items-center gap-3"><div class="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center"><i data-lucide="inbox" class="w-7 h-7 text-slate-400"></i></div><p class="font-bold text-slate-500">Sin registros para ' + label + '</p></div></td></tr>';
        if (window.lucide) lucide.createIcons();
        return;
      }

      const pri = { overdue: 1, pending: 2, review: 3, paid: 4 };
      list.sort((a, b) => (pri[this._st(a)] || 99) - (pri[this._st(b)] || 99));
      this._lastList = list; // caché para exportación
      tbody.innerHTML = list.map(p => this._row(p)).join('');
      const rc = list.filter(p => this._st(p) === 'review').length;
      if (window.BadgeSystem) BadgeSystem.setCount('pagos', rc);
      if (window.lucide) lucide.createIcons();
    } catch (e) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center py-8">' + Helpers.errorState('Error al cargar pagos') + '</td></tr>';
      if (window.lucide) lucide.createIcons();
    }
  },

  _st(p) {
    if (p.status === 'paid') return 'paid';
    if (p.status === 'review' || (p.status === 'pending' && p.method === 'transferencia')) return 'review';
    const t = new Date(); t.setHours(0,0,0,0);
    const d = p.due_date ? new Date(p.due_date + 'T00:00:00') : null;
    if (!d) return 'pending';
    return t > d ? 'overdue' : 'pending';
  },

  _row(p) {
    const sk  = this._st(p);
    const sm  = {
      paid:    { l: 'Aprobado',     c: 'bg-emerald-100 text-emerald-700', i: 'check-circle' },
      pending: { l: 'Pendiente',    c: 'bg-amber-100 text-amber-700',     i: 'clock' },
      review:  { l: 'En Revision',  c: 'bg-blue-100 text-blue-700',       i: 'file-search' },
      overdue: { l: 'Vencido',      c: 'bg-rose-100 text-rose-700',       i: 'alert-triangle' }
    };
    const st  = sm[sk] || { l: p.status, c: 'bg-slate-100 text-slate-700', i: 'help-circle' };
    const stu = p.students || { name: 'Desconocido', classrooms: { name: '-' } };
    const ip  = sk !== 'paid';
    const ds  = p.due_date ? new Date(p.due_date + 'T00:00:00').toLocaleDateString('es-ES') : '-';
    const mora = (p.due_date && ip) ? Helpers.getMoraBreakdown?.(p.due_date + 'T00:00:00') : null;
    const moraTot = mora ? mora.total : 0;
    const af  = Number(p.amount || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const hasV = !!(p.evidence_url || p.proof_url);

    let ub = '';
    if (mora && mora.daysLate > 0) {
      ub = '<span class="text-[9px] font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">Mora +' + Helpers.formatCurrency(moraTot) + '</span>';
    } else if (mora) {
      const diff = Math.round((new Date(p.due_date + 'T00:00:00') - new Date()) / 86400000);
      if (diff === 0) ub = '<span class="text-[9px] font-black text-orange-600">vence hoy</span>';
      else if (diff > 0 && diff <= 5) ub = '<span class="text-[9px] font-black text-amber-600">vence en ' + diff + 'd</span>';
    }

    const approveBtn = ip ? '<button onclick="App.payments.markPaid(\'' + p.id + '\')" class="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-colors relative" title="Aprobar">' + (hasV ? '<span class="absolute -top-1 -right-1 flex h-3 w-3"><span class="animate-ping absolute h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span class="relative h-3 w-3 bg-emerald-500 rounded-full"></span></span>' : '') + '<i data-lucide="check" class="w-4 h-4"></i></button>' : '';
    const waiveBtn   = moraTot > 0 ? '<button onclick="App.payments.waiveMora(\'' + p.id + '\')" class="p-1.5 bg-[#E8F2FF] text-[#0B63C7] rounded-lg hover:bg-blue-100 transition-colors" title="Quitar Mora"><i data-lucide="shield-off" class="w-4 h-4"></i></button>' : '';
    const delBtn     = '<button onclick="App.payments.delete(\'' + p.id + '\')" class="p-1.5 bg-rose-50 text-rose-500 rounded-lg hover:bg-rose-100 transition-colors" title="Eliminar"><i data-lucide="trash-2" class="w-4 h-4"></i></button>';
    const invoiceBtn = '<button onclick="App.payments.downloadInvoice(\'' + p.id + '\')" class="p-1.5 bg-violet-50 text-violet-600 rounded-lg hover:bg-violet-100 transition-colors" title="Descargar Factura"><i data-lucide="file-down" class="w-4 h-4"></i></button>';
    const voucher = hasV
      ? (sk === 'review'
        ? '<button onclick="App.payments.markPaid(\'' + p.id + '\')" class="inline-flex items-center gap-1 text-[#0B63C7] text-xs font-black hover:underline" title="Abrir comprobante"><i data-lucide="eye" class="w-3.5 h-3.5"></i>Ver</button>'
        : '<a href="' + Security.safeUrl(p.evidence_url || p.proof_url) + '" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-sky-600 text-xs font-bold"><i data-lucide="external-link" class="w-3 h-3"></i>Ver</a>')
      : '<span class="text-slate-300 text-xs">-</span>';

    return '<tr class="hover:bg-slate-50 border-b border-slate-100 transition-colors' + (sk === 'overdue' ? ' bg-rose-50/20' : '') + '">' +
      '<td class="px-5 py-3.5"><div class="flex items-center gap-3"><div class="w-8 h-8 rounded-xl bg-[#E8F2FF] text-[#0B63C7] flex items-center justify-center font-black text-sm">' + Helpers.escapeHTML((stu.name || '?').charAt(0).toUpperCase()) + '</div><div><div class="font-bold text-slate-800 text-sm">' + Helpers.escapeHTML(stu.name || '-') + '</div><div class="text-[10px] text-slate-400 uppercase">' + (stu.classrooms?.name || '-') + '</div></div></div></td>' +
      '<td class="px-5 py-3.5 text-center"><span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase ' + st.c + '"><i data-lucide="' + st.i + '" class="w-3 h-3"></i>' + st.l + '</span></td>' +
      '<td class="px-5 py-3.5 text-right"><div class="font-black text-slate-800">' + af + '</div>' + (ub ? '<div class="mt-0.5">' + ub + '</div>' : '') + '</td>' +
      '<td class="px-5 py-3.5"><span class="text-[10px] font-black uppercase text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">' + (p.method || '-') + '</span></td>' +
      '<td class="px-5 py-3.5"><div class="text-[10px] font-bold text-slate-600 uppercase truncate max-w-[110px]">' + (p.bank || '-') + '</div><div class="text-[9px] text-slate-400">' + (p.reference || '') + '</div></td>' +
      '<td class="px-5 py-3.5"><div class="text-[11px] font-bold text-slate-700">' + (p.paid_date ? new Date(p.paid_date).toLocaleDateString('es-ES') : ds) + '</div><div class="text-[9px] text-slate-400 uppercase">' + (p.paid_date ? 'Pagado' : 'Vence') + '</div></td>' +
      '<td class="px-5 py-3.5 text-center">' + voucher + '</td>' +
      '<td class="px-5 py-3.5 text-center"><div class="flex justify-center gap-1.5">' + invoiceBtn + approveBtn + waiveBtn + delBtn + '</div></td>' +
      '</tr>';
  },

  async loadStats() {
    try {
      const yv = document.getElementById('filterPaymentYear')?.value || String(new Date().getFullYear());
      const mv = document.getElementById('filterPaymentMonth')?.value;
      
      // Query simple
      let q = supabase.from('payments').select('id, amount, status, due_date').order('created_at', { ascending: false }).limit(2000);
      
      // Filter by year
      q = q.gte('created_at', yv + '-01-01T00:00:00').lte('created_at', yv + '-12-31T23:59:59');
      
      // Filter by month if specified
      if (mv && mv !== 'all') {
        const monthKey = yv + '-' + String(parseInt(mv, 10)).padStart(2, '0');
        q = q.eq('month_paid', monthKey);
      }
      
      const { data: pays } = await q;
      if (!pays) return;
      
      const now = new Date(); now.setHours(0,0,0,0);
      let income = 0, pending = 0, overdue = 0, review = 0;
      pays.forEach(p => {
        if (p.status === 'paid')   { income += Number(p.amount || 0); return; }
        if (p.status === 'review') { review++; return; }
        const dd = p.due_date ? new Date(p.due_date + 'T00:00:00') : null;
        if (dd && now > dd) overdue++; else pending++;
      });
      
      const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
      set('kpiIncomeMonth',  '$' + income.toLocaleString('es-DO', { minimumFractionDigits: 2 }));
      set('kpiPendingCount', pending);
      set('kpiOverdueCount', overdue);
      set('kpiReviewCount',  review);
    } catch (e) {
      console.error('Error en loadStats:', e);
    }
  },

  async loadIncomeChart() {
    const canvas = document.getElementById('financialChart');
    if (!canvas || !window.Chart) return;
    try {
      const year = document.getElementById('filterPaymentYear')?.value || String(new Date().getFullYear());
      const { data: pays } = await supabase.from('payments')
        .select('amount, created_at')
        .eq('status', 'paid')
        .gte('created_at', year + '-01-01T00:00:00')
        .lte('created_at', year + '-12-31T23:59:59')
        .order('created_at', { ascending: true })
        .limit(1000);
      
      const labels = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
      const vals = new Array(12).fill(0);
      (pays || []).forEach(p => { 
        const m = new Date(p.created_at).getMonth();
        vals[m] += Number(p.amount || 0); 
      });
      
      if (this._chart) this._chart.destroy();
      this._chart = new Chart(canvas, {
        type: 'bar',
        data: { 
          labels, 
          datasets: [{ 
            label: 'Ingresos ($)', 
            data: vals, 
            backgroundColor: 'rgba(79,70,229,0.15)', 
            borderColor: 'rgb(79,70,229)', 
            borderWidth: 2, 
            borderRadius: 6 
          }] 
        },
        options: { 
          responsive: true, 
          maintainAspectRatio: false, 
          plugins: { legend: { display: false } }, 
          scales: { 
            y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' } }, 
            x: { grid: { display: false } } 
          } 
        }
      });
    } catch (e) {
      console.error('Error en loadIncomeChart:', e);
    }
  },

  async openPaymentModal(prefillStudentId = null) {
    const ic = 'w-full px-4 py-2.5 border-2 border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#0B63C7] bg-slate-50/50 transition-all text-sm font-medium';
    const lc = 'block text-[11px] font-black text-slate-400 uppercase tracking-wider mb-1.5 ml-1';
    const now = new Date();
    const dm  = now.getMonth() + 1;
    const dy  = dm > 11 ? now.getFullYear() + 1 : now.getFullYear();
    const dd  = new Date(dy, dm > 11 ? 0 : dm, this.settings.due_day).toISOString().split('T')[0];
    const cy  = now.getFullYear();
    const mo  = MES_LABEL.map((lbl, i) => {
      const v = cy + '-' + String(i + 1).padStart(2, '0');
      return '<option value="' + v + '"' + (i === now.getMonth() ? ' selected' : '') + '>' + lbl + '</option>';
    }).join('');

    window.openGlobalModal(
      '<div class="bg-gradient-to-r from-blue-700 to-blue-500 text-white p-6 rounded-t-3xl flex items-center gap-3">' +
        '<div class="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center text-2xl">&#128176;</div>' +
        '<div><h3 class="text-xl font-black">Registrar Pago</h3><p class="text-xs text-white/70 font-bold uppercase tracking-widest">Cobro Manual</p></div>' +
      '</div>' +
      '<div class="p-6 bg-slate-50/30" id="modalPayment"><div class="grid grid-cols-1 md:grid-cols-2 gap-4">' +
        '<div class="md:col-span-2"><label class="' + lc + '">Estudiante</label><select id="payStudentSelect" class="' + ic + '"><option value="">-- Seleccionar --</option></select></div>' +
        '<div><label class="' + lc + '">Monto</label><input id="payAmount" type="number" step="0.01" min="0" class="' + ic + '" placeholder="0.00"></div>' +
        '<div><label class="' + lc + '">Concepto</label><input id="payConcept" type="text" class="' + ic + '" value="Mensualidad"></div>' +
        '<div><label class="' + lc + '">Mes que se cobra</label><select id="payMonthPaid" class="' + ic + '">' + mo + '</select></div>' +
        '<div><label class="' + lc + '">Fecha Limite</label><input id="payDueDate" type="date" class="' + ic + '" value="' + dd + '"></div>' +
        '<div><label class="' + lc + '">Metodo</label><select id="payMethod" class="' + ic + '"><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="tarjeta">Tarjeta</option></select></div>' +
        '<div><label class="' + lc + '">Estado</label><select id="payStatus" class="' + ic + '"><option value="paid">Pagado</option><option value="pending">Pendiente</option></select></div>' +
      '</div></div>' +
      '<div class="bg-white p-5 rounded-b-3xl border-t border-slate-100 flex justify-end gap-3">' +
        '<button onclick="App.ui.closeModal()" class="px-6 py-2.5 text-slate-500 font-black text-xs uppercase hover:bg-slate-50 rounded-2xl transition-all">Cancelar</button>' +
        '<button id="btnSavePaymentAction" class="px-8 py-2.5 bg-gradient-to-r from-blue-700 to-blue-500 text-white rounded-2xl font-black text-xs uppercase shadow-lg hover:-translate-y-0.5 active:scale-95 transition-all">Registrar Pago</button>' +
      '</div>'
    );
    try {
      const { data: students } = await DirectorApi.getStudents();
      const sel = document.getElementById('payStudentSelect');
      if (sel && students) {
        sel.innerHTML = '<option value="">-- Seleccionar --</option>' +
          students.map(s => '<option value="' + s.id + '" data-fee="' + (s.monthly_fee || 0) + '"' + (prefillStudentId && String(s.id) === String(prefillStudentId) ? ' selected' : '') + '>' + Helpers.escapeHTML(s.name) + ' (' + (s.classrooms?.name || 'Sin aula') + ')</option>').join('');
        sel.addEventListener('change', e => {
          const opt = e.target.selectedOptions[0];
          const fi = document.getElementById('payAmount');
          if (fi && opt?.dataset?.fee > 0) fi.value = opt.dataset.fee;
        });
        if (prefillStudentId) sel.dispatchEvent(new Event('change'));
      }
    } catch (_) {}
    document.getElementById('btnSavePaymentAction')?.addEventListener('click', () => this.saveManualPayment());
    if (window.lucide) lucide.createIcons();
  },

  async saveManualPayment() {
    const sid = document.getElementById('payStudentSelect')?.value;
    const amt = parseFloat(document.getElementById('payAmount')?.value || 0);
    const con = document.getElementById('payConcept')?.value?.trim() || 'Mensualidad';
    const mp  = document.getElementById('payMonthPaid')?.value;
    const dd  = document.getElementById('payDueDate')?.value;
    const met = document.getElementById('payMethod')?.value || 'efectivo';
    const sta = document.getElementById('payStatus')?.value || 'paid';
    const pd  = sta === 'paid' ? new Date().toISOString() : null;
    if (!sid) return Helpers.toast('Selecciona un estudiante', 'warning');
    if (!amt || amt <= 0) return Helpers.toast('Ingresa un monto valido', 'warning');
    const saveBtn = document.getElementById('btnSavePaymentAction');
    if (saveBtn) saveBtn.disabled = true;
    UIHelpers.setLoading(true, '#modalPayment');
    try {
      const mesN = MES[parseInt((mp || '2026-01').split('-')[1], 10) - 1];
      const { data: exList } = await supabase.from('payments').select('id, status').eq('student_id', sid).or('month_paid.eq.' + mp + ',month_paid.eq.' + mesN).limit(5);
      const ex = exList?.[0] || null;
      let pay;
      if (ex) {
        if (ex.status === 'paid') { Helpers.toast('Pago ya aprobado para este mes', 'warning'); return; }
        const { data: upd, error: upE } = await supabase.from('payments').update({ amount: amt, concept: con, method: met, status: sta, due_date: dd || null, paid_date: pd, month_paid: mp }).eq('id', ex.id).select().single();
        if (upE) throw upE; pay = upd;
      } else {
        const { data: ins, error: inE } = await supabase.from('payments').insert({ student_id: sid, amount: amt, concept: con, method: met, status: sta, month_paid: mp, due_date: dd || null, paid_date: pd, created_at: new Date().toISOString() }).select().single();
        if (inE) { if (inE.code === '23505') throw new Error('Ya existe un registro para este mes.'); throw inE; }
        pay = ins;
      }
      if (sta === 'paid') await supabase.from('students').update({ is_active: true }).eq('id', sid).catch(() => {});
      await auditLog('payment.manual_create', { student_id: sid, amount: amt, month: mp }).catch(() => {});
      Helpers.toast('Pago registrado correctamente', 'success');
      UIHelpers.closeModal();
      this.loadPayments(); this.loadStats(); this.loadIncomeChart();
      if (pay?.id) DirectorApi.sendPaymentReceipt(pay.id).catch(() => {});
    } catch (e) {
      Helpers.toast('Error al guardar: ' + (e.message || 'Conflicto de datos'), 'error');
    } finally {
      UIHelpers.setLoading(false, '#modalPayment');
      if (saveBtn) saveBtn.disabled = false;
    }
  },

  async markPaid(id) {
    const p = this._lastList?.find(x => x.id === id);
    const isTransfer = p?.method === 'transferencia' && (p?.evidence_url || p?.proof_url);

    if (isTransfer) {
      this._openTransferReviewModal(p);
      return;
    }

    if (!confirm('Aprobar este pago?')) return;
    try {
      await supabase.from('payments').update({ status: 'paid', paid_date: new Date().toISOString() }).eq('id', id);
      Helpers.toast('Pago aprobado', 'success');
      this.loadPayments(); this.loadStats();
      this._generateInvoiceAfterApproval(id);
      this._sendApprovalNotification(id);
    } catch (_) { Helpers.toast('Error al aprobar pago', 'error'); }
  },

  _openTransferReviewModal(payment) {
    const p = payment;
    const stu = p.students || { name: 'Desconocido', classrooms: { name: '-' } };
    const amt = Number(p.amount || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 });
    const voucherUrl = p.evidence_url || p.proof_url || '';
    const proofUrl  = p.proof_url && p.proof_url !== voucherUrl ? p.proof_url : '';

    window.openGlobalModal(
      '<div class="bg-gradient-to-r from-blue-700 to-blue-500 text-white p-6 rounded-t-3xl flex items-center gap-3">' +
        '<div class="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center text-2xl">&#128179;</div>' +
        '<div><h3 class="text-xl font-black">Revisar Transferencia</h3><p class="text-xs text-white/70 font-bold uppercase tracking-widest">Comprobante de pago</p></div>' +
      '</div>' +
      '<div class="p-6 bg-slate-50/30">' +
        '<div class="bg-white border border-slate-100 rounded-2xl p-5 mb-4">' +
          '<div class="flex items-center gap-3 mb-4">' +
            '<div class="w-10 h-10 rounded-xl bg-[#E8F2FF] text-[#0B63C7] flex items-center justify-center font-black text-sm">' +
              Helpers.escapeHTML((stu.name || '?').charAt(0).toUpperCase()) +
            '</div>' +
            '<div>' +
              '<div class="font-bold text-slate-800">' + Helpers.escapeHTML(stu.name) + '</div>' +
              '<div class="text-[10px] text-slate-400">' + (stu.classrooms?.name || '-') + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="grid grid-cols-2 gap-3 text-sm">' +
            '<div><span class="text-xs text-slate-400 uppercase">Monto</span><div class="font-black text-slate-800">RD$ ' + amt + '</div></div>' +
            '<div><span class="text-xs text-slate-400 uppercase">Mes</span><div class="font-bold text-slate-700">' + (p.month_paid || '-') + '</div></div>' +
            '<div><span class="text-xs text-slate-400 uppercase">Banco</span><div class="font-bold text-slate-700">' + (p.bank || '-') + '</div></div>' +
            '<div><span class="text-xs text-slate-400 uppercase">Referencia</span><div class="font-bold text-slate-700">' + (p.reference || '-') + '</div></div>' +
            '<div class="col-span-2"><span class="text-xs text-slate-400 uppercase">Concepto</span><div class="font-bold text-slate-700">' + (p.concept || '-') + '</div></div>' +
          '</div>' +
        '</div>' +
        '<div class="mb-4">' +
          '<label class="block text-[11px] font-black text-slate-400 uppercase tracking-wider mb-2">Comprobante de Transferencia</label>' +
          (voucherUrl
            ? '<div class="border border-slate-200 rounded-2xl overflow-hidden bg-white">' +
                (voucherUrl.match(/\.(jpg|jpeg|png|gif|webp)/i)
                  ? '<img src="' + Security.safeUrl(voucherUrl) + '" class="w-full max-h-72 object-contain cursor-pointer" onclick="window.open(\'' + Security.safeUrl(voucherUrl) + '\', \'_blank\')" title="Click para ver en tamaño completo">'
                  : '<a href="' + Security.safeUrl(voucherUrl) + '" target="_blank" rel="noopener noreferrer" class="flex items-center gap-3 p-4 text-[#0B63C7] hover:bg-blue-50 transition-colors">' +
                      '<i data-lucide="file-text" class="w-8 h-8"></i>' +
                      '<div><div class="font-bold text-sm">Ver comprobante</div><div class="text-[10px] text-slate-400">Abrir en nueva pesta&ntilde;a</div></div>' +
                    '</a>') +
              '</div>'
            : '<div class="border border-dashed border-slate-200 rounded-2xl p-8 text-center text-slate-400 text-sm">Sin comprobante adjunto</div>') +
        '</div>' +
        (proofUrl && proofUrl !== voucherUrl
          ? '<div class="mb-4">' +
              '<label class="block text-[11px] font-black text-slate-400 uppercase tracking-wider mb-2">Factura Fiscal</label>' +
              '<a href="' + Security.safeUrl(proofUrl) + '" target="_blank" rel="noopener noreferrer" class="flex items-center gap-3 p-4 border border-slate-200 rounded-2xl bg-white hover:bg-blue-50 transition-colors text-[#0B63C7]">' +
                '<i data-lucide="file-check" class="w-5 h-5"></i>' +
                '<span class="text-sm font-bold">Ver factura fiscal</span>' +
              '</a>' +
            '</div>'
          : '') +
        '<div>' +
          '<label class="block text-[11px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Notas (opcional)</label>' +
          '<textarea id="reviewNotes" rows="2" class="w-full px-4 py-2.5 border-2 border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#0B63C7] bg-slate-50/50 transition-all text-sm" placeholder="Agregar una nota sobre esta revisi&oacute;n..."></textarea>' +
        '</div>' +
      '</div>' +
      '<div class="bg-white p-5 rounded-b-3xl border-t border-slate-100 flex justify-end gap-3">' +
        '<button onclick="App.ui.closeModal()" class="px-5 py-2.5 text-slate-500 font-black text-xs uppercase hover:bg-slate-50 rounded-2xl transition-all">Cerrar</button>' +
        '<button id="btnRejectTransfer" class="px-6 py-2.5 bg-rose-500 text-white rounded-2xl font-black text-xs uppercase shadow-lg hover:-translate-y-0.5 active:scale-95 transition-all">Rechazar</button>' +
        '<button id="btnApproveTransfer" class="px-8 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white rounded-2xl font-black text-xs uppercase shadow-lg hover:-translate-y-0.5 active:scale-95 transition-all">Aprobar Pago</button>' +
      '</div>'
    );
    if (window.lucide) lucide.createIcons();

    document.getElementById('btnApproveTransfer')?.addEventListener('click', async () => {
      const btn = document.getElementById('btnApproveTransfer');
      btn.disabled = true; btn.textContent = 'Aprobando...';
      try {
        const notes = document.getElementById('reviewNotes')?.value?.trim();
        await supabase.from('payments').update({
          status: 'paid',
          paid_date: new Date().toISOString(),
          notes: notes || null
        }).eq('id', p.id);
        UIHelpers.closeModal();
        Helpers.toast('Transferencia aprobada', 'success');
        this.loadPayments(); this.loadStats();
        this._generateInvoiceAfterApproval(p.id);
        this._sendApprovalNotification(p.id);
      } catch (_) {
        Helpers.toast('Error al aprobar', 'error');
        btn.disabled = false; btn.textContent = 'Aprobar Pago';
      }
    });

    document.getElementById('btnRejectTransfer')?.addEventListener('click', async () => {
      const notes = document.getElementById('reviewNotes')?.value?.trim();
      if (!notes) { Helpers.toast('Agrega un motivo de rechazo', 'warning'); return; }
      const btn = document.getElementById('btnRejectTransfer');
      btn.disabled = true; btn.textContent = 'Rechazando...';
      try {
        await supabase.from('payments').update({
          status: 'pending',
          notes: 'RECHAZADO: ' + notes
        }).eq('id', p.id);
        UIHelpers.closeModal();
        Helpers.toast('Transferencia rechazada', 'info');
        this.loadPayments(); this.loadStats();
      } catch (_) {
        Helpers.toast('Error al rechazar', 'error');
        btn.disabled = false; btn.textContent = 'Rechazar';
      }
    });
  },

  async _generateInvoiceAfterApproval(paymentId) {
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;
      const result = await InvoicingModule.generateInvoice(paymentId, userId);
      if (result?.success) Helpers.toast(`Factura ${result.invoice_number} generada!`, 'success');
    } catch (e) { console.error('Error generando factura:', e); }
  },

  async _sendApprovalNotification(paymentId) {
    try {
      const { data: p } = await DirectorApi.getPaymentById(paymentId);
      if (p) {
        const { notifyPaymentApproved } = await import('../shared/supabase.js');
        const emails = [p.students?.p1_email, p.students?.p2_email].filter(e => e?.includes('@'));
        const amtStr = Number(p.amount || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        await notifyPaymentApproved(paymentId, emails[0] || null, p.students?.name || 'Estudiante', amtStr, p.month_paid || 'Colegiatura');
      }
    } catch (_) {}
  },

  async delete(id) {
    if (!confirm('Eliminar este registro?')) return;
    try {
      await supabase.from('payments').delete().eq('id', id);
      Helpers.toast('Pago eliminado', 'success');
      await this.loadPayments();
    } catch (_) { Helpers.toast('Error al eliminar', 'error'); }
  },

  async runCycle() {
    if (!confirm('Ejecutar ciclo de pagos?')) return;
    try {
      Helpers.toast('Ejecutando...', 'info');
      const { data, error } = await supabase.rpc('run_payment_cycle');
      if (error) throw error;
      const r = (typeof data === 'string') ? JSON.parse(data) : (data || {});
      Helpers.toast('Ciclo completado: ' + (r.generated || 0) + ' generados, ' + (r.expired || 0) + ' vencidos', 'success');
      await this.loadPayments();
    } catch (e) { Helpers.toast('Error en ciclo: ' + e.message, 'error'); }
  },

  async openGenerateSpecificMonthModal() {
    const now = new Date();
    const years = [];
    for (let y = now.getFullYear() + 1; y >= now.getFullYear() - 3; y--) {
      years.push(y);
    }
    const monthOptions = MES_LABEL.map((lbl, i) => 
      `<option value="${i + 1}" ${i === now.getMonth() ? ' selected' : ''}>${lbl}</option>`
    ).join('');
    const yearOptions = years.map(y => 
      `<option value="${y}" ${y === now.getFullYear() ? ' selected' : ''}>${y}</option>`
    ).join('');

    window.openGlobalModal(
      '<div class="bg-gradient-to-r from-blue-700 to-blue-500 text-white p-6 rounded-t-3xl flex items-center gap-3">' +
        '<div class="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center text-2xl">&#128178;</div>' +
        '<div><h3 class="text-xl font-black">Generar Pagos Mes Específico</h3><p class="text-xs text-white/70 font-bold uppercase tracking-widest">Selecciona mes y año</p></div>' +
      '</div>' +
      '<div class="p-6 bg-slate-50/30" id="modalGenerateSpecificMonth">' +
        '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">' +
          '<div><label class="block text-[11px] font-black text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Mes</label><select id="genSpecificMonth" class="w-full px-4 py-2.5 border-2 border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#0B63C7] bg-slate-50/50 transition-all text-sm font-medium">' + monthOptions + '</select></div>' +
          '<div><label class="block text-[11px] font-black text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Año</label><select id="genSpecificYear" class="w-full px-4 py-2.5 border-2 border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#0B63C7] bg-slate-50/50 transition-all text-sm font-medium">' + yearOptions + '</select></div>' +
        '</div>' +
      '</div>' +
      '<div class="bg-white p-5 rounded-b-3xl border-t border-slate-100 flex justify-end gap-3">' +
        '<button onclick="App.ui.closeModal()" class="px-6 py-2.5 text-slate-500 font-black text-xs uppercase hover:bg-slate-50 rounded-2xl transition-all">Cancelar</button>' +
        '<button id="btnGenerateSpecificMonth" class="px-8 py-2.5 bg-gradient-to-r from-blue-700 to-blue-500 text-white rounded-2xl font-black text-xs uppercase shadow-lg hover:-translate-y-0.5 active:scale-95 transition-all">Generar Pagos</button>' +
      '</div>'
    );
    
    document.getElementById('btnGenerateSpecificMonth')?.addEventListener('click', () => this.generateSpecificMonthCharges());
  },

  async generateSpecificMonthCharges() {
    const month = parseInt(document.getElementById('genSpecificMonth')?.value, 10);
    const year = parseInt(document.getElementById('genSpecificYear')?.value, 10);
    if (!month || !year) return Helpers.toast('Selecciona mes y año', 'warning');
    
    const btn = document.getElementById('btnGenerateSpecificMonth');
    if (btn) btn.disabled = true;
    UIHelpers.setLoading(true, '#modalGenerateSpecificMonth');
    try {
      Helpers.toast('Generando pagos...', 'info');
      const { data, error } = await supabase.rpc('generate_monthly_charges', { p_month: month, p_year: year });
      if (error) throw error;
      const r = (typeof data === 'string') ? JSON.parse(data) : (data || {});
      Helpers.toast('Completado: ' + (r.generated || 0) + ' pagos generados para ' + MES_LABEL[month - 1] + ' ' + year, 'success');
      UIHelpers.closeModal();
      await this.loadPayments();
    } catch (e) { Helpers.toast('Error: ' + e.message, 'error'); }
    finally {
      UIHelpers.setLoading(false, '#modalGenerateSpecificMonth');
      if (btn) btn.disabled = false;
    }
  },

  async waiveMora(id) {
    const reason = prompt('Motivo (opcional):') ?? 'Mora exonerada';
    if (reason === null) return;
    try {
      const { data, error } = await supabase.rpc('waive_payment_mora', { p_payment_id: id, p_reason: reason || 'Mora exonerada' });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      Helpers.toast('Mora eliminada', 'success');
      await this.loadPayments();
    } catch (_) {
      try {
        await supabase.from('payments').update({ due_date: new Date().toISOString().split('T')[0] }).eq('id', id);
        Helpers.toast('Mora eliminada', 'success');
        await this.loadPayments();
      } catch (e2) { Helpers.toast('Error: ' + e2.message, 'error'); }
    }
  },

  async sendReminders() {
    if (!confirm('Enviar recordatorios de pago ahora?')) return;
    try {
      Helpers.toast('Enviando...', 'info');
      const { data, error } = await supabase.functions.invoke('payment-reminders', { body: { action: 'send_all' } });
      if (error) throw new Error(error.message || JSON.stringify(error));
      const r = data || {};
      const p = r.processed || 0;
      if (!p) Helpers.toast('No hay pagos pendientes', 'info');
      else Helpers.toast(p + ' recordatorio(s) enviados - ' + (r.emails_sent || 0) + ' correos, ' + (r.pushes_sent || 0) + ' push', 'success');
    } catch (e) { Helpers.toast('Error: ' + e.message, 'error'); }
  },

  async savePaymentConfig() {
    const g = parseInt(document.getElementById('confGenDay')?.value || 25);
    const d = parseInt(document.getElementById('confDueDay')?.value || 5);
    if (isNaN(g) || g < 1 || g > 28) return Helpers.toast('Dia generacion invalido (1-28)', 'warning');
    if (isNaN(d) || d < 1 || d > 28) return Helpers.toast('Dia limite invalido (1-28)', 'warning');
    try {
      await supabase.from('school_settings').upsert({ id: 1, generation_day: g, due_day: d });
      this.settings.generation_day = g; this.settings.due_day = d;
      Helpers.toast('Configuracion guardada', 'success');
    } catch (e) { Helpers.toast('Error: ' + e.message, 'error'); }
  },

  // ── Factura individual ────────────────────────────────────────────
  async downloadInvoice(id) {
    // Primero intentar obtener las facturas existentes para este pago
    const invoices = await InvoicingModule.getPaymentInvoices(id);
    
    if (invoices && invoices.length > 0) {
      // Si hay facturas, abrir la más reciente
      await InvoicingModule.openInvoiceModal(invoices[0].id);
      return;
    }
    
    // Si no hay facturas, preguntar si quiere generar una
    if (confirm('No hay factura generada para este pago. ¿Desea generarla ahora?')) {
      try {
        const { data: authData } = await supabase.auth.getUser();
        const userId = authData?.user?.id;
        
        const result = await InvoicingModule.generateInvoice(id, userId);
        if (result && result.success) {
          // Abrir la factura recién generada
          await InvoicingModule.openInvoiceModal(result.invoice_id);
        }
      } catch (err) {
        Helpers.toast('Error al generar factura', 'error');
      }
    }
  },

  // ── Modal de exportación batch ────────────────────────────────────
  _openExportModal() {
    // Usar la lista ya cargada en el tbody (reconstruida desde el DOM state)
    const tbody = document.getElementById('paymentsTableBody');
    const rows  = tbody ? Array.from(tbody.querySelectorAll('tr[class]')) : [];
    // Mejor: leer desde AppState si está disponible
    const AppState = window.AppState;
    const list = AppState?.get?.('paymentsData') || this._lastList || [];

    const counts = { all: 0, paid: 0, pending: 0, review: 0, overdue: 0, mora: 0 };
    list.forEach(p => {
      counts.all++;
      const s = InvoiceModule._resolveStatus(p);
      if (counts[s] !== undefined) counts[s]++;
      if (InvoiceModule._calcMoraClient(p.due_date) > 0 && s !== 'paid') counts.mora++;
    });

    const row = (status, label, color, count) =>
      `<button onclick="App.payments._doExport('${status}')"
        class="flex items-center justify-between w-full px-4 py-3.5 rounded-2xl border-2 border-slate-100 hover:border-[#0B63C7] hover:bg-blue-50 transition-all text-left">
        <div class="flex items-center gap-3">
          <span class="w-3 h-3 rounded-full flex-shrink-0" style="background:${color}"></span>
          <span class="font-bold text-slate-700 text-sm">${label}</span>
        </div>
        <span class="text-xs font-black px-2.5 py-1 rounded-full" style="background:${color}20;color:${color}">${count} registros</span>
      </button>`;

    window.openGlobalModal(
      '<div class="bg-gradient-to-r from-violet-600 to-purple-600 text-white p-6 rounded-t-3xl flex items-center gap-3">' +
        '<div class="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center text-2xl">📊</div>' +
        '<div><h3 class="text-xl font-black">Exportar Facturas Electrónicas</h3><p class="text-xs text-white/70 font-bold uppercase tracking-widest">Descarga CSV con filtro</p></div>' +
      '</div>' +
      '<div class="p-6 space-y-2">' +
        '<p class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Selecciona qué facturas exportar:</p>' +
        row('all',     'Todas las facturas',    '#6366f1', counts.all) +
        row('paid',    'Aprobadas / Pagadas',   '#16a34a', counts.paid) +
        row('pending', 'Pendientes de pago',    '#d97706', counts.pending) +
        row('review',  'En revisión',           '#2563eb', counts.review) +
        row('overdue', 'Vencidas',              '#dc2626', counts.overdue) +
        row('mora',    'Con mora aplicada',     '#b91c1c', counts.mora) +
      '</div>' +
      '<div class="px-6 pb-5 flex justify-end">' +
        '<button onclick="App.ui.closeModal()" class="px-6 py-2.5 text-slate-500 font-black text-xs uppercase hover:bg-slate-50 rounded-2xl">Cerrar</button>' +
      '</div>'
    );
    if (window.lucide) lucide.createIcons();
  },

  _filterPendingTransfers() {
    const sel = document.getElementById('filterPaymentStatus');
    if (sel) { sel.value = 'review'; this.loadPayments(); }
    Helpers.toast('Mostrando transferencias pendientes de revisión', 'info');
  },

  _doExport(statusFilter) {
    const AppState = window.AppState;
    let list = AppState?.get?.('paymentsData') || this._lastList || [];
    if (statusFilter === 'mora') {
      list = list.filter(p => InvoiceModule._calcMoraClient(p.due_date) > 0 && InvoiceModule._resolveStatus(p) !== 'paid');
    }
    const mv = document.getElementById('filterPaymentMonth')?.value || '';
    const yv = document.getElementById('filterPaymentYear')?.value  || String(new Date().getFullYear());
    const filename = `facturas_${statusFilter}_${yv}${mv ? '-' + mv : ''}_${new Date().toISOString().split('T')[0]}.csv`;
    const count = InvoiceModule.exportBatch(list, {
      statusFilter: statusFilter === 'mora' ? 'all' : statusFilter,
      filename
    });
    if (count) {
      UIHelpers.closeModal();
      Helpers.toast(`${count} facturas exportadas`, 'success');
    }
  }
};





