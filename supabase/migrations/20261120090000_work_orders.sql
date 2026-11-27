-- =============================================================================
-- CantiereOS — Interventi (ADR-017, docs/DATABASE.md)
-- -----------------------------------------------------------------------------
-- work_orders: un'uscita pianificata (quando, dove, per quale cliente, che lavoro).
-- work_order_assignees: la squadra dell'intervento (una o più persone, un capo squadra).
-- work_order_events: storico dei cambi di stato, scritto solo dal trigger.
--
-- Chi pianifica (work_orders.write) crea, sposta, assegna e annulla.
-- Chi è in squadra cambia solo stato e note dal campo; il trigger lo ricontrolla.
-- Il tecnico vede solo gli interventi in cui è in squadra (work_orders.read);
-- ufficio, capi e titolare li vedono tutti (work_orders_all.read).
-- =============================================================================

create table public.work_orders (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants (id) on delete restrict,
  number             text not null check (number ~ '^[0-9]{4}-[0-9]{4,6}$'),
  title              text not null check (char_length(title) between 1 and 200),
  kind               text not null default 'other'
                       check (kind in ('maintenance', 'installation', 'repair', 'inspection', 'emergency', 'other')),
  priority           text not null default 'normal'
                       check (priority in ('low', 'normal', 'high', 'urgent')),
  customer_id        uuid,
  customer_site_id   uuid,
  project_id         uuid,
  project_site_id    uuid,
  address_line       text check (address_line is null or char_length(address_line) <= 300),
  postal_code        text check (postal_code is null or char_length(postal_code) <= 20),
  city               text check (city is null or char_length(city) <= 120),
  province           text check (province is null or char_length(province) <= 10),
  latitude           numeric(9,6) check (latitude is null or latitude between -90 and 90),
  longitude          numeric(9,6) check (longitude is null or longitude between -180 and 180),
  scheduled_start    timestamptz not null,
  scheduled_end      timestamptz not null,
  description        text check (description is null or char_length(description) <= 8000),
  field_notes        text check (field_notes is null or char_length(field_notes) <= 4000),
  status             text not null default 'scheduled'
                       check (status in ('scheduled', 'in_progress', 'suspended', 'completed', 'cancelled')),
  status_reason      text check (status_reason is null or char_length(status_reason) <= 1000),
  started_at         timestamptz,
  completed_at       timestamptz,
  work_report_id     uuid,
  created_by         uuid references public.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  constraint work_orders_tenant_id_id_key unique (tenant_id, id),
  constraint work_orders_schedule_chk check (scheduled_end > scheduled_start
    and scheduled_end <= scheduled_start + interval '31 days'),
  constraint work_orders_location_chk check ((latitude is null) = (longitude is null)),
  constraint work_orders_reason_chk check (
    status not in ('suspended', 'cancelled') or char_length(btrim(coalesce(status_reason, ''))) > 0),
  constraint work_orders_customer_fk foreign key (tenant_id, customer_id)
    references public.customers (tenant_id, id) on delete restrict,
  constraint work_orders_customer_site_fk foreign key (tenant_id, customer_site_id)
    references public.customer_sites (tenant_id, id) on delete restrict,
  constraint work_orders_project_fk foreign key (tenant_id, project_id)
    references public.projects (tenant_id, id) on delete restrict,
  constraint work_orders_project_site_fk foreign key (tenant_id, project_site_id)
    references public.project_sites (tenant_id, id) on delete restrict,
  constraint work_orders_report_fk foreign key (tenant_id, work_report_id)
    references public.work_reports (tenant_id, id) on delete set null (work_report_id)
);

comment on table public.work_orders is
  'Interventi: uscite pianificate con orario, luogo, cliente e squadra; lo stato si aggiorna dal campo.';

create unique index work_orders_number_key on public.work_orders (tenant_id, number);
create index work_orders_schedule_idx on public.work_orders (tenant_id, scheduled_start)
  where deleted_at is null;
create index work_orders_status_idx on public.work_orders (tenant_id, status, scheduled_start)
  where deleted_at is null;
