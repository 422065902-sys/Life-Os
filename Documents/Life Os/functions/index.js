/**
 * ═══════════════════════════════════════════════════════════════
 *  LIFE OS — Firebase Cloud Functions
 *  Node.js 18 · Firebase Admin SDK v11+ · Stripe
 * ═══════════════════════════════════════════════════════════════
 *
 *  Variables de entorno requeridas (configúralas con estos comandos):
 *
 *  firebase functions:config:set stripe.secret="sk_live_XXXXXXXX"
 *  firebase functions:config:set stripe.webhook_secret="whsec_XXXXXXXX"
 *
 *  Para obtener los valores:
 *  - stripe.secret         → Stripe Dashboard → Developers → API keys → Secret key
 *  - stripe.webhook_secret → Stripe Dashboard → Developers → Webhooks → Signing secret
 *
 *  Desplegar:
 *  firebase deploy --only functions
 * ═══════════════════════════════════════════════════════════════
 */

const functions  = require('firebase-functions');
const admin      = require('firebase-admin');
const stripe     = require('stripe');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Inicializar Admin SDK (singleton)
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

// ── Helpers para leer config de entorno ──
const stripeSecretKey    = () => functions.config().stripe?.secret      || process.env.STRIPE_SECRET;
const stripeWebhookSecret = () => functions.config().stripe?.webhook_secret || process.env.STRIPE_WEBHOOK_SECRET;
const geminiApiKey       = () => functions.config().gemini?.api_key     || process.env.GEMINI_API_KEY;

/* ═══════════════════════════════════════════════════════════════
   MÓDULO 1 — STRIPE PAGOS
═══════════════════════════════════════════════════════════════ */

/**
 * createStripeCheckoutSession
 * HTTPS Callable — llamada desde el cliente con _functions.httpsCallable('createStripeCheckoutSession')
 * Recibe: { priceId: string }
 * Retorna: { sessionId: string, url: string }
 */
exports.createStripeCheckoutSession = functions.https.onCall(async (data, context) => {
  // Verificar autenticación
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Debes iniciar sesión para continuar.');
  }

  const uid     = context.auth.uid;
  const priceId = data.priceId;

  if (!priceId) {
    throw new functions.https.HttpsError('invalid-argument', 'Se requiere el priceId del plan.');
  }

  const stripeClient = stripe(stripeSecretKey());

  try {
    // Leer o crear stripe_customer_id del usuario
    const userDocRef = db.collection('users').doc(uid);
    const userSnap   = await userDocRef.get();
    const userData   = userSnap.exists ? userSnap.data() : {};

    let customerId = userData.stripe_customer_id || '';

    if (!customerId) {
      // Crear nuevo cliente en Stripe
      const customer = await stripeClient.customers.create({
        email:    context.auth.token.email || userData.email || '',
        metadata: { firebaseUID: uid },
      });
      customerId = customer.id;
      // Guardar stripe_customer_id en Firestore (sin sobreescribir otros campos)
      await userDocRef.update({ stripe_customer_id: customerId });
    }

    // Crear sesión de Checkout
    const session = await stripeClient.checkout.sessions.create({
      customer:   customerId,
      mode:       'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      // URL de regreso — ajusta el dominio cuando despliegues
      success_url: 'https://life-os-prod-3a590.web.app/?pago=exitoso',
      cancel_url:  'https://life-os-prod-3a590.web.app/?pago=cancelado',
      metadata:    { firebaseUID: uid },
    });

    return { sessionId: session.id, url: session.url };

  } catch(e) {
    console.error('[Life OS] createStripeCheckoutSession error:', e);
    throw new functions.https.HttpsError('internal', 'Error al crear sesión de pago. Intenta de nuevo.');
  }
});

/**
 * stripeWebhook
 * HTTPS Function (NO callable) — configurar URL en Stripe Dashboard → Webhooks
 * URL del endpoint: https://REGION-TU_PROYECTO.cloudfunctions.net/stripeWebhook
 * Eventos a escuchar: checkout.session.completed, customer.subscription.deleted
 */
