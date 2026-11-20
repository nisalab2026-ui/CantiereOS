-- =============================================================================
-- CantiereOS — Rapportini di lavoro (ADR-015, docs/DATABASE.md)
-- -----------------------------------------------------------------------------
-- work_reports: il rapportino di una giornata su una commessa (e un cantiere).
-- work_report_labor: ore per persona. work_report_items: materiali, mezzi, altro.
-- work_report_files: foto (flusso verificato come nei moduli).
-- employee_cost_rates e work_report_item_costs: costi, visibili solo con
-- projects.finance (RLS non nasconde singole colonne, quindi tabelle a parte).
-- Solo i rapportini approvati entrano in ore e costi della commessa.
-- =============================================================================

create table public.work_reports (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references public.tenants (id) on delete restrict,
  number                 text not null check (number ~ '^[0-9]{4}-[0-9]{4,6}$'),
  project_id             uuid not null,
  project_site_id        uuid,
  report_date            date not null,
  status                 text not null default 'draft'
                           check (status in ('draft', 'submitted', 'approved', 'invoiced')),
  work_description       text check (work_description is null or char_length(work_description) <= 8000),
  notes                  text check (notes is null or char_length(notes) <= 4000),
  customer_signature     text check (customer_signature is null or (
                           customer_signature like 'data:image/png;base64,%'
                           and char_length(customer_signature) <= 200000)),
  customer_signer_name   text check (customer_signer_name is null
                           or char_length(customer_signer_name) between 1 and 120),
  customer_signed_at     timestamptz,
  submitted_at           timestamptz,
  submitted_by           uuid references public.users (id) on delete set null,
  approved_at            timestamptz,
  approved_by            uuid references public.users (id) on delete set null,
  returned_reason        text check (returned_reason is null or char_length(returned_reason) <= 1000),
  invoiced_at            timestamptz,
  created_by             uuid references public.users (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  deleted_at             timestamptz,
  constraint work_reports_tenant_id_id_key unique (tenant_id, id),
  constraint work_reports_signature_chk check (
    (customer_signature is null) = (customer_signer_name is null)),
  constraint work_reports_project_fk foreign key (tenant_id, project_id)
    references public.projects (tenant_id, id) on delete restrict,
  constraint work_reports_site_fk foreign key (tenant_id, project_site_id)
    references public.project_sites (tenant_id, id) on delete restrict
);

comment on table public.work_reports is
  'Rapportini di lavoro: giornata su una commessa, con ore, voci, foto e firma del cliente.';

create unique index work_reports_number_key on public.work_reports (tenant_id, number);
create index work_reports_project_idx on public.work_reports (tenant_id, project_id, report_date desc)
  where deleted_at is null;
create index work_reports_status_idx on public.work_reports (tenant_id, status, report_date desc)
  where deleted_at is null;
create index work_reports_author_idx on public.work_reports (tenant_id, created_by)
  where deleted_at is null;

-- Chi può modificare il contenuto: chi approva, oppure l'autore (servizio: sempre).
create or replace function app.work_report_editable_by_me(p_tenant uuid, p_author uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is null
      or app.has_permission(p_tenant, 'work_reports.approve')
      or (p_author is not null and p_author = auth.uid());
$$;

create or replace function app.work_report_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year text;
  v_next integer;
  v_project_status text;
  v_approver boolean := auth.uid() is null or app.has_permission(new.tenant_id, 'work_reports.approve');
  v_content constant text[] := array['project_id', 'project_site_id', 'report_date', 'work_description',
    'notes', 'customer_signature', 'customer_signer_name'];
  v_changed boolean := false;
  k text;
begin
  -- la commessa deve esistere e non essere chiusa; il cantiere deve essere suo
  if tg_op = 'INSERT' or new.project_id <> old.project_id
     or new.project_site_id is distinct from old.project_site_id then
    select p.status into v_project_status
      from public.projects p
     where p.tenant_id = new.tenant_id and p.id = new.project_id and p.deleted_at is null;
    if v_project_status is null then
      raise exception 'Commessa non trovata' using errcode = '23503';
    end if;
    if v_project_status in ('completed', 'cancelled') then
      raise exception 'La commessa è chiusa: riaprila per aggiungere rapportini' using errcode = '23514';
    end if;
    if new.project_site_id is not null and not exists (
         select 1 from public.project_sites s
          where s.tenant_id = new.tenant_id and s.id = new.project_site_id
            and s.project_id = new.project_id and s.deleted_at is null) then
      raise exception 'Il cantiere non è di questa commessa' using errcode = '23514';
    end if;
  end if;

  if tg_op = 'INSERT' then
    v_year := to_char(coalesce(new.report_date, current_date), 'YYYY');
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('work_reports:' || new.tenant_id::text || ':' || v_year, 0));
    select coalesce(max(substring(w.number from '^' || v_year || '-([0-9]{4,6})$')::integer), 0) + 1
      into v_next
      from public.work_reports w
     where w.tenant_id = new.tenant_id and w.number like v_year || '-%';
    new.number := v_year || '-' || lpad(v_next::text, 4, '0');
    new.status := 'draft';
    new.submitted_at := null; new.submitted_by := null;
    new.approved_at := null; new.approved_by := null;
    new.invoiced_at := null; new.returned_reason := null;
    new.customer_signed_at := case when new.customer_signature is not null then now() end;
    return new;
  end if;

  if new.number <> old.number then
    raise exception 'Il numero del rapportino non cambia' using errcode = '42501';
  end if;
  if old.status = 'invoiced' then
    raise exception 'Il rapportino è fatturato: non si modifica' using errcode = '42501';
  end if;
  if not app.work_report_editable_by_me(new.tenant_id, old.created_by) then
    raise exception 'Puoi modificare solo i tuoi rapportini' using errcode = '42501';
  end if;

  foreach k in array v_content loop
    if (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k) then
      v_changed := true;
    end if;
  end loop;
  if v_changed and (old.status <> 'draft' or new.status <> 'draft') then
    raise exception 'Il rapportino è inviato: si modifica solo in bozza' using errcode = '42501';
  end if;
  if new.customer_signature is distinct from old.customer_signature
     or new.customer_signer_name is distinct from old.customer_signer_name then
    new.customer_signed_at := case when new.customer_signature is not null then now() end;
  else
    new.customer_signed_at := old.customer_signed_at;
  end if;

  -- passaggi di stato consentiti e chi può farli
  if new.status is distinct from old.status then
    if old.status = 'draft' and new.status = 'submitted' then
      new.submitted_at := now(); new.submitted_by := auth.uid(); new.returned_reason := null;
    elsif old.status = 'submitted' and new.status = 'draft' then
      -- ritiro dell'autore oppure rinvio di chi approva (con motivo)
      if not v_approver and old.created_by is distinct from auth.uid() then
        raise exception 'Permesso mancante' using errcode = '42501';
      end if;
      new.submitted_at := null; new.submitted_by := null;
    elsif old.status = 'submitted' and new.status = 'approved' then
      if not v_approver then
        raise exception 'Serve il permesso di approvare i rapportini' using errcode = '42501';
      end if;
      new.approved_at := now(); new.approved_by := auth.uid(); new.returned_reason := null;
    elsif old.status = 'approved' and new.status = 'draft' then
      if not v_approver then
        raise exception 'Serve il permesso di approvare i rapportini' using errcode = '42501';
      end if;
      new.submitted_at := null; new.submitted_by := null;
      new.approved_at := null; new.approved_by := null;
    elsif old.status = 'approved' and new.status = 'invoiced' then
      if not v_approver then
        raise exception 'Serve il permesso di approvare i rapportini' using errcode = '42501';
      end if;
      new.invoiced_at := now();
    else
      raise exception 'Passaggio di stato non consentito' using errcode = '42501';
    end if;
  else
    new.submitted_at := old.submitted_at; new.submitted_by := old.submitted_by;
    new.approved_at := old.approved_at; new.approved_by := old.approved_by;
    new.invoiced_at := old.invoiced_at;
    if new.returned_reason is distinct from old.returned_reason and new.status <> 'draft' then
      new.returned_reason := old.returned_reason;
    end if;
  end if;
  return new;
end;
$$;

create trigger work_reports_guard
  before insert or update on public.work_reports
  for each row execute function app.work_report_guard();

select app.attach_tenant_table_triggers('public.work_reports');
select app.grant_tenant_table('public.work_reports');
select app.create_tenant_policies('public.work_reports', 'work_reports.read', 'work_reports.write', 'work_reports.delete');
revoke delete on public.work_reports from authenticated;

-- -----------------------------------------------------------------------------
-- Righe: si cambiano solo con il rapportino in bozza, da chi può modificarlo
-- -----------------------------------------------------------------------------
create or replace function app.work_report_line_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_report uuid;
  v_tenant uuid;
begin
  v_tenant := coalesce(new.tenant_id, old.tenant_id);
  v_report := case when tg_op = 'DELETE' then old.report_id else new.report_id end;
  if tg_op = 'UPDATE' and new.report_id <> old.report_id then
    raise exception 'Una riga non cambia rapportino' using errcode = '42501';
  end if;
  select w.status, w.created_by, w.deleted_at into v_row
    from public.work_reports w where w.tenant_id = v_tenant and w.id = v_report;
  if not found or v_row.deleted_at is not null then
    raise exception 'Rapportino non trovato' using errcode = '23503';
  end if;
  if v_row.status <> 'draft' then
    raise exception 'Il rapportino è inviato: si modifica solo in bozza' using errcode = '42501';
  end if;
  if not app.work_report_editable_by_me(v_tenant, v_row.created_by) then
    raise exception 'Puoi modificare solo i tuoi rapportini' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create table public.work_report_labor (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete restrict,
  report_id      uuid not null,
  employee_id    uuid not null,
  start_time     time,
  end_time       time,
  break_minutes  integer not null default 0 check (break_minutes between 0 and 600),
  hours          numeric(5,2) not null check (hours > 0 and hours <= 24),
  notes          text check (notes is null or char_length(notes) <= 500),
  created_by     uuid references public.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint work_report_labor_tenant_id_id_key unique (tenant_id, id),
  constraint work_report_labor_times_chk check ((start_time is null) = (end_time is null)),
  constraint work_report_labor_report_fk foreign key (tenant_id, report_id)
    references public.work_reports (tenant_id, id) on delete restrict,
  constraint work_report_labor_employee_fk foreign key (tenant_id, employee_id)
    references public.employees (tenant_id, id) on delete restrict
);
create index work_report_labor_report_idx on public.work_report_labor (tenant_id, report_id);
create index work_report_labor_employee_idx on public.work_report_labor (tenant_id, employee_id);

-- Con inizio e fine le ore le calcola il database (fine dopo l'inizio, stessa giornata).
create or replace function app.work_report_labor_hours()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_minutes integer;
begin
  if new.start_time is not null then
    if new.end_time <= new.start_time then
      raise exception 'La fine deve essere dopo l''inizio' using errcode = '23514';
    end if;
    v_minutes := (extract(epoch from (new.end_time - new.start_time)) / 60)::integer - new.break_minutes;
    if v_minutes <= 0 then
      raise exception 'La pausa supera le ore lavorate' using errcode = '23514';
    end if;
    new.hours := round(v_minutes / 60.0, 2);
  end if;
  return new;
end;
$$;

create trigger work_report_labor_hours
  before insert or update on public.work_report_labor
  for each row execute function app.work_report_labor_hours();
create trigger work_report_labor_guard
  before insert or update or delete on public.work_report_labor
  for each row execute function app.work_report_line_guard();

select app.attach_tenant_table_triggers('public.work_report_labor');
select app.grant_tenant_table('public.work_report_labor');
select app.create_tenant_policies('public.work_report_labor', 'work_reports.read', 'work_reports.write', 'work_reports.write');

create table public.work_report_items (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete restrict,
  report_id    uuid not null,
  kind         text not null check (kind in ('material', 'equipment', 'other')),
  description  text not null check (char_length(description) between 1 and 300),
  quantity     numeric(12,3) not null check (quantity > 0 and quantity <= 1000000),
  unit         text check (unit is null or char_length(unit) between 1 and 20),
  notes        text check (notes is null or char_length(notes) <= 500),
  created_by   uuid references public.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint work_report_items_tenant_id_id_key unique (tenant_id, id),
  constraint work_report_items_report_fk foreign key (tenant_id, report_id)
    references public.work_reports (tenant_id, id) on delete restrict
);
create index work_report_items_report_idx on public.work_report_items (tenant_id, report_id);

create trigger work_report_items_guard
  before insert or update or delete on public.work_report_items
  for each row execute function app.work_report_line_guard();

select app.attach_tenant_table_triggers('public.work_report_items');
select app.grant_tenant_table('public.work_report_items');
select app.create_tenant_policies('public.work_report_items', 'work_reports.read', 'work_reports.write', 'work_reports.write');

-- -----------------------------------------------------------------------------
-- Costi (solo projects.finance)
-- -----------------------------------------------------------------------------
create table public.work_report_item_costs (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id) on delete restrict,
  item_id          uuid not null,
  unit_cost_cents  bigint not null check (unit_cost_cents between 0 and 10000000000),
  created_by       uuid references public.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint work_report_item_costs_tenant_id_id_key unique (tenant_id, id),
  constraint work_report_item_costs_item_key unique (tenant_id, item_id),
  constraint work_report_item_costs_item_fk foreign key (tenant_id, item_id)
    references public.work_report_items (tenant_id, id) on delete cascade
);

comment on table public.work_report_item_costs is
  'Costo unitario delle voci dei rapportini, in centesimi. Solo projects.finance.';

-- Il prezzo si può indicare anche dopo l'approvazione, ma non su un rapportino fatturato.
create or replace function app.work_report_item_cost_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_tenant uuid := coalesce(new.tenant_id, old.tenant_id);
  v_item uuid := case when tg_op = 'DELETE' then old.item_id else new.item_id end;
begin
  if tg_op = 'UPDATE' and new.item_id <> old.item_id then
    raise exception 'Il costo non cambia voce' using errcode = '42501';
  end if;
  select w.status into v_status
    from public.work_report_items i
    join public.work_reports w on w.tenant_id = i.tenant_id and w.id = i.report_id
   where i.tenant_id = v_tenant and i.id = v_item;
  if v_status = 'invoiced' then
    raise exception 'Il rapportino è fatturato: non si modifica' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger work_report_item_costs_guard
  before insert or update or delete on public.work_report_item_costs
  for each row execute function app.work_report_item_cost_guard();

select app.attach_tenant_table_triggers('public.work_report_item_costs');
select app.grant_tenant_table('public.work_report_item_costs');
select app.create_tenant_policies('public.work_report_item_costs', 'projects.finance', 'projects.finance', 'projects.finance');

create table public.employee_cost_rates (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants (id) on delete restrict,
  employee_id        uuid not null,
  hourly_cost_cents  bigint not null check (hourly_cost_cents between 0 and 100000000),
  valid_from         date not null,
  notes              text check (notes is null or char_length(notes) <= 500),
  created_by         uuid references public.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint employee_cost_rates_tenant_id_id_key unique (tenant_id, id),
  constraint employee_cost_rates_from_key unique (tenant_id, employee_id, valid_from),
  constraint employee_cost_rates_employee_fk foreign key (tenant_id, employee_id)
    references public.employees (tenant_id, id) on delete restrict
);

comment on table public.employee_cost_rates is
  'Costo orario aziendale per persona, con data di inizio validità. Solo projects.finance.';

select app.attach_tenant_table_triggers('public.employee_cost_rates');
select app.grant_tenant_table('public.employee_cost_rates');
select app.create_tenant_policies('public.employee_cost_rates', 'projects.finance', 'projects.finance', 'projects.finance');

-- -----------------------------------------------------------------------------
-- Foto del rapportino (stesso flusso delle foto dei moduli)
-- -----------------------------------------------------------------------------
create table public.work_report_files (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete restrict,
  report_id      uuid not null,
  original_name  text not null check (char_length(original_name) between 1 and 255),
  mime_type      text check (mime_type is null or mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes     bigint check (size_bytes is null or size_bytes between 1 and 10485760),
  status         text not null default 'pending' check (status in ('pending', 'ready', 'rejected')),
  reject_reason  text check (reject_reason is null or char_length(reject_reason) <= 200),
  storage_key    text generated always as (tenant_id::text || '/' || report_id::text || '/' || id::text) stored,
  verified_at    timestamptz,
  created_by     uuid references public.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  constraint work_report_files_tenant_id_id_key unique (tenant_id, id),
  constraint work_report_files_report_fk foreign key (tenant_id, report_id)
    references public.work_reports (tenant_id, id) on delete restrict,
  constraint work_report_files_ready_chk check (
    status <> 'ready' or (mime_type is not null and size_bytes is not null and verified_at is not null))
);
create index work_report_files_report_idx on public.work_report_files (tenant_id, report_id, created_at);

create or replace function app.work_report_file_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
begin
  select w.status, w.created_by, w.deleted_at into v_row
    from public.work_reports w where w.tenant_id = new.tenant_id and w.id = new.report_id;
  if not found or v_row.deleted_at is not null then
    raise exception 'Rapportino non trovato' using errcode = '23503';
  end if;
  if v_row.status <> 'draft' then
    raise exception 'Il rapportino è inviato: le foto si cambiano solo in bozza' using errcode = '42501';
  end if;
  if not app.work_report_editable_by_me(new.tenant_id, v_row.created_by) then
    raise exception 'Puoi modificare solo i tuoi rapportini' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    new.status := 'pending'; new.mime_type := null; new.size_bytes := null;
    new.verified_at := null; new.reject_reason := null; new.deleted_at := null;
    return new;
  end if;
  if new.report_id <> old.report_id or new.original_name <> old.original_name
     or new.created_by is distinct from old.created_by or new.created_at <> old.created_at then
    raise exception 'Campi della foto non modificabili' using errcode = '42501';
  end if;
  if old.deleted_at is not null then
    raise exception 'Foto già rimossa' using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    if old.status <> 'pending' or new.status = 'pending' then
      raise exception 'Una foto verificata non si può modificare' using errcode = '42501';
    end if;
    new.verified_at := now();
  elsif new.mime_type is distinct from old.mime_type or new.size_bytes is distinct from old.size_bytes
        or new.reject_reason is distinct from old.reject_reason then
    raise exception 'Una foto verificata non si può modificare' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger work_report_files_guard
  before insert or update on public.work_report_files
  for each row execute function app.work_report_file_guard();

select app.attach_tenant_table_triggers('public.work_report_files');
select app.grant_tenant_table('public.work_report_files');
revoke delete on public.work_report_files from authenticated;
alter table public.work_report_files enable row level security;
create policy work_report_files_select on public.work_report_files for select to authenticated
  using (tenant_id in (select app.tenant_ids_with_permission('work_reports.read')));
create policy work_report_files_insert on public.work_report_files for insert to authenticated
  with check (tenant_id in (select app.tenant_ids_with_permission('work_reports.write')));
create policy work_report_files_update on public.work_report_files for update to authenticated
  using (tenant_id in (select app.tenant_ids_with_permission('work_reports.write')))
  with check (tenant_id in (select app.tenant_ids_with_permission('work_reports.write')));

-- -----------------------------------------------------------------------------
-- Permessi
-- -----------------------------------------------------------------------------
insert into public.permissions (key, description) values
  ('work_reports.read',    'Vedere i propri rapportini e quelli in cui si compare'),
  ('work_reports_all.read','Vedere i rapportini di tutta l''azienda'),
  ('work_reports.write',   'Compilare e inviare i propri rapportini'),
  ('work_reports.approve', 'Approvare, rimandare e modificare tutti i rapportini'),
  ('work_reports.delete',  'Eliminare i rapportini');
update public.permissions set requires_mfa = true where key in ('work_reports.delete');

select app.grant_system_permissions('owner',
  array['work_reports.read','work_reports_all.read','work_reports.write','work_reports.approve','work_reports.delete']);
select app.grant_system_permissions('admin',
  array['work_reports.read','work_reports_all.read','work_reports.write','work_reports.approve','work_reports.delete']);
select app.grant_system_permissions('operations_manager',
  array['work_reports.read','work_reports_all.read','work_reports.write','work_reports.approve']);
select app.grant_system_permissions('site_manager',
  array['work_reports.read','work_reports_all.read','work_reports.write','work_reports.approve']);
-- l'ufficio vede i rapportini (ore e costi) ma non li compila: li fa chi è in cantiere
select app.grant_system_permissions('back_office',  array['work_reports.read','work_reports_all.read']);
select app.grant_system_permissions('technician',   array['work_reports.read','work_reports.write']);
select app.grant_system_permissions('viewer',       array['work_reports.read','work_reports_all.read']);

-- -----------------------------------------------------------------------------
-- Visibilità per grado: chi ha solo work_reports.read (il tecnico in cantiere)
-- vede i rapportini che ha creato e quelli in cui compare tra le ore; chi ha
-- work_reports_all.read (responsabili, ufficio, titolare, lettore) li vede tutti.
-- Funzione security definer per evitare la ricorsione tra le policy.
-- -----------------------------------------------------------------------------
-- p_author: l'autore se il chiamante ha già la riga (policy di work_reports: serve
-- anche per INSERT ... RETURNING, quando la riga nuova non è ancora leggibile).
create or replace function app.work_report_visible(p_tenant uuid, p_report uuid, p_author uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_tenant in (select app.tenant_ids_with_permission('work_reports_all.read'))
      or (p_tenant in (select app.tenant_ids_with_permission('work_reports.read'))
          and (coalesce(p_author = auth.uid(), false)
               or exists (select 1 from public.work_reports w
                           where w.tenant_id = p_tenant and w.id = p_report
                             and w.created_by = auth.uid())
               or exists (select 1
                            from public.work_report_labor l
                            join public.employees e on e.tenant_id = l.tenant_id and e.id = l.employee_id
                           where l.tenant_id = p_tenant and l.report_id = p_report
                             and e.user_id = auth.uid())));
$$;
grant execute on function app.work_report_visible(uuid, uuid, uuid) to authenticated;

drop policy work_reports_select on public.work_reports;
create policy work_reports_select on public.work_reports for select to authenticated
  using (app.work_report_visible(tenant_id, id, created_by));
drop policy work_report_labor_select on public.work_report_labor;
create policy work_report_labor_select on public.work_report_labor for select to authenticated
  using (app.work_report_visible(tenant_id, report_id));
drop policy work_report_items_select on public.work_report_items;
create policy work_report_items_select on public.work_report_items for select to authenticated
  using (app.work_report_visible(tenant_id, report_id));
drop policy work_report_files_select on public.work_report_files;
create policy work_report_files_select on public.work_report_files for select to authenticated
  using (app.work_report_visible(tenant_id, report_id));

-- -----------------------------------------------------------------------------
-- Cronologia: rapportino con righe e foto; la commessa mostra i suoi rapportini
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
  v_reports boolean;
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
    when 'work_reports' then 'work_reports.read'
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

  -- un rapportino altrui non rivela la propria cronologia al tecnico
  if p_table = 'work_reports' and not app.work_report_visible(v_tenant, p_record_id) then
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
  -- nella cronologia della commessa i rapportini solo per chi li vede tutti
  v_reports := v_fk = 'project_id'
    and v_tenant in (select app.tenant_ids_with_permission('work_reports_all.read'));
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
        or (v_reports and a.table_name = 'work_reports'
            and (coalesce(a.new_data, a.old_data) ->> v_fk)::uuid = p_record_id)
        or (p_table = 'work_reports' and a.table_name in ('work_report_labor', 'work_report_items', 'work_report_files')
            and (coalesce(a.new_data, a.old_data) ->> 'report_id')::uuid = p_record_id)
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
