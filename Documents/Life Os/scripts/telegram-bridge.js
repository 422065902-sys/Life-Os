#!/usr/bin/env node
// /opt/openclaw/telegram-bridge.js
// Life OS Chief of Staff — control total del ecosistema desde Telegram

'use strict';
require('dotenv').config({ path: '/opt/openclaw/.env' });

const https   = require('https');
const { spawn, exec } = require('child_process');
const fs      = require('fs');
const path    = require('path');
const os      = require('os');

// --- Config ---
const TOKEN         = process.env.TELEGRAM_BRIDGE_TOKEN;
const AUTHORIZED_ID = parseInt(process.env.TELEGRAM_AUTHORIZED_ID || '8412757068');

const P = {
  runner:      '/opt/openclaw',
  reports:     '/opt/openclaw/repo/lifeos/qa-reports',
  lifeos:      '/opt/openclaw/repo/lifeos/Documents/Life Os',
  scripts:     '/opt/openclaw/repo/lifeos/Documents/Life Os/scripts',
  centroOps:   '/opt/openclaw/projects/centro-ops/repo',
  firebaseAdc: '/opt/openclaw/repo/lifeos/Documents/Life Os/scripts/firebase-adc.json',
  gitRoot:     '/opt/openclaw/repo/lifeos'
};

if (!TOKEN) { console.error('[bridge] TELEGRAM_BRIDGE_TOKEN missing'); process.exit(1); }

// --- State ---
let runnerProcess  = null;
let analyzeProcess = null;
let runnerChatId   = null;
let lastOffset     = 0;

// --- Telegram API ---
function tgRequest(method, params) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(params);
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${TOKEN}/${method}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function send(chatId, text) {
  const chunks = [];
  for (let i = 0; i < text.length; i += 4000) chunks.push(text.slice(i, i + 4000));
  return chunks.reduce((p, chunk) =>
    p.then(() => tgRequest('sendMessage', { chat_id: chatId, text: chunk, parse_mode: 'Markdown' }).catch(() => {}))
  , Promise.resolve());
}

async function getUpdates() {
  try {
    const res = await tgRequest('getUpdates', { offset: lastOffset, timeout: 30, allowed_updates: ['message'] });
    if (res.ok && res.result.length > 0) {
      lastOffset = res.result[res.result.length - 1].update_id + 1;
      return res.result;
    }
  } catch {}
  return [];
}

// --- Helpers ---
function latestReport(prefix = '') {
  try {
    return fs.readdirSync(P.reports)
      .filter(f => f.endsWith('.md') && f.startsWith(prefix))
      .map(f => ({ name: f, full: path.join(P.reports, f), mtime: fs.statSync(path.join(P.reports, f)).mtime }))
      .sort((a, b) => b.mtime - a.mtime)[0] || null;
  } catch { return null; }
}

function readFile(fp, max = 3500) {
  try { return fs.readFileSync(fp, 'utf8').slice(0, max); }
  catch (e) { return `(no encontrado: ${e.message})`; }
}

function execCmd(cmd, cwd = P.runner) {
  return new Promise(resolve => {
    exec(cmd, { cwd, env: process.env, timeout: 120000 }, (err, stdout, stderr) => {
      resolve((stdout + stderr).trim() || err?.message || '');
    });
  });
}

function minsAgo(mtime) { return Math.round((Date.now() - mtime) / 60000); }

function fileExists(fp) { try { return fs.existsSync(fp); } catch { return false; } }

// --- QA Pipeline ---

