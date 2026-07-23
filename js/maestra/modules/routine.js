/**
 * Rutina Express v6 — Sonrisas Creativas
 * 4 niveles: Timeline del Día · Acciones Colectivas · Tarjetas · Modal Individual
 * Sync fix: logsMap keying, date-filtered API
 */
import { AppState } from '../state.js';
import { UI, safeToast, safeEscapeHTML, safeUrl } from './ui.js';
import { MaestraApi } from '../api.js';

let _logsMap = {};
let _sleepMap = {};
let _lastEvent = {};
let _expandedEvent = null;
let _autoRefreshTimer = null;
let _scheduleConfig = null;
let _viewMode = localStorage.getItem('sonrisas_view_mode') || 'horizontal';
let _timelineCollapsed = localStorage.getItem('sonrisas_tl_collapsed') === '1';

const SCHEDULE_STORAGE_KEY = 'sonrisas_schedule_config';
const SCHEDULE_VERSION = 3;

const DEFAULT_SCHEDULE = [
  { id: 'welcome',      emoji: '🖐️', label: 'Bienvenida',         color: '#FF8A00', startTime: '07:30', duration: 15,  type: 'colectivo', auto: false, needsConfirm: false, visibleParents: true,  visibleDirector: true,  days: [1,2,3,4,5,6], active: true },
  { id: 'roll_call',    emoji: '📋', label: 'Pase de Lista',       color: '#0B63C7', startTime: '07:45', duration: 15,  type: 'colectivo', auto: false, needsConfirm: true,  visibleParents: true,  visibleDirector: true,  days: [1,2,3,4,5,6], active: true },
  { id: 'breakfast',    emoji: '🍞', label: 'Desayuno',            color: '#FF8A00', startTime: '08:00', duration: 30,  type: 'colectivo', auto: true,  needsConfirm: false, visibleParents: true,  visibleDirector: true,  days: [1,2,3,4,5,6], active: true, groupEventId: 'breakfast' },
  { id: 'handwash',     emoji: '🧼', label: 'Lavado de manos',     color: '#0B63C7', startTime: '08:30', duration: 10,  type: 'colectivo', auto: false, needsConfirm: false, visibleParents: true,  visibleDirector: true,  days: [1,2,3,4,5,6], active: true, groupEventId: 'handwash' },
  { id: 'activity',     emoji: '🎨', label: 'Actividad educativa', color: '#7C3AED', startTime: '09:00', duration: 45,  type: 'colectivo', auto: false, needsConfirm: false, visibleParents: true,  visibleDirector: true,  days: [1,2,3,4,5,6], active: true, groupEventId: 'activity' },
  { id: 'playground',   emoji: '🌳', label: 'Salida al Patio',     color: '#16A34A', startTime: '09:45', duration: 30,  type: 'colectivo', auto: false, needsConfirm: false, visibleParents: true,  visibleDirector: true,  days: [1,2,3,4,5,6], active: true, groupEventId: 'playground' },
  { id: 'snack',        emoji: '🍎', label: 'Refrigerio',          color: '#28B54D', startTime: '10:15', duration: 30,  type: 'colectivo', auto: true,  needsConfirm: false, visibleParents: true,  visibleDirector: true,  days: [1,2,3,4,5,6], active: true, groupEventId: 'snack' },
  { id: 'sensorial',    emoji: '🔬', label: 'Actividad sensorial', color: '#6366F1', startTime: '11:00', duration: 45,  type: 'colectivo', auto: false, needsConfirm: false, visibleParents: true,  visibleDirector: true,  days: [1,2,3,4,5,6], active: true },
  { id: 'lunch',        emoji: '🍽️', label: 'Almuerzo',            color: '#28B54D', startTime: '11:45', duration: 30,  type: 'colectivo', auto: true,  needsConfirm: false, visibleParents: true,  visibleDirector: true,  days: [1,2,3,4,5,6], active: true, groupEventId: 'lunch' },
  { id: 'toothbrush',   emoji: '🪥', label: 'Cepillado',           color: '#06B6D4', startTime: '12:15', duration: 15,  type: 'colectivo', auto: false, needsConfirm: false, visibleParents: true,  visibleDirector: true,  days: [1,2,3,4,5,6], active: true, groupEventId: 'toothbrush' },
  { id: 'sleep_start',  emoji: '😴', label: 'Siesta',              color: '#8B5CF6', startTime: '12:30', duration: 120, type: 'colectivo', auto: true,  needsConfirm: false, visibleParents: true,  visibleDirector: true,  days: [1,2,3,4,5,6], active: true, groupEventId: 'sleep_start' },
  { id: 'sleep_end',    emoji: '😊', label: 'Despertar',           color: '#FFD43B', startTime: '14:30', duration: 15,  type: 'colectivo', auto: false, needsConfirm: false, visibleParents: true,  visibleDirector: true,  days: [1,2,3,4,5,6], active: true, groupEventId: 'sleep_end' },
  { id: 'snack2',       emoji: '🍪', label: 'Merienda',            color: '#F59E0B', startTime: '15:00', duration: 30,  type: 'colectivo', auto: true,  needsConfirm: false, visibleParents: true,  visibleDirector: true,  days: [1,2,3,4,5,6], active: true, groupEventId: 'snack' },
  { id: 'free_play',    emoji: '🎮', label: 'Juego libre',         color: '#EC4899', startTime: '15:30', duration: 30,  type: 'colectivo', auto: false, needsConfirm: false, visibleParents: true,  visibleDirector: true,  days: [1,2,3,4,5,6], active: true },
  { id: 'departure',    emoji: '👋', label: 'Entrega de niños',    color: '#EF4444', startTime: '16:00', duration: 60,  type: 'colectivo', auto: false, needsConfirm: true,  visibleParents: true,  visibleDirector: true,  days: [1,2,3,4,5,6], active: true }
];

const INDIV_EVENTS = [
  { id: 'poop',     icon: '💩', label: 'Popó',            color: '#FF8A00', type: 'diaper', subtype: 'soiled' },
  { id: 'pee',      icon: '💧', label: 'Pipí',            color: '#0B63C7', type: 'diaper', subtype: 'wet' },
  { id: 'toilet',   icon: '🚽', label: 'Uso del Baño',    color: '#28B54D', type: 'bath' },
  { id: 'diaper',   icon: '🧻', label: 'Cambio de Pañal',  color: '#94A3B8', type: 'diaper_change' },
  { id: 'temp',     icon: '🌡️', label: 'Temperatura',      color: '#EF4444', type: 'temp' },
  { id: 'med',      icon: '💊', label: 'Medicamento',      color: '#EC4899', type: 'med' },
  { id: 'hit',      icon: '🤕', label: 'Golpe / Caída',    color: '#EF4444', type: 'incident', subtype: 'hit' },
  { id: 'vomit',    icon: '🤮', label: 'Vómito',          color: '#EF4444', type: 'health', subtype: 'vomit' },
  { id: 'cough',    icon: '😷', label: 'Tos / Congestión', color: '#6366F1', type: 'health', subtype: 'cough' },
  { id: 'milk',     icon: '🍼', label: 'Biberón',         color: '#0B63C7', type: 'milk' },
  { id: 'note',     icon: '📝', label: 'Nota Individual',  color: '#64748B', type: 'note' }
];

const COLLECTIVE_QUICK_EVENTS = [
  { id: 'bathroom',  emoji: '🚽', label: 'Baño',        color: '#28B54D', groupEventId: 'bathroom',  type: '_group',  eventType: 'bath',    active: true },
  { id: 'poop_gr',   emoji: '💩', label: 'Popó',        color: '#FF8A00', groupEventId: 'poop_gr',   type: '_group',  eventType: 'diaper',   active: true },
  { id: 'milk_gr',   emoji: '🍼', label: 'Biberón',     color: '#0B63C7', groupEventId: 'milk_gr',   type: '_group',  eventType: 'milk',     active: true }
];

function _today() { return AppState.today(); }
function _fmtTime(d) {
  return new Date(d).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', hour12: true });
}
function _fmtTimeShort(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}
function _isWithin12h(d) {
  return d ? (Date.now() - new Date(d).getTime()) < 43200000 : false;
}
function _timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}
function _minutesToTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
function _isDuplicate(studentId, eventType) {
  const key = `${studentId}:${eventType}`;
  const last = _lastEvent[key];
  if (last && Date.now() - last < 15000) return true;
  _lastEvent[key] = Date.now();
  return false;
}
function _calcProgress(log) {
  if (!log || !_isWithin12h(log.created_at)) return 0;
  let score = 0;
  if (log.mood) score++;
  if (log.food) score++;
  if (log.nap !== undefined && log.nap !== null) score++;
  const evTypes = new Set((log.infant_data || []).map(e => e.type));
  if (evTypes.has('milk')) score++;
  if (evTypes.has('diaper') || evTypes.has('bath')) score++;
  return Math.round((score / 5) * 100);
}
function _getDayOfWeek() { return new Date().getDay(); }

