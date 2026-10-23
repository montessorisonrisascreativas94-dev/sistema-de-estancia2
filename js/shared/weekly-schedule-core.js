/**
 * Núcleo compartido del Horario Semanal.
 * Lógica pura (sin DOM ni Supabase) reutilizada por maestra y padres.
 */

export const WEEK_DAYS = [
  { n: 1, short: 'Lun.', label: 'Lunes', color: '#7C3AED', bg: '#F5F3FF' },
  { n: 2, short: 'Mar.', label: 'Martes', color: '#0EA5E9', bg: '#F0F9FF' },
  { n: 3, short: 'Mié.', label: 'Miércoles', color: '#EC4899', bg: '#FDF2F8' },
  { n: 4, short: 'Jue.', label: 'Jueves', color: '#F59E0B', bg: '#FFFBEB' },
  { n: 5, short: 'Vie.', label: 'Viernes', color: '#10B981', bg: '#ECFDF5' },
];

export const WEEK_DAY_BY_N = Object.fromEntries(WEEK_DAYS.map(d => [d.n, d]));

const DEFAULT_BLOCK_COLORS = ['#0B63C7', '#28B54D', '#FF8A00', '#7C3AED', '#EC4899', '#F59E0B'];

export function todayNumber(date = new Date()) {
  const d = date.getDay();
  return d === 0 ? 7 : d;
}

export function nowMinutes(date = new Date()) {
  return date.getHours() * 60 + date.getMinutes();
}

