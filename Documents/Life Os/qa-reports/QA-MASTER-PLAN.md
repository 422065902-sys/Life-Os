# LIFE OS — QA MASTER PLAN
> Generado: 2026-04-06 | Motor: OpenClaw | Versión del código escaneada: commit 13da4c5
> Archivos base: `main.js` (11 057 líneas) · `app.js` (5 689 líneas) · `index.html` (3 578 líneas) · `functions/index.js` (998 líneas)

---

## ÍNDICE DE MÓDULOS

| # | Módulo | Riesgo | Líneas clave |
|---|--------|--------|-------------|
| 01 | Auth (registro, login, logout, recuperación) | **CRÍTICO** | main.js:4806–4890 |
| 02 | Onboarding / Trial flow | **CRÍTICO** | main.js:9275–9301 |
| 03 | BLACKOUT overlay | **CRÍTICO** | main.js:6268–6393 |
| 04 | Paywall / Consulta Mode | **CRÍTICO** | main.js:10683–11037 |
| 05 | Dashboard (núcleo, check-in, radar, briefing) | ALTO | main.js:560–700 |
| 06 | Finanzas (CRUD, gráficas, listener en tiempo real) | ALTO | main.js:1480–1800 |
| 07 | Hábitos (creación, check-in, batería, heatmap) | ALTO | main.js:876–1061 |
| 08 | Fitness / Gym Tracker | ALTO | main.js:1086–1480 |
| 09 | Gemelo Potenciado (observación, análisis Gemini) | ALTO | main.js:9641–10176 |
| 10 | Stripe / Pagos (checkout, webhook) | ALTO | functions/index.js:45–96 |
| 11 | Gamificación (XP, Rueda, Liga global) | MEDIO | main.js:8198–8230 |
| 12 | Tienda de Decoración (rooms, XP) | MEDIO | main.js:8468–8590 |
| 13 | Calendario (eventos, ICS export) | MEDIO | main.js:2020–2250 |
| 14 | Productividad (tareas, Pomodoro, ideas, metas) | MEDIO | main.js:724–2020 |
| 15 | Mente & Poder (biblioteca, bitácora, aliados) | MEDIO | main.js:3053–3315 |
| 16 | Life OS World (mapa, apartamento, presencia) | MEDIO | main.js:2935–3052 |
| 17 | Núcleo Global / Núcleo Personal (analíticas) | MEDIO | main.js:139–167 |
| 18 | Admin Panel (gestión de usuarios) | MEDIO | main.js:7706–7720 |
| 19 | FCM Push Notifications | BAJO | main.js:8948–9082 |
| 20 | PWA (instalación, offline) | BAJO | sw.js / manifest.json |

---

## 01. Auth (Registro · Login · Logout · Recuperación de contraseña)

**Archivos involucrados:**
- `main.js:4744–4890` — flujo de login/registro con Firebase Auth + creación del doc `users/{uid}`
- `main.js:9229–9256` — `checkUserAccess()` que determina hasAccess / reason / daysRemaining
- `index.html:#auth-screen` — pantalla de autenticación, formularios `#form-login` y `#form-register`
- `firestore.rules:17–71` — reglas que impiden que el usuario se auto-asigne `is_pro` o `role`

**Precondiciones:**
- Usuario NO autenticado (sesión limpia, localStorage vacío)
- Proyecto Firebase configurado (Auth habilitado con Email/Password)

**Flujo principal (Happy Path — Registro):**
OpenClaw debe:
1. Navegar a la URL de la app; verificar que `#auth-screen` tenga `display:flex` y `#app` tenga `display:none`
2. Hacer clic en el tab "Crear cuenta"
3. Rellenar `#reg-nombre` con "Test User QA", `#reg-email` con un email único, `#reg-pass` con "QaPass123!"
4. Seleccionar género haciendo clic en `.gender-btn` (hombre o mujer)
5. Marcar checkbox `#consent-register`
6. Hacer clic en el botón "CREAR CUENTA"
7. Verificar que `#boot-screen` aparece con la animación terminal
8. Verificar que tras el boot, `#app` es visible y `#auth-screen` tiene `display:none`
9. Verificar en Firestore: `users/{uid}` tiene campos `trial_ends_at`, `is_pro:false`, `role:"free"`
10. Verificar que `#trial-banner` es visible con texto "días restantes"

**Flujo principal (Happy Path — Login):**
OpenClaw debe:
1. En `#form-login`, rellenar `#login-email` y `#login-pass` con credenciales existentes
2. Hacer clic en botón "INICIAR SESIÓN"
3. Verificar que `#app` aparece con datos del usuario cargados en el header (`#sb-xp`, `#tb-xp`)

**Flujo principal (Happy Path — Logout):**
OpenClaw debe:
1. Hacer clic en el ícono de logout en la sidebar o settings
2. Verificar que `#auth-screen` vuelve a ser visible
3. Verificar que `#app` tiene `display:none`

**Casos límite obligatorios:**
| Escenario | Input | Resultado esperado |
|-----------|-------|--------------------|
| Email ya registrado | email existente en registro | Toast "Este correo ya está registrado" visible en `#toast` |
| Contraseña débil | "123" | Advertencia de fortaleza visible; botón no procede |
| Sin consentimiento | checkbox `#consent-register` desmarcado | Botón "CREAR CUENTA" permanece deshabilitado |
| Credenciales incorrectas | email/pass equivocados en login | Mensaje de error contextual visible bajo el formulario |
| Usuario bloqueado | `role:"blocked"` en Firestore | `checkUserAccess` retorna `reason:"blocked"`, paywall activo |
| Trial expirado al login | `trial_ends_at` < now | `showPaywallLockdown()` invocado post-boot, módulos bloqueados |
| Sin campo `trial_ends_at` | usuario legacy | `checkUserAccess` retorna `hasAccess:true, reason:"trial_active"` |
| Timeout de red | Simular offline antes de login | Toast de error visible, sin crash de la app |

**Verificaciones en Firestore (colección sandbox):**
- `users/{uid}.trial_ends_at` debe ser `Timestamp` con valor ≈ now + 7 días
- `users/{uid}.is_pro` debe ser `boolean` con valor `false`
- `users/{uid}.role` debe ser `string` con valor `"free"` (o `"admin"` para wencesreal35@gmail.com)
- `users/{uid}/data/main` debe existir con campos de estado inicial
- Regla: intentar `PATCH users/{uid}` con `{is_pro:true}` desde cliente → debe retornar `PERMISSION_DENIED`

**Riesgo estimado: CRÍTICO**
*La Firestore rule que bloquea auto-asignación de `is_pro` es la última línea de defensa contra bypass de paywall.*

---

## 02. Onboarding / Trial Flow

**Archivos involucrados:**
- `main.js:9275–9302` — `checkTrialAndRetention()` que calcula días de trial y activa paywall
- `main.js:9393–9510` — sistema de onboarding cards (`_onbKey`, `showModuleCard`, `dismissModuleCard`)
- `main.js:9510–9547` — `showTutorial()` — tutorial interactivo inicial
- `index.html:#trial-banner` — banner superior con días restantes
- `index.html:#trial-text` — span con contador de días

