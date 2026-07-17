/**
 * Accounting Module PRO — Panel Asistente
 * Suite contable completa: Dashboard, Pagos, CxC, CxP, Caja, Nómina, DGII
 */
import { supabase } from '../shared/supabase.js';
import { Helpers } from '../shared/helpers.js';

const fmt  = n => 'RD$' + Number(n||0).toLocaleString('es-DO', { minimumFractionDigits: 2 });
const $a   = id => document.getElementById(id);
const esc  = s => Helpers.escapeHTML(s);
const PAGE_SIZE = 25;

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const TABS = [
  { id: 'dashboard', icon: 'layout-dashboard', label: 'Dashboard'     },
  { id: 'pagos',     icon: 'receipt',           label: 'Pagos'         },
  { id: 'cxc',       icon: 'users',             label: 'CxC Padres'    },
  { id: 'cxp',       icon: 'shopping-cart',     label: 'CxP'           },
  { id: 'caja',      icon: 'vault',             label: 'Caja'          },
  { id: 'nomina',    icon: 'briefcase',         label: 'Nómina'        },
  { id: 'dgii',      icon: 'landmark',          label: 'DGII'          },
  { id: 'config',    icon: 'settings-2',        label: 'Configuración' },
];

// ── Pagination helper ────────────────────────────────────────────────────────
function buildPager(current, totalPages, totalRecords, callbackStr) {
  if (totalPages <= 1) return `<span class="text-xs text-slate-400 font-bold">${totalRecords} registros</span>`;
  const btn = (p, lbl, disabled, active) =>
    `<button onclick="${callbackStr}(${p})" class="px-3 py-1.5 rounded-lg text-xs font-black transition-all ${active?'text-white':'bg-white border border-slate-200 text-slate-600 hover:border-[#28B54D] hover:text-[#28B54D]'} ${disabled?'opacity-40 pointer-events-none':''}" ${active?'style="background:#28B54D"':''}>${lbl}</button>`;
  let html = `<div class="flex items-center gap-1 flex-wrap">`;
  html += btn(1,'«', current===1, false);
  html += btn(current-1,'‹', current===1, false);
  const s = Math.max(1, current-2), e = Math.min(totalPages, s+4);
  for (let i=s; i<=e; i++) html += btn(i, i, false, i===current);
  html += btn(current+1,'›', current===totalPages, false);
  html += btn(totalPages,'»', current===totalPages, false);
  html += `<span class="text-xs text-slate-400 font-bold ml-2">${totalRecords} registros · Página ${current}/${totalPages}</span></div>`;
  return html;
}

const ST = {
  paid:     { lbl:'Pagado',       cls:'bg-emerald-100 text-emerald-700' },
  pending:  { lbl:'Pendiente',    cls:'bg-amber-100 text-amber-700'     },
  overdue:  { lbl:'Vencido',      cls:'bg-rose-100 text-rose-700'       },
  review:   { lbl:'En revisión',  cls:'bg-blue-100 text-blue-700'       },
  rejected: { lbl:'Rechazado',    cls:'bg-slate-100 text-slate-500'     },
};

