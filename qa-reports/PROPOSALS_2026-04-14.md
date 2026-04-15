# PROPUESTAS PENDIENTES — 2026-04-14
> Generadas por OpenClaw AI. Revisar y aprobar antes de implementar.

## Run: 2026-04-14_20-04.md

- [ ] [BUG] AUTENTICACIÓN: Las pruebas automatizadas fallan al iniciar sesión, lo que impide el acceso y la verificación de otros módulos de la aplicación. Todas las capturas de pantalla de escritorio muestran la pantalla de login con un error de credenciales de Firebase. | SOLUCIÓN: Investigar y corregir las credenciales de usuario configuradas para Playwright en el entorno de staging (ej. `qa-test1@mylifeos-staging.com`), asegurando que sean válidas y activas. Revisar el script de login de Playwright para detectar posibles fallos en el flujo. | PRIORIDAD: ALTA
- [ ] [BUG] INFRAESTRUCTURA QA: La secci��n "RESULTADOS DETALLADOS" de los reportes de Playwright está truncada en todos los informes recientes, impidiendo una visibilidad completa de los escenarios de prueba y sus estados. | SOLUCIÓN: Revisar la configuración del bot `OpenClaw v2.0` o el proceso de generación/almacenamiento de los reportes para asegurar que toda la información detallada sea capturada y mostrada correctamente. | PRIORIDAD: ALTA
- [ ] [UX] AUTENTICACIÓN: El mensaje de error de Firebase (`Firebase: The supplied auth credential is incorrect, malformed or has expired. (auth/invalid-credential)`) es técnico y poco amigable para el usuario final. | SOLUCIÓN: Implementar una lógica en el frontend para interceptar los códigos de error de Firebase y mostrar mensajes más claros y orientados al usuario, como "Correo electrónico o contraseña incorrectos. Por favor, inténtalo de nuevo." | PRIORIDAD: ALTA
- [ ] [DISEÑO] AUTENTICACIÓN: La cantidad de texto informativo en la parte inferior de la pantalla de login ("Sin tarjeta - Acceso completo - 30 días" y "Tus datos se sincronizan...") es excesiva y puede distraer al usuario del objetivo principal. | SOLUCIÓN: Simplificar o reubicar esta información en un área menos prominente, como un enlace a "Más información" o una sección de FAQ, para mantener la pantalla de login limpia y enfocada. | PRIORIDAD: MEDIA
- [ ] [DISEÑO] AUTENTICACIÓN (Mobile): El texto "Personal Command Center - Montecristo SaaS" es pequeño y difícil de leer en la vista mobile (375px). | SOLUCIÓN: Ajustar el tamaño de fuente o el `line-height` para mejorar la legibilidad de este texto en dispositivos móviles, o considerar si es información esencial para mostrar en la pantalla de login móvil. | PRIORIDAD: BAJA

---

