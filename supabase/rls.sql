-- Políticas para producción con Supabase.
-- Arquitectura: el navegador NUNCA consulta las tablas directamente; todo pasa por la API FastAPI,
-- que se conecta con un rol de servicio. Por eso se activa RLS en todas las tablas y no se crea
-- ninguna política para 'anon' ni 'authenticated' (denegación total por defecto).
-- Ejecutar después de `alembic upgrade head` en la base de Supabase.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles','invitations','games','game_rules','historical_imports','historical_versions','draws',
    'model_versions','model_configurations','prediction_runs','predictions','prediction_candidates',
    'prediction_evaluations','backtest_runs','statistical_snapshots','processing_jobs','audit_logs'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;

-- La API usa una conexión con un rol propietario/servicio (BYPASSRLS), p. ej.:
--   CREATE ROLE sorteo_api LOGIN PASSWORD '...' BYPASSRLS;
--   GRANT USAGE ON SCHEMA public TO sorteo_api;
--   GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO sorteo_api;
--   GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO sorteo_api;
-- Los usuarios se autentican con Supabase Auth; la API valida su JWT (AUTH_PROVIDER=supabase)
-- y busca el perfil por profiles.external_subject = auth.uid().
