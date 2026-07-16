/**
 * Rutina Express v3 — Sonrisas Creativas
 * Separación radical: Grupales vs Individuales
 * Registro por excepción, cronograma inteligente, prevención de duplicados
 */
import { supabase } from '../../shared/supabase.js';
import { AppState } from '../state.js';
import { UI, safeToast, safeEscapeHTML } from './ui.js';
import { MaestraApi } from '../api.js';

// ── Estado del módulo ────────────────────────────────────────────────────────
let _undoTimer   = null;
let _pendingUndo = null;
let _logsMap     = {};
let _sleepMap    = {};
let _lastEvent   = {};

// ── Helpers ──────────────────────────────────────────────────────────────────
function _today() { return new Date().toISOString().split('T')[0]; }
function _fmtTime(d) {
  return new Date(d).toLocaleTimeString('es-DO', { hour:'2-digit', minute:'2-digit', hour12:true });
}
function _isWithin12h(d) {
  return d ? (Date.now() - new Date(d).getTime()) < 43200000 : false;
}
async function _serverNow() {
  // Just use client time since RPC doesn't exist
  return new Date();
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
  if (log.nap  !== undefined && log.nap !== null) score++;
  const evTypes = new Set((log.infant_data||[]).map(e=>e.type));
  if (evTypes.has('milk'))  score++;
  if (evTypes.has('diaper') || evTypes.has('bath')) score++;
  return Math.round((score / 5) * 100);
}

// ── Catálogo de eventos GRUPALES ─────────────────────────────────────────────
const GROUP_EVENTS = [
  { id:'breakfast',   icon:'🍞', label:'Desayuno',      color:'#FF8A00', schedule:'08:00', field:'food', value:'todo' },
  { id:'lunch',       icon:'🥗', label:'Almuerzo',      color:'#28B54D', schedule:'12:00', field:'food', value:'todo' },
  { id:'snack',       icon:'🍎', label:'Merienda',      color:'#28B54D', schedule:'15:00', field:'food', value:'todo' },
  { id:'sleep_start', icon:'😴', label:'Iniciar Siesta', color:'#8B5CF6', schedule:'10:30', field:'_sleep', value:'start' },
  { id:'sleep_end',   icon:'😊', label:'Terminar Siesta', color:'#FFD43B', schedule:'12:00', field:'_sleep', value:'end' },
  { id:'handwash',    icon:'🧼', label:'Lavado de Manos', color:'#0B63C7', field:'_group', value:'handwash' },
  { id:'toothbrush',  icon:'🪥', label:'Cepillado Dental', color:'#06B6D4', field:'_group', value:'toothbrush' },
  { id:'activity',    icon:'🏫', label:'Actividad Educativa', color:'#7C3AED', field:'_group', value:'activity' },
  { id:'playground',  icon:'🌳', label:'Salida al Patio', color:'#16A34A', field:'_group', value:'playground' },
  { id:'welcome_song',icon:'👋', label:'Canción de Bienvenida', color:'#F59E0B', field:'_group', value:'welcome_song' },
  { id:'prayer',      icon:'🙏', label:'Oración / Reflexión', color:'#6366F1', field:'_group', value:'prayer' }
];

// ── Catálogo de eventos INDIVIDUALES ─────────────────────────────────────────
const INDIV_EVENTS = [
  { id:'poop',     icon:'💩', label:'Popó',              color:'#FF8A00', type:'diaper', subtype:'soiled' },
  { id:'pee',      icon:'💧', label:'Pipí',              color:'#0B63C7', type:'diaper', subtype:'wet' },
  { id:'toilet',   icon:'🚽', label:'Uso del Baño',       color:'#28B54D', type:'bath' },
  { id:'diaper',   icon:'🧻', label:'Cambio de Pañal',    color:'#94A3B8', type:'diaper_change' },
  { id:'temp',     icon:'🌡️', label:'Temperatura',        color:'#EF4444', type:'temp' },
  { id:'med',      icon:'💊', label:'Medicamento',        color:'#EC4899', type:'med' },
  { id:'hit',      icon:'🤕', label:'Golpe / Caída',      color:'#EF4444', type:'incident', subtype:'hit' },
  { id:'vomit',    icon:'🤮', label:'Vómito',            color:'#EF4444', type:'health', subtype:'vomit' },
  { id:'cough',    icon:'😷', label:'Tos / Congestión',   color:'#6366F1', type:'health', subtype:'cough' },
  { id:'milk',     icon:'🍼', label:'Biberón / Leche',    color:'#0B63C7', type:'milk' },
  { id:'note',     icon:'📝', label:'Nota Individual',    color:'#64748B', type:'note' }
];

