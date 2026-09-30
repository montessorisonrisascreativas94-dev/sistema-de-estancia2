Sí. Lo que quieres implementar realmente es un **sistema de video tipo Reels**, no simplemente “subir videos”. La regla de oro debe ser:

> **Cuando el usuario llegue al video, el primer frame visible ya debe estar preparado y el video debe comenzar a reproducirse prácticamente sin espera.**

Para tu sistema de estancia, además, hay que hacerlo pensando en **Supabase Storage + PWA + móviles + conexiones lentas**, porque cargar videos completos antes de reproducirlos sería justamente lo que queremos evitar.

Si tienes un video real que quieras usar para probar la portada, compártelo y podemos definir también cómo extraer automáticamente el mejor frame.

Mientras tanto, este es el **prompt maestro** que puedes pasarle a Claude Code/Kiro:

# IMPLEMENTACIÓN — SISTEMA DE VIDEOS TIPO REELS

## OBJETIVO

Quiero transformar el sistema actual de videos del Sistema de Estancia en una experiencia moderna inspirada en el patrón de consumo de videos cortos de Instagram Reels/TikTok.

NO quiero simplemente un reproductor de video.

Quiero implementar:

* portada automática mediante frame del video;
* carga inteligente;
* precarga del siguiente video;
* reproducción automática;
* pausa automática;
* reproducción únicamente cuando el video esté suficientemente visible;
* detención al pasar al siguiente video;
* reutilización del video ya cargado;
* adaptación a conexiones lentas;
* experiencia fluida en móvil, tablet y escritorio;
* evitar pantallas negras mientras carga;
* evitar que el usuario tenga que esperar para comenzar a ver un video.

La prioridad absoluta es:

**EL USUARIO NO DEBE TENER QUE ESPERAR PARA VER EL VIDEO.**

---

# 1. REGLA FUNDAMENTAL

Nunca hacer:

```text
usuario llega
↓
descargar video completo
↓
esperar
↓
mostrar video
```

Eso está PROHIBIDO.

La arquitectura debe permitir:

```text
usuario llega
↓
mostrar portada inmediatamente
↓
video comienza a preparar buffer
↓
cuando está listo para reproducirse
↓
reproducir
```

---

# 2. PORTADA AUTOMÁTICA

Cada video debe tener una portada generada automáticamente a partir del propio video.

NO quiero utilizar una imagen genérica.

El sistema debe seleccionar un frame representativo del video.

Ejemplo:

```text
VIDEO
00:00 ─────────────── 00:30

       ↓

seleccionar frame

       ↓

thumbnail/poster.jpg
```

La portada debe almacenarse para no tener que volver a procesar el video cada vez que un usuario lo vea.

---

# 3. FRAME INTELIGENTE

No seleccionar siempre el frame 0.

El primer frame puede ser:

* negro;
* transición;
* pantalla vacía;
* desenfoque;
* intro.

Utilizar una estrategia inteligente.

Por ejemplo:

```text
10% del video
20%
30%
40%
50%
```

analizar frames candidatos y seleccionar uno razonablemente representativo.

Si la infraestructura actual no permite análisis visual automático, utilizar inicialmente:

```text
frame ≈ 15%-25%
```

como fallback.

La arquitectura debe permitir mejorar posteriormente el algoritmo.

---

# 4. FORMATO DE LA PORTADA

Cada video debe tener:

```text
poster_url
```

asociado.

Ejemplo conceptual:

```json
{
  "video_url": "...",
  "poster_url": "...",
  "duration": 24,
  "width": 1080,
  "height": 1920
}
```

NO generar la portada en cada carga.

Generarla una sola vez al procesar/subir el video.

---

# 5. EXPERIENCIA VISUAL

Cuando el usuario todavía no está viendo el video:

```text
┌────────────────────────────┐
│                            │
│        PORTADA             │
│                            │
│             ▶              │
│                            │
└────────────────────────────┘
```

Cuando comienza:

```text
┌────────────────────────────┐
│                            │
│          VIDEO             │
│                            │
│                            │
│                            │
│                            │
└────────────────────────────┘
```

Evitar pantalla negra durante la transición.

---

# 6. REPRODUCCIÓN AUTOMÁTICA

Cuando el video entre suficientemente en pantalla:

