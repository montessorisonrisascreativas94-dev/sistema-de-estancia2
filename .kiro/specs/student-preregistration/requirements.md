# Documento de Requisitos

## Introducción

Sistema de pre-registro de estudiantes para el Colegio Montessori Sonrisas Creativas. Permite a los padres/tutores enviar una solicitud de inscripción a través de un formulario público (o de acceso controlado), y a la Directora revisar, completar y activar cada solicitud mediante un flujo de validación exclusivo desde su panel. El sistema integra autenticación Supabase, notificaciones y gestión financiera dentro del stack existente (HTML/CSS/JS vanilla + Tailwind + Supabase).

---

## Glosario

- **Sistema**: El sistema de pre-registro de estudiantes del Colegio Montessori Sonrisas Creativas.
- **Formulario_PreRegistro**: Página web (pública o de acceso controlado) donde el padre/tutor ingresa los datos básicos del estudiante.
- **Padre**: Usuario externo (padre o tutor legal) que llena el formulario de pre-registro.
- **Directora**: Usuario autenticado con rol `directora` en Supabase que gestiona y activa los pre-registros.
- **Solicitud**: Registro de estudiante creado con `is_active = false` y `registration_status = 'pending'`.
- **Estudiante_Pendiente**: Fila en la tabla `students` cuyo `registration_status = 'pending'` e `is_active = false`.
- **Matrícula**: Código único alfanumérico asignado por la Directora que identifica al estudiante de forma permanente.
- **Panel_Directora**: Interfaz `panel_directora.html` con módulo `StudentsModule` accesible a la Directora.
- **Panel_Padres**: Interfaz `panel_padres.html` accesible al padre una vez activada su cuenta.
- **Correo_Bienvenida**: Mensaje de correo electrónico enviado al padre con credenciales de acceso tras la activación.
- **RLS**: Row Level Security de Supabase que controla el acceso a filas por rol de usuario.

---

## Requisitos

### Requisito 1: Formulario de Pre-registro

**Historia de usuario:** Como padre/tutor, quiero completar un formulario de pre-registro con los datos básicos de mi hijo, para que la Directora pueda revisar la solicitud y proceder con la inscripción formal.

#### Criterios de aceptación

1. THE Formulario_PreRegistro SHALL requerir los siguientes campos obligatorios: nombre completo del estudiante, fecha de nacimiento, nombre del tutor principal (`p1_name`), teléfono del tutor principal (`p1_phone`) y correo electrónico del tutor (`p1_email`).
2. THE Formulario_PreRegistro SHALL ofrecer los siguientes campos opcionales: tipo de sangre (`blood_type`), alergias (`allergies`), nombre y teléfono de persona autorizada para retiro (`authorized_pickup`, `authorized_pickup_phone`), datos del segundo tutor (`p2_name`, `p2_phone`), y archivos adjuntos de documentación.
3. WHEN el Padre envía el formulario con todos los campos obligatorios válidos, THE Sistema SHALL crear un registro en la tabla `students` con `is_active = false` y `registration_status = 'pending'`.
4. WHEN el Padre envía el formulario con campos obligatorios faltantes o con formato inválido, THE Formulario_PreRegistro SHALL mostrar mensajes de error descriptivos junto a cada campo inválido sin enviar el formulario.
5. IF el correo electrónico del tutor ingresado ya existe en la tabla `profiles`, THEN THE Sistema SHALL asociar la solicitud al `parent_id` existente en lugar de crear un duplicado.
6. WHEN el registro de la Solicitud se crea exitosamente, THE Formulario_PreRegistro SHALL mostrar un mensaje de confirmación indicando que la solicitud fue recibida y que la Directora se comunicará pronto.
7. THE Formulario_PreRegistro SHALL ser accesible sin autenticación mediante una URL pública o un token de acceso controlado definido en la configuración del sistema.

---

### Requisito 2: Notificación a la Directora

**Historia de usuario:** Como Directora, quiero recibir una notificación visible cuando llegue una nueva solicitud de pre-registro, para no perder ninguna solicitud pendiente de revisión.

#### Criterios de aceptación