// ── Función para ver si un evento grupal está hecho para un estudiante ───────
function _groupEventDone(log, ev) {
  if (!log || !_isWithin12h(log.created_at)) return false;
  if (ev.field === 'food')    return !!log.food;
  if (ev.field === 'mood')    return !!log.mood;
  if (ev.field === 'nap')     return !!log.nap;
  if (ev.field === '_sleep')  return (log.infant_data||[]).some(e=>e.type==='sleep');
  if (ev.field === '_group')  return (log.infant_data||[]).some(e=>e.type===ev.value);
  return false;
}

// ── Función para renderizar la tarjeta de estudiante ─────────────────────────
function _studentCard(s, log) {
  const prog = _calcProgress(log);
  const valid = log && _isWithin12h(log.created_at);
  const sleeping = !!_sleepMap[s.id];
  const hasMed = (log?.infant_data||[]).some(e=>e.type==='med');
  const hasMissingFood = valid && !log?.food;
  const evts = valid ? (log.infant_data||[]) : [];
  const lastEvt = evts[evts.length-1];
  const lastTime = lastEvt ? _fmtTime(lastEvt.created_at||Date.now()) : null;

  // Border color logic
  let borderClass = '';
  if (hasMed)        borderClass = 'border-red';
  else if (hasMissingFood) borderClass = 'border-orange';
  else if (sleeping) borderClass = 'border-purple';
  else if (prog>=80) borderClass = 'border-green';

  const moodEmoji = {feliz:'😊',normal:'😐',triste:'😢',enojado:'😡',muy_feliz:'😁',cansado:'😴',enfermo:'🤒'}[log?.mood] || '';
  const foodEmoji = {todo:'✅',poco:'⚠️',nada:'❌'}[log?.food] || '';
  const napEmoji  = {si:'💤',no:'—'}[log?.nap] || '';

  return `
    <div class="stu-card ${borderClass}" onclick="App.openStudentRoutine('${s.id}')">
      ${sleeping?'<span style="position:absolute;top:4px;left:4px;font-size:.65rem;background:#c4b5fd;color:#7c3aed;border-radius:6px;padding:1px 5px;font-weight:900">💤</span>':''}
      ${hasMed?'<span style="position:absolute;top:4px;right:4px;font-size:.65rem;background:#fecdd3;color:#ef4444;border-radius:6px;padding:1px 5px;font-weight:900">💊</span>':''}
      <div class="w-12 h-12 rounded-2xl bg-orange-50 overflow-hidden flex items-center justify-center font-black text-lg text-orange-300 border-2 border-white shadow-sm flex-shrink-0">
        ${s.avatar_url?`<img src="${s.avatar_url}" class="w-full h-full object-cover">`:`<span>${safeEscapeHTML((s.name||'?').charAt(0))}</span>`}
      </div>
      <h4 class="text-[10px] font-black text-slate-800 leading-tight line-clamp-2">${safeEscapeHTML((s.name||'').split(' ')[0])}</h4>
      <div class="flex gap-1 text-sm">${moodEmoji}${foodEmoji}${napEmoji}</div>
      ${lastTime?`<p class="text-[8px] font-black text-green-600">Hace poco</p>`:''}
      <div class="prog-bar"><div class="prog-fill" style="width:${prog}%;--pc:${prog>=80?'#28B54D':prog>=50?'#FF8A00':'#94A3B8'}"></div></div>
      <span class="text-[9px] font-bold text-slate-400">${prog}%</span>
    </div>
  `;
}

