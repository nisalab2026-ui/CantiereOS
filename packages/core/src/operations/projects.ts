import { z } from "zod";
import { requirePermission, type TenantAccess } from "../auth/access";
import { AuthError, pgCode } from "../auth/errors";
import type { ListOptions, Page } from "../directory/lists";
import type { UserTx } from "../db/transaction";
import { optional, parseInput, ValidationError } from "../validation";
import { likePattern } from "../workspace/search";
import { parseEuroToCents } from "./payments";

/**
 * Commesse e cantieri (ADR-014). La commessa è il lavoro concordato con un
 * cliente; i cantieri sono i luoghi dove si lavora. Gli importi stanno in una
 * tabella a parte, visibile solo con projects.finance: chi non ha il permesso
 * riceve null, non zero.
 */
export const PROJECT_KINDS = [
  "lump_sum",
  "measured",
  "time_materials",
  "maintenance",
  "other",
] as const;
export type ProjectKind = (typeof PROJECT_KINDS)[number];
export const PROJECT_KIND_LABELS: Record<ProjectKind, string> = {
  lump_sum: "A corpo",
  measured: "A misura",
  time_materials: "In economia (ore e materiali)",
  maintenance: "Contratto di manutenzione",
  other: "Altro",
};

export const PROJECT_STATUSES = ["quote", "active", "suspended", "completed", "cancelled"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  quote: "In offerta",
  active: "In corso",
  suspended: "Sospesa",
  completed: "Conclusa",
  cancelled: "Annullata",
};

export const SITE_STATUSES = ["planned", "active", "suspended", "closed"] as const;
export type SiteStatus = (typeof SITE_STATUSES)[number];
export const SITE_STATUS_LABELS: Record<SiteStatus, string> = {
  planned: "Da aprire",
  active: "Aperto",
  suspended: "Fermo",
  closed: "Chiuso",
};

export interface ProjectRow {
  id: string;
  code: string;
  name: string;
  customer: { id: string; name: string };
  kind: ProjectKind;
  status: ProjectStatus;
  startDate: string | null;
  endDate: string | null;
  managerName: string | null;
  siteCount: number;
  /** null senza projects.finance o se non indicato */
  contractCents: number | null;
  updatedAt: Date;
}

export interface ProjectSite {
  id: string;
  name: string;
  status: SiteStatus;
  customerSiteId: string | null;
  /** indirizzo leggibile (della sede del cliente o proprio) */
  address: string;
  /** indirizzo proprio, solo se il cantiere non è su una sede del cliente */
  addressLine: string | null;
  postalCode: string | null;
  city: string | null;
  province: string | null;
  startDate: string | null;
  endDate: string | null;
  accessNotes: string | null;
  safetyNotes: string | null;
  updatedAt: Date;
}

export interface ProjectFinancials {
  contractCents: number | null;
  budgetCostCents: number | null;
  notes: string | null;
  updatedAt: Date;
}

export interface ProjectDetail extends ProjectRow {
  description: string | null;
  managerEmployeeId: string | null;
  closedAt: Date | null;
  createdAt: Date;
  createdByName: string | null;
  sites: ProjectSite[];
  /** undefined = nessun permesso; null = permesso ma importi non ancora indicati */
  financials: ProjectFinancials | null | undefined;
  summary: {
    tasksOpen: number;
    tasksDone: number;
    documents: number;
    formsDraft: number;
    formsCompleted: number;
  };
}

const isUuid = (v: unknown): v is string => z.uuid().safeParse(v).success;
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

const SELECT = `
  p.id, p.code, p.name, json_build_object('id', c.id, 'name', c.display_name) as customer,
  p.kind, p.status, to_char(p.start_date, 'YYYY-MM-DD') as "startDate",
  to_char(p.end_date, 'YYYY-MM-DD') as "endDate",
  nullif(trim(concat_ws(' ', e.first_name, e.last_name)), '') as "managerName",
  (select count(*)::int from public.project_sites s
    where s.tenant_id = p.tenant_id and s.project_id = p.id and s.deleted_at is null) as "siteCount",
  f.contract_amount_cents::float8 as "contractCents",
  p.updated_at as "updatedAt"`;

