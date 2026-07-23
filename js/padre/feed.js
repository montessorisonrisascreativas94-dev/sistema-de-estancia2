import { supabase, RealtimeUtils } from '../shared/supabase.js';
import { AppState } from './appState.js';
import { Helpers, escapeHtml } from '../shared/helpers.js';
import { ImageLoader } from '../shared/image-loader.js';
import { Security } from '../shared/security.js';

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

/**
 * 📱 MÓDULO DE MURO (FEED)
 */
export const FeedModule = {
  _classroomId: null,
  _channel: null,

  /**
   * Inicializa el muro
   * Carga posts del aula directamente (sin depender de WallModule/muroPostsContainer)
   */
  async init() {
    const student = AppState.get('currentStudent');
    const parent  = AppState.get('user');
    if (!student || !parent) return;

    this._classroomId = student.classroom_id;
    await this.loadPosts();
    this._bindFeedEvents();
    this.initRealtime();
  },

  /**
   * Bind click delegation for likes, comments, comment toggles
   * Called once after loadPosts — uses a single delegated listener on #classFeed
   */
  _bindFeedEvents() {
    const container = document.getElementById('classFeed');
    if (!container || container._feedBound) return;
    container._feedBound = true;

    container.addEventListener('click', async (e) => {
      const likeBtn = e.target.closest('[data-action="like"]');
      if (likeBtn) {
        const postId = likeBtn.dataset.postId;
        if (postId) await this.toggleLike(postId);
        return;
      }

      const commentToggle = e.target.closest('[data-action="comment"]');
      if (commentToggle) {
        const postId = commentToggle.dataset.postId;
        if (postId) this.showComments(postId);
        return;
      }

      const sendCommentBtn = e.target.closest('[data-action="send-comment"]');
      if (sendCommentBtn) {
        const postId = sendCommentBtn.dataset.postId;
        if (postId) await this.sendComment(postId);
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
      const { data: posts, error } = await supabase
        .from('posts')
        .select(`
          id, content, media_url, media_type, created_at, classroom_id,
          teacher:teacher_id ( id, name, avatar_url )
        `)
        .or(`classroom_id.is.null,classroom_id.eq.${student?.classroom_id || 0}`)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      // Enrich with likes/comments counts
      const postIds = (posts || []).map(p => p.id);
      let likesMap = {}, commentsMap = {};

      if (postIds.length > 0) {
        const [likesRes, commentsRes] = await Promise.allSettled([
          supabase.from('likes').select('id, post_id, user_id').in('post_id', postIds),
          supabase.from('comments').select('post_id, id, content, user_name, user_id, created_at').in('post_id', postIds)
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
  },

  /**
   * Crea el HTML de un post individual
   */
  createPostHTML(p) {
    // teacher puede venir como objeto o array (según la fuente)
    const teacher = Array.isArray(p.teacher) ? p.teacher[0] : (p.teacher || {});
    const teacherName   = teacher.name   || p.teacher_name   || 'Maestra';
    const teacherAvatar = teacher.avatar_url || p.teacher_avatar || null;
    const date = Helpers.formatDate(p.created_at);
    const myId = AppState.get('user')?.id;
    const likes = Array.isArray(p.likes) ? p.likes : [];
    const comments = Array.isArray(p.comments) ? p.comments : [];
    const isLiked = likes.some(l => l.user_id === myId);
    
    let mediaHTML = '';
    if (p.media_url) {
      const isVideo = p.media_url.match(/\.(mp4|webm|ogg|mov)$/i);
      const optimizedUrl = p.media_url;
      if (isVideo) {
        mediaHTML = `
          <div class="relative group/media rounded-2xl overflow-hidden mb-4 bg-black">
            ${ImageLoader.video(p.media_url, '', { cls: 'w-full max-h-80 object-cover' })}
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

    return `
      <div class="bg-white p-5 rounded-[2.5rem] border-2 border-slate-50 mb-6 shadow-sm hover:shadow-md transition-all animate-fade-in">
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
              <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">${date} ${freshnessBadge(p.created_at)}</p>
            </div>
          </div>
          <span class="px-3 py-1 bg-slate-50 text-slate-400 text-[9px] font-black uppercase rounded-full border border-slate-100">Comunicado</span>
        </div>

        <p class="text-sm text-slate-600 leading-relaxed mb-4">${escapeHtml(p.content || '')}</p>
        
        ${mediaHTML}

        <div class="flex items-center gap-4 pt-4 border-t border-slate-50">
          <button data-action="like" data-post-id="${p.id}" class="flex items-center gap-2 text-xs font-black uppercase tracking-tighter ${isLiked ? 'text-[#0B63C7]' : 'text-slate-400'} hover:scale-105 transition-all">
            <i data-lucide="heart" class="w-4 h-4 ${isLiked ? 'fill-current' : ''}"></i>
            ${likes.length} Me gusta
          </button>
          <button data-action="comment" data-post-id="${p.id}" class="flex items-center gap-2 text-xs font-black uppercase tracking-tighter text-slate-400 hover:text-blue-600 transition-all">
            <i data-lucide="message-circle" class="w-4 h-4"></i>
            ${comments.length} Comentarios
          </button>
          ${p.media_url ? `
          <button data-action="download-media" data-url="${escapeHtml(p.media_url)}" data-type="${p.media_url.match(/\.(mp4|webm|ogg|mov)$/i) ? 'video' : 'image'}"
             class="ml-auto flex items-center gap-1.5 text-xs font-black uppercase tracking-tighter text-slate-400 hover:text-emerald-600 transition-all">
            <i data-lucide="download" class="w-4 h-4"></i>
            Descargar
          </button>` : ''}
        </div>

        <div id="comments-section-${p.id}" class="hidden mt-4 pt-4 border-t border-slate-50 bg-slate-50/50 -mx-5 px-5 pb-2">
          <div id="comments-list-${p.id}" class="space-y-3 mb-3 max-h-48 overflow-y-auto">
            ${comments.length === 0
              ? '<p class="text-center text-[10px] text-slate-400 italic py-2">Sé el primero en comentar.</p>'
              : comments.map(c => {
                  const cName = c.user_name || c.user?.name || 'Usuario';
                  return `<div class="flex gap-2 text-xs"><div class="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-[9px] shrink-0">${cName.charAt(0)}</div><div class="bg-white p-2 rounded-xl rounded-tl-none border border-slate-100 flex-1"><span class="font-bold text-slate-700">${escapeHtml(cName)}</span><p class="text-slate-600 mt-0.5">${escapeHtml(c.content)}</p></div></div>`;
                }).join('')
            }
          </div>
          <div class="flex gap-2">
            <input type="text" id="comment-input-${p.id}" class="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-400 outline-none" placeholder="Escribe un comentario...">
            <button data-action="send-comment" data-post-id="${p.id}" class="p-2 bg-[#0B63C7] text-white rounded-xl hover:bg-[#094a91] transition-colors"><i data-lucide="send" class="w-4 h-4"></i></button>
          </div>
        </div>
      </div>
    `;
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
      tempEl.className = 'flex gap-2 text-xs opacity-60';
      tempEl.innerHTML = `
        <div class="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center font-bold text-[9px] text-blue-600 shrink-0">
          ${authorName.charAt(0).toUpperCase()}
        </div>
        <div class="bg-white p-2 rounded-xl rounded-tl-none border border-slate-100 shadow-sm flex-1">
          <div class="flex justify-between">
            <span class="font-bold text-slate-700">${escapeHtml(authorName)}</span>
            <span class="text-[9px] text-slate-400">ahora</span>
          </div>
          <p class="text-slate-600 mt-0.5">${escapeHtml(content)}</p>
        </div>`;
      commentsList.appendChild(tempEl);
      commentsList.scrollTop = commentsList.scrollHeight;
    }

    // Limpiar input inmediatamente
    input.value = '';

    try {
      const { data: newComment, error } = await supabase.from('comments').insert({
        post_id:   postId,
        user_id:   user.id,
        user_name: authorName,
        content
      }).select('id, content, user_name, created_at').single();

      if (error) throw error;

      // Reemplazar el comentario temporal con el real
      const tempEl = document.getElementById(tempId);
      if (tempEl && newComment) {
        tempEl.id = `comment-${newComment.id}`;
        tempEl.classList.remove('opacity-60');
      }

      // Actualizar contador de comentarios en el botón
      const countBtn = document.querySelector(`[data-action="comment"][data-post-id="${postId}"]`);
      if (countBtn) {
        const comments = AppState.get('feedPosts')?.find(p => String(p.id) === String(postId))?.comments || [];
        countBtn.innerHTML = `<i data-lucide="message-circle" class="w-4 h-4"></i> ${comments.length + 1} Comentarios`;
        if (window.lucide) lucide.createIcons();
      }

    } catch (err) {
      // Revertir optimistic — quitar el comentario temporal
      document.getElementById(tempId)?.remove();
      input.value = content; // restaurar el texto
      Helpers.toast('Error al enviar comentario', 'error');
    }
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
          // Sincronizar contadores de likes/comentarios sin recargar todo
          const btnLike = document.querySelector(`[data-action="like"][data-post-id="${newPost.id}"]`);
          const btnComm = document.querySelector(`[data-action="comment"][data-post-id="${newPost.id}"]`);

          if (btnLike && typeof newPost.likes_count === 'number') {
            const span = btnLike.querySelector('span') || btnLike;
            span.textContent = `${newPost.likes_count} Me gusta`;
          }

          if (btnComm && typeof newPost.comments_count === 'number') {
            const span = btnComm.querySelector('span') || btnLike;
            span.textContent = `${newPost.comments_count} Comentarios`;
          }
        }

        if (eventType === 'DELETE') {
          const postEl = document.querySelector(`[data-post-id="${oldPost.id}"]`)?.closest('.animate-fade-in');
          if (postEl) postEl.remove();
        }
      });

    RealtimeUtils.monitorChannel(this._channel, `FeedPadre_${this._classroomId}`);
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

  async toggleLike(postId) {
    const user  = AppState.get('user');
    const posts = AppState.get('feedPosts') || [];
    const post  = posts.find(p => String(p.id) === String(postId));
    const existingLike = post?.likes?.find(l => l.user_id === user?.id);

    const btn       = document.querySelector(`[data-action="like"][data-post-id="${postId}"]`);
    const isLiked   = !!existingLike;
    const curCount  = post?.likes?.length || 0;
    const newCount  = isLiked ? curCount - 1 : curCount + 1;

    // Optimistic UI — blue theme, update full button text
    if (btn) {
      btn.innerHTML = `<i data-lucide="heart" class="w-4 h-4 ${!isLiked ? 'fill-current' : ''}"></i> ${newCount} Me gusta`;
      btn.className = btn.className
        .replace(/text-\w+-\d+/g, '')
        .trim() + (isLiked ? ' text-slate-400' : ' text-[#0B63C7]');
      if (window.lucide) lucide.createIcons();
    }

    // Update local state
    if (post) {
      const updatedLikes = isLiked
        ? (post.likes || []).filter(l => l.user_id !== user.id)
        : [...(post.likes || []), { user_id: user.id, id: `temp-${Date.now()}` }];
      const idx = posts.findIndex(p => String(p.id) === String(postId));
      if (idx !== -1) posts[idx] = { ...posts[idx], likes: updatedLikes };
    }

    try {
      if (existingLike) {
        await supabase.from('likes').delete().eq('id', existingLike.id);
      } else {
        const { data: insertedLike } = await supabase.from('likes').insert({ post_id: postId, user_id: user.id }).select('id').single();
        // Update the temp id with real id
        if (post) {
          const idx = posts.findIndex(p => String(p.id) === String(postId));
          if (idx !== -1) {
            const updatedLikes = posts[idx].likes.map(l => l.id?.startsWith('temp-') && insertedLike ? { ...l, id: insertedLike.id } : l);
            posts[idx] = { ...posts[idx], likes: updatedLikes };
          }
        }
      }
    } catch (err) {
      // Revert optimistic on error
      // Like toggle failed — revert optimistic
      if (btn) {
        btn.innerHTML = `<i data-lucide="heart" class="w-4 h-4 ${isLiked ? 'fill-current' : ''}"></i> ${curCount} Me gusta`;
        btn.className = btn.className.replace(/text-\w+-\d+/g,'').trim() + (isLiked ? ' text-[#0B63C7]' : ' text-slate-400');
        if (window.lucide) lucide.createIcons();
      }
    }
  }
};
