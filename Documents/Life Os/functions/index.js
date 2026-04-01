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
      success_url: 'https://TU_DOMINIO.COM/?pago=exitoso',
      cancel_url:  'https://TU_DOMINIO.COM/?pago=cancelado',
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
          is_pro: true,
          role:   'premium',
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
        status:          'ok',
        data:            null,
        analysis_ready:  false,
        observation_days: gemeloData.observation_days || 0,
      };
    }

    return {
      status:          'ok',
      data:            gemeloData.analysis_text,
      analysis_ready:  true,
      generated_at:    gemeloData.generated_at,
      observation_days: gemeloData.observation_days || 30,
    };

  } catch(e) {
    console.error('[Life OS] getGemelo error:', e);
    throw new functions.https.HttpsError('internal', 'Error al obtener datos del Gemelo.');
  }
});

/**
 * generateGemeloAnalysis
 * HTTPS Callable — genera el análisis del Gemelo Potenciado con Gemini Flash 2.5
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

      // ── 3. Leer datos de productividad del usuario ──
      const mainSnap  = await db.collection('users').doc(uid).collection('data').doc('main').get();
      const app       = mainSnap.exists ? mainSnap.data() : {};

      const nombre      = (app.userName || userData.displayName || 'el usuario').split(' ')[0];
      const habits      = app.habits      || [];
      const tasks       = app.tasks       || [];
      const txs         = app.transactions || [];
      const goals       = app.goals       || [];
      const xp          = app.xp          || 0;
      const level       = app.level       || 1;
      const streak      = app.checkInStreak || 0;
      const gemelo      = app.gemelo      || {};
      const obsDays     = gemelo.dataPoints || 30;

      // Métricas derivadas para el prompt
      const doneT       = tasks.filter(t => t.done).length;
      const totalT      = tasks.length;
      const compRate    = totalT > 0 ? Math.round((doneT / totalT) * 100) : 0;
      const topHabit    = [...habits].sort((a, b) => (b.streak || 0) - (a.streak || 0))[0];
      const totalGasto  = txs.filter(t => t.type === 'salida').reduce((s, t) => s + (t.amount || 0), 0);
      const totalIngreso = txs.filter(t => t.type === 'entrada').reduce((s, t) => s + (t.amount || 0), 0);
      const habitNames  = habits.slice(0, 5).map(h => `${h.name} (racha: ${h.streak || 0} días)`).join(', ') || 'ninguno registrado';
      const goalNames   = goals.slice(0, 3).map(g => g.title || g.name || '').filter(Boolean).join(', ') || 'ninguna registrada';
      const pendingT    = tasks.filter(t => !t.done).slice(0, 5).map(t => t.name || t.text || '').filter(Boolean).join(', ') || 'ninguna';

      // ── 4. Construir prompt para Gemini ──
      const prompt = `Eres el Gemelo Potenciado de ${nombre}, una IA especializada en análisis de comportamiento humano y productividad personal. Has observado a ${nombre} durante ${obsDays} días a través de su sistema Life OS y tienes acceso a sus datos conductuales completos.

DATOS OBSERVADOS:
- Hábitos activos: ${habitNames}
- Hábito más consistente: ${topHabit ? `"${topHabit.name}" con ${topHabit.streak || 1} días consecutivos` : 'ninguno aún'}
- Tareas completadas: ${doneT} de ${totalT} (${compRate}% de eficiencia)
- Tareas pendientes importantes: ${pendingT}
- Metas declaradas: ${goalNames}
- XP total acumulado: ${xp.toLocaleString()} puntos — Nivel ${level}
- Racha de check-in: ${streak} días consecutivos
- Gastos registrados: $${totalGasto.toLocaleString()} | Ingresos: $${totalIngreso.toLocaleString()}
- Días de observación: ${obsDays}

Tu tarea es generar un análisis profundo y honesto de ${nombre} basado en estos datos. El análisis debe ser:
1. PERSONALIZADO — usa los datos reales, menciona hábitos y métricas específicas
2. PSICOLÓGICAMENTE PERSPICAZ — detecta patrones que el usuario no ve conscientemente
3. MOTIVANTE pero HONESTO — no sea solo halagador, señala brechas reales con compasión
4. EN ESPAÑOL — tono sofisticado, directo, sin clichés motivacionales vacíos
5. PROFUNDO — como si un coach de alto rendimiento y un analista de datos trabajaran juntos

INSTRUCCIÓN CRÍTICA: Responde ÚNICAMENTE con JSON válido, sin markdown, sin texto adicional. El formato exacto es:

{
  "fortalezas": [
    {"icon": "🔥", "title": "Título corto (max 6 palabras)", "body": "Párrafo de 2-3 oraciones profundas y específicas sobre una fortaleza real observada en los datos."},
    {"icon": "⚡", "title": "Título corto", "body": "Párrafo específico sobre otra fortaleza."}
  ],
  "patrones": [
    {"icon": "🔍", "title": "Título del patrón", "body": "Descripción del patrón invisible detectado, con datos específicos."},
    {"icon": "📅", "title": "Otro patrón", "body": "Descripción."}
  ],
  "contradicciones": [
    {"icon": "⚖️", "title": "Título de la contradicción", "body": "Descripción de la tensión entre lo que el usuario quiere y lo que hace, sin juzgar."}
  ],
  "preguntas": [
    "Pregunta reflexiva poderosa basada en los datos (no genérica)",
    "Segunda pregunta que incomoda positivamente",
    "Tercera pregunta que abre posibilidad"
  ],
  "direccion": "Párrafo de 3-4 oraciones sobre qué debería priorizar ${nombre} el próximo mes, muy específico y basado en sus datos reales. Termina con una frase memorable."
}

Genera exactamente 2 fortalezas, 2 patrones, 1 contradicción, 3 preguntas y 1 dirección.`;

      // ── 5. Llamar a Gemini Flash 2.5 ──
      const genAI = new GoogleGenerativeAI(geminiApiKey());
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: {
          temperature:     0.85,
          topP:            0.95,
          maxOutputTokens: 2048,
        },
      });

      const result       = await model.generateContent(prompt);
      let   rawText      = result.response.text().trim();

      // Limpiar markdown si Gemini añade backticks
      rawText = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

      // Validar que sea JSON parseble
      JSON.parse(rawText); // lanza error si no es válido

      // ── 6. Guardar en Firestore ──
      await gemeloRef.set({
        analysis_ready:   true,
        analysis_text:    rawText,
        generated_at:     admin.firestore.FieldValue.serverTimestamp(),
        observation_days: obsDays,
        model:            'gemini-2.5-flash',
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
 * Cron 8am CDMX (14:00 UTC) todos los días
 */
exports.dailyBriefing = functions.pubsub
  .schedule('0 14 * * *')
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
 * Cron 3pm CDMX (21:00 UTC) — solo usuarios activos en últimas 48h
 */
exports.motivationalPill = functions.pubsub
  .schedule('0 21 * * *')
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