async function cmdRun(chatId) {
  if (runnerProcess || analyzeProcess) {
    return send(chatId, '⚠️ Ya hay un proceso corriendo. Usa /status.');
  }
  await send(chatId, '🚀 *Lanzando runner.js --deep...*\nEsto tarda ~25-30 min. Te aviso cuando termine.');
  runnerChatId = chatId;
  runnerProcess = spawn('node', ['runner.js', '--deep'], { cwd: P.runner, env: process.env });
  runnerProcess.stdout.on('data', () => {});
  runnerProcess.stderr.on('data', () => {});
  runnerProcess.on('close', async code => {
    runnerProcess = null;
    await send(runnerChatId, `${code === 0 ? '✅' : '❌'} Runner terminó (exit ${code}).\nUsa /report para ver el resultado.`);
    runnerChatId = null;
  });
}

async function cmdAnalyze(chatId) {
  if (runnerProcess || analyzeProcess) {
    return send(chatId, '⚠️ Ya hay un proceso corriendo.');
  }
  await send(chatId, '🔬 *Lanzando analyze-deep.js...*\nSolo análisis, sin E2E. ~5-8 min.');
  analyzeProcess = spawn('node', ['analyze-deep.js'], { cwd: P.runner, env: process.env });
  analyzeProcess.stdout.on('data', () => {});
  analyzeProcess.stderr.on('data', () => {});
  analyzeProcess.on('close', async code => {
    analyzeProcess = null;
    await send(chatId, `${code === 0 ? '✅' : '❌'} Análisis terminó (exit ${code}).\nUsa /report para ver.`);
  });
}

async function cmdStatus(chatId) {
  if (runnerProcess)  return send(chatId, '🔄 *Runner ACTIVO* — E2E corriendo ahora.');
  if (analyzeProcess) return send(chatId, '🔬 *Analyze ACTIVO* — análisis corriendo ahora.');
  const last = latestReport();
  if (!last) return send(chatId, '⏸ Inactivo. Sin reportes todavía.');
  await send(chatId, `⏸ *Inactivo*\nÚltimo: \`${last.name}\`\nHace ${minsAgo(last.mtime)} min`);
}

async function cmdLog(chatId) {
  const last = latestReport();
  if (!last) return send(chatId, 'Sin reportes disponibles.');
  const lines = fs.readFileSync(last.full, 'utf8').split('\n').slice(-30).join('\n');
  await send(chatId, `📄 *${last.name}* (últimas 30 líneas):\n\`\`\`\n${lines}\n\`\`\``);
}

async function cmdReport(chatId) {
  const last = latestReport('DEEP_');
  if (!last) return send(chatId, 'Sin reportes DEEP disponibles todavía.');
  const content = readFile(last.full);
  await send(chatId, `📊 *${last.name}*\n\`\`\`\n${content}\n\`\`\`\n_(recortado)_`);
}

async function cmdErrors(chatId) {
  const last = latestReport();
  if (!last) return send(chatId, 'Sin reportes disponibles.');
  const lines = fs.readFileSync(last.full, 'utf8').split('\n');
  const errs  = lines.filter(l => l.includes('❌') || /\b(error|fail|timeout|crash)/i.test(l));
  if (errs.length === 0) return send(chatId, '✅ Sin errores en el último reporte.');
  await send(chatId, `❌ *Errores — ${last.name}:*\n\`\`\`\n${errs.slice(0, 30).join('\n')}\n\`\`\``);
}

async function cmdScores(chatId) {
  const last = latestReport('DEEP_');
  if (!last) return send(chatId, 'Sin reportes DEEP disponibles.');
  const lines = fs.readFileSync(last.full, 'utf8').split('\n')
    .filter(l => /\d+\/10/.test(l) || /BENTO|WEB|iOS|MOTION|IDENTIDAD|veredicto/i.test(l));
  if (lines.length === 0) return send(chatId, 'No se encontraron scores en el reporte.');
  await send(chatId, `📈 *Scores — ${last.name}*\n\`\`\`\n${lines.slice(0, 40).join('\n')}\n\`\`\``);
}

