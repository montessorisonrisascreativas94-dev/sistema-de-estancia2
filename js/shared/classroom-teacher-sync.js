import { supabase } from './supabase.js';
import {
  findCanonicalClassroom,
  findSpecialClassroom,
  sanitizeClassroomDisplayName,
} from './constants.js';

function _groupKey(row) {
  if (!row) return '';
  const name = sanitizeClassroomDisplayName(row.name || '');
  const level = sanitizeClassroomDisplayName(row.level || '');
  const canon = findCanonicalClassroom(level || name);
  if (canon) return `canon:${canon.id}`;
  const special = findSpecialClassroom(name) || findSpecialClassroom(level);
  if (special) return `spec:${special.key}`;
  return `custom:${name.trim().toLowerCase()}__${level.trim().toLowerCase()}`;
}

async function _groupRows(room) {
  const key = _groupKey(room);
  if (!key) return [];

  let { data, error } = await supabase
    .from('classrooms')
    .select('id, name, level, teacher_id')
    .is('deleted_at', null);

  if (error && /deleted_at|column/i.test(error.message || '')) {
    ({ data, error } = await supabase
      .from('classrooms')
      .select('id, name, level, teacher_id'));
  }
  if (error) throw error;
  return (data || []).filter((row) => _groupKey(row) === key);
}

export async function getClassroomGroupTeacher(room) {
  try {
    const rows = await _groupRows(room);
    const withTeacher = rows.find((row) => row.teacher_id);
    return withTeacher?.teacher_id || null;
  } catch (_) {
    return room?.teacher_id || null;
  }
}

export async function applyClassroomGroupTeacher(room, teacherId) {
  const rows = await _groupRows(room);
  const ids = rows
    .map((row) => parseInt(row.id, 10))
    .filter((id) => Number.isInteger(id));
  if (!ids.length) return;

  const target = teacherId ? String(teacherId) : null;
  const { error } = await supabase
    .from('classrooms')
    .update({ teacher_id: target })
    .in('id', ids);
  if (error) throw error;
}

export function notifyClassroomUpdated() {
  try {
    window.dispatchEvent(new CustomEvent('karpus:classroom-updated'));
  } catch (_) {}
}
