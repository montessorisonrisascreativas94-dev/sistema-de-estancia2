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
    cart: [], // [{id, label, amount, type, chargeId?, month?}
    totalMora: 0,
    totalDiscount: 0,
    discountReason: '',
    concepts: [], // Dynamic concepts from DB
    rnc: '',
    empresa: '',
    selectedPaymentMethod: 'efectivo',
    montoRecibido: 0,
    banco: '',
    referencia: '',
    cheque: '',
  },

  async init() {
    console.log('CajaModule init');
    this._render();
    await this._loadPendingPayments();
    await this._loadConcepts();
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
              <button onclick="CajaModule.openCobroModal(${s.id})" class="px-3 py-1 text-xs font-black uppercase text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors">
                Ver
              </button>
            `}
          </td>
        </tr>
      `;
      }).join('') : `
        <tr><td colspan="6" class="text-center py-8 text-slate-400 text-sm">Sin estudiantes pendientes</td></tr>
      `;

      await this._loadPendingTransfers(); // Load pending parent payments
      
      if (window.lucide) lucide.createIcons();
    } catch (e) {
      console.error('Error loading pending payments', e);
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
              <button onclick="CajaModule.openCobroModal(${s.id})" class="px-3 py-1 text-xs font-black uppercase text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors">
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

  async approvePayment(paymentId) {
    if (!confirm('¿Estás seguro de aprobar este pago?')) return;

    try {
      const { error } = await supabase
        .from('payments')
        .update({
          status: 'paid',
          paid_date: new Date().toISOString()
        })
        .eq('id', paymentId);

      if (error) throw error;

      // Llamar a la función para generar y enviar el recibo
      try {
        await supabase.functions.invoke('generate-invoice', {
          body: { payment_id: paymentId, send_email: true }
        });
      } catch (invoiceErr) {
        console.error('Error generando factura', invoiceErr);
      }

      Helpers.toast('Pago aprobado!', 'success');
      await this._loadPendingTransfers(); // Refresh the list
      await this._loadPendingPayments(); // Refresh the student list
    } catch (e) {
      console.error('Error approving payment', e);
      Helpers.toast('Error al aprobar pago', 'error');
    }
  },

  async rejectPayment(paymentId) {
    const reason = prompt('¿Por qué estás rechazando este pago?');
    if (!reason) return;

    try {
      const { error } = await supabase
        .from('payments')
        .update({
          status: 'rejected',
          notes: reason
        })
        .eq('id', paymentId);

      if (error) throw error;

      Helpers.toast('Pago rechazado', 'info');
      await this._loadPendingTransfers(); // Refresh
    } catch (e) {
      console.error('Error rejecting payment', e);
      Helpers.toast('Error al rechazar pago', 'error');
    }
  },

  async _loadPendingTransfers() {
    const container = $el('transferenciasPendientes');
    if (!container) return;

    try {
      const { data: payments } = await supabase
        .from('payments')
        .select(`
          id, student_id, amount, concept, method, bank, evidence_url, fiscal_receipt_url, month_paid, notes, created_at,
          students (name, classrooms (name))
        `)
        .eq('status', 'review')
        .order('created_at', { ascending: false });

      if (!payments || payments.length === 0) {
        container.innerHTML = '<div class="text-center py-4 text-slate-400 text-sm">Sin transferencias pendientes</div>';
        return;
      }

      container.innerHTML = payments.map(p => `
        <div class="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
          <div class="flex justify-between items-start">
            <div>
              <p class="font-black text-slate-800">${Helpers.escapeHTML(p.students?.name || 'Estudiante desconocido')}</p>
              <p class="text-xs text-slate-400">${p.students?.classrooms?.name || ''} · ${Helpers.formatDate(p.created_at)}</p>
            </div>
            <p class="font-black text-lg text-slate-800">${fmtCurrency(p.amount)}</p>
          </div>
          <div class="grid grid-cols-2 gap-2 text-xs">
            <div><span class="font-bold text-slate-500">Concepto:</span> ${Helpers.escapeHTML(p.concept || 'Mensualidad')}</div>
            <div><span class="font-bold text-slate-500">Mes:</span> ${Helpers.escapeHTML(p.month_paid || '')}</div>
            ${p.bank ? `<div><span class="font-bold text-slate-500">Banco:</span> ${Helpers.escapeHTML(p.bank)}</div>` : ''}
          </div>
          ${p.evidence_url ? `<div class="text-xs"><span class="font-bold text-slate-500">Comprobante:</span> <a href="${p.evidence_url}" target="_blank" class="text-blue-600 hover:underline">Ver</a></div>` : ''}
          ${p.fiscal_receipt_url ? `<div class="text-xs"><span class="font-bold text-slate-500">Comprobante Fiscal:</span> <a href="${p.fiscal_receipt_url}" target="_blank" class="text-indigo-600 hover:underline">Ver</a></div>` : ''}
          <div class="flex gap-2 mt-2">
            <button onclick="CajaModule.approvePayment(${p.id})" class="flex-1 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-black text-xs rounded-xl hover:from-green-600 transition-all">
              <i data-lucide="check" class="w-3 h-3 inline mr-1"></i> Aprobar
            </button>
            <button onclick="CajaModule.rejectPayment(${p.id})" class="flex-1 py-2 bg-gradient-to-r from-red-500 to-rose-600 text-white font-black text-xs rounded-xl hover:from-red-600 transition-all">
              <i data-lucide="x" class="w-3 h-3 inline mr-1"></i> Rechazar
            </button>
          </div>
        </div>
      `).join('');

      if (window.lucide) lucide.createIcons();
    } catch (e) {
      console.error('Error loading pending transfers', e);
      container.innerHTML = '<div class="text-center py-4 text-red-400 text-sm">Error al cargar transferencias</div>';
    }
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
    this._state.discountReason = '';
    this._state.rnc = '';
    this._state.empresa = '';
    this._state.selectedPaymentMethod = 'efectivo';
    this._state.montoRecibido = 0;

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

    // Load last payment
    const { data: lastPayments } = await supabase.from('payments')
      .select('paid_date, amount')
      .eq('student_id', studentId)
      .eq('status', 'paid')
      .order('paid_date', {ascending: false})
      .limit(1);
    this._lastPayment = lastPayments?.[0] || null;

    // Render modal
    this._renderCobroModal();
  },

  _renderCobroModal() {
    const s = this._state.selectedStudent;
    const totalCart = this._state.cart.reduce((sum, item) => sum + item.amount, 0);
    const total = totalCart + this._state.totalMora - this._state.totalDiscount;
    const cambio = Math.max(0, this._state.montoRecibido - total);
    const currentUser = supabase.auth.user || { email: 'directora@escuela.com' };

    const modalHTML = `
    <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-9999 flex items-center justify-center p-4" id="cajaModalContainer">
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
              <div class="text-2xl font-black">${fmtCurrency(this._charges.filter(c => c.status !== 'paid').reduce((sum, c) => sum + (c.amount || 0), 0))}</div>
              <div class="text-xs opacity-80 mt-1">
                Último pago: ${this._lastPayment ? `${new Date(this._lastPayment.paid_date).toLocaleDateString('es-DO')} · ${fmtCurrency(this._lastPayment.amount)}` : '—'}
              </div>
            </div>
          </div>
        </div>

        <!-- Cuerpo del modal -->
        <div class="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 bg-slate-50/50 overflow-y-auto">
          <!-- Panel izquierdo: Estado financiero y cuotas -->
          <div class="lg:col-span-4 space-y-4">
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
                      data-amount="${c.amount}" data-due="${c.due_date || ''}"
                      ${this._state.cart.some(i => i.id === c.id && i.type === 'cuota') ? 'checked' : ''}
                      onchange="CajaModule._toggleCuota(this)">
                    <div class="flex-1 min-w-0">
                      <div class="text-xs font-bold text-slate-700">${Helpers.escapeHTML(c.concept || c.type)}</div>
                      <div class="text-[10px] text-slate-400">Vence: ${c.due_date || '—'}</div>
                    </div>
                    <div class="text-sm font-black text-slate-800">${fmtCurrency(c.amount)}</div>
                  </label>
                `).join('')}
              </div>
            </div>
          </div>

          <!-- Panel medio: Catálogo y carrito -->
          <div class="lg:col-span-4 space-y-4">
            <!-- Otros conceptos -->
            <div class="bg-white rounded-2xl border border-slate-100 p-4">
              <div class="flex items-center justify-between mb-3">
                <h4 class="text-sm font-black text-slate-800">Otros conceptos</h4>
                <button onclick="CajaModule._openConceptModal()" class="p-2 text-white rounded-lg text-xs font-bold" style="background:#28B54D">
                  + Agregar
                </button>
              </div>
              <div class="grid grid-cols-2 gap-2">
                ${this._state.concepts.map(conc => `
                  <div class="p-3 text-center border-2 border-slate-100 rounded-xl hover:border-blue-300 hover:bg-blue-50 transition-all relative group">
                    <button onclick="CajaModule._addCatalogConcept({id: ${conc.id}, label: '${Helpers.escapeHTML(conc.name)}', amount: ${conc.amount}})"
                      class="w-full">
                      <div class="text-xs font-bold text-slate-700">${Helpers.escapeHTML(conc.name)}</div>
                      ${conc.amount > 0 ? `<div class="text-sm font-black text-slate-800 mt-1">${fmtCurrency(conc.amount)}</div>` : ''}
                    </button>
                    <div class="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                      <button onclick="event.stopPropagation(); CajaModule._openConceptModal(${JSON.stringify(conc).replace(/"/g,'&quot;')})" class="p-1 bg-yellow-100 text-yellow-700 rounded">
                        <i data-lucide="edit" class="w-3 h-3"></i>
                      </button>
                      <button onclick="event.stopPropagation(); CajaModule._deleteConcept(${conc.id})" class="p-1 bg-red-100 text-red-700 rounded">
                        <i data-lucide="trash" class="w-3 h-3"></i>
                      </button>
                    </div>
                  </div>
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

              <!-- Discount -->
              <div class="mb-4">
                <button onclick="CajaModule._toggleDiscount()" class="w-full p-3 border-2 border-slate-100 rounded-xl text-xs font-bold text-slate-700 hover:border-blue-300 hover:bg-blue-50 transition-all">
                  <i data-lucide="percentage" class="w-4 h-4 inline mr-2"></i>
                  ${this._state.totalDiscount > 0 ? `Descuento aplicado: ${fmtCurrency(this._state.totalDiscount)}` : 'Agregar descuento'}
                </button>
                ${this._state.totalDiscount > 0 ? `
                  <div class="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                    <p class="text-xs text-amber-700 font-bold">Motivo: ${this._state.discountReason || '—'}</p>
                  </div>
                ` : ''}
              </div>
            </div>

            <!-- Método de pago -->
            <div class="bg-white rounded-2xl border border-slate-100 p-4">
              <h4 class="text-sm font-black text-slate-800 mb-3">Método de pago</h4>
              <div class="grid grid-cols-5 gap-2" id="paymentMethods">
                ${[
                  {id:'efectivo', label:'💵 Efectivo'},
                  {id:'tarjeta', label:'💳 Tarjeta'},
                  {id:'transferencia', label:'🏦 Transferencia'},
                  {id:'cheque', label:'📝 Cheque'},
                  {id:'mixto', label:'🔀 Mixto'},
                ].map(m => `
                  <button onclick="CajaModule._selectPaymentMethod('${m.id}')"
                    data-method="${m.id}"
                    class="p-3 text-center border-2 border-slate-100 rounded-xl hover:border-blue-300 transition-all method-btn ${this._state.selectedPaymentMethod === m.id ? 'border-blue-500 bg-blue-50' : ''}">
                    <div class="text-xs font-bold text-slate-700">${m.label}</div>
                  </button>
                `).join('')}
              </div>

              <!-- Detalle del método -->
              <div id="paymentMethodDetails" class="mt-4"></div>
            </div>
          </div>

          <!-- Panel derecho: POS-style summary -->
          <div class="lg:col-span-4 space-y-4">
            <!-- POS Ticket Summary -->
            <div class="bg-white rounded-2xl border border-slate-100 p-4" style="background: linear-gradient(to bottom, #f8fafc, #ffffff)">
              <h4 class="text-sm font-black text-slate-800 mb-3 border-b border-slate-200 pb-2 flex items-center justify-between">
                <span>Resumen del Cobro</span>
                <span class="text-xs text-slate-500">${new Date().toLocaleString('es-DO')}</span>
              </h4>
              
              <div class="space-y-3 pt-2">
                <div class="flex justify-between items-center text-sm">
                  <span class="text-slate-600">Alumno:</span>
                  <span class="font-black text-slate-800">${Helpers.escapeHTML(s.name)}</span>
                </div>
                <div class="flex justify-between items-center text-sm">
                  <span class="text-slate-600">Curso:</span>
                  <span class="font-black text-slate-800">${s.classrooms?.name || '—'}</span>
                </div>
              </div>

              <div class="border-t border-dashed border-slate-200 my-3"></div>

              <div class="space-y-1">
                ${this._state.cart.map(item => `
                  <div class="flex justify-between items-center text-sm">
                    <span class="text-slate-700">${Helpers.escapeHTML(item.label)}</span>
                    <span class="font-black text-slate-800">${fmtCurrency(item.amount)}</span>
                  </div>
                `).join('')}
                ${this._state.cart.length === 0 ? `
                  <div class="text-center py-2 text-slate-400 text-sm">No hay items</div>
                ` : ''}
              </div>

              <div class="border-t border-dashed border-slate-200 my-3"></div>

              <div class="space-y-2">
                <div class="flex justify-between items-center text-sm">
                  <span class="text-slate-600">Subtotal:</span>
                  <span class="font-black text-slate-800">${fmtCurrency(totalCart)}</span>
                </div>
                ${this._state.totalDiscount > 0 ? `
                  <div class="flex justify-between items-center text-sm text-green-600">
                    <span>Descuento:</span>
                    <span class="font-black">-${fmtCurrency(this._state.totalDiscount)}</span>
                  </div>
                ` : ''}
                ${this._state.totalMora > 0 ? `
                  <div class="flex justify-between items-center text-sm text-red-600">
                    <span>Mora:</span>
                    <span class="font-black">+${fmtCurrency(this._state.totalMora)}</span>
                  </div>
                ` : ''}
                <div class="flex justify-between items-center text-lg font-black py-2 border-t border-slate-200 mt-1">
                  <span class="text-slate-800">TOTAL:</span>
                  <span class="text-blue-700">${fmtCurrency(total)}</span>
                </div>
              </div>

              ${this._state.selectedPaymentMethod === 'efectivo' ? `
                <div class="border-t border-dashed border-slate-200 my-3"></div>
                <div class="space-y-2">
                  <div class="flex justify-between items-center text-sm">
                    <span class="text-slate-600">Recibido:</span>
                    <span class="font-black text-slate-800">${fmtCurrency(this._state.montoRecibido)}</span>
                  </div>
                  <div class="flex justify-between items-center text-lg font-black">
                    <span class="text-slate-800">Cambio:</span>
                    <span class="text-green-600">${fmtCurrency(cambio)}</span>
                  </div>
                </div>
              ` : ''}

              <!-- RNC/Empresa -->
              <div class="border-t border-dashed border-slate-200 my-3"></div>
              <div class="space-y-2">
                <button onclick="CajaModule._toggleRNC()" class="w-full p-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:border-blue-300 hover:bg-blue-50 transition-all">
                ${this._state.rnc || this._state.empresa ? '✓ Datos fiscales' : 'Agregar RNC/Empresa'}
              </button>
              ${this._state.rnc || this._state.empresa ? `
                <div class="p-2 bg-blue-50 border border-blue-200 rounded-lg text-xs">
                  ${this._state.empresa ? `<p><strong>Empresa:</strong> ${Helpers.escapeHTML(this._state.empresa)}</p>` : ''}
                  ${this._state.rnc ? `<p><strong>RNC:</strong> ${Helpers.escapeHTML(this._state.rnc)}</p>` : ''}
                </div>
              ` : ''}
              </div>

              <!-- System info -->
              <div class="border-t border-dashed border-slate-200 my-3"></div>
              <div class="space-y-1 text-xs text-slate-500">
                <div class="flex justify-between">
                  <span>Cajero/a:</span>
                  <span class="font-bold">${currentUser.email}</span>
                </div>
                <div class="flex justify-between">
                  <span>Hora:</span>
                  <span class="font-bold">${new Date().toLocaleTimeString('es-DO')}</span>
                </div>
                <div class="flex justify-between">
                  <span>Estado:</span>
                  <span class="font-bold text-green-600"><i data-lucide="check-circle" class="w-3 h-3 inline mr-1"></i>Listo</span>
                </div>
              </div>
            </div>

            <!-- Action buttons -->
            <div class="grid grid-cols-2 gap-2">
              <button onclick="CajaModule._printReceipt()" class="p-3 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl hover:bg-slate-200 transition-all">
                <i data-lucide="printer" class="w-4 h-4 inline mr-1"></i>Imprimir
              </button>
              <button onclick="CajaModule._sendWhatsApp()" class="p-3 bg-green-100 text-green-700 font-bold text-xs rounded-xl hover:bg-green-200 transition-all">
                <i data-lucide="smartphone" class="w-4 h-4 inline mr-1"></i>WhatsApp
              </button>
              <button onclick="CajaModule._sendEmail()" class="p-3 bg-blue-100 text-blue-700 font-bold text-xs rounded-xl hover:bg-blue-200 transition-all">
                <i data-lucide="mail" class="w-4 h-4 inline mr-1"></i>Correo
              </button>
              <button onclick="CajaModule._downloadPDF()" class="p-3 bg-purple-100 text-purple-700 font-bold text-xs rounded-xl hover:bg-purple-200 transition-all">
                <i data-lucide="file-text" class="w-4 h-4 inline mr-1"></i>PDF
              </button>
            </div>
          </div>
        </div>

        <!-- Botones de acción -->
        <div class="p-6 bg-white border-t border-slate-100 flex items-center justify-between gap-4">
          <button onclick="CajaModule._closeModal()"
            class="px-5 py-3 text-slate-500 font-black text-xs uppercase border-2 border-slate-200 rounded-2xl hover:bg-slate-50 transition-all">
            Cancelar
          </button>
          <button onclick="CajaModule._confirmPayment()" id="btnConfirmarPago" ${this._state.cart.length === 0 ? 'disabled' : ''}
            class="px-8 py-3 text-white font-black text-sm uppercase rounded-2xl transition-all"
            style="background: linear-gradient(135deg,#28B54D,#239943); box-shadow: 0 4px 12px rgba(40,181,77,0.3)">
            ${this._state.cart.length === 0 ? 'Selecciona items' : 'COBRAR Y EMITIR FACTURA'}
          </button>
        </div>
      </div>
    </div>
    `;

    const oldModal = document.getElementById('cajaModalContainer');
    if (oldModal) oldModal.remove();

    const modalContainer = document.createElement('div');
    modalContainer.id = 'cajaModalContainer';
    modalContainer.innerHTML = modalHTML;
    document.body.appendChild(modalContainer);
    
    if (window.lucide) lucide.createIcons();

    // Re-render payment method details
    this._selectPaymentMethod(this._state.selectedPaymentMethod);
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
    // Just re-render the whole modal for simplicity
    if (document.getElementById('cajaModalContainer')) {
      this._renderCobroModal();
    }
  },

  _selectPaymentMethod(method) {
    this._state.selectedPaymentMethod = method;
    const detailsEl = document.getElementById('paymentMethodDetails');
    if (!detailsEl) return;

    const totalCart = this._state.cart.reduce((sum, item) => sum + item.amount, 0);
    const total = totalCart + this._state.totalMora - this._state.totalDiscount;

    switch (method) {
      case 'efectivo':
        detailsEl.innerHTML = `
          <div class="space-y-3">
            <div>
              <label class="text-xs font-black text-slate-400 uppercase block mb-1">Monto Recibido</label>
              <input type="number" id="montoRecibido" step="0.01" placeholder="0.00"
                value="${this._state.montoRecibido}"
                class="w-full border-2 border-slate-100 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-400"
                oninput="CajaModule._updateMontoRecibido(this.value)">
            </div>
            <div class="p-3 rounded-xl bg-green-50 border border-green-200">
              <div class="text-xs font-black text-green-800 uppercase">Cambio:</div>
              <div class="text-xl font-black text-green-700">${fmtCurrency(Math.max(0, this._state.montoRecibido - total))}</div>
            </div>
          </div>
        `;
        break;
      case 'tarjeta':
        detailsEl.innerHTML = `
          <div class="space-y-2">
            <input type="text" placeholder="Banco" class="w-full border-2 border-slate-100 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-400">
            <input type="text" placeholder="Últimos 4 dígitos" class="w-full border-2 border-slate-100 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-400">
          </div>
        `;
        break;
      case 'transferencia':
        detailsEl.innerHTML = `
          <div class="space-y-2">
            <input type="text" id="bancoInput" placeholder="Banco" value="${this._state.banco}" oninput="CajaModule._updateBanco(this.value)" class="w-full border-2 border-slate-100 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-400">
            <input type="text" id="referenciaInput" placeholder="Referencia" value="${this._state.referencia}" oninput="CajaModule._updateReferencia(this.value)" class="w-full border-2 border-slate-100 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-400">
          </div>
        `;
        break;
      case 'cheque':
        detailsEl.innerHTML = `
          <div class="space-y-2">
            <input type="text" placeholder="Banco" class="w-full border-2 border-slate-100 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-400">
            <input type="text" placeholder="Número de cheque" class="w-full border-2 border-slate-100 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-400">
          </div>
        `;
        break;
      case 'mixto':
        detailsEl.innerHTML = `
          <div class="space-y-2">
            <p class="text-xs text-slate-500">Pago mixto - configura los montos</p>
          </div>
        `;
        break;
      default:
        detailsEl.innerHTML = '';
    }
  },

  _updateMontoRecibido(value) {
    this._state.montoRecibido = parseFloat(value) || 0;
    this._updateCartUI();
  },

  _updateBanco(value) { this._state.banco = value; },
  _updateReferencia(value) { this._state.referencia = value; },

  _toggleDiscount() {
    if (this._state.totalDiscount > 0) {
      if (confirm('¿Eliminar descuento?')) {
        this._state.totalDiscount = 0;
        this._state.discountReason = '';
        this._updateCartUI();
      }
    } else {
      const discountAmount = prompt('Monto del descuento (RD$):');
      if (discountAmount) {
        const reason = prompt('Motivo del descuento:');
        this._state.totalDiscount = parseFloat(discountAmount) || 0;
        this._state.discountReason = reason || '';
        this._updateCartUI();
      }
    }
  },

  _toggleRNC() {
    if (this._state.rnc || this._state.empresa) {
      if (confirm('¿Eliminar datos fiscales?')) {
        this._state.rnc = '';
        this._state.empresa = '';
        this._updateCartUI();
      }
    } else {
      const empresa = prompt('Nombre de la Empresa:');
      const rnc = prompt('RNC:');
      if (empresa) this._state.empresa = empresa;
      if (rnc) this._state.rnc = rnc;
      this._updateCartUI();
    }
  },

  _printReceipt() {
    Helpers.toast('Imprimiendo recibo...', 'info');
  },

  _sendWhatsApp() {
    Helpers.toast('Enviando a WhatsApp...', 'info');
  },

  _sendEmail() {
    Helpers.toast('Enviando email...', 'info');
  },

  _downloadPDF() {
    const s = this._state.selectedStudent;
    const totalCart = this._state.cart.reduce((sum, item) => sum + item.amount, 0);
    const total = totalCart + this._state.totalMora - this._state.totalDiscount;

    InvoiceModule.downloadSingle({
      id: Date.now(),
      students: {
        name: s.name,
        classrooms: { name: s.classrooms?.name || '' },
        p1_name: s.p1_name || ''
      },
      concept: this._state.cart.map(i => i.label).join(', '),
      amount: total,
      method: this._state.selectedPaymentMethod,
      paid_date: new Date().toISOString(),
      status: 'paid'
    });
  },

  async _confirmPayment() {
    if (!this._state.cart.length) {
      Helpers.toast('Selecciona al menos un concepto', 'warning');
      return;
    }

    const btn = document.getElementById('btnConfirmarPago');
    if (btn) { btn.disabled = true; btn.textContent = 'Procesando...'; }

    try {
      const s = this._state.selectedStudent;
      const paymentIds = [];

      const notesParts = [];
      if (this._state.rnc) notesParts.push(`RNC:${this._state.rnc}`);
      if (this._state.empresa) notesParts.push(`Empresa:${this._state.empresa}`);
      if (this._state.discountReason) notesParts.push(`Descuento:${this._state.discountReason} (${fmtCurrency(this._state.totalDiscount)})`);

      for (const item of this._state.cart) {
        const { data: pay, error } = await supabase.from('payments').insert({
          student_id: s.id,
          amount: item.amount,
          concept: item.label,
          method: this._state.selectedPaymentMethod,
          status: 'paid',
          paid_date: new Date().toISOString(),
          created_at: new Date().toISOString(),
          notes: notesParts.join('|')
        }).select().single();
        if (error) throw error;
        paymentIds.push(pay.id);

        if (item.type === 'cuota' && item.id) {
          await supabase.from('student_charges')
            .update({ status: 'paid', paid_date: new Date().toISOString() })
            .eq('id', item.id);
        }
      }

      if (paymentIds.length > 0) {
        try {
          await supabase.functions.invoke('generate-invoice', {
            body: { payment_id: paymentIds[0], send_email: true }
          });
        } catch (invoiceErr) {
          console.error('Error generando factura', invoiceErr);
        }
      }

      this._closeModal();
      Helpers.toast('Pago registrado!', 'success');
      await this._loadPendingPayments();
    } catch (e) {
      console.error('Error confirming payment', e);
      Helpers.toast('Error al procesar pago', 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'COBRAR Y EMITIR FACTURA'; }
    }
  },

  _closeModal() {
    const modal = document.getElementById('cajaModalContainer');
    if (modal) modal.remove();
  },

  _setupEventListeners() {},

  async _loadConcepts() {
    try {
      const { data, error } = await supabase
        .from('payment_concepts')
        .select('*')
        .order('name');
      if (error) throw error;
      this._state.concepts = data || [];
    } catch (e) {
      console.error('Error loading concepts', e);
      this._state.concepts = CONCEPTOS_CATALOGO.map(c => ({ id: c.id, name: c.label, amount: c.amount }));
    }
  },

  _openConceptModal(concept = null) {
    const isEdit = !!concept;
    const modalHTML = `
    <div class="fixed inset-0 bg-black/50 backdrop-blur-sm z-[10000] flex items-center justify-center p-4" id="conceptModalOverlay">
      <div class="bg-white rounded-2xl overflow-hidden w-full max-w-md shadow-2xl">
        <div class="p-5 border-b border-slate-100" style="background: linear-gradient(135deg, #28B54D, #239943)">
          <h3 class="text-lg font-black text-white">${isEdit ? 'Editar Concepto' : 'Nuevo Concepto'}</h3>
        </div>
        <div class="p-5">
          <div class="space-y-4">
            <div>
              <label class="block text-xs font-black text-slate-400 uppercase mb-1">Nombre</label>
              <input id="conceptName" type="text" value="${concept?.name || ''}" class="w-full border-2 border-slate-100 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-400">
            </div>
            <div>
              <label class="block text-xs font-black text-slate-400 uppercase mb-1">Monto (RD$)</label>
              <input id="conceptAmount" type="number" value="${concept?.amount || 0}" class="w-full border-2 border-slate-100 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-400">
            </div>
          </div>
        </div>
        <div class="p-5 border-t border-slate-100 flex justify-end gap-3">
          <button onclick="CajaModule._closeConceptModal()" class="px-4 py-2 text-slate-500 font-black text-xs uppercase border-2 border-slate-200 rounded-xl hover:bg-slate-50">Cancelar</button>
          <button onclick="CajaModule._saveConcept(${concept?.id || 'null'})" class="px-4 py-2 text-white font-black text-xs uppercase rounded-xl" style="background: #28B54D">${isEdit ? 'Guardar' : 'Crear'}</button>
        </div>
      </div>
    </div>`;
    const container = document.createElement('div');
    container.innerHTML = modalHTML;
    document.body.appendChild(container);
    if (window.lucide) lucide.createIcons();
  },

  _closeConceptModal() {
    document.getElementById('conceptModalOverlay')?.remove();
  },

  async _saveConcept(id) {
    const name = document.getElementById('conceptName').value.trim();
    const amount = parseFloat(document.getElementById('conceptAmount').value);

    if (!name) {
      Helpers.toast('Ingresa un nombre', 'warning');
      return;
    }

    try {
      if (id) {
        const { error } = await supabase
          .from('payment_concepts')
          .update({ name, amount })
          .eq('id', id);
        if (error) throw error;
        Helpers.toast('Concepto actualizado', 'success');
      } else {
        const { error } = await supabase
          .from('payment_concepts')
          .insert({ name, amount });
        if (error) throw error;
        Helpers.toast('Concepto creado', 'success');
      }
      this._closeConceptModal();
      await this._loadConcepts();
      if (this._state.selectedStudent) {
        this._renderCobroModal();
      }
    } catch (e) {
      console.error('Error saving concept', e);
      Helpers.toast('Error al guardar concepto', 'error');
    }
  },

  async _deleteConcept(id) {
    if (!confirm('¿Estás seguro de eliminar este concepto?')) return;

    try {
      const { error } = await supabase
        .from('payment_concepts')
        .delete()
        .eq('id', id);
      if (error) throw error;
      Helpers.toast('Concepto eliminado', 'success');
      await this._loadConcepts();
      if (this._state.selectedStudent) {
        this._renderCobroModal();
      }
    } catch (e) {
      console.error('Error deleting concept', e);
      Helpers.toast('Error al eliminar concepto', 'error');
    }
  },

  _exportDailyReport() {
    Helpers.toast('Generando reporte diario...', 'info');
  }
};
