-- =============================================================================
-- Attività assegnabili e commenti interni (ADR-011, docs/DATABASE.md).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Attività
-- -----------------------------------------------------------------------------
create table public.tasks (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants (id) on delete restrict,
  title               text not null check (char_length(title) between 1 and 200),
  description         text check (description is null or char_length(description) <= 4000),
  status              text not null default 'todo'
                        check (status in ('todo', 'in_progress', 'done', 'cancelled')),
  priority            text not null default 'normal'
                        check (priority in ('low', 'normal', 'high', 'urgent')),
  assignee_user_id    uuid,
  due_date            date,
  customer_id         uuid,
  supplier_id         uuid,
  employee_id         uuid,
  team_id             uuid,
  completed_at        timestamptz,
  completed_by        uuid references public.users (id) on delete set null,
  completion_notes    text check (completion_notes is null or char_length(completion_notes) <= 4000),
  created_by          uuid references public.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  constraint tasks_tenant_id_id_key unique (tenant_id, id),
  constraint tasks_one_subject_chk check (num_nonnulls(customer_id, supplier_id, employee_id, team_id) <= 1),
  constraint tasks_completion_chk check ((status = 'done') = (completed_at is not null)),
  constraint tasks_customer_fk foreign key (tenant_id, customer_id)
    references public.customers (tenant_id, id) on delete restrict,
  constraint tasks_supplier_fk foreign key (tenant_id, supplier_id)
    references public.suppliers (tenant_id, id) on delete restrict,
  constraint tasks_employee_fk foreign key (tenant_id, employee_id)
    references public.employees (tenant_id, id) on delete restrict,
  constraint tasks_team_fk foreign key (tenant_id, team_id)
    references public.teams (tenant_id, id) on delete restrict,
  constraint tasks_assignee_fk foreign key (tenant_id, assignee_user_id)
    references public.memberships (tenant_id, user_id) on delete set null (assignee_user_id)
);

comment on table public.tasks is
  'Attività assegnabili. "In ritardo" si ricava da due_date; chi completa e quando lo decide il trigger.';

create index tasks_tenant_open_idx on public.tasks (tenant_id, due_date)
  where deleted_at is null and status in ('todo', 'in_progress');
create index tasks_assignee_idx on public.tasks (tenant_id, assignee_user_id)
  where assignee_user_id is not null and deleted_at is null;
create index tasks_customer_idx on public.tasks (tenant_id, customer_id) where customer_id is not null;
create index tasks_supplier_idx on public.tasks (tenant_id, supplier_id) where supplier_id is not null;
create index tasks_employee_idx on public.tasks (tenant_id, employee_id) where employee_id is not null;
create index tasks_team_idx on public.tasks (tenant_id, team_id) where team_id is not null;
create index tasks_title_trgm_idx on public.tasks using gin (lower(title) extensions.gin_trgm_ops);

insert into public.permissions (key, description) values
  ('tasks.read',      'Vedere le attività'),
  ('tasks.write',     'Creare, assegnare e modificare attività'),
  ('tasks.delete',    'Eliminare attività'),
  ('comments.read',   'Leggere i commenti interni'),
  ('comments.write',  'Scrivere commenti interni'),
  ('comments.delete', 'Eliminare i commenti di altri utenti');
update public.permissions set requires_mfa = true where key in ('tasks.delete', 'comments.delete');

select app.grant_system_permissions('owner',
  array['tasks.read','tasks.write','tasks.delete','comments.read','comments.write','comments.delete']);
select app.grant_system_permissions('admin',
  array['tasks.read','tasks.write','tasks.delete','comments.read','comments.write','comments.delete']);
select app.grant_system_permissions('operations_manager', array['tasks.read','tasks.write','comments.read','comments.write']);
select app.grant_system_permissions('back_office',        array['tasks.read','tasks.write','comments.read','comments.write']);
select app.grant_system_permissions('site_manager',       array['tasks.read','tasks.write','comments.read','comments.write']);
select app.grant_system_permissions('technician',         array['tasks.read','comments.read','comments.write']);
select app.grant_system_permissions('viewer',             array['tasks.read','comments.read']);

-- Completamento: stessa regola delle scadenze (chi e quando lo decide il database).
create trigger tasks_completion_guard
  before insert or update on public.tasks
  for each row execute function app.deadline_completion_guard();

