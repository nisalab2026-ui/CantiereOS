-- =============================================================================
-- CantiereOS — Commesse e cantieri (ADR-014, docs/DATABASE.md)
-- -----------------------------------------------------------------------------
-- projects: la commessa, il lavoro concordato con un cliente (unità di costo e
-- ricavo). project_sites: i cantieri della commessa, cioè i luoghi dove si
-- lavora (collegati a una sede del cliente oppure con indirizzo proprio).
-- project_financials: importi della commessa, in una tabella a parte perché li
-- vede solo chi ha projects.finance (RLS non nasconde singole colonne).
-- Attività, documenti e moduli possono indicare la commessa (colonna nuova,
-- facoltativa): nessun dato esistente viene modificato.
-- =============================================================================

create table public.projects (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenants (id) on delete restrict,
  code                 text not null check (code ~ '^[A-Za-z0-9][A-Za-z0-9./_-]{0,29}$'),
  name                 text not null check (char_length(name) between 1 and 200),
  customer_id          uuid not null,
  kind                 text not null default 'lump_sum'
                         check (kind in ('lump_sum', 'measured', 'time_materials', 'maintenance', 'other')),
  status               text not null default 'active'
                         check (status in ('quote', 'active', 'suspended', 'completed', 'cancelled')),
  start_date           date,
  end_date             date,
  manager_employee_id  uuid,
  description          text check (description is null or char_length(description) <= 4000),
  closed_at            timestamptz,
  created_by           uuid references public.users (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz,
  constraint projects_tenant_id_id_key unique (tenant_id, id),
  constraint projects_dates_chk check (end_date is null or start_date is null or end_date >= start_date),
  constraint projects_customer_fk foreign key (tenant_id, customer_id)
    references public.customers (tenant_id, id) on delete restrict,
  constraint projects_manager_fk foreign key (tenant_id, manager_employee_id)
    references public.employees (tenant_id, id) on delete restrict
);

comment on table public.projects is
  'Commesse: lavori concordati con un cliente. Unità di costo e ricavo (glossario: project).';

create unique index projects_code_key on public.projects (tenant_id, lower(code)) where deleted_at is null;
create index projects_customer_idx on public.projects (tenant_id, customer_id) where deleted_at is null;
create index projects_status_idx on public.projects (tenant_id, status) where deleted_at is null;
create index projects_name_trgm_idx on public.projects using gin (lower(name) extensions.gin_trgm_ops);

-- Codice automatico (es. 2026-001) se non indicato; data di chiusura decisa dal database.
create or replace function app.project_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_year text := to_char(current_date, 'YYYY');
  v_next integer;
begin
  if tg_op = 'INSERT' and (new.code is null or new.code = '') then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('projects:' || new.tenant_id::text, 0));
    select coalesce(max(substring(p.code from '^' || v_year || '-([0-9]{1,6})$')::integer), 0) + 1
      into v_next
      from public.projects p
     where p.tenant_id = new.tenant_id and p.code ~ ('^' || v_year || '-[0-9]{1,6}$');
    new.code := v_year || '-' || lpad(v_next::text, 3, '0');
  end if;
  if new.status in ('completed', 'cancelled') then
    if tg_op = 'INSERT' or old.status not in ('completed', 'cancelled') then
      new.closed_at := now();
    else
      new.closed_at := old.closed_at;
    end if;
  else
    new.closed_at := null;
  end if;
  return new;
end;
$$;

create trigger projects_guard
  before insert or update on public.projects
  for each row execute function app.project_guard();

select app.attach_tenant_table_triggers('public.projects');
select app.grant_tenant_table('public.projects');
select app.create_tenant_policies('public.projects', 'projects.read', 'projects.write', 'projects.delete');

