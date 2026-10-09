/**
 * SchoolActivitiesModule — Calendario Pedagógico y Centro de
 * Experiencias Educativas (Colegio Montessori Sonrisas Creativas)
 *
 * Fuente: calendario.md (§3–§15)
 *
 * Usos:
 *   Admin (directora/asistente/encargada):
 *     SchoolActivitiesModule.init({ mode:'admin', containerId:'actividadesContent' })
 *   Maestra:
 *     SchoolActivitiesModule.init({ mode:'teacher', containerId:'actividadesContent', profile })
 *   Padres:
 *     SchoolActivitiesModule.init({ mode:'parent', containerId:'actividadesContent' })
 */
import { supabase } from './supabase.js';
import { Helpers } from './helpers.js';
import { SchoolYearGuard } from './school-year-guard.js';
import { openGlobalModal, closeGlobalModal } from './modal.js';

const ADMIN_ROLES = ['directora', 'encargada', 'asistente', 'admin'];

export const CATEGORIES = Object.freeze({
  ciencias:    { label: 'Ciencias & Naturaleza', emoji: '🟢', color: '#22C55E' },
  educativa:   { label: 'Educativa & Cognitiva', emoji: '🔵', color: '#3B82F6' },
  arte:        { label: 'Arte & Expresión',      emoji: '🟣', color: '#A855F7' },
  celebracion: { label: 'Celebración & Eventos', emoji: '🟠', color: '#F97316' },
  familia:     { label: 'Familia & Comunidad',   emoji: '🩷', color: '#EC4899' },
  recreativa:  { label: 'Recreativa & Deporte',  emoji: '🟡', color: '#EAB308' },
  importante:  { label: 'Importante / Urgente',  emoji: '🔴', color: '#EF4444' },
  general:     { label: 'General / Rutina',      emoji: '⚪', color: '#64748B' }
});

const STATUS = Object.freeze({
  draft:       { label: 'Borrador',   emoji: '📝', bg: '#64748B' },
  scheduled:   { label: 'Planificada', emoji: '📅', bg: '#3B82F6' },
  in_progress: { label: 'En curso',   emoji: '🟢', bg: '#22C55E' },
  completed:   { label: 'Realizada',  emoji: '✅', bg: '#0D9488' },
  published:   { label: 'Publicada',  emoji: '👨‍👩‍👧', bg: '#8B5CF6' }
});

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio',
  'Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const WEEKDAYS = ['LUN','MAR','MIÉ','JUE','VIE','SÁB','DOM'];

const state = {
  mode: 'admin',
  role: '',
  userId: null,
  profile: null,
  containerId: null,
  year: new Date().getFullYear(),
  month: new Date().getMonth() + 1,
  view: 'grid',
  filters: { q: '', category: '', teacher: '', classroom: '' },
  activities: [],
  upcoming: [],
  upcomingEvidence: null,
  detailId: null,
  monthConfig: null,
  teachers: [],
  classrooms: [],
  myClassroomIds: [],
  evidenceCount: 0,
  loading: false
};

// ── utilidades ──────────────────────────────────────────────────
const esc = (s) => Helpers.escapeHTML(s ?? '');
const isAdmin = () => ADMIN_ROLES.includes(state.role);
const canManage = () => isAdmin();
const canEvidence = () => isAdmin() || state.role === 'maestra';
const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const catOf = (c) => CATEGORIES[c] || CATEGORIES.general;
const stOf = (s) => STATUS[s] || STATUS.draft;
const lastDay = (y, m) => new Date(y, m, 0).getDate();

