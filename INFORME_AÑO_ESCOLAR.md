# INFORME TÉCNICO-PROFESIONAL: AUDITORÍA, LOGÍSITICA Y ARQUITECTURA DE SINCRONIZACIÓN DEL AÑO ESCOLAR Y CICLO DE LA ESTANCIA
**Colegio Montessori Sonrisas Creativas (Karpus Kids)**
*Autor: Jules, Especialista Principal de Ingeniería de Software & Sistemas Educativo-Contables*

---

## INTRODUCCIÓN

En una institución de atención a la primera infancia (Estancia Infantil / Centro de Estimulación Temprana) y educación inicial, el **Año Escolar** y sus **Períodos Académicos** no representan simplemente fechas en un calendario; son el **núcleo de sincronización de tres dimensiones críticas**:

1. **La Dimensión Pedagógica (Educación):** Define la evolución del niño, la transición en el plan de desarrollo cognitivo/psicomotor (especialmente para menores de 6 años) y los momentos de evaluación y entrega de boletines.
2. **La Dimensión Administrativa (Logística de la Estancia):** Coordina la asignación de aulas basada en el desarrollo y la edad, el control de capacidad de los salones, el enrolamiento continuo de estudiantes y el paso de asistencia diario.
3. **La Dimensión Financiera (Contabilidad):** Rige el devengamiento de matrículas, mensualidades, planes de pago específicos (único, doble o fraccionado), moras automáticas (5% mensual) y el cumplimiento tributario ante la DGII (envíos de reportes 606, 607, e-CF).

Este informe presenta un análisis exhaustivo del sistema actual, evalúa la sincronización real de estas tres dimensiones en los paneles existentes (**Directora, Asistente, Encargada, Padres y Maestra**), establece la lógica profesional de una estancia infantil moderna de ciclo continuo, y propone **50 mejoras de nivel empresarial** para llevar el sistema a la excelencia absoluta.

---

## 1. AUDITORÍA DEL ESTADO ACTUAL DEL SISTEMA

### A. Estructura de Datos (Base de Datos)
El sistema cuenta con una arquitectura de base de datos relacional robusta en Supabase (reflejada en `schema.sql`) estructurada de la siguiente manera:

*   **`public.school_years`**: Almacena el año escolar físico. Campos clave: `id`, `name` (ej. '2026-2027'), `start_date`, `end_date`, `status` (`'upcoming'`, `'active'`, `'closed'`), e `is_current` (booleano que determina el año por defecto de la aplicación).
*   **`public.periods`**: Los trimestres o ciclos de evaluación dentro del año escolar. Están vinculados tanto a un año escolar (`school_year_id`) como a un aula específica (`classroom_id`). Esto permite flexibilidad total: diferentes aulas pueden llevar ritmos de períodos individuales si es necesario.
*   **`public.student_enrollments`**: El nexo histórico y actual de los estudiantes con los años escolares. Registra la relación matriculada entre `student_id`, `school_year_id`, `classroom_id`, `payment_plan_id` y el estado del alumno (`status` como `'preinscrito'`, `'admitido'`, `'inscrito'`, `'egresado'`).
*   **`public.payment_plans` y `public.plan_installments`**: Los esquemas tarifarios de inscripción y colegiaturas. Las cuotas mensuales (`installments`) están vinculadas al plan de pago, el cual depende directamente de un `school_year_id`. Esto asegura que los montos cobrados correspondan estrictamente a los precios configurados para ese ciclo académico específico.
*   **`public.student_charges`**: Los débitos o cargos generados para los estudiantes en función de sus inscripciones en un año escolar determinado.

