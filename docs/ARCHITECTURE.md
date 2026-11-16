# CantiereOS — Architettura

> Stato: v0.1 (fase 1). Le decisioni marcate **[da confermare]** vanno validate in fase 2 con un
> prototipo prima di diventare definitive.

## 1. Stile: monolite modulare

Un'unica applicazione deployabile, divisa in moduli con confini netti (vedi
[DOMAINS.md](DOMAINS.md)), più un processo **worker** separato che condivide lo stesso codice di
dominio. Niente microservizi: un solo database, transazioni locali, un solo flusso di deploy.
I confini interni permettono di estrarre un servizio in futuro solo se un carico lo richiede
davvero (es. OCR).

```
                ┌────────────────────────── Browser / PWA ──────────────────────────┐
                │ React (Next.js) · service worker · IndexedDB (offline) · outbox    │
                └───────────────┬────────────────────────────────┬──────────────────┘
                     HTTPS (cookie di sessione)          upload diretto (URL firmato)
                                │                                │
┌───────────────────────────────▼──────────────┐                 │
│ apps/web — Next.js (App Router, Node runtime) │                 │
│  • Server Components / Server Actions        │                 │
│  • Route handlers: /api/sync, webhook        │                 │
│  • Middleware: sessione Supabase, tenant     │                 │
│  ┌─────────────── packages/core ───────────┐ │                 │
│  │ moduli di dominio (casi d'uso, regole)  │ │                 │
│  └─────────────────────────────────────────┘ │                 │
└───────┬───────────────────────┬──────────────┘                 │
        │ SQL (ruolo            │ enqueue job                    │
        │ authenticated + JWT)  ▼                                ▼
        │                ┌────────────┐               ┌─────────────────────┐
        │                │   Redis    │               │ Object storage S3   │
        │                │ (BullMQ)   │               │ tenants/{id}/...    │
        │                └─────┬──────┘               └─────────▲───────────┘
        ▼                      │ consume                        │
┌──────────────────────┐ ┌─────▼──────────────────────────┐     │
│ PostgreSQL (Supabase)│◄┤ apps/worker — Node             │─────┘
│  RLS · audit · outbox│ │ PDF · OCR · AI · email · push  │
│  Supabase Auth       │ │ import massivi · scadenze      │
└──────────────────────┘ └────────────────────────────────┘
```

## 2. Stack

