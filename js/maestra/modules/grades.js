/**
 * Teacher Grade Center — Boletín Inteligente + Gradebook + Activities.
 * Replaces the "Proximamente" placeholder.
 * Student list opens the shared grade grid (GradebookGrid) per student,
 * editable (Nota + Comentario), with Ver Boletín / Descargar PDF; a
 * task gradebook grid (0-100) and an activities tab feed the report card.
 */
import { supabase } from '../../shared/supabase.js';
import { Helpers } from '../../shared/helpers.js';
import { MaestraApi } from '../api.js';
import { Modal } from './ui.js';
import {
  renderEvalInput, readEvalInputs, initEvalControls,
  buildScoresMap, normalizeScore,
  gradeColor, gradeToLevel, avgOf, moduleAvg
} from '../../shared/eval-utils.js';
import { GradebookGrid } from '../../shared/gradebook-grid.module.js';

const ACTIVITY_TYPES = [
  { value: 'actividad',  label: 'Actividad',    icon: 'sparkles' },
  { value: 'evaluacion', label: 'Evaluación',   icon: 'clipboard-check' },
  { value: 'trabajo',    label: 'Trabajo',      icon: 'briefcase' },
  { value: 'proyecto',   label: 'Proyecto',     icon: 'folder-open' },
  { value: 'otro',       label: 'Otro',         icon: 'plus-circle' }
];
const ACTIVITY_TYPE_COLORS = {
  actividad:  { bg: '#E8FFF0', color: '#1A8035' },
  evaluacion: { bg: '#EFF6FF', color: '#1D4ED8' },
  trabajo:    { bg: '#FFF7ED', color: '#C2410C' },
  proyecto:   { bg: '#F5F3FF', color: '#6D28D9' },
  otro:       { bg: '#F1F5F9', color: '#475569' }
};

const GREEN = '#28B54D';
const GREEN_DARK = '#1A8035';
const ORANGE = '#FF8A00';
const ORANGE_DARK = '#D96500';
const VIOLET = '#A855F7';
const VIOLET_DARK = '#7E22CE';

let _currentClassroomId = null;
let _currentClassroom = null;
let _classrooms = [];
let _periodInfo = null;
let _students = [];
let _tasks = [];
let _evidenceMap = {};  // { studentId_taskId: { numeric_score, ... } }
let _boletinOpen = false;
let _tab = 'boletines';

// Estado de la pestaña "Actividades" (Módulo 2/3/4 del diseño)
let _evals = [];
let _curEvalId = null;
let _evalAreas = [];
let _evalPeriods = [];
let _evalModules = [];
let _evalActivities = [];
let _evalScoresMap = {};
let _actEvalId = null;
let _actPeriodId = null;
let _actAreaId = null;
let _actModuleId = null;
let _showAverages = false;
let _activityExtrasSupport = null;

function esc(s) { return Helpers.escapeHTML(String(s || '')); }

// ¿La base soporta los campos enriquecidos de actividad (migración 20260805)?
async function _activityExtrasOk() {
  if (_activityExtrasSupport !== null) return _activityExtrasSupport;
  try {
    const { error } = await supabase.from('eval_activities').select('activity_date').limit(1);
    _activityExtrasSupport = !error;
  } catch (_) { _activityExtrasSupport = false; }
  return _activityExtrasSupport;
}

// ── INIT ─────────────────────────────────────────────────────────────
async function _currentUserId() {
  try {
    const { data } = await supabase.auth.getUser();
    return data?.user?.id || null;
  } catch (_) { return null; }
}

export async function initGradesCenter() {
  const container = document.getElementById('t-grades-inner');
  if (!container) return;

  const uid = await _currentUserId();

  const { data: classrooms } = await supabase
    .from('classrooms').select('id, name, level')
    .eq('teacher_id', uid)
    .is('deleted_at', null);

  if (!classrooms?.length) {
    container.innerHTML = _emptyState('No tienes aulas asignadas', '🏫');
    return;
  }

  _currentClassroomId = classrooms[0].id;
  _currentClassroom = classrooms[0] || null;
  _classrooms = classrooms || [];
  _tab = 'boletines';
  _boletinOpen = false;
  container.innerHTML = _buildLayout(classrooms);
  _bindEvents();

  await _loadEvalBase();
  await _loadBoletines();
}

async function _loadEvalBase() {
  const { data: evals } = await supabase
    .from('eval_evaluations').select('*').is('deleted_at', null)
    .order('created_at', { ascending: false });
  _evals = evals || [];
  if (!_evals.length) return;
  _actEvalId = _evals[0].id;
  try { await supabase.rpc('boletin_ensure_structure', { p_evaluation_id: _actEvalId }); } catch (_) {}
  await _loadEvalChildren();
}

