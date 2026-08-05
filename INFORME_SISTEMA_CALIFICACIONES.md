# INFORME DE AUDITORÍA Y PROPUESTA DE MEJORA: SISTEMA DE CALIFICACIONES PARA ESTANCIA INFANTIL
**Institución:** Colegio Montessori Sonrisas Creativas
**Fecha:** Febrero 2025
**Preparado para:** Directora y Equipo de Tecnología
**Modulo Principal:** Centro de Calificaciones (Maestra y Directora)

---

## 1. INTRODUCCIÓN Y CONTEXTO
Este informe técnico-pedagógico tiene como objetivo auditar el estado actual del **Sistema de Calificaciones** del ERP escolar del *Colegio Montessori Sonrisas Creativas*, analizando detalladamente cómo funciona el proceso de evaluación desde el inicio hasta el fin del período.

Asimismo, se expone un **desajuste crítico (brecha de diseño)** en el sistema: actualmente, mientras la Directora tiene visibilidad de un modelo moderno de evaluación por competencias y desarrollo infantil, el panel de la **Maestra** conserva un enfoque escolar tradicional y rígido con asignaturas numéricas tradicionales (como Matemáticas, Ciencias, Sociales, etc.) calificadas sobre una escala de 0 a 100.

En un centro que atiende a bebés y niños pequeños (**Maternal, Infantil, Caminadores, Párvulos y Preescolar**), este enfoque convencional no es funcional ni pedagógicamente adecuado. Este documento detalla cómo opera el sistema de calificaciones hoy en día y propone **15 mejoras estructurales concretas** para transformar la experiencia hacia un enfoque de **Procesos y Áreas de Desarrollo Psico-evolutivo**.

---

## 2. ANÁLISIS DEL SISTEMA DE CALIFICACIÓN ACTUAL (FLUJO COMPLETO)

El sistema de calificaciones opera bajo una arquitectura distribuida que conecta la base de datos Supabase, funciones remotas (RPCs), lógica de negocio en JavaScript y interfaces de usuario diferenciadas para la Directora, las Maestras y los Padres.

### A. Estructura de Datos en la Base de Datos (`schema.sql`)
La persistencia de las notas y el progreso académico se organiza en torno a tres tablas clave:
1. **`public.grades` (Calificaciones Formales):**
   - Almacena calificaciones individuales por estudiante, aula, período escolar e ID de año escolar.
   - Tiene columnas duales para las notas: `score` (antiguo, `numeric(4,2)`) y el nuevo estándar unificado `numeric_score` (sobre base 100, `numeric(5,2)`).
   - Registra la asignatura como un campo de texto (`subject`).
2. **`public.competency_scores` (Evaluación por Competencias):**
   - Diseñado originalmente para evaluar objetivos específicos de aprendizaje y desarrollo infantil.
   - Utiliza una escala cualitativa basada en estrellas (`stars` de 1 a 5) y etiquetas de nivel de logro (`excelente`, `bueno`, `proceso`, `apoyo`).
   - Está vinculado a la tabla `public.competencies` (Competencias) y esta a `public.academic_areas` (Áreas Académicas).
3. **`public.report_cards` (Boletas de Calificaciones):**
   - Es el consolidado histórico generado al cerrar un período.
   - Contiene promedios de tareas (`task_avg`), promedio de exámenes formales (`formal_avg`) y calificación final ponderada (`final_score`).
   - Almacena un resumen detallado del desarrollo del alumno en formato JSONB: `competency_summary` (registro de cada competencia) y `areas_summary` (promedios agregados de estrellas por área del desarrollo).

---

### B. El Proceso de Calificación: Desde el Inicio hasta el Cierre de Período

El ciclo de evaluación se divide en cuatro fases principales sincronizadas:

```
[ INICIO ] ──> Creación del Año Escolar & Períodos (Director)
                  │
                  ▼
[ TRANSVERSAL ] ──> Creación y Calificación de Tareas (Maestra)
                  │
                  ▼
[ EVALUACIÓN ] ──> Registro de Notas Formales o de Competencias (Maestra)
                  │
                  ▼
[ CIERRE ] ──> Función de Cierre de Período (Directora) ──> Boletas (JSONB)
```

#### 1. Inicio de Período (Sincronización Año-Período)
- **Acción:** La Directora crea un nuevo Año Escolar (ej: *2024-2025*). Al hacerlo, el sistema puede disparar la creación automática de períodos (Trimestres o Bloques) para cada aula mediante la función de base de datos `create_school_year_with_periods()`.
- **Efecto en la Maestra:** Al entrar al panel, el sistema detecta de forma dinámica el período activo mediante la función remota `get_active_period()`. Las tareas creadas y las calificaciones registradas se asocian de manera automática a este período de evaluación activo.

