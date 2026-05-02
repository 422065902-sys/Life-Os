# CODEX_BATCH_13.md
# Batch 13 — Correcciones (22 imágenes revisión funcional)
# Generado: 2026-05-01 | Actualizado: 2026-05-02

---

## ⚡ ESTADO AL 2026-05-02 — LEER ANTES DE EMPEZAR

### ✅ YA IMPLEMENTADO (no tocar)
- **i18n ES/EN** — toggle en topbar (`#lang-btn`) y landing nav (`#lp-lang-btn`). `window.APP_LANG` default = 'en'. `TRANSLATIONS_EN` (~60 frases ES→EN), `TRANSLATIONS_ES` (~80 frases EN→ES). `applyLang()` TreeWalker. `_startLangObserver()` MutationObserver debounced 120ms. `toggleLang()` — EN: reload, ES: apply en el momento.
- **Landing reescrita en inglés** — todo el copy es inglés natural (no traducción literal). Precios: `$2.49 USD/month` (Edu), `$4.99 USD/month` (Pro). Al cambiar a ES → precios cambian a `$49 MXN/mes` / `$99 MXN/mes`.
- **Mockup iPhone real** — `<img id="landing-mockup-img">` en lugar del mockup CSS. EN: `images/mockup-en.png` | ES: `images/mockup-es.jpg`. Container `.lp-iphone` tiene `overflow:hidden; border-radius:42px` para clip nativo.
- **`renderDashboardHeader()` lang-aware** — saludos, día de la semana y mes en el idioma activo.
- **FAB CSS base** — `#fab-btn { bottom: calc(env(safe-area-inset-bottom,0px) + 78px) }`. Todos los `@supports` overrides actualizados a 78px. Commit `db29ddf2` en producción.
- **Batch 13A (sesión anterior)** — landing CTA color, wizard registro pasos 2-3, barras auth quitadas, onboarding color picker post-XP/Aura, mobile topbar badges, radar mobile, landing mobile botones, hábitos grid 2x2, financiero tarjetas equilibradas, nexus sin Pro cards, análisis grid 2x2, fix `#panel-analisis` flex, leaderboard sin hardcodes, Núcleo Personal→Análisis / Núcleo Global→Nexus.

### ⚠️ PENDIENTE / BUGS ACTIVOS (screenshot 2026-05-02)

**FAB aún se solapa con el bottom nav en iPhone 16** — ver screenshots en este mensaje. El CSS dice 78px pero en el dispositivo el FAB queda al mismo nivel que los iconos del nav. Posible causa: el `.lp-iphone` o un contenedor padre tiene `transform` o `position:relative` que crea un nuevo stacking context y hace que el `position:fixed` del FAB se relativice. Verificar también que `#bottom-nav` tiene su `bottom` correcto y que la altura real del pill es ~52px. Si sigue sin funcionar, incrementar a `90px`.

**Traducción incompleta en modo EN** — en las screenshots, el dashboard en EN mode muestra texto mixto:
- "AI Twin activo — Conoce tu…" → debe traducirse a "AI Twin active — Know your…"
- "Finance **estable** Saldo:" → "Finance **stable** Balance:"
- "Habitos 4/6 Bateria: 67%." → "Habits 4/6 Battery: 67%."
- "Tareas **libre** No pending tasks." → "Tasks **free** No pending tasks." o mejor "Tasks **clear**"
- Headers de tarjetas: "ESTADO FÍSICO", "SALDO PERSONAL", "TAREAS DE TODAY" → deben estar en inglés
- "TAREAS DE TODAY" es mezcla incorrecta — debe ser "TASKS TODAY"
Estos strings se generan dinámicamente en `renderDashboardHeader()` y en las funciones de render de las mini-cards del dashboard. Verificar que están en `TRANSLATIONS_EN`.

### 🚫 NO TOCAR (producción live)
- `life-os-prod-3a590` Firebase — deploy solo con autorización explícita del usuario
- `.env` y `firebase-adc.json` — no modificar rutas ni contenido
- `scripts/runner.js`, `analyze.js`, `analyze-deep.js` — no tocar
- `images/mockup-en.png`, `images/mockup-es.jpg` — archivos reales, no regenerar

---

> **REGLAS ABSOLUTAS antes de tocar cualquier línea:**
> - Archivos: solo `main.js` y `styles.css` — no crear nuevos archivos JS
> - No gamificar Financiero (sin XP, sin Aura, sin gainXP en ese módulo)
> - No tocar Firebase producción `life-os-prod-3a590`
> - No eliminar funciones existentes — solo modificar o extender
> - Cada fix debe pasar sin errores de consola
> - Correr en orden: 13A → 13B → 13C → deploy staging

---

## GRUPO 13A — BUGS CRÍTICOS (prioridad máxima)

### A1 — FAB botón tapa contenido del dashboard
**IMAGEN 1 evidencia:** El botón `+` aparece encima del círculo "S" (Sábado) de Racha Semanal en el dashboard principal.
**IMAGEN 2 evidencia:** En agenda el FAB tapa la lista de actividades vencidas.
**IMAGEN 11 evidencia:** En Financiero el FAB tapa la zona de transacciones.
**Usuario pidió explícitamente:** "bajarlo más".

**Causa:** El FAB usa `position: fixed` con `bottom` insuficiente. Al hacer scroll el botón queda superpuesto sobre tarjetas del dashboard.

**Dónde buscar en `styles.css`:**
```
Buscar: #fab-btn
Buscar: .fab-btn
Buscar: btn-fab
```

**Cambio exacto en CSS — bajar el FAB:**
```css
/* ANTES (aproximado — valor actual desconocido, buscar y reemplazar) */
#fab-btn {
  position: fixed;
  bottom: 24px;   /* ← este valor, sea cual sea, reducirlo */
  right: 24px;
}

/* DESPUÉS — más cerca del borde inferior de la pantalla */
#fab-btn {
  position: fixed;
  bottom: 10px;
  right: 24px;
  z-index: 900;   /* menor que modales (1000+) para no tapar diálogos */
}
```

**Verificación adicional en `main.js`:**
- Función `updateFABVisibility()` línea ~7548
- Buscar: `fab-btn`, `fab-hidden`
- Asegurarse de que el elemento `#fab-btn` sea hijo directo de `<body>` o del contenedor raíz — nunca hijo de una tarjeta, card o panel

**Criterio de aceptación:**
- El FAB (+) nunca tapa círculos de Racha Semanal al hacer scroll
- El FAB nunca tapa gráficas en Análisis
- El FAB nunca tapa la lista de Agenda
- El botón sigue siendo clickeable y abre la consola FAB normalmente

---

### A2 — Financiero: tooltip encima de dona + grid saldos en columna
**IMAGEN 11 evidencia:**
- Tooltip "Categoriza tus gastos para ver insights reales" aparece ENCIMA de la dona de Gastos Personales, tapando la gráfica circular
- "AGENCIA" ($0) aparece en fila vertical DEBAJO de "Saldo Personal", en lugar de columna horizontal al lado

**Causa A — Tooltip sobre dona:**
El elemento tooltip está dentro del mismo contenedor de la dona con `position: absolute` o margin negativo, superponiéndose sobre el canvas de la gráfica.

**Dónde buscar:**
```
En main.js: buscar "Categoriza tus gastos"
En main.js: buscar renderFinanciero  o  page-financial  o  finance-donut  o  gastos-dona
En index.html: buscar "Categoriza tus gastos" (puede ser HTML estático)
```

**Cambio A — Mover tooltip DEBAJO de la dona:**
Encontrar el elemento que contiene "Categoriza tus gastos para ver insights reales".
Moverlo fuera del wrapper de la dona, colocarlo como `<p>` después del canvas:

```html
<!-- ANTES (estructura incorrecta — tooltip dentro del contenedor dona) -->
<div class="donut-wrapper">
  <canvas id="finance-donut"></canvas>
  <div class="donut-tip">Categoriza tus gastos...</div>   ← PROBLEMA
</div>

<!-- DESPUÉS (estructura correcta — texto fuera y debajo) -->
<div class="donut-wrapper">
  <canvas id="finance-donut"></canvas>
</div>
<p style="margin-top:8px; font-size:12px; opacity:0.65; text-align:center; padding:0 8px;">
  Categoriza tus gastos para ver insights reales
</p>
```

