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
  const startDate = new Date(start);
  const endDate = end ? new Date(end) : new Date();
  const diffMs = endDate - startDate;
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
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- 🌙 ANÁLISIS DE SUEÑO -->
          <div class="cloud-card p-5">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center shadow-lg shadow-purple-200 text-xl">🌙</div>
              <h4 class="font-black text-lg text-[#1A2340]">Análisis de Sueño</h4>
            </div>
            <div class="space-y-3 text-sm">
              <div class="flex justify-between"><span class="font-bold text-[#64748B]">Hoy:</span><span class="font-black text-[#8B5CF6]">${todaySleepHours} horas</span></div>
              <div class="flex justify-between"><span class="font-bold text-[#64748B]">Promedio Semanal:</span><span class="font-black text-[#1A2340]">${weeklySleepAvg} horas/día</span></div>
              <div class="flex justify-between"><span class="font-bold text-[#64748B]">Promedio Mensual:</span><span class="font-black text-[#1A2340]">${monthlySleepAvg} horas/día</span></div>
              <div class="pt-2 border-t border-slate-100">
                <p class="text-[#28B54D] font-bold flex items-center gap-2">📈 Tendencia: Mejorando</p>
              </div>
            </div>
          </div>

          <!-- 🍼 ANÁLISIS DE BIBERÓN -->
          <div class="cloud-card p-5">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 text-white flex items-center justify-center shadow-lg shadow-blue-200 text-xl">🍼</div>
              <h4 class="font-black text-lg text-[#1A2340]">Análisis de Alimentación</h4>
            </div>
            <div class="space-y-3 text-sm">
              <div class="flex justify-between"><span class="font-bold text-[#64748B]">Hoy:</span><span class="font-black text-[#0B63C7]">${todayMilk} oz (${todayMilkFeeds} tomas)</span></div>
              <div class="flex justify-between"><span class="font-bold text-[#64748B]">Promedio Semanal:</span><span class="font-black text-[#1A2340]">${weeklyMilkAvg} oz/día</span></div>
              <div class="flex justify-between"><span class="font-bold text-[#64748B]">Promedio Mensual:</span><span class="font-black text-[#1A2340]">${monthlyMilkAvg} oz/día</span></div>
              <div class="pt-2 border-t border-slate-100">
                <p class="text-[#0B63C7] font-bold flex items-center gap-2">💡 Insight: Buen consumo</p>
              </div>
            </div>
          </div>

          <!-- 🍽️ ANÁLISIS DE COMIDAS SÓLIDAS -->
          <div class="cloud-card p-5">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white flex items-center justify-center shadow-lg shadow-orange-200 text-xl">🍽️</div>
              <h4 class="font-black text-lg text-[#1A2340]">Análisis de Comidas</h4>
            </div>
            <div class="space-y-2 text-sm">
              <div class="flex justify-between"><span class="font-bold text-[#64748B]">Desayuno:</span><span class="font-black">${bf.icon} ${bf.text} (${bf.pct})</span></div>
              <div class="flex justify-between"><span class="font-bold text-[#64748B]">Almuerzo:</span><span class="font-black">${lu.icon} ${lu.text} (${lu.pct})</span></div>
              <div class="flex justify-between"><span class="font-bold text-[#64748B]">Merienda:</span><span class="font-black">${sn.icon} ${sn.text} (${sn.pct})</span></div>
              <div class="pt-2 border-t border-slate-100">
                <p class="text-[#FF7A00] font-bold">Promedio Semanal: ${weeklyStats.avgFoodAcceptance}% de consumo</p>
              </div>
            </div>
          </div>

          <!-- 🩺 SALUD Y BIENESTAR -->
          <div class="cloud-card p-5">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-500 text-white flex items-center justify-center shadow-lg shadow-green-200 text-xl">🩺</div>
              <h4 class="font-black text-lg text-[#1A2340]">Salud y Bienestar</h4>
            </div>
            <div class="space-y-3 text-sm">
              <div class="flex justify-between"><span class="font-bold text-[#64748B]">Temperatura:</span><span class="font-black text-[#28B54D]">${todayTemp ? todayTemp + '°C (Normal)' : '—'}</span></div>
              <div class="flex justify-between"><span class="font-bold text-[#64748B]">Pañales hoy:</span><span class="font-black text-[#1A2340]">${todayDiapers} veces</span></div>
              <div class="flex justify-between"><span class="font-bold text-[#64748B]">Estado:</span><span class="font-black text-[#FFD43B]">${todayMood ? ICONS.mood[todayMood] || '😊' : '—'} ${todayMood ? LABELS.mood[todayMood] : ''}</span></div>
            </div>
          </div>
        </div>
        ${todayNote ? `
        <!-- 📝 NOTAS DE LA MAESTRA -->
        <div class="cloud-card p-5 mt-6">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-10 h-10 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-500 text-white flex items-center justify-center shadow-lg shadow-pink-200 text-xl">💬</div>
            <h4 class="font-black text-lg text-[#1A2340]">Notas de la Maestra</h4>
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
          <div class="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-10 text-center">
            <div class="text-5xl mb-3">📋</div>
            <h4 class="font-black text-slate-600 text-lg">Sin reporte para este día</h4>
            <p class="text-xs text-slate-300 mt-3 font-bold uppercase tracking-wider capitalize">${dateLabel}</p>
          </div>`;
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

      const todayLabel = fmtDate(new Date().toLocaleString());

      if (!log) {
        container.innerHTML = `
          <div class="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-10 text-center">
            <div class="text-5xl mb-3">📋</div>
            <h4 class="font-black text-slate-600 text-lg">Sin reporte por ahora</h4>
            <p class="text-sm text-slate-400 mt-1">La maestra aún no ha registrado la rutina de hoy.</p>
            <p class="text-xs text-slate-300 mt-3 font-bold uppercase tracking-wider">${todayLabel}</p>
          </div>`;
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
    // ── Resumen rápido ──────────────────────────────────────────────
    const moodIcon = log.mood ? (ICONS.mood[log.mood] || '😊') : '—';
    const napIcon = log.nap ? (ICONS.nap[log.nap] || '💤') : '—';
    const moodLbl = log.mood ? (LABELS.mood[log.mood] || log.mood) : 'Sin registro';
    const napLbl = log.nap ? (LABELS.nap[log.nap] || log.nap) : 'Sin registro';

    // Parsear food - soportar JSON estructurado y string legacy
    let foodBreakfast = null, foodLunch = null, foodSnack = null;
    if (log.food) {
      try {
        const foodObj = JSON.parse(log.food);
        foodBreakfast = foodObj.breakfast || null;
        foodLunch = foodObj.lunch || null;
        foodSnack = foodObj.snack || null;
      } catch {
        // Legacy: string simple
        foodBreakfast = log.food;
      }
    }

    const getFoodStatus = (val) => {
      if (val === 'todo') return { icon: '✅', text: 'Comió todo', pct: '100%' };
      if (val === 'poco') return { icon: '⚠️', text: 'Comió poco', pct: '40%' };
      if (val === 'nada') return { icon: '❌', text: 'No comió', pct: '0%' };
      if (val === 'ayuda') return { icon: '🆘', text: 'Necesitó ayuda', pct: '—' };
      return { icon: '—', text: 'Sin registro', pct: '—' };
    };

    const bf = getFoodStatus(foodBreakfast);
    const lu = getFoodStatus(foodLunch);
    const sn = getFoodStatus(foodSnack);

    // Resumen de comidas: mostrar la más relevante según hora
    const hour = new Date().getHours();
    let activeMealIcon, activeMealLbl;
    if (hour < 10) { activeMealIcon = bf.icon; activeMealLbl = 'Desayuno: ' + bf.text; }
    else if (hour < 14) { activeMealIcon = lu.icon; activeMealLbl = 'Almuerzo: ' + lu.text; }
    else { activeMealIcon = sn.icon; activeMealLbl = 'Merienda: ' + sn.text; }

    const updTime = log.created_at ? fmtTime(log.created_at) : '';

    // ── Calculate today's stats ─────────────────────────────────────
    let todaySleepMs = 0;
    let todayMilkOz = 0;
    let todayDiaperWet = 0;
    let todayDiaperSoiled = 0;

    (log.infant_data || []).forEach(ev => {
      if (ev.type === 'sleep' && ev.end_time) {
        const dur = calculateDuration(ev.start_time, ev.end_time);
        todaySleepMs += dur.totalMs;
      }
      if (ev.type === 'milk' && ev.oz) todayMilkOz += Number(ev.oz);
      if (ev.type === 'diaper' && ev.subtype === 'wet') todayDiaperWet++;
      if (ev.type === 'diaper' && ev.subtype === 'soiled') todayDiaperSoiled++;
    });

    const todaySleepHours = Math.floor(todaySleepMs / (1000 * 60 * 60));
    const todaySleepMinutes = Math.floor((todaySleepMs % (1000 * 60 * 60)) / (1000 * 60));

    // ── Timeline de eventos (infant_data) ───────────────────────────
    const events = log.infant_data || [];
    const timeline = events.map(e => this._renderEvent(e)).join('');

    return `
      <style>
        .dr-card{background:white;border-radius:20px;border:1px solid #f1f5f9;box-shadow:0 2px 12px rgba(0,0,0,.04);overflow:hidden}
        .dr-timeline-item{display:flex;align-items:flex-start;gap:14px;padding:14px 0;border-bottom:1px solid #f8fafc}
        .dr-timeline-item:last-child{border:none}
        .dr-dot{width:36px;height:36px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0;background:#f8fafc}
        .dr-summary-chip{display:flex;align-items:center;gap:8px;padding:12px 16px;border-radius:16px;background:#f8fafc;border:1px solid #f1f5f9}
        .dr-meal-row{display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:10px;background:#fafafa}
      </style>

      <div class="space-y-5">
        <!-- Header del reporte -->
        <div class="dr-card">
          <div class="bg-gradient-to-r from-[#28B54D] to-[#1A8035] p-4 text-white flex items-center justify-between">
            <div>
              <div class="font-black text-lg leading-tight">Reporte del Día</div>
              <div class="text-xs text-green-100 font-bold capitalize">${todayLabel}</div>
            </div>
            <div class="text-right">
              <div class="text-xs text-green-100 font-bold">Última actualización</div>
              <div class="font-black text-sm">${updTime}</div>
            </div>
          </div>

          <!-- Resumen 3 indicadores -->
          <div class="grid grid-cols-3 divide-x divide-slate-100 p-2">
            <div class="dr-summary-chip flex-col text-center rounded-none border-0 bg-transparent">
              <span class="text-2xl">${moodIcon}</span>
              <span class="text-[9px] font-black text-slate-400 uppercase tracking-wider mt-1">Ánimo</span>
              <span class="text-xs font-bold text-slate-600">${moodLbl}</span>
            </div>
            <div class="dr-summary-chip flex-col text-center rounded-none border-0 bg-transparent">
              <span class="text-2xl">${activeMealIcon}</span>
              <span class="text-[9px] font-black text-slate-400 uppercase tracking-wider mt-1">Alimentación</span>
              <span class="text-xs font-bold text-slate-600">${activeMealLbl}</span>
            </div>
            <div class="dr-summary-chip flex-col text-center rounded-none border-0 bg-transparent">
              <span class="text-2xl">${napIcon}</span>
              <span class="text-[9px] font-black text-slate-400 uppercase tracking-wider mt-1">Siesta</span>
              <span class="text-xs font-bold text-slate-600">${napLbl}</span>
            </div>
          </div>

          <!-- Today's Stats -->
          <div class="p-4 border-t border-slate-100 grid grid-cols-2 md:grid-cols-4 gap-3">
            <div class="text-center">
              <div class="text-lg font-black text-[#8B5CF6]">${todaySleepHours}h ${todaySleepMinutes}m</div>
              <div class="text-[9px] font-bold text-slate-400 uppercase">Sueño hoy</div>
            </div>
            <div class="text-center">
              <div class="text-lg font-black text-[#0B63C7]">${todayMilkOz} oz</div>
              <div class="text-[9px] font-bold text-slate-400 uppercase">Leche hoy</div>
            </div>
            <div class="text-center">
              <div class="text-lg font-black text-[#0B63C7]">${todayDiaperWet}</div>
              <div class="text-[9px] font-bold text-slate-400 uppercase">Pañales mojados</div>
            </div>
            <div class="text-center">
              <div class="text-lg font-black text-[#FF7A00]">${todayDiaperSoiled}</div>
              <div class="text-[9px] font-bold text-slate-400 uppercase">Pañales sucios</div>
            </div>
          </div>

          <!-- Detalle de comidas -->
          <div class="p-4 border-t border-slate-100 space-y-2">
            <div class="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">Detalle de comidas</div>
            <div class="dr-meal-row">
              <span class="text-lg">🍞</span>
              <span class="text-xs font-bold text-slate-600 flex-1">Desayuno</span>
              <span class="text-xs font-black ${bf.icon==='✅'?'text-green-600':bf.icon==='❌'?'text-red-600':'text-slate-500'}">${bf.icon} ${bf.text}</span>
            </div>
            <div class="dr-meal-row">
              <span class="text-lg">🥗</span>
              <span class="text-xs font-bold text-slate-600 flex-1">Almuerzo</span>
              <span class="text-xs font-black ${lu.icon==='✅'?'text-green-600':lu.icon==='❌'?'text-red-600':'text-slate-500'}">${lu.icon} ${lu.text}</span>
            </div>
            <div class="dr-meal-row">
              <span class="text-lg">🍎</span>
              <span class="text-xs font-bold text-slate-600 flex-1">Merienda</span>
              <span class="text-xs font-black ${sn.icon==='✅'?'text-green-600':sn.icon==='❌'?'text-red-600':'text-slate-500'}">${sn.icon} ${sn.text}</span>
            </div>
          </div>
        </div>

        ${log.notes ? `
        <div class="dr-card p-4 flex items-start gap-3">
          <span class="text-xl mt-0.5">📝</span>
          <div>
            <div class="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Observación de la maestra</div>
            <p class="text-sm font-medium text-slate-700 leading-relaxed">${Helpers.escapeHTML(log.notes)}</p>
          </div>
        </div>` : ''}

        ${events.length > 0 ? `
        <div class="dr-card p-4">
          <div class="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            🕐 Timeline de eventos
          </div>
          <div class="space-y-0">${timeline}</div>
        </div>` : ''}

        <!-- VISUAL TIMELINE — Línea de tiempo visual del día -->
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
      <div class="dr-card p-4 mt-2">
        <div class="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          📊 Resumen visual del día
        </div>
        <div style="overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;padding:8px 0">
          <div style="display:flex;align-items:flex-start;gap:0;min-width:max-content;position:relative;padding:0 8px">
            <div style="position:absolute;top:18px;left:20px;right:20px;height:3px;background:#e2e8f0;border-radius:2px;z-index:0"></div>
            ${allEvents.map((ev, i) => `
              ${i > 0 ? '<div style="width:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0;padding-top:14px"><div style="width:100%;height:2px;border-radius:2px;background:#28B54D40"></div></div>' : ''}
              <div style="display:flex;flex-direction:column;align-items:center;min-width:60px;max-width:68px;position:relative;z-index:1;padding:0 2px">
                <div style="width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.1rem;border:2px solid #28B54D;background:white;flex-shrink:0">${ev.icon}</div>
                <span style="font-size:.5rem;font-weight:900;text-transform:uppercase;color:#64748b;text-align:center;line-height:1.2;margin-top:4px;max-width:64px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${Helpers.escapeHTML(ev.label)}</span>
                <span style="font-size:.45rem;font-weight:700;color:#94a3b8;margin-top:1px">${fmtTime(ev.time)}</span>
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
        } else {
          detail = 'En siesta...';
        }
        break;
      case 'diaper':
        icon = e.subtype === 'wet' ? '💧' : '💩';
        label = e.subtype === 'wet' ? 'Pañal mojado' : 'Pañal sucio'; break;
      case 'diaper_change':
        icon = '🧻'; label = 'Cambio de pañal'; break;
      case 'bath':
        icon = '🚽'; label = 'Fue al baño'; break;
      case 'temp':
        icon = '🌡️'; label = 'Temperatura';
        detail = e.value ? `${e.value}°` : '';
        if (e.value >= 38) detail += ' ⚠ Fiebre';
        break;
      case 'med':
        icon = '💊'; label = 'Medicamento';
        detail = [e.name, e.dose].filter(Boolean).join(' — '); break;
      case 'note':
        icon = '📝'; label = 'Nota'; detail = e.text || ''; break;
      case 'handwash':
        icon = '🧼'; label = 'Lavado de manos'; break;
      case 'toothbrush':
        icon = '🪥'; label = 'Cepillado dental'; break;
      case 'activity':
        icon = '🏫'; label = 'Actividad educativa'; break;
      case 'playground':
        icon = '🌳'; label = 'Salida al patio'; break;
      case 'welcome_song':
        icon = '👋'; label = 'Canción de bienvenida'; break;
      case 'prayer':
        icon = '🙏'; label = 'Oración / reflexión'; break;
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
          if (catLabels && e.data[e.category]) {
            detail = catLabels[e.data[e.category]] || e.data[e.category];
          }
        }
        break;
      default:
        label = eventLabel; break;
    }

    const autoTag = e.auto ? '<span class="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600 ml-1">AUTO</span>' : '';

    return `
    <div class="dr-timeline-item">
      <div class="dr-dot">${icon}</div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center justify-between gap-2">
          <span class="text-sm font-black text-slate-700">${Helpers.escapeHTML(label)}${autoTag}</span>
          <span class="text-[10px] font-bold text-slate-400 shrink-0">${time}</span>
        </div>
        ${detail ? `<p class="text-xs text-slate-500 mt-0.5">${Helpers.escapeHTML(detail)}</p>` : ''}
      </div>
    </div>`;
  },
};

// Disponible globalmente para llamadas desde HTML
window.DailyReportModule = DailyReportModule;