### B. Funciones Almacenadas (RPC) y su Comportamiento
*   **`create_school_year_with_periods(p_name, p_start_date, p_end_date, p_classroom_ids, p_num_periods)`**:
    *   *Lógica:* Permite a la Directora crear un año escolar nuevo en estado `'upcoming'`. Si se marca la creación automática de períodos, calcula de forma equitativa las fechas de inicio y fin para `p_num_periods` (por defecto 3 trimestres) y los inserta en `periods` duplicados para cada aula activa.
    *   *Estado actual:* Correcto e idóneo, asegura que cada aula tenga sus períodos definidos desde el primer día.
*   **`get_active_period(p_classroom_id)`**:
    *   *Lógica:* Recupera el período marcado como `is_active = true` para el aula provista. Si no se provee o no se encuentra, busca el último período activo global, o el último en estado `'open'`.
    *   *Estado actual:* Funcional para flujos generales, pero expuesto a imprecisiones si múltiples aulas tienen configuraciones de calendario dispares.
*   **`close_period(p_period_id)`**:
    *   *Lógica:* Función de alta complejidad ejecutada por la Directora. Reúne las calificaciones de tareas diarias (`task_evidences`) dentro del rango de fechas del período (ponderación del 60%) y las calificaciones formales ingresadas por la maestra (`grades`) vinculadas al período (ponderación del 40%). Calcula la nota promedio ponderada base-100 para cada estudiante activo del aula, asigna una equivalencia cualitativa (Excelente, Muy Bueno, Bueno, etc.), inserta o actualiza los registros en `report_cards` (boletines), desactiva el período (`is_active = false`) y lo cierra (`status = 'closed'`).
    *   *Estado actual:* Excelente diseño conceptual, protege la inmutabilidad de los boletines históricos una vez que el ciclo ha concluido.
*   **`activate_period(p_period_id)`**:
    *   *Lógica:* Desactiva los períodos actualmente activos para el aula correspondiente y activa el período seleccionado, cambiando su estado a `'open'`.
*   **`convert_preregistration(p_preinsc_id, p_school_year_id, p_classroom_id, p_payment_plan_id, p_matricula)`**:
    *   *Lógica:* Toma los datos recolectados en el formulario público de preinscripción (`student_preregistrations`), crea el registro físico del niño en `students`, crea su matrícula en `student_enrollments` para el año escolar indicado y marca la preinscripción como convertida.

---

## 2. MAPEO DE VINCULACIÓN Y VÍA DE SINCRONÍA POR PANEL (AUDITORÍA VISUAL)

Analicemos cómo interactúan hoy los 5 roles clave con el año y período escolar en el frontend:

```
┌────────────────────────────────────────────────────────────────────────┐
│                          BASE DE DATOS (SUPABASE)                      │
│             AÑO ESCOLAR ACTIVO  <--->  PERÍODOS POR AULA               │
└──────────────────┬──────────────┬──────────────┬─────────────┬─────────┘
                   │              │              │             │
                   ▼              ▼              ▼             ▼
             ┌──────────┐   ┌──────────┐   ┌──────────┐  ┌───────────┐
             │ DIRECTORA│   │ ASISTENTE│   │ENCARGADA │  │  PADRES   │
             └──────────┘   └──────────┘   └──────────┘  └───────────┘
```

### 1. Panel de la Directora (`panel_directora.html` y módulos JS)
*   **Visualización:** Tiene control total del ciclo de vida.
    *   El módulo `SchoolYearModule` le permite dar de alta nuevos años escolares, editarlos y marcar uno como "Año Actual" (`is_current = true`).
    *   El módulo `AcademicCycleModule` posee un selector dinámico (`#yearSelector`) en su cabecera. Al cambiar de año escolar, todo el contenido de las pestañas (Preinscripciones, Inscripciones, Planes de Pago, Cargos de los Alumnos y Reinscripciones) se recarga inmediatamente filtrando por el año seleccionado.
*   **Sincronía:** Excelente en el backend y frontend. Las mutaciones en tiempo real (`RealtimeManager`) actualizan la pantalla si otra persona genera cambios pedagógicos o administrativos.

