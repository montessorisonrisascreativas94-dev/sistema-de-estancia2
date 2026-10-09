/**
 * Colegio Montessori Sonrisas Creativas — Notification Center (Arquitectura Unificada)
 *
 * Fuente ÚNICA de verdad para TODO el sistema de notificaciones de los 7 paneles:
 *   • Campana flotante (badge + modal de lista)
 *   • Badges del sidebar (badge-section)
 *   • Badges de tarjetas del dashboard (badge-card-section)
 *   • Badge chat / comunicación / alertas
 *   • Suscripción Realtime (UN SOLO CANAL por usuario)
 *   • Conteo mensajes sin leer (RPC + tabla messages)
 *
 * Reemplaza y engloba la lógica que estaba dispersa en 3 módulos superpuestos:
 *   - badges.js            → BadgeSystem
 *   - unread-messages.js   → UnreadMessages
 *   - news-center.js       → NewsCenter
 *
 * Compatibilidad HACIA ATRÁS (no se rompe código legacy):
 *   window.BadgeSystem     → adaptador → NotificationCenter
 *   window.UnreadMessages  → adaptador → NotificationCenter
 *   window.NewsCenter      → adaptador → NotificationCenter
 *   window._updateGlobalChatBadge = refresh de mensajes
 *
 * Fallbacks de lectura en TODAS las rutas:
 *   1. Supabase SDK
 *   2. fetchPostgREST (directo al endpoint /rest/v1/)
 *   3. Último valor conocido en memoria (no rompe UI)
 */

import { supabase, fetchPostgREST } from './supabase.js';
import { escapeHtml } from './helpers.js';

/* ─────────────────────────────────────────────────────
   CONSTANTES / CONFIG
   ───────────────────────────────────────────────────── */

const TYPE_CONFIG = {
  announcement:   { icon: '📢', label: 'Anuncio',        accent: '#0B63C7', priority: 2 },
  chat:           { icon: '💬', label: 'Mensaje',        accent: '#28B54D', priority: 3 },
  message:        { icon: '💬', label: 'Mensaje',        accent: '#28B54D', priority: 3 },
  task:           { icon: '📚', label: 'Tarea',          accent: '#FF9F1C', priority: 4 },
  homework:       { icon: '📚', label: 'Tarea',          accent: '#FF9F1C', priority: 4 },
  submission:     { icon: '📥', label: 'Entrega',        accent: '#8B5CF6', priority: 4 },
  'task-submission': { icon: '📥', label: 'Entrega',     accent: '#8B5CF6', priority: 4 },
  'post-feedback':{ icon: '💬', label: 'Feedback',       accent: '#8B5CF6', priority: 3 },
  payment:        { icon: '💵', label: 'Pago',           accent: '#10B981', priority: 5 },
  receipt:        { icon: '🧾', label: 'Comprobante',    accent: '#FF6B35', priority: 5 },
  alert:          { icon: '⚠️', label: 'Alerta',         accent: '#EF4444', priority: 6 },
  inquiry:        { icon: '🗂️', label: 'Consulta',       accent: '#0B63C7', priority: 4 },
  attendance:     { icon: '📋', label: 'Asistencia',     accent: '#0D9488', priority: 3 },
  grade:          { icon: '⭐', label: 'Calificación',   accent: '#F59E0B', priority: 4 },
  post:           { icon: '📣', label: 'Publicación',    accent: '#0B63C7', priority: 2 },
  muro:           { icon: '📣', label: 'Publicación',    accent: '#0B63C7', priority: 2 },
  comment:        { icon: '💭', label: 'Comentario',     accent: '#64748B', priority: 2 },
  like:           { icon: '❤️', label: 'Reacción',       accent: '#EC4899', priority: 1 },
  'new-student':  { icon: '🧒', label: 'Nuevo estudiante', accent: '#0B63C7', priority: 4 },
  'new-teacher':  { icon: '👩‍🏫', label: 'Nuevo docente',  accent: '#28B54D', priority: 4 },
  event:          { icon: '📅', label: 'Evento',         accent: '#06B6D4', priority: 2 },
  live:           { icon: '🔴', label: 'En vivo',        accent: '#EF4444', priority: 6 },
  info:           { icon: 'ℹ️', label: 'Info',           accent: '#64748B', priority: 0 },
  default:        { icon: '🔔', label: 'Novedad',        accent: '#64748B', priority: 0 }
};
const _cfg = (t) => TYPE_CONFIG[t] || TYPE_CONFIG.default;

const MAX_NOTIF_LIST = 200;
const MAX_MSG_QUERY  = 500;
const REFRESH_DEBOUNCE_MS = 400;

/* ─────────────────────────────────────────────────────
   ESTADO INTERNO (singleton)
   ───────────────────────────────────────────────────── */

const _state = {
  userId: null,
  role: null,
  items: [],            // notificaciones desde tabla notifications
  notifUnread: 0,       // COUNT exact (sin límite) de notifications sin leer
  msgCounts: {},        // senderId → n mensajes sin leer
  msgUnread: 0,         // total mensajes sin leer
  counts: {},           // section → n (para badges sidebar)
  filter: 'all',        // all | unread
  opened: false,
  channel: null,
  channelName: null,
  ready: false,
  debTimer: null,
  audioCtx: null
};

/* ─────────────────────────────────────────────────────
   UTILIDADES PEQUEÑAS
   ───────────────────────────────────────────────────── */

function _timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Ahora';
  if (mins < 60) return mins + 'm';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h';
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Ayer';
  if (days < 7) return days + 'd';
  return new Date(dateStr).toLocaleDateString('es-DO', { day: 'numeric', month: 'short' });
}

function _detectRole() {
  const cls = document.body?.className || '';
  if (cls.includes('panel-padre-body'))     return 'padre';
  if (cls.includes('panel-directora-body')) return 'directora';
  if (cls.includes('panel-maestra-body'))   return 'maestra';
  if (cls.includes('panel-asistente-body')) return 'asistente';
  if (cls.includes('panel-encargada-body')) return 'encargada';
  if (document.getElementById('badge-class')) return 'padre';
  if (document.getElementById('badge-t-chat')) return 'maestra';
  return 'unknown';
}

function _typeToSection(type) {
  const map = {
    task: 'tasks', post: 'class', muro: 'class', comment: 'class', like: 'class',
    attendance: 'live-attendance', payment: 'payments', grade: 'grades',
    chat: 'notifications', message: 'notifications',
    submission: 't-home', 'task-submission': 't-home', 'post-feedback': 't-home',
    inquiry: 'reportes', receipt: 'pagos', 'new-student': 'estudiantes',
    'new-teacher': 'maestros', alert: 'pagos', info: 'dashboard'
  };
  return map[type] || null;
}

function _sectionToTypes(section) {
  const map = {
    tasks: ['task'], class: ['post','muro','comment','like'],
    'live-attendance': ['attendance'], payments: ['payment','receipt','alert'],
    grades: ['grade'], notifications: ['chat','message'],
    't-home': ['submission','task-submission','post-feedback'],
    't-chat': ['chat','message'], reportes: ['inquiry'],
    pagos: ['receipt','payment','alert'], muro: ['post','muro'],
    chat: ['chat','message'], comunicacion: ['chat','message'],
    maestros: ['new-teacher'], estudiantes: ['new-student']
  };
  return map[section] || [];
}

