INFORME TÉCNICO Y ARQUITECTÓNICO COMPLETO: SISTEMA DE INTERVENCIÓN, MODO SUPERVISIÓN Y PANEL ASISTENTE
PARTE 1: SISTEMA DE INTERVENCIÓN RÁPIDA Y "MODO SUPERVISIÓN DE AULA" (PANEL DIRECTORA)
1.1 Diagnóstico en Tiempo Real y Semáforo de Salud Operativa
El sistema de supervisión del Panel de la Directora (SchoolCenterModule) evalúa continuamente la salud operativa de cada aula y de la estancia infantil/colegio mediante indicadores clave (KPIs) en tiempo real:

🟢 Estancia Operando Normal (Nivel OK): Pase de lista completo, rutinas ingresadas al 100%, cero mensajes pendientes y publicaciones al día.
🟡 Requiere Atención (Nivel WARN): Avances parciales en la bitácora de rutina o pasadas las 11:00 AM sin publicaciones en el Muro para los padres.
🔴 Requiere Intervención (Nivel DANGER): Situación crítica (ej. ≥ 3 mensajes de padres sin responder por más de 24 horas, o alumnos presentes sin pase de lista).
1.2 El Nuevo Paradigma: "Modo Supervisión de Aula" (Mirroring de Maestra)
En lugar de una intervención abstracta o de cambiar credenciales ("iniciar sesión como la maestra"), la Directora activa el Modo Supervisión de Aula.

DIRECTORA (Mantiene su cuenta y rol)
   ↓
Centro Escolar → Selecciona Aula (ej. Maternal A 🔴)
   ↓
[Supervisar Aula]
   ↓
┌────────────────────────────────────────────────────────────────────────┐
│ 👁️ MODO SUPERVISIÓN — Maternal A · María Rodríguez      [Intervenir]  │
├────────────────────────────────────────────────────────────────────────┤
│ VISTA DE LA MAESTRA (Misma interfaz, datos y secciones)                │
│                                                                        │
│ 🏠 Inicio     👧 Mi Aula     📋 Jornada/Asistencia    🍎 Rutinas       │
│ 📚 Actividades 💬 Familias   📝 Incidencias           📖 Bitácora      │
└────────────────────────────────────────────────────────────────────────┘
Ventajas Clave de la Arquitectura:
Conservación de Seguridad y Auditoría (No-repudio): La Directora sigue siendo la Directora (usuario_actual = directora). No se cierran sesiones ni se usurpan credenciales. Cada cambio o intervención se guarda auditado con su firma digital (director_id).
Visión Espejo Idéntica (Mirroring): La Directora no ve un panel abstracto, sino exactamente las mismas pantallas, datos y botones que ve la docente, lo que le permite diagnosticar la causa exacta del retraso o problema.
Barra Superior Permanente de Supervisión: Indica en todo momento: 👁️ MODO SUPERVISIÓN — Maternal A · María Rodríguez | [Registrar Intervención] | [Salir de Supervisión]
Navegación Inteligente "Ir al Punto de Alerta": Si la alerta del semáforo es por Asistencia, Rutinas de Almuerzo o Mensajes Pendientes, al pulsar [Supervisar Aula] el sistema abre directamente el sub-módulo con el problema.
Creación Contextual de Intervenciones: Al pulsar [Intervenir], el ticket sabe automáticamente en qué aula, módulo (ej. Rutinas), sección (ej. Almuerzo) o estudiante específico se encontraba la Directora.
PARTE 2: ANÁLISIS DEL PANEL ASISTENTE Y COMPARTICIÓN DE MÓDULOS
El Panel de la Asistente no es una versión aislada, sino un panel operativo de apoyo directivo. Comparte e imparte completamente los mismos módulos que el Panel de la Directora, manteniendo la sincronización de datos en tiempo real.

