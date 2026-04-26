# CODEX — Correcciones QA Life OS
> Generado por OpenClaw AI Analyst (analyze.js + analyze-deep.js) · 2026-04-25
> Archivos a modificar: `main.js` (~11,700 líneas) + `styles.css`
> **Solo staging `mylifeos-staging`. Firebase prod `life-os-prod-3a590` NO se toca.**

---

## ESTADO DE BATCHES

- [x] Batch 1 — Bugs críticos (lo que está ROTO)
- [x] Batch 2 — Colores e identidad visual
- [x] Batch 3 — UX y mejoras
- [x] Batch 4 — Selector color Aura (`--aura-accent`)
- [x] Batch 5 — AuraChart canvas partículas
- [ ] Batch 6 — Push notifications + Blackout emocional + Racha danger + Hero banner
- [ ] Batch 7 — Gemelo activación + Onboarding narrativo + Bottom nav dinámico
- [ ] Batch 8 — Grupos truncados (Cuerpo · Mente · World · Settings · Mobile)

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

---

## BATCH 6 — Push Notifications + Blackout Emocional + Racha Danger + Hero Banner

> Verificado en código: estos ítems NO existen. No son alucinaciones.
> Push notifications: usuario confirma 1 mes con PWA sin recibir ninguna notificación.

---

### [B6-1] Push notification trigger en setBlackoutOverlay()

`setBlackoutOverlay(active)` actualmente no dispara ninguna notificación push. El SW ya tiene `notificationclick` → solo falta el trigger en main.js.

En `main.js`, buscar `function setBlackoutOverlay` con grep. Dentro del bloque `if (active)`, **después** de `overlay.classList.add('show')`, agregar:

```js
// Trigger push si tiene permiso
if (Notification.permission === 'granted') {
  navigator.serviceWorker.ready.then(reg => {
    reg.showNotification(
      S.userData?.mode === 'aura' ? '⚠️ Tu Flujo se ha interrumpido' : '⚠️ RACHA EN PELIGRO',
      {
        body: 'Completa 1 hábito ahora para recuperar tu progreso',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        data: { url: '/?module=flow&action=checkin' },
        vibrate: [200, 100, 200],
        tag: 'blackout-alert',
        renotify: false
      }
    );
  });
}
```

---

### [B6-2] Push notification scheduling — recordatorios diarios

No existe ningún código de scheduling en main.js. Agregar función que programe los 3 recordatorios diarios cuando el usuario activa las notificaciones.

En `main.js`, buscar `registerPushNotifications` con grep. Al final de esa función (después de obtener el token exitosamente), agregar llamada a `scheduleDailyReminders()`.

Agregar nueva función:

```js
function scheduleDailyReminders() {
  if (Notification.permission !== 'granted') return;
  if (!('serviceWorker' in navigator)) return;

  // Cancelar cualquier scheduling previo
  if (window._reminderTimers) window._reminderTimers.forEach(clearTimeout);
  window._reminderTimers = [];

  function msUntilHour(h, m = 0) {
    const now = new Date();
    const target = new Date();
    target.setHours(h, m, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    return target - now;
  }

  async function sendReminder(title, body, tag, url) {
    if (Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker.ready;
    reg.showNotification(title, {
      body, icon: '/icon-192.png', badge: '/icon-192.png',
      data: { url }, tag, renotify: true, vibrate: [150, 75, 150]
    });
  }

  // 8:00 AM — briefing matutino
  window._reminderTimers.push(setTimeout(() => {
    const h = (S.habits||[]).filter(x=>!x.deleted&&!x.completedToday).length;
    if (h > 0)
      sendReminder('☀️ Buenos días · Life OS', `Tienes ${h} hábito${h>1?'s':''} pendiente${h>1?'s':''} hoy`, 'morning', '/?module=flow');
    scheduleDailyReminders(); // re-schedule para mañana
  }, msUntilHour(8)));

  // 8:00 PM — recordatorio hábitos
  window._reminderTimers.push(setTimeout(() => {
    const pending = (S.habits||[]).filter(x=>!x.deleted&&!x.completedToday).length;
    if (pending > 0)
      sendReminder(
        S.userData?.mode === 'aura' ? '🌙 Tu Aura necesita energía' : '🌙 Hábitos pendientes',
        `${pending} hábito${pending>1?'s':''} sin completar hoy — quedan pocas horas`,
        'evening-habits', '/?module=flow'
      );
  }, msUntilHour(20)));

  // 9:00 PM — racha en peligro
  window._reminderTimers.push(setTimeout(() => {
    const streak = S.checkInStreak || 0;
    const lastDate = S.xpHistory ? Object.keys(S.xpHistory).sort().pop() : null;
    const todayStr = new Date().toISOString().slice(0,10);
    if (streak > 0 && lastDate !== todayStr)
      sendReminder(
        `🔥 Racha de ${streak} días en peligro`,
        'Haz check-in antes de medianoche para mantenerla',
        'streak-danger', '/?module=flow&action=checkin'
      );
  }, msUntilHour(21)));
}
```

