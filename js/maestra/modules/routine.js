/**
 * Rutina Express v2 — Sonrisas Creativas
 * Filosofia: Un evento = 1-3 segundos. Hora del servidor. Todos por defecto.
 */
import { supabase } from '../../shared/supabase.js';
import { AppState } from '../state.js';
import { UI } from './ui.js';

const { safeToast, safeEscapeHTML, Modal } = UI;

let _undoTimer   = null;
let _pendingUndo = null;
let _logsMap     = {};
let _sleepMap    = {};

function _isWithin12h(d) {
  if (!d) return false;
  return (Date.now() - new Date(d).getTime()) < 43200000;
}
async function _serverNow() {
  try {
    const { data } = await supabase.rpc('get_server_timestamp');
    if (data) return new Date(data);
  } catch (_) {}
  return new Date();
}
function _fmtTime(d) {
  return d.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
}
function _today() { return new Date().toISOString().split('T')[0]; }

const EVENTS = [
  { id:'breakfast', icon:'🍞', label:'Desayuno',    field:'food',   value:'todo', color:'#FF8A00' },
  { id:'snack',     icon:'🍎', label:'Merienda',    field:'food',   value:'poco', color:'#28B54D' },
  { id:'lunch',     icon:'🥗', label:'Almuerzo',    field:'food',   value:'todo', color:'#28B54D' },
  { id:'milk',      icon:'🍼', label:'Biberón',     field:'_milk',  value:null,   color:'#0B63C7' },
  { id:'sleep',     icon:'😴', label:'Durmió',      field:'_sleep', value:'start',color:'#8B5CF6' },
  { id:'wakeup',    icon:'😊', label:'Despertó',    field:'_sleep', value:'end',  color:'#FFD43B' },
  { id:'diaper_w',  icon:'💧', label:'Pañal mojado',field:'_diaper',value:'wet',  color:'#0B63C7' },
  { id:'diaper_s',  icon:'💩', label:'Pañal sucio', field:'_diaper',value:'soiled',color:'#FF8A00'},
  { id:'bathroom',  icon:'🚽', label:'Baño',        field:'_bath',  value:'done', color:'#28B54D' },
  { id:'temp',      icon:'🌡', label:'Temperatura', field:'_temp',  value:null,   color:'#EF4444' },
  { id:'med',       icon:'💊', label:'Medicamento', field:'_med',   value:null,   color:'#EC4899' },
  { id:'mood_g',    icon:'😊', label:'Contento',    field:'mood',   value:'feliz',color:'#FFD43B' },
  { id:'mood_b',    icon:'😢', label:'Triste',      field:'mood',   value:'triste',color:'#94A3B8'},
  { id:'note',      icon:'📝', label:'Nota',        field:'_note',  value:null,   color:'#64748B' },
];

const SCHEDULE = [
  { time:'08:00', icon:'🍞', label:'Desayuno',  eventId:'breakfast' },
  { time:'10:00', icon:'🍎', label:'Merienda',  eventId:'snack'     },
  { time:'10:30', icon:'😴', label:'Siesta',    eventId:'sleep'     },
  { time:'12:00', icon:'🥗', label:'Almuerzo',  eventId:'lunch'     },
  { time:'14:00', icon:'🍼', label:'Biberón',   eventId:'milk'      },
];

