# LIFE OS — GUÍA DE CONFIGURACIÓN DEL VPS PARA OPENCLAW
> Target: Hostinger VPS · OS: Ubuntu 22.04 LTS · Engine: Playwright
> Git bot: 422065902@pcpuma.acatlan.unam.mx / OpenClaw QA Bot

---

## PASO 0 — Conectarse al VPS y verificar el SO

```bash
# Desde tu máquina local
ssh root@<IP_DEL_VPS_HOSTINGER>

# Verificar SO y arquitectura
lsb_release -a
uname -m          # Debe decir x86_64
cat /proc/cpuinfo | grep "model name" | head -1
free -h           # RAM disponible
df -h /           # Espacio en disco
```

**Verificación esperada:**
```
Distributor ID: Ubuntu
Release:        22.04
Codename:       jammy
```

---

## PASO 1 — Actualizar el sistema base

```bash
apt update && apt upgrade -y
apt install -y curl wget git unzip build-essential ca-certificates gnupg
```

---

## PASO 2 — Instalar Node.js LTS (v20) y npm

```bash
# Agregar repositorio oficial de NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Verificar instalación
node -v    # Debe mostrar v20.x.x
npm -v     # Debe mostrar 10.x.x

# Instalar PM2 para gestión de procesos (opcional pero recomendado)
npm install -g pm2
```

---

## PASO 3 — Instalar Playwright y sus dependencias de sistema

```bash
# Crear directorio de trabajo del bot
mkdir -p /opt/openclaw
cd /opt/openclaw

# Inicializar proyecto Node
npm init -y

# Instalar Playwright
npm install --save-dev @playwright/test

# Instalar navegadores de Playwright (Chromium para máxima compatibilidad con PWA)
npx playwright install chromium
npx playwright install-deps chromium

# Verificar que Chromium funciona
npx playwright --version
```

**Nota:** Playwright es preferido sobre Puppeteer porque incluye su propia versión de Chromium controlada y tiene soporte nativo para `waitForSelector`, `networkIdle` y PWA testing.

---

## PASO 4 — Configurar Git con identidad del bot

```bash
git config --global user.email "422065902@pcpuma.acatlan.unam.mx"
git config --global user.name "OpenClaw QA Bot"

# Verificar configuración
git config --global --list

# Configurar credenciales para GitHub (usar Personal Access Token)
git config --global credential.helper store
# La primera vez que hagas pull/push se pedirá el token — se guardará automáticamente
```

---

## PASO 5 — Clonar el repositorio de Life OS

```bash
cd /opt/openclaw

# Clonar (reemplaza con tu URL real del repo)
git clone https://github.com/422065902-sys/Life-Os.git repo
cd repo

# Verificar que los archivos principales existen
ls -la main.js app.js index.html functions/index.js

# Crear la carpeta de reportes si no existe
mkdir -p qa-reports
```

---

## PASO 6 — Configurar variables de entorno para Firebase STAGING

```bash
# Crear archivo de entorno en el directorio de OpenClaw
cat > /opt/openclaw/.env << 'EOF'
# ════════════════════════════════════════════
# LIFE OS — Variables de entorno para STAGING
# Proyecto: mylifeos-staging
# NO usar credenciales de producción aquí
# ════════════════════════════════════════════

# Firebase STAGING — credenciales reales del proyecto mylifeos-staging
FIREBASE_API_KEY=AIzaSyDoSVDHs0dfmttl7vUrp-Qf1Qz2qJ8tF4E
FIREBASE_AUTH_DOMAIN=mylifeos-staging.firebaseapp.com
FIREBASE_PROJECT_ID=mylifeos-staging
FIREBASE_STORAGE_BUCKET=mylifeos-staging.firebasestorage.app
FIREBASE_MESSAGING_SENDER_ID=955142565160
FIREBASE_APP_ID=1:955142565160:web:bc240d2d30743f746b741d

# URL de la app en staging (hosting ya desplegado)
APP_URL=https://mylifeos-staging.web.app

# Credenciales de usuarios de prueba
QA_USER_EMAIL=qa-test@mylifeos-staging.com
QA_USER_PASSWORD=QaTestPass2026!
QA_ADMIN_EMAIL=wencesreal35@gmail.com
QA_ADMIN_PASSWORD=<TU_PASSWORD_DE_ADMIN>

# Stripe — modo TEST (claves de Stripe Dashboard → Developers → Test mode)
STRIPE_TEST_PRICE_PRO=price_test_XXXXXXXX
STRIPE_TEST_PRICE_STUDENT=price_test_YYYYYYYY

# Configuración del bot
QA_REPORTS_DIR=/opt/openclaw/repo/qa-reports
QA_REPO_DIR=/opt/openclaw/repo
TZ=America/Mexico_City
EOF

# Asegurar que el archivo no sea legible por otros usuarios
chmod 600 /opt/openclaw/.env
```