function _escAttr(s) { return esc(s).replace(/"/g, '&quot;'); }

function _icons() {
  requestAnimationFrame(() => { if (window.lucide) lucide.createIcons(); });
}

function _toast(msg, type = 'success') { Helpers.toast(msg, type); }

async function _confirm(title, message) {
  if (typeof window.karpusConfirm === 'function') return window.karpusConfirm(title, message);
  if (typeof window._karpusConfirmDelete === 'function') return window._karpusConfirmDelete(title, message);
  return window.confirm(`${title}\n${message}`);
}

function _openModal(html, wide = false) {
  if (document.getElementById('globalModalContainer')) {
    openGlobalModal(html, wide);
    return;
  }
  // Fallback (paneles sin modal global): overlay propio
  _closeModal();
  const el = document.createElement('div');
  el.id = 'saModalOverlay';
  el.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:flex-start;justify-content:center;padding:4vh 12px;background:rgba(0,0,0,.6);backdrop-filter:blur(8px);overflow-y:auto';
  el.innerHTML = `
    <div class="bg-white rounded-3xl shadow-2xl w-full ${wide ? 'max-w-4xl' : 'max-w-2xl'} max-h-[92vh] overflow-y-auto relative">
      <button data-sa-action="close-modal" class="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-rose-50 hover:text-rose-500 transition-all z-10">
        <i data-lucide="x" class="w-6 h-6"></i>
      </button>
      ${html}
    </div>`;
  el.addEventListener('mousedown', (e) => { if (e.target === el) _closeModal(); });
  document.body.appendChild(el);
  _icons();
}

function _closeModal() {
  const fallback = document.getElementById('saModalOverlay');
  if (fallback) fallback.remove();
  if (document.getElementById('globalModalContainer')) closeGlobalModal();
}

function _visibleActivities() {
  let list = state.activities.slice();
  if (state.mode === 'teacher') {
    list = list.filter(a =>
      a.assigned_teacher_id === state.userId ||
      state.myClassroomIds.includes(a.classroom_id) ||
      a.classroom_id === null && a.assigned_teacher_id === null
    );
    list = list.filter(a => a.status !== 'draft');
  }
  const f = state.filters;
  if (f.q) {
    const q = f.q.toLowerCase();
    list = list.filter(a =>
      (a.title || '').toLowerCase().includes(q) ||
      (a.description || '').toLowerCase().includes(q));
  }
  if (f.category) list = list.filter(a => a.category === f.category);
  if (f.classroom) list = list.filter(a =>
    f.classroom === 'all' ? a.classroom_id == null : String(a.classroom_id) === f.classroom);
  if (f.teacher) list = list.filter(a => String(a.assigned_teacher_id || '') === f.teacher);
  return list;
}

// ── carga de datos ──────────────────────────────────────────────
async function _loadReference() {
  const jobs = [];
  if (state.mode !== 'parent') {
    jobs.push(supabase.from('profiles')
      .select('id, name, role')
      .in('role', ['maestra'])
      .eq('is_active', true)
      .order('name'));
    jobs.push(supabase.from('classrooms')
      .select('id, name, level, teacher_id')
      .is('deleted_at', null)
      .order('name'));
  } else {
    jobs.push(Promise.resolve({ data: [] }));
    jobs.push(Promise.resolve({ data: [] }));
  }
  const [teachersRes, roomsRes] = await Promise.all(jobs);
  state.teachers = teachersRes.data || [];
  state.classrooms = roomsRes.data || [];
  if (state.mode === 'teacher') {
    state.myClassroomIds = state.classrooms
      .filter(c => c.teacher_id === state.userId)
      .map(c => c.id);
  }
}

async function _loadMonth() {
  state.loading = true;
  _renderSkeleton();
  const from = iso(state.year, state.month, 1);
  const to = iso(state.year, state.month, lastDay(state.year, state.month));

  let query = supabase.from('school_activities')
    .select('*')
    .gte('activity_date', from)
    .lte('activity_date', to)
    .order('activity_date', { ascending: true })
    .order('start_time', { ascending: true, nullsFirst: false });
  if (state.mode === 'parent') query = query.eq('status', 'published');

  const [actRes, cfgRes] = await Promise.all([
    query,
    supabase.from('school_month_configs')
      .select('*')
      .eq('year_number', state.year)
      .eq('month_number', state.month)
      .maybeSingle()
  ]);

  state.activities = actRes.data || [];
  state.monthConfig = cfgRes.data || null;

  // Métricas del mes (§15)
  state.evidenceCount = 0;
  if (state.activities.length) {
    const ids = state.activities.map(a => a.id);
    const { count } = await supabase.from('school_activity_evidences')
      .select('id', { count: 'exact', head: true })
      .in('activity_id', ids);
    state.evidenceCount = count || 0;
  }

  // Feed "Próximas actividades" para padres
  state.upcoming = [];
  state.upcomingEvidence = null;
  if (state.mode === 'parent') {
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase.from('school_activities')
      .select('*')
      .eq('status', 'published')
      .gte('activity_date', today)
      .order('activity_date', { ascending: true })
      .limit(10);
    state.upcoming = data || [];
    if (state.upcoming.length) {
      const ids = state.upcoming.map(a => a.id);
      const { data: ev } = await supabase.from('school_activity_evidences')
        .select('activity_id')
        .in('activity_id', ids);
      const byId = new Map();
      (ev || []).forEach(x => byId.set(x.activity_id, (byId.get(x.activity_id) || 0) + 1));
      state.upcomingEvidence = byId;
    }
  }

  state.loading = false;
  _render();
}

// ── render principal ────────────────────────────────────────────
function _container() {
  return document.getElementById(state.containerId);
}

function _renderSkeleton() {
  const el = _container();
  if (!el) return;
  el.innerHTML = `<div class="animate-pulse space-y-4">
    <div class="h-24 rounded-3xl bg-slate-100"></div>
    <div class="h-12 rounded-2xl bg-slate-100"></div>
    <div class="grid grid-cols-7 gap-2">${'<div class="h-24 bg-slate-100 rounded-2xl"></div>'.repeat(7)}</div>
  </div>`;
}

function _bannerHTML() {
  const cfg = state.monthConfig;
  const color = cfg?.primary_color || '#0D9488';
  const title = cfg?.special_title || `${MONTH_NAMES[state.month - 1]} ${state.year}`;
  const slogan = cfg?.slogan || 'Planificación y experiencias de aprendizaje';
  const editBtn = canManage()
    ? `<button data-sa-action="month-config" class="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/20 hover:bg-white/30 border border-white/30 text-[11px] font-black uppercase tracking-wider transition-all">
         <i data-lucide="palette" class="w-4 h-4"></i> Tema del mes
       </button>`
    : '';
  const familyMsg = state.mode === 'parent' && cfg?.family_message
    ? `<p class="text-sm font-semibold text-white/90 mt-2 leading-relaxed max-w-3xl">${esc(cfg.family_message)}</p>`
    : '';
  const banner = cfg?.banner_url
    ? `<div class="absolute inset-0 opacity-35 pointer-events-none"
         style="background-image:url('${_escAttr(cfg.banner_url)}');background-size:cover;background-position:center"></div>`
    : '';
  return `
    <div class="sa-anim rounded-3xl p-5 md:p-6 text-white relative overflow-hidden shadow-lg"
         style="background:linear-gradient(135deg, ${color}, ${color}CC 55%, #0F172A)">
      ${banner}
      <div class="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
      <div class="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2"></div>
      <div class="relative z-10 flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0">
          <p class="text-[11px] font-black uppercase tracking-[0.2em] text-white/70">Actividades del Centro</p>
          <h2 class="text-xl md:text-2xl font-black tracking-tight mt-1 break-words">${esc(title)}</h2>
          <p class="text-xs font-bold text-white/80 mt-1">${esc(slogan)}</p>
          ${familyMsg}
        </div>
        ${editBtn}
      </div>
    </div>`;
}

function _filtersHTML() {
  if (state.mode === 'parent') return '';
  const f = state.filters;
  const catOpts = ['<option value="">🏷️ Categoría: Todas</option>']
    .concat(Object.entries(CATEGORIES).map(([k, v]) =>
      `<option value="${k}" ${f.category === k ? 'selected' : ''}>${v.emoji} ${esc(v.label)}</option>`)).join('');
  const teacherOpts = ['<option value="">👩‍🏫 Docente: Todos</option>']
    .concat(state.teachers.map(t =>
      `<option value="${t.id}" ${f.teacher === t.id ? 'selected' : ''}>${esc(t.name)}</option>`)).join('');
  const roomOpts = ['<option value="">📚 Aula: Todas</option>',
    `<option value="all" ${f.classroom === 'all' ? 'selected' : ''}>🏫 Todo el colegio</option>`]
    .concat(state.classrooms.map(c =>
      `<option value="${c.id}" ${f.classroom === String(c.id) ? 'selected' : ''}>${esc(c.name)}</option>`)).join('');

  return `
    <div class="sa-anim bg-white rounded-2xl border border-slate-100 shadow-sm p-3 flex flex-wrap gap-2 items-center">
      <div class="relative flex-1 min-w-[180px]">
        <i data-lucide="search" class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
        <input id="saSearch" type="search" value="${_escAttr(f.q)}" placeholder="🔎 Buscar actividad..."
          class="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold outline-none focus:border-teal-400"
          data-sa-action="filter-q">
      </div>
      <select id="saCategory" data-sa-action="filter-category" class="px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-bold outline-none focus:border-teal-400 bg-white">${catOpts}</select>
      <select id="saTeacher" data-sa-action="filter-teacher" class="px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-bold outline-none focus:border-teal-400 bg-white hidden md:block">${teacherOpts}</select>
      <select id="saClassroom" data-sa-action="filter-classroom" class="px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-bold outline-none focus:border-teal-400 bg-white hidden md:block">${roomOpts}</select>
      <div class="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
        <button data-sa-action="view" data-view="grid" title="Calendario"
          class="px-3 py-2 rounded-lg text-sm font-black transition-all ${state.view === 'grid' ? 'bg-white shadow text-teal-700' : 'text-slate-500'}">
          <i data-lucide="calendar-days" class="w-4 h-4"></i>
        </button>
        <button data-sa-action="view" data-view="list" title="Lista"
          class="px-3 py-2 rounded-lg text-sm font-black transition-all ${state.view === 'list' ? 'bg-white shadow text-teal-700' : 'text-slate-500'}">
          <i data-lucide="list" class="w-4 h-4"></i>
        </button>
      </div>
    </div>`;
}

function _navHTML() {
  const newBtn = canManage()
    ? `<button data-sa-action="new"
         class="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs md:text-sm font-black shadow-md  transition-all active:scale-95">
         <i data-lucide="plus" class="w-4 h-4"></i> Nueva actividad
       </button>`
    : '';
  return `
    <div class="sa-anim flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <button data-sa-action="prev-month" aria-label="Mes anterior"
          class="w-10 h-10 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-600 hover:bg-teal-50 hover:text-teal-700 transition-all active:scale-95">
          <i data-lucide="chevron-left" class="w-5 h-5"></i>
        </button>
        <h3 class="text-lg md:text-xl font-black text-slate-800 text-center" style="min-width:170px">
          ${MONTH_NAMES[state.month - 1]} ${state.year}
        </h3>
        <button data-sa-action="next-month" aria-label="Mes siguiente"
          class="w-10 h-10 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-600 hover:bg-teal-50 hover:text-teal-700 transition-all active:scale-95">
          <i data-lucide="chevron-right" class="w-5 h-5"></i>
        </button>
        <button data-sa-action="today" class="px-3 h-10 rounded-xl bg-white border border-slate-200 shadow-sm text-xs font-black text-slate-500 hover:text-teal-700 hover:border-teal-300 transition-all">Hoy</button>
      </div>
      ${newBtn}
    </div>`;
}

function _chipHTML(a) {
  const c = catOf(a.category);
  return `
    <button data-sa-action="open" data-id="${a.id}"
      class="sa-chip w-full text-left px-2 py-1 rounded-lg text-[11px] font-bold leading-tight"
      style="background:${esc(a.color_hex || c.color)}1F;color:${esc(a.color_hex || c.color)};border-left:3px solid ${esc(a.color_hex || c.color)}">
      <span class="sa-emoji">${c.emoji}</span><span class="min-w-0 truncate">${esc(a.title)}</span>
    </button>`;
}

function _gridHTML(list) {
  const first = new Date(state.year, state.month - 1, 1).getDay();
  const offset = (first + 6) % 7; // lunes = 0
  const days = lastDay(state.year, state.month);
  const today = new Date();
  const isThisMonth = today.getFullYear() === state.year && today.getMonth() + 1 === state.month;

  let cells = '';
  for (let i = 0; i < offset; i++) cells += `<div class="sa-cell sa-cell-empty"></div>`;
  for (let d = 1; d <= days; d++) {
    const dayActs = list.filter(a => Number((a.activity_date || '').slice(8, 10)) === d);
    const isToday = isThisMonth && today.getDate() === d;
    cells += `
      <div class="sa-cell${isToday ? ' sa-cell-today' : ''}">
        <div class="flex items-center justify-between px-0.5">
          <span class="text-[11px] font-black ${isToday ? 'text-teal-700' : 'text-slate-500'}">${d}</span>
          ${dayActs.length ? `<span class="sa-day-count">${dayActs.length}</span>` : ''}
        </div>
        <div class="flex flex-col gap-1 overflow-y-auto kk-scroll">${dayActs.slice(0, 3).map(_chipHTML).join('')}</div>
        ${dayActs.length > 3 ? `<button data-sa-action="day" data-day="${d}" class="text-[10px] font-black text-teal-600 hover:underline text-left px-0.5">+${dayActs.length - 3} más</button>` : ''}
      </div>`;
  }

  return `
    <div class="sa-cal sa-anim rounded-3xl overflow-x-auto">
      <div class="grid grid-cols-7 gap-1.5 md:gap-2" style="min-width:560px">
        ${WEEKDAYS.map(w => `<div class="sa-wd text-center uppercase py-1.5 tracking-wider font-black">${w}</div>`).join('')}
        ${cells}
      </div>
      ${!list.length ? `<p class="text-center text-sm font-bold text-slate-400 py-6">Sin actividades para este mes</p>` : ''}
    </div>`;
}

function _listHTML(list) {
  if (!list.length) {
    return `<div class="sa-anim bg-white rounded-3xl border border-slate-100 shadow-sm p-10 text-center">
      <div class="text-4xl mb-3">🗓️</div>
      <p class="text-sm font-bold text-slate-400">No hay actividades que coincidan con los filtros.</p>
    </div>`;
  }
  return `
    <div class="sa-anim space-y-3">
      ${list.map(a => {
        const c = catOf(a.category);
        const s = stOf(a.status);
        const d = new Date(`${a.activity_date}T12:00:00`);
        const dateLabel = `${d.getDate()} ${MONTH_NAMES[d.getMonth()].slice(0, 3).toUpperCase()}`;
        return `
        <button data-sa-action="open" data-id="${a.id}"
          class="w-full text-left bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex gap-4 hover:shadow-md transition-all active:scale-[.995]">
          <div class="shrink-0 w-14 rounded-xl flex flex-col items-center justify-center text-white py-2" style="background:${esc(a.color_hex || c.color)}">
            <span class="text-lg font-black leading-none">${d.getDate()}</span>
            <span class="text-[9px] font-black opacity-80">${MONTH_NAMES[d.getMonth()].slice(0, 3).toUpperCase()}</span>
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-start justify-between gap-2">
              <h4 class="font-black text-slate-800 text-sm md:text-base truncate">${esc(a.title)}</h4>
              <span class="shrink-0 text-[10px] font-black px-2 py-1 rounded-lg" style="background:${s.bg}1A;color:${s.bg}">${s.emoji} ${s.label}</span>
            </div>
            <p class="text-xs text-slate-500 font-semibold mt-1 line-clamp-2">${esc(a.description)}</p>
            <div class="flex flex-wrap items-center gap-2 mt-2 text-[10px] font-black text-slate-400 uppercase tracking-wider">
              <span>${c.emoji} ${esc(c.label)}</span>
              ${a.start_time ? `<span>🕐 ${esc(a.start_time.slice(0, 5))}</span>` : ''}
            </div>
          </div>
        </button>`;
      }).join('')}
    </div>`;
}

function _statsHTML() {
  const total = state.activities.length;
  const done = state.activities.filter(a => a.status === 'completed' || a.status === 'published').length;
  const pub = state.activities.filter(a => a.status === 'published').length;
  const item = (v, l, i) => `
    <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-3">
      <div class="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center"><i data-lucide="${i}" class="w-5 h-5 text-teal-600"></i></div>
      <div><div class="text-xl font-black text-slate-800 leading-none">${v}</div>
      <div class="text-[10px] font-black text-slate-400 uppercase tracking-wider mt-1">${l}</div></div>
    </div>`;
  return `<div class="sa-anim grid grid-cols-2 lg:grid-cols-4 gap-3">
    ${item(total, 'Actividades', 'calendar-check')}${item(done, 'Realizadas', 'check-circle-2')}
    ${item(pub, 'Publicadas', 'users')}${item(state.evidenceCount, 'Fotografías', 'camera')}
  </div>`;
}

function _upcomingHTML() {
  if (state.mode !== 'parent' || !state.upcoming.length) return '';
  return `
    <div class="sa-anim bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
      <div class="p-4 md:p-5 border-b border-slate-100 flex items-center gap-3">
        <div class="w-10 h-10 rounded-2xl bg-amber-50 flex items-center justify-center"><span class="text-lg">📌</span></div>
        <div><h3 class="font-black text-slate-800 text-sm">Próximas Actividades</h3>
        <p class="text-[10px] font-black text-slate-400 uppercase tracking-wider">Doble clic sobre una actividad para leerla completa</p></div>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 p-4">
        ${state.upcoming.map(a => {
          const c = catOf(a.category);
          const d = new Date(`${a.activity_date}T12:00:00`);
          const dateLabel = `${d.getDate()} ${MONTH_NAMES[d.getMonth()].slice(0, 3).toUpperCase()}`;
          const shots = state.upcomingEvidence?.get(a.id) || 0;
          return `
          <button data-sa-dblopen="${a.id}" title="Doble clic para leer completo"
            class="sa-upc w-full text-left bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex gap-3 cursor-pointer">
            <div class="shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center text-2xl" style="background:${esc(a.color_hex || c.color)}1A">${c.emoji}</div>
            <div class="min-w-0 flex-1">
              <div class="flex items-start justify-between gap-2">
                <h4 class="font-black text-slate-800 text-sm leading-snug truncate">${esc(a.title)}</h4>
                ${shots ? `<span class="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-teal-50 text-teal-700 text-[10px] font-black no-underline">📸 ${shots}</span>` : ''}
              </div>
              <p class="text-xs text-slate-500 font-semibold mt-1 line-clamp-2">${esc(a.description)}</p>
              <div class="flex flex-wrap items-center gap-1.5 mt-2 text-[10px] font-black uppercase tracking-wider">
                <span class="px-2 py-0.5 rounded-md" style="background:${esc(a.color_hex || c.color)}1A;color:${esc(a.color_hex || c.color)}">${c.emoji} ${esc(c.label)}</span>
                <span class="text-slate-400">🗓 ${dateLabel}</span>
                ${a.start_time ? `<span class="text-slate-400">🕐 ${esc(a.start_time.slice(0, 5))}</span>` : ''}
              </div>
            </div>
            <span class="sa-upc-hint shrink-0 self-center hidden sm:flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-50 text-slate-300 text-[9px] font-black">📖 <span>Doble clic</span></span>
          </button>`;
        }).join('')}
      </div>
    </div>`;
}

function _render() {
  const el = _container();
  if (!el) return;
  const list = _visibleActivities();
  el.innerHTML = `
    <div class="space-y-5">
      ${_bannerHTML()}
      ${_navHTML()}
      ${_filtersHTML()}
      ${!state.loading && canManage() ? _statsHTML() : ''}
      ${state.view === 'grid' ? _gridHTML(list) : _listHTML(list)}
      ${_upcomingHTML()}
    </div>`;
  _icons();
}

// ── detalle de la actividad (§8) ────────────────────────────────
async function _openDay(day) {
  const dayActs = _visibleActivities().filter(a =>
    Number((a.activity_date || '').slice(8, 10)) === day);
  if (!dayActs.length) return;
  const date = new Date(state.year, state.month - 1, day);
  _openModal(`
    <div class="p-5 md:p-7">
      <div class="flex items-center justify-between mb-5">
        <div>
          <p class="text-[11px] font-black uppercase tracking-widest text-slate-400">Calendario pedagógico</p>
          <h3 class="text-lg font-black text-slate-800">${date.getDate()} de ${MONTH_NAMES[date.getMonth()]} de ${date.getFullYear()}</h3>
        </div>
        <span class="px-2.5 py-1.5 rounded-lg bg-teal-50 text-teal-700 text-[10px] font-black uppercase tracking-widest">${dayActs.length} actividad(es)</span>
      </div>
      <div class="space-y-2.5">
        ${dayActs.map(a => {
          const c = catOf(a.category);
          const s = stOf(a.status);
          return `
          <button data-sa-action="open" data-id="${a.id}"
            class="w-full text-left bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-3 hover:shadow-md transition-all active:scale-[.995]">
            <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${esc(a.color_hex || c.color)}"></span>
            <div class="min-w-0 flex-1">
              <p class="font-black text-slate-800 text-sm truncate">${c.emoji} ${esc(a.title)}</p>
              <p class="text-[10px] font-black text-slate-400 uppercase tracking-wider mt-0.5">${esc(c.label)}${a.start_time ? ` • ${esc(a.start_time.slice(0, 5))}` : ''}</p>
            </div>
            <span class="shrink-0 text-[10px] font-black px-2 py-1 rounded-lg" style="background:${s.bg}1A;color:${s.bg}">${s.emoji}</span>
          </button>`;
        }).join('')}
      </div>
    </div>
  `, false);
}

async function openDetail(id) {
  state.detailId = String(id);
  const a = state.activities.find(x => String(x.id) === String(id));
  if (!a) return;
  const c = catOf(a.category);
  const s = stOf(a.status);
  const content = a.content || {};
  const d = new Date(`${a.activity_date}T12:00:00`);
  const dateLabel = `${d.getDate()} de ${MONTH_NAMES[d.getMonth()]} de ${d.getFullYear()}`;

  let evidences = [];
  if (canEvidence() || a.status === 'published') {
    const { data } = await supabase.from('school_activity_evidences')
      .select('*').eq('activity_id', a.id).order('created_at');
    evidences = data || [];
  }
  const teacher = state.teachers.find(t => t.id === a.assigned_teacher_id);
  const room = state.classrooms.find(r => r.id === a.classroom_id);

  const list = (label, key, icon) => {
    const val = (content[key] || '').toString().trim();
    if (!val) return '';
    const items = val.split('\n').filter(Boolean);
    return `
      <div class="mb-4">
        <h4 class="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1.5">
          <i data-lucide="${icon}" class="w-4 h-4"></i> ${label}
        </h4>
        <ul class="space-y-1.5">${items.map(i => `
          <li class="text-sm font-semibold text-slate-600 flex gap-2"><span class="text-teal-500">•</span><span>${esc(i)}</span></li>`).join('')}</ul>
      </div>`;
  };

  const evidenceUpload = canEvidence() && a.status !== 'draft' && a.status !== 'published'
    ? `
      <div class="mb-4">
        <h4 class="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1.5">
          <i data-lucide="upload-cloud" class="w-4 h-4"></i> Cargar evidencias
        </h4>
        <input type="file" id="saEvidenceFiles" accept="image/*,video/*" multiple
          class="w-full text-xs font-bold text-slate-500 file:mr-3 file:px-4 file:py-2 file:rounded-xl file:border-0 file:bg-teal-50 file:text-teal-700 file:font-black file:cursor-pointer border border-dashed border-slate-300 rounded-xl p-2">
      </div>`
    : '';

  const gallery = evidences.length
    ? `<div class="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
        ${evidences.map(e => `
          <div class="relative group rounded-2xl overflow-hidden border border-slate-100 bg-slate-50">
            ${e.file_type === 'video'
              ? `<video src="${_escAttr(e.file_url)}" class="w-full h-32 object-cover" controls></video>`
              : `<img src="${_escAttr(e.file_url)}" alt="${_escAttr(e.caption || 'Evidencia')}" class="w-full h-32 object-cover cursor-pointer" onclick="SchoolActivities.lightbox('${_escAttr(e.file_url)}')">`}
            ${canEvidence() ? `<button data-sa-action="del-evidence" data-id="${e.id}" class="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all" title="Eliminar"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>` : ''}
          </div>`).join('')}
      </div>`
    : '';

  const notesBlock = a.teacher_notes
    ? `<div class="rounded-2xl bg-teal-50 border border-teal-100 p-4 mb-4">
        <h4 class="text-[11px] font-black uppercase tracking-widest text-teal-600 mb-1.5 flex items-center gap-1.5">
          <i data-lucide="notebook-pen" class="w-4 h-4"></i> Trabajo en el aula ${teacher ? `— ${esc(teacher.name)}` : ''}</h4>
        <p class="text-sm font-semibold text-slate-600 leading-relaxed whitespace-pre-line">${esc(a.teacher_notes)}</p>
      </div>`
    : '';

  // Acciones por rol
  const actions = [];
  if (canManage()) {
    if (a.status === 'draft') actions.push(`<button data-sa-action="status" data-id="${a.id}" data-status="scheduled" class="sa-btn-primary">📅 Planificar</button>`);
    if (a.status !== 'published') actions.push(`<button data-sa-action="publish" data-id="${a.id}" class="sa-btn-publish">👨‍👩‍👧 Publicar a Familias</button>`);
    if (a.status === 'published') actions.push(`<button data-sa-action="status" data-id="${a.id}" data-status="completed" class="sa-btn-ghost">↩ Quitar publicación</button>`);
    actions.push(`<button data-sa-action="edit" data-id="${a.id}" class="sa-btn-ghost"><i data-lucide="pencil" class="w-4 h-4"></i> Editar</button>`);
    actions.push(`<button data-sa-action="delete" data-id="${a.id}" class="sa-btn-danger"><i data-lucide="trash-2" class="w-4 h-4"></i> Eliminar</button>`);
  } else if (state.role === 'maestra' && ['scheduled', 'in_progress'].includes(a.status)) {
    actions.push(`<button data-sa-action="status" data-id="${a.id}" data-status="completed" class="sa-btn-primary">✓ Marcar como Actividad Realizada</button>`);
  }

  const teacherNotesEditor = state.role === 'maestra' && canEvidence() && a.status !== 'draft'
    ? `<div class="mb-4">
        <h4 class="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">Relato de la experiencia</h4>
        <textarea id="saTeacherNotes" rows="3" placeholder="¿Qué pasó en el aula? Anécdotas, niños destacados..."
          class="w-full rounded-xl border border-slate-200 p-3 text-sm font-semibold outline-none focus:border-teal-400">${esc(a.teacher_notes || '')}</textarea>
        <button data-sa-action="save-notes" data-id="${a.id}" class="mt-2 sa-btn-ghost">Guardar relato</button>
      </div>`
    : '';

  _openModal(`
    <div class="p-5 md:p-7">
      <div class="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-widest mb-4 pr-12">
        <span class="px-2.5 py-1.5 rounded-lg" style="background:${esc(a.color_hex || c.color)}1A;color:${esc(a.color_hex || c.color)}">${dateLabel}</span>
        <span class="px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-500">${c.emoji} ${esc(c.label)}</span>
        <span class="px-2.5 py-1.5 rounded-lg" style="background:${s.bg}1A;color:${s.bg}">${s.emoji} ${esc(s.label)}</span>
        ${room ? `<span class="px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-500">🏫 ${esc(room.name)}</span>` : ''}
      </div>

      <h2 class="text-xl md:text-2xl font-black text-slate-800 mb-3 pr-10">${esc(a.title)}</h2>
      <p class="text-sm font-semibold text-slate-500 leading-relaxed mb-5">${esc(a.description)}</p>

      ${a.start_time ? `<p class="text-xs font-black text-slate-400 mb-4">🕐 ${esc(a.start_time.slice(0, 5))}${a.end_time ? ` — ${esc(a.end_time.slice(0, 5))}` : ''}</p>` : ''}

      <div class="h-px bg-slate-100 my-4"></div>
      ${list('¿Qué trabajaremos?', 'que_trabajaremos', 'sparkles')}
      ${list('Objetivos de aprendizaje', 'objetivos', 'target')}
      ${list('Materiales e insumos', 'materiales', 'flask-conical')}
      ${list('Desarrollo / Guía de aula', 'desarrollo', 'clipboard-list')}

      <div class="h-px bg-slate-100 my-4"></div>
      ${notesBlock}
      ${teacherNotesEditor}
      ${evidenceUpload}
      ${gallery}

      ${actions.length ? `<div class="flex flex-wrap gap-2 pt-2 border-t border-slate-100 mt-2">${actions.join('')}</div>` : ''}
      ${state.mode === 'parent' ? `<p class="text-[11px] font-bold text-slate-400 mt-4 flex items-center gap-1.5"><i data-lucide="check-circle-2" class="w-4 h-4 text-teal-500"></i> Actividad compartida por el Colegio Montessori Sonrisas Creativas</p>` : ''}
    </div>
  `, true);
}

// ── formulario de creación/edición (§6) ─────────────────────────
function openForm(id = null) {
  if (!canManage()) return;
  const a = id ? state.activities.find(x => String(x.id) === String(id)) : null;
  const content = a?.content || {};
  const roomOpts = [`<option value="">🏫 Todo el colegio</option>`]
    .concat(state.classrooms.map(c =>
      `<option value="${c.id}" ${a && a.classroom_id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`)).join('');
  const teacherOpts = [`<option value="">— Sin asignar —</option>`]
    .concat(state.teachers.map(t =>
      `<option value="${t.id}" ${a && a.assigned_teacher_id === t.id ? 'selected' : ''}>${esc(t.name)}</option>`)).join('');
  const catOpts = Object.entries(CATEGORIES).map(([k, v]) =>
    `<option value="${k}" ${a && a.category === k ? 'selected' : ''}>${v.emoji} ${esc(v.label)}</option>`).join('');
  const color = a?.color_hex || CATEGORIES.general.color;
  const quickColors = ['#22C55E','#3B82F6','#A855F7','#F97316','#EC4899','#EAB308','#EF4444','#64748B'];

  _openModal(`
    <form id="saActivityForm" class="p-5 md:p-7 space-y-5" onsubmit="return false;">
      <div>
        <h3 class="text-lg font-black text-slate-800">${a ? 'Editar actividad' : 'Nueva actividad'}</h3>
        <p class="text-xs font-bold text-slate-400 mt-0.5">Planificación y experiencias de aprendizaje</p>
      </div>

      <div class="grid md:grid-cols-2 gap-4">
        <div class="md:col-span-2">
          <label class="sa-label">Título *</label>
          <input id="saTitle" required value="${_escAttr(a?.title || '')}" placeholder="Ej. Experimento: El ciclo del agua"
            class="sa-input" maxlength="140">
        </div>
        <div>
          <label class="sa-label">Fecha *</label>
          <input id="saDate" type="date" required value="${_escAttr(a?.activity_date || iso(state.year, state.month, 1))}" class="sa-input">
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="sa-label">Hora inicio</label><input id="saStart" type="time" value="${_escAttr(a?.start_time?.slice(0, 5) || '')}" class="sa-input"></div>
          <div><label class="sa-label">Hora fin</label><input id="saEnd" type="time" value="${_escAttr(a?.end_time?.slice(0, 5) || '')}" class="sa-input"></div>
        </div>
        <div>
          <label class="sa-label">Categoría pedagógica</label>
          <select id="saCategoryField" class="sa-input">${catOpts}</select>
        </div>
        <div>
          <label class="sa-label">Color</label>
          <div class="flex items-center gap-2 flex-wrap">
            ${quickColors.map(cc => `<button type="button" data-sa-action="pick-color" data-color="${cc}"
              class="w-7 h-7 rounded-full border-2 transition-transform ${color.toLowerCase() === cc ? 'border-slate-800 scale-110' : 'border-white'} shadow"
              style="background:${cc}"></button>`).join('')}
            <input id="saColor" type="color" value="${_escAttr(color)}" class="w-9 h-9 rounded-lg cursor-pointer border border-slate-200 bg-white">
          </div>
        </div>
        <div>
          <label class="sa-label">Nivel / Aula destino</label>
          <select id="saClassroomField" class="sa-input">${roomOpts}</select>
        </div>
        <div>
          <label class="sa-label">Docente responsable</label>
          <select id="saTeacherField" class="sa-input">${teacherOpts}</select>
        </div>
        <div class="md:col-span-2">
          <label class="sa-label">Descripción corta *</label>
          <textarea id="saDesc" required rows="2" class="sa-input" placeholder="Resumen para el feed de las familias...">${esc(a?.description || '')}</textarea>
        </div>
      </div>

      <div class="rounded-2xl bg-slate-50 border border-slate-100 p-4 space-y-3">
        <p class="text-[11px] font-black uppercase tracking-widest text-slate-400">Editor de contenido pedagógico</p>
        <div><label class="sa-label">¿Qué trabajaremos?</label><textarea id="saQue" rows="2" class="sa-input">${esc(content.que_trabajaremos || '')}</textarea></div>
        <div><label class="sa-label">Objetivos de aprendizaje</label><textarea id="saObj" rows="2" class="sa-input" placeholder="Uno por línea">${esc(content.objetivos || '')}</textarea></div>
        <div><label class="sa-label">Materiales e insumos</label><textarea id="saMat" rows="2" class="sa-input" placeholder="Uno por línea">${esc(content.materiales || '')}</textarea></div>
        <div><label class="sa-label">Desarrollo / Guía de aula</label><textarea id="saDesarrollo" rows="3" class="sa-input">${esc(content.desarrollo || '')}</textarea></div>
      </div>

      <div class="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
        <button type="button" data-sa-action="save-draft" data-id="${a?.id || ''}" class="sa-btn-ghost">💾 Guardar borrador</button>
        <button type="button" data-sa-action="save-plan" data-id="${a?.id || ''}" class="sa-btn-primary">📅 Guardar y planificar</button>
        <button type="button" data-sa-action="close-modal" class="sa-btn-ghost ml-auto">Cancelar</button>
      </div>
    </form>
  `, true);
}

function _readForm() {
  const val = (id) => document.getElementById(id)?.value?.trim() || '';
  const title = val('saTitle');
  const description = val('saDesc');
  const activity_date = val('saDate');
  if (!title || !description || !activity_date) {
    _toast('Título, fecha y descripción son obligatorios', 'error');
    return null;
  }
  const classroom = val('saClassroomField');
  return {
    title, description, activity_date,
    start_time: val('saStart') || null,
    end_time: val('saEnd') || null,
    category: val('saCategoryField') || 'general',
    color_hex: val('saColor') || '#64748B',
    classroom_id: classroom ? Number(classroom) : null,
    assigned_teacher_id: val('saTeacherField') || null,
    content: {
      que_trabajaremos: val('saQue'),
      objetivos: val('saObj'),
      materiales: val('saMat'),
      desarrollo: val('saDesarrollo')
    }
  };
}

async function _saveForm(id, status) {
  const payload = _readForm();
  if (!payload) return;
  payload.status = status;
  payload.school_year_id = (await SchoolYearGuard.getCurrentYear())?.id || null;

  let error;
  if (id) {
    ({ error } = await supabase.from('school_activities').update(payload).eq('id', id));
  } else {
    payload.created_by = state.userId;
    ({ error } = await supabase.from('school_activities').insert(payload));
  }
  if (error) { _toast('No se pudo guardar: ' + error.message, 'error'); return; }
  _toast(id ? 'Actividad actualizada' : (status === 'draft' ? 'Borrador guardado' : 'Actividad planificada'));
  _closeModal();
  const d = new Date(`${payload.activity_date}T12:00:00`);
  state.year = d.getFullYear();
  state.month = d.getMonth() + 1;
  _loadMonth();
}

// ── configuración temática del mes (§12) ────────────────────────
function openMonthConfig() {
  if (!canManage()) return;
  const cfg = state.monthConfig;
  _openModal(`
    <form id="saMonthForm" class="p-5 md:p-7 space-y-4" onsubmit="return false;">
      <div>
        <h3 class="text-lg font-black text-slate-800">Configuración temática del mes</h3>
        <p class="text-xs font-bold text-slate-400 mt-0.5">${MONTH_NAMES[state.month - 1]} ${state.year}</p>
      </div>
      <div><label class="sa-label">Nombre especial del mes *</label>
        <input id="saCfgTitle" required value="${_escAttr(cfg?.special_title || '')}" placeholder="Ej. Mes de la Naturaleza 🍃" class="sa-input"></div>
      <div><label class="sa-label">Frase / Eslogan</label>
        <input id="saCfgSlogan" value="${_escAttr(cfg?.slogan || '')}" placeholder="Ej. Exploramos y cuidamos nuestro mundo 🌎" class="sa-input"></div>
      <div class="grid grid-cols-2 gap-4">
        <div><label class="sa-label">Color distintivo</label>
          <input id="saCfgColor" type="color" value="${_escAttr(cfg?.primary_color || '#0D9488')}" class="w-full h-11 rounded-xl cursor-pointer border border-slate-200 bg-white"></div>
        <div><label class="sa-label">Imagen de portada (URL)</label>
          <input id="saCfgBanner" value="${_escAttr(cfg?.banner_url || '')}" placeholder="https://..." class="sa-input"></div>
      </div>
      <div><label class="sa-label">Mensaje para las familias</label>
        <textarea id="saCfgMsg" rows="3" class="sa-input" placeholder="Estimadas familias: durante este mes...">${esc(cfg?.family_message || '')}</textarea></div>
      <div class="flex gap-2 pt-2 border-t border-slate-100">
        <button type="button" data-sa-action="save-month-config" class="sa-btn-primary">Guardar tema del mes</button>
        <button type="button" data-sa-action="close-modal" class="sa-btn-ghost ml-auto">Cancelar</button>
      </div>
    </form>
  `);
}

async function _saveMonthConfig() {
  const val = (id) => document.getElementById(id)?.value?.trim() || '';
  const special_title = val('saCfgTitle');
  if (!special_title) { _toast('El nombre especial es obligatorio', 'error'); return; }
  const payload = {
    year_number: state.year,
    month_number: state.month,
    special_title,
    slogan: val('saCfgSlogan') || null,
    primary_color: val('saCfgColor') || '#0D9488',
    banner_url: val('saCfgBanner') || null,
    family_message: val('saCfgMsg') || null,
    school_year_id: (await SchoolYearGuard.getCurrentYear())?.id || null,
    created_by: state.userId
  };

  const { data: existing } = await supabase.from('school_month_configs')
    .select('id').eq('year_number', state.year).eq('month_number', state.month).maybeSingle();

  let error;
  if (existing) {
    ({ error } = await supabase.from('school_month_configs').update(payload).eq('id', existing.id));
  } else {
    ({ error } = await supabase.from('school_month_configs').insert(payload));
  }
  if (error) { _toast('No se pudo guardar: ' + error.message, 'error'); return; }
  _toast('Tema del mes guardado ✅');
  _closeModal();
  _loadMonth();
}

// ── acciones de estado / evidencias ─────────────────────────────
async function _setStatus(id, status) {
  const { error } = await supabase.from('school_activities')
    .update({ status }).eq('id', id);
  if (error) { _toast(error.message, 'error'); return; }
  _toast(`Estado actualizado: ${stOf(status).emoji} ${stOf(status).label}`);
  _closeModal();
  _loadMonth();
}

async function _publish(id) {
  const { error } = await supabase.rpc('publish_school_activity', { p_activity_id: Number(id) });
  if (error) {
    // Fallback si la RPC aún no está desplegada
    const { error: e2 } = await supabase.from('school_activities')
      .update({ status: 'published', published_at: new Date().toISOString() }).eq('id', id);
    if (e2) { _toast(e2.message, 'error'); return; }
  }
  _toast('Actividad publicada a las familias 👨‍👩‍👧');
  _closeModal();
  _loadMonth();
}

async function _deleteActivity(id) {
  const ok = await _confirm('¿Eliminar actividad?', 'Esta acción no se puede deshacer.');
  if (!ok) return;
  const { error } = await supabase.from('school_activities').delete().eq('id', id);
  if (error) { _toast(error.message, 'error'); return; }
  _toast('Actividad eliminada');
  _closeModal();
  _loadMonth();
}

async function _saveNotes(id) {
  const notes = document.getElementById('saTeacherNotes')?.value ?? null;
  if (notes === null) return;
  const patch = { teacher_notes: notes };
  const { error } = await supabase.from('school_activities').update(patch).eq('id', id);
  if (error) { _toast(error.message, 'error'); return; }
  _toast('Relato guardado');
  const a = state.activities.find(x => String(x.id) === String(id));
  if (a) a.teacher_notes = notes;
}

async function _uploadEvidences(id) {
  const input = document.getElementById('saEvidenceFiles');
  const files = input?.files;
  if (!files || !files.length) { _toast('Selecciona al menos una foto', 'error'); return; }
  if (files.length > 8) { _toast('Máximo 8 archivos por carga', 'error'); return; }

  _toast('Subiendo evidencias...', 'info');
  let ok = 0;
  for (const file of files) {
    if (file.size > 8 * 1024 * 1024) { _toast(`${file.name}: máximo 8MB`, 'error'); continue; }
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace('jpeg', 'jpg');
    const path = `activities/${id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    let publicUrl = null;
    for (const bucket of ['karpus-uploads', 'classroom_media']) {
      const { error: upErr } = await supabase.storage.from(bucket)
        .upload(path, file, { upsert: true, contentType: file.type });
      if (!upErr) {
        const { data } = supabase.storage.from(bucket).getPublicUrl(path);
        publicUrl = data.publicUrl;
        break;
      }
    }
    if (!publicUrl) continue;
    const { error: insErr } = await supabase.from('school_activity_evidences').insert({
      activity_id: Number(id),
      file_url: publicUrl,
      file_type: file.type.startsWith('video') ? 'video' : 'image',
      caption: file.name,
      uploaded_by: state.userId
    });
    if (!insErr) ok++;
  }
  if (input) input.value = '';
  _toast(`${ok} evidencia(s) cargada(s)`);
  openDetail(id);
  _loadMonth();
}

async function _deleteEvidence(id) {
  const ok = await _confirm('¿Eliminar evidencia?', 'La foto o video se borrará definitivamente.');
  if (!ok) return;
  const { error } = await supabase.from('school_activity_evidences').delete().eq('id', id);
  if (error) { _toast(error.message, 'error'); return; }
  _toast('Evidencia eliminada');
}

function _lightbox(url) {
  if (window.Lightbox?.open) { window.Lightbox.open(url); return; }
  window.open(url, '_blank');
}

// ── eventos (delegación) ────────────────────────────────────────
async function _handleAction(e) {
  const el = e.target.closest('[data-sa-action]');
  if (!el) return;
  const action = el.dataset.saAction;
  const id = el.dataset.id;

  switch (action) {
    case 'close-modal': _closeModal(); break;
    case 'prev-month': state.month--; if (state.month < 1) { state.month = 12; state.year--; } _loadMonth(); break;
    case 'next-month': state.month++; if (state.month > 12) { state.month = 1; state.year++; } _loadMonth(); break;
    case 'today': state.year = new Date().getFullYear(); state.month = new Date().getMonth() + 1; _loadMonth(); break;
    case 'view': state.view = el.dataset.view; _render(); break;
    case 'open': openDetail(id); break;
    case 'day': _openDay(Number(el.dataset.day)); break;
    case 'new': openForm(); break;
    case 'edit': openForm(id); break;
    case 'delete': _deleteActivity(id); break;
    case 'publish': _publish(id); break;
    case 'status': _setStatus(id, el.dataset.status); break;
    case 'save-draft': _saveForm(id || null, 'draft'); break;
    case 'save-plan': _saveForm(id || null, 'scheduled'); break;
    case 'month-config': openMonthConfig(); break;
    case 'save-month-config': _saveMonthConfig(); break;
    case 'save-notes': await _saveNotes(id); break;
    case 'del-evidence': { const aid = state.detailId; await _deleteEvidence(id); openDetail(aid); break; }
    case 'pick-color': {
      const colorInput = document.getElementById('saColor');
      if (colorInput) colorInput.value = el.dataset.color;
      document.querySelectorAll('[data-sa-action="pick-color"]').forEach(b => b.classList.remove('border-slate-800', 'scale-110'));
      el.classList.add('border-slate-800', 'scale-110');
      break;
    }
    case 'filter-category': break;
    default: break;
  }
}

function _handleInput(e) {
  const el = e.target.closest('[data-sa-action]');
  if (!el) return;
  if (el.dataset.saAction === 'filter-q') {
    state.filters.q = el.value;
    clearTimeout(_debounceQ);
    _debounceQ = setTimeout(() => {
      const pos = el.selectionStart;
      _render();
      const again = document.getElementById('saSearch');
      if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch (_) {} }
    }, 280);
  }
}

function _handleChange(e) {
  const el = e.target.closest('[data-sa-action]');
  if (!el) return;
  const map = { 'filter-category': 'category', 'filter-teacher': 'teacher', 'filter-classroom': 'classroom' };
  const key = map[el.dataset.saAction];
  if (key) { state.filters[key] = el.value; _render(); }
}

let _debounceQ = null;
let _bound = false;

function _bind() {
  if (_bound) return;
  _bound = true;
  document.addEventListener('click', (e) => {
    if (!document.getElementById(state.containerId) &&
        !e.target.closest('[data-sa-action]')) return;
    _handleAction(e);
    // Subida de evidencias (input file)
    const ev = e.target.closest('[data-sa-action="open"]');
    if (ev) setTimeout(_bindEvidenceInput, 300);
  });
  // Doble clic → leer actividad completa en modal (feed de padres)
  document.addEventListener('dblclick', (e) => {
    const el = e.target.closest('[data-sa-dblopen]');
    if (el && el.dataset.saDblopen) openDetail(el.dataset.saDblopen);
  });
  document.addEventListener('input', _handleInput);
  document.addEventListener('change', (e) => {
    if (e.target.id === 'saEvidenceFiles') {
      if (state.detailId && state.detailId !== 'false') _uploadEvidences(state.detailId);
      return;
    }
    _handleChange(e);
  });
}

function _bindEvidenceInput() { /* la subida se dispara vía change de #saEvidenceFiles */ }

// ── API pública ─────────────────────────────────────────────────
export const SchoolActivitiesModule = {
  CATEGORIES,
  STATUS,

  async init(opts = {}) {
    state.mode = opts.mode || 'admin';
    state.containerId = opts.containerId || 'actividadesContent';
    state.filters = { q: '', category: '', teacher: '', classroom: '' };
    state.view = 'grid';

    try {
      const { data: userData } = await supabase.auth.getUser();
      state.userId = userData?.user?.id || null;
    } catch (_) { state.userId = null; }

    if (opts.profile) {
      state.profile = opts.profile;
      state.role = opts.profile.role || '';
    } else if (state.userId) {
      const { data: prof } = await supabase.from('profiles')
        .select('id, name, role').eq('id', state.userId).maybeSingle();
      state.profile = prof || null;
      state.role = prof?.role || '';
    }

    const now = new Date();
    if (!opts.keepMonth) { state.year = now.getFullYear(); state.month = now.getMonth() + 1; }

    window.SchoolActivities = this;
    _bind();
    await _loadReference();
    await _loadMonth();
  },

  async refresh() {
    await _loadReference();
    await _loadMonth();
  },

  goToMonth(y, m) { state.year = y; state.month = m; _loadMonth(); },
  setView(v) { state.view = v; _render(); },
  openDetail,
  openForm,
  openMonthConfig,
  lightbox: _lightbox,

  // Atajos para onclick externos
  prevMonth() { document.querySelector('[data-sa-action="prev-month"]')?.click(); },
  nextMonth() { document.querySelector('[data-sa-action="next-month"]')?.click(); }
};

// Estilos usados por la sección (contenedor, tarjetas, formularios).
// Se inyectan UNA sola vez. Paleta Sonrisas Creativas:
//   verde #28B54D / #239943 · naranja #FF8A00 / #E07900 · rojo #EF4444
//   gris #64748B / bordes #E2E8F0 · texto #0F172A / #1E293B
const SA_CSS = `
/* ── Contenedor de la sección ───────────────────────────── */
#actividadesContent{color-scheme:light;max-width:1400px;margin:0 auto;font-family:'Nunito',sans-serif}

/* ── Etiquetas de formulario ────────────────────────────── */
.sa-label{display:block;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#64748B;margin-bottom:6px}

/* ── Campos ─────────────────────────────────────────────── */
.sa-input{width:100%;border:1px solid #E2E8F0;border-radius:14px;padding:12px 14px;font-size:14px;font-weight:600;color:#1E293B;outline:none;background:#fff;transition:all .18s ease;font-family:inherit}
.sa-input:focus{border-color:#28B54D;box-shadow:0 0 0 4px rgba(40,181,77,.14)}
.sa-input::placeholder{color:#94A3B8;font-weight:600}
textarea.sa-input{resize:vertical;line-height:1.5}
select.sa-input{cursor:pointer}

/* ── Botones (acción principal = verde) ─────────────────── */
.sa-btn-primary,.sa-btn-ghost,.sa-btn-danger,.sa-btn-publish{display:inline-flex;align-items:center;gap:6px;border-radius:14px;padding:12px 22px;font-size:12px;font-weight:900;letter-spacing:.02em;cursor:pointer;transition:all .18s ease;border:1px solid transparent;line-height:1}
.sa-btn-primary:active,.sa-btn-ghost:active,.sa-btn-danger:active,.sa-btn-publish:active{transform:translateY(1px)}
.sa-btn-primary{background:#28B54D;color:#fff;box-shadow:0 6px 16px rgba(40,181,77,.28)}
.sa-btn-primary:hover{background:#239943}
.sa-btn-publish{background:#FF8A00;color:#fff;box-shadow:0 6px 16px rgba(255,138,0,.28)}
.sa-btn-publish:hover{background:#E07900}
.sa-btn-ghost{background:#F1F5F9;color:#475569;border-color:#E2E8F0}
.sa-btn-ghost:hover{background:#E2E8F0;color:#0F172A}
.sa-btn-danger{background:#EF4444;color:#fff;border-color:#DC2626;box-shadow:0 6px 16px rgba(239,68,68,.22)}
.sa-btn-danger:hover{background:#DC2626}

/* ── Variantes utilitarias que faltan en montessori-tailwind ── */
@media (min-width:768px){
  [class~="md:p-4"]{padding:1rem}
  [class~="md:p-5"]{padding:1.25rem}
  [class~="md:p-7"]{padding:1.75rem}
  [class~="md:gap-2"]{gap:.5rem}
  [class~="md:text-xs"]{font-size:.75rem;line-height:1rem}
  [class~="md:text-base"]{font-size:1rem;line-height:1.5rem}
  [class~="md:text-xl"]{font-size:1.25rem;line-height:1.75rem}
}
[class~="active:scale-[.995]"]:active{transform:scale(.995)}
[class~="hover:shadow-md"]:hover{box-shadow:0 10px 24px rgba(15,23,42,.08)}

/* ── Input de archivo ───────────────────────────────────── */
#actividadesContent input[type=file]::file-selector-button{margin-right:12px;padding:8px 16px;border:0;border-radius:12px;background:#E6F7EB;color:#239943;font-weight:800;font-size:12px;cursor:pointer;transition:background .15s}
#actividadesContent input[type=file]::file-selector-button:hover{background:#D1F2DC}

/* ── Paleta del colegio sobre los acentos teal del módulo ─ */
#actividadesContent .text-teal-500{color:#28B54D}
#actividadesContent .text-teal-600,#actividadesContent .text-teal-700{color:#239943}
#actividadesContent .bg-teal-50{background-color:#E6F7EB}
#actividadesContent .bg-teal-600,#actividadesContent .bg-teal-700{background-color:#28B54D}
#actividadesContent [class~="hover:bg-teal-700"]:hover{background-color:#239943}
#actividadesContent [class~="hover:text-teal-700"]:hover{color:#239943}
#actividadesContent [class~="hover:bg-teal-50"]:hover{background-color:#E6F7EB}
#actividadesContent .border-teal-100{border-color:#C8EFD5}
#actividadesContent .border-teal-400,#actividadesContent .border-teal-500{border-color:#28B54D}
#actividadesContent [class~="hover:border-teal-300"]:hover{border-color:#7BD696}
#actividadesContent [class~="focus:border-teal-400"]:focus{border-color:#28B54D}

.line-clamp-2{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}

/* ══ Calendario: panel gris destacado + días con borde de contraste ══ */
.sa-cal{background:linear-gradient(180deg,#E9EEF4 0%,#DEE6EF 100%);border:1px solid #C6D1DF;box-shadow:0 12px 32px rgba(15,23,42,.12);padding:12px}
@media(min-width:768px){.sa-cal{padding:16px}}
.sa-wd{font-size:10px;color:#475569;background:rgba(100,116,139,.20);border-radius:.55rem;padding:7px 4px;letter-spacing:.14em}
@media(min-width:768px){.sa-wd{font-size:12px;padding:8px 4px}}
.sa-cell{background:#fff;border:1px solid #C7D0DB;border-radius:.9rem;padding:6px;min-height:96px;display:flex;flex-direction:column;gap:4px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,.06);transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease}
.sa-cell:hover{transform:translateY(-2px);border-color:#8FA0B5;box-shadow:0 10px 22px rgba(15,23,42,.14)}
.sa-cell-empty{background:rgba(226,232,240,.50);border:1px dashed #C7D0DB;box-shadow:none}
.sa-cell-empty:hover{transform:none;border-color:#C7D0DB;box-shadow:none}
.sa-cell-today{border-color:#28B54D;outline:2px solid rgba(40,181,77,.28);outline-offset:0}
.sa-day-count{height:18px;min-width:18px;padding:0 5px;border-radius:999px;background:#475569;color:#fff;font-size:9px;font-weight:900;display:inline-flex;align-items:center;justify-content:center}

/* ══ Eventos: emoji grande con animación ══ */
.sa-chip{display:flex;align-items:center;gap:6px;transition:transform .18s ease,filter .18s ease}
.sa-chip:hover{transform:translateY(-1px) translateX(1px);filter:brightness(1.05)}
.sa-chip:active{transform:scale(.98)}
.sa-emoji{font-size:18px;line-height:1.1;flex:0 0 auto;display:inline-block;animation:saPop .45s cubic-bezier(.2,.85,.3,1.5) both}
.sa-chip:hover .sa-emoji{animation:saWiggle .5s ease}
@keyframes saPop{0%{transform:scale(.2) rotate(-14deg);opacity:0}70%{transform:scale(1.16) rotate(3deg);opacity:1}100%{transform:scale(1) rotate(0);opacity:1}}
@keyframes saWiggle{0%,100%{transform:rotate(0) scale(1)}25%{transform:rotate(-14deg) scale(1.14)}75%{transform:rotate(10deg) scale(1.1)}}

/* ══ Entrada animada de la sección (stagger) ══ */
.sa-anim{animation:saFadeUp .5s ease both}
#actividadesContent .space-y-5>.sa-anim:nth-child(1){animation-delay:.04s}
#actividadesContent .space-y-5>.sa-anim:nth-child(2){animation-delay:.10s}
#actividadesContent .space-y-5>.sa-anim:nth-child(3){animation-delay:.16s}
#actividadesContent .space-y-5>.sa-anim:nth-child(4){animation-delay:.22s}
#actividadesContent .space-y-5>.sa-anim:nth-child(5){animation-delay:.28s}
#actividadesContent .space-y-5>.sa-anim:nth-child(6){animation-delay:.34s}
@keyframes saFadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}

/* ══ Feed padres: contenedores pequeños, doble clic = modal ══ */
.sa-upc{transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease}
.sa-upc:hover{transform:translateY(-2px);border-color:#C7D0DB;box-shadow:0 10px 24px rgba(15,23,42,.10)}
.sa-upc:hover .sa-upc-hint{background:#E6F7EB;color:#239943}
.sa-upc-hint{transition:background .18s ease,color .18s ease}

/* ══ Filas de la vista lista: elevación al hover ══ */
#actividadesContent [data-sa-action="open"]{transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease}
#actividadesContent [data-sa-action="open"]:hover{transform:translateY(-1px)}
`;
if (typeof document !== 'undefined' && !document.getElementById('saActivitiesCss')) {
  const style = document.createElement('style');
  style.id = 'saActivitiesCss';
  style.textContent = SA_CSS;
  document.head.appendChild(style);
}
