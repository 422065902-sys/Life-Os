# CODEX — Correcciones QA Life OS
> Generado por OpenClaw AI Analyst (analyze.js + analyze-deep.js) · 2026-04-25
> Archivos a modificar: `main.js` (~11,700 líneas) + `styles.css`
> **Solo staging `mylifeos-staging`. Firebase prod `life-os-prod-3a590` NO se toca.**

---

## ESTADO DE BATCHES

- [x] Batch 1 — Bugs críticos (lo que está ROTO)
- [x] Batch 2 — Colores e identidad visual
- [x] Batch 3 — UX y mejoras

---

## BATCH 1 — Bugs críticos

### [C-1] Tabs Mente (Bitácora / Aliados / Biblioteca) siempre muestran Gemelo
75% del módulo Mente es inaccesible. El feature diferenciador #1 del producto está roto.
En `main.js`, busca `renderMenteTab` o `showMenteSection`:
```js
function renderMenteTab(tab) {
  document.querySelectorAll('[data-mente-panel]').forEach(p => {
    p.style.display = 'none'; p.setAttribute('aria-hidden','true');
  });
  const target = document.querySelector(`[data-mente-panel="${tab}"]`);
  if (target) { target.style.display = 'block'; target.setAttribute('aria-hidden','false'); }
}
```
Verificar que existen: `data-mente-panel="bitacora"`, `"aliados"`, `"biblioteca"`, `"gemelo"`. Verificar que cada botón de tab tiene el `data-tab` correcto y el event listener está attached post-render.

---

### [C-2] Tienda de Decoración completamente invisible
En `main.js`, agregar tabs visibles al módulo World:
```js
function renderWorldTabs(activeTab = 'mapa') {
  const tabs = [
    {id:'mapa', label:'🗺️ Mapa'},
    {id:'apartamento', label:'🏠 Apartamento'},
    {id:'tienda', label:'🛍️ Tienda'}
  ];
  document.querySelector('#world-tabs-container').innerHTML =
    `<div class="world-tabs" role="tablist">` +
    tabs.map(t => `<button class="world-tab ${t.id===activeTab?'active':''}"
      data-world-tab="${t.id}" role="tab">${t.label}</button>`).join('') +
    `</div>`;
  document.querySelectorAll('.world-tab').forEach(btn =>
    btn.addEventListener('click', () => {
      renderWorldSection(btn.dataset.worldTab);
      document.querySelectorAll('.world-tab').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
    })
  );
}
```
En `styles.css`:
```css
.world-tabs { display:flex; gap:8px; padding:12px 16px; border-bottom:1px solid rgba(6,182,212,0.2); }
.world-tab { padding:8px 16px; border-radius:8px; background:transparent; border:1px solid rgba(255,255,255,0.15); color:rgba(255,255,255,0.7); cursor:pointer; }
.world-tab.active { background:rgba(6,182,212,0.2); border-color:#00e5ff; color:#00e5ff; }
```

---

### [C-3] Vista Apartamento muestra el mapa de ciudad en lugar del apartamento
En `main.js`, la función que navega a `?section=apartment` o click en "APT" debe:
1. Ocultar `#world-map-container`
2. Mostrar `#world-apartment-container` con grid de habitaciones y muebles colocados
Si `#world-apartment-container` no existe, crearlo con layout de grid de habitaciones.

---

### [C-4] window.__QA — Onboarding / Blackout / Paywall inaccesibles para QA
Al final de `main.js`, fuera de cualquier función:
```js
window.__QA = {
  resetOnboarding: () => {
    ['onboardingComplete','onboarding_dismissed'].forEach(k => localStorage.removeItem(k));
    location.reload();
  },
  simulateBlackout: () => {
    if (S.userData) S.userData.criticalPoints = -1;
    window.triggerBlackout?.('habit');
  },
  simulatePaywall: () => {
    S.subscription = { status:'expired', expiresAt:Date.now()-1 };
    window.showPaywall?.();
  }
};
```
También: si `new URLSearchParams(location.search).get('reset_onboarding') === 'true'` al inicializar → `localStorage.removeItem('onboardingComplete')`.