Llamar `scheduleDailyReminders()` también en el arranque si ya tiene permiso:
```js
// Buscar el bloque donde se inicializa notificaciones tras login (initNotificationsToggle)
// Agregar al final:
if (Notification.permission === 'granted') scheduleDailyReminders();
```

---

### [B6-3] Blackout overlay — animación emocional

El overlay actual es solo `⚠ SYSTEM BLACKOUT + botón`. Mejorar sin reescribir:

En `main.js`, buscar `function setBlackoutOverlay` con grep. Cambiar el `innerHTML` del overlay:

```js
// Reemplazar el innerHTML actual por:
overlay.innerHTML = `
  <div class="blackout-content">
    <div class="blackout-icon">⚠️</div>
    <h2 class="blackout-title">${
      (document.body.dataset.mode === 'aura')
        ? 'TU FLUJO SE HA INTERRUMPIDO'
        : 'SYSTEM BLACKOUT'
    }</h2>
    <p class="blackout-sub">Tu Núcleo está en 0%. Completa un hábito o tarea para reactivar.</p>
    <div class="blackout-ember-container" id="blackout-embers"></div>
    <button class="btn btn-a blackout-cta" onclick="navigate('productividad');setBlackoutOverlay(false)">
      Recuperar ahora →
    </button>
  </div>`;
// Generar partículas CSS
const embers = overlay.querySelector('#blackout-embers');
if (embers) {
  for (let i = 0; i < 18; i++) {
    const e = document.createElement('span');
    e.className = 'blackout-ember';
    e.style.cssText = `left:${Math.random()*100}%;animation-delay:${Math.random()*2}s;animation-duration:${1.5+Math.random()*2}s`;
    embers.appendChild(e);
  }
}
```

En `styles.css`, buscar `#blackout-overlay` y agregar debajo:

```css
#blackout-overlay { animation: blackout-in .4s ease-out; background: rgba(0,0,0,0.92); }
@keyframes blackout-in { from{opacity:0} to{opacity:1} }
.blackout-title { color:#ef4444; font-family:'Orbitron',sans-serif; font-size:1.4rem; font-weight:900; margin:12px 0 8px; }
.blackout-sub { color:rgba(255,255,255,0.6); font-size:0.9rem; margin-bottom:24px; }
.blackout-cta { margin-top:8px; background:#ef4444; border:none; padding:12px 32px; border-radius:12px; font-size:1rem; cursor:pointer; color:#fff; }
.blackout-ember-container { position:absolute; inset:0; pointer-events:none; overflow:hidden; border-radius:inherit; }
.blackout-ember {
  position:absolute; bottom:-10px; width:4px; height:4px; border-radius:50%;
  background:radial-gradient(circle,#f87171,#dc2626);
  animation: ember-rise linear infinite;
  opacity:0;
}
@keyframes ember-rise {
  0%   { transform:translateY(0) scale(1); opacity:0; }
  15%  { opacity:0.9; }
  80%  { opacity:0.3; }
  100% { transform:translateY(-100vh) scale(0.3) rotate(720deg); opacity:0; }
}
.blackout-icon { font-size:3rem; animation:pulse-warn 1s infinite; }
@keyframes pulse-warn { 0%,100%{transform:scale(1)} 50%{transform:scale(1.2)} }
@media (prefers-reduced-motion:reduce) {
  #blackout-overlay { animation:none; }
  .blackout-icon,.blackout-ember { animation:none; }
  .blackout-ember { display:none; }
}
```

