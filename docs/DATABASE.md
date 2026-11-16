# CantiereOS — Database

> Stato: v0.1 (fase 1). §3 descrive ciò che **esiste** (migrazione 0001, testata). §5 descrive lo
> schema **progettato** per i moduli successivi: non è ancora implementato.

## 1. Convenzioni

| Regola              | Dettaglio                                                                                                |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| Nomi                | `snake_case`, tabelle al plurale in inglese (`business_partners`), glossario in [DOMAINS.md](DOMAINS.md) |
| Chiavi primarie     | `id uuid default gen_random_uuid()`; `bigint identity` solo per log ad alto volume                       |
| Tenant              | `tenant_id uuid not null references tenants(id) on delete restrict` su ogni tabella di dominio           |
| Unicità per azienda | sempre composta con `tenant_id` (es. `unique (tenant_id, vat_number)`)                                   |
| Riferimenti         | FK composte `(tenant_id, x_id) → x(tenant_id, id)`; ogni tabella ha `unique (tenant_id, id)`             |
| Date/ore            | `timestamptz`; visualizzazione in `Europe/Rome` lato applicazione                                        |
| Importi             | `numeric(14,2)` + `currency char(3) default 'EUR'`; mai `float`                                          |
| Quantità            | `numeric(14,3)` + unità di misura                                                                        |
| Stati               | `enum` PostgreSQL per stati stabili; tabelle di lookup se configurabili dall'azienda                     |
| Audit               | `created_at`, `updated_at` (trigger), `created_by` (trigger da `auth.uid()`)                             |
| Cancellazione       | logica (`deleted_at`) per i dati di business; cancellazione fisica solo con permesso dedicato            |
| Concorrenza / sync  | `version integer not null default 1` incrementata da trigger sulle tabelle sincronizzate offline         |
| Testi               | `check` di lunghezza su tutti i campi liberi; validazioni formali (CAP, provincia, SDI) nel DB           |
| JSONB               | solo per dati davvero non strutturati (impostazioni, payload esterni)                                    |

## 2. Migrazioni

- Cartella: `supabase/migrations/`, nome `YYYYMMDDHHMMSS_descrizione.sql` (formato Supabase CLI).
- **Solo in avanti**: una migrazione applicata non si modifica mai; le correzioni sono nuove
  migrazioni.
- Ogni migrazione è applicata in una transazione. Vietato `drop`/`truncate` di dati senza
  approvazione esplicita e piano di backup.
- Ogni nuova tabella in `public` deve: abilitare RLS, avere policy, `tenant_id` not null con FK,
  trigger `prevent_tenant_change`, grant espliciti, audit se contiene dati di business.
  Ogni migrazione che crea funzioni in `app` deve terminare con
  `revoke execute on all functions in schema app from public;`.
  Le guardie in `packages/db/tests/schema-guards.test.ts` fanno fallire la CI se manca qualcosa.
- Applicazione in ambienti reali: `supabase db push` (fase 2), mai a mano in produzione.

## 3. Schema implementato — migrazione `20261116190000_core_tenancy`

```
auth.users (Supabase)
   │1
   ├──────────────1 profiles
   │
   │n                                 n
tenant_memberships ─── role ──► role_permissions ◄── permissions
   │n   (owner|admin|manager|office|technician|viewer)
   │1
tenants ──1──n── business_partners ──1──n── partner_contacts
   │                    (FK composta tenant_id, partner_id)
   └──1──n── audit_log (append-only)
```

### Tabelle