function _toastMsg(type) {
  const msgs = {
    task: 'Nueva tarea asignada', post: 'Nueva publicacion en el muro',
    muro: 'Nueva publicacion en el muro', comment: 'Nuevo comentario',
    like: 'Alguien reacciono a tu publicacion', chat: 'Nuevo mensaje directo',
    message: 'Nuevo mensaje directo', attendance: 'Asistencia registrada',
    payment: 'Actualizacion de pago', grade: 'Nueva calificacion publicada',
    inquiry: 'Nueva consulta recibida', receipt: 'Nuevo comprobante de pago',
    submission: 'Nueva entrega de tarea', 'task-submission': 'Un alumno entrego una tarea',
    'post-feedback': 'Comentario en el muro del aula',
    'new-student': 'Nuevo estudiante inscrito', 'new-teacher': 'Nuevo docente registrado',
    alert: 'Alerta de sistema', info: 'Notificacion del sistema'
  };
  return msgs[type] || 'Nueva notificacion';
}

/* ─────────────────────────────────────────────────────
   DOM HELPERS / BADGE PAINT
   ───────────────────────────────────────────────────── */

const _CHAT_BADGE_IDS = [
  'badge-t-chat','badge-chat','badge-comunicacion','badge-notifications','badge-alertas'
];
const _CARD_BADGE_IDS = [
  'badge-card-comunicacion','badge-card-chat','badge-card-notifications'
];

function _paintBadge(el, n) {
  if (!el) return;
  const isDot = el.classList.contains('animate-pulse');
  if (n > 0) {
    if (!isDot) el.textContent = n > 99 ? '99+' : String(n);
    el.classList.remove('hidden');
    el.classList.add('flex');
  } else {
    el.classList.add('hidden');
    el.classList.remove('flex');
  }
}

function _renderSidebarBadge(section, count, type = 'default') {
  _state.counts[section] = count;
  const badge = document.getElementById('badge-' + section);
  if (!badge) return;
  const isPulseDot = badge.classList.contains('animate-pulse');
  if (count > 0) {
    if (!isPulseDot) badge.textContent = count > 99 ? '99+' : String(count);
    badge.classList.remove('hidden');
    badge.classList.add('flex');
    if (!isPulseDot) {
      badge.classList.toggle('bg-rose-600', type === 'urgent');
      badge.classList.toggle('bg-blue-600', type === 'new');
      if (type === 'default') badge.classList.add('bg-rose-500');
    }
  } else {
    badge.classList.add('hidden');
    badge.classList.remove('flex');
  }
  // alias para alinear secciones duplicadas
  if (section === 'chat' || section === 'notifications' || section === 'comunicacion') {
    ['chat','notifications','comunicacion'].forEach(s => {
      if (s !== section) {
        const b = document.getElementById('badge-' + s);
        _paintBadge(b, count);
      }
    });
  }
  if (section === 'muro' || section === 'class') {
    ['muro','class'].forEach(s => {
      const b = document.getElementById('badge-' + s);
      _paintBadge(b, count);
    });
  }
}

function _renderCardBadge(section, count) {
  const badge = document.getElementById('badge-card-' + section);
  _paintBadge(badge, count);
  // card aliases
  if (section === 'chat' || section === 'comunicacion' || section === 'notifications') {
    _CARD_BADGE_IDS.forEach(id => _paintBadge(document.getElementById(id), count));
  }
}

function _bellTotal() { return _state.msgUnread + _state.notifUnread; }

function _renderBell() {
  const bell = document.getElementById('newsCenterBadge');
  _paintBadge(bell, _bellTotal());
}

function _renderChatBadges() {
  const n = _state.msgUnread;
  for (const id of _CHAT_BADGE_IDS) _paintBadge(document.getElementById(id), n);
  for (const id of _CARD_BADGE_IDS) _paintBadge(document.getElementById(id), n);
}

function _syncAllBadges() {
  // 1) Notificaciones por sección (desde _state.items)
  const secCounts = {};
  for (const it of _state.items) {
    if (it.isRead) continue;
    const sec = _typeToSection(it.type);
    if (sec) secCounts[sec] = (secCounts[sec] || 0) + 1;
  }
  for (const [sec, n] of Object.entries(secCounts)) {
    _renderSidebarBadge(sec, n);
    _renderCardBadge(sec, n);
  }
  // 2) Chat / mensajes (fuente disjunta)
  _renderChatBadges();
  // 3) Campana = suma ambos
  _renderBell();
}

/* ─────────────────────────────────────────────────────
   FALLBACK: COUNT via PostgREST (cuando count:exact SDK falla)
   ───────────────────────────────────────────────────── */

async function _pgCount(table, filters, fallbackCount) {
  try {
    const rows = await fetchPostgREST(table, {
      select: 'id',
      filters,
      limit: 10000
    }, []);
    return rows.length;
  } catch (_) {
    return fallbackCount;
  }
}

/* ─────────────────────────────────────────────────────
   RUTAS DE LECTURA (SDK → PostgREST → Memoria)
   ───────────────────────────────────────────────────── */

// COUNT exact de notificaciones sin leer (SIN límite — origen del badge)
async function _fetchNotifCount() {
  const uid = _state.userId;
  try {
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', uid)
      .eq('is_read', false);
    if (!error && typeof count === 'number') return count;
    throw error || new Error('no-count');
  } catch (_) {
    // Fallback PostgREST: cargar ids y contar
    return _pgCount('notifications', { user_id: uid, is_read: 'false' }, _state.notifUnread);
  }
}

// SELECT lista de notificaciones (limit 200)
async function _fetchNotifications() {
  const uid = _state.userId;
  // 1) SDK
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('id,type,title,message,is_read,created_at,link,target_section')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(MAX_NOTIF_LIST);
    if (!error && Array.isArray(data)) return data;
  } catch (_) { /* cae a fallback */ }
  // 2) PostgREST
  try {
    const rows = await fetchPostgREST('notifications', {
      select: 'id,type,title,message,is_read,created_at,link,target_section',
      filters: { user_id: uid },
      order: { column: 'created_at', ascending: false },
      limit: MAX_NOTIF_LIST
    }, null);
    if (Array.isArray(rows) && rows.length) return rows;
  } catch (_) { /* cae a memoria */ }
  // 3) Último valor en memoria no se toca
  return _state.items.map(i => ({
    id: i.id, type: i.type, title: i.title, message: i.message,
    is_read: i.isRead, created_at: i.createdAt, link: i.link
  }));
}

// Normalización get_unread_counts (3 formatos, igual que unread-messages.js)
function _normalizeMsgCounts(data) {
  const out = {};
  if (!data) return out;
  if (Array.isArray(data)) {
    for (const row of data) {
      const id = row?.user_id || row?.sender_id;
      const n = Number(row?.unread ?? row?.count ?? 0);
      if (id && n > 0) out[id] = n;
    }
    return out;
  }
  if (typeof data === 'object') {
    for (const [k, v] of Object.entries(data)) {
      if (k === 'total') continue;
      const n = Number(v);
      if (n > 0) out[k] = n;
    }
  }
  return out;
}

// Conteo mensajes sin leer (RPC → SDK select → PostgREST)
async function _fetchMsgCounts() {
  const uid = _state.userId;
  // 1) RPC
  try {
    const { data, error } = await supabase.rpc('get_unread_counts');
    if (!error && data) return _normalizeMsgCounts(data);
  } catch (_) {}
  // 2) SDK directo
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('sender_id,conversation_id')
      .eq('receiver_id', uid)
      .eq('is_read', false)
      .limit(MAX_MSG_QUERY);
    if (!error) {
      const c = {};
      for (const m of data || []) {
        if (m?.sender_id) c[m.sender_id] = (c[m.sender_id] || 0) + 1;
      }
      return c;
    }
  } catch (_) {}
  // 3) PostgREST
  try {
    const rows = await fetchPostgREST('messages', {
      select: 'sender_id,conversation_id',
      filters: { receiver_id: uid, is_read: 'false' },
      limit: MAX_MSG_QUERY
    }, null);
    if (Array.isArray(rows)) {
      const c = {};
      for (const m of rows) {
        if (m?.sender_id) c[m.sender_id] = (c[m.sender_id] || 0) + 1;
      }
      return c;
    }
  } catch (_) {}
  return _state.msgCounts;
}

