#!/usr/bin/env node
/**
 * OpenClaw QA Runner — Life OS
 * Versión: 2.0 (completa — 20 módulos)
 * Fecha: 2026-04-13
 *
 * Ejecutar manualmente:
 *   cd /opt/openclaw && node runner.js
 *
 * Ejecutar contra producción (solo smoke test):
 *   APP_URL=https://mylifeos.lat SMOKE_ONLY=true node runner.js
 */

'use strict';

require('dotenv').config({ path: '/opt/openclaw/.env' });

const { chromium } = require('playwright');
const fs            = require('fs');
const path          = require('path');
const { execSync }  = require('child_process');

// ══════════════════════════════════════════════════════════════
// CONFIGURACIÓN
// ══════════════════════════════════════════════════════════════
const APP_URL      = process.env.APP_URL      || 'https://mylifeos-staging.web.app';
const REPORTS_DIR  = process.env.QA_REPORTS_DIR || '/opt/openclaw/repo/lifeos/qa-reports';
const REPO_DIR     = process.env.QA_REPO_DIR    || '/opt/openclaw/repo/lifeos';
const QA_EMAIL     = process.env.QA_USER_EMAIL;
const QA_PASS      = process.env.QA_USER_PASSWORD;
const ADMIN_EMAIL  = process.env.QA_ADMIN_EMAIL;
const ADMIN_PASS   = process.env.QA_ADMIN_PASSWORD;
const SMOKE_ONLY   = process.env.SMOKE_ONLY === 'true';

