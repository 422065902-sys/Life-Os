/**
 * seedDemoUser.js — Semilla del usuario de demostración de Life OS
 *
 * Ejecutar:
 *   cd "Documents/Life Os/functions"
 *   SEED_ENV=demo GEMINI_API_KEY=<tu_key> node ../scripts/seedDemoUser.js
 *
 * Si omites GEMINI_API_KEY el script corre igual pero imprime el user prompt
 * para que puedas obtener el análisis del Gemelo manualmente.
 *
 * Guard de seguridad: el script solo corre si SEED_ENV === 'demo'
 */

'use strict';

// ── Guard ────────────────────────────────────────────────────────────────────
if (process.env.SEED_ENV !== 'demo') {
  console.error('❌  SEED_ENV debe ser "demo". Ejecuta: SEED_ENV=demo node scripts/seedDemoUser.js');
  process.exit(1);
}

// ── Dependencias (cargadas desde functions/node_modules) ─────────────────────
const path  = require('path');
const admin = require(path.join(__dirname, '../functions/node_modules/firebase-admin'));

// ── Firebase Admin init ───────────────────────────────────────────────────────
// Usa Application Default Credentials (Firebase CLI ya lo configura)
admin.initializeApp({ projectId: 'life-os-prod-3a590' });
const auth = admin.auth();
const db   = admin.firestore();

// ── Credenciales del usuario demo ─────────────────────────────────────────────
const DEMO = {
  email:    'demo@mylifeos.lat',
  password: 'LifeOS2026Demo',
  name:     'Alejandro Torres',
  uid:      null,     // se rellena después de crear/encontrar el user
};

// ── Fecha base: 9 enero 2026 ──────────────────────────────────────────────────
const BASE_DATE = new Date('2026-01-09T08:00:00-06:00');   // CDMX

function dateStr(offsetDays) {
  const d = new Date(BASE_DATE);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];          // 'YYYY-MM-DD'
}
function ts(offsetDays, hour = 8, min = 0) {
  const d = new Date(BASE_DATE);
  d.setDate(d.getDate() + offsetDays);
  d.setHours(hour, min, 0, 0);
  return d;
}

// ── Utilidades ────────────────────────────────────────────────────────────────
let _idCounter = 1;
function uid() { return `seed_${String(_idCounter++).padStart(5,'0')}`; }

/** ¿Es día de semana? (L=1…J=4 = fuerte; V=5/S=6/D=0 = flojo) */
function isWeekday(offsetDays) {
  const d = new Date(BASE_DATE);
  d.setDate(d.getDate() + offsetDays);
  const dow = d.getDay(); // 0=Dom … 6=Sab
  return dow >= 1 && dow <= 4;
}

/**
 * Probabilidad de completar un hábito según el día de la semana
 * y el "mes" (progresión mes 1 → mes 3)
 */
function completionProb(offsetDays, baseMes1, baseMes3) {
  const mes = Math.floor(offsetDays / 30);          // 0,1,2
  const base = baseMes1 + (baseMes3 - baseMes1) * (mes / 2);
  const factor = isWeekday(offsetDays) ? 1.0 : 0.55;
  return Math.min(0.97, base * factor);
}

/** Devuelve true con probabilidad p */
function chance(p) { return Math.random() < p; }

// ══════════════════════════════════════════════════════════════════════════════
//  DATOS BASE
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Hábitos de Alejandro — 7 hábitos con historia coherente
 * baseMes1: probabilidad en el primer mes (días de semana)
 * baseMes3: probabilidad en el tercer mes
 */
const HABITS_DEF = [
  { id: uid(), name: '🏋️ Entrenar',          baseMes1: 0.55, baseMes3: 0.80 },
  { id: uid(), name: '📚 Leer 30 min',        baseMes1: 0.50, baseMes3: 0.75 },
  { id: uid(), name: '💧 Agua 2L',            baseMes1: 0.60, baseMes3: 0.90 },
  { id: uid(), name: '📓 Bitácora diaria',    baseMes1: 0.35, baseMes3: 0.70 },
  { id: uid(), name: '🎨 Proyecto diseño',    baseMes1: 0.45, baseMes3: 0.75 },
  { id: uid(), name: '🌅 Sin pantalla 1h AM', baseMes1: 0.30, baseMes3: 0.65 },
  { id: uid(), name: '🍳 Desayuno real',      baseMes1: 0.65, baseMes3: 0.85 },
];

/**
 * Genera el historial de 90 días para cada hábito.
 * Devuelve el objeto hábito listo para Firestore.
 */
function buildHabit(def) {
  const history = [];
  let streak    = 0;
  let battery   = 0;
  let lastDate  = '';
  let completedToday = false;

  for (let d = 0; d < 90; d++) {
    const done = chance(completionProb(d, def.baseMes1, def.baseMes3));
    if (done) {
      history.push(dateStr(d));
      battery   = Math.min(100, battery + 25);
      streak++;
      lastDate  = dateStr(d);
      if (d === 89) completedToday = true;
    } else {
      battery = Math.max(0, battery - 15);
      if (d > 0 && history.includes(dateStr(d - 1))) streak = 0; // rompió racha
    }
  }

  return {
    id:                def.id,
    name:              def.name,
    streak:            streak,
    completedToday:    completedToday,
    lastCompletedDate: lastDate,
    battery:           Math.round(battery),
    history:           history,
    deleted:           false,
  };
}

/**
 * Tareas de 90 días — mezcla de completadas y activas
 */
