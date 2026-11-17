-- =============================================================================
-- Catena di hash sul registro attività (ADR-010, docs/DATABASE.md).
-- Ogni riga di audit_log porta l'hash della precedente della stessa azienda:
-- una modifica o una cancellazione in mezzo diventa rilevabile.
-- Operazione additiva: due colonne nuove e un numero progressivo; il contenuto
-- delle righe esistenti non cambia.
-- =============================================================================

alter table public.audit_log
  add column chain_seq bigint,
  add column prev_hash bytea,
  add column row_hash  bytea;

comment on column public.audit_log.chain_seq is 'Posizione nella catena dell''azienda (1, 2, 3...). La assegna il trigger.';
comment on column public.audit_log.prev_hash is 'row_hash della riga precedente della stessa azienda (null per la prima).';
comment on column public.audit_log.row_hash  is 'sha256(prev_hash || contenuto canonico). Lo calcola il trigger, mai il chiamante.';

-- Contenuto canonico: jsonb (rappresentazione testuale deterministica), data in UTC
-- così il risultato non dipende dal fuso orario della sessione.
create or replace function app.audit_canonical(p public.audit_log)
returns bytea
language sql
immutable
set search_path = ''
as $$
  select convert_to(jsonb_build_object(
    'id', p.id,
    'tenant_id', p.tenant_id,
    'actor', p.actor_user_id,
    'action', p.action,
    'table', p.table_name,
    'record', p.record_id,
    'old', p.old_data,
    'new', p.new_data,
    'changed', to_jsonb(p.changed_fields),
    'request', p.request_id,
    'seq', p.chain_seq,
    'at', to_char(p.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')
  )::text, 'UTF8');
$$;

create or replace function app.audit_chain_key(p_tenant_id uuid)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_tenant_id, '00000000-0000-0000-0000-000000000000'::uuid);
$$;

-- Una sola posizione per azienda: se due transazioni provassero ad agganciare la
-- stessa riga precedente, la seconda fallirebbe invece di biforcare la catena.
create unique index audit_log_chain_idx
  on public.audit_log (app.audit_chain_key(tenant_id), chain_seq);

create or replace function app.audit_chain_hash()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev_seq  bigint;
  v_prev_hash bytea;
begin
  -- Le insert della stessa azienda si mettono in fila fino al commit.
  perform pg_advisory_xact_lock(
    hashtextextended('audit_chain:' || app.audit_chain_key(new.tenant_id)::text, 0));

  select a.chain_seq, a.row_hash
    into v_prev_seq, v_prev_hash
  from public.audit_log a
  where app.audit_chain_key(a.tenant_id) = app.audit_chain_key(new.tenant_id)
  order by app.audit_chain_key(a.tenant_id), a.chain_seq desc
  limit 1;

  new.chain_seq := coalesce(v_prev_seq, 0) + 1;
  new.prev_hash := v_prev_hash;
  new.row_hash  := sha256(coalesce(v_prev_hash, '\x'::bytea) || app.audit_canonical(new));
  return new;
end;
$$;

-- Righe già presenti: hash calcolati in ordine di id, per azienda.
alter table public.audit_log disable trigger audit_log_no_update;
do $$
declare
  r public.audit_log;
  v_key uuid := null;
  v_seq bigint;
  v_prev bytea;
begin
  for r in
    select * from public.audit_log
    order by app.audit_chain_key(tenant_id), id
  loop
    if v_key is distinct from app.audit_chain_key(r.tenant_id) then
      v_key := app.audit_chain_key(r.tenant_id);
      v_seq := 0;
      v_prev := null;
    end if;
    v_seq := v_seq + 1;
    r.chain_seq := v_seq;
    r.prev_hash := v_prev;
    r.row_hash := sha256(coalesce(v_prev, '\x'::bytea) || app.audit_canonical(r));
    update public.audit_log
       set chain_seq = r.chain_seq, prev_hash = r.prev_hash, row_hash = r.row_hash
     where id = r.id;
    v_prev := r.row_hash;
  end loop;
end;
$$;
alter table public.audit_log enable trigger audit_log_no_update;

alter table public.audit_log
  alter column chain_seq set not null,
  alter column row_hash set not null;

create trigger audit_log_chain
  before insert on public.audit_log
  for each row execute function app.audit_chain_hash();

-- Verifica: ripercorre la catena dell'azienda e indica la prima riga non coerente.
-- Solo per chi ha audit.read in quell'azienda.
create or replace function app.verify_audit_chain(p_tenant_id uuid)
returns table (valid boolean, checked bigint, first_invalid_id bigint, last_hash text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r public.audit_log;
  v_prev bytea := null;
  v_seq bigint := 0;
begin
  if not app.has_permission(p_tenant_id, 'audit.read') then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  for r in
    select * from public.audit_log a
    where a.tenant_id = p_tenant_id
    order by a.chain_seq
  loop
    v_seq := v_seq + 1;
    if r.chain_seq <> v_seq
       or r.prev_hash is distinct from v_prev
       or r.row_hash <> sha256(coalesce(v_prev, '\x'::bytea) || app.audit_canonical(r)) then
      return query select false, v_seq - 1, r.id, encode(v_prev, 'hex');
      return;
    end if;
    v_prev := r.row_hash;
  end loop;

  return query select true, v_seq, null::bigint, encode(v_prev, 'hex');
end;
$$;

grant execute on function app.verify_audit_chain(uuid) to authenticated;

revoke execute on all functions in schema app from public;
