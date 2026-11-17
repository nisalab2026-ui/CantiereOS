# CantiereOS — Database

> Stato: v0.2. §3 descrive ciò che **esiste** (migrazioni 0001–0003, testate su PostgreSQL 16).
> §6 descrive lo schema **progettato** per i moduli successivi: non è ancora implementato.

## 1. Convenzioni

| Regola              | Dettaglio                                                                                                |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| Nomi                | `snake_case`, tabelle al plurale in inglese (`customers`), glossario in [DOMAINS.md](DOMAINS.md)         |
| Chiavi primarie     | `id uuid default gen_random_uuid()` ovunque; unica eccezione `audit_log` (`bigint identity`)             |
| Tenant              | `tenant_id uuid not null references tenants(id) on delete restrict` su ogni tabella aziendale            |
| Unicità per azienda | sempre composta con `tenant_id` (es. `unique (tenant_id, vat_number) where deleted_at is null`)          |
| Riferimenti         | FK composte `(tenant_id, x_id) → x(tenant_id, id)`; ogni tabella ha `unique (tenant_id, id)`             |
| FK opzionali        | `on delete set null (colonna)` (PostgreSQL 15+) per non azzerare mai `tenant_id`                         |
| Date/ore            | `timestamptz`; fuso dell'azienda in `tenant_settings.timezone` (default `Europe/Rome`)                   |
| Importi             | `numeric(14,2)` + `currency char(3)`; mai `float`                                                        |
| Stati               | `enum` PostgreSQL per stati stabili; tabelle se configurabili dall'azienda                               |
| Audit               | `created_at`, `updated_at` (trigger), `created_by` (trigger, mai dal client), riga in `audit_log`        |
| Cancellazione       | logica (`deleted_at`) per i dati di business; fisica solo con permesso `*.delete`                        |
| Testi               | `check` di lunghezza su tutti i campi liberi; validazioni formali (P.IVA, CF, SDI, CAP, provincia, IBAN) |
| JSONB               | solo per dati non strutturati (`tenant_settings.preferences`, payload audit)                             |

## 2. Migrazioni e seed

| File                                                           | Contenuto                                                                                                                          |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/20261116190000_core_tenancy.sql`          | schema `app`, tenants, tenant_settings, users, permissions, roles, role_permissions, memberships, subscriptions, audit_log, helper |
| `supabase/migrations/20261116200000_master_data.sql`           | customers, suppliers, contacts, customer_sites                                                                                     |
| `supabase/migrations/20261116200100_workforce.sql`             | employees, teams, team_members                                                                                                     |
| `supabase/migrations/20261116210000_auth_authorization.sql`    | ruoli richiesti, MFA nel DB (`requires_mfa`, `current_aal`), `platform_admins`, cliente esterno, `invitations`, azienda attiva     |
| `supabase/migrations/20261116220000_sessions_registration.sql` | revoca immediata delle sessioni (`current_session_active`), registrazione azienda self-service                                     |
| `supabase/seeds/development.sql`                               | **solo sviluppo**: dati dimostrativi (non è una migrazione)                                                                        |

- Nome `YYYYMMDDHHMMSS_descrizione.sql` (formato Supabase CLI), applicate in ordine, ognuna in
  una transazione.
- **Solo in avanti**: una migrazione applicata a un ambiente non si modifica mai. (La 0001 è
  stata riscritta in questa fase perché non era mai stata applicata a nessun database.)
- Vietati `drop`/`truncate` di dati senza approvazione esplicita e piano di backup.
- Ogni migrazione che crea funzioni in `app` termina con
  `revoke execute on all functions in schema app from public;`.
- Applicazione in ambienti reali: `supabase db push` (fase 2). `db push` **non** applica i seed.

### Come si aggiunge una tabella aziendale

```sql
create table public.<t> (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  ...,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint <t>_parent_fk foreign key (tenant_id, parent_id) references public.<parent> (tenant_id, id),
  constraint <t>_tenant_id_id_key unique (tenant_id, id)
);
select app.attach_tenant_table_triggers('public.<t>');   -- updated_at, immutabilità, created_by, audit
select app.grant_tenant_table('public.<t>');             -- privilegi per colonna, niente ad anon
select app.create_tenant_policies('public.<t>', '<mod>.read', '<mod>.write', '<mod>.delete');
```

Le guardie in `packages/db/tests/schema-guards.test.ts` fanno fallire i test se manca qualcosa.

### Seed di sviluppo

`supabase/seeds/development.sql` crea due aziende **DEMO** (`is_demo = true`) con utenti,
clienti, fornitori, contatti, sedi, dipendenti e squadre. Protezioni:

1. si rifiuta di girare (`P0001`) se il database contiene un'azienda con `is_demo = false`;
2. tutti i nomi iniziano con `DEMO`, tutte le email sono su `demo.cantiereos.invalid`
   (dominio riservato, nessun invio possibile);
3. è idempotente (UUID fissi + `on conflict do nothing`);
4. vive fuori da `supabase/migrations` e un test verifica che nessuna migrazione contenga dati demo.

Gli utenti demo non hanno password: per entrare dall'app andranno creati con Supabase Auth
(fase 2). In `config.toml` (fase 2): `[db.seed] sql_paths = ['./seeds/development.sql']`.

## 3. Schema implementato

```
auth.users (Supabase) ──1:1── users
                                │
                     memberships (tenant_id, user_id, role_id, status)
                       │              │
                       │              └──► roles (sistema: tenant_id NULL | personalizzati)
                       │                     └──1:n── role_permissions ──► permissions
