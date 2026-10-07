# Plan de Implementación — Centro Escolar con Acciones Directas

> Especificación asociada: [spec.md](file:///c:/Users/usuario/Documents/Nueva%20carpeta/sistema/.trae/specs/centro-escolar-acciones/spec.md)

## Mapa AC → Tareas

| AC | Criterio | Tareas que lo cubren |
|---|---|---|
| AC-01 | Ítem Centro Escolar en sidebar de Asistente y Control | T1, T12 |
| AC-02 | Shell `#kscRoot` con 5 tabs renderiza en Asistente/Control | T1, T2, T12 |
| AC-03 | Barra Quick Actions en ficha de aula (3 botones) | T3 |
| AC-04 | Responder mensajes desde ficha (modal + INSERT) | T4, T5, T6 |
| AC-05 | Publicar en Muro desde ficha (composer + feed actualizado) | T7, T8 |
| AC-06 | Crear/Agendar Evento (2 tabs + INSERT en 2 tablas) | T9, T10 |
| AC-07 | Botones de acción en Alertas del Resumen | T11 |
| AC-08 | Actualización SPA sin recarga tras acciones | T5, T8, T10, T11, T13 |
| AC-09 | Fallback PostgREST en errores 401/403/42501 | T5, T8, T10 |
| AC-10 | Checkbox "anuncio general" solo para Directora/Encargada | T7 |
| AC-11 | Todo input escapado con Helpers.escapeHTML | T4–T11 (revisión) |
| AC-12 | UI premium: borde 3px, radio 28px, sombra, fadeUp | T3, T4, T7, T9, CSS T14 |

---

## Tareas (orden de ejecución)

### ═══════════ Tarea 1: Integrar SchoolCenterModule en Panel Asistente ═══════════
- **Prioridad:** `high`
- **Dependencias:** Ninguna (vertical slice independiente)
- **Archivos a tocar:**
  - `panel_asistente.html`: añadir sección `#centro-escolar` + ítem sidebar
  - `js/asistente/main.js`: importar + registrar `SchoolCenterModule` en `window.App`
  - `js/asistente/main.js`: mapear navegación `goTo('centro-escolar')` → `SchoolCenterModule.init()`
  - `panel_asistente.html`: incluir `<link rel="stylesheet" href="css/school-center.css">`
- **Criterios de prueba locales (TR):**
  - **TR-1.1 (rule):** Ítem "Centro Escolar" visible en sidebar del Asistente, con badge de alertas.
  - **TR-1.2 (rule):** Clic en el ítem renderiza `#kscRoot` con hero, 7 KPIs y 5 tabs (Resumen activo por defecto).
  - **TR-1.3 (rule):** Errores de consola = 0 tras la carga.
  - **TR-1.4 (rubric):** Paleta temática verde/teal aplicada consistentemente al módulo en asistente. Escala 0-2, umbral ≥1.
- **Status:** `pending`

---

### ═══════════ Tarea 2: Integrar SchoolCenterModule en Panel Control (Encargada) ═══════════
- **Prioridad:** `high`
- **Dependencias:** Ninguna
- **Archivos a tocar:**
  - `panel_control.html`: añadir sección `#centro-escolar` con `<div id="kscRoot"></div>` + ítem sidebar con icono
  - Crear entrada `js/control/school-center-entry.js` si es necesario (o importar directamente el módulo en `js/control/main.js` si existe)
  - Declarar `window.App.schoolCenter = { init: () => SchoolCenterModule.init() }`
  - Incluir CSS `school-center.css`, `student-record-modal.css`, `messenger-chat.css`, `wall-social.css`
- **Notas:** Panel Control usa un sistema de navegación más simple (`goTo()` declarado globalmente en el HTML). Asegurar que `goTo('centro-escolar')` muestre la sección active e invoque init del módulo.
- **TR:**
  - **TR-2.1 (rule):** Ítem sidebar "Centro Escolar" visible en Control Center, clic muestra la sección y oculta las demás.
  - **TR-2.2 (rule):** `#kscRoot` se llena con shell correcto sin errores JS.
  - **TR-2.3 (rubric):** Alineación visual con el estilo de Control Center (paleta azul acento, tipografía Nunito). Escala 0-2, umbral ≥1.
- **Status:** `pending`

---

### ═══════════ Tarea 3: Barra Quick Actions en Ficha de Aula + estilos premium ═══════════
- **Prioridad:** `high`
- **Dependencias:** T1 o T2 (para validar visualización en al menos 1 panel; puede desarrollarse en paralelo sobre el SchoolCenterModule compartido)
- **Archivos a tocar:**
  - `js/directora/school-center.module.js`:
    - Añadir método `_renderQuickActionsBar(aulaObj)` que devuelve HTML con 3 botones:
      - `[data-ksc-action="replyMsgs"][data-ksc-classroom]`
      - `[data-ksc-action="newPost"][data-ksc-classroom]`
      - `[data-ksc-action="newEvent"][data-ksc-classroom]`
    - En `_renderAula()`, insertar la barra entre el encabezado del aula y los stats.
    - En `_action()` del módulo, agregar handlers `replyMsgs`, `newPost`, `newEvent` que invocan a los modales de T4/T7/T9 con el `classroomId` correcto.
  - `css/school-center.css`:
    - `.ksc-quick-actions { border:3px solid ... ; border-radius:28px ; box-shadow:0 14px 36px ... ; animation:fadeUp .4s ease }`
    - Responsive: móvil → 2 filas de botones; desktop → fila única justificada.
- **TR:**
  - **TR-3.1 (rule):** En vista `_renderAula()` existe `.ksc-quick-actions` con exactamente 3 botones y `data-ksc-classroom` correcto.
  - **TR-3.2 (rule):** Inspección CSS: `border-width:3px`, `border-radius ≥28px`, `box-shadow: 0 14px 36px`.
  - **TR-3.3 (rule):** Cada botón, al hacer clic, dispara `_action()` con su acción y `classroomId` correctos (ver `console.log` o breakpoint).
  - **TR-3.4 (rubric):** En viewport 375px, botones no solapan, no hay overflow-x. Escala 0-2, umbral ≥1.
- **Status:** `pending`

---

### ═══════════ Tarea 4: Modal Responder Mensajes — Estructura y UI ═══════════
- **Prioridad:** `high`
- **Dependencias:** T3 (invocado desde la barra)
- **Archivos a tocar:**
  - `js/directora/school-center.module.js`:
    - Método `openReplyMessagesModal(classroomId)` → usa `openGlobalModal()` (shared/modal.js) con shell:
      - Header: "Responder mensajes · [Nombre Aula]"
      - Columna izquierda (lista): mensajes `msgsPending` del aula + estado leído/no leído
      - Columna derecha (conversación): historial completo al seleccionar un mensaje
      - Input de respuesta tipo textarea con botón Enviar, icono adjunto (opcional), "Enviar con Enter"
    - Método `_renderMsgsList(msgs, activeId, classroomId)`
    - Método `_renderMsgsThread(contactId, classroomId)` — carga historial desde Supabase
- **Notas:** Reutilizar el esquema visual de `js/directora/chat.module.js` (messenger-style) pero en versión modal compacta. Todo `textContent`/innerHTML de inputs pasar por `Helpers.escapeHTML()`.
- **TR:**
  - **TR-4.1 (rule):** Modal abre al pulsar botón Responder de la barra; título contiene el aula correcta.
  - **TR-4.2 (rule):** Si el aula tiene N mensajes pendientes, aparecen N filas en la lista (≥0).
  - **TR-4.3 (rule):** Clic en un mensaje de la lista → carga el hilo en la zona derecha con scroll a la última burbuja.
  - **TR-4.4 (rule):** Cada nombre, preview y contenido de mensaje mostrado pasa por `escapeHTML` (revisar código fuente — ninguna string de usuario llega a innerHTML sin escapar).
- **Status:** `pending`

---

### ═══════════ Tarea 5: Modal Responder Mensajes — Lógica INSERT + Fallback PostgREST + SPA Refresh ═══════════
- **Prioridad:** `high`
- **Dependencias:** T4
- **Archivos a tocar:**
  - `js/directora/school-center.module.js`:
    - Método `sendReplyFromModal(receiverId, content, classroomId)`
      - Paso 1: `supabase.from('messages').insert({sender_id: yo, receiver_id, content, is_read:false}).select()`
      - Paso 2: si error `401|403|42501` → retry con `fetch()` a PostgREST con headers `apikey`, `Authorization: Bearer <anon_key>`, `Prefer: return=representation`.
      - Paso 3: al éxito:
        - Toast "Mensaje enviado".
        - Remover mensaje de la lista del modal (si estaba pendiente) o marcar como resuelto.
        - Invocar `_refreshAfterAction(classroomId, { decPendingMsgs: 1 })` (definir en T13).
        - Invocar `UnreadMessages.recalcBadge()` si está cargado.
      - Paso 4: `sendPush()` opcional al receptor (mismo patrón que ChatModule).
- **TR:**
  - **TR-5.1 (rule):** Enviar una respuesta → nueva fila aparece en `messages` de Supabase con contenido correcto y `sender_id = currentUser`.
  - **TR-5.2 (rule):** Después de enviar, KPI "Mensajes pendientes" del hero se decrementa en 1; badge del aula en la tabla se actualiza **sin recarga**.
  - **TR-5.3 (rule):** Mock del error 42501 (RLS) → se ejecuta fetch fallback exitoso; mensaje se envía igual.
  - **TR-5.4 (rule):** `window.location.reload` no aparece en todo el flujo (grep).
- **Status:** `pending`

---

### ═══════════ Tarea 6: Responder directamente desde chip de mensajes en ficha ═══════════
- **Prioridad:** `medium`
- **Dependencias:** T4 y T5
- **Archivos a tocar:**
  - `js/directora/school-center.module.js` en `_renderAula()`: convertir el chip `N mensajes pend.` en botón clickeable `data-ksc-action="replyMsgsFromChip" data-ksc-classroom` que abre el mismo modal de T4.
- **TR:**
  - **TR-6.1 (rule):** Clic en el chip abre modal igual que el botón de la barra; aula precargada correcta.
- **Status:** `pending`

---

### ═══════════ Tarea 7: Modal Publicar en Muro — Composer inline + selección aula bloqueada ═══════════
- **Prioridad:** `high`
- **Dependencias:** T3
- **Archivos a tocar:**
  - `js/directora/school-center.module.js`:
    - Método `openNewPostModal(classroomId)` que construye composer igual que `WallModule.openNewPostModal()` pero:
      - Tag visible "Aula: [Nombre]" con `disabled` / no editable.
      - Campo oculto `classroom_id = classroomId`.
      - Si `role ∈ {directora, encargada, admin}` → mostrar checkbox `#postIsGlobal` con label "Publicar también como anuncio general (visible en muro de todas las familias)".
      - Campos: título (opcional), contenido textarea, selector de hasta 4 imágenes (mismo handler de WallModule).
    - Botón "Publicar" llama `submitPostFromCenter(postData, classroomId, isGlobal)`.
- **TR:**
  - **TR-7.1 (rule):** Modal abre con el aula seleccionada visible en tag; el usuario NO puede cambiar el aula (no hay select).
  - **TR-7.2 (rule):** Rol Asistente → checkbox "anuncio general" NO existe en el DOM (inspeccionar).
  - **TR-7.3 (rule):** Rol Directora → checkbox SÍ existe.
  - **TR-7.4 (rule):** Contenido vacío → desactiva botón publicar o muestra toast "Contenido requerido".
- **Status:** `pending`

---

### ═══════════ Tarea 8: Modal Publicar — Lógica INSERT + SPA Refresh + Realtime Feed ═══════════
- **Prioridad:** `high`
- **Dependencias:** T7
- **Archivos a tocar:**
  - `js/directora/school-center.module.js`:
    - Método `submitPostFromCenter({title, content, images}, classroomId, isGlobal = false)`
      - Si hay imágenes → subir a Supabase Storage usando la misma lógica de `WallModule._uploadImages()` (reutilizar o importar helpers compartidos).
      - INSERT en `posts`: `{teacher_id: yo, classroom_id: isGlobal ? null : classroomId, title, content, media_urls: [...], teacher_name: profile.name}`.
      - Si SDK falla con 401/403/42501 → fallback PostgREST.
      - Al éxito:
        - Toast "Publicación creada".
        - Cerrar modal.
        - Actualizar `_postsCache` unshift con el nuevo post.
        - `_refreshAfterAction(classroomId, { incPostsToday: 1, incPostsWeek: 1 })`.
        - Inyectar el nuevo item en el feed "Actividad de hoy" de la pestaña Resumen **sin rebuild completo** (busca `#kscView .ksc-feed` y prependChild).
- **TR:**
  - **TR-8.1 (rule):** Publicar contenido con imagen → fila en `posts` + archivos en storage correctos.
  - **TR-8.2 (rule):** F5 NO presionada; el nuevo post aparece instantáneamente en el feed del Resumen (última actividad).
  - **TR-8.3 (rule):** isGlobal=true → `classroom_id IS NULL` en la fila de `posts` (o comportamiento global configurado).
  - **TR-8.4 (rule):** Fallback 403 → `fetch()` reintento exitoso.
- **Status:** `pending`

---

### ═══════════ Tarea 9: Modal Crear / Agendar Evento — UI con 2 Tabs (Ahora / Futuro) ═══════════
- **Prioridad:** `high`
- **Dependencias:** T3
- **Archivos a tocar:**
  - `js/directora/school-center.module.js`:
    - Constante interna `EVENT_TYPES` copiando `EVENT_META` del mismo archivo (ya existe en línea 39-52): cada opción con color, label e icon.
    - Método `openNewEventModal(classroomId)` con shell modal:
      - Tabs: `Registrar ahora` (activo) / `Agendar futuro`.
      - Selector tipo evento: chips con icon+label coloreados por EVENT_META.
      - Tab 1: checkbox "Aplicar a todo el grupo" + checklist individual de estudiantes del aula.
      - Tab 2: `input[type=date]` + `input[type=time]` + mismo checklist.
      - Campo de texto opcional "Notas / detalles".
      - Botón "Guardar evento".
- **TR:**
  - **TR-9.1 (rule):** Modal abre; título muestra "[Tipo Evento] · Aula [X]".
  - **TR-9.2 (rule):** 2 tabs existen y son clickeables sin error.
  - **TR-9.3 (rule):** Tab "Registrar ahora" → fecha/hora del día actual preseleccionada.
  - **TR-9.4 (rule):** Checklist de estudiantes: por defecto todos marcados; "Aplicar a todo el grupo" marca/desmarca todos.
  - **TR-9.5 (rule):** Borde 3px + radio 28px + sombra `0 14px 36px` en modal (CSS).
- **Status:** `pending`

---

### ═══════════ Tarea 10: Modal Evento — Lógica INSERT + Deshacer + SPA Refresh ═══════════
- **Prioridad:** `high`
- **Dependencias:** T9
- **Archivos a tocar:**
  - `js/directora/school-center.module.js`:
    - Método `recordEventFromCenter(classroomId, eventType, dateISO, timeStr, studentIds, notes)`
      - Reutiliza el patrón de `KarpusEvents.recordEvent()`:
        - 1. INSERT `classroom_events`: `{classroom_id, teacher_id:yo, event_type, event_date, event_time: dateISO+T+timeStr}`.
        - 2. INSERT masivo `event_participants`: `[{event_id, student_id, status:'present', extra_data:{notes}}]`.
      - Fallback PostgREST si 401/403/42501.
      - Al éxito:
        - Toast `[Evento] registrado ✔️`.
        - Mostrar botón "Deshacer" flotante por 10s (mismo markup de `KarpusEvents.showUndoButton`).
        - `_refreshAfterAction(classroomId, { incEventsToday: 1, recomputeRoutine: true })`.
        - Inyectar evento en `m.eventsToday` de memoria + actualizar la lista "Eventos registrados hoy" en la ficha de aula si está abierta.
    - Método `_undoLastEvent(eventId)` → DELETE `classroom_events` por id (participants se borran por FK ON DELETE CASCADE, asumido).
- **TR:**
  - **TR-10.1 (rule):** Registrar evento "temperatura" para 3 estudiantes → 1 fila en `classroom_events` + 3 filas en `event_participants`.
  - **TR-10.2 (rule):** Botón Deshacer visible por ~10s; clic borra filas en BD y toast "Deshecho".
  - **TR-10.3 (rule):** Rutina % del aula se recalcula y actualiza en tabla Resumen **sin F5**.
  - **TR-10.4 (rule):** Fallback 403 → fetch retorna OK y datos persisten.
- **Status:** `pending`

---

### ═══════════ Tarea 11: Botones de Acción en Alertas del Resumen ═══════════
- **Prioridad:** `medium`
- **Dependencias:** T4 (resolver), T7 (publicar), T9 (evento)
- **Archivos a tocar:**
  - `js/directora/school-center.module.js`:
    - En `_renderResumen()` → mapeo de alertas (líneas ~777-787):
      - `a.sev` y `a.icon === 'message-square'` → añadir `<button class="ksc-alert-cta-secondary" data-ksc-action="replyMsgs" data-ksc-classroom="${a.aula}">Responder ahora</button>`.
      - `a.icon === 'megaphone'` → añadir botón `<button data-ksc-action="newPost" data-ksc-classroom="${a.aula}">Publicar ahora</button>`.
      - `a.icon === 'list-checks'` (rutina incompleta) → añadir `<button data-ksc-action="newEvent" data-ksc-classroom="${a.aula}">Registrar evento</button>`.
    - En `_action()` asegurar que `replyMsgs`, `newPost`, `newEvent` cuando se invocan desde alerta (sin pasar por la ficha de aula) abren el modal correcto **y luego de cerrar devuelven al usuario al tab Resumen** (no cambian a la ficha).
- **TR:**
  - **TR-11.1 (rule):** Alerta tipo message-square → 2 botones ("Ver" + "Responder ahora"). "Responder ahora" abre modal con aula correcta.
  - **TR-11.2 (rule):** Al cerrar el modal abierto desde alerta, el usuario permanece en tab "Resumen" (no cambia a Organización / Aula).
- **Status:** `pending`

---

### ═══════════ Tarea 12: Badge de Alertas en Sidebar para los 3 paneles ═══════════
- **Prioridad:** `medium`
- **Dependencias:** T1 (Asistente), T2 (Control)
- **Archivos a tocar:**
  - `panel_asistente.html` → ítem Centro Escolar lleva `<span class="kk-badge" id="badge-ksc">0</span>`.
  - `panel_control.html` → ítem lleva `<span class="nav-badge" id="badge-ksc">0</span>`.
  - `js/directora/school-center.module.js`:
    - En `_render()` después de calcular `D.alerts.length`, actualizar `#badge-ksc` en el DOM (si existe):
      - Si `D.alerts.length > 0` → mostrar y setear valor (99+ si >99).
      - Si 0 → ocultar (add `.hidden` o `display:none`).
- **TR:**
  - **TR-12.1 (rule):** Haber 5 alertas → badge del sidebar de Directora muestra "5".
  - **TR-12.2 (rule):** Resueltas todas las alertas → badge desaparece.
- **Status:** `pending`

---

### ═══════════ Tarea 13: Helper SPA de Actualización Parcial (`_refreshAfterAction`) ═══════════
- **Prioridad:** `high` (cross-task: usado por T5, T8, T10)
- **Dependencias:** Ninguna (se define en el SchoolCenterModule antes de usarse)
- **Archivos a tocar:**
  - `js/directora/school-center.module.js`:
    - Nuevo método interno `_refreshAfterAction(classroomId, deltas = {})`.
      - Firma: `{ decPendingMsgs?:number, incPostsToday?:number, incPostsWeek?:number, incEventsToday?:number, recomputeRoutine?:boolean }`.
      - Paso 1: Localizar el aula en `this._data.aulas` / `this._data.pool` por id.
      - Paso 2: Aplicar deltas a su `a.m.*` (ej: `a.m.msgsPending.length -= N`, `a.m.postsToday++`).
      - Paso 3: Recomputar `a.status` (semáforo) si hay cambios que lo afecten.
      - Paso 4: Actualizar DOM selectivamente:
        - Hero KPIs: `#kscKpis` → actualizar valor correspondiente buscando `.ksc-kpi-value` por índice o atributo data.
        - Tabla Resumen: buscar la fila `tr[data-ksc-open-aula="${id}"]` y actualizar los chips de Asistencia/Rutina/Publica./Mensajes re-renderizando sus `<span class="ksc-chip">`.
        - Feed (si corresponde): inyectar prepend.
        - Semáforo `#kscSem`: re-calcular global level (danger/warn/ok) → actualizar clase y texto.
      - **No** llamar a `_render()` completo (evita reflow masivo).
- **TR:**
  - **TR-13.1 (rule):** Después de enviar respuesta (T5): KPI msgs ↓1, chip mensajes del aula ↓1, sin reconstruir toda la vista.
  - **TR-13.2 (rule):** `_compute()` completo NO es llamado; `_render()` NO es llamado (poner console.count temporalmente).
- **Status:** `pending`

---

### ═══════════ Tarea 14: Mejoras CSS finales y unificación de paleta por rol ═══════════
- **Prioridad:** `medium`
- **Dependencias:** T3, T4, T7, T9 (ya han añadido clases)
- **Archivos a tocar:**
  - `css/school-center.css`:
    - Variables CSS con detección de clase de panel:
      - `body.panel-asistente-body .ksc { --accent:#0d9488 }`
      - `body.panel-directora-body .ksc { --accent:#0B63C7 }`
      - `#sidebar (control) .ksc { --accent:#8B5CF6 }` (o detectar por clase de panel_control)
    - Animación `@keyframes fadeUp { from{transform:translateY(14px);opacity:0} to{...} }` y `.ksc-modal{animation:fadeUp .35s cubic-bezier(.4,0,.2,1)}`.
    - `.ksc-chip.ksc-chip--clickable` cursor pointer + hover.
    - Responsive móvil: `.ksc-quick-actions { grid-template-columns: 1fr 1fr 1fr }` → `1fr 1fr` en <480px.
  - Asegurar que `panel_control.html` y `panel_asistente.html` incluyan `wall-social.css` y `messenger-chat.css` si no lo tenían (para modal composer/chat internos).
- **TR:**
  - **TR-14.1 (rule):** fadeUp visible al abrir cualquier modal (se ve el desvanecimiento desde abajo).
  - **TR-14.2 (rubric):** Comparación visual lado a lado en 3 paneles: misma estructura, solo cambia color de acento. Escala 0-2, umbral ≥2.
  - **TR-14.3 (rubric):** 375px: botones quick actions sin overflow, modales con scroll interno, sin texto solapado. Escala 0-2, umbral ≥1.
- **Status:** `pending`

---

### ═══════════ Tarea 15: Validación Final — Checklist Cross-Panel ═══════════
- **Prioridad:** `high`
- **Dependencias:** Todas anteriores completas
- **TR (todos rule):**
  - **TR-15.1:** Panel Directora → Abrir Centro Escolar → Entrar a un aula con msgs pend → Responder → todo OK (sin errores consola).
  - **TR-15.2:** Panel Asistente → Ítem visible → Publicar en un aula → Feed actualiza.
  - **TR-15.3:** Panel Control → Ítem visible → Agendar evento futuro para 1 alumno → filas en BD correctas.
  - **TR-15.4:** `grep -R "location.reload" js/directora/school-center.module.js js/asistente/main.js js/control/main.js` → **0 resultados** o solo comentarios.
  - **TR-15.5:** `grep -nE 'innerHTML\s*\+?=.*\.(content|title|message|name)'` en school-center.module.js → cada uso pasa antes por `esc(...)`.
  - **TR-15.6:** Mobile viewport 375×812 → 3 paneles sin overflow-x horizontal, modales cerrables.
  - **TR-15.7 (rubric):** Performance: apertura de cada modal <300ms (medido con performance.now() en onclick). Umbral ≥2 (todos <300ms).
- **Status:** `pending`

---

## Orden de Ejecución Sugerido (paralelizable)

```
Semana 1 (Bloque A — Fundamentos)
   ├── T13 (helper refresh)   │ ejecutar primero, usado por otras
   ├── T1  (Asistente CE)    ─┤
   ├── T2  (Control CE)      ─┤  paralelos entre sí
   └── T3  (Quick bar)         │ requiere que exista al menos T1 o T2 para QA visual

Semana 2 (Bloque B — Modales y lógica)
   ├── T4 + T5 (Mensajes)    ─┤
   ├── T7 + T8 (Publicar)    ─┤  paralelos (son modales independientes)
   └── T9 + T10 (Eventos)    ─┘

Semana 3 (Bloque C — Pulido y cross-cutting)
   ├── T6  (chip msgs)       ─┤ depende T4
   ├── T11 (Alertas acciones)─┤ depende T4/T7/T9
   ├── T12 (Badges sidebar)  ─┤ depende T1/T2
   ├── T14 (CSS/roles)       ─┤ depende T3/T4/T7/T9
   └── T15 (Validación final) ┘ final
```

---

## Evidencia de Completitud por Tarea

Cada tarea al completarse debe adjuntar:
1. Captura de pantalla del estado final.
2. Fragmento de consola (si aplica) confirmando 0 errores.
3. Snippet SQL (`SELECT * FROM X WHERE ... LIMIT 2`) confirmando fila insertada (para T5, T8, T10).
