#!/usr/bin/env node
// /opt/openclaw/telegram-bridge.js
// Life OS QA — Telegram Bridge (corre en el HOST, no en el contenedor)
// Comandos: /run /status /log /report /help

'use strict';
require('dotenv').config({ path: '/opt/openclaw/.env' });

const https = require('https');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.TELEGRAM_BRIDGE_TOKEN;
const AUTHORIZED_ID = parseInt(process.env.TELEGRAM_AUTHORIZED_ID || '8412757068');
const RUNNER_DIR = '/opt/openclaw';
const REPORTS_DIR = '/opt/openclaw/repo/lifeos/qa-reports';

if (!TOKEN) {
  console.error('[bridge] TELEGRAM_BRIDGE_TOKEN no encontrado en .env');
  process.exit(1);
}

let runnerProcess = null;
let runnerChatId = null;
let lastOffset = 0;

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
  return tgRequest('sendMessage', {
    chat_id: chatId,
    text: text.slice(0, 4096),
    parse_mode: 'Markdown'
  }).catch(() => {});
}

async function getUpdates() {
  try {
    const res = await tgRequest('getUpdates', { offset: lastOffset, timeout: 30, allowed_updates: ['message'] });
    if (res.ok && res.result.length > 0) {
      lastOffset = res.result[res.result.length - 1].update_id + 1;
      return res.result;
    }
  } catch { /* network hiccup, retry */ }
  return [];
}

// --- Helpers ---

function latestReport(prefix = '') {
  try {
    return fs.readdirSync(REPORTS_DIR)
      .filter(f => f.endsWith('.md') && f.startsWith(prefix))
      .map(f => ({ name: f, full: path.join(REPORTS_DIR, f), mtime: fs.statSync(path.join(REPORTS_DIR, f)).mtime }))
      .sort((a, b) => b.mtime - a.mtime)[0] || null;
  } catch { return null; }
}

// --- Comandos ---

async function cmdRun(chatId) {
  if (runnerProcess) {
    await send(chatId, '⚠️ Ya hay un runner corriendo. Usa /status para ver el progreso.');
    return;
  }
  await send(chatId, '🚀 *Lanzando runner.js --deep...*\nEsto tarda ~25-30 min. Te aviso cuando termine.');

  runnerChatId = chatId;
  runnerProcess = spawn('node', ['runner.js', '--deep'], {
    cwd: RUNNER_DIR,
    env: { ...process.env }
  });

  runnerProcess.stdout.on('data', () => {});
  runnerProcess.stderr.on('data', () => {});

  runnerProcess.on('close', async code => {
    runnerProcess = null;
    const icon = code === 0 ? '✅' : '❌';
    await send(runnerChatId, `${icon} Runner terminó (exit ${code}).\nUsa /report para ver el resultado.`);
    runnerChatId = null;
  });
}

async function cmdStatus(chatId) {
  if (runnerProcess) {
    await send(chatId, '🔄 *Runner ACTIVO* — corriendo ahora mismo.\nUsa /log para ver las últimas líneas.');
    return;
  }
  const last = latestReport();
  if (!last) {
    await send(chatId, '⏸ Runner inactivo. Sin reportes todavía.');
    return;
  }
  const ago = Math.round((Date.now() - last.mtime) / 60000);
  await send(chatId, `⏸ Runner *inactivo*.\nÚltimo reporte: \`${last.name}\`\nHace ${ago} min.`);
}

async function cmdLog(chatId) {
  const last = latestReport();
  if (!last) { await send(chatId, 'Sin reportes disponibles.'); return; }
  const lines = fs.readFileSync(last.full, 'utf8').split('\n');
  const tail = lines.slice(-30).join('\n');
  await send(chatId, `📄 *${last.name}* (últimas 30 líneas):\n\`\`\`\n${tail}\n\`\`\``);
}

async function cmdReport(chatId) {
  const last = latestReport('DEEP_');
  if (!last) { await send(chatId, 'Sin reportes DEEP disponibles todavía.'); return; }
  const content = fs.readFileSync(last.full, 'utf8').slice(0, 3500);
  await send(chatId, `📊 *${last.name}*\n\`\`\`\n${content}\n\`\`\`\n_(recortado — reporte completo en el VPS)_`);
}

async function cmdHelp(chatId) {
  await send(chatId, [
    '🤖 *Life OS QA Bridge*',
    '',
    '/run — Lanza runner.js --deep (~25 min)',
    '/status — Estado del runner',
    '/log — Últimas 30 líneas del reporte activo',
    '/report — Resumen del último reporte DEEP',
    '/help — Este menú'
  ].join('\n'));
}

// --- Loop principal ---

async function handleUpdate(update) {
  const msg = update.message;
  if (!msg?.text) return;

  const userId = msg.from.id;
  const chatId = msg.chat.id;
  const text = msg.text.trim();

  if (userId !== AUTHORIZED_ID) { await send(chatId, '⛔ No autorizado.'); return; }

  console.log(`[${new Date().toISOString()}] ${text}`);

  if (text.startsWith('/run') || text.startsWith('/deep')) return cmdRun(chatId);
  if (text.startsWith('/status'))                          return cmdStatus(chatId);
  if (text.startsWith('/log'))                             return cmdLog(chatId);
  if (text.startsWith('/report'))                          return cmdReport(chatId);
  if (text.startsWith('/help') || text === '/start')       return cmdHelp(chatId);

  await send(chatId, 'Comando no reconocido. Usa /help');
}

async function poll() {
  console.log(`[${new Date().toISOString()}] Life OS QA Bridge iniciado (authorized: ${AUTHORIZED_ID})`);
  while (true) {
    const updates = await getUpdates();
    for (const update of updates) await handleUpdate(update);
    await new Promise(r => setTimeout(r, 500));
  }
}

poll().catch(e => { console.error('Bridge crashed:', e); process.exit(1); });
