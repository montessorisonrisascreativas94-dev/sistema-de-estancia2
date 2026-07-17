/**
 * TeacherEfficiencyModule — Panel Encargada
 * Usa AppState + supabase importados correctamente.
 * NO usa window.EncargadaAppState (no existe).
 */
import { supabase } from '../../shared/supabase.js';
import { AppState } from '../state.js';
import { Helpers } from '../../shared/helpers.js';

export const TeacherEfficiencyModule = {
  charts: {},

  async init() {
    await this.load();
  },

  async load() {
    const container = document.getElementById('eficienciaContent');
    if (!container) return;
    container.innerHTML = '<div class="p-6 text-center"><div class="animate-spin w-6 h-6 border-2 border-[#FF7A00] border-t-transparent rounded-full mx-auto"></div></div>';

    try {
      // Cargar maestras reales desde Supabase
      const { data: teachers, error } = await supabase
        .from('profiles')
        .select('id, name, role, is_active, avatar_url')
        .in('role', ['maestra', 'asistente'])
        .eq('is_active', true)
        .order('name');

      if (error) throw error;

      const list = (teachers || []).map((t, i) => ({
        id:           t.id,
        name:         t.name || 'Sin nombre',
        role:         t.role,
        efficiency:   Math.max(70, 98 - i * 4),   // placeholder hasta tener tabla de métricas
        punctuality:  Math.max(72, 99 - i * 3),
        attendance:   Math.max(75, 100 - i * 2),
        reports:      Math.max(68, 96 - i * 5),
        parentRating: Math.max(70, 97 - i * 4)
      }));

      // Guardar en estado usando la clave correcta (teachers.all)
      AppState.set('teachers', { ...AppState.get('teachers'), all: teachers || [] });

      if (!list.length) {
        container.innerHTML = `
          <div class="p-10 text-center text-slate-400">
            <div class="w-16 h-16 rounded-2xl bg-slate-100 mx-auto mb-4 flex items-center justify-center">
              <i data-lucide="users" class="w-8 h-8 text-slate-300"></i>
            </div>
            <p class="font-bold">No hay maestras registradas aún</p>
          </div>`;
        if (window.lucide) lucide.createIcons();
        return;
      }

      container.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          ${list.map(t => this._cardHTML(t)).join('')}
        </div>`;
      if (window.lucide) lucide.createIcons();

    } catch (e) {
      console.error('[TeacherEfficiency]', e);
      container.innerHTML = `<p class="text-rose-500 p-4">Error al cargar: ${Helpers.escapeHTML(e.message)}</p>`;
    }
  },

  _cardHTML(t) {
    const badge = t.efficiency >= 90 ? ['bg-emerald-100 text-emerald-800', 'Excelente'] :
                  t.efficiency >= 80 ? ['bg-blue-100 text-blue-800',    'Muy Bueno'] :
                  t.efficiency >= 70 ? ['bg-amber-100 text-amber-800',  'Aceptable'] :
                                       ['bg-rose-100 text-rose-800',    'Mejorar'];
    const bar = (pct, color) => `
      <div class="w-full bg-slate-100 rounded-full h-2">
        <div class="h-2 rounded-full transition-all" style="width:${pct}%;background:${color}"></div>
      </div>`;
    const row = (label, pct) => {
      const color = pct >= 90 ? '#28B54D' : pct >= 70 ? '#FF7A00' : '#ef4444';
      return `<div>
        <div class="flex justify-between text-xs mb-1">
          <span class="text-slate-500">${label}</span>
          <span class="font-bold" style="color:${color}">${pct}%</span>
        </div>${bar(pct, color)}</div>`;
    };
    const initial = (t.name || 'M').charAt(0).toUpperCase();
    return `
      <div class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm hover:shadow-md transition-all">
        <div class="flex items-center gap-3 mb-4">
          <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-[#FF7A00]/20 to-[#FF7A00]/10 flex items-center justify-center text-xl font-black text-[#FF7A00]">${initial}</div>
          <div class="flex-1 min-w-0">
            <h4 class="font-bold text-slate-800 truncate">${Helpers.escapeHTML(t.name)}</h4>
            <span class="text-[10px] font-black uppercase tracking-wider text-slate-400">${t.role}</span>
          </div>
          <div class="flex flex-col items-end gap-1">
            <span class="text-2xl font-black text-[#FF7A00]">${t.efficiency}</span>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-black ${badge[0]}">${badge[1]}</span>
          </div>
        </div>
        <div class="space-y-2.5">
          ${row('Puntualidad', t.punctuality)}
          ${row('Asistencia',  t.attendance)}
          ${row('Reportes',    t.reports)}
          ${row('Valoración Padres', t.parentRating)}
        </div>
      </div>`;
  }
};
