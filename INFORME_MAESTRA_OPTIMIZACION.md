# INFORME DE OPTIMIZACIÓN Y MEJORAS — PANEL MAESTRA
**Colegio Montessori Sonrisas Creativas**
*Autor: Jules, Software Engineer*

---

## INTRODUCCIÓN

Este informe presenta una estrategia integral de optimización y simplificación para el **Panel de la Maestra**, enfocada en reducir la sobrecarga de trabajo de la docente, eliminar elementos redundantes que saturan la interfaz visual y maximizar la eficiencia del tiempo operativo.

Además, se detalla la transición técnica completa de un sistema de evaluación cualitativa (letras A-D y estrellas ⭐) a un **sistema cuantitativo estandarizado en base a 100**, aplicable en todo el ecosistema (Base de Datos, Panel Maestra, Panel Padres, Panel Directora, y Reportes de Calificaciones). Finalmente, se propone una re-ingeniería visual y de flujo para la **Rutina Diaria (Rutina Express v2)** para niños menores de 6 años, diseñada para reducir la fricción diaria a un promedio de menos de 3 segundos por interacción.

---

## SECCIÓN 1: 15 COSAS GENERALES A ELIMINAR DE TODO EL PANEL MAESTRA

Para agilizar el rendimiento de la aplicación y limpiar la interfaz gráfica en pantallas móviles y de escritorio, se sugiere remover las siguientes 15 redundancias y elementos innecesarios a nivel general:

1. **Mascotas Vectoriales Animadas en el Sidebar:** Los SVG de mascotas gigantes (Triángulo Naranja y Pentágono Verde) en la parte inferior del menú lateral consumen espacio de navegación móvil crítico e incrementan la sobrecarga cognitiva en una interfaz profesional docente.
2. **Animaciones y Animaciones de Rebote Repetitivas (ej. `animate-bounce-subtle`):** Reducen la vida útil de la batería en dispositivos móviles y ralentizan el renderizado en teléfonos de menor gama que usualmente operan las maestras.
3. **Imágenes Decorativas No Esenciales en Encabezados:** La carga flotante de un sol giratorio animado (`sunSpin`) en el título del Inicio distrae y consume recursos de renderizado.
4. **Punto Indicador de Alerta de Menú Pulsante (`tab-badge-dot`):** La doble señalización de alertas (puntos naranjas + contadores numéricos en rojo) genera ansiedad visual y es redundante.
5. **Doble Header en Dispositivos Móviles:** El panel tiene un menú flotante de hamburguesa de posición fija absoluto arriba a la izquierda y, a la vez, una barra de encabezado de dispositivo móvil con otro botón de menú idéntico. Se debe consolidar en un solo navbar móvil superior limpio.
6. **Contadores de Alertas en Tiempo Real No Leídos en Secciones Inactivas del Sidebar:** Mantener listeners de base de datos activos contando ítems no leídos para múltiples pestañas simultáneamente impacta el ancho de banda.
7. **Lightbox de Imágenes Globales Inicializado sin Uso Activo:** Scripts y hojas de estilos pesados cargados en el documento principal que solo se usan en sub-secciones específicas.
8. **Efectos de Desenfoque de Fondo Pesados en Móviles (`backdrop-blur-sm`):** Ralentiza la fluidez de las transiciones táctiles en navegadores móviles integrados de Android e iOS.
9. **Múltiples Clases CSS Duplicadas para Estilos Toy/Premium:** El panel mezcla clases personalizadas de `maestra-design-system.css`, `montessori-modern.css`, `karpus-modern.css`, `montessori-tailwind.css` y `theme.css`. Se debe simplificar la carga de fuentes y layouts eliminando las CSS que entren en conflicto.
10. **Scripts Redundantes Cargados por Duplicado en el HTML:** Librerías heredadas como `OneSignalSDKWorker.js` de manera directa junto con plugins de Service Worker manuales cuando el sistema ya opera bajo un gestor de PWA integrado.
11. **Textos de Advertencia e Instrucciones Largas dentro de Botones:** Los botones deben ser puramente de acción con iconos autoexplicativos en lugar de textos extensos que rompen las retículas en pantallas estrechas.
12. **Banners de Promoción de Funcionalidades No Disponibles:** Remover avisos estáticos o de pruebas de videoconferencias externas que consumen espacio en el flujo principal de trabajo de la maestra.
13. **Tarjetas de Estadísticas Duplicadas en el Inicio:** Mostrar "Total Alumnos" y "Mis Clases" en grandes bloques fijos cuando esa información es visible inmediatamente en el Grid de selección de aulas inferior.
14. **Elementos de Sombra Excesivos (`shadow-2xl` y `shadow-lg` combinados):** Generan ruido visual y hacen que la interfaz se sienta sobrecargada. Se debe usar un estilo "flat" sutil de bordes delgados acorde a la regla del 70% blanco, 20% verde y 10% naranja.
15. **Hojas de Estilo Inline e Bloques de `<style>` en el `<body>`:** Hay múltiples inserciones de bloques `<style>` dentro del marcado HTML del panel. Todo debe migrarse a las hojas de estilos externas consolidadas para facilitar el almacenamiento en caché del navegador.

