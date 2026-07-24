# INFORME ARQUITECTÓNICO Y GUÍA DE LOGICA DE FLUJO: REDISEÑO DEL EXPEDIENTE DEL ESTUDIANTE
## Colegio Montessori Sonrisas Creativas (Karpus Kids)

Este informe técnico define la **arquitectura, lógica de flujo, asignación de base de datos e interfaz UI/UX** para el rediseño integral de los módulos de **Preinscripción**, **Admisión** y **Expediente del Estudiante** (Crear/Editar).

El objetivo principal es transicionar de un formulario largo clásico a un **Expediente Multitestallado Premium** inspirado en la simplicidad y estética de **Stripe Dashboard, Linear, Notion y Apple**, optimizando la velocidad de consulta a menos de 10 segundos por expediente.

---

## 1. Mapa de Integración y Flujo de Datos

El ciclo de vida del estudiante tiene tres estados lógicos representados en el sistema:

```
[ PADRE: Formulario de Preinscripción ] (Público / preinscripcion.html)
                   │  (Inserta en: student_preregistrations | status = 'pending')
                   ▼
[ PANEL DIRECTORA: Módulo Admisión ] (panel_directora.html / InscripcionesModule)
                   │
                   ├─► Revisa Datos en UI Multitestaña (Campos precargados y editables)
                   │
                   ▼  (Acción: Aprobar Admisión / Admitir Estudiante)
[ MOTOR DE BASE DE DATOS (Supabase Transaction / RPC) ]
                   │
                   ├─► Inserta en 'students' ( classroom_id, matricula, status = 'active' )
                   ├─► Inserta/Vincula Tutor en 'profiles' ( role = 'padre' )
                   ├─► Genera Plan Financiero 'payment_plans' e 'invoices' (12 cuotas)
                   ├─► Almacena documentos físicos cargados en Supabase Storage
                   ├─► Dispara Edge Function 'create-student-with-parent' (Cuenta de Auth + Email Resend)
                   └─► Genera Código de Acceso QR único
                   │
                   ▼
[ PANEL DIRECTORA / ASISTENTE: Expediente Escolar ] (panel_directora.html / Sección Estudiante)
                   │
                   └─► Vista / Edición usando EXACTAMENTE la misma interfaz multitestaña
```

---

## 2. Lógica del Modelo de Datos (DB Mapping)

Para soportar las 7 pestañas del expediente, los datos de `student_preregistrations` se mapean de forma inteligente a las tablas de producción al presionar **"Admitir Estudiante"**:

| Pestaña del Modal | Tabla Supabase Destino | Columnas / Campos Clave |
| :--- | :--- | :--- |
| **1. Información General** | `students` | `id`, `first_name`, `last_name`, `birth_date`, `gender`, `nationality`, `classroom_id`, `matricula`, `status` ('active'), `created_at` |
| **2. Familia** | `profiles` (Tutor) <br> `student_guardians` <br> `student_siblings` | `id` (parent_id), `name`, `cedula`, `phone`, `email`, `role` ('padre') <br> Relación de parentesco y autorizados de recogida <br> Relación de ID de hermanos para compartir accesos |
| **3. Salud** | `student_health` (o `students.health_data` JSONB) | `blood_type`, `medical_insurance`, `pediatrician`, `pediatrician_phone`, `allergies` (TEXT[]), `medications`, `conditions`, `disability`, `diet_restrictions`, `vaccines_complete` (BOOL) |
| **4. Pagos** | `payment_plans` <br> `payments` <br> `invoices` | `plan_type`, `monthly_amount`, `discount_rate`, `extended_day_cost`, `due_date`, `status` ('pending'/'paid'), `dgii_ncf` |
| **5. Documentos** | `student_documents` | `id`, `student_id`, `document_type` (acta_nacimiento, vacunas, cedula), `file_url`, `uploaded_at` |
| **6. Accesos** | `profiles` / `auth.users` | `email`, `onesignal_player_id`, `qr_code_token`, `last_sign_in_at` |
| **7. Historial** | `student_history` (Auditoría) | `id`, `student_id`, `event_type`, `description`, `created_at` (Timeline) |

---

## 3. Cabecera Dinámica del Modal (Ficha de Identidad)

La cabecera permanece fija en la parte superior del modal (independientemente de la pestaña activa), ofreciendo contexto visual inmediato y accesos rápidos en 1 clic.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  [📷 Avatar/Foto]   ESTUDIANTE: Sebastián Alejandro Torres Ruiz                        │
│  [  120 x 120 px]   Matrícula: SC-2026-0482  │  Edad: 4 años, 2 meses (Edad Inicial)   │
│  [Bordes r=24px ]   Nivel: Kínder  │  Aula: Sala Verde  │  Horario: Mañana (7:30 - 13:00) │
│                     Estado: [● ACTIVO (Verde)]                                         │
│                                                                                        │
│  [✏️ Editar Datos]  [🖨️ Imprimir Carnet]  [📱 Generar QR]  [🕒 Ver Historial de Cambios] │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Lógica de Estados en Cabecera:
* **Pendiente (Amarillo `#FF8A00`):** Cuando proviene de una preinscripción que aún no ha sido aprobada.
* **Activo (Verde `#28B54D`):** Estudiante matriculado, con aula asignada y solvente/al día.
* **Inactivo (Gris `#94A3B8`):** Retirado o egresado.

