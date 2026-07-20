# INFORME DE ARQUITECTURA: CONEXIÓN LÓGICA, FLUJOS Y CICLO DE ESTANCIA POR AÑO
**Colegio Montessori Sonrisas Creativas**
*Autor: Jules (Ingeniero Principal de Software)*

---

## 1. Resumen Ejecutivo

Este informe describe exhaustivamente la infraestructura técnica, el flujo de datos y las dependencias lógicas entre los diferentes paneles del sistema del **Colegio Montessori Sonrisas Creativas**:
- **Panel de Directora** (`panel_directora.html` / `js/directora/`)
- **Panel de Maestra** (`panel-maestra.html` / `js/maestra/`)
- **Panel de Asistente** (`panel_asistente.html` / `js/asistente/`)
- **Panel de Padres** (`panel_padres.html` / `js/padre/`)

El sistema utiliza **Supabase** como backend en tiempo real para la base de datos, autenticación y almacenamiento. Todos los paneles interactúan con un esquema unificado de base de datos (`schema.sql`), lo que permite que las acciones tomadas en un panel repercutan de manera inmediata y precisa en los demás paneles de cara al usuario final.

---

## 2. Mapa de Conexión de Información entre Secciones y Paneles

La información fluye de manera bidireccional y tridireccional a través del esquema de base de datos. A continuación se analiza la lógica funcional y técnica de cada sección principal:

### A. Módulo de Tareas (Mochila de Misiones)
- **Flujo Lógico**:
  1. **Maestra**: Crea una tarea/misión para un aula determinada desde su panel (`js/maestra/tasks.js`). El registro se guarda en la tabla `tasks` con campos como título, descripción, fecha de vencimiento (`due_date`), archivo adjunto y sistema de calificación.
  2. **Padre**: Al cargar el panel de padres (`js/padre/tasks.js`), el sistema identifica el `classroom_id` del estudiante seleccionado y consulta las tareas pendientes de esa sección. Las muestra clasificadas en "Por hacer", "Tarde" y "Listas" mediante la comparación con la tabla `task_evidences`.
  3. **Entrega (Padre)**: El padre sube el archivo de evidencia que se almacena en el bucket `classroom_media` de Supabase Storage. Inserta un registro en `task_evidences` con estado `submitted`.
  4. **Corrección (Maestra)**: La maestra recibe una notificación y visualiza la evidencia del estudiante. Califica la tarea (mediante estrellas o calificación de base 100) y actualiza el registro en `task_evidences` a `graded`.
  5. **Notificación (Padre)**: El padre puede visualizar de inmediato la calificación asignada y el comentario de retroalimentación de la maestra en su sección "Calificaciones" o en la misma tarjeta de la tarea.

### B. Muro de Clase (Muro Social Escolar)
- **Flujo Lógico**:
  1. **Directora / Maestra**: Publican anuncios oficiales, eventos o fotos de actividades en la tabla `classroom_posts` (o `posts`).
  2. **Padre**: En la sección de Inicio ("Home") y en el tab de "Muro de Clase", se cargan las publicaciones en orden cronológico descendente utilizando el `classroom_id` del estudiante.
  3. **Comentarios e Interacción**: Los padres pueden interactuar y enviar comentarios (guardados en `post_comments`), los cuales aparecen en tiempo real para todos los miembros del aula gracias a los listeners de Supabase Realtime (`supabase.channel`).

### C. Registro de Asistencia Diaria
- **Flujo Lógico**:
  1. **Maestra**: Toma asistencia diariamente marcando a cada alumno como `Presente`, `Tarde` o `Ausente`. Esto inserta/actualiza un registro en la tabla `attendance_logs` para el día actual.
  2. **Padre**: En su sección de "Asistencia", ve de forma interactiva un calendario con códigos de color (Verde: Presente, Naranja: Tardanza, Rojo: Ausencia).
  3. **Ausencia Justificada (Padre)**: El padre puede reportar una ausencia justificada abriendo el modal e ingresando la fecha y el motivo en la tabla `attendance_justifications`.
  4. **Aprobación (Directora/Maestra)**: La maestra o directora ven la justificación adjunta y aprueban el reporte, lo que actualiza automáticamente el registro de asistencia del alumno a un estado justificado o documentado.

