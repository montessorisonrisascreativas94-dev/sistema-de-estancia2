/**
 * Caja Cobro — Panel Asistente
 * Flujo: Buscar alumno → Expediente → Carrito → Método → Confirmar → Factura
 */
import { supabase } from '../shared/supabase.js';
import { Helpers } from '../shared/helpers.js';
import { AppState } from './state.js';
import { InvoiceModule } from '../shared/invoice.js';

const fmt  = n => 'RD$' + Number(n||0).toLocaleString('es-DO',{minimumFractionDigits:2});
const fmtN = n => Number(n||0).toLocaleString('es-DO',{minimumFractionDigits:2});

// ── Carrito en memoria ────────────────────────────────────────────────────────
let _cart     = [];   // [{id, label, amount, type, chargeId?}]
let _student  = null; // objeto estudiante actual
let _mora     = 0;    // mora calculada total del carrito

function _calcMoraClient(dueDate) {
  if (!dueDate) return 0;
  const due  = new Date(dueDate+'T00:00:00');
  const now  = new Date(); now.setHours(0,0,0,0);
  const days = Math.floor((now-due)/86400000);
  if (days<=0) return 0;
  return (Math.floor(days/7)*500)+(days%7*50);
}

function _cartTotal() {
  return _cart.reduce((s,i)=>s+i.amount,0) + _mora;
}

