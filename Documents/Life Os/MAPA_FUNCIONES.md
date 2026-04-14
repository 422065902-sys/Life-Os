# LIFE OS — MAPA COMPLETO DE MÓDULOS, SUBMÓDULOS Y FUNCIONES
> Para guion de TikTok. Todo lo que existe hoy en la app.
> Última actualización: 2026-04-13

---

## ⚡ MÓDULO 0 — SISTEMA GLOBAL (invisibles al usuario pero críticos)

### Boot Screen / Arranque
- Animación terminal al abrir la app (efecto hacker)
- La app no muestra NADA hasta que tanto la animación como los datos de la nube estén listos
- Cola de toasts bloqueada durante el boot
- Cola de acciones diferidas (paywall, alertas) post-boot

### Núcleo Global
- **Nivel + XP** — barra de progreso, levelup con confetti
- **Modo Blackout** — si no completas ninguna tarea ni hábito, el núcleo se apaga visualmente (anillo rojo, alerta ⚠)
- **Modo Recuperación (Día Difícil)** — activas cuando la vida real se pone difícil; desactiva el Blackout ese día, anillo morado
- **Multiplicador ×2** — cuando el núcleo llega al 100% (todas tareas + hábitos del día)
- **Estado en Flujo** — 60-99% completado
- **Override Blackout** — cualquier acción real (gym, bitácora, hábito) desactiva el Blackout aunque el contador sea 0
- **Primer sesión protegida** — los usuarios nuevos nunca ven Blackout

### Onboarding
- Pantalla de misiones semilla (el usuario elige sus primeras 3 misiones al registrarse)
- Sistema de cards de ayuda contextual por módulo (se muestran la primera vez que entras a cada página)
- Tutorial interactivo
- **Onboarding obligatorio del Gemelo Potenciado** — modal de 2 pantallas (presentación + confirmación) que aparece entre el check-in matutino y el módulo de tareas, la primera vez. Sin botón de cerrar ni skip. Escribe `geminoPotenciado` y `onboardingGemeloCompletado` en Firestore antes de habilitar "Continuar" (OnboardingGemelo.js)

### FAB (Botón flotante de acción rápida)
- Input de lenguaje natural en español: "tarea comprar leche mañana"
- **NLP local** — detecta tipo (tarea, hábito, meta, evento, idea, transacción, gym)
- **NLP con Claude API** — si el usuario conecta su Anthropic API Key, usa Gemini para clasificar con mayor precisión
- Chip de confirmación antes de ejecutar
- Corrección de typos automática
- Detección de fecha relativa ("mañana", "el lunes", "en 3 días")
- Routing al módulo correcto automáticamente

### Tema y Personalización Visual
- Dark mode / Light mode
- Color acento (16 presets + picker custom hexadecimal)
- El acento se aplica a toda la UI en tiempo real

### Toasts / Notificaciones in-app
- Sistema de toasts no-bloqueantes
- Confetti en levelup y logros

---

## ⚡ MÓDULO 1 — TABLERO (Dashboard)

### Núcleo Central (Widget principal)
- Anillo SVG animado con % de completado del día
- 6 estados visuales: IDLE / ACTIVANDO / EN FLUJO / COMPLETO / BLACKOUT / RECUPERACIÓN
- Contador de tareas del día completadas / totales
- Contador de hábitos completadas / totales
- XP ganado hoy
- Racha de check-ins

### Check-in Matutino
- Botón de check-in diario (una vez por día)
- Sistema de racha — días consecutivos
- Dots de los últimos 7 días (visual de racha)
- XP por check-in

### Calibración Matutina
- Sliders de claridad mental (0-100) / energía (0-100) / productividad (0-100)
- Persisten en estado y alimentan el radar chart y el Gemelo

### Morning Briefing
- Resumen automático del día generado en base a tareas pendientes, hábitos críticos y métricas
- Se muestra cada mañana en el dashboard

### Radar Chart
- Gráfico radar de 6 dimensiones: Físico, Mental, Productividad, Finanzas, Social, Aprendizaje
- 3 modos de vista: HOY / SEMANA / TENDENCIA
- Colores dinámicos según el estado del vector más bajo

### Focus Bars
- 3 barras de claridad, energía y productividad (actualizadas por calibración)

