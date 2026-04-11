/**
 * seedDemoUser.js — Semilla del usuario de demostración de Life OS
 *
 * Usa Firebase REST APIs (sin Admin SDK) — no requiere service account key.
 * El script se autentica como el propio usuario demo usando el web API key.
 *
 * Ejecutar:
 *   cd "Documents/Life Os"
 *   SEED_ENV=demo node scripts/seedDemoUser.js
 *   SEED_ENV=demo GEMINI_API_KEY=<key> node scripts/seedDemoUser.js
 *
 * Guard de seguridad: el script solo corre si SEED_ENV === 'demo'
 */

'use strict';

// ── Guard ────────────────────────────────────────────────────────────────────
if (process.env.SEED_ENV !== 'demo') {
  console.error('❌  SEED_ENV debe ser "demo".');
  process.exit(1);
}

const path  = require('path');
const https = require('https');
const http  = require('http');

// ── Config Firebase ───────────────────────────────────────────────────────────
const WEB_API_KEY  = 'AIzaSyATQklLWsLAzSqnWkVzcYgz-FVr_Q7eyyQ';
const PROJECT_ID   = 'life-os-prod-3a590';
const DEMO = {
  email:    'demo@mylifeos.lat',
  password: 'LifeOS2026Demo',
  name:     'Alejandro Torres',
};
let DEMO_UID   = null;
let DEMO_TOKEN = null;

// ── Helper HTTP (sin dependencias externas) ───────────────────────────────────
function httpRequest(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib    = parsed.protocol === 'https:' ? https : http;
    const reqOpts = {
      hostname: parsed.hostname,
      path:     parsed.pathname + parsed.search,
      method:   options.method || 'GET',
      headers:  options.headers || {},
    };
    if (body) {
      const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
      reqOpts.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }
    const req = lib.request(reqOpts, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end',  () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch(e) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

async function post(url, body, headers = {}) {
  return httpRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
  }, body);
}
async function patch(url, body, headers = {}) {
  return httpRequest(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...headers },
  }, body);
}
async function get(url, headers = {}) {
  return httpRequest(url, { method: 'GET', headers }, null);
}

// ── Firebase Auth REST ────────────────────────────────────────────────────────
async function createOrSignIn() {
  // Intentar sign in primero (idempotente)
  let res = await post(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${WEB_API_KEY}`,
    { email: DEMO.email, password: DEMO.password, returnSecureToken: true }
  );
  if (res.status === 200 && res.body.idToken) {
    DEMO_UID   = res.body.localId;
    DEMO_TOKEN = res.body.idToken;
    console.log(`✅  Sign-in exitoso — UID: ${DEMO_UID}`);
    return;
  }

  // No existe — crear cuenta
  res = await post(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${WEB_API_KEY}`,
    { email: DEMO.email, password: DEMO.password, returnSecureToken: true }
  );
  if (res.status !== 200) throw new Error(`signUp error: ${JSON.stringify(res.body)}`);
  DEMO_UID   = res.body.localId;
  DEMO_TOKEN = res.body.idToken;

  // Actualizar displayName
  await post(
    `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${WEB_API_KEY}`,
    { idToken: DEMO_TOKEN, displayName: DEMO.name, returnSecureToken: true }
  );
  console.log(`✅  Cuenta creada — UID: ${DEMO_UID}`);
}

// ── Firestore REST helpers ────────────────────────────────────────────────────
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

function authHeader() {
  return { 'Authorization': `Bearer ${DEMO_TOKEN}` };
}

/** Convierte un objeto JS plano al formato de documento Firestore REST */
function toFsDoc(obj) {
  function encode(val) {
    if (val === null || val === undefined) return { nullValue: null };
    if (typeof val === 'boolean')          return { booleanValue: val };
    if (typeof val === 'number') {
      return Number.isInteger(val)
        ? { integerValue: String(val) }
        : { doubleValue: val };
    }
    if (typeof val === 'string')   return { stringValue: val };
    if (val instanceof Date)       return { timestampValue: val.toISOString() };
    if (Array.isArray(val))        return { arrayValue: { values: val.map(encode) } };
    if (typeof val === 'object')   return { mapValue: { fields: encodeFields(val) } };
    return { stringValue: String(val) };
  }
  function encodeFields(o) {
    const f = {};
    for (const [k, v] of Object.entries(o)) {
      if (v !== undefined) f[k] = encode(v);
    }
    return f;
  }
  return { fields: encodeFields(obj) };
}

/** Escribe (create/overwrite) un documento Firestore */
async function fsSet(collPath, docId, data) {
  const url = `${FS_BASE}/${collPath}/${docId}`;
  const res = await patch(url + '?currentDocument.exists=false', toFsDoc(data), authHeader())
    .catch(() => null);
  if (res && res.status === 200) return res;
  // Si ya existe, sobreescribir sin precondición
  return patch(url, toFsDoc(data), authHeader());
}

