-- =============================================================================
-- CantiereOS — Revoca immediata delle sessioni e registrazione azienda
-- -----------------------------------------------------------------------------
-- Un JWT di Supabase resta valido fino alla scadenza (exp) anche dopo il
-- logout. Per rendere logout, "esci da tutti i dispositivi" e sospensione
-- efficaci SUBITO, il server verifica a ogni transazione che la sessione
-- indicata dal claim `session_id` esista ancora in auth.sessions (gestita da
-- Supabase Auth) e non sia scaduta (not_after).
-- =============================================================================

create or replace function app.current_session_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from auth.sessions s
     where s.id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'session_id')::uuid
       and s.user_id = auth.uid()
       and (s.not_after is null or s.not_after > now())
  )
$$;

comment on function app.current_session_active() is
  'true se la sessione del JWT corrente (claim session_id) è ancora attiva in auth.sessions.';

-- -----------------------------------------------------------------------------
-- Registrazione self-service di un'azienda
-- -----------------------------------------------------------------------------
-- Il titolare è sempre auth.uid() (mai un id passato dal client); servono
-- sessione attiva ed email confermata. Piano, posti e durata della prova sono
-- fissati qui e non sono parametri: un client non può sceglierli. Limite di
-- aziende possedute per utente contro gli abusi.
create or replace function app.register_company(p_name text, p_slug text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_owned integer;
  v_tenant_id uuid;
begin
  if v_uid is null or not app.current_session_active() then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  -- serializza le registrazioni dello stesso utente (limite affidabile)
  perform 1 from auth.users u where u.id = v_uid and u.email_confirmed_at is not null for update;
  if not found then
    raise exception 'email not confirmed' using errcode = '42501';
  end if;

  if p_name is null or char_length(btrim(p_name)) not between 2 and 200 then
    raise exception 'invalid company name' using errcode = '22023';
  end if;

  select count(*) into v_owned
  from public.memberships m
  join public.roles r on r.id = m.role_id and r.tenant_id is null and r.key = 'owner'
  where m.user_id = v_uid;
  if v_owned >= 3 then
    raise exception 'company limit reached' using errcode = '53400';
  end if;

  v_tenant_id := app.create_tenant(btrim(p_name), p_slug, v_uid, 'trial', 5, now() + interval '30 days');
  update public.users set last_active_tenant_id = v_tenant_id where id = v_uid;
  return v_tenant_id;
end;
$$;

comment on function app.register_company(text, text) is
  'Registrazione self-service: crea azienda in prova (30 giorni, 5 posti) con titolare auth.uid().';

revoke execute on all functions in schema app from public;
grant execute on function app.current_session_active() to authenticated, service_role;
grant execute on function app.register_company(text, text) to authenticated;