```text
video visible
↓
autoplay
↓
muted inicialmente si el navegador lo requiere
↓
play()
```

NO asumir que todos los navegadores permiten autoplay con audio.

Los navegadores suelen bloquear autoplay con sonido si no existe interacción previa del usuario.

Por eso la implementación debe respetar las políticas del navegador.

---

# 7. AUDIO

Quiero que el sistema pueda activar el audio cuando corresponda.

Experiencia:

```text
Usuario entra al contenido
        ↓
video visible
        ↓
reproducción
        ↓
audio según política del navegador
```

Agregar control:

```text
🔇
```

y:

```text
🔊
```

El usuario debe poder activar/desactivar sonido.

MUY IMPORTANTE:

Si el navegador bloquea autoplay con audio:

```text
NO romper reproducción.
```

Reproducir inicialmente muted y mostrar:

```text
🔊 Activar sonido
```

---

# 8. MEMORIA DEL AUDIO

Si el usuario activa sonido:

```text
🔇 → 🔊
```

guardar la preferencia localmente:

```text
videoSoundPreference
```

Así los siguientes videos pueden respetar la preferencia del usuario cuando el navegador lo permita.

No almacenar información sensible.

---

# 9. INTERSECTION OBSERVER

Utilizar:

```javascript
IntersectionObserver
```

para detectar qué video está visible.

No utilizar:

```javascript
setInterval()
```

para revisar constantemente la posición del video.

---

# 10. REGLA DE VISIBILIDAD

Un video debe comenzar a reproducirse cuando esté suficientemente visible.

Por ejemplo:

```text
threshold ≈ 0.6
```

Es decir:

aproximadamente 60% del video visible.

Cuando deje de estar suficientemente visible:

```text
pause()
```

---

# 11. SOLO UN VIDEO REPRODUCIÉNDOSE

Esta regla es OBLIGATORIA.

Nunca permitir:

```text
video 1 ▶
video 2 ▶
video 3 ▶
```

simultáneamente.

Siempre:

```text
video 1 ▶

video 2 ⏸
video 3 ⏸
```

Cuando el usuario pasa al siguiente:

```text
video 1
↓
pause

video 2
↓
play
```

---

# 12. REINICIO / CONTINUIDAD

Cuando un usuario vuelve al video anterior, decidir según experiencia.

Por defecto:

```text
mantener currentTime
```

si el componente sigue montado.

Esto permite:

```text
video 1 → segundo 12
↓
video 2
↓
video 1
↓
continuar cerca del segundo 12
```

No reiniciar innecesariamente.

---

# 13. PRECARGA INTELIGENTE

La regla más importante después del autoplay:

### Video actual

Debe tener máxima prioridad.

### Siguiente video

Debe comenzar a precargarse.

### Video anterior

Puede mantenerse parcialmente disponible.

### Videos lejanos

NO cargar inmediatamente.

Ejemplo:

```text
                PRIORIDAD

Video actual      ██████████
Siguiente         ████████
Anterior          ████
+2                ██
+3                ░
+4                ░
```

---

# 14. NO PRECARGAR TODA LA LISTA

PROHIBIDO:

```text
10 videos
↓
precargar 10 videos completos
```

Eso desperdicia:

* datos;
* memoria;
* batería;
* almacenamiento temporal;
* ancho de banda.

Utilizar una ventana pequeña.

Por ejemplo:

```text
current
current + 1
current - 1
```

y solamente bajo condiciones adecuadas:

```text
current + 2
```

---

# 15. CONEXIÓN LENTA

Detectar condiciones de red cuando sea posible:

```javascript
navigator.connection
```

o equivalente.

Si la conexión parece lenta:

```text
2G
slow-2g
```

reducir precarga.

Ejemplo:

```text
Conexión rápida:
actual + siguiente + siguiente

Conexión lenta:
actual + siguiente
```

---

# 16. DATOS MÓVILES

NO quiero consumir datos innecesariamente.

La precarga debe ser inteligente.

En conexión móvil:

```text
prioridad = video actual
```

y:

```text
siguiente video = precarga limitada
```

No descargar varios videos completos por adelantado.

---

# 17. PRELOAD

No utilizar:

```html
preload="auto"
```

para todos los videos de una página larga.

Utilizar estrategias dinámicas.

