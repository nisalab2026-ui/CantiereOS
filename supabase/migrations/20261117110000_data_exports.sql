-- =============================================================================
-- CantiereOS — Registro delle esportazioni
-- -----------------------------------------------------------------------------
-- Ogni esportazione (CSV di una lista o del registro attività) lascia una riga
-- in `data_exports`: chi, quando, quale sezione, con quali filtri e quante
-- righe. La riga passa dal trigger di audit come ogni altra tabella, quindi
-- compare nel registro attività ("ha esportato").
--
-- Regole:
--   * può registrare un'esportazione solo chi può leggere quella sezione
--     (stesso permesso della lista; per il registro serve audit.read);
--   * le righe si leggono con audit.read (sono parte del registro);
--   * le righe sono immutabili: nessuna policy e nessun privilegio di update
--     o delete per gli utenti.
-- =============================================================================

create table public.data_exports (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete restrict,
  section     text not null check (section in (
                'customers', 'suppliers', 'employees', 'teams', 'deadlines', 'audit')),
  format      text not null default 'csv' check (format in ('csv')),
  filters     jsonb not null default '{}'::jsonb
                check (jsonb_typeof(filters) = 'object' and octet_length(filters::text) <= 4000),
  row_count   integer not null check (row_count >= 0),
  created_by  uuid references public.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint data_exports_tenant_id_id_key unique (tenant_id, id)
);

comment on table public.data_exports is
  'Esportazioni eseguite (append-only): sezione, filtri, numero di righe, autore. Visibili nel registro attività.';

create index data_exports_tenant_created_idx on public.data_exports (tenant_id, created_at desc);

-- Permesso di lettura richiesto per esportare ciascuna sezione.
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
  end;
$$;

select app.attach_tenant_table_triggers('public.data_exports');
select app.grant_tenant_table('public.data_exports');
-- append-only: niente update/delete per gli utenti
revoke update, delete on public.data_exports from authenticated;

alter table public.data_exports enable row level security;

create policy data_exports_select on public.data_exports
  for select to authenticated
  using (tenant_id in (select app.tenant_ids_with_permission('audit.read')));

create policy data_exports_insert on public.data_exports
  for insert to authenticated
  with check (
    tenant_id in (select app.tenant_ids_with_permission(app.export_section_permission(section)))
    and created_by is not distinct from app.current_actor()
  );

grant execute on function app.export_section_permission(text) to authenticated;

revoke execute on all functions in schema app from public;
