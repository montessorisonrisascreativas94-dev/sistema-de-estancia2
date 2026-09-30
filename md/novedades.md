Sí. Para tu sistema yo no lo plantearía como un simple banner decorativo. Lo convertiría en un **“Centro de Novedades Global”** que funcione en **Directora, Asistente, Encargada y Padres**, conectado con el **Muro Escolar, Chat, actividades, informaciones y notificaciones**.

La idea es que **ninguna información importante desaparezca porque el usuario no estaba conectado cuando se publicó**.

Puedes pasarle este prompt completo a Claude Code/Kiro:

# IMPLEMENTACIÓN: CENTRO GLOBAL DE NOVEDADES Y ALERTAS

## OBJETIVO PRINCIPAL

Quiero implementar en TODO el sistema un componente global llamado:

**"Centro de Novedades"**

Debe aparecer de forma consistente en todos los paneles:

* Directora
* Asistente
* Encargada
* Padres

El objetivo es que ningún usuario pierda información importante relacionada con:

* Muro Escolar
* Nuevas publicaciones
* Nuevos comentarios
* Respuestas a comentarios
* Nuevos mensajes del chat
* Actividades
* Avisos
* Comunicaciones
* Documentos
* Eventos
* Recordatorios
* Información administrativa
* Cambios importantes del sistema

NO quiero simplemente un banner visual.

Quiero un sistema persistente de novedades conectado a la base de datos, Realtime y al sistema de notificaciones existente.

---

# 1. REGLA PRINCIPAL

Si ocurre algo relevante para un usuario, debe aparecer en su Centro de Novedades aunque:

* no estuviera conectado;
* haya cerrado sesión;
* no haya visto el Muro Escolar;
* haya cambiado de panel;
* haya actualizado la página;
* haya cerrado el navegador;
* haya recibido la información mientras estaba ausente.

La información debe permanecer como:

**PENDIENTE DE LEER**

hasta que el usuario realmente acceda a ella o la marque como leída según la lógica definida.

---

# 2. NO ROMPER EL SISTEMA EXISTENTE

ANTES DE MODIFICAR CÓDIGO:

1. Analizar toda la arquitectura actual.
2. Identificar:

   * módulos existentes;
   * sistema de Muro Escolar;
   * sistema de Chat;
   * sistema de actividades;
   * sistema de notificaciones;
   * Supabase;
   * Realtime;
   * OneSignal;
   * Resend;
   * tablas existentes;
   * funciones RPC;
   * triggers;
   * RLS;
   * componentes compartidos.
3. Identificar qué ya existe para evitar duplicaciones.
4. No eliminar funciones existentes.
5. No reemplazar módulos funcionales sin necesidad.
6. No modificar RLS existente sin analizar sus dependencias.
7. Crear una implementación incremental.

Antes de escribir código, entregar un pequeño diagnóstico de:

* archivos afectados;
* tablas existentes;
* funciones existentes;
* eventos Realtime existentes;
* posibles conflictos;
* estrategia de integración.

---

# 3. COMPONENTE VISUAL GLOBAL

Crear un componente reutilizable:

`GlobalNewsBanner`

Debe poder ser utilizado desde:

* directora;
* asistente;
* encargada;
* padres.

Debe integrarse en el layout general de cada panel.

NO duplicar el código cuatro veces.

Debe existir un componente compartido.

Ejemplo conceptual:

```text
┌──────────────────────────────────────────────────────────┐
│ 🔔  NOVEDADES                                      3     │
│                                                          │
│  Nuevo aviso en el Muro Escolar                         │
│  Hace 5 minutos                                          │
│                                                          │
│  💬 Tienes un nuevo mensaje                              │
│  Hace 12 minutos                                         │
└──────────────────────────────────────────────────────────┘
```

---

# 4. ESTADO NORMAL

Cuando no existan novedades pendientes:

```text
🔔 Novedades
```

sin llamar demasiado la atención.

No debe ocupar demasiado espacio.

---

# 5. CUANDO EXISTAN NOVEDADES

Mostrar contador:

```text
🔔 Novedades 3
```

El contador debe representar:

**novedades NO LEÍDAS**

No debe representar simplemente el total de novedades existentes.

---

# 6. ANIMACIÓN

Cuando llegue una nueva novedad mientras el usuario está utilizando el sistema:

hacer una animación discreta:

```text
🔔 → pequeña vibración → contador actualizado
```

NO utilizar animaciones excesivas.

La experiencia debe sentirse:

* moderna;
* profesional;
* educativa;
* limpia;
* visual.

