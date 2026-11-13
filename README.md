# Analítica de Sorteos

Plataforma para importar el histórico de sorteos (actualmente **BALOTO** y **REVANCHA**), analizarlo
estadísticamente, generar predicciones oficiales centralizadas por posición y **medir con backtesting si
superan al azar**. Funciona 100 % en local, sin servicios pagos ni API de IA.

> Resultado actual con el histórico real (653 sorteos por juego, 2021-05-01 → 2026-11-11): ningún modelo
> supera al azar de forma estadísticamente significativa. La plataforma lo muestra explícitamente.

El sistema tiene tres piezas, y las tres deben estar encendidas para usarlo:

| Pieza | Tecnología | Dirección |
|---|---|---|
| Base de datos | PostgreSQL 16 | `localhost:5432` |
| Backend (API) | FastAPI (Python 3.12) | http://localhost:8000 · documentación en http://localhost:8000/api/docs |
| Frontend | React + Vite (Node 22) | http://localhost:5173 |

---

## 1. Encender el sistema (ya instalado)

Úsalo si el sistema ya fue instalado y los datos ya están cargados en esta máquina. Necesitas **dos
terminales** abiertas en la carpeta del proyecto.

**Terminal 1 — base de datos y backend**

```bash
brew services start postgresql@16
cd backend
.venv/bin/uvicorn app.main:app --reload --port 8000
```

Está listo cuando aparece `Application startup complete`.

**Terminal 2 — frontend**

```bash
cd frontend
source ~/.nvm/nvm.sh && nvm use 22
npm run dev
```

Está listo cuando aparece `Local: http://localhost:5173/`.

**Abrir:** http://localhost:5173 e iniciar sesión con el usuario administrador (ver
[Usuario administrador](#usuario-administrador)).

### Apagar el sistema

1. En cada terminal, presiona `Ctrl + C` (detiene el backend y el frontend).
2. Detén la base de datos:

```bash
brew services stop postgresql@16
```

Los datos no se pierden al apagar: quedan guardados en PostgreSQL.

---

## 2. Instalación desde cero (solo la primera vez)

Úsalo en una máquina nueva o si quieres reconstruir todo.

### 2.1 Requisitos (macOS)

```bash
brew install python@3.12 postgresql@16
brew services start postgresql@16
```

Node 22 con nvm (si no tienes nvm: https://github.com/nvm-sh/nvm):

```bash
nvm install 22
```

### 2.2 Base de datos

Crea el usuario `sorteo` y las bases de la aplicación y de pruebas:

```bash
/opt/homebrew/opt/postgresql@16/bin/psql postgres -c "CREATE ROLE sorteo LOGIN PASSWORD 'sorteo' CREATEDB;"
/opt/homebrew/opt/postgresql@16/bin/createdb -O sorteo sorteo
/opt/homebrew/opt/postgresql@16/bin/createdb -O sorteo sorteo_test
```

### 2.3 Variables de entorno

Desde la raíz del proyecto:

```bash
cp .env.example .env
cp frontend/.env.example frontend/.env
```

Edita `.env` y reemplaza `JWT_SECRET` por un valor propio. Puedes generarlo con:

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

### 2.4 Backend

```bash
cd backend
/opt/homebrew/opt/python@3.12/bin/python3.12 -m venv .venv
.venv/bin/pip install -e ".[dev]"
.venv/bin/alembic upgrade head        # crea las tablas y los triggers
.venv/bin/python -m app.cli create-admin --email admin@example.com --name "Administrador"
```

El último comando pide la contraseña del administrador (mínimo 10 caracteres).

### 2.5 Juegos, reglas e histórico

Siguiendo en la carpeta `backend`:

```bash
.venv/bin/python -m app.cli create-game --code BALOTO   --name "Baloto"
.venv/bin/python -m app.cli create-game --code REVANCHA --name "Revancha"

for G in BALOTO REVANCHA; do
  .venv/bin/python -m app.cli set-rules --game $G --name "Reglas" \
    --main 1 43 --super 1 16 --unique yes --order sorted_asc --weekdays 0,2,5
done

.venv/bin/python -m app.cli import-file --file ../data/import/baloto_revancha_2021_2026.csv \
  --email admin@example.com --game-column game_type

.venv/bin/python -m app.cli publish  --game BALOTO
.venv/bin/python -m app.cli publish  --game REVANCHA
.venv/bin/python -m app.cli backtest --game BALOTO
.venv/bin/python -m app.cli backtest --game REVANCHA
```

En `--weekdays` los días se numeran así: 0 = lunes, 2 = miércoles, 5 = sábado.

El histórico también puede importarse desde la interfaz en **Administración → Importación**: CSV o Excel,
con mapeo de columnas, vista previa, validación por fila y confirmación.

### 2.6 Frontend

```bash
cd frontend
source ~/.nvm/nvm.sh && nvm use 22
npm install
```

Con esto queda instalado. Para encenderlo, sigue la sección [1. Encender el sistema](#1-encender-el-sistema-ya-instalado).

---

## Usuario administrador

- Usuario: `admin@example.com`, o el correo que usaste en `create-admin`.
- Contraseña: la que definiste en `create-admin`. Esta guía no la incluye porque es un dato privado.

¿Olvidaste la contraseña? Vuelve a ejecutar el comando con el mismo correo; te pedirá una nueva:

```bash
cd backend
.venv/bin/python -m app.cli create-admin --email admin@example.com --name "Administrador"
```

Otros usuarios se crean desde **Administración → Usuarios**, directamente o mediante invitación.

---

## Uso diario

Cuando se registra un sorteo nuevo (por importación o con "Agregar sorteo" en **Histórico**), el sistema
hace tres cosas automáticamente:

1. Crea una nueva versión del histórico.
2. Evalúa la predicción anterior contra el resultado real.
3. Publica la predicción oficial del siguiente sorteo.

Este comportamiento lo controla `AUTO_PUBLISH_ON_NEW_DATA=true` en `.env`.

---

## Pruebas

Requieren que PostgreSQL esté encendido.

```bash
cd backend && .venv/bin/pytest                          # 28 pruebas del backend
cd frontend && npm test -- --run && npm run build       # 20 pruebas + compilación del frontend
```

También puedes correr todo con `make test` desde la raíz.

---

## Problemas comunes

| Síntoma | Solución |
|---|---|
| `connection refused` en el puerto 5432 | La base de datos está apagada: `brew services start postgresql@16` |
| `address already in use` en el 8000 o el 5173 | Ya hay otra instancia corriendo. Libera el puerto con `kill $(lsof -ti tcp:8000)` (o `5173`) |
| El frontend carga, pero las pantallas dan error | El backend está apagado o `frontend/.env` no tiene `VITE_API_URL=http://localhost:8000` |
| Homebrew dice `unknown or unsupported macOS version` | Ejecuta `brew update` y repite la instalación |
| `nvm: command not found` | Antes de los comandos de npm, ejecuta `source ~/.nvm/nvm.sh` |

---

## Documentación

[Arquitectura](docs/ARCHITECTURE.md) · [Base de datos](docs/DATABASE.md) ·
[Motor estadístico](docs/STATISTICAL_ENGINE.md) · [API](docs/API.md) · [Despliegue](docs/DEPLOYMENT.md) ·
[Bitácora](docs/DEVELOPMENT_LOG.md) · [Frontend](frontend/README.md)