-- Chi ha solo tasks.read può aggiornare soltanto le proprie attività, e solo stato e note.
create or replace function app.task_update_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_free constant text[] := array['status', 'completion_notes', 'completed_at', 'completed_by', 'updated_at'];
begin
  if auth.uid() is null or app.has_permission(new.tenant_id, 'tasks.write') then
    return new;
  end if;
  if old.assignee_user_id is distinct from auth.uid() then
    raise exception 'only the assignee can update this task' using errcode = '42501';
  end if;
  if (to_jsonb(new) - v_free) is distinct from (to_jsonb(old) - v_free) then
    raise exception 'only status and completion notes can be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger tasks_update_guard
  before update on public.tasks
  for each row execute function app.task_update_guard();

-- Notifica all'assegnatario (non a chi assegna a sé stesso), senza duplicati.
create or replace function app.task_assignment_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assignee_user_id is null or new.deleted_at is not null
     or new.assignee_user_id is not distinct from app.current_actor()
     or (tg_op = 'UPDATE' and old.assignee_user_id is not distinct from new.assignee_user_id) then
    return null;
  end if;
  insert into public.notifications (tenant_id, user_id, kind, title, body, link, dedupe_key)
  values (new.tenant_id, new.assignee_user_id, 'tasks.assigned', 'Nuova attività assegnata',
          left(new.title || coalesce(' — entro il ' || to_char(new.due_date, 'DD/MM/YYYY'), ''), 2000),
          '/app/attivita/' || new.id,
          'task.assigned:' || new.id || ':' || new.assignee_user_id)
  on conflict (tenant_id, user_id, dedupe_key) where dedupe_key is not null do nothing;
  return null;
end;
$$;

create trigger tasks_assignment_notify
  after insert or update of assignee_user_id on public.tasks
  for each row execute function app.task_assignment_notify();

select app.attach_tenant_table_triggers('public.tasks');
select app.grant_tenant_table('public.tasks');

alter table public.tasks enable row level security;
create policy tasks_select on public.tasks for select to authenticated
  using (tenant_id in (select app.tenant_ids_with_permission('tasks.read')));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (tenant_id in (select app.tenant_ids_with_permission('tasks.write')));
create policy tasks_update on public.tasks for update to authenticated
  using (tenant_id in (select app.tenant_ids_with_permission('tasks.write'))
         or (tenant_id in (select app.tenant_ids_with_permission('tasks.read'))
             and assignee_user_id = auth.uid()))
  with check (tenant_id in (select app.tenant_ids_with_permission('tasks.write'))
              or (tenant_id in (select app.tenant_ids_with_permission('tasks.read'))
                  and assignee_user_id = auth.uid()));
create policy tasks_delete on public.tasks for delete to authenticated
  using (tenant_id in (select app.tenant_ids_with_permission('tasks.delete')));

-- -----------------------------------------------------------------------------
-- Commenti interni
-- -----------------------------------------------------------------------------
create table public.comments (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete restrict,
  subject_table  text not null check (subject_table in (
                   'customers', 'suppliers', 'employees', 'teams', 'deadlines', 'documents', 'tasks')),
  subject_id     uuid not null,
  body           text not null check (char_length(btrim(body)) between 1 and 4000),
  created_by     uuid references public.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  edited_at      timestamptz,
  deleted_at     timestamptz,
  deleted_by     uuid references public.users (id) on delete set null,
  constraint comments_tenant_id_id_key unique (tenant_id, id)
);
create index comments_subject_idx on public.comments (tenant_id, subject_table, subject_id, created_at);

comment on table public.comments is
  'Commenti interni su un elemento. Visibili solo a chi vede l''elemento (RLS del soggetto). Cancellazione solo logica.';

