import { supabase, sendPush } from '../../shared/supabase.js';
import { TABLES } from '../../shared/constants.js';
import { AppState } from '../state.js';
import { MaestraApi } from '../api.js';
import { UI } from './ui.js';
import { Helpers } from '../../shared/helpers.js';

const { safeToast, safeEscapeHTML, Modal } = UI;

export function openStudentProfile(studentId) {
  const student = AppState.get('students').find(s => s.id == studentId);
  if (!student) return safeToast('Estudiante no encontrado', 'error');
  
  const modalId = 'studentProfileModal';
  const content = `
    <div class="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-fadeIn flex flex-col max-h-[90vh]">
      <!-- Header limpio con ícono -->
      <div class="px-8 pt-8 pb-6 flex justify-between items-start">
        <div class="flex items-center gap-6">
          <div class="w-20 h-20 rounded-3xl bg-green-100 flex items-center justify-center shadow-lg">
            <div class="w-16 h-16 rounded-2xl bg-green-50 flex items-center justify-center text-3xl font-black text-green-600 overflow-hidden border-2 border-white">
              ${student.avatar_url ? `<img src="${student.avatar_url}" class="w-full h-full object-cover">` : student.name.charAt(0)}
            </div>
          </div>
          <div>
            <h3 class="text-3xl font-black text-slate-800">${safeEscapeHTML(student.name)}</h3>
            <p class="text-xs font-black text-green-600 uppercase tracking-widest mt-1">Ficha del Alumno</p>
          </div>
        </div>
        <button onclick="Modal.close('${modalId}')" class="p-2 hover:bg-slate-100 rounded-full transition-colors">
          <i data-lucide="x" class="w-6 h-6 text-slate-400"></i>
        </button>
      </div>
      
      <div class="space-y-6 overflow-y-auto pr-2 px-8 pb-6">
        <!-- SECCIÓN QR CORPORATIVO - con franja verde -->
        <div class="relative bg-white p-6 rounded-[2rem] shadow-[0_8px_30px_rgba(0,0,0,0.04)] space-y-4 overflow-hidden">
          <div class="absolute top-0 left-0 bottom-0 w-1 bg-green-500"></div>
          <h4 class="text-sm font-black text-slate-800 flex items-center gap-2 ml-2">
            <div class="w-8 h-8 rounded-xl bg-green-100 text-green-600 flex items-center justify-center"><i data-lucide="qr-code" class="w-4 h-4"></i></div>
            CARNET DIGITAL COLEGIO MONTESSORI SONRISAS CREATIVAS
          </h4>
          <div class="flex flex-col sm:flex-row items-center gap-6 bg-slate-50 p-6 rounded-2xl ml-2">
            <div id="student-qr-container" class="bg-white p-2 rounded-2xl shadow-inner">
               <!-- El QR se genera aquí -->
            </div>
            <div class="flex-1 space-y-3 w-full">
              <div class="bg-white p-3 rounded-xl border border-slate-100">
                <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Matrícula</p>
                <p class="text-sm font-black text-slate-700">${student.matricula || 'PENDIENTE'}</p>
              </div>
              <button onclick="window._printStudentQRMaestra('${student.id}')" class="w-full py-3 bg-green-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-green-600 transition-all flex items-center justify-center gap-2 shadow-lg shadow-green-100">
                <i data-lucide="printer" class="w-4 h-4"></i> Imprimir Credencial
              </button>
            </div>
          </div>
        </div>

        <!-- Datos del Alumno - con franja verde -->
        <div class="relative bg-white p-6 rounded-[2rem] shadow-[0_8px_30px_rgba(0,0,0,0.04)] overflow-hidden">
          <div class="absolute top-0 left-0 bottom-0 w-1 bg-green-500"></div>
          <h4 class="font-bold text-sm text-slate-400 uppercase tracking-wider mb-4 ml-2">Datos del Alumno</h4>
          <div class="grid grid-cols-2 gap-4 text-sm ml-2">
            <div class="flex flex-col"><span class="font-bold text-slate-400 text-xs">Alergias</span> <span class="text-rose-500 font-bold">${safeEscapeHTML(student.allergies || 'Ninguna')}</span></div>
            <div class="flex flex-col"><span class="font-bold text-slate-400 text-xs">Tipo de Sangre</span> <span class="text-slate-700 font-medium">${safeEscapeHTML(student.blood_type || 'N/A')}</span></div>
            <div class="flex flex-col col-span-2"><span class="font-bold text-slate-400 text-xs">Personas Autorizadas para Recoger</span> <span class="text-slate-700 font-medium">${safeEscapeHTML(student.authorized_pickup || 'N/A')}</span></div>
          </div>
        </div>

        <!-- Contacto Principal - con franja verde -->
        <div class="relative bg-white p-6 rounded-[2rem] shadow-[0_8px_30px_rgba(0,0,0,0.04)] overflow-hidden">
          <div class="absolute top-0 left-0 bottom-0 w-1 bg-green-500"></div>
          <h4 class="font-bold text-sm text-slate-400 uppercase tracking-wider mb-4 ml-2">Contacto Principal (Tutor 1)</h4>
          <div class="grid grid-cols-2 gap-4 text-sm ml-2">
            <div class="flex flex-col"><span class="font-bold text-slate-400 text-xs">Nombre</span> <span class="text-slate-700 font-medium">${safeEscapeHTML(student.p1_name || 'N/A')}</span></div>
            <div class="flex flex-col"><span class="font-bold text-slate-400 text-xs">Teléfono</span> <span class="text-slate-700 font-medium">${safeEscapeHTML(student.p1_phone || 'N/A')}</span></div>
            <div class="flex flex-col col-span-2"><span class="font-bold text-slate-400 text-xs">Email</span> <span class="text-slate-700 font-medium">${safeEscapeHTML(student.p1_email || 'N/A')}</span></div>
          </div>
        </div>

        ${(student.p2_name || student.p2_phone) ? `
        <!-- Contacto Secundario - con franja verde -->
        <div class="relative bg-white p-6 rounded-[2rem] shadow-[0_8px_30px_rgba(0,0,0,0.04)] overflow-hidden">
          <div class="absolute top-0 left-0 bottom-0 w-1 bg-green-500"></div>
          <h4 class="font-bold text-sm text-slate-400 uppercase tracking-wider mb-4 ml-2">Contacto Secundario (Tutor 2)</h4>
          <div class="grid grid-cols-2 gap-4 text-sm ml-2">
            <div class="flex flex-col"><span class="font-bold text-slate-400 text-xs">Nombre</span> <span class="text-slate-700 font-medium">${safeEscapeHTML(student.p2_name || 'N/A')}</span></div>
            <div class="flex flex-col"><span class="font-bold text-slate-400 text-xs">Teléfono</span> <span class="text-slate-700 font-medium">${safeEscapeHTML(student.p2_phone || 'N/A')}</span></div>
          </div>
        </div>` : ''}
      </div>
      
      <!-- Botones del modal -->
      <div class="px-8 pb-8 pt-2 border-t border-slate-100">
        <button onclick="Modal.close('${modalId}')" class="w-full py-4 bg-slate-50 text-slate-500 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-100 transition-colors">Cerrar Ficha</button>
      </div>
    </div>
  `;
  Modal.open(modalId, content);

  // Generar QR en el modal
  setTimeout(() => {
    const container = document.getElementById('student-qr-container');
    if (container && student.matricula && window.QRCode) {
      new QRCode(container, {
        text: student.matricula,
        width: 120,
        height: 120,
        colorDark: "#0f172a",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
      });
    }
  }, 100);

  // Función global para imprimir desde el panel maestra
  window._printStudentQRMaestra = (id) => {
    const s = AppState.get('students').find(x => x.id == id);
    const canvas = document.querySelector('#student-qr-container canvas');
    if (!canvas || !s) return;
    const imgData = canvas.toDataURL("image/png");
    const win = window.open('', '_blank');
    win.document.write(Helpers.getQRPrintTemplate(imgData, s.name, s.matricula));
    win.document.close();
  };
}

