-- =============================================================================
-- CantiereOS — Migrazione 0001: core multi-tenant
-- -----------------------------------------------------------------------------
-- Contenuto:
--   * schema privato `app` con le funzioni di sicurezza usate dalle policy RLS
--   * tenants (aziende), profiles, tenant_memberships (utente ↔ azienda + ruolo)
--   * catalogo permessi e matrice ruolo → permessi
--   * audit_log append-only con trigger generico
--   * business_partners + partner_contacts: prima tabella di dominio, usata
--     come modello di riferimento per tutte le tabelle tenant-scoped future
--
-- Prerequisiti (forniti da Supabase): schema `auth`, tabella auth.users,
-- funzione auth.uid(), ruoli anon / authenticated / service_role.
--
-- Regole applicate (vedi docs/DATABASE.md e docs/SECURITY.md):
--   1. Ogni tabella di dominio ha tenant_id NOT NULL e RLS attiva.
--   2. Il tenant_id non arriva mai "fidato" dal client: le policy verificano
--      che l'utente sia membro attivo dell'azienda con il permesso richiesto.
--   3. tenant_id è immutabile dopo l'inserimento.
--   4. I riferimenti tra tabelle di dominio usano FK composte (tenant_id, id)
--      così è impossibile collegare righe di aziende diverse.
--   5. Ogni modifica alle tabelle sensibili finisce in audit_log.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Schema privato per funzioni di sicurezza (non esposto via API)
-- -----------------------------------------------------------------------------
create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

