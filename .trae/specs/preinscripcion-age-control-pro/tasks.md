# Plan de Implementación: Control de Edades + Admisión Profesional

Orden de ejecución: T1 → T2 → T3 → T4 → T5 → T6 → T7 (dependencias estrictas).

---

## Task 1: Asegurar columnas nuevas en `preinscripcion.html` SUBMIT payload

**Objetivo**: Que el formulario público de preinscripción guarde en `student_preregistrations` los 5 campos de control de edad y autorización.

**Archivo a modificar**: `preinscripcion.html`
- Ubicación actual: bloque submit (L1063-L1119). El objeto `data` (L1073-1093) NO incluye `suggested_level`, `age_match`, `director_authorization_requested`, `director_authorization_note`, ni `director_authorization_approved`.
- Estado actual del HTML: JS `LEVEL_AGE_RANGES`, `renderAgeValidationBox()`, `validateStep(1)` con chequeo de checkbox ya existen (L679-L943). **Solo faltan los campos en INSERT**.

**Acciones**:
1. Dentro del `submit` handler, inmediatamente después de construir `data`, agregar:
   ```js
   // Control edad / autorizacion (pre.md + FIX_PREINSCRIPCION_AGE_CONTROL.sql)
   const pc = window._precalc || {};
   data.suggested_level = pc.suggestedLevel || null;
   data.age_match = !!pc.ageMatch;
   data.director_authorization_requested = v('director_authorization_requested') === 'on';
   data.director_authorization_note = v('director_authorization_note') || null;
   // director_authorization_approved lo maneja panel directora; aqui NULL por defecto
   data.director_authorization_approved = null;
   ```
2. Mejorar el `catch` del submit: si el error menciona `"does not exist"` o `undefined_column`, mostrar un mensaje localizado tipo:
   > "⚠️ Error de configuración: antes de usar este formulario, ejecuta el script `FIX_PREINSCRIPCION_AGE_CONTROL.sql` en el Editor SQL de Supabase. Detalle: ..."

**Prioridad**: `high`
**Dependencias**: Ninguna (SQL debe aplicarse primero manualmente — documentado en AC-R01 como prerequisito).

**Test Requirements (TR)**:
| TR ID | Tipo | Condición |
|---|---|---|
| T1-TR01 | rule | Submit con `age_match=false` + checkbox marcado → Network tab Supabase muestra los 5 campos en INSERT. |
| T1-TR02 | rule | Forzar error 42703 (no aplicar SQL) → UI muestra mensaje localizado sobre el script SQL, no alert() crudo. |

---

## Task 2: Actualizar `inscripciones.module.js` — SELECT, KPIs, filtros y badges de edad/autorización

**Objetivo**: Que el panel de Inscripciones (Directora y Asistente) muestre el estado de edad/autorización y un cuarto KPI.

**Archivo**: `js/directora/inscripciones.module.js`

**Acciones**:
1. **Ampliar `.select()`** (L77-L91) para incluir:
   ```
   suggested_level, age_match,
   director_authorization_requested, director_authorization_note,
   director_authorization_approved, reviewed_at, reviewed_by, birth_date
   ```
2. **Añadir 4º KPI**: Después del KPI "Rechazados", agregar tarjeta "Pend. Autorización" (`bg-purple-50 border-purple-200` / text-purple-700) con `count = data.filter(r => !r.age_match && r.director_authorization_requested && r.director_authorization_approved === null).length`.
3. **Nuevos filtros**: Añadir botones:
   - `Edad Fuera Rango` → fila `age_match === false`.
   - `Autoriz. Pendiente` → count como arriba.
