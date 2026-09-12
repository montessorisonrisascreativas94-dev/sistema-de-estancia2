/**
 * 🔐 Karpus — Re-autenticación para acciones sensibles
 *
 * Pide la contraseña del usuario antes de aprobar / rechazar / eliminar.
 * Resuelve `true` solo si la contraseña es correcta. Protegido contra
 * fuerza bruta: 4 intentos y bloqueo de 60s (por email, en sessionStorage).
 *
 * Uso:
 *   import { requireReauth } from '../shared/reauth.js';
 *   const ok = await requireReauth({ message: 'eliminar este pago' });
 *   if (!ok) return;
 */
import { supabase } from './supabase.js';

const FAIL_KEY = 'karpus_reauth_fails';
const MAX_ATTEMPTS = 4;
const LOCK_MS = 60000;

function readFails() {
  try { return JSON.parse(sessionStorage.getItem(FAIL_KEY)) || {}; } catch (_) { return {}; }
}
function writeFails(f) {
  try { sessionStorage.setItem(FAIL_KEY, JSON.stringify(f)); } catch (_) {}
}

/**
 * Muestra modal de verificación de contraseña.
 * @param {{ message?: string, timeoutMs?: number }} [opts]
 * @returns {Promise<boolean>}
 */
export async function requireReauth({ message = 'esta acción', timeoutMs = 30000 } = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const email = session?.user?.email || '';
  if (!email) return false;

  const fails = readFails();
  const until = fails[email]?.until || 0;
  if (Date.now() < until) {
    const secs = Math.max(1, Math.round((until - Date.now()) / 1000));
    window.dispatchEvent(new CustomEvent('karpus:toast', { detail: { type: 'error', msg: `Demasiados intentos. Espera ${secs}s.` } }));
    return false;
  }

  let modal = null;

  const finish = (v) => { if (modal) { modal.remove(); modal = null; } return v; };

  return new Promise(resolve => {
    let resolved = false;
    const settle = (v) => { if (resolved) return; resolved = true; resolve(finish(v)); };

    modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[1000] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4';
    modal.innerHTML = `
      <div class="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm animate-scaleIn">
        <div class="flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-100 text-2xl mb-4">🔒</div>
        <h3 class="text-lg font-extrabold text-slate-800 mb-1">Verifica tu identidad</h3>
        <p class="text-sm text-slate-500 mb-5">Ingresa tu contraseña para continuar con <b class="text-slate-700">${message}</b></p>
        <input id="reauthPwd" type="password" autocomplete="current-password" placeholder="Contraseña"
          class="w-full px-4 py-3 bg-slate-100 border-2 border-transparent focus:border-violet-500 outline-none rounded-xl mb-3" />
        <p id="reauthErr" class="text-rose-500 text-xs font-semibold h-4 mb-1"></p>
        <div class="flex gap-2">
          <button id="reauthCancel" class="flex-1 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200">Cancelar</button>
          <button id="reauthOk" class="flex-1 py-3 rounded-xl font-bold text-white bg-violet-600 hover:bg-violet-700 shadow-lg">Verificar</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    const pwd = modal.querySelector('#reauthPwd');
    const errEl = modal.querySelector('#reauthErr');
    let left = MAX_ATTEMPTS;
    let busy = false;

    const verify = async () => {
      if (busy) return;
      const password = pwd.value;
      if (!password) { errEl.textContent = 'Escribe tu contraseña'; pwd.focus(); return; }
      busy = true;
      errEl.textContent = 'Verificando…';
      try {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          left--;
          if (left <= 0) {
            const f = readFails();
            f[email] = { until: Date.now() + LOCK_MS };
            writeFails(f);
            errEl.textContent = 'Demasiados intentos. Intenta en 60s.';
            setTimeout(() => settle(false), 1200);
          } else {
            errEl.textContent = `Contraseña incorrecta (${left} intentos restantes).`;
            pwd.value = '';
            pwd.focus();
          }
        } else {
          const f = readFails(); delete f[email]; writeFails(f);
          settle(true);
        }
      } catch (_) {
        errEl.textContent = 'No se pudo verificar. Intenta de nuevo.';
      } finally {
        busy = false;
      }
    };

    pwd.addEventListener('keydown', e => { if (e.key === 'Enter') verify(); });
    modal.querySelector('#reauthCancel').onclick = () => settle(false);
    modal.querySelector('#reauthOk').onclick = verify;
    pwd.focus();
    setTimeout(() => settle(false), timeoutMs);
  });
}