/**
 * Daily Report Module — Panel Padre
 * Muestra el reporte de rutina diaria del hijo con timeline de eventos y horas, plus weekly summary!
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

// Helper to calculate duration between two ISO times
function calculateDuration(start, end) {
  if (!start) return { hours: 0, minutes: 0, totalMs: 0 };
  const startDate = new Date(start);
  if (isNaN(startDate.getTime())) return { hours: 0, minutes: 0, totalMs: 0 };
  const endDate = end ? new Date(end) : new Date();
  const diffMs = Math.max(0, endDate - startDate);
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  return { hours, minutes, totalMs: diffMs };
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
    this._channel = supabase.channel(`daily_log_${this._studentId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'daily_logs',
        filter: `student_id=eq.${this._studentId}`
      }, () => {
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
        supabase.from('daily_logs').select('id, date, mood, food, nap, notes, infant_data, created_at').eq('student_id', this._studentId).eq('date', todayStr).maybeSingle(),
      ]);

      const weeklyLogs = weeklyRes.data || [];
      const monthlyLogs = monthlyRes.data || [];
      const todayLog = todayRes.data;

      // Calculate stats
      const processLogs = (logs) => {
        let totalSleepMs = 0, totalDiaperWet = 0, totalDiaperSoiled = 0, totalMilkOz = 0, totalMilkFeeds = 0;
        let totalFoodAcceptance = 0, foodDays = 0;
        const sleepTimes = [];
        const foodPreferences = {};

        logs.forEach(log => {
          (log.infant_data || []).forEach(ev => {
            if (ev.type === 'sleep' && ev.end_time) {
              const dur = calculateDuration(ev.start_time, ev.end_time);
              totalSleepMs += dur.totalMs;
              sleepTimes.push({ start: ev.start_time, end: ev.end_time });
            }
            if (ev.type === 'diaper') {
              if (ev.subtype === 'wet') totalDiaperWet++;
              if (ev.subtype === 'soiled') totalDiaperSoiled++;
            }
            if (ev.type === 'milk' && ev.oz) {
              totalMilkOz += Number(ev.oz);
              totalMilkFeeds++;
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
        return { totalSleepMs, totalDiaperWet, totalDiaperSoiled, totalMilkOz, totalMilkFeeds, foodDays, avgFoodAcceptance: foodDays > 0 ? Math.round(totalFoodAcceptance / foodDays) : 0, sleepTimes };
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
        todayLog.infant_data?.forEach(ev => {
          if (ev.type === 'sleep' && ev.end_time) {
            const dur = calculateDuration(ev.start_time, ev.end_time);
            todaySleep += dur.totalMs;
          }
          if (ev.type === 'milk' && ev.oz) { todayMilk += Number(ev.oz); todayMilkFeeds++; }
          if (ev.type === 'diaper') todayDiapers++;
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
      const { data: log } = await supabase
        .from('daily_logs')
        .select('id, student_id, date, mood, food, nap, notes, infant_data, created_at, status')
        .eq('student_id', this._studentId)
        .eq('date', dateStr)
        .eq('status', 'published')
        .maybeSingle();

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

      const { data: log, error } = await supabase
        .from('daily_logs')
        .select('id, student_id, date, mood, food, nap, notes, infant_data, created_at, status')
        .eq('student_id', sid)
        .eq('date', today)
        .eq('status', 'published')
        .maybeSingle();

      if (error) throw error;

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
    (log.infant_data || []).forEach(ev => {
      if (ev.type === 'sleep' && ev.end_time) { todaySleepMs += calculateDuration(ev.start_time, ev.end_time).totalMs; }
      if (ev.type === 'milk' && ev.oz) todayMilkOz += Number(ev.oz);
      if (ev.type === 'diaper' && ev.subtype === 'wet') todayDiaperWet++;
      if (ev.type === 'diaper' && ev.subtype === 'soiled') todayDiaperSoiled++;
    });

    const todaySleepHours = todaySleepMs > 0 ? Math.floor(todaySleepMs / (1000 * 60 * 60)) : 0;
    const todaySleepMinutes = todaySleepMs > 0 ? Math.floor((todaySleepMs % (1000 * 60 * 60)) / (1000 * 60)) : 0;

    const events = log.infant_data || [];

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

    const timeline = events.map(e => this._renderEvent(e)).join('');

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

        ${events.length > 0 ? `
        <!-- Timeline de eventos -->
        <div class="rounded-2xl border border-[#E2E8F0] bg-white overflow-hidden shadow-sm">
          <div class="p-4 border-b border-[#F1F5F9]">
            <div class="text-[10px] font-black text-[#64748B] uppercase tracking-widest flex items-center gap-2">
              <span class="w-5 h-5 rounded-lg bg-[#28B54D]/10 flex items-center justify-center">🕐</span>
              Timeline de eventos (${events.length})
            </div>
          </div>
          <div class="p-4">${timeline}</div>
        </div>` : ''}

        <!-- Visual Timeline -->
        ${this._renderVisualTimeline(log)}
      </div>`;
  },

  _renderVisualTimeline(log) {
    const events = log.infant_data || [];
    if (events.length === 0) return '';

    // Build a visual horizontal timeline like the teacher's
    const sortedEvents = [...events].sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : (a.start_time ? new Date(a.start_time).getTime() : 0);
      const tb = b.created_at ? new Date(b.created_at).getTime() : (b.start_time ? new Date(b.start_time).getTime() : 0);
      return ta - tb;
    });

    // Add food events to timeline
    const foodEvents = [];
    if (log.food) {
      try {
        const foodObj = JSON.parse(log.food);
        if (foodObj.breakfast) foodEvents.push({ type: 'food_meal', meal: 'breakfast', value: foodObj.breakfast, time: log.created_at });
        if (foodObj.lunch) foodEvents.push({ type: 'food_meal', meal: 'lunch', value: foodObj.lunch, time: log.created_at });
        if (foodObj.snack) foodEvents.push({ type: 'food_meal', meal: 'snack', value: foodObj.snack, time: log.created_at });
      } catch {}
    }

    // Add mood event
    if (log.mood) {
      foodEvents.push({ type: 'mood', value: log.mood, time: log.created_at });
    }

    // Combine all into visual timeline
    const allEvents = [
      ...foodEvents.map(e => ({
        icon: e.type === 'mood' ? (ICONS.mood[e.value] || '😊') : e.meal === 'breakfast' ? '🍞' : e.meal === 'lunch' ? '🥗' : '🍎',
        label: e.type === 'mood' ? `Llegó ${LABELS.mood[e.value] || ''}` : `${LABELS.meal[e.meal]}: ${LABELS.food[e.value] || e.value}`,
        time: e.time
      })),
      ...sortedEvents.map(e => ({
        icon: this._getEventIcon(e),
        label: e.label || LABELS.event[e.type] || e.type,
        time: e.created_at || e.start_time
      }))
    ].sort((a, b) => {
      const ta = a.time ? new Date(a.time).getTime() : 0;
      const tb = b.time ? new Date(b.time).getTime() : 0;
      return ta - tb;
    });

    if (allEvents.length === 0) return '';

    return `
      <div class="rounded-2xl border border-[#E2E8F0] bg-white overflow-hidden shadow-sm">
        <div class="p-4 border-b border-[#F1F5F9]">
          <div class="text-[10px] font-black text-[#64748B] uppercase tracking-widest flex items-center gap-2">
            <span class="w-5 h-5 rounded-lg bg-[#8B5CF6]/10 flex items-center justify-center">📊</span>
            Resumen visual del día
          </div>
        </div>
        <div class="p-4" style="overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch">
          <div style="display:flex;align-items:flex-start;gap:0;min-width:max-content;position:relative;padding:0 8px">
            <div style="position:absolute;top:18px;left:20px;right:20px;height:3px;background:linear-gradient(90deg,#E2E8F0,#CBD5E1,#E2E8F0);border-radius:2px;z-index:0"></div>
            ${allEvents.map((ev, i) => `
              ${i > 0 ? '<div style="width:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;padding-top:14px"><div style="width:100%;height:2px;border-radius:2px;background:linear-gradient(90deg,#28B54D30,#28B54D60,#28B54D30)"></div></div>' : ''}
              <div style="display:flex;flex-direction:column;align-items:center;min-width:60px;max-width:68px;position:relative;z-index:1;padding:0 2px">
                <div style="width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.1rem;border:2.5px solid #28B54D;background:white;flex-shrink:0;box-shadow:0 2px 8px rgba(40,181,77,0.15)">${ev.icon}</div>
                <span style="font-size:.55rem;font-weight:900;text-transform:uppercase;color:#1A2340;text-align:center;line-height:1.2;margin-top:5px;max-width:64px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${Helpers.escapeHTML(ev.label)}</span>
                <span style="font-size:.5rem;font-weight:700;color:#94A3B8;margin-top:1px">${fmtTime(ev.time)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  },

  _getEventIcon(e) {
    const iconMap = {
      sleep: '😴', milk: '🍼',
      diaper: e.subtype === 'wet' ? '💧' : '💩',
      diaper_change: '🧻',
      bath: '🚽', temp: '🌡️', med: '💊', note: '📝',
      handwash: '🧼', toothbrush: '🪥', activity: '🏫', playground: '🌳',
      welcome_song: '👋', prayer: '🙏', behavior: '🤝',
      health: e.subtype === 'vomit' ? '🤮' : '😷',
      incident: '🤕'
    };
    return iconMap[e.type] || '📌';
  },

  _renderEvent(e) {
    const time = e.created_at ? fmtTime(e.created_at) : (e.start_time ? fmtTime(e.start_time) : '');
    const eventLabel = e.label || LABELS.event[e.type] || e.type;
    let icon = '📌', label = eventLabel, detail = '';

    switch (e.type) {
      case 'milk':
        icon = '🍼'; label = 'Biberón'; detail = e.oz ? `${e.oz} oz` : ''; break;
      case 'sleep':
        icon = '😴'; label = e.label || 'Durmió';
        if (e.end_time) {
          const dur = e.duration || '';
          detail = dur ? `Siesta de ${dur}` : `Despertó: ${fmtTime(e.end_time)}`;
        } else { detail = 'En siesta...'; }
        break;
      case 'diaper':
        icon = e.subtype === 'wet' ? '💧' : '💩';
        label = e.subtype === 'wet' ? 'Pañal mojado' : 'Pañal sucio'; break;
      case 'diaper_change': icon = '🧻'; label = 'Cambio de pañal'; break;
      case 'bath': icon = '🚽'; label = 'Fue al baño'; break;
      case 'temp':
        icon = '🌡️'; label = 'Temperatura';
        detail = e.value ? `${e.value}°` : '';
        if (e.value >= 38) detail += ' ⚠ Fiebre';
        break;
      case 'med':
        icon = '💊'; label = 'Medicamento';
        detail = [e.name, e.dose].filter(Boolean).join(' — '); break;
      case 'note': icon = '📝'; label = 'Nota'; detail = e.text || ''; break;
      case 'handwash': icon = '🧼'; label = 'Lavado de manos'; break;
      case 'toothbrush': icon = '🪥'; label = 'Cepillado dental'; break;
      case 'activity': icon = '🏫'; label = 'Actividad educativa'; break;
      case 'playground': icon = '🌳'; label = 'Salida al patio'; break;
      case 'welcome_song': icon = '👋'; label = 'Canción de bienvenida'; break;
      case 'prayer': icon = '🙏'; label = 'Oración / reflexión'; break;
      case 'behavior':
        icon = '🤝'; label = e.label || 'Comportamiento';
        if (e.category && e.data) {
          const behaviorLabels = {
            social: { shared: 'Compartió con compañeros', alone: 'Jugó solo', group: 'Participó en grupo', emotional_support: 'Necesitó apoyo emocional' },
            classroom: { attention: 'Prestó atención', participation: 'Participó activamente', curiosity: 'Mostró curiosidad', completed: 'Terminó actividades', needed_help: 'Necesitó ayuda constante' },
            emotional: { controlled: 'Controló emociones', frustrated: 'Se frustró fácilmente', crying: 'Lloró por separación', anxious: 'Mostró ansiedad', calmed: 'Se calmó rápidamente' },
            montessori: { manipulation: 'Manipulación de materiales', fine_motor: 'Motricidad fina', gross_motor: 'Motricidad gruesa', language: 'Lenguaje', concentration: 'Concentración', autonomy: 'Autonomía' }
          };
          const catLabels = behaviorLabels[e.category];
          if (catLabels && e.data[e.category]) detail = catLabels[e.data[e.category]] || e.data[e.category];
        }
        break;
      default: label = eventLabel; break;
    }

    const autoTag = e.auto ? '<span class="text-[8px] font-black px-1.5 py-0.5 rounded-full bg-[#0B63C7]/10 text-[#0B63C7] ml-1">AUTO</span>' : '';

    return `
    <div class="flex items-start gap-3 py-3 border-b border-[#F8FAFC] last:border-none">
      <div class="w-10 h-10 rounded-xl bg-[#F8FAFC] flex items-center justify-center text-lg flex-shrink-0">${icon}</div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs font-black text-[#1A2340]">${Helpers.escapeHTML(label)}${autoTag}</span>
          <span class="text-[10px] font-bold text-[#94A3B8] shrink-0">${time}</span>
        </div>
        ${detail ? `<p class="text-[11px] text-[#64748B] mt-0.5 font-medium">${Helpers.escapeHTML(detail)}</p>` : ''}
      </div>
    </div>`;
  },
};

// Disponible globalmente para llamadas desde HTML
window.DailyReportModule = DailyReportModule;
