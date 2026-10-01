/**
 * 📡 Colegio Montessori Sonrisas Creativas — RealtimeManager
 * Gestión centralizada de canales Supabase Realtime.
 * Evita memory leaks por canales huérfanos y limita a MAX_CHANNELS activos.
 *
 * Problema que resuelve:
 *   Con 10k usuarios, cada uno puede abrir múltiples canales si no se limpian.
 *   Supabase tiene un límite de conexiones concurrentes por proyecto.
 *   Este módulo garantiza que cada usuario solo tenga los canales necesarios.
 */

import { supabase } from './supabase.js';

const MAX_CHANNELS = 8; // máximo de canales activos por sesión
const _channels = new Map(); // name → RealtimeChannel
const _retries  = new Map(); // name → retry count
const _resubs   = new Map(); // name → setupFn, para poder revivir tras un teardown

/**
 * Canales que NUNCA deben ser expulsados por eviction ni destruidos por el
 * teardown de pestaña oculta: son los que sostienen la campana y los badges.
 * Antes compartían el presupuesto de MAX_CHANNELS con los módulos perezosos, y
 * como se suscriben en el init eran siempre los primeros en caer — la campana se
 * quedaba muda en cuanto el usuario abría la novena sección.
 */
const CRITICAL = ['badges_', 'news-center_', 'unread_msgs_'];

const isCritical = (name) => CRITICAL.some(prefix => name.startsWith(prefix));

export const RealtimeManager = {
  /**
   * Suscribe a un canal. Si ya existe con el mismo nombre, lo reutiliza.
   * Si se supera MAX_CHANNELS, elimina el más antiguo que no sea crítico.
   *
   * @param {string}   name     — nombre único del canal
   * @param {Function} setupFn  — (channel) => channel.on(...).on(...)
   * @returns {RealtimeChannel}
   */
  subscribe(name, setupFn) {
    // Reutilizar si ya existe
    if (_channels.has(name)) return _channels.get(name);

    // Evitar exceder el límite, saltándose los canales críticos
    if (_channels.size >= MAX_CHANNELS) {
      let victim = null;
      for (const key of _channels.keys()) {
        if (!isCritical(key)) { victim = key; break; }
      }
      // Todos los activos son críticos: expulsar el más viejo igualmente.
      if (!victim) victim = _channels.keys().next().value;
      this.unsubscribe(victim);
    }

    const channel = supabase.channel(name);
    setupFn(channel);

    // Pequeño delay para evitar "WebSocket closed before connection established"
    setTimeout(() => {
      if (!_channels.has(name)) return; // fue cancelado antes de conectar
      channel.subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          _channels.delete(name);
          // Exponential backoff reconnect
          const delay = Math.min(1000 * Math.pow(2, (_retries.get(name) || 0)), 30000);
          _retries.set(name, (_retries.get(name) || 0) + 1);
          setTimeout(() => {
            if (!_channels.has(name)) this.subscribe(name, setupFn);
          }, delay);
        } else if (status === 'SUBSCRIBED') {
          _retries.delete(name); // reset on success
        }
      });
    }, 100);

    _channels.set(name, channel);
    _resubs.set(name, setupFn);
    return channel;
  },

  /** Elimina un canal por nombre */
  unsubscribe(name) {
    const ch = _channels.get(name);
    if (ch) {
      console.log(`[RealtimeManager] Unsubscribing: ${name}`);
      supabase.removeChannel(ch);
      _channels.delete(name);
      _retries.delete(name);
    }
  },

  /**
   * Elimina todos los canales (llamar en logout o cambio de sección).
   *
   * @param {string[]} except        — nombres a conservar
   * @param {boolean}  _keepCritical — interno: preservar los canales de campana
   */
  unsubscribeAll(except = [], _keepCritical = false) {
    for (const [name, ch] of _channels) {
      if (except.includes(name)) continue;
      // Antes, ocultar la pestaña 5 minutos llamaba a esto sin argumentos y
      // destruía la campana y los badges; como no queda nada que los vuelva a
      // levantar, el usuario volvía a un panel con los indicadores congelados.
      if (_keepCritical && isCritical(name)) continue;
      supabase.removeChannel(ch);
      _channels.delete(name);
      _retries.delete(name);
    }
  },

  /**
   * Resuscripción masiva tras un teardown. El setupFn queda registrado en
   * `_resubs` para poder reconstruir un canal que ya no está en `_channels`.
   *
   * Solo reconstruye los canales CRÍTICOS: los de módulos perezosos que la
   * navegación de secciones destruye a propósito deben seguir destruidos, o
   * volveríamos a tener 15 canales abiertos en cada panel.
   */
  resubscribeAll() {
    for (const [name, setupFn] of [..._resubs.entries()]) {
      if (_channels.has(name)) continue;
      if (!isCritical(name)) continue;
      this.subscribe(name, setupFn);
    }
  },

  /** Olvida los setupFn registrados (logout real). */
  forgetAll() {
    _resubs.clear();
    _retries.clear();
  },

  /** Retorna los canales activos */
  list() {
    return [..._channels.keys()];
  }
};

// Limpiar canales al cerrar la pestaña
window.addEventListener('beforeunload', () => RealtimeManager.unsubscribeAll());
// Limpiar al perder visibilidad por más de 5 min (ahorro de conexiones).
// Se preservan los canales críticos (campana y badges) porque no hay ningún
// camino que los levante de nuevo: antes, volver a la pestaña tras 5 min
// dejaba el panel con los indicadores congelados hasta recargar.
let _hiddenTimer = null;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    _hiddenTimer = setTimeout(() => RealtimeManager.unsubscribeAll([], true), 5 * 60_000);
  } else {
    clearTimeout(_hiddenTimer);
    // Resuscripción defensiva: si algo tumbling pasó igual, reconstruir.
    RealtimeManager.resubscribeAll();
  }
});
