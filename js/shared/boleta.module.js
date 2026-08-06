/**
 * 🧾 Boleta en Vivo — editor y generador de boletas de calificaciones.
 *
 * - Auto-genera la estructura 5 áreas × 5 módulos por período (configurable
 *   en eval_evaluations.default_areas / default_modules) si falta.
 * - Edición en vivo por estudiante + período con guardado automático.
 * - Notas del docente (fortalezas / debilidades / comentario) por estudiante.
 * - Impresión por estudiante o por aula (A4).
 *
 * Uso:
 *   import { BoletaUI } from '../shared/boleta.module.js';
 *   await BoletaUI.init({ container, evaluationId, classroomId, onClose });
 */
import { Helpers } from './helpers.js';
import { supabase } from './supabase.js';
import {
  DEFAULT_AREAS, DEFAULT_ACTIVITIES_PER_MODULE,
  renderEvalInput, readEvalInputs, initEvalControls,
  buildScoresMap, buildBoletaData, moduleAvg, avgOf, gradeColor, gradeToLevel
} from './eval-utils.js';

function esc(s) { return Helpers.escapeHTML(String(s ?? '')); }
function nf(n, d = 1) { return n != null ? n.toFixed(d) : '—'; }

export const BoletaUI = {
  S: null,
  _saveTimers: {},

  async init(opts) {
    this.S = {
      container: typeof opts.container === 'string' ? document.getElementById(opts.container) : opts.container,
      evaluationId: opts.evaluationId,
      classroomId: opts.classroomId,
      onClose: opts.onClose || null,
      evaluation: null,
      classroom: null,
      school: { school_name: 'Colegio Montessori Sonrisas Creativas', logo_url: null },
      students: [],
      periods: [],
      areas: [],
      modules: [],
      activities: [],
      scoresMap: {},
      notes: {},
      uid: null,
      selPeriodId: null,
      selStudentId: null
    };
    const c = this.S.container;
    if (!c) return;
    initEvalControls();
    c.innerHTML = `<div class="flex justify-center py-14">
      <div class="animate-spin w-8 h-8 border-2 border-[#FF7A00] rounded-full border-t-transparent"></div>
    </div>`;
    try {
      await this._load();
      await this._ensureStructure();
      await this._loadChildren();
      await this._loadScores();
      await this._loadNotes();
      if (!this.S.students.length) {
        c.innerHTML = `<div class="text-center py-12 text-slate-400 text-sm">No hay estudiantes activos en esta aula.</div>`;
        return;
      }
      this.S.selStudentId = this.S.students[0].id;
      this.S.selPeriodId = this.S.periods[0]?.id || null;
      if (!this.S.selPeriodId) {
        c.innerHTML = `<div class="text-center py-12 text-slate-400 text-sm">Esta evaluación no tiene períodos. Crea períodos desde Estructura.</div>`;
        return;
      }
      this._render();
    } catch (err) {
      console.error('[BoletaUI]', err);
      c.innerHTML = Helpers.errorState('Error al cargar la Boleta en Vivo');
    }
  },

  async _uid() {
    if (this.S.uid) return this.S.uid;
    try {
      const { data } = await supabase.auth.getUser();
      this.S.uid = data?.user?.id || null;
    } catch (_) { this.S.uid = null; }
    return this.S.uid;
  },

  async _load() {
    const S = this.S;
    const [evalRes, classRes, studRes, schoolRes] = await Promise.all([
      supabase.from('eval_evaluations').select('*').eq('id', S.evaluationId).maybeSingle(),
      supabase.from('classrooms').select('*').eq('id', S.classroomId).maybeSingle(),
      supabase.from('students').select('id, name, matricula').eq('classroom_id', S.classroomId).eq('is_active', true).is('deleted_at', null).order('name'),
      supabase.from('school_settings').select('school_name, logo_url').eq('id', 1).maybeSingle()
    ]);
    S.evaluation = evalRes.data || { name: 'Evaluación' };
    S.classroom = classRes.data || null;
    S.students = studRes.data || [];
    S.school = {
      school_name: schoolRes.data?.school_name || 'Colegio Montessori Sonrisas Creativas',
      logo_url: schoolRes.data?.logo_url || null
    };
    const [perRes, areaRes] = await Promise.all([
      supabase.from('eval_periods').select('*').eq('evaluation_id', S.evaluationId).is('deleted_at', null).order('sort_order').order('created_at'),
      supabase.from('eval_areas').select('*').eq('evaluation_id', S.evaluationId).is('deleted_at', null).order('sort_order').order('created_at')
    ]);
    S.periods = perRes.data || [];
    S.areas = areaRes.data || [];
  },

  async _loadChildren() {
    const S = this.S;
    const periodIds = S.periods.map(p => p.id);
    const { data: mods } = periodIds.length
      ? await supabase.from('eval_modules').select('*').in('period_id', periodIds).is('deleted_at', null).order('sort_order').order('created_at')
      : { data: [] };
    S.modules = mods || [];
    const moduleIds = S.modules.map(m => m.id);
    const { data: acts } = moduleIds.length
      ? await supabase.from('eval_activities').select('*').in('module_id', moduleIds).is('deleted_at', null).order('sort_order').order('created_at')
      : { data: [] };
    S.activities = acts || [];
  },

  async _loadScores() {
    const S = this.S;
    const actIds = S.activities.map(a => a.id);
    const { data: scores } = actIds.length
      ? await supabase.from('eval_scores').select('*').in('activity_id', actIds)
      : { data: [] };
    S.scoresMap = buildScoresMap(scores || [], S.activities);
  },

  async _loadNotes() {
    const S = this.S;
    const stIds = S.students.map(s => s.id);
    const { data } = stIds.length
      ? await supabase.from('eval_boleta_notes').select('*').in('student_id', stIds)
      : { data: [] };
    const map = {};
    (data || []).forEach(n => { map[`${n.student_id}:${n.period_id}`] = n; });
    S.notes = map;
  },

  /**
   * Garantiza la estructura 5×5 de la boleta (áreas y módulos con actividades).
   */
  async _ensureStructure() {
    const S = this.S;
    if (!S.evaluationId) return;
    const evalRes = await supabase.from('eval_evaluations').select('default_areas, default_modules').eq('id', S.evaluationId).maybeSingle();
    const areasCount = evalRes.data?.default_areas ?? 5;
    const modulesCount = evalRes.data?.default_modules ?? 5;
    const uid = await this._uid();

    let changed = false;

    if (S.areas.length < areasCount) {
      const batch = [];
      for (let i = S.areas.length; i < areasCount; i++) {
        const p = DEFAULT_AREAS[i] || { name: `Área ${i + 1}`, icon: 'heart', color: '#6366F1' };
        batch.push({ evaluation_id: S.evaluationId, name: p.name, description: null, color: p.color, icon: p.icon, sort_order: i, created_by: uid });
      }
      const { data, error } = await supabase.from('eval_areas').insert(batch).select('*');
      if (error) throw error;
      S.areas = [...S.areas, ...(data || [])];
      changed = true;
    }

    // Módulos actuales (por si otra ventana creó alguno)
    const periodIds = S.periods.map(p => p.id);
    const { data: existingMods } = periodIds.length
      ? await supabase.from('eval_modules').select('*').in('period_id', periodIds).is('deleted_at', null).order('sort_order').order('created_at')
      : { data: [] };
    S.modules = existingMods || [];

    for (const period of S.periods) {
      for (const area of S.areas) {
        const mods = S.modules.filter(m => m.period_id === period.id && m.area_id === area.id);
        if (mods.length >= modulesCount) continue;
        const batch = [];
        for (let i = mods.length; i < modulesCount; i++) {
          batch.push({
            period_id: period.id, area_id: area.id, competency_id: null,
            name: `Módulo ${i + 1}`, description: `Módulo ${i + 1} · ${area.name}`,
            eval_type: 'numeric', config: { min: 0, max: 100, decimals: 0, allowDecimal: true },
            weight: 0, sort_order: i, created_by: uid
          });
        }
        const { data, error } = await supabase.from('eval_modules').insert(batch).select('*');
        if (error) throw error;
        for (const m of (data || [])) {
          const acts = [];
          for (let j = 0; j < DEFAULT_ACTIVITIES_PER_MODULE; j++) {
            acts.push({ module_id: m.id, name: `Actividad ${j + 1}`, sort_order: j, created_by: uid });
          }
          const { error: errA } = await supabase.from('eval_activities').insert(acts);
          if (errA) throw errA;
        }
        changed = true;
      }
    }

    return changed;
  },

  /* ── RENDER ─────────────────────────────────────────────── */
  _render() {
    const c = this.S.container;
    const S = this.S;
    const periodChips = S.periods.map(p =>
      `<button data-blv-period="${p.id}" class="blv-period-chip px-3.5 py-1.5 rounded-xl text-xs font-black transition-all ${p.id === S.selPeriodId ? 'bg-[#FF7A00] text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}">${esc(p.name)}${p.status === 'closed' ? ' 🔒' : ''}</button>`
    ).join('');
    const studentOpts = S.students.map(st =>
      `<option value="${st.id}" ${st.id === S.selStudentId ? 'selected' : ''}>${esc(st.name)}</option>`
    ).join('');

    c.innerHTML = `
      <div class="bg-white rounded-2xl shadow-md border border-slate-100 p-4 md:p-5">
        <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 class="text-base font-black text-slate-800 flex items-center gap-2">
              <span class="p-1.5 rounded-xl text-white" style="background:linear-gradient(135deg,#FF7A00,#FFA500)"><i data-lucide="file-text" class="w-4 h-4"></i></span>
              Boleta en Vivo
            </h3>
            <p class="text-[11px] text-slate-400 mt-0.5">${esc(S.evaluation.name)} · ${esc(S.classroom?.name || '')} ${S.classroom?.level ? `· ${esc(S.classroom.level)}` : ''}</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button id="blvPrintStudent" class="px-3 py-2 rounded-xl bg-orange-50 text-orange-700 text-xs font-black flex items-center gap-1.5 hover:bg-orange-100 transition-all"><i data-lucide="printer" class="w-3.5 h-3.5"></i> Imprimir estudiante</button>
            <button id="blvPrintClass" class="px-3 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-black flex items-center gap-1.5 hover:bg-slate-200 transition-all"><i data-lucide="files" class="w-3.5 h-3.5"></i> Imprimir aula</button>
            <button id="blvPdfStudent" class="px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-black flex items-center gap-1.5 hover:bg-emerald-100 transition-all"><i data-lucide="file-down" class="w-3.5 h-3.5"></i> PDF estudiante</button>
            <button id="blvPdfClass" class="px-3 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-black flex items-center gap-1.5 hover:bg-slate-200 transition-all"><i data-lucide="files" class="w-3.5 h-3.5"></i> PDF aula</button>
            ${S.onClose ? `<button id="blvClose" class="px-3 py-2 rounded-xl bg-slate-100 text-slate-500 text-xs font-black hover:bg-slate-200 transition-all"><i data-lucide="x" class="w-3.5 h-3.5"></i> Cerrar</button>` : ''}
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-3 mb-4">
          <div class="flex flex-wrap gap-1.5" id="blvPeriods">${periodChips}</div>
          <div class="ml-auto flex items-center gap-2">
            <button id="blvPrev" class="w-8 h-8 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition-all" title="Estudiante anterior"><i data-lucide="chevron-left" class="w-4 h-4"></i></button>
            <select id="blvStudentSel" class="px-3 py-2 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-[#FF7A00] bg-white min-w-[200px]">${studentOpts}</select>
            <button id="blvNext" class="w-8 h-8 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition-all" title="Estudiante siguiente"><i data-lucide="chevron-right" class="w-4 h-4"></i></button>
          </div>
        </div>

        <div id="blvBody"></div>
      </div>`;

    this._bindEvents();
    this._renderBody();
    if (window.lucide) lucide.createIcons();
  },

  _bindEvents() {
    const S = this.S;
    const c = S.container;

    c.querySelector('#blvPeriods')?.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-blv-period]');
      if (!chip) return;
      S.selPeriodId = Number(chip.dataset.blvPeriod);
      this._render();
    });

    c.querySelector('#blvStudentSel')?.addEventListener('change', (e) => {
      S.selStudentId = Number(e.target.value);
      this._renderBody();
    });

    c.querySelector('#blvPrev')?.addEventListener('click', () => this._stepStudent(-1));
    c.querySelector('#blvNext')?.addEventListener('click', () => this._stepStudent(1));

    c.querySelector('#blvPrintStudent')?.addEventListener('click', () => this._printStudent());
    c.querySelector('#blvPrintClass')?.addEventListener('click', () => this._printClass());
    c.querySelector('#blvPdfStudent')?.addEventListener('click', () => this._pdfStudent());
    c.querySelector('#blvPdfClass')?.addEventListener('click', () => this._pdfClass());
    c.querySelector('#blvClose')?.addEventListener('click', () => S.onClose && S.onClose());

    this._bindContainerDelegates();
  },

  _bindContainerDelegates() {
    const c = this.S.container;
    if (this._boundContainers?.has(c)) return;
    this._boundContainers = this._boundContainers || new WeakSet();
    this._boundContainers.add(c);

    // Edición de celdas
    c.addEventListener('change', (e) => {
      const cell = e.target.closest?.('.blv-cell');
      if (cell) this._debouncedSave(cell);
    });
    c.addEventListener('click', (e) => {
      const star = e.target.closest?.('.eval-star');
      const yn = e.target.closest?.('.eval-yesno');
      if (star || yn) {
        const cell = (star || yn).closest('.blv-cell');
        if (cell) this._debouncedSave(cell);
      }
    });

    // Notas (delegado porque el body se re-renderiza al cambiar de estudiante)
    c.addEventListener('input', (e) => {
      if (e.target.matches?.('[data-blv-note]')) this._debouncedSaveNotes();
    });
    c.addEventListener('click', (e) => {
      if (e.target.closest?.('#blvSaveNotes')) this._saveNotes();
    });
  },

  _stepStudent(dir) {
    const S = this.S;
    const idx = S.students.findIndex(s => s.id === S.selStudentId);
    const next = S.students[idx + dir];
    if (!next) return;
    S.selStudentId = next.id;
    const sel = S.container.querySelector('#blvStudentSel');
    if (sel) sel.value = next.id;
    this._renderBody();
    S.container.querySelector('#blvBody')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  _renderBody() {
    const S = this.S;
    const body = S.container.querySelector('#blvBody');
    if (!body) return;
    const student = S.students.find(s => s.id === S.selStudentId) || S.students[0];
    const period = S.periods.find(p => p.id === S.selPeriodId) || S.periods[0];
    const data = buildBoletaData({ student, period, areas: S.areas, modules: S.modules, activities: S.activities, scoresMap: S.scoresMap });
    const note = S.notes[`${student.id}:${period.id}`] || {};

    body.innerHTML = `
      <div class="flex flex-wrap items-end justify-between gap-3 bg-gradient-to-r from-orange-50 to-amber-50 rounded-2xl border border-orange-100 p-4 mb-4">
        <div>
          <div class="text-[10px] uppercase tracking-widest font-black text-orange-500">Boleta de</div>
          <h2 class="text-xl font-black text-slate-800">${esc(student.name)}</h2>
          <div class="text-xs text-slate-500 font-medium mt-0.5">Matrícula ${esc(student.matricula || '—')} · ${esc(period.name)}</div>
        </div>
        <div class="text-right">
          <div class="text-[10px] uppercase tracking-widest font-black text-slate-400">Promedio general</div>
          <div id="blvOverall" class="text-3xl font-black leading-tight ${gradeColor(data.overall)}">${nf(data.overall)}</div>
          <div id="blvLevel" class="text-[10px] font-black text-slate-500">${gradeToLevel(data.overall).label}</div>
        </div>
      </div>

      <div class="space-y-3">
        ${data.areas.map(block => this._areaCardHtml(block, student)).join('') || '<div class="text-center py-8 text-slate-400 text-sm">No hay módulos en este período.</div>'}
      </div>

      <div class="mt-5 bg-white rounded-2xl border border-slate-200 p-4">
        <h4 class="text-sm font-black text-slate-700 mb-3 flex items-center gap-2"><span class="text-orange-500"><i data-lucide="sticky-note" class="w-4 h-4"></i></span> Notas de la boleta</h4>
        <div class="grid md:grid-cols-3 gap-3">
          <div>
            <label class="block text-[10px] font-black uppercase tracking-wide text-emerald-600 mb-1">Fortalezas</label>
            <textarea id="blvNoteStrengths" data-blv-note="strengths" rows="3" placeholder="Lo que logra..." class="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:border-[#FF7A00] resize-y">${esc(note.strengths || '')}</textarea>
          </div>
          <div>
            <label class="block text-[10px] font-black uppercase tracking-wide text-rose-600 mb-1">Aspectos a mejorar</label>
            <textarea id="blvNoteWeaknesses" data-blv-note="weaknesses" rows="3" placeholder="Lo que necesita reforzar..." class="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:border-[#FF7A00] resize-y">${esc(note.weaknesses || '')}</textarea>
          </div>
          <div>
            <label class="block text-[10px] font-black uppercase tracking-wide text-indigo-600 mb-1">Comentario general</label>
            <textarea id="blvNoteComment" data-blv-note="comment" rows="3" placeholder="Comentario para la familia..." class="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:border-[#FF7A00] resize-y">${esc(note.comment || '')}</textarea>
          </div>
        </div>
        <div class="mt-2 flex items-center justify-between">
          <span id="blvNoteStatus" class="text-[11px] text-slate-400">Cambios se guardan automáticamente</span>
          <button id="blvSaveNotes" class="px-4 py-2 rounded-xl text-white text-xs font-black flex items-center gap-1.5 shadow-md active:scale-95 transition-all" style="background:#FF7A00;box-shadow:0 4px 14px rgba(255,122,0,0.3);"><i data-lucide="save" class="w-3.5 h-3.5"></i> Guardar notas</button>
        </div>
      </div>`;

    if (window.lucide) lucide.createIcons();
  },

  _areaCardHtml(block, student) {
    const area = block.area;
    const studentId = student.id;
    let html = `
      <div class="rounded-2xl border border-slate-200 overflow-hidden bg-white">
        <div class="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100" style="background:${area.color}14">
          <span class="w-2 h-2 rounded-full" style="background:${area.color}"></span>
          <span class="text-sm font-black text-slate-700">${esc(area.name)}</span>
          <span class="ml-auto text-xs font-black ${gradeColor(block.avg)}" id="blv-aavg-${area.id}">${nf(block.avg)}</span>
        </div>
        <div class="divide-y divide-slate-100">`;
    block.modules.forEach(m => {
      html += `
        <div class="flex flex-wrap items-center gap-2 px-4 py-2">
          <div class="w-32 shrink-0 text-[11px] font-bold text-slate-600 truncate" title="${esc(m.module.name)}">${esc(m.module.name)}</div>
          <div class="flex flex-wrap items-center gap-1.5 flex-1">
            ${m.activities.map(a => `
              <div class="blv-cell" data-module="${m.module.id}" data-activity="${a.act.id}" data-student="${studentId}">
                ${renderEvalInput(m.module, this.S.scoresMap[`${m.module.id}:${a.act.id}:${studentId}`] || null)}
              </div>`).join('')}
            ${!m.activities.length ? '<span class="text-[10px] text-slate-400 italic">Sin actividades</span>' : ''}
          </div>
          <div class="w-16 text-center text-sm font-black ${gradeColor(m.avg)}" id="blv-mavg-${m.module.id}">${nf(m.avg)}</div>
        </div>`;
    });
    if (!block.modules.length) {
      html += `<div class="px-4 py-4 text-[11px] text-slate-400 italic">Este área no tiene módulos para el período seleccionado.</div>`;
    }
    html += `</div></div>`;
    return html;
  },

  /* ── GUARDADO ───────────────────────────────────────────── */
  _debouncedSave(cell) {
    const key = `${cell.dataset.activity}:${cell.dataset.student}`;
    clearTimeout(this._saveTimers[key]);
    this._saveTimers[key] = setTimeout(() => this._saveCell(cell), 450);
  },

  async _saveCell(cell) {
    const S = this.S;
    const module = S.modules.find(m => m.id === Number(cell.dataset.module));
    const activityId = Number(cell.dataset.activity);
    const studentId = Number(cell.dataset.student);
    if (!module) return;
    const record = readEvalInputs(cell, module.eval_type);
    const uid = await this._uid();
    try {
      if (!record) {
        const { error } = await supabase.from('eval_scores').delete()
          .eq('activity_id', activityId).eq('student_id', studentId);
        if (error) throw error;
        delete S.scoresMap[`${module.id}:${activityId}:${studentId}`];
      } else {
        const payload = { module_id: module.id, activity_id: activityId, student_id: studentId, evaluated_by: uid, ...record };
        const { data, error } = await supabase.from('eval_scores').upsert(payload, { onConflict: 'activity_id,student_id' }).select().single();
        if (error) throw error;
        S.scoresMap[`${module.id}:${activityId}:${studentId}`] = data;
      }
      this._refreshAverages(studentId, module.id);
    } catch (err) {
      Helpers.toast(err?.message || 'Error al guardar la calificación', 'error');
    }
  },

  _refreshAverages(studentId, moduleId) {
    const S = this.S;
    const periodId = S.selPeriodId;
    const mod = S.modules.find(m => m.id === moduleId);
    if (!mod || !periodId) return;

    const acts = S.activities.filter(a => a.module_id === moduleId);
    const mAvg = moduleAvg(mod, acts, studentId, S.scoresMap);
    const mEl = S.container.querySelector(`#blv-mavg-${moduleId}`);
    if (mEl) { mEl.textContent = nf(mAvg); mEl.className = `w-16 text-center text-sm font-black ${gradeColor(mAvg)}`; }

    const area = S.areas.find(a => a.id === mod.area_id);
    const areaMods = S.modules.filter(m => m.period_id === periodId && m.area_id === mod.area_id);
    const areaVals = areaMods.map(m => moduleAvg(m, S.activities.filter(a => a.module_id === m.id), studentId, S.scoresMap));
    const aAvg = avgOf(areaVals);
    if (area) {
      const aEl = S.container.querySelector(`#blv-aavg-${area.id}`);
      if (aEl) { aEl.textContent = nf(aAvg); aEl.className = `ml-auto text-xs font-black ${gradeColor(aAvg)}`; }
    }

    const overallVals = [];
    S.areas.forEach(ar => {
      const mms = S.modules.filter(m => m.period_id === periodId && m.area_id === ar.id);
      overallVals.push(avgOf(mms.map(m => moduleAvg(m, S.activities.filter(a => a.module_id === m.id), studentId, S.scoresMap))));
    });
    const overall = avgOf(overallVals);
    const oEl = S.container.querySelector('#blvOverall');
    if (oEl) { oEl.textContent = nf(overall); oEl.className = `text-3xl font-black leading-tight ${gradeColor(overall)}`; }
    const lEl = S.container.querySelector('#blvLevel');
    if (lEl) lEl.textContent = gradeToLevel(overall).label;
  },

  _debouncedSaveNotes() {
    clearTimeout(this._notesTimer);
    this._notesTimer = setTimeout(() => this._saveNotes(), 900);
  },

  async _saveNotes() {
    const S = this.S;
    const studentId = S.selStudentId;
    const periodId = S.selPeriodId;
    const read = id => document.getElementById(id)?.value.trim() || null;
    const payload = {
      strengths: read('blvNoteStrengths'),
      weaknesses: read('blvNoteWeaknesses'),
      comment: read('blvNoteComment')
    };
    const hasContent = payload.strengths || payload.weaknesses || payload.comment;
    const key = `${studentId}:${periodId}`;
    const existing = S.notes[key];
    const statusEl = document.getElementById('blvNoteStatus');
    if (!statusEl) return;
    try {
      const uid = await this._uid();
      if (!hasContent && existing) {
        await supabase.from('eval_boleta_notes').delete().eq('id', existing.id);
        delete S.notes[key];
      } else if (hasContent) {
        const { data, error } = await supabase.from('eval_boleta_notes')
          .upsert({ classroom_id: S.classroomId, student_id: studentId, period_id: periodId, created_by: uid, ...payload }, { onConflict: 'student_id,period_id' })
          .select().single();
        if (error) throw error;
        S.notes[key] = data;
      }
      statusEl.textContent = 'Guardado ✓';
      statusEl.className = 'text-[11px] text-emerald-600 font-bold';
      setTimeout(() => {
        if (statusEl) { statusEl.textContent = 'Cambios se guardan automáticamente'; statusEl.className = 'text-[11px] text-slate-400'; }
      }, 2500);
    } catch (err) {
      statusEl.textContent = 'Error al guardar';
      statusEl.className = 'text-[11px] text-rose-600 font-bold';
      Helpers.toast(err?.message || 'Error al guardar notas', 'error');
    }
  },

  /* ── IMPRESIÓN ──────────────────────────────────────────── */
  _verificationPayload(student, period) {
    const S = this.S;
    const data = buildBoletaData({ student, period, areas: S.areas, modules: S.modules, activities: S.activities, scoresMap: S.scoresMap });
    const parts = [
      'BOLETA-KARPUS', S.school.school_name, S.evaluation.name,
      student.matricula || String(student.id), student.name, period.name,
      data.overall != null ? data.overall.toFixed(1) : 'NA',
      new Date().toISOString().slice(0, 10)
    ];
    return parts.join('|');
  },

  _qrDataUrl(text, size = 128) {
    if (typeof QRCode === 'undefined') return null;
    try {
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:-9999px;top:0;';
      document.body.appendChild(host);
      const qr = new QRCode(host, { text, width: size, height: size, correctLevel: QRCode.CorrectLevel.M });
      const canvas = host.querySelector('canvas');
      const url = canvas ? canvas.toDataURL('image/png') : null;
      host.remove();
      return url;
    } catch (_) { return null; }
  },

  _printStudent() {
    const S = this.S;
    const student = S.students.find(s => s.id === S.selStudentId);
    if (!student) return;
    this._openPrintWindow(this._printDocHtml(this._printPageHtml(student, S.periods.find(p => p.id === S.selPeriodId) || S.periods[0])));
  },

  _printClass() {
    const S = this.S;
    const period = S.periods.find(p => p.id === S.selPeriodId) || S.periods[0];
    const pages = S.students.map(st => this._printPageHtml(st, period)).join('<div class="page-break"></div>');
    this._openPrintWindow(this._printDocHtml(pages));
  },

  _printPageHtml(student, period) {
    const S = this.S;
    const data = buildBoletaData({ student, period, areas: S.areas, modules: S.modules, activities: S.activities, scoresMap: S.scoresMap });
    const note = S.notes[`${student.id}:${period.id}`] || {};
    const maxActs = Math.max(1, ...data.areas.map(a => Math.max(...a.modules.map(m => m.activities.length), 0)));
    const nCols = 3 + maxActs;
    const lvl = gradeToLevel(data.overall);
    const verification = this._verificationPayload(student, period);
    const qrUrl = this._qrDataUrl(verification);

    let rows = '';
    data.areas.forEach(block => {
      if (!block.modules.length) return;
      rows += `<tr class="area-row"><td colspan="${nCols}">${esc(block.area.name)} <span class="avg">${nf(block.avg)}</span></td></tr>`;
      block.modules.forEach(m => {
        const cells = m.activities.map(a => `<td class="num">${a.norm != null ? a.norm.toFixed(1) : '—'}</td>`).join('');
        const pad = '<td class="num"></td>'.repeat(Math.max(0, maxActs - m.activities.length));
        rows += `<tr class="module-row"><td class="area">${esc(block.area.name)}</td><td><b>${esc(m.module.name)}</b></td>${cells}${pad}<td class="num prom"><b>${nf(m.avg)}</b></td></tr>`;
      });
    });

    return `
      <div class="page">
        <header class="head">
          <div class="logo">${S.school.logo_url ? `<img src="${esc(S.school.logo_url)}" alt="logo">` : '<div class="logo-fallback">🏫</div>'}</div>
          <div class="head-txt">
            <h1>${esc(S.school.school_name)}</h1>
            <h2>Boleta de Calificaciones</h2>
          </div>
          ${qrUrl ? `<div class="head-qr"><img class="qr-img" src="${qrUrl}" alt="QR"><div class="qr-caption">Verificación</div></div>` : ''}
        </header>
        <div class="meta">
          <div><b>Estudiante:</b> ${esc(student.name)}</div>
          <div><b>Matrícula:</b> ${esc(student.matricula || '—')}</div>
          <div><b>Aula:</b> ${esc(S.classroom?.name || '—')}${S.classroom?.level ? ` (${esc(S.classroom.level)})` : ''}</div>
          <div><b>Evaluación:</b> ${esc(S.evaluation.name)}</div>
          <div><b>Período:</b> ${esc(period.name)}</div>
          <div><b>Fecha:</b> ${new Date().toLocaleDateString('es-DO')}</div>
        </div>
        <table class="boleta">
          <thead>
            <tr>
              <th style="width:120px">Área</th><th style="width:160px">Módulo</th>
              ${Array.from({ length: maxActs }, (_, i) => `<th>Act. ${i + 1}</th>`).join('')}
              <th style="width:70px">Prom.</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
            <tr class="overall-row">
              <td colspan="${nCols - 1}"><b>PROMEDIO GENERAL</b></td>
              <td class="num prom"><b>${nf(data.overall)}</b></td>
            </tr>
            <tr class="level-row">
              <td colspan="${nCols}">Nivel alcanzado: <b>${lvl.label}</b></td>
            </tr>
          </tbody>
        </table>
        <div class="notes">
          <div class="note"><div class="n-title">Fortalezas</div><div class="n-body">${esc(note.strengths || '')}</div></div>
          <div class="note"><div class="n-title">Aspectos a mejorar</div><div class="n-body">${esc(note.weaknesses || '')}</div></div>
          <div class="note wide"><div class="n-title">Comentario general</div><div class="n-body">${esc(note.comment || '')}</div></div>
        </div>
        <footer class="sign">
          <div class="sign-box"><div class="line"></div>Maestra de Aula</div>
          <div class="sign-box"><div class="line"></div>Directora</div>
          <div class="sign-box"><div class="line"></div>Padre / Madre / Tutor</div>
        </footer>
        <div class="verify">Documento verificado electrónicamente · Código: <b>${esc(verification.slice(0, 48))}…</b></div>
      </div>`;
  },

  _printDocHtml(body) {
    const S = this.S;
    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Boleta — ${esc(S.evaluation.name)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #0f172a; margin: 0; }
  .page { background: #fff; padding: 6px; }
  .page-break { page-break-after: always; }
  .head { display: flex; align-items: center; gap: 14px; border-bottom: 3px solid #FF7A00; padding-bottom: 10px; margin-bottom: 12px; }
  .logo img { width: 60px; height: 60px; object-fit: contain; }
  .logo-fallback { width: 60px; height: 60px; display: flex; align-items: center; justify-content: center; font-size: 28px; background: #fff7ed; border-radius: 12px; }
  .head-txt { flex: 1; }
  .head-txt h1 { font-size: 19px; margin: 0; color: #1e293b; }
  .head-txt h2 { font-size: 13px; margin: 2px 0 0; color: #FF7A00; text-transform: uppercase; letter-spacing: 1px; }
  .head-qr { text-align: center; }
  .head-qr .qr-img { width: 64px; height: 64px; border: 1px solid #e2e8f0; border-radius: 6px; padding: 2px; }
  .head-qr .qr-caption { font-size: 8px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #94a3b8; margin-top: 2px; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 18px; font-size: 11px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 12px; margin-bottom: 12px; }
  table.boleta { width: 100%; border-collapse: collapse; font-size: 11px; }
  .boleta th, .boleta td { border: 1px solid #cbd5e1; padding: 4px 6px; }
  .boleta th { background: #fff7ed; color: #9a3412; font-size: 10px; text-transform: uppercase; }
  .boleta td.num { text-align: center; }
  .boleta tr.area-row td { background: #f97316; color: #fff; font-weight: 800; font-size: 10.5px; }
  .boleta tr.area-row td .avg { float: right; }
  .boleta tr.module-row td.area { background: #fff7ed; color: #9a3412; font-weight: 700; }
  .boleta tr.module-row:nth-child(even) { background: #f8fafc; }
  .boleta td.prom { background: #ffedd5; font-weight: 800; }
  .boleta tr.overall-row td { background: #0f172a; color: #fff; font-size: 12px; }
  .boleta tr.overall-row td.prom { background: #0f172a; color: #4ade80; }
  .boleta tr.level-row td { background: #ecfdf5; color: #065f46; font-weight: 700; }
  .notes { margin-top: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .note { border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; min-height: 58px; }
  .note.wide { grid-column: 1 / -1; }
  .n-title { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; margin-bottom: 3px; }
  .n-body { font-size: 11px; white-space: pre-wrap; }
  .sign { margin-top: 18px; display: flex; justify-content: space-between; gap: 20px; }
  .sign-box { flex: 1; text-align: center; font-size: 10px; color: #64748b; }
  .sign-box .line { border-top: 1.5px solid #94a3b8; margin-bottom: 5px; height: 34px; }
  .verify { margin-top: 8px; font-size: 8.5px; color: #94a3b8; text-align: right; }
</style>
</head>
<body>${body}</body>
</html>`;
  },

  _openPrintWindow(html) {
    const w = window.open('', '_blank', 'width=900,height=1150');
    if (!w) return Helpers.toast('Permite las ventanas emergentes para imprimir', 'warning');
    w.document.write(html);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 400);
  },

  /* ── PDF (Módulo 8) ─────────────────────────────────────── */
  _pdfCheck() {
    if (window.jspdf?.jsPDF) return true;
    Helpers.toast('El generador de PDF aún no está disponible. Intenta de nuevo.', 'warning');
    return false;
  },

  _pdfStudent() {
    const S = this.S;
    const student = S.students.find(s => s.id === S.selStudentId);
    if (!student || !this._pdfCheck()) return;
    try {
      this._pdfPage(student, S.periods.find(p => p.id === S.selPeriodId) || S.periods[0]);
    } catch (err) {
      console.error('[BoletaUI] PDF', err);
      Helpers.toast('Error al generar el PDF', 'error');
    }
  },

  _pdfClass() {
    const S = this.S;
    if (!this._pdfCheck()) return;
    const period = S.periods.find(p => p.id === S.selPeriodId) || S.periods[0];
    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF('p', 'mm', 'a4');
      doc._karpusShared = true;
      S.students.forEach((st, i) => {
        if (i > 0) doc.addPage();
        this._pdfPage(st, period, doc);
      });
      const clean = str => String(str || 'boleta').replace(/[^\w\-]+/g, '_');
      doc.save(`Boletas_${clean(S.classroom?.name || 'aula')}_${clean(period.name)}.pdf`);
    } catch (err) {
      console.error('[BoletaUI] PDF aula', err);
      Helpers.toast('Error al generar los PDF', 'error');
    }
  },

  _pdfPage(student, period, doc = null) {
    const S = this.S;
    const { jsPDF } = window.jspdf;
    doc = doc || new jsPDF('p', 'mm', 'a4');
    const pw = doc.internal.pageSize.getWidth();
    const ml = 14;
    let y = 16;

    const school = S.school.school_name || 'Colegio Montessori Sonrisas Creativas';
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(school, ml, y);
    doc.setFontSize(10);
    doc.setTextColor(255, 122, 0);
    doc.text('BOLETA DE CALIFICACIONES', ml, y + 5);
    doc.setTextColor(20, 20, 20);
    doc.setDrawColor(255, 122, 0);
    doc.setLineWidth(0.8);
    doc.line(ml, y + 7, pw - ml, y + 7);
    y += 12;

    const data = buildBoletaData({ student, period, areas: S.areas, modules: S.modules, activities: S.activities, scoresMap: S.scoresMap });
    const note = S.notes[`${student.id}:${period.id}`] || {};
    const lvl = gradeToLevel(data.overall);
    const verification = this._verificationPayload(student, period);

    doc.setFontSize(9.5);
    doc.setTextColor(50, 50, 50);
    const meta = [
      `Estudiante: ${student.name}`,
      `Matrícula: ${student.matricula || '—'}`,
      `Aula: ${S.classroom?.name || '—'}${S.classroom?.level ? ` (${S.classroom.level})` : ''}`,
      `Evaluación: ${S.evaluation.name}`,
      `Período: ${period.name}`,
      `Fecha: ${new Date().toLocaleDateString('es-DO')}`
    ];
    meta.forEach((m, i) => {
      const col = i % 2 === 0 ? ml : pw / 2;
      const row = Math.floor(i / 2);
      doc.text(m, col, y + row * 5);
    });
    y += 16;

    const maxActs = Math.max(1, ...data.areas.map(a => Math.max(...a.modules.map(m => m.activities.length), 0)));
    const headCols = [['Área', 'Módulo']];
    for (let i = 0; i < maxActs; i++) headCols[0].push(`Act. ${i + 1}`);
    headCols[0].push('Prom.');

    const body = [];
    data.areas.forEach(block => {
      if (!block.modules.length) return;
      body.push([{ content: `${block.area.name} — ${nf(block.avg)}`, colSpan: headCols[0].length, styles: { fillColor: [249, 115, 22], textColor: 255, fontStyle: 'bold' } }]);
      block.modules.forEach(m => {
        const cells = m.activities.map(a => (a.norm != null ? a.norm.toFixed(1) : '—'));
        while (cells.length < maxActs) cells.push('');
        body.push([block.area.name, m.module.name, ...cells, { content: nf(m.avg), styles: { fontStyle: 'bold', fillColor: [255, 237, 213] } }]);
      });
    });
    body.push([{ content: 'PROMEDIO GENERAL', colSpan: headCols[0].length - 1, styles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' } }, { content: nf(data.overall), styles: { fillColor: [15, 23, 42], textColor: [74, 222, 128], fontStyle: 'bold' } }]);
    body.push([{ content: `Nivel alcanzado: ${lvl.label}`, colSpan: headCols[0].length, styles: { fillColor: [236, 253, 245], textColor: [6, 95, 70], fontStyle: 'bold' } }]);

    doc.autoTable({
      startY: y,
      margin: { left: ml, right: ml },
      head: headCols,
      body,
      theme: 'grid',
      styles: { fontSize: 8.5, cellPadding: 1.6, halign: 'center' },
      headStyles: { fillColor: [255, 247, 237], textColor: [154, 52, 18], halign: 'center' },
      columnStyles: { 0: { halign: 'left', fontStyle: 'bold' }, 1: { halign: 'left' } },
      didParseCell: (d) => {
        if (d.section === 'body' && d.column.index === 0 && d.row.raw[0]?.area) { d.cell.styles.fillColor = [255, 247, 237]; d.cell.styles.textColor = [154, 52, 18]; }
      }
    });
    y = doc.lastAutoTable.finalY + 8;

    doc.setFontSize(9.5);
    doc.setTextColor(40, 40, 40);
    const noteBlocks = [
      ['Fortalezas', note.strengths || ''],
      ['Aspectos a mejorar', note.weaknesses || ''],
      ['Comentario general', note.comment || '']
    ];
    noteBlocks.forEach(([t, v]) => {
      if (y > 245) { doc.addPage(); y = 16; }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(t.toUpperCase(), ml, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(40, 40, 40);
      const lines = doc.splitTextToSize(v || '—', pw - ml * 2);
      doc.setFontSize(9);
      doc.text(lines, ml, y + 4);
      y += 6 + lines.length * 3.8;
    });
    y += 4;

    if (y > 230) { doc.addPage(); y = 16; }
    const qrUrl = this._qrDataUrl(verification, 96);
    if (qrUrl) {
      try {
        doc.addImage(qrUrl, 'PNG', pw - ml - 32, y, 32, 32);
      } catch (_) {}
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text('Verificación', pw - ml - 16, y + 34, { align: 'center' });
    }

    const signY = y + 44;
    const signW = (pw - ml * 2 - 16) / 3;
    ['Maestra de Aula', 'Directora', 'Padre / Madre / Tutor'].forEach((role, i) => {
      const x = ml + i * (signW + 8);
      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.4);
      doc.line(x, signY, x + signW, signY);
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      doc.text(role, x + signW / 2, signY + 5, { align: 'center' });
    });
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(`Documento verificado electrónicamente · ${verification}`, ml, signY + 12);

    if (!doc._karpusShared) {
      const clean = str => String(str || 'boleta').replace(/[^\w\-]+/g, '_');
      doc.save(`Boleta_${clean(student.matricula || student.name)}_${clean(period.name)}.pdf`);
    }
  }
};

window.BoletaUI = BoletaUI;
