/**
 * OCR Service — Extraccion automatica de datos de comprobantes bancarios
 * Usa Tesseract.js (gratuito, client-side) para leer imagenes de transferencias.
 * Extrae: banco, referencia, monto, fecha.
 */
import { Helpers } from './helpers.js';

const TESSERACT_CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';

let _tesseractLoaded = false;
let _worker = null;

// Bancos dominicanos y sus patrones de texto
const BANK_PATTERNS = [
  { name: 'Banreservas',     patterns: [/banreservas?/i, /banco\s*reservas/i, /reservas/i] },
  { name: 'Banco Popular Dominicano', patterns: [/popular\s*dominicano/i, /popular/i, /bpd/i] },
  { name: 'Banco BHD',       patterns: [/bhd\s*leon/i, /bhd/i, /banco\s*bhd/i] },
  { name: 'Banco Santa Cruz', patterns: [/santa\s*cruz/i] },
  { name: 'Banco Caribe',    patterns: [/banco\s*caribe/i, /caribe/i] },
  { name: 'Banesco',         patterns: [/banesco/i] },
  { name: 'Scotiabank',      patterns: [/scotia/i, /scotiabank/i] },
  { name: 'Banco Promerica', patterns: [/promerica/i, /banco\s*promerica/i] },
  { name: 'Banficohesa',     patterns: [/banficohesa/i, /banfico/i] },
  { name: 'Asociacion Popular de Ahorros y Prestamos', patterns: [/asociacion\s*popular/i, /apap/i] },
  { name: 'Vimenca',         patterns: [/vimenca/i, /vimen/i] },
  { name: 'QIK',             patterns: [/qik\s*bank/i, /qik/i] },
  { name: 'BAC',             patterns: [/bac\s*credomatic/i, /bac/i] },
  { name: 'Agricola',        patterns: [/banco\s*agr[ií]cola/i, /agr[ií]cola/i] },
  { name: 'Avista',          patterns: [/avista/i] },
  { name: 'Bonanza',         patterns: [/bonanza/i] }
];

/**
 * Carga dinamica de Tesseract.js desde CDN
 */
async function loadTesseract() {
  if (_tesseractLoaded && window.Tesseract) return true;
  try {
    if (!window.Tesseract) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = TESSERACT_CDN;
        s.onload = resolve;
        s.onerror = () => reject(new Error('No se pudo cargar Tesseract.js desde CDN'));
        document.head.appendChild(s);
      });
    }
    _tesseractLoaded = true;
    return true;
  } catch (e) {
    console.error('[OCR] Error cargando Tesseract:', e);
    return false;
  }
}

/**
 * Detectar banco a partir del texto OCR
 */
function detectBank(text) {
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const bank of BANK_PATTERNS) {
    for (const pat of bank.patterns) {
      if (pat.test(text) || pat.test(normalized)) {
        return bank.name;
      }
    }
  }
  return null;
}

/**
 * Detectar referencia bancaria (numeros de 6-20 digitos)
 * Prioriza patrones tipicos de transferencias
 */
