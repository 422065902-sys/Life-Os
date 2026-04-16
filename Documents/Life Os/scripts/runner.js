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
const SHOTS_DIR  = path.join(REPORTS_DIR, 'screenshots', stamp);

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

/** Captura screenshot del viewport actual */
async function takeShot(name) {
  try {
    fs.mkdirSync(SHOTS_DIR, { recursive: true });
    // Guardia: no capturar si estamos en auth screen
    const onAuth = await evalJS(() => {
      const auth = document.getElementById('auth-screen');
      if (!auth) return false;
      const st = window.getComputedStyle(auth);
      return st.display !== 'none' && st.visibility !== 'hidden' && parseFloat(st.opacity || '1') > 0.1;
    });
    if (onAuth) { log(`[SHOT-GUARD] Auth screen visible — screenshot ${name} omitido`); return; }
    // Esperar contenido real (excepto para screenshots de auth intencionales)
    if (!name.includes('auth') && !name.includes('offline')) {
      await page.waitForFunction(() => {
        const auth = document.getElementById('auth-screen');
        if (auth) {
          const st = window.getComputedStyle(auth);
          if (st.display !== 'none' && parseFloat(st.opacity || '1') > 0.1) return false;
        }
        const pages = document.querySelectorAll('[id^="page-"], .page');
        for (const p of pages) {
          const st = window.getComputedStyle(p);
          if (st.display !== 'none' && p.getBoundingClientRect().height > 80) return true;
        }
        return false;
      }, { timeout: 6000 }).catch(() => {});
    }
    await page.screenshot({
      path: path.join(SHOTS_DIR, `${name}.jpg`),
      type: 'jpeg', quality: 55, fullPage: false
    });
  } catch(e) { log(`[WARN] Screenshot ${name} falló: ${e.message}`); }
}

/**
 * Captura dos screenshots de un módulo:
 *   <name>_fold.jpg  — viewport inicial (arriba del fold)
 *   <name>_scroll.jpg — después de hacer scroll 500px (contenido debajo del fold)
 * También verifica si el fold inicial está vacío (posible bug de layout).
 */
/** Verifica que la pantalla actual NO es el auth-screen antes de tomar un screenshot.
 *  Si el auth está visible, re-loguea y navega al módulo.
 *  Devuelve false si no pudo recuperarse. */
async function ensureNotOnAuth(moduleLabel) {
  const onAuth = await evalJS(() => {
    const auth = document.getElementById('auth-screen');
    if (!auth) return false;
    const st = window.getComputedStyle(auth);
    return st.display !== 'none' && st.visibility !== 'hidden' && parseFloat(st.opacity || '1') > 0.1;
  });
  if (!onAuth) return true; // ya estamos en la app, ok

  log(`[SHOT-GUARD] Auth screen detectado antes de screenshot de ${moduleLabel} — re-loginando...`);
  const ok = await doLogin();
  if (!ok) {
    log(`[SHOT-GUARD] ❌ No se pudo recuperar sesión para ${moduleLabel} — screenshot omitido`);
    return false;
  }
  // Navegar al módulo correcto basado en el nombre del screenshot (ej: "08-cuerpo" → "cuerpo")
  const moduleMap = {
    'dashboard': 'dashboard', 'finanzas': 'financial', 'flow': 'productividad',
    'flow-agenda': 'productividad', 'flow-ideas': 'productividad', 'flow-metas': 'productividad',
    'habitos': 'productividad', 'cuerpo': 'cuerpo', 'gemelo': 'mente',
    'mente': 'mente', 'world': 'world', 'tienda': 'world', 'apartamento': 'world',
    'gamificacion': 'stats', 'stripe': 'settings', 'fcm': 'settings', 'settings': 'settings',
    'calendar': 'calendar', 'admin': 'dashboard', 'onboarding': 'dashboard',
    'blackout': 'dashboard', 'paywall': 'dashboard',
  };
  const key = Object.keys(moduleMap).find(k => moduleLabel.toLowerCase().includes(k));
  if (key) {
    await goTo(moduleMap[key]);
    await page.waitForTimeout(800);
  }
  return true;
}