### 2. Panel de la Asistente (`panel_asistente.html` y módulos JS)
*   **Visualización:** El panel de la Asistente está diseñado para el trabajo operativo del día a día (asistencia de profesores, alumnos, pagos rápidos, caja de cobro, incidencias).
*   **Sincronía (Brecha Detectada):** **Falta de conciencia del Año Escolar Activo.**
    *   En las búsquedas de estudiantes y listado de caja, se listan los alumnos globales sin un filtro superior explícito que discrimine si pertenecen al año escolar activo o a ciclos archivados.
    *   En los gráficos financieros e informes de cobro de `payments.js`, los filtros temporales están hardcodeados utilizando el año calendario (`String(new Date().getFullYear())`). Esto genera un desajuste crítico: si el año escolar es `2026-2027`, los reportes financieros anuales de la asistente cortarán abruptamente el 31 de diciembre, separando artificialmente la contabilidad del ciclo escolar real.

### 3. Panel de la Encargada (`panel_encargada.html` y módulos JS)
*   **Visualización:** La Encargada de Administración y Cobros gestiona facturas, planes de cobro, conciliación y deudas.
*   **Sincronía (Brecha Detectada):** **Operación a ciegas del ciclo académico.**
    *   No tiene un selector visual persistente en la barra superior o lateral que le indique sobre qué Año Escolar está operando. Esto puede provocar errores catastróficos, como aplicar un pago de colegiatura o generar un cargo de mora en un ciclo cerrado, o no distinguir matrículas de reingresos entre períodos consecutivos.
    *   El módulo de eficiencia docente (`teacher_efficiency.module.js`) opera con métricas estáticas en lugar de calcular la eficiencia en función del cumplimiento del cronograma del período académico activo actual.

### 4. Panel de la Maestra (`panel-maestra.html` y módulos JS)
*   **Visualización:** La Maestra opera exclusivamente a nivel de su Aula asignada.
*   **Sincronía (Lógica Pedagógica de Periodo):**
    *   En el paso de asistencia y diario de rutinas, el sistema se enfoca en el día calendario, lo cual es correcto.
    *   En el módulo de calificaciones (`js/maestra/modules/grades.js`), el sistema obtiene la información del período activo del aula (`_periodInfo?.period?.school_year_id`). Cuando la maestra introduce notas formales o evalúa tareas, estas se guardan automáticamente ligadas al ID del período abierto del aula.
    *   *Brecha:* No dispone de una interfaz amigable para auditar períodos cerrados del mismo año escolar ni para comparar el progreso interperíodos de sus alumnos sin necesidad de salir de su flujo operativo estándar.

### 5. Panel de los Padres (`panel_padres.html` y módulos JS)
*   **Visualización:** El Padre visualiza la información de su hijo asociado de manera directa y simplificada.
*   **Sincronía (Detección de Nuevo Ciclo - Funcionalidad Destacada):**
    *   El archivo `js/padre/main.js` cuenta con una rutina automatizada llamada `_checkNewAcademicPeriod(classroomId)`.
    *   Cada vez que el padre inicia sesión o recarga el panel, se ejecuta el RPC `get_active_period` en Supabase para el aula del niño.
    *   Si el ID del período activo devuelto no coincide con el guardado en el navegador (`localStorage.getItem('karpus_last_period_...')`), el sistema despliega de inmediato un sofisticado banner flotante de bienvenida con efectos de desenfoque de fondo y animación elástica (`karpusBounceIn`).
    *   Este banner educa al padre sobre los cambios automáticos del nuevo ciclo:
        1.  *Muro Renovado:* Las publicaciones anteriores del muro se archivan, permitiendo ver solo las novedades de este trimestre.
        2.  *Tareas Actualizadas:* Las asignaciones previas se guardan en el historial de tareas, mostrando únicamente las pendientes de este período.
        3.  *Boletín de Calificaciones:* Se notifica que las notas del período anterior ya se encuentran firmadas y consolidadas en la pestaña "Boletines" para su descarga en PDF.
    *   *Estado actual:* Es uno de los flujos de sincronización mejores logrados de la plataforma.

