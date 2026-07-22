/**
 * Teacher Grade Center — Gradebook + Formal Grades
 * Replaces the "Proximamente" placeholder.
 * Shows per-classroom grid: students × tasks with numeric score inputs (0-100).
 * Also allows entering formal exam grades per subject.
 */
import { supabase } from '../../shared/supabase.js';
import { Helpers } from '../../shared/helpers.js';
import { MaestraApi } from '../api.js';

const SUBJECTS = [
  'Matemáticas', 'Español', 'Ciencias', 'Sociales', 'Inglés',
  'Educación Física', 'Arte', 'Música', 'Religión', 'Tecnología'
];

let _currentClassroomId = null;
let _periodInfo = null;
let _students = [];
let _tasks = [];
let _evidenceMap = {};  // { studentId_taskId: { numeric_score, ... } }
let _formalGrades = {}; // { studentId_subject: { id, numeric_score } }

function esc(s) { return Helpers.escapeHTML(String(s || '')); }

// ── INIT ─────────────────────────────────────────────────────────────
export async function initGradesCenter() {
  const container = document.getElementById('t-grades-inner');
  if (!container) return;

  // Get teacher's classrooms
  const { data: profile } = await supabase
    .from('profiles').select('id').eq('id', supabase.auth.getUser()?.data?.user?.id).maybeSingle();

  const { data: classrooms } = await supabase
    .from('classrooms').select('id, name, level')
    .eq('teacher_id', profile?.id)
    .eq('is_active', true);

  if (!classrooms?.length) {
    container.innerHTML = _emptyState('No tienes aulas asignadas', '🏫');
    return;
  }

  _currentClassroomId = classrooms[0].id;
  container.innerHTML = _buildLayout(classrooms);
  _bindEvents();

  await _loadGradebook();
}

function _buildLayout(classrooms) {
  const classOpts = classrooms.map(c =>
    `<option value="${c.id}">${esc(c.name)} (${esc(c.level || '')})</option>`
  ).join('');

  return `
    <header class="mb-6">
      <h1 class="text-2xl md:text-3xl font-black text-slate-800 flex items-center gap-3">
        <span class="p-2 bg-indigo-100 text-indigo-600 rounded-2xl"><i data-lucide="graduation-cap" class="w-6 h-6"></i></span>
        Centro de Calificaciones
      </h1>
      <p class="text-slate-500 font-medium">Califica tareas y exámenes formales de tus alumnos</p>
    </header>

    <!-- Toolbar -->
    <div class="flex flex-wrap items-center gap-3 mb-6">
      <select id="tGradeClassroom" class="px-4 py-2.5 border-2 border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-indigo-500 bg-white">${classOpts}</select>

      <!-- Tab toggle: Tasks vs Formal -->
      <div class="flex bg-slate-100 rounded-2xl p-1 ml-2">
        <button id="tGradeTabTasks" class="px-4 py-1.5 rounded-xl text-xs font-black bg-indigo-600 text-white shadow-sm transition-all">Tareas</button>
        <button id="tGradeTabFormal" class="px-4 py-1.5 rounded-xl text-xs font-black text-slate-500 transition-all">Exámenes Formales</button>
      </div>

      <div id="tGradePeriodBadge" class="ml-auto"></div>
    </div>

    <!-- Period lock banner -->
    <div id="tGradeLockedBanner" class="hidden mb-4"></div>

    <!-- Content area -->
    <div id="tGradeContent" class="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
      <div class="p-8 text-center text-slate-400 font-medium">Cargando...</div>
    </div>
  `;
}

function _bindEvents() {
  document.getElementById('tGradeClassroom')?.addEventListener('change', (e) => {
    _currentClassroomId = parseInt(e.target.value);
    _loadGradebook();
  });

  document.getElementById('tGradeTabTasks')?.addEventListener('click', () => {
    _setTab('tasks');
    _loadGradebook();
  });

  document.getElementById('tGradeTabFormal')?.addEventListener('click', () => {
    _setTab('formal');
    _loadFormalGrades();
  });
}

function _setTab(tab) {
  const tabTasks = document.getElementById('tGradeTabTasks');
  const tabFormal = document.getElementById('tGradeTabFormal');
  if (!tabTasks || !tabFormal) return;
  if (tab === 'tasks') {
    tabTasks.className = tabTasks.className.replace('text-slate-500', 'bg-indigo-600 text-white shadow-sm');
    tabFormal.className = tabFormal.className.replace('bg-indigo-600 text-white shadow-sm', 'text-slate-500');
  } else {
    tabFormal.className = tabFormal.className.replace('text-slate-500', 'bg-indigo-600 text-white shadow-sm');
    tabTasks.className = tabTasks.className.replace('bg-indigo-600 text-white shadow-sm', 'text-slate-500');
  }
}

