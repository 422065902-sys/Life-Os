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

  const files = fs.readdirSync(shotsDir)
    .filter(f => f.endsWith('.jpg') || f.endsWith('.png'))
    .sort()
    .slice(0, 10); // máximo 10 imágenes para controlar costo

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

🔵 MOBILE UX SPECIALIST — Piensas mobile-first siempre. Touch targets de 44px mínimo, gestos naturales, thumb zones, contenido que no tape el FAB, navegación con una mano, haptic feedback mental.

🟣 DATA VIZ EXPERT — Los charts deben contar una historia. Colores semánticos, animaciones de entrada, tooltips útiles, estados vacíos informativos, datos que se actualizan con transición suave.

⚫ RETENTION ANALYST — Sabes qué hace que los usuarios abandonen una app en los primeros 7 días. Detectas friction points, pasos innecesarios, mensajes confusos, flujos que no tienen cierre emocional satisfactorio.

---

## LA APP: LIFE OS

Life OS es una PWA de productividad gamificada — piensa en la intersección entre **Notion + Duolingo + un RPG**. El usuario gestiona su vida (finanzas, hábitos, gym, tareas) y gana XP, sube de nivel, desbloquea su apartamento virtual.

**Stack:** SPA de archivo único (main.js + index.html), Firebase Firestore/Auth, Stripe, Gemini AI, Chart.js
**Módulos:** Dashboard (anillo núcleo, radar chart, check-in diario), Finanzas, Productividad, Hábitos, Cuerpo/Gym, Gemelo Potenciado (IA personal), Tienda (XP, NO coins), Calendario, Mente (biblioteca + bitácora), World (mapa ciudad + apartamento), Gamificación, FCM, PWA
**Staging:** https://mylifeos-staging.web.app — los 404/400 en staging son normales

**BUGS CONOCIDOS A VIGILAR:**
- Anillo del núcleo puede mostrar 68% fijo en lugar de datos reales
- NaN, undefined, 0 donde deberían haber valores reales
- Elementos rotos en mobile 375px
- Inconsistencias visual desktop vs mobile

---

## REPORTE DE HOY
### ${today.name}
${today.content}

## HISTORIAL (últimos ${history.length} días)
${historyText}

---

${hasScreenshots ? `## SCREENSHOTS EN VIVO (${screenshots.length} capturas del run de hoy)

Analiza cada screenshot desde TODOS tus roles:

**Como QA:** ¿Hay datos incorrectos, estados rotos, elementos que no cargan?
**Como Designer 2026:** ¿Se ve esto como una app premium o como 2019? ¿El spacing es correcto? ¿La tipografía tiene jerarquía? ¿Los colores son coherentes? ¿Hay suficiente profundidad visual?
**Como Game Designer:** ¿Se siente satisfactorio? ¿El progreso es visible y motivador? ¿El XP y nivel están en lugares prominentes?
**Como Mobile UX:** ¿Los touch targets son suficientes? ¿El contenido respira en 375px? ¿El FAB tapa algo importante?
**Como Data Viz:** ¿Los charts cuentan una historia? ¿Los colores son semánticos? ¿Las animaciones de entrada existen?
**Como Retention:** ¿Hay algo que haría que un usuario nuevo cerrara la app en los primeros 30 segundos?

` : ''}---

## FORMATO DE RESPUESTA — SIGUE ESTO EXACTO

Genera entre 6 y 10 propuestas. Mezcla bugs críticos CON mejoras de diseño/UX ambiciosas. No te limites solo a bugs — una app de 2026 necesita también evolución visual constante.

---PROPOSALS---
- [TIPO] MÓDULO: descripción precisa del problema o mejora | SOLUCIÓN: qué cambiar exactamente, sé específico (CSS, comportamiento, copy, lógica) | PRIORIDAD: ALTA/MEDIA/BAJA

---ANALYSIS---
🔍 DIAGNÓSTICO DEL DÍA
[máx 80 palabras — qué falló, qué se ve bien, qué sorprendió${hasScreenshots ? '. Menciona screenshots específicos' : ''}]

📈 TENDENCIAS
[máx 60 palabras — patrones de los últimos días, ¿mejora o empeora?]

🎯 OPORTUNIDAD MAYOR
[1 mejora ambiciosa que transformaría la experiencia — algo que ningún usuario esperaría pero que los haría quedarse]

💊 SALUD GENERAL: X/10
[una frase de diagnóstico honesta]

---

TIPOS VÁLIDOS: BUG, DISEÑO, UX, PERFORMANCE, SEGURIDAD, GAMIFICACIÓN, ANIMACIÓN, MOBILE, RETENCIÓN, ACCESIBILIDAD

<reasoning_rules>
ANTES de escribir ---PROPOSALS--- haz esto mentalmente:
- Para cada problema que detectes, escribe internamente: SÍNTOMA → CAUSA RAÍZ → IMPACTO REAL → SOLUCIÓN PRECISA
- No propongas lo obvio. Busca lo que un desarrollador promedio no vería.
- Cada propuesta debe poder implementarse en menos de 2 horas de desarrollo. Nada de "rediseñar toda la app".
- Si algo visualmente se ve bien pero el dato es incorrecto, es BUG ALTA aunque se vea bonito.
- Si algo funciona pero se siente lento, torpe o confuso — es RETENCIÓN ALTA aunque no esté "roto".
- Piensa como usuario nuevo que abre la app por primera vez. ¿Qué lo haría quedarse? ¿Qué lo haría irse?
</reasoning_rules>

REGLA ABSOLUTA: Las propuestas van SIEMPRE antes de ---ANALYSIS---. Nunca omitas ninguna sección. Sé específico y quirúrgico, nunca genérico.`;

  const parts = [{ text: textPrompt }];

  // Agregar screenshots intercalados con etiquetas
  screenshots.forEach(shot => {
    parts.push({ text: `\n📸 Screenshot: ${shot.name}` });
    parts.push({ inline_data: { mime_type: shot.mime, data: shot.data } });
  });

  return parts;
}

// ══════════════════════════════════════════════════════════════
// LLAMAR A GEMINI API (multimodal)
// ══════════════════════════════════════════════════════════════
function callGemini(parts) {
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
          const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) resolve(text);
          else reject(new Error(`Respuesta inesperada: ${data.slice(0, 300)}`));
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
