# Especificación: Unificación del Centro de Notificaciones
Sistema Colegio Montessori Sonrisas Creativas

## Problema

El sistema de notificaciones (campana + badges) está fragmentado en 3 módulos
compartidos que se superponen y crean desequilibrios entre el badge numérico
y la lista de notificaciones mostrada. Cada panel inicializa los módulos de forma
inconsistente. Falta mecanismo de fallback ante fallos del SDK de Supabase.

### Problemas concretos detectados en auditoría:

1. **Desequilibrio COUNT vs SELECT** (badge numérico ≠ lista visible):
   - `UnreadMessages._fetchNotificationCount()`: `select('id', {count:'exact', head:true})` → cuenta TODAS las filas sin leer, sin límite
   - `NewsCenter.refresh()`: `.limit(60)` → solo carga 60 últimas notificaciones
   - `BadgeSystem._loadCounts()`: `.limit(200)` → solo cuenta 200 tipos
   - Resultado: Badge muestra "15" pero la lista solo muestra 60 items; al marcar "todas leídas" solo marca las 60 cargadas; las restantes quedan huérfanas en la BD

2. **Inicialización inconsistente por panel:
   | Panel | BadgeSystem | NewsCenter | UnreadMessages |
   |---|---|---|---|
   | landing (index.html) | ❌ (correcto: pre-auth) | ❌ | ❌ |
   | login.html | ❌ (correcto: pre-auth) | ❌ | ❌ |
   | directora | ✅ | ✅ | ✅ |
   | asistente | ✅ | ✅ | ✅ |
   | maestra | ✅ | ✅ | ✅ |
   | encargada | ✅ | ✅ | ✅ |
   | padre | ✅ | ✅ | ✅ |
   | control | ❌ FALTA | ✅ | ✅ |

3. **3 canales realtime duplicados** + 3 consultas BD independientes** para el
   mismo usuario (BadgeSystem, UnreadMessages, NewsCenter cada uno abre su
   propio canal y hace sus propias queries.

4. **Falta fallback fetchPostgREST**:
   - `badges.js` _loadCounts: sin fallback PostgREST
   - `news-center.js` refresh(): sin fallback PostgREST
   - solo `unread-messages.js` tiene fallback a consulta SDK pero NO a fetchPostgREST

5. **Limpieza badge al abrir (NewsCenter.open()):
   - Actualiza UI primero, luego UPDATE BD en `.then()` SIN await + refresh() al final → parpadeo posible

## Usuarios / Roles
- Directora, Asistente, Maestra, Encargada, Padre, Control (7 paneles post-auth)
- Landing y Login: sin notificaciones (correcto, pre-autenticación)

## Objetivos
✅ Unificar arquitectura: módulo `notification-center.js` como fuente única de verdad
✅ Eliminar desequilibrio COUNT/SELECT: badge = número que lista
✅ Añadir fallback `fetchPostgREST` en todas las consultas
✅ Marcar leídos INMEDIATAMENTE (BD optimista) al abrir la campana
✅ Inicialización consistente (incluyendo panel control)
✅ Compatible con 7 paneles (incl. control)

## No Objetivos
❌ Cambiar el esquema de base de datos (tablas notifications / messages
❌ Cambiar OneSignal / push notifications
❌ Landing y login (pre-auth)
❌ Mover tabla `notifications` a Supabase

## Requisitos Funcionales
### FR1: Módulo compartido notification-center.js
- Archivo: `js/shared/notification-center.js`
- Expone: `NotificationCenter` singleton`
- Responsabilidades ÚNICAS (centraliza todo):
  - Cargar notificaciones (`notifications` tabla)
  - Cargar mensajes sin leer (`messages` tabla + RPC `get_unread_counts`)
  - Pintar badge campana (#newsCenterBadge)
  - Pintar badges sidebar (badge-*`) y tarjetas (`badge-card-*`)
  - Abrir/cerrar modal Centro de Novedades
  - Suscripción Realtime (un solo canal
  - Marcar leídas
  - Fallback fetchPostgREST

### FR2: Desequilibrio COUNT vs SELECT corregido
- `getUnreadCount(): Promise<number>` → MISMA fuente para badge y para lista
- Si el usuario tiene > 60 notificaciones, cargar PRIMER 100 para badge total via `count:exact`
- Lista: cargar CON 200 items (no 60) + scroll virtual si >200)
- Marcar "todo leído" → UPDATE con el mismo filtro que COUNT (no solo ids cargados)

### FR3: Fallback fetchPostgREST
Toda lectura de BD sigue orden:
  1. Supabase SDK
  2. Si falla → fetchPostgREST
  3. Si falla → último valor conocido cacheado
- Nota: Retornar error silencioso, no romper UI

### FR4: Limpieza badge al abrir Centro de Novedades
- Al llamar `open()`:
  1. UI optimista: marcar todo como leído en memoria + pintar badge 0
  2. AWAIT `supabase.from('notifications').update({is_read:true})` INMEDIATAMENTE (no .then() final)
  3. No refrescar silenciosamente al cerrar
- NO hacer `this.refresh()` al final del open → evita parpadeo

### FR5: Inicialización consistente en 7 paneles
- Cada `BadgeSystem`, `UnreadMessages` NO se importan ni initian directamente desde main.js
- Solo se importa `{ NotificationCenter }`
- `NotificationCenter.init(userId, role)` ÚNICO LLAMADO por panel
- Incluye panel control: sí init)
- landing/login: sin cambios (sin notificaciones)

