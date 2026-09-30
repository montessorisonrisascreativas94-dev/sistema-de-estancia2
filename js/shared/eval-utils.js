/**
 * 🎓 Utilidades compartidas del Constructor de Evaluaciones
 * Usadas por los paneles de Directora y Maestra.
 */

export const EDUCATIONAL_LEVELS = ['Maternal', 'Caminadores', 'Párvulos', 'Preprimario', 'Primaria'];

export const EVAL_TYPES = Object.freeze({
  numeric:   { label: 'Numérica',        icon: 'calculator',      desc: 'Nota 0-100, configurable' },
  stars:     { label: 'Estrellas',       icon: 'star',            desc: 'Escala de 1 a 5 estrellas' },
  scale:     { label: 'Escala Cualitativa', icon: 'bar-chart-3',  desc: 'Excelente → Necesita apoyo' },
  checklist: { label: 'Lista de Cotejo', icon: 'list-checks',     desc: 'Cumple / No cumple' },
  yesno:     { label: 'Sí / No',         icon: 'check-circle',    desc: 'Respuesta binaria' },
  rubric:    { label: 'Rúbrica',         icon: 'clipboard-check', desc: 'Criterios con niveles' }
});

export const PERIOD_TYPES = Object.freeze({
  periodo:   { label: 'Período Escolar', icon: 'calendar-range' },
  unidad:    { label: 'Unidad',          icon: 'layers' },
  bimestre:  { label: 'Bimestre',        icon: 'calendar-plus' },
  trimestre: { label: 'Trimestre',       icon: 'calendar-check' },
  mes:       { label: 'Mes',             icon: 'calendar' },
  final:     { label: 'Evaluación Final', icon: 'trophy' }
});

export const SCALE_LEVELS = Object.freeze([
  { value: 'excelente', label: 'Excelente',       min: 90, max: 100 },
  { value: 'muy_bien',  label: 'Muy Bien',        min: 80, max: 89 },
  { value: 'desarrollo',label: 'En Desarrollo',   min: 70, max: 79 },
  { value: 'proceso',   label: 'En Proceso',      min: 60, max: 69 },
  { value: 'apoyo',     label: 'Necesita Apoyo',  min: 0,  max: 59 }
]);

export const SCALE_COLORS = Object.freeze({
  excelente: 'bg-emerald-500',
  muy_bien:  'bg-green-500',
  desarrollo:'bg-amber-500',
  proceso:   'bg-orange-500',
  apoyo:     'bg-rose-500'
});

export const STAR_COLORS = { 5: 'text-emerald-600', 4: 'text-green-600', 3: 'text-amber-500', 2: 'text-orange-500', 1: 'text-rose-500' };
export const STAR_LABELS = { 5: 'Excelente', 4: 'Muy Bien', 3: 'En Desarrollo', 2: 'En Proceso', 1: 'Necesita Apoyo' };

const AREA_PRESETS = Object.freeze([
  { name: 'Desarrollo Socioemocional', icon: 'heart',     color: '#F43F5E' },
  { name: 'Lenguaje y Comunicación',   icon: 'message-circle', color: '#0EA5E9' },
  { name: 'Pensamiento Matemático',    icon: 'calculator', color: '#6366F1' },
  { name: 'Psicomotricidad',           icon: 'activity',   color: '#F97316' },
  { name: 'Arte y Creatividad',        icon: 'palette',    color: '#A855F7' },
  { name: 'Ciencias Naturales',        icon: 'leaf',       color: '#22C55E' },
  { name: 'Formación de Valores',      icon: 'star',       color: '#EAB308' }
]);

/**
 * Áreas por defecto de la Boleta en Vivo (5 × 5).
 * La maestra puede ajustar `default_areas` / `default_modules` en la evaluación.
 */
export const DEFAULT_AREAS = Object.freeze(AREA_PRESETS.slice(0, 5).map(a => ({ ...a })));
export const DEFAULT_ACTIVITIES_PER_MODULE = 2;

/**
 * Normaliza la configuración de un módulo según su tipo de evaluación.
 */
export function normalizeEvalConfig(evalType, config = {}) {
  const c = config || {};
  switch (evalType) {
    case 'numeric':
      return {
        min: c.min != null ? Number(c.min) : 0,
        max: c.max != null ? Number(c.max) : 100,
        decimals: c.decimals != null ? Number(c.decimals) : 0,
        allowDecimal: c.allowDecimal != null ? !!c.allowDecimal : Number(c.decimals) > 0
      };
    case 'stars':
      return { maxStars: c.maxStars != null ? Number(c.maxStars) : 5 };
    case 'scale':
      return { levels: (Array.isArray(c.levels) && c.levels.length) ? c.levels : SCALE_LEVELS };
    case 'checklist':
      return { items: Array.isArray(c.items) ? c.items : [] };
    case 'yesno':
      return {};
    case 'rubric':
      return { criteria: Array.isArray(c.criteria) ? c.criteria : [] };
    default:
      return {};
  }
}