---

## 4. Detalle de Lógica por Pestañas (Las 7 Dimensiones del Expediente)

### Pestaña 1: Información General
Organizado en un Grid limpio de **dos columnas** con espaciados de `24px` y inputs con bordes redondeados (`rounded-2xl`).
* **Lógica Administrativa de Admisión:**
  - `Edad` se calcula automáticamente en base a la `Fecha de nacimiento`.
  - El campo `Matrícula` se autogenera con la nomenclatura `SC-[AÑO_ACTUAL]-[CONSECUTIVO]` (ej: `SC-2026-0853`).
  - El dropdown de `Aula` lee en tiempo real la capacidad disponible de las aulas de ese `Nivel`. Si un aula está al 100% de capacidad, el sistema muestra un indicador visual en color rojo `[LLENO]` al lado del nombre del aula.

### Pestaña 2: Familia (Tarjetas Colapsables)
En lugar de una lista plana, se estructuran en tres tipos de tarjetas visuales e independientes con iconos descriptivos:
1. **Tutor Principal & Tutor Secundario:** Tarjetas completas con fotografía opcional, información laboral (profesión, empresa), datos de contacto directo (Teléfono, Correo, WhatsApp con enlace directo para chat) y checks booleanos: `Tutor Autorizado para Firmas` y `Contacto de Emergencia`.
2. **Personas Autorizadas de Recogida:** Un listado de tarjetas pequeñas con foto de seguridad, cédula de identidad y parentesco. Un botón dinámico `[+ Agregar Persona Autorizada]` abre un mini-formulario flotante.
3. **Hermanos Inscritos:** El sistema realiza un barrido en la tabla `students` buscando coincidencias en los apellidos o el ID del tutor para listar a los hermanos en el centro. Incluye un switch interactivo: `[Compartir Accesos y Facturas: SÍ / NO]`. Si se marca `SÍ`, ambos perfiles se vinculan a la misma cuenta de facturación del padre.

### Pestaña 3: Salud (Ficha Médica de Emergencia)
Pensada para la consulta ultra-rápida por parte de la maestra o asistente ante cualquier eventualidad médica:
* **Tarjeta Alertas Críticas (Fondo Rojo `#FEE2E2`):** Muestra de forma prioritaria el **Tipo de sangre**, las **Alergias** y las **Condiciones médicas** (como asma, diabetes, etc.).
* **Contactos Médicos:** Seguro médico (EPS), número de póliza, nombre del pediatra del niño y botón de llamada rápida a su teléfono.
* **Seguimiento Preventivo:** Restricciones alimentarias (ej: libre de gluten, nueces) y estado del esquema de vacunas (`Esquema Completo: SÍ / NO`).

### Pestaña 4: Pagos (Módulo Financiero y Caja)
Visualiza el balance del estudiante de forma transparente:
* **KPIs Financieros:** Saldo pendiente en color rojo bold, descuento aplicado y plan de pago seleccionado (Mensual, Trimestral o Anual).
* **Historial de Transacciones:** Tabla compacta de las últimas 5 facturas, incluyendo número de factura DGII (NCF), método de pago preferido, fecha de vencimiento y estado (`Pagado` / `Pendiente` / `Vencido` con cálculo automático del **5% de recargo por Mora** si aplica).
* **Acción Principal:** Botón `[💳 Ver Cuenta Completa e Historial de Caja]` que redirige directamente a la sección de cobros con el perfil del estudiante pre-filtrado.

### Pestaña 5: Documentos (Gestor de Archivos Físicos y Digitales)
Presenta una rejilla de tarjetas que representan los requisitos de inscripción (Acta de nacimiento, Tarjeta de vacunas, Copias de cédula de los padres, Contrato escolar firmado, etc.).
* **Lógica de Estado de Documentación:**
  - Cada tarjeta muestra un badge de estado: `[Cargado (Verde)]` o `[Pendiente (Rojo)]`.
  - Cada archivo cuenta con botones rápidos flotantes:
    - `[👁️ Vista Previa]` (abre un lightbox modal para ver PDFs o imágenes sin salir).
    - `[📥 Descargar]` (descarga directa desde el bucket de Supabase Storage).
    - `[🔄 Actualizar]` (abre el selector de archivos para sobreescribir).
    - `[❌ Eliminar]` (pide confirmación y elimina el registro en Storage y base de datos).

### Pestaña 6: Accesos (Seguridad y PWA)
Lógica de control para que el padre pueda ingresar a `panel_padres.html` y recibir las alertas:
* **Contraseña Temporal:** Botón para generar una clave aleatoria y enviarla por correo de forma instantánea al padre (`[✉️ Enviar Credenciales]`).
* **Código QR Único:** Genera un código QR dinámico que contiene el ID encriptado del estudiante. Al escanear este QR en la puerta del colegio (con la cámara del panel de control de entrada), se valida y registra de forma automática la entrada o salida (`attendance`) y se dispara la notificación push al celular del padre.
* **Acciones:** `[📱 Regenerar QR]`, `[🖨️ Imprimir Carnet Escolar]`.

