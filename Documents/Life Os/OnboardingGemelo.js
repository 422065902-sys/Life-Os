/**
 * OnboardingGemelo.js — Onboarding obligatorio del Gemelo Potenciado
 *
 * Se muestra entre el check-in y la selección de tareas en el primer inicio de sesión.
 * No puede cerrarse ni saltarse hasta que Firestore confirme la activación.
 *
 * API pública:
 *   showOnboardingGemelo()  — mostrar el modal (llamado desde main.js)
 *
 * Globals que consume (todos definidos en main.js):
 *   S, today(), CLOUD_ENABLED, _auth, _db, firebase,
 *   _countGemeloPoints(), guardarDatos(), openOnboarding(),
 *   renderGemelo(), updateGemeloBar()
 */

(function () {
  'use strict';

  /* ── HTML del modal ─────────────────────────────────────────── */
  function _buildHTML() {
    return `
<div id="modal-onboarding-gemelo" style="
  position:fixed;inset:0;z-index:9998;
  background:rgba(0,0,0,.88);
  display:none;align-items:center;justify-content:center;
  padding:20px;
  padding-bottom:calc(20px + env(safe-area-inset-bottom));
">
  <div id="og-box" style="
    width:100%;max-width:420px;
    background:linear-gradient(160deg,#080c18 0%,rgba(212,175,55,.06) 100%);
    border:1px solid rgba(212,175,55,.3);
    border-radius:22px;overflow:hidden;
    box-shadow:0 0 60px rgba(212,175,55,.08),0 20px 60px rgba(0,0,0,.6);
  ">

    <!-- PANTALLA 1: Presentación -->
    <div id="og-screen-1" style="padding:36px 28px 32px">
      <div style="text-align:center;margin-bottom:26px">
        <div style="font-size:52px;margin-bottom:14px;line-height:1">🔮</div>
        <div style="
          font-family:'Orbitron',monospace;font-size:18px;font-weight:900;
          color:#d4af37;letter-spacing:.05em;margin-bottom:10px">
          Tu Gemelo Potenciado
        </div>
        <span style="
          font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:700;
          color:#d4af37;background:rgba(212,175,55,.12);
          border:1px solid rgba(212,175,55,.3);border-radius:20px;
          padding:3px 14px;letter-spacing:.08em">
          INCLUIDO EN TU PLAN
        </span>
      </div>

      <!-- Bloque 1 -->
      <div style="padding:16px 0;border-bottom:1px solid rgba(212,175,55,.1)">
        <div style="
          font-family:'Orbitron',monospace;font-size:10px;font-weight:700;
          color:rgba(212,175,55,.65);letter-spacing:.1em;margin-bottom:8px">
          ◆ OBSERVACIÓN SILENCIOSA
        </div>
        <div style="font-family:'Syne',sans-serif;font-size:13px;color:#c4cedd;line-height:1.7">
          Durante los próximos 30 días, Life OS registra en silencio tus patrones
          reales: cuándo produces más, qué hábitos mantienes, cómo fluye tu dinero,
          en qué gastas tu energía.
        </div>
      </div>

      <!-- Bloque 2 -->
      <div style="padding:16px 0;border-bottom:1px solid rgba(212,175,55,.1)">
        <div style="
          font-family:'Orbitron',monospace;font-size:10px;font-weight:700;
          color:rgba(212,175,55,.65);letter-spacing:.1em;margin-bottom:8px">
          ◆ SIN ENCUESTAS. SIN FORMULARIOS.
        </div>
        <div style="font-family:'Syne',sans-serif;font-size:13px;color:#c4cedd;line-height:1.7">
          No te preguntamos nada. Solo observamos lo que haces. Tus datos reales
          son más honestos que cualquier respuesta.
        </div>
      </div>

      <!-- Bloque 3 -->
      <div style="padding:16px 0 0">
        <div style="
          font-family:'Orbitron',monospace;font-size:10px;font-weight:700;
          color:rgba(212,175,55,.65);letter-spacing:.1em;margin-bottom:8px">
          ◆ UN ANÁLISIS QUE TE CONOCE
        </div>
        <div style="font-family:'Syne',sans-serif;font-size:13px;color:#c4cedd;line-height:1.7">
          Al día 30, recibes un análisis generado por IA basado exclusivamente en
          tu comportamiento. No genérico. No motivacional. Real.
        </div>
      </div>

      <!-- Botón activar -->
      <button id="og-activate-btn" onclick="window._OG_activate()" style="
        margin-top:28px;width:100%;padding:15px;border:none;border-radius:12px;
        background:linear-gradient(135deg,#d4af37,#b8940f);
        color:#0a0804;font-family:'Orbitron',monospace;
        font-size:12px;font-weight:900;letter-spacing:.07em;
        cursor:pointer;
        box-shadow:0 4px 24px rgba(212,175,55,.28);
        transition:opacity .2s;
      " onmouseover="this.style.opacity='.88'" onmouseout="this.style.opacity='1'">
        ✦ Activar mi Gemelo Potenciado
      </button>

      <div style="
        text-align:center;margin-top:12px;
        font-family:'JetBrains Mono',monospace;font-size:11px;
        color:rgba(128,148,180,.4);line-height:1.55">
        El Gemelo comienza a observar desde hoy.<br>
        No requiere ninguna acción de tu parte.
      </div>
    </div>

    <!-- PANTALLA 2: Confirmación / carga -->
    <div id="og-screen-2" style="padding:44px 28px 40px;display:none;text-align:center">
      <!-- Anillo de progreso -->
      <div style="width:88px;height:88px;margin:0 auto 22px;position:relative">
        <svg viewBox="0 0 88 88" style="width:88px;height:88px;transform:rotate(-90deg)">
          <circle cx="44" cy="44" r="38" fill="none"
            stroke="rgba(212,175,55,.15)" stroke-width="3"/>
          <circle id="og-ring-fill" cx="44" cy="44" r="38" fill="none"
            stroke="#d4af37" stroke-width="3"
            stroke-dasharray="238.76" stroke-dashoffset="238.76"
            style="transition:stroke-dashoffset 1.5s cubic-bezier(.4,0,.2,1)"/>
        </svg>
        <div style="
          position:absolute;inset:0;display:flex;align-items:center;
          justify-content:center;font-size:24px;color:#d4af37">✦</div>
      </div>

      <div style="
        font-family:'Orbitron',monospace;font-size:19px;font-weight:900;
        color:#d4af37;letter-spacing:.05em;margin-bottom:7px">
        Gemelo activado.
      </div>
      <div style="
        font-family:'JetBrains Mono',monospace;font-size:10px;
        color:rgba(212,175,55,.55);letter-spacing:.12em;margin-bottom:22px">
        DÍA 1 DE 30 · OBSERVACIÓN INICIADA
      </div>

      <div style="
        font-family:'Syne',sans-serif;font-size:13px;
        color:#c4cedd;line-height:1.75;margin-bottom:26px">
        Tu Gemelo Potenciado está activo desde este momento.<br>
        Sigue usando Life OS con normalidad.<br>
        No hay nada que hacer. Solo vivir.
      </div>

      <!-- Barra de progreso 0/30 -->
      <div style="margin-bottom:22px;text-align:left">
        <div style="
          display:flex;justify-content:space-between;
          margin-bottom:7px">
          <span style="
            font-family:'JetBrains Mono',monospace;font-size:10px;
            color:rgba(212,175,55,.45)">Día 0 / 30</span>
          <span style="
            font-family:'JetBrains Mono',monospace;font-size:10px;
            color:rgba(212,175,55,.45)">El análisis estará listo en 30 días</span>
        </div>
        <div style="height:4px;background:rgba(212,175,55,.1);border-radius:9px;overflow:hidden">
          <div style="height:100%;width:0%;background:#d4af37;border-radius:9px"></div>
        </div>
      </div>

      <!-- Estado de la escritura a Firestore -->
      <div id="og-status" style="
        font-family:'JetBrains Mono',monospace;font-size:11px;
        color:rgba(128,148,180,.42);min-height:18px;margin-bottom:14px">
        Guardando activación…
      </div>

      <!-- Botón continuar (deshabilitado hasta confirmar Firestore) -->
      <button id="og-continue-btn" disabled onclick="window._OG_continue()" style="
        width:100%;padding:14px;border:none;border-radius:12px;
        background:linear-gradient(135deg,#d4af37,#b8940f);
        color:#0a0804;font-family:'Orbitron',monospace;
        font-size:11px;font-weight:900;letter-spacing:.07em;
        opacity:.38;cursor:not-allowed;transition:all .25s;
      ">Continuar → Elegir mis tareas de hoy</button>

      <!-- Zona de error -->
      <div id="og-error" style="display:none;margin-top:18px">
        <div style="
          font-family:'Syne',sans-serif;font-size:12px;
          color:#f87171;line-height:1.5;margin-bottom:12px">
          Hubo un problema al activar. Intenta de nuevo.
        </div>
        <button onclick="window._OG_retry()" style="
          background:none;
          border:1px solid rgba(248,113,113,.38);
          border-radius:10px;color:#f87171;
          padding:9px 22px;
          font-family:'Syne',sans-serif;font-size:12px;
          cursor:pointer;transition:border-color .2s;
        " onmouseover="this.style.borderColor='rgba(248,113,113,.7)'"
           onmouseout="this.style.borderColor='rgba(248,113,113,.38)'">
          ↺ Reintentar
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  #modal-onboarding-gemelo[data-visible="1"] { display:flex !important; animation:og-overlay-in .28s ease; }
  #og-box { animation:og-slide-up .32s cubic-bezier(.4,0,.2,1); }
  @keyframes og-overlay-in { from{opacity:0} to{opacity:1} }
  @keyframes og-slide-up    { from{opacity:0;transform:translateY(22px)} to{opacity:1;transform:translateY(0)} }
</style>`;
  }

  /* ── Inyectar HTML en el body ───────────────────────────────── */
  function _injectModal() {
    if (document.getElementById('modal-onboarding-gemelo')) return;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = _buildHTML();
    while (wrapper.firstChild) document.body.appendChild(wrapper.firstChild);
  }

  /* ── API pública ────────────────────────────────────────────── */

  /**
   * showOnboardingGemelo()
   * Muestra el modal en Pantalla 1. Llamado desde main.js.
   */
  window.showOnboardingGemelo = function () {
    _injectModal();
    const modal = document.getElementById('modal-onboarding-gemelo');
    if (!modal) return;

    // Resetear a pantalla 1
    const s1 = document.getElementById('og-screen-1');
    const s2 = document.getElementById('og-screen-2');
    if (s1) { s1.style.display = 'block'; s1.style.opacity = '1'; }
    if (s2) s2.style.display = 'none';

    modal.style.display = 'flex';
    modal.setAttribute('data-visible', '1');
  };

  /**
   * _OG_activate() — Pantalla 1 → Pantalla 2 + escritura a Firestore
   */
  window._OG_activate = async function () {
    const s1 = document.getElementById('og-screen-1');
    const s2 = document.getElementById('og-screen-2');
    if (!s1 || !s2) return;

    // Fade out pantalla 1
    s1.style.transition = 'opacity .2s';
    s1.style.opacity = '0';
    await _delay(200);
    s1.style.display = 'none';

    // Fade in pantalla 2
    s2.style.opacity = '0';
    s2.style.display = 'block';
    await _delay(20);
    s2.style.transition = 'opacity .2s';
    s2.style.opacity = '1';

    // Lanzar anillo (0 → completo en 1.5s)
    const ring = document.getElementById('og-ring-fill');
    if (ring) requestAnimationFrame(() => { ring.style.strokeDashoffset = '0'; });

    // Escribir a Firestore (mínimo 1.6s para que el anillo termine)
    await Promise.all([_OG_writeToFirestore(), _delay(1600)]);
  };

  /**
   * Escribe los campos del Gemelo en Firestore y espera confirmación.
   * Habilita el botón "Continuar" solo al recibir OK.
   */
  async function _OG_writeToFirestore() {
    const statusEl     = document.getElementById('og-status');
    const continueBtn  = document.getElementById('og-continue-btn');
    const errorEl      = document.getElementById('og-error');

    if (errorEl)   errorEl.style.display = 'none';
    if (statusEl)  { statusEl.style.color = 'rgba(128,148,180,.42)'; statusEl.textContent = 'Guardando activación…'; }

    try {
      const now      = new Date();
      const todayStr = (typeof today === 'function') ? today() : now.toISOString().split('T')[0];
      const pts      = (typeof _countGemeloPoints === 'function') ? _countGemeloPoints() : 0;

      // 1. Actualizar estado local (S)
      if (typeof S !== 'undefined') {
        S.gemelo = {
          state:      'observing',
          startDate:  todayStr,
          dataPoints: pts,
          lastAnalysis: null,
          survivalTasks: {},
          consentDate: now.toISOString(),
        };
        S.geminoPotenciado = {
          activado:          true,
          fechaActivacion:   now.toISOString(),
          diasObservacion:   0,
          analisisGenerado:  false,
        };
        S.onboardingGemeloCompletado = true;
        S.primeraSesion              = false;
      }

      // 2. Escribir a Firestore (solo si la nube está disponible)
      if (
        typeof CLOUD_ENABLED !== 'undefined' && CLOUD_ENABLED &&
        typeof _auth !== 'undefined' && _auth?.currentUser &&
        typeof _db   !== 'undefined' && _db
      ) {
        const uid = _auth.currentUser.uid;
        const ref = _db.collection('users').doc(uid).collection('data').doc('main');

        const payload = {
          gemelo:                    S.gemelo,
          geminoPotenciado:          S.geminoPotenciado,
          onboardingGemeloCompletado: true,
          primeraSesion:             false,
        };

        // Añadir server timestamp si firebase global está disponible
        if (typeof firebase !== 'undefined' && firebase.firestore) {
          payload._updatedAt = firebase.firestore.FieldValue.serverTimestamp();
        }

        await ref.set(payload, { merge: true });
      }

      // 3. Guardar en caché local
      if (typeof guardarDatos === 'function') guardarDatos();

      // 4. Habilitar botón "Continuar"
      if (statusEl) { statusEl.style.color = '#4ade80'; statusEl.textContent = '✓ Activación confirmada'; }
      if (continueBtn) {
        continueBtn.disabled   = false;
        continueBtn.style.opacity = '1';
        continueBtn.style.cursor  = 'pointer';
      }

    } catch (e) {
      console.error('[OnboardingGemelo] Error Firestore:', e);
      if (statusEl)  statusEl.textContent = '';
      if (errorEl)   errorEl.style.display = 'block';
    }
  }

  /** Reintento de escritura a Firestore */
  window._OG_retry = function () {
    const errorEl = document.getElementById('og-error');
    if (errorEl) errorEl.style.display = 'none';
    _OG_writeToFirestore();
  };

  /**
   * _OG_continue() — cierra el modal y abre la selección de 3 tareas
   */
  window._OG_continue = function () {
    const modal = document.getElementById('modal-onboarding-gemelo');
    if (modal) {
      modal.style.transition = 'opacity .3s';
      modal.style.opacity    = '0';
      setTimeout(() => {
        modal.style.display  = 'none';
        modal.style.opacity  = '';
        modal.removeAttribute('data-visible');
      }, 300);
    }

    // Siguiente paso: selección de misiones semilla (3 tareas iniciales)
    setTimeout(() => {
      if (typeof S !== 'undefined' && !S.onboardingDone && (!S.tasks || S.tasks.length === 0)) {
        if (typeof openOnboarding === 'function') openOnboarding();
      }
      // Refrescar widgets del Gemelo en el dashboard
      if (typeof renderGemelo      === 'function') renderGemelo();
      if (typeof updateGemeloBar   === 'function') updateGemeloBar();
      if (typeof updateFABVisibility === 'function') updateFABVisibility();
    }, 400);
  };

  /* ── Helpers ────────────────────────────────────────────────── */
  function _delay(ms) { return new Promise(r => setTimeout(r, ms)); }

  /* ── Auto-inyectar modal HTML en el DOM al cargar ───────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _injectModal);
  } else {
    _injectModal();
  }

})();