/**
 * Convierte un registro de eval_scores a un valor normalizado 0-100.
 */
export function normalizeScore(module, score) {
  if (!module || !score) return null;
  const type = module.eval_type;
  const config = normalizeEvalConfig(type, module.config);
  switch (type) {
    case 'numeric': {
      if (score.value == null) return null;
      const v = Number(score.value);
      const span = (config.max - config.min) || 1;
      return Math.round(((v - config.min) / span) * 100 * 100) / 100;
    }
    case 'stars': {
      if (score.stars == null) return null;
      return Math.round((Number(score.stars) / config.maxStars) * 10000) / 100;
    }
    case 'scale': {
      if (!score.level) return null;
      const lv = (config.levels || SCALE_LEVELS).find(l => l.value === score.level);
      if (!lv) return null;
      return (lv.min + lv.max) / 2;
    }
    case 'yesno':
      return score.yesno === 'si' ? 100 : score.yesno === 'no' ? 0 : null;
    case 'checklist': {
      const items = config.items || [];
      if (!items.length) return null;
      const checked = items.filter((_, i) => score.checklist && score.checklist[String(i)] === true).length;
      return Math.round((checked / items.length) * 10000) / 100;
    }
    case 'rubric': {
      const criteria = config.criteria || [];
      if (!criteria.length) return null;
      let total = 0, weightSum = 0;
      criteria.forEach((cr, i) => {
        const val = score.rubric && score.rubric[String(i)] != null ? Number(score.rubric[String(i)]) : null;
        if (val != null) {
          const w = cr.weight != null ? Number(cr.weight) : 1;
          total += val * w;
          weightSum += w;
        }
      });
      if (!weightSum) return null;
      return Math.round((total / weightSum) * 100) / 100;
    }
    default:
      return null;
  }
}

/**
 * Renderiza el input de calificación correspondiente al tipo de evaluación.
 * @returns {string} HTML con el control y atributos data-* para leer el valor.
 */
export function renderEvalInput(module, score = null) {
  const type = module.eval_type;
  const config = normalizeEvalConfig(type, module.config);
  const s = score || {};

  switch (type) {
    case 'numeric': {
      const step = config.allowDecimal ? `0.${'1'.repeat(Math.max(1, config.decimals))}` : '1';
      return `<input type="number" class="eval-input w-full px-2 py-1.5 border border-slate-300 rounded-lg text-center text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-400" 
        min="${config.min}" max="${config.max}" step="${step}" data-field="value" 
        value="${s.value != null ? s.value : ''}" placeholder="${config.min}-${config.max}">`;
    }
    case 'stars': {
      let html = `<div class="flex items-center justify-center gap-0.5 eval-stars" data-field="stars">`;
      for (let i = 1; i <= config.maxStars; i++) {
        const active = Number(s.stars) >= i;
        html += `<button type="button" class="eval-star text-xl leading-none transition-all ${active ? STAR_COLORS[i] : 'text-slate-300 hover:text-slate-400'}" data-star="${i}" onclick="return false;">★</button>`;
      }
      html += `</div><input type="hidden" class="eval-stars-value" data-field="stars" value="${s.stars != null ? s.stars : ''}">`;
      return html;
    }
    case 'scale': {
      let html = `<select class="eval-input w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-400" data-field="level">`;
      html += `<option value="">— Elegir —</option>`;
      (config.levels || SCALE_LEVELS).forEach(l => {
        html += `<option value="${l.value}" ${s.level === l.value ? 'selected' : ''}>${l.label}</option>`;
      });
      html += `</select>`;
      return html;
    }
    case 'yesno': {
      const vals = ['si', 'no'];
      let html = `<div class="flex gap-1 justify-center">`;
      vals.forEach(v => {
        const active = s.yesno === v;
        html += `<button type="button" class="eval-yesno px-2.5 py-1 rounded-lg text-xs font-black transition-all ${active ? (v === 'si' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white') : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}" data-val="${v}" onclick="return false;">${v === 'si' ? 'Sí' : 'No'}</button>`;
      });
      html += `</div><input type="hidden" class="eval-yesno-value" data-field="yesno" value="${s.yesno || ''}">`;
      return html;
    }
    case 'checklist': {
      const items = config.items || [];
      let html = `<div class="space-y-0.5">`;
      items.forEach((item, i) => {
        const checked = s.checklist && s.checklist[String(i)] === true;
        html += `<label class="flex items-center gap-1.5 text-[11px] font-medium text-slate-600 cursor-pointer">
          <input type="checkbox" class="eval-checklist rounded accent-emerald-500" data-idx="${i}" ${checked ? 'checked' : ''}>
          <span class="truncate">${String(item).slice(0, 30)}</span></label>`;
      });
      html += `</div>`;
      return html;
    }
    case 'rubric': {
      const criteria = config.criteria || [];
      let html = `<div class="space-y-1">`;
      criteria.forEach((cr, i) => {
        const opts = cr.options || [{ label: 'Inicial', value: 0 }, { label: 'En Proceso', value: 1 }, { label: 'Logrado', value: 2 }, { label: 'Destacado', value: 3 }];
        const cur = s.rubric && s.rubric[String(i)] != null ? String(s.rubric[String(i)]) : '';
        html += `<div class="text-left">
          <div class="text-[10px] font-black text-slate-500 uppercase tracking-wide mb-0.5">${String(cr.name || 'Criterio')}</div>
          <select class="eval-input eval-rubric w-full px-1.5 py-1 border border-slate-300 rounded-lg text-[11px] font-bold outline-none focus:ring-2 focus:ring-indigo-400" data-idx="${i}" data-field="rubric">
            <option value="">—</option>`;
        opts.forEach(o => {
          html += `<option value="${o.value}" ${String(o.value) === cur ? 'selected' : ''}>${o.label}${o.value != null ? ` (${o.value})` : ''}</option>`;
        });
        html += `</div></div>`;
      });
      html += `</div>`;
      return html;
    }
    default:
      return `<input type="text" class="eval-input w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm" data-field="value" value="${s.value || ''}">`;
  }
}

