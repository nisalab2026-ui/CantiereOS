import { requirePermission, type TenantAccess } from "../auth/access";
import type { UserTx } from "../db/transaction";
import {
  listCustomers,
  listEmployees,
  listSuppliers,
  listTeams,
  type ListQuery,
} from "../directory/lists";
import { listActivity, type ActivityFilter } from "../history/history";
import {
  DEADLINE_KIND_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  EXPORT_SECTION_LABELS,
  PARTY_TYPE_LABELS,
} from "../history/labels";
import { DEADLINE_STATE_LABELS, listDeadlines, type DeadlineQuery } from "../operations/deadlines";
import {
  listTasks,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  type TaskQuery,
} from "../operations/tasks";
import {
  listPayments,
  PAYMENT_DIRECTION_LABELS,
  PAYMENT_METHOD_LABELS,
  type PaymentQuery,
} from "../operations/payments";
import {
  COMMUNICATION_CHANNEL_LABELS,
  COMMUNICATION_DIRECTION_LABELS,
  listCommunications,
  type CommunicationQuery,
} from "../operations/communications";
import { toCsv, type CsvColumn } from "./csv";
import {
  DOCUMENT_CATEGORY_LABELS,
  listDocuments,
  type DocumentQuery,
} from "../documents/documents";

/**
 * Esportazioni CSV delle liste e del registro attività. Stessi filtri e
 * permessi della pagina (le funzioni di lista controllano il permesso e il
 * database applica RLS); ogni esportazione è registrata in data_exports e
 * quindi nello storico.
 */
export const EXPORT_SECTIONS = [
  "customers",
  "suppliers",
  "employees",
  "teams",
  "deadlines",
  "audit",
  "documents",
  "tasks",
  "payments",
  "communications",
] as const;
export type ExportSection = (typeof EXPORT_SECTIONS)[number];

/** Limite di righe per singola esportazione (le liste più grandi vanno filtrate). */
export const EXPORT_MAX_ROWS = 10_000;

export const EXPORT_PERMISSION: Record<ExportSection, string> = {
  customers: "customers.read",
  suppliers: "suppliers.read",
  employees: "employees.read",
  teams: "teams.read",
  deadlines: "deadlines.read",
  audit: "audit.read",
  documents: "documents.read",
  tasks: "tasks.read",
  payments: "payments.read",
  communications: "communications.read",
};

const FILE_PREFIX: Record<ExportSection, string> = {
  customers: "clienti",
  suppliers: "fornitori",
  employees: "personale",
  teams: "squadre",
  deadlines: "scadenze",
  audit: "registro-attivita",
  documents: "documenti",
  tasks: "attivita",
  payments: "pagamenti",
  communications: "comunicazioni",
};

export interface ExportResult {
  filename: string;
  csv: string;
  rows: number;
  /** true se le righe erano più di EXPORT_MAX_ROWS e il file è stato troncato. */
  truncated: boolean;
}

type Params = Record<string, string | undefined>;

const str = (v: string | undefined, max = 100) => {
  const t = v?.trim();
  return t ? t.slice(0, max) : undefined;
};
const dir = (v: string | undefined) => (v === "desc" ? "desc" : v === "asc" ? "asc" : undefined);
const itDate = (iso: string | null | undefined) =>
  iso && /^\d{4}-\d{2}-\d{2}/.test(iso)
    ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
    : null;
const compact = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== ""));

function listQuery(p: Params): ListQuery {
  return compact({
    q: str(p.q),
    sort: str(p.sort, 20),
    dir: dir(p.dir),
    status: p.status === "inactive" || p.status === "active" ? p.status : undefined,
    type: str(p.type, 30),
  }) as ListQuery;
}

function stamp(now: Date) {
  const d = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(now);
  return d; // YYYY-MM-DD
}