create index work_orders_customer_idx on public.work_orders (tenant_id, customer_id)
  where customer_id is not null and deleted_at is null;
create index work_orders_project_idx on public.work_orders (tenant_id, project_id)
  where project_id is not null and deleted_at is null;

create table public.work_order_assignees (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete restrict,
  work_order_id  uuid not null,
  employee_id    uuid not null,
  is_lead        boolean not null default false,
  created_by     uuid references public.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint work_order_assignees_tenant_id_id_key unique (tenant_id, id),
  constraint work_order_assignees_unique unique (tenant_id, work_order_id, employee_id),
  constraint work_order_assignees_order_fk foreign key (tenant_id, work_order_id)
    references public.work_orders (tenant_id, id) on delete cascade,
  constraint work_order_assignees_employee_fk foreign key (tenant_id, employee_id)
    references public.employees (tenant_id, id) on delete restrict
);

comment on table public.work_order_assignees is 'Squadra di un intervento: persone assegnate, con un capo squadra.';

create unique index work_order_assignees_one_lead on public.work_order_assignees (tenant_id, work_order_id)
  where is_lead;
create index work_order_assignees_employee_idx on public.work_order_assignees (tenant_id, employee_id);

create table public.work_order_events (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete restrict,
  work_order_id  uuid not null,
  from_status    text,
  to_status      text not null,
  reason         text check (reason is null or char_length(reason) <= 1000),
  actor_user_id  uuid references public.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  constraint work_order_events_tenant_id_id_key unique (tenant_id, id),
  constraint work_order_events_order_fk foreign key (tenant_id, work_order_id)
    references public.work_orders (tenant_id, id) on delete cascade
);

comment on table public.work_order_events is 'Storico dei cambi di stato di un intervento (solo il sistema scrive).';

create index work_order_events_order_idx on public.work_order_events (tenant_id, work_order_id, created_at);

-- -----------------------------------------------------------------------------
-- Chi è in squadra, chi vede
-- -----------------------------------------------------------------------------
create or replace function app.work_order_is_mine(p_tenant uuid, p_order uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.work_order_assignees a
      join public.employees e on e.tenant_id = a.tenant_id and e.id = a.employee_id
     where a.tenant_id = p_tenant and a.work_order_id = p_order
       and e.user_id = auth.uid() and e.deleted_at is null);
$$;

