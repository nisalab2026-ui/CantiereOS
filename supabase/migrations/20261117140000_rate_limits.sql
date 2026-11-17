-- =============================================================================
-- Limite ai tentativi (accesso, MFA, recupero password, registrazione).
-- Contatori a finestra fissa nello schema privato `app`: nessun ruolo client li
-- vede; li usa solo il server (service_role) prima di chiamare Supabase Auth.
-- Le chiavi sono hash SHA-256 (es. di "email:..." o "ip:..."): nessun dato
-- personale in chiaro. Senza Redis, PostgreSQL basta per i volumi di una PMI.
-- =============================================================================

create table app.rate_limits (
  bucket       text not null check (bucket ~ '^[a-z_]{2,40}$'),
  key_hash     bytea not null check (octet_length(key_hash) = 32),
  window_start timestamptz not null,
  hits         integer not null check (hits >= 0),
  primary key (bucket, key_hash)
);
create index rate_limits_window_idx on app.rate_limits (window_start);
alter table app.rate_limits enable row level security;
revoke all on app.rate_limits from public;

comment on table app.rate_limits is 'Contatori dei tentativi per finestra temporale. Solo hash, nessun dato in chiaro.';

-- Registra un tentativo e dice se è consentito. retry_after = secondi alla fine della finestra.
create or replace function app.rate_limit_hit(
  p_bucket text,
  p_key_hash bytea,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, hits integer, retry_after integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window interval := make_interval(secs => p_window_seconds);
  v_row app.rate_limits;
begin
  if p_limit < 1 or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'invalid rate limit' using errcode = '22023';
  end if;

  insert into app.rate_limits as r (bucket, key_hash, window_start, hits)
  values (p_bucket, p_key_hash, clock_timestamp(), 1)
  on conflict (bucket, key_hash) do update
    set hits = case when r.window_start <= clock_timestamp() - v_window then 1 else r.hits + 1 end,
        window_start = case when r.window_start <= clock_timestamp() - v_window
                            then clock_timestamp() else r.window_start end
  returning r.* into v_row;

  -- Pulizia occasionale delle finestre scadute da più di un giorno.
  if random() < 0.01 then
    delete from app.rate_limits where window_start < clock_timestamp() - interval '1 day';
  end if;

  return query select
    v_row.hits <= p_limit,
    v_row.hits,
    greatest(0, ceil(extract(epoch from (v_row.window_start + v_window - clock_timestamp()))))::integer;
end;
$$;

-- Azzera un contatore (es. dopo un accesso riuscito, per non penalizzare chi ha sbagliato una volta).
create or replace function app.rate_limit_reset(p_bucket text, p_key_hash bytea)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from app.rate_limits where bucket = p_bucket and key_hash = p_key_hash;
$$;

grant execute on function app.rate_limit_hit(text, bytea, integer, integer) to service_role;
grant execute on function app.rate_limit_reset(text, bytea) to service_role;

revoke execute on all functions in schema app from public;
