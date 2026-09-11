# INFORME TÉCNICO Y AUDITORÍA INTEGRAL DEL SISTEMA
**Colegio Montessori Sonrisas Creativas - ERP de Gestión Escolar**

---

## 1. RESUMEN DE ARQUITECTURA GENERAL DEL SISTEMA

El sistema del **Colegio Montessori Sonrisas Creativas** es una plataforma ERP Web de arquitectura SPA (Single Page Application) modularizada, diseñada para la gestión académica, administrativa, operativa y pedagógica integral.

### Tecnologías Principales
- **Frontend Core:** HTML5 Semántico, JavaScript Modular (ES6+), CSS3 con Tailwind CSS y Design System personalizado (`css/maestra-design-system.css`).
- **Backend & Base de Datos:** Supabase (PostgreSQL 15+) con seguridad a nivel de filas (RLS - Row Level Security), Realtime WebSockets, Storage Buckets y RPCs (Remote Procedure Calls).
- **Procesamiento de Archivos y Reportes:** `jsPDF`, `jsPDF-AutoTable`, `Chart.js`, `Html5-QRCode`, `Confetti.js`, `OCR Service`.
- **Compatibilidad PWA:** Service Worker (`sw.js` / `sw-live.js`), Web Manifest (`manifest.json`), soporte offline con cola de sincronización diferida (`offline-queue.js`) y alertas emergentes (OneSignal / Web Push).

---

## 2. DESGLOSE TÉCNICO DE PANELES Y SUS FUNCIONALIDADES

*(Nota: En conformidad con los requerimientos recibidos, se excluyen explícitamente el Panel Control, la Contabilidad y los Sistemas de Pago/Caja/Facturación DGII).*

---

### I. PANEL DE DIRECTORA (`panel_directora.html`)
Es el centro de mando estratégico y pedagógico para la dirección académica del colegio.

1. **Dashboard Principal (`dashboard`):**
   - **Métricas Globales:** Total de estudiantes matriculados, asistencia docente/estudiantil diaria, aulas activas y estado general del personal.
   - **Gráficos en Tiempo Real:** Distribución de asistencia por nivel escolar, alertas tempranas de deserción o ausentismo prolongado.

2. **Gestión de Maestros y Personal Docente (`maestros`):**
   - **Registro y Perfil:** Alta, baja y modificación de docentes, asignación de materias y aulas correspondientes.
   - **Estatus Operativo:** Seguimiento del horario de entrada/salida, carga académica semanal y estado de presencia en línea.

3. **Permisos e Incidencias de Staff (`staff-permits`):**
   - **Aprobación de Licencias:** Módulo para la recepción, revisión y aprobación o rechazo de solicitudes de permisos médicos, personales o vacaciones presentados por los maestros y asistentes.

4. **Control de Accesos QR (`accesos`):**
   - **Monitoreo en Puerta:** Registro en tiempo real de entradas y salidas de docentes, estudiantes y personal mediante escaneo de códigos QR desde carnets digitales.

5. **Gestión de Estudiantes y Expediente Unificado (`estudiantes`):**
   - **Directorio General:** Búsqueda avanzada de alumnos por aula, estado (activo, inactivo, retirado) o nivel educativo.
   - **Modal de Expediente Digital (`StudentRecordModal`):** Ficha acumulativa que consolida datos médicos, tutores legales, autorizaciones de retiro, historial de asistencia y registros pedagógicos.

6. **Gestión de Aulas y Capacidad (`aulas`):**
   - **Configuración de Salones:** Creación de espacios físicos (Maternal, Párvulos, Infantil, Primaria), asignación de cupos máximos, tutores titulares y co-docentes.

7. **Registro y Control de Asistencia (`asistencia`):**
   - **Auditoría Diaria:** Consolidado de asistencia tomadas por los maestros en sus respectivas aulas, visualización de ausencias justificadas e injustificadas con generación de reportes PDF.

8. **Centro de Calificaciones y Boletines (`calificaciones`):**
   - **Supervisión Pedagógica:** Revisión de sábanas de notas, validación de evaluaciones por competencias (niveles infantiles) o cualitativas/cuantitativas (base 100), y emisión masiva de boletines escolares oficiales (`boletin.module.js`).

9. **Videoconferencias y Aulas Virtuales (`videoconferencia`):**
   - **Gestión de Salas:** Creación y supervisión de salas de reunión virtuales integradas con WebRTC (`videocall.js` y `videocall-ui.js`) para reuniones de padres o clases remotas.

10. **Configuración de Ciclo Escolar (`ciclo-escolar-config`):**
    - **Apertura y Cierre:** Definición del año lectivo vigente, periodos de evaluación (Trimestres / Periodos), calendario académico de días festivos e inactivos.

