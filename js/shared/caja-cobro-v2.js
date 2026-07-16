/**
 * Caja Cobro v2 — Panel Directora y Asistente
 * Flujo: Lista pendientes → Cobrar → Modal compacto responsive → Carrito → Pago → Factura
 */
import { supabase } from './supabase.js';
import { Helpers } from './helpers.js';

const fmt   = n => 'RD$' + Number(n||0).toLocaleString('es-DO',{minimumFractionDigits:2});
const today = () => new Date().toISOString().split('T')[0];
const MONTHS_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const MONTHS_FULL  = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// ── CATÁLOGO (LocalStorage) ───────────────────────────────────────────────────
const CATALOG_KEY = 'caja_extra_concepts_v2';
const DEFAULT_CATALOG = [
  {id:'uniforme',    label:'Uniforme',     amount:3200, icon:'👕'},
  {id:'transporte',  label:'Transporte',   amount:2500, icon:'🚌'},
  {id:'libros',      label:'Libros',       amount:1500, icon:'📚'},
  {id:'materiales',  label:'Materiales',   amount:800,  icon:'🎨'},
  {id:'actividades', label:'Actividades',  amount:500,  icon:'🎉'},
  {id:'excursiones', label:'Excursiones',  amount:1000, icon:'🏕️'},
  {id:'comedor',     label:'Comedor',      amount:1800, icon:'🍽️'},
  {id:'tutorias',    label:'Tutorías',     amount:1200, icon:'📝'},
  {id:'certificados',label:'Certificados', amount:300,  icon:'🏆'},
  {id:'otro',        label:'Otro',         amount:0,    icon:'➕'},
];

function getCatalog() {
  try { return JSON.parse(localStorage.getItem(CATALOG_KEY)) || DEFAULT_CATALOG; }
  catch { return DEFAULT_CATALOG; }
}
function saveCatalog(list) { localStorage.setItem(CATALOG_KEY, JSON.stringify(list)); }

// ── Estado del módulo ─────────────────────────────────────────────────────────
let _cart      = [];
let _student   = null;
let _charges   = [];
let _method    = null;
let _containerId = 'cajaContainer';

export function initCajaCobro(containerId = 'cajaContainer') {
  _containerId = containerId;
  renderCajaMain();
}

// ═══════════════════════════════════════════════════════════════════════════════
// PANTALLA PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════
async function renderCajaMain() {
  const el = document.getElementById(_containerId);
  if (!el) return;
  el.innerHTML = `
  <style>
    .caja-filter-btn{padding:5px 12px;border-radius:9px;border:2px solid #f1f5f9;background:white;font-size:.62rem;font-weight:900;cursor:pointer;transition:all .15s;text-transform:uppercase;letter-spacing:.05em;color:#64748b}
    .caja-filter-btn.on{border-color:#0B63C7;background:#eff6ff;color:#0B63C7}
    @media(max-width:640px){#cajaKPIs{grid-template-columns:1fr 1fr!important}}
  </style>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px" id="cajaKPIs">
    ${[['Cobrado Hoy','kpiCobrado','#28B54D'],['Pendientes','kpiPend','#FF8A00'],['Vencidos','kpiVenc','#EF4444'],['Transferencias','kpiTransf','#8B5CF6']]
      .map(([l,id,c])=>`<div style="background:white;border-radius:14px;padding:12px 14px;border:1px solid #f1f5f9">
        <div style="font-size:.62rem;font-weight:900;color:${c};text-transform:uppercase;letter-spacing:.1em">${l}</div>
        <div style="font-size:1.3rem;font-weight:900;color:#1a2340;margin-top:3px" id="${id}">—</div>
      </div>`).join('')}
  </div>
  <div style="display:flex;align-items:center;gap:8px;background:white;border-radius:13px;border:1px solid #e2e8f0;padding:10px 14px;margin-bottom:12px">
    <i data-lucide="search" style="width:16px;height:16px;color:#94a3b8;flex-shrink:0"></i>
    <input id="cajaSearch" placeholder="Buscar estudiante..." oninput="CajaCobroV2.filterTable(this.value)"
      style="flex:1;border:none;outline:none;font-size:.875rem;font-weight:600;color:#1a2340;background:transparent">
    <button onclick="CajaCobroV2.reload()" style="padding:5px 12px;border-radius:8px;border:none;background:#f1f5f9;color:#64748b;font-size:.72rem;font-weight:900;cursor:pointer">Actualizar</button>
  </div>
  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
    <button class="caja-filter-btn on" onclick="CajaCobroV2.setFilter('all',this)">Todos</button>
    <button class="caja-filter-btn" onclick="CajaCobroV2.setFilter('overdue',this)" style="border-color:#FEE2E2;color:#EF4444">Vencidos</button>
    <button class="caja-filter-btn" onclick="CajaCobroV2.setFilter('pending',this)" style="border-color:#FEF3C7;color:#D97706">Pendientes</button>
    <button class="caja-filter-btn" onclick="CajaCobroV2.setFilter('review',this)" style="border-color:#DBEAFE;color:#2563EB">En Revisión</button>
    <button class="caja-filter-btn" onclick="CajaCobroV2.setFilter('paid',this)" style="border-color:#DCFCE7;color:#16A34A">Al Día</button>
  </div>
  <div style="background:white;border-radius:14px;border:1px solid #e2e8f0;overflow:hidden">
    <div style="padding:10px 16px;border-bottom:1px solid #f8fafc;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
      <span style="font-size:.75rem;font-weight:900;color:#64748b;text-transform:uppercase">Estudiantes: <span id="cajaCount" style="color:#0B63C7">...</span></span>
      <button onclick="CajaCobroV2.openPendingTransfers()" style="padding:5px 12px;border-radius:9px;border:2px solid #8B5CF6;background:#F3E8FF;color:#7C3AED;font-size:.72rem;font-weight:900;cursor:pointer">Transferencias pendientes</button>
    </div>
    <div style="overflow-x:auto">
      <table style="width:100%;min-width:600px;border-collapse:collapse">
        <thead><tr style="background:#f8fafc">
          <th style="padding:9px 14px;text-align:left;font-size:.62rem;font-weight:900;color:#94a3b8;text-transform:uppercase"></th>
          <th style="padding:9px 14px;text-align:left;font-size:.62rem;font-weight:900;color:#94a3b8;text-transform:uppercase">Estudiante</th>
          <th style="padding:9px 14px;text-align:left;font-size:.62rem;font-weight:900;color:#94a3b8;text-transform:uppercase">Curso</th>
          <th style="padding:9px 14px;text-align:left;font-size:.62rem;font-weight:900;color:#94a3b8;text-transform:uppercase">Debe</th>
          <th style="padding:9px 14px;text-align:left;font-size:.62rem;font-weight:900;color:#94a3b8;text-transform:uppercase">Vence</th>
          <th style="padding:9px 14px;text-align:left;font-size:.62rem;font-weight:900;color:#94a3b8;text-transform:uppercase">Acción</th>
        </tr></thead>
        <tbody id="cajaTbody">
          <tr><td colspan="6" style="text-align:center;padding:28px;color:#94a3b8;font-size:.85rem">Cargando...</td></tr>
        </tbody>
      </table>
    </div>
  </div>`;
  if (window.lucide) lucide.createIcons();
  await CajaCobroV2.loadStudents();
}

