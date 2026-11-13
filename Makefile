PG ?= /opt/homebrew/opt/postgresql@16/bin
PY = backend/.venv/bin/python

.PHONY: setup migrate api web test test-backend test-frontend import-baloto

setup:            ## Crea venv del backend e instala dependencias del frontend
	cd backend && python3.12 -m venv .venv && .venv/bin/pip install -e ".[dev]"
	cd frontend && npm install

migrate:          ## Aplica migraciones a la base local
	cd backend && .venv/bin/alembic upgrade head

api:              ## Levanta la API en http://localhost:8000 (docs en /api/docs)
	cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000

web:              ## Levanta el frontend en http://localhost:5173
	cd frontend && npm run dev

test: test-backend test-frontend

test-backend:
	cd backend && .venv/bin/pytest

test-frontend:
	cd frontend && npm test -- --run && npm run build
