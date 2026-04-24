# CLAUDE.md — Fuente de verdad del proyecto
> Actualizar al final de cada sesión. Este archivo es el contexto permanente.

## PROPÓSITO
OpenClaw es el tester E2E de Life OS. Todo en este repo existe para que
OpenClaw corra limpio, estable y apuntando siempre al entorno correcto.
Producción nunca se toca durante pruebas. Staging es el campo de juego.

## LOS TRES SCRIPTS — TODOS SON OBLIGATORIOS, NINGUNO SE ELIMINA

| Script | Propósito | Modo | Estado |
|---|---|---|---|
| `scripts/runner.js` | Runner E2E diario — navega la app y verifica que todo funciona | Manual por ahora | Automático nocturno PENDIENTE hasta tener usuarios |
| `scripts/analyze-deep.js` | Análisis GPT-5.5 Vision profundo — 9 grupos temáticos, max 6000 tokens por grupo | Manual post-run | Activo |
| `scripts/analyze.js` | Análisis GPT-5.5 Vision ligero — 3 días de reportes, propuestas de mejora | Manual post-run | Activo |

Flujo normal: `node runner.js --deep` — un solo comando hace todo: E2E → screenshots → analyze.js → analyze-deep.js.
Para correr SOLO el análisis sin el runner: `node analyze.js` o `node analyze-deep.js`

Cualquier otro archivo runner/analyze que no sea estos tres exactos = duplicado no autorizado.

## REGLAS QUE NUNCA SE ROMPEN
- R1. Firebase producción `life-os-prod-3a590` — solo con autorización explícita del usuario
- R2. Exactamente UN runner.js, UN analyze-deep.js, UN analyze.js — sin copias ni versiones
- R3. runner.js siempre apunta a staging (`https://mylifeos-staging.web.app`)
- R4. runner.js NO se programa en automático hasta que el usuario lo autorice
- R5. Credenciales siempre en `.env` — nunca hardcodeadas en `.js`
- R6. `.env` siempre en `.gitignore` — nunca en git
- R7. Si algo está raro → PARA y avísame antes de actuar
- R8. Actualizar este archivo al terminar cada sesión

## RUTAS ABSOLUTAS — CRÍTICO

### En el VPS (srv1535845 / root@187.77.219.106)
```
/opt/openclaw/
├── .env                          ← credenciales (QA_USER_EMAIL, QA_USER_PASSWORD, OPENAI_API_KEY, FIREBASE_CI_TOKEN)
├── runner.js                     ← copia de trabajo (actualizar con sync)
├── analyze.js                    ← copia de trabajo
├── analyze-deep.js               ← copia de trabajo
└── repo/
    └── lifeos/                   ← git clone raíz
        └── Documents/
            └── Life Os/          ← aquí están los archivos del proyecto
                ├── main.js
                ├── index.html
                ├── scripts/
                │   ├── runner.js
                │   ├── analyze.js
                │   └── analyze-deep.js
                └── qa-reports/
```

### Comandos sync VPS (copiar/pegar completo)
```bash
cd /opt/openclaw/repo/lifeos && git pull origin main && cp "Documents/Life Os/scripts/runner.js" /opt/openclaw/runner.js && cp "Documents/Life Os/scripts/analyze.js" /opt/openclaw/analyze.js && cp "Documents/Life Os/scripts/analyze-deep.js" /opt/openclaw/analyze-deep.js
```

### Deploy a staging (Firebase Hosting)
```bash
cd "/opt/openclaw/repo/lifeos/Documents/Life Os" && firebase deploy --only hosting:staging --project mylifeos-staging
```
- ⚠️ `--token` deprecado en firebase-tools 15.x — usar `firebase login --no-localhost` si expira sesión
- firebase.json DEBE estar en `Documents/Life Os/` — el deploy falla si se corre desde la raíz del repo
- Si dice "Failed to authenticate": correr `firebase login --no-localhost` en el VPS

### Correr OpenClaw
```bash
# Pipeline completo
cd /opt/openclaw && node runner.js --deep

# Solo análisis (sin runner E2E)
cd /opt/openclaw && node analyze.js
cd /opt/openclaw && node analyze-deep.js
```

### Ver progreso en tiempo real
```bash
ls -t /opt/openclaw/repo/lifeos/qa-reports/*.md | head -1 | xargs tail -f
```

