/**
 * Accounting Module - Assistant Panel
 * Simplified accounting features for assistant users
 */
import { supabase } from '../shared/supabase.js';
import { Helpers } from '../shared/helpers.js';

export const AssistantAccountingModule = {
  _currentTab: 'daily',

  async init() {
    this.setupEventListeners();
    this.showTab('daily');
  },

  setupEventListeners() {
    // Tab navigation
    document.querySelectorAll('[data-accounting-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.showTab(btn.dataset.accountingTab);
      });
    });
  },

  showTab(tabName) {
    this._currentTab = tabName;
    
    // Update tab buttons
    document.querySelectorAll('[data-accounting-tab]').forEach(btn => {
      btn.classList.toggle('bg-blue-600', btn.dataset.accountingTab === tabName);
      btn.classList.toggle('text-white', btn.dataset.accountingTab === tabName);
      btn.classList.toggle('bg-slate-100', btn.dataset.accountingTab !== tabName);
      btn.classList.toggle('text-slate-600', btn.dataset.accountingTab !== tabName);
    });

    // Show/hide content sections
    document.querySelectorAll('.accounting-section').forEach(section => {
      section.classList.toggle('hidden', section.id !== `accounting-${tabName}`);
    });

    // Load content for the tab
    this.refreshCurrentTab();
  },

  async refreshCurrentTab() {
    switch (this._currentTab) {
      case 'daily':
        await this.loadDailyReports();
        break;
      case 'payments':
        await this.loadPayments();
        break;
      case 'students':
        await this.loadStudents();
        break;
    }
  },

  // ==================== DAILY REPORTS ====================
  async loadDailyReports() {
    const container = document.getElementById('accounting-daily');
    if (!container) return;

    container.innerHTML = '<div class="flex justify-center py-12"><div class="animate-spin w-8 h-8 border-b-2 border-blue-600 rounded-full"></div></div>';

    try {
      const today = new Date().toISOString().split('T')[0];
      const { data: payments } = await supabase
        .from('payments')
        .select(`
          *,
          students (name, matricula),
          classrooms (name)
        `)
        .gte('paid_date', `${today}T00:00:00`)
        .lte('paid_date', `${today}T23:59:59`);

      const processedData = this.processDailyData(payments || []);
      container.innerHTML = this.renderDailyReports(processedData);
      
      if (window.lucide) lucide.createIcons();
    } catch (error) {
      console.error('Error loading daily reports:', error);
      container.innerHTML = '<div class="p-8 text-center text-red-500">Error al cargar reportes diarios</div>';
    }
  },

  processDailyData(payments) {
    const collectedToday = payments
      .filter(p => p.status === 'paid')
      .reduce((sum, p) => sum + Number(p.amount), 0);
    
    const paymentsByMethod = {};
    payments.forEach(p => {
      const method = p.method || 'Otro';
      paymentsByMethod[method] = (paymentsByMethod[method] || 0) + 1;
    });

    return {
      collectedToday,
      paymentsCount: payments.length,
      payments,
      paymentsByMethod
    };
  },

  renderDailyReports(data) {
    return `
      <div class="space-y-6">
        <!-- KPIs -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div class="bg-gradient-to-br from-green-500 to-green-600 p-6 rounded-2xl text-white shadow-lg">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs font-bold uppercase opacity-90">Cobrado Hoy</p>
                <p class="text-3xl font-black mt-2">$${data.collectedToday.toLocaleString()}</p>
              </div>
              <i data-lucide="dollar-sign" class="w-12 h-12 opacity-30"></i>
            </div>
          </div>
          
          <div class="bg-gradient-to-br from-blue-500 to-blue-600 p-6 rounded-2xl text-white shadow-lg">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs font-bold uppercase opacity-90">Pagos Hoy</p>
                <p class="text-3xl font-black mt-2">${data.paymentsCount}</p>
              </div>
              <i data-lucide="receipt" class="w-12 h-12 opacity-30"></i>
            </div>
          </div>
          
          <div class="bg-gradient-to-br from-purple-500 to-purple-600 p-6 rounded-2xl text-white shadow-lg">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs font-bold uppercase opacity-90">Métodos</p>
                <p class="text-3xl font-black mt-2">${Object.keys(data.paymentsByMethod).length}</p>
              </div>
              <i data-lucide="credit-card" class="w-12 h-12 opacity-30"></i>
            </div>
          </div>
        </div>

        <!-- Payments List -->
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="px-6 py-4 border-b border-slate-200">
            <h3 class="text-lg font-black text-slate-800">Pagos de Hoy</h3>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead class="bg-slate-50">
                <tr>
                  <th class="px-6 py-3 text-left text-xs font-black text-slate-400 uppercase">Estudiante</th>
                  <th class="px-6 py-3 text-left text-xs font-black text-slate-400 uppercase">Monto</th>
                  <th class="px-6 py-3 text-left text-xs font-black text-slate-400 uppercase">Método</th>
                  <th class="px-6 py-3 text-left text-xs font-black text-slate-400 uppercase">Estado</th>
                  <th class="px-6 py-3 text-left text-xs font-black text-slate-400 uppercase">Hora</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200">
                ${data.payments.map(payment => `
                  <tr class="hover:bg-slate-50 transition">
                    <td class="px-6 py-4">
                      <div class="font-bold text-slate-800">${payment.students?.name || 'Desconocido'}</div>
                      <div class="text-xs text-slate-500">${payment.students?.matricula || '-'}</div>
                    </td>
                    <td class="px-6 py-4 font-black text-slate-800">$${Number(payment.amount).toLocaleString()}</td>
                    <td class="px-6 py-4">
                      <span class="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 capitalize">
                        ${payment.method || 'Otro'}
                      </span>
                    </td>
                    <td class="px-6 py-4">
                      <span class="px-3 py-1 rounded-full text-xs font-bold ${payment.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}">
                        ${payment.status === 'paid' ? 'Pagado' : 'Pendiente'}
                      </span>
                    </td>
                    <td class="px-6 py-4 text-sm text-slate-600">
                      ${payment.paid_date ? new Date(payment.paid_date).toLocaleTimeString() : '-'}
                    </td>
                  </tr>
                `).join('') || '<tr><td colspan="5" class="px-6 py-12 text-center text-slate-400">No hay pagos hoy</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  },

  // ==================== PAYMENTS ====================
  async loadPayments() {
    const container = document.getElementById('accounting-payments');
    if (!container) return;

    container.innerHTML = '<div class="flex justify-center py-12"><div class="animate-spin w-8 h-8 border-b-2 border-blue-600 rounded-full"></div></div>';

    try {
      const { data: payments } = await supabase
        .from('payments')
        .select(`
          *,
          students (name, matricula),
          classrooms (name)
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      container.innerHTML = this.renderPaymentsList(payments || []);
      
      if (window.lucide) lucide.createIcons();
    } catch (error) {
      console.error('Error loading payments:', error);
      container.innerHTML = '<div class="p-8 text-center text-red-500">Error al cargar pagos</div>';
    }
  },

  renderPaymentsList(payments) {
    return `
      <div class="space-y-6">
        <!-- Filters -->
        <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap gap-4">
          <div class="flex-1 min-w-[200px]">
            <input type="text" id="paymentSearch" placeholder="Buscar estudiante..." 
              class="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              oninput="AssistantAccountingModule.filterPayments()">
          </div>
          <select id="paymentStatusFilter" class="px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" onchange="AssistantAccountingModule.filterPayments()">
            <option value="">Todos los estados</option>
            <option value="paid">Pagado</option>
            <option value="pending">Pendiente</option>
            <option value="review">En revisión</option>
          </select>
        </div>

        <!-- Payments Table -->
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead class="bg-slate-50">
                <tr>
                  <th class="px-6 py-3 text-left text-xs font-black text-slate-400 uppercase">Estudiante</th>
                  <th class="px-6 py-3 text-left text-xs font-black text-slate-400 uppercase">Monto</th>
                  <th class="px-6 py-3 text-left text-xs font-black text-slate-400 uppercase">Método</th>
                  <th class="px-6 py-3 text-left text-xs font-black text-slate-400 uppercase">Estado</th>
                  <th class="px-6 py-3 text-left text-xs font-black text-slate-400 uppercase">Fecha</th>
                  <th class="px-6 py-3 text-left text-xs font-black text-slate-400 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200" id="paymentsTableBody">
                ${payments.map(payment => this.renderPaymentRow(payment)).join('') || '<tr><td colspan="6" class="px-6 py-12 text-center text-slate-400">No hay pagos registrados</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  },

  renderPaymentRow(payment) {
    return `
      <tr class="hover:bg-slate-50 transition" data-payment-row="${payment.id}">
        <td class="px-6 py-4">
          <div class="font-bold text-slate-800">${Helpers.escapeHTML(payment.students?.name || 'Desconocido')}</div>
          <div class="text-xs text-slate-500">${payment.students?.matricula || '-'}</div>
        </td>
        <td class="px-6 py-4 font-black text-slate-800">$${Number(payment.amount).toLocaleString()}</td>
        <td class="px-6 py-4">
          <span class="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 capitalize">
            ${payment.method || 'Otro'}
          </span>
        </td>
        <td class="px-6 py-4">
          <span class="px-3 py-1 rounded-full text-xs font-bold ${payment.status === 'paid' ? 'bg-green-100 text-green-700' : payment.status === 'review' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}">
            ${payment.status === 'paid' ? 'Pagado' : payment.status === 'review' ? 'En revisión' : 'Pendiente'}
          </span>
        </td>
        <td class="px-6 py-4 text-sm text-slate-600">
          ${payment.created_at ? new Date(payment.created_at).toLocaleDateString() : '-'}
        </td>
        <td class="px-6 py-4">
          <div class="flex gap-2">
            ${payment.status !== 'paid' ? `
              <button onclick="AssistantAccountingModule.markAsPaid(${payment.id})" class="px-3 py-1 bg-green-100 text-green-700 rounded-lg text-sm font-bold hover:bg-green-200 transition">
                <i data-lucide="check" class="w-4 h-4 inline mr-1"></i>Marcar Pagado
              </button>
            ` : ''}
            <button onclick="AssistantAccountingModule.viewPayment(${payment.id})" class="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg text-sm font-bold hover:bg-blue-200 transition">
              <i data-lucide="eye" class="w-4 h-4 inline mr-1"></i>Ver
            </button>
          </div>
        </td>
      </tr>
    `;
  },

  async filterPayments() {
    const search = document.getElementById('paymentSearch')?.value?.toLowerCase() || '';
    const status = document.getElementById('paymentStatusFilter')?.value || '';
    
    document.querySelectorAll('[data-payment-row]').forEach(row => {
      const text = row.textContent.toLowerCase();
      const matchesSearch = !search || text.includes(search);
      const matchesStatus = !status || text.includes(status.toLowerCase());
      row.style.display = matchesSearch && matchesStatus ? '' : 'none';
    });
  },

  async markAsPaid(paymentId) {
    if (!confirm('¿Marcar este pago como pagado?')) return;

    try {
      const { error } = await supabase
        .from('payments')
        .update({ 
          status: 'paid', 
          paid_date: new Date().toISOString() 
        })
        .eq('id', paymentId);

      if (error) throw error;

      Helpers.safeToast('Pago marcado como pagado exitosamente', 'success');
      await this.loadPayments();
    } catch (error) {
      console.error('Error marking payment as paid:', error);
      Helpers.safeToast('Error al marcar pago como pagado', 'error');
    }
  },

  async viewPayment(paymentId) {
    try {
      const { data: payment } = await supabase
        .from('payments')
        .select(`
          *,
          students (name, matricula),
          classrooms (name)
        `)
        .eq('id', paymentId)
        .single();

      if (!payment) throw new Error('Payment not found');

      const modalHtml = this.createPaymentDetailModal(payment);
      if (window.openGlobalModal) {
        window.openGlobalModal(modalHtml);
      }

      if (window.lucide) lucide.createIcons();
    } catch (error) {
      console.error('Error viewing payment:', error);
      Helpers.safeToast('Error al ver pago', 'error');
    }
  },

  createPaymentDetailModal(payment) {
    return `
      <div class="bg-white rounded-[2rem] overflow-hidden shadow-2xl max-w-lg w-full mx-4">
        <div class="bg-gradient-to-r from-blue-600 to-blue-700 px-8 py-6 flex items-center justify-between">
          <div>
            <h3 class="text-xl font-black text-white">Detalle de Pago</h3>
            <p class="text-white/80 font-medium mt-1">${payment.students?.name || 'Desconocido'}</p>
          </div>
          <button onclick="window.closeGlobalModal?.()" class="p-2 hover:bg-white/20 rounded-full text-white transition">
            <i data-lucide="x" class="w-6 h-6"></i>
          </button>
        </div>
        
        <div class="p-8">
          <div class="space-y-4">
            <div class="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
              <span class="font-bold text-slate-700">Monto</span>
              <span class="text-2xl font-black text-slate-800">$${Number(payment.amount).toLocaleString()}</span>
            </div>
            
            <div class="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
              <span class="font-bold text-slate-700">Método</span>
              <span class="font-bold text-slate-800 capitalize">${payment.method || 'Otro'}</span>
            </div>
            
            <div class="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
              <span class="font-bold text-slate-700">Estado</span>
              <span class="px-3 py-1 rounded-full text-xs font-bold ${payment.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}">
                ${payment.status === 'paid' ? 'Pagado' : 'Pendiente'}
              </span>
            </div>
            
            <div class="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
              <span class="font-bold text-slate-700">Fecha</span>
              <span class="font-bold text-slate-800">${payment.created_at ? new Date(payment.created_at).toLocaleDateString() : '-'}</span>
            </div>
            
            ${payment.concept ? `
              <div class="p-4 bg-slate-50 rounded-xl">
                <p class="text-xs font-bold text-slate-400 uppercase mb-1">Concepto</p>
                <p class="font-medium text-slate-800">${payment.concept}</p>
              </div>
            ` : ''}
            
            ${payment.reference ? `
              <div class="p-4 bg-slate-50 rounded-xl">
                <p class="text-xs font-bold text-slate-400 uppercase mb-1">Referencia</p>
                <p class="font-medium text-slate-800">${payment.reference}</p>
              </div>
            ` : ''}
          </div>
        </div>
        
        <div class="p-6 border-t border-slate-200 bg-slate-50 flex gap-3 justify-end">
          <button onclick="window.closeGlobalModal?.()" class="px-6 py-2 bg-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-300 transition">
            Cerrar
          </button>
          ${payment.status !== 'paid' ? `
            <button onclick="window.closeGlobalModal?.(); AssistantAccountingModule.markAsPaid(${payment.id})" class="px-6 py-2 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition">
              Marcar Pagado
            </button>
          ` : ''}
        </div>
      </div>
    `;
  },

  // ==================== STUDENTS ====================
  async loadStudents() {
    const container = document.getElementById('accounting-students');
    if (!container) return;

    container.innerHTML = '<div class="flex justify-center py-12"><div class="animate-spin w-8 h-8 border-b-2 border-blue-600 rounded-full"></div></div>';

    try {
      const { data: students } = await supabase
        .from('students')
        .select(`
          *,
          student_enrollments (
            student_charges (*)
          ),
          classrooms (name)
        `)
        .eq('is_active', true);

      container.innerHTML = this.renderStudentsList(students || []);
      
      if (window.lucide) lucide.createIcons();
    } catch (error) {
      console.error('Error loading students:', error);
      container.innerHTML = '<div class="p-8 text-center text-red-500">Error al cargar estudiantes</div>';
    }
  },

  renderStudentsList(students) {
    return `
      <div class="space-y-6">
        <!-- Search -->
        <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div class="flex gap-4 flex-wrap">
            <div class="flex-1 min-w-[200px]">
              <input type="text" id="studentAccountingSearch" placeholder="Buscar estudiante..." 
                class="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                oninput="AssistantAccountingModule.filterStudents()">
            </div>
          </div>
        </div>

        <!-- Students Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" id="studentsAccountingGrid">
          ${students.map(student => {
            const charges = student.student_enrollments?.flatMap(e => e.student_charges) || [];
            const totalBilled = charges.reduce((sum, c) => sum + Number(c.amount), 0);
            const totalPaid = charges.filter(c => c.status === 'paid').reduce((sum, c) => sum + Number(c.amount), 0);
            const pending = totalBilled - totalPaid;
            
            return `
              <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-lg transition" data-student-accounting="${student.id}">
                <div class="bg-gradient-to-r from-indigo-500 to-purple-500 p-6 text-white">
                  <h3 class="text-lg font-black">${Helpers.escapeHTML(student.name)}</h3>
                  <p class="text-white/80 text-sm font-medium">${student.matricula || 'Sin matrícula'}</p>
                </div>
                <div class="p-6">
                  <div class="grid grid-cols-2 gap-4 mb-4">
                    <div class="text-center">
                      <p class="text-xs font-bold text-slate-400 uppercase">Total Facturado</p>
                      <p class="text-lg font-black text-slate-800">$${totalBilled.toLocaleString()}</p>
                    </div>
                    <div class="text-center">
                      <p class="text-xs font-bold text-slate-400 uppercase">Pendiente</p>
                      <p class="text-lg font-black ${pending > 0 ? 'text-amber-600' : 'text-green-600'}">$${pending.toLocaleString()}</p>
                    </div>
                  </div>
                  <div class="flex gap-2">
                    <button onclick="AssistantAccountingModule.viewStudentAccount(${student.id})" class="flex-1 px-4 py-2 bg-blue-100 text-blue-700 rounded-xl font-bold text-sm hover:bg-blue-200 transition">
                      Ver Cuenta
                    </button>
                    <button onclick="AssistantAccountingModule.registerPayment(${student.id})" class="flex-1 px-4 py-2 bg-green-100 text-green-700 rounded-xl font-bold text-sm hover:bg-green-200 transition">
                      <i data-lucide="plus" class="w-4 h-4 inline mr-1"></i>Pago
                    </button>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  },

  async filterStudents() {
    const search = document.getElementById('studentAccountingSearch')?.value?.toLowerCase() || '';
    
    document.querySelectorAll('[data-student-accounting]').forEach(card => {
      const text = card.textContent.toLowerCase();
      card.style.display = !search || text.includes(search) ? '' : 'none';
    });
  },

  async viewStudentAccount(studentId) {
    // Redirect or show student account details
    Helpers.safeToast('Funcionalidad próximamente disponible', 'info');
  },

  async registerPayment(studentId) {
    // Redirect to payment registration
    if (window.App?.payments) {
      window.App.payments.openPaymentModal(studentId);
    } else {
      Helpers.safeToast('Redirigiendo a registros de pagos...', 'info');
    }
  }
};

window.AssistantAccountingModule = AssistantAccountingModule;
