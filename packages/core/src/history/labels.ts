/**
 * Etichette italiane per lo storico: tabelle, campi e valori. Lo storico
 * mostra solo i campi elencati qui; i campi tecnici (id, tenant_id, token,
 * timestamp di sistema) non compaiono mai.
 */

export const TABLE_LABELS: Record<string, { one: string; section: string; href?: string }> = {
  customers: { one: "Cliente", section: "Clienti", href: "/app/clienti" },
  suppliers: { one: "Fornitore", section: "Fornitori", href: "/app/fornitori" },
  contacts: { one: "Contatto", section: "Contatti" },
  customer_sites: { one: "Sede cliente", section: "Sedi" },
  employees: { one: "Dipendente", section: "Personale", href: "/app/personale" },
  teams: { one: "Squadra", section: "Squadre", href: "/app/squadre" },
  team_members: { one: "Componente squadra", section: "Squadre" },
  deadlines: { one: "Scadenza", section: "Scadenze", href: "/app/scadenze" },
  memberships: { one: "Accesso utente", section: "Utenti e accessi", href: "/app/membri" },
  invitations: { one: "Invito", section: "Utenti e accessi", href: "/app/membri" },
  roles: { one: "Ruolo", section: "Ruoli" },
  role_permissions: { one: "Permesso del ruolo", section: "Ruoli" },
  tenants: { one: "Azienda", section: "Azienda" },
  tenant_settings: { one: "Impostazioni azienda", section: "Azienda" },
  subscriptions: { one: "Abbonamento", section: "Abbonamento" },
  notifications: { one: "Notifica", section: "Notifiche" },
  data_exports: { one: "Esportazione", section: "Esportazioni" },
  documents: { one: "Documento", section: "Documenti", href: "/app/documenti" },
  document_versions: { one: "File", section: "Documenti", href: "/app/documenti" },
  document_downloads: { one: "Documento", section: "Documenti", href: "/app/documenti" },
  document_folders: { one: "Cartella", section: "Documenti", href: "/app/documenti" },
  tasks: { one: "Attività", section: "Attività", href: "/app/attivita" },
  comments: { one: "Commento", section: "Commenti" },
  payments: { one: "Pagamento", section: "Pagamenti", href: "/app/pagamenti" },
  communications: { one: "Comunicazione", section: "Comunicazioni", href: "/app/comunicazioni" },
};

export const PAYMENT_DIRECTION_NAMES: Record<string, string> = {
  incoming: "Da incassare",
  outgoing: "Da pagare",
};
export const PAYMENT_STATUS_NAMES: Record<string, string> = {
  open: "Aperto",
  paid: "Pagato",
  cancelled: "Annullato",
};
export const PAYMENT_METHOD_NAMES: Record<string, string> = {
  bank_transfer: "Bonifico",
  riba: "Ri.Ba.",
  card: "Carta",
  cash: "Contanti",
  check: "Assegno",
  direct_debit: "Addebito diretto (SDD)",
  other: "Altro",
};
export const COMMUNICATION_CHANNEL_NAMES: Record<string, string> = {
  phone: "Telefonata",
  email: "Email",
  pec: "PEC",
  meeting: "Incontro",
  letter: "Lettera",
  message: "Messaggio",
  other: "Altro",
};

export const TASK_STATUS_NAMES: Record<string, string> = {
  todo: "Da fare",
  in_progress: "In corso",
  done: "Completata",
  cancelled: "Annullata",
};

export const TASK_PRIORITY_NAMES: Record<string, string> = {
  low: "Bassa",
  normal: "Normale",
  high: "Alta",
  urgent: "Urgente",
};

export const DOCUMENT_CATEGORY_NAMES: Record<string, string> = {
  contract: "Contratto",
  certificate: "Certificato",
  invoice: "Fattura o ricevuta",
  report: "Verbale o rapporto",
  photo: "Foto",
  identity: "Documento d'identità",
  safety: "Sicurezza",
  permit: "Permesso o autorizzazione",
  manual: "Manuale o scheda tecnica",
  other: "Altro",
};

/** Sezioni esportabili e loro nome nella UI. */
export const EXPORT_SECTION_LABELS: Record<string, string> = {
  customers: "Clienti",
  suppliers: "Fornitori",
  employees: "Personale",
  teams: "Squadre",
  deadlines: "Scadenze",
  audit: "Registro attività",
  documents: "Documenti",
  tasks: "Attività",
  payments: "Pagamenti",
  communications: "Comunicazioni",
};

