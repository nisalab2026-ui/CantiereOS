# AUDIT — CantiereOS

> Analisi del codice realmente presente sul ramo `feat/cantiere-digitale` (17/11/2026).
> Ogni voce indica: **cosa manca / cosa non funziona / cosa è migliorabile**, **perché conta**
> e **come implementarlo**. Le priorità sono:
>
> - **P0** — blocca la presentazione a un'azienda reale o è un rischio di sicurezza/dati.
> - **P1** — necessario per l'uso quotidiano.
> - **P2** — miglioramento importante ma rimandabile.
> - **P3** — da valutare (costi, provider esterni, complessità).
>
> Lo stato di avanzamento di ogni voce è nella sezione finale «Piano di lavoro».

## 1. Fotografia dello stato attuale

| Area           | Presente e verificato da test                                                                                                                                                                                               | Assente                                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Database       | 6 migrazioni, RLS su ogni tabella, `audit_log` append-only con trigger generico (valore precedente, nuovo, campi cambiati, utente, request id), FK composte per tenant, 174 test DB                                         | scadenze, certificazioni, manutenzioni, documenti, pagamenti, comunicazioni, attività                         |
| Autenticazione | Supabase Auth, JWT verificato lato server, MFA obbligatoria per ruoli amministrativi, inviti con token hash, revoca sessioni, azienda attiva verificata                                                                     | codici di recupero MFA, rate limiting applicativo, SMTP di produzione                                         |
| Permessi       | catalogo `permissions`, ruoli di sistema (Titolare, Amministratore, Responsabile, Ufficio, Tecnico, Consultazione, Responsabile cantiere, Cliente esterno), controllo lato server + RLS                                     | ruoli personalizzati dall'interfaccia (lo schema li supporta)                                                 |
| Interfaccia    | shell (sidebar, header, menu utente, selettore azienda), ricerca Ctrl K, notifiche in-app, dashboard per ruolo, elenchi clienti/fornitori/personale/squadre, creazione cliente, gestione utenti e inviti, sicurezza account | schede di dettaglio, modifica, eliminazione, storico consultabile, calendario, archivio, impostazioni azienda |
| Test           | DB 174, core 45, E2E 14 (Playwright su Supabase Auth reale)                                                                                                                                                                 | test di accessibilità e responsive automatizzati per pagina                                                   |
| Infrastruttura | Docker locale, CI GitHub (DB + E2E)                                                                                                                                                                                         | ambiente online, backup automatici verificati, monitoraggio                                                   |

**Giudizio sintetico.** Le fondamenta (isolamento tra aziende, autorizzazione, registro modifiche
immutabile) sono solide e testate. Il prodotto, al momento dell'audit, **non era ancora un gestionale utilizzabile
ogni giorno**: si possono vedere elenchi ma non aprire, modificare o seguire nel tempo un
cliente, un dipendente o una scadenza. Le aree richieste (scadenziario, certificazioni,
manutenzioni, documenti, pagamenti, comunicazioni, attività) non esistono ancora.

## 2. Pagine, pulsanti e form

