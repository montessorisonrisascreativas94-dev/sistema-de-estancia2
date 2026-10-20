/**
 * Áreas de aprendizaje POR AULA (eval_areas.classroom_id).
 *
 * Antes, `eval_areas` era global por evaluación: cuando dos aulas tenían
 * planes distintos, la sincronización de una pisaba las áreas de la otra
 * y la maestra no veía las áreas colocadas por la directora en SU aula.
 *
 * Este módulo centraliza:
 *  - detección de soporte de la columna `eval_areas.classroom_id`;
 *  - auto-aplicación de la migración (solo directora/admin vía
 *    `public.run_ddl_migration`);
 *  - lectura de áreas del aula con fallback global (BD sin migrar);
 *  - sincronización de la configuración por aula (JSON
 *    `scale_config.classroom_configs`) hacia `eval_areas` + `eval_modules`,
 *    adoptando las áreas globales legacy por nombre para conservar notas.
 */
import { supabase } from './supabase.js';

let _scopeSupport = null; // true | false | null (sin sondear)
let _migrationAttempted = false;

/**
 * Evaluación/boletín vigente: prefiere el del año escolar actual para que
 * directora y maestra trabajen SIEMPRE sobre el mismo boletín (antes cada
 * panel tomaba "la más reciente" y podían divergir).
 */
export async function fetchActiveEvaluation() {
  try {
    let yearId = null;
    try {
      const { data: year } = await supabase.from('school_years')
        .select('id').eq('is_current', true).maybeSingle();
      yearId = year?.id || null;
    } catch (_) {}
    if (yearId != null) {
      const { data: yearEval } = await supabase.from('eval_evaluations')
        .select('*').is('deleted_at', null).eq('school_year_id', yearId)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (yearEval) return yearEval;
    }
    const { data: latest } = await supabase.from('eval_evaluations')
      .select('*').is('deleted_at', null)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    return latest || null;
  } catch (_) { return null; }
}

/** ¿Existe eval_areas.classroom_id en la BD? (cacheado por sesión) */
export async function supportsAreaClassroomScope() {
  if (_scopeSupport !== null) return _scopeSupport;
  try {
    const { error } = await supabase.from('eval_areas').select('classroom_id').limit(1);
    _scopeSupport = !error;
  } catch (_) { _scopeSupport = false; }
  return _scopeSupport;
}

export function resetAreaScopeCache() { _scopeSupport = null; _migrationAttempted = false; }

/**
 * Intenta crear eval_areas.classroom_id desde el cliente usando la RPC
 * `run_ddl_migration` (solo directora/admin). Devuelve true si la BD
 * quedó con soporte de áreas por aula.
 */
export async function tryApplyAreaScopeMigration() {
  if (await supportsAreaClassroomScope()) return true;
  if (_migrationAttempted) return false;
  _migrationAttempted = true;
  try {
    const { error } = await supabase.rpc('run_ddl_migration', {
      ddl: 'ALTER TABLE public.eval_areas ADD COLUMN IF NOT EXISTS classroom_id bigint REFERENCES public.classrooms(id) ON DELETE SET NULL; ' +
           'CREATE INDEX IF NOT EXISTS idx_eval_areas_eval_classroom ON public.eval_areas(evaluation_id, classroom_id);'
    });
    if (error) return false;
    resetAreaScopeCache();
    return await supportsAreaClassroomScope();
  } catch (_) { return false; }
}

/** Campos extra para INSERT de áreas según soporte (`{}` en BD sin migrar). */
export async function areaScopeInsertFields(classroomId) {
  if (classroomId == null) return {};
  return (await supportsAreaClassroomScope()) ? { classroom_id: classroomId } : {};
}

/**
 * Áreas de una aula. Si el aula tiene áreas propias esas se devuelven;
 * si aún no, se cae a las áreas globales legacy (classroom_id NULL).
 */
