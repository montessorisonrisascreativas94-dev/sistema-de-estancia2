import { supabase, RealtimeUtils } from './supabase.js';
import { Helpers } from './helpers.js';
import { ImageLoader } from './image-loader.js';
import { QueryCache } from './query-cache.js';
import { withTimeout } from './db-utils.js';

// Inline helper — optimiza URLs de Supabase Storage con transformaciones
// Aplica resize y compresión cuando la URL es de Supabase Storage (plan Pro)
// En plan gratuito, agrega parámetros de caché para mejor rendimiento
const optimizeImageUrl = (url, opts = {}) => {
  if (!url) return url || null;
  // Solo optimizar URLs de Supabase Storage
  if (!url.includes('/storage/v1/object/public/')) return url;
  const { width, quality } = opts;
  // Agregar parámetros de transformación (requiere plan Pro de Supabase)
  // En plan gratuito estos parámetros son ignorados pero no causan error
  if (width || quality) {
    const sep = url.includes('?') ? '&' : '?';
    const params = [];
    if (width) params.push(`width=${width}`);
    if (quality) params.push(`quality=${quality}`);
    return url + sep + params.join('&');
  }
  return url;
};

// ============================================================
// REACCIONES (modelo Facebook adaptado a una estancia infantil)
// Usado por todos los paneles (muro compartido, feed de padres,
// muro de encargada).
// ============================================================
export const WALL_REACTIONS = {
  like:  { emoji: '👍', label: 'Me gusta' },
  love:  { emoji: '❤️', label: 'Me encanta' },
  bravo: { emoji: '👏', label: 'Excelente' },
  adore: { emoji: '😍', label: 'Adorable' },
  party: { emoji: '🎉', label: 'Felicidades' }
};

// Orden en el que se muestran los emojis en el selector y el resumen
const REACTION_ORDER = ['like', 'love', 'bravo', 'adore', 'party'];

// Limite de comentarios por página (carga progresiva "ver más")
const COMMENTS_PAGE = 8;

/**
 * Módulo de Muro Global Mejorado
 * Modelo Facebook: publicación → reacciones → comentarios → respuestas → tiempo real
 */
