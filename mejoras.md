# INFORME TÉCNICO Y ARQUITECTURA DE LÓGICA
## Módulo de Horario Semanal y Rutina Diaria Educativa ("Sonrisas Creativas")

**Fecha:** Octubre 2026  
**Proyecto:** Colegio Montessori & Estancia Infantil Sonrisas Creativas  
**Documento:** `INFORME_HORARIO_RUTINA.md`  
**Estado:** Especificación Técnica e Implementación  

---

## 1. RESUMEN EJECUTIVO Y OBJETIVO

El presente informe establece la arquitectura de lógica, flujo de distribución, diseño visual y diferenciación pedagógica para la implementación de la nueva vista **"Horario - Rutina diaria"** en formato de **Calendario de la Semana**, integrado de manera bidireccional entre el **Panel Maestra** y el **Panel Padres**.

El diseño visual replica con exactitud la estética infantil pedagógica, fresca y colorida reflejada en el diseño de referencia (`IMG-20261013-WA0067.jpg`), manteniendo la regla de oro de la institución (**70% Blanco, 20% Verde `#28B54D`, 10% Naranja `#FF8A00`**) junto con bloques pasteles alegres (Morado, Azul, Verde, Amarillo, Rosado) para cada franja horaria.

---

## 2. DIFERENCIACIÓN PEDAGÓGICA POR EDAD Y NIVEL (AULAS DE PEQUEÑOS VS. AULAS GRANDES)

El sistema opera con dos motores diferenciados según el nivel del aula registrado en Supabase:

### A. Aulas de Pequeños (Estancia Infantil y Nivel Inicial: ≤ 6 Años)
- **Niveles comprendidos:** Párvulos I, II, III (Maternal, Lactantes, Caminadores), Pre-Kínder, Kínder y Pre-Primario.
- **Formato de Rutina:** Utilizan el módulo de **Rutina Diaria e Ingestion Colectiva** (`daily_logs` + `infant_data`), además del nuevo **Horario Semanal Matricial**.
- **Métricas:** Alimentación (Desayuno, Almuerzo, Meriendas), Registro de Siesta, Cambio de Pañal/Uso de Baño, Control de Temperatura/Salud y Bloques Pedagógicos (Encuentro de grupo, Tiempo Montessori, Juego trabajo, Expresión Plástica, Taller de música, Taller de psicomotricidad, Lectoescritura pre-primario, etc.).

### B. Aulas Grandes (Nivel Primario: > 6 Años)
- **Niveles comprendidos:** 1° a 6° de Primaria y Secundaria.
- **Formato de Rutina:** **NO utilizan la bitácora de rutina de lactantes/párvulos** (no hay registro de pañales, biberones ni siesta individual).
- **Redirección e Interfaz:** Cuando una maestra o padre accede a la pestaña/sección de "Rutina" en un aula de Primaria, el sistema detecta el nivel (`_getLevelCategory() === 'primary'`) y despliega de manera automática un aviso pedagógico elegante:
  > *"🎓 Aula de Nivel Primario: Este nivel trabaja con el Horario Académico por Asignaturas y el Registro de Calificaciones por Competencias en lugar de Rutina de Estancia."*
- **Acción Rápida:** Ofrece un botón directo de navegación hacia la sección de **Calificaciones y Tareas**.

---

## 3. ESQUEMA DE DATOS Y ESTRUCTURA TÉCNICA

La matriz semanal se alimenta de manera jerárquica:

1. **Catálogo de Bloques del Aula (`classroom_schedule_blocks`):**
   - `id`: UUID del bloque de horario.
   - `classroom_id`: Identificador del aula.
   - `days`: Arreglo de días de la semana `[1, 2, 3, 4, 5]` (Lunes a Viernes).
   - `start_time`: Hora de inicio (ej. `"08:00"`).
   - `duration_min`: Duración en minutos (ej. `45`).
   - `label`: Nombre de la actividad (ej. `"Encuentro de grupo"`, `"Tiempo montessori"`, `"Expresión Plástica"`).
   - `color`: Código hexadecimal o estilo de tarjeta pastel (`purple`, `green`, `blue`, `yellow`, `pink`).
   - `sort_order`: Orden de la franja.

2. **Registro Diario de Ejecución (`daily_logs`):**
   - Vincula las ejecuciones en tiempo real registradas por la maestra en el aula.
   - Cuando la maestra marca una rutina colectiva (ej. "Desayuno y Recreo" a las 9:30 AM), se genera un registro en `daily_logs` para todos los estudiantes presentes.

---

## 4. DISEÑO VISUAL Y PALETA DE COLORES (`IMG-20261013-WA0067.jpg`)

La tabla matricial semanal incorpora las siguientes tonalidades pastel y de encabezado:

| Franja / Día | Color Encabezado | Tono Tarjetas Celda | Ejemplo de Rutina Integrada |
| :--- | :--- | :--- | :--- |
| **Hora** | Rosa Fuerte (`#DB2777`) | Fondo Violeta Suave (`#EEF2FF`) | `8:00 a 8:45` |
| **Lunes (Lun.)** | Morado Imperial (`#7C3AED`) | Morado Pastel (`#EDE9FE`) | Encuentro de grupo / Juego trabajo |
| **Martes (Mar.)** | Azul Rey (`#2563EB`) | Azul Pastel (`#E0F2FE`) | Expresión Plástica |
| **Miércoles (Mié.)** | Verde Esmeralda (`#16A34A`) | Verde Pastel (`#DCFCE7`) | Taller de música |
| **Jueves (Jue.)** | Naranja Cálido (`#D97706`) | Amarillo Pastel (`#FEF3C7`) | Taller de psicomotricidad |
| **Viernes (Vie.)** | Rosa Rubí (`#E11D48`) | Rosa Pastel (`#FCE7F3`) | Lecto Escritura Pre-primario |

### Detalles Decorativos de Interfaz Infantil:
- **Insignia "Hora de inicio:"** en la esquina superior izquierda con indicador dinámico en tiempo real.
- **Ilustraciones de Niños Montessori** en los bordes inferiores (Izquierda y Derecha) con líneas onduladas discontinuas y corazones flotantes (`💖`, `💚`, `💙`).
- **Píldoras redondeadas (`rounded-2xl`)** con bordes suaves de 2px y sombra leve (`shadow-sm hover:shadow-md transition-all duration-300`).

---

## 5. FLUJO DE TRABAJO EN PANEL MAESTRA

1. **Navegación por Pestañas en Módulo Rutina:**
   - La maestra cuenta con un conmutador con dos modos:
     - `📋 Bitácora Express`: Tarjetas individuales y acciones colectivas rápidas.
     - `📅 Horario Semanal`: Vista de rejilla matricial completa idéntica a la imagen.
2. **Interactividad Dinámica:**
   - **Indicador `AHORA` (Pulsante):** Resalta la franja horaria correspondiente a la hora actual con un borde pulsante verde o azul y distintivo animado.
   - **Ejecución Colectiva con un Clic:** La maestra puede hacer clic sobre cualquier celda del horario activo para lanzar el registro colectivo de esa rutina para todos los niños presentes en el aula.
   - **Medidor de Cumplimiento:** Cada bloque muestra una barra o porcentaje de ejecución en tiempo real (ej. `14/15 niños`).

---

## 6. FLUJO DE TRABAJO EN PANEL PADRES

1. **Conmutador en Sección "Rutina Diaria":**
   - El padre de familia puede alternar entre:
     - `📋 Reporte del Día` (Línea de tiempo de eventos registrados hoy).
     - `📅 Horario Semanal` (Rejilla visual completa del horario escolar).
2. **Visualización Inteligente:**
   - **Columna del Día Actual (`HOY`):** Destacada automáticamente con un resplandor dorado/verde y distintivo flotante.
   - **Estado de Ejecución:** Al tocar una celda del horario, se despliega una tarjeta animada mostrando si la maestra ya completó esa rutina hoy, junto con notas o detalles específicos del niño/a.
3. **Optimización Responsive:**
   - En pantallas móviles, mantiene desplazamiento horizontal suave con scroll de pildora y pestañas por día para rápida lectura táctil.

---

## 7. MATRIZ DE RUTINA PREDETERMINADA ("SONRISAS CREATIVAS")

```
   Hora       | Lun.               | Mar.               | Mié.               | Jue.               | Vie.
--------------+--------------------+--------------------+--------------------+--------------------+-------------------
 8:00 a 8:45  | Encuentro de grupo | Encuentro de grupo | Encuentro de grupo | Encuentro de grupo | Encuentro de grupo
 8:45 a 9:30  | Tiempo montessori  | Tiempo montessori  | Tiempo montessori  | Tiempo montessori  | Tiempo montessori
 9:30 a 10:30 | Desayuno y Recreo  | Desayuno y Recreo  | Desayuno y Recreo  | Desayuno y Recreo  | Desayuno y Recreo
10:30 a 11:15 | Juego trabajo      | Expresión Plástica | Taller de música   | Taller psicomotric | Juego trabajo
11:15 a 12:00 | Tema del día       | Tema del día       | Tema del día       | Tema del día       | Tema del día
12:30 a 1:15  | Lecto Escritura    | Lecto Escritura    | Lecto Escritura    | Lecto Escritura    | Lecto Escritura
```

---

## 8. CONCLUSIÓN Y VERIFICACIÓN

Esta arquitectura garantiza un enlace perfecto entre la planificación semanal y la bitácora operativa diaria de la estancia infantil, brindando paz mental a los padres de familia y máxima agilidad operativa a las maestras del Colegio Montessori Sonrisas Creativas.
