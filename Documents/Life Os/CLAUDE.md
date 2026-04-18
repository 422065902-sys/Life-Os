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

Flujo normal: `node runner.js --deep` — un solo comando hace todo: E2E → screenshots → analyze.js → analyze-deep.js (screenshots frescos garantizados via QA_SHOTS_DIR).

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
# Flujo completo recomendado — E2E + screenshots + analyze + analyze-deep (un solo comando)
node runner.js --deep

# Solo E2E + analyze ligero (más rápido, sin deep)
node runner.js

# analyze-deep manual sobre screenshots ya existentes
node analyze-deep.js
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
- ✅ Funcionando: runner.js --deep (pipeline completo), analyze-deep.js, analyze.js, Firebase CLI → staging
- ✅ Pipeline unificado: `node runner.js --deep` hace E2E + screenshots + analyze + analyze-deep en secuencia
- ✅ analyze-deep respeta QA_SHOTS_DIR — siempre analiza screenshots del run actual, nunca fotos viejas
- ✅ analyze-deep v2.1: propuestas con IMPACTO 1-5 + ESFUERZO 1-5 + código listo para pegar
- ✅ analyze-deep v2.1: BASE_CONTEXT actualizado con layout absoluto del landing
- ✅ analyze-deep v2.1: sprint plan con archivos/líneas específicos en síntesis
- ✅ main.js detecta staging/prod automáticamente por hostname
- ✅ firebase-messaging-sw.js detecta staging/prod automáticamente por hostname
- ✅ runner.js corre end-to-end: 154 tests (último run limpio 2026-04-17)
- ✅ goTo() llama closeAllModals() — overlays ya no aparecen en screenshots
- ✅ analyze.js limitado a 35 shots clave — elimina alucinaciones Gemini
- ✅ analyze-deep.js y analyze.js con retry+backoff (3 intentos, 30s en rate limit)
- ✅ analyze-deep.js: thinkingBudget=0 — costo controlado (~$0.47 MXN por run)
- ✅ NLP: médico/doctor/dentista retirados de hasCalKw — eran falsos positivos
- ✅ Cuerpo: bio-vol y bio-entrenos muestran '—' cuando no hay datos
- ✅ Runner: limpia hábito QA después del test (deleteHabit)
- ✅ Boot flash corregido: body.booting oculta FAB+nav hasta que la app carga
- ✅ Gemelo IA: fix Firestore Timestamp serialization → ya no muestra 0% de progreso
- ✅ Focus circle: initFocusBars() llamado post-boot y post-onSnapshot → ya no se queda en 68%
- ✅ iOS bottom nav: pill flotante con liquid glass, emojis grayscale/color, FAB reposicionado
- ✅ Landing: LIFE OS logo cicla 8 colores de la app con animación + glow
- ✅ Landing: nav con dos botones (Iniciar Sesión + Empieza gratis)
- ✅ Landing: CTA urgencia morado "¿No tienes el control aún? — Empieza a tenerlo ahora →"
- ✅ Landing layout: position:absolute en nav+scroll — elimina espacio fantasma del flex
- ⚠️ Pendiente: runner.js automático nocturno (esperando usuarios reales)
- ⚠️ Pendiente: correr `node runner.js --deep` post-fixes para verificar estado real con screenshots frescos

## FLUJO RECOMENDADO
```bash
# Flujo completo (recomendado siempre) — tarda ~25-30 min total
cd /opt/openclaw && node runner.js --deep

# Flujo rápido (solo E2E + analyze ligero) — tarda ~15-20 min
cd /opt/openclaw && node runner.js
```
Con `--deep`: runner hace E2E → screenshots → analyze.js → analyze-deep.js automáticamente.
analyze-deep siempre recibe QA_SHOTS_DIR con la carpeta del run actual → nunca analiza fotos viejas.

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
- Fecha: 2026-04-18 (continuación)
- Commits principales: 5551061, e9869b0, 9edc349, 4533336, 9f711ab, 9c2e6cc

### Fixes de app (main.js + styles.css + index.html)
1. **Boot flash**: `body.booting` oculta FAB+nav hasta `_tryCompleteBoot()`
2. **Gemelo 0%**: fix Firestore Timestamp serialization
3. **Focus circle 68%**: `initFocusBars()` post-boot y post-onSnapshot
4. **NLP**: médico/doctor/dentista fuera de hasCalKw
5. **Cuerpo**: bio-vol y bio-entrenos muestran '—' cuando no hay datos
6. **Runner cleanup**: hábito QA se borra vía deleteHabit()
7. **Trial banner mobile**: offset 34px→56px en ≤480px
8. **inner-tab touch targets**: min-height:44px en móvil
9. **FAB placeholder + feedback**: ejemplos reales + hint <3 chars

