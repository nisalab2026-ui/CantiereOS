#!/bin/sh
# Inizializza un PostgreSQL "nudo" con i ruoli e gli schemi che Supabase
# fornisce di serie, così che Supabase Auth (GoTrue) e le migrazioni di
# CantiereOS girino in locale come sulla piattaforma.
# SOLO SVILUPPO/TEST. La password arriva dall'ambiente (generata da
# scripts/local-auth-env.mjs), mai scritta nel repository.
set -eu
: "${AUTH_ADMIN_DB_PASSWORD:?AUTH_ADMIN_DB_PASSWORD mancante}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v auth_pw="$AUTH_ADMIN_DB_PASSWORD" <<'SQL'
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role supabase_auth_admin login noinherit createrole password :'auth_pw';

create schema auth authorization supabase_auth_admin;
create schema extensions;
grant usage on schema auth, extensions, public to anon, authenticated, service_role;
grant create on database postgres to supabase_auth_admin;
alter role supabase_auth_admin set search_path = auth;
SQL
