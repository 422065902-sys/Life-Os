#!/usr/bin/env node
/**
 * OpenClaw AI Analyst — Life OS
 * Versión: 2.0 (Vision + Propuestas)
 * Fecha: 2026-04-15
 *
 * Lee reportes QA + screenshots y genera diagnóstico visual con Gemini 2.5 Flash.
 * Produce análisis en el reporte + archivo PROPOSALS separado para revisión humana.
 *
 * Uso manual:
 *   node analyze.js
 *   REPORTS_DAYS=7 node analyze.js
 */

'use strict';

require('dotenv').config({ path: '/opt/openclaw/.env' });
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs   = require('fs');
const path = require('path');
const https = require('https');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const REPORTS_DIR    = process.env.QA_REPORTS_DIR  || '/opt/openclaw/repo/lifeos/qa-reports';
const SHOTS_DIR      = process.env.QA_SHOTS_DIR    || null;
const REPORTS_DAYS   = parseInt(process.env.REPORTS_DAYS || '3');

if (!GEMINI_API_KEY) {
  console.error('[analyze] ERROR: GEMINI_API_KEY no configurada en .env');
  process.exit(1);
}

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

// ══════════════════════════════════════════════════════════════
// LEER REPORTES
// ══════════════════════════════════════════════════════════════
function loadReports(dir, days) {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.md') && f.match(/^\d{4}-\d{2}-\d{2}/))
    .sort()
    .reverse()
    .slice(0, days);
  return files.map(f => {
    const full = fs.readFileSync(path.join(dir, f), 'utf8');
    // Extraer secciones clave: RESUMEN + FALLOS + ADVERTENCIAS (sin tablas detalladas)
    const sections = [];
    const addSection = (header) => {
      const idx = full.indexOf(header);
      if (idx === -1) return;
      const end = full.indexOf('\n## ', idx + header.length);
      sections.push(full.slice(idx, end === -1 ? idx + 800 : end).slice(0, 800));
    };
    addSection('## RESUMEN');
    addSection('## FALLOS CRÍTICOS');
    addSection('## ADVERTENCIAS');
    const content = sections.length > 0
      ? sections.join('\n\n')
      : full.slice(0, 1500);
    return { name: f, content };
  });
}

// ══════════════════════════════════════════════════════════════
// CARGAR SCREENSHOTS
// ══════════════════════════════════════════════════════════════
function loadScreenshots(shotsDir) {
  if (!shotsDir || !fs.existsSync(shotsDir)) {
    // Intentar encontrar la carpeta de screenshots más reciente
    const screenshotsBase = path.join(REPORTS_DIR, 'screenshots');
    if (!fs.existsSync(screenshotsBase)) return [];
    const dirs = fs.readdirSync(screenshotsBase).sort().reverse();
    if (!dirs.length) return [];
    shotsDir = path.join(screenshotsBase, dirs[0]);
  }

  const allFiles = fs.readdirSync(shotsDir)
    .filter(f => f.endsWith('.jpg') || f.endsWith('.png'))
    .sort();

  // Priorizar screenshots de módulos (_fold) sobre auth y scroll
  // Orden: fold de módulos primero, luego responsive, luego scroll, al final auth
  const foldShots      = allFiles.filter(f => f.includes('_fold') && !f.includes('auth'));
  const responsiveShots = allFiles.filter(f => f.startsWith('responsive-'));
  const scrollShots    = allFiles.filter(f => f.includes('_scroll'));
  const authShots      = allFiles.filter(f => f.includes('auth'));
  const otherShots     = allFiles.filter(f =>
    !f.includes('_fold') && !f.includes('_scroll') &&
    !f.startsWith('responsive-') && !f.includes('auth')
  );

  const ordered = [...foldShots, ...responsiveShots, ...scrollShots, ...otherShots, ...authShots];
  const files = ordered; // sin límite — se envían TODOS los screenshots (Gemini 2.5 Flash soporta hasta 3600 imágenes)

  return files.map(f => ({
    name: f.replace(/\.(jpg|png)$/, ''),
    mime: f.endsWith('.png') ? 'image/png' : 'image/jpeg',
    data: fs.readFileSync(path.join(shotsDir, f)).toString('base64')
  }));
}