async function cmdHistory(chatId) {
  try {
    const files = fs.readdirSync(P.reports)
      .filter(f => f.endsWith('.md'))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(P.reports, f)).mtime }))
      .sort((a, b) => b.mtime - a.mtime).slice(0, 10);
    const list = files.map((f, i) => `${i + 1}. \`${f.name}\` — hace ${minsAgo(f.mtime)} min`).join('\n');
    await send(chatId, `📋 *Últimos 10 reportes:*\n${list}`);
  } catch (e) { await send(chatId, `Error: ${e.message}`); }
}

async function cmdTodo(chatId) {
  const fp = path.join(P.lifeos, 'CODEX_NEXT_SESSION.md');
  const content = readFile(fp);
  await send(chatId, `📝 *CODEX_NEXT_SESSION.md*\n\`\`\`\n${content}\n\`\`\``);
}

async function cmdResetQA(chatId) {
  await send(chatId, '🔧 Reseteando usuario QA...');
  const out = await execCmd(`node ${path.join(P.scripts, 'set-qa-pro.js')}`);
  await send(chatId, `✅ QA reset:\n\`\`\`\n${out.slice(0, 500)}\n\`\`\``);
}

// --- Control VPS ---

async function cmdSync(chatId) {
  await send(chatId, '🔄 Sincronizando VPS desde GitHub...');
  const out = await execCmd([
    'git pull origin main',
    `cp "Documents/Life Os/scripts/runner.js" /opt/openclaw/runner.js`,
    `cp "Documents/Life Os/scripts/analyze.js" /opt/openclaw/analyze.js`,
    `cp "Documents/Life Os/scripts/analyze-deep.js" /opt/openclaw/analyze-deep.js`,
    `cp "Documents/Life Os/scripts/telegram-bridge.js" /opt/openclaw/telegram-bridge.js`
  ].join(' && '), P.gitRoot);
  await send(chatId, `✅ Sync completo:\n\`\`\`\n${out.slice(0, 800)}\n\`\`\`\n⚠️ Si el bridge cambió, haz \`pm2 restart lifeos-tg-bridge --update-env\` en el VPS.`);
}

async function cmdDeploy(chatId) {
  await send(chatId, '🚀 Desplegando a staging...');
  const out = await execCmd(
    `GOOGLE_APPLICATION_CREDENTIALS="${P.firebaseAdc}" firebase deploy --only hosting:staging --project mylifeos-staging`,
    P.lifeos
  );
  const ok = out.includes('Deploy complete') || out.includes('hosting');
  await send(chatId, `${ok ? '✅' : '❌'} Deploy:\n\`\`\`\n${out.slice(-800)}\n\`\`\``);
}

async function cmdGit(chatId) {
  const out = await execCmd('git log --oneline -8', P.gitRoot);
  await send(chatId, `🔀 *Últimos commits:*\n\`\`\`\n${out}\n\`\`\``);
}

async function cmdDiff(chatId) {
  const out = await execCmd('git diff HEAD~1 --stat', P.gitRoot);
  await send(chatId, `📝 *Cambios recientes:*\n\`\`\`\n${out.slice(0, 1500)}\n\`\`\``);
}

async function cmdUptime(chatId) {
  const free   = os.freemem();
  const total  = os.totalmem();
  const usedPct = Math.round((1 - free / total) * 100);
  const secs   = os.uptime();
  const hrs    = Math.floor(secs / 3600);
  const mins   = Math.floor((secs % 3600) / 60);
  const disk   = await execCmd("df -h / | tail -1 | awk '{print $3\"/\"$2\" (\"$5\" usado)\"}'");
  const pm2    = await execCmd('pm2 list --no-color | grep lifeos');

  await send(chatId, [
    '🖥️ *VPS Status*',
    `RAM: ${usedPct}% usada — ${Math.round((total - free) / 1024 / 1024)}/${Math.round(total / 1024 / 1024)} MB`,
    `Disco: ${disk}`,
    `Uptime: ${hrs}h ${mins}m`,
    '',
    '🤖 *Procesos pm2:*',
    `\`\`\`\n${pm2 || 'sin procesos'}\n\`\`\``
  ].join('\n'));
}