/**
 * Lee los valores de los controles generados por renderEvalInput.
 * @param {HTMLElement} cell - celda que contiene los controles
 * @param {string} evalType - tipo de evaluación del módulo
 * @returns {object|null} registro parcial de eval_scores
 */
export function readEvalInputs(cell, evalType) {
  if (!cell) return null;
  const rec = {};
  const input = cell.querySelector('.eval-input[data-field="value"]');
  if (input) {
    const v = input.value.trim();
    if (v !== '') {
      const n = Number(v);
      if (!Number.isNaN(n)) rec.value = n;
    }
  }
  const starsVal = cell.querySelector('.eval-stars-value');
  if (starsVal && starsVal.value) rec.stars = Number(starsVal.value);
  const level = cell.querySelector('select[data-field="level"]');
  if (level && level.value) rec.level = level.value;
  const yesno = cell.querySelector('.eval-yesno-value');
  if (yesno && yesno.value) rec.yesno = yesno.value;
  const checkboxes = cell.querySelectorAll('.eval-checklist');
  if (checkboxes.length) {
    const cl = {};
    checkboxes.forEach(cb => { cl[cb.dataset.idx] = cb.checked; });
    rec.checklist = cl;
  }
  const rubrics = cell.querySelectorAll('.eval-rubric');
  if (rubrics.length) {
    const rb = {};
    rubrics.forEach(sel => {
      if (sel.value !== '') rb[sel.dataset.idx] = Number(sel.value);
    });
    rec.rubric = rb;
  }
  const hasAny = Object.keys(rec).length > 0;
  return hasAny ? rec : null;
}

/**
 * Valida que una fórmula sume 100%.
 * @returns {{ok:boolean, total:number}}
 */
export function formulaSum(parts = []) {
  const total = parts.reduce((s, p) => s + (Number(p.percent) || 0), 0);
  return { ok: Math.abs(total - 100) < 0.001, total };
}

/**
 * Calcula la nota final ponderada a partir de las partes de la fórmula.
 * @param {Array} parts - [{type, ref_id, name, percent}]
 * @param {object} componentValues - mapa por tipo:id → nota 0-100
 */
export function computeFinalScore(parts = [], componentValues = {}) {
  let acc = 0;
  let accW = 0;
  parts.forEach(p => {
    const key = `${p.type}:${p.ref_id}`;
    const val = componentValues[key];
    if (val != null) {
      acc += (Number(p.percent) / 100) * Number(val);
      accW += Number(p.percent);
    }
  });
  return accW ? Math.round(acc * 100) / 100 : null;
}

/**
 * Nivel descriptivo según nota 0-100.
 */
export function gradeToLevel(score) {
  if (score == null) return { label: 'Sin evaluar', cls: 'bg-slate-100 text-slate-500' };
  if (score >= 95) return { label: 'Excelente', cls: 'bg-emerald-100 text-emerald-700' };
  if (score >= 85) return { label: 'Muy Bien', cls: 'bg-green-100 text-green-700' };
  if (score >= 75) return { label: 'Bueno', cls: 'bg-lime-100 text-lime-700' };
  if (score >= 60) return { label: 'Aceptable', cls: 'bg-amber-100 text-amber-700' };
  return { label: 'Requiere Apoyo', cls: 'bg-rose-100 text-rose-700' };
}

