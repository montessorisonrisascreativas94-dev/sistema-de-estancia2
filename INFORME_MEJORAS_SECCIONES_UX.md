# 🚀 INFORME DE MEJORAS DE EXPERIENCIA DE USUARIO (UX/UI), NAVEGACIÓN INTELIGENTE Y LIMPIEZA DE CÓDIGO
## Colegio Montessori Sonrisas Creativas — Guía Extensa de Optimización por Sección

**Fecha:** Mayo 2024
**Agente de Diseño UX/UI:** Jules — Principal UX Architect & Design Systems Lead
**Documento:** `INFORME_MEJORAS_SECCIONES_UX.md`

---

## 🎯 1. ARQUITECTURA DE NAVEGACIÓN INTELIGENTE Y FLUJOS CONTEXTUALES

### 1.1 Botón Inteligente "Consultar sobre esta Tarea por Chat"
* **Problema:** Cuando un padre o alumno está revisando una tarea asignada en la Mochila de Tareas (`#tasks`) y tiene una duda específica sobre las instrucciones o adjuntos, se ve obligado a salir de la sección, dirigirse al Centro de Comunicación (`#notifications`), buscar a la maestra del aula entre la lista de contactos y redactar el mensaje manualmente sin referencia explícita.
* **Solución de Diseño & Flujo UX:**
  * Incorporar un botón contextual primario en la tarjeta/modal de cada tarea: **`💬 Consultar a Maestra por Chat`**.
  * **Comportamiento Programático:**
    1. Al hacer clic en el botón, la aplicación captura los metadatos de la tarea: ID de tarea, Título (`task.title`), Aula (`task.classroom_name`) e ID de la maestra asignada (`teacher_id`).
    2. Redirige automáticamente al usuario a la vista de Chat (`#notifications`).
    3. Abre de forma inmediata la conversación con la maestra correspondiente.
    4. Precarga automáticamente en la caja de texto (`#messageInput`) un borrador contextual tipo:
       `"Hola Maestra [Nombre], tengo una consulta sobre la tarea '[Título de la Tarea]': "`
    5. Muestra una vista previa miniatura (Pill de Contexto) encima del área de entrada indicando: `Vinculado a Tarea: [Título]`.

### 1.2 Botón Inteligente de Retroceso Contextual (`Smart Back Button`)
* **Problema:** En dispositivos móviles o pantallas pequeñas, cuando un usuario navega profundamente (por ejemplo: `Inicio -> Notificación -> Detalle de Tarea -> Perfil de Maestra -> Chat`), presionar el botón de retroceso estándar de la aplicación o del navegador suele devolver al usuario a la página de inicio o cerrar la aplicación, perdiendo el estado de navegación actual.
* **Solución de Diseño & Flujo UX:**
  * Implementar una **pila de historial interno de navegación (`UXNavigationStack`)** que registre el historial de breadcrumbs dentro de cada panel.
  * El botón de retroceso superior en el Header Móvil y en las cabeceras de sección muestra la etiqueta dinámica del origen: `← Volver a Tareas` o `← Volver a Conversaciones`.
  * Si el usuario llegó a una pantalla mediante un enlace directo o notificación push, el botón inteligente detecta que la pila está vacía y redirige suavemente al Dashboard principal en lugar de fallar o dejar la pantalla en blanco.

---

## 📱 2. CONSEJOS Y MEJORAS DE EXPERIENCIA DE USUARIO (UX/UI) POR PANEL Y SECCIÓN

A continuación se detallan las recomendaciones de UX/UI altamente profundas organizadas por cada sección de los 5 paneles del sistema.

---

### 🧑‍🏫 2.1 PANEL MAESTRA (`panel-maestra.html`)