---

## 3. LA LÓGICA DE LA ESTANCIA INFANTIL DE PRIMERA INFANCIA (0 A 6 AÑOS)
### ¿Cómo debe funcionar el ciclo de vida en un único sistema unificado?

Una estancia infantil no funciona como una escuela primaria o secundaria tradicional. Mientras que los colegios convencionales operan bajo un modelo rígido de año cerrado (septiembre a junio, donde todos ingresan y egresan al mismo tiempo), la estancia infantil de primera infancia se rige por un **modelo híbrido de ciclo continuo y evolución biológica/madurativa**.

```
    ┌──────────────────────────┐
    │  PREINSCRIPCIÓN PÚBLICA  │ <--- Todo el año / Enfoque de captación
    └─────────────┬────────────┘
                  ▼
    ┌──────────────────────────┐
    │ PERÍODO DE ADAPTACIÓN    │ <--- 1-2 semanas / Control conductual y de llanto
    └─────────────┬────────────┘
                  ▼
    ┌──────────────────────────┐
    │ ESTIMULACIÓN Y RUTINAS   │ <--- Control diario (Comidas, Sueño, Esfínteres, Temp)
    └─────────────┬────────────┘
                  ▼
    ┌──────────────────────────┐
    │  TRANSICIÓN POR EDAD     │ <--- Movimiento de Aula intra-año por hitos madurativos
    └─────────────┬────────────┘
                  ▼
    ┌──────────────────────────┐
    │ REINSCRIPCIÓN AUTOMÁTICA │ <--- Ciclo financiero continuo
    └──────────────────────────┘
```

### Características de la Logística de Estancia Infantil:
1.  **Ingreso en cualquier mes del año:** Los bebés nacen todos los días; las madres se reincorporan a sus trabajos tras el período de maternidad en cualquier mes. Por lo tanto, el sistema debe permitir preinscripciones, admisiones y generación de planes de cobro prorrateados en cualquier momento del ciclo escolar.
2.  **Transición basada en hitos de desarrollo y edad:** Un bebé de 6 meses (Lactantes) no puede permanecer en el mismo aula cuando cumple 12 o 15 meses (Maternal). El niño debe migrar de aula (ej. de "Lactantes A" a "Maternal B") a mitad del año escolar. Esto implica que su matrícula académica (`student_enrollments`) y su asignación de aula deben poder modificarse dinámicamente sin alterar sus registros de cobro históricos ni sus evaluaciones de hitos madurativos tempranos.
3.  **Control exhaustivo de rutinas diarias frente a asignaciones tradicionales:** Un niño menor de 3 años no recibe tareas tradicionales con calificaciones base-100. En su lugar, el sistema de la maestra registra siestas, ingesta de leche/alimentos, deposiciones y control de temperatura (rutina de cuidado infantil). Para niños mayores de 4 a 6 años (Pre-kinder, Kinder, Pre-primario), el ciclo evoluciona gradualmente hacia proyectos, tareas y evaluaciones formales.
4.  **Sincronización Educativo-Contable Estricta:** Cada cambio de aula o de nivel de desarrollo madurativo puede implicar un cambio en la tarifa (ejemplo: las aulas de lactantes requieren mayor número de personal de cuidado, por lo que la mensualidad suele diferir de las aulas de nivel inicial). El sistema debe actualizar el plan de pagos del estudiante y generar de manera contable los cargos correctos respetando la facturación DGII al momento del cambio de aula.

---

## 4. INFORME DE DIAGNÓSTICO: ¿EL SISTEMA CUENTA CON ESTO?

