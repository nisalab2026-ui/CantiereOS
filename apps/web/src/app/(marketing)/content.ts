/**
 * Testi del sito pubblico. Descrivono SOLO funzioni che esistono nel gestionale (CLAUDE.md, regola 11):
 * quello che è in sviluppo sta in `COMING_SOON` ed è sempre presentato come "in arrivo".
 * Prezzi e piani: analisi e motivazioni in docs/PREZZI.md.
 */

export const NAV = [
  { href: "/funzionalita", label: "Funzionalità" },
  { href: "/mestieri", label: "Mestieri" },
  { href: "/chi-siamo", label: "Chi siamo" },
  { href: "/prezzi", label: "Prezzi" },
  { href: "/guida", label: "Guida" },
  { href: "/contatti", label: "Contatti" },
] as const;

/** Contatti pubblici forniti dal committente (17/11/2026). */
export const CONTACT = {
  /** Numero WhatsApp in formato internazionale senza "+" (wa.me) */
  whatsapp: "393273928101",
  whatsappDisplay: "+39 327 392 8101",
  whatsappMessage: "Buongiorno, vorrei avere maggiori informazioni su CantiereOS.",
} as const;

/** Chi ha realizzato il sito (riga in fondo a ogni pagina). */
export const SITE_CREDIT = {
  name: "Lume Studio",
  href: "https://lume-os-gilt.vercel.app",
} as const;

/** Mestieri a cui è rivolto il prodotto (non clienti: nessun logo o nome di terzi). */
export const TRADES = [
  "Imprese edili",
  "Impianti elettrici",
  "Termoidraulica",
  "Linee vita e coperture",
  "Manutenzioni",
  "Antincendio",
  "Serramenti",
  "Facility management",
];

export type FeatureIcon =
  | "deadlines"
  | "forms"
  | "documents"
  | "tasks"
  | "payments"
  | "directory"
  | "security"
  | "export"
  | "search"
  | "phone";

export interface Feature {
  id: string;
  icon: FeatureIcon;
  title: string;
  short: string;
  text: string;
  points: string[];
}

/** I capitoli principali: home (scorrimento laterale) e pagina Funzionalità. */
export const FEATURES: Feature[] = [
  {
    id: "scadenze",
    icon: "deadlines",
    title: "Scadenze sotto controllo",
    short: "Certificazioni, manutenzioni, controlli, contratti: niente più post-it.",
    text: "Un unico scadenziario per tutto ciò che scade: certificazioni del personale, manutenzioni, controlli periodici, documenti, pagamenti e contratti. Ognuna ha un responsabile, una ricorrenza e un avviso che arriva una volta sola.",
    points: [
      "Ricorrenze (mensile, annuale…) che si rinnovano al completamento",
      "Panoramica «Richiede attenzione» con le priorità del giorno",
      "Storico di chi ha cambiato cosa, con prima e dopo",
    ],
  },
  {
    id: "moduli",
    icon: "forms",
    title: "Moduli al posto della carta",
    short: "Verbali e checklist compilati dal telefono, stampabili in A4.",
    text: "Ogni azienda crea i propri modelli (verifiche, verbali, checklist) e li compila sul sito, anche dal telefono in cantiere. I dati di cliente, sede e azienda si inseriscono da soli; il modulo chiuso si stampa in A4 pulito.",
    points: [
      "Editor dei modelli: sezioni, Sì/No, Positivo/Negativo, note, firme",
      "Modello pronto per l'ispezione delle linee vita (UNI 11560)",
      "Moduli chiusi non modificabili, con data e autore",
    ],
  },
  {
    id: "documenti",
    icon: "documents",
    title: "Documenti in ordine",
    short: "Archivio con versioni, collegato a clienti e personale.",
    text: "Certificati, contratti, schede tecniche e foto in un archivio privato, collegati al cliente, alla persona o alla scadenza a cui servono. Ogni nuova versione conserva la precedente.",
    points: [
      "Anteprima di PDF e immagini senza scaricare",
      "Versioni: si vede sempre qual è quella valida",
      "Accesso secondo il ruolo, mai link pubblici",
    ],
  },
  {
    id: "attivita",
    icon: "tasks",
    title: "Attività e calendario",
    short: "Chi fa cosa e quando, con commenti sulla scheda.",
    text: "Assegna attività al personale, con data e priorità, e vedile nel calendario insieme alle scadenze. Ogni scheda ha i suoi commenti, così le decisioni non si perdono nelle chat.",
    points: [
      "Agenda del giorno anche dal telefono",
      "Commenti su clienti, persone, scadenze e attività",
      "Notifiche nell'app per ciò che ti riguarda",
    ],
  },
  {
    id: "pagamenti",
    icon: "payments",
    title: "Pagamenti e comunicazioni",
    short: "Incassi attesi, solleciti e il registro di ogni contatto.",
    text: "Tieni traccia di quanto devi incassare e quando, registra gli incassi parziali e annota ogni comunicazione con clienti e fornitori: telefonate, email, sopralluoghi.",
    points: [
      "Incassi attesi con stato e scadenza",
      "Registro delle comunicazioni per cliente",
      "Tutto collegato alla scheda del cliente",
    ],
  },
  {
    id: "anagrafiche",
    icon: "directory",
    title: "Clienti, personale e squadre",
    short: "Anagrafiche complete, con sedi, contatti e squadre.",
    text: "Clienti con le loro sedi e i contatti, fornitori, personale con qualifiche e squadre di lavoro. Ogni scheda raccoglie scadenze, documenti, attività e storico in un solo posto.",
    points: [
      "Ricerca istantanea in tutto il gestionale (Ctrl/⌘ K)",
      "Esportazione in Excel (CSV) con i filtri della pagina",
      "Archivia e riattiva senza perdere lo storico",
    ],
  },
];

