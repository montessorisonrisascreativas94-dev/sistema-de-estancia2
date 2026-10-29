/**
 * Horario Semanal — Panel de la maestra.
 * Matriz Lun-Vie por bloques, progreso colectivo y ejecución de bloques.
 */
import { AppState } from '../state.js';
import { MaestraApi } from '../api.js';
import { RoutineCatalog } from '../../shared/routine-catalog.js';
import { UI, safeToast, safeEscapeHTML } from './ui.js';
import {
  WEEK_DAYS,
  WEEKLY_CSS,
  blockProgress,
  blockStatus,
  formatRange,
  formatTime,
  groupRows,
  isBlockDoneForLog,
  isoDate,
  minutesToTime,
  normalizeBlocks,
  nowMinutes,
  todayNumber,
  weekDates,
} from '../../shared/weekly-schedule-core.js';

let _blocks = [];
let _byId = new Map();
let _loadKey = '';
let _loadedAt = 0;
let _lastStudents = [];
let _lastLogs = {};

const CACHE_MS = 5 * 60 * 1000;

/** Tipo de evento real para bloques de higiene (pañal/baño), no `activity`. */
function eventMetaForLabel(label) {
  const s = String(label || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (/cambio\s*(de\s*)?panal|panal/.test(s)) return { type: 'diaper_change' };
  if (/\bpopo\b/.test(s)) return { type: 'diaper', subtype: 'soiled' };
  if (/\bpipi\b/.test(s)) return { type: 'diaper', subtype: 'wet' };
  if (/\bbano\b/.test(s)) return { type: 'bath' };
  return { type: 'activity' };
}

/** Etiqueta visible cuando el cambio de pañal se asocia a pipí o popó. */
function _diaperLabelWithSubtype(label, subtype) {
  if (!subtype) return label;
  return `${label} · ${subtype === 'wet' ? 'Pipí' : 'Popó'}`;
}

/** Selector visual Pipí / Popó para la confirmación de hora del bloque. */
function _diaperPickerHTML(inputName) {
  const option = (value, emoji, text) => `
    <label style="display:flex;align-items:center;justify-content:center;gap:8px;padding:11px;border:2px solid #E2E8F0;border-radius:12px;background:#fff;cursor:pointer">
      <input type="radio" name="${inputName}" value="${value}" style="width:16px;height:16px;accent-color:#475569"
        onchange="this.closest('[data-diaper-picker]').querySelectorAll('label').forEach(function(l){l.style.borderColor='#E2E8F0';l.style.background='#fff';});this.closest('label').style.borderColor='#475569';this.closest('label').style.background='#F1F5F9';">
      <span style="font-size:13px;font-weight:900;color:#334155">${emoji} ${text}</span>
    </label>`;
  return `
    <div data-diaper-picker>
      <div style="font-size:10px;font-weight:900;color:#94A3B8;text-transform:uppercase;letter-spacing:.08em">¿Fue por?</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
        ${option('wet', '💧', 'Pipí')}
        ${option('soiled', '💩', 'Popó')}
      </div>
    </div>`;
}

/** Lee la opción Pipí/Popó elegida en el modal. */
function _readDiaperSubtype(inputName) {
  return document.querySelector(`input[name="${inputName}"]:checked`)?.value || null;
}

export function getClassroomKey() {
  const classroom = AppState.get('classroom');
  return classroom?.id ? `${classroom.id}:${classroom.level || classroom.name || ''}` : '';
}

export async function loadBlocks(classroomId) {
  const key = String(classroomId || '');
  if (!key) return [];
  if (_loadKey === key && Date.now() - _loadedAt < CACHE_MS) return _blocks;
  const raw = await RoutineCatalog.getScheduleBlocks(classroomId);
  _blocks = normalizeBlocks(raw || []);
  _byId = new Map(_blocks.map(b => [b.id, b]));
  _loadKey = key;
  _loadedAt = Date.now();
  return _blocks;
}

export function invalidateBlocks() {
  _loadedAt = 0;
  _loadKey = '';
}

function _fallbackBlocks(fallback = []) {
  return normalizeBlocks((fallback || []).map((event, index) => ({
    id: `local_${event.id || index}`,
    days: (event.days || [1, 2, 3, 4, 5]).filter(d => d >= 1 && d <= 5),
    start_time: event.startTime || event.start_time || '08:00',
    duration_min: event.duration || event.duration_min || 30,
    label: event.label,
    emoji: event.emoji,
    color: event.color,
    sort_order: index,
  })));
}

function _renderCell(block, day, students, logsMap, nowMin) {
  const status = blockStatus(block, { day, now: nowMin });
  const progress = blockProgress(block, students, logsMap);
  const now = status === 'now';
  const done = progress.complete;
  const border = block.color;
  return `
    <button type="button" class="wk-block ${now ? 'now' : ''} ${done ? '✓' : ''}"
      style="--wk-color:${block.color};--wk-bg:${block.bg};--wk-border:${border}"
      onclick="App.showScheduleBlock('${safeEscapeHTML(block.id)}')"
      title="${safeEscapeHTML(block.label)} · ${formatRange(block.startTime, block.duration)}">
      ${now ? '<span class="wk-now-tag">Ahora</span>' : ''}
      <span class="wk-block-head">
        <span class="wk-block-emoji">${block.emoji}</span>
        <span class="wk-block-copy">
          <span class="wk-block-label">${safeEscapeHTML(block.label)}</span>
          <span class="wk-block-meta">
            <span>${formatTime(block.startTime)}</span>
            <span class="wk-check">${done ? '✓' : `${progress.done}/${progress.total}`}</span>
          </span>
          <span class="wk-bar"><i style="width:${progress.pct}%;background:${done ? '✓' : block.color}"></i></span>
        </span>
      </span>
    </button>
  `;
}

export function renderWeeklySchedule({ blocks = [], fallback = [], students = [], logsMap = {}, now = nowMinutes() } = {}) {
  const usable = blocks.length ? normalizeBlocks(blocks) : _fallbackBlocks(fallback);
  _byId = new Map(usable.map(b => [String(b.id), b]));
  _lastStudents = students;
  _lastLogs = logsMap;
  const today = todayNumber();
  const dates = weekDates();
  const rows = groupRows(usable);
  const doneBlocks = usable.filter(b => b.days.includes(today) && blockProgress(b, students, logsMap).complete).length;
  const todayBlocks = usable.filter(b => b.days.includes(today)).length;
  const shell = '';

  return `
    <div class="wk-shell" id="wkShell">
      <style>${WEEKLY_CSS}</style>
      ${shell}
      <div class="wk-toolbar">
        <div class="wk-title">
          <div class="wk-title-icon">📅</div>
          <div>
            <h4>Horario Semanal</h4>
            <p>${dates[0].date.toLocaleDateString('es-DO', { day: '2-digit', month: 'short' })} - ${dates[4].date.toLocaleDateString('es-DO', { day: '2-digit', month: 'short' })} · Hoy ${doneBlocks}/${todayBlocks} bloques completos</p>
          </div>
        </div>
        <div class="wk-toolbar-actions" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <button type="button" id="wkToggleBtn" class="wk-btn wk-btn-white" onclick="(function(){const el=document.getElementById('wkScrollWrap');const btn=document.getElementById('wkToggleBtn');if(!el||!btn)return;const expanded=el.dataset.expanded==='1';if(expanded){el.style.maxHeight='0px';el.style.overflow='hidden';el.dataset.expanded='0';btn.textContent='Abrir horario semanal';}else{el.style.maxHeight='80vh';el.style.overflow='auto';el.dataset.expanded='1';btn.textContent='Ocultar horario semanal';}}).call(this)">Abrir horario semanal</button>
          <div class="wk-legend">
            <span><i class="wk-dot" style="background:#FFD43B"></i> Ahora</span>
            <span><i class="wk-dot" style="background:#28B54D"></i> Completado</span>
            <span><i class="wk-dot" style="background:#CBD5E1"></i> Pendiente</span>
          </div>
        </div>
      </div>

      ${usable.length === 0 ? `
        <div class="wk-empty-state">
          <div class="wk-empty-icon">🗓️</div>
          <h5>Sin horario configurado</h5>
          <p>Configura los bloques del aula para ver la matriz semanal y ejecutar las actividades con un toque.</p>
          <button type="button" class="wk-btn wk-btn-primary" style="margin-top:12px" onclick="App.openScheduleConfig()">Configurar horario</button>
        </div>
      ` : `
        <div class="wk-scroll" id="wkScrollWrap" data-expanded="0" style="max-height:0;overflow:hidden;transition:max-height .35s ease">
          <table class="wk-table" role="grid" aria-label="Horario semanal del aula">
            <thead>
              <tr>
                <th class="wk-th-time" scope="col"><span>Hora</span></th>
                ${dates.map(d => `
                  <th class="wk-th-day ${d.n === today ? 'today' : ''}" scope="col" style="background:linear-gradient(135deg,${d.color},${d.color}CC)">
                    <b>${d.short}</b>
                    <small>${d.date.toLocaleDateString('es-DO', { day: '2-digit', month: 'short' })}</small>
                    ${d.n === today ? '<span class="wk-today-pill">Hoy</span>' : ''}
                  </th>
                `).join('')}
              </tr>
            </thead>
            <tbody>
              ${rows.map(row => `
                <tr>
                  <th class="wk-row-time" scope="row">
                    <b>${formatTime(row.startTime)}</b>
                    <small>${formatTime(row.endTime)}</small>
                  </th>
                  ${WEEK_DAYS.map(d => {
                    const cellBlocks = row.cells[d.n] || [];
                    if (!cellBlocks.length) {
                      return `<td class="wk-cell empty ${d.n === today ? 'today' : ''}">–</td>`;
                    }
                    return `<td class="wk-cell ${d.n === today ? 'today' : ''}">
                      ${cellBlocks.map(block => _renderCell(block, d.n, students, logsMap, now)).join('')}
                    </td>`;
                  }).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
      <p class="wk-detail-note" style="padding:2px 4px">Toca un bloque de hoy para registrarlo con todo el grupo. Los demás días muestran el detalle y el progreso.</p>
    </div>
  `;
}

export function showBlock(blockId) {
  const block = _byId.get(String(blockId));
  if (!block) return;
  const students = _lastStudents.length ? _lastStudents : (AppState.get('students') || []);
  const logsMap = _lastLogs;
  const progress = blockProgress(block, students, logsMap);
  const isToday = block.days.includes(todayNumber());
  const status = blockStatus(block, { day: todayNumber() });
  const doneNames = students.filter(s => isBlockDoneForLog(block, logsMap[s.id])).map(s => s.name).filter(Boolean);

  UI.Modal.open('weeklyBlockModal', `
    <div class="wk-detail" style="margin:0;--wk-bg:${block.bg};--wk-border:${block.color}">
      <div class="wk-detail-head">
        <div class="wk-detail-emoji">${block.emoji}</div>
        <div>
          <h5>${safeEscapeHTML(block.label)}</h5>
          <p>${formatRange(block.startTime, block.duration)} · ${block.days.map(d => (WEEK_DAYS.find(x => x.n === d)?.short || '')).filter(Boolean).join(', ')}</p>
        </div>
        <button type="button" class="wk-detail-close" onclick="UI.Modal.close('weeklyBlockModal')">×</button>
      </div>
      <div class="wk-detail-list">
        <div class="wk-detail-row">
          <time>${status === 'now' ? 'AHORA' : isToday ? 'HOY' : ''}</time>
          <span>${progress.done} de ${progress.total} estudiantes · ${progress.pct}% completado</span>
        </div>
        ${doneNames.slice(0, 8).map(name => `<div class="wk-detail-row"><time>✓</time><span>${safeEscapeHTML(name)}</span></div>`).join('')}
        ${doneNames.length > 8 ? `<div class="wk-detail-row"><time>+</time><span>${doneNames.length - 8} estudiante(s) más</span></div>` : ''}
      </div>
      <p class="wk-detail-note">${isToday
        ? 'Puedes ejecutar este bloque para todos los estudiantes presentes.'
        : 'Este bloque no corresponde al día de hoy. Su registro se habilita el día indicado.'}</p>
      <div class="wk-detail-actions">
        ${isToday ? `<button type="button" class="wk-btn wk-btn-white" onclick="UI.Modal.close('weeklyBlockModal');App.markScheduleBlock('${safeEscapeHTML(block.id)}')">Registrar para el grupo</button>` : ''}
        <button type="button" class="wk-btn wk-btn-white" onclick="UI.Modal.close('weeklyBlockModal')">Cerrar</button>
      </div>
    </div>
  `);
}

function _isRepeatableBlock(block) {
  const text = String(block?.label || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return /panal|bano|biber|leche|agua|medic|temperatura|lavado de manos|cepillado|popo|pipi|higiene/i.test(text);
}

function _promptTime(block) {
  return new Promise(resolve => {
    const id = 'weeklyBlockTimeModal';
    const now = new Date();
    const askDiaper = eventMetaForLabel(block.label).type === 'diaper_change';
    const defaultTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    UI.Modal.open(id, `
      <div style="background:#fff;border-radius:26px;overflow:hidden;max-width:340px;margin:0 auto">
        <div style="padding:16px;background:linear-gradient(135deg,${block.color},${block.color}CC);color:#fff;display:flex;align-items:center;gap:10px">
          <span style="font-size:26px">${block.emoji}</span>
          <div>
            <div style="font-size:14px;font-weight:900">${safeEscapeHTML(block.label)}</div>
            <div style="font-size:11px;font-weight:700;opacity:.85">¿A qué hora se realizó?</div>
          </div>
        </div>
        <div style="padding:16px;display:flex;flex-direction:column;gap:11px">
          <p style="margin:0;font-size:11px;font-weight:600;color:#64748B">Ajusta la hora si registras el bloque más tarde.</p>
          ${askDiaper ? _diaperPickerHTML('weeklyBlockDiaperSubtype') : ''}
          <input type="time" id="weeklyBlockTimeInput" value="${defaultTime}" style="width:100%;padding:11px;border:2px solid #E2E8F0;border-radius:12px;font-size:14px;font-weight:800;color:#334155;outline:none">
          <div style="display:flex;gap:8px">
            <button type="button" id="weeklyBlockTimeCancel" style="flex:1;padding:11px;border:0;border-radius:12px;background:#F1F5F9;color:#64748B;font-size:11px;font-weight:900;text-transform:uppercase;cursor:pointer">Cancelar</button>
            <button type="button" id="weeklyBlockTimeOk" style="flex:2;padding:11px;border:0;border-radius:12px;background:${block.color};color:#fff;font-size:11px;font-weight:900;text-transform:uppercase;cursor:pointer">Confirmar</button>
          </div>
        </div>
      </div>
    `);
    const overlay = document.getElementById(id);
    overlay?.addEventListener('click', e => { if (e.target === overlay) resolve(null); });
    setTimeout(() => {
      document.getElementById('weeklyBlockTimeOk')?.addEventListener('click', () => {
        const value = document.getElementById('weeklyBlockTimeInput')?.value || defaultTime;
        const subtype = askDiaper ? _readDiaperSubtype('weeklyBlockDiaperSubtype') : null;
        if (askDiaper && !subtype) { safeToast('Selecciona si fue por Pipí o Popó', 'warning'); return; }
        UI.Modal.close(id);
        resolve({ time: value, subtype });
      });
      document.getElementById('weeklyBlockTimeCancel')?.addEventListener('click', () => {
        UI.Modal.close(id);
        resolve(null);
      });
    }, 40);
  });
}

export async function markBlock(blockId) {
  const block = _byId.get(String(blockId));
  if (!block) return;
  if (!block.days.includes(todayNumber())) {
    safeToast('Este bloque es de otro día de la semana', 'warning');
    return;
  }

  const profile = AppState.get('profile') || {};
  if (profile.role && profile.role !== 'maestra') {
    safeToast('Solo la maestra puede ejecutar bloques del horario', 'warning');
    return;
  }

  const classroom = AppState.get('classroom');
  if (!classroom?.id) { safeToast('Aula no disponible', 'warning'); return; }

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  if (nowMin < 5 * 60 || nowMin >= 22 * 60) {
    safeToast('Solo se pueden registrar bloques de 05:00 a 22:00', 'warning');
    return;
  }

  const today = isoDate();
  const attendance = await MaestraApi.getAttendance(classroom.id, today);
  if (!attendance || attendance.length === 0) {
    safeToast('Primero pasa asistencia del día', 'warning');
    return;
  }
  const presentIds = new Set(attendance.filter(a => ['present', 'late'].includes(a.status)).map(a => a.student_id));
  const students = (AppState.get('students') || []).filter(s => presentIds.has(s.id));
  if (students.length === 0) {
    safeToast('No hay estudiantes presentes para registrar', 'warning');
    return;
  }

  const logs = await MaestraApi.getDailyRoutine(classroom.id, today);
  const logsMap = {};
  (logs || []).forEach(log => { logsMap[log.student_id] = log; });
  const progress = blockProgress(block, students, logsMap);
  if (progress.complete) {
    safeToast(`${block.emoji} ${block.label} ya está registrado para todo el grupo`, 'info');
    return;
  }

  if (students.length > 5 && !confirm(`¿Registrar "${block.label}" para ${students.length} estudiantes presentes?`)) {
    return;
  }

  const timeRes = await _promptTime(block);
  if (!timeRes) return;
  const { time: eventTime, subtype: pickedSubtype } = timeRes;

  const repeatable = _isRepeatableBlock(block);
  const occurrenceId = crypto.randomUUID?.() || Math.random().toString(36).slice(2, 12);
  let marked = 0;

  try {
    for (const student of students) {
      if (!repeatable && isBlockDoneForLog(block, logsMap[student.id])) continue;
      const meta = eventMetaForLabel(block.label);
      const eventSubtype = meta.type === 'diaper_change' ? pickedSubtype : meta.subtype;
      const eventLabel = meta.type === 'diaper_change'
        ? _diaperLabelWithSubtype(block.label, eventSubtype)
        : block.label;
      const event = {
        type: meta.type,
        ...(eventSubtype ? { subtype: eventSubtype } : {}),
        label: eventLabel,
        emoji: block.emoji,
        category: 'Horario',
        occurrence_id: occurrenceId,
        origin: 'horario',
        block_start: block.startTime,
        event_time: eventTime,
      };
      if (!String(block.id).startsWith('local_')) event.schedule_block_id = block.id;
      await MaestraApi.upsertDailyLog({
        student_id: student.id,
        classroom_id: classroom.id,
        date: today,
        created_at: new Date().toISOString(),
        infant_event: event,
      });
      marked++;
    }

    safeToast(marked > 0
      ? `${block.emoji} ${block.label} registrado para ${marked} estudiante(s)`
      : `${block.label} ya estaba registrado para todos`, marked > 0 ? 'success' : 'warning');

    invalidateBlocks();
    if (window.App?.initRoutine) await window.App.initRoutine();
  } catch (err) {
    safeToast('No se pudo registrar el bloque del horario', 'error');
  }
}

