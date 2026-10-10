# INFORME TÉCNICO Y ARQUITECTURA DEL CENTRO DE CONTROL (CONTROL CENTER)
**Colegio Montessori Sonrisas Creativas**
**Fecha:** 2025
**Documento de Arquitectura y Flujos de Operación**

---

## 1. RESUMEN EJECUTIVO Y ARQUITECTURA GENERAL

El **Centro de Control** (`panel_control.html` y `js/control/main.js`) constituye el núcleo de administración maestro, supervisión técnica, auditoría financiera y seguridad global del ERP del **Colegio Montessori Sonrisas Creativas**.

A diferencia de los paneles operativos por rol (Directora, Maestra, Encargada, Asistente, Padres), el **Centro de Control** opera como una consola de **Superusuario / Administrador (Admin)**, ofreciendo visibilidad completa de 360 grados sobre el estado del sistema, la integridad de la base de datos PostgreSQL/Supabase, las transacciones financieras, el flujo de admisiones, el monitoreo en tiempo real de asistencia y la detección de posibles fraudes o anomalías.

### Arquitectura de Software
* **Frontend Single Page Application (SPA):** Construido sobre HTML5, Tailwind CSS / Karpus Modern Design System y JavaScript ES Modules.
* **Controlador Principal:** `js/control/main.js` (aproximadamente 1,834 líneas de código estructurado y modular).
* **Motor de Base de Datos y Backend:** Supabase (PostgreSQL 15+) con Row Level Security (RLS) estricto.
* **Sincronización en Tiempo Real:** WebSocket mediante `supabase.channel()` para actualización reactiva de eventos y alertas.
* **Librerías de Soporte Clave:**
  * **Chart.js:** Gráficos estadísticos e indicadores visuales de tendencia.
  * **QRCode.js:** Generación instantánea de códigos QR para credenciales de personal administrativo.
  * **Html5Qrcode / Html5QrcodeScanner:** Motor de lectura y escáner de códigos QR utilizando la cámara del dispositivo para el registro de ponches de entrada y salida del personal.
  * **OneSignal SDK:** Notificaciones push de alerta administrativa.

---

## 2. CONTROL DE ACCESO, AUTENTICACIÓN Y SEGURIDAD

El acceso al Centro de Control está fuertemente blindado mediante un flujo de doble verificación antes de renderizar cualquier elemento sensible:

### Flujo de Verificación de Sesión y Rol (Guard):
1. **Verificación de Sesión Activa:** `supabase.auth.getSession()` valida la presencia de un JWT (JSON Web Token) válido.
2. **Validación de Perfil RLS (`profiles`):** Se realiza una consulta a la tabla `public.profiles` filtrando por el `user.id` autenticado.
3. **Verificación de Rol Administrador:** Se comprueba explícitamente que `profile.role === 'admin'`.
   * **Acceso Denegado:** Si el usuario no tiene una sesión activa o su rol no es `admin`, el sistema redirige automáticamente a `login.html`.
   * **Perfil Faltante (Self-Healing):** En caso de que el usuario tenga credenciales válidas pero carezca de registro en `profiles`, el sistema despliega una pantalla de recuperación con la instrucción SQL requerida para auto-corregir la cuenta en Supabase.

---

## 3. ESTRUCTURA Y NAVEGACIÓN DEL CENTRO DE CONTROL

La interfaz está dividida en un **Sidebar Lateral Fijo** con gradiente azul representativo de la marca (`#0B63C7` a `#063A80`) y una **Área Principal de Contenido Dinámico** (`#content`).

Navegación por la función `goTo(sectionId)`:
* Oculta todas las secciones con clase `.section`.
* Activa únicamente el contenedor objetivo (`#sec-[id]`).
* Actualiza la clase activa `.active` en los botones del sidebar.
* Ejecuta de manera diferida (lazy loading) la carga de datos de la sección seleccionada si no han sido precargados.

---

## 4. ANÁLISIS DETALLADO DE LAS 18 SECCIONES / MÓDULOS DEL CENTRO DE CONTROL

