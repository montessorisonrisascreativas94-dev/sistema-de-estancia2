/**
 * Caja Cobro — Panel Asistente (Rediseño)
 */
import { supabase } from '../shared/supabase.js';
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
  students: []
};

const $el = id => document.getElementById(id);

export function renderCajaCobro() {
  const section = $el('pagos');
  if (!section) return;

  section.innerHTML = `
  <div class="space-y-5">
    <!-- Header -->
    <div class="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h2 class="text-xl font-black text-slate-800">Caja</h2>
        <p class="text-xs text-slate-400 font-bold uppercase tracking-wider">Gestión de pagos y cobros</p>
      </div>
    </div>

    <!-- Cobros Pendientes -->
    <div class="bg-white rounded-2xl border border-slate-100 p-5">
      <div class="flex items-center justify-between flex-wrap gap-3 mb-4 pb-4 border-b border-slate-100">
        <div>
          <h3 class="text-lg font-black text-slate-800">📅 ${months[new Date().getMonth()]} ${new Date().getFullYear()}</h3>
          <p class="text-sm text-slate-400 font-bold">Estudiantes con pagos pendientes</p>
        </div>
        <div class="flex items-center gap-2">
          <div class="relative flex-1">
            <i data-lucide="search" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"></i>
            <input id="cajaSearch" type="text" placeholder="Buscar estudiante..." oninput="CajaCobro._applyFilters()"
              class="w-full pl-9 pr-4 py-2 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-teal-500">
          </div>
        </div>
      </div>

      <!-- Total pendientes -->
      <div class="mb-4 p-3 rounded-xl" style="background: linear-gradient(135deg, #ccfbf1, #5eead4)">
        <div class="text-xs font-black text-teal-800 uppercase">Total pendientes</div>
        <div class="text-2xl font-black text-teal-900" id="totalPendientes">0 estudiantes</div>
      </div>

      <!-- Table -->
      <div class="overflow-x-auto">
        <table class="w-full text-sm" style="min-width: 800px">
          <thead class="bg-slate-50 border-b border-slate-100">
            <tr>
              <th class="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase">Estado</th>
              <th class="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase">Estudiante</th>
              <th class="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase">Curso</th>
              <th class="px-4 py-3 text-right text-[10px] font-black text-slate-400 uppercase">Debe</th>
              <th class="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase">Vence</th>
              <th class="px-4 py-3 text-center text-[10px] font-black text-slate-400 uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody id="cajaTableBody" class="divide-y divide-slate-50">
            <tr><td colspan="6" class="text-center py-8 text-slate-400 text-sm">Cargando...</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Transferencias pendientes -->
    <div class="bg-white rounded-2xl border border-slate-100 p-5">
      <h3 class="text-lg font-black text-slate-800 mb-4">🏦 Transferencias Pendientes</h3>
      <div id="transferenciasPendientes" class="space-y-3">
        <div class="text-center py-4 text-slate-400 text-sm">Sin transferencias pendientes</div>
      </div>
    </div>
  </div>
  `;
  if (window.lucide) lucide.createIcons();
  _loadStudents();
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
      const totalOwed = charges.reduce((sum, c) => sum + (c.amount || 0), 0);
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
  } catch (e) {
    console.error('Error loading students', e);
  }
}

function _renderTable(students) {
  const tbody = $el('cajaTableBody');
  if (!tbody) return;
  tbody.innerHTML = students.length ? students.map(s => {
    const statusColor = s.status === 'overdue' ? 'red' : s.status === 'pending' ? 'yellow' : 'green';
    const statusLabel = s.status === 'overdue' ? '🔴 Vencido' : s.status === 'pending' ? '🟡 Pendiente' : '🟢 Al día';
    return `
      <tr class="hover:bg-slate-50 transition-colors">
        <td class="px-4 py-3">
          <span class="text-xs font-black text-${statusColor}-600 bg-${statusColor}-50 px-2 py-1 rounded-full">${statusLabel}</span>
        </td>
        <td class="px-4 py-3 font-bold text-slate-800">${Helpers.escapeHTML(s.name || '—')}</td>
        <td class="px-4 py-3 text-sm text-slate-600">${Helpers.escapeHTML(s.classrooms?.name || '—')}</td>
        <td class="px-4 py-3 text-right font-black text-slate-800">${fmt(s.totalOwed)}</td>
        <td class="px-4 py-3 text-sm text-slate-600">${s.earliestDueDate || '—'}</td>
        <td class="px-4 py-3 text-center">
          ${s.status !== 'paid' ? `
            <button onclick="CajaCobro.selectStudent(${s.id})" class="px-3 py-1 text-xs font-black uppercase text-white rounded-xl" style="background:#0d9488">
              Cobrar
            </button>
          ` : `
            <button class="px-3 py-1 text-xs font-black uppercase text-slate-600 bg-slate-100 rounded-xl">
              Ver
            </button>
          `}
        </td>
      </tr>
    `;
  }).join('') : '<tr><td colspan="6" class="text-center py-8 text-slate-400 text-sm">Sin estudiantes</td></tr>';
  if (window.lucide) lucide.createIcons();
}

