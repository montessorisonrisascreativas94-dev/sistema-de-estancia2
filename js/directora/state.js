import { SafeAppState } from '../shared/state.js';

/**
 * ?? FACTORY PARA ESTADO INICIAL
 * (Evita bugs con fechas y referencias)
 */
function createInitialState() {
  return {
    // ?? Autenticación
    user: null,
    profile: null,

    // ?? Navegación
    currentSection: 'dashboard',

    // ?? DASHBOARD
    // Valor real lo provee DashboardService.getFullData() con la forma { stats: {...} }.
    // Se inicia en null para que las tarjetas KPI no lean un estado legacy vacío.
    dashboardData: null,

    // ?? ESTADÍSTICAS
    stats: {},

    // ????? ESTUDIANTES
    students: {
      all: [],
      selected: null,
      filters: {
        search: '',
        classroom: '',
        status: 'all'
      }
    },

    // ?? AULAS
    classrooms: {
      all: [],
      selected: null
    },

    // ????? MAESTROS
    teachers: {
      all: [],
      selected: null
    },

    // ?? PAGOS
    payments: {
      all: [],
      filters: {
        status: 'all',
        year: new Date().getFullYear(), // OK aquí (factory)
        search: ''
      },
      selected: null
    },

    // ?? ASISTENCIA
    attendance: {
      entries: [],
      selectedDate: new Date().toISOString().split('T')[0], // OK aquí
      stats: {
        present: 0,
        absent: 0,
        late: 0
      }
    },

    // ?? REPORTES
    inquiries: {
      all: [],
      filters: {
        status: 'all'
      },
      selected: null
    },

    // ?? CHAT
    chat: {
      contacts: [],
      selectedUser: null,
      messages: [],
      unreadCount: 0
    },

    // ?? MURO
    wall: {
      posts: [],
      page: 1,
      hasMore: true // ?? útil para paginación real
    }
  };
}

/**
 * ?? INSTANCIA GLOBAL
 */
export const AppState = new SafeAppState(createInitialState(), { 
  persistenceKey: 'karpus_directora_state' 
});

/**
 * ?? RESET COMPLETO (CLAVE para logout)
 */
export function resetAppState() {
  AppState.setState(createInitialState());
}