---

### [B6-4] Racha "en peligro" — badge en topbar

El topbar solo muestra XP/level/coins. No existe ningún badge de racha ni warning. Agregar:

En `index.html`, buscar `id="tb-coins"` con grep. Después de ese `<span>`, agregar:
```html
<span id="tb-streak" class="badge badge-streak" style="display:none"></span>
```

En `main.js`, buscar la función que actualiza el topbar (buscar `tb-xp` con grep, leer ±20 líneas). En esa misma función agregar:

```js
const streakEl = document.getElementById('tb-streak');
if (streakEl) {
  const streak = S.checkInStreak || 0;
  if (streak > 0) {
    const todayStr = new Date().toISOString().slice(0,10);
    const checkedToday = S.xpHistory && S.xpHistory[todayStr];
    const hour = new Date().getHours();
    const inDanger = !checkedToday && hour >= 18; // peligro después de 6pm sin check-in
    streakEl.textContent = `🔥 +${streak}`;
    streakEl.style.display = '';
    streakEl.style.background = inDanger ? 'rgba(239,68,68,.25)' : 'rgba(255,107,53,.15)';
    streakEl.style.color      = inDanger ? '#f87171' : '#ff6b35';
    if (inDanger) streakEl.style.animation = 'streak-pulse 1.5s ease-in-out infinite';
    else          streakEl.style.animation = '';
  } else {
    streakEl.style.display = 'none';
  }
}
```

En `styles.css`, agregar:
```css
.badge-streak { font-family:'JetBrains Mono',monospace; font-size:11px; padding:3px 8px; border-radius:20px; font-weight:700; transition:background .3s,color .3s; }
@keyframes streak-pulse {
  0%,100% { box-shadow:0 0 0 0 rgba(239,68,68,.4); }
  50%      { box-shadow:0 0 0 6px rgba(239,68,68,0); }
}
@media (prefers-reduced-motion:reduce) { .badge-streak { animation:none !important; } }
```

---

### [B6-5] Dashboard hero banner — datos vivos (reducir a 80px o inyectar contenido)

El banner es dismissable (Batch 3 ✅) pero cuando se muestra en primera visita son 200px de emojis decorativos. Reducirlo a 80px e inyectarle datos reales.

En `main.js`, buscar la función que renderiza el context banner del dashboard (buscar `ctx_dismissed_dashboard` o `renderContextBanner('dashboard'` con grep). Cambiar para que el banner muestre datos vivos en lugar de emojis:

```js
// Reemplazar el call a renderContextBanner para dashboard con:
function renderDashboardContextBanner() {
  if (localStorage.getItem('ctx_dismissed_dashboard')) return '';
  const streak  = S.checkInStreak || 0;
  const habDone = (S.habits||[]).filter(h=>!h.deleted&&h.completedToday).length;
  const habTotal= (S.habits||[]).filter(h=>!h.deleted).length;
  const label   = streak > 0 ? `🔥 Día ${streak} de racha` : '⚡ Comienza tu racha hoy';
  return `<div class="context-banner" data-context-card="dashboard" style="min-height:unset;padding:10px 16px;gap:12px;align-items:center">
    <span style="font-size:1.1rem">${label}</span>
    <span style="opacity:.6;font-size:12px">${habDone}/${habTotal} hábitos hoy</span>
    <button class="btn-entendido" data-dismiss style="margin-left:auto">✕</button>
  </div>`;
}
```

En `styles.css`, asegurar que `.context-banner { min-height: unset; }` para que no fuerce 200px.

---

## BATCH 7 — Gemelo activación + Onboarding narrativo + Bottom nav dinámico

---

### [B7-1] Gemelo — CTA de activación cuando está en "OBSERVANDO EN SILENCIO"

La síntesis dice: *"Muestra 'OBSERVANDO EN SILENCIO / 1 DE 30 DÍAS' sin ningún CTA que explique qué datos necesita para activarse"*.

En `main.js`, buscar `OBSERVANDO EN SILENCIO` o `gemelo.*observando` con grep. En esa sección, agregar debajo del estado:

