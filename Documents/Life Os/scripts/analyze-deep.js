#!/usr/bin/env node
/**
 * OpenClaw AI Deep Analyst — Life OS
 * Versión: 2.0 (cobertura total, análisis real)
 *
 * - Auto-detecta TODOS los screenshots del último run
 * - Agrupa módulos relacionados en 9 llamadas temáticas
 * - Cada llamada recibe TODOS los screenshots del grupo
 * - Filtra screenshots de login para no gastar tokens en ellos
 * - maxOutputTokens: 5 000-6 000 por módulo + 5 000 síntesis (thinking deshabilitado)
 * - Síntesis ejecutiva final cross-módulo
 *
 * Uso:
 *   node scripts/analyze-deep.js
 */

'use strict';

require('dotenv').config({ path: '/opt/openclaw/.env' });
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs    = require('fs');
const path  = require('path');
const https = require('https');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const REPORTS_DIR    = process.env.QA_REPORTS_DIR || '/opt/openclaw/repo/lifeos/qa-reports';

if (!OPENAI_API_KEY) {
  console.error('[deep] ERROR: OPENAI_API_KEY no configurada en .env');
  process.exit(1);
}

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

// ══════════════════════════════════════════════════════════════
// CARGAR Y AGRUPAR SCREENSHOTS
// ══════════════════════════════════════════════════════════════
function loadLatestScreenshots() {
  // Si runner pasó QA_SHOTS_DIR, usar esa carpeta exacta (screenshots frescos del run actual)
  const explicitDir = process.env.QA_SHOTS_DIR;

  let shotsDir, runLabel;
  if (explicitDir && fs.existsSync(explicitDir)) {
    shotsDir = explicitDir;
    runLabel  = path.basename(explicitDir);
  } else {
    const base = path.join(REPORTS_DIR, 'screenshots');
    if (!fs.existsSync(base)) return { dir: null, files: [] };
    const dirs = fs.readdirSync(base)
      .filter(d => fs.statSync(path.join(base, d)).isDirectory())
      .sort().reverse();
    if (!dirs.length) return { dir: null, files: [] };
    shotsDir = path.join(base, dirs[0]);
    runLabel  = dirs[0];
  }

  log(`Run de screenshots: ${runLabel}`);

  const files = fs.readdirSync(shotsDir)
    .filter(f => f.match(/\.(jpg|png)$/))
    .sort()
    .map(f => ({
      filename: f,
      name: f.replace(/\.(jpg|png)$/, ''),
      mime: f.endsWith('.png') ? 'image/png' : 'image/jpeg',
      data: fs.readFileSync(path.join(shotsDir, f)).toString('base64'),
    }));

  return { dir: runLabel, files };
}

