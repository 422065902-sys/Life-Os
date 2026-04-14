# LIFE OS — MAPA DE MÓDULOS PARA AGENTE OPENCLAW
**Versión:** 2 · **Fecha:** 2026-04-13  
**Propósito:** Mapa de funcionalidades orientado a pruebas de QA automatizadas.  
Cada módulo incluye: qué existe, selectores DOM, escenarios a cubrir y qué constituye PASS/FAIL.

---

## CONVENCIONES

| Símbolo | Significado |
|---------|-------------|
| ✅ PASS | El comportamiento es el esperado |
| ❌ FAIL | El comportamiento difiere del esperado — reportar |
| ⚠️ WARN | Comportamiento sospechoso — documentar para revisión humana |
| ℹ️ INFO | Dato informativo — registrar sin calificar |
| 🔴 CRÍTICO | Fallo bloquea funcionalidad principal — prioridad máxima |
| 🟡 ALTO | Fallo afecta UX significativamente |
| 🟢 MEDIO | Fallo menor, no bloquea flujos |

---

## MÓDULO 00 — BOOT & AUTH 🔴 CRÍTICO

### Qué existe
- Boot screen con animación de terminal (~2.5s)
- Pantalla de login (email + contraseña)
- Pantalla de registro (nombre, teléfono, email, alias, contraseña, términos)
- Toggle mostrar/ocultar contraseña
- Remember me
- Mensajes de error contextuales

### Selectores clave
```
#auth-screen, #login-email, #login-pass, #reg-email, #reg-nombre
#reg-tel, #reg-alias, #reg-pass, #reg-terms
#boot-screen, #app
```

### Escenarios a probar

| # | Escenario | Selector / Acción | PASS si... | Prioridad |
|---|-----------|-------------------|-----------|-----------|
| A1 | Boot screen desaparece | Esperar `#boot-screen` hidden | Desaparece en < 20s | 🔴 |
| A2 | Login happy path | Fill email+pass → click login | `#app` visible, `#sb-xp` muestra número | 🔴 |
| A3 | Login credenciales incorrectas | Email fake + pass incorrecta | Toast de error visible, NO redirige | 🔴 |
| A4 | Login email mal formateado | `notanemail` sin @ | Toast de error O campo marcado inválido | 🟡 |
| A5 | Registro happy path (staging) | Llenar todos los campos → submit | Usuario creado, app abre en dashboard | 🔴 |
| A6 | Registro sin aceptar términos | Dejar `#reg-terms` sin check | No envía el form — error visible | 🟡 |
| A7 | Placeholder email en registro | Leer `placeholder` de `#reg-email` | Dice "Tu mejor correo *" | 🟢 |
| A8 | Logout | Click en botón logout | `#auth-screen` visible de nuevo | 🔴 |

---

## MÓDULO 01 — DASHBOARD 🔴 CRÍTICO

### Qué existe
- Anillo SVG animado (% completado del día)
- Check-in diario con racha
- Calibración matutina (sliders claridad/energía/productividad)
- Morning Briefing
- Radar Chart (6 dimensiones)
- Focus Bars
- Widgets de resumen (finanzas, tareas, gym)
- Preview del Gemelo Potenciado

### Selectores clave
```
#page-dashboard, #nucleo-progress-ring, #checkin-btn
#focus-bars, #radar-chart, #morning-briefing
#sb-xp, #sb-level, #sb-coins
```

### Escenarios a probar

| # | Escenario | Acción | PASS si... | Prioridad |
|---|-----------|--------|-----------|-----------|
| D1 | Dashboard visible al login | Post-login | `#page-dashboard` visible | 🔴 |
| D2 | Anillo SVG existe y tiene stroke | `document.querySelector('#nucleo-progress-ring')` | No null, tiene atributo `stroke-dashoffset` | 🔴 |
| D3 | XP sin NaN | Leer `#sb-xp` | Texto contiene número, no "NaN" | 🔴 |
| D4 | Nivel sin NaN | Leer `#sb-level` | Texto contiene número | 🔴 |
| D5 | Saldo financiero sin NaN | Leer widget financiero en dashboard | Muestra `$X,XXX.XX` o `…` mientras carga | 🔴 |
| D6 | Check-in diario ejecutable | Click `#checkin-btn` | Toast de XP ganado + racha actualizada | 🟡 |
| D7 | Radar chart renderiza | Navegar a dashboard | Canvas de Chart.js existe y no está en blanco | 🟡 |
| D8 | Focus bars visibles | `#focus-bars` | 3 barras presentes con valores 0-100 | 🟢 |
| D9 | No hay `undefined` visible | Escanear todo el texto del dashboard | Ningún elemento muestra "undefined" o "null" | 🟡 |
| D10 | Widget financiero muestra `…` al cargar | Inmediatamente post-login antes de que carguen transacciones | `…` en lugar de `$0.00` | 🟢 |