| Tabella              | Scopo                             | Note di sicurezza                                                                                                                                                      |
| -------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tenants`            | Aziende                           | Lettura ai membri attivi; l'owner/admin modifica solo nome, P.IVA, CF, impostazioni (privilegi per colonna). `status` modificabile solo dal server                     |
| `profiles`           | Dati utente globali               | Creato da trigger su `auth.users`; visibile ai colleghi; modificabile solo dal titolare                                                                                |
| `tenant_memberships` | Utente ↔ azienda, ruolo, stato    | Nessuno modifica la propria membership; solo un owner assegna/tocca il ruolo owner; nuovi membri solo `invited`; almeno un owner attivo garantito da vincolo differito |
| `permissions`        | Catalogo permessi `modulo.azione` | Sola lettura                                                                                                                                                           |
| `role_permissions`   | Matrice ruolo → permessi          | Sola lettura                                                                                                                                                           |
| `audit_log`          | Registro modifiche                | Append-only (trigger blocca UPDATE/DELETE/TRUNCATE per chiunque)                                                                                                       |
| `business_partners`  | Clienti e fornitori               | Modello di riferimento per le tabelle di dominio                                                                                                                       |
| `partner_contacts`   | Referenti dei partner             | FK composta impedisce di collegare un partner di un'altra azienda                                                                                                      |

### Funzioni (schema privato `app`)

| Funzione                             | Uso                                         | Chi può eseguirla     |
| ------------------------------------ | ------------------------------------------- | --------------------- |
| `user_tenant_ids()`                  | Aziende in cui l'utente è membro attivo     | authenticated         |
| `tenant_ids_with_permission(perm)`   | Aziende operative in cui l'utente ha `perm` | authenticated         |
| `has_permission(tenant, perm)`       | Controllo puntuale                          | authenticated         |
| `is_tenant_owner(tenant)`            | Regole sul ruolo owner                      | authenticated         |
| `shares_tenant_with(user)`           | Visibilità profili colleghi                 | authenticated         |
| `create_tenant(name, slug, owner)`   | Crea azienda + owner                        | **solo service_role** |
| `accept_invitation(tenant)`          | L'invitato attiva la propria membership     | authenticated         |
| `audit_row_change()` e altri trigger | Audit, `updated_at`, immutabilità           | solo trigger          |

Tutte le funzioni `SECURITY DEFINER` hanno `search_path = ''` e nomi qualificati.
Nessuna è eseguibile da `PUBLIC` o `anon` (verificato dai test).

### Matrice permessi iniziale

| Permesso        | owner | admin | manager | office | technician | viewer |
| --------------- | :---: | :---: | :-----: | :----: | :--------: | :----: |
| tenant.manage   |   ✓   |   ✓   |         |        |            |        |
| members.read    |   ✓   |   ✓   |    ✓    |   ✓    |            |        |
| members.manage  |   ✓   |   ✓   |         |        |            |        |
| audit.read      |   ✓   |   ✓   |         |        |            |        |
| partners.read   |   ✓   |   ✓   |    ✓    |   ✓    |     ✓      |   ✓    |
| partners.write  |   ✓   |   ✓   |    ✓    |   ✓    |            |        |
| partners.delete |   ✓   |   ✓   |         |        |            |        |

### Modello di policy RLS (da replicare per ogni tabella di dominio)

```sql
alter table public.<t> enable row level security;

create policy <t>_select on public.<t> for select to authenticated
  using (tenant_id in (select app.tenant_ids_with_permission('<mod>.read')));
create policy <t>_insert on public.<t> for insert to authenticated
  with check (tenant_id in (select app.tenant_ids_with_permission('<mod>.write')));
create policy <t>_update on public.<t> for update to authenticated
  using (tenant_id in (select app.tenant_ids_with_permission('<mod>.write')))
  with check (tenant_id in (select app.tenant_ids_with_permission('<mod>.write')));
create policy <t>_delete on public.<t> for delete to authenticated
  using (tenant_id in (select app.tenant_ids_with_permission('<mod>.delete')));
