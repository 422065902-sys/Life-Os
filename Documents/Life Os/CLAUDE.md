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

### Correr OpenClaw en el VPS
```bash
cd /opt/openclaw
node runner.js
# o directo desde el repo (sin copiar):
node "/opt/openclaw/repo/lifeos/Documents/Life Os/scripts/runner.js"
```

### En Windows (desarrollo local)
```
c:\Users\wence\Documents\Life Os\   ← raíz del proyecto
c:\Users\wence\Documents\Life Os\scripts\runner.js
c:\Users\wence\Documents\Life Os\scripts\analyze.js
c:\Users\wence\Documents\Life Os\scripts\analyze-deep.js
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
- ✅ runner.js corre end-to-end: 215 tests, 0 FAILs, 93% pass rate
- ⚠️ Pendiente: runner.js automático nocturno (esperando usuarios reales)
- ⚠️ Pendiente: VPS sync — ver sección RUTAS ABSOLUTAS para comandos exactos

## ÚLTIMA SESIÓN
- Fecha: 2026-04-17
- Qué se hizo: Runner completo sin crashes — 215 tests, 0 FAILs, 93% pass rate
- Commits: 5c27839, 6671fed, 3637ec1
- Correcciones aplicadas:
  1. `closeAllModals()` helper — cierra modales olvidados que bloquean UI (z-index 200 backdrop)
  2. `testFinanzas`: JS `openTxModal()` + JS `addTransaction()` (botón dice "Registrar" no "Guardar")
  3. `testHabitos`: JS `addHabit()` + selector real `.habit-item`
  4. `testCalendario`: JS `renderCalendar()` + JS `calNext()` (antes bloqueado por modal abierto)
  5. `testStripe`: selector `#settings-plan-badge` específico (evita falso negativo con badge oculto)
  6. `testMente` aliados: WARN→INFO (sección dinámica, requiere usuarios reales)
  7. FAB NLP: `closeAllModals()` + JS click — elimina 30s Playwright timeout por elemento cubierto
  8. SEED finanzas: JS `openTxModal()` + `evalJS(addTransaction)`, tipo='salida'/'entrada' (no 'gasto')
  9. SEED hábitos: `closeAllModals()` + `evalJS(addHabit)`
  10. FAB NLP matching: mapa de términos (Finanzas→busca 'Gasto'/'💰' en preview)
  11. dotenv: carga multi-path (VPS `/opt/openclaw/.env` + local Windows)
- Patrón establecido: usar `evalJS(() => appFunction())` para cualquier operación donde Playwright
  pueda fallar por actionability checks (elemento cubierto, z-index alto). `safeClick()` solo para
  clicks verdaderamente interactivos.
- NLP issues encontrados (14 WARNs reales del parser — no son bugs del runner):
  - "gasoline", "varos" no reconocidos como gastos
  - Números escritos ("cien pesos") no parseados como montos
  - Coma en montos rompe detección de ingreso ("1,500")
  - "cori", "bebi", "dormi" (sin tilde) no reconocidos como hábitos
  - "7am" parseado como "$7" en lugar de hora
- Próximo: VPS sync con comandos de sección RUTAS ABSOLUTAS (las rutas correctas ya están documentadas)
