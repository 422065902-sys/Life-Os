# CODEX BATCH 13 — Revisión funcional completa (19 puntos)
> Creado: 2026-05-01 | Basado en revisión de usuario + auditoría sesión 18
> INSTRUCCIONES PARA CODEX: ejecutar en orden A → B → C → D → E → F → G.
> Al modificar main.js: leer la función COMPLETA antes de editar.
> No crear funciones duplicadas. No eliminar funciones existentes.
> Antes de empezar: `git pull --rebase origin main` (VPS hace commits directos).

---

## BATCH 13A — Colores Modo Aura ✅ YA IMPLEMENTADO (verificar)

> Cambios ya aplicados por Claude en esta sesión. Codex solo debe verificar.

**Archivos modificados:**
- `main.js`: Se añadió `AURA_PRESETS` (8 colores pastel/emocionales) después de `ACCENT_PRESETS`
- `main.js`: `buildAccentPresets()` ahora muestra `AURA_PRESETS` cuando `S.visualMode === 'aura'`
- `main.js`: `_setAuraAccentVars()` — pastelización aumentada a 65% color + 35% blanco
- `styles.css`: `.acc-dot.sel` — más visible: `scale(1.18)` + anillo doble

**Verificar**: En Modo Aura → Settings → Color de acento debe mostrar paleta pastel (Lavanda, Niebla Azul, Rosa Cálido, etc.) en lugar de los neones. El dot seleccionado debe tener borde blanco claramente visible.

---

## BATCH 13B — Radar Rendimiento: altura equilibrada

### B1. Radar card — ampliar a 3 filas para igualar Racha + Enfoque

**Archivo**: `index.html`
**Problema**: El Radar ocupa `card-large` (2 col × 2 filas) mientras Racha (1 fila) + Enfoque (2 filas) = 3 filas en la columna izquierda. La columna derecha (Radar) queda corta con 1 fila vacía.

**Buscar** (alrededor de línea 811 en index.html):
```html
<!-- PILAR 3: .card-large — Radar (2 col × 2 filas) -->
<div class="card card-large">
  <div class="card-title row" style="justify-content:space-between;flex-wrap:wrap;gap:8px">
    <span>RADAR DE RENDIMIENTO</span>
```

**Cambio**: Añadir `style="grid-row:span 3"` al div del Radar:
```html
<!-- PILAR 3: .card-large — Radar (2 col × 2 filas → 3 filas) -->
<div class="card card-large" style="grid-row:span 3">
  <div class="card-title row" style="justify-content:space-between;flex-wrap:wrap;gap:8px">
    <span>RADAR DE RENDIMIENTO</span>
```

**Resultado esperado**:
```
Row 2: [RACHA semanal  ][RADAR          ]
Row 3: [ENFOQUE Mental ][RADAR          ]
Row 4: [ENFOQUE Mental ][RADAR          ]
```
El Radar ocupa exactamente la misma altura que Racha + Enfoque combinados. Sin espacio vacío.

---

## BATCH 13C — Núcleo Personal vs Núcleo Global — lógica correcta

### C1. Separar datos: Personal = usuario, Global = comunidad

**Problema actual**: El `nucleo-card-main` (etiquetado "NÚCLEO GLOBAL" en el panel SAAS/Nexus) muestra exactamente los mismos datos del usuario que el widget compacto "NÚCLEO PERSONAL". Los dos campos `global-nucleo-avg` y `global-racha-max` siempre muestran "—".

**Lo correcto**:
- **NÚCLEO PERSONAL** (panel Análisis, `nucleo-card-compact`): hábitos + tareas del usuario. ✅ Ya correcto — no tocar.
- **NÚCLEO GLOBAL** (panel SAAS/Nexus, `nucleo-card-main`): datos agregados de la comunidad de usuarios Life OS. Los metrics (hábitos, tareas, XP, racha) del núcleo global deben venir de `userDirectory`.

**Archivo**: `main.js`
**Implementar**: nueva función `loadGlobalCoreStats()` asíncrona + llamarla desde `updateGlobalCore()` cuando el widget global sea visible.

