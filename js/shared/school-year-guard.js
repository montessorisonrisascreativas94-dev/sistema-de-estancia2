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
    const { data } = await supabase.from('periods').select('*').eq('is_active', true).single();
    _cachedPeriod = data ? { ...data, _ts: Date.now() } : null;
    return _cachedPeriod;
  },

  async isYearOpen() {
    const year = await this.getCurrentYear();
    return year && year.status !== 'closed';
  },

  async isPeriodOpen(periodId) {
    if (!periodId) return true;
    const { data } = await supabase.from('periods').select('status, is_blocked').eq('id', periodId).single();
    return data && data.status === 'open' && !data.is_blocked;
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
