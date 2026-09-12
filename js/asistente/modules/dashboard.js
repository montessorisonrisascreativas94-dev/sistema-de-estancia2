import { supabase } from '../../shared/supabase.js';
import { AppState } from '../state.js';
import { Helpers } from '../../shared/helpers.js';
import { QueryCache } from '../../shared/query-cache.js';

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
      this.loadRecentActivity(),
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
              supabase.from('classrooms').select('id', { count: 'exact', head: true }).eq('is_active', true),
              supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'maestra'),
            ]);
            const get = (r) => r.status === 'fulfilled' ? r.value : {};
            return {
              studentsCount:   get(studentsRes).count  || 0,
              attendanceCount: get(attendanceRes).count || 0,
              classroomsCount: get(classroomsRes).count || 0,
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

  timeAgo(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'ahora';
    if (m < 60) return m + 'm';
    const h = Math.floor(m / 60);
    if (h < 24) return h + 'h';
    return Math.floor(h / 24) + 'd';
  },

  async loadRecentActivity() {
    const container = document.getElementById('dashRecentPayments');
    if (!container) return;

    const post = (p) => {
      const isVideo = p.media_type === 'video' || /\.(mp4|mov|webm|ogg|avi)$/i.test(p.media_url || p.image_url || '');
      const src = p.media_url || p.image_url || null;
      const media = src
        ? (isVideo
            ? `<div class="mt-2 rounded-xl overflow-hidden bg-slate-100 aspect-video"><video src="${Helpers.escapeAttr(src)}" muted playsinline preload="metadata" class="w-full h-full object-cover"></video></div>`
            : `<img src="${Helpers.escapeAttr(src)}" loading="lazy" alt="" class="mt-2 rounded-xl w-full h-40 object-cover bg-slate-100">`)
        : '';
      const name = p.teacher_name || p.title || 'Publicación';
      const ini = name.charAt(0).toUpperCase();
      return `
        <div class="px-5 py-3 hover:bg-slate-50/70 transition-colors">
          <div class="flex items-start gap-3">
            <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-[#0d9488] to-[#0B63C7] text-white flex items-center justify-center font-black text-sm shrink-0 shadow-sm">${ini}</div>
            <div class="min-w-0 flex-1">
              <p class="font-black text-slate-800 text-sm truncate">${Helpers.escapeHTML(name)}</p>
              <p class="text-[10px] text-slate-400 font-bold uppercase truncate">${this.timeAgo(p.created_at)}</p>
              ${p.content ? `<p class="text-xs text-slate-600 font-medium leading-snug mt-1 line-clamp-2">${Helpers.escapeHTML(p.content)}</p>` : ''}
            </div>
          </div>
          ${media}
        </div>`;
    };

    try {
      const [postsRes, commentsRes] = await Promise.allSettled([
        supabase.from('posts').select('*').order('created_at', { ascending: false }).limit(6),
        supabase.from('comments').select('id,post_id,content,created_at,user_name').order('created_at', { ascending: false }).limit(8),
      ]);

      const posts = (postsRes.status === 'fulfilled' ? postsRes.value.data : []) || [];
      const comments = (commentsRes.status === 'fulfilled' ? commentsRes.value.data : []) || [];

      if (!posts.length && !comments.length) {
        container.innerHTML = '<div class="px-5 py-8 text-center text-slate-400 text-sm">Aún no hay actividad escolar reciente.</div>';
        return;
      }

      const items = [];
      posts.slice(0, 4).forEach(p => items.push(post(p)));
      comments.slice(0, 4).forEach(c => {
        items.push(`
          <div class="px-5 py-3 hover:bg-slate-50/70 transition-colors">
            <div class="flex items-start gap-3">
              <div class="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-black text-sm shrink-0">💬</div>
              <div class="min-w-0 flex-1">
                <p class="font-black text-slate-800 text-sm truncate">${Helpers.escapeHTML(c.user_name || 'Comentario')}</p>
                <p class="text-[10px] text-slate-400 font-bold uppercase truncate">${this.timeAgo(c.created_at)}</p>
                <p class="text-xs text-slate-600 font-medium leading-snug mt-1 line-clamp-2">${Helpers.escapeHTML(c.content)}</p>
              </div>
            </div>
          </div>`);
      });

      container.innerHTML = items.join('');
    } catch (_) {
      container.innerHTML = Helpers.errorState('Error al cargar');
    }
  },

  async loadUnreadMessages() {
    const countEl = document.getElementById('dashUnreadMessages');
    if (!countEl) return;
    try {
      const { data: unreadData } = await supabase.rpc('get_unread_counts');
      const total = Array.isArray(unreadData)
        ? unreadData.reduce((s, r) => s + Number(r.count || 0), 0)
        : 0;
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