function buildTasks() {
  const cats = [
    { cat: 'diseño',      names: ['Wireframe pantalla login', 'Presentar propuesta cliente', 'Revisar feedback UI', 'Exportar assets en SVG', 'Armar prototipo Figma', 'Actualizar portafolio', 'Enviar cotización proyecto', 'Diseñar iconografía'] },
    { cat: 'universidad', names: ['Entregar reporte proyecto', 'Estudiar para examen', 'Leer capítulo 4', 'Armar presentación grupal', 'Entregar tarea algoritmos', 'Avanzar tesis parcial'] },
    { cat: 'fitness',     names: ['Rutina piernas', 'Cardio 30 min', 'Movilidad matutina', 'Meal prep dominical'] },
    { cat: 'personal',    names: ['Llamar mamá', 'Pagar servicios', 'Revisar finanzas del mes', 'Organizar cuarto', 'Actualizar CV'] },
    { cat: 'side project',names: ['Avanzar landing page', 'Definir propuesta de valor', 'Buscar clientes potenciales', 'Preparar pitch'] },
  ];

  const tasks = [];

  // 60 tareas completadas (distribuidas en 90 días)
  for (let i = 0; i < 60; i++) {
    const catDef = cats[i % cats.length];
    const d      = Math.floor(Math.random() * 88);   // días 0-87
    const name   = catDef.names[i % catDef.names.length];
    tasks.push({
      id:            uid(),
      name:          name,
      desc:          '',
      date:          dateStr(d),
      time:          '',
      done:          isWeekday(d) ? chance(0.78) : chance(0.45),
      categoria:     catDef.cat,
      originalInput: name,
      deleted:       false,
    });
  }
  // 8 tareas activas pendientes (últimos días)
  ['Entregar diseño final app móvil', 'Preparar examen de sistemas', 'Actualizar portafolio web', 'Cotizar proyecto tienda online', 'Revisar métricas Side Project', 'Leer libro de tipografía', 'Armar rutina mes 4 gym', 'Definir metas Q2 2026'].forEach(name => {
    tasks.push({
      id:            uid(),
      name:          name,
      desc:          '',
      date:          dateStr(88 + Math.floor(Math.random() * 3)),
      time:          '',
      done:          false,
      categoria:     'diseño',
      originalInput: name,
      deleted:       false,
    });
  });

  return tasks;
}

/**
 * Transacciones financieras de 90 días
 * Patrón: freelance irregular, mejora mes 2 → 3
 */
function buildTransactions() {
  const txs = [];

  // ── Ingresos ──
  const ingresos = [
    // Mes 1: un cliente, flujo bajo
    { d:  5, amount: 4500, desc: 'Proyecto logo marca' },
    { d: 18, amount: 3200, desc: 'Diseño redes sociales' },
    // Mes 2: dos clientes, ingresos estables
    { d: 32, amount: 6000, desc: 'Landing page cliente' },
    { d: 45, amount: 4800, desc: 'Branding startup' },
    { d: 55, amount: 2500, desc: 'Diseño presentación corporativa' },
    // Mes 3: mejor posicionado, ingresos altos
    { d: 62, amount: 7500, desc: 'App UI/UX completa' },
    { d: 75, amount: 5200, desc: 'Rediseño e-commerce' },
    { d: 83, amount: 4000, desc: 'Manual de marca' },
    { d: 88, amount: 3800, desc: 'Diseño kit social media' },
  ];
  ingresos.forEach(({ d, amount, desc }) => {
    txs.push({ id: uid(), type: 'entrada', scope: 'personal', category: 'Freelance', amount, desc, date: dateStr(d), cuotas: false, deleted: false, createdAt: ts(d).getTime() });
  });

  // ── Gastos recurrentes ──
  for (let mes = 0; mes < 3; mes++) {
    const base = mes * 30;
    // Renta (mes 2 y 3 la paga más puntual)
    txs.push({ id: uid(), type: 'salida', scope: 'personal', category: 'Vivienda', amount: 3500, desc: 'Renta mensual', date: dateStr(base + 1), cuotas: false, deleted: false, createdAt: ts(base + 1).getTime() });
    // Comida — mes 1 impulsivo, mes 3 ordenado
    const comidaGasto = mes === 0 ? 2800 : mes === 1 ? 2300 : 1900;
    txs.push({ id: uid(), type: 'salida', scope: 'personal', category: 'Alimentos', amount: comidaGasto, desc: 'Comida y despensa', date: dateStr(base + 7), cuotas: false, deleted: false, createdAt: ts(base + 7).getTime() });
    // Transporte
    txs.push({ id: uid(), type: 'salida', scope: 'personal', category: 'Transporte', amount: 650, desc: 'Uber y metro mensual', date: dateStr(base + 3), cuotas: false, deleted: false, createdAt: ts(base + 3).getTime() });
    // Gym
    txs.push({ id: uid(), type: 'salida', scope: 'personal', category: 'Salud', amount: 550, desc: 'Membresía gym', date: dateStr(base + 2), cuotas: false, deleted: false, createdAt: ts(base + 2).getTime() });
    // Entretenimiento — más en mes 1, menos en mes 3
    const entGasto = mes === 0 ? 1200 : mes === 1 ? 850 : 400;
    txs.push({ id: uid(), type: 'salida', scope: 'personal', category: 'Entretenimiento', amount: entGasto, desc: 'Salidas y streaming', date: dateStr(base + 20), cuotas: false, deleted: false, createdAt: ts(base + 20).getTime() });
    // Suscripciones
    txs.push({ id: uid(), type: 'salida', scope: 'personal', category: 'Suscripciones', amount: 450, desc: 'Figma + Adobe + Notion', date: dateStr(base + 5), cuotas: false, deleted: false, createdAt: ts(base + 5).getTime() });
  }

  // Gastos extras mes 1 (impulsivos)
  [
    { d:  9, amount: 890,  desc: 'Audífonos nuevos', cat: 'Tecnología' },
    { d: 14, amount: 320,  desc: 'Ropa', cat: 'Personal' },
    { d: 22, amount: 680,  desc: 'Cena con amigos', cat: 'Entretenimiento' },
  ].forEach(({ d, amount, desc, cat }) => {
    txs.push({ id: uid(), type: 'salida', scope: 'personal', category: cat, amount, desc, date: dateStr(d), cuotas: false, deleted: false, createdAt: ts(d).getTime() });
  });

  // Ahorro mes 3 (cambio de comportamiento visible)
  txs.push({ id: uid(), type: 'entrada', scope: 'personal', category: 'Transferencia', amount: 1500, desc: 'Ahorro cuenta Nubank', date: dateStr(70), cuotas: false, deleted: false, createdAt: ts(70).getTime() });
  txs.push({ id: uid(), type: 'entrada', scope: 'personal', category: 'Transferencia', amount: 2000, desc: 'Ahorro fondo emergencia', date: dateStr(85), cuotas: false, deleted: false, createdAt: ts(85).getTime() });

  return txs;
}

