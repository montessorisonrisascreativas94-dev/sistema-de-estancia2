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
        supabase.from('payments').select('id,amount,concept,status,method,paid_date,created_at,month_paid').order('created_at',{ascend