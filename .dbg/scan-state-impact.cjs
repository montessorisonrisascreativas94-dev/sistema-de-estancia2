// Para cada clave descartada: ¿se LEE con .get('k') en el mismo panel? (impacto real)
const fs = require('fs');
const path = require('path');

const droppedByPanel = {
  maestra: ['activeConversationId', 'classrooms'],
  directora: ['activeConversationId','activeCycleId','activePeriod','alertText','alertType','currentYear','jumpTo','paymentsData','periodOpen','yearOpen'],
  encargada: ['activeChatName','activeChatRole','activeChatUserId','activeConversationId'],
  asistente: ['activeChatName','activeChatRole','activeChatUserId','activeConversationId'],
  padre: ['currentDailyLog','currentGrades','currentPayments']
};

function walk(d, out = []) {
  if (!fs.existsSync(d)) return out;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.js$/.test(e.name) && !/\.min\.js$/.test(e.name)) out.push(p);
  }
  return out;
}

for (const [panel, keys] of Object.entries(droppedByPanel)) {
  const files = walk(path.join('js', panel));
  const cache = new Map();
  const get = (f) => cache.get(f) ?? cache.set(f, fs.readFileSync(f, 'utf8')).get(f);
  console.log(`\n=== ${panel}`);
  for (const k of keys) {
    let reads = [];
    for (const f of files) {
      const t = get(f);
      const re = new RegExp(`\\.get\\(\\s*['"]${k}['"]\\s*\\)`, 'g');
      const n = (t.match(re) || []).length;
      if (n) reads.push(`${n}x ${f}`);
    }
    console.log(`  ${k.padEnd(24)} get(): ${reads.length ? reads.join(', ') : '— nunca se lee —'}`);
  }
}