**Precondiciones:**
- Usuario recién registrado (primer login, `S.createdAt` = hoy)
- `trial_ends_at` = now + 7 días

**Flujo principal (Happy Path):**
OpenClaw debe:
1. Verificar que `#trial-banner` es visible y `#trial-text` contiene "días restantes"
2. Navegar al módulo Dashboard — verificar que aparece la card de onboarding del módulo
3. Hacer clic en el botón de dismiss de la card — verificar que la card desaparece
4. Verificar en `localStorage` que la clave `_onbc_{pageId}` existe con valor `"1"`
5. Simular avance de tiempo a día 6 del trial — verificar que el banner muestra "1 día restante"
6. Simular avance a día 8 (trial expirado) — verificar que `S.trialExpired === true` y `showPaywallLockdown()` es invocado

**Casos límite obligatorios:**
| Escenario | Input | Resultado esperado |
|-----------|-------|--------------------|
| Primera sesión protegida | Nuevo usuario, día 1 | BLACKOUT no se activa aunque el núcleo esté al 0% |
| Trial expirado (Firestore) | `trial_ends_at` < now en Firestore | Paywall lockdown activado post-boot |
| Trial expirado (local) | `S.trialExpired:true` en estado local | `showPaywallLockdown()` diferido por `_schedulePostBoot` |
| Onboarding card ya vista | `_onbc_{pageId}` = "1" en localStorage | Card NO aparece al re-visitar el módulo |
| X del trial banner | Clic en botón X del banner | Banner se oculta, `S.trialBannerDismissed:true` |

**Verificaciones en Firestore (colección sandbox):**
- `users/{uid}.trial_ends_at` debe ser Timestamp exacto = registro + 7 días (86400000 × 7 ms)
- `users/{uid}.is_pro` = `false` al inicio del trial

**Riesgo estimado: CRÍTICO**
*Un error en el cálculo de días (`S.createdAt` vs `trial_ends_at` de Firestore) puede bloquear usuarios válidos o dejar usuarios expirados con acceso.*

---

## 03. BLACKOUT Overlay (Trial expirado + Usuario bloqueado)

**Archivos involucrados:**
- `main.js:6210–6393` — lógica completa del núcleo global y estados BLACKOUT / RECUPERACIÓN
- `main.js:6270–6393` — condición `state==='blackout'` y `document.body.classList.add('blackout')`
- `main.js:9229–9256` — `checkUserAccess()` con `reason:"blocked"`
- `index.html:#app` — la clase `.blackout` en `body` activa el overlay visual

**Precondiciones:**
- Usuario autenticado
- Para BLACKOUT de núcleo: `S.tasksCompletedToday === 0 && S.habitsCompletedToday === 0` y `S.blackoutOverrideToday !== todayStr`
- Para BLACKOUT de acceso: `userData.role === "blocked"` en Firestore

**Flujo principal (Happy Path — BLACKOUT de núcleo):**
OpenClaw debe:
1. Tener un usuario sin tareas ni hábitos completados hoy
2. Verificar que el anillo SVG `#nucleo-progress-ring` tiene trazo rojo (`url(#nucleo-gradient-bo)`)
3. Verificar que `document.body.classList` contiene `"blackout"`
4. Verificar que el badge del núcleo muestra texto "SYSTEM BLACKOUT" y emoji "⚠"
5. Verificar que `#toast` muestra "⚠️ SYSTEM BLACKOUT — −50 XP"
6. Verificar en estado local: `S.xp` se redujo en 50

**Flujo principal (Happy Path — Override por acción real):**
OpenClaw debe:
1. Estando en BLACKOUT, completar una tarea o hábito
2. Verificar que `S.blackoutOverrideToday` es igual a la fecha de hoy (formato YYYY-MM-DD)
3. Verificar que `document.body.classList` ya NO contiene `"blackout"`

**Flujo principal (Happy Path — usuario bloqueado):**
OpenClaw debe:
1. Usuario con `role:"blocked"` inicia sesión
2. Verificar que `checkUserAccess()` retorna `{hasAccess:false, reason:"blocked"}`
3. Verificar que la pantalla de paywall/lockdown es visible e impide navegación a módulos

**Casos límite obligatorios:**
| Escenario | Input | Resultado esperado |
|-----------|-------|--------------------|
| Primera sesión (día 1) | `_isFirstWeek()` retorna true | BLACKOUT de núcleo NO se activa |
| Modo Recuperación activo | `S.modoDiaDificil:true` | BLACKOUT de núcleo NO se activa aunque el núcleo esté al 0% |
| Override ya aplicado hoy | `S.blackoutOverrideToday === todayStr` | BLACKOUT no se activa aunque núcleo sea 0% |
| Trial expirado | `trial_ends_at` < now | Paywall Lockdown (no BLACKOUT de núcleo — son distintos) |
| Usuario bloqueado | `role:"blocked"` | Pantalla de bloqueo, sin acceso a ningún módulo |
| XP en 0 | `S.xp < 50` antes de BLACKOUT | `S.xp` = `Math.max(0, S.xp - 50)` → nunca negativo |

**Verificaciones en Firestore (colección sandbox):**
- El campo `blackoutOverrideToday` se persiste en `users/{uid}/data/main` tras el override
- El XP deducido (-50) se refleja en `users/{uid}/data/main.xp`

**Riesgo estimado: CRÍTICO**
*Un bug en la condición del override puede causar BLACKOUT permanente aunque el usuario esté activo, o nunca activar la penalización.*

---

## 04. Paywall / Consulta Mode

**Archivos involucrados:**
- `main.js:10683–10846` — `showPaywallLockdown()` — overlay de bloqueo total
- `main.js:10877–10894` — `_isConsultaMode()` y `_consultaNavGuard(id)`
- `main.js:10967–11037` — `showConsultaBanner()`, `activateConsultaMode()`, `deactivateConsultaMode()`
- `main.js:10642–10683` — `_buildPaywallHookText()` — copy dinámico del paywall
- `main.js:9154–9199` — `irAPagarStripe()` y `cerrarPagoExitoso()`

**Precondiciones:**
- Usuario con trial expirado (`trial_ends_at` < now) o `S.trialExpired:true`
- O usuario con `role:"blocked"`

**Flujo principal (Happy Path — Modo Consulta):**
OpenClaw debe:
1. Verificar que el banner de Consulta Mode es visible con días restantes
2. Intentar navegar a módulo "Finanzas" (nav-item) — verificar que `_consultaNavGuard('finanzas')` permite la navegación (Consulta solo bloquea ESCRITURA, no lectura)
3. Intentar agregar una transacción — verificar que el formulario está bloqueado o el botón muestra overlay de upgrade
4. Verificar que `#paywall-lockdown` (o elemento equivalente) tiene `display:block`

