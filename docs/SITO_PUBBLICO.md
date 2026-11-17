# CantiereOS — Sito pubblico

> Parte pubblica del prodotto, separata dal gestionale. Codice in `apps/web/src/app/(marketing)/`
> (pagine, testi in `content.ts`, stile in `site.css`) e `apps/web/src/components/site/`.

## Pagine

| Percorso        | Contenuto                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`             | Apertura, mestieri, manifesto, le sei funzioni (capitolo laterale), come si parte, telefono, sicurezza, in arrivo, prezzi in breve, domande |
| `/funzionalita` | Le sei funzioni in dettaglio, dettagli in più, parti in arrivo                                                                              |
| `/chi-siamo`    | Missione, principi, come lavoriamo con le imprese (`#come-lavoriamo`), contatti (`#contatti`)                                               |
| `/prezzi`       | Piani con selettore annuale/mensile, calcolo per numero di utenti, confronto, domande                                                       |
| `/guida`        | Guida all'uso pubblica: gli stessi contenuti di `/app/guida` (fonte unica `app/(app)/app/guida/content.ts`), senza link alle pagine interne |

`/` prima reindirizzava ad `/accedi` o `/app`; ora è la home pubblica. Chi ha una sessione verificata
vede "Apri il gestionale" al posto di "Prova gratis". Le pagine pubbliche sono in `PUBLIC_PATHS` di
`src/proxy.ts`. Tutto il sito resta `noindex` (metadati del layout radice) finché non si pubblica
davvero: a quel punto vanno tolti, insieme a informativa privacy e termini (oggi "in preparazione").

## Regole dei testi

- Si presenta solo ciò che esiste nel gestionale. Quello in sviluppo sta in `COMING_SOON` ed è
  sempre etichettato "In arrivo" (CLAUDE.md, regola 11).
- Le figure dell'interfaccia (`components/site/mockups.tsx`) sono illustrazioni in HTML con nomi
  generici, non dati di clienti; hanno una descrizione per i lettori di schermo.
- Nessun logo, nome o testo di terzi o di concorrenti.
- Contatti: l'indirizzo email compare solo se `PUBLIC_CONTACT_EMAIL` è impostata. Nessun modulo di
  contatto finché non c'è un invio reale.
- Prezzi e piani: `PLANS` e `PRICING_EXTRAS` in `content.ts`, motivazioni in [PREZZI.md](PREZZI.md).

## Movimento

Stesso motore del sito Lume Studio (`components/site/motion/`), adattato allo stile "liquid":

1. **Micro-interazioni**: pulsanti magnetici (`data-magnetic`), cursore di luce con etichetta
   (`data-cursor="PROVA"`), luce che segue il puntatore sulle card (`.site-spot`), riflesso sul
   pulsante principale.
2. **Ingressi**: `data-reveal` (sale, si schiarisce e si mette a fuoco una volta), titoli a parole
   (`SplitWords`).
3. **Racconto allo scorrimento** (`scroll-engine.ts`, un solo ciclo `requestAnimationFrame`):
   `data-parallax`, `data-progress` (`--vp`), `data-scrub` (parole che si accendono), `data-hscroll`
   (capitolo laterale fissato), `data-stack` (card che si impilano), `data-marquee` (nastro che
   accelera e si inclina con la velocità), linea di avanzamento in alto.
4. **Momenti firma**: la finestra dell'app che si raddrizza scendendo, l'anello di luce sul piano
   consigliato.

Regole: si muovono solo `transform`, `opacity`, `filter` e proprietà personalizzate. Ogni effetto ha
uno stato fermo: senza JavaScript e con `prefers-reduced-motion` la pagina si legge tutta. Lo script
d'avvio (con il nonce della CSP) nasconde i contenuti "in entrata" solo se JavaScript gira e li mostra
comunque dopo 2,5 s. Scorrimento morbido (Lenis) solo con mouse su macchine capaci; telefoni e
macchine modeste ricevono il livello "lite" (niente derive né sfocature in movimento).

## Test

`e2e/tests/public-site.spec.ts`: home senza accesso e navigazione tra le pagine senza errori di
script, prezzi annuale/mensile e calcolo del piano, guida pubblica senza link riservati, menu del
telefono.
