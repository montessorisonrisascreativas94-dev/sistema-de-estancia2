# Control de Edades por Aula Preinscripción — Plan de Implementación

## Investigación del Repositorio

### Estado actual (preinscripcion.html)
- **Formulario wizard** de 7 pasos. Paso 1 contiene `birth_date` (fecha nacimiento) + `calculatedAge` (readonly, muestra años/meses sin días) + `level_requested` (select con opciones genéricas antiguas: "Maternal, Infante, Parvulos, Pre-Kinder, Kinder, Preprimaria, 1ro..6to Primaria") y rango de edades NO coincidentes con las reglas del colegio.
- **Cálculo de edad** actual (L605-611): solo años y meses. No maneja rango de días/meses preciso para Párvulos I (45 días–11 meses), que es el nivel de bebés.
- **Validación de paso 1**: `validateStep()` solo revisa campos [required], NO valida coherencia edad vs nivel.
- **Payload submit** (L747-767): inserta en tabla `student_preregistrations` con campos actuales. Tabla NO contiene columnas de control de edad, sugerencia ni autorización directora.
- **Supabase**: columna `status` por defecto `pending` (pendiente revisión).

### Reglas de negocio (pre.md)
**Aulas regulares — rangos de edad estrictos:**

| Aula / Nivel                     | Edad (referencia fecha actual)          | Criterio        |
|----------------------------------|-----------------------------------------|-----------------|
| Párvulos I                       | 45 días **≤** edad **<** 12 meses       | meses + días    |
| Párvulos II                      | 12 meses **≤** edad **<** 24 meses      | meses           |
| Párvulos III                     | 24 meses **≤** edad **<** 36 meses      | meses           |
| Pre-Kínder – Línea Blanca        | ≥ 3 años y **<** 4                      | años cumplidos  |
| Kínder – Línea Gris              | ≥ 4 años y **<** 5                      | años cumplidos  |
| Pre-Primario – Línea Negra       | ≥ 5 años y **<** 6                      | años cumplidos  |
| 1ro – Línea Roja                 | ≥ 6 años y **<** 7                      | años cumplidos  |
| 2do – Línea Amarilla             | ≥ 7 años y **<** 8                      | años cumplidos  |
| 3ro – Línea Azul                 | ≥ 8 años y **<** 9                      | años cumplidos  |
| 4to – Línea Verde                | ≥ 9 años y **<** 10                     | años cumplidos  |
| 5to – Línea Naranja              | ≥ 10 años y **<** 11                    | años cumplidos  |
| 6to – Línea Morado               | ≥ 11 años y **<** 12                    | años cumplidos  |

**Aulas especiales (sin control de edad rígido):**
Verano, Inglés Afterschool, Ballet / Danza, Taekwondo, Sala de Tarea, Cuido.

**Autorización Directora**: cuando la edad NO cae dentro del rango del aula seleccionada, el padre/madre debe marcar un checkbox "Acepto solicitar autorización a la Dirección" y opcionalmente escribir una nota. Este flag se guarda en la BD para que la Directora lo revise y confirme posteriormente en su panel (con posibilidad de aprobar/rechazar).

---

## Archivos y Módulos a Cambiar

1. **`preinscripcion.html`** (único archivo de trabajo):
   - Reemplazar `<select name="level_requested">` por opciones alineadas a pre.md (12 regulares + 6 especiales agrupadas por `<optgroup>`).
   - Añadir, inmediatamente debajo de `level_requested`, un bloque dinámico `levelValidationBox` (oculto por defecto) que muestra:
     - Badge color (verde/amarillo/rojo) con estado `edad correcta` / `edad fuera de rango`.
     - Nivel sugerido.
     - Si fuera de rango: checkbox "Solicitar autorización a la Dirección para esta edad" + `textarea` nota opcional.
   - Mejorar el cálculo de edad en `calculatedAge` para mostrar:
     - `<1 año`: **X meses, Y días** (ej: "3 meses, 12 días").
     - `1 año+`: **X años, Y meses**.
   - Validación paso 1 (`validateStep`): cuando `age_ok === false` → requerir que esté marcado el checkbox de autorización.
   - `buildReview()`: incluir 3 líneas nuevas en review Estudiante: Nivel sugerido, Estado validez edad, Autorización solicitada (Si/No + nota).
   - Submit: añadir 4 campos nuevos al objeto data.
