/**
 * Routine Catalog — Arquitectura V8
 * Acceso centralizado al catálogo de eventos de rutina en la BD:
 *   routine_categories · routine_events · classroom_routine_settings
 *   classroom_schedule_blocks · classroom_schedule_block_events
 *
 * Diseño:
 *  - Todo es aditivo: si las tablas no existen o la consulta falla, se devuelve
 *    null/[] para que los llamadores usen sus constantes hardcodeadas (fallback).
 *  - Caché en memoria con TTL; se puede forzar recarga.
 *  - Sin RLS especial: staff puede leer todo; padres solo categorías/eventos
 *    (políticas de lectura para auth.role() = 'authenticated').
 */
import { supabase } from './supabase.js';

const TTL = 5 * 60 * 1000;

let _catalog = null;
let _catalogTs = 0;
let _pending = null;

async function _fetchCatalog() {
  const [categoriesRes, eventsRes] = await Promise.all([
    supabase
      .from('routine_categories')
      .select('id, name, emoji, color, sort_order, is_active')
      .order('sort_order'),
    supabase
      .from('routine_events')
      .select('*')
      .order('sort_order'),
  ]);

  if (categoriesRes.error) throw categoriesRes.error;
  if (eventsRes.error) throw eventsRes.error;

  return { categories: categoriesRes.data || [], events: eventsRes.data || [] };
}