/**
 * dailyCheckIn de 90 días — mayor consistencia L-J
 */
function buildDailyCheckIn() {
  const checkIn = {};
  for (let d = 0; d < 90; d++) {
    const prob = completionProb(d, 0.55, 0.88);
    if (chance(prob)) {
      checkIn[dateStr(d)] = {
        timestamp:    ts(d, 8, Math.floor(Math.random() * 30)).toISOString(),
        energia:      isWeekday(d) ? 60 + Math.floor(Math.random() * 30) : 40 + Math.floor(Math.random() * 30),
        claridad:     isWeekday(d) ? 62 + Math.floor(Math.random() * 28) : 38 + Math.floor(Math.random() * 30),
        productividad:isWeekday(d) ? 58 + Math.floor(Math.random() * 32) : 35 + Math.floor(Math.random() * 28),
        notas:        '',
      };
    }
  }
  return checkIn;
}

/**
 * xpHistory — coherente con check-ins y hábitos completados
 * Días activos ganan más XP. Mejora progresiva mes 1 → mes 3.
 */
function buildXpHistory(habits, dailyCheckIn) {
  const xpHist = {};
  for (let d = 0; d < 90; d++) {
    const date = dateStr(d);
    if (!dailyCheckIn[date]) continue;

    let xp = 30; // check-in base
    // XP por hábitos (estimado desde history)
    habits.forEach(h => {
      if (h.history.includes(date)) xp += 20;
    });
    // Bonus semana días buenos
    if (isWeekday(d)) xp += 15;
    // Variación aleatoria ±20
    xp += Math.floor(Math.random() * 41) - 20;
    xpHist[date] = Math.max(15, xp);
  }
  return xpHist;
}

/**
 * xpTotal y level calculados desde el historial
 */
function calcXpAndLevel(xpHistory) {
  const xpTotal = Object.values(xpHistory).reduce((s, v) => s + v, 0);
  let level = 1, threshold = 1000;
  let remaining = xpTotal;
  while (remaining >= threshold) {
    remaining -= threshold;
    level++;
    threshold = Math.round(threshold * 1.15);
  }
  return { xp: xpTotal, level };
}

/**
 * checkInStreak — racha final (últimos días)
 */
function calcStreak(dailyCheckIn) {
  let streak = 0;
  for (let d = 89; d >= 0; d--) {
    if (dailyCheckIn[dateStr(d)]) streak++;
    else break;
  }
  return streak;
}

/** Biblioteca — libros y habilidades */
function buildBiblioteca() {
  return [
    { id: uid(), tipo: 'libro',      titulo: 'Atomic Habits',         autor: 'James Clear',        xp: 30, currentPage: 320, totalPages: 320, readPct: 100, status: 'terminado', deleted: false },
    { id: uid(), tipo: 'libro',      titulo: 'Deep Work',             autor: 'Cal Newport',        xp: 30, currentPage: 180, totalPages: 296, readPct: 61,  status: 'proceso',   deleted: false },
    { id: uid(), tipo: 'libro',      titulo: 'The Design of Everyday Things', autor: 'Don Norman', xp: 30, currentPage: 90,  totalPages: 368, readPct: 24,  status: 'proceso',   deleted: false },
    { id: uid(), tipo: 'habilidad',  titulo: 'Figma avanzado',        autor: '',                   xp: 20, currentPage: 0,   totalPages: 0,   readPct: 100, status: 'terminado', deleted: false },
    { id: uid(), tipo: 'habilidad',  titulo: 'After Effects básico',  autor: '',                   xp: 20, currentPage: 0,   totalPages: 0,   readPct: 60,  status: 'proceso',   deleted: false },
    { id: uid(), tipo: 'habilidad',  titulo: 'Framer Motion',         autor: '',                   xp: 20, currentPage: 0,   totalPages: 0,   readPct: 35,  status: 'proceso',   deleted: false },
  ];
}

