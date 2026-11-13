# API

Documentación interactiva OpenAPI: **http://localhost:8000/api/docs** (JSON en `/api/openapi.json`).
Autenticación: `Authorization: Bearer <token>` obtenido en `POST /api/auth/login`.
🔒 = solo administrador (validado en el backend).

## Autenticación y usuarios
- `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/change-password`, `POST /api/auth/accept-invitation`
- 🔒 `GET|POST /api/admin/users`, `PATCH /api/admin/users/{id}`, `POST /api/admin/invitations`

## Juegos, reglas e histórico
- `GET /api/games`, `GET /api/games/{code}/summary` (dashboard)
- `GET /api/games/{code}/rules`, 🔒 `POST /api/games/{code}/rules` (nueva versión; 422 si el histórico la viola)
- `GET /api/games/{code}/draws` (filtros: start, end, weekday, number, version, paginación)
- `GET /api/games/{code}/draws/{id}/history` (cadena de correcciones), `GET /api/games/{code}/versions`
- 🔒 `POST /draws`, `PUT /draws/{id}` (corrección con motivo), `DELETE /draws/{id}` (retiro con motivo)

## Importación 🔒
`POST /api/imports` (multipart) → `GET /{id}/preview` → `POST /{id}/validate` (mapeo) → `POST /{id}/commit`;
`GET /api/imports`, `GET /{id}`, `POST /{id}/cancel`.

## Estadísticas (`/api/games/{code}/stats/...`)
Ventana común: `mode=all|date_range|last_n_draws|last_n_months|last_n_years|years`, `n`, `start`, `end`,
`years`, `months`, `weekdays` (0=lunes).
`frequencies`, `frequencies/positions`, `recurrence`, `trends/rolling`, `trends/recent-vs-previous`,
`trends/compare` (ventana B con prefijo `b_`), `trends/yearly`, `distribution`, `distribution/sums`,
`cooccurrence/pairs|groups|repeats|transitions|positions`, `temporal/grouped`, `temporal/calendar`.

## Predicciones
- `GET /api/games/{code}/predictions/official[?target_date=]` — la misma para todos los usuarios
- `GET /api/games/{code}/predictions?kind=official|experimental`, `GET /api/predictions/{id}`
- `GET /api/predictions/{id}/explain?variable=p2&number=24`
- 🔒 `POST /api/games/{code}/predictions/publish` (trabajo), 🔒 `POST /api/games/{code}/predictions/experiments`

## ¿Cómo le ha ido?
- `GET /api/games/{code}/track-record` — aciertos reales de las predicciones oficiales publicadas y la simulación
  histórica más reciente, en lenguaje simple.

## Evaluación
- 🔒 `POST /api/games/{code}/backtests` (trabajo), `GET /api/games/{code}/backtests`, `GET /api/backtests/{id}`,
  `GET /api/backtests/{id}/targets?model=ensemble`, `GET /api/games/{code}/evaluations/live`

## Administración 🔒
`GET /api/admin/models`, `GET|POST /api/admin/games/{code}/configurations`,
`POST .../configurations/{id}/activate`, `GET /api/admin/audit`, `GET /api/admin/jobs[/{id}]`,
`POST /api/admin/games/{code}/rebuild`, `GET /api/admin/system`, `GET /api/health`.
