/**
 * Módulo de Interfaz de Usuario para el Panel de Maestra
 */

export const safeToast = (message, type = 'success') => {
  if (!message) return;
  try {
    if (window.Helpers && typeof window.Helpers.toast === 'function') {
      return window.Helpers.toast(message, type);
    }
  } catch (_) {
    // silencioso
  }
};

export const safeEscapeHTML = (str = '') => {
  try {
    if (window.Helpers && typeof window.Helpers.escapeHTML === 'function') {
      return window.Helpers.escapeHTML(str);
    }
  } catch (e) {}
  return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
};

/** Escapa URLs para uso seguro en atributos src= — previene javascript: y attribute breakout */
export const safeUrl = (url = '') => {
  if (!url) return '';
  const s = String(url).trim();
  if (/^javascript:/i.test(s) || /^data:/i.test(s) || /^vbscript:/i.test(s)) return '';
  return s.replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
};

/** Escapa strings para interpolación en contexto JavaScript (onclick, etc.) */
export const safeJS = (str = '') => {
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
};

export const Modal = {
  open(id, content) {
    document.getElementById(id)?.remove();
    const modal = document.createElement('div');
    modal.id = id;
    // Backdrop normal (sin color verde)
    modal.className = [
      'fixed inset-0 z-[9998]',
      'flex items-start justify-center',
      'pt-[3vh] pb-6 px-4',
      'overflow-y-auto'
    ].join(' ');
    modal.style.cssText = 'background:rgba(0,0,0,0.5);backdrop-filter:blur(4px);';

    modal.innerHTML = `
      <div id="${id}-inner"
           class="relative w-full max-w-2xl"
           style="animation:modalPop .3s cubic-bezier(0.34,1.56,0.64,1) both;">
        ${content}
      </div>
    `;

    // Cerrar al hacer clic fuera del contenido
    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.close(id);
    });

    document.body.appendChild(modal);
    requestAnimationFrame(() => window.lucide?.createIcons());

    // Inject keyframe if not yet present
    if (!document.getElementById('_modalKeyframe')) {
      const s = document.createElement('style');
      s.id = '_modalKeyframe';
      s.textContent = `
        @keyframes modalPop {
          from { opacity:0; transform:scale(0.92) translateY(20px); }
          to { opacity:1; transform:scale(1) translateY(0); }
        }
        /* Maestra modal card base — Sonrisas Creativas */
        #${id}-inner > div {
          border-radius: 32px;
          overflow: hidden;
          box-shadow: 0 28px 80px rgba(40,181,77,0.2), 0 8px 30px rgba(0,0,0,0.12);
        }
      `;
      document.head.appendChild(s);
    }
  },
  close(id) {
    document.getElementById(id)?.remove();
  }
};

export const Skeleton = {
  render(type, count = 3) {
    const skeletons = {
      card: `
        <div class="p-6 bg-white rounded-[2rem] border border-slate-100 shadow-sm animate-pulse">
          <div class="flex items-center gap-4 mb-6">
            <div class="w-16 h-16 rounded-2xl bg-slate-100"></div>
            <div class="flex-1 space-y-2">
              <div class="h-4 bg-slate-100 rounded w-3/4"></div>
              <div class="h-3 bg-slate-100 rounded w-1/2"></div>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div class="h-10 bg-slate-50 rounded-xl"></div>
            <div class="h-10 bg-slate-50 rounded-xl"></div>
          </div>
        </div>
      `,
      list: `
        <div class="flex items-center justify-between p-4 bg-white rounded-3xl border border-slate-100 shadow-sm animate-pulse">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-slate-100"></div>
            <div class="h-4 bg-slate-100 rounded w-32"></div>
          </div>
          <div class="flex gap-2">
            <div class="w-16 h-8 bg-slate-50 rounded-xl"></div>
            <div class="w-16 h-8 bg-slate-50 rounded-xl"></div>
          </div>
        </div>
      `,
      tableRow: `
        <tr class="animate-pulse">
          <td class="px-5 py-4"><div class="h-4 bg-slate-100 rounded w-32"></div></td>
          <td class="px-5 py-4 text-center"><div class="h-6 bg-slate-100 rounded-full w-12 mx-auto"></div></td>
          <td class="px-5 py-4 text-center"><div class="h-4 bg-slate-100 rounded w-16 mx-auto"></div></td>
          <td class="px-5 py-4 text-right"><div class="h-8 bg-slate-100 rounded-xl w-20 ml-auto"></div></td>
        </tr>
      `
    };

    return Array(count).fill(skeletons[type] || skeletons.card).join('');
  }
};

export const updateDashboardStats = (stats = {}) => {
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  if (stats.students !== undefined) set('statStudents', stats.students);
  if (stats.present !== undefined) set('statPresent', stats.present);
  if (stats.incidents !== undefined) set('statIncidents', stats.incidents);
  if (stats.classes !== undefined) set('statClasses', stats.classes);
};

// Exportación unificada para módulos que prefieren el objeto UI
export const UI = {
  safeToast,
  safeEscapeHTML,
  safeUrl,
  safeJS,
  Modal,
  Skeleton,
  updateDashboardStats
};

export default UI;