// ── TASK GRADEBOOK ───────────────────────────────────────────────────
async function _loadGradebook() {
  if (!_currentClassroomId) return;
  const content = document.getElementById('tGradeContent');
  if (!content) return;

  content.innerHTML = '<div class="p-8 text-center"><div class="inline-block w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div><p class="mt-3 text-sm text-slate-400 font-medium">Cargando calificaciones...</p></div>';

  // Check period status
  _periodInfo = await _getPeriodStatus(_currentClassroomId);
  _renderPeriodBadge();
  _renderLockBanner();

  // Load students
  const { data: students } = await supabase
    .from('students').select('id, name, matricula')
    .eq('classroom_id', _currentClassroomId)
    .eq('is_active', true)
    .order('name');

  _students = students || [];

  // Load tasks for this classroom (recent, within period dates or all if no period)
  let taskQuery = supabase
    .from('tasks').select('id, title, due_date, created_at, grading_system')
    .eq('classroom_id', _currentClassroomId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (_periodInfo?.period?.start_date && _periodInfo?.period?.end_date) {
    taskQuery = taskQuery
      .gte('created_at', _periodInfo.period.start_date)
      .lte('created_at', _periodInfo.period.end_date + 'T23:59:59');
  }

  const { data: tasks } = await taskQuery;
  _tasks = tasks || [];

  // Load all graded evidences for these students + tasks
  _evidenceMap = {};
  if (_students.length && _tasks.length) {
    const studentIds = _students.map(s => s.id);
    const taskIds = _tasks.map(t => t.id);

    const { data: evidences } = await supabase
      .from('task_evidences')
      .select('student_id, task_id, numeric_score, grade_letter, stars, status')
      .in('student_id', studentIds)
      .in('task_id', taskIds);

    (evidences || []).forEach(e => {
      _evidenceMap[`${e.student_id}_${e.task_id}`] = e;
    });
  }

  _renderGradebook();
}

function _renderGradebook() {
  const content = document.getElementById('tGradeContent');
  if (!content) return;

  if (!_students.length) {
    content.innerHTML = _emptyState('No hay alumnos en esta aula', '👨‍🎓');
    return;
  }
  if (!_tasks.length) {
    content.innerHTML = _emptyState('No hay tareas recientes para este periodo. Crea tareas en la sección de Tareas.', '📝');
    return;
  }

  const locked = _periodInfo && !_periodInfo.open;

  // Table: rows = students, columns = tasks
  const taskHeaders = _tasks.map(t => `
    <th class="px-3 py-3 text-center min-w-[90px]">
      <div class="text-[10px] font-black text-slate-700 leading-tight">${esc(t.title)}</div>
      <div class="text-[8px] text-slate-400 font-bold mt-0.5">${t.due_date ? new Date(t.due_date).toLocaleDateString('es-DO', { day: '2-digit', month: 'short' }) : ''}</div>
    </th>
  `).join('');

  const rows = _students.map(s => {
    const cells = _tasks.map(t => {
      const ev = _evidenceMap[`${s.id}_${t.id}`];
      const val = ev?.numeric_score ?? '';
      const statusIcon = ev?.status === 'graded' ? '✅' : (ev ? '📤' : '⬜');

      return `
        <td class="px-2 py-2 text-center">
          <div class="flex flex-col items-center gap-1">
            <input type="number" min="0" max="100"
              data-student="${s.id}" data-task="${t.id}"
              value="${val}"
              ${locked ? 'disabled' : ''}
              class="t-grade-input w-16 px-2 py-1.5 text-center text-sm font-bold border-2 border-slate-200 rounded-xl outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all ${locked ? 'bg-slate-50 text-slate-400 cursor-not-allowed' : 'bg-white text-slate-800 hover:border-slate-300'}"
              placeholder="—">
            <span class="text-[8px]">${statusIcon}</span>
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
      <button onclick="MaestraGrades.saveAll()" class="px-6 py-2.5 bg-indigo-600 text-white rounded-2xl font-black text-xs hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200">
        <i data-lucide="save" class="w-3.5 h-3.5 inline mr-1"></i> Guardar Todo
      </button>
    </div>`}
  `;

  if (window.lucide) lucide.createIcons();

  // Bind auto-save on input change
  if (!locked) {
    content.querySelectorAll('.t-grade-input').forEach(input => {
      input.addEventListener('change', _onGradeChange);
    });
  }
}

async function _onGradeChange(e) {
  const studentId = parseInt(e.target.dataset.student);
  const taskId = parseInt(e.target.dataset.task);
  let val = parseFloat(e.target.value);

  if (isNaN(val) || val < 0) { val = null; }
  if (val !== null && val > 100) { val = 100; e.target.value = 100; }

  // Visual feedback
  e.target.classList.remove('border-slate-200', 'border-red-400', 'border-emerald-400');
  if (val === null) {
    e.target.classList.add('border-slate-200');
  } else if (val < 50) {
    e.target.classList.add('border-red-400');
  } else {
    e.target.classList.add('border-emerald-400');
  }
}

// Save all grades
async function saveAll() {
  const inputs = document.querySelectorAll('.t-grade-input');
  const saves = [];

  inputs.forEach(input => {
    const studentId = parseInt(input.dataset.student);
    const taskId = parseInt(input.dataset.task);
    let val = parseFloat(input.value);
    if (isNaN(val)) return;

    saves.push(
      MaestraApi.gradeTask(taskId, studentId, null, null, null, val)
    );
  });

  if (!saves.length) return Helpers.toast('No hay notas para guardar', 'info');

  try {
    await Promise.all(saves);
    Helpers.toast(`${saves.length} calificacione(s) guardada(s)`, 'success');
    // Re-mark all as saved
    inputs.forEach(i => { i.classList.remove('border-emerald-400'); });
  } catch (err) {
    Helpers.toast('Error al guardar: ' + (err.message || ''), 'error');
  }
}

// ── FORMAL GRADES ────────────────────────────────────────────────────
async function _loadFormalGrades() {
  if (!_currentClassroomId) return;
  const content = document.getElementById('tGradeContent');
  if (!content) return;

  _periodInfo = await _getPeriodStatus(_currentClassroomId);
  _renderPeriodBadge();
  _renderLockBanner();

  // Load students
  const { data: students } = await supabase
    .from('students').select('id, name, matricula')
    .eq('classroom_id', _currentClassroomId)
    .eq('is_active', true)
    .order('name');

  _students = students || [];

  // Load existing formal grades for this period
  _formalGrades = {};
  if (_students.length && _periodInfo?.period?.id) {
    const { data: grades } = await supabase
      .from('grades')
      .select('id, student_id, subject, numeric_score')
      .eq('classroom_id', _currentClassroomId)
      .eq('period_id', _periodInfo.period.id);

    (grades || []).forEach(g => {
      _formalGrades[`${g.student_id}_${g.subject}`] = g;
    });
  }

  _renderFormalGrades();
}

function _renderFormalGrades() {
  const content = document.getElementById('tGradeContent');
  if (!content) return;

  if (!_students.length) {
    content.innerHTML = _emptyState('No hay alumnos en esta aula', '👨‍🎓');
    return;
  }

  const locked = _periodInfo && !_periodInfo.open;
  const periodId = _periodInfo?.period?.id;

  const rows = _students.map(s => {
    const subjectInputs = SUBJECTS.map(sub => {
      const key = `${s.id}_${sub}`;
      const existing = _formalGrades[key];
      const val = existing?.numeric_score ?? '';

      return `
        <td class="px-2 py-2 text-center">
          <input type="number" min="0" max="100"
            data-student="${s.id}" data-subject="${sub}" data-grade-id="${existing?.id || ''}" data-period="${periodId || ''}"
            value="${val}"
            ${locked ? 'disabled' : ''}
            class="t-formal-input w-16 px-2 py-1.5 text-center text-xs font-bold border-2 border-slate-200 rounded-xl outline-none focus:border-indigo-500 transition-all ${locked ? 'bg-slate-50 text-slate-400 cursor-not-allowed' : 'bg-white text-slate-800'}"
            placeholder="—">
        </td>
      `;
    }).join('');

    return `
      <tr class="border-b border-slate-50 hover:bg-indigo-50/30 transition-colors">
        <td class="px-4 py-3 sticky left-0 bg-white z-10">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center font-black text-xs">${esc(s.name).charAt(0)}</div>
            <div class="font-black text-slate-800 text-xs">${esc(s.name)}</div>
          </div>
        </td>
        ${subjectInputs}
      </tr>
    `;
  }).join('');

  content.innerHTML = `
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-slate-50 border-b border-slate-200 sticky top-0 z-20">
          <tr>
            <th class="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider sticky left-0 bg-slate-50 z-30">Alumno</th>
            ${SUBJECTS.map(sub => `<th class="px-2 py-3 text-center text-[9px] font-black text-slate-500 uppercase tracking-wider min-w-[70px]">${sub}</th>`).join('')}
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-50">${rows}</tbody>
      </table>
    </div>
    ${locked ? '' : `
    <div class="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
      <p class="text-[10px] text-slate-400 font-bold">Notas formales por materia (0-100)</p>
      <button onclick="MaestraGrades.saveFormal()" class="px-6 py-2.5 bg-indigo-600 text-white rounded-2xl font-black text-xs hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200">
        <i data-lucide="save" class="w-3.5 h-3.5 inline mr-1"></i> Guardar Formales
      </button>
    </div>`}
  `;

  if (window.lucide) lucide.createIcons();
}

async function saveFormal() {
  const inputs = document.querySelectorAll('.t-formal-input');
  const saves = [];

  inputs.forEach(input => {
    const studentId = parseInt(input.dataset.student);
    const subject = input.dataset.subject;
    const gradeId = input.dataset.gradeId || null;
    const periodId = input.dataset.period ? parseInt(input.dataset.period) : null;
    let val = parseFloat(input.value);
    if (isNaN(val)) return;

    const payload = {
      student_id: studentId,
      classroom_id: _currentClassroomId,
      period_id: periodId,
      school_year_id: _periodInfo?.period?.school_year_id || null,
      subject,
      numeric_score: Math.min(100, Math.max(0, val)),
      teacher_id: supabase.auth.getUser()?.data?.user?.id,
    };

    if (gradeId) {
      saves.push(supabase.from('grades').update({ numeric_score: payload.numeric_score }).eq('id', gradeId));
    } else {
      saves.push(supabase.from('grades').insert(payload));
    }
  });

  if (!saves.length) return Helpers.toast('No hay notas para guardar', 'info');

  try {
    await Promise.all(saves);
    Helpers.toast(`${saves.length} nota(s) formal(es) guardada(s)`, 'success');
  } catch (err) {
    Helpers.toast('Error al guardar: ' + (err.message || ''), 'error');
  }
}

// ── HELPERS ──────────────────────────────────────────────────────────
async function _getPeriodStatus(classroomId) {
  try {
    const { data } = await supabase.rpc('get_active_period', { p_classroom_id: classroomId });
    if (!data) return { open: true, period: null };
    return { open: data.status === 'open', period: data };
  } catch (_) {
    return { open: true, period: null };
  }
}

function _renderPeriodBadge() {
  const el = document.getElementById('tGradePeriodBadge');
  if (!el) return;
  if (_periodInfo?.period) {
    const isOpen = _periodInfo.open;
    el.innerHTML = `<span class="px-3 py-1.5 rounded-full text-[10px] font-black uppercase ${isOpen ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">${esc(_periodInfo.period.name)} ${isOpen ? '🟢 Abierto' : '🔒 Cerrado'}</span>`;
  } else {
    el.innerHTML = '<span class="px-3 py-1.5 rounded-full text-[10px] font-black uppercase bg-slate-100 text-slate-500">Sin periodo activo</span>';
  }
}

function _renderLockBanner() {
  const el = document.getElementById('tGradeLockedBanner');
  if (!el) return;
  if (_periodInfo && !_periodInfo.open) {
    el.innerHTML = `
      <div class="p-3 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-3 mb-4">
        <span class="text-xl">🔒</span>
        <div>
          <p class="text-xs font-black text-amber-800 uppercase tracking-wide">Período cerrado</p>
          <p class="text-[10px] text-amber-600 font-medium">Las calificaciones están bloqueadas. Solo la directora puede reabrirlo.</p>
        </div>
      </div>`;
    el.classList.remove('hidden');
  } else {
    el.innerHTML = '';
    el.classList.add('hidden');
  }
}

function _emptyState(msg, icon) {
  return `
    <div class="p-12 text-center">
      <div class="w-20 h-20 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">${icon}</div>
      <h3 class="text-lg font-black text-slate-800 mb-2">${msg}</h3>
    </div>`;
}

// ── PUBLIC API ───────────────────────────────────────────────────────
export const MaestraGrades = {
  init: initGradesCenter,
  saveAll,
  saveFormal,
};
