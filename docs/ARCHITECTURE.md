# Arquitectura

## 1. Visión general

```
┌─────────────────────────┐      HTTPS/JSON (JWT)      ┌──────────────────────────────┐
│  Frontend (React + TS)  │ ─────────────────────────▶ │  Backend FastAPI             │
│  Vite · Tailwind ·      │                            │  ├─ api/routes   (HTTP)       │
│  shadcn/ui · ECharts ·  │ ◀───────────────────────── │  ├─ services     (negocio,    │
│  TanStack Query         │                            │  │   transacciones, versiones)│
└─────────────────────────┘                            │  ├─ engine       (estadística │
                                                       │  │   pura: pandas/numpy/scipy)│
                                                       │  └─ assistant    (IA futura,  │
                                                       │      desactivada)             │
                                                       └──────────────┬───────────────┘
                                                                      │ SQLAlchemy 2 / psycopg 3
                                                       ┌──────────────▼───────────────┐
                                                       │ PostgreSQL 16 (local/Docker) │
                                                       │ o Supabase (producción)       │
                                                       └──────────────────────────────┘
```

Principios:

1. **El motor estadístico (`backend/app/engine`) es puro**: no conoce la base de datos, HTTP ni
   el usuario. Recibe arreglos de sorteos + reglas + configuración y devuelve resultados. Esto lo
   hace determinista, testeable y reutilizable (estadísticas, predicciones oficiales, backtesting,
   experimentos).
2. **Los servicios (`backend/app/services`) orquestan**: cargan la versión del histórico,
   llaman al motor, persisten resultados en transacciones y registran auditoría.
3. **El frontend nunca calcula estadísticas**: solo consume la API. Ningún secreto llega al
   navegador.
4. **Ninguna dependencia de IA**. El módulo `assistant` define una interfaz para el futuro y
   está desactivado (`ASSISTANT_PROVIDER=none`). Si se activa, solo podrá leer resultados ya
   calculados por el motor.

## 2. Decisiones técnicas

| Tema | Decisión | Motivo |
|---|---|---|
| Autenticación | JWT propio (bcrypt + PyJWT) con `AUTH_PROVIDER=local`; adaptador `supabase` que valida JWT de Supabase y los asocia a `profiles` | Funciona sin servicios externos; Supabase opcional en producción |
| Autorización | Roles `admin` / `user` validados en dependencias FastAPI | Los permisos nunca dependen del frontend |
| Acceso a datos con Supabase | El frontend NO consulta Supabase directamente: todo pasa por FastAPI. RLS activado con política de denegación por defecto (`supabase/rls.sql`) | Una única fuente de autorización |
| Reglas del juego | Tabla versionada `game_rules`; campos desconocidos = `NULL` (no confirmados) | No se inventan rangos ni reglas |
| Versionado del histórico | Filas de `draws` inmutables con `valid_from_version` / `valid_to_version` (versionado temporal tipo SCD-2) | Cualquier versión del histórico es reconstruible exactamente sin duplicar todo el histórico |
| Inmutabilidad | Triggers PostgreSQL que impiden modificar predicciones publicadas, candidatos, auditoría y filas de sorteos | La garantía no depende de que el código "se porte bien" |
| Concurrencia | `pg_advisory_xact_lock` para escritura del histórico y publicación; índices únicos parciales (una predicción oficial publicada por fecha objetivo; idempotencia por `input_hash`) | Evita publicaciones conflictivas; publicación idempotente |
| Determinismo | Sin aleatoriedad en predicciones oficiales; desempates por número ascendente; hash SHA-256 sobre JSON canónico de entradas y salidas | Mismas entradas ⇒ mismo resultado y mismo hash |
| Estadísticas exploratorias | Se calculan bajo demanda sobre la ventana elegida (el volumen típico es de miles de filas) | Cualquier filtro, sin precomputar combinaciones infinitas |
| Snapshots | `statistical_snapshots` guarda estadísticos suficientes (conteos, últimas apariciones, gaps) por versión; se actualiza de forma incremental cuando la nueva versión solo agrega sorteos posteriores, y se reconstruye completa en otro caso | Requisito de actualización incremental + prueba de equivalencia |
| Trabajos | Tabla `processing_jobs` + ejecución en segundo plano en el proceso de la API | Sin dependencia de Redis/colas en la v1; estado consultable |
| Frontend | Componentes estilo shadcn/ui escritos en el repositorio (Radix + Tailwind) | Es el modelo de shadcn (código propio), sin depender del CLI |

### Juegos (BALOTO / REVANCHA)

El histórico real contiene dos sorteos independientes que comparten número y fecha de sorteo. Se modelan
como filas de `games`; histórico, versiones, reglas, configuración, snapshots, predicciones y backtests
llevan `game_id`. El motor estadístico no cambia: siempre recibe los sorteos de UN juego. Agregar un tercer
juego es crear una fila en `games` y sus reglas, sin tocar código.

