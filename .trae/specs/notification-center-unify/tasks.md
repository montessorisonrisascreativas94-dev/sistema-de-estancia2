# Plan de Implementación: Centro de Notificaciones Unificado

## Mapeo Criterios de Aceptación → Tareas

| AC | Tareas |
|---|---|
| AC1 | Task 1 |
| AC2 | Tasks 2-8 |
| AC3 | Task 1 (COUNT/SELECT unify) + Task 9 |
| AC4 | Task 1 (SDK → PostgREST fallback en ambas tablas) |
| AC5 | Task 1 (open() await BD, no .then()) |
| AC6 | Task 8 (panel control) |
| AC7 | Task 1 (adaptadores globales) |
| AC8 | Task 10 |
| AC9 | Task 1 (único canal realtime) |

---

## Task 1: Crear módulo js/shared/notification-center.js

**Descripción**: Archivo único que centraliza BadgeSystem + UnreadMessages + NewsCenter.
Fuente única de verdad.

**Status**: pending
**Priority**: high
**Dependencias**: ninguna (primera tarea)

**Sub-pasos**:
1. Importar: `supabase, fetchPostgREST, escapeHtml, RealtimeManager getRestCredentials` desde módulos compartidos
2. State interno: `_userId, _role, _items, _msgUnread, _msgCounts, _channel, _counts, _filter, _opened`
3. Métodos públicos:
   - `init(userId, role)`: única entrada
   - `open()`: abrir modal + MARCAR LEÍDAS INMEDIATO (await supabase update) + NO refresh final
   - `close()`
   - `toggle()`
   - `refresh()`: cargar notificaciones (limit 200) + conteo messages unread
   - `getUnreadCount()` → `_notifUnread + _msgUnread`
   - `markAllRead()`
   - `markSectionRead(section)` (adaptador BadgeSystem)
4. **Fallbacks**:
   - `_fetchNotifications()`: SDK → falla → fetchPostgREST → fallback a caché último valor
   - `_fetchMsgCounts()`: RPC `get_unread_counts` → falla → SDK messages select → falla → fetchPostgREST
   - `_fetchNotifCount()`: SDK count exact → falla → fetchPostgREST count
5. **Un solo canal realtime** `notif-center_<uid>`: ESCUCHAR:
   - notifications INSERT/UPDATE (user_id eq uid)
   - messages INSERT/UPDATE
   - posts INSERT
   - tasks INSERT
   - task_evidences INSERT
   - payments INSERT/UPDATE
   - inquiries INSERT
   - meetings *
   - staff_permits INSERT
6. **Pintura DOM**: badge campana, badges sidebar, badges tarjetas, modal news-center (estilos CSS inline, mismo HTML que news-center.js)
7. **Adaptadores globales** compatibilidad hacia atrás:
   - `window.BadgeSystem` = {init, mark, setCount, destroy, _reapplyCardBadges}
   - `window.UnreadMessages` = {init, refresh, getTotal, getNotificationTotal, getCounts, onConversationRead, getUnreadFrom, destroy}
   - `window.NewsCenter` = {init, open, close, toggle, markAllRead, refresh}
   - `window._updateGlobalChatBadge = () => NotificationCenter._refreshMsg()`
8. Marcar leídas al abrir: `open()` → `const unreadIds = items.filter(!i.isRead).map(i=>i.id)`; items.forEach => isRead=true; render INMEDIATO; **await** UPDATE notifications; luego _syncBadges() sin refresh.
9. COUNT/SELECT unify: `_notifUnread` sale de `count:exact head:true` (no longitud array); `_items` array limit 200; al `markAllRead` → UPDATE con eq(user_id, uid).eq(is_read,false), no solo ids array.

**Test Requirements (TRs)**:
- **TR1 (rule)**: NotificationCenter.init('uid-x', 'directora') no throw. Revisar: `typeof NotificationCenter.init === 'function' && typeof NotificationCenter.open === 'function' && typeof NotificationCenter.getUnreadCount === 'function' && typeof NotificationCenter.markAllRead === 'function'`
- **TR2 (rule)**: Después de init, window.BadgeSystem / window.NewsCenter / window.UnreadMessages son truthy y .init existe.
- **TR3 (rule)**: `_fetchNotifications` llama a SDK; si mock rechaza fetchPostgREST; si ambos fallan, devuelve [] sin throw.
- **TR4 (rule)**: `open()`: isRead se actualiza en memoria ANTES de que la promesa de update se complete (UI optimista), y badge pasa a 0 inmediatamente.

**Completion Evidence**: 
- Archivo existe: `js/shared/notification-center.js`
- exports NotificationCenter
- Adaptadores globales definidos
- Fallback fetchPostgREST presentes en al menos 2 rutas de lectura

---

## Task 2: Integrar NotificationCenter en panel_directora.html → directora/main.js

**Status**: pending
**Priority**: high
**Depende de**: Task 1

**Cambios**:
- Eliminar imports directos `{ BadgeSystem } from '../shared/badges.js'` y `{ NewsCenter } from '../shared/news-center.js'`
- Añadir: `import { NotificationCenter } from '../shared/notification-center.js';`
- Reemplazar Bloque init (3 llamadas):
```
// Antes
BadgeSystem.init(auth.user.id);
NewsCenter.init(auth.user.id);
import('../shared/unread-messages.js').then(...UnreadMessages.init...)

// Ahora
NotificationCenter.init(auth.user.id, 'directora');
```
- No tocar nada más del resto del main.js (goToSection, navigation, etc.)