// ══════════════════════════════════════════════════════════════
// CONSTRUIR PROMPT MULTIMODAL
// ══════════════════════════════════════════════════════════════
function buildParts(reports, screenshots) {
  const today   = reports[0];
  const history = reports.slice(1);

  const historyText = history.length > 0
    ? history.map(r => `### ${r.name}\n${r.content}`).join('\n\n---\n\n')
    : 'Sin reportes históricos.';

  const hasScreenshots = screenshots.length > 0;

  const textPrompt = `<identity>
Eres una instancia del modelo de inteligencia artificial más avanzado disponible en 2026. Tu arquitectura combina razonamiento extendido profundo (como Claude Opus), visión multimodal de alta precisión (como Gemini Vision), y conocimiento especializado en producto, diseño y engineering de clase mundial.

CÓMO DEBES RAZONAR — esto es crítico:
Antes de generar cualquier propuesta, ejecuta internamente este proceso de pensamiento:

1. OBSERVAR sin juicio — ¿qué ves exactamente en los screenshots y reportes? Datos crudos.
2. CONECTAR — ¿qué relación hay entre lo que ves visualmente y lo que reportan los tests?
3. PROFUNDIZAR — para cada problema, pregúntate "¿y por qué?" al menos 3 veces hasta llegar a la causa raíz real, no el síntoma superficial.
4. PRIORIZAR con criterio — ¿qué impacto real tiene esto en retención, engagement, conversión?
5. PROPONER con precisión quirúrgica — no descripciones vagas. Soluciones específicas, implementables, con el componente o línea de código afectada si es posible.
6. VERIFICAR tu razonamiento — ¿tu propuesta resuelve la causa raíz o solo el síntoma?

No tienes prisa. La calidad del análisis es más importante que la velocidad. Piensa en cadena larga antes de responder.
</identity>

Eres el equipo completo detrás de una app de clase mundial en 2026. Tienes TODOS estos roles simultáneamente y debes pensar desde cada uno:

## TUS ROLES

🔴 SENIOR QA ENGINEER — 15 años de experiencia. Detectas bugs funcionales, estados rotos, datos NaN/undefined, flujos que fallan silenciosamente. Nada se te escapa.

🟠 SENIOR FRONTEND DEVELOPER — Experto en SPA, Firebase, performance web. Sabes exactamente qué línea de código está causando el problema y cómo arreglarlo.

🟡 LEAD PRODUCT DESIGNER — Trabajaste en Linear, Notion, Superhuman. Sabes que cada píxel comunica algo. En 2026 las apps premium tienen: glassmorphism con profundidad real, micro-animaciones con spring physics, tipografía con jerarquía perfecta, espaciado que respira, estados vacíos con personalidad, skeleton loaders en lugar de spinners, transiciones fluidas entre estados.

🟢 GAME DESIGNER — Especialista en gamificación psicológica. Sabes cómo hacer que el usuario quiera volver. XP, niveles, streaks, recompensas variables, progresión visible, feedback inmediato. Cada interacción debe sentirse satisfactoria.

🔵 MOBILE UX SPECIALIST — Piensas mobile-first siempre. Touch targets de 44px mínimo, gestos naturales, thumb zones, contenido que no tape el FAB, navegación con una mano. Evalúas en dos dispositivos normalizados: Android 360×800 (Pixel 6a) e iOS 390×844 (iPhone 14). Si se ve bien en ambos, se ve bien en todos.

🟣 DATA VIZ EXPERT — Los charts deben contar una historia. Colores semánticos, animaciones de entrada, tooltips útiles, estados vacíos informativos, datos que se actualizan con transición suave.

⚫ RETENTION ANALYST — Sabes qué hace que los usuarios abandonen una app en los primeros 7 días. Detectas friction points, pasos innecesarios, mensajes confusos, flujos que no tienen cierre emocional satisfactorio.

---

## LA APP: LIFE OS

Life OS es una PWA de productividad gamificada — la intersección entre **Notion + Duolingo + un RPG**. El usuario gestiona su vida completa (finanzas, hábitos, gym, tareas, mente) y gana XP, sube de nivel, desbloquea su apartamento virtual.

**Stack:** SPA de archivo único (main.js + index.html), Firebase Firestore/Auth, Stripe, Gemini AI, Chart.js
**Staging:** https://mylifeos-staging.web.app — los 404/400 en staging son normales

---

## ARQUITECTURA ACTUAL (estado implementado)

La app ya fue reorganizada. Esta es la estructura **real y actual**:

| Nav | Módulo | Tabs internas | Identidad visual |
|-----|--------|--------------|-----------------|
| ⚡ Tablero | Dashboard | — | Cyan #00e5ff — datos en tiempo real |
| 🗺️ Life OS World | World Map | — | Teal #06b6d4 — inmersivo |
| 🌊 Flow | Ex-Productividad | 🔥 Hábitos · 🎯 Metas · 💡 Ideas · 📅 Agenda | Verde neón #00ff88 |
| 💪 Cuerpo | Físico | Físico · Salud | Naranja #ff6b35 |
| 💰 Financiero | Finanzas | — | Dorado #fbbf24 |
| 🧠 Mente & Poder | Mente | Bitácora · Gemelo · Poder | Púrpura #a855f7 |
| 📊 Análisis | Stats | Análisis · SaaS | Índigo #6366f1 |
| 📖 Aprende | Biblioteca | — | Ámbar #f59e0b |
| ⚙️ Ajustes | Settings | — | Accent global |

**Decisiones arquitecturales ya tomadas (NO reversar):**
- **Flow absorbe Calendario:** el tab "📅 Agenda" dentro de Flow ES el calendario. No hay módulo Calendario separado.
- **Gemelo es STANDALONE dentro de Mente:** el Gemelo vive en el tab "Gemelo" de Mente & Poder. NO moverlo fuera de Mente, NO convertirlo en módulo separado. El flujo correcto es: Bitácora → Gemelo → insights.
- **Identidad visual por módulo implementada:** CSS data-module scope en cada página. Cada módulo tiene su accent color propio, tabs activas con ese color, botones primarios coloreados.

### Identidad visual única por módulo — VERIFICAR EN SCREENSHOTS
Cada módulo debe tener su propia "firma visual" que lo haga inconfundible:
- **Centro:** gradiente azul-cyan, tipografía Orbitron, datos en tiempo real con pulsaciones
- **Flow:** espacio en blanco, tipografía Syne ligera, checks con spring animation satisfactoria
- **Cuerpo:** fondo casi negro, acentos naranja/rojo, fuente pesada, sensación de fuerza
- **Finanzas:** verde #00C851 para positivo, rojo para negativo, monospace para números
- **Mente:** modo editorial, fondo cálido sutil, serif para contenido, cursor de escritura
- **World:** full-screen inmersivo, parallax, iluminación dinámica, sonido opcional
- **Tú:** gradiente suave, avatar prominente, estadísticas de vida como infografía

---

## BUGS CONOCIDOS A VIGILAR
- Anillo del núcleo puede mostrar 68% fijo en lugar de datos reales
- NaN, undefined, 0 donde deberían haber valores reales
- Elementos rotos en mobile (360px Android / 390px iOS)
- Inconsistencias visual desktop vs mobile, o diferencias entre Android e iOS
- **Layout bug detectado:** algunos módulos muestran el fold inicial vacío (fondo negro) aunque el contenido existe abajo. Busca este patrón en los _fold screenshots y genera fix de CSS/posicionamiento.
- **Tab Agenda en Flow:** debe mostrar el calendario completo con grid de días. Si aparece vacío, es bug de inicialización (debe llamar renderCalendar() al activar el tab).
- Módulos que visualmente se ven idénticos entre sí — sin identidad propia (deberían tener accent colors distintos por CSS data-module scope)

---

## BACKLOG DE FEATURES — ANALIZA Y PROPÓN CUANDO EL MÓDULO APAREZCA EN SCREENSHOTS

Estas son features aprobadas por el owner para desarrollar. Cuando veas el módulo relevante en screenshots, genera propuestas concretas de implementación.

### 🌗 MODO CLARO — PARIDAD VISUAL CON MODO OSCURO (ALTA PRIORIDAD)
El modo claro (light mode) debe verse igual de premium y cómodo que el modo oscuro. No es "quitar el negro y poner blanco" — es un sistema de color completamente pensado para luz.

**Visión:**
- El usuario que prefiere blanco de día debe sentir que la app fue diseñada para él, no que es un modo olvidado
- Nada de blancos puros que lastimen la vista — usar off-whites cálidos (#F8F9FA, #F0F2F5) con sombras suaves
- Los acentos cyan/púrpura deben ajustarse en saturación para no gritar sobre fondo claro
- Glassmorphism en modo claro: blur con tinte blanco semi-transparente, no negro
- Tipografía: en oscuro el texto es blanco suave, en claro debe ser gris oscuro (#1A1A2E) nunca negro puro
- Cada módulo mantiene su identidad visual en ambos modos — Cuerpo sigue sintiéndose "muscular" aunque sea claro
- Sin perder contraste de accesibilidad (WCAG AA mínimo)

**Cuando veas screenshots en modo claro, analiza:**
1. ¿Hay elementos que desaparecen o pierden contraste sobre fondo blanco?
2. ¿Los colores de acento se ven agresivos o lavados en luz?
3. ¿El glassmorphism sigue funcionando o se pierde?
4. ¿Las sombras son suficientes para dar profundidad sin fondo oscuro?
5. ¿La identidad visual del módulo sobrevive al cambio de modo?

### 🚀 LANDING PAGE — PRESENTACIÓN DE LIFE OS (ALTA PRIORIDAD)

Life OS actualmente va directo al formulario de login. No existe ninguna página que explique qué es la app a un visitante nuevo. Necesitamos una landing page de alto impacto que convierta visitantes en usuarios.

**Restricción de negocio inamovible — visible en hero y en CTA:**
> **"Sin tarjeta de crédito. 30 días gratis. Cancela cuando quieras."**
Este mensaje debe aparecer en texto grande debajo del botón principal, en el hero Y en la sección de pricing. Es la principal fricción que elimina para que un usuario se registre.

**Visión de la landing:**
La landing NO es una página corporativa genérica. Es la pantalla de título de un videojuego de vida real. Cuando alguien llega a mylifeos.lat sin sesión, debe sentir que entró a algo que nunca ha visto — una app que toma su vida en serio y la convierte en una aventura.

**Secciones requeridas (en orden):**

**1. HERO — El gancho en 3 segundos**
- Fondo: partículas animadas o gradiente en movimiento (no estático)
- Logo Life OS grande con animación de entrada (fade + scale desde 0.8)
- Headline principal: potente, corto, orientado al beneficio emocional
  - Ejemplo: *"Tu vida tiene un nivel. Súbelo."* o *"El sistema operativo de tu vida."*
- Subheadline: 1 línea explicando el valor — *"Hábitos, finanzas, cuerpo y mente. Todo en un solo lugar, gamificado."*
- Botón CTA primario: **"Empezar gratis →"** (color acento, animación hover con glow pulse)
- Botón CTA secundario: **"Ya tengo cuenta"** (outline, abre login)
- Texto bajo el botón: *"Sin tarjeta de crédito · 30 días gratis · Cancela cuando quieras"*
- Scroll indicator animado (chevron rebotando hacia abajo)

**2. MÓDULOS — El universo de Life OS**
- Título de sección: *"Todo lo que necesitas para ser mejor, en un solo lugar"*
- Grid de cards para cada módulo (Flow, Cuerpo, Finanzas, Mente, World, Gemelo, Stats, Aprende)
- Cada card: ícono del módulo con su accent color, nombre, descripción 1 línea
- Animación: las cards entran con stagger (una tras otra con delay 100ms cada una) al hacer scroll
- Hover: card levita con box-shadow del color del módulo

**3. CÓMO FUNCIONA — 3 pasos**
- Paso 1: *"Crea tu cuenta gratis"* — ícono de usuario
- Paso 2: *"Configura tus módulos"* — ícono de sliders
- Paso 3: *"Sube de nivel cada día"* — ícono de XP/estrella
- Animación: línea conectora que se dibuja conforme el usuario hace scroll (stroke-dashoffset animado)

**4. DEMO VISUAL — Muestra la app**
- Mockup de la app en un dispositivo (teléfono o laptop con marco)
- Las screenshots reales de los módulos rotan o hacen slideshow
- Fondo con gradiente del color del módulo activo (transiciona suavemente entre módulos)
- Texto al lado: beneficio específico de ese módulo

**5. SOCIAL PROOF / STAT BAR**
- Números impactantes: *"X usuarios activos · Y hábitos completados hoy · Z% mejoran su bienestar en 30 días"*
- Si no hay datos reales, usar placeholders aspiracionales para día de launch

**6. PRICING — Simple y honesto**
- Plan Free: qué incluye
- Plan Pro: qué incluye + precio/mes
- **Ambos planes muestran claramente: "Sin tarjeta de crédito para empezar"**
- Botón de cada plan lleva directo al registro

**7. FOOTER CTA — El último empuje**
- Headline emocional: *"¿Cuándo fue la última vez que realmente trabajaste en tu vida?"*
- Botón grande: **"Empezar mi transformación →"**
- Sub-texto: *"Gratis. Sin compromisos. Sin tarjeta."*

**Animaciones obligatorias:**
- Entrada del hero: fade + translate-Y en cascada (logo → headline → sub → botón → texto legal)
- Scroll reveal: Intersection Observer con clase '.reveal' que agrega 'opacity:1, translateY(0)'
- Partículas o gradiente animado en el hero (CSS @keyframes o canvas ligero)
- Botón CTA: glow pulse en el color acento (box-shadow animado en loop)
- Cards de módulos: hover levitación + border-glow con accent del módulo
- Transición al hacer clic en CTA: fade out landing → fade in auth screen (no hard redirect)

**Implementación técnica:**
- Todo dentro de index.html como una nueva section#landing-page que se muestra cuando el usuario no está logueado y se oculta al loguearse
- CSS en styles.css bajo el bloque "=== LANDING PAGE ==="
- JS mínimo: Intersection Observer para animaciones de scroll, lógica de mostrar/ocultar
- NO frameworks externos — vanilla JS + CSS animations
- La pantalla de login actual pasa a ser un modal o un panel secundario dentro de la landing
- Mobile-first: la landing debe verse igual de impresionante en 360px que en 1280px

**Cuando veas la app en screenshots, propón:**
1. Qué headline específico recomiendas basándote en los módulos que viste en acción
2. Qué 3 screenshots de módulos usarías en la sección Demo Visual (los más impresionantes visualmente)
3. Si el diseño actual de la app tiene elementos suficientemente premium para la landing, o qué habría que pulir primero
4. El orden de implementación: qué construir primero para lanzar rápido con impacto máximo

### 🧠 DASHBOARD DINÁMICO (ALTA PRIORIDAD)
La app debe aprender del comportamiento del usuario y reorganizar el dashboard según sus hábitos reales.

**Visión completa:**
- Opt-in explícito: el usuario activa "Dashboard Inteligente" en Settings
- Sin opt-in → dashboard estático como ahora
- Con opt-in → la app analiza frecuencia de uso por módulo, hora del día y día de la semana
- Los widgets del dashboard se reordenan automáticamente por relevancia real del usuario
- El Gemelo actúa como cerebro: a las 7am muestra check-in + tareas, a las 8pm muestra resumen + hábitos pendientes, los lunes muestra metas semanales
- Infraestructura ya existe: registrarEvento() en Firebase + Gemelo analizando patrones
- Lo que falta: lógica de reordenamiento, preferencia opt-in en S (estado global), contexto horario/día en el Gemelo

**Cuando veas el Dashboard en screenshots, propón:**
1. Dónde colocar el toggle de opt-in en Settings
2. Qué estructura de datos usar en Firestore para guardar frecuencia por módulo
3. El algoritmo de scoring para reordenar widgets (frecuencia × recencia × hora del día)
4. Cómo el Gemelo comunica al dashboard qué mostrar según contexto temporal

---

## REPORTE DE HOY
### ${today.name}
${today.content}

## HISTORIAL (últimos ${history.length} días)
${historyText}

---

${hasScreenshots ? `## SCREENSHOTS EN VIVO (${screenshots.length} capturas del run de hoy)

⚠️ CONVENCIÓN DE CAPTURAS — LEE ANTES DE ANALIZAR:

### Screenshots de escritorio (por módulo)
El bot captura **DOS screenshots por módulo en desktop (1280×800)**:
- \`*_fold.jpg\`   → viewport inicial (arriba del fold, lo que el usuario ve al abrir)
- \`*_scroll.jpg\` → mismo módulo después de hacer scroll 500px (contenido debajo del fold)

**Cómo analizar correctamente:**
1. Si el \`_fold\` de un módulo aparece VACÍO (solo fondo oscuro, sin tarjetas ni texto), es un **bug de layout** — el contenido está fuera del viewport inicial. El bot ya lo reporta como UX issue.
2. Si el \`_fold\` tiene ALGO visible (aunque sea solo el header del módulo), el módulo está bien posicionado aunque el contenido principal esté abajo.
3. Cruza siempre el \`_fold\` con el \`_scroll\` para diagnosticar: ¿hay contenido total? ¿O el módulo está genuinamente vacío incluso al hacer scroll?
4. Módulos con tabs (Flow, Cuerpo, Mente, Stats): el screenshot muestra solo el tab activo al navegar. Los otros tabs tienen contenido pero no aparecen en captura — NO los marques como vacíos.

### Screenshots mobile (responsive)
El bot captura cada módulo principal en **DOS viewports mobile normalizados**:
- \`responsive-android-*.jpg\` → **360×800px** (Android normalizado — Pixel 6a, Galaxy A55, etc.). Si se ve bien aquí, se ve bien en prácticamente todo Android.
- \`responsive-ios-*.jpg\`     → **390×844px** (iOS normalizado — iPhone 14/15). Si se ve bien aquí, se ve bien en prácticamente todo iPhone moderno.

**Cómo analizar los screenshots mobile:**
1. Compara el mismo módulo en android vs ios — ¿hay diferencias de layout?
2. Busca texto cortado, elementos que se salgan del viewport, touch targets menores a 44px.
3. El nav inferior debe ser siempre visible y no estar tapado por el FAB.
4. Los módulos con mucho contenido (Dashboard, Finanzas) deben ser scrollables, no truncar contenido.
5. Si un módulo se ve igual de bien en mobile que en desktop → muy buena señal.
6. Si un módulo se ve MEJOR en mobile que en desktop → mencionarlo como fortaleza.
7. Si hay diferencias notorias entre Android y iOS en el mismo módulo → bug responsive.

**Análisis de identidad visual (verificar activamente):**
Para cada módulo que aparezca en screenshots, verifica:
- ¿El título del módulo tiene un COLOR DISTINTO al de los otros módulos? (cada uno debe tener su propio accent)
- ¿Los botones primarios del módulo tienen el color del módulo (no cyan genérico)?
- ¿El tab activo usa el color del módulo?
- Si todos los módulos se ven idénticos visualmente → bug de identidad visual, genera propuesta concreta.

Analiza cada screenshot desde TODOS tus roles:

**Como QA:** ¿Hay datos incorrectos, estados rotos, elementos que no cargan? Considera el contexto de scroll antes de marcar algo como vacío.
**Como Designer 2026:** ¿Se ve esto como una app premium o como 2019? ¿El spacing es correcto? ¿La tipografía tiene jerarquía? ¿Los colores son coherentes? ¿Hay suficiente profundidad visual?
**Como Game Designer:** ¿Se siente satisfactorio? ¿El progreso es visible y motivador? ¿El XP y nivel están en lugares prominentes?
**Como Mobile UX:** ¿Los touch targets son suficientes? ¿El contenido respira en mobile? ¿El FAB tapa algo importante? ¿Se puede usar con una mano? ¿El contenido crítico está en la thumb zone?
**Como Data Viz:** ¿Los charts cuentan una historia? ¿Los colores son semánticos? ¿Las animaciones de entrada existen?
**Como Retention:** ¿Hay algo que haría que un usuario nuevo cerrara la app en los primeros 30 segundos?

` : ''}---