export async function fetchClassroomAreas(evaluationId, classroomId) {
  let q = supabase.from('eval_areas').select('*')
    .eq('evaluation_id', evaluationId)
    .is('deleted_at', null)
    .order('sort_order').order('created_at');
  if (await supportsAreaClassroomScope() && classroomId != null) {
    q = q.or(`classroom_id.eq.${classroomId},classroom_id.is.null`);
  }
  const { data, error } = await q;
  if (error) return [];
  const rows = data || [];
  if (classroomId == null) return rows.filter(r => r.classroom_id == null);
  const own = rows.filter(r => r.classroom_id != null && String(r.classroom_id) === String(classroomId));
  if (own.length) return own;
  return rows.filter(r => r.classroom_id == null); // legacy global
}

/**
 * Sincroniza la config del aula (áreas del JSON de la directora) hacia
 * eval_areas + eval_modules. Devuelve { areas, usedModulesByArea, desired }
 * el mismo contrato que usaba GradebookGrid._syncAreaConfig.
 *
 * Con soporte por aula:
 *  - mergea SOLO contra las áreas del propio aula (nunca contra las de otra);
 *  - adopta áreas globales legacy por nombre (se les asigna classroom_id)
 *    para conservar módulos, actividades y notas existentes;
 *  - crea áreas nuevas con classroom_id del aula.
 */
export async function syncClassroomAreas({ evaluationId, classroomId, desiredAreas, periodId, uid }) {
  const desired = Array.isArray(desiredAreas) ? desiredAreas : [];
  const scoped = await supportsAreaClassroomScope() && classroomId != null;

  // Áreas actuales del aula (o globales en modo legacy)
  let currAreas = await fetchClassroomAreas(evaluationId, classroomId);
  if (!desired.length) {
    const { data: mods } = await supabase.from('eval_modules')
      .select('*').eq('period_id', periodId).is('deleted_at', null)
      .order('sort_order').order('created_at');
    const modules = mods || [];
    const usedModulesByArea = currAreas.map(a =>
      modules.filter(m => m.area_id === a.id).sort((x, y) => (x.sort_order ?? 0) - (y.sort_order ?? 0)));
    return { areas: currAreas, usedModulesByArea, desired: [] };
  }

  const finalAreas = [];
  for (let i = 0; i < desired.length; i++) {
    const d = desired[i];
    const name = String(d.name || '').trim();
    const same = (a) => name && a.name && a.name.toLowerCase() === name.toLowerCase();

    // 1) Área ya propia de ESTA aula
    let area = currAreas.find(a => a.classroom_id != null && same(a));

    // 2) Adoptar área global legacy con el mismo nombre (scoped). Así el
    //    aula se queda con ella y otra aula con el mismo nombre crea la
    //    suya en vez de compartir/robar.
    if (!area && scoped && name) {
      const { data: legacy } = await supabase.from('eval_areas').select('*')
        .eq('evaluation_id', evaluationId).is('deleted_at', null).is('classroom_id', null)
        .eq('name', name).limit(1).maybeSingle();
      if (legacy) {
        const { data: adopted } = await supabase.from('eval_areas')
          .update({ classroom_id: classroomId }).eq('id', legacy.id).select().maybeSingle();
        if (adopted) {
          area = adopted;
          currAreas.push(adopted);
        }
      }
    }

    // 3) Modo legacy (BD sin classroom_id): emparejar por nombre o posición
    if (!area && !scoped) {
      area = currAreas.find(same) || currAreas.find(a => Number(a.sort_order) === i);
    }

    if (!area) {
      const { data: created, error } = await supabase.from('eval_areas').insert({
        evaluation_id: evaluationId,
        name: name || `Área ${i + 1}`,
        weight: Number(d.weight) || 0,
        color: d.color || '#6366F1',
        sort_order: i,
        created_by: uid,
        ...(await areaScopeInsertFields(classroomId))
      }).select().maybeSingle();
      if (!error && created) {
        area = created;
        currAreas.push(created);
      }
    } else {
      const patch = {};
      if (Number(area.weight) !== Number(d.weight)) patch.weight = Number(d.weight) || 0;
      if (area.color !== d.color) patch.color = d.color || '#6366F1';
      if (Number(area.sort_order) !== i) patch.sort_order = i;
      if (name && area.name !== name) patch.name = name;
      if (Object.keys(patch).length) {
        const { data: up } = await supabase.from('eval_areas').update(patch).eq('id', area.id).select().maybeSingle();
        if (up) area = up;
      }
    }
    if (area) finalAreas.push(area);
  }

  // Módulos: 1 por actividad de cada área EN ESTE PERÍODO (solo de estas áreas)
  const { data: allMods } = await supabase.from('eval_modules')
    .select('*').eq('period_id', periodId).is('deleted_at', null)
    .order('sort_order').order('created_at');
  const allModules = allMods || [];
  const usedModulesByArea = [];
  for (let i = 0; i < finalAreas.length; i++) {
    const area = finalAreas[i];
    const nAct = Math.min(10, Math.max(1, Number(desired[i]?.activities || 1)));
    let areaMods = allModules
      .filter(m => m.area_id === area.id)
      .sort((x, y) => (x.sort_order ?? 0) - (y.sort_order ?? 0));
    if (areaMods.length < nAct) {
      const inserts = [];
      for (let j = areaMods.length; j < nAct; j++) {
        inserts.push({
          period_id: periodId,
          area_id: area.id,
          name: `${desired[i].name} · A${j + 1}`,
          sort_order: j,
          weight: 1,
          created_by: uid
        });
      }
      if (inserts.length) {
        const { data: createdMods } = await supabase.from('eval_modules').insert(inserts).select();
        if (createdMods?.length) areaMods = [...areaMods, ...createdMods].sort((x, y) => (x.sort_order ?? 0) - (y.sort_order ?? 0));
      }
    } else if (areaMods.length > nAct) {
      const toDelete = areaMods.slice(nAct).map(m => m.id);
      if (toDelete.length) {
        await supabase.from('eval_modules').update({ deleted_at: new Date().toISOString() }).in('id', toDelete);
        areaMods = areaMods.slice(0, nAct);
      }
    }
    usedModulesByArea.push(areaMods);
  }

  return { areas: finalAreas, usedModulesByArea, desired };
}

