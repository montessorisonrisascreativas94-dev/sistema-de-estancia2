/**
 * Colegio Montessori Sonrisas Creativas — Caché por sección
 *
 * Evita la sensación de "recarga" al cambiar de pestaña en los paneles.
 *
 * EL PROBLEMA QUE RESUELVE
 *
 * Los paneles son SPA de verdad: la navegación no recarga la página, solo
 * interchangea clases. Pero casi todas las funciones `load*()` se volvían a
 * ejecutar en cada entrada a la sección, con su RTT completo y su skeleton
 * parpadeando, para traer exactamente los mismos datos. La maestra ya tenía un
 * TTL de 2 min; los otros cinco paneles no tenían nada.
 *
 * LA REGLA QUE SE APLICA
 *
 *   1. Primera entrada a la sección  → carga normal.
 *   2. Reentro antes del TTL          → no se vuelve a pedir nada.
 *   3. Llega un evento realtime       → se invalida esa sección sola, y el
 *                                       siguiente reentrado recarga.
 *
 * El punto 3 es lo que hace esto seguro: no se muestran datos rancios por
 * caching, porque quien manda es el evento, no el reloj. El TTL es solo una red
 * de seguridad para cuando el realtime no cubre una tabla.
 *
 * `force: true` en la navegación (o un `invalidate`) siempre pasa.
 */

const DEFAULT_TTL_MS = 90 * 1000;

export const SectionCache = {
  _loadedAt: new Map(),   // sectionId → timestamp del último load real
  _ttl: new Map(),        // sectionId → TTL específico (opcional)
  _inflight: new Map(),   // sectionId → promesa, para no duplicar cargas

  /**
   * ¿Hay que cargar esta sección?
   * @param {string}  sectionId
   * @param {object}  opts
   * @param {boolean} opts.force  — saltar el caché (nav con force, deep-link)
   * @param {number}  opts.ttl    — override del TTL en ms
   * @param {boolean} opts.loaded — si el DOM ya tiene datos de una carga previa
   * @returns {boolean}
   */
  shouldLoad(sectionId, opts = {}) {
    if (!sectionId) return true;
    if (opts.force) return true;

    const at = this._loadedAt.get(sectionId);
    if (at === undefined) return true;

    const ttl = opts.ttl ?? this._ttl.get(sectionId) ?? DEFAULT_TTL_MS;
    return (Date.now() - at) >= ttl;
  },

  /** Marcar que esta sección acaba de cargar datos de verdad. */
  markLoaded(sectionId, ttl) {
    if (!sectionId) return;
    this._loadedAt.set(sectionId, Date.now());
    if (ttl !== undefined) this._ttl.set(sectionId, ttl);
  },

  /**
   * Invalidar una sección para que el próximo reentrado recargue.
   * Acepta un id, un array, o una función de predicado sobre el id.
   */
  invalidate(sectionOrPredicate) {
    if (typeof sectionOrPredicate === 'function') {
      for (const id of [...this._loadedAt.keys()]) {
        if (sectionOrPredicate(id)) this._loadedAt.delete(id);
      }
      return;
    }
    if (Array.isArray(sectionOrPredicate)) {
      sectionOrPredicate.forEach(id => this._loadedAt.delete(id));
      return;
    }
    this._loadedAt.delete(sectionOrPredicate);
  },

  /** TTL específico para una sección. */
  setTtl(sectionId, ttl) {
    this._ttl.set(sectionId, ttl);
  },

  /**
   * ¿Hay ya una carga en curso para esta sección?
   * Evita que un doble clic en la navegación dispare dos peticiones idénticas.
   */
  getInFlight(sectionId) {
    return this._inflight.get(sectionId) || null;
  },

  setInFlight(sectionId, promise) {
    this._inflight.set(sectionId, promise);
    const clear = () => { this._inflight.delete(sectionId); };
    Promise.resolve(promise).then(clear, clear);
    return promise;
  },

  /** Estado para depurar desde la consola. */
  debug() {
    const now = Date.now();
    const out = {};
    for (const [id, at] of this._loadedAt) {
      const ttl = this._ttl.get(id) ?? DEFAULT_TTL_MS;
      out[id] = { ageMs: now - at, ttl, stale: (now - at) >= ttl };
    }
    return out;
  },

  /** Limpiar todo (logout o cambio de usuario). */
  clear() {
    this._loadedAt.clear();
    this._ttl.clear();
    this._inflight.clear();
  },
};

/**
 * Envoltorio para una función de carga: si la sección está fresca, no llama.
 * Devuelve { skipped: true } para que el llamador pueda saltarse el skeleton.
 *
 * @param {string}   sectionId
 * @param {Function} loader      — la función de carga real
 * @param {object}   opts        — { force, ttl }
 */
export async function loadOnce(sectionId, loader, opts = {}) {
  if (!SectionCache.shouldLoad(sectionId, opts)) {
    return { skipped: true, cached: true };
  }
  const inflight = SectionCache.getInFlight(sectionId);
  if (inflight) return inflight;

  const promise = (async () => {
    const result = await loader();
    SectionCache.markLoaded(sectionId, opts.ttl);
    return { skipped: false, result };
  })();

  return SectionCache.setInFlight(sectionId, promise);
}

window.SectionCache = SectionCache;
export default SectionCache;
