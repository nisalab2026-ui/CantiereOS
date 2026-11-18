/**
 * Testi legali del sito pubblico (privacy, cookie, termini, note legali).
 *
 * I dati dell'azienda non sono ancora stati forniti: ogni `[[...]]` è mostrato come "da completare"
 * ben visibile (components/site/legal.tsx). Non inventare ragione sociale, partita IVA, sede o PEC.
 * I testi sono una bozza da far verificare a un consulente prima di pubblicare davvero il sito
 * (docs/SITO_PUBBLICO.md). I cookie elencati sono quelli che il codice imposta davvero.
 */

export type LegalBlock =
  string | { list: string[] } | { table: { head: string[]; rows: string[][] } };

export interface LegalSection {
  id: string;
  title: string;
  blocks: LegalBlock[];
}

export interface LegalDoc {
  slug: "privacy" | "cookie" | "termini" | "note-legali";
  eyebrow: string;
  title: string;
  description: string;
  lead: string;
  sections: LegalSection[];
}

export const LEGAL_UPDATED = "17 novembre 2026";

/** Dati del titolare, ripetuti nei quattro documenti. */
const OWNER =
  "[[ragione sociale]], con sede in [[indirizzo della sede legale]], partita IVA [[partita IVA]]";
const OWNER_CONTACTS = "email [[indirizzo email]], PEC [[indirizzo PEC]]";