#### 2. Evaluación Continua (Transversal al Período)
- **Registro de Tareas:** La maestra asigna actividades de forma regular. El progreso se califica sobre una escala de 0 a 100. Al guardar, las calificaciones se guardan de forma instantánea en `task_evidences`.
- **Registro de Notas Formales:** En la pestaña "Exámenes Formales", la maestra dispone de una cuadrícula que cruza el listado de alumnos de su aula con las asignaturas configuradas. Cada celda cuenta con guardado automático al perder el foco (`change` event) o mediante el botón "Guardar Todo".

#### 3. Cierre de Período y Bloqueo de Datos
- **Ejecución:** La Directora revisa los KPIs globales en su módulo académico y decide dar por terminado el trimestre ejecutando la función `close_period(p_period_id)`.
- **Lógica Interna (Cálculos de Promedios en SQL):**
  1. El sistema recupera el promedio de tareas (`task_avg`) ponderando el `numeric_score` registrado o convirtiendo las estrellas (`stars * 20`) y las letras (`A=95, B=85`, etc.).
  2. Obtiene el promedio formal (`formal_avg`) sumando las notas guardadas en la tabla de calificaciones formales.
  3. Aplica una ponderación estándar (**60% tareas + 40% formal**) para obtener la calificación final (`final_score`).
  4. Genera el consolidado cualitativo para preescolar: agrupa todas las evaluaciones de la tabla `competency_scores` por área académica, calcula el promedio de estrellas y lo inserta en la columna `areas_summary` del registro histórico en formato JSONB.
- **Efecto de Bloqueo (Disparadores de Base de Datos):**
  - Una vez que el estado del período cambia a `'closed'`, los triggers de seguridad de base de datos (`enforce_period_not_closed` en las tablas `grades`, `tasks`, `task_evidences`, `competency_scores`) **bloquean inmediatamente cualquier intento de escritura o modificación** por parte de las maestras para asegurar la inmutabilidad de los reportes.

---

## 3. LA BRECHA PEDAGÓGICA ACTUAL: MATERIAS TRADICIONALES VS. PROCESOS DE DESARROLLO

Existe una profunda incoherencia pedagógica en la forma en que está codificada la lógica de la Maestra en el archivo `js/maestra/modules/grades.js`.

### A. El Modelo Escolar Tradicional Codificado en la Maestra
El sistema de la maestra asume que está evaluando a estudiantes de educación básica o media superior, utilizando el siguiente listado estático:

```javascript
const SUBJECTS = [
  'Matemáticas', 'Español', 'Ciencias', 'Sociales', 'Inglés',
  'Educación Física', 'Arte', 'Música', 'Religión', 'Tecnología'
];
```

*¿Por qué esto no funciona para bebés y niños pequeños?*
- **Aulas de Maternal y Bebés (0-12 meses, Caminadores 1-2 años):** No existe un "examen de matemáticas" o una "tarea de ciencias" para un bebé que está aprendiendo a gatear, sostener el biberón o controlar el agarre de objetos. Sus logros se miden en hitos de motricidad y control corporal.
- **Párvulos e Infantil (2-3 años):** Su aprendizaje es lúdico y holístico. Se evalúa el desarrollo socioemocional (interacción con otros, manejo de la frustración), el control de esfínteres (higiene), el desarrollo de la expresión oral y habilidades sensoriales.
- **Preescolar (3-5 años):** Aunque se introducen nociones lógico-matemáticas y de pre-escritura, la enseñanza sigue basándose en rincones de aprendizaje y proyectos de exploración, no en asignaturas aisladas con exámenes sobre 100 puntos.

### B. El Modelo Correcto de Competencias (Existente en Directora pero Desconectado de la Maestra)
En el backend y en las vistas de la Directora (`grades.module.js`), el sistema cuenta con una arquitectura de competencias de primera infancia robusta, estructurada bajo las siguientes **7 Áreas de Desarrollo**:

1. **Lenguaje (languages):** Vocabulario, expresión oral, discriminación fonética.
2. **Matemática (calculator):** Lógica, seriación, clasificación por forma/tamaño, nociones espaciales.
3. **Desarrollo Infantil (heart):** Autonomía individual, habilidades de socialización, expresión emocional.
4. **Psicomotricidad (activity):** Motricidad gruesa (coordinación, saltar, correr) y motricidad fina (agarre de pinza, trazos).
5. **Arte y Creatividad (palette):** Modelado, música, pintura dactilar y libre.
6. **Ciencias Naturales (leaf):** Cuidado del entorno, reconocimiento de elementos de la naturaleza.
7. **Formación Valores (star):** Normas de convivencia, respeto, hábitos de orden.