2. **SQL script nuevo** `sql/FIX_PREINSCRIPCION_AGE_CONTROL.sql` (documentación para ejecutar en Supabase Dashboard):
   - 4 columnas nuevas en `student_preregistrations`: `suggested_level text, age_match boolean default true, director_authorization_requested boolean default false, director_authorization_note text`.

---

## Pasos de Implementación (orden de dependencias)

1. **Paso 1: Actualizar `<select level_requested>` en HTML paso 1**
   - Borrar las options antiguas L338.
   - Poner `<optgroup label="Aulas Regulares">` con 12 options (valor = texto visible, para mantener consistencia con paneles administrativos que ya usan `level_requested`).
   - Poner `<optgroup label="Aulas y Actividades Especiales">` con 6 options.

2. **Paso 2: Reemplazar handler age en JS (L605-611)**
   - Escribir funciones auxiliares:
     - `calcAgeInTotalMonthsAndDays(birthDate, refDate = new Date())` → { totalMonths, totalDays, years, months, days } (calcula días reales usando diferencia de fechas con Math.round).
     - `suggestLevelFromAge({ totalMonths, days })` → string nombre de aula regular sugerida, o null (si <45 días o ≥12 años).
     - `levelAgeRange(levelName)` → { minDays, maxDays } o `null` para aulas especiales.
     - `isAgeInLevel(ageStats, levelName)` → boolean + `{ inRange: boolean, deltaLabel: string }`.
   - Actualizar listener `[name="birth_date"] change` para:
     - Pintar edad extendida en `calculatedAge`.
     - Calcular `suggestedLevel` y, si el usuario NO ha tocado level_requested todavía, ponerlo automáticamente con ese valor.
     - Ejecutar `renderAgeValidationBox()` (re-render cada vez que cambien `birth_date` o `level_requested`).

3. **Paso 3: Insertar nodo HTML `levelValidationBox` y escribir `renderAgeValidationBox()`**
   - HTML estático: `<div id="levelValidationBox" style="display:none; margin-top:12px" class="..."></div>`.
   - CSS inline (o en style head): estilos para box alerta amber/verde con borde redondo, padding, ícono bootstrap (bi-check-circle / bi-exclamation-triangle-fill).
   - Render condicional:
     - Si `level_requested ∈ Especiales` o `!birth_date.value` → mostrar NADA.
     - Si edad OK para el nivel → mostrar box verde "Edad válida para este nivel".
     - Si edad NO OK → mostrar box ámbar/rojo:
       - Línea 1: "Edad fuera del rango oficial para este aula (esperado: X–Y. Real: Z)"
       - Línea 2: "Nivel sugerido por edad: **XXX**"
       - Checkbox requerido `id="directorAuthRequested"` `name="director_authorization_requested"`
       - Textarea opcional `name="director_authorization_note"` placeholder="Motivo por el cual solicita autorización (ej: ingreso tardío, hermanos en el aula, madurez observada)"
   - Añadir listener change en `level_requested` → `renderAgeValidationBox()`.

4. **Paso 4: Actualizar `validateStep(1)`**
   - Modificar L640-644: después de chequeo required, si `s===1` → revisar:
     - `const directorAuthCheckbox = document.getElementById('directorAuthRequested');`
     - Si box está visible y estado=fuera_rango y NO está marcado el checkbox → marcar error en level_select, `ok=false` y mostrar toast/texto bajo el box: "Para continuar, acepta que se solicitará autorización a la Directora".

5. **Paso 5: Añadir al review (buildReview)**
   - En review-section "Estudiante" añadir 3 items después de "Nivel": Nivel sugerido, Edad para el nivel (✅/⚠️), Autorización Dirección (Sí + nota / No).

6. **Paso 6: Añadir columnas al data submit**
   - Incluir en objeto L747-767:
     ```js
     suggested_level: (window._precalc && window._precalc.suggestedLevel) || null,
     age_match: (window._precalc && window._precalc.ageMatch) || true,
     director_authorization_requested: v('director_authorization_requested') === 'on',
     director_authorization_note: v('director_authorization_note') || null,
     ```
   - Variable global `window._precalc` = objeto con resultados sugeridos al momento de cambiar birth_date / level.

