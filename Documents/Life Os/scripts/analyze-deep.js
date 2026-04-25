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
Eres el equipo senior completo detrás de Life OS en 2026 — la app que convierte la vida real en un RPG de productividad. Tienes roles simultáneos:

🔴 SENIOR QA ENGINEER (15 años) — detectas bugs funcionales, estados rotos, NaN/undefined, flujos que fallan silenciosamente.
🟠 SENIOR FRONTEND DEV — sabes exactamente qué archivo y línea está causando cada problema.
🟡 LEAD PRODUCT DESIGNER (Linear/Notion/Superhuman 2026) — en 2026 las apps premium tienen: glassmorphism con profundidad real, micro-animaciones con spring physics, tipografía con jerarquía perfecta, skeleton loaders, estados vacíos con personalidad, transiciones de estado fluidas.
🟢 GAME DESIGNER — gamificación psicológica. XP, streaks, recompensas variables, progresión visible, feedback inmediato y satisfactorio.
🔵 MOBILE UX SPECIALIST — mobile-first siempre. Touch targets 44px mínimo, thumb zones, una mano.
⚫ RETENTION ANALYST — sabes exactamente qué friction point hace que un usuario abandone en los primeros 7 días.
🟣 SENIOR PRODUCT ENGINEER / UX STRATEGIST (Push Notifications & Engagement) — diseñas ecosistemas de notificaciones push que generan hábito sin crear fatiga. Sabes cuándo, por qué y cómo enviar cada push: notificaciones de actividad pendiente con deep link directo a la pantalla correcta, recordatorios de racha antes de que se rompa, celebraciones de hito con vibración háptica, digests semanales de progreso con formato motivacional. Arquitecturas: Web Push API + FCM, service worker \`notificationclick\` con \`clients.openWindow(url)\` y deep linking por query param (\`?module=flow&action=checkin\`). Detectas cuándo la app tiene el canal pero no lo usa — e.g., botón de suscripción a push que existe pero no está conectado a recordatorios útiles. Tu output siempre incluye: (1) qué trigger envía el push, (2) el copy exacto del título + body, (3) la URL de deep link, (4) en qué archivo y función implementarlo.

═══════════════════════════════════════
LA APP: LIFE OS
═══════════════════════════════════════
PWA gamificada = Notion + Duolingo + RPG. El usuario gestiona su vida completa y gana XP.
Stack: SPA archivo único (main.js + index.html), Firebase Firestore/Auth, Stripe, GPT-4o, Chart.js.
Target: usuarios hispanohablantes 20-35 años que quieren productividad con engagement de videojuego.

ARQUITECTURA IMPLEMENTADA (abril 2026):
| Módulo       | Nav icon | Accent       | Tabs internas                          |
|-------------|----------|--------------|---------------------------------------|
| Dashboard   | ⚡        | cyan #00e5ff | — (con sección dinámica de accesos)   |
| World       | 🗺️        | teal #06b6d4 | —                                     |
| Flow        | 🌊        | verde #00ff88| Hábitos · Metas · Ideas · Agenda      |
| Cuerpo      | 💪        | naranja #ff6b35 | Físico · Salud                     |
| Financiero  | 💰        | dorado #fbbf24 | —                                   |
| Mente       | 🧠        | púrpura #a855f7 | Bitácora · Gemelo · Poder          |
| Stats       | 📊        | índigo #6366f1 | Análisis · Nexus                   |
| Settings    | ⚙️        | —            | (VM selector XP/Aura, Dashboard toggle)|

DECISIONES ARQUITECTURALES INAMOVIBLES:
- Flow ABSORBE el Calendario (tab Agenda dentro de Flow)
- Gemelo VIVE en Mente → tab "Gemelo". Flujo: Bitácora → Gemelo → insights.
- Cada módulo tiene CSS data-module scope con su accent color propio.
- El Gemelo NO muestra análisis hasta que hay suficientes datos del usuario.
- PRECIO: $99 MXN/mes ≈ ~$5 USD. NO es caro. No reportar precio como problema. Es intencional.

SISTEMA DUAL DE IDENTIDAD VISUAL — MOTOR PSICOGRÁFICO (implementado abril 2026):
La app tiene DOS modos que el usuario elige en Settings y persisten cross-device:

MODO XP (body sin data-mode o body[data-mode="xp"]):
- Estética gaming/cyberpunk: neón cyan #00e5ff, Orbitron, partículas, glow effects
- Terminología: "XP", "Nivel", "Racha Activa", "Level Up", "+ N XP"
- FAB muestra "+"
- Radar Chart: paleta cyan

MODO AURA (body[data-mode="aura"] — oscuro, o body[data-mode="aura"].light — claro):
- Estética ethereal/glassmorphism: cards con backdrop-filter blur, borders translúcidos, border-radius 20-28px
- Color: NO es fijo lavanda — se deriva del color de acento elegido por el usuario (8 presets).
  --aura-accent, --aura-accent2, --aura-rgb se setean dinámicamente en JS via _setAuraAccentVars()
  Ejemplo: si usuario eligió Rosa (#f472b6), el Aura será en tonos rosa suave, NO lavanda
- Terminología: "Aura" (no XP), "Esencia Actual" (no Nivel), "Flujo Continuo" (no Racha), "Expansión" (no Level Up)
- FAB muestra "✦"
- Modo claro Aura: fondo perla #F7F8FC, texto oscuro #2F3A5A, glassmorphism blanco

DETECCIÓN DE BUGS DE MODO AURA:
- Si en modo Aura ves botones con fondo cyan sólido → falta override CSS en .btn-a
- Si la barra de progreso sigue en cyan → no aplicó .xp-bar-fill gradient
- Si los labels dicen "Nivel Actual" o "XP Total" en lugar de "Esencia Actual" / "Aura Total" → data-term no se actualizó
- Si el color del Aura es siempre lavanda sin importar el acento del usuario → bug en _setAuraAccentVars()
- Si al cambiar de XP a Aura el radar chart no cambia de color → initRadarChart() no se llamó post-cambio

DASHBOARD INTELIGENTE (implementado abril 2026):
Toggle en Settings activa S.dynamicDashboard. Con ON: #db-dynamic-shortcuts muestra los 3 módulos
más visitados como accesos rápidos (lee _bnVisitCount de localStorage, se incrementa en navigate()).
Verifica: botones tienen ícono + nombre + "N visitas". Con toggle ON y sin uso previo → sección oculta (correcto).

CONVENCIÓN DE SCREENSHOTS:
- 00-landing-* = landing page pública (antes del login) — la carta de presentación
- _fold = lo primero que ve el usuario al abrir el módulo (above the fold)
- _scroll = 500px abajo (contenido below the fold)
- responsive-android-* = Android 360×800 (Pixel 6a)
- responsive-ios-* = iOS 390×844 (iPhone 14/15)
⚠️ Si _fold está vacío (solo fondo, sin contenido) = BUG DE LAYOUT crítico.
⚠️ Si en 00-landing-fold los botones CTA no se ven = BUG CRÍTICO de conversión.

ELEMENTOS SIEMPRE OCULTOS — NO REPORTAR COMO BUGS:
- #book-focus-overlay ("📖 SESIÓN DE LECTURA · ENFOQUE TOTAL") → display:none permanente. El runner QA nunca activa enterBookFocus(). Si lo ves en un screenshot es una anomalía del screenshot, no un bug de la app.
- #pomo-ascension → solo visible cuando el usuario inicia un Pomodoro manualmente.
- Si ves "SESIÓN DE LECTURA", "GESTIÓN DE LECTURA" o "ENFOQUE TOTAL" en módulos que no son Biblioteca/Mente → es una alucinación. NO reportarlo como bug global.

LANDING PAGE — CONTEXTO CLAVE (layout actual, post-fix):
La landing vive en <div id="landing-page"> con display:block; position:fixed; inset:0; overflow:hidden.
Nav (\`.lp-nav\`) tiene position:absolute; top:0; left:0; right:0; z-index:10 — altura real ~68px.
El scroll container (\`.lp-scroll\`) tiene position:absolute; top:68px; left:0; right:0; bottom:0; overflow-y:auto.
La sección hero (\`.lp-hero\`) está dentro de \`.lp-scroll\` con padding:56px 24px 64px.
BUG DEL ESPACIO VACÍO: YA CORREGIDO en esta versión. El hero ya NO tiene min-height ni align-items:center. El contenido aparece justo debajo del nav.

COLORES PRESET DE LA APP (ACCENT_PRESETS en main.js) — estos son los 8 colores que el usuario puede elegir al registrarse, y son el corazón visual del sistema:
#00e5ff Cyan, #4ade80 Verde, #a855f7 Violeta, #fb923c Naranja, #f472b6 Rosa, #ffd700 Oro, #ff6b35 Coral, #60a5fa Azul

FEATURES DIFERENCIADORES QUE DEBEN BRILLAR EN EL LANDING:
1. Gemelo Potenciado — IA que aprende los patrones del usuario y da insights personalizados
2. Life OS World — mapa gamificado del mundo donde vives con tu burbuja/avatar
3. Plan Amigos / Aliados — productividad social, rachas compartidas, presencia social
4. Rachas de Hábitos — heatmap de constancia, racha diaria, batería de hábito
5. Sistema de XP y Niveles — cada acción de la app otorga puntos, hay leaderboard
6. Gamificación total — la vida entera como un RPG: finanzas, salud, mente, agenda
`.trim();

