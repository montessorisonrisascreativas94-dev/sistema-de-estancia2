/**
 * MODULO DE EVENTOS ULTRA-RÁPIDOS KARPUS KIDS
 */
import { supabase } from '../shared/supabase.js';
import { Helpers } from '../shared/helpers.js';

export const KarpusEvents = {
  state: {
    currentClassroomId: null,
    selectedStudents: [],
    lastUndo: null,
    undoTimer: null,
    napSessions: new Map() // key: studentId, value: napId
  },

  async init(classroomId) {
    this.state.currentClassroomId = classroomId;

    // Obtener lista de estudiantes
    await this.loadStudents();
    // Cargar nap sessions abiertas
    await this.loadOpenNaps();
    // Cargar rutina favorita del aula
    await this.loadRoutine();
  },

  async loadStudents() {
    const { data } = await supabase
      .from('students')
      .select('id, first_name, last_name, classroom_id')
      .eq('classroom_id', this.state.currentClassroomId)
      .eq('is_active', true)
      .order('last_name');
    this.state.selectedStudents = (data || []).map(s => ({ id: s.id, name: `${s.first_name} ${s.last_name}`, selected: true }));
  },

  async loadOpenNaps() {
    const { data } = await supabase
      .from('nap_sessions')
      .select('id, student_id')
      .eq('classroom_id', this.state.currentClassroomId)
      .is('nap_end', null);
    (data || []).forEach(nap => {
      this.state.napSessions.set(nap.student_id, nap.id);
    });
  },

  async loadRoutine() {
    const { data } = await supabase
      .from('classroom_routines')
      .select('event_type')
      .eq('classroom_id', this.state.currentClassroomId)
      .eq('is_favorite', true)
      .order('priority');
    return data || [];
  },

  async recordEvent(eventType, options = {}) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      Helpers.toast('Por favor inicia sesión', 'error');
      return;
    }

    try {
      // 1. Crear evento principal (hora viene de trigger en DB!)
      const { data: eventData, error: eventError } = await supabase
        .from('classroom_events')
        .insert({
          classroom_id: this.state.currentClassroomId,
          teacher_id: user.id,
          event_type: eventType,
          event_date: new Date().toISOString().split('T')[0]
        })
        .select()
        .single();

      if (eventError) throw eventError;

      // 2. Agregar participantes
      const participants = this.state.selectedStudents.filter(s => s.selected);
      const inserts = participants.map(s => ({
        event_id: eventData.id,
        student_id: s.id,
        status: 'present',
        extra_data: options.extraData || null
      }));

      const { error: partError } = await supabase.from('event_participants').insert(inserts);
      if (partError) throw partError;

      // 3. Si es un evento especial
      if (eventType === 'dormir') {
        await this.startNapParticipants(participants.map(p => p.student_id), user.id, eventData.id);
      } else if (eventType === 'despertar') {
        await this.endNapParticipants(participants.map(p => p.student_id));
      }

      // 4. Guardar para deshacer
      this.state.lastUndo = eventData.id;
      this.showUndoButton(eventType);

      Helpers.toast(`${this.getEventTitle(eventType)} registrado ✔️`, 'success');
    } catch (err) {
      console.error(err);
      Helpers.toast('Error al registrar evento', 'error');
    }
  },

  async startNapParticipants(studentIds, teacherId, eventId) {
    const inserts = studentIds.map(sid => ({
      student_id: sid,
      classroom_id: this.state.currentClassroomId,
      teacher_id: teacherId,
      nap_start: new Date().toISOString()
    }));

    const { data, error } = await supabase
      .from('nap_sessions')
      .insert(inserts)
      .select('id, student_id');

    if (!error && data) {
      data.forEach(n => this.state.napSessions.set(n.student_id, n.id));
    }
  },

  async endNapParticipants(studentIds) {
    const promises = studentIds.map(sid => {
      const napId = this.state.napSessions.get(sid);
      if (napId) {
        this.state.napSessions.delete(sid);
        return supabase
          .from('nap_sessions')
          .update({ nap_end: new Date().toISOString() })
          .eq('id', napId);
      }
    });
    await Promise.allSettled(promises);
  },

  async undoEvent() {
    if (!this.state.lastUndo) return;
    clearTimeout(this.state.undoTimer);

    try {
      await supabase.from('classroom_events').delete().eq('id', this.state.lastUndo);
      Helpers.toast('Evento deshecho', 'success');
      this.state.lastUndo = null;
      this.hideUndoButton();
    } catch (err) {
      console.error(err);
      Helpers.toast('Error al deshacer', 'error');
    }
  },

  showUndoButton(eventType) {
    this.hideUndoButton(); // Borrar existente

    const container = document.createElement('div');
    container.id = 'undo-container';
    container.style.position = 'fixed';
    container.style.bottom = '24px';
    container.style.left = '50%';
    container.style.transform = 'translateX(-50%)';
    container.style.background = 'white';
    container.style.boxShadow = '0 10px 40px rgba(0,0,0,0.15)';
    container.style.borderRadius = '50px';
    container.style.padding = '12px 20px';
    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.style.gap = '12px';
    container.style.zIndex = '99999';
    container.style.animation = 'fadeInUp 0.3s ease-out';

    container.innerHTML = `
      <span style="color: #28B54D; font-weight: 800; display: flex; align-items: center; gap: 6px;">
        <i data-lucide="check-circle"></i> ${this.getEventTitle(eventType)} registrado
      </span>
      <button id="undo-btn" style="background: #0B63C7; color: white; border: none; padding: 8px 16px; border-radius: 30px; font-weight: 700; cursor: pointer;">
        DESHACER
      </button>
      <span id="undo-timer" style="color: #94A3B8; font-size: 12px; font-weight: 600;">10s</span>
    `;

    document.body.appendChild(container);

    // Cargar íconos
    if (window.lucide) {
      lucide.createIcons();
    }

    // Event listeners
    document.getElementById('undo-btn').addEventListener('click', () => KarpusEvents.undoEvent());

    // Timer para ocultar
    let timeLeft = 10;
    this.state.undoTimer = setInterval(() => {
      timeLeft--;
      document.getElementById('undo-timer').textContent = `${timeLeft}s`;
      if (timeLeft <= 0) {
        this.hideUndoButton();
      }
    }, 1000);
  },

  hideUndoButton() {
    const existing = document.getElementById('undo-container');
    if (existing) existing.remove();
    if (this.state.undoTimer) {
      clearInterval(this.state.undoTimer);
      this.state.undoTimer = null;
    }
  },

  getEventTitle(type) {
    const titles = {
      desayuno: 'Desayuno',
      merienda: 'Merienda',
      almuerzo: 'Almuerzo',
      biberon: 'Biberón',
      dormir: 'Siesta',
      despertar: 'Despertó',
      panal: 'Cambio de pañal',
      bano: 'Baño',
      temperatura: 'Temperatura',
      medicamento: 'Medicamento',
      foto: 'Foto',
      nota: 'Nota'
    };
    return titles[type] || type;
  },

  getEventEmoji(type) {
    const emojis = {
      desayuno: '🍞',
      merienda: '🍎',
      almuerzo: '🥗',
      biberon: '🍼',
      dormir: '😴',
      despertar: '😊',
      panal: '🚼',
      bano: '🚽',
      temperatura: '🌡',
      medicamento: '💊',
      foto: '📷',
      nota: '📝'
    };
    return emojis[type] || '📋';
  },

  checkSmartSuggestions() {
    const now = new Date();
    const hour = now.getHours();
    const suggestions = [];

    // Si hay siestas abiertas >3h
    const { data: openNaps } = supabase
      .from('nap_sessions')
      .select('id, student_id, nap_start')
      .eq('classroom_id', this.state.currentClassroomId)
      .is('nap_end', null);

    return suggestions;
  }
};

window.KarpusEvents = KarpusEvents;
