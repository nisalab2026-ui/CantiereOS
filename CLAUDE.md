# CLAUDE.md — Regole di sviluppo di CantiereOS

Questo file vale per chiunque lavori sul repository, persone e assistenti AI.
Documentazione di riferimento: `docs/` (leggere prima di modificare un'area).

## Contesto

CantiereOS è un ERP SaaS multi-azienda per imprese edili e di servizi tecnici.
Monolite modulare (Next.js + worker) su PostgreSQL/Supabase con Row Level Security.
Lingua del prodotto e della documentazione: **italiano**. Codice, nomi di tabelle/colonne,
identificatori e commit tecnici: **inglese** (glossario in `docs/DOMAINS.md`).

## Regole non negoziabili

1. **Analizza prima di modificare.** Leggi i file esistenti; non sovrascrivere senza controllare.
2. **Incrementale.** Un modulo o una funzionalità per volta, con test. Mai "tutto insieme".
3. **Database prima del codice.** Ogni modulo nasce dalla sua migrazione e dai suoi test RLS.
4. **Migrazioni versionate e solo in avanti** in `supabase/migrations/`
   (`YYYYMMDDHHMMSS_descrizione.sql`). Mai modificare una migrazione già applicata.
5. **Mai fidarsi del `tenant_id` dal browser.** L'azienda attiva si ricava dalla sessione
   verificata; il database la ricontrolla con RLS.
6. **Ogni tabella di dominio** ha: `tenant_id not null` + FK a `tenants`, `unique (tenant_id, id)`,
   FK composte verso altre tabelle di dominio, RLS + policy per permesso, trigger
   `prevent_tenant_change`, `touch_updated_at`, audit, grant espliciti. Ogni migrazione che crea
   funzioni in `app` termina con `revoke execute on all functions in schema app from public;`.
7. **Nessuna credenziale nel codice.** Solo variabili d'ambiente; aggiorna `.env.example`.
8. **Non dichiarare completata una funzionalità non testata.** Riporta quali test sono stati
   eseguiti davvero e con quale esito.
9. **Nessun dato fittizio in produzione**; nessun dato reale nei test.
10. **Nessuna operazione distruttiva** (drop, delete massivi, reset DB, force push) senza
    autorizzazione esplicita.
11. **Nessuna integrazione finta.** Se un servizio non è configurato, dillo; non simularlo.
12. **Moduli indipendenti:** si importa solo dall'`index.ts` pubblico di un altro modulo.
13. **Aggiorna la documentazione** (`docs/`) nella stessa modifica che cambia il comportamento.

## Comandi

```bash
pnpm install                 # dipendenze
pnpm typecheck               # TypeScript strict su tutti i pacchetti
pnpm test:db                 # migrazioni + test di isolamento (richiede TEST_DATABASE_URL)
pnpm test:core               # sessione, permessi, MFA, inviti lato server (richiede TEST_DATABASE_URL)
pnpm e2e:auth                # stack Supabase Auth reale in Docker + build app + test Playwright
pnpm format                  # prettier
docker compose --profile test up -d postgres-test   # PostgreSQL usa-e-getta su :54329
```

Sviluppo dell'app in locale: `node scripts/local-auth-env.mjs` (segreti casuali in file ignorati
da git), `docker compose --env-file .env.local-auth --profile auth up -d auth-db gotrue
auth-gateway mailpit`, `node scripts/local-auth-migrate.mjs`, poi `pnpm --filter @cantiereos/web dev`.
Le email (conferme, recupero password, inviti) si leggono su http://127.0.0.1:8025 (mailpit).
Dati DEMO in locale: `psql "$DATABASE_URL" -f supabase/seeds/development.sql`, poi
`node scripts/local-demo-login.mjs` (password casuale per gli utenti `@demo.cantiereos.invalid`, solo stack locale).

`TEST_DATABASE_URL` punta a un server PostgreSQL di sviluppo/CI (es.
`postgresql://postgres@127.0.0.1:54329/postgres`). I test creano un database con nome casuale
`cantiereos_test_*` e lo eliminano al termine. Mai puntarla a un database con dati veri.

## Struttura

- `supabase/migrations/` — schema (fonte di verità)
- `supabase/seeds/development.sql` — dati DEMO solo per sviluppo (mai in produzione, mai nelle migrazioni)
- `packages/db/` — runner migrazioni per i test, shim Supabase **solo test**, test RLS
- `packages/core/` — sessione verificata, autorizzazione, transazioni RLS, casi d'uso (server)
- `apps/web/` — Next.js 16 (App Router, `src/proxy.ts` al posto del middleware)
- `e2e/` — test Playwright contro Supabase Auth reale; `infra/local-auth/`, `scripts/` — stack locale
- `apps/worker/` — fase successiva (vedi `docs/ROADMAP.md`)

## Regole per autenticazione e autorizzazione

- Identità solo da `getVerifiedSession()` / `requireSession()` (JWT verificato con `jose`);
  mai `getSession().user` o dati del form.
- Dati aziendali solo dentro `asCurrentUser(...)` (RLS attiva); azienda attiva da
  `getAppContext()` / `resolveActiveTenant()`; controllo con `requirePermission()` prima di agire.
- Nuovi permessi amministrativi o distruttivi: `requires_mfa = true`.
- `withServiceTransaction` solo per worker/piattaforma, con attore dichiarato.

## Come aggiungere una tabella di dominio

1. Nuova migrazione con timestamp successivo; segui il modello di `customers` e usa gli helper
   `app.attach_tenant_table_triggers`, `app.grant_tenant_table`, `app.create_tenant_policies`
   (esempio in `docs/DATABASE.md` §2).
2. Aggiungi i permessi nel catalogo (`permissions`) e nella matrice (`role_permissions`).
3. Scrivi i test di isolamento per la tabella (lettura, scrittura, update, delete cross-tenant,
   permessi per ruolo). Le guardie di `schema-guards.test.ts` girano automaticamente.
4. Aggiorna `docs/DATABASE.md`.
