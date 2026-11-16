# apps/web — Applicazione Next.js

**Non ancora creata** (fase 2, vedi `docs/ROADMAP.md`).

Struttura prevista:

```
src/
  app/
    (auth)/            login, registrazione, MFA
    (app)/[tenant]/    area applicativa con sidebar
    (portal)/          portale cliente
    admin/             pannello SaaS (operatori piattaforma)
    api/sync/          sincronizzazione offline
  modules/<dominio>/   UI e server actions sottili per modulo
  components/ui/       shadcn/ui personalizzati
  lib/                 sessione Supabase, contesto tenant, design token
```

Regole: nessun accesso ai dati dal browser; le Server Actions chiamano i casi d'uso di
`packages/core`, che eseguono le query con ruolo `authenticated` e RLS attiva.