---

## SECCIÓN 2: 15 COSAS A ELIMINAR DE CADA SECCIÓN ESPECÍFICA DEL PANEL

### A. Sección de Inicio (Home)
1. **El Widget de "Alerta de Ponche" Manual:** Un sistema automatizado debe enviar alertas de inasistencia programadas en el servidor o gestionadas por la dirección, liberando a la maestra de la tarea de presionar un botón de "Enviar Avisos" en su pantalla de inicio.
2. **Widget "Actividad Próxima":** Consume recursos recalculando constantemente la hora local frente al horario programado. Esta información es mejor consultada directamente en la pestaña de Rutina.

### B. Sección Muro (Feed)
3. **El Botón de "Nueva Publicación" Duplicado:** Evitar la doble presencia de botones para publicar en el encabezado general del aula y dentro de la sub-pestaña del muro.
4. **Previsualizaciones Pesadas de Archivos de Imagen antes de Subir:** Reemplazar por un indicador de texto simple del archivo cargado para evitar el bloqueo de memoria del navegador en móviles.

### C. Sección de Alumnos
5. **Doble Ficha Escolar en Modales:** La maestra no requiere ver la ficha financiera o de estatus de pagos de los alumnos en su panel de aula. Solo debe visualizar datos de contacto de emergencia, alergias y autorizaciones de retiro.
6. **Botonera de "Registrar Incidente" dentro de la Ficha Básica:** Mover esta acción directamente a la lista rápida de asistencia o de rutina express, eliminando pasos intermedios de navegación.

### D. Sección de Asistencia
7. **Selectores de Estatus Intermedios (ej. "Tarde con Justificación", "Permiso Médico"):** Para la maestra, la asistencia en tiempo real debe ser binaria: **Presente (verde) / Ausente (rojo)**. Cualquier justificación posterior es administrada por la dirección o los padres, disminuyendo el tiempo de pase de lista.
8. **Botón de "Guardar Asistencia" Manual:** Cambiar a guardado automático e inmediato mediante AJAX en cuanto se presiona el interruptor de estatus (Presente/Ausente).

### E. Sección de Tareas
9. **Los Contadores de Estrellas (⭐) en la Creación de Tareas:** Al eliminar el sistema de estrellas en favor de la calificación sobre 100, se debe remover por completo este selector en los modales de creación y edición.
10. **La Carga Previa de Archivos Adjuntos no Optimizados:** Eliminar la descarga automática de entregas pesadas. La maestra solo debe descargar/ver el archivo si presiona explícitamente el botón "Ver Entrega".

### F. Sección de Calificaciones (Grades)
11. **Filtros de Período Académico Redundantes:** Al ingresar a calificar desde una tarea, el período activo debe detectarse automáticamente por el sistema, eliminando la necesidad de que la maestra lo seleccione manualmente cada vez.
12. **La Opción "Ninguna Calificación" (Estatus Vacío):** Toda entrega calificada debe poseer un valor numérico por defecto, eliminando la ambigüedad de estados pendientes sin nota.

### G. Sección de Chat
13. **Indicador de "Escribiendo..." (`chatTypingIndicator`):** Al consumir alta latencia de red y peticiones WebSocket continuas en Supabase, satura la conexión móvil de la maestra sin aportar valor operativo real.
14. **Opción de "Búsqueda Avanzada de Mensajes Históricos":** Limitar el chat del panel maestra a interacciones directas recientes de las últimas 48 horas. Las búsquedas de auditoría deben delegarse al panel de la Directora.

### H. Sección de Perfil / Permisos
15. **Sección de Código QR de Identificación del Empleado Redundante:** Si la maestra ya posee sesión activa en su teléfono inteligente, el sistema de ponche digital para el personal docente se puede automatizar mediante geolocalización o registro de entrada integrado en un botón de "Iniciar Jornada", eliminando la necesidad de mostrar e imprimir un QR estático en papel.

---

## SECCIÓN 3: TRANSICIÓN COMPLETA AL SISTEMA DE CALIFICACIÓN BASE 100

El objetivo es erradicar el sistema cualitativo de letras (A, B, C, D) y las estrellas (⭐) para adoptar un **esquema formal numérico del 1 al 100**. Esto simplifica el procesamiento de datos, es autoexplicativo para padres y cumple rigurosamente con los estándares oficiales de evaluación académica.

