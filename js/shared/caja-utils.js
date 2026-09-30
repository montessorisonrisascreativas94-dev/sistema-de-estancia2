/**
 * Caja Utilities — Constantes, catálogo, cálculos y helpers compartidos
 * Usado por caja-cobro-v2.js
 */

// ── FORMATEO ────────────────────────────────────────────────────────────────
export const fmt = n => 'RD$' + Number(n || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 });
export const fmtN = n => Number(n || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 });
export const today = () => new Date().toISOString().split('T')[0];

// ── MESES ───────────────────────────────────────────────────────────────────
export const MONTHS_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
export const MONTHS_FULL  = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// ── CATÁLOGO DE CONCEPTOS EXTRAS ───────────────────────────────────────────
// Fuente: Supabase (payment_concepts) con fallback a este catálogo estático.
// Todos los montos deben ser CONSISTENTES entre paneles.
export const DEFAULT_CATALOG = [
  { id: 'uniforme',     label: 'Uniforme',      amount: 3200, icon: '👕' },
  { id: 'transporte',   label: 'Transporte',    amount: 1500, icon: '🚌' },
  { id: 'libros',       label: 'Libros',        amount: 2500, icon: '📚' },
  { id: 'materiales',   label: 'Materiales',    amount: 800,  icon: '🎨' },
  { id: 'actividades',  label: 'Actividades',   amount: 1200, icon: '🎉' },
  { id: 'excursiones',  label: 'Excursiones',   amount: 3500, icon: '🏕️' },
  { id: 'comedor',      label: 'Comedor',       amount: 2000, icon: '🍽️' },
  { id: 'tutorias',     label: 'Tutorías',      amount: 1800, icon: '📝' },
  { id: 'certificados', label: 'Certificados',  amount: 500,  icon: '🏆' },
  { id: 'otro',         label: 'Otro',          amount: 0,    icon: '➕' },
];

// ── CÁLCULO DE MORA ────────────────────────────────────────────────────────
// Fórmula: 5% del monto de la cuota despues del dia 6 de atraso
// Solo aplica a charges con status 'overdue' y fecha de vencimiento pasada.
export function calcMora(charges) {
  let mora = 0;
  if (!charges || !Array.isArray(charges)) return mora;
  const now = Date.now();
  charges.filter(c => c.status === 'overdue').forEach(c => {
    if (c.due_date) {
      const days = Math.floor((now - new Date(c.due_date + 'T00:00:00').getTime()) / 86400000);
      if (days > 6) {
        mora += Math.round((c.amount || 0) * 0.05 * 100) / 100;
      }
    }
  });
  return mora;
}

// ── CÁLCULO DE DESCUENTO ───────────────────────────────────────────────────
// Descuento por porcentaje sobre (subtotal + mora)
export function calcDiscount(subtotal, mora, discountPercent) {
  const pct = Math.max(0, Math.min(100, Number(discountPercent) || 0));
  return Math.round((subtotal + mora) * pct / 100 * 100) / 100;
}

// ── CÁLCULO DE TOTAL ───────────────────────────────────────────────────────
export function calcTotal(cart, mora = 0, discount = 0) {
  const sub = cart.reduce((s, c) => s + (c.amount || 0), 0);
  return Math.max(0, sub + mora - discount);
}

// ── BANCOS DOMINICANOS ─────────────────────────────────────────────────────
export const BANK_OPTIONS = [
  'Banreservas', 'Banco Popular Dominicano', 'Banco BHD', 'Banco Santa Cruz',
  'Banco Caribe', 'Banco Vimenca', 'Bancamérica', 'Banesco', 'Scotiabank', 'Otro'
];

export function bankSelectOpts() {
  return BANK_OPTIONS.map(b => `<option value="${b}">${b}</option>`).join('');
}

// ── INPUT STYLE HELPER ─────────────────────────────────────────────────────
export const INP = 'width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;font-size:.8rem;font-weight:600;outline:none;box-sizing:border-box;margin-bottom:6px';
export const LBL = (t) => `<div style="font-size:.62rem;font-weight:900;color:#94a3b8;text-transform:uppercase;margin-bottom:4px;margin-top:8px">${t}</div>`;

// ── UPLOAD BUTTON HELPER ───────────────────────────────────────────────────
export function uploadBtn(id, label, onchangeFn) {
  return `
    <label style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:2px dashed #e2e8f0;border-radius:10px;cursor:pointer;background:#f8fafc;transition:all .12s"
      onmouseover="this.style.borderColor='#0B63C7'" onmouseout="this.style.borderColor='#e2e8f0'">
      <span style="font-size:.8rem;font-weight:800;color:#64748b">📎 ${label}</span>
      <input type="file" id="${id}" accept="image/*,application/pdf" style="display:none"
        onchange="${onchangeFn}">
      <span id="prev_${id}" style="font-size:.7rem;color:#0B63C7;font-weight:700;margin-left:auto"></span>
    </label>`;
}

// ── RNC / FACTURA FISCAL SECTION ───────────────────────────────────────────
export function rncSection() {
  return `
    ${LBL('¿Requiere factura con RNC?')}
    <button type="button"
      onclick="document.getElementById('ncfBlock').style.display=document.getElementById('ncfBlock').style.display==='none'?'block':'none'"
      style="font-size:.7rem;font-weight:900;color:#0B63C7;border:1px solid #0B63C7;background:transparent;border-radius:8px;padding:6px 14px;cursor:pointer;margin-bottom:6px">
      + RNC / Factura Fiscal
    </button>
    <div id="ncfBlock" style="display:none">
      ${LBL('RNC de la empresa')}
      <input id="rncEmpresa" placeholder="Ej: 1-31-12345-6" style="${INP}">
      ${LBL('Nombre / Razón Social')}
      <input id="nombreEmpresa" placeholder="Empresa S.R.L." style="${INP}">
    </div>`;
}