4. **Badges en fila**: En `_renderRow(r)` (L164-L195):
   - Badge edad: `r.age_match === true` → `bg-green-100 text-green-700` `✅ Edad OK`; else → `bg-amber-100 text-amber-700` `⚠️ Edad fuera`.
   - Badge autorización:
     - `r.director_authorization_requested === true && r.director_authorization_approved === null` → `bg-blue-100 text-blue-700` `Pend. Autoriz. Directora`.
     - `r.director_authorization_approved === true` → `bg-emerald-100 text-emerald-700` `Autoriz. Aprobada`.
     - `r.director_authorization_approved === false` → `bg-rose-100 text-rose-700` `Autoriz. Rechazada`.
   - Si el usuario NO es directora (revisar `AppState.get('user').role` o por `profile.role`), los botones Aprobar/Rechazar están ocultos.
5. **Nuevo botón en fila**: `👁 Ver Detalle` que llama `InscripcionesModule.openPreDetail(r.id)`.
6. **Bloquear Admitir cuando no tiene autorización**: Si `r.age_match === false && r.director_authorization_approved !== true`, el botón "Admitir" debe tener `disabled`, estilos atenuados, y `title="Requiere aprobación de Directora por edad fuera de rango"`.
7. **Añadir exports** `openPreDetail`, `approveAuth`, `rejectAuth` a `InscripcionesModule`.

**Prioridad**: `high`
**Dependencias**: T1 (los campos existen en INSERT).

**Test Requirements**:
| TR ID | Tipo | Condición |
|---|---|---|
| T2-TR01 | rule | KPI "Pend. Autorización" muestra el count real según filtro SQL L↑ |
| T2-TR02 | rule | Botón Admitir en fila con `age_match=false` está `disabled`; al pasar mouse muestra tooltip. |
| T2-TR03 | rule | Filtros nuevos aparecen en fila de botones y funcionan (ocultan filas no coincidentes). |
| T2-TR04 | rubric | Calidad de badges: 0=sin badges, 1=badges sin iconos, 2=badges con iconos lucide/bootstrap + colores por estado. Umbral ≥1 |

---

## Task 3: Implementar Modal de Detalle Preinscripción + Autorización Directora

**Objetivo**: Nueva función `openPreDetail(preregId)` que renderice modal 90% pantalla con tabs + botones de autorización.

**Archivos**:
- `js/directora/inscripciones.module.js` — Añadir funciones nuevas.
- Opcionalmente, crear un CSS inline via `_attachPreDetailStyles()` (como `_attachFilterStyles()`).

**Acciones**:
1. Función `openPreDetail(preregId)`:
   - Hace `.select('*')` + perfiles reviewer name si hay `reviewed_by`.
   - Renderiza `globalModalContainer` con 4 secciones:
     a. **Cabecera**: Foto (si hay), nombre completo, badges de estado (status, edad, autorización), matrícula temporal (si ya admitido).
     b. **Datos Estudiante**: Fila nacimiento, edad calculada en vivo, sexo, nacionalidad, nivel solicitado, horario. **Panel destacado "Control de Edad"** con grid: Rango nivel esperado vs Edad real vs Nivel sugerido. Si `age_match=false`, fondo ámbar.
     c. **Familia**: Grid con P1, P2 (cada uno con teléfono, email, cédula) + emergencia + autorizados a recoger (render JSON array `authorized_persons` como lista).
     d. **Sección Autorización Directora** (solo si `age_match === false`):
        - Motivo del padre (`director_authorization_note`) en cita.
        - Si usuario tiene `role === 'directora'`:
          - `<textarea id="preRevNote" placeholder="Motivo de aprobación o rechazo..." rows="3">`
          - Botones: `<button class="btn-approve-auth">✅ Aprobar Excepción</button>` y `<button class="btn-reject-auth">❌ Rechazar Excepción</button>`.
          - Al hacer clic en aprobar: UPDATE `director_authorization_approved=true`, `reviewed_at`, `reviewed_by`, guardar review note (campo opcional — reutilizar `director_authorization_note` o añadir nuevo `reviewer_note`; para simplificar concatenar al existente con prefijo "[Dirección] ").
          - Al rechazar: mismo UPDATE con `=false`.
        - Si usuario NO es directora: solo badges de estado.
     e. **Timeline**: Eventos `created_at → [director_approved_at si hay] → reviewed_at → admitted`. Si no hay fechas intermedias, omitir.
   - Botones footer: "Cerrar" + (si cumple condiciones) "Ir a Admitir" → llama `openAdmitModal(preregId)` existente.
