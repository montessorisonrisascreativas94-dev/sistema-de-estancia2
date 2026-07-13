const TeacherEfficiencyModule = {
    charts: {},
    
    init() {
        console.log('TeacherEfficiencyModule inicializado');
        this.loadTeacherEfficiency();
        this.initializeEventListeners();
    },
    
    initializeEventListeners() {
        // Listen for events if needed
    },
    
    async loadTeacherEfficiency() {
        try {
            await Promise.all([
                this.loadEfficiencyData(),
                this.loadEfficiencyChart()
            ]);
        } catch (error) {
            console.error('Error al cargar datos de eficiencia:', error);
        }
    },
    
    async loadEfficiencyData() {
        // Get state
        const state = window.EncargadaAppState;
        
        // Mock data - replace with actual Supabase queries
        const mockTeachers = [
            { id: 1, name: 'María González', efficiency: 92, punctuality: 95, attendance: 98, reports: 88, parentRating: 90 },
            { id: 2, name: 'Ana Martínez', efficiency: 88, punctuality: 90, attendance: 95, reports: 85, parentRating: 87 },
            { id: 3, name: 'Carmen López', efficiency: 85, punctuality: 85, attendance: 90, reports: 82, parentRating: 84 },
            { id: 4, name: 'Laura Rodríguez', efficiency: 80, punctuality: 82, attendance: 88, reports: 78, parentRating: 81 },
            { id: 5, name: 'Sofía Pérez', efficiency: 75, punctuality: 78, attendance: 85, reports: 72, parentRating: 76 }
        ];
        
        state.setState('teacherEfficiency', mockTeachers);
        this.renderTeacherList(mockTeachers);
    },
    
    renderTeacherList(teachers) {
        const container = document.getElementById('teacher-efficiency-list');
        if (!container) return;
        
        container.innerHTML = teachers.map(teacher => `
            <div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <div class="flex justify-between items-start mb-3">
                    <div>
                        <h4 class="font-semibold text-gray-800">${teacher.name}</h4>
                        <div class="flex items-center gap-2 mt-1">
                            <span class="text-2xl font-bold text-purple-600">${teacher.efficiency}</span>
                            <span class="text-sm text-gray-500">/100</span>
                        </div>
                    </div>
                    <div class="text-right">
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            teacher.efficiency >= 90 ? 'bg-green-100 text-green-800' :
                            teacher.efficiency >= 80 ? 'bg-blue-100 text-blue-800' :
                            teacher.efficiency >= 70 ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                        }">
                            ${
                                teacher.efficiency >= 90 ? 'Excelente' :
                                teacher.efficiency >= 80 ? 'Muy Bueno' :
                                teacher.efficiency >= 70 ? 'Aceptable' :
                                'Requiere Mejoras'
                            }
                        </span>
                    </div>
                </div>
                
                <div class="space-y-3">
                    <div>
                        <div class="flex justify-between text-xs mb-1">
                            <span class="text-gray-600">Puntualidad</span>
                            <span class="font-medium">${teacher.punctuality}%</span>
                        </div>
                        <div class="w-full bg-gray-200 rounded-full h-2">
                            <div class="h-2 rounded-full" style="width: ${teacher.punctuality}%; background-color: ${
                                teacher.punctuality >= 90 ? '#10b981' :
                                teacher.punctuality >= 70 ? '#f59e0b' : '#ef4444'
                            }"></div>
                        </div>
                    </div>
                    
                    <div>
                        <div class="flex justify-between text-xs mb-1">
                            <span class="text-gray-600">Asistencia</span>
                            <span class="font-medium">${teacher.attendance}%</span>
                        </div>
                        <div class="w-full bg-gray-200 rounded-full h-2">
                            <div class="h-2 rounded-full" style="width: ${teacher.attendance}%; background-color: ${
                                teacher.attendance >= 90 ? '#10b981' :
                                teacher.attendance >= 70 ? '#f59e0b' : '#ef4444'
                            }"></div>
                        </div>
                    </div>
                    
                    <div>
                        <div class="flex justify-between text-xs mb-1">
                            <span class="text-gray-600">Reportes</span>
                            <span class="font-medium">${teacher.reports}%</span>
                        </div>
                        <div class="w-full bg-gray-200 rounded-full h-2">
                            <div class="h-2 rounded-full" style="width: ${teacher.reports}%; background-color: ${
                                teacher.reports >= 90 ? '#10b981' :
                                teacher.reports >= 70 ? '#f59e0b' : '#ef4444'
                            }"></div>
                        </div>
                    </div>
                    
                    <div>
                        <div class="flex justify-between text-xs mb-1">
                            <span class="text-gray-600">Valoración Padres</span>
                            <span class="font-medium">${teacher.parentRating}%</span>
                        </div>
                        <div class="w-full bg-gray-200 rounded-full h-2">
                            <div class="h-2 rounded-full" style="width: ${teacher.parentRating}%; background-color: ${
                                teacher.parentRating >= 90 ? '#10b981' :
                                teacher.parentRating >= 70 ? '#f59e0b' : '#ef4444'
                            }"></div>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    },
    
    async loadEfficiencyChart() {
        const canvas = document.getElementById('efficiency-chart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        
        // Mock data
        const labels = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio'];
        const data = [85, 88, 86, 90, 92, 91];
        
        if (this.charts.efficiency) {
            this.charts.efficiency.destroy();
        }
        
        this.charts.efficiency = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Eficiencia Promedio',
                    data,
                    borderColor: '#8b5cf6',
                    backgroundColor: 'rgba(139, 92, 246, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100
                    }
                }
            }
        });
    }
};

window.TeacherEfficiencyModule = TeacherEfficiencyModule;