type FieldKind =
  "text" | "date" | "datetime" | "bool" | "enum" | "ref" | "filters" | "bytes" | "cents";

interface FieldSpec {
  label: string;
  kind?: FieldKind;
  values?: Record<string, string>;
}

export const PARTY_TYPE_LABELS: Record<string, string> = {
  company: "Azienda",
  individual: "Privato",
  public_entity: "Ente pubblico",
};

export const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  employee: "Dipendente",
  contractor: "Collaboratore",
  temporary: "Interinale",
  intern: "Tirocinante",
};

export const DEADLINE_KIND_LABELS: Record<string, string> = {
  certification: "Certificazione",
  maintenance: "Manutenzione",
  inspection: "Controllo periodico",
  document: "Documento",
  payment: "Pagamento",
  contract: "Contratto",
  other: "Altro",
};

export const DEADLINE_STATUS_LABELS: Record<string, string> = {
  open: "Aperta",
  done: "Completata",
  cancelled: "Annullata",
};

const common: Record<string, FieldSpec> = {
  code: { label: "Codice" },
  display_name: { label: "Nome" },
  legal_name: { label: "Ragione sociale" },
  first_name: { label: "Nome" },
  last_name: { label: "Cognome" },
  vat_number: { label: "Partita IVA" },
  tax_code: { label: "Codice fiscale" },
  sdi_code: { label: "Codice SDI" },
  pec_email: { label: "PEC" },
  email: { label: "Email" },
  phone: { label: "Telefono" },
  mobile: { label: "Cellulare" },
  notes: { label: "Note" },
  is_active: { label: "Attivo", kind: "bool" },
  deleted_at: { label: "Eliminato il", kind: "datetime" },
  name: { label: "Nome" },
  description: { label: "Descrizione" },
};