**Buscar** la función `updateGlobalCore()` (línea ~8110) y al final de ella, después de la lógica del WEEKLY BONUS, agregar la llamada:

```js
// Al final de updateGlobalCore(), antes del cierre de la función:
// Refrescar datos globales de comunidad en el widget NÚCLEO GLOBAL
if (document.getElementById('nucleo-card-main')?.offsetParent !== null) {
  loadGlobalCoreStats().catch(() => {});
}
```

**Agregar nueva función** después de `updateGlobalCore()` (línea ~8320):

```js
async function loadGlobalCoreStats() {
  if (!CLOUD_ENABLED || !_db) return;
  try {
    const todayStr = today();
    // Muestra de hasta 50 usuarios del directorio global
    const snap = await _db.collection('userDirectory').limit(50).get();
    let totalUsers = 0, activeToday = 0, totalLevel = 0, maxStreak = 0;
    snap.forEach(doc => {
      const d = doc.data();
      totalUsers++;
      // Activo hoy = tuvo actividad en la última sesión (lastSeen o lastActive)
      if (d.lastSeen && String(d.lastSeen).slice(0,10) === todayStr) activeToday++;
      if (d.level) totalLevel += Number(d.level) || 1;
      if (d.streak && Number(d.streak) > maxStreak) maxStreak = Number(d.streak);
    });
    const avgLevel = totalUsers > 0 ? Math.round(totalLevel / totalUsers) : 1;

    // Actualizar campos del widget global
    const avgEl = document.getElementById('global-nucleo-avg');
    if (avgEl) avgEl.textContent = `Nv ${avgLevel}`;
    const rachaEl = document.getElementById('global-racha-max');
    if (rachaEl) rachaEl.textContent = maxStreak > 0 ? `${maxStreak}d` : '—';
    const badgeEl = document.getElementById('global-active-badge');
    if (badgeEl) badgeEl.textContent = activeToday > 0
      ? `🌐 ${activeToday} usuario${activeToday === 1 ? '' : 's'} activos hoy`
      : '🌐 Vista Global — Activos hoy';
  } catch(e) {
    console.warn('[Life OS] loadGlobalCoreStats error:', e);
  }
}
```

**Además**, cambiar el subtítulo del NÚCLEO GLOBAL en index.html para que quede claro que es datos de comunidad:

**Buscar** (línea ~1867 en index.html):
```html
<div id="global-active-badge" style="...">🌐 Vista Global — Activos hoy</div>
```
→ Ya tiene el texto correcto. Solo necesita que `loadGlobalCoreStats()` lo popule.

**Buscar** el div con `nucleo-global-sub` (línea ~1711 en index.html) del widget PERSONAL:
```html
<div class="nucleo-global-sub">Tu actividad del día · hábitos + tareas</div>
```
→ Ya correcto. No tocar.

---

## BATCH 13D — Aliados: auditar flujo completo

### D1. Agregar botón "Ver Perfil" en resultados de búsqueda

**Archivo**: `main.js`
**Función**: `_renderSearchResults()` (línea ~4425)

**Buscar** dentro de la función el bloque de botón:
```js
const btn = r.isAlready
  ? `<button class="btn btn-add-aliado already" disabled>✓ Aliado</button>`
  : `<button class="btn btn-add-aliado" onclick="addAliadoCloud('${r.uid}','${escHtml(r.nombre)}','${escHtml(r.publicId||'')}')">+ Añadir</button>`;
return `<div class="aliado-result-row">
  <div class="aliado-avatar stranger">${escHtml(initial)}</div>
  <div style="flex:1;min-width:0">
```

**Reemplazar con** (agrega botón "👤 Perfil" antes del botón de añadir):
```js
const profileBtn = `<button class="btn btn-g btn-sm" onclick="openPerfilPublico('${r.uid}')" style="padding:4px 10px;font-size:11px">👤</button>`;
const addBtn = r.isAlready
  ? `<button class="btn btn-add-aliado already" disabled>✓ Aliado</button>`
  : `<button class="btn btn-add-aliado" onclick="addAliadoCloud('${r.uid}','${escHtml(r.nombre)}','${escHtml(r.publicId||'')}')">+ Añadir</button>`;
