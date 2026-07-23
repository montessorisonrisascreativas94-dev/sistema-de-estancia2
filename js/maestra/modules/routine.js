/**
 * Rutina Express v5 — Sonrisas Creativas
 * Timeline inteligente · Vista horizontal/vertical · Eventos configurables · Centro de trabajo diario
 */
import { AppState } from '../state.js';
import { UI, safeToast, safeEscapeHTML, safeUrl } from './ui.js';
import { MaestraApi } from '../api.js';

// ── Estado del módulo ────────────────────────────────────────────────────────
let _logsMap = {};
let _sleepMap = {};
let _lastEvent = {};
let _expandedEvent = null;
let _autoRefreshTimer = null;
let _scheduleConfig = null;
let _viewMode = localStorage.getItem('sonrisas_view_mode') || 'horizontal';

// ── Schedule Config (guardado en localStorage, configurable por directora) ────
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

// ── Helpers ──────────────────────────────────────────────────────────────────
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

function _getDayOfWeek() {
  return new Date().getDay();
}

function _toggleViewMode() {
  _viewMode = _viewMode === 'horizontal' ? 'vertical' : 'horizontal';
  localStorage.setItem('sonrisas_view_mode', _viewMode);
  initRoutine();
}

// ── Schedule Config Management ───────────────────────────────────────────────
function _loadScheduleConfig() {
  try {
    const stored = localStorage.getItem(SCHEDULE_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed._version === SCHEDULE_VERSION) {
        _scheduleConfig = parsed.events;
        return _scheduleConfig;
      }
    }
  } catch {}
  _scheduleConfig = DEFAULT_SCHEDULE.map(e => ({ ...e }));
  _saveScheduleConfig();
  return _scheduleConfig;
}

function _saveScheduleConfig() {
  try {
    localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify({
      _version: SCHEDULE_VERSION,
      events: _scheduleConfig
    }));
  } catch {}
}

function _getSchedule() {
  if (!_scheduleConfig) _loadScheduleConfig();
  const dayOfWeek = _getDayOfWeek();
  return _scheduleConfig.filter(e => e.active && e.days.includes(dayOfWeek));
}

// ── Event Status Calculator ──────────────────────────────────────────────────
function _getEventStatus(event, nowMinutes) {
  const startMin = _timeToMinutes(event.startTime);
  const endMin = startMin + (event.duration || 30);

  if (nowMinutes < startMin) return 'pending';
  if (nowMinutes >= startMin && nowMinutes < endMin) return 'in_progress';
  if (nowMinutes >= endMin) return 'completed';
  return 'pending';
}

function _getStatusConfig(status, event) {
  const configs = {
    pending:     { label: 'Pendiente',   color: '#94A3B8', bg: '#f1f5f9', icon: '⚪' },
    in_progress: { label: 'En proceso',  color: event?.color || '#FF8A00', bg: (event?.color || '#FF8A00') + '15', icon: '🟡' },
    completed:   { label: 'Completado',  color: '#28B54D', bg: '#f0fdf4', icon: '🟢' },
    delayed:     { label: 'Retrasado',   color: '#EF4444', bg: '#fef2f2', icon: '🔴' }
  };
  return configs[status] || configs.pending;
}

function _getEventProgress(event, students, logsMap) {
  if (!students || students.length === 0) return { done: 0, total: 0, pct: 0 };

  const gid = event.groupEventId;
  if (!gid) return { done: 0, total: students.length, pct: 0 };

  const GROUP_MAP = {
    breakfast:   { field: 'food', key: 'breakfast' },
    lunch:       { field: 'food', key: 'lunch' },
    snack:       { field: 'food', key: 'snack' },
    handwash:    { field: '_group', type: 'handwash' },
    toothbrush:  { field: '_group', type: 'toothbrush' },
    activity:    { field: '_group', type: 'activity' },
    playground:  { field: '_group', type: 'playground' },
    sleep_start: { field: '_sleep', type: 'sleep' },
    sleep_end:   { field: '_sleep_end', type: 'sleep' }
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
      try {
        const foodObj = JSON.parse(log.food || '{}');
        if (foodObj[mapping.key]) { counted = true; done++; }
      } catch {}
    } else if (mapping.field === '_group') {
      if ((log.infant_data || []).some(e => e.type === mapping.type)) { counted = true; done++; }
    } else if (mapping.field === '_sleep') {
      if ((log.infant_data || []).some(e => e.type === 'sleep')) { counted = true; done++; }
    } else if (mapping.field === '_sleep_end') {
      const sleeps = (log.infant_data || []).filter(e => e.type === 'sleep' && e.end_time);
      if (sleeps.length > 0) { counted = true; done++; }
    }
    if (counted) markedStudents.push(s.name);
  }

  return { done, total: students.length, pct: Math.round((done / students.length) * 100), markedStudents };
}

// ── Catálogo de eventos INDIVIDUALES ─────────────────────────────────────────
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

// ── Collective event types that can also appear as quick actions ─────────────
const COLLECTIVE_QUICK_EVENTS = [
  { id: 'bathroom',  emoji: '🚽', label: 'Baño',        color: '#28B54D', groupEventId: 'bathroom',  type: '_group',  eventType: 'bath',    active: true },
  { id: 'poop_gr',   emoji: '💩', label: 'Popó',        color: '#FF8A00', groupEventId: 'poop_gr',   type: '_group',  eventType: 'diaper',   active: true },
  { id: 'milk_gr',   emoji: '🍼', label: 'Biberón',     color: '#0B63C7', groupEventId: 'milk_gr',   type: '_group',  eventType: 'milk',     active: true }
];