function buildGroups(files) {
  // Separar login real de módulos
  const loginOnly  = files.filter(f => f.filename === '01-auth-login.jpg' || f.filename === '01-auth-login.png');
  const moduleFiles = files.filter(f => f.filename !== '01-auth-login.jpg' && f.filename !== '01-auth-login.png');
  const responsive = moduleFiles.filter(f => f.filename.startsWith('responsive-'));
  const desktop    = moduleFiles.filter(f => !f.filename.startsWith('responsive-'));

  const pick = (...prefixes) => desktop.filter(f => prefixes.some(p => f.filename.startsWith(p)));

  return [
    {
      id: 'landing-page',
      name: 'Landing Page Pública — Primera Impresión y Conversión',
      accent: 'Cyan #00e5ff + gradiente multicolor con los 8 preset colors del usuario',
      desc: `La landing page es la CARTA DE PRESENTACIÓN de Life OS. Es lo que ve un visitante ANTES de registrarse.
Objetivo: convertir visitantes escépticos en registros en menos de 10 segundos.
Features diferenciadores que DEBEN estar destacados: Gemelo Potenciado (IA personalizada), Life OS World (mapa gamificado), Plan Amigos (productividad social), Rachas de hábitos (heatmap + streaks), XP y niveles, toda la vida como RPG.

LAYOUT STATUS: El bug del espacio vacío en el hero YA ESTÁ CORREGIDO. La sección hero (.lp-hero) ahora tiene padding:56px 24px 64px y el contenido aparece justo debajo del nav. Si aún ves espacio vacío en el screenshot 00-landing-fold, diagnostica la causa residual específica y propón el fix.

PROPUESTA A EVALUAR Y MEJORAR: El usuario quiere que el título del hero (actualmente con gradiente estático cyan→purple→green) tenga una animación que CICLA a través de los 8 colores preset de la app con efecto glitch entre transiciones. Esto comunicaría visualmente que "tu color puede ser cualquiera de estos" y haría la landing memorable. Evalúa si esta idea es buena para conversión, cómo implementarla en CSS (keyframes + @property para el gradiente, clip-path glitch), y qué ajustes de timing/suavidad harían que se vea premium en lugar de genérico.

SCROLLBAR: El .lp-scroll tiene scrollbar-width:thin para desktop, pero en mobile el contenido bajo el fold (secciones de módulos, pasos, testimonios, pricing) podría ser completamente inaccesible si no hay señal visual de que hay contenido abajo. Evalúa si hay indicadores de scroll (flecha animada, fade gradient en el borde inferior, etc.) y si falta alguno.`,
      shots: [
        ...files.filter(f => f.filename.startsWith('00-landing')),
        ...files.filter(f => f.filename.startsWith('responsive-') && f.filename.includes('landing')),
        ...loginOnly,
      ],
      maxTokens: 6000,
    },
    {
      id: 'auth-onboarding',
      name: 'Auth, Onboarding, Blackout y Paywall',
      accent: 'Sin accent específico',
      desc: 'Pantalla de login/registro, flujo de onboarding, estado BLACKOUT (puntos críticos perdidos) y paywall. ' +
            'Es la PRIMERA experiencia del usuario — define si se queda o se va.',
      shots: [...loginOnly, ...pick('02-', '03-', '04-')],
      maxTokens: 5000,
    },
    {
      id: 'dashboard-stats',
      name: 'Dashboard (Tablero) y Análisis/Stats',
      accent: '#00e5ff cyan (Dashboard XP) · var(--aura-accent) pastel (Dashboard Aura) · #6366f1 índigo (Stats)',
      desc: 'Dashboard = vista principal: saludo dinámico, radar chart, anillo SVG Gemelo, focus bars, check-in, widget saldo, tareas.\n\n' +
            'NUEVO — DASHBOARD INTELIGENTE: si el toggle está activado, encima del ui-grid aparece ' +
            '#db-dynamic-shortcuts con 3 botones de acceso rápido a los módulos más visitados. ' +
            'Cada botón muestra ícono del módulo, nombre y "N visitas". ' +
            'Si está vacía la sección (toggle ON pero sin historial de visitas) → correcto, es expected.\n\n' +
            'MODO XP vs MODO AURA en Dashboard: en Aura el radar chart debe tener grid lines pastel ' +
            '(no cyan), los stat-cards tienen glassmorphism, el label "⭐ Nivel Actual" debe ' +
            'mostrar "✦ Esencia Actual". Si los colores siguen siendo cyan en Aura → bug.\n\n' +
            'Stats/Gamificación: leaderboard (siempre alias, nunca nombre real), XP total/Aura Total, ' +
            'nivel/Esencia, logros, métricas de uso.',
      shots: pick('05-', '11-'),
      maxTokens: 6000,
    },
    {
      id: 'finanzas',
      name: 'Módulo Financiero',
      accent: '#fbbf24 dorado · verde #00C851 para positivo · rojo para negativo',
      desc: 'Control financiero completo: múltiples saldos, historial de transacciones, pie charts por categoría, ' +
            'deudas, cards. Los números son protagonistas — tipografía monospace, tamaños grandes. ' +
            'El usuario debe ver de un vistazo si va bien o mal con su dinero.',
      shots: pick('06-'),
      maxTokens: 5000,
    },
    {
      id: 'flow-completo',
      name: 'Flow — Hábitos, Agenda/Calendario, Productividad, Ideas y Metas',
      accent: '#00ff88 verde neón',
      desc: 'Módulo de productividad unificado. Hábitos: heatmap de constancia, racha de días, indicador de batería por hábito. ' +
            'Agenda/Calendario: grid mensual, eventos, planes sociales con aliados. ' +
            'Ideas: captura rápida vía FAB. Metas: progreso global, objetivos de vida con fecha límite. ' +
            'Todas las tabs deben tener identidad propia dentro del acento verde neón.',
      shots: pick('07-', '13-', '14-'),
      maxTokens: 6000,
    },
    {
      id: 'cuerpo',
      name: 'Módulo Cuerpo',
      accent: '#ff6b35 naranja fuego · fondo casi negro',
      desc: 'Físico y bienestar: muscle map NPC interactivo (SVG con grupos musculares coloreados según trabajo reciente), ' +
            'volumen de entrenamiento por grupo, rutinas frecuentes, check-in de combustible diario (proteína, desayuno, sueño). ' +
            'Debe sentirse oscuro, muscular, energético — como una app de gym premium.',
      shots: pick('08-'),
      maxTokens: 5000,
    },
    {
      id: 'mente-gemelo',
      name: 'Mente & Poder y Gemelo Potenciado',
      accent: '#a855f7 púrpura',
      desc: 'Mente tiene tres tabs: Bitácora (diario personal, victorias del día, modo editorial), ' +
            'Gemelo (IA que analiza patrones del usuario — avanza progresivamente según uso, ' +
            'NO se muestra hasta que hay datos suficientes), Poder (aliados, solicitudes de amistad, presencia social). ' +
            'El Gemelo es el feature más diferenciador de la app — debe comunicar que crece con el usuario.\n\n' +
            'IMPORTANTE — Biblioteca de Mente: El screenshot 15-mente-biblioteca muestra la tab de Biblioteca ' +
            'con una LISTA DE LIBROS (título, autor, barra de progreso de lectura, botón "Leer"). ' +
            'Esto es el estado CORRECTO de la biblioteca — NO es un bug ni una sesión de lectura bloqueando la UI. ' +
            'El overlay "#book-focus-overlay" (SESIÓN DE LECTURA · ENFOQUE TOTAL) es un elemento SIEMPRE OCULTO ' +
            '(display:none) que el runner QA nunca activa. Si ves contenido de libros en Mente, es correcto y esperado.',
      shots: pick('09-', '15-'),
      maxTokens: 6000,
    },
    {
      id: 'world-tienda',
      name: 'Life OS World y Tienda de Decoración',
      accent: '#06b6d4 teal · cinematográfico',
      desc: 'World = mapa gamificado del mundo del usuario: zonas desbloqueables, burbuja del usuario con color y emoji, ' +
            'sistema de presencia social. Tienda = catálogo de muebles/rooms para el apartamento virtual, ' +
            'compra con XP (NO coins). Apartamento = espacio personalizable del usuario.',
      shots: pick('12-', '16-'),
      maxTokens: 5000,
    },
    {
      id: 'fab-nlp',
      name: 'FAB Consola Universal — NLP, Semántica y Routing',
      accent: 'Cyan #00e5ff — es el feature más "Jarvis" de la app',
      desc: 'La FAB es la consola universal de Life OS. El usuario escribe en lenguaje natural y la app detecta automáticamente adónde enviar la información.\n' +
            'NLP detecta: gastos, ingresos, tareas, hábitos, eventos, ideas, metas, bitácora.\n' +
            'Typo correction: diccionario ~50 palabras + Levenshtein(distancia=1).\n' +
            'Los screenshots 17-fab-* muestran el resultado visual de cada batería de casos NLP.\n' +
            'Evalúa: routing correcto, preview claro, feedback de error, gaps semánticos en español mexicano.',
      shots: pick('17-'),
      maxTokens: 6000,
    },
    {
      id: 'tech-settings',
      name: 'Settings, Modo XP/Aura, Dashboard Inteligente, Stripe y PWA',
      accent: 'Accent global del usuario',
      desc: 'Settings tiene tres secciones clave que verificar:\n\n' +
            '1. SELECTOR DE MODO VISUAL (VM selector): dos pills #vm-pill-xp y #vm-pill-aura. ' +
            'La pill activa debe tener border y background destacados. ' +
            'Verifica que cambiar de modo actualiza el body[data-mode] en tiempo real sin recarga.\n\n' +
            '2. DASHBOARD INTELIGENTE: toggle #dynamic-dashboard-toggle. ' +
            'Con toggle ON aparece info de que la app aprende el comportamiento del usuario. ' +
            'Con toggle OFF → info oculta. Verifica que el toggle tiene estado visual correcto.\n\n' +
            '3. GAMIFICACIÓN: filas "Esencia Actual" / "Aura Total" en Modo Aura, ' +
            '"Nivel Actual" / "XP Total" en Modo XP. Si hay discrepancia → bug de data-term.\n\n' +
            '4. SELECTOR DE COLOR DE ACENTO: 8 dots de colores. El elegido debe tener borde/selección visible. ' +
            'En Modo Aura, cambiar el dot debe actualizar toda la paleta Aura (--aura-accent) en tiempo real.\n\n' +
            'Stripe: plan badge, botón de suscripción. Admin: panel de agencias. PWA: manifest, offline.',
      shots: pick('10-', '18-', '19-', '20-'),
      maxTokens: 5000,
    },
    {
      id: 'mobile-responsive',
      name: 'Experiencia Mobile — Android 360×800 y iOS 390×844',
      accent: 'Comparativa Android vs iOS',
      desc: 'Screenshots de todos los módulos principales en dos viewports normalizados: ' +
            'Android Pixel 6a (360×800) y iPhone 14/15 (390×844). ' +
            'Evaluar: thumb zones, tap targets ≥44px, FAB no tapa nav inferior, ' +
            'safe area / notch en iOS, texto no desbordado, scroll horizontal ausente, ' +
            'identidad visual preservada en pantalla pequeña.\n\n' +
            'IMPORTANTE — Qué esperar en cada módulo mobile:\n' +
            '- Dashboard: anillo SVG de progreso, radar chart, lista de tareas, widget de saldo\n' +
            '- Flow/Hábitos: lista de hábitos con barra de batería, input para agregar hábito\n' +
            '- Finanzas: saldo, historial de transacciones, charts\n' +
            '- Mente/Biblioteca: LISTA DE LIBROS con título, autor y barra de progreso — estado CORRECTO\n' +
            '- Cuerpo: muscle map SVG, items de combustible\n' +
            '- World: mapa gamificado, burbuja del usuario\n' +
            'Si ves un screenshot con una lista de libros en el módulo Mente → es CORRECTO, no un bug.\n' +
            'NO reportar el elemento #book-focus-overlay como visible — siempre está display:none.',
      shots: responsive,
      maxTokens: 6000,
    },
  ].filter(g => g.shots.length > 0);
}

