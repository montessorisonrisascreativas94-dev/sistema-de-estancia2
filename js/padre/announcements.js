/**
 * ParentAnnouncements — Banner de anuncios del panel de padres.
 *
 * Muestra un banner (arriba de la sección Resumen/Inicio) con tarjetas:
 *   • Activa las notificaciones push (si aún no están activadas).
 *   • Recordatorio 30 min antes de la HORA DE ENTRADA del niño.
 *   • Recordatorio 30 min antes de la HORA DE SALIDA del niño.
 *   • Tareas nuevas por hacer.
 *   • Tareas vencidas.
 *   • Nuevas actividades publicadas por el colegio.
 *
 * La hora de entrada/salida se toma de students.schedule (p. ej. "8:00-15:00").
 * Cada tarjeta se puede cerrar; algunas reaparecen al día siguiente.
 */

import { supabase } from '../shared/supabase.js';
import { AppState, TABLES } from './appState.js';
import { Helpers } from '../shared/helpers.js';
import { NotifyPermission } from '../shared/notify-permission.js';

const BAR_ID = 'parentAnnounceBar';
const DISMISS_KEY = 'parentAnnounceDismissed';
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const REFRESH_MS = 60 * 1000;

const _state = { student: null, tasks: [], activities: [], timer: null, bound: false };

// ── Persistencia de descartes ────────────────────────────────────────────────
function _dismissed() {
  try { return JSON.parse(localStorage.getItem(DISMISS_KEY) || '{}'); } catch { return {}; }
}
function _dismiss(key) {
  const d = _dismissed();
  d[key] = Date.now();
  try { localStorage.setItem(DISMISS_KEY, JSON.stringify(d)); } catch {}
}
function _isDismissed(key, ttl = DAY) {
  const at = _dismissed()[key];
  return !!at && (Date.now() - at) < ttl;
}

// ── Horario del niño: "8:00-15:00" → { entry, exit } ─────────────────────────
function _parseSchedule(schedule) {
  const m = String(schedule || '').match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return {
    entry: { h: +m[1], min: +m[2] },
    exit:  { h: +m[3], min: +m[4] }
  };
}
function _minutesUntil(t, now) {
  const target = new Date(now);
  target.setHours(t.h, t.min, 0, 0);
  return Math.round((target - now) / 60000);
}
function _todayKey() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

// ── CSS (inyectado una sola vez) ─────────────────────────────────────────────
const CSS = `
#${BAR_ID}{display:flex;flex-direction:column;gap:10px;margin-bottom:1.75rem}
#${BAR_ID}[hidden]{display:none}
.pab-card{display:flex;align-items:center;gap:14px;background:#fff;border:1px solid #E6EBF2;border-left:6px solid var(--c);border-radius:1.25rem;padding:14px 16px;box-shadow:0 8px 24px rgba(15,23,42,.07);animation:pabIn .45s cubic-bezier(.2,.85,.3,1.1) both}
.pab-ic{width:46px;height:46px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:22px;background:var(--bg);flex:0 0 auto}
.pab-body{flex:1 1 auto;min-width:0}
.pab-title{margin:0;font-weight:900;font-size:14px;color:#0F172A;line-height:1.25;word-break:break-word}
.pab-text{margin:2px 0 0;font-size:12px;font-weight:600;color:#64748B;line-height:1.45;word-break:break-word}
.pab-actions{display:flex;align-items:center;gap:6px;flex:0 0 auto}
.pab-btn{border:0;border-radius:12px;padding:9px 16px;font-weight:900;font-size:12px;color:#fff;background:var(--c);cursor:pointer;transition:filter .15s ease,transform .15s ease;white-space:nowrap}
.pab-btn:hover{filter:brightness(1.07)}
.pab-btn:active{transform:translateY(1px)}
.pab-x{border:0;background:transparent;color:#CBD5E1;font-size:15px;cursor:pointer;padding:4px 6px;line-height:1;border-radius:8px}
.pab-x:hover{color:#94A3B8;background:#F1F5F9}
@media(max-width:640px){
  .pab-card{flex-wrap:wrap}
  .pab-body{flex-basis:calc(100% - 60px)}
  .pab-actions{width:100%;justify-content:flex-end}
}
@keyframes pabIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}
`;
function _injectCss() {
  if (typeof document === 'undefined' || document.getElementById('parentAnnounceCss')) return;
  const style = document.createElement('style');
  style.id = 'parentAnnounceCss';
  style.textContent = CSS;
  document.head.appendChild(style);
}

