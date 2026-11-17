import { z } from "zod";
import { requirePermission, type TenantAccess } from "../auth/access";
import { AuthError, pgCode } from "../auth/errors";
import type { ListOptions, Page } from "../directory/lists";
import type { UserTx } from "../db/transaction";
import { detectFileType, type FileStorage } from "../documents/storage";
import { optional, parseInput, ValidationError } from "../validation";
import { likePattern } from "../workspace/search";
import { parseEuroToCents } from "./payments";

/**
 * Rapportini di lavoro (ADR-015). Il rapportino è una giornata su una commessa:
 * ore per persona, materiali e mezzi, foto e firma del cliente. Bozza → inviato →
 * approvato; solo gli approvati contano nei costi della commessa. I costi (tariffe
 * orarie e prezzi delle voci) li vede solo chi ha projects.finance.
 */
export const WORK_REPORT_STATUSES = ["draft", "submitted", "approved", "invoiced"] as const;
export type WorkReportStatus = (typeof WORK_REPORT_STATUSES)[number];
export const WORK_REPORT_STATUS_LABELS: Record<WorkReportStatus, string> = {
  draft: "Bozza",
  submitted: "Inviato",
  approved: "Approvato",
  invoiced: "Fatturato",
};
export const WORK_ITEM_KINDS = ["material", "equipment", "other"] as const;
export type WorkItemKind = (typeof WORK_ITEM_KINDS)[number];
export const WORK_ITEM_KIND_LABELS: Record<WorkItemKind, string> = {
  material: "Materiale",
  equipment: "Mezzo / attrezzatura",
  other: "Altro",
};

const isUuid = (v: unknown): v is string => z.uuid().safeParse(v).success;
const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface WorkReportRow {
  id: string;
  number: string;
  reportDate: string;
  status: WorkReportStatus;
  project: { id: string; code: string; name: string };
  customerName: string;
  siteName: string | null;
  authorName: string | null;
  authorId: string | null;
  hours: number;
  people: number;
  updatedAt: Date;
}

export interface WorkLaborLine {
  id: string;
  employeeId: string;
  employeeName: string;
  startTime: string | null;
  endTime: string | null;
  breakMinutes: number;
  hours: number;
  notes: string | null;
  /** solo con projects.finance; null se manca la tariffa */
  hourlyCostCents?: number | null;
}

export interface WorkItemLine {
  id: string;
  kind: WorkItemKind;
  description: string;
  quantity: number;
  unit: string | null;
  notes: string | null;
  /** solo con projects.finance; null se non indicato */
  unitCostCents?: number | null;
}

export interface WorkReportDetail extends WorkReportRow {
  projectSiteId: string | null;
  siteAddress: string | null;
  workDescription: string | null;
  notes: string | null;
  customerSignature: string | null;
  customerSignerName: string | null;
  customerSignedAt: Date | null;
  submittedAt: Date | null;
  submittedByName: string | null;
  approvedAt: Date | null;
  approvedByName: string | null;
  returnedReason: string | null;
  createdAt: Date;
  labor: WorkLaborLine[];
  items: WorkItemLine[];
  /** costi del rapportino: solo con projects.finance */
  costs?: { laborCents: number; itemsCents: number; missingRates: number; missingPrices: number };
  /** l'utente può modificarlo adesso (bozza e autore o chi approva) */
  canEdit: boolean;
  canApprove: boolean;
  /** creato dall'utente corrente */
  isMine: boolean;
}

const SELECT = `
  w.id, w.number, to_char(w.report_date, 'YYYY-MM-DD') as "reportDate", w.status,
  json_build_object('id', p.id, 'code', p.code, 'name', p.name) as project,
  c.display_name as "customerName", s.name as "siteName",
  coalesce(u.full_name, u.email) as "authorName", w.created_by as "authorId",
  coalesce((select sum(l.hours) from public.work_report_labor l
             where l.tenant_id = w.tenant_id and l.report_id = w.id), 0)::float8 as hours,
  (select count(distinct l.employee_id) from public.work_report_labor l
    where l.tenant_id = w.tenant_id and l.report_id = w.id)::int as people,
  w.updated_at as "updatedAt"`;
const FROM = `
  public.work_reports w
  join public.projects p on p.tenant_id = w.tenant_id and p.id = w.project_id
  join public.customers c on c.tenant_id = p.tenant_id and c.id = p.customer_id
  left join public.project_sites s on s.tenant_id = w.tenant_id and s.id = w.project_site_id
  left join public.users u on u.id = w.created_by`;

