/**
 * Caja Cobro — Panel Asistente (Rediseño)
 */
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../shared/supabase.js';
import { Helpers } from '../shared/helpers.js';
import { AppState } from './state.js';
import { InvoiceModule } from '../shared/invoice.js';

const fmt = n => 'RD$' + Number(n||0).toLocaleString('es-DO',{minimumFractionDigits:2});
const fmtN = n => Number(n||0).toLocaleString('es-DO',{minimumFractionDigits:2});
const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const CONCEPTOS_CATALOGO = [
  { id: 'uniforme', label: 'Uniforme Escolar', amount: 3200 },
  { id: 'transporte', label: 'Transporte', amount: 1500 },
  { id: 'libros', label: 'Libros', amount: 2500 },
  { id: 'materiales', label: 'Materiales', amount: 800 },
  { id: 'actividades', label: 'Actividades Extra', amount: 1200 },
  { id: 'excursiones', label: 'Excursiones', amount: 3500 },
  { id: 'comedor', label: 'Comedor', amount: 2000 },
  { id: 'tutorias', label: 'Tutorías', amount: 1800 },
  { id: 'certificados', label: 'Certificados', amount: 500 },
  { id: 'otros', label: 'Otros', amount: 0 },
];

let _state = {
  selectedStudent: null,
  cart: [],
  totalMora: 0,
  totalDiscount: 0,
  selectedPaymentMethod: null,
  students: [],
  concepts: [],
};

const $el = id => document.getElementById(id);

export function renderCajaCobro() {
  const section = $el('pagos');
  if (!section) return;

  const monthLabel = months[new Date().getMonth()] + ' ' + new Date().getFullYear();

  section.innerHTML = `
  <div class="space-y-5">
    <!-- HEADER POS -->
    <div class="flex items-center justify-between flex-wrap gap-3">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 bg-gradient-to-br from-[#0d9488] to-[#0B63C7] rounded-2xl flex items-center justify-center shadow-lg">
          <i data-lucide="credit-card" class="w-5 h-5 text-white"></i>
        </div>
        <div>
          <h2 class="text-xl font-black text-slate-800">Caja — ${monthLabel}</h2>
          <p class="text-xs text-slate-400 font-bold uppercase tracking-wide">Sistema de Cobro Profesional</p>
        </div>
      </div>
      <div class="flex gap-2">
        <button onclick="CajaCobro._openCierreCaja()" class="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-black text-xs uppercase transition-all">
          <i data-lucide="clipboard-check" class="w-3.5 h-3.5"></i> Cierre
        </button>
        <button onclick="CajaCobro._exportCaja()" class="flex items-center gap-1.5 px-3 py-2 bg-[#E8F2FF] hover:bg-[#0B63C7] text-[#0B63C7] hover:text-white rounded-xl font-black text-xs uppercase transition-all">
          <i data-lucide="download" class="w-3.5 h-3.5"></i> Exportar
        </button>
      </div>
    </div>

    <!-- KPIs del día -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div class="bg-gradient-to-br from-[#0d9488] to-[#077a70] rounded-2xl p-4 text-white">
        <p class="text-[10px] font-black text-teal-200 uppercase tracking-widest mb-1">Cobrado Hoy</p>
        <p class="text-xl font-black" id="cajaTodayTotal">RD$0.00</p>
      </div>
      <div class="bg-gradient-to-br from-[#FF7A00] to-[#D96500] rounded-2xl p-4 text-white">
        <p class="text-[10px] font-black text-orange-200 uppercase tracking-widest mb-1">Pendientes</p>
        <p class="text-xl font-black" id="cajaPendingCount">0</p>
      </div>
      <div class="bg-gradient-to-br from-[#0B63C7] to-[#0850A0] rounded-2xl p-4 text-white">
        <p class="text-[10px] font-black text-blue-200 uppercase tracking-widest mb-1">Transferencias</p>
        <p class="text-xl font-black" id="cajaReviewCount">0</p>
      </div>
      <div class="bg-gradient-to-br from-[#28B54D] to-[#1A8035] rounded-2xl p-4 text-white">
        <p class="text-[10px] font-black text-green-200 uppercase tracking-widest mb-1">Al Día</p>
        <p class="text-xl font-black" id="cajaPaidCount">0</p>
      </div>
    </div>

    <!-- TABLA PRINCIPAL + BÚSQUEDA -->
    <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div class="flex items-center justify-between flex-wrap gap-3 p-4 border-b border-slate-100">
        <div class="flex items-center gap-3">
          <div class="relative">
            <i data-lucide="search" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"></i>
            <input id="cajaSearch" type="text" placeholder="Buscar estudiante..." oninput="CajaCobro._applyFilters()"
              class="pl-9 pr-4 py-2.5 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-[#0d9488] w-64 transition-all">
          </div>
          <!-- Filtros de estado -->
          <div class="flex gap-1.5">
            <button onclick="CajaCobro._filterByStatus('all')" data-sf="all" class="status-filter-btn active px-3 py-1.5 rounded-xl text-xs font-black transition-all bg-[#0d9488] text-white">Todos</button>
            <button onclick="CajaCobro._filterByStatus('pending')" data-sf="pending" class="status-filter-btn px-3 py-1.5 rounded-xl text-xs font-black transition-all bg-slate-100 text-slate-600 hover:bg-orange-100 hover:text-orange-700">Pendientes</button>
            <button onclick="CajaCobro._filterByStatus('overdue')" data-sf="overdue" class="status-filter-btn px-3 py-1.5 rounded-xl text-xs font-black transition-all bg-slate-100 text-slate-600 hover:bg-rose-100 hover:text-rose-700">Vencidos</button>
            <button onclick="CajaCobro._filterByStatus('review')" data-sf="review" class="status-filter-btn px-3 py-1.5 rounded-xl text-xs font-black transition-all bg-slate-100 text-slate-600 hover:bg-blue-100 hover:text-blue-700">Revisión</button>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xs font-black text-slate-400" id="totalPendientes">0 estudiantes</span>
          <button onclick="CajaCobro._refreshStudents()" class="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 transition-all" title="Actualizar">
            <i data-lucide="refresh-cw" class="w-4 h-4"></i>
          </button>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-[#E8F2FF] border-b border-[#0B63C7]/10">
            <tr>
              <th class="px-4 py-3 text-left text-[10px] font-black text-[#0850A0] uppercase tracking-wider">Estudiante</th>
              <th class="px-4 py-3 text-left text-[10px] font-black text-[#0850A0] uppercase tracking-wider hidden md:table-cell">Aula</th>
              <th class="px-4 py-3 text-right text-[10px] font-black text-[#0850A0] uppercase tracking-wider">Saldo</th>
              <th class="px-4 py-3 text-center text-[10px] font-black text-[#0850A0] uppercase tracking-wider hidden sm:table-cell">Estado</th>
              <th class="px-4 py-3 text-center text-[10px] font-black text-[#0850A0] uppercase tracking-wider">Acción</th>
            </tr>
          </thead>
          <tbody id="cajaTableBody" class="divide-y divide-slate-50">
            <tr><td colspan="5" class="text-center py-10 text-slate-400 text-sm">
              <div class="flex flex-col items-center gap-2">
                <div class="w-10 h-10 border-2 border-[#0d9488] border-t-transparent rounded-full animate-spin"></div>
                Cargando cobros...
              </div>
            </td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- COMPROBANTES POR VALIDAR -->
    <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div class="flex items-center justify-between p-4 border-b border-slate-100">
        <h3 class="text-sm font-black text-slate-800 flex items-center gap-2">
          <i data-lucide="upload" class="w-4 h-4 text-[#FF7A00]"></i>
          Comprobantes por Validar
        </h3>
        <span id="reviewBadge" class="hidden px-2 py-0.5 bg-[#FF7A00] text-white text-[9px] font-black rounded-full">0</span>
      </div>
      <div id="transferenciasPendientes" class="divide-y divide-slate-50">
        <div class="text-center py-6 text-slate-400 text-sm">Sin comprobantes pendientes</div>
      </div>
    </div>
  </div>
  `;

  if (window.lucide) lucide.createIcons();
  _loadStudents();
  _loadConcepts();
  _loadDayStats();
}

