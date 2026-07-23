/**
 * 🔔 Panel Padre — Centro de Actividad (Actividad Reciente)
 * 
 * - Agrupación inteligente por autor (ej: "Directora publicó 2 anuncios")
 * - Click → navega al módulo, marca leído, elimina item
 * - Auto-marcar leído después de 3 segundos en home
 * - Sistema de prioridades (critical / important / informative)
 * - Actividades fijadas (pinned)
 * - Contador de novedades con desglose
 */
import { supabase } from '../shared/supabase.js';
import { AppState } from './appState.js';
import { Helpers, escapeHtml } from '../shared/helpers.js';

const TYPE_CONFIG = {
  announcement: { icon: '📢', label: 'anuncios',  bg: 'bg-blue-50',    border: 'border-blue-200',   text: 'text-blue-700',   accent: '#0B63C7', priority: 2, target: 'class',        groupLabel: 'anuncio' },
  chat:         { icon: '💬', label: 'mensajes',   bg: 'bg-green-50',   border: 'border-green-200',  text: 'text-green-700',  accent: '#28B54D', priority: 3, target: 'notifications', groupLabel: 'mensaje' },
  message:      { icon: '💬', label: 'mensajes',   bg: 'bg-green-50',   border: 'border-green-200',  text: 'text-green-700',  accent: '#28B54D', priority: 3, target: 'notifications', groupLabel: 'mensaje' },
  homework:     { icon: '📚', label: 'tareas',     bg: 'bg-orange-50',  border: 'border-orange-200', text: 'text-orange-700', accent: '#FF7A00', priority: 4, target: 'tasks',        groupLabel: 'tarea' },
  task:         { icon: '📚', label: 'tareas',     bg: 'bg-orange-50',  border: 'border-orange-200', text: 'text-orange-700', accent: '#FF7A00', priority: 4, target: 'tasks',        groupLabel: 'tarea' },
  photo:        { icon: '📸', label: 'fotos',      bg: 'bg-purple-50',  border: 'border-purple-200', text: 'text-purple-700', accent: '#8B5CF6', priority: 1, target: 'class',        groupLabel: 'foto' },
  routine:      { icon: '🍽',  label: 'rutinas',    bg: 'bg-yellow-50',  border: 'border-yellow-200', text: 'text-yellow-700', accent: '#EAB308', priority: 1, target: 'rutina-diaria', groupLabel: 'rutina' },
  payment:      { icon: '💵', label: 'pagos',      bg: 'bg-emerald-50', border: 'border-emerald-200',text: 'text-emerald-700',accent: '#10B981', priority: 5, target: 'payments',     groupLabel: 'pago' },
  event:        { icon: '📅', label: 'eventos',    bg: 'bg-cyan-50',    border: 'border-cyan-200',   text: 'text-cyan-700',   accent: '#06B6D4', priority: 2, target: 'home',         groupLabel: 'evento' },
  info:         { icon: 'ℹ️',  label: 'info',       bg: 'bg-slate-50',   border: 'border-slate-200',  text: 'text-slate-700',  accent: '#64748B', priority: 0, target: 'home',         groupLabel: 'info' },
  default:      { icon: '🔔', label: 'novedades',  bg: 'bg-slate-50',   border: 'border-slate-200',  text: 'text-slate-700',  accent: '#64748B', priority: 0, target: 'home',         groupLabel: 'novedad' }
};

const PRIORITY_WEIGHT = { critical: 10, important: 5, informative: 0 };

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Ahora';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Ayer';
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString('es-DO', { day: 'numeric', month: 'short' });
}