const FROM = `
  public.projects p
  join public.customers c on c.tenant_id = p.tenant_id and c.id = p.customer_id
  left join public.employees e on e.tenant_id = p.tenant_id and e.id = p.manager_employee_id
  left join public.project_financials f on f.tenant_id = p.tenant_id and f.project_id = p.id`;

export interface ProjectQuery {
  q?: string;
  /** open (default: in offerta, in corso, sospese) | closed | all | uno stato */
  status?: string;
  customerId?: string;
  sort?: string;
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export const PROJECT_SORTS = ["code", "name", "customer", "start", "updated"] as const;
const SORTS: Record<string, string> = {
  code: "lower(p.code)",
  name: "lower(p.name)",
  customer: "lower(c.display_name)",
  start: "p.start_date",
  updated: "p.updated_at",
};

export async function listProjects(
  tx: UserTx,
  access: TenantAccess,
  q: ProjectQuery,
  opts: ListOptions = {},
): Promise<Page<ProjectRow>> {
  requirePermission(access, "projects.read");
  const pageSize = Math.min(Math.max(q.pageSize ?? 25, 1), opts.maxPageSize ?? 100);
  const page = Math.min(Math.max(q.page ?? 1, 1), 10_000);
  const params: unknown[] = [access.tenantId];
  const where = ["p.tenant_id = $1", "p.deleted_at is null"];
  const status = q.status ?? "open";
  if (status === "open") where.push("p.status in ('quote', 'active', 'suspended')");
  else if (status === "closed") where.push("p.status in ('completed', 'cancelled')");
  else if ((PROJECT_STATUSES as readonly string[]).includes(status)) {
    params.push(status);
    where.push(`p.status = $${params.length}`);
  }
  if (isUuid(q.customerId)) {
    params.push(q.customerId);
    where.push(`p.customer_id = $${params.length}`);
  }
  const term = (q.q ?? "").trim().slice(0, 100);
  if (term) {
    params.push(likePattern(term.toLowerCase()));
    where.push(`lower(concat_ws(' ', p.code, p.name, c.display_name)) like $${params.length}`);
  }
  const sort = SORTS[q.sort ?? ""] ?? SORTS.updated!;
  const dir = q.dir === "asc" ? "asc" : q.dir === "desc" || !q.sort ? "desc" : "asc";
  params.push(pageSize, (page - 1) * pageSize);
  const { rows } = await tx.query<ProjectRow & { __total: number }>(
    `select ${SELECT}, count(*) over ()::int as "__total"
       from ${FROM}
      where ${where.join(" and ")}
      order by ${sort} ${dir} nulls last, p.created_at desc, p.id
      limit $${params.length - 1} offset $${params.length}`,
    params,
  );
  return {
    rows: rows.map(({ __total: _t, ...r }) => r as ProjectRow),
    total: rows[0]?.__total ?? 0,
    page,
    pageSize,
  };
}

export async function getProject(
  tx: UserTx,
  access: TenantAccess,
  id: string,
): Promise<ProjectDetail | null> {
  requirePermission(access, "projects.read");
  if (!isUuid(id)) return null;
  const { rows } = await tx.query<Omit<ProjectDetail, "sites" | "financials" | "summary">>(
    `select ${SELECT}, p.description, p.manager_employee_id as "managerEmployeeId",
            p.closed_at as "closedAt", p.created_at as "createdAt",
            coalesce(cb.full_name, cb.email) as "createdByName"
       from ${FROM}
       left join public.users cb on cb.id = p.created_by
      where p.tenant_id = $1 and p.id = $2 and p.deleted_at is null`,
    [access.tenantId, id],
  );
  const p = rows[0];
  if (!p) return null;

  const { rows: sites } = await tx.query<ProjectSite>(
    `select s.id, s.name, s.status, s.customer_site_id as "customerSiteId",
            case when cs.id is not null
                 then concat_ws(', ', cs.name, cs.address_line, concat_ws(' ', cs.postal_code, cs.city), cs.province)
                 else concat_ws(', ', s.address_line, concat_ws(' ', s.postal_code, s.city), s.province) end as address,
            s.address_line as "addressLine", s.postal_code as "postalCode", s.city, s.province,
            to_char(s.start_date, 'YYYY-MM-DD') as "startDate", to_char(s.end_date, 'YYYY-MM-DD') as "endDate",
            s.access_notes as "accessNotes", s.safety_notes as "safetyNotes", s.updated_at as "updatedAt"
       from public.project_sites s
       left join public.customer_sites cs on cs.tenant_id = s.tenant_id and cs.id = s.customer_site_id
      where s.tenant_id = $1 and s.project_id = $2 and s.deleted_at is null
      order by s.created_at`,
    [access.tenantId, id],
  );

  let financials: ProjectFinancials | null | undefined;
  if (access.permissions.has("projects.finance")) {
    const { rows: f } = await tx.query<ProjectFinancials>(
      `select contract_amount_cents::float8 as "contractCents", budget_cost_cents::float8 as "budgetCostCents",
              notes, updated_at as "updatedAt"
         from public.project_financials where tenant_id = $1 and project_id = $2`,
      [access.tenantId, id],
    );
    financials = f[0] ?? null;
  }

  // conteggi solo di ciò che l'utente può vedere (RLS di ciascuna tabella)
  const count = async (sql: string, perm: string) =>
    access.permissions.has(perm)
      ? ((await tx.query<{ n: number }>(sql, [access.tenantId, id])).rows[0]?.n ?? 0)
      : 0;
  const summary = {
    tasksOpen: await count(
      `select count(*)::int as n from public.tasks
        where tenant_id = $1 and project_id = $2 and deleted_at is null and status not in ('done', 'cancelled')`,
      "tasks.read",
    ),
    tasksDone: await count(
      `select count(*)::int as n from public.tasks
        where tenant_id = $1 and project_id = $2 and deleted_at is null and status = 'done'`,
      "tasks.read",
    ),
    documents: await count(
      `select count(*)::int as n from public.documents
        where tenant_id = $1 and project_id = $2 and deleted_at is null`,
      "documents.read",
    ),
    formsDraft: await count(
      `select count(*)::int as n from public.form_submissions
        where tenant_id = $1 and project_id = $2 and deleted_at is null and status = 'draft'`,
      "forms.read",
    ),
    formsCompleted: await count(
      `select count(*)::int as n from public.form_submissions
        where tenant_id = $1 and project_id = $2 and deleted_at is null and status = 'completed'`,
      "forms.read",
    ),
  };
  return { ...p, sites, financials, summary };
}

/** Commesse aperte per i menu di collegamento (moduli, attività, documenti). */
export async function listProjectOptions(
  tx: UserTx,
  access: TenantAccess,
  customerId?: string,
): Promise<{ id: string; code: string; name: string; customerId: string }[]> {
  if (!access.permissions.has("projects.read")) return [];
  const params: unknown[] = [access.tenantId];
  let extra = "";
  if (isUuid(customerId)) {
    params.push(customerId);
    extra = " and customer_id = $2";
  }
  const { rows } = await tx.query<{ id: string; code: string; name: string; customerId: string }>(
    `select id, code, name, customer_id as "customerId" from public.projects
      where tenant_id = $1 and deleted_at is null and status in ('quote', 'active', 'suspended')${extra}
      order by lower(code) desc limit 500`,
    params,
  );
  return rows;
}

// --- Scrittura -----------------------------------------------------------------

const money = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (v === "" || v === "0" || v === "0,00") return v === "" ? null : 0;
    const cents = parseEuroToCents(v);
    if (cents === null || cents > 100_000_000_000) {
      ctx.addIssue({ code: "custom", message: "Importo non valido (es. 12.500,00)" });
      return z.NEVER;
    }
    return cents;
  });