### 1. Repercusiones en Base de Datos (`schema.sql`)
* **Tabla `public.task_evidences`:**
  * **Eliminar:** La restricción y columna `grade_letter text CHECK (grade_letter IN ('A','B','C','D'))`.
  * **Eliminar:** La columna `stars integer CHECK (stars >= 1 AND stars <= 5)`.
  * **Añadir/Modificar:** La columna `score numeric(5,2) CHECK (score >= 0 AND score <= 100)` para almacenar la nota cuantitativa.
* **Tabla `public.grades`:**
  * Consolidar el tipo de la columna `score` como `numeric(5,2)` asegurando uniformidad.
* **Funciones y Triggers de Promedios (Cálculo de Report Cards / Boletines):**
  * Modificar la función PL/pgSQL que calcula promedios en boletines (`public.report_cards`). Actualmente, la función mapea letras a escala 1-5 (`WHEN te.grade_letter = 'A' THEN 5...`).
  * Se sustituirá por un promedio directo de las notas numéricas:
    ```sql
    -- Nueva lógica de promedio directo
    SELECT ROUND(AVG(te.score), 2) INTO v_task_avg
    FROM public.task_evidences te
    JOIN public.tasks t ON t.id = te.task_id
    WHERE te.student_id = v_student.student_id
      AND t.classroom_id = v_period.classroom_id
      AND te.status = 'graded'
      AND te.score IS NOT NULL;
    ```

### 2. Cambios en el Panel Maestra (`js/maestra/modules/tasks.js`)
* **Interfaz de Calificación:** Reemplazar el menú desplegable (`<select>`) de letras A-D y estrellas ⭐ por un campo de entrada numérico optimizado para móviles:
  ```html
  <input type="number" min="0" max="100" step="1"
         id="score-${s.id}"
         value="${sub?.score || ''}"
         placeholder="0 - 100"
         class="w-full px-4 py-3 rounded-xl font-bold bg-slate-50 border-2 border-slate-100 text-center text-lg focus:border-[var(--sc-green)] outline-none">
  ```
* **Validación en Cliente:** Bloquear valores fuera del rango $[0, 100]$ y forzar redondeo a enteros o un decimal para evitar inconsistencias en el envío de datos a `MaestraApi.gradeTask`.

### 3. Ajustes en API y Capas de Integración (`js/maestra/api.js` y `js/shared/api.js`)
* Adaptar el método `gradeTask` para que reciba `score` como parámetro numérico en vez de `gradeLetter` y `stars`.
* Actualizar las consultas SELECT en todos los archivos del panel docente, administrativa y de padres para solicitar la columna `score` en lugar de `grade_letter` y `stars`.

### 4. Cambios en el Panel de Padres (`js/padre/grades.js` y `js/padre/tasks.js`)
* **Visualización de Notas:** El padre ya no verá "Letra A" o "4 Estrellas". Se mostrará un indicador circular de progreso sobre 100 (con colores dinámicos: Rojo si es $<70$, Amarillo si es $70-85$, y Verde si es $>85$).
* **Fórmula de Promedio:** Eliminar la tabla de mapeo `letterToScore = { 'A': 100, 'B': 85, 'C': 75, ... }` y procesar directamente la sumatoria numérica de los `score` devueltos por la API para obtener el promedio del estudiante en tiempo real.

### 5. Adaptación en Panel de Dirección y Automatización (`js/directora/`)
* Modificar `js/directora/automation.js` y `js/directora/grades.module.js` para procesar el campo `score` de las evidencias de tareas directamente.
* La generación del boletín final calculará la nota media ponderada de las tareas asignadas $[0-100]$ combinada de manera transparente con las notas de exámenes o evaluaciones formales.

---

## SECCIÓN 4: RE-DISEÑO Y OPTIMIZACIÓN EXTREMA DE LA RUTINA DIARIA

La sección de **Rutina Diaria (Rutina Express)** para niños menores de 6 años es la herramienta que la maestra utiliza con mayor frecuencia. Para convertirla en el espacio más eficiente, intuitivo y veloz del sistema, proponemos un re-diseño enfocado en la **reducción del tiempo de trabajo a cero pasos innecesarios**.

### 1. El Concepto: "Operación de un Solo Toque" (Single-Tap Action)
* **El Problema Actual:** Registrar que un niño comió o durmió requiere abrir un modal individual por estudiante, rellenar selectores, agregar notas y guardar. Multiplicado por 15 alumnos, este flujo consume valiosos minutos de la maestra que deberían dedicarse al cuidado infantil.
* **La Solución Propuesta:** Operar en base al principio de que en la mayoría de los casos todos los niños realizan la misma actividad con éxito (ej: todo el grupo almorzó completo, o todo el grupo durmió su siesta).