```js
// Después del texto "OBSERVANDO EN SILENCIO", agregar CTA contextual:
const checkIns = S.checkInStreak || 0;
const daysLeft = Math.max(0, 3 - checkIns); // necesita 3 días para activar
if (daysLeft > 0) {
  html += `<div class="gemelo-activation-hint">
    <span>Para activar tu Gemelo: ${daysLeft} día${daysLeft>1?'s':''} más de datos</span>
    <button onclick="navigate('flow')" class="btn-gemelo-cta">→ Ir a Hábitos</button>
  </div>`;
}
```

En `styles.css`:
```css
.gemelo-activation-hint { margin-top:16px; padding:12px 16px; background:rgba(168,85,247,.1); border:1px solid rgba(168,85,247,.25); border-radius:12px; font-size:13px; color:rgba(255,255,255,.7); display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
.btn-gemelo-cta { padding:6px 16px; background:rgba(168,85,247,.3); border:1px solid rgba(168,85,247,.5); border-radius:8px; color:#c084fc; font-size:12px; cursor:pointer; white-space:nowrap; }
```

---

### [B7-2] Onboarding — reducir fricción a 3 pasos, +100 Aura en paso 3

En `main.js`, buscar `showOnboarding` con grep. Verificar que:
1. **Paso 1**: solo nombre + selección de accent color (`data-color`) — sin más campos
2. **Paso 2**: preview inmediato de la app con el color elegido — llamar `setAccentColor(color)` al seleccionar, no al confirmar
3. **Paso 3**: al completar el onboarding, agregar:

```js
// Al completar onboarding (función completeOnboarding o el botón de "Comenzar"):
function completeOnboarding() {
  localStorage.setItem('onboardingComplete', 'true');
  awardXP(100, 'onboarding');
  showToast(
    document.body.dataset.mode === 'aura'
      ? '✦ +100 Aura — ¡Tu aventura comienza!'
      : '⚡ +100 XP — ¡Bienvenido a Life OS!'
  );
  if (window.emitBurst) emitBurst();
  // cerrar onboarding
}
```

Si `completeOnboarding` ya existe, solo agregar el bloque de `awardXP + showToast + emitBurst` dentro de ella.

---

### [B7-3] Bottom nav dinámico — reordenar BN_ORDER según _bnVisitCount

En `main.js`, buscar `BN_ORDER` con grep para encontrar la declaración. Buscar también `_bnVisitCount` o `bnVisitCount` con grep.

La función `reorderBottomNav()` debe:
1. Leer `_bnVisitCount` (objeto `{moduleId: count}`) de `S` o `localStorage`
2. Reordenar los módulos adyacentes al dashboard por frecuencia de visita (los más visitados más cerca del centro)
3. NO mover el dashboard (siempre en centro)

```js
function reorderBottomNavByUsage() {
  if (!S._bnVisitCount) return;
  const fixed = { id: 'dashboard', icon: '⚡', label: 'Tablero' };
  const modules = BN_ORDER.filter(m => m.id !== 'dashboard');
  modules.sort((a, b) => (S._bnVisitCount[b.id] || 0) - (S._bnVisitCount[a.id] || 0));
  // Reconstruir BN_ORDER: módulos más usados cerca del centro
  const left  = modules.slice(0, Math.floor(modules.length / 2)).reverse();
  const right = modules.slice(Math.floor(modules.length / 2));
  BN_ORDER.length = 0;
  BN_ORDER.push(...left, fixed, ...right);
  // Re-renderizar bottom nav
  if (typeof renderBottomNav === 'function') renderBottomNav();
}
```

Llamar `reorderBottomNavByUsage()` en el arranque después de cargar `S`.

En la función que registra visitas a módulos (buscar `_bnVisitCount` o `navigate(` con grep), incrementar el contador:
```js
S._bnVisitCount = S._bnVisitCount || {};
S._bnVisitCount[moduleId] = (S._bnVisitCount[moduleId] || 0) + 1;
_save(); // persistir
```

---

## BATCH 8 — Flow (restantes) + Cuerpo + Mente + World + Settings + Mobile

