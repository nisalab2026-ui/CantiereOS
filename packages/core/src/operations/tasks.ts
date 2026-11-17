import { z } from "zod";
import { hasPermission, requirePermission, type TenantAccess } from "../auth/access";
import { AuthError, pgCode } from "../auth/errors";
import type { ListOptions, Page } from "../directory/lists";
import type { UserTx } from "../db/transaction";
import { optional, parseInput, ValidationError } from "../validation";
import { likePattern } from "../workspace/search";
import type { DeadlineSubject } from "./deadlines";

/**
 * Attività assegnabili (ADR-011). "In ritardo" è calcolato dalla data. Chi ha solo
 * tasks.read aggiorna soltanto le proprie attività (stato e note): lo garantisce il
 * database; qui lo rispecchiamo per mostrare i comandi giusti.
 */
export const TASK_STATUSES = ["todo", "in_progress", "done", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "Da fare",
  in_progress: "In corso",
  done: "Completata",
  cancelled: "Annullata",
};
export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Bassa",
  normal: "Normale",
  high: "Alta",
  urgent: "Urgente",
};

export interface TaskRow {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  overdue: boolean;
  assigneeId: string | null;
  assigneeName: string | null;
  subject: DeadlineSubject | null;
  updatedAt: Date;
}

export interface TaskDetail extends TaskRow {
  description: string | null;
  completedAt: Date | null;
  completedByName: string | null;
  completionNotes: string | null;
  createdAt: Date;
  createdByName: string | null;
}

const SELECT = `
  x.id, x.title, x.status, x.priority,
  to_char(x.due_date, 'YYYY-MM-DD') as "dueDate",
  (x.status in ('todo','in_progress') and x.due_date < current_date) as overdue,
  x.assignee_user_id as "assigneeId", coalesce(au.full_name, au.email) as "assigneeName",
  case when x.customer_id is not null then json_build_object('type','customer','id',x.customer_id,'name',c.display_name)
       when x.supplier_id is not null then json_build_object('type','supplier','id',x.supplier_id,'name',s.display_name)
       when x.employee_id is not null then json_build_object('type','employee','id',x.employee_id,'name',concat_ws(' ', e.first_name, e.last_name))
       when x.team_id is not null then json_build_object('type','team','id',x.team_id,'name',t.name)
  end as subject,
  x.updated_at as "updatedAt"`;

const FROM = `
  public.tasks x
  left join public.customers c on c.tenant_id = x.tenant_id and c.id = x.customer_id
  left join public.suppliers s on s.tenant_id = x.tenant_id and s.id = x.supplier_id
  left join public.employees e on e.tenant_id = x.tenant_id and e.id = x.employee_id
  left join public.teams t on t.tenant_id = x.tenant_id and t.id = x.team_id
  left join public.users au on au.id = x.assignee_user_id`;

export interface TaskQuery {
  q?: string;
  /** open (default) | overdue | todo | in_progress | done | cancelled | all */
  state?: string;
  priority?: string;
  /** me | none | uuid */
  assignee?: string;
  customerId?: string;
  supplierId?: string;
  employeeId?: string;
  teamId?: string;
  sort?: string;
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export const TASK_SORTS = ["due", "priority", "title", "updated"] as const;
const SORTS: Record<string, string> = {
  due: "x.due_date",
  priority: "array_position(array['urgent','high','normal','low'], x.priority)",
  title: "lower(x.title)",
  updated: "x.updated_at",
};
const isUuid = (v: unknown): v is string => z.uuid().safeParse(v).success;

export async function listTasks(
  tx: UserTx,
  access: TenantAccess,
  q: TaskQuery,
  opts: ListOptions = {},
): Promise<Page<TaskRow>> {
  requirePermission(access, "tasks.read");
  const pageSize = Math.min(Math.max(q.pageSize ?? 25, 1), opts.maxPageSize ?? 100);
  const page = Math.min(Math.max(q.page ?? 1, 1), 10_000);
  const params: unknown[] = [access.tenantId];
  const where = ["x.tenant_id = $1", "x.deleted_at is null"];
  const state = q.state ?? "open";
  if (state === "open") where.push("x.status in ('todo','in_progress')");
  else if (state === "overdue")
    where.push("x.status in ('todo','in_progress') and x.due_date < current_date");
  else if ((TASK_STATUSES as readonly string[]).includes(state)) {
    params.push(state);
    where.push(`x.status = $${params.length}`);
  }
  if (q.priority && (TASK_PRIORITIES as readonly string[]).includes(q.priority)) {
    params.push(q.priority);
    where.push(`x.priority = $${params.length}`);
  }
  if (q.assignee === "me") where.push("x.assignee_user_id = auth.uid()");
  else if (q.assignee === "none") where.push("x.assignee_user_id is null");
  else if (isUuid(q.assignee)) {
    params.push(q.assignee);
    where.push(`x.assignee_user_id = $${params.length}`);
  }
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
      `lower(concat_ws(' ', x.title, x.description, c.display_name, s.display_name, e.first_name, e.last_name, t.name, au.full_name)) like $${params.length}`,
    );
  }
  const sort = SORTS[q.sort ?? ""] ?? SORTS.due!;
  const dir = q.dir === "desc" ? "desc" : "asc";
  params.push(pageSize, (page - 1) * pageSize);
  const { rows } = await tx.query<TaskRow & { __total: number }>(
    `select ${SELECT}, count(*) over ()::int as "__total"
       from ${FROM}
      where ${where.join(" and ")}
      order by ${sort} ${dir} nulls last, x.created_at desc, x.id
      limit $${params.length - 1} offset $${params.length}`,
    params,
  );
  return {
    rows: rows.map(({ __total: _, ...r }) => r as TaskRow),
    total: rows[0]?.__total ?? 0,
    page,
    pageSize,
  };
}

