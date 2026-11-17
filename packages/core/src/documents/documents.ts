import { z } from "zod";
import { hasPermission, requirePermission, type TenantAccess } from "../auth/access";
import { AuthError, pgCode } from "../auth/errors";
import type { UserTx } from "../db/transaction";
import type { ListOptions, Page } from "../directory/lists";
import { createDeadline, type SubjectType } from "../operations/deadlines";
import { optional, parseInput, ValidationError } from "../validation";
import { likePattern } from "../workspace/search";
import {
  ALLOWED_EXTENSIONS,
  detectFileType,
  extensionOf,
  MAX_FILE_BYTES,
  type FileStorage,
} from "./storage";

/**
 * Archivio documentale (ADR-009): cartelle, schede, versioni con file su
 * storage privato. Il browser non sceglie mai chiavi né aziende: le decide il
 * database; i file si caricano e scaricano con URL firmati di breve durata.
 */
export const DOCUMENT_CATEGORIES = [
  "contract",
  "certificate",
  "invoice",
  "report",
  "photo",
  "identity",
  "safety",
  "permit",
  "manual",
  "other",
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  contract: "Contratto",
  certificate: "Certificato",
  invoice: "Fattura o ricevuta",
  report: "Verbale o rapporto",
  photo: "Foto",
  identity: "Documento d'identità",
  safety: "Sicurezza (DVR, POS, DURC)",
  permit: "Permesso o autorizzazione",
  manual: "Manuale o scheda tecnica",
  other: "Altro",
};

/** Validità dei link di download/anteprima. */
export const DOWNLOAD_URL_SECONDS = 300;

const isUuid = (v: unknown): v is string => z.uuid().safeParse(v).success;
/** Casella di spunta dei moduli: "on"/"true"/true = sì, tutto il resto = no. */
const checkbox = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => v === true || v === "on" || v === "true");
const STALE = "Questo documento è stato modificato da un altro utente. Ricarica la pagina.";

function forbiddenOr(error: unknown): never {
  const code = pgCode(error);
  if (code === "42501") throw new AuthError("FORBIDDEN", "permesso mancante", { cause: error });
  if (code === "23503") throw new ValidationError({ subjectId: "Elemento collegato non trovato" });
  if (code === "23505")
    throw new ValidationError({ name: "Esiste già una cartella con questo nome" });
  if (code === "23514")
    throw new ValidationError({ form: (error as Error).message || "Dati non validi" });
  throw error;
}

// --- Cartelle -------------------------------------------------------------------

export interface FolderRow {
  id: string;
  parentId: string | null;
  name: string;
  documents: number;
}

export async function listFolders(tx: UserTx, access: TenantAccess): Promise<FolderRow[]> {
  requirePermission(access, "documents.read");
  const { rows } = await tx.query<FolderRow>(
    `select f.id, f.parent_id as "parentId", f.name,
            (select count(*)::int from public.documents d
              where d.tenant_id = f.tenant_id and d.folder_id = f.id and d.deleted_at is null) as documents
       from public.document_folders f
      where f.tenant_id = $1 and f.deleted_at is null
      order by lower(f.name)`,
    [access.tenantId],
  );
  return rows;
}

/** Percorso dalla radice alla cartella (per breadcrumb). */
export function folderPath(folders: FolderRow[], id: string | null | undefined): FolderRow[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const path: FolderRow[] = [];
  let cur = id ? byId.get(id) : undefined;
  while (cur && path.length < 25) {
    path.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return path;
}

const folderInput = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Inserisci un nome")
    .max(120, "Massimo 120 caratteri")
    .regex(/^[^/\\]+$/, "Il nome non può contenere / o \\"),
  parentId: optional(z.uuid("Cartella non valida")),
});

export async function createFolder(
  tx: UserTx,
  access: TenantAccess,
  input: z.input<typeof folderInput>,
): Promise<{ id: string }> {
  requirePermission(access, "documents.write");
  const d = parseInput(folderInput, input);
  await tx.query("savepoint create_folder");
  try {
    const { rows } = await tx.query<{ id: string }>(
      "insert into public.document_folders (tenant_id, parent_id, name) values ($1, $2, $3) returning id",
      [access.tenantId, d.parentId ?? null, d.name],
    );
    return { id: rows[0]!.id };
  } catch (error) {
    await tx.query("rollback to savepoint create_folder");
    forbiddenOr(error);
  }
}