// ── RENDER PRINCIPAL ──────────────────────────────────────────────────────────
export function renderCajaCobro() {
  const section = document.getElementById('pagos');
  if (!section) return;

  section.innerHTML = `
  <style>
    .cc-tab{padding:8px 20px;border-radius:12px;border:2px solid transparent;font-weight:800;font-size:.75rem;cursor:pointer;transition:all .15s;text-transform:uppercase;letter-spacing:.06em}
    .cc-tab.active{background:#0D9488;color:white;border-color:#0D9488}
    .cc-tab:not(.active){background:white;color:#64748b;border-color:#e2e8f0}
    .cc-tab:not(.active):hover{background:#f0fdfa;border-color:#0D9488;color:#0D9488}
    .charge-item{display:flex;align-items:center;gap:10px;padding:12px 14px;background:white;border:1px solid #f1f5f9;border-radius:14px;transition:all .15s}
    .charge-item:hover{border-color:#0D9488;box-shadow:0 2px 8px rgba(13,148,136,.1)}
    .cart-item{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#f0fdfa;border:1px solid #ccfbf1;border-radius:12px}
    .method-btn{flex:1;padding:12px;border:2px solid #e2e8f0;border-radius:14px;background:white;cursor:pointer;font-weight:800;font-size:.8rem;text-align:center;transition:all .15s}
    .method-btn.selected{border-color:#0D9488;background:#f0fdfa;color:#0D9488}
    .method-btn:hover:not(.selected){border-color:#0D9488;background:#f0fdfa}
  </style>

  <!-- TABS -->
  <div class="flex items-center gap-3 mb-6 flex-wrap">
    <button class="cc-tab active" id="tabCobrar" onclick="CajaCobro.showTab('cobrar')">
      💳 Cobrar
    </button>
    <button class="cc-tab" id="tabHistorial" onclick="CajaCobro.showTab('historial')">
      📋 Historial
    </button>
    <div class="ml-auto flex gap-2">
      <button id="btnExportInvoices" class="flex items-center gap-2 px-3 py-2 text-white text-xs font-black uppercase rounded-xl" style="background:#7c3aed">
        <i data-lucide="file-down" class="w-4 h-4"></i> Exportar
      </button>
    </div>
  </div>

  <!-- PANEL COBRAR -->
  <div id="panelCobrar">
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">

      <!-- COLUMNA IZQUIERDA: Buscar + Expediente -->
      <div class="lg:col-span-2 space-y-4">

        <!-- Buscador -->
        <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 class="text-sm font-black text-slate-700 mb-3 uppercase tracking-wider">Buscar Alumno</h3>
          <div class="flex gap-2">
            <div class="relative flex-1">
              <i data-lucide="search" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"></i>
              <input id="ccSearch" type="text" placeholder="Nombre, matrícula, teléfono del padre..."
                class="w-full pl-9 pr-4 py-3 border-2 border-slate-100 rounded-xl text-sm font-medium outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-50 transition-all"
                oninput="CajaCobro.search(this.value)">
            </div>
            <button onclick="CajaCobro.scanQR()" class="px-4 py-3 border-2 border-slate-100 rounded-xl hover:border-teal-500 hover:bg-teal-50 transition-all" title="Escanear QR">
              <i data-lucide="qr-code" class="w-5 h-5 text-slate-500"></i>
            </button>
          </div>
          <div id="ccSearchResults" class="mt-3 space-y-2 max-h-64 overflow-y-auto"></div>
        </div>

        <!-- Expediente del alumno -->
        <div id="ccExpediente" class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hidden">
          <div id="ccStudentHeader" class="flex items-center gap-4 mb-5 pb-4 border-b border-slate-100">
            <!-- Llenado dinámicamente -->
          </div>
          <div id="ccChargesList" class="space-y-2">
            <!-- Cuotas pendientes -->
          </div>
          <!-- Conceptos adicionales -->
          <div class="mt-4">
            <button onclick="CajaCobro.addCustomConcept()" class="w-full py-2.5 border-2 border-dashed border-slate-200 rounded-xl text-xs font-black text-slate-400 hover:border-teal-400 hover:text-teal-600 hover:bg-teal-50 transition-all uppercase tracking-wider">
              + Agregar concepto personalizado
            </button>
          </div>
        </div>

      </div>

      <!-- COLUMNA DERECHA: Carrito -->
      <div class="space-y-4">
        <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 sticky top-4">
          <h3 class="text-sm font-black text-slate-700 mb-4 uppercase tracking-wider flex items-center gap-2">
            <i data-lucide="shopping-cart" class="w-4 h-4 text-teal-600"></i> Carrito
            <span id="ccCartCount" class="ml-auto text-xs font-black text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full">0 items</span>
          </h3>

          <div id="ccCartItems" class="space-y-2 min-h-16">
            <div class="text-center py-6 text-slate-300 text-sm font-bold">
              <i data-lucide="shopping-cart" class="w-8 h-8 mx-auto mb-2 opacity-40"></i>
              Selecciona conceptos
            </div>
          </div>

          <!-- Mora si aplica -->
          <div id="ccMoraRow" class="hidden mt-2 flex items-center justify-between text-xs font-bold text-red-600 bg-red-50 rounded-xl px-3 py-2">
            <span>⚠ Mora acumulada</span>
            <span id="ccMoraAmount">RD$0</span>
          </div>

          <!-- Descuento -->
          <div id="ccDiscountRow" class="hidden mt-2 flex items-center justify-between text-xs font-bold text-green-600 bg-green-50 rounded-xl px-3 py-2">
            <span>✓ Descuento aplicado</span>
            <span id="ccDiscountAmount">-RD$0</span>
          </div>

          <!-- Total -->
          <div class="mt-4 pt-4 border-t border-slate-100">
            <div class="flex items-center justify-between mb-1">
              <span class="text-xs font-bold text-slate-400 uppercase">Total a pagar</span>
              <span class="text-2xl font-black text-slate-800" id="ccTotal">RD$0.00</span>
            </div>
          </div>

          <button onclick="CajaCobro.openPaymentModal()"
            class="w-full py-4 mt-4 text-white font-black text-sm uppercase tracking-wider rounded-2xl active:scale-95 transition-all disabled:opacity-40"
            id="btnProceed" disabled
            style="background:linear-gradient(135deg,#0D9488,#0F766E);box-shadow:0 4px 16px rgba(13,148,136,.3)">
            Continuar al Pago →
          </button>
        </div>
      </div>

    </div>
  </div>

  <!-- PANEL HISTORIAL -->
  <div id="panelHistorial" class="hidden">
    ${_historialHTML()}
  </div>
  `;

  if (window.lucide) lucide.createIcons();
}