create or replace function app.work_order_visible(p_tenant uuid, p_order uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_tenant in (select app.tenant_ids_with_permission('work_orders_all.read'))
      or (p_tenant in (select app.tenant_ids_with_permission('work_orders.read'))
          and app.work_order_is_mine(p_tenant, p_order));
$$;

grant execute on function app.work_order_is_mine(uuid, uuid) to authenticated;
grant execute on function app.work_order_visible(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Regole: collegamenti coerenti, numero, posizione, passaggi di stato
-- -----------------------------------------------------------------------------
create or replace function app.work_order_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year text;
  v_next integer;
  v_planner boolean := auth.uid() is null or app.has_permission(new.tenant_id, 'work_orders.write');
  v_field_cols constant text[] := array['status', 'status_reason', 'field_notes', 'started_at',
    'completed_at', 'updated_at', 'work_report_id'];
  v_project_customer uuid;
  v_site_project uuid;
  v_site_customer_site uuid;
  k text;
begin
  -- collegamenti coerenti tra cliente, sede, commessa e cantiere
  if tg_op = 'INSERT'
     or new.customer_id is distinct from old.customer_id
     or new.customer_site_id is distinct from old.customer_site_id
     or new.project_id is distinct from old.project_id
     or new.project_site_id is distinct from old.project_site_id then
    if new.project_site_id is not null then
      select s.project_id, s.customer_site_id into v_site_project, v_site_customer_site
        from public.project_sites s
       where s.tenant_id = new.tenant_id and s.id = new.project_site_id and s.deleted_at is null;
      if v_site_project is null then
        raise exception 'Cantiere non trovato' using errcode = '23503';
      end if;
      new.project_id := coalesce(new.project_id, v_site_project);
      if new.project_id <> v_site_project then
        raise exception 'Il cantiere non è di questa commessa' using errcode = '23514';
      end if;
      new.customer_site_id := coalesce(new.customer_site_id, v_site_customer_site);
    end if;
    if new.project_id is not null then
      select p.customer_id into v_project_customer
        from public.projects p
       where p.tenant_id = new.tenant_id and p.id = new.project_id and p.deleted_at is null;
      if not found then
        raise exception 'Commessa non trovata' using errcode = '23503';
      end if;
      new.customer_id := coalesce(new.customer_id, v_project_customer);
      if v_project_customer is not null and new.customer_id <> v_project_customer then
        raise exception 'La commessa è di un altro cliente' using errcode = '23514';
      end if;
    end if;
    if new.customer_site_id is not null and new.customer_id is null then
      select cs.customer_id into new.customer_id
        from public.customer_sites cs
       where cs.tenant_id = new.tenant_id and cs.id = new.customer_site_id;
    end if;
    if new.customer_site_id is not null and not exists (
         select 1 from public.customer_sites cs
          where cs.tenant_id = new.tenant_id and cs.id = new.customer_site_id
            and cs.customer_id = new.customer_id) then
      raise exception 'La sede non è di questo cliente' using errcode = '23514';
    end if;
  end if;

  if tg_op = 'INSERT' then
    v_year := to_char(new.scheduled_start at time zone 'Europe/Rome', 'YYYY');
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('work_orders:' || new.tenant_id::text || ':' || v_year, 0));
    select coalesce(max(substring(w.number from '^' || v_year || '-([0-9]{4,6})$')::integer), 0) + 1
      into v_next
      from public.work_orders w
     where w.tenant_id = new.tenant_id and w.number like v_year || '-%';
    new.number := v_year || '-' || lpad(v_next::text, 4, '0');
    new.status := 'scheduled';
    new.status_reason := null;
    new.started_at := null;
    new.completed_at := null;
    new.work_report_id := null;

    -- indirizzo e posizione: dal cantiere, dalla sede o dal cliente, se non scritti a mano
    if new.address_line is null then
      if new.project_site_id is not null then
        select s.address_line, s.postal_code, s.city, s.province, s.latitude, s.longitude
          into new.address_line, new.postal_code, new.city, new.province, new.latitude, new.longitude
          from public.project_sites s
         where s.tenant_id = new.tenant_id and s.id = new.project_site_id;
      end if;
      if new.address_line is null and new.customer_site_id is not null then
        select cs.address_line, cs.postal_code, cs.city, cs.province, cs.latitude, cs.longitude
          into new.address_line, new.postal_code, new.city, new.province, new.latitude, new.longitude
          from public.customer_sites cs
         where cs.tenant_id = new.tenant_id and cs.id = new.customer_site_id;
      end if;
      if new.address_line is null and new.customer_id is not null then
        select c.billing_address_line, c.billing_postal_code, c.billing_city, c.billing_province,
               c.latitude, c.longitude
          into new.address_line, new.postal_code, new.city, new.province, new.latitude, new.longitude
          from public.customers c
         where c.tenant_id = new.tenant_id and c.id = new.customer_id;
      end if;
    end if;
    return new;
  end if;

  if new.number <> old.number then
    raise exception 'Il numero dell''intervento non cambia' using errcode = '42501';
  end if;

  -- dal campo: solo chi è in squadra, e solo stato e note
  if not v_planner then
    if not app.work_order_is_mine(new.tenant_id, new.id) then
      raise exception 'Puoi aggiornare solo i tuoi interventi' using errcode = '42501';
    end if;
    for k in select jsonb_object_keys(to_jsonb(new)) loop
      if k <> all (v_field_cols) and (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k) then
        raise exception 'Dal campo puoi cambiare solo stato e note' using errcode = '42501';
      end if;
    end loop;
  end if;

  if new.status <> old.status then
    if not (
         (old.status = 'scheduled'   and new.status in ('in_progress', 'suspended'))
      or (old.status = 'in_progress' and new.status in ('suspended', 'completed'))
      or (old.status = 'suspended'   and new.status in ('in_progress', 'completed'))
      or (v_planner and new.status = 'cancelled' and old.status <> 'completed')
      or (v_planner and old.status = 'completed' and new.status = 'in_progress')
      or (v_planner and old.status = 'cancelled' and new.status = 'scheduled')
    ) then
      raise exception 'Passaggio di stato non permesso' using errcode = '23514';
    end if;
    if new.status = 'in_progress' then
      new.started_at := coalesce(old.started_at, now());
      new.completed_at := null;
    elsif new.status = 'completed' then
      new.started_at := coalesce(old.started_at, now());
      new.completed_at := now();
    elsif new.status = 'scheduled' then
      new.started_at := null;
      new.completed_at := null;
    end if;
    if new.status not in ('suspended', 'cancelled') then
      new.status_reason := null;
    end if;
  else
    new.started_at := old.started_at;
    new.completed_at := old.completed_at;
  end if;
  return new;
end;
$$;

create trigger work_orders_guard
  before insert or update on public.work_orders
  for each row execute function app.work_order_guard();

-- Storico degli stati
create or replace function app.work_order_log_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status <> old.status then
    insert into public.work_order_events (tenant_id, work_order_id, from_status, to_status, reason, actor_user_id)
    values (new.tenant_id, new.id, case when tg_op = 'UPDATE' then old.status end, new.status,
            new.status_reason, auth.uid());
  end if;
  return null;
end;
$$;

create trigger work_orders_log_status
  after insert or update of status on public.work_orders
  for each row execute function app.work_order_log_status();

-- -----------------------------------------------------------------------------
-- Avvisi alla squadra: assegnazione, orario spostato, annullamento
-- -----------------------------------------------------------------------------
create or replace function app.work_order_notify_assignee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_order public.work_orders%rowtype;
begin
  select e.user_id into v_user
    from public.employees e
   where e.tenant_id = new.tenant_id and e.id = new.employee_id;
  if v_user is null or v_user is not distinct from app.current_actor() then
    return null;
  end if;
  select * into v_order from public.work_orders w
   where w.tenant_id = new.tenant_id and w.id = new.work_order_id;
  if v_order.deleted_at is not null or v_order.status in ('completed', 'cancelled') then
    return null;
  end if;
  insert into public.notifications (tenant_id, user_id, kind, title, body, link, dedupe_key)
  values (new.tenant_id, v_user, 'work_orders.assigned', 'Nuovo intervento assegnato',
          left(v_order.title || ' — ' ||
               to_char(v_order.scheduled_start at time zone 'Europe/Rome', 'DD/MM/YYYY HH24:MI'), 2000),
          '/app/interventi/' || v_order.id,
          'work_order.assigned:' || v_order.id || ':' || v_user)
  on conflict (tenant_id, user_id, dedupe_key) where dedupe_key is not null do nothing;
  return null;
end;
$$;

create trigger work_order_assignees_notify
  after insert on public.work_order_assignees
  for each row execute function app.work_order_notify_assignee();

create or replace function app.work_order_notify_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
  v_title text;
  v_key text;
begin
  if new.deleted_at is not null then
    return null;
  end if;
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    v_kind := 'work_orders.cancelled';
    v_title := 'Intervento annullato';
    v_key := 'work_order.cancelled:' || new.id || ':' || extract(epoch from now())::bigint;
  elsif new.status not in ('completed', 'cancelled')
        and (new.scheduled_start <> old.scheduled_start or new.scheduled_end <> old.scheduled_end) then
    v_kind := 'work_orders.rescheduled';
    v_title := 'Orario dell''intervento cambiato';
    v_key := 'work_order.rescheduled:' || new.id || ':' || extract(epoch from new.scheduled_start)::bigint;
  else
    return null;
  end if;
  insert into public.notifications (tenant_id, user_id, kind, title, body, link, dedupe_key)
  select new.tenant_id, e.user_id, v_kind, v_title,
         left(new.title || ' — ' ||
              to_char(new.scheduled_start at time zone 'Europe/Rome', 'DD/MM/YYYY HH24:MI'), 2000),
         '/app/interventi/' || new.id,
         v_key || ':' || e.user_id
    from public.work_order_assignees a
    join public.employees e on e.tenant_id = a.tenant_id and e.id = a.employee_id
   where a.tenant_id = new.tenant_id and a.work_order_id = new.id
     and e.user_id is not null and e.user_id is distinct from app.current_actor()
  on conflict (tenant_id, user_id, dedupe_key) where dedupe_key is not null do nothing;
  return null;
end;
$$;

create trigger work_orders_notify_changes
  after update of status, scheduled_start, scheduled_end on public.work_orders
  for each row execute function app.work_order_notify_changes();

-- -----------------------------------------------------------------------------
-- Trigger standard, grant, policy
-- -----------------------------------------------------------------------------
select app.attach_tenant_table_triggers('public.work_orders');
select app.grant_tenant_table('public.work_orders');
select app.create_tenant_policies('public.work_orders', 'work_orders.read', 'work_orders.write', 'work_orders.delete');

select app.attach_tenant_table_triggers('public.work_order_assignees');
select app.grant_tenant_table('public.work_order_assignees');
select app.create_tenant_policies('public.work_order_assignees', 'work_orders.read', 'work_orders.write', 'work_orders.write');

select app.attach_tenant_table_triggers('public.work_order_events');
alter table public.work_order_events enable row level security;
grant select on public.work_order_events to authenticated;
grant all on public.work_order_events to service_role;

-- vedere: tutti, oppure solo gli interventi in cui si è in squadra
drop policy work_orders_select on public.work_orders;
create policy work_orders_select on public.work_orders for select to authenticated
  using (app.work_order_visible(tenant_id, id));
drop policy work_order_assignees_select on public.work_order_assignees;
create policy work_order_assignees_select on public.work_order_assignees for select to authenticated
  using (app.work_order_visible(tenant_id, work_order_id));
create policy work_order_events_select on public.work_order_events for select to authenticated
  using (app.work_order_visible(tenant_id, work_order_id));

-- aggiornare: chi pianifica, oppure chi è in squadra (il trigger limita a stato e note)
drop policy work_orders_update on public.work_orders;
create policy work_orders_update on public.work_orders for update to authenticated
  using (tenant_id in (select app.tenant_ids_with_permission('work_orders.write'))
         or (tenant_id in (select app.tenant_ids_with_permission('work_orders.read'))
             and app.work_order_is_mine(tenant_id, id)))
  with check (tenant_id in (select app.tenant_ids_with_permission('work_orders.write'))
              or (tenant_id in (select app.tenant_ids_with_permission('work_orders.read'))
                  and app.work_order_is_mine(tenant_id, id)));

-- -----------------------------------------------------------------------------
-- Permessi
-- -----------------------------------------------------------------------------
insert into public.permissions (key, description) values
  ('work_orders.read',     'Vedere i propri interventi e aggiornarne stato e note'),
  ('work_orders_all.read', 'Vedere gli interventi di tutta l''azienda'),
  ('work_orders.write',    'Pianificare, assegnare, spostare e annullare gli interventi'),
  ('work_orders.delete',   'Eliminare gli interventi');
update public.permissions set requires_mfa = true where key in ('work_orders.delete');

select app.grant_system_permissions('owner',
  array['work_orders.read','work_orders_all.read','work_orders.write','work_orders.delete']);
select app.grant_system_permissions('admin',
  array['work_orders.read','work_orders_all.read','work_orders.write','work_orders.delete']);
select app.grant_system_permissions('operations_manager',
  array['work_orders.read','work_orders_all.read','work_orders.write']);
select app.grant_system_permissions('site_manager',
  array['work_orders.read','work_orders_all.read','work_orders.write']);
-- l'ufficio pianifica le uscite
select app.grant_system_permissions('back_office',
  array['work_orders.read','work_orders_all.read','work_orders.write']);
select app.grant_system_permissions('technician',   array['work_orders.read']);
select app.grant_system_permissions('viewer',       array['work_orders.read','work_orders_all.read']);

revoke execute on all functions in schema app from public;
