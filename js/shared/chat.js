import { supabase } from './supabase.js';
import { ScrollModule } from './scroll.module.js';
import { QueryCache } from './query-cache.js';
import { RealtimeManager } from './realtime-manager.js';
import { withTimeout } from './db-utils.js';
import { escapeHtml } from './helpers.js';

const MSG_PAGE_SIZE = 20;

// ─── Helpers globales para render estilo Messenger ────────────────────────

/** Formatea una fecha a hora (10:32 AM) */
export function fmtMsgTime(isoStr) {
  if (!isoStr) return '';
  try {
    return new Date(isoStr).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });
  } catch (_) { return ''; }
}

/** Formatea la hora del último mensaje para la lista */
export function fmtLastMsgTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const now = new Date();
  const msDiff = now - d;
  const daysDiff = Math.floor(msDiff / (1000 * 60 * 60 * 24));
  try {
    if (daysDiff === 0) return d.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });
    if (daysDiff === 1) return 'Ayer';
    if (daysDiff < 7) return d.toLocaleDateString('es-DO', { weekday: 'short' });
    return d.toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit' });
  } catch (_) { return ''; }
}

/** Trunca el último mensaje de la lista a N chars */
export function truncateLastMsg(txt, max = 45) {
  if (!txt) return '';
  txt = String(txt).replace(/\s+/g, ' ').trim();
  if (txt.length <= max) return txt;
  return txt.slice(0, max) + '…';
}

/** Agrupa mensajes consecutivos del mismo remitente (tipo Messenger) */
export function groupMessages(messages, myId) {
  if (!messages?.length) return [];
  const groups = [];
  let current = null;
  for (const m of messages) {
    if (current && current.sender_id === m.sender_id) {
      // Revisamos tiempo: si han pasado más de 5 minutos, grupo nuevo
      const lastAt = new Date(current.items[current.items.length - 1].created_at).getTime();
      const thisAt = new Date(m.created_at).getTime();
      if (thisAt - lastAt < 5 * 60 * 1000) {
        current.items.push(m);
        continue;
      }
    }
    current = { sender_id: m.sender_id, isMine: m.sender_id === myId, items: [m] };
    groups.push(current);
  }
  return groups;
}

/** Devuelve separadores "hoy", "ayer", "fecha" según los mensajes */
export function withDaySeparators(messages) {
  if (!messages?.length) return [];
  const out = [];
  let lastDay = '';
  const todayStr = new Date().toDateString();
  const yesterdayStr = new Date(Date.now() - 86400000).toDateString();
  for (const m of messages) {
    const d = new Date(m.created_at);
    const dStr = d.toDateString();
    if (dStr !== lastDay) {
      let label = d.toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long' });
      if (dStr === todayStr) label = 'Hoy';
      else if (dStr === yesterdayStr) label = 'Ayer';
      out.push({ __type: 'day-sep', label });
      lastDay = dStr;
    }
    out.push({ __type: 'msg', data: m });
  }
  return out;
}

/**
 * 💬 ChatModule: Cerebro unificado de mensajería
 * Maneja la lógica compleja de conversaciones, participantes y realtime.
 */