export const projectInput = z
  .object({
    code: optional(
      z
        .string()
        .trim()
        .regex(/^[A-Za-z0-9][A-Za-z0-9./_-]{0,29}$/, "Codice: lettere, numeri, . / _ - (max 30)"),
    ),
    name: z
      .string()
      .trim()
      .min(1, "Inserisci il nome della commessa")
      .max(200, "Massimo 200 caratteri"),
    customerId: z.uuid("Scegli il cliente"),
    kind: z.enum(PROJECT_KINDS, "Scegli il tipo"),
    status: optional(z.enum(PROJECT_STATUSES, "Stato non valido")),
    startDate: optional(z.string().regex(isoDate, "Data non valida")),
    endDate: optional(z.string().regex(isoDate, "Data non valida")),
    managerEmployeeId: optional(z.uuid("Responsabile non valido")),
    description: optional(z.string().trim().max(4000, "Massimo 4000 caratteri")),
  })
  .refine((d) => !d.startDate || !d.endDate || d.endDate >= d.startDate, {
    path: ["endDate"],
    message: "La fine non può precedere l'inizio",
  });
export type ProjectInput = z.input<typeof projectInput>;

export const financialsInput = z.object({
  contract: optional(money),
  budgetCost: optional(money),
  notes: optional(z.string().trim().max(2000, "Massimo 2000 caratteri")),
});
export type FinancialsInput = z.input<typeof financialsInput>;

