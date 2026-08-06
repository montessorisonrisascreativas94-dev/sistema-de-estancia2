/**
 * Centro de Calificaciones (Directora) — Gradebook por tareas.
 *
 * Espejo del Centro de Calificaciones de la maestra, pero desde el panel de la
 * directora: puede elegir CUALQUIER aula y ver/editar notas numéricas (0-100)
 * de cada alumno por tarea. Además, a diferencia del de la maestra, puede abrir
 * los archivos de TODAS las tareas archivadas por el padre (task_evidences.file_url).
 */
import { supabase } from '../shared/supabase.js';
import { Helpers } from '../shared/helpers.js';
import { BoletaUI } from '../shared/boleta.module.js';

let _state = {
  container: null,
  classrooms: [],
  selClassroomId: null,
  periodInfo: null,
  students: [],
  tasks: [],
  evidenceMap: {}, // { studentId_taskId: { numeric_score, file_url, ... } }
  evaluations: [],
  selEvalId: null,
  tab: 'tasks'
};

function esc(s) { return Helpers.escapeHTML(String(s ?? '')); }

export const GradesCenter = {
  async open() {
    const container = document.createElement('div');
    window.openGlobalModal(`
      <div class="p-2 sm:p-4 w-[calc(100vw-2rem)] md:w-[1100px]">
        <div class="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <h3 class="text-lg font-black text-slate-800 flex items-center gap-2">
              <span class="p-1.5 rounded-xl text-white" style="background:linear-gradient(135deg,#6366F1,#8B5CF6)"><i data-lucide="clipboard-list" class="w-5 h-5"></i></span>
              Centro de Calificaciones
            </h3>
            <p class="text-xs text-slate-400 mt-0.5">Califica tareas por aula y abre los archivos de las tareas archivadas por el padre.</p>
          </div>
        </div>
        <div id="gradesCenterRoot"></div>
      </div>`, true);
    if (window.lucide) lucide.createIcons();
    await this.init({ container: document.getElementById('gradesCenterRoot') });
  },

  async init(opts) {
    _state.container = typeof opts.container === 'string' ? document.getElementById(opts.container) : opts.container;
    if (!_state.container) return;

    _state.container.innerHTML = `<div class="flex justify-center py-14">
      <div class="animate-spin w-8 h-8 border-2 border-indigo-500 rounded-full border-t-transparent"></div>
    </div>`;

    try {
      const { data: classrooms } = await supabase
        .from('classrooms').select('id, name, level')
        .is('deleted_at', null)
        .order('name');

      _state.classrooms = classrooms || [];
      if (!_state.classrooms.length) {
        _state.container.innerHTML = `<div class="text-center py-12 text-slate-400 text-sm">No hay aulas registradas.</div>`;
        return;
      }
      _state.selClassroomId = _state.classrooms[0].id;
      this._renderLayout();
      this._bindEvents();
      await this._loadGradebook();
    } catch (err) {
      console.error('[GradesCenter]', err);
      _state.container.innerHTML = Helpers.errorState('Error al cargar el Centro de Calificaciones');
    }
  },

  _renderLayout() {
    const classOpts = _state.classrooms.map(c =>
      `<option value="${c.id}">${esc(c.name)}${c.level ? ` (${esc(c.level)})` : ''}</option>`
    ).join('');

    _state.container.innerHTML = `
      <div class="bg-white rounded-2xl shadow-md border border-slate-100 p-4 md:p-5">
        <div class="flex flex-wrap items-center gap-3 mb-4">
          <select id="gcClassroom" class="px-4 py-2.5 border-2 border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-indigo-500 bg-white">
            ${classOpts}
          </select>

          <div class="flex bg-slate-100 rounded-2xl p-1">
            <button id="gcTabTasks" class="px-4 py-1.5 rounded-xl text-xs font-black bg-indigo-600 text-white shadow-sm transition-all">Tareas</button>
            <button id="gcTabFiles" class="px-4 py-1.5 rounded-xl text-xs font-black text-slate-500 transition-all">Archivos del Padre</button>
            <button id="gcTabBoletas" class="px-4 py-1.5 rounded-xl text-xs font-black text-slate-500 transition-all">Boletas</button>
          </div>

          <div id="gcPeriodBadge" class="ml-auto"></div>
        </div>

        <div id="gcLockedBanner" class="hidden mb-4"></div>
        <div id="gcContent" class="overflow-hidden">
          <div class="p-8 text-center text-slate-400 font-medium">Cargando...</div>
        </div>
      </div>`;
  },

  _bindEvents() {
    _state.container.querySelector('#gcClassroom')?.addEventListener('change', (e) => {
      _state.selClassroomId = parseInt(e.target.value);
      if (_state.tab === 'boletas') { this._renderBoletasTab(); return; }
      this._loadGradebook();
    });
    _state.container.querySelector('#gcTabTasks')?.addEventListener('click', () => {
      this._setTab('tasks');
      this._loadGradebook();
    });
    _state.container.querySelector('#gcTabFiles')?.addEventListener('click', () => {
      this._setTab('files');
      this._renderFilesTab();
    });
    _state.container.querySelector('#gcTabBoletas')?.addEventListener('click', async () => {
      this._setTab('boletas');
      await this._renderBoletasTab();
    });
    this._bindCellDelegates();
  },

  _bindCellDelegates() {
    if (this._boundContainer) return;
    this._boundContainer = true;
    const c = _state.container;
    c.addEventListener('change', async (e) => {
      const input = e.target.closest?.('.gc-grade-input');
      if (input) this._onGradeChange(input);
    });
    c.addEventListener('click', (e) => {
      const file = e.target.closest?.('.gc-file-link');
      if (file) { window.open(file.dataset.url, '_blank'); return; }
      if (e.target.closest?.('#gcSaveAll')) this._saveAll();
    });
  },

  _setTab(tab) {
    _state.tab = tab;
    const buttons = {
      tasks: _state.container.querySelector('#gcTabTasks'),
      files: _state.container.querySelector('#gcTabFiles'),
      boletas: _state.container.querySelector('#gcTabBoletas')
    };
    Object.entries(buttons).forEach(([key, btn]) => {
      if (!btn) return;
      if (key === tab) {
        btn.className = 'px-4 py-1.5 rounded-xl text-xs font-black bg-indigo-600 text-white shadow-sm transition-all';
      } else {
        btn.className = 'px-4 py-1.5 rounded-xl text-xs font-black text-slate-500 transition-all';
      }
    });
  },

  async _getPeriodStatus(classroomId) {
    try {
      const { data } = await supabase.rpc('get_active_period', { p_classroom_id: classroomId });
      if (!data) return { open: true, period: null };
      return { open: data.status === 'open', period: data };
    } catch (_) {
      return { open: true, period: null };
    }
  },

  async _loadGradebook() {
    const content = _state.container.querySelector('#gcContent');
    if (!content || !_state.selClassroomId) return;

    content.innerHTML = '<div class="p-8 text-center"><div class="inline-block w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div><p class="mt-3 text-sm text-slate-400 font-medium">Cargando calificaciones...</p></div>';

    _state.periodInfo = await this._getPeriodStatus(_state.selClassroomId);
    this._renderPeriodBadge();
    this._renderLockBanner();

    const [{ data: students }, taskQuery] = await Promise.all([
      supabase.from('students').select('id, name, matricula')
        .eq('classroom_id', _state.selClassroomId)
        .eq('is_active', true)
        .order('name'),
      this._buildTaskQuery()
    ]);

    _state.students = students || [];
    const { data: tasks } = await taskQuery;
    _state.tasks = tasks || [];

    _state.evidenceMap = {};
    if (_state.students.length && _state.tasks.length) {
      const studentIds = _state.students.map(s => s.id);
      const taskIds = _state.tasks.map(t => t.id);
      const { data: evidences } = await supabase
        .from('task_evidences')
        .select('student_id, task_id, numeric_score, grade_letter, stars, status, file_url, comment, created_at')
        .in('student_id', studentIds)
        .in('task_id', taskIds);
      (evidences || []).forEach(e => {
        _state.evidenceMap[`${e.student_id}_${e.task_id}`] = e;
      });
    }

    this._renderGradebook();
  },

  _buildTaskQuery() {
    let q = supabase
      .from('tasks').select('id, title, due_date, created_at, grading_system')
      .eq('classroom_id', _state.selClassroomId)
      .order('created_at', { ascending: false })
      .limit(30);

    if (_state.periodInfo?.period?.start_date && _state.periodInfo?.period?.end_date) {
      q = q
        .gte('created_at', _state.periodInfo.period.start_date)
        .lte('created_at', _state.periodInfo.period.end_date + 'T23:59:59');
    }
    return q;
  },

  _renderPeriodBadge() {
    const el = _state.container.querySelector('#gcPeriodBadge');
    if (!el) return;
    const p = _state.periodInfo;
    if (p?.period) {
      const isOpen = p.open;
      el.innerHTML = `<span class="px-3 py-1.5 rounded-full text-[10px] font-black uppercase ${isOpen ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">${esc(p.period.name)} ${isOpen ? '🟢 Abierto' : '🔒 Cerrado'}</span>`;
    } else {
      el.innerHTML = '<span class="px-3 py-1.5 rounded-full text-[10px] font-black uppercase bg-slate-100 text-slate-500">Sin periodo activo</span>';
    }
  },

  _renderLockBanner() {
    const el = _state.container.querySelector('#gcLockedBanner');
    if (!el) return;
    if (_state.periodInfo && !_state.periodInfo.open) {
      el.innerHTML = `
        <div class="p-3 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-3 mb-4">
          <span class="text-xl">🔒</span>
          <div>
            <p class="text-xs font-black text-amber-800 uppercase tracking-wide">Período cerrado</p>
            <p class="text-[10px] text-amber-600 font-medium">Las calificaciones están bloqueadas.</p>
          </div>
        </div>`;
      el.classList.remove('hidden');
    } else {
      el.innerHTML = '';
      el.classList.add('hidden');
    }
  },

  _renderGradebook() {
    const content = _state.container.querySelector('#gcContent');
    if (!content) return;

    if (!_state.students.length) {
      content.innerHTML = this._emptyState('No hay alumnos en esta aula', '👨‍🎓');
      return;
    }
    if (!_state.tasks.length) {
      content.innerHTML = this._emptyState('No hay tareas recientes para este periodo.', '📝');
      return;
    }

    const locked = _state.periodInfo && !_state.periodInfo.open;

    const taskHeaders = _state.tasks.map(t => `
      <th class="px-2 py-3 text-center min-w-[110px]">
        <div class="text-[10px] font-black text-slate-700 leading-tight">${esc(t.title)}</div>
        <div class="text-[8px] text-slate-400 font-bold mt-0.5">${t.due_date ? new Date(t.due_date).toLocaleDateString('es-DO', { day: '2-digit', month: 'short' }) : ''}</div>
      </th>
    `).join('');

    const rows = _state.students.map(s => {
      const cells = _state.tasks.map(t => {
        const ev = _state.evidenceMap[`${s.id}_${t.id}`];
        const val = ev?.numeric_score ?? '';
        const statusIcon = ev?.status === 'graded' ? '✅' : (ev ? '📤' : '⬜');
        const fileBtn = ev?.file_url
          ? `<button data-url="${esc(ev.file_url)}" class="gc-file-link mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-sky-50 text-sky-600 text-[8px] font-black hover:bg-sky-100 transition-colors" title="Ver archivo del padre"><i data-lucide="paperclip" class="w-2.5 h-2.5"></i> Archivo</button>`
          : '';

        return `
          <td class="px-2 py-2 text-center">
            <div class="flex flex-col items-center gap-1">
              <input type="number" min="0" max="100"
                data-student="${s.id}" data-task="${t.id}"
                value="${val}"
                ${locked ? 'disabled' : ''}
                class="gc-grade-input w-16 px-2 py-1.5 text-center text-sm font-bold border-2 border-slate-200 rounded-xl outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all ${locked ? 'bg-slate-50 text-slate-400 cursor-not-allowed' : 'bg-white text-slate-800 hover:border-slate-300'}"
                placeholder="—">
              <span class="text-[8px] flex items-center gap-1">${statusIcon}${fileBtn}</span>
            </div>
          </td>
        `;
      }).join('');

      return `
        <tr class="border-b border-slate-50 hover:bg-indigo-50/30 transition-colors">
          <td class="px-4 py-3 sticky left-0 bg-white z-10">
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center font-black text-xs">${esc(s.name).charAt(0)}</div>
              <div>
                <div class="font-black text-slate-800 text-xs">${esc(s.name)}</div>
                <div class="text-[9px] text-slate-400 font-bold">${esc(s.matricula || '')}</div>
              </div>
            </div>
          </td>
          ${cells}
        </tr>
      `;
    }).join('');

    content.innerHTML = `
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-slate-50 border-b border-slate-200 sticky top-0 z-20">
            <tr>
              <th class="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider sticky left-0 bg-slate-50 z-30">Alumno</th>
              ${taskHeaders}
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-50">${rows}</tbody>
        </table>
      </div>
      ${locked ? '' : `
      <div class="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
        <p class="text-[10px] text-slate-400 font-bold">Los cambios se guardan automáticamente al modificar una nota</p>
        <button id="gcSaveAll" class="px-6 py-2.5 bg-indigo-600 text-white rounded-2xl font-black text-xs hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200">
          <i data-lucide="save" class="w-3.5 h-3.5 inline mr-1"></i> Guardar Todo
        </button>
      </div>`}
    `;

    if (window.lucide) lucide.createIcons();
  },

  async _onGradeChange(input) {
    const studentId = parseInt(input.dataset.student);
    const taskId = parseInt(input.dataset.task);
    let val = parseFloat(input.value);
    if (isNaN(val) || val < 0) { val = null; }
    if (val !== null && val > 100) { val = 100; input.value = 100; }

    input.classList.remove('border-slate-200', 'border-red-400', 'border-emerald-400');
    if (val === null) {
      input.classList.add('border-slate-200');
    } else if (val < 50) {
      input.classList.add('border-red-400');
    } else {
      input.classList.add('border-emerald-400');
    }

    if (val === null) return;
    await this._saveCell(studentId, taskId, val);
  },

  async _saveCell(studentId, taskId, val) {
    const key = `${studentId}_${taskId}`;
    try {
      const existing = _state.evidenceMap[key];
      const updates = { numeric_score: val, status: 'graded' };
      if (existing?.id) {
        await supabase.from('task_evidences').update(updates).eq('id', existing.id);
      } else {
        const { data, error } = await supabase.from('task_evidences')
          .insert({ task_id: taskId, student_id: studentId, ...updates })
          .select('id, student_id, task_id, numeric_score, status, file_url')
          .maybeSingle();
        if (error) throw error;
        if (data) _state.evidenceMap[key] = data;
      }
    } catch (err) {
      Helpers.toast(err?.message || 'Error al guardar la calificación', 'error');
    }
  },

  async _saveAll() {
    const inputs = _state.container.querySelectorAll('.gc-grade-input');
    const saves = [];
    inputs.forEach(input => {
      const studentId = parseInt(input.dataset.student);
      const taskId = parseInt(input.dataset.task);
      let val = parseFloat(input.value);
      if (isNaN(val)) return;
      saves.push(this._saveCell(studentId, taskId, Math.min(100, Math.max(0, val))));
    });
    if (!saves.length) return Helpers.toast('No hay notas para guardar', 'info');
    try {
      await Promise.all(saves);
      Helpers.toast(`${saves.length} calificacione(s) guardada(s)`, 'success');
      await this._loadGradebook();
    } catch (err) {
      Helpers.toast('Error al guardar: ' + (err.message || ''), 'error');
    }
  },

  /* ── TAB: ARCHIVOS DEL PADRE ─────────────────────────────── */
  _renderFilesTab() {
    const content = _state.container.querySelector('#gcContent');
    if (!content) return;

    // Todos los alumnos del aula con archivos en sus tareas
    const filesByStudent = {};
    _state.students.forEach(s => { filesByStudent[s.id] = { student: s, items: [] }; });
    Object.entries(_state.evidenceMap).forEach(([key, ev]) => {
      if (!ev.file_url) return;
      const [sid] = key.split('_');
      const task = _state.tasks.find(t => String(t.id) === String(ev.task_id));
      if (filesByStudent[sid]) {
        filesByStudent[sid].items.push({ ev, task });
      }
    });

    const studentsWithFiles = Object.values(filesByStudent).filter(s => s.items.length);
    if (!studentsWithFiles.length) {
      content.innerHTML = this._emptyState('Aún no hay tareas con archivos del padre en este periodo.', '📁');
      return;
    }

    content.innerHTML = `
      <div class="space-y-4">
        ${studentsWithFiles.map(s => `
          <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div class="px-4 py-2.5 bg-indigo-50/60 border-b border-indigo-100 flex items-center gap-3">
              <div class="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center font-black text-xs">${esc(s.student.name).charAt(0)}</div>
              <div>
                <div class="font-black text-slate-800 text-xs">${esc(s.student.name)}</div>
                <div class="text-[9px] text-slate-400 font-bold">${esc(s.student.matricula || '')}</div>
              </div>
              <span class="ml-auto px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-600 text-[9px] font-black uppercase">${s.items.length} archivo(s)</span>
            </div>
            <div class="divide-y divide-slate-50">
              ${s.items.map(({ ev, task }) => `
                <div class="px-4 py-3 flex items-center gap-3">
                  <div class="flex-1 min-w-0">
                    <div class="text-xs font-black text-slate-700 truncate">${esc(task?.title || 'Tarea')}</div>
                    <div class="text-[10px] text-slate-400 font-medium truncate">
                      ${task?.due_date ? `Vence ${new Date(task.due_date).toLocaleDateString('es-DO', { day: '2-digit', month: 'short' })} · ` : ''}
                      ${ev.comment ? `Comentario: ${esc(ev.comment)}` : 'Sin comentario'}
                    </div>
                  </div>
                  ${ev.numeric_score != null ? `<span class="px-2 py-1 rounded-lg text-[10px] font-black ${ev.numeric_score >= 60 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}">${ev.numeric_score}/100</span>` : ''}
                  <a href="${esc(ev.file_url)}" target="_blank" rel="noopener"
                    class="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-sky-50 text-sky-600 text-[11px] font-black hover:bg-sky-100 transition-colors">
                    <i data-lucide="paperclip" class="w-3.5 h-3.5"></i> Ver archivo
                  </a>
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
      <div class="mt-4 text-[10px] text-slate-400 font-bold">Archivos subidos por el padre en tareas de este período, listos para revisión.</div>
    `;
    if (window.lucide) lucide.createIcons();
  },

  /* ── TAB: BOLETAS ───────────────────────────────────────── */
  async _renderBoletasTab() {
    const content = _state.container.querySelector('#gcContent');
    if (!content) return;

    if (!_state.evaluations.length) {
      const { data } = await supabase
        .from('eval_evaluations').select('id, name')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      _state.evaluations = data || [];
    }
    if (!_state.evaluations.length) {
      content.innerHTML = this._emptyState('No hay evaluaciones configuradas. Crea la estructura desde el Constructor.', '🧩');
      return;
    }
    if (!_state.selEvalId || !_state.evaluations.find(e => e.id === _state.selEvalId)) {
      _state.selEvalId = _state.evaluations[0].id;
    }

    const evalOpts = _state.evaluations.map(e =>
      `<option value="${e.id}" ${e.id === _state.selEvalId ? 'selected' : ''}>${esc(e.name)}</option>`
    ).join('');

    content.innerHTML = `
      <div class="p-4 md:p-5">
        <div class="flex flex-wrap items-center gap-3 mb-4">
          <div>
            <h4 class="text-sm font-black text-slate-800 flex items-center gap-2">
              <span class="p-1.5 rounded-xl text-white" style="background:linear-gradient(135deg,#F97316,#FB923C)"><i data-lucide="file-text" class="w-4 h-4"></i></span>
              Boletas de Calificaciones
            </h4>
            <p class="text-[11px] text-slate-400 mt-0.5">Genera, imprime o descarga en PDF la boleta de cada estudiante del aula.</p>
          </div>
          <div class="ml-auto flex items-center gap-2">
            <label class="text-[10px] font-black text-slate-500 uppercase tracking-wider">Evaluación</label>
            <select id="gcEvalSel" class="px-3 py-2 border-2 border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-[#F97316] bg-white">${evalOpts}</select>
          </div>
        </div>
        <div id="gcBoletasBody"></div>
      </div>`;

    content.querySelector('#gcEvalSel')?.addEventListener('change', async (e) => {
      _state.selEvalId = Number(e.target.value);
      this._renderBoletasTab();
    });

    if (window.lucide) lucide.createIcons();
    await BoletaUI.init({
      container: document.getElementById('gcBoletasBody'),
      evaluationId: _state.selEvalId,
      classroomId: _state.selClassroomId,
      onClose: null
    });
  },

  _emptyState(msg, icon) {
    return `
      <div class="p-12 text-center">
        <div class="w-20 h-20 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">${icon}</div>
        <h3 class="text-lg font-black text-slate-800 mb-2">${msg}</h3>
      </div>`;
  }
};

window.GradesCenter = GradesCenter;
