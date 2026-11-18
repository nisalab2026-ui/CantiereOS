/**
 * Pagina "Mestieri" (/mestieri) e anteprima in home: come le funzioni ESISTENTI del gestionale servono
 * a ogni mestiere. Gli esempi di scadenze e moduli sono cose che il cliente crea da sé con scadenziario
 * ed editor dei modelli; l'unico modello già pronto citato è l'ispezione delle linee vita.
 * Riferimenti normativi solo come esempi di ciò che si tiene sotto controllo, non come consulenza.
 */

export type TradeIcon =
  | "edili"
  | "elettrici"
  | "idraulici"
  | "coperture"
  | "manutenzioni"
  | "antincendio"
  | "serramenti"
  | "facility";

export interface TradeNeed {
  title: string;
  text: string;
}

export interface Trade {
  id: string;
  icon: TradeIcon;
  name: string;
  /** Chi è, in una riga (card della home) */
  who: string;
  claim: string;
  intro: string;
  needs: [TradeNeed, TradeNeed, TradeNeed];
  /** Esempi di scadenze da tenere nello scadenziario */
  deadlines: string[];
  /** Esempi di moduli che si possono creare con l'editor */
  forms: string[];
}

export const TRADE_PAGES: Trade[] = [
  {
    id: "imprese-edili",
    icon: "edili",
    name: "Imprese edili",
    who: "Ristrutturazioni, nuove costruzioni, opere murarie.",
    claim: "Squadre, documenti e scadenze di ogni cantiere, senza rincorrere nessuno.",
    intro:
      "Tra personale, subappalti e committenti, un'impresa edile vive di documenti che scadono e di persone da coordinare. CantiereOS mette tutto sulla scheda giusta.",
    needs: [
      {
        title: "Personale sempre in regola",
        text: "Visite mediche, corsi sulla sicurezza e patentini di ogni dipendente nello scadenziario, con il responsabile avvisato per tempo.",
      },
      {
        title: "Documenti del cantiere a portata di mano",
        text: "POS, DURC, contratti e foto collegati al cliente, con le versioni: in cantiere si apre sempre quella valida.",
      },
      {
        title: "Squadre organizzate",
        text: "Attività assegnate a persone e squadre, con data e priorità, e un calendario che l'ufficio e il capocantiere vedono uguale.",
      },
    ],
    deadlines: ["Visita medica", "Corso sicurezza", "DURC", "Patentino PLE", "Polizza RC"],
    forms: ["Verbale di sopralluogo", "Checklist di sicurezza", "Verbale di consegna lavori"],
  },
  {
    id: "impianti-elettrici",
    icon: "elettrici",
    name: "Impianti elettrici",
    who: "Elettricisti, impiantisti, verifiche e manutenzioni.",
    claim: "Verifiche periodiche e qualifiche del personale sotto controllo.",
    intro:
      "Le verifiche degli impianti tornano a scadenza fissa e i tecnici devono avere le qualifiche giuste. Con le ricorrenze, la prossima verifica si crea da sola.",
    needs: [
      {
        title: "Verifiche che si ripetono da sole",
        text: "Verifica dell'impianto di terra o manutenzione di un quadro: completata una, lo scadenziario prepara la successiva.",
      },
      {
        title: "Qualifiche dei tecnici",
        text: "Attestati PES/PAV e corsi nella scheda di ogni persona, con avviso prima che scadano.",
      },
      {
        title: "Rapporti firmati sul posto",
        text: "Il tecnico compila il modulo di verifica dal telefono, il cliente firma con il dito e in ufficio arriva il PDF in A4.",
      },
    ],
    deadlines: [
      "Verifica impianto di terra",
      "Attestato PES/PAV",
      "Manutenzione cabina",
      "Collaudo",
    ],
    forms: [
      "Verifica impianto elettrico",
      "Dichiarazione di fine lavori",
      "Rapporto di intervento",
    ],
  },
  {
    id: "termoidraulica",
    icon: "idraulici",
    name: "Idraulici e termoidraulica",
    who: "Caldaie, climatizzazione, impianti idrici e sanitari.",
    claim: "Ogni caldaia ha la sua scadenza. Nessuna se ne dimentica.",
    intro:
      "Manutenzioni annuali, controlli di efficienza, impianti di centinaia di clienti: è il lavoro perfetto per uno scadenziario con le ricorrenze e una scheda per ogni cliente e sede.",
    needs: [
      {
        title: "Manutenzioni programmate",
        text: "Ogni impianto con la sua ricorrenza: a fine mese sai chi richiamare e il calendario si riempie da solo.",
      },
      {
        title: "Storico per cliente e sede",
        text: "Interventi, moduli compilati e documenti del cliente in una sola scheda, anche quando ha più case o più condomini.",
      },
      {
        title: "Incassi e richiami",
        text: "Pagamenti attesi con le scadenze e il registro di telefonate e solleciti, con la data del prossimo richiamo.",
      },
    ],
    deadlines: [
      "Manutenzione caldaia",
      "Controllo efficienza energetica",
      "Certificato F-gas",
      "Contratto di assistenza",
    ],
    forms: ["Rapporto di manutenzione", "Prova di tenuta", "Rapporto di intervento"],
  },
  {
    id: "coperture",
    icon: "coperture",
    name: "Coperture e linee vita",
    who: "Tetti, lattoneria, impermeabilizzazioni, sistemi anticaduta.",
    claim: "Lavori in quota con tutto in regola, dal tetto all'ufficio.",
    intro:
      "Chi lavora sui tetti deve avere DPI revisionati, corsi aggiornati e ispezioni documentate. CantiereOS ha già pronto il modello per l'ispezione delle linee vita.",
    needs: [
      {
        title: "Ispezione delle linee vita",
        text: "Il modello pronto (UNI 11560) si compila sul tetto dal telefono, con l'esito di ogni componente, le note e la firma.",
      },
      {
        title: "DPI e corsi per i lavori in quota",
        text: "Revisione delle imbracature, corsi e patentini di ogni persona nello scadenziario, con il responsabile avvisato.",
      },
      {
        title: "Foto e documenti della copertura",
        text: "Foto del sopralluogo, schede tecniche e certificazioni collegate al cliente e alla sede dell'edificio.",
      },
    ],
    deadlines: [
      "Ispezione linea vita",
      "Revisione imbracature",
      "Corso lavori in quota",
      "Patentino PLE",
    ],
    forms: ["Ispezione linea vita (pronto)", "Verbale di sopralluogo copertura", "Checklist DPI"],
  },
  {
    id: "manutenzioni",
    icon: "manutenzioni",
    name: "Manutenzioni",
    who: "Manutenzione ordinaria e straordinaria per privati e aziende.",
    claim: "Contratti, interventi e rapporti in un unico posto.",
    intro:
      "Chi fa manutenzione vive di contratti che si rinnovano e di interventi da documentare. Ogni cliente ha la sua scheda con tutto quello che lo riguarda.",
    needs: [
      {
        title: "Contratti che non scadono a sorpresa",
        text: "Data di rinnovo e preavviso per ogni contratto, così lo rinnovi prima che il cliente cerchi altrove.",
      },
      {
        title: "Interventi assegnati",
        text: "Attività per tecnico e per squadra con priorità e commenti: chi va dal cliente sa già cosa trova.",
      },
      {
        title: "Rapporti di intervento",
        text: "Il modulo con i dati del cliente già inseriti, la firma sul posto e il PDF archiviato nella sua scheda.",
      },
    ],
    deadlines: ["Rinnovo contratto", "Manutenzione programmata", "Revisione attrezzature"],
    forms: ["Rapporto di intervento", "Checklist di manutenzione", "Verbale di collaudo"],
  },
  {
    id: "antincendio",
    icon: "antincendio",
    name: "Antincendio",
    who: "Estintori, idranti, porte tagliafuoco, impianti di rilevazione.",
    claim: "Centinaia di presidi, ognuno con il suo controllo periodico.",
    intro:
      "I controlli antincendio sono periodici per definizione. Con le ricorrenze e i moduli a righe di controllo, ogni giro dal cliente diventa un verbale in pochi minuti.",
    needs: [
      {
        title: "Controlli periodici automatici",
        text: "Ogni presidio o contratto con la sua ricorrenza: completato il controllo, il prossimo è già in calendario.",
      },
      {
        title: "Verbali con una riga per presidio",
        text: "La tabella di controlli ha una riga per voce, con esito e nota: perfetta per estintori e idranti.",
      },
      {
        title: "Qualifiche dei manutentori",
        text: "Attestati e aggiornamenti dei tecnici nello scadenziario, con avviso al responsabile.",
      },
    ],
    deadlines: [
      "Controllo estintori",
      "Verifica idranti",
      "Porte tagliafuoco",
      "Attestato manutentore",
    ],
    forms: ["Verbale di controllo presidi", "Registro dei controlli", "Rapporto di intervento"],
  },
  {
    id: "serramenti",
    icon: "serramenti",
    name: "Serramenti",
    who: "Infissi, porte, persiane, posa e assistenza.",
    claim: "Dal sopralluogo alla posa, tutto sulla scheda del cliente.",
    intro:
      "Misure, schede tecniche, acconti e posa: un serramentista deve tenere insieme ufficio e cantiere. CantiereOS collega ogni passaggio al cliente.",
    needs: [
      {
        title: "Sopralluoghi documentati",
        text: "Modulo di rilievo con misure, note e foto compilato dal telefono, poi archiviato nella scheda del cliente.",
      },
      {
        title: "Acconti e saldi",
        text: "Acconto all'ordine e saldo alla posa come pagamenti attesi, con incassi parziali e solleciti registrati.",
      },
      {
        title: "Schede tecniche e garanzie",
        text: "Schede dei prodotti, dichiarazioni e garanzie nell'archivio, con la data di scadenza quando serve.",
      },
    ],
    deadlines: ["Posa programmata", "Fine garanzia", "Saldo lavori"],
    forms: ["Rilievo misure", "Verbale di posa", "Rapporto di assistenza"],
  },
  {
    id: "facility",
    icon: "facility",
    name: "Facility management",
    who: "Servizi integrati per condomini, uffici e strutture.",
    claim: "Tanti edifici, tanti fornitori, un solo quadro.",
    intro:
      "Chi gestisce servizi per più edifici coordina personale, fornitori e scadenze diverse per ogni sede. Con le sedi dei clienti e i ruoli, ognuno vede la sua parte.",
    needs: [
      {
        title: "Clienti con più sedi",
        text: "Ogni cliente con le sue sedi: scadenze, moduli e documenti si collegano all'edificio giusto.",
      },
      {
        title: "Fornitori sotto controllo",
        text: "Contratti, documenti e pagamenti dei fornitori, con le scadenze dei loro documenti.",
      },
      {
        title: "Più aziende, un accesso",
        text: "Se gestisci più società, passi dall'una all'altra con un solo accesso e i dati restano separati.",
      },
    ],
    deadlines: [
      "Contratto di servizio",
      "Verifica ascensore",
      "Pulizia canne fumarie",
      "Documenti fornitore",
    ],
    forms: ["Giro di controllo", "Verbale di sopralluogo", "Checklist di servizio"],
  },
];