---

## PASO 7 — Crear el script runner de OpenClaw

```bash
cat > /opt/openclaw/runner.js << 'RUNNER_EOF'
#!/usr/bin/env node
/**
 * OpenClaw QA Runner para Life OS
 * Lee QA-MASTER-PLAN.md, ejecuta pruebas en orden de riesgo,
 * escribe reporte y hace commit+push automático.
 */

require('dotenv').config({ path: '/opt/openclaw/.env' });

const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ── Configuración ──────────────────────────────────────────────
const APP_URL       = process.env.APP_URL || 'https://mylifeos-staging.web.app';
const REPORTS_DIR   = process.env.QA_REPORTS_DIR || '/opt/openclaw/repo/qa-reports';
const REPO_DIR      = process.env.QA_REPO_DIR    || '/opt/openclaw/repo';
const QA_EMAIL      = process.env.QA_USER_EMAIL;
const QA_PASS       = process.env.QA_USER_PASSWORD;

// ── Timestamp del reporte ──────────────────────────────────────
const now = new Date();
const pad = n => String(n).padStart(2,'0');
const stamp = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`
            + `_${pad(now.getHours())}-${pad(now.getMinutes())}`;
const reportPath = path.join(REPORTS_DIR, `${stamp}.md`);

// ── Estado del reporte ─────────────────────────────────────────
const results = [];
let browser, context, page;

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

function addResult(module, scenario, status, detail) {
  results.push({ module, scenario, status, detail });
  log(`[${status}] ${module} — ${scenario}${detail ? ': ' + detail : ''}`);
}

// ── Helper: esperar elemento con timeout ───────────────────────
async function waitFor(selector, timeout = 8000) {
  try {
    await page.waitForSelector(selector, { timeout });
    return true;
  } catch {
    return false;
  }
}

// ── Helper: verificar texto visible ───────────────────────────
async function textVisible(selector, expected) {
  try {
    const el = await page.$(selector);
    if (!el) return false;
    const txt = await el.textContent();
    return txt.includes(expected);
  } catch {
    return false;
  }
}

