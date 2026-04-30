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
| `scripts/analyze-deep.js` | Análisis Claude Sonnet 4.6 profundo — 11 grupos temáticos, max 6000 tokens por grupo | Manual post-run | ✅ Activo |
| `scripts/analyze.js` | Análisis Claude Sonnet 4.6 ligero — 3 días de reportes + 20 screenshots, propuestas de mejora | Manual post-run | ✅ Activo |

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
cd "/opt/openclaw/repo/lifeos/Documents/Life Os" && GOOGLE_APPLICATION_CREDENTIALS="/opt/openclaw/repo/lifeos/Documents/Life Os/scripts/firebase-adc.json" firebase deploy --only hosting:staging --project mylifeos-staging
```
- ⚠️ Siempre usar `GOOGLE_APPLICATION_CREDENTIALS` con `firebase-adc.json` — `firebase login` falla en el VPS (headless, no-localhost tampoco funciona)
- firebase.json DEBE estar en `Documents/Life Os/` — el deploy falla si se corre desde la raíz del repo
- `--token` deprecado en firebase-tools 15.x

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
│   ├── analyze-deep.js  → Gemini 2.0 Flash Vision profundo (11 grupos)
│   ├── analyze.js       → Gemini 2.0 Flash Vision ligero
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
- **Ambos scripts** usan `gemini-2.0-flash` via `generativelanguage.googleapis.com/v1beta`
- **analyze-deep.js** → `maxOutputTokens: 8192`, imágenes en formato Gemini (`inlineData`), sin cap de screenshots por grupo
- **analyze.js** → `maxOutputTokens: 4096`, cap 20 screenshots (ligero por diseño), lee 3 días de reportes
- API: URL con `?key=GEMINI_API_KEY`, sin headers especiales de auth
- Response: `json.candidates[0].content.parts[0].text`
- `GEMINI_API_KEY` en `/opt/openclaw/.env` — NUNCA en git (obtener en aistudio.google.com/apikey)
- ⚠️ Al reiniciar: verificar que GEMINI_API_KEY tenga la key real (no el placeholder "TU_KEY_AQUI")
- Respaldos históricos en scripts/ (NO eliminar): ORIGINAL-GEMINI.js, BACKUP-GPT4O, BACKUP-GPT55

## NUEVAS FEATURES — SESIÓN 7 (2026-04-29)

### Pilar 3 — Onboarding Progresivo + Split-Screen Identity
- `#form-register` reemplazado con wizard de 3 pasos: Nombre → Acceso → Identidad
- Paso 4: `#ob-identity-screen` — full-viewport split XP vs Aura
- Hover sobre cada lado llama `obPreviewMode(mode)` → live preview del tema
- Click llama `obChooseMode(mode)` → guarda `visualMode` en Firestore + llama `doRegister()`
- CSS: `.ob-step`, `.ob-dot`, `.ob-identity-half`, `.ob-side-xp`, `.ob-side-aura`, `.ob-sparkle`
- `switchAuthTab('register')` ahora resetea el wizard al paso 1

### Pilar 2A — Bitácora Cultural
- Bitácora ahora tiene 3 tabs: ✍️ Reflexión | 📚 Libro | 🎬 Película
- Búsqueda libros: Google Books API (sin key, anónima, 1000 req/día por IP)
- Búsqueda películas: TMDB API — requiere `S.tmdbApiKey` (configurable desde Settings → APIs)
- Guardar selección: añade a `S.bitacora[]` con metadata rica + a `S.mediaLibrary[]`
- `S.mediaLibrary[]` es la fuente de datos para la Vitrina
- `renderBitacoraList()` actualizado: muestra portadas para entradas tipo libro/película

### Pilar 2B — Vitrina Pública (Modal `#modal-vitrina`)
- Acceso: Settings → "✦ Mi Vitrina" o `openMiVitrina()` desde cualquier módulo
- Hero: avatar, nombre, publicId, stats (XP, Nivel, Racha)
- Privacy panel: toggles por categoría (Libros / Cine / Música) — solo visible en perfil propio
- `toggleVitrinaPrivacy(cat)` — actualiza `S.vitrinaPrivacy` + sync a Firestore
- Carruseles Netflix-style con `scroll-snap-type: x mandatory`
- `openPerfilPublico(uid)` — para ver vitrina de otros usuarios (aliados, leaderboard)
- `shareVitrina()` — copia URL pública o usa Web Share API