### ¿Qué tiene actualmente implementado el sistema?
*   **Sí cuenta con:**
    *   Creación automatizada de trimestres en lotes vinculados al año escolar actual y a cada una de las aulas activas (`create_school_year_with_periods`).
    *   Formulario inteligente de preinscripción en línea que detecta automáticamente el año escolar activo y permite a los padres postularse en cualquier momento del año.
    *   Separación conceptual de estados de matrícula: el alumno puede estar en estado preinscrito, admitido, inscrito o egresado.
    *   Módulo de facturación robusto que genera automáticamente comprobantes de NCF para las colegiaturas basándose en los planes de pago definidos para el año escolar.
    *   Efecto de reinicio de muro y tareas automatizado en tiempo real para el panel de padres cuando un trimestre concluye e inicia el siguiente.

### ¿Qué le falta o presenta oportunidades de mejora para ser 100% profesional?
*   **Falta de:**
    *   **Prorrateo automatizado:** El sistema asume que el plan de pago se factura de manera fija e idéntica independientemente del día de ingreso. Si un bebé ingresa el 20 del mes, no existe un prorrateo inteligente del cobro del primer mes.
    *   **Flujo formal de adaptación de primera infancia:** No hay un seguimiento del "Período de Adaptación" (las primeras dos semanas donde se evalúa el nivel de llanto, socialización y aceptación de alimentos del lactante/maternal).
    *   **Historial de transiciones intra-año:** Si un niño cambia de aula de lactantes a maternal a mitad del año, se sobrescribe su `classroom_id` en la tabla `students`, perdiéndose el historial de en qué aula estuvo durante el primer trimestre del mismo ciclo escolar.
    *   **Falta de unificado de Caja e Informes por Año Escolar:** Las vistas financieras de caja operan bajo año calendario, desincronizándose de los ejercicios contables escolares.

---

## 5. 50 MEJORAS PROFESIONALES PARA LLEVAR EL SISTEMA AL NIVEL ERP PREMIUM

A continuación se detallan **50 mejoras concretas**, organizadas por áreas de impacto, diseñadas bajo las mejores prácticas internacionales de arquitectura de software y gestión educativa.

### Bloque A: Arquitectura de Base de Datos y Motor SQL (Mejoras 1 - 10)
1.  **Historial de Cambios de Aula (`student_classroom_history`)**: Crear una tabla intermedia que registre la fecha de entrada, fecha de salida y motivo por el cual un niño cambia de aula a lo largo del año escolar para evitar la pérdida de trazabilidad.
2.  **Tabla de Período de Adaptación (`adaptation_logs`)**: Diseñar una tabla que capture el comportamiento, nivel de llanto, apetito y sueño del niño durante sus primeros 10 días en la estancia.
3.  **Campo de Prorrateo en Cobros**: Agregar una columna `prorated_amount` en `student_charges` para admitir facturaciones fraccionadas automáticas para ingresos tardíos a mitad de mes.
4.  **Campo de Tipo de Período en `periods`**: Permitir clasificar períodos pedagógicos (trimestres/bimestres) frente a períodos de cuidado o campamentos de verano que se gestionan de manera independiente.
5.  **Restricción de Integridad para Clierre de Año**: Crear un trigger en Postgres que impida cerrar un año escolar (`school_years.status = 'closed'`) si existen períodos abiertos (`periods.status = 'open'`) vinculados a dicho año.
6.  **Copia de Configuración de Planes de Pago**: Añadir una función SQL que permita clonar la estructura de planes de pago y cuotas de un año escolar anterior al nuevo año escolar creado con un solo clic.
7.  **Campos de Edad de Control en Aulas**: Incorporar campos de rango de edad sugerida (ej. `age_min_months`, `age_max_months`) en la tabla `classrooms` para validar automáticamente si el estudiante corresponde al aula asignada.
8.  **Historial de Audit Logs Enriquecido**: Ampliar los metadatos de auditoría en `audit_logs` para registrar exactamente qué usuario modificó el estado de un período escolar o cerró un boletín de notas.
9.  **Tabla de Descuentos y Becas del Año Escolar**: Crear una tabla `enrollment_discounts` vinculada al año escolar para aplicar rebajas porcentuales o fijas en las mensualidades de hermanos o becados de forma automatizada.
10. **Índice de Rendimiento Escolar**: Crear un índice compuesto en la tabla `report_cards` sobre `(school_year_id, classroom_id, final_score)` para optimizar la velocidad de generación de reportes globales de fin de año.