async function _loadStudents() {
    const tbody = $el('cajaTableBody');
    if (!tbody) return;

    try {
      const { data: students } = await supabase.from('students')
        .select(`
          id, name, matricula, p1_name,
          classrooms (name, level),
          student_enrollments!left (
            id,
            student_charges!left (id, concept, amount, status, due_date)
          )
        `)
        .eq('is_active', true)
        .is('deleted_at', null)
        .limit(200);

      const processedStudents = (students || []).map(s => {
        const enroll = s.student_enrollments?.[0];
        const charges = (enroll?.student_charges || []).filter(c => ['pending','overdue'].includes(c.status));
        const totalOwed = charges.reduce((sum, c) => sum + (c.amount || 0), 0;
        const hasMora = charges.some(c => c.due_date && new Date(c.due_date) < new Date());
        const status = charges.some(c => c.status === 'overdue') ? 'overdue' 
                     : charges.length > 0 ? 'pending' 
                     : 'paid';

        return {
          ...s,
          charges,
          totalOwed,
          hasMora,
          status,
          earliestDueDate: charges.length ? charges.sort((a,b)=>new Date(a.due_date)-new Date(b.due_date))[0].due_date : null
        };
      });

      _state.students = processedStudents;
      $el('totalPendientes').textContent = `${processedStudents.filter(s => s.status !== 'paid').length} estudiantes`;
      _renderTable(processedStudents);
      await _loadPendingTransfers(); // Load pending parent payments
    } catch (e) {
      console.error('Error loading students', e);
    }
  }

async function _loadPendingTransfers() {
  const container = $el('transferenciasPendientes');
  if (!container) return;

  try {
    const { data: payments } = await supabase
      .from('payments')
      .select('id, student_id, amount, concept, method, bank, evidence_url, fiscal_receipt_url, month_paid, notes, created_at, students(name, classrooms(name))')
      .eq('status', 'review')
      .order('created_at', { ascending: false })
      .limit(20);

    if (!payments || payments.length === 0) {
      container.innerHTML = `
        <div class="flex flex-col items-center gap-2 py-8 text-slate-400">
          <i data-lucide="check-circle" class="w-10 h-10 text-emerald-400"></i>
          <p class="text-sm font-bold">✅ Sin comprobantes pendientes</p>
        </div>`;
      if (window.lucide) lucide.createIcons();
      return;
    }

    container.innerHTML = payments.map(p => `
      <div class="flex items-start gap-4 p-4 hover:bg-slate-50 transition-colors">
        <!-- Avatar -->
        <div class="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#FF7A00] to-[#D96500] text-white flex items-center justify-center font-black text-sm shrink-0 shadow-sm">
          ${(p.students?.name || '?').charAt(0).toUpperCase()}
        </div>
        <!-- Info -->
        <div class="flex-1 min-w-0">
          <div class="flex items-start justify-between gap-2">
            <div>
              <p class="font-black text-sm text-slate-800">${Helpers.escapeHTML(p.students?.name || '—')}</p>
              <p class="text-[10px] text-slate-400 font-bold uppercase">
                ${Helpers.escapeHTML(p.concept || 'Mensualidad')} · ${p.month_paid || '—'}
                ${p.bank ? ' · ' + Helpers.escapeHTML(p.bank) : ''}
              </p>
            </div>
            <span class="font-black text-sm text-[#0B63C7] shrink-0">${fmt(p.amount)}</span>
          </div>
          <div class="flex items-center gap-2 mt-2 flex-wrap">
            ${p.evidence_url ? `
              <a href="${p.evidence_url}" target="_blank" rel="noopener"
                class="inline-flex items-center gap-1 text-[10px] font-black text-[#0B63C7] bg-[#E8F2FF] px-2 py-1 rounded-lg hover:bg-[#0B63C7] hover:text-white transition-all">
                <i data-lucide="eye" class="w-3 h-3"></i> Ver comprobante
              </a>` : ''}
            <button onclick="CajaCobro.approvePayment(${p.id})"
              class="inline-flex items-center gap-1 text-[10px] font-black text-white bg-[#28B54D] px-3 py-1 rounded-lg hover:bg-[#1A8035] transition-all active:scale-95">
              ✅ Aprobar
            </button>
            <button onclick="CajaCobro.rejectPayment(${p.id})"
              class="inline-flex items-center gap-1 text-[10px] font-black text-rose-600 bg-rose-50 px-3 py-1 rounded-lg hover:bg-rose-600 hover:text-white transition-all active:scale-95">
              ❌ Rechazar
            </button>
          </div>
        </div>
      </div>`).join('');

    if (window.lucide) lucide.createIcons();
  } catch (e) {
    console.error('[CajaCobro] _loadPendingTransfers error:', e);
    container.innerHTML = '<div class="text-center py-4 text-rose-400 text-sm">Error al cargar</div>';
  }
}

// ── Day stats loader ──────────────────────────────────────────────────────────
async function _loadDayStats() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const [todayRes, pendingRes, reviewRes, paidRes] = await Promise.allSettled([
      supabase.from('payments').select('amount').eq('status','paid').gte('paid_date', today + 'T00:00:00'),
      supabase.from('payments').select('id',{count:'exact',head:true}).in('status',['pending','overdue']),
      supabase.from('payments').select('id',{count:'exact',head:true}).eq('status','review'),
      supabase.from('payments').select('id',{count:'exact',head:true}).eq('status','paid'),
    ]);
    const get = r => r.status === 'fulfilled' ? r.value : {};
    const todayTotal = (get(todayRes).data || []).reduce((s,p) => s + Number(p.amount||0), 0);
    const set = (id, v) => { const el = $el(id); if (el) el.textContent = v; };
    set('cajaTodayTotal', fmt(todayTotal));
    set('cajaPendingCount', get(pendingRes).count || 0);
    set('cajaReviewCount', get(reviewRes).count || 0);
    set('cajaPaidCount', get(paidRes).count || 0);
    // Update review badge
    const rb = $el('reviewBadge');
    const rc = get(reviewRes).count || 0;
    if (rb) { rb.textContent = rc; rb.classList.toggle('hidden', rc === 0); }
  } catch (_) {}
}

