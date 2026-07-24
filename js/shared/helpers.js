/**
 * 🧰 Helpers PRO - Nivel Empresa
 */

export const Helpers = {

  /**
   * 🛡️ Escapar HTML
   */
  escapeHTML(str = '') {

    return String(str)

      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  },


  /**
   * 🔔 Toast moderno con microinteracciones
   */
  toast(msg, type = 'success', duration = 4000) {
    if (!msg) return;

    document.querySelectorAll('.app-toast').forEach(t => t.remove());

    const el = document.createElement('div');

    const _icons = { success: '✅', error: '⚠️', warning: '⚡', info: '💬', created: '🎉', deleted: '🗑', saved: '✓', published: '📢' };
    const _colors = {
      success: 'bg-emerald-500 text-white border-emerald-400',
      error: 'bg-rose-500 text-white border-rose-400',
      warning: 'bg-amber-500 text-white border-amber-400',
      info: 'bg-indigo-500 text-white border-indigo-400',
      created: 'bg-emerald-500 text-white border-emerald-400',
      deleted: 'bg-slate-700 text-white border-slate-600',
      saved: 'bg-emerald-500 text-white border-emerald-400',
      published: 'bg-indigo-500 text-white border-indigo-400'
    };

    el.className = `app-toast fixed bottom-6 left-1/2 -translate-x-1/2 z-[999] flex items-center gap-3 px-6 py-3.5 rounded-2xl shadow-2xl border text-sm font-bold transition-all duration-300 ${_colors[type] || _colors.success}`;
    el.innerHTML = `<span class="text-base">${_icons[type] || '✅'}</span> ${Helpers.escapeHTML(msg)}`;

    document.body.appendChild(el);

    setTimeout(() => {
      el.classList.add('opacity-0', 'translate-y-2');
      setTimeout(() => el.remove(), 300);
    }, duration);
  },


  /**
   * ❌ Error state con botón de reintentar
   * @param {string} msg — mensaje de error
   */
  errorState(msg) {
    return `
      <div class="flex flex-col items-center justify-center py-12 text-center">
        <div class="w-16 h-16 bg-rose-50 text-rose-500 rounded-3xl flex items-center justify-center mb-4">
          <i data-lucide="alert-circle" class="w-8 h-8"></i>
        </div>
        <h4 class="text-sm font-black text-slate-800 uppercase tracking-widest">${Helpers.escapeHTML(msg)}</h4>
        <button onclick="location.reload()" class="mt-4 px-6 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-xs uppercase transition-all">Reintentar</button>
      </div>
    `;
  },

  /**
   * 📳 Haptic Feedback (Vibración sutil para móvil)
   */
  vibrate(style = 'light') {
    if (!('vibrate' in navigator)) return;
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    
    try {
      const patterns = {
        light: 10,
        medium: 20,
        heavy: 40,
        success: [10, 40, 10],
        error: [60, 100, 60]
      };
      navigator.vibrate(patterns[style] || 10);
    } catch (e) {
      // Silenciar error de navegador por falta de interacción
    }
  },

  /**
   * 📅 Obtener fecha local en formato YYYY-MM-DD
   * Evita el error de cambio de día prematuro (UTC vs Local)
   */
  getYYYYMMDD(date = new Date()) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  /**
   * Plantilla premium de carnet estudiantil — Colegio Montessori Sonrisas Creativas
   * Frente + Reverso, compacto, sin espacios vacíos
   * @param {string} qrImg - data URL del QR
   * @param {string} name - nombre del estudiante
   * @param {string} matricula - matricula (se muestra con prefijo MSC-)
   * @param {object} opts - { classroom, nivel, p1_name, p2_name, year, logoUrl }
   */
  getQRPrintTemplate(qrImg, name, matricula, opts = {}) {
    const mat = (matricula || '').startsWith('MSC-') ? matricula : 'MSC-' + (matricula || '');
    const classroom = opts.classroom || '';
    const nivel     = opts.nivel     || '';
    const p1Name    = opts.p1_name   || '';
    const p2Name    = opts.p2_name   || '';
    const year      = opts.year      || new Date().getFullYear();
    const school    = 'Colegio Montessori Sonrisas Creativas';
    const logoUrl   = opts.logoUrl   || (window.location.origin + '/img/monte.jpg');
    const phone     = '+1 (809) 532-4903';
    const email     = 'montessorisonrisascreativas@gmail.com';
    const web       = 'montessorisonrisascreativas.com';
    const address   = 'F2VC+X76, Santo Domingo, Rep. Dominicana';

    return this._buildCarnetHTML(qrImg, name, mat, { classroom, nivel, p1Name, p2Name, year, school, logoUrl, phone, email, web, address });
  },

  /**
   * Construye el HTML completo del carnet (frente + reverso)
   */
  _buildCarnetHTML(qrImg, name, mat, d) {
    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Carnet ${mat}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Baloo+2:wght@400;600;700;800&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Nunito',sans-serif;background:#e8ecf1;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{width:210mm;height:297mm;margin:0 auto;padding:5mm;background:#e8ecf1;display:flex;flex-wrap:wrap;align-content:flex-start;justify-content:center;gap:0}

/* CARNET */
.carnet-pair{width:96mm;display:flex;flex-direction:column;align-items:center;margin:1.5mm auto;flex-shrink:0;gap:1.2mm}
.carnet{width:85.6mm;height:53.98mm;border-radius:3.5mm;overflow:hidden;position:relative;background:white;box-shadow:0 2px 10px rgba(0,0,0,.12),0 0 0 0.3pt #d1d9e6;flex-shrink:0}

/* MASCOT SHADOW */
.mascot{position:absolute;pointer-events:none;z-index:4;filter:drop-shadow(0 1px 2px rgba(0,0,0,.15))}

/* FRONT HEADER */
.f-top{display:flex;align-items:center;justify-content:space-between;padding:1.8mm 2.5mm 1.5mm;background:linear-gradient(135deg,#f0faf0 0%,#e8f5e9 50%,#E3F2FD 100%);border-bottom:0.35mm solid #2E7D32;position:relative;z-index:2}
.f-logo-w{display:flex;align-items:center;gap:1.5mm}
.f-logo{width:9mm;height:9mm;border-radius:2mm;overflow:hidden;border:0.3mm solid #2E7D32;box-shadow:0 1px 3px rgba(0,0,0,.15);flex-shrink:0;background:white}
.f-logo img{width:100%;height:100%;object-fit:cover}
.f-school{display:flex;flex-direction:column}
.f-school-n{font-family:'Baloo 2',cursive;font-size:4.8pt;font-weight:800;color:#0D2C54;line-height:1.1}
.f-school-s{font-family:'Baloo 2',cursive;font-size:3.2pt;font-weight:700;color:#2E7D32;line-height:1}
.f-year{font-family:'Baloo 2',cursive;font-size:4.5pt;font-weight:800;color:white;background:linear-gradient(135deg,#1565C0,#0D2C54);padding:0.8mm 2mm;border-radius:1.8mm;line-height:1;box-shadow:0 1px 3px rgba(21,101,192,.3)}

/* FRONT BODY */
.f-body{display:flex;height:calc(100% - 13mm);position:relative;z-index:1}

/* QR ZONE — bigger QR */
.f-qr{width:38%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:1.2mm 0.8mm;position:relative;background:linear-gradient(180deg,rgba(46,125,50,.03) 0%,rgba(255,255,255,0) 100%)}
.f-qr-box{width:25mm;height:25mm;background:white;border:0.5mm solid #2E7D32;border-radius:2.5mm;padding:1.5mm;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(46,125,50,.15);position:relative}
.f-qr-box img{width:100%;height:100%;display:block}
.f-qr-lbl{font-size:2.6pt;font-weight:800;color:#718096;text-transform:uppercase;letter-spacing:0.1pt;margin-top:1mm;text-align:center;line-height:1.3}
.f-qr-ico{font-size:2.8pt;color:#2E7D32;margin-top:0.2mm}

/* DIVIDER between QR and info */
.f-divider{width:0.3mm;background:linear-gradient(180deg,rgba(46,125,50,.0) 0%,rgba(46,125,50,.25) 30%,rgba(46,125,50,.25) 70%,rgba(46,125,50,.0) 100%);flex-shrink:0;margin:1.5mm 0}

/* INFO ZONE — compact, no white space */
.f-info{width:62%;display:flex;flex-direction:column;justify-content:center;padding:1mm 2.5mm 0.8mm 1.5mm;position:relative}
.f-name{font-family:'Baloo 2',cursive;font-size:6pt;font-weight:800;color:#0D2C54;line-height:1.12;margin-bottom:0.3mm;text-shadow:0 0.5px 0 rgba(0,0,0,.04)}
.f-mat{font-size:3.5pt;font-weight:800;color:#FB8C00;letter-spacing:0.08pt;margin-bottom:1mm;padding:0.3mm 1.2mm;background:#FFF3E0;border-radius:1mm;display:inline-block;width-fit}
.f-fields{display:flex;flex-direction:column;gap:0.5mm}
.f-field{display:flex;align-items:center;gap:0.8mm}
.f-fi{width:3mm;height:3mm;border-radius:0.8mm;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:2.5pt}
.f-fi.grn{background:#E8F5E9;color:#2E7D32}
.f-fi.blu{background:#E3F2FD;color:#1565C0}
.f-fi.org{background:#FFF3E0;color:#FB8C00}
.f-fi.ylw{background:#FFFDE7;color:#F57F17}
.f-ft{display:flex;flex-direction:column}
.f-fl{font-size:2.3pt;font-weight:800;color:#90A4AE;text-transform:uppercase;letter-spacing:0.1pt;line-height:1}
.f-fv{font-size:3.5pt;font-weight:700;color:#37474F;line-height:1.12}

/* FRONT BOTTOM */
.f-bot{position:absolute;bottom:0;left:0;right:0;background:linear-gradient(135deg,#0D2C54 0%,#1565C0 100%);padding:1.1mm 2.5mm;display:flex;align-items:center;justify-content:space-between;z-index:2}
.f-bot-l{display:flex;align-items:center;gap:1.2mm}
.f-shield{font-size:3pt;color:#FFC107}
.f-sec{font-size:2.6pt;font-weight:800;color:rgba(255,255,255,.9);letter-spacing:0.12pt;text-transform:uppercase}
.f-motto{font-size:2.4pt;font-weight:700;color:rgba(255,255,255,.6);font-style:italic}
.f-motto .heart{color:#FB8C00}

/* ===== BACK ===== */
.b-top{display:flex;align-items:center;justify-content:center;padding:2mm 3mm 1.5mm;background:linear-gradient(135deg,#f0faf0 0%,#e8f5e9 50%,#FFF3E0 100%);border-bottom:0.3mm solid #2E7D32;position:relative;z-index:2}
.b-logo{width:17mm;height:17mm;border-radius:3.5mm;overflow:hidden;border:0.4mm solid #2E7D32;box-shadow:0 2px 8px rgba(0,0,0,.12);background:white}
.b-logo img{width:100%;height:100%;object-fit:cover}
.b-title{font-family:'Baloo 2',cursive;font-size:5pt;font-weight:800;color:#0D2C54;text-align:center;margin-top:0.8mm;line-height:1.1}
.b-sub{font-size:3.2pt;font-weight:600;color:#718096;text-align:center;line-height:1.1;margin-top:0.3mm}

.b-body{padding:1.5mm 3.5mm;display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;position:relative;z-index:1}

.b-notice{font-size:3.2pt;font-weight:600;color:#546E7A;text-align:center;line-height:1.4;padding:1.2mm 2mm;background:#F5F5F5;border-radius:1.5mm;border-left:0.4mm solid #FB8C00;margin-bottom:1mm}

.b-contact{display:flex;flex-wrap:wrap;justify-content:center;gap:0.8mm 2.5mm;margin-bottom:1mm}
.b-ci{display:flex;align-items:center;gap:0.6mm;font-size:3pt;font-weight:600;color:#455A64}
.b-cicon{font-size:3pt}

/* BACK BOTTOM */
.b-bot{position:absolute;bottom:0;left:0;right:0;background:linear-gradient(135deg,#0D2C54 0%,#1565C0 100%);padding:1mm 2.5mm;display:flex;align-items:center;justify-content:center;z-index:2;gap:1.2mm;flex-wrap:wrap}
.b-val{font-size:2.4pt;font-weight:800;color:rgba(255,255,255,.85);letter-spacing:0.1pt;text-transform:uppercase}
.b-vdot{font-size:1.8pt;color:#FFC107}

/* WATERMARKS */
.wm{position:absolute;pointer-events:none}
.wm-c{border-radius:50%;border:0.25mm solid;opacity:.06}
.wm-t{opacity:.035;pointer-events:none}
.wm-l{opacity:.045;pointer-events:none;font-size:2.5mm;color:#2E7D32}
.wm-s{opacity:.055;pointer-events:none;font-size:2.2mm;color:#FFC107}
.wm-d{border-radius:50%;opacity:.05}

@media print{
  body{background:white;margin:0;padding:0}
  .page{padding:3mm;background:white;gap:0}
  .carnet{box-shadow:none;page-break-inside:avoid}
  .carnet-pair{page-break-inside:avoid}
  @page{size:A4 portrait;margin:4mm}
}
</style>
</head>
<body>
<div class="page">
<div class="carnet-pair">

  <!-- ====== FRENTE ====== -->
  <div class="carnet">
    <!-- Watermarks -->
    <svg class="wm wm-t" style="top:10mm;right:2mm;width:7mm;height:9mm" viewBox="0 0 100 120"><path d="M50 5 L85 45 L70 45 L90 80 L65 80 L75 110 L25 110 L35 80 L10 80 L30 45 L15 45 Z" fill="#2E7D32"/></svg>
    <div class="wm wm-c" style="width:6mm;height:6mm;top:15mm;left:50mm;border-color:#FB8C00"></div>
    <div class="wm wm-c" style="width:5mm;height:5mm;bottom:12mm;left:45mm;border-color:#1565C0"></div>
    <span class="wm wm-s" style="top:18mm;left:3mm">&#9733;</span>
    <span class="wm wm-s" style="bottom:15mm;right:4mm;font-size:1.8mm">&#9733;</span>
    <span class="wm wm-l" style="top:20mm;right:6mm">&#127811;</span>
    <span class="wm wm-l" style="bottom:18mm;left:52mm;font-size:1.8mm">&#127811;</span>
    <div class="wm wm-d" style="width:2.5mm;height:2.5mm;top:22mm;left:60mm;background:#FFC107"></div>
    <div class="wm wm-d" style="width:2mm;height:2mm;bottom:20mm;left:38mm;background:#2E7D32"></div>

    <!-- HEADER -->
    <div class="f-top">
      <div class="f-logo-w">
        <div class="f-logo"><img src="${d.logoUrl}" alt="Logo"></div>
        <div class="f-school">
          <div class="f-school-n">Colegio Montessori</div>
          <div class="f-school-s">Sonrisas Creativas</div>
        </div>
      </div>
      <div class="f-year">${d.year}-${(d.year+1).toString().slice(-2)}</div>
    </div>

    <!-- Sun mascot peeking from header -->
    <svg class="mascot" style="top:0.5mm;left:42mm;width:7mm;height:7mm" viewBox="0 0 100 100">
      <circle cx="50" cy="55" r="28" fill="#FFC107"/>
      <circle cx="50" cy="55" r="22" fill="#FFD54F"/>
      <circle cx="42" cy="50" r="4" fill="white"/><circle cx="58" cy="50" r="4" fill="white"/>
      <circle cx="43" cy="51" r="2" fill="#0D2C54"/><circle cx="59" cy="51" r="2" fill="#0D2C54"/>
      <path d="M 40 60 Q 50 67 60 60" stroke="#0D2C54" stroke-width="2" fill="none" stroke-linecap="round"/>
      <circle cx="36" cy="58" r="1.8" fill="#FFAB91" opacity=".5"/>
      <circle cx="64" cy="58" r="1.8" fill="#FFAB91" opacity=".5"/>
      <line x1="50" y1="20" x2="50" y2="12" stroke="#FFC107" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="24" y1="32" x2="18" y2="27" stroke="#FFC107" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="76" y1="32" x2="82" y2="27" stroke="#FFC107" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="16" y1="55" x2="8" y2="55" stroke="#FFC107" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="84" y1="55" x2="92" y2="55" stroke="#FFC107" stroke-width="2.5" stroke-linecap="round"/>
    </svg>

    <!-- BODY -->
    <div class="f-body">
      <!-- QR ZONE -->
      <div class="f-qr">
        <div class="f-qr-box">
          ${qrImg ? `<img src="${qrImg}" alt="QR">` : '<span style="font-size:6pt;color:#94a3b8">QR</span>'}
        </div>
        <div class="f-qr-ico">&#128270;</div>
        <div class="f-qr-lbl">Escanear para</div>
        <div class="f-qr-lbl">Entrada / Salida</div>

        <!-- Triangle leaning on QR bottom -->
        <svg class="mascot" style="bottom:-2mm;left:-1mm;width:7mm;height:7.5mm" viewBox="0 0 100 100">
          <polygon points="50,10 88,85 12,85" fill="#FB8C00" stroke="#E65100" stroke-width="3"/>
          <circle cx="38" cy="52" r="5" fill="white"/><circle cx="62" cy="52" r="5" fill="white"/>
          <circle cx="39" cy="53" r="2.5" fill="#0D2C54"/><circle cx="63" cy="53" r="2.5" fill="#0D2C54"/>
          <path d="M 36 64 Q 50 74 64 64" stroke="#0D2C54" stroke-width="2.5" fill="none" stroke-linecap="round"/>
          <circle cx="32" cy="62" r="1.8" fill="#FFAB91" opacity=".5"/>
          <circle cx="68" cy="62" r="1.8" fill="#FFAB91" opacity=".5"/>
        </svg>
      </div>

      <!-- DIVIDER -->
      <div class="f-divider"></div>

      <!-- INFO ZONE -->
      <div class="f-info">
        <div class="f-name">${Helpers.escapeHTML((name || 'Estudiante').substring(0, 30))}</div>
        <div class="f-mat">${mat}</div>
        <div class="f-fields">
          ${d.nivel ? `<div class="f-field"><div class="f-fi grn">&#127891;</div><div class="f-ft"><span class="f-fl">Nivel</span><span class="f-fv">${Helpers.escapeHTML(d.nivel)}</span></div></div>` : ''}
          ${d.classroom ? `<div class="f-field"><div class="f-fi blu">&#127979;</div><div class="f-ft"><span class="f-fl">Aula</span><span class="f-fv">${Helpers.escapeHTML(d.classroom)}</span></div></div>` : ''}
          ${d.p1Name ? `<div class="f-field"><div class="f-fi org">&#128104;</div><div class="f-ft"><span class="f-fl">Padre</span><span class="f-fv">${Helpers.escapeHTML(d.p1Name.substring(0, 24))}</span></div></div>` : ''}
          ${d.p2Name ? `<div class="f-field"><div class="f-fi ylw">&#128105;</div><div class="f-ft"><span class="f-fl">Madre</span><span class="f-fv">${Helpers.escapeHTML(d.p2Name.substring(0, 24))}</span></div></div>` : ''}
          <div class="f-field"><div class="f-fi grn">&#128218;</div><div class="f-ft"><span class="f-fl">Curso</span><span class="f-fv">${d.year}-${(d.year+1).toString().slice(-2)}</span></div></div>
        </div>
      </div>
    </div>

    <!-- BOTTOM -->
    <div class="f-bot">
      <div class="f-bot-l">
        <span class="f-shield">&#128737;</span>
        <span class="f-sec">SEGURIDAD &bull; CONTROL DE ACCESO</span>
      </div>
      <span class="f-motto">Educamos con amor <span class="heart">&#10084;</span></span>
    </div>
  </div>

  <!-- ====== REVERSO ====== -->
  <div class="carnet">
    <!-- Decorative clouds -->
    <svg class="wm" style="top:3mm;left:2mm;width:8mm;height:5mm;opacity:.06;z-index:1" viewBox="0 0 100 60"><ellipse cx="50" cy="35" rx="35" ry="18" fill="#90CAF9"/><ellipse cx="30" cy="30" rx="20" ry="14" fill="#90CAF9"/><ellipse cx="70" cy="30" rx="20" ry="14" fill="#90CAF9"/></svg>
    <svg class="wm" style="top:2mm;right:5mm;width:6mm;height:4mm;opacity:.05;z-index:1" viewBox="0 0 100 60"><ellipse cx="50" cy="35" rx="35" ry="18" fill="#90CAF9"/><ellipse cx="30" cy="30" rx="20" ry="14" fill="#90CAF9"/></svg>
    <svg class="wm wm-t" style="bottom:10mm;left:3mm;width:7mm;height:9mm" viewBox="0 0 100 120"><path d="M50 5 L85 45 L70 45 L90 80 L65 80 L75 110 L25 110 L35 80 L10 80 L30 45 L15 45 Z" fill="#2E7D32"/></svg>
    <svg class="wm wm-t" style="bottom:12mm;right:4mm;width:5mm;height:7mm;opacity:.03" viewBox="0 0 100 120"><path d="M50 5 L85 45 L70 45 L90 80 L65 80 L75 110 L25 110 L35 80 L10 80 L30 45 L15 45 Z" fill="#FB8C00"/></svg>
    <div class="wm wm-c" style="width:8mm;height:8mm;bottom:10mm;right:3mm;border-color:#2E7D32"></div>
    <span class="wm wm-s" style="top:20mm;right:5mm;font-size:2mm">&#9733;</span>
    <span class="wm wm-s" style="top:8mm;left:60mm;font-size:1.5mm">&#9733;</span>
    <span class="wm wm-s" style="bottom:14mm;left:5mm;font-size:1.8mm">&#9733;</span>
    <span class="wm wm-l" style="top:22mm;left:4mm">&#127811;</span>
    <span class="wm wm-l" style="bottom:16mm;right:8mm;font-size:1.5mm">&#127811;</span>
    <div class="wm wm-d" style="width:2mm;height:2mm;top:16mm;left:70mm;background:#FFC107"></div>
    <div class="wm wm-d" style="width:1.5mm;height:1.5mm;bottom:18mm;left:50mm;background:#FB8C00"></div>

    <!-- Sun mascot top-left -->
    <svg class="mascot" style="top:1mm;left:1mm;width:6mm;height:6mm;opacity:.75" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="26" fill="#FFC107"/>
      <circle cx="50" cy="50" r="20" fill="#FFD54F"/>
      <circle cx="43" cy="46" r="3.2" fill="white"/><circle cx="57" cy="46" r="3.2" fill="white"/>
      <circle cx="44" cy="47" r="1.6" fill="#0D2C54"/><circle cx="58" cy="47" r="1.6" fill="#0D2C54"/>
      <path d="M 42 54 Q 50 60 58 54" stroke="#0D2C54" stroke-width="1.8" fill="none" stroke-linecap="round"/>
      <line x1="50" y1="18" x2="50" y2="11" stroke="#FFC107" stroke-width="2" stroke-linecap="round"/>
      <line x1="26" y1="30" x2="20" y2="25" stroke="#FFC107" stroke-width="2" stroke-linecap="round"/>
      <line x1="74" y1="30" x2="80" y2="25" stroke="#FFC107" stroke-width="2" stroke-linecap="round"/>
    </svg>

    <!-- Pentagon waving from bottom-right -->
    <svg class="mascot" style="bottom:3mm;right:1mm;width:8mm;height:8mm" viewBox="0 0 100 100">
      <polygon points="50,8 93,38 76,88 24,88 7,38" fill="#2E7D32" stroke="#1B5E20" stroke-width="2.5"/>
      <circle cx="38" cy="40" r="4.5" fill="white"/><circle cx="62" cy="40" r="4.5" fill="white"/>
      <circle cx="39" cy="41" r="2.2" fill="#0D2C54"/><circle cx="63" cy="41" r="2.2" fill="#0D2C54"/>
      <path d="M 36 54 Q 50 63 64 54" stroke="#0D2C54" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <circle cx="33" cy="52" r="1.8" fill="#A5D6A7" opacity=".5"/>
      <circle cx="67" cy="52" r="1.8" fill="#A5D6A7" opacity=".5"/>
      <!-- waving hand -->
      <line x1="88" y1="35" x2="95" y2="28" stroke="#1B5E20" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="95" cy="26" r="2.5" fill="#2E7D32"/>
    </svg>

    <!-- Triangle bottom-left -->
    <svg class="mascot" style="bottom:4mm;left:1.5mm;width:6mm;height:6.5mm;opacity:.65" viewBox="0 0 100 100">
      <polygon points="50,12 85,82 15,82" fill="#FB8C00" stroke="#E65100" stroke-width="2.5"/>
      <circle cx="40" cy="48" r="3.5" fill="white"/><circle cx="60" cy="48" r="3.5" fill="white"/>
      <circle cx="41" cy="49" r="1.8" fill="#0D2C54"/><circle cx="61" cy="49" r="1.8" fill="#0D2C54"/>
      <path d="M 38 60 Q 50 68 62 60" stroke="#0D2C54" stroke-width="2" fill="none" stroke-linecap="round"/>
    </svg>

    <!-- TOP -->
    <div class="b-top">
      <div style="text-align:center">
        <div class="b-logo"><img src="${d.logoUrl}" alt="Logo"></div>
        <div class="b-title">Colegio Montessori</div>
        <div class="b-sub">Sonrisas Creativas</div>
      </div>
    </div>

    <!-- BODY -->
    <div class="b-body">
      <div class="b-notice">
        &#128274; Este carnet es propiedad del ${d.school}.<br>
        En caso de p&eacute;rdida favor devolver a la instituci&oacute;n.
      </div>
      <div class="b-contact">
        <div class="b-ci"><span class="b-cicon">&#9742;</span> ${d.phone}</div>
        <div class="b-ci"><span class="b-cicon">&#9993;</span> ${d.email}</div>
        <div class="b-ci"><span class="b-cicon">&#127760;</span> ${d.web}</div>
        <div class="b-ci"><span class="b-cicon">&#128205;</span> ${d.address}</div>
      </div>
    </div>

    <!-- BOTTOM -->
    <div class="b-bot">
      <span class="b-val">RESPETO</span><span class="b-vdot">&bull;</span>
      <span class="b-val">AMOR</span><span class="b-vdot">&bull;</span>
      <span class="b-val">CREATIVIDAD</span><span class="b-vdot">&bull;</span>
      <span class="b-val">DISCIPLINA</span><span class="b-vdot">&bull;</span>
      <span class="b-val">INDEPENDENCIA</span><span class="b-vdot">&bull;</span>
      <span class="b-val">EMPAT&#205;A</span><span class="b-vdot">&bull;</span>
      <span class="b-val">SOLIDARIDAD</span>
    </div>
  </div>

</div>
</div>
<script>window.onload=()=>{setTimeout(()=>{window.print();setTimeout(()=>window.close(),600)},600)}</script>
</body>
</html>`;
  },

  /**
   * Imprime todos los carnets — Premium Montessori, frente+reverso, 6/página A4
   * @param {Array} students - [{name, matricula, classroom, nivel, p1_name, p2_name}]
   */
  async printAllCarnets(students = []) {
    if (!students.length) { this.toast('Sin estudiantes para imprimir', 'warning'); return; }

    await new Promise(resolve => {
      if (window.QRCode) { resolve(); return; }
      const s = document.createElement('script');
      s.src = 'js/shared/qrcode.min.js';
      s.onload = resolve;
      document.head.appendChild(s);
    });

    const qrImages = await Promise.all(students.map(st => new Promise(res => {
      const tmp = document.createElement('div');
      tmp.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:200px;height:200px';
      document.body.appendChild(tmp);
      const mat = (st.matricula || '').startsWith('MSC-') ? st.matricula : 'MSC-' + (st.matricula || '');
      try {
        new window.QRCode(tmp, { text: mat, width: 200, height: 200, colorDark:'#1e293b', colorLight:'#ffffff', correctLevel: window.QRCode.CorrectLevel.H });
        setTimeout(() => {
          const img = tmp.querySelector('img')?.src || tmp.querySelector('canvas')?.toDataURL() || '';
          document.body.removeChild(tmp);
          res({ ...st, qrImg: img, mat });
        }, 250);
      } catch (_) { document.body.removeChild(tmp); res({ ...st, qrImg: '', mat }); }
    })));

    const year = new Date().getFullYear();
    const school = 'Colegio Montessori Sonrisas Creativas';
    const logoUrl = window.location.origin + '/img/monte.jpg';
    const phone   = '+1 (809) 532-4903';
    const email   = 'montessorisonrisascreativas@gmail.com';
    const web     = 'montessorisonrisascreativas.com';
    const address = 'F2VC+X76, Santo Domingo, Rep. Dominicana';

    const cardsHTML = qrImages.map(st => {
      const d = { classroom: st.classroom||'', nivel: st.nivel||'', p1Name: st.p1_name||'', p2Name: st.p2_name||'', year, school, logoUrl, phone, email, web, address };
      return `
    <div class="carnet-pair">
      <!-- FRENTE -->
      <div class="carnet">
        <svg class="wm wm-t" style="top:10mm;right:2mm;width:7mm;height:9mm" viewBox="0 0 100 120"><path d="M50 5 L85 45 L70 45 L90 80 L65 80 L75 110 L25 110 L35 80 L10 80 L30 45 L15 45 Z" fill="#2E7D32"/></svg>
        <div class="wm wm-c" style="width:6mm;height:6mm;top:15mm;left:50mm;border-color:#FB8C00"></div>
        <div class="wm wm-c" style="width:5mm;height:5mm;bottom:12mm;left:45mm;border-color:#1565C0"></div>
        <span class="wm wm-s" style="top:18mm;left:3mm">&#9733;</span>
        <span class="wm wm-s" style="bottom:15mm;right:4mm;font-size:1.8mm">&#9733;</span>
        <span class="wm wm-l" style="top:20mm;right:6mm">&#127811;</span>
        <span class="wm wm-l" style="bottom:18mm;left:52mm;font-size:1.8mm">&#127811;</span>
        <div class="wm wm-d" style="width:2.5mm;height:2.5mm;top:22mm;left:60mm;background:#FFC107"></div>
        <div class="wm wm-d" style="width:2mm;height:2mm;bottom:20mm;left:38mm;background:#2E7D32"></div>

        <div class="f-top">
          <div class="f-logo-w">
            <div class="f-logo"><img src="${logoUrl}" alt="Logo"></div>
            <div class="f-school">
              <div class="f-school-n">Colegio Montessori</div>
              <div class="f-school-s">Sonrisas Creativas</div>
            </div>
          </div>
          <div class="f-year">${year}-${(year+1).toString().slice(-2)}</div>
        </div>

        <svg class="mascot" style="top:0.5mm;left:42mm;width:7mm;height:7mm" viewBox="0 0 100 100">
          <circle cx="50" cy="55" r="28" fill="#FFC107"/><circle cx="50" cy="55" r="22" fill="#FFD54F"/>
          <circle cx="42" cy="50" r="4" fill="white"/><circle cx="58" cy="50" r="4" fill="white"/>
          <circle cx="43" cy="51" r="2" fill="#0D2C54"/><circle cx="59" cy="51" r="2" fill="#0D2C54"/>
          <path d="M 40 60 Q 50 67 60 60" stroke="#0D2C54" stroke-width="2" fill="none" stroke-linecap="round"/>
          <circle cx="36" cy="58" r="1.8" fill="#FFAB91" opacity=".5"/><circle cx="64" cy="58" r="1.8" fill="#FFAB91" opacity=".5"/>
          <line x1="50" y1="20" x2="50" y2="12" stroke="#FFC107" stroke-width="2.5" stroke-linecap="round"/>
          <line x1="24" y1="32" x2="18" y2="27" stroke="#FFC107" stroke-width="2.5" stroke-linecap="round"/>
          <line x1="76" y1="32" x2="82" y2="27" stroke="#FFC107" stroke-width="2.5" stroke-linecap="round"/>
          <line x1="16" y1="55" x2="8" y2="55" stroke="#FFC107" stroke-width="2.5" stroke-linecap="round"/>
          <line x1="84" y1="55" x2="92" y2="55" stroke="#FFC107" stroke-width="2.5" stroke-linecap="round"/>
        </svg>

        <div class="f-body">
          <div class="f-qr">
            <div class="f-qr-box">
              ${st.qrImg ? `<img src="${st.qrImg}" alt="QR">` : '<span style="font-size:6pt;color:#94a3b8">QR</span>'}
            </div>
            <div class="f-qr-ico">&#128270;</div>
            <div class="f-qr-lbl">Escanear para</div>
            <div class="f-qr-lbl">Entrada / Salida</div>
            <svg class="mascot" style="bottom:-2mm;left:-1mm;width:7mm;height:7.5mm" viewBox="0 0 100 100">
              <polygon points="50,10 88,85 12,85" fill="#FB8C00" stroke="#E65100" stroke-width="3"/>
              <circle cx="38" cy="52" r="5" fill="white"/><circle cx="62" cy="52" r="5" fill="white"/>
              <circle cx="39" cy="53" r="2.5" fill="#0D2C54"/><circle cx="63" cy="53" r="2.5" fill="#0D2C54"/>
              <path d="M 36 64 Q 50 74 64 64" stroke="#0D2C54" stroke-width="2.5" fill="none" stroke-linecap="round"/>
              <circle cx="32" cy="62" r="1.8" fill="#FFAB91" opacity=".5"/><circle cx="68" cy="62" r="1.8" fill="#FFAB91" opacity=".5"/>
            </svg>
          </div>
          <div class="f-divider"></div>
          <div class="f-info">
            <div class="f-name">${Helpers.escapeHTML((st.name||'Estudiante').substring(0, 30))}</div>
            <div class="f-mat">${st.mat}</div>
            <div class="f-fields">
              ${d.nivel ? `<div class="f-field"><div class="f-fi grn">&#127891;</div><div class="f-ft"><span class="f-fl">Nivel</span><span class="f-fv">${Helpers.escapeHTML(d.nivel)}</span></div></div>` : ''}
              ${d.classroom ? `<div class="f-field"><div class="f-fi blu">&#127979;</div><div class="f-ft"><span class="f-fl">Aula</span><span class="f-fv">${Helpers.escapeHTML(d.classroom)}</span></div></div>` : ''}
              ${d.p1Name ? `<div class="f-field"><div class="f-fi org">&#128104;</div><div class="f-ft"><span class="f-fl">Padre</span><span class="f-fv">${Helpers.escapeHTML(d.p1Name.substring(0, 24))}</span></div></div>` : ''}
              ${d.p2Name ? `<div class="f-field"><div class="f-fi ylw">&#128105;</div><div class="f-ft"><span class="f-fl">Madre</span><span class="f-fv">${Helpers.escapeHTML(d.p2Name.substring(0, 24))}</span></div></div>` : ''}
              <div class="f-field"><div class="f-fi grn">&#128218;</div><div class="f-ft"><span class="f-fl">Curso</span><span class="f-fv">${year}-${(year+1).toString().slice(-2)}</span></div></div>
            </div>
          </div>
        </div>

        <div class="f-bot">
          <div class="f-bot-l"><span class="f-shield">&#128737;</span><span class="f-sec">SEGURIDAD &bull; CONTROL DE ACCESO</span></div>
          <span class="f-motto">Educamos con amor <span class="heart">&#10084;</span></span>
        </div>
      </div>

      <!-- REVERSO -->
      <div class="carnet">
        <svg class="wm" style="top:3mm;left:2mm;width:8mm;height:5mm;opacity:.06;z-index:1" viewBox="0 0 100 60"><ellipse cx="50" cy="35" rx="35" ry="18" fill="#90CAF9"/><ellipse cx="30" cy="30" rx="20" ry="14" fill="#90CAF9"/><ellipse cx="70" cy="30" rx="20" ry="14" fill="#90CAF9"/></svg>
        <svg class="wm" style="top:2mm;right:5mm;width:6mm;height:4mm;opacity:.05;z-index:1" viewBox="0 0 100 60"><ellipse cx="50" cy="35" rx="35" ry="18" fill="#90CAF9"/><ellipse cx="30" cy="30" rx="20" ry="14" fill="#90CAF9"/></svg>
        <svg class="wm wm-t" style="bottom:10mm;left:3mm;width:7mm;height:9mm" viewBox="0 0 100 120"><path d="M50 5 L85 45 L70 45 L90 80 L65 80 L75 110 L25 110 L35 80 L10 80 L30 45 L15 45 Z" fill="#2E7D32"/></svg>
        <svg class="wm wm-t" style="bottom:12mm;right:4mm;width:5mm;height:7mm;opacity:.03" viewBox="0 0 100 120"><path d="M50 5 L85 45 L70 45 L90 80 L65 80 L75 110 L25 110 L35 80 L10 80 L30 45 L15 45 Z" fill="#FB8C00"/></svg>
        <div class="wm wm-c" style="width:8mm;height:8mm;bottom:10mm;right:3mm;border-color:#2E7D32"></div>
        <span class="wm wm-s" style="top:20mm;right:5mm;font-size:2mm">&#9733;</span>
        <span class="wm wm-s" style="top:8mm;left:60mm;font-size:1.5mm">&#9733;</span>
        <span class="wm wm-s" style="bottom:14mm;left:5mm;font-size:1.8mm">&#9733;</span>
        <span class="wm wm-l" style="top:22mm;left:4mm">&#127811;</span>
        <span class="wm wm-l" style="bottom:16mm;right:8mm;font-size:1.5mm">&#127811;</span>
        <div class="wm wm-d" style="width:2mm;height:2mm;top:16mm;left:70mm;background:#FFC107"></div>
        <div class="wm wm-d" style="width:1.5mm;height:1.5mm;bottom:18mm;left:50mm;background:#FB8C00"></div>

        <svg class="mascot" style="top:1mm;left:1mm;width:6mm;height:6mm;opacity:.75" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="26" fill="#FFC107"/><circle cx="50" cy="50" r="20" fill="#FFD54F"/>
          <circle cx="43" cy="46" r="3.2" fill="white"/><circle cx="57" cy="46" r="3.2" fill="white"/>
          <circle cx="44" cy="47" r="1.6" fill="#0D2C54"/><circle cx="58" cy="47" r="1.6" fill="#0D2C54"/>
          <path d="M 42 54 Q 50 60 58 54" stroke="#0D2C54" stroke-width="1.8" fill="none" stroke-linecap="round"/>
          <line x1="50" y1="18" x2="50" y2="11" stroke="#FFC107" stroke-width="2" stroke-linecap="round"/>
          <line x1="26" y1="30" x2="20" y2="25" stroke="#FFC107" stroke-width="2" stroke-linecap="round"/>
          <line x1="74" y1="30" x2="80" y2="25" stroke="#FFC107" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <svg class="mascot" style="bottom:3mm;right:1mm;width:8mm;height:8mm" viewBox="0 0 100 100">
          <polygon points="50,8 93,38 76,88 24,88 7,38" fill="#2E7D32" stroke="#1B5E20" stroke-width="2.5"/>
          <circle cx="38" cy="40" r="4.5" fill="white"/><circle cx="62" cy="40" r="4.5" fill="white"/>
          <circle cx="39" cy="41" r="2.2" fill="#0D2C54"/><circle cx="63" cy="41" r="2.2" fill="#0D2C54"/>
          <path d="M 36 54 Q 50 63 64 54" stroke="#0D2C54" stroke-width="2.5" fill="none" stroke-linecap="round"/>
          <circle cx="33" cy="52" r="1.8" fill="#A5D6A7" opacity=".5"/><circle cx="67" cy="52" r="1.8" fill="#A5D6A7" opacity=".5"/>
          <line x1="88" y1="35" x2="95" y2="28" stroke="#1B5E20" stroke-width="2.5" stroke-linecap="round"/><circle cx="95" cy="26" r="2.5" fill="#2E7D32"/>
        </svg>
        <svg class="mascot" style="bottom:4mm;left:1.5mm;width:6mm;height:6.5mm;opacity:.65" viewBox="0 0 100 100">
          <polygon points="50,12 85,82 15,82" fill="#FB8C00" stroke="#E65100" stroke-width="2.5"/>
          <circle cx="40" cy="48" r="3.5" fill="white"/><circle cx="60" cy="48" r="3.5" fill="white"/>
          <circle cx="41" cy="49" r="1.8" fill="#0D2C54"/><circle cx="61" cy="49" r="1.8" fill="#0D2C54"/>
          <path d="M 38 60 Q 50 68 62 60" stroke="#0D2C54" stroke-width="2" fill="none" stroke-linecap="round"/>
        </svg>

        <div class="b-top">
          <div style="text-align:center">
            <div class="b-logo"><img src="${logoUrl}" alt="Logo"></div>
            <div class="b-title">Colegio Montessori</div>
            <div class="b-sub">Sonrisas Creativas</div>
          </div>
        </div>
        <div class="b-body">
          <div class="b-notice">&#128274; Este carnet es propiedad del ${school}.<br>En caso de p&eacute;rdida favor devolver a la instituci&oacute;n.</div>
          <div class="b-contact">
            <div class="b-ci"><span class="b-cicon">&#9742;</span> ${phone}</div>
            <div class="b-ci"><span class="b-cicon">&#9993;</span> ${email}</div>
            <div class="b-ci"><span class="b-cicon">&#127760;</span> ${web}</div>
            <div class="b-ci"><span class="b-cicon">&#128205;</span> ${address}</div>
          </div>
        </div>
        <div class="b-bot">
          <span class="b-val">RESPETO</span><span class="b-vdot">&bull;</span>
          <span class="b-val">AMOR</span><span class="b-vdot">&bull;</span>
          <span class="b-val">CREATIVIDAD</span><span class="b-vdot">&bull;</span>
          <span class="b-val">DISCIPLINA</span><span class="b-vdot">&bull;</span>
          <span class="b-val">INDEPENDENCIA</span><span class="b-vdot">&bull;</span>
          <span class="b-val">EMPAT&#205;A</span><span class="b-vdot">&bull;</span>
          <span class="b-val">SOLIDARIDAD</span>
        </div>
      </div>
    </div>`;
    }).join('\n');

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Carnets Estudiantes</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Baloo+2:wght@400;600;700;800&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Nunito',sans-serif;background:#e8ecf1;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{width:210mm;height:297mm;margin:0 auto;padding:5mm;background:#e8ecf1;display:flex;flex-wrap:wrap;align-content:flex-start;justify-content:center;gap:0}
.carnet-pair{width:96mm;display:flex;flex-direction:column;align-items:center;margin:1.5mm auto;flex-shrink:0;gap:1.2mm}
.carnet{width:85.6mm;height:53.98mm;border-radius:3.5mm;overflow:hidden;position:relative;background:white;box-shadow:0 2px 10px rgba(0,0,0,.12),0 0 0 0.3pt #d1d9e6;flex-shrink:0}
.mascot{position:absolute;pointer-events:none;z-index:4;filter:drop-shadow(0 1px 2px rgba(0,0,0,.15))}
.f-top{display:flex;align-items:center;justify-content:space-between;padding:1.8mm 2.5mm 1.5mm;background:linear-gradient(135deg,#f0faf0 0%,#e8f5e9 50%,#E3F2FD 100%);border-bottom:0.35mm solid #2E7D32;position:relative;z-index:2}
.f-logo-w{display:flex;align-items:center;gap:1.5mm}
.f-logo{width:9mm;height:9mm;border-radius:2mm;overflow:hidden;border:0.3mm solid #2E7D32;box-shadow:0 1px 3px rgba(0,0,0,.15);flex-shrink:0;background:white}
.f-logo img{width:100%;height:100%;object-fit:cover}
.f-school{display:flex;flex-direction:column}
.f-school-n{font-family:'Baloo 2',cursive;font-size:4.8pt;font-weight:800;color:#0D2C54;line-height:1.1}
.f-school-s{font-family:'Baloo 2',cursive;font-size:3.2pt;font-weight:700;color:#2E7D32;line-height:1}
.f-year{font-family:'Baloo 2',cursive;font-size:4.5pt;font-weight:800;color:white;background:linear-gradient(135deg,#1565C0,#0D2C54);padding:0.8mm 2mm;border-radius:1.8mm;line-height:1;box-shadow:0 1px 3px rgba(21,101,192,.3)}
.f-body{display:flex;height:calc(100% - 13mm);position:relative;z-index:1}
.f-qr{width:38%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:1.2mm 0.8mm;position:relative;background:linear-gradient(180deg,rgba(46,125,50,.03) 0%,rgba(255,255,255,0) 100%)}
.f-qr-box{width:25mm;height:25mm;background:white;border:0.5mm solid #2E7D32;border-radius:2.5mm;padding:1.5mm;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(46,125,50,.15);position:relative}
.f-qr-box img{width:100%;height:100%;display:block}
.f-qr-lbl{font-size:2.6pt;font-weight:800;color:#718096;text-transform:uppercase;letter-spacing:0.1pt;margin-top:1mm;text-align:center;line-height:1.3}
.f-qr-ico{font-size:2.8pt;color:#2E7D32;margin-top:0.2mm}
.f-divider{width:0.3mm;background:linear-gradient(180deg,rgba(46,125,50,.0) 0%,rgba(46,125,50,.25) 30%,rgba(46,125,50,.25) 70%,rgba(46,125,50,.0) 100%);flex-shrink:0;margin:1.5mm 0}
.f-info{width:62%;display:flex;flex-direction:column;justify-content:center;padding:1mm 2.5mm 0.8mm 1.5mm;position:relative}
.f-name{font-family:'Baloo 2',cursive;font-size:6pt;font-weight:800;color:#0D2C54;line-height:1.12;margin-bottom:0.3mm;text-shadow:0 0.5px 0 rgba(0,0,0,.04)}
.f-mat{font-size:3.5pt;font-weight:800;color:#FB8C00;letter-spacing:0.08pt;margin-bottom:1mm;padding:0.3mm 1.2mm;background:#FFF3E0;border-radius:1mm;display:inline-block;width-fit}
.f-fields{display:flex;flex-direction:column;gap:0.5mm}
.f-field{display:flex;align-items:center;gap:0.8mm}
.f-fi{width:3mm;height:3mm;border-radius:0.8mm;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:2.5pt}
.f-fi.grn{background:#E8F5E9;color:#2E7D32}.f-fi.blu{background:#E3F2FD;color:#1565C0}.f-fi.org{background:#FFF3E0;color:#FB8C00}.f-fi.ylw{background:#FFFDE7;color:#F57F17}
.f-ft{display:flex;flex-direction:column}
.f-fl{font-size:2.3pt;font-weight:800;color:#90A4AE;text-transform:uppercase;letter-spacing:0.1pt;line-height:1}
.f-fv{font-size:3.5pt;font-weight:700;color:#37474F;line-height:1.12}
.f-bot{position:absolute;bottom:0;left:0;right:0;background:linear-gradient(135deg,#0D2C54 0%,#1565C0 100%);padding:1.1mm 2.5mm;display:flex;align-items:center;justify-content:space-between;z-index:2}
.f-bot-l{display:flex;align-items:center;gap:1.2mm}
.f-shield{font-size:3pt;color:#FFC107}
.f-sec{font-size:2.6pt;font-weight:800;color:rgba(255,255,255,.9);letter-spacing:0.12pt;text-transform:uppercase}
.f-motto{font-size:2.4pt;font-weight:700;color:rgba(255,255,255,.6);font-style:italic}
.f-motto .heart{color:#FB8C00}
.b-top{display:flex;align-items:center;justify-content:center;padding:2mm 3mm 1.5mm;background:linear-gradient(135deg,#f0faf0 0%,#e8f5e9 50%,#FFF3E0 100%);border-bottom:0.3mm solid #2E7D32;position:relative;z-index:2}
.b-logo{width:17mm;height:17mm;border-radius:3.5mm;overflow:hidden;border:0.4mm solid #2E7D32;box-shadow:0 2px 8px rgba(0,0,0,.12);background:white}
.b-logo img{width:100%;height:100%;object-fit:cover}
.b-title{font-family:'Baloo 2',cursive;font-size:5pt;font-weight:800;color:#0D2C54;text-align:center;margin-top:0.8mm;line-height:1.1}
.b-sub{font-size:3.2pt;font-weight:600;color:#718096;text-align:center;line-height:1.1;margin-top:0.3mm}
.b-body{padding:1.5mm 3.5mm;display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;position:relative;z-index:1}
.b-notice{font-size:3.2pt;font-weight:600;color:#546E7A;text-align:center;line-height:1.4;padding:1.2mm 2mm;background:#F5F5F5;border-radius:1.5mm;border-left:0.4mm solid #FB8C00;margin-bottom:1mm}
.b-contact{display:flex;flex-wrap:wrap;justify-content:center;gap:0.8mm 2.5mm;margin-bottom:1mm}
.b-ci{display:flex;align-items:center;gap:0.6mm;font-size:3pt;font-weight:600;color:#455A64}
.b-cicon{font-size:3pt}
.b-bot{position:absolute;bottom:0;left:0;right:0;background:linear-gradient(135deg,#0D2C54 0%,#1565C0 100%);padding:1mm 2.5mm;display:flex;align-items:center;justify-content:center;z-index:2;gap:1.2mm;flex-wrap:wrap}
.b-val{font-size:2.4pt;font-weight:800;color:rgba(255,255,255,.85);letter-spacing:0.1pt;text-transform:uppercase}
.b-vdot{font-size:1.8pt;color:#FFC107}
.wm{position:absolute;pointer-events:none}
.wm-c{border-radius:50%;border:0.25mm solid;opacity:.06}
.wm-t{opacity:.035;pointer-events:none}
.wm-l{opacity:.045;pointer-events:none;font-size:2.5mm;color:#2E7D32}
.wm-s{opacity:.055;pointer-events:none;font-size:2.2mm;color:#FFC107}
.wm-d{border-radius:50%;opacity:.05}
@media print{body{background:white;margin:0;padding:0}.page{padding:3mm;background:white;gap:0}.carnet{box-shadow:none;page-break-inside:avoid}.carnet-pair{page-break-inside:avoid}@page{size:A4 portrait;margin:4mm}}
</style></head><body>
<div class="page">${cardsHTML}</div>
<script>window.onload=()=>{setTimeout(()=>{window.print();setTimeout(()=>window.close(),800)},800)}<\/script>
</body></html>`;

    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); }
    else this.toast('Permite ventanas emergentes para imprimir', 'warning');
  },

  /**
   * 🎭 Escape HTML
   */
  escapeHTML(str = '') {
    return String(str).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  },

  /**
   * 🎭 Empty state
   */
  emptyState(msg = 'Sin datos', icon = 'smile') {

    return `

      <div class="

        flex flex-col
        items-center
        justify-center
        p-12
        text-center

        bg-slate-50/60

        rounded-[3rem]

        border-2
        border-dashed
        border-slate-200

      ">

        <div class="

          w-20 h-20
          bg-white
          rounded-full
          flex
          items-center
          justify-center
          mb-6
          shadow-xl

        ">

          <i
            data-lucide="${icon}"
            class="w-10 h-10 text-slate-300"
          ></i>

        </div>

        <h4 class="

          text-slate-800
          font-black
          text-lg
          mb-2

        ">

          Sin datos

        </h4>

        <p class="

          text-slate-400
          font-bold
          text-sm
          max-w-[260px]

        ">

          ${Helpers.escapeHTML(msg)}

        </p>

      </div>

    `;

  },


  /**
   * ❓ Confirmación nativa (wrapper)
   */
  async confirm(msg = '¿Estás seguro?') {
    return window.confirm(msg);
  },

  /**
   * 🦴 Skeleton lista
   */
  skeleton(rows = 3, height = 'h-24') {
    return Array(rows).fill(0).map(() => `
      <tr class="animate-pulse border-b border-slate-50">
        <td colspan="100%" class="px-6 py-4">
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 bg-slate-100 rounded-2xl"></div>
            <div class="flex-1 space-y-2">
              <div class="h-3 bg-slate-100 rounded-full w-1/3"></div>
              <div class="h-2 bg-slate-50 rounded-full w-1/4"></div>
            </div>
          </div>
        </td>
      </tr>
    `).join('');
  },


  /**
   * 🧱 Skeleton automático por ID
   */
  skeletonize(ids = []) {

    ids.forEach(id => {

      const el =
        document.getElementById(id);

      if (!el) return;


      // calendario
      if (
        id
        .toLowerCase()
        .includes('calendar')
      ) {

        el.innerHTML = `

          <div class="

            h-48
            bg-slate-100
            rounded-2xl
            animate-pulse

          "></div>

        `;

        return;

      }


      // listas
      if (
        id
        .toLowerCase()
        .includes('list')
      ) {

        el.innerHTML =
          Helpers.skeleton(
            3,
            'h-12'
          );

        return;

      }


      // KPI
      el.innerHTML = `

        <div class="

          h-8
          w-32

          bg-slate-200

          rounded-xl

          animate-pulse

        "></div>

      `;

    });

  },


  /**
   * 🪟 loading overlay global
   */
  showLoader(msg = 'Cargando...') {

    Helpers.hideLoader();

    const el =
      document.createElement('div');

    el.id = 'globalLoader';

    el.className = `

      fixed
      inset-0

      bg-white/70
      backdrop-blur-sm

      flex
      items-center
      justify-center

      z-[999]

    `;

    el.innerHTML = `

      <div class="

        flex
        flex-col
        items-center
        gap-4

        p-8

        bg-white

        rounded-3xl

        shadow-xl

      ">

        <div class="

          w-10
          h-10

          border-4
          border-slate-200
          border-t-indigo-500

          rounded-full

          animate-spin

        "></div>

        <p class="

          text-sm
          font-bold
          text-slate-600

        ">

          ${Helpers.escapeHTML(msg)}

        </p>

      </div>

    `;

    document.body.appendChild(el);

  },


  hideLoader() {

    document
      .getElementById(
        'globalLoader'
      )
      ?.remove();

  },


  /**
   * 🖼️ avatar fallback — con lazy loading
   */
  avatar(url, name = '') {
    if (url) {
      // Usar data-src para lazy loading via ImageLoader
      return `<img
        src="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AJQAB/9k="
        data-src="${url}"
        data-fallback="img/monte.jpg"
        class="karpus-img karpus-img-loading w-full h-full object-cover"
        loading="lazy"
        decoding="async">`;
    }
    const letter = name?.charAt(0)?.toUpperCase() || '?';
    return `<div class="w-full h-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-black">${letter}</div>`;
  },

  /**
   * ⏳ debounce pro
   */
  debounce(
    func,
    wait = 300
  ) {

    let timeout;

    const debounced =
      (...args) => {

        clearTimeout(timeout);

        timeout =
          setTimeout(
            () => func(...args),
            wait
          );

      };

    debounced.cancel =
      () =>
        clearTimeout(timeout);

    return debounced;

  },

  /**
   * 🛡️ try/catch global con logging a DB
   */
  async safe(fn, context = 'global') {
    try {
      return await fn();
    } catch (err) {
      console.error(`[Safe:${context}]`, err);
      
      // Registrar error en la tabla system_errors de forma silenciosa
      try {
        const { supabase } = await import('./supabase.js');
        const user = (await supabase.auth.getUser())?.data?.user;
        
        await supabase.from('system_errors').insert([{
          context,
          message: err.message,
          stack: err.stack,
          user_id: user?.id,
          url: window.location.href,
          user_agent: navigator.userAgent
        }]);
      } catch (logErr) {
        console.warn('Could not log error to DB:', logErr);
      }

      Helpers.toast('Algo no salió bien. El equipo técnico ha sido notificado.', 'error');
      return null;
    }
  },


  /**
   * 🆔 generar id
   */
  uid() {

    return crypto.randomUUID();

  },


  /**
   * ⏱️ sleep async
   */
  sleep(ms = 300) {

    return new Promise(

      resolve =>
        setTimeout(resolve, ms)

    );

  },


  /**
   * 📅 formato fecha RD
   */
  formatDate(date) {

    if (!date) return '';

    return new Date(date)

      .toLocaleDateString(

        'es-DO',

        {

          day: '2-digit',

          month: 'short',

          year: 'numeric'

        }

      );

  },


  /**
   * 📅 formato corto
   */
  formatShortDate(date) {

    if (!date) return '';

    return new Date(date)

      .toLocaleDateString(

        'es-DO',

        {

          day: 'numeric',

          month: 'short'

        }

      );

  },


  /**
   * 💰 formato moneda
   */
  formatCurrency(val = 0) {
    const num = Number(val || 0);
    return num.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },


  /**
   * 📉 exportar csv excel
   */
  exportToCSV(data, filename = `export_${new Date().getFullYear()}.csv`) {
    if (!data || !data.length) {
      Helpers.toast('No hay datos', 'warning');
      return;
    }

    const headers =
      Object.keys(data[0]);

    const csv = [

      headers.join(','),

      ...data.map(row =>

        headers

          .map(key => {

            let val =
              row[key] ?? '';

            val =
              String(val)
                .replace(/"/g, '""');

            if (
              val.match(
                /("|,|\n)/
              )
            ) {

              val =
                `"${val}"`;

            }

            return val;

          })

          .join(',')

      )

    ].join('\r\n');


    const blob =
      new Blob(

        [

          "\ufeff" + csv

        ],

        {

          type:
            'text/csv;charset=utf-8;'

        }

      );


    const link =
      document.createElement('a');

    link.href =
      URL.createObjectURL(blob);

    link.download =
      filename;

    link.click();

  },


  /**
   * 💰 Cálculo de Mora (Regla Unificada 5% Mensual)
   * Se aplica un 5% del monto base por cada mes o fracción de mes de retraso.
   */
  calculateMora(dueDate, baseAmount = 0) {
    if (!dueDate || !baseAmount) return 0;

    const dueDateStr = String(dueDate);
    const normalizedDate = /^\d{4}-\d{2}-\d{2}$/.test(dueDateStr)
      ? dueDateStr + 'T00:00:00'
      : dueDateStr;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const limit = new Date(normalizedDate);
    limit.setHours(0, 0, 0, 0);

    const diff = today.getTime() - limit.getTime();
    const daysLate = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (daysLate <= 0) return 0;

    const moraRate = 0.05; // 5% mensual
    const monthsLate = Math.ceil(daysLate / 30);
    const totalMora = Number(baseAmount) * moraRate * monthsLate;

    return Math.round(totalMora * 100) / 100;
  },

  /**
   * 💰 Desglose de Mora para UI
   */
  getMoraBreakdown(dueDate, baseAmount = 0) {
    const total = Helpers.calculateMora(dueDate, baseAmount);
    if (total === 0) return null;

    const dueDateStr = String(dueDate);
    const normalizedDate = /^\d{4}-\d{2}-\d{2}$/.test(dueDateStr)
      ? dueDateStr + 'T00:00:00'
      : dueDateStr;

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const limit = new Date(normalizedDate); limit.setHours(0, 0, 0, 0);
    const daysLate = Math.floor((today.getTime() - limit.getTime()) / (1000 * 60 * 60 * 24));

    const monthsLate = Math.ceil(daysLate / 30);

    let text = daysLate === 1 ? '1 día' : `${daysLate} días`;
    if (monthsLate > 0) {
      text = `${monthsLate} mes${monthsLate > 1 ? 'es' : ''} (${daysLate} d)`;
    }

    return {
      total,
      daysLate,
      monthsLate,
      formattedText: text.trim()
    };
  },

  /**
   * Delegación de eventos segura
   */
  delegate(el, selector, event, handler) {
    el.addEventListener(event, (e) => {
      const target = e.target.closest(selector);
      if (target && el.contains(target)) {
        handler.call(target, e, target);
      }
    });
  },

  /**
   * Sanitize value for use in HTML attributes (src, href, onerror, etc.)
   * Only allows safe protocols (http, https, data for images).
   */
  sanitizeAttr(str = '') {
    if (typeof str !== 'string') return '';
    const s = str.trim();
    if (/^https?:\/\//i.test(s) || /^data:image\//i.test(s)) return s;
    if (/^blob:/i.test(s)) return s;
    return '';
  }

};

// ── Compat exports (used by padre/ modules) ──────────────────────────────────
export const DATE_FORMAT = { locale: 'es-ES', options: { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' } };
export const TOAST_DURATION = 2800;
export const escapeHtml = (str) => Helpers.escapeHTML(str);

// Exponer globalmente para que el listener karpus:db-error pueda usar toast
if (typeof window !== 'undefined') window.Helpers = Helpers;