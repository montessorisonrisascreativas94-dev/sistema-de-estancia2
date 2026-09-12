/**
 * Chat Module — Panel Maestra (estilo Messenger profesional)
 */
import { ChatModule as SharedChatModule,
  ChatUI,
  fmtMsgTime,
  fmtLastMsgTime,
  truncateLastMsg,
} from '../../shared/chat.js';
import { ScrollModule } from '../../shared/scroll.module.js';
import { AppState } from '../state.js';
import { safeToast, safeEscapeHTML, safeUrl } from './ui.js';

let activeContact = null;
let activeConversationId = null;
let _topScrollDestroy = null;
let _typingTimeout = null;
let _chatChannel = null;
let _anyMsgUnsubscribe = null;
let _currentUserId = null;
let _currentUserProfile = null;
let _replyTo = null;
let _editingId = null;
let _pendingAttachment = null;
let _quoteMap = {};

export async function initChat() {
  const grid = document.getElementById('chatShell');
  if (!grid) return;

  grid.classList.add('is-view-list');

  // Input send
  const sendBtn = document.getElementById('mChatSendBtn');
  const input = document.getElementById('mChatInput');
  if (sendBtn && !sendBtn._bound) {
    sendBtn._bound = true;
    sendBtn.addEventListener('click', () => sendChatMessage());
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendChatMessage();
        }
      });
      input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 140) + 'px';
      });
    }
  }

  // Back móvil
  const backBtn = document.getElementById('mChatBackBtn');
  if (backBtn && !backBtn._bound) {
    backBtn._bound = true;
    backBtn.addEventListener('click', () => {
      grid.classList.remove('is-view-chat');
      grid.classList.add('is-view-list');
    });
  }

  // Search
  const search = document.getElementById('mChatSearch');
  if (search && !search._bound) {
    search._bound = true;
    search.addEventListener('input', ScrollModule.debounce(() => renderContacts(), 200));
  }

  // Click delegado
  const list = document.getElementById('mChatList');
  if (list && !list._bound) {
    list._bound = true;
    list.addEventListener('click', (e) => {
      const el = e.target.closest('[data-contact-id]');
      if (el) selectChatContact(el.dataset.contactId);
    });
  }

  // Datos del usuario actual
  const user = AppState.get('user');
  _currentUserId = user?.id || null;
  _currentUserProfile = AppState.get('profile') || user || {};

  // Expose para compatibilidad con App wrappers
  window.selectMaestraChat = async (contactId) => selectChatContact(contactId);

  // Delegación de eventos en las burbujas (reacciones / menú / picker)
  const scroll = document.getElementById('mChatScroll');
  if (scroll && !scroll._chatBubblesBound) {
    ChatUI.bindBubbleEvents(scroll, {
      pickerHTML: (msgId) => ChatUI.pickerHTML(msgId),
      reactOnMessage: (msgId, emoji) => toggleReaction(msgId, emoji),
      onMenu: (action, msgId) => onBubbleMenu(action, msgId),
      onBubbleTap: (msgId) => toggleReaction(msgId, '👍'),
      canEditAll: false,
    });
  }

  // Adjuntos (multimedia)
  const attachBtn = document.getElementById('mChatAttachBtn');
  if (attachBtn && !attachBtn._bound) {
    attachBtn._bound = true;
    attachBtn.addEventListener('click', () => {
      document.getElementById('mChatFileInput')?.click();
    });
  }
  const fileInput = document.getElementById('mChatFileInput');
  if (fileInput && !fileInput._bound) {
    fileInput._bound = true;
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      try {
        safeToast('Subiendo archivo…');
        const att = await SharedChatModule.uploadAttachment(file, `${_currentUserId}/${Date.now()}-${file.name}`);
        _pendingAttachment = att;
        safeToast('Archivo adjunto listo para enviar');
      } catch (_) { safeToast('No se pudo subir el archivo', 'error'); }
    });
  }

  // Suscripción global a mensajes para reordenar lista + badge
  if (_anyMsgUnsubscribe) _anyMsgUnsubscribe.unsubscribe();
  _anyMsgUnsubscribe = SharedChatModule.onAnyNewMessage(() => {
    loadChatContacts(true);
    window._updateGlobalChatBadge?.();
  });

  await loadChatContacts();
  // Badge inicial
  window._updateGlobalChatBadge?.();
}

