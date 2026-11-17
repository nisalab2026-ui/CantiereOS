-- =============================================================================
-- Codici di recupero MFA (docs/SECURITY.md §2).
-- Supabase Auth non li prevede: se l'utente perde il telefono, un codice di
-- recupero (usa e getta) dimostra il possesso e permette al server di rimuovere
-- il fattore TOTP con l'API amministrativa, così l'utente lo configura di nuovo.
-- I codici sono salvati solo come hash SHA-256 legati all'utente, nello schema
-- privato `app`; il client vede solo quanti ne restano.
-- =============================================================================

create table app.mfa_recovery_codes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  code_hash   bytea not null check (octet_length(code_hash) = 32),
  created_at  timestamptz not null default now(),
  used_at     timestamptz,
  revoked_at  timestamptz,
  unique (user_id, code_hash)
);
create index mfa_recovery_codes_user_idx on app.mfa_recovery_codes (user_id)
  where used_at is null and revoked_at is null;
alter table app.mfa_recovery_codes enable row level security;
revoke all on app.mfa_recovery_codes from public;

comment on table app.mfa_recovery_codes is 'Codici di recupero MFA: solo hash, usa e getta. Nessun accesso diretto dai client.';

-- Nuova serie (sostituisce la precedente). Solo con sessione verificata MFA (aal2).
create or replace function app.mfa_recovery_generate(p_hashes bytea[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null or app.current_aal() is distinct from 'aal2' then
    raise exception 'mfa required' using errcode = '42501';
  end if;
  if coalesce(array_length(p_hashes, 1), 0) not between 5 and 20 then
    raise exception 'invalid recovery codes' using errcode = '22023';
  end if;
  update app.mfa_recovery_codes set revoked_at = now()
   where user_id = v_user and used_at is null and revoked_at is null;
  insert into app.mfa_recovery_codes (user_id, code_hash)
  select v_user, h from unnest(p_hashes) as h;
  return array_length(p_hashes, 1);
end;
$$;

-- Usa un codice (sessione aal1: l'utente ha già dato la password). true se valido e non usato.
create or replace function app.mfa_recovery_consume(p_hash bytea)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  update app.mfa_recovery_codes
     set used_at = now()
   where user_id = auth.uid() and code_hash = p_hash
     and used_at is null and revoked_at is null
  returning id into v_id;
  return v_id is not null;
end;
$$;

create or replace function app.mfa_recovery_status()
returns table (remaining integer, generated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer, max(created_at)
    from app.mfa_recovery_codes
   where user_id = auth.uid() and used_at is null and revoked_at is null;
$$;

grant execute on function app.mfa_recovery_generate(bytea[]) to authenticated;
grant execute on function app.mfa_recovery_consume(bytea) to authenticated;
grant execute on function app.mfa_recovery_status() to authenticated;

revoke execute on all functions in schema app from public;