### Widgets de resumen
- Resumen financiero (saldo personal)
- Contador de tareas
- Widget físico (racha de gym + días activos)

### Gemelo Potenciado (preview en dashboard)
- Barra de progreso de observación (día actual de los 30)
- Badge de día 29 cuando el análisis casi está listo

---

## 🗺️ MÓDULO 2 — LIFE OS WORLD

### Mapa de Ciudad (Scene: City)
- Mapa visual interactivo con zonas clickeables
- Cada zona del mapa corresponde a un módulo de la app
- Al hacer clic navega al módulo o al apartamento
- Tu burbuja (avatar) se mueve por el mapa según el módulo que estés usando
- Tracking automático de navegación — la burbuja sigue tus acciones en tiempo real

### Tu Burbuja / Avatar
- Color personalizable (picker de color)
- Emoji personalizable
- Se persiste en Firestore (Fix 2.1)
- Animación de movimiento entre zonas

### Apartamento (Scene: Apt)
- Transición cinematográfica ciudad → apartamento
- Dialog de confirmación de entrada
- 6 zonas interactivas dentro del apartamento (BANCO, AGENDA, CONFIG, LAB, BIBLIOTECA, GYM)
- Cada zona navega al módulo correspondiente
- Tooltip al hacer hover sobre zona
- Burbuja propia dentro del apartamento

### Tienda de Decoración del Apartamento
- **PRECIO EN XP (no coins) — REGLA FUNDAMENTAL**
- Catálogo de rooms por tiers (Básico, Premium, Exótico)
- Filtro por tipo (Mujer / Hombre / Unisex)
- Vista previa con imagen o placeholder emoji
- Botón Desbloquear (gasta XP) / Equipar / Equipada
- Badge "★ EXÓTICA" para rooms especiales
- Display del XP actual del usuario en el shop
- **Persistencia en Firestore** — `unlockedRooms` y `equippedRoom` se sincronizan en la nube (fix 2026-04-06); antes se perdían al limpiar caché o cambiar dispositivo

### Presencia Online (Aliados en el mundo)
- Muestra burbuja de aliados conectados en el mapa
- Sistema de heartbeat — presencia en tiempo real vía Firestore
- Tooltip con nombre del aliado al hacer hover
- Panel de aliados online (World Panel)
- Badge de actividad reciente por zona
- Privacidad: público / solo aliados / privado

### Panel de Paisaje (Landscape Panel)
- Panel lateral con vista ampliada del mapa
- Drawer deslizante

---

## ✅ MÓDULO 3 — PRODUCTIVIDAD

### Tareas
- Agregar tarea (con título, categoría, fecha, emoji auto-detectado)
- Completar tarea (toggle) — suma XP
- Editar tarea
- Eliminar tarea (soft delete)
- 7 categorías: Personal / Físico / Financiero / Educación / Trabajo / Social / Espiritual
- Emoji auto-asignado por nombre de la tarea
- Fecha de vencimiento
- Pomodoro por tarea (ver sub-sección Pomodoro Ascensión)

### Hábitos
- Agregar hábito (nombre, frecuencia, emoji automático)
- Completar hábito del día (toggle)
- Racha por hábito (días consecutivos)
- **Sistema de batería** — cada hábito tiene una batería del 0-100% que se carga al completarlo y se descarga si lo omites
- Estados de batería: CRÍTICA / BAJA / CARGANDO / ÓPTIMA / SOBRECARGA
- Heatmap de actividad de hábitos (últimos 30/90/180 días)
- Editar hábito
- Eliminar hábito (soft delete)
- Degradación automática de baterías si no se completan

### Rutinas
- Crear rutina con lista de ejercicios/pasos
- Activar / desactivar rutina
- Editar rutina
- Eliminar rutina
- Modo Gym integrado (ver Módulo Cuerpo)
- Rutinas frecuentes (shortcuts en dashboard)

### Pomodoro (básico)
- Timer configurable (5, 10, 25, 45, 60 min)
- Iniciar / Pausar / Reiniciar
- Contador de sesiones completadas
- XP por sesión completada

### Pomodoro Ascensión (modo élite)
- Se activa desde una tarea específica
- Pantalla inmersiva de focus total
- Timer con display grande estilo terminal
- Partículas animadas
- Al completar: XP bonus + confetti

