#!/usr/bin/env node
/**
 * OpenClaw AI Deep Analyst — Life OS
 * Versión: 1.0
 *
 * Análisis PROFUNDO: una llamada Gemini por módulo → propuestas ultra-específicas.
 * Úsalo manualmente cuando quieras una revisión completa.
 * El análisis diario rápido sigue siendo analyze.js (1 llamada).
 *
 * Uso:
 *   node scripts/analyze-deep.js
 */

'use strict';

require('dotenv').config({ path: '/opt/openclaw/.env' });

const fs    = require('fs');
const path  = require('path');
const https = require('https');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const REPORTS_DIR    = process.env.QA_REPORTS_DIR || '/opt/openclaw/repo/lifeos/qa-reports';

if (!GEMINI_API_KEY) {
  console.error('[deep] ERROR: GEMINI_API_KEY no configurada en .env');
  process.exit(1);
}

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

// ══════════════════════════════════════════════════════════════
// DEFINICIÓN DE MÓDULOS
// ══════════════════════════════════════════════════════════════
const MODULES = [
  {
    key: 'dashboard',
    name: 'Tablero (Dashboard)',
    accent: '#00e5ff (cyan)',
    desc: 'Vista principal al abrir la app. Contiene: saludo dinámico, barra de progreso del Gemelo, briefing matutino, radar chart, focus bars, check-in diario, widget de saldo. Es el "¿Cómo estoy?" del usuario.',
    tabs: null,
  },
  {
    key: 'flow',
    name: 'Flow',
    accent: '#00ff88 (verde neón)',
    desc: 'Módulo de productividad unificado. Contiene: Hábitos (heatmap de constancia, racha), Metas (progreso global, objetivos de vida), Ideas Rápidas (capturadas por FAB), Agenda (calendario con eventos, planes sociales).',
    tabs: 'Hábitos · Metas · Ideas · Agenda',
  },
  {
    key: 'flow-agenda',
    name: 'Flow — Tab Agenda',
    accent: '#00ff88 (verde neón)',
    desc: 'El calendario vive dentro del tab Agenda de Flow. Contiene: grid mensual de días, eventos por día, próximas actividades, planes sociales con aliados (XP compartido, fecha límite, check-in mutuo).',
    tabs: 'Parte de Flow',
  },
  {
    key: 'finanzas',
    name: 'Financiero',
    accent: '#fbbf24 (dorado)',
    desc: 'Control total de finanzas. Contiene: saldos múltiples (tarjetas, efectivo, digital), gráficas de gastos/ingresos por categoría, historial de transacciones, deudas, cards. Números siempre prominentes.',
    tabs: null,
  },
  {
    key: 'cuerpo',
    name: 'Cuerpo',
    accent: '#ff6b35 (naranja fuego)',
    desc: 'Módulo de físico y bienestar. Contiene: muscle map interactivo, volumen de entrenamiento por grupo muscular, rutinas frecuentes, check-in de salud diario. Debe sentirse oscuro, muscular, energético.',
    tabs: 'Físico · Salud',
  },
  {
    key: 'mente',
    name: 'Mente & Poder',
    accent: '#a855f7 (púrpura)',
    desc: 'Módulo de mente y crecimiento. Contiene: Bitácora (diario personal, entradas con fecha), Gemelo Potenciado (IA que analiza patrones del usuario), Poder (aliados, presencia social). Editorial, reflexivo.',
    tabs: 'Bitácora · Gemelo · Poder',
  },
  {
    key: 'world',
    name: 'Life OS World',
    accent: '#06b6d4 (teal)',
    desc: 'Mapa gamificado del mundo del usuario. Zonas desbloqueables, apartamento virtual, logros visuales. Debe sentirse cinematográfico, como un videojuego premium.',
    tabs: null,
  },
];