/** Bitácora — victorias y lecciones de 30 entradas */
function buildBitacora() {
  const entries = [
    // Mes 1 — irregular, aprendiendo
    { d:  3,  v: 'Terminé el logo del primer cliente del año', l: 'No empezar proyectos sin brief escrito' },
    { d:  8,  v: 'Fui al gym 3 días seguidos', l: 'La consistencia es más valiosa que la intensidad' },
    { d: 12,  v: 'Cobré mi primera factura del año a tiempo', l: 'Poner fecha de pago en el contrato siempre' },
    { d: 17,  v: 'Leí Atomic Habits completo', l: 'Los sistemas ganan a la motivación' },
    { d: 23,  v: 'Entregué el proyecto de redes sin correcciones', l: 'El tiempo en briefing ahorra tiempo en revisiones' },
    { d: 29,  v: 'Primer mes en Life OS completado', l: 'El tracking cambia la percepción de mis hábitos' },
    // Mes 2 — más constante
    { d: 32,  v: 'Conseguí cliente nuevo por referido', l: 'Hacer buen trabajo es la mejor estrategia de marketing' },
    { d: 37,  v: 'Semana perfecta: gym 4 días + lectura diaria', l: 'Las mañanas sin teléfono cambian el día entero' },
    { d: 43,  v: 'Entregué landing page 2 días antes', l: 'Calcular el doble de tiempo necesario para proyectos' },
    { d: 48,  v: 'Organicé mis finanzas del mes', l: 'Los gastos hormiga suman más de lo que parecen' },
    { d: 53,  v: 'Avancé 40% del prototipo side project', l: 'Dedicar 1h diaria fija a proyectos propios' },
    { d: 58,  v: 'Racha de 21 días en app', l: 'El momentum se construye sin que lo notes' },
    // Mes 3 — el mejor
    { d: 62,  v: 'Firmé contrato más grande hasta ahora ($7,500)', l: 'Cobrar según valor entregado, no por hora' },
    { d: 67,  v: 'Semana L-J perfecta en todos los hábitos', l: 'El patrón L-J fuerte / fin semana libre funciona para mí' },
    { d: 71,  v: 'Side project tiene primera visita orgánica', l: 'Publicar antes de que esté perfecto' },
    { d: 76,  v: 'Ahorré por primera vez en el año', l: 'Pagar primero a uno mismo antes de gastar' },
    { d: 80,  v: 'Terminé de leer Deep Work a la mitad', l: 'El trabajo profundo es una habilidad que se entrena' },
    { d: 85,  v: 'Cero gastos de entretenimiento impulsivo esta semana', l: 'La abundancia no significa gastar más' },
    { d: 88,  v: 'Cerré el mejor mes financiero de mi vida hasta ahora', l: 'Los sistemas que implementé en enero me trajeron aquí' },
  ];
  return entries.map(({ d, v, l }) => ({
    id:       uid(),
    fecha:    dateStr(d),
    victoria: v,
    leccion:  l,
    deleted:  false,
  }));
}

/** Metas */
function buildGoals() {
  return [
    {
      id:        uid(),
      title:     'Ingresos freelance $25,000/mes',
      desc:      'Llegar a 25k MXN mensuales consistentes de diseño',
      category:  'finanzas',
      objectives: [
        { id: uid(), text: 'Actualizar portafolio con 3 proyectos nuevos', done: true,  dueDate: dateStr(30) },
        { id: uid(), text: 'Contactar 10 clientes potenciales',             done: true,  dueDate: dateStr(45) },
        { id: uid(), text: 'Subir tarifas un 20%',                         done: false, dueDate: dateStr(90) },
        { id: uid(), text: 'Tener 3 clientes recurrentes',                 done: false, dueDate: dateStr(90) },
      ],
      createdAt: dateStr(0),
      dueDate:   dateStr(90),
      deleted:   false,
    },
    {
      id:        uid(),
      title:     'Lanzar side project de diseño',
      desc:      'Plataforma de recursos de diseño para freelancers LATAM',
      category:  'carrera',
      objectives: [
        { id: uid(), text: 'Definir propuesta de valor',           done: true,  dueDate: dateStr(20) },
        { id: uid(), text: 'Diseñar landing page',                 done: true,  dueDate: dateStr(50) },
        { id: uid(), text: 'Publicar versión beta',                done: false, dueDate: dateStr(80) },
        { id: uid(), text: 'Conseguir primeros 100 usuarios',      done: false, dueDate: dateStr(90) },
      ],
      createdAt: dateStr(5),
      dueDate:   dateStr(90),
      deleted:   false,
    },
    {
      id:        uid(),
      title:     'Bajar 6 kg para abril',
      desc:      'De 78 a 72 kg, composición corporal mejorada',
      category:  'salud',
      objectives: [
        { id: uid(), text: 'Ir al gym mínimo 4 veces por semana', done: false, dueDate: dateStr(90) },
        { id: uid(), text: 'Registrar comida 3 semanas seguidas', done: true,  dueDate: dateStr(60) },
        { id: uid(), text: 'Eliminar comida chatarra entre semana',done: false, dueDate: dateStr(75) },
      ],
      createdAt: dateStr(0),
      dueDate:   dateStr(90),
      deleted:   false,
    },
  ];
}

/** Ideas rápidas */
function buildIdeas() {
  const ideaTexts = [
    'App para calcular tarifas freelance según mercado LATAM',
    'Comunidad Discord para diseñadores mexicanos',
    'Newsletter semanal de recursos de diseño',
    'Plantilla Notion para gestión de proyectos freelance',
    'Curso online de Figma para principiantes',
    'Plugin Figma para generar paletas desde fotos',
    'Template kit de identidad visual para startups',
    'Bot de Telegram para recordar check-ins',
    'Guía de cobro para freelancers México',
  ];
  return ideaTexts.map((text, i) => ({
    id:   uid(),
    text: text,
    date: dateStr(i * 9),
  }));
}

