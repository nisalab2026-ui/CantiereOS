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

## 3. Autenticazione (fase 2)

- Supabase Auth con cookie httpOnly, `Secure`, `SameSite=Lax` tramite `@supabase/ssr`.
- Verifica del token lato server a ogni richiesta (`getUser()`, non solo decodifica locale).
- MFA (TOTP) obbligatoria per owner, admin e operatori di piattaforma; raccomandata per tutti.
- Password: lunghezza minima 12, controllo password compromesse (funzione di Supabase Auth).
- Rate limiting su login, reset password, inviti (Redis).
- Sessioni: revoca alla sospensione della membership; logout remoto da pannello admin.

## 4. Autorizzazione nel server (fase 2)

- Ogni Server Action / route handler passa da un caso d'uso in `packages/core` che:
  1. ricava utente e azienda attiva dalla sessione verificata;
  2. verifica il permesso (`modulo.azione`) — la stessa matrice usata dalle RLS;
  3. valida l'input con schema (Zod) e lunghezze massime;
  4. esegue nella transazione con ruolo `authenticated` (RLS attiva).
- Le Server Actions sono endpoint pubblici: nessuna si fida di parametri nascosti nel form.
- Protezione CSRF: verifica `Origin` sulle mutazioni (nativa in Next.js per Server Actions) e
  sulle route handler.

## 5. Audit log (implementato)

- Registrati: INSERT/UPDATE/DELETE su aziende, membership, clienti/fornitori, contatti (ogni nuova
  tabella di business si aggiunge con un trigger).
- Per ogni evento: azienda, autore (`auth.uid()` o attore dichiarato dal server), tabella,
  record, dati prima/dopo, campi modificati, `request_id`.
- Visibile solo con `audit.read` e solo per la propria azienda.
- Immutabile per tutti i ruoli applicativi, compreso `service_role`. La pulizia per
  conservazione richiederà una procedura dedicata e documentata, eseguita dal proprietario
  dello schema.
- Eventi applicativi non legati a righe (login, export, download documenti, impersonazione) da
  aggiungere in fase 2 con `action` dedicate (es. `auth.login`, `file.download`).

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
