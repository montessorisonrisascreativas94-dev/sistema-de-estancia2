/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  CATÁLOGO DE CONCEPTOS DE COBRO                              ║
 * ║  Shared: Directora + Asistente                               ║
 * ║  Tabla: payment_concepts                                     ║
 * ║  Conceptos: Colegiatura, Inscripción, Reinscripción,         ║
 * ║             Uniforme, Libro, Materiales, Actividades, etc.   ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
import { supabase } from './supabase.js';
import { Helpers } from './helpers.js';

// ── Default concepts (seeded if table is empty) ──────────────────
const DEFAULT_CONCEPTS = [
  { name: 'Colegiatura Mensual',   category: 'colegiatura',   amount: 3000, description: 'Mensualidad estándar del período escolar',     active: true },
  { name: 'Inscripción',           category: 'inscripcion',   amount: 5000, description: 'Pago único de inscripción al inicio del ciclo', active: true },
  { name: 'Reinscripción',         category: 'reinscripcion', amount: 3500, description: 'Renovación de matrícula para el próximo ciclo',  active: true },
  { name: 'Uniforme Escolar',      category: 'uniforme',      amount: 3200, description: 'Uniforme completo (camisa, pantalón/falda)',     active: true },
  { name: 'Libros y Útiles',       category: 'libros',        amount: 2500, description: 'Kit de libros y materiales del nivel',           active: true },
  { name: 'Materiales Didácticos', category: 'materiales',    amount: 800,  description: 'Materiales de uso mensual en clase',            active: true },
  { name: 'Actividades Extra',     category: 'actividades',   amount: 1200, description: 'Actividades extracurriculares opcionales',      active: true },
  { name: 'Excursión',             category: 'excursiones',   amount: 3500, description: 'Salida pedagógica programada',                  active: true },
  { name: 'Comedor',               category: 'comedor',       amount: 2000, description: 'Servicio de alimentación mensual',              active: true },
  { name: 'Tutorías',              category: 'tutorias',      amount: 1800, description: 'Apoyo académico individual',                    active: true },
  { name: 'Certificados',          category: 'certificados',  amount: 500,  description: 'Emisión de certificados y constancias',         active: true },
  { name: 'Transporte',            category: 'transporte',    amount: 1500, description: 'Servicio de ruta escolar',                     active: true },
  { name: 'Otro',                  category: 'otros',         amount: 0,    description: 'Concepto personalizado (monto variable)',       active: true },
];

const CATEGORY_META = {
  colegiatura:   { label: 'Colegiatura',    icon: '📅', color: 'bg-[#E8F2FF] text-[#0B63C7] border-[#0B63C7]' },
  inscripcion:   { label: 'Inscripción',    icon: '📝', color: 'bg-[#FFF3E0] text-[#FF7A00] border-[#FF7A00]' },
  reinscripcion: { label: 'Reinscripción',  icon: '🔄', color: 'bg-[#FFF3E0] text-[#FF7A00] border-[#FF7A00]' },
  uniforme:      { label: 'Uniforme',       icon: '👕', color: 'bg-[#E6F7EB] text-[#28B54D] border-[#28B54D]' },
  libros:        { label: 'Libros',         icon: '📚', color: 'bg-[#E6F7EB] text-[#28B54D] border-[#28B54D]' },
  materiales:    { label: 'Materiales',     icon: '✏️', color: 'bg-slate-100 text-slate-600 border-slate-300' },
  actividades:   { label: 'Actividades',    icon: '🎨', color: 'bg-slate-100 text-slate-600 border-slate-300' },
  excursiones:   { label: 'Excursiones',    icon: '🚌', color: 'bg-slate-100 text-slate-600 border-slate-300' },
  comedor:       { label: 'Comedor',        icon: '🍽️', color: 'bg-slate-100 text-slate-600 border-slate-300' },
  tutorias:      { label: 'Tutorías',       icon: '👨‍🏫', color: 'bg-slate-100 text-slate-600 border-slate-300' },
  certificados:  { label: 'Certificados',   icon: '📄', color: 'bg-slate-100 text-slate-600 border-slate-300' },
  transporte:    { label: 'Transporte',     icon: '🚐', color: 'bg-slate-100 text-slate-600 border-slate-300' },
  otros:         { label: 'Otros',          icon: '🏷️', color: 'bg-slate-100 text-slate-600 border-slate-300' },
};