**Flujo principal (Happy Path — Paywall Lockdown total):**
OpenClaw debe:
1. Verificar que el overlay de paywall cubre toda la pantalla
2. Verificar que el copy dinámico incluye el hook correcto (ej: "Tu Gemelo ya terminó de observarte" si viene del Gemelo)
3. Hacer clic en "Activar Plan Pro ($99 MXN/mes)" — verificar que `irAPagarStripe()` es invocado
4. Verificar que una ventana nueva se abre hacia Stripe Checkout (URL de Stripe)
5. Simular retorno con `?pago=exitoso` en la URL — verificar que `cerrarPagoExitoso()` es invocado
6. Verificar que el usuario recibe toast de confirmación y el paywall desaparece

**Casos límite obligatorios:**
| Escenario | Input | Resultado esperado |
|-----------|-------|--------------------|
| Pago cancelado | `?pago=cancelado` en URL | Toast informativo, paywall persiste |
| Trial aún activo | `trial_ends_at` > now | Paywall NO aparece, botón de upgrade visible en Settings |
| Admin forzado a Consulta | `role:"admin"` | `checkUserAccess` retorna `hasAccess:true` — admin nunca entra en Consulta |
| Dismiss del paywall | Clic en X (si existe) | Paywall oculto pero funciones pro siguen bloqueadas |
| Múltiples tabs | App abierta en 2 tabs | Solo un tab debe procesar `?pago=exitoso` |

**Verificaciones en Firestore (colección sandbox):**
- Tras pago exitoso (simulado): `users/{uid}.is_pro` = `true`, `users/{uid}.role` = permanece sin cambio (solo el webhook de Stripe debe cambiar `is_pro`)

**Riesgo estimado: CRÍTICO**
*El paywall es la barrera de monetización. Un bypass (localStorage, manipulación de `S.plan`) puede dar acceso Pro sin pagar.*

---

## 05. Dashboard (Núcleo, Check-in, Radar, Briefing)

**Archivos involucrados:**
- `main.js:560–590` — `updateXP()` — actualiza XP en header y sidebar
- `main.js:624–680` — `initRadarChart()`, `updateRadarColors()`, `switchRadar()`
- `main.js:681–723` — `initFocusBars()`, `updateFocusCircle()`
- `main.js:2484–2533` — `confirmCheckin()`, `resetSaludIfNewDay()`
- `main.js:2421–2484` — `renderCheckinDots()`, `updateCheckinStreak()`
- `index.html:#nucleo-progress-ring` — SVG del anillo principal

**Precondiciones:**
- Usuario autenticado y con acceso (trial activo o Pro)
- Datos de Firestore cargados (`_markBootDataReady()` completado)

**Flujo principal (Happy Path):**
OpenClaw debe:
1. Navegar a la página principal (Dashboard)
2. Verificar que `#nucleo-progress-ring` tiene `stroke-dashoffset` calculado (no NaN)
3. Verificar que el anillo muestra un estado visible: IDLE / EN FLUJO / COMPLETO / BLACKOUT
4. Hacer clic en botón `#checkin-btn` — verificar que abre el modal `#modal-calibration`
5. Ajustar los 3 sliders (claridad, energía, productividad) a valores > 0
6. Hacer clic en "Confirmar Check-in"
7. Verificar que `S.checkinHoy === true` y `S.racha` aumentó en 1
8. Verificar que los dots de racha en `renderCheckinDots()` muestran el día de hoy como activo
9. Verificar que XP en `#sb-xp` y `#tb-xp` aumentó
10. Verificar que el Radar Chart (`canvas`) renderizó sin errores de consola

**Casos límite obligatorios:**
| Escenario | Input | Resultado esperado |
|-----------|-------|--------------------|
| Check-in doble | Clic en check-in 2 veces el mismo día | Segundo check-in ignorado, `S.checkinHoy` permanece `true` |
| Sliders en 0 | Claridad=0, Energía=0, Productividad=0 | Check-in válido; radares en 0 sin crash |
| Datos offline | Simular offline antes de confirmar | Estado actualizado localmente, guardar en cola |
| Racha rota | Sin check-in ayer | `S.racha` muestra valor correcto (no incrementa) |
| Usuario Pro | `is_pro:true` | Morning Briefing visible en `#morning-briefing` |

**Verificaciones en Firestore (colección sandbox):**
- `users/{uid}/data/main.checkinHoy` = `true` tras check-in
- `users/{uid}/data/main.racha` = N+1
- `users/{uid}/data/main.xp` incrementado según XP del check-in

**Riesgo estimado: ALTO**
*El núcleo es la pantalla principal; un error en `updateFocusCircle()` o el SVG puede mostrar `NaN` o un ring vacío que confunde al usuario.*

---

## 06. Finanzas (CRUD, Gráficas, Listener en tiempo real)

**Archivos involucrados:**
- `main.js:1480–1542` — `_startFinancialListener()` — onSnapshot sobre `users/{uid}/transactions`
- `main.js:1565–1615` — `addTransaction()` — escritura directa a Firestore (sin debounce)
- `main.js:1688–1730` — `deleteTx()` — soft-delete (campo `deleted:true`)
- `main.js:1706–1733` — `openEditTx()`, `saveTxEdit()`
- `main.js:1615–1667` — `updateFinancialDisplay()`, `updatePieCharts()`
- `firestore.rules:51–64` — reglas de validación para transacciones
- `index.html:#tx-list` — lista de transacciones

**Precondiciones:**
- Usuario autenticado
- `_startFinancialListener` inicializado (llamado en `init()`)
- Para probar saldos adicionales: `S.extraSaldos` con al menos un saldo creado

**Flujo principal (Happy Path — Agregar transacción):**
OpenClaw debe:
1. Navegar a módulo Finanzas
2. Hacer clic en "Nueva Transacción" — verificar que `#modal-tx` (o equivalente) se abre
3. Seleccionar tipo "salida", ingresar monto "500", categoría "Comida", descripción "Almuerzo"
4. Hacer clic en "Guardar"
5. Verificar que en `#tx-list` aparece una nueva tarjeta con "Almuerzo — $500"
6. Verificar que el saldo en `#fin-balance` (o elemento de saldo) se actualizó
7. Verificar en Firestore: `users/{uid}/transactions/{txId}` con campos `amount:500, type:"salida", deleted:false`

**Flujo principal (Happy Path — Soft delete):**
OpenClaw debe:
1. Localizar una transacción en `#tx-list`
2. Hacer clic en el botón de eliminar
3. Verificar que la transacción desaparece de `#tx-list`
4. Verificar en Firestore: el documento permanece pero `deleted:true`

