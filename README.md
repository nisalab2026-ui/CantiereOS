# CantiereOS

ERP SaaS multi-azienda per imprese edili, idraulici, coperture e lattonieri, impiantisti,
manutentori e aziende di servizi tecnici. Web app + PWA con modalità offline per il cantiere.

> **Stato: fase 1 — fondamenta.** Esistono documentazione, schema del database core con
> isolamento multi-tenant e i relativi test. L'interfaccia web non è ancora stata creata.

## Documentazione

| Documento                                    | Contenuto                                         |
| -------------------------------------------- | ------------------------------------------------- |
| [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md) | Visione, utenti, moduli, funzioni, design         |
| [docs/DOMAINS.md](docs/DOMAINS.md)           | Domini applicativi, confini, glossario            |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Monolite modulare, stack, flussi, offline, worker |
| [docs/DATABASE.md](docs/DATABASE.md)         | Convenzioni, schema, strategia multi-tenant       |
| [docs/SECURITY.md](docs/SECURITY.md)         | Modello di sicurezza e minacce coperte            |
| [docs/ROADMAP.md](docs/ROADMAP.md)           | Fasi e criteri di uscita                          |
| [CLAUDE.md](CLAUDE.md)                       | Regole di sviluppo                                |

## Requisiti

- Node.js 22+ e pnpm 10+
- PostgreSQL 15+ per i test (locale, Docker o CI)
- Docker (opzionale) per i servizi di sviluppo

## Avvio rapido (test del database)

```bash
pnpm install
docker compose --profile test up -d postgres-test
export TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:54329/postgres
pnpm typecheck
pnpm test:db
pnpm test:core
```

I test applicano tutte le migrazioni a un database temporaneo e verificano che nessuna azienda
possa leggere, modificare o collegare dati di un'altra, e che sessione, permessi e MFA siano
verificati lato server.

## Avvio dell'app in locale (Supabase Auth reale in Docker)

```bash
node scripts/local-auth-env.mjs        # segreti casuali in .env.local-auth e apps/web/.env.local
docker compose --env-file .env.local-auth --profile auth up -d auth-db gotrue auth-gateway mailpit
node scripts/local-auth-migrate.mjs    # migrazioni sul database locale
pnpm --filter @cantiereos/web dev      # http://localhost:3000 — email su http://127.0.0.1:8025
pnpm e2e:auth                          # oppure: tutto in automatico + test end-to-end
```

## Struttura

```
apps/web          Next.js 16: autenticazione e area applicativa
apps/worker       processi asincroni (fase successiva)
packages/core     sessione verificata, autorizzazione, transazioni RLS
packages/db       tooling migrazioni e test di isolamento
e2e               test end-to-end Playwright (Supabase Auth reale)
supabase/         migrazioni SQL versionate
docs/             documentazione
```

## Licenza

Software proprietario. Tutti i diritti riservati.