Si se genera en JS, buscar la cadena y mover el elemento al lugar correcto en el DOM con:
```javascript
donutWrapper.insertAdjacentHTML('afterend', '<p class="finance-tip">Categoriza tus gastos para ver insights reales</p>');
```

**Causa B — Grid saldos en columna:**
Los saldos extra (Agencia, etc.) se renderizan en flujo vertical (block) en lugar de grid horizontal.

**Dónde buscar en `main.js`:**
- Función `renderExtraSaldos()` línea ~6826
- Buscar: `saldos-grid`, `extra-saldos`, `renderExtraSaldos`, `saldo-card`

**Cambio B — Grid horizontal en `styles.css`:**
```css
/* Buscar el selector real del grid de saldos y cambiarlo */
#saldos-grid,
.finance-saldos-grid,
.saldos-container {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
  align-items: start;
}

@media (max-width: 768px) {
  #saldos-grid,
  .finance-saldos-grid,
  .saldos-container {
    grid-template-columns: 1fr;
  }
}
```

Si en `main.js` el contenedor de saldos tiene estilos inline (`style="display:flex;flex-direction:column"` o similar), cambiarlo a:
```javascript
saldosContainer.style.cssText = 'display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:16px;';
```

**Causa C — XP en Financiero:**
Buscar en `main.js` cualquier `gainXP(` o `awardXP(` dentro del contexto de funciones financieras (agregar transacción, registrar deuda, vincular tarjeta) y eliminar esas llamadas.

```
Buscar en contexto de: addTransaction, registerDebt, saveTransaction, linkCard, addSaldo
Si hay gainXP( o awardXP( → eliminar esa línea
```

Financiero NO gamifica — es módulo neutral de datos.

**Criterio de aceptación:**
- La dona de Gastos Personales se ve completamente limpia, sin texto superpuesto
- El texto auxiliar "Categoriza tus gastos..." aparece debajo de la dona
- Saldo Personal y Agencia aparecen en la misma fila horizontal (grid)
- Si se agrega un tercer saldo, fluye en la misma fila hasta llenar el grid
- No hay `gainXP` ni `awardXP` en ninguna acción del módulo Financiero

---

### A3 — Ajustes: contradicción Pro activo vs Modo Prueba
**IMAGEN 22 evidencia:**
- Badge "LIFE OS PRO" en la sección de cuenta (arriba de Ajustes)
- La misma pantalla muestra más abajo: "MODO PRUEBA — 30 días restantes" + botón "Activar Pro — $99/mes"
- Un usuario no puede ser Pro activo Y estar en modo de prueba simultáneamente

**Causa:** La función `_updateSaasSubscriptionUI()` (línea ~3504) no está cubriendo correctamente el estado `is_pro = true`. Puede que haya dos bloques de código independientes mostrando el estado Pro y el estado Trial sin coordinarse.

**Dónde buscar en `main.js`:**
```
Buscar: _updateSaasSubscriptionUI
Buscar: settings-pro-section
Buscar: saas-plans-section
Buscar: saas-pro-active-card
Buscar: is_pro
Buscar: S.plan
Buscar: "MODO PRUEBA"   o   "Modo Prueba"   o   trial
Buscar: "Activar Pro"   o   "Activar Pro —"
```

**Lógica correcta — reemplazar el cuerpo de `_updateSaasSubscriptionUI()`:**

```javascript
function _updateSaasSubscriptionUI() {
  // Fuente de verdad única: is_pro y plan
  const isPro   = S.is_pro === true || S.plan === 'pro';
  const isTrial = !isPro && (S.plan === 'trial' || S.trialActive === true);
  const isFree  = !isPro && !isTrial;

  // Referencias a elementos del DOM
  const proActiveCard  = document.getElementById('saas-pro-active-card');
  const plansSection   = document.getElementById('saas-plans-section');
  const settingsPro    = document.getElementById('settings-pro-section');
  const trialBadge     = document.getElementById('saas-trial-badge');
  const trialDaysEl    = document.getElementById('saas-trial-days');
  // Buscar el botón "Activar Pro" por texto o ID
  const activarBtn     = document.querySelector('#btn-activar-pro, [onclick*="activarPro"], [onclick*="openStripe"]');

  if (isPro) {
    // PRO ACTIVO: mostrar tarjeta activa, ocultar TODO lo de trial/activación
    if (proActiveCard) proActiveCard.style.display = '';
    if (plansSection)  plansSection.style.display  = 'none';
    if (settingsPro)   settingsPro.style.display   = 'none';  // oculta sección con botón "Activar Pro"
    if (trialBadge)    trialBadge.style.display     = 'none';
    if (activarBtn)    activarBtn.style.display     = 'none';

  } else if (isTrial) {
    // TRIAL: mostrar días restantes y botón de activar, ocultar tarjeta Pro activo
    if (proActiveCard) proActiveCard.style.display = 'none';
    if (plansSection)  plansSection.style.display  = '';
    if (settingsPro)   settingsPro.style.display   = '';
    if (trialBadge)    trialBadge.style.display    = '';
    if (activarBtn)    activarBtn.style.display    = '';
    // Actualizar días restantes si existe el elemento
    if (trialDaysEl && S.trialDaysLeft !== undefined) {
      trialDaysEl.textContent = S.trialDaysLeft + ' días restantes';
    }

  } else {
    // FREE: mostrar planes de activación, ocultar todo de Pro/Trial
    if (proActiveCard) proActiveCard.style.display = 'none';
    if (plansSection)  plansSection.style.display  = '';
    if (settingsPro)   settingsPro.style.display   = '';
    if (trialBadge)    trialBadge.style.display    = 'none';
    if (activarBtn)    activarBtn.style.display    = '';
  }
}
```

**Asegurar que se llama en el momento correcto:**
Buscar dónde se abre la página de Ajustes:
```
Buscar: openPage('settings')  o  showTab('settings')  o  page-settings
```
Agregar al final de esa función: `_updateSaasSubscriptionUI();`

También llamarla cuando cambia `S.plan` o `S.is_pro` (al cargar datos de Firestore del usuario).

**Criterio de aceptación:**
- Si `S.is_pro === true`: SOLO aparece "Pro Activo" — no aparece "Modo Prueba", no aparece "Activar Pro"
- Si `S.plan === 'trial'`: aparece días restantes + botón activar — no aparece badge Pro
- Si `S.plan === 'free'` o nada: solo aparece opción de activar
- El usuario QA (`qa-test@mylifeos-staging.com` con `is_pro:true`) debe ver SOLO "Pro Activo" en Ajustes

---

### A4 — Núcleo Global muestra datos personales del usuario
**IMAGEN 20 evidencia (tab Nexus):** Núcleo Global muestra:
- 13% (con 15/16 completados)
- "Completa 101 hábitos más para activar x2 XP"
- Stats: 15/95 Hábitos · 0/21 Tareas · 449 XP HOY · 3d Racha

**IMAGEN 14 evidencia (tab Análisis):** Núcleo Personal muestra exactamente los mismos números: 15/95, 0/21, 449 XP.

**Conclusión:** Núcleo Global está usando `S.habits`, `S.tasks`, `S.xp` del estado local — los datos personales del usuario, no datos agregados de la comunidad.

**Dónde buscar en `main.js`:**
- Función `updateGlobalCore()` línea ~8110
- Buscar: `updateGlobalCore`, `nucleo-global`, `nucleoGlobal`, `Vista Global`

**Cambio — `updateGlobalCore()` debe usar datos de comunidad:**