| #   | Problema                                                                                                                       | Perché conta                                                                                                            | Come                                                                                                                                                                     | Pr. |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --- |
| 2.1 | Le righe degli elenchi non aprono nessuna scheda: manca la **pagina di dettaglio** di cliente, fornitore, dipendente, squadra. | Senza scheda non esiste un punto in cui vedere tutto ciò che riguarda un soggetto (dati, scadenze, documenti, storico). | Route `/app/{sezione}/[id]` con intestazione, schede (Panoramica, Scadenze, Documenti, Storico), azioni coerenti con i permessi.                                         | P0  |
| 2.2 | **Nessuna modifica** dei dati: esiste solo la creazione cliente.                                                               | Un'anagrafica che non si può correggere è inutilizzabile.                                                               | Form di modifica con validazione zod condivisa con la creazione, salvataggio con controllo di concorrenza (`updated_at`).                                                | P0  |
| 2.3 | **Nessuna creazione** di fornitori, dipendenti, squadre dall'interfaccia.                                                      | Oggi questi dati arrivano solo dal seed DEMO.                                                                           | Dialog di creazione come per i clienti.                                                                                                                                  | P0  |
| 2.4 | Nessuna archiviazione/eliminazione.                                                                                            | Serve togliere dagli elenchi chi non è più attivo senza perdere lo storico.                                             | "Archivia" = `is_active=false` (reversibile, consentito); eliminazione logica (`deleted_at`) solo con permesso `*.delete` + conferma; mai cancellazione fisica dall'app. | P1  |
| 2.5 | I KPI della dashboard non sempre portano a un elenco filtrato.                                                                 | Ogni numero deve essere cliccabile e spiegabile.                                                                        | Link con filtri nell'URL (già supportati dalle liste).                                                                                                                   | P1  |
| 2.6 | Pagina "Impostazioni azienda" assente.                                                                                         | Dati azienda, preferenze notifiche, ruoli.                                                                              | Pagina con sezioni; solo permesso `tenant.manage`.                                                                                                                       | P2  |
| 2.7 | Nessun pulsante decorativo trovato: le voci presenti funzionano. Le funzioni future non hanno pulsanti finti.                  | Regola di progetto rispettata.                                                                                          | Mantenere.                                                                                                                                                               | —   |

## 3. Database e relazioni

| #   | Problema                                                                         | Perché conta                                        | Come                                                                                                                                                                                                                                                                                                                                                                                              | Pr.         |
| --- | -------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 3.1 | Mancano le tabelle **scadenze/certificazioni/manutenzioni/controlli periodici**. | Sono il cuore operativo richiesto.                  | Una tabella unica `deadlines` con `kind` (certificazione, manutenzione, controllo periodico, documento, pagamento, contratto, altro), collegamento a cliente / fornitore / dipendente / squadra, responsabile, scadenza, stato, ricorrenza in mesi, data completamento. Una tabella unica evita sei moduli quasi identici e dà uno scadenziario unico. Decisione in `docs/DATABASE.md` (ADR-008). | P0          |
| 3.2 | Mancano **documenti** e file.                                                    | Archivio documentale richiesto.                     | `document_folders`, `documents`, `document_versions` + storage S3/Supabase Storage privato con URL firmati brevi; nessun file pubblico.                                                                                                                                                                                                                                                           | P0          |
| 3.3 | Mancano **pagamenti** e stato amministrativo.                                    | Richiesto per dashboard e storico.                  | `payments` (incassi/pagamenti attesi, stato, scadenza, collegamenti) — senza funzioni fiscali: niente fatture elettroniche finché non c'è un intermediario SDI verificato.                                                                                                                                                                                                                        | P1          |
| 3.4 | Mancano **comunicazioni** e **commenti interni**.                                | Storico delle comunicazioni richiesto.              | `communications` (canale, direzione, oggetto, testo, collegamenti) e `comments` su qualsiasi elemento.                                                                                                                                                                                                                                                                                            | P1          |
| 3.5 | Mancano **attività/incarichi** con assegnazione.                                 | Dashboard "in corso / completate / in ritardo".     | `tasks` con stato, priorità, assegnatario, scadenza, collegamenti.                                                                                                                                                                                                                                                                                                                                | P1          |
| 3.6 | Collegamenti polimorfici da progettare con cura.                                 | Una FK "generica" rompe l'integrità e l'isolamento. | Colonne FK esplicite e composte `(tenant_id, x_id)` per ciascun tipo collegabile + `check` che al massimo una sia valorizzata. Niente `entity_type/entity_id` senza FK.                                                                                                                                                                                                                           | P0 (regola) |

## 4. Storico e tracciabilità