export const ChatModule = {
  _activeSubscription: null,
  // Paginación por conversación: { [convId]: { page, hasMore, loading } }
  _pagination: {},

  /**
   * Obtiene un mapa de mensajes no leídos por remitente { userId: count }
   * Usa una RPC optimizada de base de datos.
   */
  async getUnreadCounts() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { total: 0, counts: {} };

      // Primero intentamos la RPC optimizada
      try {
        const rpcRes = await supabase.rpc('get_unread_counts');
        if (!rpcRes.error && rpcRes.data) {
          const counts = {};
          let total = 0;
          (rpcRes.data || []).forEach(r => {
            counts[r.user_id] = Number(r.unread || 0);
            total += Number(r.unread || 0);
          });
          return { total, counts };
        }
      } catch (_) { /* RPC no existe aún → fallback */ }

      const { data, error } = await supabase
        .from('messages')
        .select('sender_id')
        .eq('receiver_id', user.id)
        .eq('is_read', false);

      if (error) return { total: 0, counts: {} };

      const counts = {};
      (data || []).forEach(m => {
        counts[m.sender_id] = (counts[m.sender_id] || 0) + 1;
      });

      return { total: data.length, counts };
    } catch (_) {
      return { total: 0, counts: {} };
    }
  },

  /**
   * Carga los contactos para el padre (Restringido a Maestra y Directora)
   */
  async loadPadreContacts(studentId) {
    // Always force fresh load — avoid caching empty results
    QueryCache.invalidate(`padre_contacts_${studentId}`);
    return QueryCache.get(`padre_contacts_${studentId}`, async () => {
      try {
        // Load all staff directly — no classroom join needed for the contact list
        const { data: staff, error } = await supabase
          .from('profiles')
          .select('id, name, avatar_url, role')
          .in('role', ['directora', 'asistente', 'maestra'])
          .order('role')
          .order('name');

        if (error) throw error;
        if (!staff?.length) return [];

        // Try to get classroom teacher to put first
        let teacherId = null;
        try {
          const { data: student } = await supabase
            .from('students')
            .select('classroom_id, classrooms(teacher_id)')
            .eq('id', studentId)
            .maybeSingle();
          teacherId = student?.classrooms?.teacher_id || null;
        } catch (_) {}

        const contacts = [];
        const seen = new Set();

        // Teacher first
        if (teacherId) {
          const teacher = staff.find(s => s.id === teacherId);
          if (teacher) { contacts.push({ ...teacher, roleLabel: 'Maestra Titular' }); seen.add(teacher.id); }
        }

        // Rest of staff
        staff.forEach(s => {
          if (!seen.has(s.id)) {
            contacts.push({
              ...s,
              roleLabel: s.role === 'directora' ? 'Directora'
                       : s.role === 'asistente' ? 'Asistente'
                       : 'Maestra'
            });
            seen.add(s.id);
          }
        });

        return contacts;
      } catch (err) {
        console.warn('[Chat] loadPadreContacts error:', err?.message);
        return [];
      }
    }, 2 * 60_000);
  },

  /**
   * Carga la conversación privada con otro usuario — PAGINADA (últimos 20 mensajes).
   * @param {string}  otherUserId
   * @param {string}  conversationId  — si ya se conoce
   * @param {boolean} loadMore        — true = cargar página anterior (scroll arriba)
   */
  async loadConversation(otherUserId, conversationId = null, loadMore = false) {
    if (conversationId) {
      // Modo paginado por conversationId
      const state = this._getPagState(conversationId);
      if (loadMore && !state.hasMore) return { messages: [], conversationId };
      if (state.loading) return { messages: [], conversationId };
      state.loading = true;

      try {
        const from = state.page * MSG_PAGE_SIZE;
        const to   = from + MSG_PAGE_SIZE - 1;

        const { data: messages, error } = await supabase
          .from('messages')
          .select(`
            id, conversation_id, sender_id, receiver_id, content, is_read, read_at,
            message_type, reply_to_id, edited_at, deleted_at, created_at,
            message_reactions(emoji, user_id),
            message_attachments(url, file_name, file_type, file_size)
          `)
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: false })  // más recientes primero
          .range(from, to);

        if (error) throw error;

        const ordered = (messages || []).reverse(); // invertir para mostrar cronológico
        state.page++;
        state.hasMore = (messages || []).length === MSG_PAGE_SIZE;

        // ✅ LIMPIEZA LÓGICA DE DOM: Si hay demasiados mensajes, podríamos truncar, 
        // pero por ahora garantizamos que el estado refleje lo cargado
        return { messages: ordered, conversationId, hasMore: state.hasMore };
      } finally {
        state.loading = false;
      }
    } else {
      // Modo normal: buscar por ID de usuario destino via RPC
      const { data, error } = await supabase.rpc('get_direct_messages', {
        p_other_user_id: otherUserId
      });

      // Si el RPC no existe aún, retornar vacío sin lanzar error
      if (error) {
        return { messages: [], conversationId: null, hasMore: false };
      }

      const messages = (data || []).slice(-MSG_PAGE_SIZE);
      const foundConvId = messages.length > 0 ? messages[0].conversation_id : null;

      if (foundConvId) {
        const state = this._getPagState(foundConvId);
        state.page = 1;
        state.hasMore = (data || []).length >= MSG_PAGE_SIZE;
      }

      return { messages, conversationId: foundConvId, hasMore: false };
    }
  },

  /** Obtiene o crea el estado de paginación para una conversación */
  _getPagState(convId) {
    if (!this._pagination[convId]) {
      this._pagination[convId] = { page: 0, hasMore: true, loading: false };
    }
    return this._pagination[convId];
  },

  /** Resetea la paginación de una conversación (al abrir un chat nuevo) */
  resetPagination(convId) {
    if (convId) delete this._pagination[convId];
  },

  /**
   * Envía un mensaje. 
   * 🔥 Lógica Inteligente: Si no existe conversación, la crea automáticamente junto con los participantes.
   */
  async sendMessage(senderId, receiverId, content, conversationId = null, opts = {}) {
    try {
      let activeConvId = conversationId;

      // 1. Si no hay conversationId, buscar una existente o crearla
      if (!activeConvId) {
        // Buscar conversación privada existente entre estos dos usuarios
        let convId = null;

        // Intentar con RPC primero
        const rpcRes = await supabase.rpc('find_or_create_private_conversation', {
          p_user1: senderId,
          p_user2: receiverId
        });

        if (!rpcRes.error && rpcRes.data) {
          convId = rpcRes.data;
        } else {
          // Fallback: crear manualmente si el RPC no existe
          const { data: newConv } = await supabase
            .from('conversations')
            .insert({ type: 'direct_message' })
            .select('id')
            .single();

          if (newConv?.id) {
            convId = newConv.id;
            try {
              await supabase.from('conversation_participants').insert([
                { conversation_id: convId, user_id: senderId },
                { conversation_id: convId, user_id: receiverId }
              ]);
            } catch (_) {}
          }
        }

        if (convId) {
          activeConvId = convId;
        } else {
          throw new Error('No se pudo crear o encontrar la conversación');
        }
      }

      // 2. Insertar el mensaje
      const { data: message, error: msgError } = await supabase
        .from('messages')
        .insert({
          conversation_id: activeConvId,
          sender_id: senderId,
          receiver_id: receiverId,   // keep for NOT NULL compat until migration runs
          content: content.trim(),
          is_read: false,
          message_type: opts.messageType || 'text',
          reply_to_id: opts.replyToId || null,
        })
        .select()
        .single();

      if (msgError) throw msgError;

      // 3. Adjuntos (multimedia)
      if (opts.attachments?.length && message?.id) {
        const rows = opts.attachments.map(a => ({
          message_id: message.id,
          url: a.url,
          file_name: a.file_name || null,
          file_type: a.file_type || null,
          file_size: a.file_size || null,
        }));
        const attachRes = await supabase.from('message_attachments').insert(rows).select();
        if (attachRes.error) throw attachRes.error;
        message.message_attachments = attachRes.data || [];
      }

      return { message, conversationId: activeConvId };
    } catch (err) {
      throw err;
    }
  },

  /**
   * Suscripción Realtime Unificada — con typing indicators, presence y read receipts
   */
  subscribeToConversation(conversationId, onMessage, onTyping, onPresence, onReadReceipt) {
    this.unsubscribe();

    const channelName = `chat_cv_${conversationId}`;
    this._activeSubscription = supabase.channel(channelName);
    
    this._activeSubscription
      // 1. Nuevos mensajes
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`
      }, (payload) => {
        if (payload.new) {
          // Marcar como leído si el chat está abierto (lado receptor)
          if (payload.new.sender_id !== supabase.auth.getUser().data?.user?.id) {
            this.markAsRead(conversationId);
          }
          onMessage(payload.new);
        }
      })
      // 2. Read receipts (Doble Check)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`
      }, (payload) => {
        if (payload.new && onReadReceipt) onReadReceipt(payload.new);
      })
      // 3. Typing indicator via broadcast
      .on('broadcast', { event: 'typing' }, (payload) => {
        if (onTyping) onTyping(payload.payload);
      })
      // 4. Presence (Estado en Línea)
      .on('presence', { event: 'sync' }, () => {
        const state = this._activeSubscription.presenceState();
        if (onPresence) onPresence(state);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          // Track user presence
          const user = (await supabase.auth.getUser())?.data?.user;
          if (user) {
            await this._activeSubscription.track({
              user_id: user.id,
              online_at: new Date().toISOString(),
            });
          }
        }
      });

    this._activeChannelName = channelName;
    this._activeConvId = conversationId;
    return this._activeSubscription;
  },

  /**
   * Broadcast typing indicator to conversation participants
   */
  async broadcastTyping(conversationId, userName, isTyping) {
    if (!conversationId || !this._activeSubscription) return;
    try {
      await this._activeSubscription.send({
        type: 'broadcast',
        event: 'typing',
        payload: { userName, isTyping, userId: (await supabase.auth.getUser())?.data?.user?.id }
      });
    } catch (_) {}
  },

  unsubscribe() {
    if (this._activeSubscription) {
      supabase.removeChannel(this._activeSubscription);
      this._activeSubscription = null;
      this._activeChannelName = null;
      this._activeConvId = null;
    }
  },

  /**
   * Marca como leídos los mensajes de una conversación (con timestamp)
   */
  async markAsRead(conversationId) {
    if (!conversationId) return;
    try {
      // Use the new RPC that sets read_at timestamp
      await supabase.rpc('mark_messages_read', {
        p_conversation_id: conversationId
      });
    } catch (_) {}
  },

  /* ───────────────  RESPONDER / REACCIONES / EDITAR / ELIMINAR  ───────────────── */

  /** Envía una respuesta citando otro mensaje */
  async sendReply(senderId, receiverId, content, replyToId, conversationId = null) {
    return this.sendMessage(senderId, receiverId, content, conversationId, { replyToId });
  },

  /** Crea o cambia la reacción de un usuario sobre un mensaje (1 emoji por usuario) */
  async reactToMessage(messageId, userId, emoji) {
    try {
      const { data, error } = await supabase.from('message_reactions')
        .upsert({ message_id: messageId, user_id: userId, emoji }, { onConflict: 'message_id,user_id' })
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (err) { throw err; }
  },

  /** Quita la reacción del usuario sobre un mensaje */
  async unreact(messageId, userId) {
    try {
      const { error } = await supabase.from('message_reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('user_id', userId);
      if (error) throw error;
    } catch (err) { throw err; }
  },

  /** Edita el contenido de un mensaje (propio). Marca edited_at */
  async editMessage(messageId, content) {
    try {
      const { data, error } = await supabase.from('messages')
        .update({ content: content.trim(), edited_at: new Date().toISOString() })
        .eq('id', messageId)
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (err) { throw err; }
  },

  /** Borrado lógico: deleted_at + contenido neutralizado */
  async softDeleteMessage(messageId) {
    try {
      const { data, error } = await supabase.from('messages')
        .update({ deleted_at: new Date().toISOString(), content: 'Este mensaje fue eliminado' })
        .eq('id', messageId)
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (err) { throw err; }
  },

  /** Sube un archivo a Supabase Storage (bucket "chat-attachments") y devuelve la URL pública */
  async uploadAttachment(file, onProgress) {
    if (!file) throw new Error('Sin archivo');
    const bucket = 'chat-attachments';
    const ext = (file.name || 'file').split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
    const name = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const upload = supabase.storage.from(bucket).upload(name, file, {
      cacheControl: '3600',
      upsert: false,
    });
    if (onProgress && upload.subscribe) {
      upload.subscribe(({ event, progress }) => {
        if (event === 'UPLOAD_PROGRESS') onProgress(progress);
      });
    }
    const { error } = await upload;
    if (error) throw error;
    const { data } = supabase.storage.from(bucket).getPublicUrl(name);
    const isImage = file.type?.startsWith('image/');
    return {
      url: data?.publicUrl,
      file_name: file.name,
      file_type: isImage ? 'image' : 'file',
      file_size: file.size || null,
    };
  },

  /**
   * Obtiene la lista de conversaciones/chats según el rol del usuario
   */
  async getChatList() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    const role = profile?.role || 'padre';

    // 1. Query base de conversaciones
    let query = supabase
      .from('conversations')
      .select(`
        id, 
        type, 
        classroom_id, 
        classrooms(name),
        conversation_participants(
          user_id, 
          profiles(id, name, role, avatar_url)
        )
      `);

    // RLS ya filtra para maestra/padre, pero Directora puede ver todo.
    const { data: conversations, error } = await query.order('updated_at', { ascending: false });
    if (error) throw error;

    // 2. Normalizar para UI tipo Messenger
    return conversations.map(c => {
      if (c.type === 'classroom') {
        return { conversationId: c.id, name: `Grupo: ${c.classrooms?.name || 'Aula'}`, meta: 'Chat del salón', avatar: null, type: 'classroom' };
      } else {
        // Detectar si soy participante
        const isMeParticipant = c.conversation_participants.some(p => p.user_id === user.id);
        
        if (!isMeParticipant && role === 'directora') {
          // Formato Auditoría: mostrar quién habla con quién
          const p1 = c.conversation_participants[0]?.profiles?.name || 'Usuario A';
          const p2 = c.conversation_participants[1]?.profiles?.name || 'Usuario B';
          return {
            conversationId: c.id,
            name: `${p1} ↔ ${p2}`,
            meta: 'Supervisión de chat',
            avatar: null,
            type: 'audit'
          };
        }

        const other = c.conversation_participants.find(p => p.user_id !== user.id);
        return { conversationId: c.id, name: other?.profiles?.name || 'Usuario', meta: other?.profiles?.role || '', avatar: other?.profiles?.avatar_url, type: 'direct_message', otherUserId: other?.profiles?.id };
      }
    });
  },
  /**
   * Mezcla contactos con su último mensaje, hora y no leídos.
   * Ordena por updated_at desc y devuelve lista lista para estilo Messenger.
   *
   * @param {Array} contactos  — [{id,name,avatar_url,roleLabel,...}]
   * @returns {Promise<Array>} — contactos enriquecidos + ordenados
   */
  async enrichContactsWithLastMessage(contactos) {
    const user = (await supabase.auth.getUser())?.data?.user;
    if (!user || !contactos?.length) return contactos || [];

    const unreadRes = await this.getUnreadCounts();
    const unreadMap = unreadRes.counts || {};

    // Buscar último mensaje por cada par de usuarios enriquecido
    const ids = contactos.map(c => c.id).filter(Boolean);
    let lastByOther = {};
    if (ids.length) {
      try {
        // Últimos 200 mensajes del usuario (tanto enviados como recibidos)
        const { data } = await supabase
          .from('messages')
          .select('id, sender_id, receiver_id, content, created_at, is_read')
          .or(`and(sender_id.eq.${user.id},receiver_id.in.(${ids.join(',')})),and(receiver_id.eq.${user.id},sender_id.in.(${ids.join(',')}))`)
          .order('created_at', { ascending: false })
          .limit(300);

        (data || []).forEach(m => {
          const otherId = m.sender_id === user.id ? m.receiver_id : m.sender_id;
          if (!lastByOther[otherId]) {
            lastByOther[otherId] = m;
          }
        });
      } catch (_) { /* sin datos */ }
    }

    // Enriquecer y ordenar
    const enriched = contactos.map(c => {
      const last = lastByOther[c.id];
      return {
        ...c,
        unread: Number(unreadMap[c.id] || 0),
        lastMessage: last?.content || '',
        lastMessageTime: last?.created_at || null,
        lastMessageIsMine: last ? last.sender_id === user.id : false,
        lastMessageIsRead: last ? !!last.is_read : null,
      };
    });

    // Orden: primero los que tienen mensaje más reciente, luego los no leídos
    enriched.sort((a, b) => {
      const ta = a.lastMessageTime ? new Date(a.lastMessageTime).getTime() : -1;
      const tb = b.lastMessageTime ? new Date(b.lastMessageTime).getTime() : -1;
      // Sin mensaje: ponerlos después pero con no leídos arriba
      if (ta === -1 && tb === -1) return (b.unread - a.unread);
      if (ta === -1) return 1;
      if (tb === -1) return -1;
      return tb - ta;
    });

    return enriched;
  },

  /**
   * Suscripción global a mensajes NUEVOS ENVIADOS O RECIBIDOS por el usuario.
   * Úsala para reordenar la lista de contactos y actualizar badges globales.
   * Devuelve { unsubscribe }
   */
  onAnyNewMessage(callback) {
    const channelName = `chat_any_msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const ch = supabase.channel(channelName);
    ch.on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'messages'
    }, (payload) => {
      if (payload?.new) callback(payload.new);
    }).subscribe();
    return {
      unsubscribe: () => supabase.removeChannel(ch)
    };
  },

  async init() {
    // Placeholder para inicialización si se requiere en el futuro
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  ChatUI — Renderer compartido estilo Messenger (respuestas, reacciones, ⋮)
//  Usado por todos los paneles para mantener burbujas idénticas.
// ─────────────────────────────────────────────────────────────────────────────

/** Emojis de reacción soportados (orden de muestra) */
export const CHAT_REACTIONS = { like: '👍', love: '❤️', haha: '😂', wow: '😮', sad: '😢', angry: '😡', clap: '👏', fire: '🔥' };

export const ChatUI = {
  /** Convierte mensajes → filas (separadores de día + grupos del mismo remitente) */
  buildRows(messages, myId) {
    const rows = [];
    let pending = [];
    const flush = () => {
      if (pending.length) {
        groupMessages(pending, myId).forEach(g => rows.push({ __type: 'group', data: g }));
        pending = [];
      }
    };
    for (const entry of withDaySeparators(messages)) {
      if (entry.__type === 'day-sep') { flush(); rows.push({ __type: 'day-sep', label: entry.label }); }
      else pending.push(entry.data);
    }
    flush();
    return rows;
  },

  /** Renderiza filas a HTML (separadores "Hoy/Ayer" + burbujas agrupadas) */
  rowsHTML(rows, ctx) {
    return rows.map(r => r.__type === 'day-sep'
      ? `<div class="m-day-sep"><span>${escapeHtml(r.label)}</span></div>`
      : this.buildGroupBubble(r.data, ctx)
    ).join('');
  },

  /** Renderiza un grupo de burbujas con respuestas, reacciones, adjuntos y menú */
  buildGroupBubble(group, ctx) {
    ctx = ctx || {};
    const myId = ctx.myId;
    const isMine = group.isMine;
    const sender = isMine ? (ctx.myProfile || {}) : (ctx.contact || {});
    const avatarUrl = sender?.avatar_url || sender?.avatar || null;
    const avatarLabel = isMine ? 'Tú' : (ctx.contact?.name || ctx.contactLabel || 'Contacto');
    const initials = (avatarLabel.charAt(0) || '?').toUpperCase();
    const avatarHTML = avatarUrl
      ? `<img src="${avatarUrl}" alt="${escapeHtml(avatarLabel)}" class="w-full h-full object-cover">`
      : `<span>${initials}</span>`;
    const senderName = (isMine ? (ctx.myProfile?.name || 'Tú') : (ctx.contact?.name || ctx.contactLabel || 'Contacto'));

    const bubbles = group.items.map((m, i) => {
      const total = group.items.length;
      let pos = '';
      if (total === 1) pos = 'is-only';
      else if (i === 0) pos = 'is-first';
      else if (i === total - 1) pos = 'is-last';
      const time = fmtMsgTime(m.created_at);
      const readMark = isMine ? this.readMark(m) : '';
      const edited = m.edited_at ? ' <span class="m-bubble__edited" title="Editado">editado</span>' : '';
      const menuBtn = `<button class="m-bubble__menu" data-msg-menu="${m.id || ''}" title="Más opciones"><i data-lucide="more-horizontal" class="w-3.5 h-3.5"></i></button>`;

      const replyBlock = this._replyBlock(m, ctx);
      const contentBlock = this._contentBlock(m);
      const reactions = this._reactionsBar(m, myId);

      return `
        <div class="m-bubble ${pos}" data-msg-id="${m.id || ''}">
          ${replyBlock}
          ${contentBlock}
          <div class="m-bubble__meta">${time}${edited}${readMark}${menuBtn}</div>
          ${reactions}
        </div>`;
    }).join('');

    return `
      <div class="m-msg-group ${isMine ? 'is-me' : ''}">
        <div class="m-msg-group__avatar" ${isMine ? 'aria-hidden="true"' : ''}>${avatarHTML}</div>
        <div class="m-msg-group__col">
          ${!isMine ? `<div class="m-msg-group__sender">${escapeHtml(senderName)}</div>` : ''}
          <div class="m-msg-group__bubbles">${bubbles}</div>
        </div>
      </div>`;
  },

  /** Bloques citados (respuesta) */
  _replyBlock(m, ctx) {
    if (!m.reply_to_id) return '';
    let quote = (ctx?.quoteMap || {})[m.reply_to_id];
    if (!quote) {
      const el = document.querySelector(`.m-bubble[data-msg-id="${m.reply_to_id}"] .m-bubble__content`);
      if (el) quote = el.textContent.trim();
    }
    if (!quote) return '';
    return `
      <div class="m-reply" data-reply-target="${m.reply_to_id}">
        <span class="m-reply__arrow"></span>
        <span class="m-reply__text">Respondiendo a: ${escapeHtml(String(quote).slice(0, 90))}</span>
      </div>`;
  },

  /** Contenido: borrado lógico, adjuntos (imagen/archivo) y texto */
  _contentBlock(m) {
    if (m.deleted_at) {
      return `<div class="m-bubble__content is-deleted"><i data-lucide="ban" class="w-3.5 h-3.5"></i> Este mensaje fue eliminado</div>`;
    }

    const attachments = m.message_attachments || [];
    const media = attachments.map(a => {
      const name = a.file_name || a.url || '';
      if (a.file_type === 'image' || /\.(png|jpe?g|gif|webp|bmp)$/i.test(name)) {
        return `<a class="m-attach-img" href="${a.url}" target="_blank" rel="noopener" data-msg-img>
                  <img src="${a.url}" alt="${escapeHtml(name)}" loading="lazy">
                </a>`;
      }
      return `<a class="m-attach-file" href="${a.url}" target="_blank" rel="noopener">
                <i data-lucide="file" class="w-4 h-4"></i><span>${escapeHtml(name)}</span>
              </a>`;
    }).join('');

    return `
      <div class="m-bubble__content">${media}${escapeHtml(m.content || '')}</div>`;
  },

  /** Barra de reacciones del mensaje */
  _reactionsBar(m, myId) {
    return this.reactionsBar(m, myId);
  },

  /** Barra de reacciones del mensaje (público: refresco DOM) */
  reactionsBar(m, myId) {
    const list = m.message_reactions || [];
    if (!list.length) return '';
    const counts = {};
    list.forEach(r => {
      const k = r.emoji || '👍';
      counts[k] = counts[k] || { count: 0, me: false };
      counts[k].count++;
      if (r.user_id === myId) counts[k].me = true;
    });
    return `
      <div class="m-bubble__reactions">
        ${Object.entries(counts).map(([emoji, v]) => `
          <button class="m-react-chip ${v.me ? 'is-mine' : ''}" data-msg-react="${m.id || ''}" data-emoji="${escapeHtml(emoji)}" title="Reacción">
            <span>${emoji}</span><span class="m-react-chip__count">${v.count}</span>
          </button>`).join('')}
      </div>`;
  },

  /** Marca de lectura (✓ / ✓✓ / ✓✓ azul) */
  readMark(msg) {
    if (msg.deleted_at) return '';
    if (msg.read_at) return ' <span class="m-read is-read" title="Leído">✓✓</span>';
    if (msg.is_read) return ' <span class="m-read" title="Entregado">✓✓</span>';
    return ' <span class="m-read" title="Enviado">✓</span>';
  },

  /* ---------------------------------------------------------- */
  /*  EVENTOS DELEGADOS (scroll) — reacciones, menú, respuestas  */
  /* ---------------------------------------------------------- */

  /**
   * Enlaza la delegación de eventos sobre el contenedor del scroll:
   *   - tap corto en burbuja      → toggle 👍 (like)
   *   - long-press (400 ms)       → abre el picker de reacciones
   *   - botón ⋮                   → abre el menú (Responder/Copiar/Editar/Eliminar/Reportar)
   *   - chip de reacción          → abrir picker sobre ese emoji
   *
   * @param {Element} scroll   contenedor .m-chat-scroll
   * @param {Object}  h        handlers: { myId, reactOnMessage(id,emoji), pickerHTML(id), openMenu(id,btn), onMenu(action,id) }
   */
  bindBubbleEvents(scroll, h) {
    if (!scroll || scroll._chatBubblesBound) return;
    scroll._chatBubblesBound = true;

    let pressTimer = null;
    let pressTarget = null;

    scroll.addEventListener('pointerdown', (e) => {
      const bubble = e.target.closest('.m-bubble[data-msg-id]');
      const picker = e.target.closest('.m-react-picker');
      if (!bubble || picker || e.target.closest('.m-bubble__menu') || e.target.closest('.m-react-chip')) return;
      pressTarget = bubble;
      pressTimer = setTimeout(() => {
        this._openPicker(bubble, h);
        pressTarget = null;
        pressTimer = null;
      }, 400);
    });

    const clearPress = () => {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
      pressTarget = null;
    };
    scroll.addEventListener('pointerup', (e) => clearPress());
    scroll.addEventListener('pointercancel', () => clearPress());
    scroll.addEventListener('pointerleave', () => clearPress());

    // Tap corto = like (después del long-press)
    scroll.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-msg-react]');
      if (chip) {
        e.stopPropagation();
        h?.reactOnMessage?.(chip.dataset.msgReact, chip.dataset.emoji || '👍');
        return;
      }
      const menuBtn = e.target.closest('[data-msg-menu]');
      if (menuBtn) {
        e.stopPropagation();
        this._openMenu(menuBtn, h);
        return;
      }
      const item = e.target.closest('[data-menu-item]');
      if (item) {
        e.stopPropagation();
        h?.onMenu?.(item.dataset.menuItem, item.closest('.m-bubble')?.dataset.msgId);
        this._closePopovers(scroll);
        return;
      }
      const pick = e.target.closest('[data-msg-pick]');
      if (pick) {
        e.stopPropagation();
        h?.reactOnMessage?.(pick.dataset.msgId, pick.dataset.emoji || '👍');
        this._closePopovers(scroll);
        return;
      }
      // Tap corto en burbuja (no fue long-press)
      const bubble = e.target.closest('.m-bubble[data-msg-id]');
      if (bubble && !bubble._longPressed && !e.target.closest('a')) {
        this._closePopovers(scroll);
        h?.onBubbleTap?.(bubble.dataset.msgId);
      }
    });
  },

  /** Abre el picker de reacciones sobre una burbuja */
  _openPicker(bubble, h) {
    if (!bubble || !h?.pickerHTML) return;
    bubble._longPressed = true;
    setTimeout(() => { bubble._longPressed = false; }, 500);
    this._closePopovers(bubble.closest('.m-chat-scroll'));
    const existing = document.querySelector('.m-react-picker');
    if (existing) existing.remove();

    const rect = bubble.getBoundingClientRect();
    const wrap = document.createElement('div');
    wrap.className = 'm-react-picker';
    wrap.innerHTML = h.pickerHTML(bubble.dataset.msgId);
    document.body.appendChild(wrap);

    const w = wrap.offsetWidth;
    let left = rect.left + rect.width / 2 - w / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    const top = Math.max(8, rect.top - wrap.offsetHeight - 8);
    wrap.style.left = left + 'px';
    wrap.style.top = top + 'px';
    wrap.style.position = 'fixed';
    wrap.style.zIndex = '9999';

    wrap.addEventListener('pointerdown', (e) => e.stopPropagation());
    document.addEventListener('pointerdown', function closeOutside(ev) {
      if (!wrap.contains(ev.target)) {
        wrap.remove();
        document.removeEventListener('pointerdown', closeOutside);
      }
    });
  },

  /** Abre el menú ⋮ anclado al botón */
  _openMenu(btn, h) {
    this._closePopovers(document);
    const id = btn.dataset.msgMenu;
    const bubble = btn.closest('.m-bubble');
    const isMine = bubble?.closest('.m-msg-group')?.classList.contains('is-me') || h?.canEditAll === true;
    const isDeleted = !!bubble?.querySelector('.is-deleted');

    const items = [
      { a: 'reply', label: 'Responder', id }, 
      { a: 'copy', label: 'Copiar', id },
    ];
    if (isMine && !isDeleted) items.push({ a: 'edit', label: 'Editar', id });
    if (!isDeleted) items.push({ a: 'delete', label: 'Eliminar', id, danger: true });
    items.push({ a: 'report', label: 'Reportar', id });

    const wrap = document.createElement('div');
    wrap.className = 'm-bubble-menu';
    wrap.innerHTML = items.map(it => `
      <button class="m-bubble-menu__item ${it.danger ? 'is-danger' : ''}" data-menu-item="${it.a}" data-msg-id="${it.id}">
        ${it.label}
      </button>`).join('');

    const rect = btn.getBoundingClientRect();
    document.body.appendChild(wrap);
    const w = wrap.offsetWidth;
    let left = rect.right - w;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    const top = rect.bottom + 6;
    wrap.style.position = 'fixed';
    wrap.style.left = left + 'px';
    wrap.style.top = Math.min(top, window.innerHeight - wrap.offsetHeight - 8) + 'px';
    wrap.style.zIndex = '9999';

    wrap.addEventListener('pointerdown', (e) => e.stopPropagation());
    document.addEventListener('pointerdown', function closeMenu(ev) {
      if (!wrap.contains(ev.target)) {
        wrap.remove();
        document.removeEventListener('pointerdown', closeMenu);
      }
    });
  },

  /** Cierra pickers/menús abiertos */
  _closePopovers(scope) {
    if (scope === document) {
      document.querySelectorAll('.m-react-picker, .m-bubble-menu').forEach(el => el.remove());
      return;
    }
    document.querySelectorAll('.m-react-picker, .m-bubble-menu').forEach(el => el.remove());
  },

  /** HTML del picker de reacciones */
  pickerHTML(msgId) {
    return `
      <div class="m-react-picker__row">
        ${Object.entries(CHAT_REACTIONS).map(([, e]) => `
          <button class="m-react-pick" data-msg-pick="${msgId}" data-emoji="${e}">${e}</button>`).join('')}
      </div>`;
  },
};