export async function initRoutine() {
  const classroom = AppState.get('classroom');
  const container = document.getElementById('tab-daily-routine');
  if (!container) return;

  container.innerHTML = `<div class="animate-pulse space-y-4">
    <div class="h-14 bg-slate-100 rounded-2xl"></div>
    <div class="grid grid-cols-4 sm:grid-cols-7 gap-3">${Array(14).fill('<div class="h-20 bg-slate-50 rounded-2xl"></div>').join('')}</div>
  </div>`;

  const students = AppState.get('students') || [];
  const today    = _today();

  const { data: logs } = await supabase
    .from('daily_logs')
    .select('id, student_id, date, mood, food, nap, notes, created_at, infant_data')
    .eq('classroom_id', classroom.id)
    .eq('date', today);

  _logsMap = {};
  (logs || []).forEach(l => { _logsMap[l.student_id] = l; });

  _sleepMap = {};
  (logs || []).forEach(l => {
    const ev = (l.infant_data || []).filter(e => e.type === 'sleep').pop();
    if (ev && !ev.end_time) _sleepMap[l.student_id] = ev;
  });

  const now   = new Date();
  const hour  = now.getHours();
  const activeBlock = SCHEDULE.find(b => {
    const bh = parseInt(b.time);
    return hour >= bh && hour < bh + 2;
  });

  const openSleeps = Object.keys(_sleepMap);
  const completados = students.filter(s => _logsMap[s.id] && _isWithin12h(_logsMap[s.id].created_at)).length;
  const todayLabel = now.toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long' });

  container.innerHTML = `
  <div class="space-y-5 pb-24" id="routineView">
  <style>
    .ev-btn{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:14px 8px;border-radius:18px;border:2px solid #f1f5f9;background:white;cursor:pointer;transition:all .15s;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
    .ev-btn:active{transform:scale(.88)}
    .ev-btn.done{border-color:var(--c);background:color-mix(in srgb,var(--c) 12%,white)}
    .ev-btn .ev-icon{font-size:1.9rem;line-height:1}
    .ev-btn .ev-lbl{font-size:.58rem;font-weight:900;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;text-align:center}
    .ev-btn.done .ev-lbl{color:var(--c)}
    .schip{display:flex;align-items:center;gap:6px;padding:5px 12px;border-radius:50px;border:2px solid #f1f5f9;background:white;font-size:.75rem;font-weight:800;cursor:pointer;transition:all .15s;-webkit-tap-highlight-color:transparent}
    .schip.on{border-color:#28B54D;background:#E6F7EB;color:#1A8035}
    .schip.off{border-color:#EF4444;background:#FEF2F2;color:#EF4444;text-decoration:line-through}
    .undo-bar{position:fixed;bottom:90px;left:50%;transform:translateX(-50%);z-index:600;background:#1a2340;color:#fff;border-radius:16px;padding:12px 20px;display:flex;align-items:center;gap:14px;box-shadow:0 8px 32px rgba(0,0,0,.3);animation:slideUp .25s ease;font-size:.85rem;font-weight:700;white-space:nowrap}
    @keyframes slideUp{from{opacity:0;transform:translateX(-50%) translateY(16px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
    .undo-prog{width:80px;height:4px;background:rgba(255,255,255,.2);border-radius:4px;overflow:hidden}
    .undo-fill{height:100%;background:#28B54D;border-radius:4px;animation:drain 10s linear forwards}
    @keyframes drain{from{width:100%}to{width:0}}
  </style>

  <!-- HEADER -->
  <div class="flex items-center justify-between flex-wrap gap-3">
    <div>
      <h3 class="text-xl font-black text-slate-800">Rutina Express</h3>
      <p class="text-xs font-bold text-slate-400 uppercase tracking-wider mt-0.5">${todayLabel} · ${completados}/${students.length} reportes</p>
    </div>
    <div class="flex gap-2 flex-wrap">
      <button onclick="App.initRoutine()" class="px-3 py-2 text-[10px] font-black uppercase tracking-widest bg-slate-100 text-slate-500 rounded-xl hover:bg-slate-200 transition-all flex items-center gap-1">
        <i data-lucide="refresh-cw" class="w-3 h-3"></i> Actualizar
      </button>
    </div>
  </div>

  ${openSleeps.length > 0 ? `
  <button onclick="App.routineWakeAll()" class="w-full flex items-center justify-between gap-3 bg-purple-50 border-2 border-purple-200 rounded-2xl px-4 py-3 text-left hover:bg-purple-100 transition-all active:scale-[.98]">
    <div class="flex items-center gap-3">
      <span class="text-2xl">😴</span>
      <div>
        <div class="text-sm font-black text-purple-700">${openSleeps.length} siesta(s) abierta(s)</div>
        <div class="text-xs text-purple-500">Toca para registrar que despertaron todos</div>
      </div>
    </div>
    <span class="text-xs font-black text-white bg-purple-500 px-3 py-1.5 rounded-full shrink-0">Despertar todos</span>
  </button>` : ''}

  ${activeBlock ? `
  <div class="bg-orange-50 border-2 border-orange-200 rounded-2xl p-4 flex items-center gap-4">
    <span class="text-3xl">${activeBlock.icon}</span>
    <div class="flex-1">
      <div class="text-sm font-black text-orange-700">Es hora de: ${activeBlock.label}</div>
      <div class="text-xs text-orange-500">Registra el evento para toda el aula</div>
    </div>
    <button onclick="App.routineQuickEvent('${activeBlock.eventId}')" class="shrink-0 px-4 py-2 bg-orange-500 text-white text-xs font-black uppercase rounded-xl active:scale-95 transition-all">Registrar</button>
  </div>` : ''}

  <!-- PANEL DE EVENTOS -->
  <div>
    <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Registrar evento para toda el aula</p>
    <div class="grid grid-cols-4 sm:grid-cols-7 gap-3" id="eventsGrid">
      ${EVENTS.map(ev => {
        const done = students.some(s => _eventIsDone(_logsMap[s.id], ev));
        return `<button class="ev-btn${done?' done':''}" style="--c:${ev.color}"
          onclick="App.routineQuickEvent('${ev.id}')"
          title="${ev.label}">
          <span class="ev-icon">${ev.icon}</span>
          <span class="ev-lbl">${ev.label}</span>
        </button>`;
      }).join('')}
    </div>
  </div>

  <!-- LÍNEA DE TIEMPO DEL DÍA -->
  <div>
    <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Jornada de hoy</p>
    <div class="flex gap-3 overflow-x-auto pb-2" style="scrollbar-width:none">
      ${SCHEDULE.map(b => {
        const bh = parseInt(b.time);
        const isActive = hour >= bh && hour < bh + 2;
        return `<button onclick="App.routineQuickEvent('${b.eventId}')"
          class="block-btn shrink-0${isActive?' active-block':''}"
          style="min-width:130px;border:2px solid ${isActive?'#FF8A00':'#f1f5f9'};background:${isActive?'#FFF3E0':'white'};border-radius:16px;padding:12px 16px;display:flex;align-items:center;gap:10px;cursor:pointer;transition:all .15s">
          <span style="font-size:1.5rem">${b.icon}</span>
          <div style="text-align:left">
            <div style="font-size:.7rem;font-weight:900;color:#64748b;text-transform:uppercase">${b.time}</div>
            <div style="font-size:.85rem;font-weight:800;color:#1a2340">${b.label}</div>
          </div>
        </button>`;
      }).join('')}
    </div>
  </div>

  <!-- TARJETAS DE ESTUDIANTES -->
  <div>
    <div class="flex items-center justify-between mb-3">
      <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Reportes individuales</p>
      <button onclick="App.openBulkRoutineModal()" class="text-[10px] font-black text-blue-600 hover:underline uppercase tracking-widest">Reporte masivo</button>
    </div>
    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4" id="studentsGrid">
      ${students.map(s => _studentCard(s, _logsMap[s.id])).join('')}
    </div>
  </div>
  </div>`;

  if (window.lucide) lucide.createIcons();
}

