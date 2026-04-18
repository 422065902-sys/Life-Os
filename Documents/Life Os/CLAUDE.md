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
| `scripts/analyze-deep.js` | Análisis Gemini Vision profundo — lee screenshots, 9 grupos temáticos, maxOutputTokens 16k | Manual post-run | Activo |
| `scripts/analyze.js` | Análisis Gemini Vision ligero — 3 días de reportes, propuestas de mejora | Manual post-run | Activo |

Flujo normal: `runner.js` genera screenshots → `analyze-deep.js` o `analyze.js` los analizan con Gemini.

Cualquier otro archivo runner/analyze que no sea estos tres exactos = duplicado no autorizado.
Reportar al usuario y esperar autorización antes de eliminar.

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
El repo de git está clonado en `/opt/openclaw/repo/lifeos/` pero el código del proyecto
vive en una subcarpeta dentro de ese clone:

```
/opt/openclaw/
├── .env                          ← credenciales (QA_USER_EMAIL, QA_USER_PASSWORD, GEMINI_API_KEY)
├── runner.js                     ← copia de trabajo del runner (actualizar con sync)
├── analyze.js                    ← copia de trabajo
├── analyze-deep.js               ← copia de trabajo
└── repo/
    └── lifeos/                   ← git clone raíz
        └── Documents/
            └── Life Os/          ← aquí están los archivos del proyecto
                ├── main.js
                ├── index.html
                ├── scripts/
                │   ├── runner.js        ← fuente original
                │   ├── analyze.js
                │   └── analyze-deep.js
                └── qa-reports/
```

### Comandos exactos para sync VPS (copiar/pegar completo)
```bash
cd /opt/openclaw/repo/lifeos
git pull origin main
cp "Documents/Life Os/scripts/runner.js" /opt/openclaw/runner.js
cp "Documents/Life Os/scripts/analyze.js" /opt/openclaw/analyze.js
cp "Documents/Life Os/scripts/analyze-deep.js" /opt/openclaw/analyze-deep.js
```

### Deploy a staging (Firebase Hosting)
```bash
cd "/opt/openclaw/repo/lifeos/Documents/Life Os" && firebase deploy --only hosting:staging --project mylifeos-staging --token "1//05eYwHkIxLrx0CgYIARAAGAUSNwF-L9IrSi8bt-Uc1kKz0-rKnFQDr9KHxgRE_gt8FIHYIshOMo9efG_8lUOIZ8k4hsWLM8T5YMs"
```
- Token CI generado 2026-04-18 — si expira, correr `firebase login:ci --no-localhost` y actualizar
- Target `staging → mylifeos-staging` ya configurado en el VPS
- firebase.json debe estar en `Documents/Life Os/` (no en la raíz del repo)

### Correr OpenClaw en el VPS
```bash
cd /opt/openclaw
node runner.js
# o directo desde el repo (sin copiar):
node "/opt/openclaw/repo/lifeos/Documents/Life Os/scripts/runner.js"
```

### Salida del runner mientras corre (VPS)
```bash
# Ver logs en tiempo real si corre en background (&):
tail -f /opt/openclaw/repo/lifeos/qa-reports/YYYY-MM-DD_HH-MM.md

# Ver el reporte más reciente (cualquier nombre):
ls -t /opt/openclaw/repo/lifeos/qa-reports/*.md | head -1 | xargs tail -f

# Ver solo WARNs y FAILs del reporte activo:
ls -t /opt/openclaw/repo/lifeos/qa-reports/*.md | head -1 | xargs grep -E "❌|⚠️"

# Ver progreso del runner (qué módulo va):
ls -t /opt/openclaw/repo/lifeos/qa-reports/*.md | head -1 | xargs tail -20
```

### Archivos generados por cada run
```
/opt/openclaw/repo/lifeos/qa-reports/
├── YYYY-MM-DD_HH-MM.md              ← reporte QA de ese run
├── PROPOSALS_YYYY-MM-DD.md          ← propuestas generadas por analyze
└── screenshots/
    └── YYYY-MM-DD_HH-MM/            ← carpeta de capturas de ese run
        ├── 00-landing-fold.jpg
        ├── 05-dashboard_fold.jpg
        └── ... (una por módulo)
```