### FR6: Compatibilidad / Backwards
- `window.BadgeSystem`, `window.UnreadMessages`, `window.NewsCenter` siguen
  disponibles (adaptadores que delegan al nuevo NotificationCenter)
- Los handlers de `_updateGlobalChatBadge` siguen funcionando
- Navegación `goToSection` no rompe
- No romper DashboardCards

## Requisitos No Funcionales
### NFR1: Un solo canal Realtime por usuario
- `badges_<uid>`, `news-center_<uid>`, `unread_msgs_<uid>` consolidados en UN CANAL
- No sobrepasar MAX_CHANNELS
- No expiración por cambio de sección

### NFR2: Cero errores consola init
- Módulo se carga sin errores en los 7 paneles
- Silencia console.error de red fallida

### NFR3: Performance
- Primera carga < 500ms en red 3G
- Re-render al abrir <50ms
- Debounce en render tras evento realtime < 300ms

## Restricciones
- Todo ES modules
- No npm: vanilla JS

## Dependencias
- `js/shared/supabase.js` (supabase SDK + fetchPostgREST
- `js/shared/helpers.js` (escapeHtml)
- `js/shared/realtime-manager.js` (realtime)
- Tablas: `notifications`, `messages`, `meetings`, `tasks`, `payments`

## Supuestos
- fetchPostgREST ya existe y funciona como en supabase.js
- RealtimeManager.subscribe existe

## Criterios de Aceptación
### Tipo: rule
- AC1: `notification-center.js` existe y exporta `NotificationCenter` con init(), open(), close(), markAllRead(), getUnreadCount()
- AC2: En LOS paneles (directora, asistente, maestra, encargada, padre, control importan NotificationCenter ÚNICAMENTE; no más imports de badges.js ni news-center.js directamente en los main.js
- AC3: Badge numérico #newsCenterBadge coincide exactamente con el número de items no leídos de la base de datos al cargar la base; si >200 items se ve el count correcto y al marcar todas leídas se actualiza el badge a 0 en UNA sola operación
- AC4: fetchPostgREST es el 2º intento (SDK SDK falla: verifica con unitario unit unit falla
- AC5: Al hacer clic en campana: badge pasa a 0 INMEDIATAMENTE (sin parpadeo) y el UPDATE de BD se completa correcto; recargar página muestra 0 en el badge
- AC6: Panel control tiene badge chat, badge-alertas y #newsCenterBadge se actualizan correctamente
- AC7: window.BadgeSystem, window.UnreadMessages, window.NewsCenter son accesibles y delegan en NotificationCenter (no romper código legacy onclicks legacy siguen funcionando
- AC8: cero diagnostics JS en 7 paneles init
- AC9: Un solo canal realtime `notif-center_<uid>` por usuario (no hay + de badges_, no hay 3 canales)