### D. Calificaciones y Tablero de Progreso
- **Flujo Lógico**:
  1. **Maestra**: Registra las notas periódicas de exámenes, conducta y misiones especiales en la tabla `student_grades` o evaluando directamente las tareas en `task_evidences`.
  2. **Padre**: En su panel, ve el promedio acumulado general de su hijo ("Promedio General" o GPA) y un gráfico visual de barras/líneas generado dinámicamente con `Chart.js`, comparando el rendimiento del alumno por periodos/trimestres académicos.

### E. Rutina Diaria (Especial para niños de 0 a 6 años)
- **Flujo Lógico**:
  1. **Maestra**: Registra en tiempo real los eventos fisiológicos del infante: comidas (desayuno, merienda, almuerzo), siesta (hora de inicio y fin), control de esfínteres (pañal mojado, sucio, orina, evacuación) y temperatura corporal. Estos datos se guardan estructurados en una columna de tipo `JSONB` en la tabla `daily_logs` o `daily_reports` para optimizar el rendimiento.
  2. **Padre**: En la sección "Rutina Diaria" del panel de padres (`js/padre/daily-report.js`), recibe la información al instante con una línea de tiempo interactiva decorada con emojis que representa el día del niño en el colegio. Además, cuenta con un selector de fecha para auditar rutinas anteriores.

### F. Comunicación y Mensajería (Chat con presencia en vivo)
- **Flujo Lógico**:
  1. **Cualquier Panel**: Un usuario envía un mensaje (insertado en `chat_messages` con remitente y destinatario).
  2. **Supabase Presence & Channels**: Los paneles escuchan activamente la tabla de mensajes y actualizan la interfaz de burbujas de chat de forma instantánea. Se cuenta con un sistema de presencia en vivo para mostrar círculos de color (Online, Away, Offline) en los avatares según el estado de conexión activa del usuario.

---

## 3. El Ciclo de la Estancia por Año (Ciclo Escolar Completo)

La vida escolar y administrativa de un alumno dentro de la institución está regida por un motor de ciclo escolar robusto (`js/enrollment-cycle.js`). Este proceso se divide en 6 etapas lógicas consecutivas:

```
[ Preinscripción ] ──> [ Admisión/Cupo ] ──> [ Asignación de Plan de Pago ]
                                                         │
[ Reinscripción ] <── [ Cobro de Mensualidades ] <─── [ Inscripción Oficial ]
```

### Etapa 1: Preinscripción (Inicio del Proceso)
- **Lugar**: Formulario público (`preinscripcion.html`) o el panel de padres.
- **Acción**: El padre registra los datos básicos de su hijo (nombre, género, condiciones médicas, alergias) y los datos de contacto de los tutores.
- **Base de Datos**: Se crea un registro inactivo en `students` (`is_active = false`) y un registro en `student_enrollments` con estado `preinscrito` y vinculación al año escolar actual (`school_years`).

### Etapa 2: Admisión y Asignación de Cupo (Fase del Staff)
- **Lugar**: Panel de Directora o Asistente.
- **Acción**: La administración evalúa el expediente del estudiante preinscrito. Si cumple las condiciones y hay cupo disponible, se le asigna un aula (`classrooms`) y un plan de pago específico (`payment_plans` - por ejemplo: Plan de Pago Único Anual, Doble Pago, o Mensualidades de 10 cuotas).
- **Base de Datos**: El estado del registro en `student_enrollments` cambia a `admitido`. Se enlazan las claves foráneas de `classroom_id` y `payment_plan_id`.

### Etapa 3: Inscripción Oficial y Activación
- **Lugar**: Procesado por la Directora al confirmar el pago inicial de la matrícula de inscripción.
- **Acción**: Se ejecuta la confirmación administrativa. Esto desencadena la ejecución de un procedimiento almacenado en la base de datos (`RPC: generate_student_charges`).
- **Base de Datos**:
  - El estado en `student_enrollments` cambia a `inscrito`.
  - El estudiante pasa a `is_active = true` en la tabla `students`.
  - El sistema crea automáticamente la proyección de cobros en la tabla `student_charges`. Por ejemplo, si el plan seleccionado es mensual, insertará automáticamente 10 registros de tipo `colegiatura` con fechas de vencimiento espaciadas cada mes (ej. del día 5 de septiembre al 5 de junio) y los cargos correspondientes a inscripción, materiales o libros.