function _buildLayout(classrooms) {
  const classOpts = classrooms.map(c =>
    `<option value="${c.id}">${esc(c.name)} (${esc(c.level || '')})</option>`
  ).join('');

  return `
    <style>
      .t-grade-input:focus {
        outline: none;
        border-color: ${GREEN};
        box-shadow: 0 0 0 3px rgba(40,181,77,0.15);
      }
    </style>
    <header class="mb-6">
      <h1 class="text-2xl md:text-3xl font-black text-slate-800 flex items-center gap-3">
        <span class="p-2 rounded-2xl text-white shadow-lg" style="background:linear-gradient(135deg,${GREEN},${GREEN_DARK})"><i data-lucide="graduation-cap" class="w-6 h-6"></i></span>
        Centro de Calificaciones
      </h1>
      <p class="text-slate-500 font-medium">Genera el boletín de tus estudiantes y califica tareas y actividades</p>
    </header>

    <!-- Toolbar -->
    <div class="bg-white rounded-[2rem] border border-slate-100 shadow-sm px-4 py-3 mb-5">
      <div class="flex flex-wrap items-center gap-3">
        <div class="relative">
          <i data-lucide="school" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"></i>
          <select id="tGradeClassroom" class="pl-9 pr-4 py-2.5 border-2 border-slate-200 rounded-2xl text-sm font-bold outline-none bg-white">${classOpts}</select>
        </div>

        <!-- Tab toggle -->
        <div class="flex bg-slate-100 rounded-2xl p-1 ml-2">
          <button id="tGradeTabBoletines" class="tg-tab px-4 py-1.5 rounded-xl text-xs font-black transition-all" style="background:${ORANGE};color:#fff">Boletines</button>
          <button id="tGradeTabTasks" class="tg-tab px-4 py-1.5 rounded-xl text-xs font-black text-slate-500 transition-all">Tareas</button>
          <button id="tGradeTabActs" class="tg-tab px-4 py-1.5 rounded-xl text-xs font-black text-slate-500 transition-all">Actividades</button>
        </div>

        <div id="tGradePeriodBadge" class="ml-auto"></div>
      </div>
      <div id="tGradeLockedBanner" class="hidden mt-3"></div>
    </div>

    <!-- Content area -->
    <div id="tGradeContent" class="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
      <div class="p-8 text-center text-slate-400 font-medium">Cargando...</div>
    </div>
  `;
}

function _bindEvents() {
  document.getElementById('tGradeClassroom')?.addEventListener('change', (e) => {
    _currentClassroomId = parseInt(e.target.value);
    _currentClassroom = _classrooms.find(c => c.id === _currentClassroomId) || null;
    _boletinOpen = false;
    _loadBoletines();
  });

  document.getElementById('tGradeTabBoletines')?.addEventListener('click', () => {
    _setTab('boletines');
    _loadBoletines();
  });

  document.getElementById('tGradeTabTasks')?.addEventListener('click', () => {
    _setTab('tasks');
    _loadGradebook();
  });

  document.getElementById('tGradeTabActs')?.addEventListener('click', () => {
    _setTab('acts');
    _loadActivities();
  });
}

function _setTab(tab) {
  _tab = tab;
  _boletinOpen = false;
  const map = {
    boletines: { btn: 'tGradeTabBoletines', bg: ORANGE, name: 'Boletines' },
    tasks:     { btn: 'tGradeTabTasks',    bg: GREEN,  name: 'Tareas' },
    acts:      { btn: 'tGradeTabActs',     bg: VIOLET, name: 'Actividades' }
  };
  Object.keys(map).forEach(k => {
    const btn = document.getElementById(map[k].btn);
    if (!btn) return;
    if (k === tab) {
      btn.style.background = map[k].bg;
      btn.style.color = '#fff';
    } else {
      btn.style.background = '';
      btn.style.color = '';
      btn.className = 'tg-tab px-4 py-1.5 rounded-xl text-xs font-black text-slate-500 transition-all';
    }
  });
}