### Qué buscar en consola
- `[Life OS]` logs de inicialización → INFO
- Cualquier `TypeError` o `ReferenceError` → FAIL 🔴

---

## MÓDULO 02 — PRODUCTIVIDAD 🟡 ALTO

### Qué existe
- Tareas (CRUD completo, soft-delete, 7 categorías, emoji auto)
- Hábitos (CRUD, racha, batería 0-100%, heatmap)
- Rutinas (crear, activar/desactivar)
- Pomodoro básico (5/10/25/45/60 min)
- Pomodoro Ascensión (modo élite por tarea)
- Cámara de Enfoque (Focus Chamber)
- Ideas Rápidas (RAW → GUARDADA → CONVERTIDA → TAREA/META)
- Metas/Objetivos con sub-objetivos

### Selectores clave
```
#page-productividad
#task-list, #new-task
#habit-list, #new-habit
#idea-list, #new-idea
#goal-list
```

### Escenarios a probar

| # | Escenario | Acción | PASS si... | Prioridad |
|---|-----------|--------|-----------|-----------|
| P1 | Agregar tarea (staging) | Fill `#new-task` + submit | Tarea aparece en `#task-list` | 🔴 |
| P2 | Completar tarea | Toggle tarea | XP aumenta en sidebar, tarea marcada | 🔴 |
| P3 | Eliminar tarea (soft-delete) | Click delete en tarea | Tarea desaparece de UI; en Firestore `deleted: true` | 🟡 |
| P4 | Tarea con emoji auto-asignado | Crear tarea "comprar leche" | Emoji relevante asignado automáticamente | 🟢 |
| P5 | Agregar hábito | Fill `#new-habit` + submit | Hábito aparece con batería | 🔴 |
| P6 | Completar hábito | Toggle hábito | Batería sube, XP aumenta | 🔴 |
| P7 | Editar tarea persiste | Editar título de tarea → reload | Título actualizado después de recargar | 🟡 |
| P8 | Editar meta persiste | Editar meta → reload | Cambios persisten | 🟡 |
| P9 | Sub-objetivo completable | Toggle sub-objetivo de una meta | Sub-objetivo marcado + guarda en Firestore | 🟡 |
| P10 | Idea → Tarea | Crear idea, convertir a tarea | Tarea aparece en task-list con título de la idea | 🟢 |

---

## MÓDULO 03 — CUERPO 🟡 ALTO

### Qué existe
- Gym Tracker (registro de día de gym)
- Modo Gym en Vivo (sesión con ejercicios, sets, timer de descanso)
- Overlay Gym Focus
- Muscle Map (figura interactiva frontal/trasera)
- Gráfica de Volumen semanal
- XP Chart de actividad (últimos 30 días)
- Check-in de Salud (proteína, sueño, pasos, etc.)
- Longevidad
- Peso corporal

### Selectores clave
```
#page-cuerpo
#gym-tracker, #muscle-map
#health-checklist
#volume-chart, #xp-activity-chart
```

### Escenarios a probar

| # | Escenario | Acción | PASS si... | Prioridad |
|---|-----------|--------|-----------|-----------|
| C1 | Muscle map renderiza | Navegar a Cuerpo | SVG/canvas del muscle map visible | 🟡 |
| C2 | Toggle músculo registra entrenamiento | Click en grupo muscular | Grupo se ilumina + persiste | 🟡 |
| C3 | Gráfica de volumen no muestra NaN | Ver chart de volumen | Barras con valores numéricos válidos | 🟡 |
| C4 | Check-in de salud reseteado al día siguiente | Verificar con usuario con datos de ayer | Items sin marcar al inicio del día | 🟢 |
| C5 | XP por completar item de salud | Toggle "proteína del día" | XP aumenta en sidebar | 🟢 |

---

## MÓDULO 04 — FINANCIERO 🔴 CRÍTICO

