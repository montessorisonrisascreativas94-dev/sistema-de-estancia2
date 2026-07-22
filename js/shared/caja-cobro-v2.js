/**
 * Caja Cobro v2 — Módulo único de caja para Directora y Asistente
 * Flujo: Lista pendientes → Cobrar → Modal por tabs → Carrito → Pago → Factura
 *
 * Correcciones vs. versión anterior:
 *  - Mora incluida en el total y en el cálculo de cambio
 *  - Descuento por porcentaje (opcional)
 *  - Catálogo unificado desde caja-utils.js
 *  - payment_concepts se carga de Supabase con fallback al catálogo estático
 */
import { supabase } from './supabase.js';
import { Helpers } from './helpers.js';
import { InvoiceModule } from './invoice.js';
import {
  fmt, fmtN, today, MONTHS_SHORT, MONTHS_FULL,
  DEFAULT_CATALOG, calcMora, calcDiscount, calcTotal,
  INP, LBL, bankSelectOpts, uploadBtn, rncSection
} from './caja-utils.js';

// ── CATÁLOGO (localStorage como caché del catálogo del servidor) ────────────
const CATALOG_KEY = 'caja_extra_concepts_v2';

function getCatalog() {
  try { return JSON.parse(localStorage.getItem(CATALOG_KEY)) || DEFAULT_CATALOG; }
  catch { return DEFAULT_CATALOG; }
}
function saveCatalog(list) { localStorage.setItem(CATALOG_KEY, JSON.stringify(list)); }