const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fmtAmt = n => Number(n || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 });

// ── Main Module ──────────────────────────────────────────────────
export const CatalogoModule = {
  _concepts: [],
  _filter: 'all',
  _search: '',

  async init() {
    await this._load();
    this._render();
  },

  async _load() {
    try {
      const { data, error } = await supabase
        .from('payment_concepts')
        .select('*')
        .order('category')
        .order('name');

      if (error) throw error;

      if (!data || data.length === 0) {
        // Seed defaults on first run
        const { data: seeded } = await supabase
          .from('payment_concepts')
          .insert(DEFAULT_CONCEPTS)
          .select();
        this._concepts = seeded || DEFAULT_CONCEPTS.map((c, i) => ({ ...c, id: i + 1 }));
      } else {
        this._concepts = data;
      }
    } catch (_) {
      // Fallback to local defaults if table doesn't exist
      this._concepts = DEFAULT_CONCEPTS.map((c, i) => ({ ...c, id: i + 1 }));
    }
  },

  _render() {
    const container = document.getElementById('catalogoContainer');
    if (!container) return;

    const categories = ['all', ...new Set(this._concepts.map(c => c.category))];
    const filtered = this._concepts.filter(c => {
      const matchCat = this._filter === 'all' || c.category === this._filter;
      const matchQ   = !this._search || c.name.toLowerCase().includes(this._search) || (c.description||'').toLowerCase().includes(this._search);
      return matchCat && matchQ;
    });

    container.innerHTML = `
      <!-- KPIs -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <p class="text-2xl font-black text-[#0B63C7]">${this._concepts.length}</p>
          <p class="text-xs font-black text-slate-400 uppercase tracking-wide mt-1">Total Conceptos</p>
        </div>
        <div class="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <p class="text-2xl font-black text-[#28B54D]">${this._concepts.filter(c => c.active !== false).length}</p>
          <p class="text-xs font-black text-slate-400 uppercase tracking-wide mt-1">Activos</p>
        </div>
        <div class="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <p class="text-2xl font-black text-[#FF7A00]">${new Set(this._concepts.map(c => c.category)).size}</p>
          <p class="text-xs font-black text-slate-400 uppercase tracking-wide mt-1">Categorías</p>
        </div>
        <div class="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <p class="text-2xl font-black text-slate-700">
            RD$${fmtAmt(this._concepts.filter(c => c.amount > 0 && c.category === 'colegiatura').reduce((s,c) => s + (c.amount || 0), 0) || this._concepts.find(c => c.category === 'colegiatura')?.amount || 0)}
          </p>
          <p class="text-xs font-black text-slate-400 uppercase tracking-wide mt-1">Colegiatura Base</p>
        </div>
      </div>

      <!-- Toolbar -->
      <div class="flex flex-col sm:flex-row gap-3 mb-5">
        <div class="relative flex-1">
          <i data-lucide="search" class="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"></i>
          <input type="text" id="catalogoSearch" placeholder="Buscar concepto..." value="${esc(this._search)}"
            oninput="CatalogoModule._onSearch(this.value)"
            class="w-full pl-11 pr-4 py-2.5 border-2 border-slate-100 rounded-xl text-sm font-medium outline-none focus:border-[#0B63C7] focus:ring-2 focus:ring-blue-100 transition-all bg-white">
        </div>
        <button onclick="CatalogoModule.openModal()"
          class="flex items-center gap-2 px-5 py-2.5 bg-[#0B63C7] text-white rounded-xl font-black text-sm uppercase hover:bg-[#0850A0] shadow-md transition-all active:scale-95 flex-shrink-0">
          <i data-lucide="plus" class="w-4 h-4"></i> Nuevo Concepto
        </button>
      </div>

      <!-- Category filter pills -->
      <div class="flex gap-2 flex-wrap mb-5">
        <button onclick="CatalogoModule._setFilter('all')"
          class="cat-pill px-4 py-1.5 rounded-full text-xs font-black border-2 transition-all ${this._filter === 'all' ? 'bg-[#0B63C7] text-white border-[#0B63C7]' : 'bg-white text-slate-500 border-slate-200 hover:border-[#0B63C7]'}">
          Todos (${this._concepts.length})
        </button>
        ${['colegiatura','inscripcion','reinscripcion','uniforme','libros'].map(cat => {
          const meta = CATEGORY_META[cat] || { label: cat, icon: '🏷️' };
          const count = this._concepts.filter(c => c.category === cat).length;
          if (!count) return '';
          return `<button onclick="CatalogoModule._setFilter('${cat}')"
            class="cat-pill px-4 py-1.5 rounded-full text-xs font-black border-2 transition-all ${this._filter === cat ? 'bg-[#0B63C7] text-white border-[#0B63C7]' : 'bg-white text-slate-500 border-slate-200 hover:border-[#0B63C7]'}">
            ${meta.icon} ${meta.label} (${count})
          </button>`;
        }).join('')}
        <button onclick="CatalogoModule._setFilter('otros_all')"
          class="cat-pill px-4 py-1.5 rounded-full text-xs font-black border-2 transition-all ${this._filter === 'otros_all' ? 'bg-slate-600 text-white border-slate-600' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'}">
          🏷️ Otros
        </button>
      </div>

      <!-- Concepts grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" id="catalogoGrid">
        ${filtered.length ? filtered.map(c => this._renderCard(c)).join('') : `
          <div class="col-span-full py-16 text-center text-slate-400">
            <div class="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl">🏷️</div>
            <h3 class="font-black text-slate-500 mb-2">Sin resultados</h3>
            <p class="text-sm">Prueba con otro filtro o crea un nuevo concepto.</p>
          </div>`}
      </div>`;

    if (window.lucide) lucide.createIcons();
  },

  _renderCard(c) {
    const meta = CATEGORY_META[c.category] || { label: c.category || 'General', icon: '🏷️', color: 'bg-slate-100 text-slate-600 border-slate-300' };
    const isActive = c.active !== false;
    const isFree   = !c.amount || c.amount === 0;

    return `
      <div class="bg-white border-2 border-slate-100 rounded-2xl p-5 hover:border-[#0B63C7] hover:shadow-md transition-all group relative">
        <!-- Header -->
        <div class="flex items-start justify-between gap-3 mb-3">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${meta.color.split(' ').slice(0,2).join(' ')}">
              ${meta.icon}
            </div>
            <div class="min-w-0">
              <h4 class="font-black text-slate-800 text-sm truncate">${esc(c.name)}</h4>
              <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase border ${meta.color} mt-0.5">
                ${meta.label}
              </span>
            </div>
          </div>
          <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
            <button onclick="CatalogoModule.openModal(${c.id})"
              class="w-8 h-8 flex items-center justify-center bg-[#E8F2FF] text-[#0B63C7] hover:bg-[#0B63C7] hover:text-white rounded-xl transition-all" title="Editar">
              <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
            </button>
            <button onclick="CatalogoModule.deleteConcept(${c.id}, '${esc(c.name)}')"
              class="w-8 h-8 flex items-center justify-center bg-rose-50 text-rose-500 hover:bg-rose-600 hover:text-white rounded-xl transition-all" title="Eliminar">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>

        <!-- Description -->
        ${c.description ? `<p class="text-xs text-slate-500 mb-3 leading-relaxed">${esc(c.description)}</p>` : ''}

        <!-- Amount + status -->
        <div class="flex items-center justify-between">
          <div>
            ${isFree
              ? '<span class="text-sm font-black text-slate-400">Monto libre</span>'
              : `<span class="text-xl font-black text-slate-800">RD$${fmtAmt(c.amount)}</span>`}
          </div>
          <span class="px-3 py-1 rounded-full text-[10px] font-black uppercase ${isActive ? 'bg-[#E6F7EB] text-[#28B54D]' : 'bg-slate-100 text-slate-400'}">
            ${isActive ? 'Activo' : 'Inactivo'}
          </span>
        </div>
      </div>`;
  },

  _setFilter(f) {
    if (f === 'otros_all') {
      // Filter all non-main categories
      this._filter = 'otros_all';
    } else {
      this._filter = f;
    }
    this._render();
  },

  _onSearch(val) {
    this._search = val.toLowerCase();
    // Re-filter without full reload
    const filtered = this._concepts.filter(c => {
      const matchCat = this._filter === 'all' || this._filter === 'otros_all'
        ? (this._filter === 'all' || !['colegiatura','inscripcion','reinscripcion','uniforme','libros'].includes(c.category))
        : c.category === this._filter;
      const matchQ = !this._search || c.name.toLowerCase().includes(this._search) || (c.description||'').toLowerCase().includes(this._search);
      return matchCat && matchQ;
    });
    const grid = document.getElementById('catalogoGrid');
    if (grid) {
      grid.innerHTML = filtered.length ? filtered.map(c => this._renderCard(c)).join('') : `
        <div class="col-span-full py-12 text-center text-slate-400">
          <p class="font-black text-slate-500 mb-1">Sin resultados</p>
          <p class="text-sm">Prueba con otro término de búsqueda.</p>
        </div>`;
      if (window.lucide) lucide.createIcons();
    }
  },

  // ── CRUD Modal ───────────────────────────────────────────────
  async openModal(id = null) {
    let concept = null;
    if (id) {
      concept = this._concepts.find(c => String(c.id) === String(id));
    }
    const isEdit = !!concept;

    const inputCls = "w-full px-4 py-2.5 border-2 border-slate-100 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-blue-100 focus:border-[#0B63C7] transition-all bg-slate-50";

    const html = `
      <div class="modal-header bg-gradient-to-r from-[#0B63C7] to-[#0850A0] text-white p-6 rounded-t-3xl">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center">
            <i data-lucide="${isEdit ? 'edit-3' : 'plus-circle'}" class="w-5 h-5 text-white"></i>
          </div>
          <div>
            <h3 class="text-lg font-black">${isEdit ? 'Editar Concepto' : 'Nuevo Concepto'}</h3>
            <p class="text-xs text-white/70 font-bold uppercase tracking-widest">Catálogo de Cobros</p>
          </div>
        </div>
      </div>

      <div class="p-6 space-y-4 bg-slate-50/30">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="md:col-span-2">
            <label class="block text-[11px] font-black text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Nombre del Concepto *</label>
            <input id="catConceptName" type="text" value="${esc(concept?.name || '')}" placeholder="Ej: Inscripción Anual"
              class="${inputCls}">
          </div>
          <div>
            <label class="block text-[11px] font-black text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Categoría *</label>
            <select id="catConceptCategory" class="${inputCls} appearance-none">
              ${Object.entries(CATEGORY_META).map(([key, meta]) =>
                `<option value="${key}" ${concept?.category === key ? 'selected' : ''}>${meta.icon} ${meta.label}</option>`
              ).join('')}
            </select>
          </div>
          <div>
            <label class="block text-[11px] font-black text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Monto (RD$)</label>
            <div class="relative">
              <span class="absolute left-4 top-1/2 -translate-y-1/2 text-[#0B63C7] font-black text-sm">$</span>
              <input id="catConceptAmount" type="number" step="0.01" min="0" value="${concept?.amount ?? 0}" placeholder="0.00"
                class="${inputCls} pl-8">
            </div>
            <p class="text-[10px] text-slate-400 mt-1 ml-1">Usa 0 para monto variable (se pide al cobrar)</p>
          </div>
          <div class="md:col-span-2">
            <label class="block text-[11px] font-black text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Descripción</label>
            <input id="catConceptDesc" type="text" value="${esc(concept?.description || '')}" placeholder="Descripción breve del concepto..."
              class="${inputCls}">
          </div>
          <div class="flex items-center gap-3 pt-2">
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" id="catConceptActive" ${(concept?.active !== false) ? 'checked' : ''} class="w-5 h-5 rounded text-[#28B54D]">
              <span class="text-sm font-black text-slate-700">Concepto Activo</span>
            </label>
          </div>
        </div>
      </div>

      <div class="p-6 bg-white rounded-b-3xl border-t border-slate-100 flex justify-end gap-3">
        <button onclick="if(window.App?.ui?.closeModal){App.ui.closeModal();}else{const gc=document.getElementById('globalModalContainer');if(gc){gc.style.display='none';gc.innerHTML='';}}"
          class="px-6 py-2.5 text-slate-500 font-black text-xs uppercase hover:bg-slate-100 rounded-xl transition-all">
          Cancelar
        </button>
        <button onclick="CatalogoModule.saveConcept(${concept?.id || 'null'})"
          class="px-8 py-2.5 bg-gradient-to-r from-[#0B63C7] to-[#0850A0] text-white rounded-xl font-black text-xs uppercase shadow-lg hover:shadow-blue-200 transition-all active:scale-95">
          ${isEdit ? 'Guardar Cambios' : 'Crear Concepto'}
        </button>
      </div>`;

    if (window.openGlobalModal) {
      window.openGlobalModal(html, false);
    } else {
      const overlay = document.createElement('div');
      overlay.id = '_catModalOverlay';
      overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(8,80,160,.45);backdrop-filter:blur(6px);display:flex;align-items:flex-start;justify-content:center;padding:3vh 16px;overflow-y:auto;';
      const inner = document.createElement('div');
      inner.className = 'bg-white rounded-3xl shadow-2xl w-full max-w-lg my-4';
      inner.innerHTML = html;
      overlay.appendChild(inner);
      document.body.appendChild(overlay);
      overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    }
    if (window.lucide) lucide.createIcons();
  },

  async saveConcept(id) {
    const name     = document.getElementById('catConceptName')?.value?.trim();
    const category = document.getElementById('catConceptCategory')?.value;
    const amount   = parseFloat(document.getElementById('catConceptAmount')?.value) || 0;
    const desc     = document.getElementById('catConceptDesc')?.value?.trim() || '';
    const active   = document.getElementById('catConceptActive')?.checked ?? true;

    if (!name) { Helpers.toast('El nombre es obligatorio', 'warning'); return; }
    if (!category) { Helpers.toast('Selecciona una categoría', 'warning'); return; }

    try {
      if (id) {
        const { error } = await supabase.from('payment_concepts')
          .update({ name, category, amount, description: desc, active })
          .eq('id', id);
        if (error) throw error;
        Helpers.toast('Concepto actualizado ✅', 'success');
      } else {
        const { error } = await supabase.from('payment_concepts')
          .insert({ name, category, amount, description: desc, active });
        if (error) throw error;
        Helpers.toast('Concepto creado ✅', 'success');
      }

      // Close modal
      if (window.App?.ui?.closeModal) {
        window.App.ui.closeModal();
      } else {
        const gc = document.getElementById('globalModalContainer');
        if (gc) { gc.style.display = 'none'; gc.innerHTML = ''; }
        document.getElementById('_catModalOverlay')?.remove();
      }

      await this._load();
      this._render();
    } catch (err) {
      console.error('[Catálogo] save error:', err);
      Helpers.toast('Error al guardar: ' + err.message, 'error');
    }
  },

  async deleteConcept(id, name) {
    if (!confirm(`¿Eliminar el concepto "${name}"?\n\nSolo se eliminará del catálogo, no afecta cobros ya realizados.`)) return;
    try {
      const { error } = await supabase.from('payment_concepts').delete().eq('id', id);
      if (error) throw error;
      Helpers.toast('Concepto eliminado', 'success');
      await this._load();
      this._render();
    } catch (err) {
      console.error('[Catálogo] delete error:', err);
      Helpers.toast('Error al eliminar: ' + err.message, 'error');
    }
  },
};

// Expose globally for onclick handlers
window.CatalogoModule = CatalogoModule;