function _eventIsDone(log, ev) {
  if (!log || !_isWithin12h(log.created_at)) return false;
  if (ev.field === 'mood')   return !!log.mood;
  if (ev.field === 'food')   return !!log.food;
  if (ev.field === 'nap')    return !!log.nap;
  if (ev.field === '_sleep') return (log.infant_data||[]).some(e => e.type==='sleep');
  if (ev.field === '_milk')  return (log.infant_data||[]).some(e => e.type==='milk');
  if (ev.field === '_diaper')return (log.infant_data||[]).some(e => e.type==='diaper');
  if (ev.field === '_bath')  return (log.infant_data||[]).some(e => e.type==='bath');
  if (ev.field === '_temp')  return (log.infant_data||[]).some(e => e.type==='temp');
  if (ev.field === '_note')  return !!log.notes;
  return false;
}

function _studentCard(s, log) {
  const valid = log && _isWithin12h(log.created_at);
  const mood  = valid && log.mood;
  const food  = valid && log.food;
  const nap   = valid && log.nap;
  const note  = valid && log.notes;
  const events = valid ? (log.infant_data||[]) : [];
  const lastEvt = events[events.length - 1];
  const lastTime = lastEvt ? new Date(lastEvt.created_at).toLocaleTimeString('es-DO',{hour:'2-digit',minute:'2-digit',hour12:true}) : null;

  const moodEmoji = {feliz:'😊',normal:'😐',triste:'😢',enojado:'😡'}[mood] || '';
  const foodEmoji = {todo:'🍽️',poco:'🍲',nada:'🙅'}[food] || '';
  const napEmoji  = {si:'💤',no:'☀️'}[nap] || '';
  const bubbles   = [moodEmoji,foodEmoji,napEmoji,note?'📝':'',events.length?'🍼':''].filter(Boolean);

  return `
  <div onclick="App.openStudentRoutine('${s.id}')"
    class="group relative bg-white rounded-[2rem] p-4 border-2 ${valid?'border-green-100':'border-slate-100'} hover:border-orange-300 hover:shadow-lg transition-all cursor-pointer active:scale-95 flex flex-col items-center text-center overflow-hidden">
    ${valid ? '<div class="absolute top-2 left-2 w-2 h-2 rounded-full bg-green-400"></div>' : ''}
    <div class="absolute top-2 right-2 flex flex-col gap-1">
      ${bubbles.slice(0,3).map(b => `<div class="w-6 h-6 bg-slate-50 rounded-full flex items-center justify-center text-xs border border-slate-100">${b}</div>`).join('')}
    </div>
    <div class="w-16 h-16 rounded-[1.25rem] bg-orange-50 border-4 border-white shadow-inner overflow-hidden mb-2 flex items-center justify-center font-black text-xl text-orange-300 group-hover:scale-110 transition-transform">
      ${s.avatar_url ? `<img src="${s.avatar_url}" class="w-full h-full object-cover">` : safeEscapeHTML(s.name.charAt(0))}
    </div>
    <h4 class="text-xs font-black text-slate-800 leading-tight line-clamp-2 mb-0.5">${safeEscapeHTML(s.name)}</h4>
    <p class="text-[9px] font-bold text-slate-400 uppercase">${s.age||''} ${s.age_type||'años'}</p>
    ${lastTime ? `<p class="text-[8px] font-black text-green-600 mt-1">Último: ${lastTime}</p>` : ''}
    <div class="flex gap-1 mt-auto pt-2">
      <div class="w-1.5 h-1.5 rounded-full ${mood?'bg-orange-400':'bg-slate-200'}"></div>
      <div class="w-1.5 h-1.5 rounded-full ${food?'bg-emerald-400':'bg-slate-200'}"></div>
      <div class="w-1.5 h-1.5 rounded-full ${nap?'bg-indigo-400':'bg-slate-200'}"></div>
    </div>
  </div>`;
}

// ── Evento Express: registra para TODA el aula en 1-3 segundos ───────────────
export async function routineQuickEvent(eventId) {
  const ev = EVENTS.find(e => e.id === eventId);
  if (!ev) return;

  const students = AppState.get('students') || [];
  const classroom = AppState.get('classroom');
  const today     = _today();

  // Eventos especiales con UI rápida
  if (ev.field === '_milk')   { return _openMilkPicker(students, today, classroom.id); }
  if (ev.field === '_temp')   { return _openTempPicker(students, today, classroom.id); }
  if (ev.field === '_note')   { return _openNotePicker(students, today, classroom.id); }
  if (ev.field === '_med')    { return _openMedPicker(students, today, classroom.id); }

  // Pañal — selector de ícono
  if (ev.field === '_diaper') {
    const isDiaper = ev.id === 'diaper_w' ? 'wet' : 'soiled';
    return _confirmAllAndSaveEvent(students, today, classroom.id, { type:'diaper', subtype: isDiaper });
  }

  // Siesta
  if (ev.field === '_sleep' && ev.value === 'start') {
    return _confirmAllAndSaveEvent(students, today, classroom.id, { type:'sleep', start_time: '__now__' });
  }
  if (ev.field === '_sleep' && ev.value === 'end') {
    return routineWakeAll();
  }

  // Baño
  if (ev.field === '_bath') {
    return _confirmAllAndSaveEvent(students, today, classroom.id, { type:'bath' });
  }

  // Eventos simples (mood, food, nap)
  return _confirmAllAndSave(students, today, classroom.id, ev);
}

