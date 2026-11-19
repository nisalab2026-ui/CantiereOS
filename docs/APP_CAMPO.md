# CantiereOS — App operativa per i dipendenti ("Campo")

> Stato: **proposta di architettura**, nessun codice ancora scritto. Va approvata prima di
> iniziare lo sviluppo. Le scelte marcate **[da decidere]** sono elencate al §10.

## 1. Obiettivo e principi

Uno strumento per chi lavora sul campo, non un secondo gestionale. Il dipendente apre il telefono
e vede subito **cosa deve fare oggi, dove e per chi**, aggiorna lo stato del lavoro e parte con il
navigatore. Tutto il resto (pianificazione, anagrafiche, costi, approvazioni) resta nel gestionale.

Principi:

1. **Stesso sistema, interfaccia diversa.** Un solo database, una sola autenticazione, un solo
   codice di dominio (`packages/core`). La "Campo" è un'altra faccia della stessa applicazione,
   non un prodotto separato da sincronizzare.
2. **Il gestionale pianifica, il campo esegue.** Gli interventi si creano e si assegnano
   nell'ufficio; il dipendente li legge e ne cambia solo lo stato e le note operative.
3. **Mobile-first e pochi tocchi.** Ogni azione frequente al massimo a due tocchi dalla schermata
   iniziale.
4. **Vede solo il suo lavoro.** Il filtro non è un'opzione dell'interfaccia: lo impone il database
   (RLS) in base all'assegnazione.

## 2. Decisione principale: dentro `apps/web`, sotto `/campo` (ADR-017)

| Opzione                                           | Pro                                                                   | Contro                                                                       |
| ------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **A. Gruppo di route `(campo)` in `apps/web`** ✅ | Riusa sessione, MFA, permessi, `asCurrentUser`, design system, deploy | Il bundle va tenuto leggero (layout e componenti propri, niente Lenis)       |
| B. Nuova `apps/field` (Next.js separato)          | Isolamento totale                                                     | Doppio deploy, doppia configurazione auth/cookie, codice duplicato           |
| C. App nativa (React Native)                      | GPS e notifiche native                                                | Store, due piattaforme, costi molto più alti; non serve per questi requisiti |

Scelta: **A**. La web app è una **PWA installabile** con un proprio manifest (`scope: /campo`,
icona e nome "CantiereOS Campo"), così sul telefono si apre a tutto schermo come un'app. Se in
futuro servisse un sottodominio (`campo.<dominio>`) basta una regola nel proxy: il codice non cambia.

```
apps/web/src/app/
  (app)/app/…            gestionale (esistente)
  (campo)/campo/         app dipendenti (nuovo)
    layout.tsx           barra in basso: Oggi · Calendario · Mappa · Avvisi
    page.tsx             "Oggi": prossimo intervento, lista della giornata, mini-mappa
    calendario/          giorno / settimana / mese
    mappa/               interventi sul territorio
    interventi/[id]/     dettaglio + azioni di stato
    avvisi/              notifiche
    storico/             interventi conclusi
packages/core/src/
  field/                 casi d'uso della Campo (index.ts pubblico, regola 12)
  operations/work-orders.ts   casi d'uso dell'ufficio sugli interventi
```

**Chi entra nella Campo:** un membro dell'azienda collegato a una scheda `employees`
(`employees.user_id`), con il permesso `field.access`. Dopo l'accesso, chi ha solo permessi di
campo (ruolo Tecnico) va direttamente su `/campo`; chi ha anche il gestionale vede un pulsante
"Apri Campo". Le pagine della Campo usano gli stessi `requireSession()`, `getAppContext()` e
`requirePermission()` del gestionale.

## 3. Modello dati (nuova migrazione, fase 3)