// ══════════════════════════════════════════════════════════════
// PROMPT POR GRUPO
// ══════════════════════════════════════════════════════════════
function buildLandingPrompt(group) {
  const shotList = group.shots.map(s => s.name).join('\n  - ');
  return `${BASE_CONTEXT}

${'═'.repeat(60)}
ANÁLISIS ESPECIAL: LANDING PAGE — CONVERSIÓN Y PRIMERA IMPRESIÓN
${'═'.repeat(60)}

Screenshots del landing (${group.shots.length} en total):
  - ${shotList}

El screenshot 00-landing-fold es el MÁS IMPORTANTE. Muestra lo primero que ve un visitante.
Analiza PRIMERO ese screenshot con ojo clínico antes de los demás.

${'─'.repeat(60)}
DIMENSIÓN 1 — BUG DE LAYOUT (PRIORITARIO)
${'─'.repeat(60)}

Examina 00-landing-fold:
- ¿Hay un espacio vacío grande en la parte superior? ¿Cuánto espacio (% del viewport) hay antes del primer contenido visible?
- ¿Los botones "Empezar gratis →" y "Ya tengo cuenta" son visibles sin scroll?
- ¿El tag "Versión 2.0 — Ahora con IA", el título "El juego / de tu vida" y el subtítulo caben todos above the fold?
- Si hay espacio vacío: diagnóstica la causa raíz exacta. Estructura HTML: #landing-page (display:flex;flex-direction:column) → .lp-nav (hijo directo, ~53px) → .lp-scroll (flex:1;overflow-y:auto) → .lp-hero (antes tenía min-height:calc(100dvh-53px) con align-items:center — ese cálculo era el culpable). Propón el fix CSS específico con la regla exacta.

${'─'.repeat(60)}
DIMENSIÓN 2 — PROPUESTA DE ANIMACIÓN (EVALÚA Y MEJORA)
${'─'.repeat(60)}

IDEA DEL EQUIPO: El título del hero ("El juego / de tu vida") actualmente tiene un gradiente estático cyan→violeta→verde. La propuesta es que ese gradiente CICLE a través de los 8 colores preset de la app con efecto GLITCH entre cada transición.

Los 8 colores preset (en orden que forman una secuencia visual atractiva):
#00e5ff (Cyan) → #4ade80 (Verde) → #a855f7 (Violeta) → #f472b6 (Rosa) → #ffd700 (Oro) → #fb923c (Naranja) → #ff6b35 (Coral) → #60a5fa (Azul) → vuelta al Cyan

El efecto glitch: momentos breves de "corte digital" — desplazamiento horizontal rápido (transform:translateX) + cambio brusco de color + opacidad fluctuante — justo antes de que el gradiente cambie, durante ~0.15s.

Evalúa:
1. ¿Esta animación beneficia o perjudica la conversión? ¿Por qué? (Considera: distracción vs engagement, tiempo de atención, mensaje del producto)
2. ¿Qué ritmo es apropiado? (¿Cada cuántos segundos cambiar? ¿Muy rápido = confuso, muy lento = no se nota?)
3. ¿Cómo implementarlo en CSS puro? Usa @keyframes para la animación del gradiente, clip-path o transform para el glitch.
4. ¿Hay otras partes del landing donde aplicar los colores preset comunicaría mejor el "tu app, tu color"? (ej: los puntos de la sección pasos, bordes de módulos, etc.)
5. Escribe el CSS completo listo para copiar-pegar, aplicado a .lp-gradient-text, con fallback para prefers-reduced-motion.

${'─'.repeat(60)}
DIMENSIÓN 3 — CONTENIDO Y CONVERSIÓN
${'─'.repeat(60)}

La landing DEBE comunicar estos 6 features diferenciadores antes de que el visitante haga scroll:
1. Gemelo Potenciado (IA que aprende TUS patrones)
2. Life OS World (mapa gamificado donde vives)
3. Plan Amigos / Aliados (productividad social)
4. Rachas de Hábitos (heatmap, streaks, batería)
5. XP y Niveles (toda acción otorga puntos)
6. Tu vida entera como RPG

Con los screenshots disponibles:
- ¿Cuál de estos 6 features está bien comunicado?
- ¿Cuál está ausente o enterrado?
- ¿El copy del hero ("La única app de productividad que te trata como el protagonista de tu historia...") es suficientemente específico o es genérico? Propón versión mejorada.
- ¿La sección de módulos (00-landing-modules) muestra bien los módulos con su identidad visual?
- ¿La sección de pasos/cómo funciona es clara?

${'─'.repeat(60)}
DIMENSIÓN 4 — SCROLLABILIDAD Y DESCUBRIMIENTO
${'─'.repeat(60)}

- ¿Hay algún indicador visual de que hay contenido debajo del hero? (flecha animada, fade gradient, texto "↓ Ver más")
- En mobile (responsive-ios-landing, responsive-android-landing): ¿el hero cabe completo? ¿hay overflow horizontal?
- ¿El scroll del .lp-scroll funciona con naturalidad o hay hidden overflow que bloquea el scroll?

${'─'.repeat(60)}
DIMENSIÓN 5 — PRIMERA IMPRESIÓN Y BENCHMARK
${'─'.repeat(60)}

Compara mentalmente con landings de apps premium 2026 (Linear, Notion, Superhuman, Raycast):
- ¿La landing de Life OS se siente como un producto de $20/mes?
- ¿El glassmorphism del nav, las tarjetas de módulos y la sección pricing está bien ejecutado?
- ¿Hay elementos que se ven template/genérico vs elementos que se ven únicos de Life OS?
- ¿El CTA principal "Empezar gratis →" es suficientemente prominente y urgente?
- ¿Hay un "social proof" convincente? ¿Los testimonios se ven auténticos?

${'─'.repeat(60)}
FORMATO DE RESPUESTA:
${'─'.repeat(60)}

---PROPOSALS---
(Entre 8 y 12 propuestas — este grupo merece más porque es la cara pública de la app)
- [TIPO] Landing: descripción del problema | SOLUCIÓN: pega el CSS/JS/copy exacto listo para copiar | PRIORIDAD: CRÍTICA/ALTA/MEDIA | IMPACTO: 1-5 | ESFUERZO: 1-5 | CATEGORÍA: BUG/DISEÑO/CONVERSIÓN/ANIMACIÓN/COPY/MOBILE

---ANALYSIS---

## Landing Page — Primera Impresión y Conversión

### 👁️ Lo que veo en cada screenshot
[Para CADA screenshot, 2-3 oraciones. Sé específico sobre posiciones, tamaños, colores, qué se ve y qué falta]

### 🐛 Bug de layout — diagnóstico
[Análisis detallado del espacio vacío / CTA cut-off. Causa raíz exacta + fix CSS listo para implementar]

### 🎨 Animación de colores glitch — evaluación + implementación
[Evalúa la propuesta, mejórala si es necesario, escribe el CSS completo]

### 📢 Comunicación de features — qué brilla, qué falta
[Evalúa los 6 features diferenciadores. Copy mejorado del hero si aplica]

### 📱 Mobile
[iOS y Android — problemas específicos]

### 🚀 La mejora de mayor impacto para conversión
[Una sola mejora que más incrementaría registros. Con implementación detallada]

### 💊 Salud: X/10 — [una frase honesta sobre si esta landing convierte o no]`;
}