// ══════════════════════════════════════════════════════════════
// CONTEXTO BASE (enviado en cada llamada)
// ══════════════════════════════════════════════════════════════
const BASE_CONTEXT = `
Eres el equipo senior de Life OS (2026): QA Engineer, Frontend Dev, Product Designer (Linear/Superhuman 2026), Game Designer, Mobile UX Specialist, Retention Analyst, Push Notifications Strategist.

LIFE OS — PWA gamificada hispanohablantes 20-35. Stack: SPA (main.js+index.html), Firebase, Stripe, Chart.js.

MÓDULOS:
| Módulo | Icon | Accent | Tabs |
|---|---|---|---|
| Dashboard | ⚡ | #00e5ff | — |
| World | 🗺️ | #06b6d4 | — |
| Flow | ✅ | #00ff88 | Hábitos·Metas·Ideas·Agenda |
| Cuerpo | 💪 | #ff6b35 | Físico·Salud |
| Financiero | 💰 | #fbbf24 | — |
| Mente | 🧠 | #a855f7 | Bitácora·Gemelo·Poder |
| Stats | 📊 | #6366f1 | Análisis·Nexus |
| Settings | ⚙️ | — | VM selector, Dashboard toggle |

PRECIO: $99 MXN/mes (~$5 USD). NO reportar como problema. Gemelo (IA) vive en Mente→tab Gemelo. Flow absorbe Calendario.

MODO XP: neón cyan, Orbitron. Términos: "XP / Nivel / Racha Activa / Level Up". FAB: "+".
MODO AURA: glassmorphism, accent dinámico (8 presets vía _setAuraAccentVars()). Términos: "Aura / Esencia Actual / Flujo Continuo / Expansión". FAB: "✦". Claro: fondo #F7F8FC.
PRESETS: #00e5ff #4ade80 #a855f7 #fb923c #f472b6 #ffd700 #ff6b35 #60a5fa

BUGS AURA A DETECTAR:
- Botones cyan en Aura → falta override .btn-a
- Labels "Nivel/XP" en Aura → data-term bug
- Radar cyan en Aura → initRadarChart() no re-llamado
- Color siempre lavanda → bug _setAuraAccentVars()

DASHBOARD INTELIGENTE: toggle ON → #db-dynamic-shortcuts muestra top 3 módulos (ícono+nombre+"N visitas"). Sin historial → oculto (correcto).

SCREENSHOTS:
- _fold = above the fold. Vacío = BUG CRÍTICO.
- _scroll = 500px abajo.
- responsive-android-* = 360×800. responsive-ios-* = 390×844.
- 00-landing-fold sin CTA visible = BUG CRÍTICO conversión.

NUNCA REPORTAR: #book-focus-overlay, #pomo-ascension (siempre display:none). 15-mente-biblioteca = lista de libros = CORRECTO.
LANDING LAYOUT (post-fix): .lp-nav fijo 68px, .lp-scroll top:68px overflow-y:auto, .lp-hero padding:56px 24px 64px. Bug espacio vacío YA CORREGIDO.
`.trim();

