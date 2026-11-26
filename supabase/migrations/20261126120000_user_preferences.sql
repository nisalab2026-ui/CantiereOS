-- =============================================================================
-- CantiereOS — Preferenze personali (ADR-018)
-- -----------------------------------------------------------------------------
-- Impostazioni dell'interfaccia di una persona in un'azienda: disposizione della
-- panoramica, filtri salvati degli elenchi. Una riga per (azienda, utente,
-- chiave). Ognuno legge e scrive solo le proprie, e solo nelle aziende in cui
-- è membro attivo. Non contengono dati aziendali: solo scelte di visualizzazione.
-- =============================================================================

create table public.user_preferences (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  user_id     uuid not null,
  -- es. 'dashboard.layout', 'filters.clienti'
  key         text not null check (key ~ '^[a-z][a-z0-9_.-]{1,63}$'),
  value       jsonb not null check (
                jsonb_typeof(value) in ('object', 'array')
                and pg_column_size(value) <= 16384
              ),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, user_id, key),
  constraint user_preferences_member_fk foreign key (tenant_id, user_id)
    references public.memberships (tenant_id, user_id) on delete cascade
);

comment on table public.user_preferences is
  'Preferenze personali dell''interfaccia (panoramica, filtri salvati) per utente e azienda. Solo il proprietario le legge e le scrive.';

select app.attach_tenant_table_triggers('public.user_preferences');

revoke all on public.user_preferences from anon, authenticated;
grant select, delete on public.user_preferences to authenticated;
grant insert (tenant_id, user_id, key, value) on public.user_preferences to authenticated;
grant update (value) on public.user_preferences to authenticated;
grant all on public.user_preferences to service_role;

alter table public.user_preferences enable row level security;

create policy user_preferences_select on public.user_preferences
  for select to authenticated
  using (user_id = (select auth.uid()) and tenant_id in (select app.user_tenant_ids()));
create policy user_preferences_insert on public.user_preferences
  for insert to authenticated
  with check (user_id = (select auth.uid()) and tenant_id in (select app.user_tenant_ids()));
create policy user_preferences_update on public.user_preferences
  for update to authenticated
  using (user_id = (select auth.uid()) and tenant_id in (select app.user_tenant_ids()))
  with check (user_id = (select auth.uid()) and tenant_id in (select app.user_tenant_ids()));
create policy user_preferences_delete on public.user_preferences
  for delete to authenticated
  using (user_id = (select auth.uid()) and tenant_id in (select app.user_tenant_ids()));