Por ejemplo:

```html
preload="metadata"
```

para videos que todavía están lejos.

Y cambiar dinámicamente el comportamiento del video cercano.

---

# 18. BUFFER

La reproducción debe comenzar cuando exista suficiente información para evitar una espera inmediata.

No esperar necesariamente a descargar el video completo.

Conceptualmente:

```text
metadata
↓
poster
↓
buffer inicial
↓
play
↓
stream/download continúa
```

---

# 19. NO ESPERAR AL VIDEO COMPLETO

Esto es fundamental.

El sistema debe funcionar como streaming/progressive download.

El usuario NO debe tener que esperar:

```text
100%
```

para empezar.

Debe poder empezar con una cantidad razonable de datos disponible.

---

# 20. FORMATO DE VIDEO

Analizar los formatos actuales.

Priorizar un formato ampliamente soportado y eficiente.

Recomendación inicial:

```text
MP4
H.264
AAC
```

Pero dejar arquitectura preparada para:

```text
WebM
AV1
VP9
```

si posteriormente se decide optimizar.

---

# 21. COMPRESIÓN

No almacenar videos gigantes sin procesar.

Al subir:

```text
VIDEO ORIGINAL
       ↓
PROCESAMIENTO
       ↓
VIDEO OPTIMIZADO
       ↓
POSTER
       ↓
METADATA
```

Guardar:

```text
duration
width
height
mime_type
file_size
poster_url
```

---

# 22. VIDEO VERTICAL

Para videos tipo Reel:

preferir:

```text
9:16
```

Ejemplo:

```text
1080 × 1920
```

En móvil:

```text
┌───────────────┐
│               │
│               │
│     VIDEO     │
│               │
│               │
└───────────────┘
```

Utilizar:

```css
object-fit: cover;
```

cuando el diseño lo requiera.

---

# 23. VIDEO HORIZONTAL

No romper videos horizontales.

Detectar:

```text
aspect ratio
```

y adaptar.

Ejemplo:

```text
9:16
16:9
1:1
4:5
```

La portada debe utilizar el mismo aspecto visual que el video.

---

# 24. EXPERIENCIA TIPO FEED

Si existe una lista de videos:

```text
Video 1
↓
Video 2
↓
Video 3
↓
Video 4
```

el usuario puede desplazarse verticalmente.

Cuando pasa:

```text
Video 1
      ↓
Video 2
```

hacer:

```text
Video 1 → pause()
Video 2 → play()
```

---

# 25. MOBILE REELS

En móvil quiero una experiencia:

```text
┌────────────────────────────┐
│                            │
│                            │
│           VIDEO            │
│                            │
│                            │
│                     ❤️     │
│                     💬     │
│                     🔗     │
│                     🔊     │
│                            │
│ 👤 Maestra                 │
│ Actividad de hoy...        │
└────────────────────────────┘
```

Pero NO agregar controles innecesarios.

El video debe ser el protagonista.

---

# 26. DESKTOP

En escritorio no forzar una pantalla vertical gigante.

Utilizar un contenedor adecuado:

```text
┌──────────────────────┐
│                      │
│        VIDEO         │
│                      │
│                      │
└──────────────────────┘
```

y permitir navegar entre videos.

El diseño debe aprovechar el espacio disponible sin deformar el video.

---

# 27. POSTER + SKELETON

Mientras el video prepara:

NO mostrar:

```text
pantalla negra
```

Mostrar:

```text
POSTER
```

y opcionalmente un indicador discreto:

```text
◌
```

La portada debe permanecer visible hasta que el video esté listo para mostrarse.

---

# 28. TRANSICIÓN

Cuando el video esté listo:

```text
poster
↓
video
```

hacer una transición muy corta.

NO utilizar una animación pesada.

La transición debe ser prácticamente imperceptible.

---

# 29. ERROR DE VIDEO

Si falla:

```text
poster
↓
error
```

mostrar:

```text
No pudimos reproducir este video.

↻ Reintentar
```

No mostrar un reproductor vacío.

---

# 30. BOTÓN PLAY

Si autoplay no es posible:

mostrar sobre la portada:

```text
▶
```

El usuario toca:

```text
▶
```

y entonces:

```text
play()
```

---

# 31. PAUSA POR VISIBILIDAD