// ── Build the main UI ────────────────────────────────────────────────────────
function _buildUI(students, suggested, openSleeps, complete, missingLunch, todayLabel, timeLabel) {
  const totalStu = students.length;
  const progressPct = totalStu > 0 ? Math.round((complete/totalStu)*100) : 0;
  
  // Helper to parse "HH:MM" to minutes since midnight
  const timeToMinutes = (timeStr) => {
    const [h, m] = timeStr.split(':').map(Number);
    return h*60 + m;
  };
  const now = new Date();
  const currentMinutes = now.getHours()*60 + now.getMinutes();

  return `
    <div class="space-y-5 pb-28" id="routineView">
      <style>
        .ev-grp-btn{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;min-height:64px;padding:12px 6px;border-radius:16px;border:2px solid #f1f5f9;background:white;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;transition:all .12s;width:100%;position:relative}
        .ev-grp-btn:active{transform:scale(.88)}
        .ev-grp-btn.done{background:var(--ec, #f0fdf4);border-color:var(--cc, #bbf7d0)}
        .ev-grp-btn.past{opacity:0.5;cursor:not-allowed}
        .ev-grp-btn .icon{font-size:1.8rem;line-height:1}
        .ev-grp-btn .lbl{font-size:.58rem;font-weight:900;text-transform:uppercase;letter-spacing:.05em;color:#64748b;text-align:center;line-height:1.2}
        .ev-grp-btn.done .lbl{color:var(--cc, #16a34a)}
        .ev-indiv-btn{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-height:56px;padding:10px 6px;border-radius:14px;border:2px solid #f1f5f9;background:white;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;transition:all .12s}
        .ev-indiv-btn:active{transform:scale(.88)}
        .stu-card{border-radius:20px;padding:12px;border:2px solid #e2e8f0;background:white;cursor:pointer;touch-action:manipulation;transition:all .15s;display:flex;flex-direction:column;align-items:center;text-align:center;gap:4px;position:relative;min-height:100px}
        .stu-card:active{transform:scale(.95)}
        .stu-card.border-red{border-color:#fca5a5!important}
        .stu-card.border-orange{border-color:#fdba74!important}
        .stu-card.border-purple{border-color:#c4b5fd!important}
        .stu-card.border-green{border-color:#86efac!important}
        .prog-bar{height:3px;border-radius:2px;background:#e2e8f0;overflow:hidden;margin-top:4px;width:100%}
        .prog-fill{height:100%;border-radius:2px;background:var(--pc,#28B54D);transition:width .4s}
        .undo-bar{position:fixed;bottom:90px;left:50%;transform:translateX(-50%);z-index:700;background:#1a2340;color:#fff;border-radius:16px;padding:12px 20px;display:flex;align-items:center;gap:12px;box-shadow:0 8px 32px rgba(0,0,0,.35);animation:suUp .25s ease;font-size:.82rem;font-weight:700;white-space:nowrap;max-width:calc(100vw - 32px)}
        @keyframes suUp{from{opacity:0;transform:translateX(-50%) translateY(16px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
        .prog-drain{height:4px;background:rgba(255,255,255,.15);border-radius:4px;width:60px;overflow:hidden;flex-shrink:0}
        .prog-drain-fill{height:100%;background:#28B54D;border-radius:4px;animation:drain15 15s linear forwards}
        @keyframes drain15{from{width:100%}to{width:0}}
        .sticky-bar{position:sticky;top:0;z-index:40;background:white;border-bottom:2px solid #f1f5f9;padding:8px 0;margin-bottom:8px}
        .ai-bar{background:linear-gradient(135deg,#eff6ff,#f0fdf4);border:2px solid #bfdbfe;border-radius:16px;padding:12px 16px;display:none;align-items:center;gap:12px;cursor:pointer;transition:all .15s}
        .ai-bar:active{transform:scale(.98)}
      </style>

      <!-- STICKY QUICK BAR -->
      <div class="sticky-bar">
        <div class="flex items-center justify-between mb-2 px-1">
          <div>
            <h3 class="text-lg font-black text-slate-800">Rutina Express</h3>
            <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">${todayLabel} · ${timeLabel}</p>
          </div>
          <div class="flex gap-2">
            <div class="text-right">
              <div class="text-xs font-black text-slate-700">${complete}/${totalStu}</div>
              <div class="text-[9px] font-bold text-slate-400 uppercase">Completos</div>
            </div>
            <button onclick="App.initRoutine()" class="p-2 rounded-xl bg-slate-100 text-slate-500"><i data-lucide="refresh-cw" class="w-4 h-4"></i></button>
          </div>
        </div>
        <!-- Barra de progreso global -->
        <div class="prog-bar mx-1" style="height:6px">
          <div class="prog-fill" style="width:${progressPct}%;--pc:${progressPct>=80?'#28B54D':progressPct>=50?'#FF8A00':'#EF4444'}"></div>
        </div>
        <!-- Quick access: 5 eventos clave -->
        <div class="flex gap-2 mt-3 overflow-x-auto pb-1 px-1" style="scrollbar-width:none">
          ${[
            {id:'breakfast',icon:'🍞',label:'Desayuno'},
            {id:'milk',     icon:'🍼',label:'Biberón'},
            {id:'poop',     icon:'💩',label:'Popó',indiv:true},
            {id:'toilet',   icon:'🚽',label:'Baño',indiv:true},
            {id:'sleep_start',icon:'😴',label:'Siesta'}
          ].map(q=>`
            <button onclick="${q.indiv?'App.routineSelectIndivStudent':'App.routineQuickGroup'}('${q.id}')"
              class="shrink-0 flex flex-col items-center gap-1 px-3 py-2 rounded-xl border-2 border-slate-100 bg-white hover:border-blue-300 transition-all" style="min-width:56px">
              <span style="font-size:1.4rem">${q.icon}</span>
              <span class="text-[9px] font-black text-slate-400 uppercase tracking-wide">${q.label}</span>
            </button>
          `).join('')}
        </div>
      </div>

      <!-- ALERTAS INTELIGENTES -->
      ${openSleeps>0?`
        <button onclick="App.routineWakeAll()" class="w-full flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left transition-all active:scale-[.98]" style="background:#f5f3ff;border:2px solid #c4b5fd">
          <div class="flex items-center gap-3">
            <span class="text-2xl">😴</span>
            <div><div class="text-sm font-black" style="color:#7c3aed">${openSleeps} siesta(s) activa(s)</div>
            <div class="text-xs" style="color:#a78bfa">Toca para registrar que despertaron todos</div></div>
          </div>
          <span class="text-[10px] font-black text-white px-3 py-1.5 rounded-full shrink-0" style="background:#7c3aed">Despertar</span>
        </button>
      `:''}
      ${missingLunch>0?`
        <div class="flex items-center gap-3 rounded-2xl px-4 py-3" style="background:#fff7ed;border:2px solid #fed7aa">
          <span class="text-2xl">🍽️</span>
          <p class="text-sm font-black" style="color:#c2410c">Faltan ${missingLunch} niño(s) sin almuerzo registrado</p>
        </div>
      `:''}

      <!-- SUGERENCIA IA -->
      ${suggested?`
        <div id="aiSuggestionBar" class="ai-bar" onclick="App.routineQuickGroup('${suggested.id}')">
          <span class="text-2xl">${suggested.icon}</span>
          <div class="flex-1">
            <div class="text-sm font-black text-slate-800">Es hora de: ${suggested.label}</div>
            <div class="text-xs text-slate-500">Toca para registrar para todos los alumnos presentes</div>
          </div>
          <span class="text-[10px] font-black text-white px-3 py-1.5 rounded-full" style="background:#0B63C7">Registrar</span>
        </div>
      `:''}

      <!-- ACCIONES GRUPALES -->
      <div>
        <div class="flex items-center justify-between mb-3">
          <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Acciones para toda el aula</p>
          <span class="text-[9px] font-bold text-slate-300 uppercase">1 clic = todos</span>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm" id="groupEventsGrid">
          ${GROUP_EVENTS.map(ev=>{
            const done = students.length>0 && students.some(s=>_groupEventDone(_logsMap[s.id], ev));
            const isPast = ev.schedule && timeToMinutes(ev.schedule) < currentMinutes;
            return `
              <button class="flex items-center gap-3 px-4 py-3 rounded-xl border-2 ${done?'border-green-300 bg-green-50 font-bold':isPast?'border-slate-200 bg-slate-100':'border-slate-100 bg-slate-50 hover:border-green-400 hover:bg-green-50'} ${isPast?'past':''} transition-all cursor-pointer touch-manipulation"
                onclick="${!isPast ? `App.routineQuickGroup('${ev.id}')` : 'event.preventDefault()'}"
                ${done?'title="'+ev.label+' ya registrado"':''}>
                <span style="font-size:1.5rem;">${ev.icon}</span>
                <span class="${done?'text-green-700':isPast?'text-slate-400':'text-slate-700'} text-xs font-bold">${ev.label}</span>
                ${done?'<span style="font-size:1rem;color:#28B54D;font-weight:900">✓</span>':''}
              </button>
            `;
          }).join('')}
        </div>
      </div>

      <!-- LISTA DE ESTUDIANTES -->
      <div>
        <div class="flex items-center justify-between mb-3">
          <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Reportes individuales</p>
          <button onclick="App.openBulkRoutineModal()" class="text-[10px] font-black text-blue-600 uppercase tracking-wide">Reporte masivo</button>
        </div>
        <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3" id="studentsGrid">
          ${students.map(s=>_studentCard(s, _logsMap[s.id])).join('')}
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

  // Loading state
  container.innerHTML = `<div class="animate-pulse space-y-4">
    <div class="h-16 bg-slate-100 rounded-2xl"></div>
    <div class="grid grid-cols-5 gap-3">${Array(10).fill('<div class="h-20 bg-slate-50 rounded-2xl"></div>').join('')}</div>
    <div class="grid grid-cols-3 gap-4">${Array(6).fill('<div class="h-28 bg-slate-50 rounded-2xl"></div>').join('')}</div>
  </div>`;

  const allStudents = AppState.get('students') || [];
  const today = _today();
  const now = new Date();
  const hour = now.getHours();
  const minutes = now.getMinutes();
  const todayLabel = now.toLocaleDateString('es-DO', { weekday:'long', day:'numeric', month:'long' });
  const timeLabel = _fmtTime(now);

  // Load attendance and filter students to only present/late
  const attendance = await MaestraApi.getAttendance(classroom.id, today);
  const presentStudentIds = new Set(
    attendance.filter(a => ['present', 'late'].includes(a.status)).map(a => a.student_id)
  );
  const students = allStudents.filter(s => presentStudentIds.has(s.id));

  // Load daily logs
  const logs = await MaestraApi.getDailyRoutine(classroom.id);
  _logsMap = {};
  (logs||[]).forEach(log => _logsMap[log.student_id] = log);

  // Load sleep map
  _sleepMap = {};
  (logs||[]).forEach(log => {
    const ev = (log.infant_data||[]).filter(e => e.type==='sleep' && !e.end_time).pop();
    if (ev) _sleepMap[log.student_id] = ev;
  });

  // Smart schedule: suggested event
  const SMART_SCHEDULE = [
    { hour:7,  label:'Desayuno',      id:'breakfast',     icon:'🍞' },
    { hour:9,  label:'Merienda',      id:'snack',         icon:'🍎' },
    { hour:10, label:'Iniciar Siesta', id:'sleep_start', icon:'😴' },
    { hour:12, label:'Almuerzo',      id:'lunch',         icon:'🥗' },
    { hour:13, label:'Terminar Siesta', id:'sleep_end', icon:'😊' },
    { hour:14, label:'Biberón',       id:'milk',          icon:'🍼' },
    { hour:15, label:'Merienda',      id:'snack',         icon:'🍎' }
  ];
  const suggested = SMART_SCHEDULE.slice().reverse().find(s => hour >= s.hour);

  // Calculate stats
  const complete = students.filter(s => _calcProgress(_logsMap[s.id]) >= 80).length;
  const openSleeps = Object.keys(_sleepMap).length;
  const missingLunch = hour >= 13 ? students.filter(s => !_logsMap[s.id]?.food).length : 0;

  // Build UI
  container.innerHTML = _buildUI(students, suggested, openSleeps, complete, missingLunch, todayLabel, timeLabel);

  if (window.lucide) lucide.createIcons();

  // Show AI suggestion after a short delay
  if (suggested && students.length > 0) {
    setTimeout(() => {
      const bar = document.getElementById('aiSuggestionBar');
      if (bar) bar.style.display = 'flex';
    }, 1200);
  }
}

// ── Función para registrar un evento grupal rápidamente ──────────────────────
export async function routineQuickGroup(eventId) {
  const classroom = AppState.get('classroom');
  const allStudents = AppState.get('students') || [];
  const ev = GROUP_EVENTS.find(e => e.id === eventId);
  if (!ev) return;

  const today = _today();
  // Load attendance to get present students
  const attendance = await MaestraApi.getAttendance(classroom.id, today);
  const presentStudentIds = new Set(
    attendance.filter(a => ['present', 'late'].includes(a.status)).map(a => a.student_id)
  );
  const students = allStudents.filter(s => presentStudentIds.has(s.id));
  const serverTime = await _serverNow();

  try {
    for (const s of students) {
      // Skip duplicates
      if (_isDuplicate(s.id, eventId)) continue;

      const payload = {
        student_id: s.id,
        classroom_id: classroom.id,
        date: today,
        created_at: serverTime.toISOString()
      };

      if (ev.field === 'food') {
        payload.food = ev.value;
      } else if (ev.field === '_sleep') {
        payload.infant_event = {
          type: 'sleep',
          start_time: serverTime.toISOString(),
          end_time: ev.value === 'end' ? serverTime.toISOString() : null
        };
      } else if (ev.field === '_group') {
        payload.infant_event = { type: ev.value };
      }

      await MaestraApi.upsertDailyLog(payload);
    }

    safeToast(`${ev.label} registrado para todos!`, 'success');
    await initRoutine();
  } catch (err) {
    console.error('Error en registro grupal:', err);
    safeToast('Error al registrar evento grupal', 'error');
  }
}

// ── Función para abrir el modal de un estudiante individual ─────────────────
export function openStudentRoutine(studentId) {
  const students = AppState.get('students') || [];
  const student = students.find(s => s.id === studentId);
  if (!student) return;

  const log = _logsMap[studentId];
  const sleeping = !!_sleepMap[studentId];

  const modalContent = `
    <div class="bg-white overflow-hidden">
      <!-- Header -->
      <div class="p-6" style="background:linear-gradient(135deg,#28B54D,#239943)">
        <div class="flex items-center gap-4">
          <div class="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center overflow-hidden">
            ${student.avatar_url?`<img src="${student.avatar_url}" class="w-full h-full object-cover">`:`<span class="text-2xl font-black text-white">${safeEscapeHTML((student.name||'?').charAt(0))}</span>`}
          </div>
          <div class="flex-1">
            <h3 class="text-xl font-black text-white">${safeEscapeHTML(student.name)}</h3>
            <p class="text-sm font-bold text-white/80">${safeEscapeHTML(student.p1_name || '—')}</p>
          </div>
          <button onclick="UI.Modal.close('studentRoutineModal')" class="p-2 rounded-xl bg-white/20 text-white hover:bg-white/30">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>
      </div>

      <!-- Body -->
      <div class="p-6 space-y-6">
        <!-- Estado Emocional -->
        <div>
          <h4 class="text-sm font-black text-slate-800 mb-3">😊 Estado Emocional</h4>
          <div class="grid grid-cols-7 gap-2">
            ${['😊','😁','😐','😢','😡','😴','🤒'].map(emoji=>`
              <button onclick="App.setStudentMood('${studentId}','${emoji}')"
                class="p-3 rounded-xl border-2 border-slate-100 bg-white hover:border-blue-300 text-2xl">${emoji}</button>
            `).join('')}
          </div>
        </div>

        <!-- Alimentación -->
        <div>
          <h4 class="text-sm font-black text-slate-800 mb-3">🍽️ Aceptación de Alimentos</h4>
          <div class="grid grid-cols-4 gap-2">
            ${['✅ Comió Todo','⚠️ Comió Poco','❌ No Quiso','🆘 Necesitó Ayuda'].map((label, idx)=>`
              <button onclick="App.setStudentFood('${studentId}','${['todo','poco','nada','ayuda'][idx]}')"
                class="p-3 rounded-xl border-2 border-slate-100 bg-white hover:border-blue-300 text-xs font-black text-center">${label}</button>
            `).join('')}
          </div>
        </div>

        <!-- Siesta -->
        <div>
          <h4 class="text-sm font-black text-slate-800 mb-3">😴 Ciclo de Sueño</h4>
          <div class="grid grid-cols-4 gap-2">
            ${['Dormido','No dormido','Se despertó varias veces','Durmió excelente'].map((label, idx)=>`
              <button onclick="App.setStudentNap('${studentId}','${['si','no','poco','excelente'][idx]}')"
                class="p-3 rounded-xl border-2 border-slate-100 bg-white hover:border-blue-300 text-xs font-black text-center">${label}</button>
            `).join('')}
          </div>
        </div>

        <!-- Higiene y Esfínteres -->
        <div>
          <h4 class="text-sm font-black text-slate-800 mb-3">🧼 Higiene y Esfínteres</h4>
          <div class="grid grid-cols-5 gap-2">
            ${INDIV_EVENTS.filter(e=>['poop','pee','toilet','diaper','handwash'].includes(e.id)).map(ev=>`
              <button onclick="App.addStudentEvent('${studentId}','${ev.id}')"
                class="p-3 rounded-xl border-2 border-slate-100 bg-white hover:border-blue-300 flex flex-col items-center gap-1">
                <span class="text-2xl">${ev.icon}</span>
                <span class="text-[9px] font-black text-slate-600">${ev.label}</span>
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Salud y Alertas -->
        <div>
          <h4 class="text-sm font-black text-slate-800 mb-3">🏥 Salud y Alertas</h4>
          <div class="grid grid-cols-5 gap-2">
            ${INDIV_EVENTS.filter(e=>['temp','med','hit','vomit','cough'].includes(e.id)).map(ev=>`
              <button onclick="App.addStudentEvent('${studentId}','${ev.id}')"
                class="p-3 rounded-xl border-2 border-slate-100 bg-white hover:border-blue-300 flex flex-col items-center gap-1">
                <span class="text-2xl">${ev.icon}</span>
                <span class="text-[9px] font-black text-slate-600">${ev.label}</span>
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Nota -->
        <div>
          <h4 class="text-sm font-black text-slate-800 mb-3">📝 Nota Individual</h4>
          <textarea id="studentNote-${studentId}" placeholder="Escribe una nota sobre el día de hoy..."
            class="w-full p-4 border-2 border-slate-100 rounded-xl text-sm focus:border-blue-400 outline-none" rows="3">${log?.notes || ''}</textarea>
          <button onclick="App.saveStudentNote('${studentId}')"
            class="mt-2 w-full p-3 rounded-xl text-white font-black text-xs uppercase" style="background:#28B54D">
            Guardar Nota
          </button>
        </div>

        <!-- Historial del día -->
        <div>
          <h4 class="text-sm font-black text-slate-800 mb-3">📅 Historial del Día</h4>
          <div class="space-y-2">
            ${((log?.infant_data || [])).map(evt=>`
              <div class="flex items-center gap-3 p-3 rounded-xl border border-slate-100 bg-slate-50">
                <span class="text-xl">
                  ${evt.type==='sleep'?'😴':evt.type==='milk'?'🍼':evt.type==='diaper'?'🧻':evt.type==='bath'?'🚽':evt.type==='temp'?'🌡️':evt.type==='med'?'💊':'📝'}
                </span>
                <div class="flex-1">
                  <div class="text-sm font-black text-slate-800">${evt.type}</div>
                  <div class="text-xs text-slate-400">${_fmtTime(evt.created_at)}</div>
                </div>
              </div>
            `).join('') || '<p class="text-center text-slate-400 py-4">No hay registros aún</p>'}
          </div>
        </div>
      </div>
    </div>
  `;

  UI.Modal.open('studentRoutineModal', modalContent);
}

// ── Funciones helper para el modal del estudiante ───────────────────────────
export async function setStudentMood(studentId, mood) {
  const classroom = AppState.get('classroom');
  const today = _today();

  const moodMap = { '😊':'feliz', '😁':'muy_feliz', '😐':'normal', '😢':'triste', '😡':'enojado', '😴':'cansado', '🤒':'enfermo' };
  const moodValue = moodMap[mood] || mood;

  try {
    await MaestraApi.upsertDailyLog({
      student_id: studentId,
      classroom_id: classroom.id,
      date: today,
      mood: moodValue
    });
    safeToast('Estado emocional guardado', 'success');
    await initRoutine();
  } catch (err) {
    console.error(err);
    safeToast('Error al guardar', 'error');
  }
}

export async function setStudentFood(studentId, food) {
  const classroom = AppState.get('classroom');
  const today = _today();

  try {
    await MaestraApi.upsertDailyLog({
      student_id: studentId,
      classroom_id: classroom.id,
      date: today,
      food: food
    });
    safeToast('Alimentación guardada', 'success');
    await initRoutine();
  } catch (err) {
    console.error(err);
    safeToast('Error al guardar', 'error');
  }
}

export async function setStudentNap(studentId, nap) {
  const classroom = AppState.get('classroom');
  const today = _today();

  try {
    await MaestraApi.upsertDailyLog({
      student_id: studentId,
      classroom_id: classroom.id,
      date: today,
      nap: nap
    });
    safeToast('Siesta guardada', 'success');
    await initRoutine();
  } catch (err) {
    console.error(err);
    safeToast('Error al guardar', 'error');
  }
}

export async function addStudentEvent(studentId, eventId) {
  const classroom = AppState.get('classroom');
  const today = _today();
  const ev = INDIV_EVENTS.find(e => e.id === eventId);
  if (!ev) return;

  // Prevent duplicates
  if (_isDuplicate(studentId, eventId)) {
    safeToast('Evento registrado hace poco, esperar 15 segundos', 'warning');
    return;
  }

  try {
    await MaestraApi.upsertDailyLog({
      student_id: studentId,
      classroom_id: classroom.id,
      date: today,
      infant_event: { type: ev.type, subtype: ev.subtype }
    });
    safeToast(`${ev.label} registrado`, 'success');
    await initRoutine();
  } catch (err) {
    console.error(err);
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
      student_id: studentId,
      classroom_id: classroom.id,
      date: today,
      notes: notes
    });
    safeToast('Nota guardada', 'success');
    await initRoutine();
    UI.Modal.close('studentRoutineModal');
  } catch (err) {
    console.error(err);
    safeToast('Error al guardar', 'error');
  }
}

// ── Funciones adicionales ───────────────────────────────────────────────────
export async function routineSelectIndivStudent(eventId) {
  const students = AppState.get('students') || [];
  if (students.length === 0) return;

  const modalContent = `
    <div class="bg-white rounded-3xl overflow-hidden">
      <div class="p-6" style="background:linear-gradient(135deg,#28B54D,#239943)">
        <h3 class="text-xl font-black text-white">Selecciona un estudiante</h3>
        <p class="text-sm font-bold text-white/80">Evento: ${INDIV_EVENTS.find(e=>e.id===eventId)?.label}</p>
      </div>
      <div class="p-6 grid grid-cols-3 gap-3">
        ${students.map(s=>`
          <button onclick="App.addStudentEvent('${s.id}','${eventId}'); UI.Modal.close('selectStudentModal')"
            class="p-4 rounded-2xl border border-slate-100 bg-white hover:border-blue-300 flex flex-col items-center gap-2">
            <div class="w-12 h-12 rounded-2xl bg-orange-50 flex items-center justify-center text-lg font-black text-orange-300 overflow-hidden">
              ${s.avatar_url?`<img src="${s.avatar_url}" class="w-full h-full object-cover">`:safeEscapeHTML((s.name||'?').charAt(0))}
            </div>
            <span class="text-xs font-black text-slate-800">${safeEscapeHTML((s.name||'').split(' ')[0])}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `;
  UI.Modal.open('selectStudentModal', modalContent);
}

export async function routineWakeAll() {
  const classroom = AppState.get('classroom');
  const today = _today();
  const serverTime = await _serverNow();

  const studentsToWake = Object.keys(_sleepMap);
  if (studentsToWake.length === 0) return;

  try {
    for (const studentId of studentsToWake) {
      await MaestraApi.upsertDailyLog({
        student_id: studentId,
        classroom_id: classroom.id,
        date: today,
        infant_event: { type: 'sleep', end_time: serverTime.toISOString() }
      });
    }
    safeToast('Todas las siestas terminadas!', 'success');
    await initRoutine();
  } catch (err) {
    console.error(err);
    safeToast('Error al actualizar siestas', 'error');
  }
}

export async function openBulkRoutineModal() {
  const classroom = AppState.get('classroom');
  const students = AppState.get('students') || [];

  const modalContent = `
    <div class="bg-white rounded-3xl overflow-hidden">
      <div class="p-6" style="background:linear-gradient(135deg,#28B54D,#239943)">
        <h3 class="text-xl font-black text-white">Resumen de Reportes</h3>
        <p class="text-sm font-bold text-white/80">Revisa antes de publicar</p>
      </div>
      <div class="p-6 space-y-4">
        <div class="grid grid-cols-3 gap-4">
          <div class="p-4 rounded-2xl text-center bg-green-50">
            <div class="text-3xl font-black text-green-600">${students.filter(s=>_calcProgress(_logsMap[s.id])>=80).length}</div>
            <div class="text-xs font-bold text-green-700">Completos</div>
          </div>
          <div class="p-4 rounded-2xl text-center bg-orange-50">
            <div class="text-3xl font-black text-orange-600">${students.filter(s=>!_logsMap[s.id]?.food).length}</div>
            <div class="text-xs font-bold text-orange-700">Sin Almuerzo</div>
          </div>
          <div class="p-4 rounded-2xl text-center bg-purple-50">
            <div class="text-3xl font-black text-purple-600">${Object.keys(_sleepMap).length}</div>
            <div class="text-xs font-bold text-purple-700">Durmiendo</div>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <button onclick="UI.Modal.close('bulkRoutineModal')"
            class="p-3 rounded-xl border-2 border-slate-100 font-black text-xs uppercase text-slate-600">
            Cerrar
          </button>
          <button onclick="App.publishDailyLogs()"
            class="p-3 rounded-xl font-black text-xs uppercase text-white" style="background:#28B54D">
            Publicar Reportes
          </button>
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
  } catch (err) {
    console.error(err);
    safeToast('Error al publicar', 'error');
  }
}