```javascript
// Variable global para cachear datos de comunidad
window._globalCoreData = null;

async function loadGlobalCoreData() {
  // Solo cargar una vez por sesión (o cuando el usuario abre Nexus)
  if (window._globalCoreDataLoaded) return;
  window._globalCoreDataLoaded = true;

  try {
    const db = firebase.firestore();
    const todayStr = new Date().toISOString().split('T')[0];

    // Consultar userDirectory para usuarios activos hoy
    // Usar campo lastActive o lastCheckIn — buscar el campo existente
    const snap = await db.collection('userDirectory')
      .where('lastActive', '==', todayStr)  // ajustar al campo real
      .get();

    if (snap.empty) {
      // Intentar con campo alternativo
      const snap2 = await db.collection('userDirectory').limit(20).get();
      // Contar usuarios con actividad reciente (últimas 24h)
      let activos = 0, totalHabitos = 0, totalXP = 0;
      snap2.forEach(doc => {
        const d = doc.data();
        // Verificar si tuvo actividad hoy
        const lastUpdate = d.lastUpdate || d.updatedAt || '';
        if (lastUpdate.startsWith(todayStr)) {
          activos++;
          totalHabitos += d.habitsToday || 0;
          totalXP      += d.xpToday    || d.xp || 0;
        }
      });
      window._globalCoreData = { activos, totalHabitos, totalXP };
    } else {
      let totalHabitos = 0, totalXP = 0;
      snap.forEach(doc => {
        const d = doc.data();
        totalHabitos += d.habitsToday || 0;
        totalXP      += d.xpToday    || 0;
      });
      window._globalCoreData = {
        activos: snap.size,
        totalHabitos,
        totalXP
      };
    }

    updateGlobalCore(); // re-renderizar con datos reales

  } catch(e) {
    console.warn('[GlobalCore] Error cargando datos comunidad:', e);
    // Mostrar estado neutro — nunca usar datos de S.
    window._globalCoreData = { activos: 0, totalHabitos: 0, totalXP: 0 };
    updateGlobalCore();
  }
}

function updateGlobalCore() {
  // CRÍTICO: Núcleo Global = datos de la COMUNIDAD, nunca de S. (usuario actual)
  const data = window._globalCoreData;

  // Elementos del DOM — buscar IDs reales en el HTML
  const pctEl     = document.getElementById('nucleo-global-pct');
  const subtEl    = document.getElementById('nucleo-global-sub');
  const habitStat = document.getElementById('lb-stat-habits');  // o el ID real
  const xpStat    = document.getElementById('lb-stat-xp');
  const userStat  = document.getElementById('lb-stat-users');

  if (!data) {
    // Sin datos todavía: mostrar carga
    if (pctEl)  pctEl.textContent  = '—';
    if (subtEl) subtEl.textContent = 'Cargando datos globales...';
    loadGlobalCoreData(); // disparar carga
    return;
  }

  // Mostrar datos GLOBALES (no personales)
  if (pctEl) {
    pctEl.textContent = data.activos + (data.activos === 1 ? ' usuario activo' : ' usuarios activos');
  }
  if (subtEl) {
    subtEl.textContent = data.totalHabitos + ' hábitos completados en la comunidad hoy';
  }

  // Stats bar inferior — COMUNITARIOS
  if (habitStat) habitStat.textContent = data.totalHabitos + ' hábitos globales';
  if (xpStat)    xpStat.textContent    = data.totalXP + ' XP total comunidad';
  if (userStat)  userStat.textContent  = data.activos + ' activos hoy';
}
```

**Llamar `loadGlobalCoreData()` cuando el usuario abre Nexus:**
```
Buscar: tab === 'nexus'  o  openNexus  o  showNexus  o  'nexus' en switch/if de navegación
→ Agregar al inicio del bloque: loadGlobalCoreData();
```

**NOTA:** Si los campos en Firestore `userDirectory` no existen aún (`habitsToday`, `xpToday`, `lastActive`), la función fallará silenciosamente y mostrará "0 usuarios activos" — eso es correcto y honesto. NO mostrar datos de `S.` como fallback.

**Criterio de aceptación:**
- Núcleo Global NO muestra los mismos números que Núcleo Personal
- El copy habla de "comunidad", "global", "usuarios" — no de "tus hábitos" ni "tu XP"
- Si no hay datos Firestore: muestra "— usuarios activos" o "Cargando..." — nunca datos de `S.`
- El texto "Completa 101 hábitos más para activar x2 XP" debe desaparecer o cambiarse por algo comunitario como "La comunidad activa el x2 XP al superar 1000 hábitos diarios"

---

### A5 — Análisis: tooltip de Núcleo Global en columna angosta
**IMAGEN 15 evidencia:** Aparece un bloque de texto largo en columna muy angosta superpuesto sobre el Núcleo Personal. El texto dice "El Núcleo Global mide tu actividad del día: si llegas al estado Completo ganas x2 XP en todo, en Flujo x1.5 — si caes a 0% pierdes 50 XP automática..." — es un tooltip o coachmark mal posicionado.

**Causa:** Un elemento de ayuda/información tiene `position: absolute` o `position: fixed` dentro de un contenedor sin `overflow: hidden`, y su `width` no está definido, colapsando en la anchura mínima del texto.

**Dónde buscar en `main.js`:**
```
Buscar: "mide tu actividad del día"
Buscar: "x2 XP en todo"
Buscar: nucleo-tip   o   nucleo-tooltip   o   nucleo-help   o   nucleo-info
Buscar: "? " cerca de nucleoGlobal   (puede ser un botón de ayuda)
```

**Cambio — Convertir en bloque de texto normal:**
Eliminar el posicionamiento absoluto del tooltip y convertirlo en un párrafo descriptivo simple dentro del flujo del layout:

```javascript
// ANTES (tooltip posicionado, causa el problema):
`<div class="nucleo-tooltip" style="position:absolute; ...">
   El Núcleo Global mide tu actividad...
 </div>`

// DESPUÉS (párrafo en flujo normal, sin posición absoluta):
`<p class="nucleo-desc" style="
  font-size: 12px;
  opacity: 0.65;
  margin: 6px 0 14px;
  line-height: 1.5;
  max-width: 100%;     /* nunca más angosto que el contenedor */
">
  Actividad colectiva de la comunidad Life OS hoy.
  Llegar al 100% global desbloquea bonificaciones de XP para todos los usuarios.
</p>`
```

Si hay un botón `?` que dispara un popover:
```css
/* Asegurar que el popover tenga ancho fijo */
.nucleo-help-popover,
.nucleo-tooltip {
  position: absolute;
  width: 280px !important;   /* ancho fijo — nunca min-content */
  max-width: min(280px, 90vw);
  z-index: 200;
  background: var(--card-bg, #1a1a2e);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px 16px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.4);
  /* Posicionar correctamente — no dejar que auto-colapse */
}
```

**Criterio de aceptación:**
- No aparece texto en columna angosta superpuesto sobre el Núcleo Personal
- Si hay tooltip/ayuda, aparece con ancho adecuado (≥240px) al hacer click en `?`
- El tab Análisis no tiene elementos de texto cortados o colapsados

---

### A6 — Agenda: "Próximas Actividades" muestra items vencidos
**IMAGEN 9 evidencia:** TODAS las entradas en "Próximas Actividades" muestran "Vencida 2026-04-17" — hay 9+ items todos del mismo día pasado, mezclados como si fueran próximos.

**Nota:** Este fix estaba en Batch 12 (A1, commit `013b756a`) pero el VPS no fue sincronizado. Verificar que el código actual en `main.js` tenga el filtro correcto — si no, implementarlo.

**Dónde buscar en `main.js`:**
- Función `renderUpcomingList()` línea ~3210
- Buscar: `upcoming-list`, `PENDIENTES ATRASADAS`, `Vencida`, `proximasActividades`

