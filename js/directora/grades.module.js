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
  },

  openClassroomConfigModal() {
    const ic = 'w-full px-4 py-2.5 border-2 border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#0B63C7] bg-slate-50/50 transition-all text-sm font-medium';
    const lc = 'block text-[11px] font-black text-slate-400 uppercase tracking-wider mb-1.5 ml-1';

    const roomOpts = this._classrooms.map(c => `<option value="${c.id}">${_esc(c.name)} (${_esc(c.level || 'General')})</option>`).join('');

    const html = `
      <div class="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div class="bg-gradient-to-r from-[#0B63C7] to-[#0850A0] p-6 text-white flex justify-between items-center">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center"><i data-lucide="settings-2" class="w-5 h-5 text-white"></i></div>
            <div>
              <h3 class="text-xl font-black">Sistema de Estudio Único por Aula</h3>
              <p class="text-xs text-blue-100 font-bold">Configura las Áreas y la cantidad de Actividades de cada aula</p>
            </div>
          </div>
          <button onclick="App.ui.closeModal()" class="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white font-bold">✕</button>
        </div>
        <div class="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          <div>
            <label class="${lc}">Selecciona el Aula</label>
            <select id="cfgRoomSelect" class="${ic}">
              <option value="">-- Elige un Aula --</option>
              ${roomOpts}
            </select>
          </div>

          <div id="cfgRoomBody" class="space-y-5 hidden">
            <div class="p-4 bg-blue-50/60 rounded-2xl border border-blue-100 flex items-center justify-between">
              <div>
                <span class="text-xs font-black text-[#0B63C7] uppercase tracking-wider">Actividades por Módulo / Área</span>
                <p class="text-[11px] text-slate-500 font-medium">Define cuántas columnas de evaluación (A1, A2, A3...) tendrá este aula.</p>
              </div>
              <input id="cfgNumActivities" type="number" min="1" max="10" value="5" class="w-20 px-3 py-2 border-2 border-blue-200 rounded-xl text-center font-black text-sm text-[#0850A0] bg-white outline-none focus:ring-2 focus:ring-blue-400">
            </div>

            <div>
              <div class="flex items-center justify-between mb-3">
                <span class="text-xs font-black text-slate-700 uppercase tracking-wider">Áreas Pedagógicas del Aula</span>
                <button type="button" onclick="App.grades.addConfigAreaRow()" class="px-3 py-1.5 bg-[#0B63C7] text-white rounded-xl text-xs font-black uppercase shadow-sm flex items-center gap-1.5 hover:bg-[#0850A0] transition-all">
                  <i data-lucide="plus" class="w-3.5 h-3.5"></i> Agregar Área
                </button>
              </div>
              <div id="cfgAreasList" class="space-y-3">
                <!-- Se puebla dinámicamente -->
              </div>
            </div>
          </div>
        </div>

        <div id="cfgRoomFooter" class="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 hidden">
          <button onclick="App.ui.closeModal()" class="px-6 py-2.5 text-xs font-black uppercase text-slate-400 hover:text-slate-600">Cancelar</button>
          <button id="btnSaveRoomConfig" onclick="App.grades.saveClassroomConfig()" class="px-8 py-2.5 bg-[#0B63C7] text-white rounded-xl font-black text-xs uppercase shadow-lg shadow-blue-200 hover:bg-[#0850A0] transition-all flex items-center gap-2">
            <i data-lucide="save" class="w-4 h-4"></i> Guardar Sistema de Estudio
          </button>
        </div>
      </div>`;

    window.openGlobalModal(html);
    if (window.lucide) lucide.createIcons();

    const sel = document.getElementById('cfgRoomSelect');
    if (sel) {
      sel.addEventListener('change', (e) => {
        const roomId = e.target.value;
        this.loadClassroomConfigInModal(roomId);
      });
    }
  },

  async loadClassroomConfigInModal(roomId) {
    const body = document.getElementById('cfgRoomBody');
    const footer = document.getElementById('cfgRoomFooter');
    if (!roomId) {
      body?.classList.add('hidden');
      footer?.classList.add('hidden');
      return;
    }
    body?.classList.remove('hidden');
    footer?.classList.remove('hidden');

    const scaleCfg = this._evaluation?.scale_config || {};
    const roomCfgs = scaleCfg.classroom_configs || {};
    const roomCfg = roomCfgs[roomId] || null;

    const numActInput = document.getElementById('cfgNumActivities');
    if (numActInput) {
      numActInput.value = roomCfg?.num_activities || this._evaluation?.default_modules || 5;
    }

    const list = document.getElementById('cfgAreasList');
    if (!list) return;

    let roomAreas = roomCfg?.areas || [];
    if (!roomAreas.length) {
      roomAreas = this._areas.map(a => ({
        name: a.name,
        color: a.color || '#0B63C7',
        icon: a.icon || 'book-open'
      }));
    }
    if (!roomAreas.length) {
      roomAreas = [
        { name: 'Desarrollo Socioemocional', color: '#F43F5E', icon: 'heart' },
        { name: 'Lenguaje y Comunicación', color: '#0EA5E9', icon: 'message-circle' },
        { name: 'Pensamiento Matemático', color: '#6366F1', icon: 'calculator' },
        { name: 'Psicomotricidad', color: '#F97316', icon: 'activity' },
        { name: 'Arte y Creatividad', color: '#A855F7', icon: 'palette' }
      ];
    }

    list.innerHTML = '';
    roomAreas.forEach(a => this.addConfigAreaRow(a.name, a.color, a.icon));
  },

  addConfigAreaRow(name = '', color = '#0B63C7', icon = 'book-open') {
    const list = document.getElementById('cfgAreasList');
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'cfg-area-row p-3 bg-slate-50 rounded-2xl border border-slate-200 flex items-center gap-3 animate-scaleIn';
    row.innerHTML = `
      <input type="color" class="cfg-area-color w-10 h-10 rounded-xl border-none cursor-pointer shrink-0" value="${_esc(color)}">
      <input type="text" class="cfg-area-name flex-1 px-4 py-2 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 bg-white outline-none focus:border-blue-400" placeholder="Nombre del Área..." value="${_esc(name)}">
      <button type="button" onclick="this.closest('.cfg-area-row').remove()" class="w-9 h-9 bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white rounded-xl transition-all flex items-center justify-center shrink-0">
        <i data-lucide="trash-2" class="w-4 h-4"></i>
      </button>
    `;
    list.appendChild(row);
    if (window.lucide) lucide.createIcons();
  },

  async saveClassroomConfig() {
    const roomId = document.getElementById('cfgRoomSelect')?.value;
    if (!roomId) return Helpers.toast('Selecciona un aula', 'warning');

    const numActivities = parseInt(document.getElementById('cfgNumActivities')?.value || '5', 10);
    const areaRows = document.querySelectorAll('.cfg-area-row');
    const areas = [];
    areaRows.forEach(r => {
      const name = r.querySelector('.cfg-area-name')?.value?.trim();
      const color = r.querySelector('.cfg-area-color')?.value;
      if (name) areas.push({ name, color: color || '#0B63C7', icon: 'book-open' });
    });

    if (!areas.length) return Helpers.toast('Agrega al menos un área pedagógica para el aula', 'warning');

    const btn = document.getElementById('btnSaveRoomConfig');
    if (btn) { btn.disabled = true; btn.innerHTML = 'Guardando...'; }

    try {
      if (!this._evaluation?.id) throw new Error('No hay una evaluación activa.');

      const currentScaleCfg = this._evaluation.scale_config || {};
      const classroomConfigs = currentScaleCfg.classroom_configs || {};

      classroomConfigs[roomId] = {
        num_activities: numActivities,
        areas: areas,
        updated_at: new Date().toISOString()
      };

      const updatedScaleCfg = { ...currentScaleCfg, classroom_configs: classroomConfigs };

      const { error } = await supabase
        .from('eval_evaluations')
        .update({ scale_config: updatedScaleCfg })
        .eq('id', this._evaluation.id);

      if (error) throw error;

      this._evaluation.scale_config = updatedScaleCfg;
      Helpers.toast('Sistema de estudio para el aula guardado correctamente ✅', 'success');
      App.ui.closeModal();
      await this._loadEvalData();
      this._render();
    } catch (e) {
      console.error('[Grades] saveClassroomConfig', e);
      Helpers.toast('Error al guardar configuración: ' + (e.message || e), 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="save" class="w-4 h-4"></i> Guardar Sistema de Estudio'; if (window.lucide) lucide.createIcons(); }
    }
  }
};