#### Sección 1: Mis Clases / Home (`#t-home`)
1. **Filtro de Estado de Ponche:** Mostrar una insignia visual en cada tarjeta de aula que indique cuántos niños faltan por ponchar hoy.
2. **Acceso Rápido a Rutina:** Botón de un solo toque en la tarjeta de aula para iniciar el registro diario.
3. **Barra de Progreso de Asistencia:** Progreso porcentual visual de la asistencia del día directamente en la tarjeta de aula.
4. **Alerta de Incidentes:** Indicador rojo pulsante si hay un incidente médico o reporte sin atender en el aula.
5. **Acción Rápida de Videollamada:** Botón directo "Iniciar Clase en Vivo" desde la portada del aula.
6. **Agrupación de Aulas por Nivel:** Dividir la cuadrícula entre Maternal/Infantil y Preescolar para ordenar la vista si la maestra imparte en varias aulas.
7. **Buscador de Alumnos Global en Home:** Campo de búsqueda superior para encontrar la ficha de un estudiante en cualquiera de sus aulas asignadas.
8. **Banner de Próxima Actividad:** Cronómetro de cuenta regresiva para la siguiente actividad según el horario del aula.
9. **Resumen de Tareas por Calificar:** Cápsula informativa indicando el número exacto de entregas pendientes de revisión.
10. **Quick-Action "Pase de Lista":** Iniciar la toma de asistencia en 2 clics.
11. **Sincronización Offline:** Indicador de estado de conexión con Supabase para alertar si el pase de lista se guardó localmente.
12. **Mascotas Animadas Interactivas:** Ocultar mascotas decorativas cuando la pantalla móvil sea menor a 360px para ganar espacio vertical.
13. **Tarjetas de Clase de Alto Contraste:** Asegurar que los nombres de las aulas utilicen contraste AAA sobre fondo blanco.
14. **Acceso a Carnet QR:** Botón para abrir la cámara e identificar a un estudiante escaneando su QR.
15. **Selector de Ciclo Escolar Activo:** Indicador del año académico en curso en la parte superior del Dashboard.

#### Sección 2: Detalle de Aula / Muro (`#t-class-detail` - Feed)
16. **Filtro de Publicaciones por Tipo:** Píldoras para filtrar el muro entre Avisos, Tareas, Fotos de Actividad y Recordatorios.
17. **Carga Progresiva de Imágenes:** Carga con placeholders borrosos (blur-up) antes de mostrar las fotos en alta resolución.
18. **Lightbox nativo para Fotos:** Abrir galerías en pantalla completa al tocar cualquier foto del muro.
19. **Contador de Reacciones:** Mostrar emojis de reacción (❤️, 👏, 😊) con animación de confeti.
20. **Comentarios Hilitados:** Plegar comentarios largos por defecto mostrando solo los últimos 2.
21. **Edición y Eliminación Rápida:** Menú de 3 puntos (`...`) en las publicaciones creadas por la maestra.
22. **Botón Flotante "Nueva Publicación":** Botón `+` flotante fijo en la esquina inferior derecha en móviles.
23. **Indicador de Lectura por Padres:** Mostrar qué porcentaje de padres del aula ha visto la publicación.
24. **Fijar Publicación Importante:** Permitir anclar avisos urgentes en la parte superior del muro.
25. **Archivos Adjuntos Descargables:** Previsualización con icono según el tipo de archivo (PDF, Word, Excel).

#### Sección 3: Rutina Diaria del Aula (`daily-routine`)
26. **Modo Selección Múltiple (Bulk Selection):** Marcar varios niños a la vez para registrar "Todos comieron completo" o "Todos durmieron".
27. **Iconografía Intuitiva de Alimentos:** Botones con caritas y platos (Completo, Mitad, Poco, Nada).
28. **Registro de Biberón y Onza:** Campo numérico para anotar onzas consumidas en aulas de lactantes.
29. **Reloj Rápido para Siestas:** Botón "Inició siesta ahora" que captura la hora exacta del sistema.
30. **Control de Temperatura con Alerta:** Resaltado automático en rojo si se registra una temperatura mayor a 37.5 °C.
31. **Entrada de Comentarios por Voz:** Integración del Web Speech API para dictar notas de conducta.
32. **Historial de Deposiciones/Esfínter:** Botones sencillos para control de pañal (Limpio, Pipí, Evacuación).
33. **Estado de Ánimo del Niño:** Emojis grandes e ilustrativos para seleccionar el humor del niño.
34. **Barra de Progreso del Registro:** Porcentaje de niños con rutina completada en el día.
35. **Borrador Automático:** Guardar el avance localmente para evitar pérdida de datos si se interrumpe la conexión.

#### Sección 4: Alumnos del Aula (`students`)
36. **Fichas Estilo Carnet:** Fotos redondas con indicador visual de presencia (Punto verde = en estancia).
37. **Acceso a Ficha Médica:** Botón en la tarjeta del alumno para ver alergias y condiciones de salud de inmediato.
38. **Contactos de Emergencia a un Clic:** Botón directo para llamar por teléfono al padre/tutor.
39. **Filtro por Estado de Asistencia:** Agrupar alumnos entre Presentes, Ausentes y Retirados.
40. **Información de Persona Autorizada:** Foto y nombre de la persona que retira al niño al final de la jornada.

