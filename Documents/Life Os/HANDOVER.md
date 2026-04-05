# LIFE OS — HANDOVER DE EMERGENCIA
**Fecha de generación:** 2026-04-03 · **Última actualización:** 2026-04-05  
**Generado por:** Claude Code (Staff Engineer mode)  
**Estado:** LIMPIO — todo commiteado y deployado en producción (commit `046e787`)

---

## 1. VISIÓN GENERAL Y REGLAS DE NEGOCIO

### Filosofía
Life OS es una **SPA de productividad gamificada** de archivo único. El principio rector es que las acciones reales de vida (tareas, hábitos, gym, finanzas, bitácora) generan **XP** y **Monedas** como recompensa. La interfaz funciona como un "sistema operativo personal" con módulos conectados.

### Economía del Juego — REGLA CRÍTICA E INQUEBRANTABLE

> **EL APARTAMENTO SE DECORA EXCLUSIVAMENTE CON XP. NUNCA CON MONEDAS.**

Esta distinción es central para la economía del juego y NO debe comprometerse bajo ninguna circunstancia:

- **XP (`S.xp`)** → Moneda del apartamento. Se usa para `unlockRoom()`. La tienda (`ROOMS_STORE`) muestra precios en XP (`room.precio` = unidades de XP). El display del shop muestra `S.xp`, NO `S.coins`.
- **Monedas (`S.coins`)** → Están en estado pero actualmente sin flujo de compra en el apartamento. Su uso futuro es distinto al apartamento.
- Ver `main.js:8443` → `canAfford = (S.xp || 0) >= room.precio` — la validación ya está en XP.
- Ver `main.js:8414` → `document.getElementById('shop-exp-display').textContent = S.xp || 0`

Cualquier PR o sugerencia que conecte `S.coins` al sistema de decoración del apartamento debe ser **rechazada**.

### Módulos de la App (NAV array, `main.js:255`)
| ID | Label | Descripción |
|----|-------|-------------|
| `dashboard` | Tablero | Hub principal, radar chart, check-in, Blackout |
| `world` | Life OS World | Mapa de ciudad, apartamento, aliados online |
| `productividad` | Productividad | Tareas, hábitos, pomodoro, rutinas |
| `cuerpo` | Cuerpo | Gym tracker, muscle map, salud |
| `financial` | Financiero | Transacciones, deudas, tarjetas, saldos |
| `mente` | Mente & Poder | Biblioteca, bitácora, aliados |
| `calendar` | Calendario | Eventos, planes sociales, ICS export |
| `stats` | Análisis | Charts, Gemelo Potenciado |
| `aprende` | Aprende | Noticias (colección `noticias` Firestore) |
| `settings` | Ajustes | Tema, API keys, notificaciones |
| `agencies` | (Admin oculto) | Módulo admin-only, `display:none!important` por defecto |

---

## 2. TOPOLOGÍA DEL WORKSPACE

```
C:\Users\wence\Documents\Life Os\          ← root del proyecto (Vercel root dir)
│
├── main.js                   ← TODO el JS (~10,992 líneas). Script global, NO module.
├── index.html                ← Solo carga main.js. app.js ESTÁ COMENTADO (no reactivar).
├── styles.css                ← CSS global (~3,631 líneas)
├── manifest.json             ← PWA manifest, apunta a https://mylifeos.lat/manifest.json
├── firebase-messaging-sw.js  ← Service Worker de Firebase Cloud Messaging
├── sw.js                     ← Service Worker principal de la PWA
├── favicon.ico
│
├── icons/                    ← PWA icons (120, 152, 167, 180, 192, 512 px)
│
├── functions/
│   ├── index.js              ← Cloud Functions Node 20 (~962 líneas)
│   └── package.json          ← deps: firebase-admin^11, firebase-functions^4, stripe^14, @google/generative-ai^0.21
│
├── firebase.json             ← Config hosting + firestore + functions
├── firestore.rules           ← Reglas de seguridad Firestore (RECIENTEMENTE ACTUALIZADO)
├── firestore.indexes.json    ← Índices Firestore
├── .firebaserc               ← Proyecto: life-os-prod-3a590
│
├── app.js                    ← DESACTIVADO. Script tag comentado en index.html.
│                               Si se activa → doble Firebase init = bug grave.
│
└── .claude/
    ├── settings.json
    └── settings.local.json
```

