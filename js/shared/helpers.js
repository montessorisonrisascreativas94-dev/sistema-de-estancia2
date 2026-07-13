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
   * 🔔 Toast moderno
   */
  toast(msg, type = 'success', duration = 4000) {

    if (!msg) return;

    document
      .querySelectorAll('.app-toast')
      .forEach(t => t.remove());

    const el =
      document.createElement('div');

    el.className = `
      app-toast
      fixed bottom-6 left-1/2 -translate-x-1/2
      z-[999]
      flex items-center gap-3
      px-6 py-3
      rounded-2xl
      shadow-2xl
      border
      text-sm
      font-bold
      transition-all
      duration-300
      ${

        type === 'error'
        ? 'bg-rose-500 text-white border-rose-400'

        : type === 'warning'
        ? 'bg-amber-500 text-white border-amber-400'

        : 'bg-slate-900 text-white border-slate-800'

      }
    `;

    el.innerHTML = `

      <div class="w-2 h-2 bg-white rounded-full animate-pulse"></div>

      ${Helpers.escapeHTML(msg)}

    `;

    document.body.appendChild(el);

    setTimeout(() => {

      el.classList.add(
        'opacity-0',
        'translate-y-2'
      );

      setTimeout(
        () => el.remove(),
        300
      );

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
   * Plantilla profesional de carnet doble cara para impresion
   * @param {string} qrImg - data URL del QR
   * @param {string} name - nombre del estudiante
   * @param {string} matricula - matricula (se muestra con prefijo MSC-)
   * @param {object} opts - { classroom, schedule, year, logoUrl }
   */
  getQRPrintTemplate(qrImg, name, matricula, opts = {}) {
    const mat = (matricula || '').startsWith('MSC-') ? matricula : 'MSC-' + (matricula || '');
    const classroom = opts.classroom || '';
    const schedule  = opts.schedule  || '';
    const year      = opts.year      || new Date().getFullYear() + '-' + (new Date().getFullYear() + 1);
    const school    = 'Colegio Montessori Sonrisas Creativas';

    // SVG Triangle mascot (orange)
    const triangle = `<svg width="38" height="44" viewBox="0 0 180 200" style="display:block">
      <polygon points="90,12 168,175 12,175" fill="#FF7A00" stroke="#D96500" stroke-width="4"/>
      <circle cx="72" cy="110" r="14" fill="white"/><circle cx="108" cy="110" r="14" fill="white"/>
      <circle cx="73" cy="111" r="7" fill="#1A2340"/><circle cx="109" cy="111" r="7" fill="#1A2340"/>
      <circle cx="76" cy="108" r="3" fill="white"/><circle cx="112" cy="108" r="3" fill="white"/>
      <path d="M 65 138 Q 90 155 115 138" stroke="#1A2340" stroke-width="5" fill="none" stroke-linecap="round"/>
    </svg>`;

    // SVG Pentagon mascot (green)
    const pentagon = `<svg width="38" height="44" viewBox="0 0 180 210" style="display:block">
      <ellipse cx="90" cy="22" rx="46" ry="16" fill="#0B63C7"/>
      <path d="M 52 28 Q 40 42 48 56 L 132 56 Q 140 42 128 28 Z" fill="#0B63C7"/>
      <polygon points="90,56 168,112 140,198 40,198 12,112" fill="#28B54D" stroke="#1A8035" stroke-width="4"/>
      <circle cx="75" cy="128" r="13" fill="white"/><circle cx="105" cy="128" r="13" fill="white"/>
      <circle cx="76" cy="129" r="6" fill="#1A2340"/><circle cx="106" cy="129" r="6" fill="#1A2340"/>
      <circle cx="79" cy="126" r="2.5" fill="white"/><circle cx="109" cy="126" r="2.5" fill="white"/>
      <path d="M 66 155 Q 90 170 114 155" stroke="#1A2340" stroke-width="5" fill="none" stroke-linecap="round"/>
    </svg>`;

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Carnet ${mat}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap');
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Nunito',sans-serif;background:#f1f5f9;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .page{width:210mm;min-height:297mm;margin:0 auto;padding:10mm;background:#f1f5f9}
    .card-wrap{display:inline-flex;gap:0;margin:4mm;vertical-align:top}
    /* Card dimensions: 85.6mm x 54mm (credit card size) */
    .card{width:85.6mm;height:54mm;border-radius:5mm;overflow:hidden;position:relative;border:2.5pt solid #0B63C7;background:white;box-shadow:0 2px 8px rgba(11,99,199,.15)}
    /* FRONT FACE - QR */
    .card-front{display:flex;flex-direction:column;align-items:center;justify-content:center;background:linear-gradient(180deg,#E8F2FF 0%,white 100%)}
    .card-front-header{background:linear-gradient(135deg,#0B63C7 0%,#0850A0 100%);width:100%;height:10mm;display:flex;align-items:center;justify-content:space-between;padding:0 3mm;flex-shrink:0}
    .card-front-header .school-name{color:white;font-size:5.5pt;font-weight:900;letter-spacing:.3pt;text-transform:uppercase}
    .card-front-header .mascots{display:flex;align-items:center;gap:1.5mm;flex-shrink:0}
    .card-front-body{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2mm;padding:2mm}
    .qr-box-front{width:26mm;height:26mm;background:white;border-radius:2mm;border:1.5pt solid #0B63C7;display:flex;align-items:center;justify-content:center;padding:1mm}
    .qr-box-front img{width:100%;height:100%;display:block}
    .qr-label-front{font-size:6pt;font-weight:900;color:#0B63C7;letter-spacing:.5pt;font-family:monospace;text-align:center}
    /* BACK FACE - Info */
    .card-back{display:flex;flex-direction:column}
    .card-back-header{background:linear-gradient(135deg,#0B63C7,#0850A0);height:10mm;display:flex;align-items:center;justify-content:space-between;padding:0 3mm;flex-shrink:0}
    .card-back-header .title{color:white;font-size:6pt;font-weight:900;text-transform:uppercase;letter-spacing:.5pt}
    .card-back-body{flex:1;display:flex;align-items:center;padding:2.5mm 3mm;gap:2mm}
    .card-photo{width:16mm;height:16mm;border-radius:2.5mm;border:1.5pt solid #0B63C7;background:#E8F2FF;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;align-self:center}
    .card-photo img{width:100%;height:100%;object-fit:cover}
    .card-photo-placeholder{font-size:14pt;color:#0B63C7}
    .card-info{flex:1;display:flex;flex-direction:column;justify-content:center;gap:1mm}
    .card-name{font-size:7.5pt;font-weight:900;color:#1A2340;line-height:1.2}
    .card-label{font-size:4.5pt;font-weight:900;color:#94a3b8;text-transform:uppercase;letter-spacing:.4pt;margin-bottom:.5mm}
    .card-value{font-size:6pt;font-weight:700;color:#1A2340}
    .card-mat{font-size:7pt;font-weight:900;color:#0B63C7;letter-spacing:.5pt;font-family:monospace}
    .card-footer{background:#1A2340;height:6mm;display:flex;align-items:center;justify-content:space-between;padding:0 3mm;flex-shrink:0}
    .card-footer p{color:rgba(255,255,255,.7);font-size:4.5pt;font-weight:800;letter-spacing:.8pt;text-transform:uppercase}
    /* Print layout: 2 cols x 5 rows = 10 per page */
    .cards-grid{display:flex;flex-wrap:wrap;gap:4mm}
    @media print{
      body{background:white}
      .page{padding:8mm;background:white}
      .card{box-shadow:none}
      @page{size:A4;margin:0}
    }
  </style>
</head>
<body>
<div class="page">
  <div class="cards-grid">

    <!-- FRONT (QR) -->
    <div class="card card-front">
      <div class="card-front-header">
        <div class="school-name">${school}</div>
        <div class="mascots">${triangle}${pentagon}</div>
      </div>
      <div class="card-front-body">
        <div class="qr-box-front"><img src="${qrImg}" alt="QR Code"></div>
        <div class="qr-label-front">${mat}</div>
      </div>
    </div>

    <!-- BACK (Info) -->
    <div class="card card-back">
      <div class="card-back-header">
        <div class="title">Credencial de Acceso</div>
        <div class="mascots">${triangle}${pentagon}</div>
      </div>
      <div class="card-back-body">
        <div class="card-photo"><span class="card-photo-placeholder">&#128100;</span></div>
        <div class="card-info">
          <div class="card-name">${name || 'Estudiante'}</div>
          <div class="card-label">Matricula</div>
          <div class="card-mat">${mat}</div>
          ${classroom ? `<div><div class="card-label">Aula</div><div class="card-value">${classroom}</div></div>` : ''}
          ${schedule  ? `<div><div class="card-label">Horario</div><div class="card-value">${schedule}</div></div>` : ''}
        </div>
      </div>
      <div class="card-footer"><p>Colegio Montessori Sonrisas Creativas</p></div>
    </div>

  </div>
</div>
<script>window.onload=()=>{setTimeout(()=>{window.print();setTimeout(()=>window.close(),600)},600)}</script>
</body>
</html>`;
  },

  /**
   * Imprime todos los carnets de una lista de estudiantes en un solo PDF
   * 2 columnas (frente+reverso) x N filas, en hojas A4
   * @param {Array} students - [{name, matricula, classroom, schedule, avatarUrl}]
   */
  async printAllCarnets(students = []) {
    if (!students.length) { this.toast('Sin estudiantes para imprimir', 'warning'); return; }

    // Load QR lib
    await new Promise(resolve => {
      if (window.QRCode) { resolve(); return; }
      const s = document.createElement('script');
      s.src = 'js/shared/qrcode.min.js';
      s.onload = resolve;
      document.head.appendChild(s);
    });

    // Generate QR images for all students
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

    // Triangle and Pentagon SVGs
    const triangle = `<svg width="30" height="36" viewBox="0 0 180 200"><polygon points="90,12 168,175 12,175" fill="#FF7A00" stroke="#D96500" stroke-width="4"/><circle cx="72" cy="110" r="14" fill="white"/><circle cx="108" cy="110" r="14" fill="white"/><circle cx="73" cy="111" r="7" fill="#1A2340"/><circle cx="109" cy="111" r="7" fill="#1A2340"/><path d="M 65 138 Q 90 155 115 138" stroke="#1A2340" stroke-width="5" fill="none" stroke-linecap="round"/></svg>`;
    const pentagon = `<svg width="30" height="36" viewBox="0 0 180 210"><ellipse cx="90" cy="22" rx="46" ry="16" fill="#0B63C7"/><path d="M 52 28 Q 40 42 48 56 L 132 56 Q 140 42 128 28 Z" fill="#0B63C7"/><polygon points="90,56 168,112 140,198 40,198 12,112" fill="#28B54D" stroke="#1A8035" stroke-width="4"/><circle cx="75" cy="128" r="13" fill="white"/><circle cx="105" cy="128" r="13" fill="white"/><circle cx="76" cy="129" r="6" fill="#1A2340"/><circle cx="106" cy="129" r="6" fill="#1A2340"/><path d="M 66 155 Q 90 170 114 155" stroke="#1A2340" stroke-width="5" fill="none" stroke-linecap="round"/></svg>`;

    const year = new Date().getFullYear() + '-' + (new Date().getFullYear() + 1);
    const school = 'Colegio Montessori Sonrisas Creativas';

    const cardsHTML = qrImages.map(st => `
      <!-- FRONT (QR) -->
      <div class="card card-front">
        <div class="card-front-header">
          <div class="school-name">${school}</div>
          <div class="mascots">${triangle}${pentagon}</div>
        </div>
        <div class="card-front-body">
          <div class="qr-box-front">${st.qrImg ? `<img src="${st.qrImg}">` : '<span style="font-size:8pt;color:#94a3b8">QR</span>'}</div>
          <div class="qr-label-front">${st.mat}</div>
        </div>
      </div>
      <!-- BACK (Info) -->
      <div class="card card-back">
        <div class="card-back-header">
          <div class="title">Credencial de Acceso</div>
          <div class="mascots">${triangle}${pentagon}</div>
        </div>
        <div class="card-back-body">
          <div class="card-photo"><span class="card-photo-placeholder">&#128100;</span></div>
          <div class="card-info">
            <div class="card-name">${(st.name||'—').substring(0,28)}</div>
            <div class="card-label">Matricula</div>
            <div class="card-mat">${st.mat}</div>
            ${st.classroom ? `<div><div class="card-label">Aula</div><div class="card-value">${st.classroom}</div></div>` : ''}
          </div>
        </div>
        <div class="card-footer"><p>Colegio Montessori Sonrisas Creativas</p></div>
      </div>`).join('\n');

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Carnets Estudiantes</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;700;800;900&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Nunito',sans-serif;background:white;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{width:210mm;margin:0 auto;padding:8mm}
.cards-grid{display:flex;flex-wrap:wrap;gap:3mm;justify-content:flex-start}
.card{width:85.6mm;height:54mm;border-radius:4.5mm;overflow:hidden;position:relative;border:2pt solid #0B63C7;background:white;flex-shrink:0}
.card-front{display:flex;flex-direction:column;align-items:center;justify-content:center;background:linear-gradient(180deg,#E8F2FF 0%,white 100%)}
.card-front-header{background:linear-gradient(135deg,#0B63C7,#0850A0);width:100%;height:10mm;display:flex;align-items:center;justify-content:space-between;padding:0 3mm;flex-shrink:0}
.school-name{color:white;font-size:5pt;font-weight:900;letter-spacing:.3pt;text-transform:uppercase}
.mascots{display:flex;align-items:center;gap:1mm;flex-shrink:0}
.card-front-body{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2mm;padding:2mm}
.qr-box-front{width:26mm;height:26mm;background:white;border-radius:2mm;border:1.5pt solid #0B63C7;display:flex;align-items:center;justify-content:center;padding:.8mm}
.qr-box-front img{width:100%;height:100%}
.qr-label-front{font-size:6pt;font-weight:900;color:#0B63C7;letter-spacing:.5pt;font-family:monospace;text-align:center}
.card-back{display:flex;flex-direction:column}
.card-back-header{background:linear-gradient(135deg,#0B63C7,#0850A0);height:10mm;display:flex;align-items:center;justify-content:space-between;padding:0 3mm;flex-shrink:0}
.title{color:white;font-size:5.5pt;font-weight:900;text-transform:uppercase;letter-spacing:.5pt}
.card-back-body{flex:1;display:flex;align-items:center;padding:2mm 2.5mm;gap:2mm}
.card-photo{width:15mm;height:15mm;border-radius:2mm;border:1.5pt solid #0B63C7;background:#E8F2FF;display:flex;align-items:center;justify-content:center;flex-shrink:0;align-self:center}
.card-photo-placeholder{font-size:13pt;color:#0B63C7}
.card-info{flex:1;display:flex;flex-direction:column;justify-content:center;gap:.8mm}
.card-name{font-size:7pt;font-weight:900;color:#1A2340;line-height:1.2}
.card-label{font-size:4pt;font-weight:900;color:#94a3b8;text-transform:uppercase;letter-spacing:.4pt}
.card-value{font-size:5.5pt;font-weight:700;color:#1A2340}
.card-mat{font-size:6.5pt;font-weight:900;color:#0B63C7;letter-spacing:.5pt;font-family:monospace}
.card-footer{background:#1A2340;height:6mm;display:flex;align-items:center;justify-content:space-between;padding:0 3mm;flex-shrink:0}
.card-footer p{color:rgba(255,255,255,.7);font-size:4pt;font-weight:800;letter-spacing:.8pt;text-transform:uppercase}
@media print{@page{size:A4;margin:0}.page{padding:6mm}}
</style></head><body>
<div class="page"><div class="cards-grid">${cardsHTML}</div></div>
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
  }

};

// Exponer globalmente para que el listener karpus:db-error pueda usar toast
if (typeof window !== 'undefined') window.Helpers = Helpers;