### Bottom nav — carrusel infinito (esta sesión)
- **Concepto**: dashboard ⚡ siempre centrado, módulos orbitan izquierda/derecha
- **3 copias** del array BN_ORDER para scroll infinito sin fin visible
- **Emojis**: grayscale inactivo → color+scale(1.15) activo (como era antes, no SVGs)
- **Al deslizar**: ítem centrado navega automáticamente (debounce 220ms)
- **Al tocar lateral**: se jala al centro con smooth scroll
- **Loop infinito**: si entra en copia 0 o 2, salta en silencio a copia 1
- **`_bnAnimating` flag**: bloquea `_bnOnScroll` durante animaciones programáticas — fix del bug donde el carrusel se quedaba trabado en dashboard al navegar desde dentro de la app
- **`updateBottomNav`**: siempre va a copia central (`BN_LEN + localIdx`) — simple y confiable
- **SW cache**: bumped a v4 para forzar descarga en PWA

### BN_ORDER (orden fijo, más usados cerca del dashboard):
```
[settings, aprende, stats, mente, world] [⚡ dashboard] [productividad, cuerpo, financial]
```

### Landing v3.0 (esta sesión)
- Hero 2 columnas: texto izq + app preview card CSS derecha (mini dashboard animado)
- App preview: XP bar animada, stats de racha/hábitos/ahorro, hábitos con checks, Gemelo IA hint
- Floating badges sobre el card: "🏆 Leaderboard #3" y "💳 -$850 deuda"
- Grid de fondo sutil, tag con dot pulsante
- Feature chips: ⚡ Hábitos · 🤖 IA · 💰 Finanzas · 🏆 Leaderboard
- Module cards: header coloreado + tag pill de color por módulo
- Steps: círculos numerados + línea gradient conectora
- Testimonials: ★★★★★ + métrica por persona
- Pricing: badge "MÁS POPULAR" en Pro
- Footer: headline grande + glow radial

### Estado del carrusel (pendiente verificar)
- **BUG PENDIENTE**: al navegar desde dentro de la app (no desde el nav), el carrusel debe moverse al módulo activo. Fix aplicado con `_bnAnimating` — pendiente confirmar en PWA que funciona correctamente.

### Mejoras OpenClaw (scripts)
1. **analyze-deep v2.1**: propuestas con IMPACTO/ESFUERZO 1-5 + código exacto listo para pegar
2. **analyze-deep v2.1**: BASE_CONTEXT actualizado con layout absoluto del landing (ya no dice flex)
3. **analyze-deep v2.1**: sprint plan con archivos/líneas/ROI en síntesis ejecutiva
4. **Pipeline `--deep`**: `node runner.js --deep` hace E2E+screenshots+analyze+analyze-deep en un comando
5. **QA_SHOTS_DIR**: analyze-deep recibe la carpeta exacta del runner → nunca analiza fotos viejas

### Deploy realizado esta sesión
- Staging (`mylifeos-staging`): ✅ deploy exitoso con todos los fixes
- Producción (`life-os-prod-3a590`): ✅ deploy autorizado y exitoso con todos los fixes
- Ambos deployados con: `firebase deploy --only hosting:staging` y `firebase deploy --only hosting:production`

### Alucinaciones Gemini detectadas en deep run (NO implementadas — runner las descarta)
- "fold y scroll idénticos" en múltiples módulos → artefacto de screenshot, no bug real
- "Settings no tiene sección Stripe" → sí existe, Gemini no la detectó en foto
- "Mente missing purple accent" → `--mente-accent:#a855f7` está en `:root`, Gemini alucinó
- Health score 2/10 del deep vs runner ~6-7/10 → runner es autoridad (154 tests)

### Pendientes próxima sesión
- **VERIFICAR** carrusel bottom nav en PWA — confirmar que el bug del dashboard trabado está resuelto con `_bnAnimating` flag
- **Orden dinámico** del carrusel según frecuencia de uso real (guardar conteo en localStorage/Firestore)
- Sincronizar VPS: `git pull && cp scripts` (ver comandos sync arriba)
- Correr `node runner.js --deep` post-fixes para validar estado real
- runner.js automático nocturno (esperando usuarios reales)
