-- =============================================================================
-- Pagamenti attesi e registro comunicazioni (ADR-012, docs/DATABASE.md).
-- Solo tabelle e permessi nuovi; nessun dato esistente viene modificato.
-- Nessun provider di pagamento o di posta: si registra, non si incassa né si invia.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Pagamenti attesi (da incassare / da pagare)
-- -----------------------------------------------------------------------------
create table public.payments (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants (id) on delete restrict,
  direction          text not null check (direction in ('incoming', 'outgoing')),
  description        text not null check (char_length(description) between 1 and 200),
  reference_code     text check (reference_code is null or char_length(reference_code) <= 60),
  amount_cents       bigint not null check (amount_cents > 0 and amount_cents <= 100000000000),
  currency           text not null default 'EUR' check (currency = 'EUR'),
  due_date           date not null,
  status             text not null default 'open' check (status in ('open', 'paid', 'cancelled')),
  paid_on            date,
  paid_amount_cents  bigint check (paid_amount_cents is null or (paid_amount_cents > 0 and paid_amount_cents <= 100000000000)),
  method             text check (method is null or method in ('bank_transfer', 'riba', 'card', 'cash', 'check', 'direct_debit', 'other')),
  notes              text check (notes is null or char_length(notes) <= 4000),
  customer_id        uuid,
  supplier_id        uuid,
  recorded_at        timestamptz,
  recorded_by        uuid references public.users (id) on delete set null,
  created_by         uuid references public.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  constraint payments_tenant_id_id_key unique (tenant_id, id),
  constraint payments_counterparty_chk check (
    (direction = 'incoming' and supplier_id is null) or (direction = 'outgoing' and customer_id is null)),
  constraint payments_paid_chk check ((status = 'paid') = (paid_on is not null and paid_amount_cents is not null)),
  constraint payments_customer_fk foreign key (tenant_id, customer_id)
    references public.customers (tenant_id, id) on delete restrict,
  constraint payments_supplier_fk foreign key (tenant_id, supplier_id)
    references public.suppliers (tenant_id, id) on delete restrict
);

comment on table public.payments is
  'Pagamenti attesi: da incassare (clienti) o da pagare (fornitori). Importi in centesimi. Non è contabilità.';
comment on column public.payments.amount_cents is 'Importo previsto in centesimi di euro (intero, mai float).';

create index payments_tenant_open_idx on public.payments (tenant_id, due_date)
  where deleted_at is null and status = 'open';
create index payments_customer_idx on public.payments (tenant_id, customer_id) where customer_id is not null;
create index payments_supplier_idx on public.payments (tenant_id, supplier_id) where supplier_id is not null;
create index payments_description_trgm_idx on public.payments
  using gin (lower(description) extensions.gin_trgm_ops);

-- Registrazione del pagamento: chi e quando lo decide il database; importo di default = previsto.
create or replace function app.payment_status_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'paid' then
    new.paid_on := coalesce(new.paid_on, current_date);
    new.paid_amount_cents := coalesce(new.paid_amount_cents, new.amount_cents);
    if tg_op = 'INSERT' or old.status is distinct from 'paid' then
      new.recorded_at := now();
      new.recorded_by := app.current_actor();
    else
      new.recorded_at := old.recorded_at;
      new.recorded_by := old.recorded_by;
    end if;
  else
    new.paid_on := null;
    new.paid_amount_cents := null;
    new.recorded_at := null;
    new.recorded_by := null;
  end if;
  return new;
end;
$$;

create trigger payments_status_guard
  before insert or update on public.payments
  for each row execute function app.payment_status_guard();

select app.attach_tenant_table_triggers('public.payments');
select app.grant_tenant_table('public.payments');
select app.create_tenant_policies('public.payments', 'payments.read', 'payments.write', 'payments.delete');