1. WHEN se crea un nuevo Estudiante_Pendiente, THE Sistema SHALL insertar una notificación en la tabla `notifications` dirigida a todos los usuarios con rol `directora`.
2. WHILE existan Solicitudes con `registration_status = 'pending'`, THE Panel_Directora SHALL mostrar un indicador de conteo en el ítem de navegación "Estudiantes" del sidebar.
3. WHEN la Directora accede a la sección "Estudiantes" del Panel_Directora, THE Panel_Directora SHALL mostrar una pestaña o sección diferenciada llamada "Solicitudes Pendientes" con la lista de Estudiantes_Pendientes.
4. THE Panel_Directora SHALL mostrar para cada Solicitud en la lista: nombre del estudiante, fecha de nacimiento, nombre del tutor, correo del tutor y fecha de envío de la solicitud.

---

### Requisito 3: Revisión de Solicitud por la Directora

**Historia de usuario:** Como Directora, quiero revisar los datos ingresados por el padre en una vista de detalle, para verificar la información antes de activar al estudiante.

#### Criterios de aceptación

1. WHEN la Directora selecciona una Solicitud de la lista de pendientes, THE Panel_Directora SHALL abrir un modal de detalle con todos los campos ingresados por el Padre.
2. WHILE el modal de revisión está abierto, THE Panel_Directora SHALL mostrar los campos ingresados por el Padre como de solo lectura (bloqueados para edición).
3. THE Panel_Directora SHALL mostrar dentro del modal los controles exclusivos de activación: campo de Matrícula, campos de credenciales (`email` y contraseña temporal), campo `monthly_fee`, campo `due_day`, y botón "Activar Estudiante".
4. WHERE la Directora activa la generación automática de matrícula, THE Sistema SHALL generar un código único siguiendo el patrón existente `generateMatricula()` del `StudentsModule`.

---

### Requisito 4: Asignación de Matrícula

**Historia de usuario:** Como Directora, quiero asignar un código de matrícula único al estudiante aprobado, para identificarlo de forma permanente en el sistema.

#### Criterios de aceptación

1. WHEN la Directora ingresa o genera una matrícula en el modal de activación, THE Sistema SHALL verificar que el valor no exista en el índice único `idx_students_matricula` de la tabla `students`.
2. IF la matrícula ingresada ya existe en la tabla `students`, THEN THE Panel_Directora SHALL mostrar un mensaje de error indicando que la matrícula ya está en uso y requerir un valor diferente.
3. WHEN se activa el estudiante exitosamente, THE Sistema SHALL guardar la matrícula asignada en el campo `matricula` del registro del estudiante.

---

### Requisito 5: Creación de Acceso del Padre

**Historia de usuario:** Como Directora, quiero crear las credenciales de acceso del padre usando Supabase Auth, para que pueda ingresar al Panel_Padres con usuario y contraseña temporal.

#### Criterios de aceptación

1. WHEN la Directora ingresa un email y contraseña temporal en el modal de activación y confirma la activación, THE Sistema SHALL invocar `supabase.auth.signUp` con los datos del tutor usando un cliente temporal sin persistencia de sesión.
2. IF el email del tutor ya está registrado en `auth.users`, THEN THE Sistema SHALL buscar el `parent_id` existente en la tabla `profiles` y vincularlo al estudiante sin crear una cuenta duplicada.
3. WHEN la cuenta del padre se crea o se vincula exitosamente, THE Sistema SHALL insertar o actualizar un registro en `profiles` con `role = 'padre'`, `name = p1_name`, `email` y `phone = p1_phone`.
4. IF la creación de la cuenta del padre falla por un error distinto a "usuario ya registrado", THEN THE Panel_Directora SHALL mostrar el mensaje de error original de Supabase Auth y no proceder con la activación.

---

### Requisito 6: Definición Financiera

**Historia de usuario:** Como Directora, quiero definir la cuota mensual y el día de pago del estudiante durante la activación, para que el módulo de pagos funcione correctamente desde el primer mes.

#### Criterios de aceptación

1. THE Panel_Directora SHALL requerir que los campos `monthly_fee` y `due_day` sean completados antes de permitir la activación del Estudiante_Pendiente.
2. IF `monthly_fee` es menor o igual a cero o no es un número válido, THEN THE Panel_Directora SHALL mostrar un mensaje de validación y bloquear el botón "Activar Estudiante".
3. IF `due_day` está fuera del rango 1–31 o no es un entero válido, THEN THE Panel_Directora SHALL mostrar un mensaje de validación y bloquear el botón "Activar Estudiante".
4. WHEN el estudiante es activado, THE Sistema SHALL guardar los valores de `monthly_fee` y `due_day` en el registro del estudiante en la tabla `students`.

---

### Requisito 7: Activación del Estudiante