### Pilar 2C — Spotify OAuth
- Botón "Vincular con Spotify" en `#vitrina-sec-musica`
- `connectSpotify()` → redirect OAuth (requiere `S.spotifyClientId`)
- Cloud Functions: `spotifyExchangeToken` + `spotifyRefreshToken` en `functions/index.js`
- Config VPS: `firebase functions:config:set spotify.client_id="..." spotify.client_secret="..."`
- Tokens guardados en `users/{uid}/data/spotify` (NUNCA en el cliente)
- Tracks sincronizados a `userDirectory/{uid}.spotifyTopTracks[]`

### Schema Firestore extendido
```
S.mediaLibrary[]       → [{id, tipo, titulo, autorDirector, coverUrl, mediaId, fecha, nota}]
S.vitrinaPrivacy       → {libros:bool, cine:bool, musica:bool}
S.spotifyConnected     → bool
S.spotifyTopTracks[]   → [{name, artist, albumArt, spotifyUrl}]
S.tmdbApiKey           → string (configurable)
S.spotifyClientId      → string (configurable)

userDirectory/{uid}:
  + libros[]           → items públicos (vaciado si privacy.libros=false)
  + peliculas[]        → items públicos
  + spotifyTopTracks[] → tracks (vaciado si privacy.musica=false)
  + vitrinaPrivacy     → {libros, cine, musica}
  + spotifyConnected   → bool
```

### Keys externas necesarias (staging/prod)
- TMDB API Key: https://www.themoviedb.org/settings/api
- Spotify App: https://developer.spotify.com/dashboard → Client ID + Secret
- Redirecit URI en Spotify App: `https://mylifeos-staging.web.app/spotify-callback`

## ESTADO ACTUAL
- ✅ runner.js --deep pipeline completo funcionando
- ✅ analyze-deep.js: Gemini 2.0 Flash, prompts base ORIGINAL-GEMINI, sin cap screenshots por grupo
- ✅ analyze-deep.js: health regex flexible — no depende del emoji 💊
- ✅ analyze-deep.js: Bento Grid 2026 — dimensión 6 por grupo + veredictos BENTO/WEB/iOS/MOTION en síntesis
- ✅ analyze-deep.js: roles nuevos — Living Data Strategist + Adaptive Bento Layout Strategist
- ✅ analyze-deep.js: 25+ tipos válidos nuevos (BENTO-LAYOUT, CARD-DENSITY, LIVING-DATA, MICROINTERACTION, etc.)
- ✅ analyze-deep.js: formato propuestas enriquecido — EVIDENCIA, PLATAFORMA, PERFORMANCE, REDUCED MOTION, CONFIANZA
- ✅ analyze.js: Gemini 2.0 Flash, mismos roles y veredictos que analyze-deep.js
- ✅ analyze.js: PLATAFORMA + PERFORMANCE + REDUCED MOTION en propuestas
- ✅ PWA offline: firebase-messaging-sw.js tiene install/activate/fetch handlers
- ✅ Bento Grid CSS: .module-bento-grid 12col + .bento-compact/medium/wide/large/full/tall en styles.css
- ✅ Bento Grid aplicado en: Flow/Hábitos · Cuerpo/Físico · Cuerpo/Bienestar · Financiero · Flow/Metas · Flow/Agenda · Stats/Análisis · Settings
- ✅ main.js: h-done-today stat en renderHabits()
- ✅ Flow: ícono menú ✅, page-title glow verde
- ✅ equipRoom() / toggleHabit() / unlockRoom(): confetti/orbs + unlock-glow
- ✅ TERM_DICT + _applyVisualMode() — terminología dinámica XP↔Aura
- ✅ renderDynamicShortcuts() — dashboard inteligente top 3 módulos
- ✅ NLP: "me cayó el veinte" → crea tarea
- ✅ Modo Aura .btn-a override CSS con !important
- ✅ set-qa-pro.js — da is_pro:true al QA
- ✅ Git: VPS hace commits directos a GitHub — siempre `git pull --rebase` antes de push desde local
- ✅ runner.js: log corregido — "Claude Sonnet 4.6" en vez de "Gemini Vision"
- ✅ analyze.js: log corregido — "Claude Sonnet 4.6 Vision" en vez de "Gemini/Anthropic Vision"
- ✅ CODEX_NEXT_SESSION.md: 8 batches de correcciones QA completados (101+ propuestas totales)
- ✅ Codex Batch 1 completado — tabs Mente/Flow/World, scroll overflow, FAB, blackout overlay, window.__QA
- ✅ Codex Batch 2 completado — colores módulos, Aura consistency, terminología XP/Aura
- ✅ Codex Batch 3 completado — banners dismissables, Bento layouts, gamificación Financiero, mobile, landing
- ✅ Codex Batch 4 completado — selector color Aura (`--aura-accent` actualizado correctamente)
- ✅ Codex Batch 5 completado — AuraChart canvas 2D, nodos, partículas, updateScores(), emitBurst(), destroy()
- ✅ Codex Batch 6 completado — push notifications scheduling (8am/8pm/9pm), blackout emocional + ember particles, racha danger badge topbar, hero banner con datos reales
- ✅ Codex Batch 7 completado — Gemelo CTA activación, onboarding recompensa emitBurst/awardXP, bottom nav dinámico por uso
- ✅ Codex Batch 8 completado — Flow scroll/heatmap/ideas, Cuerpo empty states, Mente empty states, World leaderboard/shop, Settings toggle init, Mobile safe-area
- ⚠️ Pendiente: demo@mylifeos.lat en Firebase prod para iPhone mockup