let allContacts = [];

async function loadChatContacts(quiet = false) {
  const list = document.getElementById('mChatList');
  if (!list) return;
  if (!quiet) list.innerHTML = Array.from({ length: 4 }, () =>
    `<div class="m-conv-item"><div class="m-conv-item__avatar bg-slate-100 animate-pulse"></div><div class="m-conv-item__body"><div class="m-conv-item__top"><div class="m-conv-item__name bg-slate-100 animate-pulse h-4 w-1/2 rounded"></div><div class="m-conv-item__time bg-slate-100 animate-pulse h-3 w-10 rounded"></div></div><div class="m-conv-item__last bg-slate-100 animate-pulse h-3 w-4/5 rounded mt-1"></div></div></div>`
  ).join('');

  try {
    const [unreadMap, user] = await Promise.all([
      SharedChatModule.getUnreadCounts(),
      AppState.get('user')
    ]);

    let students = AppState.get('students') || [];
    if (!students.length) {
      const classroom = AppState.get('classroom');
      if (classroom?.id) {
        try {
          const { MaestraApi } = await import('../api.js');
          students = await MaestraApi.getStudentsByClassroom(classroom.id);
          if (students.length) AppState.set('students', students);
        } catch (_) {}
      }
    }

    // Padres
    const parentsMap = new Map();
    const parentIds = students.filter(s => s.parent_id).map(s => s.parent_id);
    let parentProfiles = {};
    if (parentIds.length > 0) {
      try {
        const { supabase: sb } = await import('../../shared/supabase.js');
        const { data: profiles } = await sb
          .from('profiles')
          .select('id, name, avatar_url')
          .in('id', parentIds);
        (profiles || []).forEach(p => { parentProfiles[p.id] = p; });
      } catch (_) {}
    }

    // Padres por email
    const swParents = students.filter(s => !s.parent_id && s.p1_email);
    if (swParents.length > 0) {
      try {
        const { supabase: sb } = await import('../../shared/supabase.js');
        const emails = swParents.map(s => s.p1_email).filter(Boolean);
        const { data: profilesByEmail } = await sb
          .from('profiles')
          .select('id, name, avatar_url, email')
          .in('email', emails);
        const emailMap = {};
        (profilesByEmail || []).forEach(p => { if (p.email) emailMap[p.email.toLowerCase()] = p; });
        swParents.forEach(s => {
          const prof = emailMap[s.p1_email.toLowerCase()];
          if (prof) {
            s._resolvedParentId = prof.id;
            parentProfiles[prof.id] = prof;
          }
        });
      } catch (_) {}
    }

    students.forEach(s => {
      const pid = s.parent_id || s._resolvedParentId;
      if (pid) {
        const profile = parentProfiles[pid];
        const displayName = profile?.name || s.p1_name || `Padre de ${s.name}`;
        if (!parentsMap.has(pid)) {
          parentsMap.set(pid, {
            id: pid,
            name: s.name,
            parentName: displayName,
            childName: s.name,
            avatar_url: profile?.avatar_url || null,
            roleLabel: `Padre — ${displayName}`,
            unlinked: false,
          });
        } else {
          const p = parentsMap.get(pid);
          if (!p.childName.includes(s.name)) p.childName += `, ${s.name}`;
        }
      } else if (s.p1_name) {
        const virtualId = `unlinked_${s.id}`;
        parentsMap.set(virtualId, {
          id: null,
          name: s.name,
          parentName: s.p1_name,
          childName: s.name,
          avatar_url: null,
          roleLabel: 'Padre (Sin Cuenta)',
          unlinked: true,
        });
      }
    });

    // Directora + asistente
    const { data: staff } = await import('../../shared/supabase.js').then(m =>
      m.supabase.from('profiles')
        .select('id, name, avatar_url, role')
        .in('role', ['directora', 'asistente'])
        .neq('id', user?.id || '')
        .order('name')
    );
    const staffContacts = (staff || []).map(s => ({
      id: s.id,
      name: s.name || s.role,
      parentName: null,
      childName: null,
      avatar_url: s.avatar_url || null,
      roleLabel: s.role === 'directora' ? 'Directora' : 'Asistente',
      role: s.role,
      unlinked: false,
    }));

    const rawContacts = [...staffContacts, ...Array.from(parentsMap.values())];
    allContacts = await SharedChatModule.enrichContactsWithLastMessage(rawContacts);
    renderContacts();
  } catch (err) {
    console.error(err);
  }
}

