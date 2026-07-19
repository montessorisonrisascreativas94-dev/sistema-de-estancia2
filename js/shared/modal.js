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
  container.style.cssText = 'display:flex;align-items:flex-start;justify-content:center;padding-top:4vh;position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(8px);z-index:var(--z-modal,100);overflow-y:auto;';

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
  container.onmousedown = null;
}

export function initModalGlobals() {
  window.openGlobalModal = openGlobalModal;
  window.closeGlobalModal = closeGlobalModal;
}
