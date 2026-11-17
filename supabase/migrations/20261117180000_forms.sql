-- =============================================================================
-- Moduli compilabili (ADR-013, docs/DATABASE.md).
-- Modelli definiti dall'azienda (bozza + versioni immutabili) e compilazioni.
-- Solo tabelle e permessi nuovi; nessun dato esistente viene modificato.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Modelli
-- -----------------------------------------------------------------------------
create table public.form_templates (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants (id) on delete restrict,
  name              text not null check (char_length(name) between 1 and 200),
  description       text check (description is null or char_length(description) <= 2000),
  category          text not null default 'other'
                    check (category in ('inspection', 'checklist', 'report', 'safety', 'delivery', 'other')),
  draft_definition  jsonb not null default '{"sections": []}'::jsonb,
  current_version   integer check (current_version is null or current_version > 0),
  is_archived       boolean not null default false,
  library_key       text check (library_key is null or library_key ~ '^[a-z0-9-]{1,80}$'),
  created_by        uuid references public.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  constraint form_templates_tenant_id_id_key unique (tenant_id, id),
  constraint form_templates_definition_chk check (
    jsonb_typeof(draft_definition) = 'object' and pg_column_size(draft_definition) <= 262144)
);

comment on table public.form_templates is
  'Modelli di modulo dell''azienda: bozza modificabile; le versioni pubblicate sono in form_template_versions.';

create unique index form_templates_name_key on public.form_templates (tenant_id, lower(name))
  where deleted_at is null;
create index form_templates_name_trgm_idx on public.form_templates
  using gin (lower(name) extensions.gin_trgm_ops);

select app.attach_tenant_table_triggers('public.form_templates');
select app.grant_tenant_table('public.form_templates');
select app.create_tenant_policies('public.form_templates', 'forms.read', 'forms.manage', 'forms.delete');

-- -----------------------------------------------------------------------------
-- Versioni pubblicate (immutabili)
-- -----------------------------------------------------------------------------
create table public.form_template_versions (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete restrict,
  template_id   uuid not null,
  version       integer not null check (version > 0),
  name          text not null check (char_length(name) between 1 and 200),
  definition    jsonb not null,
  created_by    uuid references public.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint form_template_versions_tenant_id_id_key unique (tenant_id, id),
  constraint form_template_versions_version_key unique (template_id, version),
  constraint form_template_versions_definition_chk check (
    jsonb_typeof(definition) = 'object' and pg_column_size(definition) <= 262144),
  constraint form_template_versions_template_fk foreign key (tenant_id, template_id)
    references public.form_templates (tenant_id, id) on delete restrict
);

comment on table public.form_template_versions is
  'Versioni pubblicate di un modello: immutabili, ogni compilazione punta alla propria.';

create or replace function app.form_version_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Una versione pubblicata di un modello non si modifica né si elimina'
    using errcode = '42501';
end;
$$;

create trigger form_template_versions_immutable
  before update or delete on public.form_template_versions
  for each row execute function app.form_version_immutable();

select app.attach_tenant_table_triggers('public.form_template_versions');
select app.grant_tenant_table('public.form_template_versions');
select app.create_tenant_policies('public.form_template_versions', 'forms.read', 'forms.manage', 'forms.delete');