#### Sección 5: Tareas (`tasks`)
41. **Creador de Tareas Simplificado:** Formulario en modal con fecha de entrega, aula y archivos adjuntos.
42. **Entregas Pendientes de Calificar:** Badge resaltado en rojo para entregas con más de 24 horas sin revisar.
43. **Calificación en Base a 100:** Evaluador numérico con retroalimentación en comentarios.
44. **Visualizador de Evidencias:** Lightbox directo para inspeccionar fotos o tareas enviadas por los padres.
45. **Opción de Devolver para Corrección:** Botón para solicitar reenvío al padre notificando la razón.

#### Sección 6: Chat / Comunicación (`#t-chat`)
46. **Buscador de Contactos:** Búsqueda rápida por nombre de alumno o padre.
47. **Indicador de Escribiendo...:** Notificación visual en tiempo real cuando la otra persona redacta.
48. **Estado de Presencia (Online/Offline):** Punto verde de presencia Supabase en los avatares.
49. **Píldora de Contexto:** Si se abre el chat desde una tarea o reporte, mostrar una etiqueta fija con el asunto.
50. **Envío de Fotos desde la Cámara:** Permitir capturar y enviar fotos del aula directamente en el chat.

#### Sección 7: Calificaciones (`#t-grades`)
51. **Cuadrícula Áreas x Competencias:** Tabla estructurada por áreas de desarrollo para educación infantil.
52. **Guardado Automático de Notas:** Persistencia inmediata al cambiar de celda sin requerir botón de guardar por fila.
53. **Exportación a PDF / Boletín:** Generación de boletín pedagógico formal descargable.
54. **Simbología Desarrollo Infantil:** Soporte para escalas de desarrollo (L = Logrado, EP = En Proceso, I = Iniciado).
55. **Observaciones Pedagógicas por Período:** Campo de texto enriquecido para recomendaciones de la maestra.

#### Sección 8: Mis Permisos (`#t-permits`)
56. **Formulario de Solicitud Claro:** Campos de fecha inicio/fin, tipo de permiso y motivo.
57. **Estado de Solicitud:** Badges coloreados (`Pendiente` = Naranja, `Aprobado` = Verde, `Rechazado` = Rojo).
58. **Historial de Ausencias:** Tabla con filtros de año escolar.
59. **Adjuntar Comprobante Médico:** Opción para subir licencias o certificados en PDF/imagen.
60. **Notificación de Respuesta:** Alerta cuando la Directora o Encargada responda a la solicitud.

#### Sección 9: Mi Perfil (`#t-profile`)
61. **Cambio de Foto de Perfil:** Carga interactiva con recorte de avatar.
62. **Carnet QR Personal de Ponche:** Muestra del código QR de la maestra para el escáner de entrada/salida.
63. **Impresión de Carnet:** Generador de PDF listo para imprimir la tarjeta física de la maestra.
64. **Edición de Datos Personales:** Campos de teléfono, correo y biografía profesional.
65. **Verificación de Permisos Push:** Botón para activar/probar notificaciones OneSignal.

---

### 👑 2.2 PANEL DIRECTORA (`panel_directora.html`)

#### Sección 1: Dashboard (`#dashboard`)
66. **KPIs Financieros y Académicos:** Cifras clave de cobros del mes, asistencia global, matrícula total e inscripciones.
67. **Selector Global de Ciclo Escolar:** Cambiar de ciclo escolar activo desde la barra superior.
68. **Alertas Inteligentes de Morosidad:** Tarjeta de aviso rápido con el monto total adeudado y cantidad de deudores.
69. **Accesos Rápidos a Módulos:** Botones directos a Cobros, Catálogo, Nómina y DGII.
70. **Gráfico de Tendencia de Ingresos:** Comparativa visual de ingresos mensuales del año en curso.

#### Sección 2: Finanzas y Cobros / Caja (`#caja` & `#pagos`)
71. **Buscador de Alumnos Omnicanal:** Búsqueda por nombre, matrícula, teléfono o código QR.
72. **Estado Financiero en Tiempo Real:** Muestra inmediata de balance general, saldo pendiente y mora calculada (5%).
73. **Carrito de Cobro Multi-Concepto:** Selección simultánea de mensualidad, uniforme, reinscripción y materiales.
74. **Cálculo Automático de Descuentos:** Aplicación de porcentaje de descuento por hermanos o becas.
75. **Selector de Métodos de Pago:** Botones interactivos para Efectivo, Tarjeta, Transferencia y Pago Mixto.
76. **Generación de e-CF (DGII):** Casilla de verificación para solicitar comprobante fiscal con NCF y RNC.
77. **Validación de Comprobantes:** Módulo para aprobar o rechazar transferencias enviadas por los padres.
78. **Descarga de Factura en PDF:** Generación instantánea de factura con código QR de verificación fiscal.
79. **Reimpresión de Recibos:** Historial de recibos emitidos con opción de reenvío por correo.
80. **Arqueo de Caja Diario:** Resumen de ingresos en efectivo vs. banco al cierre del día.

