// ═══════════════════════════════════════════════════════════════════════
//  LIFE OS — Firebase Integration Layer  ·  app.js  v3.0
//  Estrategia: Firebase Auth → llamar loginSuccess() del HTML con role correcto
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
// 2. ADMIN EMAILS
// ──────────────────────────────────────────────────────────────────────
const ADMIN_EMAILS = new Set([
  'wencesreal35@gmail.com',
]);

// ──────────────────────────────────────────────────────────────────────
// 3. FIRESTORE
// ──────────────────────────────────────────────────────────────────────
const userRef = (uid) => doc(db, "usuarios", uid);

async function cloudSave(uid) {
  if (!uid) return;
  try {
    const appData = localStorage.getItem('lifeos_v2') || null;
    await setDoc(userRef(uid), {
      appData,
      syncedAt: new Date().toISOString(),
    }, { merge: true });
  } catch (e) {
    console.warn("[LifeOS] Error guardando en nube:", e.message);
  }
}

async function cloudLoad(uid) {
  try {
    const snap = await getDoc(userRef(uid));
    if (!snap.exists()) return null;
    return snap.data()?.appData || null;
  } catch (e) {
    console.warn("[LifeOS] Error cargando de nube:", e.message);
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────
// 4. PANTALLA DE LOGIN
// ──────────────────────────────────────────────────────────────────────
function buildLoginScreen() {
  const nativeAuth = document.getElementById('auth-screen');
  if (nativeAuth) nativeAuth.style.display = 'none';
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
      <div style="font-family:'Orbitron',monospace;font-size:22px;font-weight:900;
                  color:#00e5ff;text-align:center;letter-spacing:.04em;">LIFE OS</div>
      <div style="text-align:center;color:rgba(128,148,180,.6);font-size:11px;
                  margin-bottom:28px;letter-spacing:.08em;">PERSONAL COMMAND CENTER</div>
      <div id="fb-login-form">
        <input id="fb-email" type="email" placeholder="Email" autocomplete="email"
          style="width:100%;padding:11px 14px;border-radius:9px;border:1px solid rgba(0,229,255,.2);
                 background:rgba(255,255,255,.04);color:#e2e8f0;font-size:14px;outline:none;
                 margin-bottom:10px;box-sizing:border-box;"/>
        <input id="fb-pass" type="password" placeholder="Contraseña" autocomplete="current-password"
          style="width:100%;padding:11px 14px;border-radius:9px;border:1px solid rgba(0,229,255,.2);
                 background:rgba(255,255,255,.04);color:#e2e8f0;font-size:14px;outline:none;
                 margin-bottom:16px;box-sizing:border-box;"/>
        <button id="fb-btn-login"
          style="width:100%;padding:12px;border-radius:9px;background:#00e5ff;color:#070b14;
                 font-weight:800;font-size:14px;border:none;cursor:pointer;
                 font-family:'Orbitron',monospace;letter-spacing:.05em;">ENTRAR</button>
        <div id="fb-err" style="color:#f87171;font-size:12px;text-align:center;
                                margin-top:10px;min-height:18px;"></div>
        <div style="text-align:center;margin-top:16px;">
          <span style="color:rgba(128,148,180,.55);font-size:12px;">Sin cuenta? </span>
          <span id="fb-show-reg" style="color:#00e5ff;font-size:12px;cursor:pointer;text-decoration:underline;">Registrate</span>
        </div>
      </div>
      <div id="fb-reg-form" style="display:none;">
        <input id="fb-reg-name" type="text" placeholder="Tu nombre completo"
          style="width:100%;padding:11px 14px;border-radius:9px;border:1px solid rgba(168,85,247,.3);
                 background:rgba(255,255,255,.04);color:#e2e8f0;font-size:14px;outline:none;
                 margin-bottom:10px;box-sizing:border-box;"/>
        <input id="fb-reg-email" type="email" placeholder="Email"
          style="width:100%;padding:11px 14px;border-radius:9px;border:1px solid rgba(168,85,247,.3);
                 background:rgba(255,255,255,.04);color:#e2e8f0;font-size:14px;outline:none;
                 margin-bottom:10px;box-sizing:border-box;"/>
        <input id="fb-reg-pass" type="password" placeholder="Contrasena (min. 6 caracteres)"
          style="width:100%;padding:11px 14px;border-radius:9px;border:1px solid rgba(168,85,247,.3);
                 background:rgba(255,255,255,.04);color:#e2e8f0;font-size:14px;outline:none;
                 margin-bottom:16px;box-sizing:border-box;"/>
        <button id="fb-btn-reg"
          style="width:100%;padding:12px;border-radius:9px;background:#a855f7;color:#fff;
                 font-weight:800;font-size:14px;border:none;cursor:pointer;
                 font-family:'Orbitron',monospace;letter-spacing:.05em;">CREAR CUENTA</button>
        <div id="fb-reg-err" style="color:#f87171;font-size:12px;text-align:center;
                                    margin-top:10px;min-height:18px;"></div>
        <div style="text-align:center;margin-top:16px;">
          <span id="fb-show-login" style="color:#00e5ff;font-size:12px;cursor:pointer;text-decoration:underline;">
            Volver al login
          </span>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('fb-btn-login').onclick = handleLogin;
  document.getElementById('fb-btn-reg').onclick   = handleRegister;
  document.getElementById('fb-show-reg').onclick  = () => {
    document.getElementById('fb-login-form').style.display = 'none';
    document.getElementById('fb-reg-form').style.display   = 'block';
  };
  document.getElementById('fb-show-login').onclick = () => {
    document.getElementById('fb-reg-form').style.display   = 'none';
    document.getElementById('fb-login-form').style.display = 'block';
  };
  document.getElementById('fb-pass').addEventListener('keydown',     e => { if (e.key==='Enter') handleLogin(); });
  document.getElementById('fb-reg-pass').addEventListener('keydown', e => { if (e.key==='Enter') handleRegister(); });
}

function hideLoginScreen() {
  document.getElementById('fb-login-overlay')?.remove();
}

// ──────────────────────────────────────────────────────────────────────
// 5. LOGIN Y REGISTRO
// ──────────────────────────────────────────────────────────────────────
async function handleLogin() {
  const email = document.getElementById('fb-email').value.trim();
  const pass  = document.getElementById('fb-pass').value;
  const errEl = document.getElementById('fb-err');
  if (!email || !pass) { errEl.textContent = 'Completa todos los campos'; return; }
  const btn = document.getElementById('fb-btn-login');
  btn.textContent = 'Entrando...'; btn.disabled = true;
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (e) {
    errEl.textContent = friendlyError(e.code);
    btn.textContent = 'ENTRAR'; btn.disabled = false;
  }
}

async function handleRegister() {
  const name  = document.getElementById('fb-reg-name').value.trim();
  const email = document.getElementById('fb-reg-email').value.trim();
  const pass  = document.getElementById('fb-reg-pass').value;
  const errEl = document.getElementById('fb-reg-err');
  if (!name || !email || !pass) { errEl.textContent = 'Completa todos los campos'; return; }
  if (pass.length < 6) { errEl.textContent = 'Minimo 6 caracteres'; return; }
  const btn = document.getElementById('fb-btn-reg');
  btn.textContent = 'Creando cuenta...'; btn.disabled = true;
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(cred.user, { displayName: name });
    const role = ADMIN_EMAILS.has(email) ? 'admin' : 'user';
    await setDoc(userRef(cred.user.uid), {
      displayName: name, email, role,
      createdAt: new Date().toISOString(),
      appData: null,
    });
  } catch (e) {
    errEl.textContent = friendlyError(e.code);
    btn.textContent = 'CREAR CUENTA'; btn.disabled = false;
  }
}

function friendlyError(code) {
  const msgs = {
    'auth/user-not-found':         'No existe cuenta con ese email',
    'auth/wrong-password':         'Contrasena incorrecta',
    'auth/invalid-email':          'Email invalido',
    'auth/email-already-in-use':   'Ese email ya esta registrado',
    'auth/weak-password':          'Contrasena muy corta (minimo 6)',
    'auth/too-many-requests':      'Demasiados intentos, espera un momento',
    'auth/invalid-credential':     'Email o contrasena incorrectos',
    'auth/network-request-failed': 'Sin conexion a internet',
  };
  return msgs[code] ?? ('Error: ' + code);
}

// ──────────────────────────────────────────────────────────────────────
// 6. BOOT APP
// ──────────────────────────────────────────────────────────────────────
async function bootApp(fbUser) {
  console.log('[LifeOS] Firebase Auth OK:', fbUser.email);

  // Determinar rol
  let role = ADMIN_EMAILS.has(fbUser.email) ? 'admin' : 'user';
  try {
    const snap = await getDoc(userRef(fbUser.uid));
    if (snap.exists() && snap.data()?.role) role = snap.data().role;
  } catch (_) {}

  // Formato de usuario que espera el HTML de Life OS
  const appUser = {
    id:          fbUser.uid,
    nombre:      fbUser.displayName || fbUser.email.split('@')[0],
    email:       fbUser.email,
    role,
    plan:        role === 'admin' ? 'pro' : 'trial',
    trialStart:  Date.now(),
  };

  // Esperar a que loginSuccess y buildAdminModules existan
  await waitForFunctions(['loginSuccess', 'buildAdminModules']);

  // Restaurar datos de la nube en localStorage
  const cloudData = await cloudLoad(fbUser.uid);
  if (cloudData) {
    localStorage.setItem('lifeos_v2', cloudData);
    console.log('[LifeOS] Datos restaurados desde la nube');
  }

  // ★ LLAMAR loginSuccess del HTML — esto hace TODO:
  //   - updateUserUI (nombre en sidebar)
  //   - buildAdminModules (agrega pestaña Agencias si role=admin)
  //   - oculta auth-screen
  //   - corre el boot sequence
  window.loginSuccess(appUser);

  // Ocultar nuestro overlay
  hideLoginScreen();

  // Parchear doLogout
  window.doLogout = async () => {
    await signOut(auth);
    localStorage.removeItem('lifeos_session');
    localStorage.removeItem('lifeos_users');
    location.reload();
  };

  // Parchear saveState para sync en nube
  patchSaveState(fbUser.uid);

  console.log('[LifeOS] Sesion activa —', appUser.nombre, '| Rol:', role);
}

function waitForFunctions(names, maxMs = 10000) {
  return new Promise((resolve) => {
    const allReady = () => names.every(n => typeof window[n] === 'function');
    if (allReady()) { resolve(); return; }
    const t0 = Date.now();
    const timer = setInterval(() => {
      if (allReady() || Date.now() - t0 > maxMs) { clearInterval(timer); resolve(); }
    }, 80);
  });
}

// ──────────────────────────────────────────────────────────────────────
// 7. PATCH saveState
// ──────────────────────────────────────────────────────────────────────
let _syncTimer = null;
function patchSaveState(uid) {
  const original = window.saveState;
  if (typeof original !== 'function') return;
  window.saveState = function (...args) {
    original.apply(this, args);
    clearTimeout(_syncTimer);
    _syncTimer = setTimeout(() => cloudSave(uid), 2000);
  };
}

// ──────────────────────────────────────────────────────────────────────
// 8. OBSERVADOR DE SESION
// ──────────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, (fbUser) => {
  if (fbUser) {
    bootApp(fbUser);
  } else {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', buildLoginScreen);
    } else {
      setTimeout(buildLoginScreen, 200);
    }
  }
});

// ──────────────────────────────────────────────────────────────────────
// 9. API PUBLICA
// ──────────────────────────────────────────────────────────────────────
window.FB = {
  auth, db, cloudSave, cloudLoad,
  saveNow: () => cloudSave(auth.currentUser?.uid),
};

console.log('[LifeOS Firebase] app.js v3.0 cargado');