-- -----------------------------------------------------------------------------
-- Cantieri della commessa
-- -----------------------------------------------------------------------------
create table public.project_sites (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants (id) on delete restrict,
  project_id        uuid not null,
  name              text not null check (char_length(name) between 1 and 200),
  customer_site_id  uuid,
  address_line      text check (address_line is null or char_length(address_line) between 1 and 300),
  postal_code       text check (postal_code is null or postal_code ~ '^[0-9]{5}$'),
  city              text check (city is null or char_length(city) between 1 and 120),
  province          text check (province is null or province ~ '^[A-Z]{2}$'),
  status            text not null default 'active' check (status in ('planned', 'active', 'suspended', 'closed')),
  start_date        date,
  end_date          date,
  access_notes      text check (access_notes is null or char_length(access_notes) <= 2000),
  safety_notes      text check (safety_notes is null or char_length(safety_notes) <= 2000),
  created_by        uuid references public.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  constraint project_sites_tenant_id_id_key unique (tenant_id, id),
  constraint project_sites_dates_chk check (end_date is null or start_date is null or end_date >= start_date),
  -- un cantiere ha un indirizzo: quello della sede del cliente oppure il proprio
  constraint project_sites_address_chk check (
    customer_site_id is not null or (address_line is not null and city is not null)),
  constraint project_sites_project_fk foreign key (tenant_id, project_id)
    references public.projects (tenant_id, id) on delete restrict,
  constraint project_sites_customer_site_fk foreign key (tenant_id, customer_site_id)
    references public.customer_sites (tenant_id, id) on delete restrict
);

comment on table public.project_sites is
  'Cantieri di una commessa: dove si lavora. Sede del cliente collegata oppure indirizzo proprio.';

create index project_sites_project_idx on public.project_sites (tenant_id, project_id) where deleted_at is null;
create index project_sites_customer_site_idx on public.project_sites (tenant_id, customer_site_id)
  where customer_site_id is not null;

-- La sede collegata deve essere del cliente della commessa; la commessa non cambia.
create or replace function app.project_site_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.project_id <> old.project_id then
    raise exception 'Un cantiere non cambia commessa' using errcode = '42501';
  end if;
  if new.customer_site_id is not null and not exists (
       select 1 from public.customer_sites cs
         join public.projects p on p.tenant_id = cs.tenant_id and p.customer_id = cs.customer_id
        where cs.tenant_id = new.tenant_id and cs.id = new.customer_site_id and p.id = new.project_id) then
    raise exception 'La sede non appartiene al cliente della commessa' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger project_sites_guard
  before insert or update on public.project_sites
  for each row execute function app.project_site_guard();

select app.attach_tenant_table_triggers('public.project_sites');
select app.grant_tenant_table('public.project_sites');
select app.create_tenant_policies('public.project_sites', 'projects.read', 'projects.write', 'projects.delete');

-- Il cliente di una commessa non cambia se ha cantieri su sedi del cliente.
create or replace function app.project_customer_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.customer_id <> old.customer_id and exists (
       select 1 from public.project_sites s
        where s.tenant_id = new.tenant_id and s.project_id = new.id
          and s.customer_site_id is not null and s.deleted_at is null) then
    raise exception 'La commessa ha cantieri su sedi del cliente: toglili prima di cambiare cliente'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger projects_customer_guard
  before update of customer_id on public.projects
  for each row execute function app.project_customer_guard();

