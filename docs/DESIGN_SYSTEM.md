# CantiereOS — Design system

> Stato: v1.0 (fase UI). Fonte di verità visiva del prodotto. I token vivono in
> `apps/web/src/app/globals.css`, i componenti in `apps/web/src/components/ui/`.
> Requisiti di partenza: [PRODUCT_SPEC.md](PRODUCT_SPEC.md) §6.

## 1. Principi

1. **Calmo e professionale.** Superfici chiare, molto spazio, un solo colore d'azione. Il colore
   serve a comunicare uno stato, non a decorare.
2. **Densità adatta al ruolo.** L'ufficio lavora su tabelle dense da desktop; il tecnico lavora
   in cantiere da smartphone, con guanti e luce forte: bersagli grandi, contrasto alto.
3. **Niente finzioni.** Nessun pulsante, link o voce di menu senza funzione reale. Una funzione
   non ancora disponibile non compare (o compare come testo informativo, mai cliccabile).
4. **Dati onesti.** I dati dimostrativi esistono solo nelle aziende `is_demo` create dal seed di
   sviluppo e sono sempre marcati "DEMO" nell'interfaccia (badge nell'header e nel selettore).
   Le dashboard mostrano solo numeri letti dal database dell'azienda attiva.
5. **Accessibile.** Obiettivo WCAG 2.2 AA: contrasto ≥ 4.5:1 per il testo, focus sempre visibile,
   tutto utilizzabile da tastiera, `prefers-reduced-motion` rispettato.
6. **Identità propria.** Non si copiano interfacce o testi di altri gestionali.

## 2. Token

Definiti come variabili CSS (`--background`, `--primary`, …) per il tema chiaro su `:root` e
ridefiniti su `.dark`. Tailwind li espone come classi (`bg-background`, `text-muted-foreground`,
`border-border`, …) tramite `@theme inline`.

### Colori

Palette **bianca e verde** (scelta il 17/11/2026): il tema **Chiaro** è il predefinito, con fondo
bianco, azioni e luci in verde e sidebar verde profondo. Lo stile **"Cantiere digitale"** (scelto il
16/11/2026) resta disponibile come tema **Scuro**, ricolorato in verde profondo: superfici in vetro
satinato (`backdrop-filter`), bordi sottili luminosi, bottone primario con sfumatura verde → smeraldo.

| Token                   | Chiaro (predefinito) | Scuro "Cantiere digitale"         | Uso                                         |
| ----------------------- | -------------------- | --------------------------------- | ------------------------------------------- |
| `background` / `canvas` | `#FFFFFF`            | `#04140C` + griglia e bagliori    | sfondo dell'app                             |
| `card`                  | bianco 56% + vetro   | verde scuro 44% + sfocatura       | pannelli, card, tabelle                     |
| `popover`               | `#FFFFFF`            | `#0A2016` (pieno)                 | menu, finestre, ricerca                     |
| `foreground`            | `#0F2A1D`            | `#ECFDF3`                         | testo principale                            |
| `muted-foreground`      | `#5A6478`            | `#94B8A4`                         | testo secondario, etichette                 |
| `border`                | `#DFE9E3`            | verde 16%                         | bordi e divisori                            |
| `primary`               | `#15803D`            | `#22C55E` (sfumatura → `#10B981`) | **unico colore d'azione**                   |
| `primary-foreground`    | `#FFFFFF`            | `#04140C`                         | testo su `primary`                          |
| `cyan`                  | `#0D9488`            | `#10B981`                         | luce del marchio (filo luminoso, sfumature) |
| `navy`                  | `#0F2A1D`            | verde scuro 55% + sfocatura       | sidebar (verde profondo)                    |
| `success`               | `#0F7A4A`            | `#3DDC97`                         | stati positivi                              |
| `warning`               | `#B45309`            | `#FFC04D`                         | attenzione                                  |
| `danger`                | `#B42318`            | `#FF7A6E`                         | errori, azioni distruttive                  |
| `info`                  | `#1D4ED8`            | `#7FB0FF`                         | informazioni neutre                         |