function buildFABPrompt(group) {
  const shotList = group.shots.map(s => s.name).join('\n  - ');
  return `${BASE_CONTEXT}

${'═'.repeat(60)}
ANÁLISIS ESPECIAL: FAB CONSOLA UNIVERSAL — NLP Y SEMÁNTICA
${'═'.repeat(60)}

Este es el feature más "Jarvis" de Life OS: el usuario escribe en lenguaje natural y la app detecta sola adónde enviar la info.
Es un diferenciador de producto brutal si funciona bien — y frustrante si falla.

Screenshots disponibles (${group.shots.length}):
  - ${shotList}

Cada screenshot de grupo (17-fab-tareas, 17-fab-gastos, etc.) muestra el estado visual después de ejecutar esa batería de casos.
Los screenshots 17-fab-abierto y 17-fab-nlp-final muestran la UI del FAB abierto y cerrado.

${'─'.repeat(60)}
CONTEXTO TÉCNICO DEL NLP ACTUAL
${'─'.repeat(60)}

parseLocalNLP() en main.js detecta (en orden de prioridad):
1. Ideas     — prefijo "idea:", "nota:", "sugerencia:", "apunta:"
2. Mood      — prefijo "victoria:", "logro:", "me siento", "hoy me di cuenta"
3. Meta      — prefijo "meta:", "objetivo:", "reto:", "quiero lograr"
4. Income    — keywords: cobré, recibí, me pagaron, sueldo, freelance, venta, depósito
5. Financial — keywords: gasté, pagué, uber, rappi, gasolina, farmacia, netflix, renta, etc.
6. Habit     — keywords de acción completada: hice, fui al gym, corrí, medité, completé, cumplí
7. Multi     — gasto + fecha → calendar + financial
8. Calendar  — keywords de evento: reunión, cita, evento, junta, llamada, vuelo, cumpleaños
9. Task      — default si nada más aplica

Typo correction: diccionario ~50 palabras + Levenshtein(distancia=1) para palabras ≥5 chars.
Claude Haiku como fallback premium (requiere API key del usuario).

BATERÍA DE CASOS PROBADOS:
Tareas: "comprar leche mañana", "llamar al médico esta semana", "traer el cargador y libreta"
Gastos: "gasté 150 en café", "gaste 80" (sin tilde), "uber 95 pesos", "rappi 230", "farmacia 340", "varos", "pagué estacionamiento" (sin monto), "me costó 50 varos"
Ingresos: "cobré 3500 freelance", "recibi 2000" (sin tilde), "me pagaron 1500", "venta de 800", "deposito de 5000"
Calendario: "reunión equipo mañana 10am", "reunion" (sin tilde), "cita doctor jueves", "cumpleaños Ana domingo", "vuelo GDL lunes 7am", "junta con el jefe miércoles"
Hábitos: "hice mi hábito de lectura", "fui al gym", "cori 5km" (typo), "medite 15min", "bebi 2 litros", "dormi 8 horas", "completé mi hábito de español"
Ideas: "idea: modo oscuro automático", "nota: revisar gemelo", "sugerencia: notif a las 9pm"
Bitácora: "victoria: terminé proyecto", "logro: pagué la deuda", "me siento muy productivo"
Metas: "meta: leer 12 libros", "objetivo: bajar 5 kilos", "reto: 30 días sin azúcar"
Multi: "pagar renta 4500 el 1ro", "entrené a las 7am en gym"
Typos: "cosinar", "manana", "aser", "jym", "meeting" (Spanglish)
Edge cases: "gasté como cien pesos" (monto en palabras), "1,500" (coma), "350" (solo número), emoji "🏋️", "gym" (una palabra), MAYÚSCULAS

${'─'.repeat(60)}
LO QUE DEBES ANALIZAR:
${'─'.repeat(60)}

1. ROUTING ACCURACY — ¿Los previews muestran el módulo correcto?
   - En los screenshots, ¿el preview (texto bajo el input) coincide con el módulo esperado?
   - ¿Hay casos donde claramente el routing fue incorrecto o genérico?
   - ¿El preview es lo suficientemente claro para que el usuario entienda qué va a pasar ANTES de ejecutar?

2. CASOS QUE PROBABLEMENTE FALLAN — aunque no veas el error, razona:
   - "gasté como cien pesos" — "cien" en letras, no número — ¿lo detecta?
   - "350" solo — ¿tarea o gasto?
   - "gym" una sola palabra — ¿hábito o tarea?
   - emojis en el texto — ¿los ignora o rompen algo?
   - "me costó 50 varos" — "varos" es slang mexicano para pesos — ¿lo detecta?
   - montos con coma: "1,500" vs "1500" — ¿ambos funcionan?

3. GAPS SEMÁNTICOS — ¿qué frases naturales en español NO están cubiertas?
   Piensa en cómo hablan usuarios mexicanos de 20-35 años:
   - "me cayó el veinte de que debo hacer X" → ¿tarea?
   - "oye apunta que..." → ¿idea o tarea?
   - "quedé de ir con X el sábado" → ¿calendario?
   - "se me acabó el dinero en X" → ¿gasto?
   - "me prestaron 500" → ¿ingreso o deuda?
   - "abono a la tarjeta 1000" → ¿gasto o deuda?
   - números escritos: "cien", "doscientos", "mil", "cinco mil"
   - horas: "a las 3 de la tarde", "en la mañana", "al mediodía"
   - fechas relativas: "en 3 días", "la próxima semana", "a fin de mes"
   Propón los keywords/regex exactos para cubrir cada uno.

4. UX DEL FAB — mira los screenshots con ojo de diseñador:
   - ¿El preview muestra suficiente información? ¿O el usuario no sabe qué va a pasar?
   - ¿El chip de confirmación tras ejecutar es claro y satisfactorio?
   - ¿Hay feedback de error cuando algo no se entiende bien?
   - ¿Debería haber un placeholder en el input que ejemplifique tipos de entrada?
   - ¿Falta un historial de los últimos comandos usados para reutilizar?

5. PROPUESTAS CONCRETAS DE SEMÁNTICA — escribe el código:
   Para cada gap importante que encuentres, propón el regex o keyword exacto.
   Formato: "Para detectar X: /regex_exacto/i en la variable lower, hacer result.modules.push('módulo')"
   Incluye al menos 5 propuestas de expansión semántica con código.

6. FEATURE IDEAS — ¿qué haría que este FAB se sintiera como el Jarvis de Iron Man?
   - ¿Debería haber confirmación opcional para el usuario antes de ejecutar?
   - ¿Shortcuts de teclado?
   - ¿Modo voz (Web Speech API)?
   - ¿Historial de los últimos 10 comandos?
   - ¿Sugerencias mientras escribe (como autocomplete)?
   - ¿El preview debería mostrar exactamente el estado antes vs después? (ej: "Saldo actual: $1,200 → después: $1,050")

${'─'.repeat(60)}
FORMATO DE RESPUESTA:
${'─'.repeat(60)}

---PROPOSALS---
(8-12 propuestas — mezcla de fixes de semántica con código listo, mejoras de UX y features)
- [TIPO] FAB-NLP: descripción | SOLUCIÓN: regex/código exacto listo para pegar en parseLocalNLP() o descripción precisa | PRIORIDAD: CRÍTICA/ALTA/MEDIA | IMPACTO: 1-5 | ESFUERZO: 1-5 | CATEGORÍA: NLP/UX/FEATURE/BUG

---ANALYSIS---

## FAB Consola Universal — Análisis de Semántica

### 👁️ Lo que veo en los screenshots
[Para cada screenshot del FAB, describe el estado visual. ¿Se ve el preview? ¿Qué módulo muestra? ¿Hay errores visibles?]

### 🎯 Routing accuracy — qué funciona y qué no
[Evalúa cada categoría: tareas, gastos, ingresos, calendario, hábitos, ideas, bitácora, metas, typos, edge cases]

### 🕳️ Gaps semánticos detectados
[Lista de frases naturales mexicanas que NO están cubiertas. Para cada una: frase → módulo esperado → regex/keyword propuesto]

### 💻 Código listo para implementar
[Al menos 5 expansiones de semántica con el regex o condición exacta, listo para copiar-pegar en parseLocalNLP()]

### 🤖 El FAB como Jarvis — propuestas de features
[Ideas de features que elevarían el FAB de "útil" a "adictivo". Sé concreto en implementación.]

### 💊 Salud NLP: X/10 — [¿Está este FAB listo para usuarios reales? Una frase honesta]`;
}