| #   | Problema                                                                                                                                                                                                           | Perché conta                                                  | Come                                                                                                                                                                 | Pr. |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| 4.1 | L'`audit_log` registra tutto ma **non è consultabile** da nessuna pagina.                                                                                                                                          | La tracciabilità esiste solo nel database.                    | Pagina **Registro attività** con filtri (utente, sezione, operazione, intervallo date, testo), dettaglio "prima → dopo" per ogni campo.                              | P0  |
| 4.2 | Nessuna **cronologia per elemento** (cliente, dipendente, scadenza…).                                                                                                                                              | Ricostruire la storia di un cliente è un requisito esplicito. | Componente `Timeline` nella scheda di dettaglio, alimentato dall'`audit_log` del record e dei record collegati (es. scadenze del cliente).                           | P0  |
| 4.3 | Le righe del log mostrano nomi tecnici (`customers`, `UPDATE`, `display_name`).                                                                                                                                    | Illeggibili per chi non è tecnico.                            | Dizionario etichette italiane per tabelle, campi e operazioni; valori formattati (date, booleani).                                                                   | P0  |
| 4.4 | Protezione del log: oggi `update/delete/truncate` sono bloccati da trigger e nessun ruolo applicativo ha permessi di scrittura. Manca una **prova di integrità** contro chi ha accesso amministrativo al database. | Requisito "protezione dalle modifiche non autorizzate".       | Catena di hash (`row_hash = sha256(prev_hash ‖ riga)`) calcolata nel trigger con lock per azienda, e funzione `app.verify_audit_chain(tenant)` esposta nella pagina. | P1  |
| 4.5 | Il log non registra **accessi e azioni non-dati** (accesso, MFA, export, download documenti).                                                                                                                      | "Storico attività utenti".                                    | Eventi applicativi espliciti in `audit_log` con `action` dedicata (`auth.sign_in`, `export.csv`, `document.download`), scritti da funzione security definer.         | P1  |
| 4.6 | I record eliminati logicamente restano ma lo storico resta leggibile: OK. Le cancellazioni fisiche sono già registrate con `old_data`.                                                                             | —                                                             | Mantenere.                                                                                                                                                           | —   |

## 5. Gestione documentale

| #   | Problema                     | Come                                                                                                                                                                                                                          | Pr.   |
| --- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 5.1 | Nessun archivio.             | Cartelle e sottocartelle, categorie, collegamenti a cliente/dipendente/scadenza, versioni immutabili, autore e data, scadenza e stato.                                                                                        | P0    |
| 5.2 | Nessuno storage configurato. | **Non simulare**: interfaccia `FileStorage` con implementazione Supabase Storage (bucket privato); finché non è configurato, l'upload mostra "Archiviazione file non configurata". In locale si usa lo storage del container. | P0    |
| 5.3 | Import massivo, OCR.         | Import ZIP/CSV con anteprima e conferma; OCR come provider esterno **opzionale** con dati proposti da rivedere e confermare, mai salvati automaticamente.                                                                     | P2/P3 |

## 6. Dashboard

| #   | Problema                                                                   | Come                                                                                                                                     | Pr. |
| --- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --- |
| 6.1 | La dashboard mostra conteggi anagrafici, non **cosa richiede attenzione**. | Sezione "Priorità": scaduti, in scadenza entro 7/30 giorni, senza responsabile, documenti mancanti; ogni voce porta alla lista filtrata. | P0  |
| 6.2 | Nessun grafico.                                                            | Andamento scadenze per mese, distribuzione per stato; grafici accessibili, leggibili in chiaro e scuro, con tabella alternativa.         | P1  |
| 6.3 | "Attività recenti" mostra righe tecniche del log.                          | Usare le etichette di 4.3 e il nome dell'utente.                                                                                         | P0  |

## 7. Notifiche