Below is the complete functional breakdown of each module available in the Control Center:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       CENTRO DE CONTROL (SUPERUSUARIO)                      │
├────────────────────────────────┬────────────────────────────────────────────┤
│ Módulo                         │ Función Principal                          │
├────────────────────────────────┼────────────────────────────────────────────┤
│ 1. Dashboard Principal         │ Visión general KPI, gráficos y emergencia  │
│ 2. Auditoría Global            │ Trazabilidad de logs de eventos y cambios  │
│ 3. Alertas de Fraude           │ Motor de detección de anomalías            │
│ 4. Gestión de Usuarios         │ Administración central de credenciales/roles│
│ 5. Directorio de Padres        │ Control de acudientes y sus vinculaciones  │
│ 6. Maestras y Asistentes       │ Control de personal docente y asignaciones │
│ 7. Directorio de Directoras    │ Control de cuentas directivas              │
│ 8. Preinscripciones            │ Canal de admisiones y solicitudes web      │
│ 9. Inscripciones Activas       │ Estudiantes matriculados por año escolar   │
│ 10. Cargos Financieros         │ Cuentas por cobrar y estados de cuenta     │
│ 11. Planes de Pago             │ Configuraciones tarifarias del colegio     │
│ 12. Años Escolares             │ Ciclos académicos y apertura/cierre        │
│ 13. Módulo de Pagos            │ Transacciones, recibos y auditoría de caja │
│ 14. Centro Escolar             │ Experiencias educativas y actividades      │
│ 15. Asistencia Global          │ Monitoreo de asistencias y ponches         │
│ 16. QR Administrativo          │ Credenciales QR, escáner y registro acceso │
│ 17. Errores del Sistema        │ Excepciones de código y depuración en vivo │
│ 18. Seguridad y Configuración  │ Ataques fuerza bruta, SMTP, reseteo clave  │
└────────────────────────────────┴────────────────────────────────────────────┘
```

---

### MÓDULO 1: DASHBOARD PRINCIPAL (`sec-dashboard`)
* **Propósito:** Ofrecer el resumen ejecutivo macro con métricas en tiempo real sobre la salud técnica, financiera y operativa del colegio.
* **Componentes Visuales & KPIs:**
  * **KPI Total Usuarios:** Conteo consolidado de perfiles registrados.
  * **KPI Ingresos del Mes (RD$):** Sumatoria de pagos confirmados en el mes actual.
  * **KPI Solicitudes de Preinscripción:** Badge dinámico con solicitudes pendientes.
  * **KPI Errores del Sistema:** Total de excepciones registradas sin resolver.
* **Gráficos Interactivos (Chart.js):**
  * *Distribución de Usuarios por Rol* (Doughnut Chart: Padres, Maestras, Directoras, Asistentes, Encargadas, Admin).
  * *Tendencia Financiera de Pagos* (Bar/Line Chart: Cobros vs. Pendientes).
* **Función de Emergencia Administrativa:**
  * **Botón `Ejecutar Ciclo de Emergencia` (`App.runEmergencyCycle()`):** Permite disparar de forma manual la Edge Function `auto-payment-cycle` para procesar cargos de mora (5%), vencimientos automáticos o alertas financieras sin esperar a la tarea programada Cron nocturna.

---

### MÓDULO 2: AUDITORÍA GLOBAL DEL SISTEMA (`sec-auditoria`)
* **Propósito:** Registro cronológico de todas las acciones críticas realizadas en la plataforma para asegurar la máxima transparencia.
* **Mecanismo Técnico:** Consulta la tabla `audit_logs` con orden descendente por `created_at`.
* **Funciones:**
  * **Filtrado Múltiple (`filterAudit()`):** Por término de búsqueda (usuario, acción, IP) y tipo de evento (`AUTH`, `PAYMENT`, `GRADE`, `SYSTEM`, `STUDENT`).
  * **Exportación de Datos (`exportAudit()`):** Generación y descarga directa en formato CSV comprimido del historial filtrado para análisis externo o entrega a auditores.

---

### MÓDULO 3: DETECCIÓN Y ALERTAS DE FRAUDE (`sec-fraude`)
* **Propósito:** Motor algorítmico automatizado que escanea la base de datos en busca de discrepancias o posibles comportamientos maliciosos.
* **Reglas de Detección (`detectFraud()`):**
  1. **Recibos de Pago Duplicados:** Alerta si un número de recibo o comprobante RNC/NCF se repite en transacciones de diferentes estudiantes o padres.
  2. **Inconsistencia de Balances:** Identifica cargos marcados como "PAGADO" cuyos registros en la pasarela o de caja no coinciden con el monto base.
  3. **Accesos Inusuales Múltiples:** Registra cuando una misma cuenta inicia sesión desde direcciones IP drásticamente distintas en ventanas de tiempo inferiores a 5 minutos.
  4. **Modificación de Calificaciones fuera de Horario:** Detecta cambios en notas registradas entre las 11:00 PM y las 5:00 AM.
* **Badges y Notificaciones:** Despliega un indicador en color naranja brillante en el menú lateral (`#badge-fraud`) con el conteo de alertas activas.