const btn = `<div style="display:flex;gap:6px;align-items:center">${profileBtn}${addBtn}</div>`;
return `<div class="aliado-result-row">
  <div class="aliado-avatar stranger">${escHtml(initial)}</div>
  <div style="flex:1;min-width:0">
```

### D2. Agregar botón "Ver Perfil" en lista de aliados existentes

**Archivo**: `main.js`
**Función**: `renderAliados()` (línea ~4669)

**Buscar** dentro del `.map(a => {` el bloque de botones de editar/eliminar. Buscar la línea que tiene los botones `✏️` y `🗑`:
```js
      <button class="btn btn-g btn-sm" onclick="openEditAliado('${a.id}')">✏️</button>
      <button class="btn btn-d btn-sm" onclick="deleteAliado('${a.id}','${escHtml(a.nombre)}')">🗑</button>
```

**Reemplazar** (añadir botón de perfil solo si es aliado cloud):
```js
      ${a.isCloudAlly && a.uid ? `<button class="btn btn-g btn-sm" onclick="openPerfilPublico('${a.uid}')" title="Ver Vitrina" style="padding:4px 10px">👤</button>` : ''}
      <button class="btn btn-g btn-sm" onclick="openEditAliado('${a.id}')">✏️</button>
      <button class="btn btn-d btn-sm" onclick="deleteAliado('${a.id}','${escHtml(a.nombre)}')">🗑</button>
```

### D3. Prevenir solicitudes duplicadas en addAliadoCloud

**Archivo**: `main.js`
**Función**: `addAliadoCloud()` (línea ~4460)

**Buscar** el bloque al inicio de la función:
```js
  // Evitar duplicar solicitud si ya son aliados
  if (S.aliados.some(a => a.uid === targetUid)) {
    showToast('ℹ️ Ya son aliados'); return;
  }
```

**Reemplazar** (también chequear solicitudes ya enviadas):
```js
  // Evitar duplicar si ya son aliados
  if (S.aliados.some(a => a.uid === targetUid)) {
    showToast('ℹ️ Ya son aliados'); return;
  }
  // Evitar reenvío si ya hay solicitud pendiente (check Firestore)
  if (CLOUD_ENABLED && _db) {
    const myUid = _auth?.currentUser?.uid;
    const existing = await _db.collection('friendRequests')
      .where('fromUid', '==', myUid)
      .where('toUid', '==', targetUid)
      .where('status', '==', 'pending')
      .limit(1).get();
    if (!existing.empty) {
      showToast('📨 Solicitud ya enviada, esperando respuesta…'); return;
    }
  }
```

**Nota importante**: Esta función ya es `async`, el `await` es válido.

### D4. Mostrar publicId del aliado en la lista

**Archivo**: `main.js`
**Función**: `renderAliados()` (línea ~4669)

**Buscar** dentro del `.map(a => {` el bloque que muestra la etiqueta de publicId:
```js
          ${a.isCloudAlly
            ? `<span style="font-size:9px;...">🌐 World</span>
               <span style="...font-size:9px;">${escHtml(a.publicId || '')}</span>`
```

Si el publicId no se muestra o está oculto, asegurarse de que sea visible bajo el nombre del aliado. Si ya se muestra, este paso es solo verificación.

---

## BATCH 13E — Tarjeta de Tareas Gamificada

### E1. Mejorar visual de task-item en renderTasks()

**Archivo**: `main.js`
**Función**: `renderTasks()` (línea ~1560)

**Problema**: Las tarjetas de tarea son planas. No comunican urgencia, prioridad ni recompensa de manera visual impactante.

**Buscar** el `.map(t =>` que genera cada `task-item`:
```js
el.innerHTML = visible.map(t=>`
  <div class="task-item ${t.done?'done':''}">
    <div style="flex:1;min-width:0">
      <div style="font-size:13px;font-weight:600;text-decoration:${t.done?'line-through':'none'};opacity:${t.done?.5:1}">${escHtml(t.name)}</div>