> Extraídos del reporte completo DEEP_2026-04-25.md del VPS.
> Los marcados con ✅ ya los resolvió el Batch 1 (fix scroll global S-1) — verificar antes de tocar.

---

### FLOW — Ítems no cubiertos en Batch 1-3

### [B8-F1] Flow/Hábitos — scroll no avanza (fold = scroll idénticos, 41 hábitos solo 2 visibles)

El fix global S-1 (Batch 1) cubrió `.module-content` pero el panel específico de hábitos puede tener su propio constraint. Verificar:

En `main.js`, buscar `renderHabits\|habitos-list\|habits-list\|flow-habits` con grep. Buscar el contenedor de la lista.
En `styles.css`, buscar `flow.*habitos\|habits-list\|tab-content.*flow` con grep.

Si el scroll sigue sin funcionar después de S-1, agregar:
```css
[data-flow-tab="habitos"] .habits-list,
#flow-habits-content,
.habitos-list { overflow-y: auto; max-height: none; }
```

---

### [B8-F2] Flow/Agenda — scroll no avanza + calendario sin estado visual "hoy" + sin event dots

Dos problemas en uno:

**Scroll:** misma causa que B8-F1. Verificar:
```css
[data-flow-tab="agenda"] .calendar-wrapper,
#flow-agenda-content { overflow-y: auto; }
```

**Datos vivos en calendario:**
En `main.js`, buscar `renderCalendarGrid\|renderCalendar\|calendar-cell` con grep. En la función que genera las celdas del mes, agregar:

```js
// Al generar cada celda del calendario:
const dateStr = formatDate(cellDate); // YYYY-MM-DD
const isToday  = dateStr === today();
const hasEvents = (S.tasks||[]).some(t => t.date === dateStr && !t.deleted)
               || (S.events||[]).some(e => e.date === dateStr);

cell.className = `calendar-cell ${isToday ? 'cal-today' : ''} ${hasEvents ? 'cal-has-events' : ''}`;
```

En `styles.css`:
```css
.cal-today { border: 2px solid #00ff88 !important; background: rgba(0,255,136,0.08); font-weight: 700; }
.cal-has-events::after {
  content: ''; display: block; width: 5px; height: 5px; border-radius: 50%;
  background: #00ff88; margin: 2px auto 0;
}
```

---

### [B8-F3] Flow/Hábitos — accent verde #00ff88 no aplicado en labels secundarios (títulos de sección, Energía de Flow)

El scope `[data-module="flow"]` existe pero los sub-componentes de hábitos no están dentro de ese scope o usan colores hardcoded.

En `styles.css`, agregar:
```css
[data-module="flow"] .section-title,
[data-module="flow"] .energy-card-title,
[data-module="flow"] .module-subtitle { color: var(--module-accent, #00ff88); }
[data-module="flow"] .flow-stat-value  { color: var(--module-accent, #00ff88); }
```

---

### [B8-F4] Flow/Hábitos — stat-cards (Flujo Continuo / Hábitos / Hoy) con padding excesivo y sin micro-dato contextual

```css
.flow-stat-card { padding: 16px 20px; min-height: unset; }
.flow-stat-value { font-size: 2.5rem; font-weight: 800; line-height: 1; }
```

En la función que renderiza la card "FLUJO CONTINUO" (buscar `flujo.*continuo\|flow.*stat` con grep), agregar sublabel:
```js
`<span class="flow-stat-sub">🏆 Mejor: ${S.bestStreak || 0} días</span>`
```

---

### [B8-F5] Flow/Hábitos — mini-heatmap 7 días por hábito + feedback visual al completar

En `renderHabit(habit)` (buscar con grep), agregar debajo de la barra de progreso:

```js
// Mini heatmap 7 días
const last7 = getLast7Days(); // helper que devuelve array YYYY-MM-DD
const dots = last7.map(d => {
  const done = (habit.history || {})[d];
  return `<span class="h-dot ${done ? 'done' : ''}"></span>`;
}).join('');
html += `<div class="habit-week-dots">${dots}</div>`;
```

En `styles.css`:
```css
.habit-week-dots { display: flex; gap: 4px; margin-top: 6px; }
.h-dot { width: 8px; height: 8px; border-radius: 50%; background: rgba(255,255,255,.15); }
.h-dot.done { background: #00ff88; box-shadow: 0 0 4px rgba(0,255,136,.4); }
```

