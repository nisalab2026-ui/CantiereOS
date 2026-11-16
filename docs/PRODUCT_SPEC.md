# CantiereOS — Specifica di prodotto

> Stato: bozza v0.1 (fase 1). Documento vivo: va aggiornato a ogni decisione di prodotto.

## 1. Visione

CantiereOS è un gestionale ERP SaaS multi-azienda per imprese che lavorano "sul campo":
imprese edili, idraulici, aziende di coperture e tetti, lattonieri, impiantisti, manutentori e
aziende di servizi tecnici. Collega ufficio e cantiere in un unico sistema: dalla richiesta del
cliente al preventivo, dall'intervento al rapportino firmato, fino alla fattura e all'incasso.

Il riferimento funzionale di partenza è la categoria di prodotti come OutForWorking (gestione
interventi e rapportini). CantiereOS punta a coprire in più: commesse e cantieri con analisi dei
costi, archivio documentale con OCR e scadenze, magazzino, manutenzioni programmate, sicurezza e
certificazioni, portale cliente e intelligenza artificiale applicata ai documenti e ai dati di
cantiere. Il prodotto ha un'identità propria: non copia interfacce né testi di altri software.

## 2. Utenti e ruoli

| Persona                | Ruolo di sistema                          | Dispositivo principale     | Obiettivi                                      |
| ---------------------- | ----------------------------------------- | -------------------------- | ---------------------------------------------- |
| Titolare               | `owner` (Proprietario azienda)            | Desktop, smartphone        | Controllo margini, cassa, avanzamento commesse |
| Amministratore         | `admin` (Amministratore)                  | Desktop                    | Utenti, impostazioni, fatturazione, documenti  |
| Responsabile operativo | `operations_manager`                      | Desktop, tablet            | Pianificazione, squadre, personale             |
| Capocantiere           | `site_manager` (Responsabile cantiere)    | Tablet, smartphone         | Gestione cantieri e squadre, approvazioni      |
| Ufficio amministrativo | `back_office` (Amministrazione)           | Desktop                    | Clienti, preventivi, ordini, fatture, archivio |
| Tecnico / operaio      | `technician` (Tecnico)                    | Smartphone (anche offline) | Agenda del giorno, rapportini, foto, firme     |
| Cliente finale         | `external_client` (Cliente esterno)       | Web                        | Interventi, documenti, firme, pagamenti        |
| Operatore piattaforma  | amministratore SaaS (separato dai tenant) | Desktop                    | Aziende, abbonamenti, supporto                 |

Requisito di scala: aziende con **oltre 100 utenti** attivi, decine di cantieri in parallelo e
migliaia di rapportini al mese per azienda.

I permessi sono granulari (`modulo.azione`) e assegnati ai ruoli; la matrice è descritta in
[DATABASE.md](DATABASE.md) §3. Ruoli personalizzati per azienda sono previsti in
roadmap.

## 3. Piattaforme

- **Web application** responsive (desktop, tablet, smartphone).
- **PWA installabile** con modalità offline per il tecnico in cantiere: agenda, schede
  intervento, compilazione rapportini, foto e firme funzionano senza rete e si sincronizzano
  automaticamente al ritorno della connessione.
- Tre esperienze distinte sulla stessa base: **amministrazione/ufficio**, **responsabili**,
  **tecnici** (interfaccia mobile semplificata, pulsanti grandi, uso con guanti/luce solare).

## 4. Moduli

Ogni modulo è un dominio applicativo indipendente (vedi [DOMAINS.md](DOMAINS.md)).

| #   | Modulo                         | Sintesi                                                                                                         |
| --- | ------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| 1   | Dashboard                      | KPI per ruolo: interventi del giorno, rapportini da approvare, scadenze, fatturato, margini commessa            |
| 2   | CRM                            | Lead, opportunità, attività commerciali, pipeline, sorgenti                                                     |
| 3   | Clienti e fornitori            | Anagrafiche unificate (cliente/fornitore/entrambi), contatti, dati fiscali italiani (P.IVA, CF, SDI, PEC)       |
| 4   | Sedi e impianti                | Indirizzi d'intervento, impianti/asset installati con matricole, storico interventi                             |
| 5   | Cantieri e commesse            | Commesse con budget, fasi (WBS), avanzamento, costi consuntivi da rapportini/materiali/spese                    |
| 6   | Interventi                     | Ticket/ordini di lavoro, priorità, SLA, assegnazione, stato                                                     |
| 7   | Calendario e pianificazione    | Agenda squadre e mezzi, drag & drop, conflitti, vista giorno/settimana/risorsa                                  |
| 8   | Dipendenti e squadre           | Anagrafica dipendenti, qualifiche, squadre, costo orario                                                        |
| 9   | Rapportini digitali            | Vedi §5.1                                                                                                       |
| 10  | Archivio documentale           | Vedi §5.2                                                                                                       |
| 11  | OCR e intelligenza artificiale | Vedi §5.3                                                                                                       |
| 12  | Preventivi e ordini            | Preventivi a righe/voci di listino, revisioni, accettazione con firma, ordini a fornitore                       |
| 13  | Fatture e pagamenti            | Fatture attive/passive, scadenzario, incassi; fatturazione elettronica SDI tramite intermediario (da scegliere) |
| 14  | Magazzino                      | Articoli, magazzini e furgoni, movimenti, scarico da rapportino, inventario                                     |
| 15  | Manutenzioni                   | Piani di manutenzione programmata su impianti, generazione automatica interventi                                |
| 16  | Sicurezza e certificazioni     | Attestati, visite mediche, DPI, POS/PSC, scadenze con promemoria                                                |
| 17  | Comunicazioni e notifiche      | Notifiche in-app, email, push PWA; preferenze per utente                                                        |
| 18  | Portale cliente                | Accesso del cliente a interventi, documenti, preventivi da accettare                                            |
| 19  | Pannello amministrativo SaaS   | Gestione aziende, supporto, metriche di piattaforma, audit                                                      |
| 20  | Abbonamenti e gestione aziende | Piani, limiti (utenti, storage), prove, rinnovi; provider di pagamento da scegliere                             |

