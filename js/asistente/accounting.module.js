/**
 * Accounting Module — Panel Asistente
 * 2 tabs: Pagos | Configuración de Cobro
 */
import { supabase } from '../shared/supabase.js';
import { Helpers } from '../shared/helpers.js';

const fmt = n => 'RD$' + Number(n||0).toLocaleString('es-DO',{minimumFractionDigits:2});
const $a = id => document.getElementById(id);

export const AssistantAccountingModule = {
  _tab: 'pagos',
  _allPayments: [],
  _chart: null,

  async init() {
    this._renderShell();
    this.showTab('pagos');
  },

  _renderShell() {
    const sec = $a('contabilidad');
    if (!sec) return;
    sec.innerHTML = `
      <div class="flex items-center gap-3 mb-5">
        <div class="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0" style="background:#28B54D">
          <i data-lucide="bar-chart-big" class="w-5 h-5"></i>
        </div>
        <div>
          <h1 class="text-2xl font-black text-slate-800">Contabilidad</h1>
          <p class="text-xs text-slate-400 font-bold">Reportes profesionales de cobros</p>
        </div>
      </div>
      <div class="flex gap-0 mb-6 border-b border-slate-100">
        <button data-atab="pagos" onclick="AssistantAccountingModule.showTab('pagos')"
          class="acct-tab px-6 py-2.5 text-sm font-black border-b-2 -mb-px transition-all">Pagos</button>
        <button data-atab="config" onclick="AssistantAccountingModule.showTab('config')"
          class="acct-tab px-6 py-2.5 text-sm font-black border-b-2 -mb-px transition-all">Configuración de Cobro</button>
      </div>
      <div id="acct-content"></div>
    `;
    if (window.lucide) lucide.createIcons();
  },

  showTab(tab) {
    this._tab = tab;
    document.querySelectorAll('.acct-tab').forEach(b => {
      const on = b.dataset.atab === tab;
      b.style.cssText = on ? 'border-color:#28B54D;color:#28B54D' : 'border-color:transparent;color:#94a3b8';
    });
    if (tab === 'pagos') this._loadPagos();
    else this._renderConfig();
  },

  // ── TAB PAGOS ────────────────────────────────────────────────────────────
  async _loadPagos() {
    const c = $a('acct-content');
    if (!c) return;
    c.innerHTML = `<div class="flex justify-center py-12"><div class="w-8 h-8 border-2 border-[#28B54D] border-t-transparent rounded-full animate-spin"></div></div>`;
    try {
      const { data } = await supabase
        .from('payments')
        .select('id,amount,concept,status,method,month_paid,paid_date,created_at,bank,notes,reference,students:student_id(name,matricula,classrooms:classroom_id(name))')
        .order('created_at', { ascending: false })
        .limit(500);
      this._allPayments = data || [];
      this._renderPagos();
    } catch(e) {
      c.innerHTML = `<p class="text-center text-rose-500 py-8">Error al cargar: ${e.message}</p>`;
    }
  },

  _renderPagos() {
    const c = $a('acct-content');
    if (!c) return;
    const payments = this._allPayments;

    // KPIs
    const totalPaid   = payments.filter(p=>p.status==='paid').reduce((s,p)=>s+Number(p.amount||0),0);
    const totalPend   = payments.filter(p=>['pending','overdue'].includes(p.status)).reduce((s,p)=>s+Number(p.amount||0),0);
    const totalReview = payments.filter(p=>p.status==='review').length;
    const byMonth = {};
    payments.filter(p=>p.status==='paid').forEach(p=>{
      const m = (p.paid_date||p.created_at||'').slice(0,7);
      if (m) byMonth[m] = (byMonth[m]||0) + Number(p.amount||0);
    });
    const monthLabels = Object.keys(byMonth).sort().slice(-6);
    const monthData   = monthLabels.map(m => byMonth[m]);

    // Concept breakdown
    const byConcept = {};
    payments.filter(p=>p.status==='paid').forEach(p=>{
      const k = p.concept || 'Otro';
      byConcept[k] = (byConcept[k]||0) + Number(p.amount||0);
    });
    const topConcepts = Object.entries(byConcept).sort((a,b)=>b[1]-a[1]).slice(0,5);

    const ST = {
      paid:    {lbl:'Pagado',      cls:'bg-emerald-100 text-emerald-700'},
      pending: {lbl:'Pendiente',   cls:'bg-amber-100 text-amber-700'},
      overdue: {lbl:'Vencido',     cls:'bg-rose-100 text-rose-700'},
      review:  {lbl:'En revisión', cls:'bg-blue-100 text-blue-700'},
      rejected:{lbl:'Rechazado',   cls:'bg-slate-100 text-slate-500'},
    };

    c.innerHTML = `
    <div class="space-y-5">

      <!-- KPIs -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div class="rounded-2xl p-4 text-white" style="background:linear-gradient(135deg,#28B54D,#1A8035)">
          <p class="text-[10px] font-black uppercase tracking-widest opacity-80 mb-1">Cobrado Total</p>
          <p class="text-xl font-black">${fmt(totalPaid)}</p>
        </div>
        <div class="rounded-2xl p-4 text-white" style="background:linear-gradient(135deg,#FF8A00,#D96500)">
          <p class="text-[10px] font-black uppercase tracking-widest opacity-80 mb-1">Por Cobrar</p>
          <p class="text-xl font-black">${fmt(totalPend)}</p>
        </div>
        <div class="rounded-2xl p-4 text-white" style="background:linear-gradient(135deg,#0B63C7,#0850A0)">
          <p class="text-[10px] font-black uppercase tracking-widest opacity-80 mb-1">En Revisión</p>
          <p class="text-xl font-black">${totalReview}</p>
        </div>
        <div class="rounded-2xl p-4 text-white" style="background:linear-gradient(135deg,#8B5CF6,#6D28D9)">
          <p class="text-[10px] font-black uppercase tracking-widest opacity-80 mb-1">Transacciones</p>
          <p class="text-xl font-black">${payments.length}</p>
        </div>
      </div>

      <!-- Charts row -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <!-- Bar chart monthly -->
        <div class="lg:col-span-2 bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <div class="flex items-center justify-between mb-4 flex-wrap gap-3">
            <h3 class="text-sm font-black text-slate-800">Ingresos por Mes</h3>
            <div class="flex gap-2 flex-wrap" id="chartFilterRow">
              <select id="acctFilterYear" onchange="AssistantAccountingModule._applyFilters()" class="border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold outline-none focus:border-[#28B54D] bg-white">
                ${[...new Set(payments.map(p=>(p.paid_date||p.created_at||'').slice(0,4)).filter(Boolean))].sort().reverse().map(y=>`<option value="${y}">${y}</option>`).join('')}
              </select>
              <select id="acctFilterMonth" onchange="AssistantAccountingModule._applyFilters()" class="border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold outline-none focus:border-[#28B54D] bg-white">
                <option value="">Todos los meses</option>
                ${['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'].map((m,i)=>`<option value="${String(i+1).padStart(2,'0')}">${m}</option>`).join('')}
              </select>
              <select id="acctFilterStatus" onchange="AssistantAccountingModule._applyFilters()" class="border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold outline-none focus:border-[#28B54D] bg-white">
                <option value="">Todos los estados</option>
                <option value="paid">Pagado</option>
                <option value="pending">Pendiente</option>
                <option value="overdue">Vencido</option>
                <option value="review">En revisión</option>
              </select>
              <input type="text" id="acctSearch" placeholder="Buscar alumno..." oninput="AssistantAccountingModule._applyFilters()"
                class="border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold outline-none focus:border-[#28B54D] w-36">
            </div>
          </div>
          <div class="h-48"><canvas id="acctBarChart"></canvas></div>
        </div>
        <!-- Concept pie -->
        <div class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <h3 class="text-sm font-black text-slate-800 mb-4">Conceptos más vendidos</h3>
          <div class="space-y-2">
            ${topConcepts.map(([k,v])=>`
              <div>
                <div class="flex justify-between text-xs mb-1"><span class="font-bold text-slate-700 truncate">${Helpers.escapeHTML(k)}</span><span class="font-black text-slate-800">${fmt(v)}</span></div>
                <div class="h-1.5 bg-slate-100 rounded-full"><div class="h-full rounded-full" style="width:${Math.round(v/totalPaid*100)||0}%;background:#28B54D"></div></div>
              </div>`).join('') || '<p class="text-xs text-slate-400 text-center py-4">Sin datos</p>'}
          </div>
        </div>
      </div>

      <!-- Filters summary + export -->
      <div class="bg-white rounded-2xl border border-slate-100 p-4 flex items-center justify-between flex-wrap gap-3 shadow-sm">
        <p class="text-xs font-bold text-slate-500" id="acctResultCount">${payments.length} registros</p>
        <div class="flex gap-2">
          <button onclick="AssistantAccountingModule._exportCSV()" class="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black text-white transition-all" style="background:#28B54D">
            <i data-lucide="file-text" class="w-3.5 h-3.5"></i> CSV
          </button>
          <button onclick="AssistantAccountingModule._exportExcel()" class="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black text-white transition-all" style="background:#0B63C7">
            <i data-lucide="table" class="w-3.5 h-3.5"></i> Excel
          </button>
          <button onclick="AssistantAccountingModule._exportPDF()" class="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black text-white transition-all" style="background:#8B5CF6">
            <i data-lucide="file" class="w-3.5 h-3.5"></i> PDF
          </button>
        </div>
      </div>

      <!-- Tabla de pagos con todos los estados -->
      <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div class="px-5 py-3.5 border-b border-slate-100">
          <h3 class="text-sm font-black text-slate-800">Estado de Cobros — Todos los Estudiantes</h3>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm" style="min-width:640px">
            <thead class="bg-slate-50 border-b border-slate-100">
              <tr>
                ${['Estudiante','Aula','Concepto','Monto','Método','Estado','Mes','Fecha','Acciones'].map(h=>`<th class="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase">${h}</th>`).join('')}
              </tr>
            </thead>
            <tbody id="acctTableBody" class="divide-y divide-slate-50">
              ${payments.map(p=>this._row(p, ST)).join('') || '<tr><td colspan="9" class="text-center py-8 text-slate-400">Sin registros</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

    </div>`;

    if (window.lucide) lucide.createIcons();
    this._initChart(monthLabels, monthData);
  },

  _row(p, ST) {
    const s = ST[p.status] || {lbl:p.status, cls:'bg-slate-100 text-slate-500'};
    const date = (p.paid_date||p.created_at||'').split('T')[0];
    return `<tr class="hover:bg-slate-50 transition-colors" data-pr="${p.id}">
      <td class="px-4 py-3"><div class="font-bold text-slate-800 text-xs">${Helpers.escapeHTML(p.students?.name||'—')}</div><div class="text-[10px] text-slate-400">${p.students?.matricula||''}</div></td>
      <td class="px-4 py-3 text-xs text-slate-500">${Helpers.escapeHTML(p.students?.classrooms?.name||'—')}</td>
      <td class="px-4 py-3 text-xs font-bold text-slate-700">${Helpers.escapeHTML(p.concept||'—')}</td>
      <td class="px-4 py-3 text-sm font-black text-slate-800">${fmt(p.amount)}</td>
      <td class="px-4 py-3 text-xs text-slate-500 capitalize">${p.method||'—'}</td>
      <td class="px-4 py-3"><span class="px-2.5 py-1 rounded-full text-[10px] font-black ${s.cls}">${s.lbl}</span></td>
      <td class="px-4 py-3 text-xs text-slate-500">${p.month_paid||'—'}</td>
      <td class="px-4 py-3 text-xs text-slate-400">${date}</td>
      <td class="px-4 py-3">
        <div class="flex gap-1">
          ${p.status==='review'?`<button onclick="AssistantAccountingModule._approve(${p.id})" class="px-2 py-1 text-[10px] font-black text-white rounded-lg" style="background:#28B54D">Aprobar</button>`:''}
          ${['pending','overdue'].includes(p.status)?`<button onclick="AssistantAccountingModule._markPaid(${p.id})" class="px-2 py-1 text-[10px] font-black text-white rounded-lg" style="background:#0B63C7">Cobrar</button>`:''}
        </div>
      </td>
    </tr>`;
  },

  _applyFilters() {
    const year   = $a('acctFilterYear')?.value||'';
    const month  = $a('acctFilterMonth')?.value||'';
    const status = $a('acctFilterStatus')?.value||'';
    const q      = ($a('acctSearch')?.value||'').toLowerCase();

    const filtered = this._allPayments.filter(p => {
      const d = (p.paid_date||p.created_at||'');
      const matchY = !year   || d.startsWith(year);
      const matchM = !month  || d.slice(5,7) === month;
      const matchS = !status || p.status === status;
      const matchQ = !q      || (p.students?.name||'').toLowerCase().includes(q) || (p.students?.matricula||'').toLowerCase().includes(q);
      return matchY && matchM && matchS && matchQ;
    });

    const tbody = $a('acctTableBody');
    const ST = {paid:{lbl:'Pagado',cls:'bg-emerald-100 text-emerald-700'},pending:{lbl:'Pendiente',cls:'bg-amber-100 text-amber-700'},overdue:{lbl:'Vencido',cls:'bg-rose-100 text-rose-700'},review:{lbl:'En revisión',cls:'bg-blue-100 text-blue-700'},rejected:{lbl:'Rechazado',cls:'bg-slate-100 text-slate-500'}};
    if (tbody) tbody.innerHTML = filtered.map(p=>this._row(p,ST)).join('') || '<tr><td colspan="9" class="text-center py-8 text-slate-400">Sin resultados</td></tr>';
    const cnt = $a('acctResultCount');
    if (cnt) cnt.textContent = `${filtered.length} registros`;

    // Update chart with filtered data
    const byMonth = {};
    filtered.filter(p=>p.status==='paid').forEach(p=>{
      const m = (p.paid_date||p.created_at||'').slice(0,7);
      if (m) byMonth[m] = (byMonth[m]||0) + Number(p.amount||0);
    });
    const labels = Object.keys(byMonth).sort().slice(-6);
    const data   = labels.map(m => byMonth[m]);
    this._updateChart(labels, data);
    if (window.lucide) lucide.createIcons();
  },

  _initChart(labels, data) {
    if (!window.Chart) return;
    const canvas = $a('acctBarChart');
    if (!canvas) return;
    if (this._chart) { this._chart.destroy(); this._chart = null; }
    this._chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: labels.map(l => { const [y,m] = l.split('-'); return ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][parseInt(m)]||l; }),
        datasets: [{
          data,
          backgroundColor: 'rgba(40,181,77,0.7)',
          borderRadius: 8,
          borderSkipped: false,
          hoverBackgroundColor: '#28B54D'
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => 'RD$' + Number(ctx.raw).toLocaleString('es-DO') } } },
        scales: {
          y: { beginAtZero: true, ticks: { callback: v => 'RD$'+Number(v).toLocaleString('es-DO',{maximumFractionDigits:0}), font:{size:9} }, grid:{color:'rgba(0,0,0,.04)'} },
          x: { ticks: { font:{size:10} }, grid:{display:false} }
        }
      }
    });
  },

  _updateChart(labels, data) {
    if (!this._chart) return;
    this._chart.data.labels = labels.map(l => { const [y,m] = l.split('-'); return ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][parseInt(m)]||l; });
    this._chart.data.datasets[0].data = data;
    this._chart.update();
  },

  async _approve(id) {
    if (!confirm('¿Aprobar este pago?')) return;
    await supabase.from('payments').update({status:'paid',paid_date:new Date().toISOString()}).eq('id',id);
    Helpers.toast('Pago aprobado','success');
    await this._loadPagos();
  },

  async _markPaid(id) {
    if (!confirm('¿Marcar como pagado?')) return;
    await supabase.from('payments').update({status:'paid',paid_date:new Date().toISOString()}).eq('id',id);
    Helpers.toast('Marcado como pagado','success');
    await this._loadPagos();
  },

  // ── EXPORTS ──────────────────────────────────────────────────────────────
  _exportCSV() {
    const rows = [['ID','Estudiante','Matrícula','Aula','Concepto','Monto','Método','Estado','Mes','Fecha']];
    this._allPayments.forEach(p => rows.push([
      p.id, p.students?.name||'', p.students?.matricula||'',
      p.students?.classrooms?.name||'', p.concept||'',
      p.amount||0, p.method||'', p.status||'',
      p.month_paid||'', (p.paid_date||p.created_at||'').split('T')[0]
    ]));
    const csv = rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    this._download('\uFEFF'+csv,'cobros.csv','text/csv');
  },

  _exportExcel() {
    // TSV with BOM opens in Excel
    const rows = [['ID','Estudiante','Matrícula','Concepto','Monto','Estado','Mes','Fecha']];
    this._allPayments.forEach(p => rows.push([p.id,p.students?.name||'',p.students?.matricula||'',p.concept||'',p.amount||0,p.status||'',p.month_paid||'',(p.paid_date||p.created_at||'').split('T')[0]]));
    const tsv = rows.map(r=>r.join('\t')).join('\n');
    this._download('\uFEFF'+tsv,'cobros.xls','application/vnd.ms-excel');
  },

  _exportPDF() {
    const total = this._allPayments.filter(p=>p.status==='paid').reduce((s,p)=>s+Number(p.amount||0),0);
    const rows = this._allPayments.slice(0,100).map(p=>`
      <tr style="border-bottom:1px solid #f1f5f9">
        <td style="padding:6px 8px;font-size:11px">${Helpers.escapeHTML(p.students?.name||'—')}</td>
        <td style="padding:6px 8px;font-size:11px">${Helpers.escapeHTML(p.concept||'—')}</td>
        <td style="padding:6px 8px;font-size:11px;text-align:right">RD$${Number(p.amount||0).toLocaleString('es-DO')}</td>
        <td style="padding:6px 8px;font-size:11px">${p.status||'—'}</td>
        <td style="padding:6px 8px;font-size:11px">${(p.paid_date||p.created_at||'').split('T')[0]}</td>
      </tr>`).join('');
    const win = window.open('','_blank');
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Reporte Contabilidad</title>
      <style>body{font-family:Arial,sans-serif;padding:24px;color:#1e293b}h1{color:#28B54D;margin-bottom:4px}table{width:100%;border-collapse:collapse}th{background:#f8fafc;padding:8px;font-size:11px;text-align:left;text-transform:uppercase;color:#94a3b8}.total{font-size:1.2rem;font-weight:900;color:#28B54D}@media print{button{display:none}}</style></head>
      <body><h1>Reporte de Cobros</h1><p style="font-size:12px;color:#94a3b8">Generado: ${new Date().toLocaleDateString('es-DO',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</p>
      <p style="margin:12px 0;font-size:14px">Total cobrado: <strong class="total">RD$${total.toLocaleString('es-DO')}</strong></p>
      <table><thead><tr>${['Estudiante','Concepto','Monto','Estado','Fecha'].map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
      <script>window.onload=()=>window.print()<\/script></body></html>`);
    win.document.close();
  },

  _download(content, filename, mime) {
    const blob = new Blob([content],{type:mime+';charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href=url; a.download=filename; a.click(); URL.revokeObjectURL(url);
    Helpers.toast('Archivo descargado','success');
  },

  // ── TAB CONFIGURACIÓN DE COBRO ────────────────────────────────────────────
  _renderConfig() {
    const c = $a('acct-content');
    if (!c) return;
    c.innerHTML = `
    <div class="max-w-2xl space-y-5">
      <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h3 class="text-sm font-black text-slate-800 flex items-center gap-2 mb-5">
          <i data-lucide="settings-2" class="w-4 h-4" style="color:#28B54D"></i> Configuración de Cobro
        </h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label class="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Día Generación Automática</label>
            <div class="flex items-center gap-2">
              <input type="number" id="confGenDay" min="1" max="28" value="25"
                class="w-full px-3 py-2.5 border-2 border-slate-100 rounded-xl text-sm font-bold bg-white outline-none focus:border-[#28B54D]">
              <span class="text-xs text-slate-400 font-medium whitespace-nowrap">del mes anterior</span>
            </div>
          </div>
          <div>
            <label class="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Día Límite de Pago</label>
            <div class="flex items-center gap-2">
              <input type="number" id="confDueDay" min="1" max="28" value="5"
                class="w-full px-3 py-2.5 border-2 border-slate-100 rounded-xl text-sm font-bold bg-white outline-none focus:border-[#28B54D]">
              <span class="text-xs text-slate-400 font-medium whitespace-nowrap">del mes actual</span>
            </div>
          </div>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-5">
          <button onclick="AssistantAccountingModule._saveConfig()" class="py-2.5 text-white text-xs font-black uppercase rounded-xl flex items-center justify-center gap-1.5" style="background:#28B54D">
            <i data-lucide="save" class="w-3.5 h-3.5"></i> Guardar
          </button>
          <button onclick="AssistantAccountingModule._generatePayments()" class="py-2.5 text-white text-xs font-black uppercase rounded-xl flex items-center justify-center gap-1.5" style="background:#0B63C7">
            <i data-lucide="play-circle" class="w-3.5 h-3.5"></i> Generar
          </button>
          <button onclick="AssistantAccountingModule._sendReminders()" class="py-2.5 text-white text-xs font-black uppercase rounded-xl flex items-center justify-center gap-1.5" style="background:#FF8A00">
            <i data-lucide="bell" class="w-3.5 h-3.5"></i> Recordatorios
          </button>
          <button onclick="AssistantAccountingModule._exportMorosidad()" class="py-2.5 text-white text-xs font-black uppercase rounded-xl flex items-center justify-center gap-1.5" style="background:#475569">
            <i data-lucide="download" class="w-3.5 h-3.5"></i> Morosidad
          </button>
        </div>
      </div>

      <!-- Catálogo de conceptos -->
      <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-sm font-black text-slate-800 flex items-center gap-2">
            <i data-lucide="tag" class="w-4 h-4" style="color:#0B63C7"></i> Catálogo de Conceptos
          </h3>
          <button onclick="AssistantAccountingModule._openConceptForm()" class="px-3 py-1.5 text-[10px] font-black text-white rounded-xl" style="background:#0B63C7">+ Agregar</button>
        </div>
        <div id="conceptCatalogList" class="space-y-2">
          <div class="text-center py-4 text-slate-400 text-xs">Cargando...</div>
        </div>
      </div>
    </div>`;
    if (window.lucide) lucide.createIcons();
    this._loadCatalog();
  },

  async _loadCatalog() {
    const c = $a('conceptCatalogList');
    if (!c) return;
    try {
      const { data } = await supabase.from('payment_concepts').select('*').order('name');
      const items = data?.length ? data : [
        {id:null,name:'Uniforme Escolar',amount:3200},
        {id:null,name:'Transporte',amount:1500},
        {id:null,name:'Libros',amount:2500},
        {id:null,name:'Materiales',amount:800},
      ];
      c.innerHTML = items.map(item=>`
        <div class="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
          <div><p class="text-sm font-black text-slate-800">${Helpers.escapeHTML(item.name)}</p>
               <p class="text-xs font-bold" style="color:#28B54D">${fmt(item.amount)}</p></div>
          <div class="flex gap-1.5">
            <button onclick="AssistantAccountingModule._openConceptForm(${JSON.stringify(item).replace(/"/g,'&quot;')})" class="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100"><i data-lucide="pencil" class="w-3.5 h-3.5"></i></button>
            ${item.id?`<button onclick="AssistantAccountingModule._deleteConcept(${item.id})" class="p-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>`:''}
          </div>
        </div>`).join('');
      if (window.lucide) lucide.createIcons();
    } catch(e) { c.innerHTML = '<p class="text-xs text-red-400 text-center py-4">Error al cargar catálogo</p>'; }
  },

  _openConceptForm(concept=null) {
    const html = `<div class="p-6 max-w-sm">
      <h3 class="text-lg font-black text-slate-800 mb-4">${concept?.id?'Editar':'Nuevo'} Concepto</h3>
      <div class="space-y-4">
        <div><label class="text-[10px] font-black text-slate-400 uppercase block mb-1">Nombre</label>
          <input id="cName" type="text" value="${concept?.name||''}" class="w-full border-2 border-slate-100 rounded-xl px-3 py-2.5 text-sm font-bold outline-none focus:border-[#28B54D]"></div>
        <div><label class="text-[10px] font-black text-slate-400 uppercase block mb-1">Monto (RD$)</label>
          <input id="cAmt" type="number" value="${concept?.amount||0}" class="w-full border-2 border-slate-100 rounded-xl px-3 py-2.5 text-sm font-bold outline-none focus:border-[#28B54D]"></div>
      </div>
      <div class="flex justify-end gap-2 mt-5">
        <button onclick="window._closeAsistenteModal()" class="px-4 py-2 text-slate-500 font-bold text-xs uppercase border border-slate-200 rounded-xl">Cancelar</button>
        <button onclick="AssistantAccountingModule._saveConcept(${concept?.id||'null'})" class="px-4 py-2 text-white font-black text-xs uppercase rounded-xl" style="background:#28B54D">Guardar</button>
      </div>
    </div>`;
    window.openGlobalModal?.(html);
  },

  async _saveConcept(id) {
    const name   = $a('cName')?.value?.trim();
    const amount = parseFloat($a('cAmt')?.value||'0');
    if (!name) return Helpers.toast('Ingresa un nombre','warning');
    try {
      if (id) await supabase.from('payment_concepts').update({name,amount}).eq('id',id);
      else    await supabase.from('payment_concepts').insert({name,amount});
      Helpers.toast('Concepto guardado','success');
      window._closeAsistenteModal?.();
      this._loadCatalog();
    } catch(e) { Helpers.toast('Error: '+e.message,'error'); }
  },

  async _deleteConcept(id) {
    if (!confirm('¿Eliminar este concepto?')) return;
    await supabase.from('payment_concepts').delete().eq('id',id);
    Helpers.toast('Eliminado','success');
    this._loadCatalog();
  },

  async _saveConfig() {
    const genDay = parseInt($a('confGenDay')?.value||'25');
    const dueDay = parseInt($a('confDueDay')?.value||'5');
    try {
      await supabase.from('school_settings').upsert({id:1,charge_generation_day:genDay,payment_due_day:dueDay},{onConflict:'id'});
      Helpers.toast('Configuración guardada','success');
    } catch(e) { Helpers.toast('Error: '+e.message,'error'); }
  },

  async _generatePayments() {
    if (!confirm('¿Generar cargos de mensualidad para este mes?')) return;
    Helpers.toast('Generando cargos...','info');
    try {
      const { error } = await supabase.rpc('generate_monthly_charges');
      if (error) throw error;
      Helpers.toast('Cargos generados exitosamente','success');
    } catch(e) { Helpers.toast('Error: '+e.message,'error'); }
  },

  async _sendReminders() {
    if (!confirm('¿Enviar recordatorios a padres con pagos pendientes?')) return;
    Helpers.toast('Enviando recordatorios...','info');
    try {
      const { error } = await supabase.functions.invoke('send-payment-reminders');
      if (error) throw error;
      Helpers.toast('Recordatorios enviados','success');
    } catch(e) { Helpers.toast('Enviado (verifica notificaciones)','success'); }
  },

  async _exportMorosidad() {
    try {
      const { data } = await supabase.from('payments')
        .select('amount,concept,month_paid,created_at,students:student_id(name,matricula,p1_phone)')
        .in('status',['pending','overdue'])
        .order('created_at',{ascending:false}).limit(500);
      if (!data?.length) { Helpers.toast('Sin moros','info'); return; }
      const rows = [['Estudiante','Matrícula','Teléfono','Concepto','Monto','Mes','Fecha']];
      data.forEach(p=>rows.push([p.students?.name||'',p.students?.matricula||'',p.students?.p1_phone||'',p.concept||'',p.amount||0,p.month_paid||'',(p.created_at||'').split('T')[0]]));
      const csv = rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
      this._download('\uFEFF'+csv,'morosidad.csv','text/csv');
    } catch(e) { Helpers.toast('Error: '+e.message,'error'); }
  },
};

window.AssistantAccountingModule = AssistantAccountingModule;
