import { supabase, sendPush } from '../../shared/supabase.js';
import { AppState } from '../state.js';
import { MaestraApi } from '../api.js';
import { UI } from './ui.js';
import { notifyParents, showNotifyFeedback } from '../../shared/notify-feedback.js';
import { OfflineQueue } from '../../shared/offline-queue.js';

const { safeToast, safeEscapeHTML, Modal } = UI;

// Start auto-sync when online
OfflineQueue.startAutoSync(({ synced }) => {
  safeToast(`✅ ${synced} registro(s) de asistencia sincronizados`, 'success');
});

/**
 * 📅 Asistencia — carga el panel y las solicitudes de ausencia pendientes
 */
export async function initAttendance() {
  const classroom = AppState.get('classroom');
  const students = AppState.get('students') || []; // Usamos estudiantes ya cargados
  const today = new Date().toISOString().split('T')[0];

  const container = document.getElementById('tab-attendance'); // Ajuste de contenedor si es necesario
  const listContainer = document.getElementById('attendanceList');
  
  if (!listContainer) return;

  // Feedback visual inmediato
  listContainer.innerHTML = `
    <div class="hidden md:block bg-white rounded-[2.5rem] shadow-[0_8px_30px_rgba(0,0,0,0.04)] overflow-hidden mb-20">
      <table class="w-full">
        <tbody class="divide-y divide-slate-50">
          ${UI.Skeleton.render('tableRow', 6)}
        </tbody>
      </table>
    </div>
    <div class="md:hidden grid grid-cols-2 gap-3 mb-20">
      ${UI.Skeleton.render('card', 4)}
    </div>
  `;

  try {
    // 1. Cargar solicitudes y asistencia en paralelo
    const [_, attendance] = await Promise.all([
      _loadAbsenceRequests(classroom?.id, students),
      MaestraApi.getAttendance(classroom.id, today)
    ]);

    const attMap = {};
    (attendance || []).forEach(a => attMap[a.student_id] = a.status);
    
    listContainer.innerHTML = `
        <div class="relative flex justify-between items-center mb-6 bg-white p-5 rounded-[2rem] shadow-[0_8px_30px_rgba(0,0,0,0.04)] overflow-hidden">
          <div class="absolute top-0 left-0 bottom-0 w-1 bg-[#28B54D]"></div>
          <div class="ml-2">
            <h4 class="font-black text-slate-800 text-lg">Control de Asistencia</h4>
            <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Gestión diaria de presencia en aula</p>
          </div>
          <button onclick="App.markAllPresent()" class="px-6 py-3 bg-[#28B54D] text-white rounded-2xl text-xs font-black uppercase shadow-lg shadow-green-100 hover:bg-[#239943] transition-all flex items-center gap-2 active:scale-95">
            <i data-lucide="check-check" class="w-4 h-4"></i> Marcar Todos
          </button>
        </div>

        <!-- 🖥️ VISTA TABLA (DESKTOP) -->
        <div class="hidden md:block bg-white rounded-[2.5rem] shadow-[0_8px_30px_rgba(0,0,0,0.04)] overflow-hidden mb-20">
          <table class="w-full">
            <thead>
              <tr class="bg-slate-50/50 border-b border-slate-100">
                <th class="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Estudiante</th>
                <th class="px-6 py-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Estado Actual</th>
                <th class="px-6 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Acciones Rápidas</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-50">
              ${students.map(s => {
                const currentStatus = attMap[s.id] || null;
                const statusMap = {
                  'present': { l: 'Presente', c: 'bg-green-100 text-green-700', i: 'check' },
                  'late':    { l: 'Tardanza', c: 'bg-amber-100 text-amber-700',   i: 'clock' },
                  'absent':  { l: 'Ausente',  c: 'bg-rose-100 text-rose-700',     i: 'x' }
                };
                const st = statusMap[currentStatus] || { l: 'Sin marcar', c: 'bg-slate-100 text-slate-400', i: 'minus' };

                return `
                  <tr class="hover:bg-slate-50/50 transition-colors">
                    <td class="px-6 py-4">
                      <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-xl bg-green-50 text-green-600 flex items-center justify-center font-black text-sm border-2 border-white shadow-sm overflow-hidden">
                          ${s.avatar_url ? `<img src="${s.avatar_url}" class="w-full h-full object-cover">` : s.name.charAt(0)}
                        </div>
                        <div class="font-bold text-slate-700 text-sm">${safeEscapeHTML(s.name)}</div>
                      </div>
                    </td>
                    <td class="px-6 py-4 text-center">
                      <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase ${st.c}">
                        <i data-lucide="${st.i}" class="w-3 h-3"></i> ${st.l}
                      </span>
                    </td>
                    <td class="px-6 py-4 text-right">
                      <div class="flex justify-end gap-2">
                        <button onclick="App.registerAttendance('${s.id}', 'present')" class="w-9 h-9 rounded-xl flex items-center justify-center transition-all ${currentStatus === 'present' ? 'bg-[#28B54D] text-white shadow-lg' : 'bg-green-50 text-green-600 hover:bg-green-100'}" title="Presente">
                          <i data-lucide="check" class="w-4 h-4"></i>
                        </button>
                        <button onclick="App.registerAttendance('${s.id}', 'late')" class="w-9 h-9 rounded-xl flex items-center justify-center transition-all ${currentStatus === 'late' ? 'bg-[#FF8A00] text-white shadow-lg' : 'bg-amber-50 text-amber-600 hover:bg-amber-100'}" title="Tardanza">
                          <i data-lucide="clock" class="w-4 h-4"></i>
                        </button>
                        <button onclick="App.registerAttendance('${s.id}', 'absent')" class="w-9 h-9 rounded-xl flex items-center justify-center transition-all ${currentStatus === 'absent' ? 'bg-rose-500 text-white shadow-lg' : 'bg-rose-50 text-rose-600 hover:bg-rose-100'}" title="Falta">
                          <i data-lucide="user-x" class="w-4 h-4"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>

        <!-- 📱 VISTA TARJETAS (MÓVIL) -->
        <div class="md:hidden grid grid-cols-2 gap-3 mb-20">
          ${students.map(s => {
            const currentStatus = attMap[s.id] || null;
            const statusColor = currentStatus === 'present' ? 'ring-[#28B54D] ring-4' : currentStatus === 'late' ? 'ring-[#FF8A00] ring-4' : currentStatus === 'absent' ? 'opacity-40 grayscale' : 'ring-slate-100 ring-2';
            
            return `
              <div class="bg-white p-4 rounded-[2rem] shadow-[0_8px_30px_rgba(0,0,0,0.04)] flex flex-col items-center text-center gap-3 transition-all active:scale-95" onclick="App.registerAttendance('${s.id}', '${currentStatus === 'present' ? 'late' : currentStatus === 'late' ? 'absent' : 'present'}')">
                <div class="relative w-20 h-20 rounded-[1.5rem] overflow-hidden ${statusColor} transition-all duration-300">
                  ${s.avatar_url ? `<img src="${s.avatar_url}" class="w-full h-full object-cover">` : `<div class="w-full h-full flex items-center justify-center bg-green-50 text-green-500 font-black text-2xl">${s.name.charAt(0)}</div>`}
                  ${currentStatus === 'present' ? '<div class="absolute inset-0 bg-[#28B54D]/20 flex items-center justify-center"><i data-lucide="check" class="text-white w-8 h-8 drop-shadow-md"></i></div>' : ''}
                  ${currentStatus === 'late' ? '<div class="absolute inset-0 bg-[#FF8A00]/20 flex items-center justify-center"><i data-lucide="clock" class="text-white w-8 h-8 drop-shadow-md"></i></div>' : ''}
                </div>
                <div class="min-w-0">
                  <p class="font-black text-slate-800 text-xs truncate w-full px-2 uppercase tracking-tight">${safeEscapeHTML(s.name.split(' ')[0])}</p>
                  <p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">${currentStatus || 'Sin marcar'}</p>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
  } catch (err) {
    console.error('Error en initAttendance:', err);
    listContainer.innerHTML = Helpers.errorState('Error al cargar asistencia');
  }
}

export async function markAllPresent() {
  const students = AppState.get('students') || [];
  const classroom = AppState.get('classroom');
  const today = new Date().toISOString().split('T')[0];
  
  if (!students.length) return safeToast('No hay estudiantes', 'warning');

  // Custom Confirm Modal
  const modalId = 'confirmAttendanceModal';
  const content = `
    <div class="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl animate-fadeIn flex flex-col overflow-hidden">
      <!-- Header limpio con ícono en círculo verde -->
      <div class="px-8 pt-8 pb-6 flex justify-between items-start">
        <div class="flex items-center gap-4">
          <div class="w-16 h-16 rounded-3xl bg-green-100 flex items-center justify-center shadow-lg">
            <i data-lucide="check-check" class="w-8 h-8 text-green-600"></i>
          </div>
          <div>
            <h3 class="text-2xl font-black text-slate-800">Asistencia Masiva</h3>
            <p class="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">¿Marcar a todos como presentes?</p>
          </div>
        </div>
        <button onclick="Modal.close('${modalId}')" class="p-2 hover:bg-slate-100 rounded-full transition-colors">
          <i data-lucide="x" class="w-6 h-6 text-slate-400"></i>
        </button>
      </div>
      
      <div class="px-8 pb-8 space-y-6">
        <p class="text-sm text-slate-500 font-medium">Esta acción marcará a todos los alumnos sin asistencia o como ausentes como presentes hoy.</p>
        
        <div class="flex gap-3">
          <button onclick="Modal.close('${modalId}')" class="flex-1 py-4 bg-slate-50 text-slate-500 rounded-2xl font-black uppercase text-xs hover:bg-slate-100 transition-colors">Cancelar</button>
          <button id="btnConfirmMassAtt" class="flex-[2] py-4 bg-[#28B54D] text-white rounded-2xl font-black uppercase text-xs hover:bg-[#239943] shadow-lg shadow-green-100 transition-all active:scale-95 flex items-center justify-center gap-2">
            <i data-lucide="check" class="w-5 h-5"></i> Confirmar
          </button>
        </div>
      </div>
    </div>
  `;
  
  Modal.open(modalId, content);
  
  document.getElementById('btnConfirmMassAtt').onclick = async () => {
    try {
      Modal.close(modalId);
      safeToast('Registrando asistencia...', 'info');

      // 1. Obtener asistencia actual para no sobrescribir "Tardanza"
      const currentAttendance = await MaestraApi.getAttendance(classroom.id, today);
      const attMap = {};
      (currentAttendance || []).forEach(a => attMap[a.student_id] = a.status);

      const records = [];
      const studentsToNotify = [];

      students.forEach(s => {
        const existingStatus = attMap[s.id];
        // Solo registrar si NO hay asistencia o si estaba marcado como Ausente
        if (!existingStatus || existingStatus === 'absent') {
          records.push({ 
            student_id: s.id, 
            classroom_id: classroom.id, 
            date: today, 
            status: 'present' 
          });
        }
        // Siempre notificar presencia en aula si no es Ausente
        if (existingStatus !== 'absent') {
          studentsToNotify.push(s);
        }
      });

      if (records.length > 0) {
      if (navigator.onLine) {
        await Promise.allSettled(records.map(r => MaestraApi.upsertAttendance(r)));
      } else {
        // Encolar todos los registros individualmente
        for (const r of records) {
          await OfflineQueue.enqueue('attendance', 'upsert', { ...r, onConflict: 'student_id,date' });
        }
        safeToast(`${records.length} registros guardados sin conexión — se sincronizarán pronto`, 'info');
      }
    }

      safeToast('Asistencia masiva completada');
      
      // Notificar a los padres (Presence in classroom)
      if (studentsToNotify.length > 0) {
        notifyParents({
          students: studentsToNotify,
          title:   'Colegio Montessori Sonrisas Creativas ✅',
          message: 'Tu hijo/a ya se encuentra presente en su aula con su maestra.',
          type:    'attendance',
          link:    'panel_padres.html',
          label:   'Presencia en aula'
        });
      }

      await initAttendance();
    } catch (e) {
      safeToast('Error crítico en asistencia masiva', 'error');
    }
  };
}

// 👆 Handlers para experiencia de asistencia Premium (Tocar/Mantener)
let attendanceLongPressTimer = null;

export function handleAttendancePointerDown(e, studentId) {
  attendanceLongPressTimer = setTimeout(() => {
    attendanceLongPressTimer = null;
    Helpers.vibrate('heavy');
    registerAttendance(studentId, 'late');
  }, 600); // 600ms para marcar como tarde
}

export function handleAttendancePointerUp(e, studentId) {
  if (attendanceLongPressTimer) {
    clearTimeout(attendanceLongPressTimer);
    attendanceLongPressTimer = null;
    Helpers.vibrate('light');
    registerAttendance(studentId, 'present');
  }
}

export async function registerAttendance(studentId, status) {
  const classroom = AppState.get('classroom');
  const today = new Date().toISOString().split('T')[0];
  if (!studentId || !status) return;

  // ✅ OPTIMISTIC UI: Feedback visual inmediato
  const btnPresent = document.getElementById(`btn-${studentId}-present`);
  const btnLate = document.getElementById(`btn-${studentId}-late`);
  const btnAbsent = document.getElementById(`btn-${studentId}-absent`);
  const prevStates = [btnPresent, btnLate, btnAbsent].map(b => ({ cls: b?.className, id: b?.id }));

  const updateUI = (newStatus) => {
    [btnPresent, btnLate, btnAbsent].forEach(b => {
      if (b) {
        b.className = b.className.replace(/bg-\w+-500 text-white shadow-lg/g, '');
        b.classList.add('bg-slate-50', 'text-slate-600');
      }
    });
    if (newStatus === 'present') {
      btnPresent?.classList.remove('bg-slate-50', 'text-slate-600');
      btnPresent?.classList.add('bg-[#28B54D]', 'text-white', 'shadow-lg');
    } else if (newStatus === 'late') {
      btnLate?.classList.remove('bg-slate-50', 'text-slate-600');
      btnLate?.classList.add('bg-[#FF8A00]', 'text-white', 'shadow-lg');
    } else if (newStatus === 'absent') {
      btnAbsent?.classList.remove('bg-slate-50', 'text-slate-600');
      btnAbsent?.classList.add('bg-rose-500', 'text-white', 'shadow-lg');
    }
  };

  updateUI(status);

  try {
    // 1. Verificar si ya existe un registro de hoy
    const { data: existing } = await supabase
      .from('attendance')
      .select('status')
      .eq('student_id', studentId)
      .eq('date', today)
      .maybeSingle();

    const isMarkingPresent = status === 'present';
    const wasLate = existing?.status === 'late';
    let shouldUpsert = true;
    if (isMarkingPresent && wasLate) shouldUpsert = false;

    let statusLiteral = status === 'present' ? 'Presente' : status === 'late' ? 'Tarde' : 'Ausente';

    if (shouldUpsert) {
      const attRecord = { student_id: studentId, classroom_id: classroom.id, date: today, status };
      if (navigator.onLine) {
        await MaestraApi.upsertAttendance(attRecord);
      } else {
        await OfflineQueue.enqueue('attendance', 'upsert', { ...attRecord, onConflict: 'student_id,date' });
        safeToast(`${statusLiteral} guardado sin conexión`, 'info');
      }
    }

    const student = (AppState.get('students') || []).find(s => s.id === studentId);
    if (student?.parent_id) {
      const pushMessage = (isMarkingPresent && wasLate)
        ? `${student.name} ya está en su aula con su maestra.`
        : `${student.name} ha sido marcado como ${statusLiteral} hoy.`;

      sendPush({
        user_id: student.parent_id,
        title: 'Asistencia Karpus',
        message: pushMessage,
        link: 'panel_padres.html#attendance'
      }).then(res => {
        if (res?.ok !== false) showNotifyFeedback({ sent: 1, type: 'attendance', label: student.name });
      }).catch(() => {});
    }
    
    safeToast(isMarkingPresent && wasLate ? 'Presencia confirmada' : `Asistencia: ${statusLiteral}`);
  } catch (e) {
    // Revertir UI si falla
    prevStates.forEach(s => {
      const b = document.getElementById(s.id);
      if (b) b.className = s.cls;
    });
    safeToast('Error al registrar asistencia', 'error');
    await initAttendance();
  }
}

/**
 * 📋 Cargar solicitudes de ausencia pendientes de los padres
 */
async function _loadAbsenceRequests(classroomId, students) {
  if (!classroomId) return;

  try {
    const studentIds = students.map(s => s.id);
    if (!studentIds.length) return;

    const { data: requests, error } = await supabase
      .from('attendance_requests')
      .select('*, student:student_id(name)')
      .in('student_id', studentIds)
      .eq('status', 'pending')
      .order('date', { ascending: true });

    if (error || !requests?.length) return;

    // Mostrar banner de avisos pendientes
    const container = document.getElementById('attendanceList');
    if (!container) return;

    const banner = document.createElement('div');
    banner.id = 'absence-requests-banner';
    banner.className = 'relative mb-4 bg-white rounded-[2rem] shadow-[0_8px_30px_rgba(0,0,0,0.04)] p-4 overflow-hidden';
    banner.innerHTML = `
      <div class="absolute top-0 left-0 bottom-0 w-1 bg-[#FF8A00]"></div>
      <div class="ml-2">
        <div class="flex items-center gap-2 mb-3">
          <span class="text-lg">📋</span>
          <h4 class="font-black text-slate-800 text-sm uppercase tracking-wider">Avisos de Ausencia (${requests.length})</h4>
        </div>
        <div class="space-y-2">
          ${requests.map(r => `
            <div class="bg-slate-50 rounded-xl p-3 border border-slate-100 flex items-center justify-between gap-3">
              <div class="min-w-0">
                <p class="font-bold text-slate-800 text-sm truncate">${safeEscapeHTML(r.student?.name || 'Estudiante')}</p>
                <p class="text-[10px] text-slate-500 font-bold">
                  ${new Date(r.date + 'T12:00:00').toLocaleDateString('es-DO', { weekday: 'short', day: 'numeric', month: 'short' })}
                  · ${safeEscapeHTML(r.reason)}
                  ${r.note ? ' · ' + safeEscapeHTML(r.note) : ''}
                </p>
              </div>
              <button
                onclick="window._approveAbsence('${r.id}', '${r.student_id}', '${r.date}')"
                class="shrink-0 px-3 py-1.5 bg-[#28B54D] text-white rounded-xl text-[10px] font-black uppercase hover:bg-[#239943] transition-all active:scale-95 shadow-sm">
                Registrar
              </button>
            </div>
          `).join('')}
        </div>
      </div>`;

    // Insertar antes del contenido de asistencia
    const existing = document.getElementById('absence-requests-banner');
    if (existing) existing.remove();
    container.parentElement?.insertBefore(banner, container);

    // Función global para aprobar ausencia
    window._approveAbsence = async (requestId, studentId, date) => {
      try {
        const classroom = AppState.get('classroom');
        // Registrar como ausente en attendance
        await MaestraApi.upsertAttendance({
          student_id:   studentId,
          classroom_id: classroom.id,
          date,
          status:       'absent'
        });
        // Marcar solicitud como aprobada
        await supabase.from('attendance_requests').update({ status: 'approved' }).eq('id', requestId);
        safeToast('Ausencia registrada correctamente');
        // Recargar
        await initAttendance();
      } catch (e) {
        safeToast('Error al registrar ausencia: ' + e.message, 'error');
      }
    };

    if (window.lucide) window.lucide.createIcons();
  } catch (e) {
  }
}
