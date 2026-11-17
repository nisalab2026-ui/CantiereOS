import { z } from "zod";
import { hasPermission, requirePermission, type TenantAccess } from "../auth/access";
import { AuthError, pgCode } from "../auth/errors";
import type { UserTx } from "../db/transaction";
import { likePattern } from "../workspace/search";
import { optional, parseInput, ValidationError } from "../validation";
import type { Page } from "../directory/lists";

/**
 * Scadenziario unico: certificazioni, manutenzioni, controlli periodici,
 * documenti, pagamenti, contratti. Lo stato "in ritardo" è calcolato dalla
 * data, non salvato: non può mai essere disallineato.
 */
export const DEADLINE_KINDS = [
  "certification",
  "maintenance",
  "inspection",
  "document",
  "payment",
  "contract",
  "other",
] as const;
export type DeadlineKind = (typeof DEADLINE_KINDS)[number];

/** Stato mostrato all'utente: aperta si divide in in ritardo / in scadenza / programmata. */
export type DeadlineState = "overdue" | "due_soon" | "scheduled" | "done" | "cancelled";

export const DEADLINE_STATE_LABELS: Record<DeadlineState, string> = {
  overdue: "In ritardo",
  due_soon: "In scadenza",
  scheduled: "Programmata",
  done: "Completata",
  cancelled: "Annullata",
};

export type SubjectType = "customer" | "supplier" | "employee" | "team";

export interface DeadlineSubject {
  type: SubjectType;
  id: string;
  name: string;
}

export interface DeadlineRow {
  id: string;
  kind: DeadlineKind;
  title: string;
  referenceCode: string | null;
  dueDate: string; // YYYY-MM-DD
  daysLeft: number;
  state: DeadlineState;
  subject: DeadlineSubject | null;
  responsibleId: string | null;
  responsibleName: string | null;
  recurrenceMonths: number | null;
}

