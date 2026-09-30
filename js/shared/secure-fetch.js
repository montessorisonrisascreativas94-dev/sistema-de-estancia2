/**
 * SecureFetch — Envoltorio seguro de fetch con:
 *  - Timeout (AbortController) para evitar cargas colgadas.
 *  - Reintentos con backoff exponencial y jitter (solo idempotente).
 *  - Validación de URLs (solo http/https, sin credenciales incrustadas).
 *  - Mapeo de errores a mensajes amigables y empáticos.
 *  - Feedback de carga automático vía LoadingFeedback.
 *
 * Usage:
 *   import { secureFetch, secureJson } from '../shared/secure-fetch.js';
 *   const data = await secureJson('/api/classrooms', {
 *     method: 'GET',
 *     token: sessionToken,
 *     retries: 2,
 *     loading: 'Cargando aulas...'
 *   });
 */

import { withLoading } from './loading-feedback.js';

const DEFAULT_TIMEOUT = 15_000;
const DEFAULT_RETRIES = 2;

/** Mensajes amigables por tipo de error */
const FRIENDLY_ERRORS = {
  timeout: 'La solicitud tardó demasiado. Por favor, inténtalo de nuevo.',
  abort: 'La conexión se interrumpió. Estamos contigo, inténtalo otra vez.',
  network: 'Parece que no hay conexión. Revisa tu internet e inténtalo de nuevo.',
  400: 'La información enviada no es válida. Revísala e inténtalo de nuevo.',
  401: 'Tu sesión venció. Por favor inicia sesión nuevamente.',
  403: 'No tienes permiso para realizar esta acción.',
  404: 'No encontramos lo que buscas.',
  408: 'El servidor tardó demasiado en responder. Inténtalo nuevamente.',
  409: 'Ese dato ya existe. Verifícalo e inténtalo de nuevo.',
  413: 'El archivo es demasiado grande. Prueba con uno más liviano.',
  415: 'Formato de datos no soportado.',
  429: 'Has hecho demasiadas solicitudes. Espera un momento y vuelve a intentarlo.',
  500: 'Ocurrió un error en el servidor. Ya estamos trabajando en ello.',
  502: 'El servidor está temporalmente ocupado. Espera un momento.',
  503: 'El servicio está en mantenimiento. Gracias por tu paciencia.',
  504: 'El servidor tardó demasiado en responder. Inténtalo de nuevo.'
};

function friendlyError(status, phase) {
  if (status && FRIENDLY_ERRORS[status]) return FRIENDLY_ERRORS[status];
  if (phase === 'timeout') return FRIENDLY_ERRORS.timeout;
  if (phase === 'abort') return FRIENDLY_ERRORS.abort;
  return FRIENDLY_ERRORS.network;
}

/** Valida que una URL sea http/https, sin credenciales ni fragmento. */
export function isValidHttpUrl(url) {
  try {
    const u = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    if (u.username || u.password) return false;
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * fetch seguro.
 * @param {string} url
 * @param {object} [opts] { method, headers, body, token, timeoutMs, retries, loading, containerId, signal }
 */
export async function secureFetch(url, opts = {}) {
  const {
    method = 'GET',
    headers = {},
    body = null,
    token = null,
    timeoutMs = DEFAULT_TIMEOUT,
    retries = DEFAULT_RETRIES,
    loading = null,
    containerId = null,
    signal = null
  } = opts;

  if (!isValidHttpUrl(url)) {
    throw new Error('URL no válida');
  }

  const finalHeaders = { ...headers };
  if (token) finalHeaders['Authorization'] = `Bearer ${token}`;
  if (body && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof Blob)) {
    finalHeaders['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }
  if (body === null || body === undefined) body = undefined;

  const run = () => secureFetchOnce(url, { method, headers: finalHeaders, body, timeoutMs, signal });

  if (loading) {
    return withLoading(loading, run, { containerId });
  }
  return run();
}

async function secureFetchOnce(url, { method, headers, body, timeoutMs, signal }) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  const onOuterAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onOuterAbort);
  }

  try {
    const res = await fetch(url, { method, headers, body, signal: controller.signal });
    return res;
  } catch (e) {
    const phase = e && e.name === 'AbortError' ? (timedOut ? 'timeout' : 'abort') : 'network';
    throw new SecureFetchError(friendlyError(null, phase), phase, null);
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onOuterAbort);
  }
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function backoffDelay(attempt, baseMs = 400) {
  const jitter = Math.random() * baseMs;
  return Math.min(10_000, baseMs * Math.pow(2, attempt) + jitter);
}

const IDEMPOTENT = new Set(['GET', 'PUT', 'DELETE', 'HEAD', 'OPTIONS']);

/**
 * fetch con reintentos (solo métodos idempotentes) y mapeo de errores.
 */
export async function fetchWithRetry(url, opts = {}) {
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const canRetry = IDEMPOTENT.has(String(opts.method || 'GET').toUpperCase());

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await secureFetch(url, { ...opts, retries: 0 });
      if (res.ok) return res;
      if (!canRetry || res.status < 500 || attempt === retries) {
        throw new SecureFetchError(friendlyError(res.status), 'status', res.status);
      }
      lastErr = new SecureFetchError(friendlyError(res.status), 'status', res.status);
    } catch (e) {
      lastErr = e;
      if (e instanceof SecureFetchError && e.phase === 'status' && e.status < 500) throw e;
      if (e instanceof SecureFetchError && e.phase === 'timeout' && attempt >= retries) throw e;
      if (attempt >= retries) throw e;
    }
    await sleep(backoffDelay(attempt));
  }
  throw lastErr || new SecureFetchError(friendlyError(null, 'network'), 'network', null);
}

/**
 * fetch que devuelve JSON parseado.
 */
export async function secureJson(url, opts = {}) {
  const res = await fetchWithRetry(url, opts);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  return data;
}

/** Error tipado con fase y status HTTP. */
export class SecureFetchError extends Error {
  constructor(message, phase = 'unknown', status = null) {
    super(message);
    this.name = 'SecureFetchError';
    this.phase = phase;
    this.status = status;
  }
}

if (typeof window !== 'undefined') {
  window.secureFetch = secureFetch;
  window.secureJson = secureJson;
  window.SecureFetchError = SecureFetchError;
}
