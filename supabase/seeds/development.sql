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

-- Moduli compilabili DEMO: copia del modello pronto "Ispezione linea vita" e due compilazioni
do $$ begin perform set_config('app.actor_user_id', 'd0000000-0000-4000-8000-000000000002', false); end $$;
insert into public.form_templates (id, tenant_id, name, description, category, draft_definition, current_version, library_key) values
  ('dd000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'DEMO Ispezione linea vita',
   'Ispezione dei sistemi di ancoraggio secondo UNI 11560:2022, Appendice C.', 'inspection', '{"sections": [{"id": "dati_generali", "title": "Dati generali", "description": "Compilati in automatico da cliente, sede e azienda.", "fields": [{"id": "committente", "type": "auto", "label": "Committente", "source": "customer.name"}, {"id": "committente_indirizzo", "type": "auto", "label": "Indirizzo del committente", "source": "customer.address"}, {"id": "sito", "type": "auto", "label": "Sito di installazione", "source": "site.address"}, {"id": "installatore", "type": "auto", "label": "Installatore / tecnico abilitato", "source": "company.name"}]}, {"id": "installazione", "title": "Identificazione dell''installazione", "fields": [{"id": "n_impianto", "type": "text", "label": "N. impianto", "required": true, "isSubjectCode": true, "help": "Serve a ritrovare l''ispezione precedente dello stesso impianto."}, {"id": "data_installazione", "type": "date", "label": "Data installazione"}, {"id": "data_ultima_ispezione", "type": "auto", "label": "Data ultima ispezione", "source": "previous.completed_on"}]}, {"id": "tipologia", "title": "Tipologia di ispezione", "fields": [{"id": "tipologia", "type": "choice", "label": "Tipologia di ispezione", "required": true, "multiple": true, "options": ["Ispezione al montaggio (IM)", "Ispezione prima dell''uso (IU)", "Ispezione periodica (IP)", "Ispezione straordinaria (IS)"]}]}, {"id": "documentazione", "title": "Controlli sulla documentazione", "description": "Presenza obbligatoria per IM, IP e IS. Per l''ispezione prima dell''uso (IU) sono facoltativi: relazione tecnica, relazione di calcolo, documentazione fotografica, dichiarazione di conformità e programma di manutenzione.", "fields": [{"id": "documenti", "type": "checklist", "label": "Documento presente", "required": true, "rows": ["Elaborato grafico rappresentativo del sistema", "Relazione tecnica generale", "Relazione di calcolo strutturale", "Documentazione fotografica", "Dichiarazione di corretta posa del sistema", "Manuali di installazione, uso e manutenzione degli ancoraggi", "Dichiarazione di conformità/rispondenza degli ancoraggi", "Indicazione d''uso dei DPI da utilizzare", "Programma di manutenzione del sistema", "Registro delle ispezioni/manutenzioni del sistema", "Registro degli accessi al sistema"], "options": ["Sì", "No"], "withNote": true}]}, {"id": "ancoraggio", "title": "Controlli sul sistema di ancoraggio", "fields": [{"id": "tipo_controllo", "type": "choice", "label": "Tipo di controllo dei dispositivi", "required": true, "multiple": true, "options": ["Visivo", "Funzionale", "Strumentale"]}, {"id": "controlli", "type": "checklist", "label": "Esito dei controlli", "required": true, "rows": ["Impermeabilizzazione", "Usura", "Ossidazione/corrosione", "Deformazioni dei componenti", "Deformazioni anomale della fune", "Tensionamento della fune", "Serraggio dei dadi e dei bulloni dei dispositivi a vista", "Stato delle eventuali parti mobili", "Pulizia"], "options": ["Positivo", "Negativo"], "withNote": true}, {"id": "note", "type": "textarea", "label": "Note / osservazioni"}]}, {"id": "esito", "title": "Esito e firme", "description": "Sezione finale standard: modificala dall''editor se il tuo modulo è diverso.", "fields": [{"id": "esito_finale", "type": "choice", "label": "Esito dell''ispezione", "required": true, "options": ["Sistema idoneo all''uso", "Idoneo con prescrizioni", "Non idoneo: interdire l''accesso"]}, {"id": "prossima_ispezione", "type": "date", "label": "Prossima ispezione entro"}, {"id": "tecnico", "type": "auto", "label": "Tecnico", "source": "user.name"}, {"id": "data_ispezione", "type": "auto", "label": "Data", "source": "today"}, {"id": "firma_tecnico", "type": "signature", "label": "Firma del tecnico", "required": true}, {"id": "firma_committente", "type": "signature", "label": "Firma del committente"}]}]}'::jsonb, 1, 'linea-vita-uni-11560')