### En Windows (desarrollo local)
```
c:\Users\wence\Documents\Life Os\               ← raíz del proyecto
c:\Users\wence\Documents\Life Os\scripts\runner.js
c:\Users\wence\Documents\Life Os\scripts\analyze.js
c:\Users\wence\Documents\Life Os\scripts\analyze-deep.js
c:\Users\wence\Documents\Life Os\qa-reports\    ← reportes locales
```

## PASOS PARA CORRER OPENCLAW

### Verificación previa (siempre antes de ejecutar)
1. Confirmar que `/opt/openclaw/.env` existe con `QA_USER_EMAIL`, `QA_USER_PASSWORD`, `GEMINI_API_KEY`
2. Confirmar que `qa-test@mylifeos-staging.com` existe en Firebase staging
3. Confirmar que Firebase CLI apunta a staging: `firebase use` → debe mostrar `mylifeos-staging`

### Ejecución (desde /opt/openclaw en el VPS)
```bash
node runner.js

# Análisis post-run (elegir uno)
node analyze-deep.js   # profundo — más tokens, más tiempo
node analyze.js        # ligero — más rápido
```

### Post-ejecución
- Documentar resultado en ÚLTIMA SESIÓN de este archivo

## PROYECTO
- Nombre: Life OS | URL: https://mylifeos.lat
- Stack: HTML/CSS/JS vanilla, Firebase, Stripe, Vercel
- Firebase producción: `life-os-prod-3a590` (Blaze, nam5) ← SAGRADO
- Firebase staging: `mylifeos-staging`
- Dominio: Namecheap → Vercel

## ARQUITECTURA

```
/
├── main.js              → App principal (11,591 líneas) — auto-detecta staging/prod por hostname
├── app.js               → Versión legacy/antigua — desactivada, NO usar
├── index.html           → Carga main.js + OnboardingGemelo.js
├── firebase-messaging-sw.js  → Service worker notificaciones — auto-detecta staging/prod por hostname
├── firestore.rules      → Reglas Firestore producción (estrictas)
├── firestore.staging.rules → Reglas staging (permisivas — solo auth requerida)
├── firebase.json        → Multi-target: production + staging
├── .firebaserc          → default=staging (activo), alias staging=mylifeos-staging
├── scripts/
│   ├── runner.js        → Runner E2E diario — apunta a mylifeos-staging.web.app
│   ├── analyze-deep.js  → Análisis Gemini Vision profundo (post-run)
│   ├── analyze.js       → Análisis Gemini Vision ligero (post-run)
│   ├── seedDemoUser.js  → Semilla usuario demo — usa SEED_PROJECT_ID env var
│   ├── setup-qa-user.js → Crea usuario QA en staging
│   └── firebase-adc.json → Credenciales ADC (token OAuth admin) — en git por necesidad operativa
├── functions/
│   └── index.js         → Cloud Functions (Stripe, etc.)
└── qa-reports/          → Reportes y documentación QA
```

## CREDENCIALES DEL RUNNER
- Usuario de prueba: `qa-test@mylifeos-staging.com`
- Contraseña: en `/opt/openclaw/.env` → `QA_USER_PASSWORD`
- Existe en staging: ✅
- Existe en producción: ❌ (correcto — no debe estar ahí)
- Ubicación: `.env` en el VPS `/opt/openclaw/.env` (no en este repo)

## USUARIOS EN FIREBASE
- **Staging** (mylifeos-staging): 1 usuario — `qa-test@mylifeos-staging.com`
- **Producción** (life-os-prod-3a590): 9 usuarios reales — no tocar