```

**Reemplazar con** diseño gamificado:
```js
el.innerHTML = visible.map(t => {
  const pri = getTaskPriority(t);
  const priColor = pri >= 3 ? 'var(--red)' : pri >= 2 ? 'var(--gold)' : 'var(--accent)';
  const priLabel = pri >= 3 ? '🔴 CRÍTICA' : pri >= 2 ? '🟡 ALTA' : '⚪ NORMAL';
  const xpTag = t.done
    ? `<span class="badge badge-xp" style="font-size:9px">+50 XP ✓</span>`
    : `<span style="font-size:9px;color:var(--text3);font-family:'JetBrains Mono',monospace">+50 XP</span>`;
  return `
  <div class="task-item ${t.done?'done':''}" style="border-left:3px solid ${t.done?'rgba(74,222,128,.4)':priColor};padding-left:12px">
    <div style="flex:1;min-width:0">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
        <span style="font-size:9px;font-weight:700;font-family:'JetBrains Mono',monospace;color:${t.done?'rgba(74,222,128,.7)':priColor}">${t.done?'✅ COMPLETA':priLabel}</span>
        ${xpTag}
      </div>
      <div style="font-size:13px;font-weight:600;text-decoration:${t.done?'line-through':'none'};opacity:${t.done?.5:1};color:var(--text)">${escHtml(t.name)}</div>
      ${t.desc?`<div style="font-size:11px;color:var(--text3);margin-top:2px">${escHtml(t.desc)}</div>`:''}
      <div style="display:flex;gap:8px;margin-top:4px;flex-wrap:wrap">
        ${t.date?`<span style="font-size:10px;color:var(--accent);font-family:'JetBrains Mono',monospace">📅 ${t.date}</span>`:''}
        ${t.time?`<span style="font-size:10px;color:var(--purple);font-family:'JetBrains Mono',monospace">🕐 ${t.time}</span>`:''}
      </div>
    </div>`;
}).join('');
```

**Nota**: el bloque de botones (checkbox, edit, pomo, delete) que ya existe en el map debe mantenerse — solo reemplazar la parte del contenido de texto, no los botones al final.

---

## BATCH 13F — Biblioteca vs Diario Bitácora: separar responsabilidades

### F1. Clarificar el propósito de cada tab en la UI

**Problema**: Los usuarios confunden Biblioteca (colección de recursos: libros, podcasts) con Bitácora (diario de experiencias). El tab "Bitácora" mezcla reflexiones con contenido multimedia.

**Cambio conceptual**:
- **Biblioteca** = "Qué estoy consumiendo/terminé" — libros, podcasts, recursos. Tracker de progreso.
- **Bitácora (Reflexión tab)** = "Qué aprendí / sentí hoy" — solo entradas de texto: victoria + lección.
- **Bitácora (Libro/Película tabs)** = Son para AGREGAR a Biblioteca, no para crear entradas de diario.

### F1a. Renombrar tab "Bitácora" → "Diario" en la UI de Mente & Poder

**Archivo**: `main.js`
**Función**: `renderPoderSections()` (buscar donde se genera el HTML del panel "poder")

**Buscar** donde se genera el tab de bitácora:
```js
// Buscar texto similar a:
onclick="switchInnerTab('poder','bitacora')"
// o
id="tab-bitacora"
```

Dentro del HTML del tab, cambiar la etiqueta de display de "✍️ Bitácora" a "✍️ Diario" en el botón visible (sin cambiar el id ni el tabId para no romper la lógica).

### F1b. Agregar hint en Biblioteca que explique su propósito

**Archivo**: `main.js`
**Función**: `renderBiblioteca()` (línea ~4035)

**Buscar** el empty state:
```js
el.innerHTML = `<div class="biblioteca-empty">
  <div style="font-size:2rem">📚</div>
  <p>Tu Biblioteca está vacía</p>
  <p style="opacity:.6;font-size:13px">Agrega libros, podcasts o recursos que estás consumiendo</p>
```

**Reemplazar** el párrafo descriptivo:
```js
  <p style="opacity:.6;font-size:13px">Tu colección de libros y recursos. Aquí llevas el registro de qué estás leyendo, escuchando o terminando — con progreso y XP.</p>
```