export function starsHtml(n, max = 5) {
  if (n == null) return '<span class="text-slate-300">—</span>';
  return '<span class="tracking-tight">' + '★'.repeat(Math.round(n)) + '<span class="text-slate-200">' + '☆'.repeat(Math.max(0, max - Math.round(n))) + '</span></span>';
}

export function colorChip(color, icon) {
  return `<span class="inline-flex items-center justify-center w-9 h-9 rounded-xl text-white shadow-sm shrink-0" style="background:${color || '#6366F1'}"><i data-lucide="${icon || 'heart'}" class="w-4.5 h-4.5"></i></span>`;
}

/* ────────────────────────────────────────────────────────────────
 * 🤖 ASISTENTE IA PEDAGÓGICO (presets por nivel educativo)
 * Genera estructura completa: áreas → competencias → períodos →
 * módulos → actividades + rúbrica + fórmula.
 * ──────────────────────────────────────────────────────────────── */
export const AI_PRESETS = Object.freeze({
  'Maternal': {
    areas: [
      {
        name: 'Desarrollo Socioemocional', icon: 'heart', color: '#F43F5E',
        description: 'Vínculo afectivo, expresión de emociones y socialización.',
        competencies: [
          { name: 'Expresa sus emociones', code: 'MSE01' },
          { name: 'Acepta la separación de su cuidador', code: 'MSE02' },
          { name: 'Interactúa con adultos conocidos', code: 'MSE03' }
        ]
      },
      {
        name: 'Psicomotricidad', icon: 'activity', color: '#F97316',
        description: 'Desarrollo motor grueso y fino.',
        competencies: [
          { name: 'Gatea y se desplaza con seguridad', code: 'MPS01' },
          { name: 'Coordina manos y ojos', code: 'MPS02' },
          { name: 'Mantiene el equilibrio sentado', code: 'MPS03' }
        ]
      },
      {
        name: 'Lenguaje y Comunicación', icon: 'message-circle', color: '#0EA5E9',
        description: 'Balbuceo, gestos e intención comunicativa.',
        competencies: [
          { name: 'Emite sonidos y balbuceos', code: 'MLC01' },
          { name: 'Responde a su nombre', code: 'MLC02' },
          { name: 'Se comunica con gestos', code: 'MLC03' }
        ]
      }
    ],
    periods: [
      { name: 'Unidad 1', type: 'unidad' },
      { name: 'Unidad 2', type: 'unidad' },
      { name: 'Unidad 3', type: 'unidad' }
    ],
    modules: [
      { name: 'Adaptación', activities: ['Se adapta a la rutina', 'Acepta la compañía', 'Participa en actividades'] },
      { name: 'Lenguaje', activities: ['Balbucea en interacción', 'Responde a estímulos', 'Señala objetos'] },
      { name: 'Autonomía', activities: ['Duerme siesta', 'Toma agua solo', 'Participa en el aseo'] }
    ],
    formula: [
      { type: 'period', name: 'Unidad 1', percent: 30 },
      { type: 'period', name: 'Unidad 2', percent: 30 },
      { type: 'period', name: 'Unidad 3', percent: 40 }
    ]
  },
  'Caminadores': {
    areas: [
      {
        name: 'Desarrollo Socioemocional', icon: 'heart', color: '#F43F5E',
        description: 'Convivencia, normas básicas y expresión emocional.',
        competencies: [
          { name: 'Comparte con sus compañeros', code: 'CSE01' },
          { name: 'Expresa sus emociones', code: 'CSE02' },
          { name: 'Respeta normas básicas', code: 'CSE03' }
        ]
      },
      {
        name: 'Psicomotricidad', icon: 'activity', color: '#F97316',
        description: 'Motricidad gruesa, equilibrio y coordinación.',
        competencies: [
          { name: 'Camina con seguridad', code: 'CPS01' },
          { name: 'Sube y baja escaleras', code: 'CPS02' },
          { name: 'Realiza trazos libres', code: 'CPS03' }
        ]
      },
      {
        name: 'Lenguaje y Comunicación', icon: 'message-circle', color: '#0EA5E9',
        description: 'Primeras palabras y comprensión de instrucciones.',
        competencies: [
          { name: 'Dice palabras y frases cortas', code: 'CLC01' },
          { name: 'Comprende instrucciones simples', code: 'CLC02' },
          { name: 'Nombra objetos conocidos', code: 'CLC03' }
        ]
      }
    ],
    periods: [
      { name: 'Primer Período', type: 'periodo' },
      { name: 'Segundo Período', type: 'periodo' },
      { name: 'Tercer Período', type: 'periodo' },
      { name: 'Evaluación Final', type: 'final' }
    ],
    modules: [
      { name: 'Adaptación', activities: ['Se integra al grupo', 'Participa en la rutina', 'Coopera con la maestra'] },
      { name: 'Lenguaje', activities: ['Dice palabras nuevas', 'Canta canciones', 'Sigue instrucciones'] },
      { name: 'Motricidad', activities: ['Camina en línea', 'Lanza la pelota', 'Enhebra cuentas'] }
    ],
    formula: [
      { type: 'period', name: 'Primer Período', percent: 20 },
      { type: 'period', name: 'Segundo Período', percent: 30 },
      { type: 'period', name: 'Tercer Período', percent: 50 }
    ]
  },
  'Párvulos': {
    areas: [
      {
        name: 'Desarrollo Socioemocional', icon: 'heart', color: '#F43F5E',
        description: 'Evalúa la interacción social, manejo emocional y convivencia.',
        competencies: [
          { name: 'Comparte con sus compañeros', code: 'DS01' },
          { name: 'Respeta normas', code: 'DS02' },
          { name: 'Expresa emociones', code: 'DS03' },
          { name: 'Trabaja en equipo', code: 'DS04' },
          { name: 'Espera turnos', code: 'DS05' }
        ]
      },
      {
        name: 'Lenguaje y Comunicación', icon: 'message-circle', color: '#0EA5E9',
        description: 'Vocabulario, expresión oral y comprensión.',
        competencies: [
          { name: 'Se expresa con frases completas', code: 'LC01' },
          { name: 'Comprende cuentos', code: 'LC02' },
          { name: 'Reconoce su nombre escrito', code: 'LC03' }
        ]
      },
      {
        name: 'Pensamiento Matemático', icon: 'calculator', color: '#6366F1',
        description: 'Nociones de cantidad, clasificación y secuencia.',
        competencies: [
          { name: 'Cuenta hasta el 10', code: 'PM01' },
          { name: 'Clasifica por color y forma', code: 'PM02' },
          { name: 'Identifica patrones', code: 'PM03' }
        ]
      },
      {
        name: 'Psicomotricidad', icon: 'activity', color: '#F97316',
        description: 'Motricidad fina y gruesa en actividades lúdicas.',
        competencies: [
          { name: 'Salta con un pie', code: 'PS01' },
          { name: 'Recorta con tijeras', code: 'PS02' },
          { name: 'Dibuja figuras simples', code: 'PS03' }
        ]
      },
      {
        name: 'Arte y Creatividad', icon: 'palette', color: '#A855F7',
        description: 'Expresión artística a través del dibujo, pintura y música.',
        competencies: [
          { name: 'Disfruta pintando', code: 'AC01' },
          { name: 'Expresa ideas con dibujos', code: 'AC02' },
          { name: 'Participa en actividades musicales', code: 'AC03' }
        ]
      },
      {
        name: 'Formación de Valores', icon: 'star', color: '#EAB308',
        description: 'Valores, cortesía y convivencia armónica.',
        competencies: [
          { name: 'Saluda y se despide', code: 'FV01' },
          { name: 'Dice por favor y gracias', code: 'FV02' },
          { name: 'Cuida sus pertenencias', code: 'FV03' }
        ]
      }
    ],
    periods: [
      { name: 'Primer Período', type: 'periodo' },
      { name: 'Segundo Período', type: 'periodo' },
      { name: 'Tercer Período', type: 'periodo' },
      { name: 'Evaluación Final', type: 'final' }
    ],
    modules: [
      { name: 'Adaptación', activities: ['Se pone los zapatos', 'Guarda materiales', 'Come solo', 'Lava manos', 'Recoge juguetes'] },
      { name: 'Desarrollo del Lenguaje', activities: ['Cuenta un cuento', 'Describe láminas', 'Canta canciones'] },
      { name: 'Autonomía', activities: ['Viste su ropa', 'Ordena su espacio', 'Pide ayuda cuando la necesita'] }
    ],
    formula: [
      { type: 'period', name: 'Primer Período', percent: 20 },
      { type: 'period', name: 'Segundo Período', percent: 30 },
      { type: 'period', name: 'Tercer Período', percent: 50 }
    ]
  },
  'Preprimario': {
    areas: [
      {
        name: 'Desarrollo Socioemocional', icon: 'heart', color: '#F43F5E',
        description: 'Autocontrol, empatía y trabajo colaborativo.',
        competencies: [
          { name: 'Maneja sus emociones', code: 'PPSE01' },
          { name: 'Colabora en equipo', code: 'PPSE02' },
          { name: 'Respeta diferencias', code: 'PPSE03' },
          { name: 'Sigue acuerdos de convivencia', code: 'PPSE04' }
        ]
      },
      {
        name: 'Lenguaje y Comunicación', icon: 'message-circle', color: '#0EA5E9',
        description: 'Lectoescritura inicial y expresión oral.',
        competencies: [
          { name: 'Reconoce vocales y consonantes', code: 'PPLC01' },
          { name: 'Escribe su nombre', code: 'PPLC02' },
          { name: 'Narra secuencias de eventos', code: 'PPLC03' },
          { name: 'Comprende textos leídos', code: 'PPLC04' }
        ]
      },
      {
        name: 'Pensamiento Matemático', icon: 'calculator', color: '#6366F1',
        description: 'Conteo, operaciones básicas y razonamiento lógico.',
        competencies: [
          { name: 'Cuenta hasta el 30', code: 'PPPM01' },
          { name: 'Suma y resta con material concreto', code: 'PPPM02' },
          { name: 'Identifica figuras geométricas', code: 'PPPM03' },
          { name: 'Resuelve problemas simples', code: 'PPPM04' }
        ]
      },
      {
        name: 'Psicomotricidad', icon: 'activity', color: '#F97316',
        description: 'Coordinación, lateralidad y grafomotricidad.',
        competencies: [
          { name: 'Realiza movimientos coordinados', code: 'PPPS01' },
          { name: 'Identifica derecha e izquierda', code: 'PPPS02' },
          { name: 'Escribe con trazo firme', code: 'PPPS03' }
        ]
      }
    ],
    periods: [
      { name: 'Unidad 1', type: 'unidad' },
      { name: 'Unidad 2', type: 'unidad' },
      { name: 'Unidad 3', type: 'unidad' },
      { name: 'Unidad 4', type: 'unidad' }
    ],
    modules: [
      { name: 'Lectoescritura', activities: ['Reconoce vocales', 'Escribe su nombre', 'Identifica letras en palabras', 'Completa palabras'] },
      { name: 'Matemática', activities: ['Cuenta objetos', 'Clasifica figuras', 'Realiza sumas', 'Resuelve problemas'] },
      { name: 'Motricidad Fina', activities: ['Recorta figuras', 'Traza líneas', 'Modela plastilina', 'Enhebra cuentas'] }
    ],
    formula: [
      { type: 'area', name: 'Desarrollo Socioemocional', percent: 25 },
      { type: 'area', name: 'Lenguaje y Comunicación', percent: 35 },
      { type: 'area', name: 'Pensamiento Matemático', percent: 25 },
      { type: 'area', name: 'Psicomotricidad', percent: 15 }
    ]
  },
  'Primaria': {
    areas: [
      {
        name: 'Lengua Española', icon: 'book-open', color: '#0EA5E9',
        description: 'Comprensión lectora, escritura y expresión oral.',
        competencies: [
          { name: 'Lee con fluidez', code: 'PRI01' },
          { name: 'Comprende lo que lee', code: 'PRI02' },
          { name: 'Escribe textos coherentes', code: 'PRI03' }
        ]
      },
      {
        name: 'Matemática', icon: 'calculator', color: '#6366F1',
        description: 'Cálculo, razonamiento y resolución de problemas.',
        competencies: [
          { name: 'Resuelve operaciones básicas', code: 'PRM01' },
          { name: 'Aplica razonamiento lógico', code: 'PRM02' },
          { name: 'Interpreta datos y gráficos', code: 'PRM03' }
        ]
      },
      {
        name: 'Ciencias Sociales', icon: 'globe', color: '#22C55E',
        description: 'Convivencia social, historia y geografía.',
        competencies: [
          { name: 'Conoce su entorno social', code: 'PRC01' },
          { name: 'Valora la historia nacional', code: 'PRC02' },
          { name: 'Participa en actividades cívicas', code: 'PRC03' }
        ]
      },
      {
        name: 'Ciencias Naturales', icon: 'leaf', color: '#A855F7',
        description: 'Observación, exploración y cuidado del medio ambiente.',
        competencies: [
          { name: 'Observa y describe fenómenos', code: 'PRN01' },
          { name: 'Cuida el medio ambiente', code: 'PRN02' },
          { name: 'Realiza experimentos simples', code: 'PRN03' }
        ]
      }
    ],
    periods: [
      { name: 'Bimestre 1', type: 'bimestre' },
      { name: 'Bimestre 2', type: 'bimestre' },
      { name: 'Bimestre 3', type: 'bimestre' },
      { name: 'Bimestre 4', type: 'bimestre' }
    ],
    modules: [
      { name: 'Participación', activities: ['Aporta en clase', 'Realiza tareas', 'Participa en proyectos'] },
      { name: 'Proyecto', activities: ['Entrega proyecto', 'Expone el proyecto', 'Trabajo en equipo'] },
      { name: 'Examen', activities: ['Evaluación parcial', 'Evaluación final'] }
    ],
    formula: [
      { type: 'module', name: 'Participación', percent: 30 },
      { type: 'module', name: 'Proyecto', percent: 20 },
      { type: 'module', name: 'Examen', percent: 50 }
    ]
  }
});