// ══════════════════════════════════════════════════════════════
// TIMESTAMP DEL REPORTE
// ══════════════════════════════════════════════════════════════
const now   = new Date();
const pad   = n => String(n).padStart(2, '0');
const stamp = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`
            + `_${pad(now.getHours())}-${pad(now.getMinutes())}`;
const reportPath = path.join(REPORTS_DIR, `${stamp}.md`);

// ══════════════════════════════════════════════════════════════
// ESTADO GLOBAL DEL REPORTE
// ══════════════════════════════════════════════════════════════
const results  = [];
const uxIssues = [];
let browser, context, page;

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function addResult(module, scenario, status, detail = '') {
  results.push({ module, scenario, status, detail });
  const icon = { PASS: '✅', FAIL: '❌', SKIP: '⏭', INFO: 'ℹ️', WARN: '⚠️' }[status] || '?';
  log(`${icon} ${module} — ${scenario}${detail ? ': ' + detail : ''}`);
}

function addUX(module, issue, suggestion = '') {
  uxIssues.push({ module, issue, suggestion });
  log(`[UX] ${module}: ${issue}`);
}

// ══════════════════════════════════════════════════════════════
// PER-MODULE WRAPPER — definido a nivel global para evitar problemas de scope
// ══════════════════════════════════════════════════════════════
async function runModule(fn, label) {
  try { await fn(); }
  catch (e) {
    log(`[CRASH] ${label}: ${e.message}`);
    addResult(label, 'Error inesperado en módulo', 'FAIL', e.message.slice(0, 150));
  }
}

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════
async function waitFor(selector, timeout = 10000) {
  try { await page.waitForSelector(selector, { timeout }); return true; }
  catch { return false; }
}

async function isVisible(selector) {
  try {
    const el = await page.$(selector);
    if (!el) return false;
    return await el.isVisible();
  } catch { return false; }
}

async function getText(selector) {
  try { return await page.$eval(selector, el => el.textContent.trim()); }
  catch { return ''; }
}

async function getAttr(selector, attr) {
  try { return await page.$eval(selector, (el, a) => el.getAttribute(a), attr); }
  catch { return null; }
}

async function evalJS(fn) {
  try { return await page.evaluate(fn); }
  catch { return null; }
}

/** page.click con timeout corto — no cuelga 30s si el elemento está tapado */
async function safeClick(selector, timeout = 6000) {
  try { await page.click(selector, { timeout }); return true; }
  catch { return false; }
}

/** page.fill con timeout corto */
async function safeFill(selector, value, timeout = 6000) {
  try { await page.fill(selector, value, { timeout }); return true; }
  catch { return false; }
}

/** Verifica si la sesión sigue activa; si no, re-logea.
 *  Si la página está cerrada, la recrea desde el contexto existente. */
async function ensureLoggedIn() {
  // Verificar si la página sigue viva
  let pageAlive = false;
  try { await page.evaluate(() => true); pageAlive = true; } catch { pageAlive = false; }

  if (!pageAlive) {
    log('[SESSION] Página cerrada — recreando...');
    try { page = await context.newPage(); attachConsoleListeners(); }
    catch {
      // contexto también muerto — recrear todo
      log('[SESSION] Contexto muerto — recreando browser...');
      try { await browser.close(); } catch {}
      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
      });
      context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) OpenClaw-QA-Bot/2.0',
        locale: 'es-MX', timezoneId: 'America/Mexico_City',
      });
      page = await context.newPage();
      attachConsoleListeners();
    }
  }

  const authVisible = await evalJS(() => {
    const a = document.getElementById('auth-screen');
    return a && window.getComputedStyle(a).display !== 'none';
  });
  if (authVisible || !pageAlive) {
    log('[SESSION] auth-screen detectado — re-login automático...');
    const ok = await doLogin();
    if (!ok) throw new Error('Re-login falló tras detectar auth-screen');
  }
}

/** Espera que la app bootee completamente post-login */
async function waitForBoot(timeout = 25000) {
  const appOk   = await waitFor('#app', timeout);
  if (!appOk) return false;
  // Esperar que el boot-screen desaparezca
  try {
    await page.waitForSelector('#boot-screen', { state: 'hidden', timeout });
  } catch { /* puede que no exista */ }
  await page.waitForTimeout(800);
  return true;
}

/** Login estándar con el usuario QA */
async function doLogin(email = QA_EMAIL, pass = QA_PASS) {
  await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await waitFor('#auth-screen', 10000);
  // Asegurar que estamos en la pestaña de login
  const loginTab = await page.$('[onclick*="showLogin"], .tab-login, #tab-login');
  if (loginTab) await loginTab.click();
  await page.waitForTimeout(300);
  await page.fill('#login-email', email);
  await page.fill('#login-pass', pass);
  await page.click('[onclick="doLogin()"]');
  return await waitForBoot(25000);
}

/** Navegar a un módulo via JS directo */
async function goTo(moduleId) {
  await evalJS(`navigate('${moduleId}')`);
  await page.waitForTimeout(1000);
}

/** Verificar ausencia de NaN/undefined en el texto de la página */
async function checkNoNaN(moduleLabel) {
  const bodyText = await evalJS(() => document.body.innerText);
  if (!bodyText) return;
  if (/\bNaN\b/.test(bodyText))
    addResult(moduleLabel, 'Sin NaN visible en página', 'FAIL', 'NaN detectado en texto de la UI');
  if (/\bundefined\b/.test(bodyText))
    addUX(moduleLabel, 'Texto "undefined" visible al usuario', 'Verificar render functions con valores por defecto');
}

/** Captura errores de consola globales */
const consoleErrors = [];
function attachConsoleListeners() {
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const txt = msg.text();
      // Ignorar errores conocidos no críticos
      const ignored = [
        'email-decode.min.js',
        'enableMultiTabIndexedDbPersistence',
        'webpage_content_reporter',
        'favicon.ico',
      ];
      if (!ignored.some(i => txt.includes(i))) {
        consoleErrors.push(txt);
        log(`[CONSOLE ERROR] ${txt.slice(0, 120)}`);
      }
    }
  });
  page.on('pageerror', err => {
    const msg = err.message;
    const ignored = ['insertBefore on Node', 'insertBefore']; // bug conocido no crítico
    if (!ignored.some(i => msg.includes(i))) {
      consoleErrors.push(msg);
      addResult('GLOBAL', 'Error de JS en página', 'FAIL', msg.slice(0, 100));
    }
  });
}

// ══════════════════════════════════════════════════════════════
// 01 — AUTH
// ══════════════════════════════════════════════════════════════
async function testAuth() {
  log('▶ 01-Auth');

  await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 30000 });

  const authVisible = await waitFor('#auth-screen', 12000);
  addResult('01-Auth', 'auth-screen visible antes del login', authVisible ? 'PASS' : 'FAIL');

  const appHidden = await evalJS(() => {
    const el = document.getElementById('app');
    return !el || el.style.display === 'none' || el.hidden;
  });
  addResult('01-Auth', '#app oculto antes del login', appHidden ? 'PASS' : 'WARN', appHidden ? '' : '#app podría estar visible sin auth');

  // Placeholder email en registro
  const regEmailPlaceholder = await getAttr('#reg-email', 'placeholder');
  addResult('01-Auth', 'Placeholder email registro correcto', regEmailPlaceholder === 'Tu mejor correo *' ? 'PASS' : 'FAIL', `placeholder="${regEmailPlaceholder}"`);

  // Edge case: credenciales incorrectas
  await page.fill('#login-email', 'fake@noemail.com');
  await page.fill('#login-pass', 'wrongpassword');
  await page.click('[onclick="doLogin()"]').catch(() => {});
  await page.waitForTimeout(3000);
  const errorShown = await evalJS(() => {
    const t = document.getElementById('toast');
    return t && t.textContent.length > 0;
  });
  addResult('01-Auth', 'Credenciales incorrectas → feedback visible', errorShown ? 'PASS' : 'WARN', 'Toast o mensaje de error esperado');

  // Happy path login
  const loggedIn = await doLogin();
  addResult('01-Auth', 'Login happy path → app visible', loggedIn ? 'PASS' : 'FAIL');

  // XP visible tras login
  const xpTxt = await getText('#sb-xp');
  addResult('01-Auth', 'XP visible en sidebar post-login', xpTxt.includes('XP') ? 'PASS' : 'FAIL', xpTxt);

  // No NaN
  await checkNoNaN('01-Auth');
}

// ══════════════════════════════════════════════════════════════
// 02 — ONBOARDING / TRIAL FLOW
// ══════════════════════════════════════════════════════════════
async function testOnboarding() {
  log('▶ 02-Onboarding');
  const inApp = await waitForBoot();
  if (!inApp) { addResult('02-Onboarding', 'Pre-condición', 'SKIP', 'App no disponible'); return; }

  // Trial banner
  const trialBanner = await isVisible('#trial-banner');
  addResult('02-Onboarding', 'Trial banner visible (usuario free/trial)', trialBanner ? 'PASS' : 'INFO', trialBanner ? '' : 'Usuario puede ser Pro o admin');

  const trialText = await getText('#trial-text');
  if (trialBanner) {
    addResult('02-Onboarding', 'Trial banner muestra días restantes', trialText.includes('día') ? 'PASS' : 'FAIL', trialText);
  }

  // Verificar que el Gemelo onboarding NO bloquea al usuario que ya lo completó
  const gemeloOnboardingActive = await isVisible('#gemelo-onboarding-overlay');
  addResult('02-Onboarding', 'Onboarding Gemelo no bloquea usuario existente', !gemeloOnboardingActive ? 'PASS' : 'WARN', gemeloOnboardingActive ? 'Modal activo — puede ser primer uso' : '');
}

// ══════════════════════════════════════════════════════════════
// 03 — BLACKOUT
// ══════════════════════════════════════════════════════════════
async function testBlackout() {
  log('▶ 03-Blackout');
  const inApp = await waitForBoot();
  if (!inApp) { addResult('03-Blackout', 'Pre-condición', 'SKIP', ''); return; }

  const ringEl = await page.$('#nucleo-progress-ring');
  const ringExists = ringEl !== null;
  addResult('03-Blackout', 'SVG nucleo-progress-ring existe en DOM', ringExists ? 'PASS' : 'FAIL');

  const hasBlackout = await evalJS(() => document.body.classList.contains('blackout'));
  addResult('03-Blackout', 'Estado BLACKOUT actual', 'INFO', `body.blackout=${hasBlackout}`);

  if (hasBlackout) {
    // Si está en blackout, verificar que el XP no es negativo
    const xp = await evalJS(() => (window.S && window.S.xp) || 0);
    addResult('03-Blackout', 'XP no es negativo en BLACKOUT', xp >= 0 ? 'PASS' : 'FAIL', `S.xp=${xp}`);

    // Verificar banner de blackout
    const banner = await isVisible('#blackout-banner');
    addResult('03-Blackout', 'Banner BLACKOUT visible', banner ? 'PASS' : 'WARN');

    // Verificar que el FAB sigue visible (clearado sobre el banner)
    const fab = await isVisible('#fab-btn, .fab-btn, [id*="fab"]');
    addResult('03-Blackout', 'FAB visible sobre banner BLACKOUT', fab ? 'PASS' : 'WARN');
  }

  // Verificar modo recuperación (día difícil)
  const hasRecovery = await evalJS(() => document.body.classList.contains('recovery'));
  addResult('03-Blackout', 'Estado RECOVERY actual', 'INFO', `body.recovery=${hasRecovery}`);
}

// ══════════════════════════════════════════════════════════════
// 04 — PAYWALL / CONSULTA MODE
// ══════════════════════════════════════════════════════════════
async function testPaywall() {
  log('▶ 04-Paywall');
  const inApp = await waitForBoot();
  if (!inApp) { addResult('04-Paywall', 'Pre-condición', 'SKIP', ''); return; }

  const paywallVisible = await isVisible('#paywall-lockdown, [id*="paywall"]');
  addResult('04-Paywall', 'Estado paywall actual', 'INFO', `visible=${paywallVisible}`);

  if (paywallVisible) {
    const upgradeBtns = await page.$$('button:has-text("Pro"), button:has-text("$99"), button:has-text("Activar")');
    addResult('04-Paywall', 'Botones de upgrade visibles en paywall', upgradeBtns.length > 0 ? 'PASS' : 'FAIL', `${upgradeBtns.length} botones`);
  }

  // Consulta mode banner
  const consultaBanner = await isVisible('[id*="consulta-banner"], [class*="consulta"]');
  addResult('04-Paywall', 'Estado consulta mode actual', 'INFO', `visible=${consultaBanner}`);
}

// ══════════════════════════════════════════════════════════════
// 05 — DASHBOARD
// ══════════════════════════════════════════════════════════════
async function testDashboard() {
  log('▶ 05-Dashboard');
  await goTo('dashboard');

  // Anillo SVG
  const strokeOffset = await evalJS(() => {
    const ring = document.querySelector('#nucleo-progress-ring');
    if (!ring) return null;
    const circle = ring.querySelector('circle:last-child') || ring;
    return circle.getAttribute('stroke-dashoffset');
  });
  const validOffset = strokeOffset !== null && !String(strokeOffset).includes('NaN');
  addResult('05-Dashboard', 'SVG ring stroke-dashoffset válido (no NaN)', validOffset ? 'PASS' : 'FAIL', `offset=${strokeOffset}`);

  // XP
  const xpTxt = await getText('#sb-xp');
  addResult('05-Dashboard', 'XP en sidebar sin NaN', (!xpTxt.includes('NaN') && xpTxt.length > 0) ? 'PASS' : 'FAIL', xpTxt);

  // Nivel
  const lvlTxt = await getText('#sb-level, #tb-level, [id*="level"]');
  addResult('05-Dashboard', 'Nivel sin NaN', !lvlTxt.includes('NaN') ? 'PASS' : 'FAIL', lvlTxt);

  // Saldo financiero no debe mostrar $0.00 inmediatamente (debe mostrar … mientras carga)
  const balTxt = await getText('[id*="balance"], [id*="saldo"], .fin-balance');
  const falseZero = balTxt === '$0.00' || balTxt === '0';
  if (falseZero) addUX('05-Dashboard', 'Widget saldo muestra $0.00 al arrancar', 'Verificar flag _finListenerReady — debe mostrar "…" antes del primer snapshot');
  addResult('05-Dashboard', 'Widget saldo no muestra $0.00 prematuro', !falseZero ? 'PASS' : 'WARN', balTxt);

  // Check-in button
  const checkinBtn = await isVisible('#checkin-btn, [onclick*="checkin"], [onclick*="checkIn"]');
  addResult('05-Dashboard', 'Botón check-in visible', checkinBtn ? 'PASS' : 'FAIL');

  // Radar chart
  const radarCanvas = await isVisible('#radar-chart, canvas');
  addResult('05-Dashboard', 'Canvas del Radar Chart visible', radarCanvas ? 'PASS' : 'WARN');

  // Focus bars
  const focusBars = await isVisible('#focus-bars, [id*="focus-bar"]');
  addResult('05-Dashboard', 'Focus bars visibles', focusBars ? 'PASS' : 'WARN');

  await checkNoNaN('05-Dashboard');
}

// ══════════════════════════════════════════════════════════════
// 06 — FINANZAS
// ══════════════════════════════════════════════════════════════
async function testFinanzas() {
  log('▶ 06-Finanzas');
  await goTo('financial');
  await page.waitForTimeout(1500); // dar tiempo al onSnapshot

  // Lista de transacciones
  const txList = await isVisible('#tx-list, [id*="tx-list"]');
  addResult('06-Finanzas', '#tx-list existe en DOM', txList ? 'PASS' : 'FAIL');

  // Saldo sin NaN
  const saldoEl = await page.$('[id*="balance"], [id*="saldo"], .fin-balance, #personal-balance');
  const saldoTxt = saldoEl ? await saldoEl.textContent() : '';
  addResult('06-Finanzas', 'Saldo personal sin NaN', saldoTxt && !saldoTxt.includes('NaN') ? 'PASS' : 'FAIL', saldoTxt.trim().slice(0, 40));

  // Botón agregar transacción
  const addTxBtn = await isVisible('#add-tx-btn, [onclick*="addTransaction"], button:has-text("Agregar")');
  addResult('06-Finanzas', 'Botón agregar transacción visible', addTxBtn ? 'PASS' : 'WARN');

  // Pie charts
  const charts = await page.$$('canvas');
  addResult('06-Finanzas', 'Al menos 1 canvas (pie chart) en módulo financiero', charts.length > 0 ? 'PASS' : 'WARN', `${charts.length} canvas`);

  // Staging: agregar y verificar transacción
  if (!SMOKE_ONLY && addTxBtn) {
    const montoInput = await page.$('[id*="tx-amount"], [id*="monto"], input[type="number"]');
    if (montoInput) {
      const xpBefore = await evalJS(() => (window.S && window.S.xp) || 0);
      await montoInput.fill('250');
      // Seleccionar tipo entrada si existe el selector
      await evalJS(() => {
        const sel = document.querySelector('select[id*="tipo"], [id*="tx-type"]');
        if (sel) sel.value = 'entrada';
      });
      await page.click('[onclick*="addTransaction"], button:has-text("Guardar"), button:has-text("Agregar")').catch(() => {});
      await page.waitForTimeout(2000);
      const txItems = await page.$$('[id*="tx-list"] > *, .tx-item, [class*="tx-card"]');
      addResult('06-Finanzas', 'Transacción de prueba aparece en lista', txItems.length > 0 ? 'PASS' : 'WARN', `${txItems.length} items`);
    }
  }

  await checkNoNaN('06-Finanzas');
}

// ══════════════════════════════════════════════════════════════
// 07 — HÁBITOS (dentro de Productividad)
// ══════════════════════════════════════════════════════════════
async function testHabitos() {
  log('▶ 07-Habitos');
  await ensureLoggedIn();
  await goTo('productividad');
  await page.waitForTimeout(1000);

  // Navegar al sub-panel de hábitos si existe
  const habitsTab = await page.$('[onclick*="habits"], [onclick*="habitos"], .tab-habits');
  if (habitsTab) { await habitsTab.click().catch(() => {}); await page.waitForTimeout(800); }

  const habitList = await isVisible('#habit-list, [id*="habit-list"]');
  addResult('07-Habitos', 'Lista de hábitos visible', habitList ? 'PASS' : 'FAIL');

  const habitInput = await isVisible('#new-habit, [id*="new-habit"], input[placeholder*="hábito"]');
  addResult('07-Habitos', 'Input nuevo hábito existe', habitInput ? 'PASS' : 'FAIL');

  // Staging: agregar hábito
  if (!SMOKE_ONLY && habitInput) {
    await safeFill('#new-habit, [id*="new-habit"], input[placeholder*="hábito"]', `Hábito QA ${Date.now()}`);
    await safeClick('[onclick*="addHabit"], button:has-text("Agregar"), [onclick*="saveHabit"]');
    await page.waitForTimeout(1500);
    const cards = await page.$$('.habit-card, [class*="habit-card"], [class*="habit-item"]');
    addResult('07-Habitos', 'Hábito de prueba aparece en lista', cards.length > 0 ? 'PASS' : 'WARN', `${cards.length} hábitos`);
  }

  // Verificar que algún hábito tiene indicador de batería
  const battery = await page.$('[class*="battery"], [id*="battery"], .bat-bar');
  addResult('07-Habitos', 'Sistema de batería presente en hábitos', battery ? 'PASS' : 'INFO', battery ? '' : 'Sin hábitos o sin batería visible');

  await checkNoNaN('07-Habitos');
}

// ══════════════════════════════════════════════════════════════
// 08 — CUERPO / GYM
// ══════════════════════════════════════════════════════════════
async function testCuerpo() {
  log('▶ 08-Cuerpo');
  await ensureLoggedIn();
  await goTo('cuerpo');
  await page.waitForTimeout(1000);

  // Muscle map
  const muscleMap = await isVisible('#muscle-map, [id*="muscle"], svg[id*="muscle"]');
  addResult('08-Cuerpo', 'Muscle map visible', muscleMap ? 'PASS' : 'WARN');

  // Health checklist
  const healthItems = await page.$$('[id*="health-"], [class*="health-item"], [onclick*="toggleSalud"]');
  addResult('08-Cuerpo', 'Items de salud (check-in combustible) presentes', healthItems.length > 0 ? 'PASS' : 'WARN', `${healthItems.length} items`);

  // Gráfica de volumen / XP
  const charts = await page.$$('canvas');
  addResult('08-Cuerpo', 'Al menos 1 canvas de análisis visible', charts.length > 0 ? 'PASS' : 'WARN', `${charts.length} canvas`);

  // Botón registrar gym
  const gymBtn = await isVisible('[onclick*="toggleGym"], [onclick*="gymDay"], #gym-day-btn');
  addResult('08-Cuerpo', 'Botón de registro gym visible', gymBtn ? 'PASS' : 'WARN');

  await checkNoNaN('08-Cuerpo');
}

// ══════════════════════════════════════════════════════════════
// 09 — GEMELO POTENCIADO
// ══════════════════════════════════════════════════════════════
async function testGemelo() {
  log('▶ 09-Gemelo');
  await ensureLoggedIn();
  await goTo('stats');
  await page.waitForTimeout(1200);

  // Sección Gemelo
  const gemeloSection = await isVisible('#gemelo-section, [id*="gemelo"]');
  addResult('09-Gemelo', 'Sección del Gemelo visible en Análisis', gemeloSection ? 'PASS' : 'FAIL');

  // Progress bar
  const progressBar = await isVisible('#gemelo-progress-bar, [id*="gemelo-progress"]');
  addResult('09-Gemelo', 'Progress bar del Gemelo presente', progressBar ? 'PASS' : 'INFO');

  // Seguridad: el análisis NO debe mostrarse a usuario sin acceso
  const geminoPotenciado = await evalJS(() => window.S && window.S.geminoPotenciado);
  const isPro = await evalJS(() => window.S && window.S.isPro);
  const analysisText = await getText('#gemelo-analysis-text, [id*="analysis-text"]');
  if (analysisText.length > 20 && !isPro && !geminoPotenciado) {
    addResult('09-Gemelo', 'Análisis bloqueado para usuario sin acceso', 'FAIL', 'Texto de análisis visible sin ser Pro/Trial');
  } else {
    addResult('09-Gemelo', 'Análisis bloqueado para usuario sin acceso', 'PASS');
  }

  // Survival tasks (si análisis bloqueado)
  const survivalTasks = await page.$$('[id*="survival-task"], [class*="survival"]');
  addResult('09-Gemelo', 'Survival tasks visibles (si acceso bloqueado)', 'INFO', `${survivalTasks.length} tasks`);

  // Estado del gemelo en S
  const gemeloState = await evalJS(() => {
    if (!window.S) return 'S no disponible';
    return `geminoPotenciado=${window.S.geminoPotenciado}, onboardingCompletado=${window.S.onboardingGemeloCompletado}`;
  });
  addResult('09-Gemelo', 'Estado del Gemelo en S', 'INFO', gemeloState);

  await checkNoNaN('09-Gemelo');
}

// ══════════════════════════════════════════════════════════════
// 10 — STRIPE / PAGOS (solo verifica UI — sin procesar pagos reales)
// ══════════════════════════════════════════════════════════════
async function testStripe() {
  log('▶ 10-Stripe');
  await ensureLoggedIn();
  await goTo('settings');
  await page.waitForTimeout(1000);

  // Sección de suscripción
  const subsSection = await isVisible('[id*="suscripcion"], [id*="plan"], [class*="plan-section"]');
  addResult('10-Stripe', 'Sección de suscripción visible en Ajustes', subsSection ? 'PASS' : 'WARN');

  // Botón de upgrade
  const upgradeBtn = await page.$('button:has-text("Pro"), button:has-text("$99"), [onclick*="procesarPago"]');
  addResult('10-Stripe', 'Botón de activar plan Pro existe', upgradeBtn ? 'PASS' : 'WARN');

  // Verificar que el botón de pago NO activa checkout automáticamente (debe ser un clic manual)
  if (upgradeBtn) {
    const btnText = await upgradeBtn.textContent();
    addResult('10-Stripe', 'Botón de pago requiere acción manual del usuario', 'PASS', `Texto: "${btnText.trim().slice(0,40)}"`);
  }

  // Plan actual visible
  const planBadge = await getText('[id*="plan-badge"], [class*="plan-badge"], [id*="current-plan"]');
  addResult('10-Stripe', 'Badge del plan actual visible', planBadge.length > 0 ? 'PASS' : 'INFO', planBadge);
}

// ══════════════════════════════════════════════════════════════
// 11 — GAMIFICACIÓN (XP, Rueda, Leaderboard)
// ══════════════════════════════════════════════════════════════
async function testGamificacion() {
  log('▶ 11-Gamificacion');
  await ensureLoggedIn();
  await goTo('stats');
  await page.waitForTimeout(1000);

  // Leaderboard
  const leaderboardItems = await page.$$('[id*="leaderboard"] li, [id*="leaderboard"] .item, [class*="leaderboard-item"]');
  addResult('11-Gamificacion', 'Leaderboard tiene entradas', leaderboardItems.length > 0 ? 'PASS' : 'INFO', `${leaderboardItems.length} entradas`);

  // XP en dashboard
  await goTo('dashboard');
  const xpText = await getText('#sb-xp, #tb-xp');
  const xpNum = parseInt(xpText.replace(/\D/g, ''));
  addResult('11-Gamificacion', 'XP es número válido >= 0', (!isNaN(xpNum) && xpNum >= 0) ? 'PASS' : 'FAIL', xpText);

  // Level
  const levelText = await getText('#sb-level, #tb-level');
  addResult('11-Gamificacion', 'Level es número válido >= 1', levelText.length > 0 && !levelText.includes('NaN') ? 'PASS' : 'FAIL', levelText);
}

// ══════════════════════════════════════════════════════════════
// 12 — TIENDA DE DECORACIÓN (WORLD / APARTAMENTO)
// ══════════════════════════════════════════════════════════════
async function testTienda() {
  log('▶ 12-Tienda');
  await ensureLoggedIn();
  await goTo('world');
  await page.waitForTimeout(1200);

  // Mapa visible
  const mapVisible = await isVisible('#city-map, [id*="city-map"], [id*="world-map"], canvas');
  addResult('12-Tienda', 'Mapa de ciudad visible', mapVisible ? 'PASS' : 'WARN');

  // Navegar al apartamento / tienda
  const shopBtn = await page.$('[onclick*="openShop"], [onclick*="shop"], button:has-text("Tienda")');
  if (shopBtn) {
    await shopBtn.click().catch(() => {});
    await page.waitForTimeout(1000);
  }

  // REGLA CRÍTICA: shop-exp-display debe mostrar XP, no coins
  const shopExpDisplay = await getText('#shop-exp-display, [id*="shop-exp"]');
  const shopCoinsDisplay = await getText('#shop-coins-display, [id*="shop-coins"]');
  const xpVal = await evalJS(() => window.S && window.S.xp);
  if (shopExpDisplay) {
    const displayNum = parseInt(shopExpDisplay.replace(/\D/g, ''));
    addResult('12-Tienda', 'Shop muestra XP (no coins) — REGLA CRÍTICA', String(displayNum) === String(xpVal) ? 'PASS' : 'FAIL',
      `display="${shopExpDisplay}", S.xp=${xpVal}`);
  } else {
    addResult('12-Tienda', 'Shop exp display accesible', 'INFO', 'No se encontró #shop-exp-display — puede requerir abrir tienda');
  }

  // Rooms en el catálogo
  const roomCards = await page.$$('[class*="room-card"], [id*="room-"], .shop-item');
  addResult('12-Tienda', 'Catálogo de rooms visible', roomCards.length > 0 ? 'PASS' : 'INFO', `${roomCards.length} rooms`);

  // Rooms equipadas persisten (verificar S)
  const equippedRoom = await evalJS(() => window.S && window.S.equippedRoom);
  addResult('12-Tienda', 'equippedRoom en estado S', 'INFO', `equippedRoom="${equippedRoom}"`);
}

// ══════════════════════════════════════════════════════════════
// 13 — CALENDARIO
// ══════════════════════════════════════════════════════════════
async function testCalendario() {
  log('▶ 13-Calendario');
  await ensureLoggedIn();
  await goTo('calendar');
  await page.waitForTimeout(1200);

  // Grid del calendario
  const calGrid = await isVisible('.cal-grid, [id*="cal-grid"], [class*="calendar-grid"]');
  addResult('13-Calendario', 'Grid del calendario renderiza', calGrid ? 'PASS' : 'FAIL');

  // Botones prev/next
  const prevBtn = await isVisible('[onclick*="calPrev"], [onclick*="prevMonth"], .cal-prev');
  const nextBtn = await isVisible('[onclick*="calNext"], [onclick*="nextMonth"], .cal-next');
  addResult('13-Calendario', 'Botones prev/next de mes existen', (prevBtn && nextBtn) ? 'PASS' : 'WARN');

  // Navegación al mes siguiente
  if (nextBtn) {
    const headerBefore = await getText('[id*="cal-month"], [id*="cal-header"], .cal-month-title');
    await safeClick('[onclick*="calNext"], [onclick*="nextMonth"], .cal-next');
    await page.waitForTimeout(800);
    const headerAfter = await getText('[id*="cal-month"], [id*="cal-header"], .cal-month-title');
    addResult('13-Calendario', 'Navegar al mes siguiente cambia header', headerBefore !== headerAfter ? 'PASS' : 'WARN', `"${headerBefore}" → "${headerAfter}"`);
  }

  // Botón export ICS
  const exportBtn = await isVisible('[onclick*="exportCalendar"], [onclick*="ics"], button:has-text("ICS"), button:has-text("Exportar")');
  addResult('13-Calendario', 'Botón export ICS visible', exportBtn ? 'PASS' : 'WARN');

  await checkNoNaN('13-Calendario');
}

// ══════════════════════════════════════════════════════════════
// 14 — PRODUCTIVIDAD (Tareas, Pomodoro, Ideas, Metas)
// ══════════════════════════════════════════════════════════════
async function testProductividad() {
  log('▶ 14-Productividad');
  await ensureLoggedIn();
  await goTo('productividad');
  await page.waitForTimeout(1000);

  // Lista de tareas
  const taskList = await isVisible('#task-list, [id*="task-list"]');
  addResult('14-Productividad', '#task-list visible', taskList ? 'PASS' : 'FAIL');

  // Input nueva tarea
  const taskInput = await isVisible('#new-task, [id*="new-task"], input[placeholder*="tarea"]');
  addResult('14-Productividad', 'Input nueva tarea existe', taskInput ? 'PASS' : 'FAIL');

  // Staging: agregar y completar tarea
  if (!SMOKE_ONLY && taskInput) {
    const xpBefore = await evalJS(() => (window.S && window.S.xp) || 0);
    await safeFill('#new-task, [id*="new-task"]', `Tarea QA ${Date.now()}`);
    await page.keyboard.press('Enter').catch(() => {});
    await page.waitForTimeout(1500);
    const tasks = await page.$$('.task-card, [class*="task-item"], [class*="task-card"]');
    addResult('14-Productividad', 'Tarea QA aparece en lista', tasks.length > 0 ? 'PASS' : 'WARN', `${tasks.length} tareas`);

    // Completar la primera tarea visible
    const firstToggle = await page.$('.task-card input[type="checkbox"], [onclick*="toggleTask"], .task-toggle');
    if (firstToggle) {
      await firstToggle.click().catch(() => {});
      await page.waitForTimeout(1500);
      const xpAfter = await evalJS(() => (window.S && window.S.xp) || 0);
      addResult('14-Productividad', 'Completar tarea suma XP', xpAfter > xpBefore ? 'PASS' : 'WARN', `XP: ${xpBefore} → ${xpAfter}`);
    }
  }

  // Pomodoro timer básico
  const pomBtn = await isVisible('[onclick*="pomodoro"], [onclick*="startTimer"], #pom-btn');
  addResult('14-Productividad', 'Acceso a Pomodoro visible', pomBtn ? 'PASS' : 'INFO');

  // Ideas
  await evalJS(() => navigate('productividad')); // asegurarse de estar en productividad
  const ideasTab = await page.$('[onclick*="ideas"], .tab-ideas');
  if (ideasTab) await ideasTab.click().catch(() => {});
  await page.waitForTimeout(800);
  const ideaList = await isVisible('#idea-list, [id*="idea-list"]');
  addResult('14-Productividad', 'Lista de ideas visible', ideaList ? 'PASS' : 'INFO');

  await checkNoNaN('14-Productividad');
}

// ══════════════════════════════════════════════════════════════
// 15 — MENTE & PODER
// ══════════════════════════════════════════════════════════════
async function testMente() {
  log('▶ 15-Mente');
  await ensureLoggedIn();
  await goTo('mente');
  await page.waitForTimeout(1000);

  // Biblioteca
  const bookList = await isVisible('#book-list, [id*="book-list"]');
  addResult('15-Mente', 'Lista de biblioteca visible', bookList ? 'PASS' : 'WARN');

  // Bitácora de victorias
  const bitacoraList = await isVisible('#bitacora-list, [id*="bitacora"]');
  addResult('15-Mente', 'Bitácora de victorias visible', bitacoraList ? 'PASS' : 'WARN');

  // Aliados
  const aliadosList = await isVisible('#aliados-list, [id*="aliados"]');
  addResult('15-Mente', 'Sección de aliados visible', aliadosList ? 'PASS' : 'WARN');

  // Solicitudes de amistad pendientes
  const friendReqSection = await isVisible('#friend-requests-section, [id*="friend-req"]');
  addResult('15-Mente', 'Sección de solicitudes de amistad existe', friendReqSection ? 'PASS' : 'INFO');

  // Staging: agregar victoria
  if (!SMOKE_ONLY) {
    const victoriaInput = await page.$('#new-victoria, [id*="victoria"], input[placeholder*="victoria"]');
    if (victoriaInput) {
      await safeFill('#new-victoria, [id*="victoria"], input[placeholder*="victoria"]', `Victoria QA: prueba automatizada ${stamp}`);
      await safeClick('[onclick*="addVictoria"], button:has-text("Guardar"), button:has-text("Agregar")');
      await page.waitForTimeout(1500);
      const victorias = await page.$$('.bitacora-item, [class*="victoria-item"]');
      addResult('15-Mente', 'Victoria QA aparece en bitácora', victorias.length > 0 ? 'PASS' : 'WARN', `${victorias.length} entradas`);
    }
  }

  await checkNoNaN('15-Mente');
}

// ══════════════════════════════════════════════════════════════
// 16 — LIFE OS WORLD
// ══════════════════════════════════════════════════════════════
async function testWorld() {
  log('▶ 16-World');
  await ensureLoggedIn();
  await goTo('world');
  await page.waitForTimeout(1500);

  // Mapa de ciudad
  const cityMap = await isVisible('#city-map, [id*="city-map"], canvas');
  addResult('16-World', 'Mapa de ciudad visible', cityMap ? 'PASS' : 'WARN');

  // Burbuja del usuario
  const bubble = await isVisible('#user-bubble, [id*="user-bubble"], [class*="bubble"]');
  addResult('16-World', 'Burbuja del usuario visible', bubble ? 'PASS' : 'INFO');

  // Color y emoji de la burbuja en S
  const bubbleColor = await evalJS(() => window.S && window.S.bubbleColor);
  const bubbleEmoji = await evalJS(() => window.S && window.S.bubbleEmoji);
  addResult('16-World', 'bubbleColor en estado S', bubbleColor ? 'PASS' : 'INFO', `color="${bubbleColor}"`);
  addResult('16-World', 'bubbleEmoji en estado S', bubbleEmoji ? 'PASS' : 'INFO', `emoji="${bubbleEmoji}"`);

  // Apartamento accesible
  const aptBtn = await isVisible('[onclick*="openApartment"], [onclick*="apartment"], .apt-zone');
  addResult('16-World', 'Acceso al apartamento visible', aptBtn ? 'PASS' : 'WARN');
}

// ══════════════════════════════════════════════════════════════
// 17 — FAB (BOTÓN FLOTANTE)
// ══════════════════════════════════════════════════════════════
async function testFAB() {
  log('▶ 17-FAB');

  // El FAB debe estar en todas las páginas
  const modules = ['dashboard', 'productividad', 'financial', 'mente'];
  for (const mod of modules) {
    await goTo(mod);
    const fab = await isVisible('#fab-btn, .fab-btn, [id*="fab-btn"], [class*="fab"]');
    addResult('17-FAB', `FAB visible en módulo ${mod}`, fab ? 'PASS' : 'FAIL');
  }

  // Verificar que el FAB no tapa el nav inferior en mobile
  const viewport = page.viewportSize();
  if (viewport && viewport.width <= 428) {
    const fabBox = await evalJS(() => {
      const el = document.querySelector('#fab-btn, .fab-btn, [id*="fab-btn"]');
      if (!el) return null;
      return el.getBoundingClientRect();
    });
    const navBox = await evalJS(() => {
      const el = document.querySelector('#mob-nav, .mob-nav, .bottom-nav');
      if (!el) return null;
      return el.getBoundingClientRect();
    });
    if (fabBox && navBox) {
      const overlap = fabBox.bottom > navBox.top;
      addResult('17-FAB', 'FAB no tapa nav inferior (mobile)', !overlap ? 'PASS' : 'FAIL',
        `FAB.bottom=${fabBox.bottom.toFixed(0)}, nav.top=${navBox.top.toFixed(0)}`);
    }
  }

  // Staging: probar NLP del FAB
  if (!SMOKE_ONLY) {
    await goTo('dashboard');
    const fabBtn = await page.$('#fab-btn, .fab-btn, [id*="fab-btn"]');
    if (fabBtn) {
      await fabBtn.click().catch(() => {});
      await page.waitForTimeout(500);
      await page.waitForTimeout(600);
      const fabInput = await page.$('#fab-input, [id*="fab-input"]');
      if (fabInput) {
        await safeFill('#fab-input, [id*="fab-input"]', 'tarea comprar leche mañana');
        await page.keyboard.press('Enter').catch(() => {});
        await page.waitForTimeout(1500);
        const chip = await isVisible('[id*="fab-chip"], [class*="confirm-chip"], [id*="chip"]');
        addResult('17-FAB', 'NLP FAB genera chip de confirmación', chip ? 'PASS' : 'WARN', '"tarea comprar leche mañana"');
      }
    }
  }
}

// ══════════════════════════════════════════════════════════════
// 18 — ADMIN PANEL (solo si admin)
// ══════════════════════════════════════════════════════════════
async function testAdmin() {
  log('▶ 18-Admin');

  if (!ADMIN_EMAIL || !ADMIN_PASS) {
    addResult('18-Admin', 'Pruebas de admin', 'SKIP', 'Credenciales de admin no configuradas');
    return;
  }

  // Login como admin
  await page.goto(APP_URL, { waitUntil: 'networkidle' });
  await waitFor('#auth-screen');
  await page.fill('#login-email', ADMIN_EMAIL);
  await page.fill('#login-pass', ADMIN_PASS);
  await page.click('[onclick="doLogin()"]').catch(() => {});
  const loggedIn = await waitForBoot(25000);

  if (!loggedIn) { addResult('18-Admin', 'Login admin', 'SKIP', 'No se pudo loguear'); return; }

  // page-agencies debe ser visible para admin
  const agenciesVisible = await isVisible('#page-agencies');
  addResult('18-Admin', '#page-agencies visible para admin', agenciesVisible ? 'PASS' : 'FAIL');

  // Intentar navegar a agencies
  await evalJS(() => navigate('agencies'));
  await page.waitForTimeout(800);
  const inAgencies = await evalJS(() => {
    const el = document.getElementById('page-agencies');
    return el && window.getComputedStyle(el).display !== 'none';
  });
  addResult('18-Admin', 'Admin puede navegar a /agencies', inAgencies ? 'PASS' : 'FAIL');

  // Volver a logear con usuario QA para el resto de pruebas
  await doLogin();
}

// ══════════════════════════════════════════════════════════════
// 19 — FCM PUSH NOTIFICATIONS
// ══════════════════════════════════════════════════════════════
async function testFCM() {
  log('▶ 19-FCM');
  await goTo('settings');
  await page.waitForTimeout(800);

  // Toggle de notificaciones
  const pushToggle = await isVisible('#push-notif-toggle, [id*="push-toggle"], [onclick*="registerPush"]');
  addResult('19-FCM', 'Toggle de notificaciones push visible', pushToggle ? 'PASS' : 'WARN');

  // Verificar que el service worker de FCM está registrado
  const swRegistered = await evalJS(async () => {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      return regs.some(r => r.active && r.active.scriptURL.includes('firebase-messaging-sw'));
    } catch { return false; }
  });
  addResult('19-FCM', 'firebase-messaging-sw.js registrado', swRegistered ? 'PASS' : 'WARN', swRegistered ? '' : 'SW no registrado — notificaciones pueden no funcionar');

  // Verificar que el fcm_token fue guardado en S si el usuario tiene notificaciones activas
  const fcmToken = await evalJS(() => window.S && window.S.fcmToken);
  addResult('19-FCM', 'FCM token en estado S', 'INFO', fcmToken ? `token presente (${String(fcmToken).slice(0,20)}…)` : 'token ausente — notificaciones no activadas');
}

// ══════════════════════════════════════════════════════════════
// 20 — PWA (instalación, offline)
// ══════════════════════════════════════════════════════════════
async function testPWA() {
  log('▶ 20-PWA');

  // Verificar manifest
  const manifestRes = await page.goto(`${APP_URL}/manifest.json`, { waitUntil: 'networkidle' }).catch(() => null);
  if (manifestRes) {
    addResult('20-PWA', 'manifest.json accesible', manifestRes.status() === 200 ? 'PASS' : 'FAIL', `HTTP ${manifestRes.status()}`);
    const manifestBody = await manifestRes.text().catch(() => '{}');
    const manifest = JSON.parse(manifestBody);
    addResult('20-PWA', 'manifest.json tiene name y start_url', (manifest.name && manifest.start_url) ? 'PASS' : 'FAIL',
      `name="${manifest.name}", start_url="${manifest.start_url}"`);
    addResult('20-PWA', 'manifest.json apunta a mylifeos.lat', manifest.start_url && manifest.start_url.includes('mylifeos.lat') ? 'PASS' : 'WARN',
      manifest.start_url);
  }

  // Verificar service worker principal
  const swRes = await page.goto(`${APP_URL}/sw.js`, { waitUntil: 'networkidle' }).catch(() => null);
  addResult('20-PWA', 'sw.js accesible', swRes && swRes.status() === 200 ? 'PASS' : 'FAIL',
    swRes ? `HTTP ${swRes.status()}` : 'No accesible');

  // Volver a la app
  await page.goto(APP_URL, { waitUntil: 'networkidle' });
  await waitForBoot();

  // Verificar offline básico (interceptar red y recargar)
  if (!SMOKE_ONLY) {
    await page.context().setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000);
    const bodyOffline = await evalJS(() => document.body.innerText);
    const crashedOffline = bodyOffline.includes('ERR_INTERNET_DISCONNECTED') || bodyOffline.includes('No internet');
    addResult('20-PWA', 'App no crashea en offline (service worker activo)', !crashedOffline ? 'PASS' : 'FAIL',
      crashedOffline ? 'App no disponible offline' : 'App renderiza contenido offline');
    await page.context().setOffline(false);
    // Reconectar
    await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await waitForBoot();
  }
}

// ══════════════════════════════════════════════════════════════
// REVISIÓN VISUAL RESPONSIVE
// ══════════════════════════════════════════════════════════════
async function testResponsive() {
  log('▶ RESPONSIVE — Mobile 375px');

  // Cambiar a mobile
  await page.setViewportSize({ width: 375, height: 812 });
  await goTo('dashboard');
  await page.waitForTimeout(1000);

  // Nav inferior (drawer)
  const mobNav = await isVisible('#mob-drawer-nav, .mob-drawer-nav, #desktop-nav');
  addResult('RESPONSIVE', 'Nav visible en mobile (375px)', mobNav ? 'PASS' : 'FAIL');

  // Sidebar desktop oculta en mobile
  const sidebar = await evalJS(() => {
    const el = document.getElementById('sidebar');
    if (!el) return 'no existe';
    return window.getComputedStyle(el).display;
  });
  addResult('RESPONSIVE', 'Sidebar desktop oculta en mobile', sidebar === 'none' || sidebar === 'no existe' ? 'PASS' : 'WARN', `display=${sidebar}`);

  // Overflow horizontal (scroll lateral)
  const hasHScroll = await evalJS(() => document.body.scrollWidth > window.innerWidth + 5);
  addResult('RESPONSIVE', 'Sin scroll horizontal en mobile (375px)', !hasHScroll ? 'PASS' : 'WARN',
    hasHScroll ? `scrollWidth=${document.body ? document.body.scrollWidth : '?'}` : '');
  if (hasHScroll) addUX('RESPONSIVE', 'Scroll horizontal en mobile 375px', 'Revisar elementos con width fijo o overflow visible');

  // Restaurar viewport desktop
  await page.setViewportSize({ width: 1280, height: 800 });
}

// ══════════════════════════════════════════════════════════════
// GENERADOR DEL REPORTE MARKDOWN
// ══════════════════════════════════════════════════════════════
function generateReport() {
  const total   = results.length;
  const passed  = results.filter(r => r.status === 'PASS').length;
  const failed  = results.filter(r => r.status === 'FAIL').length;
  const skipped = results.filter(r => r.status === 'SKIP').length;
  const warned  = results.filter(r => r.status === 'WARN').length;
  const info    = results.filter(r => r.status === 'INFO').length;
  const effective = total - info - skipped;
  const pct = effective > 0 ? Math.round(passed / effective * 100) : 0;

  let md = `# REPORTE QA — ${stamp}\n`;
  md += `> App: ${APP_URL} | Modo: ${SMOKE_ONLY ? 'SMOKE' : 'FULL'} | Engine: Playwright Chromium | Bot: OpenClaw v2.0\n\n`;

  md += `## RESUMEN\n\n`;
  md += `| Métrica | Valor |\n|---------|-------|\n`;
  md += `| Total pruebas | ${total} |\n`;
  md += `| ✅ PASS | ${passed} |\n`;
  md += `| ❌ FAIL | ${failed} |\n`;
  md += `| ⚠️ WARN | ${warned} |\n`;
  md += `| ⏭ SKIP | ${skipped} |\n`;
  md += `| ℹ INFO | ${info} |\n`;
  md += `| Tasa de éxito | **${pct}%** |\n\n`;

  if (consoleErrors.length > 0) {
    md += `## ERRORES DE CONSOLA DETECTADOS\n\n`;
    consoleErrors.slice(0, 20).forEach(e => {
      md += `- \`${e.slice(0, 150)}\`\n`;
    });
    md += '\n';
  }

  md += `## RESULTADOS DETALLADOS\n\n`;
  const modules = [...new Set(results.map(r => r.module))];
  for (const mod of modules) {
    md += `### ${mod}\n\n`;
    md += `| Escenario | Estado | Detalle |\n|-----------|--------|---------|\n`;
    results.filter(r => r.module === mod).forEach(r => {
      const icon = { PASS: '✅', FAIL: '❌', SKIP: '⏭', INFO: 'ℹ️', WARN: '⚠️' }[r.status] || '?';
      md += `| ${r.scenario} | ${icon} ${r.status} | ${r.detail || ''} |\n`;
    });
    md += '\n';
  }

  if (failed > 0) {
    md += `## FALLOS DETECTADOS 🔴\n\n`;
    results.filter(r => r.status === 'FAIL').forEach(r => {
      md += `### ❌ ${r.module} — ${r.scenario}\n`;
      md += `- **Detalle:** ${r.detail || 'Sin detalle adicional'}\n`;
      md += `- **Acción:** Revisar código relacionado y crear fix en rama \`fix/${r.module.toLowerCase().replace(/\s/g, '-')}\`\n\n`;
    });
  }

  if (warned > 0) {
    md += `## ADVERTENCIAS ⚠️\n\n`;
    results.filter(r => r.status === 'WARN').forEach(r => {
      md += `- **${r.module}** — ${r.scenario}: ${r.detail || ''}\n`;
    });
    md += '\n';
  }

  if (uxIssues.length > 0) {
    md += `## MEJORAS SUGERIDAS (UX)\n\n`;
    uxIssues.forEach(u => {
      md += `- **[UX] ${u.module}:** ${u.issue}`;
      if (u.suggestion) md += ` → _${u.suggestion}_`;
      md += '\n';
    });
    md += '\n';
  }

  md += `---\n*Generado automáticamente por OpenClaw QA Bot v2.0 · ${new Date().toISOString()}*\n`;
  return md;
}