2. Añadir función `_calcAgeFromBirth(birthDateStr)` reutilizable para el detalle (formato humano).

**Prioridad**: `high`
**Dependencias**: T2 (campos disponibles en filtro/select).

**Test Requirements**:
| TR ID | Tipo | Condición |
|---|---|---|
| T3-TR01 | rule | Modal abre al hacer clic en "👁 Ver Detalle" y muestra todos los campos de la preinscripción. |
| T3-TR02 | rule | Usuario rol `asistente` no ve botones Aprobar/Rechazar; usuario rol `directora` sí los ve. |
| T3-TR03 | rule | Al aprobar excepción, UPDATE retorna sin error y botón "Admitir" en la fila se habilita (refresh listado). |
| T3-TR04 | rubric | Diseño del modal: 0=rota, 1=tablas sin estilo, 2=grid con cards, colores por sección, bordes redondeados. Umbral ≥1 |

---

## Task 4: Mejorar `StudentRecordModal.admitStudent()` — Flujo profesional + usuario padre via edge fn

**Objetivo**: Que la admisión sea atómica (todo o nada) y reutilice `create-student-with-parent` cuando esté disponible, con fallback al legacy `signUp`.

**Archivo**: `js/shared/student-record-modal.js`

**Acciones**:
1. En `_tabAccess()`:
   - Añadir un `<div>` "Previsualización de credenciales a enviar" con grid de 2 columnas: email, password, matricula, aula, horario, mensualidad.
   - Botón "🔒 Generar Password Seguro" que llene `srm-password` con 8 chars alfanum + símbolo.
   - Botón "📧 Enviar Correo de Prueba" abre un `prompt()` pide email destino y llama `sendEmail()` con plantilla para QA.
2. Reemplazar `admitStudent()` actual (L722-L748) por:
   a. Paso 1: Recoger `_collectFormData()` + `emailUser = srm-emailuser` + `password = srm-password`.
   b. Validaciones: `name`, `classroom_id`, `matricula`, `emailUser`, `password ≥ 6 chars`, `monthly_fee ≥ 0`.
   c. **Paso 2 — Opción A (preferida)**: Intentar `fetch('/functions/v1/create-student-with-parent', { method:'POST', body: JSON.stringify({ studentData, parentData: { email, password, name, phone } }) })`.
      - Si HTTP 201 → continuar con `studentId = response.student.id`, `parentUserId` de retorno si lo hay.
   d. **Paso 2 — Opción B (fallback)**: Si edge function no disponible o falla 5xx, ejecutar flujo legacy: `signUp` + profiles upsert + students insert (existe en `inscripciones.module.js:admitStudent()` L238-L453). Reutilizar ese código (mover a función compartida o copiar).
   e. **Paso 3**: Crear plan de pagos y 12 cuotas (igual que en inscripciones.module.js L386-L415).
   f. **Paso 4**: Actualizar preinscripción a `admitted` + `reviewed_at` + `reviewed_by`.
   g. **Paso 5**: Invocar `_sendWelcomeEmail({ studentName, matricula, classroomName, parentEmail, parentPassword, p1Name })` — función nueva.
   h. **Paso 6**: Si paso 5 falla, mostrar botón de reintento "Reenviar Credenciales" en el toast success final; no aborta todo el flujo.
   i. **Paso 7**: Cerrar modal + toast success con datos: "✅ [Nombre] admitido · Matrícula: XXX · Credenciales enviadas a: correo".
