import { supabase } from '../../shared/supabase.js';
import { AppState } from '../state.js';
import { QueryCache } from '../../shared/query-cache.js';
import { dedupeClassrooms } from '../../shared/constants.js';

export const DashboardModule = {
  _chart: null,

  async init() {
    const dateEl = document.getElementById('dashboardDate');
    const updateDate = () => {
      if (dateEl) {
        dateEl.textContent = new Date().toLocaleDateString('es-DO', {
          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        });
      }
    };
    updateDate();
    // Update date at midnight
    const msUntilMidnight = () => {
      const now = new Date();
      const midnight = new Date(now); midnight.setHours(24,0,0,0);
      return midnight - now;
    };
    if (this._dateInterval) clearInterval(this._dateInterval);
    if (this._dateTimeout) clearTimeout(this._dateTimeout);
    this._dateTimeout = setTimeout(() => { updateDate(); this._dateInterval = setInterval(updateDate, 86400000); }, msUntilMidnight());

    await Promise.all([
      this.loadStats(),
      this.loadUnreadMessages(),
      this.loadPreregBadge(),
    ]);
  },

  async loadStats() {
      try {
        const today = new Date().toISOString().split('T')[0];

        // Stale-while-revalidate: mostrar datos cacheados inmediatamente, revalidar en background
        const cachedStats = QueryCache.getStale(
          'asis_dashboard_stats',
          async () => {
            const [studentsRes, attendanceRes, classroomsRes, teachersRes] = await Promise.allSettled([
              supabase.from('students').select('*', { count: 'exact', head: true }),
              supabase.from('attendance').select('*', { count: 'exact', head: true })
                .eq('date', today).in('status', ['present', 'presente']),
              supabase.from('classrooms').select('id, name, level').is('deleted_at', null).limit(200),
              supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'maestra'),
            ]);
            const get = (r) => r.status === 'fulfilled' ? r.value : {};
            const clsRaw = get(classroomsRes).data || [];
            return {
              studentsCount:   get(studentsRes).count  || 0,
              attendanceCount: get(attendanceRes).count || 0,
              classroomsCount: dedupeClassrooms(clsRaw).length,
              teachersCount:   get(teachersRes).count  || 0,
            };
          },
          2 * 60_000,
          (fresh) => this._applyStats(fresh)
        );

        if (cachedStats) this._applyStats(cachedStats);

      } catch (e) {
        console.error('Error loading stats:', e);
      }
    }
,

  _applyStats({ studentsCount, attendanceCount, classroomsCount, teachersCount }) {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('statStudents',   studentsCount);
    set('statAttendance', attendanceCount);
    set('statClassrooms', classroomsCount);
    set('statTeachers', teachersCount);
    set('welcomeName',    (AppState.get('profile')?.name || 'Asistente').split(' ')[0]);
    this._renderUrgentAlerts(attendanceCount);
  },

  _renderUrgentAlerts(attendanceToday) {
    const container = document.getElementById('urgentAlertsWidget');
    if (!container) return;

    const alerts = [];

    if (attendanceToday > 0) {
      alerts.push({
        title: `Actividad de hoy`,
        desc: `${attendanceToday} estudiantes ya ingresaron a la estancia.`,
        icon: 'users',
        color: 'amber',
        section: 'accesos'
      });
    }

    if (alerts.length === 0) {
      container.classList.add('hidden');
      return;
    }

    container.classList.remove('hidden');
    container.innerHTML = alerts.map(a => `
      <div onclick="window.App.navigateTo('${a.section}')" class="bg-${a.color}-50 border border-${a.color}-100 p-4 rounded-2xl flex items-start gap-4 cursor-pointer hover:shadow-md transition-all group">
        <div class="w-10 h-10 rounded-xl bg-${a.color}-500 text-white flex items-center justify-center shrink-0 shadow-lg shadow-${a.color}-200 group-hover:scale-110 transition-transform">
          <i data-lucide="${a.icon}" class="w-5 h-5"></i>
        </div>
        <div>
          <h4 class="text-sm font-black text-${a.color}-900">${a.title}</h4>
          <p class="text-xs text-${a.color}-700/70 font-bold mt-0.5">${a.desc}</p>
        </div>
      </div>
    `).join('');

    if (window.lucide) lucide.createIcons();
  },

  async loadUnreadMessages() {
    const countEl = document.getElementById('dashUnreadMessages');
    if (!countEl) return;
    try {
      let total = 0;
      // UnreadMessages ya tiene el total reconciled contra la BD.
      if (window.UnreadMessages) {
        total = window.UnreadMessages.getTotal();
      } else {
        // El RPC se declaraba RETURNS jsonb (objeto), así que este
        // Array.isArray() era false y el contador salía siempre en 0.
        // Se aceptan las dos formas.
        const { data: unreadData } = await supabase.rpc('get_unread_counts');
        if (Array.isArray(unreadData)) {
          unreadData.forEach(r => { total += Number(r.unread ?? r.count ?? 0); });
        } else if (unreadData && typeof unreadData === 'object') {
          for (const [k, v] of Object.entries(unreadData)) {
            if (k === 'total') continue;
            total += Number(v);
          }
        }
      }
      countEl.textContent = total > 99 ? '99+' : String(total);
      const wrap = countEl.closest('.unread-wrap');
      if (wrap) wrap.classList.toggle('has-unread', total > 0);
    } catch (_) {}
  },

  // ── Badge de pre-inscripciones pendientes en quick-access button ──────────
  async loadPreregBadge() {
    try {
      const { count } = await supabase
        .from('student_preregistrations')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      const b = document.getElementById('badge-dashboard-prereg');
      if (b) {
        if (count > 0) {
          b.textContent = count > 9 ? '9+' : String(count);
          b.classList.remove('hidden');
        } else {
          b.classList.add('hidden');
        }
      }
    } catch (_) {}
  }
};