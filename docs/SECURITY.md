# CantiereOS — Sicurezza

> Stato: v0.1 (fase 1). §2 e §5 sono implementati e testati nella migrazione 0001; il resto è
> progettato e va implementato con i relativi moduli.

## 1. Principi

1. **Il client non è mai fidato.** `tenant_id`, `user_id`, ruoli, `created_by`, prezzi calcolati:
   tutto ciò che arriva dal browser è input da validare, mai un'autorizzazione.
2. **Difesa in profondità.** Controllo dei permessi nel server **e** RLS nel database. Un bug in
   uno dei due livelli non basta a esporre dati di un'altra azienda.
3. **Privilegio minimo.** `anon` non ha accesso alle tabelle; `authenticated` ha solo i
   privilegi di colonna necessari; `service_role` solo nel server e nel worker.
4. **Tutto tracciato.** Le modifiche ai dati di business finiscono in un audit log immutabile.
5. **Nessun segreto nel codice.** Solo variabili d'ambiente; `.env*` ignorati da git; scansione
   segreti in CI (fase 2).

## 2. Isolamento tra aziende (implementato)

| Minaccia                                     | Contromisura                                                                                   | Test                                                    |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Lettura dati di un'altra azienda             | RLS con `tenant_ids_with_permission()`                                                         | `tenant-isolation.test.ts`                              |
| Inserimento con `tenant_id` altrui           | Policy `WITH CHECK`                                                                            | idem                                                    |
| Modifica/cancellazione di righe altrui       | Policy `USING` (0 righe toccate)                                                               | idem                                                    |
| Spostamento di un record in un'altra azienda | Trigger `prevent_tenant_change` + nessun privilegio UPDATE su `tenant_id`                      | idem (anche con service_role)                           |
| Collegamento a record di un'altra azienda    | FK composte `(tenant_id, id)`                                                                  | idem                                                    |
| Accesso di membri sospesi/invitati           | Solo `status = 'active'` conta                                                                 | idem                                                    |
| Azienda sospesa                              | Solo `tenants.status in ('trial','active')` dà accesso ai dati                                 | idem                                                    |
| Escalation di ruolo                          | Nessuno modifica la propria membership; solo owner gestisce owner; nuovi membri solo `invited` | `roles-permissions.test.ts`                             |
| Azienda senza proprietario                   | Vincolo differito `ensure_active_owner`                                                        | idem                                                    |
| Autoattivazione abbonamento                  | Nessun privilegio su `tenants.status` per gli utenti                                           | idem                                                    |
| Creazione aziende arbitraria                 | `create_tenant` eseguibile solo da service_role                                                | idem                                                    |
| Falsificazione autore                        | `created_by`/`invited_by` impostati da trigger                                                 | `tenant-isolation.test.ts`, `roles-permissions.test.ts` |
| Manomissione audit                           | Nessun grant di scrittura + trigger che blocca UPDATE/DELETE/TRUNCATE                          | `audit-log.test.ts`                                     |
| Nuova tabella senza RLS                      | Guardie automatiche sullo schema                                                               | `schema-guards.test.ts`                                 |
| Funzioni privilegiate eseguibili da tutti    | `revoke … from public` + guardia                                                               | idem                                                    |
| `search_path` hijacking                      | `set search_path = ''` su ogni `SECURITY DEFINER`                                              | idem                                                    |

I test girano su un PostgreSQL reale impersonando gli utenti esattamente come Supabase
(`set role authenticated` + claim JWT). Una verifica a campione: aggiungendo una policy
permissiva (`using (true)`) su `customers`, 5 test falliscono → i test rilevano davvero
una fuga di dati.

## 3. Autenticazione (implementata)

**Fornitore:** Supabase Auth (GoTrue). Il browser non parla mai con Supabase né col database:
login, registrazione, MFA e logout passano da Server Actions e route handler di `apps/web`.