/** Punti di fiducia: tutti verificati da test nel repository. */
export const SECURITY_POINTS = [
  {
    title: "Ogni azienda nei suoi dati",
    text: "L'isolamento tra aziende è applicato dal database stesso, non solo dall'app: un'azienda non può leggere i dati di un'altra.",
  },
  {
    title: "Ruoli e permessi",
    text: "Titolare, amministrazione, responsabili, tecnici, clienti esterni: ognuno vede solo ciò che gli serve.",
  },
  {
    title: "Verifica in due passaggi",
    text: "Obbligatoria per i ruoli amministrativi, con codici di recupero se perdi il telefono.",
  },
  {
    title: "Registro non alterabile",
    text: "Ogni modifica è registrata in una catena di controllo: se qualcuno la manomette, si vede.",
  },
];

/** Come si parte con CantiereOS: passi reali dell'app (registrazione, anagrafiche, inviti, lavoro). */
export const STEPS = [
  {
    n: "01",
    title: "Registri l'azienda",
    text: "Crei l'account del titolare e la tua azienda in pochi minuti. La verifica dell'email protegge l'accesso fin dal primo giorno.",
  },
  {
    n: "02",
    title: "Inserisci ciò che conta",
    text: "Clienti e sedi, personale, squadre e le prime scadenze. Puoi partire da poco e completare strada facendo.",
  },
  {
    n: "03",
    title: "Inviti la squadra",
    text: "Ogni collega riceve un invito con il suo ruolo: l'ufficio vede l'amministrazione, il tecnico la sua agenda.",
  },
  {
    n: "04",
    title: "Lavorate dallo stesso posto",
    text: "Ufficio e cantiere aggiornano gli stessi dati, dal computer o dal telefono. Niente più fogli sparsi.",
  },
];

/** Principi di chi costruisce CantiereOS (pagina Chi siamo). */
export const PRINCIPLES = [
  {
    title: "Niente funzioni finte",
    text: "Se un servizio non è collegato, il gestionale lo dice. Non mostriamo pulsanti che non fanno niente.",
  },
  {
    title: "Piccoli passi, verificati",
    text: "Ogni parte nuova arriva con i suoi test automatici. Una funzione non provata non è finita.",
  },
  {
    title: "Pensato per chi lavora fuori",
    text: "Pulsanti grandi, testi chiari, tutto usabile dal telefono con i guanti e con il sole in faccia.",
  },
  {
    title: "In italiano, per le imprese italiane",
    text: "Parole del mestiere, date e importi all'italiana, assistenza nella tua lingua.",
  },
];

/** In sviluppo: mai presentato come disponibile. Ordine da docs/ROADMAP.md. */
export const COMING_SOON = [
  { title: "Cantieri", text: "Scheda del cantiere con squadre, documenti, avanzamento e diario." },
  {
    title: "Rapportini giornalieri",
    text: "Ore, materiali e foto inviati dal cantiere in un minuto.",
  },
  {
    title: "App da cantiere senza rete",
    text: "Compilazione anche offline, sincronizzata al rientro.",
  },
  { title: "Collegamento ai gestionali", text: "Scambio dati con i programmi di contabilità." },
];

export interface Plan {
  id: string;
  name: string;
  tagline: string;
  /** €/mese IVA esclusa con fatturazione annuale */
  yearly: number;
  /** €/mese IVA esclusa con fatturazione mensile */
  monthly: number;
  users: string;
  /** utenti inclusi nel prezzo */
  included: number;
  /** massimo di utenti del piano (inclusi + aggiuntivi) */
  max: number;
  recommended?: boolean;
  features: string[];
}