**Casos límite obligatorios:**
| Escenario | Input | Resultado esperado |
|-----------|-------|--------------------|
| Monto 0 | amount=0 | Firestore rule rechaza (`amount > 0`); toast de error |
| Monto negativo | amount=-100 | Firestore rule rechaza; toast de error |
| Sin categoría | category="" | Validación client-side; toast "campo obligatorio" |
| Tipo inválido | type="transferencia" | Firestore rule rechaza (`type in ['entrada','salida']`) |
| Cuotas | cuotas=12, monto=1200 | Se crean 12 documentos de $100 en Firestore |
| Listener offline | Simular offline | `_finListenerReady:false`; UI no muestra $0 falso, muestra skeleton |
| Editar campo `type` | Cambiar type en edición | Firestore rule bloquea (campo `type` no permite update) |

**Verificaciones en Firestore (colección sandbox):**
- `users/{uid}/transactions/{txId}.amount` debe ser `number` > 0
- `users/{uid}/transactions/{txId}.type` debe ser `"entrada"` o `"salida"`
- `users/{uid}/transactions/{txId}.deleted` debe ser `boolean`
- `users/{uid}/transactions/{txId}.scope` debe existir

**Riesgo estimado: ALTO**
*El listener en tiempo real maneja el saldo como fuente de verdad — una escritura doble o un error en el onSnapshot puede mostrar saldos incorrectos.*

---

## 07. Hábitos (Creación, Check-in, Batería, Heatmap)

**Archivos involucrados:**
- `main.js:876–998` — `addHabit()`, `renderHabits()`, `toggleHabit()`, `deleteHabit()`
- `main.js:999–1061` — `setHeatmapRange()`, `_buildHeatmapGrid()`, `buildHeatmap()`
- `main.js:802–876` — `habitEmoji()` — detección automática de emoji por nombre
- `index.html:#panel-habits` — panel de hábitos
- `index.html:#new-habit` — input de nombre del hábito

**Precondiciones:**
- Usuario autenticado
- Módulo Productividad → tab Hábitos activo

**Flujo principal (Happy Path):**
OpenClaw debe:
1. Navegar a Productividad, seleccionar tab "Hábitos"
2. Escribir "Meditar 10 minutos" en `#new-habit`
3. Hacer clic en "Agregar Hábito"
4. Verificar que aparece una card de hábito con emoji automático (ej: 🧘)
5. Hacer clic en el toggle del hábito — verificar que cambia a estado "completado"
6. Verificar que `S.habitsCompletedToday` aumentó en 1
7. Verificar que XP se incrementó en `#sb-xp`
8. Verificar que el heatmap en el panel muestra el día de hoy con un punto activo
9. Verificar que la batería del hábito muestra estado "CARGANDO" o "ÓPTIMA"

**Casos límite obligatorios:**
| Escenario | Input | Resultado esperado |
|-----------|-------|--------------------|
| Nombre vacío | "" en `#new-habit` | Toast "El nombre es obligatorio"; no se agrega |
| Hábito duplicado | Mismo nombre 2 veces | Se permite (IDs únicos por timestamp), 2 hábitos aparecen |
| Toggle doble | Check y uncheck el mismo día | XP se ajusta; `completedDates` no duplica la fecha |
| Batería crítica | Hábito no completado 3+ días | Estado "CRÍTICA" visible en la card |
| Heatmap 90 días | `setHeatmapRange(90)` | Grid muestra 90 columnas sin error |
| Soft delete | Eliminar hábito | Desaparece de `#panel-habits`; `S.habits` filtrado |

**Verificaciones en Firestore (colección sandbox):**
- `users/{uid}/data/main.habits` — array con el nuevo hábito incluido
- Cada hábito tiene `id`, `name`, `emoji`, `completedDates:[]`, `streak:number`

**Riesgo estimado: ALTO**
*La lógica de batería y el heatmap dependen de `completedDates` — un bug al guardar duplica XP o muestra racha incorrecta.*

---

## 08. Fitness / Gym Tracker (Rutinas, Modo Gym, Muscle Map)

**Archivos involucrados:**
- `main.js:1323–1480` — `addRoutine()`, `renderRoutines()`, `enterGymMode()`, `renderGymMode()`, `addGymSet()`
- `main.js:1086–1143` — `buildMuscleMap()`, `renderMuscleBars()`
- `main.js:1143–1222` — `registrarEvento()`, `calcularVolumenSemanal()`, `initVolumeChart()`
- `main.js:1222–1310` — `renderXPChart()`
- `firestore.rules:66–71` — colección `entrenamientos/{entId}`

**Precondiciones:**
- Usuario autenticado
- Al menos una rutina creada con ejercicios

**Flujo principal (Happy Path):**
OpenClaw debe:
1. Navegar a Cuerpo → Físico
2. Hacer clic en "Nueva Rutina", ingresar nombre "Push Day"
3. Agregar ejercicio "Press Banca" (con series objetivo)
4. Guardar la rutina — verificar que aparece en la lista con botón "▶ Iniciar"
5. Hacer clic en "▶ Iniciar" — verificar que se activa `enterGymMode(routineId)`
6. En la pantalla de Gym Mode: verificar que `#gym-ex-tracker` muestra el primer ejercicio
7. Hacer clic en "Agregar Set" con peso "80" y reps "10"
8. Verificar que el set aparece en la lista
9. Navegar al siguiente ejercicio y completar la rutina
10. Verificar que se crea un documento en `users/{uid}/entrenamientos/{entId}`
11. Verificar que el Muscle Map resalta los grupos musculares trabajados (pecho → pectoral activo)
12. Verificar que `#volumeChart` se actualiza con el volumen de la sesión

**Casos límite obligatorios:**
| Escenario | Input | Resultado esperado |
|-----------|-------|--------------------|
| Rutina sin ejercicios | Iniciar rutina vacía | Toast de error o botón deshabilitado |
| Set con peso 0 | peso=0, reps=10 | Permitido (peso corporal); volumen suma 0 |
| Salir del Gym Mode | `exitGymMode()` antes de terminar | Confirmar abandono; sesión no se registra |
| Músculo no reconocido | Ejercicio "MiEjercicioCustom" | Ningún músculo resaltado; sin crash |
| Heatmap de frecuencia | `buildFreqHeatmap()` | Grid renderiza sin NaN en los estilos |

**Verificaciones en Firestore (colección sandbox):**
- `users/{uid}/entrenamientos/{entId}.fecha` = fecha ISO del día
- `users/{uid}/entrenamientos/{entId}.ejercicios` = array de ejercicios con sets
- `users/{uid}/entrenamientos/{entId}.volumenTotal` = número (kg totales)

**Riesgo estimado: ALTO**
*El Muscle Map usa detección por string del nombre del ejercicio — si `registrarEvento` falla, el map no se actualiza aunque la sesión se guarde.*

---

## 09. Gemelo Potenciado (Observación 30 días, Análisis Gemini, Gates)