function _renderTable(students) {
  const tbody = $el('cajaTableBody');
  if (!tbody) return;

  if (!students.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-10 text-slate-400 text-sm font-bold">✅ Sin pagos pendientes</td></tr>';
    return;
  }

  const statusCfg = {
    overdue: { label:'Vencido',   cls:'bg-rose-100 text-rose-700 border border-rose-200',   dot:'bg-rose-500' },
    pending: { label:'Pendiente', cls:'bg-amber-100 text-amber-700 border border-amber-200', dot:'bg-amber-500' },
    review:  { label:'Revisión',  cls:'bg-blue-100 text-blue-700 border border-blue-200',    dot:'bg-blue-500' },
    paid:    { label:'Al día',    cls:'bg-emerald-100 text-emerald-700 border border-emerald-200', dot:'bg-emerald-500' },
  };

  tbody.innerHTML = students.map(s => {
    const sc = statusCfg[s.status] || statusCfg.pending;
    const initial = (s.name || '?').charAt(0).toUpperCase();
    const hasDebt = s.status !== 'paid';
    return `
      <tr class="hover:bg-slate-50/70 transition-colors group">
        <td class="px-4 py-3">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-[#0d9488] to-[#0B63C7] text-white flex items-center justify-center font-black text-sm shrink-0 shadow-sm">
              ${initial}
            </div>
            <div class="min-w-0">
              <p class="font-black text-sm text-slate-800 truncate">${Helpers.escapeHTML(s.name || '—')}</p>
              <p class="text-[10px] text-slate-400 font-bold truncate">${Helpers.escapeHTML(s.matricula || s.p1_name || '—')}</p>
            </div>
          </div>
        </td>
        <td class="px-4 py-3 hidden md:table-cell">
          <span class="px-2 py-1 bg-[#E8F2FF] text-[#0B63C7] text-[10px] font-black rounded-lg">${Helpers.escapeHTML(s.classrooms?.name || '—')}</span>
        </td>
        <td class="px-4 py-3 text-right">
          <span class="font-black text-sm ${hasDebt ? 'text-rose-600' : 'text-emerald-600'}">${fmt(s.totalOwed)}</span>
        </td>
        <td class="px-4 py-3 text-center hidden sm:table-cell">
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[10px] font-black ${sc.cls}">
            <span class="w-1.5 h-1.5 rounded-full ${sc.dot}"></span>
            ${sc.label}
          </span>
        </td>
        <td class="px-4 py-3 text-center">
          ${hasDebt ? `
            <button onclick="CajaCobro.selectStudent(${s.id})"
              class="px-4 py-1.5 text-[11px] font-black uppercase text-white rounded-xl transition-all active:scale-95 shadow-sm"
              style="background:linear-gradient(135deg,#0d9488,#0B63C7)">
              💳 Cobrar
            </button>
          ` : `
            <button onclick="CajaCobro.selectStudent(${s.id})"
              class="px-4 py-1.5 text-[11px] font-black uppercase text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all">
              Ver
            </button>
          `}
        </td>
      </tr>`;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

export const CajaCobro = {
    _applyFilters() {
      const q = $el('cajaSearch')?.value?.toLowerCase() || '';
      const sf = document.querySelector('.status-filter-btn.active')?.dataset?.sf || 'all';
      const filtered = _state.students.filter(s => {
        const matchQ = !q || (s.name?.toLowerCase().includes(q)) || (s.matricula?.toLowerCase().includes(q));
        const matchSf = sf === 'all' || s.status === sf;
        return matchQ && matchSf;
      });
      $el('totalPendientes').textContent = `${filtered.filter(s => s.status !== 'paid').length} pendientes`;
      _renderTable(filtered);
    },

    _filterByStatus(sf) {
      document.querySelectorAll('.status-filter-btn').forEach(b => {
        const isActive = b.dataset.sf === sf;
        b.className = 'status-filter-btn px-3 py-1.5 rounded-xl text-xs font-black transition-all ' +
          (isActive ? 'bg-[#0d9488] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200');
      });
      this._applyFilters();
    },

    _refreshStudents() {
      _loadStudents();
      _loadDayStats();
    },

    // ── Cierre de Caja ────────────────────────────────────────────────────────
    async _openCierreCaja() {
      const today = new Date().toISOString().split('T')[0];
      const { data: payments } = await supabase
        .from('payments')
        .select('amount, method, status, concept, students:student_id(name)')
        .eq('status', 'paid')
        .gte('paid_date', today + 'T00:00:00')
        .lte('paid_date', today + 'T23:59:59');

      const byMethod = {};
      let total = 0;
      (payments || []).forEach(p => {
        const m = p.method || 'efectivo';
        byMethod[m] = (byMethod[m] || 0) + Number(p.amount || 0);
        total += Number(p.amount || 0);
      });

      const methodRows = Object.entries(byMethod).map(([m, amt]) =>
        `<div class="flex justify-between py-2 border-b border-slate-100">
          <span class="font-bold text-slate-600 capitalize">${m}</span>
          <span class="font-black text-slate-800">${fmt(amt)}</span>
        </div>`
      ).join('');

      const html = `
        <div style="background:linear-gradient(135deg,#0d9488,#0B63C7);padding:20px 24px;border-radius:24px 24px 0 0">
          <h3 style="color:white;font-weight:900;font-size:1.1rem;margin:0">🏦 Cierre de Caja</h3>
          <p style="color:rgba(255,255,255,.7);font-size:.75rem;margin:4px 0 0;font-weight:700">${new Date().toLocaleDateString('es-DO',{weekday:'long',day:'numeric',month:'long'})}</p>
        </div>
        <div style="padding:20px 24px;background:#f8fafc">
          <p style="font-size:.7rem;font-weight:900;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;margin-bottom:12px">Por Método de Pago</p>
          ${methodRows || '<p style="color:#94a3b8;text-align:center;padding:12px">Sin cobros hoy</p>'}
          <div class="flex justify-between pt-3 mt-2 border-t-2 border-slate-200">
            <span style="font-weight:900;color:#1e293b;font-size:1rem">TOTAL DEL DÍA</span>
            <span style="font-weight:900;color:#0d9488;font-size:1.25rem">${fmt(total)}</span>
          </div>
          <p style="font-size:.7rem;color:#94a3b8;text-align:center;margin-top:12px">${(payments||[]).length} transacciones</p>
        </div>
        <div style="padding:12px 24px 20px;display:flex;justify-content:flex-end;gap:10px;background:white;border-radius:0 0 24px 24px">
          <button onclick="window._closeAsistenteModal()" style="padding:10px 20px;border-radius:12px;border:2px solid #e2e8f0;background:white;color:#4a5568;font-weight:800;cursor:pointer">Cerrar</button>
          <button onclick="CajaCobro._printCierre(${total},${JSON.stringify(byMethod).replace(/"/g,'&quot;')})" style="padding:10px 20px;border-radius:12px;background:linear-gradient(135deg,#0d9488,#0B63C7);color:white;border:none;font-weight:900;cursor:pointer">🖨️ Imprimir</button>
        </div>`;
      window.openGlobalModal?.(html);
    },

    _printCierre(total, byMethod) {
      const date = new Date().toLocaleDateString('es-DO', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
      const rows = Object.entries(byMethod).map(([m,a]) =>
        `<tr><td style="padding:6px 12px;color:#4a5568;text-transform:capitalize">${m}</td><td style="padding:6px 12px;text-align:right;font-weight:800">${fmt(a)}</td></tr>`
      ).join('');
      const win = window.open('','_blank');
      win.document.write(`<!DOCTYPE html><html><head><title>Cierre de Caja</title>
        <style>body{font-family:Arial,sans-serif;padding:32px;max-width:400px;margin:0 auto}
        h1{text-align:center;color:#0d9488;font-size:1.4rem}
        table{width:100%;border-collapse:collapse}td{border-bottom:1px solid #e2e8f0}
        .total{font-size:1.2rem;font-weight:900;color:#0d9488}
        .footer{text-align:center;color:#94a3b8;font-size:.8rem;margin-top:24px}
        </style></head><body>
        <h1>🏦 Cierre de Caja</h1>
        <p style="text-align:center;color:#64748b;text-transform:capitalize">${date}</p>
        <hr style="margin:16px 0">
        <table>${rows}</table>
        <hr style="margin:16px 0">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-weight:900">TOTAL</span>
          <span class="total">${fmt(total)}</span>
        </div>
        <div class="footer">Colegio Montessori Sonrisas Creativas</div>
        <script>window.onload=()=>window.print()<\/script></body></html>`);
      win.document.close();
    },

    // ── Exportar CSV ──────────────────────────────────────────────────────────
    async _exportCaja() {
      try {
        Helpers.toast('Generando reporte...', 'info');
        const today = new Date().toISOString().split('T')[0];
        const { data } = await supabase
          .from('payments')
          .select('id, amount, concept, method, status, month_paid, paid_date, created_at, students:student_id(name, matricula)')
          .order('created_at', { ascending: false })
          .limit(500);

        if (!data?.length) { Helpers.toast('Sin datos para exportar', 'warning'); return; }

        const rows = [['ID','Estudiante','Matrícula','Concepto','Monto','Método','Estado','Mes','Fecha']];
        data.forEach(p => {
          rows.push([
            p.id,
            p.students?.name || '',
            p.students?.matricula || '',
            p.concept || '',
            p.amount || 0,
            p.method || '',
            p.status || '',
            p.month_paid || '',
            (p.paid_date || p.created_at || '').split('T')[0]
          ]);
        });

        const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `cobros-${today}.csv`;
        a.click(); URL.revokeObjectURL(url);
        Helpers.toast('Reporte exportado correctamente', 'success');
      } catch (err) {
        Helpers.toast('Error al exportar: ' + err.message, 'error');
      }
    },

    async approvePayment(paymentId) {
      if (!confirm('¿Estás seguro de aprobar este pago?')) return;

      try {
        const { error } = await supabase
          .from('payments')
          .update({
            status: 'paid',
            paid_date: new Date().toISOString()
          })
          .eq('id', paymentId);

        if (error) throw error;

        // Llamar a la función para generar y enviar el recibo
        try {
          await supabase.functions.invoke('generate-invoice', {
            body: { payment_id: paymentId, send_email: true }
          });
        } catch (invoiceErr) {
          console.error('Error generando factura', invoiceErr);
        }

        Helpers.toast('Pago aprobado!', 'success');
        await _loadPendingTransfers(); // Refresh the list
        await _loadStudents(); // Refresh the student list
      } catch (e) {
        console.error('Error approving payment', e);
        Helpers.toast('Error al aprobar pago', 'error');
      }
    },

    async rejectPayment(paymentId) {
      const reason = prompt('¿Por qué estás rechazando este pago?');
      if (!reason) return;

      try {
        const { error } = await supabase
          .from('payments')
          .update({
            status: 'rejected',
            notes: reason
          })
          .eq('id', paymentId);

        if (error) throw error;

        Helpers.toast('Pago rechazado', 'info');
        await _loadPendingTransfers(); // Refresh
      } catch (e) {
        console.error('Error rejecting payment', e);
        Helpers.toast('Error al rechazar pago', 'error');
      }
    },

  async selectStudent(studentId) {
    const { data: student } = await supabase.from('students')
      .select(`
        id, name, matricula, p1_name, p1_phone, monthly_fee,
        classrooms (name, level)
      `).eq('id', studentId).single();
    if (!student) return Helpers.toast('Estudiante no encontrado', 'error');
    _state.selectedStudent = student;
    _state.cart = [];
    _state.totalMora = _state.totalDiscount = 0;
    const { data: enrollments } = await supabase.from('student_enrollments')
      .select('id').eq('student_id', studentId).order('created_at', {ascending: false}).limit(1);
    let charges = [];
    if (enrollments?.[0]?.id) {
      const { data: sc } = await supabase.from('student_charges')
        .select('id, concept, type, amount, due_date, status')
        .eq('student_enrollment_id', enrollments[0].id)
        .in('status', ['pending', 'overdue'])
        .order('due_date');
      charges = sc || [];
    }
    _state.charges = charges;
    openCobroModal();
  },

  addToCart(item) {
    if (_state.cart.find(c => c.id === item.id && item.id)) {
      return Helpers.toast('Ya está en el carrito', 'info');
    }
    _state.cart.push(item);
    _state.totalMora = _state.cart.reduce((s,i) => s + (i.mora || 0), 0);
    _updateCartUI();
    Helpers.toast(`${item.label} agregado`, 'success');
  },

  removeFromCart(idx) {
    _state.cart.splice(idx, 1);
    _state.totalMora = _state.cart.reduce((s,i) => s + (i.mora || 0),0);
    _updateCartUI();
  },

  _toggleCuota(el) {
    const id = el.dataset.id;
    const concept = el.dataset.concept;
    const amount = parseFloat(el.dataset.amount);
    if (el.checked) {
      this.addToCart({ id, label: concept, amount, type: 'cuota' });
    } else {
      const idx = _state.cart.findIndex(c => c.id === id && c.type === 'cuota');
      if (idx !== -1) this.removeFromCart(idx);
    }
  },

  _addCatalogConcept(conc) {
    let amount = conc.amount;
    if (conc.id === 'otros') {
      const custom = parseFloat(prompt('Monto (RD$):', '0') || '0');
      if (!custom || custom <=0) return;
      amount = custom;
    }
    this.addToCart({ id: `catalog-${conc.id}`, label: conc.label, amount, type: 'catalog' });
  },

  _selectPaymentMethod(method) {
    document.querySelectorAll('[data-method]').forEach(b => {
      b.classList.remove('border-teal-500','bg-teal-50');
    });
    document.querySelector(`[data-method="${method}"]`)?.classList.add('border-teal-500','bg-teal-50');
    _state.selectedPaymentMethod = method;
    _updatePaymentDetails(method);
  },

  async confirmPayment() {
    if (!_state.selectedStudent || !_state.cart.length) return;
    const btn = document.getElementById('btnConfirmarPago');
    if (btn) btn.disabled = true; btn.textContent = 'Procesando...';
    try {
      const paymentIds = [];
      for (const item of _state.cart) {
        const { data: pay, error } = await supabase.from('payments').insert({
          student_id: _state.selectedStudent.id,
          amount: item.amount,
          concept: item.label,
          method: _state.selectedPaymentMethod || 'efectivo',
          status: 'paid',
          paid_date: new Date().toISOString(),
          created_at: new Date().toISOString()
        }).select().single();
        if (error) throw error;
        paymentIds.push(pay.id);

        if (item.type === 'cuota' && item.id) {
          await supabase.from('student_charges')
            .update({ status: 'paid', paid_date: new Date().toISOString() })
            .eq('id', item.id);
        }
      }

      closeCobroModal();

      InvoiceModule.downloadSingle({
        id: paymentIds[0],
        students: {
          name: _state.selectedStudent.name,
          classrooms: { name: _state.selectedStudent.classrooms?.name || '' },
          p1_name: _state.selectedStudent.p1_name || ''
        },
        concept: _state.cart.map(i => i.label).join(', '),
        amount: _state.cart.reduce((s,i) => s+i.amount, 0),
        method: _state.selectedPaymentMethod || 'efectivo',
        paid_date: new Date().toISOString(),
        status: 'paid'
      });
      Helpers.toast('Pago registrado! Factura generada.', 'success');
      await _loadStudents();
    } catch (e) {
      console.error(e);
      Helpers.toast('Error al procesar pago', 'error');
      if (btn) btn.disabled = false; btn.textContent = 'COBRAR Y EMITIR FACTURA';
    }
  },

  showTab(tab) {
    if (tab === 'cobrar') renderCajaCobro();
    else import('./payments.js').then(m => m.PaymentsModule.init()).catch(()=>{});
  }
};

function _updateCartUI() {
  const cartList = document.getElementById('cartList');
  if (!cartList) return;
  const totalCart = _state.cart.reduce((sum, i) => sum + i.amount, 0);
  const total = totalCart + _state.totalMora - _state.totalDiscount;
  cartList.innerHTML = _state.cart.length ? _state.cart.map((item, idx) => `
    <div class="flex items-center justify-between p-3 bg-teal-50 rounded-xl border border-teal-100">
      <div class="flex-1 min-w-0">
        <div class="text-sm font-bold text-slate-700">${Helpers.escapeHTML(item.label)}</div>
        ${item.mora ? `<div class="text-[10px] text-red-500">+mora ${fmt(item.mora)}</div>` : ''}
      </div>
      <div class="font-black text-teal-700 mx-3">${fmt(item.amount + (item.mora||0))}</div>
      <button onclick="CajaCobro.removeFromCart(${idx})" class="w-6 h-6 rounded-lg bg-red-50 text-red-400 hover:bg-red-100 flex items-center justify-center">
        <i data-lucide="x" class="w-3 h-3"></i>
      </button>
    </div>
  `).join('') : `
    <div class="text-center py-4 text-slate-300 text-sm font-bold">
      <i data-lucide="shopping-cart" class="w-8 h-8 mx-auto mb-2 opacity-40"></i>
      Selecciona conceptos
    </div>
  `;

  const totalEl = $el('ccTotal');
  const cartCount = $el('ccCartCount');
  if (totalEl) totalEl.textContent = fmt(total);
  if (cartCount) cartCount.textContent = `${_state.cart.length} item${_state.cart.length !==1 ? 's' : ''}`;

  const btn = document.getElementById('btnConfirmarPago');
  if (btn) btn.disabled = _state.cart.length === 0;

  if (window.lucide) lucide.createIcons();
}

function _updatePaymentDetails(method) {
  const detailsEl = document.getElementById('paymentMethodDetails');
  if (!detailsEl) return;
  const ic = 'w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-teal-500';

  switch (method) {
    case 'efectivo':
      detailsEl.innerHTML = `
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="text-[9px] font-black text-slate-400 uppercase block mb-1">Monto Recibido</label>
            <input type="number" id="montoRecibido" step="0.01" placeholder="0.00" class="${ic}" oninput="calculateChange()">
          </div>
          <div>
            <label class="text-[9px] font-black text-slate-400 uppercase block mb-1">Cambio</label>
            <div id="montoCambio" class="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-green-600 bg-green-50">RD$0.00</div>
          </div>
        </div>`;
      break;
    case 'transferencia':
      detailsEl.innerHTML = `
        <div class="space-y-2">
          <input type="text" placeholder="Banco" class="${ic}">
          <input type="text" placeholder="Referencia" class="${ic}">
        </div>`;
      break;
    default:
      detailsEl.innerHTML = '';
  }
  const btn = document.getElementById('btnConfirmarPago');
  if (btn) btn.disabled = _state.cart.length ===0;
}

function calculateChange() {
  const totalCart = _state.cart.reduce((s,i) => s+i.amount,0);
  const total = totalCart + _state.totalMora - _state.totalDiscount;
  const recibido = parseFloat(document.getElementById('montoRecibido')?.value || '0');
  const cambio = Math.max(0, recibido - total);
  const el = document.getElementById('montoCambio');
  if (el) el.textContent = fmt(cambio);
}

function openCobroModal() {
  if (!_state.selectedStudent) return;
  const s = _state.selectedStudent;
  const totalCart = _state.cart.reduce((sum, i) => sum+i.amount, 0);
  const total = totalCart + _state.totalMora - _state.totalDiscount;

  const modalHTML = `
  <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-start justify-center p-4 overflow-y-auto" id="cajaModalOverlay">
    <div class="bg-white rounded-3xl overflow-hidden w-full max-w-3xl my-4 shadow-2xl">
      <div class="p-5 border-b border-slate-100" style="background: linear-gradient(135deg, #0B63C7, #0850A0)">
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center text-white text-2xl font-black flex-shrink-0">
              ${s.name.charAt(0).toUpperCase()}
            </div>
            <div class="text-white min-w-0">
              <h3 class="text-lg font-black truncate">${Helpers.escapeHTML(s.name)}</h3>
              <p class="text-xs font-bold opacity-80 truncate">${s.classrooms?.name || '—'} · ${s.matricula || '—'}</p>
            </div>
          </div>
          <button onclick="closeCobroModal()" class="w-9 h-9 flex items-center justify-center bg-white/20 hover:bg-white/30 rounded-xl text-white transition-all flex-shrink-0">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>
      </div>

      <div class="p-5 space-y-4 overflow-y-auto max-h-[70vh]">
        <!-- Estado financiero — meses compactos -->
        <div class="bg-slate-50 rounded-2xl p-4">
          <h4 class="text-xs font-black text-slate-600 uppercase tracking-wider mb-3">Estado Mensual ${new Date().getFullYear()}</h4>
          <div class="grid grid-cols-6 gap-1.5">
            ${months.map((m, i) => {
              const isPaid = false;
              const isOverdue = i < new Date().getMonth();
              const isCurrent = i === new Date().getMonth();
              const bg = isPaid ? 'bg-[#E6F7EB] text-[#28B54D]' : isOverdue ? 'bg-red-50 text-red-600' : isCurrent ? 'bg-[#E8F2FF] text-[#0B63C7]' : 'bg-white text-slate-400';
              const icon = isPaid ? '✓' : isOverdue ? '·' : isCurrent ? '→' : '○';
              return `<div class="rounded-xl p-1.5 text-center border border-slate-100 ${bg}">
                <div class="text-[9px] font-black uppercase">${m.slice(0,3)}</div>
                <div class="text-sm font-black leading-none mt-0.5">${icon}</div>
              </div>`;
            }).join('')}
          </div>
        </div>

        <!-- Cuotas pendientes -->
        <div class="bg-white rounded-2xl border border-slate-100 p-4">
          <h4 class="text-sm font-black text-slate-800 mb-3 flex items-center gap-2">
            <i data-lucide="clock" class="w-4 h-4 text-[#0B63C7]"></i> Cuotas Pendientes
          </h4>
          <div class="space-y-2 max-h-48 overflow-y-auto" id="cuotasList">
            ${(_state.charges || []).length ? (_state.charges || []).map(c => `
              <label class="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border-2 border-transparent hover:border-[#0B63C7] cursor-pointer transition-all">
                <input type="checkbox" class="w-4 h-4 accent-[#0B63C7]"
                  data-id="${c.id}" data-concept="${Helpers.escapeHTML(c.concept || c.type)}"
                  data-amount="${c.amount}" onchange="CajaCobro._toggleCuota(this)">
                <div class="flex-1 min-w-0">
                  <div class="text-xs font-black text-slate-700 truncate">${Helpers.escapeHTML(c.concept || c.type)}</div>
                  <div class="text-[10px] text-slate-400">${c.due_date || ''}</div>
                </div>
                <div class="text-sm font-black text-slate-800 flex-shrink-0">RD$${fmtN(c.amount)}</div>
              </label>`).join('')
            : '<p class="text-xs text-slate-400 text-center py-3">Sin cuotas pendientes</p>'}
          </div>
        </div>

        <!-- Otros conceptos (catálogo) -->
        <div class="bg-white rounded-2xl border border-slate-100 p-4">
          <div class="flex items-center justify-between mb-3">
            <h4 class="text-sm font-black text-slate-800 flex items-center gap-2">
              <i data-lucide="tag" class="w-4 h-4 text-[#FF7A00]"></i> Conceptos Extra
            </h4>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
            ${_state.concepts.map(conc => `
              <button onclick='CajaCobro._addCatalogConcept(${JSON.stringify({id: conc.id, label: conc.name, amount: conc.amount}).replace(/'/g, "&apos;")})'
                class="p-3 text-left border-2 border-slate-100 rounded-xl hover:border-[#0B63C7] hover:bg-[#E8F2FF] transition-all">
                <div class="text-xs font-black text-slate-700 truncate">${Helpers.escapeHTML(conc.name)}</div>
                ${conc.amount > 0 ? `<div class="text-sm font-black text-[#0B63C7] mt-0.5">RD$${fmtN(conc.amount)}</div>` : '<div class="text-[10px] text-slate-400 mt-0.5">Monto libre</div>'}
              </button>`).join('')}
          </div>
        </div>

        <!-- Carrito -->
        <div class="bg-white rounded-2xl border border-slate-100 p-4">
          <h4 class="text-sm font-black text-slate-800 mb-3 flex items-center gap-2">
            <i data-lucide="shopping-cart" class="w-4 h-4 text-[#0B63C7]"></i>
            Carrito
            <span id="ccCartCount" class="ml-auto text-xs font-black text-[#0B63C7] bg-[#E8F2FF] px-2 py-0.5 rounded-full">0 items</span>
          </h4>
          <div id="cartList" class="space-y-2 min-h-[48px]">
            <div class="text-center py-3 text-slate-300 text-xs font-bold">Selecciona conceptos arriba</div>
          </div>
          <div class="mt-3 pt-3 border-t border-slate-100 space-y-1">
            ${_state.totalDiscount > 0 ? `<div class="flex justify-between text-xs text-green-600"><span class="font-bold">Descuento</span><span class="font-black">-RD$${fmtN(_state.totalDiscount)}</span></div>` : ''}
            ${_state.totalMora > 0 ? `<div class="flex justify-between text-xs text-red-600"><span class="font-bold">Mora</span><span class="font-black">+RD$${fmtN(_state.totalMora)}</span></div>` : ''}
            <div class="flex justify-between items-center pt-2">
              <span class="text-sm font-black text-slate-800 uppercase">TOTAL</span>
              <span id="ccTotal" class="text-xl font-black text-[#0B63C7]">${fmt(total)}</span>
            </div>
          </div>
        </div>

        <!-- Método de pago -->
        <div class="bg-white rounded-2xl border border-slate-100 p-4">
          <h4 class="text-sm font-black text-slate-800 mb-3">Método de Pago</h4>
          <div class="grid grid-cols-3 gap-2">
            ${[
              {id:'efectivo', label:'💵 Efectivo'},
              {id:'tarjeta', label:'💳 Tarjeta'},
              {id:'transferencia', label:'🏦 Transferencia'},
            ].map(m => `
              <button onclick="CajaCobro._selectPaymentMethod('${m.id}')" data-method="${m.id}"
                class="py-3 px-2 text-center border-2 border-slate-100 rounded-xl hover:border-[#0B63C7] transition-all text-xs font-black text-slate-700">
                ${m.label}
              </button>`).join('')}
          </div>
          <div id="paymentMethodDetails" class="mt-3"></div>
        </div>
      </div>

      <div class="p-4 bg-white border-t border-slate-100 flex items-center justify-between gap-3">
        <button onclick="closeCobroModal()" class="px-5 py-2.5 text-slate-500 font-black text-xs uppercase border-2 border-slate-200 rounded-xl hover:bg-slate-50 transition-all">Cancelar</button>
        <button onclick="CajaCobro.confirmPayment()" id="btnConfirmarPago" disabled
          class="px-8 py-2.5 text-white font-black text-sm uppercase rounded-xl transition-all disabled:opacity-50"
          style="background:linear-gradient(135deg,#0B63C7,#0850A0); box-shadow:0 4px 12px rgba(11,99,199,.3)">
          COBRAR Y EMITIR FACTURA
        </button>
      </div>
    </div>
  </div>`;
  const modalContainer = document.createElement('div');
  modalContainer.innerHTML = modalHTML;
  document.body.appendChild(modalContainer);
  if (window.lucide) lucide.createIcons();
}

async function _loadConcepts() {
  try {
    const { data, error } = await supabase
      .from('payment_concepts')
      .select('*')
      .order('name');
    if (error) throw error;
    _state.concepts = data || [];
  } catch (e) {
    console.error('Error loading concepts:', e);
    // Fall back to static array if table doesn't exist
    _state.concepts = CONCEPTOS_CATALOGO.map(c => ({ id: c.id, name: c.label, amount: c.amount }));
  }
}

function _openConceptModal(concept = null) {
  const isEdit = !!concept;
  const modalHTML = `
  <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4" id="conceptModalOverlay">
    <div class="bg-white rounded-2xl overflow-hidden w-full max-w-md shadow-2xl">
      <div class="p-5 border-b border-slate-100" style="background: linear-gradient(135deg, #0d9488, #0f766e)">
        <h3 class="text-lg font-black text-white">${isEdit ? 'Editar Concepto' : 'Nuevo Concepto'}</h3>
      </div>
      <div class="p-5">
        <div class="space-y-4">
          <div>
            <label class="block text-xs font-black text-slate-400 uppercase mb-1">Nombre</label>
            <input id="conceptName" type="text" value="${concept?.name || ''}" class="w-full border-2 border-slate-100 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-teal-500">
          </div>
          <div>
            <label class="block text-xs font-black text-slate-400 uppercase mb-1">Monto (RD$)</label>
            <input id="conceptAmount" type="number" value="${concept?.amount || 0}" class="w-full border-2 border-slate-100 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-teal-500">
          </div>
        </div>
      </div>
      <div class="p-5 border-t border-slate-100 flex justify-end gap-3">
        <button onclick="CajaCobro._closeConceptModal()" class="px-4 py-2 text-slate-500 font-black text-xs uppercase border-2 border-slate-200 rounded-xl hover:bg-slate-50">Cancelar</button>
        <button onclick="CajaCobro._saveConcept(${concept?.id || 'null'})" class="px-4 py-2 text-white font-black text-xs uppercase rounded-xl" style="background:#0d9488">${isEdit ? 'Guardar' : 'Crear'}</button>
      </div>
    </div>
  </div>`;
  const container = document.createElement('div');
  container.innerHTML = modalHTML;
  document.body.appendChild(container);
  if (window.lucide) lucide.createIcons();
}

function _closeConceptModal() {
  document.getElementById('conceptModalOverlay')?.remove();
}

async function _saveConcept(id) {
  const name = document.getElementById('conceptName').value.trim();
  const amount = parseFloat(document.getElementById('conceptAmount').value);

  if (!name) {
    Helpers.toast('Ingresa un nombre', 'warning');
    return;
  }

  try {
    if (id) {
      // Edit existing
      const { error } = await supabase
        .from('payment_concepts')
        .update({ name, amount })
        .eq('id', id);
      if (error) throw error;
      Helpers.toast('Concepto actualizado', 'success');
    } else {
      // Create new
      const { error } = await supabase
        .from('payment_concepts')
        .insert({ name, amount });
      if (error) throw error;
      Helpers.toast('Concepto creado', 'success');
    }
    _closeConceptModal();
    await _loadConcepts();
    // Re-render cobro modal if open
    if (_state.selectedStudent) {
      openCobroModal();
    }
  } catch (e) {
    console.error('Error saving concept:', e);
    Helpers.toast('Error al guardar concepto', 'error');
  }
}

async function _deleteConcept(id) {
  if (!confirm('¿Estás seguro de eliminar este concepto?')) return;

  try {
    const { error } = await supabase
      .from('payment_concepts')
      .delete()
      .eq('id', id);
    if (error) throw error;
    Helpers.toast('Concepto eliminado', 'success');
    await _loadConcepts();
    // Re-render cobro modal if open
    if (_state.selectedStudent) {
      openCobroModal();
    }
  } catch (e) {
    console.error('Error deleting concept:', e);
    Helpers.toast('Error al eliminar concepto', 'error');
  }
}

function closeCobroModal() {
  const el = document.getElementById('cajaModalOverlay');
  if (el) el.remove();
}

// Add to CajaCobro object
CajaCobro._loadConcepts = _loadConcepts;
CajaCobro._openConceptModal = _openConceptModal;
CajaCobro._closeConceptModal = _closeConceptModal;
CajaCobro._saveConcept = _saveConcept;
CajaCobro._deleteConcept = _deleteConcept;

window.CajaCobro = CajaCobro;
window.calculateChange = calculateChange;