export const FIELD_LABELS: Record<string, Record<string, FieldSpec>> = {
  customers: {
    ...common,
    party_type: { label: "Tipo", kind: "enum", values: PARTY_TYPE_LABELS },
    billing_address_line: { label: "Indirizzo" },
    billing_postal_code: { label: "CAP" },
    billing_city: { label: "Città" },
    billing_province: { label: "Provincia" },
    billing_country_code: { label: "Nazione" },
    payment_terms_days: { label: "Giorni di pagamento" },
  },
  suppliers: {
    ...common,
    category: { label: "Categoria" },
    iban: { label: "IBAN" },
    address_line: { label: "Indirizzo" },
    postal_code: { label: "CAP" },
    city: { label: "Città" },
    province: { label: "Provincia" },
    payment_terms_days: { label: "Giorni di pagamento" },
  },
  employees: {
    ...common,
    employee_code: { label: "Matricola" },
    job_title: { label: "Mansione" },
    employment_type: { label: "Tipo di rapporto", kind: "enum", values: EMPLOYMENT_TYPE_LABELS },
    hire_date: { label: "Data assunzione", kind: "date" },
    termination_date: { label: "Data cessazione", kind: "date" },
    user_id: { label: "Account collegato", kind: "ref" },
  },
  teams: {
    ...common,
    color: { label: "Colore" },
    leader_employee_id: { label: "Caposquadra", kind: "ref" },
  },
  deadlines: {
    title: { label: "Titolo" },
    description: { label: "Descrizione" },
    kind: { label: "Tipo", kind: "enum", values: DEADLINE_KIND_LABELS },
    reference_code: { label: "Riferimento" },
    due_date: { label: "Scadenza", kind: "date" },
    remind_days_before: { label: "Preavviso (giorni)" },
    recurrence_months: { label: "Ricorrenza (mesi)" },
    status: { label: "Stato", kind: "enum", values: DEADLINE_STATUS_LABELS },
    completion_notes: { label: "Note di completamento" },
    customer_id: { label: "Cliente", kind: "ref" },
    supplier_id: { label: "Fornitore", kind: "ref" },
    employee_id: { label: "Dipendente", kind: "ref" },
    team_id: { label: "Squadra", kind: "ref" },
    responsible_user_id: { label: "Responsabile", kind: "ref" },
    deleted_at: { label: "Eliminata il", kind: "datetime" },
  },
  contacts: {
    ...common,
    role_title: { label: "Ruolo" },
    is_primary: { label: "Principale", kind: "bool" },
  },
  customer_sites: {
    ...common,
    address_line: { label: "Indirizzo" },
    city: { label: "Città" },
    province: { label: "Provincia" },
    access_notes: { label: "Note di accesso" },
  },
  memberships: { status: { label: "Stato" }, role_id: { label: "Ruolo", kind: "ref" } },
  invitations: {
    email: { label: "Email" },
    revoked_at: { label: "Revocato il", kind: "datetime" },
    accepted_at: { label: "Accettato il", kind: "datetime" },
  },
  tenants: { name: { label: "Nome" }, status: { label: "Stato" } },
  tasks: {
    title: { label: "Titolo" },
    description: { label: "Descrizione" },
    status: { label: "Stato", kind: "enum", values: TASK_STATUS_NAMES },
    priority: { label: "Priorità", kind: "enum", values: TASK_PRIORITY_NAMES },
    due_date: { label: "Entro il", kind: "date" },
    assignee_user_id: { label: "Assegnata a", kind: "ref" },
    completion_notes: { label: "Note di completamento" },
    customer_id: { label: "Cliente", kind: "ref" },
    supplier_id: { label: "Fornitore", kind: "ref" },
    employee_id: { label: "Dipendente", kind: "ref" },
    team_id: { label: "Squadra", kind: "ref" },
    deleted_at: { label: "Eliminata il", kind: "datetime" },
  },
  payments: {
    direction: { label: "Tipo", kind: "enum", values: PAYMENT_DIRECTION_NAMES },
    description: { label: "Descrizione" },
    reference_code: { label: "Riferimento" },
    amount_cents: { label: "Importo", kind: "cents" },
    due_date: { label: "Data prevista", kind: "date" },
    status: { label: "Stato", kind: "enum", values: PAYMENT_STATUS_NAMES },
    paid_on: { label: "Pagato il", kind: "date" },
    paid_amount_cents: { label: "Importo pagato", kind: "cents" },
    method: { label: "Modalità", kind: "enum", values: PAYMENT_METHOD_NAMES },
    notes: { label: "Note" },
    customer_id: { label: "Cliente", kind: "ref" },
    supplier_id: { label: "Fornitore", kind: "ref" },
    deleted_at: { label: "Eliminato il", kind: "datetime" },
  },
  communications: {
    channel: { label: "Canale", kind: "enum", values: COMMUNICATION_CHANNEL_NAMES },
    direction: {
      label: "Direzione",
      kind: "enum",
      values: { inbound: "Ricevuta", outbound: "Inviata" },
    },
    occurred_at: { label: "Data e ora", kind: "datetime" },
    subject: { label: "Oggetto" },
    body: { label: "Testo" },
    contact_name: { label: "Referente" },
    customer_id: { label: "Cliente", kind: "ref" },
    supplier_id: { label: "Fornitore", kind: "ref" },
    employee_id: { label: "Dipendente", kind: "ref" },
    follow_up_date: { label: "Richiamare il", kind: "date" },
    follow_up_done: { label: "Richiamo fatto", kind: "bool" },
    deleted_at: { label: "Eliminata il", kind: "datetime" },
  },
  comments: {
    body: { label: "Testo" },
    deleted_at: { label: "Eliminato il", kind: "datetime" },
  },
  documents: {
    title: { label: "Titolo" },
    category: { label: "Categoria", kind: "enum", values: DOCUMENT_CATEGORY_NAMES },
    description: { label: "Descrizione" },
    is_confidential: { label: "Riservato", kind: "bool" },
    folder_id: { label: "Cartella", kind: "ref" },
    customer_id: { label: "Cliente", kind: "ref" },
    supplier_id: { label: "Fornitore", kind: "ref" },
    employee_id: { label: "Dipendente", kind: "ref" },
    team_id: { label: "Squadra", kind: "ref" },
    expires_on: { label: "Scadenza", kind: "date" },
    deleted_at: { label: "Eliminato il", kind: "datetime" },
  },
  document_versions: {
    original_name: { label: "File" },
    version_no: { label: "Versione" },
    size_bytes: { label: "Dimensione", kind: "bytes" },
    notes: { label: "Note" },
    reject_reason: { label: "Motivo del rifiuto" },
  },
  document_downloads: {
    document_id: { label: "Documento", kind: "ref" },
    disposition: {
      label: "Modalità",
      kind: "enum",
      values: { download: "Download", preview: "Anteprima" },
    },
  },
  document_folders: {
    name: { label: "Nome" },
    parent_id: { label: "Cartella superiore", kind: "ref" },
    deleted_at: { label: "Eliminata il", kind: "datetime" },
  },
  data_exports: {
    section: { label: "Sezione", kind: "enum", values: EXPORT_SECTION_LABELS },
    format: { label: "Formato", kind: "enum", values: { csv: "CSV" } },
    row_count: { label: "Righe esportate" },
    filters: { label: "Filtri", kind: "filters" },
  },
};

