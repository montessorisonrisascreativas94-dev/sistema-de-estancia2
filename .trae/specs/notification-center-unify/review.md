# Review History: Centro de Notificaciones Unificado

## Review 1 — 2026-10-09 (agente independiente)

**Veredicto inicial**: 8/10 PASS con 2 fallos críticos (P0) + 2 menores (P1/P2).
**Estado tras remediación**: ✅ **ALL PASSED** (10/10).

### Checkpoints con evidencias de remediación

| CP | Antes review | Fix aplicado | Archivo evidencia | Status final |
|---|---|---|---|---|
| CP-AC1 | ✅ PASS | — | notification-center.js L1098-1105 | ✅ PASS |
| CP-AC2 | ✅ PASS | — | grep 0 matches badges/news-center/unread | ✅ PASS |
| CP-AC3 | ✅ PASS | — | L287 count exact; L308 limit(200); L1259-1260 update por filtro | ✅ PASS |
| CP-AC4 | ✅ PASS | — | 3 rutas fallback L284-390 | ✅ PASS |
| CP-AC5 | ✅ PASS | — | open() UI optimista + await sin refresh final L1188-1237 | ✅ PASS |
| CP-AC6 | ✅ PASS | — | control/main.js L247-251 rol 'control' | ✅ PASS |
| CP-AC7 | ✅ PASS | — | 4 adaptadores globales L1351-1386 + auto-ejecución L1390 | ✅ PASS |
| **CP-AC8** | ⚠️ CONDIC | **R1**: Añadidos named exports BadgeSystem + NewsCenter L1397-1413. **R4**: Limpio imports huérfanos (padre L18 quita NewsCenter; control L3 → solo NotificationCenter). Padre L499 borra asignación redundante. | notification-center.js L1397-1413, padre/main.js L18, control/main.js L3 | ✅ PASS |
| **CP-AC9** | ⚠️ PARCIAL | **R2**: 4 whitelist unsubscribeAll añaden 'notif-center_<uid>': directora L234, asistente L358, encargada L61, padre L1032. Añadido prefijo notif-center_ a RealtimeManager.CRITICAL L26. | realtime-manager.js L26 + 4 main.js | ✅ PASS |
| CP-NFR1 | ✅ PASS | **R3**: Padre _showOnlySection L1032 reemplaza currentStudent por AppState.get('currentStudent'). | padre/main.js L1032-1034 | ✅ PASS |

---

## Review 2 — 2026-10-09 (post-remediación, PASSED)

**Resultado Final**: ✅ **PASS** 10/10 checkpoints.

Evidencias de sintaxis y diagnostics:
```
node --check notification-center + realtime-manager + 6 main.js → exit 0 "ALL OK"
GetDiagnostics → 0 files, 0 diagnostics
```

Auditoría de imports nombrados:
```
✓ notification-center.js: export const BadgeSystem L1397
✓ notification-center.js: export const NewsCenter L1406
✓ padre/main.js L18: import { NC, BadgeSystem } — BadgeSystem se usa L1054, L1075
✓ control/main.js L3: import { NC } — 0 imports huérfanos
```

Auditoría canales realtime:
```
✓ RealtimeManager.CRITICAL = ['badges_', 'news-center_', 'unread_msgs_', 'notif-center_']
✓ 4 whitelists unsubscribeAll contienen 'notif-center_' + uid
  - directora L234
  - asistente L358
  - encargada L61
  - padre L1032
```

Auditoría COUNT/SELECT unify:
```
✓ _fetchNotifCount: count:exact head:true SIN .limit() — badge total alineado a BD
✓ _fetchNotifications: .limit(MAX_NOTIF_LIST=200) (no 60)
✓ markAllRead open(): UPDATE .eq(user_id).eq(is_read,false) — TODAS las notif se marcan
```

Auditoría fallback PostgREST:
```
✓ _fetchNotifCount: SDK → _pgCount PostgREST → fallback memoria
✓ _fetchNotifications: SDK → PostgREST direct → último valor memoria
✓ _fetchMsgCounts: RPC → SDK messages select → PostgREST
```

Auditoría open() limpieza badge:
```
✓ UI optimista ANTES de BD: items[i].isRead=true + sync badges
✓ await supabase.update(...) INMEDIATO (no .then() colgado)
✓ NO hay this.refresh() al final del open()
```

## Recomendaciones post-live:
- En próxima limpieza semanal (no es release-blocker): archivos badges.js / unread-messages.js / news-center.js legacy ya no se importan desde ningún main.js; se pueden dejar (por si otro módulo los dinámicamente) o marcar como deprecated — no afectan al sistema unificado.