// ═══════════════════════════════════════════════════════════════════════════════
// MÓDULO EXPORTADO
// ═══════════════════════════════════════════════════════════════════════════════
export const CajaCobroV2 = {
  _all: [],
  _filter: 'all',

  async loadStudents() {
    const todayStr = today();
    const [{ data: pays }, { data: students }, { data: pending }] = await Promise.all([
      supabase.from('payments').select('amount').eq('status','paid').gte('paid_date',todayStr+'T00:00:00').lte('paid_date',todayStr+'T23:59:59').limit(500),
      supabase.from('students').select('id,name,matricula,classroom_id,classrooms:classroom_id(name),p1_name,p1_phone').eq('is_active',true).is('deleted_at',null).order('name').limit(500),
      supabase.from('payments').select('student_id,amount,status,due_date').in('status',['pending','overdue','review']).limit(2000),
    ]);
    const set = (id,v) => { const e=document.getElementById(id); if(e) e.textContent=v; };
    set('kpiCobrado', fmt((pays||[]).reduce((s,p)=>s+Number(p.amount||0),0)));
    set('kpiTransf', String((pending||[]).filter(p=>p.status==='review').length));

    const byS = {};
    (pending||[]).forEach(p=>{
      if (!byS[p.student_id]) byS[p.student_id] = {balance:0,overdue:0,pending:0,review:0,nextDue:null};
      byS[p.student_id].balance += Number(p.amount||0);
      byS[p.student_id][p.status]++;
      if (p.due_date && (!byS[p.student_id].nextDue || p.due_date < byS[p.student_id].nextDue)) byS[p.student_id].nextDue = p.due_date;
    });
    this._all = (students||[]).map(s=>({...s, ...byS[s.id], balance:byS[s.id]?.balance||0,
      status: byS[s.id]?.overdue>0?'overdue':byS[s.id]?.review>0?'review':byS[s.id]?.pending>0?'pending':'paid'
    }));
    set('kpiPend', String(this._all.filter(s=>['pending','review'].includes(s.status)).length));
    set('kpiVenc', String(this._all.filter(s=>s.status==='overdue').length));
    this.renderTable(this._all);
    if (window.lucide) lucide.createIcons();
  },

  renderTable(list) {
    const tbody = document.getElementById('cajaTbody');
    const countEl = document.getElementById('cajaCount');
    if (!tbody) return;
    const filtered = this._filter === 'all' ? list : list.filter(s=>s.status===this._filter);
    if (countEl) countEl.textContent = filtered.length + ' estudiantes';
    if (!filtered.length) { tbody.innerHTML='<tr><td colspan="6" style="text-align:center;padding:28px;color:#94a3b8">Sin resultados</td></tr>'; return; }
    const now = new Date(); now.setHours(0,0,0,0);
    tbody.innerHTML = filtered.map(s=>{
      const dot = s.status==='overdue'?'#EF4444':s.status==='review'?'#8B5CF6':s.status==='pending'?'#F59E0B':'#28B54D';
      const dueLabel = s.nextDue ? new Date(s.nextDue+'T00:00:00').toLocaleDateString('es-ES',{day:'2-digit',month:'short'}) : '—';
      const isToday = s.nextDue===today();
      return `<tr style="border-bottom:1px solid #f8fafc" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
        <td style="padding:10px 14px"><span style="width:9px;height:9px;border-radius:50%;background:${dot};display:inline-block"></span></td>
        <td style="padding:10px 14px"><div style="font-weight:800;color:#1a2340;font-size:.85rem">${Helpers.escapeHTML(s.name)}</div><div style="font-size:.68rem;color:#94a3b8">${s.matricula||''}</div></td>
        <td style="padding:10px 14px;font-size:.78rem;color:#64748b;font-weight:600">${s.classrooms?.name||'—'}</td>
        <td style="padding:10px 14px">${s.balance>0?`<span style="font-weight:900;font-size:.875rem;color:${dot}">${fmt(s.balance)}</span>`:`<span style="color:#94a3b8;font-size:.78rem">Sin deuda</span>`}</td>
        <td style="padding:10px 14px;font-size:.75rem;font-weight:800;color:${isToday?'#EF4444':'#64748b'}">${isToday?'Hoy':dueLabel}</td>
        <td style="padding:10px 14px;text-align:center">
          <button onclick="CajaCobroV2.openCobrarModal(${s.id})" style="padding:6px 14px;border-radius:9px;border:none;background:${s.status!=='paid'?'#0B63C7':'#f1f5f9'};color:${s.status!=='paid'?'white':'#64748b'};font-size:.7rem;font-weight:900;cursor:pointer;text-transform:uppercase">
            ${s.status!=='paid'?'Cobrar':'Ver'}
          </button>
        </td>
      </tr>`;
    }).join('');
  },

  filterTable(q) {
    if (!q) { this.renderTable(this._all); return; }
    const s = q.toLowerCase();
    this.renderTable(this._all.filter(st=>(st.name||'').toLowerCase().includes(s)||(st.matricula||'').toLowerCase().includes(s)||(st.p1_phone||'').includes(s)));
  },

  setFilter(f, btn) {
    this._filter = f;
    document.querySelectorAll('.caja-filter-btn').forEach(b=>b.classList.remove('on'));
    btn?.classList.add('on');
    this.renderTable(this._all);
  },

  reload() { this.loadStudents(); },

  // ── MODAL DE COBRO ───────────────────────────────────────────────────────
  async openCobrarModal(studentId) {
    _cart = []; _method = null; _student = null; _charges = [];

    // Cargar datos
    const [{ data: stu }, { data: charges }, { data: history }, { data: enrollment }] = await Promise.all([
      supabase.from('students').select('id,name,matricula,p1_name,p1_phone,classrooms:classroom_id(name,level),monthly_fee').eq('id',studentId).single(),
      supabase.from('payments').select('id,concept,amount,status,due_date,month_paid').eq('student_id',studentId).in('status',['pending','overdue']).order('due_date').limit(50),
      supabase.from('payments').select('amount,method,paid_date,concept').eq('student_id',studentId).eq('status','paid').order('paid_date',{ascending:false}).limit(5),
      supabase.from('student_enrollments').select('id,payment_plans:payment_plan_id(name,plan_installments(month_number,month_name,amount,type))').eq('student_id',studentId).order('created_at',{ascending:false}).limit(1).maybeSingle(),
    ]);

    _student = stu;
    _charges = charges || [];

    // Mapa de meses pagados — month_paid es YYYY-MM
    const { data: paidMonths } = await supabase.from('payments').select('month_paid').eq('student_id',studentId).eq('status','paid').not('month_paid','is',null).limit(100);
    const paidSet = new Set();
    (paidMonths||[]).forEach(p => {
      if (!p.month_paid) return;
      // Store both YYYY-MM and month number (1-12) for flexible lookup
      paidSet.add(p.month_paid); // "2026-07"
      const parts = String(p.month_paid).split('-');
      if (parts.length >= 2) paidSet.add(parseInt(parts[1], 10)); // 7
      paidSet.add(String(parseInt(parts[1], 10))); // "7"
    });

    // Cuotas del plan — buscar por mes calendario
    const installments = enrollment?.payment_plans?.plan_installments || [];
    // Build installment amount map by month_number
    const instMap = {};
    installments.forEach((x) => { if (x.month_number) instMap[x.month_number] = Number(x.amount||0); });
    // Fallback: use student's monthly fee, or max installment, or 0
    const studentMonthlyFee = Number(stu?.monthly_fee || 0);
    const defaultFee = studentMonthlyFee > 0 
      ? studentMonthlyFee 
      : (installments.length > 0 
        ? Math.max(...installments.map(x => Number(x.amount||0))) 
        : 0);

    // Calcular mora total
    let totalMora = 0;
    function calcMora() {
      let mora = 0;
      _charges.filter(c=>c.status==='overdue').forEach(c=>{
        if (c.due_date) {
          const days = Math.floor((Date.now()-new Date(c.due_date+'T00:00:00').getTime())/86400000);
          if (days>0) mora += (Math.floor(days/7)*500)+((days%7)*50);
        }
      });
      return mora;
    }

    const modalId = 'cajaModal_' + Date.now();
    const overlay = document.createElement('div');
    overlay.id = modalId;
    // Sidebar-aware: offset left on desktop if sidebar is visible
    const sbWidth = document.getElementById('sidebar')?.offsetWidth || 0;
    overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.55);backdrop-filter:blur(6px);z-index:9998;display:flex;align-items:flex-start;justify-content:center;padding:12px;overflow-y:auto;padding-left:${sbWidth > 0 ? sbWidth + 12 : 12}px`;
    overlay.onclick = e => { if(e.target===overlay) overlay.remove(); };

    const nowMonth = new Date().getMonth(); // 0-indexed
    const catalog = getCatalog();

    overlay.innerHTML = `
    <div id="cajaModalInner" style="background:#f8fafc;border-radius:16px;width:100%;max-width:560px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.25);margin:auto;position:relative;display:flex;flex-direction:column">

      <!-- Header compacto -->
      <div style="background:linear-gradient(135deg,#0B63C7,#0850A0);padding:12px 16px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-shrink:0">
        <div style="display:flex;align-items:center;gap:10px;min-width:0">
          <div style="width:36px;height:36px;border-radius:10px;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;color:white;font-weight:900;font-size:1rem;flex-shrink:0">
            ${(stu?.name||'?').charAt(0).toUpperCase()}
          </div>
          <div style="min-width:0">
            <div style="font-weight:900;font-size:.9rem;color:white;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${Helpers.escapeHTML(stu?.name||'—')}</div>
            <div style="font-size:.65rem;color:rgba(255,255,255,.75);font-weight:600">${stu?.classrooms?.name||''} · ${stu?.matricula||''}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
          <div style="text-align:right">
            <div style="font-size:.58rem;color:rgba(255,255,255,.7);font-weight:900;text-transform:uppercase">Pendiente</div>
            <div style="font-size:1rem;font-weight:900;color:white">${fmt(_charges.reduce((s,c)=>s+Number(c.amount||0),0))}</div>
          </div>
          <button onclick="document.getElementById('${modalId}').remove()" style="width:30px;height:30px;border-radius:50%;border:none;background:rgba(255,255,255,.2);color:white;font-size:1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0">✕</button>
        </div>
      </div>

      <!-- Tabs -->
      <div style="display:flex;background:white;border-bottom:2px solid #f1f5f9;flex-shrink:0" id="cajaTabs">
        ${[['meses','📅 Mensualidades'],['conceptos','🏷️ Conceptos'],['pago','💳 Método'],['resumen','🧾 Resumen']].map(([t,l],i)=>`
          <button onclick="CajaCobroV2._showTab('${t}')" id="cajaTab_${t}"
            style="flex:1;padding:8px 4px;border:none;font-size:.62rem;font-weight:900;cursor:pointer;transition:all .12s;border-bottom:2px solid transparent;margin-bottom:-2px;${i===0?'color:#0B63C7;border-bottom-color:#0B63C7;background:white':'color:#94a3b8;background:white'}">
            ${l}
          </button>`).join('')}
      </div>

      <!-- Tab content — scrollable -->
      <div id="cajaTabContent" style="overflow-y:auto;max-height:calc(85vh - 170px);min-height:300px;flex:1">

        <!-- TAB: Mensualidades -->
        <div id="cajaPane_meses" style="padding:14px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
            <span style="font-size:.62rem;font-weight:900;color:#94a3b8;text-transform:uppercase">Año ${new Date().getFullYear()} — clic para seleccionar</span>
            <button onclick="CajaCobroV2._selectAllPending()" style="font-size:.65rem;font-weight:900;color:#0B63C7;border:1px solid #0B63C7;background:transparent;border-radius:6px;padding:4px 10px;cursor:pointer">Todos pendientes</button>
          </div>
          <!-- Grid compacto 4 cols x 3 filas -->
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
            ${MONTHS_FULL.map((m,i)=>{
              const monthNum = i + 1; // 1-12
              // Get amount: try instMap by month_number first, then default
              const amt = instMap[monthNum] !== undefined ? instMap[monthNum] : defaultFee;
              const yearKey = new Date().getFullYear() + '-' + String(monthNum).padStart(2,'0');
              const isPaid    = paidSet.has(yearKey) || paidSet.has(monthNum) || paidSet.has(String(monthNum));
              const isOverdue = !isPaid && i < nowMonth;
              const isCurrent = i === nowMonth;
              const bg    = isPaid ? '#f0fdf4' : isOverdue ? '#fff1f2' : isCurrent ? '#eff6ff' : '#f8fafc';
              const bc    = isPaid ? '#bbf7d0' : isOverdue ? '#fecdd3' : isCurrent ? '#bfdbfe' : '#e2e8f0';
              const tc    = isPaid ? '#16a34a' : isOverdue ? '#ef4444' : isCurrent ? '#2563eb' : '#64748b';
              const ico   = isPaid ? '✓' : isOverdue ? '!' : isCurrent ? '→' : '○';
              return `<button id="month_${i}" onclick="CajaCobroV2.toggleMonth(${i},'${m}',${amt})"
                style="padding:10px 6px;border-radius:10px;border:2px solid ${bc};background:${bg};cursor:${isPaid?'not-allowed':'pointer'};transition:all .12s;text-align:center;display:flex;flex-direction:column;align-items:center;gap:2px"
                ${isPaid?'disabled':''} data-month="${i}" data-label="${m}" data-amount="${amt}" data-paid="${isPaid}">
                <span style="font-size:.58rem;font-weight:900;color:${tc}">${ico}</span>
                <span style="font-size:.75rem;font-weight:800;color:${isPaid?'#16a34a':'#1a2340'}">${MONTHS_SHORT[i]}</span>
                <span style="font-size:.65rem;font-weight:700;color:${tc}">${amt>0?fmt(amt).replace('RD$',''):''}</span>
              </button>`;
            }).join('')}
          </div>
          <div id="monthSelInfo" style="margin-top:12px;font-size:.8rem;font-weight:800;color:#0B63C7;text-align:center"></div>
          <div style="margin-top:14px;display:flex;justify-content:flex-end">
            <button onclick="CajaCobroV2._showTab('conceptos')" style="padding:8px 18px;background:#0B63C7;color:white;border:none;border-radius:10px;font-size:.75rem;font-weight:900;cursor:pointer">Siguiente →</button>
          </div>
        </div>

        <!-- TAB: Conceptos -->
        <div id="cajaPane_conceptos" style="padding:14px;display:none">
          <div style="font-size:.62rem;font-weight:900;color:#94a3b8;text-transform:uppercase;margin-bottom:10px">Conceptos adicionales</div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px">
            ${catalog.slice(0,6).map(c=>`
              <button onclick="CajaCobroV2.addExtraConcept('${c.id}','${Helpers.escapeHTML(c.label)}',${c.amount})"
                id="concept_${c.id}"
                style="padding:12px 8px;border-radius:12px;border:2px solid #e2e8f0;background:white;cursor:pointer;transition:all .12s;text-align:center;display:flex;flex-direction:column;align-items:center;gap:4px">
                <span style="font-size:1.3rem">${c.icon||'🏷️'}</span>
                <span style="font-size:.7rem;font-weight:800;color:#1a2340;line-height:1.2">${Helpers.escapeHTML(c.label)}</span>
                <span style="font-size:.7rem;font-weight:900;color:#0B63C7">${c.amount>0?fmt(c.amount):'Libre'}</span>
              </button>`).join('')}
          </div>
          <div style="background:#f8fafc;border-radius:12px;padding:14px;border:1px solid #e2e8f0">
            <div style="font-size:.62rem;font-weight:900;color:#94a3b8;text-transform:uppercase;margin-bottom:8px">Concepto libre</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <input id="freeConceptLabel" placeholder="Descripción" style="flex:1;padding:10px;border:1px solid #e2e8f0;border-radius:10px;font-size:.75rem;font-weight:600;outline:none;min-width:120px">
              <input id="freeConceptAmt" type="number" placeholder="RD$" style="width:130px;padding:10px;border:1px solid #e2e8f0;border-radius:10px;font-size:.75rem;font-weight:600;outline:none">
              <button onclick="CajaCobroV2.addFreeConcept()" style="padding:10px 16px;border-radius:10px;border:none;background:#0B63C7;color:white;font-size:.75rem;font-weight:900;cursor:pointer;white-space:nowrap">+ Agregar</button>
            </div>
          </div>
          <div style="margin-top:14px;display:flex;justify-content:space-between">
            <button onclick="CajaCobroV2._showTab('meses')" style="padding:8px 18px;background:#f1f5f9;color:#64748b;border:none;border-radius:10px;font-size:.75rem;font-weight:900;cursor:pointer">← Atrás</button>
            <button onclick="CajaCobroV2._showTab('pago')" style="padding:8px 18px;background:#0B63C7;color:white;border:none;border-radius:10px;font-size:.75rem;font-weight:900;cursor:pointer">Siguiente →</button>
          </div>
        </div>

        <!-- TAB: Método de Pago -->
        <div id="cajaPane_pago" style="padding:14px;display:none">
          <div style="font-size:.62rem;font-weight:900;color:#94a3b8;text-transform:uppercase;margin-bottom:10px">Selecciona el método</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
            ${[['efectivo','💵','Efectivo'],['tarjeta','💳','Tarjeta'],['transferencia','🏦','Transferencia'],['cheque','📝','Cheque'],['mixto','🔀','Mixto']].map(([v,ico,l])=>`
              <button onclick="CajaCobroV2.selectMethod('${v}',this)" data-method="${v}"
                style="padding:12px 8px;border-radius:12px;border:2px solid #e2e8f0;background:white;font-size:.75rem;font-weight:800;cursor:pointer;transition:all .12s;display:flex;flex-direction:column;align-items:center;gap:4px;color:#64748b">
                <span style="font-size:1.5rem">${ico}</span>${l}
              </button>`).join('')}
          </div>
          <div id="methodDetail" style="margin-top:6px"></div>
          <div style="margin-top:14px;display:flex;justify-content:space-between">
            <button onclick="CajaCobroV2._showTab('conceptos')" style="padding:8px 18px;background:#f1f5f9;color:#64748b;border:none;border-radius:10px;font-size:.75rem;font-weight:900;cursor:pointer">← Atrás</button>
            <button onclick="CajaCobroV2._showTab('resumen')" style="padding:8px 18px;background:#0B63C7;color:white;border:none;border-radius:10px;font-size:.75rem;font-weight:900;cursor:pointer">Ver Resumen →</button>
          </div>
        </div>

        <!-- TAB: Resumen -->
        <div id="cajaPane_resumen" style="padding:14px;display:none">
          <div style="font-size:.62rem;font-weight:900;color:#94a3b8;text-transform:uppercase;margin-bottom:10px">Resumen del cobro</div>

          <!-- Carrito -->
          <div id="cartItems" style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px;min-height:40px">
            <div style="color:#94a3b8;font-size:.8rem;text-align:center;padding:16px 0">Selecciona meses o conceptos</div>
          </div>

          <!-- Totales -->
          <div style="background:white;border-radius:12px;padding:14px;border:1px solid #e2e8f0;margin-bottom:14px">
            <div style="display:flex;justify-content:space-between;font-size:.8rem;color:#64748b;margin-bottom:4px">
              <span>Subtotal</span><span id="cartSub" style="font-weight:700">RD$0.00</span>
            </div>
            <div id="cartMoraRow" style="display:none;justify-content:space-between;font-size:.8rem;color:#ef4444;margin-bottom:4px">
              <span>⚠ Mora</span><span id="cartMora" style="font-weight:900">+RD$0.00</span>
            </div>
            <div style="border-top:2px solid #f1f5f9;margin:8px 0"></div>
            <div style="display:flex;justify-content:space-between;font-size:1rem;font-weight:900;color:#0B63C7">
              <span>TOTAL</span><span id="cartTotal">RD$0.00</span>
            </div>
          </div>

          <!-- Historial reciente -->
          ${(history||[]).length ? `<div style="margin-bottom:14px">
            <div style="font-size:.62rem;font-weight:900;color:#94a3b8;text-transform:uppercase;margin-bottom:6px">Últimos pagos</div>
            ${(history||[]).slice(0,3).map(h=>`<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f1f5f9;font-size:.75rem">
              <span style="color:#64748b">${h.paid_date?new Date(h.paid_date).toLocaleDateString('es-ES',{day:'2-digit',month:'short'}):'—'}</span>
              <span style="font-weight:800;color:#0B63C7">${fmt(h.amount)}</span>
              <span style="color:#94a3b8;text-transform:capitalize">${h.method||'—'}</span>
            </div>`).join('')}
          </div>` : ''}

          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px">
            <button onclick="CajaCobroV2._showTab('pago')" style="padding:8px 18px;background:#f1f5f9;color:#64748b;border:none;border-radius:10px;font-size:.75rem;font-weight:900;cursor:pointer">← Atrás</button>
            <button id="btnConfirmarCobro" onclick="CajaCobroV2.confirmCobro()" disabled
              style="padding:14px 32px;border-radius:14px;border:none;background:linear-gradient(135deg,#0B63C7,#0850A0);color:white;font-size:.9rem;font-weight:900;cursor:pointer;opacity:.45;pointer-events:none;transition:all .15s">
              ✓ Cobrar y Emitir Factura
            </button>
          </div>
        </div>

      </div>
      <style>
        @media(max-width:600px){
          #cajaModalInner{max-width:98vw!important}
          #cajaTabs button{font-size:.55rem!important;padding:6px 2px!important}
        }
      </style>
    </div>`;

    document.body.appendChild(overlay);
    if (window.lucide) lucide.createIcons();
    this._updateCart();
  },

  _showTab(tab) {
    ['meses','conceptos','pago','resumen'].forEach(t => {
      const pane = document.getElementById('cajaPane_'+t);
      const tabBtn = document.getElementById('cajaTab_'+t);
      if (pane) pane.style.display = t===tab ? 'block' : 'none';
      if (tabBtn) {
        tabBtn.style.color = t===tab ? '#0B63C7' : '#94a3b8';
        tabBtn.style.borderBottomColor = t===tab ? '#0B63C7' : 'transparent';
        tabBtn.style.fontWeight = t===tab ? '900' : '700';
      }
    });
    if (tab === 'resumen') this._updateCart();
  },

  _selectAllPending() {
    const nowMonth = new Date().getMonth();
    MONTHS_FULL.forEach((m,i) => {
      const btn = document.getElementById('month_'+i);
      if (!btn || btn.dataset.paid === 'true' || btn.disabled) return;
      const isOverdue = i < nowMonth;
      const isCurrent = i === nowMonth;
      if ((isOverdue || isCurrent) && !_cart.find(c=>c._monthIdx===i)) {
        _cart.push({ _monthIdx: i, concept: 'Colegiatura '+m, amount: Number(btn.dataset.amount||0), type: 'colegiatura' });
        btn.style.borderColor = '#0B63C7';
        btn.style.background  = '#eff6ff';
      }
    });
    this._updateCart();
    this._updateMonthInfo();
  },

  _updateMonthInfo() {
    const el = document.getElementById('monthSelInfo');
    if (!el) return;
    const months = _cart.filter(c=>c.type==='colegiatura');
    el.textContent = months.length
      ? `${months.length} mes${months.length>1?'es':''} seleccionado${months.length>1?'s':''} — ${fmt(months.reduce((s,c)=>s+c.amount,0))}`
      : '';
  },

  // ── TOGGLE MES (libre — cualquier mes va al carrito) ───────────────────────
  toggleMonth(idx, label, amount) {
    const btn = document.getElementById('month_' + idx);
    if (!btn || btn.dataset.paid === 'true') return;
    const inCart = _cart.findIndex(c => c._monthIdx === idx);
    if (inCart >= 0) {
      _cart.splice(inCart, 1);
      const nowMonth = new Date().getMonth();
      const isOverdue = !btn.dataset.paid && idx < nowMonth;
      const isCurrent = idx === nowMonth;
      const bg = isOverdue ? '#fff1f2' : isCurrent ? '#eff6ff' : '#f8fafc';
      const bc = isOverdue ? '#fecdd3' : isCurrent ? '#bfdbfe' : '#e2e8f0';
      btn.style.borderColor = bc;
      btn.style.background  = bg;
    } else {
      _cart.push({ _monthIdx: idx, concept: 'Colegiatura ' + label, amount: Number(amount), type: 'colegiatura' });
      btn.style.borderColor = '#0B63C7';
      btn.style.background  = '#eff6ff';
    }
    this._updateCart();
    this._updateMonthInfo();
  },

  // ── AGREGAR CONCEPTO DEL CATÁLOGO ─────────────────────────────────────────
  addExtraConcept(id, label, amount) {
    const amt = Number(amount) || 0;
    const inCart = _cart.findIndex(c => c._conceptId === id);
    const btn = document.getElementById('concept_' + id);
    if (inCart >= 0) {
      _cart.splice(inCart, 1);
      if (btn) { btn.style.borderColor='#e2e8f0'; btn.style.background='#white'; }
    } else {
      if (id === 'otro' || amt === 0) {
        // Pedir monto libre
        const a = prompt('Monto para ' + label + ' (RD$):');
        if (!a || isNaN(Number(a))) return;
        _cart.push({ _conceptId: id, concept: label, amount: Number(a), type: 'extra' });
      } else {
        _cart.push({ _conceptId: id, concept: label, amount: amt, type: 'extra' });
      }
      if (btn) { btn.style.borderColor='#FF8A00'; btn.style.background='#fff7ed'; }
    }
    this._updateCart();
  },

  // ── CONCEPTO LIBRE ────────────────────────────────────────────────────────
  addFreeConcept() {
    const lbl = document.getElementById('freeConceptLabel')?.value?.trim();
    const amt = Number(document.getElementById('freeConceptAmt')?.value || 0);
    if (!lbl) { Helpers.toast('Escribe una descripción','warning'); return; }
    if (!amt)  { Helpers.toast('Ingresa un monto','warning'); return; }
    _cart.push({ _conceptId: 'free_'+Date.now(), concept: lbl, amount: amt, type: 'extra' });
    document.getElementById('freeConceptLabel').value = '';
    document.getElementById('freeConceptAmt').value   = '';
    this._updateCart();
  },

  // ── ACTUALIZAR CARRITO ────────────────────────────────────────────────────
  _updateCart() {
    const cartEl   = document.getElementById('cartItems');
    const subEl    = document.getElementById('cartSub');
    const totalEl  = document.getElementById('cartTotal');
    const moraRow  = document.getElementById('cartMoraRow');
    const moraEl   = document.getElementById('cartMora');
    const btn      = document.getElementById('btnConfirmarCobro');
    if (!cartEl) return;

    // Recalcular mora
    function calcMora() {
      let mora = 0;
      _charges.filter(c=>c.status==='overdue').forEach(c=>{
        if (c.due_date) {
          const days = Math.floor((Date.now()-new Date(c.due_date+'T00:00:00').getTime())/86400000);
          if (days>0) mora += (Math.floor(days/7)*500)+((days%7)*50);
        }
      });
      return mora;
    }

    const sub = _cart.reduce((s,c)=>s+c.amount,0);
    // Mora solo si hay items de colegiatura vencida
    const hasColegiatura = _cart.some(c=>c.type==='colegiatura');
    const mora = hasColegiatura ? calcMora() : 0;
    const total = sub + mora;

    if (_cart.length === 0) {
      cartEl.innerHTML = '<div style="color:#94a3b8;font-size:.8rem;text-align:center;padding:16px 0">Selecciona meses o conceptos</div>';
    } else {
      cartEl.innerHTML = _cart.map((c,i)=>`
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border-radius:10px;background:white;border:1px solid #f1f5f9;font-size:.8rem">
          <span style="font-weight:700;color:#1a2340;flex:1;margin-right:8px">${Helpers.escapeHTML(c.concept)}</span>
          <span style="font-weight:900;color:#0B63C7;white-space:nowrap">${fmt(c.amount)}</span>
          <button onclick="CajaCobroV2.removeCartItem(${i})" style="margin-left:8px;border:none;background:transparent;color:#EF4444;cursor:pointer;font-size:1rem;padding:0 4px">✕</button>
        </div>`).join('');
    }

    if (subEl) subEl.textContent = fmt(sub);
    if (moraRow) moraRow.style.display = mora > 0 ? 'flex' : 'none';
    if (moraEl)  moraEl.textContent = '+' + fmt(mora);
    if (totalEl) totalEl.textContent = fmt(total);

    const canPay = _cart.length > 0 && _method;
    if (btn) {
      btn.disabled = !canPay;
      btn.style.opacity = canPay ? '1' : '.45';
      btn.style.pointerEvents = canPay ? 'auto' : 'none';
    }
  },

  removeCartItem(idx) {
    const item = _cart[idx];
    if (!item) return;
    if (item._monthIdx !== undefined) {
      const btn = document.getElementById('month_' + item._monthIdx);
      if (btn) {
        const nowMonth = new Date().getMonth();
        const isOverdue = !btn.dataset.paid && item._monthIdx < nowMonth;
        const isCurrent = item._monthIdx === nowMonth;
        const bg = isOverdue ? '#fff1f2' : isCurrent ? '#eff6ff' : '#f8fafc';
        const bc = isOverdue ? '#fecdd3' : isCurrent ? '#bfdbfe' : '#e2e8f0';
        btn.style.borderColor = bc;
        btn.style.background  = bg;
      }
    }
    if (item._conceptId) {
      const btn = document.getElementById('concept_' + item._conceptId);
      if (btn) { btn.style.borderColor='#e2e8f0'; btn.style.background='#white'; }
    }
    _cart.splice(idx, 1);
    this._updateCart();
    this._updateMonthInfo();
  },

  // ── MÉTODO DE PAGO ────────────────────────────────────────────────────────
  selectMethod(method, btn) {
    _method = method;
    document.querySelectorAll('[data-method]').forEach(b => {
      b.style.borderColor = '#e2e8f0'; b.style.background = 'white'; b.style.color = '#64748b';
    });
    if (btn) { btn.style.borderColor='#0B63C7'; btn.style.background='#eff6ff'; btn.style.color='#0B63C7'; }

    const detail = document.getElementById('methodDetail');
    if (!detail) { this._updateCart(); return; }

    const inp = 'width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;font-size:.8rem;font-weight:600;outline:none;box-sizing:border-box;margin-bottom:6px';
    const lbl = (t) => `<div style="font-size:.62rem;font-weight:900;color:#94a3b8;text-transform:uppercase;margin-bottom:4px;margin-top:8px">${t}</div>`;
    const uploadBtn = (id, label) => `
      <label style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:2px dashed #e2e8f0;border-radius:10px;cursor:pointer;background:#f8fafc;transition:all .12s" onmouseover="this.style.borderColor='#0B63C7'" onmouseout="this.style.borderColor='#e2e8f0'">
        <span style="font-size:.8rem;font-weight:800;color:#64748b">📎 ${label}</span>
        <input type="file" id="${id}" accept="image/*,application/pdf" style="display:none" onchange="CajaCobroV2._previewUpload('${id}','prev_${id}')">
        <span id="prev_${id}" style="font-size:.7rem;color:#0B63C7;font-weight:700;margin-left:auto"></span>
      </label>`;

    const bankOpts = ['Banreservas','Banco Popular Dominicano','Banco BHD','Banco Santa Cruz','Banco Caribe','Banco Vimenca','Bancamérica','Banesco','Scotiabank','Otro']
      .map(b=>`<option value="${b}">${b}</option>`).join('');

    // Common RNC/Empresa section
    const rncSection = `
      ${lbl('¿Requiere factura con RNC?')}
      <button type="button" onclick="document.getElementById('ncfBlock').style.display=document.getElementById('ncfBlock').style.display==='none'?'block':'none'"
        style="font-size:.7rem;font-weight:900;color:#0B63C7;border:1px solid #0B63C7;background:transparent;border-radius:8px;padding:6px 14px;cursor:pointer;margin-bottom:6px">
        + RNC / Factura Fiscal
      </button>
      <div id="ncfBlock" style="display:none">
        ${lbl('RNC de la empresa')}
        <input id="rncEmpresa" placeholder="Ej: 1-31-12345-6" style="${inp}">
        ${lbl('Nombre / Razón Social')}
        <input id="nombreEmpresa" placeholder="Empresa S.R.L." style="${inp}">
      </div>`;

    if (method === 'efectivo') {
      detail.innerHTML = `
        ${lbl('Monto recibido')}
        <input id="cashReceived" type="number" placeholder="RD$" oninput="CajaCobroV2.calcChange()" style="${inp}">
        <div style="font-size:.85rem;font-weight:900;color:#0B63C7;margin-top:4px">Cambio: <span id="cashChange">RD$0.00</span></div>
        ${rncSection}`;

    } else if (method === 'transferencia') {
      detail.innerHTML = `
        ${lbl('Banco de origen')}
        <select id="tfBanco" style="${inp}"><option value="">Seleccionar banco...</option>${bankOpts}</select>
        ${lbl('No. de referencia / confirmación')}
        <input id="tfRef" placeholder="Ej: 00123456789" style="${inp}">
        ${lbl('Comprobante de transferencia *')}
        ${uploadBtn('tfComprobante','Subir comprobante (foto/PDF)')}
        ${rncSection}`;

    } else if (method === 'cheque') {
      detail.innerHTML = `
        ${lbl('Banco emisor')}
        <select id="chqBanco" style="${inp}"><option value="">Seleccionar banco...</option>${bankOpts}</select>
        ${lbl('Número de cheque')}
        <input id="chqNum" placeholder="Ej: 0001234" style="${inp}">
        ${lbl('Fecha de emisión')}
        <input id="chqFecha" type="date" style="${inp}" value="${new Date().toISOString().split('T')[0]}">
        ${lbl('Foto frente del cheque *')}
        ${uploadBtn('chqFrente','Frente del cheque')}
        ${lbl('Foto reverso del cheque *')}
        ${uploadBtn('chqReverso','Reverso del cheque')}
        ${rncSection}`;

    } else if (method === 'tarjeta') {
      detail.innerHTML = `
        <div style="display:flex;gap:12px;margin-bottom:8px">
          ${['Débito','Crédito'].map(t=>`<label style="display:flex;align-items:center;gap:6px;font-size:.8rem;font-weight:700;cursor:pointer">
            <input type="radio" name="cardType" value="${t.toLowerCase()}" style="accent-color:#0B63C7"> ${t}
          </label>`).join('')}
        </div>
        ${lbl('Tipo de tarjeta')}
        <select id="cardBrand" style="${inp}">
          <option value="">Seleccionar...</option>
          <option>Visa</option><option>Mastercard</option><option>Amex</option><option>Otra</option>
        </select>
        ${lbl('Últimos 4 dígitos')}
        <input id="cardLast4" type="number" maxlength="4" placeholder="1234" style="${inp}" oninput="if(this.value.length>4)this.value=this.value.slice(0,4)">
        ${lbl('No. de autorización')}
        <input id="cardAuth" placeholder="Ej: A123456" style="${inp}">
        ${rncSection}`;

    } else if (method === 'mixto') {
      detail.innerHTML = `
        ${lbl('Monto efectivo')}
        <input id="mixEfectivo" type="number" placeholder="RD$" style="${inp}">
        ${lbl('Monto transferencia')}
        <input id="mixTransfer" type="number" placeholder="RD$" style="${inp}">
        ${lbl('Referencia transferencia')}
        <input id="mixRef" placeholder="Referencia" style="${inp}">
        ${rncSection}`;
    } else {
      detail.innerHTML = rncSection;
    }
    this._updateCart();
  },

  _previewUpload(inputId, previewId) {
    const file = document.getElementById(inputId)?.files[0];
    const prev = document.getElementById(previewId);
    if (prev && file) prev.textContent = '✓ ' + file.name.slice(0,20);
  },

  calcChange() {
    const total = _cart.reduce((s,c)=>s+c.amount,0);
    const received = Number(document.getElementById('cashReceived')?.value || 0);
    const changeEl = document.getElementById('cashChange');
    if (changeEl) changeEl.textContent = fmt(Math.max(0, received - total));
  },

  // ── CONFIRMAR COBRO ───────────────────────────────────────────────────────
  async confirmCobro() {
    if (!_cart.length || !_method || !_student) return;
    const btn = document.getElementById('btnConfirmarCobro');
    if (btn) { btn.disabled=true; btn.textContent='Procesando...'; }

    try {
      const total = _cart.reduce((s,c)=>s+c.amount,0);
      const now   = new Date().toISOString();
      const todayStr = today();

      // Get RNC and Empresa
      const rnc = document.getElementById('rncEmpresa')?.value?.trim();
      const empresa = document.getElementById('nombreEmpresa')?.value?.trim();
      let notes = '';
      if (rnc) notes += `RNC:${rnc}|`;
      if (empresa) notes += `Empresa:${empresa}|`;

      // Insertar pagos — month_paid en formato YYYY-MM para consistencia
      const currentYear = new Date().getFullYear();
      const inserts = _cart.map(c => ({
        student_id:  _student.id,
        amount:      c.amount,
        concept:     c.concept,
        method:      _method,
        status:      'paid',
        paid_date:   now,
        month_paid:  c.type==='colegiatura'
          ? currentYear + '-' + String(c._monthIdx+1).padStart(2,'0')
          : null,
        created_at:  now,
        notes: notes || null
      }));

      const { error } = await supabase.from('payments').insert(inserts);
      if (error) throw error;

      // Notificar pago al padre + generar factura
      try {
        const { emitEvent: emit } = await import('./supabase.js');
        const colegiaturas = _cart.filter(c => c.type === 'colegiatura');
        const monthPaid = colegiaturas.length > 0
          ? colegiaturas.map(c => c._monthIdx + 1).join(',')
          : null;

        // Fetch first inserted payment id for invoice
        const { data: newPays } = await supabase
          .from('payments')
          .select('id, amount, month_paid')
          .eq('student_id', _student.id)
          .eq('status', 'paid')
          .gte('paid_date', todayStr + 'T00:00:00')
          .order('created_at', { ascending: false })
          .limit(1);

        if (newPays?.[0]?.id) {
          // Generate invoice and send email
          supabase.functions.invoke('generate-invoice', {
            body: { payment_id: newPays[0].id, send_email: true }
          }).catch(() => {});
        }

        // Notify payment approved to parent
        emit('payment.approved', {
          payment_id:   newPays?.[0]?.id || null,
          student_name: _student.name,
          amount:       'RD$' + total.toLocaleString('es-DO', { minimumFractionDigits: 2 }),
          month:        monthPaid || 'Colegiatura'
        }).catch(() => {});
      } catch (_) {}

      // Cerrar modal y mostrar éxito
      document.querySelectorAll('[id^="cajaModal_"]').forEach(e=>e.remove());
      this._showSuccess(total);
      this.loadStudents();

    } catch (err) {
      Helpers.toast('Error: ' + (err.message||''), 'error');
      if (btn) { btn.disabled=false; btn.textContent='✓ Cobrar y Emitir Factura'; }
    }
  },

  _showSuccess(total) {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
    el.innerHTML = `<div style="background:white;border-radius:20px;padding:32px;max-width:360px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <div style="width:72px;height:72px;background:#f0fdf4;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:2.5rem">✅</div>
      <div style="font-size:1.2rem;font-weight:900;color:#1a2340;margin-bottom:8px">¡Pago registrado!</div>
      <div style="font-size:1.7rem;font-weight:900;color:#0B63C7;margin-bottom:20px">${fmt(total)}</div>
      <div style="display:flex;flex-direction:column;gap:6px;text-align:left;margin-bottom:20px">
        ${['✓ Pago registrado','✓ Caja actualizada','✓ Estado financiero actualizado'].map(t=>`<div style="font-size:.85rem;font-weight:700;color:#16A34A">${t}</div>`).join('')}
      </div>
      <button onclick="this.closest('div[style]').remove()" style="width:100%;padding:14px;border-radius:14px;border:none;background:#0B63C7;color:white;font-size:.95rem;font-weight:900;cursor:pointer">Cerrar</button>
    </div>`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 6000);
  },

  // ── TRANSFERENCIAS PENDIENTES ─────────────────────────────────────────────
  async openPendingTransfers() {
    const { data: transfers } = await supabase.from('payments')
      .select('id,amount,method,concept,students:student_id(name),created_at,receipt_url,bank_name,reference')
      .eq('status','review').order('created_at',{ascending:false}).limit(50);

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);backdrop-filter:blur(6px);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow-y:auto';
    overlay.onclick = e => { if(e.target===overlay) overlay.remove(); };
    overlay.innerHTML = `<div style="background:white;border-radius:18px;width:100%;max-width:580px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.25);margin:auto">
      <div style="padding:16px 20px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between">
        <div style="font-weight:900;color:#1a2340">🏦 Transferencias pendientes (${(transfers||[]).length})</div>
        <button onclick="this.closest('div[style]').remove()" style="border:none;background:#f1f5f9;border-radius:50%;width:32px;height:32px;cursor:pointer;font-size:1rem">✕</button>
      </div>
      <div style="padding:16px;display:flex;flex-direction:column;gap:10px;max-height:75vh;overflow-y:auto">
        ${!(transfers||[]).length ? '<p style="text-align:center;color:#94a3b8;padding:24px">Sin transferencias pendientes</p>' :
          (transfers||[]).map(t=>`<div style="border:1px solid #f1f5f9;border-radius:14px;padding:16px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
              <div>
                <div style="font-weight:900;font-size:.95rem;color:#1a2340">${Helpers.escapeHTML(t.students?.name||'—')}</div>
                <div style="font-size:.75rem;color:#94a3b8">${t.bank_name||'—'} · Ref: ${t.reference||'—'}</div>
              </div>
              <span style="font-weight:900;font-size:1.1rem;color:#0B63C7">${fmt(t.amount)}</span>
            </div>
            ${t.receipt_url?`<div style="margin-bottom:12px"><img src="${t.receipt_url}" style="width:100%;max-height:220px;object-fit:cover;border-radius:10px;cursor:pointer" onclick="window.open('${t.receipt_url}','_blank')"></div>`:''}
            <div style="display:flex;gap:8px">
              <button onclick="CajaCobroV2.approveTransfer(${t.id}, this.closest('div[style]'))" style="flex:1;padding:10px;border-radius:10px;border:none;background:#28B54D;color:white;font-weight:900;cursor:pointer">✓ Aprobar</button>
              <button onclick="CajaCobroV2.rejectTransfer(${t.id}, this.closest('div[style]'))" style="flex:1;padding:10px;border-radius:10px;border:none;background:#ef4444;color:white;font-weight:900;cursor:pointer">✗ Rechazar</button>
            </div>
          </div>`).join('')}
      </div>
    </div>`;
    document.body.appendChild(overlay);
  },

  async approveTransfer(id, cardEl) {
    try {
      await supabase.from('payments').update({ status:'paid', paid_date:new Date().toISOString() }).eq('id',id);
      Helpers.toast('Transferencia aprobada','success');
      if (cardEl) cardEl.remove();
      this.loadStudents();
    } catch(e) { Helpers.toast('Error al aprobar','error'); }
  },

  async rejectTransfer(id, cardEl) {
    try {
      await supabase.from('payments').update({ status:'pending' }).eq('id',id);
      Helpers.toast('Transferencia rechazada','warning');
      if (cardEl) cardEl.remove();
      this.loadStudents();
    } catch(e) { Helpers.toast('Error al rechazar','error'); }
  }
};