11. **Admisiones e Inscripciones (`inscripciones`):**
    - **Proceso de Admisión:** Revisión de preinscripciones en línea, validación de documentos (actas de nacimiento, récords de vacunación), entrevistas y formalización de matrícula.

12. **Centro de Comunicación e Inquiries (`comunicacion`):**
    - **Mesa de Ayuda Interna:** Recepción y respuesta de solicitudes de información de familias o prospectos, mensajería estructurada por departamento.

13. **Muro Escolar Institucional (`muro`):**
    - **Publicaciones Oficiales:** Difusión de comunicados, fotos de actividades y avisos institucionales visibles para maestros y padres en tiempo real.

14. **Configuración del Centro (`configuracion`):**
    - **Parámetros Generales:** Datos institucionales del colegio, logo, lema, horario lectivo, correo de contacto y reglas del sistema.

---

### II. PANEL DE MAESTRA / DOCENTE (`panel-maestra.html`)
Espacio de trabajo operativo diseñado con alta eficiencia para la labor del aula y el seguimiento continuo del desarrollo infantil.

1. **Inicio y Gestión del Aula (`t-home`):**
   - **Paso de Lista Diaria:** Interfaz optimizada para marcar presencia, tardanza o ausencia de los niños con un solo clic.
   - **Bitácora de Eventos:** Registro rápido de incidencias breves o notas del aula.

2. **Chat Institucional Directo (`t-chat`):**
   - **Comunicación con Tutores:** Módulo de chat en tiempo real para interacción bidireccional entre la maestra titular y los padres de familia del aula.

3. **Evaluaciones, Calificaciones y Rutinas Infantiles (`t-grades`):**
   - **Cuaderno de Calificaciones (Gradebook):** Registro de notas cuantitativas y evaluaciones por indicadores de logro/competencias desarrolladas.
   - **Sistema Avanzado de Rutinas Infantiles (0 - 6 años):** Control de alimentación (desayuno, merienda, almuerzo), tiempos de siesta, control de esfínteres/baño, temperatura corporal y estado de ánimo diario con exportación en JSONB/Supabase Realtime.

4. **Permisos y Solicitudes Docentes (`t-permits`):**
   - **Auto-Gestión de Licencias:** Envío directo de solicitudes de permisos personales o justificaciones médicas a la Directora o Encargada.

5. **Perfil Profesional y Carnet QR (`t-profile`):**
   - **Identificación Digital:** Carnet docente interactivo con código QR para el fichaje diario de asistencia en el plantel.

---

### III. PANEL DE ENCARGADA / COORDINACIÓN (`panel_encargada.html`)
Diseñado para la coordinación académica, supervisión de docentes y velación del cumplimiento del proyecto educativo.

1. **Dashboard Supervisión (`dashboard`):**
   - **Vista Operativa General:** Estado de asistencia del personal en tiempo real, aulas sin maestro asignado y cobertura de rutina diaria.

2. **Rendimiento y Eficiencia (`rendimiento-eficiencia`):**
   - **Métricas de Docentes:** Indicadores de puntualidad en entrega de calificaciones, actualización oportuna de rutinas infantiles y cumplimiento de planes de clase.

3. **Opinión y Retroalimentación de Padres (`padres-opinion`):**
   - **Evaluación del Servicio:** Consolidado de encuestas y valoraciones periódicas que los padres realizan sobre el desempeño del colegio y sus docentes.

4. **Gestión de Permisos (`permisos`):**
   - **Revisión de Solicitudes:** Evaluación intermedia y canalización de solicitudes de permisos de docentes.

5. **Control de Accesos QR (`accesos-qr`):**
   - **Auditoría de Entradas:** Verificación del registro de accesos del personal administrativo, docente y estudiantes.

6. **Chat General y Muro Escolar (`chat`, `muro`):**
   - **Coordinación Interna:** Herramientas de comunicación con directivos y maestros para la organización de eventos y proyectos institucionales.

7. **Control de Rutinas y Cumplimiento (`control-rutinas-cumplimiento`):**
   - **Ruti-Auditoría:** Panel especial que verifica qué aulas infantiles han registrado o tienen pendiente el reporte diario de alimentos, siesta y baño antes del horario de salida.

8. **Alertas y Reportes Comparativos (`reportes-comparativas-alertas`):**
   - **Detección Temprana:** Alertas automáticas sobre bajas en el rendimiento estudiantil, ausentismo repetido o inconsistencias en los registros académicos.