## ESTADO ACTUAL
- ✅ Funcionando: runner.js (E2E), analyze-deep.js, analyze.js, Firebase CLI → staging
- ✅ Corregido: main.js detecta staging/prod automáticamente por hostname
- ✅ Corregido: firebase-messaging-sw.js detecta staging/prod automáticamente por hostname
- ✅ Corregido: seedDemoUser.js usa variables de entorno + advertencia si corre contra prod
- ✅ Eliminado: app.js legacy (desactivado, versión antigua — historial disponible en git)
- ✅ runner.js corre end-to-end: 154 tests, 0 FAILs, 95% pass rate (último run 2026-04-17)
- ✅ goTo() llama closeAllModals() — overlays ya no aparecen en screenshots
- ✅ analyze.js limitado a 35 shots clave (fold+responsive) — elimina alucinaciones Gemini
- ✅ analyze-deep.js y analyze.js con retry+backoff (3 intentos, 30s en rate limit)
- ✅ analyze-deep.js: thinkingBudget=0 en todos los grupos y síntesis — costo controlado
- ✅ analyze-deep.js: maxTokens 5k-6k por grupo (antes 14k-16k) — sin basura de relleno
- ✅ Run deep limpio: 83 propuestas, 0 errores API (2026-04-18)
- ✅ analyze.js y analyze-deep.js: BASE_CONTEXT incluye que $99 es MXN (~$5 USD) — evita falso positivo de precio prohibitivo
- ✅ NLP: médico/doctor/dentista retirados de hasCalKw — eran falsos positivos en tareas tipo "llamar al médico"
- ✅ Cuerpo: bio-vol y bio-entrenos muestran '—' cuando no hay datos (antes mostraban "0 kg" / "0")
- ✅ Runner: limpia hábito QA después del test (deleteHabit) — staging ya no se contamina
- ⚠️ Pendiente: runner.js automático nocturno (esperando usuarios reales)

## FLUJO RECOMENDADO POST-RUN
```bash
# 1. Correr runner (toma ~15-20 min, genera screenshots + reporte + analyze.js ligero automático)
cd /opt/openclaw && node runner.js

# 2. Análisis profundo con Gemini Vision (correr manualmente después del runner)
cd /opt/openclaw && node analyze-deep.js
```
El runner ya llama analyze.js automáticamente al final.
analyze-deep.js se corre manualmente cuando se quiere análisis profundo por grupos temáticos.

## DIAGNÓSTICO DE ALUCINACIONES GEMINI
- **Síntoma**: Gemini reporta "SESIÓN DE LECTURA aparece en todos los módulos" — no es real
- **Causa**: screenshot `15-mente-biblioteca` muestra lista de libros (estado correcto del SEED).
  Gemini confunde esa UI de biblioteca con el `#book-focus-overlay` y lo atribuye a toda la app.
- **Fix en analyze.js**: limita a 35 imágenes (solo _fold + responsive clave, sin FAB screenshots)
- **Fix en analyze-deep.js**: 4 capas de protección en los prompts:
  1. BASE_CONTEXT: aclara que `#book-focus-overlay` siempre está `display:none`
  2. Grupo Mente: explica que `15-mente-biblioteca` = lista de libros (correcto, no bug)
  3. Grupo Mobile: describe qué esperar en cada módulo para no confundir Gemini
  4. Síntesis final: instrucción de ignorar cualquier mención de "SESIÓN DE LECTURA" fuera de Mente
- **Regla**: si analyze-deep reporta "Gestión/Sesión de Lectura en módulos no relacionados" → alucinación, ignorar

## ÚLTIMA SESIÓN
- Fecha: 2026-04-18
- Commits: 1ab7946, 166127a (+ sesión anterior: c98498c, 59c0be0, etc.)
- Correcciones aplicadas esta sesión:
  1. `analyze.js` + `analyze-deep.js`: BASE_CONTEXT instruye a Gemini que $99 = MXN (~$5 USD) — ya no reporta precio como problema
  2. NLP `parseLocalNLP`: retira médico/doctor/dentista de `hasCalKw` — eran personas, no tipos de evento; "llamar al médico esta semana" ya no se clasifica como Calendario
  3. `updateBioVol`: muestra '—' cuando vol === 0 (antes "0 kg")
  4. `buildFreqHeatmap` (bio-entrenos): muestra '—' cuando gymCount === 0 (antes "0"); HTML default actualizado
  5. Runner `testHabitos`: guarda nombre del hábito QA, llama `deleteHabit()` post-test para limpiar staging
  6. iOS bottom nav implementado: frosted glass, scrollable, pill indicator, FAB reposicionado
  7. Landing: animaciones gradient-shift, glow-pulse, scroll-reveal con IntersectionObserver
  8. Gemelo IA card: texto corregido con descripción real de funcionalidad
  9. lp-nav-login: touch target 44px mínimo
- QA run (2026-04-18_05-54): 10 propuestas Gemini, salud 6/10 — fixes de NLP y Cuerpo apuntan a subir a 8/10
- Pendiente: correr runner en VPS para verificar fixes de esta sesión
- Pendiente: runner.js automático nocturno (esperando usuarios reales)