**Verificar/implementar filtro correcto:**
```javascript
function renderUpcomingList() {
  const el = document.getElementById('upcoming-list');
  if (!el) return;
  const todayStr = today(); // 'YYYY-MM-DD'

  const items = [];
  // Recolectar tareas
  (S.tasks || []).filter(t => !t.deleted && !t.done && t.date).forEach(t => {
    items.push({ date: t.date, time: t.time || '', label: escHtml(t.name), type: 'task', id: t.id });
  });
  // Recolectar eventos de calendario (no hábitos, no registros de cuerpo)
  Object.entries(S.calEvents || {}).forEach(([date, evts]) => {
    (evts || []).forEach(ev => {
      if (!ev.done) items.push({ date, label: escHtml(ev.name), type: 'event' });
    });
  });

  // SEPARAR próximas de vencidas
  items.sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));

  const proximas = items.filter(i => i.date >= todayStr);     // hoy en adelante
  const vencidas = items.filter(i => i.date  < todayStr);     // antes de hoy

  let html = '';

  if (proximas.length === 0 && vencidas.length === 0) {
    html = '<p style="opacity:0.5; padding:16px; font-size:13px;">Sin actividades próximas.</p>';
  }

  if (proximas.length > 0) {
    html += proximas.slice(0, 8).map(i => renderUpcomingItem(i, false)).join('');
  }

  if (vencidas.length > 0) {
    html += `<div style="
      font-size:11px; font-weight:700; letter-spacing:1px; opacity:0.7;
      color: #ff6b6b; margin: 14px 0 8px; text-transform:uppercase;
    ">⚠️ PENDIENTES ATRASADAS</div>`;
    html += vencidas.slice(0, 5).map(i => renderUpcomingItem(i, true)).join('');
    if (vencidas.length > 5) {
      html += `<p style="font-size:11px; opacity:0.5; padding:4px 0;">
        + ${vencidas.length - 5} más atrasadas
      </p>`;
    }
  }

  el.innerHTML = html;
}
```

**IMPORTANTE — Hábitos y registros de Cuerpo NO deben aparecer aquí:**
Los registros de dormir, agua, meditar, entrenar pertenecen a los módulos Hábitos y Cuerpo.
Solo deben aparecer en Agenda: `S.tasks` (con fecha) y `S.calEvents`.
Si hay código que mete `S.habits` en `items`, eliminarlo de esta función.

**Criterio de aceptación:**
- "Próximas Actividades" no muestra ningún item con fecha anterior a hoy
- Los items vencidos (fecha < hoy) aparecen bajo el encabezado "⚠️ PENDIENTES ATRASADAS" en rojo
- Hábitos (dormir, agua, meditar, entrenar) NO aparecen en esta lista
- Máximo 5 vencidas visibles con indicador de cuántas más hay

---

## GRUPO 13B — FIXES VISUALES IMPORTANTES

### B1 — Enfoque Mental: layout horizontal en PC
**IMAGEN 3 evidencia (zoomed):** El anillo "90% FOCUS" aparece arriba y las barras (Claridad Mental 95%, Energía Física 100%, Productividad 73%) aparecen debajo — layout totalmente vertical que desperdicia espacio horizontal en PC.
**IMAGEN 8 evidencia:** Zoom confirma: círculo full-width arriba, barras debajo.

**Dónde buscar en `styles.css`:**
```
Buscar: .focus-card   o   #panel-enfoque   o   .enfoque-content
Buscar: .focus-ring   o   .focus-bars   o   enfoque-mental
```

**Dónde buscar en `main.js`:**
```
Buscar: enfoque-mental   o   Claridad Mental   o   focusCard   o   renderFocusCard
```

**Cambio en `styles.css` — layout horizontal para PC:**
```css
/* Contenedor del contenido interno de la tarjeta Enfoque Mental */
/* Usar el selector real que exista — uno de estos: */
.focus-card .card-body,
.enfoque-card-content,
#panel-enfoque > .card > div:last-child,
.focus-inner-layout {
  display: grid;
  grid-template-columns: 180px 1fr;   /* anillo fijo izquierda, barras derecha */
  gap: 24px;
  align-items: center;
}

@media (max-width: 768px) {
  .focus-card .card-body,
  .enfoque-card-content,
  #panel-enfoque > .card > div:last-child,
  .focus-inner-layout {
    grid-template-columns: 1fr;       /* en móvil: columna única */
  }
}
```

**Si el HTML se genera en JS**, agregar un wrapper con clase:
```javascript
// ANTES:
`<div class="focus-ring">${ringHTML}</div>
 <div class="focus-bars">${barsHTML}</div>`

// DESPUÉS:
`<div class="focus-inner-layout">
   <div class="focus-ring-col">${ringHTML}</div>
   <div class="focus-bars-col">${barsHTML}</div>
 </div>`
```

Y en `styles.css`:
```css
.focus-inner-layout {
  display: grid;
  grid-template-columns: 180px 1fr;
  gap: 24px;
  align-items: center;
}
@media (max-width: 768px) {
  .focus-inner-layout { grid-template-columns: 1fr; }
}
```

**Criterio de aceptación:**
- En PC (≥768px): el anillo y las barras están lado a lado
- El anillo ocupa ~180px de ancho (no más de 220px)
- Las barras (Claridad, Energía, Productividad) llenan el espacio restante
- En móvil (<768px): se apilan verticalmente como antes
- El porcentaje "90%" sigue siendo el elemento más prominente

---

### B2 — Racha Semanal: círculos demasiado separados
**IMAGEN 4 evidencia (zoomed):** Los 7 círculos L/M/M/J/V/S/D tienen spacing excesivo — están distribuidos con `justify-content: space-between` que los empuja a los extremos dejando espacios enormes entre M y J, etc.
**IMAGEN 9 evidencia:** En contexto del dashboard se confirma el problema.

**Dónde buscar en `styles.css`:**
```
Buscar: .streak-days   o   .racha-days   o   streak-day   o   racha-semanal
```

**Dónde buscar en `main.js`:**
```
Buscar: renderWeekStreak   o   streak-day   o   racha-days   o   L M M J V S D
```

**Cambio en `styles.css`:**
```css
/* Contenedor de los 7 días de racha */
.streak-days,
.racha-days-row,
.week-dots-row {
  display: flex;
  gap: 8px;                        /* gap fijo pequeño — NO justify-between */
  align-items: center;
  justify-content: flex-start;     /* NO space-between ni space-around */
  flex-wrap: nowrap;
}

/* Cada círculo individual */
.streak-day,
.racha-day-dot,
.week-dot {
  width: 34px;
  height: 34px;
  flex-shrink: 0;                  /* no se comprima */
  /* sin margin extra */
}
```

**Si los círculos tienen `style="flex:1"` o `margin:auto` en JS**, buscar y eliminar esos estilos inline.

**Criterio de aceptación:**
- Los 7 círculos están agrupados con gap uniforme de ~8px entre ellos
- No hay espacios muertos entre días
- El chip "Hecho ✅" no altera el spacing de los círculos
- En la imagen resultante los 7 círculos se ven como una unidad compacta

---

### B3 — Nexus/Leaderboard: tarjeta "Pro Activo" ocupa todo el espacio superior
**IMAGEN 21 evidencia:** La tarjeta "LIFE OS PRO ACTIVO — Tu suscripción está activa. Tienes acceso completo a todos los módulos y funciones premium." ocupa toda la parte superior del tab Nexus con badge "ACTIVO" grande. El leaderboard queda desplazado hacia abajo.

**Problema de producto:** Nexus debe ser la pantalla social/comunitaria — el leaderboard debe ser lo primero visible.

**Dónde buscar en `main.js`:**
```
Buscar: saas-pro-active-card   o   PRO ACTIVO   o   renderNexus   o   renderSaasPage
Buscar: tab-nexus   o   page-saas   o   id="saas"
```

**Cambio — eliminar tarjeta grande de Pro del inicio de Nexus:**

Opción recomendada: Ocultar completamente la tarjeta grande en Nexus. La información completa de Pro vive en Ajustes → Cuenta.

```javascript
// En la función que abre/renderiza el tab Nexus o la página de Análisis:
// Buscar: renderNexus()  o  el bloque que construye el HTML de nexus

// Si la tarjeta se genera condicionalmente, cambiar para que NO aparezca en Nexus:
// ANTES:
if (S.is_pro) {
  html += proActiveCardHTML;  // ← quitar esto de Nexus
}

