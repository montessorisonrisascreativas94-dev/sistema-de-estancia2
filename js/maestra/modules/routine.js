/**
 * Rutina Express v7 — Sonrisas Creativas
 * 4 niveles: Timeline del Día · Acciones Colectivas · Tarjetas · Modal Individual
 * Auto-timeline activation · Enhanced biberón/medication/emotion · Premium UX
 */
import { AppState } from '../state.js';
import { UI, safeToast, safeEscapeHTML, safeUrl } from './ui.js';
import { MaestraApi, invalidateCache } from '../api.js';
import { supabase } from '../../shared/supabase.js';
import { RoutineCatalog } from '../../shared/routine-catalog.js';

let _logsMap = {};
let _sleepMap = {};
let _lastEvent = {};
let _expandedEvent = null;
let _autoRefreshTimer = null;
let _attendanceChannel = null;
let _routineChannel = null;
let _presentIds = new Set();
let _scheduleConfig = null;
let _timelineCollapsed = localStorage.getItem('sonrisas_tl_collapsed') === '1';
let _timelineActive = localStorage.getItem('sonrisas_tl_active') !== '0';
let _visibilityBound = false;
let _scBuildMode = 'library';
let _buildDraft = null;
let _buildStartTime = '07:30';

const SCHEDULE_STORAGE_KEY = 'sonrisas_schedule_config';
const SCHEDULE_DB_SEED_KEY = 'sonrisas_schedule_db_seed';
const DAILY_OVERRIDES_KEY = 'sonrisas_daily_overrides';
const SCHEDULE_TEMPLATE_KEY = 'sonrisas_schedule_template';
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

// ───────────────────────────────────────────────────────────────────────────────
// CATÁLOGO DE EVENTOS — biblioteca ampliada que la maestra puede agregar a su
// cronología. Agrupados por categoría para mostrarse en el modal de Configurar
// Horario. groupEventId marca los eventos que se registran como acción colectiva.
// ───────────────────────────────────────────────────────────────────────────────
const SCHEDULE_CATALOG = {
  base: { label: '📌 Rutina base', color: '#0B63C7', items: [
    { id: 'welcome',       emoji: '🖐️', label: 'Bienvenida',        color: '#FF8A00', duration: 15 },
    { id: 'roll_call',     emoji: '📋', label: 'Pase de Lista',     color: '#0B63C7', duration: 15 },
    { id: 'departure',     emoji: '👋', label: 'Entrega de niños',  color: '#EF4444', duration: 60 },
    { id: 'sleep_start',   emoji: '😴', label: 'Siesta',            color: '#8B5CF6', duration: 120, groupEventId: 'sleep_start' },
    { id: 'sleep_end',     emoji: '😊', label: 'Despertar',         color: '#FFD43B', duration: 15,  groupEventId: 'sleep_end' }
  ]},
  hygiene: { label: '🧼 Higiene y cuidado', color: '#0EA5E9', items: [
    { id: 'bath_full',      emoji: '🛁', label: 'Baño completo',     color: '#0EA5E9', duration: 30, groupEventId: 'bath' },
    { id: 'diaper_change',  emoji: '🧷', label: 'Cambio de pañal',   color: '#94A3B8', duration: 15, groupEventId: 'diaper_change' },
    { id: 'handwash',       emoji: '🧼', label: 'Lavado de manos',   color: '#0B63C7', duration: 10, groupEventId: 'handwash' },
    { id: 'toothbrush',     emoji: '🪥', label: 'Cepillado',         color: '#06B6D4', duration: 15, groupEventId: 'toothbrush' }
  ]},
  food: { label: '🍎 Alimentación', color: '#FF8A00', items: [
    { id: 'breakfast',     emoji: '🍞', label: 'Desayuno',           color: '#FF8A00', duration: 30, groupEventId: 'breakfast' },
    { id: 'papilla',       emoji: '🥣', label: 'Papilla',            color: '#F59E0B', duration: 20, groupEventId: 'snack' },
    { id: 'hydration',     emoji: '💧', label: 'Hidratación',        color: '#0B63C7', duration: 15, groupEventId: 'water' },
    { id: 'fruit',         emoji: '🍎', label: 'Fruta',              color: '#28B54D', duration: 20, groupEventId: 'snack' },
    { id: 'snack',         emoji: '🍿', label: 'Refrigerio',         color: '#28B54D', duration: 30, groupEventId: 'snack' },
    { id: 'lunch',         emoji: '🍽️', label: 'Almuerzo',           color: '#28B54D', duration: 30, groupEventId: 'lunch' },
    { id: 'snack2',        emoji: '🍪', label: 'Merienda',           color: '#F59E0B', duration: 30, groupEventId: 'snack' }
  ]},
  stimulation: { label: '🧸 Estimulación y juego', color: '#7C3AED', items: [
    { id: 'early_stimulation', emoji: '🧸', label: 'Estimulación temprana', color: '#7C3AED', duration: 30 },
    { id: 'crawling',          emoji: '👶', label: 'Gateo',                   color: '#EC4899', duration: 25 },
    { id: 'sensorial_games',   emoji: '🪀', label: 'Juegos sensoriales',      color: '#6366F1', duration: 30 },
    { id: 'symbolic_play',     emoji: '🧸', label: 'Juego simbólico',         color: '#D946EF', duration: 30 },
    { id: 'blocks',            emoji: '🚂', label: 'Bloques',                 color: '#F97316', duration: 25 },
    { id: 'group_game',        emoji: '🪅', label: 'Juego grupal',            color: '#F59E0B', duration: 30 }
  ]},
  socioemotional: { label: '🤗 Social-emocional', color: '#EF4444', items: [
    { id: 'group_hug',         emoji: '🤗', label: 'Abrazo grupal',          color: '#EF4444', duration: 10 },
    { id: 'emotional_ed',      emoji: '❤️', label: 'Educación emocional',    color: '#F43F5E', duration: 20 },
    { id: 'identify_emotions', emoji: '😀', label: 'Identificar emociones',  color: '#FBBF24', duration: 20 }
  ]},
  motor: { label: '🤸 Motricidad', color: '#16A34A', items: [
    { id: 'ball_play',    emoji: '🏀', label: 'Juego con pelota', color: '#16A34A', duration: 30 },
    { id: 'coordination', emoji: '🎯', label: 'Coordinación',      color: '#0B63C7', duration: 30 },
    { id: 'exercises',    emoji: '🏃', label: 'Ejercicios',        color: '#22C55E', duration: 20 }
  ]},
  cognitive: { label: '🧠 Cognitivo y aprendizaje', color: '#8B5CF6', items: [
    { id: 'cognitive_stim',  emoji: '🧠', label: 'Estimulación cognitiva', color: '#8B5CF6', duration: 30 },
    { id: 'experiment',      emoji: '🔬', label: 'Experimento',            color: '#6366F1', duration: 30 },
    { id: 'oral_expression', emoji: '🎤', label: 'Expresión oral',         color: '#EC4899', duration: 20 },
    { id: 'activity',        emoji: '🎨', label: 'Actividad educativa',    color: '#7C3AED', duration: 45, groupEventId: 'activity' },
    { id: 'sensorial',       emoji: '🔬', label: 'Actividad sensorial',    color: '#6366F1', duration: 45 }
  ]},
  art: { label: '🎨 Arte y creatividad', color: '#EC4899', items: [
    { id: 'coloring', emoji: '🖍', label: 'Colorear',  color: '#F472B6', duration: 25 },
    { id: 'art',      emoji: '🎨', label: 'Arte',      color: '#EC4899', duration: 30 },
    { id: 'music',    emoji: '🎵', label: 'Música',    color: '#8B5CF6', duration: 25 }
  ]},
  language: { label: '📖 Lenguaje y lectura', color: '#2563EB', items: [
    { id: 'reading',      emoji: '📖', label: 'Lectura',       color: '#0B63C7', duration: 20 },
    { id: 'storytelling', emoji: '📚', label: 'Cuentacuentos', color: '#2563EB', duration: 25 }
  ]},
  recreation: { label: '⚽ Recreación y deportes', color: '#16A34A', items: [
    { id: 'recreational_games', emoji: '🪁', label: 'Juegos recreativos', color: '#F59E0B', duration: 30 },
    { id: 'sports',             emoji: '⚽', label: 'Deportes',           color: '#16A34A', duration: 30 },
    { id: 'playground',         emoji: '🌳', label: 'Salida al Patio',   color: '#16A34A', duration: 30, groupEventId: 'playground' },
    { id: 'free_play',          emoji: '🎮', label: 'Juego libre',        color: '#EC4899', duration: 30 }
  ]}
};