export async function getTask(
  tx: UserTx,
  access: TenantAccess,
  id: string,
): Promise<TaskDetail | null> {
  requirePermission(access, "tasks.read");
  if (!isUuid(id)) return null;
  const { rows } = await tx.query<TaskDetail>(
    `select ${SELECT}, x.description,
            x.completed_at as "completedAt", coalesce(cu.full_name, cu.email) as "completedByName",
            x.completion_notes as "completionNotes", x.created_at as "createdAt",
            coalesce(cb.full_name, cb.email) as "createdByName"
       from ${FROM}
       left join public.users cu on cu.id = x.completed_by
       left join public.users cb on cb.id = x.created_by
      where x.tenant_id = $1 and x.id = $2 and x.deleted_at is null`,
    [access.tenantId, id],
  );
  return rows[0] ?? null;
}

/** Può aggiornare lo stato: chi ha tasks.write, oppure l'assegnatario. */
export function canUpdateTaskStatus(
  access: TenantAccess,
  task: { assigneeId: string | null },
  userId: string,
): boolean {
  return hasPermission(access, "tasks.write") || task.assigneeId === userId;
}

// --- Scrittura -----------------------------------------------------------------

const subjectTypes = ["customer", "supplier", "employee", "team"] as const;

export const taskInput = z
  .object({
    title: z.string().trim().min(1, "Inserisci un titolo").max(200, "Massimo 200 caratteri"),
    description: optional(z.string().trim().max(4000, "Massimo 4000 caratteri")),
    priority: z.enum(TASK_PRIORITIES, "Scegli la priorità").default("normal"),
    dueDate: optional(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida")),
    assigneeUserId: optional(z.uuid("Scegli un assegnatario valido")),
    subjectType: optional(z.enum(subjectTypes)),
    subjectId: optional(z.uuid("Scegli un elemento valido")),
  })
  .refine((d) => !d.subjectType === !d.subjectId, {
    path: ["subjectId"],
    message: "Scegli a chi si riferisce l'attività",
  });
export type TaskInput = z.input<typeof taskInput>;

function subjectColumns(d: z.output<typeof taskInput>) {
  return [
    d.subjectType === "customer" ? d.subjectId! : null,
    d.subjectType === "supplier" ? d.subjectId! : null,
    d.subjectType === "employee" ? d.subjectId! : null,
    d.subjectType === "team" ? d.subjectId! : null,
  ];
}

function mapWriteError(error: unknown): never {
  const code = pgCode(error);
  if (code === "23503") {
    const c = String((error as { constraint?: string }).constraint ?? "");
    if (c.includes("assignee"))
      throw new ValidationError({ assigneeUserId: "Assegnatario non valido" });
    throw new ValidationError({ subjectId: "Elemento collegato non trovato" });
  }
  if (code === "42501") throw new AuthError("FORBIDDEN", "permesso mancante", { cause: error });
  throw error;
}

export async function createTask(
  tx: UserTx,
  access: TenantAccess,
  input: TaskInput,
): Promise<{ id: string }> {
  requirePermission(access, "tasks.write");
  const d = parseInput(taskInput, input);
  await tx.query("savepoint create_task");
  try {
    const { rows } = await tx.query<{ id: string }>(
      `insert into public.tasks
         (tenant_id, title, description, priority, due_date, assignee_user_id,
          customer_id, supplier_id, employee_id, team_id)
       values ($1, $2, $3, $4, $5::date, $6, $7, $8, $9, $10) returning id`,
      [
        access.tenantId,
        d.title,
        d.description ?? null,
        d.priority,
        d.dueDate ?? null,
        d.assigneeUserId ?? null,
        ...subjectColumns(d),
      ],
    );
    return { id: rows[0]!.id };
  } catch (error) {
    await tx.query("rollback to savepoint create_task");
    mapWriteError(error);
  }
}

/** Modifica completa con controllo di concorrenza (updated_at). Richiede tasks.write. */
export async function updateTask(
  tx: UserTx,
  access: TenantAccess,
  id: string,
  input: TaskInput,
  expectedUpdatedAt: string,
): Promise<void> {
  requirePermission(access, "tasks.write");
  if (!isUuid(id)) throw new ValidationError({ form: "Attività non trovata" });
  const d = parseInput(taskInput, input);
  await tx.query("savepoint update_task");
  try {
    const { rowCount } = await tx.query(
      `update public.tasks set
         title = $3, description = $4, priority = $5, due_date = $6::date, assignee_user_id = $7,
         customer_id = $8, supplier_id = $9, employee_id = $10, team_id = $11
       where tenant_id = $1 and id = $2 and deleted_at is null
         and date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $12::timestamptz)`,
      [
        access.tenantId,
        id,
        d.title,
        d.description ?? null,
        d.priority,
        d.dueDate ?? null,
        d.assigneeUserId ?? null,
        ...subjectColumns(d),
        expectedUpdatedAt,
      ],
    );
    if (rowCount === 0) {
      throw new ValidationError({
        form: "L'attività è stata modificata da un altro utente o non esiste più. Ricarica la pagina.",
      });
    }
  } catch (error) {
    await tx.query("rollback to savepoint update_task");
    if (error instanceof ValidationError) throw error;
    mapWriteError(error);
  }
}

const statusInput = z.object({
  status: z.enum(TASK_STATUSES, "Stato non valido"),
  notes: optional(z.string().trim().max(4000, "Massimo 4000 caratteri")),
});

/** Cambia lo stato (anche l'assegnatario senza tasks.write: lo verifica il database). */
export async function setTaskStatus(
  tx: UserTx,
  access: TenantAccess,
  id: string,
  input: { status: string; notes?: string | undefined },
): Promise<void> {
  requirePermission(access, "tasks.read");
  if (!isUuid(id)) throw new ValidationError({ form: "Attività non trovata" });
  const d = parseInput(statusInput, input);
  await tx.query("savepoint task_status");
  try {
    const { rowCount } = await tx.query(
      `update public.tasks set status = $3,
              completion_notes = case when $3 = 'done' then $4 else completion_notes end
        where tenant_id = $1 and id = $2 and deleted_at is null and status <> $3`,
      [access.tenantId, id, d.status, d.notes ?? null],
    );
    if (rowCount === 0) {
      throw new ValidationError({
        form: "Non puoi aggiornare questa attività, oppure è già in questo stato.",
      });
    }
  } catch (error) {
    await tx.query("rollback to savepoint task_status");
    if (error instanceof ValidationError) throw error;
    mapWriteError(error);
  }
}

/** Eliminazione logica (tasks.delete, MFA): la cronologia resta. */
export async function deleteTask(tx: UserTx, access: TenantAccess, id: string): Promise<void> {
  requirePermission(access, "tasks.delete");
  if (!isUuid(id)) return;
  await tx.query(
    "update public.tasks set deleted_at = now() where tenant_id = $1 and id = $2 and deleted_at is null",
    [access.tenantId, id],
  );
}

export interface TaskSummary {
  open: number;
  overdue: number;
  mine: number;
  dueThisWeek: number;
}

export async function getTaskSummary(tx: UserTx, access: TenantAccess): Promise<TaskSummary> {
  requirePermission(access, "tasks.read");
  const { rows } = await tx.query<TaskSummary>(
    `select count(*)::int as open,
            count(*) filter (where due_date < current_date)::int as overdue,
            count(*) filter (where assignee_user_id = auth.uid())::int as mine,
            count(*) filter (where due_date between current_date and current_date + 7)::int as "dueThisWeek"
       from public.tasks
      where tenant_id = $1 and deleted_at is null and status in ('todo','in_progress')`,
    [access.tenantId],
  );
  return rows[0]!;
}

// --- Calendario ------------------------------------------------------------------

export interface CalendarItem {
  kind: "deadline" | "task" | "payment" | "follow_up";
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  /** deadline: tipo di scadenza; task: priorità; payment: direzione; follow_up: canale */
  category: string;
  done: boolean;
  overdue: boolean;
  ownerName: string | null;
  href: string;
}

/**
 * Scadenze e attività con data nell'intervallo (massimo 62 giorni), ciascuna
 * letta con il proprio permesso: chi non vede le scadenze vede solo le attività.
 */
export async function listCalendar(
  tx: UserTx,
  access: TenantAccess,
  range: { from: string; to: string; mine?: boolean },
): Promise<CalendarItem[]> {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!iso.test(range.from) || !iso.test(range.to))
    throw new ValidationError({ form: "Date non valide" });
  const days = (Date.parse(range.to) - Date.parse(range.from)) / 86_400_000;
  if (!(days >= 0 && days <= 62)) throw new ValidationError({ form: "Intervallo non valido" });
  const canDeadlines = hasPermission(access, "deadlines.read");
  const canTasks = hasPermission(access, "tasks.read");
  const canPayments = hasPermission(access, "payments.read");
  const canComms = hasPermission(access, "communications.read");
  if (!canDeadlines && !canTasks && !canPayments && !canComms) {
    requirePermission(access, "tasks.read");
  }
  const parts: string[] = [];
  if (canDeadlines) {
    parts.push(`
      select 'deadline' as kind, d.id, to_char(d.due_date, 'YYYY-MM-DD') as date, d.title,
             d.kind as category, d.status <> 'open' as done,
             (d.status = 'open' and d.due_date < current_date) as overdue,
             coalesce(u.full_name, u.email) as "ownerName", '/app/scadenze/' || d.id as href
        from public.deadlines d left join public.users u on u.id = d.responsible_user_id
       where d.tenant_id = $1 and d.deleted_at is null and d.status <> 'cancelled'
         and d.due_date between $2::date and $3::date
         and (not $4 or d.responsible_user_id = auth.uid())`);
  }
  if (canTasks) {
    parts.push(`
      select 'task', t.id, to_char(t.due_date, 'YYYY-MM-DD'), t.title,
             t.priority, t.status = 'done',
             (t.status in ('todo','in_progress') and t.due_date < current_date),
             coalesce(u.full_name, u.email), '/app/attivita/' || t.id
        from public.tasks t left join public.users u on u.id = t.assignee_user_id
       where t.tenant_id = $1 and t.deleted_at is null and t.status <> 'cancelled'
         and t.due_date between $2::date and $3::date
         and (not $4 or t.assignee_user_id = auth.uid())`);
  }
  if (canPayments) {
    // nessun responsabile: con «solo mie» i pagamenti non compaiono
    parts.push(`
      select 'payment', p.id, to_char(p.due_date, 'YYYY-MM-DD'), p.description,
             p.direction, p.status = 'paid',
             (p.status = 'open' and p.due_date < current_date),
             null::text, '/app/pagamenti/' || p.id
        from public.payments p
       where p.tenant_id = $1 and p.deleted_at is null and p.status <> 'cancelled'
         and p.due_date between $2::date and $3::date and not $4`);
  }
  if (canComms) {
    parts.push(`
      select 'follow_up', m.id, to_char(m.follow_up_date, 'YYYY-MM-DD'), 'Richiamare: ' || m.subject,
             m.channel, m.follow_up_done,
             (not m.follow_up_done and m.follow_up_date < current_date),
             coalesce(u.full_name, u.email), '/app/comunicazioni/' || m.id
        from public.communications m left join public.users u on u.id = m.created_by
       where m.tenant_id = $1 and m.deleted_at is null and m.follow_up_date is not null
         and m.follow_up_date between $2::date and $3::date
         and (not $4 or m.created_by = auth.uid())`);
  }
  const { rows } = await tx.query<CalendarItem>(
    `${parts.join(" union all ")} order by 3, 6, 4 limit 1000`,
    [access.tenantId, range.from, range.to, range.mine === true],
  );
  return rows;
}
