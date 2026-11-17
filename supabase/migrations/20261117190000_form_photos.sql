-- =============================================================================
-- CantiereOS — Foto nei moduli compilabili (ADR-013, aggiunta "Foto")
-- -----------------------------------------------------------------------------
-- form_submission_files: una foto scattata o caricata in un campo "Foto" di un
-- modulo. Il file sta nel bucket PRIVATO di Supabase Storage; qui c'è solo la
-- scheda con la chiave generata dal database ({tenant}/{modulo}/{foto}).
-- Flusso in due passi come l'archivio documentale: la scheda nasce "pending",
-- il server verifica dimensione e tipo reale del file e la porta a "ready"
-- oppure "rejected". Il valore del campo nel modulo è l'elenco degli id.
-- Foto aggiunte o tolte solo finché il modulo è in compilazione: un modulo
-- chiuso non cambia, neanche nelle foto.
-- =============================================================================

create table public.form_submission_files (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete restrict,
  submission_id  uuid not null,
  field_id       text not null check (field_id ~ '^[a-z][a-z0-9_]{0,39}$'),
  original_name  text not null check (char_length(original_name) between 1 and 255),
  mime_type      text check (mime_type is null or mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes     bigint check (size_bytes is null or size_bytes between 1 and 10485760),
  status         text not null default 'pending' check (status in ('pending', 'ready', 'rejected')),
  reject_reason  text check (reject_reason is null or char_length(reject_reason) <= 200),
  storage_key    text generated always as (tenant_id::text || '/' || submission_id::text || '/' || id::text) stored,
  verified_at    timestamptz,
  created_by     uuid references public.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  constraint form_submission_files_tenant_id_id_key unique (tenant_id, id),
  constraint form_submission_files_submission_fk foreign key (tenant_id, submission_id)
    references public.form_submissions (tenant_id, id) on delete restrict,
  constraint form_submission_files_ready_chk check (
    status <> 'ready' or (mime_type is not null and size_bytes is not null and verified_at is not null))
);

create index form_submission_files_submission_idx
  on public.form_submission_files (tenant_id, submission_id, created_at);

-- Il modulo deve essere in compilazione (e non eliminato) per aggiungere,
-- verificare o togliere foto. La verifica cambia solo pending → ready/rejected.
create or replace function app.form_file_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  select s.status into v_status
    from public.form_submissions s
   where s.tenant_id = new.tenant_id and s.id = new.submission_id and s.deleted_at is null;
  if v_status is null then
    raise exception 'Modulo non trovato' using errcode = '23514';
  end if;
  if v_status <> 'draft' then
    raise exception 'Il modulo è chiuso: riaprilo per cambiare le foto' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    new.status := 'pending';
    new.mime_type := null;
    new.size_bytes := null;
    new.verified_at := null;
    new.reject_reason := null;
    new.deleted_at := null;
    return new;
  end if;

  if new.submission_id <> old.submission_id or new.field_id <> old.field_id
     or new.original_name <> old.original_name or new.created_by is distinct from old.created_by
     or new.created_at <> old.created_at then
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

create trigger form_submission_files_guard
  before insert or update on public.form_submission_files
  for each row execute function app.form_file_guard();

select app.attach_tenant_table_triggers('public.form_submission_files');
select app.grant_tenant_table('public.form_submission_files');
revoke delete on public.form_submission_files from authenticated;

alter table public.form_submission_files enable row level security;
-- Le foto seguono la visibilità del modulo (RLS del modulo nella subquery).
create policy form_submission_files_select on public.form_submission_files for select to authenticated
  using (
    tenant_id in (select app.tenant_ids_with_permission('forms.read'))
    and exists (select 1 from public.form_submissions s
                 where s.tenant_id = form_submission_files.tenant_id
                   and s.id = form_submission_files.submission_id)
  );
create policy form_submission_files_insert on public.form_submission_files for insert to authenticated
  with check (tenant_id in (select app.tenant_ids_with_permission('forms.write')));
create policy form_submission_files_update on public.form_submission_files for update to authenticated
  using (tenant_id in (select app.tenant_ids_with_permission('forms.write')))
  with check (tenant_id in (select app.tenant_ids_with_permission('forms.write')));

revoke execute on all functions in schema app from public;