function _historialHTML() {
  return `
    <div class="space-y-4">
      <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-wrap gap-3 items-center">
        <div class="relative flex-1 min-w-40">
          <i data-lucide="search" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"></i>
          <input id="searchPaymentStudent" type="text" placeholder="Buscar estudiante..."
            class="w-full pl-9 pr-4 py-2 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-medium outline-none focus:border-teal-400">
        </div>
        <select id="filterPaymentMonth" class="px-3 py-2 bg-slate-50 border-2 border-slate-100 rounded-xl text-xs font-black text-slate-600 outline-none">
          <option value="01">Enero</option><option value="02">Febrero</option><option value="03">Marzo</option>
          <option value="04">Abril</option><option value="05">Mayo</option><option value="06">Junio</option>
          <option value="07">Julio</option><option value="08">Agosto</option><option value="09">Septiembre</option>
          <option value="10">Octubre</option><option value="11">Noviembre</option><option value="12">Diciembre</option>
        </select>
        <select id="filterPaymentYear" class="px-3 py-2 bg-slate-50 border-2 border-slate-100 rounded-xl text-xs font-black text-slate-600 outline-none">
          <option value="2025">2025</option><option value="2026" selected>2026</option><option value="2027">2027</option>
        </select>
        <select id="filterPaymentStatus" class="px-3 py-2 bg-slate-50 border-2 border-slate-100 rounded-xl text-xs font-black text-slate-600 outline-none">
          <option value="all">Todos</option><option value="paid">Pagado</option>
          <option value="pending">Pendiente</option><option value="overdue">Vencido</option>
        </select>
        <button id="btnRefreshPayments" class="p-2 text-slate-400 hover:text-teal-600 rounded-xl border border-slate-100 transition-all">
          <i data-lucide="refresh-cw" class="w-4 h-4"></i>
        </button>
      </div>
      <!-- KPIs compactos -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div class="bg-white rounded-xl p-3 border border-slate-100 shadow-sm text-center">
          <p class="text-lg font-black text-green-600" id="kpiIncomeMonth">RD$0</p>
          <p class="text-[9px] font-black text-slate-400 uppercase mt-0.5">Ingresos Mes</p>
        </div>
        <div class="bg-white rounded-xl p-3 border border-slate-100 shadow-sm text-center">
          <p class="text-lg font-black text-amber-600" id="kpiPendingCount">0</p>
          <p class="text-[9px] font-black text-slate-400 uppercase mt-0.5">Pendientes</p>
        </div>
        <div class="bg-white rounded-xl p-3 border border-slate-100 shadow-sm text-center">
          <p class="text-lg font-black text-blue-600" id="kpiReviewCount">0</p>
          <p class="text-[9px] font-black text-slate-400 uppercase mt-0.5">En Revisión</p>
        </div>
        <div class="bg-white rounded-xl p-3 border border-slate-100 shadow-sm text-center">
          <p class="text-lg font-black text-red-600" id="kpiOverdueCount">0</p>
          <p class="text-[9px] font-black text-slate-400 uppercase mt-0.5">Vencidos</p>
        </div>
      </div>
      <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <table class="w-full text-sm" style="min-width:600px">
          <thead class="bg-slate-50 border-b border-slate-100">
            <tr>
              <th class="px-5 py-3 text-left text-[10px] font-black text-slate-400 uppercase">Estudiante</th>
              <th class="px-5 py-3 text-center text-[10px] font-black text-slate-400 uppercase">Estado</th>
              <th class="px-5 py-3 text-right text-[10px] font-black text-slate-400 uppercase">Monto</th>
              <th class="px-5 py-3 text-[10px] font-black text-slate-400 uppercase">Método</th>
              <th class="px-5 py-3 text-[10px] font-black text-slate-400 uppercase">Mes</th>
              <th class="px-5 py-3 text-[10px] font-black text-slate-400 uppercase">Fecha</th>
              <th class="px-5 py-3 text-center text-[10px] font-black text-slate-400 uppercase">Voucher</th>
              <th class="px-5 py-3 text-center text-[10px] font-black text-slate-400 uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody id="paymentsTableBody" class="divide-y divide-slate-50 bg-white">
            <tr><td colspan="8" class="text-center py-8 text-slate-400 text-sm">Cargando...</td></tr>
          </tbody>
        </table>
      </div>
    </div>`;
}