---

### MÓDULO 4: GESTIÓN GLOBAL DE USUARIOS (`sec-usuarios`)
* **Propósito:** Administración unificada de la totalidad de cuentas existentes en la plataforma.
* **Funciones Clave:**
  * **Búsqueda e Inspección Modal (`viewUser(id)`):** Muestra el perfil completo, fecha de registro, último acceso, correos vinculados y estado.
  * **Cambio Directo de Rol (`changeUserRole(userId, newRole)`):** Permite al Administrador promover o degradar roles en tiempo real (p. ej., convertir un usuario en `directora`, `maestra`, `asistente` o `admin`).
  * **Forzar Restablecimiento de Contraseña (`resetPassword()` / `doResetPassword()`):** Invoca la Edge Function `admin-reset-password` enviando un token de recuperación temporal o asignando una clave provisional generada de forma aleatoria (`generateRandomPassword()`).

---

### MÓDULOS 5, 6 Y 7: DIRECTORIOS ESPECIALIZADOS POR ROL
1. **Padres de Familia (`sec-padres`):**
   * Muestra la relación entre cada tutor/padre, sus correos de contacto, los hijos (estudiantes) asignados, su estado de pagos y la última fecha de conexión.
2. **Maestras y Asistentes (`sec-maestras`):**
   * Detalla la lista del cuerpo docente, el aula o sección asignada, su porcentaje de toma de asistencia en el aula y su estado actual.
3. **Directoras (`sec-directoras`):**
   * Muestra el personal directivo registrado, la sede/escuela bajo su gestión y sus accesos al sistema.

---

### MÓDULO 8: GESTIÓN DE PREINSCRIPCIONES (`sec-preinscripciones`)
* **Propósito:** Canal de revisión del flujo de admisiones de nuevos estudiantes ingresados desde el formulario público (`preinscripcion.html`).
* **Flujo Operativo:**
  * Muestra las solicitudes con estado `pendiente`, `en_revision`, `aprobada` o `rechazada`.
  * Permite inspeccionar los datos médicos, tutores, contactos de emergencia y documentos adjuntos.
  * Al aprobar una preinscripción, el estudiante se transfiere automáticamente a la tabla de estudiantes activos (`students`) mediante el RPC `submit_preregistration`.

---

### MÓDULO 9: GESTIÓN DE INSCRIPCIONES ACTIVAS (`sec-inscripciones`)
* **Propósito:** Control del estado de matriculación oficial de los alumnos dentro del año escolar en curso.
* **Funciones:**
  * Mapea estudiantes con sus aulas asignadas (Nivel Maternal, Caminadores, Párvulos, Preescolar, Kínder, Pre-Primario).
  * Verifica si el estudiante posee un plan de pago asignado (Único, Doble o Mensualidades) y si ha completado la cuota de inscripción inicial.

---