**Repositorio Git:** `C:\Users\wence\` (la raíz del repo es el home del usuario, NO la carpeta del proyecto)  
**Vercel root directory:** `Documents/Life Os`

---

## 3. ARQUITECTURA DE INFRAESTRUCTURA Y BACKEND

### Firebase
- **Project ID:** `life-os-prod-3a590`
- **Auth:** Firebase Auth (email/password + Google)
- **Firestore location:** `nam5` (multi-region US)
- **Hosting:** `life-os-prod-3a590.web.app` (secundario, Vercel es el principal)
- **Functions runtime:** Node 20, `us-central1`

### Estructura de Firestore

```
users/{uid}                          ← doc raíz: is_pro, role, trial_ends_at, stripe_customer_id, fcm_token
  ├── /data/main                     ← estado monolítico completo de la app (S serializado)
  ├── /data/profile                  ← perfil público del usuario
  ├── /connections/{connectionId}    ← aliados/conexiones
  ├── /user_activity/{activityId}    ← historial XP (tipo, xp_earned, completed_at, label)
  ├── /transactions/{txId}           ← ★ NUEVA arquitectura Cloud-First (ver §WIP)
  └── /entrenamientos/{entId}        ← sesiones de gym

gemelo_data/{uid}                    ← análisis del Gemelo. LECTURA BLOQUEADA para clientes.
                                       Solo accesible vía Cloud Function getGemelo (Admin SDK)

noticias/{docId}                     ← contenido de la sección Aprende. Write: admin only.

leaderboard/{uid}                    ← ranking semanal público. Cada usuario escribe el suyo.

userDirectory/{uid}                  ← directorio público para búsqueda de aliados.

friendRequests/{reqId}               ← solicitudes de amistad. reqId = "{fromUid}_{toUid}"
                                       Reglas implementadas en firestore.rules (Fix 4.1).
```

### firebase.json — Restricciones Críticas
```json
"disallowLegacyRuntimeConfig": false
```
**NUNCA cambiar a `true`.** Si se cambia, `functions.config()` deja de funcionar → Stripe lanza error interno. Las funciones leen sus secrets vía `functions.config().stripe.secret`.

### Cloud Functions desplegadas
| Nombre | Tipo | Descripción |
|--------|------|-------------|
| `createStripeCheckoutSession` | `onCall` | Crea sesión Stripe Checkout |
| `stripeWebhook` | `onRequest` | Webhook Stripe → activa/revoca Pro en Firestore |
| `getGemelo` | `onCall` | Sirve análisis Gemelo (verifica acceso, usa Admin SDK) |
| `generateGemeloAnalysis` | — | Genera análisis con Gemini AI |
| `notifyGemeloReady` | — | Push notification cuando análisis listo |
| `notifyTrialExpiring` | — | Push cuando trial expira |
| `dailyBriefing` | — | Notificación diaria 12pm |
| `motivationalPill` | — | Píldora motivacional 4pm |
| `reengagementNotif` | — | Re-engagement para usuarios inactivos |

### IAM — Punto de Falla Conocido
Todas las Cloud Functions necesitan `roles/cloudfunctions.invoker` para `allUsers`. **PUEDE PERDERSE al redesplegar.** Si aparece error CORS o 403 en preflight:
```bash
ACCESS_TOKEN=$(node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync('C:/Users/wence/.config/configstore/firebase-tools.json','utf8')); process.stdout.write(d.tokens.access_token)")
curl -X POST "https://cloudfunctions.googleapis.com/v1/projects/life-os-prod-3a590/locations/us-central1/functions/createStripeCheckoutSession:setIamPolicy" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"policy":{"bindings":[{"role":"roles/cloudfunctions.invoker","members":["allUsers"]}]}}'
```
Repetir para cada función afectada.

### Stripe
- **Price ID General:** `price_1TGtLhFtLUdyKMniu3nC4ws6` ($99 MXN/mes)
- **Price ID Estudiante:** `price_1TGtM7FtLUdyKMniGFewOD8K` ($49 MXN/mes)
- **Checkout:** `procesarPago()` en `main.js:~3776` invoca `createStripeCheckoutSession` callable
- **Success URL:** `https://life-os-prod-3a590.web.app/?pago=exitoso`
- **Webhook:** `stripeWebhook` escucha `checkout.session.completed` y `customer.subscription.deleted`
- Al activar Pro: `is_pro: true, role: 'premium', hasEverPaid: true`
- Al cancelar: `is_pro: false, role: 'free'`

