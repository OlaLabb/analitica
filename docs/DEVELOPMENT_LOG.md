# Bitácora de desarrollo

## 2026-11-13

### Fase 1 — Inspección y arquitectura ✅
- Directorio vacío; macOS 27 (pre-release), Python 3.9 del sistema, Node 16–22 (nvm), sin Docker funcional
  ni PostgreSQL. Decisión del usuario: instalar con Homebrew (python@3.12, postgresql@16).
- Homebrew necesitó `brew update` (no reconocía macOS 27) y un reintento por error SSL con ghcr.io.
- Arquitectura en `docs/ARCHITECTURE.md`.

### Datos reales
- El usuario entregó `baloto_results.sql` (baloto.com, sorteos 2081–2734, 2021-05-01 → 2026-11-11,
  653 por juego; falta el 2685). Dos juegos independientes: BALOTO y REVANCHA ⇒ se añadió la entidad `games`.
- Verificado: principales 1–43, 653/653 filas en orden ascendente estricto, superbalota 1–16, lunes desde
  2025-06-02. Reglas registradas con nota "pendiente de confirmación del administrador".
- Importados por el importador estándar (CSV exportado de la tabla): 1306 filas, 0 rechazos; reimportación
  idempotente (1306 detectadas como existentes).

### Fases 2–8 — Backend, importación, motor, temporal, predicción, backtesting, publicación ✅
- 28 pruebas automatizadas pasan (`cd backend && .venv/bin/pytest`).
- Error propio corregido: se probó ordenar combinaciones por "lift frente al azar"; generaba combinaciones
  absurdas (p. ej. 31 en la posición 1) y rindió peor que el azar en el walk-forward. Se volvió al criterio
  de máxima probabilidad del modelo; el lift queda solo como dato informativo.

### Fase 9 — Frontend ✅
- React 18 + TS + Vite + Tailwind + componentes estilo shadcn + Router + TanStack Query + RHF + Zod + ECharts.
- Páginas: Login, Invitación, Dashboard, Histórico, Estadísticas (5 pestañas), Calendario, Predicciones
  (con explicación por candidato), Evaluación, Administración (Importación, Reglas, Usuarios, Modelos,
  Auditoría, Trabajos, Sistema). `npm run lint`, `npm run build` y 20 pruebas Vitest pasan.
- Verificado en navegador headless contra la API real, ambos juegos, sin errores.
- Corregidos en backend 4 detalles reportados por la verificación del frontend (respuesta de validación sin
  mapeo, versión de configuración nula en el backtest, fecha sin zona horaria, decimales en inglés).
- Datos de prueba creados durante la verificación: 1 usuario `prueba.frontend.*@example.com` (rol user),
  2 importaciones canceladas.
- No implementado en UI: experimentos personales (el endpoint existe).

### Cambio de enfoque: predicción como se juega Baloto (algoritmo 2.0.0)
- El usuario confirmó que Baloto paga por cuántos números se aciertan en cualquier orden + SB. La predicción
  por posición era un artefacto del ordenamiento. Nuevo formato `numbers_v1` (5 números + SB).
- Categorías de premio tomadas de la tabla oficial (baloto.com, sorteo 2734) y registradas en las reglas v2
  de ambos juegos; probabilidades exactas por combinatoria.
- A pedido del usuario, el modelo oficial es `azar` (combinación aleatoria reproducible con las probabilidades
  reales). Simulación sobre 553 sorteos: ningún método de frecuencia supera al azar en ninguno de los juegos.
- Las predicciones por posición del 2026-11-14 quedaron como `superseded` (conservadas, inmutables).
- Migraciones 0003 (columna `games.results_url_template`, de la función de búsqueda web que el usuario pidió
  NO implementar; la columna existe pero no se usa) y 0004 (categorías de premio y candidatos 'main').
- 33 pruebas del backend pasan.
- Rediseño del frontend (tema claro, navegación simplificada) en curso.

### Pendientes conocidos
- Ruta Docker Compose escrita pero no ejecutada (no hay Docker en la máquina).
- Modo Supabase implementado (validación de JWT + RLS) pero no probado contra un proyecto Supabase real.
- Los trabajos en segundo plano corren en el proceso de la API (sin cola externa); si la API se reinicia
  durante un trabajo, este queda en estado `running` y debe relanzarse.