async function _fetchMeetingBadge() {
  try {
    let q = supabase.from('meetings').select('id', { count:'exact', head:true }).eq('status','live');
    if (_state.role === 'padre') {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: students } = await supabase
          .from('students').select('classroom_id')
          .eq('parent_id', user.id).eq('is_active', true);
        const ids = students?.map(s => s.classroom_id).filter(Boolean) || [];
        if (ids.length) q = q.in('target_id', ids);
      }
    }
    const { count } = await q;
    if (count > 0) {
      _renderSidebarBadge('videocall', count, 'urgent');
      _renderCardBadge('videocall', count);
    } else {
      _renderSidebarBadge('videocall', 0);
      _renderCardBadge('videocall', 0);
    }
  } catch (_) {}
}

/* ─────────────────────────────────────────────────────
   MARK READ EN BD
   ───────────────────────────────────────────────────── */

async function _markSectionReadInDB(section) {
  if (!_state.userId) return;
  const types = _sectionToTypes(section);
  if (!types.length) return;
  try {
    await supabase.from('notifications')
      .update({ is_read: true })
      .eq('user_id', _state.userId)
      .in('type', types)
      .eq('is_read', false);
  } catch (_) {}
}

/* ─────────────────────────────────────────────────────
   REALTIME (UN SOLO CANAL: notif-center_<uid>)
   ───────────────────────────────────────────────────── */

function _installVisibilityHook() {
  if (typeof document === 'undefined') return;
  const handler = () => {
    if (document.hidden) return;
    _state.retries = 0;
    _ensureRealtime();
    _scheduleRefresh(0);
  };
  if (!_state._visHooked) {
    document.addEventListener('visibilitychange', handler);
    _state._visHooked = true;
  }
}

function _teardownChannel() {
  const ch = _state.channel;
  _state.channel = null;
  _state.channelName = null;
  if (!ch) return;
  try { supabase.removeChannel(ch); } catch (_) {}
}