// ── FUNCIONES DE BÚSQUEDA ─────────────────────────────────────────────────────
const _searchDebounced = Helpers.debounce(async (q) => {
  const res = document.getElementById('ccSearchResults');
  if (!res) return;
  if (!q || q.length < 2) { res.innerHTML=''; return; }

  res.innerHTML = '<div class="text-xs text-slate-400 py-2 text-center">Buscando...</div>';

  const { data } = await supabase.from('students')
    .select('id,name,matricula,p1_name,p1_phone,classroom_id,classrooms:classroom_id(name),monthly_fee')
    .or(`name.ilike.%${q}%,matricula.ilike.%${q}%,p1_phone.ilike.%${q}%,p1_name.ilike.%${q}%`)
    .eq('is_active',true).is('deleted_at',null).limit(10);

  if (!data?.length) { res.innerHTML='<div class="text-xs text-slate-400 py-3 text-center">Sin resultados</div>'; return; }

  res.innerHTML = data.map(s => `
    <button onclick="CajaCobro.selectStudent(${s.id})"
      class="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:border-teal-400 hover:bg-teal-50 transition-all text-left group">
      <div class="w-9 h-9 rounded-xl flex items-center justify-center font-black text-white text-sm shrink-0" style="background:#0D9488">
        ${s.name.charAt(0).toUpperCase()}
      </div>
      <div class="flex-1 min-w-0">
        <div class="font-black text-slate-800 text-sm truncate">${Helpers.escapeHTML(s.name)}</div>
        <div class="text-[10px] text-slate-400 uppercase">${s.classrooms?.name||'Sin aula'} · ${s.matricula||'Sin matrícula'}</div>
      </div>
      <i data-lucide="chevron-right" class="w-4 h-4 text-slate-300 group-hover:text-teal-600 shrink-0"></i>
    </button>`).join('');
  if (window.lucide) lucide.createIcons();
}, 300);