tenants ──1:1── tenant_settings
   │──1:n── subscriptions
   │──1:n── audit_log (append-only)
   │
   ├── customers ──1:n── contacts (cliente OPPURE fornitore)
   │       └────1:n── customer_sites
   ├── suppliers ──1:n── contacts
   │
   ├── employees ──(tenant_id, user_id)──► memberships   (facoltativo)
   └── teams ──1:n── team_members ◄──n:1── employees
          └── leader_employee_id ──► employees
```

### Tabelle

| Tabella            | Scopo                                     | Chiavi e vincoli principali                                                                                                               | Lettura (RLS)                             | Scrittura (RLS)                                                                              |
| ------------------ | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------- |
| `tenants`          | Aziende                                   | slug unico; `is_demo`; `status` gestito solo dal server                                                                                   | membri attivi                             | `tenant.manage` (solo nome e dati fiscali)                                                   |
| `tenant_settings`  | Impostazioni (1:1)                        | PK = `tenant_id`; creata da trigger con l'azienda                                                                                         | membri attivi                             | `tenant.manage`                                                                              |
| `users`            | Utenti applicativi (1:1 `auth.users`)     | creata da trigger alla registrazione; email non modificabile dall'utente                                                                  | se stessi e colleghi                      | solo se stessi                                                                               |
| `permissions`      | Catalogo `modulo.azione`                  | `key` unica                                                                                                                               | tutti gli autenticati                     | nessuno (solo migrazioni)                                                                    |
| `roles`            | Ruoli di sistema e personalizzati         | sistema: `tenant_id` NULL, chiave unica; personalizzati: chiave `custom_*` unica per azienda                                              | sistema + quelli della propria azienda    | `roles.manage` (solo personalizzati)                                                         |
| `role_permissions` | Permessi dei ruoli                        | `tenant_id` copiato dal ruolo; FK composta `(tenant_id, role_id)`; anti-escalation                                                        | come `roles`                              | `roles.manage`, solo permessi posseduti                                                      |
| `memberships`      | Utente ↔ azienda + ruolo + stato          | `unique (tenant_id, user_id)`; ruolo di sistema o della stessa azienda (trigger); `customer_id` obbligatorio solo per il cliente esterno  | se stessi o `members.read`                | nessun INSERT dagli utenti (solo `create_tenant`/inviti); update/delete con `members.manage` |
| `invitations`      | Inviti via email                          | solo hash SHA-256 del token; scadenza ≤ 30 giorni; un invito in attesa per email e azienda                                                | `members.manage`                          | `members.manage` (insert, revoca)                                                            |
| `platform_admins`  | Super Admin SaaS                          | PK `user_id`; nessun `tenant_id`                                                                                                          | solo la propria riga                      | solo `service_role`                                                                          |
| `subscriptions`    | Piano, posti, prova, riferimenti provider | max 1 non cancellato per azienda                                                                                                          | `billing.read`                            | solo `service_role`                                                                          |
| `audit_log`        | Registro modifiche                        | append-only per tutti, anche `service_role`                                                                                               | `audit.read`                              | solo trigger                                                                                 |
| `customers`        | Clienti                                   | codice e P.IVA unici per azienda (record attivi); indice trigram sul nome                                                                 | `customers.read`                          | `customers.write` / `.delete`                                                                |
| `suppliers`        | Fornitori                                 | come clienti + categoria, IBAN                                                                                                            | `suppliers.read`                          | `suppliers.write` / `.delete`                                                                |
| `contacts`         | Referenti                                 | esattamente uno tra `customer_id` e `supplier_id`; FK composte; un solo primario per titolare                                             | permesso del titolare (cliente/fornitore) | idem                                                                                         |
| `customer_sites`   | Sedi d'intervento                         | FK composta al cliente (`restrict`); coordinate entrambe o nessuna; CAP italiano a 5 cifre                                                | `customers.read`                          | `customers.write` / `.delete`                                                                |
| `employees`        | Dipendenti (con o senza account)          | `(tenant_id, user_id)` → `memberships`: l'utente deve essere membro della stessa azienda                                                  | `employees.read`                          | `employees.write` / `.delete`                                                                |
| `teams`            | Squadre                                   | nome unico per azienda; caposquadra con FK composta                                                                                       | `teams.read`                              | `teams.write` / `.delete`                                                                    |
| `team_members`     | Composizione squadre                      | FK composte a squadra e dipendente; `unique (team_id, employee_id)`                                                                       | `teams.read`                              | `teams.write`                                                                                |
| `notifications`    | Notifiche in-app per utente e azienda     | FK composta `(tenant_id, user_id)` → `memberships` (cascade); `link` solo percorsi interni `/…`; scritte solo da trigger o `service_role` | solo le proprie, nelle aziende attive     | solo `read_at` delle proprie (grant di colonna)                                              |

Dati HR sensibili (codice fiscale, IBAN, costo orario, documenti del dipendente) **non** sono in
`employees`, che è leggibile anche dai tecnici: andranno in una tabella separata con permesso
dedicato (`employees.hr`).

Prima sorgente di notifiche: il trigger `app.notify_invitation_accepted` avvisa chi ha creato
l'invito quando viene accettato (migrazione `20261117090000_notifications.sql`).

### Indici

Oltre a PK e vincoli `unique`: `memberships (user_id, tenant_id) where status = 'active'` (usato da
ogni controllo RLS), `memberships (role_id)`, `role_permissions (permission_id)`,
`customers/suppliers (tenant_id, lower(display_name)) where deleted_at is null` per le liste,
indici GIN trigram su `lower(display_name)` per la ricerca, `contacts (tenant_id, customer_id |
supplier_id)`, `customer_sites (tenant_id, customer_id)` e `(tenant_id, lower(city))`,
`employees (tenant_id, lower(last_name), lower(first_name))`, `team_members (tenant_id,
employee_id)`, `audit_log (tenant_id, created_at desc)` e `(tenant_id, table_name, record_id)`.

### Ruoli di sistema e permessi

| Chiave               | Nome                   | Note                                                             |
| -------------------- | ---------------------- | ---------------------------------------------------------------- |
| `owner`              | Proprietario azienda   | unico che gestisce il ruolo owner; almeno uno attivo per azienda |
| `admin`              | Amministratore         | come owner, tranne la gestione dei proprietari                   |
| `operations_manager` | Responsabile operativo | pianificazione, squadre, anagrafiche, personale                  |
| `site_manager`       | Responsabile cantiere  | gestione operativa di cantieri e squadre                         |
| `back_office`        | Amministrazione        | anagrafiche e attività amministrative                            |
| `technician`         | Tecnico                | lavoro sul campo, consultazione                                  |
| `external_client`    | Cliente esterno        | solo portale; vede solo il proprio cliente (`customer_id`)       |

Il **Super Admin SaaS** non è un ruolo aziendale: è una riga in `platform_admins` (gestita solo
da `service_role`) e vale solo con sessione MFA (`aal2`). Vede metadati di aziende e abbonamenti,
non i dati operativi.

| Permesso            | owner | admin | operations_manager | site_manager | back_office | technician | external_client |
| ------------------- | :---: | :---: | :----------------: | :----------: | :---------: | :--------: | :-------------: |
| tenant.manage 🔐    |   ✓   |   ✓   |                    |              |             |            |                 |
| billing.read 🔐     |   ✓   |   ✓   |                    |              |             |            |                 |
| members.read        |   ✓   |   ✓   |         ✓          |      ✓       |      ✓      |            |                 |
| members.manage 🔐   |   ✓   |   ✓   |                    |              |             |            |                 |
| roles.manage 🔐     |   ✓   |   ✓   |                    |              |             |            |                 |
| audit.read 🔐       |   ✓   |   ✓   |                    |              |             |            |                 |
| customers.read      |   ✓   |   ✓   |         ✓          |      ✓       |      ✓      |     ✓      |                 |
| customers.write     |   ✓   |   ✓   |         ✓          |              |      ✓      |            |                 |
| customers.delete 🔐 |   ✓   |   ✓   |                    |              |             |            |                 |
| suppliers.read      |   ✓   |   ✓   |         ✓          |      ✓       |      ✓      |            |                 |
| suppliers.write     |   ✓   |   ✓   |         ✓          |              |      ✓      |            |                 |
| suppliers.delete 🔐 |   ✓   |   ✓   |                    |              |             |            |                 |
| employees.read      |   ✓   |   ✓   |         ✓          |      ✓       |      ✓      |     ✓      |                 |
| employees.write     |   ✓   |   ✓   |         ✓          |              |             |            |                 |
| employees.delete 🔐 |   ✓   |   ✓   |                    |              |             |            |                 |
| teams.read          |   ✓   |   ✓   |         ✓          |      ✓       |      ✓      |     ✓      |                 |
| teams.write         |   ✓   |   ✓   |         ✓          |      ✓       |             |            |                 |
| teams.delete 🔐     |   ✓   |   ✓   |                    |              |             |            |                 |
| portal.access       |       |       |                    |              |             |            |        ✓        |

🔐 = `permissions.requires_mfa`: il permesso vale **solo con sessione `aal2`** (MFA verificata).
Con una sessione a sola password `app.tenant_ids_with_permission` non lo restituisce, quindi le
RLS lo negano anche se il ruolo lo prevede. Il cliente esterno vede in `customers` e
`customer_sites` solo il proprio cliente (policy `*_portal_select`) e nessun collega.

Le aziende possono creare **ruoli personalizzati** (`custom_*`) combinando i permessi del catalogo;
chi li gestisce non può concedere permessi che non possiede.

### Funzioni (schema privato `app`)

| Funzione                                                                                                                          | Uso                                                                                                         | Chi può eseguirla        |
| --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------ |
| `user_tenant_ids()`                                                                                                               | aziende in cui l'utente è membro attivo                                                                     | authenticated            |
| `tenant_ids_with_permission(perm)`                                                                                                | aziende operative in cui l'utente ha `perm`                                                                 | authenticated            |
| `has_permission`, `is_owner_role`, `is_tenant_owner`, `shares_tenant_with`, `current_actor`                                       | controlli puntuali                                                                                          | authenticated            |
| `create_tenant(name, slug, owner, plan, seats, trial_ends_at, is_demo)`                                                           | azienda + titolare + abbonamento                                                                            | **solo service_role**    |
| `current_aal()`, `my_permissions(tenant)`                                                                                         | livello MFA della sessione; permessi effettivi (`granted`, `requires_mfa`)                                  | authenticated            |
| `is_platform_admin()`, `portal_customer_ids()`                                                                                    | Super Admin (solo aal2); clienti del portale                                                                | authenticated            |
| `accept_invitation(token)`                                                                                                        | accetta un invito: hash del token, scadenza, email verificata coincidente, posti                            | authenticated            |
| `set_active_tenant(tenant)`                                                                                                       | salva l'azienda attiva se l'utente ne è membro attivo                                                       | authenticated            |
| `current_session_active()`                                                                                                        | la sessione del JWT (`session_id`) esiste ancora in `auth.sessions`                                         | authenticated            |
| `register_company(name, slug)`                                                                                                    | registrazione self-service: titolare = `auth.uid()`, email confermata, prova 30 gg / 5 posti, max 3 aziende | authenticated            |
| `attach_tenant_table_triggers`, `grant_tenant_table`, `create_tenant_policies`, `grant_system_permissions`                        | helper di migrazione                                                                                        | solo proprietario schema |
| trigger (`audit_row_change`, `prevent_tenant_change`, `check_role_permission`, `check_membership_role`, `ensure_active_owner`, …) | invarianti                                                                                                  | solo trigger             |

Tutte le funzioni `SECURITY DEFINER` hanno `search_path = ''`; nessuna è eseguibile da `PUBLIC` o
`anon` (verificato dai test).

### Archivio documentale (migrazione `20261117120000_documents`)

**ADR-009 — Archivio documentale su storage privato con versioni immutabili.** Decisione presa
prima dell'implementazione (richiesta di Nicholas: cartelle, collegamenti, ricerca, anteprima,
versioni, scadenze, esportazione, caricamento multiplo).

- **Tabelle.** `document_folders` (albero con `parent_id`, FK composta), `documents` (titolo,
  categoria, cartella, collegamento a **un** soggetto tra cliente/fornitore/dipendente/squadra con
  FK composte come in ADR-008, scadenza `expires_on`, scadenza collegata `deadline_id`, versione
  corrente) e `document_versions` (una riga per file caricato). Il vecchio progetto prevedeva
  anche `files` e `document_links` generici: rinviati. Un solo soggetto con FK esplicite dà
  integrità e RLS semplici; `files` tornerà quando servirà ad altri moduli (foto dei rapportini).
- **Storage.** Supabase Storage, bucket **privato** `documents` (nome da `DOCUMENTS_BUCKET`).
  L'app parla con lo storage solo dal server, con la chiave `service_role` (variabile d'ambiente
  solo server, mai nel browser). In locale lo stesso servizio gira nel profilo Docker `auth`.
  Senza configurazione, l'archivio mostra "Archiviazione file non configurata" e non simula
  nulla. Interfaccia `FileStorage` in `packages/core`, così il provider è sostituibile (S3).
- **Chiave del file** `{tenant_id}/{document_id}/{version_id}`: colonna **generata** dal database,
  mai scelta dal browser. Un utente non può puntare al file di un'altra azienda.
- **Caricamento diretto e firmato.** Il server controlla il permesso, crea la versione in stato
  `pending` e restituisce un URL di caricamento firmato per quella sola chiave; il browser invia
  il file direttamente allo storage (niente limite di dimensione delle funzioni serverless). Poi il
  server **verifica** l'oggetto: dimensione (massimo 25 MB), tipo reale dai primi byte (magic
  bytes), tipo ammesso. Se non va bene il file viene cancellato e la versione è `rejected`; solo una
  versione `ready` diventa la versione corrente. La scansione antivirus resta da aggiungere nel
  worker (oggi non c'è un provider: non viene simulata).
- **Versioni immutabili.** Una versione pronta non si modifica né si cancella; una nuova versione
  ne prende il posto come corrente e le precedenti restano scaricabili.
- **Download e anteprima** con URL firmati di 5 minuti, generati dopo il controllo RLS. Ogni
  download è registrato in `document_downloads` (append-only) e quindi nel registro attività.
- **Scadenze.** Un documento con `expires_on` può creare una scadenza di tipo "Documento" collegata
  allo stesso soggetto: avvisi e dashboard sono quelli dello scadenziario (nessun secondo sistema).
- **Eliminazione** logica (`deleted_at`) con permesso `documents.delete` (MFA). I file restano
  nello storage fino alla pulizia programmata, che sarà un job del worker documentato.
- **OCR** non configurato: l'interfaccia lo dice. Quando ci sarà un provider, i dati estratti
  saranno solo proposti e andranno confermati.

### Registro delle esportazioni (migrazione `20261117110000_data_exports`)

- `data_exports`: sezione, formato, filtri (jsonb, max 4 KB), righe, autore (dal trigger
  `set_created_by`), data. **Append-only**: nessuna policy né privilegio di update/delete.
- Inserimento consentito solo a chi ha il permesso di lettura della sezione
  (`app.export_section_permission`); lettura con `audit.read`. Il trigger di audit la porta nel
  registro attività, dove l'operazione è mostrata come "Esportazione".

### Scadenziario e storico (migrazione `20261117100000_deadlines_history`)

**ADR-008 — Scadenziario unico.** Certificazioni, manutenzioni, controlli periodici, scadenze di
documenti, pagamenti e contratti stanno in **una sola tabella `deadlines`** con `kind`. Motivo:
sono la stessa cosa (una data, un responsabile, uno stato, un preavviso, un'eventuale ricorrenza)
e un'unica tabella dà uno scadenziario, una dashboard e un sistema di avvisi coerenti. Campi
specifici di un tipo, se serviranno, andranno in tabelle collegate 1:1, non in colonne generiche.

- Collegamento al massimo a **un** soggetto con FK composte esplicite (`customer_id`,
  `supplier_id`, `employee_id`, `team_id` + `check num_nonnulls(...) <= 1`): niente coppie
  polimorfiche `entity_type/entity_id` senza integrità.
- `responsible_user_id` → FK composta su `memberships (tenant_id, user_id)`.
- Lo stato "in ritardo / in scadenza" **non si salva**: si calcola da `due_date` e
  `remind_days_before`, quindi non può mai essere disallineato.
- `completed_at` / `completed_by` li decide il trigger `deadline_completion_guard`, non il client.
- Completare una scadenza ricorrente crea la successiva con `previous_deadline_id` (indice univoco:
  al massimo una successiva): la catena delle ricorrenze resta consultabile.
- Permessi `deadlines.read|write|delete` (delete con MFA). Ruolo di sistema **Sola consultazione**
  (`viewer`) reintrodotto con soli permessi di lettura.
- `notifications.dedupe_key` + indice univoco `(tenant_id, user_id, dedupe_key)`: lo stesso evento
  non genera mai due notifiche. `app.generate_deadline_notifications(tenant)` è idempotente; oggi
  la richiama l'app a ogni caricamento della shell, in seguito un job pianificato.
- `app.record_history(tabella, id)`: cronologia di un elemento (e delle scadenze collegate) per chi
  può **leggere quell'elemento**, senza dover avere `audit.read` (che resta per il registro completo).
  Tabelle ammesse in whitelist; per un elemento di un'altra azienda restituisce zero righe.

## 4. Strategia multi-tenant

1. **Identità verificata:** `auth.uid()` deriva dal JWT firmato da Supabase Auth.
2. **Appartenenza:** l'accesso esiste solo con `memberships.status = 'active'` e azienda
   `trial`/`active`. Invitati e sospesi non vedono nulla.
3. **Permesso:** ogni policy richiede un permesso specifico. La forma
   `tenant_id in (select app.tenant_ids_with_permission('x'))` è valutata una volta per query.
4. **Il `tenant_id` del client non è fidato:** `WITH CHECK` rifiuta righe per aziende in cui
   l'utente non ha il permesso di scrittura.
5. **Immutabilità:** `tenant_id` non è nei privilegi di UPDATE e un trigger blocca il cambio
   anche per `service_role`.
6. **FK composte:** impossibile collegare record di aziende diverse, anche con `service_role`.
7. **Escalation:** nessuno modifica la propria membership; solo un owner gestisce (e invita) il
   ruolo owner; i membri entrano solo tramite invito accettato con l'email verificata a cui è
   stato inviato; nessuno concede permessi che non ha; ogni azienda conserva almeno un owner
   attivo (vincolo differito); i permessi amministrativi richiedono MFA (`aal2`).
8. **Server only:** abbonamenti, stato azienda e creazione aziende passano solo da `service_role`.
9. **Utenti in più aziende:** supportati; le RLS applicano i permessi di ciascuna azienda.
10. **Azienda sospesa:** perde l'accesso ai dati operativi; i membri vedono ancora la riga
    `tenants`. _Da rivalutare:_ sola lettura per esportare i dati.

## 5. Test

`pnpm test:db` crea un database usa-e-getta, applica shim Supabase (solo test), migrazioni e seed
(due volte), poi esegue:

| File                         | Cosa verifica                                                                                                                                                                                                               |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tenant-isolation.test.ts`   | per **ogni** tabella aziendale: lettura, inserimento, modifica, cancellazione e spostamento verso un'altra azienda; 8 tentativi di FK cross-tenant; utenti esterni, anon, sospesi, invitati, aziende sospese, multi-azienda |
| `roles-permissions.test.ts`  | matrice ruolo × tabella, escalation, inviti, titolare unico, ruoli personalizzati e anti-escalation, abbonamenti, impostazioni, utenti                                                                                      |
| `audit-log.test.ts`          | contenuto dell'audit, copertura di tutte le tabelle, visibilità, immutabilità anche per service_role                                                                                                                        |
| `schema-guards.test.ts`      | RLS e policy ovunque, PK UUID, tenant_id + FK, FK composte, trigger, privilegi, funzioni sicure                                                                                                                             |
| `auth-authorization.test.ts` | ruoli richiesti, MFA aal1/aal2, Responsabile cantiere, Cliente esterno, Super Admin, inviti (token, scadenza, revoca, email, posti), azienda attiva, revoca immediata alla sospensione                                      |
| `seed.test.ts`               | solo aziende demo, idempotenza, email `.invalid`, isolamento, rifiuto con dati reali, nessun dato demo nelle migrazioni                                                                                                     |