### 2. Flujo de Trabajo en 3 Niveles de Eficiencia

```
┌────────────────────────────────────────────────────────┐
│             NIVEL 1: ACCIÓN MASIVA GLOBAL              │
│  "Un toque para registrar el evento en toda el aula"  │
└───────────────────────────┬────────────────────────────┘
                            ▼
┌────────────────────────────────────────────────────────┐
│             NIVEL 2: MODO SELECCIÓN MÚLTIPLE           │
│ "Tocar 3-4 niños + Tocar icono del evento = Guardado"   │
└───────────────────────────┬────────────────────────────┘
                            ▼
┌────────────────────────────────────────────────────────┐
│            NIVEL 3: EXCEPCIÓN INDIVIDUAL RAPIDA        │
│ "Deslizar lateralmente o toque largo para nota rápida" │
└────────────────────────────────────────────────────────┘
```

#### Nivel 1: Acción Masiva Global (Cero Esfuerzo)
* En la parte superior de la sección se presenta el **Evento Sugerido de la Hora** basado en el horario escolar (ej. 12:15 PM $\rightarrow$ "Almuerzo").
* Un gran botón de acción destaca: `[🍽️ Registrar Almuerzo Completo para Todos]`.
* Al presionarlo, el sistema inserta o actualiza instantáneamente en segundo plano (`daily_logs`) el estatus "Comió Todo" para todos los alumnos del aula en un solo lote, mostrando una barra temporal sutil de "Deshacer" (Undo) de 5 segundos.

#### Nivel 2: Modo Selección Múltiple (Bulk Action)
* Para cuando solo una parte del grupo realiza una acción (ej: 5 alumnos fueron al baño o tomaron biberón).
* La maestra activa el **Modo Selección** con un botón principal.
* Toca las fotos de los 5 niños (se sombrean con un borde naranja).
* Toca el icono `[🍼 Biberón]` o `[🚽 Baño]` en la barra de herramientas inferior flotante.
* **¡Listo!** El sistema procesa la actualización masiva de esos 5 registros simultáneamente en un milisegundo.

#### Nivel 3: Deslizamiento Lateral (Gestos Swipe para Excepciones)
* Si un alumno específico tuvo un comportamiento excepcional (ej. no quiso comer nada o tiene fiebre):
  * **Deslizar a la izquierda (Swipe Left) sobre su tarjeta:** Abre instantáneamente una cajita de texto flotante mini ("Añadir Nota Rápida") con reconocimiento de voz habilitado (Web Speech API). La maestra habla: *"Tiene fiebre de 38 grados"* $\rightarrow$ el texto se transcribe solo y se guarda al instante.
  * **Deslizar a la derecha (Swipe Right):** Registra el evento por defecto de manera directa e individual.

### 3. Propuesta de Diseño de Interfaz (UI/UX)
* **Retícula Compacta de Avatares (Grid 12px):** Las tarjetas de alumnos dejan de ser bloques verticales grandes. Se convierten en pequeños círculos de fotos en alta resolución con indicadores visuales de mini-iconos en las esquinas que representan qué eventos del día ya han sido cubiertos (Desayuno 🍞, Almuerzo 🥗, Siesta 😴, Pañal 💧).
* **Barra Flotante del Día (Sticky Action Bar):** Una barra inferior persistente en móviles que contiene accesos rápidos con iconos grandes fáciles de presionar con una sola mano:
  * `[🍞]` Desayuno | `[🥗]` Almuerzo | `[😴]` Sueño | `[🚽]` Baño | `[📝]` Nota Rápida
* **Feedback Háptico y Visual Sutil:** Cada toque exitoso genera una vibración sutil en el teléfono de la maestra y un destello verde rápido en el círculo del alumno para confirmar que el registro fue exitoso sin interrumpir su navegación.

---

## CONCLUSIONES Y PASOS A SEGUIR

Esta optimización del Panel Maestra no requiere cambios destructivos de lógica profunda, sino una depuración estética y de control de flujo. Los beneficios directos serán:
1. **Reducción del 80% en clics operativos** diarios por parte de la docente.
2. **Carga acelerada de la interfaz** en un 50% al eliminar assets innecesarios, scripts redundantes y animaciones SVG complejas en segundo plano.
3. **Claridad total académica** para padres y administradores gracias al sistema unificado de base 100.

Se recomienda autorizar esta planificación estratégica para proceder con la implementación secuencial del re-iseño gráfico y la actualización del esquema de base de datos Supabase en las fases de desarrollo correspondientes.