Oggi esistono `tasks` (attività d'ufficio), `projects` (commesse), `customers` / `customer_sites`
con coordinate (ADR-016), `employees`, `teams`, `notifications`, `work_reports`. Manca l'entità
**intervento** (`work_order`, già prevista in [DOMAINS.md](DOMAINS.md)). Le attività (`tasks`)
restano promemoria d'ufficio: non si riusano come interventi, perché non hanno orario, luogo,
cliente-sede né storico degli stati.

Tabelle nuove, tutte con il modello standard (`tenant_id`, `unique (tenant_id, id)`, FK composte,
RLS, `prevent_tenant_change`, `touch_updated_at`, audit, grant espliciti):

| Tabella                    | Contenuto                                                                                                                                                                                                                                                            |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `work_orders`              | titolo, descrizione del lavoro, `operational_notes`, `customer_id`, `customer_site_id`, `project_id` (facoltativi), indirizzo e coordinate **propri solo se diversi dalla sede**, `scheduled_start` / `scheduled_end` (timestamptz), `status`, `priority`, `version` |
| `work_order_assignments`   | `work_order_id` + `employee_id` **oppure** `team_id`; un intervento può avere più persone                                                                                                                                                                            |
| `work_order_status_events` | ogni cambio di stato: da → a, chi, quando, nota facoltativa (motivo della sospensione). È lo **storico** e la base per le ore effettive                                                                                                                              |

Stati: `scheduled` (da svolgere), `in_progress` (in corso), `suspended` (sospeso), `completed`
(completato), più `cancelled` usabile solo dall'ufficio. Transizioni ammesse controllate da una
funzione SQL (es. `completed` non torna `in_progress` dal campo).

Collegamenti con il resto:

- **Rapportini:** `work_reports.work_order_id` (facoltativo). Da un intervento completato il
  dipendente può aprire il rapportino già compilato con cliente, cantiere e data.
- **Calendario del gestionale:** `listCalendar` mostra anche gli interventi, così ufficio e campo
  vedono la stessa pianificazione.
- **Mappa del gestionale:** gli interventi del giorno si aggiungono come livello alla mappa esistente.

Permessi nuovi (catalogo `permissions` + matrice `role_permissions`):

| Permesso                    | Ruoli                                           | Note                                                  |
| --------------------------- | ----------------------------------------------- | ----------------------------------------------------- |
| `work_orders.read`          | titolare, amministratore, responsabili, ufficio | tutti gli interventi                                  |
| `work_orders.write`         | titolare, amministratore, responsabili          | crea, pianifica, assegna, annulla                     |
| `field.access`              | tecnico, responsabile cantiere                  | entrare nella Campo                                   |
| `work_orders.read_assigned` | tecnico, responsabile cantiere                  | solo interventi assegnati a sé o alla propria squadra |
| `work_orders.update_status` | tecnico, responsabile cantiere                  | stato + note operative, nient'altro                   |

RLS: una funzione `app.current_employee_ids()` restituisce le schede `employees` dell'utente
nell'azienda attiva; la policy di lettura per il campo ammette un intervento solo se esiste
un'assegnazione a una di quelle schede o a una squadra di cui fanno parte (`team_members`). Il
cambio di stato passa da una funzione `app.set_work_order_status(id, status, base_version, note)`
che controlla assegnazione, transizione e versione, e scrive l'evento nella stessa transazione:
il dipendente **non** ha `update` diretto sulla tabella, quindi non può cambiare orari o clienti.

## 4. Funzioni richieste → come si realizzano

| Funzione                | Realizzazione                                                                                                                                                                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Calendario**          | Caso d'uso `listMyWorkOrders(range)` sullo stesso schema di `listCalendar` (intervallo massimo 62 giorni, solo i miei). Vista giorno = lista oraria, settimana = 7 colonne compatte, mese = puntini per giorno; scorrimento laterale tra i giorni                                                            |
| **Mappa animata**       | Leaflet, già nel progetto (`components/map/places-map.tsx`). Puntine numerate nell'ordine della giornata, linea del percorso tra un intervento e il successivo, animazione di "volo" sulla puntina selezionata, colore per stato. **Nessun tracciamento continuo della posizione dei dipendenti** (vedi §10) |
| **Gestione interventi** | Lista "Oggi" e "Prossimi" con orario, cliente, indirizzo, descrizione breve e icona dello stato                                                                                                                                                                                                              |
| **Stato**               | Pulsanti grandi nel dettaglio: _Inizia_, _Sospendi_ (con motivo), _Completa_. Aggiornamento ottimistico dell'interfaccia; se nel frattempo l'ufficio ha modificato l'intervento, il server rifiuta (versione) e la schermata si ricarica con i dati nuovi                                                    |
| **Dettaglio**           | Una schermata: cosa fare, quando, cliente e referente (tocca per chiamare), indirizzo, note operative, documenti e foto del cantiere (URL firmati esistenti), pulsante rapportino                                                                                                                            |
| **Navigazione GPS**     | Link diretto alle coordinate: `https://www.google.com/maps/dir/?api=1&destination=lat,lng` (Android e web) e `maps://?daddr=lat,lng` su iPhone. Nessuna chiave API, nessun costo. Se mancano le coordinate si usa l'indirizzo testuale                                                                       |
| **Comunicazioni**       | Tabella `notifications` esistente, nuovi `kind`: `work_order.assigned`, `work_order.rescheduled`, `work_order.cancelled`, `work_order.message`. Scritte nella stessa transazione della modifica in ufficio. Avvisi in-app subito; **notifiche push** sul telefono con Web Push dal worker (fase 4)           |
| **Storico**             | Interventi `completed` / `cancelled` del dipendente, con filtro per mese e cliente, e la cronologia degli stati da `work_order_status_events`                                                                                                                                                                |

## 5. Integrazione con il gestionale

Poiché ufficio e campo leggono e scrivono **lo stesso database**, non c'è una sincronizzazione da
costruire: quando il dipendente preme _Completa_, il gestionale vede il nuovo stato alla prima
lettura successiva.

Per l'aggiornamento "quasi in tempo reale" delle schermate già aperte:

1. **Subito:** ricarica dei dati quando la pagina torna in primo piano e ogni 30–60 secondi sulle
   schermate attive ("Oggi", dettaglio, pianificazione in ufficio). Semplice, nessun servizio in più.
2. **Fase 4:** notifiche push dal worker per i cambi importanti (nuova assegnazione, cambio orario).
3. **Facoltativo [da decidere]:** Supabase Realtime solo sul canale "qualcosa è cambiato per te",
   senza dati di dominio nel messaggio (il client poi rilegge dal server, ADR-004 resta valido).

Eventi di dominio (`work_order.status_changed`, `work_order.completed`) vanno nell'outbox: il
worker avvisa l'ufficio, e un intervento completato può proporre la bozza del rapportino.

## 6. Offline

Il campo spesso ha poco segnale. La Campo è il primo utilizzatore dell'architettura offline già
prevista ([ARCHITECTURE.md](ARCHITECTURE.md) §6): interventi della settimana e loro dettagli in
IndexedDB, cambi di stato in una outbox locale con chiave di idempotenza, invio con
`POST /api/sync` al ritorno della rete, conflitti risolti con `version`. Si fa **dopo** la versione
online (fase 4), senza cambiare il modello dati: `version` e la funzione di cambio stato sono già
pensate per questo.

## 7. Esperienza e design

- Barra in basso con 4 voci: **Oggi**, **Calendario**, **Mappa**, **Avvisi** (con contatore).
  Storico e profilo dal menu dell'avatar.
- Schermata "Oggi" come dashboard: scheda grande del prossimo intervento (orario, cliente,
  _Naviga_, _Inizia_), mini-mappa della giornata, lista del resto della giornata.
- Pulsanti alti almeno 48 px, testo leggibile al sole (contrasto alto), utilizzabile con una mano.
- Stessi colori, font e componenti del design system ([DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)).
  Animazioni brevi (150–250 ms) per cambi di schermata, apertura del dettaglio e conferma di stato;
  tutte disattivate con "riduci movimento". Niente scorrimento morbido (Lenis) come sul sito.
- Ogni schermata funziona anche senza mappa caricata (lista prima, mappa dopo).

## 8. Sicurezza e privacy

- Stesse regole del gestionale: identità da JWT verificato, azienda attiva dal server, RLS.
- Il dipendente vede solo interventi assegnati a sé o alla sua squadra; i dati del cliente
  visibili sono quelli necessari al lavoro (nome, referente, telefono, indirizzo), non importi,
  pagamenti o documenti amministrativi.
- Nessun permesso di campo richiede MFA (uso quotidiano su telefono); i permessi d'ufficio sugli
  interventi seguono le regole esistenti.
- Al logout o al cambio azienda si cancellano cache e dati locali.
- Test di isolamento: un tecnico non legge interventi non assegnati, non legge interventi di
  un'altra azienda, non cambia orari/cliente, non salta transizioni di stato, non usa versioni vecchie.

## 9. Piano di sviluppo incrementale

Ogni passo è rilasciabile e testato prima del successivo (regola 2).

1. **Database:** migrazione `work_orders`, assegnazioni, eventi di stato, permessi, funzione di
   cambio stato, `work_reports.work_order_id`; test RLS e di transizione.
2. **Ufficio (minimo):** creare, pianificare e assegnare interventi nel gestionale; interventi nel
   calendario e nella mappa esistenti. Senza questo il campo non riceve nulla.
3. **Campo – Oggi e dettaglio:** layout mobile, lista del giorno, dettaglio, cambio stato,
   pulsante navigazione.
4. **Campo – Calendario** giorno/settimana/mese.
5. **Campo – Mappa** con percorso della giornata.
6. **Avvisi** in-app collegati alle modifiche dell'ufficio + ricarica periodica.
7. **Storico** e collegamento al rapportino.
8. **Fase 4:** PWA installabile, push, offline con outbox.

## 10. Decisioni aperte

| Tema                     | Proposta                                                                                                                                                                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Posizione dei dipendenti | **Non tracciarla.** La mappa mostra gli interventi e il percorso pianificato, non dove si trova la persona. Un tracciamento continuo richiede accordo sindacale o autorizzazione (art. 4 Statuto dei lavoratori) e informativa GDPR |
| Tempo reale              | Partire con ricarica periodica; valutare Supabase Realtime solo se serve davvero                                                                                                                                                    |
| Indirizzo                | `/campo` sullo stesso dominio; sottodominio dedicato solo se richiesto                                                                                                                                                              |
| Interventi ricorrenti    | Fuori da questa fase: arriveranno con il modulo manutenzioni (`maintenance`, genera `work_orders`)                                                                                                                                  |
| Mezzi e materiali        | Fuori da questa fase (`scheduling`, `inventory` in [DOMAINS.md](DOMAINS.md))                                                                                                                                                        |
