/**
 * Horario Semanal â€“ Panel de la maestra.
 * Matriz Lun-Vie por bloques, progreso colectivo y ejecuciÃ³n de bloques.
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
    <button type="button" class="wk-block ${now ? 'now' : ''} ${done ? 'is-done' : ''}"
      style="--wk-color:${block.color};--wk-bg:${block.bg};--wk-border:${border}"
      onclick="App.showScheduleBlock('${safeEscapeHTML(block.id)}')"
      title="${safeEscapeHTML(block.label)} Â· ${formatRange(block.startTime, block.duration)}">
      ${now ? '<span class="wk-now-tag">Ahora</span>' : ''}
      <span class="wk-block-head">
        <span class="wk-block-emoji">${block.emoji}</span>
        <span class="wk-block-copy">
          <span class="wk-block-label">${safeEscapeHTML(block.label)}</span>
          <span class="wk-block-meta">
            <span>${formatTime(block.startTime)}</span>
            <span class="wk-check">${done ? 'âœ“' : `${progress.done}/${progress.total}`}</span>
          </span>
          <span class="wk-bar"><i style="width:${progress.pct}%;background:${done ? '#28B54D' : block.color}"></i></span>
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
    <div class="wk-shell">
      <style>${WEEKLY_CSS}</style>
      ${shell}
      <div class="wk-toolbar">
        <div class="wk-title">
          <div class="wk-title-icon">📅</div>
          <div>
            <h4>Horario Semanal</h4>
            <p>${dates[0].date.toLocaleDateString('es-DO', { day: '2-digit', month: 'short' })} â€“ ${dates[4].date.toLocaleDateString('es-DO', { day: '2-digit', month: 'short' })} Â· Hoy ${doneBlocks}/${todayBlocks} bloques completos</p>
          </div>
        </div>
        <div class="wk-legend">
          <span><i class="wk-dot" style="background:#FFD43B"></i> Ahora</span>
          <span><i class="wk-dot" style="background:#28B54D"></i> Completado</span>
          <span><i class="wk-dot" style="background:#CBD5E1"></i> Pendiente</span>
        </div>
      </div>

      ${usable.length === 0 ? `
        <div class="wk-empty-state">
          <div class="wk-empty-icon">ðŸ—“ï¸</div>
          <h5>Sin horario configurado</h5>
          <p>Configura los bloques del aula para ver la matriz semanal y ejecutar las actividades con un toque.</p>
          <button type="button" class="wk-btn wk-btn-primary" style="margin-top:12px" onclick="App.openScheduleConfig()">Configurar horario</button>
        </div>
      ` : `
        <div class="wk-scroll">
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
                      return `<td class="wk-cell empty ${d.n === today ? 'today' : ''}">â€”</td>`;
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
      <p class="wk-detail-note" style="padding:2px 4px">Toca un bloque de hoy para registrarlo con todo el grupo. Los demÃ¡s dÃ­as muestran el detalle y el progreso.</p>
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
          <p>${formatRange(block.startTime, block.duration)} Â· ${block.days.map(d => (WEEK_DAYS.find(x => x.n === d)?.short || '')).filter(Boolean).join(', ')}</p>
        </div>
        <button type="button" class="wk-detail-close" onclick="UI.Modal.close('weeklyBlockModal')">Ã—</button>
      </div>
      <div class="wk-detail-list">
        <div class="wk-detail-row">
          <time>${status === 'now' ? 'AHORA' : isToday ? 'HOY' : ''}</time>
          <span>${progress.done} de ${progress.total} estudiantes Â· ${progress.pct}% completado</span>
        </div>
        ${doneNames.slice(0, 8).map(name => `<div class="wk-detail-row"><time>âœ“</time><span>${safeEscapeHTML(name)}</span></div>`).join('')}
        ${doneNames.length > 8 ? `<div class="wk-detail-row"><time>+</time><span>${doneNames.length - 8} estudiante(s) mÃ¡s</span></div>` : ''}
      </div>
      <p class="wk-detail-note">${isToday
        ? 'Puedes ejecutar este bloque para todos los estudiantes presentes.'
        : 'Este bloque no corresponde al dÃ­a de hoy. Su registro se habilita el dÃ­a indicado.'}</p>
      <div class="wk-detail-actions">
        ${isToday ? `<button type="button" class="wk-btn wk-btn-primary" onclick="UI.Modal.close('weeklyBlockModal');App.markScheduleBlock('${safeEscapeHTML(block.id)}')">Registrar para el grupo</button>` : ''}
        <button type="button" class="wk-btn wk-btn-ghost" onclick="UI.Modal.close('weeklyBlockModal')">Cerrar</button>
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
    const defaultTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    UI.Modal.open(id, `
      <div style="background:#fff;border-radius:26px;overflow:hidden;max-width:340px;margin:0 auto">
        <div style="padding:16px;background:linear-gradient(135deg,${block.color},${block.color}CC);color:#fff;display:flex;align-items:center;gap:10px">
          <span style="font-size:26px">${block.emoji}</span>
          <div>
            <div style="font-size:14px;font-weight:900">${safeEscapeHTML(block.label)}</div>
            <div style="font-size:11px;font-weight:700;opacity:.85">Â¿A quÃ© hora se realizÃ³?</div>
          </div>
        </div>
        <div style="padding:16px;display:flex;flex-direction:column;gap:11px">
          <p style="margin:0;font-size:11px;font-weight:600;color:#64748B">Ajusta la hora si registras el bloque mÃ¡s tarde.</p>
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
        UI.Modal.close(id);
        resolve(value);
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
    safeToast('Este bloque es de otro dÃ­a de la semana', 'warning');
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
    safeToast('Primero pasa asistencia del dÃ­a', 'warning');
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
    safeToast(`${block.emoji} ${block.label} ya estÃ¡ registrado para todo el grupo`, 'info');
    return;
  }

  if (students.length > 5 && !confirm(`Â¿Registrar "${block.label}" para ${students.length} estudiantes presentes?`)) {
    return;
  }

  const eventTime = await _promptTime(block);
  if (eventTime === null) return;

  const repeatable = _isRepeatableBlock(block);
  const occurrenceId = crypto.randomUUID?.() || Math.random().toString(36).slice(2, 12);
  let marked = 0;

  try {
    for (const student of students) {
      if (!repeatable && isBlockDoneForLog(block, logsMap[student.id])) continue;
      const event = {
        type: 'activity',
        label: block.label,
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