| Flusso                | Come funziona                                                                                                                                                                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registrazione azienda | `signUp` con conferma email obbligatoria (PKCE) → `/benvenuto` → `app.register_company`: titolare = `auth.uid()`, email confermata, prova 30 giorni / 5 posti, max 3 aziende per utente                                                                                                     |
| Login                 | password; messaggio d'errore unico (niente enumerazione degli account); redirect solo verso percorsi interni                                                                                                                                                                                |
| Recupero password     | link via email (stessa risposta anche per indirizzi inesistenti) → nuova password → **chiusura delle altre sessioni**                                                                                                                                                                       |
| Inviti dipendenti     | token casuale di 256 bit, nel DB solo l'hash SHA-256; scadenza 7 giorni (max 30); il link sposta il token in un cookie httpOnly e lo toglie dall'URL; accettazione solo con l'**email verificata** a cui è stato inviato; limite posti del piano                                            |
| Più aziende           | un utente può essere membro di più aziende; l'azienda attiva è salvata nel DB (`users.last_active_tenant_id`) e **riverificata a ogni richiesta**; un id inviato dal browser è solo una richiesta                                                                                           |
| MFA (TOTP)            | **obbligatoria** per Proprietario, Amministratore e Super Admin: senza fattore si va a configurarla, con fattore ma sessione `aal1` si va alla verifica. Nel DB i permessi 🔐 valgono solo con `aal2`                                                                                       |
| Sessioni              | cookie **httpOnly**, `SameSite=Lax`, `Secure` in produzione; rinnovo del token nel proxy Next.js; "Esci da tutti i dispositivi" (`signOut global`)                                                                                                                                          |
| Revoca immediata      | a ogni transazione `app.current_session_active()` verifica che la sessione del JWT (`session_id`) esista ancora in `auth.sessions`: logout ovunque e cambio password valgono **subito**, non alla scadenza del JWT; la sospensione di una membership toglie l'accesso alla query successiva |

**Limite ai tentativi** (`app.rate_limits`, `packages/core/src/auth/rate-limit.ts`). Si aggiunge
ai limiti di Supabase Auth, con messaggi in italiano ("Troppi tentativi. Riprova tra N minuti").
Finestra fissa in PostgreSQL (niente Redis), usata solo dal server con `service_role`; nessun
client legge i contatori; le chiavi sono hash SHA-256, mai email o IP in chiaro.

| Operazione        | Limite                                                               |
| ----------------- | -------------------------------------------------------------------- |
| Accesso           | 8 tentativi per email e 30 per IP ogni 15 minuti; azzerato se riesce |
| Codice MFA        | 6 tentativi per utente ogni 5 minuti (anche codici di recupero)      |
| Recupero password | 3 per email e 10 per IP all'ora                                      |
| Registrazione     | 10 per IP all'ora                                                    |

L'IP si legge solo da `x-real-ip`, impostato dalla piattaforma (Vercel); `x-forwarded-for` non è
affidabile (lo può scrivere il client, e in locale lo aggiunge Next.js). Senza IP vale il limite
per account.

**Codici di recupero MFA** (`app.mfa_recovery_codes`). Supabase Auth non li prevede, quindi:
10 codici da 60 bit generati sul server **solo con sessione aal2**, mostrati una volta (copia o
download .txt), salvati come `sha256(utente:codice)`; una nuova serie annulla la precedente.
Chi perde il telefono accede con la password (aal1) e inserisce un codice: se valido e non usato,
il server lo segna come usato, rimuove i fattori TOTP con l'API amministrativa di Supabase Auth
(`SUPABASE_SERVICE_ROLE_KEY`, solo server), chiude le altre sessioni e porta l'utente a
configurare di nuovo l'app. Senza la chiave di servizio la funzione è dichiarata "non
configurata". I tentativi rientrano nel limite MFA.

**Verifica del token** (`packages/core/src/auth/session.ts`): firma (HS256 con il JWT secret, oppure
ES256/RS256 tramite JWKS), emittente, audience `authenticated`, scadenza, `role = authenticated`,
`session_id` e `sub` UUID, niente sessioni anonime. Algoritmi fissati: `alg: none` e confusione
HS/RS vengono rifiutati. Al database arrivano solo i claim ricostruiti dalla sessione verificata.