// DESPUÉS: solo badge pequeño, no tarjeta completa
if (S.is_pro) {
  html += `<div style="display:inline-flex; align-items:center; gap:6px; margin-bottom:16px;">
    <span style="background:#f59e0b; color:#000; font-size:10px; font-weight:700;
                 padding:3px 8px; border-radius:12px;">★ PRO ACTIVO</span>
  </div>`;
}
```

Si la tarjeta es un elemento HTML estático con id `saas-pro-active-card`:
```javascript
// Al abrir la pestaña Nexus, ocultar la tarjeta grande
const proCard = document.getElementById('saas-pro-active-card');
if (proCard) proCard.style.display = 'none';  // en Nexus siempre oculta
```

**Criterio de aceptación:**
- Al abrir Nexus, lo primero visible es el Leaderboard Semanal
- No hay tarjeta grande de Pro Activo en Nexus
- Si el usuario es Pro, hay como máximo un badge pequeño (≤30px altura) near el título
- La tarjeta completa de "Pro Activo" solo aparece en Ajustes → Cuenta

---

### B4 — Leaderboard: reemplazar mock data por Firestore real
**IMAGEN 21 evidencia:** El ranking muestra WM_OS (920 XP), AlphaX (870 XP), DriveOS (810 XP), NovaMind (760 XP) — estos son datos hardcodeados en `LEADERBOARD_DATA`, no usuarios reales.

**Dónde buscar en `main.js`:**
- Función `renderLeaderboard()` línea ~5833
- Función `loadLeaderboardFromFirestore()` línea ~5813
- Buscar: `LEADERBOARD_DATA`, `window._lbData`, `WM_OS`, `AlphaX`

**Cambio en `loadLeaderboardFromFirestore()`:**
```javascript
async function loadLeaderboardFromFirestore() {
  try {
    const db = firebase.firestore();

    // Opción 1: ordenar por xpWeekly si existe el campo
    let snap = await db.collection('userDirectory')
      .orderBy('xpWeekly', 'desc')
      .limit(10)
      .get();

    // Si xpWeekly no existe, fallback a xp total
    if (snap.empty) {
      snap = await db.collection('userDirectory')
        .orderBy('xp', 'desc')
        .limit(10)
        .get();
    }

    if (snap.empty) {
      // Sin otros usuarios reales: solo mostrar al usuario actual
      window._lbData = [];
      renderLeaderboard();
      return;
    }

    const uid = S.uid || S.userId;
    window._lbData = snap.docs
      .filter(doc => doc.id !== uid)  // excluir al usuario actual (se agrega en renderLeaderboard)
      .map(doc => {
        const d = doc.data();
        return {
          alias:  d.displayName || d.publicId || 'Usuario',
          nivel:  d.level || 1,
          xp:     d.xpWeekly || d.xp || 0,
          racha:  d.streak || d.checkInStreak || 0,
          uid:    doc.id
        };
      });

    renderLeaderboard();

  } catch(e) {
    console.warn('[Leaderboard] Error cargando Firestore:', e);
    // Fallback: solo el usuario actual, sin mocks
    window._lbData = [];
    renderLeaderboard();
  }
}
```

**Cambio en `renderLeaderboard()`:**
```javascript
function renderLeaderboard() {
  const tbody = document.getElementById('lb-tbody');
  if (!tbody) return;

  const miXP    = S.xpWeekly || (S.xp % 1000) || 0;
  const miEntry = {
    alias:     'Tú ★',
    nivel:     S.level || 1,
    xp:        miXP,
    racha:     S.checkInStreak || 0,
    esUsuario: true
  };

  // Usar SOLO datos de Firestore — NUNCA LEADERBOARD_DATA en staging/prod
  const otrosUsuarios = window._lbData || [];
  const todos = [miEntry, ...otrosUsuarios]
    .sort((a, b) => b.xp - a.xp)
    .slice(0, 10);

  tbody.innerHTML = todos.map((r, i) => `
    <tr style="${r.esUsuario ? 'background:rgba(0,229,255,.06)' : ''}">
      <td><span style="font-weight:900">${i===0?'🥇':i===1?'🥈':i===2?'🥉':'#'+(i+1)}</span></td>
      <td><span style="font-weight:700${r.esUsuario?';color:var(--accent)':''}">${r.alias}</span></td>
      <td><span class="badge" style="font-size:10px">Nv.${r.nivel}</span></td>
      <td><span style="font-size:12px">${r.xp} XP</span></td>
      <td><span style="color:#ff6b35;font-size:12px">🔥${r.racha}d</span></td>
    </tr>
  `).join('');

  // Si solo está el usuario actual (sin otros reales), mostrar mensaje informativo
  if (otrosUsuarios.length === 0) {
    tbody.innerHTML += `
      <tr><td colspan="5" style="text-align:center; opacity:0.5; font-size:12px; padding:16px;">
        Sé el primero en el ranking — invita a otros usuarios
      </td></tr>`;
  }
}
```

**ELIMINAR cualquier referencia a `LEADERBOARD_DATA` en el path de producción:**
```
Buscar: LEADERBOARD_DATA
→ Si está definido con usuarios ficticios (WM_OS, AlphaX, etc.), puede mantenerse
  SOLO como fallback de desarrollo, pero nunca debe usarse si hay datos de Firestore.
→ En renderLeaderboard(): reemplazar   window._lbData || LEADERBOARD_DATA
  por simplemente                      window._lbData || []
```

**Criterio de aceptación:**
- El leaderboard carga datos de Firestore `userDirectory`
- No aparecen WM_OS, AlphaX, DriveOS, NovaMind ni ningún alias hardcodeado
- "Tú ★" siempre aparece resaltado con fondo tenue
- Si no hay otros usuarios reales: solo aparece "Tú ★" + mensaje de invitación
- `loadLeaderboardFromFirestore()` se llama al abrir el tab Nexus

---

### B5 — Hábitos: selector de días activos
**IMAGEN 8 evidencia:** Todos los hábitos muestran dots de semana idénticos sin indicación de días configurados. "Hábito sin nombre", "lectura", "gym esta mañana", "medite 15 minutos" — todos con mismos dots, todos con "Racha: 0 días".

**Nota:** Este fix estaba planificado en Batch 12 B1. Verificar si ya está implementado en `main.js`. Si no, implementarlo ahora.

**Dónde buscar en `main.js`:**
```
Buscar: activeDays   o   active-days   o   diasActivos
Buscar: renderHabitForm   o   openAddHabit   o   modal-add-habit   o   addHabitForm
Buscar: L M X J V S D   (el selector de días si ya existe)
```

**Si NO existe el selector de días, agregar al formulario de crear/editar hábito:**

En la función que genera el HTML del modal de hábito, agregar ANTES del botón guardar:
```javascript
const diasHTML = `
<div style="margin-top:14px;">
  <div style="font-size:11px; font-weight:700; opacity:0.6; letter-spacing:1px; margin-bottom:8px; text-transform:uppercase;">
    DÍAS ACTIVOS
  </div>
  <div id="habit-days-selector" style="display:flex; gap:6px;">
    ${[['L',0],['M',1],['X',2],['J',3],['V',4],['S',5],['D',6]].map(([letra, idx]) => `
      <button type="button"
        class="habit-day-btn day-active"
        data-day="${idx}"
        onclick="toggleHabitDay(this)"
        style="width:34px; height:34px; border-radius:50%; cursor:pointer;
               font-size:11px; font-weight:700; transition:all 0.2s;
               background:var(--accent); color:#000; border:none;">
        ${letra}
      </button>
    `).join('')}
  </div>
  <input type="hidden" id="habit-active-days" value="0,1,2,3,4,5,6">
</div>`;
```

```javascript
function toggleHabitDay(btn) {
  btn.classList.toggle('day-active');
  const isActive = btn.classList.contains('day-active');
  btn.style.background = isActive ? 'var(--accent)' : 'transparent';
  btn.style.border      = isActive ? 'none'          : '1px solid var(--border)';
  btn.style.color       = isActive ? '#000'          : 'inherit';
  btn.style.opacity     = isActive ? '1'             : '0.4';

  // Recalcular valor del input hidden
  const activeDays = [...document.querySelectorAll('#habit-days-selector .habit-day-btn.day-active')]
    .map(b => b.dataset.day);
  const hiddenInput = document.getElementById('habit-active-days');
  if (hiddenInput) hiddenInput.value = activeDays.join(',');
}
```

**Al guardar el hábito**, incluir `activeDays`:
```javascript
const activeDaysRaw = document.getElementById('habit-active-days')?.value || '0,1,2,3,4,5,6';
const newHabit = {
  id: genId(),
  name: nombre,
  activeDays: activeDaysRaw.split(',').map(Number).filter(n => !isNaN(n)),
  // ... demás propiedades existentes
};
```

**Al renderizar los dots semanales de cada hábito** en `renderHabits()`:
```javascript
// Para cada día (0=Lunes...6=Domingo):
const hActiveDays = h.activeDays || [0,1,2,3,4,5,6]; // default todos
const isDayInSchedule = hActiveDays.includes(dotDayIndex);

