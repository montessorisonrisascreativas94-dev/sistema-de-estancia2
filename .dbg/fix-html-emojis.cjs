// fix-html-emojis.cjs — Repara emojis corruptos dentro de template literals HTML

const fs = require('fs');

// Mapa de emojis conocidos que aparecen en los modales/HTML inline
// Identificados por el texto que los rodea en el HTML
const HTML_EMOJI_CONTEXT = [
  // Medicamento modal: "–x`" antes de "Medicamento"
  // El backtick ` dentro de –x` rompe el template literal
  [/class="text-2xl">–x`<\/span>\s*<div><h3[^>]*>Medicamento/, 
   'class="text-2xl">💊</span>\n            <div><h3 class="text-lg font-black text-white">Medicamento'],
  
  // También buscar otros emojis dentro de template literals que tengan backtick
  // Patrón: span>CORRUPTO`  (backtick al final rompe el template)
  // Estos ocurren cuando el emoji original tenía bytes específicos
];

const root = 'c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main';
const f = `${root}/js/maestra/modules/routine.js`;
let content = fs.readFileSync(f, 'utf8');

// Reparar el caso específico primero
for (const [pattern, replacement] of HTML_EMOJI_CONTEXT) {
  content = content.replace(pattern, replacement);
}

// Buscar TODOS los emojis corruptos dentro de template literals (entre backticks)
// Patrón: <span...>CORRUPTO</span> o similar dentro de JS
// Los emojis corruptos en HTML se ven como: >–x...</span> o >–xR...</span> etc.

// Tabla de emojis por contexto de texto cercano
const SPAN_EMOJI_MAP = [
  // Modal de medicamento
  [/(<span[^>]*>)[–\u2013][^<]{0,15}(<\/span>[^<]*Medicamento)/g, '$1💊$2'],
  // Modal de temperatura  
  [/(<span[^>]*>)[–\u2013][^<]{0,15}(<\/span>[^<]*Temperatura)/g, '$1🌡️$2'],
  // Modal de fiebre
  [/(<span[^>]*>)[–\u2013][^<]{0,15}(<\/span>[^<]*Fiebre)/g, '$1🤒$2'],
  // Modal de golpe/caída
  [/(<span[^>]*>)[–\u2013][^<]{0,15}(<\/span>[^<]*Golpe)/g, '$1🤕$2'],
  // Modal de vómito
  [/(<span[^>]*>)[–\u2013][^<]{0,15}(<\/span>[^<]*Vómito)/g, '$1🤮$2'],
  // Modal de tos
  [/(<span[^>]*>)[–\u2013][^<]{0,15}(<\/span>[^<]*Tos)/g, '$1😷$2'],
  // Modal de accidente
  [/(<span[^>]*>)[–\u2013][^<]{0,15}(<\/span>[^<]*Accidente)/g, '$1🩹$2'],
  // Modal de nota
  [/(<span[^>]*>)[–\u2013][^<]{0,15}(<\/span>[^<]*Nota)/g, '$1📝$2'],
  // Modal de pañal/diaper
  [/(<span[^>]*>)[–\u2013][^<]{0,15}(<\/span>[^<]*(?:Pañal|Cambio))/g, '$1🧷$2'],
  // Modal de siesta
  [/(<span[^>]*>)[–\u2013][^<]{0,15}(<\/span>[^<]*Siesta)/g, '$1😴$2'],
  // Modal de biberón
  [/(<span[^>]*>)[–\u2013][^<]{0,15}(<\/span>[^<]*Biberón)/g, '$1🍼$2'],
  // Modal de baño
  [/(<span[^>]*>)[–\u2013][^<]{0,15}(<\/span>[^<]*(?:Baño|Bath))/g, '$1🚽$2'],
  // Modal de bienvenida
  [/(<span[^>]*>)[–\u2013][^<]{0,15}(<\/span>[^<]*Bienvenida)/g, '$1🖐️$2'],
  // Cualquier <span class="text-XXl"> con emoji corrupto
  [/(<span class="text-\dxl">)[–\u2013][^<`]{0,15}(`)/g, '$1💫$2'],
  // Catch-all: <span>CORRUPTO</span> donde el corrupto tiene – 
  [/(<span[^>]*>)[–\u2013][^<]{0,12}(<\/span>)/g, '$1❓$2'],
];

for (const [pattern, replacement] of SPAN_EMOJI_MAP) {
  content = content.replace(pattern, replacement);
}

fs.writeFileSync(f, content, 'utf8');

// Verificar sintaxis
const { execSync } = require('child_process');
try {
  execSync(`node --check "${f}"`, { stdio: 'pipe' });
  console.log('✅ Sintaxis válida');
} catch (e) {
  const err = e.stderr?.toString() || e.stdout?.toString() || '';
  console.log('❌ Error:', err.substring(0, 300));
  
  // Mostrar línea problemática
  const lineMatch = err.match(/:(\d+)\s*$/m);
  if (lineMatch) {
    const lineNum = parseInt(lineMatch[1]);
    const lines = content.split('\n');
    console.log(`Línea ${lineNum}:`, lines[lineNum - 1]);
    console.log(`Línea ${lineNum-1}:`, lines[lineNum - 2]);
    console.log(`Línea ${lineNum+1}:`, lines[lineNum]);
  }
}