export const CajaCobro = {
  showTab(tab) {
    document.getElementById('tabCobrar')?.classList.toggle('active', tab==='cobrar');
    document.getElementById('tabHistorial')?.classList.toggle('active', tab==='historial');
    document.getElementById('panelCobrar')?.classList.toggle('hidden', tab!=='cobrar');
    document.getElementById('panelHistorial')?.classList.toggle('hidden', tab!=='historial');
    if (tab==='historial') {
      import('./payments.js').then(m => m.PaymentsModule.init()).catch(()=>{});
      if (window.lucide) lucide.createIcons();
    }
  },

  search(q) { _searchDebounced(q); },

  async selectStudent(studentId) {
    _cart = []; _mora = 0; _student = null;
    this._updateCart();

    const { data: stu } = await supabase.from('students')
      .select('id,name,matricula,p1_name,p1_phone,monthly_fee,classroom_id,classrooms:classroom_id(name,level)')
      .eq('id',studentId).single();

    if (!stu) return;
    _student = stu;

    // Limpiar búsqueda
    const si = document.getElementById('ccSearch');
    if (si) si.value = stu.name;
    const sr = document.getElementById('ccSearchResults');
    if (sr) sr.innerHTML='';

    // Mostrar expediente
    const exp = document.getElementById('ccExpediente');
    if (exp) exp.classList.remove('hidden');

    // Header del alumno
    const hdr = document.getElementById('ccStudentHeader');
    if (hdr) {
      // Cargar resumen financiero
      const { data: sum } = await supabase.rpc('get_student_financial_summary',{p_student_id:studentId}).single().catch(()=>({data:null}));
      const paid    = sum?.paid_amount   || 0;
      const pending = sum?.pending_amount|| 0;
      const cycle   = sum?.school_year_name || '—';
      const plan    = sum?.payment_plan  || stu.monthly_fee ? `Plan C · RD${fmtN(stu.monthly_fee)}/mes` : '—';

      hdr.innerHTML = `
        <div class="w-14 h-14 rounded-2xl flex items-center justify-center font-black text-white text-xl shrink-0" style="background:#0D9488">
          ${stu.name.charAt(0)}
        </div>
        <div class="flex-1 min-w-0">
          <h3 class="text-lg font-black text-slate-800 truncate">${Helpers.escapeHTML(stu.name)}</h3>
          <div class="flex flex-wrap gap-3 mt-1 text-xs font-bold text-slate-500">
            <span>📚 ${stu.classrooms?.name||'—'}</span>
            <span>🎓 ${stu.classrooms?.level||'—'}</span>
            <span>💳 ${plan}</span>
          </div>
        </div>
        <div class="text-right shrink-0">
          <div class="text-xs font-black text-slate-400 uppercase">Balance pendiente</div>
          <div class="text-xl font-black ${pending>0?'text-red-600':'text-green-600'}">${fmt(pending)}</div>
          <div class="text-[10px] text-slate-400">${cycle}</div>
        </div>`;
    }

    // Cargar cuotas pendientes
    await this._loadCharges(studentId);
    if (window.lucide) lucide.createIcons();
  },

  async _loadCharges(studentId) {
    const list = document.getElementById('ccChargesList');
    if (!list) return;
    list.innerHTML = '<div class="text-xs text-slate-400 py-3 text-center animate-pulse">Cargando cuotas...</div>';

    // Primero intentar student_charges del plan
    const { data: enrollments } = await supabase.from('student_enrollments')
      .select('id').eq('student_id',studentId).order('created_at',{ascending:false}).limit(1);

    let charges = [];
    if (enrollments?.[0]?.id) {
      const { data: sc } = await supabase.from('student_charges')
        .select('id,concept,type,amount,due_date,status')
        .eq('student_enrollment_id',enrollments[0].id)
        .in('status',['pending','overdue'])
        .order('due_date').limit(20);
      charges = sc||[];
    }

    // Fallback: payments pendientes
    if (!charges.length) {
      const { data: pp } = await supabase.from('payments')
        .select('id,concept,amount,due_date,status,month_paid')
        .eq('student_id',studentId)
        .in('status',['pending','overdue'])
        .order('due_date').limit(15);
      charges = (pp||[]).map(p=>({...p, type:'colegiatura', chargeType:'payment'}));
    }

    if (!charges.length) {
      list.innerHTML='<div class="text-center py-5 text-green-600 font-bold text-sm">✅ Sin cuotas pendientes</div>';
      return;
    }

    const today = new Date(); today.setHours(0,0,0,0);
    list.innerHTML = `
      <div class="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">Cuotas pendientes — clic para agregar al carrito</div>
      ${charges.map(c => {
        const mora = _calcMoraClient(c.due_date);
        const daysO = c.due_date ? Math.max(0,Math.floor((today-new Date(c.due_date+'T00:00:00'))/86400000)) : 0;
        const overdue = daysO > 0;
        return `<div class="charge-item ${overdue?'border-red-100':''}">
          <div class="flex-1 min-w-0">
            <div class="font-black text-slate-700 text-sm truncate">${Helpers.escapeHTML(c.concept||c.type||'—')}</div>
            <div class="text-[10px] text-slate-400">${c.due_date||''} ${overdue?`<span class="text-red-500 font-black">· ${daysO}d vencido</span>`:''}</div>
          </div>
          <div class="text-right mr-2">
            <div class="font-black text-slate-800 text-sm">${fmt(c.amount)}</div>
            ${mora>0?`<div class="text-[9px] font-black text-red-500">+${fmt(mora)} mora</div>`:''}
          </div>
          <button onclick="CajaCobro.addToCart(${JSON.stringify({id:c.id||null,label:c.concept||c.type,amount:c.amount,mora,type:c.type,chargeId:c.id}).replace(/"/g,"'")})"
            class="shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all hover:scale-110 active:scale-90"
            style="background:#0D9488;color:white">
            <i data-lucide="plus" class="w-4 h-4"></i>
          </button>
        </div>`;
      }).join('')}`;
    if (window.lucide) lucide.createIcons();
  },

  addToCart(item) {
    // Evitar duplicados
    if (_cart.find(c=>c.id===item.id&&item.id)) {
      Helpers.toast('Ya está en el carrito','info'); return;
    }
    _cart.push(item);
    _mora = _cart.reduce((s,i)=>s+(i.mora||0),0);
    this._updateCart();
    Helpers.toast(`${item.label} agregado`,'success');
  },

  removeFromCart(idx) {
    _cart.splice(idx,1);
    _mora = _cart.reduce((s,i)=>s+(i.mora||0),0);
    this._updateCart();
  },

  _updateCart() {
    const cartEl = document.getElementById('ccCartItems');
    const countEl= document.getElementById('ccCartCount');
    const totalEl= document.getElementById('ccTotal');
    const moraRow= document.getElementById('ccMoraRow');
    const moraAmt= document.getElementById('ccMoraAmount');
    const btn    = document.getElementById('btnProceed');

    if (!cartEl) return;

    if (!_cart.length) {
      cartEl.innerHTML=`<div class="text-center py-6 text-slate-300 text-sm font-bold">
        <i data-lucide="shopping-cart" class="w-8 h-8 mx-auto mb-2 opacity-40"></i>Selecciona conceptos</div>`;
      if(countEl) countEl.textContent='0 items';
      if(totalEl) totalEl.textContent='RD$0.00';
      if(moraRow) moraRow.classList.add('hidden');
      if(btn) btn.disabled=true;
      if(window.lucide) lucide.createIcons();
      return;
    }

    cartEl.innerHTML = _cart.map((item,i)=>`
      <div class="cart-item">
        <div class="flex-1 min-w-0">
          <div class="text-sm font-black text-slate-700 truncate">${Helpers.escapeHTML(item.label)}</div>
          ${item.mora>0?`<div class="text-[9px] text-red-500 font-bold">+mora ${fmt(item.mora)}</div>`:''}
        </div>
        <div class="font-black text-teal-700 mx-3">${fmt(item.amount+(item.mora||0))}</div>
        <button onclick="CajaCobro.removeFromCart(${i})" class="w-6 h-6 rounded-lg bg-red-50 text-red-400 hover:bg-red-100 flex items-center justify-center transition-all">
          <i data-lucide="x" class="w-3 h-3"></i>
        </button>
      </div>`).join('');

    const total = _cartTotal();
    if(countEl) countEl.textContent=`${_cart.length} item${_cart.length!==1?'s':''}`;
    if(totalEl) totalEl.textContent=fmt(total);
    if(moraRow) { moraRow.classList.toggle('hidden',_mora===0); }
    if(moraAmt) moraAmt.textContent=fmt(_mora);
    if(btn) btn.disabled=false;
    if(window.lucide) lucide.createIcons();
  },

  async addCustomConcept() {
    const label  = prompt('Concepto:','Otro');       if(!label?.trim()) return;
    const amount = parseFloat(prompt('Monto (RD$):','0')||'0');
    if(!amount||amount<=0) return;
    this.addToCart({id:null,label:label.trim(),amount,mora:0,type:'otro'});
  },

  scanQR() { Helpers.toast('Función QR disponible desde el terminal de ponche','info'); },
};