**Archivos involucrados:**
- `main.js:9641–10176` — flujo completo: `initGemelo()`, `renderGemelo()`, estados A–E, `activateGemeloAnalysis()`
- `main.js:9309–9393` — `checkGemeloObservationDay()`, `_showGemeloDay29Badge()`
- `functions/index.js` — `generateGemeloAnalysis` (llama a Gemini API), `getGemelo` (verificación de acceso)
- `firestore.rules:80–85` — `gemelo_data/{uid}`: escritura permitida al cliente, lectura BLOQUEADA

**Precondiciones:**
- Usuario autenticado con `is_pro:true` o trial activo
- Para análisis: `gemeloDay >= 30`
- Para state D: Cloud Function `getGemelo` accesible

**Flujo principal (Happy Path — Activación):**
OpenClaw debe:
1. Navegar a Análisis → Gemelo Potenciado
2. Verificar state A: botón "Activar Observación" visible
3. Hacer clic en el botón — verificar que aparece el modal de consentimiento
4. Confirmar activación — verificar la transición visual de terminal
5. Verificar que `S.gemeloActive:true` y `S.gemeloStartDate` = fecha de hoy
6. Verificar que `gemelo_data/{uid}` se creó en Firestore con `estado:"observando"`, `startDate`

**Flujo principal (Happy Path — Día 29 badge):**
OpenClaw debe:
1. Simular `_gemeloDay()` retornando 29
2. Verificar que `_showGemeloDay29Badge()` es invocado
3. Verificar que el badge de "casi listo" es visible en el Dashboard (`#gemelo-progress-wrap`)

**Flujo principal (Happy Path — Análisis día 30):**
OpenClaw debe:
1. Simular `gemeloDay >= 30`
2. Verificar que `activateGemeloAnalysis()` llama a la Cloud Function `generateGemeloAnalysis`
3. Verificar que state C ("Analizando") es visible con indicador de carga
4. Verificar que state D aparece con el análisis narrativo (`_renderGemeloNarrativo()`)
5. Intentar leer `gemelo_data/{uid}` directamente desde el cliente → debe retornar `PERMISSION_DENIED`

**Casos límite obligatorios:**
| Escenario | Input | Resultado esperado |
|-----------|-------|--------------------|
| Trial expirado con Gemelo activo | `trialExpired:true` | State E (paywall) — análisis bloqueado |
| Cloud Function falla | Gemini API error | State C con mensaje de error; toast visible |
| 30 días sin datos de telemetría | `analytics/{uid}/eventos` vacío | Análisis generado con datos mínimos; sin crash |
| Re-activar observación | Clic en activar cuando ya está activo | Botón deshabilitado o flujo de reset |
| `getGemelo` sin auth | Request sin token | Cloud Function lanza `unauthenticated` |
| Survival Tasks | Trial expirado + análisis bloqueado | 3 tareas de supervivencia visibles; toggle funcional |

**Verificaciones en Firestore (colección sandbox):**
- `gemelo_data/{uid}.estado` = `"observando"` | `"analizando"` | `"listo"`
- `gemelo_data/{uid}.startDate` = Timestamp del día de activación
- `gemelo_data/{uid}.analysis_text` — NO legible desde cliente (regla: `allow read: if false`)

**Riesgo estimado: ALTO**
*El `analysis_text` es el contenido de valor que genera la conversión a Pro — si la regla de Firestore falla, cualquier usuario puede leer el análisis sin pagar.*

---

## 10. Stripe / Pagos (Checkout Session, Webhook)

**Archivos involucrados:**
- `main.js:9154–9199` — `irAPagarStripe()`, `activarPlanPro()`, `cerrarPagoExitoso()`
- `main.js:9138–9154` — `_preparePaymentWindow()`
- `functions/index.js:45–96` — `createStripeCheckoutSession` (HTTPS Callable)
- `functions/index.js:98–` — `stripeWebhook` (procesa eventos de Stripe)

**Precondiciones:**
- Usuario autenticado
- Cloud Functions desplegadas
- Variables de entorno `stripe.secret` y `stripe.webhook_secret` configuradas

**Flujo principal (Happy Path):**
OpenClaw debe:
1. Navegar a Ajustes → Suscripción
2. Hacer clic en "Activar Plan Pro ($99 MXN/mes)"
3. Verificar que `_preparePaymentWindow()` abre una ventana nueva
4. Verificar que la Cloud Function `createStripeCheckoutSession` es invocada con `priceId` correcto
5. Verificar que la ventana navega a una URL de Stripe Checkout (`checkout.stripe.com`)
6. Simular regreso exitoso (URL con `?pago=exitoso`)
7. Verificar que `cerrarPagoExitoso()` relee el doc `users/{uid}` desde Firestore
8. Verificar que si `is_pro:true` en Firestore, el UI actualiza el plan a "Pro"
9. Verificar que el banner de Consulta y el Paywall desaparecen

**Casos límite obligatorios:**
| Escenario | Input | Resultado esperado |
|-----------|-------|--------------------|
| Usuario no autenticado | Sin token en Cloud Function | `unauthenticated` error; no se crea sesión |
| `priceId` ausente | data sin `priceId` | `invalid-argument` error de la Cloud Function |
| Stripe API caída | Stripe error en Cloud Function | `internal` error; toast al usuario |
| Pago cancelado | `?pago=cancelado` en URL | Paywall persiste; toast informativo |
| Webhook `customer.subscription.deleted` | Stripe evento de cancelación | `is_pro:false` en Firestore; acceso revocado |
| `stripe_customer_id` ya existe | Usuario repite pago | Se reutiliza el `customerId` sin crear uno nuevo |

**Verificaciones en Firestore (colección sandbox):**
- `users/{uid}.stripe_customer_id` = string de Stripe (`cus_XXXXX`) — creado en el primer pago
- `users/{uid}.is_pro` = `true` después del webhook `checkout.session.completed`
- `users/{uid}.is_pro` = `false` después del webhook `customer.subscription.deleted`

**Riesgo estimado: ALTO**
*El webhook es la única escritura autorizada de `is_pro:true` en producción — si el endpoint no valida la firma de Stripe, un atacante puede activar Pro para cualquier usuario.*

---

## 11. Gamificación (XP, Rueda del Multiplicador, Liga Global)

**Archivos involucrados:**
- `main.js:8198–8230` — `gainXP(amount, skipBlackout)` — función central de XP
- `main.js:6991–7055` — lógica de la Ruleta de Multiplicador (segmentos, probabilidad, XP final)
- `main.js:89–166` — `publishLeaderboardEntry()`, `checkWeeklyReset()`, `loadGlobalCoreStats()`
- `firestore.rules:102–105` — colección `leaderboard/{uid}`

**Precondiciones:**
- Usuario autenticado
- Para la ruleta: dentro de un Plan Social activo con check-in del día

**Flujo principal (Happy Path — XP):**
OpenClaw debe:
1. Completar una tarea — verificar que `gainXP(50)` es llamado
2. Verificar que `#sb-xp` y `#tb-xp` muestran el nuevo valor
3. Verificar que si `S.xp % 1000 === 0` (level up), se invoca `spawnConfetti()`
4. Verificar que `users/{uid}/data/main.xp` se actualiza en Firestore (debounce 2s)