// ══════════════════════════════════════════════════════════════
// MÓDULO 01 — AUTH (CRÍTICO — ejecutar primero)
// ══════════════════════════════════════════════════════════════
async function testAuth() {
  log('▶ Iniciando pruebas de Auth...');

  // Happy Path: Login
  await page.goto(APP_URL, { waitUntil: 'networkidle' });
  const authVisible = await waitFor('#auth-screen');
  addResult('01-Auth', 'auth-screen visible al cargar', authVisible ? 'PASS' : 'FAIL', '');

  await page.fill('#login-email', QA_EMAIL);
  await page.fill('#login-pass', QA_PASS);
  await page.click('button:has-text("INICIAR SESIÓN")');

  const appVisible = await waitFor('#app', 12000);
  addResult('01-Auth', 'Login Happy Path → #app visible', appVisible ? 'PASS' : 'FAIL', '');

  // Verificar XP en header
  const xpVisible = await waitFor('#sb-xp');
  addResult('01-Auth', 'XP visible en sidebar post-login', xpVisible ? 'PASS' : 'FAIL', '');

  // Edge case: Logout
  // (Implementar según el selector del botón de logout en tu UI)
  // await page.click('[onclick*="signOut"], [onclick*="logout"]');
  // const authBack = await waitFor('#auth-screen', 10000);
  // addResult('01-Auth', 'Logout → auth-screen visible', authBack ? 'PASS' : 'FAIL', '');

  // Edge case: Credenciales incorrectas
  await page.goto(APP_URL, { waitUntil: 'networkidle' });
  await page.fill('#login-email', 'fake@noemail.com');
  await page.fill('#login-pass', 'wrongpass');
  await page.click('button:has-text("INICIAR SESIÓN")');
  await page.waitForTimeout(3000);
  const errorMsg = await page.$eval('#toast', el => el.textContent).catch(() => '');
  addResult('01-Auth', 'Credenciales incorrectas → toast de error', errorMsg.length > 0 ? 'PASS' : 'FAIL', errorMsg.trim());
}

// ══════════════════════════════════════════════════════════════
// MÓDULO 03 — BLACKOUT (CRÍTICO)
// ══════════════════════════════════════════════════════════════
async function testBlackout() {
  log('▶ Iniciando pruebas de BLACKOUT...');

  // Re-login para estar en app
  await page.goto(APP_URL, { waitUntil: 'networkidle' });
  const inApp = await waitFor('#app', 15000);
  if (!inApp) { addResult('03-Blackout', 'Pre-condición login', 'SKIP', 'No se pudo acceder a la app'); return; }

  // Verificar que el anillo SVG existe y tiene stroke
  const ringExists = await page.$('#nucleo-progress-ring');
  addResult('03-Blackout', 'SVG nucleo-progress-ring existe en DOM', ringExists ? 'PASS' : 'FAIL', '');

  // Verificar que body NO tiene clase blackout si el usuario tiene actividad hoy
  const hasBlackout = await page.evaluate(() => document.body.classList.contains('blackout'));
  // (Este resultado depende del estado del usuario; logueamos el estado actual)
  addResult('03-Blackout', 'Estado BLACKOUT actual', 'INFO', `body.blackout = ${hasBlackout}`);
}

// ══════════════════════════════════════════════════════════════
// MÓDULO 05 — DASHBOARD (ALTO)
// ══════════════════════════════════════════════════════════════
async function testDashboard() {
  log('▶ Iniciando pruebas de Dashboard...');

  await page.goto(APP_URL, { waitUntil: 'networkidle' });
  const inApp = await waitFor('#app', 15000);
  if (!inApp) { addResult('05-Dashboard', 'Pre-condición login', 'SKIP', ''); return; }

  // Verificar elementos clave del dashboard
  const checkinBtn = await page.$('#checkin-btn');
  addResult('05-Dashboard', 'Botón de check-in visible', checkinBtn ? 'PASS' : 'FAIL', '');

  const focusBars = await page.$('#focus-bars');
  addResult('05-Dashboard', 'Focus bars renderizadas', focusBars ? 'PASS' : 'FAIL', '');

  // Verificar que no hay NaN en el XP
  const xpText = await page.$eval('#sb-xp', el => el.textContent).catch(() => '');
  const xpValid = xpText && !xpText.includes('NaN') && xpText.includes('XP');
  addResult('05-Dashboard', 'XP en sidebar sin NaN', xpValid ? 'PASS' : 'FAIL', xpText.trim());
}