export async function exportSection(
  tx: UserTx,
  access: TenantAccess,
  section: ExportSection,
  params: Params,
  now = new Date(),
): Promise<ExportResult> {
  requirePermission(access, EXPORT_PERMISSION[section]);
  const page = { page: 1, pageSize: EXPORT_MAX_ROWS };
  const opts = { maxPageSize: EXPORT_MAX_ROWS };
  let csv: string;
  let rows: number;
  let total: number;
  let filters: Record<string, unknown>;

  switch (section) {
    case "customers": {
      const q = listQuery(params);
      const r = await listCustomers(tx, access, { ...q, ...page }, opts);
      const cols: CsvColumn<(typeof r.rows)[number]>[] = [
        { header: "Codice", value: (x) => x.code },
        { header: "Nome", value: (x) => x.displayName },
        { header: "Tipo", value: (x) => PARTY_TYPE_LABELS[x.partyType] },
        { header: "Partita IVA", value: (x) => x.vatNumber },
        { header: "Città", value: (x) => x.city },
        { header: "Provincia", value: (x) => x.province },
        { header: "Email", value: (x) => x.email },
        { header: "Telefono", value: (x) => x.phone },
        { header: "Sedi", value: (x) => x.sites },
        { header: "Attivo", value: (x) => x.isActive },
      ];
      csv = toCsv(cols, r.rows);
      [rows, total, filters] = [r.rows.length, r.total, q as Record<string, unknown>];
      break;
    }
    case "suppliers": {
      const q = listQuery(params);
      const r = await listSuppliers(tx, access, { ...q, ...page }, opts);
      const cols: CsvColumn<(typeof r.rows)[number]>[] = [
        { header: "Codice", value: (x) => x.code },
        { header: "Nome", value: (x) => x.displayName },
        { header: "Categoria", value: (x) => x.category },
        { header: "Città", value: (x) => x.city },
        { header: "Provincia", value: (x) => x.province },
        { header: "Email", value: (x) => x.email },
        { header: "Telefono", value: (x) => x.phone },
        { header: "Attivo", value: (x) => x.isActive },
      ];
      csv = toCsv(cols, r.rows);
      [rows, total, filters] = [r.rows.length, r.total, q as Record<string, unknown>];
      break;
    }
    case "employees": {
      const q = listQuery(params);
      const r = await listEmployees(tx, access, { ...q, ...page }, opts);
      const cols: CsvColumn<(typeof r.rows)[number]>[] = [
        { header: "Matricola", value: (x) => x.code },
        { header: "Cognome", value: (x) => x.lastName },
        { header: "Nome", value: (x) => x.firstName },
        { header: "Mansione", value: (x) => x.jobTitle },
        { header: "Tipo di rapporto", value: (x) => EMPLOYMENT_TYPE_LABELS[x.employmentType] },
        { header: "Squadre", value: (x) => x.teams.join(", ") },
        { header: "Account", value: (x) => x.hasAccount },
        { header: "Attivo", value: (x) => x.isActive },
      ];
      csv = toCsv(cols, r.rows);
      [rows, total, filters] = [r.rows.length, r.total, q as Record<string, unknown>];
      break;
    }
    case "teams": {
      const q = listQuery(params);
      const r = await listTeams(tx, access, { ...q, ...page }, opts);
      const cols: CsvColumn<(typeof r.rows)[number]>[] = [
        { header: "Nome", value: (x) => x.name },
        { header: "Caposquadra", value: (x) => x.leader },
        { header: "Componenti", value: (x) => x.members },
        { header: "Attiva", value: (x) => x.isActive },
      ];
      csv = toCsv(cols, r.rows);
      [rows, total, filters] = [r.rows.length, r.total, q as Record<string, unknown>];
      break;
    }
    case "deadlines": {
      const q = compact({
        q: str(params.q),
        kind: str(params.kind, 30),
        state: str(params.state, 20) ?? "open",
        responsible:
          params.responsible === "me" || params.responsible === "none"
            ? params.responsible
            : undefined,
        from: str(params.from, 10),
        to: str(params.to, 10),
        sort: str(params.sort, 20),
        dir: dir(params.dir),
      }) as DeadlineQuery;
      const r = await listDeadlines(tx, access, { ...q, ...page }, opts);
      const cols: CsvColumn<(typeof r.rows)[number]>[] = [
        { header: "Scadenza", value: (x) => itDate(x.dueDate) },
        { header: "Titolo", value: (x) => x.title },
        { header: "Tipo", value: (x) => DEADLINE_KIND_LABELS[x.kind] ?? x.kind },
        { header: "Stato", value: (x) => DEADLINE_STATE_LABELS[x.state] },
        {
          header: "Giorni mancanti",
          value: (x) => (x.state === "done" || x.state === "cancelled" ? null : x.daysLeft),
        },
        { header: "Collegata a", value: (x) => x.subject?.name ?? null },
        { header: "Riferimento", value: (x) => x.referenceCode },
        { header: "Responsabile", value: (x) => x.responsibleName },
        { header: "Ricorrenza (mesi)", value: (x) => x.recurrenceMonths },
      ];
      csv = toCsv(cols, r.rows);
      [rows, total, filters] = [r.rows.length, r.total, q as Record<string, unknown>];
      break;
    }
    case "tasks": {
      const assignee = str(params.assignee, 40);
      const q = compact({
        q: str(params.q),
        state: str(params.state, 20) ?? "open",
        priority: str(params.priority, 20),
        assignee,
        sort: str(params.sort, 20),
        dir: dir(params.dir),
      }) as TaskQuery;
      const r = await listTasks(tx, access, { ...q, ...page }, opts);
      const cols: CsvColumn<(typeof r.rows)[number]>[] = [
        { header: "Entro il", value: (x) => itDate(x.dueDate) },
        { header: "Titolo", value: (x) => x.title },
        { header: "Stato", value: (x) => TASK_STATUS_LABELS[x.status] },
        { header: "Priorità", value: (x) => TASK_PRIORITY_LABELS[x.priority] },
        { header: "In ritardo", value: (x) => x.overdue },
        { header: "Assegnata a", value: (x) => x.assigneeName },
        { header: "Collegata a", value: (x) => x.subject?.name ?? null },
        { header: "Ultima modifica", value: (x) => x.updatedAt },
      ];
      csv = toCsv(cols, r.rows);
      [rows, total, filters] = [r.rows.length, r.total, q as Record<string, unknown>];
      break;
    }
    case "payments": {
      const q = compact({
        q: str(params.q),
        state: str(params.state, 20) ?? "open",
        direction: str(params.direction, 20),
        from: str(params.from, 10),
        to: str(params.to, 10),
        sort: str(params.sort, 20),
        dir: dir(params.dir),
      }) as PaymentQuery;
      const r = await listPayments(tx, access, { ...q, ...page }, opts);
      const euro = (c: number | null) =>
        c == null ? null : (c / 100).toFixed(2).replace(".", ",");
      const STATE: Record<string, string> = {
        open: "Aperto",
        overdue: "In ritardo",
        paid: "Pagato",
        cancelled: "Annullato",
      };
      const cols: CsvColumn<(typeof r.rows)[number]>[] = [
        { header: "Data prevista", value: (x) => itDate(x.dueDate) },
        { header: "Tipo", value: (x) => PAYMENT_DIRECTION_LABELS[x.direction] },
        { header: "Descrizione", value: (x) => x.description },
        { header: "Riferimento", value: (x) => x.referenceCode },
        { header: "Controparte", value: (x) => x.counterparty?.name ?? null },
        { header: "Importo (EUR)", value: (x) => euro(x.amountCents) },
        { header: "Stato", value: (x) => STATE[x.state] },
        { header: "Pagato il", value: (x) => itDate(x.paidOn) },
        { header: "Importo pagato (EUR)", value: (x) => euro(x.paidAmountCents) },
      ];
      csv = toCsv(cols, r.rows);
      [rows, total, filters] = [r.rows.length, r.total, q as Record<string, unknown>];
      break;
    }
    case "communications": {
      const q = compact({
        q: str(params.q),
        channel: str(params.channel, 20),
        direction: str(params.direction, 20),
        followUp: params.followUp === "pending" ? "pending" : undefined,
        from: str(params.from, 10),
        to: str(params.to, 10),
        dir: dir(params.dir),
      }) as CommunicationQuery;
      const r = await listCommunications(tx, access, { ...q, ...page }, opts);
      const cols: CsvColumn<(typeof r.rows)[number]>[] = [
        { header: "Data e ora", value: (x) => x.occurredAt },
        { header: "Canale", value: (x) => COMMUNICATION_CHANNEL_LABELS[x.channel] },
        { header: "Direzione", value: (x) => COMMUNICATION_DIRECTION_LABELS[x.direction] },
        { header: "Oggetto", value: (x) => x.subject },
        { header: "Con", value: (x) => x.related?.name ?? null },
        { header: "Referente", value: (x) => x.contactName },
        { header: "Richiamare il", value: (x) => itDate(x.followUpDate) },
        { header: "Richiamo fatto", value: (x) => (x.followUpDate ? x.followUpDone : null) },
        { header: "Registrata da", value: (x) => x.createdByName },
      ];
      csv = toCsv(cols, r.rows);
      [rows, total, filters] = [r.rows.length, r.total, q as Record<string, unknown>];
      break;
    }
    case "documents": {
      const q = compact({
        q: str(params.q),
        folder: str(params.folder, 40),
        category: str(params.category, 30),
        expiry: str(params.expiry, 20),
        sort: str(params.sort, 20),
        dir: dir(params.dir),
      }) as DocumentQuery;
      const r = await listDocuments(tx, access, { ...q, ...page }, opts);
      const cols: CsvColumn<(typeof r.rows)[number]>[] = [
        { header: "Titolo", value: (x) => x.title },
        { header: "Categoria", value: (x) => DOCUMENT_CATEGORY_LABELS[x.category] },
        { header: "Cartella", value: (x) => x.folderName },
        { header: "Collegato a", value: (x) => x.subject?.name ?? null },
        { header: "Scadenza", value: (x) => itDate(x.expiresOn) },
        { header: "File", value: (x) => x.fileName },
        {
          header: "Dimensione (KB)",
          value: (x) => (x.sizeBytes ? Math.ceil(x.sizeBytes / 1024) : null),
        },
        { header: "Versioni", value: (x) => x.versions },
        { header: "Riservato", value: (x) => x.isConfidential },
        { header: "Ultima modifica", value: (x) => x.updatedAt },
      ];
      csv = toCsv(cols, r.rows);
      [rows, total, filters] = [r.rows.length, r.total, q as Record<string, unknown>];
      break;
    }
    case "audit": {
      const verb = ["created", "updated", "deleted", "exported"].includes(params.operazione ?? "")
        ? (params.operazione as ActivityFilter["verb"])
        : undefined;
      const f = compact({
        table: str(params.sezione, 40),
        actorId: str(params.utente, 40),
        verb,
        from: str(params.from, 10),
        to: str(params.to, 10),
        q: str(params.q),
      }) as ActivityFilter;
      const r = await listActivity(
        tx,
        access,
        { ...f, limit: EXPORT_MAX_ROWS },
        { maxLimit: EXPORT_MAX_ROWS },
      );
      const cols: CsvColumn<(typeof r.events)[number]>[] = [
        { header: "Data e ora", value: (e) => e.at },
        { header: "Utente", value: (e) => e.actorName ?? "Sistema" },
        { header: "Operazione", value: (e) => VERB_LABELS[e.verb] },
        { header: "Sezione", value: (e) => e.tableLabel },
        { header: "Elemento", value: (e) => e.recordTitle },
        {
          header: "Modifiche",
          value: (e) =>
            e.changes
              .map((c) =>
                e.verb === "created" || e.verb === "exported"
                  ? `${c.label}: ${c.after ?? "vuoto"}`
                  : `${c.label}: ${c.before ?? "vuoto"} → ${c.after ?? "vuoto"}`,
              )
              .join(" | "),
        },
      ];
      csv = toCsv(cols, r.events);
      rows = r.events.length;
      total = r.nextCursor ? rows + 1 : rows;
      filters = f as Record<string, unknown>;
      break;
    }
  }

  await recordExport(tx, access, section, filters, rows);
  return {
    filename: `${FILE_PREFIX[section]}-${stamp(now)}.csv`,
    csv,
    rows,
    truncated: total > rows,
  };
}

const VERB_LABELS: Record<string, string> = {
  created: "Creazione",
  updated: "Modifica",
  deleted: "Eliminazione",
  archived: "Archiviazione",
  restored: "Riattivazione",
  completed: "Completamento",
  reopened: "Riapertura",
  cancelled: "Annullamento",
  exported: "Esportazione",
};

/** Registra l'esportazione (append-only, finisce nel registro attività). */
export async function recordExport(
  tx: UserTx,
  access: TenantAccess,
  section: ExportSection,
  filters: Record<string, unknown>,
  rowCount: number,
): Promise<void> {
  await tx.query(
    `insert into public.data_exports (tenant_id, section, format, filters, row_count)
     values ($1, $2, 'csv', $3::jsonb, $4)`,
    [access.tenantId, section, JSON.stringify(filters), rowCount],
  );
}

export const exportSectionLabel = (s: ExportSection) => EXPORT_SECTION_LABELS[s] ?? s;
