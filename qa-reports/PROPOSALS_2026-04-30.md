# PROPUESTAS PENDIENTES — 2026-04-30
> Generadas por OpenClaw AI. Revisar y aprobar antes de implementar.

## Run: 2026-04-30_12-58.md

- [ ] [BUG] FAB NLP: Fallo en la categorización y extracción de texto para ingresos y gastos. | EVIDENCIA: Reporte "17-FAB — NLP preview" muestra "cobré l proyecto freelance" y "recibi sueldo" (texto cortado) y "me pagaron 1500 del cliente" como Tarea. También "gasto gasolina" y "gasto sin monto" como Tareas. | CAUSA PROBABLE: El servicio de NLP (`nlpService.js` o módulo similar) tiene reglas de extracción o categorización incompletas/erróneas para transacciones financieras, especialmente para ingresos y gastos sin monto explícito. | SOL

---

