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

  _since(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().split('T')[0];
  },

  async load() {
    const container = document.getElementById('eficienciaContent');
    if (!container) return;
    container.innerHTML = '<div class="p-6 text-center"><div class="animate-spin w-6 h-6 border-2 border-[#6366F1] border-t-transparent rounded-full mx-auto"></div></div>';

    try {
      // Cargar maestras reales desde Supabase
      const { data: teachers, error } = await supabase
        .from('profiles')
        .select('id, name, role, is_active, avatar_url')
        .in('role', ['maestra'])
        .eq('is_active', true)
        .order('name');

      if (error) throw error;

      // Datos reales para calcular métricas por maestra
      const [classroomsRes, postsRes, ratingsRes, attendanceRes] = await Promise.allSettled([
        supabase.from('classrooms').select('id, name, teacher_id').is('deleted_at', null),
        supabase.from('posts').select('id, teacher_id, media_url'),
        supabase.from('parent_ratings').select('teacher_id, rating'),
        supabase.from('attendance').select('classroom_id, status').gte('date', this._since(30))
      ]);

      const classrooms = classroomsRes.status === 'fulfilled' ? (classroomsRes.value.data || []) : [];
      const posts = postsRes.status === 'fulfilled' ? (postsRes.value.data || []) : [];
      const ratings = ratingsRes.status === 'fulfilled' ? (ratingsRes.value.data || []) : [];
      const attendance = attendanceRes.status === 'fulfilled' ? (attendanceRes.value.data || []) : [];

      // Agrupar aulas por maestra
      const roomsByTeacher = new Map();
      classrooms.forEach(c => {
        if (!c.teacher_id) return;
        if (!roomsByTeacher.has(c.teacher_id)) roomsByTeacher.set(c.teacher_id, []);
        roomsByTeacher.get(c.teacher_id).push(c.id);
      });

      // Publicaciones por maestra
      const postsByTeacher = new Map();
      posts.forEach(p => {
        if (!p.teacher_id) return;
        postsByTeacher.set(p.teacher_id, (postsByTeacher.get(p.teacher_id) || 0) + 1);
      });

      // Valoración de padres por maestra
      const ratingAgg = new Map();
      ratings.forEach(r => {
        if (!r.teacher_id) return;
        const agg = ratingAgg.get(r.teacher_id) || { sum: 0, n: 0 };
        agg.sum += (r.rating || 0); agg.n += 1;
        ratingAgg.set(r.teacher_id, agg);
      });

      // Asistencia / puntualidad por aula
      const attByRoom = new Map();
      attendance.forEach(a => {
        if (a.classroom_id == null) return;
        const agg = attByRoom.get(a.classroom_id) || { total: 0, present: 0 };
        agg.total += 1;
        if (a.status === 'present') agg.present += 1;
        attByRoom.set(a.classroom_id, agg);
      });

      const list = (teachers || []).map((t) => {
        const rooms = roomsByTeacher.get(t.id) || [];
        let attTotal = 0, attPresent = 0;
        rooms.forEach(rid => {
          const agg = attByRoom.get(rid);
          if (agg) { attTotal += agg.total; attPresent += agg.present; }
        });

        const attendancePct = attTotal > 0 ? Math.round((attPresent / attTotal) * 100) : 0;
        const punctualityPct = attendancePct;
        const reports = postsByTeacher.get(t.id) || 0;
        const rAgg = ratingAgg.get(t.id);
        const parentRating = rAgg && rAgg.n > 0 ? Math.round((rAgg.sum / rAgg.n) * 20) : 0;

        // Índice compuesto solo con dimensiones que tienen datos reales.
        const parts = [];
        if (attTotal > 0) parts.push(attendancePct);
        if (rAgg && rAgg.n > 0) parts.push(parentRating);
        const efficiency = parts.length ? Math.round(parts.reduce((s, v) => s + v, 0) / parts.length) : 0;

        return {
          id:           t.id,
          name:         t.name || 'Sin nombre',
          role:         t.role,
          efficiency,
          punctuality:  punctualityPct,
          attendance:   attendancePct,
          reports:      Math.min(reports * 10, 100),
          parentRating
        };
      });

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
      const color = pct >= 90 ? '#28B54D' : pct >= 70 ? '#6366F1' : '#ef4444';
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
          <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-[#6366F1]/20 to-[#6366F1]/10 flex items-center justify-center text-xl font-black text-[#6366F1]">${initial}</div>
          <div class="flex-1 min-w-0">
            <h4 class="font-bold text-slate-800 truncate">${Helpers.escapeHTML(t.name)}</h4>
            <span class="text-[10px] font-black uppercase tracking-wider text-slate-400">${t.role}</span>
          </div>
          <div class="flex flex-col items-end gap-1">
            <span class="text-2xl font-black text-[#6366F1]">${t.efficiency}</span>
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