## FLUJO RECOMENDADO
```bash
# Pipeline completo (~25-30 min)
cd /opt/openclaw && node runner.js --deep

# Solo análisis sobre screenshots existentes (rápido)
cd /opt/openclaw && node analyze-deep.js
```

## DIAGNÓSTICO — ALUCINACIONES CONOCIDAS (Claude Sonnet 4.6)
- `[GAMIFICACIÓN] Hábitos: falta feedback visual` → confetti ya implementado en toggleHabit()
- `[BUG] Modo Aura: xp-bar-fill cyan` → ya tiene gradient en body[data-mode="aura"]
- `[BUG] Botones .btn-a cyan en Aura` → ya tiene override CSS con !important
- `botón "Aprender" en Hábitos` → no existe en el código, ignorar
- `initRadarChart() no llamado en setVisualMode()` → ya está en línea ~771, ignorar

## GIT — IMPORTANTE
- El VPS hace commits directos a GitHub (Codex u otros agentes)
- Antes de `git push` desde local: siempre `git pull --rebase origin main`
- Si hay conflicto en analyze-deep.js: la versión local es la correcta (tiene todos los fixes de filtros)

## CENTRO DE OPERACIONES — ECOSISTEMA
- Ubicación: `c:\Users\wence\Documents\Centro de Operaciones\` — SEPARADO del repo Life OS
- Repo GitHub: `https://github.com/422065902-sys/centro-operaciones` (rama `main`)
- Tablero visual: `tablero.html` — abre en browser, datos en localStorage `centro-ops-v1`
- El tablero es **100% manual** — actualizar al cierre de cada sesión de trabajo
- Archivos clave: `00-DASHBOARD-ECOSISTEMA.md` (abrir cada lunes), `PROYECTOS/LIFE-OS.md`, `PROYECTOS/OPENCLAW-QA.md`
- NUNCA mezclar archivos de Centro de Operaciones con el repo de Life OS

### Sistema operativo (archivos 10-16 — sesión 9)
| Archivo | Función |
|---|---|
| `10-INBOX-AGENTES.md` | Propuestas pendientes de autorización |
| `11-COLA-TAREAS.md` | Tareas aprobadas listas para ejecutar |
| `12-PROPUESTAS-OPENCLAW.md` | Criterios que usa OpenClaw para proponer |
| `13-COMANDOS-OPENCLAW.md` | Comandos operativos (ACTIVAR CENTRO, QUÉ SIGUE, etc.) |
| `14-POLITICA-AUTORIZACION.md` | Niveles 0/1/2 — qué puede hacer solo vs qué requiere permiso |
| `15-REGISTRO-OPERATIVO.md` | Log cronológico de eventos, decisiones y corridas |
| `16-GUIA-AHORRO-TOKENS.md` | Reglas para inspección eficiente |

### Flujo operativo
OpenClaw NO ejecuta automáticamente. Flujo obligatorio:
`leer contexto → analizar pendientes → crear propuesta en INBOX → esperar autorización → mover a COLA → ejecutar`

## OPENCLAW — INFRAESTRUCTURA MULTI-PROYECTO

OpenClaw ahora gestiona dos proyectos independientes. **`/opt/openclaw/` es exclusivo de Life OS QA — no usarlo para Centro Ops.**