### Qué existe
- Saldo Personal (calculado en tiempo real desde transacciones)
- Saldos Adicionales (sobres/cuentas)
- Transacciones Cloud-First (sub-colección Firestore)
- Transacciones en cuotas
- Soft-delete de transacciones
- Pie charts de ingresos/gastos por categoría
- Tarjetas de crédito
- Deudas

### Selectores clave
```
#page-financial
#tx-list, #add-tx-btn
#fin-balance (o selector con 'balance'/'saldo')
#pie-ingresos, #pie-gastos
```

### Escenarios a probar

| # | Escenario | Acción | PASS si... | Prioridad |
|---|-----------|--------|-----------|-----------|
| F1 | Saldo no muestra $0.00 falso al cargar | Inmediatamente post-login | `…` mientras carga, luego valor real | 🔴 |
| F2 | Saldo no muestra NaN | Leer elemento de saldo | Número formateado `$X,XXX.XX MXN` | 🔴 |
| F3 | Agregar transacción entrada (staging) | Monto=500, tipo=entrada | tx aparece en lista, saldo aumenta $500 | 🔴 |
| F4 | Agregar transacción salida (staging) | Monto=200, tipo=salida | tx aparece en lista, saldo disminuye $200 | 🔴 |
| F5 | Saldo actualiza en tiempo real | Agregar tx sin recargar | Saldo cambia sin F5 | 🔴 |
| F6 | Eliminar transacción (soft-delete) | Click delete en tx | tx desaparece de UI, saldo recalcula | 🟡 |
| F7 | Pie charts sin datos inválidos | Navegar a gráficas | Gráficas muestran datos o mensaje "sin datos", nunca NaN | 🟡 |
| F8 | Editar transacción persiste (staging) | Editar monto → reload | Monto actualizado después de recargar | 🟡 |

### Regla de negocio a validar
El saldo personal es la SUMA de todas las transacciones `entrada - salida` donde `deleted !== true`. Si hay discrepancia entre el saldo mostrado y esta suma → FAIL 🔴.

---

## MÓDULO 05 — MENTE & PODER 🟢 MEDIO

### Qué existe
- Biblioteca Personal (libros, progreso, Focus de Lectura)
- Bitácora de Victorias
- Día Difícil (Modo Recuperación)
- Aliados (solicitudes, directorio, perfil)
- Reloj Ejecutivo
- Planes Sociales (con Ruleta de recompensa)

### Selectores clave
```
#page-mente
#book-list, #new-book
#bitacora-list, #new-victoria
#aliados-list, #friend-requests-section
```

### Escenarios a probar

| # | Escenario | Acción | PASS si... | Prioridad |
|---|-----------|--------|-----------|-----------|
| M1 | Agregar libro | Fill nombre + submit | Libro aparece en lista con estado "Por leer" | 🟡 |
| M2 | Actualizar progreso de lectura | Input páginas leídas | % actualiza correctamente | 🟡 |
| M3 | Agregar victoria | Fill victoria + lección → submit | Entrada aparece con fecha | 🟡 |
| M4 | Solicitud de amistad acepta y persiste | Aceptar solicitud | Estado cambia a 'accepted' en Firestore | 🟡 |
| M5 | Día Difícil desactiva Blackout | Activar modo recuperación | `body.blackout` === false, anillo morado | 🟢 |

---

## MÓDULO 06 — CALENDARIO 🟢 MEDIO

### Qué existe
- Calendario mensual interactivo
- Eventos del día (CRUD)
- Lista de próximos eventos (7 días)
- Export ICS (todo el calendario / solo hoy)

### Selectores clave
```
#page-calendar
.cal-grid (o selector del grid)
[onclick*="calPrev"], [onclick*="calNext"]
#export-ics-btn (o selector del botón export)
```

### Escenarios a probar

| # | Escenario | Acción | PASS si... | Prioridad |
|---|-----------|--------|-----------|-----------|
| CAL1 | Grid del calendario renderiza | Navegar a Calendario | Grid visible con días del mes actual | 🟡 |
| CAL2 | Navegar al mes siguiente | Click `calNext` | Mes cambia, días actualizados | 🟡 |
| CAL3 | Agregar evento (staging) | Click día → fill título + hora | Evento aparece en el día seleccionado | 🟡 |
| CAL4 | Export ICS genera archivo | Click botón export ICS | Descarga inicia, archivo tiene extensión `.ics` | 🟢 |
| CAL5 | Días con eventos tienen marcador visual | Usuario con eventos existentes | Dots o badges visibles en días con eventos | 🟢 |