export const siteInput = z
  .object({
    name: z.string().trim().min(1, "Dai un nome al cantiere").max(200, "Massimo 200 caratteri"),
    customerSiteId: optional(z.uuid("Sede non valida")),
    addressLine: optional(z.string().trim().max(300, "Massimo 300 caratteri")),
    postalCode: optional(
      z
        .string()
        .trim()
        .regex(/^[0-9]{5}$/, "CAP di 5 cifre"),
    ),
    city: optional(z.string().trim().max(120, "Massimo 120 caratteri")),
    province: optional(
      z
        .string()
        .trim()
        .transform((v) => v.toUpperCase())
        .pipe(z.string().regex(/^[A-Z]{2}$/, "Sigla di 2 lettere")),
    ),
    status: optional(z.enum(SITE_STATUSES, "Stato non valido")),
    startDate: optional(z.string().regex(isoDate, "Data non valida")),
    endDate: optional(z.string().regex(isoDate, "Data non valida")),
    accessNotes: optional(z.string().trim().max(2000, "Massimo 2000 caratteri")),
    safetyNotes: optional(z.string().trim().max(2000, "Massimo 2000 caratteri")),
  })
  .refine((d) => d.customerSiteId || (d.addressLine && d.city), {
    path: ["addressLine"],
    message: "Scegli una sede del cliente oppure scrivi indirizzo e città",
  })
  .refine((d) => !d.startDate || !d.endDate || d.endDate >= d.startDate, {
    path: ["endDate"],
    message: "La fine non può precedere l'inizio",
  });
export type SiteInput = z.input<typeof siteInput>;

/** Nei moduli i campi del cantiere hanno nomi propri (siteName, siteStatus…) per non confondersi con quelli della commessa. */
const SITE_ERROR_KEYS: Record<string, string> = {
  name: "siteName",
  status: "siteStatus",
  startDate: "siteStartDate",
  endDate: "siteEndDate",
};
function parseSite(input: SiteInput): z.output<typeof siteInput> {
  try {
    return parseInput(siteInput, input);
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(error.fieldErrors)) out[SITE_ERROR_KEYS[k] ?? k] = v;
    throw new ValidationError(out);
  }
}