### Runners activos

| Clave | Proyecto | Comando host | Comando Telegram/contenedor | Reportes |
|---|---|---|---|---|
| OPENCLAW-LIFEOS-QA | Life OS | `cd /opt/openclaw && node runner.js --deep` | N/A | `/opt/openclaw/repo/lifeos/qa-reports/` |
| OPENCLAW-CENTRO-OPS | Centro de Ops | `node /opt/openclaw/projects/centro-ops/repo/runner.js` | `node /data/centro-ops/repo/runner.js` | `/opt/openclaw/projects/centro-ops/reports/` |

### Estructura VPS ampliada
```
/opt/openclaw/                            ← Life OS QA (legacy, intacto)
├── .env                                  ← credenciales Life OS
├── runner.js / analyze.js / analyze-deep.js
├── repo/lifeos/                          ← git clone Life OS
└── projects/
    ├── lifeos/                           ← copia organizada Life OS
    └── centro-ops/
        ├── repo/                         ← git clone centro-operaciones
        └── reports/                      ← reportes Centro Ops (host)

/docker/openclaw-yec7/data/              ← volumen del contenedor
└── centro-ops/
    ├── repo/                             ← visible como /data/centro-ops/repo/ dentro del contenedor
    └── reports/                          ← visible como /data/centro-ops/reports/
```

### Contenedor OpenClaw
- Nombre: `openclaw-yec7-openclaw-1`
- Solo ve `/data/` — no puede acceder a `/opt/openclaw/`
- OAuth: `openai-codex` configurado — chat web responde con `gpt-5.4`

### Telegram
- Bot: **OpenClaw Centro Ops**
- Configurado con: `openclaw channels add --channel telegram --token <TOKEN>`
- Política: `dmPolicy = allowlist`, usuario autorizado: `tg:8412757068`
- Estado: **activo y confirmado** (primera corrida COMPLETADA 2026-04-30T01-22-39)
- ⚠️ El agente Telegram usa rutas `/data/` — nunca `/opt/openclaw/`

## ÚLTIMA SESIÓN
- Fecha: 2026-05-01 (sesión 11)
- Firebase `centro-ops` completado 100%

### Cambios sesión 2026-05-01 (sesión 11)

#### Firebase centro-ops — Firestore + Hosting
- Proyecto Firebase Spark creado: `centro-ops-ecosistema`
- Firestore habilitado (Native mode, nam5) — colección `status/`
- Service account en VPS: `/opt/openclaw/projects/centro-ops/firebase-sa.json`
- `.env` del VPS tiene: `FIREBASE_CENTRO_OPS_SA` + `FIREBASE_CENTRO_OPS_PROJECT_ID`
- `firebase-admin` instalado en `/opt/openclaw/node_modules/`
- `runner.js` (centro-ops): escribe `status/centro-ops` a Firestore al terminar
- `runner.js` (Life OS): escribe `status/lifeos-qa` a Firestore al terminar (pendiente sync al VPS)
- `tablero.html`: card "Live Status" con `onSnapshot` en tiempo real — aparece con punto verde
- Firestore rules: `status/*` allow read: true, write: false
- **Tablero desplegado**: https://centro-ops-ecosistema.web.app
- Commits: `5564d4e` (código) + `bcfa2bf` (config real) en repo centro-operaciones

### PENDIENTE AL ARRANCAR PRÓXIMA SESIÓN
1. **Sync runner.js Life OS al VPS** — tiene código Firestore pero no synced:
   ```bash
   cd /opt/openclaw/repo/lifeos && git pull origin main && cp "Documents/Life Os/scripts/runner.js" /opt/openclaw/runner.js
   ```
2. **Correr pipeline completo** para poblar `lifeos-qa` en Firestore y revisar reporte post-Batch 9:
   ```bash
   cd /opt/openclaw && node runner.js --deep
   ```
   - Ver si blackout/tabs/scroll fueron corregidos (Batch 9)
   - Si hay regresiones → nuevo batch Codex
3. **Configurar claves externas** (features sesión 7 — pendientes):
   - TMDB API Key → https://www.themoviedb.org/settings/api
   - Spotify App → https://developer.spotify.com/dashboard (Client ID + Secret)
   - Redirect URI en Spotify: `https://mylifeos-staging.web.app/spotify-callback`

### Cambios sesión 2026-04-30 (sesión 9)

