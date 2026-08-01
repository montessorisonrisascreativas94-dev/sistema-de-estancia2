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
};

export default RoutineCatalog;