2.1 Módulos Compartidos e Impartidos en el Panel Asistente
Módulo / Sección	Archivo JS Principal	¿Se comparte con Directora?	Descripción de Funcionalidades en Panel Asistente
🏫 Centro Escolar	school-center.module.js	100% Compartido	Diagnóstico global, semáforo por aula, organigrama y monitoreo operativo.
👧 Estudiantes y Fichas	students.module.js / StudentRecordModal	100% Compartido	Registro de alumnos, expediente 360°, datos de tutores, alergias e historial.
🏫 Aulas y Secciones	rooms.module.js	100% Compartido	Configuración de salones, capacidad, listados y asignación de maestros.
👩‍🏫 Maestras / Personal	teachers.js	100% Compartido	Directorio de personal, horario, grupo asignado y estado de desempeño.
🚪 Accesos y Molinetes	access.js	100% Compartido	Control de entradas/salidas con QR/código, visitantes y monitoreo en vivo.
📋 Permisos y Excusas	permits.module.js	100% Compartido	Recepción, revisión y aprobación de licencias médicas y excusas de alumnos.
🟢 Asistencia y Pases	attendance.module.js	100% Compartido	Pase de lista general, confirmación de ausencias y reportes diarios.
💳 Cobros y Caja Chica	caja-cobro-v2.js / payments.js	100% Compartido	Registro de ingresos, emisión de recibos y cobro de inscripciones/mensualidades.
📝 Admisiones / Inscripciones	inscripciones.module.js	100% Compartido	Recepción de solicitudes, revisión de documentos y matriculación.
📢 Muro Escolar	wall.js	100% Compartido	Publicación de comunicados, anuncios y fotos para los padres.
PARTE 3: DISEÑO UX/UI, PALETA CROMÁTICA Y SIDEBAR DEL PANEL ASISTENTE
3.1 Identidad Cromática del Panel Asistente
Mientras la Directora utiliza Azul Real (#0B63C7) y la Encargada utiliza Violeta (#8B5CF6), el Panel Asistente utiliza la paleta Esmeralda / Teal (#0D9488):

Fondo de Pantalla: #F0FDF4 (Verde esmeralda ultraligero).
Gradiente de Sidebar: linear-gradient(180deg, #0D9488 0%, #0A8A80 50%, #077A70 100%).
Color de Acento Principal: #0D9488 (Teal esmeralda primario).
Color Hover/Highlight: #14B8A6 y #2DD4BF.
3.2 Mejora UX/UI del Sidebar con Botones de Borde Blanco
Para darle al Panel Asistente la apariencia moderna, táctil y profesional deseada, se implementan los bordes blancos sutiles (1px solid rgba(255, 255, 255, 0.25)) en los botones del menú de navegación.

Código CSS Optimizado (Panel Asistente):
/* ==========================================================================
   SIDEBAR UX/UI - PANEL ASISTENTE (COLORES ESMERALDA + BORDES BLANCOS)
   ========================================================================== */

/* Fondo del Sidebar */
.panel-asistente-body #sidebar {
  background: linear-gradient(180deg, #0D9488 0%, #0A8A80 50%, #077A70 100%) !important;
  border-right: 1px solid rgba(255, 255, 255, 0.15) !important;
}

/* Botones Normales con Borde Blanco Sutil */
.panel-asistente-body .kk-nav-item,
.panel-asistente-body .nav-btn {
  background: rgba(255, 255, 255, 0.10) !important;
  border: 1px solid rgba(255, 255, 255, 0.25) !important; /* Borde blanco sutil */
  border-radius: 14px !important;
  color: #FFFFFF !important;
  font-weight: 700 !important;
  backdrop-filter: blur(8px);
  margin-bottom: 6px !important;
  padding: 10px 14px !important;
  transition: all 0.22s cubic-bezier(0.4, 0, 0.2, 1) !important;
}

/* Hover: Iluminación y Borde Blanco Destacado */
.panel-asistente-body .kk-nav-item:hover,
.panel-asistente-body .nav-btn:hover {
  background: rgba(255, 255, 255, 0.22) !important;
  border-color: rgba(255, 255, 255, 0.65) !important; /* Borde blanco brillante */
  transform: translateX(4px);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
}

/* Estado Activo: Botón Blanco Puro con Texto Esmeralda */
.panel-asistente-body .kk-nav-item.active,
.panel-asistente-body .nav-btn.active {
  background: #FFFFFF !important;
  border: 1px solid #FFFFFF !important;
  color: #0D9488 !important; /* Texto en color esmeralda */
  font-weight: 900 !important;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18) !important;
}

.panel-asistente-body .kk-nav-item.active i,
.panel-asistente-body .nav-btn.active i {
  color: #0D9488 !important;
}
PARTE 4: PLAN DE OPTIMIZACIÓN DE CÓDIGO (ELIMINACIÓN DE JS DUPLICADOS)
Para evitar mantener dos archivos JavaScript distintos para Estudiantes, Aulas o Pagos:

Unificación de Módulos Core: Se elimina la duplicidad en js/asistente/modules/students.js y js/asistente/modules/rooms.js.
Importación con Parámetro de Rol: El main.js de la Asistente importa directamente js/directora/students.module.js y js/directora/rooms.module.js pasándole { role: 'asistente', theme: '#0D9488' }.
Mantenimiento Centralizado: Cualquier mejora o nueva columna en la tabla de alumnos, buscador de expedientes o gestión de salones queda automáticamente disponible tanto para la Directora como para la Asistente.