// ── Tarjetas ─────────────────────────────────────────────────────────────────
function _card({ color, bg, icon, title, text, key, action }) {
  const actionBtn = action
    ? `<button class="pab-btn" data-pab-act="${action.act}">${Helpers.escapeHTML(action.label)}</button>`
    : '';
  return `
    <div class="pab-card" style="--c:${color};--bg:${bg}">
      <div class="pab-ic">${icon}</div>
      <div class="pab-body">
        <p class="pab-title">${Helpers.escapeHTML(title)}</p>
        ${text ? `<p class="pab-text">${Helpers.escapeHTML(text)}</p>` : ''}
      </div>
      <div class="pab-actions">
        ${actionBtn}
        <button class="pab-x" data-pab-key="${key}" title="Cerrar" aria-label="Cerrar">✕</button>
      </div>
    </div>`;
}

function _render() {
  const bar = document.getElementById(BAR_ID);
  if (!bar) return;
  _injectCss();

  const now = new Date();
  const student = _state.student;
  const cards = [];
  const day = _todayKey();

  // 1) Push no activado
  if ('Notification' in window && !NotifyPermission.isGranted() && !NotifyPermission.isDenied()
      && !_isDismissed('push', DAY)) {
    cards.push(_card({
      color: '#F59E0B', bg: '#FEF3C7', icon: '🔔',
      title: 'Activa las notificaciones',
      text: 'Recibe al instante los avisos de entrada, salida, tareas y actividades de tu hijo.',
      key: 'push',
      action: { act: 'push', label: 'Activar' }
    }));
  }

  // 2) y 3) Recordatorios de entrada / salida (30 min antes)
  const sched = _parseSchedule(student?.schedule);
  if (sched) {
    const toEntry = _minutesUntil(sched.entry, now);
    const keyEntry = `entry-${day}`;
    if (toEntry > 0 && toEntry <= 30 && !_isDismissed(keyEntry, DAY)) {
      cards.push(_card({
        color: '#F97316', bg: '#FFEDD5', icon: '🎒',
        title: `En ${toEntry} min lleva a tu hijo a la estancia`,
        text: `Su hora de entrada es a las ${String(sched.entry.h).padStart(2, '0')}:${String(sched.entry.min).padStart(2, '0')}.`,
        key: keyEntry
      }));
    }

    const toExit = _minutesUntil(sched.exit, now);
    const keyExit = `exit-${day}`;
    if (toExit > 0 && toExit <= 30 && !_isDismissed(keyExit, DAY)) {
      cards.push(_card({
        color: '#0B63C7', bg: '#DBEAFE', icon: '🏫',
        title: `En ${toExit} min es hora de recoger a tu hijo`,
        text: `Su hora de salida es a las ${String(sched.exit.h).padStart(2, '0')}:${String(sched.exit.min).padStart(2, '0')}.`,
        key: keyExit
      }));
    }
  }

  // 4) Tareas vencidas
  const tasks = _state.tasks || [];
  const overdue = tasks.filter(t => t._overdue);
  if (overdue.length && !_isDismissed('tasks-overdue', 12 * HOUR)) {
    cards.push(_card({
      color: '#EF4444', bg: '#FEE2E2', icon: '⚠️',
      title: overdue.length === 1 ? 'Tienes 1 tarea vencida' : `Tienes ${overdue.length} tareas vencidas`,
      text: overdue[0]?.title ? `"${overdue[0].title}" — entrégalas lo antes posible.` : 'Entrégalas lo antes posible.',
      key: 'tasks-overdue',
      action: { act: 'tasks', label: 'Ver tareas' }
    }));
  }

  // 5) Tareas nuevas por hacer (pendientes, aún no entregadas, sin vencer)
  const pending = tasks.filter(t => !t._overdue);
  if (pending.length && !_isDismissed('tasks-new', DAY)) {
    cards.push(_card({
      color: '#8B5CF6', bg: '#EDE9FE', icon: '📝',
      title: pending.length === 1 ? 'Tienes una nueva tarea por hacer' : `Tienes ${pending.length} tareas por hacer`,
      text: pending[0]?.title ? `"${pending[0].title}"` : '',
      key: 'tasks-new',
      action: { act: 'tasks', label: 'Ver tareas' }
    }));
  }

  // 6) Nuevas actividades publicadas
  const acts = _state.activities || [];
  if (acts.length && !_isDismissed('activities', DAY)) {
    const a = acts[0];
    cards.push(_card({
      color: a.color_hex || '#28B54D', bg: '#E6F7EB', icon: '📅',
      title: acts.length === 1 ? 'Nueva actividad del colegio' : `${acts.length} nuevas actividades`,
      text: a.title ? `"${a.title}"` : '',
      key: 'activities',
      action: { act: 'activities', label: 'Ver' }
    }));
  }

  if (!cards.length) {
    bar.hidden = true;
    bar.innerHTML = '';
    return;
  }
  bar.hidden = false;
  bar.innerHTML = cards.join('');
}

