import { supabase } from './supabase.js';

let _cachedYear = null;
let _cachedPeriod = null;

export const SchoolYearGuard = {
  async getCurrentYear() {
    if (_cachedYear && Date.now() - (_cachedYear._ts || 0) < 60000) return _cachedYear;
    const { data } = await supabase.from('school_years').select('*').eq('is_current', true).single();
    _cachedYear = data ? { ...data, _ts: Date.now() } : null;
    return _cachedYear;
  },

  async getActivePeriod() {
    if (_cachedPeriod && Date.now() - (_cachedPeriod._ts || 0) < 60000) return _cachedPeriod;
    const { data, error } = await supabase.from('periods').select('*').eq('is_active', true);
    if (error) { console.warn('[SchoolYearGuard] periods query failed:', error.message); return null; }
    _cachedPeriod = data && data.length ? { ...data[0], _ts: Date.now() } : null;
    return _cachedPeriod;
  },

  async isYearOpen() {
    const year = await this.getCurrentYear();
    return year && year.status !== 'closed';
  },

  async isPeriodOpen(periodId) {
    if (!periodId) return true;
    const { data, error } = await supabase.from('periods').select('status, is_blocked').eq('id', periodId);
    if (error || !data || !data.length) return false;
    return data[0].status === 'open' && !data[0].is_blocked;
  },

  async isCurrentPeriodOpen() {
    const period = await this.getActivePeriod();
    return period && period.status === 'open' && !period.is_blocked;
  },

  async checkWriteAccess(periodId) {
    const yearOpen = await this.isYearOpen();
    if (!yearOpen) {
      return { allowed: false, reason: 'El Año Escolar está cerrado. No se pueden realizar modificaciones.' };
    }
    if (periodId) {
      const periodOpen = await this.isPeriodOpen(periodId);
      if (!periodOpen) {
        return { allowed: false, reason: 'El Período está cerrado o bloqueado. No se pueden realizar modificaciones.' };
      }
    }
    return { allowed: true };
  },

  async getReadOnlyBanner() {
    const year = await this.getCurrentYear();
    const period = await this.getActivePeriod();

    if (!year) {
      return '<div class="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 flex items-center gap-3"><i data-lucide="alert-triangle" class="w-5 h-5 text-amber-600 shrink-0"></i><div><p class="text-sm font-bold text-amber-800">No hay Año Escolar configurado</p><p class="text-xs text-amber-600">Configura un Año Escolar en Ciclo Escolar para poder registrar datos.</p></div></div>';
    }

    if (year.status === 'closed') {
      return '<div class="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 mb-4 flex items-center gap-3"><i data-lucide="lock" class="w-5 h-5 text-rose-600 shrink-0"></i><div><p class="text-sm font-bold text-rose-800">Año Escolar Cerrado — Solo Lectura</p><p class="text-xs text-rose-600">Este año escolar ha sido cerrado. Todos los registros están en modo lectura.</p></div></div>';
    }

    if (period && (period.status === 'closed' || period.is_blocked)) {
      return `<div class="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 flex items-center gap-3"><i data-lucide="lock" class="w-5 h-5 text-amber-600 shrink-0"></i><div><p class="text-sm font-bold text-amber-800">Período "${period.name}" Cerrado — Solo Lectura</p><p class="text-xs text-amber-600">Este período ha sido cerrado. Las ediciones no están permitidas.</p></div></div>`;
    }

    return '';
  },

  /**
   * Filtro PostgREST de `student_preregistrations` para un año escolar.
   *
   * Sin este filtro, el badge del sidebar, la sección de Inscripciones y el
   * módulo de Ciclo Escolar contaban registros de TODOS los años y el año
   * escolar activo no "recibía" sus preinscripciones.
   *
   * Reglas del filtro:
   *  - Filas nuevas: `school_year_id` = año activo.
   *  - Filas antiguas (insertadas antes de guardar el id): `school_year_id`
   *    NULL y `school_year_requested` = nombre del año.
   *  - Si no hay año configurado devuelve `null` = sin filtro (sin cambios).
   *
   * @param {object|null} year Año escolar a filtrar. Por defecto el activo.
   * @returns {Promise<string|null>} Cadena para `.or(...)` o null.
   */
  async preregistrationFilter(year = null) {
    const y = year && year.id ? year : await this.getCurrentYear();
    if (!y || !y.id) return null;
    const id = Number(y.id);
    if (!Number.isFinite(id)) return null;
    const name = String(y.name || '').replace(/["',]/g, '');
    return `school_year_id.eq.${id},and(school_year_id.is.null,school_year_requested.eq."${name}")`;
  },

  async countPendingPreregistrations(year = null) {
    const yearFilter = await this.preregistrationFilter(year);
    const base = () => supabase
      .from('student_preregistrations')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');

    if (!yearFilter) {
      const { count = 0, error } = await base();
      if (error) throw error;
      return count;
    }

    let res = await base().or(yearFilter);
    // Si la BD todavía no tiene la columna `school_year_id`, se cae al conteo
    // sin filtro: el badge nunca debe desaparecer por un problema de esquema.
    if (res.error && /school_year_id/i.test(String(res.error.message || ''))) res = await base();
    if (res.error) throw res.error;
    return res.count || 0;
  },

  invalidateCache() {
    _cachedYear = null;
    _cachedPeriod = null;
  },

  async applyBodyClass() {
    const year = await this.getCurrentYear();
    const period = await this.getActivePeriod();
    document.body.classList.remove('year-closed', 'period-closed');
    if (year && year.status === 'closed') {
      document.body.classList.add('year-closed');
    } else if (period && (period.status === 'closed' || period.is_blocked)) {
      document.body.classList.add('period-closed');
    }
  }
};
