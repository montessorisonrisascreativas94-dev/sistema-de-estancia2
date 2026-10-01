# Especificación: Control de Edades Preinscripción + Flujo Admisión Profesional

## Problema
El formulario público de preinscripción (`preinscripcion.html`) carece de un control estricto de edades por aula según la reglamentación interna del Colegio Montessori Sonrisas Creativas. Tampoco existe un workflow oficial para que la Directora autorice excepciones de edad, ni un proceso profesional de admisión en los paneles de Directora/Asistente que incluya creación oficial de usuarios y notificación por correo automática.

## Usuarios y Roles
| Actor | Propósito |
|---|---|
| **Padre/Madre/Tutor** | Llenar preinscripción pública; solicitar excepción de edad si fuera de rango. |
| **Directora** | Visualizar preinscripciones, revisar solicitudes de autorización por edad, aprobar/rechazar excepciones, admitir estudiantes oficialmente, enviar credenciales por correo. |
| **Asistente de Dirección** | Mismas capacidades que Directora excepto aprobar/rechazar excepciones de edad (solo lectura de flag). |
| **Sistema (Edge Functions)** | Crear usuario padre (service role auth), plan de pagos, 12 cuotas, enviar correos via Resend. |

## Objetivos (Goals)
1. **Aplicar reglas oficiales de edad por aula** (`pre.md`) en `preinscripcion.html` con validación en vivo, sugerencia automática de nivel y persistencia de las 4 columnas nuevas (más `director_authorization_approved`) en BD.
2. **Flujo de autorización Directora** sobre preinscripciones fuera de rango: aprobar (TRUE) o rechazar (FALSE) con justificativa. Bloquear botón "Admitir" si la excepción no fue autorizada por Dirección.
3. **Panel de Inscripciones profesional** (Directora y Asistente): KPIs actualizados (incluyendo "Pend. Autorización"), badges visibles, filtros por estado de edad, vista detallada de preinscripción con timeline de eventos.
4. **Admisión profesional**: Al admitir, invocar edge function `create-student-with-parent` o equivalente para crear usuario auth, perfil, estudiante, plan y 12 pagos; luego invocar `send-email` para enviar credenciales al tutor con plantilla HTML profesional.

## No Objetivos (Non-Goals)
- Modificar roles/permisos de Supabase Auth más allá de crear usuarios padre.
- Rediseño general del sidebar o navegación.
- Cambiar el esquema de la tabla `students` o `classrooms` más allá de lo mínimo.
- Implementar pagos online; solo se generan cuotas pendientes.

---

## Requisitos Funcionales (FR)

### FR-01 · Preinscripción Pública: Reglas de Edad
El formulario en `preinscripcion.html` debe, en el Paso 1:
- Mostrar `<select>` de `level_requested` con 12 aulas regulares (agrupadas) + 6 aulas especiales según `pre.md`.
- Al ingresar `birth_date`, calcular edad en formato humano ("3 meses, 12 días" / "4 años, 2 meses").
- Auto-seleccionar el nivel sugerido por edad, a menos que el usuario haya tocado manualmente el select.
- Mostrar `#levelValidationBox` condicional:
  - ✅ Verde → edad en rango.
  - ⚠️ Naranja → edad fuera de rango → muestra nivel sugerido + checkbox "Solicito autorización a Dirección" + textarea motivo.
  - ❌ Rojo → edad < 45 días → mensaje "demasiado pequeño" + checkbox autorización.
  - Niveles especiales → sin box.

### FR-02 · Submit Preinscripción
El payload INSERT a `student_preregistrations` DEBE incluir:
- `suggested_level text` — nivel sugerido por la edad calculada.
- `age_match boolean DEFAULT true` — `true` si la edad está en rango; `false` si requiere revisión.
- `director_authorization_requested boolean DEFAULT false` — el padre marcó la casilla.
- `director_authorization_note text` — el motivo opcional del padre.
- `director_authorization_approved boolean DEFAULT null` — NULL = pendiente, TRUE = Directora aprobó, FALSE = rechazó.
- **Validación frontend**: si `age_match=false` y el padre NO marca `director_authorization_requested`, no se puede avanzar del Paso 1.

### FR-03 · Panel Inscripciones · KPIs y Filtros
`inscripciones.module.js` (compartido Directora/Asistente) debe:
- Mostrar 4 KPIs: Pendientes, Admitidos, Rechazados, **Pendientes Autorización** (= `age_match=false AND director_authorization_requested=true AND director_authorization_approved IS NULL`).
- Filtros adicionales: `Con Autoriz. Pendiente`, `Edad Fuera de Rango`.
- Cada fila debe visualizar: badges de `age_match` (✅/⚠️), estado de autorización Directora (`Pendiente`/`Aprobada`/`Rechazada`) y un botón "Ver Detalle" además de "Admitir".