// ── Carga de datos ───────────────────────────────────────────────────────────
async function _loadData() {
  const student = _state.student;
  if (!student?.id) return;

  // Horario fresco (por si currentStudent no lo trae)
  if (!student.schedule) {
    try {
      const { data } = await supabase.from(TABLES.STUDENTS)
        .select('schedule, classroom_id').eq('id', student.id).maybeSingle();
      if (data) { student.schedule = data.schedule; student.classroom_id = student.classroom_id || data.classroom_id; }
    } catch (_) {}
  }

  const tasksPromise = (async () => {
    if (!student.classroom_id) return [];
    let tasks = [];
    try {
      const { data, error } = await supabase.from(TABLES.TASKS)
        .select('id, title, due_date')
        .eq('classroom_id', student.classroom_id)
        .order('due_date', { ascending: false });
      if (error) throw error;
      tasks = data || [];
    } catch (_) { return []; }

    let evidenced = new Set();
    try {
      const { data } = await supabase.from(TABLES.TASK_EVIDENCES)
        .select('task_id').eq('student_id', student.id);
      evidenced = new Set((data || []).map(e => String(e.task_id)));
    } catch (_) {}

    const now = Date.now();
    return tasks
      .filter(t => !evidenced.has(String(t.id)))
      .map(t => ({
        id: t.id,
        title: t.title,
        due_date: t.due_date,
        _overdue: !!t.due_date && new Date(t.due_date).getTime() < now
      }));
  })();

  const activitiesPromise = (async () => {
    try {
      const since = new Date(Date.now() - 3 * DAY).toISOString();
      const { data, error } = await supabase.from('school_activities')
        .select('id, title, activity_date, color_hex')
        .eq('status', 'published')
        .or(`classroom_id.is.null,classroom_id.eq.${student.classroom_id || 0}`)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(3);
      if (error) throw error;
      return data || [];
    } catch (_) { return []; }
  })();

  const [tasks, activities] = await Promise.all([tasksPromise, activitiesPromise]);
  _state.tasks = tasks;
  _state.activities = activities;
  _render();
}

// ── Interacción ──────────────────────────────────────────────────────────────
function _bind() {
  if (_state.bound) return;
  _state.bound = true;
  document.addEventListener('click', (e) => {
    const x = e.target.closest(`#${BAR_ID} [data-pab-key]`);
    if (x) { _dismiss(x.dataset.pabKey); _render(); return; }

    const act = e.target.closest(`#${BAR_ID} [data-pab-act]`);
    if (!act) return;
    const a = act.dataset.pabAct;
    if (a === 'push') {
      NotifyPermission.requestSilent().then(() => _render());
    } else if (a === 'tasks') {
      window.App?.navigateTo?.('tasks') || document.querySelector('[data-target="tasks"]')?.click();
    } else if (a === 'activities') {
      window.App?.navigateTo?.('actividades') || document.querySelector('[data-target="actividades"]')?.click();
    }
  });
}

export const ParentAnnouncements = {
  async init(student) {
    _state.student = student || AppState.get('currentStudent');
    if (!_state.student) return;
    _injectCss();
    _bind();
    _render();          // pinta primero lo inmediato (push + horario)
    await _loadData();  // luego tareas y actividades

    if (_state.timer) clearInterval(_state.timer);
    _state.timer = setInterval(_render, REFRESH_MS);
  },

  refresh() { _render(); },
  destroy() { if (_state.timer) { clearInterval(_state.timer); _state.timer = null; } }
};