export const LEGAL_DOCS: Record<LegalDoc["slug"], LegalDoc> = {
  privacy: {
    slug: "privacy",
    eyebrow: "Informativa privacy",
    title: "Come trattiamo i tuoi dati",
    description:
      "Informativa sul trattamento dei dati personali di CantiereOS ai sensi degli articoli 13 e 14 del Regolamento (UE) 2016/679.",
    lead: "Questa informativa spiega quali dati personali raccogliamo quando visiti il sito o usi CantiereOS, perché li trattiamo, per quanto tempo li conserviamo e quali diritti hai. È resa ai sensi degli articoli 13 e 14 del Regolamento (UE) 2016/679 (GDPR).",
    sections: [
      {
        id: "titolare",
        title: "Titolare del trattamento",
        blocks: [
          `Il titolare del trattamento è ${OWNER} (di seguito "CantiereOS" o "noi").`,
          `Per qualsiasi domanda sui tuoi dati puoi scriverci: ${OWNER_CONTACTS}.`,
        ],
      },
      {
        id: "due-ruoli",
        title: "Due ruoli diversi",
        blocks: [
          "Per i dati di chi visita il sito e per i dati degli account (nome, email, azienda) siamo titolari del trattamento.",
          "I dati che le imprese inseriscono nel gestionale (anagrafiche, scadenze, documenti, moduli, attività) appartengono all'impresa cliente, che ne è titolare. Per questi dati CantiereOS agisce come responsabile del trattamento ai sensi dell'articolo 28 del GDPR, secondo le istruzioni del cliente e l'accordo sul trattamento dei dati che fa parte dei termini di servizio.",
        ],
      },
      {
        id: "dati",
        title: "Quali dati trattiamo",
        blocks: [
          {
            list: [
              "Dati di navigazione: indirizzo IP, data e ora della richiesta, pagina visitata e tipo di browser, registrati dai sistemi che ospitano il sito per sicurezza e funzionamento.",
              "Dati dell'account: nome, indirizzo email, password (conservata solo in forma cifrata e non leggibile), azienda di appartenenza, ruolo e impostazioni di sicurezza come la verifica in due passaggi.",
              "Dati di utilizzo del gestionale: registro delle operazioni (chi ha fatto cosa e quando), necessario per la sicurezza e la tracciabilità delle modifiche.",
              "Dati che ci invii quando ci contatti, per email o su WhatsApp: nome, numero di telefono e contenuto dei messaggi.",
            ],
          },
          "Non usiamo strumenti di profilazione o di pubblicità e non vendiamo dati a terzi.",
        ],
      },
      {
        id: "finalita",
        title: "Perché li trattiamo e su quale base",
        blocks: [
          {
            table: {
              head: ["Finalità", "Base giuridica"],
              rows: [
                [
                  "Fornire il servizio: creare l'account, permettere l'accesso, gestire l'azienda e i suoi utenti",
                  "Esecuzione del contratto (art. 6.1.b GDPR)",
                ],
                [
                  "Proteggere il servizio: prevenire accessi non autorizzati e abusi, registrare le operazioni",
                  "Legittimo interesse alla sicurezza (art. 6.1.f GDPR)",
                ],
                [
                  "Rispondere alle richieste di informazioni inviate per email o WhatsApp",
                  "Misure precontrattuali richieste da te (art. 6.1.b GDPR)",
                ],
                [
                  "Adempimenti fiscali e contabili, quando il servizio sarà a pagamento",
                  "Obbligo di legge (art. 6.1.c GDPR)",
                ],
              ],
            },
          },
        ],
      },
      {
        id: "fornitori",
        title: "A chi li affidiamo",
        blocks: [
          "I dati sono trattati da persone autorizzate e da fornitori che ci aiutano a erogare il servizio, nominati responsabili del trattamento:",
          {
            list: [
              "Supabase: database, accesso e archivio dei documenti, su server nell'Unione Europea (Francoforte, Germania).",
              "Vercel: pubblicazione del sito e dell'applicazione. Alcuni dati tecnici possono transitare fuori dall'Unione Europea; in questo caso il trasferimento è coperto dalle clausole contrattuali standard della Commissione europea o dal Data Privacy Framework UE-USA.",
              "Il fornitore del servizio di invio email, per i messaggi di conferma, recupero password e inviti.",
            ],
          },
          "Se ci scrivi su WhatsApp, il servizio è gestito da WhatsApp Ireland Limited secondo la propria informativa: ti consigliamo di non inviarci dati personali di altre persone o dati particolari.",
          "L'elenco aggiornato dei fornitori è disponibile su richiesta.",
        ],
      },
      {
        id: "conservazione",
        title: "Per quanto tempo li conserviamo",
        blocks: [
          {
            list: [
              "Dati dell'account e dati inseriti nel gestionale: per tutta la durata del contratto. Alla chiusura dell'account vengono cancellati entro [[numero]] giorni, salvo esportazione richiesta dal cliente.",
              "Registro delle operazioni: [[numero]] mesi.",
              "Dati di navigazione: al massimo [[numero]] giorni, salvo necessità di accertare reati.",
              "Messaggi di richiesta informazioni: il tempo necessario a rispondere e, se diventi cliente, per la durata del rapporto.",
              "Documenti fiscali: 10 anni, come previsto dalla legge.",
            ],
          },
        ],
      },
      {
        id: "diritti",
        title: "I tuoi diritti",
        blocks: [
          "Puoi chiederci in qualsiasi momento di accedere ai tuoi dati, di correggerli, di cancellarli, di limitarne il trattamento, di riceverli in un formato leggibile da un computer (portabilità) e puoi opporti al trattamento basato sul legittimo interesse (articoli 15–22 del GDPR).",
          `Per esercitare i tuoi diritti scrivici a [[indirizzo email]]. Ti risponderemo entro un mese. Se i dati sono stati inseriti dalla tua azienda nel gestionale, inoltreremo la richiesta all'azienda, che ne è titolare.`,
          "Hai anche il diritto di presentare un reclamo al Garante per la protezione dei dati personali (www.garanteprivacy.it).",
        ],
      },
      {
        id: "sicurezza",
        title: "Come proteggiamo i dati",
        blocks: [
          "I dati di ogni azienda sono separati da quelli delle altre direttamente nel database. Le connessioni sono cifrate, le password non sono mai conservate in chiaro, è disponibile la verifica in due passaggi e ogni operazione importante viene registrata.",
        ],
      },
      {
        id: "modifiche",
        title: "Modifiche a questa informativa",
        blocks: [
          "Possiamo aggiornare questa informativa quando cambia il servizio o la normativa. La data dell'ultimo aggiornamento è indicata in cima alla pagina; per le modifiche importanti avviseremo i clienti via email.",
        ],
      },
    ],
  },

  cookie: {
    slug: "cookie",
    eyebrow: "Cookie policy",
    title: "Solo i cookie che servono",
    description:
      "Cookie policy di CantiereOS: il sito usa solo cookie tecnici necessari, senza profilazione né statistiche di terze parti.",
    lead: "Il sito e il gestionale usano soltanto cookie tecnici, indispensabili per farli funzionare. Non usiamo cookie di profilazione, di pubblicità o di statistica di terze parti. Per questo non ti chiediamo il consenso con un banner, come previsto dalle linee guida del Garante del 10 giugno 2021.",
    sections: [
      {
        id: "cosa-sono",
        title: "Che cosa sono i cookie",
        blocks: [
          "I cookie sono piccoli file di testo che un sito salva nel browser per ricordare informazioni tra una pagina e l'altra, come il fatto di aver già effettuato l'accesso.",
        ],
      },
      {
        id: "elenco",
        title: "I cookie che usiamo",
        blocks: [
          {
            table: {
              head: ["Nome", "A cosa serve", "Durata"],
              rows: [
                [
                  "sb-…-auth-token",
                  "Mantiene l'accesso al gestionale dopo il login, in modo sicuro (non leggibile dagli script)",
                  "Fino all'uscita o alla scadenza della sessione",
                ],
                [
                  "sb-…-auth-token-code-verifier",
                  "Protegge le procedure di accesso, conferma email e recupero password",
                  "Pochi minuti, il tempo della procedura",
                ],
                [
                  "cos_invite",
                  "Ricorda l'invito a entrare in un'azienda finché non lo confermi",
                  "24 ore",
                ],
                ["cos_theme", "Ricorda il tema chiaro o scuro scelto nel gestionale", "12 mesi"],
                [
                  "cos_sidebar",
                  "Ricorda se il menu laterale del gestionale è aperto o chiuso",
                  "12 mesi",
                ],
              ],
            },
          },
          "Il gestionale può anche salvare nel browser la bozza di un modulo che stai compilando, così non la perdi se la connessione cade. Resta solo sul tuo dispositivo e viene eliminata quando il modulo è inviato.",
        ],
      },
      {
        id: "terze-parti",
        title: "Servizi di terze parti",
        blocks: [
          "Il pulsante di WhatsApp è un semplice collegamento: nessun contenuto di WhatsApp viene caricato finché non lo premi. Una volta aperto WhatsApp, si applicano l'informativa e i cookie di WhatsApp Ireland Limited.",
          "I caratteri tipografici sono serviti dal nostro sito, senza richieste a servizi esterni.",
        ],
      },
      {
        id: "gestire",
        title: "Come gestirli",
        blocks: [
          "Puoi cancellare o bloccare i cookie dalle impostazioni del browser. Se blocchi i cookie tecnici il sito resta consultabile, ma non potrai accedere al gestionale.",
          "Per domande scrivici a [[indirizzo email]].",
        ],
      },
    ],
  },

  termini: {
    slug: "termini",
    eyebrow: "Termini di servizio",
    title: "Le regole del servizio",
    description:
      "Termini e condizioni d'uso di CantiereOS, il gestionale online per imprese edili e di servizi tecnici.",
    lead: "Questi termini regolano l'uso di CantiereOS da parte delle imprese clienti e dei loro utenti. Registrando un'azienda li accetti per conto dell'azienda che rappresenti. Il servizio è rivolto a imprese e professionisti, non a consumatori.",
    sections: [
      {
        id: "fornitore",
        title: "Chi fornisce il servizio",
        blocks: [`CantiereOS è fornito da ${OWNER}, ${OWNER_CONTACTS}.`],
      },
      {
        id: "servizio",
        title: "Il servizio",
        blocks: [
          'CantiereOS è un gestionale online per scadenze, moduli, documenti, attività, pagamenti e anagrafiche, accessibile dal browser del computer e del telefono. Le funzioni indicate come "in arrivo" non fanno parte del servizio finché non vengono rilasciate.',
          "Miglioriamo il servizio di continuo: possiamo aggiungere, modificare o sostituire funzioni, senza ridurre in modo sostanziale quelle del piano che hai scelto durante il periodo già pagato.",
        ],
      },
      {
        id: "account",
        title: "Account e sicurezza",
        blocks: [
          "Chi registra l'azienda ne diventa amministratore e decide chi invitare e con quale ruolo. Ogni utente deve usare un proprio account e custodire la propria password; ti consigliamo di attivare la verifica in due passaggi.",
          "Avvisaci subito se sospetti un accesso non autorizzato.",
        ],
      },
      {
        id: "prova",
        title: "Prova gratuita",
        blocks: [
          "Ogni nuova azienda può provare il servizio gratuitamente per 30 giorni con le funzioni del piano Impresa, senza inserire una carta di credito. Alla fine della prova potrai scegliere un piano; se non lo fai, l'accesso viene sospeso e i dati restano disponibili per l'esportazione per [[numero]] giorni.",
        ],
      },
      {
        id: "prezzi",
        title: "Piani, prezzi e pagamento",
        blocks: [
          "I piani e i prezzi in vigore sono quelli pubblicati nella pagina Prezzi e si intendono IVA esclusa. L'abbonamento può essere mensile o annuale e si rinnova automaticamente per lo stesso periodo, salvo disdetta prima del rinnovo.",
          "Le modalità di pagamento e di fatturazione saranno indicate al momento dell'attivazione del piano. Eventuali modifiche di prezzo saranno comunicate con almeno 30 giorni di anticipo e si applicheranno dal rinnovo successivo.",
        ],
      },
      {
        id: "dati",
        title: "I tuoi dati",
        blocks: [
          "I dati che inserisci restano dell'azienda cliente. Li trattiamo solo per fornire il servizio, come responsabile del trattamento, secondo l'informativa privacy e l'accordo sul trattamento dei dati.",
          "Puoi chiederci in qualsiasi momento una copia dei tuoi dati in un formato leggibile. Alla chiusura dell'account li cancelliamo nei tempi indicati nell'informativa privacy.",
        ],
      },
      {
        id: "uso",
        title: "Uso corretto",
        blocks: [
          "Non è consentito usare il servizio per attività illecite, caricare contenuti che violino diritti di altri, tentare di accedere ai dati di altre aziende o compromettere la sicurezza e il funzionamento del sistema. In questi casi possiamo sospendere l'account.",
        ],
      },
      {
        id: "disponibilita",
        title: "Disponibilità e responsabilità",
        blocks: [
          "Facciamo il possibile perché il servizio sia sempre disponibile, ma possono esserci interruzioni per manutenzione o per cause che non dipendono da noi. Le manutenzioni programmate saranno annunciate quando possibile.",
          "Nei limiti consentiti dalla legge, la nostra responsabilità per danni indiretti è esclusa e quella complessiva non supera quanto pagato dal cliente nei 12 mesi precedenti. Restano ferme le responsabilità per dolo o colpa grave.",
        ],
      },
      {
        id: "recesso",
        title: "Disdetta",
        blocks: [
          "Puoi disdire l'abbonamento in qualsiasi momento: il servizio resta attivo fino alla fine del periodo già pagato e non è previsto il rimborso dei periodi parziali.",
        ],
      },
      {
        id: "legge",
        title: "Legge applicabile e foro",
        blocks: [
          "Questi termini sono regolati dalla legge italiana. Per ogni controversia è competente in via esclusiva il foro di [[città del foro]].",
          "Possiamo aggiornare questi termini: le modifiche importanti saranno comunicate via email con almeno 30 giorni di anticipo.",
        ],
      },
    ],
  },

  "note-legali": {
    slug: "note-legali",
    eyebrow: "Note legali",
    title: "Chi c'è dietro CantiereOS",
    description: "Note legali e dati societari del sito CantiereOS.",
    lead: "Le informazioni sull'azienda che gestisce questo sito, come richiesto dal decreto legislativo 70/2003 sul commercio elettronico.",
    sections: [
      {
        id: "dati-societari",
        title: "Dati dell'azienda",
        blocks: [
          {
            table: {
              head: ["", ""],
              rows: [
                ["Ragione sociale", "[[ragione sociale]]"],
                ["Sede legale", "[[indirizzo della sede legale]]"],
                ["Partita IVA e codice fiscale", "[[partita IVA]]"],
                ["Iscrizione al Registro delle imprese", "[[REA e camera di commercio]]"],
                ["Capitale sociale", "[[capitale sociale, se società di capitali]]"],
                ["Email", "[[indirizzo email]]"],
                ["PEC", "[[indirizzo PEC]]"],
                ["WhatsApp", "+39 327 392 8101"],
              ],
            },
          },
        ],
      },
      {
        id: "proprieta",
        title: "Proprietà intellettuale",
        blocks: [
          "Il nome CantiereOS, il marchio, i testi, la grafica e il software di questo sito appartengono al titolare o sono usati con licenza. Non è consentito copiarli o riutilizzarli senza autorizzazione scritta.",
          "WhatsApp è un marchio di WhatsApp LLC ed è usato solo per indicare il canale di contatto.",
        ],
      },
      {
        id: "collegamenti",
        title: "Collegamenti esterni",
        blocks: [
          "Il sito contiene collegamenti a servizi di terzi, come WhatsApp. Non siamo responsabili dei loro contenuti né del modo in cui trattano i dati.",
        ],
      },
      {
        id: "realizzazione",
        title: "Realizzazione del sito",
        blocks: ["Progetto grafico e sviluppo del sito: Lume Studio."],
      },
    ],
  },
};

export const LEGAL_LINKS = [
  { href: "/privacy", label: "Privacy" },
  { href: "/cookie", label: "Cookie" },
  { href: "/termini", label: "Termini di servizio" },
  { href: "/note-legali", label: "Note legali" },
] as const;