/**
 * Genera la estructura completa para un nivel educativo.
 * @returns {object} { areas: [...], periods: [...], modules: [...], formula: [...] }
 */
export function generateStructureFromLevel(level) {
  const preset = AI_PRESETS[level];
  if (!preset) return null;
  return {
    areas: preset.areas.map(a => ({ ...a })),
    periods: preset.periods.map(p => ({ ...p })),
    modules: preset.modules.map(m => ({ ...m, activities: [...m.activities] })),
    formula: preset.formula.map(f => ({ ...f }))
  };
}

/**
 * Registro de actividades para el reporte de evaluación.
 */
export function buildReportData(students, modules, scoresMap) {
  return students.map(st => {
    const rows = modules.map(mod => {
      const activities = mod.activities || [];
      const actScores = activities.map(act => {
        const sc = scoresMap[`${mod.id}:${act.id}:${st.id}`];
        return { act, score: sc ? normalizeScore(mod, sc) : null };
      });
      const vals = actScores.map(x => x.score).filter(v => v != null);
      const avg = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null;
      return { module: mod, activities: actScores, avg };
    });
    return { student: st, rows };
  });
}

/* ────────────────────────────────────────────────────────────────
 * 🧩 GRIGA DE CALIFICACIÓN (compartida entre Directora y Maestra)
 * ──────────────────────────────────────────────────────────────── */

