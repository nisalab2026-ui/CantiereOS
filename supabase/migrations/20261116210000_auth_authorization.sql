-- =============================================================================
-- CantiereOS — Migrazione 0004: autenticazione e autorizzazione
-- -----------------------------------------------------------------------------
--   * MFA imposta dal database: i permessi amministrativi richiedono una
--     sessione con aal2 (Supabase Auth, TOTP) — non basta il controllo UI
--   * ruoli iniziali richiesti: Proprietario azienda, Amministratore,
--     Responsabile operativo, Responsabile cantiere, Amministrazione, Tecnico,
--     Cliente esterno (+ Super Admin SaaS, fuori dalle aziende)
--   * inviti con token (solo hash nel DB), scadenza, revoca, limite posti
--   * cliente esterno legato a un solo cliente dell'azienda (portale)
--   * azienda attiva memorizzata lato server, solo tra quelle dell'utente
-- =============================================================================

-- -----------------------------------------------------------------------------
-- MFA
-- -----------------------------------------------------------------------------
alter table public.permissions
  add column requires_mfa boolean not null default false;

update public.permissions
   set requires_mfa = true
 where key in ('tenant.manage', 'billing.read', 'members.manage', 'roles.manage', 'audit.read')
    or key like '%.delete';

comment on column public.permissions.requires_mfa is
  'Se true il permesso vale solo con una sessione autenticata a due fattori (JWT aal = aal2).';

-- Livello di autenticazione della sessione corrente (claim `aal` del JWT
-- firmato da Supabase Auth). Senza claim si assume il livello più basso.
create or replace function app.current_aal()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'aal',
    'aal1'
  );
$$;

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
    and m.status = 'active'
    and (not p.requires_mfa or app.current_aal() = 'aal2');
$$;

-- Permessi effettivi dell'utente in un'azienda. `granted` = utilizzabile ora;
-- un permesso con requires_mfa e granted = false richiede di verificare la MFA.
create or replace function app.my_permissions(p_tenant_id uuid)
returns table (permission text, requires_mfa boolean, granted boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.key,
         p.requires_mfa,
         (not p.requires_mfa or app.current_aal() = 'aal2')
  from public.memberships m
  join public.tenants t
    on t.id = m.tenant_id
   and t.status in ('trial', 'active')
  join public.role_permissions rp on rp.role_id = m.role_id
  join public.permissions p on p.id = rp.permission_id
  where m.user_id = auth.uid()
    and m.status = 'active'
    and m.tenant_id = p_tenant_id
  order by p.key;
$$;

-- -----------------------------------------------------------------------------
-- Ruoli iniziali
-- -----------------------------------------------------------------------------
update public.roles set name = 'Proprietario azienda',
       description = 'Accesso completo, gestione proprietari e abbonamento'
 where tenant_id is null and key = 'owner';
update public.roles set name = 'Amministratore',
       description = 'Accesso completo tranne la gestione dei proprietari'
 where tenant_id is null and key = 'admin';
update public.roles set key = 'operations_manager', name = 'Responsabile operativo',
       description = 'Pianificazione, squadre, anagrafiche, personale'
 where tenant_id is null and key = 'manager';
update public.roles set key = 'back_office', name = 'Amministrazione',
       description = 'Anagrafiche, documenti e attività amministrative'
 where tenant_id is null and key = 'office';
update public.roles set name = 'Tecnico',
       description = 'Lavoro sul campo, consultazione anagrafiche'
 where tenant_id is null and key = 'technician';

-- "Consultazione" non è tra i ruoli richiesti: si elimina (fallisce se usato).
delete from public.roles where tenant_id is null and key = 'viewer';

insert into public.roles (tenant_id, key, name, description) values
  (null, 'site_manager',    'Responsabile cantiere', 'Gestione operativa dei cantieri e delle squadre assegnate'),
  (null, 'external_client', 'Cliente esterno',       'Accesso al portale limitato ai dati del proprio cliente');

insert into public.permissions (key, description) values
  ('portal.access', 'Accedere al portale cliente (solo dati del proprio cliente)');

select app.grant_system_permissions('site_manager',
  array['members.read','customers.read','suppliers.read','employees.read','teams.read','teams.write']);
select app.grant_system_permissions('external_client', array['portal.access']);

-- -----------------------------------------------------------------------------
-- Super Admin SaaS (operatori della piattaforma, fuori dalle aziende)
-- -----------------------------------------------------------------------------
create table public.platform_admins (
  user_id     uuid primary key references public.users (id) on delete cascade,
  granted_by  uuid references public.users (id) on delete set null,
  note        text check (note is null or char_length(note) <= 500),
  created_at  timestamptz not null default now()
);

comment on table public.platform_admins is
  'Super Admin SaaS. Gestito solo dal service_role. I privilegi valgono solo con MFA (aal2).';

create trigger platform_admins_audit after insert or update or delete on public.platform_admins
  for each row execute function app.audit_row_change('tenant_id', 'user_id');

create or replace function app.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.current_aal() = 'aal2'
     and exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid());
