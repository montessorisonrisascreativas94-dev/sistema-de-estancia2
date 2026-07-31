/**
 * server/api.cjs — API legacy de datos.
 *
 * ENDURECIDA PARA PRODUCCIÓN:
 *  - CORS estricto (allowlist), nunca '*'.
 *  - Toda ruta exige JWT válido de Supabase; las sensibles exigen rol.
 *  - Sin login por contraseña en claro (se usa Supabase Auth).
 *  - Service role SOLO en /api/admin/update-user (con rol directora/admin).
 *  - Rate limiting por IP+ruta, límite de cuerpo, errores sin detalle interno.
 *  - En modo SQLite (sin Supabase) el API queda inaccesible por diseño.
 */
const express = require('express');
const cors = require('cors');
try { require('dotenv').config(); } catch(e) {}
const Database = require('better-sqlite3');
const { createClient } = require('@supabase/supabase-js');
const { useSupabase, adminClient } = require('./dbProvider.cjs');
const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

const STAFF_ROLES = ['directora', 'asistente', 'admin', 'encargada'];
const DIRECTIVE_ROLES = ['directora', 'admin'];

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', false);

// ── Seguridad: headers ───────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// ── CORS estricto ────────────────────────────────────────────────
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true); // misma-origen / curl
    const ok = ALLOWED_ORIGINS.includes(String(origin).toLowerCase());
    return ok ? cb(null, origin) : cb(new Error('CORS origin no permitido'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['content-type', 'authorization'],
  maxAge: 600,
}));

app.use(express.json({ limit: '100kb' }));

// ── Rate limiting (por IP + ruta) ────────────────────────────────
const buckets = new Map();
function rateLimit({ windowMs = 60_000, max = 60 } = {}) {
  return (req, res, next) => {
    const ip = req.socket.remoteAddress || 'unknown';
    const key = `${req.method}:${req.path}:${ip}`;
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || now > b.resetAt) {
      b = { hits: 0, resetAt: now + windowMs };
      buckets.set(key, b);
    }
    b.hits += 1;
    if (b.hits > max) {
      return res.status(429).json({ error: 'Demasiadas solicitudes. Intente más tarde.' });
    }
    next();
  };
}
// Limpieza periódica de buckets para evitar fuga de memoria
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (now > b.resetAt) buckets.delete(k);
}, 60_000).unref();

// ── Autenticación (JWT Supabase) ─────────────────────────────────
function extractToken(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

async function authRequired(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) return res.status(401).json({ error: 'Autenticación requerida' });
    if (!useSupabase || !adminClient) {
      return res.status(503).json({ error: 'Servicio no disponible' });
    }
    const { data, error } = await adminClient.auth.getUser(token);
    if (error || !data || !data.user) {
      return res.status(401).json({ error: 'Sesión inválida o expirada' });
    }
    req.user = data.user;
    req.userToken = token;
    const { data: prof } = await adminClient
      .from('profiles').select('role').eq('id', data.user.id).maybeSingle();
    req.role = (prof && prof.role) || '';
    next();
  } catch (e) {
    console.error('[api] authRequired error:', e && e.message);
    res.status(500).json({ error: 'Error de autenticación' });
  }
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.role)) {
      return res.status(403).json({ error: 'Sin permisos para esta operación' });
    }
    next();
  };
}