## PROYECTO
- Nombre: Life OS | URL: https://mylifeos.lat
- Stack: HTML/CSS/JS vanilla, Firebase, Stripe
- Firebase producción: `life-os-prod-3a590` (Blaze, nam5) ← SAGRADO
- Firebase staging: `mylifeos-staging`
- Dominio: Namecheap → Vercel

## ARQUITECTURA
```
/
├── main.js              → App principal (~11,700 líneas) — auto-detecta staging/prod por hostname
├── index.html           → Carga main.js
├── styles.css           → Estilos — incluye sección AURA MODE DESIGN SYSTEM
├── firebase-messaging-sw.js  → Service worker notificaciones
├── firestore.rules      → Reglas producción (estrictas)
├── firestore.staging.rules → Reglas staging (permisivas)
├── firebase.json        → Multi-target: production + staging
├── .firebaserc          → default=staging
├── scripts/
│   ├── runner.js        → Runner E2E
│   ├── analyze-deep.js  → GPT-5.5 Vision profundo (9 grupos)
│   ├── analyze.js       → GPT-5.5 Vision ligero
│   ├── set-qa-pro.js    → Da is_pro:true al usuario QA via Firebase Auth REST + Firestore PATCH
│   ├── seedDemoUser.js  → Semilla usuario demo
│   ├── setup-qa-user.js → Crea usuario QA en staging
│   └── firebase-adc.json → Credenciales ADC — en git por necesidad operativa
├── functions/
│   └── index.js         → Cloud Functions (Stripe, etc.)
└── qa-reports/          → Reportes y screenshots QA
```

## CREDENCIALES
- QA staging: `qa-test@mylifeos-staging.com` / `OpenClaw2026!`
- Solo existe en staging — NO en producción
- Ubicación: `/opt/openclaw/.env`

## MODELO DE IA — IMPORTANTE
- analyze.js y analyze-deep.js usan **GPT-5.5** (`model: 'gpt-5.5'`)
- GPT-5.5 NO soporta `temperature` ni `top_p` — solo `max_completion_tokens`
- GPT-5.5 usa `max_completion_tokens` en vez de `max_tokens`
- Imágenes con `detail: 'low'` (85 tokens vs 950) — evita límite TPM
- Cap de screenshots: 20 en analyze.js, agrupados en analyze-deep.js

## ESTADO ACTUAL
- ✅ runner.js --deep pipeline completo funcionando
- ✅ analyze.js + analyze-deep.js migrados a GPT-5.5
- ✅ analyze.js: prompt v2 — rol Motion/Canvas, rol Living Data & Motion UX Strategist, criterios Aura, AuraChart spec, veredicto motion
- ✅ Flow: ícono menú cambiado a ✅ (quitó 🌊) en navItems, BN_ORDER, iconMap
- ✅ Flow: título interno sin emoji (solo "FLOW")
- ✅ Flow: page-title con glow verde `text-shadow: 0 0 18px rgba(0,255,136,.35)`
- ✅ Agenda: cal-event con padding y min-height mejorados (touch target)
- ✅ equipRoom(): confetti/orbs al equipar habitación
- ✅ toggleHabit(): confetti/orbs al completar hábito (sesión anterior)
- ✅ unlockRoom(): confetti/orbs + unlock-glow (sesión anterior)
- ✅ TERM_DICT + _applyVisualMode() — terminología dinámica XP↔Aura
- ✅ renderDynamicShortcuts() — dashboard inteligente top 3 módulos
- ✅ NLP: "me cayó el veinte" → crea tarea (early detection)
- ✅ Modo Aura .btn-a override CSS con !important y alta especificidad
- ✅ @keyframes unlockGlow + .unlock-glow en styles.css
- ✅ set-qa-pro.js — da is_pro:true al QA via Firebase Auth REST API
- ✅ Firebase deploy: usar `firebase login --no-localhost` (--token deprecado en v15.x)
- ⚠️ Pendiente: AuraChart canvas partículas (próxima sesión — alta prioridad)
- ⚠️ Pendiente: runner --deep completo para verificar estado post todos los cambios
- ⚠️ Pendiente: demo@mylifeos.lat en Firebase prod para iPhone mockup

## FLUJO RECOMENDADO
```bash
# Pipeline completo (~25-30 min)
cd /opt/openclaw && node runner.js --deep

# Solo análisis sobre screenshots existentes (rápido)
cd /opt/openclaw && node analyze-deep.js
```