/**
 * Renderiza la grilla estudiante × actividades de un módulo.
 */
export function gradingGridHtml(module, activities, students, scoresMap = {}, opts = {}) {
  const editable = opts.editable !== false;
  const width = Math.max(620, 220 + activities.length * 150);
  let html = `<div class="table-scroll-wrap rounded-2xl border border-slate-200 overflow-hidden">
    <table class="w-full text-sm text-left border-separate border-spacing-0" style="min-width:${width}px;">
      <thead class="bg-indigo-50 text-indigo-700 font-black uppercase text-[10px] tracking-wider sticky top-0 z-10">
        <tr>
          <th class="px-4 py-3 border-b border-indigo-100 sticky left-0 bg-indigo-50 min-w-[160px]">Estudiante</th>`;
  activities.forEach(a => {
    html += `<th class="px-2 py-3 text-center border-b border-indigo-100 max-w-[150px] align-top">${String(a.name).slice(0, 40)}</th>`;
  });
  html += `<th class="px-3 py-3 text-center border-b border-indigo-100 min-w-[70px]">Promedio</th>`;
  html += `</tr></thead><tbody class="divide-y divide-slate-100 bg-white">`;

  students.forEach(st => {
    let vals = [];
    html += `<tr class="hover:bg-indigo-50/40">
      <td class="px-4 py-2 sticky left-0 bg-white font-bold text-slate-700 whitespace-nowrap">${String(st.name || '').slice(0, 30)}</td>`;
    activities.forEach(act => {
      const key = `${module.id}:${act.id}:${st.id}`;
      const sc = scoresMap[key] || null;
      const norm = normalizeScore(module, sc);
      if (norm != null) vals.push(norm);
      html += `<td class="eval-cell px-2 py-1.5 text-center align-middle min-w-[120px]">`;
      html += editable ? renderEvalInput(module, sc) : (norm != null ? `<span class="font-black ${norm >= 85 ? 'text-emerald-600' : norm >= 60 ? 'text-amber-600' : 'text-rose-600'}">${norm.toFixed(1)}</span>` : '<span class="text-slate-300">—</span>');
      html += `</td>`;
    });
    const avg = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null;
    html += `<td class="px-3 py-2 text-center font-black ${avg == null ? 'text-slate-300' : avg >= 85 ? 'text-emerald-600' : avg >= 60 ? 'text-amber-600' : 'text-rose-600'}">${avg != null ? avg.toFixed(1) : '—'}</td>`;
    html += `</tr>`;
  });
  if (!students.length) {
    html += `<tr><td colspan="${activities.length + 2}" class="text-center py-10 text-slate-400">No hay estudiantes</td></tr>`;
  }
  html += `</tbody></table></div>`;
  return html;
}

