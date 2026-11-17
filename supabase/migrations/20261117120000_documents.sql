-- =============================================================================
-- CantiereOS — Archivio documentale (ADR-009 in docs/DATABASE.md)
-- -----------------------------------------------------------------------------
-- document_folders   albero di cartelle per azienda
-- documents          scheda del documento: categoria, cartella, soggetto collegato,
--                    scadenza, riservatezza, versione corrente
-- document_versions  un file caricato = una versione; chiave dello storage generata
--                    dal database ({tenant}/{documento}/{versione}); immutabile
--                    una volta verificata
-- document_downloads registro append-only dei download (finisce nel registro attività)
--
-- I file stanno in un bucket PRIVATO di Supabase Storage; questo schema non
-- contiene mai URL pubblici. I documenti "riservati" (es. documenti d'identità)
-- si vedono solo con il permesso documents.confidential.
-- =============================================================================

insert into public.permissions (key, description) values
  ('documents.read',         'Vedere l''archivio documentale e scaricare i file'),
  ('documents.write',        'Caricare documenti, nuove versioni, gestire cartelle'),
  ('documents.delete',       'Eliminare documenti e cartelle'),
  ('documents.confidential', 'Vedere i documenti riservati (identità, dati personali)');
update public.permissions set requires_mfa = true
 where key in ('documents.delete', 'documents.confidential');

select app.grant_system_permissions('owner',              array['documents.read','documents.write','documents.delete','documents.confidential']);
select app.grant_system_permissions('admin',              array['documents.read','documents.write','documents.delete','documents.confidential']);
select app.grant_system_permissions('back_office',        array['documents.read','documents.write','documents.delete','documents.confidential']);
select app.grant_system_permissions('operations_manager', array['documents.read','documents.write']);
select app.grant_system_permissions('site_manager',       array['documents.read','documents.write']);
select app.grant_system_permissions('technician',         array['documents.read']);
select app.grant_system_permissions('viewer',             array['documents.read']);

-- --- Cartelle -------------------------------------------------------------------

create table public.document_folders (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete restrict,
  parent_id   uuid,
  name        text not null check (char_length(btrim(name)) between 1 and 120 and name !~ '[/\\]'),
  created_by  uuid references public.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint document_folders_tenant_id_id_key unique (tenant_id, id),
  constraint document_folders_parent_fk foreign key (tenant_id, parent_id)
    references public.document_folders (tenant_id, id) on delete restrict,
  constraint document_folders_not_self_chk check (parent_id is distinct from id)
);

create unique index document_folders_name_key
  on public.document_folders (tenant_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(name)))
  where deleted_at is null;

-- Niente cicli nell'albero (A dentro B dentro A).
create or replace function app.document_folder_no_cycle()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_cursor uuid := new.parent_id;
  v_depth  integer := 0;
begin
  while v_cursor is not null loop
    if v_cursor = new.id then
      raise exception 'Una cartella non può stare dentro se stessa' using errcode = '23514';
    end if;
    v_depth := v_depth + 1;
    if v_depth > 20 then
      raise exception 'Troppi livelli di cartelle (massimo 20)' using errcode = '23514';
    end if;
    select f.parent_id into v_cursor
      from public.document_folders f
     where f.tenant_id = new.tenant_id and f.id = v_cursor;
  end loop;
  return new;
end;
$$;

create trigger document_folders_no_cycle
  before insert or update of parent_id on public.document_folders
  for each row execute function app.document_folder_no_cycle();

select app.attach_tenant_table_triggers('public.document_folders');
select app.grant_tenant_table('public.document_folders');
select app.create_tenant_policies('public.document_folders', 'documents.read', 'documents.write', 'documents.delete');

-- --- Documenti ------------------------------------------------------------------

create table public.documents (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants (id) on delete restrict,
  folder_id           uuid,
  title               text not null check (char_length(btrim(title)) between 1 and 200),
  category            text not null default 'other' check (category in (
                        'contract', 'certificate', 'invoice', 'report', 'photo', 'identity',
                        'safety', 'permit', 'manual', 'other')),
  description         text check (description is null or char_length(description) <= 4000),
  is_confidential     boolean not null default false,
  customer_id         uuid,
  supplier_id         uuid,
  employee_id         uuid,
  team_id             uuid,
  expires_on          date,
  deadline_id         uuid,
  current_version_id  uuid,
  created_by          uuid references public.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  constraint documents_tenant_id_id_key unique (tenant_id, id),
  constraint documents_one_subject_chk check (num_nonnulls(customer_id, supplier_id, employee_id, team_id) <= 1),
  constraint documents_folder_fk foreign key (tenant_id, folder_id)
    references public.document_folders (tenant_id, id) on delete restrict,
  constraint documents_customer_fk foreign key (tenant_id, customer_id)
    references public.customers (tenant_id, id) on delete restrict,
  constraint documents_supplier_fk foreign key (tenant_id, supplier_id)
    references public.suppliers (tenant_id, id) on delete restrict,
  constraint documents_employee_fk foreign key (tenant_id, employee_id)
    references public.employees (tenant_id, id) on delete restrict,
  constraint documents_team_fk foreign key (tenant_id, team_id)
    references public.teams (tenant_id, id) on delete restrict,
  constraint documents_deadline_fk foreign key (tenant_id, deadline_id)
    references public.deadlines (tenant_id, id) on delete restrict
);