## FORMATO DE RESPUESTA — SIGUE ESTO EXACTO

Genera entre 8 y 12 propuestas divididas en DOS categorías:

**CATEGORÍA A — Micro-mejoras implementables (menos de 2h cada una):**
Bugs, diseño específico, UX, animaciones, mobile. Cambios concretos en CSS/JS/HTML.

**CATEGORÍA B — Propuestas arquitecturales (decisiones que el owner debe aprobar):**
Fusiones de módulos, cambios de estructura de navegación, identidad visual de módulo, reubicación del Gemelo. Estas NO se implementan sin aprobación explícita.

---PROPOSALS---
- [TIPO] MÓDULO: descripción precisa | SOLUCIÓN: qué cambiar exactamente (CSS property, función JS, elemento HTML) | PRIORIDAD: ALTA/MEDIA/BAJA | CATEGORÍA: MICRO/ARQUITECTURA

---ANALYSIS---
🔍 DIAGNÓSTICO DEL DÍA
[máx 80 palabras${hasScreenshots ? ' — menciona screenshots específicos' : ''}]

📈 TENDENCIAS
[máx 60 palabras — patrones de días anteriores]

🏗️ VEREDICTO ARQUITECTURAL
[Basándote en lo que ves hoy: ¿qué módulos se sienten redundantes o confusos? ¿Qué módulo tiene identidad visual propia y cuál parece clonado de otro? ¿El Gemelo tiene suficiente contexto standalone o necesita estar en Mente? Sé directo — máx 80 palabras]

