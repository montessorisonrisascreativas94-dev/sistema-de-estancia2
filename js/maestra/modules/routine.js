/**
 * Rutina Express v7 — Sonrisas Creativas
 * 4 niveles: Timeline del Día · Acciones Colectivas · Tarjetas · Modal Individual
 * Auto-timeline activation · Enhanced biberón/medication/emotion · Premium UX
 */
import { AppState } from '../state.js';
import { UI, safeToast, safeEscapeHTML, safeUrl } from './ui.js';
import { MaestraApi } from '../api.js';
import { supabase } from '../../shared/supabase.js';

let _logsMap = {};
let _sleepMap = {};
let _lastEvent = {};
let _expandedEvent = null;
let _autoRefreshTimer = null;
let _attendanceChannel = null;
let _scheduleConfig = null;
let _viewMode = localStorage.getItem('sonrisas_view_mode') || 'horizontal';
let _timelineCollapsed = localStorage.getItem('sonrisas_tl_collapsed') === '1';
let _timelineActive = localStorage.getItem('sonrisas_tl_active') !== '0';
let _attendanceTaken = false;

const SCHEDULE_STORAGE_KEY = 'sonrisas_schedule_config';
const DAILY_OVERRIDES_KEY = 'sonrisas_daily_overrides';
const SCHEDULE_VERSION = 5;

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

const EXTRA_EVENTS = [
  { id: 'fever',       icon: '🤒', label: 'Fiebre',           color: '#EF4444', type: 'incident', subtype: 'fever' },
  { id: 'accident',    icon: '🩹', label: 'Accidente',        color: '#F97316', type: 'incident', subtype: 'accident' },
  { id: 'parent_call', icon: '📞', label: 'Llamada a padres',  color: '#8B5CF6', type: 'incident', subtype: 'parent_call' },
  { id: 'other',       icon: '📌', label: 'Otro',             color: '#64748B', type: 'incident', subtype: 'other' }
];

const MOOD_OPTIONS = [
  { val: 'feliz',      emoji: '😊', label: 'Feliz' },
  { val: 'tranquilo',  emoji: '🙂', label: 'Tranquilo' },
  { val: 'normal',     emoji: '😐', label: 'Normal' },
  { val: 'triste',     emoji: '😢', label: 'Triste' },
  { val: 'llanto',     emoji: '😭', label: 'Llanto' },
  { val: 'enfermo',    emoji: '🤒', label: 'Enfermo' },
  { val: 'somnoliento',emoji: '😴', label: 'Somnoliento' },
  { val: 'irritable',  emoji: '😡', label: 'Irritable' }
];

const TEMP_OPTIONS = [
  { val: 'fria',     label: 'Fría',    icon: '🧊', color: '#0B63C7' },
  { val: 'natural',  label: 'Natural', icon: '💧', color: '#28B54D' },
  { val: 'tibia',    label: 'Tibia',   icon: '♨️', color: '#FF8A00' },
  { val: 'caliente', label: 'Caliente', icon: '🔥', color: '#EF4444' }
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
function _getNowMinutes() { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); }

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
  const omitted = _getDailyOmittedEvents();
  return _scheduleConfig.filter(e => e.active && e.days.includes(_getDayOfWeek()) && !omitted.includes(e.id));
}

