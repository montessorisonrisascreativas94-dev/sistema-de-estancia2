/**
 * Chat Module — Panel Encargada (estilo Messenger profesional)
 *
 * Chat institucional con las maestras, sobre el shell mChat* estilizado.
 */
import { Helpers, escapeHtml } from '../shared/helpers.js';
import { supabase, sendPush } from '../shared/supabase.js';
import { AppState } from './state.js';
import {
  ChatModule as SharedChatModule,
  ChatUI,
  fmtMsgTime,
  fmtLastMsgTime,
  truncateLastMsg,
} from '../shared/chat.js';
import { ScrollModule } from '../shared/scroll.module.js';

const ROLE_ICONS = {
  maestra: '👩‍🏫',
  encargada: '🧑‍💼',
  asistente: '🧑‍💼',
  padre: '👨‍👩‍👧',
  directora: '👩‍💼',
};

const ROLE_LABELS = {
  maestra: 'Maestra',
  encargada: 'Encargada',
  padre: 'Padre/Madre',
  directora: 'Directora',
  'padre/madre': 'Padre/Madre',
  'padre_o_madre': 'Padre/Madre',
};

export const EncargadaChatApp = {
  _contacts: [],
  _activeContact: null,
  _conversationId: null,
  _channel: null,
  _topScrollDestroy: null,
  _currentUserId: null,
  _currentUserProfile: null,
  _anyMsgUnsubscribe: null,
  _replyTo: null,         // mensaje al que se está respondiendo
  _editingId: null,       // id del mensaje que se está editando
  _quoteMap: {},          // { msgId: content } para respuestas

  /* ----------------------------------------------------------- */
  /*                           INIT                              */
  /* ----------------------------------------------------------- */
  async init() {
    const grid = document.getElementById('chatShell');
    if (!grid) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    this._currentUserId = user.id;
    let profile = null;
    try {
      const { data: profileData } = await supabase.from('profiles')
        .select('name, avatar_url, role').eq('id', user.id).single();
      profile = profileData;
    } catch (_) {}
    this._currentUserProfile = profile || {};

    grid.classList.add('is-view-list');

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
        input.addEventListener('input', () => {
          input.style.height = 'auto';
          input.style.height = Math.min(input.scrollHeight, 140) + 'px';
        });
      }
    }

    const backBtn = document.getElementById('mChatBackBtn');
    if (backBtn && !backBtn._bound) {
      backBtn._bound = true;
      backBtn.addEventListener('click', () => {
        grid.classList.remove('is-view-chat');
        grid.classList.add('is-view-list');
        this._unsubscribe();
      });
    }

    const search = document.getElementById('mChatSearch');
    if (search && !search._bound) {
      search._bound = true;
      search.addEventListener('input', ScrollModule.debounce(() => this._renderContacts(), 200));
    }

    const list = document.getElementById('mChatList');
    if (list && !list._bound) {
      list._bound = true;
      Helpers.delegate(list, '[data-contact-id]', 'click', (_e, el) => {
        this.selectChat(el.dataset.contactId);
      });
    }

    // Delegación de burbujas: reacciones (tap/long-press), menú ⋮, etc.
    const scroll = document.getElementById('mChatScroll');
    if (scroll) {
      ChatUI.bindBubbleEvents(scroll, {
        pickerHTML: (msgId) => ChatUI.pickerHTML(msgId),
        reactOnMessage: (msgId, emoji) => this.toggleReaction(msgId, emoji),
        onMenu: (action, msgId) => this._onMenu(action, msgId),
        canEditAll: this._currentUserProfile?.role === 'directora',
        onBubbleTap: (msgId) => this.toggleReaction(msgId, '👍'),
      });
    }

    // Compatibilidad: onclick inline legacy
    window.selectEncargadaChat = async (userId) => this.selectChatById(userId);

    if (this._anyMsgUnsubscribe) this._anyMsgUnsubscribe.unsubscribe();
    this._anyMsgUnsubscribe = SharedChatModule.onAnyNewMessage(() => {
      this.loadContacts(true);
      window._updateGlobalChatBadge?.();
    });

    await this.loadContacts();
  },

  /* ----------------------------------------------------------- */
  /*                     CARGAR CONTACTOS                        */
  /* ----------------------------------------------------------- */
  async loadContacts(quiet = false) {
    const list = document.getElementById('mChatList');
    if (!list) return;
    if (!quiet) list.innerHTML = Helpers.skeleton(4, 'h-20');

    try {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, name, avatar_url, role')
        .eq('role', 'maestra')
        .neq('id', this._currentUserId)
        .is('deleted_at', null)
        .not('name', 'is', null)
        .order('name');
      if (error) throw error;

      const contactsRaw = (profiles || []).filter(p => p.name && p.name.trim().length > 0).map(u => ({
        id: u.id,
        name: u.name,
        parentName: null,
        studentName: null,
        role: u.role,
        roleLabel: ROLE_LABELS[u.role] || u.role || 'Contacto',
        roleIcon: ROLE_ICONS[u.role] || '👤',
        avatar: u.avatar_url,
        meta: 'Personal Karpus',
        unread: 0,
        lastMessage: null,
        lastMessageTime: null,
      }));

      this._contacts = await SharedChatModule.enrichContactsWithLastMessage(contactsRaw);
      this._renderContacts();
    } catch (e) {
      console.error('=== Error loading chat contacts ===', e);
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
        (c.parentName || '').toLowerCase().includes(q) ||
        (c.studentName || '').toLowerCase().includes(q) ||
        (c.roleLabel || '').toLowerCase().includes(q) ||
        (c.meta || '').toLowerCase().includes(q) ||
        (c.lastMessage || '').toLowerCase().includes(q)
      );
    });

    if (!items.length) {
      list.innerHTML = `<div class="p-6 text-center text-sm text-[#64748B] font-bold">Sin resultados</div>`;
      return;
    }

    list.innerHTML = items.map(c => {
      const isActive = this._activeContact?.id === c.id;
      const isNew = c.unread > 0;
      const initials = ((c.name || '?').charAt(0)).toUpperCase();
      const avatarHTML = c.avatar
        ? `<img src="${c.avatar}" alt="${escapeHtml(c.name)}" class="w-full h-full object-cover">`
        : `<span>${initials}</span>`;
      const dot = `<span class="m-conv-item__presence"></span>`;
      const badge = isNew
        ? `<span class="m-conv-item__badge">${c.unread > 99 ? '99+' : c.unread}</span>`
        : '';
      const unreadMark = isNew ? ` <span class="m-conv-item__unread-dot"></span>` : '';

      let lastPreview = c.lastMessage ? truncateLastMsg(c.lastMessage) : 'Aún no hay mensajes';
      if (c.lastMessageIsMine) {
        const checks = c.lastMessageIsRead ? '✓✓' : '✓';
        lastPreview = `<span class="checks text-[#94A3B8]">${checks} </span>` + lastPreview;
      } else if (!c.lastMessage) {
        lastPreview = '<span class="italic opacity-70">Comienza la conversación</span>';
      }

      const time = c.lastMessageTime ? fmtLastMsgTime(c.lastMessageTime) : '';

      const subtitle = c.parentName
        ? `<span class="m-conv-item__subtitle">${escapeHtml(c.parentName)}${unreadMark}</span>`
        : `<span class="m-conv-item__subtitle">${c.roleIcon} ${escapeHtml(c.roleLabel || 'Contacto')}${unreadMark}</span>`;

      return `
        <div class="m-conv-item ${isActive ? 'is-active' : ''} ${isNew ? 'is-new' : ''}"
             data-contact-id="${c.id}" tabindex="0" role="button"
             aria-label="Abrir chat con ${escapeHtml(c.name)}">
          <div class="m-conv-item__avatar">${avatarHTML}${dot}</div>
          <div class="m-conv-item__body">
            <div class="m-conv-item__name">
              <span>${escapeHtml(c.name)}</span>
              <span class="m-conv-item__time">${time}</span>
            </div>
            ${subtitle}
            <div class="m-conv-item__last-msg">${lastPreview}${badge}</div>
          </div>
        </div>`;
    }).join('');
  },

  /* ----------------------------------------------------------- */
  /*                   SELECCIONAR CONTACTO                      */
  /* ----------------------------------------------------------- */
  async selectChatById(contactId) {
    if (!this._currentUserId) await this.init();
    const contact = this._contacts.find(c => c.id === contactId);
    if (!contact) {
      await this.loadContacts(true);
      const retry = this._contacts.find(c => c.id === contactId);
      if (!retry) return;
      return this.selectChat(retry.id);
    }
    return this.selectChat(contact.id);
  },

  async selectChat(contactId) {
    const contact = this._contacts.find(c => c.id === contactId);
    if (!contact) return;

    this._activeContact = contact;
    this._conversationId = null;

    contact.unread = 0;
    this._renderContacts();

    const grid = document.getElementById('chatShell');
    if (grid) {
      grid.classList.remove('is-view-list');
      grid.classList.add('is-view-chat');
    }

    // Estado compartido para compatibilidad (badges / videollamadas etc.)
    AppState.set('activeChatUserId', contactId);
    AppState.set('activeChatName', contact.name);
    AppState.set('activeChatRole', contact.role);

    this._renderHeader();
    this._renderInfoPanel();
    SharedChatModule.resetPagination(this._conversationId);
    await this._loadMessages();
    this._subscribeRealtime();
    window._updateGlobalChatBadge?.();
  },

  _renderHeader() {
    const c = this._activeContact;
    if (!c) return;

    const avatarEl = document.getElementById('mChatActiveAvatar');
    const nameEl = document.getElementById('mChatActiveName');
    const metaEl = document.getElementById('mChatActiveMeta');

    const initials = ((c.name || '?').charAt(0)).toUpperCase();
    if (avatarEl) {
      avatarEl.innerHTML = c.avatar
        ? `<img src="${c.avatar}" alt="${escapeHtml(c.name)}" class="w-full h-full object-cover">`
        : `<span>${initials}</span>`;
    }
    if (nameEl) nameEl.textContent = c.name || 'Sin nombre';
    if (metaEl) {
      const sub = c.parentName
        ? `${c.roleIcon} ${c.roleLabel} · ${c.parentName}`
        : `${c.roleIcon} ${c.roleLabel}`;
      metaEl.textContent = sub;
      metaEl.dataset.original = sub;
    }
  },

  /* ----------------------------------------------------------- */
  /*                        CARGAR MENSAJES                      */
  /* ----------------------------------------------------------- */
  async _loadMessages() {
    const scroll = document.getElementById('mChatScroll');
    if (!scroll) return;
    scroll.innerHTML = `<div class="m-empty"><div class="m-empty__icon">${this._loadingIconSVG()}</div><div class="m-empty__title">Cargando mensajes…</div></div>`;

    try {
      SharedChatModule.resetPagination(this._conversationId);

      let messages = [];
      let conversationId = null;
      try {
        const res = await SharedChatModule.loadConversation(this._activeContact.id);
        messages = res.messages || [];
        conversationId = res.conversationId || null;
      } catch (_) {
        messages = [];
        conversationId = null;
      }
      this._conversationId = conversationId;
      AppState.set('activeConversationId', conversationId);

      if (!messages.length) {
        const c = this._activeContact;
        scroll.innerHTML = `
          <div class="m-empty">
            <div class="m-empty__avatar">${c.avatar ? `<img src="${c.avatar}" alt="" class="w-full h-full object-cover">` : (c.name || '?').charAt(0).toUpperCase()}</div>
            <div class="m-empty__title">${escapeHtml(c.name)}</div>
            <div class="m-empty__text">
              Aún no tienes mensajes con ${escapeHtml(c.name)}.
              ¡Envía el primer mensaje para empezar la conversación!
            </div>
          </div>`;
        if (window.lucide) lucide.createIcons();
        return;
      }

      this._renderMessages(messages);
      this._scrollToBottom(false);

      if (this._topScrollDestroy) this._topScrollDestroy();
      const { destroy } = ScrollModule.topScroll({
        container: scroll,
        loadFn: async () => {
          if (!this._conversationId) return;
          const { messages: older } = await SharedChatModule.loadConversation(
            this._activeContact.id, this._conversationId, true
          );
          if (older && older.length) {
            older.forEach(m => { if (m.id) this._quoteMap[m.id] = (m.deleted_at ? 'Este mensaje fue eliminado' : m.content || ''); });
            const rows = ChatUI.buildRows(older, this._currentUserId);
            const tmp = document.createElement('div');
            tmp.innerHTML = ChatUI.rowsHTML(rows, this._bubbleCtx());
            const topFrag = document.createDocumentFragment();
            while (tmp.firstChild) topFrag.appendChild(tmp.firstChild);
            scroll.insertBefore(topFrag, scroll.firstChild);
          }
        }
      });
      this._topScrollDestroy = destroy;

      if (window.lucide) lucide.createIcons();
    } catch (e) {
      console.error('Error cargando mensajes:', e);
      scroll.innerHTML = `<div class="m-empty"><div class="m-empty__icon">⚠️</div><div class="m-empty__title">Error al cargar mensajes</div><div class="m-empty__text">${escapeHtml(e.message || 'Desconocido')}</div></div>`;
    }
  },

  // Crea el contexto de renderizado compartido (quoteMap para respuestas)
  _bubbleCtx() {
    return {
      myId: this._currentUserId,
      myProfile: this._currentUserProfile,
      contact: this._activeContact,
      contactLabel: this._activeContact?.name,
      quoteMap: this._quoteMap,
    };
  },

  _renderMessages(messages) {
    const scroll = document.getElementById('mChatScroll');
    if (!scroll) return;
    // Mapa de citas para respuestas (reply_to_id → contenido)
    this._quoteMap = {};
    (messages || []).forEach(m => {
      if (m.id) this._quoteMap[m.id] = (m.deleted_at ? 'Este mensaje fue eliminado' : m.content || '');
    });
    scroll.innerHTML = ChatUI.rowsHTML(ChatUI.buildRows(messages, this._currentUserId), this._bubbleCtx());
  },

  _scrollToBottom(smooth = true) {
    const scroll = document.getElementById('mChatScroll');
    if (!scroll) return;
    ScrollModule.scrollToBottom(scroll, smooth);
  },

  /* ----------------------------------------------------------- */
  /*            FEATURES: RESPONDER / REACCIONES / MENÚ ⋮        */
  /* ----------------------------------------------------------- */

  /** Marca el mensaje para responder y muestra la barra "respondiendo a…" */
  _beginReply(msg) {
    this._replyTo = msg;
    this._editingId = null;
    this._renderReplyBar();
    const input = document.getElementById('mChatInput');
    if (input) input.focus();
  },

  _cancelReply() {
    this._replyTo = null;
    this._renderReplyBar();
  },

  /** Marca el mensaje para editar y muestra la barra "editando…" */
  _beginEdit(msg) {
    this._editingId = msg.id;
    this._replyTo = null;
    const input = document.getElementById('mChatInput');
    if (input) {
      input.value = msg.content === 'Este mensaje fue eliminado' ? '' : (msg.content || '');
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 140) + 'px';
      input.focus();
    }
    this._renderReplyBar();
  },

  _cancelEdit() {
    this._editingId = null;
    this._renderReplyBar();
  },

  /** Renderiza/elimina la barra contextual sobre el input */
  _renderReplyBar() {
    const inputArea = document.getElementById('mChatInput')?.closest('.m-chat-input');
    if (!inputArea) return;
    let bar = inputArea.querySelector('.m-chat-reply-bar, .m-chat-edit-bar');
    if (bar) bar.remove();

    if (this._replyTo) {
      bar = document.createElement('div');
      const q = ChatUI._replyBlock(this._replyTo, this._bubbleCtx());
      bar.className = 'm-chat-reply-bar';
      bar.innerHTML = (q || `<span>Respondiendo…</span>`) + `<button class="m-chat-reply-bar__close" type="button" title="Cancelar">✕</button>`;
      bar.querySelector('.m-chat-reply-bar__close')?.addEventListener('click', () => this._cancelReply());
      inputArea.prepend(bar);
    } else if (this._editingId) {
      bar = document.createElement('div');
      bar.className = 'm-chat-edit-bar';
      bar.innerHTML = `<span>Editando mensaje…</span><button class="m-chat-edit-bar__close" type="button" title="Cancelar">✕</button>`;
      bar.querySelector('.m-chat-edit-bar__close')?.addEventListener('click', () => this._cancelEdit());
      inputArea.prepend(bar);
    }
  },

  /** Acciones del menú ⋮ */
  async _onMenu(action, msgId) {
    if (!msgId) return;
    const bubble = document.querySelector(`.m-bubble[data-msg-id="${msgId}"]`);
    const contentEl = bubble?.querySelector('.m-bubble__content');

    switch (action) {
      case 'reply': {
        const msg = {
          id: msgId,
          content: contentEl?.textContent || '',
          deleted_at: !!bubble?.querySelector('.is-deleted'),
        };
        this._beginReply(msg);
        break;
      }
      case 'copy': {
        const txt = contentEl?.textContent || '';
        try {
          await navigator.clipboard.writeText(txt);
          Helpers.toast('Mensaje copiado');
        } catch (_) { Helpers.toast('No se pudo copiar', 'error'); }
        break;
      }
      case 'edit': {
        const msg = { id: msgId, content: contentEl?.textContent || '', deleted_at: !!bubble?.querySelector('.is-deleted') };
        this._beginEdit(msg);
        break;
      }
      case 'delete': {
        if (!confirm('¿Eliminar este mensaje para todos?')) return;
        try {
          await SharedChatModule.softDeleteMessage(msgId);
          this._applySoftDelete(msgId);
          this.loadContacts(true);
        } catch (_) { Helpers.toast('Error al eliminar', 'error'); }
        break;
      }
      case 'report':
        Helpers.toast('Se ha reportado este mensaje');
        break;
    }
  },

  /** Alterna la reacción del usuario sobre un mensaje */
  async toggleReaction(msgId, emoji) {
    if (!msgId) return;
    const scroll = document.getElementById('mChatScroll');
    const chip = scroll?.querySelector(`[data-msg-react="${msgId}"][data-emoji="${emoji}"]`);
    const wasMine = chip?.classList.contains('is-mine');
    try {
      if (wasMine) await SharedChatModule.unreact(msgId, this._currentUserId);
      else await SharedChatModule.reactToMessage(msgId, this._currentUserId, emoji);
      await this._refreshReactions(msgId);
    } catch (_) { Helpers.toast('Error al reaccionar', 'error'); }
  },

  /** Recarga las reacciones de un mensaje y actualiza su DOM */
  async _refreshReactions(msgId) {
    const bubble = document.querySelector(`.m-bubble[data-msg-id="${msgId}"]`);
    if (!bubble) return;
    let reactions = null;
    try {
      const { data: reactionsData } = await supabase.from('messages')
        .select('message_reactions(emoji, user_id)')
        .eq('id', msgId)
        .single();
      reactions = reactionsData;
    } catch (_) {}
    const old = bubble.querySelector('.m-bubble__reactions');
    if (old) old.remove();
    const m = { id: msgId, message_reactions: reactions?.message_reactions || [] };
    const html = ChatUI.reactionsBar(m, this._currentUserId);
    if (html) {
      bubble.insertAdjacentHTML('beforeend', html);
    }
  },

  /** Aplica borrado lógico visual sin recargar todo */
  _applySoftDelete(msgId) {
    const bubble = document.querySelector(`.m-bubble[data-msg-id="${msgId}"]`);
    if (!bubble) return;
    const content = bubble.querySelector('.m-bubble__content');
    if (content) {
      content.innerHTML = `<i data-lucide="ban" class="w-3.5 h-3.5"></i> Este mensaje fue eliminado`;
      content.classList.add('is-deleted');
    }
    const reactions = bubble.querySelector('.m-bubble__reactions');
    if (reactions) reactions.remove();
    const meta = bubble.querySelector('.m-bubble__meta');
    if (meta) meta.innerHTML = meta.innerHTML.replace(/<span class="m-read[^>]*>.*<\/span>/, '');
    if (window.lucide) lucide.createIcons();
  },

  /** Aplica edición visual */
  _applyEdit(msgId, content) {
    const bubble = document.querySelector(`.m-bubble[data-msg-id="${msgId}"]`);
    if (!bubble) return;
    const contentEl = bubble.querySelector('.m-bubble__content');
    if (contentEl) contentEl.textContent = content;
    const meta = bubble.querySelector('.m-bubble__meta');
    if (meta && !meta.querySelector('.m-bubble__edited')) {
      meta.insertAdjacentHTML('beforeend', ' <span class="m-bubble__edited" title="Editado">editado</span>');
    }
  },

  _scrollToBottom(smooth = true) {
    const scroll = document.getElementById('mChatScroll');
    if (!scroll) return;
    ScrollModule.scrollToBottom(scroll, smooth);
  },

  /* ----------------------------------------------------------- */
  /*                       ENVIAR MENSAJE                        */
  /* ----------------------------------------------------------- */
  async sendMessage() {
    const input = document.getElementById('mChatInput');
    const text = input?.value.trim();
    if (!text && !this._pendingAttachment) return;
    if (!this._activeContact?.id || !this._currentUserId) return;

    // Modo edición
    if (this._editingId) {
      const editingId = this._editingId;
      input.value = '';
      input.style.height = 'auto';
      input.disabled = true;
      try {
        await SharedChatModule.editMessage(editingId, text);
        this._applyEdit(editingId, text);
        this._quoteMap[editingId] = text;
        this._cancelEdit();
        this.loadContacts(true);
      } catch (_) { Helpers.toast('Error al editar', 'error'); }
      finally { input.disabled = false; input.focus(); }
      return;
    }

    const replyTo = this._replyTo;
    this._clearContextBars();
    const attachments = this._pendingAttachment ? [this._pendingAttachment] : [];
    this._pendingAttachment = null;

    input.value = '';
    input.style.height = 'auto';
    input.disabled = true;

    const optimistMsg = {
      content: text || (attachments[0]?.file_name || '📎 Adjunto'),
      sender_id: this._currentUserId,
      created_at: new Date().toISOString(),
      id: '__opt_' + Date.now(),
      is_read: false,
      read_at: null,
      reply_to_id: replyTo?.id || null,
      message_attachments: attachments,
    };
    this._appendOptimistic(optimistMsg);
    this._scrollToBottom(true);

    try {
      const { conversationId, message } = await SharedChatModule.sendMessage(
        this._currentUserId,
        this._activeContact.id,
        text,
        this._conversationId,
        { replyToId: replyTo?.id || null, attachments }
      );

      this._replaceOptimistic(optimistMsg.id, message || { ...optimistMsg, id: null });

      if (!this._conversationId && conversationId) {
        this._conversationId = conversationId;
        AppState.set('activeConversationId', conversationId);
        this._subscribeRealtime();
      }

      sendPush({
        user_id: this._activeContact.id,
        title: 'Nuevo mensaje de Encargada',
        message: text || (attachments[0]?.file_name || '📎 Adjunto'),
        type: 'chat',
      }).catch(() => {});

      if (window.lucide) lucide.createIcons();
      this.loadContacts(true);
    } catch (e) {
      console.error('Error enviando mensaje:', e);
      Helpers.toast('Error al enviar mensaje', 'error');
      document.querySelector(`[data-msg-id="${optimistMsg.id}"]`)?.closest('.m-msg-group')?.remove();
    } finally {
      input.disabled = false;
      input.focus();
    }
  },

  _clearContextBars() {
    this._replyTo = null;
    this._editingId = null;
    this._renderReplyBar();
  },

  _appendOptimistic(msg) {
    const scroll = document.getElementById('mChatScroll');
    if (!scroll) return;
    const emptyEl = scroll.querySelector('.m-empty');
    if (emptyEl) emptyEl.remove();

    const group = {
      sender_id: msg.sender_id,
      isMine: true,
      items: [msg],
    };
    const wrapper = document.createElement('div');
    wrapper.innerHTML = ChatUI.buildGroupBubble(group, this._bubbleCtx());
    scroll.appendChild(wrapper.firstElementChild);
    if (window.lucide) lucide.createIcons();
  },

  _replaceOptimistic(optId, realMsg) {
    const bubble = document.querySelector(`[data-msg-id="${optId}"]`);
    if (!bubble) return;
    bubble.setAttribute('data-msg-id', realMsg.id || '');
    const meta = bubble.querySelector('.m-bubble__meta');
    if (meta) {
      const time = fmtMsgTime(realMsg.created_at);
      meta.innerHTML = `${time}${ChatUI.readMark(realMsg)} <button class="m-bubble__menu" data-msg-menu="${realMsg.id || ''}" title="Más opciones"><i data-lucide="more-horizontal" class="w-3.5 h-3.5"></i></button>`;
    }
    if (window.lucide) lucide.createIcons();
  },

  /* ----------------------------------------------------------- */
  /*                   PANEL DE INFORMACIÓN                      */
  /* ----------------------------------------------------------- */
  _renderInfoPanel() {
    const info = document.getElementById('mChatInfo');
    const c = this._activeContact;
    if (!info || !c) return;
    const initials = ((c.name || '?').charAt(0)).toUpperCase();
    info.innerHTML = `
      <div class="m-info-profile">
        <div class="m-info-profile__avatar">${c.avatar ? `<img src="${c.avatar}" alt="" class="w-full h-full object-cover">` : initials}</div>
        <div class="m-info-profile__name">${escapeHtml(c.name)}</div>
        <div class="m-info-profile__role">${c.roleIcon} ${escapeHtml(c.roleLabel || 'Contacto')}</div>
      </div>

      <div class="m-info-card">
        <div class="m-info-card__title">Información</div>
        ${c.parentName ? `<div class="m-info-statrow"><span>Padre/Madre</span><span>${escapeHtml(c.parentName)}</span></div>` : ''}
        ${c.studentName ? `<div class="m-info-statrow"><span>Estudiante</span><span>${escapeHtml(c.studentName)}</span></div>` : ''}
        <div class="m-info-statrow"><span>Rol</span><span>${c.roleIcon} ${escapeHtml(c.roleLabel || 'Contacto')}</span></div>
        <div class="m-info-statrow"><span>Mensajes totales</span><span id="mInfoTotalMsgs">-</span></div>
        <div class="m-info-statrow"><span>No leídos</span><span>${c.unread || 0}</span></div>
      </div>

      <div class="m-info-card">
        <div class="m-info-card__title">Acciones rápidas</div>
        <div class="m-info-actions">
          <button class="m-info-action"><i data-lucide="phone" class="w-4 h-4"></i><span>Llamar</span></button>
          <button class="m-info-action"><i data-lucide="video" class="w-4 h-4"></i><span>Videollamada</span></button>
          <button class="m-info-action"><i data-lucide="search" class="w-4 h-4"></i><span>Buscar</span></button>
          <button class="m-info-action"><i data-lucide="bell-off" class="w-4 h-4"></i><span>Silenciar</span></button>
        </div>
      </div>

      <div class="m-info-card">
        <div class="m-info-card__title">Archivos compartidos</div>
        <div class="m-info-empty">
          <i data-lucide="folder-open" class="w-6 h-6"></i>
          <span>Aún no hay archivos compartidos</span>
        </div>
      </div>`;
    if (window.lucide) lucide.createIcons();
  },

  /* ----------------------------------------------------------- */
  /*                       REALTIME / TYPING                     */
  /* ----------------------------------------------------------- */
  _subscribeRealtime() {
    this._unsubscribe();
    if (!this._conversationId) return;

    this._channel = SharedChatModule.subscribeToConversation(
      this._conversationId,
      (newMsg) => {
        if (newMsg.sender_id === this._currentUserId) {
          this._updateDelivery(newMsg);
          return;
        }
        this._addIncomingMessage(newMsg);
        SharedChatModule.markAsRead(this._conversationId);
        window._updateGlobalChatBadge?.();
      },
      (typingData) => {
        this._showTypingIndicator(typingData);
      },
      (presenceState) => {
        this._updatePresenceHeader(presenceState);
      },
      (receipt) => {
        this._applyReceipt(receipt);
      }
    );

    const input = document.getElementById('mChatInput');
    const myName = this._currentUserProfile?.name || 'Encargada';
    let typingTimeout;
    if (input && !input._typingBound) {
      input._typingBound = true;
      input.addEventListener('input', () => {
        if (!this._conversationId) return;
        SharedChatModule.broadcastTyping(this._conversationId, myName, true);
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
          SharedChatModule.broadcastTyping(this._conversationId, myName, false);
        }, 2500);
      });
    }
  },

  _unsubscribe() {
    if (this._channel) {
      supabase.removeChannel(this._channel);
      this._channel = null;
    }
    if (this._topScrollDestroy) {
      this._topScrollDestroy();
      this._topScrollDestroy = null;
    }
    AppState.set('activeConversationId', null);
  },

  _addIncomingMessage(msg) {
    const scroll = document.getElementById('mChatScroll');
    if (!scroll) return;
    scroll.querySelector('.m-empty')?.remove();

    const lastGroup = scroll.querySelector('.m-msg-group:last-of-type');
    let appended = false;
    if (lastGroup && !lastGroup.classList.contains('is-me')) {
      const container = lastGroup.querySelector('.m-msg-group__bubbles');
      if (container) {
        const group = { sender_id: msg.sender_id, isMine: false, items: [msg] };
        const wrapper = document.createElement('div');
        wrapper.innerHTML = ChatUI.buildGroupBubble(group, this._bubbleCtx());
        const newBubbles = wrapper.querySelector('.m-msg-group__bubbles');
        const allExisting = container.querySelectorAll('.m-bubble');
        allExisting.forEach(b => b.classList.remove('is-only', 'is-last', 'is-first'));
        if (allExisting.length === 1) allExisting[0].classList.add('is-first');
        else {
          allExisting[0].classList.add('is-first');
          allExisting[allExisting.length - 1].classList.add('is-last');
        }
        const newBubble = newBubbles.querySelector('.m-bubble');
        newBubble.classList.remove('is-first', 'is-only');
        newBubble.classList.add('is-last');
        container.appendChild(newBubble);
        appended = true;
      }
    }

    if (!appended) {
      const group = { sender_id: msg.sender_id, isMine: false, items: [msg] };
      const wrapper = document.createElement('div');
      wrapper.innerHTML = ChatUI.buildGroupBubble(group, this._bubbleCtx());
      scroll.appendChild(wrapper.firstElementChild);
    }
    if (window.lucide) lucide.createIcons();
    this._scrollToBottom(true);
  },

  _updateDelivery(msg) {
    const bubble = document.querySelector(`[data-msg-id="${msg.id}"]`);
    if (!bubble) return;
    const meta = bubble.querySelector('.m-bubble__meta');
    if (meta) {
      const time = fmtMsgTime(msg.created_at);
      meta.innerHTML = `${time}${ChatUI.readMark(msg)} <button class="m-bubble__menu" data-msg-menu="${msg.id || ''}" title="Más opciones"><i data-lucide="more-horizontal" class="w-3.5 h-3.5"></i></button>`;
    }
    if (window.lucide) lucide.createIcons();
  },

  _applyReceipt(receipt) {
    if (!receipt?.id) return;
    const bubble = document.querySelector(`[data-msg-id="${receipt.id}"]`);
    if (!bubble) return;
    const read = bubble.querySelector('.m-read');
    if (!read) return;
    if (receipt.is_read || receipt.read_at) {
      read.textContent = '✓✓';
    }
    if (receipt.read_at) {
      read.classList.add('is-read');
    }
  },

  _showTypingIndicator(typingData) {
    let typingEl = document.getElementById('chatTypingIndicator');
    if (!typingEl) {
      const scroll = document.getElementById('mChatScroll');
      if (!scroll) return;
      let created = scroll.querySelector('.m-typing');
      if (!created) {
        created = document.createElement('div');
        created.className = 'm-typing';
        created.id = 'chatTypingIndicator';
        created.innerHTML = `
          <div class="m-typing__avatar">👤</div>
          <div class="m-typing__bubble">
            <div class="m-typing__dots"><span></span><span></span><span></span></div>
            <span class="m-typing__text">escribiendo…</span>
          </div>`;
      }
      typingEl = created;
    } else {
      typingEl.className = 'm-typing';
    }
    const textEl = typingEl.querySelector('.m-typing__text');

    if (typingData.isTyping && typingData.userId !== this._currentUserId) {
      if (textEl) textEl.textContent = `${typingData.userName || 'Alguien'} está escribiendo…`;
      typingEl.style.display = 'flex';
    } else {
      typingEl.style.display = 'none';
    }
    const scroll = document.getElementById('mChatScroll');
    if (scroll && !scroll.contains(typingEl)) {
      scroll.appendChild(typingEl);
    }
  },

  _updatePresenceHeader(presenceState) {
    const metaEl = document.getElementById('mChatActiveMeta');
    if (!metaEl) return;
    const original = metaEl.dataset.original || metaEl.textContent;

    const onlineUserIds = new Set();
    for (const [, presences] of Object.entries(presenceState || {})) {
      for (const p of Array.isArray(presences) ? presences : []) {
        if (p?.user_id && p.user_id !== this._currentUserId) onlineUserIds.add(p.user_id);
      }
    }

    if (onlineUserIds.size > 0) {
      metaEl.innerHTML = `${escapeHtml(original)} · <span class="m-presence"><span class="m-presence__dot"></span>En línea</span>`;
    } else {
      metaEl.textContent = original;
    }
  },

  /* ----------------------------------------------------------- */
  /*                        HELPERS                              */
  /* ----------------------------------------------------------- */
  _loadingIconSVG() {
    return `<svg class="animate-spin w-6 h-6 text-[#0B63C7]" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`;
  },
};