### Cámara de Enfoque (Focus Chamber)
- Modo de enfoque profundo separado del pomodoro
- Timers preset: 15 / 25 / 45 / 60 / 90 min
- Animación de partículas
- Al terminar: suma XP de productividad

### Ideas Rápidas (Capture)
- Input de captura rápida desde el FAB
- Lista de ideas en tarjetas visuales con color/emoji auto-generado
- **Estados de idea:** RAW → GUARDADA → CONVERTIDA
- Filtrar ideas por estado
- Convertir idea → Tarea
- Convertir idea → Meta
- Guardar idea (estado "kept")
- Revertir idea a estado RAW
- Eliminar idea (soft delete)

### Metas / Objetivos
- Crear meta con título, descripción, categoría, fecha límite, XP objetivo
- Añadir sub-objetivos a una meta
- Completar sub-objetivos (toggle)
- Completar meta completa → XP reward + confetti
- Editar meta
- Eliminar meta (soft delete)
- Lista de metas completadas (historial)

### Chat Interno (experimental)
- Chat de notas rápidas internas
- Mensajes tipo burbuja

---

## 💪 MÓDULO 4 — CUERPO

### Gym Tracker
- Registrar día de gym (toggle de día activo)
- Historial de días de gym en calendario
- Heatmap de frecuencia de entrenamiento

### Modo Gym en Vivo
- Activar sesión de entrenamiento desde una rutina
- Vista inmersiva de la sesión actual
- Navegar entre ejercicios de la rutina
- Registrar sets por ejercicio (peso × reps)
- Timer de descanso
- Al terminar: registra volumen, actualiza muscle map, suma XP

### Overlay Gym Focus
- Pantalla de focus visual durante la sesión de gym
- Navegación entre ejercicios con gestos
- Marcar set completado

### Muscle Map
- Figura corporal interactiva (vista frontal y trasera)
- Toggle hombre / mujer
- Cada grupo muscular resaltado con intensidad según frecuencia de entrenamiento
- Grupos: pecho, espalda, piernas, hombros, bíceps, tríceps, abdomen, glúteos
- Los músculos se degradan con el tiempo si no los entrenas
- Detección automática de músculos al registrar entrenamiento (por nombre del ejercicio)
- Barras de nivel por grupo muscular

### Volumen de Entrenamiento
- Gráfica de volumen semanal (kg total levantado por semana)
- Calcula desde los entrenamientos registrados en Firestore

### XP Chart de Actividad
- Gráfica de barras del XP ganado por día (últimos 30 días)

### Check-in de Salud (Combustible)
- Proteína del día ✓/✗
- Comida saludable ✓/✗
- Suplementos ✓/✗
- Desayuno ✓/✗
- Cena ✓/✗
- Sueño — slider de horas (registrar al dormir)
- Pasos del día ✓/✗
- Movilidad ✓/✗
- Pausas activas ✓/✗
- XP por cada ítem completado
- Se resetea automáticamente cada día

### Longevidad
- Acciones específicas de longevidad (configurables)
- Toggle diario

### Peso corporal
- Registro del peso actual
- Prompt de edición

---

## 💰 MÓDULO 5 — FINANCIERO

### Saldo Personal
- Balance calculado en tiempo real desde las transacciones (fuente de verdad)
- Listener en tiempo real con Firestore (onSnapshot)

### Saldos Adicionales
- Crear múltiples "cuentas" o "sobres" (ej: ahorro, vacaciones, emergencia)
- Balance individual por saldo calculado desde transacciones
- Editar nombre y emoji del saldo
- Eliminar saldo

### Transacciones (Cloud-First)
- Agregar transacción: monto, tipo (entrada/salida), categoría, descripción, fecha, scope (personal o saldo extra), cuotas
- Transacciones en cuotas (con número de cuotas)
- Editar transacción (monto, descripción)
- Eliminar transacción (soft delete — nunca se borra el historial)
- Lista de transacciones filtrada (sin deleted)
- Escritura directa a Firestore sub-colección (sin debounce)
- Actualización optimista en UI (respuesta inmediata)
- Migración automática del doc monolítico a sub-colección

### Gráficas Financieras
- Pie chart de Ingresos (por categoría)
- Pie chart de Gastos (por categoría)
- Leyenda interactiva