9. **Perfil de Coordinación (`perfil`):**
   - **Datos Personales:** Ajustes de cuenta y preferencias del perfil de la encargada.

---

### IV. PANEL DE ASISTENTE / SECRETARÍA (`panel_asistente.html`)
Orientado a las tareas operativas cotidianas, atención al público y soporte logístico.

1. **Dashboard Secretaría (`dashboard`):**
   - **Resumen del Día:** Citas agendadas, número de llamadas/consultas pendientes y total de asistencias del día.

2. **Admisiones e Inscripciones (`inscripciones`):**
   - **Recepción de Solicitudes:** Descarga y verificación inicial de preinscripciones realizadas en el portal público, recepción de documentos escaneados.

3. **Gestión de Estudiantes (`estudiantes`):**
   - **Búsqueda y Actualización:** Mantenimiento de números telefónicos de emergencia, personas autorizadas para retirar al alumno y actualización de fotografías.

4. **Directorio de Maestros (`maestros`):**
   - **Consulta Rápida:** Acceso a horarios de clases, materias asignadas y estado de localización del personal docente.

5. **Organización de Aulas (`aulas`):**
   - **Apoyo Logístico:** Listados de estudiantes por salón para entrega de carnets, uniformes u organización de excursiones.

6. **Registro de Accesos QR (`accesos`):**
   - **Terminal de Recepción:** Escáner primario para el fichaje de entradas y salidas de los estudiantes en la recepción principal.

7. **Permisos y Novedades de Staff (`staff-permits`):**
   - **Recepción de Comprobantes:** Registro físico o digital de certificados médicos presentados por el personal.

8. **Muro Institucional y Chat (`muro`, `chat`):**
   - **Atención y Publicaciones:** Asistencia en la difusión de avisos y atención a consultas rápidas de tutores.

9. **Salas de Videollamada (`videocall`):**
   - **Soporte Técnico:** Configuración y asistencia técnica en videollamadas organizadas por dirección o docentes.

10. **Perfil Operativo (`perfil`):**
    - **Cuenta del Usuario:** Configuración de contraseña e información de contacto.

---

### V. PANEL DE PADRES Y TUTORES (`panel_padres.html`)
Portal móvil e interactivo para la vinculación activa de las familias con el desarrollo escolar de sus hijos.

1. **Portal Familiar / Inicio (`home`):**
   - **Resumen Diario:** Selección del hijo (en caso de tener varios matriculados), resumen del estado de asistencia del día, avisos destacados y actividades agendadas.

2. **Asignaciones y Tareas (`tasks`):**
   - **Seguimiento Escolar:** Visualización de tareas asignadas por las maestras, fechas de entrega, instrucciones y estado de entrega del alumno.

3. **Boletines y Calificaciones (`grades`):**
   - **Reporte de Progreso:** Consulta e impresión en PDF del boletín oficial de calificaciones por periodo escolar, con desglose de materias e indicadores socioemocionales.

4. **Muro de la Clase (`class`):**
   - **Galería y Novedades:** Galería fotográfica de las actividades realizadas en el aula, anuncios específicos de la maestra titular y celebraciones del grupo.

5. **Videollamadas y Clases Online (`videocall`):**
   - **Acceso Directo:** Conexión de un solo clic a reuniones de padres, entregas de notas virtuales o clases en vivo.

6. **Asistencia en Tiempo Real (`live-attendance`):**
   - **Notificación de Entrada/Salida:** Verificación inmediata de la hora exacta en que el alumno ingresó o fue retirado del colegio mediante el escaneo QR.

7. **Notificaciones y Avisos (`notifications`):**
   - **Centro de Alertas:** Historial de notificaciones push y avisos urgentes enviados por el colegio o la docente.

8. **Seguidor de Rutinas Diarias Infantiles (`rutina-diaria`):**
   - **Bitácora en Vivo (0 - 6 años):** Visualización interactiva de qué comió el niño, a qué hora durmió la siesta, cuántas veces fue al baño y si registró alguna temperatura o novedad médica en el día.

9. **Perfil y Expediente Familiar (`profile`):**
   - **Carnet Digital:** Visualización del carnet escolar del estudiante con código QR para escaneo en puerta, actualización de contactos de emergencia e historial de calificaciones de satisfacción.

---

## 3. CONCLUSIÓN TÉCNICA

El ERP del **Colegio Montessori Sonrisas Creativas** destaca por un diseño modular robusto, enfocado en el aprendizaje infantil y la estandarización pedagógica. La separación estricta de roles mediante RLS y componentes JavaScript modulares garantiza un alto rendimiento, una experiencia de usuario optimizada para móviles y escritorios, y una alta seguridad de los datos estudiantiles.
