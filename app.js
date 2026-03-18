// ═══════════════════════════════════════════════════════════════════════
//  LIFE OS — Firebase Integration Layer  ·  app.js  v2.0
//  Maneja: Auth (email/password) + Firestore sync + Admin RBAC
// ═══════════════════════════════════════════════════════════════════════

import { initializeApp }
  from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";

import { getFirestore, doc, setDoc, getDoc }
  from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

import { getAuth, signInWithEmailAndPassword,
         createUserWithEmailAndPassword,
         signOut, onAuthStateChanged, updateProfile }
  from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";


// ──────────────────────────────────────────────────────────────────────
// 1. CONFIGURACIÓN FIREBASE
// ──────────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyB2zoZMEmwA6Kwj_NiORwMvQiNrChdSK4U",
  authDomain:        "life-os-a90ce.firebaseapp.com",
  projectId:         "life-os-a90ce",
  storageBucket:     "life-os-a90ce.firebasestorage.app",
  messagingSenderId: "301246898644",
  appId:             "1:301246898644:web:1a879f48b6076293ee7641",
  measurementId:     "G-2WW4GTSC82"
};

const _app = initializeApp(firebaseConfig);
const db   = getFirestore(_app);
const auth = getAuth(_app);


// ──────────────────────────────────────────────────────────────────────
// 2. ★ AGREGA AQUÍ LOS EMAILS QUE SERÁN ADMIN ★
// ──────────────────────────────────────────────────────────────────────
const ADMIN_EMAILS = new Set([
  'wencesreal35@gmail.com',
]);


// ──────────────────────────────────────────────────────────────────────
// 3. FIRESTORE — LEER / GUARDAR
// ──────────────────────────────────────────────────────────────────────
const userRef = (uid) => doc(db, "usuarios", uid);

/** Guarda el estado completo de la app en Firestore (debounced) */
async function cloudSave(uid) {
  if (!uid || !window.S) return;
  try {
    await setDoc(userRef(uid), {
      appData:  JSON.stringify(window.S),
      syncedAt: new Date().toISOString(),
    }, { merge: true });
  } catch (e) {
    console.warn("[LifeOS] Error guardando en nube:", e.message);
  }
}

/** Carga el estado guardado en Firestore */
async function cloudLoad(uid) {
  try {
    const snap = await getDoc(userRef(uid));
    if (!snap.exists()) return null;
    const raw = snap.data()?.appData;
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn("[LifeOS] Error cargando de nube:", e.message);
    return null;
  }
}