---

# 7. TIPOS DE NOVEDADES

Crear un sistema de tipos.

Ejemplos:

```text
wall_post
wall_comment
wall_reply

chat_message
chat_reply

activity
announcement
event
document
payment
administrative
system
```

Dejar la arquitectura preparada para agregar más tipos posteriormente.

---

# 8. EJEMPLO: NUEVA PUBLICACIÓN EN EL MURO

Si una maestra publica:

"Hoy realizamos una actividad de pintura."

Todos los usuarios que tengan permiso para ver esa publicación deben recibir:

```text
🔔 Nueva novedad

📰 Nueva publicación en el Muro Escolar

"Hoy realizamos una actividad de pintura."

Hace 2 minutos
```

Al hacer clic:

debe llevar directamente a:

**Muro Escolar → publicación específica**

NO simplemente abrir el Muro Escolar sin contexto.

Debe poder identificar:

```text
post_id
```

y desplazarse/resaltar la publicación correspondiente.

---

# 9. PUBLICACIONES DIRIGIDAS

MUY IMPORTANTE:

NO enviar todas las novedades a todos los usuarios.

La visibilidad debe respetar:

* rol;
* aula;
* grupo;
* permisos;
* relación padre/estudiante;
* año escolar;
* estado del usuario.

Ejemplo:

Una publicación de Kinder:

```text
Aula = Kinder
```

debe llegar solamente a:

* maestra correspondiente;
* asistente autorizada;
* padres vinculados a Kinder;
* directora/encargada con permisos.

No debe aparecerle a un padre de Pre-Kinder.

---

# 10. CHAT

Si un usuario recibe un mensaje nuevo:

```text
María Rodríguez
Hola, buenos días.
```

crear una novedad:

```text
💬 Nuevo mensaje

María Rodríguez te envió un mensaje.

Hace 1 minuto
```

Al hacer clic:

abrir directamente la conversación correspondiente.

Debe utilizar:

```text
conversation_id
message_id
```

cuando estén disponibles.

---

# 11. AGRUPAR MENSAJES

NO crear 10 novedades separadas si alguien envía 10 mensajes rápidamente.

Ejemplo:

```text
❌
María envió un mensaje
María envió un mensaje
María envió un mensaje
María envió un mensaje
```

Mejor:

```text
💬 María Rodríguez
Tienes 4 mensajes nuevos.

Hace 2 minutos
```

Esto evita saturar el Centro de Novedades.

---

# 12. COMENTARIOS

Si alguien comenta una publicación del usuario:

```text
💬 Nuevo comentario

Carlos comentó tu publicación.

"Excelente actividad."

Hace 5 minutos
```

Al tocar:

abrir la publicación y mostrar el comentario.

---

# 13. RESPUESTAS

Si alguien responde a un comentario:

```text
↩️ Nueva respuesta

María respondió a tu comentario.

"Gracias por participar."

```

Debe llevar directamente al comentario correspondiente.

---

# 14. ACTIVIDADES

Si se crea una actividad relevante:

```text
🎨 Nueva actividad

Se publicó una nueva actividad para Kinder.

Ver actividad →
```

Debe llevar directamente a:

```text
Actividad → actividad específica
```

---

# 15. AVISOS IMPORTANTES

Para información crítica:

```text
⚠️ Aviso importante

Mañana no habrá clases.

Ver información →
```

Debe tener prioridad visual sobre una novedad normal.

---

# 16. PRIORIDADES

Implementar niveles:

```text
normal
important
urgent
```

Ejemplo:

### NORMAL

🔵 Nueva publicación

### IMPORTANTE

🟠 Nuevo aviso

### URGENTE

🔴 Información importante para todos

NO utilizar rojo constantemente.

Debe reservarse para situaciones realmente importantes.

---

# 17. CENTRO DE NOVEDADES COMPLETO

Al hacer clic en:

```text
🔔 Novedades
```

abrir un panel/modal/drawer dependiendo del dispositivo.

Mostrar:

```text
┌─────────────────────────────────────┐
│ Novedades                      ✓    │
├─────────────────────────────────────┤
│                                     │
│ 📰 Nueva publicación                │
│ Muro Escolar                        │
│ Nueva actividad de pintura          │
│ Hace 5 min                          │
│                                     │
│ 💬 Nuevo mensaje                    │
│ María Rodríguez                     │
│ Hace 10 min                         │
│                                     │
│ 🎨 Nueva actividad                  │
│ Kinder                              │
│ Hace 30 min                         │
│                                     │
└─────────────────────────────────────┘
```