#### OpenClaw — asistente operativo + infraestructura multi-proyecto
- Sistema operativo creado: archivos 10-INBOX, 11-COLA, 12-PROPUESTAS, 13-COMANDOS, 14-POLITICA, 15-REGISTRO, 16-GUIA
- Runner Centro Ops creado: `runner.js` — lee archivos clave, verifica estructura, genera reporte Markdown sin modificar nada
- Repo Centro Ops en GitHub: `https://github.com/422065902-sys/centro-operaciones`
- VPS: repo clonado en `/opt/openclaw/projects/centro-ops/repo/` y en `/docker/openclaw-yec7/data/centro-ops/repo/`
- Contenedor OpenClaw configurado con OAuth `openai-codex` — chat web responde gpt-5.4
- Telegram bot `OpenClaw Centro Ops` activo — allowlist `tg:8412757068`
- Primera corrida OPENCLAW-CENTRO-OPS vía Telegram COMPLETADA: `CENTRO_OPS_2026-04-30T01-22-39.md`
- Rutas documentadas: host usa `/opt/openclaw/projects/centro-ops/`, agente Telegram usa `/data/centro-ops/`
- Sin cambios al código Life OS

### Cambios sesión 2026-04-29 (sesión 8)

#### Centro de Operaciones creado
- Tablero interactivo: `c:\Users\wence\Documents\Centro de Operaciones\tablero.html`
- localStorage `centro-ops-v1` — CRUD completo: proyectos, backlog, sprint, herramientas, métricas, novedades, activos, decisiones
- 36 archivos MD del ecosistema: RUTA-CRITICA, DASHBOARD, MAPA-PROYECTOS, NOVEDADES-IA, EXPERIMENTOS-IA, AGENTES-FUTUROS, MAPA-ACTIVOS, PROYECTOS/x3, PLAYBOOKS/x6, BACKLOGS/x5
- Tablero actualización: manual por ahora — discutida opción de "Import desde QA report" para siguiente sesión
- Sin cambios al código Life OS

### Cambios sesión 2026-04-27 (sesión 6)

#### Scripts IA migrados Anthropic → Gemini 2.0 Flash
- analyze.js + analyze-deep.js: variable `GEMINI_API_KEY` (antes `ANTHROPIC_API_KEY`)
- Endpoint: `generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=...`
- Formato imágenes: `inlineData.mimeType + inlineData.data` (antes `source.base64`)
- Response: `candidates[0].content.parts[0].text` (antes `content[0].text`)
- maxOutputTokens deep: 8192 (antes 6000 hardcap Anthropic)

#### Deploy fix definitivo
- `firebase login` interactivo falla en VPS (headless) — solución: `GOOGLE_APPLICATION_CREDENTIALS` con `firebase-adc.json`
- Comando correcto documentado en sección "Deploy a staging"

#### main.js fixes (sesión 6)
- `hasAppHistory` guard — blackout no dispara para usuarios nuevos sin historial XP
- `ensureHabitBattery(h)` — inicializa `h.battery=100` si undefined
- FAB system completo restaurado (~337 líneas) — `openFABConsole`, `parseFABPreview`, `executeFAB`, `parseLocalNLP`, etc.
- NLP keywords financieras expandidas — uber/didi/rappi/cabify/renta/gasolina/farmacia/super/netflix/spotify/amazon/gym
- Deploy exitoso commit `9afbec2a` a staging

### Cambios sesión 2026-04-25 (sesión 4)

#### Pipeline QA ejecutado
- analyze.js: 13 propuestas generadas
- analyze-deep.js: 88 propuestas (6 críticas, 75 altas) — 87 screenshots, 11 grupos, ~$1.15 USD
- CODEX_NEXT_SESSION.md creado con los 3 batches ordenados por prioridad
- Codex Batch 1 ✅ y Batch 2 ✅ completados, Batch 3 en progreso

#### Fixes en esta sesión
- runner.js: texto log "Gemini Vision" → "Claude Sonnet 4.6"
- analyze.js: texto log "Gemini/Anthropic Vision" → "Claude Sonnet 4.6 Vision"

#### Bug identificado (pendiente de fix en Codex)
- Selector de color en Modo Aura no hace nada visible — `setAccentColor()` solo actualiza `--accent` (XP), no `--aura-accent`. Fix: detectar `body.dataset.mode` y setear la variable correcta.

### Cambios sesión 2026-04-25 (sesión 3 — noche)