---

## MÓDULO 07 — ANÁLISIS 🟢 MEDIO

### Qué existe
- Gráfica Estado Físico vs Enfoque Mental (datos reales, últimos 30 días)
- Muscle Map Análisis
- Leaderboard semanal
- Life OS Wrapped
- Gemelo Potenciado (análisis completo)

### Selectores clave
```
#page-stats
#physical-mental-chart
#leaderboard-list
#gemelo-section, #gemelo-progress-bar, #gemelo-status-msg
```

### Escenarios a probar

| # | Escenario | Acción | PASS si... | Prioridad |
|---|-----------|--------|-----------|-----------|
| AN1 | Chart físico/mental renderiza | Navegar a Análisis | Canvas visible con líneas de datos (no en blanco) | 🟡 |
| AN2 | Chart usa datos reales, no Math.random | Inspeccionar dataset | Valores no cambian al re-renderizar | 🟡 |
| AN3 | Leaderboard muestra usuarios | Navegar a leaderboard | Al menos 1 entrada visible | 🟢 |
| AN4 | Gemelo progress bar correcta (staging, usuario con datos) | Ver sección Gemelo | Barra muestra % proporcional a días transcurridos | 🟡 |
| AN5 | Gemelo paywall para usuario free sin trial | Usuario con trial expirado | Paywall visible, análisis bloqueado | 🟡 |

---

## MÓDULO 08 — WORLD (MAPA + APARTAMENTO) 🟢 MEDIO

### Qué existe
- Mapa de ciudad con zonas clickeables
- Burbuja/avatar del usuario (color + emoji personalizables, persiste en Firestore)
- Apartamento (6 zonas: BANCO, AGENDA, CONFIG, LAB, BIBLIOTECA, GYM)
- Tienda de decoración (precios en XP — NUNCA coins)
- Presencia online de aliados en tiempo real

### Selectores clave
```
#page-world
#city-map, #user-bubble
#apartment-scene
#shop-exp-display  ← DEBE mostrar S.xp, NO S.coins
```

### Escenarios a probar

| # | Escenario | Acción | PASS si... | Prioridad |
|---|-----------|--------|-----------|-----------|
| W1 | Mapa de ciudad renderiza | Navegar a World | Mapa visible, zonas clickeables | 🟡 |
| W2 | Shop usa XP, no coins | Abrir tienda del apartamento | `#shop-exp-display` muestra valor de `S.xp` | 🔴 |
| W3 | Comprar room con XP (staging, usuario con XP suficiente) | Click Desbloquear | XP disminuye, room aparece como equipable | 🟡 |
| W4 | Room equipada persiste tras reload | Equipar room → recargar | Misma room equipada al volver | 🟡 |
| W5 | Burbuja color/emoji persiste | Cambiar color → reload | Color/emoji persisten | 🟢 |

---

## MÓDULO 09 — AJUSTES 🟢 MEDIO

### Qué existe
- Perfil (nombre, color acento, dark/light mode)
- Suscripción (ver plan, botones de pago)
- Notificaciones Push (toggle + FCM)
- API Key de Claude (NLP avanzado)
- Exportar datos (JSON)
- Eliminar cuenta
- Términos y Privacidad

### Selectores clave
```
#page-settings
#accent-picker
#dark-mode-toggle
#push-notif-toggle
#export-data-btn
#delete-account-btn
```

### Escenarios a probar

| # | Escenario | Acción | PASS si... | Prioridad |
|---|-----------|--------|-----------|-----------|
| S1 | Cambiar color acento | Pick nuevo color | Color se aplica en tiempo real a toda la UI | 🟢 |
| S2 | Toggle dark/light mode | Click toggle | Tema cambia visualmente | 🟢 |
| S3 | Export datos genera JSON | Click exportar | Descarga JSON con datos del usuario | 🟢 |
| S4 | Botón eliminar cuenta tiene confirmación | Click eliminar cuenta | Pide confirmación antes de proceder | 🟡 |
| S5 | Suscripción muestra plan correcto | Navegar a ajustes | Badge del plan actual visible (Free/Trial/Pro) | 🟡 |

---

## MÓDULO 10 — FAB (BOTÓN FLOTANTE) 🟡 ALTO