## 5. Funzioni fondamentali

### 5.1 Rapportini digitali

Un rapportino documenta il lavoro svolto in un intervento o in una giornata di cantiere.

- Ore lavorate per operatore (inizio/fine/pause, ordinarie/straordinarie, viaggio)
- Operatori presenti (dipendenti e squadre, anche esterni/subappaltatori)
- Lavorazioni eseguite (testo libero e voci strutturate)
- Materiali utilizzati (da magazzino/furgone o acquisto diretto) con scarico automatico
- Spese (carburante, pedaggi, acquisti) con foto dello scontrino
- Fotografie (prima/durante/dopo) con data, ora e posizione, compressione lato client
- Note interne e note visibili al cliente
- Firme: tecnico e cliente, con nome del firmatario, data/ora e hash del contenuto firmato
- Flusso di approvazione: bozza → inviato → approvato / respinto (con motivo) → fatturabile
- Generazione PDF (nel worker) con layout aziendale; il PDF firmato è immutabile e versionato
- Invio immediato all'ufficio: notifica al responsabile appena il tecnico invia, anche se
  compilato offline (invio alla prima connessione disponibile)

Regola: un rapportino firmato o approvato non si modifica; le correzioni creano una nuova
revisione tracciata.

### 5.2 Archivio documentale

- Importazione massiva (trascina cartelle, ZIP) con coda di elaborazione
- PDF e immagini (JPEG, PNG, HEIC convertito), anteprime generate dal worker
- OCR del testo per la ricerca full-text
- Classificazione (tipo documento) manuale e assistita da AI
- Ricerca per testo, metadati, cliente, cantiere, tipo, scadenza
- Versionamento: ogni nuova versione conserva le precedenti
- Scadenze con promemoria (certificazioni, DURC, assicurazioni, collaudi, garanzie)
- Collegamento a clienti, fornitori, cantieri, impianti, dipendenti

### 5.3 Intelligenza artificiale

L'AI è un assistente, non un decisore: ogni proposta è verificabile e modificabile dall'utente.

- Lettura documenti: estrazione di campi da fatture fornitori, DDT, certificati
- Ricerca intelligente in linguaggio naturale su documenti e dati dell'azienda
- Report automatici (riepilogo settimanale di cantiere, ore/costi per commessa)
- Individuazione anomalie (ore fuori norma, consumi materiali anomali, margini in calo)
- Analisi dei cantieri (avanzamento vs budget, ritardi)
- Promemoria intelligenti (scadenze, interventi da pianificare)

Vincoli: i dati di un'azienda non vengono mai usati per rispondere ad un'altra; ogni chiamata AI
è registrata (chi, cosa, costo); il provider non è ancora scelto né configurato.

## 6. Design

- Prodotto SaaS premium, minimal e professionale; nessun template gestionale generico
- Palette: navy (primario scuro), blu (azione), bianco, scala di grigi; colori semantici solo
  per stati (successo, attenzione, errore)
- Tipografia: Geist (UI) con Geist Mono per codici e importi; Inter come alternativa
- Sidebar moderna comprimibile, ricerca globale (⌘K), dashboard per ruolo
- Tabelle professionali: colonne configurabili, filtri salvati, ordinamento, selezione multipla,
  esportazione, virtualizzazione per grandi volumi
- Animazioni discrete (150–250 ms), rispetto di `prefers-reduced-motion`
- Modalità chiara e scura, responsive completo, accessibilità WCAG 2.2 AA come obiettivo
- Componenti: shadcn/ui personalizzati con design token propri; icone Lucide

## 7. Requisiti non funzionali

| Area          | Obiettivo                                                                       |
| ------------- | ------------------------------------------------------------------------------- |
| Isolamento    | Nessun dato visibile tra aziende; verificato da test automatici a ogni modifica |
| Prestazioni   | Liste principali < 300 ms lato server al p95 con 100k righe per azienda         |
| Offline       | Giornata di lavoro completa senza rete per il tecnico                           |
| Disponibilità | 99,5% iniziale; backup giornalieri con point-in-time recovery                   |
| Audit         | Ogni modifica a dati sensibili tracciata con autore e data                      |
| Privacy       | GDPR: dati in UE, export e cancellazione su richiesta, registro trattamenti     |
| Lingua        | Italiano (prima lingua), struttura pronta per altre lingue                      |

## 8. Fuori ambito (per ora)

- App native iOS/Android (la PWA copre il caso d'uso)
- Contabilità generale completa (si integra con il commercialista tramite export)
- Paghe e presenze legali (export verso software paghe)

## 9. Domande aperte

1. Provider per fatturazione elettronica SDI (intermediario accreditato)
2. Provider pagamenti per abbonamenti (es. Stripe) e per incassi dal portale cliente
3. Provider OCR e AI, e regione di elaborazione dei dati
4. Provider di object storage S3 in produzione (Supabase Storage, Cloudflare R2, AWS S3…)
5. Hosting dell'applicazione e del worker (Vercel + container, o tutto in container)
6. Politica di conservazione per documenti e audit log