#### analyze-deep.js
- Migrado a Claude Sonnet 4.6 — base: prompts ORIGINAL-GEMINI (los buenos)
- Fix health regex: `/(?:💊\s*)?[Ss]alud[^0-9\n]{0,30}(\d+)\/10/` — ya no falla si Claude omite emoji
- Roles nuevos en BASE_CONTEXT: Living Data & Motion UX Strategist, Adaptive Bento Layout Strategist
- Aura Chart spec en BASE_CONTEXT: Canvas 2D, 6 nodos, partículas, física atractores
- Living Data Visuals framework en BASE_CONTEXT
- Dimensión 6 en buildGroupPrompt: Bento Grid Audit (web + iOS separados)
- Formato propuestas enriquecido: + EVIDENCIA, PLATAFORMA, PERFORMANCE, REDUCED MOTION, CONFIANZA
- 25+ tipos válidos: BENTO-LAYOUT, ADAPTIVE-BENTO, CARD-DENSITY, CHART-SIZING, SUBMODULE-LAYOUT, LIVING-DATA, MICROINTERACTION, MOTION-TRANSITION, AMBIENT-MOTION, CANVAS-VISUAL, CSS-MOTION, SVG-MOTION, GAMIFICATION-FEEDBACK, EMPTY-STATE-MOTION, DATA-VIZ-MOTION, WEB-LAYOUT, IOS-LAYOUT
- 4 veredictos nuevos por grupo: BENTO LAYOUT, WEB/DESKTOP, iOS/MOBILE, MOTION & LIVING DATA
- 4 veredictos nuevos en síntesis final ídem

#### analyze.js
- Mismos roles, secciones y veredictos nuevos que analyze-deep.js
- Formato propuestas: + PLATAFORMA, PERFORMANCE, REDUCED MOTION
- Referencias "Gemini/GPT" eliminadas — ahora dice "Claude Sonnet 4.6"

### Cambios sesión 2026-04-25 (tarde)

#### Nuevo flujo de trabajo
- Claude analiza y propone → Codex ejecuta
- Todos los scripts usan SOLO `claude-sonnet-4-6` via Anthropic API
- Cero referencias a OpenAI/GPT/Gemini en analyze.js y analyze-deep.js

#### Respaldos en scripts/ (NO eliminar)
- `analyze-deep.ORIGINAL-GEMINI.js` — commit 52e49ab, última versión buena pre-GPT5.5, prompts correctos
- `analyze.ORIGINAL-GEMINI.js` — ídem
- `analyze-deep.BACKUP-GPT4O-2026-04-25.js` — versión gpt-4o con isRefusal (por si acaso)
- `analyze.BACKUP-GPT55-2026-04-25.js` — versión gpt-5.5 rota (referencia)

#### Migración a Claude Sonnet 4.6
- Base: prompts de archivos ORIGINAL-GEMINI (los buenos, commit 52e49ab)
- API: `api.anthropic.com/v1/messages`, header `x-api-key`, `anthropic-version: 2023-06-01`
- Imágenes: `{ type:'image', source:{ type:'base64', media_type, data } }` (NO image_url)
- System: campo top-level `system:` separado de messages
- Response: `json.content[0].text` y `json.stop_reason`
- `ANTHROPIC_API_KEY` en `/opt/openclaw/.env` — NUNCA en git

#### Modelo de IA actualizado
- **analyze-deep.js** → `claude-sonnet-4-6`, `max_tokens: 6000`
- **analyze.js** → `claude-sonnet-4-6`, `max_tokens: 4096`
- ⚠️ La clave que apareció en el chat fue revocada — generar nueva en console.anthropic.com

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
2. **Revisar output del runner --deep** que corrió al cerrar sesión (PID 312556) — verificar calidad del análisis Claude Sonnet 4.6 con prompts enriquecidos.

#### Media prioridad
4. **Aura light polish** — overrides !important para todos los inline styles en modo claro
5. **Push notifications deep linking** — triggers 8pm hábitos, 9pm racha, 7am briefing
6. **Orden dinámico bottom nav** — reordenar BN_ORDER según _bnVisitCount
7. **Onboarding narrativo** — pantalla XP/Aura antes del primer dashboard

#### Baja prioridad
8. **Demo user** — `demo@mylifeos.lat` en Firebase prod para iPhone mockup
9. **Vitrina pública** — carruseles desde dailyLogs
10. **Runner nocturno automático** — esperar usuarios reales