export function registerIncidentModal(studentId) {
  const student = AppState.get('students').find(s => s.id == studentId);
  if (!student) return safeToast('Estudiante no encontrado', 'error');
  
  const modalId = 'incidentModal';
  const content = `
    <div class="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden animate-fadeIn flex flex-col">
      <!-- Header limpio con ícono en círculo naranja -->
      <div class="px-8 pt-8 pb-6 flex justify-between items-start">
        <div class="flex items-center gap-4">
          <div class="w-16 h-16 rounded-3xl bg-orange-100 flex items-center justify-center shadow-lg">
            <i data-lucide="alert-triangle" class="w-8 h-8 text-orange-600"></i>
          </div>
          <div>
            <h3 class="text-2xl font-black text-slate-800">Reportar Incidente</h3>
            <p class="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">${safeEscapeHTML(student.name)}</p>
          </div>
        </div>
        <button onclick="Modal.close('${modalId}')" class="p-2 hover:bg-slate-100 rounded-full transition-colors">
          <i data-lucide="x" class="w-6 h-6 text-slate-400"></i>
        </button>
      </div>
      
      <form id="incidentForm" class="space-y-5 px-8 pb-8">
        <!-- Contenedor con franja naranja -->
        <div class="relative bg-white p-6 rounded-[2rem] shadow-[0_8px_30px_rgba(0,0,0,0.04)] overflow-hidden">
          <div class="absolute top-0 left-0 bottom-0 w-1 bg-orange-500"></div>
          
          <div class="ml-2 space-y-5">
            <div>
              <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Severidad</label>
              <select id="incSeverity" class="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-bold focus:border-green-500 outline-none transition-colors">
                <option value="leve">Leve</option>
                <option value="media">Media</option>
                <option value="alta">Alta</option>
              </select>
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Descripción del incidente</label>
              <textarea id="incDesc" rows="4" class="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm focus:border-green-500 outline-none resize-none transition-colors" placeholder="Detalla lo sucedido de forma clara y objetiva..." required></textarea>
            </div>
          </div>
        </div>

        <div class="flex justify-end gap-3 pt-4">
          <button type="button" onclick="Modal.close('${modalId}')" class="px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-50 transition-colors">Cancelar</button>
          <button type="submit" class="px-6 py-3 rounded-xl font-bold bg-green-500 text-white hover:bg-green-600 shadow-lg shadow-green-100 transition-all active:scale-95 flex items-center gap-2">
            <i data-lucide="send" class="w-4 h-4"></i> Enviar Reporte
          </button>
        </div>
      </form>
    </div>
  `;
  Modal.open(modalId, content);

  const form = document.getElementById('incidentForm');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Enviando...';
    if(window.lucide) window.lucide.createIcons();
    
    try {
      const payload = {
        student_id: student.id,
        classroom_id: AppState.get('classroom').id,
        teacher_id: AppState.get('user').id,
        severity: document.getElementById('incSeverity').value,
        description: document.getElementById('incDesc').value
      };

      await MaestraApi.registerIncident(payload);
      safeToast('Incidente reportado correctamente');
      Modal.close(modalId);

      if (student.parent_id) {
        sendPush({
          user_id: student.parent_id,
          title: 'Aviso de Incidente ⚠️',
          message: `Se ha registrado un reporte de conducta sobre ${student.name}.`,
          link: 'panel_padres.html#incidents'
        }).catch(() => {});
      }

      const statEl = document.getElementById('statIncidents');
      if (statEl) {
        const current = parseInt(statEl.textContent || '0', 10);
        statEl.textContent = current + 1;
      }
    } catch (err) {
      safeToast('Error al reportar incidente.', 'error');
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="send" class="w-4 h-4"></i> Enviar Reporte';
      if(window.lucide) window.lucide.createIcons();
    }
  };
}