// ── MODAL DE PAGO ─────────────────────────────────────────────────────────────
CajaCobro.openPaymentModal = function() {
  if (!_student || !_cart.length) return;
  const total = _cartTotal();

  const modalHTML = `
    <div class="rounded-3xl overflow-hidden">
      <div class="p-6 text-white" style="background:linear-gradient(135deg,#0D9488,#0F766E)">
        <h3 class="text-xl font-black">Confirmar Pago</h3>
        <p class="text-xs text-teal-100 font-bold mt-1 uppercase tracking-wider">${Helpers.escapeHTML(_student.name)}</p>
      </div>
      <div class="p-6 space-y-5 bg-slate-50/40">
        <!-- Resumen carrito -->
        <div class="bg-white rounded-2xl border border-slate-100 p-4">
          <div class="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3">Conceptos</div>
          <div class="space-y-2">
            ${_cart.map(i=>`<div class="flex justify-between text-sm"><span class="font-bold text-slate-700">${Helpers.escapeHTML(i.label)}</span><span class="font-black text-slate-800">${fmt(i.amount+(i.mora||0))}</span></div>`).join('')}
            ${_mora>0?`<div class="flex justify-between text-sm text-red-600"><span class="font-bold">Mora total</span><span class="font-black">${fmt(_mora)}</span></div>`:''}
            <div class="flex justify-between text-base border-t border-slate-100 pt-2 mt-2">
              <span class="font-black text-slate-800">TOTAL</span>
              <span class="font-black text-teal-700">${fmt(total)}</span>
            </div>
          </div>
        </div>

        <!-- Método de pago -->
        <div>
          <div class="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3">Método de Pago</div>
          <div class="grid grid-cols-2 sm:grid-cols-5 gap-2" id="methodBtns">
            ${[{v:'efectivo',l:'💵 Efectivo'},{v:'transferencia',l:'🏦 Transferencia'},{v:'tarjeta',l:'💳 Tarjeta'},{v:'cheque',l:'📝 Cheque'},{v:'mixto',l:'🔀 Mixto'}]
              .map(m=>`<button onclick="CajaCobro._selectMethod('${m.v}')" data-method="${m.v}" class="method-btn text-xs">${m.l}</button>`).join('')}
          </div>
        </div>

        <!-- Detalle método (condicional) -->
        <div id="methodDetail" class="hidden bg-white rounded-2xl border border-slate-100 p-4 space-y-3">
          <!-- Se llena según el método -->
        </div>

        <!-- NCF opcional -->
        <details class="border border-slate-200 rounded-xl overflow-hidden">
          <summary class="px-4 py-3 text-xs font-black text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-50">
            ¿Requiere Comprobante Fiscal (NCF)?
          </summary>
          <div class="p-4 grid grid-cols-2 gap-3 bg-white">
            <div>
              <label class="text-[9px] font-black text-slate-400 uppercase block mb-1">Nombre / Empresa</label>
              <input id="ncfName" type="text" class="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-teal-400" placeholder="Nombre o razón social">
            </div>
            <div>
              <label class="text-[9px] font-black text-slate-400 uppercase block mb-1">RNC / Cédula</label>
              <input id="ncfRNC" type="text" class="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-teal-400" placeholder="1-01-00001-6">
            </div>
          </div>
        </details>
      </div>
      <div class="p-5 bg-white border-t border-slate-100 flex justify-end gap-3">
        <button onclick="document.getElementById('globalModalContainer').style.display='none'" class="px-5 py-2.5 text-slate-500 font-bold text-xs uppercase border border-slate-200 rounded-2xl">Cancelar</button>
        <button id="btnConfirmPago" onclick="CajaCobro.confirmPayment()" disabled
          class="px-6 py-2.5 text-white font-black text-xs uppercase rounded-2xl active:scale-95 disabled:opacity-40"
          style="background:#0D9488;box-shadow:0 4px 12px rgba(13,148,136,.3)">
          ✓ Confirmar y Emitir Factura
        </button>
      </div>
    </div>`;

  const c = document.getElementById('globalModalContainer');
  if (c) {
    c.innerHTML = `<div class="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto mx-3">${modalHTML}</div>`;
    c.style.cssText = 'display:flex;align-items:flex-start;justify-content:center;padding-top:4vh;position:fixed;inset:0;background:rgba(0,0,0,0.55);backdrop-filter:blur(8px);z-index:9999;overflow-y:auto;';
    if (window.lucide) lucide.createIcons();
  }
};