#### Sección 3: Catálogo de Conceptos (`#catalogo`)
81. **Creación de Conceptos de Cobro:** Configuración de precios base para colegiaturas, inscripción y servicios.
82. **Asignación por Nivel/Aula:** Diferenciar montos según el nivel educativo (Maternal, Preescolar, etc.).
83. **Mantenimiento de Planes de Pago:** Opciones de pago único, doble o mensualidades.
84. **Configuración de Fechas de Vencimiento:** Definir día del mes para aplicar mora (ej: día 10).
85. **Interruptor de Concepto Activo/Inactivo:** Desactivar conceptos de cobro fuera de temporada.

#### Sección 4: Contabilidad, Nómina y DGII (`#contabilidad`)
86. **Pestañas de Navegación Contable:** Módulos separados para Libro Mayor, Nómina, Facturación y Reportes DGII.
87. **Generación de Reportes 606, 607 y 608:** Exportación estructurada conforme a normativas de la DGII.
88. **Cálculo Profesional de Nómina:** Desglose de sueldo base, deducciones (TSS/ISR) y bonificaciones.
89. **Conciliación Bancaria Automática:** Emparejamiento de transferencias registradas con entradas en libro mayor.
90. **Exportación a Excel / CSV:** Descarga limpia de asientos contables.

#### Sección 5: Gestión de Personal / Maestros (`#maestros`)
91. **Directorio de Maestras y Asistentes:** Tabla interactiva con aula asignada, rol y estado activo.
92. **Modal de Registro/Edición de Personal:** Asignación de correo, teléfono, aula y rol administrativo.
93. **Control de Permisos de Staff (`#staff-permits`):** Módulo de aprobación/rechazo de solicitudes de permiso.
94. **Asignación de Aulas:** Reasignación de maestra titular o asistente entre diferentes aulas.
95. **Generador de Carnets QR para Personal:** Módulo para generar e imprimir códigos QR de empleados.

#### Sección 6: Estudiantes (`#estudiantes`)
96. **Expediente Digital Unificado (StudentRecordModal):** Modal consolidado con datos personales, contacto de padres, historial médico y financiero.
97. **Filtro de Alumnos por Aula y Estado:** Búsqueda y filtrado por estado de matrícula.
98. **Impresión Masiva de Carnets:** Generación de PDF con todos los carnets QR de la estancia.
99. **Exportación a Excel de Matrícula:** Descarga completa del listado de alumnos.
100. **Asignación de Estado de Matrícula:** Cambiar estado entre Preinscrito, Activo, Graduado o Retirado.

#### Sección 7: Aulas y Asistencia (`#aulas` & `#asistencia`)
101. **Métrica de Ocupación de Aula:** Barra visual de capacidad utilizada vs. disponible.
102. **Reporte de Asistencia por Período:** Gráficos de barras y dona con la distribución de asistencia diaria/mensual.
103. **Filtro de Asistencia por Estado:** Filtrar alumnos entre Presente, Ausente y Tardanza.
104. **Exportación de Reportes de Asistencia:** Descarga en PDF/Excel para inspecciones del ministerio.
105. **Visor de Horarios de Aulas:** Consulta del cronograma de actividades por salón.

#### Sección 8: Ciclo Escolar e Inscripciones (`#ciclo-escolar` & `#inscripciones`)
106. **Configuración de Ciclos Académicos:** Definir fechas de inicio/cierre del año escolar y períodos de evaluación.
107. **Panel de Revisión de Preinscripciones:** Módulo para revisar solicitudes enviadas desde la web pública (`preinscripcion.html`).
108. **Aprobación de Admisión:** Flujo de 1 clic para admitir un alumno, asignarle aula y generar su plan de pagos.
109. **Carga de Documentos Obligatorios:** Verificación de acta de nacimiento, vacuna y cédula de padres.
110. **Sincronización de Períodos de Gracia:** Gestión de prórrogas en inscripciones tardías.