export function timeToMinutes(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return value;
  const parts = String(value).slice(0, 5).split(':').map(Number);
  if (parts.length < 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return 0;
  return parts[0] * 60 + parts[1];
}

export function minutesToTime(total) {
  const min = ((Number(total) % 1440) + 1440) % 1440;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatTime(value) {
  const min = timeToMinutes(value);
  const h = Math.floor(min / 60);
  const m = min % 60;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function formatRange(start, duration) {
  const begin = timeToMinutes(start);
  return `${formatTime(begin)} – ${formatTime(begin + Number(duration || 0))}`;
}

export function weekDates(date = new Date()) {
  const base = new Date(date);
  const day = base.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(base);
  monday.setDate(base.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return WEEK_DAYS.map((d, i) => {
    const current = new Date(monday);
    current.setDate(monday.getDate() + i);
    return { ...d, date: current, iso: isoDate(current) };
  });
}

export function isoDate(date = new Date()) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function hexToRgba(hex, alpha = 0.12) {
  const clean = String(hex || '').replace('#', '').trim();
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return `rgba(11,99,199,${alpha})`;
  const num = parseInt(full, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

export function normalizeBlocks(blocks = []) {
  return (blocks || []).map((block, index) => {
    const color = block.color || DEFAULT_BLOCK_COLORS[index % DEFAULT_BLOCK_COLORS.length];
    const days = (Array.isArray(block.days) && block.days.length ? block.days : [1, 2, 3, 4, 5])
      .map(Number)
      .filter(Boolean);
    return {
      ...block,
      id: block.id != null ? String(block.id) : `wk_${index}`,
      days,
      startTime: String(block.start_time || block.startTime || '08:00').slice(0, 5),
      duration: Number(block.duration_min ?? block.duration ?? 30) || 30,
      label: block.label || 'Actividad',
      emoji: block.emoji || '📘',
      color,
      bg: hexToRgba(color, 0.13),
      events: Array.isArray(block.events) ? block.events : [],
      sort_order: Number(block.sort_order ?? index),
    };
  }).sort((a, b) => a.sort_order - b.sort_order || timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
}

export function groupRows(blocks = []) {
  const rows = new Map();
  for (const block of blocks) {
    const start = block.startTime;
    if (!rows.has(start)) {
      rows.set(start, { startTime: start, endTime: minutesToTime(timeToMinutes(start) + block.duration), cells: {} });
    }
    const row = rows.get(start);
    const rowEnd = timeToMinutes(start) + block.duration;
    if (rowEnd > timeToMinutes(row.endTime)) row.endTime = minutesToTime(rowEnd);
    for (const day of block.days) {
      if (!row.cells[day]) row.cells[day] = [];
      row.cells[day].push(block);
    }
  }
  return [...rows.values()].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
}

export function blockStatus(block, { day, now = nowMinutes() } = {}) {
  const currentDay = day ?? todayNumber();
  if (!block.days.includes(currentDay)) return 'off';
  if (currentDay !== todayNumber()) return 'scheduled';
  const start = timeToMinutes(block.startTime);
  const end = start + block.duration;
  if (now < start) return 'pending';
  if (now < end) return 'now';
  return 'done-time';
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim();
}

function parseFood(food) {
  if (!food) return {};
  if (typeof food === 'object') return food;
  try {
    const parsed = JSON.parse(food);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

export function blockEventsForLog(block, log) {
  if (!log) return [];
  const events = Array.isArray(log.infant_data) ? log.infant_data : [];
  return events.filter((event) => {
    if (String(event.schedule_block_id || '') === String(block.id)) return true;
    const label = normalizeText(block.label);
    const eventLabel = normalizeText(event.label);
    if (!eventLabel) return false;
    return eventLabel === label || eventLabel.includes(label) || label.includes(eventLabel);
  });
}

export function isBlockDoneForLog(block, log) {
  if (!log) return false;
  if (blockEventsForLog(block, log).length > 0) return true;

  const label = normalizeText(block.label);
  const food = parseFood(log.food);
  if (/desayuno|biberon/.test(label) && (food.breakfast || food.bottle || food.biberon)) return true;
  if (/almuerzo|comida/.test(label) && (food.lunch || food.almuerzo)) return true;
  if (/refrigerio|merienda|snack/.test(label) && (food.snack || food.merienda)) return true;
  if (/siesta|descanso|dormir/.test(label) && (log.nap || log.sleeping)) return true;
  if (/bienvenida|llegada|recibimiento/.test(label) && (log.mood || log.check_in || log.arrival)) return true;
  return false;
}

export function blockProgress(block, students = [], logsMap = {}) {
  const total = students.length;
  let done = 0;
  for (const student of students) {
    if (isBlockDoneForLog(block, logsMap[student.id])) done++;
  }
  return {
    done,
    total,
    pct: total ? Math.round((done / total) * 100) : 0,
    complete: total > 0 && done >= total,
  };
}

export function logEntriesForBlock(block, log) {
  if (!log) return [];
  const entries = [];
  for (const event of blockEventsForLog(block, log)) {
    const when = event.event_time || (event.created_at ? new Date(event.created_at).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' }) : '');
    entries.push({
      time: when,
      emoji: event.emoji || block.emoji,
      label: event.label || block.label,
      detail: event.detail || event.note || '',
    });
  }

  const food = parseFood(log.food);
  const label = normalizeText(block.label);
  const addFood = (key, text) => {
    if (!food[key]) return;
    entries.push({ time: food[`${key}_time`] || '', emoji: '🍽️', label: text, detail: '' });
  };
  if (/desayuno|biberon/.test(label)) addFood('breakfast', 'Desayuno registrado');
  if (/almuerzo|comida/.test(label)) addFood('lunch', 'Almuerzo registrado');
  if (/refrigerio|merienda|snack/.test(label)) addFood('snack', 'Refrigerio registrado');
  if (/siesta|descanso|dormir/.test(label) && log.nap) {
    entries.push({ time: '', emoji: '🌙', label: 'Siesta registrada', detail: String(log.nap) });
  }
  return entries;
}

export const WEEKLY_CSS = `
.wk-shell{--wk-ink:#1A2340;--wk-muted:#64748B;--wk-line:#E7ECF3;--wk-green:#28B54D;--wk-orange:#FF8A00;font-family:inherit}
.wk-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px}
.wk-title{display:flex;align-items:center;gap:10px}
.wk-title-icon{width:40px;height:40px;border-radius:14px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#28B54D,#0B63C7);color:#fff;font-size:18px;box-shadow:0 8px 18px rgba(40,181,77,.22)}
.wk-title h4{margin:0;font-size:.95rem;font-weight:900;color:var(--wk-ink);line-height:1.15}
.wk-title p{margin:2px 0 0;font-size:.58rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--wk-muted)}
.wk-legend{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:.58rem;font-weight:800;color:var(--wk-muted)}
.wk-legend span{display:inline-flex;align-items:center;gap:4px}
.wk-dot{width:8px;height:8px;border-radius:99px;display:inline-block}
.wk-scroll{overflow-x:auto;border:2px solid var(--wk-line);border-radius:18px;background:#fff;box-shadow:0 10px 26px rgba(26,35,64,.06);-webkit-overflow-scrolling:touch}
.wk-table{width:100%;min-width:780px;border-collapse:separate;border-spacing:0}
.wk-table th,.wk-table td{padding:0}
.wk-th-time{width:86px;min-width:86px;position:sticky;left:0;z-index:3;background:#fff;border-bottom:2px solid var(--wk-line);border-right:2px solid var(--wk-line)}
.wk-th-time span{display:block;padding:11px 8px;text-align:center;font-size:.56rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:var(--wk-muted)}
.wk-th-day{position:relative;padding:10px 8px;text-align:center;color:#fff;border-bottom:0;border-right:2px solid rgba(255,255,255,.55)}
.wk-th-day:last-child{border-right:0}
.wk-th-day b{display:block;font-size:.72rem;font-weight:900;letter-spacing:.02em}
.wk-th-day small{display:block;margin-top:1px;font-size:.52rem;font-weight:800;color:rgba(255,255,255,.8)}
.wk-th-day.today:after{content:'';position:absolute;left:10px;right:10px;bottom:4px;height:3px;border-radius:99px;background:#FFD43B}
.wk-th-day .wk-today-pill{display:inline-block;margin-top:4px;padding:1px 6px;border-radius:99px;background:#FFD43B;color:#713F12;font-size:.46rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase}
.wk-row-time{position:sticky;left:0;z-index:2;background:#F8FAFF;border-right:2px solid var(--wk-line);border-top:1.5px solid var(--wk-line);text-align:center;vertical-align:top}
.wk-row-time b{display:block;padding:9px 4px 2px;font-size:.6rem;font-weight:900;color:#334155}
.wk-row-time small{display:block;padding:0 4px 8px;font-size:.48rem;font-weight:700;color:#94A3B8}
.wk-cell{border-top:1.5px solid var(--wk-line);border-right:1.5px solid var(--wk-line);padding:5px;vertical-align:top;min-width:132px;background:#fff}
.wk-cell:last-child{border-right:0}
.wk-cell.today{background:#FFFBEB}
.wk-cell.empty{background:#FCFDFF;text-align:center;color:#CBD5E1;font-size:.65rem;font-weight:800;padding:16px 6px}
.wk-block{position:relative;width:100%;text-align:left;border:2px solid var(--wk-border,var(--wk-line));background:var(--wk-bg,#F8FAFC);border-radius:12px;padding:7px 8px;cursor:pointer;transition:transform .15s,box-shadow .15s;font-family:inherit}
.wk-block + .wk-block{margin-top:5px}
.wk-block:hover{transform:translateY(-1px);box-shadow:0 6px 14px rgba(15,23,42,.1)}
.wk-block:active{transform:scale(.98)}
.wk-block.now{box-shadow:0 0 0 3px rgba(255,212,59,.5),0 8px 20px rgba(255,138,0,.18);animation:wkPulse 1.8s ease-in-out infinite}
.wk-block.is-done{border-color:#86EFAC;background:#F0FDF4}
.wk-block-head{display:flex;align-items:flex-start;gap:5px}
.wk-block-emoji{font-size:1rem;line-height:1.1;flex-shrink:0}
.wk-block-copy{min-width:0;flex:1}
.wk-block-label{display:block;font-size:.61rem;font-weight:900;line-height:1.15;color:#1E293B;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.wk-block-meta{display:flex;align-items:center;justify-content:space-between;gap:4px;margin-top:4px;font-size:.48rem;font-weight:800;color:#64748B}
.wk-check{display:inline-flex;align-items:center;justify-content:center;min-width:15px;height:15px;padding:0 4px;border-radius:99px;background:#DCFCE7;color:#15803D;font-size:.46rem;font-weight:900}
.wk-now-tag{display:inline-block;margin-bottom:3px;padding:1px 5px;border-radius:99px;background:#FF8A00;color:#fff;font-size:.42rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase}
.wk-bar{height:3px;border-radius:99px;background:#E2E8F0;overflow:hidden;margin-top:5px}
.wk-bar i{display:block;height:100%;border-radius:99px;background:var(--wk-green);transition:width .35s}
.wk-empty-state{padding:34px 20px;text-align:center;border:2px dashed #DBE3EE;border-radius:18px;background:#FBFDFF}
.wk-empty-state .wk-empty-icon{font-size:30px;margin-bottom:6px}
.wk-empty-state h5{margin:0;font-size:.85rem;font-weight:900;color:#334155}
.wk-empty-state p{margin:4px auto 0;max-width:360px;font-size:.66rem;font-weight:600;color:#94A3B8;line-height:1.4}
.wk-detail{border:2px solid var(--wk-line);border-radius:18px;background:#fff;padding:14px;margin-bottom:12px;box-shadow:0 8px 22px rgba(26,35,64,.07);animation:wkSlide .22s ease both}
.wk-detail-head{display:flex;align-items:flex-start;gap:10px}
.wk-detail-emoji{width:42px;height:42px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:20px;background:var(--wk-bg,#F1F5F9);border:2px solid var(--wk-border,#E2E8F0);flex-shrink:0}
.wk-detail-head h5{margin:0;font-size:.85rem;font-weight:900;color:#1E293B;line-height:1.2}
.wk-detail-head p{margin:2px 0 0;font-size:.58rem;font-weight:800;color:#64748B}
.wk-detail-close{margin-left:auto;border:0;background:#F1F5F9;color:#64748B;width:26px;height:26px;border-radius:9px;font-weight:900;cursor:pointer;flex-shrink:0}
.wk-detail-list{margin-top:10px;display:flex;flex-direction:column;gap:5px}
.wk-detail-row{display:flex;align-items:center;gap:7px;border:1.5px solid #EEF2F7;border-radius:10px;padding:6px 8px;background:#FCFDFF}
.wk-detail-row time{font-size:.5rem;font-weight:900;color:#64748B;min-width:48px}
.wk-detail-row span{font-size:.6rem;font-weight:800;color:#334155}
.wk-detail-note{margin-top:9px;font-size:.56rem;font-weight:700;color:#94A3B8;line-height:1.4}
.wk-detail-actions{display:flex;gap:7px;margin-top:11px;flex-wrap:wrap}
.wk-btn{border:0;border-radius:11px;padding:9px 13px;font-size:.6rem;font-weight:900;letter-spacing:.03em;text-transform:uppercase;cursor:pointer;font-family:inherit}
.wk-btn-primary{background:var(--wk-green);color:#fff;box-shadow:0 6px 14px rgba(40,181,77,.22)}
.wk-btn-ghost{background:#F1F5F9;color:#475569}
.wk-btn:active{transform:scale(.96)}
.wk-primary-note{border:2px solid #BFDBFE;background:linear-gradient(135deg,#EFF6FF,#FFFFFF);border-radius:18px;padding:18px;text-align:center}
.wk-primary-note .wk-primary-icon{width:54px;height:54px;margin:0 auto 8px;border-radius:18px;display:flex;align-items:center;justify-content:center;font-size:26px;background:#DBEAFE;color:#1D4ED8}
.wk-primary-note h4{margin:0;font-size:.95rem;font-weight:900;color:#1E3A8A}
.wk-primary-note p{margin:5px auto 0;max-width:380px;font-size:.68rem;font-weight:600;line-height:1.5;color:#475569}
.wk-primary-note .wk-btn{margin-top:12px}
@keyframes wkPulse{0%,100%{box-shadow:0 0 0 3px rgba(255,212,59,.45),0 8px 20px rgba(255,138,0,.16)}50%{box-shadow:0 0 0 6px rgba(255,212,59,.18),0 10px 24px rgba(255,138,0,.22)}}
@keyframes wkSlide{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
@media (max-width:640px){
  .wk-table{min-width:720px}
  .wk-th-time,.wk-row-time{width:70px;min-width:70px}
  .wk-cell{min-width:118px;padding:4px}
  .wk-block{padding:6px}
  .wk-block-label{font-size:.56rem}
  .wk-block-meta{font-size:.44rem}
  .wk-title h4{font-size:.86rem}
}
`;