```

La forma `tenant_id in (select …)` fa valutare la funzione **una volta per query** (InitPlan),
non per riga: importante con tabelle da centinaia di migliaia di righe. Indici sempre con
`tenant_id` come prima colonna.

## 4. Strategia multi-tenant

1. **Identità verificata:** `auth.uid()` deriva dal JWT firmato da Supabase Auth. Il server
   imposta i claim solo dopo averli verificati.
2. **Appartenenza:** l'accesso a un'azienda esiste solo se c'è una riga `tenant_memberships`
   con `status = 'active'` e l'azienda è `trial` o `active`.
3. **Permesso:** ogni policy chiede un permesso specifico, non solo l'appartenenza.
4. **Immutabilità:** `tenant_id` non cambia mai dopo l'inserimento (trigger + privilegi per
   colonna).
5. **Integrità referenziale per azienda:** FK composte rendono impossibile collegare record di
   aziende diverse anche da codice con `service_role`.
6. **Utenti in più aziende:** supportati (consulenti, gruppi). Le RLS consentono tutte le aziende
   dell'utente; l'applicazione filtra in più per l'azienda attiva.
7. **Azienda sospesa:** perde l'accesso ai dati operativi; i membri vedono ancora la riga
   `tenants` per mostrare il messaggio di sospensione. _Da rivalutare:_ accesso in sola lettura
   per esportare i dati.

## 5. Schema progettato per i moduli successivi (non ancora implementato)

Tutte le tabelle seguono §1 (tenant_id, FK composte, RLS, audit). Elenco delle tabelle principali
e delle colonne chiave; i dettagli verranno definiti nella migrazione di ciascun modulo.

### Kernel

- `files` — storage_key, original_name, mime_type, size_bytes, sha256, scan_status
  (`pending|clean|infected`), uploaded_by
- `outbox_events` — event_type, aggregate_type, aggregate_id, payload jsonb, available_at,
  processed_at, attempts (consumata dal worker, `for update skip locked`)
- `notifications`, `notification_preferences`, `push_subscriptions`
- `document_sequences` — (tenant_id, kind, year) → last_number; numerazione progressiva senza
  buchi per fatture/preventivi con `select … for update`
- `platform_admins` — utenti operatori della piattaforma (fuori dai tenant)
- `subscriptions`, `plans`, `tenant_usage` — piano, limiti utenti/storage, stato pagamento

### Anagrafiche e commerciale

- `sites` — partner_id, nome, indirizzo, coordinate (`point` o PostGIS se servirà), note accesso
- `assets` — site_id, tipo, marca, modello, matricola, data installazione, garanzia
- `leads`, `opportunities` (fase, valore stimato, probabilità), `crm_activities`
- `quotes` — partner_id, project_id?, numero, revisione, stato
  (`draft|sent|accepted|rejected|expired`), totali; `quote_lines` (item_id?, descrizione,
  quantità, prezzo, sconto, IVA)
- `purchase_orders`, `purchase_order_lines`

### Operativo

- `projects` (cantieri/commesse) — codice, partner_id, site_id, stato, date, budget ricavi/costi
- `project_phases` — WBS con avanzamento %
- `employees` — user_id? (non tutti hanno account), costo orario, qualifiche
- `teams`, `team_members`
- `work_orders` (interventi) — numero, tipo, priorità, stato, site_id, asset_id?, project_id?,
  finestra pianificata, SLA, `version`
- `work_order_assignments`, `schedule_entries` (risorsa, inizio, fine, con vincolo di
  esclusione per sovrapposizioni con `btree_gist`)
- `field_reports` (rapportini) — work_order_id?/project_id?, data, stato
  (`draft|submitted|approved|rejected|invoiced`), `version`, `client_uuid` per idempotenza
  offline, `content_hash` al momento della firma
- `report_labor` (employee_id, inizio, fine, pausa, tipo ore), `report_materials` (item_id?,
  quantità, warehouse_id), `report_expenses` (categoria, importo, file_id),
  `report_photos` (file_id, fase, geolocalizzazione), `report_signatures` (ruolo firmatario,
  nome, file_id, signed_at, hash firmato)
- `maintenance_plans` (asset/site, ricorrenza RRULE), `maintenance_schedules`
- `certifications`, `medical_checks`, `ppe_assignments` con `expires_at`

### Amministrazione

- `invoices` (attive/passive, numero da `document_sequences`, stato SDI), `invoice_lines`,
  `payments`, `payment_schedules` (scadenzario)
- `items`, `warehouses` (anche furgoni), `stock_movements` (registro immutabile; giacenze come
  vista materializzata o tabella aggiornata da trigger)

### Documenti e AI

- `documents` — file_id corrente, tipo, titolo, testo OCR, `search_vector tsvector`
  (configurazione `italian`), `expires_at`
- `document_versions`, `document_links` (polimorfico controllato: entity_type + entity_id con
  check sui tipi ammessi)
- `ai_jobs` (tipo, stato, costo, modello usato), `document_extractions` (campi estratti +
  confidenza, confermati da utente)
- `embeddings` — `vector` (pgvector), sempre con tenant_id e RLS; ricerca semantica filtrata
  per azienda prima del ranking

## 6. Prestazioni e crescita

- Indici `(tenant_id, …)` su tutte le query di lista; indici parziali `where deleted_at is null`.
- `audit_log` e `stock_movements`: partizionamento per mese quando superano decine di milioni di
  righe; politica di conservazione da definire (vedi PRODUCT_SPEC §9).
- Connessioni: pooler di Supabase in modalità transazione (le impostazioni `set local` sono
  compatibili perché valgono solo nella transazione).
- Ricerca globale: `tsvector` + `pg_trgm` per i nomi; valutare un motore dedicato solo se
  necessario.