### MÓDULOS 10 Y 11: CONTROL FINANCIERO DE CARGOS Y PLANES DE PAGO
1. **Historial de Cargos (`sec-cargos`):**
   * **KPIs Financieros:** Pagados (Verde), Pendientes (Amarillo), Vencidos (Rojo) y Total RD$.
   * **Tabla de Transacciones:** Detalla cada concepto (Inscripción, Mensualidad, Reingreso, Materiales, Extracurricular), fecha de vencimiento y estado de mora (calculado al 5% mensual acumulado).
2. **Planes de Pago Activos (`sec-planes`):**
   * Visualización tipo tarjetas de las estructuras tarifarias vigentes en la institución.

---

### MÓDULO 12: GESTIÓN DE CICLOS Y AÑOS ESCOLARES (`sec-school-years`)
* **Propósito:** Administración de la vigencia temporal académica del colegio.
* **Funciones:**
  * Permite la creación de nuevos años escolares (ej. 2024-2025, 2025-2026).
  * Control del **Año Escolar Activo** (sincronizado con el componente global `SchoolYearGuard`).
  * Cierre e inactivación de ciclos académicos anteriores para garantizar que los registros históricos permanezcan de solo lectura.

---

### MÓDULO 13: MÓDULO GENERAL DE PAGOS (`sec-pagos`)
* **Propósito:** Monitoreo maestro de todos los cobros procesados por transferencia, tarjeta o efectivo a través de la Caja y el Panel de Padres.
* **Funciones:**
  * Auditoría de recibos de cobro y validación fiscal (NCF / RNC en coordinación con la DGII).
  * Estado de verificación de transferencias bancarias cargadas por los padres.

---

### MÓDULO 14: CENTRO ESCOLAR (`sec-centro-escolar`)
* **Propósito:** Integración con el módulo de Experiencias Educativas y Calendario Pedagógico (`#kscRoot`).
* **Funciones:**
  * Permite supervisar y publicar eventos del calendario escolar, excursiones, talleres y actividades transversales.

---

### MÓDULO 15: MONITOR DE ASISTENCIA GLOBAL (`sec-asistencia`)
* **Propósito:** Control unificado de asistencia diaria tanto para la matrícula estudiantil como para el personal docente y administrativo.
* **Mapeo:** Integra datos recibidos desde los ponches QR y las listas pasadas por las maestras en los paneles de aula.

---

### MÓDULO 16: MÓDULO QR ADMINISTRATIVO (`sec-qr-admin`)
* **Propósito:** Sistema integral de control de acceso físico e identificación del personal administrativo (Administradores, Directoras, Asistentes, Encargadas y Maestras).
* **Componentes Integrados:**
  1. **KPIs en Vivo:** Entradas Hoy, Salidas Hoy, Pendientes de Salida y Total Personal.
  2. **Generador de Credenciales QR (`generateAdminQR()`):**
     * Selecciona el rol (`admin`, `directora`, `asistente`, `encargada`, `maestra`).
     * Asigna o genera un código único de acceso (ej. `ADM-2025-8941`).
     * Renderiza el código QR mediante `QRCode.js` en nivel de corrección de errores Alto (Level H).
     * **Impresión de Carnet (`printAdminQR()`):** Abre una ventana emergente formateada tipo fotocheck / carnet institucional lista para imprimir.
     * **Guardado en Base de Datos (`saveAdminQRAccess()`):** Almacena el código en la tabla de credenciales autorizadas.
  3. **Escáner QR en Tiempo Real (`toggleAdminScanner()`):**
     * Utiliza la librería `Html5Qrcode` para activar la cámara web o del dispositivo móvil.
     * Lee y valida el código QR presentado por el colaborador.
     * **Procesamiento del Ponche (`processAdminQRScan()`):** Registra automáticamente la entrada o salida en la tabla `admin_qr_access_log`, guardando la hora exacta, el tipo de evento, la dirección IP y el dispositivo utilizado.
  4. **Log de Accesos Administrativos (`loadAdminAccessLog()`):** Tabla con buscador interactivo en vivo (`filterAdminAccess()`) para consultar todas las entradas y salidas registradas.

---