// ══════════════════════════════════════════════════════════════
// CARGAR SCREENSHOTS DEL ÚLTIMO RUN
// ══════════════════════════════════════════════════════════════
function loadLatestScreenshots() {
  const base = path.join(REPORTS_DIR, 'screenshots');
  if (!fs.existsSync(base)) return {};
  const dirs = fs.readdirSync(base).filter(d =>
    fs.statSync(path.join(base, d)).isDirectory()
  ).sort().reverse();
  if (!dirs.length) return {};

  const shotsDir = path.join(base, dirs[0]);
  log(`Screenshots del run: ${dirs[0]}`);

  const files = fs.readdirSync(shotsDir)
    .filter(f => f.endsWith('.jpg') || f.endsWith('.png'))
    .sort();

  // Agrupar por módulo (prefijo antes de _fold / _scroll / sin sufijo)
  const grouped = {};
  files.forEach(f => {
    const base = f.replace(/_(fold|scroll)\.(jpg|png)$/, '').replace(/\.(jpg|png)$/, '');
    if (!grouped[base]) grouped[base] = [];
    grouped[base].push({
      name: f.replace(/\.(jpg|png)$/, ''),
      mime: f.endsWith('.png') ? 'image/png' : 'image/jpeg',
      data: fs.readFileSync(path.join(shotsDir, f)).toString('base64'),
    });
  });

  return grouped;
}

// ══════════════════════════════════════════════════════════════
// PROMPT BASE (contexto de app — compartido en cada llamada)
// ══════════════════════════════════════════════════════════════
const BASE_CONTEXT = `
Eres el equipo senior completo detrás de Life OS en 2026. Roles simultáneos:
🔴 QA Engineer — detectas bugs funcionales y estados rotos
🟠 Frontend Dev — sabes qué línea de código está causando el problema
🟡 Lead Product Designer (Linear/Notion/Superhuman) — cada píxel comunica algo
🟢 Game Designer — gamificación psicológica, XP, streaks, feedback satisfactorio
🔵 Mobile UX — mobile-first, touch targets 44px, thumb zones
⚫ Retention Analyst — qué hace que usuarios abandonen en los primeros 7 días

SOBRE LA APP:
Life OS es una PWA gamificada = Notion + Duolingo + RPG. El usuario gestiona su vida completa y gana XP.
Stack: SPA archivo único (main.js + index.html), Firebase Firestore/Auth, Stripe, Gemini AI, Chart.js.

SISTEMA DE IDENTIDAD VISUAL IMPLEMENTADO:
Cada módulo tiene data-module scope en CSS con su propio accent color. Verifica que funcione.

ARQUITECTURA ACTUAL (ya implementada):
- 🌊 Flow = Hábitos + Metas + Ideas + Agenda (absorbe el Calendario)
- 💪 Cuerpo = Físico + Salud
- 🧠 Mente & Poder = Bitácora + Gemelo + Poder
- 📊 Análisis = Stats + SaaS

CONVENCIÓN DE SCREENSHOTS:
- _fold = viewport inicial (lo primero que ve el usuario al abrir el módulo)
- _scroll = 500px abajo (contenido debajo del fold)
Si el _fold está vacío (solo fondo oscuro) = BUG DE LAYOUT — el contenido está fuera del viewport.
`.trim();

