import type { FormCategory, FormDefinition } from "./form-definition";

/**
 * Modelli pronti (ADR-013): punti di partenza nel codice, non dati nel database.
 * "Usa questo modello" ne crea una copia modificabile nell'azienda.
 */
export interface FormLibraryEntry {
  key: string;
  name: string;
  category: FormCategory;
  description: string;
  definition: FormDefinition;
}

const DOCS = [
  "Elaborato grafico rappresentativo del sistema",
  "Relazione tecnica generale",
  "Relazione di calcolo strutturale",
  "Documentazione fotografica",
  "Dichiarazione di corretta posa del sistema",
  "Manuali di installazione, uso e manutenzione degli ancoraggi",
  "Dichiarazione di conformità/rispondenza degli ancoraggi",
  "Indicazione d'uso dei DPI da utilizzare",
  "Programma di manutenzione del sistema",
  "Registro delle ispezioni/manutenzioni del sistema",
  "Registro degli accessi al sistema",
];

const ANCHOR_CHECKS = [
  "Impermeabilizzazione",
  "Usura",
  "Ossidazione/corrosione",
  "Deformazioni dei componenti",
  "Deformazioni anomale della fune",
  "Tensionamento della fune",
  "Serraggio dei dadi e dei bulloni dei dispositivi a vista",
  "Stato delle eventuali parti mobili",
  "Pulizia",
];

/** Ispezione linea vita secondo UNI 11560:2022, Appendice C (dal modulo cartaceo del titolare). */
const LIFELINE: FormLibraryEntry = {
  key: "linea-vita-uni-11560",
  name: "Ispezione linea vita",
  category: "inspection",
  description:
    "Ispezione dei sistemi di ancoraggio secondo la norma UNI 11560:2022, Appendice C. Committente, sito e installatore arrivano dall'anagrafica; la data dell'ultima ispezione dall'ispezione precedente dello stesso impianto.",
  definition: {
    sections: [
      {
        id: "dati_generali",
        title: "Dati generali",
        description: "Compilati in automatico da cliente, sede e azienda.",
        fields: [
          { id: "committente", type: "auto", label: "Committente", source: "customer.name" },
          {
            id: "committente_indirizzo",
            type: "auto",
            label: "Indirizzo del committente",
            source: "customer.address",
          },
          {
            id: "sito",
            type: "auto",
            label: "Sito di installazione",
            source: "site.address",
          },
          {
            id: "installatore",
            type: "auto",
            label: "Installatore / tecnico abilitato",
            source: "company.name",
          },
        ],
      },
      {
        id: "installazione",
        title: "Identificazione dell'installazione",
        fields: [
          {
            id: "n_impianto",
            type: "text",
            label: "N. impianto",
            required: true,
            isSubjectCode: true,
            help: "Serve a ritrovare l'ispezione precedente dello stesso impianto.",
          },
          { id: "data_installazione", type: "date", label: "Data installazione" },
          {
            id: "data_ultima_ispezione",
            type: "auto",
            label: "Data ultima ispezione",
            source: "previous.completed_on",
          },
        ],
      },
      {
        id: "tipologia",
        title: "Tipologia di ispezione",
        fields: [
          {
            id: "tipologia",
            type: "choice",
            label: "Tipologia di ispezione",
            required: true,
            multiple: true,
            options: [
              "Ispezione al montaggio (IM)",
              "Ispezione prima dell'uso (IU)",
              "Ispezione periodica (IP)",
              "Ispezione straordinaria (IS)",
            ],
          },
        ],
      },
      {
        id: "documentazione",
        title: "Controlli sulla documentazione",
        description:
          "Presenza obbligatoria per IM, IP e IS. Per l'ispezione prima dell'uso (IU) sono facoltativi: relazione tecnica, relazione di calcolo, documentazione fotografica, dichiarazione di conformità e programma di manutenzione.",
        fields: [
          {
            id: "documenti",
            type: "checklist",
            label: "Documento presente",
            required: true,
            rows: DOCS,
            options: ["Sì", "No"],
            withNote: true,
          },
        ],
      },
      {
        id: "ancoraggio",
        title: "Controlli sul sistema di ancoraggio",
        fields: [
          {
            id: "tipo_controllo",
            type: "choice",
            label: "Tipo di controllo dei dispositivi",
            required: true,
            multiple: true,
            options: ["Visivo", "Funzionale", "Strumentale"],
          },
          {
            id: "controlli",
            type: "checklist",
            label: "Esito dei controlli",
            required: true,
            rows: ANCHOR_CHECKS,
            options: ["Positivo", "Negativo"],
            withNote: true,
          },
          { id: "note", type: "textarea", label: "Note / osservazioni" },
        ],
      },
      {
        id: "esito",
        title: "Esito e firme",
        description: "Sezione finale standard: modificala dall'editor se il tuo modulo è diverso.",
        fields: [
          {
            id: "esito_finale",
            type: "choice",
            label: "Esito dell'ispezione",
            required: true,
            options: [
              "Sistema idoneo all'uso",
              "Idoneo con prescrizioni",
              "Non idoneo: interdire l'accesso",
            ],
          },
          { id: "prossima_ispezione", type: "date", label: "Prossima ispezione entro" },
          { id: "tecnico", type: "auto", label: "Tecnico", source: "user.name" },
          { id: "data_ispezione", type: "auto", label: "Data", source: "today" },
          { id: "firma_tecnico", type: "signature", label: "Firma del tecnico", required: true },
          { id: "firma_committente", type: "signature", label: "Firma del committente" },
        ],
      },
    ],
  },
};

export const FORM_LIBRARY: readonly FormLibraryEntry[] = [LIFELINE];

export const findLibraryEntry = (key: string) => FORM_LIBRARY.find((e) => e.key === key) ?? null;
