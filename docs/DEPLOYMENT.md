# Despliegue

## Local sin Docker (configuración actual de desarrollo)

Requisitos: PostgreSQL 16, Python 3.12, Node 20+ (en macOS: `brew install python@3.12 postgresql@16`).
Ver README.md para los pasos completos.

## Local con Docker Compose

```bash
cp .env.example .env   # ajuste JWT_SECRET
docker compose up --build
docker compose exec backend python -m app.cli create-admin --email ... --name ...
```
API en :8000, frontend en :5173, PostgreSQL en :5432. (Los Dockerfiles están incluidos; en la máquina de
desarrollo actual no hay Docker instalado, por lo que la ruta Docker no se ha ejecutado aún.)

## Producción con Supabase

1. Cree el proyecto Supabase. Use la cadena de conexión de PostgreSQL en `DATABASE_URL`
   (`postgresql+psycopg://...`), con un rol de servicio para la API.
2. `alembic upgrade head` contra esa base y luego `psql -f supabase/rls.sql` (RLS activado y denegación
   total a `anon`/`authenticated`: el navegador nunca accede directo a las tablas).
3. `AUTH_PROVIDER=supabase`, `SUPABASE_JWT_SECRET`, `SUPABASE_JWT_AUDIENCE=authenticated`. Cree los perfiles
   con `external_subject` = id de usuario de Supabase.
4. `ENVIRONMENT=production` (la API se niega a arrancar con el JWT_SECRET por defecto), `CORS_ORIGINS` con el
   dominio real, HTTPS delante de la API.
5. Frontend: `npm run build` con `VITE_API_URL` apuntando a la API; servir `dist/` estático.

## Variables de entorno
Ver `.env.example`. Nunca exponga `JWT_SECRET`, `SUPABASE_JWT_SECRET` ni `DATABASE_URL` en el frontend:
el frontend solo conoce `VITE_API_URL`.