### F1c. Agregar hint en Diario/Bitácora (tab reflexión)

**Archivo**: `main.js`
**Función**: `renderBitacoraList()` (línea ~4114)

**Buscar** el empty state:
```js
el.innerHTML=`<div class="bitacora-empty">
  <div style="font-size:2rem">📝</div>
  <p>Tu Bitácora está vacía</p>
  <p style="opacity:.6;font-size:13px">Escribe tu primer pensamiento del día — tu Gemelo aprende de aquí</p>
```

**Reemplazar** el párrafo descriptivo:
```js
  <p style="opacity:.6;font-size:13px">Tu diario de experiencias diarias. Escribe victorias y aprendizajes — tu Gemelo Digital calibra tu estado emocional desde aquí.</p>
```

---

## BATCH 13G — Aprende e Infórmate: contenido personalizado

### G1. Mostrar contenido relevante según estado del usuario

**Archivo**: `main.js`
**Función**: `renderAprendeLayer(layer)` (línea ~12570)

**Contexto**: La función actual delega a `_renderConceptos()`, `_renderGuias()`, o `loadNoticias()`. El contenido es estático y no considera el estado del usuario.

**Cambio**: Al renderizar el layer, inyectar una fila de "Recomendaciones para ti" arriba del contenido, basada en el estado del usuario:

**Buscar** la función `renderAprendeLayer`:
```js
function renderAprendeLayer(layer) {
  const container = document.getElementById('aprende-layer-content');
  if (!container) return;
  if (layer === 'conceptos') container.innerHTML = _renderConceptos();
  else if (layer === 'guias') container.innerHTML = _renderGuias();
  else if (layer === 'noticias') loadNoticias();
}
```

**Reemplazar**:
```js
function renderAprendeLayer(layer) {
  const container = document.getElementById('aprende-layer-content');
  if (!container) return;

  // Banner personalizado según estado del usuario
  const hint = _getAprendePersonalHint();
  const hintHtml = hint ? `<div style="padding:12px 16px;background:linear-gradient(135deg,rgba(0,229,255,.06),rgba(168,85,247,.04));border:1px solid rgba(0,229,255,.12);border-radius:12px;margin-bottom:14px;display:flex;align-items:flex-start;gap:10px">
    <span style="font-size:20px;flex-shrink:0">${hint.icon}</span>
    <div>
      <div style="font-size:11px;font-weight:800;color:var(--accent);font-family:'Orbitron',monospace;letter-spacing:.06em;margin-bottom:3px">PARA TI AHORA</div>
      <div style="font-size:13px;color:var(--text);font-weight:600">${hint.title}</div>
      <div style="font-size:11px;color:var(--text3);margin-top:2px">${hint.sub}</div>
    </div>
  </div>` : '';

  if (layer === 'conceptos') container.innerHTML = hintHtml + _renderConceptos();
  else if (layer === 'guias') container.innerHTML = hintHtml + _renderGuias();
  else if (layer === 'noticias') { container.innerHTML = hintHtml; loadNoticias(); }
}

