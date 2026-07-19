import { SafeAppState } from '../shared/state.js';

/**
 * Estado específico para el panel de Maestra
 */
export const AppState = new SafeAppState({
  user: null,
  profile: null,
  classroom: null,
  currentSection: 'dashboard',
  students: [],
  attendance: [],
  posts: [],
  tasks: []
});

/** Hoy en formato YYYY-MM-DD (DRY: reemplaza `new Date().toISOString().split('T')[0]`) */
AppState.today = function () {
  return new Date().toISOString().split('T')[0];
};

/** Alias rápido para obtener estudiantes del aula */
AppState.getStudents = function () {
  return AppState.get('students') || [];
};

/** Alias rápido para obtener el aula actual */
AppState.getClassroom = function () {
  return AppState.get('classroom');
};