### FR-04 · Vista Detalle de Preinscripción
Modal de detalle completo (90% pantalla, estilo student-record-modal) con 4 secciones:
1. **Datos Estudiante** + badge de edad vs nivel.
2. **Datos Familiares** + contactos.
3. **Control Edad / Autorización**: panel resaltado que muestra rango esperado, edad real, nivel sugerido, motivo del padre y — solo para rol `directora` — botones **✅ Aprobar Excepción** / **❌ Rechazar Excepción** + textarea justificativa de Dirección.
4. **Timeline**: fecha envío preinscripción, fecha revisión, fecha de autorización, fecha de admisión.

### FR-05 · Bloqueo de Admisión Sin Autorización
- Si la preinscripción tiene `age_match=false` (fuera de rango):
  - Botón "Admitir" queda **deshabilitado** si `director_authorization_approved` no es TRUE.
  - Tooltip/texto: "Requiere aprobación de Dirección por edad fuera de rango".
- Asistente: solo puede visualizar estado; solo la Directora puede aprobar/rechazar excepción.

### FR-06 · Flujo de Admisión Profesional
Al confirmar admisión (botón "Aprobar Admisión" en `StudentRecordModal` o `InscripcionesModule.admitStudent`):
1. Si no hay contraseña temporal, generar una segura (8 chars alfanum + símbolo).
2. Invocar `create-student-with-parent` edge function (service role) o lógica equivalente para:
   - Crear/recuperar usuario auth padre.
   - Hacer upsert del perfil padre (role=padre).
   - Insertar `students` con vínculo `parent_id`.
3. Crear plan de pagos (`payment_plans`) + 12 cuotas (`payments`) según mensualidad y mes de inicio.
4. Actualizar `student_preregistrations → status='admitted'`, `reviewed_at`, `reviewed_by`.
5. **Invocar `send-email` edge function** con plantilla HTML profesional que contenga:
   - Nombre del niño + matrícula + aula asignada.
   - Nombre tutor + correo de login + contraseña temporal.
   - Link directo al panel padre.
   - Logotipo del colegio, colores corporativos, llamado a la acción.
6. Generación de matrícula automática: prefijo `MSC-` + año + 4 dígitos únicos.

### FR-07 · Previsualización de Credenciales
Antes de confirmar admisión, en pestaña "Accesos" del StudentRecordModal:
- Mostrar resumen visual con los datos a enviar: email, contraseña (con 👁 toggle), matrícula, aula.
- Botón "Probar Envío" que envía el correo al email que se indique para QA.

### FR-08 · Resistencia a Errores
- Si falla envío de correo: marcar proceso como "admitido PERO correo fallido", con botón de reintento "Reenviar Credenciales".
- Si falla creación de usuario: hacer rollback lógico (no marcar admitted) y mostrar error técnico localizado en español.
- Mensajes de error de API mapeados a texto amigable (no stack trace crudo).

---

## Requisitos No Funcionales (NFR)

### NFR-01 · Consistencia Visual
- Colores corporativos: sidebar verde oscuro; badges edad fuera de rango en ámbar/rojo; aprobación verde; estado Directora azul.
- Iconografía exclusiva via Lucide Icons (no iconos emoji en texto fijo).
- Animaciones: fade-up 300ms en modales; micro-interacciones en botones.

### NFR-02 · Separación de Lógica
- Todo código JS nuevo en módulos ES6 (`inscripciones.module.js`, `student-record-modal.js`); **nada de código inline** en HTML mas allá de lo estrictamente necesario para `onclick` globales.

### NFR-03 · Performance
- Timeout de edge functions: 30s (Resend + Supabase Auth pueden ser lentos).
- Feedback de loading durante admisión (spinner + texto "Procesando..." + deshabilitar botón).

### NFR-04 · Seguridad
- Nunca exponer `SUPABASE_SERVICE_ROLE_KEY` en frontend; todas las operaciones privilegiadas (crear usuario admin, forzar confirmación de email) van por Edge Functions.
- Validar emails regex; password longitud ≥ 6; matrícula única (check pre-insert).
- La autorización Directora solo puede cambiarla `role = 'directora'` (validar server-side en policy RLS o en edge function — cliente: ocultar botones según rol).