CajaCobro._selectMethod = function(method) {
  document.querySelectorAll('[data-method]').forEach(b=>b.classList.remove('selected'));
  document.querySelector(`[data-method="${method}"]`)?.classList.add('selected');
  AppState.set('payMethod', method);

  const detail = document.getElementById('methodDetail');
  const btn    = document.getElementById('btnConfirmPago');
  if (btn) btn.disabled = false;

  const ic = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold outline-none focus:border-teal-400';

  const detailMap = {
    transferencia: `
      <div class="text-[9px] font-black text-slate-400 uppercase mb-2">Datos de la transferencia</div>
      <input id="payBank" type="text" class="${ic}" placeholder="Banco (Ej: BanReservas)">
      <input id="payRef"  type="text" class="${ic} mt-2" placeholder="Número de referencia">
      <input id="payDate" type="date" class="${ic} mt-2">`,
    tarjeta: `
      <div class="text-[9px] font-black text-slate-400 uppercase mb-2">Datos de tarjeta</div>
      <input id="payBank" type="text" class="${ic}" placeholder="Entidad bancaria">
      <input id="payRef"  type="text" class="${ic} mt-2" placeholder="Últimos 4 dígitos">
      <input id="payAuth" type="text" class="${ic} mt-2" placeholder="Número de autorización">`,
    cheque: `
      <div class="text-[9px] font-black text-slate-400 uppercase mb-2">Datos del cheque</div>
      <input id="payBank"   type="text" class="${ic}" placeholder="Banco">
      <input id="payRef"    type="text" class="${ic} mt-2" placeholder="Número de cheque">
      <input id="payHolder" type="text" class="${ic} mt-2" placeholder="Titular del cheque">`,
    mixto: `
      <div class="text-[9px] font-black text-slate-400 uppercase mb-2">Pago mixto — indica los montos</div>
      <div class="grid grid-cols-2 gap-2">
        <div><label class="text-[9px] text-slate-400 font-bold block mb-1">Efectivo</label><input id="mixCash" type="number" class="${ic}" placeholder="0.00"></div>
        <div><label class="text-[9px] text-slate-400 font-bold block mb-1">Transferencia</label><input id="mixTransfer" type="number" class="${ic}" placeholder="0.00"></div>
      </div>`,
  };

  if (detailMap[method]) {
    detail.classList.remove('hidden');
    detail.innerHTML = detailMap[method];
  } else {
    detail.classList.add('hidden');
  }
};