### Qué existe
- Input de lenguaje natural en español
- NLP local — detecta tipo (tarea, hábito, meta, evento, idea, transacción, gym)
- Chip de confirmación antes de ejecutar
- Corrección de typos
- Detección de fecha relativa ("mañana", "el lunes")

### Selectores clave
```
#fab-btn (o selector del botón flotante circular)
#fab-input
#fab-chip-confirm
```

### Escenarios a probar

| # | Escenario | Input | PASS si... | Prioridad |
|---|-----------|-------|-----------|-----------|
| FAB1 | FAB visible en todas las páginas | Navegar a cualquier módulo | Botón FAB siempre visible | 🟡 |
| FAB2 | FAB no tapa contenido en mobile (375px) | Viewport 375px | Botón en posición que no bloquea nav inferior | 🟡 |
| FAB3 | Detectar tarea | "tarea comprar leche mañana" | Chip de confirmación tipo "tarea" | 🟡 |
| FAB4 | Detectar hábito | "hábito meditar 10 minutos" | Chip tipo "hábito" | 🟡 |
| FAB5 | Detectar transacción | "gasté 150 en comida" | Chip tipo "transacción" con monto | 🟢 |
| FAB6 | FAB desaparece durante Blackout banner | `body.blackout` activo | FAB clearado por el banner | 🟢 |

---

## MÓDULO 11 — GEMELO POTENCIADO 🟡 ALTO

### Qué existe
- Observación 30 días (telemetría silenciosa)
- Progress bar lineal día 1-30
- Onboarding obligatorio (modal 2 pantallas, sin close/skip)
- Análisis con Gemini AI (vía Cloud Function — NUNCA expuesto al cliente directamente)
- Survival Tasks (mientras análisis bloqueado)
- Terminal Transition (efecto visual al activar)
- Pro-Gate (verifica acceso antes de exponer análisis)

### Selectores clave
```
#gemelo-section
#gemelo-progress-bar
#gemelo-status-msg
#gemelo-onboarding-overlay
#gemelo-analysis-text  ← NUNCA debe mostrar contenido si usuario no es Pro/Trial
```

### Escenarios a probar

| # | Escenario | Acción | PASS si... | Prioridad |
|---|-----------|--------|-----------|-----------|
| G1 | Progress bar proporcional a días | Usuario día 15 de 30 | Barra al 50% | 🟡 |
| G2 | Onboarding aparece tras primer check-in | Usuario nuevo + check-in | Modal `#gemelo-onboarding-overlay` visible | 🔴 |
| G3 | Onboarding NO tiene botón de cerrar | Modal visible | No existe X ni "saltar" | 🔴 |
| G4 | Usuario free sin trial no ve análisis | Usuario expirado | Paywall visible, análisis bloqueado | 🔴 |
| G5 | `gemelo_data/{uid}` no accesible desde cliente | Intentar leer directo desde Firestore SDK | Error de permisos (FAIL en Firestore = PASS en seguridad) | 🔴 |

---

## CHECKLIST DE REVISIÓN VISUAL GENERAL

Ejecutar en TODOS los módulos con viewport 375×812 (iPhone SE) y 1280×800 (desktop):

- [ ] No hay texto cortado/truncado que oculte información importante
- [ ] No hay elementos solapados
- [ ] Los botones tienen tamaño mínimo táctil (44×44px) en mobile
- [ ] El FAB no tapa la navegación inferior en mobile
- [ ] Los toasts son legibles (no tapados por otros elementos)
- [ ] Los modales tienen fondo de overlay (no flotan sin contexto)
- [ ] La boot screen desaparece completamente (no deja residuos visuales)
- [ ] En dark mode: no hay textos blancos sobre fondo blanco ni viceversa
- [ ] En light mode: no hay textos blancos sobre fondo blanco (si light mode está disponible)

---

## PRIORIZACIÓN DE EJECUCIÓN

Ejecutar en este orden (mayor riesgo primero):

1. 🔴 Boot & Auth
2. 🔴 Dashboard (XP/NaN checks)
3. 🔴 Financiero (saldo en tiempo real)
4. 🔴 Gemelo (seguridad del análisis)
5. 🟡 Productividad (tareas + hábitos)
6. 🟡 FAB
7. 🟡 Cuerpo
8. 🟡 Mente & Poder
9. 🟢 World / Apartamento
10. 🟢 Calendario
11. 🟢 Análisis
12. 🟢 Ajustes

---

*Mapa QA generado 2026-04-13 para OpenClaw QA Agent · Life OS v1.0*