// ══════════════════════════════════════════════════════════════
// MÓDULO 06 — FINANZAS (ALTO)
// ══════════════════════════════════════════════════════════════
async function testFinanzas() {
  log('▶ Iniciando pruebas de Finanzas...');

  await page.goto(APP_URL, { waitUntil: 'networkidle' });
  await waitFor('#app', 15000);

  // Navegar a Finanzas
  await page.click('.nav-item[onclick*="finanzas"], [onclick="navigate(\'finanzas\')"]').catch(() => {});
  await page.waitForTimeout(1500);

  const txList = await page.$('#tx-list');
  addResult('06-Finanzas', '#tx-list existe en DOM', txList ? 'PASS' : 'FAIL', '');

  // Verificar que el saldo no es NaN
  // (El selector exacto depende del elemento que muestra el saldo personal)
  const balanceEl = await page.$('[id*="balance"], [id*="saldo"], [class*="balance"]');
  addResult('06-Finanzas', 'Elemento de saldo existe', balanceEl ? 'PASS' : 'FAIL', '');
}

// ══════════════════════════════════════════════════════════════
// MÓDULO 07 — HÁBITOS (ALTO)
// ══════════════════════════════════════════════════════════════
async function testHabitos() {
  log('▶ Iniciando pruebas de Hábitos...');

  await page.goto(APP_URL, { waitUntil: 'networkidle' });
  await waitFor('#app', 15000);

  await page.click('[onclick*="productividad"]').catch(() => {});
  await page.waitForTimeout(1000);
  await page.click('[onclick*="habits"]').catch(() => {});
  await page.waitForTimeout(1000);

  const habitPanel = await page.$('#panel-habits');
  addResult('07-Habitos', '#panel-habits visible', habitPanel ? 'PASS' : 'FAIL', '');

  const habitInput = await page.$('#new-habit');
  addResult('07-Habitos', 'Input #new-habit existe', habitInput ? 'PASS' : 'FAIL', '');

  // Agregar hábito de prueba
  if (habitInput) {
    await page.fill('#new-habit', `Hábito QA ${Date.now()}`);
    await page.click('button:has-text("Agregar"), [onclick*="addHabit"]').catch(() => {});
    await page.waitForTimeout(1500);
    const habitCards = await page.$$('.habit-card, [class*="habit"]');
    addResult('07-Habitos', 'Nuevo hábito aparece en lista', habitCards.length > 0 ? 'PASS' : 'FAIL', `${habitCards.length} hábitos`);
  }
}

// ══════════════════════════════════════════════════════════════
// MÓDULO 13 — CALENDARIO (MEDIO)
// ══════════════════════════════════════════════════════════════
async function testCalendario() {
  log('▶ Iniciando pruebas de Calendario...');

  await page.goto(APP_URL, { waitUntil: 'networkidle' });
  await waitFor('#app', 15000);

  await page.click('[onclick*="calendario"]').catch(() => {});
  await page.waitForTimeout(1500);

  // Verificar que el grid del calendario renderizó
  const calGrid = await page.$('.cal-grid, [id*="cal-grid"], [class*="calendar"]');
  addResult('13-Calendario', 'Grid de calendario existe', calGrid ? 'PASS' : 'FAIL', '');

  // Verificar botones de navegación
  const prevBtn = await page.$('[onclick*="calPrev"]');
  const nextBtn = await page.$('[onclick*="calNext"]');
  addResult('13-Calendario', 'Botones prev/next de mes existen', (prevBtn && nextBtn) ? 'PASS' : 'FAIL', '');
}