---

# 18. FILTROS

Permitir filtros:

```text
Todas
No leídas
Muro Escolar
Mensajes
Actividades
Avisos
```

En móvil utilizar botones/chips horizontales.

---

# 19. MARCAR COMO LEÍDA

Cada novedad debe poder tener:

```text
is_read
```

o equivalente según la arquitectura existente.

Estados:

```text
UNREAD
READ
```

Cuando el usuario abre la novedad:

```text
UNREAD
   ↓
READ
```

Actualizar inmediatamente el contador.

---

# 20. "MARCAR TODAS COMO LEÍDAS"

Agregar:

```text
✓ Marcar todas como leídas
```

Pero solamente cuando realmente tenga sentido.

No marcar automáticamente todo como leído simplemente porque el usuario abrió el panel.

El usuario debe abrir una novedad específica para que esa novedad se considere vista.

---

# 21. PERSISTENCIA

MUY IMPORTANTE:

NO depender únicamente de:

```text
localStorage
```

La información debe estar almacenada en Supabase.

Si el usuario:

```text
cierra sesión
↓
vuelve mañana
```

debe seguir viendo:

```text
🔔 Novedades 4
```

si todavía tiene 4 novedades pendientes.

---

# 22. TABLA RECOMENDADA

Antes de crear una tabla nueva, verificar si ya existe una tabla de notificaciones que pueda reutilizarse.

Si no existe una estructura adecuada, crear algo conceptualmente similar a:

```sql
notifications
```

Campos:

```text
id
user_id
actor_id
type
title
message
post_id
comment_id
conversation_id
message_id
activity_id
target_url
priority
is_read
created_at
read_at
metadata
```

No crear columnas innecesarias si la arquitectura actual ya maneja entidades relacionadas de otra manera.

---

# 23. METADATA

Utilizar metadata cuando sea útil:

```json
{
  "entity_type": "wall_post",
  "entity_id": "123",
  "classroom_id": "456"
}
```

Esto permitirá agregar nuevos tipos posteriormente sin modificar constantemente el esquema.

---

# 24. REALTIME

Integrar con Supabase Realtime.

Cuando se cree una nueva novedad:

```text
Supabase
   ↓
Realtime
   ↓
usuario conectado
   ↓
GlobalNewsBanner
   ↓
contador +1
```

La actualización debe ocurrir sin recargar la página.

---

# 25. USUARIO DESCONECTADO

Si el usuario no está conectado:

```text
evento
↓
guardar en Supabase
```

Cuando vuelva:

```text
login
↓
consultar novedades pendientes
↓
mostrar contador
```

---

# 26. ONE SIGNAL

Si OneSignal ya está integrado:

cuando corresponda:

```text
evento
↓
Supabase
↓
crear novedad
↓
OneSignal
```

Ejemplo:

```text
💬 Nuevo mensaje

María Rodríguez te envió un mensaje.
```

PERO:

Si el usuario ya está viendo esa conversación, evitar enviar una notificación push innecesaria.

---

# 27. EVITAR DUPLICADOS

Implementar protección contra duplicados.

Por ejemplo:

```text
event_key
```

o una combinación equivalente:

```text
user_id
type
entity_id
```

No generar:

```text
3 notificaciones iguales
```

por el mismo evento.

---

# 28. DISEÑO DESKTOP

En escritorio:

```text
┌──────────────────────────────────────────────┐
│ Logo     Inicio  Actividad  Chat     🔔 3 👤 │
└──────────────────────────────────────────────┘
```

El icono de novedades debe estar en una posición consistente en TODOS los paneles.

Al hacer clic:

```text
                         ┌────────────────────────┐
                         │ Novedades               │
                         │                         │
                         │ 📰 Nueva publicación    │
                         │ 💬 Nuevo mensaje        │
                         │ 🎨 Nueva actividad      │
                         │                         │
                         │ Ver todas →             │
                         └────────────────────────┘
```

Utilizar dropdown/popover en escritorio.

---

# 29. DISEÑO MÓVIL

En móvil:

```text
┌─────────────────────────────┐
│ ☰     Panel          🔔 3  │
├─────────────────────────────┤
│                             │
│ CONTENIDO                   │
│                             │
└─────────────────────────────┘
```

Al tocar:

```text
🔔
```

abrir un drawer/panel inferior o pantalla dedicada.

Debe ser cómodo para utilizar con una sola mano.

---

# 30. BANNER CONTEXTUAL