Inoltre `pnpm test:core` (packages/core) esegue sullo stesso tipo di database i test del codice
server: verifica JWT, sessione revocata, azienda attiva, permessi/MFA, inviti, registrazione
azienda, transazioni di servizio. I test end-to-end con Supabase Auth reale sono in `e2e/`
(vedi [SECURITY.md](SECURITY.md) §3).

## 6. Schema progettato per i moduli successivi (non ancora implementato)

Tutte le tabelle seguiranno §1 e il modello di §2.

### Kernel

- `files` — storage_key, original_name, mime_type, size_bytes, sha256, scan_status
  (`pending|clean|infected`), uploaded_by
- `outbox_events` — event_type, aggregate_type, aggregate_id, payload jsonb, available_at,
  processed_at, attempts (consumata dal worker, `for update skip locked`)
- `notifications`, `notification_preferences`, `push_subscriptions`
- `document_sequences` — (tenant_id, kind, year) → last_number; numerazione progressiva senza
  buchi per fatture/preventivi con `select … for update`
- `platform_admins` — operatori della piattaforma (fuori dai tenant)
- `plans`, `tenant_usage` — catalogo piani e consumi (posti, storage)

### Anagrafiche e commerciale

- `assets` (impianti) — customer_site_id, tipo, marca, modello, matricola, installazione, garanzia
- `employee_hr_details` — dati HR sensibili con permesso `employees.hr`
- `leads`, `opportunities`, `crm_activities`
- `quotes`, `quote_lines`, `quote_revisions`; `purchase_orders`, `purchase_order_lines`