function _getAprendePersonalHint() {
  const todayHabits = getTodayHabits(S.habits || []);
  const doneH = todayHabits.filter(h => isHabitDoneToday(h)).length;
  const racha = S.checkInStreak || 0;
  const xpHoy = S.xpHistory?.[today()] || 0;

  // Prioridad: primero los que más necesiten apoyo
  if (racha === 0 || (doneH === 0 && todayHabits.length > 0)) {
    return { icon:'🔄', title:'Cómo volver después de una pausa', sub:'Estrategias para reactivar tu rutina sin culpa.' };
  }
  if (racha >= 7 && xpHoy > 100) {
    return { icon:'🚀', title:'Estás en racha — llévalo al siguiente nivel', sub:'Técnicas avanzadas para usuarios consistentes.' };
  }
  if ((S.xp || 0) < 500) {
    return { icon:'⚡', title:'Primeros pasos en Life OS', sub:'Guía rápida para sacarle el máximo provecho.' };
  }
  if ((S.tasks || []).filter(t => !t.done && !t.deleted).length > 5) {
    return { icon:'🎯', title:'Demasiadas tareas pendientes', sub:'Método para priorizar y reducir el backlog.' };
  }
  return null; // Sin hint específico
}
```

---

## VPS + STAGING — Ejecutar primero al iniciar la sesión en el VPS

> ⚠️ CRÍTICO: Staging sigue con código anterior al Batch 12. Ejecutar esto ANTES de cualquier otra cosa.

```bash
# En el VPS (root@187.77.219.106):
cd /opt/openclaw/repo/lifeos && git pull origin main && \
  cp "Documents/Life Os/scripts/runner.js" /opt/openclaw/runner.js && \
  cp "Documents/Life Os/scripts/analyze.js" /opt/openclaw/analyze.js && \
  cp "Documents/Life Os/scripts/analyze-deep.js" /opt/openclaw/analyze-deep.js && \
  cd "/opt/openclaw/repo/lifeos/Documents/Life Os" && \
  GOOGLE_APPLICATION_CREDENTIALS="/opt/openclaw/repo/lifeos/Documents/Life Os/scripts/firebase-adc.json" \
  firebase deploy --only hosting:staging --project staging
```

---

## CHECKLIST DE VERIFICACIÓN EN STAGING (después del deploy)

### Items del Batch 12 (verificar que ya están):
- [ ] Agenda: actividades vencidas van a sección "PENDIENTES ATRASADAS" al fondo
- [ ] Financiero: overlay "Categoriza tus gastos" aparece DEBAJO de la dona, no encima
- [ ] Estado Pro: banner pro oculto para usuarios Pro
- [ ] World Apartamento: usa `aptShowConfirm()` igual que la burbuja
- [ ] Hábitos: selector días L/M/X/J/V/S/D al crear y al editar
- [ ] Enfoque Mental: donut + barras aparecen lado a lado
- [ ] Racha semanal: círculos más juntos
- [ ] Leaderboard: carga datos reales de Firestore

### Items del Batch 13 (verificar después de implementar):
- [ ] 13A: Settings → Aura mode → paleta de colores muestra pasteles, color seleccionado visible
- [ ] 13B: Dashboard → Radar de Rendimiento ocupa la misma altura que Racha + Enfoque
- [ ] 13C: SAAS/Nexus → Núcleo Global muestra datos de comunidad (nivel promedio, racha máxima, usuarios activos)
- [ ] 13D: Aliados → resultados de búsqueda tienen botón "👤" que abre vitrina; lista de aliados cloud también
- [ ] 13E: Dashboard → tarjetas de tareas muestran barra de prioridad de color + etiqueta CRÍTICA/ALTA/NORMAL
- [ ] 13F: Mente & Poder → tab "Bitácora" muestra "Diario" como label; textos descriptivos actualizados
- [ ] 13G: Aprende → banner "PARA TI AHORA" aparece personalizado según estado del usuario

---

## QA POST-BATCH 13

Después de verificar en staging:
```bash
cd /opt/openclaw && node runner.js --deep
```

---

## PENDIENTES FUTUROS (Batch 14+ — NO implementar en este batch)

Documentados para sesiones futuras:
- **Mapa muscular SVG mejorado** — zonas musculares más claras, realistas
- **Rutinas recomendadas** — sugerir rutina según zona muscular menos trabajada
- **Calorías opcionales** — activar/desactivar tracking de calorías
- **Libro modo lectura pomodoro** — checkpoints, sesiones, progreso tipo lector
- **Series** — tab separado dentro de Películas o módulo propio
- **Notificaciones recreativas** — no solo recordatorios, sino motivación contextual
- **Dashboard inteligente real** — basado en comportamiento histórico (no solo visitas)
- **Spotify OAuth real** — flujo completo de autorización y sincronización
- **demo@mylifeos.lat** — crear en Firebase PRODUCCIÓN con `is_pro: true` para mockup iPhone

---

*Próxima sesión: verificar QA post-Batch 13, revisar análisis deep, planear Batch 14.*