-- Il soggetto esiste ed è visibile a chi chiede? Funzione SECURITY INVOKER: la
-- lettura passa dalla RLS della tabella del soggetto con i permessi del chiamante.
create or replace function app.comment_subject_visible(p_tenant_id uuid, p_table text, p_id uuid)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
begin
  return case p_table
    when 'customers' then exists (select 1 from public.customers x where x.tenant_id = p_tenant_id and x.id = p_id)
    when 'suppliers' then exists (select 1 from public.suppliers x where x.tenant_id = p_tenant_id and x.id = p_id)
    when 'employees' then exists (select 1 from public.employees x where x.tenant_id = p_tenant_id and x.id = p_id)
    when 'teams'     then exists (select 1 from public.teams x where x.tenant_id = p_tenant_id and x.id = p_id)
    when 'deadlines' then exists (select 1 from public.deadlines x where x.tenant_id = p_tenant_id and x.id = p_id and x.deleted_at is null)
    when 'documents' then exists (select 1 from public.documents x where x.tenant_id = p_tenant_id and x.id = p_id and x.deleted_at is null)
    when 'tasks'     then exists (select 1 from public.tasks x where x.tenant_id = p_tenant_id and x.id = p_id and x.deleted_at is null)
    else false
  end;
end;
$$;

-- Testo modificabile solo dall'autore; cancellazione logica una volta sola; soggetto immutabile.
create or replace function app.comment_update_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.subject_table is distinct from old.subject_table or new.subject_id is distinct from old.subject_id
     or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
    raise exception 'comment subject and author are immutable' using errcode = '42501';
  end if;
  if old.deleted_at is not null then
    raise exception 'comment already deleted' using errcode = '42501';
  end if;
  if new.body is distinct from old.body then
    if auth.uid() is not null and old.created_by is distinct from auth.uid() then
      raise exception 'only the author can edit a comment' using errcode = '42501';
    end if;
    new.edited_at := now();
  else
    new.edited_at := old.edited_at;
  end if;
  if new.deleted_at is not null then
    new.deleted_at := now();
    new.deleted_by := app.current_actor();
  else
    new.deleted_by := null;
  end if;
  return new;
end;
$$;

create trigger comments_update_guard
  before update on public.comments
  for each row execute function app.comment_update_guard();

create or replace function app.comment_insert_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.edited_at := null;
  new.deleted_at := null;
  new.deleted_by := null;
  return new;
end;
$$;

create trigger comments_insert_guard
  before insert on public.comments
  for each row execute function app.comment_insert_guard();

select app.attach_tenant_table_triggers('public.comments');
select app.grant_tenant_table('public.comments');
revoke delete on public.comments from authenticated;

alter table public.comments enable row level security;
create policy comments_select on public.comments for select to authenticated
  using (tenant_id in (select app.tenant_ids_with_permission('comments.read'))
         and app.comment_subject_visible(tenant_id, subject_table, subject_id));
create policy comments_insert on public.comments for insert to authenticated
  with check (tenant_id in (select app.tenant_ids_with_permission('comments.write'))
              and app.comment_subject_visible(tenant_id, subject_table, subject_id));
create policy comments_update on public.comments for update to authenticated
  using (app.comment_subject_visible(tenant_id, subject_table, subject_id)
         and ((tenant_id in (select app.tenant_ids_with_permission('comments.write')) and created_by = auth.uid())
              or tenant_id in (select app.tenant_ids_with_permission('comments.delete'))))
  with check (app.comment_subject_visible(tenant_id, subject_table, subject_id));

-- -----------------------------------------------------------------------------
-- Esportazioni e cronologia
-- -----------------------------------------------------------------------------
alter table public.data_exports drop constraint data_exports_section_check;
alter table public.data_exports add constraint data_exports_section_check check (section in (
  'customers', 'suppliers', 'employees', 'teams', 'deadlines', 'audit', 'documents', 'tasks'));

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
  end;
$$;

-- Cronologia per elemento: aggiunge le attività (anche quelle collegate a un
-- soggetto) e i commenti sull'elemento.
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
begin
  v_perm := case p_table
    when 'customers' then 'customers.read'
    when 'suppliers' then 'suppliers.read'
    when 'employees' then 'employees.read'
    when 'teams'     then 'teams.read'
    when 'deadlines' then 'deadlines.read'
    when 'documents' then 'documents.read'
    when 'tasks'     then 'tasks.read'
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

grant execute on function app.comment_subject_visible(uuid, text, uuid) to authenticated;
grant execute on function app.record_history(text, uuid, integer) to authenticated, service_role;
grant execute on function app.export_section_permission(text) to authenticated;

revoke execute on all functions in schema app from public;