CajaCobro.confirmPayment = async function() {
  const btn = document.getElementById('btnConfirmPago');
  if (btn) { btn.disabled=true; btn.textContent='Procesando...'; }

  const method   = AppState.get('payMethod') || 'efectivo';
  const bank     = document.getElementById('payBank')?.value?.trim()||null;
  const ref      = document.getElementById('payRef')?.value?.trim()||null;
  const ncfName  = document.getElementById('ncfName')?.value?.trim()||null;
  const ncfRNC   = document.getElementById('ncfRNC')?.value?.trim()||null;
  const notes    = ncfRNC ? `NCF: ${ncfRNC} | ${ncfName||''}` : null;

  try {
    // Registrar cada cuota del carrito
    const paymentIds = [];
    for (const item of _cart) {
      const totalItem = item.amount + (item.mora||0);
      const { data: pay, error } = await supabase.from('payments').insert({
        student_id: _student.id,
        amount:     totalItem,
        concept:    item.label,
        method,
        bank:       bank||null,
        reference:  ref||null,
        status:    'paid',
        paid_date:  new Date().toISOString(),
        notes,
        created_at: new Date().toISOString(),
      }).select().single();

      if (error) throw error;
      paymentIds.push(pay.id);

      // Marcar student_charge como pagado si aplica
      if (item.chargeId) {
        await supabase.from('student_charges')
          .update({status:'paid',paid_date:new Date().toISOString()})
          .eq('id',item.chargeId);
      }
    }

    // Cerrar modal
    const c = document.getElementById('globalModalContainer');
    if (c) { c.style.display='none'; c.innerHTML=''; }

    // Generar factura PDF
    InvoiceModule.downloadSingle({
      id: paymentIds[0],
      students: {
        name: _student.name,
        classrooms: { name: _student.classrooms?.name||'' },
        p1_name: _student.p1_name||'',
        fiscal_name: ncfName,
        fiscal_rnc:  ncfRNC,
      },
      concept:    _cart.map(i=>i.label).join(', '),
      amount:     _cartTotal() - _mora,
      mora_amount:_mora,
      method,
      bank,
      reference:  ref,
      paid_date:  new Date().toISOString(),
      status:     'paid',
    });

    Helpers.toast(`Pago registrado para ${_student.name}. Factura generada.`, 'success');

    // Resetear carrito y expediente
    _cart=[]; _mora=0; _student=null;
    this._updateCart();
    document.getElementById('ccExpediente')?.classList.add('hidden');
    const si=document.getElementById('ccSearch'); if(si) si.value='';

  } catch(e) {
    Helpers.toast('Error: '+(e.message||e),'error');
    if (btn) { btn.disabled=false; btn.textContent='✓ Confirmar y Emitir Factura'; }
  }
};

// Exponer globalmente
window.CajaCobro = CajaCobro;
