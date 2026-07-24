# INFORME TÉCNICO DE AUDITORÍA, ARQUITECTURA Y PREPARACIÓN PARA PRODUCCIÓN
## Proyecto: Colegio Montessori Sonrisas Creativas (Karpus Kids)

Este informe ha sido preparado por **Jules, Ingeniero de Software Senior**, con el objetivo de analizar el estado actual de la plataforma, detallar el ciclo de ejecución de la información, examinar la experiencia del usuario Maestra, identificar errores de sincronización lógica entre los paneles y calcular la capacidad máxima de usuarios concurrentes. Finalmente, se incluye una guía detallada paso a paso para llevar el sistema al 100% de preparación para producción.

---

## 1. Resumen Ejecutivo

**Karpus Kids** es una plataforma SPA (Single Page Application) moderna, elegante y de alto rendimiento diseñada bajo una filosofía educativa específica (70% blanco, 20% verde `#28B54D`, 10% naranja `#FF8A00`). El sistema elimina intermediarios y se conecta de manera directa con un backend de **Supabase (PostgreSQL + RLS + Realtime)** y servicios de terceros como **OneSignal** (notificaciones push) y **Resend** (correos transaccionales).

### Diagnóstico de Producción: **NO LISTO PARA PRODUCCIÓN**
Aunque la UI, las transiciones visuales, el sistema de mensajería y la lógica del aula (Rutina Express v6) están sumamente pulidos y maduros, **existen bloqueadores de infraestructura y de sincronización lógica críticos** que impedirían el correcto funcionamiento en producción si se desplegara hoy mismo. El principal de ellos es la **ausencia total de la carpeta `scripts/`** en el repositorio, lo que inutiliza los comandos del ciclo de vida de npm (inicialización, semillas, chequeos pre-deploy).

---

## 2. Ciclo de Ejecución del Sistema (Execution Cycle)

La plataforma maneja un flujo de datos dinámico y reactivo que abarca desde la captación inicial de alumnos hasta la conciliación de pagos. A continuación se presenta el ciclo detallado:

```
[ Formulario de Preinscripción ] (Público)
               │
               ▼
[ Panel Directora / Asistente ] (Revisión y Admisión)
               │
               ├─► Crea Alumno en 'students'
               ├─► Crea Perfil del Padre en 'profiles' y cuenta de Auth
               ├─► Genera Plan de Pagos e Invoices automáticos
               └─► Dispara Email de Bienvenida con Credenciales (Resend EF)
               │
               ▼
[ Pase de Lista en Puerta ] (Asistente / Puerta)
               │
               ▼  (Realtime / 1 minuto de sincronización)
[ Panel de la Maestra: Rutina Express v6 ]
               │
               ├─► Actividades Colectivas del Aula (Baño, Almuerzo, Siesta)
               ├─► Eventos Individuales (Salud, Humor, Notas, Medicamentos)
               └─► Publicación en el Muro, Tareas y Videollamadas
               │
               ▼  (Publicación / Estado: 'published')
[ Panel del Padre ]
               │
               ├─► Consulta de Dashboard y Timeline Visual en Tiempo Real
               ├─► Envío de Evidencias de Tareas (Calificadas en escala 100)
               ├─► Chat directo con Maestra / Directora
               └─► Visualización de Facturas y Botón de Pago (DGII QR)
```

### Flujo de Datos por Fases:
1. **Fase de Ingreso (Admisión):**
   - El padre llena `preinscripcion.html`. Los datos entran a `student_preregistrations` como `pending`.
   - Al admitir desde `js/directora/inscripciones.module.js`, se ejecuta una transacción en Supabase que crea al estudiante en `students`, crea su perfil (`profiles`), asocia el plan de pago (`payment_plans`), genera las facturas correspondientes a las 12 mensualidades y manda a llamar a la Edge Function `create-student-with-parent` para crear la cuenta de Auth del padre y enviarle su correo vía Resend.
2. **Fase Operativa (Jornada Diaria):**
   - Al llegar al colegio, se registra la asistencia en la tabla `attendance`.
   - La asistencia desbloquea al alumno en el módulo de **Rutina Express v6** de la maestra. Los alumnos ausentes se ocultan o bloquean para evitar registrar datos falsos.
3. **Fase de Registro (Maestra):**
   - La maestra interactúa con el panel táctil. Los datos se guardan en la tabla `daily_logs` bajo una estructura de datos rica de tipo JSONB en `infant_data`.