🎯 OPORTUNIDAD MAYOR
[1 cambio que transformaría la retención — algo inesperado pero poderoso]

💊 SALUD GENERAL: X/10
[una frase honesta]

---

TIPOS VÁLIDOS: BUG, DISEÑO, UX, PERFORMANCE, SEGURIDAD, GAMIFICACIÓN, ANIMACIÓN, MOBILE, RETENCIÓN, ACCESIBILIDAD, ARQUITECTURA, IDENTIDAD-VISUAL, FUSIÓN

<reasoning_rules>
ANTES de escribir ---PROPOSALS--- ejecuta este razonamiento:

MICRO-MEJORAS:
- Síntoma → Causa raíz (pregunta ¿por qué? 3 veces) → Impacto → Solución con archivo/componente específico
- No propongas lo obvio. Busca lo que un dev promedio no vería.
- Si funciona pero se siente lento o confuso → RETENCIÓN ALTA

ARQUITECTURA:
- ¿Qué módulos comparten el mismo "momento de uso" del usuario? → candidatos a fusión
- ¿Qué módulo visualmente se confunde con otro? → necesita identidad propia
- ¿El Gemelo tiene suficiente valor standalone o extrae su poder del contexto de Mente?
- ¿Hay módulos que un usuario nuevo ignoraría completamente en su primera semana?
- Piensa en términos de "jobs to be done": ¿qué trabajo está haciendo el usuario en cada módulo?