export async function renameFolder(
  tx: UserTx,
  access: TenantAccess,
  id: string,
  name: string,
): Promise<void> {
  requirePermission(access, "documents.write");
  const d = parseInput(folderInput, { name });
  if (!isUuid(id)) throw new ValidationError({ form: "Cartella non trovata" });
  await tx.query("savepoint rename_folder");
  try {
    const { rowCount } = await tx.query(
      "update public.document_folders set name = $3 where tenant_id = $1 and id = $2 and deleted_at is null",
      [access.tenantId, id, d.name],
    );
    if (rowCount === 0) throw new ValidationError({ form: "Cartella non trovata" });
  } catch (error) {
    await tx.query("rollback to savepoint rename_folder");
    if (error instanceof ValidationError) throw error;
    forbiddenOr(error);
  }
}

/** Elimina (logicamente) una cartella vuota. */
export async function deleteFolder(tx: UserTx, access: TenantAccess, id: string): Promise<void> {
  requirePermission(access, "documents.delete");
  if (!isUuid(id)) throw new ValidationError({ form: "Cartella non trovata" });
  const { rows } = await tx.query<{ n: number }>(
    `select (select count(*)::int from public.documents where tenant_id = $1 and folder_id = $2 and deleted_at is null)
          + (select count(*)::int from public.document_folders where tenant_id = $1 and parent_id = $2 and deleted_at is null) as n`,
    [access.tenantId, id],
  );
  if ((rows[0]?.n ?? 0) > 0) {
    throw new ValidationError({
      form: "La cartella non è vuota: sposta o elimina prima documenti e sottocartelle.",
    });
  }
  const { rowCount } = await tx.query(
    "update public.document_folders set deleted_at = now() where tenant_id = $1 and id = $2 and deleted_at is null",
    [access.tenantId, id],
  );
  if (rowCount === 0) throw new ValidationError({ form: "Cartella non trovata" });
}

// --- Elenco e scheda ------------------------------------------------------------

export interface DocumentSubject {
  type: SubjectType;
  id: string;
  name: string;
}

export interface DocumentRow {
  id: string;
  title: string;
  category: DocumentCategory;
  isConfidential: boolean;
  folderId: string | null;
  folderName: string | null;
  subject: DocumentSubject | null;
  expiresOn: string | null;
  /** expired | expiring (entro 30 giorni) | valid | null */
  expiry: "expired" | "expiring" | "valid" | null;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  versions: number;
  currentVersionId: string | null;
  updatedAt: Date;
  createdByName: string | null;
}

const SELECT = `
  x.id, x.title, x.category, x.is_confidential as "isConfidential",
  x.folder_id as "folderId", f.name as "folderName",
  case when x.customer_id is not null then json_build_object('type','customer','id',x.customer_id,'name',c.display_name)
       when x.supplier_id is not null then json_build_object('type','supplier','id',x.supplier_id,'name',s.display_name)
       when x.employee_id is not null then json_build_object('type','employee','id',x.employee_id,'name',concat_ws(' ', e.first_name, e.last_name))
       when x.team_id is not null then json_build_object('type','team','id',x.team_id,'name',t.name)
  end as subject,
  to_char(x.expires_on, 'YYYY-MM-DD') as "expiresOn",
  case when x.expires_on is null then null
       when x.expires_on < current_date then 'expired'
       when x.expires_on <= current_date + 30 then 'expiring'
       else 'valid' end as expiry,
  v.original_name as "fileName", v.mime_type as "mimeType", v.size_bytes::int as "sizeBytes",
  (select count(*)::int from public.document_versions vv
    where vv.tenant_id = x.tenant_id and vv.document_id = x.id and vv.status = 'ready') as versions,
  x.current_version_id as "currentVersionId",
  x.updated_at as "updatedAt",
  coalesce(cu.full_name, cu.email) as "createdByName"`;