// --- Centro de Operaciones ---

async function cmdRuta(chatId) {
  const candidates = [
    'RUTA-CRITICA.md', '00-DASHBOARD-ECOSISTEMA.md',
    'PROYECTOS/LIFE-OS.md', 'RUTA_CRITICA.md'
  ];
  for (const f of candidates) {
    const fp = path.join(P.centroOps, f);
    if (fileExists(fp)) {
      return send(chatId, `🗺️ *${f}*\n\`\`\`\n${readFile(fp)}\n\`\`\``);
    }
  }
  await send(chatId, '⚠️ Archivo de ruta crítica no encontrado. Verifica que el repo Centro Ops esté en `/opt/openclaw/projects/centro-ops/repo/`');
}

async function cmdInbox(chatId) {
  const fp = path.join(P.centroOps, '10-INBOX-AGENTES.md');
  if (!fileExists(fp)) return send(chatId, 'Archivo 10-INBOX-AGENTES.md no encontrado.');
  await send(chatId, `📥 *Inbox — Propuestas pendientes:*\n\`\`\`\n${readFile(fp)}\n\`\`\``);
}

async function cmdCola(chatId) {
  const fp = path.join(P.centroOps, '11-COLA-TAREAS.md');
  if (!fileExists(fp)) return send(chatId, 'Archivo 11-COLA-TAREAS.md no encontrado.');
  await send(chatId, `⚡ *Cola — Tareas listas:*\n\`\`\`\n${readFile(fp)}\n\`\`\``);
}

async function cmdProyectos(chatId) {
  const dir = path.join(P.centroOps, 'PROYECTOS');
  try {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
    for (const f of files) {
      const preview = fs.readFileSync(path.join(dir, f), 'utf8').split('\n').slice(0, 15).join('\n');
      await send(chatId, `📁 *${f}*\n\`\`\`\n${preview}\n\`\`\``);
    }
  } catch (e) { await send(chatId, `Error leyendo PROYECTOS/: ${e.message}`); }
}

async function cmdCentroSync(chatId) {
  await send(chatId, '🔄 Sincronizando Centro Ops desde GitHub...');
  const out = await execCmd('git pull origin main', P.centroOps);
  await send(chatId, `✅ Centro Ops sync:\n\`\`\`\n${out.slice(0, 600)}\n\`\`\``);
}

// --- Dashboard unificado ---

async function cmdDashboard(chatId) {
  // QA status
  const lastQA  = latestReport('DEEP_');
  const qaLine  = runnerProcess
    ? '🔄 Runner ACTIVO ahora'
    : (lastQA ? `✅ Último DEEP: \`${lastQA.name}\` (hace ${minsAgo(lastQA.mtime)} min)` : '⏸ Sin runs todavía');

  // Centro Ops counts
  let inboxCount = '?', colaCount = '?';
  try {
    const inboxLines = fs.readFileSync(path.join(P.centroOps, '10-INBOX-AGENTES.md'), 'utf8').split('\n');
    inboxCount = inboxLines.filter(l => /^[-*]\s/.test(l)).length;
  } catch {}
  try {
    const colaLines = fs.readFileSync(path.join(P.centroOps, '11-COLA-TAREAS.md'), 'utf8').split('\n');
    colaCount = colaLines.filter(l => /^[-*]\s/.test(l)).length;
  } catch {}

  // Git
  const lastCommit = await execCmd('git log --oneline -1', P.gitRoot);

  // VPS RAM
  const usedPct = Math.round((1 - os.freemem() / os.totalmem()) * 100);

  await send(chatId, [
    `🎛️ *Dashboard — ${new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}*`,
    '',
    '📊 *Life OS QA*',
    qaLine,
    '',
    '🗂️ *Centro de Operaciones*',
    `📥 Inbox: ${inboxCount} propuestas pendientes`,
    `⚡ Cola: ${colaCount} tareas listas`,
    '',
    '🔀 *Último commit:*',
    `\`${lastCommit}\``,
    '',
    `🖥️ VPS RAM: ${usedPct}% usada`,
  ].join('\n'));
}

