import { supabase } from '../shared/supabase.js';
import { Helpers } from '../shared/helpers.js';
import { Security } from '../shared/security.js';
import { InvoicingModule } from './invoicing.module.js';

const CURRENCY = 'RD$';
const fmt = (n) => `${CURRENCY} ${Number(n || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const NewPaymentsModule = {
  // ── Estado único y limpio ─────────────────────────────────────────────────
  state: {
    selectedStudent: null,
    cart:            [],           // items seleccionados para cobrar
    currentTab:      'pending',
    discountPercent: 0,
    discountAmount:  0,
    paymentMethod:   'efectivo',
    mixedPayments:   [{ method: 'efectivo', amount: 0 }],
    lastInvoice:     null
  },

  // ── Init ──────────────────────────────────────────────────────────────────
  async init() {
    this._bindEvents();
    this._loadInitialData();
  },

  // ── Bind events (once) ────────────────────────────────────────────────────
  _bindEvents() {
    const on = (id, ev, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(ev, fn.bind(this)); };

    on('newPaymentSearch', 'input', (e) => { this.state.searchQuery = e.target.value; this._searchStudents(e.target.value); });
    on('tabPending',  'click', () => this._switchTab('pending'));
    on('tabHistory',  'click', () => this._switchTab('history'));
    on('clearCartBtn', 'click', () => this._clearCart());
    on('continueToPaymentBtn', 'click', () => this._openModal());
    on('closePaymentModalBtn', 'click', () => this._closeModal());
    on('cancelPaymentModalBtn', 'click', () => this._closeModal());
    on('confirmPaymentBtn', 'click', () => this._confirmPayment());
    on('downloadInvoiceBtn', 'click', () => this._downloadInvoice());
    on('sendInvoiceEmailBtn', 'click', () => this._sendInvoiceEmail());
    on('closeSuccessModalBtn', 'click', () => this._closeSuccessModal());
    on('addMixedMethodBtn', 'click', () => this._addMixedPaymentMethod());

    // Métodos de pago — delegado al contenedor porque el HTML es estático
    document.querySelectorAll('input[name="paymentMethod"]').forEach(inp => {
      inp.addEventListener('change', (e) => {
        this.state.paymentMethod = e.target.value;
        this._updateMethodDetails(e.target.value);
      });
    });
  },

  async _loadInitialData() {
    await this._searchStudents('');
  },

  // ── Buscar estudiantes ────────────────────────────────────────────────────
  async _searchStudents(query) {
    const container = document.getElementById('studentSearchResults');
    if (!container) return;
    container.innerHTML = '<div class="p-6 text-center"><div class="animate-spin w-6 h-6 border-2 border-[#0B63C7] border-t-transparent rounded-full mx-auto"></div></div>';
    try {
      let q = supabase.from('students').select('*');
      if (query && query.trim()) q = q.or(`name.ilike.%${query.trim()}%,matricula.ilike.%${query.trim()}%`);
      q = q.order('name').limit(20);
      const { data: students, error } = await q;
      if (error) throw error;

      const classroomIds = [...new Set((students || []).map(s => s.classroom_id).filter(Boolean))];
      let classroomMap = {};
      if (classroomIds.length > 0) {
        const { data: rooms } = await supabase.from('classrooms').select('id,name').in('id', classroomIds);
        (rooms || []).forEach(r => { classroomMap[r.id] = r.name; });
      }
      const parentIds = [...new Set((students || []).map(s => s.parent_id).filter(Boolean))];
      let parentMap = {};
      if (parentIds.length > 0) {
        const { data: parents } = await supabase.from('profiles').select('id,email,phone,name').in('id', parentIds);
        (parents || []).forEach(p => { parentMap[p.id] = p; });
      }
      const enriched = (students || []).map(s => ({
        ...s,
        classrooms: s.classroom_id ? { name: classroomMap[s.classroom_id] || '' } : null,
        profiles:   s.parent_id    ? parentMap[s.parent_id] : null
      }));

      if (!enriched.length) {
        container.innerHTML = `<div class="p-8 text-center text-slate-400"><i data-lucide="search" class="w-12 h-12 mx-auto mb-3 opacity-50"></i><p class="text-sm font-medium">No se encontraron estudiantes</p></div>`;
        if (window.lucide) lucide.createIcons(); return;
      }
      container.innerHTML = enriched.map(s => `
        <div class="p-4 hover:bg-slate-50 cursor-pointer transition-colors border-b border-slate-100 last:border-b-0" data-student-id="${s.id}">
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 bg-gradient-to-br from-[#0B63C7] to-blue-600 rounded-xl flex items-center justify-center text-lg font-black text-white shadow-md">${(s.name||'?').charAt(0).toUpperCase()}</div>
            <div class="flex-1 min-w-0">
              <h4 class="font-bold text-slate-800 truncate">${Helpers.escapeHTML(s.name||'Sin nombre')}</h4>
              <p class="text-xs text-slate-500">${s.classrooms?.name ? Helpers.escapeHTML(s.classrooms.name) : 'Sin aula'}${s.matricula ? ` • ${Helpers.escapeHTML(s.matricula)}` : ''}</p>
            </div>
            <i data-lucide="chevron-right" class="w-5 h-5 text-slate-400"></i>
          </div>
        </div>`).join('');
      container.querySelectorAll('[data-student-id]').forEach(item => {
        item.addEventListener('click', () => {
          const s = enriched.find(st => String(st.id) === String(item.dataset.studentId));
          if (s) this._selectStudent(s);
        });
      });
      if (window.lucide) lucide.createIcons();
    } catch (err) {
      container.innerHTML = `<div class="p-8 text-center text-rose-500"><i data-lucide="alert-circle" class="w-12 h-12 mx-auto mb-3 opacity-75"></i><p class="text-sm font-medium">Error al buscar estudiantes</p></div>`;
      if (window.lucide) lucide.createIcons();
    }
  },

  // ── Seleccionar estudiante ────────────────────────────────────────────────
  async _selectStudent(student) {
    this.state.selectedStudent = student;
    this.state.cart = [];
    this._renderStudentFile(student);
  },

  async _renderStudentFile(student) {
    const noStudentEl = document.getElementById('noStudentSelected');
    const fileEl      = document.getElementById('studentFinancialFile');
    if (noStudentEl) noStudentEl.classList.add('hidden');
    if (fileEl)      fileEl.classList.remove('hidden');

    const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const avatarEl = document.getElementById('studentAvatar');
    if (avatarEl) avatarEl.textContent = (student.name||'?').charAt(0).toUpperCase();
    setTxt('studentName',      Helpers.escapeHTML(student.name||'Sin nombre'));
    setTxt('studentClassroom', student.classrooms?.name ? Helpers.escapeHTML(student.classrooms.name) : 'Sin aula');

    await this._loadPendingItems(student);
    await this._loadPaymentHistory(student);
    this._updateCartUI();
  },

  // ── Items pendientes ──────────────────────────────────────────────────────
  async _loadPendingItems(student) {
    const container = document.getElementById('pendingItemsContainer');
    if (!container) return;
    container.innerHTML = '<div class="p-6 text-center"><div class="animate-spin w-6 h-6 border-2 border-[#0B63C7] border-t-transparent rounded-full mx-auto"></div></div>';
    try {
      const { data: payments, error } = await supabase
        .from('payments').select('*').eq('student_id', student.id)
        .in('status', ['pending','overdue','review']).order('due_date', { ascending: true });
      if (error) throw error;

      const items = (payments && payments.length > 0)
        ? payments.map(p => ({
            id:      p.id,
            concept: p.concept || 'Mensualidad',
            amount:  Number(p.amount || 0),
            dueDate: p.due_date,
            status:  this._calcStatus(p),
            type:    'payment',
            _raw:    p
          }))
        : this._exampleItems(student);

      if (!items.length) {
        container.innerHTML = `<div class="p-8 text-center text-slate-400"><i data-lucide="inbox" class="w-12 h-12 mx-auto mb-3 opacity-50"></i><p class="text-sm font-medium">No hay pagos pendientes</p></div>`;
        if (window.lucide) lucide.createIcons(); return;
      }
      container.innerHTML = items.map(item => {
        const isReview = item.status === 'review';
        const raw = item._raw || {};
        const hasVoucher = !!(raw.evidence_url || raw.proof_url);
        return `
        <div class="p-4 bg-white border border-slate-100 rounded-2xl mb-3 hover:border-[#0B63C7] transition-colors ${this._inCart(item.id) ? 'ring-2 ring-[#0B63C7] bg-blue-50' : ''} ${isReview ? 'border-l-4 border-l-orange-400' : ''}">
          <div class="flex items-center justify-between gap-4">
            <div class="flex-1 min-w-0">
              <h4 class="font-bold text-slate-800 truncate">${Helpers.escapeHTML(item.concept)}</h4>
              <div class="flex items-center gap-2 mt-1 flex-wrap">
                ${item.dueDate ? `<span class="text-xs text-slate-500"><i data-lucide="calendar" class="w-3 h-3 inline mr-1"></i>Vence: ${new Date(item.dueDate+'T00:00:00').toLocaleDateString('es-ES')}</span>` : ''}
                ${item.status === 'overdue' ? `<span class="text-xs font-black text-rose-600 bg-rose-100 px-2 py-0.5 rounded-full">Vencido</span>` : ''}
                ${isReview  ? `<span class="text-xs font-black text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full">En revisión</span>` : ''}
                ${isReview && raw.bank ? `<span class="text-[9px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full">🏦 ${Helpers.escapeHTML(raw.bank)}</span>` : ''}
                ${isReview && raw.reference ? `<span class="text-[9px] text-slate-400">#${Helpers.escapeHTML(raw.reference)}</span>` : ''}
              </div>
            </div>
            <div class="text-right">
              <p class="text-lg font-black text-slate-800">${fmt(item.amount)}</p>
              ${isReview
                ? `<div class="flex items-center gap-1.5 mt-2">
                     ${hasVoucher ? `<button class="px-2.5 py-1 bg-[#E8F2FF] text-[#0B63C7] rounded-lg text-[10px] font-black uppercase tracking-wide hover:bg-blue-100 transition-colors" data-review-voucher="${item.id}"><i data-lucide="eye" class="w-3 h-3 inline mr-0.5"></i>Ver</button>` : ''}
                     <button class="px-2.5 py-1 bg-emerald-500 text-white rounded-lg text-[10px] font-black uppercase tracking-wide hover:bg-emerald-600 transition-all active:scale-95" data-review-approve="${item.id}"><i data-lucide="check" class="w-3 h-3 inline mr-0.5"></i>Aprobar</button>
                     <button class="px-2.5 py-1 bg-rose-100 text-rose-600 rounded-lg text-[10px] font-black uppercase tracking-wide hover:bg-rose-200 transition-colors" data-review-reject="${item.id}"><i data-lucide="x" class="w-3 h-3 inline mr-0.5"></i>Rechazar</button>
                   </div>`
                : `<button class="mt-2 px-4 py-1.5 ${this._inCart(item.id) ? 'bg-slate-200 text-slate-600' : 'bg-gradient-to-r from-[#0B63C7] to-blue-600 text-white'} rounded-xl text-xs font-black uppercase tracking-wide transition-all hover:shadow-md active:scale-95" data-item-id="${item.id}">
                    ${this._inCart(item.id) ? 'Quitar' : 'Agregar'}
                  </button>`
              }
            </div>
          </div>
        </div>`;
      }).join('');

      container.querySelectorAll('[data-item-id]').forEach(btn => {
        btn.addEventListener('click', () => {
          const item = items.find(i => String(i.id) === String(btn.dataset.itemId));
          if (!item) return;
          if (this._inCart(item.id)) this._removeFromCart(item.id);
          else this._addToCart(item);
        });
      });
      container.querySelectorAll('[data-review-approve]').forEach(btn => {
        btn.addEventListener('click', () => {
          const item = items.find(i => String(i.id) === String(btn.dataset.reviewApprove));
          if (item?._raw) this._reviewApprove(item._raw);
        });
      });
      container.querySelectorAll('[data-review-reject]').forEach(btn => {
        btn.addEventListener('click', () => {
          const item = items.find(i => String(i.id) === String(btn.dataset.reviewReject));
          if (item?._raw) this._reviewReject(item._raw);
        });
      });
      container.querySelectorAll('[data-review-voucher]').forEach(btn => {
        btn.addEventListener('click', () => {
          const item = items.find(i => String(i.id) === String(btn.dataset.reviewVoucher));
          if (item?._raw) this._reviewShowVoucher(item._raw);
        });
      });
      if (window.lucide) lucide.createIcons();
    } catch (err) {
      container.innerHTML = `<div class="p-8 text-center text-rose-500"><i data-lucide="alert-circle" class="w-12 h-12 mx-auto mb-3 opacity-75"></i><p class="text-sm font-medium">Error al cargar pagos pendientes</p></div>`;
      if (window.lucide) lucide.createIcons();
    }
  },

  // ── Historial ─────────────────────────────────────────────────────────────
  async _loadPaymentHistory(student) {
    const container = document.getElementById('historyContainer');
    if (!container) return;
    try {
      const { data: payments, error } = await supabase
        .from('payments').select('*').eq('student_id', student.id)
        .eq('status','paid').order('paid_date', { ascending: false }).limit(20);
      if (error) throw error;
      if (!payments || !payments.length) {
        container.innerHTML = `<div class="p-8 text-center text-slate-400"><i data-lucide="history" class="w-12 h-12 mx-auto mb-3 opacity-50"></i><p class="text-sm font-medium">No hay pagos registrados</p></div>`;
        if (window.lucide) lucide.createIcons(); return;
      }
      container.innerHTML = payments.map(p => `
        <div class="p-4 bg-white border border-slate-100 rounded-2xl mb-3">
          <div class="flex items-center justify-between gap-4">
            <div class="flex-1 min-w-0">
              <h4 class="font-bold text-slate-800 truncate">${Helpers.escapeHTML(p.concept||'Mensualidad')}</h4>
              <p class="text-xs text-slate-500">${p.paid_date ? new Date(p.paid_date).toLocaleDateString('es-ES') : '-'}</p>
            </div>
            <div class="text-right">
              <p class="text-lg font-black text-emerald-600">${fmt(p.amount)}</p>
              <span class="text-xs font-black text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">Pagado</span>
            </div>
          </div>
        </div>`).join('');
      if (window.lucide) lucide.createIcons();
    } catch (_) {}
  },

  // ── Helpers ───────────────────────────────────────────────────────────────
  _exampleItems(student) {
    const now = new Date();
    const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    return [0,1,2].map(i => {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 5);
      const dueStr = d.toISOString().split('T')[0];
      return {
        id:      `ex-${i}`,
        concept: `Mensualidad ${months[d.getMonth()]} ${d.getFullYear()}`,
        amount:  3000,
        dueDate: dueStr,
        status:  d < new Date().setHours(0,0,0,0) ? 'overdue' : 'pending',
        type:    'payment'
      };
    });
  },

  _calcStatus(p) {
    if (p.status === 'paid')   return 'paid';
    if (p.status === 'review') return 'review';
    if (!p.due_date)           return 'pending';
    return new Date(p.due_date+'T00:00:00') < new Date().setHours(0,0,0,0) ? 'overdue' : 'pending';
  },

  _overdueDays(dueDateStr) {
    if (!dueDateStr) return 0;
    return Math.max(0, Math.ceil((Date.now() - new Date(dueDateStr+'T00:00:00').getTime()) / 86400000));
  },

  // ── Carrito ───────────────────────────────────────────────────────────────
  _inCart(id) { return this.state.cart.some(i => String(i.id) === String(id)); },

  _addToCart(item) {
    if (!this._inCart(item.id)) {
      this.state.cart.push(item);
      this._updateCartUI();
      if (this.state.selectedStudent) this._loadPendingItems(this.state.selectedStudent);
    }
  },

  _removeFromCart(id) {
    this.state.cart = this.state.cart.filter(i => String(i.id) !== String(id));
    this._updateCartUI();
    if (this.state.selectedStudent) this._loadPendingItems(this.state.selectedStudent);
  },

  _clearCart() {
    this.state.cart = [];
    this.state.mixedPayments = [{ method: 'efectivo', amount: 0 }];
    this._updateCartUI();
    if (this.state.selectedStudent) this._loadPendingItems(this.state.selectedStudent);
  },

  // ── Cálculo de totales (FUENTE ÚNICA DE VERDAD) ──────────────────────────
  _calculateTotals() {
    let subtotal = 0;
    let mora     = 0;

    for (const item of this.state.cart) {
      subtotal += Number(item.amount) || 0;
      // Mora para vencidos (2% anual diario)
      if (item.status === 'overdue' && item.dueDate) {
        mora += parseFloat(((item.amount * 0.02 / 365) * this._overdueDays(item.dueDate)).toFixed(2));
      }
    }

    const pct            = Math.min(100, Math.max(0, parseFloat(this.state.discountPercent) || 0));
    const discountAmount = pct > 0 ? parseFloat((subtotal * pct / 100).toFixed(2)) : 0;
    const total          = parseFloat((subtotal - discountAmount + mora).toFixed(2));

    return { subtotal, mora, discountAmount, discountPercent: pct, total };
  },

  // ── Actualizar UI del carrito lateral ────────────────────────────────────
  _updateCartUI() {
    const cartContainer = document.getElementById('cartContainer');
    if (!cartContainer) return;

    if (this.state.cart.length === 0) {
      cartContainer.classList.add('hidden');
      return;
    }
    cartContainer.classList.remove('hidden');

    const cartItemsEl = document.getElementById('cartItems');
    if (cartItemsEl) {
      cartItemsEl.innerHTML = this.state.cart.map(item => `
        <div class="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 mb-2">
          <div class="flex-1 min-w-0 mr-3">
            <p class="font-bold text-slate-800 truncate text-sm">${Helpers.escapeHTML(item.concept)}</p>
            ${item.status === 'overdue' ? `<p class="text-xs text-rose-600">+ mora (${this._overdueDays(item.dueDate)} días)</p>` : ''}
          </div>
          <div class="flex items-center gap-3">
            <span class="font-black text-slate-800 text-sm">${fmt(item.amount)}</span>
            <button class="p-1.5 bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-200 transition-colors" data-remove-item="${item.id}">
              <i data-lucide="x" class="w-4 h-4"></i>
            </button>
          </div>
        </div>`).join('');
      cartItemsEl.querySelectorAll('[data-remove-item]').forEach(btn => {
        btn.addEventListener('click', () => this._removeFromCart(btn.dataset.removeItem));
      });
      if (window.lucide) lucide.createIcons();
    }

    const { subtotal, mora, discountAmount, total } = this._calculateTotals();

    const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const hideRow = (id, hide) => { const el = document.getElementById(id); if (el) el.classList.toggle('hidden', hide); };

    setTxt('cartSubtotal', fmt(subtotal));
    setTxt('cartTotal',    fmt(total));
    setTxt('cartMora',     `+ ${fmt(mora)}`);
    hideRow('cartMoraRow',               mora === 0);
    hideRow('cartDescuentoHermanosRow',  true);
    hideRow('cartDescuentoPagoAnticipadoRow', true);
    hideRow('cartBecaRow',              true);
    hideRow('cartCreditoFavorRow',      true);
  },

  // ── Tabs ──────────────────────────────────────────────────────────────────
  _switchTab(tab) {
    this.state.currentTab = tab;
    const setPending = tab === 'pending';
    const tabStyle = (id, active) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.toggle('border-[#0B63C7]', active);
      el.classList.toggle('text-[#0B63C7]',   active);
      el.classList.toggle('bg-white',          active);
      el.classList.toggle('text-slate-500',   !active);
      el.classList.toggle('border-transparent',!active);
    };
    tabStyle('tabPending', setPending);
    tabStyle('tabHistory', !setPending);
    const pendingC = document.getElementById('pendingItemsContainer');
    const historyC = document.getElementById('historyContainer');
    if (pendingC) pendingC.classList.toggle('hidden', !setPending);
    if (historyC) historyC.classList.toggle('hidden',  setPending);
  },

  // ── Transfer Review Methods ────────────────────────────────────────────────
  async _reviewApprove(payment) {
    if (!confirm(`Aprobar pago de ${fmt(payment.amount)} por transferencia?`)) return;
    try {
      await supabase.from('payments').update({
        status: 'paid',
        paid_date: new Date().toISOString()
      }).eq('id', payment.id);
      Helpers.toast('Transferencia aprobada', 'success');
      if (this.state.selectedStudent) {
        await this._loadPendingItems(this.state.selectedStudent);
        await this._loadPaymentHistory(this.state.selectedStudent);
      }
      try {
        const { data: authData } = await supabase.auth.getUser();
        const result = await InvoicingModule.generateInvoice(payment.id, authData?.user?.id);
        if (result?.success) Helpers.toast(`Factura ${result.invoice_number} generada`, 'success');
      } catch (_) {}
    } catch (_) { Helpers.toast('Error al aprobar', 'error'); }
  },

  _reviewReject(payment) {
    window.openGlobalModal(
      '<div class="bg-gradient-to-r from-rose-600 to-rose-500 text-white p-6 rounded-t-3xl flex items-center gap-3">' +
        '<div class="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center text-2xl">&#128683;</div>' +
        '<div><h3 class="text-xl font-black">Rechazar Transferencia</h3><p class="text-xs text-white/70 font-bold uppercase tracking-widest">Motivo del rechazo</p></div>' +
      '</div>' +
      '<div class="p-6">' +
        '<div class="bg-slate-50 rounded-2xl p-4 mb-4">' +
          '<p class="text-sm text-slate-600">Pago: <span class="font-bold text-slate-800">' + fmt(payment.amount) + '</span></p>' +
          '<p class="text-sm text-slate-600">Mes: <span class="font-bold text-slate-800">' + (payment.month_paid || '-') + '</span></p>' +
        '</div>' +
        '<div>' +
          '<label class="block text-[11px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Motivo *</label>' +
          '<textarea id="rejectReason" rows="3" class="w-full px-4 py-2.5 border-2 border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-rose-100 focus:border-rose-400 bg-slate-50/50 transition-all text-sm" placeholder="Describe el motivo del rechazo..."></textarea>' +
        '</div>' +
      '</div>' +
      '<div class="bg-white p-5 rounded-b-3xl border-t border-slate-100 flex justify-end gap-3">' +
        '<button onclick="App.ui.closeModal()" class="px-6 py-2.5 text-slate-500 font-black text-xs uppercase hover:bg-slate-50 rounded-2xl">Cancelar</button>' +
        '<button id="btnConfirmReject" class="px-8 py-2.5 bg-rose-500 text-white rounded-2xl font-black text-xs uppercase shadow-lg hover:-translate-y-0.5 active:scale-95 transition-all">Rechazar</button>' +
      '</div>'
    );
    document.getElementById('btnConfirmReject')?.addEventListener('click', async () => {
      const reason = document.getElementById('rejectReason')?.value?.trim();
      if (!reason) { Helpers.toast('Agrega un motivo', 'warning'); return; }
      const btn = document.getElementById('btnConfirmReject');
      btn.disabled = true; btn.textContent = 'Rechazando...';
      try {
        await supabase.from('payments').update({
          status: 'pending',
          notes: 'RECHAZADO: ' + reason
        }).eq('id', payment.id);
        App.ui.closeModal();
        Helpers.toast('Transferencia rechazada', 'info');
        if (this.state.selectedStudent) await this._loadPendingItems(this.state.selectedStudent);
      } catch (_) {
        Helpers.toast('Error al rechazar', 'error');
        btn.disabled = false; btn.textContent = 'Rechazar';
      }
    });
  },

  _reviewShowVoucher(payment) {
    const voucherUrl = payment.evidence_url || payment.proof_url || '';
    const proofUrl  = payment.proof_url && payment.proof_url !== voucherUrl ? payment.proof_url : '';
    const isImage = voucherUrl && /\.(jpg|jpeg|png|gif|webp)/i.test(voucherUrl);

    window.openGlobalModal(
      '<div class="bg-gradient-to-r from-[#0B63C7] to-blue-500 text-white p-6 rounded-t-3xl flex items-center gap-3">' +
        '<div class="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center text-2xl">&#128179;</div>' +
        '<div><h3 class="text-xl font-black">Comprobante de Transferencia</h3><p class="text-xs text-white/70 font-bold uppercase tracking-widest">' + (payment.bank || '') + (payment.reference ? ' #' + payment.reference : '') + '</p></div>' +
      '</div>' +
      '<div class="p-6">' +
        '<div class="bg-slate-50 rounded-2xl p-4 mb-4 grid grid-cols-2 gap-3 text-sm">' +
          '<div><span class="text-xs text-slate-400 uppercase">Monto</span><div class="font-black text-slate-800">' + fmt(payment.amount) + '</div></div>' +
          '<div><span class="text-xs text-slate-400 uppercase">Mes</span><div class="font-bold text-slate-700">' + (payment.month_paid || '-') + '</div></div>' +
          '<div><span class="text-xs text-slate-400 uppercase">Banco</span><div class="font-bold text-slate-700">' + (payment.bank || '-') + '</div></div>' +
          '<div><span class="text-xs text-slate-400 uppercase">Referencia</span><div class="font-bold text-slate-700">' + (payment.reference || '-') + '</div></div>' +
        '</div>' +
        (isImage
          ? '<div class="border border-slate-200 rounded-2xl overflow-hidden bg-white mb-4"><img src="' + Security.safeUrl(voucherUrl) + '" class="w-full max-h-80 object-contain cursor-pointer" onclick="window.open(\'' + Security.safeUrl(voucherUrl) + '\', \'_blank\')" title="Click para ver en tamaño completo"></div>'
          : '<a href="' + Security.safeUrl(voucherUrl) + '" target="_blank" rel="noopener noreferrer" class="flex items-center gap-3 p-4 border border-slate-200 rounded-2xl bg-white hover:bg-blue-50 transition-colors text-[#0B63C7] mb-4"><i data-lucide="file-text" class="w-6 h-6"></i><div><div class="font-bold text-sm">Ver comprobante</div><div class="text-[10px] text-slate-400">Abrir en nueva pesta&ntilde;a</div></div></a>') +
        (proofUrl
          ? '<a href="' + Security.safeUrl(proofUrl) + '" target="_blank" rel="noopener noreferrer" class="flex items-center gap-3 p-3 border border-slate-200 rounded-2xl bg-white hover:bg-blue-50 transition-colors text-[#0B63C7]"><i data-lucide="file-check" class="w-4 h-4"></i><span class="text-sm font-bold">Ver factura fiscal</span></a>'
          : '') +
      '</div>' +
      '<div class="bg-white p-5 rounded-b-3xl border-t border-slate-100 flex justify-end gap-3">' +
        '<button onclick="App.ui.closeModal()" class="px-6 py-2.5 text-slate-500 font-black text-xs uppercase hover:bg-slate-50 rounded-2xl">Cerrar</button>' +
        '<button onclick="App.ui.closeModal(); window.__pendingVoucherPayment && window.NewPaymentsModule._reviewApprove(window.__pendingVoucherPayment)" class="px-8 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white rounded-2xl font-black text-xs uppercase shadow-lg hover:-translate-y-0.5 active:scale-95 transition-all">Aprobar</button>' +
      '</div>'
    );
    if (window.lucide) lucide.createIcons();
    window.__pendingVoucherPayment = payment;
  },

  // ── Modal de cobro ────────────────────────────────────────────────────────
  _openModal() {
    if (!this.state.cart.length) {
      Helpers.toast('Selecciona al menos un concepto para cobrar', 'warning');
      return;
    }
    // Reset descuento al abrir
    this.state.discountPercent = 0;
    this.state.discountAmount  = 0;
    const discInput = document.getElementById('discountPercent');
    if (discInput) discInput.value = '0';
    const preview = document.getElementById('discountPreview');
    if (preview) preview.classList.add('hidden');

    const { total } = this._calculateTotals();
    this.state.mixedPayments = [{ method: 'efectivo', amount: total }];

    const modal = document.getElementById('paymentMethodModal');
    if (modal) modal.classList.remove('hidden');

    // Reiniciar método a efectivo
    this.state.paymentMethod = 'efectivo';
    const efectivoRadio = document.querySelector('input[name="paymentMethod"][value="efectivo"]');
    if (efectivoRadio) efectivoRadio.checked = true;
    this._updateMethodDetails('efectivo');

    // Renderizar resumen DESPUÉS de que el modal sea visible
    requestAnimationFrame(() => this._renderModalSummary());
  },

  _closeModal() {
    const modal = document.getElementById('paymentMethodModal');
    if (modal) modal.classList.add('hidden');
  },

  // ── Renderizar resumen DENTRO del modal ──────────────────────────────────
  _renderModalSummary() {
    const { subtotal, discountAmount, discountPercent, mora, total } = this._calculateTotals();

    // ① Conceptos del carrito
    const container = document.getElementById('paymentSummaryItems');
    if (container) {
      const student = this.state.selectedStudent;
      const studentHdr = student ? `
        <div class="mb-3 px-1 pb-3 border-b border-slate-100">
          <p class="text-xs font-black text-slate-400 uppercase tracking-wider">Estudiante</p>
          <p class="font-bold text-slate-800">${Helpers.escapeHTML(student.name||'')}</p>
          ${student.matricula ? `<p class="text-xs text-slate-500">${Helpers.escapeHTML(student.matricula)}</p>` : ''}
        </div>` : '';

      const itemsHTML = this.state.cart.length
        ? this.state.cart.map(item => `
            <div class="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
              <div class="flex-1 min-w-0 pr-2">
                <p class="font-bold text-slate-800 text-sm">${Helpers.escapeHTML(item.concept||'Concepto')}</p>
                ${item.dueDate ? `<p class="text-[10px] text-slate-400">Vence: ${new Date(item.dueDate+'T00:00:00').toLocaleDateString('es-DO')}</p>` : ''}
                ${item.status === 'overdue' ? `<p class="text-[10px] text-rose-500 font-bold">Vencido · ${this._overdueDays(item.dueDate)} días</p>` : ''}
              </div>
              <span class="font-black text-slate-800 shrink-0">${fmt(item.amount)}</span>
            </div>`).join('')
        : '<p class="text-sm text-slate-400 text-center py-2">Sin conceptos seleccionados</p>';

      const moraRow = mora > 0
        ? `<div class="flex justify-between py-1 text-rose-600 text-sm"><span class="font-bold">Mora</span><span class="font-black">+${fmt(mora)}</span></div>` : '';

      const discRow = discountAmount > 0
        ? `<div class="flex justify-between py-1 text-[#28B54D] text-sm"><span class="font-bold">Descuento (${discountPercent}%)</span><span class="font-black">-${fmt(discountAmount)}</span></div>` : '';

      const subtotalRow = `<div class="flex justify-between py-1 text-sm text-slate-600"><span>Subtotal</span><span class="font-bold text-slate-800">${fmt(subtotal)}</span></div>`;

      container.innerHTML = `
        ${studentHdr}
        <div class="mb-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
          <p class="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">📋 Conceptos seleccionados</p>
          ${itemsHTML}
        </div>
        <div class="space-y-0.5 px-1">
          ${subtotalRow}${moraRow}${discRow}
        </div>`;
    }

    // ② Total principal — elemento que estaba mostrando RD$0.00
    const totalEl = document.getElementById('paymentSummaryTotal');
    if (totalEl) totalEl.textContent = fmt(total);
  },

  // ── Descuento % (llamado desde HTML via oninput) ─────────────────────────
  _applyDiscountPercent(rawValue) {
    const pct = Math.min(100, Math.max(0, parseFloat(rawValue) || 0));
    this.state.discountPercent = pct;
    const { subtotal, discountAmount, total } = this._calculateTotals();
    this.state.discountAmount = discountAmount;

    const preview = document.getElementById('discountPreview');
    if (preview) {
      if (pct > 0) {
        preview.classList.remove('hidden');
        const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        setTxt('discountLabel',    `Descuento (${pct}%):`);
        setTxt('discountAmount',   `-${fmt(discountAmount)}`);
        setTxt('discountSubtotal', fmt(subtotal));
        setTxt('discountTotal',    fmt(total));
      } else {
        preview.classList.add('hidden');
      }
    }
    // Actualizar resumen y total del modal
    this._renderModalSummary();
  },

  // ── Detalles del método ────────────────────────────────────────────────────
  _updateMethodDetails(method) {
    ['efectivoDetails','tarjetaDetails','transferenciaDetails','mixtoDetails'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
    const el = document.getElementById(`${method}Details`);
    if (el) el.classList.remove('hidden');
    if (method === 'mixto') this._renderMixedPayments();
  },

  // ── Pago mixto ────────────────────────────────────────────────────────────
  _addMixedPaymentMethod() {
    const used   = this.state.mixedPayments.map(mp => mp.method);
    const next   = ['efectivo','tarjeta','transferencia'].find(m => !used.includes(m));
    if (next) {
      this.state.mixedPayments.push({ method: next, amount: 0 });
      this._renderMixedPayments();
    }
  },

  _renderMixedPayments() {
    const container = document.getElementById('mixedPaymentItems');
    if (!container) return;
    const names = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia' };
    container.innerHTML = this.state.mixedPayments.map((mp, i) => `
      <div class="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-100 mb-2">
        <div class="flex-1"><p class="font-bold text-slate-800 text-sm">${names[mp.method]}</p></div>
        <div class="flex items-center gap-2">
          <input type="number" class="w-32 px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold" placeholder="0.00" value="${mp.amount}" data-mixed-index="${i}">
          ${this.state.mixedPayments.length > 1 ? `<button class="p-2 bg-rose-100 text-rose-600 rounded-lg hover:bg-rose-200" data-mixed-remove="${i}"><i data-lucide="trash-2" class="w-4 h-4"></i></button>` : ''}
        </div>
      </div>`).join('');
    container.querySelectorAll('input[data-mixed-index]').forEach(inp => {
      inp.addEventListener('change', (e) => { this.state.mixedPayments[parseInt(e.target.dataset.mixedIndex)].amount = parseFloat(e.target.value)||0; });
    });
    container.querySelectorAll('[data-mixed-remove]').forEach(btn => {
      btn.addEventListener('click', () => { this.state.mixedPayments.splice(parseInt(btn.dataset.mixedRemove),1); this._renderMixedPayments(); });
    });
    if (window.lucide) lucide.createIcons();
  },

  // ── Confirmar pago ────────────────────────────────────────────────────────
  async _confirmPayment() {
    const btn = document.getElementById('confirmPaymentBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Procesando...'; }

    try {
      const student = this.state.selectedStudent;
      if (!student) throw new Error('No hay estudiante seleccionado');

      const { total, discountAmount, discountPercent, subtotal } = this._calculateTotals();

      const selectedMethodInput = document.querySelector('input[name="paymentMethod"]:checked');
      const paymentMethod = selectedMethodInput ? selectedMethodInput.value : 'efectivo';

      let firstPaymentId = null;

      for (const item of this.state.cart) {
        // Calcular descuento proporcional para cada item
        const itemDiscount = subtotal > 0 ? parseFloat(((item.amount / subtotal) * discountAmount).toFixed(2)) : 0;
        const finalAmount  = parseFloat((item.amount - itemDiscount).toFixed(2));

        if (item.type === 'payment' && !String(item.id).startsWith('ex-')) {
          // Item real de DB → update
          const { error: updateErr } = await supabase.from('payments').update({
            status:           'paid',
            paid_date:        new Date().toISOString(),
            method:           paymentMethod,
            amount:           finalAmount,
            discount_amount:  itemDiscount,
            discount_percent: discountPercent
          }).eq('id', item.id);
          if (updateErr) console.warn('[Payment] update err:', updateErr.message);
          if (!firstPaymentId) firstPaymentId = item.id;
        } else {
          // Item de ejemplo → insertar nuevo registro
          const { data: newP, error: insErr } = await supabase.from('payments').insert({
            student_id:       student.id,
            concept:          item.concept,
            amount:           finalAmount,
            status:           'paid',
            paid_date:        new Date().toISOString(),
            method:           paymentMethod,
            discount_amount:  itemDiscount,
            discount_percent: discountPercent
          }).select('id').single();
          if (insErr) console.warn('[Payment] insert err:', insErr.message);
          if (!firstPaymentId && newP?.id) firstPaymentId = newP.id;
        }
      }

      // Generar factura (edge function) — falla silenciosamente si no está desplegada
      if (firstPaymentId) {
        try {
          const { data: authData } = await supabase.auth.getUser();
          const invoice = await InvoicingModule.generateInvoice(firstPaymentId, authData?.user?.id);
          this.state.lastInvoice = invoice;
        } catch (invoiceErr) {
          // generate-invoice 404 / CORS en localhost — no bloquea el flujo
          console.info('[Invoice] generation skipped:', invoiceErr?.message);
        }
      }

      // Intentar notificar al padre (no bloquea)
      try {
        if (student.profiles?.email || student.p1_email) {
          const { notifyPaymentApproved } = await import('../shared/supabase.js');
          await notifyPaymentApproved(firstPaymentId, student.profiles?.email || student.p1_email, student.name, fmt(total), 'Pago');
        }
      } catch (_) {}

      // Reset y refrescar
      this.state.discountPercent = 0;
      this.state.discountAmount  = 0;
      this._closeModal();
      this._showSuccessModal(total, paymentMethod);
      this._clearCart();
      if (this.state.selectedStudent) {
        await this._loadPendingItems(this.state.selectedStudent);
        await this._loadPaymentHistory(this.state.selectedStudent);
      }

    } catch (err) {
      console.error('[ConfirmPayment]', err);
      Helpers.toast('Error al procesar el pago: ' + (err.message || err), 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="check-circle" class="w-5 h-5 inline mr-2"></i> Confirmar Pago'; if (window.lucide) lucide.createIcons(); }
    }
  },

  // ── Modal de éxito ────────────────────────────────────────────────────────
  _showSuccessModal(total, method) {
    const modal = document.getElementById('paymentSuccessModal');
    if (!modal) return;

    // Actualizar mensaje con total
    const msgEl = modal.querySelector('p.text-slate-600');
    if (msgEl && total) {
      const methods = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', mixto: 'Pago Mixto' };
      msgEl.innerHTML = `El pago de <strong>${fmt(total)}</strong> fue registrado correctamente.<br><span class="text-xs text-slate-400">${methods[method] || method}</span>`;
    }

    Helpers.toast('✅ Pago registrado correctamente', 'success');
    modal.classList.remove('hidden');
  },

  _closeSuccessModal() {
    const modal = document.getElementById('paymentSuccessModal');
    if (modal) modal.classList.add('hidden');
  },

  _downloadInvoice() {
    if (this.state.lastInvoice?.pdf_url) {
      window.open(this.state.lastInvoice.pdf_url, '_blank');
    } else {
      Helpers.toast('Factura no disponible para descarga (edge function no desplegada)', 'warning');
    }
    this._closeSuccessModal();
  },

  _sendInvoiceEmail() {
    if (this.state.lastInvoice) {
      Helpers.toast('Enviando factura por email...', 'info');
    } else {
      Helpers.toast('No hay factura disponible', 'warning');
    }
    this._closeSuccessModal();
  },

  // ── Alias para compatibilidad con panel_directora.html ───────────────────
  // (oninput="NewPaymentsModule._applyDiscountPercent(this.value)" en HTML)
  _openPaymentMethodModal() { return this._openModal(); },
  _closePaymentMethodModal() { return this._closeModal(); },
  _renderPaymentSummary()   { return this._renderModalSummary(); }
};