function renderContacts() {
  const list = document.getElementById('mChatList');
  if (!list) return;
  const q = (document.getElementById('mChatSearch')?.value || '').toLowerCase().trim();

  const items = allContacts.filter(c => {
    if (!q) return true;
    return (
      (c.name || '').toLowerCase().includes(q) ||
      (c.parentName || '').toLowerCase().includes(q) ||
      (c.roleLabel || '').toLowerCase().includes(q) ||
      (c.lastMessage || '').toLowerCase().includes(q)
    );
  });

  if (!items.length) {
    list.innerHTML = `<div class="p-6 text-center text-sm text-slate-400 font-bold">Sin resultados</div>`;
    return;
  }

  list.innerHTML = items.map(c => {
    const isActive = activeContact?.id === c.id;
    const isNew = c.unread > 0 && !c.unlinked;
    const displayName = c.childName ? c.childName : c.name;

    let lastPreview = c.unlinked
      ? 'Este padre aún no ha creado su cuenta'
      : truncateLastMsg(c.lastMessage || 'Sin mensajes');
    if (!c.unlinked && c.lastMessageIsMine) {
      const checks = c.lastMessageIsRead ? '✓✓' : '✓';
      lastPreview = `<span class="checks text-slate-400">${checks} </span>` + lastPreview;
    }
    if (!c.unlinked && !c.lastMessage) {
      lastPreview = '<span class="italic opacity-70">Comienza la conversación</span>';
    }

    const avatarBg = (c.role === 'directora')
      ? 'from-indigo-400 to-indigo-600'
      : (c.role === 'asistente')
        ? 'from-teal-400 to-teal-600'
        : c.unlinked
          ? 'from-slate-300 to-slate-400'
          : 'from-orange-400 to-orange-600';

    return `
      <div data-contact-id="${c.id || ''}"
           class="m-conv-item ${isActive ? 'is-active' : ''} ${isNew ? 'is-new' : ''} ${c.unlinked ? 'opacity-60' : ''}"
           ${c.unlinked ? 'onclick="window.safeToast(\'Este padre aún no ha creado su cuenta de acceso\', \'warning\')"' : ''}>
        <div class="m-conv-item__avatar bg-gradient-to-br ${avatarBg}">
          ${c.avatar_url
            ? `<img src="${safeUrl(c.avatar_url)}" loading="lazy">`
            : safeEscapeHTML(displayName.charAt(0))}
        </div>
        ${isNew && !isActive ? `<div class="m-conv-item__unread">${c.unread > 9 ? '9+' : c.unread}</div>` : ''}
        <div class="m-conv-item__body">
          <div class="m-conv-item__top">
            <div class="m-conv-item__name">${safeEscapeHTML(displayName)}</div>
            <div class="m-conv-item__time">${fmtLastMsgTime(c.lastMessageTime)}</div>
          </div>
          <div class="m-conv-item__bottom">
            <div class="m-conv-item__last">${lastPreview}</div>
            ${isNew ? '<div class="m-conv-item__dot"></div>' : ''}
          </div>
          <div class="m-conv-item__meta">${safeEscapeHTML(c.roleLabel || '')}</div>
        </div>
      </div>`;
  }).join('');
}