**Historia de usuario:** Como Directora, quiero activar la solicitud de un estudiante pendiente tras completar todos los campos requeridos, para que el estudiante quede registrado como alumno activo en el sistema.

#### Criterios de aceptación

1. WHEN la Directora confirma la activación con todos los campos obligatorios completados, THE Sistema SHALL actualizar el registro del estudiante estableciendo `is_active = true` y `registration_status = 'confirmed'` en la tabla `students`.
2. WHEN el estudiante es activado, THE Sistema SHALL asignar el `parent_id` del tutor al campo correspondiente del registro del estudiante.
3. WHEN el estudiante es activado, THE Sistema SHALL invalidar el caché `dir_students` del `QueryCache` y recargar la lista de estudiantes en el Panel_Directora.
4. WHEN el estudiante es activado, THE Sistema SHALL registrar la acción en la tabla `audit_logs` con el `user_id` de la Directora, la acción `'student_activated'` y el `id` del estudiante en el payload.
5. IF alguno de los pasos de activación falla (guardado en DB o creación de Auth), THEN THE Sistema SHALL revertir los cambios parciales y mostrar un mensaje de error descriptivo en el Panel_Directora sin dejar el registro en un estado inconsistente.

---

### Requisito 8: Correo de Bienvenida

**Historia de usuario:** Como Directora, quiero que el sistema envíe un correo de bienvenida al padre con sus credenciales de acceso tras la activación, para que el padre pueda ingresar al Panel_Padres inmediatamente.

#### Criterios de aceptación

1. WHEN el estudiante es activado exitosamente, THE Sistema SHALL invocar una Supabase Edge Function o servicio de correo para enviar un correo al `p1_email` del padre.
2. THE Correo_Bienvenida SHALL incluir: nombre del colegio, nombre del estudiante activado, matrícula asignada, email de acceso, contraseña temporal, y URL del Panel_Padres.
3. IF el envío del correo falla, THEN THE Sistema SHALL registrar el error en `audit_logs` con la acción `'welcome_email_failed'` y mostrar una advertencia no bloqueante en el Panel_Directora indicando que el correo no pudo enviarse, sin revertir la activación ya completada.

---

### Requisito 9: Seguridad y Control de Acceso (RLS)

**Historia de usuario:** Como administrador del sistema, quiero que las reglas de seguridad de la base de datos controlen el acceso a las solicitudes de pre-registro, para evitar que padres no autorizados vean o modifiquen datos de otros estudiantes.

#### Criterios de aceptación

1. THE Sistema SHALL aplicar una política RLS en la tabla `students` que permita a usuarios no autenticados (o con token de formulario) insertar únicamente registros con `registration_status = 'pending'` e `is_active = false`.
2. THE Sistema SHALL aplicar una política RLS en la tabla `students` que permita únicamente a usuarios con `role = 'directora'` actualizar los campos `is_active`, `registration_status`, `matricula`, `monthly_fee`, `due_day` y `parent_id`.
3. WHILE un Estudiante_Pendiente tiene `is_active = false`, THE Sistema SHALL impedir que el padre asociado acceda a la sección de datos del estudiante en el Panel_Padres hasta que `is_active = true`.
4. THE Sistema SHALL añadir el nuevo campo `registration_status` con tipo `text` y constraint `CHECK (registration_status IN ('pending', 'confirmed', 'rejected'))` a la tabla `students` mediante una migración SQL idempotente.

---

### Requisito 10: Rechazo de Solicitud

**Historia de usuario:** Como Directora, quiero poder rechazar una solicitud de pre-registro con un motivo, para informar al padre que la inscripción no puede proceder y mantener el historial limpio.

#### Criterios de aceptación

1. WHEN la Directora selecciona la acción "Rechazar" en el modal de una Solicitud pendiente, THE Panel_Directora SHALL solicitar confirmación y un campo de texto con el motivo del rechazo antes de proceder.
2. WHEN la Directora confirma el rechazo con un motivo válido (mínimo 10 caracteres), THE Sistema SHALL actualizar el registro estableciendo `registration_status = 'rejected'` e `is_active = false` en la tabla `students`.
3. WHEN se rechaza una Solicitud, THE Sistema SHALL registrar la acción en `audit_logs` con la acción `'student_rejected'`, el `id` del estudiante y el motivo en el payload.
4. WHEN se rechaza una Solicitud, THE Sistema SHALL retirar la Solicitud de la lista de pendientes en el Panel_Directora.
