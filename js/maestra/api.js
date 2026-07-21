import { supabase } from '../shared/supabase.js';
import { TABLES } from '../shared/constants.js';

function handleError(error) {
  if (error) throw error;
}

const _cache = new Map();
function _cacheKey(method, ...args) { return `${method}:${args.join(':')}`; }
function _getCache(method, ...args) {
  const entry = _cache.get(_cacheKey(method, ...args));
  if (entry && Date.now() - entry.ts < entry.ttl) return entry.data;
  _cache.delete(_cacheKey(method, ...args));
  return undefined;
}
function _setCache(method, data, ttl = 30000, ...args) {
  _cache.set(_cacheKey(method, ...args), { data, ts: Date.now(), ttl });
}
export function invalidateCache(pattern) {
  if (!pattern) { _cache.clear(); return; }
  for (const key of _cache.keys()) {
    if (key.includes(pattern)) _cache.delete(key);
  }
}

export const MaestraApi = {

  async getStudentsByClassroom(classroomId) {
    const cached = _getCache('getStudents', classroomId);
    if (cached) return cached;

    const { data, error } = await supabase
      .from(TABLES.STUDENTS)
      .select('id, name, avatar_url, matricula, allergies, blood_type, p1_name, p1_phone, p1_email, parent_id, age, age_type')
      .eq('classroom_id', classroomId)
      .eq('is_active', true)
      .order('name');

    handleError(error);
    const result = data || [];
    _setCache('getStudents', result, 60000, classroomId);
    return result;
  },

  async getAttendance(classroomId, date) {
    const cached = _getCache('getAttendance', classroomId, date);
    if (cached) return cached;

    const { data, error } = await supabase
      .from(TABLES.ATTENDANCE)
      .select('id, student_id, status, check_in, check_out, date')
      .eq('classroom_id', classroomId)
      .eq('date', date);

    handleError(error);
    const result = data || [];
    _setCache('getAttendance', result, 30000, classroomId, date);
    return result;
  },

  async upsertAttendance(record) {
    const { data: existing, error: findError } = await supabase
      .from(TABLES.ATTENDANCE)
      .select('id')
      .eq('student_id', record.student_id)
      .eq('date', record.date)
      .maybeSingle();

    handleError(findError);

    const query = existing
      ? supabase
          .from(TABLES.ATTENDANCE)
          .update(record)
          .eq('id', existing.id)
      : supabase
          .from(TABLES.ATTENDANCE)
          .insert([record]);

    const { data, error } = await query.select().maybeSingle();

    handleError(error);
    invalidateCache('getAttendance');
    return data;
  },

  async getTasksByClassroom(classroomId) {
    const { data, error } = await supabase
      .from('tasks')
      .select('id, title, description, due_date, grading_system, file_url, created_at, period_id')
      .eq('classroom_id', classroomId)
      .order('created_at', { ascending: false })
      .limit(50);

    handleError(error);
    return data || [];
  },

  async getDailyRoutine(classroomId) {
    const cached = _getCache('getDailyRoutine', classroomId);
    if (cached) return cached;

    const { data, error } = await supabase
      .from('daily_logs')
      .select('id, student_id, date, mood, food, nap, eating, sleeping, activities, notes, infant_data, status, created_at')
      .eq('classroom_id', classroomId)
      .order('created_at', { ascending: false })
      .limit(50);

    handleError(error);
    const result = data || [];
    _setCache('getDailyRoutine', result, 15000, classroomId);
    return result;
  },

  async upsertDailyLog(payload) {
    const cleanPayload = { ...payload };
    if (!cleanPayload.status) cleanPayload.status = 'published';

    const { data: existing, error: findError } = await supabase
      .from('daily_logs')
      .select('id, infant_data')
      .eq('student_id', cleanPayload.student_id)
      .eq('date', cleanPayload.date)
      .maybeSingle();

    handleError(findError);

    if (cleanPayload.infant_event) {
      const newEvent = cleanPayload.infant_event;
      delete cleanPayload.infant_event;

      const currentInfantData = existing?.infant_data || [];
      const updatedInfantData = [...currentInfantData, {
        ...newEvent,
        id: crypto.randomUUID?.() || Math.random().toString(36).substr(2, 9),
        created_at: new Date().toISOString()
      }];

      cleanPayload.infant_data = updatedInfantData;
    }

    const query = existing
      ? supabase
          .from('daily_logs')
          .update(cleanPayload)
          .eq('id', existing.id)
      : supabase
          .from('daily_logs')
          .insert([cleanPayload]);

    const { data, error } = await query.select().maybeSingle();

    handleError(error);
    invalidateCache('getDailyRoutine');
    return data;
  },

  async publishDailyLogs(logIds) {
    if (!logIds || !logIds.length) return;
    const { data, error } = await supabase
      .from('daily_logs')
      .update({ status: 'published' })
      .in('id', logIds);

    handleError(error);
    invalidateCache('getDailyRoutine');
    return data;
  },

  async createTask(payload) {
    const cleanPayload = {
      ...payload,
      grading_system: 'numeric'
    };
    delete cleanPayload.points;

    const { data, error } = await supabase
      .from('tasks')
      .insert([cleanPayload])
      .select()
      .maybeSingle();

    handleError(error);
    return data;
  },

  async updateTask(taskId, payload) {
    const { data, error } = await supabase
      .from('tasks')
      .update(payload)
      .eq('id', taskId)
      .select()
      .single();

    handleError(error);
    return data;
  },

  async deleteTask(taskId) {
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', taskId);

    handleError(error);
    return { success: !error };
  },

  async gradeTask(taskId, studentId, gradeLetter, stars, feedback, numericScore = null) {
    if (!taskId || !studentId) throw new Error('Task ID and Student ID are required');

    const starsVal   = parseInt(stars) || null;
    const validStars = (starsVal && starsVal >= 1 && starsVal <= 5) ? starsVal : null;
    const validNumeric = (numericScore !== null && numericScore !== undefined && !isNaN(numericScore) && numericScore >= 0 && numericScore <=100) ? numericScore : null;

    const updates = {
      grade_letter: gradeLetter || null,
      stars:        validStars,
      numeric_score: validNumeric,
      comment:      feedback || null,
      status:       'graded'
    };

    const { data: existing } = await supabase
      .from('task_evidences')
      .select('id')
      .eq('task_id', taskId)
      .eq('student_id', studentId)
      .maybeSingle();

    let result;
    if (existing?.id) {
      result = await supabase
        .from('task_evidences')
        .update(updates)
        .eq('id', existing.id)
        .select('id, grade_letter, stars, numeric_score, status')
        .maybeSingle();
    } else {
      result = await supabase
        .from('task_evidences')
        .insert({ task_id: taskId, student_id: studentId, ...updates })
        .select('id, grade_letter, stars, numeric_score, status')
        .maybeSingle();
    }

    handleError(result.error);
    return result.data;
  },

  async registerIncident(payload) {
    const { data, error } = await supabase
      .from('incidents')
      .insert({
        student_id: payload.student_id,
        classroom_id: payload.classroom_id,
        teacher_id: payload.teacher_id,
        severity: payload.severity,
        description: payload.description
      })
      .select()
      .maybeSingle();

    handleError(error);
    return data;
  }
};