---

### [C-5] Blackout sin overlay visual — solo un botón en esquina
El mechanic de retención más poderoso de la app. Actualmente es invisible.
En `main.js`, dentro de `triggerBlackout()` o `checkCriticalPoints()`, llamar:
```js
function showBlackoutOverlay(reason) {
  if (document.getElementById('blackout-overlay')) return;
  const o = document.createElement('div');
  o.id = 'blackout-overlay';
  o.innerHTML = `<div class="blackout-content">
    <div class="blackout-icon">⚠️</div>
    <h2>${S.mode==='aura' ? 'Tu Flujo se ha interrumpido' : 'RACHA PERDIDA'}</h2>
    <p>${reason || ''}</p>
    <button class="btn-recover" onclick="document.getElementById('blackout-overlay').remove();navigate('flow')">
      Recuperar ahora →
    </button>
  </div>`;
  document.body.appendChild(o);
  if (Notification.permission === 'granted')
    navigator.serviceWorker.ready.then(r => r.showNotification(
      S.mode==='aura' ? '⚠️ Tu Aura se está apagando' : '⚠️ Racha en peligro',
      { body:'Completa 1 hábito para recuperar tu Flujo',
        data:{ url:'/?module=flow&action=checkin' },
        icon:'/icon-192.png', vibrate:[200,100,200] }
    ));
}
```
En `styles.css`:
```css
#blackout-overlay {
  position:fixed; inset:0; z-index:9000;
  display:flex; align-items:center; justify-content:center;
  background:rgba(0,0,0,0.9); backdrop-filter:blur(8px);
  animation:blackout-in .4s ease-out;
}
@keyframes blackout-in { from{opacity:0} to{opacity:1} }
.blackout-icon { font-size:3rem; animation:pulse-warn 1s infinite; }
@keyframes pulse-warn { 0%,100%{transform:scale(1)} 50%{transform:scale(1.2)} }
.blackout-content h2 { color:#ef4444; font-size:1.5rem; font-weight:800; }
.blackout-content { text-align:center; padding:40px; }
.btn-recover { margin-top:24px; padding:12px 32px; background:#ef4444; color:#fff; border:none; border-radius:12px; font-size:1rem; cursor:pointer; }
@media (prefers-reduced-motion:reduce) {
  #blackout-overlay { animation:none; }
  .blackout-icon { animation:none; }
}
```

---

### [C-6] Paywall sin identidad visual propia
Verificar que `showPaywall()` genera un overlay full-screen con:
- `position:fixed; inset:0; z-index:8999; background:rgba(0,0,0,0.85); backdrop-filter:blur(12px)`
- Precio `$99/mes MXN` destacado
- Lista de 4 features desbloqueados (Gemelo, World, Plan Aliados, Análisis avanzado)
- Botón primario "Activar ahora" con `animation:slide-up .3s ease-out`
- Botón secundario "Más tarde" que cierra el overlay

---

### [S-1] Scroll invisible — `_fold` y `_scroll` idénticos en 8 módulos
En `styles.css`:
```css
.module-content, .main-content, [data-module] > .module-inner {
  overflow-y: auto;
  height: calc(100vh - 64px);
  -webkit-overflow-scrolling: touch;
}
[data-module="world"] .module-content,
[data-module="mente"] .module-content,
[data-module="flow"] .module-content,
[data-module="financiero"] .module-content,
[data-module="analisis"] .module-content,
[data-module="cuerpo"] .module-content,
[data-module="settings"] .module-content { overflow-y: auto !important; }
```
Verificar que `renderDashboard()`, `renderAnalysis()` y los demás generan el DOM completo sin requerir interacción del usuario.

---