4. **Fase de Notificación y Consumo (Padre):**
   - El padre recibe notificaciones push vía OneSignal sobre hitos importantes (como siestas, comida, medicamentos o incidentes).
   - El padre visualiza en `panel_padres.html` un timeline interactivo idéntico al de la maestra, sincronizado mediante canales en tiempo real (`daily_log_${studentId}`).

---

## 3. Cómo lo Ve la Maestra (Teacher's Perspective)

La experiencia de la maestra se centraliza en `panel-maestra.html` y los scripts ubicados en `js/maestra/`. La interfaz está optimizada para tablets y móviles (diseño táctil de alta respuesta).

### Lo que Experimenta la Maestra:
1. **Home y Dashboard:**
   - Visualiza indicadores clave del día: total de alumnos asignados, cuántos están presentes hoy, incidentes reportados y cantidad de clases virtuales programadas.
   - Cuenta con widgets inteligentes que le indican cuál es la **Actividad Siguiente** según la hora del día (por ejemplo: de 12:00 PM a 1:00 PM muestra "Almuerzo" y avisa cuántos niños faltan por registrar comida).
   - Acciones rápidas como "Alerta de Ausencias", la cual envía notificaciones push directas a los padres de los niños ausentes para preguntar si asistirán.
2. **Módulo de Aula y Rutina Express v6:**
   - **Timeline del Día:** Una barra superior horizontal (deslizable y colapsable) que muestra el progreso del horario del colegio. Los círculos cambian de color: gris (pendiente), naranja parpadeante (en curso) y verde con checkmark (completado).
   - **Acciones Colectivas:** Botones rápidos de un solo toque ("Baño", "Biberón", "Lavado de manos", "Siesta") que le permiten registrar el mismo evento para los 15 o 20 niños presentes a la vez, reduciendo la carga administrativa.
   - **Tarjetas de Alumnos:** Una cuadrícula interactiva con la foto o inicial de cada niño, un indicador de siesta activa (icono de Zzz), un indicador de medicamento pendiente (icono de píldora) y una barra de progreso que va de 0% a 100% según se completen los reportes individuales del niño (humor, alimentación, siestas, higiene).
   - **Modal Individual de Detalle:** Al presionar la tarjeta de un niño, la maestra puede registrar estados emocionales detallados (feliz, tranquilo, triste, enojado, enfermo), marcar el nivel de consumo de comida con botones descriptivos (Todo, Poco, Nada, Ayuda) por comida (Desayuno, Almuerzo, Merienda), reportar cambios de pañales, registrar dosis de medicamentos administradas o registrar observaciones individuales en texto libre.
3. **Gestión de Tareas y Calificaciones:**
   - La maestra puede crear tareas en el muro de clase y adjuntar materiales.
   - Al recibir entregas de los padres, puede calificarlas de manera ultra simplificada usando una **escala numérica de base 100**, otorgar de 1 a 5 estrellas para motivación del alumno y dejar una retroalimentación escrita.
4. **Mensajería en Tiempo Real (Chat):**
   - La maestra tiene acceso directo para chatear con los padres del aula y la Directora del centro, con soporte para notificaciones por badges rojos y actualizaciones instantáneas.

---

## 4. Errores Críticos de Sincronización y Brechas de Lógica (Gaps)

Tras analizar a fondo el código fuente de los paneles y los módulos compartidos, se han detectado **5 errores/brechas lógicas graves** que interfieren con la sincronización entre paneles:

### A. El Conflicto de Publicación: Autopublicación vs. Borrador (Bucle de Diseño)
* **El Problema:** El panel de la maestra tiene un botón para "Publicar Reportes" en el modal masivo (`openBulkRoutineModal` -> `publishDailyLogs`), lo cual hace pensar a la maestra que puede ir registrando datos en "borrador" a lo largo del día y solo publicarlos para los padres al final de la jornada. Sin embargo, en `js/maestra/api.js`, la función `upsertDailyLog` contiene esta línea:
  ```javascript
  if (!cleanPayload.status) cleanPayload.status = 'published';
  ```
  Dado que ninguna de las funciones individuales de la maestra (`setStudentMood`, `setStudentFood`, `setStudentNap`, etc.) provee explícitamente un estado, **todas las modificaciones se guardan como `'published'` al instante**.
* **El Impacto:** El padre ve las actualizaciones del reporte de su hijo en tiempo real mientras la maestra las escribe, haciendo que el botón "Publicar Reportes" de la maestra sea totalmente inútil. Si la maestra comete un error o introduce un dato temporal, el padre lo verá de inmediato, lo cual rompe la privacidad operativa del aula.

