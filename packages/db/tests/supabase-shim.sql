-- =============================================================================
-- SOLO PER TEST LOCALI — NON È UNA MIGRAZIONE, NON VA MAI APPLICATO A SUPABASE.
-- Emula il minimo indispensabile di Supabase (ruoli, schema auth, auth.uid())
-- per eseguire le migrazioni e i test RLS su un PostgreSQL "nudo".
-- L'implementazione di auth.uid() replica quella di Supabase: legge il claim
-- `sub` dal JWT che PostgREST/il server impostano in request.jwt.claims.
-- =============================================================================
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

create schema if not exists auth;
create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create table if not exists auth.users (
  id         uuid primary key default gen_random_uuid(),
  email      text unique,
  email_confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Sottoinsieme di auth.sessions di Supabase Auth (colonne usate da CantiereOS).
create table if not exists auth.sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  aal        text,
  not_after  timestamptz,
  created_at timestamptz not null default now()
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;