## 3. Estructura de carpetas

```
Analitica-sorteo/
├── README.md
├── docker-compose.yml          # postgres + backend + frontend
├── .env.example
├── Makefile                    # atajos de desarrollo
├── docs/                       # ARCHITECTURE, DATABASE, STATISTICAL_ENGINE, API, DEPLOYMENT, DEVELOPMENT_LOG
├── supabase/rls.sql            # políticas RLS para producción con Supabase
├── backend/
│   ├── pyproject.toml
│   ├── alembic.ini, alembic/   # migraciones (incluye triggers de inmutabilidad)
│   ├── app/
│   │   ├── main.py             # aplicación FastAPI
│   │   ├── config.py           # Settings (pydantic-settings)
│   │   ├── db.py               # engine/sesiones SQLAlchemy
│   │   ├── cli.py              # create-admin, rebuild, etc.
│   │   ├── core/               # seguridad, dependencias, errores, proveedores de auth
│   │   ├── models/             # modelos SQLAlchemy
│   │   ├── schemas/            # esquemas Pydantic (contrato de la API)
│   │   ├── services/           # importación, versionado, predicciones, backtesting, auditoría, jobs
│   │   ├── engine/             # MOTOR ESTADÍSTICO PURO
│   │   │   ├── data.py         # DrawSet, ventanas/filtros temporales
│   │   │   ├── rules.py        # reglas, dominios, distribuciones teóricas
│   │   │   ├── stats_utils.py  # IC de Wilson, chi², correcciones múltiples, Poisson-binomial
│   │   │   ├── frequencies.py, recurrence.py, trends.py, distribution.py,
│   │   │   ├── cooccurrence.py, temporal.py
│   │   │   ├── models/         # modelos predictivos por variable
│   │   │   ├── predictor.py    # ranking + explicaciones + incertidumbre
│   │   │   ├── combinations.py # combinaciones conjuntas válidas (k-best exacto)
│   │   │   ├── backtest.py     # walk-forward + comparación con azar
│   │   │   └── snapshots.py    # estadísticos suficientes incrementales
│   │   └── assistant/          # interfaz IA futura (desactivada)
│   └── tests/
└── frontend/
    └── src/{api,components,pages,lib,hooks}
```

## 4. Flujo de una predicción oficial

1. Se importa o agrega un sorteo válido → transacción con bloqueo `history_write` → nueva
   `historical_versions` → snapshot actualizado.
2. Si `AUTO_PUBLISH_ON_NEW_DATA=true`, se encola el trabajo `publish_official`.
3. El servicio toma el bloqueo `official_prediction`, calcula `input_hash =
   sha256(contenido del histórico, reglas, configuración, versión del algoritmo, fecha objetivo)`.
   Si ya existe una predicción oficial con ese `input_hash` → devuelve la existente (idempotente).
4. Calcula la predicción (motor puro), guarda `prediction_runs`, `predictions` (estado `draft`)
   y `prediction_candidates`, calcula `prediction_hash`.
5. En la misma transacción: la publicada anterior para esa fecha pasa a `superseded`, la nueva
   pasa a `published`. Si algo falla, rollback: la anterior sigue visible.
6. Cuando llega el resultado real de esa fecha, se crea la `prediction_evaluations` (`live`).

## 5. Riesgos técnicos identificados

| Riesgo | Mitigación |
|---|---|
| Reglas reales desconocidas (rangos, orden, repetición) | Reglas configurables y versionadas; el importador detecta y *sugiere* (no impone) rangos y si las filas están ordenadas; sin reglas confirmadas no se generan combinaciones ni comparaciones teóricas |
| Orden de posiciones: si el sorteo publica números ordenados, cada posición NO es uniforme | Distribución teórica de estadísticos de orden (hipergeométrica) por posición cuando `main_order = sorted_asc` |
| Falsos patrones por comparaciones múltiples | Corrección Benjamini-Hochberg/Holm en todas las pruebas por número/modelo |
| Data leakage en backtesting | Los modelos solo reciben `draws[:i]`; prueba que altera sorteos futuros y verifica que las predicciones pasadas no cambian |
| Muestras pequeñas (p. ej. "enero de 3 años") | Cada resultado incluye `n` y advertencias de tamaño de muestra; chi² avisa si hay frecuencias esperadas < 5 |
| Ediciones concurrentes | Bloqueos asesores + índices únicos + triggers |
| Formatos de archivo heterogéneos | Mapeo de columnas configurable, parsers de fecha múltiples, vista previa con errores por fila |
| Expectativas de "predicción" | Toda la UI separa puntaje del modelo / probabilidad teórica / frecuencia, y muestra el veredicto del backtesting frente al azar |

## 6. Plan por fases

Se sigue el plan de 12 fases del documento de requisitos; el estado real de cada fase se
registra en `docs/DEVELOPMENT_LOG.md`.
