/**
 * 🎓 Constructor de Evaluaciones — Panel de Directora
 * Estructura: Evaluación → Áreas → Competencias → Períodos → Módulos → Actividades
 * + Constructor de Fórmulas + Banco de Plantillas + Asistente IA Pedagógico.
 */
import { Helpers } from '../shared/helpers.js';
import { supabase } from '../shared/supabase.js';
import { SmartLoader } from '../shared/smart-loader.js';
import { openGlobalModal, closeGlobalModal } from '../shared/modal.js';
import { BoletaUI } from '../shared/boleta.module.js';
import {
  EDUCATIONAL_LEVELS, EVAL_TYPES, PERIOD_TYPES, SCALE_LEVELS,
  normalizeEvalConfig, normalizeScore, gradeToLevel, starsHtml,
  gradingGridHtml, readGradingGrid, initEvalControls, buildScoresMap,
  formulaSum, computeFinalScore, generateStructureFromLevel
} from '../shared/eval-utils.js';

function esc(s) { return Helpers.escapeHTML(String(s ?? '')); }
function uidToStr(v) { return v == null ? '' : String(v); }

export const ConstructorModule = {
  _userId: null,
  _years: [],
  _evaluations: [],
  _templates: [],
  _current: null,
  _areas: [],
  _competencies: [],
  _periods: [],
  _modules: [],
  _activities: [],
  _formulas: [],
  _classrooms: [],
  _students: [],
  _scores: [],
  _sel: { areaId: null, competencyId: null, periodId: null, moduleId: null },
  _editing: null,

  async init() {
    initEvalControls();
    const container = document.getElementById('constructor-inner');
    if (!container) return;
    SmartLoader.showIn(container, 'constructor', { skeleton: 'feed', rows: 2 });
    try {
      await this._loadYears();
      await this._loadEvaluations();
      await this._loadTemplates();
      await this._loadClassrooms();
      await this._loadStudents();
      this._render();
    } catch (err) {
      container.innerHTML = Helpers.errorState('Error al cargar el Constructor de Evaluaciones');
      console.error(err);
    }
  },

  /* ── CARGAS ─────────────────────────────────────────────── */
  async _uid() {
    if (this._userId) return this._userId;
    try {
      const { data } = await supabase.auth.getUser();
      this._userId = data?.user?.id || null;
    } catch (_) { this._userId = null; }
    return this._userId;
  },

  async _loadYears() {
    const { data } = await supabase.from('school_years').select('id, name').order('start_date', { ascending: false });
    this._years = data || [];
  },

  async _loadEvaluations() {
    const { data } = await supabase.from('eval_evaluations').select('*').is('deleted_at', null).order('created_at');
    this._evaluations = data || [];
    const activeYear = this._years.find(y => { return null; }) || null;
    const fallback = this._evaluations.find(e => e.school_year_id === (this._years[0]?.id)) || this._evaluations[0];
    if (!this._current && fallback) this._current = fallback;
  },

  async _loadTemplates() {
    const { data } = await supabase.from('eval_formulas').select('*').is('deleted_at', null).eq('is_template', true);
    this._templates = data || [];
  },

  async _loadClassrooms() {
    const { data } = await supabase.from('classrooms').select('id, name, level').is('deleted_at', null).order('name');
    this._classrooms = data || [];
  },

  async _loadStudents() {
    const { data } = await supabase.from('students').select('id, name, classroom_id, matricula').is('deleted_at', null).eq('is_active', true).order('name');
    this._students = data || [];
  },

  async _loadChildren() {
    if (!this._current) return;
    const evalId = this._current.id;
    const [areas, comps, periods, modules, activities, formulas] = await Promise.all([
      supabase.from('eval_areas').select('*').is('deleted_at', null).eq('evaluation_id', evalId).order('sort_order').order('created_at'),
      supabase.from('eval_competencies').select('*, area:eval_areas(name)').is('deleted_at', null).order('sort_order').order('created_at'),
      supabase.from('eval_periods').select('*').is('deleted_at', null).eq('evaluation_id', evalId).order('sort_order').order('created_at'),
      supabase.from('eval_modules').select('*, area:eval_areas(name), period:eval_periods(name), competency:eval_competencies(name)').is('deleted_at', null).order('sort_order').order('created_at'),
      supabase.from('eval_activities').select('*').is('deleted_at', null).order('sort_order').order('created_at'),
      supabase.from('eval_formulas').select('*').is('deleted_at', null).eq('evaluation_id', evalId).order('created_at')
    ]);
    this._areas = areas.data || [];
    this._competencies = comps.data || [];
    this._periods = periods.data || [];
    this._modules = modules.data || [];
    this._activities = activities.data || [];
    this._formulas = formulas.data || [];
    // Revalidar selección
    if (!this._areas.find(a => a.id === this._sel.areaId)) this._sel.areaId = null;
    if (!this._periods.find(p => p.id === this._sel.periodId)) this._sel.periodId = null;
    if (!this._modules.find(m => m.id === this._sel.moduleId)) this._sel.moduleId = null;
    if (!this._competencies.find(c => c.id === this._sel.competencyId)) this._sel.competencyId = null;
  },

  /* ── RENDER PRINCIPAL ───────────────────────────────────── */
  _render() {
    const container = document.getElementById('constructor-inner');
    if (!container) return;
    const evalOpts = this._evaluations.map(e =>
      `<option value="${e.id}" ${this._current?.id === e.id ? 'selected' : ''}>${esc(e.name)}${e.level ? ` — ${esc(e.level)}` : ''}</option>`
    ).join('');

    container.innerHTML = `
      <header class="mb-6">
        <h1 class="text-2xl md:text-3xl font-black text-slate-800 flex items-center gap-3">
          <span class="p-2 bg-gradient-to-br from-violet-500 to-indigo-600 text-white rounded-2xl shadow-lg"><i data-lucide="git-branch" class="w-6 h-6"></i></span>
          Constructor de Evaluaciones
        </h1>
        <p class="text-slate-500 font-medium mt-1">Arma la estructura de evaluación profesional: Áreas → Competencias → Períodos → Módulos → Actividades</p>
      </header>

      <div class="bg-white rounded-2xl shadow-md border border-slate-100 p-4 mb-5">
        <div class="flex flex-wrap items-center gap-3">
          <div class="flex items-center gap-2">
            <i data-lucide="book-open-check" class="w-5 h-5 text-violet-500"></i>
            <select id="evalSelector" class="px-3 py-2 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-violet-500 bg-white">
              ${evalOpts || '<option value="">Sin evaluaciones</option>'}
            </select>
          </div>
          <div class="flex flex-wrap gap-2 ml-auto">
            <button onclick="App.evalBuilder.openEvaluationModal()" class="px-4 py-2 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-lg flex items-center gap-2 active:scale-95 hover:opacity-90" style="background:#7C3AED;box-shadow:0 4px 14px rgba(124,58,237,0.3);">
              <i data-lucide="plus" class="w-4 h-4"></i> Nueva Evaluación
            </button>
            <button onclick="App.evalBuilder.openAIAssistant()" class="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl font-black text-xs uppercase tracking-wider shadow-sm flex items-center gap-2 hover:bg-slate-50 transition-all">
              <i data-lucide="sparkles" class="w-4 h-4 text-violet-500"></i> Asistente IA
            </button>
            <button onclick="App.evalBuilder.openFormulaBank()" class="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl font-black text-xs uppercase tracking-wider shadow-sm flex items-center gap-2 hover:bg-slate-50 transition-all">
              <i data-lucide="library-big" class="w-4 h-4 text-indigo-500"></i> Banco de Fórmulas
            </button>
          </div>
        </div>
      </div>

      <div id="evalBuilderBody"></div>
    `;
    this._bindTopEvents();
    this._renderBody();
    if (window.lucide) lucide.createIcons();
  },

  _bindTopEvents() {
    document.getElementById('evalSelector')?.addEventListener('change', (e) => {
      const id = Number(e.target.value);
      this._current = this._evaluations.find(x => x.id === id) || null;
      this._sel = { areaId: null, competencyId: null, periodId: null, moduleId: null };
      this._loadChildren().then(() => this._renderBody());
    });
  },

  async _renderBody() {
    const body = document.getElementById('evalBuilderBody');
    if (!body) return;
    if (!this._current) {
      body.innerHTML = `
        <div class="bg-white rounded-3xl border-2 border-dashed border-violet-200 p-14 text-center">
          <div class="w-20 h-20 mx-auto bg-violet-50 text-violet-500 rounded-3xl flex items-center justify-center mb-4"><i data-lucide="git-branch" class="w-10 h-10"></i></div>
          <h3 class="text-lg font-black text-slate-800">Aún no hay evaluaciones</h3>
          <p class="text-slate-500 text-sm mt-1 max-w-md mx-auto">Crea tu primera evaluación o deja que el Asistente IA genere la estructura completa para tu nivel educativo.</p>
          <div class="flex justify-center gap-3 mt-6 flex-wrap">
            <button onclick="App.evalBuilder.openEvaluationModal()" class="px-6 py-3 text-white rounded-2xl font-black text-sm shadow-lg flex items-center gap-2" style="background:#7C3AED;">Nueva Evaluación</button>
            <button onclick="App.evalBuilder.openAIAssistant()" class="px-6 py-3 bg-violet-50 text-violet-700 rounded-2xl font-black text-sm flex items-center gap-2">Asistente IA</button>
          </div>
        </div>`;
      if (window.lucide) lucide.createIcons();
      return;
    }
    body.innerHTML = this._renderStructure();
    if (window.lucide) lucide.createIcons();
  },

  _renderStructure() {
    const cur = this._current;
    const sel = this._sel;
    const areas = this._areas;
    const comps = this._competencies.filter(c => c.area_id === sel.areaId);
    const periods = this._periods;
    const modules = this._modules.filter(m => m.period_id === sel.periodId);
    const acts = this._activities.filter(a => a.module_id === sel.moduleId);

    const areaChips = areas.map(a => `
      <button onclick="App.evalBuilder.selectArea(${a.id})" class="w-full text-left px-3 py-2.5 rounded-xl border transition-all flex items-center gap-2 ${sel.areaId === a.id ? 'bg-violet-50 border-violet-300 ring-2 ring-violet-200' : 'bg-white border-slate-200 hover:border-violet-300'}">
        <span class="w-8 h-8 rounded-lg text-white flex items-center justify-center shrink-0" style="background:${a.color || '#7C3AED'}"><i data-lucide="${a.icon || 'heart'}" class="w-4 h-4"></i></span>
        <span class="min-w-0 flex-1">
          <span class="block font-bold text-slate-700 text-xs truncate">${esc(a.name)}</span>
          <span class="block text-[10px] text-slate-400 truncate">${esc(a.description || 'Sin descripción')}</span>
        </span>
        <span class="flex gap-1 shrink-0">
          <span onclick="event.stopPropagation(); App.evalBuilder.openAreaModal(${a.id})" class="p-1 rounded-md bg-slate-100 text-slate-500 hover:bg-indigo-100 hover:text-indigo-600" title="Editar"><i data-lucide="pencil" class="w-3 h-3"></i></span>
          <span onclick="event.stopPropagation(); App.evalBuilder.deleteRow('eval_areas', ${a.id})" class="p-1 rounded-md bg-slate-100 text-slate-400 hover:bg-rose-100 hover:text-rose-600" title="Eliminar"><i data-lucide="trash-2" class="w-3 h-3"></i></span>
        </span>
      </button>`).join('');

    const compList = comps.map(c => `
      <div class="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200">
        <i data-lucide="check-circle-2" class="w-4 h-4 text-emerald-500 shrink-0"></i>
        <span class="text-xs font-semibold text-slate-700 truncate flex-1">${c.code ? `<span class="text-slate-400 font-mono">${esc(c.code)}</span> ` : ''}${esc(c.name)}</span>
        <span onclick="event.stopPropagation(); App.evalBuilder.openCompetencyModal(${c.id})" class="p-1 rounded-md bg-slate-100 text-slate-500 hover:bg-indigo-100 hover:text-indigo-600" title="Editar"><i data-lucide="pencil" class="w-3 h-3"></i></span>
        <span onclick="event.stopPropagation(); App.evalBuilder.deleteRow('eval_competencies', ${c.id})" class="p-1 rounded-md bg-slate-100 text-slate-400 hover:bg-rose-100 hover:text-rose-600" title="Eliminar"><i data-lucide="trash-2" class="w-3 h-3"></i></span>
      </div>`).join('');

    const periodList = periods.map(p => `
      <button onclick="App.evalBuilder.selectPeriod(${p.id})" class="w-full text-left px-3 py-2.5 rounded-xl border transition-all flex items-center gap-2 ${sel.periodId === p.id ? 'bg-indigo-50 border-indigo-300 ring-2 ring-indigo-200' : 'bg-white border-slate-200 hover:border-indigo-300'}">
        <span class="w-8 h-8 rounded-lg ${sel.periodId === p.id ? 'bg-indigo-600' : 'bg-slate-100'} ${sel.periodId === p.id ? 'text-white' : 'text-slate-500'} flex items-center justify-center shrink-0"><i data-lucide="${PERIOD_TYPES[p.period_type]?.icon || 'calendar'}" class="w-4 h-4"></i></span>
        <span class="min-w-0 flex-1">
          <span class="block font-bold text-slate-700 text-xs truncate">${esc(p.name)}</span>
          <span class="block text-[10px] text-slate-400">${esc(PERIOD_TYPES[p.period_type]?.label || p.period_type)}${p.weight ? ` · ${p.weight}%` : ''}</span>
        </span>
        <span class="flex gap-1 shrink-0">
          <span onclick="event.stopPropagation(); App.evalBuilder.openPeriodModal(${p.id})" class="p-1 rounded-md bg-slate-100 text-slate-500 hover:bg-indigo-100 hover:text-indigo-600" title="Editar"><i data-lucide="pencil" class="w-3 h-3"></i></span>
          <span onclick="event.stopPropagation(); App.evalBuilder.deleteRow('eval_periods', ${p.id})" class="p-1 rounded-md bg-slate-100 text-slate-400 hover:bg-rose-100 hover:text-rose-600" title="Eliminar"><i data-lucide="trash-2" class="w-3 h-3"></i></span>
        </span>
      </button>`).join('');

    const moduleList = modules.map(m => `
      <button onclick="App.evalBuilder.selectModule(${m.id})" class="w-full text-left px-3 py-2.5 rounded-xl border transition-all flex items-center gap-2 ${sel.moduleId === m.id ? 'bg-indigo-50 border-indigo-300 ring-2 ring-indigo-200' : 'bg-white border-slate-200 hover:border-indigo-300'}">
        <span class="w-8 h-8 rounded-lg ${sel.moduleId === m.id ? 'bg-indigo-600' : 'bg-slate-100'} ${sel.moduleId === m.id ? 'text-white' : 'text-slate-500'} flex items-center justify-center shrink-0"><i data-lucide="${EVAL_TYPES[m.eval_type]?.icon || 'folder'}" class="w-4 h-4"></i></span>
        <span class="min-w-0 flex-1">
          <span class="block font-bold text-slate-700 text-xs truncate">${esc(m.name)}</span>
          <span class="block text-[10px] text-slate-400">${esc(EVAL_TYPES[m.eval_type]?.label || m.eval_type)}${m.weight ? ` · ${m.weight}%` : ''}${m.area?.name ? ` · ${esc(m.area.name)}` : ''}</span>
        </span>
        <span class="flex gap-1 shrink-0">
          <span onclick="event.stopPropagation(); App.evalBuilder.openModuleModal(${m.id})" class="p-1 rounded-md bg-slate-100 text-slate-500 hover:bg-indigo-100 hover:text-indigo-600" title="Editar"><i data-lucide="pencil" class="w-3 h-3"></i></span>
          <span onclick="event.stopPropagation(); App.evalBuilder.deleteRow('eval_modules', ${m.id})" class="p-1 rounded-md bg-slate-100 text-slate-400 hover:bg-rose-100 hover:text-rose-600" title="Eliminar"><i data-lucide="trash-2" class="w-3 h-3"></i></span>
        </span>
      </button>`).join('');

    const actList = acts.map(a => `
      <div class="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200">
        <i data-lucide="check" class="w-4 h-4 text-indigo-400 shrink-0"></i>
        <span class="text-xs font-semibold text-slate-700 truncate flex-1">${esc(a.name)}</span>
        <span onclick="event.stopPropagation(); App.evalBuilder.openActivityModal(${a.id})" class="p-1 rounded-md bg-slate-100 text-slate-500 hover:bg-indigo-100 hover:text-indigo-600" title="Editar"><i data-lucide="pencil" class="w-3 h-3"></i></span>
        <span onclick="event.stopPropagation(); App.evalBuilder.deleteRow('eval_activities', ${a.id})" class="p-1 rounded-md bg-slate-100 text-slate-400 hover:bg-rose-100 hover:text-rose-600" title="Eliminar"><i data-lucide="trash-2" class="w-3 h-3"></i></span>
      </div>`).join('');

    const selModule = this._modules.find(m => m.id === sel.moduleId);
    const selPeriod = this._periods.find(p => p.id === sel.periodId);
    const selArea = this._areas.find(a => a.id === sel.areaId);
    const selComp = this._competencies.find(c => c.id === sel.competencyId);

    const formulaBanner = this._formulas.length
      ? `<div class="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 mb-4 flex items-center justify-between gap-3">
          <span class="text-xs font-bold text-indigo-700"><i data-lucide="function-square" class="w-4 h-4 inline -mt-0.5"></i> Fórmula activa: <span class="font-black">${esc(this._formulas[this._formulas.length - 1].name)}</span> (${this._formulas[this._formulas.length - 1].total_percent ?? 0}%)</span>
          <button onclick="App.evalBuilder.openFormulaBank()" class="text-[11px] font-black text-indigo-600 hover:underline">Ver fórmulas</button>
        </div>`
      : '';

    return `
      <div class="flex flex-wrap items-center gap-2 mb-4 text-xs font-bold text-slate-500">
        <span class="px-2.5 py-1 rounded-lg bg-violet-100 text-violet-700">${esc(cur.name)}</span>
        <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
        <span class="px-2.5 py-1 rounded-lg ${selArea ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-400'}">${esc(selArea?.name || 'Área')}</span>
        <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
        <span class="px-2.5 py-1 rounded-lg ${selPeriod ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-400'}">${esc(selPeriod?.name || 'Período')}</span>
        <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
        <span class="px-2.5 py-1 rounded-lg ${selModule ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-400'}">${esc(selModule?.name || 'Módulo')}</span>
        <div class="ml-auto flex gap-2">
          <button onclick="App.evalBuilder.openBoletaVivo()" class="px-3 py-1.5 rounded-lg bg-orange-600 text-white text-[11px] font-black shadow flex items-center gap-1.5 hover:bg-orange-700 transition-all"><i data-lucide="file-text" class="w-3.5 h-3.5"></i> Boleta en Vivo</button>
          <button onclick="App.evalBuilder.openBoletaPreview()" class="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-[11px] font-black shadow flex items-center gap-1.5 hover:bg-indigo-700 transition-all"><i data-lucide="function-square" class="w-3.5 h-3.5"></i> Boleta por Estudiante</button>
        </div>
      </div>

      ${formulaBanner}

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <!-- COL 1: Áreas -->
        <div class="bg-white rounded-2xl shadow-md border border-slate-100 p-4">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-black text-slate-700 flex items-center gap-2"><span class="w-2 h-5 bg-violet-500 rounded-full"></span> Áreas de Desarrollo</h3>
            <button onclick="App.evalBuilder.openAreaModal()" class="px-2.5 py-1.5 rounded-lg bg-violet-600 text-white text-[11px] font-black flex items-center gap-1 hover:bg-violet-700 transition-all"><i data-lucide="plus" class="w-3.5 h-3.5"></i> Nueva Área</button>
          </div>
          <div class="space-y-2 max-h-[420px] overflow-y-auto pr-1">
            ${areaChips || '<div class="text-center py-8 text-slate-400 text-xs">Sin áreas. Crea la primera o usa el Asistente IA.</div>'}
          </div>
        </div>

        <!-- COL 2: Competencias + Períodos -->
        <div class="space-y-4">
          <div class="bg-white rounded-2xl shadow-md border border-slate-100 p-4">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-sm font-black text-slate-700 flex items-center gap-2"><span class="w-2 h-5 bg-emerald-500 rounded-full"></span> Competencias</h3>
              <button onclick="App.evalBuilder.openCompetencyModal()" ${selArea ? '' : 'disabled'} class="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-black flex items-center gap-1 hover:bg-emerald-700 transition-all ${selArea ? '' : 'opacity-40 cursor-not-allowed'}"><i data-lucide="plus" class="w-3.5 h-3.5"></i> Nueva</button>
            </div>
            <div class="space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
              ${selArea ? (compList || '<div class="text-center py-6 text-slate-400 text-xs">Sin competencias para esta área.</div>') : '<div class="text-center py-6 text-slate-400 text-xs">Selecciona un área primero.</div>'}
            </div>
          </div>

          <div class="bg-white rounded-2xl shadow-md border border-slate-100 p-4">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-sm font-black text-slate-700 flex items-center gap-2"><span class="w-2 h-5 bg-indigo-500 rounded-full"></span> Períodos <span class="text-[10px] font-medium text-slate-400 normal-case">(Período Escolar / Unidad / Mes...)</span></h3>
              <button onclick="App.evalBuilder.openPeriodModal()" class="px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white text-[11px] font-black flex items-center gap-1 hover:bg-indigo-700 transition-all"><i data-lucide="plus" class="w-3.5 h-3.5"></i> Nuevo</button>
            </div>
            <div class="space-y-2 max-h-[180px] overflow-y-auto pr-1">
              ${periodList || '<div class="text-center py-6 text-slate-400 text-xs">Sin períodos. Pueden ser períodos escolares, unidades o bimestres.</div>'}
            </div>
          </div>
        </div>

        <!-- COL 3: Módulos + Actividades -->
        <div class="space-y-4">
          <div class="bg-white rounded-2xl shadow-md border border-slate-100 p-4">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-sm font-black text-slate-700 flex items-center gap-2"><span class="w-2 h-5 bg-amber-500 rounded-full"></span> Módulos</h3>
              <button onclick="App.evalBuilder.openModuleModal()" ${selPeriod ? '' : 'disabled'} class="px-2.5 py-1.5 rounded-lg bg-amber-500 text-white text-[11px] font-black flex items-center gap-1 hover:bg-amber-600 transition-all ${selPeriod ? '' : 'opacity-40 cursor-not-allowed'}"><i data-lucide="plus" class="w-3.5 h-3.5"></i> Nuevo</button>
            </div>
            <div class="space-y-2 max-h-[220px] overflow-y-auto pr-1">
              ${selPeriod ? (moduleList || '<div class="text-center py-6 text-slate-400 text-xs">Sin módulos en este período.</div>') : '<div class="text-center py-6 text-slate-400 text-xs">Selecciona un período primero.</div>'}
            </div>
            ${selModule ? this._moduleActions(selModule) : ''}
          </div>

          <div class="bg-white rounded-2xl shadow-md border border-slate-100 p-4">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-sm font-black text-slate-700 flex items-center gap-2"><span class="w-2 h-5 bg-sky-500 rounded-full"></span> Actividades</h3>
              <button onclick="App.evalBuilder.openActivityModal()" ${selModule ? '' : 'disabled'} class="px-2.5 py-1.5 rounded-lg bg-sky-600 text-white text-[11px] font-black flex items-center gap-1 hover:bg-sky-700 transition-all ${selModule ? '' : 'opacity-40 cursor-not-allowed'}"><i data-lucide="plus" class="w-3.5 h-3.5"></i> Nueva</button>
            </div>
            <div class="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
              ${selModule ? (actList || '<div class="text-center py-6 text-slate-400 text-xs">Sin actividades. Agrega la primera.</div>') : '<div class="text-center py-6 text-slate-400 text-xs">Selecciona un módulo para ver sus actividades.</div>'}
            </div>
          </div>
        </div>
      </div>
    `;
  },

  _moduleActions(m) {
    const cfg = normalizeEvalConfig(m.eval_type, m.config);
    const detail = m.eval_type === 'numeric' ? `Rango ${cfg.min}-${cfg.max}${cfg.allowDecimal ? ` · ${cfg.decimals} decimales` : ''}`
      : m.eval_type === 'stars' ? `Máximo ${cfg.maxStars} estrellas`
      : m.eval_type === 'scale' ? `${(cfg.levels || SCALE_LEVELS).length} niveles`
      : m.eval_type === 'checklist' ? `${cfg.items.length} ítems`
      : m.eval_type === 'rubric' ? `${cfg.criteria.length} criterios`
      : m.eval_type;
    return `
      <div class="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
        <div class="flex items-center gap-2 mb-2">
          <span class="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700 text-[10px] font-black uppercase">${esc(EVAL_TYPES[m.eval_type]?.label || m.eval_type)}</span>
          <span class="text-[10px] text-slate-500 font-medium">${esc(detail)}</span>
        </div>
        <button onclick="App.evalBuilder.openModuleGrades(${m.id})" class="w-full px-3 py-2 rounded-xl text-white font-black text-xs flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:opacity-90 transition-all active:scale-[0.98]">
          <i data-lucide="clipboard-check" class="w-4 h-4"></i> Calificar Módulo (${this._activities.filter(a => a.module_id === m.id).length} actividades)
        </button>
      </div>`;
  },

  /* ── SELECCIÓN ──────────────────────────────────────────── */
  selectArea(id) { this._sel.areaId = id; this._renderBody(); },
  selectPeriod(id) { this._sel.periodId = id; this._sel.moduleId = null; this._renderBody(); },
  selectModule(id) { this._sel.moduleId = id; this._renderBody(); },

  /* ── CRUD ROW ───────────────────────────────────────────── */
  async _saveRow(table, payload, id) {
    try {
      const uid = await this._uid();
      const data = { ...payload, created_by: uid };
      if (id) {
        const { error } = await supabase.from(table).update({ ...data, id }).eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from(table).insert(data);
        if (error) throw error;
      }
      return true;
    } catch (err) {
      Helpers.toast(err?.message || 'Error al guardar', 'error');
      return false;
    }
  },

  async deleteRow(table, id) {
    const name = table.replace('eval_', '');
    if (!confirm(`¿Eliminar este ${name}? Se borrará junto con sus elementos dependientes.`)) return;
    const { error } = await supabase.from(table).update({ deleted_at: new Date().toISOString() }).eq('id', id);
    if (error) return Helpers.toast(error.message, 'error');
    this._sel = { areaId: null, competencyId: null, periodId: null, moduleId: null };
    await this._loadChildren();
    this._renderBody();
    Helpers.toast(`${name.charAt(0).toUpperCase() + name.slice(1)} eliminado`, 'deleted');
  },

  /* ── MODALES CRUD ───────────────────────────────────────── */
  openEvaluationModal() {
    const yearOpts = this._years.map(y => `<option value="${y.id}">${esc(y.name)}</option>`).join('');
    openGlobalModal(`
      <div class="p-6">
        <h3 class="text-lg font-black text-slate-800 mb-1">Nueva Evaluación</h3>
        <p class="text-xs text-slate-400 mb-4">Agrupa toda la estructura de evaluación para un año escolar y nivel.</p>
        <label class="block text-xs font-black text-slate-600 uppercase mb-1">Nombre</label>
        <input id="evalEvalName" class="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-violet-500 mb-3" placeholder="Evaluación 2026-2027" value="Evaluación ${this._years[0]?.name || ''}">
        <label class="block text-xs font-black text-slate-600 uppercase mb-1">Año Escolar</label>
        <select id="evalEvalYear" class="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-violet-500 mb-3">${yearOpts}</select>
        <label class="block text-xs font-black text-slate-600 uppercase mb-1">Nivel Educativo</label>
        <select id="evalEvalLevel" class="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-violet-500 mb-3">
          <option value="">Sin nivel específico</option>
          ${EDUCATIONAL_LEVELS.map(l => `<option value="${l}">${l}</option>`).join('')}
        </select>
        <label class="block text-xs font-black text-slate-600 uppercase mb-1">Etiqueta de períodos</label>
        <select id="evalEvalLabel" class="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-violet-500 mb-4">
          <option value="Período Escolar">Período Escolar</option>
          <option value="Unidad">Unidad</option>
          <option value="Bimestre">Bimestre</option>
          <option value="Trimestre">Trimestre</option>
          <option value="Mes">Mes</option>
        </select>
        <button onclick="App.evalBuilder.saveEvaluation()" class="w-full py-3 rounded-xl text-white font-black text-sm" style="background:#7C3AED;">Guardar Evaluación</button>
      </div>`);
  },

  async saveEvaluation() {
    const name = document.getElementById('evalEvalName')?.value.trim();
    if (!name) return Helpers.toast('Ingresa el nombre', 'error');
    const school_year_id = Number(document.getElementById('evalEvalYear')?.value) || null;
    const ok = await this._saveRow('eval_evaluations', {
      name,
      school_year_id,
      level: document.getElementById('evalEvalLevel')?.value || null,
      structure_label: document.getElementById('evalEvalLabel')?.value || 'Período Escolar',
      status: 'draft'
    }, null);
    if (ok) {
      closeGlobalModal();
      await this._loadEvaluations();
      this._current = this._evaluations[this._evaluations.length - 1];
      await this._loadChildren();
      this._render();
      Helpers.toast('Evaluación creada', 'success');
    }
  },

  openAreaModal(id = null) {
    const a = this._areas.find(x => x.id === id);
    const icons = ['heart', 'message-circle', 'calculator', 'activity', 'palette', 'leaf', 'star', 'book-open', 'globe', 'music', 'smile', 'shield-check'];
    const colors = ['#F43F5E', '#0EA5E9', '#6366F1', '#F97316', '#A855F7', '#22C55E', '#EAB308', '#10B981', '#EC4899', '#14B8A6'];
    openGlobalModal(`
      <div class="p-6">
        <h3 class="text-lg font-black text-slate-800 mb-4">${a ? 'Editar' : 'Nueva'} Área de Desarrollo</h3>
        <label class="block text-xs font-black text-slate-600 uppercase mb-1">Nombre</label>
        <input id="evalAreaName" class="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-violet-500 mb-3" value="${esc(a?.name || '')}" placeholder="❤️ Desarrollo Socioemocional">
        <label class="block text-xs font-black text-slate-600 uppercase mb-1">Descripción</label>
        <textarea id="evalAreaDesc" rows="2" class="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-violet-500 mb-3" placeholder="Evalúa la interacción social...">${esc(a?.description || '')}</textarea>
        <div class="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label class="block text-xs font-black text-slate-600 uppercase mb-1">Color</label>
            <div class="flex flex-wrap gap-1.5" id="evalAreaColorWrap">
              ${colors.map(c => `<button type="button" onclick="App.evalBuilder.pickColor('${c}')" data-color="${c}" class="w-7 h-7 rounded-lg ${a?.color === c || (!a && c === '#F43F5E') ? 'ring-2 ring-offset-2 ring-slate-400' : ''}" style="background:${c}"></button>`).join('')}
            </div>
            <input type="hidden" id="evalAreaColor" value="${a?.color || '#F43F5E'}">
          </div>
          <div>
            <label class="block text-xs font-black text-slate-600 uppercase mb-1">Icono</label>
            <select id="evalAreaIcon" class="w-full px-2 py-2 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-violet-500">
              ${icons.map(i => `<option value="${i}" ${(a?.icon || 'heart') === i ? 'selected' : ''}>${i}</option>`).join('')}
            </select>
          </div>
        </div>
        <button onclick="App.evalBuilder.saveArea(${id ?? ''})" class="w-full py-3 rounded-xl text-white font-black text-sm" style="background:#7C3AED;">Guardar Área</button>
      </div>`);
  },

  pickColor(color) {
    const hidden = document.getElementById('evalAreaColor');
    if (hidden) hidden.value = color;
    document.querySelectorAll('#evalAreaColorWrap button').forEach(b => {
      const active = b.dataset.color === color;
      b.className = `w-7 h-7 rounded-lg ${active ? 'ring-2 ring-offset-2 ring-slate-400' : ''}`;
    });
  },

  async saveArea(id = null) {
    const name = document.getElementById('evalAreaName')?.value.trim();
    if (!name) return Helpers.toast('Ingresa el nombre del área', 'error');
    const ok = await this._saveRow('eval_areas', {
      evaluation_id: this._current.id,
      name,
      description: document.getElementById('evalAreaDesc')?.value.trim() || null,
      color: document.getElementById('evalAreaColor')?.value || '#F43F5E',
      icon: document.getElementById('evalAreaIcon')?.value || 'heart',
      sort_order: this._areas.length
    }, id);
    if (ok) { closeGlobalModal(); await this._loadChildren(); this._renderBody(); Helpers.toast(id ? 'Área actualizada' : 'Área creada', 'success'); }
  },

  openCompetencyModal(id = null) {
    const c = this._competencies.find(x => x.id === id);
    const area = this._areas.find(a => a.id === this._sel.areaId);
    openGlobalModal(`
      <div class="p-6">
        <h3 class="text-lg font-black text-slate-800 mb-4">${c ? 'Editar' : 'Nueva'} Competencia</h3>
        ${c ? '' : `<p class="text-xs text-slate-400 mb-4">Área: <span class="font-black text-slate-600">${esc(area?.name || '—')}</span></p>`}
        <label class="block text-xs font-black text-slate-600 uppercase mb-1">Nombre</label>
        <input id="evalCompName" class="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-emerald-500 mb-3" value="${esc(c?.name || '')}" placeholder="Comparte con sus compañeros">
        <label class="block text-xs font-black text-slate-600 uppercase mb-1">Código</label>
        <input id="evalCompCode" class="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-mono font-bold outline-none focus:border-emerald-500 mb-3" value="${esc(c?.code || '')}" placeholder="DS01">
        <label class="block text-xs font-black text-slate-600 uppercase mb-1">Descripción</label>
        <textarea id="evalCompDesc" rows="2" class="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-emerald-500 mb-4" placeholder="Participa respetando turnos y normas.">${esc(c?.description || '')}</textarea>
        <button onclick="App.evalBuilder.saveCompetency(${c?.id ?? ''})" class="w-full py-3 rounded-xl text-white font-black text-sm bg-emerald-600 hover:bg-emerald-700">Guardar Competencia</button>
      </div>`);
  },

  async saveCompetency(id = null) {
    const name = document.getElementById('evalCompName')?.value.trim();
    if (!name) return Helpers.toast('Ingresa el nombre de la competencia', 'error');
    const areaId = id ? this._competencies.find(x => x.id === id)?.area_id : this._sel.areaId;
    if (!areaId) return Helpers.toast('Selecciona un área primero', 'error');
    const ok = await this._saveRow('eval_competencies', {
      area_id: areaId,
      name,
      code: document.getElementById('evalCompCode')?.value.trim() || null,
      description: document.getElementById('evalCompDesc')?.value.trim() || null,
      sort_order: this._competencies.filter(c => c.area_id === areaId).length
    }, id);
    if (ok) { closeGlobalModal(); await this._loadChildren(); this._renderBody(); Helpers.toast(id ? 'Competencia actualizada' : 'Competencia creada', 'success'); }
  },

  openPeriodModal(id = null) {
    const p = this._periods.find(x => x.id === id);
    openGlobalModal(`
      <div class="p-6">
        <h3 class="text-lg font-black text-slate-800 mb-4">${p ? 'Editar' : 'Nuevo'} Período</h3>
        <p class="text-xs text-slate-400 mb-4">Puedes crear períodos escolares, unidades, bimestres, meses o la evaluación final. Depende del centro.</p>
        <label class="block text-xs font-black text-slate-600 uppercase mb-1">Nombre</label>
        <input id="evalPeriodName" class="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-indigo-500 mb-3" value="${esc(p?.name || '')}" placeholder="Primer período / Unidad 1 / Enero...">
        <label class="block text-xs font-black text-slate-600 uppercase mb-1">Tipo</label>
        <select id="evalPeriodType" class="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-indigo-500 mb-3">
          ${Object.entries(PERIOD_TYPES).map(([k, v]) => `<option value="${k}" ${(p?.period_type || 'periodo') === k ? 'selected' : ''}>${v.label}</option>`).join('')}
        </select>
        <div class="grid grid-cols-2 gap-3 mb-3">
          <div><label class="block text-xs font-black text-slate-600 uppercase mb-1">Inicio</label><input id="evalPeriodStart" type="date" class="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-indigo-500" value="${p?.start_date || ''}"></div>
          <div><label class="block text-xs font-black text-slate-600 uppercase mb-1">Fin</label><input id="evalPeriodEnd" type="date" class="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-indigo-500" value="${p?.end_date || ''}"></div>
        </div>
        <label class="block text-xs font-black text-slate-600 uppercase mb-1">Peso en la fórmula (%)</label>
        <input id="evalPeriodWeight" type="number" min="0" max="100" class="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-indigo-500 mb-4" value="${p?.weight || 0}">
        <button onclick="App.evalBuilder.savePeriod(${p?.id ?? ''})" class="w-full py-3 rounded-xl text-white font-black text-sm bg-indigo-600 hover:bg-indigo-700">Guardar Período</button>
      </div>`);
  },

  async savePeriod(id = null) {
    const name = document.getElementById('evalPeriodName')?.value.trim();
    if (!name) return Helpers.toast('Ingresa el nombre del período', 'error');
    const ok = await this._saveRow('eval_periods', {
      evaluation_id: this._current.id,
      name,
      period_type: document.getElementById('evalPeriodType')?.value || 'periodo',
      start_date: document.getElementById('evalPeriodStart')?.value || null,
      end_date: document.getElementById('evalPeriodEnd')?.value || null,
      weight: Number(document.getElementById('evalPeriodWeight')?.value) || 0,
      sort_order: this._periods.length
    }, id);
    if (ok) { closeGlobalModal(); await this._loadChildren(); this._renderBody(); Helpers.toast(id ? 'Período actualizado' : 'Período creado', 'success'); }
  },

  openModuleModal(id = null) {
    const m = this._modules.find(x => x.id === id);
    const period = this._periods.find(p => p.id === (m?.period_id || this._sel.periodId));
    const area = this._areas.find(a => a.id === (m?.area_id || this._sel.areaId));
    const compOpts = this._competencies.filter(c => c.area_id === area?.id)
      .map(c => `<option value="${c.id}" ${m?.competency_id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
    openGlobalModal(`
      <div class="p-6">
        <h3 class="text-lg font-black text-slate-800 mb-4">${m ? 'Editar' : 'Nuevo'} Módulo</h3>
        ${m ? '' : `<p class="text-xs text-slate-400 mb-4">Período: <span class="font-black text-slate-600">${esc(period?.name || '—')}</span> · Área: <span class="font-black text-slate-600">${esc(area?.name || '—')}</span></p>`}
        <label class="block text-xs font-black text-slate-600 uppercase mb-1">Nombre</label>
        <input id="evalModuleName" class="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500 mb-3" value="${esc(m?.name || '')}" placeholder="Autonomía">
        ${m ? '' : `
        <div class="grid grid-cols-2 gap-3 mb-3">
          <div><label class="block text-xs font-black text-slate-600 uppercase mb-1">Período</label>
            <select id="evalModulePeriod" class="w-full px-2 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500">
              ${this._periods.map(p => `<option value="${p.id}" ${p.id === period?.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
            </select></div>
          <div><label class="block text-xs font-black text-slate-600 uppercase mb-1">Área</label>
            <select id="evalModuleArea" onchange="App.evalBuilder.onModuleAreaChange()" class="w-full px-2 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500">
              ${this._areas.map(a => `<option value="${a.id}" ${a.id === area?.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}
            </select></div>
        </div>`}
        <label class="block text-xs font-black text-slate-600 uppercase mb-1">Competencia (opcional)</label>
        <select id="evalModuleComp" class="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500 mb-3">
          <option value="">Sin competencia</option>${compOpts}
        </select>
        <label class="block text-xs font-black text-slate-600 uppercase mb-1">Tipo de Evaluación</label>
        <select id="evalModuleType" onchange="App.evalBuilder.renderModuleConfig()" class="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500 mb-3">
          ${Object.entries(EVAL_TYPES).map(([k, v]) => `<option value="${k}" ${(m?.eval_type || 'numeric') === k ? 'selected' : ''}>${v.label} — ${v.desc}</option>`).join('')}
        </select>
        <div id="evalModuleConfigWrap"></div>
        <label class="block text-xs font-black text-slate-600 uppercase mb-1 mt-3">Peso en la fórmula (%)</label>
        <input id="evalModuleWeight" type="number" min="0" max="100" class="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500 mb-4" value="${m?.weight || 0}">
        <button onclick="App.evalBuilder.saveModule(${m?.id ?? ''})" class="w-full py-3 rounded-xl text-white font-black text-sm bg-amber-500 hover:bg-amber-600">Guardar Módulo</button>
      </div>`);
    this._editingModule = m || null;
    this.renderModuleConfig();
  },

  renderModuleConfig() {
    const wrap = document.getElementById('evalModuleConfigWrap');
    if (!wrap) return;
    const type = document.getElementById('evalModuleType')?.value || 'numeric';
    const m = this._editingModule;
    const cfg = normalizeEvalConfig(type, m?.config);
    if (type === 'numeric') {
      wrap.innerHTML = `
        <div class="grid grid-cols-3 gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200">
          <div><label class="block text-[10px] font-black text-slate-500 uppercase mb-1">Nota mínima</label><input id="evalCfgMin" type="number" class="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm font-bold" value="${cfg.min}"></div>
          <div><label class="block text-[10px] font-black text-slate-500 uppercase mb-1">Nota máxima</label><input id="evalCfgMax" type="number" class="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm font-bold" value="${cfg.max}"></div>
          <div><label class="block text-[10px] font-black text-slate-500 uppercase mb-1">Decimales</label><input id="evalCfgDec" type="number" min="0" max="4" class="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm font-bold" value="${cfg.decimals}"></div>
        </div>`;
    } else if (type === 'stars') {
      wrap.innerHTML = `
        <div class="p-3 rounded-xl bg-slate-50 border border-slate-200">
          <label class="block text-[10px] font-black text-slate-500 uppercase mb-1">Máximo de estrellas</label>
          <select id="evalCfgStars" class="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm font-bold">${[3, 4, 5].map(n => `<option value="${n}" ${cfg.maxStars === n ? 'selected' : ''}>${n} estrellas</option>`).join('')}</select>
        </div>`;
    } else if (type === 'scale') {
      wrap.innerHTML = `
        <div class="p-3 rounded-xl bg-slate-50 border border-slate-200">
          <label class="block text-[10px] font-black text-slate-500 uppercase mb-1">Niveles (valor:etiqueta:mín:máx) uno por línea</label>
          <textarea id="evalCfgScale" rows="5" class="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm font-mono">${(cfg.levels || SCALE_LEVELS).map(l => `${l.value}:${l.label}:${l.min}:${l.max}`).join('\n')}</textarea>
        </div>`;
    } else if (type === 'checklist') {
      wrap.innerHTML = `
        <div class="p-3 rounded-xl bg-slate-50 border border-slate-200">
          <label class="block text-[10px] font-black text-slate-500 uppercase mb-1">Ítems de la lista (uno por línea)</label>
          <textarea id="evalCfgChecklist" rows="4" class="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm">${(cfg.items || []).join('\n')}</textarea>
        </div>`;
    } else if (type === 'rubric') {
      wrap.innerHTML = `
        <div class="p-3 rounded-xl bg-slate-50 border border-slate-200">
          <label class="block text-[10px] font-black text-slate-500 uppercase mb-1">Criterios: Criterio|Opc1:v,Op2:v,...</label>
          <textarea id="evalCfgRubric" rows="4" class="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm font-mono" placeholder="Creatividad|Inicial:0,Proceso:1,Logrado:2,Destacado:3&#10;Presentación|Regular:0,Bueno:1,Excelente:2">${(cfg.criteria || []).map(c => `${c.name}|${(c.options || []).map(o => `${o.label}:${o.value}`).join(',')}`).join('\n')}</textarea>
        </div>`;
    } else {
      wrap.innerHTML = '';
    }
  },

  onModuleAreaChange() {
    const areaId = Number(document.getElementById('evalModuleArea')?.value);
    const sel = document.getElementById('evalModuleComp');
    if (!sel) return;
    const opts = this._competencies.filter(c => c.area_id === areaId);
    sel.innerHTML = '<option value="">Sin competencia</option>' + opts.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  },

  _readModuleConfig(type) {
    if (type === 'numeric') {
      const min = Number(document.getElementById('evalCfgMin')?.value) || 0;
      const max = Number(document.getElementById('evalCfgMax')?.value) || 100;
      const decimals = Number(document.getElementById('evalCfgDec')?.value) || 0;
      return { min, max, decimals, allowDecimal: decimals > 0 };
    }
    if (type === 'stars') {
      return { maxStars: Number(document.getElementById('evalCfgStars')?.value) || 5 };
    }
    if (type === 'scale') {
      const lines = (document.getElementById('evalCfgScale')?.value || '').split('\n').map(s => s.trim()).filter(Boolean);
      const levels = lines.map(l => {
        const [value, label, min, max] = l.split(':');
        return { value: (value || 'nivel').trim(), label: (label || value).trim(), min: Number(min) || 0, max: Number(max) || 100 };
      });
      return { levels };
    }
    if (type === 'checklist') {
      return { items: (document.getElementById('evalCfgChecklist')?.value || '').split('\n').map(s => s.trim()).filter(Boolean) };
    }
    if (type === 'rubric') {
      const lines = (document.getElementById('evalCfgRubric')?.value || '').split('\n').map(s => s.trim()).filter(Boolean);
      const criteria = lines.map(l => {
        const [name, optsStr] = l.split('|');
        const options = (optsStr || '').split(',').filter(Boolean).map(o => {
          const [label, value] = o.split(':');
          return { label: (label || '').trim(), value: Number(value) || 0 };
        });
        return { name: (name || '').trim(), options };
      });
      return { criteria };
    }
    return {};
  },

  async saveModule(id = null) {
    const name = document.getElementById('evalModuleName')?.value.trim();
    if (!name) return Helpers.toast('Ingresa el nombre del módulo', 'error');
    const type = document.getElementById('evalModuleType')?.value || 'numeric';
    const periodId = id ? this._modules.find(x => x.id === id)?.period_id : Number(document.getElementById('evalModulePeriod')?.value);
    const areaId = id ? this._modules.find(x => x.id === id)?.area_id : Number(document.getElementById('evalModuleArea')?.value);
    if (!periodId) return Helpers.toast('Selecciona un período', 'error');
    if (!areaId) return Helpers.toast('Selecciona un área', 'error');
    const ok = await this._saveRow('eval_modules', {
      period_id: periodId,
      area_id: areaId,
      competency_id: Number(document.getElementById('evalModuleComp')?.value) || null,
      name,
      eval_type: type,
      config: this._readModuleConfig(type),
      weight: Number(document.getElementById('evalModuleWeight')?.value) || 0,
      sort_order: this._modules.filter(x => x.period_id === periodId).length
    }, id);
    if (ok) {
      closeGlobalModal();
      this._editingModule = null;
      await this._loadChildren();
      if (!this._sel.periodId) this._sel.periodId = periodId;
      this._renderBody();
      Helpers.toast(id ? 'Módulo actualizado' : 'Módulo creado', 'success');
    }
  },

  openActivityModal(id = null) {
    const a = this._activities.find(x => x.id === id);
    openGlobalModal(`
      <div class="p-6">
        <h3 class="text-lg font-black text-slate-800 mb-4">${a ? 'Editar' : 'Nueva'} Actividad</h3>
        ${a ? '' : `<p class="text-xs text-slate-400 mb-4">Módulo: <span class="font-black text-slate-600">${esc(this._modules.find(m => m.id === this._sel.moduleId)?.name || '—')}</span></p>`}
        <label class="block text-xs font-black text-slate-600 uppercase mb-1">Nombre</label>
        <input id="evalActName" class="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-sky-500 mb-3" value="${esc(a?.name || '')}" placeholder="Se pone los zapatos">
        <label class="block text-xs font-black text-slate-600 uppercase mb-1">Descripción</label>
        <textarea id="evalActDesc" rows="2" class="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-sky-500 mb-4" placeholder="Observación de la actividad">${esc(a?.description || '')}</textarea>
        <button onclick="App.evalBuilder.saveActivity(${a?.id ?? ''})" class="w-full py-3 rounded-xl text-white font-black text-sm bg-sky-600 hover:bg-sky-700">Guardar Actividad</button>
      </div>`);
  },

  async saveActivity(id = null) {
    const name = document.getElementById('evalActName')?.value.trim();
    if (!name) return Helpers.toast('Ingresa el nombre de la actividad', 'error');
    const moduleId = id ? this._activities.find(x => x.id === id)?.module_id : this._sel.moduleId;
    if (!moduleId) return Helpers.toast('Selecciona un módulo primero', 'error');
    const ok = await this._saveRow('eval_activities', {
      module_id: moduleId,
      name,
      description: document.getElementById('evalActDesc')?.value.trim() || null,
      sort_order: this._activities.filter(x => x.module_id === moduleId).length
    }, id);
    if (ok) { closeGlobalModal(); await this._loadChildren(); this._renderBody(); Helpers.toast(id ? 'Actividad actualizada' : 'Actividad creada', 'success'); }
  },

  /* ── CALIFICAR MÓDULO (Directora puede calificar) ───────── */
  async openModuleGrades(moduleId) {
    const module = this._modules.find(m => m.id === moduleId);
    if (!module) return;
    const activities = this._activities.filter(a => a.module_id === moduleId);
    if (!activities.length) return Helpers.toast('Este módulo no tiene actividades. Agréguelas primero.', 'warning');

    const { data: scores } = await supabase.from('eval_scores').select('*')
      .in('activity_id', activities.map(a => a.id));
    this._scores = scores || [];
    const scoresMap = buildScoresMap(this._scores, activities);

    const classroomOpts = this._classrooms.length
      ? `<select id="evalGridClassroom" onchange="App.evalBuilder.renderModuleGrades()" class="px-3 py-2 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-violet-500 bg-white">
          <option value="all">Todas las aulas</option>${this._classrooms.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
        </select>` : '';

    openGlobalModal(`
      <div class="p-6">
        <div class="flex items-center justify-between mb-1">
          <h3 class="text-lg font-black text-slate-800 flex items-center gap-2">
            <span class="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700 text-[10px] font-black uppercase">${esc(EVAL_TYPES[module.eval_type]?.label)}</span>
            Calificar: ${esc(module.name)}
          </h3>
        </div>
        <p class="text-xs text-slate-400 mb-4">${esc(module.area?.name || '')} · ${esc(module.period?.name || '')} · ${activities.length} actividades</p>
        <div class="flex items-center gap-2 mb-4">${classroomOpts}
          <span class="text-xs text-slate-400">El promedio de cada estudiante se calcula automáticamente.</span>
        </div>
        <div id="evalModuleGradesBody"></div>
        <div class="flex gap-3 mt-5">
          <button onclick="App.evalBuilder.saveModuleGrades(${moduleId})" class="flex-1 py-3 rounded-xl text-white font-black text-sm bg-violet-600 hover:bg-violet-700 flex items-center justify-center gap-2"><i data-lucide="save" class="w-4 h-4"></i> Guardar Calificaciones</button>
          <button onclick="closeGlobalModal()" class="px-5 py-3 rounded-xl bg-slate-100 text-slate-600 font-black text-sm hover:bg-slate-200">Cancelar</button>
        </div>
      </div>`, true);
    this._gradeModule = module;
    this._gradeActivities = activities;
    this._renderModuleGrades();
  },

  _gridStudents() {
    const classroomId = document.getElementById('evalGridClassroom')?.value;
    return classroomId && classroomId !== 'all'
      ? this._students.filter(s => String(s.classroom_id) === classroomId)
      : this._students;
  },

  renderModuleGrades() {
    const body = document.getElementById('evalModuleGradesBody');
    if (!body) return;
    const students = this._gridStudents();
    const scoresMap = buildScoresMap(this._scores, this._gradeActivities);
    body.innerHTML = gradingGridHtml(this._gradeModule, this._gradeActivities, students, scoresMap, { editable: true });
  },

  async saveModuleGrades(moduleId) {
    const body = document.getElementById('evalModuleGradesBody');
    const rows = readGradingGrid(body, this._gradeModule, this._gradeActivities, this._gridStudents());
    if (!rows.length) return Helpers.toast('Ingresa al menos una calificación', 'warning');
    const uid = await this._uid();
    const payload = rows.map(r => ({
      module_id: moduleId,
      activity_id: r.activity_id,
      student_id: r.student_id,
      evaluated_by: uid,
      ...r.record
    }));
    const { error } = await supabase.from('eval_scores').upsert(payload, { onConflict: 'activity_id,student_id' });
    if (error) return Helpers.toast(error.message, 'error');
    const { data: scores } = await supabase.from('eval_scores').select('*').in('activity_id', this._gradeActivities.map(a => a.id));
    this._scores = scores || [];
    this._renderModuleGrades();
    Helpers.toast('Calificaciones guardadas', 'success');
  },

  /* ── BOLETA POR ESTUDIANTE (preview de fórmula) ─────────── */
  async openBoletaPreview() {
    const formula = this._formulas[this._formulas.length - 1];
    if (!formula) return Helpers.toast('No hay fórmula definida para esta evaluación. Crea una desde el Banco de Fórmulas.', 'warning');
    if (!this._students.length) return Helpers.toast('No hay estudiantes registrados', 'warning');

    const activities = this._activities;
    const moduleIds = this._modules.map(m => m.id);
    const { data: scores } = activities.length ? await supabase.from('eval_scores').select('*').in('activity_id', activities.map(a => a.id)) : { data: [] };
    const scoresMap = buildScoresMap(scores || [], activities);

    // Promedio por módulo → área → período → competencia
    const moduleAvg = {};
    const moduleActivityCount = {};
    this._students.forEach(st => {
      this._modules.forEach(m => {
        const acts = this._activities.filter(a => a.module_id === m.id);
        const vals = acts.map(a => normalizeScore(m, scoresMap[`${m.id}:${a.id}:${st.id}`])).filter(v => v != null);
        if (vals.length) {
          moduleAvg[`${m.id}:${st.id}`] = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
        }
      });
    });

    const classroomOpts = `<select id="evalBoletaClassroom" onchange="App.evalBuilder.renderBoleta()" class="px-3 py-2 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-indigo-500 bg-white">
      <option value="all">Todas las aulas</option>${this._classrooms.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>`;

    openGlobalModal(`
      <div class="p-6">
        <h3 class="text-lg font-black text-slate-800 mb-1">Boleta por Estudiante</h3>
        <p class="text-xs text-slate-400 mb-4">Nota final calculada con la fórmula: <span class="font-black text-indigo-600">${esc(formula.name)}</span> (${formula.total_percent ?? 0}%)</p>
        <div class="flex items-center gap-2 mb-4">${classroomOpts}
          <span class="text-[10px] text-slate-400">Se usan las notas promedio de cada módulo/área/período según la fórmula.</span>
        </div>
        <div id="evalBoletaBody" class="table-scroll-wrap rounded-2xl border border-slate-200 overflow-hidden"></div>
      </div>`, true);
    this._boletaFormula = formula;
    this._boletaModuleAvg = moduleAvg;
    this.renderBoleta();
  },

  renderBoleta() {
    const body = document.getElementById('evalBoletaBody');
    if (!body) return;
    const classroomId = document.getElementById('evalBoletaClassroom')?.value;
    const students = classroomId && classroomId !== 'all'
      ? this._students.filter(s => String(s.classroom_id) === classroomId)
      : this._students;

    const formula = this._boletaFormula;
    const componentValues = {};
    students.forEach(st => {
      this._modules.forEach(m => {
        const avg = this._boletaModuleAvg[`${m.id}:${st.id}`];
        if (avg != null) {
          componentValues[`module:${m.id}`] = avg;
          if (m.area_id) {
            const areaKey = `area:${m.area_id}`;
            const prev = componentValues[areaKey];
            componentValues[areaKey] = prev != null ? (prev + avg) / 2 : avg;
          }
          if (m.period_id) {
            const pKey = `period:${m.period_id}`;
            const prev = componentValues[pKey];
            componentValues[pKey] = prev != null ? (prev + avg) / 2 : avg;
          }
          if (m.competency_id) {
            const cKey = `competency:${m.competency_id}`;
            const prev = componentValues[cKey];
            componentValues[cKey] = prev != null ? (prev + avg) / 2 : avg;
          }
        }
      });
    });

    const evaluated = new Set();
    students.forEach(st => {
      formula.parts.forEach(p => {
        const key = `${p.type}:${p.ref_id}`;
        if (p.ref_id && componentValues[key] != null) evaluated.add(st.id);
      });
    });

    let html = `<table class="w-full text-sm text-left border-separate border-spacing-0">
      <thead class="bg-indigo-50 text-indigo-700 font-black uppercase text-[10px] tracking-wider sticky top-0 z-10">
        <tr><th class="px-4 py-3 border-b border-indigo-100">Estudiante</th><th class="px-4 py-3 text-center border-b border-indigo-100">Aula</th><th class="px-4 py-3 text-center border-b border-indigo-100">Nota Final</th><th class="px-4 py-3 text-center border-b border-indigo-100">Nivel</th></tr>
      </thead><tbody class="divide-y divide-slate-100 bg-white">`;
    students.forEach(st => {
      const finalScore = computeFinalScore(formula.parts, componentValues);
      const lvl = gradeToLevel(finalScore);
      const room = this._classrooms.find(c => c.id === st.classroom_id);
      html += `<tr class="hover:bg-indigo-50/40">
        <td class="px-4 py-2.5 font-bold text-slate-700">${esc(st.name)}</td>
        <td class="px-4 py-2.5 text-center text-xs font-medium text-slate-500">${esc(room?.name || '—')}</td>
        <td class="px-4 py-2.5 text-center font-black text-base ${finalScore == null ? 'text-slate-300' : finalScore >= 85 ? 'text-emerald-600' : finalScore >= 60 ? 'text-amber-600' : 'text-rose-600'}">${finalScore != null ? finalScore.toFixed(2) : '—'}</td>
        <td class="px-4 py-2.5 text-center"><span class="px-2 py-1 rounded-lg text-[10px] font-black ${lvl.cls}">${lvl.label}</span></td>
      </tr>`;
    });
    html += `</tbody></table>`;
    body.innerHTML = html;
  },

  /* ── BOLETA EN VIVO (estructura 5×5 + edición + impresión) ─ */
  async openBoletaVivo() {
    if (!this._current) return Helpers.toast('Selecciona una evaluación primero', 'warning');
    if (!this._periods.length) return Helpers.toast('La evaluación no tiene períodos. Crea períodos en Estructura.', 'warning');
    if (!this._classrooms.length) return Helpers.toast('No hay aulas registradas', 'warning');
    openGlobalModal(`
      <div class="p-2 sm:p-4 w-[calc(100vw-2rem)] md:w-[1120px]">
        <div class="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <h3 class="text-lg font-black text-slate-800 flex items-center gap-2">
              <span class="p-1.5 rounded-xl text-white" style="background:linear-gradient(135deg,#FF7A00,#FFA500)"><i data-lucide="file-text" class="w-5 h-5"></i></span>
              Boleta en Vivo
            </h3>
            <p class="text-xs text-slate-400 mt-0.5">${esc(this._current.name)} — estructura 5×5 automática, edición en vivo e impresión.</p>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-[11px] font-black text-slate-500 uppercase">Aula</span>
            <select id="boletaVivoClassroom" class="px-3 py-2 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-[#FF7A00] bg-white">
              ${this._classrooms.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div id="boletaVivoRoot"></div>
      </div>`, true);
    document.getElementById('boletaVivoClassroom')?.addEventListener('change', (e) => {
      this._initBoletaVivo(Number(e.target.value));
    });
    this._initBoletaVivo(this._classrooms[0]?.id);
  },

  async _initBoletaVivo(classroomId) {
    const root = document.getElementById('boletaVivoRoot');
    if (!root || !classroomId) return;
    await BoletaUI.init({
      container: root,
      evaluationId: this._current.id,
      classroomId,
      onClose: () => closeGlobalModal()
    });
  },

  /* ── FÓRMULAS: BANCO + CONSTRUCTOR ─────────────────────── */
  openFormulaBank() {
    const formulas = this._formulas;
    const listHtml = formulas.map(f => {
      const parts = (f.parts || []).map(p => `<span class="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-bold">${esc(p.name || p.type)} ${p.percent}%</span>`).join(' ');
      return `<div class="border border-slate-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center gap-2">
        <div class="flex-1 min-w-0">
          <div class="font-black text-sm text-slate-700 flex items-center gap-2">${esc(f.name)} <span class="px-1.5 py-0.5 rounded-md bg-indigo-100 text-indigo-700 text-[10px] font-black">${f.total_percent ?? 0}%</span></div>
          <div class="flex flex-wrap gap-1 mt-1.5">${parts}</div>
        </div>
        <div class="flex gap-1.5 shrink-0">
          <button onclick="App.evalBuilder.openFormulaBuilder(${f.id})" class="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-black hover:bg-indigo-100 hover:text-indigo-700">Editar</button>
          <button onclick="App.evalBuilder.deleteRow('eval_formulas', ${f.id})" class="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-400 text-[11px] font-black hover:bg-rose-100 hover:text-rose-600">Eliminar</button>
        </div>
      </div>`;
    }).join('');

    const bankHtml = this._templates.map(t => {
      const parts = (t.parts || []).map(p => `${esc(p.name || p.type)} <b>${p.percent}%</b>`).join(' + ');
      return `<div class="border border-indigo-100 bg-indigo-50/50 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center gap-2">
        <div class="flex-1 min-w-0">
          <div class="font-black text-sm text-slate-700 flex items-center gap-2"><i data-lucide="library-big" class="w-4 h-4 text-indigo-500"></i> ${esc(t.template_name || t.name)}</div>
          <div class="text-[11px] text-slate-500 mt-0.5 truncate">${esc(parts)}</div>
        </div>
        <button onclick="App.evalBuilder.applyTemplate(${t.id})" class="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-[11px] font-black hover:bg-indigo-700">Aplicar a esta evaluación</button>
      </div>`;
    }).join('');

    openGlobalModal(`
      <div class="p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-black text-slate-800">Fórmulas de Evaluación</h3>
          <button onclick="App.evalBuilder.openFormulaBuilder()" class="px-3 py-2 rounded-xl bg-violet-600 text-white text-xs font-black flex items-center gap-1.5 hover:bg-violet-700"><i data-lucide="plus" class="w-4 h-4"></i> Nueva Fórmula</button>
        </div>
        <div class="mb-2 text-[11px] font-black text-slate-400 uppercase tracking-wide">Fórmulas de esta evaluación</div>
        <div class="space-y-2 mb-6">${listHtml || '<div class="text-center py-6 text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl">Sin fórmulas para esta evaluación.</div>'}</div>
        <div class="mb-2 text-[11px] font-black text-slate-400 uppercase tracking-wide">Banco institucional (plantillas)</div>
        <div class="space-y-2">${bankHtml || '<div class="text-center py-6 text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl">Sin plantillas.</div>'}</div>
      </div>`, true);
  },

  openFormulaBuilder(id = null) {
    const f = this._formulas.find(x => x.id === id);
    this._editingFormula = f || null;
    const parts = (f?.parts || [{ type: 'module', ref_id: null, name: '', percent: 30 }, { type: 'module', ref_id: null, name: '', percent: 30 }, { type: 'module', ref_id: null, name: '', percent: 40 }]);
    openGlobalModal(`
      <div class="p-6">
        <h3 class="text-lg font-black text-slate-800 mb-4">${f ? 'Editar' : 'Nueva'} Fórmula</h3>
        <label class="block text-xs font-black text-slate-600 uppercase mb-1">Nombre de la fórmula</label>
        <input id="evalFormulaName" class="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-violet-500 mb-4" value="${esc(f?.name || 'Nota Final')}" placeholder="Nota Final">
        <div class="mb-2 text-[11px] font-black text-slate-400 uppercase tracking-wide">Componentes</div>
        <div id="evalFormulaParts" class="space-y-2 mb-3"></div>
        <button onclick="App.evalBuilder.addFormulaPart()" class="w-full py-2.5 rounded-xl border-2 border-dashed border-violet-300 text-violet-600 text-xs font-black flex items-center justify-center gap-2 hover:bg-violet-50 transition-all"><i data-lucide="plus" class="w-4 h-4"></i> Agregar componente</button>
        <div id="evalFormulaTotal" class="mt-4 p-3 rounded-xl font-black text-sm text-center border-2"></div>
        <button onclick="App.evalBuilder.saveFormula(${f?.id ?? ''})" class="w-full mt-3 py-3 rounded-xl text-white font-black text-sm" style="background:#7C3AED;">Guardar Fórmula</button>
      </div>`, true);
    this._renderFormulaParts(parts);
  },

  _formulaEntities() {
    return {
      area: this._areas.map(x => ({ id: x.id, name: x.name })),
      competency: this._competencies.map(x => ({ id: x.id, name: x.name })),
      period: this._periods.map(x => ({ id: x.id, name: x.name })),
      module: this._modules.map(x => ({ id: x.id, name: x.name }))
    };
  },

  _renderFormulaParts(parts) {
    const wrap = document.getElementById('evalFormulaParts');
    if (!wrap) return;
    const ents = this._formulaEntities();
    wrap.innerHTML = parts.map((p, i) => {
      const opts = ents[p.type] || ents.module;
      return `<div class="eval-fpart grid grid-cols-[90px_1fr_70px_34px] gap-2 items-center border border-slate-200 rounded-xl p-2 bg-slate-50/60">
        <select onchange="App.evalBuilder.formulaPartTypeChange(${i})" class="px-1.5 py-1.5 border border-slate-300 rounded-lg text-[11px] font-bold outline-none bg-white">
          ${Object.entries({ area: 'Área', competency: 'Competencia', period: 'Período', module: 'Módulo' }).map(([k, label]) => `<option value="${k}" ${p.type === k ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
        <select data-name="ref" class="px-1.5 py-1.5 border border-slate-300 rounded-lg text-[11px] font-bold outline-none bg-white">
          <option value="">— Elegir —</option>
          ${opts.map(o => `<option value="${o.id}" ${String(p.ref_id) === String(o.id) ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}
        </select>
        <input data-name="percent" type="number" min="0" max="100" class="px-1.5 py-1.5 border border-slate-300 rounded-lg text-center text-[11px] font-black outline-none bg-white" value="${p.percent ?? ''}" placeholder="%">
        <button onclick="App.evalBuilder.removeFormulaPart(${i})" class="w-8 h-8 rounded-lg bg-rose-50 text-rose-500 flex items-center justify-center hover:bg-rose-100"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>
      </div>`;
    }).join('');
    this._formulaPartsState = parts;
    this._updateFormulaTotal();
  },

  formulaPartTypeChange(idx) {
    const rows = document.querySelectorAll('#evalFormulaParts .eval-fpart');
    const row = rows[idx];
    if (!row) return;
    const type = row.querySelector('select').value;
    const ents = this._formulaEntities();
    const sel = row.querySelector('[data-name="ref"]');
    if (sel) {
      const opts = ents[type] || ents.module;
      sel.innerHTML = '<option value="">— Elegir —</option>' + opts.map(o => `<option value="${o.id}">${esc(o.name)}</option>`).join('');
    }
  },

  removeFormulaPart(idx) {
    const wrap = document.getElementById('evalFormulaParts');
    const rows = wrap.querySelectorAll('.eval-fpart');
    if (rows.length <= 1) return;
    rows[idx]?.remove();
    this._updateFormulaTotal();
  },

  addFormulaPart() {
    const wrap = document.getElementById('evalFormulaParts');
    const ents = this._formulaEntities();
    wrap.insertAdjacentHTML('beforeend', `<div class="eval-fpart grid grid-cols-[90px_1fr_70px_34px] gap-2 items-center border border-slate-200 rounded-xl p-2 bg-slate-50/60">
      <select onchange="App.evalBuilder.formulaPartTypeChange(${wrap.querySelectorAll('.eval-fpart').length})" class="px-1.5 py-1.5 border border-slate-300 rounded-lg text-[11px] font-bold outline-none bg-white">
        ${Object.entries({ area: 'Área', competency: 'Competencia', period: 'Período', module: 'Módulo' }).map(([k, label]) => `<option value="${k}" ${k === 'module' ? 'selected' : ''}>${label}</option>`).join('')}
      </select>
      <select data-name="ref" class="px-1.5 py-1.5 border border-slate-300 rounded-lg text-[11px] font-bold outline-none bg-white">
        <option value="">— Elegir —</option>${ents.module.map(o => `<option value="${o.id}">${esc(o.name)}</option>`).join('')}
      </select>
      <input data-name="percent" type="number" min="0" max="100" class="px-1.5 py-1.5 border border-slate-300 rounded-lg text-center text-[11px] font-black outline-none bg-white" placeholder="%">
      <button onclick="App.evalBuilder.removeFormulaPart(${wrap.querySelectorAll('.eval-fpart').length})" class="w-8 h-8 rounded-lg bg-rose-50 text-rose-500 flex items-center justify-center hover:bg-rose-100"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>
    </div>`);
    this._updateFormulaTotal();
  },

  _updateFormulaTotal() {
    const rows = document.querySelectorAll('#evalFormulaParts .eval-fpart');
    const total = [...rows].reduce((sum, row) => sum + (Number(row.querySelector('[data-name="percent"]')?.value) || 0), 0);
    const el = document.getElementById('evalFormulaTotal');
    if (!el) return;
    const ok = Math.abs(total - 100) < 0.001;
    el.textContent = ok ? `✔ Total: ${total}%` : `⚠ La fórmula debe sumar 100% (actual: ${total}%)`;
    el.className = `mt-4 p-3 rounded-xl font-black text-sm text-center border-2 ${ok ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-600 border-rose-200'}`;
  },

  async saveFormula(id = null) {
    const name = document.getElementById('evalFormulaName')?.value.trim();
    if (!name) return Helpers.toast('Ingresa el nombre de la fórmula', 'error');
    const rows = document.querySelectorAll('#evalFormulaParts .eval-fpart');
    const parts = [...rows].map(row => {
      const type = row.querySelector('select')?.value;
      const refEl = row.querySelector('[data-name="ref"]');
      const refId = refEl?.value ? Number(refEl.value) : null;
      const percent = Number(row.querySelector('[data-name="percent"]')?.value) || 0;
      const ents = this._formulaEntities();
      const entity = (ents[type] || []).find(o => o.id === refId);
      return { type, ref_id: refId, name: entity?.name || '', percent };
    }).filter(p => p.percent > 0 || p.ref_id);
    const total = parts.reduce((s, p) => s + p.percent, 0);
    if (Math.abs(total - 100) > 0.001) return Helpers.toast(`⚠ La fórmula debe sumar 100%. Actual: ${total}%`, 'error');
    const ok = await this._saveRow('eval_formulas', { evaluation_id: this._current.id, name, parts, total_percent: total, is_template: false }, id);
    if (ok) {
      closeGlobalModal();
      await this._loadChildren();
      Helpers.toast(id ? 'Fórmula actualizada' : 'Fórmula creada', 'success');
    }
  },

  async applyTemplate(templateId) {
    const t = this._templates.find(x => x.id === templateId);
    if (!t) return;
    const ents = this._formulaEntities();
    const parts = (t.parts || []).map(p => {
      const match = (ents[p.type] || []).find(o => o.name.toLowerCase() === String(p.name || '').toLowerCase());
      return { type: p.type, ref_id: match?.id || null, name: p.name || '', percent: p.percent || 0 };
    });
    const ok = await this._saveRow('eval_formulas', {
      evaluation_id: this._current.id,
      name: `${t.template_name || t.name} (${new Date().toLocaleDateString()})`,
      parts,
      total_percent: t.total_percent ?? 100,
      is_template: false
    }, null);
    if (ok) {
      await this._loadChildren();
      Helpers.toast(`Plantilla «${t.template_name || t.name}» aplicada. Ajusta los componentes que quedaron sin asignar.`, 'success');
    }
  },

  /* ── ASISTENTE IA PEDAGÓGICO ────────────────────────────── */
  openAIAssistant() {
    const struct = generateStructureFromLevel('Párvulos');
    openGlobalModal(`
      <div class="p-6">
        <h3 class="text-lg font-black text-slate-800 flex items-center gap-2 mb-1">
          <span class="p-1.5 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white"><i data-lucide="sparkles" class="w-5 h-5"></i></span>
          Asistente IA Pedagógico
        </h3>
        <p class="text-xs text-slate-400 mb-4">Genera la estructura completa de evaluación para el nivel seleccionado. Tú solo revisas, editas y guardas.</p>
        ${this._current ? '' : '<div class="mb-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs font-bold">Primero crea una evaluación para poder generar la estructura.</div>'}
        <label class="block text-xs font-black text-slate-600 uppercase mb-1">¿Qué nivel educativo estás evaluando?</label>
        <select id="evalAILevel" onchange="App.evalBuilder.updateAIPreview()" class="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-violet-500 mb-4">
          ${EDUCATIONAL_LEVELS.map(l => `<option value="${l}">${l}</option>`).join('')}
        </select>
        <div id="evalAIPreview" class="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 mb-4"></div>
        <button onclick="App.evalBuilder.generateFromAI()" ${this._current ? '' : 'disabled'} class="w-full py-3 rounded-xl text-white font-black text-sm flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:opacity-90 active:scale-[0.98] transition-all ${this._current ? '' : 'opacity-40 cursor-not-allowed'}">
          <i data-lucide="wand-2" class="w-4 h-4"></i> Generar estructura completa
        </button>
      </div>`);
    this.updateAIPreview();
  },

  updateAIPreview() {
    const level = document.getElementById('evalAILevel')?.value || 'Párvulos';
    const el = document.getElementById('evalAIPreview');
    if (!el) return;
    const s = generateStructureFromLevel(level);
    if (!s) { el.innerHTML = 'Sin preset para este nivel.'; return; }
    const nComp = s.areas.reduce((acc, a) => acc + (a.competencies?.length || 0), 0);
    const nAct = s.modules.reduce((acc, m) => acc + (m.activities?.length || 0), 0);
    el.innerHTML = `<div class="font-black text-slate-700 mb-1.5">Nivel: ${esc(level)}</div>
      <div class="grid grid-cols-2 gap-1.5">
        <div class="flex items-center gap-1.5"><span class="w-6 h-6 rounded-md bg-violet-100 text-violet-600 flex items-center justify-center"><i data-lucide="layout-grid" class="w-3.5 h-3.5"></i></span> ${s.areas.length} áreas de desarrollo</div>
        <div class="flex items-center gap-1.5"><span class="w-6 h-6 rounded-md bg-emerald-100 text-emerald-600 flex items-center justify-center"><i data-lucide="check-circle-2" class="w-3.5 h-3.5"></i></span> ${nComp} competencias</div>
        <div class="flex items-center gap-1.5"><span class="w-6 h-6 rounded-md bg-indigo-100 text-indigo-600 flex items-center justify-center"><i data-lucide="calendar-range" class="w-3.5 h-3.5"></i></span> ${s.periods.length} períodos</div>
        <div class="flex items-center gap-1.5"><span class="w-6 h-6 rounded-md bg-amber-100 text-amber-600 flex items-center justify-center"><i data-lucide="folder" class="w-3.5 h-3.5"></i></span> ${s.modules.length} módulos</div>
        <div class="flex items-center gap-1.5"><span class="w-6 h-6 rounded-md bg-sky-100 text-sky-600 flex items-center justify-center"><i data-lucide="list-checks" class="w-3.5 h-3.5"></i></span> ${nAct} actividades</div>
        <div class="flex items-center gap-1.5"><span class="w-6 h-6 rounded-md bg-fuchsia-100 text-fuchsia-600 flex items-center justify-center"><i data-lucide="function-square" class="w-3.5 h-3.5"></i></span> Fórmula de evaluación</div>
      </div>`;
    if (window.lucide) lucide.createIcons();
  },

  async generateFromAI() {
    if (!this._current) return Helpers.toast('Primero crea una evaluación', 'warning');
    const level = document.getElementById('evalAILevel')?.value || 'Párvulos';
    const s = generateStructureFromLevel(level);
    if (!s) return Helpers.toast('No hay preset para ese nivel', 'error');
    if (!confirm(`¿Generar la estructura completa para el nivel «${level}» en «${this._current.name}»?\nSe crearán ${s.areas.length} áreas, ${s.modules.length} módulos y una fórmula.`)) return;
    const uid = await this._uid();
    SmartLoader.overlay('Generando estructura pedagógica...');
    try {
      // Áreas + competencias
      const areaIdMap = {};
      for (const area of s.areas) {
        const { data: areaRow, error: errA } = await supabase.from('eval_areas').insert({
          evaluation_id: this._current.id, name: area.name, description: area.description || null,
          color: area.color, icon: area.icon, sort_order: this._areas.length + Object.keys(areaIdMap).length, created_by: uid
        }).select().single();
        if (errA) throw errA;
        areaIdMap[area.name] = areaRow.id;
        for (const comp of (area.competencies || [])) {
          const { error: errC } = await supabase.from('eval_competencies').insert({
            area_id: areaRow.id, name: comp.name, code: comp.code || null, sort_order: 0, created_by: uid
          });
          if (errC) throw errC;
        }
      }
      // Períodos
      const periodIdMap = {};
      for (const [i, p] of s.periods.entries()) {
        const { data: pRow, error: errP } = await supabase.from('eval_periods').insert({
          evaluation_id: this._current.id, name: p.name, period_type: p.type || 'periodo',
          weight: 0, sort_order: i, created_by: uid
        }).select().single();
        if (errP) throw errP;
        periodIdMap[p.name] = pRow.id;
      }
      // Módulos + actividades (se asocian al primer período y primer área)
      const mainPeriodId = Object.values(periodIdMap)[0];
      const mainAreaId = Object.values(areaIdMap)[0];
      const numeric = level === 'Primaria';
      const modConfig = numeric ? { min: 0, max: 100, decimals: 2, allowDecimal: true } : { maxStars: 5 };
      const modType = numeric ? 'numeric' : 'stars';
      const moduleIdMap = {};
      for (const [i, m] of s.modules.entries()) {
        const { data: mRow, error: errM } = await supabase.from('eval_modules').insert({
          period_id: mainPeriodId, area_id: mainAreaId, competency_id: null, name: m.name,
          eval_type: modType, config: modConfig, weight: 0, sort_order: i, created_by: uid
        }).select().single();
        if (errM) throw errM;
        moduleIdMap[m.name] = mRow.id;
        for (const [j, act] of (m.activities || []).entries()) {
          const { error: errAct } = await supabase.from('eval_activities').insert({
            module_id: mRow.id, name: act, sort_order: j, created_by: uid
          });
          if (errAct) throw errAct;
        }
      }
      // Fórmula
      const parts = s.formula.map(f => {
        const ents = {
          period: periodIdMap[f.name], area: areaIdMap[f.name],
          module: moduleIdMap[f.name], competency: null
        };
        return { type: f.type, ref_id: ents[f.type] || null, name: f.name, percent: f.percent };
      });
      const { error: errF } = await supabase.from('eval_formulas').insert({
        evaluation_id: this._current.id, name: `Fórmula ${level}`, parts, total_percent: 100, is_template: false, created_by: uid
      });
      if (errF) throw errF;

      closeGlobalModal();
      await this._loadChildren();
      await this._renderBody();
      Helpers.toast(`Estructura «${level}» generada con éxito. Revisa y ajusta los módulos.`, 'success');
    } catch (err) {
      Helpers.toast(err?.message || 'Error al generar la estructura', 'error');
    } finally {
      SmartLoader.hide?.();
    }
  }
};