**Flujo principal (Happy Path — Ruleta):**
OpenClaw debe:
1. Hacer check-in en un Plan Social
2. Verificar que la ruleta animada aparece
3. Verificar que tras el spin, el multiplicador seleccionado (×1, ×1.5, ×2, ×3) se aplica al XP
4. Verificar que el check-in queda registrado en `S.planes[].checkins` con el multiplicador

**Flujo principal (Happy Path — Leaderboard):**
OpenClaw debe:
1. Verificar que `leaderboard/{uid}` se actualiza con XP semanal
2. Verificar que el Leaderboard muestra el ranking de usuarios
3. Simular reset semanal — verificar que `checkWeeklyReset()` reinicia los XP semanales

**Casos límite obligatorios:**
| Escenario | Input | Resultado esperado |
|-----------|-------|--------------------|
| BLACKOUT activo | `state==="blackout"`, `skipBlackout:false` | XP no se suma (BLACKOUT penaliza en lugar de sumar) |
| XP negativo | `gainXP(-100)` | No permitido o `Math.max(0, S.xp + amount)` |
| Level up | `S.xp` cruza múltiplo de 1000 | Confetti + toast de level up |
| Leaderboard manipulado | Intentar escribir leaderboard de otro uid | Firestore rule bloquea (`isOwner(uid)`) |
| Ruleta doble spin | Hacer check-in 2 veces el mismo día | Segunda spin bloqueada (estado de check-in ya registrado) |

**Verificaciones en Firestore (colección sandbox):**
- `leaderboard/{uid}.xpWeek` = número incremental
- `leaderboard/{uid}.weekKey` = clave de semana ISO (ej: "2026-W14")

**Riesgo estimado: MEDIO**
*La XP es la moneda de toda la app — un error en `gainXP` puede corromper el nivel del usuario o permitir XP infinito.*

---

## 12. Tienda de Decoración del Apartamento

**Archivos involucrados:**
- `main.js:8468–8590` — `renderShop()`, `unlockRoom(roomId, precio)`, `equipRoom(roomId)`, `applyEquippedRoom()`
- `main.js:8533–8558` — validación de XP antes de desbloquear
- `index.html` — shop overlay del apartamento

**Precondiciones:**
- Usuario en la escena del apartamento
- `S.xp` suficiente para comprar el room seleccionado (varía por tier)
- `S.unlockedRooms` = array de roomIds ya desbloqueados (persiste en Firestore)

**Flujo principal (Happy Path):**
OpenClaw debe:
1. Abrir el apartamento → hacer clic en "Tienda de Rooms"
2. Verificar que `renderShop()` muestra el XP actual del usuario
3. Seleccionar un room con precio menor al XP disponible
4. Hacer clic en "Desbloquear"
5. Verificar que `S.xp` se reduce en el precio del room
6. Verificar que `S.unlockedRooms` incluye el `roomId`
7. Verificar que el botón cambia a "Equipar"
8. Hacer clic en "Equipar" — verificar que `S.equippedRoom` = roomId
9. Verificar que `applyEquippedRoom()` aplica el estilo visual del room
10. Verificar que `unlockedRooms` y `equippedRoom` se persisten en Firestore

**Casos límite obligatorios:**
| Escenario | Input | Resultado esperado |
|-----------|-------|--------------------|
| XP insuficiente | XP < precio del room | Botón "Desbloquear" deshabilitado o muestra "XP insuficiente" |
| Room ya desbloqueado | `roomId` en `S.unlockedRooms` | Botón muestra "Equipar" directamente (no "Desbloquear") |
| Room ya equipado | `S.equippedRoom === roomId` | Botón muestra "Equipada ✓" |
| XP = 0 | Intentar comprar cualquier room | Todos los botones deshabilitados |
| Precio = 0 | Room gratuito (si existe) | `unlockRoom` ejecuta sin deducir XP |

**Verificaciones en Firestore (colección sandbox):**
- `users/{uid}/data/main.unlockedRooms` = array con el `roomId` comprado
- `users/{uid}/data/main.equippedRoom` = string con el `roomId` equipado
- `users/{uid}/data/main.xp` = XP reducido en el precio del room

**Riesgo estimado: MEDIO**
*La deducción de XP y el desbloqueo son atómicos en memoria pero se guardan con debounce — un crash entre compra y guardado puede resultar en XP deducido sin room desbloqueado.*

---

## 13. Calendario (Eventos, Exportación ICS)

**Archivos involucrados:**
- `main.js:2020–2250` — `renderCalendar()`, `renderCalEvents()`, `addCalEvent()`, `deleteCalEvent()`
- `main.js:2132–2250` — `toggleCalExportMenu()`, `generarICS()`, `exportCalendarICS()`, `exportarDiaActual()`
- `index.html` — sección de calendario, grid mensual

**Precondiciones:**
- Usuario autenticado
- Módulo Calendario activo

**Flujo principal (Happy Path):**
OpenClaw debe:
1. Navegar al módulo Calendario
2. Verificar que el grid mensual renderiza con el mes actual
3. Hacer clic en un día del mes
4. Verificar que `selectCalDay(key)` actualiza `S.calSelectedDay`
5. Hacer clic en "Agregar evento" — ingresar título "Reunión QA" y hora "10:00"
6. Guardar — verificar que el día muestra un punto de evento
7. Verificar que en la lista "Próximos eventos" aparece "Reunión QA"
8. Hacer clic en "Exportar ICS → Todo el calendario"
9. Verificar que se descarga un archivo `.ics` válido (comienza con `BEGIN:VCALENDAR`)

**Casos límite obligatorios:**
| Escenario | Input | Resultado esperado |
|-----------|-------|--------------------|
| Mes sin eventos | Mes vacío | Grid renderiza sin errores; "Sin eventos" visible |
| Exportar calendario vacío | `generarICS([])` | Archivo `.ics` válido pero sin VEVENT |
| Navegar meses | `calPrev()` hasta enero | Año decrementa correctamente |
| Título vacío | "" en nuevo evento | Toast de error; evento no creado |
| Hora inválida | "25:99" | Validación o evento con hora raw |

**Verificaciones en Firestore (colección sandbox):**
- `users/{uid}/data/main.calEvents` = array con el evento `{id, titulo, hora, fecha}`

**Riesgo estimado: MEDIO**
*El ICS export usa datos de múltiples módulos — un error en `generarICS()` puede producir un archivo que rompe calendarios externos.*

---

## 14. Productividad (Tareas, Pomodoro, Ideas, Metas)

**Archivos involucrados:**
- `main.js:724–800` — `_addTaskOriginal()`, `renderTasks()`, `toggleTask()`, `deleteTask()`
- `main.js:9576–9594` — `addTask()` (wrapper con NLP del FAB)
- `main.js:1858–1997` — `addGoal()`, `renderGoals()`, `addObjective()`, `toggleObj()`, `deleteGoal()`
- `main.js:6676` — Pomodoro timer y `gainXP` al completar sesión