**Configurazione:** solo variabili d'ambiente lato server (`.env.example`), nessuna con prefisso
`NEXT_PUBLIC_`. Le email applicative (inviti) partono via SMTP se `SMTP_URL` è configurata;
altrimenti l'interfaccia lo dice e mostra il link da consegnare a mano (nessun invio simulato).
Le email di autenticazione le invia Supabase Auth con il proprio SMTP.

**Da completare prima della produzione** (non ancora fatto):

- template email di Supabase Auth in italiano e SMTP di produzione;
- password: minimo 10 caratteri impostato; attivare il controllo password compromesse e la
  lunghezza minima 12 nella configurazione del progetto Supabase;
- limite ai tentativi anche su creazione e accettazione inviti (accesso, MFA, recupero password
  e registrazione sono già coperti, vedi sotto);
- procedura di reset MFA assistito dall'amministratore (per chi perde telefono e codici);
- testo dell'informativa privacy fornito dal titolare del trattamento.

**Test** (eseguiti davvero, vedi PR):

- `pnpm test:db` — RLS, MFA nel database, inviti, ruoli, cliente esterno, Super Admin.
- `pnpm test:core` — JWT validi/manomessi/scaduti/`alg none`/altro emittente/altra chiave/JWKS,
  sessioni revocate, azienda attiva, permessi e MFA, inviti, registrazione.
- `pnpm test:e2e` — Playwright su stack reale (Next.js + Supabase Auth + PostgreSQL + mailpit):
  registrazione con conferma email, MFA obbligatoria, login errato, invito via email e
  accettazione, invito usato da un'altra email, cookie con JWT manomesso (utente, ruolo, aal),
  cambio azienda con id forgiato, esci da tutti i dispositivi, recupero password, redirect aperti.
  Avvio dello stack: `scripts/e2e-auth.sh`.

## 4. Autorizzazione nel server (implementata)

- Ogni Server Action / route handler ricava utente e azienda attiva **solo** dalla sessione
  verificata e dal database (`getAppContext`, `resolveActiveTenant`), mai da campi del form.
- `requirePermission(access, "modulo.azione")` distingue "permesso mancante" da "serve la MFA";
  il database applica comunque la stessa matrice con RLS (difesa in profondità).
- Input validati con Zod e lunghezze massime.
- Le query girano in `withUserTransaction`: `set local role authenticated` + claim + `request_id`.
- `withServiceTransaction` (bypass RLS) è riservata a worker e operazioni di piattaforma e
  dichiara l'attore per l'audit.