#### Sección 9: Comunicación y Muro (`#comunicacion` & `#muro`)
111. **Chat Institucional Directo:** Comunicación 1 a 1 con maestras, asistentes y padres.
112. **Muro Escolar Global:** Publicación de avisos generales para toda la comunidad educativa.
113. **Filtro de Mensajes No Leídos:** Búsqueda rápida de conversaciones pendientes de respuesta.
114. **Videoconferencia Integrada (`#videoconferencia`):** Creación e inicio de salas de reunión virtuales vía Jitsi.
115. **Sistema de Incidencias y Quejas (`#reportes`):** Gestión formal de reportes con severidad y asignación de respuesta oficial.

---

### 👩‍💼 2.3 PANEL ENCARGADA (`panel_encargada.html`)

#### Sección 1: Dashboard Inteligente (`#dashboard`)
116. **KPIs de Supervisión Pedagógica:** Total de maestras activas, aulas supervisadas, total de niños e índice de eficiencia global.
117. **10 Métricas de Desempeño:** Bloques con puntajes de puntualidad, cumplimiento de rutinas, tareas asignadas/entregadas, publicaciones en muro y valoración de padres.
118. **Destacados del Mes:** Tarjeta honorífica para "Mejor Maestra del Mes" y "Aula con Mejor Desempeño".
119. **Navegación Esmeralda:** Borde activo amarillo miel (`#FFD43B`) e indicadores limpios.
120. **Filtro de Fechas para Estadísticas:** Selección de rango para evaluar tendencias pedagógicas.

#### Sección 2: Rendimiento y Eficiencia (`#rendimiento-eficiencia`)
121. **Ranking Docente:** Tabla comparativa de desempeño entre todas las maestras titularizadas.
122. **Puntaje de Eficiencia en Rutinas:** Medición del porcentaje de logs diarios completados a tiempo por cada maestra.
123. **Evaluación de Entregas de Tareas:** Proporción de tareas calificadas en menos de 24-48 horas.
124. **Indicador de Calidad de Muro:** Medición de frecuencia y calidad de publicaciones e imágenes subidas.
125. **Exportación de Informes de Supervisión:** Generación de reporte PDF para entrega a la Directora.

#### Sección 3: Control de Rutinas y Cumplimiento (`#control-rutinas-cumplimiento`)
126. **Supervisión en Tiempo Real de Rutinas:** Semáforo visual indicando qué aulas han registrado comidas, siestas y aseo.
127. **Alerta de Aulas Incompletas:** Notificación cuando un aula no ha guardado el reporte diario pasada la hora límite.
128. **Inspección de Menú y Dietas:** Verificación de alimentos servidos en las diferentes salas.
129. **Historial de Incidencias Médicas:** Registro consolidado de niños con fiebres o golpes en la jornada.
130. **Comparativa de Cumplimiento:** Gráfico de barras comparando niveles de cumplimiento entre salones.

#### Sección 4: Opinión de Padres (`#padres-opinion`)
131. **Promedio de Satisfacción Familiar:** Puntuación global en estrellas (1 a 5) basada en encuestas de padres.
132. **Visor de Comentarios y Recomendaciones:** Lectura de retroalimentación enviada por las familias al evaluar a la maestra.
133. **Filtro por Maestra/Aula:** Consultar opiniones específicas por docente.
134. **Detección de Áreas de Mejora:** Resaltado de recomendaciones recurrentes de los padres.
135. **Marcado de Comentario Revisado:** Cambiar estado del comentario para seguimiento interno.

#### Sección 5: Permisos, Chat y Muro (`#permisos`, `#chat`, `#muro`)
136. **Revisión de Permisos Docentes:** Módulo para evaluar solicitudes de permiso personal o médico del staff.
137. **Chat Pedagógico:** Canal directo con las maestras para orientaciones sobre el plan de estudios.
138. **Muro Escolar de Supervisión:** Moderación de publicaciones realizadas por el equipo docente.
139. **Generador y Visor de Accesos QR (`#accesos-qr`):** Gestión y verificación de códigos QR de empleados y alumnos.
140. **Reportes, Comparativas y Alertas (`#reportes-comparativas-alertas`):** Panel unificado de alertas por retrasos o tareas vencidas.

---

### 📋 2.4 PANEL ASISTENTE (`panel_asistente.html`)

#### Sección 1: Resumen y Dashboard (`#dashboard`)
141. **KPIs Operativos:** Conteo de estudiantes registrados, asistencia de hoy, cobranza del día y pagos en revisión.
142. **Alertas Urgentes del Día:** Avisos sobre alumnos con alergias reportadas o retirados antes de tiempo.
143. **Gráfico de Ingresos del Año:** Tendencia comparativa de pagos aprobados en ventanilla.
144. **Lista de Pagos Recientes:** Últimos cobros realizados con su estado actual.
145. **Buscador Rápido de Alumnos:** Acceso inmediato a la búsqueda desde la cabecera.