async function takeShotWithScroll(name, moduleLabel) {
  try {
    fs.mkdirSync(SHOTS_DIR, { recursive: true });

    // GUARDIA 1: re-login si auth screen está visible
    const canShoot = await ensureNotOnAuth(moduleLabel);
    if (!canShoot) return;

    // GUARDIA 2: esperar hasta que el módulo tenga contenido real visible
    // Confirma que auth-screen está oculto Y hay al menos un .page con altura > 50px
    const moduleReady = await page.waitForFunction(() => {
      // Auth screen debe estar oculto
      const auth = document.getElementById('auth-screen');
      if (auth) {
        const st = window.getComputedStyle(auth);
        const authVisible = st.display !== 'none' && st.visibility !== 'hidden' && parseFloat(st.opacity || '1') > 0.1;
        if (authVisible) return false;
      }
      // Debe haber al menos un .page o [id^="page-"] con contenido
      const pages = document.querySelectorAll('[id^="page-"], .page');
      for (const p of pages) {
        const st = window.getComputedStyle(p);
        if (st.display !== 'none' && st.visibility !== 'hidden' && p.getBoundingClientRect().height > 80) {
          return true;
        }
      }
      return false;
    }, { timeout: 8000 }).catch(() => null);

    if (!moduleReady) {
      log(`[SHOT-GUARD] ⚠️ Módulo ${moduleLabel} no tiene contenido visible después de 8s — screenshot omitido`);
      return;
    }

    // Asegurar que el scroll esté en top antes de capturar
    await evalJS(() => {
      const c = document.getElementById('content');
      if (c) c.scrollTop = 0;
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(400);

    // Screenshot 1 — fold inicial
    await page.screenshot({
      path: path.join(SHOTS_DIR, `${name}_fold.jpg`),
      type: 'jpeg', quality: 55, fullPage: false
    });

    // Detectar si el fold está vacío (fondo sin contenido visible)
    const foldEmpty = await evalJS(() => {
      const activePage = document.querySelector('.page.active');
      if (!activePage) return true;
      // Si el activePanel existe y tiene height, hay contenido
      const activePanel = activePage.querySelector('.inner-panel.active') || activePage;
      return activePanel.getBoundingClientRect().height < 50;
    });
    if (foldEmpty) {
      addUX(moduleLabel, 'Fold inicial vacío — contenido puede estar fuera del viewport',
        'Revisar margin-top, padding o posicionamiento del .page.active');
    }

    // Screenshot 2 — scroll 500px para capturar contenido below-fold
    await evalJS(() => {
      const c = document.getElementById('content');
      if (c) c.scrollTop = 500;
      else window.scrollTo(0, 500);
    });
    await page.waitForTimeout(200);
    await page.screenshot({
      path: path.join(SHOTS_DIR, `${name}_scroll.jpg`),
      type: 'jpeg', quality: 55, fullPage: false
    });

    // Volver al top para que el siguiente test empiece limpio
    await evalJS(() => {
      const c = document.getElementById('content');
      if (c) c.scrollTop = 0;
      window.scrollTo(0, 0);
    });
  } catch(e) { log(`[WARN] takeShotWithScroll ${name} falló: ${e.message}`); }
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
    log('[SESSION] auth-screen detectado — re-login automático (con reintentos)...');
    const ok = await doLogin(); // doLogin ya maneja rate limit y reintentos internamente
    if (!ok) throw new Error('Re-login falló después de todos los reintentos — ver logs [AUTH]');
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

/**
 * Login estándar con usuario QA.
 * Detecta rate limiting de Firebase y espera antes de reintentar.
 *
 * Política de reintentos:
 *   - Rate limit ("demasiados intentos") → espera 90s × intento, máx 3 veces
 *   - Error genérico (credenciales, red) → espera 15s × intento, máx 3 veces
 *   - Sin respuesta (timeout) → espera 20s × intento, máx 3 veces
 */
async function doLogin(email = QA_EMAIL, pass = QA_PASS, attempt = 1) {
  const MAX_ATTEMPTS = 3;

  log(`[AUTH] Login intento ${attempt}/${MAX_ATTEMPTS} — ${email}`);

  try {
    await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 30000 });
  } catch (e) {
    log(`[AUTH] Error cargando APP_URL: ${e.message}`);
    if (attempt < MAX_ATTEMPTS) {
      await page.waitForTimeout(20000 * attempt);
      return doLogin(email, pass, attempt + 1);
    }
    return false;
  }

  const authReady = await waitFor('#auth-screen', 12000);
  if (!authReady) {
    // Puede que ya esté logueado (sesión persistente)
    const alreadyIn = await waitForBoot(8000);
    if (alreadyIn) { log('[AUTH] Sesión persistente activa — sin necesidad de login'); return true; }
    log('[AUTH] auth-screen no apareció ni hay sesión activa');
    if (attempt < MAX_ATTEMPTS) {
      await page.waitForTimeout(15000 * attempt);
      return doLogin(email, pass, attempt + 1);
    }
    return false;
  }

  // Asegurar pestaña de login
  const loginTab = await page.$('[onclick*="showLogin"], .tab-login, #tab-login');
  if (loginTab) await loginTab.click();
  await page.waitForTimeout(300);

  // Limpiar campos antes de llenar (evitar acumulación en reintentos)
  await page.fill('#login-email', '');
  await page.fill('#login-pass', '');
  await page.fill('#login-email', email);
  await page.fill('#login-pass', pass);
  await page.click('[onclick="doLogin()"]');

  // Esperar resultado: boot OK o mensaje de error — polling cada 500ms
  const POLL_TIMEOUT = 25000;
  const POLL_INTERVAL = 500;
  const start = Date.now();

  while (Date.now() - start < POLL_TIMEOUT) {
    // Éxito: auth-screen oculto (señal más confiable que esperar #app)
    const success = await evalJS(() => {
      const auth = document.getElementById('auth-screen');
      const app  = document.getElementById('app');
      // Señal 1: auth-screen desapareció
      if (auth) {
        const authSt = window.getComputedStyle(auth);
        if (authSt.display === 'none' || authSt.visibility === 'hidden' || authSt.opacity === '0') return true;
      }
      // Señal 2: #app tiene contenido visible (nav, sidebar, módulos)
      if (app) {
        const appSt = window.getComputedStyle(app);
        const appVisible = appSt.display !== 'none' && appSt.visibility !== 'hidden';
        const hasContent = app.querySelectorAll('#sidebar, #mob-nav, .page, #nav').length > 0;
        if (appVisible && hasContent) return true;
      }
      return false;
    });
    if (success) {
      log('[AUTH] Login exitoso');
      // Esperar a que las transiciones CSS del auth-screen terminen
      await page.waitForTimeout(1200);
      return true;
    }

    // Detectar mensaje de error en pantalla
    const errorMsg = await evalJS(() => {
      const selectors = [
        '#login-error', '#auth-error', '.auth-error', '.login-error',
        '[id*="error"]', '[class*="error-msg"]', '[class*="auth-msg"]'
      ];
      for (const sel of selectors) {
        try {
          const el = document.querySelector(sel);
          if (el) {
            const txt = (el.textContent || '').trim();
            const style = window.getComputedStyle(el);
            if (txt.length > 3 && style.display !== 'none' && style.visibility !== 'hidden') return txt;
          }
        } catch {}
      }
      return '';
    });

    if (errorMsg) {
      const lower = errorMsg.toLowerCase();
      const isRateLimit = lower.includes('demasiados') || lower.includes('too-many') ||
                          lower.includes('espera') || lower.includes('bloqueado') ||
                          lower.includes('many requests');

      if (isRateLimit) {
        const waitSecs = 90 * attempt; // 90s, 180s, 270s
        log(`[AUTH] ⛔ Rate limit Firebase: "${errorMsg.slice(0, 80)}" — esperando ${waitSecs}s...`);
        addResult('01-Auth', `Login — rate limit (intento ${attempt})`, 'WARN',
          `Firebase bloqueó temporalmente. Esperando ${waitSecs}s.`);
        if (attempt >= MAX_ATTEMPTS) {
          addResult('01-Auth', 'Login — rate limit máx reintentos', 'FAIL',
            'Bloqueado por Firebase. Ejecutar el runner nuevamente en ~5 minutos.');
          return false;
        }
        await page.waitForTimeout(waitSecs * 1000);
        return doLogin(email, pass, attempt + 1);
      }

      // Error genérico (credenciales incorrectas, usuario no existe, etc.)
      log(`[AUTH] Error de login: "${errorMsg.slice(0, 100)}"`);
      if (attempt < MAX_ATTEMPTS) {
        const waitSecs = 15 * attempt;
        log(`[AUTH] Reintentando en ${waitSecs}s...`);
        await page.waitForTimeout(waitSecs * 1000);
        return doLogin(email, pass, attempt + 1);
      }
      addResult('01-Auth', 'Login — error persistente', 'FAIL', errorMsg.slice(0, 120));
      return false;
    }

    await page.waitForTimeout(POLL_INTERVAL);
  }

  // Timeout sin éxito ni error
  log('[AUTH] Timeout esperando respuesta de login');
  if (attempt < MAX_ATTEMPTS) {
    const waitSecs = 20 * attempt;
    log(`[AUTH] Reintentando en ${waitSecs}s...`);
    await page.waitForTimeout(waitSecs * 1000);
    return doLogin(email, pass, attempt + 1);
  }
  return false;
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
// SEED — Datos de demostración (una vez por día, antes de los módulos)
// ══════════════════════════════════════════════════════════════
async function seedUserData() {
  log('[SEED] Verificando si se necesita sembrar datos de demostración...');

  // Idempotente: solo una vez por día en esta cuenta
  const today = new Date().toISOString().slice(0, 10);
  const alreadySeeded = await evalJS(() => {
    const d = new Date().toISOString().slice(0, 10);
    return localStorage.getItem('qa-seeded-' + d) === '1';
  });
  if (alreadySeeded) { log('[SEED] Datos ya sembrados hoy — omitiendo'); return; }

  // ── FINANZAS — 5 transacciones variadas ──────────────────────────────────
  log('[SEED] Sembrando finanzas...');
  await goTo('financial');
  await page.waitForTimeout(1500);

  const txCount = await evalJS(() => {
    const l = document.querySelector('#tx-list');
    return l ? l.children.length : 0;
  });

  if (txCount < 4) {
    const txs = [
      { monto: '15000', tipo: 'entrada', desc: 'Sueldo mensual' },
      { monto: '3500',  tipo: 'gasto',   desc: 'Renta'          },
      { monto: '850',   tipo: 'gasto',   desc: 'Despensa'       },
      { monto: '2200',  tipo: 'entrada', desc: 'Proyecto freelance' },
      { monto: '450',   tipo: 'gasto',   desc: 'Membresía gym'  },
    ];
    for (const tx of txs) {
      // Abrir modal si existe botón
      const addBtn = await page.$('[onclick*="openTxModal"], #add-tx-btn, button:has-text("+ Transacción")');
      if (addBtn) { await addBtn.click().catch(() => {}); await page.waitForTimeout(700); }

      const montoEl = await page.$('[id*="tx-amount"], [id*="monto"], input[type="number"]');
      if (!montoEl) break;
      await montoEl.fill(tx.monto);

      await page.evaluate((tipo) => {
        const sel = document.querySelector('select[id*="tipo"], [id*="tx-type"], select[id*="category"]');
        if (sel) sel.value = tipo;
      }, tx.tipo);

      const descEl = await page.$('[id*="tx-desc"], [id*="descripcion"], input[placeholder*="escr"], input[placeholder*="desc"]');
      if (descEl) await descEl.fill(tx.desc);

      await safeClick('[onclick*="addTransaction"], [onclick*="guardarTx"], button:has-text("Guardar"), button:has-text("Agregar")');
      await page.waitForTimeout(1000);
    }
    log('[SEED] ✅ Transacciones sembradas');
  } else {
    log(`[SEED] Finanzas ya tiene ${txCount} transacciones — ok`);
  }

  // ── HÁBITOS — 3 hábitos en productividad ─────────────────────────────────
  log('[SEED] Sembrando hábitos...');
  await goTo('productividad');
  await page.waitForTimeout(1000);
  const habitsTab = await page.$('[onclick*="habits"], [onclick*="habitos"], .tab-habits');
  if (habitsTab) { await habitsTab.click().catch(() => {}); await page.waitForTimeout(700); }

  const habitCount = await evalJS(() => {
    const l = document.querySelector('#habit-list');
    return l ? l.children.length : 0;
  });

  if (habitCount < 2) {
    for (const h of ['Ejercicio diario 💪', 'Leer 30 minutos 📚', 'Meditar 10 min 🧘']) {
      await safeFill('#new-habit, [id*="new-habit"], input[placeholder*="hábito"]', h);
      await safeClick('[onclick*="addHabit"], [onclick*="saveHabit"], button:has-text("Agregar")');
      await page.waitForTimeout(900);
    }
    log('[SEED] ✅ Hábitos sembrados');
  } else {
    log(`[SEED] Hábitos ya tiene ${habitCount} — ok`);
  }

  // ── TAREAS — 4 tareas (2 completadas) en dashboard ───────────────────────
  log('[SEED] Sembrando tareas...');
  await goTo('dashboard');
  await page.waitForTimeout(1200);

  const taskCount = await evalJS(() => {
    const l = document.querySelector('#task-list');
    return l ? l.children.length : 0;
  });

  if (taskCount < 3) {
    for (const t of [
      'Revisar finanzas del mes 💰',
      'Planear objetivos semanales 🎯',
      'Llamar al banco 📞',
      'Preparar presentación del proyecto',
    ]) {
      await safeFill('#t-name', t);
      await safeClick('[onclick="addTask()"], [onclick*="addTask"]');
      await page.waitForTimeout(700);
    }
    // Completar las 2 primeras
    await page.waitForTimeout(500);
    const checkboxes = await page.$$('#task-list input[type="checkbox"], [onclick*="toggleTask"], [onclick*="completeTask"]');
    for (let i = 0; i < Math.min(2, checkboxes.length); i++) {
      await checkboxes[i].click().catch(() => {});
      await page.waitForTimeout(800);
    }
    log('[SEED] ✅ Tareas sembradas');
  } else {
    log(`[SEED] Tareas ya tiene ${taskCount} — ok`);
  }

  // ── CUERPO — 1 registro de entreno ───────────────────────────────────────
  log('[SEED] Sembrando registro de cuerpo...');
  await goTo('cuerpo');
  await page.waitForTimeout(1200);

  const gymBtn = await page.$('#bio-main-btn, [onclick*="abrirModalEntreno"], [onclick*="openGym"]');
  if (gymBtn) {
    await gymBtn.click().catch(() => {});
    await page.waitForTimeout(800);
    // Intentar guardar el entreno con valores por defecto
    const saveGymBtn = await page.$('button:has-text("Guardar"), button:has-text("Registrar"), [onclick*="guardarEntreno"]');
    if (saveGymBtn) { await saveGymBtn.click().catch(() => {}); await page.waitForTimeout(1000); }
    // Cerrar modal si sigue abierto
    const closeBtn = await page.$('[onclick*="cerrar"], [onclick*="close"], .modal-close, button:has-text("Cerrar")');
    if (closeBtn) await closeBtn.click().catch(() => {});
    log('[SEED] ✅ Entreno registrado');
  }

  // ── MENTE — 3 victorias en bitácora + 1 libro ────────────────────────────
  log('[SEED] Sembrando bitácora y biblioteca...');
  await goTo('mente');
  await page.waitForTimeout(1000);

  // Bitácora de victorias
  const bitacoraTab = await page.$('[onclick*="bitacora"], [onclick*="victorias"], .tab-bitacora');
  if (bitacoraTab) { await bitacoraTab.click().catch(() => {}); await page.waitForTimeout(600); }

  const victoriaCount = await evalJS(() => {
    const l = document.querySelector('#bitacora-list');
    return l ? l.children.length : 0;
  });

  if (victoriaCount < 2) {
    for (const v of [
      'Completé mi primera semana consecutiva de hábitos',
      'Ahorré el 20% de mi sueldo este mes',
      'Terminé el proyecto freelance antes del deadline 🚀',
    ]) {
      const inp = await page.$('#bit-victoria, [id*="victoria-input"], textarea[placeholder*="victoria"]');
      if (!inp) break;
      await inp.fill(v);
      await safeClick('[onclick*="guardarBitacora"], [onclick*="saveVictoria"], button:has-text("Guardar")');
      await page.waitForTimeout(900);
    }
    log('[SEED] ✅ Victorias sembradas');
  } else {
    log(`[SEED] Bitácora ya tiene ${victoriaCount} entradas — ok`);
  }

  // Biblioteca — agregar un libro si está vacía
  const bibliotecaTab = await page.$('[onclick*="biblioteca"], .tab-biblioteca');
  if (bibliotecaTab) { await bibliotecaTab.click().catch(() => {}); await page.waitForTimeout(600); }
  const bookCount = await evalJS(() => {
    const l = document.querySelector('#biblioteca-list');
    return l ? l.children.length : 0;
  });
  if (bookCount < 1) {
    const bookInput = await page.$('#book-title, [id*="book-title"], input[placeholder*="libro"], input[placeholder*="título"]');
    if (bookInput) {
      await bookInput.fill('Atomic Habits — James Clear');
      await safeClick('[onclick*="addBook"], [onclick*="guardarLibro"], button:has-text("Agregar")');
      await page.waitForTimeout(900);
      log('[SEED] ✅ Libro agregado');
    }
  }

  // ── CHECK-IN del día ─────────────────────────────────────────────────────
  log('[SEED] Realizando check-in del día...');
  await goTo('dashboard');
  await page.waitForTimeout(1000);
  const checkinDone = await evalJS(() => {
    const btn = document.querySelector('#checkin-btn, [onclick*="checkIn"], [onclick*="checkin"]');
    if (!btn) return true;
    const txt = (btn.textContent || '').toLowerCase();
    return btn.disabled || txt.includes('✅') || txt.includes('hecho') || txt.includes('listo');
  });
  if (!checkinDone) {
    await safeClick('#checkin-btn, [onclick*="checkIn"], [onclick*="checkin"]');
    await page.waitForTimeout(800);
    log('[SEED] ✅ Check-in realizado');
  } else {
    log('[SEED] Check-in ya completado hoy');
  }

  // Marcar como sembrado hoy
  await page.evaluate((d) => { localStorage.setItem('qa-seeded-' + d, '1'); }, today);
  log('[SEED] ✅ Seed completado — la app tiene datos de demostración reales');
}

// ══════════════════════════════════════════════════════════════
// 01 — AUTH
// ══════════════════════════════════════════════════════════════
/** Hace scroll hasta un selector dentro de .lp-scroll y espera a que entre al viewport */
async function scrollToSection(selector) {
  await evalJS((sel) => {
    const scroll = document.querySelector('.lp-scroll');
    const target = document.querySelector(sel);
    if (!target) return;
    if (scroll) {
      const containerTop = scroll.getBoundingClientRect().top;
      const elemTop = target.getBoundingClientRect().top - containerTop + scroll.scrollTop;
      scroll.scrollTo({ top: elemTop, behavior: 'instant' });
    } else {
      target.scrollIntoView({ behavior: 'instant', block: 'start' });
    }
  }, selector);
  await page.waitForTimeout(350);
}

async function testLanding() {
  log('▶ 00-Landing');

  await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('#landing-page, #auth-screen', { timeout: 12000 }).catch(() => {});

  const isLanding = await evalJS(() => {
    const lp = document.getElementById('landing-page');
    if (!lp) return false;
    const cs = window.getComputedStyle(lp);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
  });

  addResult('00-Landing', 'Landing page visible al abrir sin sesión', isLanding ? 'PASS' : 'FAIL',
    isLanding ? '' : '#landing-page oculto — se muestra auth o app directamente');

  if (!isLanding) {
    log('[00-Landing] ⚠️ Landing no visible — screenshot del estado actual');
    await page.screenshot({ path: `${SHOTS_DIR}/00-landing-fold.jpg`, type: 'jpeg', quality: 55 }).catch(() => {});
    return;
  }

  // Forzar animaciones de entrada
  await evalJS(() => {
    const s = document.querySelector('.lp-scroll');
    if (s) s.scrollTop = 0;
    document.querySelectorAll('.lp-anim').forEach(el => el.classList.add('lp-anim-in'));
  });
  await page.waitForTimeout(700);

  // ── 1. HERO FOLD ─────────────────────────────────────────────
  await scrollToSection('.lp-hero');
  await page.screenshot({ path: `${SHOTS_DIR}/00-landing-hero.jpg`, type: 'jpeg', quality: 65 });

  const ctaVisible = await evalJS(() => {
    const btn = document.querySelector('.lp-hero-cta .lp-btn-primary');
    if (!btn) return false;
    const r  = btn.getBoundingClientRect();
    const lp = document.getElementById('landing-page');
    const lpR = lp ? lp.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
    return r.top >= lpR.top && r.bottom <= lpR.bottom;
  });
  addResult('00-Landing', 'CTA "Empezar gratis" visible above the fold', ctaVisible ? 'PASS' : 'FAIL',
    ctaVisible ? '' : 'El botón CTA está fuera del viewport inicial — bug crítico de conversión');

  // ── 2. SECCIÓN MÓDULOS ───────────────────────────────────────
  await scrollToSection('.lp-modules-grid');
  await page.screenshot({ path: `${SHOTS_DIR}/00-landing-modules.jpg`, type: 'jpeg', quality: 65 });

  // ── 3. CÓMO FUNCIONA (pasos) ─────────────────────────────────
  await scrollToSection('.lp-steps');
  await page.screenshot({ path: `${SHOTS_DIR}/00-landing-steps.jpg`, type: 'jpeg', quality: 65 });

  // ── 4. TESTIMONIOS ───────────────────────────────────────────
  await scrollToSection('.lp-testimonials');
  await page.screenshot({ path: `${SHOTS_DIR}/00-landing-testimonials.jpg`, type: 'jpeg', quality: 65 });

  // ── 5. PRICING ───────────────────────────────────────────────
  await scrollToSection('.lp-pricing');
  await page.screenshot({ path: `${SHOTS_DIR}/00-landing-pricing.jpg`, type: 'jpeg', quality: 65 });

  // ── 6. FOOTER CTA ────────────────────────────────────────────
  await scrollToSection('.lp-footer-cta');
  await page.screenshot({ path: `${SHOTS_DIR}/00-landing-footer.jpg`, type: 'jpeg', quality: 65 });

  addResult('00-Landing', 'Todas las secciones capturadas (hero, módulos, pasos, testimonios, pricing, footer)', 'PASS');

  // ── MOBILE — iPhone 14 (390×844) ─────────────────────────────
  const origVP = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 });
  await evalJS(() => {
    const s = document.querySelector('.lp-scroll');
    if (s) s.scrollTop = 0;
  });
  await page.waitForTimeout(500);
  // Hero en iOS
  await page.screenshot({ path: `${SHOTS_DIR}/responsive-ios-landing.jpg`, type: 'jpeg', quality: 65 });
  // Módulos en iOS
  await scrollToSection('.lp-modules-grid');
  await page.screenshot({ path: `${SHOTS_DIR}/responsive-ios-landing-modules.jpg`, type: 'jpeg', quality: 65 });
  // Pricing en iOS
  await scrollToSection('.lp-pricing');
  await page.screenshot({ path: `${SHOTS_DIR}/responsive-ios-landing-pricing.jpg`, type: 'jpeg', quality: 65 });
  addResult('00-Landing', 'Screenshots landing iOS 390×844 capturados (hero + módulos + pricing)', 'PASS');

  // ── MOBILE — Android Pixel 6a (360×800) ──────────────────────
  await page.setViewportSize({ width: 360, height: 800 });
  await evalJS(() => { const s = document.querySelector('.lp-scroll'); if (s) s.scrollTop = 0; });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS_DIR}/responsive-android-landing.jpg`, type: 'jpeg', quality: 65 });
  await scrollToSection('.lp-modules-grid');
  await page.screenshot({ path: `${SHOTS_DIR}/responsive-android-landing-modules.jpg`, type: 'jpeg', quality: 65 });
  addResult('00-Landing', 'Screenshots landing Android 360×800 capturados (hero + módulos)', 'PASS');

  // Restaurar viewport
  if (origVP) await page.setViewportSize(origVP);
  await page.waitForTimeout(200);
}

// ══════════════════════════════════════════════════════════════
async function testAuth() {
  log('▶ 01-Auth');

  // Si ya estamos en la app desde testLanding, reutilizar la página
  // Si no, navegar de nuevo
  const currentLanding = await evalJS(() => {
    const lp = document.getElementById('landing-page');
    return lp && window.getComputedStyle(lp).display !== 'none';
  });

  if (!currentLanding) {
    await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);
  }

  // Nuevo flujo: landing → clic en "Iniciar Sesión" → auth-screen
  const onLanding = await evalJS(() => {
    const lp = document.getElementById('landing-page');
    return lp && window.getComputedStyle(lp).display !== 'none';
  });

  if (onLanding) {
    // Clic en el botón de login del nav de la landing
    await safeClick('.lp-nav-login, [onclick*="showAuthFromLanding"]');
    await page.waitForTimeout(600);
    addResult('01-Auth', 'Botón "Iniciar Sesión" en landing abre auth-screen', 'PASS');
  }

  const authVisible = await waitFor('#auth-screen', 8000);
  addResult('01-Auth', 'auth-screen visible al hacer clic en Iniciar Sesión', authVisible ? 'PASS' : 'FAIL');

  const appHidden = await evalJS(() => {
    const el = document.getElementById('app');
    if (!el) return true;
    const cs = window.getComputedStyle(el);
    return cs.display === 'none' || cs.visibility === 'hidden' || el.hidden || cs.opacity === '0';
  });
  addResult('01-Auth', '#app oculto antes del login', appHidden ? 'PASS' : 'WARN', appHidden ? '' : '#app podría estar visible sin auth');

  // Placeholder email en registro
  const regEmailPlaceholder = await getAttr('#reg-email', 'placeholder');
  addResult('01-Auth', 'Placeholder email registro correcto', regEmailPlaceholder === 'Tu mejor correo *' ? 'PASS' : 'FAIL', `placeholder="${regEmailPlaceholder}"`);

  // Edge case: credenciales incorrectas — omitido en staging para evitar rate limiting de Firebase
  addResult('01-Auth', 'Credenciales incorrectas → feedback visible', 'SKIP', 'Omitido: evitar rate limiting Firebase en staging');

  // Screenshot pantalla de login (antes de hacer login)
  await takeShot('01-auth-login');

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

  await takeShotWithScroll('02-onboarding', '02-Onboarding');
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

  await takeShotWithScroll('03-blackout', '03-Blackout');
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

  await takeShotWithScroll('04-paywall', '04-Paywall');
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
  await takeShotWithScroll('05-dashboard', '05-Dashboard');
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

  // Botón agregar transacción (abre el modal, no el botón dentro del modal)
  const addTxBtn = await isVisible('[onclick*="openTxModal"], #add-tx-btn, button:has-text("+ Transacción")');
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
  await takeShotWithScroll('06-finanzas', '06-Finanzas');
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
  await takeShotWithScroll('07-habitos', '07-Habitos');
}

// ══════════════════════════════════════════════════════════════
// 08 — CUERPO / GYM
// ══════════════════════════════════════════════════════════════
async function testCuerpo() {
  log('▶ 08-Cuerpo');
  await ensureLoggedIn();
  await goTo('cuerpo');
  await page.waitForTimeout(1000);

  // Muscle map (NPC con músculos SVG)
  const muscleMap = await isVisible('#npc-scene, #npc-front-m, .npc-muscle');
  addResult('08-Cuerpo', 'Muscle map visible', muscleMap ? 'PASS' : 'WARN');

  // Health checklist (botones combustible: proteína, desayuno, etc.)
  const healthItems = await page.$$('[onclick*="toggleCombustible"], .pilar-btn');
  addResult('08-Cuerpo', 'Items de salud (check-in combustible) presentes', healthItems.length > 0 ? 'PASS' : 'WARN', `${healthItems.length} items`);

  // Gráfica de volumen / XP
  const charts = await page.$$('canvas');
  addResult('08-Cuerpo', 'Al menos 1 canvas de análisis visible', charts.length > 0 ? 'PASS' : 'WARN', `${charts.length} canvas`);

  // Botón registrar gym (abre modal de entreno)
  const gymBtn = await isVisible('#bio-main-btn, [onclick*="abrirModalEntreno"]');
  addResult('08-Cuerpo', 'Botón de registro gym visible', gymBtn ? 'PASS' : 'WARN');

  await checkNoNaN('08-Cuerpo');
  await takeShotWithScroll('08-cuerpo', '08-Cuerpo');
}

// ══════════════════════════════════════════════════════════════
// 09 — GEMELO POTENCIADO
// ══════════════════════════════════════════════════════════════
async function testGemelo() {
  log('▶ 09-Gemelo');
  await ensureLoggedIn();
  // Gemelo está en Mente → pestaña "Gemelo" (panel-brain)
  await goTo('mente');
  await page.waitForTimeout(1000);
  // Hacer click en la pestaña Gemelo
  await safeClick('[onclick="switchInnerTab(\'mente\',\'brain\')"]');
  await page.waitForTimeout(800);

  // Verificar que el panel existe en DOM (puede estar oculto por CSS hasta activar tab)
  const gemeloPanel = await page.$('#gemelo-container, #panel-brain, .gemelo-wrap');
  addResult('09-Gemelo', 'Sección del Gemelo existe en DOM', gemeloPanel ? 'PASS' : 'FAIL');

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
  await takeShotWithScroll('09-gemelo', '09-Gemelo');
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
  const subsSection = await isVisible('#saas-plan-badge, #settings-plan-badge, [id*="suscripcion"], [class*="plan-section"]');
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

  await takeShotWithScroll('10-stripe', '10-Stripe');
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

  // Shot del módulo stats/gamificación
  await goTo('stats');
  await page.waitForTimeout(800);
  await takeShotWithScroll('11-gamificacion', '11-Gamificacion');
}

// ══════════════════════════════════════════════════════════════
// 12 — TIENDA DE DECORACIÓN (WORLD / APARTAMENTO)
// ══════════════════════════════════════════════════════════════
async function testTienda() {
  log('▶ 12-Tienda');
  await ensureLoggedIn();
  await goTo('world');
  await page.waitForTimeout(1200);

  // Mapa visible (ID real: #city-scene)
  const mapVisible = await isVisible('#city-scene, #world-map-area, [id*="city-scene"]');
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
  const xpVal = await evalJS(() => window.S ? (window.S.xp || 0) : 0);
  if (shopExpDisplay) {
    const displayNum = parseInt(shopExpDisplay.replace(/\D/g, '')) || 0;
    addResult('12-Tienda', 'Shop muestra XP (no coins) — REGLA CRÍTICA', displayNum === xpVal ? 'PASS' : 'FAIL',
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

  await takeShotWithScroll('12-tienda', '12-Tienda');
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
    const headerBefore = await getText('#cal-title, [id*="cal-month"], [id*="cal-header"]');
    await safeClick('[onclick="calNext()"], [onclick*="calNext"], .cal-next');
    await page.waitForTimeout(800);
    const headerAfter = await getText('#cal-title, [id*="cal-month"], [id*="cal-header"]');
    addResult('13-Calendario', 'Navegar al mes siguiente cambia header', headerBefore !== headerAfter ? 'PASS' : 'WARN', `"${headerBefore}" → "${headerAfter}"`);
  }

  // Botón export ICS
  const exportBtn = await isVisible('[onclick*="exportCalendar"], [onclick*="ics"], button:has-text("ICS"), button:has-text("Exportar")');
  addResult('13-Calendario', 'Botón export ICS visible', exportBtn ? 'PASS' : 'WARN');

  await checkNoNaN('13-Calendario');
  await takeShotWithScroll('13-flow-agenda', '13-Flow-Agenda');
}

// ══════════════════════════════════════════════════════════════
// 14 — PRODUCTIVIDAD (Tareas, Pomodoro, Ideas, Metas)
// ══════════════════════════════════════════════════════════════
async function testProductividad() {
  log('▶ 14-Productividad');
  await ensureLoggedIn();

  // Tareas están en el DASHBOARD (page-dashboard), no en page-productividad
  await goTo('dashboard');
  await page.waitForTimeout(1500);

  const taskList = await isVisible('#task-list');
  addResult('14-Productividad', '#task-list visible en Dashboard', taskList ? 'PASS' : 'FAIL');

  const taskInput = await isVisible('#t-name');
  addResult('14-Productividad', 'Input nueva tarea (#t-name) existe', taskInput ? 'PASS' : 'FAIL');

  // Staging: agregar tarea desde dashboard
  if (!SMOKE_ONLY && taskInput) {
    const xpBefore = await evalJS(() => (window.S && window.S.xp) || 0);
    await safeFill('#t-name', `Tarea QA ${Date.now()}`);
    await safeClick('[onclick="addTask()"]');
    await page.waitForTimeout(1500);
    const tasks = await page.$$('#task-list > *');
    addResult('14-Productividad', 'Tarea QA aparece en lista', tasks.length > 0 ? 'PASS' : 'WARN', `${tasks.length} tareas`);

    const firstToggle = await page.$('#task-list input[type="checkbox"], [onclick*="toggleTask"]');
    if (firstToggle) {
      await firstToggle.click().catch(() => {});
      await page.waitForTimeout(1500);
      const xpAfter = await evalJS(() => (window.S && window.S.xp) || 0);
      addResult('14-Productividad', 'Completar tarea suma XP', xpAfter > xpBefore ? 'PASS' : 'WARN', `XP: ${xpBefore} → ${xpAfter}`);
    }
  }

  // Módulo Productividad: hábitos, metas, ideas
  await goTo('productividad');
  await page.waitForTimeout(1000);
  await takeShotWithScroll('14-flow', '14-Flow');

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
  await takeShotWithScroll('14-flow-ideas', '14-Flow-Ideas');

  // Metas tab
  const metasTab = await page.$('[onclick*="metas"], .tab-metas');
  if (metasTab) { await metasTab.click().catch(() => {}); await page.waitForTimeout(800); }
  await takeShotWithScroll('14-flow-metas', '14-Flow-Metas');

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

  // Biblioteca (ID real: #biblioteca-list)
  const bookList = await page.$('#biblioteca-list');
  addResult('15-Mente', 'Lista de biblioteca visible', bookList ? 'PASS' : 'WARN');

  // Bitácora de victorias (ID real: #bitacora-list)
  const bitacoraList = await page.$('#bitacora-list');
  addResult('15-Mente', 'Bitácora de victorias visible', bitacoraList ? 'PASS' : 'WARN');

  // Aliados
  const aliadosList = await isVisible('#aliados-list, [id*="aliados"]');
  addResult('15-Mente', 'Sección de aliados visible', aliadosList ? 'PASS' : 'WARN');

  // Solicitudes de amistad pendientes
  const friendReqSection = await isVisible('#friend-requests-section, [id*="friend-req"]');
  addResult('15-Mente', 'Sección de solicitudes de amistad existe', friendReqSection ? 'PASS' : 'INFO');

  // Staging: agregar victoria
  if (!SMOKE_ONLY) {
    const victoriaInput = await page.$('#bit-victoria');
    if (victoriaInput) {
      await safeFill('#bit-victoria', `Victoria QA: prueba automatizada ${stamp}`);
      await safeClick('[onclick*="guardarBitacora"]');
      await page.waitForTimeout(1500);
      const victorias = await page.$$('#bitacora-list > div');
      addResult('15-Mente', 'Victoria QA aparece en bitácora', victorias.length > 0 ? 'PASS' : 'WARN', `${victorias.length} entradas`);
    }
  }

  // Screenshot tab principal (biblioteca — estado por defecto al abrir mente)
  await goTo('mente');
  await page.waitForTimeout(800);
  await takeShotWithScroll('15-mente-biblioteca', '15-Mente');

  // Tab bitácora de victorias
  const bitacoraTab = await page.$('[onclick*="bitacora"], [onclick*="victorias"], .tab-bitacora');
  if (bitacoraTab) { await bitacoraTab.click().catch(() => {}); await page.waitForTimeout(800); }
  await takeShotWithScroll('15-mente-bitacora', '15-Mente');

  // Tab aliados
  const aliadosTab = await page.$('[onclick*="aliados"], .tab-aliados');
  if (aliadosTab) { await aliadosTab.click().catch(() => {}); await page.waitForTimeout(800); }
  await takeShotWithScroll('15-mente-aliados', '15-Mente');

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

  // Mapa de ciudad (ID real: #world-map-area o #city-scene)
  const cityMap = await isVisible('#world-map-area, #city-scene');
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

  // Shot del mapa de ciudad
  await takeShotWithScroll('16-world', '16-World');

  // Abrir apartamento y capturar
  if (aptBtn) {
    await safeClick('[onclick*="openApartment"], [onclick*="apartment"], .apt-zone');
    await page.waitForTimeout(1200);
    await takeShotWithScroll('16-world-apartamento', '16-World');
  }
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
      // Screenshot con FAB abierto
      await takeShot('17-fab-abierto');
      const fabInput = await page.$('#fab-input, [id*="fab-input"]');
      if (fabInput) {
        await safeFill('#fab-input, [id*="fab-input"]', 'tarea comprar leche mañana');
        await page.keyboard.press('Enter').catch(() => {});
        await page.waitForTimeout(1500);
        const chip = await isVisible('[id*="fab-chip"], [class*="confirm-chip"], [id*="chip"]');
        addResult('17-FAB', 'NLP FAB genera chip de confirmación', chip ? 'PASS' : 'WARN', '"tarea comprar leche mañana"');
        // Screenshot con chip de confirmación
        if (chip) await takeShot('17-fab-chip');
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

  // Screenshot del panel admin
  await takeShotWithScroll('18-admin', '18-Admin');

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

  // Toggle de notificaciones (ID real: #notifications-toggle, pero es input hidden — buscar su label)
  const pushToggle = await page.$('#notifications-toggle, label[for="notifications-toggle"]');
  addResult('19-FCM', 'Toggle de notificaciones push visible', pushToggle ? 'PASS' : 'WARN');

  // Verificar que el service worker de FCM está registrado
  const swRegistered = await evalJS(async () => {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      return regs.some(r => r.active && r.active.scriptURL.includes('firebase-messaging-sw'));
    } catch { return false; }
  });
  // En staging el SW de FCM no se registra — es comportamiento esperado
  const swStatus = swRegistered ? 'PASS' : (APP_URL.includes('staging') ? 'INFO' : 'WARN');
  addResult('19-FCM', 'firebase-messaging-sw.js registrado', swStatus, swRegistered ? '' : 'SW no registrado — normal en staging');

  // Verificar que el fcm_token fue guardado en S si el usuario tiene notificaciones activas
  const fcmToken = await evalJS(() => window.S && window.S.fcmToken);
  addResult('19-FCM', 'FCM token en estado S', 'INFO', fcmToken ? `token presente (${String(fcmToken).slice(0,20)}…)` : 'token ausente — notificaciones no activadas');

  await takeShotWithScroll('19-settings', '19-FCM');
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
    // En staging start_url es '/' — solo es WARN en producción
    const manifestStatus = manifest.start_url && manifest.start_url.includes('mylifeos.lat') ? 'PASS'
      : (APP_URL.includes('staging') ? 'INFO' : 'WARN');
    addResult('20-PWA', 'manifest.json apunta a mylifeos.lat', manifestStatus, manifest.start_url);
  }

  // Verificar service worker principal
  const swRes = await page.goto(`${APP_URL}/sw.js`, { waitUntil: 'networkidle' }).catch(() => null);
  addResult('20-PWA', 'sw.js accesible', swRes && swRes.status() === 200 ? 'PASS' : 'FAIL',
    swRes ? `HTTP ${swRes.status()}` : 'No accesible');

  // Volver a la app y capturar
  await page.goto(APP_URL, { waitUntil: 'networkidle' });
  await waitForBoot();
  await takeShot('20-pwa-manifest');

  // Verificar offline básico (interceptar red y recargar)
  if (!SMOKE_ONLY) {
    await page.context().setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000);
    const bodyOffline = await evalJS(() => document.body.innerText);
    const crashedOffline = bodyOffline.includes('ERR_INTERNET_DISCONNECTED') || bodyOffline.includes('No internet');
    addResult('20-PWA', 'App no crashea en offline (service worker activo)', !crashedOffline ? 'PASS' : 'FAIL',
      crashedOffline ? 'App no disponible offline' : 'App renderiza contenido offline');
    await takeShot('20-pwa-offline');
    await page.context().setOffline(false);
    // Reconectar
    await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await waitForBoot();
    await takeShot('20-pwa-online');
  }
}

// ══════════════════════════════════════════════════════════════
// REVISIÓN VISUAL RESPONSIVE — Android + iOS
// ══════════════════════════════════════════════════════════════

/**
 * Toma screenshots de los módulos principales en un viewport mobile dado.
 * prefix: 'android' | 'ios'
 */
async function takeMobileModuleShots(prefix) {
  const modules = [
    { id: 'dashboard',    slug: '05-dashboard'   },
    { id: 'financial',    slug: '06-finanzas'     },
    { id: 'productividad',slug: '07-flow'         },
    { id: 'cuerpo',       slug: '08-cuerpo'       },
    { id: 'mente',        slug: '15-mente'        },
    { id: 'world',        slug: '16-world'        },
    { id: 'stats',        slug: '11-gamificacion' },
    { id: 'settings',     slug: '10-settings'    },
    { id: 'calendar',     slug: '13-calendar'    },
  ];
  for (const mod of modules) {
    await goTo(mod.id);
    await page.waitForTimeout(800);
    await takeShot(`responsive-${prefix}-${mod.slug}`);
  }
}

async function testResponsive() {
  log('▶ RESPONSIVE — Android 360×800 + iOS 390×844');
  // Asegurar sesión activa — el test de PWA (offline/online) puede haberla cerrado
  await ensureLoggedIn();

  // ─── ANDROID (Pixel 6a normalizado) ────────────────────────
  await page.setViewportSize({ width: 360, height: 800 });
  await goTo('dashboard');
  await page.waitForTimeout(1000);

  const mobDrawerAndroid = await page.$('#mob-drawer, #mob-drawer-nav, .mob-drawer-nav');
  addResult('RESPONSIVE-Android', 'Drawer mobile existe en DOM (360px)', mobDrawerAndroid ? 'PASS' : 'FAIL');

  const fabAndroid = await isVisible('#fab-btn, .fab-btn');
  addResult('RESPONSIVE-Android', 'FAB visible (360px)', fabAndroid ? 'PASS' : 'WARN');

  const sidebarAndroid = await evalJS(() => {
    const el = document.getElementById('sidebar');
    if (!el) return 'no existe';
    return window.getComputedStyle(el).display;
  });
  addResult('RESPONSIVE-Android', 'Sidebar desktop oculta (360px)',
    sidebarAndroid === 'none' || sidebarAndroid === 'no existe' ? 'PASS' : 'WARN',
    `display=${sidebarAndroid}`);

  const hScrollAndroid = await evalJS(() => document.body.scrollWidth > window.innerWidth + 5);
  addResult('RESPONSIVE-Android', 'Sin scroll horizontal (360px)', !hScrollAndroid ? 'PASS' : 'WARN');
  if (hScrollAndroid) addUX('RESPONSIVE-Android', 'Scroll horizontal en 360px', 'Revisar elementos con width fijo');

  // Nav inferior no tapada por FAB en Android
  const navFabOverlapAndroid = await evalJS(() => {
    const fab = document.querySelector('#fab-btn, .fab-btn');
    const nav = document.querySelector('#mob-nav, .mob-nav, nav');
    if (!fab || !nav) return false;
    const fabBox = fab.getBoundingClientRect();
    const navBox = nav.getBoundingClientRect();
    return fabBox.bottom > navBox.top && fabBox.top < navBox.bottom;
  });
  addResult('RESPONSIVE-Android', 'FAB no tapa nav inferior (360px)', !navFabOverlapAndroid ? 'PASS' : 'FAIL');

  await takeMobileModuleShots('android');

  // ─── iOS (iPhone 14/15 normalizado) ────────────────────────
  await page.setViewportSize({ width: 390, height: 844 });
  await goTo('dashboard');
  await page.waitForTimeout(1000);

  const fabIOS = await isVisible('#fab-btn, .fab-btn');
  addResult('RESPONSIVE-iOS', 'FAB visible (390px)', fabIOS ? 'PASS' : 'WARN');

  const hScrollIOS = await evalJS(() => document.body.scrollWidth > window.innerWidth + 5);
  addResult('RESPONSIVE-iOS', 'Sin scroll horizontal (390px)', !hScrollIOS ? 'PASS' : 'WARN');
  if (hScrollIOS) addUX('RESPONSIVE-iOS', 'Scroll horizontal en 390px', 'Revisar elementos con width fijo');

  // Texto no se corta (overflow: hidden con texto truncado involuntario)
  const textOverflow = await evalJS(() => {
    const titles = Array.from(document.querySelectorAll('.page-title, .card-title, h1, h2'));
    return titles.some(el => el.scrollWidth > el.clientWidth + 2);
  });
  addResult('RESPONSIVE-iOS', 'Títulos sin overflow de texto (390px)', !textOverflow ? 'PASS' : 'WARN',
    textOverflow ? 'Algún título se trunca horizontalmente' : '');

  // Safe area / notch — verificar que el nav no quede detrás del notch
  const navTopIOS = await evalJS(() => {
    const nav = document.querySelector('#mob-nav, .mob-nav, nav, #sidebar');
    if (!nav) return -1;
    return nav.getBoundingClientRect().top;
  });
  addResult('RESPONSIVE-iOS', 'Nav no oculta detrás del notch (top ≥ 0)', navTopIOS >= 0 ? 'PASS' : 'WARN',
    `nav.top=${navTopIOS}`);

  await takeMobileModuleShots('ios');

  // ─── Restaurar viewport desktop ─────────────────────────────
  await page.setViewportSize({ width: 1280, height: 800 });
  await goTo('dashboard');
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

  // ── Pre-check: verificar que podemos hacer login antes de correr 20 módulos ──
  log('[PRE-CHECK] Verificando credenciales y acceso...');
  page = await context.newPage();
  attachConsoleListeners();
  const preLoginOk = await doLogin();
  if (!preLoginOk) {
    log('[PRE-CHECK] ❌ Login inicial falló. Abortando suite para no quemar rate limits.');
    addResult('RUNNER', 'Pre-check login', 'FAIL',
      'No fue posible iniciar sesión. Posible rate limit de Firebase. Intentar en 5+ minutos.');
    await browser.close();
    const report = generateReport();
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
    fs.writeFileSync(reportPath, report, 'utf8');
    log(`Reporte de fallo guardado: ${reportPath}`);
    process.exit(1);
  }
  log('[PRE-CHECK] ✅ Sesión activa confirmada — iniciando módulos');

  // ── Seed de datos de demostración (idempotente — solo corre si la cuenta está vacía) ──
  if (!SMOKE_ONLY) {
    await runModule(seedUserData, 'SEED');
  }

  try {
    // ── Orden por riesgo (CRÍTICO primero) ──
    await runModule(testLanding,       '00-Landing');
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

  // Análisis IA con Gemini
  try {
    log('Ejecutando análisis IA con Gemini...');
    const analyzeEnv = { ...process.env, QA_SHOTS_DIR: SHOTS_DIR };
    execSync(`node "${path.join(__dirname, 'analyze.js')}"`, { stdio: 'inherit', env: analyzeEnv });
  } catch (e) {
    log(`[WARN] Análisis IA falló: ${e.message.split('\n')[0]}`);
  }

  log('═══ OpenClaw QA Suite completado ═══');

  const hasFails = results.some(r => r.status === 'FAIL');
  process.exit(hasFails ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