function _loadScheduleConfig() {
  try {
    const stored = localStorage.getItem(SCHEDULE_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed._version === SCHEDULE_VERSION) { _scheduleConfig = parsed.events; return _scheduleConfig; }
    }
  } catch {}
  _scheduleConfig = DEFAULT_SCHEDULE.map(e => ({ ...e }));
  _saveScheduleConfig();
  return _scheduleConfig;
}
function _saveScheduleConfig() {
  try {
    localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify({ _version: SCHEDULE_VERSION, events: _scheduleConfig }));
  } catch {}
}
function _getSchedule() {
  if (!_scheduleConfig) _loadScheduleConfig();
  return _scheduleConfig.filter(e => e.active && e.days.includes(_getDayOfWeek()));
}

function _getEventStatus(event, nowMinutes) {
  const startMin = _timeToMinutes(event.startTime);
  const endMin = startMin + (event.duration || 30);
  if (nowMinutes < startMin) return 'pending';
  if (nowMinutes >= startMin && nowMinutes < endMin) return 'in_progress';
  return 'completed';
}

function _getEventProgress(event, students, logsMap) {
  if (!students || students.length === 0) return { done: 0, total: 0, pct: 0 };
  const gid = event.groupEventId;
  if (!gid) return { done: 0, total: students.length, pct: 0 };
  const GROUP_MAP = {
    breakfast: { field: 'food', key: 'breakfast' }, lunch: { field: 'food', key: 'lunch' }, snack: { field: 'food', key: 'snack' },
    handwash: { field: '_group', type: 'handwash' }, toothbrush: { field: '_group', type: 'toothbrush' },
    activity: { field: '_group', type: 'activity' }, playground: { field: '_group', type: 'playground' },
    sleep_start: { field: '_sleep', type: 'sleep' }, sleep_end: { field: '_sleep_end', type: 'sleep' }
  };
  const mapping = GROUP_MAP[gid];
  if (!mapping) return { done: 0, total: students.length, pct: 0 };
  let done = 0;
  const markedStudents = [];
  for (const s of students) {
    const log = logsMap[s.id];
    if (!log || !_isWithin12h(log.created_at)) continue;
    let counted = false;
    if (mapping.field === 'food') {
      try { const foodObj = JSON.parse(log.food || '{}'); if (foodObj[mapping.key]) { counted = true; done++; } } catch {}
    } else if (mapping.field === '_group') {
      if ((log.infant_data || []).some(e => e.type === mapping.type)) { counted = true; done++; }
    } else if (mapping.field === '_sleep') {
      if ((log.infant_data || []).some(e => e.type === 'sleep')) { counted = true; done++; }
    } else if (mapping.field === '_sleep_end') {
      if ((log.infant_data || []).filter(e => e.type === 'sleep' && e.end_time).length > 0) { counted = true; done++; }
    }
    if (counted) markedStudents.push(s.name);
  }
  return { done, total: students.length, pct: Math.round((done / students.length) * 100), markedStudents };
}

// ═══════════════════════════════════════════════════════════════════════════════
// LEVEL 1 — TIMELINE DEL DÍA (COLLAPSABLE)
// ═══════════════════════════════════════════════════════════════════════════════