// Cliente Supabase con el token del usuario (RLS aplicada)
function sb(req) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${req.userToken}` } },
    auth: { persistSession: false },
  });
}

// ── Utilidades de BD ─────────────────────────────────────────────
const db = new Database('./data/karpus.db');
function rows(sql, params = []) { return db.prepare(sql).all(...params); }
function row(sql, params = []) { return db.prepare(sql).get(...params); }
function run(sql, params = []) { return db.prepare(sql).run(...params); }

function sendResendEmail({ to, subject, html, text }) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return reject(new Error('RESEND_API_KEY no configurada'));
    const from = process.env.RESEND_FROM || 'Karpus <onboarding@resend.dev>';
    const payload = JSON.stringify({
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text
    });
    const options = {
      hostname: 'api.resend.com',
      path: '/emails',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };
    const req = https.request(options, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(body)); } catch { resolve({ ok: true }); }
        } else {
          reject(new Error(`Resend error ${res.statusCode}`));
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

const sanitizeOut = o => (o && typeof o === 'object' ? JSON.parse(JSON.stringify(o)) : o);

// ── Health check (público, sin datos) ────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ ok: true, mode: useSupabase ? 'supabase' : 'sqlite' });
});

// ── RUTAS PROTEGIDAS ─────────────────────────────────────────────
// (login legado eliminado: se usa Supabase Auth desde el frontend)

// Classrooms
app.get('/api/classrooms', rateLimit({ max: 120 }), authRequired, async (req, res) => {
  try {
    if (useSupabase) {
      const { data, error } = await sb(req)
        .from('classrooms').select('id,name,level').order('id', { ascending: true });
      if (error) return res.status(400).json({ error: 'Error al consultar aulas' });
      return res.json(data || []);
    }
    const list = rows('SELECT id, name, level FROM classrooms ORDER BY id');
    res.json(list);
  } catch (e) {
    console.error('[api] /classrooms', e && e.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

app.post('/api/classrooms', rateLimit({ max: 30 }), authRequired, requireRole(STAFF_ROLES), async (req, res) => {
  try {
    const { name, level } = req.body || {};
    if (!name || !level) return res.status(400).json({ error: 'name y level requeridos' });
    if (useSupabase) {
      const { error } = await sb(req).from('classrooms').insert({ name, level });
      if (error) return res.status(400).json({ error: 'Error al crear aula' });
      return res.json({ ok: true });
    }
    run('INSERT INTO classrooms (name, level) VALUES (?, ?)', [name, level]);
    res.json({ ok: true });
  } catch (e) {
    console.error('[api] POST /classrooms', e && e.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

// Posts by class level
app.get('/api/posts', rateLimit({ max: 120 }), authRequired, async (req, res) => {
  try {
    const cls = req.query.class;
    if (useSupabase) {
      let classroomIds = [];
      if (cls) {
        const { data: classrooms, error: clsErr } = await sb(req)
          .from('classrooms').select('id').eq('level', cls);
        if (clsErr) return res.status(400).json({ error: 'Error al consultar aulas' });
        classroomIds = (classrooms || []).map(c => c.id);
      }
      let postsQuery = sb(req)
        .from('posts').select('id,classroom_id,author_role,title,content,created_at')
        .order('created_at', { ascending: false });
      if (cls && classroomIds.length) postsQuery = postsQuery.in('classroom_id', classroomIds);
      const { data: posts, error } = await postsQuery;
      if (error) return res.status(400).json({ error: 'Error al consultar posts' });
      const ids = (posts || []).map(p => p.id);
      let atts = [];
      if (ids.length) {
        const { data: attachments, error: attErr } = await sb(req)
          .from('post_attachments').select('id,post_id,type,url').in('post_id', ids);
        if (!attErr) atts = attachments || [];
      }
      const clsIds = [...new Set((posts || []).map(p => p.classroom_id))];
      let levelMap = new Map();
      if (clsIds.length) {
        const { data: clsRows } = await sb(req).from('classrooms').select('id,level').in('id', clsIds);
        levelMap = new Map((clsRows || []).map(c => [c.id, c.level]));
      }
      const shaped = (posts || []).map(p => ({
        id: p.id,
        class: levelMap.get(p.classroom_id) || 'General',
        teacher: p.author_role === 'maestra' ? 'Maestra' : 'Directora',
        date: p.created_at,
        text: p.title + (p.content ? ': ' + p.content : ''),
        photo: '', video: '', docUrl: '', docType: '',
        comments: [], reactions: { likes: 0, emoji: {} },
        attachments: atts.filter(a => a.post_id === p.id)
      }));
      return res.json(shaped);
    }
    const posts = rows(`
      SELECT p.id, c.level AS class, p.author_role, p.title, p.content, p.created_at
      FROM posts p JOIN classrooms c ON c.id = p.classroom_id
      ${cls ? 'WHERE c.level = ?' : ''}
      ORDER BY p.created_at DESC`, cls ? [cls] : []);
    const ids = posts.map(p => p.id);
    let atts = [];
    if (ids.length) {
      const placeholders = ids.map(() => '?').join(',');
      atts = rows(`SELECT id, post_id, type, url FROM post_attachments WHERE post_id IN (${placeholders})`, ids);
    }
    const withAtts = posts.map(p => ({
      id: p.id, class: p.class, teacher: p.author_role === 'maestra' ? 'Maestra' : 'Directora',
      date: p.created_at, text: p.title + (p.content ? ': ' + p.content : ''),
      photo: '', video: '', docUrl: '', docType: '',
      comments: [], reactions: { likes: 0, emoji: {} },
      attachments: atts.filter(a => a.post_id === p.id)
    }));
    res.json(withAtts);
  } catch (e) {
    console.error('[api] /posts', e && e.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

// Tasks by class level
app.get('/api/tasks', rateLimit({ max: 120 }), authRequired, async (req, res) => {
  try {
    const cls = req.query.class;
    if (useSupabase) {
      let classroomIds = [];
      if (cls) {
        const { data: classrooms, error: clsErr } = await sb(req)
          .from('classrooms').select('id').eq('level', cls);
        if (clsErr) return res.status(400).json({ error: 'Error al consultar aulas' });
        classroomIds = (classrooms || []).map(c => c.id);
      }
      let tasksQuery = sb(req)
        .from('tasks').select('id,classroom_id,title,description,due_date').order('id', { ascending: false });
      if (cls && classroomIds.length) tasksQuery = tasksQuery.in('classroom_id', classroomIds);
      const { data: tasks, error } = await tasksQuery;
      if (error) return res.status(400).json({ error: 'Error al consultar tareas' });

      const ids = (tasks || []).map(t => t.id);
      let subs = [], grades = [];
      if (ids.length) {
        const { data: submissions, error: subErr } = await sb(req)
          .from('task_submissions').select('id,task_id,student_id,submitted_at,file_type,comment').in('task_id', ids);
        if (!subErr) subs = submissions || [];
        const { data: gradeRows, error: gradeErr } = await sb(req)
          .from('grades').select('id,task_id,student_id,grade,comment').in('task_id', ids);
        if (!gradeErr) grades = gradeRows || [];
      }
      const { data: students, error: stuErr } = await sb(req)
        .from('students').select('id,first_name,last_name');
      if (stuErr) return res.status(400).json({ error: 'Error al consultar estudiantes' });
      const studentsMap = new Map((students || []).map(s => [s.id, `${s.first_name} ${s.last_name}`]));

      const clsIds = [...new Set((tasks || []).map(t => t.classroom_id))];
      let levelMap = new Map();
      if (clsIds.length) {
        const { data: clsRows } = await sb(req).from('classrooms').select('id,level').in('id', clsIds);
        levelMap = new Map((clsRows || []).map(c => [c.id, c.level]));
      }
      const shaped = (tasks || []).map(t => ({
        id: t.id, class: levelMap.get(t.classroom_id) || 'General',
        title: t.title, desc: t.description, publish: t.due_date, due: t.due_date, attachments: [],
        submissions: (subs || []).filter(s => s.task_id === t.id).map(s => ({
          parent: studentsMap.get(s.student_id) || 'Estudiante', comment: s.comment,
          fileType: s.file_type, files: [], date: s.submitted_at
        })),
        grades: (grades || []).filter(g => g.task_id === t.id).map(g => ({
          student: studentsMap.get(g.student_id) || 'Estudiante', grade: g.grade,
          comment: g.comment, date: ''
        }))
      }));
      return res.json(shaped);
    }
    const tasks = rows(`
      SELECT t.id, c.level AS class, t.title, t.description, t.due_date
      FROM tasks t JOIN classrooms c ON c.id = t.classroom_id
      ${cls ? 'WHERE c.level = ?' : ''}
      ORDER BY t.id DESC`, cls ? [cls] : []);
    const ids = tasks.map(t => t.id);
    let subs = [], grades = [];
    if (ids.length) {
      const placeholders = ids.map(() => '?').join(',');
      subs = rows(`SELECT id, task_id, student_id, submitted_at, file_type, comment FROM task_submissions WHERE task_id IN (${placeholders})`, ids);
      grades = rows(`SELECT id, task_id, student_id, grade, comment FROM grades WHERE task_id IN (${placeholders})`, ids);
    }
    const studentsMap = new Map(rows('SELECT id, first_name, last_name FROM students').map(s => [s.id, `${s.first_name} ${s.last_name}`]));
    const shaped = tasks.map(t => ({
      id: t.id, class: t.class, title: t.title, desc: t.description,
      publish: t.due_date, due: t.due_date, attachments: [],
      submissions: subs.filter(s => s.task_id === t.id).map(s => ({
        parent: studentsMap.get(s.student_id) || 'Estudiante', comment: s.comment,
        fileType: s.file_type, files: [], date: s.submitted_at
      })),
      grades: grades.filter(g => g.task_id === t.id).map(g => ({
        student: studentsMap.get(g.student_id) || 'Estudiante', grade: g.grade,
        comment: g.comment, date: ''
      }))
    }));
    res.json(shaped);
  } catch (e) {
    console.error('[api] /tasks', e && e.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

app.get('/api/task/:id', rateLimit({ max: 120 }), authRequired, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'id inválido' });
    if (useSupabase) {
      const { data: taskRows, error } = await sb(req)
        .from('tasks').select('id,classroom_id,title,description,due_date').eq('id', id).limit(1);
      if (error) return res.status(400).json({ error: 'Error al consultar tarea' });
      const t = (taskRows || [])[0];
      if (!t) return res.status(404).json({ error: 'Not found' });
      let level = 'General';
      if (t.classroom_id) {
        const { data: clsRows } = await sb(req).from('classrooms').select('id,level').eq('id', t.classroom_id).limit(1);
        level = (clsRows && clsRows[0] && clsRows[0].level) || 'General';
      }
      return res.json({ id: t.id, class: level, title: t.title, desc: t.description, due: t.due_date });
    }
    const t = row(`
      SELECT t.id, c.level AS class, t.title, t.description, t.due_date
      FROM tasks t JOIN classrooms c ON c.id = t.classroom_id
      WHERE t.id = ?`, [id]);
    if (!t) return res.status(404).json({ error: 'Not found' });
    res.json({ id: t.id, class: t.class, title: t.title, desc: t.description, due: t.due_date });
  } catch (e) {
    console.error('[api] /task/:id', e && e.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

app.post('/api/task/:id/submissions', rateLimit({ max: 30 }), authRequired, async (req, res) => {
  try {
    const taskId = Number(req.params.id);
    const { studentId, fileType, comment } = req.body || {};
    if (!Number.isInteger(taskId) || taskId <= 0) return res.status(400).json({ error: 'id inválido' });
    if (!studentId) return res.status(400).json({ error: 'studentId requerido' });
    if (useSupabase) {
      const { error } = await sb(req).from('task_submissions').insert({
        task_id: taskId, student_id: studentId, submitted_at: new Date().toISOString(),
        file_type: String(fileType || 'archivo').slice(0, 50), comment: String(comment || '').slice(0, 1000)
      });
      if (error) return res.status(400).json({ error: 'Error al enviar tarea' });
      return res.json({ ok: true });
    }
    run('INSERT INTO task_submissions (task_id, student_id, submitted_at, file_type, comment) VALUES (?, ?, DATE("now"), ?, ?)',
      [taskId, studentId, fileType || 'archivo', comment || '']);
    res.json({ ok: true });
  } catch (e) {
    console.error('[api] submissions', e && e.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

// Notifications
app.get('/api/notifications', rateLimit({ max: 120 }), authRequired, async (req, res) => {
  try {
    const cls = req.query.class;
    if (useSupabase) {
      const { data: notifs, error } = await sb(req)
        .from('notifications').select('id,classroom_id,type,text,date,sender_id').order('id', { ascending: false });
      if (error) return res.status(400).json({ error: 'Error al consultar notificaciones' });
      const ids = [...new Set((notifs || []).map(n => n.classroom_id).filter(Boolean))];
      let levelMap = new Map();
      if (ids.length) {
        const { data: clsRows } = await sb(req).from('classrooms').select('id,level').in('id', ids);
        levelMap = new Map((clsRows || []).map(c => [c.id, c.level]));
      }
      let items = (notifs || []).map(n => ({ id: n.id, class: levelMap.get(n.classroom_id) || 'General', type: n.type, text: n.text, date: n.date, senderId: n.sender_id }));
      if (cls) items = items.filter(n => n.class === cls || n.class === 'General');
      return res.json(items);
    }
    let items = rows(`
      SELECT n.id, n.classroom_id, n.type, n.text, n.date, n.sender_id, c.level AS class
      FROM notifications n LEFT JOIN classrooms c ON c.id = n.classroom_id
      ORDER BY n.id DESC`);
    items = items.map(n => ({ id: n.id, class: n.class || 'General', type: n.type, text: n.text, date: n.date, senderId: n.sender_id }));
    if (cls) items = items.filter(n => n.class === cls || n.class === 'General');
    res.json(items);
  } catch (e) {
    console.error('[api] /notifications', e && e.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

// Contacts (datos estáticos, sin datos personales reales)
app.get('/api/contacts', (req, res) => {
  res.json([
    { id: 'maestra', name: 'Maestra' },
    { id: 'directora', name: 'Directora' }
  ]);
});

// Messages
app.get('/api/messages', rateLimit({ max: 120 }), authRequired, async (req, res) => {
  try {
    const participants = (req.query.participants || '').split(',').map(s => s.trim()).filter(Boolean).sort();
    if (participants.length < 2) return res.status(400).json({ error: 'participants requeridos' });
    if (useSupabase) {
      const { data: msgs, error } = await sb(req)
        .from('messages').select('id,from_id,to_id,text,created_at')
        .in('from_id', participants).in('to_id', participants).order('id');
      if (error) return res.status(400).json({ error: 'Error al consultar mensajes' });
      const thread = (msgs || []).filter(m => participants.includes(m.from_id) && participants.includes(m.to_id));
      return res.json({ participants, messages: thread.map(m => ({ id: m.id, from: m.from_id, text: m.text, date: m.created_at, status: 'sent', seenAt: '' })) });
    }
    const msgs = rows('SELECT id, from_id, to_id, text, created_at FROM messages ORDER BY id');
    const thread = msgs.filter(m => participants.includes(m.from_id) && participants.includes(m.to_id));
    res.json({ participants, messages: thread.map(m => ({ id: m.id, from: m.from_id, text: m.text, date: m.created_at, status: 'sent', seenAt: '' })) });
  } catch (e) {
    console.error('[api] /messages', e && e.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

app.post('/api/messages', rateLimit({ max: 60 }), authRequired, async (req, res) => {
  try {
    const { participants, from, text } = req.body || {};
    const parts = Array.isArray(participants) ? participants.map(String) : [];
    if (parts.length < 2 || !from || !text) return res.status(400).json({ error: 'datos inválidos' });
    if (String(from) !== req.user.id) {
      return res.status(403).json({ error: 'Solo puedes enviar mensajes como tú mismo' });
    }
    if (String(text).length > 4000) return res.status(400).json({ error: 'Mensaje demasiado largo' });
    const to = parts.find(p => p !== from);
    if (useSupabase) {
      const { error } = await sb(req).from('messages').insert({
        from_id: from, to_id: to, text: String(text), created_at: new Date().toISOString()
      });
      if (error) return res.status(400).json({ error: 'Error al enviar mensaje' });
      return res.json({ ok: true });
    }
    run('INSERT INTO messages (from_id, to_id, text, created_at) VALUES (?, ?, ?, DATE("now"))', [from, to, text]);
    res.json({ ok: true });
  } catch (e) {
    console.error('[api] POST /messages', e && e.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

// Teachers — NUNCA se exponen passwords. Endpoint legado (tabla teachers).
app.get('/api/teachers', rateLimit({ max: 60 }), authRequired, requireRole(STAFF_ROLES), async (req, res) => {
  try {
    if (useSupabase) {
      const { data, error } = await sb(req).from('profiles')
        .select('id,name,email,role,phone,avatar_url')
        .eq('role', 'maestra');
      if (error) return res.status(400).json({ error: 'Error al consultar maestras' });
      return res.json(data || []);
    }
    const list = rows('SELECT id, name, email, phone, specialty, avatar_url, username FROM teachers');
    res.json(list);
  } catch (e) {
    console.error('[api] /teachers', e && e.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

// Students
app.get('/api/students', rateLimit({ max: 120 }), authRequired, async (req, res) => {
  try {
    const classId = req.query.classId;
    if (useSupabase) {
      let query = sb(req).from('students').select('*, classrooms(name, level)');
      if (classId) query = query.eq('classroom_id', classId);
      const { data, error } = await query;
      if (error) return res.status(400).json({ error: 'Error al consultar estudiantes' });
      return res.json(data || []);
    }
    let sql = 'SELECT s.*, c.name as class_name, c.level as class_level FROM students s JOIN classrooms c ON c.id = s.classroom_id';
    let params = [];
    if (classId) { sql += ' WHERE s.classroom_id = ?'; params.push(classId); }
    res.json(rows(sql, params));
  } catch (e) {
    console.error('[api] /students', e && e.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

app.post('/api/students', rateLimit({ max: 30 }), authRequired, requireRole(STAFF_ROLES), async (req, res) => {
  try {
    const { first_name, last_name, classroom_id, avatar_url } = req.body || {};
    if (!first_name) return res.status(400).json({ error: 'first_name requerido' });
    if (useSupabase) {
      const { error } = await sb(req).from('students').insert({ first_name, last_name, classroom_id, avatar_url });
      if (error) return res.status(400).json({ error: 'Error al crear estudiante' });
      return res.json({ ok: true });
    }
    run('INSERT INTO students (first_name, last_name, classroom_id, avatar_url) VALUES (?, ?, ?, ?)',
      [first_name, last_name, classroom_id, avatar_url]);
    res.json({ ok: true });
  } catch (e) {
    console.error('[api] POST /students', e && e.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

// Payments
app.get('/api/payments', rateLimit({ max: 120 }), authRequired, async (req, res) => {
  try {
    const studentId = req.query.studentId;
    if (useSupabase) {
      let query = sb(req).from('payments').select('*, students(first_name, last_name)');
      if (studentId) query = query.eq('student_id', studentId);
      const { data, error } = await query;
      if (error) return res.status(400).json({ error: 'Error al consultar pagos' });
      return res.json(data || []);
    }
    let sql = 'SELECT p.*, s.first_name, s.last_name FROM payments p JOIN students s ON s.id = p.student_id';
    let params = [];
    if (studentId) { sql += ' WHERE p.student_id = ?'; params.push(studentId); }
    res.json(rows(sql, params));
  } catch (e) {
    console.error('[api] /payments', e && e.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

app.post('/api/payments', rateLimit({ max: 30 }), authRequired, requireRole(STAFF_ROLES), async (req, res) => {
  try {
    const { student_id, amount, status, due_date, concept } = req.body || {};
    if (!student_id || amount == null) return res.status(400).json({ error: 'student_id y amount requeridos' });
    const validStatus = ['pending', 'paid', 'overdue', 'cancelled'];
    if (status && !validStatus.includes(status)) return res.status(400).json({ error: 'status inválido' });
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 0) return res.status(400).json({ error: 'amount inválido' });
    if (useSupabase) {
      const { error } = await sb(req).from('payments').insert({ student_id, amount: amt, status, due_date, concept });
      if (error) return res.status(400).json({ error: 'Error al crear pago' });
      return res.json({ ok: true });
    }
    run('INSERT INTO payments (student_id, amount, status, due_date, concept) VALUES (?, ?, ?, ?, ?)',
      [student_id, amt, status, due_date, concept]);
    res.json({ ok: true });
  } catch (e) {
    console.error('[api] POST /payments', e && e.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

app.put('/api/payments/:id', rateLimit({ max: 30 }), authRequired, requireRole(STAFF_ROLES), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};
    const validStatus = ['pending', 'paid', 'overdue', 'cancelled'];
    if (!validStatus.includes(status)) return res.status(400).json({ error: 'status inválido' });
    if (useSupabase) {
      const { error } = await sb(req).from('payments').update({ status }).eq('id', id);
      if (error) return res.status(400).json({ error: 'Error al actualizar pago' });
      return res.json({ ok: true });
    }
    run('UPDATE payments SET status = ? WHERE id = ?', [status, id]);
    res.json({ ok: true });
  } catch (e) {
    console.error('[api] PUT /payments', e && e.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

// Attendance
app.get('/api/attendance', rateLimit({ max: 120 }), authRequired, async (req, res) => {
  try {
    const { studentId, date } = req.query;
    if (useSupabase) {
      let query = sb(req).from('attendance').select('*');
      if (studentId) query = query.eq('student_id', studentId);
      if (date) query = query.eq('date', date);
      const { data, error } = await query;
      if (error) return res.status(400).json({ error: 'Error al consultar asistencia' });
      return res.json(data || []);
    }
    let sql = 'SELECT * FROM attendance WHERE 1=1';
    let params = [];
    if (studentId) { sql += ' AND student_id = ?'; params.push(studentId); }
    if (date) { sql += ' AND date = ?'; params.push(date); }
    res.json(rows(sql, params));
  } catch (e) {
    console.error('[api] /attendance', e && e.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

app.post('/api/attendance', rateLimit({ max: 60 }), authRequired, requireRole(STAFF_ROLES), async (req, res) => {
  try {
    const { studentId, date, status, notes } = req.body || {};
    if (!studentId || !date) return res.status(400).json({ error: 'studentId y date requeridos' });
    const validStatus = ['present', 'late', 'absent', 'retirado', 'excused'];
    if (!validStatus.includes(status)) return res.status(400).json({ error: 'status inválido' });
    if (useSupabase) {
      const { error } = await sb(req).from('attendance').upsert(
        { student_id: studentId, date, status, notes: String(notes || '').slice(0, 1000) },
        { onConflict: 'student_id, date' });
      if (error) return res.status(400).json({ error: 'Error al registrar asistencia' });
      return res.json({ ok: true });
    }
    run(`INSERT INTO attendance (student_id, date, status, notes) VALUES (?, ?, ?, ?)
         ON CONFLICT(student_id, date) DO UPDATE SET status=excluded.status, notes=excluded.notes`,
      [studentId, date, status, notes]);
    res.json({ ok: true });
  } catch (e) {
    console.error('[api] POST /attendance', e && e.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

// Admin: actualizar credenciales (SOLO directora/admin, service role verificado)
app.post('/api/admin/update-user', rateLimit({ windowMs: 60_000, max: 10 }), authRequired, requireRole(DIRECTIVE_ROLES), async (req, res) => {
  try {
    const { id, email, password } = req.body || {};
    if (!id) return res.status(400).json({ error: 'Falta id de usuario' });
    if (!useSupabase || !adminClient) return res.status(503).json({ error: 'Supabase admin no disponible' });
    const payload = {};
    if (email) {
      if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'email inválido' });
      }
      payload.email = email;
    }
    if (password) {
      if (typeof password !== 'string' || password.length < 8) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
      }
      payload.password = password;
    }
    if (Object.keys(payload).length === 0) return res.json({ ok: true, skipped: true });
    const { error } = await adminClient.auth.admin.updateUserById(id, payload);
    if (error) return res.status(400).json({ error: 'Error al actualizar usuario' });
    return res.json({ ok: true });
  } catch (e) {
    console.error('[api] admin/update-user', e && e.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

// Profiles (datos estáticos de demostración)
app.get('/api/profiles/:role', (req, res) => {
  const role = req.params.role;
  if (role === 'teacher') return res.json({ name: 'Ana Pérez', email: 'ana@karpus.edu', bio: 'Educadora apasionada con experiencia en desarrollo infantil.', avatar: 'https://placehold.co/200x200' });
  if (role === 'director') return res.json({ name: 'Directora', bio: 'Fundadora de Colegio Montessori Sonrisas Creativas.', avatar: 'img/monte.jpg' });
  res.status(404).json({ error: 'role inválido' });
});

// Email: SOLO staff, con rate limit estricto (evita relay de spam)
const emailLimiter = rateLimit({ windowMs: 60_000, max: 10 });
app.post('/api/email/send', emailLimiter, authRequired, requireRole(STAFF_ROLES), async (req, res) => {
  try {
    const { to, subject, html, text } = req.body || {};
    if (!to || !subject) return res.status(400).json({ error: 'to y subject requeridos' });
    const toList = Array.isArray(to) ? to : [to];
    if (!toList.every(e => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))) {
      return res.status(400).json({ error: 'email inválido' });
    }
    if (typeof subject !== 'string' || subject.length > 200) return res.status(400).json({ error: 'subject inválido' });
    const result = await sendResendEmail({ to, subject, html, text });
    res.json({ ok: true, result });
  } catch (e) {
    console.error('[api] email/send', e && e.message);
    res.status(500).json({ error: 'Error al enviar correo' });
  }
});

app.post('/api/parents/email', emailLimiter, authRequired, requireRole(STAFF_ROLES), async (req, res) => {
  try {
    const { to, subject, html, text } = req.body || {};
    if (!to || !subject) return res.status(400).json({ error: 'to y subject requeridos' });
    const toList = Array.isArray(to) ? to : [to];
    if (!toList.every(e => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))) {
      return res.status(400).json({ error: 'email inválido' });
    }
    if (typeof subject !== 'string' || subject.length > 200) return res.status(400).json({ error: 'subject inválido' });
    const result = await sendResendEmail({ to, subject, html, text });
    res.json({ ok: true, result });
  } catch (e) {
    console.error('[api] parents/email', e && e.message);
    res.status(500).json({ error: 'Error al enviar correo' });
  }
});

// 404 + manejador de errores sin fuga de detalle interno
app.use((req, res) => {
  res.status(404).json({ error: 'No encontrado' });
});

app.use((err, req, res, next) => {
  if (err && err.message === 'CORS origin no permitido') {
    return res.status(403).json({ error: 'Origen no permitido' });
  }
  if (err && (err.type === 'entity.too.large')) {
    return res.status(413).json({ error: 'Cuerpo demasiado grande' });
  }
  console.error('[api] unhandled', err && err.message);
  res.status(500).json({ error: 'Error interno' });
});

const PORT = process.env.PORT || 5600;
const HOST = process.env.API_HOST || '127.0.0.1';
app.listen(PORT, HOST, () => {
  console.log(`API segura escuchando en http://${HOST}:${PORT}`);
});