/**
 * Lee la config de áreas que la directora guardó para un aula
 * (`eval_evaluations.scale_config.classroom_configs[aulaId].areas`).
 * Devuelve [] si no hay config.
 */
export function classroomDesiredAreasFrom(evaluation, classroomId) {
  try {
    const cfgs = evaluation?.scale_config?.classroom_configs;
    const key = String(classroomId ?? '');
    if (cfgs && typeof cfgs === 'object' && key && cfgs[key]?.active !== false && Array.isArray(cfgs[key]?.areas)) {
      return cfgs[key].areas;
    }
  } catch (_) {}
  return [];
}

/**
 * Garantiza que eval_areas refleje la config del aula de la directora.
 * Best-effort: si falla, devuelve false sin lanzar.
 */
export async function ensureClassroomAreasFor({ evaluation, classroomId, uid }) {
  try {
    if (!evaluation?.id || classroomId == null) return false;
    const desired = classroomDesiredAreasFrom(evaluation, classroomId);
    if (!desired.length) return false;
    const { data: periods } = await supabase.from('eval_periods')
      .select('id').eq('evaluation_id', evaluation.id).is('deleted_at', null)
      .order('sort_order').order('created_at').limit(1);
    const periodId = periods?.[0]?.id || null;
    if (!periodId) return false;
    await syncClassroomAreas({
      evaluationId: evaluation.id,
      classroomId,
      desiredAreas: desired,
      periodId,
      uid
    });
    return true;
  } catch (_) { return false; }
}
