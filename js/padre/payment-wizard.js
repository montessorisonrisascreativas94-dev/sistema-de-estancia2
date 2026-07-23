/**
 * 🧙 Panel Padre — Asistente de Pago Paso a Paso
 * Reemplaza el formulario plano por un wizard de 4 pasos:
 *  1. Concepto →  1b. Meses (solo colegiatura) →  2. Datos →  3. Comprobante →  4. Confirmación
 */
import { supabase } from '../shared/supabase.js';
import { AppState, TABLES } from './appState.js';
import { Helpers, escapeHtml } from '../shared/helpers.js';
import { calcMora, getMoraBreakdown } from '../shared/payment-service.js';
import { emitEvent } from '../shared/supabase.js';

const CONCEPT_META = {
  mensualidad:   { icon: '📚', label: 'Colegiatura',   showMonths: true },
  inscripcion:   { icon: '🎓', label: 'Inscripción',   showMonths: false },
  reinscripcion: { icon: '🔄', label: 'Reinscripción', showMonths: false },
  uniforme:      { icon: '👕', label: 'Uniforme',      showMonths: false },
  libros:        { icon: '📖', label: 'Libros',        showMonths: false },
  materiales:    { icon: '🧸', label: 'Materiales',    showMonths: false },
  excursiones:   { icon: '🚌', label: 'Excursiones',   showMonths: false },
  eventos:       { icon: '🎉', label: 'Eventos',       showMonths: false },
  graduacion:    { icon: '🎓', label: 'Graduación',    showMonths: false },
  transporte:    { icon: '🚌', label: 'Transporte',    showMonths: false },
  alimentacion:  { icon: '🍽',  label: 'Alimentación',  showMonths: false },
  otro:          { icon: '🏷️', label: 'Otro',           showMonths: false }
};

const DEFAULT_PRICES = {
  mensualidad: 0, inscripcion: 5000, reinscripcion: 3500,
  uniforme: 3200, libros: 2500, otro: 0, materiales: 1500,
  excursiones: 2000, eventos: 0, graduacion: 3000, transporte: 2500, alimentacion: 0
};

// Mapeo de nombres de DB (payment_concepts.name) a keys de concepto
const NAME_TO_CONCEPT = {
  'colegiatura': 'mensualidad', 'colegiatura mensual': 'mensualidad', 'mensualidad': 'mensualidad',
  'inscripcion': 'inscripcion', 'inscripción': 'inscripcion',
  'reinscripcion': 'reinscripcion', 'reinscripción': 'reinscripcion',
  'uniforme': 'uniforme', 'uniforme escolar': 'uniforme',
  'libros': 'libros', 'libros y útiles': 'libros', 'libros y utilies': 'libros',
  'materiales': 'materiales', 'materiales didacticos': 'materiales',
  'actividades': 'excursiones', 'actividades extra': 'excursiones',
  'excursiones': 'excursiones', 'excursión': 'excursiones',
  'comedor': 'alimentacion', 'alimentacion': 'alimentacion', 'alimentación': 'alimentacion',
  'tutorias': 'materiales', 'tutorías': 'materiales',
  'certificados': 'otro', 'transporte': 'transporte', 'otro': 'otro', 'otros': 'otro'
};