Al hacer check (en `toggleHabit()`, buscar con grep), ya existe `emitBurst()`. Verificar que se llama Y que la animación sale de la posición de la card, no del centro de pantalla. Si `emitBurst()` usa coordenadas fijas, cambiar a:
```js
// Pasar posición del elemento tocado
const rect = habitCard.getBoundingClientRect();
emitBurst(rect.left + rect.width/2, rect.top + rect.height/2);
```
Si `emitBurst` no acepta coordenadas, agregar parámetros opcionales `(x, y)` a la función.

---

### [B8-F6] Flow/Ideas — 84 pendientes sin sistema de procesamiento guiado + push semanal

En `main.js`, buscar la función que renderiza el módulo de Ideas (buscar `renderIdeas\|flow.*ideas` con grep).

Agregar cuando `pendingCount > 20`:
```js
if (pendingCount > 20) {
  ideasHeader.insertAdjacentHTML('beforeend',
    `<div class="ideas-processing-hint">
       💡 ${pendingCount} ideas esperan · Procesa 3 hoy → <strong>+75 XP</strong>
       <button onclick="startIdeaProcessing()" class="btn-ideas-process">Procesar →</button>
     </div>`
  );
}
```

```css
.ideas-processing-hint { padding: 10px 16px; background: rgba(168,85,247,.1); border-radius: 10px; font-size: 13px; display:flex; align-items:center; gap:10px; margin-bottom:12px; }
.btn-ideas-process { padding: 4px 14px; border-radius: 8px; background: rgba(168,85,247,.3); border: 1px solid rgba(168,85,247,.5); color: #c084fc; font-size: 12px; cursor: pointer; }
```

Agregar `startIdeaProcessing()` básico que navega a ideas con filtro pendientes y muestra la primera idea en modo "focus":
```js
function startIdeaProcessing() {
  navigate('flow', 'ideas');
  // mostrar primera idea pendiente en modo focus (si existe)
  const first = (S.ideas||[]).find(i => i.status === 'pendiente' && !i.deleted);
  if (first) showIdeaFocusModal(first);
}
```

---

### CUERPO — 10 propuestas del análisis DEEP

### [B8-C1] Cuerpo/Peso — empty state "Añadir peso" en lugar de "— kg" ambiguo

En `main.js`, buscar `renderBodyStats\|peso.*card\|weight.*card\|'— kg'\|"— kg"` con grep. En el render de la card de peso:

```js
// Reemplazar el render del valor de peso:
const weightVal = S.userData?.weight;
weightEl.innerHTML = weightVal
  ? `<span class="body-stat-num">${weightVal}</span> <span class="body-stat-unit">kg</span>`
  : `<span class="body-stat-empty">Añadir peso</span>`;
if (!weightVal) weightEl.classList.add('empty-prompt');
```

```css
.body-stat-empty { color: rgba(255,107,53,0.6); font-size: 0.85rem; text-decoration: underline dotted; cursor: pointer; }
```

---

### [B8-C2] Cuerpo/Volumen — guard NaN + unidad faltante + guía contextual

En `main.js`, buscar `totalVolume\|renderVolume\|volume.*card\|'—'\|"—"` cerca del módulo Cuerpo con grep.

```js
// Guard NaN y unidad:
const rawVol = sessions.reduce((acc, s) => acc + (s.sets||0)*(s.reps||0)*(s.weight||0), 0);
const totalVolume = isNaN(rawVol) ? null : rawVol;
volEl.textContent = totalVolume !== null ? `${totalVolume.toFixed(0)} kg` : '—';

// Guía contextual cuando hay sesiones pero sin peso:
const hasSessions = sessions.length > 0;
const hasWeight   = sessions.some(s => s.weight > 0);
if (hasSessions && !hasWeight)
  volSubEl.textContent = 'Añade peso a tus series para calcular';
```

---

### [B8-C3] Cuerpo/Sesión-hoy banner — reducir padding (80px → 52px)

```css
.body-today-session,
[data-module="body"] .session-banner,
[data-module="cuerpo"] .session-cta-banner { padding: 10px 20px; min-height: unset; }
```