// ── TASK GRADEBOOK ───────────────────────────────────────────────────
async function _loadGradebook() {
  if (!_currentClassroomId) return;
  const content = document.getElementById('tGradeContent');
  if (!content) return;

  content.innerHTML = '<div class="p-8 text-center"><div class="inline-block w-8 h-8 border-4 border-green-400 border-t-transparent rounded-full animate-spin"></div><p class="mt-3 text-sm text-slate-400 font-medium">Cargando calificaciones...</p></div>';

  // Check period status
  _periodInfo = await _getPeriodStatus(_currentClassroomId);
  _renderPeriodBadge();
  _renderLockBanner();

  // Load students
  await _loadStudents();

  // Load tasks for this classroom (recent, within period dates or all if no period)
  let taskQuery = supabase
    .from('tasks').select('id, title, due_date, created_at, grading_system, eval_module_id, eval_activity_id')
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
              class="t-grade-input w-16 px-2 py-1.5 text-center text-sm font-bold border-2 border-slate-200 rounded-xl ${locked ? 'bg-slate-50 text-slate-400 cursor-not-allowed' : 'bg-white text-slate-800 hover:border-slate-300'}"
              placeholder="—">
            <span class="text-[8px]">${statusIcon}</span>
          </div>
        </td>
      `;
    }).join('');

    return `
      <tr class="border-b border-slate-50 hover:bg-green-50 transition-colors">
        <td class="px-4 py-3 sticky left-0 bg-white z-10">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-xl font-black text-xs flex items-center justify-center" style="background:#E8FFF0;color:${GREEN_DARK}">${esc(s.name).charAt(0)}</div>
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
        <thead class="border-b border-slate-200 sticky top-0 z-20" style="background:#F0FDF4">
          <tr>
            <th class="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider sticky left-0 z-30" style="background:#F0FDF4">Alumno</th>
            ${taskHeaders}
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-50">${rows}</tbody>
      </table>
    </div>
    ${locked ? '' : `
    <div class="p-4 flex items-center justify-between" style="background:#F8FAFC;border-top:1px solid #f1f5f9">
      <p class="text-[10px] text-slate-400 font-bold">Los cambios se guardan al pulsar Guardar Todo</p>
      <button onclick="MaestraGrades.saveAll()" class="px-6 py-2.5 text-white rounded-2xl font-black text-xs transition-all shadow-lg" style="background:${GREEN};box-shadow:0 4px 14px rgba(40,181,77,0.3)">
        <i data-lucide="save" class="w-3.5 h-3.5 inline mr-1"></i> Guardar Todo
      </button>
    </div>`}
  `;

  if (window.lucide) lucide.createIcons();

  // Bind auto-save visual feedback on input change
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

  // Visual feedback (inline para no depender de clases compiladas)
  e.target.style.borderColor = val === null ? '#E2E8F0' : (val < 50 ? '#F87171' : '#34D399');
}

// Save all grades
async function saveAll() {
  const content = document.getElementById('tGradeContent');
  const inputs = content ? content.querySelectorAll('.t-grade-input') : [];
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
    inputs.forEach(i => { i.style.borderColor = '#E2E8F0'; });
    // Doble escritura: replicar en eval_scores las tareas vinculadas al boletín
    await _syncEvalScoresFromTasks();
  } catch (err) {
    Helpers.toast('Error al guardar: ' + (err.message || ''), 'error');
  }
}

// Replica las notas del gradebook en eval_scores para tareas vinculadas.
async function _syncEvalScoresFromTasks() {
  const linked = _tasks.filter(t => t.eval_module_id && t.eval_activity_id);
  if (!linked.length || !_students.length) return;
  const studentIds = _students.map(s => s.id);
  const taskIds = linked.map(t => t.id);

  const { data: evidences } = await supabase
    .from('task_evidences')
    .select('task_id, student_id, numeric_score')
    .in('task_id', taskIds)
    .in('student_id', studentIds);

  const { data: authData } = await supabase.auth.getUser();
  const uid = authData?.user?.id ?? null;
  const upserts = (evidences || [])
    .filter(e => e.numeric_score != null)
    .map(e => {
      const t = linked.find(x => x.id === e.task_id);
      return {
        module_id: t.eval_module_id,
        activity_id: t.eval_activity_id,
        student_id: e.student_id,
        value: e.numeric_score,
        evaluated_by: uid,
        updated_at: new Date().toISOString()
      };
    });

  if (!upserts.length) return;
  try {
    await supabase.from('eval_scores').upsert(upserts, { onConflict: 'activity_id,student_id' });
  } catch (_) {}
}

// ── BOLETINES (Boletín Inteligente por estudiante) ──────────────────
async function _loadStudents() {
  const { data: students } = await supabase
    .from('students').select('id, name, matricula')
    .eq('classroom_id', _currentClassroomId)
    .eq('is_active', true)
    .order('name');
  _students = students || [];
}

async function _loadBoletines() {
  if (!_currentClassroomId) return;
  const content = document.getElementById('tGradeContent');
  if (!content) return;

  _periodInfo = await _getPeriodStatus(_currentClassroomId);
  _renderPeriodBadge();
  _renderLockBanner();
  await _loadStudents();

  content.innerHTML = '<div class="p-8 text-center"><div class="inline-block w-8 h-8 border-4 border-orange-400 border-t-transparent rounded-full animate-spin"></div><p class="mt-3 text-sm text-slate-400 font-medium">Cargando estudiantes...</p></div>';

  _renderBoletines();
}

function _overallFor(studentId) {
  const areaAvgs = _evalAreas.map(area => {
    const areaMods = _evalModules
      .filter(m => m.area_id === area.id)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const cells = areaMods.map(m =>
      moduleAvg(m, _evalActivities.filter(a => a.module_id === m.id), studentId, _evalScoresMap)
    );
    return avgOf(cells);
  });
  const weighted = areaAvgs.reduce((acc, avg, i) => {
    const w = Number(_evalAreas[i]?.weight) || 0;
    if (avg == null || w <= 0) return acc;
    acc.sum += avg * w;
    acc.w += w;
    return acc;
  }, { sum: 0, w: 0 });
  if (weighted.w > 0) return Math.round((weighted.sum / weighted.w) * 100) / 100;
  const evaluated = areaAvgs.filter(a => a != null);
  return evaluated.length ? avgOf(evaluated) : null;
}

function _renderBoletines() {
  const content = document.getElementById('tGradeContent');
  if (!content) return;
  if (!_students.length) {
    content.innerHTML = _emptyState('No hay alumnos en esta aula', '👨‍🎓');
    return;
  }

  const rows = _students.map(st => {
    const avg = _overallFor(st.id);
    const level = avg != null ? gradeToLevel(avg) : null;
    return `
      <tr class="border-b border-slate-50 hover:bg-orange-50/40 transition-colors cursor-pointer" onclick="MaestraGrades.openBoletin(${st.id})">
        <td class="px-4 py-3">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-xl font-black text-xs flex items-center justify-center" style="background:#FFF7ED;color:${ORANGE_DARK}">${esc(st.name).charAt(0)}</div>
            <div>
              <div class="font-black text-slate-800 text-sm">${esc(st.name)}</div>
              <div class="text-[10px] text-slate-400 font-bold uppercase">${esc(st.matricula || '')}</div>
            </div>
          </div>
        </td>
        <td class="px-4 py-3 text-center">
          <span class="font-black text-lg ${avg != null ? gradeColor(avg) : 'text-slate-300'}">${avg != null ? avg.toFixed(1) : '—'}</span>
        </td>
        <td class="px-4 py-3 text-center">
          ${level
            ? `<span class="px-3 py-1 rounded-full text-[10px] font-black uppercase shadow-sm ${level.cls}">${level.label}</span>`
            : '<span class="text-slate-300 font-bold text-xs">Sin evaluar</span>'}
        </td>
        <td class="px-4 py-3 text-center">
          <button onclick="event.stopPropagation();MaestraGrades.openBoletin(${st.id})"
            class="px-3 py-1.5 rounded-xl text-white text-[10px] font-black flex items-center gap-1.5 mx-auto transition-all active:scale-95" style="background:${ORANGE};box-shadow:0 4px 12px rgba(255,138,0,.25)">
            <i data-lucide="table-2" class="w-3.5 h-3.5"></i> Calificaciones
          </button>
        </td>
      </tr>`;
  }).join('');

  content.innerHTML = `
    <div class="p-4 md:p-5">
      <div class="flex items-center justify-between gap-3 mb-4">
        <div>
          <h3 class="text-sm font-black text-slate-800 flex items-center gap-2">
            <span class="p-1.5 rounded-xl text-white" style="background:linear-gradient(135deg,${ORANGE},${ORANGE_DARK})"><i data-lucide="book-open-check" class="w-4 h-4"></i></span>
            Boletín Inteligente
          </h3>
          <p class="text-[11px] text-slate-400 mt-0.5">Selecciona un estudiante para editar sus calificaciones (Áreas × Actividades) y generar su boletín.</p>
        </div>
      </div>
      <div class="overflow-x-auto rounded-2xl border border-slate-200">
        <table class="w-full text-sm">
          <thead class="border-b border-slate-200" style="background:#FFF7ED">
            <tr class="text-left text-[9px] font-black text-slate-500 uppercase tracking-wider">
              <th class="px-4 py-2.5">Estudiante</th>
              <th class="px-4 py-2.5 text-center">Promedio</th>
              <th class="px-4 py-2.5 text-center">Nivel</th>
              <th class="px-4 py-2.5 text-center">Acción</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-50">${rows}</tbody>
        </table>
      </div>
    </div>`;

  if (window.lucide) lucide.createIcons();
}

async function openBoletin(studentId) {
  if (!_evals.length || !_actEvalId) return Helpers.toast('No hay un boletín configurado. Contacta a la directora.', 'warning');
  const student = _students.find(s => String(s.id) === String(studentId));
  if (!student) return;

  _boletinOpen = true;
  try {
    await GradebookGrid.open({
      student,
      classroom: _currentClassroom || null,
      evaluationId: _actEvalId,
      periodId: null,
      classroomId: _currentClassroomId,
      role: 'maestra',
      editable: true,
      onSaved: () => _renderBoletines()
    });
  } catch (e) {
    console.error('[Grades] cuadrícula', e);
    Helpers.toast('Error al abrir el Centro de Calificaciones', 'error');
  } finally {
    _boletinOpen = false;
  }
}

// ── ACTIVIDADES + HISTORIAL (Módulos 2/3/4 del diseño) ──────────────
async function _loadActivities() {
  const content = document.getElementById('tGradeContent');
  if (!content) return;
  content.innerHTML = '<div class="p-8 text-center"><div class="inline-block w-8 h-8 border-4 border-purple-400 border-t-transparent rounded-full animate-spin"></div><p class="mt-3 text-sm text-slate-400 font-medium">Cargando actividades...</p></div>';

  if (!_students.length) {
    const { data: students } = await supabase
      .from('students').select('id, name, matricula')
      .eq('classroom_id', _currentClassroomId)
      .eq('is_active', true).order('name');
    _students = students || [];
  }

  const { data: evals } = await supabase
    .from('eval_evaluations').select('*').is('deleted_at', null)
    .order('created_at', { ascending: false });
  _evals = evals || [];

  if (!_evals.length) {
    content.innerHTML = _emptyState('No hay evaluaciones configuradas. Contacta a la directora.', '🧩');
    return;
  }

  if (!_actEvalId || !_evals.find(e => e.id === _actEvalId)) _actEvalId = _evals[0].id;
  await _loadEvalChildren();
  _renderActivities();
}

async function _loadEvalChildren() {
  const evalId = _actEvalId;
  const [areas, periods] = await Promise.all([
    supabase.from('eval_areas').select('*').eq('evaluation_id', evalId).is('deleted_at', null).order('sort_order').order('created_at'),
    supabase.from('eval_periods').select('*').eq('evaluation_id', evalId).is('deleted_at', null).order('sort_order').order('created_at')
  ]);
  _evalAreas = areas.data || [];
  _evalPeriods = periods.data || [];

  const periodIds = _evalPeriods.map(p => p.id);
  const { data: modules } = periodIds.length
    ? await supabase.from('eval_modules').select('*, area:eval_areas(name), period:eval_periods(name)')
        .in('period_id', periodIds).is('deleted_at', null).order('sort_order').order('created_at')
    : { data: [] };
  _evalModules = modules || [];

  const moduleIds = _evalModules.map(m => m.id);
  const { data: activities } = moduleIds.length
    ? await supabase.from('eval_activities').select('*')
        .in('module_id', moduleIds).is('deleted_at', null).order('sort_order').order('created_at')
    : { data: [] };
  _evalActivities = activities || [];

  const actIds = _evalActivities.map(a => a.id);
  const { data: scores } = actIds.length
    ? await supabase.from('eval_scores').select('*').in('activity_id', actIds)
    : { data: [] };
  _evalScoresMap = buildScoresMap(scores || [], _evalActivities);

  if (_actPeriodId && !_evalPeriods.find(p => p.id === _actPeriodId)) _actPeriodId = null;
  if (!_actPeriodId) _actPeriodId = _evalPeriods[0]?.id || null;
  if (_actAreaId && !_evalAreas.find(a => a.id === _actAreaId)) _actAreaId = null;
  if (_actModuleId && !_evalModules.find(m => m.id === _actModuleId)) _actModuleId = null;
}

function _renderActivities() {
  const content = document.getElementById('tGradeContent');
  if (!content) return;
  if (!_students.length) { content.innerHTML = _emptyState('No hay alumnos en esta aula', '👨‍🎓'); return; }

  const evalOpts = _evals.map(e => `<option value="${e.id}" ${_actEvalId === e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('');
  const periodOpts = _evalPeriods.map(p => `<option value="${p.id}" ${_actPeriodId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  const areaOpts = '<option value="">Todas las áreas</option>' + _evalAreas.map(a => `<option value="${a.id}" ${_actAreaId === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('');
  const moduleOpts = '<option value="">Todos los módulos</option>' + _evalModules.map(m => `<option value="${m.id}" ${_actModuleId === m.id ? 'selected' : ''}>${esc(m.period?.name || '')} · ${esc(m.name)}</option>`).join('');

  const acts = _evalActivities.filter(a => {
    const m = _evalModules.find(x => x.id === a.module_id);
    if (!m) return false;
    if (_actPeriodId && m.period_id !== _actPeriodId) return false;
    if (_actAreaId && m.area_id !== _actAreaId) return false;
    if (_actModuleId && a.module_id !== _actModuleId) return false;
    return true;
  }).sort((a, b) => String(b.activity_date || b.created_at || '').localeCompare(String(a.activity_date || a.created_at || '')));

  const actRows = acts.map(a => {
    const m = _evalModules.find(x => x.id === a.module_id);
    const area = _evalAreas.find(x => x.id === m?.area_id);
    const type = ACTIVITY_TYPES.find(t => t.value === (a.activity_type || 'actividad')) || ACTIVITY_TYPES[0];
    const typeColor = ACTIVITY_TYPE_COLORS[a.activity_type] || ACTIVITY_TYPE_COLORS.actividad;
    const dateStr = a.activity_date || (a.created_at ? String(a.created_at).slice(0, 10) : '');
    const graded = _students.map(st => normalizeScore(m, _evalScoresMap[`${a.module_id}:${a.id}:${st.id}`]));
    const gradedCount = graded.filter(v => v != null).length;
    const avg = avgOf(graded);
    return `
      <tr class="border-b border-slate-50 hover:bg-purple-50/40 transition-colors">
        <td class="px-3 py-2">
          <div class="font-bold text-slate-700 text-xs">${esc(a.name)}</div>
          ${a.description ? `<div class="text-[10px] text-slate-400 truncate max-w-[220px]">${esc(a.description)}</div>` : ''}
        </td>
        <td class="px-2 py-2 text-xs font-bold text-slate-500 whitespace-nowrap">${esc(area?.name || '—')}</td>
        <td class="px-2 py-2 text-xs font-semibold text-slate-500 whitespace-nowrap">${esc(m?.name || '—')}</td>
        <td class="px-2 py-2 text-center"><span class="px-2 py-0.5 rounded-lg text-[9px] font-black whitespace-nowrap" style="background:${typeColor.bg};color:${typeColor.color}">${type.label}</span></td>
        <td class="px-2 py-2 text-center text-xs font-black text-slate-600">${a.max_value != null ? a.max_value : 100}</td>
        <td class="px-2 py-2 text-center text-xs font-bold text-slate-500 whitespace-nowrap">${dateStr ? new Date(dateStr).toLocaleDateString('es-DO', { day: '2-digit', month: 'short' }) : '—'}</td>
        <td class="px-2 py-2 text-center text-xs font-bold text-slate-500">${gradedCount}/${_students.length}</td>
        <td class="px-2 py-2 text-center font-black ${gradeColor(avg)}">${avg != null ? avg.toFixed(1) : '—'}</td>
        <td class="px-2 py-2 text-center">
          <button data-act-calificar="${a.id}" class="px-3 py-1.5 rounded-xl text-white text-[10px] font-black transition-all active:scale-95" style="background:${VIOLET}">Calificar</button>
        </td>
      </tr>`;
  }).join('');

  content.innerHTML = `
    <div class="p-4 md:p-5">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h3 class="text-sm font-black text-slate-800 flex items-center gap-2">
            <span class="p-1.5 rounded-xl text-white" style="background:linear-gradient(135deg,${VIOLET},${VIOLET_DARK})"><i data-lucide="folder-open" class="w-4 h-4"></i></span>
            Actividades de Evaluación
          </h3>
          <p class="text-[11px] text-slate-400 mt-0.5">Crea actividades, califícalas y consulta el historial con promedios automáticos.</p>
        </div>
        <button id="tgNewActivity" class="px-4 py-2.5 rounded-xl text-white text-xs font-black flex items-center gap-1.5 shadow-lg active:scale-95 transition-all" style="background:linear-gradient(90deg,${VIOLET},${VIOLET_DARK});box-shadow:0 4px 14px rgba(168,85,247,0.35)"><i data-lucide="plus" class="w-4 h-4"></i> Nueva Actividad</button>
      </div>

      <div class="flex flex-wrap items-center gap-2 mb-4">
        <select id="tgFilterEval" class="px-3 py-2 border-2 border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-[#A855F7] bg-white">${evalOpts}</select>
        <select id="tgFilterPeriod" class="px-3 py-2 border-2 border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-[#A855F7] bg-white">${periodOpts || '<option value="">Sin períodos</option>'}</select>
        <select id="tgFilterArea" class="px-3 py-2 border-2 border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-[#A855F7] bg-white">${areaOpts}</select>
        <select id="tgFilterModule" class="px-3 py-2 border-2 border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-[#A855F7] bg-white">${moduleOpts}</select>
        <button id="tgToggleAverages" class="px-3 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all ${_showAverages ? 'text-white' : 'text-slate-500 bg-slate-100 hover:bg-slate-200'}" style="${_showAverages ? `background:${VIOLET}` : ''}"><i data-lucide="calculator" class="w-3.5 h-3.5"></i> Promedios</button>
      </div>

      ${_showAverages ? _renderAverages(_actPeriodId) : ''}

      ${acts.length ? `
      <div class="overflow-x-auto rounded-2xl border border-slate-200">
        <table class="w-full text-sm">
          <thead class="border-b border-slate-200 bg-purple-50">
            <tr class="text-left text-[9px] font-black text-slate-500 uppercase tracking-wider">
              <th class="px-3 py-2.5">Actividad</th>
              <th class="px-2 py-2.5">Área</th>
              <th class="px-2 py-2.5">Módulo</th>
              <th class="px-2 py-2.5 text-center">Tipo</th>
              <th class="px-2 py-2.5 text-center">Valor</th>
              <th class="px-2 py-2.5 text-center">Fecha</th>
              <th class="px-2 py-2.5 text-center">Calificados</th>
              <th class="px-2 py-2.5 text-center">Promedio aula</th>
              <th class="px-2 py-2.5 text-center">Acción</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-50">${actRows}</tbody>
        </table>
      </div>` : `
      <div class="rounded-2xl border-2 border-dashed border-purple-200 p-10 text-center">
        <div class="w-16 h-16 mx-auto bg-purple-50 text-purple-500 rounded-3xl flex items-center justify-center mb-3"><i data-lucide="folder-open" class="w-8 h-8"></i></div>
        <h4 class="text-sm font-black text-slate-700">Sin actividades con estos filtros</h4>
        <p class="text-xs text-slate-400 mt-1">Crea tu primera actividad o ajusta los filtros.</p>
      </div>`}
    </div>`;

  if (window.lucide) lucide.createIcons();
  _bindActivitiesEvents();
}

function _bindActivitiesEvents() {
  document.getElementById('tgNewActivity')?.addEventListener('click', () => _openNewActivityModal());
  document.getElementById('tgFilterEval')?.addEventListener('change', async (e) => {
    _actEvalId = Number(e.target.value);
    _actPeriodId = null; _actAreaId = null; _actModuleId = null;
    await _loadEvalChildren();
    _renderActivities();
  });
  document.getElementById('tgFilterPeriod')?.addEventListener('change', (e) => {
    _actPeriodId = Number(e.target.value) || null;
    _actModuleId = null;
    _renderActivities();
  });
  document.getElementById('tgFilterArea')?.addEventListener('change', (e) => {
    _actAreaId = Number(e.target.value) || null;
    _actModuleId = null;
    _renderActivities();
  });
  document.getElementById('tgFilterModule')?.addEventListener('change', (e) => {
    _actModuleId = Number(e.target.value) || null;
    _renderActivities();
  });
  document.getElementById('tgToggleAverages')?.addEventListener('click', () => {
    _showAverages = !_showAverages;
    _renderActivities();
  });
  document.querySelectorAll('[data-act-calificar]').forEach(btn => {
    btn.addEventListener('click', () => _openActivityGrid(Number(btn.dataset.actCalificar)));
  });
}

// M4 — Promedios automáticos por área y general (motor de la boleta)
function _renderAverages(periodId) {
  const period = _evalPeriods.find(p => p.id === periodId);
  if (!period) return '<div class="mb-4 p-6 text-center text-slate-400 text-sm rounded-2xl border-2 border-dashed border-purple-200">Selecciona un período para ver los promedios.</div>';
  const areaCols = _evalAreas.map(a => ({
    area: a,
    modules: _evalModules.filter(m => m.period_id === period.id && m.area_id === a.id)
  }));
  const rows = _students.map(st => {
    const perArea = areaCols.map(({ area, modules }) => ({
      area,
      avg: avgOf(modules.map(m => moduleAvg(m, _evalActivities.filter(x => x.module_id === m.id), st.id, _evalScoresMap)))
    }));
    return { st, perArea, overall: avgOf(perArea.map(x => x.avg)) };
  }).map(r => `
    <tr class="border-b border-slate-50 hover:bg-purple-50/40">
      <td class="px-3 py-2 font-bold text-slate-700 text-xs whitespace-nowrap">${esc(r.st.name)}</td>
      ${r.perArea.map(x => `<td class="px-2 py-2 text-center font-black ${gradeColor(x.avg)}">${x.avg != null ? x.avg.toFixed(1) : '—'}</td>`).join('')}
      <td class="px-3 py-2 text-center font-black ${gradeColor(r.overall)}">${r.overall != null ? r.overall.toFixed(1) : '—'}</td>
      <td class="px-2 py-2 text-center"><span class="px-2 py-0.5 rounded-lg text-[9px] font-black ${gradeToLevel(r.overall).cls}">${gradeToLevel(r.overall).label}</span></td>
    </tr>`).join('');
  return `
    <div class="rounded-2xl border border-purple-200 overflow-hidden bg-white mb-4">
      <div class="flex items-center justify-between px-4 py-2.5 bg-purple-50 border-b border-purple-100">
        <h3 class="text-xs font-black text-slate-700 flex items-center gap-2"><span class="w-2 h-5 bg-[#A855F7] rounded-full"></span> Promedios automáticos · ${esc(period.name)}</h3>
        <span class="text-[10px] text-slate-400 font-bold">Se recalculan al guardar calificaciones</span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead><tr class="text-left text-[9px] font-black text-slate-500 uppercase tracking-wider bg-white">
            <th class="px-3 py-2">Estudiante</th>
            ${areaCols.map(c => `<th class="px-2 py-2 text-center">${esc(c.area.name)}</th>`).join('')}
            <th class="px-3 py-2 text-center">General</th><th class="px-2 py-2 text-center">Nivel</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

// M2 — Crear actividad (nombre, área, tipo, valor, fecha, descripción)
async function _openNewActivityModal() {
  const supportsExtras = await _activityExtrasOk();
  const evalOpts = _evals.map(e => `<option value="${e.id}" ${_actEvalId === e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('');
  const periodOpts = _evalPeriods.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  const areaOpts = _evalAreas.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('');
  const moduleOpts = _evalModules.map(m => `<option value="${m.id}">${esc(m.period?.name || '')} · ${esc(m.name)}</option>`).join('');
  const today = Helpers.getYYYYMMDD ? Helpers.getYYYYMMDD() : new Date().toISOString().slice(0, 10);

  Modal.open('tg-modal', `
    <div class="bg-white">
      <div class="px-6 pt-6 pb-2 border-b border-slate-100">
        <h3 class="text-lg font-black text-slate-800">Nueva Actividad</h3>
        <p class="text-xs text-slate-400 mt-0.5">Crea una actividad de evaluación y califica a tus estudiantes.</p>
      </div>
      <div class="p-6 space-y-3">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-black text-slate-600 uppercase mb-1">Evaluación</label>
            <select id="tgActEval" class="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-[#A855F7] bg-white">${evalOpts}</select>
          </div>
          <div>
            <label class="block text-xs font-black text-slate-600 uppercase mb-1">Nombre *</label>
            <input id="tgActName" class="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-[#A855F7]" placeholder="Se pone los zapatos">
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-black text-slate-600 uppercase mb-1">Período</label>
            <select id="tgActPeriod" class="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-[#A855F7] bg-white">${periodOpts || '<option value="">Sin períodos</option>'}</select>
          </div>
          <div>
            <label class="block text-xs font-black text-slate-600 uppercase mb-1">Área</label>
            <select id="tgActArea" class="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-[#A855F7] bg-white">${areaOpts || '<option value="">Sin áreas</option>'}</select>
          </div>
        </div>
        <div>
          <label class="block text-xs font-black text-slate-600 uppercase mb-1">Módulo *</label>
          <select id="tgActModule" class="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-[#A855F7] bg-white">
            ${moduleOpts || '<option value="">Sin módulos disponibles para el período/área seleccionado</option>'}
          </select>
        </div>
        ${supportsExtras ? `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label class="block text-xs font-black text-slate-600 uppercase mb-1">Tipo de actividad</label>
            <select id="tgActType" class="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-[#A855F7] bg-white">
              ${ACTIVITY_TYPES.map(t => `<option value="${t.value}">${t.label}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="block text-xs font-black text-slate-600 uppercase mb-1">Valor (0-100)</label>
            <input id="tgActValue" type="number" min="1" max="100" value="100" class="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-[#A855F7]">
          </div>
          <div>
            <label class="block text-xs font-black text-slate-600 uppercase mb-1">Fecha de realización</label>
            <input id="tgActDate" type="date" value="${today}" class="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-[#A855F7]">
          </div>
        </div>` : ''}
        <div>
          <label class="block text-xs font-black text-slate-600 uppercase mb-1">Descripción</label>
          <textarea id="tgActDesc" rows="2" class="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm outline-none focus:border-[#A855F7]" placeholder="Describe la actividad y sus criterios."></textarea>
        </div>
        <button id="tgActSave" class="w-full py-3 rounded-2xl text-white font-black text-sm flex items-center justify-center gap-2" style="background:linear-gradient(90deg,#A855F7,#7E22CE);"><i data-lucide="plus" class="w-4 h-4"></i> Guardar Actividad</button>
      </div>
    </div>`);

  const moduleSel = document.getElementById('tgActModule');
  const filterModules = () => {
    const periodId = Number(document.getElementById('tgActPeriod')?.value);
    const areaId = Number(document.getElementById('tgActArea')?.value);
    const opts = _evalModules
      .filter(m => (!periodId || m.period_id === periodId) && (!areaId || m.area_id === areaId))
      .map(m => `<option value="${m.id}">${esc(m.period?.name || '')} · ${esc(m.name)}</option>`).join('');
    moduleSel.innerHTML = opts || '<option value="">Sin módulos disponibles para el período/área seleccionado</option>';
  };
  document.getElementById('tgActPeriod')?.addEventListener('change', filterModules);
  document.getElementById('tgActArea')?.addEventListener('change', filterModules);
  document.getElementById('tgActSave')?.addEventListener('click', () => _saveNewActivity());
}

async function _saveNewActivity() {
  const name = document.getElementById('tgActName')?.value.trim();
  const moduleId = Number(document.getElementById('tgActModule')?.value);
  if (!name) return Helpers.toast('Ingresa el nombre de la actividad', 'error');
  if (!moduleId) return Helpers.toast('Selecciona un módulo', 'error');

  const supportsExtras = await _activityExtrasOk();
  const evalId = Number(document.getElementById('tgActEval')?.value) || _actEvalId;
  const payload = {
    module_id: moduleId,
    name,
    description: document.getElementById('tgActDesc')?.value.trim() || null,
    sort_order: _evalActivities.filter(a => a.module_id === moduleId).length,
    created_by: await _currentUserId()
  };
  if (supportsExtras) {
    const type = document.getElementById('tgActType')?.value || 'actividad';
    const max = Number(document.getElementById('tgActValue')?.value);
    payload.activity_type = ACTIVITY_TYPES.some(t => t.value === type) ? type : 'actividad';
    payload.max_value = (max > 0 && max <= 100) ? max : 100;
    payload.activity_date = document.getElementById('tgActDate')?.value || null;
  }

  const { error } = await supabase.from('eval_activities').insert(payload);
  if (error) return Helpers.toast(error.message, 'error');
  Modal.close('tg-modal');
  _actEvalId = evalId;
  await _loadEvalChildren();
  _renderActivities();
  Helpers.toast('Actividad creada', 'success');
}

// Calificar una actividad (grid estudiante × nota con promedio automático)
async function _openActivityGrid(actId) {
  const act = _evalActivities.find(a => a.id === actId);
  if (!act) return;
  const mod = _evalModules.find(m => m.id === act.module_id);
  if (!mod) return;
  initEvalControls();

  Modal.open('tg-modal', `
    <div class="bg-white">
      <div class="px-6 pt-6 pb-2 border-b border-slate-100">
        <div class="flex items-center gap-3">
          <div class="flex-1 min-w-0">
            <h3 class="text-lg font-black text-slate-800">${esc(act.name)}</h3>
            <p class="text-xs text-slate-400 mt-0.5">${esc(mod.period?.name || '')} · ${esc(mod.area?.name || '')} · ${esc(mod.name)}</p>
          </div>
          <button onclick="Modal.close('tg-modal')" class="p-2 hover:bg-slate-100 rounded-full transition-colors"><i data-lucide="x" class="w-6 h-6 text-slate-400"></i></button>
        </div>
      </div>
      <div id="tgActGrid" class="p-6"></div>
    </div>`);
  await _renderActivityGrid(act);
}

async function _renderActivityGrid(act) {
  const wrap = document.getElementById('tgActGrid');
  if (!wrap) return;
  const mod = _evalModules.find(m => m.id === act.module_id);
  const moduleActs = _evalActivities.filter(a => a.module_id === act.module_id);
  const rows = _students.map(st => {
    const score = _evalScoresMap[`${act.module_id}:${act.id}:${st.id}`] || null;
    const mAvg = moduleAvg(mod, moduleActs, st.id, _evalScoresMap);
    return `
      <tr class="border-b border-slate-50" data-sid="${st.id}">
        <td class="px-3 py-2">
          <div class="font-bold text-slate-700 text-xs">${esc(st.name)}</div>
          <div class="text-[9px] text-slate-400 font-bold">${esc(st.matricula || '')}</div>
        </td>
        <td class="px-2 py-2 eval-cell">${renderEvalInput(mod, score)}</td>
        <td class="px-3 py-2 text-center font-black ${gradeColor(mAvg)}" data-ma="${st.id}">${mAvg != null ? mAvg.toFixed(1) : '—'}</td>
      </tr>`;
  }).join('');

  wrap.innerHTML = `
    <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
      <span class="text-[11px] text-slate-400">Califica a tus ${_students.length} estudiantes. El promedio del módulo se recalcula automáticamente.</span>
      <button id="tgSaveScores" class="px-4 py-2 rounded-xl text-white text-xs font-black flex items-center gap-1.5" style="background:${VIOLET};box-shadow:0 4px 14px rgba(168,85,247,0.3)"><i data-lucide="save" class="w-3.5 h-3.5"></i> Guardar</button>
    </div>
    <div class="overflow-x-auto rounded-xl border border-slate-200">
      <table class="w-full text-sm">
        <thead class="border-b border-slate-200 bg-purple-50">
          <tr class="text-left text-[9px] font-black text-slate-500 uppercase tracking-wider">
            <th class="px-3 py-2.5">Estudiante</th>
            <th class="px-2 py-2.5 text-center">Nota</th>
            <th class="px-3 py-2.5 text-center">Promedio módulo</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  document.getElementById('tgSaveScores')?.addEventListener('click', () => _saveActivityScores(act));
  wrap.querySelectorAll('tbody tr').forEach(tr => {
    tr.querySelector('.eval-cell')?.addEventListener('change', () => _recalcRowAvg(tr, act));
  });
}

function _recalcRowAvg(tr, act) {
  const sid = Number(tr.dataset.sid);
  const mod = _evalModules.find(m => m.id === act.module_id);
  const cell = tr.querySelector('.eval-cell');
  const rec = readEvalInputs(cell, mod.eval_type);
  const key = `${act.module_id}:${act.id}:${sid}`;
  if (rec) {
    const base = _evalScoresMap[key] || {};
    _evalScoresMap[key] = { ...base, ...rec };
  } else {
    delete _evalScoresMap[key];
  }
  const mAvg = moduleAvg(mod, _evalActivities.filter(a => a.module_id === act.module_id), sid, _evalScoresMap);
  const el = tr.querySelector('[data-ma]');
  if (el) {
    el.textContent = mAvg != null ? mAvg.toFixed(1) : '—';
    el.className = `px-3 py-2 text-center font-black ${gradeColor(mAvg)}`;
  }
}

async function _saveActivityScores(act) {
  const grid = document.getElementById('tgActGrid');
  if (!grid) return;
  const mod = _evalModules.find(m => m.id === act.module_id);
  const rows = [];
  grid.querySelectorAll('tbody tr').forEach((tr, ri) => {
    const student = _students[ri];
    if (!student) return;
    const cell = tr.querySelector('.eval-cell');
    const record = readEvalInputs(cell, mod.eval_type);
    if (record) rows.push({ activity_id: act.id, student_id: student.id, record });
  });
  if (!rows.length) return Helpers.toast('Ingresa al menos una calificación', 'warning');
  const uid = await _currentUserId();
  const payload = rows.map(r => ({
    module_id: act.module_id,
    activity_id: r.activity_id,
    student_id: r.student_id,
    evaluated_by: uid,
    ...r.record
  }));
  const { error } = await supabase.from('eval_scores').upsert(payload, { onConflict: 'activity_id,student_id' });
  if (error) return Helpers.toast(error.message, 'error');
  await _loadEvalChildren();
  await _renderActivityGrid(act);
  Helpers.toast('Calificaciones guardadas', 'success');
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
    el.innerHTML = `<span class="px-3 py-1.5 rounded-full text-[10px] font-black uppercase flex items-center gap-1.5" style="background:${isOpen ? '#E8FFF0' : '#FFF7ED'};color:${isOpen ? '#1A8035' : '#B45309'}">${isOpen ? '🟢' : '🔒'} ${esc(_periodInfo.period.name)} ${isOpen ? 'Abierto' : 'Cerrado'}</span>`;
  } else {
    el.innerHTML = '<span class="px-3 py-1.5 rounded-full text-[10px] font-black uppercase" style="background:#F1F5F9;color:#64748B">Sin periodo activo</span>';
  }
}

function _renderLockBanner() {
  const el = document.getElementById('tGradeLockedBanner');
  if (!el) return;
  if (_periodInfo && !_periodInfo.open) {
    el.innerHTML = `
      <div class="p-3 rounded-2xl flex items-center gap-3" style="background:#FFF7ED;border:1.5px solid #FED7AA">
        <span class="text-xl">🔒</span>
        <div>
          <p class="text-xs font-black uppercase tracking-wide" style="color:#9A3412">Período cerrado</p>
          <p class="text-[10px] font-medium" style="color:#C2410C">Las calificaciones están bloqueadas. Solo la directora puede reabrirlo.</p>
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
      <div class="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl" style="background:#F0FDF4;color:${GREEN_DARK}">${icon}</div>
      <h3 class="text-lg font-black text-slate-800 mb-2">${msg}</h3>
    </div>`;
}

// ── PUBLIC API ───────────────────────────────────────────────────────
export const MaestraGrades = {
  init: initGradesCenter,
  saveAll,
  openBoletin,
};
window.MaestraGrades = MaestraGrades;
