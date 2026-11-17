/**
 * Contenuti della Guida. Descrivono solo ciò che l'app fa davvero: quando una
 * funzione cambia, va aggiornata anche la sua voce qui (CLAUDE.md, regola 13).
 * `permission`: la voce si vede solo a chi può usare quella parte dell'app.
 */
export interface GuideEntry {
  q: string;
  /** Paragrafi; una riga che inizia con "- " diventa un punto elenco. */
  a: string[];
}

export interface GuideTopic {
  id: string;
  title: string;
  summary: string;
  icon: GuideIcon;
  href?: string;
  permission?: string;
  entries: GuideEntry[];
}

export type GuideIcon =
  | "start"
  | "search"
  | "dashboard"
  | "tasks"
  | "calendar"
  | "deadlines"
  | "documents"
  | "payments"
  | "communications"
  | "forms"
  | "customers"
  | "suppliers"
  | "staff"
  | "teams"
  | "users"
  | "audit"
  | "security"
  | "faq";

export const GUIDE: GuideTopic[] = [
  {
    id: "primi-passi",
    title: "Primi passi",
    summary: "Come è organizzata l'app e da dove cominciare.",
    icon: "start",
    entries: [
      {
        q: "Come è fatta l'app?",
        a: [
          "A sinistra c'è il menu, diviso in Lavoro, Anagrafiche, Azienda e Account. Sul telefono il menu si apre con il pulsante in alto a sinistra.",
          "Vedi solo le voci che il tuo ruolo ti permette di usare: se manca una sezione, chiedi al titolare o a un amministratore.",
        ],
      },
      {
        q: "Da dove comincio con una nuova azienda?",
        a: [
          "- Inserisci i clienti (e le loro sedi) in «Clienti».",
          "- Aggiungi personale e squadre, poi invita i colleghi da «Utenti e accessi».",
          "- Carica scadenze e documenti, così la Panoramica ti avvisa per tempo.",
          "- Se usi moduli cartacei, trasformali in modelli in «Moduli» → «Modelli».",
        ],
      },
      {
        q: "Lavoro per più aziende: come passo dall'una all'altra?",
        a: [
          "In alto nel menu c'è il nome dell'azienda attiva: toccalo per scegliere un'altra azienda di cui fai parte. Dati e permessi cambiano con l'azienda.",
        ],
      },
      {
        q: "Posso usare il tema chiaro?",
        a: [
          "Sì: apri il menu del tuo profilo (le iniziali in alto a destra) e scegli Chiaro, Scuro o Sistema, che segue l'impostazione del dispositivo.",
        ],
      },
    ],
  },
  {
    id: "ricerca",
    title: "Ricerca, notifiche ed esportazioni",
    summary: "Trovare tutto in un attimo, gli avvisi e i file CSV.",
    icon: "search",
    entries: [
      {
        q: "Come cerco un cliente, un documento o un modulo?",
        a: [
          "Usa la barra «Cerca…» in alto, oppure premi Ctrl K (⌘ K sul Mac) da qualsiasi pagina. Cerca tra clienti, fornitori, personale, squadre, scadenze, documenti, attività, pagamenti, comunicazioni e moduli, anche per codice o numero impianto.",
        ],
      },
      {
        q: "Cosa trovo nella campanella?",
        a: [
          "Gli avvisi che ti riguardano, per esempio un'attività assegnata a te o una scadenza in arrivo di cui sei responsabile. Un pallino indica quante non hai ancora letto.",
        ],
      },
      {
        q: "Come esporto un elenco in Excel?",
        a: [
          "Negli elenchi c'è il pulsante «Esporta CSV»: scarica le righe con i filtri e la ricerca che stai usando. Il file si apre con Excel, Numbers o LibreOffice.",
          "Ogni esportazione viene registrata, con autore e data.",
        ],
      },
    ],
  },
  {
    id: "panoramica",
    title: "Panoramica",
    summary: "La pagina iniziale con ciò che richiede attenzione.",
    icon: "dashboard",
    href: "/app",
    entries: [
      {
        q: "Cosa mostra la Panoramica?",
        a: [
          "I numeri che richiedono attenzione (scadenze in ritardo, entro 7 giorni, senza responsabile, assegnate a te), l'elenco delle cose da gestire subito e l'andamento delle scadenze nei prossimi mesi. Tocca un riquadro per aprire l'elenco filtrato.",
        ],
      },
    ],
  },
  {
    id: "attivita",
    title: "Attività e calendario",
    summary: "Lavori da fare assegnati alle persone, e il calendario del mese.",
    icon: "tasks",
    href: "/app/attivita",
    permission: "tasks.read",
    entries: [
      {
        q: "Come assegno un lavoro a un collega?",
        a: [
          "In «Attività» usa «Nuova attività»: scegli chi la deve fare, priorità e data, e se serve collegala a un cliente, a un dipendente, a un fornitore o a una squadra. Chi la riceve trova l'avviso nella campanella.",
        ],
      },
      {
        q: "Un tecnico può modificare un'attività?",
        a: [
          "Chi riceve un'attività può aggiornarne lo stato (per esempio «In corso» o «Completata»). Titolo, data e assegnatario li cambia chi gestisce le attività.",
        ],
      },
      {
        q: "Cosa vedo nel calendario?",
        a: [
          "Attività e scadenze del mese, e se hai i permessi anche pagamenti attesi e richiami delle comunicazioni. Sul telefono il calendario diventa un'agenda giorno per giorno.",
        ],
      },
      {
        q: "Dove scrivo una nota interna?",
        a: [
          "Nelle schede di clienti, personale, scadenze, documenti e attività c'è il riquadro dei commenti: sono visibili solo ai colleghi dell'azienda.",
        ],
      },
    ],
  },
  {
    id: "scadenze",
    title: "Scadenze",
    summary: "Certificazioni, manutenzioni, controlli, documenti, pagamenti e contratti.",
    icon: "deadlines",
    href: "/app/scadenze",
    permission: "deadlines.read",
    entries: [
      {
        q: "Come registro una scadenza?",
        a: [
          "In «Scadenze» usa «Nuova scadenza»: tipo, data, giorni di preavviso, responsabile ed eventualmente il cliente, fornitore, dipendente o squadra a cui si riferisce.",
        ],
      },
      {
        q: "Cosa succede quando completo una scadenza che si ripete?",
        a: [
          "Se la scadenza ha una ricorrenza (per esempio ogni anno), completandola viene creata da sola la successiva, collegata alla precedente: lo storico resta consultabile.",
        ],
      },
      {
        q: "Quando ricevo l'avviso?",
        a: [
          "Quando una scadenza entra nel periodo di preavviso o è superata, il responsabile trova l'avviso nella campanella e la scadenza compare nella Panoramica.",
        ],
      },
    ],
  },
  {
    id: "documenti",
    title: "Documenti",
    summary: "Archivio di contratti, certificati, verbali e foto, con le versioni.",
    icon: "documents",
    href: "/app/documenti",
    permission: "documents.read",
    entries: [
      {
        q: "Come carico un documento?",
        a: [
          "Da «Documenti» o dalla scheda di un cliente, dipendente o fornitore. Se indichi una data di scadenza, la Panoramica ti segnala i documenti scaduti o in scadenza e in «Documenti» puoi filtrarli.",
        ],
      },
      {
        q: "Se carico una nuova versione, perdo la vecchia?",
        a: [
          "No. Ogni file caricato resta consultabile nelle versioni del documento, con chi l'ha caricato e quando. Anche download e anteprime vengono registrati.",
        ],
      },
      {
        q: "L'app legge da sola il testo dei documenti scansionati?",
        a: [
          "Non ancora: il servizio di lettura automatica (OCR) non è configurato. Quando lo sarà, verrà indicato nella pagina del documento.",
        ],
      },
    ],
  },
  {
    id: "pagamenti",
    title: "Pagamenti",
    summary: "Incassi attesi dai clienti e pagamenti ai fornitori.",
    icon: "payments",
    href: "/app/pagamenti",
    permission: "payments.read",
    entries: [
      {
        q: "A cosa serve la sezione Pagamenti?",
        a: [
          "A non perdere di vista quanto devi incassare e quanto devi pagare, e quando. Non è contabilità e non muove denaro: nessun collegamento con la banca.",
        ],
      },
      {
        q: "Come segno un pagamento come saldato?",
        a: [
          "Apri il pagamento e usa «Segna come saldato»: inserisci data e importo effettivo. L'app registra chi l'ha segnato e quando.",
        ],
      },
    ],
  },
  {
    id: "comunicazioni",
    title: "Comunicazioni",
    summary: "Telefonate, email, PEC e incontri, con i richiami da fare.",
    icon: "communications",
    href: "/app/comunicazioni",
    permission: "communications.read",
    entries: [
      {
        q: "L'app invia email o PEC?",
        a: [
          "No: qui si registra cosa è stato detto o inviato, con chi e quando. Le comunicazioni partono dai tuoi soliti strumenti.",
        ],
      },
      {
        q: "Come mi ricordo di richiamare un cliente?",
        a: [
          "Quando registri una comunicazione puoi indicare una data di richiamo: comparirà nel calendario finché non premi «Richiamo fatto».",
        ],
      },
    ],
  },
  {
    id: "moduli",
    title: "Moduli compilabili",
    summary: "Verbali, checklist e ispezioni dal telefono, al posto della carta.",
    icon: "forms",
    href: "/app/moduli",
    permission: "forms.read",
    entries: [
      {
        q: "Come trasformo un modulo cartaceo in digitale?",
        a: [
          "In «Moduli» → «Modelli» crea un nuovo modello, oppure parti da uno pronto (per esempio «Ispezione linea vita») con «Usa questo modello».",
          "Aggiungi sezioni e campi: testo, numero, data, Sì/No, scelta, tabella di controlli (una riga per voce, con esito e nota), firma e dati automatici. A destra vedi l'anteprima.",
          "Quando è pronto, premi «Pubblica»: da quel momento si può compilare.",
        ],
      },
      {
        q: "Cosa sono i dati automatici?",
        a: [
          "Campi che si compilano da soli al salvataggio: nome e indirizzo del cliente, sede, dati della tua azienda, chi compila, la data di oggi e la data dell'ultima ispezione dello stesso impianto.",
        ],
      },
      {
        q: "Come compilo un modulo in cantiere?",
        a: [
          "In «Moduli» premi «Compila un modulo», scegli il modello e il cliente. Puoi salvare la bozza e continuare dopo; se la pagina si chiude per sbaglio, al ritorno l'app propone di ripristinare quello che avevi scritto su quel dispositivo.",
          "La firma si fa con il dito o il mouse nel riquadro, poi «Conferma firma».",
        ],
      },
      {
        q: "Cosa cambia quando chiudo un modulo?",
        a: [
          "L'app controlla che i campi obbligatori ci siano. Una volta chiuso, il modulo non si può più modificare: resta com'è, con data e autore della chiusura. Può riaprirlo solo chi gestisce i moduli.",
        ],
      },
      {
        q: "Come ottengo il PDF?",
        a: [
          "Nella pagina del modulo usa «Stampa / PDF» e scegli «Salva come PDF» nella finestra di stampa: il modulo è impaginato in formato A4.",
        ],
      },
      {
        q: "Se modifico un modello, cambiano i moduli già compilati?",
        a: [
          "No. Le modifiche valgono solo dopo «Pubblica» e creano una nuova versione: i moduli già compilati restano legati alla versione con cui sono nati.",
        ],
      },
      {
        q: "Posso caricare un PDF e farlo leggere all'app?",
        a: [
          "Non ancora: la lettura automatica di PDF e foto non è configurata. Per ora il modello si costruisce con l'editor.",
        ],
      },
    ],
  },
  {
    id: "clienti",
    title: "Clienti",
    summary: "Anagrafica, sedi, documenti, moduli e cronologia del cliente.",
    icon: "customers",
    href: "/app/clienti",
    permission: "customers.read",
    entries: [
      {
        q: "Cosa trovo nella scheda di un cliente?",
        a: [
          "Dati e sedi del cliente, e tutto ciò che lo riguarda: scadenze, documenti, pagamenti, comunicazioni, moduli compilati, commenti e la cronologia delle modifiche.",
        ],
      },
      {
        q: "Posso eliminare un cliente?",
        a: [
          "Chi ha il permesso può eliminarlo: serve la verifica in due passaggi. La sua cronologia resta nel registro attività.",
        ],
      },
    ],
  },
  {
    id: "fornitori",
    title: "Fornitori",
    summary: "Anagrafica dei fornitori.",
    icon: "suppliers",
    href: "/app/fornitori",
    permission: "suppliers.read",
    entries: [
      {
        q: "A cosa servono i fornitori?",
        a: [
          "A collegarli a scadenze, documenti, attività, pagamenti da fare e comunicazioni, così ritrovi tutto dalla loro voce.",
        ],
      },
    ],
  },
  {
    id: "personale",
    title: "Personale",
    summary: "Dipendenti e collaboratori, con certificazioni, corsi e visite.",
    icon: "staff",
    href: "/app/personale",
    permission: "employees.read",
    entries: [
      {
        q: "Come tengo sotto controllo corsi e visite mediche?",
        a: [
          "Nella scheda del dipendente aggiungi certificazioni, corsi e visite come scadenze: compariranno nello scadenziario e nella Panoramica.",
        ],
      },
    ],
  },
  {
    id: "squadre",
    title: "Squadre",
    summary: "Squadre operative e loro composizione.",
    icon: "teams",
    href: "/app/squadre",
    permission: "teams.read",
    entries: [
      {
        q: "A cosa servono le squadre?",
        a: [
          "Raggruppano il personale che lavora insieme: puoi collegare a una squadra attività e scadenze.",
        ],
      },
    ],
  },
  {
    id: "utenti",
    title: "Utenti e ruoli",
    summary: "Invitare i colleghi e decidere cosa può fare ciascuno.",
    icon: "users",
    href: "/app/membri",
    permission: "members.read",
    entries: [
      {
        q: "Come invito un collega?",
        a: [
          "In «Utenti e accessi» usa «Invita»: inserisci l'email e scegli il ruolo. Riceverà un link valido 7 giorni, da aprire con quella email.",
        ],
      },
      {
        q: "Quali ruoli esistono?",
        a: [
          "- Proprietario azienda e Amministratore: gestiscono tutto, utenti compresi.",
          "- Responsabile operativo: clienti, fornitori, personale, squadre, attività, scadenze, documenti, comunicazioni e modelli dei moduli.",
          "- Responsabile cantiere: squadre, attività, scadenze, documenti, comunicazioni e compilazione dei moduli.",
          "- Amministrazione: clienti, fornitori, pagamenti, attività, scadenze, documenti, comunicazioni e modelli dei moduli.",
          "- Tecnico: aggiorna le attività assegnate, compila i moduli e scrive commenti; consulta ciò che gli serve in cantiere.",
          "- Sola consultazione: vede senza modificare.",
          "Il menu mostra a ciascuno solo le sezioni che può usare, e il server ricontrolla i permessi a ogni operazione.",
        ],
      },
    ],
  },
  {
    id: "registro",
    title: "Registro attività",
    summary: "Chi ha fatto cosa, e quando.",
    icon: "audit",
    href: "/app/registro",
    permission: "audit.read",
    entries: [
      {
        q: "Cosa registra?",
        a: [
          "Ogni creazione, modifica ed eliminazione dell'azienda, con autore, data e valori prima e dopo. Nessun utente può modificarlo o cancellarlo.",
          "La stessa cronologia, limitata al singolo elemento, la trovi in fondo alle schede.",
        ],
      },
    ],
  },
  {
    id: "sicurezza",
    title: "Accesso e sicurezza",
    summary: "Verifica in due passaggi, codici di recupero e sessioni.",
    icon: "security",
    href: "/account/sicurezza",
    entries: [
      {
        q: "Cos'è la verifica in due passaggi?",
        a: [
          "Oltre alla password ti viene chiesto un codice di 6 cifre dall'app di autenticazione sul telefono (per esempio Google Authenticator o Microsoft Authenticator). Per il titolare è obbligatoria, e le operazioni delicate, come eliminare dati o gestire gli utenti, la richiedono a tutti.",
          "Si attiva da «Sicurezza», nel menu Account.",
        ],
      },
      {
        q: "Ho perso il telefono: come entro?",
        a: [
          "Usa uno dei codici di recupero che hai salvato quando hai attivato la verifica. Ogni codice vale una sola volta; dopo l'accesso configura di nuovo l'app di autenticazione.",
        ],
      },
      {
        q: "Ho dimenticato la password.",
        a: ["Nella pagina di accesso usa «Password dimenticata?»: riceverai un link via email."],
      },
    ],
  },
  {
    id: "domande",
    title: "Domande frequenti",
    summary: "Telefono, dati, sicurezza.",
    icon: "faq",
    entries: [
      {
        q: "Funziona dal telefono?",
        a: [
          "Sì: tutte le pagine si adattano allo schermo del telefono. Basta il browser, non serve installare nulla.",
        ],
      },
      {
        q: "Gli altri clienti del servizio vedono i miei dati?",
        a: [
          "No. Ogni azienda vede solo i propri dati, e il controllo è fatto dal database a ogni richiesta, non solo dalle pagine.",
        ],
      },
      {
        q: "Cosa sono le voci con «DEMO»?",
        a: [
          "Dati dimostrativi, presenti solo negli ambienti di prova. Nell'ambiente reale non ci sono dati di esempio.",
        ],
      },
      {
        q: "Una funzione dice «non configurata»: cosa significa?",
        a: [
          "Che il servizio esterno necessario (per esempio la lettura automatica dei documenti) non è ancora attivo. L'app non finge di farlo: appena viene configurato, la funzione si attiva.",
        ],
      },
    ],
  },
];