| #   | Problema                              | Come                                                                                                                                                    | Pr. |
| --- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| 7.1 | Unica sorgente: invito accettato.     | Notifiche per scadenze imminenti/scadute, assegnazioni, completamenti.                                                                                  | P0  |
| 7.2 | Nessuna protezione dai duplicati.     | Colonna `dedupe_key` con indice univoco per `(tenant, user, dedupe_key)`: lo stesso avviso non si genera due volte.                                     | P0  |
| 7.3 | Nessun processo pianificato (worker). | Funzione idempotente `app.generate_deadline_notifications()`; oggi richiamata all'apertura dell'app (sicura da ripetere), domani da un job pianificato. | P1  |
| 7.4 | Email.                                | Interfaccia presente, provider **non configurato** finché non c'è un SMTP reale.                                                                        | P2  |
| 7.5 | Preferenze.                           | Per utente e tipo (in-app sì/no, email sì/no).                                                                                                          | P2  |

## 8. Ricerca e filtri

| #   | Problema                                  | Come                                                                         | Pr. |
| --- | ----------------------------------------- | ---------------------------------------------------------------------------- | --- |
| 8.1 | La ricerca Ctrl K copre solo anagrafiche. | Estenderla a scadenze, documenti, attività, pagamenti man mano che esistono. | P1  |
| 8.2 | Nessun filtro per intervallo di date.     | Parametri `from/to` nelle liste.                                             | P1  |
| 8.3 | Ricerche salvate.                         | Tabella `saved_views` per utente (filtri dell'URL).                          | P2  |

## 9. Interfaccia ed esperienza utente

| #   | Problema                                                                                                                        | Come                                                              | Pr. |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --- |
| 9.1 | Mancano breadcrumb.                                                                                                             | Componente `Breadcrumbs` nelle pagine di dettaglio.               | P1  |
| 9.2 | Mancano stati di salvataggio coerenti e messaggi di successo.                                                                   | Toast accessibile dopo ogni azione; errori di campo già presenti. | P1  |
| 9.3 | Tabelle non personalizzabili.                                                                                                   | Colonne mostrabili/nascoste salvate nelle preferenze.             | P2  |
| 9.4 | Nessun onboarding.                                                                                                              | Lista "primi passi" sulla dashboard finché l'azienda è vuota.     | P2  |
| 9.5 | Calendario assente.                                                                                                             | Vista mese/settimana dello scadenziario.                          | P1  |
| 9.6 | Responsive: shell e liste funzionano su telefono (test E2E mobile). Le nuove pagine vanno verificate a 390 px, 768 px, 1440 px. | Screenshot automatici nei test.                                   | P1  |

## 10. Ruoli e sicurezza

| #    | Problema                                                                                                                                                                                                                              | Perché conta                           | Come                                                                                   | Pr.                       |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------- |
| 10.1 | Ruoli richiesti dal brief (Amministratore, Responsabile, Ufficio amministrativo, Operatore, Tecnico esterno, Sola consultazione) sono già coperti dai ruoli di sistema; "Tecnico esterno" corrisponde a Tecnico con accesso limitato. | —                                      | Rinominare le etichette solo se l'azienda lo chiede; permessi nuovi per ogni modulo.   | —                         |
| 10.2 | Rate limiting assente.                                                                                                                                                                                                                | Brute force su accesso e inviti.       | Limite per IP e account (Redis o tabella), oggi solo il limite di Supabase Auth.       | P1                        |
| 10.3 | CSP con nonce assente.                                                                                                                                                                                                                | Difesa in profondità contro XSS.       | Header CSP in `proxy.ts`.                                                              | P1                        |
| 10.4 | Codici di recupero MFA assenti.                                                                                                                                                                                                       | Perdita del telefono = blocco account. | Codici monouso hash.                                                                   | P1                        |
| 10.5 | Backup: nessun ambiente di produzione, quindi nessun backup verificato.                                                                                                                                                               | Recupero dati.                         | Backup giornalieri del provider + test di ripristino documentato prima dell'uso reale. | P0 prima della produzione |
| 10.6 | Le operazioni sono protette lato server (RLS + `requirePermission`), non solo nascoste nell'interfaccia: verificato dai test di manomissione.                                                                                         | —                                      | Mantenere per ogni nuovo modulo.                                                       | —                         |

## 11. Report ed esportazioni

| #    | Problema              | Come                                                                                                                                           | Pr. |
| ---- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| 11.1 | Nessuna esportazione. | CSV (compatibile Excel, UTF-8 con BOM, separatore `;`) per ogni lista, con gli stessi filtri e permessi; ogni export registrato nello storico. | P1  |
| 11.2 | PDF e XLSX nativi.    | Generazione nel worker.                                                                                                                        | P2  |

## 12. Funzionalità aggiuntive — valutazione

| Funzione                      | Valutazione                                             | Decisione                                                               |
| ----------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------- |
| Calendario operativo          | Alto valore, costo basso (dati già nello scadenziario). | Sì, P1                                                                  |
| Attività e assegnazioni       | Alto valore.                                            | Sì, P1                                                                  |
| Commenti interni              | Alto valore, costo basso.                               | Sì, P1                                                                  |
| Importazione Excel/CSV        | Alto valore per l'avvio di un'azienda.                  | Sì, P2                                                                  |
| PWA e accesso mobile          | Già previsto (fase 4).                                  | Sì, P2                                                                  |
| Portale clienti / tecnici     | Ruoli già presenti nel database.                        | P2                                                                      |
| Firma elettronica, OCR, email | Richiedono provider esterni a pagamento.                | Interfaccia pronta, "non configurata" finché non scelto un provider. P3 |
| API esterne                   | Utile dopo la stabilizzazione dello schema.             | P3                                                                      |
| Richieste di assistenza       | Coerente con interventi/manutenzioni.                   | P2                                                                      |

## 13. Codice e prestazioni

- Struttura a moduli (`packages/core`, `apps/web`) chiara; import solo dagli `index.ts` pubblici.
- Liste server-side con `count(*) over()` e indici su `(tenant_id, …)`: adeguato fino a decine di
  migliaia di righe; per l'`audit_log` serve paginazione per cursore (id decrescente) e l'indice già
  presente `(tenant_id, created_at desc)`.
- Nessun N+1 rilevato nelle pagine esistenti.

## 14. Piano di lavoro (aggiornato a ogni PR)

| Passo | Contenuto                                                                                                              | Stato                                                        |
| ----- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| A     | AUDIT.md (questo documento)                                                                                            | ✅                                                           |
| B     | Storico consultabile: pagina Registro attività con filtri ed etichette italiane, cronologia nella scheda               | ✅ (PR #5)                                                   |
| C     | Scheda di dettaglio e modifica per clienti e personale, con breadcrumb e storico                                       | ✅ clienti e personale (PR #5); fornitori e squadre da fare  |
| D     | Scadenziario unico (certificazioni, manutenzioni, controlli, pagamenti, documenti) con stati, responsabili, ricorrenza | ✅ (PR #5)                                                   |
| E     | Notifiche scadenze senza duplicati + dashboard "Priorità"                                                              | ✅ (PR #5); job pianificato da fare                          |
| F     | Esportazione CSV con registrazione nello storico                                                                       | ✅ (PR #6)                                                   |
| G     | Archivio documentale con storage privato e versioni                                                                    | ✅ (PR #7); OCR e antivirus non configurati                  |
| H     | Catena di hash sull'audit log, rate limiting, CSP, codici MFA                                                          | ✅ (PR #8); limiti sugli inviti e ancoraggio esterno da fare |
| I     | Calendario, attività, commenti, pagamenti, comunicazioni                                                               | ✅ attività, calendario, commenti (PR #9); pagamenti e comunicazioni da fare |
| J     | Versione dimostrativa online (Supabase + Vercel, dati DEMO separati)                                                   | in attesa di account                                         |