### Etapa 4: Cobros Mensuales, Control de Mora y Facturación DGII
- **Lugar**: Controlado por el cronograma administrativo y el panel de padres.
- **Acción**:
  - **Generación de Alertas**: A partir del día 25 de cada mes, se activa la visibilidad del cobro del mes entrante en el Panel de Padres.
  - **Día 5 (Vencimiento)**: Fecha límite de pago sin recargo. Si el pago se realiza después de esta fecha, el sistema calcula automáticamente un **5% de mora** sobre el monto base (según las reglas de negocio de `js/shared/payment-service.js`).
  - **Registro de Comprobante (Padre)**: El padre realiza la transferencia bancaria y sube una foto de la transacción indicando el banco emisor. El estado del cobro cambia a `review` (En revisión).
  - **Validación DGII (Directora)**: La directora aprueba el pago, lo que genera automáticamente la factura con número de comprobante fiscal (NCF) oficial de la DGII, integrando códigos QR y actualizando el estado de la cuenta del alumno a `paid` (Aprobado).

### Etapa 5: Cierre del Período Académico (Evaluaciones Finales)
- **Lugar**: Panel de Maestra e Informes de la Directora.
- **Acción**: Al final del ciclo lectivo (usualmente en junio), la maestra asienta las calificaciones definitivas en los boletines oficiales y cierra el registro de incidencias del estudiante.

### Etapa 6: Reinscripción para el Próximo Año Escolar
- **Lugar**: Panel de Padres / Directora.
- **Acción**: Al abrirse el nuevo año escolar (`school_years`), el sistema ofrece la opción de renovar matrícula. Al seleccionarse, se crea una nueva inscripción (`student_enrollments`) para el período siguiente, arrastrando los datos del estudiante anteriores pero asignando la nueva aula y plan de cobro actualizado, comenzando de nuevo el ciclo.

---

## 4. Análisis Crítico: El "Desliz de Lógica" en la Sección de Pagos de Padres

El usuario identificó una inconsistencia crítica en la interfaz del panel de padres dentro de la sección de pagos:
> *"en mi concepto de mi sección padre no muestra los precios y cómo un padre puede pagar libro si no sabe los precios de cada concepto para hacer la transferencia así que quiero que cada concepto muestre su precio en mi panel padre y que al seleccionarlo en mi campo monto se actualice de forma automática"*

### Causa Raíz de la Inconsistencia Lógica:
1. **Píldoras de Concepto Estáticas en HTML**: En `panel_padres.html` (líneas 1014-1027), los botones de concepto (Colegiatura, Inscripción, Reinscripción, Uniforme, Libros, Otro) están codificados con etiquetas HTML estáticas y no muestran su precio en la interfaz:
   ```html
   <button type="button" data-concept="uniforme" ...>👕 Uniforme</button>
   <button type="button" data-concept="libros" ...>📚 Libros</button>
   ```
2. **Falta de Consulta Dinámica**: El Panel de Padres no lee dinámicamente los precios actualizados desde la tabla de base de datos `payment_concepts` al renderizar el formulario de registro de pago, a pesar de que el catálogo existe en el backend.
3. **Monto en Cero (0.00)**: Al presionar cualquier botón de concepto, la función global `window._selConcepto(btn)` (definida en el script inline en la línea 1146 de `panel_padres.html`) solo cambia las clases de estilo visual del botón y actualiza el campo oculto `#paymentConcept`, pero **deja el input `#paymentAmount` intacto en 0.00**, obligando al padre a adivinar el precio del uniforme, libros o reinscripción.

### Lógica Correcta de Flujo que Debe Funcionar (Solución Detallada):

Para conectar la información y corregir este desliz, el flujo lógico debe operar de la siguiente manera:

```
[ Cargar Sección Pagos ] ──> [ Consultar "payment_concepts" vía Supabase ]
                                             │
                                             ▼
[ Actualizar Campo "Monto" ] <── [ Seleccionar Concepto con Precio Visible ]
```

1. **Carga Dinámica de los Conceptos**:
   Al iniciar el módulo de pagos (`PaymentsModule.init`), se realiza una consulta rápida a la tabla `payment_concepts` de Supabase para obtener la lista de conceptos activos y sus precios vigentes:
   ```javascript
   const { data: concepts } = await supabase
     .from('payment_concepts')
     .select('id, name, category, amount, description')
     .eq('active', true);
   ```

