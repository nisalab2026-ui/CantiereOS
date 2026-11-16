# CantiereOS — Domini applicativi

> Stato: v0.1 (fase 1). Definisce i confini dei moduli del monolite modulare.

## Principi

1. **Un modulo = un dominio.** Ogni modulo possiede le proprie tabelle e la propria logica.
2. **Interfaccia pubblica unica.** Un modulo espone solo ciò che è esportato dal suo `index.ts`
   (servizi applicativi, tipi, eventi). Nessun import di file interni di un altro modulo.
3. **Nessun accesso diretto alle tabelle altrui nel codice.** Si leggono i dati di un altro
   modulo tramite la sua interfaccia. Le FK tra tabelle di moduli diversi sono ammesse (integrità
   referenziale), ma sempre composte `(tenant_id, id)`.
4. **Eventi di dominio** per le reazioni asincrone (es. `report.approved` → magazzino scarica
   materiali, fatturazione marca come fatturabile) tramite tabella outbox e worker.
5. **Kernel condiviso minimo:** tenancy, identità, permessi, audit, file, notifiche.

## Mappa dei domini

```
                         ┌──────────────────────────────┐
                         │  PIATTAFORMA (kernel)        │
                         │  tenancy · identity · rbac   │
                         │  audit · files · notifications│
                         │  billing SaaS · platform admin│
                         └──────────────┬───────────────┘
                                        │ usato da tutti
     ┌──────────────┬───────────────────┼───────────────────┬─────────────────┐
     ▼              ▼                   ▼                   ▼                 ▼
 ANAGRAFICHE    COMMERCIALE        OPERATIVO            AMMINISTRAZIONE    CONOSCENZA
 partners       crm                projects (commesse)  invoicing         documents
 sites/assets   quotes & orders    work_orders          payments          ocr / ai
 workforce                         scheduling           inventory
                                   field_reports        maintenance
                                   safety
```

## Catalogo dei domini

| Dominio (codice) | Modulo prodotto | Possiede (tabelle principali)                                                                    | Dipende da                                  | Eventi emessi (esempi)                |
| ---------------- | --------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------- | ------------------------------------- |
| `tenancy`        | 19, 20          | tenants, tenant_memberships, permissions, role_permissions                                       | —                                           | `tenant.created`, `member.invited`    |
| `identity`       | —               | profiles (auth.users è di Supabase)                                                              | tenancy                                     | `user.registered`                     |
| `audit`          | trasversale     | audit_log                                                                                        | tenancy                                     | —                                     |
| `files`          | trasversale     | files, file_versions                                                                             | tenancy                                     | `file.uploaded`, `file.scanned`       |
| `notifications`  | 17              | notifications, notification_preferences, push_subscriptions                                      | identity                                    | —                                     |
| `partners`       | 3               | business_partners, partner_contacts                                                              | tenancy                                     | `partner.created`                     |
| `crm`            | 2               | leads, opportunities, crm_activities                                                             | partners                                    | `opportunity.won`                     |
| `sites`          | 4               | sites, assets (impianti)                                                                         | partners                                    | —                                     |
| `workforce`      | 8               | employees, teams, team_members, qualifications                                                   | identity                                    | —                                     |
| `projects`       | 5               | projects (cantieri/commesse), project_phases, project_budgets                                    | partners, sites                             | `project.closed`                      |
| `work_orders`    | 6               | work_orders (interventi), work_order_assignments                                                 | sites, projects, workforce                  | `work_order.completed`                |
| `scheduling`     | 7               | schedule_entries, resources (mezzi)                                                              | work_orders, workforce                      | `schedule.changed`                    |
| `field_reports`  | 9               | field_reports, report_labor, report_materials, report_expenses, report_photos, report_signatures | work_orders, projects, workforce, inventory | `report.submitted`, `report.approved` |
| `documents`      | 10              | documents, document_links, document_deadlines                                                    | files, partners, projects                   | `document.expiring`                   |
| `ai`             | 11              | ai_jobs, document_extractions, embeddings                                                        | documents                                   | `extraction.ready`                    |
| `sales`          | 12              | quotes, quote_lines, quote_revisions, purchase_orders                                            | partners, projects, inventory               | `quote.accepted`                      |
| `invoicing`      | 13              | invoices, invoice_lines, payments, document_sequences                                            | partners, projects, sales                   | `invoice.issued`, `payment.received`  |
| `inventory`      | 14              | items, warehouses, stock_movements                                                               | partners                                    | `stock.low`                           |
| `maintenance`    | 15              | maintenance_plans, maintenance_schedules                                                         | sites                                       | genera `work_orders`                  |
| `safety`         | 16              | certifications, medical_checks, ppe_assignments                                                  | workforce, documents                        | `certification.expiring`              |
| `client_portal`  | 18              | portal_accounts, portal_access_grants                                                            | partners, identity                          | —                                     |
| `dashboard`      | 1               | nessuna (sola lettura, viste/materialized views)                                                 | tutti                                       | —                                     |

## Glossario (italiano → codice)

| Termine                    | Codice             | Note                                    |
| -------------------------- | ------------------ | --------------------------------------- |
| Azienda (cliente SaaS)     | `tenant`           | Radice dell'isolamento                  |
| Cliente / fornitore        | `business_partner` | `is_customer` / `is_supplier`           |
| Sede d'intervento          | `site`             | Indirizzo dove si lavora                |
| Impianto                   | `asset`            | Caldaia, impianto elettrico, copertura… |
| Cantiere / commessa        | `project`          | Unità di costo e ricavo                 |
| Intervento                 | `work_order`       | Attività da eseguire                    |
| Rapportino                 | `field_report`     | Consuntivo del lavoro svolto            |
| Squadra                    | `team`             |                                         |
| Dipendente                 | `employee`         | Può avere o no un account utente        |
| Preventivo                 | `quote`            | Con revisioni                           |
| Ordine a fornitore         | `purchase_order`   |                                         |
| Fattura                    | `invoice`          | Attiva o passiva                        |
| Articolo di magazzino      | `item`             |                                         |
| Movimento di magazzino     | `stock_movement`   | Carico/scarico/trasferimento            |
| Piano di manutenzione      | `maintenance_plan` |                                         |
| Attestato / certificazione | `certification`    | Con scadenza                            |

## Struttura di un modulo nel codice (fase 2)

```
packages/core/src/modules/<dominio>/
  index.ts            # interfaccia pubblica (unico punto d'ingresso)
  domain/             # tipi, regole, validazioni (puro TypeScript, testabile)
  application/        # casi d'uso: verificano permessi, aprono transazioni, emettono eventi
  infrastructure/     # query SQL/Kysely, adattatori esterni
  events.ts           # eventi emessi e consumati
apps/web/src/modules/<dominio>/
  ui/                 # componenti React
  actions.ts          # server actions sottili che chiamano application/
```

Il confine tra moduli sarà verificato automaticamente (regole di import in CI) quando arriva il
codice applicativo.
