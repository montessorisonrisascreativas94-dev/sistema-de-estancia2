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
    
    // Delegación de eventos para filtros
    const filtersContainer = document.querySelector('.task-filters-container') || document.querySelector('#tasks .flex.bg-white.p-1.rounded-full.shadow-sm.border');
    if (filtersContainer && !filtersContainer._initialized) {
      Helpers.delegate(filtersContainer, 'button', 'click', (e, btn) => {
        const filter = btn.dataset.filter || 'pending';
        this.loadTasks(filter);
        
        // Actualizar UI de botones
        filtersContainer.querySelectorAll('button').forEach(b => {
          b.classList.toggle('bg-emerald-100', b === btn);
          b.classList.toggle('text-emerald-700', b === btn);
          b.classList.toggle('text-slate-500', b !== btn);
          b.classList.toggle('font-bold', b === btn);
        });
      });
      filtersContainer._initialized = true;
    }

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
        container.innerHTML = Helpers.emptyState('Sin aula asignada', '🎒');
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
      const filtered = this.filterTasks(tasks, evidenceMap, filter);

      if (!filtered.length) {
        container.innerHTML = Helpers.emptyState(
          filter === 'pending' ? '¡Todo al día! No hay tareas pendientes' : 'No hay tareas en esta categoría',
          filter === 'pending' ? '🎉' : '🎒'
        );
        return;
      }

      container.innerHTML = filtered.map(t => this.renderTaskCard(t, evidenceMap.get(t.id))).join('');
      if (window.lucide) lucide.createIcons();

    } catch (err) {
      container.innerHTML = Helpers.emptyState('Error al cargar tareas', '❌');
    }
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
      statusBadge = `<span class="px-3 py-1 bg-emerald-100 text-emerald-700 text-[9px] font-black uppercase rounded-full">Entregada</span>`;
    } else if (isOverdue) {
      statusBadge = `<span class="px-3 py-1 bg-rose-100 text-rose-700 text-[9px] font-black uppercase rounded-full">Vencida</span>`;
    } else {
      statusBadge = `<span class="px-3 py-1 bg-blue-100 text-blue-700 text-[9px] font-black uppercase rounded-full">Pendiente</span>`;
    }

    return `
      <div class="bg-white p-5 rounded-2xl border-2 border-slate-100 mb-4 hover:shadow-lg hover:border-green-200 transition-all group">
        <div class="flex justify-between items-start mb-3">
          <div class="flex items-center gap-3">
            <div class="w-11 h-11 rounded-xl ${isDelivered ? 'bg-green-100 text-green-700' : 'bg-amber-50 text-amber-600'} flex items-center justify-center text-xl shadow-sm group-hover:scale-110 transition-transform">
              ${isDelivered ? '\u2705' : '\uD83D\uDCDD'}
            </div>
            <div>
              <h4 class="font-black text-slate-800 text-sm leading-tight">${escapeHtml(t.title)}</h4>
              <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Vence: ${Helpers.formatDate(t.due_date)}</p>
            </div>
          </div>
          ${statusBadge}
        </div>
        
        ${t.file_url ? `<div class="mb-3 rounded-xl overflow-hidden border border-slate-100 cursor-zoom-in bg-black" data-lightbox-url="${escapeHtml(t.file_url)}" data-lightbox-type="image"><img src="${escapeHtml(t.file_url)}" class="w-full max-h-64 object-cover" loading="lazy" alt="Imagen de tarea" onerror="this.parentElement.style.display='none'"></div>` : ''}
        
        <p class="text-xs text-slate-500 leading-relaxed line-clamp-2 mb-4">${escapeHtml(t.description || 'Sin descripción detallada.')}</p>
        
        <div class="flex gap-2">
          ${isDelivered 
            ? `<button data-action="view" data-id="${t.id}" class="flex-1 py-2.5 bg-green-50 text-green-700 border border-green-200 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-green-100 transition-all">\u2705 Ver Entrega</button>`
            : `<button data-action="submit" data-id="${t.id}" class="flex-1 py-2.5 bg-green-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-green-600 shadow-md shadow-green-200 transition-all">\uD83D\uDE80 Enviar Tarea</button>`
          }
        </div>
      </div>
    `;
  }
};
