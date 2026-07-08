/**
 * Caja Module — Directora (Rediseño)
 */
import { supabase } from '../shared/supabase.js';
import { Helpers } from '../shared/helpers.js';
import { InvoiceModule } from '../shared/invoice.js';

const $el = id => document.getElementById(id);
const fmtCurrency = n => 'RD$' + Number(n||0).toLocaleString('es-DO',{minimumFractionDigits:2});
const fmtTime = d => new Date(d).toLocaleTimeString('es-DO',{hour:'2-digit',minute:'2-digit',hour12:true});
const today = () => new Date().toISOString().split('T')[0];
const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// Catalogo de conceptos adicionales
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

export const CajaModule = {
  _state: {
    filters: {
      mes: new Date().getMonth(), // 0-11
      curso: '',
      aula: '',
      nivel: '',
      plan: '',
      estado: '',
      mora: false,
    },
    selectedStudent: null,
    cart: [], // [{id, label, amount, type, chargeId?, month?}]
    totalMora: 0,
    totalDiscount: 0,
  },

  async init() {
    console.log('CajaModule init');
    this._render();
    await this._loadPendingPayments();
    this._setupEventListeners();
  },

  _render() {
    const section = $el('caja');
    if (!section) return;

    const currentMonthName = months[this._state.filters.mes];
    const currentYear = new Date().getFullYear();

    section.innerHTML = `
    <div class="space-y-5">
      <!-- Header -->
      <div class="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 class="text-xl font-black text-slate-800">Caja</h2>
          <p class="text-xs text-slate-400 font-bold uppercase tracking-wider">Gestión de pagos y cobros</p>
        </div>
        <div class="flex gap-2">
          <button onclick="CajaModule._exportDailyReport()" class="px-3 py-2 text-white text-xs font-black uppercase rounded-xl" style="background:#7c3aed">
            <i data-lucide="file-down" class="w-4 h-4 inline mr-1"></i> Reporte Diario
          </button>
        </div>
      </div>

      <!-- Cobros Pendientes -->
      <div class="bg-white rounded-2xl border border-slate-100 p-5">
        <div class="flex items-center justify-between flex-wrap gap-3 mb-4 pb-4 border-b border-slate-100">
          <div>
            <h3 class="text-lg font-black text-slate-800">📅 ${currentMonthName} ${currentYear}</h3>
            <p class="text-sm text-slate-400 font-bold">Estudiantes con pagos pendientes</p>
          </div>
          <div class="flex items-center gap-2">
            <div class="relative">
              <i data-lucide="search" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"></i>
              <input id="cajaSearch" type="text" placeholder="Buscar estudiante..." oninput="CajaModule._applyFilters()"
                class="w-full pl-9 pr-4 py-2 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-blue-400">
            </div>
          </div>
        </div>

        <!-- Filtros -->
        <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 mb-4">
          <select id="filterMes" onchange="CajaModule._updateFilter('mes', this.value)" class="border-2 border-slate-100 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-blue-400">
            ${months.map((m,i)=>`<option value="${i}" ${i===this._state.filters.mes?'selected':''}>${m}</option>`).join('')}
          </select>
          <select id="filterCurso" onchange="CajaModule._updateFilter('curso', this.value)" class="border-2 border-slate-100 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-blue-400">
            <option value="">Todos cursos</option>
          </select>
          <select id="filterAula" onchange="CajaModule._updateFilter('aula', this.value)" class="border-2 border-slate-100 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-blue-400">
            <option value="">Todas aulas</option>
          </select>
          <select id="filterNivel" onchange="CajaModule._updateFilter('nivel', this.value)" class="border-2 border-slate-100 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-blue-400">
            <option value="">Todos niveles</option>
          </select>
          <select id="filterPlan" onchange="CajaModule._updateFilter('plan', this.value)" class="border-2 border-slate-100 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-blue-400">
            <option value="">Todos planes</option>
          </select>
          <select id="filterEstado" onchange="CajaModule._updateFilter('estado', this.value)" class="border-2 border-slate-100 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-blue-400">
            <option value="">Todos estados</option>
            <option value="pending">Pendiente</option>
            <option value="overdue">Vencido</option>
            <option value="paid">Pagado</option>
          </select>
          <label class="flex items-center gap-2 border-2 border-slate-100 rounded-xl px-3 py-2 cursor-pointer">
            <input type="checkbox" id="filterMora" onchange="CajaModule._updateFilter('mora', this.checked)" class="w-4 h-4 accent-blue-600">
            <span class="text-xs font-bold text-slate-600">Solo con mora</span>
          </label>
        </div>

        <!-- Total pendientes -->
        <div class="mb-4 p-3 rounded-xl" style="background: linear-gradient(135deg, #fef3c7, #fde68a)">
          <div class="text-xs font-black text-amber-800 uppercase">Total pendientes</div>
          <div class="text-2xl font-black text-amber-900" id="totalPendientes">0 estudiantes</div>
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
  },

  async _loadPendingPayments() {
    const tbody = $el('cajaTableBody');
    if (!tbody) return;

    try {
      // Cargar estudiantes con sus pagos pendientes
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

      const filteredStudents = (students || []).map(s => {
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
      }).filter(s => {
        const f = this._state.filters;
        if (f.estado && s.status !== f.estado) return false;
        if (f.mora && !s.hasMora) return false;
        return true;
      });

      this._students = filteredStudents;
      $el('totalPendientes').textContent = `${filteredStudents.filter(s => s.status !== 'paid').length} estudiantes`;

      tbody.innerHTML = filteredStudents.length ? filteredStudents.map(s => {
        const statusColor = s.status === 'overdue' ? 'red' : s.status === 'pending' ? 'yellow' : 'green';
        const statusLabel = s.status === 'overdue' ? '🔴 Vencido' : s.status === 'pending' ? '🟡 Pendiente' : '🟢 Al día';

        return `
        <tr class="hover:bg-slate-50 transition-colors">
          <td class="px-4 py-3">
            <span class="text-xs font-black text-${statusColor}-600 bg-${statusColor}-50 px-2 py-1 rounded-full">${statusLabel}</span>
          </td>
          <td class="px-4 py-3 font-bold text-slate-800">${Helpers.escapeHTML(s.name || '—')}</td>
          <td class="px-4 py-3 text-sm text-slate-600">${Helpers.escapeHTML(s.classrooms?.name || '—')}</td>
          <td class="px-4 py-3 text-right font-black text-slate-800">${fmtCurrency(s.totalOwed)}</td>
          <td class="px-4 py-3 text-sm text-slate-600">${s.earliestDueDate || '—'}</td>
          <td class="px-4 py-3 text-center">
            ${s.status !== 'paid' ? `
              <button onclick="CajaModule.openCobroModal(${s.id})" class="px-3 py-1 text-xs font-black uppercase text-white rounded-xl" style="background:#28B54D">
                Cobrar
              </button>
            ` : `
              <button onclick="CajaModule._viewStudentDetails(${s.id})" class="px-3 py-1 text-xs font-black uppercase text-slate-600 bg-slate-100 rounded-xl">
                Ver
              </button>
            `}
          </td>
        </tr>
        `;
      }).join('') : `
        <tr><td colspan="6" class="text-center py-8 text-slate-400 text-sm">Sin estudiantes pendientes</td></tr>
      `;

      if (window.lucide) lucide.createIcons();
    } catch (e) {
      console.error('Error loading pending payments:', e);
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-red-400 text-sm">Error al cargar</td></tr>';
    }
  },

  _updateFilter(key, value) {
    this._state.filters[key] = value;
    this._applyFilters();
  },

  _applyFilters() {
    // Apply search and filters
    const q = $el('cajaSearch')?.value?.toLowerCase() || '';
    const students = (this._students || []).filter(s => {
      const nameMatch = s.name?.toLowerCase().includes(q);
      const matriculaMatch = s.matricula?.toLowerCase().includes(q);
      return nameMatch || matriculaMatch;
    });

    const tbody = $el('cajaTableBody');
    if (!tbody) return;

    const f = this._state.filters;
    const filteredStudents = students.filter(s => {
      if (f.estado && s.status !== f.estado) return false;
      if (f.mora && !s.hasMora) return false;
      return true;
    });

    $el('totalPendientes').textContent = `${filteredStudents.filter(s => s.status !== 'paid').length} estudiantes`;

    tbody.innerHTML = filteredStudents.length ? filteredStudents.map(s => {
      const statusColor = s.status === 'overdue' ? 'red' : s.status === 'pending' ? 'yellow' : 'green';
      const statusLabel = s.status === 'overdue' ? '🔴 Vencido' : s.status === 'pending' ? '🟡 Pendiente' : '🟢 Al día';

      return `
        <tr class="hover:bg-slate-50 transition-colors">
          <td class="px-4 py-3">
            <span class="text-xs font-black text-${statusColor}-600 bg-${statusColor}-50 px-2 py-1 rounded-full">${statusLabel}</span>
          </td>
          <td class="px-4 py-3 font-bold text-slate-800">${Helpers.escapeHTML(s.name || '—')}</td>
          <td class="px-4 py-3 text-sm text-slate-600">${Helpers.escapeHTML(s.classrooms?.name || '—')}</td>
          <td class="px-4 py-3 text-right font-black text-slate-800">${fmtCurrency(s.totalOwed)}</td>
          <td class="px-4 py-3 text-sm text-slate-600">${s.earliestDueDate || '—'}</td>
          <td class="px-4 py-3 text-center">
            ${s.status !== 'paid' ? `
              <button onclick="CajaModule.openCobroModal(${s.id})" class="px-3 py-1 text-xs font-black uppercase text-white rounded-xl" style="background:#28B54D">
                Cobrar
              </button>
            ` : `
              <button onclick="CajaModule._viewStudentDetails(${s.id})" class="px-3 py-1 text-xs font-black uppercase text-slate-600 bg-slate-100 rounded-xl">
                Ver
              </button>
            `}
          </td>
        </tr>
      `;
    }).join('') : `
        <tr><td colspan="6" class="text-center py-8 text-slate-400 text-sm">Sin resultados</td></tr>
    `;
  },

  async openCobroModal(studentId) {
    // Load student data
    const { data: student } = await supabase.from('students')
      .select(`
        id, name, matricula, p1_name, p1_phone, p1_email, monthly_fee,
        classrooms (name, level)
      `)
      .eq('id', studentId)
      .single();

    if (!student) {
      Helpers.toast('Estudiante no encontrado', 'error');
      return;
    }

    this._state.selectedStudent = student;
    this._state.cart = [];
    this._state.totalMora = 0;
    this._state.totalDiscount = 0;

    // Load student charges
    const { data: enrollments } = await supabase.from('student_enrollments')
      .select('id')
      .eq('student_id', studentId)
      .order('created_at', {ascending: false})
      .limit(1);
    
    let charges = [];
    if (enrollments?.[0]?.id) {
      const { data: sc } = await supabase.from('student_charges')
        .select('id, concept, type, amount, due_date, status')
        .eq('student_enrollment_id', enrollments[0].id)
        .order('due_date')
        .limit(20);
      charges = sc || [];
    }

    this._charges = charges;

    // Render modal
    this._renderCobroModal();
  },

  _renderCobroModal() {
    const s = this._state.selectedStudent;
    const totalCart = this._state.cart.reduce((sum, item) => sum + item.amount, 0);
    const total = totalCart + this._state.totalMora - this._state.totalDiscount;

    const modalHTML = `
    <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-9999 flex items-center justify-center p-4">
      <div class="bg-white rounded-3xl overflow-hidden w-full max-w-7xl max-h-[95vh] shadow-2xl">
        <!-- Encabezado -->
        <div class="p-6 border-b border-slate-100" style="background: linear-gradient(135deg, #28B54D, #239943)">
          <div class="flex items-center justify-between flex-wrap gap-4">
            <div class="flex items-center gap-4">
              <div class="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center text-white text-3xl font-black">
                ${s.name.charAt(0).toUpperCase()}
              </div>
              <div class="text-white">
                <h3 class="text-xl font-black">${Helpers.escapeHTML(s.name)}</h3>
                <p class="text-sm font-bold opacity-90">
                  ${s.classrooms?.name || '—'} · Matrícula: ${s.matricula || '—'}
                </p>
                <p class="text-xs font-bold opacity-80 mt-1">
                  Padre/Tutor: ${Helpers.escapeHTML(s.p1_name || '—')}
                </p>
              </div>
            </div>
            <div class="text-right text-white">
              <div class="text-xs font-bold opacity-80 uppercase">Balance General</div>
              <div class="text-2xl font-black">${fmtCurrency(0)}</div>
              <div class="text-xs opacity-80 mt-1">
                Último pago: —
              </div>
            </div>
          </div>
        </div>

        <!-- Cuerpo del modal -->
        <div class="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 bg-slate-50/50 overflow-y-auto">
          <!-- Panel izquierdo: Estado financiero -->
          <div class="lg:col-span-1 space-y-4">
            <div class="bg-white rounded-2xl border border-slate-100 p-4">
              <h4 class="text-sm font-black text-slate-800 mb-3">Estado financiero</h4>
              <p class="text-xs text-slate-400 mb-2">${new Date().getFullYear()}-${(new Date().getFullYear()+1).toString().slice(-2)}</p>
              
              <!-- Timeline de meses -->
              <div class="grid grid-cols-6 gap-1">
                ${months.map((m, i) => {
                  const isPaid = false;
                  const isOverdue = i < new Date().getMonth();
                  const isFuture = i > new Date().getMonth();
                  const bgColor = isPaid ? 'bg-green-100 text-green-800' 
                                  : isOverdue ? 'bg-red-100 text-red-800' 
                                  : isFuture ? 'bg-slate-100 text-slate-500' 
                                  : 'bg-blue-50 text-blue-800';
                  
                  return `
                    <div class="p-2 rounded-xl text-center ${bgColor}">
                      <div class="text-xs font-black">${m.slice(0,3)}</div>
                      <div class="text-lg">${isPaid ? '✓' : isOverdue ? '🔴' : '⚪'}</div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>

            <!-- Cuotas pendientes -->
            <div class="bg-white rounded-2xl border border-slate-100 p-4">
              <h4 class="text-sm font-black text-slate-800 mb-3">Cuotas pendientes</h4>
              <div class="space-y-2" id="cuotasList">
                ${(this._charges || []).map(c => `
                  <label class="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100 cursor-pointer hover:border-blue-300 transition-all">
                    <input type="checkbox" class="cuota-check w-4 h-4 accent-blue-600"
                      data-id="${c.id}" data-concept="${Helpers.escapeHTML(c.concept || c.type)}"
                      data-amount="${c.amount}" onchange="CajaModule._toggleCuota(this)">
                    <div class="flex-1">
                      <div class="text-xs font-bold text-slate-700">${Helpers.escapeHTML(c.concept || c.type)}</div>
                      <div class="text-[10px] text-slate-400">${c.due_date || ''}</div>
                    </div>
                    <div class="text-sm font-black text-slate-800">${fmtCurrency(c.amount)}</div>
                  </label>
                `).join('')}
              </div>
            </div>
          </div>

          <!-- Panel derecho: Catálogo y carrito -->
          <div class="lg:col-span-2 space-y-4">
            <!-- Otros conceptos -->
            <div class="bg-white rounded-2xl border border-slate-100 p-4">
              <h4 class="text-sm font-black text-slate-800 mb-3">Otros conceptos</h4>
              <div class="grid grid-cols-2 sm:grid-cols-5 gap-2">
                ${CONCEPTOS_CATALOGO.map(conc => `
                  <button onclick="CajaModule._addCatalogConcept(${JSON.stringify(conc).replace(/"/g,'&quot;')})"
                    class="p-3 text-center border-2 border-slate-100 rounded-xl hover:border-blue-300 hover:bg-blue-50 transition-all">
                    <div class="text-xs font-bold text-slate-700">${conc.label}</div>
                    ${conc.amount > 0 ? `<div class="text-sm font-black text-slate-800 mt-1">${fmtCurrency(conc.amount)}</div>` : ''}
                  </button>
                `).join('')}
              </div>
            </div>

            <!-- Carrito -->
            <div class="bg-white rounded-2xl border border-slate-100 p-4">
              <h4 class="text-sm font-black text-slate-800 mb-3">Carrito</h4>
              <div id="cartList" class="space-y-2 mb-4">
                ${this._state.cart.length ? this._state.cart.map((item, idx) => `
                  <div class="flex items-center justify-between p-3 bg-blue-50 rounded-xl border border-blue-100">
                    <div>
                      <div class="text-sm font-bold text-slate-700">${Helpers.escapeHTML(item.label)}</div>
                    </div>
                    <div class="flex items-center gap-3">
                      <div class="font-black text-blue-700">${fmtCurrency(item.amount)}</div>
                      <button onclick="CajaModule._removeFromCart(${idx})"
                        class="w-7 h-7 rounded-lg bg-red-50 text-red-400 hover:bg-red-100 flex items-center justify-center">
                        <i data-lucide="x" class="w-4 h-4"></i>
                      </button>
                    </div>
                  </div>
                `).join('') : `
                  <div class="text-center py-4 text-slate-300 text-sm font-bold">
                    <i data-lucide="shopping-cart" class="w-8 h-8 mx-auto mb-2 opacity-40"></i>
                    Selecciona conceptos
                  </div>
                `}
              </div>

              <!-- Totales -->
              <div class="border-t border-slate-100 pt-3">
                <div class="flex justify-between text-sm py-1">
                  <span class="text-slate-600">Subtotal</span>
                  <span class="font-bold text-slate-800">${fmtCurrency(totalCart)}</span>
                </div>
                ${this._state.totalDiscount > 0 ? `
                  <div class="flex justify-between text-sm py-1 text-green-600">
                    <span>Descuento</span>
                    <span class="font-bold">-${fmtCurrency(this._state.totalDiscount)}</span>
                  </div>
                ` : ''}
                ${this._state.totalMora > 0 ? `
                  <div class="flex justify-between text-sm py-1 text-red-600">
                    <span>Mora</span>
                    <span class="font-bold">+${fmtCurrency(this._state.totalMora)}</span>
                  </div>
                ` : ''}
                <div class="flex justify-between text-lg font-black py-2 border-t border-slate-200 mt-1">
                  <span class="text-slate-800">TOTAL</span>
                  <span class="text-blue-700">${fmtCurrency(total)}</span>
                </div>
              </div>
            </div>

            <!-- Método de pago -->
            <div class="bg-white rounded-2xl border border-slate-100 p-4">
              <h4 class="text-sm font-black text-slate-800 mb-3">Método de pago</h4>
              <div class="grid grid-cols-2 sm:grid-cols-5 gap-2" id="paymentMethods">
                ${[
                  {id:'efectivo', label:'💵 Efectivo'},
                  {id:'tarjeta', label:'💳 Tarjeta'},
                  {id:'transferencia', label:'🏦 Transferencia'},
                  {id:'cheque', label:'📝 Cheque'},
                  {id:'mixto', label:'🔀 Mixto'},
                ].map(m => `
                  <button onclick="CajaModule._selectPaymentMethod('${m.id}')"
                    data-method="${m.id}"
                    class="p-3 text-center border-2 border-slate-100 rounded-xl hover:border-blue-300 transition-all method-btn">
                    <div class="text-xs font-bold text-slate-700">${m.label}</div>
                  </button>
                `).join('')}
              </div>

              <!-- Detalle del método -->
              <div id="paymentMethodDetails" class="mt-4"></div>
            </div>
          </div>
        </div>

        <!-- Botones de acción -->
        <div class="p-6 bg-white border-t border-slate-100 flex items-center justify-between gap-4">
          <button onclick="CajaModule._closeModal()"
            class="px-5 py-3 text-slate-500 font-black text-xs uppercase border-2 border-slate-200 rounded-2xl hover:bg-slate-50 transition-all">
            Cancelar
          </button>
          <button onclick="CajaModule._confirmPayment()" id="btnConfirmarPago" disabled
            class="px-8 py-3 text-white font-black text-sm uppercase rounded-2xl transition-all"
            style="background: linear-gradient(135deg,#28B54D,#239943); box-shadow: 0 4px 12px rgba(40,181,77,0.3)">
            COBRAR Y EMITIR FACTURA
          </button>
        </div>
      </div>
    </div>
    `;

    const modalContainer = document.createElement('div');
    modalContainer.id = 'cajaModalContainer';
    modalContainer.innerHTML = modalHTML;
    document.body.appendChild(modalContainer);
    if (window.lucide) lucide.createIcons();
  },

  _toggleCuota(el) {
    const id = el.dataset.id;
    const concept = el.dataset.concept;
    const amount = parseFloat(el.dataset.amount);

    if (el.checked) {
      this._state.cart.push({ id, label: concept, amount, type: 'cuota' });
    } else {
      const idx = this._state.cart.findIndex(c => c.id === id && c.type === 'cuota');
      if (idx !== -1) this._state.cart.splice(idx, 1);
    }
    this._updateCartUI();
  },

  _addCatalogConcept(conc) {
    let amount = conc.amount;
    if (conc.id === 'otros') {
      const customAmount = parseFloat(prompt('Monto (RD$):', '0') || '0');
      if (!customAmount || customAmount <=0) return;
      amount = customAmount;
    }
    this._state.cart.push({
      id: `catalog-${conc.id}`,
      label: conc.label,
      amount,
      type: 'catalog'
    });
    this._updateCartUI();
  },

  _removeFromCart(idx) {
    this._state.cart.splice(idx, 1);
    this._updateCartUI();
  },

  _updateCartUI() {
    const cartList = document.getElementById('cartList');
    if (!cartList) return;

    const totalCart = this._state.cart.reduce((sum, item) => sum + item.amount, 0);
    const total = totalCart + this._state.totalMora - this._state.totalDiscount;

    // Update cart list
    cartList.innerHTML = this._state.cart.length ? this._state.cart.map((item, idx) => `
      <div class="flex items-center justify-between p-3 bg-blue-50 rounded-xl border border-blue-100">
        <div>
          <div class="text-sm font-bold text-slate-700">${Helpers.escapeHTML(item.label)}</div>
        </div>
        <div class="flex items-center gap-3">
          <div class="font-black text-blue-700">${fmtCurrency(item.amount)}</div>
          <button onclick="CajaModule._removeFromCart(${idx})"
            class="w-7 h-7 rounded-lg bg-red-50 text-red-400 hover:bg-red-100 flex items-center justify-center">
            <i data-lucide="x" class="w-4 h-4"></i>
          </button>
        </div>
      </div>
    `).join('') : `
      <div class="text-center py-4 text-slate-300 text-sm font-bold">
        <i data-lucide="shopping-cart" class="w-8 h-8 mx-auto mb-2 opacity-40"></i>
        Selecciona conceptos
      </div>
    `;

    // Update totals (we'll re-render the whole modal for simplicity)
    if (document.getElementById('cajaModalContainer')) {
      this._renderCobroModal();
    }

    // Enable confirm button if cart has items
    const btn = document.getElementById('btnConfirmarPago');
    if (btn) btn.disabled = this._state.cart.length === 0;
  },

  _selectPaymentMethod(method) {
    document.querySelectorAll('.method-btn').forEach(b => b.classList.remove('border-blue-500','bg-blue-50'));
    const selectedBtn = document.querySelector(`[data-method="${method}"]`);
    if (selectedBtn) selectedBtn.classList.add('border-blue-500','bg-blue-50');
    this._state.selectedPaymentMethod = method;

    const detailsEl = document.getElementById('paymentMethodDetails');
    if (!detailsEl) return;

    switch (method) {
      case 'efectivo':
        detailsEl.innerHTML = `
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="text-xs font-black text-slate-400 uppercase block mb-1">Monto recibido</label>
              <input type="number" id="montoRecibido" step="0.01" placeholder="0.00"
                class="w-full border-2 border-slate-100 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-400"
                oninput="CajaModule._calculateChange()">
            </div>
            <div>
              <label class="text-xs font-black text-slate-400 uppercase block mb-1">Cambio</label>
              <div id="montoCambio" class="w-full border-2 border-slate-100 rounded-xl px-3 py-2 text-sm font-bold text-green-600 bg-green-50">
                RD$0.00
              </div>
            </div>
          </div>
        `;
        break;
      case 'transferencia':
        detailsEl.innerHTML = `
          <div class="space-y-2">
            <input type="text" placeholder="Banco" class="w-full border-2 border-slate-100 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-400">
            <input type="text" placeholder="Referencia" class="w-full border-2 border-slate-100 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-400">
          </div>
        `;
        break;
      default:
        detailsEl.innerHTML = '';
    }

    // Enable confirm button if method selected
    const btn = document.getElementById('btnConfirmarPago');
    if (btn) btn.disabled = this._state.cart.length === 0;
  },

  _calculateChange() {
    const totalCart = this._state.cart.reduce((sum, item) => sum + item.amount, 0);
    const total = totalCart + this._state.totalMora - this._state.totalDiscount;
    const recibido = parseFloat(document.getElementById('montoRecibido')?.value || '0');
    const cambio = Math.max(0, recibido - total);
    const cambioEl = document.getElementById('montoCambio');
    if (cambioEl) cambioEl.textContent = fmtCurrency(cambio);
  },

  async _confirmPayment() {
    if (!this._state.cart.length) {
      Helpers.toast('Selecciona al menos un concepto', 'warning');
      return;
    }

    const btn = document.getElementById('btnConfirmarPago');
    if (btn) btn.disabled = true; btn.textContent = 'Procesando...';

    try {
      // Registrar pagos
      const s = this._state.selectedStudent;
      const paymentIds = [];
      for (const item of this._state.cart) {
        const { data: pay, error } = await supabase.from('payments').insert({
          student_id: s.id,
          amount: item.amount,
          concept: item.label,
          method: this._state.selectedPaymentMethod || 'efectivo',
          status: 'paid',
          paid_date: new Date().toISOString(),
          created_at: new Date().toISOString()
        }).select().single();
        if (error) throw error;
        paymentIds.push(pay.id);

        // Marcar cuota como pagada si es una cuota
        if (item.type === 'cuota' && item.id) {
          await supabase.from('student_charges')
            .update({ status: 'paid', paid_date: new Date().toISOString() })
            .eq('id', item.id);
        }
      }

      // Cerrar modal
      this._closeModal();

      // Generar factura
      InvoiceModule.downloadSingle({
        id: paymentIds[0],
        students: {
          name: s.name,
          classrooms: { name: s.classrooms?.name || '' },
          p1_name: s.p1_name || ''
        },
        concept: this._state.cart.map(i => i.label).join(', '),
        amount: this._state.cart.reduce((sum, i) => sum + i.amount, 0),
        method: this._state.selectedPaymentMethod || 'efectivo',
        paid_date: new Date().toISOString(),
        status: 'paid'
      });

      Helpers.toast('Pago registrado! Factura generada.', 'success');
      
      // Recargar lista
      await this._loadPendingPayments();
    } catch (e) {
      console.error('Error confirming payment:', e);
      Helpers.toast('Error al procesar pago', 'error');
      if (btn) btn.disabled = false; btn.textContent = 'COBRAR Y EMITIR FACTURA';
    }
  },

  _closeModal() {
    const modal = document.getElementById('cajaModalContainer');
    if (modal) modal.remove();
  },

  _viewStudentDetails(studentId) {
    Helpers.toast('Ver detalles del estudiante', 'info');
  },

  _setupEventListeners() {},

  _exportDailyReport() {
    Helpers.toast('Generando reporte diario...', 'info');
  }
};