### Tarjetas de Crédito
- Agregar tarjeta (nombre, límite, fecha de corte)
- Ver tarjetas activas
- Eliminar tarjeta

### Deudas
- Agregar deuda (acreedor, monto, fecha vencimiento, descripción)
- Ver deudas activas
- Eliminar deuda (soft delete)

---

## 🧠 MÓDULO 6 — MENTE & PODER

### Biblioteca Personal
- Agregar libro con título, autor, tipo (libro / habilidad / curso / podcast)
- Estados del libro: Por leer / Leyendo / Completado / Abandonado
- % de progreso de lectura
- Registrar páginas leídas (desde tarjeta o desde Focus Libro)
- XP al completar libro
- Eliminar libro (soft delete)
- Lista visual con portada/emoji

### Focus de Lectura (Book Focus Overlay)
- Pantalla inmersiva para sesión de lectura
- Timer de sesión
- Botón de registrar páginas directamente
- Al completar: XP + actualiza progreso del libro

### Bitácora de Victorias
- Añadir entrada con: victoria del día + lección aprendida
- Lista de entradas con fecha
- XP por cada entrada

### Día Difícil (Modo Recuperación)
- Botón para activar si el día fue muy difícil
- Desactiva el Blackout para ese día
- Modo visual especial (morado)
- Se desactiva automáticamente al día siguiente

### Aliados (Red Social Propia)
- Buscar usuarios por nombre o ID público en el directorio
- Enviar solicitud de amistad
- Ver solicitudes recibidas pendientes
- Aceptar / Rechazar solicitud
- Añadir aliado local (sin cuenta de Life OS)
- Ver perfil de aliado
- Editar notas sobre un aliado
- Eliminar aliado
- Ver aliados online en el World Map
- Sistema de directorio público (syncUserDirectory)

### Reloj Ejecutivo
- Reloj en tiempo real con segundos
- Display estilo terminal

### Planes Sociales
- Crear plan social con: nombre, descripción, fecha fin, XP requerido, objetivos
- Unirse a un plan existente
- Check-in de progreso personal en el plan
- Ver participantes y su progreso
- **Ruleta de recompensa** — al hacer check-in, giras una ruleta animada que reparte XP bonus
- Detalle completo del plan con lista de objetivos por participante
- Eliminar plan

### Pomodoro Avanzado
- (Ver también Módulo 3 — los timers de Mente usan la misma lógica pero en contexto de biblioteca/estudio)

---

## 📅 MÓDULO 7 — CALENDARIO

### Vista de Calendario
- Calendario mensual interactivo
- Navegar mes anterior / siguiente
- Días con eventos marcados visualmente
- Seleccionar día para ver/agregar eventos
- Integración con Planes Sociales (dots de planes en días relevantes)
- Actividades del día desde todos los módulos (gym, tareas, hábitos)

### Eventos del Día
- Agregar evento con: título, hora
- Ver eventos del día seleccionado
- Eliminar evento

### Lista de Próximos Eventos
- Panel de upcoming con los próximos 7 días
- Clasificado por día con actividades de todos los módulos

### Export de Calendario
- **Exportar ICS** — todo el calendario en un archivo .ics compatible con Google Calendar / Apple Calendar / Outlook
- **Exportar día actual** — solo los eventos de hoy en .ics
- Menú de opciones de exportación

---

## 📊 MÓDULO 8 — ANÁLISIS

### Gráfica Estado Físico vs Enfoque Mental
- Chart de líneas con datos reales
- Dataset 1: Estado físico (desde gymDays + muscleMap)
- Dataset 2: Enfoque mental (desde xpHistory + claridad)
- Últimos 30 días

### Muscle Map Análisis
- Vista analítica de los grupos musculares
- Barras de nivel con porcentajes

### Leaderboard
- Ranking semanal de XP
- Otros usuarios de Life OS
- Tu posición en el ranking

### Life OS Wrapped
- Resumen de logros del período
- Stats de XP, hábitos, gym, finanzas

### Gemelo Potenciado (módulo completo)
Ver sección dedicada abajo ↓

---

## 📖 MÓDULO 9 — APRENDE