## DIAGNÓSTICO — GPT-5.5 ALUCINACIONES CONOCIDAS
- `[GAMIFICACIÓN] Hábitos: falta feedback visual` → confetti ya implementado en toggleHabit()
- `[BUG] Modo Aura: xp-bar-fill cyan` → ya tiene gradient en body[data-mode="aura"]
- `[BUG] Botones .btn-a cyan en Aura` → ya tiene override CSS con !important
- `botón "Aprender" en Hábitos` → no existe en el código, ignorar

## ÚLTIMA SESIÓN
- Fecha: 2026-04-24
- Último commit: `329c8cb`
- Deploy: staging ✅ https://mylifeos-staging.web.app

### Cambios sesión 2026-04-24

#### scripts/analyze.js
- Migrado de Gemini a GPT-5.5 (`model: 'gpt-5.5'`)
- Prompt v2 completamente reescrito: principio central, 8 roles, sistema visual dual, backlog, formato obligatorio
- Quitados `temperature` y `top_p` (no soportados por GPT-5.5)
- `max_tokens` → `max_completion_tokens`
- `detail: 'low'` en imágenes, cap 20 screenshots
- Nuevos roles: 🎨 Motion/Canvas Engineer, 🌌 Living Data & Motion UX Strategist
- AuraChart spec en backlog: canvas partículas, 6 nodos, física de atractores
- Verificaciones Aura expandidas: 10 checks específicos
- Veredicto motion obligatorio en ---ANALYSIS---
- Tipos nuevos: CANVAS, MOTION, LIVING-DATA, MICROINTERACTION, MOTION-TRANSITION, AMBIENT-MOTION, GAMIFICATION-FEEDBACK, EMPTY-STATE-MOTION, SVG-MOTION, CSS-MOTION

#### scripts/analyze-deep.js
- Migrado a GPT-5.5
- `max_tokens` → `max_completion_tokens`
- `detail: 'low'` en imágenes

#### scripts/set-qa-pro.js (nuevo)
- Da is_pro:true al QA sin consola Firebase
- Uso: `node set-qa-pro.js` desde /opt/openclaw

#### main.js
- Flow ícono: 🌊 → ✅ en navItems, BN_ORDER, iconMap (línea ~399, ~430, ~451, ~6070)
- toggleHabit(): confetti/orbs al completar
- unlockRoom(): confetti/orbs + unlock-glow
- equipRoom(): confetti/orbs al equipar
- NLP: detección "me cayó el veinte" → task
- TERM_DICT + _applyVisualMode() para terminología dinámica
- renderDynamicShortcuts() + hydrateDashboard() + navigate() visit count
- setVisualMode() dispara CustomEvent 'lifeos:theme-change'

#### index.html
- Flow page-title: "FLOW ✅" → "FLOW"
- data-term en stat-cards del dashboard y sidebar
- #db-dynamic-shortcuts en page-dashboard

#### styles.css
- [data-module="flow"] .page-title: text-shadow glow verde
- .cal-event: padding+min-height+cursor (touch target)
- body[data-mode="aura"] .btn-a: override !important alta especificidad
- @keyframes unlockGlow + .unlock-glow

### Pendientes próxima sesión — PRIORIDAD ORDENADA

#### Alta prioridad
1. **AuraChart canvas** — Pilar 1 completo. Canvas de partículas con 6 nodos (Mente/Cuerpo/Flow/Finanzas/Aprende/Mundo), física de atractores ponderados por score, render radialGradient pastel, monta/desmonta via `lifeos:theme-change`. Reemplaza radar chart en Modo Aura. API: `window.LifeOSAuraChart.updateScores(scores)` + `emitBurst()`. Desktop: 120-220 partículas. Mobile: 60-110. Reduced motion: 20-40.
2. **Runner --deep** — verificar estado real de todos los cambios de esta sesión

#### Media prioridad
3. **Aura light polish** — overrides !important para todos los inline styles en modo claro
4. **Push notifications deep linking** — triggers 8pm hábitos, 9pm racha, 7am briefing
5. **Orden dinámico bottom nav** — reordenar BN_ORDER según _bnVisitCount
6. **Onboarding narrativo** — pantalla XP/Aura antes del primer dashboard

#### Baja prioridad
7. **Demo user** — `demo@mylifeos.lat` en Firebase prod para iPhone mockup
8. **Vitrina pública** — carruseles desde dailyLogs
9. **Runner nocturno automático** — esperar usuarios reales