export const WallModule = {
  _appState: null,
  _commentsCache: {},
  _containerId: null,
  _observer: null,
  _options: {},
  _myReactions: {},
  _postReactionState: {},
  _commentsState: {},
  _reactTimer: null,
  _reactLongPress: false,

  // Obtiene los colores de like según la configuración o el rol del usuario
  _getLikeColors() {
    let color = this._options.likeColor;

    if (!color) {
      // Fallback basado en el rol si no se pasó un color específico en init
      const role = this._appState?.get('profile')?.role || 'padre';
      const roleColors = {
        'padre': 'emerald',    // Verde
        'maestra': 'orange',   // Naranja
        'asistente': 'teal',   // Verde azulado
        'directora': 'blue',   // Azul
        'admin': 'blue',
        'encargada': 'purple'
      };
      color = roleColors[role] || 'rose';
    }

    return {
      text: `text-${color}-500`,
      fill: `fill-${color}-500`,
      hover: `hover:text-${color}-500`
    };
  },

  // Utilidad de tiempo relativo
  _relativeTimeFromNow(timeString) {
    try {
      const date = new Date(timeString);
      const diffMs = Date.now() - date.getTime();
      if (diffMs < 0) return 'hace poco';
      const seconds = Math.floor(diffMs / 1000);
      if (seconds < 60) return `hace ${seconds} seg`;
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) return `hace ${minutes} min`;
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return `hace ${hours} h`;
      const days = Math.floor(hours / 24);
      if (days < 30) return `hace ${days} días`;
      const months = Math.floor(days / 30);
      if (months < 12) return `hace ${months} meses`;
      const years = Math.floor(months / 12);
      return `hace ${years} años`;
    } catch (e) {
      return '';
    }
  },

  // Indicador visual de frescura del post (<24h = nuevo)
  _freshnessBadge(timeString) {
    try {
      const date = new Date(timeString);
      const diffMs = Date.now() - date.getTime();
      const hours = Math.floor(diffMs / 3600000);
      if (hours < 1) {
        return '<span class="wall-freshness wall-freshness--live"><span class="wall-freshness-dot"></span>En vivo</span>';
      } else if (hours < 24) {
        return '<span class="wall-freshness wall-freshness--new"><span class="wall-freshness-dot"></span>Nuevo</span>';
      }
      return '';
    } catch (e) {
      return '';
    }
  },

  async _getPublicImageUrl(imagePath, opts = {}) {
    // Legacy — use _resolveUrlSync instead
    return this._resolveUrlSync(imagePath, opts);
  },

  async init(containerId, options = {}, appState = null) {
    this._page = 0;
    this._pageSize = 10;
    this._isLoading = false;
    this._hasMore = true;
    this._containerId = containerId;
    this._options = options;
    this._appState = appState;
    this._postTimes = {};
    this._videoObserver = null;
    this._wireStarted = false;
    this._myReactions = {};
    this._postReactionState = {};
    this._commentsState = {};

    const container = document.getElementById(containerId);
    if (!container) return;

    await this.loadClassrooms();
    this.setupFilters();
    await this.loadPosts(container);
    this.subscribeRealtime();
    this._startFreshnessTimer();
    this._closeOnOutside();
    this._fillComposer();
  },

  // Rellena el avatar del composer "¿Qué quieres compartir?" si existe
  _fillComposer() {
    const av = document.getElementById('wallComposerAvatar');
    if (!av) return;
    const profile = this._appState?.get('profile');
    if (!profile?.avatar_url) return;
    const url = this._resolveUrlSync(profile.avatar_url, { width: 80, height: 80 });
    if (!url) return;
    av.innerHTML = `<img src="${url}" alt="Tu foto" class="w-full h-full object-cover">`;
  },

  // ⏱️ INDICADOR VISUAL EN TIEMPO REAL: re-evalúa "En vivo"/"Nuevo" cada minuto
  _startFreshnessTimer() {
    if (this._freshnessTimer) clearInterval(this._freshnessTimer);
    this._freshnessTimer = setInterval(() => this._tickFreshnessBadges(), 60_000);
  },

  _tickFreshnessBadges() {
    if (!this._postTimes) return;
    Object.entries(this._postTimes).forEach(([id, createdAt]) => {
      const slot = document.getElementById(`freshness-${id}`);
      if (slot) slot.innerHTML = this._freshnessBadge(createdAt);
    });
  },

  async loadClassrooms() {
    try {
      const classrooms = await QueryCache.get(
        'classrooms_list',
        async () => {
          const { data } = await supabase.from('classrooms').select('id, name').order('name');
          return data || [];
        },
        10 * 60_000 // 10 min TTL — classrooms rarely change
      );
      const select = document.getElementById('wallClassroomFilter');
      if (select && classrooms) {
        select.innerHTML = '<option value="">Todas las aulas</option>';
        classrooms.forEach(c => {
          const option = document.createElement('option');
          option.value = c.id;
          option.textContent = c.name;
          select.appendChild(option);
        });
      }
    } catch (_) { /* silencioso */ }
  },

  setupFilters() {
    const searchInput = document.getElementById('wallSearch');
    const classroomSelect = document.getElementById('wallClassroomFilter');

    // Debounce para búsqueda
    let timeout;
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        clearTimeout(timeout);
        timeout = setTimeout(() => this.applyFilters(), 500);
      });
    }
    if (classroomSelect) {
      classroomSelect.addEventListener('change', () => this.applyFilters());
    }
  },

  async applyFilters() {
    const searchInput = document.getElementById('wallSearch');
    const classroomSelect = document.getElementById('wallClassroomFilter');

    this._options.searchTerm = searchInput?.value.toLowerCase() || '';
    this._options.classroomId = classroomSelect?.value || null;

    this._page = 0;
    this._hasMore = true;
    const container = document.getElementById(this._containerId);
    if (container) await this.loadPosts(container);
  },

  async loadPosts(container, append = false) {
    // 🛡️ Fix: Si 'container' es un string (ID), convertirlo a elemento DOM
    if (typeof container === 'string') {
      container = document.getElementById(container);
    }
    // Si no se pasó container o no es válido, usar el ID configurado
    if (!container) {
      container = document.getElementById(this._containerId);
    }

    if (this._isLoading || (!this._hasMore && append)) return;
    this._isLoading = true;

    if (!container) {
      this._isLoading = false;
      return;
    }

    // ✅ PERSISTENCIA EN APPSTATE: Si no es append y tenemos datos en cache, mostrarlos primero
    if (!append && this._appState) {
      const cachedPosts = this._appState.get('wall_posts_cache');
      const cachedFilters = this._appState.get('wall_filters_cache');
      const currentFilters = JSON.stringify(this._options);

      if (cachedPosts && cachedFilters === currentFilters) {
        container.innerHTML = cachedPosts.map(p => this.renderPost(p)).join('');
        if (window.lucide) lucide.createIcons();
        ImageLoader.observe(container);
        this._wireVideoMedia(container);
        this._watchVideos(container);
        this._bindDelegated(container);
        this._isLoading = false;
        // Continuamos para refrescar datos en segundo plano
      }
    }

    if (!append && !container.innerHTML) {
      container.innerHTML = `
        <div class="py-12 text-center" id="wall-loader">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-400 mx-auto"></div>
          <p class="mt-4 text-slate-400 font-medium text-xs">Cargando muro...</p>
        </div>`;
      this._page = 0;
      this._hasMore = true;
    }

    try {
      const user = this._appState ? this._appState.get('user') : null;
      const from = this._page * this._pageSize;
      const to = from + this._pageSize - 1;

      const buildQuery = (withSocial) => {
        let q = supabase
          .from('posts');
        if (withSocial) {
          q = q.select(`
            id, content, media_url, media_type, teacher_id, created_at,
            is_pinned, is_important, post_type,
            classroom:classrooms(name),
            teacher:profiles(name, avatar_url),
            likes(user_id, reaction_type),
            comments:comments(count)
          `)
            .order('is_pinned', { ascending: false })
            .order('created_at', { ascending: false });
        } else {
          q = q.select(`
            id, content, media_url, media_type, teacher_id, created_at,
            classroom:classrooms(name),
            teacher:profiles(name, avatar_url),
            likes(user_id),
            comments:comments(count)
          `)
            .order('created_at', { ascending: false });
        }
        q = q.range(from, to);

        if (this._options.classroomId) {
          // Show posts for this classroom AND general posts (classroom_id = null)
          q = q.or(`classroom_id.eq.${this._options.classroomId},classroom_id.is.null`);
        }
        if (this._options.searchTerm) q = q.ilike('content', `%${this._options.searchTerm}%`);
        return q;
      };

      // Query completa con columnas sociales; si la migración aún no se
      // aplicó en la base, reintenta con el esquema anterior (robustez).
      let res = await withTimeout(() => buildQuery(true), 10_000).catch(() => null);
      let posts = res?.error ? null : res?.data;
      if (!posts) {
        res = await withTimeout(() => buildQuery(false), 10_000);
        if (res.error) throw res.error;
        posts = res.data || [];
      }

      // Limpiar loaders
      document.getElementById('wall-loader')?.remove();
      document.getElementById('wall-scroll-loader')?.remove();

      if ((!posts || posts.length === 0) && !append) {
        container.innerHTML = Helpers.emptyState('No hay publicaciones recientes.', 'layout');
        this._hasMore = false;
        return;
      }

      // Limpiar estado de reacciones/comentarios de posts que se re-renderizan
      if (!append) {
        this._myReactions = {};
        this._postReactionState = {};
        this._commentsState = {};
      }

      const processedPosts = posts.map(p => this._processPost(p, user));

      // Guardar en cache para persistencia instantánea
      if (!append && this._appState) {
        this._appState.set('wall_posts_cache', processedPosts);
        this._appState.set('wall_filters_cache', JSON.stringify(this._options));
      }

      const html = processedPosts.map(p => this.renderPost(p)).join('');

      if (append) container.insertAdjacentHTML('beforeend', html);
      else container.innerHTML = html;

      // Activar lazy loading en las nuevas imágenes
      ImageLoader.observe(container);
      this._wireVideoMedia(container);
      this._watchVideos(container);
      this._bindDelegated(container);

      // Pre-cargar avatares e imágenes en background
      const urlsToPrefetch = processedPosts
        .flatMap(p => [p.display_media_url, p.teacher_avatar])
        .filter(Boolean);
      ImageLoader.prefetch(urlsToPrefetch);

      // Paginación
      if (posts.length < this._pageSize) {
        this._hasMore = false;
        container.insertAdjacentHTML('beforeend', '<div class="py-8 text-center text-xs text-slate-300 italic">No hay más publicaciones.</div>');
      } else {
        this._page++;
        this._setupInfiniteScroll(container);
      }

      if (window.lucide) lucide.createIcons();
    } catch (err) {
      if (!append) container.innerHTML = Helpers.emptyState('Error al cargar el muro', 'alert-triangle');
    } finally {
      this._isLoading = false;
    }
  },

  _setupInfiniteScroll(container) {
    if (this._observer) this._observer.disconnect();
    this._observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && this._hasMore && !this._isLoading) {
        this.loadPosts(container, true);
      }
    }, { rootMargin: '200px' });

    const last = container.lastElementChild;
    if (last) this._observer.observe(last);

    // 🎥 Setup Autoplay de videos al hacer scroll
    this._setupVideoAutoplay();
  },

  _setupVideoAutoplay() {
    if (this._videoObserver) this._videoObserver.disconnect();
    this._videoObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const video = entry.target;
        if (!entry.isIntersecting) {
          // Fuera de pantalla → pausar y mantener SOLO el fotograma (no descargar el video)
          video.pause();
          entry.target.dataset.wallPreload = 'off';
          try { video.preload = 'none'; } catch (_) {}
        } else {
          // 🎬 PRECARGA INTELIGENTE: cerca del viewport → modo fotograma (metadatos)
          if (video.preload === 'none') video.preload = 'metadata';
          entry.target.dataset.wallPreload = 'on';
        }
      });
    }, { rootMargin: '400px', threshold: [0, 0.7] });

    // Vincular observador a todos los videos presentes
    document.querySelectorAll('video').forEach(v => this._videoObserver.observe(v));
  },

  // Observa videos nuevos (al hacer append de posts) sin recrear el observer
  _watchVideos(container) {
    if (!this._videoObserver) { this._setupVideoAutoplay(); return; }
    container.querySelectorAll('video').forEach(v => this._videoObserver.observe(v));
  },

  /** Play/Pause desde el botón central estilo Instagram */
  async toggleVideo(postId, btn) {
    const video = document.getElementById(`media-wrap-${postId}`)?.querySelector('video');
    if (!video) return;
    try {
      if (video.paused) {
        await video.play();
        if (navigator.vibrate) navigator.vibrate(8);
      } else {
        video.pause();
      }
    } catch (_) { /* autoplay bloqueado */ }
  },

  // Conecta los eventos de cada video: duración, estado del botón play
  _wireVideoMedia(container) {
    (container || document).querySelectorAll('[data-video-play]').forEach(btn => {
      const id = btn.dataset.videoPlay;
      const video = document.getElementById(`media-wrap-${id}`)?.querySelector('video');
      if (!video) return;

      const updateBtn = () => {
        const playing = !video.paused && !video.ended;
        btn.style.opacity = playing ? '0' : '1';
        btn.style.pointerEvents = playing ? 'none' : 'auto';
      };
      const setDuration = () => {
        const d = video.duration;
        if (!isFinite(d) || d <= 0) return;
        const min = Math.floor(d / 60);
        const sec = Math.floor(d % 60);
        const el = document.getElementById(`video-dur-${id}`);
        if (el) {
          el.textContent = `${min}:${String(sec).padStart(2, '0')}`;
          el.style.opacity = '1';
        }
      };

      video.addEventListener('play', updateBtn);
      video.addEventListener('pause', updateBtn);
      video.addEventListener('ended', updateBtn);
      video.addEventListener('loadedmetadata', () => { setDuration(); }, { once: false });
      // Si el fotograma ya trajo duración antes del wire, mostrarla
      if (video.readyState >= 1) setDuration();
      updateBtn();
    });
  },

  // ============================================================
  // PROCESAMIENTO DEL POST (reacciones, URLs, metadata social)
  // ============================================================
  _processPost(p, user) {
    const teacherData = p.teacher || {};
    const likesArray = p.likes || [];
    const likeCount = likesArray.length;

    // Reacciones detalladas (quién + qué reacción)
    const myLike = user ? likesArray.find(l => l.user_id === user.id) : null;
    const breakdown = {};
    let totalReactions = 0;
    likesArray.forEach(l => {
      const t = WALL_REACTIONS[l.reaction_type] ? l.reaction_type : 'like';
      breakdown[t] = (breakdown[t] || 0) + 1;
      totalReactions++;
    });

    // Resolver URLs de forma SÍNCRONA — con transformación CDN
    const mediaUrl = p.media_url || p.image_url || null;
    const publicUrl = this._resolveUrlSync(mediaUrl, { width: 800, quality: 75 });
    const teacherAvatar = this._resolveUrlSync(teacherData.avatar_url, { width: 80, quality: 80 });

    return {
      ...p,
      teacher_name: teacherData.name || 'Maestra',
      teacher_avatar: teacherAvatar,
      like_count: likeCount,
      total_reactions: totalReactions,
      my_reaction: myLike ? (WALL_REACTIONS[myLike.reaction_type] ? myLike.reaction_type : 'like') : null,
      reaction_breakdown: breakdown,
      user_liked: !!myLike,
      display_media_url: publicUrl,
      is_video: p.media_type === 'video' || (mediaUrl && /\.(mp4|mov|webm)$/i.test(mediaUrl))
    };
  },

  // Resolución síncrona de URLs — sin await, sin fetch
  _resolveUrlSync(url, opts = {}) {
    if (!url) return null;
    // Ya es URL completa
    if (/^https?:\/\//i.test(url)) return optimizeImageUrl(url, opts);
    // Construir URL pública de Supabase Storage
    const clean = url.replace(/^(posts|karpus-uploads|avatars|classroom_media)\//, '');
    const isAvatar = url.includes('avatar');
    const bucket = isAvatar ? 'karpus-uploads' : 'posts';
    const path = isAvatar ? `avatars/${clean}` : clean;
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return optimizeImageUrl(data?.publicUrl, opts);
  },

  // Utilidad para generar colores consistentes por nombre
  _getAvatarColor(name) {
    const colors = [
      'bg-blue-100 text-blue-600',
      'bg-emerald-100 text-emerald-600',
      'bg-purple-100 text-purple-600',
      'bg-amber-100 text-amber-600',
      'bg-rose-100 text-rose-600',
      'bg-indigo-100 text-indigo-600',
      'bg-teal-100 text-teal-600'
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  },

  // ============================================================
  // RENDERIZADO DEL POST (modelo Facebook)
  // ============================================================
  renderPost(p) {
    const date = this._relativeTimeFromNow(p.created_at);
    const accent = this._options.accentColor || 'indigo';
    const isFirstPost = this._page === 0;
    const colors = this._getLikeColors();
    if (this._postTimes) this._postTimes[p.id] = p.created_at;

    // Guardar estado de reacciones para updates optimistas
    this._myReactions[p.id] = p.my_reaction;
    this._postReactionState[p.id] = {
      breakdown: p.reaction_breakdown || {},
      total: p.total_reactions || 0
    };

    // Lógica de Renderizado Multimedia con aspect-ratio fijo y lazy loading
    let mediaHtml = '';
    if (p.display_media_url) {
      if (p.is_video) {
        mediaHtml = `
          <div class="relative aspect-video rounded-2xl overflow-hidden border border-slate-100 mb-3 bg-black group/media shadow-inner" id="media-wrap-${p.id}">
            ${ImageLoader.video(p.display_media_url, '', {
              cls: 'w-full h-full object-contain',
              fotograma: true
            })}
            <button type="button" aria-label="Reproducir video" data-video-play="${p.id}"
               onclick="WallModule.toggleVideo('${p.id}', this)"
               class="absolute inset-0 m-auto w-16 h-16 rounded-full bg-white/25 backdrop-blur-md border border-white/40 text-white flex items-center justify-center transition-all hover:scale-110 hover:bg-white/40 shadow-xl">
              <i data-lucide="play" class="w-7 h-7 fill-current ml-1"></i>
            </button>
            <span class="absolute bottom-2 right-2 px-1.5 py-0.5 rounded-lg bg-black/70 text-white text-[10px] font-black tracking-wide tabular-nums backdrop-blur-sm transition-opacity duration-300 pointer-events-none"
                  id="video-dur-${p.id}" style="opacity:0">0:00</span>
            <a href="${p.display_media_url}" download target="_blank" rel="noopener noreferrer"
               class="absolute top-2 right-2 p-2 bg-black/60 hover:bg-black/80 text-white rounded-xl opacity-0 group-hover/media:opacity-100 transition-opacity flex items-center gap-1.5 text-[10px] font-black uppercase backdrop-blur-sm"
               title="Descargar video" onclick="event.stopPropagation()">
              <i data-lucide="download" class="w-3.5 h-3.5"></i> Descargar
            </a>
            <div class="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent pointer-events-none"></div>
          </div>`;
      } else {
        mediaHtml = `
          <div class="aspect-video rounded-2xl overflow-hidden border border-slate-100 mb-3 cursor-zoom-in bg-slate-50 relative group/media shadow-inner"
               onclick="window.openLightbox('${p.display_media_url}','image')">
            ${ImageLoader.img(p.display_media_url, {
              alt: 'Post media',
              cls: 'w-full h-full object-cover', // Aspect ratio fijo
              fallback: 'img/monte.jpg',
              priority: isFirstPost ? 'high' : 'low'
            })}
            <a href="${p.display_media_url}" download target="_blank" rel="noopener noreferrer"
               class="absolute top-2 right-2 p-2 bg-black/60 hover:bg-black/80 text-white rounded-xl opacity-0 group-hover/media:opacity-100 transition-opacity flex items-center gap-1.5 text-[10px] font-black uppercase backdrop-blur-sm"
               title="Descargar imagen" onclick="event.stopPropagation()">
              <i data-lucide="download" class="w-3.5 h-3.5"></i> Descargar
            </a>
          </div>`;
      }
    }

    const profile = this._appState?.get('profile');
    const role = profile?.role;
    const isDirectoraAdmin = (r) => r === 'directora' || r === 'admin';
    const isStaff = ['directora', 'admin', 'maestra', 'asistente', 'encargada'].includes(role);
    const isOwner = p.teacher_id && profile && p.teacher_id === profile.id;
    const canManage = isStaff;
    const canDelete = isDirectoraAdmin(role) || isOwner;
    const canComment = ['directora', 'maestra', 'padre', 'asistente', 'admin'].includes(role);

    const commentCount = p.comments && p.comments[0] ? Number(p.comments[0].count) || 0 : 0;

    const myReaction = p.my_reaction;
    const reactActive = p.total_reactions > 0;

    return `
      <div class="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden mb-6 ${p.is_pinned ? 'ring-2 ring-amber-200' : ''}" id="post-${p.id}" data-classroom-id="${p.classroom_id || 'null'}" data-teacher-id="${p.teacher_id || ''}">
        ${p.is_important ? `
          <div class="wall-important-banner px-5 py-2.5 flex items-center gap-2">
            <i data-lucide="alert-triangle" class="w-4 h-4 text-amber-600 shrink-0"></i>
            <span class="text-[11px] font-black text-amber-700 uppercase tracking-widest">Aviso importante</span>
          </div>
        ` : ''}

        ${p.is_pinned ? `
          <div class="bg-amber-50 px-5 py-2 flex items-center gap-2 border-b border-amber-100">
            <i data-lucide="pin" class="w-3.5 h-3.5 text-amber-500"></i>
            <span class="text-[10px] font-black text-amber-600 uppercase tracking-widest">Publicación fijada</span>
          </div>
        ` : ''}

        <div class="p-5">
          <div class="flex justify-between items-start mb-3">
            <div class="flex items-center gap-3">
              <div class="w-11 h-11 rounded-full bg-${accent}-100 flex items-center justify-center overflow-hidden shrink-0 shadow-sm border border-slate-100">
                ${ImageLoader.img(p.teacher_avatar, {
                  cls: 'w-full h-full object-cover',
                  fallback: 'img/1.jpg',
                  w: 88, h: 88
                })}
              </div>
              <div>
                <div class="font-bold text-slate-800 text-sm flex items-center gap-1.5">${Helpers.escapeHTML(p.teacher_name)}</div>
                <div class="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  ${date} • ${Helpers.escapeHTML(p.classroom?.name || 'General')} <span id="freshness-${p.id}">${this._freshnessBadge(p.created_at)}</span>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-1">
              ${p.display_media_url ? `
                <a href="${p.display_media_url}" download target="_blank" rel="noopener noreferrer"
                   class="p-1.5 text-slate-300 hover:text-${accent}-500 hover:bg-${accent}-50 transition-colors rounded-lg" title="Descargar ${p.is_video ? 'video' : 'imagen'}">
                  <i data-lucide="${p.is_video ? 'video' : 'image'}" class="w-4 h-4"></i>
                </a>
              ` : ''}
              ${canManage && canDelete ? `
                <button type="button" data-menu-post="${p.id}" aria-label="Opciones de publicación"
                   class="p-1.5 text-slate-300 hover:text-slate-600 hover:bg-slate-100 transition-colors rounded-lg">
                  <i data-lucide="more-horizontal" class="w-5 h-5"></i>
                </button>
              ` : ''}
              ${canDelete ? `
                <button onclick="WallModule.deletePost('${p.id}')" class="text-slate-300 hover:text-red-500 transition-colors p-1.5 rounded-lg hover:bg-red-50" title="Eliminar publicación">
                  <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
              ` : ''}
            </div>
          </div>

          <div class="text-slate-600 text-sm mb-4 whitespace-pre-wrap leading-relaxed">${Helpers.escapeHTML(p.content)}</div>

          ${mediaHtml}

          ${reactActive ? `
            <div class="flex items-center justify-between px-0.5 py-1.5" id="reaction-summary-${p.id}">
              <button type="button" data-reaction-summary="${p.id}" class="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-700">
                ${this._renderReactionEmojis(p)}
                <span class="ml-0.5 tabular-nums">${p.total_reactions}</span>
              </button>
              ${commentCount > 0 ? `
                <button type="button" data-jump-comments="${p.id}" class="text-xs font-bold text-slate-500 hover:text-blue-600 transition-colors">
                  ${commentCount} ${commentCount === 1 ? 'comentario' : 'comentarios'}
                </button>
              ` : ''}
            </div>
          ` : ''}

          <div class="flex items-stretch gap-2 pt-3 border-t border-slate-100 mt-0.5">
            ${this._renderReactionButton(p)}
            <button onclick="WallModule.toggleCommentSection('${p.id}')" class="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 min-h-[46px] rounded-2xl text-xs font-black text-slate-500 bg-slate-50 hover:bg-blue-50 hover:text-blue-500 transition-all active:scale-[.95] select-none" aria-label="Comentar">
              <i data-lucide="message-circle" class="w-5 h-5"></i>
              <span class="hidden sm:inline">Comentar</span>
              <span class="font-black tabular-nums">${commentCount}</span>
            </button>
          </div>

          <div id="comments-section-${p.id}" class="hidden mt-3 pt-2 border-t border-slate-100 bg-slate-50/80 -mx-5 px-4 pb-1 rounded-b-3xl">
            <div id="comments-list-${p.id}" class="space-y-3 mb-2 max-h-64 overflow-y-auto kk-scroll py-2">
              <p class="text-center text-xs text-slate-400 py-2">Cargando comentarios...</p>
            </div>
            ${canComment ? `
              <div class="sticky bottom-0 flex items-center gap-2 px-0 py-2">
                <input type="text" id="comment-input-${p.id}" inputmode="text" enterkeyhint="send" autocomplete="off"
                  class="flex-1 min-w-0 px-4 py-3 text-sm bg-white border-2 border-slate-200 rounded-full shadow-sm focus:border-${accent}-400 focus:ring-2 focus:ring-${accent}-400 outline-none transition-all"
                  placeholder="Escribe un comentario..." onkeydown="if(event.key==='Enter'){event.preventDefault();WallModule.sendComment('${p.id}')}">
                <button onclick="WallModule.sendComment('${p.id}')" aria-label="Enviar comentario" class="shrink-0 w-11 h-11 rounded-full bg-${accent}-600 hover:bg-${accent}-700 text-white flex items-center justify-center shadow-md transition-all active:scale-90">
                  <i data-lucide="send" class="w-4 h-4"></i>
                </button>
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  },

  // Emojis del resumen de reacciones (máx. 3 tipos distintos + total)
  _renderReactionEmojis(p) {
    const breakdown = p.reaction_breakdown || {};
    const emojis = REACTION_ORDER.filter(t => (breakdown[t] || 0) > 0).slice(0, 3);
    if (emojis.length === 0) return '<span class="text-[11px] text-slate-400">Sin reacciones</span>';
    return `<span class="flex items-center -space-x-1 wall-emoji-summary">${emojis.map(e => `<span class="text-sm">${WALL_REACTIONS[e].emoji}</span>`).join('')}</span>`;
  },

  // Botón de reacción (tap = me gusta; mantener presionado = selector)
  _renderReactionButton(p) {
    const accent = this._options.accentColor || 'indigo';
    const my = p.my_reaction;
    if (my) {
      const r = WALL_REACTIONS[my];
      return `
        <button type="button" data-react-post="${p.id}" aria-label="Reaccionar" title="${r.label} (toca para quitar, mantén presionado para elegir)"
           class="wall-react-btn flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 min-h-[46px] rounded-2xl text-xs font-black transition-all active:scale-[.95] select-none text-${accent}-500 bg-${accent}-50">
          <span class="text-base leading-none">${r.emoji}</span>
          <span class="hidden sm:inline">${r.label}</span>
          <span class="font-black tabular-nums">${p.total_reactions}</span>
        </button>`;
    }
    return `
      <button type="button" data-react-post="${p.id}" aria-label="Reaccionar" title="Toca para dar Me gusta, mantén presionado para elegir una reacción"
         class="wall-react-btn flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 min-h-[46px] rounded-2xl text-xs font-black text-slate-500 bg-slate-50 hover:bg-slate-100 transition-all active:scale-[.95] select-none">
        <i data-lucide="thumbs-up" class="w-5 h-5"></i>
        <span class="hidden sm:inline">Me gusta</span>
        <span class="font-black tabular-nums">${p.total_reactions}</span>
      </button>`;
  },

  // ============================================================
  // REACCIONES: lógica (tap corto / selector long-press)
  // ============================================================
  async reactToPost(postId, type) {
    const user = this._appState?.get('user');
    if (!user) return;
    if (!WALL_REACTIONS[type]) return;

    const prev = this._myReactions[postId] || null;
    const next = prev === type ? null : type;

    // Actualización optimista del estado
    this._myReactions[postId] = next;
    const st = this._postReactionState[postId] || { breakdown: {}, total: 0 };
    if (prev) { st.breakdown[prev] = Math.max(0, (st.breakdown[prev] || 0) - 1); st.total = Math.max(0, st.total - 1); }
    if (next) { st.breakdown[next] = (st.breakdown[next] || 0) + 1; st.total = st.total + 1; }
    this._postReactionState[postId] = st;
    this._applyReactionState(postId, st.breakdown, st.total, next);

    if (navigator.vibrate) navigator.vibrate(12);

    try {
      if (prev === type) {
        await supabase.from('likes').delete().eq('post_id', postId).eq('user_id', user.id);
      } else if (!prev) {
        await supabase.from('likes').insert({ post_id: postId, user_id: user.id, reaction_type: type });
      } else {
        await supabase.from('likes').update({ reaction_type: type }).eq('post_id', postId).eq('user_id', user.id);
      }
    } catch (err) {
      // Revertir optimista en caso de error
      this._myReactions[postId] = prev;
      if (next) { st.breakdown[next] = Math.max(0, (st.breakdown[next] || 0) - 1); st.total = Math.max(0, st.total - 1); }
      if (prev) { st.breakdown[prev] = (st.breakdown[prev] || 0) + 1; st.total = st.total + 1; }
      this._applyReactionState(postId, st.breakdown, st.total, prev);
      Helpers.toast('No se pudo actualizar la reacción', 'error');
    }
  },

  // Re-aplica el estado de reacciones en el DOM (botón + resumen)
  _applyReactionState(postId, breakdown, total, myReaction) {
    const btn = document.querySelector(`#post-${postId} [data-react-post]`);
    if (btn) {
      btn.outerHTML = this._renderReactionButton({ id: postId, ...WALL_REACTIONS[myReaction] ? { my_reaction: myReaction, total_reactions: total } : { my_reaction: null, total_reactions: total } });
    }
    const summary = document.getElementById(`reaction-summary-${postId}`);
    if (summary) {
      if (total > 0) {
        const emojis = REACTION_ORDER.filter(t => (breakdown[t] || 0) > 0).slice(0, 3);
        summary.innerHTML = `
          <div class="flex items-center gap-1.5 text-xs font-bold text-slate-500">
            <span class="flex items-center -space-x-1 wall-emoji-summary">${emojis.map(e => `<span class="text-sm">${WALL_REACTIONS[e].emoji}</span>`).join('')}</span>
            <span class="ml-0.5 tabular-nums">${total}</span>
          </div>`;
      } else {
        summary.remove();
      }
    }
  },

  // Selector de reacciones (long-press / mantener presionado)
  openReactionPicker(postId, ev) {
    this.closePopovers();
    const btn = document.querySelector(`#post-${postId} [data-react-post]`);
    if (!btn) return;

    const rect = btn.getBoundingClientRect();
    const card = document.createElement('div');
    card.className = 'wall-picker-card';
    card.style.left = `${Math.max(8, rect.left + rect.width / 2 - 110)}px`;
    card.style.top = `${Math.max(8, rect.top - 64)}px`;
    card.dataset.postId = postId;

    const selected = this._myReactions[postId];

    card.innerHTML = REACTION_ORDER.map(t => `
      <button type="button" class="wall-emoji-btn${selected === t ? ' wall-picker-selected' : ''}" data-reaction-option="${t}" title="${WALL_REACTIONS[t].label}">
        ${WALL_REACTIONS[t].emoji}
      </button>`).join('');

    card.addEventListener('click', (e) => {
      const opt = e.target.closest('[data-reaction-option]');
      if (!opt) return;
      this.reactToPost(postId, opt.dataset.reactionOption);
      this.closePopovers();
    });

    document.body.appendChild(card);
    this._activePopover = card;
  },

  // Mantiene la API anterior: toggleLike('id') → reacciona con "like"
  async toggleLike(postId) {
    const prev = this._myReactions[postId];
    await this.reactToPost(postId, prev || 'like');
  },

  // ============================================================
  // MENÚ DE TRES PUNTOS (⋮): fijar, aviso importante, eliminar
  // ============================================================
  openPostMenu(postId, ev) {
    this.closePopovers();
    ev?.stopPropagation();

    const btn = ev?.target?.closest('[data-menu-post]');
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const profile = this._appState?.get('profile');
    const role = profile?.role;
    const postEl = document.getElementById(`post-${postId}`);
    const isPinned = postEl?.classList.contains('ring-amber-200');
    const hasImportant = !!postEl?.querySelector('.wall-important-banner');

    const menu = document.createElement('div');
    menu.className = 'wall-post-menu';
    menu.style.top = `${rect.bottom + 8}px`;
    menu.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;

    let items = '';
    if (role === 'directora' || role === 'admin') {
      items += `
        <button type="button" data-menu-action="pin" data-post="${postId}">
          <i data-lucide="${isPinned ? 'undo-2' : 'pin'}" class="w-4 h-4"></i> ${isPinned ? 'Desfijar publicación' : 'Fijar publicación'}
        </button>
        <button type="button" data-menu-action="important" data-post="${postId}">
          <i data-lucide="alert-triangle" class="w-4 h-4"></i> ${hasImportant ? 'Quitar aviso importante' : 'Marcar como aviso importante'}
        </button>
        <div class="wall-menu-sep"></div>
        <button type="button" data-menu-action="delete" data-post="${postId}" class="wall-danger">
          <i data-lucide="trash-2" class="w-4 h-4"></i> Eliminar publicación
        </button>`;
    } else {
      items = `
        <button type="button" data-menu-action="delete" data-post="${postId}" class="wall-danger">
          <i data-lucide="trash-2" class="w-4 h-4"></i> Eliminar publicación
        </button>`;
    }

    menu.innerHTML = items;
    menu.addEventListener('click', (e) => {
      const action = e.target.closest('[data-menu-action]');
      if (!action) return;
      const pid = action.dataset.post;
      const kind = action.dataset.menuAction;
      this.closePopovers();
      if (kind === 'pin') this.setPinned(pid, !isPinned);
      else if (kind === 'important') this.setImportant(pid, !hasImportant);
      else if (kind === 'delete') this.deletePost(pid);
    });

    document.body.appendChild(menu);
    if (window.lucide) lucide.createIcons();
    this._activePopover = menu;
  },

  async setPinned(postId, pinned) {
    try {
      await supabase.from('posts').update({ is_pinned: pinned }).eq('id', postId);
      Helpers.toast(pinned ? 'Publicación fijada al inicio del muro' : 'Publicación desfijada', 'success');
      await this.loadPosts(document.getElementById(this._containerId));
    } catch (_) {
      Helpers.toast('No se pudo fijar la publicación', 'error');
    }
  },

  async setImportant(postId, important) {
    try {
      await supabase.from('posts').update({ is_important: important }).eq('id', postId);
      Helpers.toast(important ? 'Marcada como aviso importante' : 'Aviso importante eliminado', 'success');
      await this.loadPosts(document.getElementById(this._containerId));
    } catch (_) {
      Helpers.toast('No se pudo actualizar el aviso', 'error');
    }
  },

  closePopovers() {
    if (this._activePopover) {
      this._activePopover.remove();
      this._activePopover = null;
    }
  },

  _closeOnOutside() {
    if (this._closeBound) return;
    this._closeBound = true;
    document.addEventListener('click', (e) => {
      if (this._activePopover && !e.target.closest('.wall-picker-card') && !e.target.closest('.wall-post-menu')) {
        this.closePopovers();
      }
    });
    ['scroll', 'resize', 'keydown'].forEach(evt => {
      window.addEventListener(evt, () => this.closePopovers(), { passive: true });
    });
  },

  // ============================================================
  // ENLACE DE EVENTOS (delegación en el contenedor de posts)
  // ============================================================
  _bindDelegated(container) {
    if (!container || container._wallBound) return;
    container._wallBound = true;

    // Supresión de menú contextual en toque largo (comportamiento nativo móvil)
    container.addEventListener('contextmenu', (e) => {
      if (e.target.closest('.wall-react-btn')) e.preventDefault();
    });

    // Mantener presionado (long-press): abrir selector de reacciones
    container.addEventListener('pointerdown', (e) => {
      const reactBtn = e.target.closest('[data-react-post]');
      if (!reactBtn) return;
      this._reactLongPress = false;
      clearTimeout(this._reactTimer);
      this._reactTimer = setTimeout(() => {
        this._reactLongPress = true;
        this.openReactionPicker(reactBtn.dataset.reactPost, e);
      }, 380);
    });
    const cancelLongPress = () => { clearTimeout(this._reactTimer); };
    container.addEventListener('pointerup', cancelLongPress);
    container.addEventListener('pointerleave', cancelLongPress);
    container.addEventListener('pointercancel', cancelLongPress);

    container.addEventListener('click', (e) => {
      // Si el long-press abrió el selector, no disparar el tap toggle
      if (this._reactLongPress) {
        this._reactLongPress = false;
        clearTimeout(this._reactTimer);
        e.stopPropagation();
        return;
      }

      const reactBtn = e.target.closest('[data-react-post]');
      if (reactBtn) {
        // Tap corto → reaccionar (quitar la propia o poner "Me gusta")
        this.reactToPost(reactBtn.dataset.reactPost, this._myReactions[reactBtn.dataset.reactPost] || 'like');
        return;
      }

      const menuBtn = e.target.closest('[data-menu-post]');
      if (menuBtn) {
        this.openPostMenu(menuBtn.dataset.menuPost, e);
        return;
      }

      const replyToggle = e.target.closest('[data-reply-toggle]');
      if (replyToggle) {
        const id = `reply-input-${replyToggle.dataset.post}-${replyToggle.dataset.comment}`;
        const input = document.getElementById(id);
        if (input) {
          input.classList.toggle('hidden');
          if (!input.classList.contains('hidden')) {
            input.focus({ preventScroll: true });
            input.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
        return;
      }

      const replySend = e.target.closest('[data-reply-send]');
      if (replySend) {
        this.sendReply(replySend.dataset.post, replySend.dataset.comment);
        return;
      }

      const moreComments = e.target.closest('[data-more-comments]');
      if (moreComments) {
        this.loadMoreComments(moreComments.dataset.post);
        return;
      }

      const jumpComments = e.target.closest('[data-jump-comments]');
      if (jumpComments) {
        const pid = jumpComments.dataset.jumpComments;
        const section = document.getElementById(`comments-section-${pid}`);
        const inList = document.getElementById(`comment-input-${pid}`);
        if (section && section.classList.contains('hidden')) this.toggleCommentSection(pid);
        const target = document.getElementById(`comments-list-${pid}`);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (inList) setTimeout(() => inList.focus({ preventScroll: true }), 300);
        return;
      }
    });
  },

  // ============================================================
  // COMENTARIOS + RESPUESTAS
  // ============================================================
  async sendComment(postId) {
    const input = document.getElementById(`comment-input-${postId}`);
    const content = input?.value.trim();
    if (!content) return;

    const user = this._appState?.get('user');
    const profile = this._appState?.get('profile');
    if (!user) return;

    // Resolver nombre del autor
    let userName = 'Usuario';
    const profileName = await this._resolveAuthorName(user, profile);
    userName = profileName;

    // Optimistic UI — agregar comentario sin recargar
    const commentsList = document.getElementById(`comments-list-${postId}`);
    const tempId = `temp-${Date.now()}`;
    if (commentsList) {
      const placeholder = commentsList.querySelector('.italic');
      if (placeholder) placeholder.remove();

      const tempEl = document.createElement('div');
      tempEl.id = tempId;
      tempEl.dataset.optimistic = '1';
      tempEl.className = 'animate-slideInUp';
      tempEl.innerHTML = this._commentCardHtml({
        id: tempId,
        user_name: userName,
        content: content,
        created_at: new Date().toISOString(),
        _tempUser: { name: userName }
      }, postId);
      commentsList.appendChild(tempEl);
      commentsList.scrollTop = commentsList.scrollHeight;

      // Incrementar contador superior
      const countEl = document.getElementById(`comment-count-${postId}`);
      if (countEl) {
        const current = parseInt(countEl.textContent || '0', 10) || 0;
        countEl.textContent = String(current + 1);
      }
    }

    // Limpiar input inmediatamente
    input.value = '';

    // Mantener el foco (teclado abierto en móvil) para seguir comentando
    setTimeout(() => {
      if (input && document.activeElement !== input) input.focus({ preventScroll: true });
    }, 60);

    try {
      const { error } = await supabase.from('comments').insert({
        post_id: postId,
        user_id: user.id,
        user_name: userName,
        content,
        parent_id: null
      });

      if (error) throw error;

      // Confirmar — quitar opacidad del comentario temporal
      const tempEl = document.getElementById(tempId);
      if (tempEl) tempEl.classList.remove('animate-slideInUp');
    } catch (err) {
      // Revertir optimistic
      document.getElementById(tempId)?.remove();
      const countEl = document.getElementById(`comment-count-${postId}`);
      if (countEl) {
        const current = parseInt(countEl.textContent || '0', 10) || 0;
        countEl.textContent = String(Math.max(0, current - 1));
      }
      input.value = content;
      Helpers.toast('Error al enviar comentario', 'error');
    }
  },

  // Respuesta a un comentario (parent_id)
  async sendReply(postId, parentId) {
    const input = document.getElementById(`reply-input-${postId}-${parentId}`);
    const content = input?.value.trim();
    if (!content) return;

    const user = this._appState?.get('user');
    const profile = this._appState?.get('profile');
    if (!user) return;

    const userName = await this._resolveAuthorName(user, profile);

    const repliesWrap = document.getElementById(`replies-${postId}-${parentId}`);
    if (repliesWrap) {
      if (repliesWrap.classList.contains('hidden')) repliesWrap.classList.remove('hidden');
      const tempEl = document.createElement('div');
      tempEl.className = 'animate-slideInUp';
      tempEl.innerHTML = this._replyCardHtml({ user_name: userName, content, created_at: new Date().toISOString() });
      repliesWrap.appendChild(tempEl);
      repliesWrap.scrollTop = repliesWrap.scrollHeight;
    }

    input.value = '';
    setTimeout(() => {
      if (input && document.activeElement !== input) input.focus({ preventScroll: true });
    }, 60);

    try {
      const { error } = await supabase.from('comments').insert({
        post_id: postId,
        user_id: user.id,
        user_name: userName,
        content,
        parent_id: parentId
      });
      if (error) throw error;
    } catch (err) {
      Helpers.toast('Error al enviar la respuesta', 'error');
    }
  },

  // Nombre del autor: padres → nombre del estudiante hijo
  async _resolveAuthorName(user, profile) {
    try {
      if (profile?.role === 'padre') {
        const { data: student } = await supabase.from('students').select('name').eq('parent_id', user.id).maybeSingle();
        return student?.name || profile.name || 'Padre';
      }
      return profile?.name || 'Personal';
    } catch (_) {
      return profile?.name || 'Usuario';
    }
  },

  async toggleCommentSection(postId) {
    const section = document.getElementById(`comments-section-${postId}`);
    if (!section) return;
    section.classList.toggle('hidden');
    const isOpen = !section.classList.contains('hidden');

    // Al cerrar: quitar el foco para ocultar el teclado
    if (!isOpen) {
      const input = document.getElementById(`comment-input-${postId}`);
      if (input) input.blur();
      return;
    }

    // Solo cargar desde DB la primera vez (carga progresiva)
    const list = document.getElementById(`comments-list-${postId}`);
    const state = this._commentsState[postId];
    if (!state || !state.loaded) {
      list.innerHTML = `
        <div class="py-4 text-center">
          <div class="animate-spin w-5 h-5 border-2 border-slate-200 border-t-slate-400 rounded-full mx-auto"></div>
        </div>`;
      const { comments, hasMore } = await this._fetchComments(postId, 0);
      this._commentsState[postId] = { loaded: true, offset: comments.length, hasMore };
      this.renderComments(postId, comments, { hasMore });
    }

    // Abrir el teclado automáticamente en móvil al tocar "Comentar"
    const input = document.getElementById(`comment-input-${postId}`);
    if (input) {
      setTimeout(() => {
        if (document.activeElement !== input) {
          input.focus({ preventScroll: true });
          input.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 200);
    }
  },

  async loadMoreComments(postId) {
    const state = this._commentsState[postId];
    if (!state || !state.hasMore) return;
    const offset = state.offset;
    const { comments, hasMore } = await this._fetchComments(postId, offset);
    state.offset = offset + comments.length;
    state.hasMore = hasMore;

    const container = document.getElementById(`comments-list-${postId}`);
    const btn = container?.querySelector('[data-more-comments]');
    if (btn) btn.remove();
    if (comments.length) this.renderComments(postId, comments, { append: true, hasMore });
  },

  // Obtener comentarios principales + sus respuestas (con nombres resueltos)
  async _fetchComments(postId, offset = 0) {
    const { data, error } = await supabase
      .from('comments')
      .select(`
        id, content, user_name, created_at, user_id, parent_id,
        profile:profiles!comments_user_id_fkey(name, avatar_url, role)
      `)
      .eq('post_id', postId)
      .is('parent_id', null)
      .order('created_at', { ascending: true })
      .range(offset, offset + COMMENTS_PAGE - 1);

    if (error) return { comments: [], hasMore: false };

    let comments = data || [];

    // Respuestas de los comentarios de esta página
    const ids = comments.map(c => c.id);
    if (ids.length) {
      const { data: replies } = await supabase
        .from('comments')
        .select(`
          id, content, user_name, created_at, user_id, parent_id,
          profile:profiles!comments_user_id_fkey(name, avatar_url, role)
        `)
        .eq('post_id', postId)
        .in('parent_id', ids)
        .order('created_at', { ascending: true });
      const replyMap = {};
      (replies || []).forEach(r => {
        (replyMap[r.parent_id] = replyMap[r.parent_id] || []).push(r);
      });
      comments = comments.map(c => ({ ...c, replies: replyMap[c.id] || [] }));
    }

    // Resolver nombre de padres → nombre del estudiante hijo
    await this._hydrateCommentNames(comments);

    return { comments, hasMore: comments.length === COMMENTS_PAGE };
  },

  async _hydrateCommentNames(comments) {
    const all = [];
    comments.forEach(c => { all.push(c); (c.replies || []).forEach(r => all.push(r)); });

    const parentComments = all.filter(c => {
      const p = Array.isArray(c.profile) ? c.profile[0] : c.profile;
      return p?.role === 'padre';
    });
    if (!parentComments.length) return;

    const parentIds = [...new Set(parentComments.map(c => c.user_id))];
    const { data: students } = await supabase
      .from('students')
      .select('parent_id, name')
      .in('parent_id', parentIds);
    const studentByParent = {};
    (students || []).forEach(s => { studentByParent[s.parent_id] = s.name; });

    (comments || []).forEach(c => {
      const p = Array.isArray(c.profile) ? c.profile[0] : c.profile;
      if (p?.role === 'padre' && studentByParent[c.user_id]) c._studentName = studentByParent[c.user_id];
      (c.replies || []).forEach(r => {
        const rp = Array.isArray(r.profile) ? r.profile[0] : r.profile;
        if (rp?.role === 'padre' && studentByParent[r.user_id]) r._studentName = studentByParent[r.user_id];
      });
    });
  },

  // Resuelve el nombre a mostrar en un comentario:
  // - Padre → nombre del estudiante hijo (no el nombre del padre)
  // - Maestra/Directora/Asistente → profile.name de profiles
  _resolveCommentName(c) {
    const profile = Array.isArray(c.profile) ? c.profile[0] : (c.profile || null);

    // Si es padre y tenemos el nombre del estudiante, usarlo
    if (profile?.role === 'padre' && c._studentName) {
      return { name: c._studentName, avatar: null };
    }

    return {
      name: profile?.name || c.user_name || 'Usuario',
      avatar: (profile?.avatar_url && profile.avatar_url.startsWith('http')) ? profile.avatar_url : null
    };
  },

  // Tarjeta HTML de un comentario principal (con botón Responder y respuestas)
  _commentCardHtml(c, postId) {
    const { name: displayName } = c._tempUser ? { name: c._tempUser.name } : this._resolveCommentName(c);
    const initial = displayName.charAt(0).toUpperCase();
    const colorClass = this._getAvatarColor(displayName);
    const replies = (c.replies || []);

    return `
      <div class="flex gap-2 text-sm">
        <div class="w-8 h-8 rounded-full ${colorClass} flex items-center justify-center font-black text-[11px] border-2 border-white shrink-0 shadow-sm">
          ${initial}
        </div>
        <div class="flex-1 min-w-0">
          <div class="bg-white p-3 rounded-2xl rounded-tl-none border border-slate-100 shadow-sm inline-block max-w-full">
            <div class="flex items-center gap-2 mb-0.5">
              <span class="font-black text-slate-800 text-xs">${Helpers.escapeHTML(displayName)}</span>
              <span class="text-[9px] text-slate-400 font-bold">${this._commentTime(c.created_at)}</span>
            </div>
            <p class="text-slate-600 text-sm leading-relaxed">${Helpers.escapeHTML(c.content)}</p>
          </div>
          <div class="flex items-center gap-3 px-2 py-1">
            <button type="button" data-reply-toggle data-post="${postId}" data-comment="${c.id}"
               class="text-[11px] font-black text-slate-400 hover:text-blue-500 transition-colors">
              Responder
            </button>
          </div>

          ${replies.length ? `
            <div class="pl-2 ml-1 border-l-2 border-slate-200 space-y-2 mt-0.5" id="replies-${postId}-${c.id}">
              ${replies.map(r => this._replyCardHtml(r)).join('')}
            </div>
          ` : `<div class="pl-2 ml-1 border-l-2 border-slate-100 space-y-2 mt-0.5 hidden" id="replies-${postId}-${c.id}"></div>`}

          <div class="hidden mt-1.5 flex items-center gap-2 pl-1 pr-2" id="reply-input-wrap-${postId}-${c.id}">
            <input type="text" id="reply-input-${postId}-${c.id}" inputmode="text" enterkeyhint="send" autocomplete="off"
              placeholder="Responder a ${Helpers.escapeHTML(displayName).slice(0, 20)}..."
              class="flex-1 min-w-0 px-4 py-2.5 text-sm bg-white border-2 border-slate-200 rounded-full shadow-sm focus:ring-2 focus:ring-blue-400 outline-none transition-all"
              onkeydown="if(event.key==='Enter'){event.preventDefault();WallModule.sendReply('${postId}','${c.id}')}">
            <button type="button" data-reply-send data-post="${postId}" data-comment="${c.id}" aria-label="Enviar respuesta"
              class="shrink-0 w-9 h-9 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center shadow transition-all active:scale-90">
              <i data-lucide="send" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>
      </div>`;
  },

  // Tarjeta HTML de una respuesta (sin botón responder, máximo 1 nivel)
  _replyCardHtml(r) {
    const { name: displayName } = this._resolveCommentName(r);
    const initial = displayName.charAt(0).toUpperCase();
    const colorClass = this._getAvatarColor(displayName);

    return `
      <div class="flex gap-2 text-sm">
        <div class="w-7 h-7 rounded-full ${colorClass} flex items-center justify-center font-black text-[10px] border-2 border-white shrink-0 shadow-sm">
          ${initial}
        </div>
        <div class="bg-slate-100/80 p-2.5 rounded-2xl rounded-tl-none border border-slate-100 flex-1">
          <div class="flex items-center gap-2 mb-0.5">
            <span class="font-black text-slate-700 text-[11px]">${Helpers.escapeHTML(displayName)}</span>
            <span class="text-[9px] text-slate-400 font-bold">${this._commentTime(r.created_at)}</span>
          </div>
          <p class="text-slate-600 text-[13px] leading-relaxed">${Helpers.escapeHTML(r.content)}</p>
        </div>
      </div>`;
  },

  _commentTime(time) {
    try {
      const d = new Date(time);
      const now = new Date();
      const diff = (now - d) / 1000;
      if (diff < 60) return 'ahora';
      if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (_) { return ''; }
  },

  renderComments(postId, comments, { append = false, hasMore = false } = {}) {
    const container = document.getElementById(`comments-list-${postId}`);
    if (!container) return;

    if (!append) {
      if (comments.length === 0) {
        container.innerHTML = '<p class="text-center text-xs text-slate-400 italic py-2">Sé el primero en comentar.</p>';
        return;
      }
      container.innerHTML = comments.map(c => this._commentCardHtml(c, postId)).join('');
    } else {
      container.insertAdjacentHTML('beforeend', comments.map(c => this._commentCardHtml(c, postId)).join(''));
    }

    if (hasMore) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wall-more-comments';
      btn.dataset.moreComments = postId;
      btn.textContent = 'Ver más comentarios';
      container.appendChild(btn);
    }

    // Activar lazy loading / íconos en zonas nuevas
    if (window.lucide) lucide.createIcons();
    ImageLoader.observe(container);
  },

  async deletePost(postId) {
    if (!confirm('¿Eliminar esta publicación permanentemente?')) return;
    try {
      // ✅ INTERFAZ OPTIMISTA: Animación de salida
      const el = document.getElementById(`post-${postId}`);
      if (el) {
        el.style.transition = 'all 0.4s ease';
        el.style.opacity = '0';
        el.style.transform = 'translateX(20px)';
      }

      await supabase.from('posts').delete().eq('id', postId);
      setTimeout(() => document.getElementById(`post-${postId}`)?.remove(), 400);
      Helpers.toast('Publicación eliminada', 'info');
    } catch (err) {
      Helpers.toast('Error al eliminar', 'error');
    }
  },

  // Escuchar cambios en posts para actualizar el muro de forma inteligente
  subscribeRealtime() {
    this._unsubscribeRealtime(); // limpiar canal anterior si existe

    const classroomId = this._options.classroomId;
    const self = this;

    this._realtimeChannel = supabase
      .channel(`wall_${classroomId || 'global'}_${Date.now()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, async (payload) => {
        const post = payload.new;
        if (classroomId && post.classroom_id && post.classroom_id !== classroomId) return;

        // Mostrar indicador de nuevos posts en lugar de refrescar auto
        const container = document.getElementById(self._containerId);
        if (container) {
          const indicator = document.getElementById('wall-new-posts-indicator');
          if (!indicator) {
            const btn = document.createElement('div');
            btn.id = 'wall-new-posts-indicator';
            btn.className = 'fixed top-24 left-1/2 -translate-x-1/2 bg-indigo-600 text-white px-6 py-2.5 rounded-full text-[10px] font-black uppercase shadow-2xl animate-bounce cursor-pointer z-50 flex items-center gap-2 border-2 border-white/20 backdrop-blur-md';
            btn.innerHTML = '<i data-lucide="arrow-up" class="w-3 h-3"></i> Nuevas publicaciones disponibles';
            btn.onclick = () => {
              window.scrollTo({ top: 0, behavior: 'smooth' });
              self.applyFilters();
              btn.remove();
            };
            document.body.appendChild(btn);
            if (window.lucide) lucide.createIcons();
          }
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'posts' }, (payload) => {
        const post = payload.new;
        const el = document.getElementById(`post-${post.id}`);
        if (el) {
          const likeSpan = document.getElementById(`like-count-${post.id}`);
          const commBtn = document.getElementById(`comment-count-${post.id}`);
          if (likeSpan && typeof post.likes_count === 'number') likeSpan.textContent = post.likes_count;
          if (commBtn && typeof post.comments_count === 'number') commBtn.textContent = `${post.comments_count}`;
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'posts' }, (payload) => {
        const el = document.getElementById(`post-${payload.old?.id}`);
        if (el) {
          el.classList.add('opacity-0', 'scale-95');
          setTimeout(() => el.remove(), 300);
        }
      })
      // Realtime para reacciones
      .on('postgres_changes', { event: '*', schema: 'public', table: 'likes' }, async (payload) => {
        const postId = payload.new?.post_id || payload.old?.post_id;
        const postEl = document.getElementById(`post-${postId}`);
        if (postId && postEl) {
          const { data: likes } = await supabase.from('likes').select('user_id, reaction_type').eq('post_id', postId);
          const breakdown = {};
          let total = 0;
          (likes || []).forEach(l => {
            const t = WALL_REACTIONS[l.reaction_type] ? l.reaction_type : 'like';
            breakdown[t] = (breakdown[t] || 0) + 1;
            total++;
          });
          const myReaction = this._myReactions[postId] || null;
          this._myReactions[postId] = null; // se recalculó desde la DB
          this._postReactionState[postId] = { breakdown, total };
          const user = this._appState?.get('user');
          const mine = (likes || []).find(l => l.user_id === user?.id);
          this._applyReactionState(postId, breakdown, total, mine ? (WALL_REACTIONS[mine.reaction_type] ? mine.reaction_type : 'like') : null);
        }
      })
      // Realtime para comentarios
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, async (payload) => {
        const postId = payload.new?.post_id || payload.old?.post_id;
        if (postId) {
          const { count } = await supabase.from('comments').select('id', { count: 'exact', head: true }).eq('post_id', postId).is('parent_id', null);
          const btn = document.getElementById(`comment-count-${postId}`);
          if (btn) {
            btn.textContent = `${count || 0}`;
          }
          // Si la sección de comentarios está abierta, actualizarla (solo top-level)
          const section = document.getElementById(`comments-section-${postId}`);
          if (section && !section.classList.contains('hidden')) {
            const { comments, hasMore } = await this._fetchComments(postId, 0);
            this._commentsState[postId] = { loaded: true, offset: comments.length, hasMore };
            this.renderComments(postId, comments, { hasMore });
          }
        }
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          setTimeout(() => {
            if (self._realtimeChannel) self.subscribeRealtime();
          }, 5000);
        }
      });
  },

  /** Desuscribir el canal del muro — llamar cuando el usuario cambia de sección */
  _unsubscribeRealtime() {
    if (this._realtimeChannel) {
      try { supabase.removeChannel(this._realtimeChannel); } catch (_) {}
      this._realtimeChannel = null;
    }
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }
    clearTimeout(this._reactTimer);
  },

  /** Destruir completamente el módulo — llamar al salir de la sección muro */
  destroy() {
    this._unsubscribeRealtime();
    if (this._freshnessTimer) { clearInterval(this._freshnessTimer); this._freshnessTimer = null; }
    if (this._videoObserver) { this._videoObserver.disconnect(); this._videoObserver = null; }
    this._postTimes = {};
    this.closePopovers();
  },

  openLightbox(postId) {
    const post = document.getElementById(`post-${postId}`);
    const img = post?.querySelector('img');
    if (!img) return;

    const html = `
      <div class="w-full max-w-lg overflow-hidden relative">
        <div class="relative h-80 bg-slate-900 flex items-center justify-center">
          <img src="${img.src}" class="w-full h-full object-contain cursor-zoom-out" alt="Evidencia" onclick="App.ui.closeModal()">
        </div>
      </div>
    `;
    if (window.openGlobalModal) window.openGlobalModal(html, true);
    else if (window.Modal?.open) window.Modal.open('lightbox', html);
  }
};