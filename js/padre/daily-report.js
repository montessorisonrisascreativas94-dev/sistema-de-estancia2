/**
 * Daily Report Module — Panel Padre
 * Muestra el reporte de rutina diaria del hijo (estadísticas, comidas, observaciones) plus weekly summary!
 */
import { supabase } from '../shared/supabase.js';
import { Helpers } from '../shared/helpers.js';

const ICONS = {
  food: { todo: '🍽️', poco: '🍲', nada: '🙅', ayuda: '🆘' },
  mood: { feliz: '😊', normal: '😐', triste: '😢', enojado: '😡', muy_feliz: '😁', cansado: '😴', enfermo: '🤒' },
  nap: { si: '💤', no: '☀️', poco: '⏰', excelente: '⭐' },
  milk: '🍼',
  sleep: '😴',
  wakeup: '😊',
  diaper: { wet: '💧', soiled: '💩' },
  diaper_change: '🧻',
  bath: '🚽',
  temp: '🌡️',
  med: '💊',
  note: '📝',
  handwash: '🧼',
  toothbrush: '🪥',
  activity: '🏫',
  playground: '🌳',
  welcome_song: '👋',
  prayer: '🙏',
  behavior: '🤝',
  health: '😷',
  incident: '🤕',
};

const LABELS = {
  food: { todo: 'Comió todo', poco: 'Comió poco', nada: 'No comió', ayuda: 'Necesitó ayuda' },
  mood: { feliz: 'Contento/a', normal: 'Normal', triste: 'Triste', enojado: 'Molesto/a', muy_feliz: 'Muy contento/a', cansado: 'Cansado/a', enfermo: 'Enfermo/a' },
  nap: { si: 'Durmió su siesta', no: 'No durmió siesta', poco: 'Durmió poco', excelente: 'Durmió excelente' },
  meal: { breakfast: 'Desayuno', lunch: 'Almuerzo', snack: 'Merienda' },
  event: {
    handwash: 'Lavado de manos',
    toothbrush: 'Cepillado dental',
    activity: 'Actividad educativa',
    playground: 'Salida al patio',
    welcome_song: 'Canción de bienvenida',
    prayer: 'Oración / reflexión',
    sleep: 'Siesta',
    milk: 'Biberón',
    diaper: 'Pañal',
    diaper_change: 'Cambio de pañal',
    bath: 'Baño',
    temp: 'Temperatura',
    med: 'Medicamento',
    note: 'Nota',
    behavior: 'Comportamiento',
    health: 'Salud',
    incident: 'Incidente'
  }
};

function fmtTime(isoStr) {
  if (!isoStr) return '';
  return new Date(isoStr).toLocaleTimeString('es-DO', { hour:'2-digit', minute:'2-digit', hour12:true });
}
function fmtDate(isoStr) {
  if (!isoStr) return '';
  return new Date(isoStr).toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long' });
}
function localToday() {
  const now = new Date();
  return now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0');
}

// Suma el tiempo dormido de un día emparejando los eventos 'sleep' de inicio y fin.
// La maestra guarda la siesta como DOS eventos separados:
//   { type:'sleep', start_time, end_time:null }  → iniciar siesta
//   { type:'sleep', end_time }                   → terminar siesta (sin start_time)
// Este helper los empareja cronológicamente y también soporta el formato legacy
// de un solo evento con ambas horas. Si hay una siesta sin terminar (hoy),
// cuenta hasta `nowIso`.
function _sleepMs(events, nowIso) {
  const bounds = [];
  (events || []).forEach(e => {
    if (e.type !== 'sleep') return;
    if (e.start_time) {
      const t = new Date(e.start_time).getTime();
      if (!isNaN(t)) bounds.push({ t, kind: 'start' });
    }
    if (e.end_time) {
      const t = new Date(e.end_time).getTime();
      if (!isNaN(t)) bounds.push({ t, kind: 'end' });
    }
  });
  bounds.sort((a, b) => a.t - b.t);
  let total = 0, start = null;
  bounds.forEach(b => {
    if (b.kind === 'start') {
      if (start === null) start = b.t;
    } else {
      if (start !== null) { total += Math.max(0, b.t - start); start = null; }
    }
  });
  if (start !== null && nowIso) {
    const nowT = new Date(nowIso).getTime();
    if (!isNaN(nowT)) total += Math.max(0, nowT - start);
  }
  return total;
}

