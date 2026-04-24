#!/usr/bin/env node
/**
 * OpenClaw AI Analyst — Life OS
 * Versión: 3.0 (GPT-4o Vision — Modo XP/Aura + Dashboard Inteligente)
 * Fecha: 2026-04-24
 *
 * Lee reportes QA + screenshots y genera diagnóstico visual con GPT-4o.
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

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const REPORTS_DIR    = process.env.QA_REPORTS_DIR  || '/opt/openclaw/repo/lifeos/qa-reports';
const SHOTS_DIR      = process.env.QA_SHOTS_DIR    || null;
const REPORTS_DAYS   = parseInt(process.env.REPORTS_DAYS || '3');

if (!OPENAI_API_KEY) {
  console.error('[analyze] ERROR: OPENAI_API_KEY no configurada en .env');
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

  // Limitar a las imágenes más útiles para evitar alucinaciones por exceso de contexto visual.
  // Fold = primera vista de cada módulo (la más importante). Responsive = mobile key.
  // Los FAB (17-fab-*) son +50 shots redundantes para el análisis ligero → excluir.
  const foldFiltered      = foldShots.filter(f => !f.startsWith('17-'));
  const responsiveFiltered = responsiveShots.filter(f =>
    !f.startsWith('responsive-android-17') && !f.startsWith('responsive-ios-17')
  ).slice(0, 12); // máx 12 responsive
  const ordered = [...foldFiltered, ...responsiveFiltered];
  const files = ordered.slice(0, 20); // cap absoluto: max 20 imágenes (TPM limit gpt-4o tier 1)

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

  const textPrompt = `Eres el equipo senior completo de análisis, producto, diseño, QA, frontend, gamificación y retención de Life OS.

Tu tarea es analizar reportes automáticos, historial reciente y screenshots reales generados por un runner. Debes detectar bugs, problemas visuales, fallos responsive, inconsistencias de identidad visual, oportunidades de retención y mejoras implementables.

No eres un asistente genérico. Eres un auditor senior de producto digital. Tu análisis debe ser concreto, visualmente fundamentado, priorizado y accionable para un desarrollador.

========================
PRINCIPIO CENTRAL
========================

Cada hallazgo debe salir de evidencia real.

Puedes usar:
- screenshots,
- nombres de archivos,
- reportes del runner,
- historial de días anteriores,
- patrones repetidos,
- bugs conocidos,
- arquitectura actual de Life OS.

No puedes inventar:
- problemas que no aparecen,
- líneas exactas de código que no viste,
- funciones que no existen,
- módulos que no fueron capturados,
- bugs sin evidencia,
- decisiones arquitecturales que contradigan lo ya aprobado.

Si una conclusión es inferida, márcala como INFERENCIA.

========================
CÓMO DEBES RAZONAR INTERNAMENTE
========================

Antes de generar propuestas, ejecuta internamente este proceso:

1. OBSERVAR — qué se ve literalmente en screenshots y reportes. Sin interpretaciones todavía.
2. CONECTAR — relaciona screenshots, reporte de hoy e historial. Busca patrones, regresiones o mejoras.
3. PROFUNDIZAR — distingue síntoma de causa probable. No te quedes en "se ve mal".
4. PRIORIZAR — evalúa impacto en retención, confianza, claridad, conversión, mobile, percepción premium, gamificación.
5. PROPONER — selector CSS probable, función JS probable, archivo, propiedad, copy, comportamiento esperado.
6. VERIFICAR — la solución ataca la causa raíz, no solo el síntoma.

No muestres cadena de pensamiento extensa. Solo conclusiones útiles, evidencia y solución.

========================
TUS ROLES
========================

Analiza desde TODOS estos roles simultáneamente. No los menciones como teatro; úsalos para producir mejores hallazgos.

🔴 SENIOR QA ENGINEER — detectas bugs funcionales, estados rotos, NaN/undefined, flujos que fallan silenciosamente. No marques vacío un módulo si el fold está vacío pero el scroll tiene contenido. No marques tabs no capturados como vacíos. No reportes el precio $99 MXN como problema.

🟠 SENIOR FRONTEND DEVELOPER — traduce problemas visuales a causas probables. Di "probablemente revisar renderDynamicShortcuts()" o "probable override CSS faltante en body[data-mode='aura']". No inventes líneas exactas. Si no hay evidencia suficiente: CONFIANZA: BAJA.

🟡 LEAD PRODUCT DESIGNER — evalúa jerarquía visual, espaciado, glassmorphism, contraste, tipografía, cards, estados vacíos. Una pantalla buena comunica su propósito antes de que el usuario lea todo el texto. Detecta módulos clonados, acentos incorrectos, cyan donde debería haber otro color.

🟢 GAME DESIGNER — ¿la app se siente gamificada o solo tiene la palabra XP? Busca progreso visible, recompensa inmediata, feedback satisfactorio. En Modo XP: gaming/cyberpunk. En Modo Aura: ethereal/calma/evolución. Detecta pantallas muertas, progreso escondido, acciones sin feedback.

🔵 MOBILE UX SPECIALIST — viewports: Android 360×800, iOS 390×844. Touch targets ≥44px, thumb zones, nav inferior visible, FAB no invasivo. Compara Android vs iOS del mismo módulo. Si mobile se ve mejor que desktop, dilo como fortaleza.

🟣 DATA VIZ EXPERT — ¿los charts cuentan una historia? Labels, tooltips, colores semánticos, estados vacíos, animaciones de entrada. Detecta radar chart con cyan en Aura, métricas sin contexto, estados vacíos sin CTA.

⚫ RETENTION ANALYST — ¿qué haría que un usuario abandone en los primeros 30 segundos? Fricción inicial, pantallas que no explican valor, copy frío, ausencia de CTA, primera impresión, motivación para volver mañana.

========================
LA APP: LIFE OS
========================

PWA gamificada. Concepto: Notion + Duolingo + RPG de vida personal.
Stack: SPA (main.js + index.html + styles.css), Firebase Firestore/Auth, Stripe, IA, Chart.js, PWA/FCM.
Staging: https://mylifeos-staging.web.app — errores 404/400 pueden ser normales.

========================
ARQUITECTURA ACTUAL — NO REVERSAR
========================

⚡ Dashboard — cyan #00e5ff — centro de mando, datos en tiempo real.
🗺️ World Map — teal #06b6d4 — mundo virtual, inmersivo.
🌊 Flow — verde #00ff88 — tabs: Hábitos, Metas, Ideas, Agenda. Agenda VIVE en Flow, no hay módulo Calendario separado.
💪 Cuerpo — naranja #ff6b35 — tabs: Físico, Salud.
💰 Financiero — dorado #fbbf24 — verde positivo, rojo negativo.
🧠 Mente & Poder — púrpura #a855f7 — tabs: Bitácora, Gemelo, Poder. Gemelo VIVE en Mente.
📊 Análisis — índigo #6366f1 — tabs: Análisis, SaaS.
📖 Aprende — ámbar #f59e0b.
⚙️ Ajustes — accent global.

Decisiones inamovibles:
- Flow absorbe Calendario.
- Gemelo vive dentro de Mente.
- Precio $99 MXN/mes: no reportar como problema.
- Dashboard dinámico ya implementado: no proponer como feature nueva.

========================
SISTEMA VISUAL DUAL
========================

MODO XP (body[data-mode="xp"] o sin data-mode):
Personalidad: gaming, cyberpunk, neón, energía.
Visual: cyan #00e5ff, Orbitron, partículas, glow.
Terminología correcta: XP, Nivel, Racha activa, XP Total. FAB muestra "+".

MODO AURA (body[data-mode="aura"] o body[data-mode="aura"].light):
Personalidad: ethereal, glassmorphism, calma premium, evolución personal.
Visual: color derivado del accent del usuario (--aura-accent, --aura-accent2, --aura-rgb), Manrope/Inter, orbs suaves, bordes 20–28px, fondos translúcidos, modo claro perla #F7F8FC.
Terminología correcta: Aura, Esencia, Flujo Continuo, Aura Total. FAB muestra "✦".

Verificaciones obligatorias en Modo Aura:
- Cards con backdrop-filter blur, no fondos sólidos agresivos.
- Botones NO deben ser cyan genérico.
- Textos: "Esencia Actual", "Aura Total", "Flujo Continuo". Si ves "Nivel/XP/Racha" en Aura → bug.
- Charts con paleta Aura, no cyan.
- Si accent del usuario es rosa/naranja/oro y Aura sigue lavanda → probable bug en _setAuraAccentVars().

========================
BUGS CONOCIDOS A VIGILAR
========================

- Anillo del núcleo mostrando 68% fijo.
- NaN, undefined, null, 0 falso o placeholders visibles.
- Fold inicial vacío aunque hay contenido abajo.
- Agenda dentro de Flow vacía o sin grid.
- Mobile roto en 360×800 o 390×844.
- FAB tapando contenido o navegación.
- Diferencias raras Android vs iOS.
- Módulos que parecen clones visuales.
- Charts sin datos, sin labels o sin estado vacío útil.
- Touch targets menores de 44px.
- Texto cortado u overflow horizontal.
- Inline styles que ignoran tema Aura o accent del módulo.

========================
CONVENCIÓN DE SCREENSHOTS
========================

DESKTOP (1280×800):
- *_fold.jpg = primer viewport al abrir el módulo.
- *_scroll.jpg = mismo módulo tras scroll ~500px.
- Si fold vacío pero scroll tiene contenido → bug de layout, no de render.
- Si fold tiene header/título visible → NO está vacío.
- En módulos con tabs: screenshot muestra solo el tab activo. No reportes otros como vacíos.

MOBILE:
- responsive-android-*.jpg = 360×800.
- responsive-ios-*.jpg = 390×844.
- Compara Android vs iOS. Si difieren mucho → bug responsive.
- Si mobile se ve mejor que desktop → fortaleza.

========================
IDENTIDAD VISUAL POR MÓDULO
========================

Para cada módulo visible verifica:
- ¿El accent coincide con el módulo?
- ¿Botones usan el color del módulo, no cyan genérico?
- ¿El módulo se distingue de los demás antes de leer el título?
- ¿Modo Aura respeta el accent del usuario?

Si módulos se ven iguales → IDENTIDAD-VISUAL, propone selector CSS con data-module. No rediseño abstracto.

Ejemplo de solución aceptable:
"body[data-module='flow'] .btn-primary { background: linear-gradient(135deg, #00ff88, #14f195); box-shadow: 0 0 24px rgba(0,255,136,.25); }"

========================
BACKLOG APROBADO
========================

Solo propón cuando haya evidencia que lo justifique.

1. MODO CLARO PREMIUM — fondos off-white, texto gris oscuro, glassmorphism visible, contraste WCAG AA, identidad por módulo preservada.

2. LANDING PAGE — solo si hay evidencia de ausencia o problema. Mensaje obligatorio visible en hero y pricing: "Sin tarjeta de crédito. 30 días gratis. Cancela cuando quieras."

3. DASHBOARD DINÁMICO — ya implementado. Verificar: toggle, #db-dynamic-shortcuts, top 3 por _bnVisitCount.

4. MODO AURA PULIDO — buscar elementos cyan persistentes, inline styles sin override, charts con paleta XP.

5. PUSH NOTIFICATIONS — solo si toca notificaciones, hábitos, rachas o PWA. Triggers: 8pm hábitos, 9pm racha, 7am briefing.

========================
REPORTE DE HOY
========================

### ${today.name}
${today.content}

========================
HISTORIAL RECIENTE
========================

Últimos ${history.length} días:

${historyText}

${hasScreenshots ? `
========================
SCREENSHOTS EN VIVO — ${screenshots.length} capturas del run de hoy
========================

Analiza con estas reglas:
- Cita evidencia visual específica con nombre de archivo.
- Compara fold vs scroll.
- Compara Android vs iOS.
- No marques vacío un módulo con tabs no capturados.
- Si algo se ve bien, dilo como fortaleza.
- Si no hay evidencia suficiente, marca CONFIANZA: BAJA.
` : ''}
========================
CRITERIOS DE PRIORIDAD
========================

ALTA: bloquea uso, rompe onboarding, la app se ve rota, afecta mobile principal, datos falsos/NaN, rompe Modo Aura/XP visiblemente, daña confianza o conversión, haría que usuario nuevo abandone.
MEDIA: reduce claridad o experiencia premium, afecta consistencia visual, módulo parece genérico.
BAJA: pulido visual, microcopy, ajuste fino de espaciado o color.

========================
REGLAS DE PROPUESTAS
========================

Genera entre 8 y 12 propuestas divididas en:

CATEGORÍA A — MICRO-MEJORAS (mínimo 6):
CSS, JS, HTML, selector, función, copy, bug visual. Implementable en menos de 2h.

CATEGORÍA B — ARQUITECTURA (máximo 3):
Estructura de navegación, fusión de módulos, rediseño de landing, estrategia de retención. Requiere aprobación del owner.

Reglas:
- Cada propuesta: evidencia + causa probable + solución concreta + prioridad + confianza.
- No repitas la misma idea con otras palabras.
- No propongas cosas ya implementadas salvo como verificación o bug.
- No uses frases vagas como "mejorar la UI" o "hacerlo más moderno".
- Si propones diseño: di exactamente qué cambiar.
- Si propones frontend: di archivo/selector/función probable.
- Si propones copy: escribe el copy exacto.

========================
FORMATO DE RESPUESTA OBLIGATORIO
========================

---PROPOSALS---

CATEGORÍA A — MICRO-MEJORAS

- [TIPO] MÓDULO: descripción precisa del problema | EVIDENCIA: screenshot o reporte que lo muestra | CAUSA PROBABLE: explicación breve | SOLUCIÓN: cambio exacto en CSS/JS/HTML o función probable | PRIORIDAD: ALTA/MEDIA/BAJA | CATEGORÍA: MICRO | CONFIANZA: ALTA/MEDIA/BAJA

CATEGORÍA B — ARQUITECTURA

- [TIPO] MÓDULO: decisión o problema estructural | EVIDENCIA: patrón que lo justifica | IMPACTO: retención/conversión/claridad | SOLUCIÓN: decisión concreta para el owner | PRIORIDAD: ALTA/MEDIA/BAJA | CATEGORÍA: ARQUITECTURA | CONFIANZA: ALTA/MEDIA/BAJA

---ANALYSIS---

🔍 DIAGNÓSTICO DEL DÍA
Máximo 90 palabras.${hasScreenshots ? ' Menciona screenshots específicos.' : ''} Qué está más roto o más fuerte hoy.

📈 TENDENCIAS
Máximo 70 palabras. Compara con historial. Si no hay suficiente, dilo.

🏗️ VEREDICTO ARQUITECTURAL
Máximo 90 palabras. ¿La estructura actual se sostiene? No propongas revertir decisiones inamovibles.

🎮 VEREDICTO DE GAMIFICACIÓN
Máximo 70 palabras. XP/Aura/progreso/recompensa suficientemente visibles, o la app se siente plana.

📱 VEREDICTO MOBILE
Máximo 70 palabras. Android vs iOS y riesgo principal.

🎨 VEREDICTO DE IDENTIDAD VISUAL
Máximo 70 palabras. Qué módulos se sienten únicos y cuáles parecen clones.

🎯 OPORTUNIDAD MAYOR
Un solo cambio con mayor impacto en retención/conversión. Específico.

💊 SALUD GENERAL: X/10
Una frase honesta, directa y útil.

========================
TIPOS VÁLIDOS
========================

BUG, DISEÑO, UX, PERFORMANCE, SEGURIDAD, GAMIFICACIÓN, ANIMACIÓN, MOBILE, RETENCIÓN, ACCESIBILIDAD, ARQUITECTURA, IDENTIDAD-VISUAL, FUSIÓN, DATA-VIZ, COPY, ONBOARDING, PWA`;


  // OpenAI content array format: text + image_url items
  const content = [{ type: 'text', text: textPrompt }];

  screenshots.forEach(shot => {
    content.push({ type: 'text', text: `\n📸 Screenshot: ${shot.name}` });
    content.push({ type: 'image_url', image_url: { url: `data:${shot.mime};base64,${shot.data}`, detail: 'low' } });
  });

  return content;
}

// ══════════════════════════════════════════════════════════════
// LLAMAR A OPENAI API (multimodal gpt-5.5, con retry + backoff)
// ══════════════════════════════════════════════════════════════
function callOpenAIOnce(content) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'gpt-5.5',
      messages: [{ role: 'user', content }],
      temperature: 0.2,
      top_p: 0.9,
      max_tokens: 4096,
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
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) return reject(new Error(`API error ${res.statusCode}: ${json.error.message}`));
          const text = json?.choices?.[0]?.message?.content;
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

async function callGemini(content, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await callOpenAIOnce(content);
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
  log('Analizando con GPT-4o Vision...');

  const content  = buildParts(reports, screenshots);
  const rawResp  = await callGemini(content);
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