export async function selectChatContact(contactId) {
  const c = allContacts.find(x => x.id === contactId);
  if (!c || c.unlinked) return;

  activeContact = c;
  activeConversationId = null;
  _topScrollDestroy?.();
  SharedChatModule.resetPagination(null);

  // Vista móvil
  const grid = document.getElementById('chatShell');
  grid?.classList.remove('is-view-list');
  grid?.classList.add('is-view-chat');

  // Header
  const headerAvatar = document.getElementById('mChatActiveAvatar');
  const headerName = document.getElementById('mChatActiveName');
  const headerMeta = document.getElementById('mChatActiveMeta');
  const displayName = c.childName ? c.childName : c.name;
  if (headerAvatar) {
    headerAvatar.classList.add('bg-gradient-to-br',
      (c.role === 'directora') ? 'from-indigo-400 to-indigo-600'
        : (c.role === 'asistente') ? 'from-teal-400 to-teal-600'
          : 'from-orange-400 to-orange-600');
    headerAvatar.innerHTML = c.avatar_url
      ? `<img src="${safeUrl(c.avatar_url)}">`
      : safeEscapeHTML(displayName.charAt(0));
  }
  if (headerName) headerName.textContent = displayName;
  if (headerMeta) {
    headerMeta.dataset.original = c.roleLabel || '';
    headerMeta.textContent = c.roleLabel || '';
  }

  // Info panel
  renderInfoPanel(c);

  // Lista
  c.unread = 0;
  renderContacts();
  window._updateGlobalChatBadge?.();

  await loadChatMessages(false);
  subscribeToChat();
}

function renderInfoPanel(c) {
  const info = document.getElementById('mChatInfo');
  if (!info) return;
  const displayName = c.childName ? c.childName : c.name;
  info.innerHTML = `
    <div class="m-info-profile">
      <div class="m-info-profile__avatar">
        ${c.avatar_url ? `<img src="${safeUrl(c.avatar_url)}">` : safeEscapeHTML(displayName.charAt(0))}
      </div>
      <div class="m-info-profile__name">${safeEscapeHTML(displayName)}</div>
      <div class="m-info-profile__role">${safeEscapeHTML(c.roleLabel || '')}</div>
    </div>
    ${c.parentName || c.childName ? `
    <div class="m-info-card">
      <div class="m-info-card__title">Detalles</div>
      <div class="m-info-profile__meta">
        ${c.childName ? `<div><span>Estudiante</span><span>${safeEscapeHTML(c.childName)}</span></div>` : ''}
        ${c.parentName ? `<div><span>Padre/Madre</span><span>${safeEscapeHTML(c.parentName)}</span></div>` : ''}
        <div><span>Estado</span><span class="text-green-600">Activo</span></div>
      </div>
    </div>` : ''}
    <div class="m-info-card">
      <div class="m-info-card__title">Estadísticas</div>
      <div class="m-info-statrow">
        <div class="m-info-stat">
          <div class="m-info-stat__num">${c.lastMessageTime ? '…' : '0'}</div>
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
        <div class="m-info-listitem"><div class="m-info-listitem__icon"><i data-lucide="phone" class="w-4 h-4"></i></div><div class="m-info-listitem__body"><div class="m-info-listitem__label">Llamar</div><div class="m-info-listitem__sub">Necesita permiso</div></div></div>
        <div class="m-info-listitem"><div class="m-info-listitem__icon"><i data-lucide="search" class="w-4 h-4"></i></div><div class="m-info-listitem__body"><div class="m-info-listitem__label">Buscar en chat</div><div class="m-info-listitem__sub">Palabras clave</div></div></div>
      </div>
    </div>`;
  if (window.lucide) lucide.createIcons();
}