Ejemplo:

```text
Video 1 visible 80%
↓
PLAY

usuario hace scroll
↓
Video 1 visible 30%
↓
PAUSE
```

El video no debe continuar reproduciéndose fuera de pantalla.

---

# 32. PREPARAR SIGUIENTE VIDEO

Cuando:

```text
Video actual
```

esté cerca de terminar o el siguiente ya esté próximo a aparecer:

```text
preparar siguiente
```

Ejemplo:

```text
Video actual
████████████████░░░░

Siguiente
████░░░░░░░░░░░░░░░░
```

La idea es que cuando el usuario llegue al siguiente:

```text
NO ESPERE
```

---

# 33. SMART PREFETCH

No hacer prefetch agresivo.

Condiciones recomendadas:

```text
si conexión buena
AND
siguiente video está cerca
AND
memoria disponible
AND
usuario está interactuando con el feed
THEN
precargar siguiente
```

Si no:

```text
no precargar agresivamente
```

---

# 34. CACHE

Utilizar correctamente:

* navegador;
* Cache API;
* Service Worker;
* CDN;
* headers de caché.

Pero NO almacenar indiscriminadamente videos grandes en Cache API.

La estrategia debe considerar tamaño del video.

---

# 35. SUPABASE STORAGE

Analizar cómo están almacenándose actualmente los videos.

NO asumir que simplemente cambiar el frontend solucionará la velocidad.

Revisar:

```text
bucket
paths
cache-control
CDN
URLs
signed URLs
public URLs
```

Si los videos son públicos y no contienen información privada:

evaluar URLs públicas + caché apropiada.

Si son privados:

utilizar URLs firmadas de duración adecuada.

NO exponer contenido privado.

---

# 36. CACHE-CONTROL

Para assets estáticos/versionados:

utilizar headers apropiados.

Ejemplo conceptual:

```text
Cache-Control:
public, max-age=...
```

Pero definir el valor según la estrategia real de almacenamiento.

NO poner valores arbitrarios sin analizar las consecuencias.

---

# 37. SEGURIDAD

Los videos de padres/niños pueden ser contenido sensible.

NO asumir que todos los videos deben ser públicos.

Respetar:

* usuario;
* rol;
* aula;
* año escolar;
* permisos;
* relación con estudiante.

Un padre no debe poder obtener una URL de un video al que no tiene acceso.

---

# 38. SUBIDA DEL VIDEO

Al subir:

```text
Seleccionar video
       ↓
validar formato
       ↓
validar tamaño
       ↓
mostrar preview
       ↓
subir
       ↓
procesar metadata
       ↓
generar poster
       ↓
optimizar
       ↓
guardar referencias
       ↓
publicar
```

NO publicar el video antes de que esté correctamente procesado si eso provocaría que otros usuarios vean un recurso incompleto.

---

# 39. PROGRESO DE SUBIDA

Mostrar:

```text
Subiendo video...

████████████░░░░░ 72%
```

No confundir:

```text
upload progress
```

con:

```text
video processing
```

Mostrar ambos estados si el procesamiento tarda.

Ejemplo:

```text
✓ Video subido
◌ Preparando reproducción...
```

---

# 40. PROCESAMIENTO ASÍNCRONO

Si el procesamiento requiere tiempo:

```text
UPLOAD
 ↓
PROCESSING
 ↓
POSTER_GENERATED
 ↓
READY
```

El usuario no debe quedarse bloqueado esperando en una pantalla.

---

# 41. ESTADOS DEL VIDEO

Utilizar estados conceptuales:

```text
uploading
processing
ready
failed
```

Solo:

```text
ready
```

debe entrar al feed como video completamente disponible.

---

# 42. TABLA DE MEDIA

Antes de crear una tabla nueva, revisar las existentes.

Si ya existe una tabla multimedia adecuada, reutilizarla.

Si no existe, la estructura podría contener:

```text
id
owner_id
storage_path
poster_path
mime_type
duration
width
height
file_size
processing_status
created_at
```

No duplicar estructuras existentes.

---

# 43. COMPONENTE REUTILIZABLE

Crear:

```text
SmartVideo
```

o nombre equivalente.

Responsabilidades:

```text
poster
autoplay
pause
intersection observer
mute
playback
error
prefetch
loading state
```