function mapWriteError(error: unknown): never {
  if (error instanceof ValidationError) throw error;
  const code = pgCode(error);
  const message = error instanceof Error ? error.message : "";
  if (code === "23505")
    throw new ValidationError({ code: "Codice già usato da un'altra commessa" });
  if (code === "23503") {
    if (message.includes("manager"))
      throw new ValidationError({ managerEmployeeId: "Responsabile non trovato" });
    if (message.includes("customer_site"))
      throw new ValidationError({ customerSiteId: "Sede non trovata" });
    throw new ValidationError({ customerId: "Cliente non trovato" });
  }
  if (code === "23514") {
    if (message.includes("sede"))
      throw new ValidationError({ customerSiteId: "La sede non è del cliente della commessa" });
    if (message.includes("cantieri")) {
      throw new ValidationError({
        customerId:
          "La commessa ha cantieri su sedi del cliente: toglili prima di cambiare cliente",
      });
    }
    throw new ValidationError({ form: "Dati non validi" });
  }
  if (code === "42501") throw new AuthError("FORBIDDEN", "permesso mancante", { cause: error });
  throw error;
}

async function guarded<T>(tx: UserTx, name: string, fn: () => Promise<T>): Promise<T> {
  await tx.query(`savepoint ${name}`);
  try {
    const r = await fn();
    await tx.query(`release savepoint ${name}`);
    return r;
  } catch (error) {
    await tx.query(`rollback to savepoint ${name}`);
    mapWriteError(error);
  }
}

/** Nuova commessa; con projects.finance anche gli importi, e facoltativamente il primo cantiere. */
export async function createProject(
  tx: UserTx,
  access: TenantAccess,
  input: ProjectInput,
  extra: { financials?: FinancialsInput; site?: SiteInput } = {},
): Promise<{ id: string; code: string }> {
  requirePermission(access, "projects.write");
  const d = parseInput(projectInput, input);
  const f = extra.financials ? parseInput(financialsInput, extra.financials) : null;
  if (f && (f.contract != null || f.budgetCost != null))
    requirePermission(access, "projects.finance");
  const site = extra.site ? parseSite(extra.site) : null;
  return guarded(tx, "create_project", async () => {
    const { rows } = await tx.query<{ id: string; code: string }>(
      `insert into public.projects
         (tenant_id, code, name, customer_id, kind, status, start_date, end_date, manager_employee_id, description)
       values ($1, $2, $3, $4, $5, coalesce($6, 'active'), $7::date, $8::date, $9, $10)
       returning id, code`,
      [
        access.tenantId,
        d.code ?? null,
        d.name,
        d.customerId,
        d.kind,
        d.status ?? null,
        d.startDate ?? null,
        d.endDate ?? null,
        d.managerEmployeeId ?? null,
        d.description ?? null,
      ],
    );
    const p = rows[0]!;
    if (f && (f.contract != null || f.budgetCost != null || f.notes)) {
      await tx.query(
        `insert into public.project_financials (tenant_id, project_id, contract_amount_cents, budget_cost_cents, notes)
         values ($1, $2, $3, $4, $5)`,
        [access.tenantId, p.id, f.contract ?? null, f.budgetCost ?? null, f.notes ?? null],
      );
    }
    if (site) await insertSite(tx, access, p.id, site);
    return p;
  });
}

/** Modifica con controllo di concorrenza. */
export async function updateProject(
  tx: UserTx,
  access: TenantAccess,
  id: string,
  input: ProjectInput,
  expectedUpdatedAt: string,
): Promise<void> {
  requirePermission(access, "projects.write");
  if (!isUuid(id)) throw new ValidationError({ form: "Commessa non trovata" });
  const d = parseInput(projectInput, input);
  await guarded(tx, "update_project", async () => {
    const { rowCount } = await tx.query(
      `update public.projects set
         code = coalesce($3, code), name = $4, customer_id = $5, kind = $6, status = coalesce($7, status),
         start_date = $8::date, end_date = $9::date, manager_employee_id = $10, description = $11
       where tenant_id = $1 and id = $2 and deleted_at is null
         and date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $12::timestamptz)`,
      [
        access.tenantId,
        id,
        d.code ?? null,
        d.name,
        d.customerId,
        d.kind,
        d.status ?? null,
        d.startDate ?? null,
        d.endDate ?? null,
        d.managerEmployeeId ?? null,
        d.description ?? null,
        expectedUpdatedAt,
      ],
    );
    if (rowCount === 0) {
      throw new ValidationError({
        form: "La commessa è stata modificata da un altro utente o non esiste più. Ricarica la pagina.",
      });
    }
  });
}