### Contenido por capas
- **Conceptos** — tarjetas de conceptos financieros, de productividad, etc.
- **Guías** — guías paso a paso con prompts copiables para ChatGPT/Claude
- **Noticias** — artículos curados desde Firestore (solo admins pueden publicar)

### Detalle de contenido
- Modal de detalle con contenido completo
- Copiar prompt al clipboard
- Vista de artículo de noticia completa

---

## ⚙️ MÓDULO 10 — AJUSTES

### Perfil
- Nombre de usuario
- Color acento personalizado
- Dark / Light mode
- Copiar UID del usuario al clipboard

### Suscripción
- Ver plan actual (Free / Trial / Pro)
- Banner de días restantes del trial con countdown
- Botón para activar Plan Pro ($99 MXN/mes)
- Botón para activar Plan Estudiante ($49 MXN/mes)
- Stripe Checkout integrado (abre en ventana nueva en mobile)

### Notificaciones Push
- Toggle para activar/desactivar notificaciones
- Solicitud de permiso del navegador
- Soporte PWA (service worker — `firebase-messaging-sw.js`)
- **FCM token real** — usa `firebase.messaging().getToken()` (fix 2026-04-05); antes usaba Web Push endpoint URL incompatible con Admin SDK
- Notificaciones programadas: Daily Briefing 8am, Píldora Motivacional 3pm, Evening Wind Down 8pm, Re-engagement

### API Key de Claude (NLP)
- Campo para ingresar Anthropic API Key personal
- Habilita el NLP avanzado del FAB

### Exportar Datos
- Exportar todos los datos de la app como JSON
- Respaldo local completo

### Eliminar Cuenta
- Flujo de eliminación con confirmación de contraseña
- Soft delete de todos los datos del usuario

### Reset de App
- Borrar todos los datos locales (con confirmación)

### Términos y Privacidad
- Modal legal con tabs: Términos de Servicio / Política de Privacidad

---

## 🤖 MÓDULO 11 — GEMELO POTENCIADO

### Observación (30 días)
- Al activar: comienza 30 días de observación silenciosa
- La app registra telemetría de comportamiento (XP, hábitos, gym, finanzas) en Firestore
- Progress bar lineal del día 1 al 30
- Mensajes semanales de progreso ("Tu gemelo está observando — semana 1 de 4")
- Badge especial el día 29

### Análisis con IA (Gemini)
- Al completar 30 días: Cloud Function `generateGemeloAnalysis` llama a Gemini API
- Genera análisis psicológico-conductual personalizado basado en los patrones reales del usuario
- El analysis_text NUNCA se expone al cliente directamente (solo vía Cloud Function con verificación de acceso)
- "Gancho intriga" — un fragmento revelador que se pre-genera el día 29 para crear anticipación

### Estados del Gemelo
- **A — Idle:** No activado todavía
- **B — Observando (días 1-29):** Recopilando datos
- **C — Analizando:** Cloud Function procesando
- **D — Análisis listo (Pro/Trial):** Muestra el análisis completo con narrativa
- **E — Paywall:** Trial expirado, análisis bloqueado

### Survival Tasks
- Mientras el análisis está bloqueado, el Gemelo genera 3 tareas de supervivencia diarias
- Toggle de completado por tarea
- Al completar las 3: XP bonus

### Análisis Profundo
- Sección de análisis psicológico detallado
- Narrativa con insights sobre hábitos, finanzas, física

### Terminal Transition
- Efecto visual de terminal al activar/desactivar el Gemelo

### Acceso Pro-Gate
- Cloud Function `getGemelo` verifica: is_pro === true || role === 'premium' || trial activo
- Si no tiene acceso → retorna paywall trigger sin exponer el análisis

---

## 🔐 AUTH Y ACCESO

### Login
- Email + contraseña
- Remember me
- Toggle de visibilidad de contraseña
- Loading state del botón
- Mensajes de error contextuales

### Registro
- Email + contraseña + nombre + género
- Checkbox de consentimiento (términos)
- Advertencia de fortaleza de contraseña
- Al registrar: crea doc en Firestore, inicia trial de 7 días

### Trial Gratuito
- 7 días de acceso Pro completo al registrarse
- Banner con días restantes en la UI
- Dismissable (se oculta al hacer clic en X)
- Al expirar: lockdown de funciones Pro