### Dominio
- **Principal:** `https://mylifeos.lat` (Vercel)
- **Secundario:** `https://life-os-prod-3a590.web.app` (Firebase Hosting)
- **Functions base:** `https://us-central1-life-os-prod-3a590.cloudfunctions.net/`

### Admin
- Email: `wencesreal35@gmail.com`
- Debe tener `role: 'admin'` en Firestore `users/{uid}`
- Helper: `_isAdmin()` en `main.js`
- Módulo agencies bloqueado para no-admins en `navigate()` (`main.js:305`)

---

## 4. STACK FRONTEND Y UI/UX

### Tecnologías
- **HTML/CSS/JS vanilla** — sin framework, sin bundler, sin build step
- **Script global** — `main.js` es un script no-module. Todo es global (`window.*`). No hay `import`/`export`.
- **Firebase SDK v8** (compat) — CDN, cargado en `index.html`
- **Chart.js** — para gráficas (radar, pie, line)
- **PWA completa** — manifest + service workers + icons. Instalable en iOS y Android.
- **Dark mode** por defecto (`S.dark: true`). Accent color configurable (`S.accent`).

### Patrón de Estado
Un único objeto global `S` (`main.js:128`) contiene todo el estado de la app. Se persiste en:
1. **localStorage** (`guardarDatos()`) — fallback offline
2. **Firestore `users/{uid}/data/main`** — doc monolítico, debounce 2s via `_scheduleFSsave()`
3. **Firestore `users/{uid}/transactions/`** — ★ nueva sub-colección Cloud-First para finanzas

### Boot Sequence (crítico)
```
index.html carga → main.js → Firebase init → loginSuccess()
  → _applyData() (hidrata S desde Firestore)
  → _markBootDataReady()
  → animación terminal termina (_bootAnimDone)
  → _tryCompleteBoot() → render UI
  → _flushToastQueue() + _flushPostBootQueue()
```
La boot screen es un guardia real de UI: nada se muestra hasta que tanto la animación como los datos de Firestore estén listos.

### Componentes Principales
| Función | Descripción | Línea aprox. |
|---------|-------------|--------------|
| `navigate(id)` | Navegación entre páginas + lazy init de charts | main.js:303 |
| `_applyData(d)` | Hidrata S desde datos Firestore | main.js:4520 |
| `_buildSavePayload()` | Serializa S para Firestore | main.js:84 |
| `gainXP(amount, skipBlackout)` | Suma XP + actualiza historial + override Blackout | main.js:8147 |
| `_startFinancialListener(uid)` | onSnapshot sobre transactions subcollection | main.js:~1454 |
| `renderShop()` | Tienda de decoración del apartamento (precio en XP) | main.js:8426 |
| `loginSuccess(userObj)` | Post-auth: carga datos, inicia listeners, paywall | main.js:4966 |
| `procesarPago()` | Abre Stripe Checkout | main.js:~3776 |

### Estructura de Páginas (DOM)
```html
<div class="page" id="page-dashboard">
<div class="page" id="page-world">
<div class="page" id="page-productividad">
<div class="page" id="page-cuerpo">
<div class="page" id="page-financial">
<div class="page" id="page-mente">
<div class="page" id="page-calendar">
<div class="page" id="page-stats">
<div class="page" id="page-aprende">
<div class="page" id="page-settings">
<div class="page" id="page-agencies" style="display:none!important">  ← admin-only
```

---

## 5. ESTADO ACTUAL — PRODUCCIÓN LIMPIA (2026-04-05)

### Último commit deployado: `046e787`
```
Feat: financial Cloud-First, iconos v3, reglas friendRequests, handover doc
```

### Qué se completó y está en producción
✅ **Sistema Financiero Cloud-First** — `users/{uid}/transactions` subcollection activa  
✅ **`_startFinancialListener(uid)`** — onSnapshot en tiempo real operativo  
✅ **Migración automática** — doc monolítico → subcollection al primer login  
✅ **Reglas Firestore** `friendRequests` (Fix 4.1) — compiladas y en producción  
✅ **Iconos PWA** — todos los tamaños actualizados  
✅ **Firestore rules** `transactions` subcollection — con validaciones de type, amount, soft-delete  