**Test Requirements (TRs)**:
- **TR1 (rule)**: grep por `BadgeSystem` / `NewsCenter` / `unread-messages.js` en directora/main.js devuelve SOLO los adaptadores si existen; los imports ya no existen.
- **TR2 (rule)**: Una sola llamada NotificationCenter.init(auth.user.id, 'directora') existe.

---

## Task 3: Integrar NotificationCenter en panel_asistente.html → asistente/main.js

**Status**: pending
**Priority**: high
**Depende de**: Task 1

**Cambios igual que Task 2, rol 'asistente'. Borrar BadgeSystem + NewsCenter + UnreadMessages imports → ÚNICO NotificationCenter.init(auth.user.id, 'asistente')

**Test Requirements**:
- TR1: imports eliminados
- TR2: 1 sola init con rol 'asistente'

---

## Task 4: Integrar NotificationCenter en panel-maestra.html → maestra/main.js

**Status**: pending
**Priority**: high
**Depende de**: Task 1

Rol 'maestra'. Mismos cambios.
Nota: conservar loadPendingTasksBadge (no pertenece al sistema unificado, es badge propio tareas pendientes del aula).

---

## Task 5: Integrar NotificationCenter en panel_encargada.html → encargada/main.js

**Status**: pending
**Priority**: high
**Depende de**: Task 1

Rol 'encargada'. Mismos cambios.

---

## Task 6: Integrar NotificationCenter en panel_padres.html → padre/main.js

**Status**: pending
**Priority**: high
**Depende de**: Task 1

Rol 'padre'. Mismos cambios.
Nota: conservar el segundo BadgeSystem.init tras selectChild (línea 1568) → reemplazar por NotificationCenter.init(auth.user.id, 'padre') si el hijo cambió (llamar init de nuevo es idempotente).

---

## Task 7: Integrar NotificationCenter en panel_control.html → control/main.js

**Status**: pending
**Priority**: high
**Depende de**: Task 1

Rol 'control'.
Cambios:
- Añadir import `NotificationCenter` desde `../shared/notification-center.js`
- Reemplazar bloque actual (líneas ~246-255):
```
// Antes
NewsCenter.init(currentUser.id);
import('../shared/unread-messages.js').then(...UnreadMessages.init...)

// Ahora
NotificationCenter.init(currentUser.id, 'control');
```
- No había BadgeSystem.init antes: ahora NotificationCenter lo suple automáticamente.

---

## Task 8: Verificar landing y login sin notificaciones (sin cambios)

**Status**: pending
**Priority**: low
**Depende de**: Task 1

Confirmar que index.html y login.html NO importan notification-center.js
(y no tienen campana). Es correcto porque son pre-autenticación.

**Test Requirements (rule)**: grep `notification-center` en index.html, login.html → 0 matches.

---

## Task 9: Validar desequilibrio COUNT / SELECT manual después de integrar

**Status**: pending
**Priority**: high
**Depende de**: Tasks 1-7

Pasos (simulación lógica, sin BD real):
- Mock insertar 150 notificaciones sin leer en BD
- `_fetchNotifCount()` devuelve count=150 via count:exact (sin limit)
- `_fetchNotifications()` devuelve array de 150 (limit 200, no 60)
- badge campana = 150 + msgUnread
- modal lista muestra 150 items
- markAllRead() hace UPDATE donde `user_id eq uid AND is_read eq false`: no usa array ids
- después markAllRead, badge 0, recarga count=0

**Test Requirements**:
- TR1 (rule): `_fetchNotifCount` usa `{ count:'exact', head:true }` sin .limit()
- TR2 (rule): `_fetchNotifications` usa `.limit(200)` NO `.limit(60)`
- TR3 (rule): markAllRead hace update con `.eq('user_id', uid).eq('is_read', false)`, no `.in('id', ids)`

---

## Task 10: Sintaxis + Diagnósticos (GetDiagnostics)

**Status**: pending
**Priority**: high
**Depende de**: Tasks 1-9

- Ejecutar GetDiagnostics en proyecto completo
- Ejecutar verificación sintaxis básica: node --check js/shared/notification-center.js + todos los main.js
- Confirmar cero imports huérfanos, variables sin uso
- Si hay algún error de sintaxis → corregir
- Si hay diagnostics → crear fix en la misma tarea.

**Test Requirements (rule)**:
- TR1: `node --check js/shared/notification-center.js` exit code 0
- TR2: GetDiagnostics para los archivos modificados (6 main.js + notification-center.js) devuelve 0 errores sintácticos / imports no resueltos de shared

---

## Task 11: Mantenimiento centralizado (no romper mejora del archivo mejoras.md)

**Status**: pending
**Priority**: medium
**Depende de**: Tasks 1-10

Verificación retrospectiva:
- Cualquier cambio en notificaciones (nuevos tipos, columnas) SE HACE en ÚNICO archivo (notification-center.js): TYPE_CONFIG, _typeToSection, etc.
- Antes: había que cambiar 3 archivos (badges.js, news-center.js, unread-messages.js)
- Ahora: 1 archivo (menos mantenimiento → cumple con mejora del line 111 de mejoras.md)

**Test Requirements (rubric, escala 0-2, umbral 2)**:
- 2: TYPE_CONFIG, _renderBadge, _paintBadge, _subscribeRealtime, _markReadInDB UBICADOS todos en notification-center.js (no duplicados en badges.js/news-center.js).
