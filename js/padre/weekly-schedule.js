/**
 * Horario Semanal – Panel de Padres
 * Vista matricial Lun–Vie solo lectura con estado de ejecución por bloque (hoy)
 */
import { supabase } from '../shared/supabase.js';
import { AppState } from './appState.js';
import { RoutineCatalog } from '../shared/routine-catalog.js';
import { UI } from '../maestra/modules/ui.js';
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
  normalizeBlocks,
  nowMinutes,
  todayNumber,
  weekDates,
} from '../shared/weekly-schedule-core.js';

let _blocks = [];
let _byId = new Map();
let _loadKey = '';
let _loadedAt = 0;
let _lastStudent = null;
let _lastLogsMap = {};

const CACHE_MS = 5 * 60 * 1000;

function _escape(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export async function loadBlocks(classroomId) {
  const key = String(classroomId || '');
  if (!key) return [];
  if (_loadKey === key && Date.now() - _loadedAt < CACHE_MS) return _blocks;
  const raw = await RoutineCatalog.getScheduleBlocks(classroomId);
  _blocks = normalizeBlocks(raw || []);
  _byId = new Map(_blocks.map(b => [String(b.id), b]));
  _loadKey = key;
  _loadedAt = Date.now();
  return _blocks;
}

export function invalidate() {
  _loadedAt = 0;
  _loadKey = '';
}

function _renderCell(block, day, student, logsMap, nowMin) {
  const status = blockStatus(block, { day, now: nowMin });
  const done = isBlockDoneForLog(block, logsMap[student?.id]);
  const now = status === 'now';
  const border = block.color;
  return `
    <button type="button" class="wk-block ${now ? 'now' : ''} ${done ? 'is-done' : ''}"
      style="--wk-color:${block.color};--wk-bg:${block.bg};--wk-border:${border}"
      onclick="ParentWeeklySchedule.show('${_escape(block.id)}')"
      title="${_escape(block.label)} · ${formatRange(block.startTime, block.duration)}">
      ${now ? '<span class="wk-now-tag">Ahora</span>' : ''}
      <span class="wk-block-head">
        <span class="wk-block-emoji">${block.emoji}</span>
        <span class="wk-block-copy">
          <span class="wk-block-label">${_escape(block.label)}</span>
          <span class="wk-block-meta">
            <span>${formatTime(block.startTime)}</span>
            <span class="wk-check">${done ? '✓' : 'Pendiente'}</span>
          </span>
        </span>
      </span>
    </button>
  `;
}

export function renderWeekly({ blocks = [], student = null, logsMap = {}, now = nowMinutes() } = {}) {
  _blocks = normalizeBlocks(blocks);
  _byId = new Map(_blocks.map(b => [String(b.id), b]));
  _lastStudent = student;
  _lastLogsMap = logsMap || {};

  if (!_blocks.length) {
    return `
      <div class="wk-shell">
        <style>${WEEKLY_CSS}</style>
        <div class="wk-empty-state">
          <div class="wk-empty-icon">📅</div>
          <h5>Sin horario semanal configurado</h5>
          <p>Cuando la maestra configure el horario del aula, lo verás aquí reflejado en tiempo real.</p>
        </div>
      </div>
    `;
  }

  const today = todayNumber();
  const dates = weekDates();
  const rows = groupRows(_blocks);
  const studentId = student?.id;
  const doneToday = _blocks.filter(b => b.days.includes(today) && isBlockDoneForLog(b, logsMap[studentId])).length;
  const totalToday = _blocks.filter(b => b.days.includes(today)).length;

  return `
    <div class="wk-shell">
      <style>${WEEKLY_CSS}</style>
      <div class="wk-toolbar">
        <div class="wk-title">
          <div class="wk-title-icon">📅</div>
          <div>
            <h4>Horario Semanal</h4>
            <p>${dates[0].date.toLocaleDateString('es-DO', { day: '2-digit', month: 'short' })} – ${dates[4].date.toLocaleDateString('es-DO', { day: '2-digit', month: 'short' })} · Hoy ${doneToday}/${totalToday} bloques realizados</p>
          </div>
        </div>
        <div class="wk-legend">
          <span><i class="wk-dot" style="background:#FFD43B"></i> Ahora</span>
          <span><i class="wk-dot" style="background:#28B54D"></i> Realizado</span>
          <span><i class="wk-dot" style="background:#CBD5E1"></i> Pendiente</span>
        </div>
      </div>
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
                    return `<td class="wk-cell empty ${d.n === today ? 'today' : ''}">—</td>`;
                  }
                  return `<td class="wk-cell ${d.n === today ? 'today' : ''}">
                    ${cellBlocks.map(block => _renderCell(block, d.n, student, logsMap, now)).join('')}
                  </td>`;
                }).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <p class="wk-detail-note" style="padding:2px 4px">Toca un bloque para ver si ya fue registrado por la maestra hoy.</p>
    </div>
  `;
}

export function show(blockId) {
  const block = _byId.get(String(blockId));
  if (!block) return;
  const student = _lastStudent || AppState.get('currentStudent');
  const logsMap = _lastLogsMap || {};
  const done = isBlockDoneForLog(block, logsMap[student?.id]);
  const today = todayNumber();
  const isToday = block.days.includes(today);
  const status = blockStatus(block, { day: today });

  UI.Modal.open('parentWeeklyBlockModal', `
    <div class="wk-detail" style="margin:0;--wk-bg:${block.bg};--wk-border:${block.color}">
      <div class="wk-detail-head">
        <div class="wk-detail-emoji">${block.emoji}</div>
        <div>
          <h5>${_escape(block.label)}</h5>
          <p>${formatRange(block.startTime, block.duration)} · ${block.days.map(d => (WEEK_DAYS.find(x => x.n === d)?.short || '')).filter(Boolean).join(', ')}</p>
        </div>
        <button type="button" class="wk-detail-close" onclick="UI.Modal.close('parentWeeklyBlockModal')">×</button>
      </div>
      <div class="wk-detail-list">
        <div class="wk-detail-row">
          <time>${status === 'now' ? 'AHORA' : isToday ? 'HOY' : ''}</time>
          <span>${done ? '✅ Registrado por la maestra' : '⏳ Aún pendiente de registro'}</span>
        </div>
      </div>
      <p class="wk-detail-note">El horario se actualiza en tiempo real cuando la maestra registra las actividades del aula.</p>
      <div class="wk-detail-actions">
        <button type="button" class="wk-btn wk-btn-ghost" onclick="UI.Modal.close('parentWeeklyBlockModal')">Cerrar</button>
      </div>
    </div>
  `);
}

export async function refreshForCurrent() {
  const student = AppState.get('currentStudent');
  const classroomId = student?.classroom_id || student?.classrooms?.id;
  if (!classroomId) return [];
  return loadBlocks(classroomId);
}

if (typeof window !== 'undefined') {
  window.ParentWeeklySchedule = { renderWeekly, show, loadBlocks, invalidate, refreshForCurrent };
}