async function loadChatMessages(loadMore = false) {
  const user = AppState.get('user');
  const container = document.getElementById('mChatScroll');
  if (!container) return;

  if (!loadMore) {
    container.innerHTML = `
      <div class="m-empty">
        <div class="m-empty__icon"><i data-lucide="loader-2" class="w-8 h-8 animate-spin"></i></div>
      </div>`;
    if (window.lucide) lucide.createIcons();
  }

  try {
    const { messages, conversationId, hasMore } = await SharedChatModule.loadConversation(
      activeContact.id, activeConversationId, loadMore
    );
    if (!activeConversationId && conversationId) {
      activeConversationId = conversationId;
      subscribeToChat();
    }
    if (!loadMore) {
      if (!messages.length) {
        container.innerHTML = `
          <div class="m-empty">
            <div class="m-empty__icon"><i data-lucide="message-circle-heart" class="w-8 h-8"></i></div>
            <div class="m-empty__title">Inicia la conversación</div>
            <div class="m-empty__text">Saluda a ${safeEscapeHTML(activeContact.parentName || activeContact.name)} y mantente en contacto.</div>
          </div>`;
        if (window.lucide) lucide.createIcons();
        return;
      }
      renderMessages(messages, user.id, container);
      ScrollModule.scrollToBottom(container);
      if (_topScrollDestroy) _topScrollDestroy();
      if (hasMore !== false) {
        const { destroy } = ScrollModule.topScroll({
          container, loadFn: () => loadChatMessages(true)
        });
        _topScrollDestroy = destroy;
      }
      SharedChatModule.markAsRead(activeConversationId);
    } else {
      const scrollBefore = container.scrollTop;
      const heightBefore = container.scrollHeight;
      appendOlder(messages, user.id, container);
      container.scrollTop = container.scrollHeight - heightBefore + scrollBefore;
    }
  } catch (e) {
    if (!loadMore) container.innerHTML = `<div class="m-empty"><div class="m-empty__icon"><i data-lucide="alert-circle" class="w-8 h-8 text-red-400"></i></div><div class="m-empty__title text-red-500">Error</div><div class="m-empty__text">No se pudieron cargar los mensajes.</div></div>`;
  }
}

function _bubbleCtx() {
  return {
    myId: _currentUserId,
    myProfile: _currentUserProfile,
    contact: activeContact,
    contactLabel: activeContact?.childName || activeContact?.name,
    quoteMap: _quoteMap,
  };
}

function renderMessages(messages, myId, container) {
  _quoteMap = {};
  (messages || []).forEach(m => {
    if (m.id) _quoteMap[m.id] = (m.deleted_at ? 'Este mensaje fue eliminado' : m.content || '');
  });
  container.innerHTML = ChatUI.rowsHTML(ChatUI.buildRows(messages, myId), _bubbleCtx());
  if (window.lucide) lucide.createIcons();
}

function appendOlder(messages, myId, container) {
  (messages || []).forEach(m => {
    if (m.id) _quoteMap[m.id] = (m.deleted_at ? 'Este mensaje fue eliminado' : m.content || '');
  });
  const rows = ChatUI.buildRows(messages, myId);
  const tmp = document.createElement('div');
  tmp.innerHTML = ChatUI.rowsHTML(rows, _bubbleCtx());
  const frag = document.createDocumentFragment();
  while (tmp.firstChild) frag.appendChild(tmp.firstChild);
  container.insertBefore(frag, container.firstChild);
  if (window.lucide) lucide.createIcons();
}

