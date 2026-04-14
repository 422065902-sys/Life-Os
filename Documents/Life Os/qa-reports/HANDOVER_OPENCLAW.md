# LIFE OS — BRIEFING PARA AGENTE OPENCLAW
**Versión:** 2 · **Fecha:** 2026-04-13  
**Propósito:** Documento exclusivo para el agente de QA automatizado (OpenClaw / Playwright).  
Contiene todo lo necesario para testear `https://mylifeos.lat` de forma autónoma.

---

## 1. QUÉ ES LA APP Y QUÉ DEBES HACER

`mylifeos.lat` es una Progressive Web App (PWA) de productividad gamificada. Es un **Single Page Application** de archivo único: toda la UI vive en `index.html` + `main.js`. No hay routing de servidor — toda la navegación es JavaScript puro que muestra/oculta `<div class="page" id="page-*">`.

**Tu misión como agente de QA:**
1. Ejecutar los escenarios de prueba definidos en este documento
2. Detectar errores visuales, funcionales y de estado
3. Identificar mejoras de UX
4. Generar un reporte `.md` con resultados y commitearlo al repo

---

## 2. URLs Y ENTORNOS

| Entorno | URL | Cuándo usar |
|---------|-----|-------------|
| **Producción** | `https://mylifeos.lat` | Pruebas de humo (smoke tests) — no destruir datos |
| **Firebase Hosting** | `https://life-os-prod-3a590.web.app` | Alias de producción |
| **Staging** | `https://mylifeos-staging.web.app` | Pruebas destructivas, creación de datos de prueba |

> ⚠️ **REGLA CRÍTICA:** Las pruebas que crean, editan o eliminan datos SIEMPRE deben correr contra **staging**, nunca contra producción. Las pruebas de solo-lectura pueden correr contra producción.

---

## 3. CREDENCIALES DE PRUEBA

```
# Usuario QA (staging)
QA_USER_EMAIL=qa-test@mylifeos-staging.com
QA_USER_PASSWORD=QaTestPass2026!

# Usuario demo con 90 días de datos (staging)
DEMO_USER_EMAIL=alejandro.torres@demo.lifeos.mx
DEMO_USER_PASSWORD=DemoPass2026!

# Admin (staging — SOLO para probar módulo Agencias)
ADMIN_EMAIL=wencesreal35@gmail.com
```

---

## 4. BOOT SEQUENCE — CÓMO ARRANCA LA APP

La app tiene una **boot screen obligatoria** que bloquea toda la UI hasta que:
1. La animación de terminal termina (~2.5s)
2. Los datos de Firestore están listos

**Implicación para Playwright:** Siempre esperar a que `#app` sea visible Y a que `#boot-screen` desaparezca antes de interactuar con cualquier elemento.

```javascript
// Patrón correcto de espera al cargar la app
await page.goto(APP_URL, { waitUntil: 'networkidle' });
await page.waitForSelector('#app', { timeout: 20000 });
await page.waitForSelector('#boot-screen', { state: 'hidden', timeout: 20000 });
```

Si `#boot-screen` sigue visible después de 20s → **FAIL crítico** (Firebase no cargó datos).

---

## 5. ESTRUCTURA DOM — SELECTORES CLAVE

### Pantalla de Login/Registro
```
#auth-screen          — pantalla inicial (visible antes del login)
#login-email          — input email del login
#login-pass           — input contraseña del login
#reg-nombre           — input nombre del registro
#reg-tel              — input teléfono del registro
#reg-email            — input email del registro ("Tu mejor correo *")
#reg-alias            — input alias público del registro
#reg-pass             — input contraseña del registro
#reg-terms            — checkbox de términos
```

### App principal (visible post-login)
```
#app                  — contenedor principal (hidden antes del login)
#boot-screen          — pantalla de boot (hidden cuando la app está lista)
#sidebar              — barra lateral de navegación (desktop)
#mob-nav              — barra de navegación inferior (mobile)
#sb-xp                — display de XP en sidebar
#sb-level             — display de nivel en sidebar
#toast                — contenedor de notificaciones
```

### Páginas (solo UNA visible a la vez)
```
#page-dashboard       — Tablero
#page-world           — Life OS World (mapa + apartamento)
#page-productividad   — Productividad (tareas, hábitos, rutinas)
#page-cuerpo          — Cuerpo (gym, muscle map)
#page-financial       — Financiero
#page-mente           — Mente & Poder (biblioteca, aliados)
#page-calendar        — Calendario
#page-stats           — Análisis + Gemelo
#page-aprende         — Aprende
#page-settings        — Ajustes
#page-agencies        — Admin (display:none!important — solo aparece si role='admin')
```

### Dashboard — elementos críticos
```
#nucleo-progress-ring — SVG del anillo principal (CRÍTICO)
#checkin-btn          — botón de check-in diario
#focus-bars           — barras de claridad/energía/productividad
#radar-chart          — chart.js radar de 6 dimensiones
#morning-briefing     — resumen matutino del día
```

### Finanzas
```
#tx-list              — lista de transacciones
#fin-balance          — saldo personal (debe mostrar $X,XXX.XX MXN, NO NaN)
#add-tx-btn           — botón agregar transacción
```

### Productividad
```
#task-list            — lista de tareas
#new-task             — input de nueva tarea
#habit-list           — lista de hábitos
#new-habit            — input de nuevo hábito
```

### Gemelo Potenciado
```
#gemelo-progress-bar  — barra de progreso de observación (días 1-30)
#gemelo-status-msg    — mensaje de estado del gemelo
```

### Onboarding del Gemelo (modal obligatorio)
```
#gemelo-onboarding-overlay — overlay del modal (aparece tras primer check-in)
```

---

## 6. NAVEGACIÓN — CÓMO MOVERSE ENTRE MÓDULOS