---

### [B8-C4] Cuerpo/Heatmap frecuencia — height dinámico según datos + empty state

En `main.js`, buscar `renderFrequencyHeatmap\|heatmap\|frecuencia.*entrenamiento` con grep. Después del render del heatmap:

```js
// Height dinámico:
const weeksWithData = Math.max(4, getTrainingWeeksCount() + 1);
heatmapEl.style.height = `${weeksWithData * 18 + 40}px`;

// Empty state:
if (totalActiveDays < 3) {
  heatmapEl.insertAdjacentHTML('beforeend',
    `<div class="heatmap-empty">Registra 3 sesiones para ver tu patrón de entrenamiento</div>`
  );
}
```

```css
.heatmap-empty { text-align: center; color: rgba(255,107,53,.5); font-size: 12px; padding: 16px; }
```

---

### [B8-C5] Cuerpo/Módulo — falta context banner dismissable (igual que otros módulos)

El banner de Cuerpo existe pero con diseño diferente. Verificar que `initContextCardDismiss('cuerpo')` se llama al renderizar el módulo (Batch 3 S-3/S-4 lo debería haber hecho). Si no se ve el dismiss, buscar `[data-context-card="cuerpo"]` en el DOM generado y confirmar que el selector coincide.

---

### MENTE — Propuestas adicionales (tabs ya fixeadas en Batch 1)

### [B8-M1] Mente/Gemelo — "OBSERVANDO EN SILENCIO" necesita contexto de activación

(Ya en Batch 7 como B7-1 — no duplicar)

### [B8-M2] Mente/Bitácora — estado vacío sin guía de primer uso

En `main.js`, buscar `renderBitacora\|bitacora.*empty\|panel.*bitacora` con grep. Si la Bitácora está vacía (sin entradas), mostrar:

```js
if (!entries || entries.length === 0) {
  bitacoraContent.innerHTML = `
    <div class="bitacora-empty">
      <div style="font-size:2rem">📝</div>
      <p>Tu Bitácora está vacía</p>
      <p style="opacity:.6;font-size:13px">Escribe tu primer pensamiento del día — tu Gemelo aprende de aquí</p>
      <button onclick="focusBitacoraInput()" class="btn btn-a" style="margin-top:12px">Escribir ahora</button>
    </div>`;
}
```

---

### [B8-M3] Mente/Aliados — estado vacío sin CTA para agregar primer aliado

Mismo patrón que Bitácora. En `renderAliados()` (buscar con grep), si lista vacía:
```js
if (!allies || allies.length === 0) {
  aliadosContent.innerHTML = `
    <div class="aliados-empty">
      <div style="font-size:2rem">🤝</div>
      <p>Sin aliados aún</p>
      <p style="opacity:.6;font-size:13px">Agrega a las personas clave en tu vida para hacer seguimiento del plan</p>
      <button onclick="openAddAllyModal()" class="btn btn-a" style="margin-top:12px">+ Primer Aliado</button>
    </div>`;
}
```

---

### [B8-M4] Mente/Biblioteca — estado vacío sin CTA para agregar primer libro/recurso

Mismo patrón. En `renderBiblioteca()`, si vacía mostrar:
```js
bibliotecaContent.innerHTML = `
  <div class="biblioteca-empty">
    <div style="font-size:2rem">📚</div>
    <p>Tu Biblioteca está vacía</p>
    <p style="opacity:.6;font-size:13px">Agrega libros, podcasts o recursos que estás consumiendo</p>
    <button onclick="openAddResourceModal()" class="btn btn-a" style="margin-top:12px">+ Primer Recurso</button>
  </div>`;
```

---

### WORLD — Propuestas adicionales (routing ya fixeado en Batch 1)

### [B8-W1] World/Mapa — leaderboard verificar accesibilidad tras fix scroll

El leaderboard nunca apareció en ningún screenshot. Con el fix S-1 debería ser visible. Verificar:
```bash
grep -n "renderLeaderboard\|leaderboard\|#leaderboard" main.js | head -10
```
Si `renderLeaderboard()` existe, confirmar que se llama en el render del módulo y que el DOM se genera completo sin requerir click. Si está lazy-loaded, cambiar a eager render.