function _getEventStatus(event, nowMinutes) {
  const startMin = _timeToMinutes(event.startTime);
  const endMin = startMin + (event.duration || 30);

  if (!_timelineActive) return 'pending';

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
// LEVEL 1 — TIMELINE DEL DÍA (COLLAPSABLE + AUTO-ACTIVATION)
// ═══════════════════════════════════════════════════════════════════════════════

const TL_STYLES = `
  .tl-wrap::-webkit-scrollbar{display:none}
  .tl-expanded{display:flex;align-items:flex-start;gap:0;min-width:max-content;padding:8px 4px;position:relative}
  .tl-expanded::before{content:'';position:absolute;top:26px;left:30px;right:30px;height:3px;background:linear-gradient(90deg,#e2e8f0,#cbd5e1);border-radius:2px;z-index:0}
  .tl-ev{display:flex;flex-direction:column;align-items:center;min-width:80px;max-width:90px;cursor:pointer;position:relative;z-index:1;padding:4px;transition:all .2s;border-radius:16px}
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
  .tl-collapsed-bar::-webkit-scrollbar{display:none}
  .tl-collapsed{display:flex;align-items:center;gap:2px;min-width:max-content;padding:0 8px}
  .tl-c-dot{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1rem;border:2px solid #e2e8f0;background:white;cursor:pointer;transition:all .2s;flex-shrink:0;position:relative}
  .tl-c-dot:active{transform:scale(.85)}
  .tl-c-dot.current{border-color:var(--ev-color);background:var(--ev-color);box-shadow:0 0 0 3px color-mix(in srgb,var(--ev-color) 25%,transparent)}
  .tl-c-dot.done{border-color:#28B54D;background:#28B54D;color:white}
  .tl-c-dot.done::after{content:'✓';position:absolute;font-size:.5rem;font-weight:900;color:white}
  .tl-c-line{width:12px;height:2px;background:#e2e8f0;flex-shrink:0;border-radius:1px}
  .tl-c-line.done{background:#28B54D}
`;

function _renderTimelineExpanded(schedule, nowMinutes, logsMap, students) {
  return `
    <div class="tl-wrap" style="overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch">
      <style>${TL_STYLES}</style>
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
          const progress = ev.groupEventId ? _getEventProgress(ev, students, logsMap) : null;
          return `
            ${i > 0 ? `<div class="tl-conn ${connClass}"><div class="tl-conn-line"></div></div>` : ''}
            <div class="tl-ev ${evClass}" onclick="App.expandTimelineEvent('${ev.id}')" style="--ev-color:${ev.color}">
              <div class="tl-dot ${dotClass}" style="--ev-color:${ev.color}">${checkMark || ev.emoji}</div>
              <span class="tl-ev-label">${safeEscapeHTML(ev.label)}</span>
              <span class="tl-ev-time">${_fmtTimeShort(ev.startTime)}</span>
              ${progress && progress.total > 0 ? `<span class="tl-ev-count">${progress.done}/${progress.total}</span>` : ''}
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
      <style>${TL_STYLES}</style>
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
        .ra-btn{display:flex;flex-direction:column;align-items:center;gap:4px;padding:12px 6px;border-radius:16px;border:2px solid #f1f5f9;background:white;cursor:pointer;transition:all .15s;touch-action:manipulation;position:relative;overflow:hidden}
        .ra-btn:active{transform:scale(.93);background:#f8fafc}
        .ra-btn.done{border-color:#bbf7d0;background:#f0fdf4}
        .ra-btn.active{border-color:var(--ev-color,#FF8A00);background:color-mix(in srgb,var(--ev-color,#FF8A00) 6%,white)}
        .ra-btn.active::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:var(--ev-color,#FF8A00);border-radius:0 0 4px 4px}
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

  const moodObj = MOOD_OPTIONS.find(m => m.val === log?.mood);
  const moodEmoji = moodObj ? moodObj.emoji : '😀';
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
    <div class="sc-card" style="${borderStyle}" onclick="App.openStudentRoutine(this.dataset.sid)" data-sid="${encodeURIComponent(s.id)}">
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
        .sc-card:active{transform:scale(.94);box-shadow:0 4px 16px rgba(0,0,0,.08)}
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
  const isOmittedToday = _getDailyOmittedEvents().includes(event.id);
  return `
    <div class="rounded-2xl border-2 overflow-hidden mb-3" style="border-color:${event.color}30;background:white;animation:evSlideIn .25s ease">
      <style>@keyframes evSlideIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}</style>
      <div class="p-4 flex items-center gap-3" style="background:${event.color}10">
        <span class="text-2xl">${event.emoji}</span>
        <div class="flex-1 min-w-0">
          <h4 class="font-black text-sm" style="color:${event.color}">${safeEscapeHTML(event.label)}</h4>
          <div class="text-[10px] font-bold text-slate-400">${_fmtTimeShort(event.startTime)} – ${_fmtTimeShort(_minutesToTime(endMin))} · ${event.duration}min${isOmittedToday ? ' · <span class="text-amber-500">Omitido hoy</span>' : ''}</div>
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
        <button onclick="App.toggleOmitToday('${event.id}');event.stopPropagation()" class="flex-1 py-2.5 rounded-xl border-2 font-black text-[10px] uppercase tracking-wider ${isOmittedToday ? 'border-amber-300 text-amber-600 bg-amber-50' : 'border-slate-200 text-slate-500'}">${isOmittedToday ? '↩ Restaurar' : '⊘ Omitir hoy'}</button>
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
  const isTimelineActive = _timelineActive;

  return `
    <div class="space-y-4 pb-28" id="routineView">

      <!-- STICKY HEADER — Línea de Tiempo del Día -->
      <div style="position:sticky;top:0;z-index:40;background:white;border-bottom:2px solid #f1f5f9;padding:10px 0;margin-bottom:4px">
        <div class="flex items-center justify-between mb-2 px-1">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-xl flex items-center justify-center text-lg" style="background:${_attendanceTaken ? '#dcfce7' : '#f1f5f9'};color:${_attendanceTaken ? '#16a34a' : '#94a3b8'}">
              ${_attendanceTaken ? '📋' : '⏳'}
            </div>
            <div>
              <h3 class="text-base font-black text-slate-800">Línea de Tiempo del Día</h3>
              <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">${todayLabel} · ${timeLabel}</p>
            </div>
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
      <!-- LEVEL 1: TIMELINE DEL DÍA -->
      <!-- ═══════════════════════════════════════════════════════════════ -->
      <div class="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <span class="w-7 h-7 rounded-lg flex items-center justify-center text-sm" style="background:${isTimelineActive ? '#dcfce7' : '#f1f5f9'};color:${isTimelineActive ? '#16a34a' : '#94a3b8'}">
              ${isTimelineActive ? '🟢' : '⚪'}
            </span>
            <p class="text-[11px] font-black text-slate-500 uppercase tracking-widest">Cronología del día</p>
          </div>
          <div class="flex items-center gap-1.5">
            <button onclick="App.toggleTimelineActive()" class="text-[10px] font-black uppercase tracking-wide flex items-center gap-1 px-2.5 py-1 rounded-lg ${isTimelineActive ? 'bg-green-50 text-green-600' : 'bg-slate-100 text-slate-400'}">
              ${isTimelineActive ? 'Activa' : 'Inactiva'}
            </button>
            <button onclick="App.toggleTimeline()" class="text-[10px] font-black uppercase tracking-wide flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-500">
              ${isCollapsed ? '▼' : '▲'}
            </button>
            <button onclick="App.openScheduleConfig()" class="text-[10px] font-black text-blue-500 uppercase tracking-wide flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-blue-50">⚙️</button>
          </div>
        </div>
        ${isCollapsed ? _renderTimelineCollapsed(schedule, nowMinutes) : _renderTimelineExpanded(schedule, nowMinutes, _logsMap, students)}
        ${_getDailyOmittedEvents().length > 0 ? `
        <div class="flex gap-2 mt-3">
          <button onclick="App.clearDailyOverrides()" class="flex-1 py-2 rounded-xl border-2 border-amber-200 font-black text-[10px] uppercase text-amber-600 flex items-center justify-center gap-1 hover:bg-amber-50 transition-all">
            ↩ Restaurar eventos omitidos
          </button>
        </div>` : ''}
        <button onclick="App.openQuickAddModal()"
          class="mt-3 w-full py-2.5 rounded-xl border-2 border-dashed border-blue-200 font-black text-xs uppercase text-blue-500 flex items-center justify-center gap-2 hover:bg-blue-50 transition-all">
          <span class="text-lg">➕</span> Agregar evento (baño, popó, biberón, etc.)
        </button>
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
  _attendanceTaken = presentStudentIds.size > 0;

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
    const bar = document.querySelector('.tl-collapsed-bar, .tl-wrap');
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

  _subscribeAttendanceRealtime(classroom.id, today);
}

function _clearAutoRefresh() {
  if (_autoRefreshTimer) { clearInterval(_autoRefreshTimer); _autoRefreshTimer = null; }
}

function _clearAttendanceChannel() {
  if (_attendanceChannel) {
    supabase.removeChannel(_attendanceChannel);
    _attendanceChannel = null;
  }
}

function _subscribeAttendanceRealtime(classroomId, date) {
  _clearAttendanceChannel();
  _attendanceChannel = supabase
    .channel(`routine-attendance-${classroomId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'attendance', filter: `classroom_id=eq.${classroomId}` },
      () => { initRoutine(); }
    )
    .subscribe();
}

// ═══════════════════════════════════════════════════════════════════════════════
// TIMELINE TOGGLE
// ═══════════════════════════════════════════════════════════════════════════════

export function toggleTimeline() {
  _timelineCollapsed = !_timelineCollapsed;
  localStorage.setItem('sonrisas_tl_collapsed', _timelineCollapsed ? '1' : '0');
  initRoutine();
}

export function toggleTimelineActive() {
  _timelineActive = !_timelineActive;
  localStorage.setItem('sonrisas_tl_active', _timelineActive ? '1' : '0');
  if (_timelineActive) {
    safeToast('Timeline activada — los eventos se activarán según la hora configurada', 'success');
  } else {
    safeToast('Timeline desactivada', 'info');
  }
  initRoutine();
}

export function _toggleViewModeFn() {
  _viewMode = _viewMode === 'horizontal' ? 'vertical' : 'horizontal';
  localStorage.setItem('sonrisas_view_mode', _viewMode);
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
        <div class="flex items-center gap-2 p-3 rounded-xl bg-blue-50">
          <input type="checkbox" id="cfgRecalc" class="w-4 h-4 accent-blue-600">
          <label for="cfgRecalc" class="text-[11px] font-bold text-blue-700 cursor-pointer">Mover eventos siguientes automáticamente</label>
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
  const oldStart = _scheduleConfig[evIndex].startTime;
  const oldDuration = _scheduleConfig[evIndex].duration;
  const newStart = document.getElementById('cfgStartTime')?.value || oldStart;
  const newDuration = parseInt(document.getElementById('cfgDuration')?.value) || oldDuration;
  const doRecalc = document.getElementById('cfgRecalc')?.checked || false;

  _scheduleConfig[evIndex] = {
    ..._scheduleConfig[evIndex],
    startTime: newStart,
    duration: newDuration,
    emoji: document.getElementById('cfgEmoji')?.value || _scheduleConfig[evIndex].emoji,
    color: document.getElementById('cfgColor')?.value || _scheduleConfig[evIndex].color,
    active: document.getElementById('cfgActive')?.checked ?? true,
    days: (() => { const d = []; document.querySelectorAll('.cfg-day-btn').forEach(b => { if (b.classList.contains('border-blue-400')) d.push(parseInt(b.dataset.day)); }); return d.length > 0 ? d : _scheduleConfig[evIndex].days; })()
  };

  if (doRecalc) {
    const oldEndMin = _timeToMinutes(oldStart) + oldDuration;
    const newEndMin = _timeToMinutes(newStart) + newDuration;
    const shiftMin = newEndMin - oldEndMin;
    if (shiftMin !== 0) {
      for (let i = evIndex + 1; i < _scheduleConfig.length; i++) {
        const curStartMin = _timeToMinutes(_scheduleConfig[i].startTime);
        _scheduleConfig[i].startTime = _minutesToTime(curStartMin + shiftMin);
      }
    }
  }

  _saveScheduleConfig();
  UI.Modal.close('eventConfigModal');
  safeToast('Evento configurado' + (doRecalc ? ' — horarios siguientes recalculados' : ''), 'success');
  initRoutine();
}

export function addScheduleEvent() {
  const id = 'custom_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const newEv = {
    id, emoji: '📌', label: 'Nuevo evento', color: '#64748B',
    startTime: '08:00', duration: 30, type: 'colectivo', auto: false,
    needsConfirm: false, visibleParents: true, visibleDirector: true,
    days: [1,2,3,4,5,6], active: true
  };
  _scheduleConfig.push(newEv);
  _saveScheduleConfig();
  openScheduleConfig();
  safeToast('Nuevo evento agregado — configúralo', 'success');
}

export function deleteScheduleEvent(eventId) {
  if (!_scheduleConfig) return;
  const idx = _scheduleConfig.findIndex(e => e.id === eventId);
  if (idx === -1) return;
  const isDefault = DEFAULT_SCHEDULE.some(d => d.id === eventId);
  if (isDefault) { safeToast('No puedes eliminar un evento predeterminado', 'warning'); return; }
  if (!confirm('¿Eliminar este evento de la rutina?')) return;
  _scheduleConfig.splice(idx, 1);
  _saveScheduleConfig();
  openScheduleConfig();
  safeToast('Evento eliminado', 'success');
}

export function _moveScheduleEvent(fromIdx, toIdx) {
  if (!_scheduleConfig || fromIdx === toIdx) return;
  const [moved] = _scheduleConfig.splice(fromIdx, 1);
  _scheduleConfig.splice(toIdx, 0, moved);
  _saveScheduleConfig();
}

let _dragEvIdx = null;

export function openScheduleConfig() {
  const schedule = _scheduleConfig || DEFAULT_SCHEDULE;
  const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  const omitted = _getDailyOmittedEvents();
  let scheduleHtml = '';
  schedule.forEach((ev, i) => {
    const isDefault = DEFAULT_SCHEDULE.some(d => d.id === ev.id);
    const isOmittedToday = omitted.includes(ev.id);
    scheduleHtml += `
      <div class="flex items-center justify-center" style="margin:-4px 0">
        <button onclick="App.insertEventAt(${i})" class="w-7 h-7 rounded-full border-2 border-dashed border-blue-200 bg-white flex items-center justify-center text-blue-400 hover:bg-blue-50 hover:border-blue-400 transition-all text-xs font-black" title="Insertar evento aquí">+</button>
      </div>
      <div draggable="true"
        data-idx="${i}"
        class="flex items-center gap-2 p-3 rounded-xl border ${isOmittedToday ? 'border-amber-200 bg-amber-50 opacity-60' : 'border-slate-100 bg-white'} hover:border-blue-200 transition-all cursor-pointer schedule-row"
        onclick="if(!this.dataset.dragging)App.openEventConfig('${ev.id}')"
        ondragstart="event.dataTransfer.setData('text/plain','${i}');_dragEvIdx=${i};this.dataset.dragging='1';this.classList.add('opacity-40','border-blue-400')"
        ondragend="this.classList.remove('opacity-40','border-blue-400');delete this.dataset.dragging;_dragEvIdx=null"
        ondragover="event.preventDefault();this.parentElement.querySelectorAll('.schedule-row').forEach(r=>r.classList.remove('border-blue-400','bg-blue-50'));this.classList.add('border-blue-400','bg-blue-50')"
        ondragleave="this.classList.remove('border-blue-400','bg-blue-50')"
        ondrop="event.preventDefault();this.classList.remove('border-blue-400','bg-blue-50');var from=_dragEvIdx;if(from===null)return;var to=parseInt(this.dataset.idx);if(from===to)return;App._moveScheduleEvent(from,to);App.openScheduleConfig()">
        <span class="text-slate-300 cursor-grab active:cursor-grabbing select-none text-sm" title="Arrastrar para reordenar">☰</span>
        <span class="text-xl">${ev.emoji}</span>
        <div class="flex-1 min-w-0">
          <div class="text-sm font-black text-slate-800 truncate">${safeEscapeHTML(ev.label)}</div>
          <div class="text-[10px] font-bold text-slate-400">${_fmtTimeShort(ev.startTime)} · ${ev.duration}min${isOmittedToday ? ' · <span class="text-amber-500">Omitido hoy</span>' : ''}</div>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-3 h-3 rounded-full" style="background:${ev.color}"></span>
          <span class="text-[10px] font-bold ${ev.active ? 'text-green-600' : 'text-slate-300'}">${ev.active ? 'Activo' : 'Inactivo'}</span>
          ${!isDefault ? `<button onclick="event.stopPropagation();App.deleteScheduleEvent('${ev.id}')" class="p-1 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-all" title="Eliminar">🗑️</button>` : ''}
        </div>
      </div>
    `;
  });
  scheduleHtml += `
    <div class="flex items-center justify-center" style="margin:-4px 0">
      <button onclick="App.addScheduleEvent()" class="w-7 h-7 rounded-full border-2 border-dashed border-blue-200 bg-white flex items-center justify-center text-blue-400 hover:bg-blue-50 hover:border-blue-400 transition-all text-xs font-black" title="Agregar al final">+</button>
    </div>`;

  UI.Modal.open('scheduleConfigModal', `
    <div class="bg-white overflow-hidden" style="border-radius:32px;max-height:85vh;display:flex;flex-direction:column">
      <div class="p-6 flex-shrink-0" style="background:linear-gradient(135deg,#0B63C7,#28B54D)">
        <div class="flex items-center justify-between">
          <div><h3 class="text-xl font-black text-white">Configurar Horario</h3><p class="text-sm font-bold text-white/80">Arrastra ☰ — toca para configurar — + para insertar</p></div>
          <button onclick="UI.Modal.close('scheduleConfigModal')" class="p-2 rounded-xl bg-white/20 text-white"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
        </div>
      </div>
      <div class="p-4 overflow-y-auto flex-1" id="sc-list">
        ${scheduleHtml}
      </div>
      <div class="p-4 border-t border-slate-100 flex-shrink-0 space-y-2">
        <button onclick="App.resetScheduleConfig()" class="w-full py-3 rounded-xl border-2 border-red-200 font-black text-xs uppercase text-red-500 hover:bg-red-50 transition-all">Restaurar Horario Predeterminado</button>
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
// DAILY ROUTINE OVERRIDES (Rutina del Día)
// ═══════════════════════════════════════════════════════════════════════════════

function _loadDailyOverrides() {
  try { return JSON.parse(localStorage.getItem(DAILY_OVERRIDES_KEY) || '{}'); } catch { return {}; }
}

function _saveDailyOverrides(data) {
  localStorage.setItem(DAILY_OVERRIDES_KEY, JSON.stringify(data));
}

function _getDailyKey() {
  return _today();
}

function _getDailyOmittedEvents() {
  const all = _loadDailyOverrides();
  return all[_getDailyKey()]?.omitted || [];
}

export function toggleOmitToday(eventId) {
  const all = _loadDailyOverrides();
  const key = _getDailyKey();
  if (!all[key]) all[key] = { omitted: [] };
  const idx = all[key].omitted.indexOf(eventId);
  if (idx > -1) { all[key].omitted.splice(idx, 1); safeToast('Evento visible hoy', 'success'); }
  else { all[key].omitted.push(eventId); safeToast('Evento omitido hoy', 'success'); }
  _saveDailyOverrides(all);
  initRoutine();
}

export function insertEventAt(index) {
  const id = 'custom_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const newEv = {
    id, emoji: '📌', label: 'Nuevo evento', color: '#64748B',
    startTime: '08:00', duration: 30, type: 'colectivo', auto: false,
    needsConfirm: false, visibleParents: true, visibleDirector: true,
    days: [1,2,3,4,5,6], active: true
  };
  _scheduleConfig.splice(index, 0, newEv);
  _saveScheduleConfig();
  openScheduleConfig();
  safeToast('Evento insertado — configúralo', 'success');
}

export function clearDailyOverrides() {
  const all = _loadDailyOverrides();
  delete all[_getDailyKey()];
  _saveDailyOverrides(all);
  initRoutine();
  safeToast('Rutina de hoy restaurada', 'success');
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
// LEVEL 4 — MODAL INDIVIDUAL (ENHANCED)
// ═══════════════════════════════════════════════════════════════════════════════

function _renderMilkModal(studentId, existingEvent) {
  const ev = existingEvent || {};
  return `
    <div class="bg-white overflow-hidden" style="border-radius:24px;max-width:380px;margin:0 auto">
      <div class="p-5" style="background:linear-gradient(135deg,#0B63C7,#3B82F6)">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span class="text-2xl">🍼</span>
            <div><h3 class="text-lg font-black text-white">Biberón</h3><p class="text-xs font-bold text-white/80">Registrar toma</p></div>
          </div>
          <button onclick="UI.Modal.close('milkModal')" class="p-2 rounded-xl bg-white/20 text-white">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      </div>
      <div class="p-5 space-y-4">
        <div>
          <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cantidad (onzas)</label>
          <div class="flex gap-2 mt-2">
            ${[1,2,3,4,5,6,8].map(oz => `
              <button onclick="document.getElementById('milkOz').value='${oz}';this.parentElement.querySelectorAll('button').forEach(b=>b.classList.remove('border-blue-500','bg-blue-50'));this.classList.add('border-blue-500','bg-blue-50')"
                class="flex-1 py-2 rounded-xl border-2 border-slate-100 font-black text-sm text-slate-600 ${ev.oz == oz ? 'border-blue-500 bg-blue-50' : ''}">${oz}</button>
            `).join('')}
          </div>
          <input type="number" id="milkOz" min="0" max="20" step="0.5" value="${ev.oz || ''}" placeholder="Otro valor"
            class="w-full mt-2 p-3 border-2 border-slate-100 rounded-xl text-sm font-bold text-slate-700 outline-none focus:border-blue-400" inputmode="decimal">
        </div>
        <div>
          <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Temperatura</label>
          <div class="grid grid-cols-4 gap-2 mt-2">
            ${TEMP_OPTIONS.map(t => `
              <button onclick="document.getElementById('milkTemp').value='${t.val}';this.parentElement.querySelectorAll('button').forEach(b=>b.classList.remove('border-blue-500','bg-blue-50'));this.classList.add('border-blue-500','bg-blue-50')"
                class="p-2 rounded-xl border-2 ${ev.temp === t.val ? 'border-blue-500 bg-blue-50' : 'border-slate-100'} text-center">
                <span class="text-lg block">${t.icon}</span>
                <span class="text-[8px] font-black text-slate-600 block">${t.label}</span>
              </button>
            `).join('')}
          </div>
          <input type="hidden" id="milkTemp" value="${ev.temp || ''}">
        </div>
        <div>
          <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hora</label>
          <input type="time" id="milkTime" value="${ev.time || new Date().toTimeString().slice(0,5)}"
            class="w-full mt-2 p-3 border-2 border-slate-100 rounded-xl text-sm font-bold text-slate-700 outline-none focus:border-blue-400">
        </div>
        <div>
          <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Observaciones</label>
          <textarea id="milkNotes" rows="2" placeholder="Notas adicionales..."
            class="w-full mt-2 p-3 border-2 border-slate-100 rounded-xl text-xs focus:border-blue-400 outline-none">${safeEscapeHTML(ev.notes || '')}</textarea>
        </div>
        <button onclick="App._confirmMilk('${studentId}')" class="w-full py-3 rounded-xl font-black text-xs uppercase text-white" style="background:#0B63C7">Guardar Biberón</button>
      </div>
    </div>
  `;
}

function _renderMedModal(studentId, existingEvent) {
  const ev = existingEvent || {};
  return `
    <div class="bg-white overflow-hidden" style="border-radius:24px;max-width:380px;margin:0 auto">
      <div class="p-5" style="background:linear-gradient(135deg,#EC4899,#F472B6)">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span class="text-2xl">💊</span>
            <div><h3 class="text-lg font-black text-white">Medicamento</h3><p class="text-xs font-bold text-white/80">Registrar administración</p></div>
          </div>
          <button onclick="UI.Modal.close('medModal')" class="p-2 rounded-xl bg-white/20 text-white">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      </div>
      <div class="p-5 space-y-4">
        <div>
          <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nombre del medicamento</label>
          <input type="text" id="medName" value="${safeEscapeHTML(ev.name || '')}" placeholder="Ej: Ibuprofeno"
            class="w-full mt-2 p-3 border-2 border-slate-100 rounded-xl text-sm font-bold text-slate-700 outline-none focus:border-blue-400">
        </div>
        <div>
          <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Dosis</label>
          <input type="text" id="medDose" value="${safeEscapeHTML(ev.dose || '')}" placeholder="Ej: 5ml cada 8 horas"
            class="w-full mt-2 p-3 border-2 border-slate-100 rounded-xl text-sm font-bold text-slate-700 outline-none focus:border-blue-400">
        </div>
        <div>
          <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hora</label>
          <input type="time" id="medTime" value="${ev.time || new Date().toTimeString().slice(0,5)}"
            class="w-full mt-2 p-3 border-2 border-slate-100 rounded-xl text-sm font-bold text-slate-700 outline-none focus:border-blue-400">
        </div>
        <div class="flex items-center justify-between p-3 rounded-xl bg-slate-50">
          <span class="text-sm font-bold text-slate-700">Autorización de padres</span>
          <label class="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" id="medAuth" ${ev.authorized ? 'checked' : ''} class="sr-only peer">
            <div class="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
          </label>
        </div>
        <div>
          <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Observaciones</label>
          <textarea id="medNotes" rows="2" placeholder="Notas adicionales..."
            class="w-full mt-2 p-3 border-2 border-slate-100 rounded-xl text-xs focus:border-blue-400 outline-none">${safeEscapeHTML(ev.notes || '')}</textarea>
        </div>
        <button onclick="App._confirmMed('${studentId}')" class="w-full py-3 rounded-xl font-black text-xs uppercase text-white" style="background:#EC4899">Guardar Medicamento</button>
      </div>
    </div>
  `;
}

function _renderExtraEventModal(studentId) {
  return `
    <div class="bg-white overflow-hidden" style="border-radius:24px;max-width:380px;margin:0 auto">
      <div class="p-5" style="background:linear-gradient(135deg,#EF4444,#F87171)">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span class="text-2xl">⚠️</span>
            <div><h3 class="text-lg font-black text-white">Evento Extra</h3><p class="text-xs font-bold text-white/80">Registrar incidente o evento</p></div>
          </div>
          <button onclick="UI.Modal.close('extraEventModal')" class="p-2 rounded-xl bg-white/20 text-white">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      </div>
      <div class="p-5 space-y-4">
        <div>
          <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo de evento</label>
          <div class="grid grid-cols-2 gap-2 mt-2">
            ${EXTRA_EVENTS.map(ev => `
              <button onclick="document.getElementById('extraType').value='${ev.id}';this.parentElement.querySelectorAll('button').forEach(b=>b.classList.remove('border-blue-500','bg-blue-50'));this.classList.add('border-blue-500','bg-blue-50')"
                class="p-3 rounded-xl border-2 border-slate-100 text-center flex flex-col items-center gap-1">
                <span class="text-xl">${ev.icon}</span>
                <span class="text-[9px] font-black text-slate-600">${ev.label}</span>
              </button>
            `).join('')}
          </div>
          <input type="hidden" id="extraType" value="">
        </div>
        <div>
          <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Descripción</label>
          <textarea id="extraDesc" rows="3" placeholder="Describe lo que sucedió..."
            class="w-full mt-2 p-3 border-2 border-slate-100 rounded-xl text-xs focus:border-blue-400 outline-none"></textarea>
        </div>
        <div class="flex items-center justify-between p-3 rounded-xl bg-slate-50">
          <span class="text-sm font-bold text-slate-700">Notificar a padres</span>
          <label class="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" id="extraNotify" class="sr-only peer">
            <div class="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
          </label>
        </div>
        <button onclick="App._confirmExtraEvent('${studentId}')" class="w-full py-3 rounded-xl font-black text-xs uppercase text-white" style="background:#EF4444">Guardar Evento</button>
      </div>
    </div>
  `;
}

function _renderTempModal(studentId) {
  return `
    <div class="bg-white overflow-hidden" style="border-radius:24px;max-width:360px;margin:0 auto">
      <div class="p-5" style="background:linear-gradient(135deg,#EF4444,#F87171)">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span class="text-2xl">🌡️</span>
            <div><h3 class="text-lg font-black text-white">Temperatura</h3><p class="text-xs font-bold text-white/80">Registrar temperatura corporal</p></div>
          </div>
          <button onclick="UI.Modal.close('tempModal')" class="p-2 rounded-xl bg-white/20 text-white">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      </div>
      <div class="p-5 space-y-4">
        <div>
          <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Temperatura (°C)</label>
          <div class="flex gap-2 mt-2">
            ${[36.0,36.5,37.0,37.5,38.0,38.5,39.0,39.5,40.0].map(t => `
              <button onclick="document.getElementById('tempValue').value='${t}';this.parentElement.querySelectorAll('button').forEach(b=>b.classList.remove('border-red-500','bg-red-50'));this.classList.add('border-red-500','bg-red-50')"
                class="flex-1 py-2 rounded-xl border-2 border-slate-100 font-black text-xs text-slate-600">${t}</button>
            `).join('')}
          </div>
          <input type="number" id="tempValue" min="34" max="42" step="0.1" placeholder="Otro valor"
            class="w-full mt-2 p-3 border-2 border-slate-100 rounded-xl text-sm font-bold text-slate-700 outline-none focus:border-red-400" inputmode="decimal">
        </div>
        <div>
          <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hora</label>
          <input type="time" id="tempTime" value="${new Date().toTimeString().slice(0,5)}"
            class="w-full mt-2 p-3 border-2 border-slate-100 rounded-xl text-sm font-bold text-slate-700 outline-none focus:border-red-400">
        </div>
        <button id="tempSaveBtn" onclick="App._confirmTemp('${studentId}')"
          class="w-full py-3 rounded-xl font-black text-xs uppercase text-white" style="background:#EF4444">Guardar Temperatura</button>
      </div>
    </div>
  `;
}

function _openTempModal(studentId) {
  UI.Modal.open('tempModal', _renderTempModal(studentId));
}

export async function _confirmTemp(studentId) {
  const btn = document.getElementById('tempSaveBtn');
  btn.disabled = true; btn.textContent = 'Guardando...';
  const classroom = AppState.get('classroom');
  const value = parseFloat(document.getElementById('tempValue')?.value);
  if (isNaN(value) || value < 34 || value > 42) { safeToast('Ingresa una temperatura válida (34-42°C)', 'warning'); btn.disabled = false; btn.textContent = 'Guardar Temperatura'; return; }
  const time = document.getElementById('tempTime')?.value || null;
  try {
    await MaestraApi.upsertDailyLog({
      student_id: studentId, classroom_id: classroom.id, date: _today(),
      infant_event: { type: 'temp', label: 'Temperatura', value, time }
    });
    safeToast('Temperatura registrada', 'success');
    UI.Modal.close('tempModal');
    await initRoutine();
    openStudentRoutine(studentId);
  } catch { safeToast('Error al guardar', 'error'); btn.disabled = false; btn.textContent = 'Guardar Temperatura'; }
}

export function openStudentRoutine(studentId) {
  try { studentId = decodeURIComponent(studentId); } catch {}
  const students = AppState.get('students') || [];
  const student = students.find(s => s.id === studentId);
  if (!student) { safeToast('No se encontró el estudiante', 'error'); return; }
  const log = _logsMap[studentId];
  let currentFood = {};
  if (log?.food) { try { currentFood = JSON.parse(log.food); } catch {} }
  const events = log?.infant_data || [];
  const hasEvent = (type, subtype) => events.some(e => e.type === type && (!subtype || e.subtype === subtype));

  const mealLabels = { breakfast: '🍞 Desayuno', lunch: '🥗 Almuerzo', snack: '🍎 Merienda' };
  const foodOptions = [
    { val: 'todo', icon: '✅', label: 'Todo' },
    { val: 'poco', icon: '⚠️', label: 'Poco' },
    { val: 'nada', icon: '❌', label: 'Nada' },
    { val: 'ayuda', icon: '🆘', label: 'Ayuda' }
  ];

  // ── Collect all registered events for the top summary ──
  const registeredBadges = [];
  if (log?.mood) {
    const mood = MOOD_OPTIONS.find(m => m.val === log.mood);
    if (mood) registeredBadges.push({ emoji: mood.emoji, label: mood.label, color: '#3B82F6' });
  }
  if (currentFood.breakfast) registeredBadges.push({ emoji: '🍞', label: 'Desayuno: ' + (foodOptions.find(f => f.val === currentFood.breakfast)?.label || currentFood.breakfast), color: '#FF8A00' });
  if (currentFood.lunch) registeredBadges.push({ emoji: '🥗', label: 'Almuerzo: ' + (foodOptions.find(f => f.val === currentFood.lunch)?.label || currentFood.lunch), color: '#28B54D' });
  if (currentFood.snack) registeredBadges.push({ emoji: '🍎', label: 'Merienda: ' + (foodOptions.find(f => f.val === currentFood.snack)?.label || currentFood.snack), color: '#F59E0B' });
  if (log?.nap) registeredBadges.push({ emoji: '😴', label: 'Siesta', color: '#8B5CF6' });
  if (hasEvent('milk')) registeredBadges.push({ emoji: '🍼', label: 'Biberón', color: '#0B63C7' });
  if (hasEvent('activity')) registeredBadges.push({ emoji: '🎨', label: 'Actividad', color: '#7C3AED' });
  if (hasEvent('sensorial')) registeredBadges.push({ emoji: '🔬', label: 'Sensorial', color: '#6366F1' });
  if (hasEvent('playground')) registeredBadges.push({ emoji: '🌳', label: 'Patio', color: '#16A34A' });
  if (hasEvent('handwash')) registeredBadges.push({ emoji: '🧼', label: 'Lavado', color: '#0B63C7' });
  if (hasEvent('toothbrush')) registeredBadges.push({ emoji: '🪥', label: 'Cepillado', color: '#06B6D4' });
  if (hasEvent('diaper', 'soiled')) registeredBadges.push({ emoji: '💩', label: 'Popó', color: '#FF8A00' });
  if (hasEvent('diaper', 'wet')) registeredBadges.push({ emoji: '💧', label: 'Pipí', color: '#0B63C7' });
  if (hasEvent('bath')) registeredBadges.push({ emoji: '🚽', label: 'Baño', color: '#28B54D' });
  if (hasEvent('temp')) registeredBadges.push({ emoji: '🌡️', label: 'Temperatura', color: '#EF4444' });
  if (hasEvent('med')) registeredBadges.push({ emoji: '💊', label: 'Medicamento', color: '#EC4899' });
  if (hasEvent('behavior')) registeredBadges.push({ emoji: '🤝', label: 'Conducta', color: '#F59E0B' });
  if (log?.notes) registeredBadges.push({ emoji: '📝', label: 'Nota', color: '#64748B' });

  // ── Timeline events ──
  const EVENT_ICONS = { sleep: '😴', milk: '🍼', diaper: e => e.subtype === 'wet' ? '💧' : '💩', bath: '🚽', temp: '🌡️', med: '💊', behavior: '🤝', handwash: '🧼', toothbrush: '🪥', activity: '🏫', playground: '🌳', health: e => e.subtype === 'vomit' ? '🤮' : '😷', incident: '🤕', note: '📝' };
  const EVENT_LABELS = { handwash: 'Lavado de manos', toothbrush: 'Cepillado dental', activity: 'Actividad', playground: 'Patio', sensorial: 'Sensorial', sleep: 'Siesta', milk: 'Biberón', diaper: 'Pañal', bath: 'Baño', temp: 'Temperatura', med: 'Medicamento', note: 'Nota', behavior: 'Comportamiento' };
  const sortedEvents = [...events].sort((a, b) => new Date(a.created_at||0) - new Date(b.created_at||0));
  const timelineHtml = sortedEvents.length > 0 ? sortedEvents.map(evt => {
    const time = evt.created_at ? _fmtTime(evt.created_at) : (evt.start_time ? _fmtTime(evt.start_time) : '');
    const label = evt.label || EVENT_LABELS[evt.type] || evt.type;
    const getIcon = EVENT_ICONS[evt.type];
    const icon = typeof getIcon === 'function' ? getIcon(evt) : (getIcon || '📌');
    const detail = evt.type === 'sleep' ? (evt.end_time ? 'Despertó ' + _fmtTime(evt.end_time) : 'En siesta...') : evt.type === 'milk' ? (evt.oz ? evt.oz + ' oz' + (evt.temp ? ' · ' + (TEMP_OPTIONS.find(t => t.val === evt.temp)?.label || evt.temp) : '') : '') : evt.type === 'temp' ? (evt.value ? evt.value + '°C' : '') : evt.type === 'med' ? (evt.name || '') : evt.type === 'incident' ? (evt.description || '') : '';
    return `
      <div class="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 group" style="${!evt.id ? 'opacity:0.5' : ''}">
        <div class="w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0" style="background:#f1f5f9">${icon}</div>
        <div class="flex-1 min-w-0">
          <div class="text-xs font-bold text-slate-700">${safeEscapeHTML(label)}</div>
          ${detail ? `<div class="text-[10px] text-slate-400">${safeEscapeHTML(detail)}</div>` : ''}
        </div>
        <span class="text-[10px] font-bold text-slate-400">${time}</span>
        ${evt.id ? `
        <button onclick="event.stopPropagation();if(confirm('¿Eliminar este evento?'))App.deleteInfantEvent('${studentId}','${evt.id}')" class="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-all" title="Eliminar evento">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
        </button>` : '<div class="w-6"></div>'}
      </div>
    `;
  }).join('') : '<p class="text-center text-slate-400 text-xs py-4">Sin eventos aún</p>';

  // ── Helper: section header ──
  const section = (title, content) => `
    <div class="pt-1">
      <h4 class="text-xs font-black text-slate-800 mb-3 flex items-center gap-2">${title}</h4>
      ${content}
    </div>
  `;

  // ── Helper: button with registered detection ──
  const chipBtn = (onclick, emoji, label, isRegistered, regColor = '#28B54D') => `
    <button onclick="${onclick}"
      class="p-2 rounded-xl border-2 ${isRegistered ? 'border-green-400 bg-green-50' : 'border-slate-100 bg-white'} flex flex-col items-center gap-0.5 active:scale-95 transition-all"
      style="${isRegistered ? 'box-shadow:0 0 0 2px rgba(34,197,94,0.15)' : ''}">
      <span class="text-lg">${emoji}</span>
      <span class="text-[7px] font-black ${isRegistered ? 'text-green-700' : 'text-slate-500'} text-center leading-tight">${label}</span>
      ${isRegistered ? '<span class="text-[6px] font-black text-green-500">✓</span>' : ''}
    </button>
  `;

  const chipBtnNS = (onclick, emoji, label, isRegistered, note) => `
    <button onclick="${onclick}"
      class="flex-1 p-2.5 rounded-xl border-2 ${isRegistered ? 'border-green-400 bg-green-50' : 'border-slate-100 bg-white'} text-left active:scale-95 transition-all"
      style="${isRegistered ? 'box-shadow:0 0 0 2px rgba(34,197,94,0.15)' : ''}">
      <div class="flex items-center gap-2">
        <span class="text-base">${emoji}</span>
        <span class="text-[10px] font-black ${isRegistered ? 'text-green-700' : 'text-slate-600'}">${label}</span>
        ${isRegistered ? '<span class="ml-auto text-[8px] font-black text-green-500">✓</span>' : ''}
      </div>
      ${note ? `<div class="text-[8px] text-slate-400 mt-0.5 ml-7">${note}</div>` : ''}
    </button>
  `;

  const modalContent = `
    <div class="bg-white overflow-hidden" style="border-radius:32px">
      <!-- STUDENT HEADER -->
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

      <div class="p-5 space-y-5 max-h-[70vh] overflow-y-auto" id="sr-scroll">

        <!-- ═══ EVENTOS REGISTRADOS (TOP BADGES) ═══ -->
        ${registeredBadges.length > 0 ? section('✅ Eventos Registrados', `
          <div class="flex flex-wrap gap-1.5">
            ${registeredBadges.map(b => `
              <span class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-black" 
                style="background:${b.color}18;border:2px solid ${b.color};color:${b.color}">
                ${b.emoji} ${safeEscapeHTML(b.label)}
              </span>
            `).join('')}
          </div>
        `) : section('📋 Eventos', '<p class="text-xs text-slate-400 py-2">Aún no hay eventos registrados para hoy</p>')}

        <div class="border-b border-slate-100"></div>

        <!-- ═══ ESTADO EMOCIONAL ═══ -->
        ${section('😊 Estado Emocional', `
          <div class="grid grid-cols-4 gap-1.5">
            ${MOOD_OPTIONS.map(m => `
              <button onclick="App.setStudentMood('${studentId}','${m.val}')"
                class="p-2 rounded-xl border-2 ${log?.mood === m.val ? 'border-green-400 bg-green-50' : 'border-slate-100 bg-white'} text-center active:scale-95 transition-all"
                style="${log?.mood === m.val ? 'box-shadow:0 0 0 2px rgba(34,197,94,0.15)' : ''}">
                <span class="text-xl block">${m.emoji}</span>
                <span class="text-[7px] font-black ${log?.mood === m.val ? 'text-green-700' : 'text-slate-500'} block">${m.label}</span>
                ${log?.mood === m.val ? '<span class="text-[6px] font-black text-green-500">✓</span>' : ''}
              </button>
            `).join('')}
          </div>
        `)}

        <div class="border-b border-slate-100"></div>

        <!-- ═══ ALIMENTACIÓN ═══ -->
        ${section('🍽️ Alimentación', `
          <div class="space-y-2">
            ${['breakfast', 'lunch', 'snack'].map(mealKey => {
              const currentVal = currentFood[mealKey] || '';
              return `
                <div class="rounded-xl border ${currentVal ? 'border-green-200 bg-green-50/30' : 'border-slate-100'} p-3">
                  <div class="flex items-center justify-between mb-2">
                    <span class="text-xs font-black text-slate-700">${mealLabels[mealKey]}</span>
                    ${currentVal ? `<span class="text-[9px] font-bold px-2 py-0.5 rounded-full ${currentVal === 'todo' ? 'bg-green-100 text-green-700' : currentVal === 'poco' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}">${foodOptions.find(f => f.val === currentVal)?.label || currentVal}</span>` : '<span class="text-[9px] font-bold text-slate-300">Pendiente</span>'}
                  </div>
                  <div class="grid grid-cols-4 gap-1.5">
                    ${foodOptions.map(fo => `
                      <button onclick="App.setStudentFood('${studentId}','${fo.val}','${mealKey}')"
                        class="py-2 rounded-xl border-2 ${currentVal === fo.val ? 'border-green-400 bg-green-50' : 'border-slate-100 bg-white'} text-center active:scale-95 transition-all">
                        <span class="text-base">${fo.icon}</span>
                        <span class="text-[7px] font-black ${currentVal === fo.val ? 'text-green-700' : 'text-slate-500'} block">${fo.label}</span>
                      </button>
                    `).join('')}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `)}

        <div class="border-b border-slate-100"></div>

        <!-- ═══ CICLO DE SUEÑO ═══ -->
        ${section('😴 Ciclo de Sueño', `
          <div class="grid grid-cols-4 gap-1.5">
            ${[
              { val: 'si', label: 'Dormido', icon: '💤' }, { val: 'no', label: 'No durmió', icon: '☀️' },
              { val: 'poco', label: 'Se despertó', icon: '⏰' }, { val: 'excelente', label: 'Excelente', icon: '⭐' }
            ].map(n => `
              <button onclick="App.setStudentNap('${studentId}','${n.val}')"
                class="p-2 rounded-xl border-2 ${log?.nap === n.val ? 'border-green-400 bg-green-50' : 'border-slate-100 bg-white'} text-center active:scale-95 transition-all"
                style="${log?.nap === n.val ? 'box-shadow:0 0 0 2px rgba(34,197,94,0.15)' : ''}">
                <span class="text-base">${n.icon}</span>
                <span class="text-[8px] font-black ${log?.nap === n.val ? 'text-green-700' : 'text-slate-600'} block">${n.label}</span>
                ${log?.nap === n.val ? '<span class="text-[6px] font-black text-green-500">✓</span>' : ''}
              </button>
            `).join('')}
          </div>
          ${_sleepMap[studentId] ? `
          <button onclick="App.routineWakeStudent('${studentId}')"
            class="mt-2 w-full p-2.5 rounded-xl text-white font-black text-[10px] uppercase flex items-center justify-center gap-2" style="background:#7c3aed">
            <span>😴</span> Despertar
          </button>` : ''}
        `)}

        <div class="border-b border-slate-100"></div>

        <!-- ═══ BIBERÓN ═══ -->
        ${section('🍼 Biberón', `
          <button onclick="App._openMilkModal('${studentId}')"
            class="w-full p-3 rounded-xl border-2 ${hasEvent('milk') ? 'border-green-300 bg-green-50' : 'border-slate-100 bg-white'} flex items-center gap-3 text-left hover:border-blue-200 transition-all">
            <span class="text-xl">🍼</span>
            <div class="flex-1">
              <div class="text-xs font-black ${hasEvent('milk') ? 'text-green-700' : 'text-slate-700'}">${hasEvent('milk') ? 'Registrar otro Biberón' : 'Registrar Biberón'}</div>
              <div class="text-[10px] text-slate-400">Onzas, temperatura y hora</div>
            </div>
            ${hasEvent('milk') ? '<span class="text-[10px] font-black text-green-600 mr-1">✓</span>' : ''}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
          </button>
          ${events.filter(e => e.type === 'milk').length > 0 ? `
          <div class="mt-2 space-y-1">
            ${events.filter(e => e.type === 'milk').map(evt => `
              <div class="flex items-center gap-2 p-2 rounded-lg bg-blue-50 text-[10px]">
                <span>🍼</span>
                <span class="font-bold text-blue-700">${evt.oz ? evt.oz + ' oz' : ''}</span>
                ${evt.temp ? `<span class="text-blue-500">· ${TEMP_OPTIONS.find(t => t.val === evt.temp)?.label || evt.temp}</span>` : ''}
                <span class="ml-auto text-blue-400">${evt.created_at ? _fmtTime(evt.created_at) : ''}</span>
              </div>
            `).join('')}
          </div>` : ''}
        `)}

        <div class="border-b border-slate-100"></div>

        <!-- ═══ ACTIVIDADES ═══ -->
        ${section('🎨 Actividades', `
          <div class="grid grid-cols-3 gap-1.5">
            ${chipBtn("App.addStudentEvent('" + studentId + "','activity')", '🎨', 'Actividad', hasEvent('activity'))}
            ${chipBtn("App.addStudentEvent('" + studentId + "','sensorial')", '🔬', 'Sensorial', hasEvent('sensorial'))}
            ${chipBtn("App.addStudentEvent('" + studentId + "','playground')", '🌳', 'Patio', hasEvent('playground'))}
            ${chipBtn("App.addStudentEvent('" + studentId + "','handwash')", '🧼', 'Lavado manos', hasEvent('handwash'))}
            ${chipBtn("App.addStudentEvent('" + studentId + "','toothbrush')", '🪥', 'Cepillado', hasEvent('toothbrush'))}
          </div>
        `)}

        <div class="border-b border-slate-100"></div>

        <!-- ═══ HIGIENE ═══ -->
        ${section('🧼 Higiene y Esfínteres', `
          <div class="grid grid-cols-3 gap-1.5">
            ${chipBtn("App.addStudentEvent('" + studentId + "','poop')", '💩', 'Popó', hasEvent('diaper', 'soiled'))}
            ${chipBtn("App.addStudentEvent('" + studentId + "','pee')", '💧', 'Pipí', hasEvent('diaper', 'wet'))}
            ${chipBtn("App.addStudentEvent('" + studentId + "','toilet')", '🚽', 'Baño', hasEvent('bath'))}
            ${chipBtn("App.addStudentEvent('" + studentId + "','diaper')", '🧻', 'Cambio pañal', hasEvent('diaper_change'))}
            <button onclick="App.addStudentEvent('${studentId}','note')"
              class="p-2 rounded-xl border-2 ${log?.notes ? 'border-green-400 bg-green-50' : 'border-slate-100 bg-white'} flex flex-col items-center gap-0.5 active:scale-95 transition-all col-span-2">
              <span class="text-lg">📝</span>
              <span class="text-[7px] font-black ${log?.notes ? 'text-green-700' : 'text-slate-500'}">Nota rápida</span>
              ${log?.notes ? '<span class="text-[6px] font-black text-green-500">✓</span>' : ''}
            </button>
          </div>
        `)}

        <div class="border-b border-slate-100"></div>

        <!-- ═══ SALUD ═══ -->
        ${section('🏥 Salud y Alertas', `
          <div class="grid grid-cols-3 gap-1.5">
            ${chipBtn("App.addStudentEvent('" + studentId + "','temp')", '🌡️', 'Temperatura', hasEvent('temp'))}
            ${chipBtnNS("App._openMedModal('" + studentId + "')", '💊', 'Medicamento', hasEvent('med'))}
            ${chipBtn("App.addStudentEvent('" + studentId + "','hit')", '🤕', 'Golpe/Caída', hasEvent('incident', 'hit'))}
            ${chipBtn("App.addStudentEvent('" + studentId + "','vomit')", '🤮', 'Vómito', hasEvent('health', 'vomit'))}
            ${chipBtn("App.addStudentEvent('" + studentId + "','cough')", '😷', 'Tos/Congestión', hasEvent('health', 'cough'))}
          </div>
        `)}

        <div class="border-b border-slate-100"></div>

        <!-- ═══ EVENTOS EXTRA ═══ -->
        ${section('⚠️ Eventos Extra', `
          <button onclick="App._openExtraEventModal('${studentId}')"
            class="w-full p-3 rounded-xl border-2 border-dashed border-slate-200 bg-white flex items-center gap-3 text-left hover:border-red-300 transition-all">
            <span class="text-xl">➕</span>
            <div class="flex-1">
              <div class="text-xs font-black text-slate-700">Agregar Evento</div>
              <div class="text-[10px] text-slate-400">Fiebre, accidente, golpe, llamada a padres</div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        `)}

        <div class="border-b border-slate-100"></div>

        <!-- ═══ CONDUCTA ═══ -->
        ${section('🤝 Conducta', `
          <div class="space-y-3">
            <div>
              <p class="text-[9px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">Social</p>
              <div class="grid grid-cols-2 gap-1.5">
                ${[
                  { val: 'shared', icon: '🤝', label: 'Compartió' }, { val: 'alone', icon: '🧍', label: 'Jugó solo' },
                  { val: 'group', icon: '👥', label: 'Grupo' }, { val: 'emotional_support', icon: '💛', label: 'Apoyo emocional' }
                ].map(b => `
                  <button onclick="App.setStudentBehavior('${studentId}','social','${b.val}')"
                    class="p-2 rounded-xl border-2 border-slate-100 bg-white flex items-center gap-2 text-left active:scale-95 transition-all">
                    <span class="text-base">${b.icon}</span>
                    <span class="text-[9px] font-black text-slate-600">${b.label}</span>
                  </button>
                `).join('')}
              </div>
            </div>
            <div>
              <p class="text-[9px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">Clase</p>
              <div class="grid grid-cols-2 gap-1.5">
                ${[
                  { val: 'attention', icon: '👂', label: 'Atención' }, { val: 'participation', icon: '🙋', label: 'Participó' },
                  { val: 'curiosity', icon: '🔍', label: 'Curiosidad' }, { val: 'completed', icon: '✅', label: 'Terminó' },
                  { val: 'needed_help', icon: '🙋‍♀️', label: 'Necesitó ayuda' }
                ].map(b => `
                  <button onclick="App.setStudentBehavior('${studentId}','classroom','${b.val}')"
                    class="p-2 rounded-xl border-2 border-slate-100 bg-white flex items-center gap-2 text-left active:scale-95 transition-all">
                    <span class="text-base">${b.icon}</span>
                    <span class="text-[9px] font-black text-slate-600">${b.label}</span>
                  </button>
                `).join('')}
              </div>
            </div>
            <div>
              <p class="text-[9px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">Emocional</p>
              <div class="grid grid-cols-2 gap-1.5">
                ${[
                  { val: 'controlled', icon: '😌', label: 'Controló' }, { val: 'frustrated', icon: '😤', label: 'Se frustró' },
                  { val: 'crying', icon: '😭', label: 'Lloró' }, { val: 'anxious', icon: '😰', label: 'Ansiedad' },
                  { val: 'calmed', icon: '🧘', label: 'Se calmó' }
                ].map(b => `
                  <button onclick="App.setStudentBehavior('${studentId}','emotional','${b.val}')"
                    class="p-2 rounded-xl border-2 border-slate-100 bg-white flex items-center gap-2 text-left active:scale-95 transition-all">
                    <span class="text-base">${b.icon}</span>
                    <span class="text-[9px] font-black text-slate-600">${b.label}</span>
                  </button>
                `).join('')}
              </div>
            </div>
            <div>
              <p class="text-[9px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">Montessori</p>
              <div class="grid grid-cols-3 gap-1.5">
                ${[
                  { val: 'manipulation', icon: '🤲', label: 'Manipulación' }, { val: 'fine_motor', icon: '✋', label: 'Fina' },
                  { val: 'gross_motor', icon: '🏃', label: 'Gruesa' }, { val: 'language', icon: '💬', label: 'Lenguaje' },
                  { val: 'concentration', icon: '🎯', label: 'Concentración' }, { val: 'autonomy', icon: '💪', label: 'Autonomía' }
                ].map(b => `
                  <button onclick="App.setStudentBehavior('${studentId}','montessori','${b.val}')"
                    class="p-2 rounded-xl border-2 border-slate-100 bg-white flex flex-col items-center gap-0.5 active:scale-95 transition-all">
                    <span class="text-base">${b.icon}</span>
                    <span class="text-[8px] font-black text-slate-600">${b.label}</span>
                  </button>
                `).join('')}
              </div>
            </div>
          </div>
        `)}

        <div class="border-b border-slate-100"></div>

        <!-- ═══ NOTA ═══ -->
        ${section('📝 Nota Individual', `
          <textarea id="studentNote-${studentId}" placeholder="Escribe una nota sobre el día..."
            class="w-full p-3 border-2 border-slate-100 rounded-xl text-xs focus:border-blue-400 outline-none" rows="3">${safeEscapeHTML(log?.notes || '')}</textarea>
          <button onclick="App.saveStudentNote('${studentId}')"
            class="mt-2 w-full p-3 rounded-xl text-white font-black text-xs uppercase" style="background:#28B54D">Guardar Nota</button>
        `)}

        <div class="border-b border-slate-100"></div>

        <!-- ═══ TIMELINE ═══ -->
        ${section('🕐 Línea de tiempo del día', `
          <div class="space-y-1 max-h-48 overflow-y-auto">${timelineHtml}</div>
        `)}

      </div>
    </div>
  `;
  UI.Modal.open('studentRoutineModal', modalContent);
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

export async function deleteInfantEvent(studentId, eventId) {
  if (!studentId || !eventId) return;
  const classroom = AppState.get('classroom');
  try {
    const log = _logsMap[studentId];
    if (!log?.infant_data) return;
    const filtered = log.infant_data.filter(e => e.id !== eventId);
    if (filtered.length === log.infant_data.length) return;
    await supabase.from('daily_logs').update({ infant_data: filtered }).eq('id', log.id);
    safeToast('Evento eliminado', 'success');
    await initRoutine();
    openStudentRoutine(studentId);
  } catch { safeToast('Error al eliminar', 'error'); }
}

function _isModalOpen() {
  return !!document.getElementById('studentRoutineModal')?.querySelector('#sr-scroll');
}

export async function setStudentMood(studentId, mood) {
  const classroom = AppState.get('classroom');
  try {
    await MaestraApi.upsertDailyLog({ student_id: studentId, classroom_id: classroom.id, date: _today(), mood });
    safeToast('Estado emocional guardado', 'success');
    await initRoutine();
    if (_isModalOpen()) openStudentRoutine(studentId);
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
    if (_isModalOpen()) openStudentRoutine(studentId);
  } catch { safeToast('Error al guardar', 'error'); }
}

export async function setStudentNap(studentId, nap) {
  const classroom = AppState.get('classroom');
  try {
    await MaestraApi.upsertDailyLog({ student_id: studentId, classroom_id: classroom.id, date: _today(), nap });
    safeToast('Siesta guardada', 'success');
    await initRoutine();
    if (_isModalOpen()) openStudentRoutine(studentId);
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
    if (_isModalOpen()) openStudentRoutine(studentId);
  } catch { safeToast('Error al guardar', 'error'); }
}

export async function addStudentEvent(studentId, eventId, customLabel) {
  const classroom = AppState.get('classroom');
  const ev = INDIV_EVENTS.find(e => e.id === eventId);
  if (!ev) return;
  if (_isDuplicate(studentId, eventId)) { safeToast('Evento registrado hace poco', 'warning'); return; }
  const label = customLabel || ev.label;
  try {
    if (ev.type === 'milk') {
      _openMilkModal(studentId);
      return;
    } else if (ev.type === 'temp') {
      _openTempModal(studentId);
      return;
    } else if (ev.type === 'med') {
      _openMedModal(studentId);
      return;
    } else {
      await MaestraApi.upsertDailyLog({ student_id: studentId, classroom_id: classroom.id, date: _today(), infant_event: { type: ev.type, subtype: ev.subtype, label } });
    }
    safeToast(`${label} registrado`, 'success');
    await initRoutine();
    if (_isModalOpen()) openStudentRoutine(studentId);
  } catch { safeToast('Error al guardar', 'error'); }
}

export async function saveStudentNote(studentId) {
  const classroom = AppState.get('classroom');
  const noteEl = document.getElementById(`studentNote-${studentId}`);
  try {
    await MaestraApi.upsertDailyLog({ student_id: studentId, classroom_id: classroom.id, date: _today(), notes: noteEl?.value || '' });
    safeToast('Nota guardada', 'success');
    await initRoutine();
    openStudentRoutine(studentId);
  } catch { safeToast('Error al guardar', 'error'); }
}

export async function routineWakeAll() {
  const classroom = AppState.get('classroom');
  const studentsToWake = Object.keys(_sleepMap);
  if (studentsToWake.length === 0) return;
  if (!confirm(`¿Despertar a ${studentsToWake.length} estudiante(s)?`)) return;
  try {
    for (const studentId of studentsToWake) {
      await MaestraApi.upsertDailyLog({ student_id: studentId, classroom_id: classroom.id, date: _today(), infant_event: { type: 'sleep', end_time: new Date().toISOString() } });
    }
    safeToast('Todas las siestas terminadas!', 'success');
    await initRoutine();
  } catch { safeToast('Error al actualizar siestas', 'error'); }
}

export async function routineWakeStudent(studentId) {
  const classroom = AppState.get('classroom');
  try {
    await MaestraApi.upsertDailyLog({ student_id: studentId, classroom_id: classroom.id, date: _today(), infant_event: { type: 'sleep', end_time: new Date().toISOString() } });
    safeToast('Estudiante despertado', 'success');
    await initRoutine();
    openStudentRoutine(studentId);
  } catch { safeToast('Error al despertar', 'error'); }
}

// ═══════════════════════════════════════════════════════════════════════════════
// BIBERÓN, MEDICAMENTO, EVENTOS EXTRA — MODALS
// ═══════════════════════════════════════════════════════════════════════════════

export function _openMilkModal(studentId) {
  UI.Modal.open('milkModal', _renderMilkModal(studentId));
}

export function _openMedModal(studentId) {
  UI.Modal.open('medModal', _renderMedModal(studentId));
}

export function _openExtraEventModal(studentId) {
  UI.Modal.open('extraEventModal', _renderExtraEventModal(studentId));
}

export async function _confirmMilk(studentId) {
  const btn = document.querySelector('#milkModal button:last-of-type');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }
  const classroom = AppState.get('classroom');
  const oz = parseFloat(document.getElementById('milkOz')?.value) || null;
  const temp = document.getElementById('milkTemp')?.value || null;
  const time = document.getElementById('milkTime')?.value || null;
  const notes = document.getElementById('milkNotes')?.value || '';
  try {
    await MaestraApi.upsertDailyLog({
      student_id: studentId, classroom_id: classroom.id, date: _today(),
      infant_event: { type: 'milk', label: 'Biberón', oz, temp, time, notes }
    });
    safeToast('Biberón registrado', 'success');
    UI.Modal.close('milkModal');
    await initRoutine();
    openStudentRoutine(studentId);
  } catch { safeToast('Error al guardar', 'error'); if (btn) { btn.disabled = false; btn.textContent = 'Guardar Biberón'; } }
}

export async function _confirmMed(studentId) {
  const btn = document.querySelector('#medModal button:last-of-type');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }
  const classroom = AppState.get('classroom');
  const name = document.getElementById('medName')?.value || '';
  const dose = document.getElementById('medDose')?.value || '';
  const time = document.getElementById('medTime')?.value || null;
  const authorized = document.getElementById('medAuth')?.checked || false;
  const notes = document.getElementById('medNotes')?.value || '';
  if (!name) { safeToast('Ingresa el nombre del medicamento', 'warning'); if (btn) { btn.disabled = false; btn.textContent = 'Guardar Medicamento'; } return; }
  try {
    await MaestraApi.upsertDailyLog({
      student_id: studentId, classroom_id: classroom.id, date: _today(),
      infant_event: { type: 'med', label: 'Medicamento', name, dose, time, authorized, notes }
    });
    safeToast('Medicamento registrado', 'success');
    UI.Modal.close('medModal');
    await initRoutine();
    openStudentRoutine(studentId);
  } catch { safeToast('Error al guardar', 'error'); if (btn) { btn.disabled = false; btn.textContent = 'Guardar Medicamento'; } }
}

export async function _confirmExtraEvent(studentId) {
  const btn = document.querySelector('#extraEventModal button:last-of-type');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }
  const classroom = AppState.get('classroom');
  const type = document.getElementById('extraType')?.value;
  const desc = document.getElementById('extraDesc')?.value || '';
  const notify = document.getElementById('extraNotify')?.checked || false;
  if (!type) { safeToast('Selecciona un tipo de evento', 'warning'); if (btn) { btn.disabled = false; btn.textContent = 'Guardar Evento'; } return; }
  const evDef = EXTRA_EVENTS.find(e => e.id === type);
  try {
    await MaestraApi.upsertDailyLog({
      student_id: studentId, classroom_id: classroom.id, date: _today(),
      infant_event: { type: 'incident', subtype: evDef?.subtype || type, label: evDef?.label || type, description: desc, notifyParents: notify }
    });
    safeToast(`${evDef?.label || 'Evento'} registrado`, 'success');
    UI.Modal.close('extraEventModal');
    await initRoutine();
    openStudentRoutine(studentId);
  } catch { safeToast('Error al guardar', 'error'); if (btn) { btn.disabled = false; btn.textContent = 'Guardar Evento'; } }
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUICK ADD EVENT FROM TIMELINE
// ═══════════════════════════════════════════════════════════════════════════════

const QUICK_EVENTS = [
  { id: 'poop',     icon: '💩', label: 'Popó' },
  { id: 'pee',      icon: '💧', label: 'Pipí' },
  { id: 'toilet',   icon: '🚽', label: 'Baño' },
  { id: 'diaper',   icon: '🧻', label: 'Cambio pañal' },
  { id: 'milk',     icon: '🍼', label: 'Biberón' },
  { id: 'temp',     icon: '🌡️', label: 'Temperatura' },
  { id: 'activity', icon: '🎨', label: 'Actividad' },
  { id: 'sensorial',icon: '🔬', label: 'Sensorial' },
  { id: 'playground',icon: '🌳', label: 'Patio' },
  { id: 'handwash', icon: '🧼', label: 'Lavado manos' },
  { id: 'toothbrush',icon: '🪥', label: 'Cepillado' },
  { id: 'med',      icon: '💊', label: 'Medicamento' },
  { id: 'hit',      icon: '🤕', label: 'Golpe/Caída' },
  { id: 'vomit',    icon: '🤮', label: 'Vómito' },
  { id: 'cough',    icon: '😷', label: 'Tos/Congestión' },
];

export function openQuickAddModal() {
  const classroom = AppState.get('classroom');
  const allStudents = AppState.get('students') || [];
  const today = _today();
  const presentStudents = allStudents.filter(s => {
    if (!_logsMap) return true;
    const log = _logsMap[s.id];
    return !log || log.date !== today || log.status === 'present' || log.status === 'late';
  });
  const studentOptions = presentStudents.length > 0 ? presentStudents : allStudents;

  UI.Modal.open('quickAddModal', `
    <div class="bg-white overflow-hidden" style="border-radius:24px;max-width:420px;margin:0 auto">
      <div class="p-5" style="background:linear-gradient(135deg,#0B63C7,#28B54D)">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span class="text-2xl">➕</span>
            <div><h3 class="text-lg font-black text-white">Agregar Evento</h3><p class="text-xs font-bold text-white/80">Selecciona tipo y alumno</p></div>
          </div>
          <button onclick="UI.Modal.close('quickAddModal')" class="p-2 rounded-xl bg-white/20 text-white">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      </div>
      <div class="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
        <div>
          <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Alumno</label>
          <select id="qaStudent" class="w-full mt-1 p-3 border-2 border-slate-100 rounded-xl text-sm font-bold text-slate-700 outline-none focus:border-blue-400 bg-white">
            <option value="">Seleccionar alumno...</option>
            ${studentOptions.map(s => `<option value="${s.id}">${safeEscapeHTML(s.name || s.full_name || '')}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo de evento</label>
          <div class="grid grid-cols-3 gap-1.5 mt-2">
            ${QUICK_EVENTS.map(ev => `
              <button type="button"
                onclick="document.getElementById('qaType').value='${ev.id}';document.getElementById('qaCustomLabel').value='${ev.label}';this.parentElement.querySelectorAll('button').forEach(b=>b.classList.remove('border-blue-500','bg-blue-50'));this.classList.add('border-blue-500','bg-blue-50')"
                class="p-2 rounded-xl border-2 border-slate-100 text-center flex flex-col items-center gap-0.5 active:scale-95 transition-all">
                <span class="text-lg">${ev.icon}</span>
                <span class="text-[7px] font-black text-slate-600">${ev.label}</span>
              </button>
            `).join('')}
          </div>
          <input type="hidden" id="qaType" value="">
        </div>
        <div>
          <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nombre personalizado</label>
          <input id="qaCustomLabel" type="text" placeholder="Ej: Baño con agua tibia"
            class="w-full mt-1 p-3 border-2 border-slate-100 rounded-xl text-sm font-bold text-slate-700 outline-none focus:border-blue-400">
        </div>
        <button onclick="App._submitQuickAdd()" class="w-full py-3 rounded-xl font-black text-xs uppercase text-white" style="background:#28B54D">Registrar Evento</button>
      </div>
    </div>
  `);
}

export async function _submitQuickAdd() {
  const studentId = document.getElementById('qaStudent')?.value;
  const eventId = document.getElementById('qaType')?.value;
  const customLabel = document.getElementById('qaCustomLabel')?.value?.trim();
  if (!studentId) { safeToast('Selecciona un alumno', 'warning'); return; }
  if (!eventId) { safeToast('Selecciona un tipo de evento', 'warning'); return; }
  UI.Modal.close('quickAddModal');
  await addStudentEvent(studentId, eventId, customLabel || undefined);
}

// ═══════════════════════════════════════════════════════════════════════════════
// BULK REPORT
// ═══════════════════════════════════════════════════════════════════════════════

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
