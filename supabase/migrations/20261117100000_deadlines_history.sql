-- =============================================================================
-- CantiereOS — Scadenziario unico e storico per elemento
-- -----------------------------------------------------------------------------
-- 1. `deadlines`: una sola tabella per certificazioni, manutenzioni, controlli
--    periodici, scadenze di documenti, pagamenti e contratti (ADR-008 in
--    docs/DATABASE.md). Ogni scadenza può essere collegata al massimo a un
--    soggetto (cliente, fornitore, dipendente, squadra) con FK composte per
--    azienda, ha un responsabile (membro dell'azienda), uno stato e una
--    eventuale ricorrenza. Completare una scadenza ricorrente crea la
--    successiva collegata alla precedente: la cronologia non si perde.
-- 2. Notifiche senza duplicati: `notifications.dedupe_key` univoca per
--    destinatario + funzione idempotente che genera gli avvisi di scadenza.
-- 3. `app.record_history`: cronologia di un singolo elemento leggibile da chi
--    può leggere quell'elemento (non serve il permesso audit.read, che resta
--    per il registro completo dell'azienda).
-- =============================================================================

create table public.deadlines (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants (id) on delete restrict,
  kind                  text not null check (kind in (
                          'certification', 'maintenance', 'inspection', 'document',
                          'payment', 'contract', 'other')),
  title                 text not null check (char_length(title) between 1 and 200),
  description           text check (description is null or char_length(description) <= 4000),
  reference_code        text check (reference_code is null or char_length(reference_code) <= 60),
  customer_id           uuid,
  supplier_id           uuid,
  employee_id           uuid,
  team_id               uuid,
  responsible_user_id   uuid,
  due_date              date not null,
  remind_days_before    smallint not null default 30 check (remind_days_before between 0 and 365),
  recurrence_months     smallint check (recurrence_months is null or recurrence_months between 1 and 120),
  status                text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  completed_at          timestamptz,
  completed_by          uuid references public.users (id) on delete set null,
  completion_notes      text check (completion_notes is null or char_length(completion_notes) <= 4000),
  previous_deadline_id  uuid,
  created_by            uuid references public.users (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz,
  constraint deadlines_tenant_id_id_key unique (tenant_id, id),
  constraint deadlines_one_subject_chk check (num_nonnulls(customer_id, supplier_id, employee_id, team_id) <= 1),
  constraint deadlines_completion_chk check ((status = 'done') = (completed_at is not null)),
  constraint deadlines_customer_fk foreign key (tenant_id, customer_id)
    references public.customers (tenant_id, id) on delete restrict,
  constraint deadlines_supplier_fk foreign key (tenant_id, supplier_id)
    references public.suppliers (tenant_id, id) on delete restrict,
  constraint deadlines_employee_fk foreign key (tenant_id, employee_id)
    references public.employees (tenant_id, id) on delete restrict,
  constraint deadlines_team_fk foreign key (tenant_id, team_id)
    references public.teams (tenant_id, id) on delete restrict,
  constraint deadlines_responsible_fk foreign key (tenant_id, responsible_user_id)
    references public.memberships (tenant_id, user_id) on delete set null (responsible_user_id),
  constraint deadlines_previous_fk foreign key (tenant_id, previous_deadline_id)
    references public.deadlines (tenant_id, id) on delete restrict
);

comment on table public.deadlines is
  'Scadenziario unico: certificazioni, manutenzioni, controlli periodici, documenti, pagamenti, contratti. Lo stato "in ritardo" si ricava da due_date, non si salva.';

create index deadlines_tenant_due_idx on public.deadlines (tenant_id, due_date)
  where deleted_at is null and status = 'open';
create index deadlines_customer_idx on public.deadlines (tenant_id, customer_id) where customer_id is not null;
create index deadlines_supplier_idx on public.deadlines (tenant_id, supplier_id) where supplier_id is not null;
create index deadlines_employee_idx on public.deadlines (tenant_id, employee_id) where employee_id is not null;
create index deadlines_team_idx on public.deadlines (tenant_id, team_id) where team_id is not null;
create index deadlines_responsible_idx on public.deadlines (tenant_id, responsible_user_id)
  where responsible_user_id is not null;
create unique index deadlines_one_successor_key on public.deadlines (tenant_id, previous_deadline_id)
  where previous_deadline_id is not null;

insert into public.permissions (key, description) values
  ('deadlines.read',   'Vedere scadenze, certificazioni e manutenzioni'),
  ('deadlines.write',  'Creare, modificare e completare scadenze'),
  ('deadlines.delete', 'Eliminare scadenze');
update public.permissions set requires_mfa = true where key = 'deadlines.delete';

select app.grant_system_permissions('owner',              array['deadlines.read','deadlines.write','deadlines.delete']);
select app.grant_system_permissions('admin',              array['deadlines.read','deadlines.write','deadlines.delete']);
select app.grant_system_permissions('operations_manager', array['deadlines.read','deadlines.write']);
select app.grant_system_permissions('back_office',        array['deadlines.read','deadlines.write']);
select app.grant_system_permissions('site_manager',       array['deadlines.read','deadlines.write']);
select app.grant_system_permissions('technician',         array['deadlines.read']);

-- Ruolo "Sola consultazione": legge anagrafiche, personale e scadenze, non modifica nulla.
insert into public.roles (tenant_id, key, name, description) values
  (null, 'viewer', 'Sola consultazione', 'Vede anagrafiche, personale e scadenze senza poter modificare');
select app.grant_system_permissions('viewer',
  array['customers.read','suppliers.read','employees.read','teams.read','deadlines.read']);

-- Chi completa e quando lo decide il database, non il client.
create or replace function app.deadline_completion_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status is distinct from 'done') then
    new.completed_at := now();
    new.completed_by := app.current_actor();
  elsif new.status <> 'done' then
    new.completed_at := null;
    new.completed_by := null;
  elsif tg_op = 'UPDATE' then
    new.completed_at := old.completed_at;
    new.completed_by := old.completed_by;
  end if;
  return new;
end;
$$;

create trigger deadlines_completion_guard
  before insert or update on public.deadlines
  for each row execute function app.deadline_completion_guard();

select app.attach_tenant_table_triggers('public.deadlines');
select app.grant_tenant_table('public.deadlines');
select app.create_tenant_policies('public.deadlines', 'deadlines.read', 'deadlines.write', 'deadlines.delete');

-- -----------------------------------------------------------------------------
-- Notifiche senza duplicati
-- -----------------------------------------------------------------------------
alter table public.notifications
  add column dedupe_key text check (dedupe_key is null or char_length(dedupe_key) <= 200);
create unique index notifications_dedupe_key
  on public.notifications (tenant_id, user_id, dedupe_key) where dedupe_key is not null;

comment on column public.notifications.dedupe_key is
  'Chiave dell''evento che ha generato la notifica: lo stesso evento non produce due notifiche per lo stesso utente.';

-- Utenti attivi di un'azienda che hanno un permesso (destinatari di sistema).
create or replace function app.tenant_users_with_permission(p_tenant_id uuid, p_permission text)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id
  from public.memberships m
  join public.role_permissions rp on rp.role_id = m.role_id
  join public.permissions p on p.id = rp.permission_id and p.key = p_permission
  where m.tenant_id = p_tenant_id and m.status = 'active';
$$;

-- Genera gli avvisi per le scadenze aperte entro il preavviso o già superate.
-- Idempotente: può girare a ogni accesso o da un job pianificato. Destinatario:
-- il responsabile se è membro attivo, altrimenti chi può modificare le scadenze.
-- Restituisce il numero di notifiche create.
create or replace function app.generate_deadline_notifications(p_tenant_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  -- chiamabile da un membro che legge le scadenze di quell'azienda, o dal sistema
  if auth.uid() is not null
     and p_tenant_id not in (select app.tenant_ids_with_permission('deadlines.read')) then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  with due as (
    select d.*,
           case when d.due_date < current_date then 'overdue' else 'upcoming' end as stage
    from public.deadlines d
    join public.tenants t on t.id = d.tenant_id and t.status in ('trial', 'active')
    where d.tenant_id = p_tenant_id
      and d.status = 'open'
      and d.deleted_at is null
      and d.due_date <= current_date + d.remind_days_before
  ),
  recipients as (
    select due.*, r.user_id
    from due
    cross join lateral (
      select due.responsible_user_id as user_id
      where due.responsible_user_id is not null
        and exists (select 1 from public.memberships m
                    where m.tenant_id = due.tenant_id and m.user_id = due.responsible_user_id
                      and m.status = 'active')
      union
      select u from app.tenant_users_with_permission(due.tenant_id, 'deadlines.write') u
      where not exists (select 1 from public.memberships m
                        where m.tenant_id = due.tenant_id and m.user_id = due.responsible_user_id
                          and m.status = 'active')
    ) r
  ),
  ins as (
    insert into public.notifications (tenant_id, user_id, kind, title, body, link, dedupe_key)
    select r.tenant_id, r.user_id,
           'deadlines.' || r.stage,
           case when r.stage = 'overdue' then 'Scadenza superata' else 'Scadenza in arrivo' end,
           left(r.title || ' — ' || to_char(r.due_date, 'DD/MM/YYYY'), 2000),
           '/app/scadenze/' || r.id,
           'deadline:' || r.id || ':' || r.due_date || ':' || r.stage
    from recipients r
    on conflict (tenant_id, user_id, dedupe_key) where dedupe_key is not null do nothing
    returning 1
  )
  select count(*) into v_count from ins;
  return v_count;
end;
$$;

-- Avvisa il nuovo responsabile quando gli viene assegnata una scadenza.
create or replace function app.notify_deadline_assigned()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.responsible_user_id is not null
     and new.responsible_user_id is distinct from app.current_actor()
     and (tg_op = 'INSERT' or new.responsible_user_id is distinct from old.responsible_user_id)
     and exists (select 1 from public.memberships m
                 where m.tenant_id = new.tenant_id and m.user_id = new.responsible_user_id
                   and m.status = 'active') then
    insert into public.notifications (tenant_id, user_id, kind, title, body, link, dedupe_key)
    values (new.tenant_id, new.responsible_user_id, 'deadlines.assigned',
            'Ti è stata assegnata una scadenza',
            left(new.title || ' — ' || to_char(new.due_date, 'DD/MM/YYYY'), 2000),
            '/app/scadenze/' || new.id,
            'deadline:' || new.id || ':assigned:' || new.responsible_user_id || ':' || extract(epoch from now())::bigint)
    on conflict do nothing;
  end if;
  return null;
end;
$$;

create trigger deadlines_notify_assigned
  after insert or update of responsible_user_id on public.deadlines
  for each row execute function app.notify_deadline_assigned();

-- -----------------------------------------------------------------------------
-- Cronologia di un elemento
-- -----------------------------------------------------------------------------
-- Restituisce le righe dell'audit log del record indicato e, per i soggetti
-- (cliente, fornitore, dipendente, squadra), anche quelle delle scadenze
-- collegate se il chiamante può leggerle. Il chiamante deve poter leggere
-- l'elemento: il permesso dipende dalla tabella (whitelist).
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
begin
  v_perm := case p_table
    when 'customers' then 'customers.read'
    when 'suppliers' then 'suppliers.read'
    when 'employees' then 'employees.read'
    when 'teams'     then 'teams.read'
    when 'deadlines' then 'deadlines.read'
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

  -- l'azienda del record si ricava dal log (vale anche per record eliminati)
  select a.tenant_id into v_tenant
  from public.audit_log a
  where a.table_name = p_table and a.record_id = p_record_id
  order by a.id
  limit 1;

  if v_tenant is null or v_tenant not in (select app.tenant_ids_with_permission(v_perm)) then
    return;  -- nessuna riga: né esistenza né contenuto trapelano
  end if;

  v_related := v_fk is not null
    and v_tenant in (select app.tenant_ids_with_permission('deadlines.read'));

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
      )
    order by a.id desc
    limit least(greatest(p_limit, 1), 500);
end;
$$;

grant execute on function
  app.generate_deadline_notifications(uuid),
  app.record_history(text, uuid, integer)
to authenticated, service_role;
grant execute on function app.tenant_users_with_permission(uuid, text) to service_role;

revoke execute on all functions in schema app from public;
