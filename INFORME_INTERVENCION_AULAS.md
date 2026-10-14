# INFORME TÉCNICO Y DETALLADO: SISTEMA DE INTERVENCIÓN RÁPIDA Y SUPERVISIÓN DE AULAS (PANEL DIRECTORA)

---

## 1. RESUMEN EJECUTIVO
El **Sistema de Intervención Rápida y Supervisión de Aulas** es el núcleo de control del **Panel de la Directora** (y compartido con roles directivos como Encargada de Dirección y Asistente). Está implementado principalmente en el módulo `SchoolCenterModule` (`js/directora/school-center.module.js`).

Su propósito es **eliminar los cuellos de botella pedagógicos y operativos** en la estancia infantil/colegio. Le permite a la Directora detectar instantáneamente anomalous, omisiones o retrasos en las aulas (ej. mensajes de padres sin responder, falta de registro de asistencia o rutinas, ausencia de publicaciones diarias) y **tomar acción/intervenir directamente en tiempo real** sin abandonar la vista del Centro Escolar.

---

## 2. ARQUITECTURA DEL SISTEMA DE INTERVENCIÓN

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                         PANEL DIRECTORA / CENTRO ESCOLAR                         │
│                    (SchoolCenterModule - js/directora/school-center.module.js)   │
└──────────────────────────────────────────────────────────────────────────────────┘
                                         │
        ┌────────────────────────────────┼────────────────────────────────┐
        ▼                                ▼                                ▼
┌───────────────────────┐   ┌───────────────────────────┐   ┌───────────────────────────┐
│   DIAGNÓSTICO & KPIs  │   │  SEMÁFORO DE SALUD Y      │   │  BARRA DE INTERVENCIÓN    │
│  EN TIEMPO REAL       │   │  ALERTAS INTELIGENTES     │   │  RÁPIDA (ACCIONES DIRECTAS)│
└───────────────────────┘   └───────────────────────────┘   └───────────────────────────┘
        │                                │                                │
        ├─ % Asistencia de hoy           ├─ 🔴 Crítica (Mensajes >= 3,   ├─ 💬 Responder Mensajes
        ├─ % Rutinas/Bitácora            │     Asistencia omitida)        ├─ 📢 Publicar en Muro
        ├─ Mensajes sin responder        └─ 🟡 Atención (Sin posts hoy,  ├─ 📅 Agendar Eventos
        └─ Eventos/Incidencias                Rutina < 100%)              └─ 🔍 Ficha Drill-Down