const _CATALOG_BY_ID = (() => {
  const map = {};
  Object.values(SCHEDULE_CATALOG).forEach(cat => cat.items.forEach(it => { map[it.id] = it; }));
  return map;
})();

// ───────────────────────────────────────────────────────────────────────────────
// PLANTILLAS DE RUTINA POR EDAD — la maestra aplica una plantilla y después
// ajusta horas, duraciones, activar/desactivar y agregar/quitar eventos.
// Cada entrada: [catId, horaInicio, duración, idPropio?] (id propio para repetir
// un mismo evento de la biblioteca varias veces en el día).
// ───────────────────────────────────────────────────────────────────────────────
const ROUTINE_TEMPLATES = {
  infantes: {
    id: 'infantes', emoji: '🍼', name: 'Infantes', subtitle: '0 a 12 meses', color: '#0EA5E9',
    events: [
      ['welcome', '07:30', 15], ['roll_call', '07:45', 15], ['papilla', '08:00', 20],
      ['diaper_change', '08:20', 15], ['early_stimulation', '08:45', 30], ['crawling', '09:15', 25],
      ['sensorial_games', '09:40', 30], ['fruit', '10:10', 20], ['hydration', '10:30', 15],
      ['symbolic_play', '10:50', 30], ['group_hug', '11:20', 10], ['diaper_change', '11:40', 15, 'inf_diaper2'],
      ['papilla', '12:00', 20, 'inf_papilla2'], ['toothbrush', '12:25', 10], ['sleep_start', '12:40', 120],
      ['sleep_end', '14:40', 15], ['fruit', '15:00', 20, 'inf_fruit2'], ['music', '15:25', 20],
      ['reading', '15:50', 15], ['departure', '16:00', 60]
    ]
  },
  caminadores: {
    id: 'caminadores', emoji: '🚼', name: 'Caminadores', subtitle: '1 a 2 años', color: '#7C3AED',
    events: [
      ['welcome', '07:30', 15], ['roll_call', '07:45', 15], ['breakfast', '08:00', 30],
      ['handwash', '08:30', 10], ['early_stimulation', '08:45', 30], ['ball_play', '09:15', 30],
      ['sensorial_games', '09:45', 30], ['snack', '10:15', 30], ['coordination', '10:45', 30],
      ['symbolic_play', '11:15', 30], ['lunch', '11:45', 30], ['toothbrush', '12:15', 15],
      ['sleep_start', '12:30', 120], ['sleep_end', '14:30', 15], ['snack2', '14:50', 30],
      ['music', '15:20', 25], ['storytelling', '15:45', 25], ['departure', '16:00', 60]
    ]
  },
  parvulos: {
    id: 'parvulos', emoji: '🧒', name: 'Párvulos', subtitle: '2 a 3 años', color: '#F59E0B',
    events: [
      ['welcome', '07:30', 15], ['roll_call', '07:45', 15], ['breakfast', '08:00', 30],
      ['handwash', '08:30', 10], ['identify_emotions', '08:45', 20], ['exercises', '09:10', 20],
      ['art', '09:30', 30], ['snack', '10:00', 30], ['group_game', '10:30', 30],
      ['emotional_ed', '11:00', 20], ['blocks', '11:25', 25], ['lunch', '11:55', 30],
      ['toothbrush', '12:25', 15], ['sleep_start', '12:40', 110], ['sleep_end', '14:30', 15],
      ['snack2', '14:50', 30], ['oral_expression', '15:20', 20], ['recreational_games', '15:40', 30],
      ['departure', '16:00', 60]
    ]
  },
  preescolar: {
    id: 'preescolar', emoji: '🎒', name: 'Preescolar', subtitle: '3 a 5 años', color: '#16A34A',
    events: [
      ['welcome', '07:30', 15], ['roll_call', '07:45', 15], ['breakfast', '08:00', 30],
      ['handwash', '08:30', 10], ['cognitive_stim', '08:45', 30], ['oral_expression', '09:15', 20],
      ['reading', '09:40', 20], ['snack', '10:00', 30], ['coloring', '10:30', 25],
      ['experiment', '11:00', 30], ['sports', '11:30', 30], ['lunch', '12:05', 30],
      ['toothbrush', '12:35', 15], ['sleep_start', '12:50', 90], ['sleep_end', '14:20', 15],
      ['snack2', '14:40', 30], ['recreational_games', '15:10', 30], ['art', '15:40', 30],
      ['departure', '16:00', 60]
    ]
  }
};

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
  const defaults = DEFAULT_SCHEDULE.map(e => ({ ...e }));
  try {
    const stored = localStorage.getItem(SCHEDULE_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed._version === SCHEDULE_VERSION && Array.isArray(parsed.events) && parsed.events.length > 0) {
        const tplId = localStorage.getItem(SCHEDULE_TEMPLATE_KEY);
        if (tplId && ROUTINE_TEMPLATES[tplId]) {
          // Modo plantilla: la plantilla define exactamente qué eventos aparecen.
          _scheduleConfig = parsed.events.map(e => ({ ...e }));
        } else {
          const savedMap = new Map(parsed.events.map(e => [e.id, e]));
          const merged = defaults.map(def => savedMap.has(def.id) ? { ...def, ...savedMap.get(def.id) } : def);
          parsed.events.forEach(ev => {
            if (!DEFAULT_SCHEDULE.some(d => d.id === ev.id) && !merged.some(m => m.id === ev.id)) merged.push(ev);
          });
          _scheduleConfig = merged;
        }
        _saveScheduleConfig();
        return _scheduleConfig;
      }
    }
  } catch {}
  _scheduleConfig = defaults;
  _saveScheduleConfig();
  return _scheduleConfig;
}
function _saveScheduleConfig() {
  try {
    localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify({ _version: SCHEDULE_VERSION, events: _scheduleConfig }));
  } catch {}
  _syncScheduleToDb();
}

// ───────────────────────────────────────────────────────────────────────────────
// SINCROMAZÓN A LA BD — la cronología del día se persiste en
// classroom_daily_schedule para que el panel de padres la muestre en tiempo
// real (el plan que ve la maestra es el mismo que ven los padres).
// ───────────────────────────────────────────────────────────────────────────────
let _scheduleSyncTimer = null;

function _syncScheduleToDb() {
  const classroom = AppState.get('classroom');
  if (!classroom?.id) return;
  if (_scheduleSyncTimer) clearTimeout(_scheduleSyncTimer);
  _scheduleSyncTimer = setTimeout(async () => {
    _scheduleSyncTimer = null;
    try {
      const events = _getSchedule();
      const { error } = await supabase
        .from('classroom_daily_schedule')
        .upsert(
          { classroom_id: classroom.id, schedule_date: _today(), events },
          { onConflict: 'classroom_id,schedule_date' }
        );
      if (error) console.warn('[schedule] sync error:', error.message);
    } catch {}
  }, 500);
}