// ══════════════════════════════════════════════════════════════
// PROMPT POR MÓDULO
// ══════════════════════════════════════════════════════════════
function buildModulePrompt(mod, screenshots) {
  const shotList = screenshots.map(s => s.name).join(', ');

  return `${BASE_CONTEXT}

══════════════════════════════════
ANÁLISIS PROFUNDO: ${mod.name.toUpperCase()}
══════════════════════════════════

IDENTIDAD DEL MÓDULO:
- Accent color: ${mod.accent}
- Descripción: ${mod.desc}
${mod.tabs ? `- Tabs: ${mod.tabs}` : ''}

Screenshots incluidos: ${shotList}

INSTRUCCIONES DE ANÁLISIS:

1. INSPECCIÓN VISUAL PROFUNDA
   - ¿El accent color del módulo (${mod.accent}) se aplica correctamente al título, tabs activas y botones?
   - ¿El fold muestra contenido inmediatamente o está vacío? Si vacío → BUG DE LAYOUT
   - ¿La identidad visual de ESTE módulo es distinguible de los demás?
   - Compara _fold vs _scroll: ¿qué hay arriba del fold vs abajo?

2. ANÁLISIS FUNCIONAL
   - ¿Los datos se muestran correctamente? ¿Hay NaN, undefined, $0.00 incorrectos?
   - ¿Los elementos interactivos son accesibles (44px touch targets)?
   - ¿El estado vacío tiene personalidad o es genérico?

3. EXPERIENCIA DE USUARIO 2026
   - ¿Este módulo se siente premium o de 2019?
   - ¿Hay micro-animaciones? ¿Spring physics? ¿Skeleton loaders?
   - ¿El usuario sabe inmediatamente qué hacer al abrir este módulo?

4. RETENCIÓN
   - ¿Hay algo que haría que un usuario nuevo cerrara este módulo en 30 segundos?
   - ¿El módulo tiene un "gancho" emocional o solo es funcional?

RAZONAMIENTO OBLIGATORIO antes de proponer:
Para cada problema: Síntoma → ¿Por qué? → ¿Por qué? → ¿Por qué? → Causa raíz → Solución con archivo/línea específica.

FORMATO DE RESPUESTA:

---PROPOSALS---
- [TIPO] ${mod.name}: descripción concisa | SOLUCIÓN: qué cambiar exactamente, en qué archivo/línea | PRIORIDAD: ALTA/MEDIA/BAJA | CATEGORÍA: MICRO/ARQUITECTURA
(5 a 8 propuestas. Solo propuestas que realmente veas en los screenshots o que se puedan inferir del contexto.)

---ANALYSIS---

## ${mod.name}

### 🔍 Diagnóstico visual
[Describe exactamente lo que ves en los screenshots — fold y scroll por separado]

### 🐛 Bugs detectados
[Lista bugs funcionales o visuales con causa raíz]

### ✨ Oportunidad de mejora
[La mejora más impactante específica de este módulo]

### 💊 Salud del módulo: X/10`;
}

// ══════════════════════════════════════════════════════════════
// PROMPT DE SÍNTESIS FINAL
// ══════════════════════════════════════════════════════════════
function buildSynthesisPrompt(moduleResults) {
  const summaries = moduleResults.map(r =>
    `### ${r.module}\n${r.analysis.slice(0, 600)}`
  ).join('\n\n');

  const allProposals = moduleResults.flatMap(r => r.proposals);

  return `${BASE_CONTEXT}

Has analizado todos los módulos de Life OS individualmente. Aquí está el resumen:

${summaries}

Propuestas totales generadas: ${allProposals.length}

Tu tarea ahora es la SÍNTESIS EJECUTIVA:

1. ¿Cuál es el patrón sistémico más importante que ves a través de todos los módulos?
2. ¿Cuáles son los 3 cambios de mayor impacto para retención y engagement?
3. ¿Qué módulo necesita más urgencia de trabajo?
4. ¿Hay inconsistencias entre módulos que rompen la coherencia de la app?

FORMATO:

## 🎯 SÍNTESIS EJECUTIVA — ANÁLISIS PROFUNDO

### Patrón sistémico principal
[1 párrafo sobre el problema o patrón más importante que atraviesa toda la app]

### Top 3 cambios de mayor impacto
1. [cambio + módulo + por qué]
2. [cambio + módulo + por qué]
3. [cambio + módulo + por qué]

### Módulo más urgente: [nombre]
[Por qué este módulo necesita atención inmediata]

### Coherencia cross-módulo
[¿Los módulos se sienten como parte de la misma app o como features sueltas?]

### 💊 Salud global: X/10
[Una frase honesta sobre el estado actual de la app]`;
}