async function sendChatMessage() {
  if (!activeContact) return;
  const input = document.getElementById('mChatInput');
  const text = input?.value.trim();
  if (!text && !_pendingAttachment) return;

  const user = AppState.get('user');
  const profile = AppState.get('profile') || user;
  const scroll = document.getElementById('mChatScroll');
  if (!scroll) return;

  // Modo edición
  if (_editingId) {
    const editingId = _editingId;
    input.value = '';
    input.style.height = 'auto';
    input.disabled = true;
    try {
      await SharedChatModule.editMessage(editingId, text);
      applyEdit(editingId, text);
      _quoteMap[editingId] = text;
      cancelEdit();
      loadChatContacts(true);
    } catch (_) { safeToast('Error al editar', 'error'); }
    finally { input.disabled = false; input.focus(); }
    return;
  }

  const replyTo = _replyTo;
  _replyTo = null;
  _editingId = null;
  renderReplyBar();
  const attachments = _pendingAttachment ? [_pendingAttachment] : [];
  _pendingAttachment = null;

  // Optimistic UI
  const optimisticMsg = {
    id: '__opt_' + Date.now(),
    content: text || (attachments[0]?.file_name || '📎 Adjunto'),
    sender_id: user.id,
    created_at: new Date().toISOString(),
    is_read: false,
    read_at: null,
    reply_to_id: replyTo?.id || null,
    message_attachments: attachments,
  };
  const groupCtx = _bubbleCtx();
  const wrap = document.createElement('div');
  wrap.innerHTML = ChatUI.buildGroupBubble({ sender_id: user.id, isMine: true, items: [optimisticMsg] }, groupCtx);
  const wrapEl = wrap.firstElementChild;
  if (scroll.querySelector('.m-empty')) scroll.innerHTML = '';
  scroll.appendChild(wrapEl);
  ScrollModule.scrollToBottom(scroll, true);
  if (window.lucide) lucide.createIcons();

  // Limpiar input + typing broadcast
  input.value = '';
  input.style.height = 'auto';
  input.disabled = true;
  if (activeConversationId) {
    SharedChatModule.broadcastTyping(activeConversationId, profile?.name || 'Maestra', false);
  }
  clearTimeout(_typingTimeout);

  try {
    const { message, conversationId } = await SharedChatModule.sendMessage(
      user.id, activeContact.id, text, activeConversationId,
      { replyToId: replyTo?.id || null, attachments }
    );
    if (!activeConversationId && conversationId) {
      activeConversationId = conversationId;
      AppState.set('activeConversationId', conversationId);
      subscribeToChat();
    }
    if (message?.id) {
      const realEl = document.querySelector(`[data-msg-id="${optimisticMsg.id}"]`);
      if (realEl) {
        realEl.setAttribute('data-msg-id', message.id);
        const meta = realEl.querySelector('.m-bubble__meta');
        if (meta) {
          meta.innerHTML = `${fmtMsgTime(message.created_at)}${ChatUI.readMark(message)} <button class="m-bubble__menu" data-msg-menu="${message.id || ''}" title="Más opciones"><i data-lucide="more-horizontal" class="w-3.5 h-3.5"></i></button>`;
        }
        if (window.lucide) lucide.createIcons();
      }
    }
    loadChatContacts(true);
    window._updateGlobalChatBadge?.();
  } catch (err) {
    safeToast('Error al enviar mensaje', 'error');
    document.querySelector(`[data-msg-id="${optimisticMsg.id}"]`)?.closest('.m-msg-group')?.remove();
  } finally {
    input.disabled = false;
    input.focus();
  }
}

function subscribeToChat() {
  if (_chatChannel) { try { window.supabase.removeChannel(_chatChannel); } catch(_){} _chatChannel = null; }
  if (!activeConversationId) return;
  const user = AppState.get('user');
  const profile = AppState.get('profile') || user;

  // Typing broadcast
  const input = document.getElementById('mChatInput');
  if (input && !input._typingBound) {
    input._typingBound = true;
    input.addEventListener('input', () => {
      if (!activeConversationId) return;
      SharedChatModule.broadcastTyping(activeConversationId, profile?.name || 'Maestra', true);
      clearTimeout(_typingTimeout);
      _typingTimeout = setTimeout(() => {
        SharedChatModule.broadcastTyping(activeConversationId, profile?.name || 'Maestra', false);
      }, 2500);
    });
  }

  _chatChannel = SharedChatModule.subscribeToConversation(
    activeConversationId,
    (newMsg) => {
      if (newMsg.sender_id === user?.id) return;
      const scroll = document.getElementById('mChatScroll');
      if (!scroll) return;
      removeTyping();
      if (scroll.querySelector('.m-empty')) scroll.innerHTML = '';
      if (newMsg.id != null) _quoteMap[newMsg.id] = (newMsg.deleted_at ? 'Este mensaje fue eliminado' : newMsg.content || '');

      const group = { sender_id: newMsg.sender_id, isMine: false, items: [newMsg] };
      const wrapper = document.createElement('div');
      wrapper.innerHTML = ChatUI.buildGroupBubble(group, _bubbleCtx());
      const newBubble = wrapper.querySelector('.m-bubble');

      const lastGroup = scroll.querySelector('.m-msg-group:not(.is-me):last-of-type');
      const lastContainer = lastGroup?.querySelector('.m-msg-group__bubbles');
      if (lastGroup && lastContainer) {
        lastContainer.querySelectorAll('.m-bubble').forEach(b => b.classList.remove('is-only', 'is-last', 'is-first'));
        const existing = lastContainer.querySelectorAll('.m-bubble');
        if (existing.length === 1) existing[0].classList.add('is-first');
        else {
          existing[0].classList.add('is-first');
          existing[existing.length - 1].classList.add('is-last');
        }
        newBubble.classList.remove('is-first', 'is-only');
        newBubble.classList.add('is-last');
        lastContainer.appendChild(newBubble);
      } else {
        scroll.appendChild(wrapper.firstElementChild);
      }
      if (window.lucide) lucide.createIcons();
      ScrollModule.scrollToBottom(scroll, true);
      SharedChatModule.markAsRead(activeConversationId);
      if (activeContact) activeContact.unread = 0;
      loadChatContacts(true);
      window._updateGlobalChatBadge?.();
    },
    ({ userName, isTyping, userId }) => {
      if (userId === user?.id) return;
      if (isTyping) showTyping(userName);
      else removeTyping();
    },
    (presenceState) => {
      const metaEl = document.getElementById('mChatActiveMeta');
      if (!metaEl) return;
      const orig = metaEl.dataset.original || metaEl.textContent;
      const others = new Set();
      for (const [, arr] of Object.entries(presenceState || {})) arr.forEach(p => { if (p.user_id && p.user_id !== user?.id) others.add(p.user_id); });
      if (others.size > 0) {
        metaEl.innerHTML = `${safeEscapeHTML(orig)} <span class="inline-flex items-center gap-1 text-green-600 font-bold"><span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>En línea</span>`;
      } else {
        metaEl.textContent = orig;
      }
    },
    (receipt) => {
      if (!receipt?.id) return;
      const bubble = document.querySelector(`[data-msg-id="${receipt.id}"]`);
      const read = bubble?.querySelector('.m-read');
      if (!read) return;
      if (receipt.is_read || receipt.read_at) read.textContent = '✓✓';
      if (receipt.read_at) read.classList.add('is-read');
    }
  );
}