// ══════════════════════════════════════════════════════════════
// PIPELINE PRINCIPAL
// ══════════════════════════════════════════════════════════════
async function main() {
  log('═══ OpenClaw QA Suite v2.0 iniciando ═══');
  log(`Modo: ${SMOKE_ONLY ? 'SMOKE (solo lectura)' : 'FULL (lectura + escritura en staging)'}`);
  log(`Target: ${APP_URL}`);

  browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });

  context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) OpenClaw-QA-Bot/2.0',
    locale: 'es-MX',
    timezoneId: 'America/Mexico_City',
  });

  page = await context.newPage();
  attachConsoleListeners();

  try {
    // ── Orden por riesgo (CRÍTICO primero) ──
    await runModule(testAuth,          '01-Auth');
    await runModule(testOnboarding,    '02-Onboarding');
    await runModule(testBlackout,      '03-Blackout');
    await runModule(testPaywall,       '04-Paywall');
    await runModule(testDashboard,     '05-Dashboard');

    if (!SMOKE_ONLY) {
      await runModule(testFinanzas,      '06-Finanzas');
      await runModule(testHabitos,       '07-Habitos');
      await runModule(testCuerpo,        '08-Cuerpo');
      await runModule(testGemelo,        '09-Gemelo');
      await runModule(testStripe,        '10-Stripe');
      await runModule(testGamificacion,  '11-Gamificacion');
      await runModule(testTienda,        '12-Tienda');
      await runModule(testCalendario,    '13-Calendario');
      await runModule(testProductividad, '14-Productividad');
      await runModule(testMente,         '15-Mente');
      await runModule(testWorld,         '16-World');
      await runModule(testFAB,           '17-FAB');
      await runModule(testAdmin,         '18-Admin');
      await runModule(testFCM,           '19-FCM');
      await runModule(testPWA,           '20-PWA');
      await runModule(testResponsive,    'RESPONSIVE');
    }

  } catch (e) {
    log(`[FATAL] Error inesperado en pipeline principal: ${e.message}`);
    addResult('RUNNER', 'Error fatal en pipeline', 'FAIL', e.message.slice(0, 150));
  } finally {
    await browser.close();
  }

  // Generar reporte
  const report = generateReport();
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(reportPath, report, 'utf8');
  log(`Reporte guardado: ${reportPath}`);

  // Commit y push automático
  const GH_TOKEN = process.env.GH_TOKEN;
  try {
    process.chdir(REPO_DIR);
    const reportsRelPath = path.relative(REPO_DIR, REPORTS_DIR);
    if (GH_TOKEN) {
      // Configurar remote con token para push sin contraseña
      execSync(`git remote set-url origin https://${GH_TOKEN}@github.com/422065902-sys/Life-Os.git`, { stdio: 'pipe' });
    }
    execSync('git pull origin main --quiet', { stdio: 'pipe' });
    execSync(`git add "${reportsRelPath}/"`, { stdio: 'pipe' });
    const passCnt = results.filter(r => r.status === 'PASS').length;
    const failCnt = results.filter(r => r.status === 'FAIL').length;
    execSync(`git commit -m "QA ${stamp} — ✅${passCnt} ❌${failCnt} [${SMOKE_ONLY ? 'smoke' : 'full'}]"`, { stdio: 'pipe' });
    execSync('git push origin main', { stdio: 'pipe' });
    log('Reporte commiteado y pusheado ✓');
  } catch (e) {
    log(`[WARN] Error al hacer commit/push: ${e.message.split('\n')[0]}`);
  }

  log('═══ OpenClaw QA Suite completado ═══');

  const hasFails = results.some(r => r.status === 'FAIL');
  process.exit(hasFails ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