comment on table public.documents is
  'Archivio documentale: scheda del documento. I file sono in document_versions (storage privato).';

create index documents_folder_idx on public.documents (tenant_id, folder_id) where deleted_at is null;
create index documents_customer_idx on public.documents (tenant_id, customer_id) where customer_id is not null;
create index documents_supplier_idx on public.documents (tenant_id, supplier_id) where supplier_id is not null;
create index documents_employee_idx on public.documents (tenant_id, employee_id) where employee_id is not null;
create index documents_team_idx on public.documents (tenant_id, team_id) where team_id is not null;
create index documents_expires_idx on public.documents (tenant_id, expires_on)
  where deleted_at is null and expires_on is not null;
create index documents_title_trgm_idx on public.documents using gin (lower(title) extensions.gin_trgm_ops);

select app.attach_tenant_table_triggers('public.documents');
select app.grant_tenant_table('public.documents');

alter table public.documents enable row level security;
-- I riservati richiedono anche documents.confidential.
create policy documents_select on public.documents for select to authenticated
  using (
    tenant_id in (select app.tenant_ids_with_permission('documents.read'))
    and (not is_confidential
         or tenant_id in (select app.tenant_ids_with_permission('documents.confidential')))
  );
create policy documents_insert on public.documents for insert to authenticated
  with check (
    tenant_id in (select app.tenant_ids_with_permission('documents.write'))
    and (not is_confidential
         or tenant_id in (select app.tenant_ids_with_permission('documents.confidential')))
  );
create policy documents_update on public.documents for update to authenticated
  using (
    tenant_id in (select app.tenant_ids_with_permission('documents.write'))
    and (not is_confidential
         or tenant_id in (select app.tenant_ids_with_permission('documents.confidential')))
  )
  with check (
    tenant_id in (select app.tenant_ids_with_permission('documents.write'))
    and (not is_confidential
         or tenant_id in (select app.tenant_ids_with_permission('documents.confidential')))
  );
create policy documents_delete on public.documents for delete to authenticated
  using (tenant_id in (select app.tenant_ids_with_permission('documents.delete')));

-- --- Versioni -------------------------------------------------------------------

create table public.document_versions (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete restrict,
  document_id    uuid not null,
  version_no     integer not null default 0 check (version_no >= 0),
  original_name  text not null check (char_length(original_name) between 1 and 255),
  declared_type  text check (declared_type is null or char_length(declared_type) <= 120),
  mime_type      text check (mime_type is null or char_length(mime_type) <= 120),
  size_bytes     bigint check (size_bytes is null or size_bytes between 1 and 26214400),
  status         text not null default 'pending' check (status in ('pending', 'ready', 'rejected')),
  reject_reason  text check (reject_reason is null or char_length(reject_reason) <= 200),
  notes          text check (notes is null or char_length(notes) <= 2000),
  storage_key    text generated always as (tenant_id::text || '/' || document_id::text || '/' || id::text) stored,
  verified_at    timestamptz,
  created_by     uuid references public.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint document_versions_tenant_id_id_key unique (tenant_id, id),
  constraint document_versions_document_fk foreign key (tenant_id, document_id)
    references public.documents (tenant_id, id) on delete restrict,
  constraint document_versions_ready_chk check (
    status <> 'ready' or (mime_type is not null and size_bytes is not null and verified_at is not null))
);

create unique index document_versions_no_key on public.document_versions (tenant_id, document_id, version_no)
  where version_no > 0;
create index document_versions_document_idx on public.document_versions (tenant_id, document_id, created_at desc);
create index document_versions_name_trgm_idx on public.document_versions using gin (lower(original_name) extensions.gin_trgm_ops);

alter table public.documents
  add constraint documents_current_version_fk foreign key (tenant_id, current_version_id)
    references public.document_versions (tenant_id, id) on delete restrict;

-- Numero di versione progressivo per documento (con lock sulla scheda).
create or replace function app.document_version_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.documents d where d.tenant_id = new.tenant_id and d.id = new.document_id for update;
  select coalesce(max(v.version_no), 0) + 1 into new.version_no
    from public.document_versions v
   where v.tenant_id = new.tenant_id and v.document_id = new.document_id;
  new.status := 'pending';
  new.mime_type := null;
  new.size_bytes := null;
  new.verified_at := null;
  new.reject_reason := null;
  return new;
