/**
 * 🎓 Constructor de Evaluaciones — Panel de Maestra
 * La maestra puede crear/editar la estructura completa y calificar
 * a sus estudiantes por módulo/actividad según el tipo de evaluación.
 */
import { Helpers } from '../../shared/helpers.js';
import { supabase } from '../../shared/supabase.js';
import { Modal } from './ui.js';
import { BoletaUI } from '../../shared/boleta.module.js';
import {
  EDUCATIONAL_LEVELS, EVAL_TYPES, PERIOD_TYPES, SCALE_LEVELS,
  normalizeEvalConfig, gradeToLevel, gradingGridHtml, readGradingGrid,
  initEvalControls, buildScoresMap, formulaSum, computeFinalScore,
  generateStructureFromLevel
} from '../../shared/eval-utils.js';

function esc(s) { return Helpers.escapeHTML(String(s ?? '')); }

export const MaestraConstructor = {
  _userId: null,
  _classrooms: [],
  _classroomId: null,
  _students: [],
  _evaluations: [],
  _current: null,
  _years: [],
  _areas: [], _competencies: [], _periods: [], _modules: [], _activities: [], _formulas: [],
  _templates: [],
  _sel: { areaId: null, competencyId: null, periodId: null, moduleId: null },
  _tab: 'grade',
  _editing: null,
  _containerId: 't-constructor-inner',

  async init(opts = {}) {
    initEvalControls();
    this._containerId = typeof opts.container === 'string' ? opts.container : 't-constructor-inner';
    const container = document.getElementById(this._containerId);
    if (!container) return;
    container.innerHTML = `
      <div class="flex justify-center py-12">
        <div class="animate-spin w-8 h-8 border-2 border-[#FF7A00] rounded-full border-t-transparent"></div>
      </div>`;
    try {
      await this._loadClassrooms();
      await this._loadYears();
      await this._loadEvaluations();
      await this._loadTemplates();
      await this._loadStudents();
      if (this._current) await this._loadChildren();
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

  async _loadClassrooms() {
    const uid = await this._uid();
    const { data } = await supabase.from('classrooms').select('id, name, level')
      .eq('teacher_id', uid).is('deleted_at', null).order('name');
    this._classrooms = data || [];
    this._classroomId = this._classrooms[0]?.id || null;
  },

  async _loadYears() {
    const { data } = await supabase.from('school_years').select('id, name').order('start_date', { ascending: false });
    this._years = data || [];
  },

  async _loadEvaluations() {
    const { data } = await supabase.from('eval_evaluations').select('*').is('deleted_at', null).order('created_at');
    this._evaluations = data || [];
    this._current = this._evaluations[0] || null;
  },

  async _loadTemplates() {
    const { data } = await supabase.from('eval_formulas').select('*').is('deleted_at', null).eq('is_template', true);
    this._templates = data || [];
  },

  async _loadStudents() {
    if (!this._classroomId) { this._students = []; return; }
    const { data } = await supabase.from('students').select('id, name, matricula')
      .eq('classroom_id', this._classroomId).eq('is_active', true).is('deleted_at', null).order('name');
    this._students = data || [];
  },

  async _loadChildren() {
    if (!this._current) { this._areas = []; this._competencies = []; this._periods = []; this._modules = []; this._activities = []; this._formulas = []; return; }
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
  },

  /* ── RENDER ─────────────────────────────────────────────── */
  _render() {
    const container = document.getElementById(this._containerId);
    if (!container) return;
    if (!this._classrooms.length) {
      container.innerHTML = `
        <div class="bg-white rounded-3xl border-2 border-dashed border-orange-200 p-14 text-center">
          <div class="w-20 h-20 mx-auto bg-orange-50 text-orange-500 rounded-3xl flex items-center justify-center mb-4"><i data-lucide="school" class="w-10 h-10"></i></div>
          <h3 class="text-lg font-black text-slate-800">No tienes aulas asignadas</h3>
          <p class="text-slate-500 text-sm mt-1">El Constructor de Evaluaciones califica a los estudiantes de tus aulas.</p>
        </div>`;
      if (window.lucide) lucide.createIcons();
      return;
    }

    const evalOpts = this._evaluations.map(e =>
      `<option value="${e.id}" ${this._current?.id === e.id ? 'selected' : ''}>${esc(e.name)}${e.level ? ` — ${esc(e.level)}` : ''}</option>`
    ).join('');

    const classOpts = this._classrooms.map(c =>
      `<option value="${c.id}" ${this._classroomId === c.id ? 'selected' : ''}>${esc(c.name)}${c.level ? ` (${esc(c.level)})` : ''}</option>`
    ).join('');

    container.innerHTML = `
      <header class="mb-6">
        <h1 class="text-2xl md:text-3xl font-black text-slate-800 flex items-center gap-3">
          <span class="p-2 bg-gradient-to-br from-[#FF7A00] to-[#FFA500] text-white rounded-2xl shadow-lg"><i data-lucide="git-branch" class="w-6 h-6"></i></span>
          Constructor de Evaluaciones
        </h1>
        <p class="text-slate-500 font-medium mt-1">Califica por módulos y actividades, o ajusta la estructura de evaluación de tu centro.</p>
      </header>

      <div class="bg-white rounded-2xl shadow-md border border-slate-100 p-4 mb-5">
        <div class="flex flex-wrap items-center gap-3">
          <select id="mcClassroom" class="px-3 py-2 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-[#FF7A00] bg-white">
            ${classOpts}
          </select>
          <select id="mcEval" class="px-3 py-2 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-[#FF7A00] bg-white">
            ${evalOpts || '<option value="">Sin evaluaciones</option>'}
          </select>
          <div class="flex bg-slate-100 rounded-2xl p-1 ml-auto">
            <button id="mcTabGrade" class="px-4 py-1.5 rounded-xl text-xs font-black bg-[#FF7A00] text-white shadow-sm transition-all">Calificar</button>
            <button id="mcTabStructure" class="px-4 py-1.5 rounded-xl text-xs font-black text-slate-500 transition-all">Estructura</button>
            <button id="mcTabBoleta" class="px-4 py-1.5 rounded-xl text-xs font-black text-slate-500 transition-all">Boleta</button>
          </div>
        </div>
      </div>

      <div id="mcBody"></div>
    `;

    this._bindEvents();
    this._renderTab();
    if (window.lucide) lucide.createIcons();
  },

  _bindEvents() {
    document.getElementById('mcClassroom')?.addEventListener('change', async (e) => {
      this._classroomId = Number(e.target.value);
      await this._loadStudents();
      this._renderTab();
    });
    document.getElementById('mcEval')?.addEventListener('change', async (e) => {
      this._current = this._evaluations.find(x => x.id === Number(e.target.value)) || null;
      this._sel = { areaId: null, competencyId: null, periodId: null, moduleId: null };
      await this._loadChildren();
      this._renderTab();
    });
    document.getElementById('mcTabGrade')?.addEventListener('click', () => this._setTab('grade'));
    document.getElementById('mcTabStructure')?.addEventListener('click', () => this._setTab('structure'));
    document.getElementById('mcTabBoleta')?.addEventListener('click', () => this._setTab('boleta'));
  },

  _setTab(tab) {
    this._tab = tab;
    const map = { grade: ['mcTabGrade', 'bg-[#FF7A00] text-white shadow-sm'], structure: ['mcTabStructure', 'bg-[#FF7A00] text-white shadow-sm'], boleta: ['mcTabBoleta', 'bg-[#FF7A00] text-white shadow-sm'] };
    ['mcTabGrade', 'mcTabStructure', 'mcTabBoleta'].forEach(id => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.className = `px-4 py-1.5 rounded-xl text-xs font-black ${tab === id.replace('mcTab', '').toLowerCase() ? 'bg-[#FF7A00] text-white shadow-sm' : 'text-slate-500'} transition-all`;
    });
    this._renderTab();
  },

  _renderTab() {
    const body = document.getElementById('mcBody');
    if (!body) return;
    if (this._tab === 'grade') return this._renderGrade();
    if (this._tab === 'structure') return this._renderStructure();
    if (this._tab === 'boleta') return this._renderBoleta();
  },

  /* ── TAB CALIFICAR ──────────────────────────────────────── */
  _renderGrade() {
    const body = document.getElementById('mcBody');
    if (!body) return;
    if (!this._current) {
      body.innerHTML = `<div class="bg-white rounded-3xl border-2 border-dashed border-orange-200 p-14 text-center">
        <div class="w-16 h-16 mx-auto bg-orange-50 text-orange-500 rounded-3xl flex items-center justify-center mb-4"><i data-lucide="git-branch" class="w-8 h-8"></i></div>
        <h3 class="text-lg font-black text-slate-800">No hay evaluaciones</h3>
        <p class="text-slate-500 text-sm mt-1">Pide a la directora que cree una evaluación, o créala tú desde la pestaña Estructura.</p></div>`;
      if (window.lucide) lucide.createIcons();
      return;
    }
    const modules = this._modules;
    const selModule = this._modules.find(m => m.id === this._sel.moduleId) || modules[0];
    const moduleOpts = modules.map(m => `<option value="${m.id}" ${selModule?.id === m.id ? 'selected' : ''}>${esc(m.period?.name || '')} · ${esc(m.name)} (${esc(EVAL_TYPES[m.eval_type]?.label)})</option>`).join('');

    body.innerHTML = `
      <div class="bg-white rounded-2xl shadow-md border border-slate-100 p-5 mb-4">
        <div class="flex flex-wrap items-center gap-3">
          <div class="relative flex-1 min-w-[240px]">
            <i data-lucide="folder-search" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-orange-400"></i>
            <select id="mcModuleSel" class="w-full pl-9 pr-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-[#FF7A00] bg-white">
              ${moduleOpts || '<option value="">Sin módulos — créalos en Estructura</option>'}
            </select>
          </div>
          <div class="flex gap-2">
            <button id="mcRefreshGrades" class="px-3 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-xs font-black flex items-center gap-1.5 hover:bg-slate-200 transition-all"><i data-lucide="refresh-cw" class="w-4 h-4"></i> Recargar</button>
            <button onclick="MaestraConstructor.openBoletaModal()" class="px-3 py-2.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all" style="background:#F0FDF4;color:#1A8035;border:1.5px solid #BBF7D0"><i data-lucide="file-text" class="w-4 h-4"></i> Ver Boleta</button>
            <button id="mcSaveGrades" class="px-4 py-2.5 rounded-xl text-white text-xs font-black flex items-center gap-1.5 shadow-lg active:scale-95 transition-all" style="background:#FF7A00;box-shadow:0 4px 14px rgba(255,122,0,0.3);"><i data-lucide="save" class="w-4 h-4"></i> Guardar Todo</button>
          </div>
        </div>
        ${this._renderPeriodLockHint(selModule)}
      </div>
      <div id="mcGradeGrid" class="bg-white rounded-2xl shadow-md border border-slate-100 p-5"></div>
    `;
    document.getElementById('mcModuleSel')?.addEventListener('change', (e) => {
      this._sel.moduleId = Number(e.target.value);
      this._loadModuleGrades();
    });
    document.getElementById('mcRefreshGrades')?.addEventListener('click', () => this._loadModuleGrades());
    document.getElementById('mcSaveGrades')?.addEventListener('click', () => this._saveGrades());
    this._sel.moduleId = selModule?.id || null;
    this._loadModuleGrades();
  },

  _renderPeriodLockHint(module) {
    const period = this._periods.find(p => p.id === module?.period_id);
    if (period?.status === 'closed') {
      return `<div class="mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 text-xs font-bold flex items-center gap-2"><i data-lucide="lock" class="w-4 h-4"></i> El período «${esc(period.name)}» está cerrado.</div>`;
    }
    return `<div class="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-100 text-[11px] text-slate-400 flex items-center gap-2">
      <i data-lucide="info" class="w-4 h-4"></i> Califica a tus ${this._students.length} estudiantes. El promedio se calcula automáticamente por estudiante.
      ${module ? ` · ${this._activities.filter(a => a.module_id === module.id).length} actividades` : ''}</div>`;
  },

  async _loadModuleGrades() {
    const grid = document.getElementById('mcGradeGrid');
    const moduleId = this._sel.moduleId;
    if (!grid || !moduleId) return;
    const module = this._modules.find(m => m.id === moduleId);
    if (!module) { grid.innerHTML = '<div class="text-center py-10 text-slate-400 text-sm">Selecciona un módulo.</div>'; return; }
    const activities = this._activities.filter(a => a.module_id === moduleId);
    if (!activities.length) {
      grid.innerHTML = `<div class="text-center py-10 text-slate-400 text-sm">Este módulo no tiene actividades. Agrégalas en la pestaña <b>Estructura</b>.</div>`;
      return;
    }
    const { data: scores } = await supabase.from('eval_scores').select('*').in('activity_id', activities.map(a => a.id));
    this._scores = scores || [];
    const scoresMap = buildScoresMap(this._scores, activities);
    grid.innerHTML = `
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-black text-slate-700 flex items-center gap-2"><span class="w-2 h-5 bg-[#FF7A00] rounded-full"></span> ${esc(module.name)} <span class="px-2 py-0.5 rounded-md bg-orange-100 text-orange-700 text-[10px] font-black uppercase">${esc(EVAL_TYPES[module.eval_type]?.label)}</span></h3>
        <span class="text-[11px] text-slate-400">${activities.length} actividades</span>
      </div>
      ${gradingGridHtml(module, activities, this._students, scoresMap, { editable: true })}`;
  },

  async _saveGrades() {
    const grid = document.getElementById('mcGradeGrid');
    const moduleId = this._sel.moduleId;
    const module = this._modules.find(m => m.id === moduleId);
    if (!module || !grid) return;
    const activities = this._activities.filter(a => a.module_id === moduleId);
    const rows = readGradingGrid(grid, module, activities, this._students);
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
    await this._loadModuleGrades();
    Helpers.toast('Calificaciones guardadas', 'success');
  },

  /* ── TAB ESTRUCTURA ─────────────────────────────────────── */
  _renderStructure() {
    const body = document.getElementById('mcBody');
    if (!body) return;
    if (!this._current) {
      body.innerHTML = `<div class="bg-white rounded-3xl border-2 border-dashed border-orange-200 p-14 text-center">
        <div class="w-16 h-16 mx-auto bg-orange-50 text-orange-500 rounded-3xl flex items-center justify-center mb-4"><i data-lucide="git-branch" class="w-8 h-8"></i></div>
        <h3 class="text-lg font-black text-slate-800">No hay evaluaciones</h3>
        <div class="flex justify-center gap-3 mt-5 flex-wrap">
          <button onclick="MaestraConstructor.openEvalModal()" class="px-6 py-3 text-white rounded-2xl font-black text-sm" style="background:#FF7A00;">Nueva Evaluación</button>
          <button onclick="MaestraConstructor.openAIAssistant()" class="px-6 py-3 bg-orange-50 text-orange-700 rounded-2xl font-black text-sm">Asistente IA</button>
        </div></div>`;
      if (window.lucide) lucide.createIcons();
      return;
    }
    const sel = this._sel;
    const areas = this._areas;
    const comps = this._competencies.filter(c => c.area_id === sel.areaId);
    const periods = this._periods;
    const modules = this._modules.filter(m => m.period_id === sel.periodId);
    const acts = this._activities.filter(a => a.module_id === sel.moduleId);

    body.innerHTML = `
      <div class="flex flex-wrap items-center gap-2 mb-4 text-xs font-bold text-slate-500">
        <span class="px-2.5 py-1 rounded-lg bg-orange-100 text-orange-700">${esc(this._current.name)}</span>
        <div class="ml-auto flex gap-2">
          <button onclick="MaestraConstructor.openEvalModal()" class="px-3 py-1.5 rounded-lg text-white text-[11px] font-black flex items-center gap-1.5" style="background:#FF7A00;"><i data-lucide="plus" class="w-3.5 h-3.5"></i> Nueva Evaluación</button>
          <button onclick="MaestraConstructor.openAIAssistant()" class="px-3 py-1.5 rounded-lg bg-orange-50 text-orange-700 text-[11px] font-black flex items-center gap-1.5 hover:bg-orange-100"><i data-lucide="sparkles" class="w-3.5 h-3.5"></i> Asistente IA</button>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div class="bg-white rounded-2xl shadow-md border border-slate-100 p-4">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-black text-slate-700 flex items-center gap-2"><span class="w-2 h-5 bg-violet-500 rounded-full"></span> Áreas</h3>
            <button onclick="MaestraConstructor.openAreaModal()" class="px-2.5 py-1.5 rounded-lg bg-violet-600 text-white text-[11px] font-black">+ Nueva</button>
          </div>
          <div class="space-y-2 max-h-[380px] overflow-y-auto pr-1">
            ${areas.map(a => `
              <button onclick="MaestraConstructor.selectArea(${a.id})" class="w-full text-left px-3 py-2.5 rounded-xl border transition-all flex items-center gap-2 ${sel.areaId === a.id ? 'bg-violet-50 border-violet-300 ring-2 ring-violet-200' : 'bg-white border-slate-200 hover:border-violet-300'}">
                <span class="w-8 h-8 rounded-lg text-white flex items-center justify-center shrink-0" style="background:${a.color || '#7C3AED'}"><i data-lucide="${a.icon || 'heart'}" class="w-4 h-4"></i></span>
                <span class="flex-1 min-w-0"><span class="block font-bold text-slate-700 text-xs truncate">${esc(a.name)}</span></span>
                <span onclick="event.stopPropagation(); MaestraConstructor.openAreaModal(${a.id})" class="p-1 rounded-md bg-slate-100 text-slate-500 hover:bg-indigo-100"><i data-lucide="pencil" class="w-3 h-3"></i></span>
              </button>`).join('') || '<div class="text-center py-6 text-slate-400 text-xs">Sin áreas.</div>'}
          </div>
        </div>

        <div class="space-y-4">
          <div class="bg-white rounded-2xl shadow-md border border-slate-100 p-4">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-sm font-black text-slate-700 flex items-center gap-2"><span class="w-2 h-5 bg-emerald-500 rounded-full"></span> Competencias</h3>
              <button onclick="MaestraConstructor.openCompetencyModal()" class="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-black ${sel.areaId ? '' : 'opacity-40 cursor-not-allowed'}">+ Nueva</button>
            </div>
            <div class="space-y-1.5 max-h-[150px] overflow-y-auto pr-1">
              ${sel.areaId ? (comps.map(c => `
                <div class="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200">
                  <i data-lucide="check-circle-2" class="w-4 h-4 text-emerald-500 shrink-0"></i>
                  <span class="text-xs font-semibold text-slate-700 truncate flex-1">${c.code ? `<span class="text-slate-400 font-mono">${esc(c.code)}</span> ` : ''}${esc(c.name)}</span>
                  <span onclick="MaestraConstructor.openCompetencyModal(${c.id})" class="p-1 rounded-md bg-slate-100 text-slate-500 hover:bg-indigo-100"><i data-lucide="pencil" class="w-3 h-3"></i></span>
                </div>`).join('') || '<div class="text-center py-5 text-slate-400 text-xs">Sin competencias.</div>') : '<div class="text-center py-5 text-slate-400 text-xs">Selecciona un área.</div>'}
            </div>
          </div>

          <div class="bg-white rounded-2xl shadow-md border border-slate-100 p-4">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-sm font-black text-slate-700 flex items-center gap-2"><span class="w-2 h-5 bg-indigo-500 rounded-full"></span> Períodos</h3>
              <button onclick="MaestraConstructor.openPeriodModal()" class="px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white text-[11px] font-black">+ Nuevo</button>
            </div>
            <div class="space-y-2 max-h-[150px] overflow-y-auto pr-1">
              ${periods.map(p => `
                <button onclick="MaestraConstructor.selectPeriod(${p.id})" class="w-full text-left px-3 py-2 rounded-xl border transition-all flex items-center gap-2 ${sel.periodId === p.id ? 'bg-indigo-50 border-indigo-300 ring-2 ring-indigo-200' : 'bg-white border-slate-200 hover:border-indigo-300'}">
                  <i data-lucide="${PERIOD_TYPES[p.period_type]?.icon || 'calendar'}" class="w-4 h-4 ${sel.periodId === p.id ? 'text-indigo-600' : 'text-slate-400'}"></i>
                  <span class="flex-1 min-w-0"><span class="block font-bold text-slate-700 text-xs truncate">${esc(p.name)}</span><span class="block text-[10px] text-slate-400">${esc(PERIOD_TYPES[p.period_type]?.label || '')}</span></span>
                  <span onclick="event.stopPropagation(); MaestraConstructor.openPeriodModal(${p.id})" class="p-1 rounded-md bg-slate-100 text-slate-500 hover:bg-indigo-100"><i data-lucide="pencil" class="w-3 h-3"></i></span>
                </button>`).join('') || '<div class="text-center py-5 text-slate-400 text-xs">Sin períodos.</div>'}
            </div>
          </div>
        </div>

        <div class="space-y-4">
          <div class="bg-white rounded-2xl shadow-md border border-slate-100 p-4">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-sm font-black text-slate-700 flex items-center gap-2"><span class="w-2 h-5 bg-amber-500 rounded-full"></span> Módulos</h3>
              <button onclick="MaestraConstructor.openModuleModal()" class="px-2.5 py-1.5 rounded-lg bg-amber-500 text-white text-[11px] font-black ${sel.periodId ? '' : 'opacity-40 cursor-not-allowed'}">+ Nuevo</button>
            </div>
            <div class="space-y-2 max-h-[180px] overflow-y-auto pr-1">
              ${sel.periodId ? (modules.map(m => `
                <button onclick="MaestraConstructor.selectModule(${m.id})" class="w-full text-left px-3 py-2 rounded-xl border transition-all flex items-center gap-2 ${sel.moduleId === m.id ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-200' : 'bg-white border-slate-200 hover:border-amber-300'}">
                  <i data-lucide="${EVAL_TYPES[m.eval_type]?.icon || 'folder'}" class="w-4 h-4 ${sel.moduleId === m.id ? 'text-amber-600' : 'text-slate-400'}"></i>
                  <span class="flex-1 min-w-0"><span class="block font-bold text-slate-700 text-xs truncate">${esc(m.name)}</span><span class="block text-[10px] text-slate-400">${esc(EVAL_TYPES[m.eval_type]?.label)}</span></span>
                  <span onclick="event.stopPropagation(); MaestraConstructor.openModuleModal(${m.id})" class="p-1 rounded-md bg-slate-100 text-slate-500 hover:bg-indigo-100"><i data-lucide="pencil" class="w-3 h-3"></i></span>
                </button>`).join('') || '<div class="text-center py-5 text-slate-400 text-xs">Selecciona un período.</div>') : ''}
            </div>
          </div>

          <div class="bg-white rounded-2xl shadow-md border border-slate-100 p-4">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-sm font-black text-slate-700 flex items-center gap-2"><span class="w-2 h-5 bg-sky-500 rounded-full"></span> Actividades</h3>
              <button onclick="MaestraConstructor.openActivityModal()" class="px-2.5 py-1.5 rounded-lg bg-sky-600 text-white text-[11px] font-black ${sel.moduleId ? '' : 'opacity-40 cursor-not-allowed'}">+ Nueva</button>
            </div>
            <div class="space-y-1.5 max-h-[150px] overflow-y-auto pr-1">
              ${sel.moduleId ? (acts.map(a => `
                <div class="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200">
                  <i data-lucide="check" class="w-4 h-4 text-sky-400 shrink-0"></i>
                  <span class="text-xs font-semibold text-slate-700 truncate flex-1">${esc(a.name)}</span>
                  <span onclick="MaestraConstructor.openActivityModal(${a.id})" class="p-1 rounded-md bg-slate-100 text-slate-500 hover:bg-indigo-100"><i data-lucide="pencil" class="w-3 h-3"></i></span>
                </div>`).join('') || '<div class="text-center py-5 text-slate-400 text-xs">Selecciona un módulo.</div>') : ''}
            </div>
          </div>
        </div>
      </div>`;
    if (window.lucide) lucide.createIcons();
  },

  selectArea(id) { this._sel.areaId = id; this._renderStructure(); },
  selectPeriod(id) { this._sel.periodId = id; this._sel.moduleId = null; this._renderStructure(); },
  selectModule(id) { this._sel.moduleId = id; this._renderStructure(); },

  /* ── MODALES CRUD MAESTRA ───────────────────────────────── */
  openEvalModal() {
    const yearOpts = this._years.map(y => `<option value="${y.id}">${esc(y.name)}</option>`).join('');
    Modal.open('mc-modal', `
      <div class="bg-white">
        <div class="px-6 pt-6 pb-2 border-b border-slate-100">
          <h3 class="text-lg font-black text-slate-800">Nueva Evaluación</h3>
          <p class="text-xs text-slate-400 mt-0.5">Agrupa toda la estructura para un año y nivel.</p>
        </div>
        <div class="p-6 space-y-3">
          <div><label class="block text-xs font-black text-slate-600 uppercase mb-1">Nombre</label>
            <input id="mcEvalName" class="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-[#FF7A00]" value="Evaluación ${this._years[0]?.name || ''}"></div>
          <div><label class="block text-xs font-black text-slate-600 uppercase mb-1">Año Escolar</label>
            <select id="mcEvalYear" class="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-[#FF7A00]">${yearOpts}</select></div>
          <div><label class="block text-xs font-black text-slate-600 uppercase mb-1">Nivel Educativo</label>
            <select id="mcEvalLevel" class="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-[#FF7A00]">
              <option value="">Sin nivel</option>${EDUCATIONAL_LEVELS.map(l => `<option value="${l}">${l}</option>`).join('')}
            </select></div>
          <div><label class="block text-xs font-black text-slate-600 uppercase mb-1">Etiqueta de períodos</label>
            <select id="mcEvalLabel" class="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-[#FF7A00]">
              <option>Período Escolar</option><option>Unidad</option><option>Bimestre</option><option>Trimestre</option><option>Mes</option>
            </select></div>
          <button onclick="MaestraConstructor.saveEval()" class="w-full py-3 rounded-2xl text-white font-black text-sm" style="background:#FF7A00;">Guardar Evaluación</button>
        </div>
      </div>`);
  },

  async saveEval() {
    const name = document.getElementById('mcEvalName')?.value.trim();
    if (!name) return Helpers.toast('Ingresa el nombre', 'error');
    const { error } = await supabase.from('eval_evaluations').insert({
      name,
      school_year_id: Number(document.getElementById('mcEvalYear')?.value) || null,
      level: document.getElementById('mcEvalLevel')?.value || null,
      structure_label: document.getElementById('mcEvalLabel')?.value || 'Período Escolar',
      status: 'draft',
      created_by: await this._uid()
    });
    if (error) return Helpers.toast(error.message, 'error');
    Modal.close('mc-modal');
    await this._loadEvaluations();
    this._current = this._evaluations[this._evaluations.length - 1];
    await this._loadChildren();
    this._render();
    Helpers.toast('Evaluación creada', 'success');
  },

  openAreaModal(id = null) {
    const a = this._areas.find(x => x.id === id);
    const icons = ['heart', 'message-circle', 'calculator', 'activity', 'palette', 'leaf', 'star', 'book-open', 'globe', 'music', 'smile', 'shield-check'];
    const colors = ['#F43F5E', '#0EA5E9', '#6366F1', '#F97316', '#A855F7', '#22C55E', '#EAB308', '#10B981'];
    Modal.open('mc-modal', `
      <div class="bg-white">
        <div class="px-6 pt-6 pb-2 border-b border-slate-100">
          <h3 class="text-lg font-black text-slate-800">${a ? 'Editar' : 'Nueva'} Área de Desarrollo</h3>
        </div>
        <div class="p-6 space-y-3">
          <div><label class="block text-xs font-black text-slate-600 uppercase mb-1">Nombre</label>
            <input id="mcAreaName" class="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-[#FF7A00]" value="${esc(a?.name || '')}" placeholder="Desarrollo Socioemocional"></div>
          <div><label class="block text-xs font-black text-slate-600 uppercase mb-1">Descripción</label>
            <textarea id="mcAreaDesc" rows="2" class="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm outline-none focus:border-[#FF7A00]">${esc(a?.description || '')}</textarea></div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="block text-xs font-black text-slate-600 uppercase mb-1">Color</label>
              <select id="mcAreaColor" class="w-full px-2 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold">${colors.map(c => `<option value="${c}" ${(a?.color || '#F43F5E') === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
            <div><label class="block text-xs font-black text-slate-600 uppercase mb-1">Icono</label>
              <select id="mcAreaIcon" class="w-full px-2 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold">${icons.map(i => `<option value="${i}" ${(a?.icon || 'heart') === i ? 'selected' : ''}>${i}</option>`).join('')}</select></div>
          </div>
          <button onclick="MaestraConstructor.saveArea(${a?.id ?? ''})" class="w-full py-3 rounded-2xl bg-violet-600 text-white font-black text-sm hover:bg-violet-700">Guardar Área</button>
        </div>
      </div>`);
  },

  async saveArea(id = null) {
    const name = document.getElementById('mcAreaName')?.value.trim();
    if (!name) return Helpers.toast('Ingresa el nombre del área', 'error');
    const payload = {
      evaluation_id: this._current.id, name,
      description: document.getElementById('mcAreaDesc')?.value.trim() || null,
      color: document.getElementById('mcAreaColor')?.value || '#F43F5E',
      icon: document.getElementById('mcAreaIcon')?.value || 'heart',
      sort_order: this._areas.length, created_by: await this._uid()
    };
    const { error } = id ? await supabase.from('eval_areas').update(payload).eq('id', id) : await supabase.from('eval_areas').insert(payload);
    if (error) return Helpers.toast(error.message, 'error');
    Modal.close('mc-modal');
    await this._loadChildren();
    this._renderStructure();
    Helpers.toast(id ? 'Área actualizada' : 'Área creada', 'success');
  },

  openCompetencyModal(id = null) {
    const c = this._competencies.find(x => x.id === id);
    Modal.open('mc-modal', `
      <div class="bg-white">
        <div class="px-6 pt-6 pb-2 border-b border-slate-100">
          <h3 class="text-lg font-black text-slate-800">${c ? 'Editar' : 'Nueva'} Competencia</h3>
        </div>
        <div class="p-6 space-y-3">
          <div><label class="block text-xs font-black text-slate-600 uppercase mb-1">Nombre</label>
            <input id="mcCompName" class="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-emerald-500" value="${esc(c?.name || '')}" placeholder="Comparte con sus compañeros"></div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="block text-xs font-black text-slate-600 uppercase mb-1">Código</label>
              <input id="mcCompCode" class="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-mono outline-none focus:border-emerald-500" value="${esc(c?.code || '')}" placeholder="DS01"></div>
            <div><label class="block text-xs font-black text-slate-600 uppercase mb-1">Descripción</label></div>
          </div>
          <div><textarea id="mcCompDesc" rows="2" class="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm outline-none focus:border-emerald-500" placeholder="Participa respetando turnos y normas.">${esc(c?.description || '')}</textarea></div>
          <button onclick="MaestraConstructor.saveCompetency(${c?.id ?? ''})" class="w-full py-3 rounded-2xl bg-emerald-600 text-white font-black text-sm hover:bg-emerald-700">Guardar Competencia</button>
        </div>
      </div>`);
  },

  async saveCompetency(id = null) {
    const name = document.getElementById('mcCompName')?.value.trim();
    if (!name) return Helpers.toast('Ingresa el nombre de la competencia', 'error');
    const areaId = id ? this._competencies.find(x => x.id === id)?.area_id : this._sel.areaId;
    if (!areaId) return Helpers.toast('Selecciona un área primero', 'error');
    const payload = {
      area_id: areaId, name,
      code: document.getElementById('mcCompCode')?.value.trim() || null,
      description: document.getElementById('mcCompDesc')?.value.trim() || null,
      sort_order: this._competencies.filter(c => c.area_id === areaId).length, created_by: await this._uid()
    };
    const { error } = id ? await supabase.from('eval_competencies').update(payload).eq('id', id) : await supabase.from('eval_competencies').insert(payload);
    if (error) return Helpers.toast(error.message, 'error');
    Modal.close('mc-modal');
    await this._loadChildren();
    this._renderStructure();
    Helpers.toast(id ? 'Competencia actualizada' : 'Competencia creada', 'success');
  },

  openPeriodModal(id = null) {
    const p = this._periods.find(x => x.id === id);
    Modal.open('mc-modal', `
      <div class="bg-white">
        <div class="px-6 pt-6 pb-2 border-b border-slate-100">
          <h3 class="text-lg font-black text-slate-800">${p ? 'Editar' : 'Nuevo'} Período</h3>
          <p class="text-xs text-slate-400 mt-0.5">Período escolar, unidad, bimestre o mes — según el centro.</p>
        </div>
        <div class="p-6 space-y-3">
          <div><label class="block text-xs font-black text-slate-600 uppercase mb-1">Nombre</label>
            <input id="mcPeriodName" class="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-indigo-500" value="${esc(p?.name || '')}" placeholder="Primer período / Unidad 1"></div>
          <div><label class="block text-xs font-black text-slate-600 uppercase mb-1">Tipo</label>
            <select id="mcPeriodType" class="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-indigo-500">
              ${Object.entries(PERIOD_TYPES).map(([k, v]) => `<option value="${k}" ${(p?.period_type || 'periodo') === k ? 'selected' : ''}>${v.label}</option>`).join('')}
            </select></div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="block text-xs font-black text-slate-600 uppercase mb-1">Inicio</label><input id="mcPeriodStart" type="date" class="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm" value="${p?.start_date || ''}"></div>
            <div><label class="block text-xs font-black text-slate-600 uppercase mb-1">Fin</label><input id="mcPeriodEnd" type="date" class="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm" value="${p?.end_date || ''}"></div>
          </div>
          <div><label class="block text-xs font-black text-slate-600 uppercase mb-1">Peso en fórmula (%)</label>
            <input id="mcPeriodWeight" type="number" min="0" max="100" class="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold" value="${p?.weight || 0}"></div>
          <button onclick="MaestraConstructor.savePeriod(${p?.id ?? ''})" class="w-full py-3 rounded-2xl bg-indigo-600 text-white font-black text-sm hover:bg-indigo-700">Guardar Período</button>
        </div>
      </div>`);
  },

  async savePeriod(id = null) {
    const name = document.getElementById('mcPeriodName')?.value.trim();
    if (!name) return Helpers.toast('Ingresa el nombre del período', 'error');
    const payload = {
      evaluation_id: this._current.id, name,
      period_type: document.getElementById('mcPeriodType')?.value || 'periodo',
      start_date: document.getElementById('mcPeriodStart')?.value || null,
      end_date: document.getElementById('mcPeriodEnd')?.value || null,
      weight: Number(document.getElementById('mcPeriodWeight')?.value) || 0,
      sort_order: this._periods.length, created_by: await this._uid()
    };
    const { error } = id ? await supabase.from('eval_periods').update(payload).eq('id', id) : await supabase.from('eval_periods').insert(payload);
    if (error) return Helpers.toast(error.message, 'error');
    Modal.close('mc-modal');
    await this._loadChildren();
    this._renderStructure();
    Helpers.toast(id ? 'Período actualizado' : 'Período creado', 'success');
  },

  openModuleModal(id = null) {
    const m = this._modules.find(x => x.id === id);
    const period = this._periods.find(p => p.id === (m?.period_id || this._sel.periodId));
    const area = this._areas.find(a => a.id === (m?.area_id || this._sel.areaId));
    const compOpts = this._competencies.filter(c => c.area_id === area?.id).map(c => `<option value="${c.id}" ${m?.competency_id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
    Modal.open('mc-modal', `
      <div class="bg-white">
        <div class="px-6 pt-6 pb-2 border-b border-slate-100">
          <h3 class="text-lg font-black text-slate-800">${m ? 'Editar' : 'Nuevo'} Módulo</h3>
          ${m ? '' : `<p class="text-xs text-slate-400 mt-0.5">Período: <b>${esc(period?.name || '—')}</b> · Área: <b>${esc(area?.name || '—')}</b></p>`}
        </div>
        <div class="p-6 space-y-3">
          <div><label class="block text-xs font-black text-slate-600 uppercase mb-1">Nombre</label>
            <input id="mcModuleName" class="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500" value="${esc(m?.name || '')}" placeholder="Autonomía"></div>
          <div><label class="block text-xs font-black text-slate-600 uppercase mb-1">Competencia (opcional)</label>
            <select id="mcModuleComp" class="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500"><option value="">Sin competencia</option>${compOpts}</select></div>
          <div><label class="block text-xs font-black text-slate-600 uppercase mb-1">Tipo de Evaluación</label>
            <select id="mcModuleType" onchange="MaestraConstructor.renderModuleConfig()" class="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500">
              ${Object.entries(EVAL_TYPES).map(([k, v]) => `<option value="${k}" ${(m?.eval_type || 'numeric') === k ? 'selected' : ''}>${v.label}</option>`).join('')}
            </select></div>
          <div id="mcModuleConfigWrap"></div>
          <div><label class="block text-xs font-black text-slate-600 uppercase mb-1">Peso en fórmula (%)</label>
            <input id="mcModuleWeight" type="number" min="0" max="100" class="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold" value="${m?.weight || 0}"></div>
          <button onclick="MaestraConstructor.saveModule(${m?.id ?? ''})" class="w-full py-3 rounded-2xl bg-amber-500 text-white font-black text-sm hover:bg-amber-600">Guardar Módulo</button>
        </div>
      </div>`);
    this._editingModule = m || null;
    this.renderModuleConfig();
  },

  renderModuleConfig() {
    const wrap = document.getElementById('mcModuleConfigWrap');
    if (!wrap) return;
    const type = document.getElementById('mcModuleType')?.value || 'numeric';
    const cfg = normalizeEvalConfig(type, this._editingModule?.config);
    if (type === 'numeric') {
      wrap.innerHTML = `<div class="grid grid-cols-3 gap-2">
        <div><label class="block text-[10px] font-black text-slate-500 uppercase mb-1">Mín</label><input id="mcCfgMin" type="number" class="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm font-bold" value="${cfg.min}"></div>
        <div><label class="block text-[10px] font-black text-slate-500 uppercase mb-1">Máx</label><input id="mcCfgMax" type="number" class="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm font-bold" value="${cfg.max}"></div>
        <div><label class="block text-[10px] font-black text-slate-500 uppercase mb-1">Dec.</label><input id="mcCfgDec" type="number" min="0" max="4" class="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm font-bold" value="${cfg.decimals}"></div>
      </div>`;
    } else if (type === 'stars') {
      wrap.innerHTML = `<div class="p-3 rounded-xl bg-slate-50 border border-slate-200">
        <label class="block text-[10px] font-black text-slate-500 uppercase mb-1">Máximo de estrellas</label>
        <select id="mcCfgStars" class="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm font-bold">${[3, 4, 5].map(n => `<option value="${n}" ${cfg.maxStars === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>`;
    } else if (type === 'scale') {
      wrap.innerHTML = `<div class="p-3 rounded-xl bg-slate-50 border border-slate-200">
        <label class="block text-[10px] font-black text-slate-500 uppercase mb-1">Niveles (valor:etiqueta:mín:máx)</label>
        <textarea id="mcCfgScale" rows="4" class="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm font-mono">${(cfg.levels || SCALE_LEVELS).map(l => `${l.value}:${l.label}:${l.min}:${l.max}`).join('\n')}</textarea></div>`;
    } else if (type === 'checklist') {
      wrap.innerHTML = `<div class="p-3 rounded-xl bg-slate-50 border border-slate-200">
        <label class="block text-[10px] font-black text-slate-500 uppercase mb-1">Ítems (uno por línea)</label>
        <textarea id="mcCfgChecklist" rows="3" class="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm">${(cfg.items || []).join('\n')}</textarea></div>`;
    } else if (type === 'rubric') {
      wrap.innerHTML = `<div class="p-3 rounded-xl bg-slate-50 border border-slate-200">
        <label class="block text-[10px] font-black text-slate-500 uppercase mb-1">Criterio|Opc1:v,Opc2:v,...</label>
        <textarea id="mcCfgRubric" rows="3" class="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm font-mono">${(cfg.criteria || []).map(c => `${c.name}|${(c.options || []).map(o => `${o.label}:${o.value}`).join(',')}`).join('\n')}</textarea></div>`;
    } else wrap.innerHTML = '';
  },

  _readModuleConfig(type) {
    if (type === 'numeric') {
      const decimals = Number(document.getElementById('mcCfgDec')?.value) || 0;
      return { min: Number(document.getElementById('mcCfgMin')?.value) || 0, max: Number(document.getElementById('mcCfgMax')?.value) || 100, decimals, allowDecimal: decimals > 0 };
    }
    if (type === 'stars') return { maxStars: Number(document.getElementById('mcCfgStars')?.value) || 5 };
    if (type === 'scale') return { levels: (document.getElementById('mcCfgScale')?.value || '').split('\n').map(s => s.trim()).filter(Boolean).map(l => { const [value, label, min, max] = l.split(':'); return { value: (value || 'nivel').trim(), label: (label || value).trim(), min: Number(min) || 0, max: Number(max) || 100 }; }) };
    if (type === 'checklist') return { items: (document.getElementById('mcCfgChecklist')?.value || '').split('\n').map(s => s.trim()).filter(Boolean) };
    if (type === 'rubric') return { criteria: (document.getElementById('mcCfgRubric')?.value || '').split('\n').map(s => s.trim()).filter(Boolean).map(l => { const [name, optsStr] = l.split('|'); return { name: (name || '').trim(), options: (optsStr || '').split(',').filter(Boolean).map(o => { const [label, value] = o.split(':'); return { label: (label || '').trim(), value: Number(value) || 0 }; }) }; }) };
    return {};
  },

  async saveModule(id = null) {
    const name = document.getElementById('mcModuleName')?.value.trim();
    if (!name) return Helpers.toast('Ingresa el nombre del módulo', 'error');
    const type = document.getElementById('mcModuleType')?.value || 'numeric';
    const periodId = id ? this._modules.find(x => x.id === id)?.period_id : this._sel.periodId;
    const areaId = id ? this._modules.find(x => x.id === id)?.area_id : this._sel.areaId;
    if (!periodId) return Helpers.toast('Selecciona un período', 'error');
    if (!areaId) return Helpers.toast('Selecciona un área', 'error');
    const payload = {
      period_id: periodId, area_id: areaId,
      competency_id: Number(document.getElementById('mcModuleComp')?.value) || null,
      name, eval_type: type, config: this._readModuleConfig(type),
      weight: Number(document.getElementById('mcModuleWeight')?.value) || 0,
      sort_order: this._modules.filter(x => x.period_id === periodId).length, created_by: await this._uid()
    };
    const { error } = id ? await supabase.from('eval_modules').update(payload).eq('id', id) : await supabase.from('eval_modules').insert(payload);
    if (error) return Helpers.toast(error.message, 'error');
    Modal.close('mc-modal');
    this._editingModule = null;
    await this._loadChildren();
    this._renderStructure();
    Helpers.toast(id ? 'Módulo actualizado' : 'Módulo creado', 'success');
  },

  openActivityModal(id = null) {
    const a = this._activities.find(x => x.id === id);
    Modal.open('mc-modal', `
      <div class="bg-white">
        <div class="px-6 pt-6 pb-2 border-b border-slate-100">
          <h3 class="text-lg font-black text-slate-800">${a ? 'Editar' : 'Nueva'} Actividad</h3>
        </div>
        <div class="p-6 space-y-3">
          <div><label class="block text-xs font-black text-slate-600 uppercase mb-1">Nombre</label>
            <input id="mcActName" class="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-sky-500" value="${esc(a?.name || '')}" placeholder="Se pone los zapatos"></div>
          <div><label class="block text-xs font-black text-slate-600 uppercase mb-1">Descripción</label>
            <textarea id="mcActDesc" rows="2" class="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm outline-none focus:border-sky-500">${esc(a?.description || '')}</textarea></div>
          <button onclick="MaestraConstructor.saveActivity(${a?.id ?? ''})" class="w-full py-3 rounded-2xl bg-sky-600 text-white font-black text-sm hover:bg-sky-700">Guardar Actividad</button>
        </div>
      </div>`);
  },

  async saveActivity(id = null) {
    const name = document.getElementById('mcActName')?.value.trim();
    if (!name) return Helpers.toast('Ingresa el nombre de la actividad', 'error');
    const moduleId = id ? this._activities.find(x => x.id === id)?.module_id : this._sel.moduleId;
    if (!moduleId) return Helpers.toast('Selecciona un módulo primero', 'error');
    const payload = { module_id: moduleId, name, description: document.getElementById('mcActDesc')?.value.trim() || null, sort_order: this._activities.filter(x => x.module_id === moduleId).length, created_by: await this._uid() };
    const { error } = id ? await supabase.from('eval_activities').update(payload).eq('id', id) : await supabase.from('eval_activities').insert(payload);
    if (error) return Helpers.toast(error.message, 'error');
    Modal.close('mc-modal');
    await this._loadChildren();
    this._renderStructure();
    Helpers.toast(id ? 'Actividad actualizada' : 'Actividad creada', 'success');
  },

  /* ── TAB BOLETA (Boleta en Vivo) ────────────────────────── */
  openBoletaModal() {
    if (!this._current) return Helpers.toast('Primero selecciona una evaluación', 'warning');
    Modal.open('mc-boleta-modal', `
      <div class="bg-white flex flex-col max-h-[92vh]">
        <div class="px-6 pt-6 pb-3 border-b border-slate-100 flex items-center gap-3">
          <span class="p-2 rounded-xl text-white" style="background:linear-gradient(135deg,#FF7A00,#FFA500)"><i data-lucide="file-text" class="w-5 h-5"></i></span>
          <div class="flex-1 min-w-0">
            <h3 class="text-lg font-black text-slate-800">Boleta de Calificaciones</h3>
            <p class="text-xs text-slate-400">Forma y estructura de la boleta · ${esc(this._current.name)}</p>
          </div>
          <button onclick="Modal.close('mc-boleta-modal')" class="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <i data-lucide="x" class="w-6 h-6 text-slate-400"></i>
          </button>
        </div>
        <div id="mcBoletaModalBody" class="p-6 overflow-y-auto flex-1">
          <div class="flex justify-center py-14">
            <div class="animate-spin w-8 h-8 border-2 border-[#FF7A00] rounded-full border-t-transparent"></div>
          </div>
        </div>
      </div>`);
    const inner = document.getElementById('mc-boleta-modal-inner');
    if (inner) inner.style.maxWidth = '1100px';
    if (window.lucide) lucide.createIcons();
    BoletaUI.init({
      container: document.getElementById('mcBoletaModalBody'),
      evaluationId: this._current.id,
      classroomId: this._classroomId
    });
  },

  async _renderBoleta() {
    const body = document.getElementById('mcBody');
    if (!body) return;
    if (!this._current) {
      body.innerHTML = `<div class="bg-white rounded-3xl border-2 border-dashed border-orange-200 p-14 text-center">
        <div class="w-16 h-16 mx-auto bg-orange-50 text-orange-500 rounded-3xl flex items-center justify-center mb-4"><i data-lucide="file-text" class="w-8 h-8"></i></div>
        <h3 class="text-lg font-black text-slate-800">No hay evaluaciones</h3>
        <p class="text-slate-500 text-sm mt-1">Crea una evaluación desde la pestaña Estructura, o pide a la directora que la cree.</p></div>`;
      if (window.lucide) lucide.createIcons();
      return;
    }
    if (!this._periods.length) {
      body.innerHTML = `<div class="bg-white rounded-3xl border-2 border-dashed border-orange-200 p-14 text-center">
        <div class="w-16 h-16 mx-auto bg-orange-50 text-orange-500 rounded-3xl flex items-center justify-center mb-4"><i data-lucide="calendar-range" class="w-8 h-8"></i></div>
        <h3 class="text-lg font-black text-slate-800">La evaluación no tiene períodos</h3>
        <p class="text-slate-500 text-sm mt-1">Agrega períodos desde la pestaña Estructura para generar la boleta en vivo 5×5.</p></div>`;
      if (window.lucide) lucide.createIcons();
      return;
    }
    body.innerHTML = `<div id="mcBoletaVivo"></div>`;
    await BoletaUI.init({
      container: document.getElementById('mcBoletaVivo'),
      evaluationId: this._current.id,
      classroomId: this._classroomId
    });
  },

  /* ── ASISTENTE IA ───────────────────────────────────────── */
  openAIAssistant() {
    Modal.open('mc-modal', `
      <div class="bg-white">
        <div class="px-6 pt-6 pb-2 border-b border-slate-100">
          <h3 class="text-lg font-black text-slate-800 flex items-center gap-2">
            <span class="p-1.5 rounded-xl bg-gradient-to-br from-[#FF7A00] to-[#FFA500] text-white"><i data-lucide="sparkles" class="w-5 h-5"></i></span>
            Asistente IA Pedagógico
          </h3>
          <p class="text-xs text-slate-400 mt-0.5">Genera la estructura completa para tu nivel. Tú solo revisas y guardas.</p>
        </div>
        <div class="p-6 space-y-3">
          <div><label class="block text-xs font-black text-slate-600 uppercase mb-1">¿Qué nivel educativo estás evaluando?</label>
            <select id="mcAILevel" onchange="MaestraConstructor.updateAIPreview()" class="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-[#FF7A00]">
              ${EDUCATIONAL_LEVELS.map(l => `<option value="${l}">${l}</option>`).join('')}
            </select></div>
          <div id="mcAIPreview" class="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600"></div>
          <button onclick="MaestraConstructor.generateFromAI()" class="w-full py-3 rounded-2xl text-white font-black text-sm flex items-center justify-center gap-2" style="background:linear-gradient(90deg,#FF7A00,#FFA500);">Generar estructura completa</button>
        </div>
      </div>`);
    this.updateAIPreview();
  },

  updateAIPreview() {
    const level = document.getElementById('mcAILevel')?.value || 'Párvulos';
    const el = document.getElementById('mcAIPreview');
    if (!el) return;
    const s = generateStructureFromLevel(level);
    if (!s) { el.innerHTML = 'Sin preset.'; return; }
    const nComp = s.areas.reduce((a, x) => a + (x.competencies?.length || 0), 0);
    const nAct = s.modules.reduce((a, m) => a + (m.activities?.length || 0), 0);
    el.innerHTML = `<b>${esc(level)}</b>: ${s.areas.length} áreas · ${nComp} competencias · ${s.periods.length} períodos · ${s.modules.length} módulos · ${nAct} actividades + fórmula.`;
  },

  async generateFromAI() {
    const level = document.getElementById('mcAILevel')?.value || 'Párvulos';
    const s = generateStructureFromLevel(level);
    if (!s) return Helpers.toast('Sin preset para ese nivel', 'error');
    if (!this._current) {
      if (!confirm('No hay una evaluación activa. Se creará una automáticamente. ¿Continuar?')) return;
      const { data: ev, error: errEv } = await supabase.from('eval_evaluations').insert({
        name: `Evaluación ${this._years[0]?.name || new Date().getFullYear()}`, school_year_id: this._years[0]?.id || null,
        level, status: 'draft', created_by: await this._uid()
      }).select().single();
      if (errEv) return Helpers.toast(errEv.message, 'error');
      await this._loadEvaluations();
      this._current = this._evaluations.find(e => e.id === ev.id) || this._evaluations[0];
    }
    if (!confirm(`¿Generar la estructura «${level}» en «${this._current.name}»?`)) return;
    const uid = await this._uid();
    try {
      const areaIdMap = {};
      for (const area of s.areas) {
        const { data: areaRow, error: errA } = await supabase.from('eval_areas').insert({ evaluation_id: this._current.id, name: area.name, description: area.description || null, color: area.color, icon: area.icon, sort_order: this._areas.length + Object.keys(areaIdMap).length, created_by: uid }).select().single();
        if (errA) throw errA;
        areaIdMap[area.name] = areaRow.id;
        for (const comp of (area.competencies || [])) {
          const { error: errC } = await supabase.from('eval_competencies').insert({ area_id: areaRow.id, name: comp.name, code: comp.code || null, created_by: uid });
          if (errC) throw errC;
        }
      }
      const periodIdMap = {};
      for (const [i, p] of s.periods.entries()) {
        const { data: pRow, error: errP } = await supabase.from('eval_periods').insert({ evaluation_id: this._current.id, name: p.name, period_type: p.type || 'periodo', weight: 0, sort_order: i, created_by: uid }).select().single();
        if (errP) throw errP;
        periodIdMap[p.name] = pRow.id;
      }
      const mainPeriodId = Object.values(periodIdMap)[0];
      const mainAreaId = Object.values(areaIdMap)[0];
      const numeric = level === 'Primaria';
      const modConfig = numeric ? { min: 0, max: 100, decimals: 2, allowDecimal: true } : { maxStars: 5 };
      const modType = numeric ? 'numeric' : 'stars';
      const moduleIdMap = {};
      for (const [i, m] of s.modules.entries()) {
        const { data: mRow, error: errM } = await supabase.from('eval_modules').insert({ period_id: mainPeriodId, area_id: mainAreaId, competency_id: null, name: m.name, eval_type: modType, config: modConfig, weight: 0, sort_order: i, created_by: uid }).select().single();
        if (errM) throw errM;
        moduleIdMap[m.name] = mRow.id;
        for (const [j, act] of (m.activities || []).entries()) {
          const { error: errAct } = await supabase.from('eval_activities').insert({ module_id: mRow.id, name: act, sort_order: j, created_by: uid });
          if (errAct) throw errAct;
        }
      }
      const parts = s.formula.map(f => {
        const refs = { period: periodIdMap[f.name], area: areaIdMap[f.name], module: moduleIdMap[f.name] };
        return { type: f.type, ref_id: refs[f.type] || null, name: f.name, percent: f.percent };
      });
      const { error: errF } = await supabase.from('eval_formulas').insert({ evaluation_id: this._current.id, name: `Fórmula ${level}`, parts, total_percent: 100, is_template: false, created_by: uid });
      if (errF) throw errF;
      Modal.close('mc-modal');
      await this._loadChildren();
      this._render();
      Helpers.toast(`Estructura «${level}» generada. Ya puedes calificar.`, 'success');
    } catch (err) {
      Helpers.toast(err?.message || 'Error al generar', 'error');
    }
  }
};

window.MaestraConstructor = MaestraConstructor;
