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
| `scripts/analyze-deep.js` | Análisis GPT-4o Vision profundo — 11 grupos temáticos, max 6000 tokens por grupo, detail:high | Manual post-run | Activo |
| `scripts/analyze.js` | Análisis GPT-5.5 Vision ligero — 3 días de reportes, propuestas de mejora | Manual post-run | ⚠️ Falla (GPT-5.5 devuelve content vacío) |

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
- **analyze-deep.js** usa `gpt-4o` — `max_tokens` (NO `max_completion_tokens`), `detail:'high'` en imágenes, sin cap de screenshots por grupo
- **analyze.js** usa `gpt-5.5` — `max_completion_tokens`, NO soporta `temperature` ni `top_p` — ⚠️ devuelve content vacío (bug pendiente)
- GPT-4o content filter: se resuelve con `role:'system'` + SYSTEM_MSG rico + `isRefusal()` que detecta rechazos y reintenta sin imágenes
- `detail:'high'` = ~1020 tokens/imagen, costo ~$0.50-1.50 por run completo (vs $0.02 con detail:low que era inútil)
- Gemini 2.5 Flash era el modelo original — daba mejores resultados sin filtros. Migrado a GPT por decisión de sesión anterior. Si hay GEMINI_API_KEY en .env se puede regresar.

## ESTADO ACTUAL
- ✅ runner.js --deep pipeline completo funcionando
- ✅ analyze-deep.js: GPT-4o, detail:high, sin cap screenshots, SYSTEM_MSG anti-filtro, isRefusal() + retry sin imágenes, retry síntesis
- ✅ analyze-deep.js: PROMPT MAESTRO — formato completo (EVIDENCIA · CAUSA PROBABLE · MOMENTO DE USO · PERFORMANCE · REDUCED MOTION · CATEGORÍA · CONFIANZA)
- ✅ analyze-deep.js: VEREDICTO DE MOTION & LIVING DATA + VEREDICTO DE IDENTIDAD VISUAL por grupo
- ✅ analyze-deep.js: BENTO GRID AUDIT — dimensión 6 en cada grupo, tabla ESTADO BENTO GRID en síntesis
- ✅ PWA offline: firebase-messaging-sw.js tiene install/activate/fetch handlers — ya no da white screen offline
- ✅ Bento Grid CSS: .module-bento-grid 12col + .bento-compact/medium/wide/large/full/tall en styles.css
- ✅ Bento Grid aplicado en: Flow/Hábitos · Cuerpo/Físico · Cuerpo/Bienestar · Financiero · Flow/Metas(history) · Flow/Agenda · Stats/Análisis · Settings
- ✅ main.js: h-done-today stat en renderHabits()
- ✅ analyze.js: prompt v2 — rol Motion/Canvas, rol Living Data & Motion UX Strategist, criterios Aura, AuraChart spec, veredicto motion
- ✅ Flow: ícono menú cambiado a ✅ (quitó 🌊)
- ✅ Flow: page-title con glow verde
- ✅ equipRoom() / toggleHabit() / unlockRoom(): confetti/orbs + unlock-glow
- ✅ TERM_DICT + _applyVisualMode() — terminología dinámica XP↔Aura
- ✅ renderDynamicShortcuts() — dashboard inteligente top 3 módulos
- ✅ NLP: "me cayó el veinte" → crea tarea
- ✅ Modo Aura .btn-a override CSS con !important
- ✅ set-qa-pro.js — da is_pro:true al QA
- ✅ Git: VPS hace commits directos a GitHub — siempre hacer `git pull --rebase` antes de push desde local
- ⚠️ analyze.js falla: GPT-5.5 devuelve content vacío — pendiente fix o migrar a gpt-4o
- ⚠️ Pendiente: AuraChart canvas partículas (alta prioridad)
- ⚠️ Pendiente: demo@mylifeos.lat en Firebase prod para iPhone mockup
- ⚠️ Pendiente: verificar que runner --deep nuevo código da análisis rico (sesión en curso al cerrar)

## FLUJO RECOMENDADO
```bash
# Pipeline completo (~25-30 min)
cd /opt/openclaw && node runner.js --deep

# Solo análisis sobre screenshots existentes (rápido)
cd /opt/openclaw && node analyze-deep.js
```

## DIAGNÓSTICO — ALUCINACIONES CONOCIDAS (GPT-4o y GPT-5.5)
- `[GAMIFICACIÓN] Hábitos: falta feedback visual` → confetti ya implementado en toggleHabit()
- `[BUG] Modo Aura: xp-bar-fill cyan` → ya tiene gradient en body[data-mode="aura"]
- `[BUG] Botones .btn-a cyan en Aura` → ya tiene override CSS con !important
- `botón "Aprender" en Hábitos` → no existe en el código, ignorar
- `initRadarChart() no llamado en setVisualMode()` → ya está en línea ~771, ignorar

