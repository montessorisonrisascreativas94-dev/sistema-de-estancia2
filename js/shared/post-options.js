/**
 * PostOptions - Opciones avanzadas del Muro Escolar.
 *
 * Permite al publicar elegir:
 *  - Visibilidad: general (todos los padres) o un solo estudiante.
 *  - Permitir o bloquear la descarga de las fotos.
 *  - Activar la proteccin contra capturas de pantalla.
 *
 * Requiere las columnas `student_id`, `allow_download` y `protect_capture`
 * en public.posts (ver sql/08_muro_privado.sql). Si an no existen, el
 * insert se reintenta sin ellas y se avisa una sola vez.
 */

import { supabase } from './supabase.js';

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const EXTRA_FIELDS = ['student_id', 'allow_download', 'protect_capture'];

export const PostOptions = {
  _studentsCache: new Map(),
  _degradedWarned: false,
  _lastStudentId: null,

  html() {
    return `
      <div id="poBox" class="mt-4 rounded-2xl border-2 border-slate-100 bg-slate-50/70 p-4 space-y-3">
        <div class="flex items-center gap-2">
          <i data-lucide="shield-check" class="w-4 h-4 text-slate-500"></i>
          <span class="text-[10px] font-black uppercase tracking-widest text-slate-500">Opciones de la publicacin</span>
        </div>

        <div class="flex items-center justify-between gap-3">
          <label class="text-xs font-bold text-slate-600 whitespace-nowrap">Visibilidad</label>
          <select id="poVisibility" class="flex-1 max-w-[230px] px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 outline-none focus:border-[#0B63C7]">
            <option value="general">General  todos los padres</option>
            <option value="student">Solo un estudiante</option>
          </select>
        </div>

        <div id="poStudentWrap" class="hidden items-center justify-between gap-3">
          <label class="text-xs font-bold text-slate-600 whitespace-nowrap">Estudiante</label>
          <select id="poStudent" class="flex-1 max-w-[230px] px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 outline-none focus:border-[#0B63C7]">
            <option value="">Cargando...</option>
          </select>
        </div>

        <label class="flex items-center gap-2.5 cursor-pointer select-none">
          <input type="checkbox" id="poAllowDownload" checked class="w-4 h-4 rounded accent-[#0B63C7]">
          <span class="text-xs font-bold text-slate-600">Permitir descargar las fotos</span>
        </label>

        <label class="flex items-center gap-2.5 cursor-pointer select-none">
          <input type="checkbox" id="poProtect" class="w-4 h-4 rounded accent-[#0B63C7]">
          <span class="text-xs font-bold text-slate-600">No permitir capturas de pantalla</span>
        </label>

        <p id="poHint" class="hidden text-[10px] font-bold text-amber-600 leading-snug"></p>
      </div>
    `;
  },

  async mount({ anchor, classroomSelectId = null, classroomId = null, position = 'before' } = {}) {
    const host = typeof anchor === 'string' ? document.getElementById(anchor) : anchor;
    if (!host) return;
    const existing = document.getElementById('poBox');
    if (existing && existing.isConnected && existing.parentElement?.contains(host)) return;

    host.insertAdjacentHTML(position === 'after' ? 'afterend' : 'beforebegin', this.html());
    if (window.lucide) window.lucide.createIcons();

    const visSel = document.getElementById('poVisibility');
    const wrap = document.getElementById('poStudentWrap');
    const hint = document.getElementById('poHint');
    const studentSel = document.getElementById('poStudent');

    const showHint = (text) => {
      if (!hint) return;
      hint.textContent = text;
      hint.classList.toggle('hidden', !text);
    };

    const currentClassroom = () => {
      let id = classroomId;
      if (classroomSelectId) {
        const v = document.getElementById(classroomSelectId)?.value;
        id = v ? Number(v) : null;
      }
      return id || null;
    };

    const fillStudents = async () => {
      const list = await this.loadStudents(currentClassroom());
      if (!studentSel) return;
      if (!list.length) {
        studentSel.innerHTML = '<option value="">Sin estudiantes</option>';
        showHint('No se encontraron estudiantes para esta aula.');
        return;
      }
      showHint('');
      studentSel.innerHTML = '<option value="">Selecciona un estudiante</option>' +
        list.map((s) => `<option value="${s.id}">${esc(s.name || 'Estudiante')}</option>`).join('');
    };

    visSel?.addEventListener('change', async () => {
      const onlyOne = visSel.value === 'student';
      wrap?.classList.toggle('hidden', !onlyOne);
      wrap?.classList.toggle('flex', onlyOne);
      if (onlyOne) await fillStudents();
    });

    document.getElementById(classroomSelectId)?.addEventListener('change', () => {
      if (visSel?.value === 'student') fillStudents();
    });

    await fillStudents();
    return true;
  },

  async loadStudents(classroomId) {
    const key = classroomId ? `c${classroomId}` : 'all';
    if (this._studentsCache.has(key)) return this._studentsCache.get(key);

    let rows = null;
    let q = supabase.from('students').select('id, name, classroom_id').order('name').limit(600);
    if (classroomId) q = q.eq('classroom_id', classroomId);
    let res = await q;
    if (res.error) {
      let q2 = supabase.from('students').select('id, name, classroom_id').order('name').limit(600);
      if (classroomId) q2 = q2.eq('classroom_id', classroomId);
      res = await q2;
    }
    rows = (res.data || []).filter((s) => s && s.id != null && s.name);
    this._studentsCache.set(key, rows);
    return rows;
  },

  collect() {
    const box = document.getElementById('poBox');
    if (!box) return {};
    const visibility = document.getElementById('poVisibility')?.value || 'general';
    const studentId = visibility === 'student'
      ? Number(document.getElementById('poStudent')?.value || 0)
      : null;

    if (visibility === 'student' && !studentId) {
      throw new Error('Selecciona el estudiante que podr ver esta publicacin');
    }

    return {
      student_id: studentId || null,
      allow_download: document.getElementById('poAllowDownload')?.checked !== false,
      protect_capture: !!document.getElementById('poProtect')?.checked
    };
  },

  isMissingColumn(error) {
    if (!error) return false;
    const code = String(error.code || '');
    const msg = String(error.message || error.details || '').toLowerCase();
    return code === 'PGRST204'
      || msg.includes('could not find the')
      || msg.includes("column public.posts.")
      || (msg.includes('column') && msg.includes('does not exist'));
  },

  /**
   * Carga publicaciones visibles para un estudiante: las generales del aula
   * (student_id NULL) más las privadas de ese alumno. Si la migración aún no
   * está aplicada, reintenta sin la columna `student_id`.
   */
  async fetchStudentPosts({ studentId, classroomId, select = '*', limit = 30 } = {}) {
    const baseSelect = select;
    const withPrivate = baseSelect.includes('student_id')
      ? baseSelect
      : baseSelect.replace('*', '*, student_id, allow_download, protect_capture');

    const build = (withCols) => {
      let q = supabase.from('posts').select(withCols ? withPrivate : baseSelect)
        .or(`classroom_id.is.null,classroom_id.eq.${classroomId || 0}`)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (withCols) q = q.or(`student_id.is.null,student_id.eq.${studentId || 0}`);
      return q;
    };

    let res = await build(true);
    if (res.error && this.isMissingColumn(res.error)) {
      res = await build(false);
    }
    if (res.error) throw res.error;
    return this.filterForStudent(res.data || [], studentId);
  },

  /** Filtra publicaciones privadas de otros estudiantes. */

  _warnDegraded() {
    if (this._degradedWarned) return;
    this._degradedWarned = true;
    console.warn('[PostOptions] Columnas student_id/allow_download/protect_capture no existen. ' +
      'Ejecuta sql/08_muro_privado.sql en Supabase. Se public sin las opciones.');
    if (window.Helpers?.toast) {
      window.Helpers.toast('Publicado sin opciones del muro: falta aplicar sql/08_muro_privado.sql', 'warning');
    }
  },

  /**
   * Inserta un post aplicando las opciones del modal. Reintenta sin las
   * columnas nuevas si la migracin an no est aplicada.
   */
  async insertPost(basePayload) {
    const extras = this.collect();
    const payload = { ...basePayload, ...extras };

    let res = await supabase.from('posts').insert(payload).select('id, created_at');
    if (res.error && this.isMissingColumn(res.error)) {
      this._warnDegraded();
      const fallback = { ...basePayload };
      res = await supabase.from('posts').insert(fallback).select('id, created_at');
      return { data: (res.data && res.data[0]) || null, error: res.error, degraded: true };
    }
    return { data: (res.data && res.data[0]) || null, error: res.error, degraded: false };
  },

  /** Filtra publicaciones privadas de otros estudiantes. */
  filterForStudent(posts, studentId) {
    const sid = Number(studentId);
    return (posts || []).filter((p) => {
      if (!p || p.student_id == null) return true;
      return Number(p.student_id) === sid;
    });
  },

  isDownloadAllowed(post) {
    return !post || post.allow_download !== false;
  },

  isCaptureProtected(post) {
    return !!(post && post.protect_capture === true);
  },

  extraSelectFields() {
    return EXTRA_FIELDS.join(', ');
  },

  async studentName(studentId) {
    const id = Number(studentId);
    for (const list of this._studentsCache.values()) {
      const found = list.find((s) => Number(s.id) === id);
      if (found) return found.name;
    }
    try {
      const { data } = await supabase.from('students').select('name').eq('id', id).maybeSingle();
      return data?.name || null;
    } catch (_) {
      return null;
    }
  }
};