NO duplicar esta lógica en cada módulo.

---

# 44. VIDEO MANAGER

Crear si la arquitectura lo necesita:

```text
VideoPlaybackManager
```

Responsable de garantizar:

```text
solo un video reproduciéndose
```

Ejemplo conceptual:

```javascript
activeVideo = currentVideo
```

Cuando cambia:

```javascript
previous.pause()
current.play()
```

---

# 45. NO CREAR LISTENERS DUPLICADOS

MUY IMPORTANTE.

Si el componente se monta y desmonta:

no acumular:

```text
IntersectionObserver
event listeners
Realtime listeners
```

Cada componente debe limpiar correctamente:

```javascript
disconnect()
removeEventListener()
```

cuando corresponda.

---

# 46. MEMORIA

No mantener 100 elementos `<video>` activos simultáneamente.

Para feeds largos:

utilizar:

* lazy loading;
* virtualización si es necesario;
* desmontaje de videos lejanos;
* reutilización de elementos.

---

# 47. VIDEOS LEJANOS

Si el video está muy lejos:

```text
poster solamente
```

No crear un reproductor completamente activo.

Cuando se acerque:

```text
poster
↓
preparar video
```

---

# 48. EXPERIENCIA DE SCROLL

El usuario debe poder:

```text
scroll
↓
video cambia
↓
nuevo video reproduce
↓
siguiente se prepara
```

sin:

```text
spinner de varios segundos
```

---

# 49. MÉTRICAS

Registrar únicamente métricas útiles.

Por ejemplo:

```text
video_view
video_started
video_completed
watch_time
```

No enviar un evento por cada segundo.

Para `watch_time` utilizar intervalos razonables.

---

# 50. COMPLETION

Considerar video completado cuando:

```text
watch_percentage >= 90%
```

o según la métrica definida.

No depender únicamente del evento `ended`.

---

# 51. ANALYTICS

Poder obtener posteriormente:

```text
views
unique viewers
average watch time
completion rate
```

Esto puede servir para que la directora conozca qué contenidos realmente están viendo los padres.

---

# 52. PWA

La implementación debe funcionar correctamente como PWA.

Probar:

* Android Chrome;
* iPhone Safari;
* escritorio;
* tablet.

No asumir que el comportamiento de autoplay es idéntico entre navegadores.

---

# 53. iOS

Prestar especial atención a:

```html
playsinline
```

y:

```html
muted
```

cuando sea necesario para autoplay.

El video no debe abrir automáticamente en pantalla completa en móvil.

---

# 54. ATRIBUTOS BASE

La implementación debe considerar:

```html
<video
  playsinline
  preload="metadata"
  poster="..."
>
</video>
```

Los valores pueden cambiar dinámicamente según el estado de proximidad y conexión.

---

# 55. REDUCIR ESPERA PERCIBIDA

Aunque el video todavía esté preparando buffer:

el usuario debe ver inmediatamente:

```text
POSTER
```

Esto elimina la sensación de:

```text
"la aplicación está cargando"
```

La experiencia debe ser:

```text
POSTER
→
VIDEO
```

en lugar de:

```text
NEGRO
→
SPINNER
→
VIDEO
```

---

# 56. REGLA DE ORO DEL FEED

Implementar esta prioridad:

```text
1. Video visible
2. Siguiente video
3. Video anterior
4. Videos cercanos
5. Videos lejanos
```

Nunca invertir esta prioridad.

---

# 57. TESTS OBLIGATORIOS

Probar:

### TEST 1

Abrir feed.

Resultado:

```text
poster aparece inmediatamente
```

### TEST 2

Video visible.

Resultado:

```text
autoplay
```

### TEST 3

Pasar al siguiente.

Resultado:

```text
anterior = pause
siguiente = play
```

### TEST 4

Tres videos visibles parcialmente.

Resultado:

```text
solo uno reproduce
```

### TEST 5

Conexión lenta.

Resultado:

```text
no bloquear UI
poster permanece visible
```

### TEST 6

Video falla.

Resultado:

```text
reintentar
```

### TEST 7

Autoplay con audio bloqueado.

Resultado:

```text
video reproduce muted
```

y permite activar sonido.

### TEST 8

iPhone.

Validar:

```text
playsinline
autoplay
mute
pause
scroll
```