### Modo Consulta
- Si el trial expiró pero no ha pagado: "Modo Consulta"
- Puede ver datos pero no agregar nueva información
- Banner persistente con CTA de upgrade
- Guard en navegación que bloquea módulos restringidos

### Paywall Lockdown
- Pantalla de bloqueo total con opciones de pago
- Copy dinámico según el hook (desde Gemelo, desde funciones Pro, etc.)

### Logout
- Guarda datos antes de cerrar sesión
- Limpia estado local
- Detiene heartbeat de presencia

---

## 👑 MÓDULO ADMIN (oculto — solo wencesreal35@gmail.com)

### Módulo Agencias
- Tabla de agencias con cálculo de métricas
- 3 tabs de configuración
- Agregar fila / editar fila / eliminar fila
- Cálculo automático de comisiones y proyecciones
- Vista de precios externos vs internos

---

## 📡 INFRAESTRUCTURA INVISIBLE

### Cloud Functions (server-side)
- `createStripeCheckoutSession` — genera sesión de pago
- `stripeWebhook` — activa/revoca Pro automáticamente al pagar/cancelar
- `getGemelo` — sirve análisis con verificación de acceso
- `generateGemeloAnalysis` — llama a Gemini AI
- `notifyGemeloReady` — push notification cuando el análisis está listo
- `notifyTrialExpiring` — avisa antes de que expire el trial
- `dailyBriefing` — push diario 8am CDMX
- `motivationalPill` — push 3pm CDMX
- `afternoonGoalReview` — push 4pm CDMX
- `eveningWindDown` — push 8pm CDMX para usuarios activos en las últimas 12h (nuevo 2026-04-05)
- `reengagementNotif` — reactiva usuarios inactivos
- **Crons corregidos** — los schedules anteriores corrían 6h tarde por zona horaria; ahora usan `timeZone('America/Mexico_City')` correctamente

### Sincronización
- Persistencia offline (Firestore IndexedDB) — la app funciona sin internet
- Sincronización automática al reconectar
- Debounce de 2s en guardado del estado monolítico
- Escritura inmediata para transacciones financieras
- **onSnapshot en tiempo real para el doc principal** — sincroniza entre dispositivos/pestañas automáticamente (fix 2026-04-06)
- onSnapshot en tiempo real para finanzas
- `_finListenerReady` flag — el dashboard muestra `…` en lugar de `$0.00` mientras el listener de transacciones no ha completado su primer snapshot

### Sistema de Actividad
- Cada acción importante (tarea, hábito, gym, finanza) registra un documento en `user_activity`
- Alimenta el XP Chart real en la sección Análisis

---

## 📊 RESUMEN EN NÚMEROS

| Categoría | Cantidad |
|-----------|----------|
| Módulos principales | 10 + 1 admin |
| Funciones JS totales | ~350+ |
| Líneas de código (main.js) | ~11,082 |
| Líneas de CSS (styles.css) | ~3,643 |
| OnboardingGemelo.js | 398 |
| Cloud Functions | 10 |
| Colecciones Firestore | 8 (+ analytics/{uid}/eventos) |
| Campos en estado global S | ~65+ |
| Modos de la app | Free / Trial / Pro / Consulta / Admin |
| Modos del núcleo | Idle / Activo / Flujo / Completo / Blackout / Recuperación |

---

## 📁 ARCHIVOS DEL PROYECTO

| Archivo | Descripción |
|---------|-------------|
| `main.js` | ~11,082 líneas — TODO el JS de la app |
| `styles.css` | ~3,643 líneas — estilos completos |
| `index.html` | SPA shell, carga main.js y OnboardingGemelo.js |
| `OnboardingGemelo.js` | Componente onboarding obligatorio del Gemelo (nuevo 2026-04-09) |
| `functions/index.js` | 10 Cloud Functions de Firebase |
| `firestore.rules` | Reglas de seguridad Firestore (incluye friendRequests y analytics) |
| `scripts/seedDemoUser.js` | Script seed de usuario demo Alejandro Torres (90 días de datos) |
| `qa-reports/QA-MASTER-PLAN.md` | Plan maestro de QA |
| `qa-reports/VPS-SETUP-GUIDE.md` | Guía de setup VPS para OpenClaw/Hostinger |

---

*Actualizado el 2026-04-13 — refleja commits hasta eec1d7b*