// ══════════════════════════════════════════════════════════════
// PROMPT POR GRUPO
// ══════════════════════════════════════════════════════════════
function buildLandingPrompt(group) {
  const shotList = group.shots.map(s => s.name).join(', ');
  return `LANDING PAGE — ${group.shots.length} screenshots: ${shotList}

Analiza en orden:
1. LAYOUT: ¿00-landing-fold muestra CTA "Empezar gratis" y título sin scroll? Si hay espacio vacío, diagnóstica causa raíz y escribe el fix CSS exacto.
2. CONVERSIÓN: ¿Comunica los 6 diferenciadores (Gemelo IA, World, Aliados, Rachas, XP, RPG) before the fold? Propón copy mejorado del hero si es genérico.
3. ANIMACIÓN GLITCH: El título hero tiene gradiente estático. ¿Vale la pena hacerlo ciclar por los 8 presets con efecto glitch (transform:translateX + opacidad 0.15s)? Evalúa y escribe el CSS completo con prefers-reduced-motion fallback.
4. MOBILE: ¿iOS/Android tienen overflow horizontal o CTA cortado?
5. BENCHMARK: ¿Se siente como producto premium 2026 vs template?

---PROPOSALS---
- [TIPO] Landing: problema | SOLUCIÓN: código/copy exacto | PRIORIDAD: CRÍTICA/ALTA/MEDIA | IMPACTO: 1-5 | ESFUERZO: 1-5

---ANALYSIS---
## Landing Page
### 👁️ Screenshots (1 línea c/u)
### 🐛 Bugs + fix CSS
### 🎨 Animación glitch — CSS completo
### 📢 Features: qué brilla, qué falta, copy mejorado
### 📱 Mobile
### 🚀 Mejora #1 de conversión
### 💊 Salud: X/10 — [frase honesta]`;
}