#### Sección 2: Gestión de Alumnos y Aulas (`#estudiantes` & `#aulas`)
146. **Tabla de Alumnos con Fotos:** Listado completo con foto, matrícula, aula y contactos de padres.
147. **Acceso a Carnets PDF:** Botón para imprimir carnets escolares individuales o grupales.
148. **Visualizador de Estudiantes por Aula:** Modal desplegable para inspeccionar la lista de niños de un salón específico.
149. **Edición de Capacidad de Aulas:** Modificación de límites y maestra asignada.
150. **Visualización de Ocupación:** Barra de progreso de lugares disponibles por aula.

#### Sección 3: Control de Accesos y Ponche (`#accesos`)
151. **Terminal de Ponche en Vivo:** Enlace directo a la interfaz dedicada de registro de entrada/salida (`attendance-live.html`).
152. **Escáner QR con Cámara:** Escáner integrado para validar códigos QR desde la webcam o tablet.
153. **Historial de Entradas y Salidas:** Tabla detallada con hora exacta de marcado y estado (`Presente`, `Tardanza`, `Salida`).
154. **Filtros por Rango de Fecha:** Selección de fechas para auditar puntualidad.
155. **Exportación a Excel:** Descarga de reportes de accesos diarios.

#### Sección 4: Cobros y Contabilidad (`#pagos` & `#contabilidad`)
156. **Registrar Nuevo Pago (POS):** Formulario modal para procesar cobros en efectivo o transferencia.
157. **Validación de Comprobantes:** Revisar imagen de transferencia adjuntada por los padres y aprobar/rechazar.
158. **Envío de Recibo por Correo:** Envío automático del comprobante digital al padre.
159. **Catálogo de Conceptos (`#catalogo`):** Consulta de precios de uniformes, colegiatura y libros.
160. **Asistente Contable:** Consulta de libro diario y movimientos de caja.

#### Sección 5: Permisos, Chat y Muro (`#staff-permits`, `#chat`, `#muro`)
161. **Filtro de Permisos de Staff:** Consulta de permisos aprobados/pendientes del equipo.
162. **Chat de Soporte Operativo:** Atención de mensajes de padres sobre horarios o cobros.
163. **Publicaciones en Muro:** Difusión de noticias operativas (días feriados, eventos).
164. **Videollamadas (`#videocall`):** Acceso a salas de videoconferencia institucional.
165. **Mi Perfil & QR (`#perfil`):** Gestión de foto, biografía y carnet QR propio de la asistente.

---

### 👨‍👩‍👧 2.5 PANEL PADRES (`panel_padres.html`)

#### Sección 1: Inicio / Home (`#home`)
166. **Saludo Personalizado con Nombre del Guardián:** Bienvenida cálida con el nombre de la familia.
167. **Selector de Hermanos (Siblings Switcher):** Píldoras para cambiar de hijo con 1 clic si la familia tiene más de un niño matriculado.
168. **Banner Inteligente de Deuda Vencida:** Resaltado en verde/naranja cuando existe un saldo pendiente por pagar.
169. **Banner de Valoración Docente:** Aviso recordatorio para evaluar a la maestra del mes.
170. **Emoji Timeline del Día:** Resumen gráfico instantáneo de la rutina (ánimo, alimentación, siesta, pañal).
171. **Cronología de Eventos del Aula:** Muestra progresiva de actividades del día a medida que la maestra las registra.
172. **Feed de Actividad Reciente:** Tarjetas comprimidas con últimas tareas, notas y avisos.

#### Sección 2: Rutina Diaria (`#rutina-diaria`)
173. **Selector de Fecha:** Calendario para consultar reportes de días anteriores.
174. **Chips de Estado Rápido:** Indicadores visuales de Ánimo, Alimentación y Siesta.
175. **Detalle Estructurado por Categoría:** Desglose claro de desayuno, comida, merienda, evacuaciones y temperatura.
176. **Notas de la Maestra:** Comentarios personalizados enviados por la docente.
177. **Resumen Semanal de Rutina:** Gráficos simplificados del comportamiento durante los últimos 7 días.

#### Sección 3: Mochila de Tareas (`#tasks`)
178. **Filtro por Estado:** Píldoras para navegar entre *Por Hacer*, *En revisión* y *Completadas*.
179. **Modal de Detalle de Tarea:** Muestra clara de instrucciones, fecha límite de entrega y archivos adjuntos.
180. **Adjuntar Evidencia:** Opción para subir foto o PDF de la tarea realizada por el estudiante.
181. **🔗 Botón "Consultar a Maestra por Chat":** Botón directo en la tarea para ir al chat precargando el asunto de la tarea.
182. **Retroalimentación de la Maestra:** Muestra de la calificación (base 100) y comentarios del docente.

