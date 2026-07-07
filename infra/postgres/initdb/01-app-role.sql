-- Dev-only bootstrap: the app role RLS actually binds to. POSTGRES_USER (seta) stays
-- the admin/maintenance principal used by migrations and the worker pool.
CREATE ROLE seta_app LOGIN PASSWORD 'seta_app' NOSUPERUSER NOBYPASSRLS;
GRANT CONNECT ON DATABASE seta TO seta_app;
