-- =============================================================================
-- CantiereOS — Migrazione 0001: core multi-tenant
-- -----------------------------------------------------------------------------
-- Contenuto:
--   * schema privato `app` con funzioni di sicurezza e helper di migrazione
--   * tenants, tenant_settings, users, permissions, roles, role_permissions,
--     memberships, subscriptions
--   * audit_log append-only con trigger generico
--
-- Prerequisiti (forniti da Supabase): schema `auth`, tabella auth.users,
-- funzione auth.uid(), schema `extensions`, ruoli anon / authenticated /
-- service_role.
--
-- Regole applicate (vedi docs/DATABASE.md e docs/SECURITY.md):
--   1. Ogni tabella aziendale ha tenant_id NOT NULL e RLS attiva.
--   2. Il tenant_id del client non è mai fidato: le policy verificano che
--      l'utente sia membro attivo dell'azienda con il permesso richiesto.
--   3. tenant_id è immutabile dopo l'inserimento.
--   4. I riferimenti tra tabelle aziendali usano FK composte (tenant_id, id).
--   5. Ogni modifica alle tabelle aziendali finisce in audit_log.
--
-- NB: questa migrazione sostituisce la bozza della fase 1 prima che fosse
-- applicata a qualunque ambiente (nessun progetto Supabase esisteva).
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;

-- -----------------------------------------------------------------------------
-- Schema privato (non esposto via API)
-- -----------------------------------------------------------------------------
create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Tipi
-- -----------------------------------------------------------------------------
create type public.tenant_status as enum ('trial', 'active', 'suspended', 'closed');
create type public.membership_status as enum ('invited', 'active', 'suspended');
create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'paused', 'canceled');

-- -----------------------------------------------------------------------------
-- Funzioni trigger generiche
-- -----------------------------------------------------------------------------
create or replace function app.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function app.prevent_tenant_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tenant_id is distinct from old.tenant_id then
    raise exception 'tenant_id is immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Attore corrente: l'utente autenticato oppure l'attore dichiarato dal
-- server/worker (service_role) con `set local app.actor_user_id`.
create or replace function app.current_actor()
returns uuid
language sql
stable
set search_path = ''
as $$
  select coalesce(
    auth.uid(),
    nullif(current_setting('app.actor_user_id', true), '')::uuid
  );
$$;

-- created_by viene sempre impostato dal database, mai dal client.
create or replace function app.set_created_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_by := app.current_actor();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Aziende
-- -----------------------------------------------------------------------------
create table public.tenants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 2 and 200),
  slug        text not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$'),
  legal_name  text check (legal_name is null or char_length(legal_name) <= 300),
  vat_number  text check (vat_number is null or vat_number ~ '^[A-Z0-9]{5,20}$'),
  tax_code    text check (tax_code is null or tax_code ~ '^[A-Z0-9]{11,16}$'),
  status      public.tenant_status not null default 'trial',
  -- true solo per i dati del seed di sviluppo: permette di riconoscerli e
  -- di impedire che finiscano in un database con aziende reali.
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index tenants_slug_key on public.tenants (slug);

comment on table public.tenants is 'Aziende clienti della piattaforma. Radice dell''isolamento multi-tenant.';