### Pestaña 7: Historial (Timeline de Auditoría)
Línea de tiempo vertical e interactiva que registra cronológicamente los hitos del estudiante, ideal para resolver disputas o dudas:
* **Estructura del Timeline:**
  ```
  ● [23 Jul 2026 10:14 AM] - Preinscripción recibida desde formulario web.
  ● [24 Jul 2026 08:30 AM] - Documentación cargada y verificada por Asistente.
  ● [24 Jul 2026 02:00 PM] - Entrevista de admisión realizada con Directora.
  ● [24 Jul 2026 02:45 PM] - Admisión aprobada. Estudiante asignado a Sala Verde (Kínder).
  ● [24 Jul 2026 02:46 PM] - Credenciales y Código QR de acceso enviados al padre.
  ● [01 Ago 2026 07:45 AM] - Primer ingreso registrado en el colegio.
  ```

---

## 5. Modo Admisión (Workflow Automatizado de Preinscripción)

Cuando la Directora o Asistente abre una preinscripción recibida en `student_preregistrations`:

1. **Precarga Absoluta (Zero-Doble-Trabajo):**
   - El sistema abre el modal de 7 pestañas.
   - **Toda** la información que los padres enviaron se mapea y rellena automáticamente en los inputs correspondientes. Los campos se muestran editables por si se requiere corregir faltas de ortografía o formatos.
2. **Campos Administrativos Exclusivos:**
   - La Directora solo debe rellenar los campos que el padre no conoce: Selección del **Aula**, Asignación de la **Matrícula** (autogenerada en 1 clic), asignación del **Plan de Pago** y descuentos aplicables.
3. **Confirmación con Transacción Atómica:**
   - Al hacer clic en el botón inferior flotante **`[Aprobar Admisión y Matricular Estudiante]`**:
     - El registro en `student_preregistrations` cambia su estado de `pending` a `admitted`.
     - Se insertan en paralelo los datos en las tablas `students`, `profiles` (para el padre), y se crean los 12 registros de cuotas en `payments` asociados al plan de pago.
     - Se genera el código QR de acceso.
     - Se dispara el correo transaccional de bienvenida al padre con sus credenciales de acceso creadas automáticamente en Supabase Auth.
     - Se cierra el modal y la tabla de preinscripciones se actualiza en tiempo real mediante Supabase Realtime.

---

## 6. Modo Editar Estudiante (Exactamente la misma Interfaz)

* **Consistencia de UI:** Para evitar confusión cognitiva y reducir la curva de aprendizaje, el panel de edición de un alumno activo utiliza **exactamente la misma interfaz multitestaña de 7 pestañas**.
* **Precarga de Datos:** Se ejecuta una query de unión (join) para recopilar los datos del estudiante de las distintas tablas (`students`, `student_health`, `profiles`, `student_documents`, etc.) y rellenar las pestañas correspondientes al instante.
* **Persistencia Histórica:** Toda la información provista originalmente en la preinscripción del estudiante permanece guardada de forma inmutable en una pestaña de consulta histórica o dentro del Timeline del Historial.

---

## 7. Plan de Implementación Técnica en 5 Pasos

### Paso 1: Actualización de la Base de Datos
Crear e iniciar un script de migración SQL para añadir o reestructurar las tablas necesarias para las pestañas de Salud, Documentos e Historial de Auditoría en Supabase, garantizando que tengan habilitado **Row Level Security (RLS)**.

### Paso 2: Implementación de la Maqueta Visual (HTML/CSS)
Actualizar el diseño del modal de estudiantes en `panel_directora.html` y `panel_asistente.html` para incorporar el diseño multitestaña de 90% de pantalla con la cabecera fija, utilizando exclusivamente clases utilitarias de **Tailwind CSS** y un diseño limpio con bordes redondeados y tipografía Nunito.

### Paso 3: Lógica de Precarga y Transacción de Admisión
Escribir el controlador JS (`js/directora/inscripciones.module.js`) para capturar el clic de admisión, ejecutar la inserción transaccional de datos en las múltiples tablas utilizando `supabase.rpc()` o promesas en paralelo, y activar la llamada a la Edge Function de creación de usuario.

### Paso 4: Implementación del Mapeo de Edición
Actualizar el controlador de estudiantes (`js/directora/students.module.js`) para que al presionar "Ver Perfil" o "Editar" de un estudiante activo en la lista, se abra el mismo modal multitestaña y se rellene con sus datos en tiempo real mediante Supabase.

### Paso 5: Pruebas de Flujo Completo y Validación
Realizar una simulación de preinscripción en `preinscripcion.html`, verificar su visualización instantánea en el panel de la Directora, proceder con la admisión seleccionando aula y plan de pago, y constatar que el perfil se cree correctamente, el correo de bienvenida se envíe, y el estudiante pase a estar listado como activo de forma inmediata y sincronizada.

---
*Diseño conceptual y lógico por **Jules, Ingeniero de Software Senior**.*
