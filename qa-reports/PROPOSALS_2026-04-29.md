# PROPUESTAS PENDIENTES — 2026-04-29
> Generadas por OpenClaw AI. Revisar y aprobar antes de implementar.

## Run: 2026-04-29_22-15.md

- [ ] [BUG] ROUTER: Onboarding, Blackout y Paywall no se muestran, renderizando la pantalla de Calibración en su lugar | EVIDENCIA: `02-onboarding_fold.jpg`, `03-blackout_fold.jpg`, `04-paywall_fold.jpg` son idénticas y muestran la Calibración Diaria. | CAUSA PROBABLE: Un error en el router principal o en la lógica de estado del usuario. Probablemente, el sistema no está validando correctamente el estado del usuario (nuevo, suscripción vencida) y redirige por defecto a la primera pantalla del usuario logueado. | SOLUCIÓN: Revisar la lógica en el router principal (ej. `app.js` o `router.js`) que maneja las rutas `/onboarding`, `/blackout` y `/paywall`. Asegurar que la guarda de ruta (`route guard`) verifique el estado del usuario *antes* de decidir qué componente renderizar. | PLATAFORMA: TODAS | PERFORMANCE: BAJO | REDUCED MOTION:

---