// Determinar clase del dot
let dotClass;
if (!isDayInSchedule) {
  dotClass = 'dot-inactive';   // día inactivo — dimmed
} else if (isDone) {
  dotClass = 'dot-done';       // activo y completado
} else if (isPast) {
  dotClass = 'dot-missed';     // activo pero no completado (pasado)
} else {
  dotClass = 'dot-pending';    // activo, futuro/hoy
}
```

**CSS para días inactivos en `styles.css`:**
```css
.dot-inactive {
  opacity: 0.2;
  background: transparent !important;
  border: 1px dashed var(--border) !important;
}
```

**Al calcular racha**, ignorar días inactivos:
```javascript
function getHabitStreak(habit) {
  const activeDays = habit.activeDays || [0,1,2,3,4,5,6];
  let streak = 0;
  const d = new Date();

  while (true) {
    const dayOfWeek = d.getDay();  // 0=Dom, 1=Lun, ..., 6=Sáb
    // Convertir a nuestro índice (0=Lun...6=Dom)
    const ourIdx = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

    const dateStr = d.toISOString().split('T')[0];

    if (!activeDays.includes(ourIdx)) {
      // Día inactivo — saltar sin romper racha
      d.setDate(d.getDate() - 1);
      continue;
    }

    if (habit.checkins?.[dateStr]) {
      streak++;
    } else {
      break;  // día activo no completado — racha rota
    }

    d.setDate(d.getDate() - 1);
    if (streak > 365) break;  // seguridad
  }
  return streak;
}
```

**Criterio de aceptación:**
- Al crear/editar un hábito hay selector visual de días L/M/X/J/V/S/D
- Por default todos los días están activos (cyan/accent)
- Los días inactivos se ven dimmed/punteados en la línea semanal
- Un hábito configurado solo L/M/X no pierde racha el J/V/S/D
- La racha solo cuenta días donde el hábito debería hacerse

---

## GRUPO 13C — UX Y EXPERIENCIA

### C1 — Diario Bitácora: Libro y Película visualmente idénticos a Reflexión
**IMAGEN 18 (tab Reflexión):** Victoria del día + Lección aprendida — correcto, mantener sin cambios.
**IMAGEN 19 (tab Libro):** Solo "Buscar libro..." + "Nota rápida" + "Guardar en Vitrina +25 XP".
**IMAGEN 14 (tab Película):** Idéntico: "Buscar película..." + "Nota rápida" + "Guardar en Vitrina +25 XP".

**Problema:** Libro y Película solo difieren en el placeholder del buscador. No hay experiencia diferenciada.

**Dónde buscar en `main.js`:**
```
Buscar: bit-libro   o   bitacora-tab-libro   o   ob-libro   o   tab === 'libro'
Buscar: bit-pelicula   o   bitacora-tab-pelicula   o   tab === 'pelicula'
Buscar: renderBitacoraList   (línea ~4113)
Buscar: guardarEnVitrina   o   "Guardar en Vitrina"
```

**Cambio en TAB LIBRO — agregar campo de progreso de lectura:**

Después del buscador de libros y ANTES de "Nota rápida", insertar:
```javascript
// Este bloque aparece cuando el usuario selecciona un libro del buscador
const libroExtrasHTML = `
<div id="libro-extras" style="display:none; margin-top:12px; padding:12px;
  background:var(--card-bg); border:1px solid var(--border); border-radius:10px;">

  <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">

    <!-- Estado del libro -->
    <div>
      <div style="font-size:10px; opacity:0.6; margin-bottom:4px; text-transform:uppercase; letter-spacing:0.5px;">Estado</div>
      <select id="libro-status"
        style="background:var(--input-bg,#1a1a2e); border:1px solid var(--border);
               border-radius:8px; padding:5px 10px; color:inherit; font-size:13px;">
        <option value="pendiente">📚 Por leer</option>
        <option value="leyendo">📖 Leyendo</option>
        <option value="terminado">✅ Terminado</option>
      </select>
    </div>

    <!-- Progreso de páginas -->
    <div id="libro-pages-row" style="display:flex; gap:6px; align-items:center;">
      <div>
        <div style="font-size:10px; opacity:0.6; margin-bottom:4px; text-transform:uppercase; letter-spacing:0.5px;">Pág. actual</div>
        <input type="number" id="libro-current-page" min="1" placeholder="0"
          style="width:70px; background:var(--input-bg,#1a1a2e); border:1px solid var(--border);
                 border-radius:8px; padding:5px 8px; color:inherit; font-size:13px;">
      </div>
      <span style="opacity:0.4; margin-top:16px;">/</span>
      <div>
        <div style="font-size:10px; opacity:0.6; margin-bottom:4px; text-transform:uppercase; letter-spacing:0.5px;">Total</div>
        <input type="number" id="libro-total-pages" min="1" placeholder="300"
          style="width:70px; background:var(--input-bg,#1a1a2e); border:1px solid var(--border);
                 border-radius:8px; padding:5px 8px; color:inherit; font-size:13px;">
      </div>
    </div>

  </div>
</div>`;
```

Mostrar `#libro-extras` cuando el usuario selecciona un libro del buscador:
```javascript
// En la función que maneja la selección de resultado del buscador de libros:
function onSelectLibro(bookData) {
  window._selectedBook = bookData;
  document.getElementById('libro-extras').style.display = '';
  // Precargar datos si ya existe en S.bitacora
  const existing = (S.bitacora || []).find(b => b.tipo === 'libro' && b.mediaId === bookData.id);
  if (existing) {
    document.getElementById('libro-status').value = existing.status || 'pendiente';
    document.getElementById('libro-current-page').value = existing.currentPage || '';
    document.getElementById('libro-total-pages').value = existing.totalPages || '';
  }
}
```

**Al guardar el libro**, incluir el estado y progreso:
```javascript
// En la función guardarLibroEnVitrina o guardarBitacoraLibro:
const entradaLibro = {
  tipo:        'libro',
  titulo:      window._selectedBook?.title || '',
  autor:       window._selectedBook?.author || '',
  coverUrl:    window._selectedBook?.cover || '',
  mediaId:     window._selectedBook?.id || '',
  nota:        document.getElementById('bit-nota-libro')?.value || '',
  status:      document.getElementById('libro-status')?.value || 'pendiente',
  currentPage: parseInt(document.getElementById('libro-current-page')?.value) || 0,
  totalPages:  parseInt(document.getElementById('libro-total-pages')?.value) || 0,
  fecha:       today()
};
```

**Cambio en TAB PELÍCULA — agregar selector de estado:**