export interface DeadlineDetail extends DeadlineRow {
  description: string | null;
  remindDaysBefore: number;
  completedAt: Date | null;
  completedByName: string | null;
  completionNotes: string | null;
  previousId: string | null;
  nextId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const SELECT = `
  x.id, x.kind, x.title, x.reference_code as "referenceCode",
  to_char(x.due_date, 'YYYY-MM-DD') as "dueDate",
  (x.due_date - current_date)::int as "daysLeft",
  case when x.status = 'done' then 'done'
       when x.status = 'cancelled' then 'cancelled'
       when x.due_date < current_date then 'overdue'
       when x.due_date <= current_date + x.remind_days_before then 'due_soon'
       else 'scheduled' end as state,
  case when x.customer_id is not null then json_build_object('type','customer','id',x.customer_id,'name',c.display_name)
       when x.supplier_id is not null then json_build_object('type','supplier','id',x.supplier_id,'name',s.display_name)
       when x.employee_id is not null then json_build_object('type','employee','id',x.employee_id,'name',concat_ws(' ', e.first_name, e.last_name))
       when x.team_id is not null then json_build_object('type','team','id',x.team_id,'name',t.name)
  end as subject,
  x.responsible_user_id as "responsibleId",
  coalesce(ru.full_name, ru.email) as "responsibleName",
  x.recurrence_months as "recurrenceMonths"`;

const FROM = `
  public.deadlines x
  left join public.customers c on c.tenant_id = x.tenant_id and c.id = x.customer_id
  left join public.suppliers s on s.tenant_id = x.tenant_id and s.id = x.supplier_id
  left join public.employees e on e.tenant_id = x.tenant_id and e.id = x.employee_id
  left join public.teams t on t.tenant_id = x.tenant_id and t.id = x.team_id
  left join public.users ru on ru.id = x.responsible_user_id`;

export interface DeadlineQuery {
  q?: string;
  kind?: string;
  /** overdue | due_soon | open | done | cancelled | all (default: open) */
  state?: string;
  responsible?: "me" | "none";
  customerId?: string;
  supplierId?: string;
  employeeId?: string;
  teamId?: string;
  from?: string;
  to?: string;
  sort?: string;
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export const DEADLINE_SORTS = ["due", "title", "kind", "created"] as const;
const SORTS: Record<string, string> = {
  due: "x.due_date",
  title: "lower(x.title)",
  kind: "x.kind",
  created: "x.created_at",
};
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const isUuid = (v: unknown): v is string => z.uuid().safeParse(v).success;

export async function listDeadlines(
  tx: UserTx,
  access: TenantAccess,
  q: DeadlineQuery,
): Promise<Page<DeadlineRow>> {
  requirePermission(access, "deadlines.read");
  const pageSize = Math.min(Math.max(q.pageSize ?? 25, 1), 100);
  const page = Math.min(Math.max(q.page ?? 1, 1), 10_000);
  const params: unknown[] = [access.tenantId];
  const where = ["x.tenant_id = $1", "x.deleted_at is null"];
  const state = q.state ?? "open";
  if (state === "open") where.push("x.status = 'open'");
  if (state === "overdue") where.push("x.status = 'open' and x.due_date < current_date");
  if (state === "due_soon")
    where.push(
      "x.status = 'open' and x.due_date >= current_date and x.due_date <= current_date + x.remind_days_before",
    );
  if (state === "done") where.push("x.status = 'done'");
  if (state === "cancelled") where.push("x.status = 'cancelled'");
  if (q.kind && (DEADLINE_KINDS as readonly string[]).includes(q.kind)) {
    params.push(q.kind);
    where.push(`x.kind = $${params.length}`);
  }
  if (q.responsible === "me") where.push("x.responsible_user_id = auth.uid()");
  if (q.responsible === "none") where.push("x.responsible_user_id is null");
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
  if (q.from && isoDate.safeParse(q.from).success) {
    params.push(q.from);
    where.push(`x.due_date >= $${params.length}::date`);
  }
  if (q.to && isoDate.safeParse(q.to).success) {
    params.push(q.to);
    where.push(`x.due_date <= $${params.length}::date`);
  }
  const term = (q.q ?? "").trim().slice(0, 100);
  if (term) {
    params.push(likePattern(term.toLowerCase()));
    where.push(
      `lower(concat_ws(' ', x.title, x.reference_code, c.display_name, s.display_name, e.first_name, e.last_name, t.name)) like $${params.length}`,
    );
  }
  const sort = SORTS[q.sort ?? ""] ?? SORTS.due!;
  const dir = q.dir === "desc" ? "desc" : "asc";
  params.push(pageSize, (page - 1) * pageSize);
  const { rows } = await tx.query<DeadlineRow & { __total: number }>(
    `select ${SELECT}, count(*) over ()::int as "__total"
       from ${FROM}
      where ${where.join(" and ")}
      order by ${sort} ${dir} nulls last, x.id
      limit $${params.length - 1} offset $${params.length}`,
    params,
  );
  return {
    rows: rows.map(({ __total: _, ...r }) => r as DeadlineRow),
    total: rows[0]?.__total ?? 0,
    page,
    pageSize,
  };
}

export async function getDeadline(
  tx: UserTx,
  access: TenantAccess,
  id: string,
): Promise<DeadlineDetail | null> {
  requirePermission(access, "deadlines.read");
  if (!isUuid(id)) return null;
  const { rows } = await tx.query<DeadlineDetail>(
    `select ${SELECT},
            x.description, x.remind_days_before as "remindDaysBefore",
            x.completed_at as "completedAt", coalesce(cu.full_name, cu.email) as "completedByName",
            x.completion_notes as "completionNotes", x.previous_deadline_id as "previousId",
            (select n.id from public.deadlines n where n.tenant_id = x.tenant_id and n.previous_deadline_id = x.id) as "nextId",
            x.created_at as "createdAt", x.updated_at as "updatedAt"
       from ${FROM}
       left join public.users cu on cu.id = x.completed_by
      where x.tenant_id = $1 and x.id = $2 and x.deleted_at is null`,
    [access.tenantId, id],
  );
  return rows[0] ?? null;
}

// --- Scrittura -----------------------------------------------------------------

const subjectTypes = ["customer", "supplier", "employee", "team"] as const;

export const deadlineInput = z
  .object({
    kind: z.enum(DEADLINE_KINDS, "Scegli il tipo"),
    title: z.string().trim().min(1, "Inserisci un titolo").max(200, "Massimo 200 caratteri"),
    description: optional(z.string().trim().max(4000)),
    referenceCode: optional(z.string().trim().max(60)),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Inserisci la data di scadenza"),
    remindDaysBefore: z.coerce
      .number()
      .int("Numero intero")
      .min(0, "Minimo 0")
      .max(365, "Massimo 365")
      .default(30),
    recurrenceMonths: optional(
      z.coerce.number().int().min(1, "Minimo 1 mese").max(120, "Massimo 120 mesi"),
    ),
    subjectType: optional(z.enum(subjectTypes)),
    subjectId: optional(z.uuid("Scegli un elemento valido")),
    responsibleUserId: optional(z.uuid("Scegli un responsabile valido")),
  })
  .refine((d) => !d.subjectType === !d.subjectId, {
    path: ["subjectId"],
    message: "Scegli a chi si riferisce la scadenza",
  });

export type DeadlineInput = z.input<typeof deadlineInput>;

function subjectColumns(d: z.output<typeof deadlineInput>) {
  return {
    customer_id: d.subjectType === "customer" ? d.subjectId! : null,
    supplier_id: d.subjectType === "supplier" ? d.subjectId! : null,
    employee_id: d.subjectType === "employee" ? d.subjectId! : null,
    team_id: d.subjectType === "team" ? d.subjectId! : null,
  };
}

function mapWriteError(error: unknown): never {
  const code = pgCode(error);
  if (code === "23503") {
    const c = String((error as { constraint?: string }).constraint ?? "");
    if (c.includes("responsible"))
      throw new ValidationError({ responsibleUserId: "Responsabile non valido" });
    throw new ValidationError({ subjectId: "Elemento collegato non trovato" });
  }
  if (code === "42501") throw new AuthError("FORBIDDEN", "permesso mancante", { cause: error });
  if (code === "40001") {
    throw new ValidationError({
      form: "La scadenza è stata modificata da un altro utente. Ricarica la pagina.",
    });
  }
  throw error;
}

export async function createDeadline(
  tx: UserTx,
  access: TenantAccess,
  input: DeadlineInput,
): Promise<{ id: string }> {
  requirePermission(access, "deadlines.write");
  const d = parseInput(deadlineInput, input);
  const s = subjectColumns(d);
  await tx.query("savepoint create_deadline");
  try {
    const { rows } = await tx.query<{ id: string }>(
      `insert into public.deadlines
         (tenant_id, kind, title, description, reference_code, due_date, remind_days_before,
          recurrence_months, customer_id, supplier_id, employee_id, team_id, responsible_user_id)
       values ($1, $2, $3, $4, $5, $6::date, $7, $8, $9, $10, $11, $12, $13) returning id`,
      [
        access.tenantId,
        d.kind,
        d.title,
        d.description ?? null,
        d.referenceCode ?? null,
        d.dueDate,
        d.remindDaysBefore,
        d.recurrenceMonths ?? null,
        s.customer_id,
        s.supplier_id,
        s.employee_id,
        s.team_id,
        d.responsibleUserId ?? null,
      ],
    );
    return { id: rows[0]!.id };
  } catch (error) {
    await tx.query("rollback to savepoint create_deadline");
    mapWriteError(error);
  }
}

/**
 * Modifica con controllo di concorrenza: se un altro utente ha salvato nel
 * frattempo (updated_at diverso) la modifica viene rifiutata, non sovrascritta.
 */
export async function updateDeadline(
  tx: UserTx,
  access: TenantAccess,
  id: string,
  input: DeadlineInput,
  expectedUpdatedAt: string,
): Promise<void> {
  requirePermission(access, "deadlines.write");
  if (!isUuid(id)) throw new ValidationError({ form: "Scadenza non trovata" });
  const d = parseInput(deadlineInput, input);
  const s = subjectColumns(d);
  await tx.query("savepoint update_deadline");
  try {
    const { rowCount } = await tx.query(
      `update public.deadlines set
         kind = $3, title = $4, description = $5, reference_code = $6, due_date = $7::date,
         remind_days_before = $8, recurrence_months = $9, customer_id = $10, supplier_id = $11,
         employee_id = $12, team_id = $13, responsible_user_id = $14
       where tenant_id = $1 and id = $2 and deleted_at is null
         and date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $15::timestamptz)`,
      [
        access.tenantId,
        id,
        d.kind,
        d.title,
        d.description ?? null,
        d.referenceCode ?? null,
        d.dueDate,
        d.remindDaysBefore,
        d.recurrenceMonths ?? null,
        s.customer_id,
        s.supplier_id,
        s.employee_id,
        s.team_id,
        d.responsibleUserId ?? null,
        expectedUpdatedAt,
      ],
    );
    if (rowCount === 0) {
      throw new ValidationError({
        form: "La scadenza è stata modificata da un altro utente o non esiste più. Ricarica la pagina.",
      });
    }
  } catch (error) {
    await tx.query("rollback to savepoint update_deadline");
    if (error instanceof ValidationError) throw error;
    mapWriteError(error);
  }
}

const completeInput = z.object({ notes: optional(z.string().trim().max(4000)) });

/**
 * Completa una scadenza. Se è ricorrente crea la successiva (stessi dati,
 * data spostata di N mesi) collegata alla precedente: lo storico resta intero.
 */
export async function completeDeadline(
  tx: UserTx,
  access: TenantAccess,
  id: string,
  input: { notes?: string },
): Promise<{ nextId: string | null }> {
  requirePermission(access, "deadlines.write");
  const d = parseInput(completeInput, input);
  if (!isUuid(id)) throw new ValidationError({ form: "Scadenza non trovata" });
  const { rows } = await tx.query<{ recurrence_months: number | null }>(
    `update public.deadlines set status = 'done', completion_notes = $3
      where tenant_id = $1 and id = $2 and status = 'open' and deleted_at is null
      returning recurrence_months`,
    [access.tenantId, id, d.notes ?? null],
  );
  if (!rows[0])
    throw new ValidationError({ form: "La scadenza non è più aperta. Ricarica la pagina." });
  if (!rows[0].recurrence_months) return { nextId: null };
  const next = await tx.query<{ id: string }>(
    `insert into public.deadlines
       (tenant_id, kind, title, description, reference_code, due_date, remind_days_before,
        recurrence_months, customer_id, supplier_id, employee_id, team_id, responsible_user_id,
        previous_deadline_id)
     select tenant_id, kind, title, description, reference_code,
            (due_date + make_interval(months => recurrence_months))::date, remind_days_before,
            recurrence_months, customer_id, supplier_id, employee_id, team_id,
            case when exists (select 1 from public.memberships m
                               where m.tenant_id = d.tenant_id and m.user_id = d.responsible_user_id
                                 and m.status = 'active') then responsible_user_id end,
            id
       from public.deadlines d
      where tenant_id = $1 and id = $2
     on conflict (tenant_id, previous_deadline_id) where previous_deadline_id is not null do nothing
     returning id`,
    [access.tenantId, id],
  );
  return { nextId: next.rows[0]?.id ?? null };
}

/** Annulla o riapre una scadenza (riapertura solo se non ha già una successiva). */
export async function setDeadlineStatus(
  tx: UserTx,
  access: TenantAccess,
  id: string,
  status: "open" | "cancelled",
): Promise<void> {
  requirePermission(access, "deadlines.write");
  if (!isUuid(id)) throw new ValidationError({ form: "Scadenza non trovata" });
  const { rowCount } = await tx.query(
    `update public.deadlines d set status = $3
      where d.tenant_id = $1 and d.id = $2 and d.deleted_at is null and d.status <> $3
        and ($3 = 'cancelled' or not exists (
              select 1 from public.deadlines n where n.tenant_id = d.tenant_id and n.previous_deadline_id = d.id))`,
    [access.tenantId, id, status],
  );
  if (rowCount === 0) {
    throw new ValidationError({
      form:
        status === "open"
          ? "Non si può riaprire: esiste già la scadenza successiva."
          : "La scadenza è già annullata.",
    });
  }
}

/** Eliminazione logica: la riga resta nello storico. Richiede deadlines.delete (MFA). */
export async function deleteDeadline(tx: UserTx, access: TenantAccess, id: string): Promise<void> {
  requirePermission(access, "deadlines.delete");
  if (!isUuid(id)) return;
  await tx.query(
    "update public.deadlines set deleted_at = now() where tenant_id = $1 and id = $2 and deleted_at is null",
    [access.tenantId, id],
  );
}

// --- Riepilogo per la dashboard e avvisi ---------------------------------------

export interface DeadlineSummary {
  overdue: number;
  dueThisWeek: number;
  dueThisMonth: number;
  withoutResponsible: number;
  mine: number;
  completedLast30: number;
  byKind: { kind: DeadlineKind; open: number; overdue: number }[];
  byMonth: { month: string; count: number }[]; // prossimi 6 mesi, YYYY-MM
  urgent: DeadlineRow[];
}

export async function getDeadlineSummary(
  tx: UserTx,
  access: TenantAccess,
): Promise<DeadlineSummary | null> {
  if (!hasPermission(access, "deadlines.read")) return null;
  const t = access.tenantId;
  const { rows } = await tx.query<Omit<DeadlineSummary, "byKind" | "byMonth" | "urgent">>(
    `select
       count(*) filter (where status = 'open' and due_date < current_date)::int as overdue,
       count(*) filter (where status = 'open' and due_date between current_date and current_date + 7)::int as "dueThisWeek",
       count(*) filter (where status = 'open' and due_date between current_date and current_date + 30)::int as "dueThisMonth",
       count(*) filter (where status = 'open' and responsible_user_id is null)::int as "withoutResponsible",
       count(*) filter (where status = 'open' and responsible_user_id = auth.uid())::int as mine,
       count(*) filter (where status = 'done' and completed_at >= now() - interval '30 days')::int as "completedLast30"
     from public.deadlines where tenant_id = $1 and deleted_at is null`,
    [t],
  );
  const byKind = await tx.query<{ kind: DeadlineKind; open: number; overdue: number }>(
    `select kind, count(*)::int as open, count(*) filter (where due_date < current_date)::int as overdue
       from public.deadlines where tenant_id = $1 and deleted_at is null and status = 'open'
      group by kind order by count(*) desc`,
    [t],
  );
  const byMonth = await tx.query<{ month: string; count: number }>(
    `select to_char(m, 'YYYY-MM') as month,
            (select count(*)::int from public.deadlines d
              where d.tenant_id = $1 and d.deleted_at is null and d.status = 'open'
                and date_trunc('month', d.due_date) = m) as count
       from generate_series(date_trunc('month', current_date), date_trunc('month', current_date) + interval '5 months', interval '1 month') m`,
    [t],
  );
  const urgent = await tx.query<DeadlineRow>(
    `select ${SELECT} from ${FROM}
      where x.tenant_id = $1 and x.deleted_at is null and x.status = 'open'
        and x.due_date <= current_date + x.remind_days_before
      order by x.due_date, x.id limit 8`,
    [t],
  );
  return { ...rows[0]!, byKind: byKind.rows, byMonth: byMonth.rows, urgent: urgent.rows };
}

/**
 * Genera gli avvisi di scadenza per l'azienda attiva. Idempotente: si può
 * chiamare a ogni apertura dell'app; un job pianificato lo farà comunque.
 */
export async function refreshDeadlineNotifications(
  tx: UserTx,
  access: TenantAccess,
): Promise<number> {
  if (!hasPermission(access, "deadlines.read")) return 0;
  const { rows } = await tx.query<{ n: number }>(
    "select app.generate_deadline_notifications($1) as n",
    [access.tenantId],
  );
  return rows[0]?.n ?? 0;
}

// --- Opzioni per i moduli --------------------------------------------------------

export interface Option {
  id: string;
  name: string;
}

/** Membri attivi assegnabili come responsabili (esclusi i clienti esterni). */
export async function listAssignableMembers(tx: UserTx, access: TenantAccess): Promise<Option[]> {
  requirePermission(access, "deadlines.read");
  const { rows } = await tx.query<Option>(
    `select u.id, coalesce(u.full_name, u.email) as name
       from public.memberships m
       join public.users u on u.id = m.user_id
       join public.roles r on r.id = m.role_id
      where m.tenant_id = $1 and m.status = 'active'
        and not (r.tenant_id is null and r.key = 'external_client')
      order by lower(coalesce(u.full_name, u.email))`,
    [access.tenantId],
  );
  return rows;
}

/** Soggetti collegabili a una scadenza, per tipo, secondo i permessi di lettura. */
export async function listSubjectOptions(
  tx: UserTx,
  access: TenantAccess,
): Promise<Record<SubjectType, Option[] | null>> {
  const q = async (perm: string, sql: string) =>
    hasPermission(access, perm) ? (await tx.query<Option>(sql, [access.tenantId])).rows : null;
  return {
    customer: await q(
      "customers.read",
      "select id, display_name as name from public.customers where tenant_id = $1 and deleted_at is null and is_active order by lower(display_name) limit 500",
    ),
    supplier: await q(
      "suppliers.read",
      "select id, display_name as name from public.suppliers where tenant_id = $1 and deleted_at is null and is_active order by lower(display_name) limit 500",
    ),
    employee: await q(
      "employees.read",
      "select id, concat_ws(' ', last_name, first_name) as name from public.employees where tenant_id = $1 and deleted_at is null and is_active order by lower(last_name), lower(first_name) limit 500",
    ),
    team: await q(
      "teams.read",
      "select id, name from public.teams where tenant_id = $1 and deleted_at is null and is_active order by lower(name) limit 500",
    ),
  };
}