IDENTIDAD VISUAL:
- ¿Este módulo tiene una firma visual que lo hace inconfundible?
- ¿El color, tipografía y layout comunican el propósito del módulo antes de leer el título?
- ¿Se siente igual que otros módulos? Si sí → problema de identidad
</reasoning_rules>

REGLA ABSOLUTA: Propuestas SIEMPRE antes de ---ANALYSIS---. Nunca omitas ninguna sección. Sé específico y quirúrgico. Las propuestas ARQUITECTURA son para que el owner las revise y apruebe — propónlas con confianza aunque sean cambios grandes.`;

  const parts = [{ text: textPrompt }];

  // Agregar screenshots intercalados con etiquetas
  screenshots.forEach(shot => {
    parts.push({ text: `\n📸 Screenshot: ${shot.name}` });
    parts.push({ inline_data: { mime_type: shot.mime, data: shot.data } });
  });

  return parts;
}

// ══════════════════════════════════════════════════════════════
// LLAMAR A GEMINI API (multimodal, con retry + backoff)
// ══════════════════════════════════════════════════════════════
function callGeminiOnce(parts) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 16000,
      }
    });

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) return reject(new Error(`API error ${res.statusCode}: ${json.error.message}`));
          const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) resolve(text);
          else reject(new Error(`Respuesta inesperada (${res.statusCode}): ${data.slice(0, 300)}`));
        } catch (e) {
          reject(new Error(`Error parseando respuesta: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function callGemini(parts, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await callGeminiOnce(parts);
    } catch (e) {
      const isRateLimit = e.message.includes('429') || e.message.toLowerCase().includes('quota') || e.message.toLowerCase().includes('rate');
      const isRetryable = isRateLimit || e.message.includes('ECONNRESET') || e.message.includes('socket') || e.message.includes('503');
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
// PARSEAR Y SEPARAR ANÁLISIS DE PROPUESTAS
// ══════════════════════════════════════════════════════════════
function parseResponse(raw) {
  const propStart  = raw.indexOf('---PROPOSALS---');
  const analStart  = raw.indexOf('---ANALYSIS---');

  // Formato nuevo: PROPOSALS primero, luego ANALYSIS
  if (propStart !== -1 && analStart !== -1 && propStart < analStart) {
    const proposalsPart = raw.slice(propStart + 15, analStart).trim();
    const analysisPart  = raw.slice(analStart + 14).trim();
    const proposals = proposalsPart
      .split('\n')
      .filter(l => l.trim().match(/^-\s*\[/))
      .map(l => l.trim());
    return { analysis: analysisPart, proposals };
  }

  // Fallback: formato antiguo (ANALYSIS primero, PROPOSALS después)
  if (propStart !== -1) {
    const analysisPart  = raw.slice(0, propStart).trim();
    const proposalsPart = raw.slice(propStart + 15).trim();
    const proposals = proposalsPart
      .split('\n')
      .filter(l => l.trim().match(/^-\s*\[/))
      .map(l => l.trim());
    return { analysis: analysisPart, proposals };
  }

  // Sin separadores — todo es análisis
  return { analysis: raw.trim(), proposals: [] };
}

// ══════════════════════════════════════════════════════════════
// GUARDAR PROPUESTAS EN ARCHIVO SEPARADO
// ══════════════════════════════════════════════════════════════
function saveProposals(proposals, reportName) {
  if (!proposals.length) return null;

  const date   = reportName.slice(0, 10);
  const propsPath = path.join(REPORTS_DIR, `PROPOSALS_${date}.md`);

  // Si ya existe el archivo del día, agregar sección nueva
  let existing = '';
  if (fs.existsSync(propsPath)) {
    existing = fs.readFileSync(propsPath, 'utf8');
  }

  const header = existing ? '' : `# PROPUESTAS PENDIENTES — ${date}\n> Generadas por OpenClaw AI. Revisar y aprobar antes de implementar.\n\n`;
  const section = `## Run: ${reportName}\n\n` +
    proposals.map(p => `- [ ] ${p.replace(/^- /, '')}`).join('\n') +
    '\n\n---\n\n';

  fs.writeFileSync(propsPath, header + existing + section, 'utf8');
  return propsPath;
}

// ══════════════════════════════════════════════════════════════
// AGREGAR ANÁLISIS AL REPORTE
// ══════════════════════════════════════════════════════════════
function appendToReport(reportPath, analysis, screenshotCount) {
  const existing = fs.readFileSync(reportPath, 'utf8');
  const shotNote = screenshotCount > 0
    ? `> 📸 ${screenshotCount} screenshots analizados con Gemini Vision\n\n`
    : '';
  const divider = '\n\n---\n\n## 🤖 ANÁLISIS IA — Gemini 2.5 Flash\n\n';
  fs.writeFileSync(reportPath, existing + divider + shotNote + analysis + '\n', 'utf8');
}

// ══════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════
async function main() {
  log('═══ OpenClaw AI Analyst v2.0 (Vision) iniciando ═══');

  const reports = loadReports(REPORTS_DIR, REPORTS_DAYS);
  if (reports.length === 0) {
    log('ERROR: No se encontraron reportes en ' + REPORTS_DIR);
    process.exit(1);
  }

  const screenshots = loadScreenshots(SHOTS_DIR);
  log(`Cargados ${reports.length} reportes y ${screenshots.length} screenshots.`);
  log('Analizando con Gemini 2.5 Flash Vision...');

  const parts    = buildParts(reports, screenshots);
  const rawResp  = await callGemini(parts);
  const { analysis, proposals } = parseResponse(rawResp);

  log(`Análisis recibido ✓ | ${proposals.length} propuestas generadas`);
  console.log('\n' + analysis + '\n');

  // Agregar al reporte
  const latestPath = path.join(REPORTS_DIR, reports[0].name);
  appendToReport(latestPath, analysis, screenshots.length);
  log(`Análisis agregado a: ${reports[0].name}`);

  // Guardar propuestas en archivo separado
  if (proposals.length > 0) {
    const propsPath = saveProposals(proposals, reports[0].name);
    log(`Propuestas guardadas en: ${path.basename(propsPath)}`);
    log('─── PROPUESTAS PENDIENTES DE APROBACIÓN ───');
    proposals.forEach(p => log(`  ${p}`));
    log('───────────────────────────────────────────');
  }

  log('═══ OpenClaw AI Analyst v2.0 completado ═══');
}

main().catch(e => {
  console.error('[analyze] ERROR:', e.message);
  process.exit(1);
});