-- -----------------------------------------------------------------------------
-- Impostazioni azienda (1:1, create automaticamente con l'azienda)
-- -----------------------------------------------------------------------------
create table public.tenant_settings (
  tenant_id          uuid primary key references public.tenants (id) on delete restrict,
  timezone           text not null default 'Europe/Rome' check (timezone ~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+)*$'),
  locale             text not null default 'it-IT' check (locale ~ '^[a-z]{2}-[A-Z]{2}$'),
  currency           char(3) not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  default_vat_rate   numeric(5,2) not null default 22.00 check (default_vat_rate between 0 and 100),
  week_starts_on     smallint not null default 1 check (week_starts_on between 0 and 6),
  workday_start      time not null default '08:00',
  workday_end        time not null default '17:00',
  brand_color        text check (brand_color is null or brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  logo_storage_key   text check (logo_storage_key is null or char_length(logo_storage_key) <= 500),
  preferences        jsonb not null default '{}'::jsonb check (jsonb_typeof(preferences) = 'object'),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint tenant_settings_workday_chk check (workday_end > workday_start)
);

-- -----------------------------------------------------------------------------
-- Utenti applicativi (1:1 con auth.users; un utente può stare in più aziende)
-- -----------------------------------------------------------------------------
create table public.users (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text check (email is null or char_length(email) <= 320),
  full_name    text check (full_name is null or char_length(full_name) <= 200),
  phone        text check (phone is null or char_length(phone) <= 40),
  locale       text not null default 'it-IT' check (locale ~ '^[a-z]{2}-[A-Z]{2}$'),
  avatar_storage_key text check (avatar_storage_key is null or char_length(avatar_storage_key) <= 500),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index users_email_idx on public.users (lower(email));

-- -----------------------------------------------------------------------------
-- Permessi (catalogo globale `modulo.azione`)
-- -----------------------------------------------------------------------------
create table public.permissions (
  id          uuid primary key default gen_random_uuid(),
  key         text not null check (key ~ '^[a-z_]+\.[a-z_]+$'),
  description text not null,
  created_at  timestamptz not null default now()
);
create unique index permissions_key_key on public.permissions (key);

-- -----------------------------------------------------------------------------
-- Ruoli: di sistema (tenant_id NULL, uguali per tutti) o personalizzati
-- dall'azienda (tenant_id valorizzato, chiave con prefisso custom_).
-- -----------------------------------------------------------------------------
create table public.roles (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid references public.tenants (id) on delete restrict,
  key         text not null check (key ~ '^[a-z][a-z0-9_]{1,39}$'),
  name        text not null check (char_length(name) between 1 and 100),
  description text check (description is null or char_length(description) <= 500),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint roles_custom_key_chk check (tenant_id is null or key like 'custom\_%'),
  constraint roles_tenant_id_id_key unique (tenant_id, id)
);
create unique index roles_system_key_key on public.roles (key) where tenant_id is null;
create unique index roles_tenant_key_key on public.roles (tenant_id, key) where tenant_id is not null;

create table public.role_permissions (
  id            uuid primary key default gen_random_uuid(),
  role_id       uuid not null,
  permission_id uuid not null references public.permissions (id) on delete cascade,
  -- copia di roles.tenant_id, impostata da trigger (NULL per i ruoli di sistema)
  tenant_id     uuid references public.tenants (id) on delete restrict,
  created_at    timestamptz not null default now(),
  constraint role_permissions_role_fk foreign key (role_id)
    references public.roles (id) on delete cascade,
  -- per i ruoli personalizzati la riga deve stare nella stessa azienda del ruolo
  constraint role_permissions_tenant_role_fk foreign key (tenant_id, role_id)
    references public.roles (tenant_id, id) on delete cascade,
  constraint role_permissions_role_permission_key unique (role_id, permission_id)
);
create index role_permissions_permission_idx on public.role_permissions (permission_id);
create index role_permissions_tenant_idx on public.role_permissions (tenant_id) where tenant_id is not null;

-- -----------------------------------------------------------------------------
-- Appartenenza utente ↔ azienda
-- -----------------------------------------------------------------------------
create table public.memberships (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete restrict,
  user_id     uuid not null references public.users (id) on delete cascade,
  role_id     uuid not null references public.roles (id) on delete restrict,
  status      public.membership_status not null default 'invited',
  invited_by  uuid references public.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint memberships_tenant_user_key unique (tenant_id, user_id),
  constraint memberships_tenant_id_id_key unique (tenant_id, id)
);
create index memberships_user_active_idx on public.memberships (user_id, tenant_id) where status = 'active';
create index memberships_role_idx on public.memberships (role_id);

-- -----------------------------------------------------------------------------
-- Abbonamenti (scritti solo dal server; nessun provider di pagamento ancora)
-- -----------------------------------------------------------------------------
create table public.subscriptions (
  id                         uuid primary key default gen_random_uuid(),
  tenant_id                  uuid not null references public.tenants (id) on delete restrict,
  plan_code                  text not null check (plan_code ~ '^[a-z][a-z0-9_]{1,39}$'),
  status                     public.subscription_status not null default 'trialing',
  seats                      integer not null check (seats > 0),
  storage_quota_mb           integer check (storage_quota_mb is null or storage_quota_mb > 0),
  trial_ends_at              timestamptz,
  current_period_start       timestamptz,
  current_period_end         timestamptz,
  canceled_at                timestamptz,
  billing_provider           text check (billing_provider is null or billing_provider ~ '^[a-z][a-z0-9_]{1,39}$'),
  provider_customer_ref      text check (provider_customer_ref is null or char_length(provider_customer_ref) <= 200),
  provider_subscription_ref  text check (provider_subscription_ref is null or char_length(provider_subscription_ref) <= 200),
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  constraint subscriptions_period_chk check (
    current_period_end is null or current_period_start is null or current_period_end > current_period_start
  ),
  constraint subscriptions_canceled_chk check ((status = 'canceled') = (canceled_at is not null)),
  constraint subscriptions_tenant_id_id_key unique (tenant_id, id)
);
-- al massimo un abbonamento non cancellato per azienda
create unique index subscriptions_one_open_per_tenant
  on public.subscriptions (tenant_id) where status <> 'canceled';
create unique index subscriptions_provider_ref_key
  on public.subscriptions (billing_provider, provider_subscription_ref)
  where provider_subscription_ref is not null;

-- -----------------------------------------------------------------------------
-- Catalogo permessi e ruoli di sistema (dati di riferimento, non fittizi)
-- -----------------------------------------------------------------------------
insert into public.permissions (key, description) values
  ('tenant.manage',  'Modificare dati e impostazioni dell''azienda'),
  ('billing.read',   'Vedere abbonamento e limiti del piano'),
  ('members.read',   'Vedere gli utenti dell''azienda'),
  ('members.manage', 'Invitare, modificare e sospendere utenti'),
  ('roles.manage',   'Creare e modificare ruoli personalizzati'),
  ('audit.read',     'Consultare il registro attività (audit log)');

insert into public.roles (tenant_id, key, name, description) values
  (null, 'owner',      'Titolare',      'Accesso completo, gestione titolari e abbonamento'),
  (null, 'admin',      'Amministratore','Accesso completo tranne la gestione dei titolari'),
  (null, 'manager',    'Responsabile',  'Pianificazione, squadre, anagrafiche'),
  (null, 'office',     'Ufficio',       'Anagrafiche e attività amministrative'),
  (null, 'technician', 'Tecnico',       'Lavoro sul campo, consultazione anagrafiche'),
  (null, 'viewer',     'Consultazione', 'Sola lettura');

-- Assegna permessi ai ruoli di sistema (usata anche dalle migrazioni successive).
create or replace function app.grant_system_permissions(p_role_key text, p_permission_keys text[])
returns void
language sql
set search_path = ''
as $$
  insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id
  from public.roles r
  join public.permissions p on p.key = any (p_permission_keys)
  where r.tenant_id is null and r.key = p_role_key
  on conflict (role_id, permission_id) do nothing;
$$;

select app.grant_system_permissions('owner', array['tenant.manage','billing.read','members.read','members.manage','roles.manage','audit.read']);
select app.grant_system_permissions('admin', array['tenant.manage','billing.read','members.read','members.manage','roles.manage','audit.read']);
select app.grant_system_permissions('manager', array['members.read']);
select app.grant_system_permissions('office', array['members.read']);

-- -----------------------------------------------------------------------------
-- Funzioni di sicurezza usate dalle policy RLS
-- SECURITY DEFINER: leggono memberships senza ricorsione RLS.
-- search_path vuoto: ogni riferimento è qualificato con lo schema.
-- -----------------------------------------------------------------------------

-- Aziende di cui l'utente corrente è membro attivo (qualsiasi stato azienda).
create or replace function app.user_tenant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.tenant_id
  from public.memberships m
  where m.user_id = auth.uid()
    and m.status = 'active';
$$;

-- Aziende operative (trial/active) in cui l'utente corrente ha il permesso.
-- Nelle policy si usa `tenant_id in (select app.tenant_ids_with_permission('x'))`:
-- PostgreSQL la valuta una volta per query (InitPlan), non per riga.
create or replace function app.tenant_ids_with_permission(p_permission text)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.tenant_id
  from public.memberships m
  join public.tenants t
    on t.id = m.tenant_id
   and t.status in ('trial', 'active')
  join public.role_permissions rp on rp.role_id = m.role_id
  join public.permissions p
    on p.id = rp.permission_id
   and p.key = p_permission
  where m.user_id = auth.uid()
    and m.status = 'active';
$$;

create or replace function app.has_permission(p_tenant_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from app.tenant_ids_with_permission(p_permission) as t(id)
    where t.id = p_tenant_id
  );
$$;

create or replace function app.is_owner_role(p_role_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.roles r
    where r.id = p_role_id and r.tenant_id is null and r.key = 'owner'
  );
$$;

create or replace function app.is_tenant_owner(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    join public.roles r on r.id = m.role_id and r.tenant_id is null and r.key = 'owner'
    where m.tenant_id = p_tenant_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

-- Vero se l'utente corrente e p_user_id condividono almeno un'azienda.
create or replace function app.shares_tenant_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships mine
    join public.memberships other on other.tenant_id = mine.tenant_id
    where mine.user_id = auth.uid()
      and mine.status = 'active'
      and other.user_id = p_user_id
      and other.status in ('active', 'invited')
  );
$$;

grant execute on function
  app.current_actor(),
  app.user_tenant_ids(),
  app.tenant_ids_with_permission(text),
  app.has_permission(uuid, text),
  app.is_owner_role(uuid),
  app.is_tenant_owner(uuid),
  app.shares_tenant_with(uuid)
to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Audit log (append-only)
-- -----------------------------------------------------------------------------
create table public.audit_log (
  id              bigint generated always as identity primary key,
  tenant_id       uuid references public.tenants (id) on delete restrict,
  actor_user_id   uuid,            -- nessuna FK: lo storico sopravvive all'utente
  action          text not null check (action ~ '^[A-Za-z_.]{3,64}$'),
  table_name      text,
  record_id       uuid,
  old_data        jsonb,
  new_data        jsonb,
  changed_fields  text[],
  request_id      text,
  created_at      timestamptz not null default now()
);
create index audit_log_tenant_created_idx on public.audit_log (tenant_id, created_at desc);
create index audit_log_record_idx on public.audit_log (tenant_id, table_name, record_id);

comment on table public.audit_log is 'Registro immutabile delle modifiche. Nessun ruolo applicativo può aggiornare o cancellare righe.';

create or replace function app.audit_log_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_log is append-only' using errcode = '42501';
end;
$$;

create trigger audit_log_no_update
  before update or delete on public.audit_log
  for each row execute function app.audit_log_immutable();
create trigger audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function app.audit_log_immutable();

-- Trigger generico. Argomenti opzionali: colonna del tenant (default
-- 'tenant_id') e colonna dell'identificativo (default 'id').
create or replace function app.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_col text := coalesce(tg_argv[0], 'tenant_id');
  v_id_col     text := coalesce(tg_argv[1], 'id');
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
  v_changed text[];
begin
  if tg_op in ('UPDATE', 'DELETE') then v_old := to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then v_new := to_jsonb(new); end if;
  v_row := coalesce(v_new, v_old);

  if tg_op = 'UPDATE' then
    select array_agg(n.key order by n.key)
      into v_changed
    from jsonb_each(v_new) n
    where n.value is distinct from (v_old -> n.key);

    if v_changed is null or v_changed = array['updated_at'] then
      return null;  -- nessuna modifica reale
    end if;
  end if;

  insert into public.audit_log
    (tenant_id, actor_user_id, action, table_name, record_id,
     old_data, new_data, changed_fields, request_id)
  values (
    (v_row ->> v_tenant_col)::uuid,
    app.current_actor(),
    tg_op,
    tg_table_name,
    (v_row ->> v_id_col)::uuid,
    v_old,
    v_new,
    v_changed,
    nullif(current_setting('app.request_id', true), '')
  );

  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- Helper di migrazione (eseguibili solo dal proprietario dello schema).
-- Applicano in modo uniforme trigger, privilegi e policy a ogni tabella
-- aziendale: meno codice ripetuto, meno occasioni di dimenticare qualcosa.
-- -----------------------------------------------------------------------------

-- Trigger standard: updated_at, immutabilità tenant_id, created_by, audit.
create or replace function app.attach_tenant_table_triggers(p_table regclass)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_name text;
  v_has_updated_at boolean;
  v_has_created_by boolean;
begin
  select c.relname into v_name from pg_catalog.pg_class c where c.oid = p_table;
  select exists (select 1 from pg_catalog.pg_attribute a
                 where a.attrelid = p_table and a.attname = 'updated_at' and not a.attisdropped)
    into v_has_updated_at;
  select exists (select 1 from pg_catalog.pg_attribute a
                 where a.attrelid = p_table and a.attname = 'created_by' and not a.attisdropped)
    into v_has_created_by;

  if v_has_updated_at then
    execute format('create trigger %I before update on %s for each row execute function app.touch_updated_at()',
                   v_name || '_touch', p_table);
  end if;
  execute format('create trigger %I before update on %s for each row execute function app.prevent_tenant_change()',
                 v_name || '_tenant_immutable', p_table);
  if v_has_created_by then
    execute format('create trigger %I before insert on %s for each row execute function app.set_created_by()',
                   v_name || '_created_by', p_table);
  end if;
  execute format('create trigger %I after insert or update or delete on %s for each row execute function app.audit_row_change()',
                 v_name || '_audit', p_table);
end;
$$;

-- Privilegi minimi: anon nulla; authenticated select/insert/update/delete solo
-- sulle colonne modificabili; service_role tutto.
create or replace function app.grant_tenant_table(p_table regclass)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_insert_cols text;
  v_update_cols text;
begin
  select string_agg(quote_ident(a.attname), ', ' order by a.attnum)
    into v_insert_cols
  from pg_catalog.pg_attribute a
  where a.attrelid = p_table and a.attnum > 0 and not a.attisdropped
    and a.attgenerated = ''
    and a.attname not in ('created_at', 'updated_at', 'created_by');

  select string_agg(quote_ident(a.attname), ', ' order by a.attnum)
    into v_update_cols
  from pg_catalog.pg_attribute a
  where a.attrelid = p_table and a.attnum > 0 and not a.attisdropped
    and a.attgenerated = ''
    and a.attname not in ('id', 'tenant_id', 'created_at', 'updated_at', 'created_by');

  execute format('revoke all on %s from anon, authenticated', p_table);
  execute format('grant select, delete on %s to authenticated', p_table);
  execute format('grant insert (%s) on %s to authenticated', v_insert_cols, p_table);
  execute format('grant update (%s) on %s to authenticated', v_update_cols, p_table);
  execute format('grant all on %s to service_role', p_table);
end;
$$;

-- Policy standard: lettura/scrittura/cancellazione legate a tre permessi.
create or replace function app.create_tenant_policies(
  p_table regclass, p_read text, p_write text, p_delete text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_name text;
begin
  select c.relname into v_name from pg_catalog.pg_class c where c.oid = p_table;
  execute format('alter table %s enable row level security', p_table);
  execute format(
    'create policy %I on %s for select to authenticated using (tenant_id in (select app.tenant_ids_with_permission(%L)))',
    v_name || '_select', p_table, p_read);
  execute format(
    'create policy %I on %s for insert to authenticated with check (tenant_id in (select app.tenant_ids_with_permission(%L)))',
    v_name || '_insert', p_table, p_write);
  execute format(
    'create policy %I on %s for update to authenticated using (tenant_id in (select app.tenant_ids_with_permission(%L))) with check (tenant_id in (select app.tenant_ids_with_permission(%L)))',
    v_name || '_update', p_table, p_write, p_write);
  execute format(
    'create policy %I on %s for delete to authenticated using (tenant_id in (select app.tenant_ids_with_permission(%L)))',
    v_name || '_delete', p_table, p_delete);
end;
$$;

-- -----------------------------------------------------------------------------
-- Trigger specifici del core
-- -----------------------------------------------------------------------------

-- Ogni azienda nasce con le sue impostazioni.
create or replace function app.create_tenant_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.tenant_settings (tenant_id) values (new.id)
  on conflict (tenant_id) do nothing;
  return null;
end;
$$;

-- role_permissions.tenant_id deriva dal ruolo; un utente non può concedere
-- a un ruolo permessi che lui stesso non ha (anti-escalation).
create or replace function app.check_role_permission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
begin
  select r.tenant_id into new.tenant_id from public.roles r where r.id = new.role_id;

  if auth.uid() is not null then
    if new.tenant_id is null then
      raise exception 'system roles cannot be modified' using errcode = '42501';
    end if;
    select p.key into v_key from public.permissions p where p.id = new.permission_id;
    if not app.has_permission(new.tenant_id, v_key) then
      raise exception 'cannot grant a permission you do not hold: %', v_key using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- Il ruolo di una membership deve essere di sistema o della stessa azienda.
create or replace function app.check_membership_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.roles r
    where r.id = new.role_id
      and (r.tenant_id is null or r.tenant_id = new.tenant_id)
  ) then
    raise exception 'role % does not belong to tenant %', new.role_id, new.tenant_id
      using errcode = '23503';
  end if;
  return new;
end;
$$;

-- Ogni azienda conserva almeno un titolare attivo.
create or replace function app.ensure_active_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if app.is_owner_role(old.role_id) and old.status = 'active'
     and exists (select 1 from public.tenants t where t.id = old.tenant_id)
     and not exists (
       select 1
       from public.memberships m
       join public.roles r on r.id = m.role_id and r.tenant_id is null and r.key = 'owner'
       where m.tenant_id = old.tenant_id and m.status = 'active'
     )
  then
    raise exception 'a tenant must keep at least one active owner' using errcode = '23514';
  end if;
  return null;
end;
$$;

create or replace function app.set_invited_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.invited_by := app.current_actor();
  return new;
end;
$$;

-- Profilo applicativo creato alla registrazione (Supabase Auth).
create or replace function app.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_auth_user();

create trigger tenants_touch before update on public.tenants
  for each row execute function app.touch_updated_at();
create trigger tenants_audit after insert or update or delete on public.tenants
  for each row execute function app.audit_row_change('id', 'id');
create trigger tenants_create_settings after insert on public.tenants
  for each row execute function app.create_tenant_settings();

create trigger tenant_settings_touch before update on public.tenant_settings
  for each row execute function app.touch_updated_at();
create trigger tenant_settings_tenant_immutable before update on public.tenant_settings
  for each row execute function app.prevent_tenant_change();
create trigger tenant_settings_audit after insert or update or delete on public.tenant_settings
  for each row execute function app.audit_row_change('tenant_id', 'tenant_id');

create trigger users_touch before update on public.users
  for each row execute function app.touch_updated_at();

create trigger roles_touch before update on public.roles
  for each row execute function app.touch_updated_at();
create trigger roles_tenant_immutable before update on public.roles
  for each row execute function app.prevent_tenant_change();
create trigger roles_audit after insert or update or delete on public.roles
  for each row execute function app.audit_row_change();

create trigger role_permissions_check before insert or update on public.role_permissions
  for each row execute function app.check_role_permission();
create trigger role_permissions_tenant_immutable before update on public.role_permissions
  for each row execute function app.prevent_tenant_change();
create trigger role_permissions_audit after insert or update or delete on public.role_permissions
  for each row execute function app.audit_row_change();

create trigger memberships_touch before update on public.memberships
  for each row execute function app.touch_updated_at();
create trigger memberships_tenant_immutable before update on public.memberships
  for each row execute function app.prevent_tenant_change();
create trigger memberships_check_role before insert or update of role_id on public.memberships
  for each row execute function app.check_membership_role();
create trigger memberships_invited_by before insert on public.memberships
  for each row execute function app.set_invited_by();
create trigger memberships_audit after insert or update or delete on public.memberships
  for each row execute function app.audit_row_change();
create constraint trigger memberships_keep_owner
  after update or delete on public.memberships
  deferrable initially deferred
  for each row execute function app.ensure_active_owner();

create trigger subscriptions_touch before update on public.subscriptions
  for each row execute function app.touch_updated_at();
create trigger subscriptions_tenant_immutable before update on public.subscriptions
  for each row execute function app.prevent_tenant_change();
create trigger subscriptions_audit after insert or update or delete on public.subscriptions
  for each row execute function app.audit_row_change();

-- -----------------------------------------------------------------------------
-- Funzioni applicative privilegiate
-- -----------------------------------------------------------------------------

-- Crea azienda + titolare + abbonamento iniziale. Solo il server
-- (service_role) può chiamarla, dopo aver verificato registrazione e piano.
-- Piano, posti e fine prova sono decisi dal server: nessun valore inventato qui.
create or replace function app.create_tenant(
  p_name text,
  p_slug text,
  p_owner_user_id uuid,
  p_plan_code text,
  p_seats integer,
  p_trial_ends_at timestamptz,
  p_is_demo boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_owner_role uuid;
begin
  if p_owner_user_id is null then
    raise exception 'owner user id is required' using errcode = '22004';
  end if;

  select r.id into v_owner_role from public.roles r where r.tenant_id is null and r.key = 'owner';

  insert into public.tenants (name, slug, is_demo)
  values (p_name, p_slug, p_is_demo)
  returning id into v_tenant_id;

  insert into public.memberships (tenant_id, user_id, role_id, status)
  values (v_tenant_id, p_owner_user_id, v_owner_role, 'active');

  insert into public.subscriptions (tenant_id, plan_code, status, seats, trial_ends_at)
  values (v_tenant_id, p_plan_code, 'trialing', p_seats, p_trial_ends_at);

  return v_tenant_id;
end;
$$;
grant execute on function app.create_tenant(text, text, uuid, text, integer, timestamptz, boolean) to service_role;

-- L'invitato accetta il proprio invito (solo la propria membership, solo da invited).
create or replace function app.accept_invitation(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.memberships
     set status = 'active'
   where tenant_id = p_tenant_id
     and user_id = auth.uid()
     and status = 'invited';
  if not found then
    raise exception 'no pending invitation' using errcode = 'P0002';
  end if;
end;
$$;
grant execute on function app.accept_invitation(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Privilegi di tabella
-- -----------------------------------------------------------------------------
revoke all on
  public.tenants, public.tenant_settings, public.users, public.permissions,
  public.roles, public.role_permissions, public.memberships,
  public.subscriptions, public.audit_log
from anon, authenticated;

grant select on public.tenants to authenticated;
grant update (name, legal_name, vat_number, tax_code) on public.tenants to authenticated;

grant select on public.tenant_settings to authenticated;
grant update (timezone, locale, currency, default_vat_rate, week_starts_on, workday_start,
              workday_end, brand_color, logo_storage_key, preferences)
  on public.tenant_settings to authenticated;

grant select on public.users to authenticated;
grant update (full_name, phone, locale, avatar_storage_key) on public.users to authenticated;

grant select on public.permissions to authenticated;

grant select, delete on public.roles to authenticated;
grant insert (tenant_id, key, name, description) on public.roles to authenticated;
grant update (name, description) on public.roles to authenticated;

grant select, delete on public.role_permissions to authenticated;
grant insert (role_id, permission_id) on public.role_permissions to authenticated;

grant select, delete on public.memberships to authenticated;
grant insert (tenant_id, user_id, role_id, status) on public.memberships to authenticated;
grant update (role_id, status) on public.memberships to authenticated;

grant select on public.subscriptions to authenticated;

grant select on public.audit_log to authenticated;

grant all on
  public.tenants, public.tenant_settings, public.users, public.permissions,
  public.roles, public.role_permissions, public.memberships,
  public.subscriptions, public.audit_log
to service_role;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.tenants          enable row level security;
alter table public.tenant_settings  enable row level security;
alter table public.users            enable row level security;
alter table public.permissions      enable row level security;
alter table public.roles            enable row level security;
alter table public.role_permissions enable row level security;
alter table public.memberships      enable row level security;
alter table public.subscriptions    enable row level security;
alter table public.audit_log        enable row level security;

-- tenants
create policy tenants_select on public.tenants
  for select to authenticated
  using (id in (select app.user_tenant_ids()));
create policy tenants_update on public.tenants
  for update to authenticated
  using (id in (select app.tenant_ids_with_permission('tenant.manage')))
  with check (id in (select app.tenant_ids_with_permission('tenant.manage')));

-- tenant_settings
create policy tenant_settings_select on public.tenant_settings
  for select to authenticated
  using (tenant_id in (select app.user_tenant_ids()));
create policy tenant_settings_update on public.tenant_settings
  for update to authenticated
  using (tenant_id in (select app.tenant_ids_with_permission('tenant.manage')))
  with check (tenant_id in (select app.tenant_ids_with_permission('tenant.manage')));

-- users
create policy users_select on public.users
  for select to authenticated
  using (id = (select auth.uid()) or app.shares_tenant_with(id));
create policy users_update on public.users
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- permissions: catalogo in sola lettura
create policy permissions_select on public.permissions
  for select to authenticated using (true);

-- roles: di sistema visibili a tutti; personalizzati solo ai membri dell'azienda
create policy roles_select on public.roles
  for select to authenticated
  using (tenant_id is null or tenant_id in (select app.user_tenant_ids()));
create policy roles_insert on public.roles
  for insert to authenticated
  with check (tenant_id in (select app.tenant_ids_with_permission('roles.manage')));
create policy roles_update on public.roles
  for update to authenticated
  using (tenant_id in (select app.tenant_ids_with_permission('roles.manage')))
  with check (tenant_id in (select app.tenant_ids_with_permission('roles.manage')));
create policy roles_delete on public.roles
  for delete to authenticated
  using (tenant_id in (select app.tenant_ids_with_permission('roles.manage')));

-- role_permissions
create policy role_permissions_select on public.role_permissions
  for select to authenticated
  using (tenant_id is null or tenant_id in (select app.user_tenant_ids()));
create policy role_permissions_insert on public.role_permissions
  for insert to authenticated
  with check (tenant_id in (select app.tenant_ids_with_permission('roles.manage')));
create policy role_permissions_delete on public.role_permissions
  for delete to authenticated
  using (tenant_id in (select app.tenant_ids_with_permission('roles.manage')));

-- memberships: nessuno modifica la propria; solo un titolare tocca/assegna il
-- ruolo owner; un nuovo membro nasce sempre "invited".
create policy memberships_select on public.memberships
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or tenant_id in (select app.tenant_ids_with_permission('members.read'))
  );
create policy memberships_insert on public.memberships
  for insert to authenticated
  with check (
    tenant_id in (select app.tenant_ids_with_permission('members.manage'))
    and user_id <> (select auth.uid())
    and status = 'invited'
    and (not app.is_owner_role(role_id) or app.is_tenant_owner(tenant_id))
  );
create policy memberships_update on public.memberships
  for update to authenticated
  using (
    tenant_id in (select app.tenant_ids_with_permission('members.manage'))
    and user_id <> (select auth.uid())
    and (not app.is_owner_role(role_id) or app.is_tenant_owner(tenant_id))
  )
  with check (
    tenant_id in (select app.tenant_ids_with_permission('members.manage'))
    and user_id <> (select auth.uid())
    and (not app.is_owner_role(role_id) or app.is_tenant_owner(tenant_id))
  );
create policy memberships_delete on public.memberships
  for delete to authenticated
  using (
    tenant_id in (select app.tenant_ids_with_permission('members.manage'))
    and user_id <> (select auth.uid())
    and (not app.is_owner_role(role_id) or app.is_tenant_owner(tenant_id))
  );

-- subscriptions: lettura con billing.read; scrittura solo service_role
create policy subscriptions_select on public.subscriptions
  for select to authenticated
  using (tenant_id in (select app.tenant_ids_with_permission('billing.read')));

-- audit_log: sola lettura con audit.read, solo della propria azienda
create policy audit_log_select on public.audit_log
  for select to authenticated
  using (tenant_id in (select app.tenant_ids_with_permission('audit.read')));

-- -----------------------------------------------------------------------------
-- Funzioni: nessun EXECUTE implicito a PUBLIC (restano i grant espliciti).
-- ALTER DEFAULT PRIVILEGES ... IN SCHEMA non può revocare un default globale,
-- quindi ogni migrazione che crea funzioni in `app` ripete questa riga
-- (verificato da tests/schema-guards.test.ts).
-- -----------------------------------------------------------------------------
revoke execute on all functions in schema app from public;