/** gymDays */
function buildGymDays(habits) {
  const gymHabit = habits.find(h => h.name.includes('Entrenar'));
  if (!gymHabit) return {};
  return gymHabit.history.reduce((acc, date) => { acc[date] = 1; return acc; }, {});
}

/** healthStats del día final */
function buildHealthStats() {
  return {
    proteina:         true,
    comida:           true,
    suplementos:      false,
    desayuno:         true,
    cena:             true,
    sueno:            7.5,
    suenoRegistrado:  true,
    pasos:            true,
    movilidad:        true,
    pausas:           false,
    lastDate:         dateStr(89),
  };
}

/** muscleMap — bien entrenado con puntos débiles en abdomen y glúteos */
function buildMuscleMap() {
  return {
    pecho:   72,
    espalda: 83,
    piernas: 68,
    hombros: 75,
    biceps:  78,
    triceps: 71,
    abdomen: 38,
    gluteos: 31,
  };
}

/** Calendario — eventos de 90 días */
function buildCalEvents() {
  const events = {};
  const addEv = (d, text, time = '') => {
    const date = dateStr(d);
    if (!events[date]) events[date] = [];
    events[date].push({ id: uid(), text, time });
  };

  addEv(0,  'Kick-off proyectos 2026', '09:00');
  addEv(4,  'Entrega logo cliente',    '17:00');
  addEv(10, 'Examen parcial algoritmos','08:00');
  addEv(18, 'Call cliente redes',      '11:00');
  addEv(25, 'Revisión finanzas enero', '');
  addEv(32, 'Inicio proyecto landing', '09:00');
  addEv(45, 'Presentación branding',   '15:00');
  addEv(53, 'Examen final sistemas',   '08:00');
  addEv(62, 'Firma contrato UI/UX',    '12:00');
  addEv(70, 'Launch beta side project','');
  addEv(76, 'Cita médica anual',       '10:30');
  addEv(83, 'Entrega manual de marca', '17:00');
  addEv(88, 'Revisión Q1 finanzas',    '');

  return events;
}

/** Calibración diaria del día 89 */
const CALIBRACION = { claridad: 82, energia: 78, productividad: 75, lastCalibDate: dateStr(89) };