function buildFABPrompt(group) {
  const shotList = group.shots.map(s => s.name).join(', ');
  return `FAB CONSOLA NLP — ${group.shots.length} screenshots: ${shotList}

parseLocalNLP() prioridad: idea/nota/sugerencia → victoria/logro/me siento → meta/objetivo/reto → cobré/recibí/me pagaron → gasté/pagué/uber/rappi → hice/fui al gym/corrí/medité → gasto+fecha → reunión/cita/evento/junta → task (default).
Typos: Levenshtein d=1 para ≥5 chars. Slang MX: "varos"=pesos, "me cayó el veinte"=tarea.

Analiza:
1. ROUTING: ¿El preview de cada screenshot muestra el módulo correcto?
2. GAPS: ¿Qué frases mexicanas naturales fallan? ("quedé de ir con X", "me prestaron 500", "cien pesos", "1,500" con coma, solo número "350", emoji 🏋️). Escribe el regex exacto para cada gap.
3. UX: ¿Preview claro antes de ejecutar? ¿Feedback de error? ¿Falta historial de comandos?
4. FEATURES: ¿Qué falta para que se sienta Jarvis? (voz, autocomplete, historial)

---PROPOSALS---
- [TIPO] FAB-NLP: problema | SOLUCIÓN: regex/código exacto para parseLocalNLP() | PRIORIDAD: CRÍTICA/ALTA/MEDIA | IMPACTO: 1-5 | ESFUERZO: 1-5

---ANALYSIS---
## FAB Consola NLP
### 👁️ Screenshots (1 línea c/u)
### 🎯 Routing: qué funciona, qué falla
### 🕳️ Gaps + regex exactos listos para implementar
### 🤖 Features para llegar a Jarvis
### 💊 Salud NLP: X/10 — [frase honesta]`;
}

