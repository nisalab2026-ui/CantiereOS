-- =============================================================================
-- CantiereOS — Migrazione 0003: personale
-- employees, teams, team_members
--
-- Dati HR sensibili (codice fiscale, IBAN, costo orario, documenti) NON stanno
-- in employees, che è leggibile anche dai tecnici: andranno in una tabella
-- separata con permesso dedicato (employees.hr) quando servirà.
-- =============================================================================

create type public.employment_type as enum ('employee', 'contractor', 'temporary', 'intern');

-- -----------------------------------------------------------------------------
-- Dipendenti (con o senza account utente)
-- -----------------------------------------------------------------------------
create table public.employees (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id) on delete restrict,
  -- se valorizzato, l'utente DEVE essere membro della stessa azienda
  user_id          uuid,
  employee_code    text check (employee_code is null or employee_code ~ '^[A-Za-z0-9._/-]{1,30}$'),
  first_name       text not null check (char_length(first_name) between 1 and 100),
  last_name        text not null check (char_length(last_name) between 1 and 100),
  email            text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone            text check (phone is null or char_length(phone) <= 40),
  job_title        text check (job_title is null or char_length(job_title) <= 100),
  employment_type  public.employment_type not null default 'employee',
  hire_date        date,
  termination_date date,
  is_active        boolean not null default true,
  notes            text check (notes is null or char_length(notes) <= 2000),
  created_by       uuid references public.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  constraint employees_dates_chk check (
    termination_date is null or hire_date is null or termination_date >= hire_date
  ),
  constraint employees_membership_fk foreign key (tenant_id, user_id)
    references public.memberships (tenant_id, user_id) on delete set null (user_id),
  constraint employees_tenant_id_id_key unique (tenant_id, id)
);
create unique index employees_tenant_user_key
  on public.employees (tenant_id, user_id) where user_id is not null;
create unique index employees_tenant_code_key
  on public.employees (tenant_id, employee_code) where employee_code is not null and deleted_at is null;
create index employees_tenant_name_idx
  on public.employees (tenant_id, lower(last_name), lower(first_name)) where deleted_at is null;

-- -----------------------------------------------------------------------------
-- Squadre
-- -----------------------------------------------------------------------------
create table public.teams (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants (id) on delete restrict,
  name                text not null check (char_length(name) between 1 and 100),
  description         text check (description is null or char_length(description) <= 1000),
  color               text check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  leader_employee_id  uuid,
  is_active           boolean not null default true,
  created_by          uuid references public.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  constraint teams_leader_fk foreign key (tenant_id, leader_employee_id)
    references public.employees (tenant_id, id) on delete set null (leader_employee_id),
  constraint teams_tenant_id_id_key unique (tenant_id, id)
);
create unique index teams_tenant_name_key
  on public.teams (tenant_id, lower(name)) where deleted_at is null;
create index teams_leader_idx
  on public.teams (tenant_id, leader_employee_id) where leader_employee_id is not null;

create table public.team_members (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete restrict,
  team_id      uuid not null,
  employee_id  uuid not null,
  joined_on    date not null default current_date,
  created_by   uuid references public.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint team_members_team_fk foreign key (tenant_id, team_id)
    references public.teams (tenant_id, id) on delete cascade,
  constraint team_members_employee_fk foreign key (tenant_id, employee_id)
    references public.employees (tenant_id, id) on delete cascade,
  constraint team_members_team_employee_key unique (team_id, employee_id),
  constraint team_members_tenant_id_id_key unique (tenant_id, id)
);
create index team_members_employee_idx on public.team_members (tenant_id, employee_id);

-- -----------------------------------------------------------------------------
-- Permessi
-- -----------------------------------------------------------------------------
insert into public.permissions (key, description) values
  ('employees.read',   'Vedere i dipendenti'),
  ('employees.write',  'Creare e modificare i dipendenti'),
  ('employees.delete', 'Eliminare definitivamente i dipendenti'),
  ('teams.read',       'Vedere le squadre'),
  ('teams.write',      'Creare e modificare le squadre e i loro membri'),
  ('teams.delete',     'Eliminare definitivamente le squadre');

select app.grant_system_permissions('owner',      array['employees.read','employees.write','employees.delete','teams.read','teams.write','teams.delete']);
select app.grant_system_permissions('admin',      array['employees.read','employees.write','employees.delete','teams.read','teams.write','teams.delete']);
select app.grant_system_permissions('manager',    array['employees.read','employees.write','teams.read','teams.write']);
select app.grant_system_permissions('office',     array['employees.read','teams.read']);
select app.grant_system_permissions('technician', array['employees.read','teams.read']);
select app.grant_system_permissions('viewer',     array['employees.read','teams.read']);

-- -----------------------------------------------------------------------------
-- Trigger, privilegi, RLS
-- -----------------------------------------------------------------------------
select app.attach_tenant_table_triggers('public.employees');
select app.attach_tenant_table_triggers('public.teams');
select app.attach_tenant_table_triggers('public.team_members');

select app.grant_tenant_table('public.employees');
select app.grant_tenant_table('public.teams');
select app.grant_tenant_table('public.team_members');

select app.create_tenant_policies('public.employees', 'employees.read', 'employees.write', 'employees.delete');
select app.create_tenant_policies('public.teams', 'teams.read', 'teams.write', 'teams.delete');
-- togliere un membro da una squadra è una modifica della squadra
select app.create_tenant_policies('public.team_members', 'teams.read', 'teams.write', 'teams.write');

revoke execute on all functions in schema app from public;