function _ensureRealtime() {
  if (!_state.userId) return;
  if (_state.channel) return;

  const name = 'notif-center_' + _state.userId;
  _state.channelName = name;

  // Preferir RealtimeManager si está disponible
  Promise.resolve().then(async () => {
    let boundChannel = null;
    try {
      const { RealtimeManager } = await import('./realtime-manager.js');
      RealtimeManager.subscribe(name, (ch) => {
        boundChannel = ch;
        _state.channel = ch;
        _bindRealtime(ch);
      });
    } catch (_) {
      // Canal directo sin gestor
      const ch = supabase.channel(name);
      _state.channel = ch;
      _bindRealtime(ch);
      try {
        ch.subscribe((status, err) => {
          if (_state.channel !== ch) return;
          if (status === 'SUBSCRIBED') _scheduleRefresh(0);
          else if (['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)) {
            console.warn('[NotificationCenter] canal:', status, err?.message || '');
            if (_state.channel === ch) _teardownChannel();
          }
        });
      } catch (e) {
        console.warn('[NotificationCenter] subscribe error:', e?.message);
        if (_state.channel === ch) _teardownChannel();
      }
    }
  });
}

function _bindRealtime(channel) {
  const uid = _state.userId;
  const self = NotificationCenter;

  // 1. notifications
  channel.on('postgres_changes', {
    event: 'INSERT', schema: 'public', table: 'notifications',
    filter: 'user_id=eq.' + uid
  }, (payload) => {
    const n = payload?.new;
    if (!n) return;
    const section = _typeToSection(n.type);
    const item = {
      id: n.id, type: n.type || 'info',
      title: n.title || _cfg(n.type).label,
      message: n.message || '', isRead: !!n.is_read,
      createdAt: n.created_at, link: n.link || null
    };
    _state.items.unshift(item);
    _sortItems();
    _notifUnreadInc(+1);
    if (section) {
      const prev = _state.counts[section] || 0;
      _renderSidebarBadge(section, prev + 1);
      _renderCardBadge(section, prev + 1);
    }
    _renderBell();
    _refreshNewsCenterListUI();
    _animateBell(n.type);
    _playGlowToast(section, n.type);
  });

  channel.on('postgres_changes', {
    event: 'UPDATE', schema: 'public', table: 'notifications',
    filter: 'user_id=eq.' + uid
  }, () => { _scheduleRefresh(); });

  // 2. messages
  channel.on('postgres_changes', {
    event: 'INSERT', schema: 'public', table: 'messages'
  }, (payload) => {
    const m = payload?.new;
    if (!m || m.sender_id === uid) return;
    const activeConvId = (window.AppState && AppState.get?.('activeConversationId'));
    if (activeConvId && m.conversation_id === activeConvId) return;
    _scheduleRefresh();
    _pulseBellRed();
  });
  channel.on('postgres_changes', {
    event: 'UPDATE', schema: 'public', table: 'messages'
  }, (payload) => {
    const r = payload?.new;
    if (!r) return;
    if (r.is_read === true || r.read_at) _scheduleRefresh();
  });

  // 3. posts muro (badge time-based: según last view)
  channel.on('postgres_changes', {
    event: 'INSERT', schema: 'public', table: 'posts'
  }, (payload) => {
    const p = payload?.new;
    if (p && p.teacher_id === uid) return;
    const section = document.getElementById('badge-class') ? 'class' : 'muro';
    const active = _getActiveSection();
    if (active !== section) {
      const prev = _state.counts[section] || 0;
      _renderSidebarBadge(section, prev + 1);
      _renderCardBadge(section, prev + 1);
    }
    _playGlowToast(section, 'post');
  });

  // 4. tasks
  channel.on('postgres_changes', {
    event: 'INSERT', schema: 'public', table: 'tasks'
  }, () => {
    if (_getActiveSection() !== 'tasks') {
      const prev = _state.counts['tasks'] || 0;
      _renderSidebarBadge('tasks', prev + 1);
      _renderCardBadge('tasks', prev + 1);
      _playGlowToast('tasks', 'task');
    }
  });

  // 5. task_evidences (maestra)
  channel.on('postgres_changes', {
    event: 'INSERT', schema: 'public', table: 'task_evidences'
  }, () => {
    if (_getActiveSection() !== 't-home') {
      const prev = _state.counts['t-home'] || 0;
      _renderSidebarBadge('t-home', prev + 1);
      _playGlowToast('t-home', 'submission');
    }
  });

  // 6. payments
  channel.on('postgres_changes', {
    event: 'INSERT', schema: 'public', table: 'payments'
  }, (payload) => {
    const ns = ((payload?.new?.status) || '').toLowerCase();
    if (ns === 'review' || ns === 'revision' || (ns === 'pending' && payload.new?.evidence_url)) {
      if (_getActiveSection() !== 'pagos') {
        const prev = _state.counts['pagos'] || 0;
        _renderSidebarBadge('pagos', prev + 1);
        _playGlowToast('pagos', 'receipt');
      }
      if (typeof window.CajaCobroV2 !== 'undefined' && window.CajaCobroV2.reload) {
        try { window.CajaCobroV2.reload(); } catch (_) {}
      }
    }
  });
  channel.on('postgres_changes', {
    event: 'UPDATE', schema: 'public', table: 'payments'
  }, (payload) => {
    const ns = ((payload?.new?.status) || '').toLowerCase();
    const os = ((payload?.old?.status) || '').toLowerCase();
    if (ns === os) return;
    if (['paid','pagado','approved'].includes(ns)) {
      if (_getActiveSection() !== 'payments') _playGlowToast('payments', 'payment');
    }
    if (ns === 'review' || ns === 'revision' || (ns === 'pending' && payload.new?.evidence_url)) {
      if (_getActiveSection() !== 'pagos') {
        const prev = _state.counts['pagos'] || 0;
        _renderSidebarBadge('pagos', prev + 1);
        _playGlowToast('pagos', 'receipt');
      }
      if (typeof window.CajaCobroV2 !== 'undefined' && window.CajaCobroV2.reload) {
        try { window.CajaCobroV2.reload(); } catch (_) {}
      }
    }
  });

  // 7. inquiries
  channel.on('postgres_changes', {
    event: 'INSERT', schema: 'public', table: 'inquiries'
  }, () => {
    if (_getActiveSection() !== 'reportes') {
      const prev = _state.counts['reportes'] || 0;
      _renderSidebarBadge('reportes', prev + 1);
      _playGlowToast('reportes', 'inquiry');
    }
  });

  // 8. meetings
  channel.on('postgres_changes', { event:'*', schema:'public', table:'meetings' },
    () => _fetchMeetingBadge());

  // 9. staff_permits
  channel.on('postgres_changes', {
    event: 'INSERT', schema: 'public', table: 'staff_permits'
  }, () => {
    if (_state.role === 'directora' || _state.role === 'asistente') {
      const prev = _state.counts['permits'] || 0;
      _renderSidebarBadge('permits', prev + 1);
      _miniToast('Nueva solicitud de permiso');
    }
  });
}

function _notifUnreadInc(delta) {
  _state.notifUnread = Math.max(0, Number(_state.notifUnread || 0) + delta);
}

function _getActiveSection() {
  const el = document.querySelector('.section.active');
  return el ? el.id : '';
}

/* ─────────────────────────────────────────────────────
   RENDER MODAL / LISTA del Centro de Novedades
   ───────────────────────────────────────────────────── */

const NC_STYLE = `
#newsCenterBellWrap{position:fixed;top:calc(16px + env(safe-area-inset-top));right:calc(16px + env(safe-area-inset-right));z-index:960;filter:drop-shadow(0 6px 14px rgba(255,150,0,.35))}
#newsCenterBell{position:relative;width:58px;height:58px;border-radius:50%;cursor:pointer;border:none;outline:none;background:radial-gradient(circle at 30% 25%,#FFE873 0%,#FFD43B 45%,#FF9F1C 90%);box-shadow:0 8px 24px rgba(255,150,0,.45),inset 0 2px 3px rgba(255,255,255,.6),inset 0 -3px 6px rgba(180,90,0,.35);display:flex;align-items:center;justify-content:center;transition:transform .18s cubic-bezier(.34,1.56,.64,1);-webkit-tap-highlight-color:transparent}
#newsCenterBell:hover{transform:scale(1.08) rotate(-6deg)}
#newsCenterBell:active{transform:scale(.94)}
#newsCenterBell svg{width:26px;height:26px;color:#7A4B00;stroke-width:2.4}
#newsCenterBell.ringing{animation:ncenter-ring .55s ease-in-out 3}
@keyframes ncenter-ring{0%,100%{transform:rotate(0)}20%{transform:rotate(18deg)}40%{transform:rotate(-16deg)}60%{transform:rotate(10deg)}80%{transform:rotate(-6deg)}}
#newsCenterBellWrap .ncenter-halo{position:absolute;inset:-6px;border-radius:50%;background:radial-gradient(circle,rgba(255,200,60,.55),rgba(255,200,60,0) 70%);animation:ncenter-halo-pulse 2.4s infinite;pointer-events:none}
@keyframes ncenter-halo-pulse{0%,100%{transform:scale(1);opacity:.55}50%{transform:scale(1.18);opacity:.25}}
#newsCenterBellWrap.attention #newsCenterBell{animation:ncenter-ring .55s ease-in-out 3}
#newsCenterBadge{position:absolute;top:-4px;right:-4px;min-width:22px;height:22px;border-radius:50px;padding:0 6px;background:linear-gradient(135deg,#EF4444,#DC2626);color:#fff;font-size:11px;font-weight:900;line-height:1;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 2px rgba(255,255,255,.9),0 4px 10px rgba(220,38,38,.5)}
#newsCenterBadge.hidden{display:none}
#newsCenterBellWrap.is-ringing .ncenter-halo{background:radial-gradient(circle,rgba(239,68,68,.6),rgba(239,68,68,0) 70%);animation:ncenter-halo-red .8s ease-out 3}
@keyframes ncenter-halo-red{0%,100%{transform:scale(1);opacity:.7}50%{transform:scale(1.35);opacity:.15}}
#newsCenterBellWrap.is-ringing #newsCenterBell{animation:ncenter-ring .55s ease-in-out 3, ncenter-bell-flash .8s ease-out 3}
@keyframes ncenter-bell-flash{0%,100%{filter:none}50%{filter:drop-shadow(0 0 14px rgba(239,68,68,.9))}}
#ncenterBackdrop{position:fixed;inset:0;background:rgba(15,23,42,.45);backdrop-filter:blur(3px);z-index:961;opacity:0;pointer-events:none;transition:opacity .25s ease;border:none;padding:0}
#ncenterBackdrop.show{opacity:1;pointer-events:auto}
#newsCenterModal{position:fixed;top:0;right:0;bottom:0;z-index:962;width:min(420px,100vw);background:#F5F8FC;box-shadow:-12px 0 40px rgba(15,23,42,.18);transform:translateX(105%);transition:transform .3s cubic-bezier(.32,.72,.38,1);display:flex;flex-direction:column;overflow:hidden;margin:0}
#newsCenterModal.show{transform:translateX(0)}
.ncenter-head{background:linear-gradient(135deg,#0B63C7 0%,#0850A0 55%,#1e3a8a 100%);color:#fff;padding:18px 18px 14px;position:relative;overflow:hidden;flex-shrink:0}
.ncenter-head::before{content:'';position:absolute;top:-40px;right:-40px;width:130px;height:130px;border-radius:50%;background:rgba(255,212,59,.14);pointer-events:none}
.ncenter-head::after{content:'';position:absolute;left:0;bottom:0;width:100%;height:3px;background:linear-gradient(90deg,#FFD43B,#FF9F1C,#FF7A00)}
.ncenter-head-top{display:flex;align-items:center;gap:10px}
.ncenter-bell-mini{width:38px;height:38px;border-radius:12px;background:rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.ncenter-bell-mini svg{width:20px;height:20px;color:#FFD43B}
.ncenter-title{flex:1;min-width:0}
.ncenter-title h2{margin:0;font-size:1.05rem;font-weight:900;line-height:1.15}
.ncenter-title p{margin:2px 0 0;font-size:.68rem;font-weight:700;color:rgba(255,255,255,.75);letter-spacing:.06em;text-transform:uppercase}
.ncenter-close{width:34px;height:34px;border-radius:10px;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.15);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .18s}
.ncenter-close:hover{background:rgba(255,255,255,.3);transform:scale(1.05)}
.ncenter-close svg{width:17px;height:17px}
.ncenter-toolbar{display:flex;align-items:center;gap:8px;margin-top:12px;flex-wrap:wrap}
.ncenter-chip{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:50px;font-size:.72rem;font-weight:800;border:1px solid transparent;cursor:pointer;transition:all .18s;background:rgba(255,255,255,.14);color:rgba(255,255,255,.9)}
.ncenter-chip:hover{background:rgba(255,255,255,.24)}
.ncenter-chip.active{background:#FFD43B;color:#5B3A00;box-shadow:0 3px 10px rgba(255,212,59,.35)}
.ncenter-chip .ncenter-chip-count{background:rgba(0,0,0,.14);border-radius:50px;padding:0 6px;font-size:.64rem}
.ncenter-chip.active .ncenter-chip-count{background:rgba(91,58,0,.18)}
#ncenterMarkAll{margin-left:auto;display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:50px;font-size:.68rem;font-weight:800;border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.12);color:#fff;cursor:pointer;transition:all .18s}
#ncenterMarkAll:hover{background:rgba(255,255,255,.25)}
#ncenterMarkAll.hidden{display:none}
.ncenter-body{flex:1;overflow-y:auto;padding:14px 14px 18px;-webkit-overflow-scrolling:touch}
.ncenter-grouped{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}
.ncenter-grouped:empty{display:none}
.ncenter-group-chip{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:50px;font-size:.66rem;font-weight:800;background:#fff;border:1px solid #E2E8F0;color:#475569}
.ncenter-group-chip b{font-size:.72rem}
.ncenter-total-line{font-size:.66rem;font-weight:800;color:#94A3B8;text-transform:uppercase;letter-spacing:.08em;margin:0 4px 10px}
.ncenter-item{display:flex;align-items:flex-start;gap:11px;padding:12px;border-radius:16px;background:#fff;border:1px solid #E2E8F0;cursor:pointer;transition:all .18s ease;margin-bottom:8px;box-shadow:0 1px 3px rgba(15,23,42,.05)}
.ncenter-item:hover{transform:translateY(-2px) scale(1.005);box-shadow:0 10px 24px rgba(11,99,199,.12);border-color:#BFDBFE}
.ncenter-item.is-read{opacity:.62}
.ncenter-item.is-read:hover{opacity:.85}
.ncenter-item.unread{background:linear-gradient(180deg,#F0F7FF,#F8FBFF);border-color:#BFDBFE;box-shadow:inset 3px 0 0 var(--nc-accent,#0B63C7),0 2px 8px rgba(11,99,199,.08)}
.ncenter-item-icon{width:38px;height:38px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0;box-shadow:0 2px 6px rgba(15,23,42,.08)}
.ncenter-item-main{flex:1;min-width:0}
.ncenter-item-top{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:2px}
.ncenter-item-type{font-size:.6rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase;opacity:.75}
.ncenter-item-title{font-size:.83rem;font-weight:800;color:#1A2340;line-height:1.25}
.ncenter-item-title.is-read{color:#64748B}
.ncenter-item-msg{font-size:.74rem;color:#64748B;font-weight:500;line-height:1.4;margin-top:2px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.ncenter-item-time{font-size:.66rem;font-weight:700;color:#94A3B8;flex-shrink:0;white-space:nowrap}
.ncenter-unread-dot{width:8px;height:8px;border-radius:50%;background:#EF4444;flex-shrink:0;animation:ncenter-dot-pulse 1.6s infinite}
@keyframes ncenter-dot-pulse{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(239,68,68,.5)}50%{opacity:.7;box-shadow:0 0 0 4px rgba(239,68,68,0)}}
.ncenter-prio{font-size:.58rem;font-weight:900;text-transform:uppercase;padding:2px 7px;border-radius:50px;letter-spacing:.05em}
.ncenter-empty{text-align:center;padding:2.5rem 1rem;color:#94A3B8}
.ncenter-empty-title{font-weight:800;color:#475569;font-size:.9rem;margin-top:10px}
.ncenter-skeleton{display:flex;align-items:center;gap:11px;padding:12px;border-radius:16px;background:#fff;border:1px solid #E2E8F0;margin-bottom:8px}
.ncenter-skeleton .sk{background:linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%);background-size:800px 100%;animation:ncenter-shimmer 1.6s infinite linear;border-radius:8px}
@keyframes ncenter-shimmer{0%{background-position:-400px 0}100%{background-position:400px 0}}
@media (max-width:520px){#newsCenterBellWrap{top:calc(12px + env(safe-area-inset-top));right:calc(12px + env(safe-area-inset-right))}#newsCenterBell{width:54px;height:54px}#newsCenterBell svg{width:24px;height:24px}#newsCenterModal{width:100vw;border-radius:22px 22px 0 0}}
@media print{#newsCenterBellWrap,#newsCenterModal,#ncenterBackdrop{display:none !important}}
`;

function _ncEls() {
  return {
    bellWrap: document.getElementById('newsCenterBellWrap'),
    bell: document.getElementById('newsCenterBell'),
    badge: document.getElementById('newsCenterBadge'),
    modal: document.getElementById('newsCenterModal'),
    backdrop: document.getElementById('ncenterBackdrop'),
    list: document.getElementById('ncenterList'),
    grouped: document.getElementById('ncenterGrouped'),
    markAll: document.getElementById('ncenterMarkAll'),
    chipAll: document.getElementById('ncenterChipAll'),
    chipUnread: document.getElementById('ncenterChipUnread'),
    emptyCount: document.getElementById('ncenterEmptyCount')
  };
}

function _injectStyles() {
  if (document.getElementById('newsCenterStyles')) return;
  const s = document.createElement('style');
  s.id = 'newsCenterStyles';
  s.textContent = NC_STYLE;
  document.head.appendChild(s);
}

function _ncSkeleton() {
  const sk = [];
  for (let i = 0; i < 5; i++) sk.push(`
    <div class="ncenter-skeleton">
      <div class="sk" style="width:38px;height:38px;border-radius:12px;flex-shrink:0"></div>
      <div class="flex-1" style="flex:1;min-width:0">
        <div class="sk" style="width:35%;height:9px;margin-bottom:6px"></div>
        <div class="sk" style="width:75%;height:10px"></div>
      </div>
      <div class="sk" style="width:34px;height:9px;flex-shrink:0"></div>
    </div>`);
  return sk.join('');
}

function _sortItems() {
  _state.items.sort((a, b) => {
    if (a.isRead !== b.isRead) return a.isRead ? 1 : -1;
    const pa = _cfg(a.type).priority;
    const pb = _cfg(b.type).priority;
    if (pb !== pa) return pb - pa;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
}

function _buildNCDOM() {
  if (document.getElementById('newsCenterBellWrap')) return;

  const wrap = document.createElement('div');
  wrap.id = 'newsCenterBellWrap';
  wrap.innerHTML = `
    <span class="ncenter-halo"></span>
    <button id="newsCenterBell" type="button" aria-label="Centro de Novedades" title="Centro de Novedades">
      <i data-lucide="bell"></i>
      <span id="newsCenterBadge" class="hidden">0</span>
    </button>`;

  const backdrop = document.createElement('div');
  backdrop.id = 'ncenterBackdrop';

  const modal = document.createElement('div');
  modal.id = 'newsCenterModal';
  modal.setAttribute('role','dialog');
  modal.setAttribute('aria-label','Centro de Novedades');
  modal.innerHTML = `
    <div class="ncenter-head">
      <div class="ncenter-head-top">
        <div class="ncenter-bell-mini"><i data-lucide="bell"></i></div>
        <div class="ncenter-title">
          <h2>Centro de Novedades</h2>
          <p>Eventos y alertas de tu panel</p>
        </div>
        <button class="ncenter-close" id="ncenterCloseBtn" type="button" aria-label="Cerrar">
          <i data-lucide="x"></i>
        </button>
      </div>
      <div class="ncenter-toolbar">
        <button class="ncenter-chip active" id="ncenterChipAll" type="button">Todas</button>
        <button class="ncenter-chip" id="ncenterChipUnread" type="button">No leídas <span class="ncenter-chip-count" id="ncenterEmptyCount">0</span></button>
        <button id="ncenterMarkAll" class="hidden" type="button"><i data-lucide="check-check" class="w-3.5 h-3.5"></i> Marcar todas</button>
      </div>
      <div class="ncenter-grouped" id="ncenterGrouped"></div>
    </div>
    <div class="ncenter-body" id="ncenterList"></div>`;

  document.body.appendChild(wrap);
  document.body.appendChild(backdrop);
  document.body.appendChild(modal);

  wrap.querySelector('#newsCenterBell').addEventListener('click', () => NotificationCenter.open());
  backdrop.addEventListener('click', () => NotificationCenter.close());
  modal.querySelector('#ncenterCloseBtn').addEventListener('click', () => NotificationCenter.close());
  modal.querySelector('#ncenterChipAll').addEventListener('click', () => NotificationCenter._setFilter('all'));
  modal.querySelector('#ncenterChipUnread').addEventListener('click', () => NotificationCenter._setFilter('unread'));
  modal.querySelector('#ncenterMarkAll').addEventListener('click', () => NotificationCenter.markAllRead());
  modal.querySelector('#ncenterList').addEventListener('click', (e) => {
    const itemEl = e.target.closest('.ncenter-item');
    if (!itemEl) return;
    NotificationCenter._onItemClick(itemEl.dataset.id);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && _state.opened) NotificationCenter.close();
  });
  if (window.lucide) requestAnimationFrame(() => lucide.createIcons({ attrs: { 'stroke-width': '2' } }));
}

function _renderNCItem(item) {
  const cfg = _cfg(item.type);
  const el = document.createElement('div');
  el.className = 'ncenter-item' + (item.isRead ? ' is-read' : ' unread');
  el.dataset.id = String(item.id);
  el.style.setProperty('--nc-accent', cfg.accent);
  el.setAttribute('role','button');
  el.setAttribute('tabindex','0');

  const prioBadge = (item.priority === 'critical' || cfg.priority >= 6)
    ? '<span class="ncenter-prio" style="background:#FEE2E2;color:#B91C1C">Urgente</span>'
    : ((item.priority === 'important' || cfg.priority >= 4)
      ? '<span class="ncenter-prio" style="background:#FEF3C7;color:#B45309">Importante</span>'
      : '');

  const title = escapeHtml(item.title || cfg.label);
  const msg = escapeHtml(item.message || '');

  el.innerHTML = `
    <div class="ncenter-item-icon" style="background:${cfg.accent}22;color:${cfg.accent}">${cfg.icon}</div>
    <div class="ncenter-item-main">
      <div class="ncenter-item-top">
        ${item.isRead ? '' : '<span class="ncenter-unread-dot"></span>'}
        <span class="ncenter-item-type" style="color:${cfg.accent}">${escapeHtml(cfg.label)}</span>
        ${prioBadge}
      </div>
      <div class="ncenter-item-title${item.isRead ? ' is-read' : ''}">${title}</div>
      ${msg ? `<p class="ncenter-item-msg">${msg}</p>` : ''}
    </div>
    <span class="ncenter-item-time">${_timeAgo(item.createdAt)}</span>`;
  return el;
}

function _refreshNewsCenterListUI() {
  const els = _ncEls();
  if (!els.list) return;

  const unreadArr = _state.items.filter(i => !i.isRead);
  const visible = _state.filter === 'unread' ? unreadArr : _state.items;

  const unreadCount = unreadArr.length;
  els.emptyCount.textContent = unreadCount;
  els.markAll.classList.toggle('hidden', unreadCount === 0);
  els.chipAll.classList.toggle('active', _state.filter === 'all');
  els.chipUnread.classList.toggle('active', _state.filter === 'unread');

  // Chips agrupados
  const grouped = new Map();
  for (const item of unreadArr) {
    const g = _cfg(item.type);
    if (!grouped.has(g.label)) grouped.set(g.label, { icon: g.icon, label: g.label, count: 0 });
    grouped.get(g.label).count++;
  }
  if (els.grouped) {
    els.grouped.innerHTML = '';
    for (const g of grouped.values()) {
      const chip = document.createElement('span');
      chip.className = 'ncenter-group-chip';
      chip.innerHTML = g.icon + ' ' + g.label.toLowerCase() + ' <b>' + g.count + '</b>';
      els.grouped.appendChild(chip);
    }
  }

  // Lista
  if (!visible.length) {
    const empty = document.createElement('div');
    empty.className = 'ncenter-empty';
    empty.innerHTML = _state.filter === 'unread'
      ? '<div style="font-size:2rem">✅</div><div class="ncenter-empty-title">No tienes novedades pendientes</div><p style="font-size:.72rem;margin-top:4px">Genial, estás al día</p>'
      : '<div style="font-size:2rem">🔔</div><div class="ncenter-empty-title">Aún no hay eventos</div><p style="font-size:.72rem;margin-top:4px">Los avisos de tu panel aparecerán aquí</p>';
    els.list.innerHTML = '';
    els.list.appendChild(empty);
    return;
  }

  const totalLine = document.createElement('div');
  totalLine.className = 'ncenter-total-line';
  if (_state.filter === 'unread' && visible.length !== _state.items.length) {
    totalLine.textContent = unreadCount + ' de ' + _state.items.length + ' sin leer';
  } else {
    totalLine.textContent = _state.items.length + ' eventos en tu panel';
  }
  els.list.innerHTML = '';
  els.list.appendChild(totalLine);
  for (const item of visible) els.list.appendChild(_renderNCItem(item));
}

/* ─────────────────────────────────────────────────────
   NAVIGACIÓN / CLICK EN ITEM
   ───────────────────────────────────────────────────── */

function _extractSection(link, target) {
  if (target && typeof target === 'string' && target !== 'home') return target;
  if (!link) return null;
  if (link.startsWith('http') || link.startsWith('/')) {
    const m = String(link).match(/[?&]section=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }
  return link;
}

function _navigate(section, link) {
  if (!section) {
    if (link) { window.location.href = link; return true; }
    return false;
  }
  const goTo = window.App?.navigation?.goTo;
  const goTo2 = window.App?.navigateTo;
  if (typeof goTo === 'function') { try { goTo(section); return true; } catch (_) {} }
  if (typeof goTo2 === 'function') { try { goTo2(section); return true; } catch (_) {} }
  const targetEl = document.getElementById(section);
  if (targetEl) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    targetEl.classList.add('active');
    if (window.scrollTo) window.scrollTo({ top: 0, behavior: 'smooth' });
    return true;
  }
  if (link) { window.location.href = link; return true; }
  return false;
}

/* ─────────────────────────────────────────────────────
   ANIMACIONES / TOAST / SONIDO
   ───────────────────────────────────────────────────── */

function _animateBell(type) {
  const wrap = document.getElementById('newsCenterBellWrap');
  if (!wrap) return;
  if (type === 'message' || type === 'chat') {
    wrap.classList.remove('is-ringing');
    void wrap.offsetWidth;
    wrap.classList.add('is-ringing');
    setTimeout(() => wrap.classList.remove('is-ringing'), 2500);
  } else {
    wrap.classList.remove('attention');
    void wrap.offsetWidth;
    wrap.classList.add('attention');
    setTimeout(() => wrap.classList.remove('attention'), 1800);
  }
}

function _pulseBellRed() {
  const btn = document.getElementById('newsCenterBell');
  if (!btn) return;
  btn.classList.add('is-ringing');
  setTimeout(() => btn.classList.remove('is-ringing'), 2200);
}

function _playGlowToast(section, eventType) {
  if (!section) { _miniToast(_toastMsg(eventType)); _playSound(eventType); return; }
  const colorMap = { message:'blue', chat:'blue', grade:'green', attendance:'blue',
    payment:'red', receipt:'red', task:'orange', submission:'orange' };
  const color = colorMap[eventType] || 'orange';

  const sidebarBtn = document.querySelector(
    '[data-target="' + section + '"], [data-section="' + section + '"], .node-' + section);
  if (sidebarBtn) {
    sidebarBtn.classList.add('animate-glow');
    const b = sidebarBtn;
    setTimeout(() => b.classList.remove('animate-glow'), 4000);
  }
  const card = document.querySelector(
    '[data-target="' + section + '"], [data-section="' + section + '"]');
  if (card && card !== sidebarBtn) {
    card.classList.remove('card-glow-orange','card-glow-blue','card-glow-green','card-glow-red');
    void card.offsetWidth;
    card.classList.add('card-glow-' + color);
    const c = card;
    setTimeout(() => c.classList.remove('card-glow-' + color), 2000);
  }
  _miniToast(_toastMsg(eventType));
  _playSound(color);
}

function _playSound(priority) {
  if (!priority) priority = 'orange';
  if (typeof document !== 'undefined' && document.hidden) return;
  try {
    if (!_state.audioCtx) _state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = _state.audioCtx;
    if (!ctx) return;
    if (ctx.state === 'suspended') { ctx.resume().catch(() => {}); return; }
    const cfgMap = {
      red:    [{f:880,t:0},{f:1100,t:0.13}],
      orange: [{f:660,t:0},{f:880,t:0.12}],
      blue:   [{f:523,t:0}],
      green:  [{f:440,t:0},{f:554,t:0.10}]
    };
    const cfg = cfgMap[priority] || [{f:660,t:0}];
    const vol = priority === 'red' ? 0.10 : 0.06;
    cfg.forEach(function(item) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine'; osc.frequency.value = item.f;
      gain.gain.setValueAtTime(vol, ctx.currentTime + item.t);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + item.t + 0.14);
      osc.start(ctx.currentTime + item.t);
      osc.stop(ctx.currentTime + item.t + 0.15);
    });
  } catch (_) {}
}