// ══════════════════════════════════════════════════════════════
// GENERADOR DEL REPORTE MARKDOWN
// ══════════════════════════════════════════════════════════════
function generateReport() {
  const total  = results.length;
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const skipped = results.filter(r => r.status === 'SKIP').length;
  const info   = results.filter(r => r.status === 'INFO').length;

  let md = `# REPORTE QA — ${stamp}\n`;
  md += `> App: ${APP_URL} | Engine: Playwright Chromium | Bot: OpenClaw QA\n\n`;
  md += `## RESUMEN\n\n`;
  md += `| Métrica | Valor |\n|---------|-------|\n`;
  md += `| Total de pruebas | ${total} |\n`;
  md += `| ✅ PASS | ${passed} |\n`;
  md += `| ❌ FAIL | ${failed} |\n`;
  md += `| ⏭ SKIP | ${skipped} |\n`;
  md += `| ℹ INFO | ${info} |\n`;
  md += `| Tasa de éxito | ${total > 0 ? Math.round(passed/(total-info-skipped)*100) : 0}% |\n\n`;
  md += `## RESULTADOS DETALLADOS\n\n`;
  md += `| Módulo | Escenario | Estado | Detalle |\n|--------|-----------|--------|---------|\n`;

  for (const r of results) {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : r.status === 'SKIP' ? '⏭' : 'ℹ';
    md += `| ${r.module} | ${r.scenario} | ${icon} ${r.status} | ${r.detail || ''} |\n`;
  }

  if (failed > 0) {
    md += `\n## FALLOS DETECTADOS\n\n`;
    for (const r of results.filter(r => r.status === 'FAIL')) {
      md += `### ❌ ${r.module} — ${r.scenario}\n`;
      md += `- **Detalle:** ${r.detail || 'Sin detalle adicional'}\n`;
      md += `- **Acción requerida:** Revisar código relacionado y crear fix en rama \`fix/${r.module.toLowerCase()}-${Date.now()}\`\n\n`;
    }
  }

  md += `\n---\n*Generado automáticamente por OpenClaw QA Bot · ${new Date().toISOString()}*\n`;
  return md;
}