// --- Help ---

async function cmdHelp(chatId) {
  await send(chatId, [
    '🤖 *Life OS Chief of Staff*',
    '',
    '⚡ *QA Pipeline*',
    '/run — Runner E2E completo (~25 min)',
    '/analyze — Solo analyze-deep.js (~8 min)',
    '/status — ¿Está corriendo?',
    '/log — Últimas 30 líneas del reporte',
    '/report — Resumen último DEEP',
    '/errors — Solo fallos del run',
    '/scores — Veredictos y scores DEEP',
    '/history — Últimos 10 reportes',
    '/todo — CODEX_NEXT_SESSION.md',
    '/reset\\_qa — Reset usuario QA a pro',
    '',
    '🛠️ *Control VPS*',
    '/sync — git pull + cp todos los scripts',
    '/deploy — Firebase deploy a staging',
    '/git — Últimos 8 commits',
    '/diff — Cambios recientes en el repo',
    '/uptime — RAM, disco, procesos pm2',
    '',
    '🗂️ *Centro de Operaciones*',
    '/dashboard — Vista unificada de todo',
    '/ruta — Ruta crítica del ecosistema',
    '/inbox — Propuestas pendientes',
    '/cola — Tareas listas para ejecutar',
    '/proyectos — Estado de todos los proyectos',
    '/centrosync — git pull del repo Centro Ops',
  ].join('\n'));
}

// --- Router ---

async function handleUpdate(update) {
  const msg = update.message;
  if (!msg?.text) return;
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  const text   = msg.text.trim();

  if (userId !== AUTHORIZED_ID) { await send(chatId, '⛔ No autorizado.'); return; }
  console.log(`[${new Date().toISOString()}] ${text}`);

  const cmd = text.split(' ')[0].toLowerCase();
  switch (cmd) {
    case '/run':         return cmdRun(chatId);
    case '/deep':        return cmdRun(chatId);
    case '/analyze':     return cmdAnalyze(chatId);
    case '/status':      return cmdStatus(chatId);
    case '/log':         return cmdLog(chatId);
    case '/report':      return cmdReport(chatId);
    case '/errors':      return cmdErrors(chatId);
    case '/scores':      return cmdScores(chatId);
    case '/history':     return cmdHistory(chatId);
    case '/todo':        return cmdTodo(chatId);
    case '/reset_qa':
    case '/resetqa':     return cmdResetQA(chatId);
    case '/sync':        return cmdSync(chatId);
    case '/deploy':      return cmdDeploy(chatId);
    case '/git':         return cmdGit(chatId);
    case '/diff':        return cmdDiff(chatId);
    case '/uptime':      return cmdUptime(chatId);
    case '/dashboard':   return cmdDashboard(chatId);
    case '/ruta':        return cmdRuta(chatId);
    case '/inbox':       return cmdInbox(chatId);
    case '/cola':        return cmdCola(chatId);
    case '/proyectos':   return cmdProyectos(chatId);
    case '/centrosync':  return cmdCentroSync(chatId);
    case '/help':
    case '/start':       return cmdHelp(chatId);
    default:
      await send(chatId, 'Comando no reconocido. Usa /help');
  }
}

// --- Poll loop ---

async function poll() {
  console.log(`[${new Date().toISOString()}] Life OS Chief of Staff iniciado (uid: ${AUTHORIZED_ID})`);
  while (true) {
    const updates = await getUpdates();
    for (const update of updates) await handleUpdate(update);
    await new Promise(r => setTimeout(r, 500));
  }
}

poll().catch(e => { console.error('Bridge crashed:', e); process.exit(1); });