/** Piani: vedi docs/PREZZI.md per analisi di mercato e motivazioni. IVA esclusa. */
export const PLANS: Plan[] = [
  {
    id: "base",
    name: "Base",
    tagline: "Per artigiani e piccole imprese che vogliono smettere con la carta.",
    yearly: 39,
    monthly: 49,
    users: "3 utenti inclusi, fino a 5",
    included: 3,
    max: 5,
    features: [
      "Clienti, fornitori, personale e squadre",
      "Scadenze con ricorrenze e avvisi",
      "Attività, calendario e commenti",
      "Moduli compilabili: fino a 5 modelli",
      "Archivio documenti: 10 GB",
      "Verifica in due passaggi e ruoli",
    ],
  },
  {
    id: "impresa",
    name: "Impresa",
    tagline: "Per l'impresa con ufficio e squadre in cantiere.",
    yearly: 89,
    monthly: 109,
    users: "15 utenti inclusi, fino a 30",
    included: 15,
    max: 30,
    recommended: true,
    features: [
      "Tutto il piano Base",
      "Modelli di modulo illimitati",
      "Pagamenti attesi e incassi",
      "Registro delle comunicazioni",
      "Storico prima/dopo e registro attività",
      "Esportazioni in Excel (CSV)",
      "Archivio documenti: 50 GB",
    ],
  },
  {
    id: "gruppo",
    name: "Gruppo",
    tagline: "Per chi gestisce più aziende o squadre numerose.",
    yearly: 189,
    monthly: 229,
    users: "40 utenti inclusi, fino a 80",
    included: 40,
    max: 80,
    features: [
      "Tutto il piano Impresa",
      "Più aziende con un solo accesso (fino a 3)",
      "Archivio documenti: 200 GB",
      "Avvio guidato e importazione dati inclusi",
      "Assistenza prioritaria",
    ],
  },
];

export const PRICING_EXTRAS = {
  extraUser: 9,
  onboarding: 390,
  trialDays: 30,
};

export interface Faq {
  q: string;
  a: string;
}

export const PRICING_FAQ: Faq[] = [
  {
    q: "Posso provarlo prima di pagare?",
    a: `Sì: ${PRICING_EXTRAS.trialDays} giorni di prova con tutte le funzioni del piano Impresa, senza carta di credito.`,
  },
  {
    q: "Cosa succede se superiamo gli utenti inclusi?",
    a: `Puoi aggiungere utenti a ${PRICING_EXTRAS.extraUser} € al mese l'uno, fino al massimo del piano (5 per Base, 30 per Impresa, 80 per Gruppo). Oltre, si passa al piano successivo; sopra gli 80 utenti facciamo un'offerta su misura.`,
  },
  {
    q: "Posso cambiare piano?",
    a: "Sì, in qualsiasi momento. Passando a un piano superiore la differenza si calcola sui giorni rimasti.",
  },
  {
    q: "I prezzi includono l'IVA?",
    a: "No, i prezzi sono IVA esclusa. Con la fatturazione annuale risparmi circa due mesi rispetto a quella mensile.",
  },
  {
    q: "Ci aiutate a caricare i dati che abbiamo già?",
    a: `Sì, con l'avvio guidato: importiamo clienti, personale e scadenze dai vostri fogli Excel e formiamo la squadra. Costa ${PRICING_EXTRAS.onboarding} € una tantum ed è incluso nel piano Gruppo.`,
  },
];

/** Domande frequenti generali (home). Le risposte d'uso dettagliate sono nella Guida. */
export const HOME_FAQ: Faq[] = [
  {
    q: "Funziona dal telefono?",
    a: "Sì. Il gestionale si adatta a telefono e tablet: il tecnico vede la sua agenda, compila i moduli e consulta i documenti dal cantiere.",
  },
  {
    q: "Devo installare qualcosa?",
    a: "No. Si usa dal browser, su computer, tablet e telefono. Basta accedere con email e password.",
  },
  {
    q: "I miei dati sono al sicuro?",
    a: "Ogni azienda vede solo i propri dati, garantito dal database stesso. Le modifiche sono registrate e i ruoli amministrativi usano la verifica in due passaggi.",
  },
  {
    q: "Posso gestire più aziende?",
    a: "Sì. Con un solo accesso passi da un'azienda all'altra e ogni azienda resta separata.",
  },
  {
    q: "Fa anche la fatturazione elettronica?",
    a: "Non ancora. La contabilità resta nel tuo programma attuale; il collegamento ai gestionali è in sviluppo.",
  },
];