function buildGroupPrompt(group) {
  if (group.id === 'landing-page') return buildLandingPrompt(group);
  if (group.id === 'fab-nlp')      return buildFABPrompt(group);

  const shotList = group.shots.map(s => s.name).join(', ');

  return `MÓDULO: ${group.name} | Accent: ${group.accent}
${group.shots.length} screenshots: ${shotList}
Contexto: ${group.desc}

Evalúa:
1. VISUAL: ¿Accent consistente en títulos/tabs/botones? ¿_fold comunica de inmediato el propósito?
2. DATOS: ¿NaN/undefined/$0.00/fechas inválidas? ¿Estados vacíos con personalidad?
3. PREMIUM 2026: ¿Touch targets ≥44px? ¿Glassmorphism ejecutado o genérico? ¿Micro-animaciones?
4. GAMIFICACIÓN: ¿XP visible por acción? ¿Feedback inmediato al completar? ¿Gancho para volver mañana?
5. MOBILE (si aplica): ¿Overflow? ¿Texto cortado? ¿Thumb zones OK?

---PROPOSALS---
- [TIPO] ${group.name}: problema | SOLUCIÓN: código CSS/JS exacto o línea en main.js/styles.css | PRIORIDAD: CRÍTICA/ALTA/MEDIA/BAJA | IMPACTO: 1-5 | ESFUERZO: 1-5

---ANALYSIS---
## ${group.name}
### 👁️ Screenshots (1-2 líneas c/u)
### 🐛 Bugs (causa raíz + archivo/función)
### 🎨 Visual (sé específico: tamaños, colores, jerarquía)
### 🎮 Gamificación y retención
### 🚀 Mejora #1 de este grupo (con implementación)
### 💊 Salud: X/10 — [frase honesta]`;
}

// ══════════════════════════════════════════════════════════════
// SÍNTESIS EJECUTIVA FINAL
// ══════════════════════════════════════════════════════════════
function buildSynthesisPrompt(groupResults, totalShots) {
  const allProposals = groupResults.flatMap(r => r.proposals);
  const criticals = allProposals.filter(p => p.includes('CRÍTICA'));
  const highs     = allProposals.filter(p => p.includes('ALTA'));
  const scores    = groupResults.map(r => `${r.group}: ${r.health || '?'}/10`).join(' | ');
  const topItems  = [...criticals, ...highs].slice(0, 15).map(p => `- ${p}`).join('\n');

  return `SÍNTESIS EJECUTIVA — ${totalShots} screenshots, ${groupResults.length} grupos, ${allProposals.length} propuestas (${criticals.length} críticas, ${highs.length} altas)

SALUD POR GRUPO: ${scores}

CRÍTICAS + ALTAS:
${topItems}

NOTA: Ignora cualquier mención de "SESIÓN DE LECTURA" o "book-focus-overlay" en módulos que no sean Mente/Biblioteca — es alucinación. 15-mente-biblioteca = lista de libros = correcto.

Escribe la síntesis ejecutiva que un fundador lee en 5 min:

## 🎯 SÍNTESIS EJECUTIVA — LIFE OS

### 🔴 Patrón sistémico crítico (máx 2 párrafos)
### ⚡ Top 5 por ROI (IMPACTO÷ESFUERZO)
1. **cambio** — Módulo | Impacto | Esfuerzo: BAJO/MEDIO/ALTO
### 🚨 Módulo más urgente + por qué
### 📱 Mobile: ¿usable en Android/iOS?
### 🎮 Gamificación: ¿el usuario siente progreso?
### 🗺️ Sprint 2 semanas (archivo exacto: main.js ~línea / styles.css)
**Día 1-2:** - [ ] módulo — qué — archivo — ROI
**Día 3-5:** - [ ] ...
**Semana 2:** - [ ] ...
### 💊 Salud global: X/10 — [¿lista para 100 usuarios?]`;
}