function _miniToast(msg) {
  if (typeof document === 'undefined') return;
  if (document.hidden) return;
  const existing = document.getElementById('karpus-mini-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.id = 'karpus-mini-toast';
  toast.style.cssText = [
    'position:fixed','bottom:80px','left:50%',
    'transform:translateX(-50%) translateY(20px)',
    'background:rgba(15,23,42,0.92)','color:white',
    'padding:8px 16px','border-radius:20px',
    'font-size:12px','font-weight:700','z-index:9990',
    'pointer-events:none','backdrop-filter:blur(8px)',
    'box-shadow:0 4px 16px rgba(0,0,0,0.3)',
    'transition:all 0.3s ease','opacity:0','white-space:nowrap'
  ].join(';');
  toast.textContent = msg;
  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  });
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/* ─────────────────────────────────────────────────────
   DEBOUNCE REFRESH
   ───────────────────────────────────────────────────── */

function _scheduleRefresh(delay = REFRESH_DEBOUNCE_MS) {
  clearTimeout(_state.debTimer);
  _state.debTimer = setTimeout(() => NotificationCenter.refresh(), delay);
}

/* ─────────────────────────────────────────────────────
   SINGLETON PÚBLICO
   ───────────────────────────────────────────────────── */

export const NotificationCenter = {

  _setFilter(f) {
    _state.filter = f;
    _refreshNewsCenterListUI();
  },

  async init(userId, role) {
    if (!userId) return;
    if (_state.userId === userId && _state.ready) return;
    // Re-init seguro (cambio usuario)
    if (_state.userId && _state.userId !== userId) this.destroy();
    _state.userId = userId;
    _state.role = role || _detectRole();
    _state.filter = 'all';
    _state.opened = false;

    _injectStyles();
    _buildNCDOM();
    const els = _ncEls();
    if (els.badge) els.badge.textContent = '0';

    // Adaptadores globales (compatibilidad legacy)
    _installGlobalAdapters();

    _installVisibilityHook();
    _ensureRealtime();

    await this.refresh();
    _fetchMeetingBadge();
    _state.ready = true;
  },

  destroy() {
    _teardownChannel();
    clearTimeout(_state.debTimer);
    _state.debTimer = null;
    _state.userId = null;
    _state.ready = false;
    _state.items = [];
    _state.msgCounts = {};
    _state.msgUnread = 0;
    _state.notifUnread = 0;
    _state.counts = {};
  },

  /* 🔄 REFRESH (fuente única — COUNT y SELECT alineados) */
  async refresh() {
    if (!_state.userId) return null;
    const els = _ncEls();
    if (els.list) els.list.innerHTML = _ncSkeleton();
    if (els.grouped) els.grouped.innerHTML = '';
    try {
      const [rowsNotif, cntUnread, cntMsg] = await Promise.all([
        _fetchNotifications(),
        _fetchNotifCount(),
        _fetchMsgCounts()
      ]);
      _state.items = (rowsNotif || []).map(n => ({
        id: n.id,
        type: n.type || 'info',
        title: n.title || _cfg(n.type || 'info').label,
        message: n.message || '',
        isRead: !!n.is_read,
        createdAt: n.created_at,
        link: n.link || null
      }));
      _state.notifUnread = typeof cntUnread === 'number' ? cntUnread :
        _state.items.filter(i => !i.isRead).length;
      _state.msgCounts = cntMsg || {};
      _state.msgUnread = Object.values(_state.msgCounts).reduce((a,b) => a+b, 0);
      _sortItems();
      _syncAllBadges();
      _refreshNewsCenterListUI();
      return true;
    } catch (err) {
      console.warn('[NotificationCenter] refresh error:', err?.message);
      if (els?.list) {
        els.list.innerHTML = '<div class="ncenter-empty"><div style="font-size:2rem">😕</div><div class="ncenter-empty-title">No se pudieron cargar los eventos</div></div>';
      }
      return null;
    }
  },

  /**
   * Abrir centro de novedades:
   *  1. UI optimista (todo leído)
   *  2. AWAIT UPDATE en BD (INMEDIATO)
   *  3. SIN refresh al final (no parpadea)
   */
  async open() {
    _state.opened = true;
    const els = _ncEls();
    if (els.modal) els.modal.classList.add('show');
    if (els.backdrop) els.backdrop.classList.add('show');

    const unreadArr = _state.items.filter(i => !i.isRead);
    if (unreadArr.length || _state.msgUnread > 0 || _state.notifUnread > 0) {
      // 1) UI optimista INMEDIATA
      for (const item of unreadArr) item.isRead = true;
      const prevNotifUnread = _state.notifUnread;
      _state.notifUnread = 0;
      // badges
      _syncAllBadges();
      _refreshNewsCenterListUI();
      if (els.badge) { els.badge.textContent = '0'; els.badge.classList.add('hidden'); }
      // BadgeSystem legacy mark (comunicacion / chat sections)
      try { window.BadgeSystem?.mark?.('comunicacion'); } catch(_) {}
      try { window.BadgeSystem?.mark?.('chat'); } catch(_) {}
      // 2) UPDATE BD INMEDIATO — AWAIT (no .then colgado)
      if (_state.userId && (unreadArr.length || prevNotifUnread > 0)) {
        try {
          await supabase.from('notifications')
            .update({ is_read: true })
            .eq('user_id', _state.userId)
            .eq('is_read', false);
        } catch (_) {}
        // Reconciliar mensajes sin leer (chat abierto)
        try {
          const activeConvId = (window.AppState && AppState.get?.('activeConversationId'));
          if (activeConvId && typeof window.ChatModule !== 'undefined') {
            await window.ChatModule.markAsRead?.(activeConvId);
          }
        } catch (_) {}
      }
      // 3) SIN refresh() final → no parpadea (BD ya fue actualizada arriba)
    }
    // Cargar lista si venía vacía (primera apertura antes de refresh terminar)
    if (!_state.items.length) await this.refresh();
  },

  close() {
    _state.opened = false;
    const els = _ncEls();
    if (els.modal) els.modal.classList.remove('show');
    if (els.backdrop) els.backdrop.classList.remove('show');
  },

  toggle() {
    if (_state.opened) this.close();
    else this.open();
  },

  /**
   * Marcar TODAS leídas (usando filtro count — no array ids).
   * Soluciona el bug del desequilibrio COUNT/SELECT donde solo se marcaban
   * las 60 primeras cargadas.
   */
  async markAllRead() {
    const unreadArr = _state.items.filter(i => !i.isRead);
    if (!unreadArr.length && _state.notifUnread === 0) return;
    // 1) UI
    for (const item of unreadArr) item.isRead = true;
    _state.notifUnread = 0;
    _syncAllBadges();
    _refreshNewsCenterListUI();
    // 2) BD con FILTRO COUNT (no ids) → marca TODAS incluso las > 200
    if (_state.userId) {
      try {
        await supabase.from('notifications')
          .update({ is_read: true })
          .eq('user_id', _state.userId)
          .eq('is_read', false);
      } catch (_) {}
    }
  },

  /* BadgeSystem.mark adaptador: marca sección leída */
  async mark(section) {
    _state.counts[section] = 0;
    _renderSidebarBadge(section, 0);
    _renderCardBadge(section, 0);
    await _markSectionReadInDB(section);
    if (section === 'muro' || section === 'class') {
      try { localStorage.setItem('last_' + section + '_view', new Date().toISOString()); } catch (_) {}
    }
    if (['chat','notifications','comunicacion'].includes(section)) {
      const activeConvId = (window.AppState && AppState.get?.('activeConversationId'));
      if (activeConvId) {
        try {
          const { ChatModule } = await import('./chat.js');
          await ChatModule.markAsRead?.(activeConvId);
        } catch (_) {}
      }
      ['chat','notifications','comunicacion'].forEach(s => {
        _state.counts[s] = 0;
        _renderSidebarBadge(s, 0);
        _renderCardBadge(s, 0);
      });
    }
    if (section === 'muro' || section === 'class') {
      ['muro','class'].forEach(s => {
        _state.counts[s] = 0;
        _renderSidebarBadge(s, 0);
        _renderCardBadge(s, 0);
      });
    }
    // Sync dashboard state
    if (window.AppState) {
      try {
        const dd = AppState.get?.('dashboardData');
        if (dd?.stats) {
          const map = { reportes:'pendingInquiries', pagos:'pending_payments', class:'newPosts', muro:'newPosts' };
          const sk = map[section];
          if (sk) { dd.stats[sk] = 0; AppState.set?.('dashboardData', { ...dd }); }
        }
      } catch (_) {}
    }
  },

  setCount(section, count, type = 'default') {
    _renderSidebarBadge(section, count, type);
    _renderCardBadge(section, count, type);
  },
  set(section, count) { this.setCount(section, count); },
  _reapplyCardBadges() {
    for (const [sec, n] of Object.entries(_state.counts)) {
      if (n > 0) _renderCardBadge(sec, n);
    }
  },

  /* UnreadMessages adaptadores */
  getTotal() { return _state.msgUnread; },
  getNotificationTotal() { return _state.notifUnread; },
  getUnreadFrom(senderId) { return _state.msgCounts[senderId] || 0; },
  getCounts() { return { ..._state.msgCounts }; },
  async onConversationRead() { _scheduleRefresh(150); },

  /** Número total (mensajes + notificaciones) que alimenta la campana */
  getUnreadCount() { return _bellTotal(); },

  async _onItemClick(id) {
    const item = _state.items.find(i => String(i.id) === String(id));
    if (!item) return;
    const section = _extractSection(item.link, TYPE_CONFIG[item.type]?.target || item.target_section);
    const resolved = _navigate(section, item.link);
    if (resolved) _state.opened = false;
    if (!item.isRead) {
      item.isRead = true;
      _state.notifUnread = Math.max(0, _state.notifUnread - 1);
      _syncAllBadges();
      _refreshNewsCenterListUI();
      try {
        await supabase.from('notifications').update({ is_read: true }).eq('id', id);
      } catch (_) {}
    }
  }
};

