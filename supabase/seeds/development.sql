-- =============================================================================
-- CantiereOS — SEED DI SVILUPPO (dati DIMOSTRATIVI, non reali)
-- -----------------------------------------------------------------------------
-- * NON è una migrazione: non sta in supabase/migrations e non viene mai
--   applicato da `supabase db push` né dalla CI di deploy.
-- * Uso: solo database locali/di sviluppo (es. `supabase db reset` con
--   [db.seed] sql_paths = ['./seeds/development.sql'] in config.toml).
-- * Protezioni:
--   1. si rifiuta di girare se il database contiene aziende reali
--      (tenants.is_demo = false);
--   2. tutte le aziende create hanno is_demo = true e nome "DEMO …";
--   3. email su dominio riservato .invalid (RFC 2606): nessun invio reale;
--   4. idempotente: una seconda esecuzione non duplica nulla.
-- * Gli utenti demo NON hanno password: per accedere dall'app andranno creati
--   tramite Supabase Auth (fase 2). Qui servono a popolare relazioni e RLS.
-- =============================================================================

do $$
begin
  if exists (select 1 from public.tenants where not is_demo) then
    raise exception 'Seed di sviluppo rifiutato: il database contiene aziende reali (is_demo = false).'
      using errcode = 'P0001';
  end if;
end
$$;

-- Utenti demo (il trigger on_auth_user_created crea le righe in public.users)
insert into auth.users (id, email) values
  ('d0000000-0000-4000-8000-000000000001', 'titolare.alfa@demo.cantiereos.invalid'),
  ('d0000000-0000-4000-8000-000000000002', 'ufficio.alfa@demo.cantiereos.invalid'),
  ('d0000000-0000-4000-8000-000000000003', 'tecnico.alfa@demo.cantiereos.invalid'),
  ('d0000000-0000-4000-8000-000000000004', 'titolare.beta@demo.cantiereos.invalid'),
  ('d0000000-0000-4000-8000-000000000005', 'tecnico.beta@demo.cantiereos.invalid')
on conflict (id) do nothing;

update public.users u set full_name = v.full_name
from (values
  ('d0000000-0000-4000-8000-000000000001'::uuid, 'Demo Titolare Alfa'),
  ('d0000000-0000-4000-8000-000000000002'::uuid, 'Demo Ufficio Alfa'),
  ('d0000000-0000-4000-8000-000000000003'::uuid, 'Demo Tecnico Alfa'),
  ('d0000000-0000-4000-8000-000000000004'::uuid, 'Demo Titolare Beta'),
  ('d0000000-0000-4000-8000-000000000005'::uuid, 'Demo Tecnico Beta')
) as v(id, full_name)
where u.id = v.id and u.full_name is null;

-- Aziende demo
insert into public.tenants (id, name, slug, legal_name, status, is_demo) values
  ('d1000000-0000-4000-8000-000000000001', 'DEMO Edilizia Alfa', 'demo-edilizia-alfa', 'DEMO Edilizia Alfa S.r.l.', 'trial', true),
  ('d1000000-0000-4000-8000-000000000002', 'DEMO Impianti Beta', 'demo-impianti-beta', 'DEMO Impianti Beta S.n.c.', 'trial', true)
on conflict (id) do nothing;