function buildGroupPrompt(group) {
  if (group.id === 'landing-page') return buildLandingPrompt(group);
  if (group.id === 'fab-nlp')      return buildFABPrompt(group);

  const shotList = group.shots.map(s => s.name).join('\n  - ');

  return `${BASE_CONTEXT}

${'═'.repeat(60)}
ANÁLISIS PROFUNDO: ${group.name.toUpperCase()}
${'═'.repeat(60)}

IDENTIDAD DE ESTE GRUPO:
Accent/paleta: ${group.accent}
Descripción funcional: ${group.desc}

Screenshots incluidos en este análisis (${group.shots.length} en total):
  - ${shotList}

${'─'.repeat(60)}
PROCESO DE RAZONAMIENTO OBLIGATORIO:
${'─'.repeat(60)}

Antes de escribir CUALQUIER propuesta, ejecuta internamente:
1. OBSERVAR — describe exactamente lo que ves en CADA screenshot. Sin interpretaciones aún.
2. CONECTAR — relaciona lo visual con lo funcional. ¿Qué problema revela cada imagen?
3. PROFUNDIZAR — para cada problema, pregunta "¿por qué?" mínimo 3 veces hasta la causa raíz.
4. PRIORIZAR — ¿qué impacto real tiene en retención, engagement y conversión?
5. PROPONER — soluciones específicas, implementables, con archivo/componente/línea si es posible.
6. VERIFICAR — ¿tu propuesta resuelve la causa raíz o solo el síntoma?

${'─'.repeat(60)}
DIMENSIONES DE ANÁLISIS PARA ESTE GRUPO:
${'─'.repeat(60)}

1. IDENTIDAD VISUAL
   - ¿El accent color (${group.accent}) se aplica consistentemente en titles, tabs activas, botones primarios y highlights?
   - ¿Este módulo es visualmente distinguible de los demás con solo un vistazo?
   - ¿El _fold comunica INMEDIATAMENTE qué hace este módulo? ¿O el usuario tiene que explorar para entenderlo?
   - ¿Hay jerarquía tipográfica clara? ¿Los datos importantes son los más prominentes?

2. DATOS Y ESTADO
   - ¿Los datos se muestran correctamente o hay NaN, undefined, $0.00, fechas inválidas?
   - ¿Los estados vacíos tienen personalidad y guían al usuario hacia la acción?
   - ¿Los skeleton loaders o spinners son apropiados para el tipo de contenido?
   - ¿Los gráficos/charts tienen animación de entrada, tooltips útiles y leyendas claras?

3. EXPERIENCIA PREMIUM 2026
   - ¿Se siente como una app de 2026 o de 2019? Sé honesto.
   - ¿Hay micro-animaciones satisfactorias en las interacciones clave?
   - ¿Los touch targets son ≥44px para todos los elementos interactivos?
   - ¿El spacing/padding respira o está apretado?
   - ¿El glassmorphism/dark mode está bien ejecutado o se ve genérico?

4. GAMIFICACIÓN Y RETENCIÓN
   - ¿El usuario ve claramente cómo sus acciones en este módulo afectan su XP/nivel?
   - ¿Hay feedback visual inmediato y satisfactorio al completar una acción?
   - ¿Este módulo tiene un "gancho" que haría que el usuario vuelva mañana?
   - ¿Qué es lo primero que haría que un usuario NUEVO cerrara este módulo en 30 segundos?

5. COHERENCIA CON EL SISTEMA
   - ¿Los componentes son consistentes con el estilo del resto de la app?
   - ¿La navegación entre sub-módulos o tabs es intuitiva?
   - ¿Los mensajes y textos son consistentes en tono y estilo?

${'─'.repeat(60)}
FORMATO DE RESPUESTA REQUERIDO:
${'─'.repeat(60)}

---PROPOSALS---
(Lista de propuestas específicas — entre 5 y 10, solo las que realmente se justifican con lo que ves)
- [TIPO] Nombre del módulo: descripción concisa del problema | SOLUCIÓN: código CSS/JS exacto listo para pegar, o descripción precisa de línea/función a cambiar en main.js o styles.css | PRIORIDAD: CRÍTICA/ALTA/MEDIA/BAJA | IMPACTO: 1-5 | ESFUERZO: 1-5 | CATEGORÍA: BUG/DISEÑO/GAMIFICACIÓN/RETENCIÓN/MOBILE/ARQUITECTURA
(TIPO puede ser: BUG, DISEÑO, UX, MOBILE, RETENCIÓN, GAMIFICACIÓN, PERFORMANCE, ARQUITECTURA)
(IMPACTO: 5=cambia retención/conversión, 1=cosmético. ESFUERZO: 1=10min, 5=día completo)

---ANALYSIS---

## ${group.name}

### 👁️ Lo que veo en los screenshots
[Para cada screenshot, 1-2 oraciones de observación pura — sin juicio todavía. Menciona el nombre del screenshot.]

### 🐛 Bugs funcionales detectados
[Lista numerada. Para cada bug: nombre, descripción exacta, causa raíz probable, archivo/función afectada si se puede inferir]

### 🎨 Diagnóstico visual
[Análisis de identidad visual, jerarquía, espaciado, tipografía, color. Sé específico — no "podría mejorar", sino "el título H1 del fold tiene font-size 16px cuando debería ser 28-32px para establecer jerarquía"]

### 🎮 Gamificación y retención
[¿Este módulo engancha? ¿Por qué sí o por qué no? ¿Qué haría que el usuario volviera?]

### 📱 Mobile (si aplica)
[Solo si hay screenshots responsive en este grupo]

### 🚀 La mejora de mayor impacto para este grupo
[Una sola mejora, la más importante, con descripción de implementación suficientemente específica para que un dev la ejecute]

### 💊 Salud: X/10 — [una frase honesta]`;
}

