import { supabase } from '../shared/supabase.js';
import { Helpers } from '../shared/helpers.js';

const CURRENCY = 'RD$';
const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export const RegistrarCobroModule = {
  state: {
    paso: 1,
    studentSearch: '',
    selectedStudent: null,
    selectedMonths: [],
    extraItems: [],
    cart: [],
    paymentMethod: 'efectivo',
    paymentDetails: {
      efectivo: { recibido: 0, cambio: 0 },
      tarjeta: { banco: '', terminal: '', autorizacion: '', ultimos4: '', tipo: 'debito' },
      transferencia: { banco: '', referencia: '', fecha: new Date().toISOString().split('T')[0], comprobante: null },
      cheque: { banco: '', numero: '', titular: '', fecha: new Date().toISOString().split('T')[0] },
      mixto: []
    },
    processing: false
  },

  async init() {
    this._bindEvents();
    await this._loadStudents();
  },

  _bindEvents() {
    const self = this;

    // Buscador
    const searchInput = document.getElementById('cobroStudentSearch');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        self.state.studentSearch = e.target.value;
        self._renderStudentsList();
      });
    }

    // Botón para agregar item extra
    const addExtraBtn = document.getElementById('addExtraItemBtn');
    if (addExtraBtn) {
      addExtraBtn.addEventListener('click', () => self._openAddExtraModal());
    }

    // Botón confirmar pago
    const confirmBtn = document.getElementById('confirmarCobroBtn');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => self._confirmarCobro());
    }
  },

  async _loadStudents() {
    try {
      const { data: students } = await supabase
        .from('students')
        .select('*, parent_id(*)')
        .eq('is_active', true)
        .order('name');
      
      if (students) {
        this.state.allStudents = students;
        this._renderStudentsList();
      }
    } catch (error) {
      console.error('Error cargando estudiantes:', error);
    }
  },

  _renderStudentsList() {
    const container = document.getElementById('studentsListContainer');
    if (!container) return;

    const searchTerm = this.state.studentSearch.toLowerCase();
    const filteredStudents = (this.state.allStudents || []).filter(s => 
      s.name.toLowerCase().includes(searchTerm) || 
      s.matricula?.includes(searchTerm)
    );

    container.innerHTML = filteredStudents.map(student => `
      <div class="p-4 mb-3 bg-white border border-slate-100 rounded-xl hover:border-[#0B63C7] cursor-pointer" data-student-id="${student.id}">
        <div class="flex items-center gap-4">
          <div class="w-12 h-12 bg-gradient-to-br from-[#0B63C7] to-blue-600 rounded-full flex items-center justify-center text-lg font-bold text-white">
            ${(student.name || '?').charAt(0).toUpperCase()}
          </div>
          <div class="flex-1">
            <div class="flex items-center gap-2">
              <p class="font-bold text-slate-800">${Helpers.escapeHTML(student.name)}</p>
              ${student.is_active ? '<span class="text-xs font-black text-green-600 bg-green-100 px-2 py-0.5 rounded-full">Activo</span>' : '<span class="text-xs font-black text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">Inactivo</span>'}
            </div>
            <p class="text-xs text-slate-500">
              ${student.matricula ? `Matrícula: ${student.matricula}` : ''} 
              ${student.nivel ? `• ${student.nivel}` : ''}
            </p>
          </div>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('[data-student-id]').forEach(el => {
      el.addEventListener('click', () => {
        const studentId = el.dataset.studentId;
        const student = this.state.allStudents.find(s => s.id == studentId);
        this._seleccionarEstudiante(student);
      });
    });
  },

  _seleccionarEstudiante(student) {
    this.state.selectedStudent = student;
    this.state.selectedMonths = [];
    this.state.extraItems = [];
    this.state.cart = [];
    this.state.paso = 2;
    this._renderPaso2();
  },

  _renderPaso2() {
    const container = document.getElementById('cobroContent');
    const student = this.state.selectedStudent;
    
    container.innerHTML = `
      <!-- Encabezado del estudiante
      <div class="mb-6">
        <button id="backToStep1Btn" class="flex items-center gap-2 text-[#0B63C7] font-bold hover:text-blue-800 mb-4">
          <i data-lucide="arrow-left" class="w-5 h-5"></i>
          Volver a estudiantes
        </button>
        <div class="bg-white border border-slate-100 p-6 rounded-2xl shadow-sm">
          <div class="flex items-center gap-4 mb-4">
            <div class="w-20 h-20 bg-gradient-to-br from-[#0B63C7] to-blue-600 rounded-full flex items-center justify-center text-3xl font-bold text-white">
              ${(student.name || '?').charAt(0).toUpperCase()}
            </div>
            <div class="flex-1">
              <h2 class="text-xl font-black text-slate-800 mb-1">${Helpers.escapeHTML(student.name)}</h2>
              <div class="text-sm text-slate-500">
                <p>📋 Matrícula: ${student.matricula || 'Sin matrícula'}</p>
                <p>📚 ${student.nivel || 'Sin nivel'}</p>
                <p>📞 ${student.parent_id?.phone || 'Sin teléfono'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Columna izquierda: Selección de meses y items -->
        <div class="lg:col-span-2 space-y-6">
          <div class="bg-white border border-slate-100 p-6 rounded-2xl shadow-sm">
            <h3 class="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
              <i data-lucide="calendar" class="w-5 h-5 text-[#0B63C7]"></i>
              Seleccionar Meses
            </h3>
            <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
              ${MONTH_NAMES.map((month, idx) => {
                const isSelected = this.state.selectedMonths.includes(idx);
                return `
                  <div class="flex items-center gap-2 p-3 border rounded-xl cursor-pointer transition-colors ${isSelected ? 'border-[#0B63C7] bg-blue-50' : 'border-slate-200 hover:border-slate-300'}" data-month="${idx}">
                    <input type="checkbox" ${isSelected ? 'checked' : ''} class="w-4 h-4">
                    <span class="text-sm font-bold text-slate-700">${month} ${new Date().getFullYear()}</span>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <div class="bg-white border border-slate-100 p-6 rounded-2xl shadow-sm">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-black text-slate-800 flex items-center gap-2">
                <i data-lucide="package" class="w-5 h-5 text-[#FF7A00]"></i>
                Items Adicionales
              </h3>
              <button id="addExtraItemBtn" class="bg-[#FF7A00] text-white px-4 py-2 rounded-xl font-bold text-sm">
                + Agregar
              </button>
            </div>
            <div id="extraItemsList" class="space-y-2">
              ${this.state.extraItems.length === 0 ? `
                <div class="text-center p-8 text-slate-400">
                  <p>No hay items adicionales</p>
                </div>
              ` : this.state.extraItems.map((item, idx) => `
                <div class="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div>
                    <p class="font-bold text-slate-800 text-sm">${Helpers.escapeHTML(item.concepto)}</p>
                    <p class="text-xs text-slate-500">${CURRENCY} ${item.monto.toLocaleString('es-DO', {minimumFractionDigits: 2})}</p>
                  </div>
                  <button data-remove-extra="${idx}" class="p-2 text-rose-500 hover:text-rose-700">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                  </button>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
        
        <!-- Columna derecha: Factura en tiempo real
        <div class="lg:col-span-1">
          <div class="bg-white border border-slate-100 p-6 rounded-2xl shadow-sm sticky top-6">
            <h3 class="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
              <i data-lucide="receipt" class="w-5 h-5 text-[#28B54D]"></i>
              Previsualización de Factura
            </h3>
            <div class="border-b border-slate-100 pb-3 mb-4">
              <h4 class="text-sm font-bold text-slate-500 uppercase tracking-wider mb-1">${Helpers.escapeHTML(student.name)}</h4>
              <p class="text-xs text-slate-400">Fecha: ${new Date().toLocaleDateString('es-ES')}</p>
            </div>
            <div id="invoiceItemsContainer" class="space-y-3 mb-6"></div>
            <div id="invoiceTotals" class="border-t border-slate-100 pt-4"></div>
            <button id="continueToPaymentBtn" class="w-full mt-6 bg-[#28B54D] text-white font-black py-3 rounded-xl">
              Continuar al Pago
            </button>
          </div>
        </div>
      </div>
    `;

    if (window.lucide) lucide.createIcons();

    // Eventos del paso 2
    container.querySelectorAll('[data-month]').forEach(el => {
      el.addEventListener('click', () => {
        const month = parseInt(el.dataset.month);
        this._toggleMonth(month);
      });
    });

    document.getElementById('backToStep1Btn')?.addEventListener('click', () => {
      this.state.paso = 1;
      this._renderPaso1();
    });

    document.getElementById('addExtraItemBtn')?.addEventListener('click', () => {
      this._openAddExtraModal();
    });

    document.querySelectorAll('[data-remove-extra]').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.removeExtra);
        this._removeExtraItem(idx);
      });
    });

    document.getElementById('continueToPaymentBtn')?.addEventListener('click', () => {
      this.state.paso = 3;
      this._renderPaso3();
    });

    this._updateInvoicePreview();
  },

  _toggleMonth(month) {
    if (this.state.selectedMonths.includes(month)) {
      this.state.selectedMonths = this.state.selectedMonths.filter(m => m !== month);
    } else {
      this.state.selectedMonths.push(month);
    }
    this._renderPaso2();
  },

  _openAddExtraModal() {
    this.state.pendingExtra = { concepto: '', monto: 0 };
    const modal = document.getElementById('addExtraItemModal');
    if (modal) {
      modal.innerHTML = `
        <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div class="bg-white p-6 rounded-2xl w-full max-w-md">
            <h3 class="text-lg font-black text-slate-800 mb-4">Agregar Item Extra</h3>
            <div class="space-y-4">
              <div>
                <label class="block text-xs font-bold text-slate-600 mb-1">Concepto</label>
                <select id="extraConceptSelect" class="w-full border border-slate-200 p-3 rounded-xl">
                  <option value="Uniforme">Uniforme</option>
                  <option value="Libros">Libros</option>
                  <option value="Materiales">Materiales</option>
                  <option value="Transporte">Transporte</option>
                  <option value="Excursión">Excursión</option>
                  <option value="Otro">Otro</option>
                </select>
              </div>
              <div>
                <label class="block text-xs font-bold text-slate-600 mb-1">Monto</label>
                <input id="extraAmountInput" type="number" class="w-full border border-slate-200 p-3 rounded-xl" placeholder="0.00">
              </div>
            </div>
            <div class="flex items-center justify-end gap-3 mt-6">
                  <button id="cancelAddExtraBtn" class="px-4 py-2 text-slate-600 font-bold rounded-xl">Cancelar</button>
                  <button id="saveExtraItemBtn" class="px-4 py-2 bg-[#0B63C7] text-white font-bold rounded-xl">Agregar</button>
            </div>
          </div>
        </div>
      `;
      modal.classList.remove('hidden');
      this._bindExtraModalEvents();
    }
  },

  _bindExtraModalEvents() {
    document.getElementById('cancelAddExtraBtn')?.addEventListener('click', () => {
      document.getElementById('addExtraItemModal')?.classList.add('hidden');
    });
    document.getElementById('saveExtraItemBtn')?.addEventListener('click', () => {
      const concepto = document.getElementById('extraConceptSelect')?.value;
      const monto = parseFloat(document.getElementById('extraAmountInput')?.value);
      if (monto > 0 && concepto) {
        this.state.extraItems.push({ concepto, monto });
        document.getElementById('addExtraItemModal')?.classList.add('hidden');
        if (this.state.paso === 2) this._renderPaso2();
      }
    });
  },

  _removeExtraItem(idx) {
    this.state.extraItems.splice(idx, 1);
    if (this.state.paso === 2) this._renderPaso2();
  },

  _updateInvoicePreview() {
    const itemsContainer = document.getElementById('invoiceItemsContainer');
    const totalsContainer = document.getElementById('invoiceTotals');
    
    if (!itemsContainer || !totalsContainer) return;

    const monthlyFee = this.state.selectedStudent?.mensualidad || 9850;
    const monthItems = this.state.selectedMonths.map(m => ({
      id: `month-${m}`,
      concepto: `Colegiatura ${MONTH_NAMES[m]}`,
      monto: monthlyFee,
      type: 'monthly'
    }));
    const allItems = [...monthItems, ...this.state.extraItems];
    
    const subtotal = allItems.reduce((sum, i) => sum + i.monto, 0);
    const mora = 0; // Calcular después
    const descuentos = 0;
    const total = subtotal + mora - descuentos;

    this.state.cart = allItems;

    itemsContainer.innerHTML = allItems.map(item => `
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm font-bold text-slate-800">${Helpers.escapeHTML(item.concepto)}</p>
        </div>
        <p class="text-sm font-bold text-slate-700">${CURRENCY} ${item.monto.toLocaleString('es-DO', {minimumFractionDigits: 2})}</p>
      </div>
    `).join('');
    
    totalsContainer.innerHTML = `
      <div class="flex items-center justify-between py-1">
        <span class="text-sm text-slate-600">Subtotal</span>
        <span class="text-sm font-bold text-slate-800">${CURRENCY} ${subtotal.toLocaleString('es-DO', {minimumFractionDigits: 2})}</span>
      </div>
      <div class="flex items-center justify-between py-1">
        <span class="text-sm text-rose-600">Mora</span>
        <span class="text-sm font-bold text-rose-600">${CURRENCY} ${mora.toLocaleString('es-DO', {minimumFractionDigits: 2})}</span>
      </div>
      <div class="flex items-center justify-between py-1">
        <span class="text-sm text-emerald-600">Descuentos</span>
        <span class="text-sm font-bold text-emerald-600">- ${CURRENCY} ${descuentos.toLocaleString('es-DO', {minimumFractionDigits: 2})}</span>
      </div>
      <div class="border-t border-slate-100 pt-2 mt-2">
        <div class="flex items-center justify-between">
          <span class="text-lg font-black text-slate-800">Total</span>
          <span class="text-lg font-black text-[#28B54D]">${CURRENCY} ${total.toLocaleString('es-DO', {minimumFractionDigits: 2})}</span>
        </div>
      </div>
    `;
  },

  _renderPaso3() {
    const container = document.getElementById('cobroContent');
    const student = this.state.selectedStudent;
    
    container.innerHTML = `
      <div class="mb-6">
        <button id="backToStep2Btn" class="flex items-center gap-2 text-[#0B63C7] font-bold hover:text-blue-800 mb-4">
          <i data-lucide="arrow-left" class="w-5 h-5"></i>
          Volver
        </button>
        <h2 class="text-2xl font-black text-slate-800">Método de Pago</h2>
      </div>
    `;
  },

  async _confirmarCobro() {
    this.state.processing = true;
    this.state.paso = 6;
    const container = document.getElementById('cobroContent');
    container.innerHTML = `
      <div class="text-center py-12">
        <div class="animate-spin w-12 h-12 border-4 border-[#0B63C7] border-t-transparent rounded-full mx-auto mb-6"></div>
        <h2 class="text-xl font-black text-slate-800 mb-2">Procesando Cobro...</h2>
        <p class="text-slate-500 mb-8">Por favor, espera mientras registramos el pago</p>
        <div id="processingSteps">
        </div>
      </div>
    `;

    await this._simulateProcessing();
  },

  async _simulateProcessing() {
    const stepsContainer = document.getElementById('processingSteps');
    const steps = [
      'Registrando pago en base de datos',
      'Actualizando caja',
      'Actualizando estado del estudiante',
      'Generando número de recibo',
      'Actualizando contabilidad',
      'Enviando notificación'
    ];

    for (let i = 0; i < steps.length; i++) {
      await new Promise(r => setTimeout(r, 600));
      const stepEl = document.createElement('div');
      stepEl.className = 'flex items-center gap-3 py-2';
      stepEl.innerHTML = `
        <div class="w-6 h-6 rounded-full bg-[#28B54D] flex items-center justify-center text-white text-xs">✓</div>
        <span class="text-sm font-bold text-slate-700">${steps[i]}</span>
      `;
      stepsContainer?.appendChild(stepEl);
    }
    
    await new Promise(r => setTimeout(r, 1000));
    
    const container = document.getElementById('cobroContent');
    container.innerHTML = `
      <div class="text-center py-12 bg-emerald-50 border border-emerald-200 rounded-3xl p-8">
        <div class="w-20 h-20 rounded-full bg-[#28B54D] flex items-center justify-center mx-auto mb-6">
          <i data-lucide="check-circle" class="w-10 h-10 text-white"></i>
        </div>
        <h2 class="text-2xl font-black text-emerald-800 mb-2">¡Cobro Procesado Exitosamente!</h2>
        <p class="text-emerald-600 mb-8">El pago ha sido registrado correctamente</p>
        <div class="flex items-center justify-center gap-4">
          <button id="newCobroBtn" class="px-8 py-3 bg-[#0B63C7] text-white font-bold rounded-xl">
            Nuevo Cobro
          </button>
          <button id="printReceiptBtn" class="px-8 py-3 bg-white text-slate-800 font-bold rounded-xl border border-slate-200">
            Imprimir Recibo
          </button>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();

    document.getElementById('newCobroBtn')?.addEventListener('click', () => {
      this.state.paso = 1;
      this.state.selectedStudent = null;
      this.state.selectedMonths = [];
      this.state.extraItems = [];
      this.state.cart = [];
      this._renderPaso1();
    });
  },

  _renderPaso1() {
    const container = document.getElementById('cobroContent');
    container.innerHTML = `
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-1">
          <div class="bg-white border border-slate-100 p-6 rounded-2xl shadow-sm">
            <h2 class="text-xl font-black text-slate-800 mb-4">🔍 Buscar Estudiante</h2>
            <input id="cobroStudentSearch" type="text" class="w-full border border-slate-200 p-3 rounded-xl mb-4" placeholder="Buscar por nombre o matrícula...">
          </div>
        </div>
        <div class="lg:col-span-2">
          <div class="bg-white border border-slate-100 p-6 rounded-2xl shadow-sm">
            <h2 class="text-xl font-black text-slate-800 mb-4">Estudiantes</h2>
            <div id="studentsListContainer"></div>
          </div>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    this._bindEvents();
    this._renderStudentsList();
  }
};