2. **Inyección de Precios en el Formulario**:
   En lugar de botones fijos con nombres planos, el HTML se genera dinámicamente o se actualiza para mostrar el precio al lado de cada concepto:
   - 📅 Colegiatura: **RD$3,000.00**
   - 📝 Inscripción: **RD$5,000.00**
   - 🔄 Reinscripción: **RD$3,500.00**
   - 👕 Uniforme: **RD$3,200.00**
   - 📚 Libros: **RD$2,500.00**

3. **Auto-actualización del Campo de Monto**:
   Se modifica el evento del selector de conceptos `window._selConcepto` para asociarle el precio asignado al concepto. Al hacer clic, por ejemplo, en **Libros**, la función lee que su precio es `2500` y ejecuta:
   ```javascript
   document.getElementById('paymentAmount').value = Number(conceptAmount).toFixed(2);
   ```
   Esto completa automáticamente el monto a transferir sin margen de error para el padre. Si el concepto tiene un monto libre (ej. `Otros`), el campo se limpia o se deja vacío para que el padre escriba de manera personalizada la cantidad.

---

## 5. Tabla de Estado de Conexión de Información (Auditoría de Integridad)

A continuación, se detalla un análisis del estado de la información entre los distintos paneles del sistema:

| Módulo / Sección | Panel Directora | Panel Maestra | Panel Padres | ¿Existe Sincronización Total? | Observaciones / Gaps Identificados |
| :--- | :--- | :--- | :--- | :---: | :--- |
| **Matrícula y Alumnos** | Alta, edición y asignación de aulas. | Visualización de listado y fichas de salud. | Gestión de datos del alumno y QR. | **Sí** | El código QR impreso por el padre se lee con la cámara del panel asistente/maestra de manera idéntica. |
| **Tareas / Evidencias** | Visualización general y reportes académicos. | Creación de tareas y corrección de evidencias. | Descarga de misiones, subida de archivos de evidencia. | **Sí** | Funcionamiento impecable. Sistema unificado de estados de entrega. |
| **Muro de Clase** | Publicación de anuncios a nivel escolar o aula. | Publicación de notas, fotos y eventos específicos de su aula. | Visualización interactiva y comentarios. | **Sí** | Conectado en tiempo real mediante canales de Supabase. |
| **Calificaciones** | Configuración de trimestres y reportes PDF. | Ingreso de notas (base-100 o escala conceptual). | Tablero interactivo con GPA y Chart.js. | **Sí** | Flujo directo. Al guardar la maestra, se recalcula el promedio del padre de inmediato. |
| **Asistencia** | Auditoría y control de retardos. | Pase de lista diario interactivo. | Visualización en calendario con justificaciones. | **Sí** | El padre puede reportar ausencias en tiempo real y son visibles para el staff de forma inmediata. |
| **Finanzas (Pagos)** | Control de cobros, reportes fiscales, caja de cobros físicos. | No interviene (Acceso restringido por seguridad). | Registro de comprobantes bancarios y descarga de recibos oficiales en PDF. | **Parcial (Gap de Precios)** | **El gap detectado en los precios de los botones ya fue analizado.** Adicionalmente, el padre solo ve sus cobros a partir del día 25 de cada mes para evitar spam visual antes de fecha de facturación. |
| **Rutina Diaria** | Auditoría de reportes y supervisión del aula. | Registro de comidas, esfínteres, siesta y temperatura. | Línea de tiempo cronológica con emojis del día del niño. | **Sí** | Estructuración ágil mediante datos JSONB optimizados. |

---

## 6. Conclusiones y Recomendaciones

El sistema del **Colegio Montessori Sonrisas Creativas** cuenta con una conexión de base de datos sumamente coordinada. Cada módulo tiene un propósito claro que acompaña al estudiante durante todo su año escolar.

El desliz lógico en la sección de pagos para padres es el único elemento desconectado del catálogo dinámico de cobros. Al aplicar la solución sugerida (la cual es sumamente sencilla gracias a que ya existe la tabla `payment_concepts` y la API de Supabase en el frontend), el sistema alcanzará un flujo financiero intuitivo y libre de confusiones para las familias.

---
*Fin del informe.*