export const CajaCobro = {
  _applyFilters() {
    const q = $el('cajaSearch')?.value?.toLowerCase() || '';
    const filtered = _state.students.filter(s => {
      const name = s.name?.toLowerCase();
      const mat = s.matricula?.toLowerCase();
      return (name && name.includes(q)) || (mat && mat.includes(q));
    });
    $el('totalPendientes').textContent = `${filtered.filter(s => s.status !== 'paid').length} estudiantes`;
    _renderTable(filtered);
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
  <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-9999 flex items-center justify-center p-4" id="cajaModalOverlay">
    <div class="bg-white rounded-3xl overflow-hidden w-full max-w-7xl max-h-[95vh] shadow-2xl">
      <div class="p-6 border-b border-slate-100" style="background: linear-gradient(135deg, #0d9488, #0f766e)">
        <div class="flex items-center justify-between flex-wrap gap-4">
          <div class="flex items-center gap-4">
            <div class="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center text-white text-3xl font-black">
              ${s.name.charAt(0).toUpperCase()}
            </div>
            <div class="text-white">
              <h3 class="text-xl font-black">${Helpers.escapeHTML(s.name)}</h3>
              <p class="text-sm font-bold opacity-90">${s.classrooms?.name || '—'} · Matrícula: ${s.matricula || '—'}</p>
              <p class="text-xs font-bold opacity-80 mt-1">Padre/Tutor: ${Helpers.escapeHTML(s.p1_name || '—')}</p>
            </div>
          </div>
          <div class="text-right text-white">
            <div class="text-xs font-bold opacity-80 uppercase">Balance General</div>
            <div class="text-2xl font-black">RD$0</div>
            <div class="text-xs opacity-80 mt-1">Último pago: —</div>
          </div>
        </div>
      </div>

      <div class="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 bg-slate-50/50 overflow-y-auto">
        <div class="lg:col-span-1 space-y-4">
          <div class="bg-white rounded-2xl border border-slate-100 p-4">
            <h4 class="text-sm font-black text-slate-800 mb-3">Estado financiero</h4>
            <p class="text-xs text-slate-400 mb-2">${new Date().getFullYear()}-${(new Date().getFullYear()+1).toString().slice(-2)}</p>
            <div class="grid grid-cols-6 gap-1">
              ${months.map((m, i) => {
                const isPaid = false, isOverdue = i < new Date().getMonth(), isFuture = i > new Date().getMonth();
                const clr = isPaid ? 'bg-green-100 text-green-800' : isOverdue ? 'bg-red-100 text-red-800' : isFuture ? 'bg-slate-100 text-slate-500' : 'bg-teal-50 text-teal-800';
                return `<div class="p-2 rounded-xl text-center ${clr}"><div class="text-xs font-black">${m.slice(0,3)}</div><div class="text-lg">${isPaid ? '✓' : isOverdue ? '🔴' : '⚪'}</div></div>`
              }).join('')}
            </div>
          </div>
          <div class="bg-white rounded-2xl border border-slate-100 p-4">
            <h4 class="text-sm font-black text-slate-800 mb-3">Cuotas pendientes</h4>
            <div class="space-y-2" id="cuotasList">
              ${(_state.charges || []).map(c => `
                <label class="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100 cursor-pointer hover:border-teal-300 transition-all">
                  <input type="checkbox" class="cuota-check w-4 h-4 accent-teal-600"
                    data-id="${c.id}" data-concept="${Helpers.escapeHTML(c.concept || c.type)}"
                    data-amount="${c.amount}" onchange="CajaCobro._toggleCuota(this)">
                  <div class="flex-1 min-w-0">
                    <div class="text-xs font-bold text-slate-700">${Helpers.escapeHTML(c.concept || c.type)}</div>
                    <div class="text-[10px] text-slate-400">${c.due_date || ''}</div>
                  </div>
                  <div class="text-sm font-black text-slate-800">${fmt(c.amount)}</div>
                </label>`
              ).join('')}
            </div>
          </div>
        </div>

        <div class="lg:col-span-2 space-y-4">
          <div class="bg-white rounded-2xl border border-slate-100 p-4">
            <h4 class="text-sm font-black text-slate-800 mb-3">Otros conceptos</h4>
            <div class="grid grid-cols-2 sm:grid-cols-5 gap-2">
              ${CONCEPTOS_CATALOGO.map(conc => `
                <button onclick='CajaCobro._addCatalogConcept(${JSON.stringify(conc).replace(/'/g, "&apos;")})'
                  class="p-3 text-center border-2 border-slate-100 rounded-xl hover:border-teal-300 hover:bg-teal-50 transition-all">
                  <div class="text-xs font-bold text-slate-700">${conc.label}</div>
                  ${conc.amount>0 ? `<div class="text-sm font-black text-slate-800 mt-1">${fmt(conc.amount)}</div>` : ''}
                </button>
              `).join('')}
            </div>
          </div>

          <div class="bg-white rounded-2xl border border-slate-100 p-4">
            <h4 class="text-sm font-black text-slate-800 mb-3 flex items-center gap-2">
              <i data-lucide="shopping-cart" class="w-4 h-4 text-teal-600"></i>
              Carrito
              <span id="ccCartCount" class="ml-auto text-xs font-black text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full">0 items</span>
            </h4>
            <div id="cartList" class="space-y-2 min-h-16">
              ${_state.cart.length ? _state.cart.map((i, idx) => `
                <div class="flex items-center justify-between p-3 bg-teal-50 rounded-xl border border-teal-100">
                  <div class="flex-1 min-w-0">
                    <div class="text-sm font-bold text-slate-700">${Helpers.escapeHTML(i.label)}</div>
                    ${i.mora ? `<div class="text-[10px] text-red-500">+mora ${fmt(i.mora)}</div>` : ''}
                  </div>
                  <div class="font-black text-teal-700 mx-3">${fmt(i.amount + (i.mora||0))}</div>
                  <button onclick="CajaCobro.removeFromCart(${idx})" class="w-6 h-6 rounded-lg bg-red-50 text-red-400 hover:bg-red-100 flex items-center justify-center">
                    <i data-lucide="x" class="w-3 h-3"></i>
                  </button>
                </div>
              `).join('') : `
                <div class="text-center py-4 text-slate-300 text-sm font-bold">
                  <i data-lucide="shopping-cart" class="w-8 h-8 mx-auto mb-2 opacity-40"></i>
                  Selecciona conceptos
                </div>
              `}
            </div>
            <div class="mt-4 pt-4 border-t border-slate-100">
              <div class="flex justify-between text-sm py-1"><span class="text-slate-600">Subtotal</span><span class="font-bold text-slate-800">${fmt(totalCart)}</span></div>
              ${_state.totalDiscount>0 ? `<div class="flex justify-between text-sm py-1 text-green-600"><span>Descuento</span><span class="font-bold">-${fmt(_state.totalDiscount)}</span></div>` : ''}
              ${_state.totalMora>0 ? `<div class="flex justify-between text-sm py-1 text-red-600"><span>Mora</span><span class="font-bold">+${fmt(_state.totalMora)}</span></div>` : ''}
              <div class="flex justify-between text-lg font-black py-2 border-t border-slate-200 mt-1">
                <span class="text-slate-800">TOTAL</span>
                <span id="ccTotal" class="text-teal-700">${fmt(total)}</span>
              </div>
            </div>
          </div>

          <div class="bg-white rounded-2xl border border-slate-100 p-4">
            <h4 class="text-sm font-black text-slate-800 mb-3">Método de pago</h4>
            <div class="grid grid-cols-2 sm:grid-cols-5 gap-2">
              ${[
                {id:'efectivo', label:'💵 Efectivo'},
                {id:'tarjeta', label:'💳 Tarjeta'},
                {id:'transferencia', label:'🏦 Transferencia'},
                {id:'cheque', label:'📝 Cheque'},
                {id:'mixto', label:'🔀 Mixto'},
              ].map(m => `
                <button onclick="CajaCobro._selectPaymentMethod('${m.id}')" data-method="${m.id}"
                  class="p-3 text-center border-2 border-slate-100 rounded-xl hover:border-teal-300 transition-all">
                  <div class="text-xs font-bold text-slate-700">${m.label}</div>
                </button>
              `).join('')}
            </div>
            <div id="paymentMethodDetails" class="mt-4"></div>
          </div>
        </div>
      </div>
      <div class="p-6 bg-white border-t border-slate-100 flex items-center justify-between gap-4">
        <button onclick="closeCobroModal()" class="px-5 py-3 text-slate-500 font-black text-xs uppercase border-2 border-slate-200 rounded-2xl hover:bg-slate-50 transition-all">Cancelar</button>
        <button onclick="CajaCobro.confirmPayment()" id="btnConfirmarPago" disabled class="px-8 py-3 text-white font-black text-sm uppercase rounded-2xl transition-all" style="background:linear-gradient(135deg,#0d9488,#0f766e); box-shadow:0 4px 12px rgba(13,148,136,.3)">COBRAR Y EMITIR FACTURA</button>
      </div>
    </div>
  </div>`;
  const modalContainer = document.createElement('div');
  modalContainer.innerHTML = modalHTML;
  document.body.appendChild(modalContainer);
  if (window.lucide) lucide.createIcons();
}

function closeCobroModal() {
  const el = document.getElementById('cajaModalOverlay');
  if (el) el.remove();
}

window.CajaCobro = CajaCobro;
window.calculateChange = calculateChange;