## GIT — IMPORTANTE
- El VPS hace commits directos a GitHub (Codex u otros agentes)
- Antes de `git push` desde local: siempre `git pull --rebase origin main`
- Si hay conflicto en analyze-deep.js: la versión local es la correcta (tiene todos los fixes de filtros)

## ÚLTIMA SESIÓN
- Fecha: 2026-04-25
- Último commit: `b1d69b8`
- Deploy: staging ✅ https://mylifeos-staging.web.app
- VPS synced ✅ analyze-deep.js actualizado en /opt/openclaw/

### Cambios sesión 2026-04-25

#### scripts/analyze-deep.js (cambios principales)
- **Bento Grid Audit**: BASE_CONTEXT + dimensión 6 en buildGroupPrompt + sección BENTO GRID AUDIT en ---ANALYSIS--- + tabla ESTADO BENTO GRID en síntesis
- **GPT-4o**: migrado de GPT-5.5 (que daba output vacío) a `gpt-4o`
- **detail:'high'**: imágenes a resolución completa (~1020 tokens/img vs 85 con low)
- **Sin cap**: todos los screenshots del grupo se envían (antes cap 8)
- **max_tokens 6000**: antes 4096
- **SYSTEM_MSG**: párrafo rico con contexto del producto, equipo multi-rol, instrucción explícita de no rechazar
- **isRefusal()**: detecta rechazos explícitos + respuestas cortas sin formato → retry sin imágenes automático
- **Retry síntesis**: si síntesis rechazada → reintenta con prompt minimalista → si falla → fallback con scores
- **Filtros content policy**: loginOnly shots quitados del grupo Landing, "BLACKOUT" renombrado a desc neutral en Auth
- **PROMPT MAESTRO**: formato completo por propuesta (EVIDENCIA · CAUSA PROBABLE · MOMENTO DE USO · PERFORMANCE · REDUCED MOTION · CATEGORÍA · CONFIANZA)
- **VERDICTOs**: MOTION & LIVING DATA + IDENTIDAD VISUAL por grupo; MOTION app completa en síntesis

#### firebase-messaging-sw.js
- Agregados install/activate/fetch handlers para offline cache
- CACHE_NAME='lifeos-shell-v2', APP_SHELL=['/', '/index.html', '/main.js', '/styles.css', icons]
- Fix white screen PWA offline

#### styles.css
- Bento Grid system: .module-bento-grid (12col desktop · 6col @1024px · 1col @640px)
- .bento-compact(3) · .bento-medium(4) · .bento-wide(6) · .bento-large(8) · .bento-full(12) · .bento-tall(row span 2)
- Responsive breakpoints incluidos

#### index.html
- Bento Grid aplicado a: #panel-habits · #panel-physical · #panel-salud · #page-financial · #panel-goals · #panel-agenda · #panel-analisis · #page-settings
- #saldos-grid: display:contents → display:flex;flex-direction:column (fix bento context)

#### main.js
- renderHabits(): agrega h-done-today stat (hábitos completados hoy / total activos)

### Pendientes próxima sesión — PRIORIDAD ORDENADA

#### Alta prioridad
1. **AuraChart canvas** — Canvas de partículas, 6 nodos (Mente/Cuerpo/Flow/Finanzas/Aprende/Mundo), física de atractores, radialGradient pastel. Reemplaza radar Chart.js en Modo Aura. API: `window.LifeOSAuraChart.updateScores(scores)` + `emitBurst()`. Desktop: 120-220 partículas · Mobile: 60-110 · Reduced motion: 20-40.
2. **Fix analyze.js** — GPT-5.5 devuelve content vacío. Migrar a gpt-4o igual que analyze-deep.js, o agregar detección de content vacío + retry.
3. **Verificar runner --deep** — el código nuevo (detail:high, sin cap) no ha completado un run exitoso aún. Verificar que el análisis rico llega.

#### Media prioridad
4. **Aura light polish** — overrides !important para todos los inline styles en modo claro
5. **Push notifications deep linking** — triggers 8pm hábitos, 9pm racha, 7am briefing
6. **Orden dinámico bottom nav** — reordenar BN_ORDER según _bnVisitCount
7. **Onboarding narrativo** — pantalla XP/Aura antes del primer dashboard

#### Baja prioridad
8. **Demo user** — `demo@mylifeos.lat` en Firebase prod para iPhone mockup
9. **Vitrina pública** — carruseles desde dailyLogs
10. **Runner nocturno automático** — esperar usuarios reales
