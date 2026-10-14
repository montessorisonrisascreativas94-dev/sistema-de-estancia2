# 📘 INFORME TÉCNICO Y ARQUITECTÓNICO: MÓDULO DE CALENDARIO PEDAGÓGICO Y CENTRO DE EXPERIENCIAS EDUCATIVAS
## Colegio Montessori Sonrisas Creativas — Ecosistema Multi-Panel

**Fecha:** Mayo 2024
**Arquitecto de Software:** Jules — Principal Systems Architect
**Documento:** `INFORME_CALENDARIO_ESCOLAR.md`
**Estado:** Propuesta de Arquitectura y Especificación de Diseño Aprobada

---

## 📋 CONTENIDO
1. [Visión General y Diagnóstico Estratégico](#1-visión-general-y-diagnóstico-estratégico)
2. [Propuesta de Flujo Operativo Multi-Rol](#2-propuesta-de-flujo-operativo-multi-rol)
3. [Arquitectura UI y Pantalla Principal del Módulo](#3-arquitectura-ui-y-pantalla-principal-del-módulo)
4. [Diseño del Calendario Mensual y Tarjetas Diarias](#4-diseño-del-calendario-mensual-y-tarjetas-diarias)
5. [Sistema Cromático Dinámico y Categorías Pedagógicas](#5-sistema-cromático-dinámico-y-categorías-pedagógicas)
6. [Formulario de Creación y Planificación de Actividades](#6-formulario-de-creación-y-planificación-de-actividades)
7. [Planificación Futura y Persistencia Histórica Inter-Mensual](#7-planificación-futura-y-persistencia-histórica-inter-mensual)
8. [Página Propia / Ficha de Experiencia Educativa](#8-página-propia--ficha-de-experiencia-educativa)
9. [Ciclo de Vida de la Actividad y Módulo Docente](#9-ciclo-de-vida-de-la-actividad-y-módulo-docente)
10. [Caso Práctico / Ejemplo Completo End-to-End](#10-caso-práctico--ejemplo-completo-end-to-end)
11. [Experiencia de Usuario Especializada para Padres de Familia](#11-experiencia-de-usuario-especializada-para-padres-de-familia)
12. [Personalización Temática y Nombre Especial del Mes](#12-personalización-temática-y-nombre-especial-del-mes)
13. [Matriz de Permisos por Rol (RBAC Granular)](#13-matriz-de-permisos-por-rol-rbac-granular)
14. [Definición Rigurosa de Estados de la Actividad](#14-definición-rigurosa-de-estados-de-la-actividad)
15. [Módulo de Valor Agregado: "Experiencias del Mes"](#15-módulo-de-valor-agregado-experiencias-del-mes)
16. [Modelo de Datos SQL, Supabase RLS y Funciones RPC](#16-modelo-de-datos-sql-supabase-rls-y-funciones-rpc)
17. [Diagrama Arquitectónico del Flujo Definitivo y Conclusiones](#17-diagrama-arquitectónico-del-flujo-definitivo-y-conclusiones)

---

## 1. VISIÓN GENERAL Y DIAGNÓSTICO ESTRATÉGICO

En las instituciones de educación inicial y estancia infantil como el **Colegio Montessori Sonrisas Creativas**, la comunicación y la visibilidad pedagógica son pilares fundamentales para construir confianza con las familias. Los sistemas educativos tradicionales suelen limitar la sección de "Actividades" a un simple **calendario estático de eventos** (fechas de exámenes, feriados o reuniones) que no transmite la riqueza del trabajo diario en el aula.

Esta propuesta transforma radicalmente ese paradigma, convirtiendo el espacio de **Actividades** en un **Centro de Experiencias Educativas y Calendario Pedagógico Visual**.

### Objetivos Principales:
* **Conectar la Administración con el Aula:** Permitir que la Directora, Asistente y Encargada de Educación diseñen planificaciones futuras con objetivos de aprendizaje claros, mientras las Maestras alimentan cada actividad con vivencias reales y evidencias fotográficas.
* **Transparencia Emocional para las Familias:** Brindar a los Padres de Familia una ventana transparente y enriquecedora sobre cómo sus hijos exploran, descubren y crecen cada día.
* **Trazabilidad Pedagógica Permanente:** Almacenar un registro histórico inalterable de cada mes y año escolar, sirviendo como memoria institucional y base para memorias de fin de curso.

---

## 2. PROPUESTA DE FLUJO OPERATIVO MULTI-ROL

El sistema adapta su interfaz y funcionalidad de forma dinámica según la identidad del usuario conectado:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   ECOSISTEMA MULTI-ROL DE ACTIVIDADES                  │
├────────────────────────────────────────────────────────────────────────┤
│ 👑 Directora / 👩‍💼 Encargada / 📋 Asistente                             │
│ └── Creación, Planificación Futura, Asignación de Color/Categoría,     │
│     Configuración Temática del Mes y Publicación Final.                │
│                                                                        │
│ 🧑‍🏫 Maestra (Docente Titular)                                           │
│ └── Recepción de Actividades, Consulta de Guías, Registro en Aula,    │
│     Carga de Fotografías/Evidencias y Marcado de "Realizada".          │
│                                                                        │
│ 👨‍👩‍👧 Padres de Familia                                                 │
│ └── Vista Amigable y Móvil-First, Navegación Mensual, Lectura de      │
│     Experiencias Educativas y Galería de Fotografías Compartidas.       │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. ARQUITECTURA UI Y PANTALLA PRINCIPAL DEL MÓDULO

La interfaz principal del módulo se aleja de las cuadrículas administrativas recargadas, adoptando una estructura limpia, jerárquica y con una estética amigable basada en la tipografía **Nunito** y bordes redondeados orgánicos (`rounded-3xl` / `24px`).

```text
┌────────────────────────────────────────────────────────────────────────┐
│  Actividades del Centro                                                │
│  Planificación y experiencias de aprendizaje                           │
│                                                                        │
│  [ Header Temático del Mes: 🍃 Octubre — Mes de la Naturaleza ]        │
│                                                                        │
│  ‹ Octubre 2026 ›                             [ ＋ Nueva actividad ]  │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 📅 Mes: Octubre 2026  │  🔎 Buscar...  │  🏷️ Categoría: Tod   │  │
│  │ 👩‍🏫 Docente: Todos    │  📚 Nivel: Párvulos                     │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  Controles de Vista:  [ 📅 Calendario Mensual ]   [ 📋 Lista Agenda ]  │
└────────────────────────────────────────────────────────────────────────┘
```

### Componentes Clave:
1. **Encabezado Temático:** Muestra el título especial del mes definido por la administración junto con su imagen de portada o color identificador.
2. **Navegador Temporal (`‹ Mes Año ›`):** Permite moverse fluidamente entre meses anteriores y futuros sin recargar la página.
3. **Barra de Filtros Inteligentes:**
   - **Búsqueda por Texto:** Coincidencia en títulos y descripciones.
   - **Filtro por Categoría:** Filtrado cromático por área del conocimiento (Ciencias, Arte, Celebración, etc.).
   - **Filtro por Docente / Nivel:** Visualización focalizada por aula (Caminadores, Párvulos, Preescolar).
4. **Selector de Modalidad de Vista:** Toggle dinámico entre vista de **Cuadrícula de Calendario (Grid)** y **Vista de Lista (Feed Agenda)**.

---

## 4. DISEÑO DEL CALENDARIO MENSUAL Y TARJETAS DIARIAS

El calendario no es una simple matriz numérica; cada celda de día es una **Tarjeta Visual Interactiva (Day Card)** que encapsula la actividad pedagógica con insignias de alto contraste.

### Vista de Cuadrícula Mensual (Grid):

```text
        OCTUBRE 2026
   ‹                    ›

LUN   MAR   MIÉ   JUE   VIE   SÁB   DOM

              1     2     3     4

 5     6     7     8     9    10    11
      🟣 Arte

12    13    14    15    16    17    18
      🟢 Ciencia
            🔵 Día de la Hispanidad

19    20    21    22    23    24    25
      🟢 Plantamos semilla

26    27    28    29    30    31
                  🟠 Halloween
```

### Detalle Visual de una Celda de Día (Día 15):

```text
┌──────────────────────────────────────────────┐
│  15  JUEVES                                  │
│                                              │
│  🟢 Experimento del agua                     │
│  ┌────────────────────────────────────────┐  │
│  │ Categoría: Ciencia | Hora: 9:00 AM     │  │
│  │ Estado: 👨‍👩‍👧 Publicada                  │  │
│  └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

---

## 5. SISTEMA CROMÁTICO DINÁMICO Y CATEGORÍAS PEDAGÓGICAS

El sistema combina **categorías semánticas predefinidas** con la libertad absoluta para que la Directora personalice el color hexadecimal de cualquier actividad.

| Color | Tono Hexadecimal | Categoría Pedagógica | Propósito / Ámbito |
| :--- | :--- | :--- | :--- |
| 🟢 **Verde** | `#22C55E` / `#16A34A` | **Ciencias & Naturaleza** | Experimentos, botánica, ecología, descubrimiento. |
| 🔵 **Azul** | `#3B82F6` / `#2563EB` | **Educativa & Cognitiva** | Lectoescritura, matemáticas, lógica, efemérides. |
| 🟣 **Morado** | `#A855F7` / `#9333EA` | **Arte & Expresión** | Pintura, música, teatro, manualidades, motricidad fina. |
| 🟠 **Naranja** | `#F97316` / `#EA580C` | **Celebración & Eventos** | Fiestas temáticas, cumpleaños, convivencias. |
| 🩷 **Rosa** | `#EC4899` / `#DB2777` | **Familia & Comunidad** | Talleres de padres, días familiares, integraciones. |
| 🟡 **Amarillo** | `#EAB308` / `#CA8A04` | **Recreativa & Deporte** | Juegos psicomotrices, competencias, agua. |
| 🔴 **Rojo** | `#EF4444` / `#DC2626` | **Importante / Urgente** | Avisos administrativos, cierres, vacunaciones. |
| ⚪ **Gris** | `#64748B` / `#475569` | **General / Rutina** | Actividades regulares de agenda interna. |

### Selector de Color Libre en el Creador:
Al crear una actividad, la interfaz ofrece botones de acceso rápido para la paleta estándar y un control `<input type="color">` para definir un tono corporativo personalizado.

---

## 6. FORMULARIO DE CREACIÓN Y PLANIFICACIÓN DE ACTIVIDADES

Al hacer clic en **`＋ Nueva actividad`**, se despliega una modal elegante o vista centrada con tres bloques bien definidos:

### Formulario Estructurado:

1. **Información Básica:**
   * **Título:** Texto claro y atractivo (ej. *Experimento: El ciclo del agua*).
   * **Fecha y Hora:** Selección de fecha calendario y rango horario (ej. *15 / Octubre / 2026 - 9:00 AM*).
   * **Categoría y Color:** Menú desplegable + selector de paleta cromática.
   * **Nivel / Aula Destino:** Selección múltiple (ej. *Maternal*, *Párvulos*, *Preescolar* o *Todas*).
   * **Docente Responsable:** Asignación explícita de la maestra titular.

2. **Descripción Corta:**
   * Resumen para la vista previa del feed y notificaciones automáticas a los padres.

3. **Editor de Contenido Pedagógico Extendido:**
   * **¿Qué trabajaremos?:** Contexto y justificación pedagógica.
   * **Objetivos de Aprendizaje:** Competencias del currículo a desarrollar.
   * **Materiales e Insumos:** Lista estructurada (ej. *Agua, envases plásticos, hielo, colorante vegetal*).
   * **Desarrollo / Guía de Aula:** Instrucciones paso a paso para que la maestra dirija la experiencia.

---

## 7. PLANIFICACIÓN FUTURA Y PERSISTENCIA HISTÓRICA INTER-MENSUAL

Una de las grandes fortalezas del diseño es que **el tiempo no es efímero**.

### 7.1 Planificación a Futuro Ilimitada
La administración puede proyectar el año académico entero con meses de anticipación:

```text
PANEL DE PLANIFICACIÓN FUTURA
─────────────────────────────────────────────
OCTUBRE 2026   │  12 Actividades Planificadas
NOVIEMBRE 2026 │   8 Actividades Planificadas
DICIEMBRE 2026 │  15 Actividades Planificadas
ENERO 2027     │   6 Actividades Planificadas
```

### 7.2 Persistencia e Histórico Inalterable
Cada actividad queda vinculada a su fecha real y año escolar (`school_year_id`). Cuando el mes de octubre transcurre y se pasa a noviembre, **octubre no se borra ni se oculta**. Permanece perfectamente accesible para:
* Consultar evidencias pasadas.
* Auditorías pedagógicas del centro.
* Descarga de boletines e informes de experiencias para los padres.

---

## 8. PÁGINA PROPIA / FICHA DE EXPERIENCIA EDUCATIVA

Al seleccionar cualquier actividad en el calendario, el sistema abre una vista completa dedicada (`/actividad/[id]` o Modal Fullscreen), estructurada pedagógicamente:

```text
← Volver a actividades

15 OCTUBRE 2026  │  CATEGORÍA: CIENCIAS  │  ESTADO: 👨‍👩‍👧 PUBLICADA
────────────────────────────────────────────────────────────────────────
💧 Experimento: El ciclo del agua

📌 DESCRIPCIÓN
Los niños conocerán de manera práctica cómo funciona el ciclo del agua mediante
un experimento con condensación y evaporación controlada.

🎯 OBJETIVOS DE APRENDIZAJE
• Comprender la transformación de los estados del agua.
• Fomentar la curiosidad científica y la observación.

🧪 MATERIALES
• Recipiente transparente  • Agua tibia  • Hielo  • Colorante azul

────────────────────────────────────────────────────────────────────────
👩‍🏫 TRABAJO EN EL AULA (Docente: Maria Rodríguez)

"Los niños mostraron gran asombro al ver cómo las gotas se formaban en la tapa
del recipiente al colocar el hielo arriba. Todos participaron activamente."

📸 EVIDENCIAS FOTOGRÁFICAS
[ Foto 1: Observando ]  [ Foto 2: Tocando el hielo ]  [ Foto 3: Dibujo ]

✨ EXPERIENCIA & APRENDIZAJES OBSERVADOS
"Santiago y Camila explicaron con sus propias palabras cómo cae la lluvia."

────────────────────────────────────────────────────────────────────────
✓ Estado: Actividad Realizada y Publicada a las Familias
```

---

## 9. CICLO DE VIDA DE LA ACTIVIDAD Y MÓDULO DOCENTE

El flujo operacional garantiza que la actividad evolucione de manera coordinada entre la administración y los docentes:

```text
    [ PLANIFICACIÓN ]           [ EJECUCIÓN & EVIDENCIA ]            [ REVISIÓN & PUBLICACIÓN ]
  Directora / Encargada                 Maestra                         Directora / Admin
            │                              │                                    │
            ▼                              ▼                                    ▼
Crea la actividad con       Lee la guía pedagógica,         Revisa el material en aula,
objetivos y materiales.    imparte la clase en aula,       aprobo las fotos y marca
Queda en estado:           captura fotos/reflexiones y     el estado como:
"Planificada"              marca: "Realizada"              "Publicada"
```

### Funcionalidad en el Panel Maestra (`panel-maestra.html`):
1. **Mis Actividades del Día/Semana:** Lista limpia con las actividades asignadas a sus aulas.
2. **Consola de Carga de Evidencias:**
   * Carga simplificada de fotografías desde el móvil o tablet.
   * Campo de notas de la jornada: *Relato de la experiencia, anécdotas, niños destacados*.
   * Botón de acción principal: **`✓ Marcar como Actividad Realizada`**.

---

## 10. CASO PRÁCTICO / EJEMPLO COMPLETO END-TO-END

Para ilustrar la fluidez del módulo, se detalla la traza completa de una actividad:

1. **Planificación (10 de Octubre):**
   * La **Directora** crea la actividad: 🌱 *"Plantamos nuestra primera semilla"*.
   * **Fecha:** 20 de Octubre | **Categoría:** Ciencias (🟢 Verde `#22C55E`).
   * **Objetivo:** Motivar la interacción con la naturaleza y el cuidado vegetal.
   * **Estado inicial:** `Planificada`.

2. **Ejecución en Aula (20 de Octubre - 10:00 AM):**
   * La **Maestra** ingresa desde su tablet en el aula de *Párvulos*, revisa los materiales necesarios y realiza la siembra con los alumnos.
   * Toma 3 fotografías de los niños manipulando la tierra y las macetas.
   * Redacta: *"Cada niño sembró su semilla de habichuela y decoró su maceta con su nombre."*
   * Presiona **`✓ Marcar como realizada`**. El estado cambia a `Realizada`.

3. **Revisión y Publicación (20 de Octubre - 1:00 PM):**
   * La **Encargada de Educación** recibe la notificación, valida que las fotografías sean adecuadas y presiona **`Publicar a Familias`**. Estado pasa a `Publicada`.

4. **Visualización en el Panel de Padres (20 de Octubre - 2:00 PM):**
   * El **Padre de Familia** abre su aplicación, ve la notificación en su feed y consulta la celda verde del día 20. Al tocarla, observa el relato de la maestra y las fotos de su hijo participando.

---

## 11. EXPERIENCIA DE USUARIO ESPECIALIZADA PARA PADRES DE FAMILIA

El **Panel de Padres (`panel_padres.html`)** prioriza la simplicidad, la calidez visual y la usabilidad en dispositivos móviles.

```text
┌────────────────────────────────────────────────────────────────────────┐
│ 📚 ACTIVIDADES & EXPERIENCIAS DE APRENDIZAJE                           │
├────────────────────────────────────────────────────────────────────────┤
│ 🍃 OCTUBRE 2026 — Mes de la Naturaleza                                 │
│ "Exploramos, descubrimos y aprendemos juntos."                         │
│                                                                        │
│        OCTUBRE 2026                                                    │
│  L    M    M    J    V    S    D                                       │
│                 1    2    3    4                                       │
│  5    6    7    8    9   10   11                                       │
│ 12   13   14   15   16   17   18                                       │
│                🟢                                                      │
│             Experimento                                                │
│ 19   20   21   22   23   24   25                                       │
│      🟢                                                                │
│    Semilla                                                             │
├────────────────────────────────────────────────────────────────────────┤
│ 📌 Próximas Actividades                                                │
│                                                                        │
│ 🟢 20 OCT │ 🌱 Plantamos nuestra primera semilla                        │
│    "Hoy nuestros niños exploraron la naturaleza..." [ Ver Fotos 📸 ]   │
│                                                                        │
│ 🟠 31 OCT │ 🎃 Celebración de Halloween & Disfraces                    │
│    "Día de juegos recreativos y fiesta temática..."                    │
└────────────────────────────────────────────────────────────────────────┘
```

### Características para Padres:
* **Cero Complejidad Administrativa:** Se eliminan botones de edición, estados de auditoría interna o selectores de asignación docente.
* **Tarjeta de Portada Temática:** Muestra la carta del mes redactada por la dirección.
* **Feed Vertical "Próximas Actividades":** Listado de tarjetas de acceso rápido ordenadas cronológicamente con indicadores de evidencia multimedia disponibles.

---

## 12. PERSONALIZACIÓN TEMÁTICA Y NOMBRE ESPECIAL DEL MES

Para otorgar una identidad visual única a cada período del año escolar, el módulo incluye una sección de **Configuración Mensual**:

```text
CONFIGURACIÓN TEMÁTICA DEL MES (Directora / Encargada)
────────────────────────────────────────────────────────────────────────
Mes Calendasrio:     [ Octubre 2026                 ▼ ]
Nombre Especial:     [ Mes de la Naturaleza 🍃        ]
Frase / Eslogan:     [ Exploramos y cuidamos nuestro mundo 🌎 ]
Color Distintivo:    [ 🟢 Verde Menta (#0D9488)       ]
Imagen de Portada:   [ Subir imagen de banner...      ]

Mensaje para las Familias:
"Estimadas familias: Durante este mes de octubre nos enfocaremos en
experiencias sensoriales con la tierra, plantas y el cuidado ambiental..."
```

---

## 13. MATRIZ DE PERMISOS POR ROL (RBAC GRANULAR)

| Acción / Funcionalidad | 👑 Directora | 👩‍💼 Encargada / Asistente | 🧑‍🏫 Maestra | 👨‍👩‍👧 Padres |
| :--- | :---: | :---: | :---: | :---: |
| Crear / Editar Planificación de Actividades | **Sí** | **Sí** | No | No |
| Asignar Color, Categoría y Materiales | **Sí** | **Sí** | No | No |
| Configurar Nombre y Portada Temática del Mes | **Sí** | **Sí** | No | No |
| Eliminar / Cancelar Actividad | **Sí** | Sólo creadas por ella | No | No |
| Visualizar Guía Pedagógica Asignada | **Sí** | **Sí** | **Sí** | No |
| Cargar Fotos / Evidencias de Aula | **Sí** | **Sí** | **Sí** | No |
| Marcar Actividad como "Realizada" | **Sí** | **Sí** | **Sí** | No |
| Publicar Actividad a los Padres | **Sí** | **Sí** (Aprobación) | No | No |
| Visualizar Actividades Publicadas | **Sí** | **Sí** | **Sí** | **Sí** |
| Consultar Histórico de Meses Pasados | **Sí** | **Sí** | **Sí** | **Sí** |

---

## 14. DEFINICIÓN RIGUROSA DE ESTADOS DE LA ACTIVIDAD

Toda actividad sigue un flujo de estados estricto para proteger la confidencialidad y la calidad de la información compartida con el exterior:

```text
 📝 BORRADOR ──► 📅 PLANIFICADA ──► 🟢 EN CURSO ──► ✓ REALIZADA ──► 👨‍👩‍👧 PUBLICADA
```

1. **📝 Borrador (`draft`):** Actividad en preparación por la administración. No es visible para maestras ni padres.
2. **📅 Planificada (`scheduled`):** Publicada internamente. Visible para las maestras asignadas para que preparen sus clases.
3. **🟢 En Curso (`in_progress`):** Actividad que se está ejecutando durante el día correspondiente.
4. **✓ Realizada (`completed`):** La maestra ha finalizado la clase, cargado las evidencias fotográficas y redactado sus reflexiones.
5. **👨‍👩‍👧 Publicada (`published`):** Validada por la dirección y visible en el panel de padres.

---

## 15. MÓDULO DE VALOR AGREGADO: "EXPERIENCIAS DEL MES"

Al concluir un mes calendario, el sistema compila automáticamente la **Memoria Pedagógica Mensual**:

```text
✨ RESUMEN DE EXPERIENCIAS — OCTUBRE 2026 🍃
────────────────────────────────────────────────────────────────────────
📊 Métricas del Mes:
• 18 Actividades Educativas Realizadas
• 12 Experiencias de Descubrimiento y Ciencias
• 45 Fotografías de Evidencias Compartidas
• 98% de Participación Estudiantil

🏆 Actividades Más Destacadas:
1. 🌱 Plantamos nuestra primera semilla
2. 💧 Experimento: El ciclo del agua
3. 🎨 Taller de pintura con pigmentos naturales

📄 [ Botón: Descargar Memoria del Mes en PDF ]  [ Compartir con Familias ]
```

---

## 16. MODELO DE DATOS SQL, SUPABASE RLS Y FUNCIONES RPC

A continuación se detalla la estructura DDL para la base de datos PostgreSQL en Supabase:

```sql
-- =====================================================================
-- 1. TIPOS ENUMERADOS
-- =====================================================================
CREATE TYPE public.activity_status AS ENUM (
  'draft',
  'scheduled',
  'in_progress',
  'completed',
  'published'
);

CREATE TYPE public.activity_category AS ENUM (
  'ciencias',
  'educativa',
  'arte',
  'celebracion',
  'familia',
  'recreativa',
  'importante',
  'general'
);

-- =====================================================================
-- 2. TABLA DE CONFIGURACIÓN TEMÁTICA DEL MES
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.school_month_configs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  school_year_id bigint REFERENCES public.school_years(id) ON DELETE CASCADE,
  year_number integer NOT NULL CHECK (year_number >= 2024),
  month_number integer NOT NULL CHECK (month_number BETWEEN 1 AND 12),
  special_title text NOT NULL,
  slogan text,
  banner_url text,
  primary_color text DEFAULT '#22C55E',
  family_message text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE (school_year_id, year_number, month_number)
);

-- =====================================================================
-- 3. TABLA PRINCIPAL DE ACTIVIDADES
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.school_activities (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  school_year_id bigint REFERENCES public.school_years(id) ON DELETE CASCADE,
  classroom_id bigint REFERENCES public.classrooms(id) ON DELETE SET NULL, -- NULL para todo el colegio
  title text NOT NULL,
  description text NOT NULL,
  content jsonb DEFAULT '{}'::jsonb, -- {que_trabajaremos, objetivos, materiales, desarrollo}
  activity_date date NOT NULL,
  start_time time,
  end_time time,
  category public.activity_category NOT NULL DEFAULT 'general',
  color_hex text NOT NULL DEFAULT '#22C55E',
  status public.activity_status NOT NULL DEFAULT 'draft',
  assigned_teacher_id uuid REFERENCES auth.users(id),
  created_by uuid REFERENCES auth.users(id) NOT NULL,
  teacher_notes text,
  completed_at timestamp with time zone,
  published_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- =====================================================================
-- 4. TABLA DE EVIDENCIAS FOTOGRÁFICAS / VIDEOS
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.school_activity_evidences (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  activity_id bigint NOT NULL REFERENCES public.school_activities(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  file_type text DEFAULT 'image' CHECK (file_type IN ('image', 'video')),
  caption text,
  uploaded_by uuid REFERENCES auth.users(id) NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

-- =====================================================================
-- 5. SEGURIDAD NIVEL DE FILA (ROW LEVEL SECURITY - RLS)
-- =====================================================================
ALTER TABLE public.school_month_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_activity_evidences ENABLE ROW LEVEL SECURITY;

-- Políticas para Actividades
CREATE POLICY "Padres ven actividades publicadas"
  ON public.school_activities FOR SELECT
  TO authenticated
  USING (status = 'published');

CREATE POLICY "Personal del centro ve todas las actividades"
  ON public.school_activities FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('directora', 'asistente', 'encargada', 'maestra')
    )
  );

CREATE POLICY "Admin puede insertar/modificar actividades"
  ON public.school_activities FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('directora', 'asistente', 'encargada')
    )
  );

CREATE POLICY "Maestra puede actualizar actividades asignadas"
  ON public.school_activities FOR UPDATE
  TO authenticated
  USING (assigned_teacher_id = auth.uid())
  WITH CHECK (assigned_teacher_id = auth.uid());

-- =====================================================================
-- 6. FUNCIÓN RPC PARA PUBLICACIÓN MASIVA O CAMBIO DE ESTADO
-- =====================================================================
CREATE OR REPLACE FUNCTION public.publish_school_activity(p_activity_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Validar rol del usuario ejecutor
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('directora', 'asistente', 'encargada')
  ) THEN
    RAISE EXCEPTION 'No tiene permisos para publicar actividades.';
  END IF;

  UPDATE public.school_activities
  SET status = 'published',
      published_at = now(),
      updated_at = now()
  WHERE id = p_activity_id;

  RETURN TRUE;
END;
$$;
```

---

## 17. DIAGRAMA ARQUITECTÓNICO DEL FLUJO DEFINITIVO Y CONCLUSIONES

```text
                         CENTRO DE EXPERIENCIAS EDUCATIVAS
                                       │
            ┌──────────────────────────┴──────────────────────────┐
            ▼                                                     ▼
   CONFIGURACIÓN MENSUAL                                PLANIFICACIÓN FUTURA
(Directora / Encargada)                                  (Directora / Admin)
 • Titular Temático                                       • Título, Fecha y Hora
 • Color & Portada del Mes                                • Categoría & Color
 • Mensaje a las Familias                                 • Guía Pedagógica
            │                                                     │
            └──────────────────────────┬──────────────────────────┘
                                       ▼
                             ACTIVIDAD EN BORRADOR
                                       │
                                       ▼
                             ACTIVIDAD PLANIFICADA
                                       │
                                       ▼
                           EJECUCIÓN EN AULA (MAESTRA)
                            • Revisa Guía & Materiales
                            • Imparte la Experiencia
                            • Carga Fotografías
                            • Escribe Reflexiones
                            • Marca "✓ Realizada"
                                       │
                                       ▼
                          REVISIÓN Y PUBLICACIÓN (ADMIN)
                                       │
                                       ▼
                           PANEL DE PADRES (FAMILIAS)
                            • Vista Calendario & Feed
                            • Visualiza Fotos & Relatos
                            • Conexión Emocional Casa-Escuela
```

### Conclusión y Siguientes Pasos Recomendados:
La transformación de **Actividades** en un **Centro de Experiencias Educativas** eleva el estándar del **Colegio Montessori Sonrisas Creativas**, pasando de un sistema puramente administrativo a una potente plataforma pedagógica y comunicacional.

**Plan de Implementación Técnica Sugerido:**
1. **Fase 1:** Ejecutar el script DDL SQL en Supabase para crear las tablas, enumerados y políticas RLS.
2. **Fase 2:** Crear el módulo frontend compartido `js/shared/school-activities.module.js` con las vistas de calendario y filtros.
3. **Fase 3:** Integrar la consola de captura de evidencias en el Panel Maestra (`panel-maestra.html`).
4. **Fase 4:** Desplegar la vista simplificada y emotiva en el Panel de Padres (`panel_padres.html`).

---
*Informe generado satisfactoriamente por Jules, Principal Systems Architect.*