### C. Cuadro Comparativo: Lo que la Maestra ve vs Lo que la Pedagogía Montessori y de Cuidado Infantil requiere

| Aula / Nivel | Materia Tradicional en el Sistema (Incorrecto) | Proceso de Desarrollo Real (Correcto) | Método de Evaluación Adecuado |
| :--- | :--- | :--- | :--- |
| **Maternal / Bebés (0-12m)** | Matemáticas, Español, Tecnología | Hitos del desarrollo (Sostén cefálico, rastreo, agarre, balbuceo) | Observación directa, bitácoras diarias de rutina (`daily_logs`). |
| **Caminadores (1-2 años)** | Ciencias, Sociales, Religión | Motricidad gruesa (marcha), lenguaje comprensivo, socialización | Escala de estrellas (1-5★) sobre competencias específicas. |
| **Párvulos (2-3 años)** | Inglés, Educación Física | Control de esfínteres, lenguaje expresivo, juego simbólico | Registro cualitativo por periodos del progreso del desarrollo. |
| **Preescolar (3-5 años)** | Exámenes de Matemáticas / Ciencias | Pensamiento lógico, habilidades motrices finas, autonomía | Logro de competencias (Excelente, Muy Bien, En desarrollo). |

---

## 4. PROPUESTA DE ARQUITECTURA DE INTEGRACIÓN Y MEJORAS CONCRETAS

Para cerrar esta brecha y unificar la lógica del Colegio Montessori Sonrisas Creativas, proponemos un rediseño que reemplace la rigidez de las materias por un **motor de evaluación dinámico según el nivel de cada aula**.

### A. Lógica de Segmentación por Nivel
El sistema debe detectar el nivel del aula (`level` en la tabla `classrooms` que puede ser `'Maternal'`, `'Infantil'`, `'Caminadores'`, `'Párvulos'`, `'Preescolar'` o `'Básico'`) y adaptar la interfaz del maestro automáticamente:

```
                  ┌───────────────────────────────┐
                  │ ¿Cuál es el Nivel del Aula?   │
                  └───────────────┬───────────────┘
                                  │
         ┌────────────────────────┴────────────────────────┐
         ▼                                                 ▼
[ Niveles 0-5 años ]                                [ Nivel Primario ]
(Maternal, Infantil, Párvulos)                      (Básico, 1ro-6to)
         │                                                 │
         ▼                                                 ▼
- Ocultar Notas Numéricas (0-100)                  - Mostrar Notas Numéricas
- Ocultar Materias Tradicionales                   - Mostrar Materias Tradicionales
- Mostrar Áreas de Desarrollo                      - Notas con Exámenes Formales
- Evaluar con Escala Cualitativa o Estrellas (1-5)  - Boletines Tradicionales
- Conexión Directa con Bitácora de Rutina
```

---

### B. Lista de 15 Mejoras Estructurales y Pedagógicas

#### 1. Segmentación Automática de Interfaz de Evaluación por Nivel
- **Mejora:** Modificar `grades.js` en el panel de la maestra para inspeccionar la propiedad `level` del aula seleccionada de manera interactiva. Si el nivel es de primera infancia, la pestaña "Exámenes Formales" cambia su nombre por **"Evaluación de Procesos"** o **"Áreas de Desarrollo"**.

#### 2. Reemplazo Dinámico de Materias por Áreas del Desarrollo (0-6 años)
- **Mejora:** Eliminar el array estático `SUBJECTS` para aulas de primera infancia. En su lugar, el sistema debe consultar la tabla de base de datos `academic_areas` para renderizar como columnas las áreas correspondientes (*Lenguaje, Psicomotricidad, Desarrollo Infantil, etc.*).

#### 3. Escala Cualitativa Unificada de 1 a 5 Estrellas para Maestras
- **Mejora:** Reemplazar los campos de entrada numéricos de 0-100 por un selector interactivo de estrellas o botones cualitativos para aulas infantiles, alineándose de forma directa con los niveles de logro:
  - 1★: Requiere Seguimiento (Rojo)
  - 2★: Necesita Apoyo (Naranja)
  - 3★: En Desarrollo (Amarillo)
  - 4★: Muy Bien (Verde Claro)
  - 5★: Excelente (Esmeralda)

#### 4. Integración Directa entre "Rutinas Diarias" y "Calificaciones"
- **Mejora:** Crear un puente de datos. Los registros diarios de comportamiento (social, atención en clase, desarrollo Montessori) recopilados en la bitácora de rutina (`daily_logs.infant_data`) deben acumularse de forma automática para sugerir a la maestra una pre-calificación en estrellas al final del trimestre.

