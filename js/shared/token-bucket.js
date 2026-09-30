/**
 * TokenBucket — Límite de token sobre secuencia de operaciones.
 *
 * Implementa el algoritmo "token bucket" (RFC 9316-style) en memoria:
 * cada operación consume un token; los tokens se reponen de forma
 * continua (rate) hasta un máximo (capacity). Sirve para proteger
 * secuencias repetitivas (envíos, clics, sondeos) y para mostrar
 * feedback empático cuando la secuencia debe esperar.
 *
 * Usage:
 *   import { TokenBucket, createTokenBucket } from '../shared/token-bucket.js';
 *   const bucket = createTokenBucket({ capacity: 10, rate: 2, label: 'mensajes' });
 *   if (bucket.take()) { await send(); } else { bucket.waitMessage(); }
 */

export class TokenBucket {
  /**
   * @param {object} opts
   * @param {number} opts.capacity  tokens máximos acumulables (ráfaga)
   * @param {number} opts.rate      tokens por segundo
   * @param {string} [opts.label]   nombre humano de la secuencia
   */
  constructor({ capacity = 10, rate = 2, label = 'esta operación' } = {}) {
    this.capacity = Math.max(1, Math.floor(capacity));
    this.rate = Math.max(0.1, rate);
    this.label = label;
    this.tokens = this.capacity;
    this.lastRefill = Date.now();
  }

  _refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.rate);
    this.lastRefill = now;
  }

  /** Consume un token. Devuelve true si la secuencia puede continuar. */
  take() {
    this._refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  /** Tiempo estimado (ms) hasta tener un token disponible. */
  waitTime() {
    this._refill();
    if (this.tokens >= 1) return 0;
    const deficit = 1 - this.tokens;
    return Math.ceil((deficit / this.rate) * 1000);
  }

  /** Devuelve tokens disponibles (0..capacity). */
  available() {
    this._refill();
    return Math.floor(this.tokens);
  }

  /** Feedback empático cuando la secuencia está saturada. */
  waitMessage() {
    const ms = this.waitTime();
    const secs = Math.max(1, Math.ceil(ms / 1000));
    const msg = ms === 0
      ? `Muy rápido: espera un momento antes de "${this.label}".`
      : `Estamos trabajando contigo: espera ${secs}s para continuar con "${this.label}".`;
    if (typeof window !== 'undefined' && window.Helpers?.toast) {
      window.Helpers.toast(msg, 'warning', Math.min(6000, ms + 2000));
    }
    return msg;
  }

  /**
   * Ejecuta `fn` solo si hay token. Si no hay, espera el tiempo
   * necesario (respetando un tope) y reintenta.
   */
  async takeOrWait(fn, { maxWaitMs = 0 } = {}) {
    if (this.take()) return fn();
    const wait = this.waitTime();
    if (maxWaitMs > 0 && wait > maxWaitMs) {
      this.waitMessage();
      throw new Error(`rate_limited:${this.label}`);
    }
    await new Promise(r => setTimeout(r, wait));
    if (!this.take()) {
      this.waitMessage();
      throw new Error(`rate_limited:${this.label}`);
    }
    return fn();
  }
}

/** Fabrica buckets preconfigurados por tipo de secuencia. */
export function createTokenBucket(opts) {
  return new TokenBucket(opts);
}

// Buckets predefinidos por tipo de operación
export const buckets = {
  message:   new TokenBucket({ capacity: 20, rate: 0.35, label: 'enviar mensajes' }),      // 20/60s
  comment:   new TokenBucket({ capacity: 10, rate: 0.17, label: 'publicar comentarios' }), // 10/60s
  like:      new TokenBucket({ capacity: 30, rate: 0.5,  label: 'reaccionar' }),           // 30/60s
  upload:    new TokenBucket({ capacity: 3,  rate: 0.001, label: 'subir archivos' }),      // 3/hora
  login:     new TokenBucket({ capacity: 3,  rate: 0.033, label: 'iniciar sesión' }),      // 3/90s
  request:   new TokenBucket({ capacity: 60, rate: 1,    label: 'solicitudes' }),          // 60/60s
  sequence:  new TokenBucket({ capacity: 1,  rate: 0.1,  label: 'procesar en secuencia' }) // 1 cada 10s
};

if (typeof window !== 'undefined') {
  window.TokenBucket = TokenBucket;
  window.createTokenBucket = createTokenBucket;
  window.TokenBuckets = buckets;
}