export async function setProjectStatus(
  tx: UserTx,
  access: TenantAccess,
  id: string,
  status: ProjectStatus,
): Promise<void> {
  requirePermission(access, "projects.write");
  if (!isUuid(id) || !(PROJECT_STATUSES as readonly string[]).includes(status)) {
    throw new ValidationError({ form: "Operazione non valida" });
  }
  const { rowCount } = await tx.query(
    `update public.projects set status = $3
      where tenant_id = $1 and id = $2 and deleted_at is null and status <> $3`,
    [access.tenantId, id, status],
  );
  if (rowCount === 0) throw new ValidationError({ form: "La commessa è già in questo stato." });
}

/** Eliminazione logica (projects.delete, MFA). I collegamenti restano nella cronologia. */
export async function deleteProject(tx: UserTx, access: TenantAccess, id: string): Promise<void> {
  requirePermission(access, "projects.delete");
  if (!isUuid(id)) return;
  await tx.query(
    "update public.projects set deleted_at = now() where tenant_id = $1 and id = $2 and deleted_at is null",
    [access.tenantId, id],
  );
}

/** Importi della commessa (projects.finance): crea o aggiorna. */
export async function saveProjectFinancials(
  tx: UserTx,
  access: TenantAccess,
  projectId: string,
  input: FinancialsInput,
): Promise<void> {
  requirePermission(access, "projects.finance");
  if (!isUuid(projectId)) throw new ValidationError({ form: "Commessa non trovata" });
  const f = parseInput(financialsInput, input);
  await guarded(tx, "save_financials", async () => {
    const { rows } = await tx.query(
      "select 1 from public.projects where tenant_id = $1 and id = $2 and deleted_at is null",
      [access.tenantId, projectId],
    );
    if (!rows.length) throw new ValidationError({ form: "Commessa non trovata" });
    await tx.query(
      `insert into public.project_financials (tenant_id, project_id, contract_amount_cents, budget_cost_cents, notes)
       values ($1, $2, $3, $4, $5)
       on conflict (tenant_id, project_id) do update set
         contract_amount_cents = excluded.contract_amount_cents,
         budget_cost_cents = excluded.budget_cost_cents, notes = excluded.notes`,
      [access.tenantId, projectId, f.contract ?? null, f.budgetCost ?? null, f.notes ?? null],
    );
  });
}

async function insertSite(
  tx: UserTx,
  access: TenantAccess,
  projectId: string,
  s: z.output<typeof siteInput>,
): Promise<string> {
  const linked = Boolean(s.customerSiteId);
  const { rows } = await tx.query<{ id: string }>(
    `insert into public.project_sites
       (tenant_id, project_id, name, customer_site_id, address_line, postal_code, city, province,
        status, start_date, end_date, access_notes, safety_notes)
     values ($1, $2, $3, $4, $5, $6, $7, $8, coalesce($9, 'active'), $10::date, $11::date, $12, $13)
     returning id`,
    [
      access.tenantId,
      projectId,
      s.name,
      s.customerSiteId ?? null,
      linked ? null : (s.addressLine ?? null),
      linked ? null : (s.postalCode ?? null),
      linked ? null : (s.city ?? null),
      linked ? null : (s.province ?? null),
      s.status ?? null,
      s.startDate ?? null,
      s.endDate ?? null,
      s.accessNotes ?? null,
      s.safetyNotes ?? null,
    ],
  );
  return rows[0]!.id;
}