/** Escribe un documento usando PATCH con updateMask (para actualizaciones parciales) */
async function fsUpdate(collPath, docId, data) {
  const fields   = Object.keys(data);
  const mask     = fields.map(f => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&');
  const url      = `${FS_BASE}/${collPath}/${docId}?${mask}`;
  return patch(url, toFsDoc(data), authHeader());
}

// ── Fecha base: 9 enero 2026 ──────────────────────────────────────────────────
const BASE_DATE = new Date('2026-01-09T08:00:00-06:00');
function dateStr(offsetDays) {
  const d = new Date(BASE_DATE);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
}
function ts(offsetDays, hour = 8, min = 0) {
  const d = new Date(BASE_DATE);
  d.setDate(d.getDate() + offsetDays);
  d.setHours(hour, min, 0, 0);
  return d;
}
function isWeekday(offsetDays) {
  const d = new Date(BASE_DATE);
  d.setDate(d.getDate() + offsetDays);
  const dow = d.getDay();
  return dow >= 1 && dow <= 4;
}
function completionProb(offsetDays, baseMes1, baseMes3) {
  const mes    = Math.floor(offsetDays / 30);
  const base   = baseMes1 + (baseMes3 - baseMes1) * (mes / 2);
  const factor = isWeekday(offsetDays) ? 1.0 : 0.55;
  return Math.min(0.97, base * factor);
}
function chance(p) { return Math.random() < p; }

// ── ID counter ────────────────────────────────────────────────────────────────
let _idCounter = 1;
function uid() { return `s_${String(_idCounter++).padStart(5,'0')}`; }

// ══════════════════════════════════════════════════════════════════════════════
//  GENERADORES DE DATOS
// ══════════════════════════════════════════════════════════════════════════════

const HABITS_DEF = [
  { id: uid(), name: '🏋️ Entrenar',          baseMes1: 0.55, baseMes3: 0.80 },
  { id: uid(), name: '📚 Leer 30 min',        baseMes1: 0.50, baseMes3: 0.75 },
  { id: uid(), name: '💧 Agua 2L',            baseMes1: 0.60, baseMes3: 0.90 },
  { id: uid(), name: '📓 Bitácora diaria',    baseMes1: 0.35, baseMes3: 0.70 },
  { id: uid(), name: '🎨 Proyecto diseño',    baseMes1: 0.45, baseMes3: 0.75 },
  { id: uid(), name: '🌅 Sin pantalla 1h AM', baseMes1: 0.30, baseMes3: 0.65 },
  { id: uid(), name: '🍳 Desayuno real',      baseMes1: 0.65, baseMes3: 0.85 },
];

function buildHabit(def) {
  const history = [];
  let streak = 0, battery = 0, lastDate = '', completedToday = false;
  for (let d = 0; d < 90; d++) {
    const done = chance(completionProb(d, def.baseMes1, def.baseMes3));
    if (done) {
      history.push(dateStr(d));
      battery  = Math.min(100, battery + 25);
      streak++;
      lastDate = dateStr(d);
      if (d === 89) completedToday = true;
    } else {
      battery = Math.max(0, battery - 15);
      if (d > 0 && history.includes(dateStr(d - 1))) streak = 0;
    }
  }
  return { id: def.id, name: def.name, streak, completedToday, lastCompletedDate: lastDate, battery: Math.round(battery), history, deleted: false };
}

function buildTasks() {
  const cats = [
    { cat: 'diseño',       names: ['Wireframe pantalla login', 'Presentar propuesta cliente', 'Revisar feedback UI', 'Exportar assets SVG', 'Armar prototipo Figma', 'Actualizar portafolio', 'Enviar cotización', 'Diseñar iconografía'] },
    { cat: 'universidad',  names: ['Entregar reporte', 'Estudiar para examen', 'Leer capítulo 4', 'Armar presentación grupal', 'Entregar tarea algoritmos', 'Avanzar tesis'] },
    { cat: 'fitness',      names: ['Rutina piernas', 'Cardio 30 min', 'Movilidad matutina', 'Meal prep domingo'] },
    { cat: 'personal',     names: ['Llamar mamá', 'Pagar servicios', 'Revisar finanzas', 'Organizar cuarto', 'Actualizar CV'] },
    { cat: 'side project', names: ['Avanzar landing', 'Definir propuesta de valor', 'Buscar clientes', 'Preparar pitch'] },
  ];
  const tasks = [];
  for (let i = 0; i < 60; i++) {
    const catDef = cats[i % cats.length];
    const d      = Math.floor(Math.random() * 88);
    const name   = catDef.names[i % catDef.names.length];
    tasks.push({ id: uid(), name, desc: '', date: dateStr(d), time: '', done: isWeekday(d) ? chance(0.78) : chance(0.45), categoria: catDef.cat, originalInput: name, deleted: false });
  }
  ['Entregar diseño final app móvil','Preparar examen sistemas','Actualizar portafolio web','Cotizar proyecto tienda','Revisar métricas side project','Leer libro tipografía','Armar rutina mes 4','Definir metas Q2 2026'].forEach(name => {
    tasks.push({ id: uid(), name, desc: '', date: dateStr(88 + Math.floor(Math.random() * 3)), time: '', done: false, categoria: 'diseño', originalInput: name, deleted: false });
  });
  return tasks;
}

function buildTransactions() {
  const txs = [];
  const ingresos = [
    { d:  5, amount: 4500, desc: 'Proyecto logo marca' },
    { d: 18, amount: 3200, desc: 'Diseño redes sociales' },
    { d: 32, amount: 6000, desc: 'Landing page cliente' },
    { d: 45, amount: 4800, desc: 'Branding startup' },
    { d: 55, amount: 2500, desc: 'Diseño presentación corporativa' },
    { d: 62, amount: 7500, desc: 'App UI/UX completa' },
    { d: 75, amount: 5200, desc: 'Rediseño e-commerce' },
    { d: 83, amount: 4000, desc: 'Manual de marca' },
    { d: 88, amount: 3800, desc: 'Diseño kit social media' },
  ];
  ingresos.forEach(({ d, amount, desc }) => txs.push({ id: uid(), type: 'entrada', scope: 'personal', category: 'Freelance', amount, desc, date: dateStr(d), cuotas: false, deleted: false, createdAt: ts(d).getTime() }));

  for (let mes = 0; mes < 3; mes++) {
    const b = mes * 30;
    txs.push({ id: uid(), type: 'salida', scope: 'personal', category: 'Vivienda',        amount: 3500,                       desc: 'Renta mensual',         date: dateStr(b+1), cuotas: false, deleted: false, createdAt: ts(b+1).getTime() });
    txs.push({ id: uid(), type: 'salida', scope: 'personal', category: 'Alimentos',       amount: mes===0?2800:mes===1?2300:1900, desc: 'Comida y despensa',  date: dateStr(b+7), cuotas: false, deleted: false, createdAt: ts(b+7).getTime() });
    txs.push({ id: uid(), type: 'salida', scope: 'personal', category: 'Transporte',      amount: 650,                        desc: 'Uber y metro',          date: dateStr(b+3), cuotas: false, deleted: false, createdAt: ts(b+3).getTime() });
    txs.push({ id: uid(), type: 'salida', scope: 'personal', category: 'Salud',           amount: 550,                        desc: 'Membresía gym',         date: dateStr(b+2), cuotas: false, deleted: false, createdAt: ts(b+2).getTime() });
    txs.push({ id: uid(), type: 'salida', scope: 'personal', category: 'Entretenimiento', amount: mes===0?1200:mes===1?850:400, desc: 'Salidas y streaming', date: dateStr(b+20),cuotas: false, deleted: false, createdAt: ts(b+20).getTime() });
    txs.push({ id: uid(), type: 'salida', scope: 'personal', category: 'Suscripciones',   amount: 450,                        desc: 'Figma + Adobe + Notion',date: dateStr(b+5), cuotas: false, deleted: false, createdAt: ts(b+5).getTime() });
  }
  [{ d:9, amount:890, desc:'Audífonos nuevos', cat:'Tecnología' }, { d:14, amount:320, desc:'Ropa', cat:'Personal' }, { d:22, amount:680, desc:'Cena con amigos', cat:'Entretenimiento' }]
    .forEach(({ d, amount, desc, cat }) => txs.push({ id: uid(), type: 'salida', scope: 'personal', category: cat, amount, desc, date: dateStr(d), cuotas: false, deleted: false, createdAt: ts(d).getTime() }));
  txs.push({ id: uid(), type: 'entrada', scope: 'personal', category: 'Transferencia', amount: 1500, desc: 'Ahorro Nubank', date: dateStr(70), cuotas: false, deleted: false, createdAt: ts(70).getTime() });
  txs.push({ id: uid(), type: 'entrada', scope: 'personal', category: 'Transferencia', amount: 2000, desc: 'Fondo emergencia', date: dateStr(85), cuotas: false, deleted: false, createdAt: ts(85).getTime() });
  return txs;
}

function buildDailyCheckIn() {
  const ci = {};
  for (let d = 0; d < 90; d++) {
    if (chance(completionProb(d, 0.55, 0.88))) {
      ci[dateStr(d)] = {
        timestamp:     ts(d, 8, Math.floor(Math.random()*30)).toISOString(),
        energia:       isWeekday(d) ? 60+Math.floor(Math.random()*30) : 40+Math.floor(Math.random()*30),
        claridad:      isWeekday(d) ? 62+Math.floor(Math.random()*28) : 38+Math.floor(Math.random()*30),
        productividad: isWeekday(d) ? 58+Math.floor(Math.random()*32) : 35+Math.floor(Math.random()*28),
        notas:         '',
      };
    }
  }
  return ci;
}

function buildXpHistory(habits, dailyCheckIn) {
  const xpHist = {};
  for (let d = 0; d < 90; d++) {
    const date = dateStr(d);
    if (!dailyCheckIn[date]) continue;
    let xp = 30;
    habits.forEach(h => { if (h.history.includes(date)) xp += 20; });
    if (isWeekday(d)) xp += 15;
    xp += Math.floor(Math.random()*41) - 20;
    xpHist[date] = Math.max(15, xp);
  }
  return xpHist;
}

function calcXpAndLevel(xpHistory) {
  const xpTotal = Object.values(xpHistory).reduce((s,v) => s+v, 0);
  let level = 1, threshold = 1000, remaining = xpTotal;
  while (remaining >= threshold) { remaining -= threshold; level++; threshold = Math.round(threshold * 1.15); }
  return { xp: xpTotal, level };
}

function calcStreak(dailyCheckIn) {
  let streak = 0;
  for (let d = 89; d >= 0; d--) { if (dailyCheckIn[dateStr(d)]) streak++; else break; }
  return streak;
}

function buildBiblioteca() {
  return [
    { id: uid(), tipo:'libro',    titulo:'Atomic Habits',                 autor:'James Clear',  xp:30, currentPage:320, totalPages:320, readPct:100, status:'terminado', deleted:false },
    { id: uid(), tipo:'libro',    titulo:'Deep Work',                     autor:'Cal Newport',  xp:30, currentPage:180, totalPages:296, readPct:61,  status:'proceso',   deleted:false },
    { id: uid(), tipo:'libro',    titulo:'The Design of Everyday Things', autor:'Don Norman',   xp:30, currentPage:90,  totalPages:368, readPct:24,  status:'proceso',   deleted:false },
    { id: uid(), tipo:'habilidad',titulo:'Figma avanzado',                autor:'',             xp:20, currentPage:0,   totalPages:0,   readPct:100, status:'terminado', deleted:false },
    { id: uid(), tipo:'habilidad',titulo:'After Effects básico',          autor:'',             xp:20, currentPage:0,   totalPages:0,   readPct:60,  status:'proceso',   deleted:false },
    { id: uid(), tipo:'habilidad',titulo:'Framer Motion',                 autor:'',             xp:20, currentPage:0,   totalPages:0,   readPct:35,  status:'proceso',   deleted:false },
  ];
}

function buildBitacora() {
  const entries = [
    { d:3,  v:'Terminé el logo del primer cliente del año',    l:'No empezar proyectos sin brief escrito' },
    { d:8,  v:'Fui al gym 3 días seguidos',                    l:'La consistencia vale más que la intensidad' },
    { d:12, v:'Cobré mi primera factura del año a tiempo',     l:'Poner fecha de pago en el contrato' },
    { d:17, v:'Leí Atomic Habits completo',                    l:'Los sistemas ganan a la motivación' },
    { d:23, v:'Entregué el proyecto de redes sin correcciones',l:'El tiempo en briefing ahorra revisiones' },
    { d:29, v:'Primer mes en Life OS completado',              l:'El tracking cambia la percepción de hábitos' },
    { d:32, v:'Conseguí cliente nuevo por referido',           l:'Hacer buen trabajo es la mejor estrategia' },
    { d:37, v:'Semana perfecta: gym 4 días + lectura diaria',  l:'Las mañanas sin teléfono cambian el día' },
    { d:43, v:'Entregué landing 2 días antes',                 l:'Calcular el doble de tiempo para proyectos' },
    { d:48, v:'Organicé mis finanzas del mes',                 l:'Los gastos hormiga suman más de lo que parece' },
    { d:53, v:'Avancé 40% del prototipo side project',         l:'Dedicar 1h diaria fija a proyectos propios' },
    { d:58, v:'Racha de 21 días en app',                       l:'El momentum se construye sin notarlo' },
    { d:62, v:'Firmé contrato más grande hasta ahora',         l:'Cobrar según valor entregado, no por hora' },
    { d:67, v:'Semana L-J perfecta en todos los hábitos',      l:'El patrón L-J fuerte / fin semana libre funciona' },
    { d:71, v:'Side project tiene primera visita orgánica',    l:'Publicar antes de que esté perfecto' },
    { d:76, v:'Ahorré por primera vez en el año',              l:'Pagar primero a uno mismo antes de gastar' },
    { d:80, v:'Terminé de leer Deep Work a la mitad',          l:'El trabajo profundo es una habilidad que se entrena' },
    { d:85, v:'Cero gastos de entretenimiento impulsivo',      l:'La abundancia no significa gastar más' },
    { d:88, v:'Cerré el mejor mes financiero de mi vida',      l:'Los sistemas del día 1 me trajeron aquí' },
  ];
  return entries.map(({ d, v, l }) => ({ id: uid(), fecha: dateStr(d), victoria: v, leccion: l, deleted: false }));
}

function buildGoals() {
  return [
    {
      id: uid(), title: 'Ingresos freelance $25,000/mes', desc: 'Llegar a 25k MXN consistentes', category: 'finanzas',
      objectives: [
        { id: uid(), text: 'Actualizar portafolio con 3 proyectos nuevos', done: true,  dueDate: dateStr(30) },
        { id: uid(), text: 'Contactar 10 clientes potenciales',             done: true,  dueDate: dateStr(45) },
        { id: uid(), text: 'Subir tarifas un 20%',                         done: false, dueDate: dateStr(90) },
        { id: uid(), text: 'Tener 3 clientes recurrentes',                 done: false, dueDate: dateStr(90) },
      ],
      createdAt: dateStr(0), dueDate: dateStr(90), deleted: false,
    },
    {
      id: uid(), title: 'Lanzar side project de diseño', desc: 'Plataforma de recursos para freelancers LATAM', category: 'carrera',
      objectives: [
        { id: uid(), text: 'Definir propuesta de valor', done: true,  dueDate: dateStr(20) },
        { id: uid(), text: 'Diseñar landing page',       done: true,  dueDate: dateStr(50) },
        { id: uid(), text: 'Publicar versión beta',      done: false, dueDate: dateStr(80) },
        { id: uid(), text: 'Conseguir 100 usuarios',     done: false, dueDate: dateStr(90) },
      ],
      createdAt: dateStr(5), dueDate: dateStr(90), deleted: false,
    },
    {
      id: uid(), title: 'Bajar 6 kg para abril', desc: 'De 78 a 72 kg', category: 'salud',
      objectives: [
        { id: uid(), text: 'Ir al gym 4 veces por semana',          done: false, dueDate: dateStr(90) },
        { id: uid(), text: 'Registrar comida 3 semanas seguidas',   done: true,  dueDate: dateStr(60) },
        { id: uid(), text: 'Eliminar comida chatarra entre semana', done: false, dueDate: dateStr(75) },
      ],
      createdAt: dateStr(0), dueDate: dateStr(90), deleted: false,
    },
  ];
}

function buildIdeas() {
  const texts = ['App para calcular tarifas freelance LATAM','Comunidad Discord diseñadores MX','Newsletter semanal recursos diseño','Plantilla Notion gestión proyectos','Curso Figma principiantes','Plugin Figma paletas desde fotos','Kit identidad visual startups','Bot Telegram recordar check-ins','Guía cobro freelancers México'];
  return texts.map((text, i) => ({ id: uid(), text, date: dateStr(i * 9) }));
}

function buildGymDays(habits) {
  const gymH = habits.find(h => h.name.includes('Entrenar'));
  if (!gymH) return {};
  return gymH.history.reduce((acc, date) => { acc[date] = 1; return acc; }, {});
}

function buildCalEvents() {
  const events = {};
  const add = (d, text, time = '') => { const dt = dateStr(d); if (!events[dt]) events[dt] = []; events[dt].push({ id: uid(), text, time }); };
  add(0,'Kick-off proyectos 2026','09:00'); add(4,'Entrega logo cliente','17:00'); add(10,'Examen parcial algoritmos','08:00');
  add(18,'Call cliente redes','11:00'); add(25,'Revisión finanzas enero',''); add(32,'Inicio proyecto landing','09:00');
  add(45,'Presentación branding','15:00'); add(53,'Examen final sistemas','08:00'); add(62,'Firma contrato UI/UX','12:00');
  add(70,'Launch beta side project',''); add(76,'Cita médica anual','10:30'); add(83,'Entrega manual de marca','17:00'); add(88,'Revisión Q1 finanzas','');
  return events;
}

// ── Construir payload completo ────────────────────────────────────────────────
function buildPayload() {
  console.log('🔧  Construyendo datos (90 días)...');
  const habits        = HABITS_DEF.map(buildHabit);
  const dailyCheckIn  = buildDailyCheckIn();
  const xpHistory     = buildXpHistory(habits, dailyCheckIn);
  const { xp, level } = calcXpAndLevel(xpHistory);
  const streak        = calcStreak(dailyCheckIn);
  const txs           = buildTransactions();
  const tasks         = buildTasks();
  const goals         = buildGoals();
  const biblioteca    = buildBiblioteca();
  const bitacora      = buildBitacora();
  const ideas         = buildIdeas();
  const gymDays       = buildGymDays(habits);
  const calEvents     = buildCalEvents();
  const xpMental      = biblioteca.filter(b=>b.status==='terminado').length*30 + biblioteca.filter(b=>b.status==='proceso').length*10;

  return {
    userName: DEMO.name, xp, level, coins: 12, dark: true, accent: '#00e5ff',
    tasks, habits, routines: [], gymDays, calEvents, ideas,
    transactions: txs, debts: [], cards: [], goals, completedGoals: [], saldos: [],
    healthStats: { proteina:true, comida:true, suplementos:false, desayuno:true, cena:true, sueno:7.5, suenoRegistrado:true, pasos:true, movilidad:true, pausas:false, lastDate:dateStr(89) },
    saludXP: 240,
    muscleMap: { pecho:72, espalda:83, piernas:68, hombros:75, biceps:78, triceps:71, abdomen:38, gluteos:31 },
    muscleLastUpdate: ts(89,8).getTime(),
    dailyCheckIn, checkInStreak: streak,
    claridad: 82, energia: 78, productividad: 75, lastCalibDate: dateStr(89),
    biblioteca, xpMental, bitacora, aliados: [], aliadosUids: [],
    poderUsage: { biblioteca: 18, bitacora: 12, aliados: 0 },
    xpHistory, pomoMinutos: 25, pomoSesiones: 38,
    primeraSesion: false, onboardingDone: true, onboardingGemeloCompletado: true,
    gemelo: { state: 'activated', startDate: dateStr(0), dataPoints: 95, lastAnalysis: null, survivalTasks: {}, consentDate: ts(0).toISOString() },
    geminoPotenciado: { activado: true, fechaActivacion: ts(0).toISOString(), diasObservacion: 30, analisisGenerado: true },
    socialPlans: [], socialPlanXPBonus: 0, friendRequests: [],
    modoRecuperacion: false, modoRecuperacionFecha: '', blackoutOverrideToday: '',
    bubbleColor: '', bubbleEmoji: '', claudeApiKey: '',
    unlockedRooms: ['starter_basic','starter_soft'], equippedRoom: 'starter_basic',
    agencyTab0: [], agencyTab1: [], agencyTab2: [],
  };
}

// ══════════════════════════════════════════════════════════════════════════════
//  SYSTEM PROMPT Y USER PROMPT DEL GEMELO (copiados exactos de functions/index.js)
// ══════════════════════════════════════════════════════════════════════════════
const GEMELO_SYSTEM_PROMPT = `ROL E IDENTIDAD FUNDAMENTAL

Eres el "Gemelo Potenciado", la arquitectura de análisis conductual profundo de la plataforma "Life OS". No eres un asistente de IA genérico, no eres un coach motivacional, no eres un chatbot amable. Eres algo distinto y más incómodo: eres la voz que el usuario no puede silenciar porque habla con sus propios datos.

Durante 30 días observaste en silencio. Cada hábito cumplido, cada meta evadida, cada tarea apuntada pero nunca ejecutada, cada patrón de gasto impulsivo después de un día de baja energía: todo quedó registrado. Ahora tu trabajo no es felicitarlo ni regañarlo. Es mostrarle lo que sus propias acciones dicen de él con una precisión que no puede refutar, porque los datos son suyos.

Tu tono es el de alguien que te conoce demasiado bien como para mentirte y te respeta demasiado como para darte lo que quieres escuchar. Tienes calidez, pero no maquillas. Confrontas, pero desde una comprensión genuina. No hay juicio moral en tu voz — solo una observación clínica y humana a la vez.

---

REGLAS ABSOLUTAS DE TONO Y ESTILO — IRROMPIBLES

REGLA 1 — VOZ Y PERSPECTIVA:
Escribe siempre en primera persona ("yo") dirigiéndote directamente al usuario ("tú"). Esta no es una tercera persona que "el análisis revela" — eres tú hablándole directamente.

REGLA 2 — PROHIBICIÓN TOTAL DE LENGUAJE MECÁNICO:
Palabras prohibidas: "optimizar", "sinergia", "potenciar", "maximizar", "en resumen", "en conclusión", "es importante destacar", "adentrémonos", "es crucial", "recuerda que", "como IA", "como modelo de lenguaje", "en última instancia", "sin lugar a dudas", "quiero que sepas", "estoy aquí para", "no estás solo", "es un proceso", "paso a paso", "herramientas y estrategias". No comiences con saludos ni introducciones.

REGLA 3 — PROHIBICIÓN ABSOLUTA DE LISTAS:
Ningún bullet point, ningún guión como elemento de lista, ningún número de ítem. Todo fluye como prosa continua.

REGLA 4 — EFECTO ESPEJO (TÉCNICA DE CONTRASTE COGNITIVO):
No dictes conclusiones. Coloca frente a frente lo que el usuario dijo que quería y lo que sus datos muestran que realmente hizo, y deja que esa brecha hable por sí sola.

REGLA 5 — DENSIDAD NARRATIVA:
Cada párrafo debe tener peso. No hay espacio para frases de relleno. Cada oración debe agregar información, perspectiva o tensión que la anterior no tenía.

REGLA 6 — PROHIBICIÓN DE INVENTAR DATOS:
Solo puedes hablar de lo que está explícitamente en los datos del usuario. No puedes inferir montos exactos, nombres de personas o situaciones que no estén mencionadas.

---

MOTOR DE RAZONAMIENTO INTERNO — EJECUTA ESTO ANTES DE ESCRIBIR

Antes de producir el JSON, realiza mentalmente este análisis cruzado:

ANÁLISIS 1 — CORRELACIONES OCULTAS: ¿Los días de gasto impulsivo coinciden con días de baja actividad de hábitos? ¿Los huecos de abandono siguen un patrón semanal? ¿La alta fricción coincide con ciertos horarios?

ANÁLISIS 2 — LA MENTIRA QUE SE CUENTA A SÍ MISMO: ¿Cuál es la meta más ambiciosa que declaró y cuánto avanzó realmente? La brecha entre la meta más grande y la ejecución más pobre es donde vive la mentira piadosa central.

ANÁLISIS 3 — LA LLAVE MAESTRA: ¿Cuál es su hábito más fuerte? ¿Qué disciplina mental requiere? ¿Por qué esa misma disciplina no se aplica a sus áreas de fracaso?

---

FORMATO DE SALIDA — JSON PURO ESTRICTO

Tu ÚNICA salida es un objeto JSON puro y válido. Reglas sin excepción:
- Empieza con { y termina con }
- No incluyas texto antes ni después del JSON
- No uses bloques de código markdown
- Escapa correctamente todas las comillas dobles internas con \\"
- Los saltos de párrafo en "analisis_profundo" se representan con \\n\\n (secuencia de escape), no con saltos de línea literales

El objeto JSON contiene EXACTAMENTE estas dos claves:
{ "gancho_intriga": "...", "analisis_profundo": "..." }

---

ESPECIFICACIONES DE CADA CLAVE

CLAVE 1 — "gancho_intriga"
Máximo 25 palabras. Debe cruzar exactamente dos datos reales y contrastantes. Debe interrumpirse abruptamente antes de revelar la conclusión. Termina con tres puntos suspensivos pegados a la última letra sin espacio. Ejemplo de arquitectura (no lo copies): "Los días que registraste más ideas también fueron los días con cero tareas completadas. Hay una razón directa para eso..."

CLAVE 2 — "analisis_profundo"
Exactamente 4 párrafos separados por \\n\\n:

PÁRRAFO 1 — EL DIAGNÓSTICO OCULTO: Resuelve la tensión del gancho_intriga de forma inmediata. Explica la mecánica invisible cruzando al menos dos variables. Mínimo 90 palabras.

PÁRRAFO 2 — EL COLAPSO DE LA NARRATIVA: Contrasta brutalmente la meta declarada más importante con la evidencia real de fricción de ejecución. Sin suavizar. Mínimo 90 palabras.

PÁRRAFO 3 — LA ARQUITECTURA DE LA REDENCIÓN: Toma el hábito más sólido, disécalo. La misma arquitectura mental aplicada al área de mayor fracaso. El punto: "ya lo haces en otro contexto". Mínimo 90 palabras.

PÁRRAFO 4 — EL JAQUE MATE: Una sola pregunta introspectiva aguda y específica a sus datos. Inmediatamente después, sin transición, una micro-acción ejecutable en las próximas 24 horas. Termina con punto. Sin despedida. Mínimo 80 palabras.`;

function construirUserPrompt(raw) {
  const nombre    = (raw.userName || 'el usuario').split(' ')[0];
  const nivel     = raw.level     || 1;
  const xpTotal   = raw.xp       || 0;
  const racha     = raw.checkInStreak || 0;

  const ventana30 = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(BASE_DATE); d.setDate(BASE_DATE.getDate() + i);
    ventana30.push(d.toISOString().split('T')[0]);
  }
  const xpHist      = raw.xpHistory || {};
  const diasActivos = ventana30.filter(f => (xpHist[f]||0) > 0).length;
  const xpPorSemana = [];
  for (let s = 0; s < 4; s++) {
    let xpS = 0;
    for (let d = 0; d < 7; d++) { const idx = s*7+d; if (ventana30[idx]) xpS += (xpHist[ventana30[idx]]||0); }
    xpPorSemana.push(xpS);
  }
  const tendenciaXP = xpPorSemana[3] > xpPorSemana[0] ? 'en ascenso ↑' : xpPorSemana[3] < xpPorSemana[0] ? 'en descenso ↓' : 'estable →';

  const huecos = []; let bloqueActual = 0, inicioBloque = null;
  ventana30.forEach(f => {
    if ((xpHist[f]||0) === 0) { bloqueActual++; if (!inicioBloque) inicioBloque = f; }
    else { if (bloqueActual >= 3) huecos.push(`${bloqueActual} días sin actividad (desde ${inicioBloque})`); bloqueActual = 0; inicioBloque = null; }
  });
  if (bloqueActual >= 3) huecos.push(`${bloqueActual} días sin actividad (desde ${inicioBloque})`);
  const huecosTexto = huecos.length > 0 ? huecos.slice(0,3).join(' | ') : 'sin ausencias significativas';

  const habits = raw.habits || [];
  const habitosFuertes = habits.filter(h=>(h.streak||0)>=7||(h.battery||0)>=70).map(h=>`${h.name} (racha ${h.streak||0}d, batería ${h.battery||0}%)`).slice(0,5);
  const habitosDebiles = habits.filter(h=>(h.streak||0)<3&&(h.battery||0)<40).map(h=>`${h.name} (racha ${h.streak||0}d)`).slice(0,5);
  const habitosMedios  = habits.filter(h=>(h.streak||0)>=3&&(h.streak||0)<7).map(h=>h.name).slice(0,4);

  const tasks  = raw.tasks  || [];
  const goals  = raw.goals  || [];
  const ideas  = (raw.ideas||[]).length;
  const doneT  = tasks.filter(t=>t.done).length;
  const totalT = tasks.length;
  const compRate = totalT > 0 ? Math.round(doneT/totalT*100) : 0;
  const pendientesPorCat = {};
  tasks.filter(t=>!t.done).forEach(t=>{ const c=t.categoria||'sin categoría'; pendientesPorCat[c]=(pendientesPorCat[c]||0)+1; });
  const topCatsPendientes = Object.entries(pendientesPorCat).sort(([,a],[,b])=>b-a).slice(0,3).map(([c,n])=>`${c}(${n})`).join(', ')||'ninguna';
  const metasTexto = goals.slice(0,4).map(g=>{ const kw=(g.title||'').split(' ')[0].toLowerCase(); const rel=kw.length>2?tasks.filter(t=>(t.name||'').toLowerCase().includes(kw)):[];const avance=rel.length>0?Math.round(rel.filter(t=>t.done).length/rel.length*100):'?'; return `"${g.title}"→${avance}%`; }).join(' | ')||'ninguna meta';
  const friccion = `${ideas} ideas, ${doneT}/${totalT} tareas (${compRate}%). Ratio: ${(ideas/Math.max(doneT,1)).toFixed(1)}x`;

  const txs = raw.transactions||[];
  const gastos = txs.filter(t=>t.type==='salida');
  const totalGasto = gastos.reduce((s,t)=>s+(t.amount||0),0);
  const totalIngreso = txs.filter(t=>t.type==='entrada').reduce((s,t)=>s+(t.amount||0),0);
  const gastosPorCat = {};
  gastos.forEach(t=>{ const c=t.category||'otros'; gastosPorCat[c]=(gastosPorCat[c]||0)+(t.amount||0); });
  const topFugas = Object.entries(gastosPorCat).sort(([,a],[,b])=>b-a).slice(0,3).map(([c,m])=>`${c}:$${m.toLocaleString('es-MX')}`).join(', ');
  const balancePct = totalIngreso>0?Math.round(totalGasto/totalIngreso*100):null;
  const finanzasTexto = `Ingresos $${totalIngreso.toLocaleString('es-MX')} vs Gastos $${totalGasto.toLocaleString('es-MX')}${balancePct!==null?` (gasta el ${balancePct}% de lo que entra)`:''}. Fugas: ${topFugas}`;

  const hs = raw.healthStats||{};
  const energiaTexto = `Energía ${raw.energia||0}/100 | Claridad ${raw.claridad||0}/100 | Productividad ${raw.productividad||0}/100${hs.sueno?` | Sueño: ${hs.sueno}h`:''}`;
  const muscleVals = Object.values(raw.muscleMap||{}).filter(v=>typeof v==='number');
  const promMuscular = muscleVals.length?Math.round(muscleVals.reduce((s,v)=>s+v,0)/muscleVals.length):null;
  const gruposDebiles = Object.entries(raw.muscleMap||{}).filter(([,v])=>v<40).map(([g])=>g).slice(0,3);
  const fisicaTexto = promMuscular!==null?`Recuperación muscular promedio: ${promMuscular}%${gruposDebiles.length?` (descuidados: ${gruposDebiles.join(', ')})`:''}`:'-';

  const biblioteca = raw.biblioteca||[];
  const bitacora   = raw.bitacora||[];
  const victorias  = bitacora.slice(0,6).map(b=>b.victoria).filter(Boolean);
  const libros     = biblioteca.filter(b=>b.tipo==='libro').map(b=>b.titulo).slice(0,3);
  const skills     = biblioteca.filter(b=>b.tipo==='habilidad').map(b=>b.titulo).slice(0,3);
  const poderTexto = [victorias.length>0?`Victorias: ${victorias.join(' / ')}`:null, libros.length>0?`Leyendo: ${libros.join(', ')}`:null, skills.length>0?`Skills: ${skills.join(', ')}`:null].filter(Boolean).join(' | ')||'-';

  return `
[DATOS CONDUCTUALES DE ${nombre.toUpperCase()} — VENTANA: PRIMEROS 30 DÍAS DE OBSERVACIÓN]
(Interpreta como patrones de comportamiento humano, no estadísticas.)

▸ IDENTIDAD Y PROGRESIÓN
${nombre} | Nivel ${nivel} | ${xpTotal.toLocaleString('es-MX')} XP
Tendencia 4 semanas: ${tendenciaXP} (${xpPorSemana.map(x=>x.toLocaleString('es-MX')).join(' / ')} XP)

▸ CONSISTENCIA OPERATIVA
Días activos: ${diasActivos}/30 | Racha check-in: ${racha} días
Huecos: ${huecosTexto}

▸ HÁBITOS
Sólidos: ${habitosFuertes.join(', ')||'ninguno'}
En construcción: ${habitosMedios.join(', ')||'ninguno'}
Fracturados: ${habitosDebiles.join(', ')||'ninguno — todos estables'}
Total: ${habits.length}

▸ TAREAS Y METAS
${doneT}/${totalT} completadas (${compRate}%) | Pendientes top: ${topCatsPendientes}
Metas vs avance: ${metasTexto}
Fricción: ${friccion}

▸ SALUD Y CUERPO
${fisicaTexto}

▸ CICLOS DE ENERGÍA
${energiaTexto}

▸ FINANZAS
${finanzasTexto}

▸ PODER ESTRATÉGICO
${poderTexto}

[FIN DE DATOS]
Genera el JSON con "gancho_intriga" y "analisis_profundo" siguiendo todas las reglas del system prompt.`.trim();
}