### [S-2] FAB tapa contenido en Dashboard, Agenda y Gemelo — fix global con safe-area iOS
En `styles.css`:
```css
.fab-button, .fab, .fab-main, #fab {
  bottom: calc(80px + env(safe-area-inset-bottom));
}
```

---

### [FL-1] Tab Metas en Flow renderiza contenido de Ideas
En `main.js`, busca el handler de tabs de Flow (`[data-flow-tab]`):
1. Verificar que `currentFlowTab = tab.dataset.flowTab` se setea ANTES del render
2. Verificar que `renderFlowTab()` tiene `case 'metas':` que llama `renderMetas()`
3. El valor del `data-flow-tab` attribute debe coincidir exactamente con el case del switch

---

## BATCH 2 — Colores e identidad visual

### [F-1] Título "FINANCIERO" en púrpura en vez de dorado
```css
[data-module="financiero"] .module-title,
[data-module="financiero"] h1,
[data-module="financiero"] .page-title { color: #fbbf24 !important; }
```

---

### [F-2] Donut chart Financiero en cyan + animación incompleta
En `main.js`, en la instancia Chart.js `doughnut` del módulo Financiero:
```js
backgroundColor: ['#fbbf24','#f59e0b','#d97706','#92400e','#78350f'],
borderColor:     ['#fbbf24','#f59e0b','#d97706','#92400e','#78350f'],
animation: { duration: 600 },
```
Eliminar cualquier `circumference` no estándar. Verificar que la suma de `data.datasets[0].data` = total.

---

### [F-3] Saldo en rojo agresivo sin contexto
En `renderBalance()` o `renderSaldoCard()`:
- Color rojo solo si `tipo === 'deuda'` y `balance < 0`
- Para cuentas corrientes con balance negativo: color ámbar `#f59e0b` + badge `"Gastos > Ingresos este período"`
- Eliminar cualquier `color: red` hardcodeado para cuentas corrientes

---

### [CO-1] Barras del Modelo Anatómico en Cuerpo usan cyan en vez de naranja
```css
[data-module="cuerpo"] .muscle-bar-fill,
[data-module="cuerpo"] .progress-bar-fill,
[data-module="cuerpo"] .stat-bar-fill {
  background: linear-gradient(90deg, #ff6b35, #ff8c5a);
  box-shadow: 0 0 8px rgba(255,107,53,.3);
}
```

---

### [D-1] Stat-cards del Dashboard usan cyan en Modo Aura en vez de `--aura-accent`
```css
[data-mode="aura"] .stat-value { color: var(--aura-accent, #a855f7); text-shadow: none; }
[data-mode="aura"] .stat-card {
  background: rgba(255,255,255,0.06);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(168,85,247,0.25);
  border-radius: 20px;
}
```

---

### [ST-1] Modo Aura no aplica consistentemente en todas las cards
Buscar todos los `color: #00e5ff` y `var(--color-cyan)` hardcodeados en componentes sin override de Aura. Reemplazar con `var(--aura-accent, #a855f7)` donde corresponda modo Aura.

---

### [G-3] "Aura Total: 2140 XP" — terminología mixta en Ajustes
En la función que renderiza la card Gamificación en Ajustes:
```js
const suffix = document.body.dataset.mode === 'aura' ? '✦' : 'XP';
// Cambiar "2140 XP" → "2140 ✦" en modo Aura
```

---

### [FL-3] "Energía de Flow" muestra "+25 XP" en Modo Aura
Busca donde se renderiza la card "ENERGÍA DE FLOW":
```js
const xpLabel    = document.body.dataset.mode === 'aura' ? '+25 Esencia' : '+25 XP';
const rachaLabel = document.body.dataset.mode === 'aura' ? 'Flujo Continuo' : 'Racha';
```

---

### [FL-2] Hábito "Hábito QA 1776396743410" visible en screenshots
En `renderHabit(habit)`:
```js
const displayName = /^Hábito QA \d+$/.test(habit.name) ? 'Hábito sin nombre' : habit.name;
```