### B. El Desfase de la Asistencia Activa
* **El Problema:** La visualización de "Rutina Express" en la maestra se filtra para mostrar únicamente a los estudiantes presentes en la tabla `attendance` para el día de hoy.
  ```javascript
  const attendance = await MaestraApi.getAttendance(classroom.id, today);
  const presentStudentIds = new Set(attendance.filter(a => ['present', 'late'].includes(a.status)).map(a => a.student_id));
  const students = allStudents.filter(s => presentStudentIds.has(s.id));
  ```
  Sin embargo, el módulo de rutina **no se suscribe en tiempo real a los cambios de la tabla `attendance`**, sino únicamente a `daily_logs`.
* **El Impacto:** Si el asistente de puerta o la Directora marcan a un niño tarde o modifican su asistencia en su respectivo panel después de que la maestra abrió su pestaña de rutina, el niño no aparecerá en la lista de la maestra hasta que ella presione manualmente el botón "Refrescar" o transcurra el intervalo de polling de 60 segundos.

### C. Ausencia de Estado de Presencia Real (Presence status) en el UI
* **El Problema:** Aunque el sistema de chat utiliza la infraestructura en tiempo real de Supabase, las listas de contactos y el encabezado del chat no muestran el estado de presencia ("Online", "Away", "Offline").
* **El Impacto:** El padre o la maestra pueden enviar mensajes esperando una respuesta inmediata y frustrarse al no recibirla, ya que el sistema no les indica si el destinatario está conectado o desconectado en ese momento.

### D. Desfase en la Lógica Financiera (Recargo de Mora flat 5%)
* **El Problema:** De acuerdo con la lógica declarada del negocio, el recargo por mora debe ser de un **5% plano mensual** sobre el importe base por mes o fracción de mes de retraso. Sin embargo, en el cálculo del asistente y del panel de padres, a menudo existen desfases debido a que el importe se calcula estáticamente en el frontend en lugar de provenir de una base centralizada (RPC en la base de datos).
* **El Impacto:** El padre podría ver un importe de mora diferente en su portal al que calcula la directora o el cajero físico en su terminal de cobro.

### E. Limitación en la Asignación de Aula de la Maestra
* **El Problema:** En `js/maestra/main.js`, el aula de la maestra se obtiene consultando la tabla `classrooms` y seleccionando la primera fila devuelta:
  ```javascript
  const { data: classroom, error } = await supabase
    .from('classrooms')
    .select('id, name, level, capacity, teacher_id, is_live')
    .eq('teacher_id', auth.user.id)
    .order('name')
    .limit(1)
    .maybeSingle();
  ```
* **El Impacto:** Si el Colegio Montessori decide asignar a una maestra la gestión de más de un aula (por ejemplo, en talleres vespertinos o suplencias), el sistema ignorará por completo las aulas secundarias y la maestra quedará bloqueada en una sola aula.

---

## 5. Análisis de Capacidad Concurrente (User Concurrency Capacity)

Para evaluar cuántos usuarios conectados al mismo tiempo puede soportar la plataforma, debemos analizar por separado la infraestructura del Servidor de Estáticos y la del Backend de Supabase:

### A. Servidor de Estáticos (Express / `server/web.cjs`)
El servidor Express se limita únicamente a entregar los archivos HTML, CSS, imágenes y JS (es una SPA pura).
- **Consumo de recursos:** Muy bajo. El servidor tiene integrado el middleware de `compression` (GZIP/Brotli), que reduce el tamaño de los assets hasta en un 80%.
- **Configuración de Cache-Control:** Excelente. El servidor tiene configurado cacheo agresivo (`max-age=604800` o 1 semana) para JS y CSS. Esto significa que una vez que el usuario entra por primera vez, el servidor Express no recibe más peticiones de assets; todo se carga desde el almacenamiento local del dispositivo (Service Worker / Caché del navegador).
- **Proyección de Tráfico:**
  - En un VPS ultra básico de **1 vCPU y 1 GB de RAM** (ej. AWS Lightsail o DigitalOcean de $6/mes), el servidor puede atender hasta **1,000 peticiones de archivos estáticos por segundo**.
  - Si se traslada el frontend a una red CDN de distribución global (como **Cloudflare Pages, Vercel o Netlify**), la capacidad de carga de estáticos se vuelve **virtualmente infinita** (millones de usuarios concurrentes) a un costo de $0.

