/**
 * Colegio Montessori Sonrisas Creativas — Mensajes no leídos
 *
 * Fuente única de verdad del indicador de mensajes sin leer, para los 6 paneles:
 *   • la campana flotante  (#newsCenterBadge, inyectada por news-center.js)
 *   • el badge de la sección de chat de cada panel
 *
 * POR QUÉ EXISTE ESTE MÓDULO Y NO UN `+1` EN CADA PANEL
 *
 * 1. `messages` no estaba en la publicación `supabase_realtime`, así que todos
 *    los listeners de postgres_changes sobre esa tabla eran silenciosamente
 *    muertos: se registraban, no llegaba ningún evento, la campana no se movía.
 *    Corregido en sql/14_fix_realtime_no_leidos.sql (tienes que correrlo).
 *
 * 2. El canal de badges se creaba vía RealtimeManager, que lo destruía por
 *    tres vías distintas, todas sin resuscripción:
 *      - MAX_CHANNELS = 8: al abrir la 9ª sección expulsa el más antiguo, y como
 *        el de badges se suscribe en el init, es siempre el primero en caer.
 *      - unsubscribeAll() en cada cambio de sección, con keep-lists que usaban
 *        nombres equivocados ('notifications' en vez de 'badges_<uid>').
 *      - Teardown a los 5 min con la pestaña oculta, sin resuscripción.
 *    Aquí el canal se crea directo con supabase.channel(), fuera del gestor, y
 *    se re-suscribe al volver a la pestaña.
 *
 * 3. Los handlers antiguos hacían _renderBadge(n + 1): un incremento a ciegas
 *    sobre el DOM que nunca se reconciliaba con la base de datos. El primer
 *    evento perdido dejaba el contador desfasado para siempre. Aquí se relee
 *    la BD con debounce: es idempotente y se auto-cura.
 *
 * 4. `get_unread_counts` metía una clave `total` DENTRO del objeto de conteos,
 *    y los llamadores hacían Object.values(...).reduce(+): el total se contaba
 *    dos veces (3 sin leer se pintaban como 6). Aquí se normaliza cualquiera de
 *    las tres formas que puede devolver el RPC, así que funciona incluso si
 *    todavía no corriste el SQL nuevo.
 */

import { supabase } from './supabase.js';

const CHANNEL_PREFIX = 'unread_msgs_';
const REFRESH_DEBOUNCE_MS = 400;
const MAX_UNREAD_QUERY = 500;
// Reintento del canal tras CHANNEL_ERROR / TIMED_OUT / CLOSED.
const RESUB_MAX_ATTEMPTS = 5;
const RESUB_MIN_MS = 2000;
const RESUB_MAX_MS = 30000;
// Si el canal no levanta, la campana se mantiene viva leyendo la BD.
const POLL_FALLBACK_MS = 30000;