exports.stripeWebhook = functions.https.onRequest(async (req, res) => {
  const sig     = req.headers['stripe-signature'];
  const secret  = stripeWebhookSecret();
  const stripeClient = stripe(stripeSecretKey());
  let event;

  // Validar firma del webhook para evitar llamadas falsas
  try {
    event = stripeClient.webhooks.constructEvent(req.rawBody, sig, secret);
  } catch(e) {
    console.error('[Life OS] stripeWebhook firma inválida:', e.message);
    return res.status(400).send('Webhook signature verification failed.');
  }

  try {
    // ── Pago exitoso: activar Pro ──
    if (event.type === 'checkout.session.completed') {
      const session  = event.data.object;
      const uid      = session.metadata?.firebaseUID;
      if (uid) {
        // Usar .update() para NO sobreescribir datos de productividad del usuario
        await db.collection('users').doc(uid).update({
          is_pro:       true,
          role:         'premium',
          hasEverPaid:  true,   // Protege al usuario de purgas futuras aunque expire la suscripción
        });
        console.info('[Life OS] Usuario activado como Pro:', uid);
      }
    }

    // ── Suscripción cancelada o fallida: revocar Pro ──
    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      const customerId   = subscription.customer;
      // Buscar usuario por stripe_customer_id
      const snap = await db.collection('users')
        .where('stripe_customer_id', '==', customerId)
        .limit(1)
        .get();
      if (!snap.empty) {
        const uid = snap.docs[0].id;
        await db.collection('users').doc(uid).update({
          is_pro: false,
          role:   'free',
        });
        console.info('[Life OS] Plan Pro revocado para usuario:', uid);
      }
    }

  } catch(e) {
    console.error('[Life OS] stripeWebhook error procesando evento:', e);
  }

  // Siempre responder 200 para que Stripe no reintente
  res.json({ received: true });
});

/* ═══════════════════════════════════════════════════════════════
   MÓDULO 2 — GEMELO POTENCIADO (Anti-Bypass)
═══════════════════════════════════════════════════════════════ */

/**
 * getGemelo
 * HTTPS Callable — nunca expone analysis_text si el usuario no tiene acceso
 * Retorna:
 *   { status: 'ok',     data: analysis_text }             — Pro o trial activo
 *   { status: 'locked', trigger: 'paywall', message: '...' } — trial expirado
 */
exports.getGemelo = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Debes iniciar sesión para continuar.');
  }

  const uid = context.auth.uid;

  try {
    // Verificar acceso del usuario
    const userSnap = await db.collection('users').doc(uid).get();
    const userData = userSnap.exists ? userSnap.data() : {};

    const isPro     = userData.is_pro === true || userData.role === 'premium' || userData.role === 'admin';
    let   trialOk   = false;

    if (!isPro && userData.trial_ends_at) {
      const trialEnd = userData.trial_ends_at.toDate();
      trialOk = trialEnd > new Date();
    }

    // Sin acceso: devolver mensaje de paywall (SIN el analysis_text)
    if (!isPro && !trialOk) {
      return {
        status:  'locked',
        trigger: 'paywall',
        message: 'Tu gemelo tiene revelaciones listas. Activa Life OS Pro para desbloquearlas.',
      };
    }

    // Con acceso: leer análisis del documento gemelo_data/{uid}
    const gemeloSnap = await db.collection('gemelo_data').doc(uid).get();
    if (!gemeloSnap.exists) {
      return { status: 'ok', data: null, analysis_ready: false };
    }

    const gemeloData = gemeloSnap.data();
    if (!gemeloData.analysis_ready) {
      return {
        status:           'ok',
        data:             null,
        analysis_ready:   false,
        observation_days: gemeloData.observation_days || 0,
        // gancho_intriga disponible aunque el análisis completo aún no exista
        // (se pre-genera en día 29 antes de que el usuario pague)
        gancho_intriga:   gemeloData.gancho_intriga || null,
      };
    }

    return {
      status:            'ok',
      data:              gemeloData.analysis_text,
      analysis_ready:    true,
      generated_at:      gemeloData.generated_at,
      observation_days:  gemeloData.observation_days || 30,
      gancho_intriga:    gemeloData.gancho_intriga   || null,
      analisis_profundo: gemeloData.analisis_profundo || null,
    };

  } catch(e) {
    console.error('[Life OS] getGemelo error:', e);
    throw new functions.https.HttpsError('internal', 'Error al obtener datos del Gemelo.');
  }
});

/**
 * construirUserPrompt
 * Deriva todas las métricas conductuales del documento raw de Firestore
 * users/{uid}/data/main y construye el User Message para Gemini.
 */
