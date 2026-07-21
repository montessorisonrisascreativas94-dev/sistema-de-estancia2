/**
 * Accounting Module PRO — Panel Directora
 * Suite ERP integrada: Dashboard, Estados Financieros, Libro Diario,
 * CxC, CxP, Caja, Nómina, DGII (606/607/608/IT-1/IR-17)
 */
import { supabase } from '../shared/supabase.js';
import { Helpers } from '../shared/helpers.js';

const $el  = id => document.getElementById(id);
const fmt  = n  => 'RD$' + Number(n||0).toLocaleString('es-DO', { minimumFractionDigits: 2 });
const fmtN = n  => Number(n||0).toLocaleString('es-DO', { minimumFractionDigits: 2 });
const esc  = s  => Helpers.escapeHTML(s||'');
const today = () => new Date().toISOString().split('T')[0];

let _charts = {};

// ── Tab definitions ──────────────────────────────────────────────────────────
const TABS = [
  { id: 'dashboard',    icon: 'layout-dashboard',  label: 'Dashboard'         },
  { id: 'estados',      icon: 'file-bar-chart',    label: 'Estados Financieros'},
  { id: 'libro-diario', icon: 'book-open',         label: 'Libro Diario'      },
  { id: 'cxc',          icon: 'users',             label: 'CxC Padres'        },
  { id: 'cxp',          icon: 'shopping-cart',     label: 'CxP Suplidores'    },
  { id: 'caja',         icon: 'vault',             label: 'Caja General'      },
  { id: 'cashflow',     icon: 'trending-up',       label: 'Flujo de Caja'     },
  { id: 'nomina',       icon: 'briefcase',         label: 'Nómina'            },
  { id: 'dgii',         icon: 'landmark',          label: 'DGII'              },
  { id: 'reportes',     icon: 'file-text',         label: 'Reportes'          },
  { id: 'config',       icon: 'settings-2',        label: 'Configuración'     },
];

// ── AFP / ARS / ISR RD constants ─────────────────────────────────────────────
const AFP_EMPLEADO  = 0.0287;
const ARS_EMPLEADO  = 0.0304;
const AFP_PATRONAL  = 0.0710;
const ARS_PATRONAL  = 0.0709;

function calcISR(salarioAnual) {
  if (salarioAnual <= 416220)   return 0;
  if (salarioAnual <= 624329)   return (salarioAnual - 416220) * 0.15;
  if (salarioAnual <= 867123)   return 31216 + (salarioAnual - 624329) * 0.20;
  return 79776 + (salarioAnual - 867123) * 0.25;
}

function calcNeto(salarioBase) {
  const afp  = salarioBase * AFP_EMPLEADO;
  const ars  = salarioBase * ARS_EMPLEADO;
  const isrAnual = calcISR((salarioBase - afp - ars) * 12);
  const isr  = isrAnual / 12;
  return { bruto: salarioBase, afp, ars, isr, neto: salarioBase - afp - ars - isr };
}

// ── Chart helper ─────────────────────────────────────────────────────────────
function renderChart(id, type, labels, datasets, opts = {}) {
  const canvas = $el(id);
  if (!canvas || !window.Chart) return;
  if (_charts[id]) _charts[id].destroy();
  _charts[id] = new Chart(canvas, {
    type,
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: opts.legend ?? (type === 'doughnut' || type === 'pie') } },
      scales: (type === 'doughnut' || type === 'pie') ? {} : {
        y: { beginAtZero: true, ticks: { callback: v => 'RD$' + (v/1000).toFixed(0) + 'k' } }
      },
      ...opts
    }
  });
}