### NFR-05 · Compatibilidad
- Columnas nuevas tienen DEFAULT; preinscripciones existentes no se rompen.
- Edge functions son opcionales: si no se despliegan, el sistema debe caer al flujo legacy de `signUp` + `upsert profile` y mostrar warning de "correo no enviado (edge function no disponible)" pero NO abortar la admisión.

---

## Restricciones y Dependencias

| ID | Tipo | Detalle |
|---|---|---|
| D-01 | SQL | **Antes** de deployar frontend, aplicar `sql/FIX_PREINSCRIPCION_AGE_CONTROL.sql` en Supabase SQL Editor (agrega las 5 columnas + índices). |
| D-02 | Edge Fn | `create-student-with-parent/index.ts` ya existe pero requiere validación de inputs y retorno del ID del usuario + estudiante. |
| D-03 | Edge Fn | `send-email/index.ts` ya existe con Resend; requiere variable de entorno `RESEND_API_KEY` y `FROM_EMAIL` configurada. |
| D-04 | Storage | Documentos subidos como base64 inline; no cambiar storage bucket. |

---

## Criterios de Aceptación (Acceptance Criteria)

### Reglas (rule)
| AC ID | Condición observable | Fuente de evidencia |
|---|---|---|
| AC-R01 | Al seleccionar `birth_date` = hoy-50d, `level_requested` auto-selecciona "Párvulos I" y `ageMatch=true`. | Inspección de DOM + console.log(window._precalc) |
| AC-R02 | Al seleccionar `birth_date` = hoy-10y y `level_requested` = "Párvulos I", se muestra box ámbar, se sugiere "4to – Línea Verde", y si no se marca el checkbox de autorización, `validateStep(1)` retorna `false`. | Prueba manual Paso 1 |
| AC-R03 | Submit con `ageMatch=false` + checkbox marcado inserta los 5 campos nuevos (`suggested_level`, `age_match`, `director_authorization_requested`, `director_authorization_note`, `director_authorization_approved=null`) en `student_preregistrations`. | Supabase Table Editor |
| AC-R04 | KPI "Pend. Autorización" en panel Inscripciones muestra count = filas con `age_match=false AND director_authorization_requested=true AND director_authorization_approved IS NULL`. | Insert de prueba + render |
| AC-R05 | Botón "Admitir" deshabilitado visualmente cuando `age_match=false AND director_authorization_approved IS NOT TRUE`; tooltip visible. | Estado DOM button[disabled] |
| AC-R06 | Solo usuario rol=`directora` ve botones "Aprobar Excepción"/"Rechazar Excepción"; Asistente ve solo badge de estado. | `profile.role` en state + render condicional |
| AC-R07 | Al aprobar admisión, se: crea/encuentra perfil padre, crea estudiante con `parent_id`, crea 12 payments, marca `status='admitted'`, y `send-email` retorna `{success:true}`. | Supabase + Resend dashboard (o logs de edge function) |
| AC-R08 | Plantilla de correo incluye: nombre niño, matrícula, aula, login email, contraseña temporal, botón CTA al panel padre, logo del colegio. | Bandeja de entrada del destinatario |

### Rúbricas (rubric)
| AC ID | Dimensión | Escala 0-2 | Umbral | Fuente de evidencia |
|---|---|---|---|---|
| AC-S01 | Calidad estética panel inscripciones | 2=KPIs con gradiente + badges con sombra + hover rows; 1=solo texto plano; 0=rota | ≥1 | Captura de pantalla del panel |
| AC-S02 | Profesionalismo del correo enviado | 2=plantilla responsive HTML con header/hero/cta/footer; 1=solo texto plano; 0=sin enviar | ≥2 | Captura del correo renderizado |
| AC-S03 | UX del flujo de admisión | 2=feedback loading en cada paso, resumen final, toast success; 1=sin feedback; 0=bloquea navegación | ≥2 | Secuencia de screenshots |
| AC-S04 | Manejo de errores localizado | 2=mensajes en español, sin stack trace, botón reintento; 1=alert() con error genérico; 0=pantalla blanca | ≥1 | Forzar fallo de red y observar UI |

---

## Preguntas Abiertas
1. **Dominio de correos**: ¿El `FROM_EMAIL` de Resend ya está verificado en montessorisonrisascreativas.com? Si no, el correo llega a spam o falla con dominio no autorizado. **Asunción**: ya está configurado y verificado.
2. **Meses de pago**: ¿Siempre 12 cuotas a partir del `startMonth`? **Asunción**: sí, actual behavior en `inscripciones.module.js` L401.
3. **Rol Asistente vs Directora**: ¿Asistente puede admitir estudiantes cuya edad está en rango? **Asunción**: Sí. Solo la autorización de excepción de edad es exclusiva de Directora.