export interface WorkReportQuery {
  q?: string;
  /** open (bozze e inviati) | da approvare (submitted) | uno stato | all */
  status?: string;
  projectId?: string;
  /** solo i miei */
  mine?: boolean;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export async function listWorkReports(
  tx: UserTx,
  access: TenantAccess,
  q: WorkReportQuery = {},
  opts: ListOptions = {},
): Promise<Page<WorkReportRow>> {
  requirePermission(access, "work_reports.read");
  const pageSize = Math.min(Math.max(q.pageSize ?? 25, 1), opts.maxPageSize ?? 100);
  const page = Math.min(Math.max(q.page ?? 1, 1), 10_000);
  const params: unknown[] = [access.tenantId];
  const where = ["w.tenant_id = $1", "w.deleted_at is null"];
  const status = q.status ?? "all";
  if (status === "open") where.push("w.status in ('draft', 'submitted')");
  else if ((WORK_REPORT_STATUSES as readonly string[]).includes(status)) {
    params.push(status);
    where.push(`w.status = $${params.length}`);
  }
  if (isUuid(q.projectId)) {
    params.push(q.projectId);
    where.push(`w.project_id = $${params.length}`);
  }
  if (q.mine) where.push("w.created_by = auth.uid()");
  if (q.from && isoDate.test(q.from)) {
    params.push(q.from);
    where.push(`w.report_date >= $${params.length}::date`);
  }
  if (q.to && isoDate.test(q.to)) {
    params.push(q.to);
    where.push(`w.report_date <= $${params.length}::date`);
  }
  const term = (q.q ?? "").trim().slice(0, 100);
  if (term) {
    params.push(likePattern(term.toLowerCase()));
    where.push(
      `lower(concat_ws(' ', w.number, p.code, p.name, c.display_name, s.name, w.work_description)) like $${params.length}`,
    );
  }
  params.push(pageSize, (page - 1) * pageSize);
  const { rows } = await tx.query<WorkReportRow & { __total: number }>(
    `select ${SELECT}, count(*) over ()::int as "__total"
       from ${FROM}
      where ${where.join(" and ")}
      order by w.report_date desc, w.number desc
      limit $${params.length - 1} offset $${params.length}`,
    params,
  );
  return {
    rows: rows.map(({ __total: _t, ...r }) => r as WorkReportRow),
    total: rows[0]?.__total ?? 0,
    page,
    pageSize,
  };
}

export async function getWorkReport(
  tx: UserTx,
  access: TenantAccess,
  id: string,
): Promise<WorkReportDetail | null> {
  requirePermission(access, "work_reports.read");
  if (!isUuid(id)) return null;
  const { rows } = await tx.query<
    Omit<WorkReportDetail, "labor" | "items" | "canEdit" | "canApprove" | "isMine"> & {
      mine: boolean;
    }
  >(
    `select ${SELECT}, w.project_site_id as "projectSiteId", w.created_by = auth.uid() as mine,
            case when s.id is null then null
                 when s.customer_site_id is not null then
                   (select concat_ws(', ', cs.address_line, concat_ws(' ', cs.postal_code, cs.city), cs.province)
                      from public.customer_sites cs where cs.tenant_id = s.tenant_id and cs.id = s.customer_site_id)
                 else concat_ws(', ', s.address_line, concat_ws(' ', s.postal_code, s.city), s.province) end
              as "siteAddress",
            w.work_description as "workDescription", w.notes,
            w.customer_signature as "customerSignature", w.customer_signer_name as "customerSignerName",
            w.customer_signed_at as "customerSignedAt",
            w.submitted_at as "submittedAt", coalesce(sb.full_name, sb.email) as "submittedByName",
            w.approved_at as "approvedAt", coalesce(ab.full_name, ab.email) as "approvedByName",
            w.returned_reason as "returnedReason", w.created_at as "createdAt"
       from ${FROM}
       left join public.users sb on sb.id = w.submitted_by
       left join public.users ab on ab.id = w.approved_by
      where w.tenant_id = $1 and w.id = $2 and w.deleted_at is null`,
    [access.tenantId, id],
  );
  const row = rows[0];
  if (!row) return null;
  const { mine, ...r } = row;
  const finance = access.permissions.has("projects.finance");
  const { rows: labor } = await tx.query<WorkLaborLine>(
    `select l.id, l.employee_id as "employeeId",
            concat_ws(' ', e.first_name, e.last_name) as "employeeName",
            to_char(l.start_time, 'HH24:MI') as "startTime", to_char(l.end_time, 'HH24:MI') as "endTime",
            l.break_minutes as "breakMinutes", l.hours::float8 as hours, l.notes
            ${
              finance
                ? `, (select r.hourly_cost_cents::float8 from public.employee_cost_rates r
                       where r.tenant_id = l.tenant_id and r.employee_id = l.employee_id
                         and r.valid_from <= $3::date order by r.valid_from desc limit 1) as "hourlyCostCents"`
                : ""
            }
       from public.work_report_labor l
       join public.employees e on e.tenant_id = l.tenant_id and e.id = l.employee_id
      where l.tenant_id = $1 and l.report_id = $2
      order by l.created_at, l.id`,
    finance ? [access.tenantId, id, r.reportDate] : [access.tenantId, id],
  );
  const { rows: items } = await tx.query<WorkItemLine>(
    `select i.id, i.kind, i.description, i.quantity::float8 as quantity, i.unit, i.notes
            ${finance ? `, ic.unit_cost_cents::float8 as "unitCostCents"` : ""}
       from public.work_report_items i
       ${finance ? "left join public.work_report_item_costs ic on ic.tenant_id = i.tenant_id and ic.item_id = i.id" : ""}
      where i.tenant_id = $1 and i.report_id = $2
      order by i.created_at, i.id`,
    [access.tenantId, id],
  );
  const canApprove = access.permissions.has("work_reports.approve");
  const canEdit =
    r.status === "draft" && access.permissions.has("work_reports.write") && (canApprove || mine);
  const detail: WorkReportDetail = { ...r, labor, items, canEdit, canApprove, isMine: mine };
  if (finance) {
    detail.costs = {
      laborCents: Math.round(labor.reduce((t, l) => t + (l.hourlyCostCents ?? 0) * l.hours, 0)),
      itemsCents: Math.round(items.reduce((t, i) => t + (i.unitCostCents ?? 0) * i.quantity, 0)),
      missingRates: new Set(labor.filter((l) => l.hourlyCostCents == null).map((l) => l.employeeId))
        .size,
      missingPrices: items.filter((i) => i.unitCostCents == null).length,
    };
  }
  return detail;
}

// --- Scrittura -------------------------------------------------------------------

function mapWriteError(error: unknown): never {
  if (error instanceof ValidationError) throw error;
  const code = pgCode(error);
  const message = error instanceof Error ? error.message : "";
  if (code === "23514") {
    if (/commessa è chiusa/i.test(message)) throw new ValidationError({ projectId: message });
    if (/cantiere/i.test(message)) throw new ValidationError({ projectSiteId: message });
    if (/fine deve|pausa/i.test(message)) throw new ValidationError({ labor: message });
    throw new ValidationError({ form: "Dati non validi" });
  }
  if (code === "23503") {
    if (/commessa/i.test(message)) throw new ValidationError({ projectId: "Commessa non trovata" });
    throw new ValidationError({ form: "Elemento collegato non trovato" });
  }
  if (code === "42501") {
    if (/rapportin|bozza|fatturato|stato|approvare/i.test(message))
      throw new ValidationError({ form: message });
    throw new AuthError("FORBIDDEN", "permesso mancante", { cause: error });
  }
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

const createInput = z.object({
  projectId: z.uuid("Scegli la commessa"),
  projectSiteId: optional(z.uuid("Cantiere non valido")),
  reportDate: z.string().regex(isoDate, "Data non valida"),
});
export type WorkReportCreateInput = z.input<typeof createInput>;

export async function createWorkReport(
  tx: UserTx,
  access: TenantAccess,
  input: WorkReportCreateInput,
): Promise<{ id: string; number: string }> {
  requirePermission(access, "work_reports.write");
  const d = parseInput(createInput, input);
  return guarded(tx, "create_work_report", async () => {
    const { rows } = await tx.query<{ id: string; number: string }>(
      `insert into public.work_reports (tenant_id, project_id, project_site_id, report_date)
       values ($1, $2, $3, $4::date) returning id, number`,
      [access.tenantId, d.projectId, d.projectSiteId ?? null, d.reportDate],
    );
    return rows[0]!;
  });
}

const quantity = z.union([z.number(), z.string()]).transform((v, ctx) => {
  const n = typeof v === "number" ? v : Number(v.trim().replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0 || n > 1_000_000) {
    ctx.addIssue({ code: "custom", message: "Quantità non valida" });
    return z.NEVER;
  }
  return Math.round(n * 1000) / 1000;
});

const laborLine = z
  .object({
    id: optional(z.uuid()),
    employeeId: z.uuid("Scegli la persona"),
    startTime: optional(z.string().regex(hhmm, "Ora non valida (es. 07:30)")),
    endTime: optional(z.string().regex(hhmm, "Ora non valida (es. 16:30)")),
    breakMinutes: optional(z.coerce.number().int().min(0).max(600)),
    hours: optional(quantity),
    notes: optional(z.string().trim().max(500)),
  })
  .refine((l) => (l.startTime && l.endTime) || (!l.startTime && !l.endTime && l.hours), {
    message: "Indica inizio e fine oppure le ore totali",
  })
  .refine((l) => !l.hours || l.hours <= 24, { message: "Al massimo 24 ore" });

const itemLine = z.object({
  id: optional(z.uuid()),
  kind: z.enum(WORK_ITEM_KINDS),
  description: z.string().trim().min(1, "Descrivi la voce").max(300),
  quantity,
  unit: optional(z.string().trim().max(20)),
  notes: optional(z.string().trim().max(500)),
  /** solo projects.finance: "12,50" (vuoto = non indicato) */
  unitCost: optional(z.string().trim()),
});

const saveInput = z.object({
  projectSiteId: optional(z.uuid("Cantiere non valido")),
  reportDate: z.string().regex(isoDate, "Data non valida"),
  workDescription: optional(z.string().trim().max(8000, "Massimo 8000 caratteri")),
  notes: optional(z.string().trim().max(4000, "Massimo 4000 caratteri")),
  labor: z.array(z.unknown()).max(100, "Al massimo 100 righe di ore"),
  items: z.array(z.unknown()).max(200, "Al massimo 200 voci"),
});
export interface WorkReportSaveInput {
  projectSiteId?: string;
  reportDate: string;
  workDescription?: string;
  notes?: string;
  labor: z.input<typeof laborLine>[];
  items: z.input<typeof itemLine>[];
}

/** Errori per riga: chiave labor.N o items.N. */
function parseLines<S extends z.ZodType>(
  schema: S,
  list: unknown[],
  prefix: string,
): z.output<S>[] {
  const out: z.output<S>[] = [];
  const errors: Record<string, string> = {};
  list.forEach((raw, i) => {
    const r = schema.safeParse(raw);
    if (r.success) out.push(r.data);
    else errors[`${prefix}.${i}`] = r.error.issues[0]?.message ?? "Riga non valida";
  });
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return out;
}

/**
 * Salva la bozza: intestazione e righe. Le righe esistenti si aggiornano (per id),
 * le nuove si aggiungono, le mancanti si tolgono; così i prezzi già indicati
 * dall'ufficio sulle voci restano. Controllo di concorrenza su updated_at.
 */
export async function saveWorkReport(
  tx: UserTx,
  access: TenantAccess,
  id: string,
  input: WorkReportSaveInput,
  expectedUpdatedAt: string,
): Promise<void> {
  requirePermission(access, "work_reports.write");
  if (!isUuid(id)) throw new ValidationError({ form: "Rapportino non trovato" });
  const d = parseInput(saveInput, input);
  const labor = parseLines(laborLine, d.labor, "labor");
  const items = parseLines(itemLine, d.items, "items");
  const finance = access.permissions.has("projects.finance");
  const prices = new Map<number, number | null>();
  if (finance) {
    items.forEach((it, i) => {
      if (it.unitCost === undefined) return prices.set(i, null);
      const c = parseEuroToCents(it.unitCost);
      if (c === null)
        throw new ValidationError({ [`items.${i}`]: "Prezzo non valido (es. 12,50)" });
      prices.set(i, c);
    });
  }

  await guarded(tx, "save_work_report", async () => {
    const { rowCount } = await tx.query(
      `update public.work_reports set project_site_id = $3, report_date = $4::date,
              work_description = $5, notes = $6
        where tenant_id = $1 and id = $2 and deleted_at is null
          and date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $7::timestamptz)`,
      [
        access.tenantId,
        id,
        d.projectSiteId ?? null,
        d.reportDate,
        d.workDescription ?? null,
        d.notes ?? null,
        expectedUpdatedAt,
      ],
    );
    if (rowCount === 0) {
      throw new ValidationError({
        form: "Il rapportino è stato modificato da un'altra persona o non esiste più. Ricarica la pagina.",
      });
    }

    const keepLabor = labor.flatMap((l) => (l.id ? [l.id] : []));
    await tx.query(
      `delete from public.work_report_labor
        where tenant_id = $1 and report_id = $2 and not (id = any($3::uuid[]))`,
      [access.tenantId, id, keepLabor],
    );
    for (const l of labor) {
      const vals = [
        l.employeeId,
        l.startTime ?? null,
        l.endTime ?? null,
        l.breakMinutes ?? 0,
        l.hours ?? 1, // con inizio e fine le ore le ricalcola il database
        l.notes ?? null,
      ];
      if (l.id) {
        const u = await tx.query(
          `update public.work_report_labor set employee_id = $3, start_time = $4::time, end_time = $5::time,
                  break_minutes = $6, hours = $7, notes = $8
            where tenant_id = $1 and report_id = $2 and id = $9`,
          [access.tenantId, id, ...vals, l.id],
        );
        if (u.rowCount === 0) throw new ValidationError({ form: "Riga delle ore non trovata" });
      } else {
        await tx.query(
          `insert into public.work_report_labor
             (tenant_id, report_id, employee_id, start_time, end_time, break_minutes, hours, notes)
           values ($1, $2, $3, $4::time, $5::time, $6, $7, $8)`,
          [access.tenantId, id, ...vals],
        );
      }
    }

    const keepItems = items.flatMap((i) => (i.id ? [i.id] : []));
    await tx.query(
      `delete from public.work_report_items
        where tenant_id = $1 and report_id = $2 and not (id = any($3::uuid[]))`,
      [access.tenantId, id, keepItems],
    );
    for (const [idx, it] of items.entries()) {
      const vals = [it.kind, it.description, it.quantity, it.unit ?? null, it.notes ?? null];
      let itemId = it.id;
      if (itemId) {
        const u = await tx.query(
          `update public.work_report_items set kind = $3, description = $4, quantity = $5, unit = $6, notes = $7
            where tenant_id = $1 and report_id = $2 and id = $8`,
          [access.tenantId, id, ...vals, itemId],
        );
        if (u.rowCount === 0) throw new ValidationError({ form: "Voce non trovata" });
      } else {
        const ins = await tx.query<{ id: string }>(
          `insert into public.work_report_items (tenant_id, report_id, kind, description, quantity, unit, notes)
           values ($1, $2, $3, $4, $5, $6, $7) returning id`,
          [access.tenantId, id, ...vals],
        );
        itemId = ins.rows[0]!.id;
      }
      if (finance) await setItemCost(tx, access, itemId, prices.get(idx) ?? null);
    }
  });
}

async function setItemCost(tx: UserTx, access: TenantAccess, itemId: string, cents: number | null) {
  if (cents === null) {
    await tx.query(
      "delete from public.work_report_item_costs where tenant_id = $1 and item_id = $2",
      [access.tenantId, itemId],
    );
    return;
  }
  await tx.query(
    `insert into public.work_report_item_costs (tenant_id, item_id, unit_cost_cents) values ($1, $2, $3)
     on conflict (tenant_id, item_id) do update set unit_cost_cents = excluded.unit_cost_cents
     where work_report_item_costs.unit_cost_cents <> excluded.unit_cost_cents`,
    [access.tenantId, itemId, cents],
  );
}

/** Prezzi delle voci anche dopo l'approvazione (ufficio, projects.finance). */
export async function saveWorkReportPrices(
  tx: UserTx,
  access: TenantAccess,
  reportId: string,
  prices: Record<string, string>,
): Promise<void> {
  requirePermission(access, "projects.finance");
  if (!isUuid(reportId)) throw new ValidationError({ form: "Rapportino non trovato" });
  const { rows } = await tx.query<{ id: string }>(
    "select id from public.work_report_items where tenant_id = $1 and report_id = $2",
    [access.tenantId, reportId],
  );
  const known = new Set(rows.map((r) => r.id));
  const parsed: [string, number | null][] = [];
  const errors: Record<string, string> = {};
  for (const [itemId, raw] of Object.entries(prices)) {
    if (!known.has(itemId)) continue;
    if (!raw.trim()) {
      parsed.push([itemId, null]);
      continue;
    }
    const c = parseEuroToCents(raw);
    if (c === null) errors[itemId] = "Prezzo non valido (es. 12,50)";
    else parsed.push([itemId, c]);
  }
  if (Object.keys(errors).length) throw new ValidationError(errors);
  await guarded(tx, "save_prices", async () => {
    for (const [itemId, c] of parsed) await setItemCost(tx, access, itemId, c);
  });
}

const signatureInput = z.object({
  signature: z
    .string()
    .startsWith("data:image/png;base64,", "Firma non valida")
    .max(200_000, "Firma troppo grande"),
  signerName: z.string().trim().min(1, "Scrivi il nome di chi firma").max(120),
});

export async function signWorkReport(
  tx: UserTx,
  access: TenantAccess,
  id: string,
  input: z.input<typeof signatureInput> | null,
): Promise<void> {
  requirePermission(access, "work_reports.write");
  if (!isUuid(id)) throw new ValidationError({ form: "Rapportino non trovato" });
  const d = input ? parseInput(signatureInput, input) : null;
  await guarded(tx, "sign_work_report", async () => {
    const { rowCount } = await tx.query(
      `update public.work_reports set customer_signature = $3, customer_signer_name = $4
        where tenant_id = $1 and id = $2 and deleted_at is null`,
      [access.tenantId, id, d?.signature ?? null, d?.signerName ?? null],
    );
    if (rowCount === 0) throw new ValidationError({ form: "Rapportino non trovato" });
  });
}

export type WorkReportTransition = "submit" | "withdraw" | "approve" | "return" | "reopen";

/** Passaggi di stato; il database controlla chi può farli. */
export async function changeWorkReportStatus(
  tx: UserTx,
  access: TenantAccess,
  id: string,
  action: WorkReportTransition,
  reason?: string,
): Promise<void> {
  requirePermission(
    access,
    action === "submit" || action === "withdraw" ? "work_reports.write" : "work_reports.approve",
  );
  if (!isUuid(id)) throw new ValidationError({ form: "Rapportino non trovato" });
  const plan: Record<WorkReportTransition, [string, string]> = {
    submit: ["draft", "submitted"],
    withdraw: ["submitted", "draft"],
    approve: ["submitted", "approved"],
    return: ["submitted", "draft"],
    reopen: ["approved", "draft"],
  };
  const [from, to] = plan[action];
  const why = reason?.trim() ?? "";
  if (action === "return" && !why)
    throw new ValidationError({ reason: "Scrivi cosa va sistemato" });
  if (why.length > 1000) throw new ValidationError({ reason: "Massimo 1000 caratteri" });
  if (action === "submit") {
    const { rows } = await tx.query<{ n: number }>(
      "select count(*)::int as n from public.work_report_labor where tenant_id = $1 and report_id = $2",
      [access.tenantId, id],
    );
    if (!rows[0]?.n)
      throw new ValidationError({ form: "Aggiungi almeno una riga di ore prima di inviare." });
  }
  await guarded(tx, "work_report_status", async () => {
    const { rowCount } = await tx.query(
      `update public.work_reports set status = $4,
              returned_reason = case when $5 = '' then returned_reason else $5 end
        where tenant_id = $1 and id = $2 and status = $3 and deleted_at is null`,
      [access.tenantId, id, from, to, action === "return" ? why : ""],
    );
    if (rowCount === 0) {
      throw new ValidationError({
        form: "Lo stato del rapportino è cambiato. Ricarica la pagina.",
      });
    }
  });
}

export async function deleteWorkReport(
  tx: UserTx,
  access: TenantAccess,
  id: string,
): Promise<void> {
  requirePermission(access, "work_reports.delete");
  if (!isUuid(id)) return;
  await guarded(tx, "delete_work_report", async () => {
    await tx.query(
      `update public.work_reports set deleted_at = now()
        where tenant_id = $1 and id = $2 and deleted_at is null and status <> 'invoiced'`,
      [access.tenantId, id],
    );
  });
}

// --- Opzioni e riepilogo -------------------------------------------------------

export interface WorkReportOptions {
  projects: {
    id: string;
    code: string;
    name: string;
    customerName: string;
    sites: { id: string; name: string }[];
  }[];
  employees: { id: string; name: string; mine: boolean }[];
}

/** Commesse aperte con i loro cantieri e personale attivo (la propria scheda per prima). */
export async function loadWorkReportOptions(
  tx: UserTx,
  access: TenantAccess,
): Promise<WorkReportOptions> {
  requirePermission(access, "work_reports.write");
  const { rows: projects } = await tx.query<WorkReportOptions["projects"][number]>(
    `select p.id, p.code, p.name, c.display_name as "customerName",
            coalesce((select json_agg(json_build_object('id', s.id, 'name', s.name) order by s.created_at)
                        from public.project_sites s
                       where s.tenant_id = p.tenant_id and s.project_id = p.id and s.deleted_at is null
                         and s.status <> 'closed'), '[]'::json) as sites
       from public.projects p
       join public.customers c on c.tenant_id = p.tenant_id and c.id = p.customer_id
      where p.tenant_id = $1 and p.deleted_at is null and p.status in ('quote', 'active', 'suspended')
      order by lower(p.code) desc limit 500`,
    [access.tenantId],
  );
  // Il personale serve per le righe di ore: lo legge anche chi non vede l'anagrafica
  // completa (solo nome, attivi).
  const { rows: employees } = await tx.query<{ id: string; name: string; mine: boolean }>(
    `select id, concat_ws(' ', first_name, last_name) as name, coalesce(user_id = auth.uid(), false) as mine
       from public.employees
      where tenant_id = $1 and deleted_at is null and is_active
      order by (user_id = auth.uid()) desc nulls last, lower(last_name), lower(first_name) limit 500`,
    [access.tenantId],
  );
  return { projects, employees };
}

export interface ProjectWorkSummary {
  reports: { draft: number; submitted: number; approved: number; invoiced: number };
  /** ore dei rapportini approvati (e fatturati) */
  hoursApproved: number;
  /** ore ancora in bozza o inviate */
  hoursPending: number;
  /** solo con projects.finance */
  costs?: { laborCents: number; itemsCents: number; missingRates: number; missingPrices: number };
}

/** Ore e costi della commessa dai rapportini: contano solo approvati e fatturati. */
export async function getProjectWorkSummary(
  tx: UserTx,
  access: TenantAccess,
  projectId: string,
): Promise<ProjectWorkSummary | null> {
  if (!access.permissions.has("work_reports.read") || !isUuid(projectId)) return null;
  const { rows } = await tx.query<{ status: WorkReportStatus; n: number; hours: number }>(
    `select w.status, count(distinct w.id)::int as n, coalesce(sum(l.hours), 0)::float8 as hours
       from public.work_reports w
       left join public.work_report_labor l on l.tenant_id = w.tenant_id and l.report_id = w.id
      where w.tenant_id = $1 and w.project_id = $2 and w.deleted_at is null
      group by w.status`,
    [access.tenantId, projectId],
  );
  const out: ProjectWorkSummary = {
    reports: { draft: 0, submitted: 0, approved: 0, invoiced: 0 },
    hoursApproved: 0,
    hoursPending: 0,
  };
  for (const r of rows) {
    out.reports[r.status] = r.n;
    if (r.status === "approved" || r.status === "invoiced") out.hoursApproved += r.hours;
    else out.hoursPending += r.hours;
  }
  if (access.permissions.has("projects.finance")) {
    const { rows: c } = await tx.query<{
      labor: number;
      items: number;
      missing_rates: number;
      missing_prices: number;
    }>(
      `with lab as (
         select l.employee_id, l.hours,
                (select r.hourly_cost_cents from public.employee_cost_rates r
                  where r.tenant_id = l.tenant_id and r.employee_id = l.employee_id
                    and r.valid_from <= w.report_date order by r.valid_from desc limit 1) as rate
           from public.work_report_labor l
           join public.work_reports w on w.tenant_id = l.tenant_id and w.id = l.report_id
          where w.tenant_id = $1 and w.project_id = $2 and w.deleted_at is null
            and w.status in ('approved', 'invoiced')
       ), itm as (
         select i.quantity, ic.unit_cost_cents as price
           from public.work_report_items i
           join public.work_reports w on w.tenant_id = i.tenant_id and w.id = i.report_id
           left join public.work_report_item_costs ic on ic.tenant_id = i.tenant_id and ic.item_id = i.id
          where w.tenant_id = $1 and w.project_id = $2 and w.deleted_at is null
            and w.status in ('approved', 'invoiced')
       )
       select coalesce((select round(sum(hours * rate)) from lab), 0)::float8 as labor,
              coalesce((select round(sum(quantity * price)) from itm), 0)::float8 as items,
              (select count(distinct employee_id) from lab where rate is null)::int as missing_rates,
              (select count(*) from itm where price is null)::int as missing_prices`,
      [access.tenantId, projectId],
    );
    const x = c[0]!;
    out.costs = {
      laborCents: x.labor,
      itemsCents: x.items,
      missingRates: x.missing_rates,
      missingPrices: x.missing_prices,
    };
  }
  return out;
}

// --- Costo orario per persona ----------------------------------------------------

export interface EmployeeCostRate {
  id: string;
  hourlyCostCents: number;
  validFrom: string;
  notes: string | null;
}

export async function listEmployeeCostRates(
  tx: UserTx,
  access: TenantAccess,
  employeeId: string,
): Promise<EmployeeCostRate[]> {
  requirePermission(access, "projects.finance");
  if (!isUuid(employeeId)) return [];
  const { rows } = await tx.query<EmployeeCostRate>(
    `select id, hourly_cost_cents::float8 as "hourlyCostCents", to_char(valid_from, 'YYYY-MM-DD') as "validFrom", notes
       from public.employee_cost_rates where tenant_id = $1 and employee_id = $2
      order by valid_from desc`,
    [access.tenantId, employeeId],
  );
  return rows;
}

const rateInput = z.object({
  amount: z.string().trim().min(1, "Indica il costo orario"),
  validFrom: z.string().regex(isoDate, "Data non valida"),
  notes: optional(z.string().trim().max(500)),
});

export async function addEmployeeCostRate(
  tx: UserTx,
  access: TenantAccess,
  employeeId: string,
  input: z.input<typeof rateInput>,
): Promise<void> {
  requirePermission(access, "projects.finance");
  if (!isUuid(employeeId)) throw new ValidationError({ form: "Persona non trovata" });
  const d = parseInput(rateInput, input);
  const cents = parseEuroToCents(d.amount);
  if (cents === null || cents > 100_000_000)
    throw new ValidationError({ amount: "Importo non valido (es. 28,50)" });
  await tx.query("savepoint add_rate");
  try {
    await tx.query(
      `insert into public.employee_cost_rates (tenant_id, employee_id, hourly_cost_cents, valid_from, notes)
       values ($1, $2, $3, $4::date, $5)
       on conflict (tenant_id, employee_id, valid_from)
       do update set hourly_cost_cents = excluded.hourly_cost_cents, notes = excluded.notes`,
      [access.tenantId, employeeId, cents, d.validFrom, d.notes ?? null],
    );
    await tx.query("release savepoint add_rate");
  } catch (error) {
    await tx.query("rollback to savepoint add_rate");
    if (pgCode(error) === "23503") throw new ValidationError({ form: "Persona non trovata" });
    if (pgCode(error) === "42501")
      throw new AuthError("FORBIDDEN", "permesso mancante", { cause: error });
    throw error;
  }
}

export async function removeEmployeeCostRate(
  tx: UserTx,
  access: TenantAccess,
  rateId: string,
): Promise<void> {
  requirePermission(access, "projects.finance");
  if (!isUuid(rateId)) return;
  await tx.query("delete from public.employee_cost_rates where tenant_id = $1 and id = $2", [
    access.tenantId,
    rateId,
  ]);
}

// --- Foto ------------------------------------------------------------------------

export const MAX_REPORT_PHOTOS = 20;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_BYTES = 10 * 1024 * 1024;

export async function startWorkReportPhoto(
  tx: UserTx,
  access: TenantAccess,
  storage: FileStorage,
  reportId: string,
  input: { name: string; size: number; type: string },
): Promise<{ fileId: string; uploadUrl: string }> {
  requirePermission(access, "work_reports.write");
  if (!isUuid(reportId)) throw new ValidationError({ form: "Rapportino non trovato" });
  if (!(input.size >= 1) || input.size > MAX_BYTES)
    throw new ValidationError({ photos: "La foto supera i 10 MB" });
  if (!(PHOTO_TYPES as readonly string[]).includes(input.type))
    throw new ValidationError({ photos: "Sono ammesse solo foto JPEG, PNG o WebP" });
  const { rows } = await tx.query<{ n: number }>(
    `select count(*)::int as n from public.work_report_files
      where tenant_id = $1 and report_id = $2 and deleted_at is null and status <> 'rejected'`,
    [access.tenantId, reportId],
  );
  if ((rows[0]?.n ?? 0) >= MAX_REPORT_PHOTOS)
    throw new ValidationError({ photos: `Al massimo ${MAX_REPORT_PHOTOS} foto per rapportino` });
  const safeName = input.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "foto.jpg";
  return guarded(tx, "start_report_photo", async () => {
    const ins = await tx.query<{ id: string; storage_key: string }>(
      `insert into public.work_report_files (tenant_id, report_id, original_name)
       values ($1, $2, $3) returning id, storage_key`,
      [access.tenantId, reportId, safeName],
    );
    return {
      fileId: ins.rows[0]!.id,
      uploadUrl: await storage.createUploadUrl(ins.rows[0]!.storage_key),
    };
  });
}

export type ReportPhotoOutcome =
  { ok: true; photo: WorkReportPhoto } | { ok: false; reason: string };

export async function finishWorkReportPhoto(
  tx: UserTx,
  access: TenantAccess,
  storage: FileStorage,
  fileId: string,
): Promise<ReportPhotoOutcome> {
  requirePermission(access, "work_reports.write");
  if (!isUuid(fileId)) throw new ValidationError({ photos: "Foto non trovata" });
  const { rows } = await tx.query<{ storage_key: string; original_name: string; status: string }>(
    `select storage_key, original_name, status from public.work_report_files
      where tenant_id = $1 and id = $2 and created_by = auth.uid() and deleted_at is null
      for update`,
    [access.tenantId, fileId],
  );
  const v = rows[0];
  if (!v) throw new ValidationError({ photos: "Foto non trovata" });
  const done = async (): Promise<ReportPhotoOutcome> => ({
    ok: true,
    photo: {
      id: fileId,
      name: v.original_name,
      url: await storage.createDownloadUrl(v.storage_key, { expiresIn: 3600 }),
    },
  });
  if (v.status === "ready") return done();
  if (v.status === "rejected") return { ok: false, reason: "Foto già rifiutata" };
  const reject = async (reason: string): Promise<ReportPhotoOutcome> => {
    await storage.remove(v.storage_key).catch(() => undefined);
    await tx.query(
      "update public.work_report_files set status = 'rejected', reject_reason = $3 where tenant_id = $1 and id = $2",
      [access.tenantId, fileId, reason],
    );
    return { ok: false, reason };
  };
  const info = await storage.info(v.storage_key);
  if (!info) return reject("La foto non è arrivata: riprova.");
  if (info.size < 1 || info.size > MAX_BYTES) return reject("La foto è vuota o supera i 10 MB.");
  const head = await storage.readHead(v.storage_key, Math.min(64, info.size));
  const mime = detectFileType(v.original_name, head);
  if (!mime || !(PHOTO_TYPES as readonly string[]).includes(mime)) {
    return reject("Il file non è una foto JPEG, PNG o WebP.");
  }
  await tx.query(
    `update public.work_report_files set status = 'ready', mime_type = $3, size_bytes = $4
      where tenant_id = $1 and id = $2`,
    [access.tenantId, fileId, mime, info.size],
  );
  return done();
}

export async function removeWorkReportPhoto(
  tx: UserTx,
  access: TenantAccess,
  fileId: string,
): Promise<void> {
  requirePermission(access, "work_reports.write");
  if (!isUuid(fileId)) return;
  await guarded(tx, "remove_report_photo", async () => {
    await tx.query(
      "update public.work_report_files set deleted_at = now() where tenant_id = $1 and id = $2 and deleted_at is null",
      [access.tenantId, fileId],
    );
  });
}

export interface WorkReportPhoto {
  id: string;
  name: string;
  url: string;
}

export async function listWorkReportPhotos(
  tx: UserTx,
  access: TenantAccess,
  storage: FileStorage,
  reportId: string,
): Promise<WorkReportPhoto[]> {
  requirePermission(access, "work_reports.read");
  if (!isUuid(reportId)) return [];
  const { rows } = await tx.query<{ id: string; storage_key: string; original_name: string }>(
    `select id, storage_key, original_name from public.work_report_files
      where tenant_id = $1 and report_id = $2 and status = 'ready' and deleted_at is null
      order by created_at`,
    [access.tenantId, reportId],
  );
  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      name: r.original_name,
      url: await storage.createDownloadUrl(r.storage_key, { expiresIn: 3600 }),
    })),
  );
}