### Bloque B: Interfaz de Usuario y UX por Panel (Mejoras 11 - 25)

#### Panel de la Directora (Mejoras 11 - 14)
11. **Barra de Estado Global del Año Escolar**: Agregar un indicador flotante persistente en la parte superior derecha de la pantalla que muestre el Año Escolar y Período Activo actual del sistema con un atajo para cambiarlo.
12. **Asistente de Creación de Ciclo Paso a Paso**: Diseñar un wizard interactivo para la creación de años escolares que guíe a la directora en la definición de fechas, generación de períodos, copia de planes de pago y asignación de maestras a aulas.
13. **Dashboard de Transiciones por Edad**: Mostrar una alerta inteligente a la directora listando los niños que han alcanzado la edad límite de su aula actual (ej. cumplió 1 año y medio en lactantes) para sugerir su transición a maternal.
14. **Panel de Control de Boletines Pendientes**: Implementar una vista consolidada que muestre qué maestras no han completado las calificaciones del trimestre antes de proceder al cierre oficial del período.

#### Panel de la Asistente (Mejoras 15 - 18)
15. **Selector de Año Escolar en Registro de Asistencia**: Permitir a la asistente verificar históricos de asistencia escolar de años anteriores cambiando el selector de ciclo de forma inmediata.
16. **Filtro de Alumnos por Año Escolar en Búsqueda Rápida**: Evitar la confusión de listados ocultando por defecto a los estudiantes egresados de ciclos anteriores en la barra de búsqueda rápida del día a día.
17. **Caja Diaria Inteligente con Contexto de Matrícula**: En la interfaz de cobros rápidos, destacar visualmente si el pago recibido corresponde a una matrícula del año escolar entrante ("Reinscripción") o a colegiaturas rezagadas del año actual.
18. **Visualización de Período de Adaptación**: Permitir a la asistente identificar rápidamente qué niños están en su fase de adaptación (primera/segunda semana) para darles prioridad en la recepción de la puerta por la mañana.

#### Panel de la Encargada de Administración (Mejoras 19 - 21)
19. **Pantalla de Auditoría Contable de Mensualidades**: Una cuadrícula interactiva que muestre mes a mes (de agosto a junio) qué estudiantes han pagado, quiénes están pendientes y quiénes tienen saldo a favor dentro del año escolar seleccionado.
20. **Consola de Configuración de Planes de Pago**: Diseñar una interfaz interactiva donde la encargada pueda arrastrar y soltar cuotas, definir fechas de vencimiento personalizadas y configurar el día de corte para la aplicación de la mora del 5%.
21. **Alertas de Desajuste de Plan**: Notificar automáticamente a la encargada si un estudiante está asignado a un aula cuyo nivel no coincide con el nivel de su plan de pago (ej. plan de maternal en aula de pre-kinder).

#### Panel de la Maestra (Mejoras 22 - 23)
22. **Línea de Tiempo del Progreso del Alumno**: Mostrar en la ficha del niño un gráfico evolutivo interperíodos de sus calificaciones pedagógicas o hitos del desarrollo logrados en el año escolar actual.
23. **Selector Rápido de Períodos Históricos**: Permitir a la maestra consultar de manera de solo lectura los trabajos y evidencias de trimestres ya cerrados del mismo año para fines de comparación pedagógica.