// ──────────────────────────────────────────────────────────────────────
// 4. PANTALLA DE LOGIN (se inyecta automáticamente si no hay sesión)
// ──────────────────────────────────────────────────────────────────────
function buildLoginScreen() {
  if (document.getElementById('fb-login-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'fb-login-overlay';
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:99999;
    background:#070b14;
    display:flex;align-items:center;justify-content:center;
    font-family:'Syne',sans-serif;
  `;
  overlay.innerHTML = `
    <div style="
      background:rgba(13,20,35,.97);
      border:1px solid rgba(0,229,255,.2);
      border-radius:18px;padding:40px 36px;
      width:340px;max-width:92vw;
      box-shadow:0 0 60px rgba(0,229,255,.07);
    ">
      <!-- Logo -->
      <div style="font-family:'Orbitron',monospace;font-size:22px;font-weight:900;
                  color:#00e5ff;text-align:center;letter-spacing:.04em;">LIFE OS</div>
      <div style="text-align:center;color:rgba(128,148,180,.6);font-size:11px;
                  margin-bottom:28px;letter-spacing:.08em;">PERSONAL COMMAND CENTER</div>

      <!-- ── FORM LOGIN ── -->
      <div id="fb-login-form">
        <input id="fb-email" type="email" placeholder="Email" autocomplete="email"
          style="width:100%;padding:11px 14px;border-radius:9px;
                 border:1px solid rgba(0,229,255,.2);
                 background:rgba(255,255,255,.04);color:#e2e8f0;
                 font-size:14px;outline:none;
                 margin-bottom:10px;box-sizing:border-box;"/>

        <input id="fb-pass" type="password" placeholder="Contraseña" autocomplete="current-password"
          style="width:100%;padding:11px 14px;border-radius:9px;
                 border:1px solid rgba(0,229,255,.2);
                 background:rgba(255,255,255,.04);color:#e2e8f0;
                 font-size:14px;outline:none;
                 margin-bottom:16px;box-sizing:border-box;"/>

        <button id="fb-btn-login"
          style="width:100%;padding:12px;border-radius:9px;
                 background:#00e5ff;color:#070b14;
                 font-weight:800;font-size:14px;border:none;cursor:pointer;
                 font-family:'Orbitron',monospace;letter-spacing:.05em;
                 transition:opacity .2s;">
          ENTRAR
        </button>

        <div id="fb-err"
          style="color:#f87171;font-size:12px;text-align:center;
                 margin-top:10px;min-height:18px;"></div>

        <div style="text-align:center;margin-top:16px;">
          <span style="color:rgba(128,148,180,.55);font-size:12px;">¿Sin cuenta? </span>
          <span id="fb-show-reg"
            style="color:#00e5ff;font-size:12px;cursor:pointer;text-decoration:underline;">
            Regístrate
          </span>
        </div>
      </div>

      <!-- ── FORM REGISTRO ── -->
      <div id="fb-reg-form" style="display:none;">
        <input id="fb-reg-name" type="text" placeholder="Tu nombre / usuario"
          style="width:100%;padding:11px 14px;border-radius:9px;
                 border:1px solid rgba(168,85,247,.3);
                 background:rgba(255,255,255,.04);color:#e2e8f0;
                 font-size:14px;outline:none;
                 margin-bottom:10px;box-sizing:border-box;"/>

        <input id="fb-reg-email" type="email" placeholder="Email"
          style="width:100%;padding:11px 14px;border-radius:9px;
                 border:1px solid rgba(168,85,247,.3);
                 background:rgba(255,255,255,.04);color:#e2e8f0;
                 font-size:14px;outline:none;
                 margin-bottom:10px;box-sizing:border-box;"/>

        <input id="fb-reg-pass" type="password" placeholder="Contraseña (mín. 6 caracteres)"
          style="width:100%;padding:11px 14px;border-radius:9px;
                 border:1px solid rgba(168,85,247,.3);
                 background:rgba(255,255,255,.04);color:#e2e8f0;
                 font-size:14px;outline:none;
                 margin-bottom:16px;box-sizing:border-box;"/>

        <button id="fb-btn-reg"
          style="width:100%;padding:12px;border-radius:9px;
                 background:#a855f7;color:#fff;
                 font-weight:800;font-size:14px;border:none;cursor:pointer;
                 font-family:'Orbitron',monospace;letter-spacing:.05em;">
          CREAR CUENTA
        </button>

        <div id="fb-reg-err"
          style="color:#f87171;font-size:12px;text-align:center;
                 margin-top:10px;min-height:18px;"></div>

        <div style="text-align:center;margin-top:16px;">
          <span id="fb-show-login"
            style="color:#00e5ff;font-size:12px;cursor:pointer;text-decoration:underline;">
            ← Volver al login
          </span>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Eventos botones
  document.getElementById('fb-btn-login').onclick   = handleLogin;
  document.getElementById('fb-btn-reg').onclick     = handleRegister;

  // Toggle login ↔ registro
  document.getElementById('fb-show-reg').onclick = () => {
    document.getElementById('fb-login-form').style.display = 'none';
    document.getElementById('fb-reg-form').style.display   = 'block';
  };
  document.getElementById('fb-show-login').onclick = () => {
    document.getElementById('fb-reg-form').style.display   = 'none';
    document.getElementById('fb-login-form').style.display = 'block';
  };

  // Enter en campo contraseña
  document.getElementById('fb-pass').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLogin();
  });
  document.getElementById('fb-reg-pass').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleRegister();
  });
}

function hideLoginScreen() {
  document.getElementById('fb-login-overlay')?.remove();
}


// ──────────────────────────────────────────────────────────────────────
// 5. LÓGICA DE LOGIN Y REGISTRO
// ──────────────────────────────────────────────────────────────────────
async function handleLogin() {
  const email = document.getElementById('fb-email').value.trim();
  const pass  = document.getElementById('fb-pass').value;
  const errEl = document.getElementById('fb-err');

  if (!email || !pass) { errEl.textContent = 'Completa todos los campos'; return; }

  const btn = document.getElementById('fb-btn-login');
  btn.textContent = 'Entrando…';
  btn.disabled = true;

  try {
    await signInWithEmailAndPassword(auth, email, pass);
    // onAuthStateChanged se encarga del resto
  } catch (e) {
    errEl.textContent    = friendlyError(e.code);
    btn.textContent      = 'ENTRAR';
    btn.disabled         = false;
  }
}

async function handleRegister() {
  const name  = document.getElementById('fb-reg-name').value.trim();
  const email = document.getElementById('fb-reg-email').value.trim();
  const pass  = document.getElementById('fb-reg-pass').value;
  const errEl = document.getElementById('fb-reg-err');

  if (!name || !email || !pass) { errEl.textContent = 'Completa todos los campos'; return; }
  if (pass.length < 6) { errEl.textContent = 'La contraseña necesita al menos 6 caracteres'; return; }

  const btn = document.getElementById('fb-btn-reg');
  btn.textContent = 'Creando cuenta…';
  btn.disabled = true;

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(cred.user, { displayName: name });

    // Crear documento inicial en Firestore
    const role = ADMIN_EMAILS.has(email) ? 'admin' : 'user';
    await setDoc(userRef(cred.user.uid), {
      displayName: name,
      email,
      role,
      createdAt:   new Date().toISOString(),
      appData:     null,
    });
    // onAuthStateChanged dispara bootApp()
  } catch (e) {
    errEl.textContent   = friendlyError(e.code);
    btn.textContent     = 'CREAR CUENTA';
    btn.disabled        = false;
  }
}