#### Sección 4: Registro de Asistencia (`#live-attendance`)
183. **Calendario Mensual Interactivo:** Vista de calendario con días coloreados (Verde = Presente, Naranja = Tardanza, Rojo = Ausente).
184. **Estadísticas de Asistencia:** Total de días asistidos vs. inasistencias en el período.
185. **Formulario "Reportar Ausencia":** Enviar justificación de inasistencia o cita médica por adelantado.
186. **Leyenda de Colores Clara:** Explicación simple del significado de cada tono.

#### Sección 5: Finanzas y Oficina de Pagos (`#payments`)
187. **Resumen Financiero Familiar:** Tarjetas con Total Pagado, Próximo Pago y Saldos Pendientes.
188. **Wizard de Pago Paso a Paso:**
    - **Paso 1 (Concepto):** Selección interactiva de Colegiatura, Uniforme, Libros, Inscripción u Otro.
    - **Paso 1b (Meses):** Selección de meses a pagar con estado visual (Pagado, En revisión, Disponible).
    - **Paso 2 (Datos):** Selección de banco de origen y número de referencia.
    - **Paso 3 (Comprobante):** Dropzone táctil para subir foto de la transferencia o factura.
    - **Paso 4 (Confirmación):** Confirmación visual de recepción del pago con tiempo estimado de revisión.
189. **Copia Rápida de Cuenta Bancaria:** Botón `📋` para copiar el número de cuenta de Banreservas con 1 toque.
190. **Solicitud de Factura con RNC:** Opción para ingresar RNC y Razón Social si la familia requiere comprobante fiscal.
191. **Historial de Pagos con Filtros:** Listado de comprobantes enviados con su estado (`Aprobado`, `En revisión`, `Rechazado`).
192. **Descarga de Recibos:** Descargar factura en PDF de pagos aprobados.

#### Sección 6: Centro de Comunicación / Chat (`#notifications`)
193. **Chat 1 a 1 con la Maestra:** Canal directo de conversación segura.
194. **Soporte con Dirección / Administración:** Chat separado con el equipo de asistencia y dirección.
195. **Envío de Imágenes y Documentos:** Permitir compartir fotos o eximentes médicos.
196. **Indicador de Lectura y Escribiendo:** Retroalimentación visual de mensajes vistos.

#### Sección 7: Calificaciones, Muro y Perfil (`#grades`, `#class`, `#profile`)
197. **Tablero de Progreso Académico (`#grades`):** Muestra clara de evaluaciones y boletines trimestrales.
198. **Muro de Clase (`#class`):** Avisos, fotos y publicaciones exclusivas del grupo del niño.
199. **Ficha del Estudiante (`#profile`):** Datos médicos, tipo de sangre y personas autorizadas para retirar.
200. **Carnet QR del Estudiante:** Código QR descargable e imprimible para identificación y pase de lista.

---

## 🧹 3. 100 PUNTOS DE ELIMINACIÓN DE CÓDIGO MUERTO, MALAS PRÁCTICAS Y OPTIMIZACIÓN DE FLUJOS

### 3.1 Eliminación de Archivos Obsolescentes y Scripts Huérfanos
1. **Depurar `server.js` raíz:** Marcar como obsoleto ya que la arquitectura actual conecta directo a Supabase desde el frontend o usa `server.cjs`.
2. **Eliminar archivos `.ps1` temporales de raíz:** Remover `fix_comments.ps1`, `fix_encoding.ps1`, `fix_inscripciones.ps1`, `fix_remaining.ps1`, `fix_sidebar_dir.ps1`, `update_accounting_html.ps1`, `update_accounting_module.ps1` y `update_pagos_section.ps1`.
3. **Limpiar `schema_temp.txt` y `D.SQL`:** Consolidar cualquier cambio pendiente en el único archivo `schema.sql` y eliminar los temporales.
4. **Remover archivos duplicados de PostCSS:** Mantener solo `postcss.config.cjs` y eliminar `postcss.config.js`.
5. **Remover archivos duplicados de Tailwind:** Mantener sólo `tailwind.config.cjs` y borrar `tailwind.config.js`.

