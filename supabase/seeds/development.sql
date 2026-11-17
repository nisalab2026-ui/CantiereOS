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

-- Scadenze DEMO (date relative a oggi: la dashboard mostra sempre casi realistici)
insert into public.deadlines (id, tenant_id, kind, title, reference_code, due_date, remind_days_before,
                              recurrence_months, customer_id, supplier_id, employee_id, responsible_user_id) values
  ('d8000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'maintenance',   'DEMO Manutenzione caldaia condominiale', 'CT-01', current_date - 4,  30, 12, 'd2000000-0000-4000-8000-000000000001', null, null, 'd0000000-0000-4000-8000-000000000002'),
  ('d8000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001', 'certification', 'DEMO Patentino PLE',                     'PLE-2291', current_date + 5, 30, 60, null, null, 'd6000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002'),
  ('d8000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000001', 'certification', 'DEMO Corso sicurezza lavoratori',        null, current_date + 20, 30, 60, null, null, 'd6000000-0000-4000-8000-000000000002', null),
  ('d8000000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000001', 'inspection',    'DEMO Verifica estintori scuola',         null, current_date + 45, 30, 6,  'd2000000-0000-4000-8000-000000000003', null, null, 'd0000000-0000-4000-8000-000000000001'),
  ('d8000000-0000-4000-8000-000000000005', 'd1000000-0000-4000-8000-000000000001', 'contract',      'DEMO Rinnovo contratto noleggio ponteggi', null, current_date + 75, 30, null, null, 'd3000000-0000-4000-8000-000000000002', null, 'd0000000-0000-4000-8000-000000000001'),
  ('d8000000-0000-4000-8000-000000000006', 'd1000000-0000-4000-8000-000000000001', 'document',      'DEMO DURC aziendale',                    null, current_date + 110, 30, 4, null, null, null, null),
  ('d8000000-0000-4000-8000-000000000007', 'd1000000-0000-4000-8000-000000000001', 'payment',       'DEMO Verifica incasso SAL 2',            null, current_date - 1,  7,  null, 'd2000000-0000-4000-8000-000000000003', null, null, null),
  ('d8000000-0000-4000-8000-000000000008', 'd1000000-0000-4000-8000-000000000002', 'maintenance',   'DEMO Manutenzione centrale termica hotel', null, current_date + 12, 30, 12, 'd2000000-0000-4000-8000-000000000004', null, null, 'd0000000-0000-4000-8000-000000000004')
on conflict (id) do nothing;

-- Attività DEMO (date relative a oggi) e commenti interni, scritti a nome dell'ufficio
do $$ begin perform set_config('app.actor_user_id', 'd0000000-0000-4000-8000-000000000002', false); end $$;
insert into public.tasks (id, tenant_id, title, description, status, priority, due_date,
                          assignee_user_id, customer_id, employee_id, team_id) values
  ('d9000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'DEMO Sopralluogo per preventivo bagno', 'Misure e foto del locale, verificare scarichi.', 'todo', 'high', current_date + 1, 'd0000000-0000-4000-8000-000000000003', 'd2000000-0000-4000-8000-000000000001', null, null),
  ('d9000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001', 'DEMO Ordinare materiale impianto elettrico', null, 'in_progress', 'normal', current_date + 3, 'd0000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000003', null, null),
  ('d9000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000001', 'DEMO Inviare SAL al cliente', null, 'todo', 'urgent', current_date - 2, 'd0000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000003', null, null),
  ('d9000000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000001', 'DEMO Consegnare DPI alla squadra', null, 'todo', 'normal', current_date + 6, 'd0000000-0000-4000-8000-000000000003', null, null, 'd7000000-0000-4000-8000-000000000001'),
  ('d9000000-0000-4000-8000-000000000005', 'd1000000-0000-4000-8000-000000000001', 'DEMO Prenotare visita medica', null, 'todo', 'low', current_date + 10, null, null, 'd6000000-0000-4000-8000-000000000002', null)
on conflict (id) do nothing;

insert into public.comments (id, tenant_id, subject_table, subject_id, body) values
  ('da000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'tasks', 'd9000000-0000-4000-8000-000000000001', 'DEMO Il cliente è disponibile solo al mattino, chiamare prima.'),
  ('da000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001', 'customers', 'd2000000-0000-4000-8000-000000000001', 'DEMO Amministratore cambiato da gennaio: aggiornare i contatti.')
on conflict (id) do nothing;
do $$ begin perform set_config('app.actor_user_id', '', false); end $$;

-- Pagamenti e comunicazioni DEMO (date relative a oggi), scritti a nome dell'ufficio
do $$ begin perform set_config('app.actor_user_id', 'd0000000-0000-4000-8000-000000000002', false); end $$;
insert into public.payments (id, tenant_id, direction, description, reference_code, amount_cents, due_date,
                             method, customer_id, supplier_id) values
  ('db000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'incoming', 'DEMO SAL 1 lavori condominio', 'FT-2026/118', 1250000, current_date - 6,  'bank_transfer', 'd2000000-0000-4000-8000-000000000001', null),
  ('db000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001', 'incoming', 'DEMO SAL 2 impianto elettrico scuola', 'SAL-2', 860000, current_date + 18, 'bank_transfer', 'd2000000-0000-4000-8000-000000000003', null),
  ('db000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000001', 'outgoing', 'DEMO Noleggio ponteggi ottobre', 'NP-5521', 184000, current_date + 4, 'riba', null, 'd3000000-0000-4000-8000-000000000002'),
  ('db000000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000001', 'outgoing', 'DEMO Fornitura cemento e inerti', 'MEN-0907', 312050, current_date - 12, 'bank_transfer', null, 'd3000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;
update public.payments set status = 'paid', paid_on = current_date - 10
 where id = 'db000000-0000-4000-8000-000000000004' and status = 'open';

insert into public.communications (id, tenant_id, channel, direction, occurred_at, subject, body, contact_name,
                                   customer_id, supplier_id, follow_up_date) values
  ('dc000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'phone', 'inbound', now() - interval '2 days', 'DEMO Sollecito tempi fine lavori', 'L''amministratore chiede una data per la fine lavori della scala A.', 'Amministratore', 'd2000000-0000-4000-8000-000000000001', null, current_date + 2),
  ('dc000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001', 'pec', 'outbound', now() - interval '5 days', 'DEMO Invio SAL 2 al Comune', null, 'Ufficio tecnico', 'd2000000-0000-4000-8000-000000000003', null, null)
on conflict (id) do nothing;
do $$ begin perform set_config('app.actor_user_id', '', false); end $$;