// ── Render: Horizontal Timeline ──────────────────────────────────────────────
function _renderTimeline(schedule, nowMinutes) {
  return `
    <div class="routine-timeline-wrap">
      <style>
        .routine-timeline-wrap{overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;padding:4px 0 12px}
        .routine-timeline-wrap::-webkit-scrollbar{display:none}
        .routine-timeline{display:flex;align-items:flex-start;gap:0;min-width:max-content;padding:0 8px;position:relative}
        .routine-timeline::before{content:'';position:absolute;top:22px;left:24px;right:24px;height:3px;background:#e2e8f0;border-radius:2px;z-index:0}
        .tl-event{display:flex;flex-direction:column;align-items:center;min-width:72px;max-width:80px;cursor:pointer;position:relative;z-index:1;padding:0 4px;transition:transform .15s}
        .tl-event:active{transform:scale(.92)}
        .tl-dot{width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.3rem;border:3px solid #e2e8f0;background:white;transition:all .3s;position:relative;flex-shrink:0}
        .tl-dot.pending{border-color:#e2e8f0;background:#f8fafc}
        .tl-dot.in_progress{border-color:var(--ev-color,#FF8A00);background:var(--ev-color,#FF8A00);animation:pulse-dot 1.5s infinite;box-shadow:0 0 0 4px color-mix(in srgb,var(--ev-color,#FF8A00) 20%,transparent)}
        .tl-dot.completed{border-color:#28B54D;background:#28B54D}
        .tl-dot.delayed{border-color:#EF4444;background:#EF4444}
        @keyframes pulse-dot{0%,100%{box-shadow:0 0 0 4px color-mix(in srgb,var(--ev-color,#FF8A00) 20%,transparent)}50%{box-shadow:0 0 0 8px color-mix(in srgb,var(--ev-color,#FF8A00) 10%,transparent)}}
        .tl-label{font-size:.55rem;font-weight:900;text-transform:uppercase;letter-spacing:.04em;color:#94a3b8;text-align:center;line-height:1.2;margin-top:6px;max-width:72px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .tl-event.active .tl-label{color:var(--ev-color,#FF8A00)}
        .tl-event.done .tl-label{color:#28B54D}
        .tl-time{font-size:.5rem;font-weight:700;color:#cbd5e1;margin-top:2px}
        .tl-event.active .tl-time{color:var(--ev-color,#FF8A00)}
        .tl-connector{width:24px;display:flex;align-items:center;justify-content:center;flex-shrink:0;padding-top:18px}
        .tl-connector-line{width:100%;height:3px;border-radius:2px;background:#e2e8f0}
        .tl-connector.done .tl-connector-line{background:#28B54D}
      </style>
      <div class="routine-timeline" id="routineTimeline">
        ${schedule.map((ev, i) => {
          const status = _getEventStatus(ev, nowMinutes);
          const isActive = status === 'in_progress';
          const isDone = status === 'completed';
          const statusClass = isDone ? 'completed' : isActive ? 'in_progress' : 'pending';
          const itemClass = isActive ? 'active' : isDone ? 'done' : '';
          const checkMark = isDone ? '✓' : '';

          let connectorClass = '';
          if (i > 0) {
            const prevStatus = _getEventStatus(schedule[i - 1], nowMinutes);
            connectorClass = prevStatus === 'completed' ? 'done' : '';
          }

          return `
            ${i > 0 ? `<div class="tl-connector ${connectorClass}"><div class="tl-connector-line"></div></div>` : ''}
            <div class="tl-event ${itemClass}" onclick="App.expandTimelineEvent('${ev.id}')" style="--ev-color:${ev.color}">
              <div class="tl-dot ${statusClass}" style="--ev-color:${ev.color}">
                ${checkMark || ev.emoji}
              </div>
              <span class="tl-label">${safeEscapeHTML(ev.label)}</span>
              <span class="tl-time">${_fmtTimeShort(ev.startTime)}</span>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

// ── Render: Vertical Schedule (detailed view) ───────────────────────────────
function _renderVerticalSchedule(schedule, students, logsMap, nowMinutes) {
  if (schedule.length === 0) return '<p class="text-center text-slate-400 text-xs py-4">Sin eventos configurados</p>';

  return `
    <div class="space-y-2" id="verticalSchedule">
      <style>
        .vs-row{display:flex;align-items:stretch;border-radius:16px;border:2px solid #f1f5f9;background:white;overflow:hidden;transition:all .2s;cursor:pointer}
        .vs-row:active{transform:scale(.98)}
        .vs-row.is-active{border-color:var(--ev-color);box-shadow:0 0 0 3px color-mix(in srgb,var(--ev-color) 15%,transparent)}
        .vs-row.is-done{border-color:#bbf7d0;background:#f0fdf4}
        .vs-row.is-pending{opacity:.7}
        .vs-emoji-bar{width:52px;display:flex;align-items:center;justify-content:center;font-size:1.5rem;flex-shrink:0}
        .vs-info{flex:1;padding:10px 12px;min-width:0}
        .vs-meta{display:flex;align-items:center;gap:8px;margin-top:3px;flex-wrap:wrap}
        .vs-chip{font-size:.55rem;font-weight:800;padding:2px 8px;border-radius:20px;white-space:nowrap}
        .vs-progress-track{height:4px;border-radius:2px;background:#e2e8f0;overflow:hidden;margin-top:6px}
        .vs-progress-fill{height:100%;border-radius:2px;transition:width .5s}
        .vs-right{display:flex;flex-direction:column;align-items:flex-end;justify-content:center;padding:10px 12px;gap:2px;flex-shrink:0}
      </style>
      ${schedule.map(ev => {
        const status = _getEventStatus(ev, nowMinutes);
        const progress = ev.groupEventId ? _getEventProgress(ev, students, logsMap) : null;
        const stCfg = _getStatusConfig(status, ev);
        const startMin = _timeToMinutes(ev.startTime);
        const endMin = startMin + (ev.duration || 30);
        const isExpanded = _expandedEvent === ev.id;

        const rowClass = status === 'in_progress' ? 'is-active' : status === 'completed' ? 'is-done' : 'is-pending';

        let markedHtml = '';
        if (progress && progress.done > 0 && progress.markedStudents) {
          const shown = progress.markedStudents.slice(0, 4);
          const extra = progress.markedStudents.length - shown.length;
          markedHtml = `<span class="vs-chip" style="background:#e0f2fe;color:#0369a1">${shown.map(n => safeEscapeHTML((n || '').split(' ')[0])).join(', ')}${extra > 0 ? ` +${extra}` : ''}</span>`;
        }

        return `
          <div class="vs-row ${rowClass}" style="--ev-color:${ev.color}" onclick="App.expandTimelineEvent('${ev.id}')">
            <div class="vs-emoji-bar" style="background:${ev.color}12">
              ${status === 'completed' ? '✅' : status === 'in_progress' ? ev.emoji : ev.emoji}
            </div>
            <div class="vs-info">
              <div class="text-xs font-black text-slate-800">${safeEscapeHTML(ev.label)}</div>
              <div class="vs-meta">
                <span class="vs-chip" style="background:${stCfg.bg};color:${stCfg.color}">${stCfg.icon} ${stCfg.label}</span>
                <span class="text-[9px] font-bold text-slate-400">${_fmtTimeShort(ev.startTime)} – ${_fmtTimeShort(_minutesToTime(endMin))}</span>
                <span class="text-[9px] font-bold text-slate-300">${ev.duration}min</span>
              </div>
              ${progress ? `
                <div class="vs-progress-track">
                  <div class="vs-progress-fill" style="width:${progress.pct}%;background:${ev.color}"></div>
                </div>
                <div class="flex items-center gap-1.5 mt-1 flex-wrap">
                  <span class="text-[8px] font-bold text-slate-400">${progress.done}/${progress.total}</span>
                  ${markedHtml}
                </div>
              ` : ''}
            </div>
            <div class="vs-right">
              ${ev.groupEventId ? `<span class="text-[8px] font-black uppercase tracking-wider" style="color:${ev.color}">Grupal</span>` : '<span class="text-[8px] font-black text-slate-300 uppercase">Indv</span>'}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="text-slate-300 mt-1"><path d="${isExpanded ? 'M18 15l-6-6-6 6' : 'M6 9l6 6 6-6'}"/></svg>
            </div>
          </div>
          ${isExpanded ? `<div class="ml-6">${_renderExpandedInline(ev, students, logsMap, nowMinutes)}</div>` : ''}
        `;
      }).join('')}
    </div>
  `;
}

// ── Render: Expanded Event Panel (shared between modes) ──────────────────────
function _renderExpandedInline(event, students, logsMap, nowMinutes) {
  const progress = _getEventProgress(event, students, logsMap);
  const startMin = _timeToMinutes(event.startTime);
  const endMin = startMin + (event.duration || 30);

  return `
    <div class="rounded-2xl border-2 overflow-hidden mb-2" style="border-color:${event.color}30;background:white;animation:slideDown .25s ease">
      <style>@keyframes slideDown{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}</style>
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
        ${progress.markedStudents && progress.markedStudents.length > 0 ? `
        <div class="flex flex-wrap gap-1 mt-2">
          ${progress.markedStudents.map(name => `<span class="text-[8px] font-bold px-2 py-0.5 rounded-full bg-green-50 text-green-700">✓ ${safeEscapeHTML((name || '').split(' ')[0])}</span>`).join('')}
        </div>` : ''}
      </div>
      ` : ''}
      <div class="p-3 flex gap-2">
        ${event.groupEventId ? `
        <button onclick="App.routineQuickGroup('${event.groupEventId}');event.stopPropagation()"
          class="flex-1 py-2.5 rounded-xl font-black text-[10px] uppercase text-white tracking-wider" style="background:${event.color}">
          Registrar Ahora
        </button>
        ` : ''}
        <button onclick="App.openEventConfig('${event.id}');event.stopPropagation()"
          class="px-3 py-2.5 rounded-xl border-2 border-slate-200 font-black text-[10px] uppercase text-slate-500">
          ⚙️
        </button>
      </div>
    </div>
  `;
}

// ── Render: Expanded Event Panel (horizontal mode - slot-based) ──────────────
function _renderExpandedEvent(event, students, logsMap, nowMinutes) {
  return _renderExpandedInline(event, students, logsMap, nowMinutes);
}

// ── Render: Student Card ─────────────────────────────────────────────────────
function _studentCard(s, log) {
  const prog = _calcProgress(log);
  const sleeping = !!_sleepMap[s.id];
  const hasMed = (log?.infant_data || []).some(e => e.type === 'med');

  let borderClass = '';
  if (hasMed) borderClass = 'border-red';
  else if (sleeping) borderClass = 'border-purple';
  else if (prog >= 80) borderClass = 'border-green';

  const moodEmoji = { feliz: '😊', normal: '😐', triste: '😢', enojado: '😡', muy_feliz: '😁', cansado: '😴', enfermo: '🤒' }[log?.mood] || '';
  let foodEmoji = '';
  if (log?.food) {
    try {
      const foodObj = JSON.parse(log.food);
      const meals = [];
      if (foodObj.breakfast) meals.push('🍞');
      if (foodObj.lunch) meals.push('🥗');
      if (foodObj.snack) meals.push('🍎');
      foodEmoji = meals.join('');
    } catch {}
  }
  const napEmoji = { si: '💤', no: '—' }[log?.nap] || '';

  return `
    <div class="stu-card ${borderClass}" onclick="App.openStudentRoutine('${s.id}')">
      ${sleeping ? '<span style="position:absolute;top:4px;left:4px;font-size:.6rem;background:#c4b5fd;color:#7c3aed;border-radius:6px;padding:1px 5px;font-weight:900">💤</span>' : ''}
      ${hasMed ? '<span style="position:absolute;top:4px;right:4px;font-size:.6rem;background:#fecdd3;color:#ef4444;border-radius:6px;padding:1px 5px;font-weight:900">💊</span>' : ''}
      <div class="w-10 h-10 rounded-xl bg-orange-50 overflow-hidden flex items-center justify-center font-black text-sm text-orange-300 border-2 border-white shadow-sm flex-shrink-0">
        ${s.avatar_url ? `<img src="${safeUrl(s.avatar_url)}" class="w-full h-full object-cover">` : `<span>${safeEscapeHTML((s.name || '?').charAt(0))}</span>`}
      </div>
      <h4 class="text-[9px] font-black text-slate-800 leading-tight line-clamp-1">${safeEscapeHTML((s.name || '').split(' ')[0])}</h4>
      <div class="flex gap-0.5 text-xs">${moodEmoji}${foodEmoji}${napEmoji}</div>
      <div class="prog-bar" style="height:3px;border-radius:2px;background:#e2e8f0;overflow:hidden;margin-top:3px;width:100%">
        <div style="height:100%;border-radius:2px;background:${prog >= 80 ? '#28B54D' : prog >= 50 ? '#FF8A00' : '#94A3B8'};width:${prog}%;transition:width .4s"></div>
      </div>
      <span class="text-[8px] font-bold text-slate-400">${prog}%</span>
    </div>
  `;
}

// ── Render: Main UI ──────────────────────────────────────────────────────────
function _buildUI(students, schedule, nowMinutes, todayLabel, timeLabel, complete) {
  const totalStu = students.length;
  const progressPct = totalStu > 0 ? Math.round((complete / totalStu) * 100) : 0;

  const currentEvent = schedule.find(e => _getEventStatus(e, nowMinutes) === 'in_progress');
  const nextEvent = schedule.find(e => _getEventStatus(e, nowMinutes) === 'pending');
  const openSleeps = Object.keys(_sleepMap).length;

  const isVertical = _viewMode === 'vertical';

  // ── All collective quick events (from schedule + additional ones) ──
  const allCollectiveEvents = [
    ...schedule.filter(e => e.groupEventId),
    ...COLLECTIVE_QUICK_EVENTS.filter(qe => !schedule.some(e => e.groupEventId === qe.groupEventId))
  ];

  return `
    <div class="space-y-4 pb-28" id="routineView">
      <style>
        .stu-card{border-radius:16px;padding:10px 8px;border:2px solid #e2e8f0;background:white;cursor:pointer;touch-action:manipulation;transition:all .15s;display:flex;flex-direction:column;align-items:center;text-align:center;gap:3px;position:relative;min-height:90px}
        .stu-card:active{transform:scale(.95)}
        .stu-card.border-red{border-color:#fca5a5!important}
        .stu-card.border-purple{border-color:#c4b5fd!important}
        .stu-card.border-green{border-color:#86efac!important}
      </style>

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
            <!-- Toggle View Mode -->
            <button onclick="App._toggleViewMode()" class="p-2 rounded-xl ${isVertical ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'}" title="${isVertical ? 'Vista horizontal' : 'Vista vertical'}">
              ${isVertical
                ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 12h18M3 6h18M3 18h18"/></svg>'
                : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 12h18"/><path d="M12 3v18"/></svg>'}
            </button>
            <button onclick="App.initRoutine()" class="p-2 rounded-xl bg-slate-100 text-slate-500" title="Actualizar">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 11-6.219-8.56"/><path d="M21 3v5h-5"/></svg>
            </button>
          </div>
        </div>
        <!-- Global progress bar -->
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

      <!-- TIMELINE SECTION — Horizontal or Vertical -->
      <div>
        <div class="flex items-center justify-between mb-2 px-1">
          <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            ${isVertical ? 'Horario detallado' : 'Línea de tiempo del día'}
          </p>
          <button onclick="App.openScheduleConfig()" class="text-[10px] font-black text-blue-600 uppercase tracking-wide flex items-center gap-1">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
            Configurar
          </button>
        </div>

        ${isVertical
          ? _renderVerticalSchedule(schedule, students, _logsMap, nowMinutes)
          : _renderTimeline(schedule, nowMinutes)
        }
      </div>

      <!-- EXPANDED EVENT PANEL (horizontal mode only, vertical has inline expansion) -->
      ${!isVertical ? '<div id="expandedEventPanel"></div>' : ''}

      <!-- EVENTOS COLECTIVOS -->
      <div>
        <div class="flex items-center justify-between mb-3 px-1">
          <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Acciones grupales</p>
          <span class="text-[9px] font-bold text-slate-300 uppercase">1 clic = registrar</span>
        </div>
        <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2" id="groupEventsGrid">
          ${allCollectiveEvents.map(ev => {
            const status = ev.startTime ? _getEventStatus(ev, nowMinutes) : null;
            const progress = ev.groupEventId ? _getEventProgress(ev, students, _logsMap) : null;
            const isDone = status === 'completed';
            const isActive = status === 'in_progress';
            const evColor = ev.color || '#94A3B8';

            return `
              <div class="rounded-xl border-2 p-3 text-center cursor-pointer transition-all active:scale-95"
                style="border-color:${isDone ? '#bbf7d0' : isActive ? evColor + '40' : '#f1f5f9'};background:${isDone ? '#f0fdf4' : isActive ? evColor + '08' : 'white'}"
                onclick="App.routineQuickGroup('${ev.groupEventId}')">
                <span class="text-2xl block">${ev.emoji}</span>
                <span class="text-[10px] font-black block mt-1 ${isDone ? 'text-green-700' : isActive ? '' : 'text-slate-500'}" style="${isActive ? 'color:' + evColor : ''}">${safeEscapeHTML(ev.label)}</span>
                ${progress && progress.total > 0 ? `<span class="text-[8px] font-bold block mt-0.5 ${isDone ? 'text-green-500' : 'text-slate-400'}">${progress.done}/${progress.total}</span>` : ''}
                ${isDone ? '<span class="text-[10px] font-black text-green-500">✓</span>' : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- EVENTOS INDIVIDUALES - Student Cards -->
      <div>
        <div class="flex items-center justify-between mb-3 px-1">
          <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Reportes individuales</p>
          <button onclick="App.openBulkRoutineModal()" class="text-[10px] font-black text-blue-600 uppercase tracking-wide">Reporte masivo</button>
        </div>
        <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2" id="studentsGrid">
          ${students.map(s => _studentCard(s, _logsMap[s.id])).join('')}
        </div>
      </div>
    </div>
  `;
}

// ── INIT PRINCIPAL ────────────────────────────────────────────────────────────
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

  const logs = await MaestraApi.getDailyRoutine(classroom.id);
  _logsMap = {};
  (logs || []).forEach(log => _logsMap[log.student_id] = log);

  _sleepMap = {};
  (logs || []).forEach(log => {
    const ev = (log.infant_data || []).filter(e => e.type === 'sleep' && !e.end_time).pop();
    if (ev) _sleepMap[log.student_id] = ev;
  });

  const complete = students.filter(s => _calcProgress(_logsMap[s.id]) >= 80).length;

  container.innerHTML = _buildUI(students, schedule, nowMinutes, todayLabel, timeLabel, complete);

  // Restore expanded event if any (horizontal mode only)
  if (_expandedEvent && _viewMode === 'horizontal') {
    const panel = document.getElementById('expandedEventPanel');
    if (panel) {
      const ev = schedule.find(e => e.id === _expandedEvent);
      if (ev) panel.innerHTML = _renderExpandedEvent(ev, students, _logsMap, nowMinutes);
    }
  }

  if (window.lucide) lucide.createIcons();

  setTimeout(() => {
    const timeline = document.getElementById('routineTimeline');
    if (!timeline) return;
    const activeDot = timeline.querySelector('.tl-event.active');
    if (activeDot) activeDot.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
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

// ── Expand/Collapse Timeline Event ───────────────────────────────────────────
export function expandTimelineEvent(eventId) {
  _expandedEvent = _expandedEvent === eventId ? null : eventId;

  if (_viewMode === 'vertical') {
    initRoutine();
    return;
  }

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
}

export function collapseTimelineEvent() {
  _expandedEvent = null;
  if (_viewMode === 'vertical') { initRoutine(); return; }
  const panel = document.getElementById('expandedEventPanel');
  if (panel) panel.innerHTML = '';
}

export function _toggleViewModeFn() { _toggleViewMode(); }

// ── Event Configuration ──────────────────────────────────────────────────────
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
          <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo de evento</label>
          <div class="grid grid-cols-3 gap-2 mt-1">
            ${['individual', 'colectivo', 'automatico'].map(t => `
              <button onclick="document.querySelectorAll('.cfg-type-btn').forEach(b=>b.classList.remove('border-blue-400','bg-blue-50'));this.classList.add('border-blue-400','bg-blue-50');document.getElementById('cfgType').value='${t}'"
                class="cfg-type-btn p-3 rounded-xl border-2 ${ev.type === t ? 'border-blue-400 bg-blue-50' : 'border-slate-100'} text-center">
                <span class="text-lg block">${t === 'individual' ? '👤' : t === 'colectivo' ? '👥' : '⚡'}</span>
                <span class="text-[9px] font-black text-slate-600 block capitalize">${t}</span>
              </button>
            `).join('')}
          </div>
          <input type="hidden" id="cfgType" value="${ev.type}">
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
        <div class="space-y-3">
          <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Opciones</label>
          <div class="flex items-center justify-between p-3 rounded-xl bg-slate-50">
            <span class="text-sm font-bold text-slate-700">Activo</span>
            <label class="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" id="cfgActive" ${ev.active ? 'checked' : ''} class="sr-only peer">
              <div class="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
            </label>
          </div>
          <div class="flex items-center justify-between p-3 rounded-xl bg-slate-50">
            <span class="text-sm font-bold text-slate-700">Requiere confirmación</span>
            <label class="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" id="cfgNeedsConfirm" ${ev.needsConfirm ? 'checked' : ''} class="sr-only peer">
              <div class="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
            </label>
          </div>
          <div class="flex items-center justify-between p-3 rounded-xl bg-slate-50">
            <span class="text-sm font-bold text-slate-700">Visible para padres</span>
            <label class="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" id="cfgVisibleParents" ${ev.visibleParents ? 'checked' : ''} class="sr-only peer">
              <div class="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
            </label>
          </div>
          <div class="flex items-center justify-between p-3 rounded-xl bg-slate-50">
            <span class="text-sm font-bold text-slate-700">Visible para dirección</span>
            <label class="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" id="cfgVisibleDirector" ${ev.visibleDirector ? 'checked' : ''} class="sr-only peer">
              <div class="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
            </label>
          </div>
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

  const startTime = document.getElementById('cfgStartTime')?.value || _scheduleConfig[evIndex].startTime;
  const duration = parseInt(document.getElementById('cfgDuration')?.value) || _scheduleConfig[evIndex].duration;
  const emoji = document.getElementById('cfgEmoji')?.value || _scheduleConfig[evIndex].emoji;
  const color = document.getElementById('cfgColor')?.value || _scheduleConfig[evIndex].color;
  const type = document.getElementById('cfgType')?.value || _scheduleConfig[evIndex].type;
  const active = document.getElementById('cfgActive')?.checked ?? true;
  const needsConfirm = document.getElementById('cfgNeedsConfirm')?.checked ?? false;
  const visibleParents = document.getElementById('cfgVisibleParents')?.checked ?? true;
  const visibleDirector = document.getElementById('cfgVisibleDirector')?.checked ?? true;

  const days = [];
  document.querySelectorAll('.cfg-day-btn').forEach(btn => {
    if (btn.classList.contains('border-blue-400')) days.push(parseInt(btn.dataset.day));
  });

  _scheduleConfig[evIndex] = {
    ..._scheduleConfig[evIndex],
    startTime, duration, emoji, color, type, active, needsConfirm, visibleParents, visibleDirector,
    days: days.length > 0 ? days : _scheduleConfig[evIndex].days
  };

  _saveScheduleConfig();
  UI.Modal.close('eventConfigModal');
  safeToast('Evento configurado', 'success');
  initRoutine();
}

export function openScheduleConfig() {
  const schedule = _scheduleConfig || DEFAULT_SCHEDULE;
  const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  const modalContent = `
    <div class="bg-white overflow-hidden" style="border-radius:32px;max-height:85vh;overflow-y:auto">
      <div class="p-6" style="background:linear-gradient(135deg,#0B63C7,#28B54D)">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-xl font-black text-white">Configurar Horario</h3>
            <p class="text-sm font-bold text-white/80">Personaliza la rutina del día</p>
          </div>
          <button onclick="UI.Modal.close('scheduleConfigModal')" class="p-2 rounded-xl bg-white/20 text-white">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      </div>
      <div class="p-4 space-y-2">
        ${schedule.map(ev => `
          <div class="flex items-center gap-3 p-3 rounded-xl border border-slate-100 bg-white hover:border-blue-200 transition-all cursor-pointer"
            onclick="App.openEventConfig('${ev.id}')">
            <span class="text-xl">${ev.emoji}</span>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-black text-slate-800 truncate">${safeEscapeHTML(ev.label)}</div>
              <div class="text-[10px] font-bold text-slate-400">${_fmtTimeShort(ev.startTime)} · ${ev.duration}min · ${ev.days.map(d => dayNames[d]).join(', ')}</div>
            </div>
            <div class="flex items-center gap-2">
              <span class="w-3 h-3 rounded-full" style="background:${ev.color}"></span>
              <span class="text-[10px] font-bold ${ev.active ? 'text-green-600' : 'text-slate-300'}">${ev.active ? 'Activo' : 'Inactivo'}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-slate-300"><path d="M9 18l6-6-6-6"/></svg>
            </div>
          </div>
        `).join('')}
      </div>
      <div class="p-4 border-t border-slate-100">
        <button onclick="App.resetScheduleConfig()" class="w-full py-3 rounded-xl border-2 border-red-200 font-black text-xs uppercase text-red-500">
          Restaurar Horario Predeterminado
        </button>
      </div>
    </div>
  `;
  UI.Modal.open('scheduleConfigModal', modalContent);
}

export function resetScheduleConfig() {
  _scheduleConfig = DEFAULT_SCHEDULE.map(e => ({ ...e }));
  _saveScheduleConfig();
  UI.Modal.close('scheduleConfigModal');
  safeToast('Horario restaurado', 'success');
  initRoutine();
}

// ── Quick Group Event Registration ───────────────────────────────────────────
export async function routineQuickGroup(eventId) {
  const classroom = AppState.get('classroom');
  const allStudents = AppState.get('students') || [];
  const today = _today();

  const attendance = await MaestraApi.getAttendance(classroom.id, today);
  const presentStudentIds = new Set(
    attendance.filter(a => ['present', 'late'].includes(a.status)).map(a => a.student_id)
  );
  const students = allStudents.filter(s => presentStudentIds.has(s.id));

  const EVENT_MAP = {
    breakfast:   { field: 'food', foodKey: 'breakfast', value: 'todo', label: 'Desayuno', icon: '🍞' },
    lunch:       { field: 'food', foodKey: 'lunch', value: 'todo', label: 'Almuerzo', icon: '🥗' },
    snack:       { field: 'food', foodKey: 'snack', value: 'todo', label: 'Merienda', icon: '🍎' },
    handwash:    { field: '_group', value: 'handwash', label: 'Lavado de manos', icon: '🧼' },
    toothbrush:  { field: '_group', value: 'toothbrush', label: 'Cepillado dental', icon: '🪥' },
    activity:    { field: '_group', value: 'activity', label: 'Actividad educativa', icon: '🏫' },
    playground:  { field: '_group', value: 'playground', label: 'Salida al patio', icon: '🌳' },
    sleep_start: { field: '_sleep', value: 'start', label: 'Iniciar siesta', icon: '😴' },
    sleep_end:   { field: '_sleep', value: 'end', label: 'Terminar siesta', icon: '😊' },
    bathroom:    { field: '_group', value: 'bath', label: 'Baño', icon: '🚽' },
    poop_gr:     { field: '_group', value: 'diaper', subtype: 'soiled', label: 'Popó', icon: '💩' },
    milk_gr:     { field: '_group', value: 'milk', label: 'Biberón', icon: '🍼' }
  };

  const ev = EVENT_MAP[eventId];
  if (!ev) return;

  try {
    for (const s of students) {
      if (_isDuplicate(s.id, eventId)) continue;

      const payload = {
        student_id: s.id,
        classroom_id: classroom.id,
        date: today,
        created_at: new Date().toISOString()
      };

      if (ev.field === 'food') {
        const existingLog = _logsMap[s.id];
        let currentFood = {};
        if (existingLog?.food) {
          try { currentFood = JSON.parse(existingLog.food); } catch { currentFood = {}; }
        }
        currentFood[ev.foodKey] = ev.value;
        payload.food = JSON.stringify(currentFood);
      } else if (ev.field === '_sleep') {
        payload.infant_event = {
          type: 'sleep',
          label: ev.value === 'end' ? 'Terminar siesta' : 'Iniciar siesta',
          start_time: new Date().toISOString(),
          end_time: ev.value === 'end' ? new Date().toISOString() : null
        };
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

// ── Student Routine Modal ────────────────────────────────────────────────────
export function openStudentRoutine(studentId) {
  const students = AppState.get('students') || [];
  const student = students.find(s => s.id === studentId);
  if (!student) return;

  const log = _logsMap[studentId];

  let currentFood = {};
  if (log?.food) {
    try { currentFood = JSON.parse(log.food); } catch { currentFood = {}; }
  }
  const mealLabels = { breakfast: '🍞 Desayuno', lunch: '🥗 Almuerzo', snack: '🍎 Merienda' };
  const foodOptions = [
    { val: 'todo', icon: '✅', label: 'Comió Todo' },
    { val: 'poco', icon: '⚠️', label: 'Comió Poco' },
    { val: 'nada', icon: '❌', label: 'No Quiso' },
    { val: 'ayuda', icon: '🆘', label: 'Necesitó Ayuda' }
  ];

  let currentBehavior = {};
  if (log?.infant_data) {
    const behaviorEvts = log.infant_data.filter(e => e.type === 'behavior');
    if (behaviorEvts.length > 0) currentBehavior = behaviorEvts[behaviorEvts.length - 1].data || {};
  }

  const events = log?.infant_data || [];
  const EVENT_ICONS = {
    sleep: '😴', milk: '🍼', diaper: (e) => e.subtype === 'wet' ? '💧' : '💩',
    bath: '🚽', temp: '🌡️', med: '💊', behavior: '🤝',
    handwash: '🧼', toothbrush: '🪥', activity: '🏫', playground: '🌳',
    health: (e) => e.subtype === 'vomit' ? '🤮' : '😷', incident: '🤕', note: '📝'
  };
  const EVENT_LABELS = {
    handwash: 'Lavado de manos', toothbrush: 'Cepillado dental', activity: 'Actividad educativa',
    playground: 'Salida al patio', sleep: 'Siesta', milk: 'Biberón', diaper: 'Cambio de pañal',
    bath: 'Baño', temp: 'Temperatura', med: 'Medicamento', note: 'Nota', behavior: 'Comportamiento'
  };

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
      <!-- Header -->
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

      <!-- Body -->
      <div class="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
        <!-- Estado Emocional -->
        <div>
          <h4 class="text-xs font-black text-slate-800 mb-2">😊 Estado Emocional</h4>
          <div class="grid grid-cols-7 gap-1.5">
            ${[
              { emoji: '😊', val: 'feliz', lbl: 'Feliz' },
              { emoji: '😁', val: 'muy_feliz', lbl: 'Muy Feliz' },
              { emoji: '😐', val: 'normal', lbl: 'Tranquilo' },
              { emoji: '😢', val: 'triste', lbl: 'Triste' },
              { emoji: '😡', val: 'enojado', lbl: 'Molesto' },
              { emoji: '😴', val: 'cansado', lbl: 'Cansado' },
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
              { val: 'si', label: 'Dormido', icon: '💤' },
              { val: 'no', label: 'No durmió', icon: '☀️' },
              { val: 'poco', label: 'Se despertó', icon: '⏰' },
              { val: 'excelente', label: 'Excelente', icon: '⭐' }
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
              { val: 'shared', icon: '🤝', label: 'Compartió' },
              { val: 'alone', icon: '🧍', label: 'Jugó solo' },
              { val: 'group', icon: '👥', label: 'Grupo' },
              { val: 'emotional_support', icon: '💛', label: 'Apoyo emocional' }
            ].map(b => `
              <button onclick="App.setStudentBehavior('${studentId}','social','${b.val}')"
                class="p-2 rounded-xl border-2 ${currentBehavior.social === b.val ? 'border-blue-400 bg-blue-50' : 'border-slate-100 bg-white'} flex items-center gap-2 text-left">
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
              { val: 'attention', icon: '👂', label: 'Atención' },
              { val: 'participation', icon: '🙋', label: 'Participó' },
              { val: 'curiosity', icon: '🔍', label: 'Curiosidad' },
              { val: 'completed', icon: '✅', label: 'Terminó' },
              { val: 'needed_help', icon: '🙋‍♀️', label: 'Necesitó ayuda' }
            ].map(b => `
              <button onclick="App.setStudentBehavior('${studentId}','classroom','${b.val}')"
                class="p-2 rounded-xl border-2 ${currentBehavior.classroom === b.val ? 'border-blue-400 bg-blue-50' : 'border-slate-100 bg-white'} flex items-center gap-2 text-left">
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
              { val: 'controlled', icon: '😌', label: 'Controló' },
              { val: 'frustrated', icon: '😤', label: 'Se frustró' },
              { val: 'crying', icon: '😭', label: 'Lloró' },
              { val: 'anxious', icon: '😰', label: 'Ansiedad' },
              { val: 'calmed', icon: '🧘', label: 'Se calmó' }
            ].map(b => `
              <button onclick="App.setStudentBehavior('${studentId}','emotional','${b.val}')"
                class="p-2 rounded-xl border-2 ${currentBehavior.emotional === b.val ? 'border-blue-400 bg-blue-50' : 'border-slate-100 bg-white'} flex items-center gap-2 text-left">
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
              { val: 'manipulation', icon: '🤲', label: 'Manipulación' },
              { val: 'fine_motor', icon: '✋', label: 'Fina' },
              { val: 'gross_motor', icon: '🏃', label: 'Gruesa' },
              { val: 'language', icon: '💬', label: 'Lenguaje' },
              { val: 'concentration', icon: '🎯', label: 'Concentración' },
              { val: 'autonomy', icon: '💪', label: 'Autonomía' }
            ].map(b => `
              <button onclick="App.setStudentBehavior('${studentId}','montessori','${b.val}')"
                class="p-2 rounded-xl border-2 ${currentBehavior.montessori === b.val ? 'border-blue-400 bg-blue-50' : 'border-slate-100 bg-white'} flex flex-col items-center gap-0.5">
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
            class="mt-2 w-full p-2.5 rounded-xl text-white font-black text-[10px] uppercase" style="background:#28B54D">
            Guardar Nota
          </button>
        </div>

        <!-- Timeline Individual -->
        <div>
          <h4 class="text-xs font-black text-slate-800 mb-2">🕐 Línea de tiempo del día</h4>
          <div class="space-y-1 max-h-48 overflow-y-auto">
            ${timelineHtml}
          </div>
        </div>
      </div>
    </div>
  `;

  UI.Modal.open('studentRoutineModal', modalContent);
}

// ── Helper Functions ─────────────────────────────────────────────────────────
export async function setStudentMood(studentId, mood) {
  const classroom = AppState.get('classroom');
  const today = _today();
  try {
    await MaestraApi.upsertDailyLog({
      student_id: studentId, classroom_id: classroom.id, date: today, mood
    });
    safeToast('Estado emocional guardado', 'success');
    await initRoutine();
  } catch {
    safeToast('Error al guardar', 'error');
  }
}

export async function setStudentFood(studentId, food, mealKey) {
  const classroom = AppState.get('classroom');
  const today = _today();
  try {
    const existingLog = _logsMap[studentId];
    let currentFood = {};
    if (existingLog?.food) {
      try { currentFood = JSON.parse(existingLog.food); } catch { currentFood = {}; }
    }
    if (mealKey) {
      currentFood[mealKey] = food;
    } else {
      const hour = new Date().getHours();
      if (hour < 10) currentFood.breakfast = food;
      else if (hour < 14) currentFood.lunch = food;
      else currentFood.snack = food;
    }
    await MaestraApi.upsertDailyLog({
      student_id: studentId, classroom_id: classroom.id, date: today,
      food: JSON.stringify(currentFood)
    });
    safeToast('Alimentación guardada', 'success');
    await initRoutine();
  } catch {
    safeToast('Error al guardar', 'error');
  }
}

export async function setStudentNap(studentId, nap) {
  const classroom = AppState.get('classroom');
  const today = _today();
  try {
    await MaestraApi.upsertDailyLog({
      student_id: studentId, classroom_id: classroom.id, date: today, nap
    });
    safeToast('Siesta guardada', 'success');
    await initRoutine();
  } catch {
    safeToast('Error al guardar', 'error');
  }
}

export async function setStudentBehavior(studentId, category, value) {
  const classroom = AppState.get('classroom');
  const today = _today();
  try {
    await MaestraApi.upsertDailyLog({
      student_id: studentId, classroom_id: classroom.id, date: today,
      infant_event: {
        type: 'behavior', label: `Comportamiento: ${category}`,
        category, data: { [category]: value }
      }
    });
    safeToast('Comportamiento registrado', 'success');
    await initRoutine();
  } catch {
    safeToast('Error al guardar', 'error');
  }
}

export async function addStudentEvent(studentId, eventId) {
  const classroom = AppState.get('classroom');
  const today = _today();
  const ev = INDIV_EVENTS.find(e => e.id === eventId);
  if (!ev) return;

  if (_isDuplicate(studentId, eventId)) {
    safeToast('Evento registrado hace poco', 'warning');
    return;
  }

  try {
    if (ev.type === 'milk') {
      await MaestraApi.upsertDailyLog({
        student_id: studentId, classroom_id: classroom.id, date: today,
        infant_event: { type: 'milk', label: ev.label, oz: null }
      });
    } else if (ev.type === 'temp') {
      const temp = prompt('Temperatura (°C):');
      if (temp === null) return;
      await MaestraApi.upsertDailyLog({
        student_id: studentId, classroom_id: classroom.id, date: today,
        infant_event: { type: 'temp', label: ev.label, value: parseFloat(temp) || null }
      });
    } else if (ev.type === 'med') {
      const name = prompt('Nombre del medicamento:');
      if (name === null) return;
      await MaestraApi.upsertDailyLog({
        student_id: studentId, classroom_id: classroom.id, date: today,
        infant_event: { type: 'med', label: ev.label, name, dose: null }
      });
    } else {
      await MaestraApi.upsertDailyLog({
        student_id: studentId, classroom_id: classroom.id, date: today,
        infant_event: { type: ev.type, subtype: ev.subtype, label: ev.label }
      });
    }
    safeToast(`${ev.label} registrado`, 'success');
    await initRoutine();
  } catch {
    safeToast('Error al guardar', 'error');
  }
}

export async function saveStudentNote(studentId) {
  const classroom = AppState.get('classroom');
  const today = _today();
  const noteEl = document.getElementById(`studentNote-${studentId}`);
  const notes = noteEl?.value || '';
  try {
    await MaestraApi.upsertDailyLog({
      student_id: studentId, classroom_id: classroom.id, date: today, notes
    });
    safeToast('Nota guardada', 'success');
    await initRoutine();
    UI.Modal.close('studentRoutineModal');
  } catch {
    safeToast('Error al guardar', 'error');
  }
}

export async function routineWakeAll() {
  const classroom = AppState.get('classroom');
  const today = _today();
  const studentsToWake = Object.keys(_sleepMap);
  if (studentsToWake.length === 0) return;

  try {
    for (const studentId of studentsToWake) {
      await MaestraApi.upsertDailyLog({
        student_id: studentId,
        classroom_id: classroom.id,
        date: today,
        infant_event: { type: 'sleep', end_time: new Date().toISOString() }
      });
    }
    safeToast('Todas las siestas terminadas!', 'success');
    await initRoutine();
  } catch {
    safeToast('Error al actualizar siestas', 'error');
  }
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

  const modalContent = `
    <div class="bg-white overflow-hidden" style="border-radius:32px">
      <div class="p-5" style="background:linear-gradient(135deg,#28B54D,#239943)">
        <h3 class="text-lg font-black text-white">Resumen de Reportes</h3>
        <p class="text-sm font-bold text-white/80">Revisa antes de publicar</p>
      </div>
      <div class="p-5 space-y-3">
        <div class="grid grid-cols-3 gap-3">
          <div class="p-3 rounded-2xl text-center bg-green-50">
            <div class="text-2xl font-black text-green-600">${students.filter(s => _calcProgress(_logsMap[s.id]) >= 80).length}</div>
            <div class="text-[10px] font-bold text-green-700">Completos</div>
          </div>
          <div class="p-3 rounded-2xl text-center bg-orange-50">
            <div class="text-2xl font-black text-orange-600">${missingBreakfast + missingLunch + missingSnack}</div>
            <div class="text-[10px] font-bold text-orange-700">Pendientes</div>
          </div>
          <div class="p-3 rounded-2xl text-center bg-purple-50">
            <div class="text-2xl font-black text-purple-600">${Object.keys(_sleepMap).length}</div>
            <div class="text-[10px] font-bold text-purple-700">Durmiendo</div>
          </div>
        </div>
        <div class="flex gap-3">
          <button onclick="UI.Modal.close('bulkRoutineModal')" class="flex-1 py-3 rounded-xl border-2 border-slate-200 font-black text-xs uppercase text-slate-600">Cerrar</button>
          <button onclick="App.publishDailyLogs()" class="flex-1 py-3 rounded-xl font-black text-xs uppercase text-white" style="background:#28B54D">Publicar Reportes</button>
        </div>
      </div>
    </div>
  `;
  UI.Modal.open('bulkRoutineModal', modalContent);
}

export async function publishDailyLogs() {
  const students = AppState.get('students') || [];
  const logIds = students.filter(s => _logsMap[s.id]).map(s => _logsMap[s.id].id);
  if (logIds.length === 0) {
    safeToast('No hay reportes para publicar', 'warning');
    return;
  }
  try {
    await MaestraApi.publishDailyLogs(logIds);
    safeToast('Reportes publicados!', 'success');
    UI.Modal.close('bulkRoutineModal');
  } catch {
    safeToast('Error al publicar', 'error');
  }
}