3. Función nueva `_sendWelcomeEmail({...})`:
   - Construye `html` con plantilla profesional (sección Task 5).
   - POST a `/functions/v1/send-email` with `{ to: parentEmail, subject, html, text }`.
   - Manejo de errores: si falla, resolver como warning (no throw), guardar estado "email pending" para reintento.

**Prioridad**: `high`
**Dependencias**: T3 (por UI), pero T4 puede hacerse en paralelo con T3 si no comparte código (recomendado secuencial para evitar race conditions en imports).

**Test Requirements**:
| TR ID | Tipo | Condición |
|---|---|---|
| T4-TR01 | rule | Generar password → 8 caracteres, contiene al menos 1 dígito y 1 símbolo (regex test). |
| T4-TR02 | rule | Validación `password length < 6` → toast de error, no continúa. |
| T4-TR03 | rule | Edge fn `create-student-with-parent` HTTP 201 → student insertado + parent_id asignado. |
| T4-TR04 | rule | Edge fn offline → fallback legacy `signUp` funciona y crea usuario. |
| T4-TR05 | rubric | Complejidad del flujo: 0=una llamada sync sin feedback, 1=spinner, 2=spinner + texto estado paso a paso ("Creando usuario...", "Generando pagos...", "Enviando correo..."). Umbral ≥1 |

---

## Task 5: Plantilla de Correo HTML Profesional (Bienvenida Padre + Credenciales)

**Objetivo**: Crear plantilla HTML responsive estilo corporativo, con logo, colores institucionales, CTA destacado.

**Archivo donde vive la plantilla**: String literal dentro de `StudentRecordModal._sendWelcomeEmail()` en `js/shared/student-record-modal.js` (no archivos `.html` nuevos por regla "no crear files a menos que sea necesario").