// ── Confirmación "todos por defecto" ─────────────────────────────────────────
async function _confirmAllAndSave(students, today, classroomId, ev) {
  const profileName = AppState.get('profile')?.name || 'Maestra';
  const now = await _serverNow();
  const timeStr = _fmtTime(now);

  const excludedIds = new Set();

  const modalId = 'quickEvModal';
  const html = `
    <div class="bg-white rounded-[2rem] shadow-2xl w-full max-w-sm p-6 flex flex-col gap-5">
      <div class="flex items-center gap-3">
        <span style="font-size:2.5rem">${ev.icon}</span>
        <div>
          <h3 class="text-lg font-black text-slate-800">${ev.label}</h3>
          <p class="text-xs text-slate-400 font-bold">${timeStr} · ${profileName}</p>
        </div>
      </div>
      <div>
        <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Desmarca si alguien es diferente:</p>
        <div class="flex flex-wrap gap-2" id="studentChips">
          ${students.map(s => `
            <button class="schip on" data-sid="${s.id}" onclick="this.classList.toggle('on');this.classList.toggle('off')">
              <span>${s.name.split(' ')[0]}</span>
            </button>`).join('')}
        </div>
      </div>
      <div class="flex gap-3">
        <button onclick="Modal.close('${modalId}')" class="flex-1 py-3 text-slate-500 font-black text-xs uppercase border-2 border-slate-100 rounded-2xl hover:bg-slate-50">Cancelar</button>
        <button id="btnConfirmQuick" onclick="App.routineConfirmSave('${ev.field}','${ev.value}','${modalId}')"
          class="flex-2 flex-grow py-3 text-white font-black text-xs uppercase rounded-2xl active:scale-95 transition-all"
          style="background:${ev.color};flex:2">
          Confirmar
        </button>
      </div>
    </div>`;
  Modal.open(modalId, html);
}

export async function routineConfirmSave(field, value, modalId) {
  const students = AppState.get('students') || [];
  const classroom = AppState.get('classroom');
  const today = _today();
  const now = await _serverNow();
  const timeStr = _fmtTime(now);

  const chips = document.querySelectorAll('#studentChips .schip.on');
  const included = [...chips].map(c => c.dataset.sid);
  if (!included.length) { safeToast('Selecciona al menos un alumno', 'warning'); return; }

  Modal.close(modalId);
  const profile = AppState.get('profile');

  const updates = included.map(sid => {
    const existing = _logsMap[sid] || {};
    const update = {
      student_id:   parseInt(sid),
      classroom_id: classroom.id,
      date:         today,
      status:       'published',
    };
    if (field === 'mood')  update.mood = value;
    if (field === 'food')  update.food = value;
    if (field === 'nap')   update.nap  = value;
    return update;
  });

  // Guarda todos en paralelo con upsert
  const { error } = await supabase.from('daily_logs')
    .upsert(updates, { onConflict: 'student_id,date' });

  if (error) { safeToast('Error al guardar', 'error'); return; }

  // Actualiza mapa local
  included.forEach(sid => {
    if (!_logsMap[sid]) _logsMap[sid] = { student_id: parseInt(sid), date: today, infant_data:[] };
    if (field === 'mood') _logsMap[sid].mood = value;
    if (field === 'food') _logsMap[sid].food = value;
    if (field === 'nap')  _logsMap[sid].nap  = value;
    _logsMap[sid].created_at = now.toISOString();
  });

  _refreshStudentCards();
  _showUndoBar(`${EVENTS.find(e=>e.field===field&&e.value===value)?.icon||'✅'} Registrado para ${included.length} alumnos`, {
    field, value, studentIds: included.map(Number), today, classroomId: classroom.id
  });
  safeToast(`Registrado para ${included.length} alumno(s) — ${timeStr}`, 'success');
}

// ── Siesta para todos ─────────────────────────────────────────────────────────
async function _confirmAllAndSaveEvent(students, today, classroomId, eventData) {
  const now = await _serverNow();
  const timeStr = _fmtTime(now);

  const updates = await Promise.allSettled(students.map(async s => {
    const existing = _logsMap[s.id] || { infant_data: [] };
    const events   = [...(existing.infant_data || [])];

    if (eventData.type === 'sleep' && eventData.start_time === '__now__') {
      events.push({ id: crypto.randomUUID?.() || Math.random().toString(36).slice(2), type:'sleep', start_time: now.toISOString(), created_at: now.toISOString() });
    } else {
      events.push({ id: crypto.randomUUID?.() || Math.random().toString(36).slice(2), ...eventData, created_at: now.toISOString() });
    }

    return supabase.from('daily_logs').upsert({
      student_id: s.id, classroom_id: classroomId, date: today,
      infant_data: events, status: 'published'
    }, { onConflict: 'student_id,date' });
  }));

  const ok = updates.filter(r => r.status === 'fulfilled').length;
  safeToast(`${eventData.type === 'sleep' ? '😴' : '✅'} Registrado — ${timeStr}`, 'success');
  await initRoutine();
}