export async function createProjectSite(
  tx: UserTx,
  access: TenantAccess,
  projectId: string,
  input: SiteInput,
): Promise<{ id: string }> {
  requirePermission(access, "projects.write");
  if (!isUuid(projectId)) throw new ValidationError({ form: "Commessa non trovata" });
  const s = parseSite(input);
  return guarded(tx, "create_site", async () => ({
    id: await insertSite(tx, access, projectId, s),
  }));
}

export async function updateProjectSite(
  tx: UserTx,
  access: TenantAccess,
  siteId: string,
  input: SiteInput,
): Promise<void> {
  requirePermission(access, "projects.write");
  if (!isUuid(siteId)) throw new ValidationError({ form: "Cantiere non trovato" });
  const s = parseSite(input);
  const linked = Boolean(s.customerSiteId);
  await guarded(tx, "update_site", async () => {
    const { rowCount } = await tx.query(
      `update public.project_sites set
         name = $3, customer_site_id = $4, address_line = $5, postal_code = $6, city = $7, province = $8,
         status = coalesce($9, status), start_date = $10::date, end_date = $11::date,
         access_notes = $12, safety_notes = $13
       where tenant_id = $1 and id = $2 and deleted_at is null`,
      [
        access.tenantId,
        siteId,
        s.name,
        s.customerSiteId ?? null,
        linked ? null : (s.addressLine ?? null),
        linked ? null : (s.postalCode ?? null),
        linked ? null : (s.city ?? null),
        linked ? null : (s.province ?? null),
        s.status ?? null,
        s.startDate ?? null,
        s.endDate ?? null,
        s.accessNotes ?? null,
        s.safetyNotes ?? null,
      ],
    );
    if (rowCount === 0) throw new ValidationError({ form: "Cantiere non trovato" });
  });
}

/** Toglie un cantiere (eliminazione logica, projects.write: è parte della commessa). */
export async function removeProjectSite(
  tx: UserTx,
  access: TenantAccess,
  siteId: string,
): Promise<void> {
  requirePermission(access, "projects.write");
  if (!isUuid(siteId)) return;
  await tx.query(
    "update public.project_sites set deleted_at = now() where tenant_id = $1 and id = $2 and deleted_at is null",
    [access.tenantId, siteId],
  );
}

export interface ProjectFormOptions {
  customers: { id: string; name: string; sites: { id: string; name: string; address: string }[] }[];
  employees: { id: string; name: string }[];
}

/** Clienti con le loro sedi e personale attivo, per i moduli di commessa e cantiere. */
export async function loadProjectFormOptions(
  tx: UserTx,
  access: TenantAccess,
): Promise<ProjectFormOptions> {
  requirePermission(access, "projects.write");
  const customers = access.permissions.has("customers.read")
    ? (
        await tx.query<ProjectFormOptions["customers"][number]>(
          `select c.id, c.display_name as name,
                  coalesce((select json_agg(json_build_object('id', s.id, 'name', s.name,
                              'address', concat_ws(', ', s.address_line, s.city)) order by lower(s.name))
                              from public.customer_sites s
                             where s.tenant_id = c.tenant_id and s.customer_id = c.id
                               and s.deleted_at is null and s.is_active), '[]'::json) as sites
             from public.customers c
            where c.tenant_id = $1 and c.deleted_at is null and c.is_active
            order by lower(c.display_name) limit 500`,
          [access.tenantId],
        )
      ).rows
    : [];
  const employees = access.permissions.has("employees.read")
    ? (
        await tx.query<{ id: string; name: string }>(
          `select id, concat_ws(' ', first_name, last_name) as name from public.employees
            where tenant_id = $1 and deleted_at is null and is_active
            order by lower(last_name), lower(first_name) limit 500`,
          [access.tenantId],
        )
      ).rows
    : [];
  return { customers, employees };
}