7. **Paso 7: Crear SQL `sql/FIX_PREINSCRIPCION_AGE_CONTROL.sql`**
   ```sql
   ALTER TABLE public.student_preregistrations
     ADD COLUMN IF NOT EXISTS suggested_level text,
     ADD COLUMN IF NOT EXISTS age_match boolean DEFAULT true,
     ADD COLUMN IF NOT EXISTS director_authorization_requested boolean DEFAULT false,
     ADD COLUMN IF NOT EXISTS director_authorization_note text;
   COMMENT ON COLUMN public.student_preregistrations.age_match IS 'TRUE si la edad del menor cae dentro del rango oficial del aula solicitada (segun pre.md). FALSE si requiere validacion directora.';
   COMMENT ON COLUMN public.student_preregistrations.director_authorization_requested IS 'El padre/madre acepto que la inscripcion se envia con edad fuera de rango a revision de la directora.';
   ```

---

## Dependencias y Consideraciones
- **Columnas nuevas NO son obligatorias en inserción**: tienen `DEFAULT`, así que las preinscripciones existentes NO se rompen aunque el usuario se demore en aplicar el SQL. Si el SQL no se aplica, el INSERT fallará. **Por ello, el script SQL debe aplicarse ANTES de hacer deploy del HTML actualizado**, o bien envolver INSERT en try/catch y (opcionalmente) enviar sin esas 4 columnas. Para simplificar, en el plan le pedimos al usuario que aplique el SQL primero en Supabase SQL Editor.
- **Rangos especiales**: las aulas especiales NO pasan por control de edad; el check de autorización está oculto para ellas.
- **Compatibilidad con paneles administrativos**: `level_requested` ahora usa nombres largos exactos ("Párvulos I", "1ro – Línea Roja", etc). Los paneles que muestren `level_requested` no deben romperse, pero puede que algún filtro por texto no coincida; en la Directora/Asistente habría que actualizar `options` de los `<select>` en una segunda fase. Este plan NO modifica otros paneles (fuera de scope).
- **Huso horario**: calculo de edad usa `new Date()` (locale del navegador cliente). OK.

---

## Validación
- [ ] Aplicar SQL en Supabase (o simular sin columna con console.warn).
- [ ] Test casos borde calcEdad():
  - `2026-09-20` y hoy `2026-10-01` → 11 días (y así NO cumple Párvulos I que empieza en 45 días).
  - `2026-08-15` → 1 mes 16 días = 46 días → SÍ Párvulos I.
  - `2024-10-01` hoy 2026-10-01 → 2 años → Párvulos III (24–35 meses).
  - `2023-10-01` hoy 2026-10-01 → 3 años → Pre-Kínder Línea Blanca.
  - `2020-10-01` hoy 2026-10-01 → 6 años → 1ro Línea Roja.
- [ ] Test fuera de rango: fecha `2017-03-15` (9.5 años) pero nivel "6to – Línea Morado" (debería ser 11 años). → debe mostrar box ámbar, pedir check autorización. Si NO lo marca → no pasa a paso 2.
- [ ] Submit: revisar Network tab Supabase → los 4 campos llegan con valores correctos.
- [ ] Aulas especiales: seleccionar "Verano" → no aparece ningún warning de edad.

---

## Riesgos y su Manejo
| Riesgo | Mitigación |
|--------|------------|
| Usuario olvida aplicar SQL y INSERT falla 42703 undefined_column | El submit catch L789 muestra `err.message` con "column ... does not exist"; en el script catch agregar un `if (message.includes('does not exist'))` con aviso más claro: "Antes de usar este formulario ejecuta el archivo FIX_PREINSCRIPCION_AGE_CONTROL.sql en Supabase". |
| Panel directora filtra por `level_requested` antiguo y no ve nuevos valores | En plan futura iteración actualizar `<select>` de paneles administrativos. Esta iteración solo toca `preinscripcion.html`. |
| Párvulos I edge-case "menos de 45 días": sistema no sugiere nada → hay que pedir que espere | En renderAgeValidationBox: si edad < 45 días y aula regular seleccionada → mostrar advertencia naranja "Demasiado pequeño. La edad mínima para Párvulos I son 45 días de vida". |
| Directora NO recibe notificación de preinscripciones con `director_authorization_requested=true` | (Opcional, fuera de scope esta vez) En panel directora sección inscripciones filtrar con badge destacado las solicitudes "Pendiente Autorización". Se deja para la próxima mejora. |