end;
$$;

create trigger document_versions_number
  before insert on public.document_versions
  for each row execute function app.document_version_number();

-- Una versione cambia solo da pending a ready/rejected; poi è immutabile.
create or replace function app.document_version_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'pending' then
    raise exception 'Una versione verificata non si può modificare' using errcode = '42501';
  end if;
  if new.document_id <> old.document_id or new.version_no <> old.version_no
     or new.original_name <> old.original_name or new.created_by is distinct from old.created_by
     or new.created_at <> old.created_at then
    raise exception 'Campi della versione non modificabili' using errcode = '42501';
  end if;
  if new.status = 'pending' then
    raise exception 'Una versione resta in attesa finché non viene verificata' using errcode = '23514';
  end if;
  new.verified_at := now();
  return new;
end;
$$;

create trigger document_versions_guard
  before update on public.document_versions
  for each row execute function app.document_version_guard();

-- La versione corrente deve essere verificata e appartenere al documento.
create or replace function app.document_current_version_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.current_version_id is not null
     and (tg_op = 'INSERT' or new.current_version_id is distinct from old.current_version_id) then
    perform 1 from public.document_versions v
      where v.tenant_id = new.tenant_id and v.id = new.current_version_id
        and v.document_id = new.id and v.status = 'ready';
    if not found then
      raise exception 'La versione corrente deve essere un file verificato di questo documento'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger documents_current_version_guard
  before insert or update of current_version_id on public.documents
  for each row execute function app.document_current_version_guard();

select app.attach_tenant_table_triggers('public.document_versions');
select app.grant_tenant_table('public.document_versions');
revoke delete on public.document_versions from authenticated;

alter table public.document_versions enable row level security;
-- Le versioni seguono la visibilità del documento (RLS del documento nella subquery).
create policy document_versions_select on public.document_versions for select to authenticated
  using (
    tenant_id in (select app.tenant_ids_with_permission('documents.read'))
    and exists (select 1 from public.documents d where d.tenant_id = document_versions.tenant_id
                                                 and d.id = document_versions.document_id)
  );
create policy document_versions_insert on public.document_versions for insert to authenticated
  with check (
    tenant_id in (select app.tenant_ids_with_permission('documents.write'))
    and exists (select 1 from public.documents d where d.tenant_id = document_versions.tenant_id
                                                 and d.id = document_versions.document_id
                                                 and d.deleted_at is null)
  );
create policy document_versions_update on public.document_versions for update to authenticated
  using (tenant_id in (select app.tenant_ids_with_permission('documents.write')))
  with check (tenant_id in (select app.tenant_ids_with_permission('documents.write')));

-- --- Download -------------------------------------------------------------------

create table public.document_downloads (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete restrict,
  document_id uuid not null,
  version_id  uuid not null,
  disposition text not null default 'download' check (disposition in ('download', 'preview')),
  created_by  uuid references public.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint document_downloads_tenant_id_id_key unique (tenant_id, id),
  constraint document_downloads_document_fk foreign key (tenant_id, document_id)
    references public.documents (tenant_id, id) on delete restrict,
  constraint document_downloads_version_fk foreign key (tenant_id, version_id)
    references public.document_versions (tenant_id, id) on delete restrict
);

create index document_downloads_document_idx on public.document_downloads (tenant_id, document_id, created_at desc);

select app.attach_tenant_table_triggers('public.document_downloads');
select app.grant_tenant_table('public.document_downloads');
revoke update, delete on public.document_downloads from authenticated;

alter table public.document_downloads enable row level security;
create policy document_downloads_select on public.document_downloads for select to authenticated
  using (tenant_id in (select app.tenant_ids_with_permission('audit.read')));
-- si registra solo il download di una versione pronta che l'utente può vedere
create policy document_downloads_insert on public.document_downloads for insert to authenticated
  with check (
    created_by is not distinct from app.current_actor()
    and exists (select 1 from public.document_versions v
                 where v.tenant_id = document_downloads.tenant_id
                   and v.id = document_downloads.version_id
                   and v.document_id = document_downloads.document_id
                   and v.status = 'ready')
  );

-- --- Esportazione dell'elenco documenti ----------------------------------------

alter table public.data_exports drop constraint data_exports_section_check;
alter table public.data_exports add constraint data_exports_section_check check (section in (
  'customers', 'suppliers', 'employees', 'teams', 'deadlines', 'audit', 'documents'));

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
  end;
$$;

-- --- Storico per elemento: documenti, versioni e download ----------------------

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
begin
  v_perm := case p_table
    when 'customers' then 'customers.read'
    when 'suppliers' then 'suppliers.read'
    when 'employees' then 'employees.read'
    when 'teams'     then 'teams.read'
    when 'deadlines' then 'deadlines.read'
    when 'documents' then 'documents.read'
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