**Estructura del HTML del correo** (inline CSS, 600px max width):
1. **Header**: Fondo azul #0B63C7, logo `img/monte.jpg` redondo izq., título "Bienvenido a Colegio Montessori Sonrisas Creativas" blanco.
2. **Hero section**: Fondo blanco con gradiente sutil, mensaje: "Estimado/a `{p1Name}`", párrafo de bienvenida.
3. **Tarjeta de Datos del Estudiante** (borde #E2E8F0, radius 12px, padding 20px):
   - Nombre del niño
   - Matrícula MSC-XXXX-XXXX (badge verde)
   - Aula asignada
   - Horario
4. **Tarjeta de Credenciales de Acceso** (borde azul):
   - Correo de login (negrita)
   - Contraseña temporal (con 🔒) + nota "Cámbiala en tu primer inicio"
5. **CTA Button** (100% width, fondo #0B63C7, texto blanco, radius 50px, padding 16px, font-weight 800):
   - "Ir al Panel de Padres" → href=`window.location.origin + '/panel_padres.html'`
6. **Footer**: Info de contacto, Instagram, teléfono, dirección. Aviso legal pequeño.
7. Versión texto plano (`text`): resumen con los mismos datos + URL del panel.

**Subject**: "Bienvenido(a) {studentName} — Matrícula {matricula} · Credenciales de acceso"

**Prioridad**: `medium` (pero muy importante para profesionalismo)
**Dependencias**: T4 (es llamada por `_sendWelcomeEmail`).

**Test Requirements**:
| TR ID | Tipo | Condición |
|---|---|---|
| T5-TR01 | rule | `text` version está poblada (no undefined). |
| T5-TR02 | rule | Subject string incluye nombre niño y matrícula. |
| T5-TR03 | rubric | Calidad visual plantilla: 0=solo texto, 1=tabla sin colores, 2=responsive inline CSS con logo/header/CTA button + footer corporativo. Umbral ≥2 |

---

## Task 6: Integrar `inscripciones.module.js` `admitStudent()` con `StudentRecordModal` + Email

**Objetivo**: Alinear el flujo "Admitir desde listado" (`InscripcionesModule.openAdmitModal` → `StudentRecordModal.open('admit', null, reg)`) para que al finalizar use el nuevo `StudentRecordModal.admitStudent` profesional (T4), y si el usuario hace clic directo (sin pasar por modal), no se pierdan features.

**Archivos**:
- `js/directora/inscripciones.module.js`

**Acciones**:
1. **Deprecated función standalone `InscripcionesModule.admitStudent`** (L238-L453). Mantenerla pero renombrar a `_legacyAdmitStudent` y solo llamarla si el modal no está disponible. Eliminar export público de `InscripcionesModule.admitStudent`; sustituir por:
   ```js
   admitStudent(preregId) {
     // Delegate to modal, which runs professional flow.
     // If modal not reachable, fallback to legacy.
     return StudentRecordModal.open('admit', null, preregIdData);
   }
   ```
   Nota: Técnicamente `openAdmitModal()` ya abre StudentRecordModal; el objetivo es que el botón "Confirmar Admisión" del modal sea el único entry point del flujo profesional.
2. Verificar que `InscripcionesModule.openAdmitModal(preregId)` pasa `reg._preId` correctamente y que `_mapPreData` (student-record-modal L97) incluye los 5 campos nuevos (age_match, director_auth...), aunque no los use, para que estén disponibles en `_preData`.

**Prioridad**: `medium`
**Dependencias**: T4 y T5.

**Test Requirements**:
| TR ID | Tipo | Condición |
|---|---|---|
| T6-TR01 | rule | Click en fila "Admitir" → abre modal → confirmar → se ejecutan todos los pasos (crear usuario, pagos, email, actualizar status). |

---

## Task 7: Corrección de edge cases y pruebas de regresión

**Objetivo**: Limpiar bugs que puedan aparecer por la integración de todo.

**Acciones**:
1. **preinscripcion.html**: Asegurar que `has_siblings` select no tenga bug. Actual `onchange` para `siblingNameGroup` L880-882: en `buildReview()` incluir también info de siblings si el valor es true.
2. **preinscripcion.html**: Asegurarse de que el submit de los documentos no falle por `undefined` — L1095-1102 ya tiene try/catch; pero si ningún archivo fue seleccionado, el querySelector debe manejar `null`.
3. **student-record-modal**: En `_mapPreData(pre)` añadir los 5 campos nuevos (`age_match`, `suggested_level`, etc.) a la lista del return.
4. **supabase RLS**: Si existe RLS policy en `student_preregistrations` para update, asegurarse de que incluya el rol `asistente` y `directora` para el UPDATE en status / reviewed_at / director_authorization_approved. (Si no, los botones de autorización fallarán con 403.) Esto es info-only: indicar al usuario que lo revise si no funciona (no tocar SQL production sin aprobación).

**Prioridad**: `medium`
**Dependencias**: Todas las anteriores.

**Test Requirements**:
| TR ID | Tipo | Condición |
|---|---|---|
| T7-TR01 | rule | submit formulario preinscripción sin documentos (archivos no seleccionados) → no hay crash (TypeError null). |
| T7-TR02 | rule | Si RLS falla al aprobar autorización (403), el toast muestra "Permiso denegado: contacta al administrador para revisar políticas RLS" en español, no mensaje técnico. |

---

## Resumen de Prioridades

| # | Task | Priority | Estimado esfuerzo relativo |
|---|---|---|---|
| 1 | Preinscripción submit 5 campos | HIGH | 0.5 |
| 2 | Inscripciones KPIs, badges, filtros | HIGH | 1.5 |
| 3 | Modal Detalle + Autorización | HIGH | 2 |
| 4 | Flujo admisión profesional (edge fn) | HIGH | 2.5 |
| 5 | Plantilla correo HTML | MEDIUM | 1 |
| 6 | Integrar InscripcionesModule ↔ Modal | MEDIUM | 0.5 |
| 7 | Edge cases / regresión | MEDIUM | 1 |