### Operativo

- `projects` (cantieri/commesse) — codice, customer_id, customer_site_id, stato, date, budget
- `project_phases` — WBS con avanzamento %
- `work_orders` (interventi) — numero, tipo, priorità, stato, customer_site_id, asset_id?,
  project_id?, finestra pianificata, SLA, `version`
- `work_order_assignments`, `schedule_entries` (vincolo di esclusione con `btree_gist`)
- `field_reports` (rapportini) — stato (`draft|submitted|approved|rejected|invoiced`),
  `version`, `client_uuid` per idempotenza offline, `content_hash` alla firma
- `report_labor`, `report_materials`, `report_expenses`, `report_photos`, `report_signatures`
- `maintenance_plans`, `maintenance_schedules`
- `certifications`, `medical_checks`, `ppe_assignments` con `expires_at`

### Amministrazione

- `invoices`, `invoice_lines`, `payments`, `payment_schedules`
- `items`, `warehouses` (anche furgoni), `stock_movements` (registro immutabile)

### Documenti e AI

- ~~`documents`, `document_versions`~~ implementati (ADR-009); `document_links` multipli e
  `files` generico rinviati
- `ai_jobs`, `document_extractions`, `embeddings` (pgvector, sempre con tenant_id e RLS)

## 7. Prestazioni e crescita

- Indici con `tenant_id` in prima posizione; indici parziali `where deleted_at is null`.
- `audit_log` e `stock_movements`: partizionamento mensile quando superano decine di milioni di
  righe; politica di conservazione da definire.
- Connessioni: pooler Supabase in modalità transazione (`set local` vale solo nella transazione).
- Ricerca globale: `pg_trgm` (già attivo) + `tsvector` per i documenti.