function showTyping(userName) {
  removeTyping();
  const scroll = document.getElementById('mChatScroll');
  if (!scroll) return;
  const el = document.createElement('div');
  el.id = 'mTypingIndicator';
  el.className = 'm-typing';
  el.innerHTML = `<div class="m-typing__bubble">
    <div class="m-typing__dots"><span></span><span></span><span></span></div>
    <div class="m-typing__text">${safeEscapeHTML(userName)} está escribiendo…</div>
  </div>`;
  scroll.appendChild(el);
  ScrollModule.scrollToBottom(scroll, true);
}
function removeTyping() {
  document.getElementById('mTypingIndicator')?.remove();
}

/* ----------------------------------------------------------- */
/*            FEATURES: RESPONDER / REACCIONES / MENÚ ⋮        */
/* ----------------------------------------------------------- */

function beginReply(msg) {
  _replyTo = msg;
  _editingId = null;
  renderReplyBar();
  document.getElementById('mChatInput')?.focus();
}

function cancelReply() {
  _replyTo = null;
  renderReplyBar();
}

function beginEdit(msg) {
  _editingId = msg.id;
  _replyTo = null;
  const input = document.getElementById('mChatInput');
  if (input) {
    input.value = msg.content === 'Este mensaje fue eliminado' ? '' : (msg.content || '');
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 140) + 'px';
    input.focus();
  }
  renderReplyBar();
}

function cancelEdit() {
  _editingId = null;
  renderReplyBar();
}

function renderReplyBar() {
  const inputArea = document.getElementById('mChatInput')?.closest('.m-chat-input');
  if (!inputArea) return;
  let bar = inputArea.querySelector('.m-chat-reply-bar, .m-chat-edit-bar');
  if (bar) bar.remove();

  if (_replyTo) {
    bar = document.createElement('div');
    const q = ChatUI._replyBlock(_replyTo, _bubbleCtx());
    bar.className = 'm-chat-reply-bar';
    bar.innerHTML = (q || `<span>Respondiendo…</span>`) + `<button class="m-chat-reply-bar__close" type="button" title="Cancelar">✕</button>`;
    bar.querySelector('.m-chat-reply-bar__close')?.addEventListener('click', cancelReply);
    inputArea.prepend(bar);
  } else if (_editingId) {
    bar = document.createElement('div');
    bar.className = 'm-chat-edit-bar';
    bar.innerHTML = `<span>Editando mensaje…</span><button class="m-chat-edit-bar__close" type="button" title="Cancelar">✕</button>`;
    bar.querySelector('.m-chat-edit-bar__close')?.addEventListener('click', cancelEdit);
    inputArea.prepend(bar);
  }
}

