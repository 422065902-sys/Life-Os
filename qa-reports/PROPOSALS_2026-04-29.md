# PROPUESTAS PENDIENTES — 2026-04-29
> Generadas por OpenClaw AI. Revisar y aprobar antes de implementar.

## Run: 2026-04-29_22-15.md

- [ ] [BUG] ROUTER: Onboarding, Blackout y Paywall no se muestran, renderizando la pantalla de Calibración en su lugar | EVIDENCIA: `02-onboarding_fold.jpg`, `03-blackout_fold.jpg`, `04-paywall_fold.jpg` son idénticas y muestran la Calibración Diaria. | CAUSA PROBABLE: Un error en el router principal o en la lógica de estado del usuario. Probablemente, el sistema no está validando correctamente el estado del usuario (nuevo, suscripción vencida) y redirige por defecto a la primera pantalla del usuario logueado. | SOLUCIÓN: Revisar la lógica en el router principal (ej. `app.js` o `router.js`) que maneja las rutas `/onboarding`, `/blackout` y `/paywall`. Asegurar que la guarda de ruta (`route guard`) verifique el estado del usuario *antes* de decidir qué componente renderizar. | PLATAFORMA: TODAS | PERFORMANCE: BAJO | REDUCED MOTION:

---

## Run: 2026-04-29_22-45.md

- [ ] [BUG] FAB / NLP: El Procesamiento de Lenguaje Natural (NLP) del FAB clasifica incorrectamente entradas financieras como tareas. | EVIDENCIA: Reportes `2026-04-29_22-45.md`, `..._22-15.md`, `..._20-53.md`. Input: "gasoline 500 para el carro" → preview: "✅ Tarea...". Input: "me pagaron 1500 del cliente" → preview: "✅ Tarea...". | CAUSA PROBABLE: El modelo de intención o las reglas de clasificación en la función `processNLPInput()` no priorizan correctamente los keywords financieros ("gasolina", "pagué", "pagaron") o la presencia de montos numéricos. | SOLUCIÓN: Ajustar la lógica de `processNLPInput()` para que keywords de gasto/ingreso tengan mayor peso que la estructura genérica de una frase. Si detecta un número junto a un keyword financiero, debe clasificarlo como `Finanzas` por defecto. | PLATAFORMA: TODAS | PERFORMANCE: BAJO | REDUCED MOTION: N/A | PRIORIDAD: ALTA | CATEGORÍA: MICRO | CONFIANZA: ALTA
- [ ] [BUG] MENTE / BIBLIOTECA: El tab "Biblioteca" en el módulo Mente & Poder no muestra su contenido; en su lugar, renderiza el contenido del tab "Gemelo". | EVIDENCIA: `15-mente-biblioteca_fold.jpg` es idéntica a `09-gemelo

---