export const RecentActivityModule = {
  _container: null,
  _items: [],
  _autoReadTimer: null,

  async init() {
    this._container = document.getElementById('recentActivityFeed');
    if (!this._container) return;

    if (this._autoReadTimer) clearTimeout(this._autoReadTimer);
    this._container.innerHTML = this._skeletonHTML();

    try {
      const student = AppState.get('currentStudent');
      const parent = AppState.get('user');
      if (!student || !parent) {
        this._container.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">Cargando...</p>';
        return;
      }

      const [notifications, posts] = await Promise.allSettled([
        supabase.from('notifications')
          .select('id, type, title, message, is_read, created_at, link, priority, is_pinned, student_id')
          .eq('user_id', parent.id)
          .or(`student_id.is.null,student_id.eq.${student.id}`)
          .order('created_at', { ascending: false })
          .limit(30),
        supabase.from('posts')
          .select('id, content, media_url, media_type, created_at, classroom_id, teacher:teacher_id(name)')
          .or(`classroom_id.is.null,classroom_id.eq.${student.classroom_id || 0}`)
          .order('created_at', { ascending: false })
          .limit(10)
      ]);

      this._items = [];

      // Procesar notificaciones
      if (notifications.status === 'fulfilled' && notifications.value.data) {
        for (const n of notifications.value.data) {
          const cfg = TYPE_CONFIG[n.type] || TYPE_CONFIG.default;
          this._items.push({
            id: `notif-${n.id}`,
            dbId: n.id,
            type: n.type || 'info',
            title: n.title || 'Novedad',
            message: n.message || '',
            icon: cfg.icon,
            bg: cfg.bg,
            border: cfg.border,
            text: cfg.text,
            accent: cfg.accent,
            priority: n.priority || 'informative',
            priorityWeight: PRIORITY_WEIGHT[n.priority || 'informative'] || 0,
            target: cfg.target,
            isRead: n.is_read,
            isPinned: n.is_pinned || false,
            createdAt: n.created_at,
            link: n.link,
            notifId: n.id,
            groupLabel: cfg.groupLabel,
            source: 'notification'
          });
        }
      }

      // Agregar posts del muro — agrupados por autor
      if (posts.status === 'fulfilled' && posts.value.data) {
        const authorPosts = new Map();
        for (const p of posts.value.data) {
          const teacher = Array.isArray(p.teacher) ? p.teacher[0] : (p.teacher || {});
          const authorName = teacher.name || 'Desconocido';
          if (!authorPosts.has(authorName)) {
            authorPosts.set(authorName, []);
          }
          authorPosts.get(authorName).push(p);
        }

        for (const [authorName, postList] of authorPosts) {
          const count = postList.length;
          const latestPost = postList[0]; // Ya ordenados por fecha desc
          const allIds = postList.map(p => p.id).join(',');

          this._items.push({
            id: `posts-${authorName.replace(/\s+/g, '-').toLowerCase()}`,
            dbId: latestPost.id,
            type: 'announcement',
            title: count > 1
              ? `${authorName} publicó ${count} anuncios`
              : `${authorName} publicó`,
            message: count > 1
              ? `Tienes ${count} publicaciones nuevas de ${authorName}`
              : (latestPost.content || '').slice(0, 120) + ((latestPost.content || '').length > 120 ? '...' : ''),
            icon: '📢',
            bg: 'bg-blue-50',
            border: 'border-blue-200',
            text: 'text-blue-700',
            accent: '#0B63C7',
            priority: 'informative',
            priorityWeight: 0,
            target: 'class',
            isRead: false,
            isPinned: false,
            createdAt: latestPost.created_at,
            link: 'class',
            notifId: null,
            groupLabel: 'anuncio',
            source: 'posts',
            postCount: count,
            allPostIds: allIds
          });
        }
      }

      this._sortItems();
      this._render();

      // Auto-marcar leído después de 3 segundos
      this._autoReadTimer = setTimeout(() => {
        this._autoMarkAllRead();
      }, 3000);

      // Asegurar que los íconos lucide se rendericen
      if (window.lucide) lucide.createIcons();

    } catch (err) {
      this._container.innerHTML = `
        <div class="p-4 rounded-2xl bg-slate-50 border border-slate-100 text-center text-slate-500 text-sm">
          No se pudo cargar la actividad
        </div>`;
    }
  },

  destroy() {
    if (this._autoReadTimer) {
      clearTimeout(this._autoReadTimer);
      this._autoReadTimer = null;
    }
  },

  _sortItems() {
    this._items.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      if (!a.isRead && b.isRead) return -1;
      if (a.isRead && !b.isRead) return 1;
      if (b.priorityWeight !== a.priorityWeight) return b.priorityWeight - a.priorityWeight;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  },

  _getUnreadCount() {
    return this._items.filter(i => !i.isRead).length;
  },

  _getGroupedCounts() {
    const counts = {};
    for (const item of this._items) {
      if (item.isRead) continue;
      const key = item.type;
      if (!counts[key]) counts[key] = { count: 0, icon: item.icon, label: item.groupLabel };
      counts[key].count++;
    }
    return counts;
  },

  _render() {
    if (!this._container) return;

    const unreadCount = this._getUnreadCount();
    const grouped = this._getGroupedCounts();

    if (!this._items.length) {
      this._container.innerHTML = `
        <div class="text-center py-8">
          <div class="w-16 h-16 rounded-3xl bg-[#E8FFF0] flex items-center justify-center mx-auto mb-3">
            <span class="text-3xl">🎉</span>
          </div>
          <p class="font-black text-[#1A2340] text-sm">No tienes novedades</p>
          <p class="text-[10px] text-[#64748B] font-bold mt-1">Todo está al día</p>
        </div>`;
      return;
    }

    let counterHTML = '';
    if (unreadCount > 0) {
      counterHTML = `
        <div class="flex items-center justify-between mb-3 px-1">
          <div class="flex items-center gap-2">
            <span class="w-6 h-6 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center animate-pulse">${unreadCount}</span>
            <span class="text-[11px] font-black text-slate-600">${unreadCount} novedad${unreadCount > 1 ? 'es' : ''} sin revisar</span>
          </div>
        </div>
        <div class="flex flex-wrap gap-1.5 mb-3">
          ${Object.entries(grouped).map(([type, g]) => `
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold ${TYPE_CONFIG[type]?.text || 'text-slate-600'} ${TYPE_CONFIG[type]?.bg || 'bg-slate-100'}">
              ${g.icon} ${g.count} ${g.label}${g.count > 1 ? 's' : ''}
            </span>
          `).join('')}
        </div>`;
    }

    const itemsHTML = this._items.map(item => this._renderItem(item)).join('');
    this._container.innerHTML = counterHTML + `<div class="space-y-2">${itemsHTML}</div>`;
    if (window.lucide) lucide.createIcons();
  },

  _renderItem(item) {
    const time = timeAgo(item.createdAt);
    const target = item.target || 'home';
    const unread = !item.isRead;

    const unreadDot = unread ? '<span class="w-2 h-2 rounded-full bg-[#EF4444] shrink-0 animate-pulse"></span>' : '';
    const pinnedIcon = item.isPinned ? '<span class="text-[9px] shrink-0" title="Fijada">📌</span>' : '';
    const priorityBadge = item.priority === 'critical'
      ? '<span class="px-1.5 py-0.5 bg-red-100 text-red-700 text-[8px] font-black rounded-full uppercase animate-pulse">Urgente</span>'
      : item.priority === 'important'
        ? '<span class="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[8px] font-black rounded-full uppercase">Importante</span>'
        : '';

    return `
      <div data-activity-id="${item.id}" data-target="${target}" data-notif-id="${item.notifId || ''}"
        class="flex items-start gap-3 p-3 rounded-xl ${item.bg} border ${item.border} cursor-pointer hover:shadow-md hover:scale-[1.01] transition-all group activity-item ${unread ? 'ring-1 ring-opacity-20' : 'opacity-60'}"
        style="${unread ? 'box-shadow: inset 3px 0 0 ' + item.accent : ''}">
        <div class="w-10 h-10 rounded-xl bg-white flex items-center justify-center shrink-0 shadow-sm group-hover:scale-110 transition-transform" style="font-size:1.2rem">
          ${item.icon}
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5 mb-0.5 flex-wrap">
            ${pinnedIcon}
            <span class="text-[9px] font-black ${item.text} uppercase tracking-wider">${escapeHtml(item.title)}</span>
            ${priorityBadge}
            ${unreadDot}
          </div>
          <p class="text-xs font-medium text-[#1A2340] leading-relaxed line-clamp-2">${escapeHtml(item.message)}</p>
        </div>
        <span class="text-[9px] font-bold text-[#64748B] shrink-0 whitespace-nowrap">${time}</span>
      </div>`;
  },

  _skeletonHTML() {
    return `
      <div class="space-y-2">
        ${[1,2,3,4].map(() => `
          <div class="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100 animate-pulse">
            <div class="w-10 h-10 rounded-xl bg-slate-200 shrink-0"></div>
            <div class="flex-1 space-y-1.5">
              <div class="h-2 bg-slate-200 rounded w-1/3"></div>
              <div class="h-3 bg-slate-200 rounded w-3/4"></div>
            </div>
            <div class="h-2 bg-slate-200 rounded w-12 shrink-0"></div>
          </div>
        `).join('')}
      </div>`;
  },

  async _autoMarkAllRead() {
    const unreadItems = this._items.filter(i => !i.isRead && i.notifId);
    if (!unreadItems.length) return;

    const ids = unreadItems.map(i => i.notifId);
    try {
      await supabase.from('notifications').update({ is_read: true }).in('id', ids);
    } catch (_) {}

    for (const item of unreadItems) item.isRead = true;

    this._sortItems();
    this._render();
  }
};

window.RecentActivityModule = RecentActivityModule;

// ── Global click handler: navega al módulo + marca leído + elimina ──
document.addEventListener('click', function(e) {
  const item = e.target.closest('.activity-item');
  if (!item) return;

  const target = item.dataset.target;
  const activityId = item.dataset.activityId;
  const notifId = item.dataset.notifId;

  // Navegar al módulo
  if (target && window.App?.navigateTo) {
    window.App.navigateTo(target);
  }

  // Marcar leído y eliminar
  if (activityId) {
    const mod = window.RecentActivityModule;
    const itemData = mod._items.find(i => i.id === activityId);

    if (itemData) {
      itemData.isRead = true;
      if (notifId) {
        supabase.from('notifications').update({ is_read: true }).eq('id', notifId).then(() => {});
      }
    }

    mod._items = mod._items.filter(i => i.id !== activityId);
    mod._sortItems();
    mod._render();
  }
}, { passive: true });