async function onBubbleMenu(action, msgId) {
  if (!msgId) return;
  const bubble = document.querySelector(`.m-bubble[data-msg-id="${msgId}"]`);
  const contentEl = bubble?.querySelector('.m-bubble__content');
  switch (action) {
    case 'reply': {
      beginReply({
        id: msgId,
        content: contentEl?.textContent || '',
        deleted_at: !!bubble?.querySelector('.is-deleted'),
      });
      break;
    }
    case 'copy': {
      const txt = contentEl?.textContent || '';
      try {
        await navigator.clipboard.writeText(txt);
        safeToast('Mensaje copiado');
      } catch (_) { safeToast('No se pudo copiar', 'error'); }
      break;
    }
    case 'edit': {
      beginEdit({ id: msgId, content: contentEl?.textContent || '', deleted_at: !!bubble?.querySelector('.is-deleted') });
      break;
    }
    case 'delete': {
      if (!confirm('¿Eliminar este mensaje para todos?')) return;
      try {
        await SharedChatModule.softDeleteMessage(msgId);
        applySoftDelete(msgId);
        loadChatContacts(true);
      } catch (_) { safeToast('Error al eliminar', 'error'); }
      break;
    }
    case 'report':
      safeToast('Se ha reportado este mensaje');
      break;
  }
}

async function toggleReaction(msgId, emoji) {
  if (!msgId) return;
  const scroll = document.getElementById('mChatScroll');
  const chip = scroll?.querySelector(`[data-msg-react="${msgId}"][data-emoji="${emoji}"]`);
  const wasMine = chip?.classList.contains('is-mine');
  try {
    if (wasMine) await SharedChatModule.unreact(msgId, _currentUserId);
    else await SharedChatModule.reactToMessage(msgId, _currentUserId, emoji);
    await refreshReactions(msgId);
  } catch (_) { safeToast('Error al reaccionar', 'error'); }
}

async function refreshReactions(msgId) {
  const bubble = document.querySelector(`.m-bubble[data-msg-id="${msgId}"]`);
  if (!bubble) return;
  const { data } = await window.supabase.from('messages')
    .select('message_reactions(emoji, user_id)')
    .eq('id', msgId)
    .single()
    .catch(() => ({ data: null }));
  const old = bubble.querySelector('.m-bubble__reactions');
  if (old) old.remove();
  const html = ChatUI.reactionsBar({ id: msgId, message_reactions: data?.message_reactions || [] }, _currentUserId);
  if (html) bubble.insertAdjacentHTML('beforeend', html);
}

function applySoftDelete(msgId) {
  const bubble = document.querySelector(`.m-bubble[data-msg-id="${msgId}"]`);
  if (!bubble) return;
  const content = bubble.querySelector('.m-bubble__content');
  if (content) {
    content.innerHTML = `<i data-lucide="ban" class="w-3.5 h-3.5"></i> Este mensaje fue eliminado`;
    content.classList.add('is-deleted');
  }
  bubble.querySelector('.m-bubble__reactions')?.remove();
  const meta = bubble.querySelector('.m-bubble__meta');
  if (meta) meta.innerHTML = meta.innerHTML.replace(/<span class="m-read[^>]*>.*<\/span>/, '');
  if (window.lucide) lucide.createIcons();
}

function applyEdit(msgId, content) {
  const bubble = document.querySelector(`.m-bubble[data-msg-id="${msgId}"]`);
  if (!bubble) return;
  const contentEl = bubble.querySelector('.m-bubble__content');
  if (contentEl) contentEl.textContent = content;
  const meta = bubble.querySelector('.m-bubble__meta');
  if (meta && !meta.querySelector('.m-bubble__edited')) {
    meta.insertAdjacentHTML('beforeend', ' <span class="m-bubble__edited" title="Editado">editado</span>');
  }
}
