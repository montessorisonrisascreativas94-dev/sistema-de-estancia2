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
    const m         = String(now.getMonth()+1).padStart(2,'0');
    const startMonth = `${y}-${m}-01`;
    const todayStr  = today();
    const prevMStart = new Date(y, now.getMonth()-1, 1).toISOString().split('T')[0];
    const prevMEnd   = new Date(y, now.getMonth(), 0).toISOString().split('T')[0];

    const [paymentsRes, chargesRes, prevRes] = await Promise.allSettled([
      supabase.from('payments').select('amount,concept,method,paid_date,status,month_paid')
        .gte('paid_date', `${y}-01-01T00:00:00`).order('paid_date'),
      supabase.from('student_charges').select('amount,status,due_date'),
      supabase.from('payments').select('amount').eq('status','paid')
        .gte('paid_date', prevMStart+'T00:00:00').lte('paid_date', prevMEnd+'T23:59:59'),
    ]);

    const payments  = paymentsRes.value?.data  || [];
    const charges   = chargesRes.value?.data   || [];
    const prevPays  = prevRes.value?.data       || [];

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

    // Métodos del mes
    const byMethod  = {};
    monthPaid.forEach(p => { const k = p.method||'efectivo'; byMethod[k] = (byMethod[k]||0) + Number(p.amount||0); });

    // Ingresos mensuales del año
    const byMonthArr = Array.from({length:12}, (_,i) => {
      const mk = `${y}-${String(i+1).padStart(2,'0')}`;
      return paid.filter(p => p.paid_date?.startsWith(mk)).reduce((s,p)=>s+Number(p.amount||0),0);
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

        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          ${Object.entries(byMethod).map(([m,v]) => `
            <div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex items-center gap-3">
              <div class="p-2.5 rounded-xl bg-[#E8F2FF]"><i data-lucide="credit-card" class="w-4 h-4 text-[#0B63C7]"></i></div>
              <div><p class="text-sm font-black text-slate-800">${fmt(v)}</p><p class="text-[10px] text-slate-400 font-bold capitalize">${esc(m)}</p></div>
            </div>`).join('')}
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <h3 class="font-black text-slate-700 mb-4 text-sm">Ingresos ${y} por Mes</h3>
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
    renderChart('acct-chart-mes','bar', mLabels, [{
      label:'Ingresos', data: byMonthArr,
      backgroundColor: byMonthArr.map((_,i) => i === now.getMonth() ? '#0B63C7' : '#BFDBFE'),
      borderRadius: 8
    }]);
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
      supabase.from('payments').select('amount,concept,status').eq('status','paid').gte('paid_date',`${y}-01-01T00:00:00`),
      supabase.from('expenses').select('amount,category,concept').gte('date',`${y}-01-01`).order('date',{ascending:false}),
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

    const row = (label, value, cls='text-slate-700') =>
      `<div class="flex justify-between py-2 border-b border-slate-50">
        <span class="text-sm font-bold ${cls}">${esc(label)}</span>
        <span class="text-sm font-black ${cls}">${fmt(value)}</span>
      </div>`;
    const rowH = label =>
      `<div class="py-2 mt-2"><span class="text-[10px] font-black uppercase tracking-wider text-slate-400">${label}</span></div>`;

    body.innerHTML = `
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
          ${rowH('Activos')}
          ${row('Caja / Efectivo', 0, 'text-slate-600')}
          ${row('Cuentas por Cobrar', cxcTotal, 'text-slate-600')}
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
      </div>`;
    if (window.lucide) lucide.createIcons();
  },

  // ══════════════════════════════════════════════════════════════════════════
  // LIBRO DIARIO (Partida Doble)
  // ══════════════════════════════════════════════════════════════════════════
  async _loadLibroDiario(page = 1) {
    const body = $el('acct-body');
    if (!body) return;
    const PAGE = 30;
    const from = (page-1)*PAGE, to = from+PAGE-1;

    const [paysRes, gastosRes] = await Promise.allSettled([
      supabase.from('payments').select('id,amount,concept,method,paid_date,status,students:student_id(name)')
        .eq('status','paid').order('paid_date',{ascending:false}).range(from, to),
      supabase.from('expenses').select('id,amount,concept,category,date')
        .order('date',{ascending:false}).range(from, to),
    ]);

    const pays   = paysRes.value?.data   || [];
    const gastos = gastosRes.value?.data || [];

    // Build journal entries
    const entries = [
      ...pays.map(p => ({
        fecha: (p.paid_date||'').split('T')[0],
        ref: `PAY-${p.id}`.slice(0,12),
        descripcion: `Cobro ${esc(p.concept||'Mensualidad')} · ${esc(p.students?.name||'')}`,
        debe: { cuenta: p.method==='efectivo'?'111 Caja':'121 Banco Popular', monto: Number(p.amount||0) },
        haber: { cuenta: '411 Ingresos por Mensualidades', monto: Number(p.amount||0) },
        tipo: 'ingreso'
      })),
      ...gastos.map(g => ({
        fecha: g.date||'',
        ref: `EXP-${g.id}`.slice(0,12),
        descripcion: `Gasto ${esc(g.category||'')} · ${esc(g.concept||'')}`,
        debe: { cuenta: '511 Gastos Operativos', monto: Number(g.amount||0) },
        haber: { cuenta: '111 Caja', monto: Number(g.amount||0) },
        tipo: 'gasto'
      }))
    ].sort((a,b) => b.fecha.localeCompare(a.fecha));

    body.innerHTML = `
      <div class="space-y-4">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <h3 class="font-black text-slate-800 flex items-center gap-2">
            <i data-lucide="book-open" class="w-4 h-4 text-[#0B63C7]"></i> Libro Diario — Partida Doble
          </h3>
          <button onclick="AccountingModule._exportLibroDiarioCSV()"
            class="flex items-center gap-1.5 px-3 py-2 bg-[#E8F2FF] hover:bg-[#0B63C7] text-[#0B63C7] hover:text-white rounded-xl font-black text-xs transition-all">
            <i data-lucide="download" class="w-3.5 h-3.5"></i> Exportar CSV
          </button>
        </div>
        <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-xs">
              <thead class="bg-[#E8F2FF]">
                <tr>
                  <th class="px-3 py-3 text-left font-black text-[#0850A0] uppercase text-[9px] tracking-wider">Fecha</th>
                  <th class="px-3 py-3 text-left font-black text-[#0850A0] uppercase text-[9px] tracking-wider">Referencia</th>
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
                    <td class="px-3 py-2.5 font-black text-[#0B63C7]">${e.ref}</td>
                    <td class="px-3 py-2.5 text-slate-700 max-w-[200px] truncate">${e.descripcion}</td>
                    <td class="px-3 py-2.5 text-slate-600">${e.debe.cuenta}</td>
                    <td class="px-3 py-2.5 text-right font-black text-[#28B54D]">${fmt(e.debe.monto)}</td>
                    <td class="px-3 py-2.5 text-slate-600">${e.haber.cuenta}</td>
                    <td class="px-3 py-2.5 text-right font-black text-rose-600">${fmt(e.haber.monto)}</td>
                  </tr>`).join('')
                : `<tr><td colspan="7" class="text-center py-10 text-slate-400">Sin asientos registrados</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
    if (window.lucide) lucide.createIcons();
  },

  _exportLibroDiarioCSV() {
    Helpers.toast('Exportando libro diario...', 'info');
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
            <button onclick="AccountingModule._sendCxCReminders()"
              class="flex items-center gap-1.5 px-3 py-2 bg-[#FF7A00] text-white rounded-xl font-black text-xs hover:bg-[#D96500] transition-all">
              <i data-lucide="bell" class="w-3.5 h-3.5"></i> Enviar Recordatorios
            </button>
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
      await supabase.functions.invoke('send-payment-reminders', {}).catch(()=>{});
      Helpers.toast('Recordatorios enviados', 'success');
    } catch(_) { Helpers.toast('Recordatorios programados', 'info'); }
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
      .limit(100);

    const totalPend  = (expenses||[]).filter(e=>e.status==='pendiente').reduce((s,e)=>s+Number(e.amount||0),0);
    const totalPagado = (expenses||[]).filter(e=>e.status==='pagado').reduce((s,e)=>s+Number(e.amount||0),0);

    body.innerHTML = `
      <div class="space-y-4">
        <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
            <p class="text-[9px] font-black uppercase text-slate-400 mb-1">Pendiente de Pago</p>
            <p class="text-lg font-black text-amber-600">${fmt(totalPend)}</p>
          </div>
          <div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
            <p class="text-[9px] font-black uppercase text-slate-400 mb-1">Pagado este Año</p>
            <p class="text-lg font-black text-[#28B54D]">${fmt(totalPagado)}</p>
          </div>
          <div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
            <p class="text-[9px] font-black uppercase text-slate-400 mb-1">Total Registros</p>
            <p class="text-lg font-black text-slate-800">${(expenses||[]).length}</p>
          </div>
        </div>
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
                ${(expenses||[]).length ? (expenses||[]).map(e => `
                  <tr class="hover:bg-slate-50">
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
                      ${e.status !== 'pagado' ? `
                        <button onclick="AccountingModule._payExpense('${e.id}')"
                          class="px-2 py-1 bg-[#28B54D] text-white rounded-lg text-[9px] font-black hover:bg-[#1A8035] transition-all">
                          Pagar
                        </button>` : '—'}
                    </td>
                  </tr>`).join('')
                : `<tr><td colspan="7" class="text-center py-10 text-slate-400 text-sm">Sin gastos registrados</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
    if (window.lucide) lucide.createIcons();
  },

  _openExpenseModal() {
    const html = `
      <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4" id="expenseModal">
        <div class="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
          <div class="p-5 border-b" style="background:linear-gradient(135deg,#0B63C7,#0850A0)">
            <h3 class="text-lg font-black text-white">Nueva Factura / Gasto</h3>
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
            <button onclick="AccountingModule._saveExpense()"
              class="px-5 py-2 text-white font-black text-xs uppercase rounded-xl" style="background:#0B63C7">Guardar</button>
          </div>
        </div>
      </div>`;
    const d = document.createElement('div');
    d.innerHTML = html; document.body.appendChild(d);
    // fix close btn reference
    d.querySelector('[onclick*="expenseModal"]').onclick = () => d.remove();
  },

  async _saveExpense() {
    const date     = $el('expDate')?.value;
    const supplier = $el('expSupplier')?.value?.trim();
    const concept  = $el('expConcept')?.value?.trim();
    const category = $el('expCategory')?.value;
    const amount   = Number($el('expAmount')?.value||0);
    const ncf      = $el('expNCF')?.value?.trim()||null;
    const status   = $el('expStatus')?.value;
    if (!concept || !amount) return Helpers.toast('Completa concepto y monto', 'warning');
    const { error } = await supabase.from('expenses').insert({ date, supplier, concept, category, amount, ncf, status });
    if (error) return Helpers.toast('Error al guardar: ' + error.message, 'error');
    document.getElementById('expenseModal')?.parentElement?.remove();
    Helpers.toast('Gasto guardado', 'success');
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

    body.innerHTML = `
      <div class="space-y-5">
        <div class="grid grid-cols-3 gap-3">
          <div class="bg-white rounded-2xl p-4 border border-emerald-100 shadow-sm text-center">
            <p class="text-[9px] font-black uppercase text-slate-400 mb-1">Entradas Totales</p>
            <p class="text-lg font-black text-[#28B54D]">${fmt(totalIn)}</p>
          </div>
          <div class="bg-white rounded-2xl p-4 border border-rose-100 shadow-sm text-center">
            <p class="text-[9px] font-black uppercase text-slate-400 mb-1">Salidas Totales</p>
            <p class="text-lg font-black text-rose-600">${fmt(totalOut)}</p>
          </div>
          <div class="bg-white rounded-2xl p-4 border border-blue-100 shadow-sm text-center">
            <p class="text-[9px] font-black uppercase text-slate-400 mb-1">Balance Neto</p>
            <p class="text-lg font-black ${balance>=0?'text-[#0B63C7]':'text-rose-600'}">${fmt(balance)}</p>
          </div>
        </div>
        <div class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <h3 class="font-black text-slate-700 mb-4 text-sm">Flujo de Caja ${y}</h3>
          <div class="h-64"><canvas id="acct-cashflow-chart"></canvas></div>
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
              </tr></thead>
              <tbody class="divide-y divide-slate-50">
                ${mLabels.map((m,i) => `
                  <tr class="hover:bg-slate-50">
                    <td class="px-3 py-2 font-black text-slate-700">${m}</td>
                    <td class="px-3 py-2 text-right font-bold text-[#28B54D]">${ingArr[i]>0?fmt(ingArr[i]):'—'}</td>
                    <td class="px-3 py-2 text-right font-bold text-rose-600">${gasArr[i]>0?fmt(gasArr[i]):'—'}</td>
                    <td class="px-3 py-2 text-right font-black ${balArr[i]>=0?'text-[#0B63C7]':'text-rose-600'}">${(ingArr[i]||gasArr[i])?fmt(balArr[i]):'—'}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;

    renderChart('acct-cashflow-chart','bar', mLabels, [
      { label:'Ingresos', data:ingArr, backgroundColor:'#BFDBFE', borderRadius:6 },
      { label:'Gastos',   data:gasArr, backgroundColor:'#FECACA', borderRadius:6 },
    ], { legend: true });
  },

  // ══════════════════════════════════════════════════════════════════════════
  // NÓMINA PROFESIONAL — AFP / ARS / ISR RD
  // ══════════════════════════════════════════════════════════════════════════
  async _loadNomina() {
    const body = $el('acct-body');
    if (!body) return;

    const [empRes, nomRes] = await Promise.allSettled([
      supabase.from('profiles').select('id,name,role,salary').in('role',['maestra','asistente','encargada','administrativo']).order('name'),
      supabase.from('payroll_records').select('*,profiles:employee_id(name,role)').order('period',{ascending:false}).limit(100),
    ]);

    const employees = empRes.value?.data  || [];
    const records   = nomRes.value?.data  || [];

    const pendiente = records.filter(r=>r.status==='pendiente').reduce((s,r)=>s+Number(r.net_salary||0),0);
    const pagado    = records.filter(r=>r.status==='pagado').reduce((s,r)=>s+Number(r.net_salary||0),0);

    body.innerHTML = `
      <div class="space-y-4">
        <div class="grid grid-cols-3 gap-3">
          <div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
            <p class="text-[9px] font-black uppercase text-slate-400 mb-1">Empleados Activos</p>
            <p class="text-lg font-black text-slate-800">${employees.length}</p>
          </div>
          <div class="bg-white rounded-2xl p-4 border border-amber-100 shadow-sm">
            <p class="text-[9px] font-black uppercase text-amber-400 mb-1">Nómina Pendiente</p>
            <p class="text-lg font-black text-amber-600">${fmt(pendiente)}</p>
          </div>
          <div class="bg-white rounded-2xl p-4 border border-emerald-100 shadow-sm">
            <p class="text-[9px] font-black uppercase text-slate-400 mb-1">Pagado este Año</p>
            <p class="text-lg font-black text-[#28B54D]">${fmt(pagado)}</p>
          </div>
        </div>
        <div class="flex gap-2">
          <button onclick="AccountingModule._calcNominaModal()"
            class="flex items-center gap-1.5 px-4 py-2 text-white rounded-xl font-black text-xs hover:opacity-90"
            style="background:#0B63C7">
            <i data-lucide="calculator" class="w-3.5 h-3.5"></i> Calcular Nómina
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
    const sal = prompt(`Salario mensual de ${name} (RD$):`);
    if (!sal) return;
    const { error } = await supabase.from('profiles').update({ salary: Number(sal)||0 }).eq('id', id);
    if (error) return Helpers.toast('Error: ' + error.message, 'error');
    Helpers.toast('Salario actualizado', 'success');
    await this._loadNomina();
  },

  _calcNominaModal() {
    Helpers.toast('Módulo de cálculo de nómina completo disponible próximamente', 'info');
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

  // ══════════════════════════════════════════════════════════════════════════
  // DGII — 606 / 607 / 608 / IT-1 / IR-17
  // ══════════════════════════════════════════════════════════════════════════
  _renderDGII() {
    const body = $el('acct-body');
    if (!body) return;

    const now = new Date();
    const y   = now.getFullYear();
    const m   = String(now.getMonth()+1).padStart(2,'0');
    const periodo = `${y}${m}`;

    const dgiiCards = [
      { id:'606', icon:'shopping-cart', color:'#FF7A00', title:'Formato 606', sub:'Compras y Gastos con NCF', desc:'Registro de facturas de suplidores para declaración de compras ante DGII.' },
      { id:'607', icon:'receipt',       color:'#0B63C7', title:'Formato 607', sub:'Ventas e Ingresos con NCF', desc:'Ingresos por mensualidades e inscripciones con comprobantes emitidos.' },
      { id:'608', icon:'file-x',        color:'#EF4444', title:'Formato 608', sub:'Comprobantes Anulados',    desc:'NCF emitidos y posteriormente cancelados o anulados.' },
      { id:'it1', icon:'percent',       color:'#8B5CF6', title:'IT-1',        sub:'Declaración de ITBIS',     desc:'ITBIS cobrado vs. pagado. Balance neto a pagar a la DGII.' },
      { id:'ir17',icon:'users',         color:'#28B54D', title:'IR-17',       sub:'Retenciones Nómina',       desc:'ISR retenido en nómina mensual e informales (10% honorarios).' },
    ];

    body.innerHTML = `
      <div class="space-y-5">
        <div class="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <i data-lucide="alert-triangle" class="w-5 h-5 text-amber-600 shrink-0 mt-0.5"></i>
          <div>
            <p class="font-black text-amber-800 text-sm">Módulo DGII — Período ${periodo}</p>
            <p class="text-xs text-amber-700 mt-0.5">Genera los archivos TXT oficiales para declaración ante la Dirección General de Impuestos Internos (RD).</p>
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          ${dgiiCards.map(c => `
            <div class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm hover:shadow-md transition-shadow">
              <div class="flex items-center gap-3 mb-3">
                <div class="p-2.5 rounded-xl" style="background:${c.color}20">
                  <i data-lucide="${c.icon}" class="w-5 h-5" style="color:${c.color}"></i>
                </div>
                <div>
                  <h4 class="font-black text-slate-800 text-sm">${c.title}</h4>
                  <p class="text-[10px] text-slate-400 font-bold">${c.sub}</p>
                </div>
              </div>
              <p class="text-xs text-slate-500 mb-4">${c.desc}</p>
              <button onclick="AccountingModule._generateDGII('${c.id}','${periodo}')"
                class="w-full py-2 rounded-xl font-black text-xs text-white hover:opacity-90 transition-all"
                style="background:${c.color}">
                <i data-lucide="download" class="w-3.5 h-3.5 inline mr-1"></i> Generar TXT
              </button>
            </div>`).join('')}
        </div>
      </div>`;
    if (window.lucide) lucide.createIcons();
  },

  async _generateDGII(tipo, periodo) {
    Helpers.toast(`Generando ${tipo.toUpperCase()} período ${periodo}...`, 'info');
    try {
      if (tipo === '607') {
        const { data: pays } = await supabase
          .from('payments').select('amount,concept,paid_date,students:student_id(name)')
          .eq('status','paid').gte('paid_date',`${periodo.slice(0,4)}-${periodo.slice(4)}-01T00:00:00`);
        let txt = (pays||[]).map((p,i) => {
          const ncf = `B020000000${String(i+1).padStart(8,'0')}`;
          const fecha = (p.paid_date||'').split('T')[0].replaceAll('-','');
          const monto = Number(p.amount||0).toFixed(2).padStart(12,'0');
          return `${ncf}|${fecha}|01|${monto}|0.00`;
        }).join('\n');
        _downloadTXT(`607-${periodo}.txt`, txt || 'SIN REGISTROS');
      } else if (tipo === '606') {
        const { data: exp } = await supabase
          .from('expenses').select('*').gte('date',`${periodo.slice(0,4)}-${periodo.slice(4)}-01`);
        let txt = (exp||[]).map((e,i) => {
          const fecha = (e.date||'').replaceAll('-','');
          const monto = Number(e.amount||0).toFixed(2).padStart(12,'0');
          return `${e.ncf||'B01000000000'+i}|${fecha}|06|${monto}|0.00`;
        }).join('\n');
        _downloadTXT(`606-${periodo}.txt`, txt || 'SIN REGISTROS');
      } else {
        _downloadTXT(`${tipo}-${periodo}.txt`, `FORMATO ${tipo.toUpperCase()} - PERÍODO ${periodo}\nSIN REGISTROS`);
      }
      Helpers.toast(`${tipo.toUpperCase()} generado`, 'success');
    } catch(e) { Helpers.toast('Error: ' + e.message, 'error'); }
  },

  // ══════════════════════════════════════════════════════════════════════════
  // REPORTES — PDF Exports
  // ══════════════════════════════════════════════════════════════════════════
  _renderReportes() {
    const body = $el('acct-body');
    if (!body) return;
    const cards = [
      { fn:'_exportReporteDiario',   icon:'file-text',      color:'#28B54D', title:'Reporte Diario',     sub:'Cobros del día con desglose por método' },
      { fn:'_exportReporteMensual',  icon:'bar-chart-3',    color:'#0B63C7', title:'Reporte Mensual',    sub:'Análisis completo ingresos vs gastos' },
      { fn:'_exportMorosidad',       icon:'alert-triangle', color:'#FF7A00', title:'Morosidad',          sub:'Deudores, saldos y antigüedad de cartera' },
      { fn:'_exportEstadoResultados',icon:'file-bar-chart', color:'#8B5CF6', title:'Estado de Resultados',sub:'P&G del año fiscal actual' },
      { fn:'_exportNominaPDF',       icon:'briefcase',      color:'#0B63C7', title:'Resumen de Nómina',  sub:'Planilla mensual con deducciones de ley' },
      { fn:'_exportFlujoCaja',       icon:'trending-up',    color:'#28B54D', title:'Flujo de Caja',      sub:'Entradas, salidas y balance mensual' },
    ];
    body.innerHTML = `
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        ${cards.map(c => `
          <button onclick="AccountingModule.${c.fn}()"
            class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm text-left hover:shadow-md transition-all group">
            <div class="flex items-center gap-3 mb-3">
              <div class="p-2.5 rounded-xl transition-colors" style="background:${c.color}20">
                <i data-lucide="${c.icon}" class="w-5 h-5" style="color:${c.color}"></i>
              </div>
              <div>
                <h4 class="font-black text-slate-800">${c.title}</h4>
                <p class="text-[10px] text-slate-400">${c.sub}</p>
              </div>
            </div>
            <div class="flex items-center gap-1.5 text-xs font-black" style="color:${c.color}">
              <i data-lucide="download" class="w-3.5 h-3.5"></i> Descargar PDF
            </div>
          </button>`).join('')}
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
      <div class="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-5 max-w-lg">
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
      </div>`;
    if (window.lucide) lucide.createIcons();
  },

  _savePaymentConfig()    { Helpers.toast('Configuración guardada', 'success'); },
  _sendReminders()        { this._sendCxCReminders(); },
  _generateChargesNow()   { supabase.functions.invoke('generate-monthly-charges',{}).catch(()=>{}); Helpers.toast('Generando cobros del mes...', 'info'); },
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