function _renderTimelineExpanded(schedule, nowMinutes) {
  return `
    <div class="tl-expanded-wrap" style="overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch">
      <style>
        .tl-expanded-wrap::-webkit-scrollbar{display:none}
        .tl-expanded{display:flex;align-items:flex-start;gap:0;min-width:max-content;padding:8px 4px;position:relative}
        .tl-expanded::before{content:'';position:absolute;top:26px;left:30px;right:30px;height:3px;background:linear-gradient(90deg,#e2e8f0,#cbd5e1);border-radius:2px;z-index:0}
        .tl-ev{display:flex;flex-direction:column;align-items:center;min-width:80px;max-width:90px;cursor:pointer;position:relative;z-index:1;padding:4px;transition:transform .15s;border-radius:16px}
        .tl-ev:active{transform:scale(.92)}
        .tl-ev:hover{background:rgba(0,0,0,.03)}
        .tl-dot{width:52px;height:52px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.4rem;border:3px solid #e2e8f0;background:white;transition:all .3s;position:relative;flex-shrink:0}
        .tl-dot.pending{border-color:#e2e8f0;background:#f8fafc}
        .tl-dot.in_progress{border-color:var(--ev-color,#FF8A00);background:var(--ev-color,#FF8A00);animation:tl-pulse 1.5s infinite;box-shadow:0 0 0 4px color-mix(in srgb,var(--ev-color,#FF8A00) 20%,transparent)}
        .tl-dot.completed{border-color:#28B54D;background:#28B54D}
        @keyframes tl-pulse{0%,100%{box-shadow:0 0 0 4px color-mix(in srgb,var(--ev-color,#FF8A00) 20%,transparent)}50%{box-shadow:0 0 0 8px color-mix(in srgb,var(--ev-color,#FF8A00) 10%,transparent)}}
        .tl-ev-label{font-size:.6rem;font-weight:900;text-transform:uppercase;letter-spacing:.04em;color:#94a3b8;text-align:center;line-height:1.2;margin-top:6px;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .tl-ev.active .tl-ev-label{color:var(--ev-color,#FF8A00);font-weight:900}
        .tl-ev.done .tl-ev-label{color:#28B54D}
        .tl-ev-time{font-size:.55rem;font-weight:700;color:#cbd5e1;margin-top:2px}
        .tl-ev.active .tl-ev-time{color:var(--ev-color,#FF8A00)}
        .tl-ev-count{font-size:.5rem;font-weight:900;color:#28B54D;margin-top:1px;background:#f0fdf4;border-radius:8px;padding:1px 6px}
        .tl-conn{width:20px;display:flex;align-items:center;justify-content:center;flex-shrink:0;padding-top:22px}
        .tl-conn-line{width:100%;height:3px;border-radius:2px;background:#e2e8f0}
        .tl-conn.done .tl-conn-line{background:linear-gradient(90deg,#86efac,#28B54D)}
      </style>
      <div class="tl-expanded">
        ${schedule.map((ev, i) => {
          const status = _getEventStatus(ev, nowMinutes);
          const isActive = status === 'in_progress';
          const isDone = status === 'completed';
          const dotClass = isDone ? 'completed' : isActive ? 'in_progress' : 'pending';
          const evClass = isActive ? 'active' : isDone ? 'done' : '';
          const checkMark = isDone ? '✓' : '';
          let connClass = '';
          if (i > 0 && _getEventStatus(schedule[i - 1], nowMinutes) === 'completed') connClass = 'done';
          return `
            ${i > 0 ? `<div class="tl-conn ${connClass}"><div class="tl-conn-line"></div></div>` : ''}
            <div class="tl-ev ${evClass}" onclick="App.expandTimelineEvent('${ev.id}')" style="--ev-color:${ev.color}">
              <div class="tl-dot ${dotClass}" style="--ev-color:${ev.color}">${checkMark || ev.emoji}</div>
              <span class="tl-ev-label">${safeEscapeHTML(ev.label)}</span>
              <span class="tl-ev-time">${_fmtTimeShort(ev.startTime)}</span>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function _renderTimelineCollapsed(schedule, nowMinutes) {
  return `
    <div class="tl-collapsed-bar" style="overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;padding:4px 0">
      <style>
        .tl-collapsed-bar::-webkit-scrollbar{display:none}
        .tl-collapsed{display:flex;align-items:center;gap:2px;min-width:max-content;padding:0 8px}
        .tl-c-dot{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1rem;border:2px solid #e2e8f0;background:white;cursor:pointer;transition:all .2s;flex-shrink:0;position:relative}
        .tl-c-dot:active{transform:scale(.85)}
        .tl-c-dot.current{border-color:var(--ev-color);background:var(--ev-color);box-shadow:0 0 0 3px color-mix(in srgb,var(--ev-color) 25%,transparent)}
        .tl-c-dot.done{border-color:#28B54D;background:#28B54D;color:white}
        .tl-c-dot.done::after{content:'✓';position:absolute;font-size:.5rem;font-weight:900;color:white}
        .tl-c-line{width:12px;height:2px;background:#e2e8f0;flex-shrink:0;border-radius:1px}
        .tl-c-line.done{background:#28B54D}
      </style>
      <div class="tl-collapsed">
        ${schedule.map((ev, i) => {
          const status = _getEventStatus(ev, nowMinutes);
          const isCurrent = status === 'in_progress';
          const isDone = status === 'completed';
          let lineClass = '';
          if (i > 0 && _getEventStatus(schedule[i - 1], nowMinutes) === 'completed') lineClass = 'done';
          const dotClass = isDone ? 'done' : isCurrent ? 'current' : '';
          return `
            ${i > 0 ? `<div class="tl-c-line ${lineClass}"></div>` : ''}
            <div class="tl-c-dot ${dotClass}" style="--ev-color:${ev.color}" onclick="App.expandTimelineEvent('${ev.id}')" title="${safeEscapeHTML(ev.label)} ${_fmtTimeShort(ev.startTime)}">${ev.emoji}</div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LEVEL 2 — ACCIONES COLECTIVAS DEL AULA
// ═══════════════════════════════════════════════════════════════════════════════

function _renderCollectiveActions(schedule, students, logsMap, nowMinutes) {
  const allCollective = [
    ...schedule.filter(e => e.groupEventId),
    ...COLLECTIVE_QUICK_EVENTS.filter(qe => !schedule.some(e => e.groupEventId === qe.groupEventId))
  ];

  return `
    <div class="ra-section">
      <style>
        .ra-section{margin-top:4px}
        .ra-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;padding:0 4px}
        .ra-title{font-size:.65rem;font-weight:900;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em}
        .ra-subtitle{font-size:.55rem;font-weight:700;color:#cbd5e1}
        .ra-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:8px;padding:0 4px}
        .ra-btn{display:flex;flex-direction:column;align-items:center;gap:4px;padding:12px 6px;border-radius:16px;border:2px solid #f1f5f9;background:white;cursor:pointer;transition:all .15s;touch-action:manipulation}
        .ra-btn:active{transform:scale(.93);background:#f8fafc}
        .ra-btn.done{border-color:#bbf7d0;background:#f0fdf4}
        .ra-btn.active{border-color:var(--ev-color,#FF8A00);background:color-mix(in srgb,var(--ev-color,#FF8A00) 6%,white)}
        .ra-emoji{font-size:1.6rem;line-height:1}
        .ra-label{font-size:.6rem;font-weight:900;text-transform:uppercase;letter-spacing:.03em;color:#64748b;text-align:center;line-height:1.2}
        .ra-btn.done .ra-label{color:#16a34a}
        .ra-btn.active .ra-label{color:var(--ev-color,#FF8A00)}
        .ra-count{font-size:.5rem;font-weight:800;color:#94a3b8;margin-top:1px}
        .ra-btn.done .ra-count{color:#22c55e}
        .ra-check{font-size:.7rem;font-weight:900;color:#22c55e}
      </style>
      <div class="ra-header">
        <div>
          <div class="ra-title">Acciones del Aula</div>
          <div class="ra-subtitle">Toca para registrar ${students.length > 0 ? `· ${students.length} alumnos` : ''}</div>
        </div>
      </div>
      <div class="ra-grid">
        ${allCollective.map(ev => {
          const status = ev.startTime ? _getEventStatus(ev, nowMinutes) : null;
          const progress = ev.groupEventId ? _getEventProgress(ev, students, logsMap) : null;
          const isDone = status === 'completed';
          const isActive = status === 'in_progress';
          const evColor = ev.color || '#94A3B8';
          return `
            <div class="ra-btn ${isDone ? 'done' : isActive ? 'active' : ''}"
              style="--ev-color:${ev.color}" onclick="App.routineQuickGroup('${ev.groupEventId}')">
              <span class="ra-emoji">${ev.emoji}</span>
              <span class="ra-label" style="${isActive ? 'color:' + evColor : ''}">${safeEscapeHTML(ev.label)}</span>
              ${progress && progress.total > 0 ? `<span class="ra-count">${progress.done}/${progress.total}</span>` : ''}
              ${isDone ? '<span class="ra-check">✓</span>' : ''}
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LEVEL 3 — TARJETAS DE LOS ALUMNOS
// ═══════════════════════════════════════════════════════════════════════════════

function _studentCardMini(s, log) {
  const prog = _calcProgress(log);
  const sleeping = !!_sleepMap[s.id];
  const hasMed = (log?.infant_data || []).some(e => e.type === 'med');

  let borderStyle = '';
  if (hasMed) borderStyle = 'border-color:#fca5a5';
  else if (sleeping) borderStyle = 'border-color:#c4b5fd';
  else if (prog >= 80) borderStyle = 'border-color:#86efac';

  const moodEmoji = { feliz: '😊', normal: '😐', triste: '😢', enojado: '😡', muy_feliz: '😁', cansado: '😴', enfermo: '🤒' }[log?.mood] || '😀';
  let foodIcons = '';
  if (log?.food) {
    try {
      const foodObj = JSON.parse(log.food);
      if (foodObj.breakfast) foodIcons += '🍞';
      if (foodObj.lunch) foodIcons += '🥗';
      if (foodObj.snack) foodIcons += '🍎';
    } catch {}
  }
  const napIcon = log?.nap ? '💤' : '○';
  const diaperCount = (log?.infant_data || []).filter(e => e.type === 'diaper' || e.type === 'bath').length;

  return `
    <div class="sc-card" style="${borderStyle}" onclick="App.openStudentRoutine('${s.id}')">
      ${sleeping ? '<div class="sc-badge sc-badge-sleep">💤</div>' : ''}
      ${hasMed ? '<div class="sc-badge sc-badge-med">💊</div>' : ''}
      <div class="sc-avatar">
        ${s.avatar_url ? `<img src="${safeUrl(s.avatar_url)}" class="w-full h-full object-cover rounded-xl">` : `<span>${safeEscapeHTML((s.name || '?').charAt(0))}</span>`}
      </div>
      <div class="sc-name">${safeEscapeHTML((s.name || '').split(' ')[0])}</div>
      <div class="sc-icons">${moodEmoji}${foodIcons || '○'}${napIcon}${diaperCount > 0 ? '🚽' + diaperCount : ''}</div>
      <div class="sc-prog"><div class="sc-prog-fill" style="width:${prog}%;background:${prog >= 80 ? '#28B54D' : prog >= 50 ? '#FF8A00' : '#94A3B8'}"></div></div>
    </div>
  `;
}

function _renderStudentCards(students, logsMap) {
  return `
    <div class="sc-section">
      <style>
        .sc-section{margin-top:4px}
        .sc-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;padding:0 4px}
        .sc-title{font-size:.65rem;font-weight:900;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em}
        .sc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:8px;padding:0 4px}
        .sc-card{border-radius:16px;padding:10px 6px;border:2px solid #e2e8f0;background:white;cursor:pointer;touch-action:manipulation;transition:all .15s;display:flex;flex-direction:column;align-items:center;text-align:center;gap:3px;position:relative;min-height:100px}
        .sc-card:active{transform:scale(.94)}
        .sc-badge{position:absolute;top:4px;font-size:.5rem;border-radius:6px;padding:1px 5px;font-weight:900;z-index:2}
        .sc-badge-sleep{left:4px;background:#ede9fe;color:#7c3aed}
        .sc-badge-med{right:4px;background:#fecdd3;color:#ef4444}
        .sc-avatar{width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,#fff7ed,#ffedd5);overflow:hidden;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:.8rem;color:#FF8A00;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,.06);flex-shrink:0}
        .sc-name{font-size:.6rem;font-weight:900;color:#1e293b;line-height:1.1;max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .sc-icons{font-size:.75rem;line-height:1;letter-spacing:1px}
        .sc-prog{height:3px;border-radius:2px;background:#f1f5f9;overflow:hidden;width:100%}
        .sc-prog-fill{height:100%;border-radius:2px;transition:width .5s}
      </style>
      <div class="sc-header">
        <div class="sc-title">Reportes Individuales</div>
        <button onclick="App.openBulkRoutineModal()" class="text-[10px] font-black text-blue-600 uppercase tracking-wide">Reporte masivo</button>
      </div>
      <div class="sc-grid">
        ${students.map(s => _studentCardMini(s, logsMap[s.id])).join('')}
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPANDED EVENT PANEL (Level 1 click)
// ═══════════════════════════════════════════════════════════════════════════════

function _renderExpandedEvent(event, students, logsMap, nowMinutes) {
  const progress = _getEventProgress(event, students, logsMap);
  const startMin = _timeToMinutes(event.startTime);
  const endMin = startMin + (event.duration || 30);
  return `
    <div class="rounded-2xl border-2 overflow-hidden mb-3" style="border-color:${event.color}30;background:white;animation:evSlideIn .25s ease">
      <style>@keyframes evSlideIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}</style>
      <div class="p-4 flex items-center gap-3" style="background:${event.color}10">
        <span class="text-2xl">${event.emoji}</span>
        <div class="flex-1 min-w-0">
          <h4 class="font-black text-sm" style="color:${event.color}">${safeEscapeHTML(event.label)}</h4>
          <div class="text-[10px] font-bold text-slate-400">${_fmtTimeShort(event.startTime)} – ${_fmtTimeShort(_minutesToTime(endMin))} · ${event.duration}min</div>
        </div>
        <button onclick="App.collapseTimelineEvent();event.stopPropagation()" class="p-1.5 rounded-lg bg-white/60 hover:bg-white text-slate-400">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      ${event.groupEventId ? `
      <div class="px-4 py-3 border-b border-slate-100">
        <div class="flex items-center justify-between mb-1.5">
          <span class="text-[10px] font-bold text-slate-600">${progress.done} de ${progress.total} registrados</span>
          <span class="text-[10px] font-black" style="color:${event.color}">${progress.pct}%</span>
        </div>
        <div class="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div class="h-full rounded-full transition-all duration-500" style="width:${progress.pct}%;background:${event.color}"></div>
        </div>
        ${progress.markedStudents?.length > 0 ? `
        <div class="flex flex-wrap gap-1 mt-2">
          ${progress.markedStudents.map(name => `<span class="text-[8px] font-bold px-2 py-0.5 rounded-full bg-green-50 text-green-700">✓ ${safeEscapeHTML((name || '').split(' ')[0])}</span>`).join('')}
        </div>` : ''}
      </div>` : ''}
      <div class="p-3 flex gap-2">
        ${event.groupEventId ? `<button onclick="App.routineQuickGroup('${event.groupEventId}');event.stopPropagation()" class="flex-1 py-2.5 rounded-xl font-black text-[10px] uppercase text-white tracking-wider" style="background:${event.color}">Registrar Ahora</button>` : ''}
        <button onclick="App.openEventConfig('${event.id}');event.stopPropagation()" class="px-3 py-2.5 rounded-xl border-2 border-slate-200 font-black text-[10px] uppercase text-slate-500">⚙️</button>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN UI BUILDER — 4 LEVELS
// ═══════════════════════════════════════════════════════════════════════════════

function _buildUI(students, schedule, nowMinutes, todayLabel, timeLabel, complete) {
  const totalStu = students.length;
  const progressPct = totalStu > 0 ? Math.round((complete / totalStu) * 100) : 0;
  const currentEvent = schedule.find(e => _getEventStatus(e, nowMinutes) === 'in_progress');
  const nextEvent = schedule.find(e => _getEventStatus(e, nowMinutes) === 'pending');
  const openSleeps = Object.keys(_sleepMap).length;
  const isCollapsed = _timelineCollapsed;

  return `
    <div class="space-y-4 pb-28" id="routineView">

      <!-- STICKY HEADER -->
      <div style="position:sticky;top:0;z-index:40;background:white;border-bottom:2px solid #f1f5f9;padding:10px 0;margin-bottom:4px">
        <div class="flex items-center justify-between mb-2 px-1">
          <div>
            <h3 class="text-lg font-black text-slate-800">Rutina Express</h3>
            <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">${todayLabel} · ${timeLabel}</p>
          </div>
          <div class="flex gap-2 items-center">
            <div class="text-right">
              <div class="text-xs font-black text-slate-700">${complete}/${totalStu}</div>
              <div class="text-[9px] font-bold text-slate-400 uppercase">Completos</div>
            </div>
            <button onclick="App.initRoutine()" class="p-2 rounded-xl bg-slate-100 text-slate-500" title="Actualizar">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 11-6.219-8.56"/><path d="M21 3v5h-5"/></svg>
            </button>
          </div>
        </div>
        <div class="mx-1" style="height:5px;border-radius:3px;background:#e2e8f0;overflow:hidden">
          <div style="height:100%;border-radius:3px;background:${progressPct >= 80 ? '#28B54D' : progressPct >= 50 ? '#FF8A00' : '#EF4444'};width:${progressPct}%;transition:width .5s"></div>
        </div>
      </div>

      <!-- CURRENT/NEXT EVENT BANNER -->
      ${currentEvent ? `
        <div class="rounded-2xl p-4 flex items-center gap-3" style="background:${currentEvent.color}10;border:2px solid ${currentEvent.color}30">
          <span class="text-3xl">${currentEvent.emoji}</span>
          <div class="flex-1">
            <div class="text-[9px] font-black uppercase tracking-widest" style="color:${currentEvent.color}">En curso ahora</div>
            <div class="text-sm font-black text-slate-800">${safeEscapeHTML(currentEvent.label)}</div>
          </div>
          <button onclick="App.expandTimelineEvent('${currentEvent.id}')" class="px-3 py-2 rounded-xl font-black text-[10px] text-white uppercase" style="background:${currentEvent.color}">Ver</button>
        </div>
      ` : nextEvent ? `
        <div class="rounded-2xl p-4 flex items-center gap-3 bg-slate-50 border-2 border-slate-100">
          <span class="text-3xl opacity-50">${nextEvent.emoji}</span>
          <div class="flex-1">
            <div class="text-[9px] font-black uppercase tracking-widest text-slate-400">Próximo evento</div>
            <div class="text-sm font-black text-slate-600">${safeEscapeHTML(nextEvent.label)}</div>
            <div class="text-[10px] font-bold text-slate-400">Inicia a las ${_fmtTimeShort(nextEvent.startTime)}</div>
          </div>
        </div>
      ` : ''}

      <!-- OPEN SLEEP ALERT -->
      ${openSleeps > 0 ? `
        <button onclick="App.routineWakeAll()" class="w-full flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left active:scale-[.98]" style="background:#f5f3ff;border:2px solid #c4b5fd">
          <div class="flex items-center gap-3">
            <span class="text-2xl">😴</span>
            <div>
              <div class="text-sm font-black" style="color:#7c3aed">${openSleeps} siesta(s) activa(s)</div>
              <div class="text-xs" style="color:#a78bfa">Toca para registrar que despertaron todos</div>
            </div>
          </div>
          <span class="text-[10px] font-black text-white px-3 py-1.5 rounded-full" style="background:#7c3aed">Despertar</span>
        </button>
      ` : ''}

      <!-- ═══════════════════════════════════════════════════════════════ -->
      <!-- LEVEL 1: TIMELINE DEL DÍA (COLLAPSABLE) -->
      <!-- ═══════════════════════════════════════════════════════════════ -->
      <div>
        <div class="flex items-center justify-between mb-2 px-1">
          <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Línea de tiempo del día</p>
          <div class="flex items-center gap-2">
            <button onclick="App.toggleTimeline()" class="text-[10px] font-black uppercase tracking-wide flex items-center gap-1 px-2 py-1 rounded-lg ${isCollapsed ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-500'}">
              ${isCollapsed ? '▼ Mostrar' : '▲ Ocultar'}
            </button>
            <button onclick="App.openScheduleConfig()" class="text-[10px] font-black text-blue-600 uppercase tracking-wide flex items-center gap-1">⚙️</button>
          </div>
        </div>
        ${isCollapsed ? _renderTimelineCollapsed(schedule, nowMinutes) : _renderTimelineExpanded(schedule, nowMinutes)}
      </div>

      <!-- EXPANDED EVENT PANEL -->
      <div id="expandedEventPanel"></div>

      <!-- ═══════════════════════════════════════════════════════════════ -->
      <!-- LEVEL 2: ACCIONES COLECTIVAS DEL AULA -->
      <!-- ═══════════════════════════════════════════════════════════════ -->
      ${_renderCollectiveActions(schedule, students, _logsMap, nowMinutes)}

      <!-- ═══════════════════════════════════════════════════════════════ -->
      <!-- LEVEL 3: TARJETAS DE LOS ALUMNOS -->
      <!-- ═══════════════════════════════════════════════════════════════ -->
      ${_renderStudentCards(students, _logsMap)}
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════════════

export async function initRoutine() {
  const classroom = AppState.get('classroom');
  const container = document.getElementById('tab-daily-routine');
  if (!container) return;

  container.innerHTML = `<div class="animate-pulse space-y-4">
    <div class="h-16 bg-slate-100 rounded-2xl"></div>
    <div class="h-24 bg-slate-50 rounded-2xl"></div>
    <div class="grid grid-cols-5 gap-3">${Array(10).fill('<div class="h-20 bg-slate-50 rounded-2xl"></div>').join('')}</div>
  </div>`;

  const allStudents = AppState.get('students') || [];
  const today = _today();
  const now = new Date();
  const todayLabel = now.toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long' });
  const timeLabel = _fmtTime(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const schedule = _getSchedule();

  const attendance = await MaestraApi.getAttendance(classroom.id, today);
  const presentStudentIds = new Set(
    attendance.filter(a => ['present', 'late'].includes(a.status)).map(a => a.student_id)
  );
  const students = allStudents.filter(s => presentStudentIds.has(s.id));

  const logs = await MaestraApi.getDailyRoutine(classroom.id, today);
  _logsMap = {};
  (logs || []).forEach(log => { _logsMap[log.student_id] = log; });

  _sleepMap = {};
  (logs || []).forEach(log => {
    const ev = (log.infant_data || []).filter(e => e.type === 'sleep' && !e.end_time).pop();
    if (ev) _sleepMap[log.student_id] = ev;
  });

  const complete = students.filter(s => _calcProgress(_logsMap[s.id]) >= 80).length;
  container.innerHTML = _buildUI(students, schedule, nowMinutes, todayLabel, timeLabel, complete);

  if (_expandedEvent) {
    const panel = document.getElementById('expandedEventPanel');
    if (panel) {
      const ev = schedule.find(e => e.id === _expandedEvent);
      if (ev) panel.innerHTML = _renderExpandedEvent(ev, students, _logsMap, nowMinutes);
    }
  }

  if (window.lucide) lucide.createIcons();

  setTimeout(() => {
    const bar = document.querySelector('.tl-collapsed-bar, .tl-expanded-wrap');
    if (bar) {
      const activeEl = bar.querySelector('.tl-c-dot.current, .tl-ev.active');
      if (activeEl) activeEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, 200);

  _clearAutoRefresh();
  _autoRefreshTimer = setInterval(() => {
    const c = document.getElementById('tab-daily-routine');
    if (c && !c.classList.contains('hidden')) initRoutine();
  }, 60000);
}

function _clearAutoRefresh() {
  if (_autoRefreshTimer) { clearInterval(_autoRefreshTimer); _autoRefreshTimer = null; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TIMELINE TOGGLE
// ═══════════════════════════════════════════════════════════════════════════════

export function toggleTimeline() {
  _timelineCollapsed = !_timelineCollapsed;
  localStorage.setItem('sonrisas_tl_collapsed', _timelineCollapsed ? '1' : '0');
  initRoutine();
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPAND / COLLAPSE EVENT
// ═══════════════════════════════════════════════════════════════════════════════

export function expandTimelineEvent(eventId) {
  _expandedEvent = _expandedEvent === eventId ? null : eventId;
  const panel = document.getElementById('expandedEventPanel');
  if (!panel) return;
  if (!_expandedEvent) { panel.innerHTML = ''; return; }
  const schedule = _getSchedule();
  const ev = schedule.find(e => e.id === eventId);
  if (!ev) return;
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const students = AppState.get('students') || [];
  panel.innerHTML = _renderExpandedEvent(ev, students, _logsMap, nowMinutes);
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

export function collapseTimelineEvent() {
  _expandedEvent = null;
  const panel = document.getElementById('expandedEventPanel');
  if (panel) panel.innerHTML = '';
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

export function openEventConfig(eventId) {
  const ev = (_scheduleConfig || DEFAULT_SCHEDULE).find(e => e.id === eventId);
  if (!ev) return;
  const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const modalContent = `
    <div class="bg-white overflow-hidden" style="border-radius:32px">
      <div class="p-6" style="background:linear-gradient(135deg,${ev.color},${ev.color}cc)">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span class="text-3xl">${ev.emoji}</span>
            <div>
              <h3 class="text-xl font-black text-white">${safeEscapeHTML(ev.label)}</h3>
              <p class="text-sm font-bold text-white/80">Configurar evento</p>
            </div>
          </div>
          <button onclick="UI.Modal.close('eventConfigModal')" class="p-2 rounded-xl bg-white/20 text-white">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      </div>
      <div class="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
        <div>
          <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hora de inicio</label>
          <input type="time" id="cfgStartTime" value="${ev.startTime}" class="w-full mt-1 p-3 border-2 border-slate-100 rounded-xl text-sm font-bold text-slate-700 outline-none focus:border-blue-400">
        </div>
        <div>
          <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Duración (minutos)</label>
          <input type="number" id="cfgDuration" value="${ev.duration}" min="5" max="480" class="w-full mt-1 p-3 border-2 border-slate-100 rounded-xl text-sm font-bold text-slate-700 outline-none focus:border-blue-400">
        </div>
        <div>
          <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Emoji</label>
          <input type="text" id="cfgEmoji" value="${ev.emoji}" maxlength="4" class="w-full mt-1 p-3 border-2 border-slate-100 rounded-xl text-2xl text-center outline-none focus:border-blue-400">
        </div>
        <div>
          <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Color</label>
          <input type="color" id="cfgColor" value="${ev.color}" class="w-full mt-1 h-12 border-2 border-slate-100 rounded-xl cursor-pointer">
        </div>
        <div>
          <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Días de ejecución</label>
          <div class="flex gap-1.5 mt-1 flex-wrap">
            ${[0,1,2,3,4,5,6].map(d => `
              <button onclick="this.classList.toggle('border-blue-400');this.classList.toggle('bg-blue-50');this.classList.toggle('border-slate-100')"
                class="cfg-day-btn px-3 py-2 rounded-xl border-2 ${ev.days.includes(d) ? 'border-blue-400 bg-blue-50' : 'border-slate-100'} text-xs font-black ${ev.days.includes(d) ? 'text-blue-600' : 'text-slate-400'}"
                data-day="${d}">${dayNames[d]}</button>
            `).join('')}
          </div>
        </div>
        <div class="flex items-center justify-between p-3 rounded-xl bg-slate-50">
          <span class="text-sm font-bold text-slate-700">Activo</span>
          <label class="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" id="cfgActive" ${ev.active ? 'checked' : ''} class="sr-only peer">
            <div class="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
          </label>
        </div>
        <div class="flex gap-3 pt-2">
          <button onclick="UI.Modal.close('eventConfigModal')" class="flex-1 py-3 rounded-xl border-2 border-slate-200 font-black text-xs uppercase text-slate-500">Cancelar</button>
          <button onclick="App.saveEventConfig('${ev.id}')" class="flex-1 py-3 rounded-xl font-black text-xs uppercase text-white" style="background:${ev.color}">Guardar</button>
        </div>
      </div>
    </div>
  `;
  UI.Modal.open('eventConfigModal', modalContent);
}

export function saveEventConfig(eventId) {
  const evIndex = (_scheduleConfig || []).findIndex(e => e.id === eventId);
  if (evIndex === -1) return;
  _scheduleConfig[evIndex] = {
    ..._scheduleConfig[evIndex],
    startTime: document.getElementById('cfgStartTime')?.value || _scheduleConfig[evIndex].startTime,
    duration: parseInt(document.getElementById('cfgDuration')?.value) || _scheduleConfig[evIndex].duration,
    emoji: document.getElementById('cfgEmoji')?.value || _scheduleConfig[evIndex].emoji,
    color: document.getElementById('cfgColor')?.value || _scheduleConfig[evIndex].color,
    active: document.getElementById('cfgActive')?.checked ?? true,
    days: (() => { const d = []; document.querySelectorAll('.cfg-day-btn').forEach(b => { if (b.classList.contains('border-blue-400')) d.push(parseInt(b.dataset.day)); }); return d.length > 0 ? d : _scheduleConfig[evIndex].days; })()
  };
  _saveScheduleConfig();
  UI.Modal.close('eventConfigModal');
  safeToast('Evento configurado', 'success');
  initRoutine();
}

export function openScheduleConfig() {
  const schedule = _scheduleConfig || DEFAULT_SCHEDULE;
  const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  UI.Modal.open('scheduleConfigModal', `
    <div class="bg-white overflow-hidden" style="border-radius:32px;max-height:85vh;overflow-y:auto">
      <div class="p-6" style="background:linear-gradient(135deg,#0B63C7,#28B54D)">
        <div class="flex items-center justify-between">
          <div><h3 class="text-xl font-black text-white">Configurar Horario</h3><p class="text-sm font-bold text-white/80">Personaliza la rutina del día</p></div>
          <button onclick="UI.Modal.close('scheduleConfigModal')" class="p-2 rounded-xl bg-white/20 text-white"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
        </div>
      </div>
      <div class="p-4 space-y-2">
        ${schedule.map(ev => `
          <div class="flex items-center gap-3 p-3 rounded-xl border border-slate-100 bg-white hover:border-blue-200 transition-all cursor-pointer" onclick="App.openEventConfig('${ev.id}')">
            <span class="text-xl">${ev.emoji}</span>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-black text-slate-800 truncate">${safeEscapeHTML(ev.label)}</div>
              <div class="text-[10px] font-bold text-slate-400">${_fmtTimeShort(ev.startTime)} · ${ev.duration}min</div>
            </div>
            <div class="flex items-center gap-2">
              <span class="w-3 h-3 rounded-full" style="background:${ev.color}"></span>
              <span class="text-[10px] font-bold ${ev.active ? 'text-green-600' : 'text-slate-300'}">${ev.active ? 'Activo' : 'Inactivo'}</span>
            </div>
          </div>
        `).join('')}
      </div>
      <div class="p-4 border-t border-slate-100">
        <button onclick="App.resetScheduleConfig()" class="w-full py-3 rounded-xl border-2 border-red-200 font-black text-xs uppercase text-red-500">Restaurar Horario Predeterminado</button>
      </div>
    </div>
  `);
}

export function resetScheduleConfig() {
  _scheduleConfig = DEFAULT_SCHEDULE.map(e => ({ ...e }));
  _saveScheduleConfig();
  UI.Modal.close('scheduleConfigModal');
  safeToast('Horario restaurado', 'success');
  initRoutine();
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUICK GROUP EVENT
// ═══════════════════════════════════════════════════════════════════════════════

export async function routineQuickGroup(eventId) {
  const classroom = AppState.get('classroom');
  const allStudents = AppState.get('students') || [];
  const today = _today();
  const attendance = await MaestraApi.getAttendance(classroom.id, today);
  const presentStudentIds = new Set(attendance.filter(a => ['present', 'late'].includes(a.status)).map(a => a.student_id));
  const students = allStudents.filter(s => presentStudentIds.has(s.id));

  const EVENT_MAP = {
    breakfast: { field: 'food', foodKey: 'breakfast', value: 'todo', label: 'Desayuno' },
    lunch: { field: 'food', foodKey: 'lunch', value: 'todo', label: 'Almuerzo' },
    snack: { field: 'food', foodKey: 'snack', value: 'todo', label: 'Merienda' },
    handwash: { field: '_group', value: 'handwash', label: 'Lavado de manos' },
    toothbrush: { field: '_group', value: 'toothbrush', label: 'Cepillado dental' },
    activity: { field: '_group', value: 'activity', label: 'Actividad educativa' },
    playground: { field: '_group', value: 'playground', label: 'Salida al patio' },
    sleep_start: { field: '_sleep', value: 'start', label: 'Iniciar siesta' },
    sleep_end: { field: '_sleep', value: 'end', label: 'Terminar siesta' },
    bathroom: { field: '_group', value: 'bath', label: 'Baño' },
    poop_gr: { field: '_group', value: 'diaper', subtype: 'soiled', label: 'Popó' },
    milk_gr: { field: '_group', value: 'milk', label: 'Biberón' }
  };

  const ev = EVENT_MAP[eventId];
  if (!ev) return;

  try {
    for (const s of students) {
      if (_isDuplicate(s.id, eventId)) continue;
      const payload = { student_id: s.id, classroom_id: classroom.id, date: today, created_at: new Date().toISOString() };
      if (ev.field === 'food') {
        let currentFood = {};
        try { currentFood = JSON.parse(_logsMap[s.id]?.food || '{}'); } catch {}
        currentFood[ev.foodKey] = ev.value;
        payload.food = JSON.stringify(currentFood);
      } else if (ev.field === '_sleep') {
        payload.infant_event = { type: 'sleep', label: ev.value === 'end' ? 'Terminar siesta' : 'Iniciar siesta', start_time: new Date().toISOString(), end_time: ev.value === 'end' ? new Date().toISOString() : null };
      } else if (ev.field === '_group') {
        payload.infant_event = { type: ev.value, subtype: ev.subtype, label: ev.label };
      }
      await MaestraApi.upsertDailyLog(payload);
    }
    safeToast(`${ev.label} registrado para todos!`, 'success');
    await initRoutine();
  } catch (err) {
    safeToast('Error al registrar evento grupal', 'error');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// LEVEL 4 — MODAL INDIVIDUAL
// ═══════════════════════════════════════════════════════════════════════════════

export function openStudentRoutine(studentId) {
  const students = AppState.get('students') || [];
  const student = students.find(s => s.id === studentId);
  if (!student) return;
  const log = _logsMap[studentId];
  let currentFood = {};
  if (log?.food) { try { currentFood = JSON.parse(log.food); } catch {} }
  const mealLabels = { breakfast: '🍞 Desayuno', lunch: '🥗 Almuerzo', snack: '🍎 Merienda' };
  const foodOptions = [
    { val: 'todo', icon: '✅', label: 'Todo' },
    { val: 'poco', icon: '⚠️', label: 'Poco' },
    { val: 'nada', icon: '❌', label: 'Nada' },
    { val: 'ayuda', icon: '🆘', label: 'Ayuda' }
  ];

  const events = log?.infant_data || [];
  const EVENT_ICONS = { sleep: '😴', milk: '🍼', diaper: e => e.subtype === 'wet' ? '💧' : '💩', bath: '🚽', temp: '🌡️', med: '💊', behavior: '🤝', handwash: '🧼', toothbrush: '🪥', activity: '🏫', playground: '🌳', health: e => e.subtype === 'vomit' ? '🤮' : '😷', incident: '🤕', note: '📝' };
  const EVENT_LABELS = { handwash: 'Lavado de manos', toothbrush: 'Cepillado dental', activity: 'Actividad', playground: 'Patio', sleep: 'Siesta', milk: 'Biberón', diaper: 'Pañal', bath: 'Baño', temp: 'Temperatura', med: 'Medicamento', note: 'Nota', behavior: 'Comportamiento' };

  const timelineHtml = events.length > 0 ? events.map(evt => {
    const time = evt.created_at ? _fmtTime(evt.created_at) : (evt.start_time ? _fmtTime(evt.start_time) : '');
    const label = evt.label || EVENT_LABELS[evt.type] || evt.type;
    const getIcon = EVENT_ICONS[evt.type];
    const icon = typeof getIcon === 'function' ? getIcon(evt) : (getIcon || '📌');
    const detail = evt.type === 'sleep' ? (evt.end_time ? 'Despertó ' + _fmtTime(evt.end_time) : 'En siesta...') : evt.type === 'milk' ? (evt.oz ? evt.oz + ' oz' : '') : evt.type === 'temp' ? (evt.value ? evt.value + '°C' : '') : '';
    return `
      <div class="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50">
        <div class="w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0" style="background:#f1f5f9">${icon}</div>
        <div class="flex-1 min-w-0">
          <div class="text-xs font-bold text-slate-700">${safeEscapeHTML(label)}</div>
          ${detail ? `<div class="text-[10px] text-slate-400">${safeEscapeHTML(detail)}</div>` : ''}
        </div>
        <span class="text-[10px] font-bold text-slate-400">${time}</span>
      </div>
    `;
  }).join('') : '<p class="text-center text-slate-400 text-xs py-4">Sin eventos aún</p>';

  const modalContent = `
    <div class="bg-white overflow-hidden" style="border-radius:32px">
      <div class="p-5" style="background:linear-gradient(135deg,#28B54D,#239943)">
        <div class="flex items-center gap-4">
          <div class="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center overflow-hidden">
            ${student.avatar_url ? `<img src="${safeUrl(student.avatar_url)}" class="w-full h-full object-cover">` : `<span class="text-xl font-black text-white">${safeEscapeHTML((student.name || '?').charAt(0))}</span>`}
          </div>
          <div class="flex-1">
            <h3 class="text-lg font-black text-white">${safeEscapeHTML(student.name)}</h3>
            <p class="text-xs font-bold text-white/80">${safeEscapeHTML(student.p1_name || '—')}</p>
          </div>
          <button onclick="UI.Modal.close('studentRoutineModal')" class="p-2 rounded-xl bg-white/20 text-white">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      </div>

      <div class="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
        <!-- Estado Emocional -->
        <div>
          <h4 class="text-xs font-black text-slate-800 mb-2">😊 Estado Emocional</h4>
          <div class="grid grid-cols-7 gap-1.5">
            ${[
              { emoji: '😊', val: 'feliz', lbl: 'Feliz' }, { emoji: '😁', val: 'muy_feliz', lbl: 'Muy Feliz' },
              { emoji: '😐', val: 'normal', lbl: 'Tranquilo' }, { emoji: '😢', val: 'triste', lbl: 'Triste' },
              { emoji: '😡', val: 'enojado', lbl: 'Molesto' }, { emoji: '😴', val: 'cansado', lbl: 'Cansado' },
              { emoji: '🤒', val: 'enfermo', lbl: 'Enfermo' }
            ].map(m => `
              <button onclick="App.setStudentMood('${studentId}','${m.val}')"
                class="p-2 rounded-xl border-2 ${log?.mood === m.val ? 'border-blue-400 bg-blue-50' : 'border-slate-100 bg-white'} text-xl" title="${m.lbl}">${m.emoji}</button>
            `).join('')}
          </div>
        </div>

        <!-- Alimentación -->
        <div>
          <h4 class="text-xs font-black text-slate-800 mb-2">🍽️ Alimentación</h4>
          <div class="space-y-2">
            ${['breakfast', 'lunch', 'snack'].map(mealKey => {
              const currentVal = currentFood[mealKey] || '';
              return `
                <div class="rounded-xl border border-slate-100 p-2.5">
                  <div class="flex items-center justify-between mb-1.5">
                    <span class="text-[11px] font-black text-slate-600">${mealLabels[mealKey]}</span>
                    ${currentVal ? `<span class="text-[9px] font-bold px-2 py-0.5 rounded-full ${currentVal === 'todo' ? 'bg-green-100 text-green-700' : currentVal === 'poco' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}">${foodOptions.find(f => f.val === currentVal)?.label || currentVal}</span>` : ''}
                  </div>
                  <div class="grid grid-cols-4 gap-1">
                    ${foodOptions.map(fo => `
                      <button onclick="App.setStudentFood('${studentId}','${fo.val}','${mealKey}')"
                        class="p-1.5 rounded-lg border-2 ${currentVal === fo.val ? 'border-blue-400 bg-blue-50' : 'border-slate-100 bg-white'} text-center">
                        <span class="text-base">${fo.icon}</span>
                        <span class="text-[7px] font-black text-slate-500 block">${fo.label}</span>
                      </button>
                    `).join('')}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Siesta -->
        <div>
          <h4 class="text-xs font-black text-slate-800 mb-2">😴 Ciclo de Sueño</h4>
          <div class="grid grid-cols-4 gap-1.5">
            ${[
              { val: 'si', label: 'Dormido', icon: '💤' }, { val: 'no', label: 'No durmió', icon: '☀️' },
              { val: 'poco', label: 'Se despertó', icon: '⏰' }, { val: 'excelente', label: 'Excelente', icon: '⭐' }
            ].map(n => `
              <button onclick="App.setStudentNap('${studentId}','${n.val}')"
                class="p-2 rounded-xl border-2 ${log?.nap === n.val ? 'border-blue-400 bg-blue-50' : 'border-slate-100 bg-white'} text-center">
                <span class="text-base">${n.icon}</span>
                <span class="text-[8px] font-black text-slate-600 block">${n.label}</span>
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Higiene -->
        <div>
          <h4 class="text-xs font-black text-slate-800 mb-2">🧼 Higiene y Esfínteres</h4>
          <div class="grid grid-cols-5 gap-1.5">
            ${INDIV_EVENTS.filter(e => ['poop', 'pee', 'toilet', 'diaper'].includes(e.id)).map(ev => `
              <button onclick="App.addStudentEvent('${studentId}','${ev.id}')"
                class="p-2 rounded-xl border-2 border-slate-100 bg-white flex flex-col items-center gap-0.5">
                <span class="text-lg">${ev.icon}</span>
                <span class="text-[8px] font-black text-slate-600">${ev.label}</span>
              </button>
            `).join('')}
            <button onclick="App.addStudentEvent('${studentId}','handwash')"
              class="p-2 rounded-xl border-2 border-slate-100 bg-white flex flex-col items-center gap-0.5">
              <span class="text-lg">🧼</span>
              <span class="text-[8px] font-black text-slate-600">Lavado</span>
            </button>
          </div>
        </div>

        <!-- Salud -->
        <div>
          <h4 class="text-xs font-black text-slate-800 mb-2">🏥 Salud y Alertas</h4>
          <div class="grid grid-cols-5 gap-1.5">
            ${INDIV_EVENTS.filter(e => ['temp', 'med', 'hit', 'vomit', 'cough'].includes(e.id)).map(ev => `
              <button onclick="App.addStudentEvent('${studentId}','${ev.id}')"
                class="p-2 rounded-xl border-2 border-slate-100 bg-white flex flex-col items-center gap-0.5">
                <span class="text-lg">${ev.icon}</span>
                <span class="text-[8px] font-black text-slate-600">${ev.label}</span>
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Conducta Social -->
        <div>
          <h4 class="text-xs font-black text-slate-800 mb-2">🤝 Conducta Social</h4>
          <div class="grid grid-cols-2 gap-1.5">
            ${[
              { val: 'shared', icon: '🤝', label: 'Compartió' }, { val: 'alone', icon: '🧍', label: 'Jugó solo' },
              { val: 'group', icon: '👥', label: 'Grupo' }, { val: 'emotional_support', icon: '💛', label: 'Apoyo emocional' }
            ].map(b => `
              <button onclick="App.setStudentBehavior('${studentId}','social','${b.val}')"
                class="p-2 rounded-xl border-2 border-slate-100 bg-white flex items-center gap-2 text-left">
                <span class="text-base">${b.icon}</span>
                <span class="text-[9px] font-black text-slate-600">${b.label}</span>
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Conducta en Clase -->
        <div>
          <h4 class="text-xs font-black text-slate-800 mb-2">📚 Conducta en Clase</h4>
          <div class="grid grid-cols-2 gap-1.5">
            ${[
              { val: 'attention', icon: '👂', label: 'Atención' }, { val: 'participation', icon: '🙋', label: 'Participó' },
              { val: 'curiosity', icon: '🔍', label: 'Curiosidad' }, { val: 'completed', icon: '✅', label: 'Terminó' },
              { val: 'needed_help', icon: '🙋‍♀️', label: 'Necesitó ayuda' }
            ].map(b => `
              <button onclick="App.setStudentBehavior('${studentId}','classroom','${b.val}')"
                class="p-2 rounded-xl border-2 border-slate-100 bg-white flex items-center gap-2 text-left">
                <span class="text-base">${b.icon}</span>
                <span class="text-[9px] font-black text-slate-600">${b.label}</span>
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Regulación Emocional -->
        <div>
          <h4 class="text-xs font-black text-slate-800 mb-2">🧠 Regulación Emocional</h4>
          <div class="grid grid-cols-2 gap-1.5">
            ${[
              { val: 'controlled', icon: '😌', label: 'Controló' }, { val: 'frustrated', icon: '😤', label: 'Se frustró' },
              { val: 'crying', icon: '😭', label: 'Lloró' }, { val: 'anxious', icon: '😰', label: 'Ansiedad' },
              { val: 'calmed', icon: '🧘', label: 'Se calmó' }
            ].map(b => `
              <button onclick="App.setStudentBehavior('${studentId}','emotional','${b.val}')"
                class="p-2 rounded-xl border-2 border-slate-100 bg-white flex items-center gap-2 text-left">
                <span class="text-base">${b.icon}</span>
                <span class="text-[9px] font-black text-slate-600">${b.label}</span>
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Montessori -->
        <div>
          <h4 class="text-xs font-black text-slate-800 mb-2">🧩 Desarrollo Montessori</h4>
          <div class="grid grid-cols-3 gap-1.5">
            ${[
              { val: 'manipulation', icon: '🤲', label: 'Manipulación' }, { val: 'fine_motor', icon: '✋', label: 'Fina' },
              { val: 'gross_motor', icon: '🏃', label: 'Gruesa' }, { val: 'language', icon: '💬', label: 'Lenguaje' },
              { val: 'concentration', icon: '🎯', label: 'Concentración' }, { val: 'autonomy', icon: '💪', label: 'Autonomía' }
            ].map(b => `
              <button onclick="App.setStudentBehavior('${studentId}','montessori','${b.val}')"
                class="p-2 rounded-xl border-2 border-slate-100 bg-white flex flex-col items-center gap-0.5">
                <span class="text-base">${b.icon}</span>
                <span class="text-[8px] font-black text-slate-600">${b.label}</span>
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Nota -->
        <div>
          <h4 class="text-xs font-black text-slate-800 mb-2">📝 Nota Individual</h4>
          <textarea id="studentNote-${studentId}" placeholder="Escribe una nota sobre el día..."
            class="w-full p-3 border-2 border-slate-100 rounded-xl text-xs focus:border-blue-400 outline-none" rows="2">${safeEscapeHTML(log?.notes || '')}</textarea>
          <button onclick="App.saveStudentNote('${studentId}')"
            class="mt-2 w-full p-2.5 rounded-xl text-white font-black text-[10px] uppercase" style="background:#28B54D">Guardar Nota</button>
        </div>

        <!-- Timeline Individual -->
        <div>
          <h4 class="text-xs font-black text-slate-800 mb-2">🕐 Línea de tiempo del día</h4>
          <div class="space-y-1 max-h-48 overflow-y-auto">${timelineHtml}</div>
        </div>
      </div>
    </div>
  `;
  UI.Modal.open('studentRoutineModal', modalContent);
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

export async function setStudentMood(studentId, mood) {
  const classroom = AppState.get('classroom');
  try {
    await MaestraApi.upsertDailyLog({ student_id: studentId, classroom_id: classroom.id, date: _today(), mood });
    safeToast('Estado emocional guardado', 'success');
    await initRoutine();
  } catch { safeToast('Error al guardar', 'error'); }
}

export async function setStudentFood(studentId, food, mealKey) {
  const classroom = AppState.get('classroom');
  try {
    let currentFood = {};
    try { currentFood = JSON.parse(_logsMap[studentId]?.food || '{}'); } catch {}
    if (mealKey) currentFood[mealKey] = food;
    else {
      const hour = new Date().getHours();
      if (hour < 10) currentFood.breakfast = food;
      else if (hour < 14) currentFood.lunch = food;
      else currentFood.snack = food;
    }
    await MaestraApi.upsertDailyLog({ student_id: studentId, classroom_id: classroom.id, date: _today(), food: JSON.stringify(currentFood) });
    safeToast('Alimentación guardada', 'success');
    await initRoutine();
  } catch { safeToast('Error al guardar', 'error'); }
}

export async function setStudentNap(studentId, nap) {
  const classroom = AppState.get('classroom');
  try {
    await MaestraApi.upsertDailyLog({ student_id: studentId, classroom_id: classroom.id, date: _today(), nap });
    safeToast('Siesta guardada', 'success');
    await initRoutine();
  } catch { safeToast('Error al guardar', 'error'); }
}

export async function setStudentBehavior(studentId, category, value) {
  const classroom = AppState.get('classroom');
  try {
    await MaestraApi.upsertDailyLog({
      student_id: studentId, classroom_id: classroom.id, date: _today(),
      infant_event: { type: 'behavior', label: `Comportamiento: ${category}`, category, data: { [category]: value } }
    });
    safeToast('Comportamiento registrado', 'success');
    await initRoutine();
  } catch { safeToast('Error al guardar', 'error'); }
}

export async function addStudentEvent(studentId, eventId) {
  const classroom = AppState.get('classroom');
  const ev = INDIV_EVENTS.find(e => e.id === eventId);
  if (!ev) return;
  if (_isDuplicate(studentId, eventId)) { safeToast('Evento registrado hace poco', 'warning'); return; }
  try {
    if (ev.type === 'milk') {
      await MaestraApi.upsertDailyLog({ student_id: studentId, classroom_id: classroom.id, date: _today(), infant_event: { type: 'milk', label: ev.label, oz: null } });
    } else if (ev.type === 'temp') {
      const temp = prompt('Temperatura (°C):');
      if (temp === null) return;
      await MaestraApi.upsertDailyLog({ student_id: studentId, classroom_id: classroom.id, date: _today(), infant_event: { type: 'temp', label: ev.label, value: parseFloat(temp) || null } });
    } else if (ev.type === 'med') {
      const name = prompt('Nombre del medicamento:');
      if (name === null) return;
      await MaestraApi.upsertDailyLog({ student_id: studentId, classroom_id: classroom.id, date: _today(), infant_event: { type: 'med', label: ev.label, name, dose: null } });
    } else {
      await MaestraApi.upsertDailyLog({ student_id: studentId, classroom_id: classroom.id, date: _today(), infant_event: { type: ev.type, subtype: ev.subtype, label: ev.label } });
    }
    safeToast(`${ev.label} registrado`, 'success');
    await initRoutine();
  } catch { safeToast('Error al guardar', 'error'); }
}

export async function saveStudentNote(studentId) {
  const classroom = AppState.get('classroom');
  const noteEl = document.getElementById(`studentNote-${studentId}`);
  try {
    await MaestraApi.upsertDailyLog({ student_id: studentId, classroom_id: classroom.id, date: _today(), notes: noteEl?.value || '' });
    safeToast('Nota guardada', 'success');
    await initRoutine();
    UI.Modal.close('studentRoutineModal');
  } catch { safeToast('Error al guardar', 'error'); }
}

export async function routineWakeAll() {
  const classroom = AppState.get('classroom');
  const studentsToWake = Object.keys(_sleepMap);
  if (studentsToWake.length === 0) return;
  try {
    for (const studentId of studentsToWake) {
      await MaestraApi.upsertDailyLog({ student_id: studentId, classroom_id: classroom.id, date: _today(), infant_event: { type: 'sleep', end_time: new Date().toISOString() } });
    }
    safeToast('Todas las siestas terminadas!', 'success');
    await initRoutine();
  } catch { safeToast('Error al actualizar siestas', 'error'); }
}

export async function openBulkRoutineModal() {
  const students = AppState.get('students') || [];
  let missingBreakfast = 0, missingLunch = 0, missingSnack = 0;
  students.forEach(s => {
    const log = _logsMap[s.id];
    if (!log?.food) { missingBreakfast++; missingLunch++; missingSnack++; return; }
    try {
      const foodObj = JSON.parse(log.food);
      if (!foodObj.breakfast) missingBreakfast++;
      if (!foodObj.lunch) missingLunch++;
      if (!foodObj.snack) missingSnack++;
    } catch { missingBreakfast++; missingLunch++; missingSnack++; }
  });
  UI.Modal.open('bulkRoutineModal', `
    <div class="bg-white overflow-hidden" style="border-radius:32px">
      <div class="p-5" style="background:linear-gradient(135deg,#28B54D,#239943)">
        <h3 class="text-lg font-black text-white">Resumen de Reportes</h3>
        <p class="text-sm font-bold text-white/80">Revisa antes de publicar</p>
      </div>
      <div class="p-5 space-y-3">
        <div class="grid grid-cols-3 gap-3">
          <div class="p-3 rounded-2xl text-center bg-green-50"><div class="text-2xl font-black text-green-600">${students.filter(s => _calcProgress(_logsMap[s.id]) >= 80).length}</div><div class="text-[10px] font-bold text-green-700">Completos</div></div>
          <div class="p-3 rounded-2xl text-center bg-orange-50"><div class="text-2xl font-black text-orange-600">${missingBreakfast + missingLunch + missingSnack}</div><div class="text-[10px] font-bold text-orange-700">Pendientes</div></div>
          <div class="p-3 rounded-2xl text-center bg-purple-50"><div class="text-2xl font-black text-purple-600">${Object.keys(_sleepMap).length}</div><div class="text-[10px] font-bold text-purple-700">Durmiendo</div></div>
        </div>
        <div class="flex gap-3">
          <button onclick="UI.Modal.close('bulkRoutineModal')" class="flex-1 py-3 rounded-xl border-2 border-slate-200 font-black text-xs uppercase text-slate-600">Cerrar</button>
          <button onclick="App.publishDailyLogs()" class="flex-1 py-3 rounded-xl font-black text-xs uppercase text-white" style="background:#28B54D">Publicar Reportes</button>
        </div>
      </div>
    </div>
  `);
}

export async function publishDailyLogs() {
  const students = AppState.get('students') || [];
  const logIds = students.filter(s => _logsMap[s.id]).map(s => _logsMap[s.id].id);
  if (logIds.length === 0) { safeToast('No hay reportes para publicar', 'warning'); return; }
  try {
    await MaestraApi.publishDailyLogs(logIds);
    safeToast('Reportes publicados!', 'success');
    UI.Modal.close('bulkRoutineModal');
  } catch { safeToast('Error al publicar', 'error'); }
}