// ══════════════════════════════════════════════════════════════
// SÍNTESIS EJECUTIVA FINAL
// ══════════════════════════════════════════════════════════════
function buildSynthesisPrompt(groupResults, totalShots) {
  const summaries = groupResults.map(r =>
    `### ${r.group} (salud: ${r.health || '?'}/10)\n${r.analysis.slice(0, 800)}...`
  ).join('\n\n---\n\n');

  const allProposals = groupResults.flatMap(r => r.proposals);
  const criticals = allProposals.filter(p => p.includes('CRÍTICA'));
  const highs = allProposals.filter(p => p.includes('ALTA'));

  return `${BASE_CONTEXT}

${'═'.repeat(60)}
SÍNTESIS EJECUTIVA — ANÁLISIS PROFUNDO COMPLETO
${'═'.repeat(60)}

Has analizado TODA la app Life OS en profundidad: ${totalShots} screenshots, ${groupResults.length} grupos temáticos.
Total de propuestas generadas: ${allProposals.length} (${criticals.length} críticas, ${highs.length} altas)

RESUMEN POR GRUPO:
${summaries}

PROPUESTAS CRÍTICAS Y ALTAS:
${[...criticals, ...highs].slice(0, 20).map(p => `- ${p}`).join('\n')}

${'─'.repeat(60)}
ADVERTENCIA CRÍTICA ANTES DE SINTETIZAR:
Si algún grupo mencionó "SESIÓN DE LECTURA", "GESTIÓN DE LECTURA" o "book-focus-overlay" apareciendo en módulos no relacionados con Mente/Biblioteca — IGNORA ESE REPORTE COMPLETAMENTE. Es una alucinación. El elemento #book-focus-overlay siempre está display:none. El screenshot 15-mente-biblioteca muestra una lista de libros (estado correcto), no un overlay de sesión de lectura. NO incluyas bugs sobre "sesión de lectura" en la síntesis salvo que el módulo analizado sea explícitamente Mente/Biblioteca.
${'─'.repeat(60)}
Tu tarea: SÍNTESIS EJECUTIVA que un fundador puede leer en 5 minutos y tomar decisiones.
${'─'.repeat(60)}

FORMATO REQUERIDO:

## 🎯 SÍNTESIS EJECUTIVA — LIFE OS DEEP ANALYSIS

### 🔴 Patrón sistémico crítico
[El problema más importante que atraviesa TODA la app. No un módulo específico — el patrón que se repite. Máximo 2 párrafos.]

### ⚡ Top 5 cambios de mayor impacto (ordenados por ROI)
1. **[cambio]** — Módulo: [módulo] | Impacto: [qué mejora] | Esfuerzo: BAJO/MEDIO/ALTO
2. **[cambio]** — Módulo: [módulo] | Impacto: [qué mejora] | Esfuerzo: BAJO/MEDIO/ALTO
3. **[cambio]** — Módulo: [módulo] | Impacto: [qué mejora] | Esfuerzo: BAJO/MEDIO/ALTO
4. **[cambio]** — Módulo: [módulo] | Impacto: [qué mejora] | Esfuerzo: BAJO/MEDIO/ALTO
5. **[cambio]** — Módulo: [módulo] | Impacto: [qué mejora] | Esfuerzo: BAJO/MEDIO/ALTO

### 🚨 Módulo más urgente: [nombre]
[Por qué necesita atención inmediata — con datos de los screenshots]

### 📱 Estado del mobile
[¿La app es realmente usable en Android/iOS? ¿Qué es lo más urgente de mobile?]

### 🎮 Estado de la gamificación
[¿El sistema de XP/niveles/streaks está comunicado claramente? ¿El usuario siente que progresa?]

### 🔗 Coherencia cross-módulo
[¿Los módulos se sienten como parte de la misma app o como features sueltas con diseños diferentes?]

### 🌐 Landing page — estado de conversión
[¿La landing convierte? ¿El bug de hero está resuelto? ¿Los features diferenciadores brillan? ¿La animación de colores ayuda o distrae?]

### 🗺️ Sprint plan — próximas 2 semanas
Ordena por ROI = IMPACTO ÷ ESFUERZO. Incluye el módulo afectado y el archivo exacto (main.js o styles.css):

**Día 1-2 (quick wins ≤2h cada uno):**
- [ ] [módulo] — [qué hacer] — archivo: [main.js línea ~X / styles.css] — ROI: [impacto/esfuerzo]
- [ ] ...

**Día 3-5 (mejoras de medio día):**
- [ ] ...

**Semana 2 (estructurales, ≥1 día):**
- [ ] ...

### 💊 Salud global de Life OS: X/10
[Una sola frase honesta. Di si la app está lista para adquirir 100 usuarios o no.]`;
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
      messages: [{ role: 'user', content }],
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
      const isRetryable = isRateLimit || e.message.includes('ECONNRESET') || e.message.includes('socket') || e.message.includes('503') || e.message.includes('vacía');
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