-- -----------------------------------------------------------------------------
-- Compilazioni
-- -----------------------------------------------------------------------------
create table public.form_submissions (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants (id) on delete restrict,
  template_id           uuid not null,
  template_version_id   uuid not null,
  title                 text not null check (char_length(title) between 1 and 200),
  subject_code          text check (subject_code is null or char_length(subject_code) between 1 and 80),
  status                text not null default 'draft' check (status in ('draft', 'completed')),
  data                  jsonb not null default '{}'::jsonb,
  customer_id           uuid,
  site_id               uuid,
  completed_at          timestamptz,
  completed_by          uuid references public.users (id) on delete set null,
  created_by            uuid references public.users (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz,
  constraint form_submissions_tenant_id_id_key unique (tenant_id, id),
  constraint form_submissions_data_chk check (
    jsonb_typeof(data) = 'object' and pg_column_size(data) <= 1048576),
  constraint form_submissions_completed_chk check ((status = 'completed') = (completed_at is not null)),
  constraint form_submissions_site_needs_customer_chk check (site_id is null or customer_id is not null),
  constraint form_submissions_template_fk foreign key (tenant_id, template_id)
    references public.form_templates (tenant_id, id) on delete restrict,
  constraint form_submissions_version_fk foreign key (tenant_id, template_version_id)
    references public.form_template_versions (tenant_id, id) on delete restrict,
  constraint form_submissions_customer_fk foreign key (tenant_id, customer_id)
    references public.customers (tenant_id, id) on delete restrict,
  constraint form_submissions_site_fk foreign key (tenant_id, site_id)
    references public.customer_sites (tenant_id, id) on delete restrict
);

comment on table public.form_submissions is
  'Moduli compilati: valori in data (jsonb) secondo la versione del modello; chiusi = non modificabili.';
comment on column public.form_submissions.subject_code is
  'Identificativo dell''oggetto controllato (es. n. impianto), per ritrovare la compilazione precedente.';

create index form_submissions_tenant_time_idx on public.form_submissions (tenant_id, updated_at desc)
  where deleted_at is null;
create index form_submissions_subject_idx on public.form_submissions (tenant_id, template_id, subject_code, completed_at desc)
  where deleted_at is null and subject_code is not null;
create index form_submissions_customer_idx on public.form_submissions (tenant_id, customer_id)
  where customer_id is not null;
create index form_submissions_title_trgm_idx on public.form_submissions
  using gin (lower(title) extensions.gin_trgm_ops);

-- Coerenza e blocco: la versione appartiene al modello, la sede al cliente,
-- chi chiude e quando lo decide il database, un modulo chiuso non cambia.
create or replace function app.form_submission_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (new.template_id is distinct from old.template_id
       or new.template_version_id is distinct from old.template_version_id) then
    raise exception 'Il modello di una compilazione non si cambia' using errcode = '42501';
  end if;
  if not exists (select 1 from public.form_template_versions v
                  where v.tenant_id = new.tenant_id and v.id = new.template_version_id
                    and v.template_id = new.template_id) then
    raise exception 'La versione non appartiene al modello' using errcode = '23514';
  end if;
  if new.site_id is not null and not exists (
       select 1 from public.customer_sites s
        where s.tenant_id = new.tenant_id and s.id = new.site_id and s.customer_id = new.customer_id) then
    raise exception 'La sede non appartiene al cliente' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    if old.status = 'completed' then
      if new.status = 'completed' then
        if new.data is distinct from old.data or new.title is distinct from old.title
           or new.subject_code is distinct from old.subject_code
           or new.customer_id is distinct from old.customer_id
           or new.site_id is distinct from old.site_id then
          raise exception 'Il modulo è chiuso: riaprilo per modificarlo' using errcode = '42501';
        end if;
        new.completed_at := old.completed_at;
        new.completed_by := old.completed_by;
        return new;
      end if;
      -- riapertura
      if not app.has_permission(new.tenant_id, 'forms.manage') then
        raise exception 'Serve il permesso di gestione dei moduli per riaprire' using errcode = '42501';
      end if;
    end if;
  end if;

  if new.status = 'completed' then
    if tg_op = 'INSERT' or old.status <> 'completed' then
      new.completed_at := now();
      new.completed_by := app.current_actor();
    end if;
  else
    new.completed_at := null;
    new.completed_by := null;
  end if;
  return new;
end;
$$;

create trigger form_submissions_guard
  before insert or update on public.form_submissions
  for each row execute function app.form_submission_guard();

select app.attach_tenant_table_triggers('public.form_submissions');
select app.grant_tenant_table('public.form_submissions');
select app.create_tenant_policies('public.form_submissions', 'forms.read', 'forms.write', 'forms.delete');

-- -----------------------------------------------------------------------------
-- Permessi
-- -----------------------------------------------------------------------------
insert into public.permissions (key, description) values
  ('forms.read',   'Vedere i moduli compilati e i modelli'),
  ('forms.write',  'Compilare moduli'),
  ('forms.manage', 'Creare e pubblicare modelli di modulo, riaprire moduli chiusi'),
  ('forms.delete', 'Eliminare moduli e modelli');

update public.permissions set requires_mfa = true where key in ('forms.manage', 'forms.delete');

select app.grant_system_permissions('owner', array['forms.read','forms.write','forms.manage','forms.delete']);
select app.grant_system_permissions('admin', array['forms.read','forms.write','forms.manage','forms.delete']);
select app.grant_system_permissions('operations_manager', array['forms.read','forms.write','forms.manage']);
select app.grant_system_permissions('back_office',        array['forms.read','forms.write','forms.manage']);
select app.grant_system_permissions('site_manager',       array['forms.read','forms.write']);
select app.grant_system_permissions('technician',         array['forms.read','forms.write']);
select app.grant_system_permissions('viewer',             array['forms.read']);

-- -----------------------------------------------------------------------------
-- Esportazioni e cronologia
-- -----------------------------------------------------------------------------
alter table public.data_exports drop constraint data_exports_section_check;
alter table public.data_exports add constraint data_exports_section_check check (section in (
  'customers', 'suppliers', 'employees', 'teams', 'deadlines', 'audit', 'documents', 'tasks',
  'payments', 'communications', 'forms'));

create or replace function app.export_section_permission(p_section text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_section
    when 'customers' then 'customers.read'
    when 'suppliers' then 'suppliers.read'
    when 'employees' then 'employees.read'
    when 'teams'     then 'teams.read'
    when 'deadlines' then 'deadlines.read'
    when 'audit'     then 'audit.read'
    when 'documents' then 'documents.read'
    when 'tasks'     then 'tasks.read'
    when 'payments'  then 'payments.read'
    when 'communications' then 'communications.read'
    when 'forms'     then 'forms.read'
  end;
$$;

-- Cronologia per elemento: aggiunge moduli (anche nella scheda del cliente) e modelli.
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
  end;
  if v_perm is null then
    raise exception 'unsupported table' using errcode = '22023';
  end if;
  v_fk := case p_table
    when 'customers' then 'customer_id'
    when 'suppliers' then 'supplier_id'
    when 'employees' then 'employee_id'
    when 'teams'     then 'team_id'
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
  v_forms := v_fk = 'customer_id'
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

grant execute on function app.record_history(text, uuid, integer) to authenticated, service_role;
grant execute on function app.export_section_permission(text) to authenticated;

revoke execute on all functions in schema app from public;