/* ─────────────────────────────────────────────────────
   INSTALACIÓN ADAPTADORES GLOBALES (backwards compat)
   ───────────────────────────────────────────────────── */

function _installGlobalAdapters() {
  if (window.__ncAdaptersInstalled) return;
  window.__ncAdaptersInstalled = true;

  window.BadgeSystem = {
    init: (uid) => NotificationCenter.init(uid),
    mark: (s) => NotificationCenter.mark(s),
    setCount: (s,c,t) => NotificationCenter.setCount(s,c,t),
    set: (s,c) => NotificationCenter.set(s,c),
    _reapplyCardBadges: () => NotificationCenter._reapplyCardBadges(),
    destroy: () => NotificationCenter.destroy()
  };

  window.UnreadMessages = {
    init: (uid, role) => NotificationCenter.init(uid, role),
    refresh: () => NotificationCenter.refresh(),
    getTotal: () => NotificationCenter.getTotal(),
    getNotificationTotal: () => NotificationCenter.getNotificationTotal(),
    getCounts: () => NotificationCenter.getCounts(),
    getUnreadFrom: (sid) => NotificationCenter.getUnreadFrom(sid),
    onConversationRead: () => NotificationCenter.onConversationRead(),
    destroy: () => NotificationCenter.destroy(),
    get _ready() { return _state.ready; }
  };

  window.NewsCenter = {
    init: (uid) => NotificationCenter.init(uid),
    open: () => NotificationCenter.open(),
    close: () => NotificationCenter.close(),
    toggle: () => NotificationCenter.toggle(),
    markAllRead: () => NotificationCenter.markAllRead(),
    refresh: () => NotificationCenter.refresh()
  };

  window._updateGlobalChatBadge = () => _scheduleRefresh(0);
}

// Inmediatamente accesibles (antes de init) para módulos que sólo
// hacen window._updateGlobalChatBadge?.() sin importar.
_installGlobalAdapters();

/**
 * Named exports para paneles que importan BadgeSystem / NewsCenter directamente.
 * Son los MISMOS objetos que _installGlobalAdapters() cuelga en window,
 * así que hay coherencia entre import { X } y window.X.
 */
export const BadgeSystem = {
  init: (uid) => NotificationCenter.init(uid),
  mark: (s) => NotificationCenter.mark(s),
  setCount: (s,c,t) => NotificationCenter.setCount(s,c,t),
  set: (s,c) => NotificationCenter.set(s,c),
  _reapplyCardBadges: () => NotificationCenter._reapplyCardBadges(),
  destroy: () => NotificationCenter.destroy()
};

export const NewsCenter = {
  init: (uid) => NotificationCenter.init(uid),
  open: () => NotificationCenter.open(),
  close: () => NotificationCenter.close(),
  toggle: () => NotificationCenter.toggle(),
  markAllRead: () => NotificationCenter.markAllRead(),
  refresh: () => NotificationCenter.refresh()
};

export default NotificationCenter;