- Liste e ricerche: ordinamenti e filtri arrivano dall'URL solo come chiavi validate contro una
  whitelist; i termini di ricerca sono parametri (con `%`, `_`, `\` neutralizzati), mai SQL.
- Le voci di menu e i pulsanti nascosti sono solo comodità: ogni pagina mostra "Sezione non
  disponibile" (o "serve la verifica in due passaggi") se il server non conferma il permesso.
- Cambio azienda: l'id inviato dal browser è solo una richiesta; un test E2E manomette la richiesta
  verso un'azienda di cui l'utente non è membro e verifica che venga ignorata.
- CSRF: verifica dell'origine nativa delle Server Actions; le route POST (`/esci`) si basano su
  cookie `SameSite=Lax`.

## 5. Audit log (implementato)

- Registrati: INSERT/UPDATE/DELETE su aziende, membership, clienti/fornitori, contatti (ogni nuova
  tabella di business si aggiunge con un trigger).
- Per ogni evento: azienda, autore (`auth.uid()` o attore dichiarato dal server), tabella,
  record, dati prima/dopo, campi modificati, `request_id`.
- Visibile solo con `audit.read` e solo per la propria azienda.
- Immutabile per tutti i ruoli applicativi, compreso `service_role`. La pulizia per
  conservazione richiederà una procedura dedicata e documentata, eseguita dal proprietario
  dello schema.
- Le esportazioni sono registrate in `data_exports` (append-only), che passa dal trigger di audit:
  nel registro compaiono come "ha esportato" con sezione, filtri e numero di righe.
- **Catena di hash** (ADR-010 in `DATABASE.md`): ogni riga porta `prev_hash` e
  `row_hash = sha256(prev_hash || contenuto canonico)` per azienda, calcolati da un trigger.
  Il pulsante "Verifica integrità" del registro ricalcola la catena nel database
  (`app.verify_audit_chain`, `audit.read`) e indica la prima voce alterata o mancante. Limite: chi
  controlla il database può ricalcolare tutta la catena; l'ancoraggio esterno periodico
  dell'ultimo hash arriverà con il worker.
- Download e anteprime dei documenti sono registrati in `document_downloads` (append-only,
  inserimento solo per versioni pronte e visibili): nello storico compaiono come "ha scaricato" /
  "ha visualizzato". Login e impersonazione restano da aggiungere con `action` dedicate.

### Esportazioni CSV

- Solo `POST /app/esporta` dalla stessa origine (niente prefetch o link esterni che scaricano o
  registrano esportazioni); permessi e azienda dal server, dati letti con RLS.
- Si esporta solo ciò che si può leggere: stesso permesso della lista (`*.read`, `audit.read` con
  MFA per il registro). La policy di `data_exports` lo ricontrolla nel database.
- Filtri e ordinamenti passano dalle stesse whitelist delle liste; massimo 10.000 righe per file.
- Protezione dalla CSV injection: i testi che iniziano con `= + - @` (o tab/CR) sono preceduti da
  un apostrofo, così Excel non li esegue come formule.

### Storico per elemento e scadenze

- La cronologia di un elemento (`app.record_history`) verifica nel database il permesso di
  lettura di quella tabella; il registro completo resta riservato a `audit.read` con MFA.
- Lo storico mostra solo campi in whitelist con etichette italiane: `tenant_id`, token, hash e
  campi tecnici non compaiono mai.
- Modifiche con controllo di concorrenza (`updated_at`): una versione superata viene rifiutata,
  mai sovrascritta in silenzio.
- Chi ha completato una scadenza e quando lo stabilisce un trigger, non il browser.

### Attività e commenti (ADR-011)

- Le attività si creano e modificano solo con `tasks.write`. L'assegnatario senza quel permesso può
  cambiare **solo** lo stato e le note di completamento: lo impone un trigger nel database
  (`app.task_update_guard`), non la visibilità dei pulsanti. Chi l'ha completata e quando lo
  stabilisce il database.
- La notifica all'assegnatario la crea un trigger (mai a chi assegna a sé stesso), senza duplicati.
- I commenti si leggono e scrivono solo se si può vedere l'elemento commentato
  (`app.comment_subject_visible`, valutata con RLS dell'utente): un commento non apre l'accesso a un
  cliente o a un documento riservato. L'elemento commentato non si può cambiare dopo.
- Solo l'autore modifica il testo; l'eliminazione è logica (autore, oppure `comments.delete` con
  MFA per moderare) e resta nel registro attività con il testo precedente.
- Il calendario legge scadenze e attività ciascuna con il proprio permesso, per un massimo di 62
  giorni per richiesta.

### Pagamenti attesi e comunicazioni (ADR-012)

- Il modulo pagamenti **non muove denaro** e non si collega a banche: registra solo importi attesi
  e saldi dichiarati da un utente. Nessuna integrazione di pagamento è configurata.
- Lettura, scrittura ed eliminazione hanno permessi distinti (`payments.*`, `communications.*`);
  l'eliminazione richiede MFA ed è logica. I tecnici non vedono i pagamenti.
- Coerenza imposta dal database, non dal form: un incasso non può avere un fornitore (e viceversa),
  "pagato" se e solo se data e importo del saldo sono presenti; chi ha segnato il saldo e quando lo
  scrive il trigger `app.payment_status_guard`. Le date di saldo future sono rifiutate dal server.
- Gli importi sono interi in centesimi (`bigint`), mai numeri a virgola mobile, con limiti di
  valore nel database.
- Ogni modifica finisce nel registro attività con i valori prima e dopo, anche nella cronologia
  del cliente o del fornitore collegato.
- Il calendario mostra pagamenti e richiami solo a chi ha il relativo permesso di lettura.

## 6. File (archivio documentale)

- Bucket privato (Supabase Storage), nessun URL pubblico permanente. La chiave del file è una
  colonna **generata** dal database (`{tenant_id}/{document_id}/{version_id}`): né il browser né
  il server applicativo la scelgono, quindi non si può puntare al file di un'altra azienda.
- La chiave `SUPABASE_SERVICE_ROLE_KEY` resta solo sul server; il browser riceve soltanto un URL
  firmato di caricamento per una singola chiave, generato dopo il controllo del permesso
  (`documents.write`) e della visibilità del documento (RLS).
- Una versione nasce `pending` e non è scaricabile. Diventa `ready` solo dopo che il server ha
  verificato dimensione (≤ 25 MB), estensione ammessa e tipo reale dai primi byte (magic bytes:
  eseguibili, HTML e SVG travestiti vengono rifiutati e il file eliminato). Lo stato lo può
  cambiare solo il trigger di guardia (`pending → ready|rejected`); le versioni non si cancellano.
- Download e anteprima: `GET /app/documenti/file/{versione}` solo dalla stessa origine, permesso
  ricontrollato con RLS, download registrato, poi redirect a un URL firmato valido 5 minuti.
- Documenti riservati: visibili solo con `documents.confidential` (MFA), anche nello storico e
  nella ricerca. Eliminazione: `documents.delete` (MFA), logica; file e versioni restano.
- **Non ancora attivi** (dichiarati "non configurati" nell'interfaccia): scansione antivirus e
  OCR. Quando saranno collegati, una versione resterà `pending` fino all'esito della scansione.
- Test: `packages/db/tests/documents.test.ts` (isolamento tra aziende, chiavi, stati, riservati,
  download), `packages/core/tests/documents.test.ts`, `e2e/tests/documents.spec.ts` contro lo
  storage reale in locale.

## 7. Worker e service_role

- Il worker usa `service_role` (bypassa RLS): **ogni** query filtra per `tenant_id` del job.
- Ogni job dichiara `app.actor_user_id` e `app.request_id` per l'audit.
- Il payload dei job non contiene segreti né dati personali non necessari.
- Revisione del codice obbligatoria per ogni nuova query del worker.

## 8. Pannello SaaS e supporto

- Operatori di piattaforma in tabella separata (`platform_admins`), MFA obbligatoria.
- Nessun accesso "silenzioso" ai dati delle aziende: l'impersonazione richiede motivo, durata
  massima, è visibile all'azienda e registrata nell'audit.

## 9. AI

- Prompt costruiti solo con dati dell'azienda attiva, già filtrati dalle RLS.
- Il testo dei documenti è trattato come dato, mai come istruzione (prompt injection).
- Nessun dato inviato a provider che lo usino per addestramento; regione UE se disponibile.
- Ogni chiamata registrata (`ai_jobs`): utente, azienda, modello, costo.

## 10. Privacy (GDPR)

- Dati ospitati nell'UE; registro dei trattamenti; DPA con i fornitori.
- Export completo dei dati di un'azienda e cancellazione su richiesta (procedura
  amministrativa con conferma esplicita, mai automatica).
- Geolocalizzazione delle foto solo al momento dello scatto, nessun tracciamento continuo.
- Firme: conservate come immagine + hash del contenuto firmato; non sono firma digitale
  qualificata (da chiarire con un legale per gli usi che la richiedono).

## 11. Sviluppo sicuro

- Dipendenze bloccate (`pnpm-lock.yaml`), aggiornamenti controllati, audit in CI.
- Header di sicurezza (attivi): Content-Security-Policy con **nonce per richiesta** e
  `strict-dynamic` (in `src/proxy.ts`: solo gli script di Next.js con il nonce vengono eseguiti;
  l'unica origine esterna è lo storage dei documenti per caricamento diretto e anteprime;
  `frame-ancestors 'none'`, `object-src 'none'`, `form-action 'self'`), HSTS due anni,
  `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP. Gli stili
  inline restano ammessi (variabili CSS delle animazioni). Verificati dal test E2E
  `security.spec.ts`, che controlla anche l'assenza di violazioni nelle pagine principali.
- Nessun dato reale nei test e negli ambienti di sviluppo; nessun dato fittizio in produzione.
- Nessuna operazione distruttiva (drop, delete massivi, reset) senza autorizzazione esplicita.
