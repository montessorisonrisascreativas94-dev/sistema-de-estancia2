import { supabase, RealtimeUtils } from '../shared/supabase.js';
import { AppState } from './appState.js';
import { Helpers, escapeHtml } from '../shared/helpers.js';
import { ImageLoader } from '../shared/image-loader.js';
import { Security } from '../shared/security.js';
import { WALL_REACTIONS } from '../shared/wall.js';

const REACTION_ORDER = ['like', 'love', 'bravo', 'adore', 'party'];
const TOP_COMMENTS = 3; // primer grupo de comentarios visibles (carga progresiva)

function freshnessBadge(timeString) {
  try {
    const date = new Date(timeString);
    const diffMs = Date.now() - date.getTime();
    const hours = Math.floor(diffMs / 3600000);
    if (hours < 1) return '<span class="wall-freshness wall-freshness--live"><span class="wall-freshness-dot"></span>En vivo</span>';
    if (hours < 24) return '<span class="wall-freshness wall-freshness--new"><span class="wall-freshness-dot"></span>Nuevo</span>';
    return '';
  } catch (_) { return ''; }
}

function commentTime(time) {
  try {
    const d = new Date(time);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return 'ahora';
    if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (_) { return ''; }
}

function avatarColor(name) {
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
}

/**
 * MÓDULO DE MURO (FEED) — modelo Facebook:
 * reacciones, comentarios con respuestas, avisos importantes y fijadas.
 */
export const FeedModule = {
  _classroomId: null,
  _channel: null,
  _feedReaction: {},
  _activePopover: null,

  /**
   * Inicializa el muro
   * Carga posts del aula directamente (sin depender de WallModule/muroPostsContainer)
   */
  async init() {
    const student = AppState.get('currentStudent');
    const parent  = AppState.get('user');
    if (!student || !parent) return;

    this._classroomId = student.classroom_id;
    this._postTimes = {};
    this._feedReaction = {};
    await this.loadPosts();
    this._bindFeedEvents();
    this.initRealtime();
    this._startFreshnessTimer();
    this._closeOnOutside();
  },

  // ⏱️ INDICADOR VISUAL EN TIEMPO REAL: re-evalúa "En vivo"/"Nuevo" cada minuto
  _startFreshnessTimer() {
    if (this._freshnessTimer) clearInterval(this._freshnessTimer);
    this._freshnessTimer = setInterval(() => this._tickFreshnessBadges(), 60_000);
  },

  _tickFreshnessBadges() {
    if (!this._postTimes) return;
    Object.entries(this._postTimes).forEach(([id, createdAt]) => {
      const slot = document.getElementById(`feed-freshness-${id}`);
      if (slot) slot.innerHTML = freshnessBadge(createdAt);
    });
  },

  /**
   * Bind click delegation for likes, reactions, comments, replies, video, download
   * Called once after loadPosts — uses a single delegated listener on #classFeed
   */
  _bindFeedEvents() {
    const container = document.getElementById('classFeed');
    if (!container || container._feedBound) return;
    container._feedBound = true;

    // Suprimir menú contextual nativo ante toque largo en el botón de reacción
    container.addEventListener('contextmenu', (e) => {
      if (e.target.closest('[data-react-post]')) e.preventDefault();
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

    container.addEventListener('click', async (e) => {
      if (this._reactLongPress) {
        this._reactLongPress = false;
        clearTimeout(this._reactTimer);
        e.stopPropagation();
        return;
      }

      const reactBtn = e.target.closest('[data-react-post]');
      if (reactBtn) {
        const postId = reactBtn.dataset.reactPost;
        await this.reactToPost(postId, this._feedReaction[postId]?.my || 'like');
        return;
      }

      const commentToggle = e.target.closest('[data-action="comment"]');
      if (commentToggle) {
        const postId = commentToggle.dataset.postId;
        if (postId) this.showComments(postId);
        return;
      }

      const jumpComments = e.target.closest('[data-jump-comments]');
      if (jumpComments) {
        this.showComments(jumpComments.dataset.jumpComments);
        return;
      }

      const sendCommentBtn = e.target.closest('[data-action="send-comment"]');
      if (sendCommentBtn) {
        const postId = sendCommentBtn.dataset.postId;
        if (postId) await this.sendComment(postId);
        return;
      }

      const replyToggle = e.target.closest('[data-reply-toggle]');
      if (replyToggle) {
        const wrap = document.getElementById(`reply-input-wrap-${replyToggle.dataset.post}-${replyToggle.dataset.comment}`);
        if (wrap) {
          wrap.classList.toggle('hidden');
          const input = wrap.querySelector('input');
          if (input && !wrap.classList.contains('hidden')) {
            input.focus({ preventScroll: true });
            input.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
        return;
      }

      const replySend = e.target.closest('[data-reply-send]');
      if (replySend) {
        await this.sendReply(replySend.dataset.post, replySend.dataset.comment);
        return;
      }

      const moreComments = e.target.closest('[data-more-comments]');
      if (moreComments) {
        this.expandComments(moreComments.dataset.post, moreComments.dataset.offset);
        return;
      }

      const videoToggle = e.target.closest('[data-action="video-toggle"]');
      if (videoToggle) {
        const postId = videoToggle.dataset.postId;
        const video = document.getElementById(`media-wrap-${postId}`)?.querySelector('video');
        if (video) {
          if (video.paused) video.play().catch(() => {});
          else video.pause();
        }
        return;
      }

      const downloadBtn = e.target.closest('[data-action="download-media"]');
      if (downloadBtn) {
        const url = downloadBtn.dataset.url;
        const type = downloadBtn.dataset.type || 'image';
        if (url) await this.downloadMedia(url, type);
        return;
      }

      const lightbox = e.target.closest('[data-lightbox-url]');
      if (lightbox && window.openLightbox) {
        window.openLightbox(lightbox.dataset.lightboxUrl, lightbox.dataset.lightboxType || 'image');
        return;
      }
    });

    container.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && e.target.id?.startsWith('comment-input-')) {
        e.preventDefault();
        const postId = e.target.id.replace('comment-input-', '');
        if (postId) this.sendComment(postId);
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey && e.target.id?.startsWith('reply-input-')) {
        e.preventDefault();
        const parts = e.target.id.split('-');
        const postId = parts[2];
        const commentId = parts[3];
        if (postId && commentId) this.sendReply(postId, commentId);
      }
    });
  },

  /**
   * Carga publicaciones del aula directamente
   */
  async loadPosts() {
    const container = document.getElementById('classFeed');
    if (!container) return;

    container.innerHTML = Helpers.skeleton(2, 'h-48');

    try {
      const student = AppState.get('currentStudent');
      // Query directa — sin RPC ni Edge Function que pueden fallar
      // Con soporte de fijadas/avisos; si la migración no está aplicada, reintenta sin esas columnas.
      let { data: posts, error } = await supabase
        .from('posts')
        .select(`
          id, content, media_url, media_type, created_at, classroom_id,
          is_pinned, is_important,
          teacher:teacher_id ( id, name, avatar_url )
        `)
        .or(`classroom_id.is.null,classroom_id.eq.${student?.classroom_id || 0}`)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        posts = null;
      }
      if (!posts) {
        const res = await supabase
          .from('posts')
          .select(`
            id, content, media_url, media_type, created_at, classroom_id,
            teacher:teacher_id ( id, name, avatar_url )
          `)
          .or(`classroom_id.is.null,classroom_id.eq.${student?.classroom_id || 0}`)
          .order('created_at', { ascending: false })
          .limit(50);
        if (res.error) throw res.error;
        posts = res.data || [];
        posts = posts.map(p => ({ ...p, is_pinned: false, is_important: false }));
      }

      // Enrich with likes (con reacción) y comentarios (con parent_id)
      const postIds = (posts || []).map(p => p.id);
      let likesMap = {}, commentsMap = {};

      if (postIds.length > 0) {
        const [likesRes, commentsRes] = await Promise.allSettled([
          supabase.from('likes').select('id, post_id, user_id, reaction_type').in('post_id', postIds),
          supabase.from('comments').select('post_id, id, content, user_name, user_id, created_at, parent_id').in('post_id', postIds)
        ]);
        if (likesRes.status === 'fulfilled' && likesRes.value.data) {
          for (const l of likesRes.value.data) {
            if (!likesMap[l.post_id]) likesMap[l.post_id] = [];
            likesMap[l.post_id].push(l);
          }
        }
        if (commentsRes.status === 'fulfilled' && commentsRes.value.data) {
          for (const c of commentsRes.value.data) {
            if (!commentsMap[c.post_id]) commentsMap[c.post_id] = [];
            commentsMap[c.post_id].push(c);
          }
        }
      }

      const enriched = (posts || []).map(p => ({
        ...p,
        likes:    likesMap[p.id]    || [],
        comments: commentsMap[p.id] || []
      }));

      AppState.set('feedPosts', enriched);
      this.renderFeed(enriched);

    } catch (err) {
      container.innerHTML = `
        <div class="p-6 text-center">
          <p class="text-rose-500 font-bold text-sm mb-2">❌ Error al cargar publicaciones</p>
          <p class="text-slate-400 text-xs">${escapeHtml(err.message || String(err))}</p>
          <button onclick="App.feed.init()" class="mt-4 px-4 py-2 bg-[#0B63C7] text-white rounded-xl text-xs font-bold">Reintentar</button>
        </div>`;
      if (window.lucide) lucide.createIcons();
    }
  },

  /**
   * Renderiza los posts en la UI
   */
  renderFeed(posts) {
    const container = document.getElementById('classFeed');
    if (!container) return;

    if (!posts.length) {
      container.innerHTML = Helpers.emptyState('No hay publicaciones en este momento', '📢');
      return;
    }

    container.innerHTML = posts.map(p => this.createPostHTML(p)).join('');
    if (window.lucide) lucide.createIcons();
    ImageLoader.observe(container);
    this._setupFeedVideos(container);
  },

  // 🎬 Conecta botón de play + duración de los videos del feed
  _setupFeedVideos(container) {
    (container || document).querySelectorAll('[data-action="video-toggle"]').forEach(btn => {
      const id = btn.dataset.postId;
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
        const el = document.getElementById(`video-dur-${id}`);
        if (el) {
          el.textContent = `${Math.floor(d / 60)}:${String(Math.floor(d % 60)).padStart(2, '0')}`;
          el.style.opacity = '1';
        }
      };
      video.addEventListener('play', updateBtn);
      video.addEventListener('pause', updateBtn);
      video.addEventListener('ended', updateBtn);
      video.addEventListener('loadedmetadata', setDuration);
      if (video.readyState >= 1) setDuration();
      updateBtn();
    });
  },

  /**
   * Crea el HTML de un post individual (modelo Facebook)
   */
  createPostHTML(p) {
    const teacher   = Array.isArray(p.teacher) ? p.teacher[0] : (p.teacher || {});
    const teacherName   = teacher.name   || p.teacher_name   || 'Maestra';
    const teacherAvatar = teacher.avatar_url || p.teacher_avatar || null;
    const date = Helpers.formatDate(p.created_at);
    const myId = AppState.get('user')?.id;
    if (this._postTimes) this._postTimes[p.id] = p.created_at;

    const likes = Array.isArray(p.likes) ? p.likes : [];
    const comments = Array.isArray(p.comments) ? p.comments : [];

    // Reacciones: mi reacción + desglose
    const myReaction = likes.find(l => l.user_id === myId)
      ? (WALL_REACTIONS[likes.find(l => l.user_id === myId).reaction_type] ? likes.find(l => l.user_id === myId).reaction_type : 'like')
      : null;
    const breakdown = {};
    let total = 0;
    likes.forEach(l => {
      const t = WALL_REACTIONS[l.reaction_type] ? l.reaction_type : 'like';
      breakdown[t] = (breakdown[t] || 0) + 1;
      total++;
    });
    this._feedReaction[p.id] = { breakdown, total, my: myReaction };

    // Comentarios: principales y respuestas
    const topLevel = comments.filter(c => !c.parent_id);
    const repliesOf = (id) => comments.filter(c => String(c.parent_id) === String(id));

    let mediaHTML = '';
    if (p.media_url) {
      const isVideo = p.media_url.match(/\.(mp4|webm|ogg|mov)$/i);
      const optimizedUrl = p.media_url;
      if (isVideo) {
        mediaHTML = `
          <div class="relative group/media rounded-2xl overflow-hidden mb-4 bg-black" id="media-wrap-${p.id}">
            ${ImageLoader.video(p.media_url, '', { cls: 'w-full max-h-80 object-contain' })}
            <button data-action="video-toggle" data-post-id="${p.id}" aria-label="Reproducir video"
               class="absolute inset-0 m-auto w-16 h-16 rounded-full bg-white/25 backdrop-blur-md border border-white/40 text-white flex items-center justify-center transition-all hover:scale-110 hover:bg-white/40 shadow-xl">
              <i data-lucide="play" class="w-7 h-7 fill-current ml-1"></i>
            </button>
            <span class="absolute bottom-2 right-2 px-1.5 py-0.5 rounded-lg bg-black/70 text-white text-[10px] font-black tracking-wide tabular-nums backdrop-blur-sm transition-opacity duration-300 pointer-events-none" id="video-dur-${p.id}" style="opacity:0">0:00</span>
            <button data-action="download-media" data-url="${escapeHtml(optimizedUrl)}" data-type="video"
               class="absolute top-2 right-2 p-2 bg-black/60 hover:bg-black/80 text-white rounded-xl opacity-0 group-hover/media:opacity-100 transition-opacity flex items-center gap-1.5 text-[10px] font-black uppercase backdrop-blur-sm">
              <i data-lucide="download" class="w-3.5 h-3.5"></i> Descargar
            </button>
          </div>`;
      } else {
        mediaHTML = `
          <div class="relative group/media cursor-zoom-in rounded-2xl overflow-hidden mb-4 bg-black"
               data-lightbox-url="${escapeHtml(optimizedUrl)}" data-lightbox-type="image">
            ${ImageLoader.img(optimizedUrl, { cls: 'w-full max-h-[500px] object-cover', fallback: 'img/mundo.jpg' })}
            <button data-action="download-media" data-url="${escapeHtml(optimizedUrl)}" data-type="image"
               class="absolute top-2 right-2 p-2 bg-black/60 hover:bg-black/80 text-white rounded-xl opacity-0 group-hover/media:opacity-100 transition-opacity flex items-center gap-1.5 text-[10px] font-black uppercase backdrop-blur-sm">
              <i data-lucide="download" class="w-3.5 h-3.5"></i> Descargar
            </button>
          </div>`;
      }
    }

    const summaryEmojis = REACTION_ORDER.filter(t => (breakdown[t] || 0) > 0).slice(0, 3)
      .map(t => `<span class="text-sm">${WALL_REACTIONS[t].emoji}</span>`).join('');

    return `
      <div class="bg-white p-5 rounded-[2.5rem] border-2 border-slate-50 mb-6 shadow-sm hover:shadow-md transition-all animate-fade-in ${p.is_pinned ? 'ring-2 ring-amber-200' : ''}">
        ${p.is_important ? `
          <div class="wall-important-banner -mx-5 -mt-5 px-5 py-2.5 rounded-t-[2.45rem] flex items-center gap-2 mb-4">
            <i data-lucide="alert-triangle" class="w-4 h-4 text-amber-600 shrink-0"></i>
            <span class="text-[11px] font-black text-amber-700 uppercase tracking-widest">Aviso importante</span>
          </div>
        ` : ''}
        ${p.is_pinned ? `
          <div class="flex items-center gap-2 pb-2 mb-3 border-b border-amber-100 -mx-5 px-5 bg-amber-50 -mt-5 pt-2.5 rounded-t-[2.45rem]">
            <i data-lucide="pin" class="w-3.5 h-3.5 text-amber-500"></i>
            <span class="text-[10px] font-black text-amber-600 uppercase tracking-widest">Publicación fijada</span>
          </div>
        ` : ''}

        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center font-bold text-orange-600 overflow-hidden border-2 border-orange-50 shrink-0 aspect-square shadow-sm">
              ${teacherAvatar
                ? `<img src="${teacherAvatar}" alt="${escapeHtml(teacherName)}" class="w-full h-full object-cover" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
                : ''}
              <span style="${teacherAvatar ? 'display:none' : 'display:flex'}" class="w-full h-full items-center justify-center font-bold text-orange-600">${escapeHtml(teacherName.charAt(0))}</span>
            </div>
            <div>
              <p class="font-black text-slate-800 text-sm leading-tight">${escapeHtml(teacherName)}</p>
              <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">${date} <span id="feed-freshness-${p.id}">${freshnessBadge(p.created_at)}</span></p>
            </div>
          </div>
          <span class="px-3 py-1 bg-slate-50 text-slate-400 text-[9px] font-black uppercase rounded-full border border-slate-100">Comunicado</span>
        </div>

        <p class="text-sm text-slate-600 leading-relaxed mb-4">${escapeHtml(p.content || '')}</p>

        ${mediaHTML}

        ${total > 0 ? `
          <div class="flex items-center justify-between px-0.5 py-1.5">
            <div class="flex items-center gap-1.5 text-xs font-bold text-slate-500">
              <span class="flex items-center -space-x-1 wall-emoji-summary">${summaryEmojis}</span>
              <span class="ml-0.5 tabular-nums text-[#0B63C7]">${total}</span>
            </div>
            <button type="button" data-jump-comments="${p.id}" class="text-xs font-bold text-slate-500 hover:text-blue-600 transition-colors">
              ${topLevel.length} ${topLevel.length === 1 ? 'comentario' : 'comentarios'}
            </button>
          </div>
        ` : ''}

        <div class="flex items-stretch gap-2 pt-3 border-t border-slate-50">
          ${this._renderReactionButton(p, myReaction)}
          <button data-action="comment" data-post-id="${p.id}" class="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 min-h-[46px] rounded-2xl text-xs font-black text-slate-500 bg-slate-50 hover:bg-blue-50 hover:text-blue-600 transition-all active:scale-[.95] select-none">
            <i data-lucide="message-circle" class="w-5 h-5"></i>
            <span class="hidden sm:inline">Comentar</span>
            <span class="font-black tabular-nums">${topLevel.length}</span>
          </button>
        </div>

        <div id="comments-section-${p.id}" class="hidden mt-3 pt-3 border-t border-slate-50 bg-slate-50/60 -mx-5 px-4 pb-1 rounded-b-[2rem]">
          <div id="comments-list-${p.id}" class="space-y-3 mb-2 max-h-64 overflow-y-auto kk-scroll py-2">
            ${this._renderCommentGroup(p, topLevel, repliesOf)}
          </div>
          <div class="sticky bottom-0 flex items-center gap-2 px-0 py-2">
            <input type="text" id="comment-input-${p.id}" inputmode="text" enterkeyhint="send" autocomplete="off"
              class="flex-1 min-w-0 px-4 py-3 text-sm bg-white border-2 border-slate-200 rounded-full shadow-sm focus:border-[#0B63C7] focus:ring-2 focus:ring-blue-200 outline-none transition-all"
              placeholder="Escribe un comentario...">
            <button data-action="send-comment" data-post-id="${p.id}" aria-label="Enviar comentario"
              class="shrink-0 w-11 h-11 rounded-full bg-[#0B63C7] hover:bg-[#094a91] text-white flex items-center justify-center shadow-md transition-all active:scale-90">
              <i data-lucide="send" class="w-4 h-4"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  },

  _renderReactionButton(p, myReaction) {
    const total = this._feedReaction[p.id]?.total || (Array.isArray(p.likes) ? p.likes.length : 0);
    if (myReaction) {
      const r = WALL_REACTIONS[myReaction];
      return `
        <button data-react-post="${p.id}" title="${r.label} (toca para quitar, mantén presionado para elegir)" aria-label="Reaccionar"
           class="wall-react-btn flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 min-h-[46px] rounded-2xl text-xs font-black text-[#0B63C7] bg-blue-50 transition-all active:scale-[.95] select-none">
          <span class="text-base leading-none">${r.emoji}</span>
          <span class="hidden sm:inline">${r.label}</span>
          <span class="font-black tabular-nums">${total}</span>
        </button>`;
    }
    return `
      <button data-react-post="${p.id}" title="Toca para dar Me gusta, mantén presionado para elegir" aria-label="Reaccionar"
         class="wall-react-btn flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 min-h-[46px] rounded-2xl text-xs font-black text-slate-500 bg-slate-50 transition-all active:scale-[.95] select-none">
        <i data-lucide="thumbs-up" class="w-5 h-5"></i>
        <span class="hidden sm:inline">Me gusta</span>
        <span class="font-black tabular-nums">${total}</span>
      </button>`;
  },

  // Primer grupo de comentarios + botón "Ver más" (cliente)
  _renderCommentGroup(p, topLevel, repliesOf) {
    if (topLevel.length === 0) {
      return '<p class="text-center text-xs text-slate-400 italic py-2">Sé el primero en comentar.</p>';
    }
    const show = topLevel.slice(0, TOP_COMMENTS);
    const rest = topLevel.length - TOP_COMMENTS;
    return `
      ${show.map(c => this._renderCommentCard(c, p, repliesOf)).join('')}
      ${rest > 0 ? `
        <button type="button" class="wall-more-comments" data-more-comments="${p.id}" data-offset="${TOP_COMMENTS}">
          Ver ${rest} comentarios más
        </button>` : ''}`;
  },

  _renderCommentCard(c, p, repliesOf) {
    const cName = c.user_name || c.user?.name || 'Usuario';
    const color = avatarColor(cName);
    const replies = repliesOf(c.id);
    const displayName = c.user_name || 'Usuario';
    return `
      <div class="flex gap-2 text-sm">
        <div class="w-8 h-8 rounded-full ${color} flex items-center justify-center font-black text-[11px] border-2 border-white shrink-0 shadow-sm">${escapeHtml(displayName.charAt(0))}</div>
        <div class="flex-1 min-w-0">
          <div class="bg-white p-3 rounded-2xl rounded-tl-none border border-slate-100 shadow-sm inline-block max-w-full">
            <div class="flex items-center gap-2 mb-0.5">
              <span class="font-black text-slate-800 text-xs">${escapeHtml(displayName)}</span>
              <span class="text-[9px] text-slate-400 font-bold">${commentTime(c.created_at)}</span>
            </div>
            <p class="text-slate-600 text-sm leading-relaxed">${escapeHtml(c.content)}</p>
          </div>
          <div class="flex items-center gap-3 px-2 py-1">
            <button type="button" data-reply-toggle data-post="${p.id}" data-comment="${c.id}" class="text-[11px] font-black text-slate-400 hover:text-blue-500 transition-colors">Responder</button>
          </div>
          ${replies.length ? `
            <div class="pl-2 ml-1 border-l-2 border-slate-200 space-y-2 mt-0.5" id="replies-${p.id}-${c.id}">
              ${replies.map(r => this._renderReplyCard(r)).join('')}
            </div>
          ` : `<div class="pl-2 ml-1 border-l-2 border-slate-100 space-y-2 mt-0.5 hidden" id="replies-${p.id}-${c.id}"></div>`}
          <div class="hidden mt-1.5 flex items-center gap-2 pl-1 pr-2" id="reply-input-wrap-${p.id}-${c.id}">
            <input type="text" id="reply-input-${p.id}-${c.id}" inputmode="text" enterkeyhint="send" autocomplete="off"
              placeholder="Responder a ${escapeHtml(displayName).slice(0, 20)}..."
              class="flex-1 min-w-0 px-4 py-2.5 text-sm bg-white border-2 border-slate-200 rounded-full shadow-sm focus:ring-2 focus:ring-blue-300 outline-none transition-all">
            <button type="button" data-reply-send data-post="${p.id}" data-comment="${c.id}" aria-label="Enviar respuesta"
              class="shrink-0 w-9 h-9 rounded-full bg-[#0B63C7] hover:bg-[#094a91] text-white flex items-center justify-center shadow transition-all active:scale-90">
              <i data-lucide="send" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>
      </div>`;
  },

  _renderReplyCard(r) {
    const cName = r.user_name || 'Usuario';
    const color = avatarColor(cName);
    return `
      <div class="flex gap-2 text-sm">
        <div class="w-7 h-7 rounded-full ${color} flex items-center justify-center font-black text-[10px] border-2 border-white shrink-0 shadow-sm">${escapeHtml(cName.charAt(0))}</div>
        <div class="bg-slate-100/80 p-2.5 rounded-2xl rounded-tl-none border border-slate-100 flex-1">
          <div class="flex items-center gap-2 mb-0.5">
            <span class="font-black text-slate-700 text-[11px]">${escapeHtml(cName)}</span>
            <span class="text-[9px] text-slate-400 font-bold">${commentTime(r.created_at)}</span>
          </div>
          <p class="text-slate-600 text-[13px] leading-relaxed">${escapeHtml(r.content)}</p>
        </div>
      </div>`;
  },

  // "Ver más comentarios" (cliente)
  expandComments(postId, offset) {
    const posts = AppState.get('feedPosts') || [];
    const post = posts.find(p => String(p.id) === String(postId));
    if (!post) return;
    const comments = Array.isArray(post.comments) ? post.comments : [];
    const topLevel = comments.filter(c => !c.parent_id);

    const moreBtn = document.querySelector(`[data-more-comments="${postId}"]`);
    const list = document.getElementById(`comments-list-${postId}`);
    if (!moreBtn || !list) return;

    moreBtn.remove();
    topLevel.slice(offset, offset + TOP_COMMENTS).forEach(c => {
      list.insertAdjacentHTML('beforeend', this._renderCommentCard(c, post, (id) => comments.filter(x => String(x.parent_id) === String(id))));
    });

    const remaining = topLevel.length - (offset + TOP_COMMENTS);
    if (remaining > 0) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wall-more-comments';
      btn.dataset.moreComments = postId;
      btn.dataset.offset = offset + TOP_COMMENTS;
      btn.textContent = `Ver ${remaining} comentarios más`;
      list.appendChild(btn);
    }
    if (window.lucide) lucide.createIcons();
  },

  /**
   * Muestra/oculta sección de comentarios
   */
  showComments(postId) {
    const section = document.getElementById(`comments-section-${postId}`);
    if (section) {
      section.classList.toggle('hidden');
      // Scroll into view when opening
      if (!section.classList.contains('hidden')) {
        section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        const input = document.getElementById(`comment-input-${postId}`);
        if (input) setTimeout(() => input.focus(), 150);
      } else {
        const input = document.getElementById(`comment-input-${postId}`);
        if (input) input.blur();
      }
    }
  },

  /**
   * Envía un comentario en un post
   */
  async sendComment(postId) {
    const input = document.getElementById(`comment-input-${postId}`);
    const content = input?.value.trim();
    if (!content) return;

    // Rate limiting
    try {
      const { checkRateLimit, commentLimiter } = await import('../shared/rate-limiter.js');
      if (!checkRateLimit(commentLimiter, 'comentarios')) return;
    } catch (_) {} // rate-limiter optional

    const user    = AppState.get('user');
    const student = AppState.get('currentStudent');
    if (!user) return;

    const authorName = student?.name || 'Padre';

    // Optimistic UI — agregar el comentario inmediatamente sin recargar
    const commentsList = document.getElementById(`comments-list-${postId}`);
    const tempId = `temp-comment-${Date.now()}`;
    if (commentsList) {
      // Quitar el placeholder "Sé el primero en comentar"
      const placeholder = commentsList.querySelector('.italic');
      if (placeholder) placeholder.remove();

      const tempEl = document.createElement('div');
      tempEl.id = tempId;
      tempEl.className = 'flex gap-2 text-sm animate-slideInUp';
      tempEl.innerHTML = this._renderCommentCard({
        id: tempId,
        user_name: authorName,
        content,
        created_at: new Date().toISOString(),
        parent_id: null
      }, { id: postId, comments: [] }, () => []);
      commentsList.appendChild(tempEl);
      commentsList.scrollTop = commentsList.scrollHeight;

      const countBtn = document.querySelector(`[data-action="comment"][data-post-id="${postId}"] .tabular-nums`) ||
                       document.querySelector(`[data-action="comment"][data-post-id="${postId}"]`);
      if (countBtn) {
        const current = parseInt(countBtn.textContent || '0', 10) || 0;
        countBtn.textContent = String(current + 1);
      }
    }

    // Limpiar input inmediatamente
    input.value = '';

    // Mantener el foco (teclado abierto en móvil) para seguir comentando
    setTimeout(() => {
      if (input && document.activeElement !== input) input.focus({ preventScroll: true });
    }, 60);

    try {
      const { data: newComment, error } = await supabase.from('comments').insert({
        post_id:   postId,
        user_id:   user.id,
        user_name: authorName,
        content,
        parent_id: null
      }).select('id, content, user_name, created_at').single();

      if (error) throw error;

      // Reemplazar el comentario temporal con el real
      const tempEl = document.getElementById(tempId);
      if (tempEl && newComment) {
        tempEl.id = `comment-${newComment.id}`;
        tempEl.classList.remove('animate-slideInUp');
      }

      // Actualizar estado local
      const posts = AppState.get('feedPosts') || [];
      const idx = posts.findIndex(p => String(p.id) === String(postId));
      if (idx !== -1) posts[idx] = { ...posts[idx], comments: [...(posts[idx].comments || []), newComment] };
      AppState.set('feedPosts', posts);

    } catch (err) {
      // Revertir optimistic — quitar el comentario temporal
      document.getElementById(tempId)?.remove();
      input.value = content; // restaurar el texto
      const countBtn = document.querySelector(`[data-action="comment"][data-post-id="${postId}"] .tabular-nums`) ||
                       document.querySelector(`[data-action="comment"][data-post-id="${postId}"]`);
      if (countBtn) {
        const current = parseInt(countBtn.textContent || '0', 10) || 0;
        countBtn.textContent = String(Math.max(0, current - 1));
      }
      Helpers.toast('Error al enviar comentario', 'error');
    }
  },

  /**
   * Envía una respuesta a un comentario
   */
  async sendReply(postId, parentId) {
    const input = document.getElementById(`reply-input-${postId}-${parentId}`);
    const content = input?.value.trim();
    if (!content) return;

    const user    = AppState.get('user');
    const student = AppState.get('currentStudent');
    if (!user) return;
    const authorName = student?.name || 'Padre';

    const repliesWrap = document.getElementById(`replies-${postId}-${parentId}`);
    if (repliesWrap) {
      if (repliesWrap.classList.contains('hidden')) repliesWrap.classList.remove('hidden');
      const tempEl = document.createElement('div');
      tempEl.innerHTML = this._renderReplyCard({ user_name: authorName, content, created_at: new Date().toISOString() });
      repliesWrap.appendChild(tempEl);
      repliesWrap.scrollTop = repliesWrap.scrollHeight;
    }

    input.value = '';
    setTimeout(() => {
      if (input && document.activeElement !== input) input.focus({ preventScroll: true });
    }, 60);

    try {
      const { data: newComment, error } = await supabase.from('comments').insert({
        post_id: postId,
        user_id: user.id,
        user_name: authorName,
        content,
        parent_id: parentId
      }).select('id, content, user_name, created_at, parent_id').single();
      if (error) throw error;

      const posts = AppState.get('feedPosts') || [];
      const idx = posts.findIndex(p => String(p.id) === String(postId));
      if (idx !== -1) posts[idx] = { ...posts[idx], comments: [...(posts[idx].comments || []), newComment] };
      AppState.set('feedPosts', posts);
    } catch (err) {
      Helpers.toast('Error al enviar la respuesta', 'error');
    }
  },

  // ============================================================
  // REACCIONES: tap corto (like) / mantener presionado (selector)
  // ============================================================
  async reactToPost(postId, type) {
    const user = AppState.get('user');
    if (!user) return;
    if (!WALL_REACTIONS[type]) return;

    const prev = this._feedReaction[postId]?.my || null;
    const next = prev === type ? null : type;
    const st = this._feedReaction[postId] || { breakdown: {}, total: 0, my: null };

    if (prev) { st.breakdown[prev] = Math.max(0, (st.breakdown[prev] || 0) - 1); st.total = Math.max(0, st.total - 1); }
    if (next) { st.breakdown[next] = (st.breakdown[next] || 0) + 1; st.total = st.total + 1; }
    st.my = next;
    this._feedReaction[postId] = st;

    this._applyReactionState(postId, st);

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
      // Revertir optimista
      if (next) { st.breakdown[next] = Math.max(0, (st.breakdown[next] || 0) - 1); st.total = Math.max(0, st.total - 1); }
      if (prev) { st.breakdown[prev] = (st.breakdown[prev] || 0) + 1; st.total = st.total + 1; }
      st.my = prev;
      this._applyReactionState(postId, st);
      Helpers.toast('No se pudo actualizar la reacción', 'error');
    }

    // Actualizar estado global para futuros renders
    const posts = AppState.get('feedPosts') || [];
    const idx = posts.findIndex(p => String(p.id) === String(postId));
    if (idx !== -1) {
      const updatedLikes = prev === type
        ? (posts[idx].likes || []).filter(l => l.user_id !== user.id)
        : [...(posts[idx].likes || []).filter(l => l.user_id !== user.id), { user_id: user.id, reaction_type: next, id: `temp-${Date.now()}` }];
      posts[idx] = { ...posts[idx], likes: updatedLikes };
      AppState.set('feedPosts', posts);
    }
  },

  _applyReactionState(postId, st) {
    const posts = AppState.get('feedPosts') || [];
    const post = posts.find(p => String(p.id) === String(postId));
    const btn = document.querySelector(`[data-react-post="${postId}"]`);
    if (btn) btn.outerHTML = this._renderReactionButton(post || { id: postId }, st.my);

    const emojiHtml = () => REACTION_ORDER.filter(t => (st.breakdown[t] || 0) > 0).slice(0, 3)
      .map(t => `<span class="text-sm">${WALL_REACTIONS[t].emoji}</span>`).join('');
    // Actualizar resumen de reacciones si existe
    const card = document.querySelector(`[data-react-post="${postId}"]`)?.closest('.animate-fade-in');
    if (card) {
      const summary = card.querySelector('.wall-emoji-summary');
      const totalEl = card.querySelector('.tabular-nums.text-\\[\\#0B63C7\\]');
      if (summary) {
        summary.innerHTML = emojiHtml();
        if (totalEl) totalEl.textContent = String(st.total);
      } else if (st.total > 0) {
        // No había resumen: recrear la fila completa
        const actionRow = card.querySelector('.border-t.border-slate-50');
        if (actionRow) actionRow.insertAdjacentHTML('beforebegin', `
          <div class="flex items-center justify-between px-0.5 py-1.5">
            <div class="flex items-center gap-1.5 text-xs font-bold text-slate-500 wall-summary-wrap">
              <span class="flex items-center -space-x-1 wall-emoji-summary">${emojiHtml()}</span>
              <span class="ml-0.5 tabular-nums text-[#0B63C7] wall-summary-total">${st.total}</span>
            </div>
          </div>`);
      }
    }
  },

  openReactionPicker(postId, ev) {
    this.closePopovers();
    const btn = document.querySelector(`[data-react-post="${postId}"]`);
    if (!btn) return;

    const rect = btn.getBoundingClientRect();
    const card = document.createElement('div');
    card.className = 'wall-picker-card';
    card.style.left = `${Math.max(8, rect.left + rect.width / 2 - 110)}px`;
    card.style.top = `${Math.max(8, rect.top - 64)}px`;
    card.dataset.postId = postId;

    const selected = this._feedReaction[postId]?.my || null;

    card.innerHTML = REACTION_ORDER.map(t => `
      <button type="button" class="wall-emoji-btn${selected === t ? ' wall-picker-selected' : ''}" data-reaction-option="${t}" title="${WALL_REACTIONS[t].label}">
        ${WALL_REACTIONS[t].emoji}
      </button>`).join('');

    card.addEventListener('click', async (e) => {
      const opt = e.target.closest('[data-reaction-option]');
      if (!opt) return;
      await this.reactToPost(postId, opt.dataset.reactionOption);
      this.closePopovers();
    });

    document.body.appendChild(card);
    this._activePopover = card;
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
      if (this._activePopover && !e.target.closest('.wall-picker-card')) this.closePopovers();
    });
    ['scroll', 'resize'].forEach(evt => window.addEventListener(evt, () => this.closePopovers(), { passive: true }));
  },

  /**
   * Realtime para el muro
   * Escucha posts del aula Y posts generales (classroom_id IS NULL)
   */
  initRealtime() {
    if (this._channel) supabase.removeChannel(this._channel);

    this._channel = supabase
      .channel(`feed_padre_${this._classroomId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'posts'
      }, (payload) => {
        const { eventType, new: newPost, old: oldPost } = payload;

        // Filtrar por aula si aplica
        if (this._classroomId && newPost.classroom_id && newPost.classroom_id !== this._classroomId) {
          return;
        }

        if (eventType === 'INSERT') {
          Helpers.toast('📢 Nueva publicación en el muro', 'info');
          this.loadPosts();
        }

        if (eventType === 'UPDATE') {
          // Reacciones/avisos ya se sincronizan por los canales de likes/comments;
          // recargar solo si cambió fijada o aviso importante
          const prev = oldPost || {};
          if ((newPost.is_pinned !== prev.is_pinned) || (newPost.is_important !== prev.is_important)) {
            this.loadPosts();
          }
        }

        if (eventType === 'DELETE') {
          const postEl = document.querySelector(`[data-post-id="${oldPost.id}"]`)?.closest('.animate-fade-in');
          if (postEl) postEl.remove();
        }
      })
      // Realtime para reacciones — sincronizar contador sin recargar
      .on('postgres_changes', { event: '*', schema: 'public', table: 'likes' }, async (payload) => {
        const postId = payload.new?.post_id || payload.old?.post_id;
        if (!postId) return;
        if (!document.querySelector(`[data-react-post="${postId}"]`)) return;
        this._syncPostCounts(postId);
      })
      // Realtime para comentarios — actualizar contador y lista abierta sin recargar
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, async (payload) => {
        const postId = payload.new?.post_id || payload.old?.post_id;
        if (!postId) return;
        if (!document.querySelector(`[data-action="comment"][data-post-id="${postId}"]`)) return;
        this._syncPostCounts(postId, true);
      });

    RealtimeUtils.monitorChannel(this._channel, `FeedPadre_${this._classroomId}`);
  },

  /**
   * Re-sincroniza conteos de likes/comentarios (y la lista de comentarios abierta)
   */
  async _syncPostCounts(postId, refreshComments = false) {
    const [likesRes, commentsRes] = await Promise.allSettled([
      supabase.from('likes').select('id, post_id, user_id, reaction_type').eq('post_id', postId),
      supabase.from('comments')
        .select('id, content, user_name, user_id, created_at, parent_id')
        .eq('post_id', postId)
        .order('created_at', { ascending: true })
    ]);

    const likes    = likesRes.status === 'fulfilled' ? (likesRes.value.data || []) : null;
    const comments = commentsRes.status === 'fulfilled' ? (commentsRes.value.data || []) : null;

    const posts = AppState.get('feedPosts') || [];
    const idx = posts.findIndex(p => String(p.id) === String(postId));
    if (idx !== -1) {
      const updated = { ...posts[idx] };
      if (likes) updated.likes = likes;
      if (comments) updated.comments = comments;
      posts[idx] = updated;
      AppState.set('feedPosts', posts);
    }

    const user = AppState.get('user');

    // Reacciones: recalcular desglose y re-render del botón
    const btnReact = document.querySelector(`[data-react-post="${postId}"]`);
    if (btnReact && likes) {
      const breakdown = {};
      let total = 0;
      likes.forEach(l => {
        const t = WALL_REACTIONS[l.reaction_type] ? l.reaction_type : 'like';
        breakdown[t] = (breakdown[t] || 0) + 1;
        total++;
      });
      const mine = likes.find(l => l.user_id === user?.id);
      this._feedReaction[postId] = {
        breakdown,
        total,
        my: mine ? (WALL_REACTIONS[mine.reaction_type] ? mine.reaction_type : 'like') : null
      };
      this._applyReactionState(postId, this._feedReaction[postId]);
    }

    // Comentarios: contador de comentarios principales
    const topLevelCount = comments ? comments.filter(c => !c.parent_id).length : 0;
    const btnComm = document.querySelector(`[data-action="comment"][data-post-id="${postId}"]`);
    if (btnComm && comments) {
      const countEl = btnComm.querySelector('.tabular-nums');
      if (countEl) countEl.textContent = String(topLevelCount);
      else btnComm.innerHTML = `<i data-lucide="message-circle" class="w-5 h-5"></i> ${topLevelCount} Comentarios`;
    }

    if (window.lucide) lucide.createIcons();

    if (refreshComments && comments) {
      const section = document.getElementById(`comments-section-${postId}`);
      const list    = document.getElementById(`comments-list-${postId}`);
      if (section && list && !section.classList.contains('hidden')) {
        const topLevel = comments.filter(c => !c.parent_id);
        const repliesOf = (id) => comments.filter(c => String(c.parent_id) === String(id));
        list.innerHTML = this._renderCommentGroup({ id: postId }, topLevel, repliesOf);
        if (window.lucide) lucide.createIcons();
      }
    }
  },

  /**
   * Descarga un archivo multimedia usando fetch+blob para evitar bloqueo CORS
   */
  async downloadMedia(url, type = 'image') {
    try {
      const btn = event?.currentTarget;
      if (btn) { btn.innerHTML = '<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i> ...'; if (window.lucide) lucide.createIcons(); }

      const response = await fetch(url, { mode: 'cors' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);

      const ext = url.split('?')[0].split('.').pop() || (type === 'video' ? 'mp4' : 'jpg');
      const filename = `karpus_${Date.now()}.${ext}`;

      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);

      if (btn) { btn.innerHTML = '<i data-lucide="check" class="w-3.5 h-3.5"></i> Listo'; if (window.lucide) lucide.createIcons(); setTimeout(() => { btn.innerHTML = '<i data-lucide="download" class="w-3.5 h-3.5"></i> Descargar'; if (window.lucide) lucide.createIcons(); }, 2000); }
    } catch (err) {
      // Fallback: abrir en nueva pestaña si fetch falla
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  },

  /** Mantener compatibilidad con llamadas antiguas */
  async toggleLike(postId) {
    await this.reactToPost(postId, this._feedReaction[postId]?.my || 'like');
  },

  async destroy() {
    if (this._channel) {
      Try(() => supabase.removeChannel(this._channel));
      this._channel = null;
    }
    if (this._freshnessTimer) { clearInterval(this._freshnessTimer); this._freshnessTimer = null; }
    this.closePopovers();
  }
};

function Try(fn) { try { fn(); } catch (_) {} }