Ogni colore semantico ha una variante tenue (`bg-success/10`) per sfondi di badge e avvisi.
Mai comunicare uno stato **solo** con il colore: c'è sempre un'etichetta o un'icona.

### Tipografia

- **Geist** (UI) e **Geist Mono** (codici, importi, numeri di documento), dal pacchetto `geist`
  (file locali, nessuna richiesta a servizi esterni).
- Scala: 12 (`text-xs`, meta), 14 (`text-sm`, base delle tabelle e dei moduli), 16 (`text-base`,
  testo su mobile), 18/20 (titoli di sezione), 24/30 (titoli di pagina).
- Numeri in tabella e KPI con `tabular-nums`. Importi in Geist Mono, allineati a destra,
  formato `it-IT` (`1.234,56 €`).

### Spazi, raggi, ombre, movimento

- Griglia di 4 px. Padding standard: card 20–24 px, celle di tabella 12×16 px.
- Raggi: `sm` 6 px (input, badge), `md` 10 px (bottoni), `lg` 16 px (card, modali).
- Ombre minime: solo card sollevate e menu/modali (`shadow-sm` / `shadow-lg`).
- Movimento (classi in `globals.css`, componenti in `components/motion/`):
  - ingresso dei contenuti `cos-enter` (fade + 8 px, 360 ms) a cascata con `--i`, anche sulle righe
    delle tabelle; `app/(app)/app/template.tsx` lo applica a ogni cambio pagina;
  - menu, popover e modali `cos-pop` (scala + leggera rotazione 3D, 180 ms); menu mobile `cos-slide`;
  - **profondità 3D**: `Tilt` inclina le card KPI verso il puntatore (max 6°, solo mouse/penna, mai
    su touch) con riflesso luminoso; i numeri dei KPI salgono fino al valore reale (`CountUp`, il
    valore vero è già nel markup);
  - pannello del marchio nelle pagine di accesso: marchio fluttuante inclinabile (max 14°) e piano di
    cantiere in prospettiva che scorre.
  - **stile "liquid"**: dietro l'interfaccia tre macchie di colore sfumate (`body::before`, token
    `--aurora-1/2/3`) si spostano in 38 s; card e barre sono vetro smerigliato (`--glass-blur`,
    `.cos-glass`) con un riflesso in alto (`--liquid-sheen`) e un bordo di luce (`--card-glow`); il
    pulsante principale è attraversato da un riflesso al passaggio; i pulsanti rientrano leggermente
    alla pressione; `.cos-lift` solleva di 2 px le superfici cliccabili;
  - le animazioni d'ingresso usano `fill-mode: backwards`: a fine animazione non resta alcun
    `transform` sugli elementi, che altrimenti impedirebbe la sfocatura del vetro in Chrome. In CSS
    scrivere `-webkit-backdrop-filter` **prima** di `backdrop-filter` (la build tiene solo l'ultima);
  - finestre, menu e popover hanno anche un'animazione di chiusura (dissolvenza breve), non solo di
    apertura;
  - Con `prefers-reduced-motion: reduce` animazioni e inclinazioni si spengono.
- Bersagli touch: almeno 40 px (44 px nelle schermate del tecnico).

### Marchio

- File sorgente fornito dal committente; versioni per il web in `apps/web/public/brand/`:
  `logo-mark.png` (casco + edifici, sfondo trasparente) e `logo-full.png` (marchio, logotipo e motto
  "Gestisci • Organizza • Cresci"). Icona del sito e icona Apple in `apps/web/src/app/icon.png` e
  `apple-icon.png` (marchio su tessera navy).
- Il marchio ha parti bianche: va sempre su fondo scuro (sidebar navy, pannello delle pagine di
  accesso, tessera navy su fondo chiaro). Mai direttamente su bianco.
- Logotipo testuale nell'interfaccia: "Cantiere" nel colore del testo + "OS" in verde.

## 3. Tema chiaro e scuro

Tre preferenze: **Chiaro** (bianco e verde, predefinito), **Scuro** ("Cantiere digitale"), **Sistema**. La scelta è
salvata in un cookie (`cos_theme`), letta dal server al rendering (niente lampeggio) e applicata come
classe `dark`, `light` o `system` su `<html>`. Il selettore è nel menu utente.

Tipografia dello stile: titoli di pagina 28 px; etichette di sezione e dei KPI in maiuscolo
spaziato (come il motto del marchio); valori dei KPI in Geist Mono.

## 4. Layout

```
┌──────────┬──────────────────────────────────────────────────────────┐
│ Sidebar  │ Header: titolo pagina · ricerca (⌘K) · notifiche · utente │
│ (navy)   ├──────────────────────────────────────────────────────────┤
│ azienda  │                                                          │
│ attiva   │ Contenuto (max 1280 px, padding 24/32 px)                │
│ menu     │                                                          │
│ per      │                                                          │
│ permessi │                                                          │
└──────────┴──────────────────────────────────────────────────────────┘
```

- **Sidebar**: selettore azienda in alto (con ruolo e badge DEMO), voci di menu **filtrate per
  permesso** (una voce compare solo se il server conferma il permesso), comprimibile su desktop
  (preferenza in cookie), a scomparsa su mobile.
- **Header**: titolo della pagina, ricerca globale, «+ Nuovo», notifiche, menu utente (profilo,
  sicurezza, tema, esci, esci da tutti i dispositivi). Sfocato sul contenuto; dopo 24 px di
  scorrimento si compatta (56 → 48 px, fondo più pieno, ombra) e torna sotto i 4 px (isteresi:
  niente rimbalzi vicino alla soglia).
- **«+ Nuovo»** (tasto `N`): crea un elemento da qualsiasi pagina. Ogni voce porta all'elenco con
  `?crea=1`, che apre la finestra di creazione già esistente (`useOpenFromUrl`) e poi toglie il
  parametro. Compaiono solo le voci per cui il server conferma lettura e scrittura; il
  salvataggio ricontrolla. Catalogo in `components/shell/navigation.ts` (`CREATE_ACTIONS`).
- **Ricerca e comandi (⌘K / Ctrl K, oppure `/`)**: Recenti (ultime 8 schede aperte, solo nel
  browser e separate per azienda: indirizzo e titolo, nessun dato inviato), «Crea», «Vai a» e i
  risultati cercati sul server con RLS. Scrivere «nuovo cliente» trova l'azione.
- **Barra in basso (telefono e tablet)**: Home, due sezioni principali secondo i permessi
  (Interventi, Rapportini, Attività, Clienti in quest'ordine), Cerca e «+ Nuovo». Il menu
  completo resta in alto a sinistra. Il contenuto lascia 96 px in fondo e i toast salgono sopra
  la barra.
- **Tasti rapidi**: ⌘K/Ctrl K o `/` ricerca, `N` nuovo, `[` comprime il menu laterale. Non
  scattano mentre si scrive in un campo.
- **Notifiche**: pannello con le notifiche dell'utente nell'azienda attiva (tabella
  `notifications`). Badge con il conteggio non lette. Nessuna notifica inventata: se non ce ne
  sono, stato vuoto.

## 5. Componenti

| Componente                                | Note d'uso                                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------------- |
| `Button`                                  | varianti `primary`, `secondary`, `ghost`, `danger`; taglie `sm`/`md`/`lg`; stato `loading`  |
| `Input`, `Select`, `Textarea`, `Checkbox` | sempre con `Label`; errore sotto il campo con `aria-describedby`                            |
| `FormField`                               | etichetta + controllo + suggerimento + errore; usato da tutti i moduli                      |
| `Card`                                    | contenitore con titolo, descrizione, azioni                                                 |
| `Badge`                                   | stati (`success`, `warning`, `danger`, `info`, `neutral`) e marcatore `DEMO`                |
| `Dialog`                                  | modale accessibile (Radix): focus intrappolato, Esc per chiudere, titolo obbligatorio       |
| `ConfirmDialog`                           | conferma per azioni distruttive: testo esplicito di cosa succede, bottone `danger`          |
| `DropdownMenu`                            | menu contestuali e menu utente (Radix)                                                      |
| `DataTable`                               | tabella server-side: ordinamento, ricerca, filtri, paginazione **tramite URL**, selezione   |
| `FilterBar`                               | ricerca testuale + filtri; ogni filtro si riflette nell'URL (condivisibile, tasto indietro) |
| `Pagination`                              | pagina corrente / totale, link precedente e successivo                                      |
| `KpiCard`                                 | valore, etichetta, variazione opzionale; numeri tabulari                                    |
| `EmptyState`                              | icona, titolo, testo; azione solo se l'utente ha il permesso e la funzione esiste           |
| `ErrorState`                              | messaggio comprensibile, id richiesta per l'assistenza, riprova                             |
| `Skeleton`                                | segnaposto di caricamento con la forma del contenuto finale                                 |
| `PageHeader`                              | titolo, descrizione, azioni della pagina                                                    |
| `ForbiddenState`                          | sezione non consentita al ruolo, o consentita solo dopo la verifica in due passaggi         |

Esiti delle azioni: per ora messaggi in linea (`Notice`) e ritorno alla lista filtrata sull'elemento
creato (`?id=…`); un componente `Toast` arriverà quando servirà davvero.

### Pagine di dettaglio, storico e moduli

- **Pagina di dettaglio**: breadcrumb → titolo con badge di stato → azioni reali (solo se
  permesse) → schede come link `?tab=` (Panoramica, Scadenze, Storico).
- **Timeline** (`components/history/timeline.tsx`): eventi raggruppati per giorno; per ogni
  modifica il confronto "prima → dopo" per campo; le creazioni mostrano i dati iniziali su richiesta.
- **Moduli**: `KeepValuesForm` non svuota i campi dopo un errore del server; errori per campo
  accanto al campo e messaggio generale con `role="alert"`.
- **Grafici** (`components/charts/bar-charts.tsx`): una serie, un colore (`primary`), barre sottili
  con angoli 4px, valore al passaggio, tabella nascosta per i lettori di schermo, link alla lista.

- **Editor dei modelli** (`moduli/modelli/[id]/template-editor.tsx`): tre colonne su schermi larghi —
  componenti (clic = aggiungi alla sezione attiva, oppure trascina), struttura con trascinamento di
  campi e sezioni (maniglia; frecce su telefono), duplicazione, annulla/ripristina (50 passi,
  Ctrl Z / Ctrl Maiusc Z fuori dai campi di testo), Ctrl S per salvare; anteprima "Foglio A4"
  (`FormDocument` con `blank`: caselle, righe e spazio firma come sul cartaceo) o "Prova a compilare".
  La scheda "Aspetto" (`appearance-panel.tsx`) cambia logo, colore, caratteri, intestazioni,
  densità, codice, revisione e piè di pagina; `FormDocument` li applica ovunque (foglio A4, stampa,
  moduli chiusi) tramite `document-style.ts`. Le intestazioni a fascia scelgono da sole testo
  bianco o scuro per restare leggibili; la stampa conserva i colori (`print-color-adjust: exact`).

## 6. Stati

Ogni pagina con dati gestisce quattro stati:

1. **Caricamento** — `loading.tsx` con skeleton della stessa forma (no spinner a pagina intera).
   Il `loading.tsx` dell'area `/app` sceglie la forma dall'indirizzo: panoramica, elenco o
   scheda di dettaglio.
2. **Vuoto** — `EmptyState` che spiega cosa comparirà e, se possibile, come crearlo.
3. **Errore** — `error.tsx` con `ErrorState`; nessun dettaglio tecnico all'utente, solo il
   riferimento (`digest`) che compare anche nei log del server. Una sezione senza permesso mostra
   `ForbiddenState` (non un reindirizzamento silenzioso).
4. **Dati** — il contenuto.

**Conferme e errori dei moduli.** Un salvataggio riuscito sul posto (senza cambio di pagina) si
annuncia con un avviso a scomparsa (`toast()` di `components/ui/toaster.tsx`, mostrato da
`FormAlert` quando riceve `message`): in basso a destra, `role="status"`, sparisce da solo dopo
5 secondi, si chiude con la ✕, al massimo tre insieme, lo stesso testo non si ripete. Gli errori
restano **dentro il modulo** (`role="alert"`, `data-testid="form-error"`), vicino ai campi, e non
spariscono da soli.

## 7. Dashboard per ruolo

La dashboard si sceglie dal **ruolo verificato sul server** nell'azienda attiva:

| Dashboard       | Ruoli                            | Contenuto (solo dati reali dell'azienda)                                            |
| --------------- | -------------------------------- | ----------------------------------------------------------------------------------- |
| Amministrazione | owner, admin, back_office        | centro di controllo (sotto) + utenti e posti del piano, inviti, anagrafiche, audit  |
| Responsabile    | operations_manager, site_manager | centro di controllo (sotto) + squadre, personale, clienti e sedi                    |
| Tecnico         | technician                       | la propria scheda dipendente e squadre; agenda quando esisterà il modulo interventi |

Le sezioni dei moduli non ancora realizzati **non** compaiono con numeri finti: arrivano con i
rispettivi moduli.

**Centro di controllo** (`app/(app)/app/command-center.tsx`, dati da `getCommandCenter` del core).
Riquadri: indicatori principali (incassato nel periodo con variazione, da incassare, interventi di
oggi, clienti attivi e nuovi, rapportini da approvare, attività urgenti), incassi (andamento a 6
mesi + pagamenti attesi), scadenze che richiedono attenzione, interventi di oggi e della settimana
con la squadra, le tue attività, da chiudere, mappa, ultime modifiche, azienda e squadre.

- Un riquadro esiste solo se chi guarda ha il permesso sui suoi dati; ogni numero è un link alla
  lista già filtrata.
- «Incassato» = pagamenti in entrata segnati come pagati, per data d'incasso. Non si chiama
  fatturato finché non esiste il modulo fatture.
- Filtro di periodo con link (`?periodo=last-month|quarter`): il periodo in corso si confronta con
  lo stesso tratto del periodo prima (1–26 novembre contro 1–26 ottobre).
- «Personalizza» mostra, nasconde e riordina i riquadri; la scelta è per persona e azienda nella
  tabella `user_preferences` (ADR-018), «Ripristina» la cancella. I riquadri nuovi compaiono in coda.

## 8. Scrittura

- Italiano semplice, frasi brevi, seconda persona ("Invita una persona").
- Bottoni con verbo + oggetto ("Crea cliente", non "OK").
- Errori: cosa è successo e cosa fare ("Codice non valido. Controlla l'ora del telefono").
- Date `16/11/2026`, ore `14:30`, importi `1.234,56 €`, fuso orario dell'azienda.

## 9. Dati di sviluppo

- Solo dal seed `supabase/seeds/development.sql` (aziende `is_demo = true`, nomi "DEMO …",
  email `.invalid`), mai nelle migrazioni né in produzione.
- L'interfaccia mostra il badge **DEMO** su ogni schermata di un'azienda dimostrativa.
- Nessun componente contiene dati di esempio "cablati" nel codice.
