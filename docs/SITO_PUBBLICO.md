# CantiereOS — Sito pubblico

> Parte pubblica del prodotto, separata dal gestionale. Codice in `apps/web/src/app/(marketing)/`
> (pagine, testi in `content.ts`, stile in `site.css`) e `apps/web/src/components/site/`.

## Pagine

| Percorso                                          | Contenuto                                                                                                                                                                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                               | Apertura, mestieri, manifesto, le sei funzioni (capitolo laterale), come si parte, telefono, sicurezza, in arrivo, prezzi in breve, domande                                                                         |
| `/funzionalita`                                   | Le sei funzioni in dettaglio, dettagli in più, parti in arrivo                                                                                                                                                      |
| `/chi-siamo`                                      | Missione, principi, come lavoriamo con le imprese (`#come-lavoriamo`), contatti (`#contatti`)                                                                                                                       |
| `/prezzi`                                         | Piani con selettore annuale/mensile, calcolo per numero di utenti, confronto, domande                                                                                                                               |
| `/guida`                                          | Guida all'uso pubblica: gli stessi contenuti di `/app/guida` (fonte unica `app/(app)/app/guida/content.ts`), senza link alle pagine interne                                                                         |
| `/mestieri`                                       | Otto mestieri (imprese edili, elettrici, idraulici e termoidraulica, coperture e linee vita, manutenzioni, antincendio, serramenti, facility) con esigenze, scadenze tipiche e moduli; testi in `trades-content.ts` |
| `/contatti`                                       | WhatsApp (+39 327 392 8101, messaggio già scritto), email se `PUBLIC_CONTACT_EMAIL` è impostata, invito alla prova                                                                                                  |
| `/privacy`, `/cookie`, `/termini`, `/note-legali` | Documenti legali in `legal-content.ts`, impaginati da `components/site/legal.tsx` (indice che segue la lettura)                                                                                                     |

`/` prima reindirizzava ad `/accedi` o `/app`; ora è la home pubblica. Chi ha una sessione verificata
vede "Apri il gestionale" al posto di "Prova gratis". Le pagine pubbliche sono in `PUBLIC_PATHS` di
`src/proxy.ts`. Tutto il sito resta `noindex` (metadati del layout radice) finché non si pubblica
davvero.

## Palette, marchio e contatti

- **Palette bianca e verde** (richiesta del committente, 17/11/2026), la stessa del tema chiaro del
  gestionale ma sempre chiara sul sito (`html:has(.site)` in `site.css`), più le luci
  `--site-glow-1/2/3` e l'ombra `--site-shadow`.
- **Marchio**: lo stesso del gestionale, la gru su tessera verde in SVG (`components/brand-logo.tsx`,
  `BrandMark` e `BrandLogo`): le linee si tracciano, il carico oscilla sul gancio, "OS" ha un gradiente
  che scorre. Animazioni in `globals.css` (`.brand-mark`).
- **WhatsApp**: pulsante fisso animato su tutte le pagine (`components/site/whatsapp.tsx`), numero e
  messaggio in `CONTACT` di `content.ts`. Il simbolo di WhatsApp è l'unico marchio di terzi ammesso,
  solo per indicare il canale di contatto (citato nelle note legali).
- **Firma** "Sito realizzato da Lume Studio" in fondo a ogni pagina (`SITE_CREDIT`).

## Note legali: cosa manca

I quattro documenti sono una **bozza**. I dati dell'azienda non sono stati forniti e non vanno
inventati: ogni `[[dato]]` in `legal-content.ts` appare come evidenziazione gialla "da completare" e la
pagina mostra un avviso di bozza finché ne resta uno. Servono ragione sociale, sede legale, partita
IVA, REA, capitale sociale (se società di capitali), email e PEC, i tempi di conservazione e il foro.
Prima della pubblicazione vera i testi vanno verificati da un consulente. La cookie policy elenca i
cookie che il codice imposta davvero (`sb-…-auth-token`, `cos_invite`, `cos_theme`, `cos_sidebar`):
se se ne aggiunge uno, va aggiornata.

## Regole dei testi

- Si presenta solo ciò che esiste nel gestionale. Quello in sviluppo sta in `COMING_SOON` ed è
  sempre etichettato "In arrivo" (CLAUDE.md, regola 11).
- Le figure dell'interfaccia (`components/site/mockups.tsx`) sono illustrazioni in HTML con nomi
  generici, non dati di clienti; hanno una descrizione per i lettori di schermo.
- Nessun logo, nome o testo di terzi o di concorrenti (eccezione: il simbolo di WhatsApp sul
  pulsante di contatto).
- Contatti: WhatsApp sempre; l'indirizzo email compare solo se `PUBLIC_CONTACT_EMAIL` è impostata.
  Nessun modulo di contatto finché non c'è un invio reale.