| Livello         | Scelta                                                                                  | Motivo                                       |
| --------------- | --------------------------------------------------------------------------------------- | -------------------------------------------- |
| Linguaggio      | TypeScript `strict` (+ `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)        | Sicurezza dei tipi end-to-end                |
| Web             | Next.js (App Router), React                                                             | SSR, Server Actions, PWA, un solo deploy     |
| UI              | Tailwind CSS, shadcn/ui personalizzato, Lucide, font Geist                              | Design system proprio, accessibile           |
| Database        | PostgreSQL (Supabase)                                                                   | RLS, JSONB, full-text, pgvector              |
| Auth            | Supabase Auth (`@supabase/ssr`, cookie httpOnly)                                        | MFA, magic link, SSO in futuro               |
| Accesso dati    | SQL scritto a mano nelle migrazioni; query tipizzate con **Kysely** **[da confermare]** | Le migrazioni SQL restano la fonte di verità |
| Code asincrone  | Redis + BullMQ **[da confermare]**                                                      | Retry, priorità, scheduling, osservabilità   |
| File            | Object storage S3-compatibile, URL firmati                                              | Provider intercambiabile                     |
| Offline         | Service worker (Serwist) + IndexedDB (Dexie) **[da confermare]**                        | Cache app shell e dati, coda mutazioni       |
| Test            | Vitest (unit, DB), Playwright (E2E)                                                     |                                              |
| Container       | Docker per worker e servizi locali                                                      |                                              |
| Package manager | pnpm workspace                                                                          | Monorepo leggero                             |

Versioni verificate nell'ambiente di fase 1: Node 22, pnpm 10.28, TypeScript 5.9.3,
Vitest 4.1.12, pg 8.23.1, PostgreSQL 16.

## 3. Struttura del repository

```
cantiere-os/
├── apps/
│   ├── web/              # Next.js (fase 2)
│   └── worker/           # processi asincroni (fase 2+)
├── packages/
│   ├── db/               # tooling migrazioni + test RLS/isolamento (attivo)
│   └── core/             # moduli di dominio condivisi web/worker (fase 2)
├── supabase/
│   └── migrations/       # migrazioni SQL versionate (fonte di verità dello schema)
├── docs/                 # specifiche e architettura
├── .github/workflows/    # CI
├── docker-compose.yml    # servizi di supporto per lo sviluppo
└── CLAUDE.md             # regole per chi sviluppa (umani e AI)
```

## 4. Flusso di una richiesta (lettura/scrittura)

1. Il middleware Next.js rinnova la sessione Supabase (cookie httpOnly, `SameSite=Lax`).
2. Il server legge l'utente **dal token verificato**, mai da parametri del client.
3. L'**azienda attiva** è salvata in un cookie firmato; a ogni richiesta il server verifica che
   l'utente sia membro attivo di quell'azienda. Un valore non valido viene ignorato.
4. Il caso d'uso (`packages/core`) controlla il permesso (`customers.write`, …) e apre una
   transazione con:
   ```sql
   set local role authenticated;
   select set_config('request.jwt.claims', '<claims del JWT verificato>', true);
   select set_config('app.request_id', '<id richiesta>', true);
   ```
   Da qui in poi **ogni query è soggetta a RLS**: anche un bug nel codice non può leggere o
   scrivere dati di un'altra azienda.
5. Il `tenant_id` dei nuovi record è quello dell'azienda attiva verificata al punto 3; il
   database lo ricontrolla con le policy `WITH CHECK`.
6. Eventi di dominio scritti nella tabella outbox nella stessa transazione; il worker li consuma.

Il ruolo `service_role` (che bypassa RLS) è usato **solo** nel worker e in operazioni di
piattaforma esplicite (creazione azienda, pannello SaaS). In quei casi il codice filtra sempre
per `tenant_id` esplicito e dichiara l'attore con `app.actor_user_id` per l'audit.

L'API dati automatica di Supabase (PostgREST) **non è usata dal browser** per i dati di dominio.
Le RLS sono comunque complete, così un'eventuale esposizione resta protetta (difesa in profondità).

## 5. Multi-tenancy

Modello: **database condiviso, schema condiviso, colonna `tenant_id`** su ogni tabella di
dominio, con Row Level Security. È il modello che scala meglio per migliaia di aziende piccole e
medie, con costi operativi bassi. Dettagli in [DATABASE.md](DATABASE.md) e
[SECURITY.md](SECURITY.md).

## 6. Offline e sincronizzazione (PWA)

- **App shell** e asset in cache dal service worker; dati del tecnico (agenda, interventi
  assegnati, anagrafiche necessarie, catalogo materiali) in IndexedDB.
- Le modifiche offline vanno in una **outbox locale** con UUID generati dal client e una
  chiave di idempotenza per operazione. Al ritorno della rete, `POST /api/sync` le applica in
  ordine; ripetere lo stesso invio non duplica nulla.
- **Conflitti:** il server è autorevole. Ogni record sincronizzabile ha `version` (intero
  incrementato dal database). Se la versione di base del client è vecchia:
  - rapportini in bozza: appartengono al tecnico, conflitto raro → vince l'ultima modifica del
    proprietario, con traccia nell'audit;
  - dati condivisi (es. stato intervento): il server rifiuta e il client mostra la versione
    aggiornata con le differenze.
- Foto e firme: caricate in coda separata, a blocchi, con ripresa dopo interruzione.
- Pull incrementale: `GET /api/sync?since=<cursore>` restituisce solo ciò che è cambiato per
  l'utente, sempre filtrato per azienda attiva e permessi.
- Dati in IndexedDB cancellati al logout e al cambio azienda.

## 7. Processi asincroni (worker)

| Job                                            | Trigger                                    |
| ---------------------------------------------- | ------------------------------------------ |
| Generazione PDF rapportini/preventivi/fatture  | evento `report.approved`, richiesta utente |
| OCR e classificazione documenti                | `file.uploaded`                            |
| Anteprime e conversione immagini (HEIC → JPEG) | `file.uploaded`                            |
| Scansione antivirus file caricati              | `file.uploaded`                            |
| Import massivi (CSV clienti, ZIP documenti)    | richiesta utente                           |
| Notifiche email/push                           | eventi di dominio                          |
| Promemoria scadenze, manutenzioni programmate  | cron giornaliero                           |
| Report AI e rilevamento anomalie               | cron / richiesta                           |

Regole: ogni job porta `tenant_id`, `actor_user_id` e `request_id`; è idempotente; ha retry con
backoff e coda di errore; non legge mai dati senza filtro `tenant_id`.

## 8. File

- Chiave oggetto: `tenants/{tenant_id}/{modulo}/{yyyy}/{mm}/{uuid}` — il nome originale sta solo
  nei metadati del database.
- Bucket **privato**. Upload e download solo con URL firmati a breve scadenza, generati dal
  server dopo il controllo dei permessi sul record collegato.
- Tabella `files` con `tenant_id`, hash SHA-256, MIME verificato, dimensione, stato scansione.
- File non scansionati non sono scaricabili.

## 9. Osservabilità

Log strutturati JSON con `request_id`, `tenant_id`, `user_id` (mai dati personali nel
messaggio); tracing OpenTelemetry; metriche per coda e sync. Provider da scegliere.

## 10. Decisioni architetturali

| #       | Decisione                                                                                  | Stato                           |
| ------- | ------------------------------------------------------------------------------------------ | ------------------------------- |
| ADR-001 | Monolite modulare + worker separato                                                        | Accettata                       |
| ADR-002 | Multi-tenancy con `tenant_id` + RLS su schema condiviso                                    | Accettata, implementata in 0001 |
| ADR-003 | Migrazioni SQL scritte a mano in `supabase/migrations`, nessuna migrazione generata da ORM | Accettata                       |
| ADR-004 | Server come unico punto di accesso ai dati di dominio; RLS come seconda barriera           | Accettata                       |
| ADR-005 | FK composte `(tenant_id, id)` tra tabelle di dominio                                       | Accettata, implementata in 0001 |
| ADR-006 | Kysely come query builder                                                                  | Da confermare in fase 2         |
| ADR-007 | BullMQ su Redis per i job                                                                  | Da confermare in fase 2         |
| ADR-008 | Serwist + Dexie per PWA offline                                                            | Da confermare con prototipo     |