// ── Despertar todos ───────────────────────────────────────────────────────────
export async function routineWakeAll() {
  const students = AppState.get('students') || [];
  const classroom = AppState.get('classroom');
  const today = _today();
  const now = await _serverNow();
  const timeStr = _fmtTime(now);

  const toWake = students.filter(s => _sleepMap[s.id]);
  if (!toWake.length) { safeToast('No hay siestas abiertas', 'info'); return; }

  await Promise.allSettled(toWake.map(async s => {
    const log = _logsMap[s.id] || { infant_data: [] };
    const events = [...(log.infant_data || [])].map(e => {
      if (e.type === 'sleep' && !e.end_time) {
        const start = new Date(e.start_time);
        const diffMs = now - start;
        const h = Math.floor(diffMs / 3600000);
        const m = Math.floor((diffMs % 3600000) / 60000);
        return { ...e, end_time: now.toISOString(), duration: `${h}h ${m}m` };
      }
      return e;
    });
    return supabase.from('daily_logs').upsert(
      { student_id: s.id, classroom_id: classroom.id, date: today, infant_data: events, status:'published' },
      { onConflict: 'student_id,date' }
    );
  }));

  safeToast(`😊 ${toWake.length} alumno(s) despertaron — ${timeStr}`, 'success');
  await initRoutine();
}

// ── Selectores rápidos ────────────────────────────────────────────────────────
async function _openMilkPicker(students, today, classroomId) {
  const modalId = 'milkModal';
  Modal.open(modalId, `
    <div class="bg-white rounded-[2rem] shadow-2xl w-full max-w-xs p-6 text-center">
      <div class="text-3xl mb-2">🍼</div>
      <h3 class="text-lg font-black text-slate-800 mb-4">¿Cuántos oz?</h3>
      <div class="grid grid-cols-4 gap-3 mb-5">
        ${[2,4,6,8].map(oz => `
          <button onclick="App.routineSaveMilk(${oz},'${modalId}')"
            class="py-4 text-2xl font-black rounded-2xl border-2 border-slate-100 hover:border-blue-400 hover:bg-blue-50 active:scale-90 transition-all">
            ${oz}<span class="block text-xs font-bold text-slate-400">oz</span>
          </button>`).join('')}
      </div>
      <button onclick="Modal.close('${modalId}')" class="text-sm text-slate-400 hover:underline">Cancelar</button>
    </div>`);
}

export async function routineSaveMilk(oz, modalId) {
  const students  = AppState.get('students') || [];
  const classroom = AppState.get('classroom');
  const today     = _today();
  const now       = await _serverNow();

  Modal.close(modalId);
  await Promise.allSettled(students.map(s => {
    const events = [...(_logsMap[s.id]?.infant_data || [])];
    events.push({ id: crypto.randomUUID?.() || Math.random().toString(36).slice(2), type:'milk', oz, created_at: now.toISOString() });
    return supabase.from('daily_logs').upsert(
      { student_id: s.id, classroom_id: classroom.id, date: today, infant_data: events, status:'published' },
      { onConflict: 'student_id,date' }
    );
  }));
  safeToast(`🍼 ${oz} oz registrado — ${_fmtTime(now)}`, 'success');
  await initRoutine();
}

async function _openTempPicker(students, today, classroomId) {
  const modalId = 'tempModal';
  Modal.open(modalId, `
    <div class="bg-white rounded-[2rem] shadow-2xl w-full max-w-xs p-6 text-center">
      <div class="text-3xl mb-2">🌡</div>
      <h3 class="text-lg font-black text-slate-800 mb-4">Temperatura</h3>
      <div class="grid grid-cols-4 gap-2 mb-4">
        ${[36.4,36.5,36.6,36.7,36.8,37.0,37.5,38.0].map(t => `
          <button onclick="App.routineSaveTemp(${t},'${modalId}')"
            class="py-3 text-sm font-black rounded-2xl border-2 ${t>=37.5?'border-red-200 text-red-600':'border-slate-100'} hover:border-orange-400 hover:bg-orange-50 active:scale-90 transition-all">
            ${t}°
          </button>`).join('')}
      </div>
      <button onclick="Modal.close('${modalId}')" class="text-sm text-slate-400 hover:underline">Cancelar</button>
    </div>`);
}

export async function routineSaveTemp(temp, modalId) {
  const students  = AppState.get('students') || [];
  const classroom = AppState.get('classroom');
  const today     = _today();
  const now       = await _serverNow();
  Modal.close(modalId);
  await Promise.allSettled(students.map(s => {
    const events = [...(_logsMap[s.id]?.infant_data || [])];
    events.push({ id: crypto.randomUUID?.() || Math.random().toString(36).slice(2), type:'temp', value: temp, created_at: now.toISOString() });
    return supabase.from('daily_logs').upsert(
      { student_id: s.id, classroom_id: classroom.id, date: today, infant_data: events, status:'published' },
      { onConflict: 'student_id,date' }
    );
  }));
  safeToast(`🌡 ${temp}° registrado`, 'success');
  await initRoutine();
}