### MÓDULO 17: MONITOR DE ERRORES DEL SISTEMA (`sec-errores`)
* **Propósito:** Consola de depuración en vivo que captura cualquier excepción de JavaScript o fallo de comunicación con la base de datos reportado por los clientes.
* **Tabla de Errores:** Registra el panel de origen, el mensaje de error, la pila de llamadas (*stack trace*) y la estampa de tiempo.
* **Limpieza (`clearErrors()`):** Permite purgar la tabla de logs de errores una vez hayan sido solventados por el equipo de desarrollo.

---

### MÓDULO 18: SEGURIDAD Y CONFIGURACIÓN AVANZADA (`sec-seguridad` & `sec-configuracion`)
* **Propósito:** Consola de fortificación de la infraestructura.
* **Funciones:**
  * **Monitoreo de Ataques de Fuerza Bruta (`renderBruteForce()`):** Analiza intentos fallidos de inicio de sesión recurrentes bloqueando o reportando IPs sospechosas.
  * **Prueba de Pipeline de Correo (`testEmail()`):** Envía un correo electrónico de prueba utilizando la Edge Function de SMTP para comprobar la entrega de notificaciones.
  * **Edición del Perfil Administrador (`saveAdminProfile()`):** Actualiza el nombre, correo y preferencias del superusuario activo.

---

## 5. FLUJOS DE TRABAJO TÉCNICOS PASO A PASO (WORKFLOWS)

### Flujo 1: Inicio de Sesión y Carga del Centro de Control
```
[Usuario accede a panel_control.html]
         │
         ▼
[Verificación de JWT (Supabase Auth)]
  ├── Si NO hay sesión ──> Redirige a login.html
  └── Si hay sesión
         │
         ▼
[Consulta tabla 'profiles' por UUID]
  ├── Si rol != 'admin' ──> Redirige a login.html
  └── Si rol == 'admin'
         │
         ▼
[Inicia js/control/main.js]
  ├── Renderiza Sidebar y Topbar
  ├── Carga datos diferidos (Users, Audit, Payments, QR)
  └── Inicia Suscripción WebSocket Realtime
```

### Flujo 2: Generación e Impresión de Credencial QR de Personal
```
[Navegar a 'QR Administrativo']
         │
         ▼
[Seleccionar Rol y Código de Acceso] ──> Ej. "ADM-2025-4921"
         │
         ▼
[Clic en "Generar"] ──> Ejecuta new QRCode() con CorrectLevel.H
         │
         ├──────────────────────────────────────────────┐
         ▼                                              ▼
[Clic en "Guardar BD"]                        [Clic en "Imprimir Carnet"]
         │                                              │
         ▼                                              ▼
Invocación Supabase DB                       Ventana limpia HTML + CSS
Inserta en 'admin_qr_codes'                  Auto-impresión (window.print())
```

### Flujo 3: Escaneo y Ponche Físico de Colaborador
```
[Personal presenta Código QR ante la Cámara]
         │
         ▼
[Html5Qrcode detecta y decodifica el texto]
         │
         ▼
[Ejecuta processAdminQRScan(code)]
         │
         ▼
[Consulta 'admin_qr_access_log' para último registro del día]
  ├── Si no tiene entrada hoy ──> Registra tipo: "ENTRADA"
  └── Si ya tiene entrada ──────> Registra tipo: "SALIDA"
         │
         ▼
[Actualiza KPIs visuales + Notificación en Pantalla + Sonido de Confirmación]
```

---

## 6. RECOMENDACIONES TÉCNICAS Y DE MANTENIMIENTO

1. **Revisión Periódica de Audit Logs:** Se recomienda programar la descarga mensual del archivo CSV de auditoría para archivo histórico y mantenimiento del tamaño de la tabla `audit_logs`.
2. **Monitoreo de Alertas de Fraude:** Revisar diariamente el badge `#badge-fraud` para resolver inconsistencias o cobros no validados de manera inmediata.
3. **Mantenimiento de Certificados y Cámaras:** Para un funcionamiento óptimo del escáner de códigos QR en el Módulo QR Administrativo, asegurarse de que el navegador web cuente con permisos concedidos para el uso de la cámara bajo protocolo seguro HTTPS.