---

### [B8-W2] World/Tienda — catálogo de muebles debe renderizar con grid visible

Tras el fix de Batch 1 (tabs World), verificar que al navegar a la tab "Tienda", el catálogo de items muestra un grid real. Si `renderShop()` existe pero devuelve una lista vacía, agregar mock items o el indicador correcto de "Tienda próximamente".

En `main.js`, buscar `renderShop\|render.*tienda\|shop.*items` con grep. Verificar que la función genera DOM visible.

---

### SETTINGS / PWA — Propuestas no cubiertas

### [B8-S1] Settings — toggle de notificaciones muestra estado correcto al cargar

Si el usuario ya tiene permiso concedido (`Notification.permission === 'granted'`), el toggle en Settings debe mostrarse como "activado" al cargar, no como "desactivado" hasta que el usuario interactúe.

En `initNotificationsToggle()` (buscar con grep), verificar:
```js
const alreadyGranted = Notification.permission === 'granted';
toggleEl.checked = alreadyGranted;
_updateNotifStatusUI(Notification.permission);
if (alreadyGranted) scheduleDailyReminders(); // B6-2 — iniciar scheduling
```

---

### [B8-S2] Settings — Modo Aura selector de color actualiza preview en tiempo real

El selector de color ya actualiza `--aura-accent` (Batch 4 ✅). Verificar que el preview de la paleta en Settings muestra los 8 colores preset con el color activo resaltado, y que al seleccionar uno el preview del accent en el mismo panel se actualiza sin recargar.

En `main.js`, buscar `renderColorPicker\|accent.*picker\|color.*preset` con grep. Al hacer click en un preset:
```js
presetEl.addEventListener('click', () => {
  setAccentColor(color); // Batch 4 ya lo hace
  // Asegurar feedback visual en el picker:
  document.querySelectorAll('.color-preset').forEach(p => p.classList.remove('active'));
  presetEl.classList.add('active');
});
```

---

### MOBILE — Propuestas no cubiertas (MOB-1/MOB-2 ya hechos)

### [B8-MOB1] Mobile/Android — topbar XP badge truncado en 360px (ya cubierto MOB-1, verificar)

MOB-1 hizo `#tb-coins { display:none }` en ≤380px. Verificar que el badge de racha (B6-4) también tiene regla para 360px:
```css
@media (max-width:380px) {
  #tb-streak { display: none; } /* ocultar en 360px si no hay espacio */
}
```

---

### [B8-MOB2] Mobile — FAB tapa contenido de Saldo y Racha en 360px (ya cubierto S-2, verificar)

S-2 (Batch 1) fijó `bottom: calc(80px + env(safe-area-inset-bottom))`. En 360px específicamente verificar que el saldo y la card de racha del Dashboard no quedan bajo el FAB. Si el contenido del Dashboard en mobile tiene un último row de cards que coincide con la posición del FAB, agregar:
```css
@media (max-width:640px) {
  .module-content { padding-bottom: calc(80px + env(safe-area-inset-bottom)); }
}
```

---

### [B8-MOB3] Mobile/iOS — safe-area en bottom nav (barra de gestos)

El bottom nav en iOS puede quedar sobre la barra de gestos si no tiene padding. Verificar:
```css
#bottom-nav,
.bottom-nav { padding-bottom: env(safe-area-inset-bottom); }
```

---

### [B8-MOB4] Mobile — Dashboard stat-cards "98 transacci..." truncado en 360px

MOB-2 (Batch 3) hizo `text-overflow:ellipsis` pero el contenido puede necesitar también `max-width`. Verificar:
```css
@media (max-width:400px) {
  .stat-card { max-width: calc(50vw - 16px); min-width: 0; }
  .stat-label { font-size: 10px; }
}
```

---

**Commit messages para estos batches:**
- Batch 6: `Feat: push notifications + blackout emocional + racha danger badge + hero banner live data`
- Batch 7: `Feat: gemelo CTA activación + onboarding friction fix + bottom nav dinámico`
- Batch 8: `Feat: Flow completo + Cuerpo empty states + Mente empty states + World/Settings/Mobile polish`

**NO hacer commit ni deploy — Claude se encarga.**
