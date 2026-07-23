/**
 * Modal global unificado — reemplaza las 4 definiciones duplicadas
 * de openGlobalModal en directora/main, asistente/main, encargada/main y asistente/payments.
 */

export function openGlobalModal(html, wide = false) {
  const container = document.getElementById('globalModalContainer');
  if (!container) return;
  const maxW = wide ? 'max-w-4xl' : 'max-w-2xl';
  container.innerHTML = `
    <div id="globalModalInner" class="bg-white rounded-3xl shadow-2xl w-full ${maxW} max-h-[92vh] overflow-y-auto mx-3 my-4 relative animate-scaleIn">
      <button onclick="closeGlobalModal()" class="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-rose-50 hover:text-rose-500 transition-all z-[110]">
        <i data-lucide="x" class="w-6 h-6"></i>
      </button>
      ${html}
    </div>`;

  // Use individual style properties instead of cssText to preserve existing inline styles
  container.style.display = 'flex';
  container.style.alignItems = 'flex-start';
  container.style.justifyContent = 'center';
  container.style.paddingTop = '4vh';
  container.style.position = 'fixed';
  container.style.inset = '0';
  container.style.background = 'rgba(0,0,0,0.6)';
  container.style.backdropFilter = 'blur(8px)';
  container.style.webkitBackdropFilter = 'blur(8px)';
  container.style.zIndex = '9999';
  container.style.overflowY = 'auto';

  container.classList.remove('hidden');

  container.onmousedown = (e) => {
    if (e.target === container) closeGlobalModal();
  };

  if (window.lucide) lucide.createIcons();
}

export function closeGlobalModal() {
  const container = document.getElementById('globalModalContainer');
  if (!container) return;
  container.innerHTML = '';
  container.style.display = 'none';
  container.style.backdropFilter = 'none';
  container.style.webkitBackdropFilter = 'none';
  container.classList.add('hidden');
  container.onmousedown = null;
}

export function initModalGlobals() {
  window.openGlobalModal = openGlobalModal;
  window.closeGlobalModal = closeGlobalModal;
}
