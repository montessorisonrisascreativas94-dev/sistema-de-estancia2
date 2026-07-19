import { supabase, sendPush, emitEvent } from '../../shared/supabase.js';
import { AppState } from '../state.js';
import { MaestraApi } from '../api.js';
import { UI } from './ui.js';
import { notifyParents } from '../../shared/notify-feedback.js';
import { Helpers } from '../../shared/helpers.js';

const { safeToast, safeEscapeHTML, Modal } = UI;

export async function initTasks() {
  const classroom = AppState.get('classroom');
  const container = document.getElementById('tab-tasks');
  if (!container) return;

  container.innerHTML = `
    <div class="flex justify-between items-center mb-8">
      <h3 class="text-2xl font-black text-slate-800 flex items-center gap-3">Mochila de Tareas</h3>
      <button onclick="App.openNewTaskModal()" class="px-6 py-3 bg-[#28B54D] text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-green-100 hover:bg-[#239943] transition-all flex items-center gap-2 active:scale-95">
        <i data-lucide="plus-circle" class="w-5 h-5"></i> Nueva Tarea
      </button>
    </div>
    <div id="tasksListContainer" class="space-y-4">
      <div class="animate-pulse space-y-4">
        <div class="h-32 bg-slate-50 rounded-3xl"></div>
        <div class="h-32 bg-slate-50 rounded-3xl"></div>
      </div>
    </div>
  `;
  if (window.lucide) window.lucide.createIcons();

  const listContainer = document.getElementById('tasksListContainer');
  try {
    const tasks = await MaestraApi.getTasksByClassroom(classroom.id);
    if (!tasks.length) {
      listContainer.innerHTML = '<div class="text-center p-8 text-slate-500">Aún no has asignado tareas.</div>';
      return;
    }

    // Cargar conteo de entregas pendientes de revisar
    const taskIds = tasks.map(t => t.id);
    const { data: pendingSubmissions } = await supabase
      .from('task_evidences')
      .select('task_id')
      .in('task_id', taskIds)
      .neq('status', 'graded');

    const pendingMap = {};
    (pendingSubmissions || []).forEach(s => {
      pendingMap[s.task_id] = (pendingMap[s.task_id] || 0) + 1;
    });

    listContainer.innerHTML = tasks.map(t => {
      const dueDate = new Date(t.due_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
      const pendingCount = pendingMap[t.id] || 0;
      const hasPending = pendingCount > 0;
      return `
      <!-- Tarjeta con franja ${hasPending ? 'naranja' : 'verde'} -->
      <div class="relative bg-white p-6 rounded-[2rem] shadow-[0_8px_30px_rgba(0,0,0,0.04)] overflow-hidden transition-all hover:shadow-xl group">
        <div class="absolute top-0 left-0 bottom-0 w-1 bg-[${hasPending ? '#FF8A00' : '#28B54D'}]"></div>
        
        <div class="ml-2">
          <div class="flex justify-between items-start mb-4">
            <div class="flex-1">
              <div class="flex items-center gap-3 mb-2">
                <h4 class="font-black text-slate-800 text-base">${safeEscapeHTML(t.title)}</h4>
              </div>
              <p class="text-xs font-bold text-slate-400 flex items-center gap-1.5"><i data-lucide="calendar" class="w-3 h-3"></i> Entrega: ${dueDate}</p>
            </div>
            <div class="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onclick="App.openEditTaskModal('${t.id}')" class="p-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors" title="Editar Tarea">
                <i data-lucide="edit" class="w-4 h-4"></i>
              </button>
              <button onclick="App.deleteTask('${t.id}')" class="p-2 bg-slate-100 text-slate-500 rounded-lg hover:bg-red-100 hover:text-red-600 transition-colors" title="Eliminar Tarea">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
              </button>
            </div>
          </div>
          <p class="text-sm text-slate-600 line-clamp-2">${safeEscapeHTML(t.description)}</p>
          <div class="flex justify-between items-center pt-4 border-t border-slate-50 mt-4">
            <div>
              ${t.file_url ? '<span class="px-2 py-1 bg-green-50 text-green-600 text-[10px] font-bold rounded-full flex items-center gap-1"><i data-lucide="paperclip" class="w-3 h-3"></i> Adjunto</span>' : ''}
            </div>
            <button onclick="App.viewTaskSubmissions('${t.id}')" class="relative px-4 py-2 bg-[#28B54D] text-white rounded-xl text-[10px] font-black uppercase hover:bg-[#239943] transition-all shadow-sm flex items-center gap-2">
              Ver Entregas
              ${pendingCount > 0 ? `<span class="absolute -top-2 -right-2 w-5 h-5 bg-[#FF8A00] text-white text-[9px] font-black rounded-full flex items-center justify-center shadow-sm animate-pulse">${pendingCount}</span>` : ''}
            </button>
          </div>
        </div>
      </div>
    `}).join('');
    if (window.lucide) window.lucide.createIcons();
  } catch (e) {
    listContainer.innerHTML = Helpers.errorState('Error al cargar tareas', 'App.initTasks()');
    if (window.lucide) window.lucide.createIcons();
  }
}

export async function openEditTaskModal(taskId) {
  try {
    const { data: task, error } = await supabase.from('tasks').select('id, title, description, due_date, grading_system, file_url, classroom_id').eq('id', taskId).single();
    if (error) throw error;
    openNewTaskModal(task);
  } catch (err) {
    safeToast('No se pudo cargar la tarea para editar', 'error');
  }
}

export async function deleteTask(taskId) {
  const confirmed = await Helpers.confirm('¿Eliminar esta tarea? Los datos se perderán permanentemente.');
  if (!confirmed) return;
  try {
    await MaestraApi.deleteTask(taskId);
    safeToast('Tarea eliminada correctamente');
    await initTasks();
  } catch (err) {
    safeToast('No se pudo eliminar la tarea', 'error');
  }
}

export async function openNewTaskModal(taskToEdit = null) {
  const isEditing = taskToEdit !== null;
  const modalId = 'newTaskModal';
  const modalTitle = isEditing ? 'Editar Tarea' : 'Asignar Nueva Tarea';
  const buttonText = isEditing ? 'Guardar Cambios' : 'Asignar y Notificar';

  const content = `
    <div class="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl animate-fadeIn flex flex-col max-h-[92vh] overflow-hidden">
      <!-- Header limpio con ícono en círculo verde -->
      <div class="px-8 pt-8 pb-6 flex justify-between items-start">
        <div class="flex items-center gap-4">
          <div class="w-16 h-16 rounded-3xl bg-green-100 flex items-center justify-center shadow-lg">
            <i data-lucide="clipboard-list" class="w-8 h-8 text-green-600"></i>
          </div>
          <div>
            <h3 class="text-2xl font-black text-slate-800">${modalTitle}</h3>
            <p class="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Organiza las actividades de tus alumnos</p>
          </div>
        </div>
        <button onclick="Modal.close('${modalId}')" class="p-2 hover:bg-slate-100 rounded-full transition-colors">
          <i data-lucide="x" class="w-6 h-6 text-slate-400"></i>
        </button>
      </div>
      
      <form id="taskForm" class="space-y-5 overflow-y-auto px-8 pb-8 flex-1">
        <!-- Contenedor con franja verde -->
        <div class="relative bg-white p-6 rounded-[2rem] shadow-[0_8px_30px_rgba(0,0,0,0.04)] overflow-hidden">
          <div class="absolute top-0 left-0 bottom-0 w-1 bg-green-500"></div>
          
          <div class="ml-2 space-y-5">
            <div>
              <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Título de la Tarea</label>
              <input type="text" id="taskTitle" class="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-bold focus:border-green-500 outline-none transition-colors" required>
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Descripción / Instrucciones</label>
              <textarea id="taskDesc" rows="4" class="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm focus:border-green-500 outline-none resize-none transition-colors" placeholder="Explica qué deben hacer los alumnos..." required></textarea>
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Fecha de Entrega</label>
              <input type="date" id="taskDueDate" class="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-bold focus:border-green-500 outline-none transition-colors" required>
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Adjuntar Archivo (Opcional)</label>
              <div class="relative">
                <input type="file" id="taskFileInput" class="absolute inset-0 w-full h-full opacity-0 cursor-pointer" accept="image/*,video/*,.pdf,.doc,.docx">
                <div class="bg-slate-50 p-4 rounded-xl border-2 border-dashed border-slate-100 hover:border-green-500 transition-all flex items-center justify-center gap-3">
                  <i data-lucide="paperclip" class="w-5 h-5 text-slate-400"></i>
                  <span id="taskFileName" class="text-sm font-medium text-slate-500">Seleccionar archivo...</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>
      
      <!-- Botones del modal -->
      <div class="px-8 pb-8 pt-2 border-t border-slate-100">
        <div class="flex gap-3">
          <button type="button" onclick="Modal.close('${modalId}')" class="flex-1 py-4 bg-slate-50 text-slate-500 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-100 transition-colors">Cancelar</button>
          <button id="btnSaveTask" class="flex-[2] py-4 bg-[#28B54D] text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-green-100 hover:bg-[#239943] active:scale-95 transition-all flex items-center justify-center gap-2">
            <i data-lucide="${isEditing ? 'save' : 'send'}" class="w-5 h-5"></i> ${buttonText}
          </button>
        </div>
      </div>
    </div>
  `;
  Modal.open(modalId, content);

  if (isEditing) {
    document.getElementById('taskTitle').value = taskToEdit.title;
    document.getElementById('taskDesc').value = taskToEdit.description;
    const dateVal = new Date(taskToEdit.due_date).toISOString().split('T')[0];
    document.getElementById('taskDueDate').value = dateVal;
    if (taskToEdit.file_url) {
      const fileName = taskToEdit.file_url.split('/').pop().split('?')[0];
      document.getElementById('taskFileName').textContent = decodeURIComponent(fileName);
      document.getElementById('taskFileName').classList.add('text-green-600', 'font-bold');
    }
  }

  const fileInput = document.getElementById('taskFileInput');
  const fileNameEl = document.getElementById('taskFileName');
  fileInput.onchange = () => {
    if (fileInput.files.length > 0) {
      fileNameEl.textContent = fileInput.files[0].name;
      fileNameEl.classList.add('text-green-600', 'font-bold');
    } else {
      fileNameEl.textContent = 'Seleccionar archivo...';
      fileNameEl.classList.remove('text-green-600', 'font-bold');
    }
  };

  const saveBtn = document.getElementById('btnSaveTask');
  saveBtn.onclick = async () => {
    const title = document.getElementById('taskTitle').value;
    const description = document.getElementById('taskDesc').value;
    const dueDate = document.getElementById('taskDueDate').value;
    const file = fileInput.files[0];

    if (file && file.size > 50 * 1024 * 1024) { 
       return safeToast('El archivo es demasiado grande (máx 50MB)', 'error');
    }

    if (!title || !description || !dueDate) {
      return safeToast('Completa todos los campos requeridos.', 'warning');
    }

    saveBtn.disabled = true;
    saveBtn.innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> ${isEditing ? 'Guardando...' : 'Asignando...'}`;
    requestAnimationFrame(() => window.lucide?.createIcons());

    try {
      let fileUrl = isEditing ? taskToEdit.file_url : null;
      const classroom = AppState.get('classroom');
      if (!classroom) throw new Error('No hay aula activa');

      if (file) {
        const filePath = `${classroom.id}/${Date.now()}-${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from('classroom_media')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('classroom_media')
          .getPublicUrl(filePath);
        
        fileUrl = urlData.publicUrl;
      }

      const payload = {
        classroom_id: classroom.id,
        title,
        description,
        due_date: dueDate,
        file_url: fileUrl,
        teacher_id: AppState.get('user').id
      };
      
      if (isEditing) {
        await MaestraApi.updateTask(taskToEdit.id, payload);
        safeToast('Tarea actualizada correctamente');
      } else {
        await MaestraApi.createTask(payload);
        const students = AppState.get('students') || [];
        const classroomName = AppState.get('classroom').name;

        // Push with visual feedback
        notifyParents({
          students,
          title:   `📌 Nueva Tarea — ${classroomName}`,
          message: `"${payload.title}" · Entrega: ${payload.due_date}`,
          type:    'task',
          link:    'panel_padres.html',
          label:   payload.title
        });

        // Email via process-event
        emitEvent('task.created', {
          classroom_id: payload.classroom_id,
          title:        payload.title,
          due_date:     payload.due_date
        }).catch(() => {});

        safeToast('Tarea asignada correctamente');
      }

      Modal.close(modalId);
      await initTasks();

    } catch (err) {
      safeToast(`Error al ${isEditing ? 'actualizar' : 'crear'} la tarea.`, 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerHTML = `<i data-lucide="${isEditing ? 'save' : 'send'}" class="w-5 h-5"></i> ${buttonText}`;
      requestAnimationFrame(() => window.lucide?.createIcons());
    }
  };
}

//  Helper: verificar si el período activo del aula está abierto 
async function _getPeriodStatus(classroomId) {
  try {
    const { data, error } = await supabase.rpc('get_active_period', { p_classroom_id: classroomId });
    // Si el RPC no existe (404) o hay error, asumir período abierto (permisivo)
    if (error) return { open: true, period: null };
    if (!data) return { open: true, period: null };
    return { open: data.status === 'open', period: data };
  } catch (_) {
    return { open: true, period: null };
  }
}

export async function viewTaskSubmissions(taskId) {
  const students = AppState.get('students') || [];
  const classroom = AppState.get('classroom');
  const modalId = 'taskSubmissionsModal';

  try {
    // Verificar estado del período ANTES de mostrar el modal
    const { open: periodOpen, period } = await _getPeriodStatus(classroom?.id);

    const { data: submissions, error: subError } = await supabase
      .from('task_evidences')
      .select('id, task_id, student_id, status, grade_letter, stars, numeric_score, file_url, comment, created_at')
      .eq('task_id', taskId);
    if (subError) throw subError;

    const subMap = {};
    (submissions || []).forEach(s => subMap[s.student_id] = s);

    // Banner de período cerrado
    const closedBanner = !periodOpen ? `
      <div class="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-3">
        <span class="text-xl">🔒</span>
        <div>
          <p class="text-xs font-black text-amber-800 uppercase tracking-wide">período cerrado</p>
          <p class="text-[10px] text-amber-600 font-medium">Las calificaciones están bloqueadas. Solo la directora puede reabrirlo.</p>
        </div>
      </div>` : '';

    const content = `
      <div class="bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl animate-fadeIn flex flex-col max-h-[92vh] overflow-hidden">
        <!-- Header limpio con ícono en círculo naranja -->
        <div class="px-8 pt-8 pb-6 flex justify-between items-start">
          <div class="flex items-center gap-4">
            <div class="w-16 h-16 rounded-3xl bg-orange-100 flex items-center justify-center shadow-lg">
              <i data-lucide="check-square" class="w-8 h-8 text-orange-600"></i>
            </div>
            <div>
              <h3 class="text-2xl font-black text-slate-800">Revisión de Entregas</h3>
              ${period ? `<p class="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">período: ${safeEscapeHTML(period.name)} ${periodOpen ? '🟢 Abierto' : '🔒 Cerrado'}</p>` : ''}
            </div>
          </div>
          <button onclick="Modal.close('${modalId}')" class="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <i data-lucide="x" class="w-6 h-6 text-slate-400"></i>
          </button>
        </div>
        ${closedBanner}
        <div class="space-y-4 overflow-y-auto px-8 pb-8 flex-1">
          ${students.length > 0 ? students.map(s => {
            const sub = subMap[s.id];
            const hasSubmission = sub && sub.file_url;
            const isGraded = sub && sub.status === 'graded';
            const safeUrl = hasSubmission ? encodeURI(sub.file_url) : '#';
            // Deshabilitar inputs si período cerrado
            const disabled = !periodOpen ? 'disabled class="opacity-50 cursor-not-allowed"' : '';
            const disabledSelect = !periodOpen ? 'disabled' : '';
            const btnDisabled = !periodOpen ? 'disabled title="período cerrado" class="p-2 bg-slate-300 text-slate-500 rounded-lg cursor-not-allowed"' : 'class="p-2 bg-[#28B54D] text-white rounded-lg hover:bg-[#239943] transition-all" title="Guardar Calificación"';

            return `
              <div class="relative p-5 bg-white rounded-[2rem] shadow-[0_8px_30px_rgba(0,0,0,0.04)] overflow-hidden ${isGraded ? '' : ''}">
                <div class="absolute top-0 left-0 bottom-0 w-1 bg-green-500"></div>
                <div class="ml-2">
                  <div class="flex items-center justify-between mb-4">
                    <div class="font-bold text-slate-800">${safeEscapeHTML(s.name)}</div>
                    ${hasSubmission 
                      ? `<a href="${safeUrl}" target="_blank" class="px-4 py-2 bg-green-50 text-green-600 rounded-lg text-xs font-bold hover:bg-green-100 transition-colors flex items-center gap-2">
                        <i data-lucide="download" class="w-3 h-3"></i> Ver Entrega
                      </a>`
                      : `<span class="px-4 py-2 bg-slate-100 text-slate-400 rounded-lg text-xs font-bold">Sin entregar</span>`
                    }
                  </div>
                  <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <div class="md:col-span-2">
                      <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">Retroalimentación</label>
                      <textarea id="feedback-${s.id}" ${disabled} rows="2"
                        class="w-full px-4 py-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 focus:border-green-500 outline-none transition-all ${!periodOpen ? 'opacity-50 cursor-not-allowed' : ''}"
                        placeholder="Escribe un comentario...">${safeEscapeHTML(sub?.comment || '')}</textarea>
                    </div>
                    <div class="flex items-center gap-2">
                      <div class="flex-1">
                        <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">Calificación (0-100)</label>
                        <input type="number" id="numeric-${s.id}" min="0" max="100" ${disabledSelect}
                          class="w-full px-4 py-3 rounded-xl text-sm font-bold bg-slate-50 border-2 border-slate-100 focus:border-green-500 outline-none transition-all ${!periodOpen ? 'opacity-50 cursor-not-allowed' : ''}"
                          value="${sub?.numeric_score !== null && sub?.numeric_score !== undefined ? sub.numeric_score : ''}" placeholder="0-100">
                      </div>
                      <button onclick="${periodOpen ? `App.submitGrade('${taskId}', '${s.id}')` : 'void(0)'}" ${btnDisabled}>
                        <i data-lucide="save" class="w-4 h-4"></i>
                      </button>
                    </div>
                  </div>
                  ${isGraded ? `<div class="text-xs text-green-600 font-bold mt-2 flex items-center gap-1"><i data-lucide="check-circle" class="w-3 h-3"></i> Calificado</div>` : ''}
                </div>
              </div>
            `;
          }).join('') : '<div class="text-center p-8 text-slate-500">No hay alumnos en la clase.</div>'}
        </div>
      </div>
    `;
    Modal.open(modalId, content);
  } catch (err) {
    safeToast('Error al cargar entregas', 'error');
  }
}

export async function submitGrade(taskId, studentId) {
  // Verificar período antes de guardar
  const classroom = AppState.get('classroom');
  const { open: periodOpen } = await _getPeriodStatus(classroom?.id);
  if (!periodOpen) {
    safeToast('El período está cerrado. No se pueden modificar calificaciones.', 'warning');
    return;
  }

  const numericScore = parseFloat(document.getElementById(`numeric-${studentId}`)?.value);
  const feedback = document.getElementById(`feedback-${studentId}`)?.value;

  if (isNaN(numericScore) || numericScore < 0 || numericScore > 100) {
    return safeToast('Ingresa una calificación válida entre 0 y 100.', 'warning');
  }

  try {
    await MaestraApi.gradeTask(taskId, studentId, null, null, feedback, numericScore);
    
    const student = (AppState.get('students') || []).find(s => s.id === studentId);
    if (student?.parent_id) {
      sendPush({
        user_id: student.parent_id,
        title: 'Tarea Calificada 🏆',
        message: `La maestra ha calificado una tarea de ${student.name}. Nota: ${numericScore}/100`,
        link: 'panel_padres.html#grades'
      }).catch(() => {});
    }
    
    safeToast('Calificación guardada');
    const el = document.getElementById(`feedback-${studentId}`);
    if (el) {
      const card = el.closest('.p-5');
      if (card) {
        card.classList.add('bg-green-50');
        setTimeout(() => card.classList.remove('bg-green-50'), 1500);
      }
    }
  } catch (e) {
    safeToast('Error al calificar', 'error');
  }
}