-- -----------------------------------------------------------------------------
-- Registro comunicazioni
-- -----------------------------------------------------------------------------
create table public.communications (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id) on delete restrict,
  channel          text not null check (channel in ('phone', 'email', 'pec', 'meeting', 'letter', 'message', 'other')),
  direction        text not null check (direction in ('inbound', 'outbound')),
  occurred_at      timestamptz not null default now(),
  subject          text not null check (char_length(subject) between 1 and 200),
  body             text check (body is null or char_length(body) <= 8000),
  contact_name     text check (contact_name is null or char_length(contact_name) <= 120),
  customer_id      uuid,
  supplier_id      uuid,
  employee_id      uuid,
  follow_up_date   date,
  follow_up_done   boolean not null default false,
  created_by       uuid references public.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  constraint communications_tenant_id_id_key unique (tenant_id, id),
  constraint communications_one_subject_chk check (num_nonnulls(customer_id, supplier_id, employee_id) <= 1),
  constraint communications_follow_up_chk check (follow_up_date is not null or not follow_up_done),
  constraint communications_customer_fk foreign key (tenant_id, customer_id)
    references public.customers (tenant_id, id) on delete restrict,
  constraint communications_supplier_fk foreign key (tenant_id, supplier_id)
    references public.suppliers (tenant_id, id) on delete restrict,
  constraint communications_employee_fk foreign key (tenant_id, employee_id)
    references public.employees (tenant_id, id) on delete restrict
);

comment on table public.communications is
  'Registro di telefonate, email, PEC, incontri e messaggi. Registra, non invia.';

create index communications_tenant_time_idx on public.communications (tenant_id, occurred_at desc)
  where deleted_at is null;
create index communications_follow_up_idx on public.communications (tenant_id, follow_up_date)
  where deleted_at is null and follow_up_date is not null and not follow_up_done;
create index communications_customer_idx on public.communications (tenant_id, customer_id) where customer_id is not null;
create index communications_supplier_idx on public.communications (tenant_id, supplier_id) where supplier_id is not null;
create index communications_employee_idx on public.communications (tenant_id, employee_id) where employee_id is not null;
create index communications_subject_trgm_idx on public.communications
  using gin (lower(subject) extensions.gin_trgm_ops);

select app.attach_tenant_table_triggers('public.communications');
select app.grant_tenant_table('public.communications');
select app.create_tenant_policies('public.communications', 'communications.read', 'communications.write', 'communications.delete');

-- -----------------------------------------------------------------------------
-- Permessi
-- -----------------------------------------------------------------------------
insert into public.permissions (key, description) values
  ('payments.read',         'Vedere i pagamenti attesi e gli importi'),
  ('payments.write',        'Registrare e modificare pagamenti attesi e incassi'),
  ('payments.delete',       'Eliminare pagamenti attesi'),
  ('communications.read',   'Leggere il registro delle comunicazioni'),
  ('communications.write',  'Registrare comunicazioni'),
  ('communications.delete', 'Eliminare comunicazioni');
update public.permissions set requires_mfa = true
 where key in ('payments.delete', 'communications.delete');

select app.grant_system_permissions('owner', array['payments.read','payments.write','payments.delete',
  'communications.read','communications.write','communications.delete']);
select app.grant_system_permissions('admin', array['payments.read','payments.write','payments.delete',
  'communications.read','communications.write','communications.delete']);
select app.grant_system_permissions('back_office',        array['payments.read','payments.write','communications.read','communications.write']);
select app.grant_system_permissions('operations_manager', array['payments.read','communications.read','communications.write']);
select app.grant_system_permissions('site_manager',       array['communications.read','communications.write']);
select app.grant_system_permissions('viewer',             array['communications.read']);

-- -----------------------------------------------------------------------------
-- Esportazioni e cronologia
-- -----------------------------------------------------------------------------
alter table public.data_exports drop constraint data_exports_section_check;
alter table public.data_exports add constraint data_exports_section_check check (section in (
  'customers', 'suppliers', 'employees', 'teams', 'deadlines', 'audit', 'documents', 'tasks',
  'payments', 'communications'));

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
  end;
$$;

-- Cronologia per elemento: aggiunge pagamenti e comunicazioni (anche collegati al soggetto).
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
