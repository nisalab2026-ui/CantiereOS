# @cantiereos/db

Tooling per le migrazioni e test di sicurezza del database.

- `src/migrations.ts` — carica e applica le migrazioni di `supabase/migrations` (usato dai test)
- `tests/supabase-shim.sql` — emula ruoli e `auth.uid()` di Supabase **solo per i test locali**;
  non è una migrazione e non va mai applicato a Supabase
- `tests/*.test.ts` — isolamento tra aziende, ruoli/permessi, audit log, guardie sullo schema

## Esecuzione

```bash
docker compose --profile test up -d postgres-test     # oppure un PostgreSQL 15+ locale
export TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:54329/postgres
pnpm --filter @cantiereos/db test
```

Ogni run crea un database `cantiereos_test_<casuale>`, applica shim + migrazioni, esegue i test
in transazioni annullate (rollback) ed elimina il database alla fine.