### Componentes financieros en producción (`main.js`)
| Función | Línea | Rol |
|---------|-------|-----|
| `_txCollRef(uid)` | 67 | Helper ref a subcollección |
| `_startFinancialListener(uid)` | 1465 | onSnapshot + migración automática |
| `addTransaction()` | 1540 | async, Cloud-First + optimista |
| `deleteTx(id)` | 1661 | Soft-delete local + Firestore |
| `saveTxEdit()` | 1687 | Edit + saldoObj fix + Firestore |

### Bugs conocidos no críticos
- `NotFoundError: insertBefore on Node` en `showModuleCard()` — race condition DOM, no bloquea features.
- `email-decode.min.js 404` — script de Cloudflare/Vercel, no es código nuestro.
- `enableMultiTabIndexedDbPersistence() deprecated` — advertencia de Firebase SDK.

### Próxima tarea sugerida
**Verificar migración de transacciones en producción (primera vez que un usuario real abre la app)**
1. Login → DevTools Console → buscar `[Life OS] 💸 Migrando`
2. Agregar transacción → verificar en Firestore Console bajo `users/{uid}/transactions/`
3. Saldo debe actualizarse en tiempo real sin refresh

### Pendiente de sesiones anteriores (carry-over)
- **OpenClaw en Hostinger:** quiere configurar pruebas automatizadas para `mylifeos.lat`. Preguntar qué tiene ya en Hostinger y qué falta conectar.
- **MAPA_FUNCIONES.md** — creado para guion de TikTok. Ver `MAPA_FUNCIONES.md` en la raíz del proyecto.

---

## 6. CONVENCIONES TÉCNICAS

### Restricciones Arquitecturales Absolutas

| Regla | Por qué |
|-------|---------|
| `app.js` SIEMPRE comentado en `index.html` | Evita doble Firebase init |
| `disallowLegacyRuntimeConfig: false` en `firebase.json` | `functions.config()` debe funcionar para leer Stripe secrets |
| IAM allUsers invoker en todas las functions | Sin esto, CORS falla en preflight y Stripe no funciona |
| `main.js` es script global, NO module | Todo el código va en el mismo archivo global |
| Soft-delete universal (`deleted: true, deletedAt`) | Nunca splice/filter arrays de datos — preserva historial |
| Apartamento se decora con XP, no coins | Regla de economía de juego fundamental |

### Patrones de Código
- **ID generation:** `uid()` = `Math.random().toString(36).slice(2,9)` — IDs cortos locales
- **Formato MXN:** `fmt(n)` = `Intl.NumberFormat('es-MX', {style:'currency', currency:'MXN'})`
- **Today:** `today()` = `new Date().toISOString().split('T')[0]` → `'YYYY-MM-DD'`
- **Guardar:** `_scheduleFSsave()` (debounce 2s) para el doc monolítico. Para transactions: escritura directa sin debounce.
- **Admin check:** `_isAdmin()` helper — no hardcodear roles en otro lugar
- **Boot-defer:** UI actions que pueden dispararse antes del boot van en `_schedulePostBoot(fn)`
- **gainXP signature:** `gainXP(amount, skipBlackout = false)` — check-in y calibración usan `skipBlackout: true`

### Campos de S añadidos en la última sesión
```js
S.blackoutOverrideToday  // string 'YYYY-MM-DD' — día en que una acción real superó el Blackout
S.bubbleColor            // string — color del bubble del Gemelo (persiste en Firestore)
S.bubbleEmoji            // string — emoji del bubble del Gemelo (persiste en Firestore)
S.friendRequests         // array — solicitudes de amistad pendientes recibidas
S.physWeight             // number — peso físico del usuario (kg)
S.unlockedRooms          // array<string> — IDs de rooms desbloqueadas en el apartamento
S.equippedRoom           // string — ID de la room actualmente equipada
```

### Errores ignorables en consola
- `email-decode.min.js 404` — Cloudflare/Vercel
- `enableMultiTabIndexedDbPersistence() deprecated` — Firebase SDK
- `SyntaxError: export en webpage_content_reporter.js` — extensión Chrome del usuario

### Pendiente de sesiones anteriores
- **OpenClaw en Hostinger:** el usuario quiere configurar herramienta de pruebas automatizadas en Hostinger para mylifeos.lat. Está a medias. Preguntar qué tiene ya configurado antes de continuar.

---

*Generado 2026-04-03 · Actualizado 2026-04-05. Para regenerar: pedirle a Claude Code "handover de emergencia".*