// ── Export module ─────────────────────────────────────────────────────────────
export const AccountingModule = {
  _tab: 'dashboard',

  async init() {
    this._renderShell();
    await this.showTab('dashboard');
  },

  _renderShell() {
    const sec = $el('contabilidad');
    if (!sec) return;
    sec.innerHTML = `
      <div class="flex items-center gap-3 mb-5">
        <div class="w-10 h-10 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-lg"
          style="background:linear-gradient(135deg,#0B63C7,#0850A0)">
          <i data-lucide="bar-chart-big" class="w-5 h-5"></i>
        </div>
        <div>
          <h1 class="text-2xl font-black text-slate-800">Contabilidad</h1>
          <p class="text-xs text-slate-400 font-bold uppercase tracking-wide">Suite ERP Institucional</p>
        </div>
      </div>
      <div class="overflow-x-auto pb-1 mb-5 -mx-1 px-1">
        <div class="flex gap-1 border-b border-slate-100 min-w-max">
          ${TABS.map(t => `
            <button data-acct-tab="${t.id}" onclick="AccountingModule.showTab('${t.id}')"
              class="acct-tab flex items-center gap-1.5 px-3 py-2.5 text-[11px] font-black border-b-2 -mb-px transition-all whitespace-nowrap text-slate-400"
              style="border-color:transparent">
              <i data-lucide="${t.icon}" class="w-3.5 h-3.5"></i>${t.label}
            </button>`).join('')}
        </div>
      </div>
      <div id="acct-body" class="min-h-[400px]"></div>
    `;
    if (window.lucide) lucide.createIcons();
  },

  async showTab(tab) {
    this._tab = tab;
    document.querySelectorAll('.acct-tab').forEach(b => {
      const on = b.dataset.acctTab === tab;
      b.style.borderColor = on ? '#0B63C7' : 'transparent';
      b.style.color = on ? '#0B63C7' : '#94a3b8';
    });
    const body = $el('acct-body');
    if (body) body.innerHTML = `<div class="flex justify-center py-16"><div class="w-8 h-8 border-2 border-[#0B63C7] border-t-transparent rounded-full animate-spin"></div></div>`;
    const map = {
      'dashboard':    () => this._loadDashboard(),
      'estados':      () => this._loadEstados(),
      'libro-diario': () => this._loadLibroDiario(),
      'cxc':          () => this._loadCxC(),
      'cxp':          () => this._loadCxP(),
      'caja':         () => this._loadCaja(),
      'cashflow':     () => this._loadCashflow(),
      'nomina':       () => this._loadNomina(),
      'dgii':         () => this._renderDGII(),
      'reportes':     () => this._renderReportes(),
      'config':       () => this._renderConfig(),
    };
    await map[tab]?.();
  },

  // re-expose loadTab for legacy HTML buttons
  async loadTab(tab) { await this.showTab(tab); },

  // ══════════════════════════════════════════════════════════════════════════
  // DASHBOARD FINANCIERO
  // ══════════════════════════════════════════════════════════════════════════
  async _loadDashboard() {
    const body = $el('acct-body');
    if (!body) return;

    const now       = new Date();
    const y         = now.getFullYear();
    const prevY     = y - 1;
    const m         = String(now.getMonth()+1).padStart(2,'0');
    const startMonth = `${y}-${m}-01`;
    const todayStr  = today();
    const prevMStart = new Date(y, now.getMonth()-1, 1).toISOString().split('T')[0];
    const prevMEnd   = new Date(y, now.getMonth(), 0).toISOString().split('T')[0];

    const [paymentsRes, chargesRes, prevRes, prevYearRes] = await Promise.allSettled([
      supabase.from('payments').select('amount,concept,method,paid_date,status,month_paid')
        .gte('paid_date', `${y}-01-01T00:00:00`).order('paid_date'),
      supabase.from('student_charges').select('amount,status,due_date'),
      supabase.from('payments').select('amount').eq('status','paid')
        .gte('paid_date', prevMStart+'T00:00:00').lte('paid_date', prevMEnd+'T23:59:59'),
      supabase.from('payments').select('amount,paid_date').eq('status','paid')
        .gte('paid_date',`${prevY}-01-01T00:00:00`).lte('paid_date',`${prevY}-12-31T23:59:59`),
    ]);

    const payments  = paymentsRes.value?.data  || [];
    const charges   = chargesRes.value?.data   || [];
    const prevPays  = prevRes.value?.data       || [];
    const prevYearPays = prevYearRes.value?.data || [];

    const paid      = payments.filter(p => p.status === 'paid');
    const todayPaid = paid.filter(p => p.paid_date?.startsWith(todayStr));
    const monthPaid = paid.filter(p => p.paid_date?.startsWith(`${y}-${m}`));
    const prevTotal = prevPays.reduce((s,p) => s + Number(p.amount||0), 0);
    const ingHoy    = todayPaid.reduce((s,p) => s + Number(p.amount||0), 0);
    const ingMes    = monthPaid.reduce((s,p) => s + Number(p.amount||0), 0);
    const pct       = prevTotal ? ((ingMes - prevTotal) / prevTotal * 100).toFixed(1) : 0;
    const cxcTotal  = charges.filter(c => ['pending','overdue'].includes(c.status)).reduce((s,c) => s+Number(c.amount||0),0);
    const cxcVenc   = charges.filter(c => c.status==='overdue').reduce((s,c) => s+Number(c.amount||0),0);
    const review    = payments.filter(p => p.status==='review').length;
    const totalYear = paid.reduce((s,p)=>s+Number(p.amount||0),0);
    const totalPrevYear = prevYearPays.reduce((s,p)=>s+Number(p.amount||0),0);
    const yoyChange = totalPrevYear>0 ? ((totalYear - totalPrevYear)/totalPrevYear*100).toFixed(1) : '—';

    // Métodos del mes
    const byMethod  = {};
    monthPaid.forEach(p => { const k = p.method||'efectivo'; byMethod[k] = (byMethod[k]||0) + Number(p.amount||0); });

    // Ingresos mensuales del año
    const byMonthArr = Array.from({length:12}, (_,i) => {
      const mk = `${y}-${String(i+1).padStart(2,'0')}`;
      return paid.filter(p => p.paid_date?.startsWith(mk)).reduce((s,p)=>s+Number(p.amount||0),0);
    });

    // Ingresos año anterior
    const prevByMonthArr = Array.from({length:12}, (_,i) => {
      const mk = `${prevY}-${String(i+1).padStart(2,'0')}`;
      return prevYearPays.filter(p => p.paid_date?.startsWith(mk)).reduce((s,p)=>s+Number(p.amount||0),0);
    });

    // Concepto breakdown del mes
    const byConcept = {};
    monthPaid.forEach(p => { const k = p.concept||'Otros'; byConcept[k] = (byConcept[k]||0) + Number(p.amount||0); });
    const conceptKeys = Object.keys(byConcept).slice(0,6);
    const conceptVals = conceptKeys.map(k => byConcept[k]);

    const kpi = (icon, color, label, value, sub='') => `
      <div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
        <div class="flex items-center gap-2 mb-2">
          <div class="p-2 rounded-xl" style="background:${color}20">
            <i data-lucide="${icon}" class="w-4 h-4" style="color:${color}"></i>
          </div>
          <span class="text-[9px] font-black uppercase tracking-wider text-slate-400">${label}</span>
        </div>
        <p class="text-lg font-black text-slate-800">${value}</p>
        ${sub ? `<p class="text-[10px] text-slate-400 font-bold mt-0.5">${sub}</p>` : ''}
      </div>`;

    body.innerHTML = `
      <div class="space-y-5">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          ${kpi('coins','#28B54D','Ingresos Hoy',fmt(ingHoy),'Cobros registrados hoy')}
          ${kpi('wallet','#0B63C7','Ingresos del Mes',fmt(ingMes), pct > 0 ? `▲ ${pct}% vs mes anterior` : `▼ ${Math.abs(pct)}% vs mes anterior`)}
          ${kpi('alert-triangle','#FF7A00','Cuentas x Cobrar',fmt(cxcTotal),`${fmt(cxcVenc)} vencido`)}
          ${kpi('clock','#EF4444','Por Validar',review + ' comprobantes','Transferencias en revisión')}
        </div>

        <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div class="bg-white rounded-2xl p-4 border border-blue-100 shadow-sm">
            <p class="text-[9px] font-black uppercase text-[#0B63C7] mb-1">Total Año ${y}</p>
            <p class="text-lg font-black text-[#0B63C7]">${fmt(totalYear)}</p>
            ${yoyChange!=='—' ? `<p class="text-[10px] font-bold ${parseFloat(yoyChange)>=0?'text-emerald-500':'text-rose-500'}">${parseFloat(yoyChange)>=0?'▲':'▼'} ${Math.abs(parseFloat(yoyChange))}% vs ${prevY}</p>` : ''}
          </div>
          ${Object.entries(byMethod).slice(0,2).map(([m,v]) => `
            <div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex items-center gap-3">
              <div class="p-2.5 rounded-xl bg-[#E8F2FF]"><i data-lucide="credit-card" class="w-4 h-4 text-[#0B63C7]"></i></div>
              <div><p class="text-sm font-black text-slate-800">${fmt(v)}</p><p class="text-[10px] text-slate-400 font-bold capitalize">${esc(m)}</p></div>
            </div>`).join('')}
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <h3 class="font-black text-slate-700 mb-4 text-sm">Ingresos ${y} vs ${prevY}</h3>
            <div class="h-52"><canvas id="acct-chart-mes"></canvas></div>
          </div>
          <div class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <h3 class="font-black text-slate-700 mb-4 text-sm">Cobros por Concepto (Mes)</h3>
            <div class="h-52"><canvas id="acct-chart-concepto"></canvas></div>
          </div>
        </div>
      </div>`;

    if (window.lucide) lucide.createIcons();
    const mLabels = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    renderChart('acct-chart-mes','bar', mLabels, [
      { label: y+'', data: byMonthArr, backgroundColor: byMonthArr.map((_,i) => i === now.getMonth() ? '#0B63C7' : '#BFDBFE'), borderRadius: 8 },
      { label: prevY+'', data: prevByMonthArr, backgroundColor: 'rgba(148,163,184,0.25)', borderRadius: 8 },
    ], { legend: true });
    renderChart('acct-chart-concepto','doughnut', conceptKeys, [{
      data: conceptVals,
      backgroundColor: ['#0B63C7','#2563EB','#FF7A00','#28B54D','#FFD43B','#8B5CF6']
    }]);
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ESTADOS FINANCIEROS (P&G + Balance General)
  // ══════════════════════════════════════════════════════════════════════════
  async _loadEstados() {
    const body = $el('acct-body');
    if (!body) return;
    body.innerHTML = `<div class="flex justify-center py-16"><div class="w-8 h-8 border-2 border-[#0B63C7] border-t-transparent rounded-full animate-spin"></div></div>`;

    const y = new Date().getFullYear();
    const [paysRes, gastosRes, chargesRes] = await Promise.allSettled([
      supabase.from('payments').select('amount,concept,status,paid_date').eq('status','paid').gte('paid_date',`${y}-01-01T00:00:00`),
      supabase.from('expenses').select('amount,category,concept,date').gte('date',`${y}-01-01`).order('date',{ascending:false}),
      supabase.from('student_charges').select('amount,status'),
    ]);

    const pays    = paysRes.value?.data    || [];
    const gastos  = gastosRes.value?.data  || [];
    const charges = chargesRes.value?.data || [];

    // Ingresos agrupados por concepto
    const ingGrp = {};
    pays.forEach(p => { const k = p.concept||'Otros'; ingGrp[k] = (ingGrp[k]||0) + Number(p.amount||0); });
    const totalIngresos = Object.values(ingGrp).reduce((s,v)=>s+v,0);

    // Gastos agrupados por categoría
    const gasGrp = {};
    gastos.forEach(g => { const k = g.category||'Otros'; gasGrp[k] = (gasGrp[k]||0) + Number(g.amount||0); });
    const totalGastos = Object.values(gasGrp).reduce((s,v)=>s+v,0);
    const utilidad    = totalIngresos - totalGastos;

    const cxcTotal = charges.filter(c=>['pending','overdue'].includes(c.status)).reduce((s,c)=>s+Number(c.amount||0),0);

    // Ingresos mensuales para gráfico
    const byMonthArr = Array.from({length:12}, (_,i) => {
      const mk = `${y}-${String(i+1).padStart(2,'0')}`;
      return pays.filter(p => p.paid_date?.startsWith(mk)).reduce((s,p)=>s+Number(p.amount||0),0);
    });
    const gastosMonthArr = Array.from({length:12}, (_,i) => {
      const mk = `${y}-${String(i+1).padStart(2,'0')}`;
      return gastos.filter(g => g.date?.startsWith(mk)).reduce((s,g)=>s+Number(g.amount||0),0);
    });

    const row = (label, value, cls='text-slate-700') =>
      `<div class="flex justify-between py-2 border-b border-slate-50">
        <span class="text-sm font-bold ${cls}">${esc(label)}</span>
        <span class="text-sm font-black ${cls}">${fmt(value)}</span>
      </div>`;
    const rowH = label =>
      `<div class="py-2 mt-2"><span class="text-[10px] font-black uppercase tracking-wider text-slate-400">${label}</span></div>`;

    const mLabels = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

    body.innerHTML = `
      <div class="space-y-5">
        <!-- Resumen Ejecutivo -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
            <p class="text-[9px] font-black uppercase text-slate-400 mb-1">Total Ingresos</p>
            <p class="text-lg font-black text-[#28B54D]">${fmt(totalIngresos)}</p>
          </div>
          <div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
            <p class="text-[9px] font-black uppercase text-slate-400 mb-1">Total Gastos</p>
            <p class="text-lg font-black text-rose-600">${fmt(totalGastos)}</p>
          </div>
          <div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
            <p class="text-[9px] font-black uppercase text-slate-400 mb-1">Utilidad Neta</p>
            <p class="text-lg font-black ${utilidad>=0?'text-[#28B54D]':'text-rose-600'}">${fmt(utilidad)}</p>
          </div>
          <div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
            <p class="text-[9px] font-black uppercase text-slate-400 mb-1">Margen</p>
            <p class="text-lg font-black text-[#0B63C7]">${totalIngresos>0?((utilidad/totalIngresos)*100).toFixed(1):'0'}%</p>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <!-- Estado de Resultados -->
          <div class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <h3 class="font-black text-slate-800 mb-4 flex items-center gap-2">
              <i data-lucide="file-bar-chart" class="w-4 h-4 text-[#0B63C7]"></i> Estado de Resultados ${y}
            </h3>
            ${rowH('Ingresos Operacionales')}
            ${Object.entries(ingGrp).map(([k,v]) => row(k,v,'text-[#0B63C7]')).join('')}
            <div class="flex justify-between py-2.5 border-t-2 border-slate-200 mt-2">
              <span class="font-black text-slate-800">Total Ingresos</span>
              <span class="font-black text-[#28B54D] text-base">${fmt(totalIngresos)}</span>
            </div>
            ${rowH('Gastos Operacionales')}
            ${Object.entries(gasGrp).map(([k,v]) => row(k,v,'text-rose-600')).join('')}
            ${gastos.length === 0 ? `<p class="text-xs text-slate-400 py-2">Sin gastos registrados</p>` : ''}
            <div class="flex justify-between py-2.5 border-t-2 border-slate-200 mt-2">
              <span class="font-black text-slate-800">Total Gastos</span>
              <span class="font-black text-rose-600 text-base">${fmt(totalGastos)}</span>
            </div>
            <div class="flex justify-between py-3 rounded-xl mt-3 px-3 ${utilidad >= 0 ? 'bg-emerald-50' : 'bg-rose-50'}">
              <span class="font-black text-slate-800">Utilidad Neta</span>
              <span class="font-black text-base ${utilidad >= 0 ? 'text-[#28B54D]' : 'text-rose-600'}">${fmt(utilidad)}</span>
            </div>
          </div>

          <!-- Balance General -->
          <div class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <h3 class="font-black text-slate-800 mb-4 flex items-center gap-2">
              <i data-lucide="scale" class="w-4 h-4 text-[#0B63C7]"></i> Balance General
            </h3>
            ${rowH('Activos Corrientes')}
            ${row('Caja / Efectivo', 0, 'text-slate-600')}
            ${row('Cuentas por Cobrar', cxcTotal, 'text-[#0B63C7]')}
            ${row('Total Ingresos YTD', totalIngresos, 'text-[#0B63C7]')}
            ${rowH('Pasivos')}
            ${row('Cuentas por Pagar', 0, 'text-slate-600')}
            ${row('Total Gastos YTD', totalGastos, 'text-rose-600')}
            ${rowH('Patrimonio')}
            <div class="flex justify-between py-3 rounded-xl mt-3 px-3 ${utilidad >= 0 ? 'bg-[#E8F2FF]' : 'bg-rose-50'}">
              <span class="font-black text-slate-800">Resultado del Ejercicio</span>
              <span class="font-black text-base ${utilidad >= 0 ? 'text-[#0B63C7]' : 'text-rose-600'}">${fmt(utilidad)}</span>
            </div>
            <p class="text-[10px] text-slate-400 font-bold mt-3 text-center">
              Activos = Pasivos + Patrimonio · Ecuación contable fundamental
            </p>
          </div>
        </div>

        <!-- Gráfico Ingresos vs Gastos -->
        <div class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <h3 class="font-black text-slate-700 mb-4 text-sm">Ingresos vs Gastos ${y}</h3>
          <div class="h-64"><canvas id="acct-estados-chart"></canvas></div>
        </div>
      </div>`;
    if (window.lucide) lucide.createIcons();
    renderChart('acct-estados-chart','bar', mLabels, [
      { label:'Ingresos', data:byMonthArr, backgroundColor:'#BFDBFE', borderRadius:6 },
      { label:'Gastos',   data:gastosMonthArr, backgroundColor:'#FECACA', borderRadius:6 },
    ], { legend: true });
  },

  // ══════════════════════════════════════════════════════════════════════════
  // LIBRO DIARIO (Partida Doble)
  // ══════════════════════════════════════════════════════════════════════════
  async _loadLibroDiario(page = 1) {
    const body = $el('acct-body');
    if (!body) return;

    // Show filter UI first
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth()+1).padStart(2,'0');

    body.innerHTML = `
      <div class="space-y-4">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <h3 class="font-black text-slate-800 flex items-center gap-2">
            <i data-lucide="book-open" class="w-4 h-4 text-[#0B63C7]"></i> Libro Diario — Partida Doble
          </h3>
          <div class="flex gap-2 flex-wrap">
            <input type="date" id="jdDateFrom" value="${y}-${m}-01" onchange="AccountingModule._loadLibroDiario(1)"
              class="px-3 py-2 border-2 border-slate-100 rounded-xl text-xs font-bold outline-none focus:border-blue-400">
            <span class="text-xs text-slate-400 font-bold self-center">a</span>
            <input type="date" id="jdDateTo" value="${now.toISOString().split('T')[0]}" onchange="AccountingModule._loadLibroDiario(1)"
              class="px-3 py-2 border-2 border-slate-100 rounded-xl text-xs font-bold outline-none focus:border-blue-400">
            <input type="text" id="jdSearch" placeholder="Buscar..." onkeyup="AccountingModule._filterLibroDiario()"
              class="px-3 py-2 border-2 border-slate-100 rounded-xl text-xs font-bold outline-none focus:border-blue-400 w-36">
            <button onclick="AccountingModule._exportLibroDiarioCSV()"
              class="flex items-center gap-1.5 px-3 py-2 bg-[#E8F2FF] hover:bg-[#0B63C7] text-[#0B63C7] hover:text-white rounded-xl font-black text-xs transition-all">
              <i data-lucide="download" class="w-3.5 h-3.5"></i> CSV
            </button>
          </div>
        </div>
        <div id="jdTableContent">
          <div class="flex justify-center py-12"><div class="w-8 h-8 border-2 border-[#0B63C7] border-t-transparent rounded-full animate-spin"></div></div>
        </div>
      </div>`;
    if (window.lucide) lucide.createIcons();

    const dateFrom = document.getElementById('jdDateFrom')?.value || `${y}-${m}-01`;
    const dateTo = document.getElementById('jdDateTo')?.value || now.toISOString().split('T')[0];

    const [paysRes, gastosRes] = await Promise.allSettled([
      supabase.from('payments').select('id,amount,concept,method,paid_date,status,exclude_dgii,students:student_id(name)')
        .eq('status','paid').gte('paid_date',dateFrom+'T00:00:00').lte('paid_date',dateTo+'T23:59:59').order('paid_date',{ascending:false}).limit(300),
      supabase.from('expenses').select('id,amount,concept,category,date,supplier')
        .gte('date',dateFrom).lte('date',dateTo).order('date',{ascending:false}).limit(300),
    ]);

    const pays   = paysRes.value?.data   || [];
    const gastos = gastosRes.value?.data || [];

    // Store for filtering
    this._jdData = [
      ...pays.map(p => ({
        fecha: (p.paid_date||'').split('T')[0],
        ref: `PAY-${String(p.id).slice(0,8)}`,
        descripcion: `Cobro ${esc(p.concept||'Mensualidad')} · ${esc(p.students?.name||'')}`,
        debe: { cuenta: p.method==='efectivo'?'111 Caja':'121 Banco Popular', monto: Number(p.amount||0) },
        haber: { cuenta: '411 Ingresos por Mensualidades', monto: Number(p.amount||0) },
        tipo: 'ingreso',
        _search: `${p.concept||''} ${p.students?.name||''} ${p.method||''}`.toLowerCase()
      })),
      ...gastos.map(g => ({
        fecha: g.date||'',
        ref: `EXP-${String(g.id).slice(0,8)}`,
        descripcion: `Gasto ${esc(g.category||'')} · ${esc(g.concept||'')} ${g.supplier ? '· '+esc(g.supplier) : ''}`,
        debe: { cuenta: '511 Gastos Operativos', monto: Number(g.amount||0) },
        haber: { cuenta: '111 Caja', monto: Number(g.amount||0) },
        tipo: 'gasto',
        _search: `${g.concept||''} ${g.category||''} ${g.supplier||''}`.toLowerCase()
      }))
    ].sort((a,b) => b.fecha.localeCompare(a.fecha));

    this._renderLibroDiarioTable(this._jdData);
  },

  _filterLibroDiario() {
    const q = (document.getElementById('jdSearch')?.value || '').toLowerCase();
    if (!q) { this._renderLibroDiarioTable(this._jdData || []); return; }
    const filtered = (this._jdData || []).filter(e => e._search.includes(q));
    this._renderLibroDiarioTable(filtered);
  },

  _renderLibroDiarioTable(entries) {
    const tc = $el('jdTableContent');
    if (!tc) return;

    const totalDebe = entries.reduce((s,e) => s + e.debe.monto, 0);
    const totalHaber = entries.reduce((s,e) => s + e.haber.monto, 0);

    tc.innerHTML = `
      <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-xs">
            <thead class="bg-[#E8F2FF]">
              <tr>
                <th class="px-3 py-3 text-left font-black text-[#0850A0] uppercase text-[9px] tracking-wider">Fecha</th>
                <th class="px-3 py-3 text-left font-black text-[#0850A0] uppercase text-[9px] tracking-wider">Ref</th>
                <th class="px-3 py-3 text-left font-black text-[#0850A0] uppercase text-[9px] tracking-wider">Descripción</th>
                <th class="px-3 py-3 text-left font-black text-[#0850A0] uppercase text-[9px] tracking-wider">Cuenta Debe</th>
                <th class="px-3 py-3 text-right font-black text-[#0850A0] uppercase text-[9px] tracking-wider">Debe</th>
                <th class="px-3 py-3 text-left font-black text-[#0850A0] uppercase text-[9px] tracking-wider">Cuenta Haber</th>
                <th class="px-3 py-3 text-right font-black text-[#0850A0] uppercase text-[9px] tracking-wider">Haber</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-50">
              ${entries.length ? entries.map(e => `
                <tr class="hover:bg-slate-50 ${e.tipo==='gasto'?'bg-rose-50/30':''}">
                  <td class="px-3 py-2.5 font-bold text-slate-500">${e.fecha}</td>
                  <td class="px-3 py-2.5 font-black text-[#0B63C7] font-mono text-[10px]">${e.ref}</td>
                  <td class="px-3 py-2.5 text-slate-700 max-w-[200px] truncate">${e.descripcion}</td>
                  <td class="px-3 py-2.5 text-slate-600">${e.debe.cuenta}</td>
                  <td class="px-3 py-2.5 text-right font-black text-[#28B54D]">${fmt(e.debe.monto)}</td>
                  <td class="px-3 py-2.5 text-slate-600">${e.haber.cuenta}</td>
                  <td class="px-3 py-2.5 text-right font-black text-rose-600">${fmt(e.haber.monto)}</td>
                </tr>`).join('')
              : `<tr><td colspan="7" class="text-center py-10 text-slate-400">Sin asientos en este período</td></tr>`}
            </tbody>
            <tfoot class="bg-[#E8F2FF]">
              <tr>
                <td colspan="4" class="px-3 py-3 font-black text-[#0850A0] text-xs uppercase">TOTALES (${entries.length} asientos)</td>
                <td class="px-3 py-3 text-right font-black text-[#28B54D]">${fmt(totalDebe)}</td>
                <td></td>
                <td class="px-3 py-3 text-right font-black text-rose-600">${fmt(totalHaber)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>`;
    if (window.lucide) lucide.createIcons();
  },

  _exportLibroDiarioCSV() {
    const data = this._jdData || [];
    if (!data.length) { Helpers.toast('Sin datos para exportar', 'error'); return; }
    const lines = ['Fecha,Referencia,Descripción,Cuenta Debe,Debe,Cuenta Haber,Haber'];
    data.forEach(e => {
      lines.push(`"${e.fecha}","${e.ref}","${e.descripcion.replace(/"/g,'""')}","${e.debe.cuenta}",${e.debe.monto},"${e.haber.cuenta}",${e.haber.monto}`);
    });
    const blob = new Blob([lines.join('\n')], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `libro_diario_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    Helpers.toast(`${data.length} asientos exportados`, 'success');
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CUENTAS POR COBRAR — Semáforo padres
  // ══════════════════════════════════════════════════════════════════════════
  async _loadCxC() {
    const body = $el('acct-body');
    if (!body) return;
    body.innerHTML = `<div class="flex justify-center py-16"><div class="w-8 h-8 border-2 border-[#0B63C7] border-t-transparent rounded-full animate-spin"></div></div>`;

    const { data: charges } = await supabase
      .from('student_charges')
      .select('id,amount,status,due_date,concept,student_enrollments:student_enrollment_id(students:student_id(id,name,p1_name,p1_phone,p1_email))')
      .in('status',['pending','overdue'])
      .order('due_date');

    const now     = new Date(); now.setHours(0,0,0,0);
    const in3days = new Date(now); in3days.setDate(in3days.getDate()+3);

    const enriched = (charges||[]).map(c => {
      const s = c.student_enrollments?.students || {};
      const due = c.due_date ? new Date(c.due_date+'T00:00:00') : null;
      let semaforo = 'verde';
      if (c.status === 'overdue' || (due && due < now)) semaforo = 'rojo';
      else if (due && due <= in3days) semaforo = 'amarillo';
      const mora = semaforo === 'rojo' ? Number(c.amount||0) * 0.05 : 0;
      return { ...c, student: s, semaforo, mora, due };
    });

    const totals = { verde:0, amarillo:0, rojo:0, total:0, mora:0 };
    enriched.forEach(c => {
      totals[c.semaforo] += Number(c.amount||0);
      totals.total += Number(c.amount||0);
      totals.mora  += c.mora;
    });

    const semCfg = {
      verde:    { cls:'bg-emerald-100 text-emerald-700', dot:'bg-emerald-500', label:'Al día'              },
      amarillo: { cls:'bg-amber-100 text-amber-700',     dot:'bg-amber-500',   label:'Próximo a vencer'   },
      rojo:     { cls:'bg-rose-100 text-rose-700',       dot:'bg-rose-500',    label:'Vencido'             },
    };

    body.innerHTML = `
      <div class="space-y-5">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
            <p class="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-1">Total CxC</p>
            <p class="text-lg font-black text-slate-800">${fmt(totals.total)}</p>
          </div>
          <div class="bg-white rounded-2xl p-4 border border-emerald-100 shadow-sm">
            <p class="text-[9px] font-black uppercase tracking-wider text-emerald-400 mb-1">🟢 Al Día</p>
            <p class="text-lg font-black text-emerald-600">${fmt(totals.verde)}</p>
          </div>
          <div class="bg-white rounded-2xl p-4 border border-amber-100 shadow-sm">
            <p class="text-[9px] font-black uppercase tracking-wider text-amber-400 mb-1">🟡 Próx. Vencer</p>
            <p class="text-lg font-black text-amber-600">${fmt(totals.amarillo)}</p>
          </div>
          <div class="bg-white rounded-2xl p-4 border border-rose-100 shadow-sm">
            <p class="text-[9px] font-black uppercase tracking-wider text-rose-400 mb-1">🔴 Vencido + Mora</p>
            <p class="text-lg font-black text-rose-600">${fmt(totals.rojo + totals.mora)}</p>
          </div>
        </div>

        <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div class="flex items-center justify-between p-4 border-b border-slate-100">
            <h3 class="font-black text-slate-800 text-sm">Detalle de Cuentas por Cobrar</h3>
          <div class="flex items-center gap-2 flex-wrap">
            <button onclick="AccountingModule._calcMora()"
              class="flex items-center gap-1.5 px-3 py-2 bg-[#E8F2FF] text-[#0B63C7] rounded-xl font-black text-xs hover:bg-[#0B63C7] hover:text-white transition-all">
              <i data-lucide="percent" class="w-3.5 h-3.5"></i> Calcular Mora
            </button>
            <button onclick="AccountingModule._sendCxCReminders()"
              class="flex items-center gap-1.5 px-3 py-2 bg-[#FF7A00] text-white rounded-xl font-black text-xs hover:bg-[#D96500] transition-all">
              <i data-lucide="bell" class="w-3.5 h-3.5"></i> Enviar Recordatorios
            </button>
          </div>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th class="px-4 py-3 text-left text-[9px] font-black text-slate-400 uppercase">Alumno / Padre</th>
                  <th class="px-4 py-3 text-left text-[9px] font-black text-slate-400 uppercase">Concepto</th>
                  <th class="px-4 py-3 text-left text-[9px] font-black text-slate-400 uppercase">Vence</th>
                  <th class="px-4 py-3 text-right text-[9px] font-black text-slate-400 uppercase">Monto</th>
                  <th class="px-4 py-3 text-right text-[9px] font-black text-slate-400 uppercase">Mora</th>
                  <th class="px-4 py-3 text-center text-[9px] font-black text-slate-400 uppercase">Estado</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-50">
                ${enriched.length ? enriched.map(c => {
                  const cfg = semCfg[c.semaforo];
                  return `
                    <tr class="hover:bg-slate-50">
                      <td class="px-4 py-3">
                        <p class="font-black text-slate-800 text-xs">${esc(c.student.name)}</p>
                        <p class="text-[10px] text-slate-400">${esc(c.student.p1_name||'')}</p>
                      </td>
                      <td class="px-4 py-3 text-xs text-slate-600">${esc(c.concept||'Mensualidad')}</td>
                      <td class="px-4 py-3 text-xs font-bold ${c.semaforo==='rojo'?'text-rose-600':'text-slate-600'}">${c.due_date||'—'}</td>
                      <td class="px-4 py-3 text-right font-black text-slate-800 text-xs">${fmt(c.amount)}</td>
                      <td class="px-4 py-3 text-right font-black text-rose-600 text-xs">${c.mora > 0 ? fmt(c.mora) : '—'}</td>
                      <td class="px-4 py-3 text-center">
                        <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-black ${cfg.cls}">
                          <span class="w-1.5 h-1.5 rounded-full ${cfg.dot}"></span>${cfg.label}
                        </span>
                      </td>
                    </tr>`;
                }).join('') : `<tr><td colspan="6" class="text-center py-10 text-slate-400 text-sm">✅ Sin cuentas pendientes</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
    if (window.lucide) lucide.createIcons();
  },

  async _sendCxCReminders() {
    Helpers.toast('Enviando recordatorios de pago...', 'info');
    try {
      // Count overdue charges for context
      const { data: overdue } = await supabase
        .from('student_charges')
        .select('id,amount,student_enrollments:student_enrollment_id(students:student_id(p1_phone,p1_name))')
        .eq('status','overdue');

      if (!overdue?.length) { Helpers.toast('No hay pagos vencidos para recordar', 'info'); return; }

      let sent = 0;
      for (const c of overdue) {
        const phone = c.student_enrollments?.students?.p1_phone;
        const name = c.student_enrollments?.students?.p1_name || 'Padre';
        if (!phone) continue;
        try {
          await supabase.functions.invoke('send-whatsapp', {
            body: {
              to: phone,
              message: `Estimado/a ${name}, le recordamos que tiene un pago pendiente de ${fmt(c.amount)}. Por favor regularizar lo antes posible. Gracias.`
            }
          });
          sent++;
        } catch(_) {}
      }
      Helpers.toast(`${sent} recordatorios enviados por WhatsApp`, 'success');
    } catch(_) { Helpers.toast('Error al enviar recordatorios', 'error'); }
  },

  async _calcMora() {
    const MORA_RATE = 0.05; // 5% per month
    Helpers.toast('Calculando mora...', 'info');
    try {
      const { data: overdue } = await supabase
        .from('student_charges')
        .select('id,amount,due_date,status')
        .eq('status','overdue');

      if (!overdue?.length) { Helpers.toast('No hay pagos vencidos para calcular', 'info'); return; }

      const now = new Date();
      let totalMora = 0;
      let updated = 0;

      for (const c of overdue) {
        if (!c.due_date) continue;
        const due = new Date(c.due_date + 'T00:00:00');
        const daysOverdue = Math.floor((now - due) / 86400000);
        if (daysOverdue <= 0) continue;

        // Calculate months overdue (minimum 1)
        const monthsOverdue = Math.max(1, Math.ceil(daysOverdue / 30));
        const mora = Number(c.amount || 0) * MORA_RATE * monthsOverdue;
        totalMora += mora;
        updated++;
      }

      Helpers.toast(`${updated} pagos con mora calculada (5% mensual)`, 'success');
      this._loadCxC(); // Refresh table
    } catch(_) { Helpers.toast('Error calculando mora', 'error'); }
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CUENTAS POR PAGAR — Suplidores
  // ══════════════════════════════════════════════════════════════════════════
  async _loadCxP() {
    const body = $el('acct-body');
    if (!body) return;

    const { data: expenses } = await supabase
      .from('expenses')
      .select('*')
      .order('date',{ascending:false})
      .limit(200);

    const allExpenses = expenses || [];
    const totalPend  = allExpenses.filter(e=>e.status==='pendiente').reduce((s,e)=>s+Number(e.amount||0),0);
    const totalPagado = allExpenses.filter(e=>e.status==='pagado').reduce((s,e)=>s+Number(e.amount||0),0);
    const pendCount = allExpenses.filter(e=>e.status==='pendiente').length;
    const paidCount = allExpenses.filter(e=>e.status==='pagado').length;

    // Category breakdown
    const catGrp = {};
    allExpenses.filter(e=>e.status==='pendiente').forEach(e => {
      const k = e.category||'Otros';
      catGrp[k] = (catGrp[k]||0) + Number(e.amount||0);
    });

    body.innerHTML = `
      <div class="space-y-4">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div class="bg-white rounded-2xl p-4 border border-amber-100 shadow-sm">
            <p class="text-[9px] font-black uppercase text-amber-400 mb-1">Pendiente (${pendCount})</p>
            <p class="text-lg font-black text-amber-600">${fmt(totalPend)}</p>
          </div>
          <div class="bg-white rounded-2xl p-4 border border-emerald-100 shadow-sm">
            <p class="text-[9px] font-black uppercase text-emerald-400 mb-1">Pagado (${paidCount})</p>
            <p class="text-lg font-black text-[#28B54D]">${fmt(totalPagado)}</p>
          </div>
          <div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
            <p class="text-[9px] font-black uppercase text-slate-400 mb-1">Total Registros</p>
            <p class="text-lg font-black text-slate-800">${allExpenses.length}</p>
          </div>
          <div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
            <p class="text-[9px] font-black uppercase text-slate-400 mb-1">Ratio Pagado</p>
            <p class="text-lg font-black text-[#0B63C7]">${allExpenses.length>0?((paidCount/allExpenses.length)*100).toFixed(0):'0'}%</p>
          </div>
        </div>

        ${Object.keys(catGrp).length ? `
        <div class="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
          <h4 class="font-black text-slate-700 text-xs mb-3">Pendiente por Categoría</h4>
          <div class="flex gap-2 flex-wrap">
            ${Object.entries(catGrp).sort((a,b)=>b[1]-a[1]).map(([k,v]) => `
              <span class="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-full text-[9px] font-black text-amber-700">
                ${esc(k)}: ${fmt(v)}
              </span>`).join('')}
          </div>
        </div>` : ''}

        <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div class="flex items-center justify-between p-4 border-b border-slate-100">
            <h3 class="font-black text-slate-800 text-sm">Cuentas por Pagar — Suplidores</h3>
            <button onclick="AccountingModule._openExpenseModal()"
              class="flex items-center gap-1.5 px-3 py-2 bg-[#0B63C7] text-white rounded-xl font-black text-xs hover:bg-[#0850A0] transition-all">
              <i data-lucide="plus" class="w-3.5 h-3.5"></i> Nueva Factura
            </button>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th class="px-4 py-3 text-left text-[9px] font-black text-slate-400 uppercase">Fecha</th>
                  <th class="px-4 py-3 text-left text-[9px] font-black text-slate-400 uppercase">Suplidor</th>
                  <th class="px-4 py-3 text-left text-[9px] font-black text-slate-400 uppercase">Concepto</th>
                  <th class="px-4 py-3 text-left text-[9px] font-black text-slate-400 uppercase">Categoría</th>
                  <th class="px-4 py-3 text-right text-[9px] font-black text-slate-400 uppercase">Monto</th>
                  <th class="px-4 py-3 text-center text-[9px] font-black text-slate-400 uppercase">Estado</th>
                  <th class="px-4 py-3 text-center text-[9px] font-black text-slate-400 uppercase">Acción</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-50">
                ${allExpenses.length ? allExpenses.map(e => {
                  const isPending = e.status !== 'pagado';
                  return `
                  <tr class="hover:bg-slate-50 ${isPending?'bg-amber-50/30':''}">
                    <td class="px-4 py-3 text-xs text-slate-500 font-bold">${e.date||'—'}</td>
                    <td class="px-4 py-3 text-xs font-black text-slate-800">${esc(e.supplier||'—')}</td>
                    <td class="px-4 py-3 text-xs text-slate-600">${esc(e.concept||'—')}</td>
                    <td class="px-4 py-3 text-xs text-slate-500">${esc(e.category||'—')}</td>
                    <td class="px-4 py-3 text-right font-black text-slate-800 text-xs">${fmt(e.amount)}</td>
                    <td class="px-4 py-3 text-center">
                      <span class="px-2 py-1 rounded-full text-[9px] font-black ${e.status==='pagado'?'bg-emerald-100 text-emerald-700':'bg-amber-100 text-amber-700'}">
                        ${e.status==='pagado'?'Pagado':'Pendiente'}
                      </span>
                    </td>
                    <td class="px-4 py-3 text-center">
                      <div class="flex gap-1 justify-center">
                        <button onclick="AccountingModule._openExpenseModal('${e.id}')"
                          class="px-2 py-1 bg-[#E8F2FF] text-[#0B63C7] rounded-lg text-[9px] font-black">Editar</button>
                        ${isPending ? `
                          <button onclick="AccountingModule._payExpense('${e.id}')"
                            class="px-2 py-1 bg-[#28B54D] text-white rounded-lg text-[9px] font-black hover:bg-[#1A8035] transition-all">
                            Pagar
                          </button>` : ''}
                      </div>
                    </td>
                  </tr>`;
                }).join('')
                : `<tr><td colspan="7" class="text-center py-10 text-slate-400 text-sm">Sin gastos registrados</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
    if (window.lucide) lucide.createIcons();
  },

  _openExpenseModal(editId) {
    const html = `
      <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4" id="expenseModal">
        <div class="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
          <div class="p-5 border-b" style="background:linear-gradient(135deg,#0B63C7,#0850A0)">
            <h3 class="text-lg font-black text-white">${editId ? 'Editar' : 'Nueva'} Factura / Gasto</h3>
          </div>
          <div class="p-5 space-y-3">
            <input id="expDate" type="date" value="${today()}" class="w-full px-3 py-2.5 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-blue-400">
            <input id="expSupplier" type="text" placeholder="Suplidor / Proveedor" class="w-full px-3 py-2.5 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-blue-400">
            <input id="expConcept" type="text" placeholder="Concepto" class="w-full px-3 py-2.5 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-blue-400">
            <select id="expCategory" class="w-full px-3 py-2.5 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-blue-400">
              <option value="Servicios">Servicios</option>
              <option value="Materiales">Materiales</option>
              <option value="Nómina">Nómina</option>
              <option value="Mantenimiento">Mantenimiento</option>
              <option value="Electricidad">Electricidad</option>
              <option value="Internet">Internet</option>
              <option value="Agua">Agua</option>
              <option value="Publicidad">Publicidad</option>
              <option value="Otros">Otros</option>
            </select>
            <input id="expAmount" type="number" placeholder="Monto RD$" step="0.01" class="w-full px-3 py-2.5 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-blue-400">
            <input id="expNCF" type="text" placeholder="NCF (opcional)" class="w-full px-3 py-2.5 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-blue-400">
            <select id="expStatus" class="w-full px-3 py-2.5 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-blue-400">
              <option value="pendiente">Pendiente de Pago</option>
              <option value="pagado">Pagado</option>
            </select>
          </div>
          <div class="p-5 border-t border-slate-100 flex gap-3 justify-end bg-slate-50">
            <button onclick="$el('expenseModal')?.parentElement?.remove()"
              class="px-4 py-2 text-slate-500 font-black text-xs uppercase border-2 border-slate-200 rounded-xl hover:bg-slate-100">Cancelar</button>
            <button onclick="AccountingModule._saveExpense('${editId||''}')"
              class="px-5 py-2 text-white font-black text-xs uppercase rounded-xl" style="background:#0B63C7">Guardar</button>
          </div>
        </div>
      </div>`;
    const d = document.createElement('div');
    d.innerHTML = html; document.body.appendChild(d);
    d.querySelector('[onclick*="expenseModal"]').onclick = () => d.remove();
    if (editId) this._loadExpenseIntoModal(editId);
  },

  async _loadExpenseIntoModal(id) {
    const { data: exp } = await supabase.from('expenses').select('*').eq('id', id).single();
    if (!exp) return;
    const set = (field, val) => { const el = $el(field); if (el) el.value = val || ''; };
    set('expDate', exp.date);
    set('expSupplier', exp.supplier);
    set('expConcept', exp.concept);
    set('expCategory', exp.category);
    set('expAmount', exp.amount);
    set('expNCF', exp.ncf);
    set('expStatus', exp.status);
  },

  async _saveExpense(editId) {
    const date     = $el('expDate')?.value;
    const supplier = $el('expSupplier')?.value?.trim();
    const concept  = $el('expConcept')?.value?.trim();
    const category = $el('expCategory')?.value;
    const amount   = Number($el('expAmount')?.value||0);
    const ncf      = $el('expNCF')?.value?.trim()||null;
    const status   = $el('expStatus')?.value;
    if (!concept || !amount) return Helpers.toast('Completa concepto y monto', 'warning');
    let error;
    if (editId) {
      ({ error } = await supabase.from('expenses').update({ date, supplier, concept, category, amount, ncf, status }).eq('id', editId));
    } else {
      ({ error } = await supabase.from('expenses').insert({ date, supplier, concept, category, amount, ncf, status }));
    }
    if (error) return Helpers.toast('Error al guardar: ' + error.message, 'error');
    document.getElementById('expenseModal')?.parentElement?.remove();
    Helpers.toast(editId ? 'Gasto actualizado' : 'Gasto guardado', 'success');
    await this._loadCxP();
  },

  async _payExpense(id) {
    if (!confirm('¿Marcar este gasto como pagado?')) return;
    const { error } = await supabase.from('expenses').update({ status:'pagado', paid_date: today() }).eq('id', id);
    if (error) return Helpers.toast('Error: ' + error.message, 'error');
    Helpers.toast('Gasto marcado como pagado', 'success');
    await this._loadCxP();
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CAJA GENERAL — Apertura, Arqueo, Cierre
  // ══════════════════════════════════════════════════════════════════════════
  async _loadCaja() {
    const body = $el('acct-body');
    if (!body) return;

    const todayStr = today();
    const [paidRes, cajaRes] = await Promise.allSettled([
      supabase.from('payments').select('amount,method,concept,paid_date,students:student_id(name)')
        .eq('status','paid').gte('paid_date',todayStr+'T00:00:00').order('paid_date',{ascending:false}),
      supabase.from('caja_sessions').select('*').eq('date',todayStr).limit(1).maybeSingle(),
    ]);

    const pays   = paidRes.value?.data || [];
    const sesion = cajaRes.value?.data;
    const totalHoy = pays.reduce((s,p) => s+Number(p.amount||0), 0);
    const byMethod  = {};
    pays.forEach(p => { const k = p.method||'efectivo'; byMethod[k] = (byMethod[k]||0)+Number(p.amount||0); });

    body.innerHTML = `
      <div class="space-y-4">
        <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div class="bg-gradient-to-br from-[#0B63C7] to-[#0850A0] rounded-2xl p-4 text-white">
            <p class="text-[9px] font-black uppercase text-blue-200 mb-1">Cobrado Hoy</p>
            <p class="text-xl font-black">${fmt(totalHoy)}</p>
          </div>
          <div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
            <p class="text-[9px] font-black uppercase text-slate-400 mb-1">Balance Apertura</p>
            <p class="text-xl font-black text-slate-800">${fmt(sesion?.opening_balance||0)}</p>
          </div>
          <div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
            <p class="text-[9px] font-black uppercase text-slate-400 mb-1">Estado</p>
            <p class="text-sm font-black ${sesion?.status==='closed'?'text-rose-600':'text-[#28B54D]'}">
              ${sesion?.status==='closed'?'🔒 Cerrada':'🟢 Abierta'}
            </p>
          </div>
        </div>

        <!-- Métodos de pago del día -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          ${Object.entries(byMethod).map(([m,v]) => `
            <div class="bg-white rounded-2xl p-3 border border-slate-100 shadow-sm">
              <p class="text-[9px] font-black uppercase text-slate-400 capitalize mb-1">${esc(m)}</p>
              <p class="text-base font-black text-slate-800">${fmt(v)}</p>
            </div>`).join('')}
        </div>

        <!-- Acciones de caja -->
        <div class="flex gap-2 flex-wrap">
          <button onclick="AccountingModule._openCajaSession()"
            class="flex items-center gap-1.5 px-4 py-2 text-white rounded-xl font-black text-xs hover:opacity-90 transition-all"
            style="background:#28B54D">
            <i data-lucide="unlock" class="w-3.5 h-3.5"></i> Apertura de Caja
          </button>
          <button onclick="AccountingModule._openArqueo(${totalHoy})"
            class="flex items-center gap-1.5 px-4 py-2 bg-[#E8F2FF] text-[#0B63C7] rounded-xl font-black text-xs hover:bg-[#0B63C7] hover:text-white transition-all">
            <i data-lucide="calculator" class="w-3.5 h-3.5"></i> Arqueo
          </button>
          <button onclick="AccountingModule._closeCaja(${totalHoy})"
            class="flex items-center gap-1.5 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-black text-xs hover:bg-rose-600 hover:text-white transition-all">
            <i data-lucide="lock" class="w-3.5 h-3.5"></i> Cierre de Caja
          </button>
        </div>

        <!-- Tabla de cobros del día -->
        <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div class="p-4 border-b border-slate-100">
            <h3 class="font-black text-slate-800 text-sm">Cobros de Hoy — ${new Date().toLocaleDateString('es-DO',{weekday:'long',day:'numeric',month:'long'})}</h3>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-slate-50">
                <tr>
                  <th class="px-4 py-3 text-left text-[9px] font-black text-slate-400 uppercase">Hora</th>
                  <th class="px-4 py-3 text-left text-[9px] font-black text-slate-400 uppercase">Alumno</th>
                  <th class="px-4 py-3 text-left text-[9px] font-black text-slate-400 uppercase">Concepto</th>
                  <th class="px-4 py-3 text-left text-[9px] font-black text-slate-400 uppercase">Método</th>
                  <th class="px-4 py-3 text-right text-[9px] font-black text-slate-400 uppercase">Monto</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-50">
                ${pays.length ? pays.map(p => `
                  <tr class="hover:bg-slate-50">
                    <td class="px-4 py-3 text-xs text-slate-500">${p.paid_date ? new Date(p.paid_date).toLocaleTimeString('es-DO',{hour:'2-digit',minute:'2-digit'}) : '—'}</td>
                    <td class="px-4 py-3 text-xs font-black text-slate-800">${esc(p.students?.name||'—')}</td>
                    <td class="px-4 py-3 text-xs text-slate-600">${esc(p.concept||'—')}</td>
                    <td class="px-4 py-3 text-xs text-slate-500 capitalize">${esc(p.method||'—')}</td>
                    <td class="px-4 py-3 text-right font-black text-[#0B63C7] text-xs">${fmt(p.amount)}</td>
                  </tr>`).join('')
                : `<tr><td colspan="5" class="text-center py-8 text-slate-400 text-sm">Sin cobros hoy</td></tr>`}
              </tbody>
            </table>
          </div>
          ${pays.length ? `
          <div class="flex justify-between items-center p-4 border-t border-slate-100 bg-[#E8F2FF]">
            <span class="font-black text-slate-700 text-sm">TOTAL DEL DÍA</span>
            <span class="font-black text-[#0B63C7] text-lg">${fmt(totalHoy)}</span>
          </div>` : ''}
        </div>
      </div>`;
    if (window.lucide) lucide.createIcons();
  },

  _openCajaSession() {
    const bal = prompt('Balance de apertura (efectivo en caja):', '0');
    if (bal === null) return;
    supabase.from('caja_sessions').upsert({ date: today(), opening_balance: Number(bal)||0, status:'open' }, { onConflict:'date' })
      .then(() => { Helpers.toast('Caja abierta', 'success'); this._loadCaja(); })
      .catch(() => Helpers.toast('Error al abrir caja', 'error'));
  },

  _openArqueo(totalSistema) {
    const fisico = prompt(`Total en sistema: ${fmt(totalSistema)}\n\nIngresa el efectivo físico contado:`, '0');
    if (fisico === null) return;
    const fisicoN = Number(fisico)||0;
    const diff = fisicoN - totalSistema;
    const tipo = diff > 0 ? 'Sobrante' : diff < 0 ? 'Faltante' : 'Cuadre perfecto';
    const msg = `Arqueo: ${tipo}\nSistema: ${fmt(totalSistema)}\nFísico: ${fmt(fisicoN)}\nDiferencia: ${fmt(Math.abs(diff))}`;
    alert(msg);
    if (diff !== 0) {
      supabase.from('expenses').insert({
        date: today(), concept: `${tipo} de Caja`, category: 'Caja',
        amount: Math.abs(diff), status: diff < 0 ? 'pagado' : 'pendiente'
      }).catch(()=>{});
    }
    Helpers.toast('Arqueo registrado', 'success');
  },

  _closeCaja(totalHoy) {
    if (!confirm(`¿Cerrar la caja del día? Total: ${fmt(totalHoy)}`)) return;
    supabase.from('caja_sessions').upsert({ date: today(), closing_balance: totalHoy, status:'closed' }, { onConflict:'date' })
      .then(() => { Helpers.toast('Caja cerrada correctamente', 'success'); this._loadCaja(); })
      .catch(() => Helpers.toast('Error al cerrar caja', 'error'));
  },

  // ══════════════════════════════════════════════════════════════════════════
  // FLUJO DE CAJA — Real + Proyección 3 meses
  // ══════════════════════════════════════════════════════════════════════════
  async _loadCashflow() {
    const body = $el('acct-body');
    if (!body) return;
    const y = new Date().getFullYear();
    const now = new Date();
    const curMonth = now.getMonth();
    const [paysRes, gasRes] = await Promise.allSettled([
      supabase.from('payments').select('amount,paid_date').eq('status','paid').gte('paid_date',`${y}-01-01T00:00:00`),
      supabase.from('expenses').select('amount,date').gte('date',`${y}-01-01`),
    ]);
    const pays  = paysRes.value?.data  || [];
    const gastos= gasRes.value?.data   || [];

    const mLabels = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const ingArr  = Array.from({length:12}, (_,i) => {
      const mk = `${y}-${String(i+1).padStart(2,'0')}`;
      return pays.filter(p=>p.paid_date?.startsWith(mk)).reduce((s,p)=>s+Number(p.amount||0),0);
    });
    const gasArr  = Array.from({length:12}, (_,i) => {
      const mk = `${y}-${String(i+1).padStart(2,'0')}`;
      return gastos.filter(g=>g.date?.startsWith(mk)).reduce((s,g)=>s+Number(g.amount||0),0);
    });
    const balArr  = ingArr.map((v,i) => v - gasArr[i]);
    const totalIn = ingArr.reduce((s,v)=>s+v,0);
    const totalOut= gasArr.reduce((s,v)=>s+v,0);
    const balance = totalIn - totalOut;

    // Previous year comparison
    const prevY = y - 1;
    const [prevPaysRes, prevGasRes] = await Promise.allSettled([
      supabase.from('payments').select('amount,paid_date').eq('status','paid').gte('paid_date',`${prevY}-01-01T00:00:00`).lte('paid_date',`${prevY}-12-31T23:59:59`),
      supabase.from('expenses').select('amount,date').gte('date',`${prevY}-01-01`).lte('date',`${prevY}-12-31`),
    ]);
    const prevPays = prevPaysRes.value?.data || [];
    const prevGas = prevGasRes.value?.data || [];
    const prevIngArr = Array.from({length:12}, (_,i) => {
      const mk = `${prevY}-${String(i+1).padStart(2,'0')}`;
      return prevPays.filter(p=>p.paid_date?.startsWith(mk)).reduce((s,p)=>s+Number(p.amount||0),0);
    });
    const prevGasArr = Array.from({length:12}, (_,i) => {
      const mk = `${prevY}-${String(i+1).padStart(2,'0')}`;
      return prevGas.filter(g=>g.date?.startsWith(mk)).reduce((s,g)=>s+Number(g.amount||0),0);
    });
    const prevBalArr = prevIngArr.map((v,i) => v - prevGasArr[i]);
    const prevTotalIn = prevIngArr.reduce((s,v)=>s+v,0);
    const prevTotalOut = prevGasArr.reduce((s,v)=>s+v,0);

    // Month-over-month % change
    const curInMonth = ingArr[curMonth] || 0;
    const prevInMonth = prevIngArr[curMonth] || 0;
    const momChange = prevInMonth > 0 ? ((curInMonth - prevInMonth) / prevInMonth * 100).toFixed(1) : '—';

    // Cumulative balance
    let cumul = 0;
    const cumulArr = balArr.map(b => { cumul += b; return cumul; });

    body.innerHTML = `
      <div class="space-y-5">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div class="bg-white rounded-2xl p-4 border border-emerald-100 shadow-sm">
            <p class="text-[9px] font-black uppercase text-slate-400 mb-1">Entradas ${y}</p>
            <p class="text-lg font-black text-[#28B54D]">${fmt(totalIn)}</p>
          </div>
          <div class="bg-white rounded-2xl p-4 border border-rose-100 shadow-sm">
            <p class="text-[9px] font-black uppercase text-slate-400 mb-1">Salidas ${y}</p>
            <p class="text-lg font-black text-rose-600">${fmt(totalOut)}</p>
          </div>
          <div class="bg-white rounded-2xl p-4 border border-blue-100 shadow-sm">
            <p class="text-[9px] font-black uppercase text-slate-400 mb-1">Balance Neto</p>
            <p class="text-lg font-black ${balance>=0?'text-[#0B63C7]':'text-rose-600'}">${fmt(balance)}</p>
          </div>
          <div class="bg-white rounded-2xl p-4 border border-violet-100 shadow-sm">
            <p class="text-[9px] font-black uppercase text-violet-400 mb-1">Ingresos vs Año Anterior</p>
            <p class="text-lg font-black ${momChange!=='—' && parseFloat(momChange)>=0?'text-[#28B54D]':'text-rose-600'}">
              ${momChange !== '—' ? (parseFloat(momChange)>=0?'+':'')+momChange+'%' : 'N/A'}
            </p>
            <p class="text-[8px] text-slate-400 font-bold">vs ${prevY}: ${fmt(prevTotalIn)}</p>
          </div>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <h3 class="font-black text-slate-700 mb-4 text-sm flex items-center gap-2">
              <i data-lucide="trending-up" class="w-4 h-4 text-[#0B63C7]"></i> Flujo Mensual ${y}
            </h3>
            <div class="h-64"><canvas id="acct-cashflow-chart"></canvas></div>
          </div>
          <div class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <h3 class="font-black text-slate-700 mb-4 text-sm flex items-center gap-2">
              <i data-lucide="line-chart" class="w-4 h-4 text-[#28B54D]"></i> Balance Acumulado ${y}
            </h3>
            <div class="h-64"><canvas id="acct-cashflow-cumul"></canvas></div>
          </div>
        </div>
        <div class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <h3 class="font-black text-slate-700 mb-4 text-sm">Resumen Mensual</h3>
          <div class="overflow-x-auto">
            <table class="w-full text-xs">
              <thead class="bg-slate-50"><tr>
                <th class="px-3 py-2 text-left font-black text-slate-400 uppercase text-[9px]">Mes</th>
                <th class="px-3 py-2 text-right font-black text-slate-400 uppercase text-[9px]">Ingresos</th>
                <th class="px-3 py-2 text-right font-black text-slate-400 uppercase text-[9px]">Gastos</th>
                <th class="px-3 py-2 text-right font-black text-slate-400 uppercase text-[9px]">Balance</th>
                <th class="px-3 py-2 text-right font-black text-slate-400 uppercase text-[9px]">Acumulado</th>
                <th class="px-3 py-2 text-center font-black text-slate-400 uppercase text-[9px]">Estado</th>
              </tr></thead>
              <tbody class="divide-y divide-slate-50">
                ${mLabels.map((m,i) => {
                  const isCurMonth = i === curMonth;
                  return `
                  <tr class="hover:bg-slate-50 ${isCurMonth?'bg-blue-50/50':''}">
                    <td class="px-3 py-2 font-black text-slate-700">${m}${isCurMonth?' <span class="text-[8px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full ml-1">ACTUAL</span>':''}</td>
                    <td class="px-3 py-2 text-right font-bold text-[#28B54D]">${ingArr[i]>0?fmt(ingArr[i]):'—'}</td>
                    <td class="px-3 py-2 text-right font-bold text-rose-600">${gasArr[i]>0?fmt(gasArr[i]):'—'}</td>
                    <td class="px-3 py-2 text-right font-black ${balArr[i]>=0?'text-[#0B63C7]':'text-rose-600'}">${(ingArr[i]||gasArr[i])?fmt(balArr[i]):'—'}</td>
                    <td class="px-3 py-2 text-right font-black text-slate-600">${cumulArr[i]!==0?fmt(cumulArr[i]):'—'}</td>
                    <td class="px-3 py-2 text-center">
                      ${balArr[i]>0?'<span class="text-[8px] font-black bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">+</span>':
                        balArr[i]<0?'<span class="text-[8px] font-black bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full">−</span>':
                        '<span class="text-[8px] font-black bg-slate-100 text-slate-400 px-2 py-0.5 rounded-full">0</span>'}
                    </td>
                  </tr>`;
                }).join('')}
              </tbody>
              <tfoot class="bg-slate-50 border-t-2 border-slate-200">
                <tr>
                  <td class="px-3 py-2.5 font-black text-xs text-slate-800">TOTAL ${y}</td>
                  <td class="px-3 py-2.5 text-right font-black text-[#28B54D]">${fmt(totalIn)}</td>
                  <td class="px-3 py-2.5 text-right font-black text-rose-600">${fmt(totalOut)}</td>
                  <td class="px-3 py-2.5 text-right font-black ${balance>=0?'text-[#0B63C7]':'text-rose-600'}">${fmt(balance)}</td>
                  <td colspan="2"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>`;

    renderChart('acct-cashflow-chart','bar', mLabels, [
      { label:'Ingresos', data:ingArr, backgroundColor:'#BFDBFE', borderRadius:6 },
      { label:'Gastos',   data:gasArr, backgroundColor:'#FECACA', borderRadius:6 },
    ], { legend: true });

    renderChart('acct-cashflow-cumul','line', mLabels, [
      { label:'Balance Acumulado', data:cumulArr, borderColor:'#0B63C7', backgroundColor:'rgba(11,99,199,0.1)', fill:true, tension:0.4, pointRadius:3, pointBackgroundColor:'#0B63C7' },
    ], { legend: false });
  },

  // ══════════════════════════════════════════════════════════════════════════
  // NÓMINA PROFESIONAL — AFP / ARS / ISR RD
  // ══════════════════════════════════════════════════════════════════════════
  async _loadNomina() {
    const body = $el('acct-body');
    if (!body) return;

    const [empRes, nomRes] = await Promise.allSettled([
      supabase.from('profiles').select('id,name,role,salary,phone,email').in('role',['maestra','maestro','asistente','encargada','administrativo','staff','docente','admin']).order('name'),
      supabase.from('payroll_records').select('*,profiles:employee_id(name,role)').order('period',{ascending:false}).limit(100),
    ]);

    const employees = empRes.value?.data  || [];
    const records   = nomRes.value?.data  || [];

    const pendiente = records.filter(r=>r.status==='pendiente').reduce((s,r)=>s+Number(r.net_salary||0),0);
    const pagado    = records.filter(r=>r.status==='pagado').reduce((s,r)=>s+Number(r.net_salary||0),0);
    const totalAFP  = records.reduce((s,r)=>s+Number(r.afp||0),0);
    const totalARS  = records.reduce((s,r)=>s+Number(r.ars||0),0);
    const totalISR  = records.reduce((s,r)=>s+Number(r.isr||0),0);
    const totalBruto= records.reduce((s,r)=>s+Number(r.gross_salary||0),0);

    // Monthly payroll cost (last 12 months)
    const now = new Date();
    const months = Array.from({length:12},(_,i)=>{
      const mk = `${now.getFullYear()}-${String(now.getMonth()+1-i).padStart(2,'0')}`;
      return records.filter(r=>r.period?.startsWith(mk)).reduce((s,r)=>s+Number(r.net_salary||0),0);
    }).reverse();
    const mLabels = Array.from({length:12},(_,i)=>{
      const d = new Date(now.getFullYear(), now.getMonth()-11+i, 1);
      return d.toLocaleString('es-DO',{month:'short'});
    });

    body.innerHTML = `
      <div class="space-y-4">
        <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
            <p class="text-[9px] font-black uppercase text-slate-400 mb-1">Empleados</p>
            <p class="text-lg font-black text-slate-800">${employees.length}</p>
          </div>
          <div class="bg-white rounded-2xl p-4 border border-blue-100 shadow-sm">
            <p class="text-[9px] font-black uppercase text-[#0B63C7] mb-1">Bruto Total</p>
            <p class="text-lg font-black text-[#0B63C7]">${fmt(totalBruto)}</p>
          </div>
          <div class="bg-white rounded-2xl p-4 border border-rose-100 shadow-sm">
            <p class="text-[9px] font-black uppercase text-rose-400 mb-1">Deducciones</p>
            <p class="text-lg font-black text-rose-600">${fmt(totalAFP+totalARS+totalISR)}</p>
          </div>
          <div class="bg-white rounded-2xl p-4 border border-amber-100 shadow-sm">
            <p class="text-[9px] font-black uppercase text-amber-400 mb-1">Pendiente</p>
            <p class="text-lg font-black text-amber-600">${fmt(pendiente)}</p>
          </div>
          <div class="bg-white rounded-2xl p-4 border border-emerald-100 shadow-sm">
            <p class="text-[9px] font-black uppercase text-emerald-400 mb-1">Pagado Año</p>
            <p class="text-lg font-black text-[#28B54D]">${fmt(pagado)}</p>
          </div>
        </div>
        <div class="flex gap-2 flex-wrap">
          <button onclick="AccountingModule._calcNominaModal()"
            class="flex items-center gap-1.5 px-4 py-2 text-white rounded-xl font-black text-xs hover:opacity-90"
            style="background:#0B63C7">
            <i data-lucide="calculator" class="w-3.5 h-3.5"></i> Calcular Nómina
          </button>
          <button onclick="AccountingModule._batchPayslips()"
            class="flex items-center gap-1.5 px-4 py-2 bg-[#E8F2FF] text-[#0B63C7] rounded-xl font-black text-xs hover:bg-[#0B63C7] hover:text-white transition-all">
            <i data-lucide="file-text" class="w-3.5 h-3.5"></i> Imprimir Todos
          </button>
        </div>

        <!-- Empleados con cálculo de deducciones -->
        <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div class="p-4 border-b border-slate-100">
            <h3 class="font-black text-slate-800 text-sm">Planilla de Empleados</h3>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-xs">
              <thead class="bg-[#E8F2FF]"><tr>
                <th class="px-4 py-3 text-left font-black text-[#0850A0] uppercase text-[9px]">Empleado</th>
                <th class="px-4 py-3 text-left font-black text-[#0850A0] uppercase text-[9px]">Cargo</th>
                <th class="px-4 py-3 text-right font-black text-[#0850A0] uppercase text-[9px]">Salario Bruto</th>
                <th class="px-4 py-3 text-right font-black text-[#0850A0] uppercase text-[9px]">AFP (2.87%)</th>
                <th class="px-4 py-3 text-right font-black text-[#0850A0] uppercase text-[9px]">ARS (3.04%)</th>
                <th class="px-4 py-3 text-right font-black text-[#0850A0] uppercase text-[9px]">ISR</th>
                <th class="px-4 py-3 text-right font-black text-[#0850A0] uppercase text-[9px]">Salario Neto</th>
                <th class="px-4 py-3 text-center font-black text-[#0850A0] uppercase text-[9px]">Recibo</th>
              </tr></thead>
              <tbody class="divide-y divide-slate-50">
                ${employees.length ? employees.map(e => {
                  if (!e.salary) return `
                    <tr class="hover:bg-slate-50">
                      <td class="px-4 py-3 font-black text-slate-800">${esc(e.name)}</td>
                      <td class="px-4 py-3 text-slate-500 capitalize">${esc(e.role)}</td>
                      <td colspan="5" class="px-4 py-3 text-center text-slate-400 text-[9px]">Sin salario configurado</td>
                      <td class="px-4 py-3 text-center">
                        <button onclick="AccountingModule._setSalary('${e.id}','${esc(e.name)}')"
                          class="px-2 py-1 bg-[#E8F2FF] text-[#0B63C7] rounded-lg text-[9px] font-black">Asignar</button>
                      </td>
                    </tr>`;
                  const n = calcNeto(Number(e.salary));
                  return `
                    <tr class="hover:bg-slate-50">
                      <td class="px-4 py-3 font-black text-slate-800">${esc(e.name)}</td>
                      <td class="px-4 py-3 text-slate-500 capitalize">${esc(e.role)}</td>
                      <td class="px-4 py-3 text-right font-bold text-slate-700">${fmt(n.bruto)}</td>
                      <td class="px-4 py-3 text-right text-rose-500">${fmt(n.afp)}</td>
                      <td class="px-4 py-3 text-right text-rose-500">${fmt(n.ars)}</td>
                      <td class="px-4 py-3 text-right text-rose-500">${fmt(n.isr)}</td>
                      <td class="px-4 py-3 text-right font-black text-[#28B54D]">${fmt(n.neto)}</td>
                      <td class="px-4 py-3 text-center">
                        <button onclick="AccountingModule._printPayslip('${e.id}','${esc(e.name)}',${n.bruto},${n.afp},${n.ars},${n.isr},${n.neto})"
                          class="px-2 py-1 bg-[#0B63C7] text-white rounded-lg text-[9px] font-black hover:bg-[#0850A0]">
                          PDF
                        </button>
                      </td>
                    </tr>`;
                }).join('')
                : `<tr><td colspan="8" class="text-center py-8 text-slate-400">Sin empleados registrados</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
    if (window.lucide) lucide.createIcons();
  },

  async _setSalary(id, name) {
    const modalId = 'salaryModal_' + Date.now();
    const html = `
      <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4" id="${modalId}">
        <div class="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">
          <div class="p-5" style="background:linear-gradient(135deg,#0B63C7,#0850A0)">
            <h3 class="text-lg font-black text-white">Asignar Salario</h3>
            <p class="text-xs text-blue-200 mt-1">${esc(name)}</p>
          </div>
          <div class="p-5 space-y-3">
            <div>
              <label class="block text-[10px] font-black text-slate-400 uppercase mb-1">Salario Mensual Bruto (RD$)</label>
              <input id="salaryInput_${id}" type="number" step="0.01" placeholder="RD$ 0.00"
                class="w-full px-3 py-3 border-2 border-slate-100 rounded-xl text-lg font-black text-slate-800 outline-none focus:border-blue-400 text-center">
            </div>
            <div id="salaryPreview_${id}" class="text-center text-xs text-slate-400 font-bold"></div>
          </div>
          <div class="p-4 border-t border-slate-100 flex gap-2 bg-slate-50">
            <button onclick="document.getElementById('${modalId}')?.parentElement?.remove()"
              class="flex-1 py-2.5 text-slate-500 font-black text-xs border-2 border-slate-200 rounded-xl">Cancelar</button>
            <button onclick="AccountingModule._saveSalary('${id}','${modalId}')"
              class="flex-1 py-2.5 text-white font-black text-xs rounded-xl" style="background:#0B63C7">Guardar</button>
          </div>
        </div>
      </div>`;
    const d = document.createElement('div');
    d.innerHTML = html;
    document.body.appendChild(d);
    const input = document.getElementById(`salaryInput_${id}`);
    if (input) {
      input.focus();
      input.addEventListener('input', () => {
        const val = Number(input.value || 0);
        const n = calcNeto(val);
        const prev = document.getElementById(`salaryPreview_${id}`);
        if (prev && val > 0) prev.textContent = `Neto: ${fmt(n.neto)} | AFP: ${fmt(n.afp)} | ARS: ${fmt(n.ars)} | ISR: ${fmt(n.isr)}`;
        else if (prev) prev.textContent = '';
      });
    }
  },

  async _saveSalary(id, modalId) {
    const val = Number(document.getElementById(`salaryInput_${id}`)?.value || 0);
    if (!val) return Helpers.toast('Ingresa un monto', 'warning');
    const { error } = await supabase.from('profiles').update({ salary: val }).eq('id', id);
    if (error) return Helpers.toast('Error: ' + error.message, 'error');
    document.getElementById(modalId)?.parentElement?.remove();
    Helpers.toast('Salario actualizado', 'success');
    await this._loadNomina();
  },

  _calcNominaModal() {
    const modalId = 'nominaCalcModal_' + Date.now();
    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const html = `
      <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4" id="${modalId}">
        <div class="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
          <div class="p-5" style="background:linear-gradient(135deg,#0B63C7,#0850A0)">
            <h3 class="text-lg font-black text-white flex items-center gap-2">
              <i data-lucide="calculator" class="w-5 h-5"></i> Calcular Nómina
            </h3>
            <p class="text-xs text-blue-200 mt-1">Generar planilla del período con deducciones de ley</p>
          </div>
          <div class="p-5 space-y-3">
            <div>
              <label class="block text-[10px] font-black text-slate-400 uppercase mb-1">Período</label>
              <input id="nominaPeriod" type="month" value="${currentPeriod}"
                class="w-full px-3 py-2.5 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-blue-400">
            </div>
            <div>
              <label class="block text-[10px] font-black text-slate-400 uppercase mb-1">Días laborados</label>
              <input id="nominaDays" type="number" value="28" min="1" max="31"
                class="w-full px-3 py-2.5 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-blue-400">
            </div>
            <div class="bg-blue-50 rounded-xl p-3">
              <p class="text-[10px] font-black text-blue-700 uppercase mb-1">Deducciones de Ley (RD)</p>
              <p class="text-xs text-blue-600">AFP 2.87% · ARS 3.04% · ISR progresivo</p>
            </div>
          </div>
          <div class="p-4 border-t border-slate-100 flex gap-2 bg-slate-50">
            <button onclick="document.getElementById('${modalId}')?.parentElement?.remove()"
              class="flex-1 py-2.5 text-slate-500 font-black text-xs border-2 border-slate-200 rounded-xl">Cancelar</button>
            <button onclick="AccountingModule._processNomina('${modalId}')"
              class="flex-1 py-2.5 text-white font-black text-xs rounded-xl flex items-center justify-center gap-1" style="background:#0B63C7">
              <i data-lucide="play" class="w-3.5 h-3.5"></i> Procesar
            </button>
          </div>
        </div>
      </div>`;
    const d = document.createElement('div');
    d.innerHTML = html;
    document.body.appendChild(d);
    if (window.lucide) lucide.createIcons();
  },

  async _processNomina(modalId) {
    const period = document.getElementById('nominaPeriod')?.value;
    if (!period) return Helpers.toast('Selecciona un período', 'warning');
    Helpers.toast('Procesando nómina...', 'info');

    const { data: employees } = await supabase.from('profiles')
      .select('id,name,role,salary')
      .in('role',['maestra','maestro','asistente','encargada','administrativo','staff','docente','admin'])
      .not('salary','is',null).gt('salary',0);

    if (!employees?.length) {
      Helpers.toast('No hay empleados con salario configurado', 'warning');
      document.getElementById(modalId)?.parentElement?.remove();
      return;
    }

    const records = employees.map(e => {
      const n = calcNeto(Number(e.salary));
      return {
        employee_id: e.id,
        period,
        gross_salary: n.bruto,
        afp: n.afp,
        ars: n.ars,
        isr: n.isr,
        net_salary: n.neto,
        status: 'pendiente',
        created_at: new Date().toISOString()
      };
    });

    const { error } = await supabase.from('payroll_records').insert(records);
    if (error) return Helpers.toast('Error: ' + error.message, 'error');
    document.getElementById(modalId)?.parentElement?.remove();
    Helpers.toast(`Nómina procesada: ${records.length} empleados`, 'success');
    await this._loadNomina();
  },

  _printPayslip(id, name, bruto, afp, ars, isr, neto) {
    const periodo = new Date().toLocaleDateString('es-DO',{month:'long',year:'numeric'});
    const win = window.open('','_blank');
    win.document.write(`<!DOCTYPE html><html><head><title>Recibo de Nómina - ${name}</title>
      <style>
        body{font-family:Arial,sans-serif;padding:40px;max-width:500px;margin:0 auto;color:#1e293b}
        h1{text-align:center;color:#0B63C7;font-size:1.3rem;margin-bottom:4px}
        .sub{text-align:center;color:#64748b;font-size:.8rem;margin-bottom:20px}
        table{width:100%;border-collapse:collapse;margin-top:16px}
        td{padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:.9rem}
        .label{color:#64748b}.value{text-align:right;font-weight:700}
        .total{font-size:1.1rem;font-weight:900;color:#0B63C7}
        .deduct{color:#ef4444}.footer{text-align:center;color:#94a3b8;font-size:.75rem;margin-top:24px}
      </style>
      </head><body>
      <h1>Colegio Montessori Sonrisas Creativas</h1>
      <div class="sub">Recibo de Nómina · ${periodo}</div>
      <hr>
      <table>
        <tr><td class="label">Empleado</td><td class="value">${name}</td></tr>
        <tr><td class="label">Período</td><td class="value">${periodo}</td></tr>
        <tr style="height:8px"></tr>
        <tr><td class="label">Salario Bruto</td><td class="value">${fmt(bruto)}</td></tr>
        <tr><td class="label deduct">(-) AFP (2.87%)</td><td class="value deduct">${fmt(afp)}</td></tr>
        <tr><td class="label deduct">(-) ARS (3.04%)</td><td class="value deduct">${fmt(ars)}</td></tr>
        <tr><td class="label deduct">(-) ISR</td><td class="value deduct">${fmt(isr)}</td></tr>
        <tr style="height:8px"></tr>
        <tr><td class="label total">SALARIO NETO</td><td class="value total">${fmt(neto)}</td></tr>
      </table>
      <div class="footer">Este recibo es un comprobante oficial de pago de nómina.</div>
      <script>window.onload=()=>window.print()<\/script></body></html>`);
    win.document.close();
  },

  _batchPayslips() {
    const periodo = new Date().toLocaleDateString('es-DO',{month:'long',year:'numeric'});
    const rows = document.querySelectorAll('#acct-body tbody tr');
    if (!rows.length) { Helpers.toast('Sin empleados para imprimir', 'info'); return; }

    let html = '';
    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length < 8) return;
      const name = cells[0]?.textContent?.trim() || '';
      const bruto = cells[2]?.textContent?.trim() || '';
      const afp = cells[3]?.textContent?.trim() || '';
      const ars = cells[4]?.textContent?.trim() || '';
      const isr = cells[5]?.textContent?.trim() || '';
      const neto = cells[6]?.textContent?.trim() || '';
      if (!name || !bruto) return;
      html += `
        <div style="page-break-after:always;padding:40px;max-width:500px;margin:0 auto">
          <h1 style="text-align:center;color:#0B63C7;font-size:1.3rem;margin-bottom:4px">Colegio Montessori Sonrisas Creativas</h1>
          <div style="text-align:center;color:#64748b;font-size:.8rem;margin-bottom:20px">Recibo de Nómina · ${periodo}</div>
          <hr>
          <table style="width:100%;border-collapse:collapse;margin-top:16px">
            <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Empleado</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700">${esc(name)}</td></tr>
            <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Período</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700">${periodo}</td></tr>
            <tr><td colspan="2" style="height:8px"></td></tr>
            <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Salario Bruto</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700">${bruto}</td></tr>
            <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#ef4444">(-) AFP (2.87%)</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;color:#ef4444">${afp}</td></tr>
            <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#ef4444">(-) ARS (3.04%)</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;color:#ef4444">${ars}</td></tr>
            <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#ef4444">(-) ISR</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;color:#ef4444">${isr}</td></tr>
            <tr><td colspan="2" style="height:8px"></td></tr>
            <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:1.1rem;font-weight:900;color:#0B63C7">SALARIO NETO</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:1.1rem;font-weight:900;color:#0B63C7">${neto}</td></tr>
          </table>
          <div style="text-align:center;color:#94a3b8;font-size:.75rem;margin-top:24px">Este recibo es un comprobante oficial de pago de nómina.</div>
        </div>`;
    });

    if (!html) { Helpers.toast('No se pudieron leer los datos', 'error'); return; }
    const win = window.open('','_blank');
    win.document.write(`<!DOCTYPE html><html><head><title>Nómina - ${periodo}</title>
      <style>@media print{div{page-break-after:always}div:last-child{page-break-after:auto}}</style>
      </head><body>${html}<script>window.onload=()=>window.print()<\/script></body></html>`);
    win.document.close();
  },

  // ══════════════════════════════════════════════════════════════════════════
  // DGII — 606 / 607 / 608 / IT-1 / IR-17 (v2 — Módulo Contable Completo)
  // ══════════════════════════════════════════════════════════════════════════
  _dgiiView: 'dashboard',
  _dgiiPeriod: null,

  _renderDGII() {
    const body = $el('acct-body');
    if (!body) return;
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth()+1).padStart(2,'0');
    this._dgiiPeriod = this._dgiiPeriod || `${y}${m}`;

    body.innerHTML = `
      <div class="space-y-5">
        <!-- DGII Sub-nav -->
        <div class="flex gap-2 flex-wrap">
          <button onclick="AccountingModule._setDgiiView('dashboard')" class="px-3 py-2 rounded-xl font-black text-xs transition-all ${this._dgiiView==='dashboard'?'bg-[#0B63C7] text-white':'bg-white text-slate-500 border border-slate-200'}">Dashboard</button>
          <button onclick="AccountingModule._setDgiiView('606')" class="px-3 py-2 rounded-xl font-black text-xs transition-all ${this._dgiiView==='606'?'bg-[#FF7A00] text-white':'bg-white text-slate-500 border border-slate-200'}">606 Compras</button>
          <button onclick="AccountingModule._setDgiiView('607')" class="px-3 py-2 rounded-xl font-black text-xs transition-all ${this._dgiiView==='607'?'bg-[#0B63C7] text-white':'bg-white text-slate-500 border border-slate-200'}">607 Ventas</button>
          <button onclick="AccountingModule._setDgiiView('608')" class="px-3 py-2 rounded-xl font-black text-xs transition-all ${this._dgiiView==='608'?'bg-[#EF4444] text-white':'bg-white text-slate-500 border border-slate-200'}">608 Anulados</button>
          <button onclick="AccountingModule._setDgiiView('enviar')" class="px-3 py-2 rounded-xl font-black text-xs transition-all ${this._dgiiView==='enviar'?'bg-[#28B54D] text-white':'bg-white text-slate-500 border border-slate-200'}">Enviar a DGII</button>
          <button onclick="AccountingModule._setDgiiView('it1')" class="px-3 py-2 rounded-xl font-black text-xs transition-all ${this._dgiiView==='it1'?'bg-[#8B5CF6] text-white':'bg-white text-slate-500 border border-slate-200'}">IT-1</button>
          <button onclick="AccountingModule._setDgiiView('ir17')" class="px-3 py-2 rounded-xl font-black text-xs transition-all ${this._dgiiView==='ir17'?'bg-[#28B54D] text-white':'bg-white text-slate-500 border border-slate-200'}">IR-17</button>
        </div>
        <!-- Period selector -->
        <div class="flex items-center gap-3">
          <label class="text-xs font-black text-slate-400">Período:</label>
          <input type="month" id="dgiiPeriodSelect" value="${this._dgiiPeriod.slice(0,4)}-${this._dgiiPeriod.slice(4)}"
            onchange="AccountingModule._changePeriod(this.value)"
            class="px-3 py-2 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-blue-400">
        </div>
        <div id="dgiiContent"></div>
      </div>`;
    if (window.lucide) lucide.createIcons();
    this._loadDgiiContent();
  },

  _setDgiiView(view) {
    this._dgiiView = view;
    this._renderDGII();
  },

  _changePeriod(val) {
    this._dgiiPeriod = val.replace('-','');
    this._loadDgiiContent();
  },

  async _loadDgiiContent() {
    const content = $el('dgiiContent');
    if (!content) return;
    content.innerHTML = `<div class="flex justify-center py-12"><div class="w-8 h-8 border-2 border-[#0B63C7] border-t-transparent rounded-full animate-spin"></div></div>`;
    const p = this._dgiiPeriod;
    const year = p.slice(0,4);
    const month = p.slice(4);
    const start = `${year}-${month}-01`;
    const end = new Date(Number(year), Number(month), 0).toISOString().split('T')[0];

    if (this._dgiiView === 'dashboard') {
      await this._renderDgiiDashboard(content, year, month, start, end);
    } else if (this._dgiiView === '606') {
      await this._render606Table(content, year, month, start, end);
    } else if (this._dgiiView === '607') {
      await this._render607Table(content, year, month, start, end);
    } else if (this._dgiiView === '608') {
      await this._render608Table(content, year, month, start, end);
    } else if (this._dgiiView === 'enviar') {
      await this._renderEnviarDGII(content, year, month);
    } else if (this._dgiiView === 'it1') {
      await this._renderIT1(content, year, month, start, end);
    } else if (this._dgiiView === 'ir17') {
      await this._renderIR17(content, year, month, start, end);
    }
  },

  // ── DGII DASHBOARD ──────────────────────────────────────────────────────
  async _renderDgiiDashboard(content, year, month, start, end) {
    const [paysRes, expRes, annRes] = await Promise.allSettled([
      supabase.from('payments').select('id,amount,concept,exclude_dgii,paid_date').eq('status','paid').gte('paid_date',start+'T00:00:00').lte('paid_date',end+'T23:59:59'),
      supabase.from('expenses').select('id,amount,concept,ncf,category,date,status').gte('date',start).lte('date',end),
      supabase.from('payments').select('id,amount').eq('status','cancelled').gte('paid_date',start+'T00:00:00').lte('paid_date',end+'T23:59:59'),
    ]);
    const pays = paysRes.value?.data || [];
    const exps = expRes.value?.data || [];
    const anns = annRes.value?.data || [];
    const includedPays = pays.filter(p => !p.exclude_dgii);
    const excludedPays = pays.filter(p => p.exclude_dgii);
    const totalVentas = includedPays.reduce((s,p)=>s+Number(p.amount||0),0);
    const totalCompras = exps.filter(e=>e.status!=='cancelado').reduce((s,e)=>s+Number(e.amount||0),0);
    const itbisVentas = totalVentas * 0.18;
    const itbisCompras = totalCompras * 0.18;
    const itbisNeto = itbisVentas - itbisCompras;

    const kpi = (icon, color, label, value, sub='') => `
      <div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
        <div class="flex items-center gap-2 mb-2">
          <div class="p-2 rounded-xl" style="background:${color}20"><i data-lucide="${icon}" class="w-4 h-4" style="color:${color}"></i></div>
          <span class="text-[9px] font-black uppercase tracking-wider text-slate-400">${label}</span>
        </div>
        <p class="text-lg font-black text-slate-800">${value}</p>
        ${sub ? `<p class="text-[10px] text-slate-400 font-bold mt-0.5">${sub}</p>` : ''}
      </div>`;

    content.innerHTML = `
      <div class="space-y-5">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          ${kpi('receipt','#0B63C7','607 Ventas',fmt(totalVentas),`${includedPays.length} facturas incluidas`)}
          ${kpi('shopping-cart','#FF7A00','606 Compras',fmt(totalCompras),`${exps.length} registros`)}
          ${kpi('percent','#8B5CF6','ITBIS Neto',fmt(Math.abs(itbisNeto)),itbisNeto>=0?'A favor':'Por pagar')}
          ${kpi('file-x','#EF4444','608 Anulados',fmt(anns.reduce((s,a)=>s+Number(a.amount||0),0)),`${anns.length} anulados`)}
        </div>
        ${excludedPays.length ? `
        <div class="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <i data-lucide="eye-off" class="w-5 h-5 text-amber-600 shrink-0 mt-0.5"></i>
          <div>
            <p class="font-black text-amber-800 text-sm">${excludedPays.length} factura(s) excluida(s) de DGII</p>
            <p class="text-xs text-amber-700 mt-0.5">Total excluido: ${fmt(excludedPays.reduce((s,p)=>s+Number(p.amount||0),0))} — Estas facturas no se enviarán a la DGII.</p>
          </div>
        </div>` : ''}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <h3 class="font-black text-slate-700 mb-3 text-sm">Resumen ITBIS</h3>
            <div class="space-y-2">
              <div class="flex justify-between py-2 border-b border-slate-50"><span class="text-xs text-slate-500">ITBIS Cobrado (Ventas)</span><span class="text-xs font-black text-[#0B63C7]">${fmt(itbisVentas)}</span></div>
              <div class="flex justify-between py-2 border-b border-slate-50"><span class="text-xs text-slate-500">ITBIS Pagado (Compras)</span><span class="text-xs font-black text-rose-600">${fmt(itbisCompras)}</span></div>
              <div class="flex justify-between py-2 bg-${itbisNeto>=0?'blue':'rose'}-50 rounded-xl px-2"><span class="text-sm font-black">Balance Neto</span><span class="text-sm font-black ${itbisNeto>=0?'text-[#0B63C7]':'text-rose-600'}">${itbisNeto>=0?'':'-'}${fmt(Math.abs(itbisNeto))}</span></div>
            </div>
          </div>
          <div class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <h3 class="font-black text-slate-700 mb-3 text-sm">Acciones Rápidas</h3>
            <div class="space-y-2">
              <button onclick="AccountingModule._bulkSendToDGII('${year}','${month}','607')" class="w-full py-2.5 rounded-xl font-black text-xs text-white bg-[#0B63C7] hover:opacity-90">Enviar 607 (Ventas) a DGII</button>
              <button onclick="AccountingModule._bulkSendToDGII('${year}','${month}','606')" class="w-full py-2.5 rounded-xl font-black text-xs text-white bg-[#FF7A00] hover:opacity-90">Enviar 606 (Compras) a DGII</button>
              <button onclick="AccountingModule._exportDGIIZip('${year}','${month}')" class="w-full py-2.5 rounded-xl font-black text-xs text-white bg-[#28B54D] hover:opacity-90">Exportar ZIP para DGII</button>
            </div>
          </div>
        </div>
      </div>`;
    if (window.lucide) lucide.createIcons();
  },

  // ── 606 TABLE (Compras / Gastos) ────────────────────────────────────────
  async _render606Table(content, year, month, start, end) {
    const { data: exps } = await supabase.from('expenses')
      .select('*').gte('date',start).lte('date',end).order('date',{ascending:false}).limit(200);

    const total = (exps||[]).filter(e=>e.status!=='cancelado').reduce((s,e)=>s+Number(e.amount||0),0);

    content.innerHTML = `
      <div class="space-y-4">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <h3 class="font-black text-slate-800 flex items-center gap-2"><i data-lucide="shopping-cart" class="w-4 h-4 text-[#FF7A00]"></i> 606 — Compras y Gastos</h3>
          <div class="flex gap-2">
            <button onclick="AccountingModule._openExpenseModal()" class="flex items-center gap-1.5 px-3 py-2 bg-[#FF7A00] text-white rounded-xl font-black text-xs"><i data-lucide="plus" class="w-3.5 h-3.5"></i> Nuevo Gasto</button>
            <button onclick="AccountingModule._exportDGIIFile('${year}${month}','606')" class="flex items-center gap-1.5 px-3 py-2 bg-[#E8F2FF] text-[#0B63C7] rounded-xl font-black text-xs"><i data-lucide="download" class="w-3.5 h-3.5"></i> Exportar TXT</button>
          </div>
        </div>
        <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-xs">
              <thead class="bg-orange-50"><tr>
                <th class="px-3 py-3 text-left font-black text-orange-700 uppercase text-[9px]">Fecha</th>
                <th class="px-3 py-3 text-left font-black text-orange-700 uppercase text-[9px]">NCF</th>
                <th class="px-3 py-3 text-left font-black text-orange-700 uppercase text-[9px]">Suplidor</th>
                <th class="px-3 py-3 text-left font-black text-orange-700 uppercase text-[9px]">Concepto</th>
                <th class="px-3 py-3 text-left font-black text-orange-700 uppercase text-[9px]">Categoría</th>
                <th class="px-3 py-3 text-right font-black text-orange-700 uppercase text-[9px]">Monto</th>
                <th class="px-3 py-3 text-center font-black text-orange-700 uppercase text-[9px]">Estado</th>
                <th class="px-3 py-3 text-center font-black text-orange-700 uppercase text-[9px]">Acción</th>
              </tr></thead>
              <tbody class="divide-y divide-slate-50">
                ${(exps||[]).length ? (exps||[]).map(e => `
                  <tr class="hover:bg-slate-50">
                    <td class="px-3 py-2.5 font-bold text-slate-500">${e.date||'—'}</td>
                    <td class="px-3 py-2.5 font-black text-[#FF7A00] font-mono text-[10px]">${esc(e.ncf||'Sin NCF')}</td>
                    <td class="px-3 py-2.5 font-black text-slate-800">${esc(e.supplier||'—')}</td>
                    <td class="px-3 py-2.5 text-slate-600">${esc(e.concept||'—')}</td>
                    <td class="px-3 py-2.5"><span class="px-2 py-0.5 rounded-full text-[9px] font-black bg-slate-100 text-slate-600">${esc(e.category||'—')}</span></td>
                    <td class="px-3 py-2.5 text-right font-black text-slate-800">${fmt(e.amount)}</td>
                    <td class="px-3 py-2.5 text-center">
                      <span class="px-2 py-1 rounded-full text-[9px] font-black ${e.status==='pagado'?'bg-emerald-100 text-emerald-700':'bg-amber-100 text-amber-700'}">${e.status==='pagado'?'Pagado':'Pendiente'}</span>
                    </td>
                    <td class="px-3 py-2.5 text-center">
                      <button onclick="AccountingModule._edit606Record('${e.id}')" class="px-2 py-1 bg-[#E8F2FF] text-[#0B63C7] rounded-lg text-[9px] font-black">Editar</button>
                    </td>
                  </tr>`).join('')
                : `<tr><td colspan="8" class="text-center py-10 text-slate-400 text-sm">Sin gastos registrados en este período</td></tr>`}
              </tbody>
            </table>
          </div>
          <div class="flex justify-between items-center p-4 border-t border-slate-100 bg-orange-50">
            <span class="font-black text-slate-700 text-sm">TOTAL 606</span>
            <span class="font-black text-[#FF7A00] text-lg">${fmt(total)}</span>
          </div>
        </div>
      </div>`;
    if (window.lucide) lucide.createIcons();
  },

  _edit606Record(id) {
    this._openExpenseModal(id);
  },

  // ── 607 TABLE (Ventas / Ingresos) ───────────────────────────────────────
  async _render607Table(content, year, month, start, end) {
    const { data: pays } = await supabase.from('payments')
      .select('id,amount,concept,method,exclude_dgii,paid_date,students:student_id(name),notes')
      .eq('status','paid').gte('paid_date',start+'T00:00:00').lte('paid_date',end+'T23:59:59')
      .order('paid_date',{ascending:false}).limit(200);

    const included = (pays||[]).filter(p => !p.exclude_dgii);
    const excluded = (pays||[]).filter(p => p.exclude_dgii);
    const total = included.reduce((s,p)=>s+Number(p.amount||0),0);

    content.innerHTML = `
      <div class="space-y-4">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <h3 class="font-black text-slate-800 flex items-center gap-2"><i data-lucide="receipt" class="w-4 h-4 text-[#0B63C7]"></i> 607 — Ventas e Ingresos</h3>
          <button onclick="AccountingModule._exportDGIIFile('${year}${month}','607')" class="flex items-center gap-1.5 px-3 py-2 bg-[#E8F2FF] text-[#0B63C7] rounded-xl font-black text-xs"><i data-lucide="download" class="w-3.5 h-3.5"></i> Exportar TXT</button>
        </div>
        <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-xs">
              <thead class="bg-blue-50"><tr>
                <th class="px-3 py-3 text-left font-black text-blue-700 uppercase text-[9px]">Fecha</th>
                <th class="px-3 py-3 text-left font-black text-blue-700 uppercase text-[9px]">NCF</th>
                <th class="px-3 py-3 text-left font-black text-blue-700 uppercase text-[9px]">Alumno</th>
                <th class="px-3 py-3 text-left font-black text-blue-700 uppercase text-[9px]">Concepto</th>
                <th class="px-3 py-3 text-left font-black text-blue-700 uppercase text-[9px]">Método</th>
                <th class="px-3 py-3 text-right font-black text-blue-700 uppercase text-[9px]">Monto</th>
                <th class="px-3 py-3 text-center font-black text-blue-700 uppercase text-[9px]">DGII</th>
                <th class="px-3 py-3 text-center font-black text-blue-700 uppercase text-[9px]">Acción</th>
              </tr></thead>
              <tbody class="divide-y divide-slate-50">
                ${included.length ? included.map((p,i) => {
                  const fecha = (p.paid_date||'').split('T')[0];
                  const ncf = `B020000000${String(i+1).padStart(8,'0')}`;
                  return `
                    <tr class="hover:bg-slate-50">
                      <td class="px-3 py-2.5 font-bold text-slate-500">${fecha}</td>
                      <td class="px-3 py-2.5 font-black text-[#0B63C7] font-mono text-[10px]">${ncf}</td>
                      <td class="px-3 py-2.5 font-black text-slate-800">${esc(p.students?.name||'—')}</td>
                      <td class="px-3 py-2.5 text-slate-600">${esc(p.concept||'—')}</td>
                      <td class="px-3 py-2.5 text-slate-500 capitalize">${esc(p.method||'—')}</td>
                      <td class="px-3 py-2.5 text-right font-black text-[#0B63C7]">${fmt(p.amount)}</td>
                      <td class="px-3 py-2.5 text-center"><span class="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-100 text-emerald-700">Enviar</span></td>
                      <td class="px-3 py-2.5 text-center">
                        <button onclick="AccountingModule._resendInvoice('${p.id}')" class="px-2 py-1 bg-[#E8F2FF] text-[#0B63C7] rounded-lg text-[9px] font-black">Reenviar</button>
                      </td>
                    </tr>`;
                }).join('')
                : `<tr><td colspan="7" class="text-center py-10 text-slate-400 text-sm">Sin ventas incluidas</td></tr>`}
              </tbody>
            </table>
          </div>
          <div class="flex justify-between items-center p-4 border-t border-slate-100 bg-blue-50">
            <span class="font-black text-slate-700 text-sm">TOTAL 607 (incluidas)</span>
            <span class="font-black text-[#0B63C7] text-lg">${fmt(total)}</span>
          </div>
        </div>
        ${excluded.length ? `
        <div class="bg-white rounded-2xl border border-amber-100 shadow-sm overflow-hidden">
          <div class="p-4 border-b border-amber-100 bg-amber-50">
            <h4 class="font-black text-amber-700 text-sm flex items-center gap-2"><i data-lucide="eye-off" class="w-3.5 h-3.5"></i> Excluidas de DGII (${excluded.length})</h4>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-xs">
              <tbody class="divide-y divide-slate-50">
                ${excluded.map(p => `
                  <tr class="hover:bg-amber-50/50">
                    <td class="px-3 py-2 font-bold text-slate-500">${(p.paid_date||'').split('T')[0]}</td>
                    <td class="px-3 py-2 font-black text-slate-800">${esc(p.students?.name||'—')}</td>
                    <td class="px-3 py-2 text-slate-600">${esc(p.concept||'—')}</td>
                    <td class="px-3 py-2 text-right font-black text-amber-600">${fmt(p.amount)}</td>
                    <td class="px-3 py-2 text-center">
                      <button onclick="AccountingModule._toggleExcludeDGII('${p.id}',false)" class="px-2 py-1 bg-[#E8F2FF] text-[#0B63C7] rounded-lg text-[9px] font-black">Incluir a DGII</button>
                    </td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>` : ''}
      </div>`;
    if (window.lucide) lucide.createIcons();
  },

  async _toggleExcludeDGII(paymentId, exclude) {
    const { error } = await supabase.from('payments').update({ exclude_dgii: exclude }).eq('id', paymentId);
    if (error) return Helpers.toast('Error: ' + error.message, 'error');
    Helpers.toast(exclude ? 'Excluida de DGII' : 'Incluida en DGII', 'success');
    this._loadDgiiContent();
  },

  async _resendInvoice(paymentId) {
    Helpers.toast('Reenviando factura...', 'info');
    try {
      const { data, error } = await supabase.functions.invoke('generate-invoice', {
        body: { payment_id: paymentId, send_email: true }
      });
      if (error) throw error;
      Helpers.toast('Factura reenviada exitosamente', 'success');
    } catch(e) {
      Helpers.toast('Error al reenviar: ' + (e.message||e), 'error');
    }
  },

  // ── 608 TABLE (Anulados) ────────────────────────────────────────────────
  async _render608Table(content, year, month, start, end) {
    const { data: anns } = await supabase.from('payments')
      .select('id,amount,concept,paid_date,students:student_id(name),notes')
      .eq('status','cancelled').gte('paid_date',start+'T00:00:00').lte('paid_date',end+'T23:59:59')
      .order('paid_date',{ascending:false}).limit(200);

    content.innerHTML = `
      <div class="space-y-4">
        <h3 class="font-black text-slate-800 flex items-center gap-2"><i data-lucide="file-x" class="w-4 h-4 text-[#EF4444]"></i> 608 — Comprobantes Anulados</h3>
        <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-xs">
              <thead class="bg-rose-50"><tr>
                <th class="px-3 py-3 text-left font-black text-rose-700 uppercase text-[9px]">Fecha</th>
                <th class="px-3 py-3 text-left font-black text-rose-700 uppercase text-[9px]">NCF</th>
                <th class="px-3 py-3 text-left font-black text-rose-700 uppercase text-[9px]">Alumno</th>
                <th class="px-3 py-3 text-left font-black text-rose-700 uppercase text-[9px]">Concepto</th>
                <th class="px-3 py-3 text-right font-black text-rose-700 uppercase text-[9px]">Monto</th>
              </tr></thead>
              <tbody class="divide-y divide-slate-50">
                ${(anns||[]).length ? (anns||[]).map((p,i) => `
                  <tr class="hover:bg-slate-50">
                    <td class="px-3 py-2.5 font-bold text-slate-500">${(p.paid_date||'').split('T')[0]}</td>
                    <td class="px-3 py-2.5 font-black text-[#EF4444] font-mono text-[10px]">B030000000${String(i+1).padStart(8,'0')}</td>
                    <td class="px-3 py-2.5 font-black text-slate-800">${esc(p.students?.name||'—')}</td>
                    <td class="px-3 py-2.5 text-slate-600">${esc(p.concept||'—')}</td>
                    <td class="px-3 py-2.5 text-right font-black text-[#EF4444]">${fmt(p.amount)}</td>
                  </tr>`).join('')
                : `<tr><td colspan="5" class="text-center py-10 text-slate-400 text-sm">Sin comprobantes anulados</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
    if (window.lucide) lucide.createIcons();
  },

  // ── ENVIAR A DGII (Bulk) ────────────────────────────────────────────────
  async _renderEnviarDGII(content, year, month) {
    content.innerHTML = `
      <div class="space-y-5">
        <h3 class="font-black text-slate-800 flex items-center gap-2"><i data-lucide="send" class="w-4 h-4 text-[#28B54D]"></i> Envío Masivo a DGII — ${year}-${month}</h3>
        <div class="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-4">
          <p class="text-sm text-slate-600">Selecciona los formatos que deseas enviar a la DGII. Las facturas marcadas como "No enviar a DGII" serán excluidas automáticamente.</p>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button onclick="AccountingModule._bulkSendToDGII('${year}','${month}','607')"
              class="bg-[#E8F2FF] border-2 border-[#0B63C7] rounded-2xl p-5 text-left hover:shadow-md transition-all">
              <div class="flex items-center gap-3 mb-2">
                <i data-lucide="receipt" class="w-6 h-6 text-[#0B63C7]"></i>
                <div><h4 class="font-black text-[#0B63C7]">607 — Ventas</h4><p class="text-[10px] text-slate-400">Ingresos del período</p></div>
              </div>
              <div class="text-xs text-slate-500 mt-2">Envía todas las facturas de ingresos excluyendo las marcadas como internas.</div>
            </button>
            <button onclick="AccountingModule._bulkSendToDGII('${year}','${month}','606')"
              class="bg-[#FFF7ED] border-2 border-[#FF7A00] rounded-2xl p-5 text-left hover:shadow-md transition-all">
              <div class="flex items-center gap-3 mb-2">
                <i data-lucide="shopping-cart" class="w-6 h-6 text-[#FF7A00]"></i>
                <div><h4 class="font-black text-[#FF7A00]">606 — Compras</h4><p class="text-[10px] text-slate-400">Gastos del período</p></div>
              </div>
              <div class="text-xs text-slate-500 mt-2">Envía todos los gastos y suplidores registrados con NCF.</div>
            </button>
          </div>
          <div class="flex gap-2 flex-wrap">
            <button onclick="AccountingModule._exportDGIIZip('${year}','${month}')" class="flex items-center gap-1.5 px-4 py-2.5 bg-[#28B54D] text-white rounded-xl font-black text-xs hover:opacity-90"><i data-lucide="archive" class="w-3.5 h-3.5"></i> Exportar ZIP (606+607)</button>
          </div>
        </div>
      </div>`;
    if (window.lucide) lucide.createIcons();
  },

  async _bulkSendToDGII(year, month, tipo) {
    const periodo = `${year}${month}`;
    Helpers.toast(`Preparando envío ${tipo} período ${periodo}...`, 'info');

    try {
      if (tipo === '607') {
        const { data: pays } = await supabase.from('payments')
          .select('id,amount,concept,paid_date,exclude_dgii,students:student_id(name)')
          .eq('status','paid').gte('paid_date',`${year}-${month}-01T00:00:00`);

        const included = (pays||[]).filter(p => !p.exclude_dgii);
        if (!included.length) return Helpers.toast('No hay facturas 607 para enviar', 'warning');

        let txt = included.map((p,i) => {
          const ncf = `B020000000${String(i+1).padStart(8,'0')}`;
          const fecha = (p.paid_date||'').split('T')[0].replaceAll('-','');
          const monto = Number(p.amount||0).toFixed(2).padStart(12,'0');
          const rnc = '000000000'; // Default school RNC
          return `${ncf}|${fecha}|01|${rnc}|${monto}|0.00|0.00|0.00|01|${esc(p.concept||'Mensualidad')}`;
        }).join('\n');

        _downloadTXT(`607-${periodo}.txt`, txt);
        Helpers.toast(`${included.length} facturas 607 exportadas`, 'success');
      } else if (tipo === '606') {
        const { data: exp } = await supabase.from('expenses')
          .select('*').gte('date',`${year}-${month}-01`).lte('date',`${year}-${month}-31`).neq('status','cancelado');

        if (!exp?.length) return Helpers.toast('No hay gastos 606 para enviar', 'warning');

        let txt = (exp||[]).map((e,i) => {
          const fecha = (e.date||'').replaceAll('-','');
          const monto = Number(e.amount||0).toFixed(2).padStart(12,'0');
          return `${e.ncf||'B01000000000'}|${fecha}|06|000000000|${monto}|0.00|0.00|0.00|01|${esc(e.concept||'Gasto')}`;
        }).join('\n');

        _downloadTXT(`606-${periodo}.txt`, txt);
        Helpers.toast(`${(exp||[]).length} registros 606 exportados`, 'success');
      }
    } catch(e) {
      Helpers.toast('Error: ' + e.message, 'error');
    }
  },

  async _exportDGIIFile(periodo, tipo) {
    await this._bulkSendToDGII(periodo.slice(0,4), periodo.slice(4), tipo);
  },

  async _exportDGIIZip(year, month) {
    const periodo = `${year}${month}`;
    Helpers.toast('Exportando ambos formatos...', 'info');
    await this._bulkSendToDGII(year, month, '607');
    setTimeout(() => this._bulkSendToDGII(year, month, '606'), 1000);
  },

  // ── IT-1 (Declaración de ITBIS) ──────────────────────────────────────────
  async _renderIT1(content, year, month, start, end) {
    const [paysRes, expRes] = await Promise.allSettled([
      supabase.from('payments').select('amount,exclude_dgii').eq('status','paid').gte('paid_date',start+'T00:00:00').lte('paid_date',end+'T23:59:59'),
      supabase.from('expenses').select('amount').gte('date',start).lte('date',end).neq('status','cancelado'),
    ]);
    const pays = (paysRes.value?.data||[]).filter(p=>!p.exclude_dgii);
    const exps = expRes.value?.data||[];
    const itbisVentas = pays.reduce((s,p)=>s+Number(p.amount||0),0) * 0.18;
    const itbisCompras = exps.reduce((s,e)=>s+Number(e.amount||0),0) * 0.18;
    const balance = itbisVentas - itbisCompras;

    content.innerHTML = `
      <div class="space-y-5">
        <div class="flex items-center justify-between">
          <h3 class="font-black text-slate-800 flex items-center gap-2"><i data-lucide="percent" class="w-4 h-4 text-[#8B5CF6]"></i> IT-1 — Declaración de ITBIS (${year}-${month})</h3>
          <button onclick="AccountingModule._exportIT1('${year}${month}')" class="flex items-center gap-1.5 px-3 py-2 bg-[#8B5CF6] text-white rounded-xl font-black text-xs"><i data-lucide="download" class="w-3.5 h-3.5"></i> Exportar TXT</button>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="bg-white rounded-2xl border border-violet-100 p-5 shadow-sm">
            <p class="text-[9px] font-black uppercase text-violet-400 mb-2">ITBIS Cobrado (Ventas)</p>
            <p class="text-xl font-black text-[#8B5CF6]">${fmt(itbisVentas)}</p>
            <p class="text-[10px] text-slate-400 mt-1">18% sobre ventas incluidas en 607</p>
          </div>
          <div class="bg-white rounded-2xl border border-emerald-100 p-5 shadow-sm">
            <p class="text-[9px] font-black uppercase text-emerald-400 mb-2">ITBIS Pagado (Compras)</p>
            <p class="text-xl font-black text-[#28B54D]">${fmt(itbisCompras)}</p>
            <p class="text-[10px] text-slate-400 mt-1">18% sobre gastos en 606</p>
          </div>
          <div class="bg-white rounded-2xl border border-${balance>=0?'violet':'rose'}-100 p-5 shadow-sm">
            <p class="text-[9px] font-black uppercase ${balance>=0?'text-violet':'text-rose'}-400 mb-2">Balance Neto</p>
            <p class="text-xl font-black ${balance>=0?'text-[#8B5CF6]':'text-rose-600'}">${balance>=0?'A favor':'Por pagar'} ${fmt(Math.abs(balance))}</p>
            <p class="text-[10px] text-slate-400 mt-1">${balance>=0?'Saldo a favor del contribuyente':'Monto a pagar a la DGII'}</p>
          </div>
        </div>
        <div class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <h4 class="font-black text-slate-700 text-sm mb-3">Desglose Mensual</h4>
          <div class="space-y-2">
            <div class="flex justify-between py-2 border-b border-slate-50"><span class="text-xs text-slate-500">Ventas gravadas (excl. exentas)</span><span class="text-xs font-black text-slate-700">${fmt(pays.reduce((s,p)=>s+Number(p.amount||0),0))}</span></div>
            <div class="flex justify-between py-2 border-b border-slate-50"><span class="text-xs text-slate-500">ITBIS en ventas (18%)</span><span class="text-xs font-black text-[#8B5CF6]">${fmt(itbisVentas)}</span></div>
            <div class="flex justify-between py-2 border-b border-slate-50"><span class="text-xs text-slate-500">Compras gravadas</span><span class="text-xs font-black text-slate-700">${fmt(exps.reduce((s,e)=>s+Number(e.amount||0),0))}</span></div>
            <div class="flex justify-between py-2 border-b border-slate-50"><span class="text-xs text-slate-500">ITBIS en compras (18%)</span><span class="text-xs font-black text-[#28B54D]">${fmt(itbisCompras)}</span></div>
            <div class="flex justify-between py-3 rounded-xl px-3 ${balance>=0?'bg-violet-50':'bg-rose-50'} mt-1"><span class="font-black text-sm">Balance ITBIS</span><span class="font-black text-sm ${balance>=0?'text-[#8B5CF6]':'text-rose-600'}">${balance>=0?'':'-'}${fmt(Math.abs(balance))}</span></div>
          </div>
        </div>
      </div>`;
    if (window.lucide) lucide.createIcons();
  },

  _exportIT1(periodo) {
    const y = periodo.slice(0,4), m = periodo.slice(4);
    const start = `${y}-${m}-01`;
    const end = new Date(Number(y), Number(m), 0).toISOString().split('T')[0];
    Helpers.toast('Exportando IT-1...', 'info');
    setTimeout(async () => {
      const [paysRes, expRes] = await Promise.all([
        supabase.from('payments').select('amount,exclude_dgii').eq('status','paid').gte('paid_date',start+'T00:00:00').lte('paid_date',end+'T23:59:59'),
        supabase.from('expenses').select('amount').gte('date',start).lte('date',end).neq('status','cancelado'),
      ]);
      const pays = (paysRes.data||[]).filter(p=>!p.exclude_dgii);
      const exps = expRes.data||[];
      const itbisVentas = pays.reduce((s,p)=>s+Number(p.amount||0),0) * 0.18;
      const itbisCompras = exps.reduce((s,e)=>s+Number(e.amount||0),0) * 0.18;
      const balance = itbisVentas - itbisCompras;
      const txt = `IT-1|${periodo}|${itbisVentas.toFixed(2)}|${itbisCompras.toFixed(2)}|${balance.toFixed(2)}`;
      _downloadTXT(`IT1-${periodo}.txt`, txt);
      Helpers.toast('IT-1 exportado', 'success');
    }, 200);
  },

  // ── IR-17 (Retenciones de Nómina) ────────────────────────────────────────
  async _renderIR17(content, year, month, start, end) {
    const { data: records } = await supabase.from('payroll_records')
      .select('*,profiles:employee_id(name,role)')
      .eq('period',`${year}-${month}`)
      .order('created_at',{ascending:false}).limit(100);

    const totalISR = (records||[]).reduce((s,r)=>s+Number(r.isr||0),0);
    const totalAFP = (records||[]).reduce((s,r)=>s+Number(r.afp||0),0);
    const totalARS = (records||[]).reduce((s,r)=>s+Number(r.ars||0),0);
    const totalNeto = (records||[]).reduce((s,r)=>s+Number(r.net_salary||0),0);

    content.innerHTML = `
      <div class="space-y-5">
        <div class="flex items-center justify-between">
          <h3 class="font-black text-slate-800 flex items-center gap-2"><i data-lucide="users" class="w-4 h-4 text-[#28B54D]"></i> IR-17 — Retenciones Nómina (${year}-${month})</h3>
          <button onclick="AccountingModule._exportIR17('${year}${month}')" class="flex items-center gap-1.5 px-3 py-2 bg-[#28B54D] text-white rounded-xl font-black text-xs"><i data-lucide="download" class="w-3.5 h-3.5"></i> Exportar TXT</button>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
            <p class="text-[9px] font-black uppercase text-slate-400 mb-1">Empleados</p>
            <p class="text-lg font-black text-slate-800">${(records||[]).length}</p>
          </div>
          <div class="bg-white rounded-2xl p-4 border border-emerald-100 shadow-sm">
            <p class="text-[9px] font-black uppercase text-emerald-400 mb-1">ISR Retenido</p>
            <p class="text-lg font-black text-[#28B54D]">${fmt(totalISR)}</p>
          </div>
          <div class="bg-white rounded-2xl p-4 border border-rose-100 shadow-sm">
            <p class="text-[9px] font-black uppercase text-rose-400 mb-1">AFP + ARS</p>
            <p class="text-lg font-black text-rose-600">${fmt(totalAFP + totalARS)}</p>
          </div>
          <div class="bg-white rounded-2xl p-4 border border-blue-100 shadow-sm">
            <p class="text-[9px] font-black uppercase text-blue-400 mb-1">Total Neto Pagado</p>
            <p class="text-lg font-black text-[#0B63C7]">${fmt(totalNeto)}</p>
          </div>
        </div>
        <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-xs">
              <thead class="bg-emerald-50"><tr>
                <th class="px-3 py-3 text-left font-black text-emerald-700 uppercase text-[9px]">Empleado</th>
                <th class="px-3 py-3 text-left font-black text-emerald-700 uppercase text-[9px]">Cargo</th>
                <th class="px-3 py-3 text-right font-black text-emerald-700 uppercase text-[9px]">Bruto</th>
                <th class="px-3 py-3 text-right font-black text-emerald-700 uppercase text-[9px]">AFP</th>
                <th class="px-3 py-3 text-right font-black text-emerald-700 uppercase text-[9px]">ARS</th>
                <th class="px-3 py-3 text-right font-black text-emerald-700 uppercase text-[9px]">ISR</th>
                <th class="px-3 py-3 text-right font-black text-emerald-700 uppercase text-[9px]">Neto</th>
                <th class="px-3 py-3 text-center font-black text-emerald-700 uppercase text-[9px]">Estado</th>
              </tr></thead>
              <tbody class="divide-y divide-slate-50">
                ${(records||[]).length ? (records||[]).map(r => `
                  <tr class="hover:bg-slate-50">
                    <td class="px-3 py-2.5 font-black text-slate-800">${esc(r.profiles?.name||'—')}</td>
                    <td class="px-3 py-2.5 text-slate-500 capitalize">${esc(r.profiles?.role||'—')}</td>
                    <td class="px-3 py-2.5 text-right font-bold text-slate-700">${fmt(r.gross_salary)}</td>
                    <td class="px-3 py-2.5 text-right text-rose-500">${fmt(r.afp)}</td>
                    <td class="px-3 py-2.5 text-right text-rose-500">${fmt(r.ars)}</td>
                    <td class="px-3 py-2.5 text-right font-black text-[#28B54D]">${fmt(r.isr)}</td>
                    <td class="px-3 py-2.5 text-right font-black text-slate-800">${fmt(r.net_salary)}</td>
                    <td class="px-3 py-2.5 text-center">
                      <span class="px-2 py-0.5 rounded-full text-[9px] font-black ${r.status==='pagado'?'bg-emerald-100 text-emerald-700':'bg-amber-100 text-amber-700'}">${r.status==='pagado'?'Pagado':'Pendiente'}</span>
                    </td>
                  </tr>`).join('')
                : `<tr><td colspan="8" class="text-center py-10 text-slate-400 text-sm">Sin nómina procesada para este período</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
    if (window.lucide) lucide.createIcons();
  },

  _exportIR17(periodo) {
    Helpers.toast('Exportando IR-17...', 'info');
    setTimeout(async () => {
      const { data: records } = await supabase.from('payroll_records')
        .select('*,profiles:employee_id(name)')
        .eq('period', periodo.slice(0,4)+'-'+periodo.slice(4));
      let txt = (records||[]).map(r => {
        const name = r.profiles?.name || '';
        const rnc = '000000000';
        return `${rnc}|${name}|${Number(r.gross_salary||0).toFixed(2)}|${Number(r.afp||0).toFixed(2)}|${Number(r.ars||0).toFixed(2)}|${Number(r.isr||0).toFixed(2)}|${Number(r.net_salary||0).toFixed(2)}`;
      }).join('\n');
      _downloadTXT(`IR17-${periodo}.txt`, txt || 'SIN REGISTROS');
      Helpers.toast('IR-17 exportado', 'success');
    }, 200);
  },

  // ══════════════════════════════════════════════════════════════════════════
  // REPORTES — PDF Exports
  // ══════════════════════════════════════════════════════════════════════════
  _renderReportes() {
    const body = $el('acct-body');
    if (!body) return;
    const cards = [
      { fn:'_exportReporteDiario',   icon:'file-text',      color:'#28B54D', title:'Reporte Diario',     sub:'Cobros del día con desglose por método', tag:'Hoy' },
      { fn:'_exportReporteMensual',  icon:'bar-chart-3',    color:'#0B63C7', title:'Reporte Mensual',    sub:'Análisis completo ingresos vs gastos', tag:'Mes' },
      { fn:'_exportMorosidad',       icon:'alert-triangle', color:'#FF7A00', title:'Morosidad',          sub:'Deudores, saldos y antigüedad de cartera', tag:'CxC' },
      { fn:'_exportEstadoResultados',icon:'file-bar-chart', color:'#8B5CF6', title:'Estado de Resultados',sub:'P&G del año fiscal actual', tag:'Finanzas' },
      { fn:'_exportNominaPDF',       icon:'briefcase',      color:'#0B63C7', title:'Resumen de Nómina',  sub:'Planilla mensual con deducciones de ley', tag:'RRHH' },
      { fn:'_exportFlujoCaja',       icon:'trending-up',    color:'#28B54D', title:'Flujo de Caja',      sub:'Entradas, salidas y balance mensual', tag:'Caja' },
      { fn:'_exportIngresosAnuales', icon:'pie-chart',      color:'#F59E0B', title:'Ingresos por Año',   sub:'Distribución anual de ingresos por concepto', tag:'Anual' },
      { fn:'_exportGastosCategoria', icon:'layers',         color:'#EF4444', title:'Gastos por Categoría',sub:'Desglose de gastos operacionales por área', tag:'Gastos' },
      { fn:'_exportCarteraVencida',  icon:'clock',          color:'#DC2626', title:'Cartera Vencida',    sub:'Antigüedad de saldos: 30/60/90+ días', tag:'CxC' },
    ];
    body.innerHTML = `
      <div class="space-y-5">
        <div class="flex items-center justify-between flex-wrap gap-3">
          <h3 class="font-black text-slate-800 flex items-center gap-2">
            <i data-lucide="file-text" class="w-4 h-4 text-[#0B63C7]"></i> Centro de Reportes
          </h3>
          <p class="text-xs text-slate-400 font-bold">Selecciona un reporte para generar</p>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          ${cards.map(c => `
            <button onclick="AccountingModule.${c.fn}()"
              class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm text-left hover:shadow-md transition-all group">
              <div class="flex items-center justify-between mb-3">
                <div class="p-2.5 rounded-xl transition-colors" style="background:${c.color}20">
                  <i data-lucide="${c.icon}" class="w-5 h-5" style="color:${c.color}"></i>
                </div>
                <span class="text-[8px] font-black uppercase px-2 py-0.5 rounded-full" style="background:${c.color}15;color:${c.color}">${c.tag}</span>
              </div>
              <h4 class="font-black text-slate-800 mb-1">${c.title}</h4>
              <p class="text-[10px] text-slate-400 mb-3">${c.sub}</p>
              <div class="flex items-center gap-1.5 text-xs font-black" style="color:${c.color}">
                <i data-lucide="download" class="w-3.5 h-3.5"></i> Generar PDF
              </div>
            </button>`).join('')}
        </div>
      </div>`;
    if (window.lucide) lucide.createIcons();
  },

  async _exportReporteDiario() {
    const todayStr = today();
    const { data } = await supabase.from('payments').select('amount,concept,method,paid_date,students:student_id(name)')
      .eq('status','paid').gte('paid_date',todayStr+'T00:00:00');
    const total = (data||[]).reduce((s,p)=>s+Number(p.amount||0),0);
    const rows = (data||[]).map(p =>
      `<tr><td>${esc(p.students?.name||'—')}</td><td>${esc(p.concept||'—')}</td><td>${esc(p.method||'—')}</td><td style="text-align:right">${fmt(p.amount)}</td></tr>`
    ).join('');
    _printReport('Reporte Diario', todayStr, rows, `<tr><td colspan="3" style="font-weight:900">TOTAL</td><td style="text-align:right;font-weight:900;color:#0B63C7">${fmt(total)}</td></tr>`);
  },

  async _exportReporteMensual() {
    const now = new Date();
    const mk  = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const { data } = await supabase.from('payments').select('amount,concept,method,paid_date,students:student_id(name)')
      .eq('status','paid').gte('paid_date',mk+'-01T00:00:00');
    const total = (data||[]).reduce((s,p)=>s+Number(p.amount||0),0);
    const rows  = (data||[]).map(p =>
      `<tr><td>${(p.paid_date||'').split('T')[0]}</td><td>${esc(p.students?.name||'—')}</td><td>${esc(p.concept||'—')}</td><td style="text-align:right">${fmt(p.amount)}</td></tr>`
    ).join('');
    _printReport('Reporte Mensual', mk, rows, `<tr><td colspan="3" style="font-weight:900">TOTAL MES</td><td style="text-align:right;font-weight:900;color:#0B63C7">${fmt(total)}</td></tr>`);
  },

  async _exportMorosidad() {
    const { data } = await supabase.from('student_charges').select('amount,status,due_date,student_enrollments:student_enrollment_id(students:student_id(name))').in('status',['pending','overdue']);
    const rows = (data||[]).map(c => {
      const name = c.student_enrollments?.students?.name || '—';
      return `<tr><td>${esc(name)}</td><td>${c.due_date||'—'}</td><td>${c.status}</td><td style="text-align:right">${fmt(c.amount)}</td></tr>`;
    }).join('');
    _printReport('Reporte de Morosidad', today(), rows, '');
  },

  _exportEstadoResultados() { this._loadEstados(); Helpers.toast('Ver sección Estados Financieros', 'info'); },
  _exportNominaPDF()        { this._loadNomina();  Helpers.toast('Usa los botones PDF por empleado', 'info'); },
  _exportFlujoCaja()        { this._loadCashflow();Helpers.toast('Ver sección Flujo de Caja', 'info'); },

  async _exportIngresosAnuales() {
    const y = new Date().getFullYear();
    const { data } = await supabase.from('payments').select('amount,concept,paid_date').eq('status','paid').gte('paid_date',`${y}-01-01T00:00:00`);
    const grp = {};
    (data||[]).forEach(p => { const k = p.concept||'Sin concepto'; grp[k] = (grp[k]||0) + Number(p.amount||0); });
    const total = Object.values(grp).reduce((s,v)=>s+v,0);
    const rows = Object.entries(grp).sort((a,b)=>b[1]-a[1]).map(([k,v]) =>
      `<tr><td>${esc(k)}</td><td>${((v/total)*100).toFixed(1)}%</td><td style="text-align:right;font-weight:900;color:#0B63C7">${fmt(v)}</td></tr>`
    ).join('');
    _printReport('Ingresos por Año Fiscal', `${y}`, rows, `<tr><td colspan="2" style="font-weight:900">TOTAL</td><td style="text-align:right;font-weight:900;color:#28B54D">${fmt(total)}</td></tr>`);
  },

  async _exportGastosCategoria() {
    const y = new Date().getFullYear();
    const { data } = await supabase.from('expenses').select('amount,category,concept').gte('date',`${y}-01-01`);
    const grp = {};
    (data||[]).forEach(g => { const k = g.category||'Sin categoría'; grp[k] = (grp[k]||0) + Number(g.amount||0); });
    const total = Object.values(grp).reduce((s,v)=>s+v,0);
    const rows = Object.entries(grp).sort((a,b)=>b[1]-a[1]).map(([k,v]) =>
      `<tr><td>${esc(k)}</td><td>${((v/total)*100).toFixed(1)}%</td><td style="text-align:right;font-weight:900;color:#EF4444">${fmt(v)}</td></tr>`
    ).join('');
    _printReport('Gastos por Categoría', `${y}`, rows, `<tr><td colspan="2" style="font-weight:900">TOTAL</td><td style="text-align:right;font-weight:900;color:#EF4444">${fmt(total)}</td></tr>`);
  },

  async _exportCarteraVencida() {
    const { data } = await supabase.from('student_charges').select('amount,due_date,status,student_enrollments:student_enrollment_id(students:student_id(name))').in('status',['pending','overdue']);
    const now = new Date();
    const buckets = { '0-30': [], '31-60': [], '61-90': [], '90+': [] };
    (data||[]).forEach(c => {
      if (!c.due_date) return;
      const days = Math.floor((now - new Date(c.due_date+'T00:00:00')) / 86400000);
      const name = c.student_enrollments?.students?.name || '—';
      const entry = `<tr><td>${esc(name)}</td><td>${c.due_date}</td><td>${days} días</td><td style="text-align:right">${fmt(c.amount)}</td></tr>`;
      if (days <= 30) buckets['0-30'].push(entry);
      else if (days <= 60) buckets['31-60'].push(entry);
      else if (days <= 90) buckets['61-90'].push(entry);
      else buckets['90+'].push(entry);
    });
    let rows = '';
    Object.entries(buckets).forEach(([range, entries]) => {
      if (!entries.length) return;
      rows += `<tr><td colspan="4" style="background:#FEF3C7;font-weight:900;color:#92400E;padding:8px">Vencido ${range} días (${entries.length})</td></tr>`;
      rows += entries.join('');
    });
    _printReport('Cartera Vencida — Antigüedad de Saldos', today(), rows || '<tr><td colspan="4">Sin deudas vencidas</td></tr>', '');
  },

  // Legacy API compatibility
  exportIngresosPDF()            { this._exportReporteMensual(); },
  exportGastosPDF()              { this._renderReportes(); },
  exportNominaPDF()              { this._exportNominaPDF(); },
  exportReporteDiarioPDF()       { this._exportReporteDiario(); },
  exportReporteMensualPDF()      { this._exportReporteMensual(); },
  exportReporteMorosidadPDF()    { this._exportMorosidad(); },
  openGastoModal()               { this._openExpenseModal(); },
  closeGastoModal()              { document.getElementById('expenseModal')?.parentElement?.remove(); },
  openNominaModal()              { this._calcNominaModal(); },
  closeNominaModal()             {},
  loadCashflow()                 { this.showTab('cashflow'); },
  loadFacturacion()              { this.showTab('estados'); },
  loadCXC()                      { this.showTab('cxc'); },

  // ══════════════════════════════════════════════════════════════════════════
  // CONFIG
  // ══════════════════════════════════════════════════════════════════════════
  _renderConfig() {
    const body = $el('acct-body');
    if (!body) return;
    body.innerHTML = `
      <div class="space-y-5 max-w-2xl">
        <!-- Configuración de Cobro -->
        <div class="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-5">
          <h3 class="font-black text-slate-800 flex items-center gap-2">
            <i data-lucide="settings-2" class="w-5 h-5 text-[#0B63C7]"></i> Configuración de Cobro
          </h3>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-[9px] font-black text-slate-400 uppercase mb-1">Día Generación Automática</label>
              <input type="number" id="confGenDay" min="1" max="28" value="25"
                class="w-full px-3 py-2.5 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-blue-400">
            </div>
            <div>
              <label class="block text-[9px] font-black text-slate-400 uppercase mb-1">Día Límite de Pago</label>
              <input type="number" id="confDueDay" min="1" max="28" value="5"
                class="w-full px-3 py-2.5 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-blue-400">
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <button onclick="AccountingModule._savePaymentConfig()"
              class="py-2.5 text-white text-xs font-black uppercase rounded-xl flex items-center justify-center gap-2" style="background:#0B63C7">
              <i data-lucide="save" class="w-4 h-4"></i> Guardar
            </button>
            <button onclick="AccountingModule._sendReminders()"
              class="py-2.5 text-white text-xs font-black uppercase rounded-xl flex items-center justify-center gap-2" style="background:#FF8A00">
              <i data-lucide="bell" class="w-4 h-4"></i> Enviar Recordatorios
            </button>
            <button onclick="AccountingModule._generateChargesNow()"
              class="py-2.5 text-white text-xs font-black uppercase rounded-xl flex items-center justify-center gap-2" style="background:#28B54D">
              <i data-lucide="play-circle" class="w-4 h-4"></i> Generar Cobros Ahora
            </button>
            <button onclick="AccountingModule._exportMorosidad()"
              class="py-2.5 text-white text-xs font-black uppercase rounded-xl flex items-center justify-center gap-2" style="background:#475569">
              <i data-lucide="download" class="w-4 h-4"></i> Exportar Morosidad
            </button>
          </div>
        </div>

        <!-- Configuración Fiscal DGII -->
        <div class="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-5">
          <h3 class="font-black text-slate-800 flex items-center gap-2">
            <i data-lucide="landmark" class="w-5 h-5 text-[#0B63C7]"></i> Configuración Fiscal DGII
          </h3>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-[9px] font-black text-slate-400 uppercase mb-1">RNC / Cédula</label>
              <input type="text" id="confRNC" placeholder="123-456789-0" value=""
                class="w-full px-3 py-2.5 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-blue-400">
            </div>
            <div>
              <label class="block text-[9px] font-black text-slate-400 uppercase mb-1">Nombre Fiscal</label>
              <input type="text" id="confRazon" placeholder="Colegio Montessori..." value=""
                class="w-full px-3 py-2.5 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-blue-400">
            </div>
            <div>
              <label class="block text-[9px] font-black text-slate-400 uppercase mb-1">NCF Inicial (Ventas)</label>
              <input type="text" id="confNCFStart" placeholder="00000001" value=""
                class="w-full px-3 py-2.5 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-blue-400">
            </div>
            <div>
              <label class="block text-[9px] font-black text-slate-400 uppercase mb-1">% ITBIS</label>
              <input type="number" id="confITBISRate" min="0" max="100" value="18" step="0.01"
                class="w-full px-3 py-2.5 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-blue-400">
            </div>
            <div>
              <label class="block text-[9px] font-black text-slate-400 uppercase mb-1">% Mora por mes</label>
              <input type="number" id="confMoraRate" min="0" max="100" value="5" step="0.1"
                class="w-full px-3 py-2.5 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-blue-400">
            </div>
            <div>
              <label class="block text-[9px] font-black text-slate-400 uppercase mb-1">Período DGII</label>
              <select id="confDGIIPeriod" class="w-full px-3 py-2.5 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-blue-400">
                <option value="monthly">Mensual</option>
                <option value="bimonthly">Bimestral</option>
                <option value="quarterly">Trimestral</option>
              </select>
            </div>
          </div>
          <button onclick="AccountingModule._saveFiscalConfig()"
            class="w-full py-2.5 text-white text-xs font-black uppercase rounded-xl flex items-center justify-center gap-2" style="background:#0B63C7">
            <i data-lucide="save" class="w-4 h-4"></i> Guardar Configuración Fiscal
          </button>
        </div>

        <!-- Parámetros Nómina -->
        <div class="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-5">
          <h3 class="font-black text-slate-800 flex items-center gap-2">
            <i data-lucide="briefcase" class="w-5 h-5 text-[#0B63C7]"></i> Parámetros de Nómina
          </h3>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-[9px] font-black text-slate-400 uppercase mb-1">AFP Empleado %</label>
              <input type="number" id="confAFPEmp" value="2.87" step="0.01"
                class="w-full px-3 py-2.5 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-blue-400">
            </div>
            <div>
              <label class="block text-[9px] font-black text-slate-400 uppercase mb-1">ARS Empleado %</label>
              <input type="number" id="confARSEmp" value="3.04" step="0.01"
                class="w-full px-3 py-2.5 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-blue-400">
            </div>
            <div>
              <label class="block text-[9px] font-black text-slate-400 uppercase mb-1">AFP Patronal %</label>
              <input type="number" id="confAFPPatron" value="7.10" step="0.01"
                class="w-full px-3 py-2.5 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-blue-400">
            </div>
            <div>
              <label class="block text-[9px] font-black text-slate-400 uppercase mb-1">ARS Patronal %</label>
              <input type="number" id="confARSPatron" value="7.09" step="0.01"
                class="w-full px-3 py-2.5 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-blue-400">
            </div>
          </div>
          <button onclick="AccountingModule._saveNominaConfig()"
            class="w-full py-2.5 text-white text-xs font-black uppercase rounded-xl flex items-center justify-center gap-2" style="background:#8B5CF6">
            <i data-lucide="save" class="w-4 h-4"></i> Guardar Parámetros
          </button>
        </div>
      </div>`;
    if (window.lucide) lucide.createIcons();
  },

  _savePaymentConfig()    { Helpers.toast('Configuración de cobro guardada', 'success'); },
  _sendReminders()        { this._sendCxCReminders(); },
  _generateChargesNow()   { supabase.functions.invoke('generate-monthly-charges',{}).catch(()=>{}); Helpers.toast('Generando cobros del mes...', 'info'); },

  async _saveFiscalConfig() {
    const cfg = {
      rnc: document.getElementById('confRNC')?.value || '',
      razon_social: document.getElementById('confRazon')?.value || '',
      ncf_start: document.getElementById('confNCFStart')?.value || '',
      itbis_rate: parseFloat(document.getElementById('confITBISRate')?.value || '18'),
      mora_rate: parseFloat(document.getElementById('confMoraRate')?.value || '5'),
      dgii_period: document.getElementById('confDGIIPeriod')?.value || 'monthly',
    };
    try {
      localStorage.setItem('acct_fiscal_config', JSON.stringify(cfg));
      Helpers.toast('Configuración fiscal guardada', 'success');
    } catch(_) { Helpers.toast('Error guardando configuración', 'error'); }
  },

  async _saveNominaConfig() {
    const cfg = {
      afp_empleado: parseFloat(document.getElementById('confAFPEmp')?.value || '2.87'),
      ars_empleado: parseFloat(document.getElementById('confARSEmp')?.value || '3.04'),
      afp_patronal: parseFloat(document.getElementById('confAFPPatron')?.value || '7.10'),
      ars_patronal: parseFloat(document.getElementById('confARSPatron')?.value || '7.09'),
    };
    try {
      localStorage.setItem('acct_nomina_config', JSON.stringify(cfg));
      Helpers.toast('Parámetros de nómina guardados', 'success');
    } catch(_) { Helpers.toast('Error guardando configuración', 'error'); }
  },
};

// ── Private helpers ──────────────────────────────────────────────────────────
function _downloadTXT(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function _printReport(title, periodo, rows, footer) {
  const win = window.open('','_blank');
  win.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
    <style>
      body{font-family:Arial,sans-serif;padding:32px;color:#1e293b}
      h1{color:#0B63C7;font-size:1.3rem;margin-bottom:4px}
      .sub{color:#64748b;font-size:.8rem;margin-bottom:20px}
      table{width:100%;border-collapse:collapse}
      th{background:#E8F2FF;color:#0850A0;font-size:.7rem;text-transform:uppercase;padding:8px 10px;text-align:left}
      td{padding:7px 10px;border-bottom:1px solid #f1f5f9;font-size:.85rem}
      .footer{text-align:center;color:#94a3b8;font-size:.75rem;margin-top:24px}
    </style></head><body>
    <h1>Colegio Montessori Sonrisas Creativas</h1>
    <div class="sub">${title} · ${periodo}</div>
    <table><thead><tr>
      <th>Nombre</th><th>Concepto</th><th>Método</th><th style="text-align:right">Monto</th>
    </tr></thead><tbody>${rows}${footer}</tbody></table>
    <div class="footer">Generado el ${new Date().toLocaleDateString('es-DO')}</div>
    <script>window.onload=()=>window.print()<\/script></body></html>`);
  win.document.close();
}

// Expose to window for legacy HTML onclick handlers
window.AccountingModule = AccountingModule;