// ── Estado del módulo ──────────────────────────────────────────────────────
let _cart       = [];
let _student    = null;
let _charges    = [];
let _method     = null;
let _containerId = 'cajaContainer';
let _discountPct = 0;
let _dbConcepts  = []; // Concepts from payment_concepts table

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
  <!-- Caja Header Banner -->
  <div style="background:linear-gradient(135deg,#0B63C7 0%,#0850A0 50%,#1D4ED8 100%);border-radius:16px;padding:18px 22px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 4px 20px rgba(11,99,199,0.25)">
    <div style="display:flex;align-items:center;gap:14px">
      <div style="width:44px;height:44px;border-radius:12px;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center">
        <i data-lucide="landmark" style="width:22px;height:22px;color:white"></i>
      </div>
      <div>
        <div style="font-size:1.1rem;font-weight:900;color:white;letter-spacing:-0.01em">Caja 1</div>
        <div style="font-size:.68rem;color:rgba(255,255,255,.75);font-weight:700">Directora — ${new Date().toLocaleDateString('es-DO',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</div>
      </div>
    </div>
    <div style="display:flex;gap:8px">
      <button onclick="CajaCobroV2._openCajaSession()" style="padding:8px 14px;border-radius:10px;border:1.5px solid rgba(255,255,255,.3);background:rgba(255,255,255,.15);color:white;font-size:.68rem;font-weight:800;cursor:pointer;backdrop-filter:blur(4px)">Abrir Caja</button>
      <button onclick="CajaCobroV2._closeCajaSession()" style="padding:8px 14px;border-radius:10px;border:1.5px solid rgba(255,255,255,.3);background:rgba(255,255,255,.15);color:white;font-size:.68rem;font-weight:800;cursor:pointer;backdrop-filter:blur(4px)">Cerrar Caja</button>
    </div>
  </div>
  <!-- Devolver Efectivo Button -->
  <div style="background:white;border-radius:14px;border:1px solid #fee2e2;padding:10px 16px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between">
    <div style="display:flex;align-items:center;gap:10px">
      <div style="width:32px;height:32px;border-radius:8px;background:#FEF2F2;display:flex;align-items:center;justify-content:center">
        <i data-lucide="banknote" style="width:16px;height:16px;color:#EF4444"></i>
      </div>
      <div>
        <div style="font-size:.75rem;font-weight:800;color:#1a2340">Devolución de Efectivo</div>
        <div style="font-size:.62rem;color:#94a3b8">Registrar devoluciones pendientes</div>
      </div>
    </div>
    <button onclick="CajaCobroV2._openCashReturn()" style="padding:6px 14px;border-radius:8px;border:1.5px solid #FECACA;background:#FEF2F2;color:#EF4444;font-size:.65rem;font-weight:900;cursor:pointer">Registrar</button>
  </div>
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
  <div style="background:white;border-radius:14px;border:1px solid #e2e8f0;overflow:hidden;margin-bottom:14px">
    <div style="padding:10px 16px;border-bottom:1px solid #f8fafc;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
      <span style="font-size:.65rem;font-weight:900;color:#64748b;text-transform:uppercase">Últimos Cobros Hoy</span>
      <span id="cajaHistoryCount" style="font-size:.6rem;font-weight:700;color:#94a3b8"></span>
    </div>
    <div id="cajaHistoryList" style="max-height:120px;overflow-y:auto"></div>
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

  // ── CARGAR ESTUDIANTES + KPIs ─────────────────────────────────────────────
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

    // Cargar historial de cobros de hoy
    try {
      const todayStr = today();
      const { data: recentPays } = await supabase.from('payments')
        .select('id,amount,concept,method,paid_date,students:student_id(name)')
        .eq('status','paid').gte('paid_date',todayStr+'T00:00:00').lte('paid_date',todayStr+'T23:59:59')
        .order('paid_date',{ascending:false}).limit(10);
      const histEl = document.getElementById('cajaHistoryList');
      const histCount = document.getElementById('cajaHistoryCount');
      if (histEl) {
        if (recentPays?.length) {
          if (histCount) histCount.textContent = recentPays.length + ' cobros';
          histEl.innerHTML = recentPays.map(p => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 16px;border-bottom:1px solid #f8fafc">
              <div style="display:flex;align-items:center;gap:8px">
                <div style="width:28px;height:28px;border-radius:7px;background:#eff6ff;display:flex;align-items:center;justify-content:center;font-size:.7rem;font-weight:900;color:#0B63C7">${(p.students?.name||'?').charAt(0)}</div>
                <div>
                  <div style="font-size:.75rem;font-weight:800;color:#1a2340">${Helpers.escapeHTML(p.students?.name||'—')}</div>
                  <div style="font-size:.6rem;color:#94a3b8">${Helpers.escapeHTML(p.concept||'—')}</div>
                </div>
              </div>
              <div style="text-align:right">
                <div style="font-size:.8rem;font-weight:900;color:#0B63C7">${fmt(p.amount)}</div>
                <div style="font-size:.55rem;color:#94a3b8">${p.paid_date ? new Date(p.paid_date).toLocaleTimeString('es-DO',{hour:'2-digit',minute:'2-digit'}) : ''}</div>
              </div>
            </div>`).join('');
        } else {
          if (histCount) histCount.textContent = '';
          histEl.innerHTML = '<div style="text-align:center;padding:16px;color:#94a3b8;font-size:.75rem">Sin cobros hoy</div>';
        }
      }
    } catch(_) {}
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
    _cart = []; _method = null; _student = null; _charges = []; _discountPct = 0;

    // Cargar datos del estudiante, charges, historial y enrollment
    const [{ data: stu }, { data: charges }, { data: history }, { data: enrollment }] = await Promise.all([
      supabase.from('students').select('id,name,matricula,p1_name,p1_phone,classrooms:classroom_id(name,level),monthly_fee').eq('id',studentId).single(),
      supabase.from('payments').select('id,concept,amount,status,due_date,month_paid').eq('student_id',studentId).in('status',['pending','overdue']).order('due_date').limit(50),
      supabase.from('payments').select('amount,method,paid_date,concept').eq('student_id',studentId).eq('status','paid').order('paid_date',{ascending:false}).limit(5),
      supabase.from('student_enrollments').select('id,payment_plans:payment_plan_id(name,plan_installments(month_number,month_name,amount,type))').eq('student_id',studentId).order('created_at',{ascending:false}).limit(1).maybeSingle(),
    ]);

    _student = stu;
    _charges = charges || [];

    // Cargar conceptos de payment_concepts (DB) para mostrar en el tab
    await _loadDbConcepts();

    // Mapa de meses pagados — month_paid es YYYY-MM
    const { data: paidMonths } = await supabase.from('payments').select('month_paid').eq('student_id',studentId).eq('status','paid').not('month_paid','is',null).limit(100);
    const paidSet = new Set();
    (paidMonths||[]).forEach(p => {
      if (!p.month_paid) return;
      paidSet.add(p.month_paid); // "2026-07"
      const parts = String(p.month_paid).split('-');
      if (parts.length >= 2) {
        paidSet.add(parseInt(parts[1], 10)); // 7
        paidSet.add(String(parseInt(parts[1], 10))); // "7"
      }
    });

    // Cuotas del plan — buscar por mes calendario
    const installments = enrollment?.payment_plans?.plan_installments || [];
    const instMap = {};
    installments.forEach((x) => { if (x.month_number) instMap[x.month_number] = Number(x.amount||0); });

    const studentMonthlyFee = Number(stu?.monthly_fee || 0);
    const defaultFee = studentMonthlyFee > 0
      ? studentMonthlyFee
      : (installments.length > 0
        ? Math.max(...installments.map(x => Number(x.amount||0)))
        : 0);

    const modalId = 'cajaModal_' + Date.now();
    const overlay = document.createElement('div');
    overlay.id = modalId;
    const sbWidth = document.getElementById('sidebar')?.offsetWidth || 0;
    overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.55);backdrop-filter:blur(6px);z-index:9998;display:flex;align-items:flex-start;justify-content:center;padding:12px;overflow-y:auto;padding-left:${sbWidth > 0 ? sbWidth + 12 : 12}px`;
    overlay.onclick = e => { if(e.target===overlay) overlay.remove(); };

    const nowMonth = new Date().getMonth();
    const catalog = getCatalog();

    // Conceptos de DB (si hay) se muestran primero; fallback al catálogo local
    const displayConcepts = _dbConcepts.length > 0
      ? _dbConcepts.map(c => ({ id: 'db_'+c.id, label: c.name, amount: c.amount, icon: '🏷️' }))
      : catalog;

    overlay.innerHTML = `
    <div id="cajaModalInner" style="background:#f8fafc;border-radius:16px;width:100%;max-width:720px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.25);margin:auto;position:relative;display:flex;flex-direction:column">

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
        ${[['meses','📅 Mensualidades'],['conceptos','🏷️ Conceptos'],['descuento','💰 Descuento'],['pago','💳 Método'],['resumen','🧾 Resumen']].map(([t,l],i)=>`
          <button onclick="CajaCobroV2._showTab('${t}')" id="cajaTab_${t}"
            style="flex:1;padding:8px 4px;border:none;font-size:.6rem;font-weight:900;cursor:pointer;transition:all .12s;border-bottom:2px solid transparent;margin-bottom:-2px;${i===0?'color:#0B63C7;border-bottom-color:#0B63C7;background:white':'color:#94a3b8;background:white'}">
            ${l}
          </button>`).join('')}
      </div>

      <!-- Tab content — scrollable -->
      <div id="cajaTabContent" style="overflow-y:auto;max-height:calc(90vh - 170px);min-height:350px;flex:1">

        <!-- TAB: Mensualidades -->
        <div id="cajaPane_meses" style="padding:14px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
            <span style="font-size:.62rem;font-weight:900;color:#94a3b8;text-transform:uppercase">Año ${new Date().getFullYear()} — clic para seleccionar</span>
            <button onclick="CajaCobroV2._selectAllPending()" style="font-size:.65rem;font-weight:900;color:#0B63C7;border:1px solid #0B63C7;background:transparent;border-radius:6px;padding:4px 10px;cursor:pointer">Todos pendientes</button>
          </div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
            ${MONTHS_FULL.map((m,i)=>{
              const monthNum = i + 1;
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
            ${displayConcepts.slice(0,6).map(c=>`
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
            <button onclick="CajaCobroV2._showTab('descuento')" style="padding:8px 18px;background:#0B63C7;color:white;border:none;border-radius:10px;font-size:.75rem;font-weight:900;cursor:pointer">Siguiente →</button>
          </div>
        </div>

        <!-- TAB: Descuento -->
        <div id="cajaPane_descuento" style="padding:14px;display:none">
          <div style="font-size:.62rem;font-weight:900;color:#94a3b8;text-transform:uppercase;margin-bottom:10px">Descuento (opcional)</div>
          <div style="background:white;border-radius:12px;padding:16px;border:1px solid #e2e8f0">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
              <div>
                <div style="font-size:.85rem;font-weight:900;color:#1a2340">Porcentaje de descuento</div>
                <div style="font-size:.7rem;color:#94a3b8;margin-top:2px">Se aplica sobre subtotal + mora</div>
              </div>
              <div style="display:flex;align-items:center;gap:6px">
                <input id="discountInput" type="number" min="0" max="100" step="0.5" value="${_discountPct}"
                  oninput="CajaCobroV2._applyDiscount(this.value)"
                  style="width:80px;padding:10px;border:2px solid #e2e8f0;border-radius:10px;font-size:1rem;font-weight:900;text-align:center;outline:none;color:#0B63C7">
                <span style="font-size:1rem;font-weight:900;color:#64748b">%</span>
              </div>
            </div>
            <div id="discountPreview" style="margin-top:12px;font-size:.8rem;font-weight:800;color:#16a34a;display:${_discountPct > 0 ? 'block' : 'none'}"></div>
          </div>
          <div style="margin-top:14px;display:flex;justify-content:space-between">
            <button onclick="CajaCobroV2._showTab('conceptos')" style="padding:8px 18px;background:#f1f5f9;color:#64748b;border:none;border-radius:10px;font-size:.75rem;font-weight:900;cursor:pointer">← Atrás</button>
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
            <button onclick="CajaCobroV2._showTab('descuento')" style="padding:8px 18px;background:#f1f5f9;color:#64748b;border:none;border-radius:10px;font-size:.75rem;font-weight:900;cursor:pointer">← Atrás</button>
            <button onclick="CajaCobroV2._showTab('resumen')" style="padding:8px 18px;background:#0B63C7;color:white;border:none;border-radius:10px;font-size:.75rem;font-weight:900;cursor:pointer">Ver Resumen →</button>
          </div>
        </div>

        <!-- TAB: Resumen -->
        <div id="cajaPane_resumen" style="padding:14px;display:none">
          <div style="font-size:.62rem;font-weight:900;color:#94a3b8;text-transform:uppercase;margin-bottom:10px">Resumen del cobro</div>
          <!-- Opción DGII discreta -->
          <div style="background:#f8fafc;border:1px dashed #e2e8f0;border-radius:10px;padding:10px 14px;margin-bottom:12px;display:flex;align-items:center;gap:10px">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:.7rem;color:#64748b;font-weight:700">
              <input type="checkbox" id="excludeDGII" style="accent-color:#EF4444;width:14px;height:14px">
              <span>No enviar a DGII</span>
            </label>
            <span style="font-size:.58rem;color:#94a3b8;font-style:italic">(factura interna)</span>
          </div>

          <!-- Contenido dinámico del resumen -->
          <div class="caja-resumen-content">
            <!-- Se llena dinámicamente con _updateCart() -->
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
    ['meses','conceptos','descuento','pago','resumen'].forEach(t => {
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
        _cart.push({ _monthIdx: i, concept: 'Colegiatura '+m, description: 'Mensualidad escolar', amount: Number(btn.dataset.amount||0), type: 'colegiatura' });
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

  // ── TOGGLE MES ────────────────────────────────────────────────────────────
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
      _cart.push({ _monthIdx: idx, concept: 'Colegiatura ' + label, description: 'Mensualidad escolar', amount: Number(amount), type: 'colegiatura' });
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
      if (btn) { btn.style.borderColor='#e2e8f0'; btn.style.background='white'; }
    } else {
      if (id === 'otro' || amt === 0) {
        const a = prompt('Monto para ' + label + ' (RD$):');
        if (!a || isNaN(Number(a))) return;
        _cart.push({ _conceptId: id, concept: label, description: 'Concepto adicional', amount: Number(a), type: 'extra' });
      } else {
        _cart.push({ _conceptId: id, concept: label, description: 'Concepto adicional', amount: amt, type: 'extra' });
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
    _cart.push({ _conceptId: 'free_'+Date.now(), concept: lbl, description: 'Concepto libre', amount: amt, type: 'extra' });
    document.getElementById('freeConceptLabel').value = '';
    document.getElementById('freeConceptAmt').value   = '';
    this._updateCart();
  },

  // ── DESCUENTO ──────────────────────────────────────────────────────────────
  _applyDiscount(value) {
    let pct = Number(value || 0);
    if (Number.isNaN(pct)) pct = 0;
    pct = Math.max(0, Math.min(100, pct));
    _discountPct = pct;
    this._updateCart();
    // Update preview
    const preview = document.getElementById('discountPreview');
    if (preview) {
      if (pct > 0) {
        const sub = _cart.reduce((s,c) => s + c.amount, 0);
        const mora = calcMora(_charges);
        const disc = calcDiscount(sub, mora, pct);
        preview.textContent = `Ahorras ${fmt(disc)} (${pct}%)`;
        preview.style.display = 'block';
      } else {
        preview.style.display = 'none';
      }
    }
  },

  // ── ACTUALIZAR CARRITO ────────────────────────────────────────────────────
  _updateCart() {
    const resumenPane = document.getElementById('cajaPane_resumen');
    const btn = document.getElementById('btnConfirmarCobro');
    if (!resumenPane) return;

    const sub = _cart.reduce((s, c) => s + c.amount, 0);
    const hasColegiatura = _cart.some(c => c.type === 'colegiatura');
    const mora = hasColegiatura ? calcMora(_charges) : 0;
    const discount = calcDiscount(sub, mora, _discountPct);
    const total = calcTotal(_cart, mora, discount);

    // Obtener valores de pago
    const cashReceivedEl = document.getElementById('cashReceived');
    const received = Number(cashReceivedEl?.value || 0);
    const change = Math.max(0, received - total);
    const remaining = Math.max(0, total - received);

    // Construir tabla de conceptos
    let tableHTML = '';
    if (_cart.length === 0) {
      tableHTML = `
        <div style="text-align:center;padding:24px;color:#94a3b8;font-size:.85rem">
          <div style="font-size:2rem;margin-bottom:8px">📋</div>
          Seleccione meses o conceptos
        </div>`;
    } else {
      tableHTML = `
        <div style="background:white;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;margin-bottom:16px">
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0">
                <th style="padding:10px 14px;text-align:left;font-size:.65rem;font-weight:900;color:#64748b;text-transform:uppercase;letter-spacing:.05em">Concepto</th>
                <th style="padding:10px 14px;text-align:left;font-size:.65rem;font-weight:900;color:#64748b;text-transform:uppercase;letter-spacing:.05em">Descripción</th>
                <th style="padding:10px 14px;text-align:right;font-size:.65rem;font-weight:900;color:#64748b;text-transform:uppercase;letter-spacing:.05em">Monto</th>
                <th style="width:40px"></th>
              </tr>
            </thead>
            <tbody>
              ${_cart.map((c, i) => {
                const isMora = c.type === 'mora';
                const isDiscount = c.type === 'discount';
                const rowBg = i % 2 === 0 ? 'white' : '#fafbfc';
                const amountColor = isMora ? '#EF4444' : isDiscount ? '#16A34A' : '#0B63C7';
                const desc = c.type === 'colegiatura' ? 'Mensualidad escolar' : (c.description || 'Concepto adicional');
                return `
                  <tr style="background:${rowBg};border-bottom:1px solid #f1f5f9">
                    <td style="padding:10px 14px">
                      <div style="font-weight:800;color:#1a2340;font-size:.8rem">${Helpers.escapeHTML(c.concept)}</div>
                    </td>
                    <td style="padding:10px 14px;font-size:.75rem;color:#64748b">${Helpers.escapeHTML(desc)}</td>
                    <td style="padding:10px 14px;text-align:right;font-weight:900;color:${amountColor};font-size:.85rem">${isDiscount ? '-' : ''}${fmt(c.amount)}</td>
                    <td style="padding:10px 8px;text-align:center">
                      <button onclick="CajaCobroV2.removeCartItem(${i})" style="border:none;background:transparent;color:#EF4444;cursor:pointer;font-size:1rem;padding:2px 6px;border-radius:6px;transition:background .15s" onmouseover="this.style.background='#FEE2E2'" onmouseout="this.style.background='transparent'">✕</button>
                    </td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`;
    }

    // Construir sección de totales
    let totalsHTML = `
      <div style="background:white;border-radius:12px;border:1px solid #e2e8f0;padding:16px;margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f1f5f9">
          <span style="font-size:.85rem;color:#64748b;font-weight:600">Subtotal</span>
          <span style="font-size:.9rem;font-weight:800;color:#1a2340">${fmt(sub)}</span>
        </div>`;

    if (mora > 0) {
      totalsHTML += `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f1f5f9">
          <span style="font-size:.85rem;color:#EF4444;font-weight:600;display:flex;align-items:center;gap:6px">
            <span style="background:#FEE2E2;padding:2px 6px;border-radius:4px;font-size:.7rem">⚠</span>
            Mora
          </span>
          <span style="font-size:.9rem;font-weight:900;color:#EF4444">+${fmt(mora)}</span>
        </div>`;
    }

    if (discount > 0) {
      totalsHTML += `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f1f5f9">
          <span style="font-size:.85rem;color:#16A34A;font-weight:600;display:flex;align-items:center;gap:6px">
            <span style="background:#DCFCE7;padding:2px 6px;border-radius:4px;font-size:.7rem">%</span>
            Descuento (${_discountPct}%)
          </span>
          <span style="font-size:.9rem;font-weight:900;color:#16A34A">-${fmt(discount)}</span>
        </div>`;
    }

    totalsHTML += `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;margin-top:8px;background:linear-gradient(135deg,#eff6ff,#f0f9ff);margin:-16px -16px -16px -16px;padding:16px;border-radius:0 0 12px 12px;border-top:3px solid #0B63C7">
          <span style="font-size:1.1rem;font-weight:900;color:#0B63C7;text-transform:uppercase">Total</span>
          <span style="font-size:1.4rem;font-weight:900;color:#0B63C7">${fmt(total)}</span>
        </div>
      </div>`;

    // Construir sección de pago (si hay método efectivo)
    let paymentHTML = '';
    if (_method === 'efectivo' && total > 0) {
      paymentHTML = `
        <div style="background:white;border-radius:12px;border:1px solid #e2e8f0;padding:16px;margin-bottom:16px">
          <div style="font-size:.65rem;font-weight:900;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px">Detalle del Pago</div>
          
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f1f5f9">
            <span style="font-size:.85rem;color:#64748b;font-weight:600">Monto a pagar</span>
            <span style="font-size:1rem;font-weight:900;color:#0B63C7">${fmt(total)}</span>
          </div>
          
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f1f5f9">
            <span style="font-size:.85rem;color:#64748b;font-weight:600">Monto recibido</span>
            <span style="font-size:1rem;font-weight:900;color:#1a2340">${fmt(received)}</span>
          </div>
          
          ${change > 0 ? `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f1f5f9;background:#f0fdf4;margin:0 -16px;padding:10px 16px">
            <span style="font-size:.85rem;color:#16A34A;font-weight:700;display:flex;align-items:center;gap:6px">
              <span style="background:#DCFCE7;padding:2px 6px;border-radius:4px;font-size:.7rem">✓</span>
              Cambio
            </span>
            <span style="font-size:1.1rem;font-weight:900;color:#16A34A">${fmt(change)}</span>
          </div>` : ''}
          
          ${remaining > 0 ? `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;background:#FEF2F2;margin:0 -16px;padding:10px 16px;border-radius:0 0 12px 12px">
            <span style="font-size:.85rem;color:#EF4444;font-weight:700;display:flex;align-items:center;gap:6px">
              <span style="background:#FEE2E2;padding:2px 6px;border-radius:4px;font-size:.7rem">!</span>
              Saldo restante
            </span>
            <span style="font-size:1.1rem;font-weight:900;color:#EF4444">${fmt(remaining)}</span>
          </div>` : ''}
        </div>`;
    } else if (_method && _method !== 'efectivo' && total > 0) {
      paymentHTML = `
        <div style="background:white;border-radius:12px;border:1px solid #e2e8f0;padding:16px;margin-bottom:16px">
          <div style="font-size:.65rem;font-weight:900;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px">Método de Pago</div>
          <div style="display:flex;align-items:center;gap:10px">
            <div style="width:40px;height:40px;border-radius:10px;background:#eff6ff;display:flex;align-items:center;justify-content:center;font-size:1.2rem">
              ${_method === 'tarjeta' ? '💳' : _method === 'transferencia' ? '🏦' : _method === 'cheque' ? '📝' : '🔀'}
            </div>
            <div>
              <div style="font-weight:800;color:#1a2340;font-size:.9rem;text-transform:capitalize">${_method}</div>
              <div style="font-size:.75rem;color:#64748b">Pago registrado</div>
            </div>
            <div style="margin-left:auto;font-size:1.1rem;font-weight:900;color:#0B63C7">${fmt(total)}</div>
          </div>
        </div>`;
    }

    // Actualizar el contenido del pane
    const existingContent = resumenPane.querySelector('.caja-resumen-content');
    if (existingContent) {
      existingContent.innerHTML = tableHTML + totalsHTML + paymentHTML;
    } else {
      // Primera vez - crear estructura
      const header = resumenPane.querySelector('div:first-child');
      const contentDiv = document.createElement('div');
      contentDiv.className = 'caja-resumen-content';
      contentDiv.innerHTML = tableHTML + totalsHTML + paymentHTML;
      resumenPane.insertBefore(contentDiv, resumenPane.firstChild?.nextSibling);
    }

    // Actualizar estado del botón
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
      if (btn) { btn.style.borderColor='#e2e8f0'; btn.style.background='white'; }
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

    if (method === 'efectivo') {
      detail.innerHTML = `
        ${LBL('Monto recibido')}
        <input id="cashReceived" type="number" placeholder="RD$" oninput="CajaCobroV2.calcChange()" style="${INP}">
        <div style="font-size:.85rem;font-weight:900;color:#0B63C7;margin-top:4px">Cambio: <span id="cashChange">RD$0.00</span></div>
        ${rncSection()}`;

    } else if (method === 'transferencia') {
      detail.innerHTML = `
        ${LBL('Banco de origen')}
        <select id="tfBanco" style="${INP}"><option value="">Seleccionar banco...</option>${bankSelectOpts()}</select>
        ${LBL('No. de referencia / confirmación')}
        <input id="tfRef" placeholder="Ej: 00123456789" style="${INP}">
        ${LBL('Comprobante de transferencia *')}
        ${uploadBtn('tfComprobante','Subir comprobante (foto/PDF)',"CajaCobroV2._previewUpload('tfComprobante','prev_tfComprobante')")}
        ${rncSection()}`;

    } else if (method === 'cheque') {
      detail.innerHTML = `
        ${LBL('Banco emisor')}
        <select id="chqBanco" style="${INP}"><option value="">Seleccionar banco...</option>${bankSelectOpts()}</select>
        ${LBL('Número de cheque')}
        <input id="chqNum" placeholder="Ej: 0001234" style="${INP}">
        ${LBL('Fecha de emisión')}
        <input id="chqFecha" type="date" style="${INP}" value="${today()}">
        ${LBL('Foto frente del cheque *')}
        ${uploadBtn('chqFrente','Frente del cheque',"CajaCobroV2._previewUpload('chqFrente','prev_chqFrente')")}
        ${LBL('Foto reverso del cheque *')}
        ${uploadBtn('chqReverso','Reverso del cheque',"CajaCobroV2._previewUpload('chqReverso','prev_chqReverso')")}
        ${rncSection()}`;

    } else if (method === 'tarjeta') {
      detail.innerHTML = `
        <div style="display:flex;gap:12px;margin-bottom:8px">
          ${['Débito','Crédito'].map(t=>`<label style="display:flex;align-items:center;gap:6px;font-size:.8rem;font-weight:700;cursor:pointer">
            <input type="radio" name="cardType" value="${t.toLowerCase()}" style="accent-color:#0B63C7"> ${t}
          </label>`).join('')}
        </div>
        ${LBL('Tipo de tarjeta')}
        <select id="cardBrand" style="${INP}">
          <option value="">Seleccionar...</option>
          <option>Visa</option><option>Mastercard</option><option>Amex</option><option>Otra</option>
        </select>
        ${LBL('Últimos 4 dígitos')}
        <input id="cardLast4" type="number" maxlength="4" placeholder="1234" style="${INP}" oninput="if(this.value.length>4)this.value=this.value.slice(0,4)">
        ${LBL('No. de autorización')}
        <input id="cardAuth" placeholder="Ej: A123456" style="${INP}">
        ${rncSection()}`;

    } else if (method === 'mixto') {
      detail.innerHTML = `
        ${LBL('Monto efectivo')}
        <input id="mixEfectivo" type="number" placeholder="RD$" style="${INP}">
        ${LBL('Monto transferencia')}
        <input id="mixTransfer" type="number" placeholder="RD$" style="${INP}">
        ${LBL('Referencia transferencia')}
        <input id="mixRef" placeholder="Referencia" style="${INP}">
        ${rncSection()}`;
    } else {
      detail.innerHTML = rncSection();
    }
    this._updateCart();
  },

  _previewUpload(inputId, previewId) {
    const file = document.getElementById(inputId)?.files[0];
    const prev = document.getElementById(previewId);
    if (prev && file) prev.textContent = '✓ ' + file.name.slice(0,20);
  },

  calcChange() {
    const mora = calcMora(_charges);
    const discount = calcDiscount(_cart.reduce((s,c)=>s+c.amount,0), mora, _discountPct);
    const total = calcTotal(_cart, mora, discount);
    const received = Number(document.getElementById('cashReceived')?.value || 0);
    const changeEl = document.getElementById('cashChange');
    if (changeEl) changeEl.textContent = fmt(Math.max(0, received - total));
    
    // Actualizar el resumen si está visible
    const resumenPane = document.getElementById('cajaPane_resumen');
    if (resumenPane && resumenPane.style.display !== 'none') {
      this._updateCart();
    }
  },

  // ── CONFIRMAR COBRO ───────────────────────────────────────────────────────
  async confirmCobro() {
    if (!_cart.length || !_method || !_student) return;
    const btn = document.getElementById('btnConfirmarCobro');
    if (btn) { btn.disabled=true; btn.textContent='Procesando...'; }

    try {
      const sub = _cart.reduce((s,c)=>s+c.amount,0);
      const mora = calcMora(_charges);
      const discount = calcDiscount(sub, mora, _discountPct);
      const total = calcTotal(_cart, mora, discount);
      const now   = new Date().toISOString();
      const todayStr = today();

      const rnc = document.getElementById('rncEmpresa')?.value?.trim();
      const empresa = document.getElementById('nombreEmpresa')?.value?.trim();
      const excludeDGII = document.getElementById('excludeDGII')?.checked || false;
      let notes = '';
      if (rnc) notes += `RNC:${rnc}|`;
      if (empresa) notes += `Empresa:${empresa}|`;
      if (_discountPct > 0) notes += `Descuento:${_discountPct}% (-${fmt(discount)})|`;
      if (excludeDGII) notes += `EXCLUDE_DGII:true|`;

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
        notes: notes || null,
        exclude_dgii: excludeDGII
      }));

      const { error } = await supabase.from('payments').insert(inserts);
      if (error) throw error;

      const colegiaturas = _cart.filter(c => c.type === 'colegiatura');
      const monthPaid = colegiaturas.length > 0
        ? colegiaturas.map(c => c._monthIdx + 1).join(',')
        : null;

      const { data: newPays } = await supabase
        .from('payments')
        .select('id, amount, month_paid')
        .eq('student_id', _student.id)
        .eq('status', 'paid')
        .gte('paid_date', todayStr + 'T00:00:00')
        .order('created_at', { ascending: false })
        .limit(1);

      let invoiceResult = null;
      if (newPays?.[0]?.id) {
        // 1) Try edge function first
        try {
          const { data, error: invErr } = await supabase.functions.invoke('generate-invoice', {
            body: { payment_id: newPays[0].id, send_email: false }
          });
          if (!invErr && data?.invoice?.id) {
            invoiceResult = data;
          }
        } catch (_) {}

        // 2) Fallback: create invoice client-side if edge function failed
        if (!invoiceResult?.invoice?.id) {
          try {
            const pay = newPays[0];
            const stu = _student || {};
            const now = new Date().toISOString();
            const receiptNo = `KPK-${new Date().getFullYear()}${String(new Date().getMonth()+1).padStart(2,'0')}-${String(pay.id).slice(-6).toUpperCase()}`;
            const hashInput = `INV-${pay.id}-${Date.now()}-KPK`;
            const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(hashInput));
            const sha256Hash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2,'0')).join('');
            const uuidFolio = crypto.randomUUID();

            const rnc = document.getElementById('rncEmpresa')?.value?.trim() || '';
            const empresa = document.getElementById('nombreEmpresa')?.value?.trim() || '';

            const invData = {
              invoice_number: receiptNo,
              receipt_number: receiptNo,
              payment_id: pay.id,
              student_id: stu.id,
              student_name: stu.name,
              student_matricula: stu.matricula,
              classroom_name: stu.classrooms?.name || null,
              parent_name: stu.p1_name,
              parent_phone: stu.p1_phone,
              concept: _cart.map(c => c.concept).join(', '),
              amount: total,
              subtotal: total,
              tax_amount: 0,
              total: total,
              status: 'paid',
              payment_method: _method,
              payment_date: now,
              issued_date: now,
              notes: notes || null,
              sha256_hash: sha256Hash,
              uuid_folio: uuidFolio,
              validation_url: `https://montessorisonrisascreativas.com/validate-invoice.html?uuid=${uuidFolio}`,
              qr_data: `https://montessorisonrisascreativas.com/validate-invoice.html?uuid=${uuidFolio}`,
              fiscal_parent_rnc: rnc || null,
              fiscal_parent_company_name: empresa || null,
              school_name: null,
              pdf_url: null,
            };

            const { data: newInv, error: invErr } = await supabase
              .from('invoices').insert(invData).select('*').single();

            if (!invErr && newInv?.id) {
              // Fetch school settings to enrich response
              const { data: school } = await supabase
                .from('school_settings').select('*').eq('id', 1).single();

              invoiceResult = {
                success: true,
                invoice: newInv,
                receipt_number: receiptNo,
                student: { name: stu.name, matricula: stu.matricula, p1_name: stu.p1_name, p1_email: stu.p1_email, p1_phone: stu.p1_phone, classroom: stu.classrooms?.name, level: stu.classrooms?.level },
                school: { school_name: school?.school_name || 'Colegio Montessori Sonrisas Creativas', rnc: school?.rnc, phone: school?.phone, email: school?.email, website: school?.website || 'https://montessorisonrisascreativas.com', logo_url: school?.logo_url, address: school?.address, city: school?.city, state: school?.state },
                payment: { concept: _cart.map(c=>c.concept).join(', '), amount: total, method: _method, paid_date: now, month_paid: _cart.find(c=>c.type==='colegiatura') ? currentYear + '-' + String(_cart.find(c=>c.type==='colegiatura')._monthIdx+1).padStart(2,'0') : null },
              };
            } else {
              console.warn('[CajaCobroV2] Client-side invoice insert failed:', invErr);
            }
          } catch (fallbackErr) {
            console.warn('[CajaCobroV2] Invoice fallback error:', fallbackErr);
          }
        }

        // 3) Generate PDF and email if we have an invoice
        if (invoiceResult?.invoice?.id) {
          try {
            if (typeof InvoiceModule !== 'undefined') {
              const pdfBlob = await InvoiceModule.generatePDF(invoiceResult);
              if (pdfBlob) {
                const pdfUrl = await InvoiceModule.uploadPDF(pdfBlob, invoiceResult.invoice.id);
                if (pdfUrl) invoiceResult.invoice.pdf_url = pdfUrl;
                await InvoiceModule.sendInvoiceEmail(invoiceResult, pdfBlob);
              }
            }
          } catch (pdfErr) {
            console.warn('[CajaCobroV2] PDF/Email pipeline error:', pdfErr);
          }
        }

        try {
          const { emitEvent: emit } = await import('./supabase.js');
          emit('payment.approved', {
            payment_id:   newPays[0].id,
            student_name: _student.name,
            amount:       fmt(total),
            month:        monthPaid || 'Colegiatura'
          }).catch(() => {});
        } catch (_) {}

        // Integración contabilidad: registrar en libro diario
        try {
          const concepts = _cart.map(c => c.concept).join(', ');
          this._logToAccounting({
            id: newPays[0]?.id,
            concept: concepts,
            student_name: _student?.name,
            amount: total,
            method: _method
          });
        } catch (_) {}

        // Auto-envío a DGII (si no está marcado como exclude)
        if (!excludeDGII) {
          try {
            const { emitEvent: emit2 } = await import('./supabase.js');
            emit2('invoice.dgii_queue', {
              payment_id: newPays[0]?.id,
              amount: total,
              exclude: false
            }).catch(() => {});
          } catch (_) {}
        }
      }

      document.querySelectorAll('[id^="cajaModal_"]').forEach(e=>e.remove());
      this._showSuccess(total, invoiceResult, newPays?.[0]?.id);
      this.loadStudents();

    } catch (err) {
      Helpers.toast('Error: ' + (err.message||''), 'error');
      if (btn) { btn.disabled=false; btn.textContent='✓ Cobrar y Emitir Factura'; }
    }
  },

  _showSuccess(total, invoiceResult, paymentId) {
    // Usar el módulo de facturación profesional
    if (typeof InvoiceModule !== 'undefined' && InvoiceModule.openSuccessModal) {
      InvoiceModule.openSuccessModal(total, invoiceResult, paymentId);
      return;
    }
    // Fallback básico si InvoiceModule no está disponible
    const receiptNo = invoiceResult?.receipt_number || 'N/A';
    const hasInvoice = !!invoiceResult?.invoice?.id;
    const el = document.createElement('div');
    el.id = 'cajaSuccessModal';
    el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);backdrop-filter:blur(6px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
    el.onclick = e => { if(e.target===el) el.remove(); };
    el.innerHTML = `<div style="background:white;border-radius:20px;padding:28px;max-width:400px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <div style="width:72px;height:72px;background:#f0fdf4;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;font-size:2.5rem">✅</div>
      <div style="font-size:1.1rem;font-weight:900;color:#1a2340;margin-bottom:4px">¡Pago registrado!</div>
      <div style="font-size:.75rem;color:#64748b;margin-bottom:6px">Recibo: <strong style="color:#0B63C7;font-family:monospace">${receiptNo}</strong></div>
      <div style="font-size:1.6rem;font-weight:900;color:#0B63C7;margin-bottom:16px">${fmt(total)}</div>
      <button onclick="document.getElementById('cajaSuccessModal').remove()" style="width:100%;padding:13px;border-radius:12px;border:none;background:#0B63C7;color:white;font-size:.9rem;font-weight:900;cursor:pointer">Cerrar</button>
    </div>`;
    document.body.appendChild(el);
    setTimeout(() => { if (document.getElementById('cajaSuccessModal')) el.remove(); }, 30000);
  },

  _printReceipt(asciiReceipt, receiptNo) {
    // Usar el módulo profesional si está disponible
    if (typeof InvoiceModule !== 'undefined' && InvoiceModule._printInvoice) {
      InvoiceModule._printInvoice();
      return;
    }
    // Fallback: imprimir ASCII
    if (!asciiReceipt) {
      asciiReceipt = `Recibo ${receiptNo || 'N/A'}\nSin datos disponibles`;
    }
    const printWin = window.open('', '_blank', 'width=420,height=700');
    if (!printWin) { Helpers.toast('Permitir ventanas emergentes para imprimir','warning'); return; }
    printWin.document.write(`<!DOCTYPE html><html><head><title>${receiptNo}</title>
      <style>@page{margin:8mm}body{font-family:'Courier New',monospace;font-size:11px;margin:0;padding:10px;white-space:pre;line-height:1.35;background:white}@media print{body{padding:0}}</style></head><body>${asciiReceipt}</body></html>`);
    printWin.document.close();
    printWin.focus();
    setTimeout(() => { printWin.print(); }, 400);
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
  },

  // ── CAJA SESSIONS (Apertura / Cierre) ─────────────────────────────────────
  async _openCajaSession() {
    const profile = window.AppState?.get?.('profile') || {};
    const directorName = profile.name || 'Directora';
    const todayStr = today();

    const { data: existing } = await supabase.from('caja_sessions')
      .select('*').eq('date', todayStr).limit(1).maybeSingle();

    if (existing?.status === 'open') {
      Helpers.toast('La caja ya está abierta hoy', 'info');
      return;
    }

    const bal = prompt(`Apertura de Caja 1 — ${directorName}\n\nEfectivo inicial en caja (RD$):`, '0');
    if (bal === null) return;

    const { error } = await supabase.from('caja_sessions').upsert({
      date: todayStr,
      opening_balance: Number(bal) || 0,
      status: 'open',
      opened_by: profile.id || null,
      notes: `Caja 1 — ${directorName}`
    }, { onConflict: 'date' });

    if (error) return Helpers.toast('Error: ' + error.message, 'error');
    Helpers.toast(`Caja abierta con ${fmt(Number(bal)||0)}`, 'success');
    this.loadStudents();
  },

  async _closeCajaSession() {
    const todayStr = today();
    const { data: session } = await supabase.from('caja_sessions')
      .select('*').eq('date', todayStr).limit(1).maybeSingle();

    if (session?.status === 'closed') {
      Helpers.toast('La caja ya está cerrada hoy', 'info');
      return;
    }

    const { data: pays } = await supabase.from('payments')
      .select('amount').eq('status','paid')
      .gte('paid_date', todayStr+'T00:00:00').lte('paid_date', todayStr+'T23:59:59');

    const totalHoy = (pays||[]).reduce((s,p) => s + Number(p.amount||0), 0);
    if (!confirm(`¿Cerrar la caja del día?\n\nTotal cobrado: ${fmt(totalHoy)}\nBalance apertura: ${fmt(session?.opening_balance||0)}`)) return;

    const { error } = await supabase.from('caja_sessions').upsert({
      date: todayStr,
      closing_balance: totalHoy,
      status: 'closed'
    }, { onConflict: 'date' });

    if (error) return Helpers.toast('Error: ' + error.message, 'error');
    Helpers.toast('Caja cerrada correctamente', 'success');
    this.loadStudents();
  },

  // ── DEVOLUCIÓN DE EFECTIVO ────────────────────────────────────────────────
  async _openCashReturn() {
    const modalId = 'cashReturnModal_' + Date.now();
    const overlay = document.createElement('div');
    overlay.id = modalId;
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);backdrop-filter:blur(6px);z-index:9998;display:flex;align-items:center;justify-content:center;padding:12px';
    overlay.onclick = e => { if(e.target===overlay) overlay.remove(); };
    overlay.innerHTML = `
    <div style="background:white;border-radius:16px;width:100%;max-width:420px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <div style="background:linear-gradient(135deg,#EF4444,#DC2626);padding:14px 18px;display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:32px;height:32px;border-radius:8px;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center">
            <i data-lucide="banknote" style="width:16px;height:16px;color:white"></i>
          </div>
          <span style="font-weight:900;font-size:.9rem;color:white">Devolución de Efectivo</span>
        </div>
        <button onclick="document.getElementById('${modalId}').remove()" style="width:28px;height:28px;border-radius:50%;border:none;background:rgba(255,255,255,.2);color:white;cursor:pointer;font-size:.9rem">✕</button>
      </div>
      <div style="padding:18px;display:flex;flex-direction:column;gap:12px">
        <input id="crStudent" placeholder="Nombre del estudiante / responsable" style="padding:10px 14px;border:2px solid #e2e8f0;border-radius:10px;font-size:.8rem;font-weight:700;outline:none">
        <input id="crAmount" type="number" placeholder="Monto a devolver (RD$)" style="padding:10px 14px;border:2px solid #e2e8f0;border-radius:10px;font-size:.8rem;font-weight:700;outline:none">
        <input id="crConcept" placeholder="Motivo de la devolución" style="padding:10px 14px;border:2px solid #e2e8f0;border-radius:10px;font-size:.8rem;font-weight:700;outline:none">
        <select id="crOriginalMethod" style="padding:10px 14px;border:2px solid #e2e8f0;border-radius:10px;font-size:.8rem;font-weight:700;outline:none">
          <option value="efectivo">Efectivo original</option>
          <option value="transferencia">Transferencia</option>
          <option value="tarjeta">Tarjeta</option>
        </select>
        <button onclick="CajaCobroV2._confirmCashReturn('${modalId}')" style="padding:12px;border-radius:10px;border:none;background:#EF4444;color:white;font-size:.8rem;font-weight:900;cursor:pointer">Confirmar Devolución</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    if (window.lucide) lucide.createIcons();
  },

  async _confirmCashReturn(modalId) {
    const student = document.getElementById('crStudent')?.value?.trim();
    const amount  = Number(document.getElementById('crAmount')?.value || 0);
    const concept = document.getElementById('crConcept')?.value?.trim();
    if (!student || !amount) return Helpers.toast('Completa todos los campos', 'warning');

    const { error } = await supabase.from('payments').insert({
      amount: -Math.abs(amount),
      concept: `Devolución: ${concept || 'Efectivo'}`,
      method: 'efectivo',
      status: 'paid',
      paid_date: new Date().toISOString(),
      notes: `DEVOLUCION|Estudiante:${student}|Motivo:${concept||'N/A'}`,
      exclude_dgii: true
    });

    if (error) return Helpers.toast('Error: ' + error.message, 'error');
    document.getElementById(modalId)?.remove();
    Helpers.toast(`Devolución de ${fmt(amount)} registrada`, 'success');
    this.loadStudents();
  },

  // ── INTEGRACIÓN CONTABILIDAD: Registrar cobro en libro diario ─────────────
  async _logToAccounting(paymentData) {
    try {
      await supabase.from('accounting_journal').insert({
        fecha: today(),
        ref: `PAY-${paymentData.id}`.slice(0,12),
        descripcion: `Cobro ${paymentData.concept || 'Mensualidad'} — ${paymentData.student_name || ''}`,
        cuenta_debe: paymentData.method === 'efectivo' ? '111 Caja' : '121 Banco Popular',
        monto_debe: paymentData.amount,
        cuenta_haber: '411 Ingresos por Mensualidades',
        monto_haber: paymentData.amount,
        tipo: 'ingreso',
        payment_id: paymentData.id
      }).catch(() => {});
    } catch(_) {}
  }
};

// ── CARGAR CONCEPTOS DE LA BASE DE DATOS ────────────────────────────────────
async function _loadDbConcepts() {
  try {
    const { data, error } = await supabase
      .from('payment_concepts')
      .select('*')
      .order('name');
    if (error) throw error;
    _dbConcepts = data || [];
    // Save to localStorage as cache
    if (_dbConcepts.length > 0) {
      saveCatalog(_dbConcepts.map(c => ({
        id: 'db_' + c.id,
        label: c.name,
        amount: c.amount,
        icon: '🏷️'
      })));
    }
  } catch (e) {
    _dbConcepts = [];
  }
}