---

## BATCH 3 — UX y mejoras

### [S-3] Banners de onboarding no dismissables en TODOS los módulos
En `main.js`, función universal:
```js
function initContextCardDismiss(moduleId) {
  const key = `ctx_dismissed_${moduleId}`;
  const card = document.querySelector(`[data-context-card="${moduleId}"]`);
  if (!card) return;
  if (localStorage.getItem(key)) { card.remove(); return; }
  const hasData = (moduleId==='financiero' && S.transactions?.length > 0)
               || (moduleId==='dashboard'  && S.userData?.totalXP > 0)
               || (moduleId==='cuerpo'     && S.workouts?.length > 0);
  if (hasData) { card.remove(); return; }
  card.querySelector('[data-dismiss], .btn-entendido')?.addEventListener('click', () => {
    localStorage.setItem(key, 'true');
    card.animate(
      [{ opacity:1, maxHeight:'200px' }, { opacity:0, maxHeight:'0', padding:'0' }],
      { duration:300, easing:'ease-out' }
    ).onfinish = () => card.remove();
  });
}
```
Llamar desde cada módulo: `initContextCardDismiss('dashboard')`, `'financiero'`, `'cuerpo'`, `'settings'`, `'analisis'`, `'flow'`.

---

### [S-4] Banners tienen 3 diseños distintos — unificar componente
```js
function renderContextBanner(moduleId, emoji, title, body) {
  if (localStorage.getItem(`ctx_dismissed_${moduleId}`)) return '';
  return `<div class="context-banner" data-context-card="${moduleId}">
    <span class="context-banner-emoji">${emoji}</span>
    <div class="context-banner-text"><strong>${title}</strong><p>${body}</p></div>
    <button class="btn-entendido" data-dismiss>✓</button>
  </div>`;
}
```
Un solo bloque CSS `.context-banner` para todos los módulos.

---

### [G-1] Núcleo Personal al 15% sin urgencia ni CTA
En el render del Núcleo Personal:
1. Animación `stroke-dashoffset` con `transition: 1s ease-out` al SVG
2. CTA dinámico:
```js
if (tareasCompletadas === 0)
  html += `<button class="nucleo-cta" onclick="navigate('flow','habitos')">
    🎯 Completa tu primera tarea → +XP</button>`;
```
```css
.nucleo-cta { animation: nucleo-pulse 2s infinite; }
@keyframes nucleo-pulse {
  0%,100% { box-shadow: 0 0 0 0 rgba(168,85,247,.4); }
  50%      { box-shadow: 0 0 0 8px rgba(168,85,247,0); }
}
@media (prefers-reduced-motion:reduce) { .nucleo-cta { animation: none; } }
```

---

### [G-2] Grid Análisis — dos cards full-width antes del contenido real
```css
#analisis-grid { display:grid; grid-template-columns:repeat(12,1fr); gap:16px; }
.nucleo-card   { grid-column: span 5; }
.metrics-trio  { grid-column: span 7; display:grid; grid-template-rows:repeat(3,1fr); }
```

---

### [D-2] Briefing central es texto plano sin micro-data-viz
```js
function briefingStat(label, value, pct) {
  return `<span class="b-stat"><span class="b-bar" style="--p:${pct}%"></span>${label} <strong>${value}</strong></span>`;
}
```
```css
.b-bar::before {
  content:''; display:inline-block; width:40px; height:6px; border-radius:3px;
  background: linear-gradient(90deg, var(--accent) var(--p), rgba(255,255,255,.15) var(--p));
  margin-right:6px; vertical-align:middle;
}
```

---