async function _openNotePicker(students, today, classroomId) {
  const modalId = 'noteModal';
  Modal.open(modalId, `
    <div class="bg-white rounded-[2rem] shadow-2xl w-full max-w-sm p-6">
      <div class="text-3xl text-center mb-2">📝</div>
      <h3 class="text-lg font-black text-slate-800 text-center mb-4">Nota para el aula</h3>
      <textarea id="quickNote" rows="3" class="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-medium outline-none focus:border-orange-400 resize-none" placeholder="Escribe una observación..."></textarea>
      <div class="flex gap-3 mt-4">
        <button onclick="Modal.close('${modalId}')" class="flex-1 py-3 text-slate-500 font-black text-xs uppercase border-2 border-slate-100 rounded-2xl">Cancelar</button>
        <button onclick="App.routineSaveNote('${modalId}')" class="flex-2 flex-grow py-3 bg-slate-700 text-white font-black text-xs uppercase rounded-2xl active:scale-95">Guardar</button>
      </div>
    </div>`);
}

export async function routineSaveNote(modalId) {
  const note = document.getElementById('quickNote')?.value?.trim();
  if (!note) return safeToast('Escribe una nota', 'warning');
  const students  = AppState.get('students') || [];
  const classroom = AppState.get('classroom');
  const today     = _today();
  const now       = await _serverNow();
  Modal.close(modalId);
  await Promise.allSettled(students.map(s =>
    supabase.from('daily_logs').upsert(
      { student_id: s.id, classroom_id: classroom.id, date: today, notes: note, status:'published' },
      { onConflict: 'student_id,date' }
    )
  ));
  safeToast('📝 Nota guardada', 'success');
  await initRoutine();
}

async function _openMedPicker(students, today, classroomId) {
  const modalId = 'medModal';
  Modal.open(modalId, `
    <div class="bg-white rounded-[2rem] shadow-2xl w-full max-w-sm p-6">
      <div class="text-3xl text-center mb-2">💊</div>
      <h3 class="text-lg font-black text-slate-800 text-center mb-4">Medicamento</h3>
      <input id="medName" type="text" class="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-medium outline-none focus:border-pink-400 mb-3" placeholder="Nombre del medicamento">
      <input id="medDose" type="text" class="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-medium outline-none focus:border-pink-400" placeholder="Dosis (ej. 5ml)">
      <div class="flex gap-3 mt-4">
        <button onclick="Modal.close('${modalId}')" class="flex-1 py-3 text-slate-500 font-black text-xs uppercase border-2 border-slate-100 rounded-2xl">Cancelar</button>
        <button onclick="App.routineSaveMed('${modalId}')" class="flex-2 flex-grow py-3 bg-pink-500 text-white font-black text-xs uppercase rounded-2xl active:scale-95">Guardar</button>
      </div>
    </div>`);
}

export async function routineSaveMed(modalId) {
  const name = document.getElementById('medName')?.value?.trim();
  const dose = document.getElementById('medDose')?.value?.trim();
  if (!name) return safeToast('Escribe el medicamento', 'warning');
  const students  = AppState.get('students') || [];
  const classroom = AppState.get('classroom');
  const today     = _today();
  const now       = await _serverNow();
  Modal.close(modalId);
  await Promise.allSettled(students.map(s => {
    const events = [...(_logsMap[s.id]?.infant_data || [])];
    events.push({ id: crypto.randomUUID?.() || Math.random().toString(36).slice(2), type:'med', name, dose: dose||'', created_at: now.toISOString() });
    return supabase.from('daily_logs').upsert(
      { student_id: s.id, classroom_id: classroom.id, date: today, infant_data: events, status:'published' },
      { onConflict: 'student_id,date' }
    );
  }));
  safeToast(`💊 ${name} registrado`, 'success');
  await initRoutine();
}

// ── Barra de deshacer ─────────────────────────────────────────────────────────
function _showUndoBar(msg, undoData) {
  document.getElementById('routine-undo-bar')?.remove();
  const bar = document.createElement('div');
  bar.id    = 'routine-undo-bar';
  bar.className = 'undo-bar';
  bar.innerHTML = `
    <span>${msg}</span>
    <div class="undo-prog"><div class="undo-fill"></div></div>
    <button onclick="App.routineUndo()" style="background:rgba(255,255,255,.15);border:none;color:white;font-weight:900;font-size:.75rem;padding:6px 12px;border-radius:10px;cursor:pointer;-webkit-tap-highlight-color:transparent">DESHACER</button>`;
  document.body.appendChild(bar);

  _pendingUndo = undoData;
  clearTimeout(_undoTimer);
  _undoTimer = setTimeout(() => {
    bar.remove();
    _pendingUndo = null;
  }, 10000);
}

export async function routineUndo() {
  document.getElementById('routine-undo-bar')?.remove();
  clearTimeout(_undoTimer);
  if (!_pendingUndo) return;

  const { field, value, studentIds, today, classroomId } = _pendingUndo;
  _pendingUndo = null;

  await Promise.allSettled(studentIds.map(sid => {
    const update = { student_id: sid, classroom_id: classroomId, date: today };
    if (field === 'mood') update.mood = null;
    if (field === 'food') update.food = null;
    if (field === 'nap')  update.nap  = null;
    return supabase.from('daily_logs')
      .update(update)
      .eq('student_id', sid)
      .eq('date', today);
  }));

  safeToast('Deshecho correctamente', 'info');
  await initRoutine();
}

// ── Actualizar tarjetas sin recargar todo ─────────────────────────────────────
function _refreshStudentCards() {
  const students = AppState.get('students') || [];
  const grid = document.getElementById('studentsGrid');
  if (!grid) return;
  grid.innerHTML = students.map(s => _studentCard(s, _logsMap[s.id])).join('');
}