Después del buscador de películas y ANTES de "Nota rápida":
```javascript
const peliculaEstadoHTML = `
<div id="pelicula-estado" style="display:none; margin-top:12px;">
  <div style="font-size:10px; opacity:0.6; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.5px;">¿La viste?</div>
  <div style="display:flex; gap:8px; flex-wrap:wrap;">
    ${[['pendiente','🎬 Pendiente'],['vista','✅ Vista'],['favorita','⭐ Favorita']].map(([val,lbl]) => `
      <button type="button"
        class="peli-estado-btn"
        data-status="${val}"
        onclick="setPeliculaEstado('${val}', this)"
        style="padding:6px 14px; border-radius:20px; cursor:pointer; font-size:12px;
               border:1px solid var(--border); background:transparent; color:inherit;
               transition:all 0.2s;">
        ${lbl}
      </button>
    `).join('')}
  </div>
</div>`;
```

```javascript
function setPeliculaEstado(status, btn) {
  window._peliculaStatus = status;
  document.querySelectorAll('.peli-estado-btn').forEach(b => {
    const isSelected = b.dataset.status === status;
    b.style.background = isSelected ? 'var(--accent)' : 'transparent';
    b.style.color      = isSelected ? '#000'          : 'inherit';
    b.style.border     = isSelected ? 'none'          : '1px solid var(--border)';
  });
}
```

**Al guardar la película**, incluir el estado:
```javascript
const entradaPelicula = {
  tipo:     'pelicula',
  titulo:   window._selectedMovie?.title || '',
  coverUrl: window._selectedMovie?.poster || '',
  mediaId:  window._selectedMovie?.id || '',
  nota:     document.getElementById('bit-nota-pelicula')?.value || '',
  status:   window._peliculaStatus || 'pendiente',
  fecha:    today()
};
```

**En `renderBitacoraList()`**, mostrar estado y progreso en las entradas existentes:
```javascript
// Para entradas de tipo libro:
if (b.tipo === 'libro') {
  let extras = '';
  if (b.currentPage && b.totalPages && b.totalPages > 0) {
    const pct = Math.round((b.currentPage / b.totalPages) * 100);
    extras = `<span style="font-size:11px; opacity:0.65;">📖 Pág.${b.currentPage}/${b.totalPages} · ${pct}%</span>`;
  }
  if (b.status === 'terminado') extras += `<span style="font-size:11px; opacity:0.65; margin-left:6px;">✅ Terminado</span>`;
  if (b.status === 'leyendo')   extras += `<span style="font-size:11px; opacity:0.65; margin-left:6px;">📖 Leyendo</span>`;
  // Añadir extras al HTML de la entrada
}

// Para entradas de tipo pelicula:
if (b.tipo === 'pelicula') {
  const statusLabel = { pendiente:'🎬', vista:'✅ Vista', favorita:'⭐ Favorita' }[b.status] || '';
  // Añadir statusLabel al HTML de la entrada
}
```

**Criterio de aceptación:**
- Tab Libro: después de seleccionar un libro aparecen selector Estado + campos Pág.actual/Total
- Tab Película: después de seleccionar una película aparecen botones de estado (Pendiente/Vista/Favorita)
- Las entradas guardadas muestran el estado y progreso en la lista
- Tab Reflexión NO cambia — sigue siendo Victoria del día + Lección aprendida
- Los tres tabs son visualmente distinguibles y tienen propósito diferente

---

### C2 — Biblioteca: mostrar colección visual, no solo formulario
**IMAGEN 16 evidencia:** Biblioteca muestra solo: dropdown tipo (Libro), campo "Título / Habilidad", campo "Autor / Nivel", botón "+ Agregar", y empty state "Tu Biblioteca está vacía". No hay lista ni colección visible de los items ya agregados.

**Dónde buscar en `main.js`:**
- Función `renderBiblioteca()` línea ~4034
- Buscar: `biblioteca-list`, `biblioteca-empty`, `biblioteca-card`

**Cambio en `renderBiblioteca()` — agregar grid de tarjetas:**
```javascript
function renderBiblioteca() {
  const el      = document.getElementById('biblioteca-list');
  const badge   = document.getElementById('xp-mental-badge');
  if (!el) return;
  if (badge) badge.textContent = 'XP Mental: ' + (S.xpMental || 0);

  const active = (S.biblioteca || []).filter(b => !b.deleted);

  if (!active.length) {
    el.innerHTML = `
      <div style="text-align:center; padding:32px 16px;">
        <div style="font-size:2.5rem; margin-bottom:12px;">📚</div>
        <p style="font-weight:600; margin-bottom:6px;">Tu Biblioteca está vacía</p>
        <p style="font-size:12px; opacity:0.6; line-height:1.5; max-width:280px; margin:0 auto;">
          Agrega libros, podcasts o recursos que estás consumiendo.<br>
          <strong>Biblioteca</strong> = tu colección personal.<br>
          <strong>Bitácora</strong> = tu experiencia y reflexiones.
        </p>
      </div>`;
    return;
  }

  // Agrupar por tipo
  const grupos = {};
  active.forEach(b => {
    const tipo = b.tipo || 'libro';
    if (!grupos[tipo]) grupos[tipo] = [];
    grupos[tipo].push(b);
  });

  const tipoIconos   = { libro:'📗', podcast:'🎙️', curso:'🎓', recurso:'🔗', habilidad:'⚡', otro:'📦' };
  const tipoLabels   = { libro:'Libros', podcast:'Podcasts', curso:'Cursos', recurso:'Recursos', habilidad:'Habilidades', otro:'Otros' };
  const statusIcons  = { pendiente:'📚', leyendo:'📖', terminado:'✅', vista:'🎬', escuchado:'🎧' };

  el.innerHTML = Object.entries(grupos).map(([tipo, items]) => `
    <div style="margin-bottom:20px;">
      <div style="font-size:11px; font-weight:700; opacity:0.5; letter-spacing:1px;
                  text-transform:uppercase; margin-bottom:10px;">
        ${tipoIconos[tipo] || '📦'} ${tipoLabels[tipo] || tipo} (${items.length})
      </div>
      <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(170px,1fr)); gap:10px;">
        ${items.map(b => {
          const titulo  = escHtml(b.title || b.titulo || b.name || 'Sin título');
          const autor   = escHtml(b.autor || b.author || b.level || '');
          const status  = b.status || 'pendiente';
          const statusIcon = statusIcons[status] || '📌';

          return `
            <div style="
              background:var(--card-bg); border:1px solid var(--border);
              border-radius:10px; padding:12px; position:relative;
              display:flex; flex-direction:column; gap:4px;
            ">
              <div style="font-weight:600; font-size:13px;
                          white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"
                   title="${titulo}">${titulo}</div>
              ${autor ? `<div style="font-size:11px; opacity:0.55;">${autor}</div>` : ''}
              <div style="font-size:10px; opacity:0.6; margin-top:4px;">${statusIcon} ${status}</div>
              ${b.currentPage && b.totalPages ? `
                <div style="font-size:10px; opacity:0.5;">
                  Pág. ${b.currentPage}/${b.totalPages}
                  (${Math.round(b.currentPage/b.totalPages*100)}%)
                </div>` : ''}
              <button
                onclick="deleteBibliotecaItem('${b.id}')"
                style="position:absolute; top:8px; right:8px; background:transparent;
                       border:none; cursor:pointer; opacity:0.35; font-size:13px;
                       padding:2px 4px; border-radius:4px;"
                title="Eliminar">✕</button>
            </div>`;
        }).join('')}
      </div>
    </div>
  `).join('');
}
```

**Si no existe `deleteBibliotecaItem(id)`**, agregar:
```javascript
function deleteBibliotecaItem(id) {
  const idx = (S.biblioteca || []).findIndex(b => b.id === id);
  if (idx !== -1) {
    S.biblioteca[idx].deleted = true;
    saveToFirestore({ biblioteca: S.biblioteca });
    renderBiblioteca();
  }
}
```

**Criterio de aceptación:**
- Los items de Biblioteca se muestran como tarjetas en grid (no como lista plana)
- Las tarjetas agrupadas por tipo (Libros, Podcasts, etc.)
- Cada tarjeta muestra: título, autor (si existe), estado, progreso (si tiene páginas)
- Empty state explica la diferencia Biblioteca vs Bitácora
- El botón "✕" elimina la tarjeta

---