### [D-3] Barra de journey del Gemelo visualmente enterrada
Busca `renderGeminiJourneyBar()`. Elevar a hero-card: `min-height:80px`, `transition:width 1.2s cubic-bezier(0.34,1.56,0.64,1)`, texto "Día X de 7", copy de anticipación.
```css
@media (prefers-reduced-motion:reduce) { .journey-bar-fill { transition: width 300ms linear; } }
```

---

### [F-4] Card Saldo Personal sobredimensionada
`.saldo-card { min-height:auto; padding:16px 20px; }` — reducir a 4 col, agregar ratio salud financiera y badge tendencia mensual.

---

### [F-5] Donut Financiero — solo 2 categorías
Agregar 6-8 categorías: Alimentación, Transporte, Entretenimiento, Salud, Hogar, Educación, Ahorro, Otro. Si "Otro" > 20%: overlay `"Categoriza tus gastos para ver insights reales"`.

---

### [F-6] Financiero sin gamificación
En `addTransaction()`: `awardXP('finance_log', 15)` + `showToast('+15 XP · Registro financiero')`. Mini-card "Salud Financiera" con barra dorada + label `"Explorador Frugal / Maestro del Ahorro / Guardián de Riqueza"`. Badge: `"🔥 Racha: X días con registro"`.

---

### [F-7] Saldo estático sin sparkline
En `renderSaldoCard()`: counter animation 0→valor en 800ms, micro-sparkline SVG 8 puntos, pulso suave si balance < 0.
```css
@media (prefers-reduced-motion:reduce) { .saldo-value { animation:none; } }
```

---

### [F-8] Layout Financiero 50/50 → Adaptive Bento 12 columnas
```css
#financiero-grid      { display:grid; grid-template-columns:repeat(12,1fr); gap:16px; }
.saldo-card           { grid-column: span 4; }
.gastos-chart-card    { grid-column: span 4; }
.resumen-mensual-card { grid-column: span 4; }
.historial-card       { grid-column: span 8; }
.salud-fin-card       { grid-column: span 4; }
```

---

### [M-2] Gemelo — anillo 1/30 estático, frase truncada
Animación `stroke-dashoffset transition:800ms ease-out`, `padding-bottom:72px` al contenedor, frase: `"Tu Gemelo está conociendo tus patrones — día 1 de 30"`.

---

### [W-4] World — espacio muerto bajo el mapa
```css
.world-sidebar { min-height:100%; display:flex; flex-direction:column; justify-content:space-between; }
.world-layout  { align-items:stretch; }
```

---

### [ST-2] Onboarding — reducir friction
En `showOnboarding()`: paso 1 solo nombre + accent color. Al completar: `emitBurst()` + toast `"+100 Aura — ¡Tu aventura comienza!"`.

---

### [MOB-1] Topbar ilegible en 360px
```css
@media (max-width:380px) {
  .topbar-xp { font-size:11px; gap:4px; }
  .topbar-xp .xp-badge { display:none; }
}
```

---

### [MOB-2] Stat-cards truncan texto en mobile
```css
@media (max-width:640px) {
  .stat-card  { min-width:0; overflow:hidden; }
  .stat-value { font-size:clamp(12px,3vw,16px); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
}
```

---

### [L-1] Animación gradiente en título de la landing
```css
.landing-title {
  background: linear-gradient(90deg,#00e5ff,#a855f7,#fbbf24,#ff6b35,#00e5ff);
  background-size:300%; -webkit-background-clip:text; -webkit-text-fill-color:transparent;
  animation: grad-shift 4s linear infinite;
}
@keyframes grad-shift { 0%{background-position:0%} 100%{background-position:300%} }
@media (prefers-reduced-motion:reduce) { .landing-title { animation:none; } }
```

---

### [L-2] Landing sin social proof
Agregar bajo el hero: contador de usuarios activos + testimonios de "Ana K.", "Rodolfo", "Isam_99".

---

### [L-3] Features diferenciadores sin demo visual
Secciones con demo visual para: Gemelo Potenciado, World Map gamificado, Plan Aliados.

---