insert into public.subscriptions (id, tenant_id, plan_code, status, seats, trial_ends_at) values
  ('d1100000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'demo', 'trialing', 10, now() + interval '365 days'),
  ('d1100000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000002', 'demo', 'trialing', 10, now() + interval '365 days')
on conflict (id) do nothing;

insert into public.memberships (id, tenant_id, user_id, role_id, status)
select v.id, v.tenant_id, v.user_id, r.id, 'active'
from (values
  ('d1200000-0000-4000-8000-000000000001'::uuid, 'd1000000-0000-4000-8000-000000000001'::uuid, 'd0000000-0000-4000-8000-000000000001'::uuid, 'owner'),
  ('d1200000-0000-4000-8000-000000000002'::uuid, 'd1000000-0000-4000-8000-000000000001'::uuid, 'd0000000-0000-4000-8000-000000000002'::uuid, 'back_office'),
  ('d1200000-0000-4000-8000-000000000003'::uuid, 'd1000000-0000-4000-8000-000000000001'::uuid, 'd0000000-0000-4000-8000-000000000003'::uuid, 'technician'),
  ('d1200000-0000-4000-8000-000000000004'::uuid, 'd1000000-0000-4000-8000-000000000002'::uuid, 'd0000000-0000-4000-8000-000000000004'::uuid, 'owner'),
  ('d1200000-0000-4000-8000-000000000005'::uuid, 'd1000000-0000-4000-8000-000000000002'::uuid, 'd0000000-0000-4000-8000-000000000005'::uuid, 'technician')
) as v(id, tenant_id, user_id, role_key)
join public.roles r on r.tenant_id is null and r.key = v.role_key
on conflict (id) do nothing;

-- Clienti
insert into public.customers (id, tenant_id, code, party_type, display_name, vat_number, email,
                              billing_address_line, billing_postal_code, billing_city, billing_province) values
  ('d2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'C001', 'company',    'DEMO Condominio Le Querce', null, 'amministrazione@querce.demo.cantiereos.invalid', 'Via Esempio 1', '20100', 'Milano', 'MI'),
  ('d2000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001', 'C002', 'individual', 'DEMO Cliente Privato',      null, null, 'Via Esempio 2', '24100', 'Bergamo', 'BG'),
  ('d2000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000001', 'C003', 'public_entity', 'DEMO Comune di Esempio', null, null, 'Piazza Esempio 1', '25100', 'Brescia', 'BS'),
  ('d2000000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000002', 'C001', 'company',    'DEMO Hotel Panorama',        null, null, 'Via Esempio 3', '38100', 'Trento', 'TN')
on conflict (id) do nothing;

-- Fornitori
insert into public.suppliers (id, tenant_id, code, display_name, category, city, province) values
  ('d3000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'F001', 'DEMO Materiali Edili Nord', 'Materiali edili', 'Milano', 'MI'),
  ('d3000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001', 'F002', 'DEMO Noleggio Ponteggi',    'Noleggi',         'Monza',  'MB'),
  ('d3000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000002', 'F001', 'DEMO Termoidraulica Ingrosso', 'Idraulica',    'Verona', 'VR')
on conflict (id) do nothing;

-- Contatti
insert into public.contacts (id, tenant_id, customer_id, supplier_id, first_name, last_name, role_title, is_primary) values
  ('d4000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', null, 'Demo', 'Amministratore', 'Amministratore condominio', true),
  ('d4000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001', null, 'd3000000-0000-4000-8000-000000000001', 'Demo', 'Commerciale', 'Agente', true),
  ('d4000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000004', null, 'Demo', 'Direttore', 'Direttore struttura', true)
on conflict (id) do nothing;

-- Sedi
insert into public.customer_sites (id, tenant_id, customer_id, name, address_line, postal_code, city, province) values
  ('d5000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'Condominio - Scala A', 'Via Esempio 1', '20100', 'Milano', 'MI'),
  ('d5000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000003', 'Scuola comunale',      'Via Esempio 10', '25100', 'Brescia', 'BS'),
  ('d5000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000004', 'Hotel - Centrale termica', 'Via Esempio 3', '38100', 'Trento', 'TN')
on conflict (id) do nothing;

-- Dipendenti
insert into public.employees (id, tenant_id, user_id, employee_code, first_name, last_name, job_title) values
  ('d6000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000003', 'E001', 'Demo', 'Caposquadra', 'Capocantiere'),
  ('d6000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001', null,                                   'E002', 'Demo', 'Muratore',    'Muratore'),
  ('d6000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000001', null,                                   'E003', 'Demo', 'Manovale',    'Manovale'),
  ('d6000000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000005', 'E001', 'Demo', 'Idraulico',   'Idraulico')
on conflict (id) do nothing;

-- Squadre
insert into public.teams (id, tenant_id, name, color, leader_employee_id) values
  ('d7000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'Squadra Demo 1', '#1E3A8A', 'd6000000-0000-4000-8000-000000000001'),
  ('d7000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000002', 'Squadra Demo Impianti', '#2563EB', 'd6000000-0000-4000-8000-000000000004')
on conflict (id) do nothing;

insert into public.team_members (id, tenant_id, team_id, employee_id) values
  ('d7100000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000001'),
  ('d7100000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000002'),
  ('d7100000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000003'),
  ('d7100000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000002', 'd7000000-0000-4000-8000-000000000002', 'd6000000-0000-4000-8000-000000000004')
on conflict (id) do nothing;
