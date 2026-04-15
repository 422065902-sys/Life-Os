#!/usr/bin/env node
/**
 * OpenClaw AI Analyst — Life OS
 * Versión: 1.0
 * Fecha: 2026-04-14
 *
 * Lee los últimos N reportes QA y genera un diagnóstico inteligente con Gemini Flash.
 * Se ejecuta automáticamente al final de runner.js.
 *
 * Uso manual:
 *   node analyze.js
 *   REPORTS_DAYS=14 node analyze.js   (analiza últimos 14 días)
 */

'use strict';

require('dotenv').config({ path: '/opt/openclaw/.env' });

const fs   = require('fs');
const path = require('path');
const https = require('https');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const REPORTS_DIR    = process.env.QA_REPORTS_DIR || '/opt/openclaw/repo/lifeos/qa-reports';
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
  return files.map(f => ({
    name: f,
    content: fs.readFileSync(path.join(dir, f), 'utf8').slice(0, 1500) // máx 1500 chars por reporte
  }));
}

// ══════════════════════════════════════════════════════════════
// CONSTRUIR PROMPT
// ══════════════════════════════════════════════════════════════
function buildPrompt(reports) {
  const today = reports[0];
  const history = reports.slice(1);

  const historyText = history.length > 0
    ? history.map(r => `### ${r.name}\n${r.content}`).join('\n\n---\n\n')
    : 'Sin reportes históricos aún.';

  return `Eres un experto en QA y desarrollo de aplicaciones web. Analiza los siguientes reportes de pruebas automatizadas de "Life OS", una PWA de productividad gamificada.

## CONTEXTO DE LA APP
- Life OS es una SPA (Single Page Application) con Firebase, Stripe y Gemini AI
- Módulos: Auth, Dashboard, Finanzas, Productividad, Hábitos, Cuerpo/Gym, Gemelo Potenciado, Stripe, Gamificación, Tienda, Calendario, Mente, World, FAB, FCM, PWA
- Staging URL: https://mylifeos-staging.web.app
- Los errores 404/400 de consola en staging son normales (recursos de Firebase inexistentes en ese entorno)

## REPORTE DE HOY
### ${today.name}
${today.content}

## HISTORIAL (últimos ${history.length} días)
${historyText}

## TU ANÁLISIS
Responde en español. Sé directo y específico. Máximo 400 palabras.

1. **DIAGNÓSTICO DEL DÍA** — ¿Qué falló hoy y por qué? ¿Es un bug real o un problema del entorno de staging?

2. **TENDENCIAS** — ¿Hay patrones en los últimos días? ¿Algo que empeora o mejora?

3. **TOP 3 ACCIONES** — Las 3 cosas más importantes a hacer esta semana, ordenadas por impacto al usuario real.

4. **SALUD GENERAL** — Una calificación del 1 al 10 de la salud de la app hoy, con una frase de diagnóstico.

Formato de respuesta:
\`\`\`
🔍 DIAGNÓSTICO DEL DÍA
[tu análisis]

📈 TENDENCIAS
[tu análisis]

🎯 TOP 3 ACCIONES
1. ...
2. ...
3. ...

💊 SALUD GENERAL: X/10
[frase diagnóstico]
\`\`\``;
}

// ══════════════════════════════════════════════════════════════
// LLAMAR A GEMINI API
// ══════════════════════════════════════════════════════════════
function callGemini(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 500,
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
          else reject(new Error(`Respuesta inesperada: ${data.slice(0, 200)}`));
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
// AGREGAR ANÁLISIS AL REPORTE
// ══════════════════════════════════════════════════════════════
function appendAnalysis(reportPath, analysis) {
  const existing = fs.readFileSync(reportPath, 'utf8');
  const divider = '\n\n---\n\n## 🤖 ANÁLISIS IA — Gemini Flash\n\n';
  fs.writeFileSync(reportPath, existing + divider + analysis + '\n', 'utf8');
}

// ══════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════
async function main() {
  log('═══ OpenClaw AI Analyst v1.0 iniciando ═══');

  const reports = loadReports(REPORTS_DIR, REPORTS_DAYS);
  if (reports.length === 0) {
    log('ERROR: No se encontraron reportes en ' + REPORTS_DIR);
    process.exit(1);
  }

  log(`Cargados ${reports.length} reportes. Analizando con Gemini Flash...`);

  const prompt   = buildPrompt(reports);
  const analysis = await callGemini(prompt);

  log('Análisis recibido de Gemini ✓');
  console.log('\n' + analysis + '\n');

  // Agregar al reporte más reciente
  const latestPath = path.join(REPORTS_DIR, reports[0].name);
  appendAnalysis(latestPath, analysis);
  log(`Análisis agregado a: ${reports[0].name}`);

  log('═══ OpenClaw AI Analyst completado ═══');
}

main().catch(e => {
  console.error('[analyze] ERROR:', e.message);
  process.exit(1);
});