// ══════════════════════════════════════════════════════════════════════════════
//  CONSTRUIR PAYLOAD COMPLETO
// ══════════════════════════════════════════════════════════════════════════════
async function buildPayload() {
  console.log('🔧  Construyendo datos (90 días)...');

  const habits       = HABITS_DEF.map(buildHabit);
  const dailyCheckIn = buildDailyCheckIn();
  const xpHistory    = buildXpHistory(habits, dailyCheckIn);
  const { xp, level }= calcXpAndLevel(xpHistory);
  const streak       = calcStreak(dailyCheckIn);
  const txs          = buildTransactions();
  const tasks        = buildTasks();
  const goals        = buildGoals();
  const biblioteca   = buildBiblioteca();
  const bitacora     = buildBitacora();
  const ideas        = buildIdeas();
  const gymDays      = buildGymDays(habits);
  const calEvents    = buildCalEvents();
  const muscleMap    = buildMuscleMap();
  const healthStats  = buildHealthStats();

  const xpMental     = biblioteca.filter(b => b.status === 'terminado').length * 30
                     + biblioteca.filter(b => b.status === 'proceso').length   * 10;

  const geminoPotenciado = {
    activado:          true,
    fechaActivacion:   ts(0).toISOString(),
    diasObservacion:   30,
    analisisGenerado:  true,
  };

  const payload = {
    // ── Core ──
    userName:             DEMO.name,
    xp,
    level,
    coins:                12,
    dark:                 true,
    accent:               '#00e5ff',

    // ── Actividad ──
    tasks,
    habits,
    routines:             [],
    gymDays,
    calEvents,
    ideas,

    // ── Finanzas ──
    transactions:         txs,
    debts:                [],
    cards:                [],
    goals,
    completedGoals:       [],
    saldos:               [],

    // ── Salud ──
    healthStats,
    saludXP:              240,
    muscleMap,
    muscleLastUpdate:     ts(89, 8).getTime(),

    // ── Check-in ──
    dailyCheckIn,
    checkInStreak:        streak,

    // ── Calibración ──
    ...CALIBRACION,

    // ── Poder estratégico ──
    biblioteca,
    xpMental,
    bitacora,
    aliados:              [],
    aliadosUids:          [],
    poderUsage:           { biblioteca: 18, bitacora: 12, aliados: 0 },

    // ── XP History ──
    xpHistory,

    // ── Gamificación ──
    xpHistory,
    pomoMinutos:          25,
    pomoSesiones:         38,

    // ── Onboarding ──
    primeraSesion:              false,
    onboardingDone:             true,
    onboardingGemeloCompletado: true,

    // ── Gemelo ──
    gemelo: {
      state:       'activated',
      startDate:   dateStr(0),
      dataPoints:  95,
      lastAnalysis: null,
      survivalTasks:{},
      consentDate: ts(0).toISOString(),
    },
    geminoPotenciado,

    // ── Social ──
    socialPlans:          [],
    socialPlanXPBonus:    0,
    friendRequests:       [],

    // ── Misc ──
    modoRecuperacion:     false,
    modoRecuperacionFecha:'',
    blackoutOverrideToday:'',
    bubbleColor:          '',
    bubbleEmoji:          '',
    claudeApiKey:         '',
    unlockedRooms:        ['starter_basic', 'starter_soft'],
    equippedRoom:         'starter_basic',
    agencyTab0:           [],
    agencyTab1:           [],
    agencyTab2:           [],

    _updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  return payload;
}

// ══════════════════════════════════════════════════════════════════════════════
//  SYSTEM PROMPT DEL GEMELO (COPIADO EXACTO DE functions/index.js línea 511)
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

// ══════════════════════════════════════════════════════════════════════════════
//  construirUserPrompt — igual que en functions/index.js pero con los datos del seed
// ══════════════════════════════════════════════════════════════════════════════
function construirUserPrompt(raw) {
  const nombre    = (raw.userName || 'el usuario').split(' ')[0];
  const nivel     = raw.level        || 1;
  const xpTotal   = raw.xp           || 0;
  const racha     = raw.checkInStreak || 0;

  // Ventana: primeros 30 días (el Gemelo analiza la observación de 30 días)
  const base30 = new Date(BASE_DATE);
  const ventana30 = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(base30);
    d.setDate(base30.getDate() + i);
    ventana30.push(d.toISOString().split('T')[0]);
  }
  const xpHist    = raw.xpHistory || {};
  const diasActivos = ventana30.filter(f => (xpHist[f] || 0) > 0).length;

  const huecos = [];
  let bloqueActual = 0, inicioBloque = null;
  ventana30.forEach(f => {
    if ((xpHist[f] || 0) === 0) {
      bloqueActual++;
      if (!inicioBloque) inicioBloque = f;
    } else {
      if (bloqueActual >= 3) huecos.push(`${bloqueActual} días sin actividad (desde ${inicioBloque})`);
      bloqueActual = 0; inicioBloque = null;
    }
  });
  if (bloqueActual >= 3) huecos.push(`${bloqueActual} días sin actividad (desde ${inicioBloque})`);
  const huecosTexto = huecos.length > 0 ? huecos.slice(0, 3).join(' | ') : 'sin ausencias significativas';

  const xpPorSemana = [];
  for (let s = 0; s < 4; s++) {
    let xpS = 0;
    for (let d = 0; d < 7; d++) { const idx = s * 7 + d; if (ventana30[idx]) xpS += (xpHist[ventana30[idx]] || 0); }
    xpPorSemana.push(xpS);
  }
  const tendenciaXP = xpPorSemana[3] > xpPorSemana[0] ? 'en ascenso ↑' : xpPorSemana[3] < xpPorSemana[0] ? 'en descenso ↓' : 'estable →';

  const habits = raw.habits || [];
  const habitosFuertes = habits.filter(h => (h.streak || 0) >= 7 || (h.battery || 0) >= 70)
    .map(h => `${h.name} (racha ${h.streak || 0}d, batería ${h.battery || 0}%)`).slice(0, 5);
  const habitosDebiles = habits.filter(h => (h.streak || 0) < 3 && (h.battery || 0) < 40)
    .map(h => `${h.name} (racha ${h.streak || 0}d)`).slice(0, 5);
  const habitosMedios  = habits.filter(h => (h.streak || 0) >= 3 && (h.streak || 0) < 7).map(h => h.name).slice(0, 4);

  const tasks  = raw.tasks  || [];
  const goals  = raw.goals  || [];
  const ideas  = (raw.ideas || []).length;
  const doneT  = tasks.filter(t => t.done).length;
  const totalT = tasks.length;
  const compRate = totalT > 0 ? Math.round((doneT / totalT) * 100) : 0;

  const pendientesPorCat = {};
  tasks.filter(t => !t.done).forEach(t => {
    const cat = t.categoria || 'sin categoría';
    pendientesPorCat[cat] = (pendientesPorCat[cat] || 0) + 1;
  });
  const topCatsPendientes = Object.entries(pendientesPorCat).sort(([,a],[,b]) => b - a).slice(0, 3).map(([c, n]) => `${c} (${n})`).join(', ') || 'ninguna';

  const metasTexto = goals.length > 0
    ? goals.slice(0, 4).map(g => {
        const kw = (g.title || '').split(' ')[0].toLowerCase();
        const rel = kw.length > 2 ? tasks.filter(t => (t.name || '').toLowerCase().includes(kw)) : [];
        const avance = rel.length > 0 ? Math.round(rel.filter(t => t.done).length / rel.length * 100) : '?';
        return `"${g.title}" → ${avance}% ejecución real`;
      }).join(' | ')
    : 'ninguna meta registrada';

  const friccion = ideas > 0 && totalT > 0
    ? `${ideas} ideas capturadas, ${doneT}/${totalT} tareas completadas (${compRate}%). Ratio idea/acción: ${(ideas / Math.max(doneT, 1)).toFixed(1)}x`
    : `${doneT}/${totalT} tareas completadas (${compRate}%)`;

  const txs        = raw.transactions || [];
  const gastos     = txs.filter(t => t.type === 'salida');
  const totalGasto = gastos.reduce((s, t) => s + (t.amount || 0), 0);
  const totalIngreso = txs.filter(t => t.type === 'entrada').reduce((s, t) => s + (t.amount || 0), 0);
  const gastosPorCat = {};
  gastos.forEach(t => { const c = t.category || 'otros'; gastosPorCat[c] = (gastosPorCat[c] || 0) + (t.amount || 0); });
  const topFugas = Object.entries(gastosPorCat).sort(([,a],[,b]) => b - a).slice(0, 3).map(([c, m]) => `${c}: $${m.toLocaleString('es-MX')}`).join(', ');
  const balancePct = totalIngreso > 0 ? Math.round((totalGasto / totalIngreso) * 100) : null;
  const finanzasTexto = totalIngreso > 0 || totalGasto > 0
    ? `Ingresos $${totalIngreso.toLocaleString('es-MX')} vs Gastos $${totalGasto.toLocaleString('es-MX')}`
      + (balancePct !== null ? ` (gasta el ${balancePct}% de lo que entra)` : '')
      + (topFugas ? `. Categorías con más salida: ${topFugas}` : '')
    : 'sin transacciones registradas';

  const energia       = raw.energia       || 0;
  const claridad      = raw.claridad      || 0;
  const productividad = raw.productividad || 0;
  const hs            = raw.healthStats   || {};
  const energiaTexto  = `Energía ${energia}/100 | Claridad ${claridad}/100 | Productividad ${productividad}/100`
    + (hs.sueno ? ` | Sueño: ${hs.sueno}h` : '');

  const muscleMap  = raw.muscleMap || {};
  const muscleVals = Object.values(muscleMap).filter(v => typeof v === 'number');
  const promMuscular = muscleVals.length ? Math.round(muscleVals.reduce((s, v) => s + v, 0) / muscleVals.length) : null;
  const gruposDebiles = Object.entries(muscleMap).filter(([,v]) => v < 40).map(([g]) => g).slice(0, 3);
  const fisicaTexto = promMuscular !== null
    ? `Recuperación muscular promedio: ${promMuscular}%` + (gruposDebiles.length ? ` (grupos descuidados: ${gruposDebiles.join(', ')})` : '')
    : 'sin datos físicos';

  const bitacora   = raw.bitacora   || [];
  const biblioteca = raw.biblioteca || [];
  const victorias  = bitacora.slice(0, 6).map(b => b.victoria).filter(Boolean);
  const libros     = biblioteca.filter(b => b.tipo === 'libro').map(b => b.titulo).slice(0, 3);
  const skills     = biblioteca.filter(b => b.tipo === 'habilidad').map(b => b.titulo).slice(0, 3);
  const poderTexto = [
    victorias.length > 0 ? `Victorias registradas: ${victorias.join(' / ')}` : null,
    libros.length > 0    ? `Leyendo: ${libros.join(', ')}` : null,
    skills.length > 0    ? `Habilidades: ${skills.join(', ')}` : null,
  ].filter(Boolean).join(' | ') || 'sin datos de crecimiento';

  return `
[DATOS CONDUCTUALES DE ${nombre.toUpperCase()} — VENTANA: PRIMEROS 30 DÍAS DE OBSERVACIÓN]
(Interpreta como patrones de comportamiento humano, no como estadísticas.)

▸ IDENTIDAD Y PROGRESIÓN
Nombre: ${nombre} | Nivel ${nivel} | ${xpTotal.toLocaleString('es-MX')} XP acumulado
Tendencia 4 semanas: ${tendenciaXP} (semana 1→4: ${xpPorSemana.map(x => x.toLocaleString('es-MX')).join(' / ')} XP)

▸ CONSISTENCIA OPERATIVA
Días activos: ${diasActivos}/30 | Racha de check-in: ${racha} días consecutivos
Huecos de abandono: ${huecosTexto}

▸ HÁBITOS
Pilares sólidos (racha ≥7d o batería ≥70%): ${habitosFuertes.join(', ') || 'ninguno aún'}
En construcción (racha 3–6d): ${habitosMedios.join(', ') || 'ninguno'}
Hábitos fracturados (racha <3d y batería <40%): ${habitosDebiles.join(', ') || 'ninguno — todos estables'}
Total activos: ${habits.length}

▸ TAREAS Y METAS
Ejecución: ${doneT}/${totalT} tareas completadas (${compRate}%)
Categorías con más pendientes: ${topCatsPendientes}
Metas declaradas vs. avance real: ${metasTexto}
Fricción ideas → acción: ${friccion}

▸ SALUD Y CUERPO
${fisicaTexto}

▸ CICLOS DE ENERGÍA Y RENDIMIENTO
${energiaTexto}

▸ COMPORTAMIENTO FINANCIERO
${finanzasTexto}

▸ PODER ESTRATÉGICO Y RED
${poderTexto}

[FIN DE DATOS]

Genera el JSON con las claves "gancho_intriga" y "analisis_profundo" siguiendo todas las reglas del system prompt.`.trim();
}