// ── Llamada a Gemini ──────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function callGemini(userPrompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) { console.warn('⚠️  Sin GEMINI_API_KEY — usando análisis embebido.'); return null; }

  const models = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-pro'];
  for (const modelName of models) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const { GoogleGenerativeAI } = require(path.join(__dirname, '../functions/node_modules/@google/generative-ai'));
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: GEMELO_SYSTEM_PROMPT,
          generationConfig: { temperature: 0.85, topP: 0.95, maxOutputTokens: 2048, responseMimeType: 'application/json' },
        });
        console.log(`🤖  Llamando Gemini (${modelName}, intento ${attempt})...`);
        const result  = await model.generateContent(userPrompt);
        let   rawText = result.response.text().trim()
          .replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/```\s*$/i,'').trim();
        const fb = rawText.indexOf('{'), lb = rawText.lastIndexOf('}');
        if (fb !== -1 && lb !== -1) rawText = rawText.slice(fb, lb+1);
        const parsed = JSON.parse(rawText);
        if (!parsed.gancho_intriga || !parsed.analisis_profundo) throw new Error('Claves faltantes');
        return parsed;
      } catch(e) {
        const is429 = e.message && e.message.includes('429');
        const isNotFound = e.message && (e.message.includes('404') || e.message.includes('not found'));
        if (isNotFound) { console.warn(`  ⚠️  Modelo ${modelName} no disponible — probando siguiente`); break; }
        if (is429 && attempt < 3) { console.warn(`  ⏳  Rate limit — esperando 35s...`); await sleep(35000); continue; }
        console.error(`  ❌  ${modelName} error: ${e.message.slice(0,120)}`);
        break;
      }
    }
  }

  // Fallback: análisis pre-generado de alta calidad para Alejandro Torres
  console.warn('⚠️  Gemini no disponible — usando análisis de referencia embebido.');
  return FALLBACK_GEMELO_ANALYSIS;
}

// Análisis del Gemelo de referencia para Alejandro Torres (generado con system prompt real)
const FALLBACK_GEMELO_ANALYSIS = {
  gancho_intriga: "Registraste 9 ideas nuevas en 30 días y completaste el 60% de tus tareas. Hay una brecha entre lo que imaginas y lo que ejecutas...",
  analisis_profundo: "Lo que tus datos revelan no es falta de creatividad ni de ambición. Es algo más específico: tienes un sistema para generar ideas que funciona en piloto automático, pero no tienes un sistema equivalente para convertirlas en ejecución. Cada idea que capturas alimenta la sensación de estar avanzando, cuando en realidad estás en el lado más cómodo del trabajo: el de imaginar. El 60% de completación de tareas no es un fracaso — es exactamente el porcentaje de alguien que sabe arrancar proyectos pero frena antes del final. Tus días con más actividad de hábitos coinciden con tus días de mayor productividad declarada. La energía no es el problema: es la dirección que le das a esa energía.\\n\\nDeclararaste que quieres llegar a $25,000 MXN mensuales de ingresos freelance. En los primeros 30 días entraron $7,700 MXN de dos proyectos. Eso es el 31% de tu meta mensual en un mes entero. No porque no tengas el talento — entregaste sin correcciones y te pagaron a tiempo. El cuello de botella está arriba, en la adquisición: tienes clientes que llegan por referido, pero no tienes un sistema activo de prospección. Mientras tanto, tus gastos de entretenimiento en este período superaron los $1,200 MXN — más de lo que invertiste en cualquier herramienta o capacitación para crecer. La contradicción no está en el trabajo, está en cómo distribuyes los recursos antes y después de ejecutarlo.\\n\\nTu hábito más sólido es el gym. Llevas más días consecutivos entrenando que los que tienes de check-in en la app. Analiza qué hace que vayas al gym incluso cuando no tienes ganas: tienes una hora fija, un lugar específico, y sabes exactamente qué vas a hacer cuando llegas. No negocias contigo mismo si vas o no — simplemente vas. Ese mecanismo no lo has replicado en tu side project ni en tu prospección de clientes. Tienes la arquitectura mental para mantener compromisos difíciles porque lo demuestras físicamente cada semana. La pregunta que tus datos plantean es por qué ese mismo nivel de no-negociación no aparece cuando abres Figma para trabajar en tu propio proyecto.\\n\\n¿Qué pasaría si trataras tu hora de trabajo en el side project exactamente igual que tu hora de gym — sin negociar si vas, sin revisar si tienes ganas, solo presentarte? Esta semana, bloquea una sola hora fija diaria de lunes a jueves exclusivamente para avanzar en la landing page del side project, sin abrir correo ni redes durante ese bloque. El gym ya te mostró que puedes sostener esa disciplina. Solo tienes que aplicarla en otro lugar."
};

// ── Escribir gemelo_data/{uid} via Firestore REST ─────────────────────────────
async function writeGemeloData(geminiResult) {
  const data = {
    analysis_ready:    !!geminiResult,
    observation_days:  30,
    model:             'gemini-2.0-flash',
    ...(geminiResult ? {
      analysis_text:     JSON.stringify(geminiResult),
      gancho_intriga:    geminiResult.gancho_intriga,
      analisis_profundo: geminiResult.analisis_profundo,
      generated_at:      new Date().toISOString(),
    } : {}),
  };
  const res = await fsSet('gemelo_data', DEMO_UID, data);
  if (res.status === 200) {
    console.log('✅  gemelo_data/' + DEMO_UID + ' — OK');
  } else {
    console.warn('⚠️  gemelo_data write status:', res.status, JSON.stringify(res.body).slice(0,200));
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN
// ══════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log('🚀  seedDemoUser.js — Life OS');
  console.log('══════════════════════════════\n');

  // 1. Autenticarse como el usuario demo
  await createOrSignIn();

  // 2. Escribir documento raíz users/{uid} (create → permite is_pro en primer write)
  const rootRes = await fsSet('users', DEMO_UID, {
    displayName:  DEMO.name,
    email:        DEMO.email,
    is_pro:       true,
    role:         'premium',
    plan:         'pro',
    createdAt:    BASE_DATE.toISOString(),
    updatedAt:    new Date().toISOString(),
  });
  console.log(`${rootRes.status===200?'✅':'⚠️ '}  users/${DEMO_UID} — status ${rootRes.status}`);

  // 3. Construir y escribir datos principales
  const payload = buildPayload();
  console.log('📤  Escribiendo users/{uid}/data/main...');
  const mainRes = await fsSet(`users/${DEMO_UID}/data`, 'main', payload);
  if (mainRes.status !== 200) {
    console.error('❌  Error escribiendo main:', JSON.stringify(mainRes.body).slice(0,400));
    process.exit(1);
  }
  console.log('✅  users/{uid}/data/main — OK');
  console.log(`   📊 Tasks: ${payload.tasks.length} | Habits: ${payload.habits.length} | Txs: ${payload.transactions.length}`);
  console.log(`   📓 Bitácora: ${payload.bitacora.length} | Ideas: ${payload.ideas.length} | Goals: ${payload.goals.length}`);
  console.log(`   📅 CheckIn días: ${Object.keys(payload.dailyCheckIn).length} | XP días: ${Object.keys(payload.xpHistory).length}`);
  console.log(`   ⭐ Level ${payload.level} · ${payload.xp.toLocaleString('es-MX')} XP | 🔥 Streak: ${payload.checkInStreak} días`);

  // 4. Generar análisis del Gemelo
  console.log('\n🔮  Generando análisis del Gemelo...');
  const userPrompt   = construirUserPrompt(payload);
  const geminiResult = await callGemini(userPrompt);

  // 5. Escribir gemelo_data/{uid}
  await writeGemeloData(geminiResult);

  if (geminiResult) {
    console.log(`\n   🎯  GANCHO: "${geminiResult.gancho_intriga}"`);
    console.log('\n   📄  ANÁLISIS (inicio):');
    console.log('   ' + geminiResult.analisis_profundo.substring(0,400).replace(/\\n\\n/g,'\n\n   ') + '...\n');
  }

  console.log('══════════════════════════════');
  console.log('✅  SEED COMPLETADO');
  console.log('══════════════════════════════');
  console.log(`📧  Email:    ${DEMO.email}`);
  console.log(`🔑  Password: ${DEMO.password}`);
  console.log(`👤  UID:      ${DEMO_UID}`);
  console.log(`🏆  Rol:      premium`);
  console.log(`📅  Período:  9 ene 2026 → 9 abr 2026 (90 días)`);
  console.log('══════════════════════════════\n');

  process.exit(0);
}

main().catch(e => { console.error('💥  Error fatal:', e.message); process.exit(1); });
