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
- rate limiting applicativo (Redis) su inviti e accettazione inviti; per login/recupero valgono i
  limiti di Supabase Auth;
- Content-Security-Policy con nonce (gli altri header di sicurezza sono già attivi);
- codici di recupero / secondo fattore di riserva per la MFA e procedura di reset assistito;
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
- Eventi applicativi non legati a righe (login, download documenti, impersonazione) da
  aggiungere in fase 2 con `action` dedicate (es. `auth.login`, `file.download`).

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

## 6. File (progettato)

- Chiavi `tenants/{tenant_id}/…`; bucket privato; nessun URL pubblico permanente.
- URL firmati di upload/download con scadenza breve (≤ 5 minuti), generati solo dopo il controllo
  del permesso sul record collegato.
- Verifica tipo MIME reale (magic bytes), limite di dimensione per piano, scansione antivirus
  prima della disponibilità.
- Test previsti: un utente di A non ottiene URL per file di B; una chiave costruita a mano con
  un altro `tenant_id` viene rifiutata; file non scansionati non scaricabili.

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
- Header di sicurezza: CSP rigorosa, HSTS, `frame-ancestors 'none'`, `Referrer-Policy`.
- Nessun dato reale nei test e negli ambienti di sviluppo; nessun dato fittizio in produzione.
- Nessuna operazione distruttiva (drop, delete massivi, reset) senza autorizzazione esplicita.
