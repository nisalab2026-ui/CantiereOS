# apps/web — Applicazione Next.js

Next.js 16 (App Router, Turbopack, `src/proxy.ts`), React 19, Tailwind CSS 4, Lucide.

```
src/
  proxy.ts                 rinnovo sessione Supabase + id richiesta (non decide le autorizzazioni)
  lib/
    env.ts                 configurazione solo server (Zod)
    supabase.ts            client Supabase Auth con cookie httpOnly
    auth.ts                sessione verificata, asCurrentUser (RLS), getAppContext, MFA
    db.ts, mail.ts         pool PostgreSQL, invio email (o "non configurato")
  app/
    (auth)/                accedi, registrati, verifica-email, password-dimenticata,
                           reimposta-password, mfa + Server Actions
    auth/callback          ritorno dai link email (PKCE / token_hash)
    esci                   logout (POST, anche "tutti i dispositivi")
    invito, invito/conferma  link d'invito → cookie httpOnly → accettazione
    benvenuto              creazione azienda dopo la registrazione
    (app)/app              area applicativa (MFA obbligatoria per ruoli amministrativi)
    (app)/account/sicurezza  MFA TOTP, esci da tutti i dispositivi
```

Regole: il browser non usa mai il client Supabase né il database; ogni Server Action ricava
utente e azienda dal server e usa `packages/core`. Configurazione: `.env.example`.
Avvio locale e test: vedi `CLAUDE.md` (sezione Comandi).
