/**
 * Chat Module — Panel Padre (estilo Messenger profesional)
 */
import { supabase } from '../shared/supabase.js';
import { AppState } from './appState.js';
import { Helpers, escapeHtml } from '../shared/helpers.js';
import {
  ChatModule as SharedChatModule,
  fmtMsgTime,
  fmtLastMsgTime,
  truncateLastMsg,
  groupMessages,
  withDaySeparators,
} from '../shared/chat.js';
import { ScrollModule } from '../shared/scroll.module.js';
import { Security } from '../shared/security.js';

export const ChatModule = {
  _contacts: [],
  _activeContact: null,
  _conversationId: null,
  _channel: null,
  _topScrollDestroy: null,
  _globalMsgSub: null,
  _anyMsgUnsubscribe: null,

  async init() {
    const grid = document.getElementById('chatShell');
    if (!grid) return;

    // En móvil, mostramos la lista al iniciar
    grid.classList.add('is-view-list');

    // Bindear una sola vez
    const sendBtn = document.getElementById('mChatSendBtn');
    const input = document.getElementById('mChatInput');
    if (sendBtn && !sendBtn._bound) {
      sendBtn._bound = true;
      sendBtn.addEventListener('click', () => this.sendMessage());
      if (input) {
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.sendMessage();
          }
        });
        // Auto-height textarea
        input.addEventListener('input', () => {
          input.style.height = 'auto';
          input.style.height = Math.min(input.scrollHeight, 140) + 'px';
        });
      }
    }

    // Botón atrás móvil (regresa a lista)
    const backBtn = document.getElementById('mChatBackBtn');
    if (backBtn && !backBtn._bound) {
      backBtn._bound = true;
      backBtn.addEventListener('click', () => {
        grid.classList.remove('is-view-chat');
        grid.classList.add('is-view-list');
      });
    }

    // Buscador
    const search = document.getElementById('mChatSearch');
    if (search && !search._bound) {
      search._bound = true;
      search.addEventListener('input', ScrollModule.debounce(() => this._renderContacts(), 200));
    }

    // Click en contacto (delegación)
    const list = document.getElementById('mChatList');
    if (list && !list._bound) {
      list._bound = true;
      Helpers.delegate(list, '[data-contact-id]', 'click', (_e, el) => {
        this.selectContact(el.dataset.contactId);
      });
    }

    // Suscripción global a CUALQUIER mensaje nuevo — ordena la lista + badge global
    if (this._anyMsgUnsubscribe) this._anyMsgUnsubscribe.unsubscribe();
    this._anyMsgUnsubscribe = SharedChatModule.onAnyNewMessage(() => {
      this.loadContacts(true);
      window._updateGlobalChatBadge?.();
    });

    await this.loadContacts();
  },

  /**
   * Carga contactos + último mensaje (estilo Messenger).
   * @param {boolean} quiet — true para no mostrar skeleton
   */
  async loadContacts(quiet = false) {
    const list = document.getElementById('mChatList');
    if (!list) return;
    if (!quiet) list.innerHTML = Helpers.skeleton(4, 'h-20');

    try {
      const student = AppState.get('currentStudent');
      if (!student) {
        list.innerHTML = Helpers.emptyState('No hay estudiante vinculado');
        return;
      }

      const contacts = await SharedChatModule.loadPadreContacts(student.id);
      if (!contacts.length) {
        list.innerHTML = Helpers.emptyState('No hay contactos disponibles');
        return;
      }

      // Enriquecer con último mensaje + no leídos + orden automático
      this._contacts = await SharedChatModule.enrichContactsWithLastMessage(contacts);
      this._renderContacts();
    } catch (err) {
      list.innerHTML = Helpers.emptyState('Error al cargar contactos');
    }
  },

  _renderContacts() {
    const list = document.getElementById('mChatList');
    if (!list) return;
    const q = (document.getElementById('mChatSearch')?.value || '').toLowerCase().trim();

    const items = this._contacts.filter(c => {
      if (!q) return true;
      return (
        (c.name || '').toLowerCase().includes(q) ||
        (c.roleLabel || c.role || '').toLowerCase().includes(q) ||
        (c.lastMessage || '').toLowerCase().includes(q)
      );
    });

    if (!items.length) {
      list.innerHTML = `<div class="p-6 text-center text-sm text-slate-400 font-bold">Sin resultados</div>`;
      return;
    }

    list.innerHTML = items.map(c => {
      const isActive = this._activeContact?.id === c.id;
      const isNew = c.unread > 0;

      // Previzualización del último mensaje
      let lastPreview = truncateLastMsg(c.lastMessage || 'Aún no hay mensajes');
      const checks = c.lastMessageIsMine ? (c.lastMessageIsRead ? '✓✓' : '✓') + ' ' : '';
      if (c.lastMessageIsMine) lastPreview = `<span class="checks text-slate-400">${checks}</span>` + lastPreview;
      if (!c.lastMessage) lastPreview = '<span class="italic opacity-70">Comienza la conversación</span>';

      return `
      <div data-contact-id="${c.id}"
           class="m-conv-item ${isActive ? 'is-active' : ''} ${isNew ? 'is-new' : ''}">
        <div class="m-conv-item__avatar bg-gradient-to-br from-blue-400 to-blue-600">
          ${c.avatar_url
            ? `<img src="${Security.safeUrl(c.avatar_url)}" alt="">`
            : escapeHtml((c.name || '?').charAt(0))}
          ${c.id === 'online-demo' ? '<div class="m-conv-item__online"></div>' : ''}
        </div>

        ${isNew && !isActive ? `<div class="m-conv-item__unread">${c.unread > 9 ? '9+' : c.unread}</div>` : ''}

        <div class="m-conv-item__body">
          <div class="m-conv-item__top">
            <div class="m-conv-item__name">${escapeHtml(c.name)}</div>
            <div class="m-conv-item__time">${fmtLastMsgTime(c.lastMessageTime)}</div>
          </div>
          <div class="m-conv-item__bottom">
            <div class="m-conv-item__last">${lastPreview}</div>
            ${isNew ? '<div class="m-conv-item__dot"></div>' : ''}
          </div>
          <div class="m-conv-item__meta">${escapeHtml(c.roleLabel || c.role || '')}</div>
        </div>
      </div>`;
    }).join('');
  },

  async selectContact(contactId) {
    const contact = this._contacts.find(c => c.id === contactId);
    if (!contact) return;

    this._activeContact = contact;
    this._conversationId = null;

    // Mobile: cambiar vista
    const grid = document.getElementById('chatShell');
    grid?.classList.remove('is-view-list');
    grid?.classList.add('is-view-chat');

    // Actualizar header + info
    this._renderHeader(contact);
    this._renderInfoPanel(contact);

    // Marcar como leídos visualmente y actualizar lista
    contact.unread = 0;
    this._renderContacts();

    await this.loadMessages();
    this._initRealtime();
    window._updateGlobalChatBadge?.();
  },

  _renderHeader(c) {
    const nameEl = document.getElementById('mChatActiveName');
    const metaEl = document.getElementById('mChatActiveMeta');
    const avatarEl = document.getElementById('mChatActiveAvatar');

    if (nameEl) nameEl.textContent = c.name;
    if (metaEl) {
      metaEl.textContent = c.roleLabel || c.role || '';
      metaEl.dataset.original = c.roleLabel || c.role || '';
    }
    if (avatarEl) {
      avatarEl.classList.add('bg-gradient-to-br', 'from-blue-400', 'to-blue-600');
      avatarEl.innerHTML = c.avatar_url
        ? `<img src="${Security.safeUrl(c.avatar_url)}" alt="">`
        : escapeHtml((c.name || '?').charAt(0));
    }
  },

  _renderInfoPanel(c) {
    const container = document.getElementById('mChatInfo');
    if (!container) return;

    const totalMessages = this._conversationId ? '…' : '—';
    const sinceLabel = c.lastMessageTime
      ? new Date(c.lastMessageTime).toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' })
      : 'Nuevo';

    container.innerHTML = `
      <div class="m-info-profile">
        <div class="m-info-profile__avatar">
          ${c.avatar_url ? `<img src="${Security.safeUrl(c.avatar_url)}" alt="">` : escapeHtml((c.name || '?').charAt(0))}
        </div>
        <div class="m-info-profile__name">${escapeHtml(c.name)}</div>
        <div class="m-info-profile__role">${escapeHtml(c.roleLabel || c.role || '')}</div>
      </div>

      <div class="m-info-card">
        <div class="m-info-card__title">Detalles</div>
        <div class="m-info-profile__meta">
          <div><span>Rol</span><span>${escapeHtml(c.roleLabel || c.role || '')}</span></div>
          <div><span>Contacto desde</span><span>${sinceLabel}</span></div>
          <div><span>Estado</span><span class="text-green-600">Activo</span></div>
        </div>
      </div>

      <div class="m-info-card">
        <div class="m-info-card__title">Estadísticas</div>
        <div class="m-info-statrow">
          <div class="m-info-stat">
            <div class="m-info-stat__num">${totalMessages}</div>
            <div class="m-info-stat__lbl">Mensajes</div>
          </div>
          <div class="m-info-stat">
            <div class="m-info-stat__num">${c.unread || 0}</div>
            <div class="m-info-stat__lbl">No leídos</div>
          </div>
          <div class="m-info-stat">
            <div class="m-info-stat__num">100%</div>
            <div class="m-info-stat__lbl">Entregados</div>
          </div>
        </div>
      </div>

      <div class="m-info-card">
        <div class="m-info-card__title">Acciones rápidas</div>
        <div style="display:flex;flex-direction:column;gap:.35rem;">
          <div class="m-info-listitem" role="button">
            <div class="m-info-listitem__icon"><i data-lucide="phone" class="w-4 h-4"></i></div>
            <div class="m-info-listitem__body">
              <div class="m-info-listitem__label">Llamar</div>
              <div class="m-info-listitem__sub">Aviso: necesita permiso</div>
            </div>
          </div>
          <div class="m-info-listitem" role="button">
            <div class="m-info-listitem__icon"><i data-lucide="search" class="w-4 h-4"></i></div>
            <div class="m-info-listitem__body">
              <div class="m-info-listitem__label">Buscar en conversación</div>
              <div class="m-info-listitem__sub">Palabras clave</div>
            </div>
          </div>
          <div class="m-info-listitem" role="button">
            <div class="m-info-listitem__icon"><i data-lucide="flag" class="w-4 h-4"></i></div>
            <div class="m-info-listitem__body">
              <div class="m-info-listitem__label">Reportar mensaje</div>
              <div class="m-info-listitem__sub">Solo si es necesario</div>
            </div>
          </div>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  },

  async loadMessages(loadMore = false) {
    const container = document.getElementById('mChatScroll');
    if (!container) return;

    if (!loadMore) {
      container.innerHTML = `
        <div class="m-empty">
          <div class="m-empty__icon"><i data-lucide="loader-2" class="w-8 h-8 animate-spin"></i></div>
        </div>`;
      if (window.lucide) lucide.createIcons();
      SharedChatModule.resetPagination(this._conversationId);
    }

    try {
      const { messages, conversationId, hasMore } = await SharedChatModule.loadConversation(
        this._activeContact.id, this._conversationId, loadMore
      );
      this._conversationId = conversationId;

      if (!loadMore) {
        if (!messages.length) {
          container.innerHTML = `
            <div class="m-empty">
              <div class="m-empty__icon"><i data-lucide="message-circle-heart" class="w-8 h-8"></i></div>
              <div class="m-empty__title">Inicia la conversación</div>
              <div class="m-empty__text">Saluda a ${escapeHtml(this._activeContact.name)} y cuéntale cómo va el día.</div>
            </div>`;
          if (window.lucide) lucide.createIcons();
          return;
        }
        this._renderMessages(messages, container);
        ScrollModule.scrollToBottom(container);

        // Cargar más al hacer scroll arriba
        if (this._topScrollDestroy) this._topScrollDestroy();
        if (hasMore !== false) {
          const { destroy } = ScrollModule.topScroll({
            container,
            loadFn: () => this.loadMessages(true),
          });
          this._topScrollDestroy = destroy;
        }

        // Marcar leídos
        SharedChatModule.markAsRead(this._conversationId);
      } else {
        // Insertar arriba (mensajes más antiguos)
        const scrollBefore = container.scrollTop;
        const heightBefore = container.scrollHeight;
        this._appendOlderMessages(messages, container);
        const scrollAfter = container.scrollHeight - heightBefore + scrollBefore;
        container.scrollTop = scrollAfter;
      }
    } catch (err) {
      console.error(err);
      if (!loadMore) container.innerHTML = Helpers.errorState('Error al cargar mensajes');
    }
  },

  _renderMessages(messages, container) {
    const user = AppState.get('user');
    const groups = groupMessages(messages, user?.id);
    const flat = withDaySeparators(messages);
    container.innerHTML = '';

    // Iteramos sobre flat para intercalar separadores de día,
    // pero renderizamos como grupos (para agrupar burbujas).
    let i = 0;
    let groupIdx = 0;
    while (i < flat.length) {
      const entry = flat[i];
      if (entry.__type === 'day-sep') {
        container.insertAdjacentHTML('beforeend',
          `<div class="m-day-sep"><span class="m-day-sep__label">${entry.label}</span></div>`);
        i++;
        continue;
      }

      // Renderizamos el grupo actual
      const g = groups[groupIdx];
      if (g) {
        container.appendChild(this._buildGroupElement(g, user?.id));
        i += g.items.length;
        groupIdx++;
      } else {
        i++;
      }
    }
  },

  _buildGroupElement(group, myId) {
    const wrap = document.createElement('div');
    wrap.className = 'm-msg-group' + (group.isMine ? ' is-me' : '');

    // Avatar: solo en el último grupo del remitente (primer item)
    const first = group.items[0];
    const sender = group.isMine
      ? AppState.get('profile')
      : (this._activeContact && group.sender_id === this._activeContact.id ? this._activeContact : null);

    const avatarUrl = sender?.avatar_url || null;
    const name = sender?.name || '';

    // Avatar
    const av = document.createElement('div');
    av.className = 'm-msg-group__avatar ' + (group.isMine
      ? 'bg-gradient-to-br from-green-400 to-green-600'
      : 'bg-gradient-to-br from-blue-400 to-blue-600');
    av.innerHTML = avatarUrl
      ? `<img src="${Security.safeUrl(avatarUrl)}" alt="">`
      : escapeHtml(name.charAt(0) || '');
    wrap.appendChild(av);

    // Burbujas agrupadas
    const bubs = document.createElement('div');
    bubs.className = 'm-bubbles';
    group.items.forEach((m, idx) => {
      const isFirst = idx === 0;
      const isLast = idx === group.items.length - 1;
      const isOnly = group.items.length === 1;
      bubs.appendChild(this._buildBubble(m, group.isMine, { isFirst, isLast, isOnly }));
    });
    wrap.appendChild(bubs);
    return wrap;
  },

  _buildBubble(m, isMine, pos = {}) {
    const el = document.createElement('div');
    el.className = 'm-bubble' + (isMine ? ' is-me' : '');
    if (pos.isFirst) el.classList.add('is-first');
    if (pos.isLast) el.classList.add('is-last');
    if (pos.isOnly) el.classList.add('is-only');
    if (m.id) el.id = 'msg-' + m.id;

    const checks = isMine
      ? `<span class="m-bubble__checks ${m.read_at || m.is_read ? 'is-read' : ''}">${m.read_at ? '✓✓' : (m.is_read ? '✓✓' : '✓')}</span>`
      : '';
    const time = fmtMsgTime(m.created_at);

    el.innerHTML = `
      <div>${escapeHtml(m.content)}</div>
      <div class="m-bubble__footer">
        ${time}${checks}
      </div>`;
    return el;
  },

  _appendOlderMessages(messages, container) {
    const user = AppState.get('user');
    const frag = document.createDocumentFragment();
    // Añadir separador de día si hace falta (simple)
    const grouped = groupMessages(messages, user.id);
    grouped.slice().reverse().forEach(g => {
      frag.insertBefore(this._buildGroupElement(g, user?.id), frag.firstChild);
    });
    container.insertBefore(frag, container.firstChild);
  },

  async sendMessage() {
    const input = document.getElementById('mChatInput');
    if (!input) return;
    const content = input.value.trim();
    if (!content || !this._activeContact) return;

    // Rate limit
    try {
      const { checkRateLimit, messageLimiter } = await import('../shared/rate-limiter.js');
      if (!checkRateLimit(messageLimiter, 'enviar mensajes')) return;
    } catch (_) { /* sin rate limiter */ }

    const user = AppState.get('user');
    const profile = AppState.get('profile');
    if (!user) return;

    // Optimistic: mostramos mensaje de inmediato (estado "enviando")
    const scroll = document.getElementById('mChatScroll');
    const optimistic = this._buildBubble(
      { content, sender_id: user.id, created_at: new Date().toISOString() },
      true, { isOnly: true }
    );
    optimistic.dataset.optimistic = '1';

    // Insertar en grupo final
    const wrap = document.createElement('div');
    wrap.className = 'm-msg-group is-me';
    const av = document.createElement('div');
    av.className = 'm-msg-group__avatar bg-gradient-to-br from-green-400 to-green-600';
    av.innerHTML = profile?.avatar_url
      ? `<img src="${Security.safeUrl(profile.avatar_url)}">`
      : escapeHtml((profile?.name || 'Y').charAt(0));
    const bubs = document.createElement('div');
    bubs.className = 'm-bubbles';
    bubs.appendChild(optimistic);
    wrap.appendChild(av);
    wrap.appendChild(bubs);

    if (scroll) {
      // Si está el empty state, lo reemplazamos
      if (scroll.querySelector('.m-empty')) scroll.innerHTML = '';
      scroll.appendChild(wrap);
      ScrollModule.scrollToBottom(scroll, true);
    }

    // Parar typing broadcast + limpiar input
    input.value = '';
    input.style.height = 'auto';
    input.disabled = true;
    if (this._conversationId) {
      SharedChatModule.broadcastTyping(this._conversationId, profile?.name || 'Padre', false);
    }

    try {
      const { message, conversationId } = await SharedChatModule.sendMessage(
        user.id, this._activeContact.id, content, this._conversationId
      );
      if (!this._conversationId && conversationId) {
        this._conversationId = conversationId;
        this._initRealtime();
      }
      // Reemplazar burbuja optimistic por la definitiva (con ID y estado ✓)
      if (message?.id) {
        const real = this._buildBubble(message, true, { isOnly: true });
        optimistic.replaceWith(real);
      }
      // Actualizar lista (último mensaje arriba)
      this.loadContacts(true);
      window._updateGlobalChatBadge?.();
    } catch (err) {
      Helpers.toast('Error al enviar mensaje', 'error');
      wrap?.remove();
    } finally {
      input.disabled = false;
      input.focus();
    }
  },

  _initRealtime() {
    if (this._channel) { supabase.removeChannel(this._channel); this._channel = null; }
    if (!this._conversationId) return;

    const user = AppState.get('user');
    const profile = AppState.get('profile');

    // Typing broadcast con debounce
    const input = document.getElementById('mChatInput');
    let typingTimer;
    if (input && !input._typingBound) {
      input._typingBound = true;
      input.addEventListener('input', () => {
        if (!this._conversationId) return;
        SharedChatModule.broadcastTyping(this._conversationId, profile?.name || 'Padre', true);
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => {
          SharedChatModule.broadcastTyping(this._conversationId, profile?.name || 'Padre', false);
        }, 2000);
      });
    }

    this._channel = SharedChatModule.subscribeToConversation(
      this._conversationId,
      // NUEVO MENSAJE
      (newMsg) => {
        if (newMsg.sender_id === user?.id) return;
        const scroll = document.getElementById('mChatScroll');
        if (!scroll) return;
        this._removeTypingIndicator();
        // Si chat está en empty state
        if (scroll.querySelector('.m-empty')) scroll.innerHTML = '';

        // Añadir al último grupo del remitente si existe, o nuevo grupo
        const lastGroup = scroll.querySelector('.m-msg-group:not(.is-me):last-of-type');
        const lastBubbles = lastGroup?.querySelector('.m-bubbles');
        const groupTime = lastGroup ? this._groupCreatedAt(lastGroup) : null;
        const withinWindow = groupTime && (new Date(newMsg.created_at).getTime() - groupTime < 5 * 60 * 1000);

        if (lastGroup && withinWindow) {
          // Quitar is-last a la burbuja anterior
          lastBubbles.querySelectorAll('.m-bubble').forEach(b => b.classList.remove('is-last'));
          const bub = this._buildBubble(newMsg, false, { isLast: true });
          lastBubbles.appendChild(bub);
        } else {
          const sender = this._activeContact;
          const wrap = document.createElement('div');
          wrap.className = 'm-msg-group';
          const av = document.createElement('div');
          av.className = 'm-msg-group__avatar bg-gradient-to-br from-blue-400 to-blue-600';
          av.innerHTML = sender?.avatar_url
            ? `<img src="${Security.safeUrl(sender.avatar_url)}">`
            : escapeHtml((sender?.name || 'X').charAt(0));
          const bubs = document.createElement('div');
          bubs.className = 'm-bubbles';
          bubs.appendChild(this._buildBubble(newMsg, false, { isOnly: true }));
          wrap.appendChild(av);
          wrap.appendChild(bubs);
          scroll.appendChild(wrap);
        }

        ScrollModule.scrollToBottom(scroll, true);
        SharedChatModule.markAsRead(this._conversationId);

        // Actualizar lista + global badge
        this._activeContact.unread = 0;
        this.loadContacts(true);
        window._updateGlobalChatBadge?.();
      },
      // TYPING
      ({ userName, isTyping, userId }) => {
        if (userId === user?.id) return;
        const container = document.getElementById('mChatScroll');
        if (!container) return;
        if (isTyping) this._showTyping(userName);
        else this._removeTypingIndicator();
      },
      // PRESENCE (online)
      (presenceState) => {
        const metaEl = document.getElementById('mChatActiveMeta');
        if (!metaEl) return;
        const orig = metaEl.dataset.original || metaEl.textContent;

        const others = new Set();
        for (const [, arr] of Object.entries(presenceState || {})) {
          arr.forEach(p => { if (p.user_id && p.user_id !== user?.id) others.add(p.user_id); });
        }
        if (others.size > 0) {
          metaEl.innerHTML = `${escapeHtml(orig)} <span class="inline-flex items-center gap-1 text-green-600 font-bold"><span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>En línea</span>`;
        } else {
          metaEl.textContent = orig;
        }
      },
      // READ RECEIPT
      (receipt) => {
        if (!receipt?.id) return;
        const bubble = document.querySelector('#msg-' + receipt.id + ' .m-bubble__checks');
        if (bubble) {
          if (receipt.is_read) bubble.textContent = '✓✓';
          if (receipt.read_at) bubble.classList.add('is-read');
        }
      }
    );
  },

  _groupCreatedAt(groupEl) {
    const lastBubble = groupEl.querySelector('.m-bubble:last-of-type');
    if (!lastBubble) return null;
    const footerTxt = lastBubble.querySelector('.m-bubble__footer')?.textContent?.trim();
    if (!footerTxt) return null;
    try {
      return new Date().getTime();
    } catch (_) { return null; }
  },

  _showTyping(userName) {
    this._removeTypingIndicator();
    const scroll = document.getElementById('mChatScroll');
    if (!scroll) return;
    const el = document.createElement('div');
    el.id = 'mTypingIndicator';
    el.className = 'm-typing';
    el.innerHTML = `
      <div class="m-typing__bubble">
        <div class="m-typing__dots"><span></span><span></span><span></span></div>
        <div class="m-typing__text">${escapeHtml(userName)} está escribiendo…</div>
      </div>`;
    scroll.appendChild(el);
    ScrollModule.scrollToBottom(scroll, true);
  },

  _removeTypingIndicator() {
    document.getElementById('mTypingIndicator')?.remove();
  },
};

window.ChatModule = ChatModule;