**Precondiciones:**
- Usuario autenticado
- Módulo Productividad activo

**Flujo principal (Happy Path — Tarea):**
OpenClaw debe:
1. Escribir "Preparar informe" en el input de tarea
2. Seleccionar categoría y fecha opcional
3. Hacer clic en "Agregar" — verificar que aparece en `#task-list`
4. Hacer clic en el toggle de la tarea — verificar que `toggleTask(id)` suma XP (50)
5. Verificar que `S.tasksCompletedToday` aumentó
6. Hacer clic en eliminar — verificar que desaparece de `#task-list`

**Flujo principal (Happy Path — Pomodoro):**
OpenClaw debe:
1. Activar un Pomodoro desde una tarea
2. Verificar que el timer cuenta regresivamente
3. Al llegar a 0 — verificar que `gainXP(15)` es llamado y el toast aparece

**Casos límite obligatorios:**
| Escenario | Input | Resultado esperado |
|-----------|-------|--------------------|
| Tarea sin nombre | "" en input | Toast "campo obligatorio" |
| Pomodoro pausado y retomado | Pause + Resume | Timer retoma desde donde quedó |
| Meta sin sub-objetivos | `addGoal()` sin `addObjective()` | Meta creada con `objectives:[]`; sin crash |
| Toggle de objetivo | `toggleObj(goalId, objId)` | XP ganado; progreso de meta actualizado |
| FAB NLP | "tarea comprar leche mañana" | Tarea creada con fecha = mañana; módulo correcto |

**Verificaciones en Firestore (colección sandbox):**
- `users/{uid}/data/main.tasks` = array con la nueva tarea
- `users/{uid}/data/main.goals` = array con las metas

**Riesgo estimado: MEDIO**
*Las tareas son el core de la productividad; un error en `toggleTask` que no actualice `tasksCompletedToday` rompe el cálculo del núcleo.*

---

## 15. Mente & Poder (Biblioteca, Bitácora, Aliados, Planes Sociales)

**Archivos involucrados:**
- `main.js:3053–3315` — `syncUserDirectory()`, `sendFriendRequest()`, `acceptFriendRequest()`, presencia online
- `main.js:2935–3002` — sistema de heartbeat y `_presenceMap`
- `main.js:6739–7055` — Planes Sociales: `addPlan()`, check-in con ruleta
- `firestore.rules:125–145` — `friendRequests/{reqId}`

**Precondiciones:**
- 2 usuarios en la sandbox (userA y userB)
- `userDirectory/{uid}` existente para ambos

**Flujo principal (Happy Path — Solicitud de amistad):**
OpenClaw debe:
1. (Como userA) buscar a userB por nombre en el directorio
2. Hacer clic en "Agregar Aliado" → "Enviar solicitud"
3. Verificar que `friendRequests/{reqIdAB}` se crea con `status:"pending"`
4. (Como userB) verificar que aparece la notificación de solicitud pendiente
5. Hacer clic en "Aceptar" → verificar que `status:"accepted"` en Firestore
6. Verificar que userB aparece en la lista de aliados de userA y viceversa

**Flujo principal (Happy Path — Presencia online):**
OpenClaw debe:
1. userA activo en la app — verificar heartbeat cada 2min (`_setPresenceOnline`)
2. userB (aliado de userA) visible en el mapa con burbuja y tooltip de nombre
3. Simular inactividad de userA por >5 min — verificar que la burbuja desaparece del mapa

**Casos límite obligatorios:**
| Escenario | Input | Resultado esperado |
|-----------|-------|--------------------|
| Solicitud duplicada | userA envía 2 solicitudes a userB | Segunda solicitud rechazada (ya existe `reqId`) |
| userB rechaza | `rejectFriendRequest(reqId)` | `status:"rejected"`, sin conexión creada |
| Solicitud de sí mismo | userA → userA | Validación client-side o Firestore rule bloquea |
| UserDirectory privado | `privacidad:"privado"` | Burbuja NO aparece en el World Map |
| Plan Social sin XP | Hacer check-in sin XP previo | Ruleta funciona; XP final = 0 × multiplicador = 0 |

**Verificaciones en Firestore (colección sandbox):**
- `friendRequests/{reqId}.status` = `"accepted"` tras aceptar
- `users/{uid}/connections/{connId}` = documento creado para ambos usuarios
- `userDirectory/{uid}` actualizado con `ultimaVez` del heartbeat

**Riesgo estimado: MEDIO**
*La regla de Firestore para `friendRequests` es compleja (múltiples condiciones) — un error en el `reqId` o en los campos permitidos puede romper el flujo de amistad silenciosamente.*

---

## 16. Life OS World (Mapa, Apartamento, Presencia, Tienda)

**Archivos involucrados:**
- `main.js:2935–3053` — sistema de presencia y `spawnFriendBubbles()`
- `main.js:8468–8665` — `renderShop()`, `aptZoneClick()`, `_moveAptBubbleTo()`, `_showAptTooltip()`
- `main.js:8663–8745` — `syncLandscapePanel()`, `toggleLandscapePanel()`

**Precondiciones:**
- Usuario autenticado
- Módulo World activo

**Flujo principal (Happy Path — Mapa):**
OpenClaw debe:
1. Navegar al módulo World
2. Verificar que el mapa (canvas o SVG) renderiza sin errores
3. Hacer clic en una zona del mapa — verificar que navega al módulo correspondiente
4. Verificar que la burbuja del usuario se mueve a la zona seleccionada

**Flujo principal (Happy Path — Apartamento):**
OpenClaw debe:
1. Hacer clic en la zona del apartamento — verificar que aparece el diálogo de confirmación
2. Confirmar entrada — verificar la transición cinematográfica ciudad → apartamento
3. Hacer clic en la zona "BANCO" — verificar que navega al módulo Finanzas
4. Verificar que el tooltip aparece al hover sobre cada zona

**Casos límite obligatorios:**
| Escenario | Input | Resultado esperado |
|-----------|-------|--------------------|
| Sin aliados | `S.allies:[]` | Mapa carga sin burbujas de aliados; sin crash |
| Aliado offline | `ultimaVez > 5min` | Burbuja de aliado NO aparece |
| Landscape panel | `toggleLandscapePanel()` | Drawer se abre/cierra correctamente |

**Verificaciones en Firestore (colección sandbox):**
- `userDirectory/{uid}.ultimaVez` = Timestamp actualizado por heartbeat
- `userDirectory/{uid}.presencia` = `"online"` mientras el heartbeat está activo

**Riesgo estimado: MEDIO**
*El sistema de presencia usa polling Firestore — con muchos aliados puede generar reads excesivos y costos elevados.*

---

## 17. Núcleo Global / Núcleo Personal (Analíticas)