function _getScheduleConfig() {
  if (!_scheduleConfig) _loadScheduleConfig();
  return _scheduleConfig;
}

/**
 * Cronología V8: si la BD tiene bloques para el aula (classroom_schedule_blocks),
 * los usa como fuente para sembrar el schedule por primera vez. Después de
 * sembrar (flag en localStorage) las ediciones locales de la maestra se
 * conservan. Si la BD no tiene bloques o falla, no toca nada (fallback a
 * DEFAULT_SCHEDULE / config previa).
 */
async function _seedScheduleFromCatalog(classroomId) {
  if (!classroomId) return;
  try {
    if (localStorage.getItem(SCHEDULE_DB_SEED_KEY)) return;
    const blocks = await RoutineCatalog.getScheduleBlocks(classroomId);
    if (!blocks || blocks.length === 0) return;

    const byLabel = new Map(blocks.map(b => [b.label, b]));
    const rebuilt = DEFAULT_SCHEDULE.map(base => {
      const db = byLabel.get(base.label);
      if (!db) return { ...base, sort_order: base.sort_order ?? 100 };
      return {
        ...base,
        startTime: String(db.start_time).slice(0, 5),
        duration: db.duration_min,
        emoji: db.emoji,
        color: db.color,
        days: db.days,
        active: db.is_active,
        sort_order: db.sort_order
      };
    });

    blocks.forEach(db => {
      if (!DEFAULT_SCHEDULE.some(b => b.label === db.label)) {
        rebuilt.push({
          id: 'block-' + db.id,
          emoji: db.emoji,
          label: db.label,
          color: db.color,
          startTime: String(db.start_time).slice(0, 5),
          duration: db.duration_min,
          type: 'colectivo',
          auto: false,
          needsConfirm: false,
          visibleParents: true,
          visibleDirector: true,
          days: db.days,
          active: db.is_active,
          sort_order: db.sort_order
        });
      }
    });

    rebuilt.sort((a, z) => a.sort_order - z.sort_order);
    _scheduleConfig = rebuilt;
    _saveScheduleConfig();
    localStorage.setItem(SCHEDULE_DB_SEED_KEY, '1');
  } catch {}
}

function _getSchedule() {
  if (!_scheduleConfig || _scheduleConfig.length === 0) {
    _scheduleConfig = DEFAULT_SCHEDULE.map(e => ({ ...e }));
    _saveScheduleConfig();
  }
  const omitted = _getDailyOmittedEvents();
  let filtered = _scheduleConfig.filter(e => e.active && e.days.includes(_getDayOfWeek()) && !omitted.includes(e.id));
  const templateMode = localStorage.getItem(SCHEDULE_TEMPLATE_KEY) && ROUTINE_TEMPLATES[localStorage.getItem(SCHEDULE_TEMPLATE_KEY)];
  if (filtered.length === 0 && !omitted.length && !templateMode) {
    _scheduleConfig = DEFAULT_SCHEDULE.map(e => ({ ...e }));
    _saveScheduleConfig();
    filtered = _scheduleConfig.filter(e => e.active && e.days.includes(_getDayOfWeek()) && !omitted.includes(e.id));
  }
  return filtered;
}