// ══════════════════════════════════════════════════════════════
// LLAMAR GEMINI (con retry + backoff)
// ══════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════
// OPENAI API (gpt-5.5 multimodal, con retry + backoff)
// ══════════════════════════════════════════════════════════════
function callGeminiOnce(content, maxTokens) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'gpt-5.5',
      messages: [
        { role: 'system', content: BASE_CONTEXT },
        { role: 'user', content },
      ],
      max_completion_tokens: Math.min(maxTokens, 8000),
    });
    const options = {
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Length': Buffer.byteLength(body),
      }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) return reject(new Error(`API error ${res.statusCode}: ${json.error.message}`));
          const choice  = json?.choices?.[0];
          const text    = choice?.message?.content;
          const refusal = choice?.message?.refusal;
          const finish  = choice?.finish_reason;
          if (text) resolve(text);
          else reject(new Error(`Respuesta vacía (${res.statusCode}) finish=${finish} refusal=${refusal} raw=${data.slice(0, 400)}`));
        } catch(e) { reject(new Error(`Parse error: ${e.message} — raw: ${data.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function callGemini(content, maxTokens, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await callGeminiOnce(content, maxTokens);
    } catch (e) {
      const isRateLimit = e.message.includes('429') || e.message.toLowerCase().includes('quota') || e.message.toLowerCase().includes('rate');
      const isEmptyContent = e.message.includes('vacía') || e.message.includes('content": ""');
      const isRetryable = !isEmptyContent && (isRateLimit || e.message.includes('ECONNRESET') || e.message.includes('socket') || e.message.includes('503'));
      if (attempt < retries && isRetryable) {
        const wait = isRateLimit ? 30000 : 8000 * attempt;
        log(`⚠️ Intento ${attempt}/${retries} fallido — ${e.message.slice(0, 80)} — reintentando en ${wait/1000}s...`);
        await new Promise(r => setTimeout(r, wait));
      } else {
        throw e;
      }
    }
  }
}

// ══════════════════════════════════════════════════════════════
// PARSEAR RESPUESTA
// ══════════════════════════════════════════════════════════════
function parseResponse(raw) {
  const propStart = raw.indexOf('---PROPOSALS---');
  const analStart = raw.indexOf('---ANALYSIS---');
  if (propStart !== -1 && analStart !== -1 && propStart < analStart) {
    const proposals = raw.slice(propStart + 15, analStart).trim()
      .split('\n').filter(l => l.trim().match(/^-\s*\[/)).map(l => l.trim());
    const analysis = raw.slice(analStart + 14).trim();
    const healthMatch = analysis.match(/💊 Salud.*?(\d+)\/10/);
    return { analysis, proposals, health: healthMatch ? healthMatch[1] : null };
  }
  const healthMatch = raw.match(/💊 Salud.*?(\d+)\/10/);
  return { analysis: raw.trim(), proposals: [], health: healthMatch ? healthMatch[1] : null };
}

// ══════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════
async function main() {
  const now  = new Date();
  const pad  = n => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;

  log('═══ OpenClaw AI DEEP Analyst v2.0 ═══');

  const { dir, files } = loadLatestScreenshots();
  if (!files.length) {
    log('ERROR: No se encontraron screenshots. Corre runner.js primero.');
    process.exit(1);
  }
  log(`Total screenshots encontrados: ${files.length}`);

  const groups = buildGroups(files);
  const totalShots = groups.reduce((acc, g) => acc + g.shots.length, 0);
  const loginShots = files.length - totalShots;

  log(`Grupos temáticos: ${groups.length}`);
  log(`Screenshots a analizar: ${totalShots} (${loginShots} de login excluidos para ahorrar tokens)`);
  groups.forEach(g => log(`  📦 ${g.name}: ${g.shots.length} screenshots`));

  // Estimación de costo (Gemini 2.5 Flash: ~$0.075/1M input, ~$0.30/1M output)
  const estInputTokens  = totalShots * 258 + groups.length * 3000;
  const estOutputTokens = groups.reduce((a, g) => a + g.maxTokens, 0) + 5000;
  const estCost = (estInputTokens / 1e6 * 0.075) + (estOutputTokens / 1e6 * 0.30);
  log(`Estimación de costo: ~$${estCost.toFixed(3)} USD`);
  log('Iniciando análisis...\n');

  const groupResults = [];
  const allProposals = [];

  // ── Analizar cada grupo ──────────────────────────────────────
  for (const group of groups) {
    log(`▶ Analizando: ${group.name} (${group.shots.length} shots, max ${group.maxTokens} tokens output)...`);

    try {
      const prompt = buildGroupPrompt(group);
      const content = [{ type: 'text', text: prompt }];

      // Intercalar screenshots con etiquetas de nombre (cap 8 para no saturar contexto)
      const shotsToSend = group.shots.slice(0, 8);
      for (const shot of shotsToSend) {
        content.push({ type: 'text', text: `\n📸 ${shot.name}` });
        content.push({ type: 'image_url', image_url: { url: `data:${shot.mime};base64,${shot.data}`, detail: 'low' } });
      }

      const raw = await callGemini(content, group.maxTokens);
      const { analysis, proposals, health } = parseResponse(raw);

      groupResults.push({ group: group.name, analysis, proposals, health });
      allProposals.push(...proposals);

      log(`✅ ${group.name} — ${proposals.length} propuestas · salud: ${health || '?'}/10`);

      // Pausa entre llamadas (evitar rate limiting)
      if (groups.indexOf(group) < groups.length - 1) {
        await new Promise(r => setTimeout(r, 4000));
      }
    } catch(e) {
      log(`❌ ${group.name} — Error: ${e.message}`);
      groupResults.push({ group: group.name, analysis: `Error en análisis: ${e.message}`, proposals: [], health: null });
    }
  }

  // ── Síntesis ejecutiva final ─────────────────────────────────
  log('\n▶ Generando síntesis ejecutiva final...');
  let synthesis = '';
  try {
    const synthParts = [{ type: 'text', text: buildSynthesisPrompt(groupResults, totalShots) }];
    synthesis = await callGemini(synthParts, 4096);
    log('✅ Síntesis generada');
  } catch(e) {
    log(`❌ Síntesis falló: ${e.message}`);
    synthesis = `Error en síntesis: ${e.message}`;
  }

  // ── Guardar reporte completo ─────────────────────────────────
  const reportPath = path.join(REPORTS_DIR, `DEEP_${stamp}.md`);
  let report = `# ANÁLISIS PROFUNDO LIFE OS — ${stamp}\n`;
  report += `> OpenClaw AI Deep Analyst v2.0\n`;
  report += `> ${files.length} screenshots del run · ${totalShots} analizados · ${loginShots} de login excluidos\n`;
  report += `> ${groupResults.length} grupos temáticos · ${allProposals.length} propuestas totales\n\n`;
  report += `---\n\n${synthesis}\n\n---\n\n`;
  report += `# ANÁLISIS DETALLADO POR GRUPO\n\n`;
  groupResults.forEach(r => {
    report += `---\n\n${r.analysis}\n\n`;
  });
  report += `---\n\n# TODAS LAS PROPUESTAS\n\n`;
  const criticals = allProposals.filter(p => p.includes('CRÍTICA'));
  const highs     = allProposals.filter(p => p.includes('ALTA') && !p.includes('CRÍTICA'));
  const rest      = allProposals.filter(p => !p.includes('CRÍTICA') && !p.includes('ALTA'));
  if (criticals.length) { report += `## 🔴 Críticas\n`; criticals.forEach(p => { report += `- [ ] ${p.replace(/^- /, '')}\n`; }); report += '\n'; }
  if (highs.length)     { report += `## 🟠 Altas\n`;    highs.forEach(p => { report += `- [ ] ${p.replace(/^- /, '')}\n`; }); report += '\n'; }
  if (rest.length)      { report += `## 🟡 Resto\n`;    rest.forEach(p => { report += `- [ ] ${p.replace(/^- /, '')}\n`; }); }

  fs.writeFileSync(reportPath, report, 'utf8');
  log(`\n📄 Reporte guardado: ${path.basename(reportPath)}`);

  // ── Output en consola ────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log(synthesis);
  console.log('═'.repeat(60));
  log(`─── ${allProposals.length} PROPUESTAS (${criticals.length} críticas, ${highs.length} altas) ───`);
  [...criticals, ...highs].forEach(p => log(`  ${p}`));
  log('═══ Deep Analyst v2.0 completado ═══');
}

main().catch(e => {
  console.error('[deep] ERROR:', e.message);
  process.exit(1);
});