Además del icono global, quiero un banner contextual cuando llegue algo realmente nuevo.

Ejemplo:

```text
┌──────────────────────────────────────────┐
│ 🔔 Nueva información                     │
│                                          │
│ María publicó algo nuevo en el           │
│ Muro Escolar.                            │
│                                          │
│ Ver publicación →                  ×     │
└──────────────────────────────────────────┘
```

Este banner debe desaparecer visualmente después de unos segundos para no molestar.

PERO la novedad permanece guardada en:

```text
🔔 Novedades
```

Así nunca se pierde.

---

# 31. REGLA CLAVE DEL BANNER

El banner temporal NO es la fuente principal de información.

La fuente principal es:

```text
Centro de Novedades
```

Por lo tanto:

```text
EVENTO
 ↓
guardar
 ↓
contador
 ↓
banner temporal
 ↓
Realtime
 ↓
persistencia
```

Si el usuario no ve el banner:

NO importa.

La novedad sigue pendiente.

---

# 32. DIFERENCIAS POR ROL

## DIRECTORA

Mostrar:

* publicaciones;
* avisos;
* actividades;
* mensajes;
* información administrativa;
* eventos;
* novedades globales;
* novedades de aulas que tenga autorizadas.

## ASISTENTE

Mostrar únicamente información correspondiente a sus permisos.

## ENCARGADA

Mostrar información administrativa y operativa según sus permisos.

## PADRES

Mostrar principalmente:

* publicaciones del aula;
* actividades;
* avisos;
* mensajes;
* eventos;
* información relacionada con sus hijos;
* documentos dirigidos a ellos.

NO mostrar información interna de empleados.

---

# 33. SEGURIDAD

MUY IMPORTANTE.

Nunca resolver la seguridad únicamente en JavaScript.

El frontend NO debe decidir:

```javascript
if (role === 'padre')
```

y asumir que puede acceder.

Supabase RLS debe proteger:

```text
SELECT notifications
INSERT notifications
UPDATE notifications
```

y cualquier consulta relacionada.

Un padre nunca debe poder consultar manualmente mediante API las novedades de otro usuario.

---

# 34. PERFORMANCE

NO cargar todas las novedades históricas.

Cargar inicialmente:

```text
20
```

y permitir:

```text
Ver más
```

o paginación/cursor.

Para el contador:

consultar únicamente las no leídas.

Ejemplo conceptual:

```text
COUNT unread
```

No descargar todos los registros para contar en frontend.

---

# 35. CACHÉ

Si el proyecto ya tiene:

```text
QueryCache
```

o mecanismos similares:

utilizarlos.

NO crear otro sistema de caché innecesario.

Cuando llegue una novedad por Realtime:

* actualizar caché;
* actualizar UI;
* actualizar contador.

---

# 36. ACCESIBILIDAD

El componente debe funcionar:

* teclado;
* mouse;
* touch;
* lectores de pantalla.

Usar:

```text
aria-label
aria-live
role
```

cuando corresponda.

El contador no debe depender únicamente del color.

---

# 37. ESTADOS DEL COMPONENTE

Implementar:

```text
loading
empty
unread
read
error
offline
```

Ejemplo:

### Sin novedades

```text
🔔
Todo está al día
```

### Cargando

usar skeleton.

### Error

```text
No pudimos cargar tus novedades.
Reintentar
```

---

# 38. OFFLINE / PWA

Como el sistema es PWA:

considerar que el usuario puede perder temporalmente conexión.

No romper la interfaz.

Si está offline:

```text
Sin conexión
```

pero conservar la información previamente cargada.

Cuando vuelva conexión:

```text
sincronizar
```

---

# 39. EXPERIENCIA FINAL

La experiencia completa debe ser:

```text
MAESTRA PUBLICA EN MURO
          ↓
SUPABASE
          ↓
determinar usuarios autorizados
          ↓
crear novedades
          ↓
Realtime
          ↓
usuarios conectados
          ↓
🔔 +1
          ↓
banner temporal
          ↓
usuario entra al contenido
          ↓
novedad marcada como leída
```

Si el usuario NO estaba conectado:

```text
MAESTRA PUBLICA
       ↓
SUPABASE
       ↓
novedad guardada
       ↓
usuario entra al sistema mañana
       ↓
🔔 1
       ↓
abre novedad
       ↓
Muro Escolar → publicación
```

---

# 40. NO QUIERO UNA IMPLEMENTACIÓN SUPERFICIAL

No implementar solamente:

```html
<div>Hay novedades</div>
```

Quiero una arquitectura real.

