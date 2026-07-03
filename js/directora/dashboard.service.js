/**
 * 🎯 DASHBOARD SERVICE — Sincronización centralizada de datos
 * 
 * Responsabilidad: Orquestar carga de TODOS los datos del dashboard
 * en paralelo desde Supabase con RPC, para evitar múltiples queries.
 */

import { supabase } from '../shared/supabase.js';
import { DirectorApi } from './api.js';
import { AppState } from './state.js';

export const DashboardService = {
  // Control de carga para evitar race conditions
  isLoading: false,
  lastFetch: null,
  CACHE_TTL: 5 * 60 * 1000, // 5 minutos de caché
  channels: [], // Para limpiar subscripciones realtime
  listeners: [], // 🔔 Lista de funciones a avisar cuando haya cambios

  async getFullData(refresh = false) {
    if (!refresh && AppState.get('dashboardData')) return AppState.get('dashboardData');

    try {
      const d = new Date();
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      // Queries directas en paralelo — no dependen de RPC
      const [studentsRes, teachersRes, classroomsRes, attendanceRes, pendingPaymentsData] = await Promise.allSettled([
        supabase.from('students').select('id').is('deleted_at', null).limit(2000),
        supabase.from('profiles').select('id').in('role', ['maestra', 'asistente', 'admin']).limit(200),
        supabase.from('classrooms').select('id').limit(200),
        supabase.from('attendance').select('status').eq('date', today).limit(1000),
        supabase.from('payments').select('amount, status').in('status', ['pending', 'overdue', 'review']).limit(1000)
      ]);

      const safe = (r) => r.status === 'fulfilled' ? r.value : { count: 0, data: [] };
      const [stu, tea, cls, att, pay] = [studentsRes, teachersRes, classroomsRes, attendanceRes, pendingPaymentsData].map(safe);

      const stuCount = (stu.data?.length) ?? stu.count ?? 0;
      const teaCount = (tea.data?.length) ?? tea.count ?? 0;
      const clsCount = (cls.data?.length) ?? cls.count ?? 0;

      const attData = att.data || [];
      const presentCount = attData.filter(a => ['present','presente','late','tarde'].includes((a.status||'').toLowerCase())).length;
      const totalPending  = (pay.data || []).reduce((s, p) => s + Number(p.amount || 0), 0);

      // Intentar RPC como enriquecimiento opcional (no bloquea)
      let rpcKpis = {};
      try {
        const { data, error } = await supabase.rpc('get_dashboard_kpis');
        if (!error && data) rpcKpis = data;
      } catch (_) {}

      const dashboardData = {
        stats: {
          students:        rpcKpis.total      || stuCount,
          active:          rpcKpis.active     || stuCount,
          teachers:        rpcKpis.teachers   || teaCount,
          classrooms:      rpcKpis.classrooms || clsCount,
          present:         rpcKpis.attendance_today ?? presentCount,
          attendance:      rpcKpis.attendance_pct   || 0,
          pendingInquiries: rpcKpis.inquiries || 0,
          pending_amount:  totalPending,
          pending_payments: totalPending,
        },
        recentInquiries: []
      };

      // Inquiries por separado (no crítico)
      try {
        const { data: inq } = await supabase.from('inquiries').select('id,status,title,created_at').eq('status','pending').limit(5);
        dashboardData.recentInquiries = inq || [];
        dashboardData.stats.pendingInquiries = inq?.length || rpcKpis.inquiries || 0;
      } catch (_) {}

      AppState.set('dashboardData', dashboardData);
      return dashboardData;
    } catch (e) {
      console.error('[DashboardService] Error:', e);
      // Retornar estructura vacía válida en lugar de null para que la UI no quede en blanco
      return {
        stats: { students: 0, active: 0, teachers: 0, classrooms: 0, present: 0, attendance: 0, pendingInquiries: 0, pending_amount: 0, pending_payments: 0 },
        recentInquiries: []
      };
    }
  },

  /**
   * Estado vacío seguro para fallbacks
   */
  getEmptyState() {
    return {
      kpis: {},
      students: { recent: [], total: 0, active: 0 },
      classrooms: [],
      payments: { pending: [], summary: {} },
      inquiries: { active: [], count: 0 },
      attendance: {
        today: { present: 0, late: 0, absent: 0, total: 0 },
        trend7days: {}
      }
    };
  },

  /**
   * Invalidar caché forzando recarga
   */
  invalidateCache() {
    this.lastFetch = null;
    AppState.set('dashboardData', null); // Limpiar estado global para forzar skeletons si es necesario
    this.notifyListeners(); // 🔔 Avisar a la UI que debe recargar
  },

  /**
   * Escuchar cambios en tiempo real
   */
  subscribeToChanges() {
    this.cleanupRealtime();

    // Debounce: batch multiple rapid changes into a single refresh (max 1 per 10s)
    let debounceTimer = null;
    const debouncedInvalidate = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        this.invalidateCache();
        this.notifyListeners();
      }, 10_000); // 10 second debounce — prevents CPU spike on mass QR punches
    };

    const tables = ['attendance', 'payments', 'students'];
    tables.forEach(table => {
      const channel = supabase
        .channel(`${table}_changes`)
        .on('postgres_changes', { event: '*', schema: 'public', table }, debouncedInvalidate)
        .subscribe();
      this.channels.push(channel);
    });
  },

  /**
   * Limpiar subscripciones realtime para evitar duplicados
   */
  cleanupRealtime() {
    this.channels?.forEach(ch => supabase.removeChannel(ch));
    this.channels = [];
    this.listeners = []; // Limpiar oyentes
  },

  /**
   * 🔔 Permite a main.js suscribirse a actualizaciones automáticas
   * @param {Function} callback Función a ejecutar cuando cambian los datos
   */
  onUpdate(callback) {
    this.listeners.push(callback);
  },

  /**
   * 🔔 Ejecuta todos los callbacks registrados
   */
  async notifyListeners() {
    // Opcional: Recargar los datos automáticamente antes de avisar
    // const newData = await this.getFullData(true); 
    
    // Avisar a los suscriptores (main.js)
    this.listeners.forEach(callback => callback());
  }
};