#### Panel de los Padres (Mejoras 24 - 25)
24. **Centro de Descarga de Boletines Históricos**: Crear una sección exclusiva y elegante titulada "Mi Historial Académico" donde el padre pueda descargar en formato PDF los reportes de calificaciones de años anteriores de su hijo.
25. **Seguimiento Visual del Período de Adaptación**: Mostrar un gráfico amigable con emojis (ejemplo: caritas de felicidad, tranquilidad, llanto controlado) que muestre al padre cómo ha ido progresando el niño en sus primeros días de estancia.

### Bloque C: Integración Financiera y Contabilidad Unificada (Mejoras 26 - 35)
26. **Cierre de Ejercicio Contable Alineado al Año Escolar**: Configurar los reportes de pérdidas y ganancias (P&G) y balances de comprobación para que se puedan generar utilizando las fechas de inicio y fin del año escolar (ej. 1 de agosto a 30 de junio) y no solo el año fiscal tradicional.
27. **Devengamiento Mensual Automatizado de Matrículas**: Implementar un sistema que reconozca el ingreso de la matrícula de forma diferida a lo largo de los meses del año escolar para un reflejo contable profesional de acuerdo con las NIIF.
28. **Generación Masiva de Cargos por Trimestre**: Automatizar la creación de cargos adicionales específicos de período (ejemplo: materiales de estudio al inicio de cada trimestre) vinculados de forma masiva a todos los alumnos inscritos en ese ciclo.
29. **Auditoría de Moras de Fin de Año**: Permitir la exoneración masiva o el cálculo consolidado del 5% de mora acumulada para saldos pendientes al momento de declarar el año escolar como "Cerrado".
30. **Facturación Electrónica (DGII) Programada para Reinscripciones**: Integrar un disparador automático que genere la factura de Crédito Fiscal o Consumidor Final con su respectivo NCF al confirmarse el pago del derecho de reinscripción para el siguiente año escolar.
31. **Filtro de Reporte 607 por Ciclo Escolar**: Permitir la exportación del reporte de ventas 607 filtrando por el período de duración del año académico para auditorías internas de rentabilidad por aula.
32. **Control Automatizado de Becas Parciales**: Aplicar la deducción del descuento asignado en la base de datos de manera exacta e invariable en cada cargo mensual de colegiatura generado por el sistema.
33. **Conciliación de Depósitos de Inscripciones Anticipadas**: Crear una cuenta puente contable ("Ingresos Recibidos por Anticipado") para capturar los pagos de preinscripciones del año escolar próximo recibidos a mitad del año escolar actual.
34. **Prorrateo de Salida Anticipada**: Permitir dar de baja a un estudiante a mitad de mes calculando de forma exacta la fracción de colegiatura devengada que el padre debe liquidar antes del retiro definitivo del niño.
35. **Reporte Contable de Morosidad por Aula y Período**: Graficar qué aulas de la estancia infantil registran el mayor índice de retraso en pagos durante el trimestre activo para enfocar las estrategias de cobro de la encargada.