### TEST 9

Android.

Validar:

```text
autoplay
scroll
prefetch
```

### TEST 10

Desktop.

Validar:

```text
layout
autoplay
pause
audio
```

### TEST 11

Feed con 50 videos.

Resultado:

```text
NO cargar 50 videos simultáneamente.
```

### TEST 12

Cambiar rápidamente entre videos.

Resultado:

```text
no múltiples reproducciones
no audio duplicado
no listeners duplicados
```

---

# 58. AUDITORÍA FINAL

Antes de terminar:

```text
[ ] Poster automático
[ ] Poster persistente
[ ] Metadata
[ ] Lazy loading
[ ] Smart prefetch
[ ] IntersectionObserver
[ ] Autoplay
[ ] playsinline
[ ] Muted fallback
[ ] Control de sonido
[ ] Pausa al salir
[ ] Un solo video reproduciendo
[ ] Siguiente video preparado
[ ] Conexión lenta
[ ] PWA
[ ] iOS
[ ] Android
[ ] Desktop
[ ] Supabase Storage
[ ] Seguridad/RLS
[ ] Cache
[ ] Error handling
[ ] Upload progress
[ ] Processing state
[ ] Analytics
[ ] Limpieza de listeners
[ ] No memory leaks
```

# 59. REGLA FINAL

No quiero que la implementación simplemente:

**"reproduzca videos".**

Quiero que el usuario tenga la sensación de:

**"deslizo y el siguiente video ya está ahí".**

La arquitectura debe priorizar:

**POSTER INMEDIATO → VIDEO PREPARADO → AUTOPLAY → SIGUIENTE VIDEO PRE-CARGADO → PAUSA AUTOMÁTICA → CONTINUAR**

sin descargar innecesariamente videos lejanos.

ANTES de modificar archivos:

analizar el sistema actual y explicar qué componentes de video, Storage, PWA, Service Worker, Supabase y módulos existentes ya están implementados.

No reemplazar funcionalidades existentes sin necesidad.

No eliminar código funcional.

Aplicar cambios incrementales.

Al finalizar entregar:

1. archivos modificados;
2. archivos nuevos;
3. cambios de base de datos;
4. cambios de Storage;
5. cambios de frontend;
6. estrategia de precarga;
7. estrategia de posters;
8. estrategia de autoplay;
9. pruebas realizadas;
10. problemas encontrados;
11. mejoras futuras.

### La arquitectura que quiero que persigas

En tu caso, el flujo ideal sería:

```text
                  SUBIR VIDEO
                       │
                       ▼
              ┌─────────────────┐
              │    SUPABASE     │
              │     STORAGE     │
              └────────┬────────┘
                       │
              ┌────────┴─────────┐
              ▼                  ▼
           VIDEO              POSTER
              │                  │
              └────────┬─────────┘
                       ▼
                  BASE DE DATOS
                       │
                       ▼
                 ┌───────────┐
                 │   FEED    │
                 └─────┬─────┘
                       │
             ┌─────────┼──────────┐
             ▼         ▼          ▼
          VIDEO 1    VIDEO 2    VIDEO 3
             │
          REPRODUCE
             │
             ├──────────► PREPARA VIDEO 2
             │
             ▼
          SCROLL
             │
             ▼
          PAUSA 1
             │
             ▼
          PLAY 2
             │
             └──────────► PREPARA VIDEO 3
```

**Una corrección importante respecto a tu idea de “activar el audio al estar cerca”**: técnicamente no conviene prometer que el navegador permitirá **autoplay con sonido** solo porque el video está cerca. Chrome, Safari y otros navegadores pueden bloquearlo. La implementación correcta es **autoplay muted + activar sonido cuando el navegador/usuario lo permita**, con un botón de sonido claro. Así no sacrificamos la reproducción inmediata.

Y para tu sistema de estancia, yo agregaría una regla adicional: **los videos no deben empezar a reproducirse simplemente porque están en una lista cualquiera**. Deben entrar en reproducción automática únicamente en el contexto de un **feed de videos**, mientras que una foto/video dentro de una publicación del Muro Escolar puede utilizar autoplay al entrar en viewport pero sin convertir todo el muro en un “Reels”. Esto evita que una página con 10 publicaciones empiece a reproducir 10 videos.