const FROM = `
  public.documents x
  left join public.document_folders f on f.tenant_id = x.tenant_id and f.id = x.folder_id
  left join public.document_versions v on v.tenant_id = x.tenant_id and v.id = x.current_version_id
  left join public.customers c on c.tenant_id = x.tenant_id and c.id = x.customer_id
  left join public.suppliers s on s.tenant_id = x.tenant_id and s.id = x.supplier_id
  left join public.employees e on e.tenant_id = x.tenant_id and e.id = x.employee_id
  left join public.teams t on t.tenant_id = x.tenant_id and t.id = x.team_id
  left join public.users cu on cu.id = x.created_by`;

export interface DocumentQuery {
  q?: string;
  /** "root" = solo documenti senza cartella; uuid = quella cartella; assente = tutti */
  folder?: string;
  category?: string;
  /** expired | expiring | none */
  expiry?: string;
  customerId?: string;
  supplierId?: string;
  employeeId?: string;
  teamId?: string;
  sort?: string;
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export const DOCUMENT_SORTS = ["updated", "title", "expires", "category"] as const;
const SORTS: Record<string, string> = {
  updated: "x.updated_at",
  title: "lower(x.title)",
  expires: "x.expires_on",
  category: "x.category",
};

export async function listDocuments(
  tx: UserTx,
  access: TenantAccess,
  q: DocumentQuery,
  opts: ListOptions = {},
): Promise<Page<DocumentRow>> {
  requirePermission(access, "documents.read");
  const pageSize = Math.min(Math.max(q.pageSize ?? 25, 1), opts.maxPageSize ?? 100);
  const page = Math.min(Math.max(q.page ?? 1, 1), 10_000);
  const params: unknown[] = [access.tenantId];
  const where = ["x.tenant_id = $1", "x.deleted_at is null"];
  if (q.folder === "root") where.push("x.folder_id is null");
  else if (isUuid(q.folder)) {
    params.push(q.folder);
    where.push(`x.folder_id = $${params.length}`);
  }
  if (q.category && (DOCUMENT_CATEGORIES as readonly string[]).includes(q.category)) {
    params.push(q.category);
    where.push(`x.category = $${params.length}`);
  }
  if (q.expiry === "expired") where.push("x.expires_on < current_date");
  if (q.expiry === "expiring")
    where.push("x.expires_on >= current_date and x.expires_on <= current_date + 30");
  if (q.expiry === "none") where.push("x.expires_on is null");
  for (const [key, col] of [
    ["customerId", "customer_id"],
    ["supplierId", "supplier_id"],
    ["employeeId", "employee_id"],
    ["teamId", "team_id"],
  ] as const) {
    const v = q[key];
    if (isUuid(v)) {
      params.push(v);
      where.push(`x.${col} = $${params.length}`);
    }
  }
  const term = (q.q ?? "").trim().slice(0, 100);
  if (term) {
    params.push(likePattern(term.toLowerCase()));
    where.push(
      `(lower(concat_ws(' ', x.title, x.description, c.display_name, s.display_name, e.first_name, e.last_name, t.name)) like $${params.length}
        or exists (select 1 from public.document_versions sv where sv.tenant_id = x.tenant_id
                     and sv.document_id = x.id and lower(sv.original_name) like $${params.length}))`,
    );
  }
  const sort = SORTS[q.sort ?? ""] ?? SORTS.updated!;
  const dir = q.dir === "asc" ? "asc" : q.dir === "desc" ? "desc" : q.sort ? "asc" : "desc";
  params.push(pageSize, (page - 1) * pageSize);
  const { rows } = await tx.query<DocumentRow & { __total: number }>(
    `select ${SELECT}, count(*) over ()::int as "__total"
       from ${FROM}
      where ${where.join(" and ")}
      order by ${sort} ${dir} nulls last, x.id
      limit $${params.length - 1} offset $${params.length}`,
    params,
  );
  return {
    rows: rows.map(({ __total: _, ...r }) => r as DocumentRow),
    total: rows[0]?.__total ?? 0,
    page,
    pageSize,
  };
}

export interface DocumentVersionRow {
  id: string;
  versionNo: number;
  originalName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  status: "pending" | "ready" | "rejected";
  rejectReason: string | null;
  notes: string | null;
  createdAt: Date;
  createdByName: string | null;
}

export interface DocumentDetail extends DocumentRow {
  description: string | null;
  deadlineId: string | null;
  deadlineDue: string | null;
  createdAt: Date;
  versionList: DocumentVersionRow[];
}

export async function getDocument(
  tx: UserTx,
  access: TenantAccess,
  id: string,
): Promise<DocumentDetail | null> {
  requirePermission(access, "documents.read");
  if (!isUuid(id)) return null;
  const { rows } = await tx.query<DocumentDetail>(
    `select ${SELECT}, x.description, x.deadline_id as "deadlineId",
            to_char(dl.due_date, 'YYYY-MM-DD') as "deadlineDue", x.created_at as "createdAt"
       from ${FROM}
       left join public.deadlines dl on dl.tenant_id = x.tenant_id and dl.id = x.deadline_id and dl.deleted_at is null
      where x.tenant_id = $1 and x.id = $2 and x.deleted_at is null`,
    [access.tenantId, id],
  );
  const doc = rows[0];
  if (!doc) return null;
  const { rows: versions } = await tx.query<DocumentVersionRow>(
    `select v.id, v.version_no as "versionNo", v.original_name as "originalName", v.mime_type as "mimeType",
            v.size_bytes::int as "sizeBytes", v.status, v.reject_reason as "rejectReason", v.notes,
            v.created_at as "createdAt", coalesce(u.full_name, u.email) as "createdByName"
       from public.document_versions v
       left join public.users u on u.id = v.created_by
      where v.tenant_id = $1 and v.document_id = $2 and v.status <> 'pending'
      order by v.version_no desc`,
    [access.tenantId, id],
  );
  return { ...doc, versionList: versions };
}

// --- Caricamento ----------------------------------------------------------------

const subjectTypes = ["customer", "supplier", "employee", "team"] as const;

export const documentInput = z
  .object({
    title: z.string().trim().min(1, "Inserisci un titolo").max(200, "Massimo 200 caratteri"),
    category: z.enum(DOCUMENT_CATEGORIES, "Scegli la categoria").default("other"),
    description: optional(z.string().trim().max(4000)),
    folderId: optional(z.uuid("Cartella non valida")),
    subjectType: optional(z.enum(subjectTypes)),
    subjectId: optional(z.uuid("Scegli un elemento valido")),
    isConfidential: checkbox,
    expiresOn: optional(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida")),
    /** Crea un promemoria nello scadenziario alla data di scadenza. */
    createDeadline: checkbox,
  })
  .refine((d) => !d.subjectType === !d.subjectId, {
    message: "Scegli l'elemento da collegare",
    path: ["subjectId"],
  })
  .refine((d) => !d.createDeadline || !!d.expiresOn, {
    message: "Per creare il promemoria indica la data di scadenza",
    path: ["expiresOn"],
  });
export type DocumentInput = z.input<typeof documentInput>;

export const fileInput = z.object({
  name: z.string().trim().min(1, "File senza nome").max(255, "Nome del file troppo lungo"),
  size: z.coerce
    .number()
    .int()
    .min(1, "Il file è vuoto")
    .max(MAX_FILE_BYTES, "Il file supera i 25 MB"),
  type: optional(z.string().max(120)),
});
export type FileInput = z.input<typeof fileInput>;

function subjectColumns(d: { subjectType?: string | undefined; subjectId?: string | undefined }) {
  return {
    customer_id: d.subjectType === "customer" ? d.subjectId! : null,
    supplier_id: d.subjectType === "supplier" ? d.subjectId! : null,
    employee_id: d.subjectType === "employee" ? d.subjectId! : null,
    team_id: d.subjectType === "team" ? d.subjectId! : null,
  };
}

function checkFile(f: z.output<typeof fileInput>) {
  if (!ALLOWED_EXTENSIONS[extensionOf(f.name)]) {
    throw new ValidationError({
      file: `Tipo di file non ammesso. Ammessi: ${Object.keys(ALLOWED_EXTENSIONS).join(", ")}.`,
    });
  }
}

export interface UploadTicket {
  documentId: string;
  versionId: string;
  uploadUrl: string;
  contentType: string;
}

async function newVersion(
  tx: UserTx,
  access: TenantAccess,
  storage: FileStorage,
  documentId: string,
  f: z.output<typeof fileInput>,
  notes?: string,
): Promise<UploadTicket> {
  const { rows } = await tx.query<{ id: string; storage_key: string }>(
    `insert into public.document_versions (tenant_id, document_id, original_name, declared_type, notes)
     values ($1, $2, $3, $4, $5) returning id, storage_key`,
    [access.tenantId, documentId, f.name, f.type ?? null, notes ?? null],
  );
  const v = rows[0]!;
  return {
    documentId,
    versionId: v.id,
    uploadUrl: await storage.createUploadUrl(v.storage_key),
    contentType: ALLOWED_EXTENSIONS[extensionOf(f.name)]!,
  };
}

/**
 * Primo passo del caricamento di un nuovo documento: scheda + versione in
 * attesa + URL firmato per inviare il file direttamente allo storage.
 */
export async function startDocumentUpload(
  tx: UserTx,
  access: TenantAccess,
  storage: FileStorage,
  input: DocumentInput,
  file: FileInput,
): Promise<UploadTicket> {
  requirePermission(access, "documents.write");
  const d = parseInput(documentInput, input);
  const f = parseInput(fileInput, file);
  checkFile(f);
  if (d.isConfidential && !hasPermission(access, "documents.confidential")) {
    throw new ValidationError({
      isConfidential: "Non hai il permesso di caricare documenti riservati",
    });
  }
  if (d.createDeadline && !hasPermission(access, "deadlines.write")) {
    throw new ValidationError({
      createDeadline: "Non hai il permesso di creare scadenze",
    });
  }
  const s = subjectColumns(d);
  await tx.query("savepoint start_upload");
  let documentId: string;
  try {
    const { rows } = await tx.query<{ id: string }>(
      `insert into public.documents
         (tenant_id, folder_id, title, category, description, is_confidential,
          customer_id, supplier_id, employee_id, team_id, expires_on)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::date) returning id`,
      [
        access.tenantId,
        d.folderId ?? null,
        d.title,
        d.category,
        d.description ?? null,
        d.isConfidential,
        s.customer_id,
        s.supplier_id,
        s.employee_id,
        s.team_id,
        d.expiresOn ?? null,
      ],
    );
    documentId = rows[0]!.id;
  } catch (error) {
    await tx.query("rollback to savepoint start_upload");
    forbiddenOr(error);
  }
  if (d.createDeadline && d.expiresOn) {
    const { id: deadlineId } = await createDeadline(tx, access, {
      kind: "document",
      title: `Scadenza documento: ${d.title}`.slice(0, 200),
      dueDate: d.expiresOn,
      remindDaysBefore: 30,
      ...(d.subjectType ? { subjectType: d.subjectType, subjectId: d.subjectId } : {}),
    });
    await tx.query(
      "update public.documents set deadline_id = $3 where tenant_id = $1 and id = $2",
      [access.tenantId, documentId, deadlineId],
    );
  }
  return newVersion(tx, access, storage, documentId, f);
}

/** Nuova versione di un documento esistente. */
export async function startVersionUpload(
  tx: UserTx,
  access: TenantAccess,
  storage: FileStorage,
  documentId: string,
  file: FileInput,
  notes?: string,
): Promise<UploadTicket> {
  requirePermission(access, "documents.write");
  if (!isUuid(documentId)) throw new ValidationError({ form: "Documento non trovato" });
  const f = parseInput(fileInput, file);
  checkFile(f);
  const n = notes?.trim().slice(0, 2000);
  await tx.query("savepoint start_version");
  try {
    return await newVersion(tx, access, storage, documentId, f, n || undefined);
  } catch (error) {
    await tx.query("rollback to savepoint start_version");
    if (pgCode(error) === "42501") throw new ValidationError({ form: "Documento non trovato" });
    throw error;
  }
}

export type UploadOutcome =
  | { ok: true; documentId: string; versionNo: number }
  | { ok: false; documentId: string; reason: string };

/**
 * Secondo passo: verifica il file arrivato nello storage (dimensione e tipo
 * reale). Solo un file verificato diventa la versione corrente; altrimenti
 * viene cancellato e la versione resta "rifiutata" nello storico.
 */
export async function finishUpload(
  tx: UserTx,
  access: TenantAccess,
  storage: FileStorage,
  versionId: string,
): Promise<UploadOutcome> {
  requirePermission(access, "documents.write");
  if (!isUuid(versionId)) throw new ValidationError({ form: "Caricamento non trovato" });
  const { rows } = await tx.query<{
    document_id: string;
    original_name: string;
    storage_key: string;
    version_no: number;
    status: string;
  }>(
    `select document_id, original_name, storage_key, version_no, status
       from public.document_versions
      where tenant_id = $1 and id = $2 and created_by = auth.uid()
      for update`,
    [access.tenantId, versionId],
  );
  const v = rows[0];
  if (!v) throw new ValidationError({ form: "Caricamento non trovato" });
  if (v.status === "ready") return { ok: true, documentId: v.document_id, versionNo: v.version_no };
  if (v.status === "rejected") {
    return { ok: false, documentId: v.document_id, reason: "File già rifiutato" };
  }

  const reject = async (reason: string): Promise<UploadOutcome> => {
    await storage.remove(v.storage_key).catch(() => undefined);
    await tx.query(
      "update public.document_versions set status = 'rejected', reject_reason = $3 where tenant_id = $1 and id = $2",
      [access.tenantId, versionId, reason],
    );
    return { ok: false, documentId: v.document_id, reason };
  };

  const info = await storage.info(v.storage_key);
  if (!info) return reject("Il file non è arrivato: riprova il caricamento.");
  if (info.size < 1) return reject("Il file è vuoto.");
  if (info.size > MAX_FILE_BYTES) return reject("Il file supera i 25 MB.");
  const head = await storage.readHead(v.storage_key, Math.min(64, info.size));
  const mime = detectFileType(v.original_name, head);
  if (!mime) {
    return reject("Il contenuto del file non corrisponde al tipo dichiarato o non è ammesso.");
  }
  await tx.query(
    `update public.document_versions set status = 'ready', mime_type = $3, size_bytes = $4
      where tenant_id = $1 and id = $2`,
    [access.tenantId, versionId, mime, info.size],
  );
  await tx.query(
    "update public.documents set current_version_id = $3 where tenant_id = $1 and id = $2",
    [access.tenantId, v.document_id, versionId],
  );
  return { ok: true, documentId: v.document_id, versionNo: v.version_no };
}

// --- Modifica ed eliminazione ---------------------------------------------------

const documentUpdate = z
  .object({
    title: z.string().trim().min(1, "Inserisci un titolo").max(200, "Massimo 200 caratteri"),
    category: z.enum(DOCUMENT_CATEGORIES, "Scegli la categoria"),
    description: optional(z.string().trim().max(4000)),
    folderId: optional(z.uuid("Cartella non valida")),
    subjectType: optional(z.enum(subjectTypes)),
    subjectId: optional(z.uuid("Scegli un elemento valido")),
    isConfidential: checkbox,
    expiresOn: optional(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida")),
  })
  .refine((d) => !d.subjectType === !d.subjectId, {
    message: "Scegli l'elemento da collegare",
    path: ["subjectId"],
  });
export type DocumentUpdateInput = z.input<typeof documentUpdate>;

export async function updateDocument(
  tx: UserTx,
  access: TenantAccess,
  id: string,
  input: DocumentUpdateInput,
  expectedUpdatedAt: string,
): Promise<void> {
  requirePermission(access, "documents.write");
  if (!isUuid(id)) throw new ValidationError({ form: "Documento non trovato" });
  const d = parseInput(documentUpdate, input);
  if (d.isConfidential && !hasPermission(access, "documents.confidential")) {
    throw new ValidationError({ isConfidential: "Non hai il permesso per i documenti riservati" });
  }
  const s = subjectColumns(d);
  await tx.query("savepoint update_document");
  try {
    const { rowCount } = await tx.query(
      `update public.documents set
         title = $4, category = $5, description = $6, folder_id = $7, is_confidential = $8,
         customer_id = $9, supplier_id = $10, employee_id = $11, team_id = $12, expires_on = $13::date
       where tenant_id = $1 and id = $2 and deleted_at is null
         and date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $3::timestamptz)`,
      [
        access.tenantId,
        id,
        expectedUpdatedAt,
        d.title,
        d.category,
        d.description ?? null,
        d.folderId ?? null,
        d.isConfidential,
        s.customer_id,
        s.supplier_id,
        s.employee_id,
        s.team_id,
        d.expiresOn ?? null,
      ],
    );
    if (rowCount === 0) throw new ValidationError({ form: STALE });
  } catch (error) {
    await tx.query("rollback to savepoint update_document");
    if (error instanceof ValidationError) throw error;
    forbiddenOr(error);
  }
}

export async function deleteDocument(tx: UserTx, access: TenantAccess, id: string): Promise<void> {
  requirePermission(access, "documents.delete");
  if (!isUuid(id)) throw new ValidationError({ form: "Documento non trovato" });
  const { rowCount } = await tx.query(
    "update public.documents set deleted_at = now() where tenant_id = $1 and id = $2 and deleted_at is null",
    [access.tenantId, id],
  );
  if (rowCount === 0) throw new ValidationError({ form: "Documento non trovato" });
}

// --- Download -------------------------------------------------------------------

/**
 * URL firmato (5 minuti) per scaricare o vedere in anteprima una versione.
 * Il download è registrato e compare nel registro attività.
 */
export async function getDownloadUrl(
  tx: UserTx,
  access: TenantAccess,
  storage: FileStorage,
  versionId: string,
  disposition: "download" | "preview" = "download",
): Promise<{ url: string; fileName: string; mimeType: string } | null> {
  requirePermission(access, "documents.read");
  if (!isUuid(versionId)) return null;
  const { rows } = await tx.query<{
    document_id: string;
    storage_key: string;
    original_name: string;
    mime_type: string;
  }>(
    `select v.document_id, v.storage_key, v.original_name, v.mime_type
       from public.document_versions v
       join public.documents d on d.tenant_id = v.tenant_id and d.id = v.document_id and d.deleted_at is null
      where v.tenant_id = $1 and v.id = $2 and v.status = 'ready'`,
    [access.tenantId, versionId],
  );
  const v = rows[0];
  if (!v) return null;
  await tx.query(
    "insert into public.document_downloads (tenant_id, document_id, version_id, disposition) values ($1, $2, $3, $4)",
    [access.tenantId, v.document_id, versionId, disposition],
  );
  const url = await storage.createDownloadUrl(v.storage_key, {
    expiresIn: DOWNLOAD_URL_SECONDS,
    downloadName: disposition === "download" ? v.original_name : undefined,
  });
  return { url, fileName: v.original_name, mimeType: v.mime_type };
}

/** Riepilogo per la dashboard: documenti scaduti o in scadenza entro 30 giorni. */
export async function getDocumentExpirySummary(
  tx: UserTx,
  access: TenantAccess,
): Promise<{ expired: number; expiring: number }> {
  if (!hasPermission(access, "documents.read")) return { expired: 0, expiring: 0 };
  const { rows } = await tx.query<{ expired: number; expiring: number }>(
    `select count(*) filter (where expires_on < current_date)::int as expired,
            count(*) filter (where expires_on >= current_date and expires_on <= current_date + 30)::int as expiring
       from public.documents where tenant_id = $1 and deleted_at is null and expires_on is not null`,
    [access.tenantId],
  );
  return rows[0] ?? { expired: 0, expiring: 0 };
}
