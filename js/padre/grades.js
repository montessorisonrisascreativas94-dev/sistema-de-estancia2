import { supabase } from '../shared/supabase.js';
import { AppState, TABLES } from './appState.js';
import { Helpers, escapeHtml } from '../shared/helpers.js';

/**
 * 🎓 MÓDULO DE CALIFICACIONES (PADRES)
 */
export const GradesModule = {
  _channel: null,

  /**
   * Inicializa el módulo
   */
  async init(studentId) {
    if (!studentId) return;
    await this.loadGrades(studentId);
    this._subscribeRealtime(studentId);
  },

  /**
   * Realtime: reload grades when report_cards change
   */
  _subscribeRealtime(studentId) {
    if (this._channel) { try { supabase.removeChannel(this._channel); } catch (_) {} }
    this._channel = supabase
      .channel('padre_grades_' + studentId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'report_cards', filter: `student_id=eq.${studentId}` }, () => {
        this.loadGrades(studentId);
      })
      .subscribe();
  },

  /**
   * Carga calificaciones y evidencias
   */
  async loadGrades(studentId) {
    const container = document.getElementById('gradesContent');
    if (!container) return;

    container.innerHTML = Helpers.skeleton(3, 'h-24');

    try {
      const [gradesRes, taskRes, historyRes] = await Promise.all([
        supabase
          .from(TABLES.GRADES)
          .select('id, subject, numeric_score, score, notes, created_at, period_id')
          .eq('student_id', studentId)
          .order('created_at', { ascending: false }),
        supabase
          .from(TABLES.TASK_EVIDENCES)
          .select(`*, tasks:task_id (title, description)`)
          .eq('student_id', studentId)
          .not('numeric_score', 'is', null)
          .order('created_at', { ascending: false }),
        supabase.rpc('get_student_history', { p_student_id: studentId })
      ]);

      if (gradesRes.error) throw gradesRes.error;
      if (taskRes.error) throw taskRes.error;

      const grades = gradesRes.data || [];
      const taskEvidences = taskRes.data || [];
      const history = historyRes.data || [];

      if (grades.length === 0 && taskEvidences.length === 0 && history.length === 0) {
        container.innerHTML = Helpers.emptyState('No hay registros académicos aún.', '🏆');
        return;
      }

      const gpa = this.calculateGPA(grades, taskEvidences);
      const { label: gpaLabel, color: gpaLabelColor } = this.getGPALabel(gpa);

      const historyRows = history.length > 0 ? history.map(h => {
        const score = h.final_score != null ? Number(h.final_score).toFixed(1) : '-';
        const levelCls = {
          'Excelente':      'bg-emerald-100 text-emerald-700',
          'Muy Bueno':      'bg-green-100 text-green-700',
          'Bueno':          'bg-blue-100 text-blue-700',
          'Aceptable':      'bg-amber-100 text-amber-700',
          'Requiere Mejoras': 'bg-orange-100 text-orange-700',
          'Bajo Desempeño': 'bg-rose-100 text-rose-700',
          'Sin calificar':  'bg-slate-100 text-slate-500'
        }[h.level] || 'bg-slate-100 text-slate-500';

        return `
          <tr class="border-b border-slate-50 hover:bg-slate-50 transition-colors">
            <td class="px-4 py-3 text-xs font-bold text-slate-500">${escapeHtml(h.school_year_name || '')}</td>
            <td class="px-4 py-3 text-sm font-bold text-slate-800">${escapeHtml(h.period_name)}</td>
            <td class="px-4 py-3 text-xs text-slate-500">${escapeHtml(h.classroom_name || '-')}</td>
            <td class="px-4 py-3 text-center text-sm font-bold">${h.task_avg != null ? Number(h.task_avg).toFixed(1) : '-'}</td>
            <td class="px-4 py-3 text-center text-sm font-bold">${h.formal_avg != null ? Number(h.formal_avg).toFixed(1) : '-'}</td>
            <td class="px-4 py-3 text-center">
              <span class="text-base font-black ${score !== '-' ? 'text-[#0850A0]' : 'text-slate-400'}">${score}</span>
            </td>
            <td class="px-4 py-3 text-center">
              <span class="px-2 py-1 rounded-full text-[10px] font-black uppercase ${levelCls}">${h.level || '-'}</span>
            </td>
            <td class="px-4 py-3 text-xs text-slate-400 max-w-[160px] truncate">${escapeHtml(h.teacher_comment || '-')}</td>
          </tr>`;
      }).join('') : '';

      container.innerHTML = `
        <div class="w-full space-y-8 animate-fade-in">
          <!-- Dashboard de Rendimiento -->
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Stats Rápidas -->
            <div class="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="bg-gradient-to-br from-emerald-500 to-green-600 p-6 rounded-[2rem] text-white shadow-lg shadow-emerald-100 relative overflow-hidden group">
                <div class="absolute -right-4 -bottom-4 w-24 h-24 bg-white/10 rounded-full group-hover:scale-110 transition-transform"></div>
                <p class="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">Promedio General</p>
                <div class="text-4xl font-black mt-2">${gpa}</div>
                <div class="mt-4 flex items-center gap-2 bg-white/20 px-3 py-1 rounded-full w-fit">
                  <i data-lucide="sparkles" class="w-3.5 h-3.5 text-yellow-300"></i>
                  <span class="text-[10px] font-bold ${gpaLabelColor}">${gpaLabel}</span>
                </div>
              </div>
              <div class="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center justify-between">
                <div>
                  <p class="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Tareas Listas</p>
                  <div class="text-3xl font-black text-slate-700 mt-1">${taskEvidences.length}</div>
                </div>
                <div class="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-500 flex items-center justify-center text-2xl">🎒</div>
              </div>
            </div>
          </div>

          <!-- Historial Académico -->
          ${historyRows ? `
          <div class="grid grid-cols-1 gap-8">
            <div class="space-y-4">
              <h4 class="font-black text-slate-800 text-sm px-4 flex items-center gap-2">
                <i data-lucide="history" class="w-4 h-4 text-[#0B63C7]"></i> Historial Académico
              </h4>
              <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div class="overflow-x-auto">
                  <table class="w-full text-sm min-w-[600px]">
                    <thead class="bg-slate-50 border-b border-slate-100">
                      <tr>
                        <th class="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-wider">Año</th>
                        <th class="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-wider">Período</th>
                        <th class="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-wider">Aula</th>
                        <th class="px-4 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-wider">Tareas</th>
                        <th class="px-4 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-wider">Formal</th>
                        <th class="px-4 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-wider">Final</th>
                        <th class="px-4 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-wider">Nivel</th>
                        <th class="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-wider">Comentario</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-50">${historyRows}</tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
          ` : ''}

          <!-- Desglose -->
          <div class="grid grid-cols-1 gap-8">
            <div class="space-y-4">
              <h4 class="font-black text-slate-800 text-sm px-4 flex items-center gap-2">
                <i data-lucide="check-circle" class="w-4 h-4 text-emerald-500"></i> Tareas Calificadas
              </h4>
              <div class="space-y-3">
                ${taskEvidences.length > 0 ? taskEvidences.map(t => this.renderTaskEvidenceCard(t)).join('') : Helpers.emptyState('Sin tareas aún', '📝')}
              </div>
            </div>
          </div>
        </div>
      `;

      // Solo inicializar lucide, ya no hay gráfico
      setTimeout(() => {
        if (window.lucide) lucide.createIcons();
      }, 50);

    } catch (err) {
      container.innerHTML = Helpers.emptyState('Error al cargar calificaciones', '❌');
    }
  },

  calculateGPA(grades, taskEvidences) {
    const scores = [];
    // Process grades: prefer numeric_score, fallback to legacy score
    grades.forEach(g => {
      if (g.numeric_score != null) {
        const score = parseFloat(g.numeric_score);
        if (!isNaN(score) && score >= 0 && score <= 100) {
          scores.push(score);
          return;
        }
      }
      if (parseFloat(g.score)) {
        scores.push(parseFloat(g.score));
      }
    });
    // Process task evidences: prefer numeric_score
    taskEvidences.forEach(t => {
      if (t.numeric_score != null) {
        const score = parseFloat(t.numeric_score);
        if (!isNaN(score) && score >= 0 && score <= 100) {
          scores.push(score);
          return;
        }
      }
      // Fallback to legacy
      const letterToScore = { 'A': 95, 'B': 85, 'C': 75, 'D': 60, 'E': 40 };
      if (t.grade_letter && letterToScore[t.grade_letter]) {
        scores.push(letterToScore[t.grade_letter]);
      } else if (t.stars != null && t.stars > 0) {
        scores.push(t.stars * 20);
      }
    });
    if (!scores.length) return '—';
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    return Math.round(avg).toString();
  },

  getGPALabel(gpa) {
    if (gpa === '—') return { label: 'Sin datos aún', color: 'text-slate-400' };
    const n = parseFloat(gpa);
    if (n >= 95) return { label: '¡Excelente progreso!', color: 'text-emerald-200' };
    if (n >= 90) return { label: 'Muy buen desempeño', color: 'text-emerald-200' };
    if (n >= 80) return { label: 'Buen progreso', color: 'text-blue-200' };
    if (n >= 70) return { label: 'Progreso aceptable', color: 'text-yellow-200' };
    if (n >= 60) return { label: 'Requiere mejoras', color: 'text-orange-200' };
    return { label: 'Necesita mejorar', color: 'text-red-200' };
  },

  renderGradeCard(g) {
    const score = parseFloat(g.score) || 0;
    const color = score >= 90 ? 'text-emerald-500' : (score >= 70 ? 'text-blue-500' : 'text-amber-500');
    const bg = score >= 90 ? 'bg-emerald-50' : (score >= 70 ? 'bg-blue-50' : 'bg-amber-50');
    
    return `
      <div class="bg-white p-4 rounded-3xl border-2 border-slate-50 shadow-sm hover:shadow-md transition-all flex items-center justify-between group">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl ${bg} flex items-center justify-center group-hover:scale-110 transition-transform">
            <i data-lucide="book" class="w-5 h-5 ${color}"></i>
          </div>
          <div>
            <h4 class="font-bold text-slate-700 text-sm">${escapeHtml(g.subject || 'Materia')}</h4>
            <p class="text-[9px] text-slate-400 font-bold uppercase tracking-widest">${Helpers.formatDate(g.created_at)}</p>
          </div>
        </div>
        <div class="text-right">
          <div class="text-xl font-black ${color}">${score}</div>
          <p class="text-[8px] font-bold uppercase text-slate-300">Puntaje</p>
        </div>
      </div>
    `;
  },

  renderTaskEvidenceCard(t) {
    // Prefer numeric score display
    const numScore = t.numeric_score != null ? parseFloat(t.numeric_score) : null;
    const gradeLetter = t.grade_letter;
    const stars = t.stars;

    let displayGrade, displayLabel, displayBg, displayText;
    if (numScore !== null && !isNaN(numScore)) {
      displayGrade = Math.round(numScore);
      if (numScore >= 95) { displayLabel = 'Excelente'; displayBg = 'bg-emerald-500'; displayText = 'text-white'; }
      else if (numScore >= 85) { displayLabel = 'Muy Bueno'; displayBg = 'bg-blue-500'; displayText = 'text-white'; }
      else if (numScore >= 75) { displayLabel = 'Bueno'; displayBg = 'bg-sky-500'; displayText = 'text-white'; }
      else if (numScore >= 60) { displayLabel = 'Aceptable'; displayBg = 'bg-amber-500'; displayText = 'text-white'; }
      else { displayLabel = 'Requiere Mejoras'; displayBg = 'bg-rose-500'; displayText = 'text-white'; }
    } else if (gradeLetter) {
      const gradeColors = {
        'A': { bg: 'bg-emerald-500', label: 'Excelente' },
        'B': { bg: 'bg-blue-500', label: 'Bien' },
        'C': { bg: 'bg-amber-500', label: 'Suficiente' },
        'D': { bg: 'bg-rose-500', label: 'Mejorable' },
      };
      const gc = gradeColors[gradeLetter] || gradeColors['A'];
      displayGrade = gradeLetter;
      displayLabel = gc.label;
      displayBg = gc.bg;
      displayText = 'text-white';
    } else {
      displayGrade = '—';
      displayLabel = 'Sin calificar';
      displayBg = 'bg-slate-200';
      displayText = 'text-slate-500';
    }

    const starsHtml = stars
      ? `<div class="flex items-center gap-0.5 mt-1 justify-end">${Array(stars).fill('<span class="text-amber-400 text-xs">★</span>').join('')}</div>`
      : '';

    return `
      <div class="bg-white p-4 rounded-3xl border-2 border-slate-50 shadow-sm hover:shadow-lg transition-all flex items-center justify-between group ring-2 ring-slate-100">
        <div class="flex items-center gap-3">
          <div class="w-11 h-11 rounded-2xl ${displayBg}/10 flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
            <i data-lucide="file-check" class="w-5 h-5 ${displayBg.replace('bg-', 'text-')}"></i>
          </div>
          <div class="min-w-0">
            <h5 class="font-bold text-slate-700 text-sm truncate">${escapeHtml(t.tasks?.title || 'Tarea')}</h5>
            <p class="text-[9px] text-slate-400 font-bold uppercase">${Helpers.formatDate(t.created_at)}</p>
            ${t.comment ? `<p class="text-[10px] text-slate-500 mt-0.5 italic truncate">"${escapeHtml(t.comment)}"</p>` : ''}
          </div>
        </div>
        <div class="text-right shrink-0 ml-3">
          <span class="px-3 py-1.5 rounded-xl ${displayBg} ${displayText} text-xs font-black uppercase tracking-tight shadow-sm">
            ${displayGrade}
          </span>
          <p class="text-[8px] font-bold text-slate-400 mt-1 uppercase">${displayLabel}</p>
          ${starsHtml}
        </div>
      </div>
    `;
  },

  renderChart(grades) {
    const canvas = document.getElementById('gradesChart');
    if (!canvas || !window.Chart || grades.length === 0) return;

    const chartData = [...grades].slice(0, 8).reverse();
    const labels = chartData.map(g => g.subject || 'Materia');
    const scores = chartData.map(g => parseFloat(g.score) || 0);

    new Chart(canvas, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Puntaje',
          data: scores,
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99, 102, 241, 0.05)',
          borderWidth: 3,
          tension: 0.4,
          pointBackgroundColor: '#ffffff',
          pointBorderColor: '#6366f1',
          pointBorderWidth: 2,
          pointRadius: 4,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1e293b',
            titleFont: { family: 'Nunito', size: 12, weight: 'bold' },
            bodyFont: { family: 'Nunito', size: 11 },
            padding: 10,
            cornerRadius: 12,
            displayColors: false
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            grid: { color: '#f1f5f9', drawBorder: false },
            ticks: { font: { family: 'Nunito', weight: '700', size: 10 }, color: '#94a3b8' }
          },
          x: {
            grid: { display: false },
            ticks: { font: { family: 'Nunito', weight: '700', size: 9 }, color: '#94a3b8' }
          }
        }
      }
    });
  }
};
