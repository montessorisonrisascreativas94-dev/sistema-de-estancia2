/**
 * Centro de Evaluación Académica — Boletín Inteligente (Directora).
 * Lista de estudiantes con promedio por período → clic abre la cuadrícula
 * compartida GradebookGrid (Áreas × Actividades en lectura + botones
 * "Ver Boletín" / "Descargar PDF"). Reemplaza al antiguo módulo de
 * competencias.
 */
import { Helpers } from '../shared/helpers.js';
import { supabase } from '../shared/supabase.js';
import { DirectorApi } from './api.js';
import { buildScoresMap, normalizeScore, avgOf, gradeColor, gradeToLevel } from '../shared/eval-utils.js';
import { GradebookGrid } from '../shared/gradebook-grid.module.js';

const _esc = (s) => Helpers.escapeHTML(String(s ?? ''));

export const GradesModule = {
  _evaluation: null,
  _periods: [],
  _classrooms: [],
  _students: [],
  _areas: [],
  _modules: [],
  _activities: [],
  _scoresMap: {},
  _selPeriodId: null,
  _selClassroomId: null,

  async init() {
    const container = document.getElementById('gradesTableBody');
    if (!container) return;

    await this._loadBase();
    this._bindEvents();
    this._render();
  },

  async _loadBase() {
    try {
      const { data: evals } = await supabase
        .from('eval_evaluations')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      this._evaluation = evals?.[0] || null;

      if (this._evaluation) {
        try {
          await supabase.rpc('boletin_ensure_structure', { p_evaluation_id: this._evaluation.id });
        } catch (_) {}
        const { data: periods } = await supabase
          .from('eval_periods')
          .select('*')
          .eq('evaluation_id', this._evaluation.id)
          .is('deleted_at', null)
          .order('sort_order')
          .order('created_at');
        this._periods = periods || [];
      }

      const [classRes, studRes] = await Promise.all([
        DirectorApi.getClassrooms(),
        DirectorApi.getStudents({ status: 'active' })
      ]);
      this._classrooms = classRes?.data || [];
      this._students = (studRes?.data || []).map(s => ({
        ...s,
        classroom_name: s.classrooms?.name || 'Sin aula',
        classroom_level: s.classrooms?.level || ''
      }));

      await this._loadEvalData();
    } catch (e) {
      console.error('[Grades] _loadBase', e);
    }
  },

  async _loadEvalData() {
    if (!this._evaluation) { this._scoresMap = {}; return; }
    const periodIds = this._periods.map(p => p.id);
    const { data: areas } = await supabase.from('eval_areas')
      .select('*').eq('evaluation_id', this._evaluation.id).is('deleted_at', null).order('sort_order');
    this._areas = areas || [];
    const { data: modules } = periodIds.length
      ? await supabase.from('eval_modules').select('*').in('period_id', periodIds).is('deleted_at', null).order('sort_order')
      : { data: [] };
    this._modules = modules || [];
    const moduleIds = this._modules.map(m => m.id);
    const { data: activities } = moduleIds.length
      ? await supabase.from('eval_activities').select('*').in('module_id', moduleIds).is('deleted_at', null).order('sort_order')
      : { data: [] };
    this._activities = activities || [];
    const studentIds = this._students.map(s => s.id);
    const { data: scores } = moduleIds.length && studentIds.length
      ? await supabase.from('eval_scores').select('*').in('module_id', moduleIds).in('student_id', studentIds)
      : { data: [] };
    this._scoresMap = buildScoresMap(scores || [], this._activities);
  },

  _bindEvents() {
    const periodSel = document.getElementById('gradesFilterPeriod');
    if (periodSel) {
      periodSel.innerHTML = '<option value="">Todos los períodos</option>' +
        this._periods.map(p => `<option value="${p.id}">${_esc(p.name)}${p.status === 'closed' ? ' (Cerrado)' : ''}</option>`).join('');
      periodSel.value = this._selPeriodId ?? '';
      periodSel.addEventListener('change', (e) => { this._selPeriodId = e.target.value || null; this._render(); });
    }

    const classSel = document.getElementById('gradesFilterClassroom');
    if (classSel) {
      classSel.innerHTML = '<option value="all">Todas las aulas</option>' +
        this._classrooms.map(c => `<option value="${c.id}">${_esc(c.name)}</option>`).join('');
      classSel.addEventListener('change', (e) => { this._selClassroomId = e.target.value || 'all'; this._render(); });
    }

    const search = document.getElementById('searchGradeStudent');
    if (search && !search._bound) {
      search._bound = true;
      search.addEventListener('input', Helpers.debounce(() => this._render(), 300));
    }

    document.getElementById('btnNewPeriod')?.addEventListener('click', () => this._openPeriodModal());
  },

  filter(value) {
    const input = document.getElementById('searchGradeStudent');
    if (input) { input.value = value; this._render(); }
  },

  _levelOf(avg) {
    if (avg == null) return { label: 'Sin evaluar', cls: 'bg-slate-100 text-slate-500' };
    return gradeToLevel(avg);
  },

  _avgFor(studentId) {
    const periodId = this._selPeriodId;
    const mods = periodId
      ? this._modules.filter(m => m.period_id === Number(periodId))
      : this._modules;
    const areaAvgs = this._areas.map(area => {
      const areaMods = mods
        .filter(m => m.area_id === area.id)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      const cells = areaMods.map(m => {
        const act = this._activities.find(a => a.module_id === m.id);
        if (!act) return null;
        return normalizeScore(m, this._scoresMap[`${m.id}:${act.id}:${studentId}`] || null);
      });
      return avgOf(cells);
    });
    const weighted = areaAvgs.reduce((acc, avg, i) => {
      const w = Number(this._areas[i]?.weight) || 0;
      if (avg == null || w <= 0) return acc;
      acc.sum += avg * w;
      acc.w += w;
      return acc;
    }, { sum: 0, w: 0 });
    if (weighted.w > 0) return Math.round((weighted.sum / weighted.w) * 100) / 100;
    const evaluated = areaAvgs.filter(a => a != null);
    return evaluated.length ? avgOf(evaluated) : null;
  },

  _render() {
    const tableBody = document.getElementById('gradesTableBody');
    if (!tableBody) return;

    const search = (document.getElementById('searchGradeStudent')?.value || '').toLowerCase().trim();
    const classFilter = this._selClassroomId || 'all';

    let filtered = this._students.filter(s => {
      if (search && !s.name.toLowerCase().includes(search) && !String(s.matricula || '').toLowerCase().includes(search)) return false;
      if (classFilter !== 'all' && String(s.classroom_id) !== String(classFilter)) return false;
      return true;
    });

    const rows = filtered.map(s => ({ ...s, avg: this._avgFor(s.id) }));
    rows.sort((a, b) => ((b.avg ?? -1) - (a.avg ?? -1)) || a.name.localeCompare(b.name));

    if (!rows.length) {
      tableBody.innerHTML = '<tr><td colspan="5" class="text-center py-16 text-slate-400 font-medium">No se encontraron estudiantes con los filtros aplicados.</td></tr>';
      return;
    }

    tableBody.innerHTML = rows.map(s => {
      const level = this._levelOf(s.avg);
      return `
        <tr class="hover:bg-indigo-50/30 border-b border-slate-100 transition-all cursor-pointer group"
            onclick="App.grades.openStudentDetail(${s.id})">
          <td class="px-6 py-4">
            <div class="flex items-center gap-4">
              ${s.avatar_url
                ? `<img src="${_esc(s.avatar_url)}" class="w-10 h-10 rounded-2xl object-cover">`
                : `<div class="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center font-black text-sm group-hover:scale-110 transition-transform">${_esc(s.name).charAt(0)}</div>`}
              <div>
                <div class="font-black text-slate-800 text-sm">${_esc(s.name)}</div>
                <div class="text-[10px] text-slate-400 font-black uppercase tracking-tighter">${_esc(s.matricula || '')}</div>
              </div>
            </div>
          </td>
          <td class="px-4 py-4">
            <div class="font-bold text-slate-600 text-sm">${_esc(s.classroom_name)}</div>
            <div class="text-[10px] text-slate-400 font-bold uppercase">${_esc(s.classroom_level || '')}</div>
          </td>
          <td class="px-4 py-4 text-center">
            <span class="font-black text-lg ${s.avg != null ? gradeColor(s.avg) : 'text-slate-300'}">${s.avg != null ? s.avg.toFixed(1) : '—'}</span>
          </td>
          <td class="px-4 py-4 text-center">
            ${s.avg != null
              ? `<span class="px-3 py-1 rounded-full text-[10px] font-black uppercase shadow-sm ${level.cls}">${level.label}</span>`
              : '<span class="text-slate-300 font-bold text-xs">Sin evaluar</span>'}
          </td>
          <td class="px-4 py-4 text-center">
            <button onclick="event.stopPropagation();App.grades.openStudentDetail(${s.id})"
              class="px-3 py-1.5 rounded-xl text-white text-[10px] font-black shadow-sm flex items-center gap-1.5 mx-auto" style="background:#6366F1">
              <i data-lucide="table-2" class="w-3.5 h-3.5"></i> Calificaciones
            </button>
          </td>
        </tr>`;
    }).join('');

    if (window.lucide) lucide.createIcons();
  },

  async openStudentDetail(studentId) {
    const student = this._students.find(s => String(s.id) === String(studentId));
    if (!student) return;
    if (!this._evaluation) return Helpers.toast('No hay un boletín configurado. Contacta al administrador.', 'warning');

    const cls = student.classrooms || {};
    const room = this._classrooms.find(c => String(c.id) === String(student.classroom_id)) || null;
    try {
      await GradebookGrid.open({
        student,
        classroom: {
          id: student.classroom_id,
          name: cls.name || room?.name || student.classroom_name,
          level: room?.level || student.classroom_level || ''
        },
        evaluationId: this._evaluation.id,
        periodId: this._selPeriodId ? Number(this._selPeriodId) : null,
        classroomId: student.classroom_id,
        role: 'directora',
        editable: false
      });
    } catch (e) {
      console.error('[Grades] cuadrícula', e);
      Helpers.toast('Error al abrir el Centro de Calificaciones', 'error');
    }
  },

  _openPeriodModal() {
    const ic = 'w-full px-4 py-2.5 border-2 border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 bg-slate-50/50 transition-all text-sm font-medium';
    const lc = 'block text-[11px] font-black text-slate-400 uppercase tracking-wider mb-1.5 ml-1';
    const y = new Date().getFullYear();
    const todayStr = new Date().toISOString().slice(0, 10);

    supabase.from('school_years').select('id, name').eq('is_current', true).maybeSingle().then(({ data: year }) => {
      window.openGlobalModal(`
        <div class="w-full max-w-md overflow-hidden">
          <div class="bg-indigo-600 p-6 text-white flex justify-between items-center">
            <h3 class="text-xl font-black">Nuevo Período</h3>
          </div>
          <div class="p-6 space-y-4">
            <div><label class="${lc}">Nombre del Período</label><input id="periodName" class="${ic}" placeholder="Ej: 1er Trimestre ${y}"></div>
            <div class="grid grid-cols-2 gap-4">
              <div><label class="${lc}">Fecha Inicio</label><input id="periodStart" type="date" value="${todayStr}" class="${ic}"></div>
              <div><label class="${lc}">Fecha Fin</label><input id="periodEnd" type="date" class="${ic}"></div>
            </div>
          </div>
          <div class="p-6 bg-slate-50 flex justify-end gap-3">
            <button onclick="App.ui.closeModal()" class="px-6 py-2.5 text-xs font-black uppercase text-slate-400">Cancelar</button>
            <button id="btnSavePeriod" class="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase shadow-lg shadow-indigo-200">Crear Período</button>
          </div>
        </div>
      `);
      document.getElementById('btnSavePeriod')?.addEventListener('click', async () => {
        const name = document.getElementById('periodName')?.value.trim();
        const start = document.getElementById('periodStart')?.value;
        const end = document.getElementById('periodEnd')?.value;
        if (!name || !start || !end) return Helpers.toast('Completa todos los campos', 'warning');
        const { error } = await supabase.from('periods').insert({
          name, start_date: start, end_date: end,
          status: 'open', is_active: false,
          school_year_id: year?.id || null
        });
        if (error) return Helpers.toast(error.message || 'Error al crear período', 'error');
        Helpers.toast('Período creado correctamente', 'success');
        App.ui.closeModal();
        await this._refreshPeriods();
      });
      if (window.lucide) lucide.createIcons();
    });
  },

  async _refreshPeriods() {
    if (!this._evaluation) return;
    try {
      await supabase.rpc('boletin_ensure_structure', { p_evaluation_id: this._evaluation.id });
    } catch (_) {}
    const { data: periods } = await supabase.from('eval_periods')
      .select('*').eq('evaluation_id', this._evaluation.id).is('deleted_at', null)
      .order('sort_order').order('created_at');
    this._periods = periods || [];
    const sel = document.getElementById('gradesFilterPeriod');
    if (sel) {
      sel.innerHTML = '<option value="">Todos los períodos</option>' +
        this._periods.map(p => `<option value="${p.id}">${_esc(p.name)}${p.status === 'closed' ? ' (Cerrado)' : ''}</option>`).join('');
      sel.value = this._selPeriodId ?? '';
    }
    await this._loadEvalData();
    this._render();
  },

  _loadAllData() {
    return this._render();
  }
};