function construirUserPrompt(raw) {
  const nombre    = ((raw.userName || raw.nombre || 'el usuario').split(' ')[0]);
  const nivel     = raw.level        || 1;
  const xpTotal   = raw.xp           || 0;
  const xpSemanal = raw.xp_semanal   || 0;
  const racha     = raw.checkInStreak || 0;

  // ── Consistencia operativa (últimos 30 días) ──
  const hoy       = new Date();
  const xpHist    = raw.xpHistory || {};
  const ventana30 = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(hoy);
    d.setDate(hoy.getDate() - i);
    ventana30.unshift(d.toISOString().split('T')[0]);
  }
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
  const tendenciaXP = xpPorSemana[3] > xpPorSemana[0] ? 'en ascenso ↑'
    : xpPorSemana[3] < xpPorSemana[0] ? 'en descenso ↓' : 'estable →';

  // ── Hábitos ──
  const habits = raw.habits || [];
  const habitosFuertes = habits.filter(h => (h.streak || 0) >= 7 || (h.battery || 0) >= 70)
    .map(h => `${h.name} (racha ${h.streak || 0}d, batería ${h.battery || 0}%)`).slice(0, 5);
  const habitosDebiles = habits.filter(h => (h.streak || 0) < 3 && (h.battery || 0) < 40)
    .map(h => `${h.name} (racha ${h.streak || 0}d)`).slice(0, 5);
  const habitosMedios  = habits.filter(h => (h.streak || 0) >= 3 && (h.streak || 0) < 7)
    .map(h => h.name).slice(0, 4);

  // ── Tareas y metas ──
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
  const topCatsPendientes = Object.entries(pendientesPorCat)
    .sort(([,a],[,b]) => b - a).slice(0, 3).map(([c, n]) => `${c} (${n})`).join(', ') || 'ninguna';

  const metasTexto = goals.length > 0
    ? goals.slice(0, 4).map(g => {
        const kw = (g.title || g.name || '').split(' ')[0].toLowerCase();
        const rel = kw.length > 2 ? tasks.filter(t => (t.name || '').toLowerCase().includes(kw)) : [];
        const avance = rel.length > 0 ? Math.round(rel.filter(t => t.done).length / rel.length * 100) : '?';
        return `"${g.title || g.name}" → ${avance}% ejecución real`;
      }).join(' | ')
    : 'ninguna meta registrada';

  const friccion = ideas > 0 && totalT > 0
    ? `${ideas} ideas capturadas, ${doneT}/${totalT} tareas completadas (${compRate}%). Ratio idea/acción: ${(ideas / Math.max(doneT, 1)).toFixed(1)}x`
    : ideas > 0 ? `${ideas} ideas acumuladas sin tareas asociadas — fricción alta`
    : totalT > 0 ? `${doneT}/${totalT} tareas completadas (${compRate}%)`
    : 'datos insuficientes';

  // ── Finanzas ──
  const txs        = raw.transactions || [];
  const gastos     = txs.filter(t => t.type === 'salida');
  const totalGasto = gastos.reduce((s, t) => s + (t.amount || 0), 0);
  const totalIngreso = txs.filter(t => t.type === 'entrada').reduce((s, t) => s + (t.amount || 0), 0);
  const gastosPorCat = {};
  gastos.forEach(t => { const c = t.category || t.categoria || 'otros'; gastosPorCat[c] = (gastosPorCat[c] || 0) + (t.amount || 0); });
  const topFugas = Object.entries(gastosPorCat).sort(([,a],[,b]) => b - a).slice(0, 3)
    .map(([c, m]) => `${c}: $${m.toLocaleString('es-MX')}`).join(', ');
  const balancePct = totalIngreso > 0 ? Math.round((totalGasto / totalIngreso) * 100) : null;
  const finanzasTexto = totalIngreso > 0 || totalGasto > 0
    ? `Ingresos $${totalIngreso.toLocaleString('es-MX')} vs Gastos $${totalGasto.toLocaleString('es-MX')}`
      + (balancePct !== null ? ` (gasta el ${balancePct}% de lo que entra)` : '')
      + (topFugas ? `. Categorías con más salida: ${topFugas}` : '')
    : 'sin transacciones registradas';

  // ── Energía y salud ──
  const energia       = raw.energia       || 0;
  const claridad      = raw.claridad      || 0;
  const productividad = raw.productividad || 0;
  const pomoSesiones  = raw.pomoSesiones  || 0;
  const hs            = raw.healthStats   || {};
  const energiaTexto  = (energia + claridad + productividad) > 0
    ? `Energía ${energia}/100 | Claridad ${claridad}/100 | Productividad ${productividad}/100`
      + (pomoSesiones > 0 ? ` | ${pomoSesiones} sesiones Pomodoro` : '')
      + (hs.sueno ? ` | Sueño: ${hs.sueno}h` : '')
      + (hs.pasos ? ` | Pasos: ${hs.pasos}` : '')
    : pomoSesiones > 0 ? `${pomoSesiones} sesiones Pomodoro; sin datos de energía subjetiva`
    : 'sin datos de ciclos de energía';

  // ── Cuerpo ──
  const muscleMap  = raw.muscleMap || {};
  const muscleVals = Object.values(muscleMap).filter(v => typeof v === 'number');
  const promMuscular = muscleVals.length > 0
    ? Math.round(muscleVals.reduce((s, v) => s + v, 0) / muscleVals.length) : null;
  const gruposDebiles = Object.entries(muscleMap).filter(([,v]) => v < 30).map(([g]) => g).slice(0, 3);
  const fisicaTexto = promMuscular !== null
    ? `Recuperación muscular promedio: ${promMuscular}%`
      + (gruposDebiles.length > 0 ? ` (grupos descuidados: ${gruposDebiles.join(', ')})` : '')
      + (hs.sueno ? ` | Sueño: ${hs.sueno}h` : '') + (hs.pasos ? ` | Pasos: ${hs.pasos}` : '')
    : 'sin datos físicos registrados';

  // ── Poder estratégico ──
  const bitacora   = raw.bitacora   || [];
  const biblioteca = raw.biblioteca || [];
  const aliados    = (raw.aliados   || []).length;
  const victorias  = bitacora.slice(-3).map(b => b.victoria || '').filter(Boolean);
  const libros     = biblioteca.filter(b => b.tipo === 'libro').map(b => b.titulo).filter(Boolean).slice(0, 3);
  const skills     = biblioteca.filter(b => b.tipo === 'habilidad').map(b => b.titulo).filter(Boolean).slice(0, 3);
  const poderTexto = [
    victorias.length > 0  ? `Victorias recientes: ${victorias.join(' / ')}` : null,
    libros.length > 0     ? `Leyendo: ${libros.join(', ')}` : null,
    skills.length > 0     ? `Habilidades: ${skills.join(', ')}` : null,
    aliados > 0           ? `Red de aliados: ${aliados}` : null,
  ].filter(Boolean).join(' | ') || 'sin datos de crecimiento estratégico';

  // ── Planes sociales ──
  const socialPlans = (raw.socialPlans || []).filter(p => p.estado === 'activo');
  const socialTexto = socialPlans.length > 0
    ? `${socialPlans.length} plan(es) activos con otros: ${socialPlans.map(p => p.nombre).slice(0, 2).join(', ')}`
    : null;

  return `
[DATOS CONDUCTUALES DE ${nombre.toUpperCase()} — VENTANA: ÚLTIMOS 30 DÍAS]
(Interpreta como patrones de comportamiento humano, no como estadísticas.)

▸ IDENTIDAD Y PROGRESIÓN
Nombre: ${nombre} | Nivel ${nivel} | ${xpTotal.toLocaleString('es-MX')} XP acumulado | +${xpSemanal.toLocaleString('es-MX')} XP esta semana
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
${socialTexto ? `▸ COMPROMISOS SOCIALES\n${socialTexto}\n` : ''}${raw._analytics ? `▸ PATRONES DE USO (TELEMETRÍA)
Aperturas de app en 30 días: ${raw._analytics.totalAperturas}
Módulos más visitados: ${raw._analytics.modulosFrecuentes || 'sin datos'}
Total eventos registrados: ${raw._analytics.totalEventos}
` : ''}[FIN DE DATOS]

Genera el JSON con las claves "gancho_intriga" y "analisis_profundo" siguiendo todas las reglas del system prompt.`.trim();
}