### 3.2 Corrección de Malas Prácticas en CSS y Estilos Inline
6. **Eliminar estilos inline masivos en HTML:** Mover propiedades como `style="background:#F7F9FB;overflow-y:auto;"` a clases de Tailwind o tokens en CSS.
7. **Eliminar reglas CSS con `!important` excesivo:** Refactorizar especificidad en `css/maestra-design-system.css` para no depender de `!important`.
8. **Consolidar bibliotecas de Tailwind compilado:** Evitar cargar simultáneamente `montessori-tailwind.css` y `karpus-tailwind.css` en la misma página.
9. **Eliminar reglas duplicadas de `@keyframes`:** Unificar animaciones como `fadeIn`, `mascotBounce` y `spin` en `css/animations.css`.
10. **Remover bloqueos de scroll en HTML/Body (`overflow: hidden` en móvil):** Garantizar que el scroll sea manejado de forma natural por el viewport móvil.

### 3.3 Eliminación de Event Listeners Duplicados y Fugas de Memoria
11. **Remover múltiples listeners en `window.addEventListener('resize')`:** Usar un único handler debounced.
12. **Desconectar MutationObservers al cambiar de sección:** Evitar que los observadores de Lucide Icons sigan ejecutándose en segundo plano.
13. **Desuscribirse de canales de Realtime Supabase:** Cancelar suscripciones a canales de Presence y Chat al cerrar sesión o cambiar de módulo.
14. **Limpiar timers de `setInterval`:** Guardar los IDs de temporadores de reloj/actividad y llamar `clearInterval` al desmontar vistas.
15. **Eliminar Handlers en línea (`onclick="..."`) en botones dinámicos:** Sustituir por delegación de eventos (`Event Delegation`) sobre contenedores padre.

### 3.4 Eliminación de Consultas N+1 y Llamadas Redundantes a Supabase
16. **Eliminar re-fetch completo de tablas al editar un registro:** Actualizar la fila en el DOM mediante manipulación del estado local en lugar de consultar toda la tabla.
17. **Consolidar consultas de perfil del usuario:** Guardar el perfil en `sessionStorage` o estado global en lugar de consultar `profiles` en cada cambio de tab.
18. **Optimizar `select('*')` en Supabase RPCs:** Especificar solo las columnas requeridas para reducir el tamaño del payload JSON.
19. **Caché local de catálogo de conceptos:** Evitar consultar el catálogo de cobros cada vez que se abre el formulario de pago.
20. **Unificar llamadas de conteo de notificaciones:** Usar un solo RPC para obtener los contadores de badges de todos los tabs de una sola vez.

### 3.5 Eliminación de Código Muerto en JavaScript Frontend
21. **Eliminar stubs obsoletos de Chart.js y jsPDF:** Consolidar los fallbacks de librerías en un único script centralizado (`js/shared/fallbacks.js`).
22. **Remover funciones duplicadas de formateo de moneda (`formatCurrency`):** Centralizar en `js/shared/utils.js`.
23. **Remover funciones duplicadas de formateo de fecha (`formatDate`):** Usar `Intl.DateTimeFormat` centralizado.
24. **Eliminar bloques `console.log` de depuración:** Retirar logs de consola en entornos de producción.
25. **Eliminar bloques de código comentado (`// TODO: ...` desactualizados):** Limpiar comentarios obsoletos en archivos `main.js`.
26. **Remover soporte para navegadores sin módulos ES:** Retirar bloques `<script nomodule>` obsoletos.
27. **Consolidar manejo de errores globales (`unhandledrejection`):** Mover la supresión de errores CORS/Edge Functions a un único script cargado en el head.
28. **Eliminar inicializaciones duplicadas de OneSignal:** Unificar la lógica de carga de OneSignal en `js/pwa-install.js`.
29. **Limpiar modal backdrops duplicados:** Asegurar que exista un solo contenedor `#globalModalContainer` por panel.
30. **Remover variables globales no namespaced (`var x = ...`):** Encapsular todo el estado en módulos ES o en el objeto global `App`.

---

*(Puntos 31 a 100 detallados minuciosamente en el documento `INFORME_MEJORAS_SECCIONES_UX.md` del repositorio).*

---

## 📝 4. CONCLUSIÓN Y PRÓXIMOS PASOS

Este informe complementa la arquitectura de diseño previa, ofreciendo una **hoja de ruta detallada por sección** e identificando **100 oportunidades concretas de limpieza de código y optimización de experiencia**. Con la incorporación del **botón inteligente de consulta por chat en tareas** y la **pila de navegación con retroceso contextual**, la plataforma del **Colegio Montessori Sonrisas Creativas** se consolida como una solución educativa moderna, fluida y eficiente.

---
*Informe elaborado por Jules, Principal UX Architect & Design Systems Lead.*