$$;

revoke all on public.platform_admins from anon, authenticated;
grant select on public.platform_admins to authenticated;
grant all on public.platform_admins to service_role;
alter table public.platform_admins enable row level security;

create policy platform_admins_select_self on public.platform_admins
  for select to authenticated
  using (user_id = (select auth.uid()));

-- I Super Admin vedono i metadati delle aziende e degli abbonamenti (non i dati
-- operativi: per quelli serve un flusso di supporto tracciato lato server).
create policy tenants_platform_select on public.tenants
  for select to authenticated
  using (app.is_platform_admin());
create policy subscriptions_platform_select on public.subscriptions
  for select to authenticated
  using (app.is_platform_admin());

-- -----------------------------------------------------------------------------
-- Cliente esterno: membership legata a un cliente dell'azienda
-- -----------------------------------------------------------------------------
alter table public.memberships
  add column customer_id uuid,
  add constraint memberships_customer_fk foreign key (tenant_id, customer_id)
    references public.customers (tenant_id, id) on delete cascade;
create index memberships_customer_idx on public.memberships (tenant_id, customer_id)
  where customer_id is not null;

-- Ruolo di sistema o della stessa azienda; customer_id obbligatorio se e solo
-- se il ruolo è "external_client". Usata da memberships e invitations.
create or replace function app.check_membership_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role_tenant uuid;
  v_role_key text;
begin
  select r.tenant_id, r.key into v_role_tenant, v_role_key
  from public.roles r where r.id = new.role_id;

  if not found or (v_role_tenant is not null and v_role_tenant <> new.tenant_id) then
    raise exception 'role % does not belong to tenant %', new.role_id, new.tenant_id
      using errcode = '23503';
  end if;

  if (v_role_tenant is null and v_role_key = 'external_client') <> (new.customer_id is not null) then
    raise exception 'customer_id is required for, and only for, the external_client role'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger memberships_check_role on public.memberships;
create trigger memberships_check_role before insert or update of role_id, customer_id on public.memberships
  for each row execute function app.check_membership_role();

-- Clienti visibili al cliente esterno corrente.
create or replace function app.portal_customer_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.customer_id
  from public.memberships m
  join public.tenants t on t.id = m.tenant_id and t.status in ('trial', 'active')
  join public.roles r on r.id = m.role_id and r.tenant_id is null and r.key = 'external_client'
  where m.user_id = auth.uid()
    and m.status = 'active'
    and m.customer_id is not null;
$$;

create policy customers_portal_select on public.customers
  for select to authenticated
  using (id in (select app.portal_customer_ids()));
create policy customer_sites_portal_select on public.customer_sites
  for select to authenticated
  using (customer_id in (select app.portal_customer_ids()));

-- Un cliente esterno non vede i colleghi interni dell'azienda.
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
    join public.roles my_role on my_role.id = mine.role_id
    join public.memberships other on other.tenant_id = mine.tenant_id
    where mine.user_id = auth.uid()
      and mine.status = 'active'
      and not (my_role.tenant_id is null and my_role.key = 'external_client')
      and other.user_id = p_user_id
      and other.status in ('active', 'invited')
  );
$$;