/**
 * generateGemeloAnalysis
 * HTTPS Callable — genera el análisis del Gemelo Potenciado con Gemini
 * Lee datos del usuario, llama a Gemini, escribe resultado en gemelo_data/{uid}
 *
 * Config requerida:
 *   firebase functions:config:set gemini.api_key="AIzaSy..."
 *   (Obtén tu API key en https://aistudio.google.com/app/apikey)
 *
 * Retorna: { status: 'ok', generated: boolean } | { status: 'locked' }
 */
exports.generateGemeloAnalysis = functions
  .runWith({ timeoutSeconds: 120, memory: '512MB' })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Debes iniciar sesión.');
    }

    const uid = context.auth.uid;

    try {
      // ── 1. Verificar acceso ──
      const userSnap = await db.collection('users').doc(uid).get();
      const userData = userSnap.exists ? userSnap.data() : {};

      const isPro   = userData.is_pro === true || userData.role === 'premium' || userData.role === 'admin';
      let trialOk   = false;
      if (!isPro && userData.trial_ends_at) {
        trialOk = userData.trial_ends_at.toDate() > new Date();
      }

      if (!isPro && !trialOk) {
        return { status: 'locked', trigger: 'paywall' };
      }

      // ── 2. Si ya existe análisis, no regenerar ──
      const gemeloRef  = db.collection('gemelo_data').doc(uid);
      const gemeloSnap = await gemeloRef.get();
      if (gemeloSnap.exists && gemeloSnap.data().analysis_ready) {
        return { status: 'ok', generated: false, already_exists: true };
      }

      // ── 3. Leer datos del usuario y construir el user message ──
      const mainSnap = await db.collection('users').doc(uid).collection('data').doc('main').get();
      const app      = mainSnap.exists ? mainSnap.data() : {};
      // Inyectar displayName del doc raíz si no está en main
      if (!app.userName && userData.displayName) app.userName = userData.displayName;

      // ── 3b. Leer telemetría de comportamiento (últimos 30 días) ──
      try {
        const hace30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const analyticsSnap = await db.collection('analytics').doc(uid).collection('eventos')
          .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(hace30d))
          .orderBy('timestamp', 'asc')
          .limit(500)
          .get();
        if (!analyticsSnap.empty) {
          // Agrupar por tipo
          const porTipo = {};
          const moduloFrecuencia = {};
          analyticsSnap.forEach(doc => {
            const ev = doc.data();
            porTipo[ev.tipo] = (porTipo[ev.tipo] || 0) + 1;
            if (ev.tipo === 'modulo_visitado' && ev.datos?.modulo) {
              moduloFrecuencia[ev.datos.modulo] = (moduloFrecuencia[ev.datos.modulo] || 0) + 1;
            }
          });
          // Módulos más visitados (top 5)
          const topModulos = Object.entries(moduloFrecuencia)
            .sort((a, b) => b[1] - a[1]).slice(0, 5)
            .map(([m, c]) => `${m}(${c}x)`).join(', ');
          const totalAperturas = porTipo['app_open'] || 0;
          app._analytics = {
            totalAperturas,
            modulosFrecuentes: topModulos,
            totalEventos: analyticsSnap.size
          };
        }
      } catch(e) { /* analytics opcionales — no interrumpir */ }

      const userMessage = construirUserPrompt(app);

      // ── 4. System prompt del Gemelo Potenciado ──
      const systemPrompt = `ROL E IDENTIDAD FUNDAMENTAL

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

      // ── 5. Llamar a Gemini ──
      const genAI = new GoogleGenerativeAI(geminiApiKey());
      const model = genAI.getGenerativeModel({
        model: 'gemini-1.5-flash-latest',
        systemInstruction: systemPrompt,
        generationConfig: {
          temperature:      0.85,
          topP:             0.95,
          maxOutputTokens:  2048,
          responseMimeType: 'application/json',
        },
      });

      const result  = await model.generateContent(userMessage);
      let   rawText = result.response.text().trim();

      // Limpiar markdown si Gemini lo añade a pesar de responseMimeType
      rawText = rawText
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();
      // Extraer desde el primer { hasta el último }
      const firstBrace = rawText.indexOf('{');
      const lastBrace  = rawText.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        rawText = rawText.slice(firstBrace, lastBrace + 1);
      }

      // Validar claves obligatorias
      const parsed = JSON.parse(rawText); // lanza si no es JSON válido
      if (!parsed.gancho_intriga || !parsed.analisis_profundo) {
        throw new Error('JSON de Gemini no contiene las claves requeridas: ' + rawText.slice(0, 200));
      }

      // ── 6. Guardar en Firestore (gancho_intriga separado para inyectar en paywall) ──
      await gemeloRef.set({
        analysis_ready:   true,
        analysis_text:    rawText,
        gancho_intriga:   parsed.gancho_intriga,
        analisis_profundo: parsed.analisis_profundo,
        generated_at:     admin.firestore.FieldValue.serverTimestamp(),
        observation_days: app.gemelo?.dataPoints || 30,
        model:            'gemini-1.5-flash-latest',
      });

      console.info('[Life OS] Análisis del Gemelo generado para:', uid);
      return { status: 'ok', generated: true };

    } catch(e) {
      console.error('[Life OS] generateGemeloAnalysis error:', e);
      throw new functions.https.HttpsError('internal', 'No se pudo generar el análisis. Intenta de nuevo.');
    }
  });

/* ═══════════════════════════════════════════════════════════════
   MÓDULO 4 — NOTIFICACIONES PUSH (5 Disparadores)
   Todas usan admin.messaging().send() con el fcm_token del usuario
   y un tag único por tipo para evitar spam duplicado
═══════════════════════════════════════════════════════════════ */

// ── Helper: obtener todos los usuarios con notifications_enabled y fcm_token ──
async function _getNotifiableUsers(extraFilters) {
  let query = db.collection('users').where('notifications_enabled', '==', true);
  const snap = await query.get();
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }))
    .filter(u => u.fcm_token && u.fcm_token.length > 10);
}

// ── Helper: enviar notificación individual ──
async function _sendPush(fcmToken, title, body, tag, url) {
  try {
    await admin.messaging().send({
      token: fcmToken,
      notification: { title, body },
      webpush: {
        headers:     { Tag: tag },
        notification: {
          title, body,
          icon:              '/icons/icon-192.png',
          requireInteraction: false,
          tag,
          data: { url: url || '/' },
        },
        fcmOptions: { link: url || '/' },
      },
    });
  } catch(e) {
    // Token inválido — limpiar de Firestore
    if (e.code === 'messaging/registration-token-not-registered') {
      console.warn('[Life OS] FCM token expirado, limpiando...');
    } else {
      console.warn('[Life OS] _sendPush error:', e.message);
    }
  }
}

/**
 * A — notifyGemeloReady
 * Cron cada 24h — notifica cuando el análisis del Gemelo está listo (día 30)
 */
exports.notifyGemeloReady = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async () => {
    const snap = await db.collection('gemelo_data')
      .where('analysis_ready', '==', true)
      .where('observation_days', '>=', 30)
      .get();

    for (const doc of snap.docs) {
      const uid      = doc.id;
      const userSnap = await db.collection('users').doc(uid).get();
      if (!userSnap.exists) continue;
      const user = userSnap.data();
      if (!user.notifications_enabled || !user.fcm_token) continue;
      await _sendPush(
        user.fcm_token,
        '✦ Tu Gemelo terminó su análisis 🧠',
        'Después de 30 días de observación, tu espejo inteligente tiene algo importante que decirte.',
        'gemelo-ready',
        '/#gemelo'
      );
    }
    return null;
  });

/**
 * B — notifyTrialExpiring
 * Cron cada 24h — alerta 3 días antes de que expire el trial
 */
exports.notifyTrialExpiring = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async () => {
    const now       = new Date();
    const in3days   = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const in4days   = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);

    const snap = await db.collection('users')
      .where('is_pro', '==', false)
      .where('trial_ends_at', '>=', admin.firestore.Timestamp.fromDate(in3days))
      .where('trial_ends_at', '<=', admin.firestore.Timestamp.fromDate(in4days))
      .get();

    for (const doc of snap.docs) {
      const user = doc.data();
      if (!user.notifications_enabled || !user.fcm_token) continue;
      await _sendPush(
        user.fcm_token,
        '⏳ Te quedan 3 días de Life OS gratis',
        'Tu período de prueba está por terminar. No pierdas tu progreso — activa Pro ahora.',
        'trial-expiring',
        '/#pago'
      );
    }
    return null;
  });

/**
 * C — dailyBriefing
 * Cron 8am CDMX todos los días
 * NOTA: cuando se usa .timeZone(), el cron se interpreta en esa zona horaria directamente.
 * '0 8 * * *' + timeZone('America/Mexico_City') = 08:00 CDMX ✓
 */
exports.dailyBriefing = functions.pubsub
  .schedule('0 8 * * *')
  .timeZone('America/Mexico_City')
  .onRun(async () => {
    const users = await _getNotifiableUsers();
    for (const user of users) {
      await _sendPush(
        user.fcm_token,
        '☀️ Buenos días — Life OS',
        'Tu sistema está listo. Revisa tus tareas y hábitos de hoy.',
        'daily-briefing',
        '/'
      );
    }
    return null;
  });

/**
 * D — motivationalPill
 * Cron 3pm CDMX — solo usuarios activos en últimas 48h
 */
exports.motivationalPill = functions.pubsub
  .schedule('0 15 * * *')
  .timeZone('America/Mexico_City')
  .onRun(async () => {
    const mensajes = [
      'La disciplina es elegir entre lo que quieres ahora y lo que quieres en el futuro. 💡',
      'Cada hábito completado hoy es una inversión en quien serás mañana. 🔥',
      'No se trata de motivación — se trata de sistemas. Tú tienes el tuyo. ⚡',
      'El progreso pequeño sigue siendo progreso. Registra algo hoy. 📈',
      'Tu versión futura te agradecerá lo que hagas en los próximos 30 minutos. 🎯',
    ];
    const hace48h = new Date(Date.now() - 48 * 60 * 60 * 1000);

    const snap = await db.collectionGroup('user_activity')
      .where('completed_at', '>=', admin.firestore.Timestamp.fromDate(hace48h))
      .get();

    // Obtener UIDs únicos activos en últimas 48h
    const activeUids = new Set(snap.docs.map(d => d.ref.parent.parent.id));

    for (const uid of activeUids) {
      const userSnap = await db.collection('users').doc(uid).get();
      if (!userSnap.exists) continue;
      const user = userSnap.data();
      if (!user.notifications_enabled || !user.fcm_token) continue;
      const msg = mensajes[Math.floor(Math.random() * mensajes.length)];
      await _sendPush(user.fcm_token, '💡 Life OS', msg, 'motivational-pill', '/');
    }
    return null;
  });

/* ═══════════════════════════════════════════════════════════════
   MÓDULO 5 — PURGA SELECTIVA DE USUARIOS "PESO MUERTO"
═══════════════════════════════════════════════════════════════ */

/**
 * purgeDeadWeight
 * Cron cada 24h — elimina usuarios que cumplen TODOS los criterios:
 *   1. is_pro === false   (no son Pro activos)
 *   2. hasEverPaid !== true  (nunca han completado un pago — protección crítica)
 *   3. trial_ends_at expiró hace más de 31 días (= 61+ días desde inicio del trial de 30 días)
 *
 * PROTECCIÓN GARANTIZADA:
 *   — Si un usuario pagó alguna vez, el webhook setea hasEverPaid: true
 *   — Esos usuarios NO se borran aunque su suscripción haya expirado (is_pro vuelve a false)
 *   — Solo se elimina a quienes nunca tocaron la pasarela de pago Y llevan 61+ días inactivos
 *
 * NOTA: Para usuarios que pagaron ANTES de este deploy (sin campo hasEverPaid),
 *   correr una migración única: buscar en Stripe todos los clientes con pagos exitosos
 *   y setear hasEverPaid: true en sus docs de Firestore.
 */
exports.purgeDeadWeight = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async () => {
    const now    = new Date();
    // 31 días después del fin del trial = 61+ días desde el inicio (trial dura 30 días)
    const cutoff = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000);

    // Query: no Pro + trial terminado hace > 31 días
    // Filtro hasEverPaid se aplica en memoria (Firestore no soporta != combinado con <=)
    const snap = await db.collection('users')
      .where('is_pro',        '==', false)
      .where('trial_ends_at', '<=', admin.firestore.Timestamp.fromDate(cutoff))
      .get();

    let purgedCount = 0;

    for (const doc of snap.docs) {
      const data = doc.data();
      const uid  = doc.id;

      // ── PROTECCIÓN ABSOLUTA: si alguna vez pagó, NO borrar ──
      if (data.hasEverPaid === true) {
        console.info('[Life OS] purgeDeadWeight: SKIP (pagó alguna vez):', uid);
        continue;
      }
      // Doble protección: roles que indican acceso histórico
      if (data.role === 'premium' || data.role === 'admin') {
        console.info('[Life OS] purgeDeadWeight: SKIP (rol protegido):', uid);
        continue;
      }

      try {
        // ── Borrar documento principal + TODAS las subcolecciones (data, connections, user_activity) ──
        await db.recursiveDelete(db.collection('users').doc(uid));
        // Limpiar colecciones relacionadas en raíz
        await db.collection('gemelo_data').doc(uid).delete().catch(() => {});
        await db.collection('leaderboard').doc(uid).delete().catch(() => {});
        await db.collection('userDirectory').doc(uid).delete().catch(() => {});

        console.info('[Life OS] purgeDeadWeight: DELETED peso muerto:', uid);
        purgedCount++;
      } catch(e) {
        console.error('[Life OS] purgeDeadWeight error al borrar:', uid, e.message);
      }
    }

    console.info(`[Life OS] purgeDeadWeight completado: ${purgedCount} usuarios purgados de ${snap.size} candidatos.`);
    return null;
  });

/**
 * E — reengagementNotif
 * Cron cada 24h — usuarios sin actividad en más de 48h
 */
exports.reengagementNotif = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async () => {
    const hace48h = new Date(Date.now() - 48 * 60 * 60 * 1000);

    // Obtener usuarios con notifications activas
    const usersSnap = await db.collection('users')
      .where('notifications_enabled', '==', true)
      .get();

    for (const userDoc of usersSnap.docs) {
      const user = userDoc.data();
      if (!user.fcm_token) continue;
      // Verificar última actividad en user_activity
      const actSnap = await db.collection('users').doc(userDoc.id)
        .collection('user_activity')
        .orderBy('completed_at', 'desc')
        .limit(1)
        .get();

      if (!actSnap.empty) {
        const lastActivity = actSnap.docs[0].data().completed_at?.toDate();
        if (lastActivity && lastActivity > hace48h) continue; // Activo recientemente — saltar
      }

      await _sendPush(
        user.fcm_token,
        '👋 Life OS te extraña',
        'Han pasado más de 2 días. Tu sistema sigue aquí, esperándote.',
        'reengagement',
        '/'
      );
    }
    return null;
  });

/**
 * F — midDayCheckIn
 * Cron 12pm CDMX — solo usuarios activos en últimas 24h
 * Mensaje contextual de revisión de tareas al mediodía
 */
exports.midDayCheckIn = functions.pubsub
  .schedule('0 12 * * *')
  .timeZone('America/Mexico_City')
  .onRun(async () => {
    const mensajes = [
      '¿Ya revisaste tus tareas de hoy? Mediodía es el mejor momento para hacer balance. 📋',
      'A mitad del día — ¿cuántas tareas tienes listas? Tu racha te lo agradecerá. ✅',
      'Check de mediodía: pausa 2 minutos y revisa qué completaste y qué sigue pendiente. ⚡',
      'El mediodía es tu punto de control. Una tarea completada ahora vale el doble. 🎯',
      'Ya pasó la mañana. ¿Qué moviste hoy? Entra y registra tu avance. 📈',
    ];
    const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const snap = await db.collectionGroup('user_activity')
      .where('completed_at', '>=', admin.firestore.Timestamp.fromDate(hace24h))
      .get();
    const activeUids = new Set(snap.docs.map(d => d.ref.parent.parent.id));
    for (const uid of activeUids) {
      const userSnap = await db.collection('users').doc(uid).get();
      if (!userSnap.exists) continue;
      const user = userSnap.data();
      if (!user.notifications_enabled || !user.fcm_token) continue;
      const msg = mensajes[Math.floor(Math.random() * mensajes.length)];
      await _sendPush(user.fcm_token, '🕛 Revisión de mediodía — Life OS', msg, 'midday-check', '/');
    }
    return null;
  });

/**
 * G — afternoonGoalReview
 * Cron 4pm CDMX — enfocado en metas y hábitos de tarde
 */
exports.afternoonGoalReview = functions.pubsub
  .schedule('0 16 * * *')
  .timeZone('America/Mexico_City')
  .onRun(async () => {
    const mensajes = [
      'Quedan pocas horas del día. Una meta pequeña completada esta tarde cierra el día en verde. 🎯',
      'Las 4pm son el último punto de impulso antes de que la energía baje. Úsalas. 💪',
      'Tu hábito de la tarde está esperando. Entrena, lee, reflexiona — lo que sea, hazlo ahora. ⚡',
      '¿Lograste lo que planeaste esta mañana? Cierra el ciclo antes de que se haga noche. ✅',
      'La consistencia se construye en momentos como este. Abre Life OS y registra algo. 🔥',
    ];
    const users = await _getNotifiableUsers();
    for (const user of users) {
      const msg = mensajes[Math.floor(Math.random() * mensajes.length)];
      await _sendPush(user.fcm_token, '🌅 Tarde productiva — Life OS', msg, 'afternoon-goal', '/');
    }
    return null;
  });

/**
 * H — eveningWindDown
 * Cron 8pm CDMX — cierre del día: reflexión y registro de victorias
 * Solo usuarios con actividad en las últimas 12h para no molestar a inactivos
 */
exports.eveningWindDown = functions.pubsub
  .schedule('0 20 * * *')
  .timeZone('America/Mexico_City')
  .onRun(async () => {
    const mensajes = [
      'El día casi termina. ¿Registraste tu victoria de hoy en la bitácora? 📝',
      'Antes de cerrar el día: una entrada en tu bitácora vale más que cualquier resumen de fin de año. 💜',
      '8pm — momento de reflexión. ¿Qué funcionó hoy? Escríbelo antes de que lo olvides. 🌙',
      '¿Completaste tus hábitos de hoy? Hay tiempo. Un hábito antes de dormir cierra el ciclo. ⚡',
      'El mejor momento para planear mañana es esta noche. Abre Life OS y deja todo listo. 🎯',
    ];
    const hace12h = new Date(Date.now() - 12 * 60 * 60 * 1000);

    const snap = await db.collectionGroup('user_activity')
      .where('completed_at', '>=', admin.firestore.Timestamp.fromDate(hace12h))
      .get();

    const activeUids = new Set(snap.docs.map(d => d.ref.parent.parent.id));

    for (const uid of activeUids) {
      const userSnap = await db.collection('users').doc(uid).get();
      if (!userSnap.exists) continue;
      const user = userSnap.data();
      if (!user.notifications_enabled || !user.fcm_token) continue;
      const msg = mensajes[Math.floor(Math.random() * mensajes.length)];
      await _sendPush(user.fcm_token, '🌙 Cierre de día — Life OS', msg, 'evening-winddown', '/');
    }
    return null;
  });