export const AssistantAccountingModule = {
  _tab: 'dashboard',
  _allPayments: [],
  _filteredPayments: [],
  _pagosPage: 1,
  _cxcPage: 1,
  _cxpPage: 1,
  _nominaPage: 1,
  _chart: null,
  _chartMethod: null,

  async init() {
    this._renderShell();
    await this.showTab('dashboard');
  },

  _renderShell() {
    const sec = $a('contabilidad');
    if (!sec) return;
    sec.innerHTML = `
      <div class="flex items-center gap-3 mb-5">
        <div class="w-10 h-10 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-lg"
          style="background:linear-gradient(135deg,#28B54D,#1A8035)">
          <i data-lucide="bar-chart-big" class="w-5 h-5"></i>
        </div>
        <div>
          <h1 class="text-2xl font-black text-slate-800">Contabilidad</h1>
          <p class="text-xs text-slate-400 font-bold uppercase tracking-wide">Suite financiera institucional</p>
        </div>
      </div>

      <!-- Tabs scroll horizontal -->
      <div class="overflow-x-auto pb-1 mb-6">
        <div class="flex gap-1 border-b border-slate-100 min-w-max">
          ${TABS.map(t => `
            <button data-atab="${t.id}" onclick="AssistantAccountingModule.showTab('${t.id}')"
              class="acct-tab flex items-center gap-1.5 px-4 py-2.5 text-xs font-black border-b-2 -mb-px transition-all whitespace-nowrap">
              <i data-lucide="${t.icon}" class="w-3.5 h-3.5"></i>${t.label}
            </button>`).join('')}
        </div>
      </div>

      <div id="acct-content" class="min-h-[400px]"></div>
    `;
    if (window.lucide) lucide.createIcons();
  },

  async showTab(tab) {
    this._tab = tab;
    document.querySelectorAll('.acct-tab').forEach(b => {
      const on = b.dataset.atab === tab;
      b.style.cssText = on ? 'border-color:#28B54D;color:#28B54D' : 'border-color:transparent;color:#94a3b8';
    });
    const c = $a('acct-content');
    if (c) c.innerHTML = `<div class="flex justify-center py-16"><div class="w-8 h-8 border-2 border-[#28B54D] border-t-transparent rounded-full animate-spin"></div></div>`;

    if (tab === 'dashboard')  await this._loadDashboard();
    else if (tab === 'pagos') await this._loadPagos();
    else if (tab === 'cxc')   await this._loadCxC();
    else if (tab === 'cxp')   await this._loadCxP();
    else if (tab === 'caja')  await this._loadCaja();
    else if (tab === 'nomina') await this._loadNomina();
    else if (tab === 'dgii')  this._renderDGII();
    else if (tab === 'config') this._renderConfig();
  },


  // ══════════════════════════════════════════════════════════════
  // DASHBOARD FINANCIERO
  // ══════════════════════════════════════════════════════════════
  async _loadDashboard() {
    const c = $a('acct-content');
    if (!c) return;
    try {
      const today = new Date();
      const y = today.getFullYear();
      const m = String(today.getMonth()+1).padStart(2,'0');
      const monthKey = `${y}-${m}`;
      const prevMonth = today.getMonth() === 0
        ? `${y-1}-12`
        : `${y}-${String(today.getMonth()).padStart(2,'0')}`;

      const [{ data: paymentsAll }, { data: charges }, { data: profiles }] = await Promise.all([
        supabase.from('payments').select('id,amount,concept,status,method,paid_date,created_at,month_paid').order('created_at',{ascending:false}),

        supabase.from('payments').select('id,amount,status,student_id').eq('status','pending'),
        supabase.from('profiles').select('id,name,role').in('role',['maestra','asistente'])
      ]);

      const paid    = (paymentsAll||[]).filter(p => p.status==='paid');
      const inMonth = paid.filter(p => (p.month_paid||'').startsWith(monthKey) || (p.paid_date||'').startsWith(monthKey));
      const inPrev  = paid.filter(p => (p.month_paid||'').startsWith(prevMonth) || (p.paid_date||'').startsWith(prevMonth));

      const totalMes  = inMonth.reduce((s,p) => s + Number(p.amount||0), 0);
      const totalPrev = inPrev.reduce((s,p)  => s + Number(p.amount||0), 0);
      const pendTotal = (charges||[]).reduce((s,p) => s + Number(p.amount||0), 0);
      const pct = totalPrev > 0 ? ((totalMes - totalPrev) / totalPrev * 100).toFixed(1) : '0.0';
      const pctColor = Number(pct) >= 0 ? '#28B54D' : '#ef4444';

      // Method breakdown
      const methodMap = {};
      (paymentsAll||[]).forEach(p => {
        if (p.status !== 'paid') return;
        const k = p.method || 'efectivo';
        methodMap[k] = (methodMap[k]||0) + Number(p.amount||0);
      });

      // Recent 8
      const recent = paid.slice(0,8);

      c.innerHTML = `
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div class="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
            <p class="text-[10px] font-black uppercase text-slate-400 mb-1">Cobrado este mes</p>
            <p class="text-2xl font-black text-emerald-600">${fmt(totalMes)}</p>
            <p class="text-xs font-bold mt-1" style="color:${pctColor}">${Number(pct)>=0?'+':''}${pct}% vs mes anterior</p>
          </div>
          <div class="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
            <p class="text-[10px] font-black uppercase text-slate-400 mb-1">Total cobrado</p>
            <p class="text-2xl font-black text-blue-600">${fmt(paid.reduce((s,p)=>s+Number(p.amount||0),0))}</p>
            <p class="text-xs text-slate-400 font-bold">${paid.length} pagos</p>
          </div>
          <div class="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
            <p class="text-[10px] font-black uppercase text-slate-400 mb-1">Pendiente</p>
            <p class="text-2xl font-black text-amber-600">${fmt(pendTotal)}</p>
            <p class="text-xs text-slate-400 font-bold">${(charges||[]).length} cobros</p>
          </div>
          <div class="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
            <p class="text-[10px] font-black uppercase text-slate-400 mb-1">Personal activo</p>
            <p class="text-2xl font-black text-violet-600">${(profiles||[]).length}</p>
            <p class="text-xs text-slate-400 font-bold">maestras y asistentes</p>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <h3 class="font-black text-slate-700 mb-4 flex items-center gap-2">
              <i data-lucide="pie-chart" class="w-4 h-4 text-emerald-600"></i>Por método
            </h3>
            <div class="space-y-2">
              ${Object.entries(methodMap).map(([k,v]) => `
                <div class="flex items-center justify-between">
                  <span class="text-sm font-bold text-slate-600 capitalize">${k}</span>
                  <span class="text-sm font-black text-slate-800">${fmt(v)}</span>
                </div>`).join('') || '<p class="text-slate-400 text-sm">Sin datos</p>'}
            </div>
          </div>
          <div class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <h3 class="font-black text-slate-700 mb-4 flex items-center gap-2">
              <i data-lucide="clock" class="w-4 h-4 text-blue-600"></i>Últimos pagos
            </h3>
            <div class="space-y-2 overflow-y-auto max-h-52">
              ${recent.map(p => `
                <div class="flex items-center justify-between py-1.5 border-b border-slate-50">
                  <div>
                    <p class="text-xs font-bold text-slate-700">${esc(p.concept||'Pago')}</p>
                    <p class="text-[10px] text-slate-400">${p.paid_date ? new Date(p.paid_date).toLocaleDateString('es-DO') : '-'}</p>
                  </div>
                  <span class="text-sm font-black text-emerald-600">${fmt(p.amount)}</span>
                </div>`).join('') || '<p class="text-slate-400 text-sm">Sin pagos</p>'}
            </div>
          </div>
        </div>`;
      if (window.lucide) lucide.createIcons();
    } catch(e) {
      const c = $a('acct-content');
      if (c) c.innerHTML = `<p class="text-rose-500 p-4">Error: ${esc(e.message)}</p>`;
    }
  },

  // ══════════════════════════════════════════════════════════════
  // PAGOS
  // ══════════════════════════════════════════════════════════════
  async _loadPagos(page = 1) {
    this._pagosPage = page;
    const c = $a('acct-content');
    if (!c) return;
    try {
      const from = (page - 1) * PAGE_SIZE;
      const { data, error, count } = await supabase
        .from('payments')
        .select(`id,concept,amount,status,method,paid_date,created_at,
          students!student_id(name,matricula)`, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;

      const totalPages = Math.ceil((count||0) / PAGE_SIZE);
      c.innerHTML = `
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-black text-slate-700">Historial de Pagos</h3>
          ${buildPager(page, totalPages, count||0, 'AssistantAccountingModule._loadPagos')}
        </div>
        <div class="overflow-x-auto rounded-2xl border border-slate-100">
          <table class="w-full text-sm">
            <thead class="bg-slate-50">
              <tr>${['Estudiante','Concepto','Monto','Método','Estado','Fecha'].map(h=>`<th class="px-4 py-3 text-left text-[10px] font-black uppercase text-slate-400">${h}</th>`).join('')}</tr>
            </thead>
            <tbody class="divide-y divide-slate-50">
              ${(data||[]).map(p => {
                const st = ST[p.status] || ST.pending;
                return `<tr class="hover:bg-slate-50">
                  <td class="px-4 py-3 font-bold text-slate-700">${esc(p.students?.name||'—')}</td>
                  <td class="px-4 py-3 text-slate-500">${esc(p.concept||'—')}</td>
                  <td class="px-4 py-3 font-black text-slate-800">${fmt(p.amount)}</td>
                  <td class="px-4 py-3 text-slate-500 capitalize">${p.method||'—'}</td>
                  <td class="px-4 py-3"><span class="px-2 py-0.5 rounded-full text-[10px] font-black ${st.cls}">${st.lbl}</span></td>
                  <td class="px-4 py-3 text-slate-400 text-xs">${p.paid_date ? new Date(p.paid_date).toLocaleDateString('es-DO') : (p.created_at ? new Date(p.created_at).toLocaleDateString('es-DO') : '—')}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`;
      if (window.lucide) lucide.createIcons();
    } catch(e) {
      if (c) c.innerHTML = `<p class="text-rose-500 p-4">Error: ${esc(e.message)}</p>`;
    }
  },

  // ══════════════════════════════════════════════════════════════
  // CUENTAS POR COBRAR
  // ══════════════════════════════════════════════════════════════
  async _loadCxC(page = 1) {
    this._cxcPage = page;
    const c = $a('acct-content');
    if (!c) return;
    try {
      const from = (page - 1) * PAGE_SIZE;
      const { data, error, count } = await supabase
        .from('payments')
        .select(`id,concept,amount,status,due_date,
          students!student_id(name,matricula)`, { count: 'exact' })
        .in('status', ['pending','overdue','review'])
        .order('due_date', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;

      const totalPages = Math.ceil((count||0) / PAGE_SIZE);
      const totalPend  = (data||[]).reduce((s,p) => s + Number(p.amount||0), 0);

      c.innerHTML = `
        <div class="mb-4 p-4 bg-amber-50 border border-amber-100 rounded-2xl flex items-center justify-between">
          <div>
            <p class="text-[10px] font-black uppercase text-amber-600">Total pendiente por cobrar</p>
            <p class="text-2xl font-black text-amber-700">${fmt(totalPend)}</p>
          </div>
          ${buildPager(page, totalPages, count||0, 'AssistantAccountingModule._loadCxC')}
        </div>
        <div class="overflow-x-auto rounded-2xl border border-slate-100">
          <table class="w-full text-sm">
            <thead class="bg-slate-50">
              <tr>${['Estudiante','Concepto','Monto','Vencimiento','Estado'].map(h=>`<th class="px-4 py-3 text-left text-[10px] font-black uppercase text-slate-400">${h}</th>`).join('')}</tr>
            </thead>
            <tbody class="divide-y divide-slate-50">
              ${(data||[]).map(p => {
                const st = ST[p.status] || ST.pending;
                const due = p.due_date ? new Date(p.due_date+'T00:00:00') : null;
                const isOverdue = due && due < new Date().setHours(0,0,0,0);
                return `<tr class="hover:bg-slate-50 ${isOverdue?'bg-rose-50/30':''}">
                  <td class="px-4 py-3 font-bold text-slate-700">${esc(p.students?.name||'—')}</td>
                  <td class="px-4 py-3 text-slate-500">${esc(p.concept||'—')}</td>
                  <td class="px-4 py-3 font-black text-slate-800">${fmt(p.amount)}</td>
                  <td class="px-4 py-3 text-xs ${isOverdue?'text-rose-600 font-black':'text-slate-400'}">${due ? due.toLocaleDateString('es-DO') : '—'}</td>
                  <td class="px-4 py-3"><span class="px-2 py-0.5 rounded-full text-[10px] font-black ${st.cls}">${st.lbl}</span></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`;
      if (window.lucide) lucide.createIcons();
    } catch(e) {
      if (c) c.innerHTML = `<p class="text-rose-500 p-4">Error: ${esc(e.message)}</p>`;
    }
  },

  // ══════════════════════════════════════════════════════════════
  // CUENTAS POR PAGAR (placeholder)
  // ══════════════════════════════════════════════════════════════
  async _loadCxP() {
    const c = $a('acct-content');
    if (!c) return;
    c.innerHTML = `
      <div class="p-10 text-center text-slate-400">
        <div class="w-16 h-16 rounded-2xl bg-slate-100 mx-auto mb-4 flex items-center justify-center">
          <i data-lucide="shopping-cart" class="w-8 h-8 text-slate-300"></i>
        </div>
        <p class="font-black text-slate-500">Cuentas por Pagar</p>
        <p class="text-sm mt-1">Módulo disponible próximamente</p>
      </div>`;
    if (window.lucide) lucide.createIcons();
  },

  // ══════════════════════════════════════════════════════════════
  // CAJA DIARIA
  // ══════════════════════════════════════════════════════════════
  async _loadCaja() {
    const c = $a('acct-content');
    if (!c) return;
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('payments')
        .select('id,concept,amount,method,paid_date,students!student_id(name)')
        .eq('status','paid')
        .gte('paid_date', today + 'T00:00:00')
        .lte('paid_date', today + 'T23:59:59')
        .order('paid_date', { ascending: false });
      if (error) throw error;

      const totalHoy = (data||[]).reduce((s,p) => s + Number(p.amount||0), 0);
      c.innerHTML = `
        <div class="mb-4 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl">
          <p class="text-[10px] font-black uppercase text-emerald-600">Recaudado hoy</p>
          <p class="text-3xl font-black text-emerald-700">${fmt(totalHoy)}</p>
          <p class="text-xs text-emerald-500 font-bold">${(data||[]).length} transacciones · ${today}</p>
        </div>
        <div class="overflow-x-auto rounded-2xl border border-slate-100">
          <table class="w-full text-sm">
            <thead class="bg-slate-50">
              <tr>${['Estudiante','Concepto','Método','Monto'].map(h=>`<th class="px-4 py-3 text-left text-[10px] font-black uppercase text-slate-400">${h}</th>`).join('')}</tr>
            </thead>
            <tbody class="divide-y divide-slate-50">
              ${(data||[]).map(p => `
                <tr class="hover:bg-slate-50">
                  <td class="px-4 py-3 font-bold text-slate-700">${esc(p.students?.name||'—')}</td>
                  <td class="px-4 py-3 text-slate-500">${esc(p.concept||'—')}</td>
                  <td class="px-4 py-3 text-slate-500 capitalize">${p.method||'—'}</td>
                  <td class="px-4 py-3 font-black text-emerald-600">${fmt(p.amount)}</td>
                </tr>`).join('') || '<tr><td colspan="4" class="text-center py-8 text-slate-400">Sin movimientos hoy</td></tr>'}
            </tbody>
          </table>
        </div>`;
      if (window.lucide) lucide.createIcons();
    } catch(e) {
      if (c) c.innerHTML = `<p class="text-rose-500 p-4">Error: ${esc(e.message)}</p>`;
    }
  },

  // ══════════════════════════════════════════════════════════════
  // NÓMINA
  // ══════════════════════════════════════════════════════════════
  async _loadNomina(page = 1) {
    this._nominaPage = page;
    const c = $a('acct-content');
    if (!c) return;
    try {
      const { data, error, count } = await supabase
        .from('profiles')
        .select('id,name,role,phone,access_code', { count: 'exact' })
        .in('role', ['maestra','asistente','encargada'])
        .eq('is_active', true)
        .order('name');
      if (error) throw error;

      c.innerHTML = `
        <div class="mb-4 flex items-center justify-between">
          <h3 class="font-black text-slate-700">Personal Activo</h3>
          <span class="text-xs font-black text-slate-400">${count||0} registros</span>
        </div>
        <div class="overflow-x-auto rounded-2xl border border-slate-100">
          <table class="w-full text-sm">
            <thead class="bg-slate-50">
              <tr>${['Nombre','Rol','Teléfono','Código Acceso'].map(h=>`<th class="px-4 py-3 text-left text-[10px] font-black uppercase text-slate-400">${h}</th>`).join('')}</tr>
            </thead>
            <tbody class="divide-y divide-slate-50">
              ${(data||[]).map(p => `
                <tr class="hover:bg-slate-50">
                  <td class="px-4 py-3 font-bold text-slate-700">${esc(p.name||'—')}</td>
                  <td class="px-4 py-3"><span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-700 capitalize">${p.role}</span></td>
                  <td class="px-4 py-3 text-slate-500">${p.phone||'—'}</td>
                  <td class="px-4 py-3 font-mono text-xs text-slate-400">${p.access_code||'—'}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
      if (window.lucide) lucide.createIcons();
    } catch(e) {
      if (c) c.innerHTML = `<p class="text-rose-500 p-4">Error: ${esc(e.message)}</p>`;
    }
  },

  // ══════════════════════════════════════════════════════════════
  // DGII (placeholder)
  // ══════════════════════════════════════════════════════════════
  _renderDGII() {
    const c = $a('acct-content');
    if (!c) return;
    c.innerHTML = `
      <div class="p-10 text-center text-slate-400">
        <div class="w-16 h-16 rounded-2xl bg-slate-100 mx-auto mb-4 flex items-center justify-center">
          <i data-lucide="landmark" class="w-8 h-8 text-slate-300"></i>
        </div>
        <p class="font-black text-slate-500">Reportes DGII</p>
        <p class="text-sm mt-1">Comprobantes fiscales y reportes 606/607 próximamente</p>
      </div>`;
    if (window.lucide) lucide.createIcons();
  },

  // ══════════════════════════════════════════════════════════════
  // CONFIGURACIÓN (placeholder)
  // ══════════════════════════════════════════════════════════════
  _renderConfig() {
    const c = $a('acct-content');
    if (!c) return;
    c.innerHTML = `
      <div class="p-10 text-center text-slate-400">
        <div class="w-16 h-16 rounded-2xl bg-slate-100 mx-auto mb-4 flex items-center justify-center">
          <i data-lucide="settings-2" class="w-8 h-8 text-slate-300"></i>
        </div>
        <p class="font-black text-slate-500">Configuración Contable</p>
        <p class="text-sm mt-1">Ajustes de cuentas y parámetros fiscales próximamente</p>
      </div>`;
    if (window.lucide) lucide.createIcons();
  }
};

window.AssistantAccountingModule = AssistantAccountingModule;
