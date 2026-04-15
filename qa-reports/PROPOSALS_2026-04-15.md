# PROPUESTAS PENDIENTES — 2026-04-15
> Generadas por OpenClaw AI. Revisar y aprobar antes de implementar.

## Run: 2026-04-15_07-32.md

- [ ] [BUG] AUTH: Login de QA fallido | SOLUCIÓN: Verificar credenciales `qa-test1@mylifeos-staging.com` en Firebase Auth. Implementar reintentos con `exponential backoff` en el script de QA y asegurar manejo robusto de errores en `auth.js`. | PRIORIDAD: ALTA | CATEGORÍA: MICRO
- [ ] [DISEÑO] AUTH: Mensaje de error de login intrusivo | SOLUCIÓN: Estilizar el mensaje de error "Correo o contraseña incorrectos" como un `chip` glassmorphism sutil (ej. `background: rgba(255, 0, 0, 0.1); backdrop-filter: blur(5px); border-radius: 8px; color: #ff6b35;`) en `index.html` o componente de login. | PRIORIDAD: ALTA | CATEGORÍA: MICRO
- [ ] [UX] AUTH: Feedback visual en campos de error | SOLUCIÓN: Al recibir error de autenticación, añadir clase `is-error` a los `<input>` de correo y contraseña. CSS: `input.is-error { border-color: rgba(255, 0, 0, 0.4); box-shadow: 0 0 0 2px rgba(255, 0, 0, 0.1); }`. | PRIORIDAD: MEDIA | CATEGORÍA: MICRO
- [ ] [DISEÑO] AUTH: Jerarquía visual de botones de acción | SOLUCIÓN: Reducir la saturación y contraste del botón "Empezar Prueba Gratuita". Convertirlo en un botón `outline` o con un gradiente más sutil (ej. `background: linear-gradient(45deg, rgba(168, 85, 247, 0.2), rgba(236, 72, 153, 0.2)); border: 1px solid rgba(168, 85, 247, 0.4);`). | PRIORIDAD: MEDIA | CATEGORÍA: MICRO
- [ ] [MOBILE] AUTH: Touch target de toggle "Mantener sesión iniciada" | SOLUCIÓN: Aumentar el área clicable del `label` asociado al input `checkbox` del toggle a un mínimo de 44x44px usando `padding` o `min-width`/`min-height` en el CSS del contenedor del toggle. | PRIORIDAD: BAJA | CATEGORÍA: MICRO
- [ ] [DISEÑO] AUTH: Profundidad del card de login | SOLUCIÓN: Añadir una `box-shadow` más pronunciada y un `border` sutil al contenedor del formulario de login. CSS: `.login-card { box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37); border: 1px solid rgba(255, 255, 255, 0.18); }`. | PRIORIDAD: BAJA | CATEGORÍA: MICRO
- [ ] [RETENCIÓN] AUTH: Claridad del texto "Tu Nexus Personal" | SOLUCIÓN: Eliminar o simplificar el texto `<p class="subtitle">Tu Nexus Personal - Montecristo SaaS</p>` en `index.html` o el componente de login, ya que es confuso para nuevos usuarios. | PRIORIDAD: MEDIA | CATEGORÍA: MICRO
- [ ] [ARQUITECTURA] AUTH: Refactorización del manejo de `#app` y login | SOLUCIÓN: Modificar `index.html` y `main.js` para que el elemento `<div id="app"></div>` y su contenido solo se monten/rendericen *después* de una autenticación exitosa, usando un `router guard` o `conditional rendering` basado en `firebase.auth().onAuthStateChanged`. | PRIORIDAD: ALTA | CATEGORÍA: ARQUITECTURA
- [ ] [ARQUITECTURA] QA: Implementación de un flujo de login robusto para el bot | SOLUCIÓN: Configurar el bot de QA para usar un mecanismo de "login silencioso" (ej. `signInWithCustomToken`) o un token de sesión pre-generado para evitar fallos de UI en el login y asegurar la ejecución de pruebas de módulos. | PRIORIDAD: ALTA | CATEGORÍA: ARQUITECTURA

---