### [X-1] Núcleo Personal como micro-widget en todos los módulos
Crear `renderNucleoMicroWidget()` → card pequeña con % Núcleo. Inyectar en sidebar o footer de cada módulo.

---

## INSTRUCCIONES PARA CODEX

**Primera sesión:** leer este archivo y ejecutar solo el **Batch 1**. Hacer commit, sync al VPS.

**Sesiones siguientes:** marcar `[x]` el batch completado arriba y ejecutar el siguiente.

**Commit message por batch:**
- Batch 1: `Fix: bugs críticos — tabs Mente/Flow/World, scroll overflow, FAB, blackout overlay, window.__QA`
- Batch 2: `Fix: identidad visual — colores módulos, Aura consistency, terminología XP/Aura`
- Batch 3: `Feat: UX improvements — banners dismissables, Bento layouts, gamificación Financiero, mobile, landing`

**NO hacer commit ni deploy — Claude se encarga de eso.**
Solo modifica los archivos locales. Cuando termines un batch, avisa. Claude hace el commit, push y deploy a staging.

---

## PROTOCOLO DE EFICIENCIA — LEE ESTO PRIMERO

> De IA a IA: trabajamos en equipo. Claude hace análisis, commits y deploy. Tú haces los cambios en código. Para que el equipo funcione bien, necesito que trabajes quirúrgico, no exhaustivo.

`main.js` tiene ~12,000 líneas. Leerlo completo cada vez que necesitas editar una función = tokens quemados sin valor. El patrón correcto es:

### Flujo obligatorio por cada corrección

```
1. grep exacto  →  encuentra la línea
2. read offset  →  lee solo ±30 líneas alrededor
3. edit         →  cambia solo lo necesario
4. node --check →  verifica sintaxis
5. siguiente corrección
```

### Reglas concretas

- **Un grep, no un read completo.** Si necesitas `renderFinanciero()`, corre `grep -n "renderFinanciero" main.js` y lee desde esa línea, no el archivo entero.
- **No re-leas lo que acabas de editar.** Edit/Write confirma el cambio o falla — no hay razón para leer después.
- **No razones antes de actuar.** Si el batch dice "agrega esta clase CSS a styles.css", hazlo directamente. No expliques qué vas a hacer, hazlo.
- **Un batch = un bloque de trabajo.** Termina todos los ítems del batch, corre `node --check main.js`, reporta resultado. Sin pausas intermedias para validar con el usuario.
- **Si algo no existe** (función, selector, elemento HTML), búscalo con grep antes de asumir que hay que crearlo.
- **No toques lo que no está en el batch.** Sin refactors de oportunidad, sin "aproveché y también arreglé X".

### Por qué importa

Los Batches 1-3 costaron ~178k tokens. Deberían haber costado ~30k. La diferencia fue leer archivos completos múltiples veces y razonar en voz alta antes de cada edit. En este proyecto main.js es el cuello de botella — cada lectura completa desperdicia ~8k tokens.

---

## BATCH 4 — Bug selector de color Modo Aura

### [A-1] `setAccentColor()` no actualiza `--aura-accent` — solo `--accent`

En `main.js`, busca `setAccentColor` con grep. La función actualmente hace algo como:
```js
document.documentElement.style.setProperty('--accent', color);
```
Agregar detección de modo:
```js
function setAccentColor(color) {
  document.documentElement.style.setProperty('--accent', color);
  if (document.body.dataset.mode === 'aura') {
    document.documentElement.style.setProperty('--aura-accent', color);
  }
}
```
Si la función ya tiene más lógica, conservarla — solo agregar el bloque `if` para `--aura-accent`.

---

## BATCH 5 — AuraChart canvas de partículas

### [AC-1] Reemplazar radar Chart.js en Modo Aura con canvas de partículas

Este es el feature visual más importante pendiente. En `main.js`:

1. Busca con grep dónde se inicializa el radar chart (`RadarChart` o `radar` en Chart.js).
2. Envuelve la creación en: `if (document.body.dataset.mode !== 'aura') { /* radar actual */ }`
3. Para modo Aura, crear canvas 2D con esta API:

```js
window.LifeOSAuraChart = {
  canvas: null,
  ctx: null,
  nodes: [
    { id:'mente',     label:'Mente',     angle: -90, score: 0 },
    { id:'cuerpo',    label:'Cuerpo',    angle: -30, score: 0 },
    { id:'flow',      label:'Flow',      angle:  30, score: 0 },
    { id:'finanzas',  label:'Finanzas',  angle:  90, score: 0 },
    { id:'aprende',   label:'Aprende',   angle: 150, score: 0 },
    { id:'mundo',     label:'Mundo',     angle: 210, score: 0 },
  ],
  particles: [],
  animFrame: null,

  init(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    this.canvas = document.createElement('canvas');
    this.canvas.width  = el.offsetWidth  || 320;
    this.canvas.height = el.offsetHeight || 320;
    el.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this._spawnParticles();
    this._loop();
  },

  updateScores(scores) {
    // scores = { mente:7, cuerpo:5, flow:8, finanzas:6, aprende:4, mundo:3 }
    this.nodes.forEach(n => { if (scores[n.id] !== undefined) n.score = scores[n.id]; });
  },

  emitBurst() {
    for (let i = 0; i < 30; i++) this._addParticle(true);
  },

  _spawnParticles() {
    const count = window.matchMedia('(prefers-reduced-motion:reduce)').matches ? 25
                : window.innerWidth < 640 ? 80 : 150;
    for (let i = 0; i < count; i++) this._addParticle(false);
  },

  _addParticle(burst) {
    const cx = this.canvas.width / 2, cy = this.canvas.height / 2;
    const angle = Math.random() * Math.PI * 2;
    const r = burst ? 10 : Math.random() * cx * 0.8;
    this.particles.push({
      x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r,
      vx: (Math.random() - 0.5) * (burst ? 3 : 0.4),
      vy: (Math.random() - 0.5) * (burst ? 3 : 0.4),
      life: burst ? 60 : 200 + Math.random() * 200,
      maxLife: burst ? 60 : 400,
      size: Math.random() * 2 + 0.5,
      hue: 270 + Math.random() * 60,
    });
  },

  _loop() {
    const { ctx, canvas, nodes, particles } = this;
    const cx = canvas.width / 2, cy = canvas.height / 2;
    const R  = cx * 0.6;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // nodos y conexiones
    nodes.forEach((n, i) => {
      const rad = (n.angle * Math.PI) / 180;
      const nx = cx + Math.cos(rad) * R * (n.score / 10 || 0.2);
      const ny = cy + Math.sin(rad) * R * (n.score / 10 || 0.2);
      ctx.beginPath();
      ctx.arc(nx, ny, 6, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${270 + i * 20}, 80%, 70%, 0.9)`;
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '11px sans-serif';
      ctx.fillText(n.label, nx + 8, ny + 4);
    });

    // partículas
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy; p.life--;
      const alpha = p.life / p.maxLife;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue}, 80%, 70%, ${alpha})`;
      ctx.fill();
      if (p.life <= 0) { particles.splice(i, 1); this._addParticle(false); }
    }

    this.animFrame = requestAnimationFrame(() => this._loop());
  },

  destroy() {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    this.canvas?.remove();
  }
};
```

Llamar `window.LifeOSAuraChart.init('aura-chart-container')` cuando se activa el Modo Aura (`_applyVisualMode('aura')`). Llamar `destroy()` al salir del modo Aura.

`reduced motion`: si `matchMedia('prefers-reduced-motion:reduce').matches` → `count = 25`, sin animación de burst.

---

**Sync al VPS después de cada commit:**
```bash
cd /opt/openclaw/repo/lifeos && git pull origin main
```