const dateFmt = new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeZone: "Europe/Rome" });
const dateTimeFmt = new Intl.DateTimeFormat("it-IT", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Rome",
});

const FILTER_KEY_LABELS: Record<string, string> = {
  q: "ricerca",
  sort: "ordine",
  dir: "direzione",
  status: "stato",
  type: "tipo",
  kind: "tipo",
  state: "stato",
  responsible: "responsabile",
  from: "dal",
  to: "al",
  table: "sezione",
  actorId: "utente",
  verb: "operazione",
};

const FILTER_VALUE_LABELS: Record<string, string> = {
  all: "tutte",
  open: "aperte",
  overdue: "in ritardo",
  due_soon: "in scadenza",
  done: "completate",
  cancelled: "annullate",
  active: "attivi",
  inactive: "archiviati",
  me: "io",
  none: "nessuno",
  asc: "crescente",
  desc: "decrescente",
  ...DEADLINE_KIND_LABELS,
  ...PARTY_TYPE_LABELS,
  ...EMPLOYMENT_TYPE_LABELS,
};

/** Valore leggibile di un campo dello storico; null = vuoto. */
export function formatFieldValue(table: string, field: string, value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const spec = FIELD_LABELS[table]?.[field];
  switch (spec?.kind) {
    case "bool":
      return value ? "Sì" : "No";
    case "date": {
      const d = new Date(`${String(value).slice(0, 10)}T12:00:00Z`);
      return Number.isNaN(d.getTime()) ? String(value) : dateFmt.format(d);
    }
    case "datetime": {
      const d = new Date(String(value));
      return Number.isNaN(d.getTime()) ? String(value) : dateTimeFmt.format(d);
    }
    case "enum":
      return spec.values?.[String(value)] ?? String(value);
    case "cents": {
      const n = Number(value);
      if (!Number.isFinite(n)) return String(value);
      return new Intl.NumberFormat("it-IT", {
        style: "currency",
        currency: "EUR",
        useGrouping: "always",
      }).format(n / 100);
    }
    case "bytes": {
      const n = Number(value);
      if (!Number.isFinite(n)) return String(value);
      return n < 1024 * 1024
        ? `${Math.max(1, Math.round(n / 1024))} KB`
        : `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
    }
    case "filters": {
      if (typeof value !== "object") return String(value);
      const parts = Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== null && v !== undefined && v !== "")
        .map(
          ([k, v]) =>
            `${FILTER_KEY_LABELS[k] ?? k}: ${FILTER_VALUE_LABELS[String(v)] ?? String(v)}`,
        );
      return parts.length ? parts.join(", ") : "nessuno";
    }
    default:
      return typeof value === "object" ? JSON.stringify(value) : String(value);
  }
}

export function fieldLabel(table: string, field: string): string | null {
  return FIELD_LABELS[table]?.[field]?.label ?? null;
}

export function isReferenceField(table: string, field: string): boolean {
  return FIELD_LABELS[table]?.[field]?.kind === "ref";
}

/** Nome leggibile di un record a partire dai dati salvati nello storico. */
export function recordTitle(table: string, data: Record<string, unknown> | null): string | null {
  if (!data) return null;
  const pick = (...keys: string[]) =>
    keys
      .map((k) => data[k])
      .filter((v) => typeof v === "string" && v.length > 0)
      .join(" ") || null;
  switch (table) {
    case "customers":
    case "suppliers":
      return pick("display_name");
    case "employees":
    case "contacts":
      return pick("first_name", "last_name");
    case "deadlines":
    case "tasks":
      return pick("title");
    case "payments":
      return pick("description");
    case "communications":
      return pick("subject");
    case "comments": {
      const body = typeof data.body === "string" ? data.body : "";
      return body.length > 60 ? `${body.slice(0, 57)}…` : body || null;
    }
    case "invitations":
      return pick("email");
    case "documents":
      return pick("title");
    case "document_versions":
      return pick("original_name");
    case "document_folders":
      return pick("name");
    case "data_exports": {
      const label = EXPORT_SECTION_LABELS[String(data.section)] ?? String(data.section ?? "");
      if (data.row_count == null) return label;
      const n = Number(data.row_count);
      return `${label} (${n} ${n === 1 ? "riga" : "righe"})`;
    }
    default:
      return pick("name", "display_name", "title");
  }
}