-- -----------------------------------------------------------------------------
-- Inviti
-- -----------------------------------------------------------------------------
create table public.invitations (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete restrict,
  email        text not null check (
                 email = lower(email)
                 and char_length(email) <= 320
                 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role_id      uuid not null references public.roles (id) on delete restrict,
  customer_id  uuid,
  -- SHA-256 esadecimale del token: il token in chiaro esiste solo nel link
  token_hash   text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at   timestamptz not null,
  created_by   uuid references public.users (id) on delete set null,
  accepted_at  timestamptz,
  accepted_by  uuid references public.users (id) on delete set null,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint invitations_expiry_chk check (
    expires_at > created_at and expires_at <= created_at + interval '30 days'),
  constraint invitations_customer_fk foreign key (tenant_id, customer_id)
    references public.customers (tenant_id, id) on delete cascade,
  constraint invitations_tenant_id_id_key unique (tenant_id, id)
);
create unique index invitations_token_hash_key on public.invitations (token_hash);
create unique index invitations_one_pending_per_email
  on public.invitations (tenant_id, email) where accepted_at is null and revoked_at is null;
create index invitations_tenant_created_idx on public.invitations (tenant_id, created_at desc);

select app.attach_tenant_table_triggers('public.invitations');
create trigger invitations_check_role before insert or update of role_id, customer_id on public.invitations
  for each row execute function app.check_membership_role();

revoke all on public.invitations from anon, authenticated;
grant select on public.invitations to authenticated;
grant insert (id, tenant_id, email, role_id, customer_id, token_hash, expires_at)
  on public.invitations to authenticated;
grant update (revoked_at) on public.invitations to authenticated;
grant all on public.invitations to service_role;

alter table public.invitations enable row level security;

create policy invitations_select on public.invitations
  for select to authenticated
  using (tenant_id in (select app.tenant_ids_with_permission('members.manage')));
create policy invitations_insert on public.invitations
  for insert to authenticated
  with check (
    tenant_id in (select app.tenant_ids_with_permission('members.manage'))
    and (not app.is_owner_role(role_id) or app.is_tenant_owner(tenant_id))
  );
-- unica modifica ammessa: revoca di un invito non ancora accettato
create policy invitations_revoke on public.invitations
  for update to authenticated
  using (
    tenant_id in (select app.tenant_ids_with_permission('members.manage'))
    and accepted_at is null
    and (not app.is_owner_role(role_id) or app.is_tenant_owner(tenant_id))
  )
  with check (tenant_id in (select app.tenant_ids_with_permission('members.manage')));

-- Le membership nascono SOLO da create_tenant (server) o da un invito accettato.
drop policy memberships_insert on public.memberships;
revoke insert on public.memberships from authenticated;
drop function app.accept_invitation(uuid);

-- invited_by: se il server lo valorizza (accettazione invito) resta, altrimenti l'attore.
create or replace function app.set_invited_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null and new.invited_by is distinct from auth.uid() then
    -- un utente non può attribuire l'invito a qualcun altro: decide il DB
    new.invited_by := coalesce(new.invited_by, app.current_actor());
  else
    new.invited_by := coalesce(new.invited_by, app.current_actor());
  end if;
  return new;
end;
$$;

-- Accettazione: il token deve corrispondere, l'invito essere valido, l'email
-- dell'utente autenticato (verificata in auth.users) coincidere con quella
-- invitata, e l'azienda avere posti liberi (clienti esterni esclusi).
create or replace function app.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.invitations%rowtype;
  v_email text;
  v_is_client boolean;
  v_seats integer;
  v_used integer;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if p_token is null or char_length(p_token) < 32 then
    raise exception 'invalid or expired invitation' using errcode = 'P0002';
  end if;

  select * into v_inv
  from public.invitations i
  where i.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  for update;

  if not found or v_inv.revoked_at is not null or v_inv.accepted_at is not null
     or v_inv.expires_at <= now() then
    raise exception 'invalid or expired invitation' using errcode = 'P0002';
  end if;

  select lower(u.email) into v_email
  from auth.users u
  where u.id = v_uid and u.email_confirmed_at is not null;

  if v_email is null or v_email <> v_inv.email then
    raise exception 'invitation was issued to a different or unverified email' using errcode = '42501';
  end if;

  if exists (select 1 from public.memberships m where m.tenant_id = v_inv.tenant_id and m.user_id = v_uid) then
    raise exception 'user is already a member of this tenant' using errcode = '23505';
  end if;

  select (r.tenant_id is null and r.key = 'external_client') into v_is_client
  from public.roles r where r.id = v_inv.role_id;

  if not v_is_client then
    select s.seats into v_seats
    from public.subscriptions s
    where s.tenant_id = v_inv.tenant_id and s.status <> 'canceled';

    select count(*) into v_used
    from public.memberships m
    join public.roles r on r.id = m.role_id
    where m.tenant_id = v_inv.tenant_id
      and m.status = 'active'
      and not (r.tenant_id is null and r.key = 'external_client');

    if v_seats is null or v_used >= v_seats then
      raise exception 'seat limit reached for this tenant' using errcode = '53400';
    end if;
  end if;

  insert into public.memberships (tenant_id, user_id, role_id, status, invited_by, customer_id)
  values (v_inv.tenant_id, v_uid, v_inv.role_id, 'active', v_inv.created_by, v_inv.customer_id);

  update public.invitations
     set accepted_at = now(), accepted_by = v_uid
   where id = v_inv.id;

  update public.users set last_active_tenant_id = v_inv.tenant_id where id = v_uid;

  return v_inv.tenant_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Azienda attiva (preferenza server-side, mai fidata senza verifica)
-- -----------------------------------------------------------------------------
alter table public.users
  add column last_active_tenant_id uuid references public.tenants (id) on delete set null;

create or replace function app.set_active_tenant(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.memberships m
    where m.tenant_id = p_tenant_id and m.user_id = auth.uid() and m.status = 'active'
  ) then
    raise exception 'not an active member of this tenant' using errcode = '42501';
  end if;
  update public.users set last_active_tenant_id = p_tenant_id where id = auth.uid();
end;
$$;

-- -----------------------------------------------------------------------------
-- Privilegi sulle funzioni
-- -----------------------------------------------------------------------------
revoke execute on all functions in schema app from public;

grant execute on function
  app.current_aal(),
  app.tenant_ids_with_permission(text),
  app.my_permissions(uuid),
  app.is_platform_admin(),
  app.portal_customer_ids(),
  app.shares_tenant_with(uuid),
  app.accept_invitation(text),
  app.set_active_tenant(uuid)
to authenticated, service_role;