// ══════════════════════════════════════════════════════════════
// LLAMAR GEMINI
// ══════════════════════════════════════════════════════════════
function callGemini(parts, maxTokens = 8000) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      contents: [{ parts }],
      generationConfig: { temperature: 0.3, maxOutputTokens: maxTokens }
    });
    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) resolve(text);
          else reject(new Error(`Respuesta inesperada: ${data.slice(0, 300)}`));
        } catch(e) { reject(new Error(`Parse error: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
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
    return { analysis: raw.slice(analStart + 14).trim(), proposals };
  }
  return { analysis: raw.trim(), proposals: [] };
}

// ══════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════
async function main() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;

  log('═══ OpenClaw AI DEEP Analyst v1.0 iniciando ═══');
  log('Modo: PROFUNDO — una llamada Gemini por módulo');

  const allShots = loadLatestScreenshots();
  const shotKeys = Object.keys(allShots);
  log(`Grupos de screenshots encontrados: ${shotKeys.join(', ')}`);

  const moduleResults = [];
  const allProposals  = [];

  // ── Analizar cada módulo ──
  for (const mod of MODULES) {
    // Buscar screenshots de este módulo (prefijo match)
    const matchKeys = shotKeys.filter(k =>
      k.includes(mod.key) || k === mod.key ||
      k.startsWith(mod.key.split('-')[0]) && mod.key.includes(k.split('-')[0])
    );

    // Match más preciso
    const exactMatch = shotKeys.find(k => k === mod.key || k.endsWith(mod.key));
    const shots = exactMatch
      ? allShots[exactMatch]
      : matchKeys.flatMap(k => allShots[k] || []).slice(0, 2);

    if (!shots || shots.length === 0) {
      log(`⏭ ${mod.name} — sin screenshots, saltando`);
      continue;
    }

    log(`▶ Analizando ${mod.name} (${shots.length} screenshots)...`);

    try {
      const prompt = buildModulePrompt(mod, shots);
      const parts = [{ text: prompt }];
      shots.forEach(s => {
        parts.push({ text: `\n📸 ${s.name}` });
        parts.push({ inline_data: { mime_type: s.mime, data: s.data } });
      });

      const raw = await callGemini(parts, 6000);
      const { analysis, proposals } = parseResponse(raw);

      moduleResults.push({ module: mod.name, analysis, proposals });
      allProposals.push(...proposals);

      log(`✅ ${mod.name} — ${proposals.length} propuestas`);

      // Pausa entre llamadas para evitar rate limiting
      await new Promise(r => setTimeout(r, 1500));
    } catch(e) {
      log(`❌ ${mod.name} — Error: ${e.message}`);
      moduleResults.push({ module: mod.name, analysis: `Error: ${e.message}`, proposals: [] });
    }
  }

  // ── Síntesis final ──
  log('▶ Generando síntesis ejecutiva...');
  let synthesis = '';
  try {
    const synthPrompt = buildSynthesisPrompt(moduleResults);
    synthesis = await callGemini([{ text: synthPrompt }], 4000);
    log('✅ Síntesis generada');
  } catch(e) {
    log(`❌ Síntesis falló: ${e.message}`);
    synthesis = 'Error generando síntesis.';
  }

  // ── Guardar reporte ──
  const reportPath = path.join(REPORTS_DIR, `DEEP_${stamp}.md`);
  let report = `# ANÁLISIS PROFUNDO — ${stamp}\n`;
  report += `> Generado por OpenClaw AI Deep Analyst v1.0\n`;
  report += `> ${moduleResults.length} módulos analizados · ${allProposals.length} propuestas totales\n\n`;
  report += `---\n\n${synthesis}\n\n---\n\n`;
  report += `# ANÁLISIS POR MÓDULO\n\n`;
  moduleResults.forEach(r => {
    report += `${r.analysis}\n\n---\n\n`;
  });
  report += `# TODAS LAS PROPUESTAS\n\n`;
  allProposals.forEach(p => { report += `- [ ] ${p.replace(/^- /, '')}\n`; });

  fs.writeFileSync(reportPath, report, 'utf8');
  log(`Reporte guardado: ${path.basename(reportPath)}`);

  // ── Output en consola ──
  console.log('\n' + synthesis + '\n');
  log(`─── ${allProposals.length} PROPUESTAS TOTALES ───`);
  allProposals.forEach(p => log(`  ${p}`));
  log('═══ Deep Analyst completado ═══');
}

main().catch(e => {
  console.error('[deep] ERROR:', e.message);
  process.exit(1);
});
