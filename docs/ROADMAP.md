# CantiereOS — Roadmap

> Ogni fase si chiude solo quando i suoi criteri di uscita sono verificati da test reali.
> Una funzionalità non testata non è "completata".

## Fase 1 — Fondamenta (questa fase) ✅

- [x] Analisi ambiente
- [x] Struttura repository (pnpm workspace, TypeScript strict, CI)
- [x] Documentazione: prodotto, architettura, domini, database, sicurezza, roadmap
- [x] Prima migrazione: tenancy, ruoli/permessi, audit, clienti/fornitori
- [x] Test di isolamento tra aziende su PostgreSQL reale

## Fase 1b — Fondamenta del database ✅

- [x] Core: tenants, tenant_settings, users, roles (sistema + personalizzati), permissions,
      role_permissions, memberships, subscriptions, audit_log
- [x] Anagrafiche: customers, suppliers, contacts, customer_sites
- [x] Personale: employees, teams, team_members
- [x] Seed di sviluppo separato e protetto
- [x] 134 test (isolamento cross-tenant per ogni tabella, ruoli, audit, guardie, seed)

**Uscita:** migrazione applicata da zero senza errori; test di isolamento verdi.

## Fase 2 — Applicazione base e autenticazione

- Progetto Supabase (dev) e `supabase/config.toml`; `supabase db push` della migrazione 0001
- Scaffold Next.js in `apps/web` (TypeScript strict, Tailwind, shadcn/ui, Geist, tema chiaro/scuro)
- Design system: token colore navy/blu/grigi, tipografia, layout con sidebar, ⌘K
- Login, registrazione, MFA, recupero password
- Onboarding: creazione azienda (via `app.create_tenant` lato server), invito utenti
- Selettore azienda attiva (cookie firmato verificato)
- `packages/core`: contesto richiesta, controllo permessi, transazione RLS
- Modulo **Clienti e fornitori** completo (lista, filtri, scheda, contatti, sedi)
- Pagina audit log
- Test: unit (Vitest), E2E login → crea cliente → isolamento tra due aziende (Playwright)
- Conferma ADR-006 (Kysely) e ADR-007 (BullMQ)

**Uscita:** due aziende reali di test in ambiente dev, nessun accesso incrociato via UI né API.

## Fase 3 — Operatività di campo

- Sedi e impianti, Dipendenti e squadre
- Cantieri e commesse (base), Interventi
- Calendario e pianificazione
- Rapportini digitali (online): ore, operatori, lavorazioni, materiali, spese, foto, note, firme,
  approvazione
- Storage S3 + tabella `files` + URL firmati + test isolamento file
- Worker: generazione PDF rapportino, notifiche email all'ufficio

## Fase 4 — PWA e offline

- Service worker, installazione, push notification
- IndexedDB + outbox + `/api/sync` con idempotenza e versioni
- Interfaccia tecnico mobile-first
- Test E2E offline (Playwright con rete disattivata)

## Fase 5 — Documenti, OCR e AI

- Archivio documentale: import massivo, versioni, scadenze, collegamenti, ricerca full-text
- OCR (provider da scegliere) e classificazione
- Ricerca intelligente, estrazione dati da fatture fornitori, report automatici, anomalie

## Fase 6 — Area commerciale e amministrativa

- CRM, Preventivi e ordini, Magazzino
- Fatture e pagamenti, scadenzario; fatturazione elettronica SDI con intermediario
- Manutenzioni programmate, Sicurezza e certificazioni

## Fase 7 — SaaS

- Portale cliente
- Pannello amministrativo SaaS, impersonazione controllata
- Abbonamenti, piani e limiti (provider pagamenti da scegliere)
- Ruoli personalizzati per azienda
- Hardening: penetration test, carico con 100+ utenti per azienda, backup/restore provati

## Debito tecnico e decisioni aperte

Vedi PRODUCT_SPEC §9 e ARCHITECTURE §10.
