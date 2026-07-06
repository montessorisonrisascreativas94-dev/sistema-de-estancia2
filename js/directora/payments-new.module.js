import { supabase } from '../shared/supabase.js';
import { Helpers } from '../shared/helpers.js';
import { InvoicingModule } from './invoicing.module.js';
import { DirectorApi } from './api.js';

const CURRENCY = 'RD$';

export const NewPaymentsModule = {
  // Estado del módulo
  state: {
    selectedStudent: null,
    cart: [],
    currentTab: 'pending',
    searchQuery: '',
    loading: false,
    mixedPayments: [
      { method: 'efectivo', amount: 0 }
    ],
    lastInvoice: null
  },

  // Inicializar el módulo
  async init() {
    console.log('🔄 Inicializando NewPaymentsModule...');
    this._bindEvents();
    this._loadInitialData();
  },

  // Vincular eventos
  _bindEvents() {
    const self = this;

    // Buscador de estudiantes
    const searchInput = document.getElementById('newPaymentSearch');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        self.state.searchQuery = e.target.value;
        self._searchStudents(e.target.value);
      });
    }

    // Tabs (Pendientes / Historial)
    const tabPending = document.getElementById('tabPending');
    const tabHistory = document.getElementById('tabHistory');
    if (tabPending) {
      tabPending.addEventListener('click', () => self._switchTab('pending'));
    }
    if (tabHistory) {
      tabHistory.addEventListener('click', () => self._switchTab('history'));
    }

    // Botones del carrito
    const clearCartBtn = document.getElementById('clearCartBtn');
    if (clearCartBtn) {
      clearCartBtn.addEventListener('click', () => self._clearCart());
    }

    const continueBtn = document.getElementById('continueToPaymentBtn');
    if (continueBtn) {
      continueBtn.addEventListener('click', () => self._openPaymentMethodModal());
    }

    // Métodos de pago
    const paymentMethodInputs = document.querySelectorAll('input[name="paymentMethod"]');
    paymentMethodInputs.forEach(input => {
      input.addEventListener('change', (e) => self._updateMethodDetails(e.target.value));
    });

    // Botones del modal
    const closeModalBtn = document.getElementById('closePaymentModalBtn');
    const cancelModalBtn = document.getElementById('cancelPaymentModalBtn');
    const confirmBtn = document.getElementById('confirmPaymentBtn');

    if (closeModalBtn) closeModalBtn.addEventListener('click', () => self._closePaymentMethodModal());
    if (cancelModalBtn) cancelModalBtn.addEventListener('click', () => self._closePaymentMethodModal());
    if (confirmBtn) confirmBtn.addEventListener('click', () => self._confirmPayment());

    // Botones del modal de éxito
    const downloadInvoiceBtn = document.getElementById('downloadInvoiceBtn');
    const sendEmailBtn = document.getElementById('sendInvoiceEmailBtn');
    const closeSuccessBtn = document.getElementById('closeSuccessModalBtn');

    if (downloadInvoiceBtn) downloadInvoiceBtn.addEventListener('click', () => self._downloadInvoice());
    if (sendEmailBtn) sendEmailBtn.addEventListener('click', () => self._sendInvoiceEmail());
    if (closeSuccessBtn) closeSuccessBtn.addEventListener('click', () => self._closeSuccessModal());

    // Botón para agregar métodos de pago mixto
    const addMixedMethodBtn = document.getElementById('addMixedMethodBtn');
    if (addMixedMethodBtn) {
      addMixedMethodBtn.addEventListener('click', () => self._addMixedPaymentMethod());
    }
  },

  // Cargar datos iniciales
  async _loadInitialData() {
    // Cargar estudiantes iniciales (primeros 20)
    await this._searchStudents('');
  },

  // Buscar estudiantes
  async _searchStudents(query) {
    const container = document.getElementById('studentSearchResults');
    if (!container) return;

    container.innerHTML = '<div class="p-6 text-center"><div class="animate-spin w-6 h-6 border-2 border-[#0B63C7] border-t-transparent rounded-full mx-auto"></div></div>';

    try {
      let q = supabase.from('students').select('*, classrooms(name), profiles!parent_id(*)');

      if (query && query.trim()) {
        const searchTerm = query.trim().toLowerCase();
        q = q.or(
          `name.ilike.%${searchTerm}%,matricula.ilike.%${searchTerm}%,profiles.email.ilike.%${searchTerm}%,profiles.phone.ilike.%${searchTerm}%`
        );
      }

      q = q.order('name').limit(20);
      const { data: students, error } = await q;

      if (error) throw error;

      if (!students || students.length === 0) {
        container.innerHTML = `
          <div class="p-8 text-center text-slate-400">
            <i data-lucide="search" class="w-12 h-12 mx-auto mb-3 opacity-50"></i>
            <p class="text-sm font-medium">No se encontraron estudiantes</p>
          </div>
        `;
        if (window.lucide) lucide.createIcons();
        return;
      }

      container.innerHTML = students.map(student => `
        <div class="p-4 hover:bg-slate-50 cursor-pointer transition-colors border-b border-slate-100 last:border-b-0" data-student-id="${student.id}">
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 bg-gradient-to-br from-[#0B63C7] to-blue-600 rounded-xl flex items-center justify-center text-lg font-black text-white shadow-md">
              ${(student.name || '?').charAt(0).toUpperCase()}
            </div>
            <div class="flex-1 min-w-0">
              <h4 class="font-bold text-slate-800 truncate">${Helpers.escapeHTML(student.name || 'Sin nombre')}</h4>
              <p class="text-xs text-slate-500">
                ${student.classrooms?.name ? Helpers.escapeHTML(student.classrooms.name) : 'Sin aula'}
                ${student.matricula ? `• ${Helpers.escapeHTML(student.matricula)}` : ''}
              </p>
            </div>
            <i data-lucide="chevron-right" class="w-5 h-5 text-slate-400"></i>
          </div>
        </div>
      `).join('');

      // Vincular eventos de clic a los resultados
      const studentItems = container.querySelectorAll('[data-student-id]');
      studentItems.forEach(item => {
        item.addEventListener('click', () => {
          const studentId = item.dataset.studentId;
          const student = students.find(s => String(s.id) === String(studentId));
          if (student) {
            this._selectStudent(student);
          }
        });
      });

      if (window.lucide) lucide.createIcons();
    } catch (error) {
      console.error('Error al buscar estudiantes:', error);
      container.innerHTML = `
        <div class="p-8 text-center text-rose-500">
          <i data-lucide="alert-circle" class="w-12 h-12 mx-auto mb-3 opacity-75"></i>
          <p class="text-sm font-medium">Error al buscar estudiantes</p>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
    }
  },

  // Seleccionar un estudiante
  async _selectStudent(student) {
    this.state.selectedStudent = student;
    this.state.cart = [];
    this._renderStudentFile(student);
  },

  // Renderizar expediente financiero
  async _renderStudentFile(student) {
    const noStudentEl = document.getElementById('noStudentSelected');
    const fileEl = document.getElementById('studentFinancialFile');

    if (noStudentEl) noStudentEl.classList.add('hidden');
    if (fileEl) fileEl.classList.remove('hidden');

    // Actualizar avatar y datos básicos
    const avatarEl = document.getElementById('studentAvatar');
    const nameEl = document.getElementById('studentName');
    const classEl = document.getElementById('studentClassroom');

    if (avatarEl) avatarEl.textContent = (student.name || '?').charAt(0).toUpperCase();
    if (nameEl) nameEl.textContent = Helpers.escapeHTML(student.name || 'Sin nombre');
    if (classEl) classEl.textContent = student.classrooms?.name ? Helpers.escapeHTML(student.classrooms.name) : 'Sin aula';

    // Cargar y renderizar items pendientes
    await this._loadPendingItems(student);
    await this._loadPaymentHistory(student);
    this._updateCartUI();
  },

  // Cargar items pendientes
  async _loadPendingItems(student) {
    const container = document.getElementById('pendingItemsContainer');
    if (!container) return;

    container.innerHTML = '<div class="p-6 text-center"><div class="animate-spin w-6 h-6 border-2 border-[#0B63C7] border-t-transparent rounded-full mx-auto"></div></div>';

    try {
      // Cargar pagos pendientes de la base de datos
      const { data: payments, error } = await supabase
        .from('payments')
        .select('*')
        .eq('student_id', student.id)
        .in('status', ['pending', 'overdue', 'review'])
        .order('due_date', { ascending: true });

      if (error) throw error;

      // Si no hay pagos, mostrar algunos items de ejemplo
      const items = (payments && payments.length > 0) ? payments.map(p => ({
        id: p.id,
        concept: p.concept || 'Mensualidad',
        amount: Number(p.amount || 0),
        dueDate: p.due_date,
        status: this._getStatus(p),
        type: 'payment'
      })) : this._getExampleItems(student);

      if (items.length === 0) {
        container.innerHTML = `
          <div class="p-8 text-center text-slate-400">
            <i data-lucide="inbox" class="w-12 h-12 mx-auto mb-3 opacity-50"></i>
            <p class="text-sm font-medium">No hay pagos pendientes</p>
          </div>
        `;
        if (window.lucide) lucide.createIcons();
        return;
      }

      container.innerHTML = items.map(item => `
        <div class="p-4 bg-white border border-slate-100 rounded-2xl mb-3 hover:border-[#0B63C7] transition-colors ${this._isInCart(item.id) ? 'ring-2 ring-[#0B63C7] bg-blue-50' : ''}">
          <div class="flex items-center justify-between gap-4">
            <div class="flex-1 min-w-0">
              <h4 class="font-bold text-slate-800 truncate">${Helpers.escapeHTML(item.concept)}</h4>
              <div class="flex items-center gap-2 mt-1">
                ${item.dueDate ? `
                  <span class="text-xs text-slate-500">
                    <i data-lucide="calendar" class="w-3 h-3 inline mr-1"></i>
                    Vence: ${new Date(item.dueDate + 'T00:00:00').toLocaleDateString('es-ES')}
                  </span>
                ` : ''}
                ${item.status === 'overdue' ? `
                  <span class="text-xs font-black text-rose-600 bg-rose-100 px-2 py-0.5 rounded-full">Vencido</span>
                ` : item.status === 'review' ? `
                  <span class="text-xs font-black text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full">En revisión</span>
                ` : ''}
              </div>
            </div>
            <div class="text-right">
              <p class="text-lg font-black text-slate-800">${CURRENCY} ${item.amount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <button 
                class="mt-2 px-4 py-1.5 ${this._isInCart(item.id) ? 'bg-slate-200 text-slate-600' : 'bg-gradient-to-r from-[#0B63C7] to-blue-600 text-white'} rounded-xl text-xs font-black uppercase tracking-wide transition-all hover:shadow-md active:scale-95"
                data-item-id="${item.id}"
              >
                ${this._isInCart(item.id) ? 'Quitar' : 'Agregar'}
              </button>
            </div>
          </div>
        </div>
      `).join('');

      // Vincular eventos de agregar/quitar
      container.querySelectorAll('[data-item-id]').forEach(btn => {
        btn.addEventListener('click', () => {
          const itemId = btn.dataset.itemId;
          const item = items.find(i => String(i.id) === String(itemId));
          if (item) {
            if (this._isInCart(itemId)) {
              this._removeFromCart(itemId);
            } else {
              this._addToCart(item);
            }
          }
        });
      });

      if (window.lucide) lucide.createIcons();
    } catch (error) {
      console.error('Error al cargar items pendientes:', error);
      container.innerHTML = `
        <div class="p-8 text-center text-rose-500">
          <i data-lucide="alert-circle" class="w-12 h-12 mx-auto mb-3 opacity-75"></i>
          <p class="text-sm font-medium">Error al cargar pagos pendientes</p>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
    }
  },

  // Cargar historial de pagos
  async _loadPaymentHistory(student) {
    const container = document.getElementById('historyContainer');
    if (!container) return;

    try {
      const { data: payments, error } = await supabase
        .from('payments')
        .select('*')
        .eq('student_id', student.id)
        .eq('status', 'paid')
        .order('paid_date', { ascending: false })
        .limit(20);

      if (error) throw error;

      if (!payments || payments.length === 0) {
        container.innerHTML = `
          <div class="p-8 text-center text-slate-400">
            <i data-lucide="history" class="w-12 h-12 mx-auto mb-3 opacity-50"></i>
            <p class="text-sm font-medium">No hay pagos registrados</p>
          </div>
        `;
        if (window.lucide) lucide.createIcons();
        return;
      }

      container.innerHTML = payments.map(payment => `
        <div class="p-4 bg-white border border-slate-100 rounded-2xl mb-3">
          <div class="flex items-center justify-between gap-4">
            <div class="flex-1 min-w-0">
              <h4 class="font-bold text-slate-800 truncate">${Helpers.escapeHTML(payment.concept || 'Mensualidad')}</h4>
              <p class="text-xs text-slate-500">
                ${payment.paid_date ? new Date(payment.paid_date).toLocaleDateString('es-ES') : '-'}
              </p>
            </div>
            <div class="text-right">
              <p class="text-lg font-black text-emerald-600">${CURRENCY} ${Number(payment.amount || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <span class="text-xs font-black text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">Pagado</span>
            </div>
          </div>
        </div>
      `).join('');

      if (window.lucide) lucide.createIcons();
    } catch (error) {
      console.error('Error al cargar historial:', error);
      container.innerHTML = `
        <div class="p-8 text-center text-rose-500">
          <i data-lucide="alert-circle" class="w-12 h-12 mx-auto mb-3 opacity-75"></i>
          <p class="text-sm font-medium">Error al cargar historial</p>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
    }
  },

  // Items de ejemplo
  _getExampleItems(student) {
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const items = [];

    const concepts = ['Mensualidad', 'Materiales', 'Uniforme', 'Excursión'];
    for (let i = 0; i < 3; i++) {
      const month = (currentMonth - i + 12) % 12;
      const dueDate = new Date(currentYear, month, 5).toISOString().split('T')[0];
      const isOverdue = new Date(dueDate + 'T00:00:00') < new Date().setHours(0, 0, 0, 0);
      items.push({
        id: `example-${i}`,
        concept: `${concepts[i]} ${this._getMonthName(month)}`,
        amount: 9850,
        dueDate,
        status: isOverdue ? 'overdue' : 'pending',
        type: 'payment'
      });
    }
    return items;
  },

  _getMonthName(month) {
    const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return months[month];
  },

  _getStatus(payment) {
    if (payment.status === 'paid') return 'paid';
    if (payment.status === 'review') return 'review';
    if (!payment.due_date) return 'pending';
    const due = new Date(payment.due_date + 'T00:00:00');
    const now = new Date().setHours(0, 0, 0, 0);
    return now > due ? 'overdue' : 'pending';
  },

  // Carrito
  _isInCart(itemId) {
    return this.state.cart.some(item => String(item.id) === String(itemId));
  },

  _addToCart(item) {
    if (!this._isInCart(item.id)) {
      this.state.cart.push(item);
      this._updateCartUI();
      if (this.state.selectedStudent) {
        this._loadPendingItems(this.state.selectedStudent);
      }
    }
  },

  _removeFromCart(itemId) {
    this.state.cart = this.state.cart.filter(item => String(item.id) !== String(itemId));
    this._updateCartUI();
    if (this.state.selectedStudent) {
      this._loadPendingItems(this.state.selectedStudent);
    }
  },

  _clearCart() {
    this.state.cart = [];
    this.state.mixedPayments = [ { method: 'efectivo', amount: 0 } ];
    this._updateCartUI();
    if (this.state.selectedStudent) {
      this._loadPendingItems(this.state.selectedStudent);
    }
  },

  _calculateTotals() {
    let subtotal = 0;
    let mora = 0;
    this.state.cart.forEach(item => {
      subtotal += item.amount;
      if (item.status === 'overdue') {
        mora += 500;
      }
    });
    const discount = 0;
    const total = subtotal - discount + mora;
    return { subtotal, mora, discount, total };
  },

  _updateCartUI() {
    const cartContainer = document.getElementById('cartContainer');
    const cartItemsEl = document.getElementById('cartItems');
    const subtotalEl = document.getElementById('cartSubtotal');
    const discountEl = document.getElementById('cartDiscount');
    const discountRowEl = document.getElementById('cartDiscountRow');
    const moraEl = document.getElementById('cartMora');
    const moraRowEl = document.getElementById('cartMoraRow');
    const totalEl = document.getElementById('cartTotal');

    if (!cartContainer) return;

    if (this.state.cart.length === 0) {
      cartContainer.classList.add('hidden');
      return;
    }

    cartContainer.classList.remove('hidden');

    if (cartItemsEl) {
      cartItemsEl.innerHTML = this.state.cart.map(item => `
        <div class="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 mb-2">
          <div class="flex-1 min-w-0 mr-3">
            <p class="font-bold text-slate-800 truncate text-sm">${Helpers.escapeHTML(item.concept)}</p>
            ${item.status === 'overdue' ? '<p class="text-xs text-rose-600">+ mora</p>' : ''}
          </div>
          <div class="flex items-center gap-3">
            <span class="font-black text-slate-800 text-sm">${CURRENCY} ${item.amount.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
            <button class="p-1.5 bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-200 transition-colors" data-remove-item="${item.id}">
              <i data-lucide="x" class="w-4 h-4"></i>
            </button>
          </div>
        </div>
      `).join('');

      cartItemsEl.querySelectorAll('[data-remove-item]').forEach(btn => {
        btn.addEventListener('click', () => {
          this._removeFromCart(btn.dataset.removeItem);
        });
      });

      if (window.lucide) lucide.createIcons();
    }

    const { subtotal, mora, discount, total } = this._calculateTotals();

    if (subtotalEl) subtotalEl.textContent = `${CURRENCY} ${subtotal.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
    if (discountEl) discountEl.textContent = `- ${CURRENCY} ${discount.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
    if (discountRowEl) discountRowEl.classList.toggle('hidden', discount === 0);
    if (moraEl) moraEl.textContent = `${CURRENCY} ${mora.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
    if (moraRowEl) moraRowEl.classList.toggle('hidden', mora === 0);
    if (totalEl) totalEl.textContent = `${CURRENCY} ${total.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
  },

  // Tabs
  _switchTab(tab) {
    this.state.currentTab = tab;
    const pendingTab = document.getElementById('tabPending');
    const historyTab = document.getElementById('tabHistory');
    const pendingContainer = document.getElementById('pendingItemsContainer');
    const historyContainer = document.getElementById('historyContainer');

    if (pendingTab) pendingTab.classList.toggle('border-[#0B63C7]', tab === 'pending');
    if (pendingTab) pendingTab.classList.toggle('text-[#0B63C7]', tab === 'pending');
    if (pendingTab) pendingTab.classList.toggle('bg-white', tab === 'pending');
    if (pendingTab) pendingTab.classList.toggle('text-slate-500', tab !== 'pending');
    if (pendingTab) pendingTab.classList.toggle('border-transparent', tab !== 'pending');

    if (historyTab) historyTab.classList.toggle('border-[#0B63C7]', tab === 'history');
    if (historyTab) historyTab.classList.toggle('text-[#0B63C7]', tab === 'history');
    if (historyTab) historyTab.classList.toggle('bg-white', tab === 'history');
    if (historyTab) historyTab.classList.toggle('text-slate-500', tab !== 'history');
    if (historyTab) historyTab.classList.toggle('border-transparent', tab !== 'history');

    if (pendingContainer) pendingContainer.classList.toggle('hidden', tab !== 'pending');
    if (historyContainer) historyContainer.classList.toggle('hidden', tab !== 'history');
  },

  // Modal de método de pago
  _openPaymentMethodModal() {
    if (this.state.cart.length === 0) {
      alert('Selecciona al menos un item para pagar');
      return;
    }
    // Reset mixed payments to start fresh
    const { total } = this._calculateTotals();
    this.state.mixedPayments = [ { method: 'efectivo', amount: total } ];
    
    const modal = document.getElementById('paymentMethodModal');
    if (modal) modal.classList.remove('hidden');
    this._renderPaymentSummary();
    this._updateMethodDetails('efectivo');
  },

  _closePaymentMethodModal() {
    const modal = document.getElementById('paymentMethodModal');
    if (modal) modal.classList.add('hidden');
  },

  _renderPaymentSummary() {
    const container = document.getElementById('paymentSummaryItems');
    const totalEl = document.getElementById('paymentSummaryTotal');

    if (container) {
      container.innerHTML = this.state.cart.map(item => `
        <div class="flex items-center justify-between py-2">
          <span class="font-medium text-slate-800">${Helpers.escapeHTML(item.concept)}</span>
          <span class="font-bold text-slate-800">${CURRENCY} ${item.amount.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
        </div>
      `).join('');
    }

    const { total } = this._calculateTotals();
    if (totalEl) totalEl.textContent = `${CURRENCY} ${total.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
  },

  _updateMethodDetails(method) {
    // Ocultar todos los detalles
    ['efectivoDetails', 'tarjetaDetails', 'transferenciaDetails', 'mixtoDetails'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });

    // Mostrar el método seleccionado
    const methodId = `${method}Details`;
    const el = document.getElementById(methodId);
    if (el) el.classList.remove('hidden');
  },

  // Métodos para pago mixto
  _addMixedPaymentMethod() {
    const availableMethods = ['efectivo', 'tarjeta', 'transferencia'];
    const usedMethods = this.state.mixedPayments.map(mp => mp.method);
    const nextMethod = availableMethods.find(m => !usedMethods.includes(m));
    
    if (nextMethod) {
      this.state.mixedPayments.push({ method: nextMethod, amount: 0 });
      this._renderMixedPayments();
    }
  },

  _renderMixedPayments() {
    const container = document.getElementById('mixedPaymentItems');
    if (!container) return;
    
    const methodNames = {
      efectivo: 'Efectivo',
      tarjeta: 'Tarjeta',
      transferencia: 'Transferencia'
    };
    
    container.innerHTML = this.state.mixedPayments.map((mp, index) => `
      <div class="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-100 mb-2">
        <div class="flex-1">
          <p class="font-bold text-slate-800 text-sm">${methodNames[mp.method]}</p>
        </div>
        <div class="flex items-center gap-2">
          <input 
            type="number" 
            class="w-32 px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold"
            placeholder="0.00"
            value="${mp.amount}"
            data-mixed-index="${index}"
          />
          ${this.state.mixedPayments.length > 1 ? `
            <button class="p-2 bg-rose-100 text-rose-600 rounded-lg hover:bg-rose-200" data-mixed-remove="${index}">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          ` : ''}
        </div>
      </div>
    `).join('');
    
    // Bind events
    container.querySelectorAll('input[data-mixed-index]').forEach(input => {
      input.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.mixedIndex);
        this.state.mixedPayments[idx].amount = parseFloat(e.target.value) || 0;
      });
    });
    
    container.querySelectorAll('[data-mixed-remove]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.currentTarget.dataset.mixedRemove);
        this.state.mixedPayments.splice(idx, 1);
        this._renderMixedPayments();
      });
    });
    
    if (window.lucide) lucide.createIcons();
  },

  // Confirmar pago
  async _confirmPayment() {
    const confirmBtn = document.getElementById('confirmPaymentBtn');
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Procesando...';
    }

    try {
      const student = this.state.selectedStudent;
      if (!student) {
        throw new Error('No hay estudiante seleccionado');
      }

      const { total } = this._calculateTotals();
      const selectedMethodInput = document.querySelector('input[name="paymentMethod"]:checked');
      const paymentMethod = selectedMethodInput ? selectedMethodInput.value : 'efectivo';
      const needsEcf = document.getElementById('needsEcf')?.checked || false;

      // 1. Mark payments as paid
      let firstPaymentId = null;
      for (const item of this.state.cart) {
        if (item.type === 'payment' && !item.id.startsWith('example-')) {
          await supabase.from('payments')
            .update({ 
              status: 'paid', 
              paid_date: new Date().toISOString(),
              method: paymentMethod
            })
            .eq('id', item.id);
          
          if (!firstPaymentId) firstPaymentId = item.id;
        }
      }

      // 2. Generate invoice
      let invoice = null;
      if (firstPaymentId) {
        try {
          const { data: authData } = await supabase.auth.getUser();
          const userId = authData?.user?.id;
          
          invoice = await InvoicingModule.generateInvoice(firstPaymentId, userId);
          this.state.lastInvoice = invoice;
          Helpers.toast('Factura generada exitosamente!', 'success');
        } catch (invoiceErr) {
          console.error('Error generando factura:', invoiceErr);
        }
      }

      // 3. Send notification to parent (simulated)
      try {
        if (student.profiles?.email) {
          const { notifyPaymentApproved } = await import('../shared/supabase.js');
          const amtStr = total.toLocaleString('es-DO', { minimumFractionDigits: 2 });
          await notifyPaymentApproved(firstPaymentId, student.profiles.email, student.name, amtStr, 'Pago');
        }
      } catch (notifyErr) {
        console.error('Error notificando:', notifyErr);
      }

      this._closePaymentMethodModal();
      this._showSuccessModal();
      this._clearCart();
      if (this.state.selectedStudent) {
        await this._loadPendingItems(this.state.selectedStudent);
        await this._loadPaymentHistory(this.state.selectedStudent);
      }

    } catch (error) {
      console.error('Error al confirmar pago:', error);
      Helpers.toast('Error al procesar el pago. Inténtalo de nuevo.', 'error');
    } finally {
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = '<i data-lucide="check-circle" class="w-5 h-5 inline mr-2"></i> Confirmar Pago';
        if (window.lucide) lucide.createIcons();
      }
    }
  },

  // Modal de éxito
  _showSuccessModal() {
    const modal = document.getElementById('paymentSuccessModal');
    if (modal) modal.classList.remove('hidden');
  },

  _closeSuccessModal() {
    const modal = document.getElementById('paymentSuccessModal');
    if (modal) modal.classList.add('hidden');
  },

  _downloadInvoice() {
    if (this.state.lastInvoice) {
      Helpers.toast('Descargando factura...', 'info');
    } else {
      Helpers.toast('No hay factura disponible para descargar', 'warning');
    }
    this._closeSuccessModal();
  },

  _sendInvoiceEmail() {
    if (this.state.lastInvoice) {
      Helpers.toast('Enviando factura por email...', 'info');
    } else {
      Helpers.toast('No hay factura disponible para enviar', 'warning');
    }
    this._closeSuccessModal();
  }
};
