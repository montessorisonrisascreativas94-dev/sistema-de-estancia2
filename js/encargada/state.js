import { SafeAppState } from '../shared/state.js';

function createInitialState() {
  return {
    user: null,
    profile: null,
    currentSection: 'dashboard',

    dashboardData: {
      kpis: {
        totalTeachers: 0,
        activeTeachers: 0,
        activeClassrooms: 0,
        totalChildren: 0,
        teacherAttendance: 0,
        efficiencyIndex: 0,
        institutionalAverage: 0,
        dailyCompliance: 0,
        weeklyCompliance: 0,
        monthlyCompliance: 0
      }
    },

    teachers: {
      all: [],
      selected: null
    },

    parentReviews: {
      all: [],
      filters: { teacher: '', month: '' }
    },

    permits: {
      all: [],
      filters: { date: '', classroom: '', teacher: '', status: '' }
    },

    chat: {
      contacts: [],
      selectedUser: null,
      messages: [],
      unreadCount: 0
    },

    compliance: {
      daily: [],
      weekly: [],
      monthly: [],
      annual: []
    },

    routines: {
      all: [],
      selectedDate: new Date().toISOString().split('T')[0]
    },

    tasks: {
      all: [],
      filters: { teacher: '', classroom: '', status: '' }
    },

    classroomComparison: {
      all: []
    },

    alerts: {
      all: []
    },

    stats: {
      efficiency: [],
      performance: [],
      satisfaction: []
    }
  };
}

export const AppState = new SafeAppState(createInitialState(), {
  persistenceKey: 'karpus_encargada_state'
});

export function resetAppState() {
  AppState.setState(createInitialState());
}