function detectReference(text) {
  // Patron 1: "Referencia: 1234567890" o "Ref: 1234567890" o "#1234567890"
  const labeledRef = text.match(/(?:ref(?:erencia)?|no\.?|num(?:ero)?|#|cod(?:igo)?)\s*[:;]?\s*(\d{5,20})/i);
  if (labeledRef) return labeledRef[1];

  // Patron 2: "Confirmacion 1234567890" o "Comprobante 1234567890"
  const confirmRef = text.match(/(?:confirmaci[oó]n|comprobante|transacci[oó]n|operaci[oó]n|orden)\s*[:;]?\s*(\d{5,20})/i);
  if (confirmRef) return confirmRef[1];

  // Patron 3: Secuencia larga de digitos (6-20)
  const longNum = text.match(/\b(\d{6,20})\b/g);
  if (longNum) {
    // Filtrar fechas (8 digitos tipo 20260725) y montos
    const filtered = longNum.filter(n => {
      if (/^\d{4}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(n)) return false;
      if (n.length === 8 && parseInt(n.substring(0,4)) >= 2020 && parseInt(n.substring(0,4)) <= 2030) return false;
      return true;
    });
    if (filtered.length) return filtered[0];
  }

  return null;
}

/**
 * Detectar monto
 */
function detectAmount(text) {
  // Patron 1: RD$ 1,234.56 o RD$1234.56
  const rdMatch = text.match(/RD\$?\s*([\d,]+\.?\d{0,2})/i);
  if (rdMatch) return parseFloat(rdMatch[1].replace(/,/g, ''));

  // Patron 2: $1,234.56
  const usdMatch = text.match(/\$\s*([\d,]+\.?\d{0,2})/);
  if (usdMatch) return parseFloat(usdMatch[1].replace(/,/g, ''));

  // Patron 3: "Monto: 1234.56" o "Total: 1,234.56"
  const labeledAmt = text.match(/(?:monto|total|importe|pagado|transferir|enviar)\s*[:;]?\s*\$?\s*([\d,]+\.?\d{0,2})/i);
  if (labeledAmt) return parseFloat(labeledAmt[1].replace(/,/g, ''));

  // Patron 4: Numero con decimales que parece monto (1,234.56 o 1234.56)
  const amtMatch = text.match(/\b([\d]{1,3}(?:,\d{3})+\.\d{2})\b/);
  if (amtMatch) return parseFloat(amtMatch[1].replace(/,/g, ''));

  // Patron 5: Numero simple con .00 al final
  const simpleAmt = text.match(/\b(\d{2,6}\.\d{2})\b/);
  if (simpleAmt) return parseFloat(simpleAmt[1]);

  return null;
}

/**
 * Detectar fecha de transferencia
 */
function detectDate(text) {
  // Patron 1: DD/MM/YYYY o DD-MM-YYYY
  const dmy = text.match(/\b(0[1-9]|[12]\d|3[01])[\/\-](0[1-9]|1[0-2])[\/\-](\d{4})\b/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;

  // Patron 2: YYYY-MM-DD
  const ymd = text.match(/\b(\d{4})[\/\-](0[1-9]|1[0-2])[\/\-](0[1-9]|[12]\d|3[01])\b/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;

  // Patron 3: "25 de julio de 2026" o "25 julio 2026"
  const monthNames = {
    enero: '01', febrero: '02', marzo: '03', abril: '04', mayo: '05', junio: '06',
    julio: '07', agosto: '08', septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12'
  };
  const longDate = text.match(/\b(\d{1,2})\s*(?:de\s*)?(\w+)\s*(?:de\s*)?(\d{4})\b/i);
  if (longDate) {
    const monthNum = monthNames[longDate[2].toLowerCase()];
    if (monthNum) return `${longDate[3]}-${monthNum}-${longDate[1].padStart(2, '0')}`;
  }

  // Patron 4: "Jul 25, 2026" o "July 25, 2026"
  const enMonth = text.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+(\d{1,2}),?\s*(\d{4})\b/i);
  if (enMonth) {
    const months = { jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06', jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12' };
    const m = months[enMonth[1].toLowerCase().substring(0,3)];
    if (m) return `${enMonth[3]}-${m}-${enMonth[2].padStart(2, '0')}`;
  }

  return null;
}

/**
 * Procesar imagen con OCR y extraer datos del comprobante
 * @param {File|string} input — File object o URL de la imagen
 * @returns {Promise<{text, bank, reference, amount, date}>}
 */
export async function processTransferReceipt(input) {
  const loaded = await loadTesseract();
  if (!loaded) {
    return { text: '', bank: null, reference: null, amount: null, date: null, error: 'No se pudo cargar el motor OCR' };
  }

  try {
    let imageSource;
    if (input instanceof File) {
      imageSource = input;
    } else {
      imageSource = input;
    }

    const { data: { text } } = await window.Tesseract.recognize(imageSource, 'spa+eng', {
      logger: () => {}
    });

    const bank = detectBank(text);
    const reference = detectReference(text);
    const amount = detectAmount(text);
    const date = detectDate(text);

    return { text, bank, reference, amount, date, error: null };
  } catch (e) {
    console.error('[OCR] Error procesando imagen:', e);
    return { text: '', bank: null, reference: null, amount: null, date: null, error: e.message || 'Error al procesar imagen' };
  }
}

/**
 * Renderizar overlay de progreso OCR en un contenedor
 */
export function showOCRProgress(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.classList.remove('hidden');
  el.innerHTML = `
    <div class="p-3 bg-blue-50 border border-blue-200 rounded-xl space-y-2">
      <div class="flex items-center gap-2">
        <div class="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0"></div>
        <p class="text-xs font-bold text-blue-700">Analizando comprobante...</p>
      </div>
      <div class="flex gap-1.5">
        <span id="ocrStep1" class="text-[9px] font-bold text-blue-500 bg-blue-100 px-2 py-0.5 rounded-full animate-pulse">🏦 Banco</span>
        <span id="ocrStep2" class="text-[9px] font-bold text-blue-500 bg-blue-100 px-2 py-0.5 rounded-full animate-pulse" style="animation-delay:0.3s">🔢 Ref</span>
        <span id="ocrStep3" class="text-[9px] font-bold text-blue-500 bg-blue-100 px-2 py-0.5 rounded-full animate-pulse" style="animation-delay:0.6s">💰 Monto</span>
        <span id="ocrStep4" class="text-[9px] font-bold text-blue-500 bg-blue-100 px-2 py-0.5 rounded-full animate-pulse" style="animation-delay:0.9s">📅 Fecha</span>
      </div>
    </div>`;
}

/**
 * Renderizar resultados OCR en un contenedor
 */
export function showOCRResults(containerId, result) {
  const el = document.getElementById(containerId);
  if (!el) return;

  if (result.error) {
    el.innerHTML = `
      <div class="p-3 bg-amber-50 border border-amber-200 rounded-xl">
        <p class="text-xs font-bold text-amber-700 flex items-center gap-1.5">
          <span>⚠️</span> No se pudo leer el comprobante automaticamente
        </p>
        <p class="text-[10px] text-amber-600 mt-1">Por favor completa los datos manualmente</p>
      </div>`;
    return;
  }

  const items = [];
  if (result.bank) items.push({ icon: '🏦', label: 'Banco', value: result.bank });
  if (result.reference) items.push({ icon: '🔢', label: 'Referencia', value: result.reference });
  if (result.amount) items.push({ icon: '💰', label: 'Monto', value: 'RD$ ' + result.amount.toLocaleString('es-DO', { minimumFractionDigits: 2 }) });
  if (result.date) items.push({ icon: '📅', label: 'Fecha', value: result.date });

  if (!items.length) {
    el.innerHTML = `
      <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl">
        <p class="text-xs font-bold text-slate-500 flex items-center gap-1.5">
          <span>📄</span> Texto detectado pero no se encontraron datos bancarios
        </p>
        <p class="text-[10px] text-slate-400 mt-1">Completa los datos manualmente</p>
      </div>`;
    return;
  }

  el.innerHTML = `
    <div class="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
      <p class="text-xs font-bold text-emerald-700 flex items-center gap-1.5">
        <span>✅</span> Datos detectados automaticamente
      </p>
      <div class="grid grid-cols-2 gap-x-4 gap-y-1">
        ${items.map(i => `
          <div class="flex items-center gap-1.5 text-xs">
            <span>${i.icon}</span>
            <span class="font-bold text-slate-500">${i.label}:</span>
          </div>
          <div class="text-xs font-black text-emerald-800 truncate">${i.value}</div>
        `).join('')}
      </div>
      <div class="pt-1.5 border-t border-emerald-200/60">
        <p class="text-[9px] font-bold text-emerald-600 flex items-center gap-1">
          <i data-lucide="check-circle" class="w-3 h-3"></i>
          Estos datos se enviaran automaticamente con tu comprobante
        </p>
      </div>
    </div>`;
}

/**
 * Aplicar resultados OCR a los campos del formulario del padre
 */
export function applyOCRToWizardForm(result) {
  if (!result) return;

  // Banco
  if (result.bank) {
    const bankSelect = document.getElementById('paymentBank');
    if (bankSelect) {
      const options = Array.from(bankSelect.options);
      const match = options.find(opt =>
        opt.value.toLowerCase().includes(result.bank.toLowerCase()) ||
        result.bank.toLowerCase().includes(opt.value.toLowerCase())
      );
      if (match) {
        bankSelect.value = match.value;
        bankSelect.dispatchEvent(new Event('change'));
      }
    }
  }

  // Referencia
  if (result.reference) {
    const refInput = document.getElementById('paymentRefNumber');
    if (refInput) {
      refInput.value = result.reference;
      refInput.dispatchEvent(new Event('input'));
    }
  }

  // Monto (solo si el concepto no es mensualidad, porque mensualidad ya tiene precio fijo)
  if (result.amount && result.amount > 0) {
    const amountInput = document.getElementById('paymentAmount');
    if (amountInput && (!amountInput.value || parseFloat(amountInput.value) === 0)) {
      amountInput.value = result.amount.toFixed(2);
      amountInput.dispatchEvent(new Event('input'));
    }
  }

  // Fecha (guardar en data attribute para uso futuro)
  if (result.date) {
    document.getElementById('paymentForm')?.setAttribute('data-ocr-date', result.date);
  }
}

/**
 * Obtiene la fecha detectada por OCR del formulario.
 * @param {string} fallback - Fecha por defecto si no hay OCR
 * @returns {string} Fecha en formato YYYY-MM-DD
 */
export function getOCRDate(fallback = new Date().toISOString().split('T')[0]) {
  const formDate = document.getElementById('paymentForm')?.getAttribute('data-ocr-date');
  return formDate || fallback;
}

export default { processTransferReceipt, showOCRProgress, showOCRResults, applyOCRToWizardForm, getOCRDate };