Debe existir:

* persistencia;
* permisos;
* RLS;
* Realtime;
* contador;
* lectura/no lectura;
* navegación profunda;
* deduplicación;
* agrupación;
* integración con Muro Escolar;
* integración con Chat;
* integración con Actividades;
* integración con OneSignal;
* responsive;
* PWA;
* accesibilidad.

---

# 41. CRITERIO DE ÉXITO

La implementación se considera correcta solamente si:

### PRUEBA 1

Directora publica en Muro Escolar.

Padre conectado:

```text
🔔 +1
```

y recibe banner.

### PRUEBA 2

Padre está desconectado.

Directora publica.

Padre vuelve a entrar:

```text
🔔 1
```

### PRUEBA 3

Padre abre la novedad.

Debe llevarlo directamente a la publicación.

El contador disminuye:

```text
1 → 0
```

### PRUEBA 4

Maestra recibe mensaje.

Debe aparecer:

```text
💬 Nuevo mensaje
```

y abrir directamente la conversación.

### PRUEBA 5

Usuario recibe 5 mensajes seguidos.

No crear 5 banners simultáneos.

Agruparlos.

### PRUEBA 6

Un padre de Kinder no puede recibir información privada de Pre-Kinder.

### PRUEBA 7

Actualizar navegador.

Las novedades pendientes siguen existiendo.

### PRUEBA 8

Cerrar sesión y volver a entrar.

Las novedades no leídas siguen pendientes.

### PRUEBA 9

Probar:

* móvil;
* tablet;
* escritorio.

### PRUEBA 10

Probar:

* Directora;
* Asistente;
* Encargada;
* Padre.

---

# 42. ANTES DE TERMINAR

Realizar una auditoría final:

```text
[ ] No existen errores JS
[ ] No existen consultas duplicadas
[ ] No existen listeners Realtime duplicados
[ ] No existen suscripciones que se acumulen
[ ] No existen notificaciones duplicadas
[ ] RLS validado
[ ] Mobile validado
[ ] Desktop validado
[ ] PWA validada
[ ] Chat validado
[ ] Muro Escolar validado
[ ] Actividades validadas
[ ] OneSignal validado
[ ] Contador validado
[ ] Read/unread validado
```

Si encuentras un problema en una función existente:

NO eliminarla para solucionar el problema.

Investigar la causa y aplicar la modificación mínima necesaria.

---

# 43. ENTREGA FINAL

Al terminar, entregar un resumen técnico indicando:

1. Archivos modificados.
2. Archivos nuevos.
3. Tablas creadas/modificadas.
4. Migraciones SQL creadas.
5. Funciones/RPC creadas.
6. Políticas RLS creadas/modificadas.
7. Eventos Realtime utilizados.
8. Integración OneSignal.
9. Componentes UI creados.
10. Pruebas realizadas.
11. Problemas encontrados.
12. Posibles mejoras futuras.

NO asumir que algo funciona solamente porque el código compila.

Probar las interacciones reales.

# REGLA FINAL

Prioridad absoluta:

**NO ROMPER FUNCIONALIDADES EXISTENTES.**

Primero comprender el sistema actual.

Después integrar el Centro Global de Novedades como una capa transversal y reutilizable para todos los paneles.

### Una mejora que te recomiendo especialmente

No dejaría el sistema solamente como:

**🔔 Novedades**

Yo haría que en la cabecera de **cada panel** exista una pequeña zona consistente:

```text
┌────────────────────────────────────────────────────┐
│ 🏫 Sistema de Estancia       💬 2    🔔 4    👤   │
└────────────────────────────────────────────────────┘
```

Donde:

* **💬 2** = mensajes pendientes del chat.
* **🔔 4** = novedades pendientes.
* **👤** = perfil.

Y cuando llegue algo:

```text
                 🔔 4
                  ↓
       ┌─────────────────────┐
       │ 📰 Nueva publicación │
       │ Muro Escolar         │
       │ Hace 1 minuto        │
       │                      │
       │ Ver ahora →          │
       └─────────────────────┘
```

**Pero aunque ese banner desaparezca, 🔔 4 permanece.**

Esa es la parte que hará que tu sistema sea mucho más confiable para los padres: **la información no depende de que justo estuvieran mirando la pantalla en el momento en que se publicó.**

Si quieres que el prompt quede todavía más preciso para tu proyecto actual, una captura de **la cabecera de cada panel (Directora, Asistente, Encargada y Padres)** me permitiría plantear exactamente dónde colocar el banner sin romper tu diseño actual.
