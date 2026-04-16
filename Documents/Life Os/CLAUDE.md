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

## PASOS PARA CORRER OPENCLAW

### Verificación previa (siempre antes de ejecutar)
1. Confirmar que `.env` existe en `/opt/openclaw/.env` (VPS) con `QA_USER_EMAIL`, `QA_USER_PASSWORD`, `GEMINI_API_KEY`
2. Confirmar que `qa-test@mylifeos-staging.com` existe en Firebase staging
3. Confirmar que Firebase CLI apunta a staging: `firebase use` → debe mostrar `mylifeos-staging`

### Ejecución
```bash
# Runner E2E diario
node scripts/runner.js

# Análisis post-run (elegir uno)
node scripts/analyze-deep.js   # profundo — más tokens, más tiempo
node scripts/analyze.js        # ligero — más rápido
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
- ⚠️ Pendiente: runner.js automático nocturno (esperando usuarios reales)

## ÚLTIMA SESIÓN
- Fecha: 2026-04-16
- Qué se hizo: Auditoría completa inicial + correcciones
- Correcciones aplicadas:
  1. Firebase CLI cambiado de producción a staging (`firebase use staging`)
  2. `main.js` — añadida detección `_IS_STAGING` + config dual staging/prod
  3. `seedDemoUser.js` — hardcodes reemplazados por variables de entorno con guard de advertencia
  4. `index.html` — actualizado comentario obsoleto sobre app.js
- Duplicados eliminados: ninguno (estructura limpia)
- Alertas sin acción (pendientes de decisión):
  - `firebase-adc.json` en git (token OAuth admin) — usuario decide mantenerlo
  - `app.js` legacy — evaluar eliminar
  - `firebase-messaging-sw.js` solo apunta a producción
- Próximo: deploy a staging para verificar que runner.js corra limpio
