/**
 * MÓDULO MANTENIMIENTO — Panel Directora
 *
 * Ejecuta la Edge Function `run-migration`, que aplica en la base de datos
 * las correcciones de esquema pendientes (columnas que faltan, políticas RLS).
 *
 * Por qué existe: hasta ahora, cada problema de esquema obligaba a abrir el
 * SQL Editor de Supabase a mano. Con esto, Dirección lo resuelve desde el
 * panel: Configuración → Mantenimiento → "Aplicar correcciones pendientes".
 *
 * Requisito previo (una sola vez, no se puede automatizar): crear la RPC
 * public.run_ddl_migration(text) ejecutando sql/18_run_ddl_migration_rpc.sql
 * en el SQL Editor. Si falta, la función lo indica y lo muestra en pantalla.
 */

import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../shared/supabase.js';

const FN_URL = `${SUPABASE_URL}/functions/v1/run-migration`;

function el(id) { return document.getElementById(id); }

function setBusy(busy, label) {
  const btn = el('btnRunMigrations');
  const lbl = el('btnRunMigrationsLabel');
  if (!btn) return;
  btn.disabled = busy;
  if (lbl && label) lbl.textContent = label;
}

function render(html, tone) {
  const box = el('migrationResult');
  if (!box) return;
  const tones = {
    ok:   'border-emerald-200 bg-emerald-50 text-emerald-800',
    warn: 'border-amber-200 bg-amber-50 text-amber-800',
    err:  'border-rose-200 bg-rose-50 text-rose-800',
  };
  box.className = `mt-4 rounded-xl border p-3 text-xs ${tones[tone] || tones.err}`;
  box.innerHTML = html;
  box.classList.remove('hidden');
}

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Comprueba si el formulario público de preinscripción puede guardar.
 * Sonda inocua: manda un objeto vacío; si la política RLS existe, la fila
 * pasa RLS y solo choca con el NOT NULL de student_name (400 / 23502).
 * Si la política falta, vuelve 401 / 42501. No inserta nada.
 */
async function checkPreregPublicInsert() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/student_preregistrations?select=id`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Prefer': 'return=minimal',
      },
      body: '[{}]',
    });
    const body = await res.text();
    if (/42501|row-level security/i.test(body)) return { ok: false, reason: 'rls' };
    if (/23502|not-null|null value/i.test(body)) return { ok: true };
    if (res.ok) return { ok: true };
    return { ok: false, reason: 'otro', detail: `${res.status} ${body.slice(0, 120)}` };
  } catch (err) {
    return { ok: false, reason: 'red', detail: err?.message || String(err) };
  }
}

export async function runMigrations() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    render('<b>Sesión no válida.</b> Vuelve a iniciar sesión e inténtalo otra vez.', 'err');
    return { ok: false };
  }

  setBusy(true, 'Aplicando...');
  render('Ejecutando migraciones. No cierres esta ventana…', 'warn');

  let res, body;
  try {
    res = await fetch(FN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${session.access_token}`,
      },
    });
    body = await res.json().catch(() => ({}));
  } catch (err) {
    setBusy(false, 'Aplicar correcciones pendientes');
    render(`<b>No se pudo contactar al servidor.</b><br>${esc(err?.message || err)}`, 'err');
    return { ok: false };
  }

  if (body?.needs_bootstrap) {
    setBusy(false, 'Aplicar correcciones pendientes');
    render(
      `<b>Falta un paso que solo se puede hacer una vez.</b><br><br>`
      + `${esc(body.error)}<br><br>`
      + `${esc(body.hint || '')}<br><br>`
      + `<span class="font-mono text-[11px] break-all">${esc(body.detail || '')}</span>`,
      'warn'
    );
    return { ok: false, needsBootstrap: true };
  }

  if (!res.ok || body?.error) {
    setBusy(false, 'Aplicar correcciones pendientes');
    render(
      `<b>${esc(body?.error || `Error ${res.status}`)}</b><br>`
      + `${esc(body?.hint || '')}<br><br>`
      + `<span class="font-mono text-[11px] break-all">${esc(body?.detail || '')}</span>`,
      'err'
    );
    return { ok: false };
  }

  const results = Array.isArray(body?.results) ? body.results : [];
  const okCount  = results.filter(r => r.status === 'success').length;
  const failed   = results.filter(r => r.status !== 'success');

  const rows = results.map(r => `
    <li class="flex items-start gap-2 py-0.5">
      <span class="${r.status === 'success' ? 'text-emerald-600' : 'text-rose-600'}">${r.status === 'success' ? 'OK' : 'X'}</span>
      <span class="font-mono text-[11px] break-all">${esc(r.column)}</span>
    </li>`).join('');

  // Verificación real del resultado: ¿acepta ya la preinscripción pública?
  const prereg = await checkPreregPublicInsert();

  setBusy(false, 'Aplicar correcciones pendientes');

  if (failed.length === 0 && prereg.ok) {
    render(
      `<b>Listo.</b> ${okCount} correcciones aplicadas y el formulario público de preinscripción ya acepta registros.`
      + `<details class="mt-2"><summary class="cursor-pointer font-bold">Ver detalle</summary><ul class="mt-1">${rows}</ul></details>`,
      'ok'
    );
    return { ok: true };
  }

  if (failed.length === 0 && !prereg.ok) {
    render(
      `<b>Las correcciones se aplicaron, pero la preinscripción pública sigue bloqueada.</b><br>`
      + (prereg.reason === 'rls'
          ? 'La política <span class="font-mono">prereg_public_insert</span> no quedó activa. Revisa que las políticas de esa tabla no se hayan borrado desde el panel de Supabase.'
          : `No se pudo verificar (${esc(prereg.detail || prereg.reason)}).`)
      + `<details class="mt-2"><summary class="cursor-pointer font-bold">Ver detalle</summary><ul class="mt-1">${rows}</ul></details>`,
      'warn'
    );
    return { ok: false };
  }

  render(
    `<b>${failed.length} de ${results.length} correcciones fallaron.</b> Las que aparecen con ✗ son las que debes revisar.<br><br>`
    + `<ul>${rows}</ul>`
    + `<div class="mt-2">${failed.map(f => `<div class="font-mono text-[11px] break-all">${esc(f.column)}: ${esc(f.message)}</div>`).join('')}</div>`,
    'err'
  );
  return { ok: false };
}

export function initMaintenance() {
  el('btnRunMigrations')?.addEventListener('click', async () => {
    const ok = await runMigrations();
    // Si todo fue bien, refresca el badge de pendientes por si cambió el conteo.
    if (ok?.ok) {
      try { await supabase.from('student_preregistrations').select('id', { count: 'exact', head: true }).eq('status', 'pending'); } catch (_) {}
    }
  });
}

export const MaintenanceModule = { init: initMaintenance, run: runMigrations };