### C3 — Modo Aura: color de acento no se propaga correctamente
**IMAGEN 22 evidencia (Ajustes):** El selector de Color de Acento muestra 8 colores. El naranja-rojo parece seleccionado (tiene ring blanco), pero el campo hex muestra `#00e5ff` (cyan) — hay discrepancia entre el color visualmente seleccionado y el valor real del acento.

**Dónde buscar en `main.js`:**
```
Buscar: setAccentColor   o   applyAccentColor   o   --aura-accent   o   --accent
Buscar: color-swatch   o   .color-btn   o   accent-color
```

**Cambio en `setAccentColor()`:**
```javascript
function setAccentColor(hexColor) {
  if (!hexColor || typeof hexColor !== 'string') return;
  
  // Normalizar formato hex
  const color = hexColor.startsWith('#') ? hexColor : '#' + hexColor;
  S.accentColor = color;

  const root = document.documentElement;

  // Aplicar a variable principal
  root.style.setProperty('--accent', color);

  // Si está en Modo Aura, también actualizar variables de Aura
  if (document.body.dataset.mode === 'aura') {
    root.style.setProperty('--aura-accent', color);
    // Variantes derivadas para suavidad
    root.style.setProperty('--aura-accent-soft',   color + '22');
    root.style.setProperty('--aura-accent-border',  color + '55');
    root.style.setProperty('--aura-accent-glow',    color + '44');
  }

  // Actualizar UI del selector: marcar el botón correcto como activo
  document.querySelectorAll('.color-swatch, .color-btn, [data-color]').forEach(btn => {
    const btnColor = btn.dataset.color || btn.style.background || btn.style.backgroundColor;
    const isActive = btnColor === color || btnColor === color.replace('#','');
    btn.style.outline       = isActive ? '3px solid rgba(255,255,255,0.9)' : 'none';
    btn.style.outlineOffset = isActive ? '2px' : '0';
    btn.style.transform     = isActive ? 'scale(1.15)' : 'scale(1)';
  });

  // Sincronizar input hex con el color actual
  const hexInput = document.getElementById('accent-hex-input') || document.querySelector('input[type="text"][value*="#"]');
  if (hexInput) hexInput.value = color;

  // Preview del swatch actual
  const previewSwatch = document.getElementById('accent-preview-swatch');
  if (previewSwatch) previewSwatch.style.background = color;

  // Persistir en Firestore
  if (typeof saveToFirestore === 'function') {
    saveToFirestore({ accentColor: color });
  }
}
```

**Al inicializar Ajustes**, asegurarse de marcar el color activo correcto:
```javascript
// En la función que abre Ajustes o carga la sección de Estilo Visual:
if (S.accentColor) {
  // Llamar setAccentColor con el color actual para sincronizar el selector
  // SOLO actualizar la UI, no re-guardar en Firestore
  const root = document.documentElement;
  root.style.setProperty('--accent', S.accentColor);
  // Marcar el botón del selector
  document.querySelectorAll('.color-swatch, .color-btn, [data-color]').forEach(btn => {
    const isActive = btn.dataset.color === S.accentColor;
    btn.style.outline       = isActive ? '3px solid rgba(255,255,255,0.9)' : 'none';
    btn.style.outlineOffset = isActive ? '2px' : '0';
  });
  const hexInput = document.getElementById('accent-hex-input');
  if (hexInput) hexInput.value = S.accentColor;
}
```

**Criterio de aceptación:**
- Al hacer click en un color del selector, ese color muestra ring/outline visible
- El campo hex se actualiza inmediatamente con el color seleccionado
- El color se aplica visiblemente en la UI (barras de progreso, tabs activos, botones)
- Al recargar la página el color persiste (viene de `S.accentColor` guardado en Firestore)
- En Modo Aura el color también actualiza `--aura-accent`

---

## RESUMEN DE ARCHIVOS A MODIFICAR

| Archivo | Secciones afectadas |
|---|---|
| `main.js` | `renderUpcomingList`, `updateGlobalCore`, `loadGlobalCoreData`, `_updateSaasSubscriptionUI`, `renderLeaderboard`, `loadLeaderboardFromFirestore`, `renderBiblioteca`, `deleteBibliotecaItem`, `renderBitacoraList`, `setAccentColor`, `renderHabitForm`/modal hábito, `toggleHabitDay`, `getHabitStreak`, función Nexus/renderNexus |
| `styles.css` | `#fab-btn`, `.focus-inner-layout`, `.streak-days`/`.racha-days-row`, `.dot-inactive`, `#saldos-grid`, `.nucleo-help-popover`, `.habit-day-btn` |
| `index.html` | Solo si hay HTML del tooltip de Financiero hardcodeado — verificar antes de tocar |

---

## ORDEN DE IMPLEMENTACIÓN RECOMENDADO

```
1.  A1  — FAB posición (styles.css, ~5 min)
2.  A2  — Financiero: tooltip + grid + quitar XP (main.js + styles.css, ~20 min)
3.  A3  — Ajustes Pro/Trial sin contradicción (main.js, ~15 min)
4.  A4  — Núcleo Global datos comunidad (main.js, ~30 min)
5.  A5  — Análisis: tooltip en columna angosta (main.js + styles.css, ~10 min)
6.  A6  — Agenda: vencidas separadas de próximas (main.js, ~10 min)
7.  B1  — Enfoque Mental layout horizontal (styles.css + main.js si genera HTML, ~10 min)
8.  B2  — Racha Semanal círculos más juntos (styles.css, ~5 min)
9.  B3  — Nexus: quitar tarjeta Pro grande (main.js, ~10 min)
10. B4  — Leaderboard datos Firestore reales (main.js, ~20 min)
11. B5  — Hábitos selector de días activos (main.js + styles.css, ~30 min)
12. C1  — Bitácora Libro/Película diferenciados (main.js, ~25 min)
13. C2  — Biblioteca grid visual de tarjetas (main.js, ~15 min)
14. C3  — Color acento propagación correcta (main.js, ~10 min)
```

---

## CHECKLIST FINAL QA

Después de implementar, verificar cada punto visualmente en staging:

**Grupo A — Críticos:**
- [ ] El FAB (+) nunca tapa contenido en ningún módulo al hacer scroll
- [ ] Financiero: dona limpia sin texto encima, saldos en fila horizontal
- [ ] Financiero: sin botones de XP, sin gainXP en ninguna acción
- [ ] Ajustes: usuario con is_pro=true ve SOLO "Pro Activo" — no "Modo Prueba" ni "Activar Pro"
- [ ] Núcleo Global (tab Nexus): muestra datos de comunidad, no personales del usuario
- [ ] Análisis: sin tooltip en columna angosta sobre el contenido
- [ ] Agenda: "Próximas Actividades" sin ningún item vencido, vencidas en sección propia roja

**Grupo B — Visuales:**
- [ ] Enfoque Mental: anillo + barras lado a lado en PC (≥768px)
- [ ] Racha Semanal: círculos más juntos (gap ~8px, sin space-between)
- [ ] Nexus: leaderboard es lo primero visible, sin tarjeta Pro grande
- [ ] Leaderboard: sin WM_OS/AlphaX/DriveOS — datos Firestore o solo "Tú ★"
- [ ] Hábitos: selector de días L/M/X/J/V/S/D al crear/editar
- [ ] Hábitos: días inactivos se ven dimmed en la línea semanal
- [ ] Hábitos: racha no se rompe en días inactivos del hábito

**Grupo C — UX:**
- [ ] Bitácora Libro: después de seleccionar libro aparecen Estado + campos de páginas
- [ ] Bitácora Película: después de seleccionar película aparecen botones de estado
- [ ] Las entradas de libros/películas en la lista muestran estado y progreso
- [ ] Biblioteca: muestra grid de tarjetas con estado, no solo formulario vacío
- [ ] Biblioteca: empty state explica diferencia Biblioteca vs Bitácora
- [ ] Color de acento: selector muestra ring en el color activo
- [ ] Color de acento: campo hex sincronizado con color actual
- [ ] Color de acento: persiste al recargar la página