export const RoutineCatalog = {
  /** Devuelve { categories, events } del catálogo o null si no está disponible. */
  async load(force = false) {
    if (_catalog && !force && Date.now() - _catalogTs < TTL) return _catalog;
    if (_pending) {
      try { return await _pending; } catch { return _catalog; }
    }
    _pending = _fetchCatalog()
      .then((data) => {
        _catalog = data;
        _catalogTs = Date.now();
        return data;
      })
      .finally(() => { _pending = null; });
    try {
      return await _pending;
    } catch {
      return _catalog;
    }
  },

  invalidate() {
    _catalog = null;
    _catalogTs = 0;
  },

  /** Busca un evento del catálogo por legacy_key o por (categoría, nombre). */
  async findEvent({ legacyKey, category, name }) {
    const cat = await this.load();
    if (!cat) return null;
    if (legacyKey) {
      const hit = cat.events.find((e) => e.legacy_key === legacyKey);
      if (hit) return hit;
    }
    if (category && name) {
      const c = cat.categories.find((x) => x.name === category);
      if (c) return cat.events.find((e) => e.category_id === c.id && e.name === name) || null;
    }
    return null;
  },

  /** Eventos activos de un aula (desde classroom_routine_settings). */
  async getClassroomEvents(classroomId) {
    if (!classroomId) return [];
    const cat = await this.load();
    if (!cat) return [];

    const { data: settings, error } = await supabase
      .from('classroom_routine_settings')
      .select('event_id, is_active, sort_order')
      .eq('classroom_id', classroomId)
      .order('sort_order');

    if (error) return [];
    const activeIds = new Set((settings || []).filter((s) => s.is_active).map((s) => s.event_id));
    return cat.events.filter((e) => activeIds.has(e.id));
  },

  /**
   * Cronología de un aula: bloques con sus eventos del catálogo.
   * Devuelve [{ ...block, events: [event, ...] }] o [] si no hay / falla.
   */
  async getScheduleBlocks(classroomId) {
    if (!classroomId) return [];

    const { data: blocks, error: blocksError } = await supabase
      .from('classroom_schedule_blocks')
      .select('id, days, start_time, duration_min, label, emoji, color, sort_order, is_active')
      .eq('classroom_id', classroomId)
      .eq('is_active', true)
      .order('sort_order');

    if (blocksError || !blocks || blocks.length === 0) return [];

    const { data: links, error: linksError } = await supabase
      .from('classroom_schedule_block_events')
      .select('block_id, event_id, sort_order');

    if (linksError) return [];

    const cat = await this.load();
    const eventById = cat ? new Map(cat.events.map((e) => [e.id, e])) : new Map();

    return blocks.map((b) => ({
      id: b.id,
      days: b.days || [1, 2, 3, 4, 5, 6],
      start_time: b.start_time,
      duration_min: b.duration_min,
      label: b.label,
      emoji: b.emoji,
      color: b.color,
      sort_order: b.sort_order,
      events: (links || [])
        .filter((l) => l.block_id === b.id)
        .sort((a, z) => a.sort_order - z.sort_order)
        .map((l) => eventById.get(l.event_id))
        .filter(Boolean),
    }));
  },

  /**
   * Deriva el type/subtype legacy que el frontend (maestra y panel de padres)
   * espera en daily_logs.infant_data, a partir del legacy_key del catálogo.
   * Devuelve { type, subtype } o null si el evento no aplica a infant_data.
   */
  resolveLegacyType(event) {
    if (!event || !event.legacy_key) return null;
    const k = event.legacy_key;
    if (k.startsWith('mood:')) return null;              // se guarda en daily_logs.mood
    if (k.startsWith('food:')) return null;              // se guarda en daily_logs.food
    if (k.startsWith('group:')) return null;             // colectivo de sala
    if (k === 'photo') return null;                      // requiere adjunto

    const map = {
      'infant:temp': { type: 'temp' },
      'infant:med': { type: 'med' },
      'infant:diaper:wet': { type: 'diaper', subtype: 'wet' },
      'infant:diaper:soiled': { type: 'diaper', subtype: 'soiled' },
      'infant:diaper_change': { type: 'diaper_change' },
      'infant:bath': { type: 'bath' },
      'infant:toilet': { type: 'bath' },
      'infant:sleep': { type: 'sleep' },
      'infant:sleep_end': { type: 'sleep' },
      'infant:handwash': { type: 'handwash' },
      'infant:toothbrush': { type: 'toothbrush' },
      'infant:activity': { type: 'activity' },
      'infant:sensorial': { type: 'activity' },
      'infant:playground': { type: 'playground' },
      'infant:welcome_song': { type: 'welcome_song' },
      'infant:milk': { type: 'milk' },
      'infant:water': { type: 'milk', subtype: 'water' },
      'incident:fever': { type: 'incident', subtype: 'fever' },
      'incident:hit': { type: 'incident', subtype: 'hit' },
      'incident:parent_call': { type: 'incident', subtype: 'parent_call' },
      'incident:accident': { type: 'incident', subtype: 'accident' },
      'health:vomit': { type: 'health', subtype: 'vomit' },
      'health:cough': { type: 'health', subtype: 'cough' },
    };
    return map[k] || null;
  },

  /**
   * Genera la rejilla matricial de Horario Semanal con la estética de IMG-20261013-WA0067.jpg
   */
  renderWeeklyScheduleGrid({ isTeacher = false, customBlocks = null } = {}) {
    const d = new Date();
    const currentDay = d.getDay(); // 0: Sun, 1: Mon, ..., 5: Fri, 6: Sat
    const nowMin = d.getHours() * 60 + d.getMinutes();

    let matrix = [
      {
        time: '8:00 a 8:45',
        startMin: 8 * 60,
        endMin: 8 * 60 + 45,
        pillStyle: 'background-color:#EDE9FE; color:#5B21B6; border:1.5px solid #DDD6FE;',
        mon: { label: 'Encuentro de grupo', eventId: 'welcome' },
        tue: { label: 'Encuentro de grupo', eventId: 'welcome' },
        wed: { label: 'Encuentro de grupo', eventId: 'welcome' },
        thu: { label: 'Encuentro de grupo', eventId: 'welcome' },
        fri: { label: 'Encuentro de grupo', eventId: 'welcome' }
      },
      {
        time: '8:45 a 9:30',
        startMin: 8 * 60 + 45,
        endMin: 9 * 60 + 30,
        pillStyle: 'background-color:#DCFCE7; color:#15803D; border:1.5px solid #BBF7D0;',
        mon: { label: 'Tiempo montessori', eventId: 'activity' },
        tue: { label: 'Tiempo montessori', eventId: 'activity' },
        wed: { label: 'Tiempo montessori', eventId: 'activity' },
        thu: { label: 'Tiempo montessori', eventId: 'activity' },
        fri: { label: 'Tiempo montessori', eventId: 'activity' }
      },
      {
        time: '9:30 a 10:30',
        startMin: 9 * 60 + 30,
        endMin: 10 * 60 + 30,
        pillStyle: 'background-color:#E0F2FE; color:#0369A1; border:1.5px solid #BAE6FD;',
        mon: { label: 'Desayuno y Recreo.', eventId: 'breakfast' },
        tue: { label: 'Desayuno y Recreo.', eventId: 'breakfast' },
        wed: { label: 'Desayuno y Recreo.', eventId: 'breakfast' },
        thu: { label: 'Desayuno y Recreo.', eventId: 'breakfast' },
        fri: { label: 'Desayuno y Recreo.', eventId: 'breakfast' }
      },
      {
        time: '10:30-11:15',
        startMin: 10 * 60 + 30,
        endMin: 11 * 60 + 15,
        mon: { label: 'Juego trabajo', eventId: 'activity', pillStyle: 'background-color:#FEF3C7; color:#B45309; border:1.5px solid #FDE68A;' },
        tue: { label: 'Expresión Plástica', eventId: 'activity', pillStyle: 'background-color:#FCE7F3; color:#BE185D; border:1.5px solid #FBCFE8;' },
        wed: { label: 'Taller de musica', eventId: 'activity', pillStyle: 'background-color:#FEF3C7; color:#B45309; border:1.5px solid #FDE68A;' },
        thu: { label: 'Taller de psicomotricidad', eventId: 'activity', pillStyle: 'background-color:#FCE7F3; color:#BE185D; border:1.5px solid #FBCFE8;' },
        fri: { label: 'Juego trabajo', eventId: 'activity', pillStyle: 'background-color:#FEF3C7; color:#B45309; border:1.5px solid #FDE68A;' }
      },
      {
        time: '11:15-12:00',
        startMin: 11 * 60 + 15,
        endMin: 12 * 60,
        pillStyle: 'background-color:#DCFCE7; color:#15803D; border:1.5px solid #BBF7D0;',
        mon: { label: 'Tema del dia', eventId: 'activity' },
        tue: { label: 'Tema del dia', eventId: 'activity' },
        wed: { label: 'Tema del dia', eventId: 'activity' },
        thu: { label: 'Tema del dia', eventId: 'activity' },
        fri: { label: 'Tema del dia', eventId: 'activity' }
      },
      {
        time: '12:30-1:15',
        startMin: 12 * 60 + 30,
        endMin: 13 * 60 + 15,
        pillStyle: 'background-color:#E0F2FE; color:#0369A1; border:1.5px solid #BAE6FD;',
        mon: { label: 'Lecto Escritura Pre-primario', eventId: 'activity' },
        tue: { label: 'Lecto Escritura Pre-primario', eventId: 'activity' },
        wed: { label: 'Lecto Escritura Pre-primario', eventId: 'activity' },
        thu: { label: 'Lecto Escritura Pre-primario', eventId: 'activity' },
        fri: { label: 'Lecto Escritura Pre-primario', eventId: 'activity' }
      }
    ];

    if (Array.isArray(customBlocks) && customBlocks.length > 0) {
      matrix = customBlocks.map(b => {
        const startM = b.startTime ? (parseInt(b.startTime.split(':')[0]) * 60 + parseInt(b.startTime.split(':')[1] || 0)) : 480;
        const endM = startM + (b.duration || 45);
        const cell = { label: b.label || 'Actividad', eventId: b.groupEventId || b.id || 'activity' };
        return {
          time: `${b.startTime || '08:00'} (${b.duration || 30}m)`,
          startMin: startM,
          endMin: endM,
          pillStyle: b.color ? `background-color:${b.color}22; color:${b.color}; border:1.5px solid ${b.color}55;` : 'background-color:#EDE9FE; color:#5B21B6; border:1.5px solid #DDD6FE;',
          mon: cell, tue: cell, wed: cell, thu: cell, fri: cell
        };
      });
    }

    const days = [
      { key: 'mon', dayNum: 1, label: 'Lun.', bg: '#7C3AED' },
      { key: 'tue', dayNum: 2, label: 'Mar.', bg: '#2563EB' },
      { key: 'wed', dayNum: 3, label: 'Mié.', bg: '#16A34A' },
      { key: 'thu', dayNum: 4, label: 'Jue.', bg: '#D97706' },
      { key: 'fri', dayNum: 5, label: 'Vie.', bg: '#E11D48' }
    ];

    return `
      <div style="background-color:#FFFDF7; border:2px solid #F1E8D0; border-radius:24px; padding:16px; box-shadow:0 10px 25px -5px rgba(0,0,0,0.05); margin:12px 0; font-family:Nunito, sans-serif;">
        <!-- Header Banner -->
        <div style="display:flex; align-items:center; justify-content:space-between; border-bottom:2px dashed #E2D8C0; padding-bottom:12px; margin-bottom:16px;">
          <div>
            <div style="display:flex; align-items:center; gap:8px;">
              <h2 style="font-size:20px; font-weight:900; color:#1E3A8A; margin:0; line-height:1.2;">Horario - Rutina diaria ☀️</h2>
            </div>
            <div style="display:flex; align-items:center; gap:8px; margin-top:6px;">
              <span style="background-color:#FCE7F3; color:#BE185D; border:1px solid #FBCFE8; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:800;">
                Hora de inicio: 8:00 AM
              </span>
              <span style="font-size:11px; font-weight:700; color:#64748B;">· Colegio Montessori Sonrisas Creativas</span>
            </div>
          </div>
          <div>
            <span style="background-color:${isTeacher ? '#DCFCE7' : '#E8F2FF'}; color:${isTeacher ? '#15803D' : '#0B63C7'}; border:1px solid ${isTeacher ? '#BBF7D0' : '#0B63C733'}; padding:6px 12px; border-radius:12px; font-size:11px; font-weight:900;">
              ${isTeacher ? 'Modo Ejecución Maestra' : 'Vista Padres'}
            </span>
          </div>
        </div>

        <!-- Table Container -->
        <div style="overflow-x:auto; border-radius:16px; border:2px solid #E2D8C0; background-color:#FFFFFF;">
          <table style="width:100%; border-collapse:collapse; text-align:center; min-width:600px;">
            <thead>
              <tr>
                <th style="background-color:#DB2777; color:#FFFFFF; padding:10px; font-weight:900; font-size:12px; text-transform:uppercase; width:100px; border-right:1px solid #BE185D;">
                  Hora
                </th>
                ${days.map(d => {
                  const isToday = currentDay === d.dayNum;
                  return `
                    <th style="background-color:${d.bg}; color:#FFFFFF; padding:10px; font-weight:900; font-size:13px; text-transform:uppercase; border-right:1px solid rgba(255,255,255,0.2);">
                      <div style="display:flex; align-items:center; justify-content:center; gap:4px;">
                        <span>${d.label}</span>
                        ${isToday ? `<span style="background-color:#FCD34D; color:#78350F; padding:2px 6px; border-radius:10px; font-size:9px; font-weight:900;">HOY</span>` : ''}
                      </div>
                    </th>
                  `;
                }).join('')}
              </tr>
            </thead>
            <tbody>
              ${matrix.map(row => {
                const isCurrentTimeSlot = nowMin >= row.startMin && nowMin < row.endMin;

                return `
                  <tr style="border-top:1px solid #F1E8D0;">
                    <td style="background-color:#EEF2FF; color:#4338CA; padding:10px 6px; font-weight:900; font-size:11px; border-right:1px solid #C7D2FE;">
                      <div style="display:flex; flex-direction:column; align-items:center; justify-content:center;">
                        <span>${row.time}</span>
                        ${isCurrentTimeSlot ? `<span style="background-color:#4338CA; color:#FFFFFF; padding:1px 5px; border-radius:8px; font-size:8px; font-weight:900; margin-top:2px;">AHORA</span>` : ''}
                      </div>
                    </td>

                    ${days.map(d => {
                      const isToday = currentDay === d.dayNum;
                      const cellData = row[d.key] || { label: '—' };
                      const cellPillStyle = cellData.pillStyle || row.pillStyle || 'background-color:#F1F5F9; color:#334155; border:1px solid #E2E8F0;';

                      return `
                        <td style="padding:6px; border-right:1px solid #F1E8D0; background-color:${isToday ? '#FFFBEB' : 'transparent'};">
                          <div
                            ${isTeacher && cellData.eventId ? `onclick="App.routineQuickGroup('${cellData.eventId}')"` : ''}
                            style="${cellPillStyle} border-radius:14px; padding:8px 6px; font-weight:800; font-size:11px; line-height:1.2; ${isTeacher ? 'cursor:pointer;' : ''}"
                            title="${cellData.label}"
                          >
                            <div>${cellData.label}</div>
                            ${isTeacher ? `<div style="font-size:8px; font-weight:700; opacity:0.75; margin-top:2px; text-transform:uppercase;">Toca p/ marcar</div>` : ''}
                          </div>
                        </td>
                      `;
                    }).join('')}
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>

        <!-- Footer Accents -->
        <div style="display:flex; align-items:center; justify-content:space-between; border-top:2px dashed #E2D8C0; padding-top:10px; margin-top:12px;">
          <div style="display:flex; align-items:center; gap:4px;">
            <span style="font-size:20px;">👧</span>
            <span>💖</span>
          </div>
          <div style="display:flex; align-items:center; gap:8px; font-size:12px;">
            <span>💖</span>
            <span style="border-bottom:2px dashed #FCD34D; width:80px; display:inline-block;"></span>
            <span>💚</span>
            <span style="border-bottom:2px dashed #38BDF8; width:80px; display:inline-block;"></span>
            <span>💙</span>
          </div>
          <div style="display:flex; align-items:center; gap:4px;">
            <span>💙</span>
            <span style="font-size:20px;">👦</span>
          </div>
        </div>
      </div>
    `;
  },
};

export default RoutineCatalog;