export const UnreadMessages = {
  _userId: null,
  _role: null,
  _channel: null,
  _channelName: null,
  _counts: {},        // senderId → cantidad sin leer
  _total: 0,          // total de mensajes sin leer
  _notifUnread: 0,    // notificaciones sin leer (alimenta la campana)
  _timer: null,       // debounce del refresco
  _inFlight: null,    // promesa del refresco en curso
  _ready: false,
  _retries: 0,        // intentos de re-suscripción consecutivos fallidos
  _resubTimer: null,  // temporizador del próximo reintento de canal
  _pollTimer: null,   // polling de respaldo cuando el canal no conecta

  /* ══════════════════════  ARRANQUE / CIERRE  ══════════════════════ */

  async init(userId, role) {
    if (!userId) return;
    if (this._userId === userId && this._ready) return;

    this.destroy();
    this._userId = userId;
    this._role = role || this._detectRole();
    this._retries = 0;

    this._installGlobalBridge();
    this._installVisibilityHook();
    // access_token fresco ANTES del primer join: un token vencido en el
    // payload de entrada responde "error" y el canal queda en CHANNEL_ERROR.
    try { await supabase.realtime?.setAuth?.(); } catch (_) { /* sin sesión aún */ }
    this._ensureSubscribed();

    await this.refresh();
    this._ready = true;
  },

  destroy() {
    this._teardownChannel();
    clearTimeout(this._timer);
    this._timer = null;
    clearTimeout(this._resubTimer);
    this._resubTimer = null;
    this._stopPolling();
    this._inFlight = null;
    if (this._onVisibility) {
      document.removeEventListener('visibilitychange', this._onVisibility);
      this._onVisibility = null;
    }
    this._userId = null;
    this._ready = false;
    this._retries = 0;
    this._counts = {};
    this._total = 0;
    this._notifUnread = 0;
  },

  /** Cierra el canal actual sin disparar re-suscripciones (destroy o retry). */
  _teardownChannel() {
    const ch = this._channel;
    this._channel = null;
    this._channelName = null;
    if (!ch) return;
    try { supabase.removeChannel(ch); } catch (_) { /* ya cerrado */ }
  },

  _detectRole() {
    const cls = document.body?.className || '';
    if (cls.includes('panel-padre-body'))     return 'padre';
    if (cls.includes('panel-directora-body')) return 'directora';
    if (cls.includes('panel-maestra-body'))   return 'maestra';
    if (cls.includes('panel-asistente-body')) return 'asistente';
    if (cls.includes('panel-encargada-body')) return 'encargada';
    return 'unknown';
  },

  /* ══════════════════════  REALTIME  ══════════════════════ */

  /**
   * El canal se crea con supabase.channel() directo, NO con RealtimeManager.
   * Así no lo expulsa MAX_CHANNELS ni lo mata unsubscribeAll() al cambiar de
   * sección. Se mantiene incluso en panels que abren 10+ módulos.
   */
  _ensureSubscribed() {
    if (!this._userId) return;
    if (this._channel) return;

    const name = CHANNEL_PREFIX + this._userId;
    this._channelName = name;

    const channel = supabase.channel(name);

    channel.on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages'
    }, (payload) => this._onMessageInsert(payload));

    // Acuses de lectura: alguien abrió la conversación en otro dispositivo.
    channel.on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'messages'
    }, (payload) => this._onMessageUpdate(payload));

    // Registrar el canal ANTES de suscribirse: si subscribe() dispara el
    // callback de forma síncrona, el guard de abajo lo reconoce como "nuestro".
    this._channel = channel;

    try {
      channel.subscribe((status, err) => {
        // El canal ya fue destruido o reemplazado: su callback no nos incumbe
        // (si no, removeChannel() dispararía un reintento infinito en destroy()).
        if (this._channel !== channel) return;

        if (status === 'SUBSCRIBED') {
          this._retries = 0;
          this._stopPolling();
          // Al (re)conectar, la BD pudo haber cambiado mientras no escuchábamos.
          this._scheduleRefresh(0);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          this._handleChannelFailure(status, err, channel);
        }
      });
    } catch (err) {
      this._handleChannelFailure('CHANNEL_ERROR', err, channel);
    }
  },

  /**
   * El canal falló (JWT vencido en el join, corte de red, servidor ocupado...).
   * Antes esto era un console.warn y ya: si el canal no levantaba, la campana
   * se quedaba muda hasta recargar. Ahora:
   *   1. se suelta el canal en error (si no, _ensureSubscribed() no vuelve a entrar),
   *   2. se reintenta con backoff exponencial y token de auth refrescado,
   *   3. si no levanta, se cae a polling de la BD para que el badge siga real.
   */
  _handleChannelFailure(status, err, channel) {
    const detail = err?.message || '';
    this._retries += 1;

    if (this._retries === 1) {
      console.warn('[UnreadMessages] canal en error:', status, detail ? '— ' + detail : '');
      if (/mismatch/i.test(detail)) {
        console.warn('[UnreadMessages] El servidor no aceptó los bindings de postgres_changes. '
          + 'Revisa que `messages` esté en la publicación supabase_realtime '
          + '(bloque 14 de sql/13_fix_storage_video.sql).');
      }
    } else {
      console.warn(`[UnreadMessages] ${status} (intento ${this._retries}/${RESUB_MAX_ATTEMPTS})`);
    }

    if (this._channel === channel) this._teardownChannel();

    if (this._retries >= RESUB_MAX_ATTEMPTS) { this._startPolling(); return; }
    if (this._resubTimer) return;

    const delay = Math.min(RESUB_MIN_MS * 2 ** (this._retries - 1), RESUB_MAX_MS);
    this._resubTimer = setTimeout(async () => {
      this._resubTimer = null;
      if (!this._userId) return;
      // Token fresco antes de volver a unirnos: la causa más común de
      // CHANNEL_ERROR en el join es un access_token vencido o malformado.
      try { await supabase.realtime?.setAuth?.(); } catch (_) { /* ya refrescado */ }
      this._ensureSubscribed();
    }, delay);
  },

  _startPolling() {
    if (this._pollTimer || !this._userId) return;
    console.warn(`[UnreadMessages] Canal realtime inaccesible tras ${RESUB_MAX_ATTEMPTS} intentos: `
      + `el badge se mantendrá leyendo la BD cada ${POLL_FALLBACK_MS / 1000}s.`);
    this._pollTimer = setInterval(() => { this.refresh(); }, POLL_FALLBACK_MS);
  },

  _stopPolling() {
    if (!this._pollTimer) return;
    clearInterval(this._pollTimer);
    this._pollTimer = null;
  },

  _onMessageInsert(payload) {
    const msg = payload?.new;
    if (!msg) return;
    // Ignorar el eco de lo que acabo de enviar yo.
    if (msg.sender_id === this._userId) return;

    this._scheduleRefresh();
    this._pulseBell();
  },

  _onMessageUpdate(payload) {
    const row = payload?.new;
    if (!row) return;
    // Solo nos afectan los acuses de lectura (is_read / read_at).
    if (row.is_read === true || row.read_at) this._scheduleRefresh();
  },

  _installVisibilityHook() {
    if (this._onVisibility) return;
    this._onVisibility = () => {
      if (document.hidden) return;
      // Volver a la pestaña: el canal puede haberse caído y la BD cambió
      // mientras no escuchábamos. Reconciliar siempre. Nueva oportunidad
      // para el canal aunque antes se hubiera caído al modo polling.
      this._retries = 0;
      this._ensureSubscribed();
      this.refresh();
    };
    document.addEventListener('visibilitychange', this._onVisibility);
  },

  /* ══════════════════════  LECTURA DE DATOS  ══════════════════════ */

  _scheduleRefresh(delay = REFRESH_DEBOUNCE_MS) {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => { this.refresh(); }, delay);
  },

  /**
   * Relee los conteos reales y repinta. Idempotente: no depende de cuántos
   * eventos llegaron, solo del estado de la base de datos.
   */
  async refresh() {
    if (!this._userId) return null;
    if (this._inFlight) return this._inFlight;

    this._inFlight = this._doRefresh().finally(() => { this._inFlight = null; });
    return this._inFlight;
  },

  async _doRefresh() {
    try {
      const [msgCounts, notifCount] = await Promise.all([
        this._fetchMessageCounts(),
        this._fetchNotificationCount(),
      ]);

      this._counts = msgCounts;
      this._total = Object.values(msgCounts).reduce((a, b) => a + b, 0);
      this._notifUnread = notifCount;

      this.render();
      return { counts: this._counts, total: this._total, notifUnread: this._notifUnread };
    } catch (err) {
      console.error('[UnreadMessages] error al refrescar:', err);
      return null;
    }
  },

  /**
   * Normaliza la respuesta de get_unread_counts.
   * Acepta las tres formas para no romper si el SQL 14 aún no se ha corrido:
   *   - [{ user_id, unread }]        (tabla — forma nueva)
   *   - { "<uuid>": 3, ... }          (objeto jsonb)
   *   - { "<uuid>": 3, "total": 3 }   (objeto jsonb con la clave total dentro)
   */
  _normalizeCounts(data) {
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
      for (const [key, val] of Object.entries(data)) {
        if (key === 'total') continue; // agregado, no un remitente
        const n = Number(val);
        if (n > 0) out[key] = n;
      }
    }
    return out;
  },

  async _fetchMessageCounts() {
    const { data, error } = await supabase.rpc('get_unread_counts');
    if (!error && data) return this._normalizeCounts(data);

    // RPC ausente o caída: consulta directa como red de seguridad.
    return this._fetchMessageCountsFallback();
  },

  async _fetchMessageCountsFallback() {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('sender_id, conversation_id')
        .eq('receiver_id', this._userId)
        .eq('is_read', false)
        .limit(MAX_UNREAD_QUERY);

      if (error) throw error;

      const counts = {};
      for (const m of data || []) {
        if (!m?.sender_id) continue;
        counts[m.sender_id] = (counts[m.sender_id] || 0) + 1;
      }
      return counts;
    } catch (err) {
      console.warn('[UnreadMessages] fallback de conteo falló:', err?.message);
      return this._counts; // conservar el último valor conocido
    }
  },

  async _fetchNotificationCount() {
    try {
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', this._userId)
        .eq('is_read', false);
      if (error) return this._notifUnread;
      return count || 0;
    } catch (_) {
      return this._notifUnread;
    }
  },

  /* ══════════════════════  RENDER  ══════════════════════ */

  /**
   * Ids del badge de chat en el sidebar, por panel. Se prueban todos porque
   * el nombre histórico no coincide con el id real en varios paneles.
   */
  _chatBadgeIds() {
    return [
      'badge-t-chat',        // maestra
      'badge-chat',          // asistente
      'badge-comunicacion',  // directora
      'badge-notifications', // padre (agregado junto a este fix)
      'badge-alertas',       // encargada
    ];
  },

  _cardBadgeIds() {
    return ['badge-card-comunicacion', 'badge-card-chat', 'badge-card-notifications'];
  },

  render() {
    this._renderChatBadges();
    this._renderBell();
  },

  _renderChatBadges() {
    const n = this._total;
    for (const id of this._chatBadgeIds()) {
      this._paintBadge(document.getElementById(id), n);
    }
    for (const id of this._cardBadgeIds()) {
      this._paintBadge(document.getElementById(id), n);
    }
  },

  _renderBell() {
    const bell = document.getElementById('newsCenterBadge');
    if (!bell) return;
    // Mensajes y notificaciones son fuentes disjuntas (un mensaje de chat no
    // crea fila en `notifications`), así que la suma es correcta. Si algún día
    // un flujo inserta ambas, hay que restar el solape aquí.
    this._paintBadge(bell, this._total + this._notifUnread);
  },

  _paintBadge(el, n) {
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
  },

  /** Destello rojo sobre la campana al entrar un mensaje nuevo. */
  _pulseBell() {
    const btn = document.getElementById('newsCenterBell');
    if (!btn) return;
    btn.classList.add('is-ringing');
    setTimeout(() => btn.classList.remove('is-ringing'), 2200);
  },

  /* ══════════════════════  API PÚBLICA  ══════════════════════ */

  getTotal() { return this._total; },

  getNotificationTotal() { return this._notifUnread; },

  /** Sin leer de un remitente concreto — para el punto junto al contacto. */
  getUnreadFrom(senderId) { return this._counts[senderId] || 0; },

  getCounts() { return { ...this._counts }; },

  /**
   * Se llama desde el flujo que marca una conversación como leída, para que
   * el indicador baje sin esperar al siguiente evento.
   */
  async onConversationRead() {
    this._scheduleRefresh(150);
  },

  /* ══════════════════════  PUENTE GLOBAL  ══════════════════════ */

  /**
   * Los 5 módulos de chat llamaban a window._updateGlobalChatBadge?.() en 13
   * sitios. La función NO existía en ningún lado, así que el optional chaining
   * convertía cada llamada en un no-op silencioso: los badges nunca se
   * actualizaban al enviar, leer o abrir una conversación. Queda definida acá.
   */
  _installGlobalBridge() {
    window._updateGlobalChatBadge = () => this.refresh();
  },
};

// Puente también para módulos que solo sparsen la función sin importar.
window._updateGlobalChatBadge = () => UnreadMessages.refresh();
// news-center.js consulta este global para no pelear por #newsCenterBadge.
window.UnreadMessages = UnreadMessages;

export default UnreadMessages;
