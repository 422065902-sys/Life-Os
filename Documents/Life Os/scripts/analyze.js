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

  const textPrompt = `Eres un experto senior en QA, UX y desarrollo de aplicaciones web. Analiza los resultados de pruebas automatizadas y${hasScreenshots ? ' los screenshots en tiempo real' : ''} de "Life OS", una PWA de productividad gamificada.

## CONTEXTO DE LA APP
- Life OS es una SPA con Firebase, Stripe y Gemini AI
- Módulos: Dashboard (anillo núcleo, radar chart, check-in), Finanzas, Productividad, Hábitos, Cuerpo/Gym, Gemelo Potenciado, Tienda (usa XP NO coins), Calendario, Mente (biblioteca + bitácora), World (mapa ciudad + apartamento), Gamificación, FCM, PWA
- URL staging: https://mylifeos-staging.web.app
- Los errores 404/400 en staging son normales (recursos inexistentes en ese entorno)

## PROBLEMAS CONOCIDOS A BUSCAR
- El chart/anillo del núcleo puede mostrar valores fijos (como 68%) en lugar de datos reales del usuario
- Datos que muestran NaN, undefined, 0 cuando deberían tener valores reales
- Elementos que no renderizan correctamente en mobile (375px)
- Inconsistencias visuales entre desktop e iOS/mobile

## REPORTE DE HOY
### ${today.name}
${today.content}

## HISTORIAL (últimos ${history.length} días)
${historyText}

---

${hasScreenshots ? `## SCREENSHOTS ADJUNTOS (${screenshots.length} capturas del run de hoy)
Analiza cada screenshot buscando activamente:
1. Datos hardcodeados o fijos (porcentajes que no cambian, valores constantes)
2. Elementos cortados, solapados o mal alineados
3. Texto truncado o ilegible
4. Botones o áreas de interacción muy pequeñas para mobile
5. Inconsistencias de diseño (colores, spacing, tipografía)
6. Gráficas o charts que no renderizan correctamente
7. Estados vacíos sin mensaje apropiado
8. Cualquier anomalía visual

` : ''}## FORMATO DE RESPUESTA OBLIGATORIO

Escribe tu respuesta en DOS secciones separadas por "---PROPOSALS---". Sigue este template exacto:

---PROPOSALS---
- [BUG] MÓDULO: descripción del problema | SOLUCIÓN: qué cambiar exactamente | PRIORIDAD: ALTA
- [UX] MÓDULO: descripción del problema | SOLUCIÓN: qué cambiar exactamente | PRIORIDAD: MEDIA
- [DISEÑO] MÓDULO: descripción del problema | SOLUCIÓN: qué cambiar exactamente | PRIORIDAD: BAJA
(genera entre 4 y 8 propuestas reales basadas en lo que encontraste)

---ANALYSIS---
🔍 DIAGNÓSTICO DEL DÍA
[máx 80 palabras sobre qué falló hoy${hasScreenshots ? ', menciona screenshots' : ''}]

📈 TENDENCIAS
[máx 60 palabras sobre patrones de los últimos días]

💊 SALUD GENERAL: X/10
[una frase de diagnóstico]

TIPOS VÁLIDOS para propuestas: BUG, DISEÑO, UX, PERFORMANCE, SEGURIDAD
IMPORTANTE: Las propuestas van ANTES de ---ANALYSIS---. No omitas ninguna sección.`;

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
        temperature: 0.4,
        maxOutputTokens: 8000,
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