### Bloque D: Gestión Pedagógica y de Primera Infancia (Mejoras 36 - 43)
36. **Evaluación Basada en Hitos del Desarrollo (0-3 años)**: En lugar de notas base-100, habilitar una escala cualitativa basada en hitos de desarrollo infantil (ej. "Sostiene la cabeza", "Camina con apoyo", "Usa pinza fina") parametrizada por período.
37. **Gráfico de Crecimiento y Salud dentro del Año**: Permitir que la maestra de estancia registre mensualmente el peso y talla del niño, mostrando un gráfico de curva de crecimiento de la OMS integrado en el panel del padre.
38. **Registro Histórico de Alergias y Dietas por Ciclo**: Habilitar un flujo de confirmación médica obligatoria al inicio de cada año escolar para actualizar el protocolo de alimentación del menor (lactancia, papillas, sólidos).
39. **Planificador Trimestral de Rutinas de Sueño**: Permitir ajustar las metas de horas de siesta recomendadas a medida que el niño avanza de trimestre escolar y madura biológicamente.
40. **Control Automatizado de Esfínteres (De Pañal a Bacinica)**: Un registro especial compartido entre maestra y padre con notificaciones en tiempo real para coordinar la transición del control de esfínteres del niño.
41. **Portafolio Trimestral de Evidencias Fotográficas**: Permitir a la maestra agrupar fotos del desarrollo psicomotor del niño organizadas por período pedagógico, creando un lindo álbum digital descargable al final del año.
42. **Bitácora de Lactancia Materna**: Un módulo dedicado para que las madres de niños lactantes registren la entrega de leche materna refrigerada y la maestra registre las tomas exactas durante el día de la estancia.
43. **Registro Automatizado de Incidentes Médicos**: Enlace directo en el diario de rutinas para reportar caídas, picos de temperatura o rasguños, requiriendo firma digital de lectura por parte del padre al final del día.

### Bloque E: Automatización, Tiempo Real e Inteligencia (Mejoras 44 - 50)
44. **Cierre de Período Programado (Cron Job)**: Permitir a la directora programar una fecha exacta de cierre automático de período donde el sistema ejecute la consolidación de notas y envío de boletines sin requerir intervención manual.
45. **Sincronización de Notificaciones Push OneSignal**: Enviar una alerta push automática a los teléfonos de los padres en el instante exacto en que la directora firma y publica los boletines de calificaciones del período escolar.
46. **Muro Escolar Inteligente Multilingüe**: Traducir automáticamente los comunicados e incidencias del período publicados en el muro escolar para padres extranjeros que residen en el país.
47. **Backup Automatizado de Expedientes al Cerrar Año**: Generar de forma automática un archivo comprimido que contenga todos los PDF de boletines, historial médico, asistencia y facturas del alumno al finalizar el año escolar, almacenándolo de forma segura en Supabase Storage.
48. **Reenrollment One-Click Workflow**: Permitir que el padre, con un solo clic desde su panel durante el mes de reinscripciones, acepte los términos del nuevo ciclo escolar, actualice datos de contacto y genere el cargo de reinscripción en su estado de cuenta.
49. **Algoritmo de Asignación Automática de Aulas**: Diseñar un motor de recomendación que, al iniciar el nuevo año escolar, proponga la distribución óptima de los niños en las nuevas aulas en función de su edad exacta en meses y compatibilidad de grupo.
50. **Análisis Predictivo de Deserción Escolar**: Utilizar analítica de datos sobre la asistencia diaria del trimestre y la puntualidad en los pagos de colegiatura para generar una alerta temprana a la directora sobre familias con riesgo de retiro del centro.

---

## CONCLUSIÓN Y HOJA DE RUTA

La arquitectura de base de datos de **Karpus Kids** cuenta con una base sumamente profesional para la gestión del Año Escolar y sus períodos. El flujo de detección de nuevo trimestre en el Panel de los Padres es un elemento innovador y de gran calidad en términos de experiencia de usuario.

No obstante, para alcanzar la madurez de un ERP comercial de primera categoría, es prioritario:
1.  **Alinear los módulos financieros de la Asistente y Encargada** para que operen basándose en los límites del Año Escolar Activo y no del año calendario tradicional.
2.  **Robustecer la trazabilidad intra-año de los niños de primera infancia**, permitiendo cambios dinámicos de aula sin destruir la consistencia histórica.
3.  **Implementar gradualmente las 50 mejoras recomendadas**, comenzando por el historial de cambios de aula (M1), prorrateo automático (M3) y barra de estado de ciclo de vida en paneles administrativos (M11 y M19).

Este informe consolida las directrices necesarias para guiar los desarrollos futuros de la plataforma, garantizando que el sistema sea el referente líder en gestión de estancias infantiles y educación inicial en la República Dominicana.