#### 5. Módulo Especializado de Hitos del Desarrollo para Bebés (Maternal)
- **Mejora:** Para aulas con bebés de 0 a 12 meses, suspender la cuadrícula trimestral estándar. En su lugar, mostrar un panel de "Lista de Control de Hitos Psico-evolutivos" (ej: *sostiene la cabeza, balbucea, gatea*), donde la maestra simplemente marca "Sí / En Proceso / Aún no" con la fecha de observación.

#### 6. Sistema de "Logros Montessori" Interactivos
- **Mejora:** Introducir el registro de hitos del método Montessori, permitiendo marcar de forma cualitativa el nivel de relación del niño con los materiales del aula: **Presentado (P) -> En Práctica (EP) -> Dominado (D)**. Esto reemplaza con éxito la concepción tradicional de exámenes prácticos.

#### 7. Generación Dinámica de Comentarios Automatizados de Redacción Profesional
- **Mejora:** Integrar un asistente de sugerencias de comentarios para las boletas de calificaciones basado en los logros del niño (ej: *"Se observa un avance significativo en su motricidad fina, manipula con precisión objetos de encaje. Se recomienda continuar fomentando la autonomía en el aseo en el hogar"*).

#### 8. Migración de Criterios de Evaluación a Competencias Reales en Supabase
- **Mejora:** Utilizar la tabla `competency_scores` directamente en el panel de la maestra para realizar inserciones y actualizaciones. Actualmente, las maestras solo guardan en la tabla `grades`, dejando vacía la tabla de competencias a menos que la Directora la modifique. El maestro debe ser el originador del dato.

#### 9. Sincronización del "Pase de Lista" con la Rutina y Evaluación
- **Mejora:** Asegurar que si un niño es marcado como "Ausente" en la asistencia, el sistema bloquee automáticamente la carga de evaluaciones para ese día tanto en la bitácora de rutina como en el sistema de tareas, evitando incongruencias de registros.

#### 10. Vista Familiar Amigable y Colorida en el Panel de Padres
- **Mejora:** Adaptar el boletín que visualizan los padres. En lugar de una boleta numérica que puede alarmar o frustrar a las familias sobre el desarrollo de niños tan jóvenes, mostrar gráficos circulares coloridos de las áreas del desarrollo y barras visuales de estrellas con comentarios de aliento y consejos de crianza.

#### 11. Creación de Alertas de "Atención Temprana" por Área de Desarrollo
- **Mejora:** Si un estudiante obtiene calificaciones recurrentes de 1 o 2 estrellas en áreas clave de desarrollo durante el período (ej: Psicomotricidad o Lenguaje), el sistema debe emitir una alerta privada a la Directora recomendando una reunión de apoyo psicopedagógico.

#### 12. Historial Psico-evolutivo Multi-anual del Alumno (Expediente Digital)
- **Mejora:** Permitir que la Directora y la Psicóloga del centro vean el avance longitudinal de las áreas de desarrollo del niño desde que ingresó en Maternal hasta que egresa de Preescolar, visualizando curvas de progreso en motricidad, lenguaje y madurez emocional.

#### 13. Registro Rápido por Códigos QR para Evaluaciones Observacionales
- **Mejora:** Diseñar hojas de observación rápida impresas con códigos QR de cada alumno. Al escanear el código QR con el celular de la maestra, se abre de forma inmediata el modal de su expediente para registrar una nota observacional o hito dominado sobre la marcha en el aula.

#### 14. Exportación Profesional de Carpetas de Evidencias de Desarrollo
- **Mejora:** Desarrollar un exportador PDF estético que recopile no solo las notas de las áreas académicas, sino también la bitácora de fotos del aula (`classroom_gallery`) vinculadas al desarrollo del alumno, entregando una hermosa carpeta digital de recuerdos y progresos a los padres al final del ciclo.

#### 15. Control de Fechas de Carga Límitadas por Aula
- **Mejora:** Permitir que la Directora asigne fechas límites de carga diferenciadas para las evaluaciones cualitativas por aula (ej: Maternal califica en fechas diferentes a Preescolar), enviando recordatorios amigables mediante notificaciones internas a las maestras del nivel correspondiente.

---

## 5. CONCLUSIONES
La implementación de estas reformas transformará el ERP de un sistema escolar rígido e impersonal en una **herramienta de vanguardia Montessori y de Estimulación Temprana**. Adaptar el módulo de notas de las maestras para que trabaje sobre **procesos evolutivos** en lugar de asignaturas numéricas respetará el ritmo de crecimiento natural de los bebés y niños, reducirá la carga de trabajo innecesaria de los docentes y ofrecerá información de incalculable valor pedagógico a las familias.