/** Convierte códigos de error de Firebase a mensajes legibles */
function friendlyError(code) {
  const msgs = {
    'auth/user-not-found':      'No existe ninguna cuenta con ese email',
    'auth/wrong-password':      'Contraseña incorrecta',
    'auth/invalid-email':       'Email inválido',
    'auth/email-already-in-use':'Ese email ya está registrado',
    'auth/weak-password':       'Contraseña muy corta (mínimo 6 caracteres)',
    'auth/too-many-requests':   'Demasiados intentos. Espera un momento',
    'auth/invalid-credential':  'Email o contraseña incorrectos',
    'auth/network-request-failed': 'Sin conexión a internet',
  };
  return msgs[code] ?? ('Error: ' + code);
}


// ──────────────────────────────────────────────────────────────────────
// 6. ARRANQUE DE LA APP TRAS AUTENTICACIÓN
// ──────────────────────────────────────────────────────────────────────
async function bootApp(fbUser) {
  console.log('[LifeOS] Autenticado como:', fbUser.email);

  // Cargar estado de la nube
  const cloudState = await cloudLoad(fbUser.uid);

  // Determinar rol (Firestore > ADMIN_EMAILS)
  let role = 'user';
  try {
    const snap = await getDoc(userRef(fbUser.uid));
    if (snap.exists()) {
      role = snap.data()?.role ?? (ADMIN_EMAILS.has(fbUser.email) ? 'admin' : 'user');
    } else {
      role = ADMIN_EMAILS.has(fbUser.email) ? 'admin' : 'user';
    }
  } catch (_) { /* sin conexión: usa ADMIN_EMAILS */ }

  // Objeto usuario para la app
  const userObj = {
    uid:         fbUser.uid,
    email:       fbUser.email,
    displayName: fbUser.displayName || fbUser.email.split('@')[0],
    role,
  };

  // Esperar a que la app (index.html) termine de inicializarse
  await waitForApp();

  // Mergear estado de nube en el estado local (S)
  if (cloudState && window.S) {
    Object.keys(cloudState)
      .filter(k => k !== 'user')
      .forEach(k => { window.S[k] = cloudState[k]; });
  }

  // Inyectar usuario
  if (window.S) window.S.user = userObj;

  // Guardar en localStorage
  if (typeof window.saveState === 'function') window.saveState();

  // Reconstruir UI
  if (typeof window.renderAll         === 'function') window.renderAll();
  if (typeof window.buildAdminModules === 'function') window.buildAdminModules();
  if (typeof window.navigate          === 'function') window.navigate('dashboard');

  // Parchear saveState para que también sincronice con la nube
  patchSaveState(fbUser.uid);

  // Parchear doLogout para que use Firebase Auth
  window.doLogout = async () => {
    await signOut(auth);
    localStorage.clear();
    location.reload();
  };

  // Ocultar pantalla de login
  hideLoginScreen();

  console.log(`[LifeOS] ✓ Sesión activa — ${fbUser.email} | Rol: ${role}`);
}

/** Espera hasta que la app haya definido window.S y window.saveState */
function waitForApp(maxMs = 8000) {
  return new Promise((resolve) => {
    if (window.S !== undefined && typeof window.saveState === 'function') {
      resolve(); return;
    }
    const t0    = Date.now();
    const timer = setInterval(() => {
      if (
        window.S !== undefined &&
        typeof window.saveState === 'function'
      ) {
        clearInterval(timer); resolve();
      } else if (Date.now() - t0 > maxMs) {
        clearInterval(timer); resolve(); // continuar de todas formas
      }
    }, 80);
  });
}


// ──────────────────────────────────────────────────────────────────────
// 7. PATCH saveState → también guarda en la nube (debounced 1.5 s)
// ──────────────────────────────────────────────────────────────────────
let _syncTimer = null;

function patchSaveState(uid) {
  const original = window.saveState;
  if (typeof original !== 'function') return;

  window.saveState = function (...args) {
    original.apply(this, args);          // localStorage primero
    clearTimeout(_syncTimer);
    _syncTimer = setTimeout(() => cloudSave(uid), 1500);  // nube después
  };
}


// ──────────────────────────────────────────────────────────────────────
// 8. OBSERVADOR DE SESIÓN (punto de entrada principal)
// ──────────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, (fbUser) => {
  if (fbUser) {
    // Usuario autenticado → arrancar app
    bootApp(fbUser);
  } else {
    // Sin sesión → mostrar login (esperar un poco para que cargue el CSS)
    setTimeout(buildLoginScreen, 250);
  }
});


// ──────────────────────────────────────────────────────────────────────
// 9. API PÚBLICA (accesible desde la consola o desde index.html)
// ──────────────────────────────────────────────────────────────────────
window.FB = {
  auth,
  db,
  cloudSave,
  cloudLoad,
  /** Guarda manualmente (útil para debug): FB.saveNow() */
  saveNow: () => cloudSave(auth.currentUser?.uid),
};

console.log('[LifeOS Firebase] app.js v2.0 cargado ✓');