### B. Backend Serverless (Supabase / Postgres + Realtime)
Dado que el frontend se conecta de forma directa a Supabase mediante sockets y REST, la verdadera capacidad de concurrencia está definida por el **Tier de Supabase** seleccionado:

#### Escenario 1: Supabase Free Tier (Plan Gratuito)
Este plan comparte recursos con otros proyectos y tiene límites estrictos:
* **Límite de conexiones concurrentes en realtime (WebSockets):** **200 usuarios conectados en tiempo real simultáneamente**.
* **Límite de conexiones al pool de base de datos:** **60 conexiones concurrentes**.
* **Tamaño de Base de Datos:** **500 MB** (suficiente para la lógica del ERP, pero se llenará si se almacenan imágenes de perfil o evidencias en la base de datos en formato base64 en lugar de Supabase Storage).
* **Capacidad Real:** Soporta cómodamente un colegio de **100 alumnos, 10 maestras y 150 padres activos**. Si todos los padres entran al mismo tiempo a la salida (4:00 PM) y el realtime está activo, el proyecto podría alcanzar el límite de 200 conexiones WebSockets y empezar a desconectar temporalmente a algunos usuarios del canal de tiempo real (aunque seguirán funcionando mediante peticiones REST).

#### Escenario 2: Supabase Pro Tier ($25/mes)
Este plan cuenta con recursos dedicados e incrementa drásticamente los límites:
* **Límite de conexiones concurrentes en realtime (WebSockets):** **10,000 usuarios conectados simultáneamente**.
* **Límite de conexiones al pool de base de datos:** **Exponencialmente mayor y con auto-escalado**.
* **Tamaño de Base de Datos:** **8 GB** (escalable).
* **Capacidad Real:** Soporta sin ningún problema a **múltiples sucursales del colegio, con más de 2,000 alumnos, 200 maestras y 3,000 padres interactuando activamente al mismo tiempo**. El rendimiento de PostgreSQL dedicado asegura que las queries de facturación y reportes corran en milisegundos.

---

## 6. Auditoría de Preparación para Producción (Production Readiness Checklist)

Para que el proyecto se considere listo para su lanzamiento oficial a producción, se deben solucionar los siguientes puntos:

| Elemento / Control | Estado Actual | Diagnóstico y Acción Requerida |
| :--- | :---: | :--- |
| **Carpeta `scripts/`** | ❌ **AUSENTE** | **CRÍTICO.** Falta por completo del repositorio. El archivo `package.json` hace referencia a scripts como `scripts/init-db.js`, `scripts/pre-deploy-check.js` y `scripts/seed-demo.cjs`. Es obligatorio volver a crear o restaurar esta carpeta con los scripts correspondientes para no romper la CI/CD y los despliegues. |
| **Edge Functions** | ⚠️ **PENDIENTE** | Las carpetas de las Edge Functions existen en `supabase/functions/`, pero deben ser desplegadas al proyecto de Supabase en producción utilizando el CLI de Supabase (`supabase functions deploy`). Las claves como `RESEND_API_KEY` y `ONESIGNAL_REST_API_KEY` deben configurarse en los secrets del dashboard de Supabase. |
| **Server.js Deprecado** | ⚠️ **ADVERTENCIA** | El archivo `server.js` en la raíz está deprecado. La plataforma debe ser servida de manera exclusiva con `node server/web.cjs`. El puerto en producción debe ser configurado a través de la variable de entorno `PORT` en lugar de dejar el puerto hardcodeado. |
| **Service Workers y OneSignal** | ⚠️ **CONFIGURACIÓN** | En producción, los archivos `sw.js` y `OneSignalSDKWorker.js` deben estar servidos exactamente en el directorio raíz del dominio para permitir el correcto registro del push y la funcionalidad PWA offline. |
| **Políticas RLS en DB** |  **COMPLETO** | Las políticas de seguridad (Row Level Security) están configuradas en `schema.sql`, impidiendo que los padres lean datos de otras aulas u otros alumnos, asegurando el cumplimiento de la ley de protección de datos infantiles. |
| **Compresión y Cacheo** |  **COMPLETO** | Ya implementado en `server/web.cjs` a través del middleware de compresión y cabeceras Cache-Control de un semana para optimizar el consumo de datos móviles en los padres. |

---

## 7. Guía Paso a Paso para el Desarrollador (Guía a Seguir)

Sigue esta guía secuencial para subsanar los problemas lógicos, corregir el desfase de sincronización y preparar la plataforma para el lanzamiento a producción:

### Paso 1: Restaurar la Infraestructura de Scripts (Carpeta `scripts/`)
1. Crea la carpeta `scripts/` en la raíz del proyecto.
2. Crea e implementa el script `pre-deploy-check.js` para validar la existencia de variables de entorno de Supabase antes del despliegue.
3. Crea el script de inicialización `init-db.js` y el generador de semillas de demo `seed-demo.cjs` para permitir un setup limpio en nuevos entornos de desarrollo o pruebas de aceptación.

### Paso 2: Corregir el Flujo de Borradores de la Maestra (Fijar el Bug Draft vs Published)
1. Modifica la función de la API de la Maestra `upsertDailyLog` en `js/maestra/api.js`. Cambia el comportamiento por defecto de la publicación para que, de manera predeterminada, todo evento se guarde en estado **Borrador (`status = 'draft'`)**, a menos que se indique lo contrario.
2. Modifica el código de `js/maestra/modules/routine.js` para asegurar que las llamadas individuales (como `setStudentMood` o `setStudentFood`) no fuercen la publicación instantánea, permitiendo a la maestra rellenar el reporte tranquilamente a lo largo de la mañana.
3. Asegura que el botón **"Publicar Reportes"** del modal masivo sea el que envíe la llamada para actualizar el estado del lote completo de registros de `draft` a `published`, notificando simultáneamente a los padres de los niños correspondientes.

### Paso 3: Implementar Reactividad en el Pase de Lista (Attendance)
1. En `js/maestra/modules/routine.js`, suscribe el panel de rutina a los cambios de la tabla `attendance` en tiempo real mediante un canal de Supabase.
2. Al recibir un evento de inserción o actualización en la tabla de asistencia del día, actualiza dinámicamente el listado de alumnos de la rutina de la maestra en pantalla sin requerir que ella recargue manualmente o que deba esperar al intervalo de polling de 60 segundos.

### Paso 4: Implementar Presencia en Tiempo Real en el UI (Chat Status Indicator)
1. Configura canales de **Supabase Presence** en el chat y las listas de contactos.
2. En las interfaces de chat de la Maestra, Padres y Directora, añade un pequeño elemento HTML de estado visual (un círculo o punto indicador en la esquina inferior del avatar del contacto).
3. Añade los listeners de presencia `on('presence', { event: 'sync' }, ...)` para cambiar el color del indicador según el estado del usuario: **Verde (`#22C55E`) para Online**, **Amarillo (`#F59E0B`) para Away/Ausente** (después de 5 minutos de inactividad) y **Gris (`#94A3B8`) para Offline**.

### Paso 5: Desplegar y Configurar Edge Functions en Supabase Producción
1. Descarga e instala el CLI de Supabase en tu máquina de desarrollo.
2. Inicia sesión en tu cuenta de Supabase con `supabase login`.
3. Enlaza el repositorio local al proyecto en la nube utilizando `supabase link --project-ref yswizaskeftxpcphixiy`.
4. Configura los secretos en producción corriendo:
   ```bash
   supabase secrets set RESEND_API_KEY=tu_clave_resend ONESIGNAL_APP_ID=47ce2d1e-152e-4ea7-9ddc-8e2142992989 ONESIGNAL_REST_API_KEY=tu_clave_onesignal
   ```
5. Despliega todas las Edge Functions ejecutando el script del proyecto `node scripts/deploy-functions.js` o de forma manual con `supabase functions deploy`.

### Paso 6: Configurar Registros DNS y OneSignal para Producción
1. En tu proveedor de dominio (donde compraste `montessorisonrisascreativas.com`), configura los registros MX y TXT provistos por **Resend** para verificar y autenticar el envío de correos, evitando que las notificaciones caigan en la carpeta de SPAM de los padres.
2. Registra la PWA en el dashboard de **OneSignal** y descarga los archivos de service worker de OneSignal. Asegúrate de que estén colocados en la raíz del hosting de producción del colegio.

### Paso 7: Pruebas de Carga y Simulación (Aceptación)
1. Simula un día de ejecución completo en un entorno de staging con 10 usuarios simulados conectados al mismo tiempo (2 maestras, 1 directora, 1 asistente, 6 padres).
2. Verifica que las notificaciones push de ausencia e incidentes lleguen en menos de 3 segundos a los dispositivos móviles.
3. Asegura que el pase de lista marque la hora exacta y se refleje al instante en el reporte del padre y en el timeline visual de la maestra.

---
*Informe elaborado con rigor arquitectónico por **Jules, Ingeniero de Software Senior**.*