on conflict (id) do nothing;
insert into public.form_template_versions (id, tenant_id, template_id, version, name, definition) values
  ('dd100000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'dd000000-0000-4000-8000-000000000001', 1,
   'DEMO Ispezione linea vita', '{"sections": [{"id": "dati_generali", "title": "Dati generali", "description": "Compilati in automatico da cliente, sede e azienda.", "fields": [{"id": "committente", "type": "auto", "label": "Committente", "source": "customer.name"}, {"id": "committente_indirizzo", "type": "auto", "label": "Indirizzo del committente", "source": "customer.address"}, {"id": "sito", "type": "auto", "label": "Sito di installazione", "source": "site.address"}, {"id": "installatore", "type": "auto", "label": "Installatore / tecnico abilitato", "source": "company.name"}]}, {"id": "installazione", "title": "Identificazione dell''installazione", "fields": [{"id": "n_impianto", "type": "text", "label": "N. impianto", "required": true, "isSubjectCode": true, "help": "Serve a ritrovare l''ispezione precedente dello stesso impianto."}, {"id": "data_installazione", "type": "date", "label": "Data installazione"}, {"id": "data_ultima_ispezione", "type": "auto", "label": "Data ultima ispezione", "source": "previous.completed_on"}]}, {"id": "tipologia", "title": "Tipologia di ispezione", "fields": [{"id": "tipologia", "type": "choice", "label": "Tipologia di ispezione", "required": true, "multiple": true, "options": ["Ispezione al montaggio (IM)", "Ispezione prima dell''uso (IU)", "Ispezione periodica (IP)", "Ispezione straordinaria (IS)"]}]}, {"id": "documentazione", "title": "Controlli sulla documentazione", "description": "Presenza obbligatoria per IM, IP e IS. Per l''ispezione prima dell''uso (IU) sono facoltativi: relazione tecnica, relazione di calcolo, documentazione fotografica, dichiarazione di conformità e programma di manutenzione.", "fields": [{"id": "documenti", "type": "checklist", "label": "Documento presente", "required": true, "rows": ["Elaborato grafico rappresentativo del sistema", "Relazione tecnica generale", "Relazione di calcolo strutturale", "Documentazione fotografica", "Dichiarazione di corretta posa del sistema", "Manuali di installazione, uso e manutenzione degli ancoraggi", "Dichiarazione di conformità/rispondenza degli ancoraggi", "Indicazione d''uso dei DPI da utilizzare", "Programma di manutenzione del sistema", "Registro delle ispezioni/manutenzioni del sistema", "Registro degli accessi al sistema"], "options": ["Sì", "No"], "withNote": true}]}, {"id": "ancoraggio", "title": "Controlli sul sistema di ancoraggio", "fields": [{"id": "tipo_controllo", "type": "choice", "label": "Tipo di controllo dei dispositivi", "required": true, "multiple": true, "options": ["Visivo", "Funzionale", "Strumentale"]}, {"id": "controlli", "type": "checklist", "label": "Esito dei controlli", "required": true, "rows": ["Impermeabilizzazione", "Usura", "Ossidazione/corrosione", "Deformazioni dei componenti", "Deformazioni anomale della fune", "Tensionamento della fune", "Serraggio dei dadi e dei bulloni dei dispositivi a vista", "Stato delle eventuali parti mobili", "Pulizia"], "options": ["Positivo", "Negativo"], "withNote": true}, {"id": "note", "type": "textarea", "label": "Note / osservazioni"}]}, {"id": "esito", "title": "Esito e firme", "description": "Sezione finale standard: modificala dall''editor se il tuo modulo è diverso.", "fields": [{"id": "esito_finale", "type": "choice", "label": "Esito dell''ispezione", "required": true, "options": ["Sistema idoneo all''uso", "Idoneo con prescrizioni", "Non idoneo: interdire l''accesso"]}, {"id": "prossima_ispezione", "type": "date", "label": "Prossima ispezione entro"}, {"id": "tecnico", "type": "auto", "label": "Tecnico", "source": "user.name"}, {"id": "data_ispezione", "type": "auto", "label": "Data", "source": "today"}, {"id": "firma_tecnico", "type": "signature", "label": "Firma del tecnico", "required": true}, {"id": "firma_committente", "type": "signature", "label": "Firma del committente"}]}]}'::jsonb)
on conflict (id) do nothing;
do $$ begin perform set_config('app.actor_user_id', 'd0000000-0000-4000-8000-000000000003', false); end $$;
insert into public.form_submissions (id, tenant_id, template_id, template_version_id, title, subject_code, status, data, customer_id, site_id) values
  ('dd200000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'dd000000-0000-4000-8000-000000000001',
   'dd100000-0000-4000-8000-000000000001', 'DEMO Ispezione copertura scala A', 'LV-001', 'completed', '{"committente": "DEMO Condominio Le Querce", "committente_indirizzo": "Via Esempio 1, 20100 Milano (MI)", "sito": "Via Esempio 1, 20100 Milano (MI)", "installatore": "DEMO Edilizia Alfa", "n_impianto": "LV-001", "data_installazione": "2021-05-12", "data_ultima_ispezione": "Nessuna precedente", "tipologia": ["Ispezione periodica (IP)"], "documenti": {"rows": [{"value": "Sì"}, {"value": "Sì"}, {"value": "Sì"}, {"value": "Sì"}, {"value": "Sì"}, {"value": "Sì"}, {"value": "Sì"}, {"value": "Sì"}, {"value": "Sì"}, {"value": "Sì"}, {"value": "No", "note": "Da istituire"}]}, "tipo_controllo": ["Visivo", "Funzionale"], "controlli": {"rows": [{"value": "Positivo"}, {"value": "Positivo"}, {"value": "Positivo"}, {"value": "Positivo"}, {"value": "Positivo"}, {"value": "Positivo"}, {"value": "Positivo"}, {"value": "Positivo"}, {"value": "Negativo", "note": "Pulire il canale di gronda"}]}, "note": "DEMO Sistema in buono stato; segnalata pulizia della gronda.", "esito_finale": "Idoneo con prescrizioni", "tecnico": "Demo Tecnico Alfa", "data_ispezione": "—"}'::jsonb,
   'd2000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001'),
  ('dd200000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001', 'dd000000-0000-4000-8000-000000000001',
   'dd100000-0000-4000-8000-000000000001', 'DEMO Ispezione linea vita scuola', null, 'draft',
   '{"committente": "DEMO Comune di Esempio", "installatore": "DEMO Edilizia Alfa"}'::jsonb,
   'd2000000-0000-4000-8000-000000000003', 'd5000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;
do $$ begin perform set_config('app.actor_user_id', '', false); end $$;