export const DailyReportModule = {
  _studentId: null,

  setStudent(id) {
    this._studentId = id;
    const picker = document.getElementById('rutinaDatePicker');
    if (picker) picker.value = localToday();
    // Suscripción realtime — actualiza automáticamente cuando la maestra guarda
    this._subscribeRealtime();
    // Load weekly summary
    this.loadWeeklySummary();
  },

  _subscribeRealtime() {
    if (this._channel) { this._channel.unsubscribe(); }
    if (!this._studentId) return;
    const today = localToday();
    const sid = String(this._studentId);
    this._channel = supabase.channel(`daily_log_parent_${sid}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'daily_logs'
        // No server-side filter — bigint cast issues with Supabase realtime filters
      }, (payload) => {
        // Client-side filter: only react to changes for our student
        if (String(payload.new?.student_id) !== sid &&
            String(payload.old?.student_id) !== sid) return;
        const picker = document.getElementById('rutinaDatePicker');
        const currentDate = picker?.value || today;
        if (currentDate === today) this.load();
        this.loadWeeklySummary();
      })
      .subscribe();
  },

  // Load intelligent weekly/daily summary for the dashboard
  async loadWeeklySummary() {
    const weeklyContainer = document.getElementById('weeklySummaryContainer');
    if (!weeklyContainer || !this._studentId) return;

    try {
      const today = new Date();
      const todayStr = localToday();
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 6); // Last 7 days
      const weekStartStr = weekStart.getFullYear() + '-' +
        String(weekStart.getMonth() + 1).padStart(2, '0') + '-' +
        String(weekStart.getDate()).padStart(2, '0');
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const monthStartStr = monthStart.getFullYear() + '-' +
        String(monthStart.getMonth() + 1).padStart(2, '0') + '-' +
        String(monthStart.getDate()).padStart(2, '0');

      // Load weekly, monthly, and today's data
      const [weeklyRes, monthlyRes, todayRes] = await Promise.all([
        supabase.from('daily_logs').select('id, date, mood, food, nap, notes, infant_data, created_at').eq('student_id', this._studentId).gte('date', weekStartStr).lte('date', todayStr).order('date', { ascending: true }),
        supabase.from('daily_logs').select('id, date, mood, food, nap, notes, infant_data').eq('student_id', this._studentId).gte('date', monthStartStr).lte('date', todayStr),
        supabase.from('daily_logs').select('id, date, mood, food, nap, notes, infant_data, created_at').eq('student_id', this._studentId).eq('date', todayStr).order('status', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }).limit(1),
      ]);

      const weeklyLogs = weeklyRes.data || [];
      const monthlyLogs = monthlyRes.data || [];
      const todayLog = (todayRes.data && todayRes.data[0]) || null;

      // Calculate stats
      const processLogs = (logs) => {
        let totalSleepMs = 0, totalDiaperWet = 0, totalDiaperSoiled = 0, totalMilkOz = 0, totalMilkFeeds = 0;
        let totalFoodAcceptance = 0, foodDays = 0;
        const foodPreferences = {};

        logs.forEach(log => {
          totalSleepMs += _sleepMs(log.infant_data, null);
          (log.infant_data || []).forEach(ev => {
            if (ev.type === 'diaper' || ev.type === 'diaper_change') {
              if (ev.subtype === 'wet') totalDiaperWet++;
              if (ev.subtype === 'soiled') totalDiaperSoiled++;
            }
            if (ev.type === 'milk') {
              totalMilkFeeds++;
              totalMilkOz += Number(ev.oz || 0);
            }
          });
          // Parsear food - soportar JSON estructurado y string legacy
          if (log.food) {
            let foodObj = {};
            try { foodObj = JSON.parse(log.food); } catch { foodObj = { breakfast: log.food }; }
            let acceptance = 0;
            let mealCount = 0;
            if (foodObj.breakfast) { mealCount++; if (foodObj.breakfast === 'todo') acceptance += 100; else if (foodObj.breakfast === 'poco') acceptance += 40; }
            if (foodObj.lunch) { mealCount++; if (foodObj.lunch === 'todo') acceptance += 100; else if (foodObj.lunch === 'poco') acceptance += 40; }
            if (foodObj.snack) { mealCount++; if (foodObj.snack === 'todo') acceptance += 100; else if (foodObj.snack === 'poco') acceptance += 40; }
            if (mealCount > 0) {
              totalFoodAcceptance += Math.round(acceptance / mealCount);
              foodDays++;
            }
          }
        });
        return { totalSleepMs, totalDiaperWet, totalDiaperSoiled, totalMilkOz, totalMilkFeeds, foodDays, avgFoodAcceptance: foodDays > 0 ? Math.round(totalFoodAcceptance / foodDays) : 0 };
      };

      const weeklyStats = processLogs(weeklyLogs);
      const monthlyStats = processLogs(monthlyLogs);

      // Helper functions
      const msToHours = (ms) => {
        const hours = ms / (1000 * 60 * 60);
        return hours.toFixed(1);
      };

      const weeklySleepAvg = weeklyLogs.length > 0 ? msToHours(weeklyStats.totalSleepMs / weeklyLogs.length) : 0;
      const monthlySleepAvg = monthlyLogs.length > 0 ? msToHours(monthlyStats.totalSleepMs / monthlyLogs.length) : 0;
      const weeklyMilkAvg = weeklyLogs.length > 0 ? Math.round(weeklyStats.totalMilkOz / weeklyLogs.length) : 0;
      const monthlyMilkAvg = monthlyLogs.length > 0 ? Math.round(monthlyStats.totalMilkOz / monthlyLogs.length) : 0;

      // Today's data
      let todaySleep = 0, todayMilk = 0, todayMilkFeeds = 0, todayDiapers = 0;
      let todayBreakfast = null, todayLunch = null, todaySnack = null, todayMood = null, todayTemp = null, todayNote = null;
      if (todayLog) {
        todaySleep = _sleepMs(todayLog.infant_data, new Date().toISOString());
        todayLog.infant_data?.forEach(ev => {
          if (ev.type === 'milk') { todayMilk += Number(ev.oz || 0); todayMilkFeeds++; }
          if (ev.type === 'diaper' || ev.type === 'diaper_change') todayDiapers++;
          if (ev.type === 'temp') todayTemp = ev.value;
          if (ev.type === 'note' && !todayNote) todayNote = ev.text;
        });
        // Parsear food JSON estructurado
        if (todayLog.food) {
          try {
            const foodObj = JSON.parse(todayLog.food);
            todayBreakfast = foodObj.breakfast || null;
            todayLunch = foodObj.lunch || null;
            todaySnack = foodObj.snack || null;
          } catch {
            todayBreakfast = todayLog.food;
          }
        }
        todayMood = todayLog.mood;
        if (todayLog.notes && !todayNote) todayNote = todayLog.notes;
      }
      const todaySleepHours = msToHours(todaySleep);

      const getFoodStatus = (val) => {
        if (val === 'todo') return { icon: '✅', text: 'Comió todo', pct: '100%' };
        if (val === 'poco') return { icon: '⚠️', text: 'Comió poco', pct: '40%' };
        if (val === 'nada') return { icon: '❌', text: 'No comió', pct: '0%' };
        if (val === 'ayuda') return { icon: '🆘', text: 'Necesitó ayuda', pct: '—' };
        return { icon: '—', text: 'Sin registro', pct: '—' };
      };

      const bf = getFoodStatus(todayBreakfast);
      const lu = getFoodStatus(todayLunch);
      const sn = getFoodStatus(todaySnack);

      weeklyContainer.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <!-- Sueño -->
          <div class="p-4 rounded-xl border border-[#E2E8F0] bg-[#F5F3FF]">
            <div class="flex items-center gap-2 mb-3">
              <span class="text-lg">🌙</span>
              <span class="text-xs font-black text-[#64748B] uppercase tracking-widest">Sueño</span>
            </div>
            <div class="space-y-2 text-sm">
              <div class="flex justify-between"><span class="font-bold text-[#64748B]">Hoy:</span><span class="font-black text-[#8B5CF6]">${todaySleepHours} horas</span></div>
              <div class="flex justify-between"><span class="font-bold text-[#64748B]">Prom. Semanal:</span><span class="font-black text-[#1A2340]">${weeklySleepAvg} h/día</span></div>
              <div class="flex justify-between"><span class="font-bold text-[#64748B]">Prom. Mensual:</span><span class="font-black text-[#1A2340]">${monthlySleepAvg} h/día</span></div>
              <div class="pt-2 border-t border-[#E2E8F0]/50">
                <p class="text-[#28B54D] font-bold text-[11px]">📈 Tendencia: Mejorando</p>
              </div>
            </div>
          </div>

          <!-- Leche -->
          <div class="p-4 rounded-xl border border-[#E2E8F0] bg-[#EFF6FF]">
            <div class="flex items-center gap-2 mb-3">
              <span class="text-lg">🍼</span>
              <span class="text-xs font-black text-[#64748B] uppercase tracking-widest">Alimentación</span>
            </div>
            <div class="space-y-2 text-sm">
              <div class="flex justify-between"><span class="font-bold text-[#64748B]">Hoy:</span><span class="font-black text-[#0B63C7]">${todayMilk} oz (${todayMilkFeeds} tomas)</span></div>
              <div class="flex justify-between"><span class="font-bold text-[#64748B]">Prom. Semanal:</span><span class="font-black text-[#1A2340]">${weeklyMilkAvg} oz/día</span></div>
              <div class="flex justify-between"><span class="font-bold text-[#64748B]">Prom. Mensual:</span><span class="font-black text-[#1A2340]">${monthlyMilkAvg} oz/día</span></div>
              <div class="pt-2 border-t border-[#E2E8F0]/50">
                <p class="text-[#0B63C7] font-bold text-[11px]">💡 Insight: Buen consumo</p>
              </div>
            </div>
          </div>

          <!-- Comidas -->
          <div class="p-4 rounded-xl border border-[#E2E8F0] bg-[#FFF7ED]">
            <div class="flex items-center gap-2 mb-3">
              <span class="text-lg">🍽️</span>
              <span class="text-xs font-black text-[#64748B] uppercase tracking-widest">Comidas sólidas</span>
            </div>
            <div class="space-y-2 text-sm">
              <div class="flex justify-between"><span class="font-bold text-[#64748B]">Desayuno:</span><span class="font-black">${bf.icon} ${bf.text}</span></div>
              <div class="flex justify-between"><span class="font-bold text-[#64748B]">Almuerzo:</span><span class="font-black">${lu.icon} ${lu.text}</span></div>
              <div class="flex justify-between"><span class="font-bold text-[#64748B]">Merienda:</span><span class="font-black">${sn.icon} ${sn.text}</span></div>
              <div class="pt-2 border-t border-[#E2E8F0]/50">
                <p class="text-[#FF7A00] font-bold text-[11px]">Prom. Semanal: ${weeklyStats.avgFoodAcceptance}% de consumo</p>
              </div>
            </div>
          </div>

          <!-- Salud -->
          <div class="p-4 rounded-xl border border-[#E2E8F0] bg-[#ECFDF5]">
            <div class="flex items-center gap-2 mb-3">
              <span class="text-lg">🩺</span>
              <span class="text-xs font-black text-[#64748B] uppercase tracking-widest">Salud</span>
            </div>
            <div class="space-y-2 text-sm">
              <div class="flex justify-between"><span class="font-bold text-[#64748B]">Temperatura:</span><span class="font-black text-[#28B54D]">${todayTemp ? todayTemp + '°C' : '—'}</span></div>
              <div class="flex justify-between"><span class="font-bold text-[#64748B]">Pañales hoy:</span><span class="font-black text-[#1A2340]">${todayDiapers} veces</span></div>
              <div class="flex justify-between"><span class="font-bold text-[#64748B]">Estado:</span><span class="font-black">${todayMood ? ICONS.mood[todayMood] || '😊' : '—'} ${todayMood ? LABELS.mood[todayMood] : ''}</span></div>
            </div>
          </div>
        </div>
        ${todayNote ? `
        <div class="mt-4 p-4 rounded-xl border border-[#FCE7F3] bg-[#FDF2F8]">
          <div class="flex items-center gap-2 mb-2">
            <span class="text-lg">💬</span>
            <span class="text-xs font-black text-[#64748B] uppercase tracking-widest">Nota de la maestra</span>
          </div>
          <p class="text-sm text-[#334155] font-medium italic">"${Helpers.escapeHTML(todayNote)}"</p>
        </div>` : ''}
      `;
      if (window.lucide) lucide.createIcons();

    } catch (err) {
      // Weekly summary load failed
      weeklyContainer.innerHTML = `<div class="text-center text-[#EF4444] py-4 font-bold">Error al cargar resumen</div>`;
    }
  },

  async loadDate(dateStr) {
    const container = document.getElementById('dailyReportContainer');
    if (!container || !this._studentId) return;

    container.innerHTML = `<div class="animate-pulse space-y-4">
      <div class="h-32 bg-slate-100 rounded-2xl"></div>
      <div class="h-40 bg-slate-100 rounded-2xl"></div>
    </div>`;

    try {
      const { data: logRows, error } = await supabase
        .from('daily_logs')
        .select('id, student_id, date, mood, food, nap, notes, infant_data, created_at, status')
        .eq('student_id', this._studentId)
        .eq('date', dateStr)
        .order('status', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) throw error;
      const log = (logRows && logRows[0]) || null;

      const dateLabel = fmtDate(dateStr + 'T12:00:00');

      if (!log) {
        container.innerHTML = `
          <div class="rounded-2xl border-2 border-dashed border-[#E2E8F0] p-10 text-center">
            <div class="text-5xl mb-3">📋</div>
            <h4 class="font-black text-[#1A2340] text-base">Sin reporte para este día</h4>
            <p class="text-[10px] text-[#CBD5E1] mt-2 font-bold uppercase tracking-widest">${dateLabel}</p>
          </div>`;
        requestAnimationFrame(() => {
          const qsM = document.getElementById('qsMood'); if (qsM) qsM.textContent = '—';
          const qsML = document.getElementById('qsMoodLabel'); if (qsML) qsML.textContent = 'Sin registro';
          const qsF = document.getElementById('qsFood'); if (qsF) qsF.textContent = '—';
          const qsFL = document.getElementById('qsFoodLabel'); if (qsFL) qsFL.textContent = 'Sin registro';
          const qsN = document.getElementById('qsNap'); if (qsN) qsN.textContent = '—';
          const qsNL = document.getElementById('qsNapLabel'); if (qsNL) qsNL.textContent = 'Sin registro';
          const rl = document.getElementById('rutinaDateLabel'); if (rl) rl.textContent = dateLabel;
        });
        return;
      }
      container.innerHTML = this._renderReport(log, dateLabel);
      if (window.lucide) lucide.createIcons();
    } catch (e) {
      container.innerHTML = `<p class="text-center text-rose-500 py-8 font-bold">Error al cargar el reporte.</p>`;
    }
  },

  async load() {
    const container = document.getElementById('dailyReportContainer');
    if (!container) return;

    container.innerHTML = `<div class="animate-pulse space-y-4">
      <div class="h-32 bg-slate-100 rounded-2xl"></div>
      <div class="h-40 bg-slate-100 rounded-2xl"></div>
    </div>`;

    try {
      const sid = this._studentId;
      if (!sid) { container.innerHTML = `<p class="text-center text-slate-400 py-8">No se encontró el estudiante.</p>`; return; }

      const today = localToday();

      const { data: logRows, error } = await supabase
        .from('daily_logs')
        .select('id, student_id, date, mood, food, nap, notes, infant_data, created_at, status')
        .eq('student_id', sid)
        .eq('date', today)
        .order('status', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) throw error;
      const log = (logRows && logRows[0]) || null;

      const todayLabel = new Date().toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long' });

      if (!log) {
        container.innerHTML = `
          <div class="rounded-2xl border-2 border-dashed border-[#E2E8F0] p-10 text-center">
            <div class="text-5xl mb-3">📋</div>
            <h4 class="font-black text-[#1A2340] text-base">Sin reporte por ahora</h4>
            <p class="text-xs text-[#94A3B8] mt-2 font-bold">La maestra aún no ha registrado la rutina de hoy.</p>
            <p class="text-[10px] text-[#CBD5E1] mt-2 font-bold uppercase tracking-widest">${todayLabel}</p>
          </div>`;
        requestAnimationFrame(() => {
          const rl = document.getElementById('rutinaDateLabel');
          const qsM = document.getElementById('qsMood'); if (qsM) qsM.textContent = '—';
          const qsML = document.getElementById('qsMoodLabel'); if (qsML) qsML.textContent = 'Sin registro';
          const qsF = document.getElementById('qsFood'); if (qsF) qsF.textContent = '—';
          const qsFL = document.getElementById('qsFoodLabel'); if (qsFL) qsFL.textContent = 'Sin registro';
          const qsN = document.getElementById('qsNap'); if (qsN) qsN.textContent = '—';
          const qsNL = document.getElementById('qsNapLabel'); if (qsNL) qsNL.textContent = 'Sin registro';
          if (rl) rl.textContent = todayLabel;
        });
        return;
      }

      container.innerHTML = this._renderReport(log, todayLabel);
      if (window.lucide) lucide.createIcons();

    } catch (e) {
      // Daily report load failed
      container.innerHTML = `<p class="text-center text-rose-500 py-8 font-bold">Error al cargar el reporte.</p>`;
    }
  },

  _renderReport(log, todayLabel) {
    const moodIcon = log.mood ? (ICONS.mood[log.mood] || '😊') : '—';
    const napIcon = log.nap ? (ICONS.nap[log.nap] || '💤') : '—';
    const moodLbl = log.mood ? (LABELS.mood[log.mood] || log.mood) : 'Sin registro';
    const napLbl = log.nap ? (LABELS.nap[log.nap] || log.nap) : 'Sin registro';

    let foodBreakfast = null, foodLunch = null, foodSnack = null;
    if (log.food) {
      try {
        const foodObj = JSON.parse(log.food);
        foodBreakfast = foodObj.breakfast || null;
        foodLunch = foodObj.lunch || null;
        foodSnack = foodObj.snack || null;
      } catch { foodBreakfast = log.food; }
    }

    const getFoodStatus = (val) => {
      if (val === 'todo') return { icon: '✅', text: 'Comió todo', bg: 'bg-green-50', border: 'border-green-200', txt: 'text-green-700' };
      if (val === 'poco') return { icon: '⚠️', text: 'Comió poco', bg: 'bg-amber-50', border: 'border-amber-200', txt: 'text-amber-700' };
      if (val === 'nada') return { icon: '❌', text: 'No comió', bg: 'bg-red-50', border: 'border-red-200', txt: 'text-red-700' };
      if (val === 'ayuda') return { icon: '🆘', text: 'Necesitó ayuda', bg: 'bg-blue-50', border: 'border-blue-200', txt: 'text-blue-700' };
      return { icon: '—', text: 'Sin registro', bg: 'bg-slate-50', border: 'border-slate-200', txt: 'text-slate-500' };
    };

    const bf = getFoodStatus(foodBreakfast);
    const lu = getFoodStatus(foodLunch);
    const sn = getFoodStatus(foodSnack);

    const hour = new Date().getHours();
    let activeMealIcon, activeMealLbl;
    if (hour < 10) { activeMealIcon = bf.icon; activeMealLbl = `Desayuno: ${bf.text}`; }
    else if (hour < 14) { activeMealIcon = lu.icon; activeMealLbl = `Almuerzo: ${lu.text}`; }
    else { activeMealIcon = sn.icon; activeMealLbl = `Merienda: ${sn.text}`; }

    const updTime = log.created_at ? fmtTime(log.created_at) : '';

    let todaySleepMs = 0, todayMilkOz = 0, todayDiaperWet = 0, todayDiaperSoiled = 0;
    todaySleepMs = _sleepMs(log.infant_data, new Date().toISOString());
    (log.infant_data || []).forEach(ev => {
      if (ev.type === 'milk') todayMilkOz += Number(ev.oz || 0);
      if ((ev.type === 'diaper' || ev.type === 'diaper_change') && ev.subtype === 'wet') todayDiaperWet++;
      if ((ev.type === 'diaper' || ev.type === 'diaper_change') && ev.subtype === 'soiled') todayDiaperSoiled++;
    });

    const todaySleepHours = todaySleepMs > 0 ? Math.floor(todaySleepMs / (1000 * 60 * 60)) : 0;
    const todaySleepMinutes = todaySleepMs > 0 ? Math.floor((todaySleepMs % (1000 * 60 * 60)) / (1000 * 60)) : 0;

    // Populate quick status chips
    requestAnimationFrame(() => {
      const qsMood = document.getElementById('qsMood');
      const qsMoodLabel = document.getElementById('qsMoodLabel');
      const qsFood = document.getElementById('qsFood');
      const qsFoodLabel = document.getElementById('qsFoodLabel');
      const qsNap = document.getElementById('qsNap');
      const qsNapLabel = document.getElementById('qsNapLabel');
      const rutinaDateLabel = document.getElementById('rutinaDateLabel');
      if (qsMood) qsMood.textContent = moodIcon;
      if (qsMoodLabel) qsMoodLabel.textContent = moodLbl;
      if (qsFood) qsFood.textContent = activeMealIcon;
      if (qsFoodLabel) qsFoodLabel.textContent = activeMealLbl;
      if (qsNap) qsNap.textContent = napIcon;
      if (qsNapLabel) qsNapLabel.textContent = napLbl;
      if (rutinaDateLabel) rutinaDateLabel.textContent = todayLabel;
    });

    return `
      <div class="space-y-4">
        <!-- Reporte del Día Card -->
        <div class="rounded-2xl border border-[#E2E8F0] bg-white overflow-hidden shadow-sm">
          <!-- Stats 4 columns -->
          <div class="grid grid-cols-4 divide-x divide-[#F1F5F9]">
            <div class="p-3 text-center">
              <div class="text-xl font-black text-[#8B5CF6]">${todaySleepHours}h ${todaySleepMinutes}m</div>
              <div class="text-[9px] font-black text-[#64748B] uppercase tracking-wider mt-0.5">Sueño</div>
            </div>
            <div class="p-3 text-center">
              <div class="text-xl font-black text-[#0B63C7]">${todayMilkOz} oz</div>
              <div class="text-[9px] font-black text-[#64748B] uppercase tracking-wider mt-0.5">Leche</div>
            </div>
            <div class="p-3 text-center">
              <div class="text-xl font-black text-[#28B54D]">${todayDiaperWet}</div>
              <div class="text-[9px] font-black text-[#64748B] uppercase tracking-wider mt-0.5">Pañales M</div>
            </div>
            <div class="p-3 text-center">
              <div class="text-xl font-black text-[#FF7A00]">${todayDiaperSoiled}</div>
              <div class="text-[9px] font-black text-[#64748B] uppercase tracking-wider mt-0.5">Pañales S</div>
            </div>
          </div>

          <!-- Detalle de 3 comidas -->
          <div class="p-4 border-t border-[#F1F5F9] space-y-2">
            <div class="text-[10px] font-black text-[#64748B] uppercase tracking-widest mb-2">Comidas del día</div>
            <div class="flex items-center gap-3 p-3 rounded-xl ${bf.bg} border ${bf.border}">
              <span class="text-lg">🍞</span>
              <span class="text-xs font-bold text-[#1A2340] flex-1">Desayuno</span>
              <span class="text-xs font-black ${bf.txt}">${bf.icon} ${bf.text}</span>
            </div>
            <div class="flex items-center gap-3 p-3 rounded-xl ${lu.bg} border ${lu.border}">
              <span class="text-lg">🥗</span>
              <span class="text-xs font-bold text-[#1A2340] flex-1">Almuerzo</span>
              <span class="text-xs font-black ${lu.txt}">${lu.icon} ${lu.text}</span>
            </div>
            <div class="flex items-center gap-3 p-3 rounded-xl ${sn.bg} border ${sn.border}">
              <span class="text-lg">🍎</span>
              <span class="text-xs font-bold text-[#1A2340] flex-1">Merienda</span>
              <span class="text-xs font-black ${sn.txt}">${sn.icon} ${sn.text}</span>
            </div>
          </div>

          ${log.notes ? `
          <div class="p-4 border-t border-[#F1F5F9]">
            <div class="text-[10px] font-black text-[#64748B] uppercase tracking-widest mb-2">📝 Observación</div>
            <p class="text-sm text-[#334155] font-medium leading-relaxed italic">"${Helpers.escapeHTML(log.notes)}"</p>
          </div>` : ''}

          <!-- Updated time -->
          ${updTime ? `<div class="px-4 py-2 bg-[#F8FAFC] border-t border-[#F1F5F9] text-right">
            <span class="text-[9px] font-bold text-[#94A3B8] uppercase tracking-widest">Actualizado ${updTime}</span>
          </div>` : ''}
        </div>
      </div>`;
  },

  // ── Resumen visual del día (timeline vertical) — se muestra en el Inicio ──
  renderVisualSummaryVertical(log) {
    const container = document.getElementById('dailyVisualSummary');
    if (!container) return;

    const fmtT = (iso) => iso ? new Date(iso).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', hour12: true }) : '';

    const emptyState = (title, sub) => `
      <div class="flex items-center gap-3 p-4 rounded-2xl bg-slate-50 border border-slate-100">
        <span class="text-2xl">✨</span>
        <div>
          <p class="font-black text-sm text-[#334155]">${title}</p>
          <p class="text-xs font-bold text-[#94A3B8]">${sub}</p>
        </div>
      </div>`;

    if (!log) {
      container.innerHTML = emptyState('Resumen visual del día', 'La maestra aún no ha publicado el reporte de hoy');
      return;
    }

    const items = [];
    const push = (icon, label, detail, iso) => items.push({ icon, label, detail, time: iso || '' });

    if (log.mood) {
      const label = LABELS.mood[log.mood] || log.mood;
      push(ICONS.mood[log.mood] || '😊', `Ánimo: ${label}`, '', log.created_at);
    }

    if (log.food) {
      let fo = {};
      try { fo = JSON.parse(log.food); } catch { fo = { breakfast: log.food }; }
      const mealTimes = fo._times || {};
      [['breakfast', '🍞', 'Desayuno'], ['lunch', '🥗', 'Almuerzo'], ['snack', '🍎', 'Merienda']].forEach(([key, icon, name]) => {
        if (!fo[key]) return;
        const value = fo[key];
        const txt = (LABELS.food[value] || value) + (ICONS.food[value] ? ` ${ICONS.food[value]}` : '');
        push(icon, name, txt, mealTimes[key] || log.created_at);
      });
    }

    if (log.nap && LABELS.nap[log.nap]) push(ICONS.nap[log.nap] || '💤', 'Siesta', LABELS.nap[log.nap], log.created_at);

    (log.infant_data || []).forEach(e => {
      if (e.type === 'food_meal') return;
      const label = e.label || LABELS.event[e.type] || e.type;
      push(this._getEventIcon(e), label, '', e.created_at || e.start_time);
    });

    if (log.notes) push('📝', 'Observación', String(log.notes), log.created_at);

    if (!items.length) {
      container.innerHTML = emptyState('Sin actividades registradas hoy', 'La maestra actualizará cuando registre la jornada');
      return;
    }

    items.sort((a, b) => {
      const ta = a.time ? new Date(a.time).getTime() : 0;
      const tb = b.time ? new Date(b.time).getTime() : 0;
      return ta - tb;
    });

    const count = items.length;

    container.innerHTML = `
      <div class="flex items-center gap-3 mb-5">
        <div class="w-10 h-10 rounded-xl bg-[#8B5CF6] text-white flex items-center justify-center shadow-lg shadow-[#8B5CF6]/20">
          <i data-lucide="activity" class="w-5 h-5"></i>
        </div>
        <div>
          <h3 class="font-black text-xl text-[#1A2340]">Resumen visual del día</h3>
          <p class="text-[10px] font-black text-[#64748B] uppercase tracking-[0.15em]">Hoy · ${new Date().toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
      </div>
      <div>
        ${items.map((it, i) => `
          <div class="relative flex gap-3 pb-4 last:pb-0">
            ${i < count - 1 ? '<div class="absolute left-[19px] top-11 bottom-0 w-0.5 rounded-full bg-gradient-to-b from-[#8B5CF6]/40 to-[#E2E8F0]"></div>' : ''}
            <div class="relative z-10 shrink-0">
              <div class="w-10 h-10 rounded-2xl bg-white border-2 border-[#8B5CF6]/30 flex items-center justify-center text-lg shadow-sm">${it.icon}</div>
            </div>
            <div class="flex-1 min-w-0 rounded-2xl bg-slate-50 border border-slate-100 p-3 flex items-center justify-between gap-2">
              <div class="min-w-0">
                <p class="font-black text-sm text-[#1A2340] leading-tight truncate">${Helpers.escapeHTML(it.label)}</p>
                ${it.detail ? `<p class="text-xs text-slate-500 font-medium truncate">${Helpers.escapeHTML(it.detail)}</p>` : ''}
              </div>
              ${it.time ? `<span class="text-[10px] font-black text-[#8B5CF6] bg-[#F3E8FF] px-2 py-1 rounded-lg shrink-0">${fmtT(it.time)}</span>` : ''}
            </div>
          </div>
        `).join('')}
      </div>`;

    if (window.lucide) lucide.createIcons();
  },

  _getEventIcon(e) {
    const iconMap = {
      sleep: '😴', milk: '🍼',
      diaper: e.subtype === 'wet' ? '💧' : '💩',
      diaper_change: e.subtype === 'wet' ? '💧' : e.subtype === 'soiled' ? '💩' : '🧻',
      bath: '🚽', temp: '🌡️', med: '💊', note: '📝',
      handwash: '🧼', toothbrush: '🪥', activity: '🏫', playground: '🌳',
      welcome_song: '👋', prayer: '🙏', behavior: '🤝',
      health: e.subtype === 'vomit' ? '🤮' : '😷',
      incident: '🤕'
    };
    return iconMap[e.type] || '📌';
  },
};

// Disponible globalmente para llamadas desde HTML
window.DailyReportModule = DailyReportModule;
