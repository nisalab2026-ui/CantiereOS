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

## Fase 2a — Autenticazione e autorizzazione ✅ (in revisione)

- [x] Ruoli richiesti: Proprietario, Amministratore, Responsabile operativo, Responsabile
      cantiere, Amministrazione, Tecnico, Cliente esterno; Super Admin SaaS (`platform_admins`)
- [x] MFA nel database (`requires_mfa` + `aal2`) e obbligatoria nell'app per ruoli amministrativi
- [x] Inviti con token hash, email verificata, scadenza, revoca, limite posti
- [x] Azienda attiva verificata a ogni richiesta; utenti in più aziende
- [x] Revoca immediata delle sessioni (`auth.sessions`), esci da tutti i dispositivi
- [x] `packages/core`: verifica JWT, transazione RLS, permessi/MFA, inviti, registrazione
- [x] `apps/web` (Next.js 16): accesso, registrazione azienda, recupero password, MFA, inviti,
      membri, selettore azienda
- [x] Stack Supabase Auth locale in Docker + test E2E Playwright con email reali (mailpit)
- [ ] Template email italiani, SMTP e progetto Supabase di produzione (serve un account)
- [ ] Rate limiting applicativo (Redis), CSP con nonce, codici di recupero MFA

## Fase 2b — Interfaccia ✅ (in revisione)

- [x] Design system (`docs/DESIGN_SYSTEM.md`), marchio CantiereOS, tema chiaro/scuro/sistema
- [x] Sidebar filtrata per permessi, selettore azienda con badge DEMO, header, menu utente
- [x] Ricerca globale (Ctrl/⌘ K) lato server con RLS; notifiche in-app (tabella `notifications`)
- [x] Dashboard per ruolo (amministrazione, responsabile, tecnico, cliente esterno) con soli dati reali
- [x] Tabelle server-side con ricerca, filtri, ordinamento e paginazione nell'URL; modali, conferme,
      stati di caricamento/vuoto/errore/non permesso
- [x] Elenchi clienti, fornitori, personale, squadre; creazione cliente; gestione utenti restyling
- [ ] Scheda di dettaglio, modifica ed eliminazione di clienti/fornitori/personale/squadre, contatti e
      sedi (con il modulo cantieri)
- [x] Pagina del registro attività con filtri (sezione, operazione, utente, periodo, testo) e
      paginazione per cursore
- [x] Schede di dettaglio e modifica di clienti e personale con breadcrumb, schede e storico
      prima/dopo; creazione del personale; archivia/riattiva
- [x] Scadenziario unico (certificazioni, manutenzioni, controlli, documenti, pagamenti, contratti)
      con ricorrenza, responsabile, completamento, avvisi senza duplicati
- [x] Dashboard "Richiede attenzione" con grafici collegati alle liste filtrate
- [x] AUDIT.md con priorità e piano di lavoro
- [x] Esportazione CSV (compatibile Excel) di clienti, fornitori, personale, squadre, scadenze e
      registro, con i filtri della pagina e registrazione nello storico
- [x] Archivio documentale: cartelle, caricamento multiplo con trascinamento, verifica del tipo
      reale, versioni immutabili, anteprima, download tracciato, scadenza con promemoria nello
      scadenziario, collegamento a clienti/personale/fornitori/squadre, documenti riservati,
      ricerca ed esportazione CSV (storage privato Supabase, URL firmati)
- [x] Sicurezza: catena di hash verificabile sul registro attività, limite ai tentativi (accesso,
      MFA, recupero password, registrazione), Content Security Policy con nonce e HSTS, codici di
      recupero MFA
- [x] Attività assegnabili (stato, priorità, data, collegamento a clienti/personale/fornitori/
      squadre, notifica all'assegnatario che può aggiornarne solo lo stato), calendario mensile di
      attività e scadenze con agenda su telefono, commenti interni su clienti, personale, scadenze,
      documenti e attività (ADR-011)
- [x] Scadenziario dei pagamenti attesi (da incassare / da pagare, saldo con data, importo
      effettivo e autore, totali, CSV) e registro delle comunicazioni (telefonate, email, PEC,
      incontri) con richiami, nel calendario, nella ricerca e nelle schede (ADR-012)
- [ ] Conferma ADR-006 (Kysely) e ADR-007 (BullMQ)

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

- Archivio documentale: base fatta in fase 2 (versioni, scadenze, collegamenti, caricamento
  multiplo); restano ricerca nel contenuto dei file, import da archivio zip, antivirus
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