-- -----------------------------------------------------------------------------
-- Importi della commessa (solo projects.finance)
-- -----------------------------------------------------------------------------
create table public.project_financials (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references public.tenants (id) on delete restrict,
  project_id             uuid not null,
  contract_amount_cents  bigint check (contract_amount_cents is null
                           or contract_amount_cents between 0 and 100000000000),
  budget_cost_cents      bigint check (budget_cost_cents is null
                           or budget_cost_cents between 0 and 100000000000),
  currency               text not null default 'EUR' check (currency = 'EUR'),
  notes                  text check (notes is null or char_length(notes) <= 2000),
  created_by             uuid references public.users (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint project_financials_tenant_id_id_key unique (tenant_id, id),
  constraint project_financials_project_key unique (tenant_id, project_id),
  constraint project_financials_project_fk foreign key (tenant_id, project_id)
    references public.projects (tenant_id, id) on delete restrict
);

comment on table public.project_financials is
  'Importo concordato e budget di costo della commessa, in centesimi. Visibili solo con projects.finance.';

select app.attach_tenant_table_triggers('public.project_financials');
select app.grant_tenant_table('public.project_financials');
select app.create_tenant_policies('public.project_financials', 'projects.finance', 'projects.finance', 'projects.finance');

-- -----------------------------------------------------------------------------
-- Collegamenti facoltativi: attività, documenti e moduli di una commessa
-- -----------------------------------------------------------------------------
alter table public.tasks add column project_id uuid;
alter table public.tasks add constraint tasks_project_fk foreign key (tenant_id, project_id)
  references public.projects (tenant_id, id) on delete restrict;
create index tasks_project_idx on public.tasks (tenant_id, project_id) where project_id is not null;

alter table public.documents add column project_id uuid;
alter table public.documents add constraint documents_project_fk foreign key (tenant_id, project_id)
  references public.projects (tenant_id, id) on delete restrict;
create index documents_project_idx on public.documents (tenant_id, project_id) where project_id is not null;

alter table public.form_submissions add column project_id uuid;
alter table public.form_submissions add constraint form_submissions_project_fk foreign key (tenant_id, project_id)
  references public.projects (tenant_id, id) on delete restrict;
create index form_submissions_project_idx on public.form_submissions (tenant_id, project_id)
  where project_id is not null;

-- colonne nuove: le tabelle hanno grant per colonna, quindi vanno concesse esplicitamente
grant insert (project_id), update (project_id) on public.tasks to authenticated;
grant insert (project_id), update (project_id) on public.documents to authenticated;
grant insert (project_id), update (project_id) on public.form_submissions to authenticated;

-- Un modulo chiuso non cambia commessa; la commessa deve essere dello stesso cliente.
create or replace function app.form_submission_project_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.status = 'completed' and new.status = 'completed'
     and new.project_id is distinct from old.project_id then
    raise exception 'Il modulo è chiuso: riaprilo per modificarlo' using errcode = '42501';
  end if;
  if new.project_id is not null and new.customer_id is not null and not exists (
       select 1 from public.projects p
        where p.tenant_id = new.tenant_id and p.id = new.project_id and p.customer_id = new.customer_id) then
    raise exception 'La commessa non è di questo cliente' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger form_submissions_project_guard
  before insert or update on public.form_submissions
  for each row execute function app.form_submission_project_guard();

-- -----------------------------------------------------------------------------
-- Permessi
-- -----------------------------------------------------------------------------
insert into public.permissions (key, description) values
  ('projects.read',    'Vedere commesse e cantieri'),
  ('projects.write',   'Creare e modificare commesse e cantieri'),
  ('projects.finance', 'Vedere e modificare importi, costi e margini delle commesse'),
  ('projects.delete',  'Eliminare commesse e cantieri');
update public.permissions set requires_mfa = true where key in ('projects.delete');

select app.grant_system_permissions('owner',
  array['projects.read','projects.write','projects.finance','projects.delete']);
select app.grant_system_permissions('admin',
  array['projects.read','projects.write','projects.finance','projects.delete']);
select app.grant_system_permissions('back_office',        array['projects.read','projects.write','projects.finance']);
select app.grant_system_permissions('operations_manager', array['projects.read','projects.write']);
select app.grant_system_permissions('site_manager',       array['projects.read']);
select app.grant_system_permissions('technician',         array['projects.read']);
select app.grant_system_permissions('viewer',             array['projects.read']);

-- -----------------------------------------------------------------------------
-- Cronologia: la commessa mostra anche cantieri, importi (con permesso),
-- attività, documenti e moduli collegati.
-- -----------------------------------------------------------------------------
create or replace function app.record_history(p_table text, p_record_id uuid, p_limit integer default 200)
returns table (
  id bigint,
  created_at timestamptz,
  actor_user_id uuid,
  actor_name text,
  action text,
  table_name text,
  record_id uuid,
  old_data jsonb,
  new_data jsonb,
  changed_fields text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_perm text;
  v_tenant uuid;
  v_fk text;
  v_related boolean;
  v_docs boolean;
  v_tasks boolean;
  v_comments boolean;
  v_payments boolean;
  v_comms boolean;
  v_forms boolean;
begin
  v_perm := case p_table
    when 'customers' then 'customers.read'
    when 'suppliers' then 'suppliers.read'
    when 'employees' then 'employees.read'
    when 'teams'     then 'teams.read'
    when 'deadlines' then 'deadlines.read'
    when 'documents' then 'documents.read'
    when 'tasks'     then 'tasks.read'
    when 'payments'  then 'payments.read'
    when 'communications' then 'communications.read'
    when 'form_submissions' then 'forms.read'
    when 'form_templates' then 'forms.read'
    when 'projects' then 'projects.read'
  end;
  if v_perm is null then
    raise exception 'unsupported table' using errcode = '22023';
  end if;
  v_fk := case p_table
    when 'customers' then 'customer_id'
    when 'suppliers' then 'supplier_id'
    when 'employees' then 'employee_id'
    when 'teams'     then 'team_id'
    when 'projects'  then 'project_id'
  end;

  select a.tenant_id into v_tenant
  from public.audit_log a
  where a.table_name = p_table and a.record_id = p_record_id
  order by a.id
  limit 1;

  if v_tenant is null or v_tenant not in (select app.tenant_ids_with_permission(v_perm)) then
    return;
  end if;

  -- un documento riservato non rivela la propria cronologia senza il permesso dedicato
  if p_table = 'documents'
     and exists (select 1 from public.documents d
                  where d.tenant_id = v_tenant and d.id = p_record_id and d.is_confidential)
     and v_tenant not in (select app.tenant_ids_with_permission('documents.confidential')) then
    return;
  end if;

  v_related := v_fk is not null
    and v_tenant in (select app.tenant_ids_with_permission('deadlines.read'));
  v_docs := v_fk is not null
    and v_tenant in (select app.tenant_ids_with_permission('documents.read'));
  v_tasks := v_fk is not null
    and v_tenant in (select app.tenant_ids_with_permission('tasks.read'));
  v_comments := v_tenant in (select app.tenant_ids_with_permission('comments.read'));
  v_payments := v_fk is not null
    and v_tenant in (select app.tenant_ids_with_permission('payments.read'));
  v_comms := v_fk is not null
    and v_tenant in (select app.tenant_ids_with_permission('communications.read'));
  v_forms := v_fk in ('customer_id', 'project_id')
    and v_tenant in (select app.tenant_ids_with_permission('forms.read'));

  return query
    select a.id, a.created_at, a.actor_user_id,
           coalesce(u.full_name, u.email)::text,
           a.action, a.table_name, a.record_id, a.old_data, a.new_data, a.changed_fields
    from public.audit_log a
    left join public.users u on u.id = a.actor_user_id
    where a.tenant_id = v_tenant
      and (
        (a.table_name = p_table and a.record_id = p_record_id)
        or (v_related and a.table_name = 'deadlines'
            and (coalesce(a.new_data, a.old_data) ->> v_fk)::uuid = p_record_id)
        or (v_docs and a.table_name = 'documents'
            and (coalesce(a.new_data, a.old_data) ->> v_fk)::uuid = p_record_id
            and (not coalesce((coalesce(a.new_data, a.old_data) ->> 'is_confidential')::boolean, false)
                 or v_tenant in (select app.tenant_ids_with_permission('documents.confidential'))))
        or (v_tasks and a.table_name = 'tasks'
            and (coalesce(a.new_data, a.old_data) ->> v_fk)::uuid = p_record_id)
        or (v_payments and a.table_name = 'payments'
            and (coalesce(a.new_data, a.old_data) ->> v_fk)::uuid = p_record_id)
        or (v_comms and a.table_name = 'communications'
            and (coalesce(a.new_data, a.old_data) ->> v_fk)::uuid = p_record_id)
        or (v_forms and a.table_name = 'form_submissions'
            and (coalesce(a.new_data, a.old_data) ->> v_fk)::uuid = p_record_id)
        or (p_table = 'projects' and a.table_name = 'project_sites'
            and (coalesce(a.new_data, a.old_data) ->> 'project_id')::uuid = p_record_id)
        or (p_table = 'projects' and a.table_name = 'project_financials'
            and (coalesce(a.new_data, a.old_data) ->> 'project_id')::uuid = p_record_id
            and v_tenant in (select app.tenant_ids_with_permission('projects.finance')))
        or (p_table = 'form_templates' and a.table_name = 'form_template_versions'
            and (coalesce(a.new_data, a.old_data) ->> 'template_id')::uuid = p_record_id)
        or (v_comments and a.table_name = 'comments'
            and coalesce(a.new_data, a.old_data) ->> 'subject_table' = p_table
            and (coalesce(a.new_data, a.old_data) ->> 'subject_id')::uuid = p_record_id)
        or (p_table = 'documents' and a.table_name in ('document_versions', 'document_downloads')
            and (coalesce(a.new_data, a.old_data) ->> 'document_id')::uuid = p_record_id)
      )
    order by a.id desc
    limit least(greatest(p_limit, 1), 500);
end;
$$;


revoke execute on all functions in schema app from public;