export const WizardPayment = {
  _step: 1,
  _concept: 'mensualidad',
  _selectedMonths: [],
  _file: null,
  _conceptPrices: {},
  _filterPending: false,

  async init() {
    await this._loadConceptPrices();
    this._initMonthGrid();
    this._initMoraCalculator();
    this.goStep(1);
  },

  // ─── Concept Prices from DB ──────────────────────
  async _loadConceptPrices() {
    try {
      // Try is_active first (schema.sql), fallback to active (older migrations)
      let { data, error } = await supabase.from('payment_concepts')
        .select('name, amount, is_active').eq('is_active', true);
      if (error) {
        const res = await supabase.from('payment_concepts')
          .select('name, amount, active').eq('active', true);
        data = res.data;
      }
      if (data && data.length) {
        data.forEach(c => {
          const normalizedName = (c.name || '').toLowerCase().trim();
          const conceptKey = NAME_TO_CONCEPT[normalizedName] || normalizedName.replace(/\s+/g, '');
          if (conceptKey && c.amount > 0 && !this._conceptPrices[conceptKey]) {
            this._conceptPrices[conceptKey] = c.amount;
          }
        });
      }
    } catch (_) {}
    document.querySelectorAll('#conceptPillsGrid .concept-btn').forEach(btn => {
      const cat = btn.dataset.concept;
      const price = this._conceptPrices[cat] || DEFAULT_PRICES[cat] || 0;
      btn.dataset.price = price;
      const priceEl = btn.querySelector('.concept-price');
      if (priceEl && price > 0) {
        priceEl.textContent = 'RD$ ' + price.toLocaleString('es-DO');
      }
    });
  },

  // ─── Month Grid ──────────────────────
  _initMonthGrid() {
    const grid = document.getElementById('monthButtonGrid');
    const sel  = document.getElementById('paymentMonth');
    if (!grid || !sel) return;

    const now = new Date();
    const short = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const full  = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

    grid.innerHTML = '';
    sel.innerHTML = '';

    short.forEach((name, i) => {
      const yr = now.getFullYear();
      const val = yr + '-' + String(i+1).padStart(2,'0');
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = full[i] + ' ' + yr;
      sel.appendChild(opt);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.val = val;
      btn.className = 'month-btn py-2 text-[11px] font-black rounded-xl border-2 border-slate-200 bg-white text-slate-500 transition-all active:scale-95';
      btn.textContent = name;
      btn.onclick = function() {
        const on = this.classList.contains('border-[#0B63C7]');
        if (on) {
          this.className = 'month-btn py-2 text-[11px] font-black rounded-xl border-2 border-slate-200 bg-white text-slate-500 transition-all active:scale-95';
          opt.selected = false;
        } else {
          this.className = 'month-btn py-2 text-[11px] font-black rounded-xl border-2 border-[#0B63C7] bg-[#E8F2FF] text-[#0B63C7] transition-all active:scale-95';
          opt.selected = true;
        }
      };
      grid.appendChild(btn);
    });
  },

  // ─── Mora Calculator ──────────────────────
  _initMoraCalculator() {
    const amountInput = document.getElementById('paymentAmount');
    const monthSelect = document.getElementById('paymentMonth');
    if (!amountInput) return;

    const update = () => {
      const hint    = document.getElementById('moraCalculatorHint');
      const baseEl  = document.getElementById('moraBase');
      const moraEl  = document.getElementById('moraAmount');
      const totalEl = document.getElementById('moraTotal');
      const labelEl = document.getElementById('moraLabel');
      if (!hint) return;

      const base = parseFloat(amountInput.value) || 0;
      const selectedOpts = monthSelect ? Array.from(monthSelect.selectedOptions) : [];
      if (!base || !selectedOpts.length) { hint.classList.add('hidden'); return; }

      const monthVal = selectedOpts[0]?.value;
      const [yr, mo] = monthVal.split('-').map(Number);
      const dueDate = `${yr}-${String(mo).padStart(2,'0')}-05`;
      const mora = calcMora(dueDate);
      const breakdown = getMoraBreakdown(dueDate);

      if (mora <= 0) { hint.classList.add('hidden'); return; }

      const fmt = (n) => Number(n).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      if (baseEl)  baseEl.textContent  = fmt(base);
      if (moraEl)  moraEl.textContent  = '+' + fmt(mora);
      if (totalEl) totalEl.textContent = fmt(base + mora);
      if (labelEl && breakdown) labelEl.textContent = `Mora (${breakdown.formattedText}):`;
      hint.classList.remove('hidden');

      const btn = document.getElementById('btnApplyMora');
      if (btn) {
        btn.onclick = () => {
          amountInput.value = (base + mora).toFixed(2);
          hint.classList.add('hidden');
        };
      }
    };

    amountInput.addEventListener('input', update);
    if (monthSelect) monthSelect.addEventListener('change', update);
  },

  _updateProgress(n) {
    const step = typeof n === 'number' && n > 1 ? Math.ceil(n) : n;
    const dots  = [document.getElementById('wizDot1'), document.getElementById('wizDot2'), document.getElementById('wizDot3')];
    const bars  = [document.getElementById('wizBar1'), document.getElementById('wizBar2')];

    dots.forEach((d, i) => {
      if (!d) return;
      if (i + 1 < step) {
        d.className = 'w-7 h-7 rounded-full bg-[#28B54D] text-white text-[10px] font-black flex items-center justify-center shadow-md transition-all';
        d.innerHTML = '✓';
      } else if (i + 1 === step) {
        d.className = 'w-7 h-7 rounded-full bg-[#0B63C7] text-white text-[10px] font-black flex items-center justify-center shadow-md shadow-[#0B63C7]/30 transition-all';
        d.textContent = i + 1;
      } else {
        d.className = 'w-7 h-7 rounded-full bg-[#E2E8F0] text-[#64748B] text-[10px] font-black flex items-center justify-center transition-all';
        d.textContent = i + 1;
      }
    });

    bars.forEach((b, i) => {
      if (!b) return;
      b.style.width = (i + 1 < step) ? '100%' : '0%';
    });
  },

  // ─── Concept Selection ──────────────────────
  selectConcept(btn) {
    this._concept = btn.dataset.concept;
    document.getElementById('paymentConcept').value = this._concept;

    document.querySelectorAll('.wizard-concept-btn').forEach(p => {
      p.className = 'concept-btn wizard-concept-btn py-3 px-2 rounded-xl border-2 border-slate-200 bg-white text-slate-500 text-xs font-black text-center transition-all hover:border-[#0B63C7] active:scale-95';
    });
    btn.className = 'concept-btn wizard-concept-btn py-3 px-2 rounded-xl border-2 border-[#0B63C7] bg-[#E8F2FF] text-[#0B63C7] text-xs font-black text-center transition-all active:scale-95';

    const meta = CONCEPT_META[this._concept] || CONCEPT_META.otro;
    const price = parseFloat(btn.dataset.price) || this._conceptPrices[this._concept] || DEFAULT_PRICES[this._concept] || 0;

    const amountInput = document.getElementById('paymentAmount');
    if (price > 0) {
      amountInput.value = price.toFixed(2);
    } else if (this._concept === 'mensualidad') {
      try {
        const fin = AppState?.get?.('financeConfig') || {};
        if (fin.monthly_fee > 0) amountInput.value = fin.monthly_fee;
      } catch (_) {}
    } else {
      amountInput.value = '';
    }

    if (meta.showMonths) {
      this.goStep(1.5);
      this._selectedMonths = [];
    } else {
      this._updateConceptSummary();
      this.goStep(2);
    }
  },

  selectConceptFromModal(concept) {
    const btn = document.querySelector(`#conceptPillsGrid [data-concept="${concept}"]`);
    if (btn) {
      this.selectConcept(btn);
    } else {
      this._concept = concept;
      document.getElementById('paymentConcept').value = concept;
      const meta = CONCEPT_META[concept] || CONCEPT_META.otro;
      if (meta.showMonths) {
        this.goStep(1.5);
      } else {
        this._updateConceptSummary();
        this.goStep(2);
      }
    }
    document.getElementById('allConceptsModal').classList.add('hidden');
    document.getElementById('allConceptsModal').classList.remove('flex');
  },

  filterConcepts(query) {
    const q = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    document.querySelectorAll('#allConceptsList button').forEach(btn => {
      const label = (btn.textContent || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      btn.style.display = label.includes(q) ? '' : 'none';
    });
  },

  // ─── Step 2 Helpers ──────────────────────
  goBackFromStep2() {
    const meta = CONCEPT_META[this._concept] || CONCEPT_META.otro;
    if (meta.showMonths) {
      this.goStep(1.5);
    } else {
      this.goStep(1);
    }
  },

  _updateConceptSummary() {
    const meta = CONCEPT_META[this._concept] || CONCEPT_META.otro;
    const iconEl = document.getElementById('wizConceptIcon');
    const nameEl = document.getElementById('wizConceptName');
    const monthsEl = document.getElementById('wizConceptMonths');
    const totalEl = document.getElementById('wizConceptTotal');
    if (iconEl) iconEl.textContent = meta.icon;
    if (nameEl) nameEl.textContent = meta.label;

    const amountInput = document.getElementById('paymentAmount');
    const amount = parseFloat(amountInput?.value) || 0;

    if (meta.showMonths) {
      const sel = document.getElementById('paymentMonth');
      const selected = sel ? Array.from(sel.selectedOptions).map(o => o.textContent) : [];
      this._selectedMonths = sel ? Array.from(sel.selectedOptions).map(o => o.value) : [];
      if (monthsEl) monthsEl.textContent = selected.length ? selected.join(', ') : 'Sin meses seleccionados';
      if (totalEl) totalEl.textContent = Helpers.formatCurrency(amount * (selected.length || 1));
    } else {
      if (monthsEl) monthsEl.textContent = meta.label;
      if (totalEl) totalEl.textContent = Helpers.formatCurrency(amount);
    }
  },

  goStep(n) {
    this._step = n;
    const steps = ['wizStep1','wizStep1b','wizStep2','wizStep3','wizStep4'];
    steps.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });

    const stepMap = { 1: 'wizStep1', 1.5: 'wizStep1b', 2: 'wizStep2', 3: 'wizStep3', 4: 'wizStep4' };
    const activeEl = document.getElementById(stepMap[n]);
    if (activeEl) activeEl.classList.remove('hidden');

    if (n === 2) this._updateConceptSummary();
    this._updateProgress(n);
    if (window.lucide) lucide.createIcons();
  },

  // ─── File Handling ──────────────────────
  handleFileSelect(file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      Helpers.toast('Archivo muy grande (max 5MB)', 'error');
      return;
    }
    if (!['image/jpeg','image/png','image/webp','application/pdf'].includes(file.type)) {
      Helpers.toast('Formato no permitido (JPG, PNG, PDF)', 'error');
      return;
    }
    this._file = file;
    const placeholder = document.getElementById('wizFilePlaceholder');
    const preview = document.getElementById('wizFilePreview');
    const nameEl = document.getElementById('wizFileName');
    const sizeEl = document.getElementById('wizFileSize');
    if (placeholder) placeholder.classList.add('hidden');
    if (preview) preview.classList.remove('hidden');
    if (nameEl) nameEl.textContent = file.name;
    if (sizeEl) sizeEl.textContent = (file.size / 1024).toFixed(1) + ' KB';
    if (window.lucide) lucide.createIcons();
  },

  clearFile() {
    this._file = null;
    const fileInput = document.getElementById('paymentFileInput');
    if (fileInput) fileInput.value = '';
    const placeholder = document.getElementById('wizFilePlaceholder');
    const preview = document.getElementById('wizFilePreview');
    if (placeholder) placeholder.classList.remove('hidden');
    if (preview) preview.classList.add('hidden');
  },

  // ─── Submit ──────────────────────
  async submit() {
    const student = AppState.get('currentStudent');
    if (!student) return;

    const { checkRateLimit, paymentProofLimiter } = await import('../shared/rate-limiter.js');
    if (!checkRateLimit(paymentProofLimiter, 'enviar comprobantes')) return;

    if (!this._file) { Helpers.toast('Adjunta el comprobante de transferencia', 'warning'); return; }

    const amount = parseFloat(document.getElementById('paymentAmount')?.value || '0');
    if (!amount || amount <= 0 || amount > 99999) { Helpers.toast('Ingresa un monto válido', 'warning'); return; }

    const bank = document.getElementById('paymentBank')?.value?.trim();
    if (!bank) { Helpers.toast('Selecciona el banco de origen', 'warning'); return; }

    const concept = this._concept;
    const meta = CONCEPT_META[concept] || CONCEPT_META.otro;
    let selectedMonths = [];
    if (meta.showMonths) {
      const sel = document.getElementById('paymentMonth');
      selectedMonths = sel ? Array.from(sel.selectedOptions).map(o => o.value) : [];
      if (!selectedMonths.length) { Helpers.toast('Selecciona al menos un mes', 'warning'); return; }
    } else {
      selectedMonths = [concept];
    }

    const btn = document.getElementById('btnSubmitPayment');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="animate-spin inline-block w-4 h-4 border-2 border-white rounded-full border-t-transparent"></span> Enviando...'; }

    try {
      const ext = this._file.name.split('.').pop().toLowerCase();
      const path = `payments/${student.id}_${Date.now()}.${ext}`;
      let uploadFile = this._file;

      if (this._file.type.startsWith('image/')) {
        try {
          const { ImageLoader } = await import('../shared/image-loader.js');
          uploadFile = await ImageLoader.compress(this._file, { maxWidth: 1000, maxHeight: 1000, quality: 0.8, maxSizeKB: 400 });
        } catch (_) {}
      }

      const { error: upErr } = await supabase.storage.from('classroom_media').upload(path, uploadFile);
      if (upErr) throw upErr;

      const { data: { publicUrl } } = supabase.storage.from('classroom_media').getPublicUrl(path);

      // Fiscal receipt
      let fiscalUrl = null;
      const fiscalInput = document.getElementById('paymentFiscalInput');
      const fiscalFile = fiscalInput?.files?.[0];
      if (fiscalFile) {
        try {
          const fiscalExt = fiscalFile.name.split('.').pop().toLowerCase();
          const fiscalPath = `payments/fiscal_${student.id}_${Date.now()}.${fiscalExt}`;
          let uploadFiscal = fiscalFile;
          if (fiscalFile.type.startsWith('image/')) {
            try {
              const { ImageLoader } = await import('../shared/image-loader.js');
              uploadFiscal = await ImageLoader.compress(fiscalFile, { maxWidth: 1000, maxHeight: 1000, quality: 0.8, maxSizeKB: 400 });
            } catch (_) {}
          }
          const { error: fiscalErr } = await supabase.storage.from('classroom_media').upload(fiscalPath, uploadFiscal);
          if (!fiscalErr) {
            const { data: { publicUrl: puFiscal } } = supabase.storage.from('classroom_media').getPublicUrl(fiscalPath);
            fiscalUrl = puFiscal;
          }
        } catch (_) {}
      }

      const method = document.getElementById('paymentMethod')?.value || 'transferencia';
      const rnc = document.getElementById('needsRNC')?.checked ? document.getElementById('paymentRNC')?.value : null;
      const businessName = document.getElementById('needsRNC')?.checked ? document.getElementById('paymentBusinessName')?.value : null;

      for (const month of selectedMonths) {
        const insertPayload = {
          student_id: student.id,
          amount,
          month_paid: month,
          concept,
          method,
          bank,
          evidence_url: publicUrl,
          notes: rnc ? `RNC: ${rnc} - ${businessName}` : null,
          status: 'review',
          created_at: new Date().toISOString()
        };
        if (fiscalUrl) insertPayload.proof_url = fiscalUrl;
        const { error: insertErr } = await supabase.from(TABLES.PAYMENTS).insert(insertPayload);
        if (insertErr) throw insertErr;
      }

      this.goStep(4);

      if (window.confetti) {
        confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, colors: ['#10b981', '#3b82f6', '#f59e0b'] });
      }

      emitEvent('payment.receipt_uploaded', {
        student_id: student.id,
        student_name: student.name,
        amount: amount.toFixed(2),
        months: selectedMonths,
        concept
      }).catch(() => {});

      if (window.PaymentsModule) {
        await window.PaymentsModule.loadPayments();
      }

    } catch (err) {
      Helpers.toast('Error al enviar: ' + (err.message || 'Error desconocido'), 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="send" class="w-4 h-4"></i> Enviar Comprobante'; if (window.lucide) lucide.createIcons(); }
    }
  },

  reset() {
    this._file = null;
    this._selectedMonths = [];
    this.clearFile();
    const form = document.getElementById('paymentForm');
    if (form) form.reset();
    this._initMonthGrid();
    this.goStep(1);
  },

  toggleFilter() {
    this._filterPending = !this._filterPending;
    const btn = document.getElementById('wizFilterBtn');
    if (btn) {
      btn.className = this._filterPending
        ? 'text-[10px] font-black text-[#0B63C7] bg-[#E8F2FF] px-3 py-1.5 rounded-full border border-[#0B63C7]/30 transition-all flex items-center gap-1'
        : 'text-[10px] font-black text-[#64748B] bg-[#F1F5F9] px-3 py-1.5 rounded-full hover:bg-[#E2E8F0] transition-all flex items-center gap-1';
      btn.innerHTML = this._filterPending
        ? '<i data-lucide="filter" class="w-3 h-3"></i> Mostrar todos'
        : '<i data-lucide="filter" class="w-3 h-3"></i> Solo pendientes';
      if (window.lucide) lucide.createIcons();
    }
    if (window.PaymentsModule) {
      window.PaymentsModule._renderFilteredCards();
    }
  }
};

window.WizardPayment = WizardPayment;