// ── Modal de estudiante individual ───────────────────────────────────────────
export async function openStudentRoutine(studentId) {
  const student = (AppState.get('students') || []).find(s => s.id == studentId);
  if (!student) return;

  const today = _today();
  const { data: log } = await supabase
    .from('daily_logs')
    .select('id, student_id, date, mood, food, nap, notes, infant_data, status, created_at')
    .eq('student_id', studentId)
    .eq('date', today)
    .maybeSingle();

  const valid = log && _isWithin12h(log.created_at);
  const events = valid ? (log.infant_data || []) : [];
  const modalId = `sr_${studentId}`;

  // Timeline de eventos del día
  const evTimeline = events.map(e => {
    const t = e.created_at ? new Date(e.created_at).toLocaleTimeString('es-DO',{hour:'2-digit',minute:'2-digit',hour12:true}) : '';
    const icons = { milk:'🍼', sleep:'😴', diaper:'💧', bath:'🚽', temp:'🌡', med:'💊', note:'📝' };
    const icon  = icons[e.type] || '📌';
    let detail  = '';
    if (e.type==='milk')  detail = `${e.oz} oz`;
    if (e.type==='sleep' && e.duration) detail = `${e.duration}`;
    if (e.type==='temp')  detail = `${e.value}°`;
    if (e.type==='med')   detail = e.name;
    if (e.type==='diaper') detail = e.subtype==='wet'?'mojado':'sucio';
    return `<div class="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
      <span class="text-xl w-8 text-center">${icon}</span>
      <div class="flex-1"><span class="text-sm font-bold text-slate-700 capitalize">${e.type}</span>${detail?` <span class="text-xs text-slate-400">(${detail})</span>`:''}</div>
      <span class="text-[10px] font-bold text-slate-400">${t}</span>
    </div>`;
  }).join('') || '<p class="text-sm text-slate-400 text-center py-4">Sin eventos hoy</p>';

  Modal.open(modalId, `
    <div class="bg-white w-full max-w-sm rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
      <div class="bg-gradient-to-r from-[#28B54D] to-[#239943] p-5 text-white relative">
        <button onclick="Modal.close('${modalId}')" class="absolute top-4 right-4 p-2 bg-white/20 rounded-full"><i data-lucide="x" class="w-4 h-4"></i></button>
        <div class="flex items-center gap-3">
          <div class="w-14 h-14 rounded-2xl bg-white/20 overflow-hidden flex items-center justify-center font-black text-xl text-white">
            ${student.avatar_url ? `<img src="${student.avatar_url}" class="w-full h-full object-cover">` : safeEscapeHTML(student.name.charAt(0))}
          </div>
          <div>
            <h3 class="text-lg font-black">${safeEscapeHTML(student.name)}</h3>
            <p class="text-xs text-green-100 font-bold">${student.age||''} ${student.age_type||'años'} · Reporte del día</p>
          </div>
        </div>
      </div>
      <div class="p-5 overflow-y-auto flex-1 space-y-5">
        <!-- Estado rápido -->
        <div class="grid grid-cols-3 gap-3">
          ${[
            {label:'Ánimo', opts:{feliz:'😊',normal:'😐',triste:'😢',enojado:'😡'}, field:'mood', current: valid?log.mood:''},
            {label:'Comida', opts:{todo:'🍽️',poco:'🍲',nada:'🙅'}, field:'food', current: valid?log.food:''},
            {label:'Siesta', opts:{si:'💤',no:'☀️'}, field:'nap', current: valid?log.nap:''},
          ].map(g => `
            <div>
              <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">${g.label}</p>
              <div class="flex flex-wrap gap-1">
                ${Object.entries(g.opts).map(([v,e]) => `
                  <button onclick="App.routineSingleField(${studentId},'${g.field}','${v}','${modalId}')"
                    class="text-xl p-1.5 rounded-xl border-2 transition-all active:scale-90 ${g.current===v?'border-orange-400 bg-orange-50':'border-slate-100'}">
                    ${e}
                  </button>`).join('')}
              </div>
            </div>`).join('')}
        </div>
        <!-- Notas -->
        <div>
          <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Observaciones</p>
          <textarea id="singleNote_${studentId}" rows="2"
            class="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm outline-none focus:border-orange-400 resize-none"
            placeholder="Notas adicionales...">${valid&&log.notes ? safeEscapeHTML(log.notes):''}</textarea>
        </div>
        <!-- Timeline -->
        <div>
          <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Eventos del día</p>
          <div class="bg-slate-50 rounded-2xl p-3">${evTimeline}</div>
        </div>
      </div>
      <div class="p-5 pt-0">
        <button onclick="App.routineSaveSingle(${studentId},'${modalId}')" id="btnSaveModalRoutine"
          class="w-full py-4 text-white font-black text-xs uppercase rounded-2xl active:scale-95 transition-all flex items-center justify-center gap-2"
          style="background:#FF8A00">
          <i data-lucide="check-circle" class="w-4 h-4"></i> Guardar
        </button>
      </div>
    </div>`);

  if (window.lucide) lucide.createIcons();
}

