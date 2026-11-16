-- =============================================================================
-- CantiereOS — Notifiche in-app
-- -----------------------------------------------------------------------------
-- Notifiche per utente e azienda. Le crea solo il sistema (trigger, worker con
-- service_role): un utente non può scrivere notifiche, né per sé né per altri.
-- L'utente legge e segna come lette solo le proprie, nelle aziende in cui è
-- membro attivo.
-- =============================================================================

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  user_id     uuid not null,
  kind        text not null check (kind ~ '^[a-z][a-z0-9_.]{1,63}$'),
  title       text not null check (char_length(title) between 1 and 200),
  body        text check (body is null or char_length(body) <= 2000),
  -- solo percorsi interni dell'app (niente link esterni nelle notifiche)
  link        text check (link is null or (link ~ '^/[A-Za-z0-9]' and char_length(link) <= 500)),
  read_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, id),
  constraint notifications_member_fk foreign key (tenant_id, user_id)
    references public.memberships (tenant_id, user_id) on delete cascade
);

comment on table public.notifications is
  'Notifiche in-app per utente e azienda. Scritte solo dal sistema; l''utente può solo leggerle e segnarle come lette.';

create index notifications_inbox_idx
  on public.notifications (tenant_id, user_id, created_at desc);
create index notifications_unread_idx
  on public.notifications (tenant_id, user_id) where read_at is null;

select app.attach_tenant_table_triggers('public.notifications');

revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant all on public.notifications to service_role;

alter table public.notifications enable row level security;

create policy notifications_select on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()) and tenant_id in (select app.user_tenant_ids()));
create policy notifications_update on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()) and tenant_id in (select app.user_tenant_ids()))
  with check (user_id = (select auth.uid()) and tenant_id in (select app.user_tenant_ids()));

-- -----------------------------------------------------------------------------
-- Prima sorgente reale di notifiche: invito accettato → avvisa chi ha invitato.
-- -----------------------------------------------------------------------------
create or replace function app.notify_invitation_accepted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if new.accepted_at is not null and old.accepted_at is null and new.created_by is not null
     and exists (select 1 from public.memberships m
                 where m.tenant_id = new.tenant_id and m.user_id = new.created_by and m.status = 'active') then
    select coalesce(u.full_name, u.email) into v_name from public.users u where u.id = new.accepted_by;
    insert into public.notifications (tenant_id, user_id, kind, title, body, link)
    values (new.tenant_id, new.created_by, 'members.invitation_accepted',
            'Invito accettato',
            coalesce(v_name, new.email) || ' è entrato nell''azienda.',
            '/app/membri');
  end if;
  return null;
end;
$$;

create trigger invitations_notify_accepted
  after update of accepted_at on public.invitations
  for each row execute function app.notify_invitation_accepted();

revoke execute on all functions in schema app from public;