function _getEventStatus(event, nowMinutes) {
  if (!event || !event.startTime) return 'pending';
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
    sleep_start: { field: '_sleep', type: 'sleep' }, sleep_end: { field: '_sleep_end', type: 'sleep' },
    bathroom: { field: '_group', type: 'bath' }, poop_gr: { field: '_group', type: 'diaper' }, milk_gr: { field: '_group', type: 'milk' }
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
  .tl-chips-wrap{overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}
  .tl-chips{display:flex;align-items:stretch;gap:8px;min-width:max-content;padding:4px 2px}
  .tl-chip{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;min-width:70px;padding:10px 8px;border-radius:18px;cursor:pointer;transition:transform .15s,box-shadow .15s;flex-shrink:0;position:relative;border:2px solid #f1f5f9;background:#fff}
  .tl-chip:active{transform:scale(.9)}
  .tl-chip:hover{transform:translateY(-3px);box-shadow:0 8px 18px rgba(15,23,42,.10)}
  .tl-chip .tl-chip-emoji{font-size:1.4rem;line-height:1}
  .tl-chip .tl-chip-time{font-size:.5rem;font-weight:800;letter-spacing:.04em;color:#94a3b8;text-transform:uppercase}
  .tl-chip .tl-chip-name{font-size:.5rem;font-weight:900;color:#475569;max-width:64px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .tl-chip.done{border-color:#86efac;background:linear-gradient(180deg,#f0fdf4,#dcfce7)}
  .tl-chip.done .tl-chip-emoji{filter:grayscale(.35)}
  .tl-chip.done .tl-chip-name{color:#16a34a}
  .tl-chip.done::after{content:'✓';position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;background:#28B54D;color:#fff;font-size:.55rem;font-weight:900;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(40,181,77,.4);animation:chip-pop .3s}
  @keyframes chip-pop{0%{transform:scale(0)}80%{transform:scale(1.25)}100%{transform:scale(1)}}
  .tl-chip.current{border-color:var(--ev-color,#FF8A00);background:linear-gradient(180deg,#fff7ed,#ffedd5);box-shadow:0 0 0 4px color-mix(in srgb,var(--ev-color,#FF8A00) 18%,transparent);animation:chip-bounce 1.6s infinite}
  .tl-chip.current .tl-chip-emoji{animation:chip-wiggle 1.6s infinite}
  .tl-chip.current .tl-chip-time{color:var(--ev-color,#FF8A00)}
  .tl-chip.current .tl-chip-name{color:var(--ev-color,#FF8A00)}
  @keyframes chip-bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
  @keyframes chip-wiggle{0%,100%{transform:rotate(-8deg)}50%{transform:rotate(8deg)}}

  .vt-list-wrap{max-height:460px;overflow-y:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}
  .vt-list{display:flex;flex-direction:column;position:relative;padding:6px 2px}
  .vt-list::before{content:'';position:absolute;left:19px;top:6px;bottom:6px;width:3px;background:linear-gradient(180deg,#e2e8f0,#cbd5e1);border-radius:2px}
  .vt-item{display:flex;gap:14px;position:relative;padding-bottom:2px}
  .vt-dot{width:40px;height:40px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0;background:#fff;border:3px solid #e2e8f0;position:relative;z-index:1;transition:transform .2s;box-shadow:0 2px 6px rgba(15,23,42,.06)}
  .vt-item:hover .vt-dot{transform:scale(1.1) rotate(-5deg)}
  .vt-dot.done{background:var(--ev-color,#FF8A00);border-color:var(--ev-color,#FF8A00)}
  .vt-dot.done::after{content:'✓';position:absolute;bottom:-5px;right:-5px;width:18px;height:18px;border-radius:50%;background:#28B54D;color:#fff;font-size:.55rem;font-weight:900;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(40,181,77,.45);animation:chip-pop .3s}
  .vt-dot.current{border-color:var(--ev-color,#FF8A00);box-shadow:0 0 0 5px color-mix(in srgb,var(--ev-color,#FF8A00) 20%,transparent);animation:vt-pulse 1.6s infinite}
  .vt-dot.current .vt-emoji{animation:chip-wiggle 1.6s infinite}
  @keyframes vt-pulse{0%,100%{box-shadow:0 0 0 5px color-mix(in srgb,var(--ev-color,#FF8A00) 20%,transparent)}50%{box-shadow:0 0 0 10px color-mix(in srgb,var(--ev-color,#FF8A00) 8%,transparent)}}
  .vt-body{flex:1;background:#fff;border:2px solid #f1f5f9;border-radius:16px;padding:10px 12px;margin-bottom:14px;transition:all .2s;position:relative;z-index:1;cursor:pointer}
  .vt-body:hover{border-color:#e2e8f0;box-shadow:0 8px 20px rgba(15,23,42,.08);transform:translateX(2px)}
  .vt-body.done{background:#f8fafc}
  .vt-top{display:flex;align-items:center;gap:8px}
  .vt-name{font-size:.72rem;font-weight:900;color:#334155;flex:1}
  .vt-item.current .vt-name{color:var(--ev-color,#FF8A00)}
  .vt-item.done .vt-name{color:#94a3b8}
  .vt-status{font-size:.5rem;font-weight:900;text-transform:uppercase;letter-spacing:.05em;padding:3px 8px;border-radius:999px;flex-shrink:0}
  .vt-status.pending{background:#f1f5f9;color:#94a3b8}
  .vt-status.current{background:color-mix(in srgb,var(--ev-color,#FF8A00) 15%,#fff);color:var(--ev-color,#FF8A00)}
  .vt-status.done{background:#dcfce7;color:#16a34a}
  .vt-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:5px;font-size:.55rem;font-weight:700;color:#94a3b8}
  .vt-meta .pill{display:inline-flex;align-items:center;gap:4px;background:#f8fafc;border:1px solid #f1f5f9;border-radius:999px;padding:2px 8px}
  .vt-progress{margin-top:8px;height:8px;border-radius:999px;background:#f1f5f9;overflow:hidden;position:relative}
  .vt-progress>div{height:100%;border-radius:999px;background:linear-gradient(90deg,var(--ev-color,#FF8A00),#fbbf24);transition:width .4s;position:relative;overflow:hidden}
  .vt-progress>div::after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.4),transparent);animation:vt-shine 1.8s infinite}
  @keyframes vt-shine{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}
  .vt-progress-label{display:flex;justify-content:space-between;margin-top:4px;font-size:.5rem;font-weight:900;color:#94a3b8}
  .vt-progress-label b{color:var(--ev-color,#FF8A00)}
`;

function _renderTimelineExpanded(schedule, nowMinutes, logsMap, students) {
  return `
    <div class="vt-list-wrap">
      <style>${TL_STYLES}</style>
      <div class="vt-list">
        ${schedule.map((ev) => {
          const status = _getEventStatus(ev, nowMinutes);
          const isActive = status === 'in_progress';
          const isDone = status === 'completed';
          const badge = isDone ? 'done' : isActive ? 'current' : 'pending';
          const badgeTxt = isDone ? '✓ Hecho' : isActive ? 'En curso' : 'Pendiente';
          const timeLabel = ev.endTime ? `${_fmtTimeShort(ev.startTime)} – ${_fmtTimeShort(ev.endTime)}` : `Inicia ${_fmtTimeShort(ev.startTime)}`;
          const progress = ev.groupEventId ? _getEventProgress(ev, students, logsMap) : null;
          return `
            <div class="vt-item ${isActive ? 'current' : isDone ? 'done' : ''}" style="--ev-color:${ev.color}" onclick="App.expandTimelineEvent('${ev.id}')">
              <div class="vt-dot ${badge}" style="--ev-color:${ev.color}">
                <span class="vt-emoji">${isDone ? '✅' : ev.emoji}</span>
              </div>
              <div class="vt-body ${isDone ? 'done' : ''}">
                <div class="vt-top">
                  <span class="vt-name">${safeEscapeHTML(ev.label)}</span>
                  <span class="vt-status ${badge}" style="--ev-color:${ev.color}">${badgeTxt}</span>
                </div>
                <div class="vt-meta">
                  <span class="pill">🕐 ${timeLabel}</span>
                  ${ev.groupEventId ? '<span class="pill">👥 Colectivo</span>' : ''}
                </div>
                ${progress && progress.total > 0 ? `
                  <div class="vt-progress"><div style="width:${progress.pct}%;--ev-color:${ev.color}"></div></div>
                  <div class="vt-progress-label"><span>${progress.done}/${progress.total} registrados</span><b>${progress.pct}%</b></div>
                ` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function _renderTimelineCollapsed(schedule, nowMinutes) {
  return `
    <div class="tl-chips-wrap">
      <style>${TL_STYLES}</style>
      <div class="tl-chips">
        ${schedule.map((ev) => {
          const status = _getEventStatus(ev, nowMinutes);
          const isCurrent = status === 'in_progress';
          const isDone = status === 'completed';
          const cls = isDone ? 'done' : isCurrent ? 'current' : '';
          return `
            <div class="tl-chip ${cls}" style="--ev-color:${ev.color}" onclick="App.expandTimelineEvent('${ev.id}')" title="${safeEscapeHTML(ev.label)} ${_fmtTimeShort(ev.startTime)}">
              <span class="tl-chip-emoji">${ev.emoji}</span>
              <span class="tl-chip-time">${_fmtTimeShort(ev.startTime)}</span>
              <span class="tl-chip-name">${safeEscapeHTML(ev.label)}</span>
            </div>
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
  const fullConfig = _getScheduleConfig() || [];
  const allCollective = [
    ...fullConfig.filter(e => e.groupEventId && e.active),
    ...COLLECTIVE_QUICK_EVENTS.filter(qe => !fullConfig.some(e => e.groupEventId === qe.groupEventId))
  ];
  const unique = [];
  const seen = new Set();
  allCollective.forEach(e => { if (!seen.has(e.groupEventId)) { seen.add(e.groupEventId); unique.push(e); } });

  return `
    <div class="routine-card">
      <div class="routine-card-head">
        <span class="routine-card-icon" style="background:#fff7ed;color:#FF8A00">🧑‍🏫</span>
        <div>
          <div class="routine-card-title">Acciones del Aula</div>
          <div class="routine-card-sub">Toca para registrar ${students.length > 0 ? `· ${students.length} alumnos` : ''}</div>
        </div>
      </div>
      <div class="routine-card-body">
      <style>
        .ra-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:8px}
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
      <div class="ra-grid">
        ${unique.map(ev => {
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
    <div class="routine-card">
      <div class="routine-card-head">
        <span class="routine-card-icon" style="background:#eff6ff;color:#0B63C7">📋</span>
        <div class="flex-1">
          <div class="routine-card-title">Reportes Individuales</div>
          <div class="routine-card-sub">${students.length} alumno(s) hoy · toca una tarjeta</div>
        </div>
        <button onclick="App.openBulkRoutineModal()" class="text-[10px] font-black text-blue-600 uppercase tracking-wide px-2 py-1 rounded-lg hover:bg-blue-50 transition-all">Reporte masivo</button>
      </div>
      <div class="routine-card-body">
      <style>
        .sc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:8px}
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
      <div class="sc-grid">
        ${students.map(s => _studentCardMini(s, logsMap[s.id])).join('')}
      </div>
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

const ROUTINE_UI_STYLES = `
  .routine-card{background:#fff;border-radius:22px;border:2px solid #f1f5f9;box-shadow:0 4px 18px rgba(15,23,42,.05);overflow:hidden}
  .routine-card-head{display:flex;align-items:center;gap:10px;padding:13px 14px;border-bottom:2px solid #f8fafc}
  .routine-card-icon{width:36px;height:36px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0}
  .routine-card-title{font-size:.68rem;font-weight:900;color:#334155;text-transform:uppercase;letter-spacing:.08em}
  .routine-card-sub{font-size:.55rem;font-weight:700;color:#94a3b8}
  .routine-card-body{padding:13px}
  .routine-divider{display:flex;align-items:center;gap:10px;margin:16px 2px}
  .routine-divider::before,.routine-divider::after{content:'';flex:1;height:2px;border-radius:2px;background:linear-gradient(90deg,transparent,#dbeafe)}
  .routine-divider::after{background:linear-gradient(90deg,#dbeafe,transparent)}
  .routine-divider span{width:28px;height:28px;border-radius:50%;background:#fff;border:2px solid #dbeafe;display:flex;align-items:center;justify-content:center;font-size:12px;box-shadow:0 2px 10px rgba(37,99,235,.12);flex-shrink:0}
`;

function _routineDivider(icon) {
  return `<div class="routine-divider"><span>${icon}</span></div>`;
}

function _buildUI(students, schedule, nowMinutes) {
  const currentEvent = schedule.find(e => _getEventStatus(e, nowMinutes) === 'in_progress');
  const nextEvent = schedule.find(e => _getEventStatus(e, nowMinutes) === 'pending');
  const openSleeps = Object.keys(_sleepMap).length;
  const isCollapsed = _timelineCollapsed;
  const isTimelineActive = _timelineActive;

  return `
    <div class="space-y-3 pb-28" id="routineView">
      <style>${ROUTINE_UI_STYLES}</style>

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
      <div class="routine-card" style="border-radius:22px;overflow:hidden">
        <div class="routine-card-head" style="background:linear-gradient(135deg,#eef2ff,#fdf2f8);border-bottom:2px dashed #e0e7ff">
          <span class="routine-card-icon" style="background:linear-gradient(135deg,#6366f1,#d946ef);color:#fff;box-shadow:0 4px 14px rgba(99,102,241,.35)">🕐</span>
          <div class="flex-1">
            <div class="routine-card-title" style="color:#4f46e5">Cronología del día</div>
            <div class="routine-card-sub">${students.length} alumno(s) · ${schedule.length} eventos</div>
          </div>
          <button onclick="App.toggleTimelineActive()" class="text-[10px] font-black uppercase tracking-wide flex items-center gap-1 px-2.5 py-1 rounded-lg ${isTimelineActive ? 'bg-green-50 text-green-600' : 'bg-slate-100 text-slate-400'}">
            ${isTimelineActive ? 'Activa' : 'Inactiva'}
          </button>
          <button onclick="App.toggleTimeline()" class="text-[10px] font-black uppercase tracking-wide flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-500" title="${isCollapsed ? 'Mostrar en vertical' : 'Ver en horizontal'}">
            ${isCollapsed ? '▼ Abrir' : '▲ Plegar'}
          </button>
          <button onclick="App.openScheduleConfig()" class="text-[10px] font-black text-blue-500 uppercase tracking-wide flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-blue-50">⚙️</button>
        </div>
        <div class="routine-card-body">
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
      </div>

      <!-- EXPANDED EVENT PANEL -->
      <div id="expandedEventPanel"></div>

      ${_routineDivider('🧑‍🏫')}

      <!-- ═══════════════════════════════════════════════════════════════ -->
      <!-- LEVEL 2: ACCIONES COLECTIVAS DEL AULA -->
      <!-- ═══════════════════════════════════════════════════════════════ -->
      ${_renderCollectiveActions(schedule, students, _logsMap, nowMinutes)}

      ${_routineDivider('📊')}

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
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  await _seedScheduleFromCatalog(classroom.id);
  const schedule = _getSchedule();

  const attendance = await MaestraApi.getAttendance(classroom.id, today);
  const presentStudentIds = new Set(
    attendance.filter(a => ['present', 'late'].includes(a.status)).map(a => a.student_id)
  );
  const students = allStudents.filter(s => presentStudentIds.has(s.id));
  _presentIds = presentStudentIds;

  const logs = await MaestraApi.getDailyRoutine(classroom.id, today);
  _logsMap = {};
  (logs || []).forEach(log => { _logsMap[log.student_id] = log; });

  _sleepMap = {};
  (logs || []).forEach(log => {
    const ev = (log.infant_data || []).filter(e => e.type === 'sleep' && !e.end_time).pop();
    if (ev) _sleepMap[log.student_id] = ev;
  });

  container.innerHTML = _buildUI(students, schedule, nowMinutes);

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

  _ensureRoutineRealtime(classroom.id);
  _bindVisibilityRefresh();
}

function _clearAutoRefresh() {
  if (_autoRefreshTimer) { clearInterval(_autoRefreshTimer); _autoRefreshTimer = null; }
}

function _clearRoutineChannels() {
  if (_attendanceChannel) {
    supabase.removeChannel(_attendanceChannel);
    _attendanceChannel = null;
  }
  if (_routineChannel) {
    supabase.removeChannel(_routineChannel);
    _routineChannel = null;
  }
  _realtimeClassroomId = null;
}

let _realtimePending = null;
let _realtimeClassroomId = null;

function _scheduleRealtimeRefresh() {
  if (_realtimePending) return;
  _realtimePending = setTimeout(() => {
    _realtimePending = null;
    const c = document.getElementById('tab-daily-routine');
    if (c && !c.classList.contains('hidden')) initRoutine();
  }, 300);
}

function _ensureRoutineRealtime(classroomId) {
  if (!classroomId) return;
  if (_realtimeClassroomId === classroomId && (_attendanceChannel || _routineChannel)) return;
  _clearRoutineChannels();
  _realtimeClassroomId = classroomId;
  _attendanceChannel = supabase
    .channel(`routine-attendance-${classroomId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'attendance', filter: `classroom_id=eq.${classroomId}` },
      () => { _scheduleRealtimeRefresh(); }
    )
    .subscribe();
  _routineChannel = supabase
    .channel(`routine-live-${classroomId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'daily_logs', filter: `classroom_id=eq.${classroomId}` },
      () => { _scheduleRealtimeRefresh(); }
    )
    .subscribe();
}

function _bindVisibilityRefresh() {
  if (_visibilityBound) return;
  _visibilityBound = true;
  const refreshIfVisible = () => {
    const c = document.getElementById('tab-daily-routine');
    if (c && !c.classList.contains('hidden')) initRoutine();
  };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshIfVisible(); });
  window.addEventListener('pageshow', refreshIfVisible);
  window.addEventListener('focus', refreshIfVisible);
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
  const allStudents = AppState.get('students') || [];
  const students = _presentIds.size > 0 ? allStudents.filter(s => _presentIds.has(s.id)) : allStudents;
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
            <input type="checkbox" id="cfgActive" ${ev.active ? 'checked' : ''} class="sr-only"
              onchange="var track=this.parentElement.querySelector('.cfg-track');var knob=this.parentElement.querySelector('.cfg-knob');if(this.checked){track.style.background='#22c55e';knob.style.left='22px';}else{track.style.background='#cbd5e1';knob.style.left='2px';}var l=document.getElementById('cfgActiveLabel');l.textContent=this.checked?'Activo':'Inactivo';l.className='ml-2 text-[10px] font-black uppercase tracking-wide px-2.5 py-1 rounded-lg '+(this.checked?'bg-green-100 text-green-700':'bg-slate-200 text-slate-500');">
            <div class="cfg-track w-11 h-6 rounded-full transition-all" style="background:${ev.active ? '#22c55e' : '#cbd5e1'};position:relative">
              <div class="cfg-knob w-5 h-5 rounded-full bg-white transition-all" style="position:absolute;top:2px;${ev.active ? 'left:22px' : 'left:2px'}"></div>
            </div>
            <span id="cfgActiveLabel" class="ml-2 text-[10px] font-black uppercase tracking-wide px-2.5 py-1 rounded-lg ${ev.active ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-500'}">${ev.active ? 'Activo' : 'Inactivo'}</span>
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
  _getScheduleConfig().push(newEv);
  _saveScheduleConfig();
  openScheduleConfig();
  initRoutine();
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
  const schedule = _getScheduleConfig();
  const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const buildMode = _scBuildMode === 'build';
  if (buildMode && !_buildDraft) _initBuildDraft();

  const omitted = _getDailyOmittedEvents();
  const activeTpl = localStorage.getItem(SCHEDULE_TEMPLATE_KEY) || '';
  let scheduleHtml = '';
  if (!buildMode) {
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
  }

  const tplChips = `
    <button onclick="App.clearScheduleTemplate()" class="tpl-chip ${activeTpl === '' ? 'on' : ''}">
      <span class="text-lg">✍️</span>
      <span class="tpl-chip-txt"><b>Personalizado</b><i>tú decides</i></span>
    </button>
    ${Object.values(ROUTINE_TEMPLATES).map(tpl => `
      <button onclick="App.applyRoutineTemplate('${tpl.id}')" class="tpl-chip ${activeTpl === tpl.id ? 'on' : ''}">
        <span class="text-lg">${tpl.emoji}</span>
        <span class="tpl-chip-txt"><b>${tpl.name}</b><i>${tpl.subtitle}</i></span>
      </button>`).join('')}`;

  const catalogHtml = Object.entries(SCHEDULE_CATALOG).map(([key, cat]) => `
    <div class="mt-4">
      <div class="cat-title"><span class="w-2 h-2 rounded-full inline-block mr-1.5" style="background:${cat.color}"></span>${cat.label}</div>
      <div class="grid grid-cols-3 gap-2 mt-2">
        ${cat.items.map(it => {
          if (buildMode) {
            const selected = _buildDraft.some(r => r.catId === it.id);
            return `
              <button onclick="App.buildModeAdd('${it.id}')" class="cat-chip ${selected ? 'sel' : ''}" title="${safeEscapeHTML(it.label)}">
                <span class="text-lg leading-none">${it.emoji}</span>
                <span class="cat-chip-name">${safeEscapeHTML(it.label)}</span>
                <span class="cat-chip-badge">${selected ? '✓' : '+'}</span>
              </button>`;
          }
          const added = schedule.some(s => s.label === it.label);
          return `
            <button onclick="App.addCatalogEvent('${it.id}')" class="cat-chip ${added ? 'added' : ''}" title="${safeEscapeHTML(it.label)}">
              <span class="text-lg leading-none">${it.emoji}</span>
              <span class="cat-chip-name">${safeEscapeHTML(it.label)}</span>
              <span class="cat-chip-badge">${added ? '✓' : '+'}</span>
            </button>`;
        }).join('')}
      </div>
    </div>`).join('');

  const builderSection = `
    <div class="rounded-2xl p-3 mb-3" style="background:linear-gradient(135deg,#fdf2f8,#eff6ff);border:2px solid #fbcfe8">
      <div class="flex items-center justify-between mb-2">
        <span class="text-xs font-black text-pink-600 uppercase tracking-wider">📝 Tu cronología personal</span>
        <span class="bd-count">${(_buildDraft || []).length} evento(s)</span>
      </div>
      <div class="flex gap-1.5 flex-wrap mb-2">
        <label class="bd-start"><span>Inicio</span><input type="time" value="${_buildStartTime}" onchange="App.buildModeSetStart(this.value)"></label>
        <button onclick="App.buildModeStack()" class="bd-act" title="Encadena las horas según la duración de cada evento">⏱️ Auto-ordenar</button>
        <button onclick="App.buildModeClear()" class="bd-act bd-act-red">🧹 Vaciar</button>
        <button onclick="App.buildModeApply()" class="bd-act bd-act-green">✔ Aplicar cronología</button>
      </div>
      ${(_buildDraft || []).length
        ? `<div class="bd-list">${_buildDraft.map((r, i) => {
            const cat = r.catId ? _CATALOG_BY_ID[r.catId] : null;
            const emoji = cat ? cat.emoji : (r.emoji || '📌');
            const label = cat ? cat.label : (r.label || 'Evento');
            const color = cat ? cat.color : (r.color || '#0B63C7');
            return `
              <div class="bd-row" style="--c:${color}">
                <span class="bd-emoji">${emoji}</span>
                <div class="flex-1 min-w-0"><div class="bd-name">${safeEscapeHTML(label)}</div></div>
                <input type="time" value="${r.time}" class="bd-in" onchange="App.buildModeSetTime(${i},this.value)" title="Hora de inicio">
                <div class="bd-dur-wrap"><input type="number" value="${r.dur}" min="5" step="5" class="bd-in bd-dur" onchange="App.buildModeSetDur(${i},this.value)" title="Duración (min)"><span class="bd-dur-t">min</span></div>
                <button onclick="App.buildModeMove(${i},-1)" class="bd-btn" title="Subir">▲</button>
                <button onclick="App.buildModeMove(${i},1)" class="bd-btn" title="Bajar">▼</button>
                <button onclick="App.buildModeRemove(${i})" class="bd-btn bd-del" title="Quitar">✕</button>
              </div>`;
          }).join('')}</div>`
        : `<div class="bd-empty">👆 Toca los eventos de abajo y se irán agregando aquí en orden</div>`}
    </div>`;

  UI.Modal.open('scheduleConfigModal', `
    <style>
      .tpl-row{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;padding:2px}
      .tpl-chip{display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:16px;border:2px solid rgba(255,255,255,.35);background:rgba(255,255,255,.15);flex-shrink:0;cursor:pointer;transition:all .15s;text-align:left}
      .tpl-chip:active{transform:scale(.95)}
      .tpl-chip:hover{background:rgba(255,255,255,.25)}
      .tpl-chip.on{border-color:#fff;background:#fff;box-shadow:0 4px 14px rgba(0,0,0,.18)}
      .tpl-chip-txt{display:flex;flex-direction:column;line-height:1.1}
      .tpl-chip-txt b{font-size:.62rem;font-weight:900;color:#fff}
      .tpl-chip-txt i{font-size:.5rem;font-weight:700;color:rgba(255,255,255,.75);font-style:normal}
      .tpl-chip.on .tpl-chip-txt b{color:#0B63C7}
      .tpl-chip.on .tpl-chip-txt i{color:#94a3b8}
      .cat-title{font-size:.6rem;font-weight:900;text-transform:uppercase;letter-spacing:.06em;color:#475569;display:flex;align-items:center}
      .cat-chip{position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 4px;border-radius:16px;border:2px solid #f1f5f9;background:#fff;cursor:pointer;transition:all .15s}
      .cat-chip:active{transform:scale(.92)}
      .cat-chip:hover{border-color:#93c5fd;background:#f8fafc}
      .cat-chip.added{border-color:#86efac;background:#f0fdf4}
      .cat-chip.sel{border-color:#f9a8d4;background:#fdf2f8}
      .cat-chip.sel .cat-chip-name{color:#db2777}
      .cat-chip.sel .cat-chip-badge{background:#db2777}
      .cat-chip-name{font-size:.5rem;font-weight:800;color:#64748b;text-align:center;line-height:1.15;max-width:100%;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
      .cat-chip.added .cat-chip-name{color:#16a34a}
      .cat-chip-badge{position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.6rem;font-weight:900;color:#fff}
      .cat-chip:not(.added):not(.sel) .cat-chip-badge{background:#0B63C7}
      .cat-chip.added .cat-chip-badge{background:#28B54D}
      .sc-search{width:100%;margin-top:8px;padding:10px 14px;border:2px solid #e2e8f0;border-radius:14px;font-size:.72rem;font-weight:700;color:#334155;outline:none}
      .sc-search:focus{border-color:#0B63C7}
      .sc-mode-btn{font-size:.6rem;font-weight:900;text-transform:uppercase;letter-spacing:.05em;padding:10px 8px;border-radius:14px;border:2px solid #e2e8f0;background:#fff;color:#64748b;transition:all .15s}
      .sc-mode-btn:active{transform:scale(.96)}
      .sc-mode-btn.on{border-color:#0B63C7;background:#eff6ff;color:#0B63C7;box-shadow:0 0 0 3px rgba(11,99,199,.12)}
      .bd-count{font-size:.55rem;font-weight:900;color:#db2777;background:#fce7f3;padding:2px 8px;border-radius:999px}
      .bd-start{display:inline-flex;align-items:center;gap:6px;font-size:.55rem;font-weight:800;color:#64748b;background:#fff;border:2px solid #f1f5f9;padding:6px 10px;border-radius:12px}
      .bd-start input{border:none;outline:none;font-weight:900;color:#0B63C7;font-size:.62rem}
      .bd-act{font-size:.55rem;font-weight:900;color:#64748b;background:#fff;border:2px solid #f1f5f9;padding:6px 10px;border-radius:12px;text-transform:uppercase;letter-spacing:.03em}
      .bd-act:active{transform:scale(.95)}
      .bd-act-green{color:#fff;background:#28B54D;border-color:#28B54D}
      .bd-act-red{color:#ef4444;border-color:#fecaca;background:#fef2f2}
      .bd-list{max-height:38vh;overflow-y:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}
      .bd-row{display:flex;align-items:center;gap:6px;padding:8px 10px;border-radius:14px;border:2px solid #f1f5f9;background:#fff;margin-bottom:6px}
      .bd-row:last-child{margin-bottom:0}
      .bd-emoji{font-size:1.1rem;flex-shrink:0}
      .bd-name{font-size:.62rem;font-weight:900;color:#334155;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-left:3px solid var(--c,#0B63C7);padding-left:6px}
      .bd-in{width:68px;padding:5px 6px;border:2px solid #e2e8f0;border-radius:10px;font-size:.62rem;font-weight:800;color:#334155;outline:none;text-align:center;flex-shrink:0}
      .bd-in:focus{border-color:#0B63C7}
      .bd-dur-wrap{position:relative;flex-shrink:0}
      .bd-dur{width:52px;padding-right:20px}
      .bd-dur-t{position:absolute;right:6px;top:50%;transform:translateY(-50%);font-size:.45rem;font-weight:800;color:#94a3b8}
      .bd-btn{width:24px;height:24px;border-radius:8px;border:1px solid #e2e8f0;background:#f8fafc;color:#64748b;font-size:.5rem;font-weight:900;flex-shrink:0}
      .bd-btn:active{transform:scale(.9)}
      .bd-del{color:#ef4444;border-color:#fecaca;background:#fef2f2}
      .bd-empty{padding:14px;text-align:center;font-size:.62rem;font-weight:800;color:#94a3b8;border:2px dashed #e2e8f0;border-radius:14px;background:#fff}
    </style>
    <div class="bg-white overflow-hidden" style="border-radius:32px;max-height:88vh;display:flex;flex-direction:column">
      <div class="p-5 flex-shrink-0" style="background:linear-gradient(135deg,#0B63C7,#28B54D)">
        <div class="flex items-center justify-between">
          <div><h3 class="text-xl font-black text-white">Configurar Horario</h3><p class="text-sm font-bold text-white/80">Arrastra ☰ — toca para configurar — + para insertar</p></div>
          <button onclick="UI.Modal.close('scheduleConfigModal')" class="p-2 rounded-xl bg-white/20 text-white"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
        </div>
        <div class="mt-4">
          <div class="text-[10px] font-black text-white/70 uppercase tracking-widest mb-2">Plantilla de rutina por edad</div>
          <div class="tpl-row">${tplChips}</div>
        </div>
      </div>
      <div class="p-4 overflow-y-auto flex-1" id="sc-list">
        <div class="grid grid-cols-2 gap-2 mb-3">
          <button onclick="App.setScheduleConfigMode('library')" class="sc-mode-btn ${!buildMode ? 'on' : ''}">📚 Biblioteca</button>
          <button onclick="App.setScheduleConfigMode('build')" class="sc-mode-btn ${buildMode ? 'on' : ''}">🔨 Construir cronología</button>
        </div>
        ${buildMode ? builderSection : ''}
        <div class="rounded-2xl p-3" style="background:linear-gradient(135deg,#eff6ff,#fdf4ff);border:2px dashed #bfdbfe">
          ${buildMode ? `
            <input class="sc-search" placeholder="🔍 Buscar evento..." oninput="var q=this.value.toLowerCase();document.querySelectorAll('#sc-catalog-b .cat-chip').forEach(function(c){c.style.display=c.textContent.toLowerCase().includes(q)?'':'none'})">
            <div id="sc-catalog-b">${catalogHtml}</div>
          ` : `
            <button onclick="var c=document.getElementById('sc-catalog');var t=this.querySelector('.sc-ic');c.classList.toggle('hidden');t.textContent=c.classList.contains('hidden')?'▼':'▲'" class="w-full flex items-center justify-between">
              <span class="text-xs font-black text-blue-600 uppercase tracking-wider">📚 Biblioteca de eventos</span>
              <span class="sc-ic">▼</span>
            </button>
            <div id="sc-catalog" class="hidden">
              <input class="sc-search" placeholder="🔍 Buscar evento..." oninput="var q=this.value.toLowerCase();document.querySelectorAll('#sc-catalog .cat-chip').forEach(function(c){c.style.display=c.textContent.toLowerCase().includes(q)?'':'none'})">
              ${catalogHtml}
            </div>
            <div class="mt-4">${scheduleHtml}</div>
          `}
        </div>
      </div>
      <div class="p-4 border-t border-slate-100 flex-shrink-0 space-y-2">
        <button onclick="App.resetScheduleConfig()" class="w-full py-3 rounded-xl border-2 border-red-200 font-black text-xs uppercase text-red-500 hover:bg-red-50 transition-all">Restaurar Horario Predeterminado</button>
        <p class="text-center text-[9px] font-bold text-slate-300">Consejo: aplica una plantilla por edad o construye la tuya y ajusta la hora de cada evento</p>
      </div>
    </div>
  `);
}

export function resetScheduleConfig() {
  localStorage.removeItem(SCHEDULE_DB_SEED_KEY);
  localStorage.removeItem(SCHEDULE_TEMPLATE_KEY);
  _scheduleConfig = DEFAULT_SCHEDULE.map(e => ({ ...e }));
  _buildDraft = null;
  _saveScheduleConfig();
  UI.Modal.close('scheduleConfigModal');
  safeToast('Horario restaurado', 'success');
  initRoutine();
}

// ───────────────────────────────────────────────────────────────────────────────
// PLANTILLAS Y BIBLIOTECA DE EVENTOS
// ───────────────────────────────────────────────────────────────────────────────

function _catalogScheduleEvent(catId, startTime, duration, customId) {
  const cat = _CATALOG_BY_ID[catId];
  if (!cat) return null;
  return {
    id: customId || catId,
    emoji: cat.emoji,
    label: cat.label,
    color: cat.color,
    startTime,
    duration: duration || cat.duration,
    type: 'colectivo',
    auto: false,
    needsConfirm: false,
    visibleParents: true,
    visibleDirector: true,
    days: [1, 2, 3, 4, 5, 6],
    active: true,
    ...(cat.groupEventId ? { groupEventId: cat.groupEventId } : {})
  };
}

export function applyRoutineTemplate(tplId) {
  const tpl = ROUTINE_TEMPLATES[tplId];
  if (!tpl) return;
  const events = tpl.events
    .map(([catId, time, dur, customId]) => _catalogScheduleEvent(catId, time, dur, customId))
    .filter(Boolean);
  if (events.length === 0) return;
  _scheduleConfig = events;
  localStorage.setItem(SCHEDULE_TEMPLATE_KEY, tplId);
  localStorage.setItem(SCHEDULE_DB_SEED_KEY, '1');
  _buildDraft = null;
  _saveScheduleConfig();
  UI.Modal.close('scheduleConfigModal');
  openScheduleConfig();
  initRoutine();
  safeToast(`Plantilla "${tpl.name}" (${tpl.subtitle}) aplicada`, 'success');
}

export function addCatalogEvent(catId) {
  const cat = _CATALOG_BY_ID[catId];
  if (!cat) return;
  const id = catId + '_' + Date.now().toString(36);
  const newEv = _catalogScheduleEvent(catId, '08:00', cat.duration, id);
  if (!newEv) return;
  _getScheduleConfig().push(newEv);
  localStorage.setItem(SCHEDULE_DB_SEED_KEY, '1');
  _buildDraft = null;
  _saveScheduleConfig();
  openScheduleConfig();
  initRoutine();
  safeToast(`"${cat.label}" agregado al horario — configúralo`, 'success');
}

export function clearScheduleTemplate() {
  localStorage.removeItem(SCHEDULE_TEMPLATE_KEY);
  safeToast('Horario personalizado activado', 'info');
}

// ───────────────────────────────────────────────────────────────────────────────
// MODO CONSTRUIR CRONOLOGÍA — la maestra selecciona eventos del catálogo y al
// hacerlo se va armando su cronología personal en orden, con horarios que se
// encadenan solos. Puede reordenar, quitar y ajustar horas/duración antes de
// aplicarla.
// ───────────────────────────────────────────────────────────────────────────────

function _initBuildDraft() {
  _buildDraft = (_getScheduleConfig() || []).map(ev => {
    const cat = _CATALOG_BY_ID[ev.id];
    return cat
      ? { uid: ev.id, catId: cat.id, time: ev.startTime, dur: ev.duration || cat.duration }
      : { uid: ev.id, catId: null, emoji: ev.emoji || '📌', label: ev.label || 'Evento', color: ev.color || '#64748B', time: ev.startTime, dur: ev.duration || 30 };
  });
}

function _nextDraftTime() {
  if (!_buildDraft.length) return _buildStartTime || '07:30';
  const last = _buildDraft[_buildDraft.length - 1];
  return _minutesToTime(_timeToMinutes(last.time) + last.dur);
}

export function setScheduleConfigMode(mode) {
  _scBuildMode = mode === 'build' ? 'build' : 'library';
  if (mode === 'build' && !_buildDraft) _initBuildDraft();
  openScheduleConfig();
}

export function buildModeAdd(catId) {
  if (!_buildDraft) _initBuildDraft();
  const cat = _CATALOG_BY_ID[catId];
  if (!cat) return;
  const idx = _buildDraft.findIndex(r => r.catId === catId);
  if (idx > -1) {
    _buildDraft.splice(idx, 1);
  } else {
    _buildDraft.push({ uid: catId + '_' + Date.now().toString(36), catId, time: _nextDraftTime(), dur: cat.duration });
  }
  openScheduleConfig();
}

export function buildModeRemove(index) {
  if (!_buildDraft) _initBuildDraft();
  if (index < 0 || index >= _buildDraft.length) return;
  _buildDraft.splice(index, 1);
  openScheduleConfig();
}

export function buildModeMove(index, delta) {
  if (!_buildDraft) _initBuildDraft();
  const to = index + delta;
  if (to < 0 || to >= _buildDraft.length) return;
  const [item] = _buildDraft.splice(index, 1);
  _buildDraft.splice(to, 0, item);
  openScheduleConfig();
}

export function buildModeSetTime(index, value) {
  if (!_buildDraft) _initBuildDraft();
  if (_buildDraft[index]) _buildDraft[index].time = value;
}

export function buildModeSetDur(index, value) {
  if (!_buildDraft) _initBuildDraft();
  const d = parseInt(value);
  if (_buildDraft[index] && d && d >= 5) _buildDraft[index].dur = d;
}

export function buildModeSetStart(value) {
  _buildStartTime = value || '07:30';
}

export function buildModeStack() {
  if (!_buildDraft) _initBuildDraft();
  let t = _buildStartTime || '07:30';
  _buildDraft.forEach(r => {
    r.time = t;
    t = _minutesToTime(_timeToMinutes(t) + r.dur);
  });
  openScheduleConfig();
}

export function buildModeClear() {
  if (!_buildDraft) _initBuildDraft();
  _buildDraft = [];
  openScheduleConfig();
}

export function buildModeApply() {
  if (!_buildDraft.length) {
    safeToast('Agrega al menos un evento para aplicar tu cronología', 'error');
    return;
  }
  const events = _buildDraft.map((r, i) => {
    const cat = r.catId ? _CATALOG_BY_ID[r.catId] : null;
    const id = (r.catId || 'custom') + '_' + Date.now().toString(36) + '_' + i;
    return {
      id,
      emoji: cat ? cat.emoji : (r.emoji || '📌'),
      label: cat ? cat.label : (r.label || 'Evento'),
      color: cat ? cat.color : (r.color || '#64748B'),
      startTime: r.time,
      duration: r.dur || 30,
      type: 'colectivo',
      auto: false,
      needsConfirm: false,
      visibleParents: true,
      visibleDirector: true,
      days: [1, 2, 3, 4, 5, 6],
      active: true,
      ...(cat && cat.groupEventId ? { groupEventId: cat.groupEventId } : {})
    };
  });
  _scheduleConfig = events;
  localStorage.removeItem(SCHEDULE_TEMPLATE_KEY);
  localStorage.setItem(SCHEDULE_DB_SEED_KEY, '1');
  _buildDraft = null;
  _saveScheduleConfig();
  UI.Modal.close('scheduleConfigModal');
  openScheduleConfig();
  initRoutine();
  safeToast('¡Tu cronología personalizada fue aplicada!', 'success');
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
  _syncScheduleToDb();
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
  _getScheduleConfig().splice(index, 0, newEv);
  _saveScheduleConfig();
  openScheduleConfig();
  initRoutine();
  safeToast('Evento insertado — configúralo', 'success');
}

export function clearDailyOverrides() {
  const all = _loadDailyOverrides();
  delete all[_getDailyKey()];
  _saveDailyOverrides(all);
  _syncScheduleToDb();
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

  const catalogEvent = await RoutineCatalog.findEvent({ legacyKey: _legacyKeyForEvent(ev) });
  const occurrenceId = crypto.randomUUID?.() || Math.random().toString(36).substr(2, 12);
  const enrich = (base) => ({
    ...base,
    origin: 'colectivo',
    occurrence_id: occurrenceId,
    ...(catalogEvent ? { event_id: catalogEvent.id } : {})
  });

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
        payload.infant_event = enrich({ type: 'sleep', label: ev.value === 'end' ? 'Terminar siesta' : 'Iniciar siesta', start_time: new Date().toISOString(), end_time: ev.value === 'end' ? new Date().toISOString() : null });
      } else if (ev.field === '_group') {
        payload.infant_event = enrich({ type: ev.value, subtype: ev.subtype, label: ev.label });
      }
      await MaestraApi.upsertDailyLog(payload);
    }
    safeToast(`${ev.label} registrado para todos!`, 'success');
    await initRoutine();
  } catch (err) {
    safeToast('Error al registrar evento grupal', 'error');
  }
}

function _legacyKeyForEvent(ev) {
  if (ev.field === '_sleep') return ev.value === 'end' ? 'infant:sleep_end' : 'infant:sleep';
  const map = {
    handwash: 'infant:handwash',
    toothbrush: 'infant:toothbrush',
    activity: 'infant:activity',
    playground: 'infant:playground',
    bath: 'infant:bath',
    diaper: ev.subtype === 'soiled' ? 'infant:diaper:soiled' : 'infant:diaper:wet',
    milk: 'infant:milk'
  };
  return map[ev.value];
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

export function _openTempModal(studentId) {
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
  const student = students.find(s => String(s.id) === String(studentId));
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
    invalidateCache('getDailyRoutine');
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