export async function routineSingleField(studentId, field, value, modalId) {
  // Resalta visualmente el botón seleccionado
  const allBtns = document.querySelectorAll(`[onclick*="routineSingleField"][onclick*="${field}"]`);
  allBtns.forEach(b => { b.className = b.className.replace('border-orange-400 bg-orange-50','border-slate-100'); });
  const clicked = [...allBtns].find(b => b.getAttribute('onclick').includes(`'${value}'`));
  if (clicked) clicked.className = clicked.className.replace('border-slate-100','border-orange-400 bg-orange-50');
  // Guarda inmediatamente
  const today    = _today();
  const classroom = AppState.get('classroom');
  const update    = { student_id: parseInt(studentId), classroom_id: classroom.id, date: today, status:'published' };
  update[field]   = value;
  await supabase.from('daily_logs').upsert(update, { onConflict: 'student_id,date' });
  if (!_logsMap[studentId]) _logsMap[studentId] = { student_id: parseInt(studentId), date: today, infant_data:[] };
  _logsMap[studentId][field] = value;
  _logsMap[studentId].created_at = new Date().toISOString();
  _refreshStudentCards();
}

export async function routineSaveSingle(studentId, modalId) {
  const note      = document.getElementById(`singleNote_${studentId}`)?.value?.trim();
  const today     = _today();
  const classroom = AppState.get('classroom');
  if (note !== undefined) {
    await supabase.from('daily_logs').upsert(
      { student_id: parseInt(studentId), classroom_id: classroom.id, date: today, notes: note, status:'published' },
      { onConflict: 'student_id,date' }
    );
    if (_logsMap[studentId]) _logsMap[studentId].notes = note;
  }
  Modal.close(modalId);
  _refreshStudentCards();
  safeToast('Guardado', 'success');
}

// ── Reporte masivo (legacy) ───────────────────────────────────────────────────
export async function openBulkRoutineModal() {
  const students  = AppState.get('students') || [];
  const classroom = AppState.get('classroom');
  const today     = _today();
  const modalId   = 'bulkRoutine';

  Modal.open(modalId, `
    <div class="bg-white w-full max-w-sm rounded-[2rem] shadow-2xl p-6 flex flex-col gap-5">
      <h3 class="text-lg font-black text-slate-800 text-center">Reporte Masivo</h3>
      <p class="text-xs text-slate-400 text-center -mt-3">Se aplica a todos los alumnos del aula</p>
      <div class="space-y-4">
        ${[
          {label:'Ánimo',  opts:{feliz:'😊 Feliz',normal:'😐 Normal',triste:'😢 Triste'}, id:'bulk_mood'},
          {label:'Comida', opts:{todo:'🍽️ Todo',poco:'🍲 Poco',nada:'🙅 Nada'},          id:'bulk_food'},
          {label:'Siesta', opts:{si:'💤 Durmió',no:'☀️ No durmió'},                       id:'bulk_nap'},
        ].map(g => `
          <div>
            <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">${g.label}</label>
            <select id="${g.id}" class="w-full p-3 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-orange-400 bg-slate-50">
              <option value="">Sin cambio</option>
              ${Object.entries(g.opts).map(([v,l]) => `<option value="${v}">${l}</option>`).join('')}
            </select>
          </div>`).join('')}
      </div>
      <div class="flex gap-3">
        <button onclick="Modal.close('${modalId}')" class="flex-1 py-3 text-slate-500 font-black text-xs uppercase border-2 border-slate-100 rounded-2xl">Cancelar</button>
        <button onclick="App.applyBulkRoutine('${modalId}')" class="flex-2 flex-grow py-3 bg-[#28B54D] text-white font-black text-xs uppercase rounded-2xl active:scale-95">Aplicar</button>
      </div>
    </div>`);
}

export async function applyBulkRoutine(modalId) {
  const mood = document.getElementById('bulk_mood')?.value;
  const food = document.getElementById('bulk_food')?.value;
  const nap  = document.getElementById('bulk_nap')?.value;
  if (!mood && !food && !nap) { safeToast('Selecciona al menos un campo', 'warning'); return; }

  const students  = AppState.get('students') || [];
  const classroom = AppState.get('classroom');
  const today     = _today();
  const now       = new Date();

  Modal.close(modalId);
  const updates = students.map(s => {
    const u = { student_id: s.id, classroom_id: classroom.id, date: today, status:'published' };
    if (mood) u.mood = mood;
    if (food) u.food = food;
    if (nap)  u.nap  = nap;
    return u;
  });

  const { error } = await supabase.from('daily_logs').upsert(updates, { onConflict:'student_id,date' });
  if (error) return safeToast('Error al guardar', 'error');

  students.forEach(s => {
    if (!_logsMap[s.id]) _logsMap[s.id] = { student_id:s.id, date:today, infant_data:[] };
    if (mood) _logsMap[s.id].mood = mood;
    if (food) _logsMap[s.id].food = food;
    if (nap)  _logsMap[s.id].nap  = nap;
    _logsMap[s.id].created_at = now.toISOString();
  });

  _refreshStudentCards();
  safeToast(`Reporte aplicado a ${students.length} alumnos`, 'success');
}

// Alias compatibilidad con llamadas antiguas
export { openBulkRoutineModal as openNewRoutineModal };
export const saveRoutineLog          = async () => {};
export const updateRoutineField      = async () => {};
export const registerInfantEvent     = async () => {};
export const saveInfantEntry         = async () => {};
export const updateRoutineFieldInModal = routineSingleField;
export const saveRoutineInModal      = routineSaveSingle;
export const openStudentRoutine_old  = openStudentRoutine;