- Si dà del "tu" a chi legge. Nella pagina Mestieri gli esempi di scadenze e moduli sono cose che il
  cliente crea da sé; l'unico modello già pronto citato è l'ispezione delle linee vita.
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
   accelera e si inclina con la velocità), linea di avanzamento in alto. In più: `data-count` (numeri
   che contano da zero), `data-scrollspy` (indice che si accende, pagine legali e Mestieri), sigillo
   che ruota con `--scroll`, righe degli occhielli che si disegnano, icone e barre dei mestieri guidate
   da `--vp`, nome a contorno di ogni mestiere in parallasse.
   Ogni mestiere ha una scena illustrata originale in SVG (`components/site/trade-scenes.tsx`:
   gru e piani, quadro elettrico, caldaia e radiatore, tetto con linea vita, ingranaggi,
   estintore, finestra, edifici collegati) che si compone allo scorrimento tramite `--vp`; senza
   motore o con "riduci movimento" si vede la scena completa e ferma.
4. **Momenti firma**: il tablet 3D (o la finestra dell'app, in 2D) che si raddrizza scendendo, l'anello di luce sul piano
   consigliato, il nome "CantiereOS" che sale lettera per lettera in fondo alla pagina.
5. **Cursore personalizzato** (`motion/cursor.tsx`): punto verde più anello che segue, che si allarga
   sui link e diventa un'etichetta (APRI, PROVA, CHAT…). Sostituisce la freccia solo con mouse e senza
   "riduci movimento"; nei campi di testo torna il cursore di sistema.

Regole: si muovono solo `transform`, `opacity`, `filter` e proprietà personalizzate. Ogni effetto ha
uno stato fermo: senza JavaScript e con `prefers-reduced-motion` la pagina si legge tutta. Lo script
d'avvio (con il nonce della CSP) nasconde i contenuti "in entrata" solo se JavaScript gira e li mostra
comunque dopo 2,5 s. Scorrimento morbido (Lenis) solo con mouse su macchine capaci; telefoni e
macchine modeste ricevono il livello "lite" (niente derive né sfocature in movimento).

## Tablet 3D, sezione fissa e griglia bento (home)

**Tablet 3D in apertura** (`components/site/tablet/`). Il tablet è costruito in codice con
three.js e `@react-three/fiber` (nessun file `.glb` nel repository): scocca in alluminio, vetro,
schermo e fotocamera. Sullo schermo c'è `public/site/tablet-panoramica.jpg`, una schermata vera della
panoramica con l'azienda DEMO. Scendendo, il tablet passa da inclinato a dritto e più grande
(`p` da 0 a 1 calcolato dalla posizione del blocco, con smorzamento); il puntatore aggiunge una lieve
parallasse. La scena si ferma (`frameloop="never"`) quando esce dallo schermo.

Il 3D si carica solo dopo l'avvio e solo se: larghezza ≥ 768 px, nessun «riduci movimento», memoria
del dispositivo ≥ 4 GB (se il browser la dichiara) e WebGL disponibile. In tutti gli altri casi resta
la finestra 2D (`DashboardMock`), che è anche quella visibile finché la scena non è pronta.
`data-mode` su `[data-testid="tablet-hero"]` dice quale delle due si vede.

**Usare un modello `.glb` vero al posto di quello costruito.** Mettere il file in
`apps/web/public/models/` e trovare il nome della mesh dello schermo:

1. `npx @gltf-transform/cli inspect public/models/ipad.glb`: la tabella _MESHES_ elenca i nomi;
2. oppure trascinare il file in https://threejs.org/editor/ e leggere l'albero a destra;
3. oppure in codice: `gltf.scene.traverse((o) => console.log(o.type, o.name, o.material?.name))`
   e cercare la mesh piatta più grande davanti, di solito `Screen`, `Display` o un materiale
   `screen`.

Poi in `tablet-canvas.tsx` caricare il modello con `GLTFLoader` (`useLoader(GLTFLoader, url)`),
sostituire il gruppo costruito con `<primitive object={gltf.scene} />` e assegnare alla mesh dello
schermo un `MeshBasicMaterial` con la texture della panoramica (`texture.flipY = false` per i modelli
glTF, `colorSpace = SRGBColorSpace`). Se le coordinate UV dello schermo non coprono 0–1 la schermata
appare tagliata: va corretto nel modello, non nel codice. Le dimensioni del file contano: sopra
~2 MB comprimere con `gltf-transform optimize --compress draco`.

**Sezione fissa a due colonne** (`components/site/sticky-features.tsx`, `#funzioni`): a sinistra i
passi che scorrono, a destra un pannello fisso (`sticky top-28`) con l'anteprima del passo al centro
dello schermo (IntersectionObserver con margine −45%). Su telefono l'anteprima sta sotto ogni passo.

**Griglia bento** (`components/site/bento.tsx`): sette celle `.site-spot` con la luce che segue il
puntatore; ogni cella descrive una funzione che esiste davvero nel gestionale.

## Test

`e2e/tests/public-site.spec.ts`: home senza accesso e navigazione tra le pagine (Mestieri e Contatti
comprese) senza errori di script, prezzi annuale/mensile e calcolo del piano, guida pubblica senza
link riservati, menu del telefono, pulsante WhatsApp, firma di Lume Studio e le quattro pagine legali
con i dati "da completare" visibili.