-- NB: le funzioni sono eseguibili da PUBLIC per default e ALTER DEFAULT
-- PRIVILEGES ... IN SCHEMA non può revocare un default globale. Per questo in
-- fondo al file c'è un `revoke execute on all functions in schema app from
-- public` esplicito (ogni migrazione futura deve ripeterlo: lo verifica
-- tests/schema-guards.test.ts).

-- -----------------------------------------------------------------------------
-- Tipi
-- -----------------------------------------------------------------------------
create type public.tenant_status as enum ('trial', 'active', 'suspended', 'closed');
create type public.membership_role as enum ('owner', 'admin', 'manager', 'office', 'technician', 'viewer');
create type public.membership_status as enum ('invited', 'active', 'suspended');
create type public.partner_type as enum ('company', 'individual', 'public_entity');

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
    raise exception 'tenant_id is immutable'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- created_by viene sempre impostato dal server, mai dal client.
create or replace function app.set_created_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_by := auth.uid();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Aziende (tenant)
-- -----------------------------------------------------------------------------
create table public.tenants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 2 and 200),
  slug        text not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$'),
  status      public.tenant_status not null default 'trial',
  vat_number  text check (vat_number is null or char_length(vat_number) between 5 and 20),
  tax_code    text check (tax_code is null or char_length(tax_code) between 5 and 20),
  settings    jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index tenants_slug_key on public.tenants (slug);

comment on table public.tenants is 'Aziende clienti della piattaforma SaaS. Radice dell''isolamento multi-tenant.';

-- -----------------------------------------------------------------------------
-- Profili utente (globali: un utente può appartenere a più aziende)
-- -----------------------------------------------------------------------------
create table public.profiles (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  full_name   text check (full_name is null or char_length(full_name) <= 200),
  phone       text check (phone is null or char_length(phone) <= 40),
  locale      text not null default 'it-IT',
  avatar_path text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Appartenenza utente ↔ azienda
-- -----------------------------------------------------------------------------
create table public.tenant_memberships (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete restrict,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        public.membership_role not null default 'technician',
  status      public.membership_status not null default 'invited',
  invited_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint tenant_memberships_tenant_user_key unique (tenant_id, user_id),
  constraint tenant_memberships_tenant_id_id_key unique (tenant_id, id)
);
create index tenant_memberships_user_active_idx
  on public.tenant_memberships (user_id, tenant_id)
  where status = 'active';

-- -----------------------------------------------------------------------------
-- Permessi (catalogo globale) e matrice ruolo → permessi
-- -----------------------------------------------------------------------------
create table public.permissions (
  key         text primary key check (key ~ '^[a-z_]+\.[a-z_]+$'),
  description text not null
);

create table public.role_permissions (
  role        public.membership_role not null,
  permission  text not null references public.permissions (key) on delete cascade,
  primary key (role, permission)
);

insert into public.permissions (key, description) values
  ('tenant.manage',   'Modificare i dati anagrafici e le impostazioni dell''azienda'),
  ('members.read',    'Vedere gli utenti dell''azienda'),
  ('members.manage',  'Invitare, modificare e sospendere utenti'),
  ('audit.read',      'Consultare il registro attività (audit log)'),
  ('partners.read',   'Vedere clienti e fornitori'),
  ('partners.write',  'Creare e modificare clienti e fornitori'),
  ('partners.delete', 'Eliminare definitivamente clienti e fornitori');

insert into public.role_permissions (role, permission)
select r.role::public.membership_role, p.key
from (values
  ('owner',      array['tenant.manage','members.read','members.manage','audit.read','partners.read','partners.write','partners.delete']),
  ('admin',      array['tenant.manage','members.read','members.manage','audit.read','partners.read','partners.write','partners.delete']),
  ('manager',    array['members.read','partners.read','partners.write']),
  ('office',     array['members.read','partners.read','partners.write']),
  ('technician', array['partners.read']),
  ('viewer',     array['partners.read'])
) as r(role, perms)
cross join lateral unnest(r.perms) as p(key);

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
  from public.tenant_memberships m
  where m.user_id = auth.uid()
    and m.status = 'active';
$$;

-- Aziende operative in cui l'utente corrente ha il permesso indicato.
-- Usata nelle policy come `tenant_id in (select app.tenant_ids_with_permission('x'))`:
-- PostgreSQL la valuta una volta per query (InitPlan), non per riga.
create or replace function app.tenant_ids_with_permission(p_permission text)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.tenant_id
  from public.tenant_memberships m
  join public.tenants t
    on t.id = m.tenant_id
   and t.status in ('trial', 'active')
  join public.role_permissions rp
    on rp.role = m.role
   and rp.permission = p_permission
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

create or replace function app.is_tenant_owner(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tenant_memberships m
    where m.tenant_id = p_tenant_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role = 'owner'
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
    from public.tenant_memberships mine
    join public.tenant_memberships other
      on other.tenant_id = mine.tenant_id
    where mine.user_id = auth.uid()
      and mine.status = 'active'
      and other.user_id = p_user_id
      and other.status in ('active', 'invited')
  );
$$;

grant execute on function
  app.user_tenant_ids(),
  app.tenant_ids_with_permission(text),
  app.has_permission(uuid, text),
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
  raise exception 'audit_log is append-only'
    using errcode = '42501';
end;
$$;

create trigger audit_log_no_update
  before update or delete on public.audit_log
  for each row execute function app.audit_log_immutable();

create trigger audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function app.audit_log_immutable();

-- Trigger generico. Argomento opzionale: nome della colonna che contiene il
-- tenant (default 'tenant_id'; per la tabella tenants si passa 'id').
create or replace function app.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_col text := coalesce(tg_argv[0], 'tenant_id');
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
  v_changed text[];
  v_actor uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then v_old := to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then v_new := to_jsonb(new); end if;
  v_row := coalesce(v_new, v_old);

  if tg_op = 'UPDATE' then
    select array_agg(n.key order by n.key)
      into v_changed
    from jsonb_each(v_new) n
    where n.value is distinct from (v_old -> n.key);

    -- Nessuna modifica reale: non registrare rumore.
    if v_changed is null or v_changed = array['updated_at'] then
      return null;
    end if;
  end if;

  -- auth.uid() quando agisce un utente; altrimenti l'attore dichiarato dal
  -- server/worker (service_role) tramite `set local app.actor_user_id`.
  v_actor := coalesce(
    auth.uid(),
    nullif(current_setting('app.actor_user_id', true), '')::uuid
  );

  insert into public.audit_log
    (tenant_id, actor_user_id, action, table_name, record_id,
     old_data, new_data, changed_fields, request_id)
  values (
    (v_row ->> v_tenant_col)::uuid,
    v_actor,
    tg_op,
    tg_table_name,
    (v_row ->> 'id')::uuid,
    v_old,
    v_new,
    v_changed,
    nullif(current_setting('app.request_id', true), '')
  );

  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- Clienti e fornitori (prima tabella di dominio — modello di riferimento)
-- -----------------------------------------------------------------------------
create table public.business_partners (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete restrict,
  partner_type   public.partner_type not null default 'company',
  is_customer    boolean not null default true,
  is_supplier    boolean not null default false,
  display_name   text not null check (char_length(display_name) between 1 and 300),
  legal_name     text check (legal_name is null or char_length(legal_name) <= 300),
  vat_number     text check (vat_number is null or char_length(vat_number) between 5 and 20),
  tax_code       text check (tax_code is null or char_length(tax_code) between 5 and 20),
  sdi_code       text check (sdi_code is null or sdi_code ~ '^[A-Z0-9]{6,7}$'),
  pec_email      text check (pec_email is null or pec_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  email          text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone          text check (phone is null or char_length(phone) <= 40),
  address_line   text,
  postal_code    text,
  city           text,
  province       text check (province is null or province ~ '^[A-Z]{2}$'),
  country_code   text not null default 'IT' check (country_code ~ '^[A-Z]{2}$'),
  notes          text,
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  constraint business_partners_role_chk check (is_customer or is_supplier),
  constraint business_partners_tenant_id_id_key unique (tenant_id, id)
);
create unique index business_partners_tenant_vat_key
  on public.business_partners (tenant_id, vat_number)
  where vat_number is not null and deleted_at is null;
create index business_partners_tenant_name_idx
  on public.business_partners (tenant_id, lower(display_name))
  where deleted_at is null;

create table public.partner_contacts (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete restrict,
  partner_id  uuid not null,
  full_name   text not null check (char_length(full_name) between 1 and 200),
  role_title  text,
  email       text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone       text check (phone is null or char_length(phone) <= 40),
  is_primary  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- FK composta: il contatto può riferirsi solo a un partner della STESSA azienda.
  constraint partner_contacts_partner_fk
    foreign key (tenant_id, partner_id)
    references public.business_partners (tenant_id, id)
    on delete cascade,
  constraint partner_contacts_tenant_id_id_key unique (tenant_id, id)
);
create index partner_contacts_partner_idx on public.partner_contacts (tenant_id, partner_id);

-- -----------------------------------------------------------------------------
-- Invariante: ogni azienda conserva almeno un owner attivo
-- -----------------------------------------------------------------------------
create or replace function app.ensure_active_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'owner' and old.status = 'active'
     and exists (select 1 from public.tenants t where t.id = old.tenant_id)
     and not exists (
       select 1 from public.tenant_memberships m
       where m.tenant_id = old.tenant_id
         and m.role = 'owner'
         and m.status = 'active'
     )
  then
    raise exception 'a tenant must keep at least one active owner'
      using errcode = '23514';
  end if;
  return null;
end;
$$;

-- invited_by impostato dal server, mai dal client.
create or replace function app.set_invited_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.invited_by := auth.uid();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Trigger
-- -----------------------------------------------------------------------------
create trigger tenants_touch before update on public.tenants
  for each row execute function app.touch_updated_at();
create trigger profiles_touch before update on public.profiles
  for each row execute function app.touch_updated_at();
create trigger tenant_memberships_touch before update on public.tenant_memberships
  for each row execute function app.touch_updated_at();
create trigger business_partners_touch before update on public.business_partners
  for each row execute function app.touch_updated_at();
create trigger partner_contacts_touch before update on public.partner_contacts
  for each row execute function app.touch_updated_at();

create trigger tenant_memberships_tenant_immutable before update on public.tenant_memberships
  for each row execute function app.prevent_tenant_change();
create trigger business_partners_tenant_immutable before update on public.business_partners
  for each row execute function app.prevent_tenant_change();
create trigger partner_contacts_tenant_immutable before update on public.partner_contacts
  for each row execute function app.prevent_tenant_change();

create trigger business_partners_created_by before insert on public.business_partners
  for each row execute function app.set_created_by();
create trigger tenant_memberships_invited_by before insert on public.tenant_memberships
  for each row execute function app.set_invited_by();

create constraint trigger tenant_memberships_keep_owner
  after update or delete on public.tenant_memberships
  deferrable initially deferred
  for each row execute function app.ensure_active_owner();

create trigger tenants_audit after insert or update or delete on public.tenants
  for each row execute function app.audit_row_change('id');
create trigger tenant_memberships_audit after insert or update or delete on public.tenant_memberships
  for each row execute function app.audit_row_change();
create trigger business_partners_audit after insert or update or delete on public.business_partners
  for each row execute function app.audit_row_change();
create trigger partner_contacts_audit after insert or update or delete on public.partner_contacts
  for each row execute function app.audit_row_change();

-- Profilo creato automaticamente alla registrazione (Supabase Auth).
create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- -----------------------------------------------------------------------------
-- Funzioni applicative privilegiate
-- -----------------------------------------------------------------------------

-- Creazione azienda + primo owner. Solo il server (service_role) può
-- chiamarla, dopo aver verificato registrazione, piano e limiti.
create or replace function app.create_tenant(p_name text, p_slug text, p_owner_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
begin
  if p_owner_user_id is null then
    raise exception 'owner user id is required' using errcode = '22004';
  end if;

  insert into public.tenants (name, slug)
  values (p_name, p_slug)
  returning id into v_tenant_id;

  insert into public.tenant_memberships (tenant_id, user_id, role, status)
  values (v_tenant_id, p_owner_user_id, 'owner', 'active');

  return v_tenant_id;
end;
$$;
grant execute on function app.create_tenant(text, text, uuid) to service_role;

-- L'utente invitato accetta l'invito: solo la propria membership, solo da invited.
create or replace function app.accept_invitation(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.tenant_memberships
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
-- Funzioni: nessun EXECUTE implicito a PUBLIC (restano i grant espliciti sopra)
-- -----------------------------------------------------------------------------
revoke execute on all functions in schema app from public;

-- -----------------------------------------------------------------------------
-- Privilegi di tabella (privilegio minimo; anon non vede nulla)
-- -----------------------------------------------------------------------------
revoke all on
  public.tenants, public.profiles, public.tenant_memberships,
  public.permissions, public.role_permissions, public.audit_log,
  public.business_partners, public.partner_contacts
from anon, authenticated;

grant select on public.tenants to authenticated;
grant update (name, vat_number, tax_code, settings) on public.tenants to authenticated;

grant select on public.profiles to authenticated;
grant update (full_name, phone, locale, avatar_path) on public.profiles to authenticated;

grant select on public.tenant_memberships to authenticated;
grant insert (tenant_id, user_id, role, status) on public.tenant_memberships to authenticated;
grant update (role, status) on public.tenant_memberships to authenticated;
grant delete on public.tenant_memberships to authenticated;

grant select on public.permissions, public.role_permissions to authenticated;

grant select on public.audit_log to authenticated;

grant select, insert, delete on public.business_partners to authenticated;
grant update (partner_type, is_customer, is_supplier, display_name, legal_name,
              vat_number, tax_code, sdi_code, pec_email, email, phone,
              address_line, postal_code, city, province, country_code, notes,
              deleted_at)
  on public.business_partners to authenticated;

grant select, insert, delete on public.partner_contacts to authenticated;
grant update (full_name, role_title, email, phone, is_primary)
  on public.partner_contacts to authenticated;

grant all on
  public.tenants, public.profiles, public.tenant_memberships,
  public.permissions, public.role_permissions, public.audit_log,
  public.business_partners, public.partner_contacts
to service_role;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.tenants            enable row level security;
alter table public.profiles           enable row level security;
alter table public.tenant_memberships enable row level security;
alter table public.permissions        enable row level security;
alter table public.role_permissions   enable row level security;
alter table public.audit_log          enable row level security;
alter table public.business_partners  enable row level security;
alter table public.partner_contacts   enable row level security;

-- tenants
create policy tenants_select on public.tenants
  for select to authenticated
  using (id in (select app.user_tenant_ids()));

create policy tenants_update on public.tenants
  for update to authenticated
  using (id in (select app.tenant_ids_with_permission('tenant.manage')))
  with check (id in (select app.tenant_ids_with_permission('tenant.manage')));

-- profiles
create policy profiles_select on public.profiles
  for select to authenticated
  using (user_id = (select auth.uid()) or app.shares_tenant_with(user_id));

create policy profiles_update on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- tenant_memberships
create policy memberships_select on public.tenant_memberships
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or tenant_id in (select app.tenant_ids_with_permission('members.read'))
  );

-- Nessuno modifica la propria membership; solo un owner tocca/assegna 'owner';
-- un nuovo membro nasce sempre in stato 'invited'.
create policy memberships_insert on public.tenant_memberships
  for insert to authenticated
  with check (
    tenant_id in (select app.tenant_ids_with_permission('members.manage'))
    and user_id <> (select auth.uid())
    and status = 'invited'
    and (role <> 'owner' or app.is_tenant_owner(tenant_id))
  );

create policy memberships_update on public.tenant_memberships
  for update to authenticated
  using (
    tenant_id in (select app.tenant_ids_with_permission('members.manage'))
    and user_id <> (select auth.uid())
    and (role <> 'owner' or app.is_tenant_owner(tenant_id))
  )
  with check (
    tenant_id in (select app.tenant_ids_with_permission('members.manage'))
    and user_id <> (select auth.uid())
    and (role <> 'owner' or app.is_tenant_owner(tenant_id))
  );

create policy memberships_delete on public.tenant_memberships
  for delete to authenticated
  using (
    tenant_id in (select app.tenant_ids_with_permission('members.manage'))
    and user_id <> (select auth.uid())
    and (role <> 'owner' or app.is_tenant_owner(tenant_id))
  );

-- catalogo permessi: sola lettura
create policy permissions_select on public.permissions
  for select to authenticated using (true);
create policy role_permissions_select on public.role_permissions
  for select to authenticated using (true);

-- audit_log: sola lettura, solo con audit.read, solo della propria azienda
create policy audit_log_select on public.audit_log
  for select to authenticated
  using (tenant_id in (select app.tenant_ids_with_permission('audit.read')));

-- business_partners
create policy business_partners_select on public.business_partners
  for select to authenticated
  using (tenant_id in (select app.tenant_ids_with_permission('partners.read')));

create policy business_partners_insert on public.business_partners
  for insert to authenticated
  with check (tenant_id in (select app.tenant_ids_with_permission('partners.write')));

create policy business_partners_update on public.business_partners
  for update to authenticated
  using (tenant_id in (select app.tenant_ids_with_permission('partners.write')))
  with check (tenant_id in (select app.tenant_ids_with_permission('partners.write')));

create policy business_partners_delete on public.business_partners
  for delete to authenticated
  using (tenant_id in (select app.tenant_ids_with_permission('partners.delete')));

-- partner_contacts (stessi permessi del partner)
create policy partner_contacts_select on public.partner_contacts
  for select to authenticated
  using (tenant_id in (select app.tenant_ids_with_permission('partners.read')));

create policy partner_contacts_insert on public.partner_contacts
  for insert to authenticated
  with check (tenant_id in (select app.tenant_ids_with_permission('partners.write')));

create policy partner_contacts_update on public.partner_contacts
  for update to authenticated
  using (tenant_id in (select app.tenant_ids_with_permission('partners.write')))
  with check (tenant_id in (select app.tenant_ids_with_permission('partners.write')));

create policy partner_contacts_delete on public.partner_contacts
  for delete to authenticated
  using (tenant_id in (select app.tenant_ids_with_permission('partners.write')));
