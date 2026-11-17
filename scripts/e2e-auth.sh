#!/usr/bin/env bash
# Avvia lo stack locale reale (PostgreSQL + Supabase Auth + Storage + mailpit + gateway),
# applica le migrazioni, compila e avvia l'app, esegue i test end-to-end.
# SOLO SVILUPPO/CI: segreti casuali generati al volo, database su tmpfs.
set -euo pipefail
cd "$(dirname "$0")/.."

node scripts/local-auth-env.mjs
docker compose --env-file .env.local-auth --profile auth up -d --wait auth-db gotrue storage auth-gateway mailpit
for i in $(seq 1 60); do
  curl -fs http://127.0.0.1:54321/auth/v1/health >/dev/null &&
    curl -fs http://127.0.0.1:54321/storage/v1/status >/dev/null && break
  sleep 1
done
# Schema "storage" dell'archivio documenti (idempotente), poi i grant in local-auth-migrate.
docker compose --env-file .env.local-auth --profile auth exec -T storage node dist/scripts/migrate-call.js
node scripts/local-auth-migrate.mjs

pnpm --filter @cantiereos/web build
(cd apps/web && npx next start -p 3000 >/tmp/cantiereos-web.log 2>&1 &)
for i in $(seq 1 60); do
  curl -fs -o /dev/null http://localhost:3000/accedi && break
  sleep 1
done

pnpm --filter @cantiereos/e2e test
