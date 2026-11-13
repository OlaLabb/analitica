# Base de datos (PostgreSQL 16)

Modelos: `backend/app/models/__init__.py`. Migraciones: `backend/alembic/versions/`
(0001 esquema, 0002 triggers de inmutabilidad).

## Entidades

| Tabla | Propósito | Claves / restricciones relevantes |
|---|---|---|
| `profiles` | usuarios y rol (`admin`/`user`) | email único (case-insensitive), `external_subject` para Supabase |
| `invitations` | invitaciones (token hasheado SHA-256) | expiración, aceptación única |
| `games` | juegos (BALOTO, REVANCHA, …) | `code` único |
| `game_rules` | reglas versionadas por juego; `NULL` = no confirmado | una activa por juego (índice parcial) |
| `historical_imports` | archivo original, mapeo, informe y errores por fila | estado `uploaded→validated→committed` |
| `historical_versions` | versión N del histórico de un juego: tipo de cambio, conteo, fechas, `content_hash` | (game, version_number) único; **solo inserción** |
| `draws` | sorteos; filas inmutables con `valid_from_version`/`valid_to_version` | un sorteo vigente por (game, fecha) y por (game, draw_number); **trigger** impide editar/borrar |
| `model_versions` | versión del algoritmo | `algorithm_version` único |
| `model_configurations` | parámetros de modelos versionados por juego + hash | una activa por juego |
| `prediction_runs` | ejecución (oficial/experimental), estado, entradas | |
| `predictions` | predicción con alcance de datos, métricas de soporte, combinaciones, `input_hash`, `prediction_hash` | una oficial publicada por (game, fecha); idempotencia por (game, fecha, input_hash); **trigger**: publicada solo puede pasar a `superseded` |
| `prediction_candidates` | ranking por variable con métricas, factores, explicación e incertidumbre | **trigger**: inmutables tras publicar |
| `prediction_evaluations` | evaluación en vivo (vs resultado real) y por sorteo de cada backtest | una evaluación en vivo por predicción |
| `backtest_runs` | backtests con parámetros, semilla y resumen | |
| `statistical_snapshots` | estadísticos suficientes por versión (incremental/full) | (versión, tipo) único |
| `processing_jobs` | trabajos en segundo plano y su estado | |
| `audit_logs` | auditoría (antes/después, actor, IP) | **solo inserción** |

## Versionado del histórico

La versión N de un juego = filas de `draws` con `valid_from_version ≤ N` y
(`valid_to_version` NULL o > N). Una corrección cierra la fila anterior (`valid_to_version = N`) y crea
una nueva con `supersedes_id`; un retiro solo la cierra. Así cualquier versión es reconstruible exactamente
y cada predicción registra la versión con la que se calculó.

## Concurrencia

- `pg_advisory_xact_lock('history_write:<game>')` serializa escrituras del histórico.
- `pg_advisory_xact_lock('official_prediction:<game>')` serializa publicaciones; además los índices
  únicos parciales impiden dos publicadas para la misma fecha. Probado con 4 hilos simultáneos.
