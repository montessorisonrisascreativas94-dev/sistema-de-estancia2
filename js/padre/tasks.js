import { supabase } from '../shared/supabase.js';
import { AppState, TABLES } from './appState.js';
import { Helpers, escapeHtml } from '../shared/helpers.js';
import { Security } from '../shared/security.js';


/**
 * 🎒 MÓDULO DE TAREAS (PADRES)
 */
export const TasksModule = {
  _studentId: null,
  _cachedTasks: [],

  /**
   * Inicializa el módulo
   */
  async init(studentId) {
    if (!studentId) return;
    this._studentId = studentId;

    this._initFilters();

    // Delegación para acciones de tareas (Enviar/Ver) + lightbox
    const list = document.getElementById('tasksList');
    if (list && !list._initialized) {
      Helpers.delegate(list, '[data-action="submit"]', 'click', (e, btn) => {
        this.openSubmitModal(btn.dataset.id);
      });
      Helpers.delegate(list, '[data-action="view"]', 'click', (e, btn) => {
        this.viewEvidence(btn.dataset.id);
      });
      list.addEventListener('click', (e) => {
        const lb = e.target.closest('[data-lightbox-url]');
        if (lb && window.openLightbox) {
          window.openLightbox(lb.dataset.lightboxUrl, lb.dataset.lightboxType || 'image');
        }
      });
      list._initialized = true;
    }

    await this.loadTasks('pending');
  },

  /**
   * Segmentado Por hacer / Tarde / Listas.
   * Antes buscaba un contenedor por clases de Tailwind que ya no existían en el
   * markup, así que los botones nunca respondían. Ahora se ancla al id estable.
   */
  _initFilters() {
    const bar = document.getElementById('tasksFilters');
    if (!bar || bar._initialized) return;

    bar.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-filter]');
      if (!btn || !bar.contains(btn)) return;
      this._setActiveFilter(btn.dataset.filter || 'pending');
      this.loadTasks(btn.dataset.filter || 'pending');
    });

    // Flechas izquierda/derecha para navegar los tabs con teclado
    bar.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const tabs = [...bar.querySelectorAll('[data-filter]')];
      const i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      next.focus();
      this._setActiveFilter(next.dataset.filter);
      this.loadTasks(next.dataset.filter);
    });

    bar._initialized = true;
  },

  _setActiveFilter(filter) {
    const bar = document.getElementById('tasksFilters');
    if (!bar) return;
    bar.querySelectorAll('[data-filter]').forEach(b => {
      const on = b.dataset.filter === filter;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  },

  _updateCounts(evidenceMap, tasks) {
    const now = new Date();
    const counts = { pending: 0, overdue: 0, submitted: 0 };
    (tasks || []).forEach(t => {
      const delivered = evidenceMap.has(t.id);
      if (delivered) { counts.submitted++; return; }
      if (t.due_date && new Date(t.due_date) < now) { counts.overdue++; return; }
      counts.pending++;
    });
    document.querySelectorAll('#tasksFilters [data-count]').forEach(el => {
      const n = counts[el.dataset.count];
      if (typeof n === 'number') el.textContent = String(n);
    });
  },

  /**
   * Abre modal para enviar tarea
   */
  async openSubmitModal(taskId) {
    try {
      // Use cached tasks from loadTasks to avoid RLS 406 error (parents can't query tasks directly)
      let task = this._cachedTasks.find(t => String(t.id) === String(taskId));
      if (!task) {
        // Fallback: try RPC if cache is empty
        try {
          const student = AppState.get('currentStudent');
          const { data: rpcData } = await supabase.rpc('get_tasks_for_period', {
            p_classroom_id: student?.classroom_id,
            p_period_id: null
          });
          task = (rpcData?.tasks || []).find(t => String(t.id) === String(taskId));
        } catch (_) {}
      }
      if (!task) throw new Error('Tarea no encontrada');

      const modal = document.getElementById('modalTaskDetail');
      if (!modal) return;

      document.getElementById('taskDetailTitle').textContent = task.title;
      document.getElementById('taskDetailDate').innerHTML = `<i data-lucide="calendar" class="w-3 h-3"></i> Vence: ${Helpers.formatDate(task.due_date)}`;
      document.getElementById('taskDetailDesc').textContent = task.description || 'Sin descripción.';
      
      // Reset form
      document.getElementById('uploadSection').classList.remove('hidden');
      document.getElementById('evidenceSection').classList.add('hidden');
      document.getElementById('taskFileInput').value = '';
      document.getElementById('fileNameDisplay').textContent = 'Toca para subir tu tarea';
      document.getElementById('taskCommentInput').value = '';
      
      // Store current task ID in modal for submit
      modal.dataset.currentTaskId = taskId;

      modal.classList.remove('hidden');
      modal.classList.add('flex');
      if (window.lucide) lucide.createIcons();

      // Setup close and submit listeners once
      if (!modal._initialized) {
        document.getElementById('btnCloseTaskDetail').onclick = () => modal.classList.add('hidden');
        document.getElementById('btnSubmitTask').onclick = () => this.submitTask();
        
        document.getElementById('taskFileInput').onchange = (e) => {
          const file = e.target.files[0];
          if (file) {
            document.getElementById('fileNameDisplay').textContent = file.name;
          }
        };
        modal._initialized = true;
      }
    } catch (e) {
      Helpers.toast('Error al abrir detalle de tarea', 'error');
    }
  },

  /**
   * Envía la evidencia de la tarea
   */
  async submitTask() {
    const modal = document.getElementById('modalTaskDetail');
    const taskId = modal.dataset.currentTaskId;
    const student = AppState.get('currentStudent');
    const user = AppState.get('user');

    const fileInput = document.getElementById('taskFileInput');
    const file = fileInput.files[0];
    const comment = document.getElementById('taskCommentInput').value.trim();

    if (!file) return Helpers.toast('Debes adjuntar un archivo', 'warning');

    // 🛡️ Validación de tamaño (Máx 5MB)
    if (file.size > 5 * 1024 * 1024) return Helpers.toast('El archivo es muy grande (máx 5MB)', 'error');

    try {
      AppState.set('loading', true);
      Helpers.toast('Enviando misión...', 'info');

      const ext = file.name.split('.').pop().toLowerCase();
      const path = `evidences/${student.id}_${taskId}_${Date.now()}.${ext}`;

      const { error: upErr } = await supabase.storage.from('classroom_media').upload(path, file);
      if (upErr) throw upErr;

      const { data: { publicUrl } } = supabase.storage.from('classroom_media').getPublicUrl(path);

      // FIX 409: Check if evidence already exists for this student+task.
      // Use upsert on (task_id, student_id) to avoid unique-constraint conflicts.
      const { data: existing } = await supabase
        .from(TABLES.TASK_EVIDENCES)
        .select('id')
        .eq('task_id', taskId)
        .eq('student_id', student.id)
        .maybeSingle();

      const payload = {
        task_id:    taskId,
        student_id: student.id,
        parent_id:  user.id,
        file_url:   publicUrl,
        comment,
        status:     'submitted'
      };

      let evidenceError;
      if (existing?.id) {
        // Already submitted — update instead of inserting a duplicate
        const { error } = await supabase
          .from(TABLES.TASK_EVIDENCES)
          .update({ file_url: publicUrl, comment, status: 'submitted' })
          .eq('id', existing.id);
        evidenceError = error;
      } else {
        const { error } = await supabase.from(TABLES.TASK_EVIDENCES).insert(payload);
        evidenceError = error;
      }

      if (evidenceError) throw evidenceError;

      // ✅ ÉXITO: Confetti y Mensaje Motivador
      if (window.confetti) {
        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#f59e0b', '#3b82f6', '#10b981']
        });
      }

      Helpers.toast('¡Misión cumplida! Tarea enviada', 'success');
      
      // Mostrar mensaje de éxito bonito
      window.openGlobalModal(`
        <div class="bg-white rounded-[2.5rem] p-8 text-center animate-scaleIn w-full max-w-sm">
          <div class="w-20 h-20 bg-orange-100 text-orange-600 rounded-3xl flex items-center justify-center mx-auto mb-6 text-4xl shadow-lg shadow-orange-50">🚀</div>
          <h3 class="text-2xl font-black text-slate-800 mb-2">¡Tarea Enviada!</h3>
          <p class="text-sm font-bold text-slate-500 leading-relaxed mb-6">
            ¡Misión cumplida! La maestra revisará tu tarea pronto. ¡Sigue así! 🌟
          </p>
          <button onclick="UIHelpers.closeModal()" class="w-full py-4 bg-orange-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-orange-100 active:scale-95 transition-all">
            ¡Entendido!
          </button>
        </div>
      `);

      modal.classList.add('hidden');
      try { await this.loadTasks('pending'); } catch (_) {}

    } catch (e) {
      Helpers.toast('Error al enviar tarea', 'error');
    } finally {
      AppState.set('loading', false);
    }
  },

  /**
   * Ver evidencia ya enviada
   */
  async viewEvidence(taskId) {
    try {
      const student = AppState.get('currentStudent');
      // Query WITHOUT joining tasks table (RLS blocks parents from tasks)
      const { data: evidence, error } = await supabase
        .from(TABLES.TASK_EVIDENCES)
        .select('id, task_id, file_url, comment, created_at, status')
        .eq('task_id', taskId)
        .eq('student_id', student.id)
        .single();

      if (error) throw error;

      // Look up task details from cached data
      const task = this._cachedTasks.find(t => String(t.id) === String(taskId));
      const taskTitle = task?.title || 'Tarea';
      const taskDesc = task?.description || '';

      const modal = document.getElementById('modalTaskDetail');
      if (!modal) return;

      document.getElementById('taskDetailTitle').textContent = taskTitle;
      document.getElementById('taskDetailDate').innerHTML = `<i data-lucide="calendar" class="w-3 h-3"></i> Entregada: ${Helpers.formatDate(evidence.created_at)}`;
      document.getElementById('taskDetailDesc').textContent = taskDesc || 'Sin descripción.';

      // Show evidence section
      document.getElementById('uploadSection').classList.add('hidden');
      document.getElementById('evidenceSection').classList.remove('hidden');
      
      document.getElementById('evidenceDate').textContent = `Enviado el: ${Helpers.formatDate(evidence.created_at)}`;
      document.getElementById('evidenceComment').textContent = evidence.comment || "Sin comentario";
      const evidenceLink = document.getElementById('evidenceLink');
      if (evidenceLink) {
        evidenceLink.href = '#';
        evidenceLink.onclick = (e) => { e.preventDefault(); window.openLightbox(evidence.file_url, 'image'); };
      }

      modal.classList.remove('hidden');
      modal.classList.add('flex');
      if (window.lucide) lucide.createIcons();

      if (!modal._initialized) {
        document.getElementById('btnCloseTaskDetail').onclick = () => modal.classList.add('hidden');
        modal._initialized = true;
      }
    } catch (e) {
      Helpers.toast('Error al ver entrega', 'error');
    }
  },

  /**
   * Carga tareas y evidencias
   */
  async loadTasks(filter = 'pending') {
    const container = document.getElementById('tasksList');
    if (!container) return;

    container.innerHTML = Helpers.skeleton(3, 'h-32');

    try {
      const student = AppState.get('currentStudent');
      if (!student?.classroom_id) {
        container.innerHTML = Helpers.emptyState('Sin aula asignada', 'school');
        if (window.lucide) lucide.createIcons();
        return;
      }

      // Declare tasks here so both branches can populate it
      let tasks = [];

      // Try RPC first — silently fall through to direct query on any error
      try {
        const { data: rpcData, error: rpcErr } = await supabase.rpc('get_tasks_for_period', {
          p_classroom_id: student.classroom_id,
          p_period_id:    null
        });
        if (!rpcErr && rpcData?.tasks?.length) {
          tasks = rpcData.tasks;
        }
      } catch (_) { /* RPC not deployed — use fallback below */ }

      // Fallback: direct query if RPC returned nothing
      if (!tasks.length) {
        const { data, error } = await supabase
          .from(TABLES.TASKS)
          .select('id, title, description, due_date, file_url, created_at, period_id')
          .eq('classroom_id', student.classroom_id)
          .order('due_date', { ascending: false });
        if (error) throw error;
        tasks = data || [];
      }

      // Evidencias del estudiante
      const { data: evidences, error: evErr } = await supabase
        .from(TABLES.TASK_EVIDENCES)
        .select('id, task_id, status, grade_letter, stars, file_url, comment, created_at')
        .eq('student_id', student.id);
      if (evErr) throw evErr;

      const evidenceMap = new Map((evidences || []).map(e => [e.task_id, e]));
      this._cachedTasks = tasks;
      this._setActiveFilter(filter);
      this._updateCounts(evidenceMap, tasks);
      this._renderSummary(filter, tasks, evidenceMap);

      const filtered = this.filterTasks(tasks, evidenceMap, filter);

      if (!filtered.length) {
        container.innerHTML = Helpers.emptyState(
          filter === 'pending' ? '¡Todo al día! No hay tareas pendientes' : 'No hay tareas en esta categoría',
          filter === 'pending' ? 'check-circle' : 'inbox'
        );
        if (window.lucide) lucide.createIcons();
        return;
      }

      container.innerHTML = filtered.map(t => this.renderTaskCard(t, evidenceMap.get(t.id))).join('');
      if (window.lucide) lucide.createIcons();

    } catch (err) {
      container.innerHTML = Helpers.emptyState('Error al cargar tareas', 'alert-triangle');
      if (window.lucide) lucide.createIcons();
    }
  },

  /**
   * Franja de resumen: en móvil va a 2 columnas para no desbordar.
   */
  _renderSummary(filter, tasks, evidenceMap) {
    const el = document.getElementById('tasksSummary');
    if (!el) return;
    const now = new Date();
    let pending = 0, overdue = 0, submitted = 0;
    (tasks || []).forEach(t => {
      if (evidenceMap.has(t.id)) { submitted++; return; }
      if (t.due_date && new Date(t.due_date) < now) { overdue++; return; }
      pending++;
    });

    const LABELS = {
      pending:  { txt: 'Por hacer', total: pending,  cls: 'ts-pending' },
      overdue:  { txt: 'Tarde',     total: overdue,  cls: 'ts-overdue' },
      submitted:{ txt: 'Listas',    total: submitted,cls: 'ts-submitted' },
    };
    const cur = LABELS[filter] || LABELS.pending;

    el.innerHTML = `
      <div class="ts-grid">
        <div class="ts-item ${cur.cls}">
          <span class="ts-item__label">${cur.txt}</span>
          <span class="ts-item__value">${cur.total}</span>
        </div>
        <div class="ts-item">
          <span class="ts-item__label">Total del aula</span>
          <span class="ts-item__value">${(tasks || []).length}</span>
        </div>
      </div>`;
  },

  /**
   * Filtra tareas según estado
   */
  filterTasks(tasks, evidenceMap, filter) {
    const now = new Date();
    return tasks.filter(t => {
      const isDelivered = evidenceMap.has(t.id);
      const isOverdue = !isDelivered && t.due_date && new Date(t.due_date) < now;

      if (filter === 'submitted') return isDelivered;
      if (filter === 'overdue') return isOverdue;
      if (filter === 'pending') return !isDelivered && !isOverdue;
      return true;
    });
  },

  /**
   * Renderiza una tarea
   */
  renderTaskCard(t, evidence) {
    const isDelivered = !!evidence;
    const dueDate = t.due_date ? new Date(t.due_date) : null;
    const isOverdue = !isDelivered && dueDate && dueDate < new Date();

    let statusBadge = '';
    if (isDelivered) {
      statusBadge = `<span class="task-status-badge task-status-active">✓ Entregada</span>`;
    } else if (isOverdue) {
      statusBadge = `<span class="task-status-badge task-status-overdue">! Vencida</span>`;
    } else {
      statusBadge = `<span class="task-status-badge task-status-pending">● Pendiente</span>`;
    }

    const grade = (evidence?.grade_letter || evidence?.stars)
      ? `<span class="task-card__grade" title="Calificación de la maestra">${escapeHtml(evidence.grade_letter || `${evidence.stars}★`)}</span>`
      : '';

    return `
      <div class="task-card role-accent role-blue task-card--body group role-fade-up">
        <div class="task-card__head">
          <div class="task-card__lead">
            <div class="task-card__icon ${isDelivered ? 'is-done' : ''}">${isDelivered ? '\u2705' : '\uD83D\uDCDD'}</div>
            <div class="task-card__headtext">
              <div class="task-card__titlerow">
                <h4 class="task-card__title">${escapeHtml(t.title)}</h4>
                <span class="role-pill role-blue">Tarea</span>
              </div>
              <p class="task-card__due">Vence: ${Helpers.formatDate(t.due_date)}</p>
            </div>
          </div>
          <div class="task-card__statuses">${statusBadge}${grade}</div>
        </div>

        ${t.file_url ? `<div class="task-card__media" data-lightbox-url="${escapeHtml(t.file_url)}" data-lightbox-type="image"><img src="${escapeHtml(t.file_url)}" loading="lazy" alt="Imagen de tarea" onerror="this.parentElement.style.display='none'"></div>` : ''}

        <p class="task-card__desc">${escapeHtml(t.description || 'Sin descripción detallada.')}</p>

        <div class="task-card__actions">
          ${isDelivered
            ? `<button data-action="view" data-id="${t.id}" class="task-card__btn is-done">\u2705 Ver Entrega</button>`
            : `<button data-action="submit" data-id="${t.id}" class="task-card__btn is-send">\uD83D\uDE80 Enviar Tarea</button>`
          }
        </div>
      </div>
    `;
  }
};