/**
 * Lee todos los valores de la grilla de calificación.
 * @returns {Array<{activity_id, student_id, record}>}
 */
export function readGradingGrid(container, module, activities, students) {
  if (!container) return [];
  const results = [];
  const rows = container.querySelectorAll('table tbody tr');
  rows.forEach((row, ri) => {
    const student = students[ri];
    if (!student) return;
    const cells = row.querySelectorAll('.eval-cell');
    cells.forEach((cell, ci) => {
      const act = activities[ci];
      if (!act) return;
      const record = readEvalInputs(cell, module.eval_type);
      if (record) results.push({ activity_id: act.id, student_id: student.id, record });
    });
  });
  return results;
}

let _controlsBound = false;

/**
 * Vincula los controles interactivos (estrellas, sí/no) una sola vez.
 */
export function initEvalControls(root = document.body) {
  if (_controlsBound) return;
  _controlsBound = true;
  root.addEventListener('click', (e) => {
    const star = e.target.closest?.('.eval-star');
    if (star) {
      const wrap = star.closest('.eval-stars');
      const val = Number(star.dataset.star);
      const hid = wrap?.querySelector('.eval-stars-value');
      if (hid) hid.value = val;
      wrap?.querySelectorAll('.eval-star').forEach(btn => {
        const n = Number(btn.dataset.star);
        btn.className = `eval-star text-xl leading-none transition-all ${n <= val ? (STAR_COLORS[n] || 'text-amber-500') : 'text-slate-300 hover:text-slate-400'}`;
      });
      e.preventDefault();
      return;
    }
    const yn = e.target.closest?.('.eval-yesno');
    if (yn) {
      const group = yn.closest('div');
      const val = yn.dataset.val;
      group.querySelectorAll('.eval-yesno').forEach(b => {
        b.className = 'eval-yesno px-2.5 py-1 rounded-lg text-xs font-black transition-all bg-slate-100 text-slate-500 hover:bg-slate-200';
      });
      yn.className = `eval-yesno px-2.5 py-1 rounded-lg text-xs font-black transition-all ${val === 'si' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`;
      const hid = group.querySelector('.eval-yesno-value');
      if (hid) hid.value = val;
      e.preventDefault();
    }
  });
}

