/**
 * 🎯 DASHBOARD SERVICE — Sincronización centralizada de datos
 * 
 * Responsabilidad: Orquestar carga de TODOS los datos del dashboard
 * en paralelo desde Supabase con RPC, para evitar múltiples queries.
 */

import { supabase } from '../shared/supabase.js';
import { countRowsSafe } from '../shared/db-utils.js';
import { DirectorApi } from './api.js';
import { AppState } from './state.js';

export const DashboardService = {
  // Control de carga para evitar race conditions
  isLoading: false,
  lastFetch: null,
  CACHE_TTL: 5 * 60 * 1000, // 5 minutos de caché
  channels: [], // Para limpiar subscripciones realtime
  listeners: [], // 🔔 Lista de funciones a avisar cuando haya cambios
  // 🛡️ Tablas/opciones que fallaron con 400/404 irrecuperable en esta sesión
  // Si una tabla está aquí, NO se vuelve a consultar = 0 peticiones HTTP repetidas
  _brokenTables: new Set(),
  _isBroken(table) { return this._brokenTables.has(table); },
  _markBroken(table) { this._brokenTables.add(table); },
  _isUnrecoverableDbError(err) {
    if (!err) return false;
    const code = String(err.code || err.status || '');
    const msg = String(err.message || '').toLowerCase();
    if (['404', '400', '42P01'].includes(code)) return true;
    if (['does not exist', 'relation', 'column', 'unrecognized'].some(k => msg.includes(k))) return true;
    return false;
  },

  async getFullData(refresh = false) {
    // Solo reutilizar caché si tiene la forma correcta ({ stats: {...} })
    const cached = AppState.get('dashboardData');
    if (!refresh && cached?.stats) return cached;

    try {
      const d = new Date();
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

      // Queries directas en paralelo — no dependen de RPC.
      // Los conteos usan countRowsSafe: lee el count real de la BD y cae
      // sin el filtro deleted_at si la columna no existe en el esquema.
      const [stuCount, actCount, teaRes, clsCount, attendanceRes, attendance30Res] = await Promise.allSettled([
        countRowsSafe('students'),
        countRowsSafe('students', { is_active: true }),
        supabase.from('profiles').select('id').in('role', ['maestra', 'asistente', 'admin']).limit(200),
        countRowsSafe('classrooms'),
        supabase.from('attendance').select('status').eq('date', today).limit(1000),
        supabase.from('attendance').select('date,status').gte('date', monthAgo).lt('date', today).limit(5000)
      ]);

      // allSettled -> valor (para los conteos numéricos) o {data} para queries raw
      const val = (r) => (r.status === 'fulfilled' ? r.value : null);
      const studentsCount = val(stuCount) || 0;
      const activeCount   = val(actCount) || 0;
      const teaData       = (val(teaRes)?.data) || [];
      const classroomsCount = val(clsCount) || 0;
      const attRes        = val(attendanceRes);
      const att30Res      = val(attendance30Res);
      const attData       = (attRes?.data) || [];

      const presentCount = attData.filter(a => ['present','presente','late','tarde'].includes((a.status||'').toLowerCase())).length;
      const totalPending = 0;

      // Asistencia promedio: tasa diaria promedio de los últimos 30 días
      const byDay = {};
      for (const a of (att30Res?.data || [])) {
        if (!byDay[a.date]) byDay[a.date] = { present: 0, total: 0 };
        byDay[a.date].total++;
        if (['present','presente','late','tarde'].includes((a.status||'').toLowerCase())) byDay[a.date].present++;
      }
      const dayRates = Object.values(byDay).map(x => x.total > 0 ? (x.present / x.total) * 100 : 0);
      const avgAttendance = dayRates.length ? Math.round(dayRates.reduce((a, b) => a + b, 0) / dayRates.length) : 0;

      // Intentar RPC como enriquecimiento opcional (no bloquea)
      let rpcKpis = {};
      try {
        const { data, error } = await supabase.rpc('get_dashboard_kpis');
        if (!error && data) rpcKpis = data;
      } catch (_) {}

      const dashboardData = {
        stats: {
          students:         studentsCount || rpcKpis.total || 0,
          active:           activeCount || rpcKpis.active || 0,
          teachers:         teaData.length || rpcKpis.teachers || 0,
          classrooms:       classroomsCount || rpcKpis.classrooms || 0,
          present:          presentCount || rpcKpis.attendance_today || 0,
          attendance:       avgAttendance || rpcKpis.attendance_pct || 0,
          pendingInquiries: rpcKpis.inquiries || 0,
          pending_amount:   totalPending,
          pending_payments: totalPending,
        },
        recentInquiries: []
      };

      // Inquiries por separado (no crítico). 🛡️ Guard: si falló una vez, no repetir HTTP.
      if (!this._isBroken('inquiries')) {
        try {
          const { data: inq, error } = await supabase.from('inquiries').select('id,status,subject,created_at').eq('status','pending').limit(5);
          if (this._isUnrecoverableDbError(error)) { this._markBroken('inquiries'); }
          dashboardData.recentInquiries = inq || [];
          dashboardData.stats.pendingInquiries = inq?.length || rpcKpis.inquiries || 0;
        } catch (err) {
          if (this._isUnrecoverableDbError(err)) this._markBroken('inquiries');
        }
      }

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