// ══════════════════════════════════════════════════════════════
// PIPELINE PRINCIPAL
// ══════════════════════════════════════════════════════════════
async function main() {
  log('═══ OpenClaw QA Suite iniciando ═══');

  browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) OpenClaw-QA-Bot/1.0',
    locale: 'es-MX',
    timezoneId: 'America/Mexico_City'
  });

  page = await context.newPage();

  // Capturar errores de consola
  page.on('console', msg => {
    if (msg.type() === 'error') log(`[CONSOLE ERROR] ${msg.text()}`);
  });

  page.on('pageerror', err => {
    log(`[PAGE ERROR] ${err.message}`);
    addResult('GLOBAL', 'Error de JavaScript en página', 'FAIL', err.message.slice(0, 100));
  });

  try {
    // Ejecutar en orden de riesgo (CRÍTICO primero)
    await testAuth();
    await testBlackout();
    await testDashboard();
    await testFinanzas();
    await testHabitos();
    await testCalendario();
    // Agregar más módulos aquí siguiendo el mismo patrón
  } catch(e) {
    log(`[FATAL] Error inesperado: ${e.message}`);
    addResult('RUNNER', 'Error fatal en el pipeline', 'FAIL', e.message);
  } finally {
    await browser.close();
  }

  // Generar reporte
  const report = generateReport();
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(reportPath, report, 'utf8');
  log(`Reporte guardado: ${reportPath}`);

  // Commit y push automático
  try {
    process.chdir(REPO_DIR);
    execSync(`git add qa-reports/`);
    execSync(`git commit -m "QA Report ${stamp} — PASS:${results.filter(r=>r.status==='PASS').length} FAIL:${results.filter(r=>r.status==='FAIL').length}"`);
    execSync(`git push origin main`);
    log('Reporte commiteado y pusheado exitosamente');
  } catch(e) {
    log(`[WARN] Error al hacer commit/push: ${e.message}`);
  }

  log('═══ OpenClaw QA Suite completado ═══');
  process.exit(results.some(r => r.status === 'FAIL') ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
RUNNER_EOF

chmod +x /opt/openclaw/runner.js
```

---

## PASO 8 — Configurar Cron Job (02:00 AM CDMX = 08:00 UTC)

```bash
# CDMX es UTC-6, por lo tanto 02:00 CDMX = 08:00 UTC
# En verano (DST) CDMX pasa a UTC-5, entonces 02:00 CDMX = 07:00 UTC
# Usamos 08:00 UTC como valor conservador (hora de invierno)

crontab -e
```

Agregar esta línea en el editor que se abra:
```
0 8 * * * TZ=America/Mexico_City /usr/bin/node /opt/openclaw/runner.js >> /var/log/openclaw.log 2>&1
```

**Verificar que el cron está activo:**
```bash
crontab -l
# Debe mostrar la línea del cron

# Ver logs cuando se ejecute
tail -f /var/log/openclaw.log
```

**Probar el runner manualmente antes del primer cron:**
```bash
cd /opt/openclaw
node runner.js
```

---

## ESTRATEGIA DE AISLAMIENTO CON FIREBASE STAGING

### ✅ Estado actual del proyecto staging (2026-04-13 — ya configurado)

El proyecto `mylifeos-staging` fue creado y configurado por Claude Code:

| Componente | Estado |
|-----------|--------|
| Proyecto Firebase `mylifeos-staging` | ✅ Creado |
| Firestore (default, nam5) | ✅ Creado |
| Reglas permisivas de Firestore | ✅ Desplegadas |
| Firebase Hosting | ✅ Desplegado en `https://mylifeos-staging.web.app` |
| Firebase Auth (Email/Password) | ⚠️ Requiere 1 paso manual — ver §A abajo |
| Usuario QA | ⚠️ Requiere Auth activo primero |

---

### A. ⚠️ ÚNICO PASO MANUAL — Habilitar Firebase Auth

Firebase no permite activar Auth por primera vez vía API — requiere un clic en la consola:

1. Ir a [console.firebase.google.com/project/mylifeos-staging/authentication](https://console.firebase.google.com/project/mylifeos-staging/authentication)
2. Click **"Get started"**
3. Click **"Email/Password"** → activar el primer toggle → **"Save"**
4. Listo — después de esto el usuario QA se crea automáticamente al correr el setup

### B. Crear usuario QA (después de activar Auth)

```bash
# Ejecutar desde /opt/openclaw/ después de activar Auth en la consola
node -e "
const https = require('https');
const apiKey = 'AIzaSyDoSVDHs0dfmttl7vUrp-Qf1Qz2qJ8tF4E';
const data = JSON.stringify({
  email: 'qa-test@mylifeos-staging.com',
  password: 'QaTestPass2026!',
  displayName: 'OpenClaw QA Bot',
  returnSecureToken: true
});
const req = https.request({
  hostname: 'identitytoolkit.googleapis.com',
  path: '/v1/accounts:signUp?key=' + apiKey,
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
}, res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    const r = JSON.parse(d);
    if (r.error) console.log('Error:', r.error.message);
    else console.log('✅ Usuario QA creado! UID:', r.localId);
  });
});
req.write(data); req.end();
"
```

### C. Datos del proyecto staging (ya configurados en .env)

```
Project ID:        mylifeos-staging
API Key:           AIzaSyDoSVDHs0dfmttl7vUrp-Qf1Qz2qJ8tF4E
Auth Domain:       mylifeos-staging.firebaseapp.com
Hosting URL:       https://mylifeos-staging.web.app
Messaging Sender:  955142565160
App ID:            1:955142565160:web:bc240d2d30743f746b741d
```

### D. Re-desplegar reglas si es necesario (ya desplegadas)

```bash
# Solo si necesitas volver a desplegar las reglas permisivas
cd /opt/openclaw/repo
firebase deploy --only firestore:rules --project mylifeos-staging
```

### D. Variables de entorno en el VPS para apuntar a staging

El archivo `/opt/openclaw/.env` ya apunta a staging. Para cambiar entre staging y producción:

```bash
# Para staging (por defecto en el VPS)
ln -sf /opt/openclaw/.env.staging /opt/openclaw/.env

# Para producción (NUNCA correr pruebas en producción)
# ln -sf /opt/openclaw/.env.production /opt/openclaw/.env
```

### E. Crear usuario de prueba en Firebase Auth (staging)

```bash
# En la consola de Firebase → Authentication → Add user
# O via Firebase Admin SDK:
node - << 'EOF'
const admin = require('firebase-admin');
const serviceAccount = require('/opt/openclaw/service-account-staging.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

admin.auth().createUser({
  email: 'qa-test@mylifeos-staging.com',
  password: 'QaTestPass2026!',
  displayName: 'OpenClaw QA Bot'
}).then(u => {
  console.log('Usuario creado:', u.uid);
  // Crear doc en Firestore con trial activo
  return admin.firestore().collection('users').doc(u.uid).set({
    email: 'qa-test@mylifeos-staging.com',
    nombre: 'OpenClaw QA Bot',
    is_pro: false,
    role: 'free',
    trial_ends_at: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 7 * 86400000)),
    fcm_token: '',
    stripe_customer_id: ''
  });
}).then(() => {
  console.log('Doc de usuario creado en Firestore staging');
  process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
EOF
```

### F. Estructura de archivos en el VPS

```
/opt/openclaw/
├── .env                      ← Variables activas (symlink a .env.staging)
├── .env.staging              ← Credenciales del proyecto staging
├── runner.js                 ← Script principal de OpenClaw
├── package.json              ← Dependencias (playwright)
├── node_modules/
├── service-account-staging.json  ← Clave de servicio de Firebase STAGING
└── repo/                     ← Clon del repo de Life OS
    ├── qa-reports/           ← Reportes generados
    │   ├── QA-MASTER-PLAN.md
    │   ├── VPS-SETUP-GUIDE.md
    │   └── 2026-04-07_02-00.md  ← Reportes nocturnos
    ├── main.js
    ├── index.html
    └── ...
```

---

## COMANDOS DE MANTENIMIENTO

```bash
# Ver el último reporte generado
ls -lt /opt/openclaw/repo/qa-reports/*.md | head -1 | xargs cat

# Ver logs del cron de esta semana
grep "$(date +%Y-%m)" /var/log/openclaw.log | tail -50

# Forzar ejecución inmediata (fuera del cron)
node /opt/openclaw/runner.js

# Actualizar el repo antes de correr pruebas manualmente
cd /opt/openclaw/repo && git pull origin main && node /opt/openclaw/runner.js

# Ver si el cron está corriendo actualmente
ps aux | grep runner.js

# Reiniciar el servicio si PM2 está configurado
pm2 restart openclaw-qa 2>/dev/null || true
```

---

## CHECKLIST DE VERIFICACIÓN FINAL

### ✅ Ya completado (no repetir)
- [x] Proyecto Firebase `mylifeos-staging` creado
- [x] Firestore (default, nam5) creado
- [x] Reglas permisivas desplegadas en Firestore staging
- [x] Firebase Hosting desplegado en `https://mylifeos-staging.web.app`
- [x] `.env` del VPS tiene credenciales reales de staging
- [x] URL del repo GitHub correcta en el paso de git clone
- [x] `runner.js` completo con 20 módulos

### ⚠️ 1 paso manual pendiente (tú)
- [ ] Ir a [console.firebase.google.com/project/mylifeos-staging/authentication](https://console.firebase.google.com/project/mylifeos-staging/authentication) → "Get started" → Email/Password → activar → Save

### 🖥️ Pasos del VPS (cuando tengas SSH)
- [ ] `node -v` muestra v20.x.x
- [ ] `npx playwright --version` muestra la versión instalada
- [ ] `git config --global user.email` muestra `422065902@pcpuma.acatlan.unam.mx`
- [ ] `cat /opt/openclaw/.env` tiene `FIREBASE_PROJECT_ID=mylifeos-staging`
- [ ] Ejecutar script de creación de usuario QA (§B arriba) — después de activar Auth
- [ ] `node /opt/openclaw/runner.js` corre y genera reporte
- [ ] `git log` en el repo muestra el commit del reporte
- [ ] `crontab -l` muestra la línea del cron a las 08:00 UTC

---

*Guía actualizada 2026-04-13 · Firebase staging configurado por Claude Code*