La navegación se hace con la función global `navigate(id)`. Los elementos clicables en la sidebar usan `onclick="navigate('dashboard')"` etc.

```javascript
// Navegar a un módulo vía click
await page.click('[onclick="navigate(\'financial\')"]');

// O via evaluación JS directa (más confiable)
await page.evaluate(() => navigate('financial'));
await page.waitForTimeout(800); // dar tiempo al render
```

**IDs válidos de navegación:**
`dashboard`, `world`, `productividad`, `cuerpo`, `financial`, `mente`, `calendar`, `stats`, `aprende`, `settings`

---

## 7. ESTADOS ESPECIALES DE LA APP

### Modo Blackout
- Se activa cuando el usuario no completa ninguna tarea ni hábito en el día
- **Señal visual:** `document.body.classList.contains('blackout')` === `true`
- **Señal visual:** anillo del núcleo se vuelve rojo
- **Señal DOM:** banner `#blackout-banner` visible
- **Se desactiva** completando cualquier tarea, hábito, o acción de gym

### Modo Recuperación (Día Difícil)
- Anillo morado, `document.body.classList.contains('recovery')` === `true`

### Trial / Pro / Consulta
- `S.is_pro` en el estado global — accesible vía `window.S.is_pro` desde Playwright
- Si trial expiró y no es Pro: banner de paywall, funciones bloqueadas
- **NO testear paywall de Stripe en producción** — usar staging con Stripe Test Mode

---

## 8. ERRORES CONOCIDOS A IGNORAR (no reportar como FAIL)

| Error en consola | Fuente | Acción |
|-----------------|--------|--------|
| `email-decode.min.js 404` | Script de Cloudflare/Vercel | Ignorar |
| `enableMultiTabIndexedDbPersistence() deprecated` | Firebase SDK v8 | Ignorar |
| `SyntaxError: export en webpage_content_reporter.js` | Extensión Chrome | Ignorar |
| `NotFoundError: insertBefore on Node` (en showModuleCard) | Race condition menor | Informativo, no crítico |

**Cualquier otro error de consola tipo `TypeError`, `ReferenceError`, `Cannot read properties of undefined` SÍ debe reportarse como FAIL.**

---

## 9. REGLAS DE NEGOCIO CRÍTICAS A VERIFICAR

Estas reglas deben verificarse activamente en las pruebas:

| Regla | Cómo verificar |
|-------|---------------|
| El apartamento usa XP, nunca coins | En la tienda, el display debe mostrar `S.xp`, NO `S.coins` |
| El análisis del Gemelo nunca se expone al cliente | `gemelo_data/{uid}` NO debe ser legible desde el cliente. Verificar que la Cloud Function `getGemelo` es el único canal |
| Soft-delete universal | Al eliminar tarea/hábito/transacción, el ítem NO debe desaparecer de Firestore — solo `deleted: true` |
| Blackout no afecta usuarios nuevos | Un usuario en su primer sesión NO debe ver modo Blackout |
| Onboarding del Gemelo es obligatorio | Tras el primer check-in, el modal de onboarding debe aparecer sin opción de cerrar |

---

## 10. MODOS DE PRUEBA RECOMENDADOS

### Smoke Test (contra producción — 5 min)
Solo verificar que la app carga y el login funciona. Sin mutaciones de datos.
1. Cargar `https://mylifeos.lat`
2. Verificar que la boot screen desaparece
3. Verificar que la pantalla de login aparece
4. Login con usuario QA
5. Verificar `#page-dashboard` visible y XP sin NaN
6. Logout

### Regression Test (contra staging — 30 min)
Cubrir todos los módulos con happy path + edge cases. Crear/editar/eliminar datos. Ver `QA-MASTER-PLAN.md` para el plan completo.

### Accessibility Check
- Verificar contraste de texto en dark mode y light mode
- Verificar que todos los inputs tienen `placeholder` o `label`
- Verificar que el FAB (botón flotante) no tapa elementos clave en mobile (viewport 375px)

---

## 11. CÓMO REPORTAR MEJORAS DE UX

Además de errores técnicos, busca activamente:

- **Textos truncados** — elementos con `overflow: hidden` que cortan texto importante
- **Botones sin feedback visual** — clics que no generan loading state ni toast
- **Datos en `NaN` o `undefined`** en cualquier parte de la UI
- **Elementos que se solapan** — especialmente en mobile (375×812)
- **Tiempos de carga percibidos** — si un módulo tarda más de 1.5s en renderizar tras navegar a él
- **Inconsistencias de estado** — XP en sidebar ≠ XP mostrado en dashboard
- **Formularios sin validación visible** — campos que aceptan datos inválidos sin error

Reportar mejoras en la sección `## MEJORAS SUGERIDAS` del reporte con formato:
```
- [UX] Módulo X: descripción del problema + sugerencia de mejora
```

---

## 12. ESTRUCTURA DEL REPORTE ESPERADO

El reporte debe guardarse en `/opt/openclaw/repo/qa-reports/YYYY-MM-DD_HH-mm.md` con esta estructura:

```markdown
# REPORTE QA — YYYY-MM-DD HH:mm
> App: https://mylifeos.lat | Engine: Playwright | Bot: OpenClaw

## RESUMEN
| Total | PASS | FAIL | SKIP | INFO |
| Tasa de éxito | X% |

## RESULTADOS POR MÓDULO
### 01-Auth ... ### 02-Dashboard ... etc.

## FALLOS CRÍTICOS
(Si los hay)

## MEJORAS SUGERIDAS
(UX, performance, accesibilidad)

---
*Generado por OpenClaw QA Bot · ISO timestamp*
```

---

*Briefing generado 2026-04-13 para OpenClaw QA Agent · Life OS v1.0*