**Archivos involucrados:**
- `main.js:139–167` — `loadGlobalCoreStats()` — carga stats de leaderboard para el núcleo global
- `main.js:1222–1310` — `renderXPChart(uid)` — gráfica de XP real desde `user_activity`
- `index.html:#xpRealChart` — canvas del XP chart
- `index.html:#fisicoMentalChart` — canvas de Físico vs Mental

**Precondiciones:**
- Usuario autenticado
- Al menos 7 días de actividad en `user_activity`

**Flujo principal (Happy Path):**
OpenClaw debe:
1. Navegar a Análisis → tab Analíticas
2. Verificar que `renderXPChart(uid)` carga datos de `user_activity` y renderiza el chart
3. Verificar que `#fisicoMentalChart` muestra 2 datasets sin errores
4. Verificar que el Leaderboard muestra al menos 1 entrada (el usuario actual)

**Casos límite obligatorios:**
| Escenario | Input | Resultado esperado |
|-----------|-------|--------------------|
| Sin actividad | `user_activity` vacío | Charts vacíos con mensaje "Sin datos"; sin crash |
| Leaderboard vacío | `leaderboard` collection vacía | "Sin datos en el ranking" visible |
| Chart con NaN | Datos corruptos en `user_activity` | Chart ignora puntos inválidos; sin crash |

**Riesgo estimado: MEDIO**
*Los charts dependen de consultas Firestore asíncronas — un race condition puede renderizar antes de que lleguen los datos.*

---

## 18. Admin Panel (Gestión de usuarios, Agencias)

**Archivos involucrados:**
- `main.js:7706–7720` — `_isAdmin(u)` — verifica `role === 'admin'` o email de admin
- `main.js` — módulo Agencias: tabla de cálculo de métricas (solo visible para admin)
- `firestore.rules:7–11` — función `isAdmin()` en reglas

**Precondiciones:**
- Usuario con `role:"admin"` en Firestore (o email `wencesreal35@gmail.com`)

**Flujo principal (Happy Path):**
OpenClaw debe:
1. Iniciar sesión como `wencesreal35@gmail.com`
2. Verificar que el nav incluye la entrada "Admin" o "Agencias"
3. Verificar que la tabla de agencias carga correctamente
4. Verificar que un usuario non-admin NO ve esta entrada en el nav

**Casos límite obligatorios:**
| Escenario | Input | Resultado esperado |
|-----------|-------|--------------------|
| Non-admin intenta acceder | navigate('admin') directo | Redireccionado; módulo no renderiza |
| Admin leer doc de otro usuario | `isAdmin()` en Firestore | Permitido por regla `allow read, write: if isAdmin()` |
| Role spoofing | Usuario cambia `S.role` en consola | Las Firestore rules usan el token de Auth, no el estado local |

**Riesgo estimado: MEDIO**
*La verificación de admin usa tanto `_isAdmin()` client-side como las reglas de Firestore — si el estado local se manipula, las operaciones de escritura aún deben ser bloqueadas por las rules.*

---

## 19. FCM Push Notifications

**Archivos involucrados:**
- `main.js:8948–9082` — `registerPushNotifications()`, `activarNotificaciones()`, `_updateNotifStatusUI()`
- `main.js:9033–9082` — `initNotificationsToggle()`
- `firebase-messaging-sw.js` — Service Worker de FCM
- `functions/index.js` — `dailyBriefing`, `motivationalPill`, `reengagementNotif`, `notifyTrialExpiring`

**Precondiciones:**
- Navegador compatible con Push API (Chrome/Edge/Firefox en desktop, Chrome en Android)
- VAPID key configurada
- Usuario autenticado

**Flujo principal (Happy Path):**
OpenClaw debe:
1. Navegar a Ajustes → Notificaciones
2. Hacer clic en el toggle de notificaciones
3. Verificar que el navegador solicita permiso de notificación
4. Aceptar permiso — verificar que `_messaging.getToken()` retorna un token
5. Verificar que `users/{uid}.fcm_token` = el token en Firestore
6. Verificar que `_updateNotifStatusUI("granted")` actualiza el toggle a activo

**Casos límite obligatorios:**
| Escenario | Input | Resultado esperado |
|-----------|-------|--------------------|
| Permiso denegado | Usuario rechaza permiso | Toggle vuelve a OFF; toast informativo |
| Navegador sin soporte | Safari iOS | Toggle deshabilitado; mensaje "No soportado" |
| Token expirado | FCM token inválido | Cloud Function `notifyGemeloReady` maneja el error silenciosamente |
| PWA en background | App en segundo plano | Notificación aparece via Service Worker |

**Verificaciones en Firestore (colección sandbox):**
- `users/{uid}.fcm_token` = string no vacío tras habilitar notificaciones

**Riesgo estimado: BAJO**
*Las notificaciones son opcionales y el usuario puede seguir usando la app sin ellas.*

---

## 20. PWA (Instalación, Funcionamiento Offline)

**Archivos involucrados:**
- `sw.js` — Service Worker de cache
- `manifest.json` — manifiesto de la PWA
- `main.js` — `enableIndexedDbPersistence()` de Firestore (offline support)

**Precondiciones:**
- App servida sobre HTTPS
- Service Worker registrado

**Flujo principal (Happy Path):**
OpenClaw debe:
1. Visitar la app en Chrome — verificar que el banner de instalación aparece o está disponible en el menú
2. Instalar la PWA — verificar que se crea un ícono en el escritorio/home screen
3. Abrir la PWA instalada — verificar que carga sin internet (desde cache)
4. Completar una tarea offline — verificar que la acción se registra en IndexedDB
5. Reconectar internet — verificar que la sincronización automática ocurre (toast de sync)

**Casos límite obligatorios:**
| Escenario | Input | Resultado esperado |
|-----------|-------|--------------------|
| Offline total | Sin conexión al abrir | App carga con datos en caché; sin pantalla en blanco |
| Cache desactualizado | Nueva versión desplegada | Service Worker actualiza el cache en background |
| iOS Safari | Agregar a pantalla de inicio | App carga; scroll reset funciona (fix conocido) |

**Riesgo estimado: BAJO**
*El soporte offline depende de la configuración del SW; los errores no bloquean el flujo principal.*

---

## RESUMEN DE RIESGO

| Nivel | Módulos |
|-------|---------|
| CRÍTICO (4) | Auth, Onboarding/Trial, BLACKOUT Overlay, Paywall/Consulta |
| ALTO (6) | Dashboard, Finanzas, Hábitos, Fitness/Gym, Gemelo Potenciado, Stripe/Pagos |
| MEDIO (8) | Gamificación, Tienda, Calendario, Productividad, Mente & Poder, Life OS World, Núcleo Analíticas, Admin Panel |
| BAJO (2) | FCM Push Notifications, PWA |

**Total: 20 módulos auditados**

---

*Documento generado automáticamente por escaneo directo de `main.js`, `app.js`, `index.html`, `functions/index.js` y `firestore.rules`. Versión del código: commit 13da4c5 (2026-04-06).*