// ══════════════════════════════════════════════════════════════════════════════
//  LLAMADA A GEMINI
// ══════════════════════════════════════════════════════════════════════════════
async function callGemini(userPrompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('\n⚠️  GEMINI_API_KEY no definida. Saltando llamada a Gemini.');
    console.log('\n──── USER PROMPT para Gemini (copia esto si quieres el análisis) ────');
    console.log(userPrompt);
    console.log('────────────────────────────────────────────────────────────────────\n');
    return null;
  }

  try {
    const { GoogleGenerativeAI } = require(path.join(__dirname, '../functions/node_modules/@google/generative-ai'));
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash-latest',
      systemInstruction: GEMELO_SYSTEM_PROMPT,
      generationConfig: {
        temperature:      0.85,
        topP:             0.95,
        maxOutputTokens:  2048,
        responseMimeType: 'application/json',
      },
    });
    console.log('🤖  Llamando a Gemini (modelo: gemini-1.5-flash-latest)...');
    const result  = await model.generateContent(userPrompt);
    let   rawText = result.response.text().trim();
    rawText = rawText.replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/```\s*$/i,'').trim();
    const firstBrace = rawText.indexOf('{');
    const lastBrace  = rawText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) rawText = rawText.slice(firstBrace, lastBrace + 1);
    const parsed = JSON.parse(rawText);
    if (!parsed.gancho_intriga || !parsed.analisis_profundo) throw new Error('JSON sin claves requeridas');
    return parsed;
  } catch(e) {
    console.error('❌  Error llamando a Gemini:', e.message);
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN
// ══════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log('🚀  seedDemoUser.js — Life OS Demo User Seed');
  console.log('════════════════════════════════════════════\n');

  // ── 1. Crear o recuperar usuario Firebase Auth ──
  let demoUser;
  try {
    demoUser = await auth.getUserByEmail(DEMO.email);
    console.log(`✅  Usuario ya existe: ${demoUser.uid}`);
  } catch(e) {
    if (e.code === 'auth/user-not-found') {
      demoUser = await auth.createUser({
        email:        DEMO.email,
        password:     DEMO.password,
        displayName:  DEMO.name,
        emailVerified:true,
      });
      console.log(`✅  Usuario creado: ${demoUser.uid}`);
    } else {
      throw e;
    }
  }
  DEMO.uid = demoUser.uid;

  // ── 2. Escribir documento raíz users/{uid} ──
  await db.collection('users').doc(DEMO.uid).set({
    displayName:    DEMO.name,
    email:          DEMO.email,
    is_pro:         true,
    role:           'premium',
    plan:           'pro',
    createdAt:      admin.firestore.Timestamp.fromDate(BASE_DATE),
    updatedAt:      admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  console.log('✅  Documento raíz users/{uid} — OK');

  // ── 3. Construir y escribir datos principales ──
  const payload = await buildPayload();
  await db.collection('users').doc(DEMO.uid).collection('data').doc('main').set(payload);
  console.log('✅  users/{uid}/data/main — OK');

  // Log de conteos
  console.log(`   📊  Tasks:        ${payload.tasks.length}`);
  console.log(`   💪  Habits:       ${payload.habits.length}`);
  console.log(`   💸  Transactions: ${payload.transactions.length}`);
  console.log(`   🎯  Goals:        ${payload.goals.length}`);
  console.log(`   📚  Biblioteca:   ${payload.biblioteca.length}`);
  console.log(`   📓  Bitácora:     ${payload.bitacora.length}`);
  console.log(`   💡  Ideas:        ${payload.ideas.length}`);
  console.log(`   📅  CheckIn days: ${Object.keys(payload.dailyCheckIn).length}`);
  console.log(`   📈  XP History:   ${Object.keys(payload.xpHistory).length} días`);
  console.log(`   ⭐  Level ${payload.level} · ${payload.xp.toLocaleString('es-MX')} XP`);
  console.log(`   🔥  Streak: ${payload.checkInStreak} días`);

  // ── 4. Generar análisis del Gemelo con Gemini ──
  console.log('\n🔮  Generando análisis del Gemelo Potenciado...');
  const userPrompt = construirUserPrompt(payload);
  const geminiResult = await callGemini(userPrompt);

  if (geminiResult) {
    await db.collection('gemelo_data').doc(DEMO.uid).set({
      analysis_ready:    true,
      analysis_text:     JSON.stringify(geminiResult),
      gancho_intriga:    geminiResult.gancho_intriga,
      analisis_profundo: geminiResult.analisis_profundo,
      generated_at:      admin.firestore.FieldValue.serverTimestamp(),
      observation_days:  30,
      model:             'gemini-1.5-flash-latest',
    });
    console.log('✅  gemelo_data/{uid} — Análisis guardado');
    console.log(`\n   🎯  GANCHO: "${geminiResult.gancho_intriga}"`);
    console.log('\n   📄  ANÁLISIS (primeras 300 chars):');
    console.log('   ' + geminiResult.analisis_profundo.substring(0, 300) + '...\n');
  } else {
    // Guardar estado "listo para generarse" sin análisis
    await db.collection('gemelo_data').doc(DEMO.uid).set({
      analysis_ready:    false,
      observation_days:  30,
    }, { merge: true });
    console.log('ℹ️   gemelo_data/{uid} — Marcado como pendiente (sin GEMINI_API_KEY)');
  }

  // ── 5. Actualizar estado S.gemelo en main ──
  await db.collection('users').doc(DEMO.uid).collection('data').doc('main').update({
    'gemelo.state': geminiResult ? 'activated' : 'ready',
    'gemelo.dataPoints': 30,
    'geminoPotenciado.analisisGenerado': geminiResult ? true : false,
  });

  console.log('\n════════════════════════════════════════════');
  console.log('✅  SEED COMPLETADO');
  console.log('════════════════════════════════════════════');
  console.log(`📧  Email:    ${DEMO.email}`);
  console.log(`🔑  Password: ${DEMO.password}`);
  console.log(`👤  UID:      ${DEMO.uid}`);
  console.log(`🏆  Rol:      premium`);
  console.log(`📅  Período:  9 ene 2026 → 9 abr 2026 (90 días)`);
  console.log('════════════════════════════════════════════\n');

  process.exit(0);
}

main().catch(e => {
  console.error('💥  Error fatal:', e);
  process.exit(1);
});