```

---

## 3. DIAGNÓSTICO AUTOMÁTICO Y SEMÁFORO DE SALUD OPERATIVA

El sistema monitorea la salud global del centro educativo mediante métricas clave (KPIs) y asigna un estado semafórico a cada aula y a la estancia completa:

### 3.1 Niveles del Semáforo Global
1. **🟢 Estancia Operando Normal (Nivel OK):** Todas las aulas han pasado asistencia, están registrando rutinas/bitácoras y no tienen mensajes pendientes ni incidencias graves.
2. **🟡 Requiere Atención (Nivel WARN):** Hay pequeñas omisiones (ej. aula con rutina parcial, sin publicaciones en el muro después de las 11:00 AM).
3. **🔴 Requiere Intervención (Nivel DANGER):** Situación crítica que requiere intervención directa de la Directora (ej. más de 3 mensajes de padres sin responder por más de 24h, o falta total de pase de lista/asistencia).

---

## 4. MOTOR DE ALERTAS INTELIGENTES

El sistema calcula dinámicamente alertas clasificadas por severidad y asociadas directamente a cada aula específica:

| Nivel de Alerta | Condición Desencadenante | Acción Sugerida para la Directora |
| :--- | :--- | :--- |
| **🔴 DANGER** | Mensajes de padres $\ge 3$ sin respuesta en un aula. | Botón "Responder mensajes" en modal rápido. |
| **🔴 DANGER** | Aula con estudiantes presentes sin pase de lista (Asistencia omitida). | Botón "Ir al aula / Asistencia". |
| **🟡 WARN** | Pasadas las 11:00 AM de un día lectivo sin publicaciones en el Muro para la familia. | Botón "Publicar en muro". |
| **🟡 WARN** | % de Rutina completado por debajo del 70% a mitad de jornada. | Notificación o intervención directa con la maestra. |

---

## 5. CENTRO DE INTERVENCIÓN RÁPIDA (BARRA DE ACCIONES)

Cada tarjeta de aula en el Centro Escolar presenta una **Barra de Acciones Rápidas** (`_renderQuickActionsBar(a)`). La Directora puede ejecutar intervenciones inmediatas en representación del aula o en auxilio de la maestra asignada:

### A. Intervención en Comunicación (Modal de Respuesta Directa)
* **Función:** `openReplyMessagesModal(classroomId)` & `sendReplyFromModal()`
* **Cómo funciona:**
  1. Muestra los mensajes de padres sin contestar en el aula seleccionada.
  2. Permite a la Directora redactar una respuesta institucional inmediata.
  3. Envía el mensaje mediante Supabase a la tabla `chats`, actualiza el estado de lectura y envía una **Notificación Push** inmediata al padre/madre.
  4. Recarga los indicadores del aula en tiempo real, resolviendo la alerta.

### B. Intervención en Muro Escolar (Publicación Directa / Anuncio General)
* **Función:** `openNewPostModal(classroomId)`
* **Cómo funciona:**
  1. Abre un editor modal preseteado para el aula intervenida.
  2. La Directora puede adjuntar fotos/imágenes, texto pedagógico y marcar la casilla **"Publicar también como anuncio general"** (muro de todas las familias del centro).
  3. Inserta el registro en `wall_posts` y notifica a las familias asociadas.

### C. Intervención en Eventos y Calendario de Aula
* **Función:** `openNewEventModal(classroomId)`
* **Cómo funciona:**
  1. Permite agendar reuniones de padres, entregas de calificaciones o actividades especiales para el aula en cuestión.
  2. Impacta de forma coordinada el **Calendario Escolar Central** y la agenda particular del aula.

---

## 6. SUPERVISIÓN DRILL-DOWN Y SEGUIMIENTO EN TIEMPO REAL

Además de las acciones rápidas, la Directora tiene acceso a la **Ficha Drill-Down del Aula** (`openAula(id)`), que despliega:
1. **Desempeño Operativo de la Maestra:** % de rutinas ingresadas (alimentación, baño/pañal, siesta, medicación), publicaciones semanales y tasa de respuesta.
2. **Listado de Estudiantes del Aula:** Con estado de asistencia individual, filtro por alergias o necesidades especiales y acceso a la ficha digital completa (`StudentRecordModal`).
3. **Auditoría de Bitácora del Día:** Detalle cronológico de cada evento registrado por la docente.

---

## 7. DELEGACIÓN Y SOPORTE MULTI-ROL

El módulo de intervención adapta dinámicamente sus colores de acento e interfaz según el perfil directivo que haya iniciado sesión:

* **Directora:** Color Azul (`#0B63C7`), control total sobre todas las aulas, configuración e intervenciones.
* **Encargada de Dirección:** Color Violeta (`#8B5CF6`), capacidades de intervención y respuesta a padres.
* **Asistente de Dirección:** Color Esmeralda (`#0D9488`), capacidades de apoyo operativo y despacho de mensajes.

---

## 8. INTEGRACIÓN CON SUPABASE Y TABLAS BD

| Acción de Intervención | Tabla BD Principal | Notificación Push |
| :--- | :--- | :--- |
| Respuesta a Mensajes | `public.chats` / `chat_messages` | Notificación Push vía OneSignal / `sendPush()` |
| Publicación en Muro | `public.wall_posts` | Notificación en feed de Padres |
| Registro de Eventos | `public.school_calendar` / `events` | Calendario de Padres |
| Asistencia / Rutinas | `public.attendance` / `daily_logs` | Actualización instantánea en App Padres |

---

## 9. CONCLUSIÓN

El **Sistema de Intervención** convierte al Panel de la Directora en un verdadero **Centro de Comando**. Garantiza que ningún requerimiento de los padres ni ningún descuido en la bitácora infantil se quede sin atender, permitiendo a la dirección intervenir de forma quirúrgica, rápida y centralizada.