/**
 * Construye un mapa de puntajes {moduleId:activityId:studentId: score}
 */
export function buildScoresMap(scores, activities) {
  const map = {};
  (scores || []).forEach(s => {
    map[`${s.module_id}:${s.activity_id}:${s.student_id}`] = s;
  });
  return map;
}

/* ────────────────────────────────────────────────────────────────
 * 🧾 BOLETA EN VIVO (helpers puros)
 * ──────────────────────────────────────────────────────────────── */

/**
 * Color de texto según nota 0-100.
 */
export function gradeColor(n) {
  if (n == null) return 'text-slate-300';
  if (n >= 90) return 'text-emerald-600';
  if (n >= 80) return 'text-green-600';
  if (n >= 70) return 'text-lime-600';
  if (n >= 60) return 'text-amber-600';
  return 'text-rose-600';
}

/**
 * Promedio de valores ignorando nulos.
 */
export function avgOf(vals = []) {
  const v = vals.filter(x => x != null);
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100 : null;
}

/**
 * Promedio de las actividades de un módulo para un estudiante.
 */
export function moduleAvg(module, activities, studentId, scoresMap) {
  const vals = (activities || []).map(a => normalizeScore(module, scoresMap[`${module.id}:${a.id}:${studentId}`]));
  return avgOf(vals);
}

/**
 * Construye la data de la boleta de un estudiante en un período:
 * areas → modules → activities (con nota normalizada) + promedios.
 * @returns {{student, period, areas:Array, overall:number|null}}
 */
export function buildBoletaData({ student, period, areas, modules, activities, scoresMap }) {
  const areasOut = [];
  const areaVals = [];
  const periodModules = (modules || []).filter(m => m.period_id === period.id);
  (areas || []).forEach(area => {
    const areaModules = periodModules.filter(m => m.area_id === area.id);
    const modsOut = [];
    const modVals = [];
    areaModules.forEach(m => {
      const acts = (activities || []).filter(a => a.module_id === m.id);
      const mAvg = moduleAvg(m, acts, student.id, scoresMap);
      if (mAvg != null) modVals.push(mAvg);
      modsOut.push({
        module: m,
        avg: mAvg,
        activities: acts.map(a => ({
          act: a,
          norm: normalizeScore(m, scoresMap[`${m.id}:${a.id}:${student.id}`])
        }))
      });
    });
    const aAvg = avgOf(modVals);
    if (aAvg != null) areaVals.push(aAvg);
    areasOut.push({ area, avg: aAvg, modules: modsOut });
  });
  return { student, period, areas: areasOut, overall: avgOf(areaVals) };
}
